// Scout Troop Drives — three untimed goals per scout troop, worked on together.
// Finishing one queues its reward for you to claim (pony beads, Camp Pass points, some
// golden pinecones, and every few goals a troop-exclusive cosmetic) and opens a new,
// slightly bigger goal in its place. No leaderboard.
//
// No backend: your troopmates' share is simulated as a steady, seeded pace (bigger
// troops are faster), measured from when each goal opened. Your share comes from Camp
// Pass stats while you're in the troop. State is kept per troop, so leaving and
// rejoining picks up where the troop left off.

import { storageGet, storageSet } from '../storage';
import { economy, premium } from '../economy';
import { hashString, seededRng } from '../rng';
import { campPass } from '../camp-pass/camp-pass';
import { playerInventory } from '../inventory/inventory';
import { playerTroop } from '../troops';
import {
  TROOP_DRIVE, TROOP_DRIVES, TROOP_ITEMS, driveTitle, troopGoalReward, type DriveTemplate,
} from './content';
import type { DriveNotice } from './community-drive';

const KEY = 'chonk.troopDrives.v1';

interface Goal {
  template: string;
  level: number;
  target: number;
  startedAt: number;
  /** Troopmates' pace (units / ms). */
  rate: number;
  /** Your contribution. */
  mine: number;
}

export interface TroopDriveReward {
  title: string;
  emoji: string;
  beads: number;
  points: number;
  pinecones: number;
  itemId?: string;
}

interface TroopState { goals: Goal[]; completed: number; pending: TroopDriveReward[]; }

export interface TroopGoalView {
  template: DriveTemplate;
  title: string;
  level: number;
  target: number;
  progress: number;
  mine: number;
  reward: TroopDriveReward;
}

class TroopDrives {
  private s: Record<string, TroopState> = storageGet<Record<string, TroopState>>(KEY, {});
  private members: (troopId: string) => number = () => 15;
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: DriveNotice) => void>();

  constructor() {
    campPass.onStat((stat, n) => {
      const st = this.current();
      if (!st) return;
      let hit = false;
      for (const g of st.goals) if (templateOf(g).stats.includes(stat)) { g.mine += n; hit = true; }
      if (hit) this.save(false);
    });
  }

  /** How many members a troop has (drives the simulated pace). */
  setMemberCount(fn: (troopId: string) => number): void { this.members = fn; }

  /** Completes any goals the troop has reached and opens new ones. Call ~1/s. */
  tick(now = Date.now()): void {
    const troop = playerTroop();
    if (!troop) return;
    const st = this.ensure(troop.id, now);
    let changed = false;
    st.goals.forEach((g, i) => {
      if (progress(g, now) < g.target) return;
      const reward = this.rewardFor(g, st.completed + 1, st);
      st.pending.push(reward);
      st.completed++;
      st.goals[i] = this.newGoal(troop.id, st, g.level + 1, now);
      changed = true;
      this.notify({ key: `troop-done:${troop.id}:${st.completed}`, emoji: templateOf(g).emoji,
        kicker: `${troop.name.toUpperCase()} · TROOP DRIVE DONE!`, title: reward.title, cta: 'Tap to claim your share' });
    });
    if (changed) this.save();
  }

  /** The player's troop's goals (empty when not in a troop). */
  goals(now = Date.now()): TroopGoalView[] {
    const troop = playerTroop();
    if (!troop) return [];
    const st = this.ensure(troop.id, now);
    return st.goals.map((g) => {
      const template = templateOf(g);
      return { template, title: driveTitle(template, g.target), level: g.level, target: g.target,
        progress: Math.min(g.target, progress(g, now)), mine: g.mine, reward: this.rewardFor(g, null, st) };
    });
  }

  /** Finished goals waiting for you to claim. */
  pending(): TroopDriveReward[] {
    const troop = playerTroop();
    return troop ? [...(this.s[troop.id]?.pending ?? [])] : [];
  }

  get completedCount(): number {
    const troop = playerTroop();
    return troop ? this.s[troop.id]?.completed ?? 0 : 0;
  }

  /** Goals left until the next troop-exclusive cosmetic (0 once you own them all). */
  get goalsUntilCosmetic(): number {
    if (TROOP_ITEMS.every((it) => playerInventory.owns(it.id))) return 0;
    const every = TROOP_DRIVE.cosmeticEvery;
    return every - (this.completedCount % every);
  }

  get claimableCount(): number { return this.pending().length; }

  claim(index: number): TroopDriveReward | null {
    const troop = playerTroop();
    const st = troop && this.s[troop.id];
    if (!st || !st.pending[index]) return null;
    const [r] = st.pending.splice(index, 1);
    if (r.beads) economy.add(r.beads);
    if (r.pinecones) premium.add(r.pinecones);
    if (r.itemId) playerInventory.grant(r.itemId, 'troop_drive');
    this.save();
    if (r.points) campPass.awardPoints(r.points);
    return r;
  }

  subscribe(l: () => void): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  onNotice(l: (n: DriveNotice) => void): () => void { this.noticeListeners.add(l); return () => this.noticeListeners.delete(l); }

  /** Debug: every open goal for your troop finishes on the next tick. */
  debugFinishAll(): void {
    const st = this.current();
    if (!st) return;
    for (const g of st.goals) g.mine = g.target;
    this.save();
    this.tick();
  }

  debugReset(): void {
    this.s = {};
    this.save();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private current(): TroopState | null {
    const troop = playerTroop();
    return troop ? this.ensure(troop.id, Date.now()) : null;
  }

  private ensure(troopId: string, now: number): TroopState {
    let st = this.s[troopId];
    if (!st) {
      st = { goals: [], completed: 0, pending: [] };
      this.s[troopId] = st;
      while (st.goals.length < TROOP_DRIVE.slots) st.goals.push(this.newGoal(troopId, st, 0, now));
      this.save(false);
    }
    return st;
  }

  private newGoal(troopId: string, st: TroopState, level: number, now: number): Goal {
    const r = seededRng(hashString(`${troopId}:${st.completed}:${st.goals.length}:${now}`), 'troop-drive');
    const active = new Set(st.goals.map((g) => g.template));
    const pool = TROOP_DRIVES.filter((t) => !active.has(t.id));
    const t = r.pick(pool.length ? pool : TROOP_DRIVES);
    const round = t.base >= 200 ? 10 : 1;
    const target = Math.max(1, Math.round((t.base * (1 + TROOP_DRIVE.levelStep * level)) / round) * round);
    const [lo, hi] = TROOP_DRIVE.minutesPerGoal;
    const minutes = r.range(lo, hi) * (15 / Math.min(40, Math.max(4, this.members(troopId))));
    return { template: t.id, level, target, startedAt: now, rate: target / (minutes * 60_000), mine: 0 };
  }

  /** What finishing `g` pays, as the troop's `nth` completed goal (null = preview, no cosmetic). */
  private rewardFor(g: Goal, nth: number | null, st: TroopState): TroopDriveReward {
    const base = troopGoalReward(g.level);
    const t = templateOf(g);
    let itemId: string | undefined;
    if (nth !== null && nth % TROOP_DRIVE.cosmeticEvery === 0) {
      const promised = new Set(st.pending.map((p) => p.itemId));
      itemId = TROOP_ITEMS.find((it) => !playerInventory.owns(it.id) && !promised.has(it.id))?.id;
    }
    return { title: driveTitle(t, g.target), emoji: t.emoji, ...base, itemId };
  }

  private notify(n: DriveNotice): void { this.noticeListeners.forEach((l) => l(n)); }

  private save(emit = true): void {
    storageSet(KEY, this.s);
    if (emit) this.listeners.forEach((l) => l());
  }
}

function templateOf(g: Goal): DriveTemplate {
  return TROOP_DRIVES.find((t) => t.id === g.template) ?? TROOP_DRIVES[0];
}

function progress(g: Goal, now: number): number {
  return Math.floor(g.rate * Math.max(0, now - g.startedAt)) + g.mine;
}

export const troopDrives = new TroopDrives();
