// Camp Pass (our battle pass) — season stats, goal claims, points → stamps, and the
// free / premium reward track. All local + persisted. Gameplay calls record() /
// recordMinigame() / recordRide(); the HUD toast listens with onNotice(); screens
// re-render with subscribe(). Content (goals, tiers, items) lives in content.ts.

import { storageGet, storageSet } from '../storage';
import { economy, premium } from '../economy';
import { playerInventory } from '../inventory/inventory';
import { CARE_PACKAGE_TOKEN } from '../care-package/rewards';
import {
  GOALS, PASS, TIERS, type GoalLine, type GoalStep, type MinigameId, type PassReward, type RideId, type StatId,
} from './content';

const KEY = 'chonk.campPass.s1';

export type PassTrack = 'free' | 'premium';

interface State {
  stats: Partial<Record<StatId, number>>;
  /** Goal id → how many of its steps have been claimed. */
  step: Record<string, number>;
  points: number;
  claimed: Record<PassTrack, number[]>;
  premium: boolean;
}

const fresh = (): State => ({ stats: {}, step: {}, points: 0, claimed: { free: [], premium: [] }, premium: false });

export interface GoalView {
  line: GoalLine;
  /** Steps claimed so far. */
  claimedSteps: number;
  /** The step being worked on, or null once every step is claimed. */
  step: GoalStep | null;
  value: number;
  /** Ready to claim. */
  complete: boolean;
}

export type TierState = 'locked' | 'claimable' | 'claimed' | 'needsPremium';

export type PassNotice =
  | { kind: 'progress'; line: GoalLine; step: GoalStep; value: number }
  | { kind: 'complete'; line: GoalLine; step: GoalStep }
  | { kind: 'stamp'; tier: number };

export interface ClaimResult { beads: number; points: number; newStamps: number[]; }

class CampPass {
  private s: State;
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: PassNotice) => void>();
  private statListeners = new Set<(stat: StatId, n: number) => void>();

  constructor() {
    const saved = storageGet<Partial<State>>(KEY, {});
    const d = fresh();
    this.s = {
      stats: saved.stats ?? d.stats, step: saved.step ?? d.step, points: saved.points ?? 0,
      claimed: { free: saved.claimed?.free ?? [], premium: saved.claimed?.premium ?? [] }, premium: !!saved.premium,
    };
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  stat(id: StatId): number { return this.s.stats[id] ?? 0; }

  /** Count `n` more of a stat; notifies progress / completion of the goals on it.
   * `share` false keeps it out of the drives (debug shortcuts). */
  record(stat: StatId, n = 1, share = true): void {
    const before = this.stat(stat), after = before + n;
    this.s.stats[stat] = after;
    for (const line of GOALS) {
      if (line.stat !== stat) continue;
      const step = line.steps[this.s.step[line.id] ?? 0];
      if (!step || before >= step.target) continue; // finished, or already waiting to be claimed
      if (after >= step.target) this.notify({ kind: 'complete', line, step });
      // Short goals tick every time; long ones (jumps…) only at each quarter.
      else if (step.target <= 10 || Math.floor((after / step.target) * 4) > Math.floor((before / step.target) * 4)) {
        this.notify({ kind: 'progress', line, step, value: after });
      }
    }
    this.save();
    if (share) this.statListeners.forEach((l) => l(stat, n));
  }

  /** Every stat increment (drives count the same things). */
  onStat(l: (stat: StatId, n: number) => void): () => void {
    this.statListeners.add(l);
    return () => this.statListeners.delete(l);
  }

  /** Pass points from outside the goal list (Community / Troop Drives); announces any new stamps. */
  awardPoints(n: number): void {
    const before = this.stamps;
    this.s.points += n;
    this.save();
    for (let t = before + 1; t <= this.stamps; t++) this.notify({ kind: 'stamp', tier: t });
  }

  recordMinigame(mode: MinigameId, what: 'play' | 'win'): void {
    this.record(`${what}:${mode}`);
    this.record(`${what}:any`);
  }

  recordRide(ride: RideId): void { this.record(`ride:${ride}`); }

  // ── Goals ─────────────────────────────────────────────────────────────────

  goals(): GoalView[] {
    return GOALS.map((line) => {
      const claimedSteps = this.s.step[line.id] ?? 0;
      const step = line.steps[claimedSteps] ?? null;
      const value = this.stat(line.stat);
      return { line, claimedSteps, step, value, complete: !!step && value >= step.target };
    });
  }

  claimGoal(id: string): ClaimResult | null {
    const view = this.goals().find((g) => g.line.id === id);
    if (!view?.complete || !view.step) return null;
    const stampsBefore = this.stamps;
    this.s.step[id] = view.claimedSteps + 1;
    this.s.points += view.step.points;
    economy.add(view.step.beads);
    const newStamps: number[] = [];
    for (let t = stampsBefore + 1; t <= this.stamps; t++) newStamps.push(t);
    this.save();
    newStamps.forEach((tier) => this.notify({ kind: 'stamp', tier }));
    return { beads: view.step.beads, points: view.step.points, newStamps };
  }

  /** Claims every goal that's ready (one step each); returns what each gave. */
  claimAllGoals(): ClaimResult[] {
    return this.goals().filter((g) => g.complete)
      .map((g) => this.claimGoal(g.line.id)).filter((r): r is ClaimResult => !!r);
  }

  // ── Points, stamps, tiers ─────────────────────────────────────────────────

  get points(): number { return this.s.points; }
  get tierCount(): number { return TIERS.length; }
  /** Tiers unlocked (one stamp each). */
  get stamps(): number { return Math.min(TIERS.length, Math.floor(this.s.points / PASS.pointsPerStamp)); }
  /** Points toward the next stamp (0 … pointsPerStamp; full once the pass is maxed). */
  get pointsIntoStamp(): number {
    return this.stamps >= TIERS.length ? PASS.pointsPerStamp : this.s.points % PASS.pointsPerStamp;
  }
  get hasPremium(): boolean { return this.s.premium; }

  tierState(tier: number, track: PassTrack): TierState {
    if (this.s.claimed[track].includes(tier)) return 'claimed';
    if (tier > this.stamps) return 'locked';
    if (track === 'premium' && !this.s.premium) return 'needsPremium';
    return 'claimable';
  }

  claimTier(tier: number, track: PassTrack): PassReward | null {
    if (this.tierState(tier, track) !== 'claimable') return null;
    const reward = TIERS[tier - 1][track];
    this.s.claimed[track].push(tier);
    grant(reward);
    this.save();
    return reward;
  }

  /** Claims every stamped tier on both tracks (premium only if unlocked), lowest tier first. */
  claimAllTiers(): PassReward[] {
    const out: PassReward[] = [];
    for (let t = 1; t <= this.stamps; t++) {
      for (const track of ['free', 'premium'] as const) {
        const r = this.claimTier(t, track);
        if (r) out.push(r);
      }
    }
    return out;
  }

  /** Spend golden pinecones on the premium track. */
  unlockPremium(): boolean {
    if (this.s.premium || !premium.spend(PASS.premiumPrice)) return false;
    this.s.premium = true;
    this.save();
    return true;
  }

  /** Goals + tiers waiting to be claimed (the HUD badge). */
  get claimableCount(): number {
    let n = this.goals().filter((g) => g.complete).length;
    for (let t = 1; t <= this.stamps; t++) {
      if (this.tierState(t, 'free') === 'claimable') n++;
      if (this.tierState(t, 'premium') === 'claimable') n++;
    }
    return n;
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onNotice(l: (n: PassNotice) => void): () => void {
    this.noticeListeners.add(l);
    return () => this.noticeListeners.delete(l);
  }

  // ── Debug ─────────────────────────────────────────────────────────────────

  debugAddPoints(n: number): void { this.awardPoints(n); }

  /** Every goal's current step becomes ready to claim. */
  debugCompleteGoals(): void {
    for (const g of this.goals()) {
      if (g.step && !g.complete) this.record(g.line.stat, g.step.target - g.value, false);
    }
  }

  debugReset(): void {
    this.s = fresh();
    this.save();
  }

  private notify(n: PassNotice): void { this.noticeListeners.forEach((l) => l(n)); }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

function grant(r: PassReward): void {
  if (r.kind === 'beads') economy.add(r.amount);
  else if (r.kind === 'pinecones') premium.add(r.amount);
  else if (r.kind === 'care_package') playerInventory.grant(CARE_PACKAGE_TOKEN.id, 'camp_pass', r.count);
  else playerInventory.grant(r.id, 'camp_pass');
}

export const campPass = new CampPass();
