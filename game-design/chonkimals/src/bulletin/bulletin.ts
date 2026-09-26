// Bulletin Board state — which announcements you've read, today's daily challenge
// (picked from the pool by the local date) and its progress/claim, and this week's
// Camp Stars. All local + persisted.
//
// Works off the Camp Pass: activity arrives through `campPass.onStat` (the pass is the
// one place gameplay reports to), season win totals for the leaderboards are the
// pass's stats, and claiming a challenge also pays Camp Pass points (→ stamps).

import { storageGet, storageSet } from '../storage';
import { economy, premium } from '../economy';
import { campPass } from '../camp-pass/camp-pass';
import { BOT_NAMES, DODGEBALL_BOT_NAMES, SUMO_BOT_NAMES } from '../bots/roster';
import {
  ANNOUNCEMENTS, BOARDS, CHALLENGE_STARS, DAILY_CHALLENGES, RIVAL_RANGE, STAR_POINTS,
  type BoardId, type CampStat, type DailyChallenge,
} from './bulletin-presets';
import type { DailyReward } from '../daily-rewards';

const KEY = 'chonk.bulletin.v1';

interface State {
  read: string[];
  /** Day key + challenge id the progress below belongs to. */
  day: string;
  cid: string;
  progress: number;
  claimed: boolean;
  /** Day key the challenge paper was last looked at (drives the "!"). */
  seenDay: string;
  /** Monday key + this week's Camp Stars. */
  week: string;
  weekStars: number;
  /** Debug: whole days added to the clock. */
  dayOffset: number;
}

export interface BoardRow { name: string; score: number; rank: number; isPlayer?: boolean }

/** What a claim paid out. */
export type ChallengeClaim = DailyReward & { passPoints: number };

type Listener = () => void;

class Bulletin {
  private s: State = {
    read: [], day: '', cid: '', progress: 0, claimed: false, seenDay: '', week: '', weekStars: 0, dayOffset: 0,
    ...storageGet<Partial<State>>(KEY, {}),
  };
  private listeners = new Set<Listener>();
  private completeListeners = new Set<(c: DailyChallenge) => void>();

  constructor() {
    this.rollover();
    // Everything the Camp Pass counts counts here too (debug shortcuts with share=false don't).
    campPass.onStat((stat, n) => this.track(stat, n));
  }

  // ── Daily challenge ───────────────────────────────────────────────────────
  get challenge(): DailyChallenge {
    this.rollover();
    return DAILY_CHALLENGES.find((c) => c.id === this.s.cid) ?? pick(this.s.day);
  }
  get progress(): number { this.rollover(); return Math.min(this.s.progress, this.challenge.goal); }
  get complete(): boolean { return this.progress >= this.challenge.goal; }
  get claimed(): boolean { this.rollover(); return this.s.claimed; }
  get claimable(): boolean { return this.complete && !this.claimed; }
  /** Today's challenge hasn't been looked at yet. */
  get challengeUnseen(): boolean { this.rollover(); return this.s.seenDay !== this.s.day; }

  markChallengeSeen(): void {
    if (!this.challengeUnseen) return;
    this.s.seenDay = this.s.day;
    this.save();
  }

  /** Grants the reward + Camp Pass points (+ bonus Camp Stars). Null if not complete / already claimed. */
  claim(): ChallengeClaim | null {
    if (!this.claimable) return null;
    const c = this.challenge, r = c.reward;
    if (r.kind === 'beads') economy.add(r.amount); else premium.add(r.amount);
    this.s.claimed = true;
    this.s.weekStars += CHALLENGE_STARS;
    this.save();
    campPass.awardPoints(c.passPoints); // announces any new stamp (pass toast)
    return { ...r, passPoints: c.passPoints };
  }

  /** Today's challenge just got finished (toast: "claim it at the Bulletin Board"). */
  onComplete(l: (c: DailyChallenge) => void): () => void {
    this.completeListeners.add(l);
    return () => this.completeListeners.delete(l);
  }

  /** Day key of today's challenge (toast keys). */
  get dayKey(): string { this.rollover(); return this.s.day; }

  msUntilTomorrow(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  }

  // ── Announcements ─────────────────────────────────────────────────────────
  get unreadCount(): number { return ANNOUNCEMENTS.filter((a) => !this.s.read.includes(a.id)).length; }
  isRead(id: string): boolean { return this.s.read.includes(id); }
  markAllRead(): void {
    if (!this.unreadCount) return;
    this.s.read = ANNOUNCEMENTS.map((a) => a.id);
    this.save();
  }

  /** Something on the board wants you: unread news, a new challenge, or a reward to claim. */
  get hasAlert(): boolean { return this.unreadCount > 0 || this.challengeUnseen || this.claimable; }

  // ── Activity (fed by campPass.onStat) ─────────────────────────────────────
  private track(stat: CampStat, n = 1): void {
    this.rollover();
    this.s.weekStars += (STAR_POINTS[stat] ?? 0) * n;
    const c = this.challenge;
    const was = this.s.progress;
    if (c.stat === stat && !this.s.claimed) this.s.progress = Math.min(c.goal, this.s.progress + n);
    // Jumps / chat fire constantly: only persist when they matter.
    if (this.s.progress !== was || STAR_POINTS[stat]) this.save();
    if (was < c.goal && this.s.progress >= c.goal) this.completeListeners.forEach((l) => l(c));
  }

  // ── Leaderboards ──────────────────────────────────────────────────────────
  /** Sorted rows for a board, the player included. */
  board(id: BoardId, playerName: string): BoardRow[] {
    this.rollover();
    const def = BOARDS.find((b) => b.id === id)!;
    const seed = def.weekly ? hash(this.s.week) : 7;
    // A minigame's regulars top its board; campers fill the rest in a seeded (weekly) order.
    const regulars = id === 'sumo' ? SUMO_BOT_NAMES : id === 'dodgeball' ? DODGEBALL_BOT_NAMES : [];
    const campers = BOT_NAMES.filter((n) => !regulars.includes(n)).sort((a, b) => hash(a + seed) - hash(b + seed));
    const names = [...regulars, ...campers].slice(0, 24);
    const [top, bottom] = RIVAL_RANGE[id];
    // Weekly board: everyone's tally climbs from ~15% on Monday to full by Sunday night.
    const ramp = def.weekly ? 0.15 + 0.85 * weekProgress(this.s.dayOffset) : 1;
    const rows: BoardRow[] = names.map((name, i) => {
      const t = i / (names.length - 1);
      const base = top * Math.pow(bottom / top, t);            // smooth top-heavy curve
      const jitter = 0.85 + ((hash(name + seed) % 1000) / 1000) * 0.3;
      return { name, score: Math.max(1, Math.round(base * jitter * ramp)), rank: 0 };
    });
    const mine = id === 'stars' ? this.s.weekStars : campPass.stat(id === 'sumo' ? 'win:sumo' : 'win:dodgeball');
    rows.push({ name: playerName || 'You', score: mine, rank: 0, isPlayer: true });
    // Ties go to the player (it's their board).
    rows.sort((a, b) => b.score - a.score || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }

  /** "3d 4h" until the weekly board resets. */
  weekResetsIn(): string {
    const ms = nextMonday(this.s.dayOffset).getTime() - shifted(this.s.dayOffset).getTime();
    const h = Math.max(0, Math.floor(ms / 3.6e6));
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3.6e6) / 6e4)}m`;
  }

  // ── Debug ─────────────────────────────────────────────────────────────────
  debugNextDay(): void { this.s.dayOffset++; this.rollover(); this.save(); }
  debugComplete(): void {
    const c = this.challenge, was = this.s.progress;
    this.s.progress = c.goal;
    this.save();
    if (was < c.goal) this.completeListeners.forEach((l) => l(c));
  }
  debugReset(): void {
    this.s = { read: [], day: '', cid: '', progress: 0, claimed: false, seenDay: '', week: '', weekStars: 0, dayOffset: 0 };
    this.rollover();
    this.save();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** New day → fresh challenge; new week → Camp Stars back to 0. */
  private rollover(): void {
    const day = dayKey(this.s.dayOffset);
    // The day's challenge is fixed when the day starts, so editing the pool never swaps
    // out one in progress. (Saves from before `cid` existed used the original 11-challenge pool.)
    if (this.s.day === day && !this.s.cid) this.s.cid = LEGACY_POOL[hash(day) % LEGACY_POOL.length];
    if (this.s.day !== day || !DAILY_CHALLENGES.some((c) => c.id === this.s.cid)) {
      this.s.progress = 0;
      this.s.claimed = false;
      this.s.day = day;
      this.s.cid = pick(day).id;
    }
    const week = dayKey(this.s.dayOffset, mondayOf(shifted(this.s.dayOffset)));
    if (this.s.week !== week) { this.s.week = week; this.s.weekStars = 0; }
  }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

const LEGACY_POOL = ['dodge2', 'dodgewin', 'sumowin', 'sumo3', 'course', 'lunch', 'zip', 'glide', 'chat', 'jump', 'care'];

function pick(day: string): DailyChallenge { return DAILY_CHALLENGES[hash(day) % DAILY_CHALLENGES.length]; }

function shifted(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function dayKey(offsetDays: number, d = shifted(offsetDays)): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

function nextMonday(offsetDays: number): Date {
  const m = mondayOf(shifted(offsetDays));
  m.setDate(m.getDate() + 7);
  return m;
}

/** 0 at Monday 00:00 → 1 at Sunday 24:00. */
function weekProgress(offsetDays: number): number {
  const now = shifted(offsetDays);
  return Math.min(1, (now.getTime() - mondayOf(now).getTime()) / (7 * 864e5));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const bulletin = new Bulletin();
