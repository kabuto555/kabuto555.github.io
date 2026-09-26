// Merit Badges tracker — lifetime stats + one-time flags → badges earned (forever, unlike
// the seasonal Camp Pass). Every Camp Pass stat arrives through campPass.onStat (so gameplay
// only calls record() once, on the pass); our own stats (metres walked, toy plays…) come
// in via add(), one-time things via flag(). The toast listens with onEarned(); the sash
// screen re-renders with subscribe(). Content lives in content.ts.

import { storageGet, storageSet } from '../storage';
import { campPass } from '../camp-pass/camp-pass';
import { playerTroop, playerLeads, subscribeTroop } from '../troops';
import {
  BADGES, LOCATIONS, type AchStatId, type Badge, type Criteria, type FlagId, type LocationId, type OwnStatId,
} from './content';

const KEY = 'chonk.badges.v1';
/** High-frequency stats (metres walked) save at most this often. */
const SAVE_DELAY_MS = 1500;

interface State {
  stats: Record<string, number>;
  /** Flag → when it happened (ms). */
  flags: Record<string, number>;
  /** Badge id → when it was earned (ms). */
  earned: Record<string, number>;
  /** Badges earned after this (ms) are "new" (the HUD count) until the sash is opened. */
  viewedAt: number;
}

const fresh = (): State => ({ stats: {}, flags: {}, earned: {}, viewedAt: 0 });

export interface BadgeView {
  badge: Badge;
  earnedAt: number | null;
  /** Stat badges: progress toward the target (null for flag badges). */
  value: number | null;
  target: number | null;
  isNew: boolean;
}

class Achievements {
  private s: State;
  private listeners = new Set<() => void>();
  private earnedListeners = new Set<(b: Badge) => void>();
  private saveTimer = 0;

  constructor() {
    const saved = storageGet<Partial<State>>(KEY, {});
    this.s = { ...fresh(), ...saved };
    // Lifetime totals start from this season's pass stats (badges arrived after the pass did).
    for (const b of BADGES) {
      if (b.criteria.kind !== 'stat') continue;
      const id = b.criteria.stat;
      if (id in this.s.stats || isDerived(id)) continue;
      const passed = campPass.stat(id as Parameters<typeof campPass.stat>[0]);
      if (passed > 0) this.s.stats[id] = passed;
    }
    campPass.onStat((stat, n) => this.add(stat, n));
    // The pass itself: stamps + Premium.
    campPass.subscribe(() => {
      if (campPass.hasPremium) this.flag('premium_pass');
      else this.evaluate();
    });
    const troopCheck = () => {
      const t = playerTroop();
      if (t) this.flag('troop_join');
      if (t && playerLeads(t.id)) this.flag('troop_found');
    };
    subscribeTroop(troopCheck);
    troopCheck();
    if (campPass.hasPremium) this.flag('premium_pass');
    window.addEventListener('pagehide', () => this.flush());
    this.evaluate(true);
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  stat(id: AchStatId): number {
    if (id === 'discovered') return LOCATIONS.filter((l) => this.s.flags[`discover:${l.id}`]).length;
    if (id === 'badges') return Object.keys(this.s.earned).length;
    if (id === 'pass_stamps') return campPass.stamps;
    return this.s.stats[id] ?? 0;
  }

  /** Count `n` more (fractions fine — metres walked add up every frame). */
  add(id: AchStatId | OwnStatId, n = 1): void {
    if (n <= 0 || isDerived(id)) return;
    const before = this.s.stats[id] ?? 0;
    this.s.stats[id] = before + n;
    // Only whole-number crossings can finish a badge (and are worth telling the screen about).
    if (Math.floor(before) !== Math.floor(before + n)) this.evaluate();
    this.scheduleSave();
  }

  /** A one-time thing happened (repeats are ignored). */
  flag(f: FlagId): void {
    if (this.s.flags[f]) return;
    this.s.flags[f] = Date.now();
    this.evaluate(true);
  }

  discover(loc: LocationId): void { this.flag(`discover:${loc}`); }
  hasDiscovered(loc: LocationId): boolean { return !!this.s.flags[`discover:${loc}`]; }

  // ── Badges ────────────────────────────────────────────────────────────────

  isEarned(id: string): boolean { return id in this.s.earned; }
  get earnedCount(): number { return Object.keys(this.s.earned).length; }
  get total(): number { return BADGES.length; }
  get points(): number { return BADGES.reduce((n, b) => n + (this.isEarned(b.id) ? b.points : 0), 0); }
  get maxPoints(): number { return BADGES.reduce((n, b) => n + b.points, 0); }
  /** Earned since the sash was last opened. */
  get newCount(): number { return Object.values(this.s.earned).filter((t) => t > this.s.viewedAt).length; }

  view(b: Badge): BadgeView {
    const earnedAt = this.s.earned[b.id] ?? null;
    const c = b.criteria;
    return {
      badge: b, earnedAt, isNew: earnedAt !== null && earnedAt > this.s.viewedAt,
      value: c.kind === 'stat' ? Math.floor(this.stat(c.stat)) : null, target: c.kind === 'stat' ? c.target : null,
    };
  }

  /** The sash was opened: nothing is new any more. */
  markViewed(): void {
    this.s.viewedAt = Date.now();
    this.save();
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onEarned(l: (b: Badge) => void): () => void {
    this.earnedListeners.add(l);
    return () => this.earnedListeners.delete(l);
  }

  // ── Debug ─────────────────────────────────────────────────────────────────

  debugEarnAll(): void {
    const now = Date.now();
    for (const b of BADGES) if (!this.isEarned(b.id)) this.s.earned[b.id] = now;
    this.save();
  }

  /** Earns the next few unearned badges (with toasts), to see them land. */
  debugEarnSome(n = 3): void {
    for (const b of BADGES.filter((x) => !this.isEarned(x.id)).slice(0, n)) this.earn(b);
    this.save();
  }

  debugReset(): void {
    this.s = fresh();
    this.save();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Awards every badge whose criteria are now met (earning badges can finish "earn N badges" ones). */
  private evaluate(saveNow = false): void {
    let any = false;
    for (let changed = true; changed;) {
      changed = false;
      for (const b of BADGES) {
        if (this.isEarned(b.id) || !this.met(b.criteria)) continue;
        this.earn(b);
        changed = any = true;
      }
    }
    if (any || saveNow) this.save();
    else this.listeners.forEach((l) => l());
  }

  private earn(b: Badge): void {
    this.s.earned[b.id] = Date.now();
    this.earnedListeners.forEach((l) => l(b));
  }

  private met(c: Criteria): boolean {
    return c.kind === 'flag' ? !!this.s.flags[c.flag] : this.stat(c.stat) >= c.target;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  private flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = 0; }
    storageSet(KEY, this.s);
  }

  private save(): void {
    this.flush();
    this.listeners.forEach((l) => l());
  }
}

function isDerived(id: string): boolean { return id === 'discovered' || id === 'badges' || id === 'pass_stamps'; }

export const achievements = new Achievements();
