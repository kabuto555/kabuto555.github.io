// Daily login rewards ("Camp Mail") — one claim per local calendar day, on a 7-day
// streak. Claiming the day after your last claim advances the streak; missing a day
// starts it over at day 1; after day 7 it loops. All local + persisted (no backend,
// so the clock is the device's — fine for a prototype).
//
// Rewards are content: edit DAILY_REWARDS (thin code, thick content).

import { storageGet, storageSet } from './storage';
import { economy, premium } from './economy';

export type DailyReward =
  | { kind: 'beads'; amount: number }
  | { kind: 'pinecones'; amount: number; note?: string };

/** Day 1 … 7. Pony beads most days, a few golden pinecones, and a Care Package's worth on day 7. */
export const DAILY_REWARDS: DailyReward[] = [
  { kind: 'beads', amount: 50 },
  { kind: 'beads', amount: 75 },
  { kind: 'pinecones', amount: 2 },
  { kind: 'beads', amount: 100 },
  { kind: 'pinecones', amount: 3 },
  { kind: 'beads', amount: 150 },
  { kind: 'pinecones', amount: 10, note: 'A free Care Package!' },
];

const KEY = 'chonk.daily.v1';

interface State {
  /** Local YYYY-MM-DD of the last claim ('' = never). */
  last: string;
  /** Days claimed in the current streak (1…7; 0 = none yet). */
  streak: number;
  /** Debug: whole days added to the real clock. */
  dayOffset: number;
}

type Listener = () => void;

class DailyRewards {
  private s: State = { last: '', streak: 0, dayOffset: 0, ...storageGet<Partial<State>>(KEY, {}) };
  private listeners = new Set<Listener>();

  /** Today's local date key. */
  private today(): string { return dayKey(this.s.dayOffset); }

  get canClaim(): boolean { return this.s.last !== this.today(); }

  /** Streak day (1…7) that a claim right now would give. */
  get nextDay(): number {
    if (!this.canClaim) return (this.s.streak % 7) + 1; // tomorrow's
    const continues = this.s.last === dayKey(this.s.dayOffset - 1);
    return continues ? (this.s.streak % 7) + 1 : 1;
  }

  /** Days already claimed in the streak shown on the calendar (0…7). */
  get claimedInCycle(): number {
    if (!this.canClaim) return this.s.streak;
    const continues = this.s.last === dayKey(this.s.dayOffset - 1);
    return continues && this.s.streak < 7 ? this.s.streak : 0;
  }

  /** Claim today's reward (grants it). Returns the day number and reward, or null if already claimed. */
  claim(): { day: number; reward: DailyReward } | null {
    if (!this.canClaim) return null;
    const day = this.nextDay;
    const reward = DAILY_REWARDS[day - 1];
    if (reward.kind === 'beads') economy.add(reward.amount);
    else premium.add(reward.amount);
    this.s.last = this.today();
    this.s.streak = day;
    this.save();
    return { day, reward };
  }

  /** Milliseconds until the next local midnight (+ debug offset doesn't matter here). */
  msUntilTomorrow(): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  /** Debug: jump the calendar a day forward (a new claim becomes available). */
  debugNextDay(): void { this.s.dayOffset++; this.save(); }
  debugReset(): void { this.s = { last: '', streak: 0, dayOffset: 0 }; this.save(); }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

function dayKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dailyRewards = new DailyRewards();
