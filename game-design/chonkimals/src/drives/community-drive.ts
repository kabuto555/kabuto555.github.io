// Community Drive — one camp-wide, time-limited goal at a time (5 minutes for the
// hackathon), with a contribution leaderboard. Every camper sees the same goal and
// chips in; once the camp hits the target everyone can collect the base reward (late
// arrivals too), and when time runs out contributors get a bonus by percentile.
// A completed drive makes the next one harder; a missed one makes it easier.
//
// No backend: the rest of camp is a seeded crowd (bot names + leaderboard rivals)
// whose contributions are a deterministic function of time, so a reload shows the
// same board. The local player's contribution comes from Camp Pass stats.

import { storageGet, storageSet } from '../storage';
import { economy, premium } from '../economy';
import { hashString, seededRng } from '../rng';
import { BOT_NAMES } from '../bots/roster';
import { FAKE_RIVALS } from '../ui/leaderboard-presets';
import { campPass } from '../camp-pass/camp-pass';
import {
  COMMUNITY_DRIVE, COMMUNITY_DRIVES, PERCENTILE_TIERS, driveTitle, type DriveTemplate, type PercentileTier,
} from './content';

const KEY = 'chonk.communityDrive.v1';

/** The simulated crowd (everyone but you). */
const CROWD: string[] = [...new Set([...BOT_NAMES, ...FAKE_RIVALS.map((r) => r.name)])];

interface Current {
  seq: number;
  template: string;
  seed: number;
  startedAt: number;
  endsAt: number;
  target: number;
  difficulty: number;
  /** Your contribution. */
  mine: number;
  claimedBase: boolean;
  completeNotified: boolean;
}

export interface DriveResult {
  seq: number;
  template: string;
  target: number;
  total: number;
  completed: boolean;
  mine: number;
  rank: number;
  of: number;
  /** Index into PERCENTILE_TIERS, or -1 (missed, or didn't contribute). */
  tier: number;
  claimedBase: boolean;
  claimed: boolean;
}

interface State { seq: number; difficulty: number; current: Current | null; last: DriveResult | null; }

export interface DriveNotice { key: string; emoji: string; kicker: string; title: string; cta: string; }

export interface DriveView {
  template: DriveTemplate;
  title: string;
  target: number;
  total: number;
  mine: number;
  endsAt: number;
  msLeft: number;
  complete: boolean;
  canClaimBase: boolean;
  rank: number;
  of: number;
  /** The percentile tier you'd get if the drive ended now (-1 = none yet). */
  tier: number;
  difficulty: number;
}

export interface DriveReward { beads: number; pinecones: number; points: number; }

/** A drive's crowd: per-camper rate (units / ms) and start delay (ms). */
interface Crowd { rate: number[]; delay: number[]; }

class CommunityDrive {
  private s: State = { seq: 0, difficulty: 1, current: null, last: null, ...storageGet<Partial<State>>(KEY, {}) };
  private crowd: Crowd | null = null;
  private crowdSeq = -1;
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: DriveNotice) => void>();

  constructor() {
    campPass.onStat((stat, n) => {
      const c = this.s.current;
      if (!c || Date.now() >= c.endsAt || !this.templateOf(c).stats.includes(stat)) return;
      c.mine += n;
      this.save(false);
    });
  }

  /** Advance the clock: finishes an expired drive, starts the next, announces completion. Call ~1/s. */
  tick(now = Date.now()): void {
    let c = this.s.current;
    if (c && now >= c.endsAt) {
      this.finish(c);
      // Pick up where the last one ended, unless that one is long gone too.
      this.start(now - c.endsAt < COMMUNITY_DRIVE.durationMs ? c.endsAt : now);
      c = this.s.current;
    } else if (!c) {
      this.start(now);
      c = this.s.current;
    }
    if (c && !c.completeNotified && this.total(c, now) >= c.target) {
      c.completeNotified = true;
      this.save();
      this.notify({ key: `drive-done:${c.seq}`, emoji: '🎉', kicker: 'COMMUNITY DRIVE · COMPLETE!',
        title: 'The camp hit the goal!', cta: 'Tap to claim your reward' });
    }
  }

  view(now = Date.now()): DriveView | null {
    const c = this.s.current;
    if (!c) return null;
    const template = this.templateOf(c);
    const total = this.total(c, now);
    const { rank, of } = this.rankAt(c, now);
    return {
      template, title: driveTitle(template, c.target), target: c.target, total, mine: c.mine,
      endsAt: c.endsAt, msLeft: Math.max(0, c.endsAt - now), complete: total >= c.target,
      canClaimBase: total >= c.target && !c.claimedBase, rank, of,
      tier: c.mine > 0 ? tierFor(rank, of) : -1, difficulty: c.difficulty,
    };
  }

  /** The finished drive, if it still has something to show (results / unclaimed rewards). */
  get last(): DriveResult | null { return this.s.last; }

  lastReward(): DriveReward | null {
    const l = this.s.last;
    if (!l?.completed || l.claimed) return null;
    const t: PercentileTier | undefined = PERCENTILE_TIERS[l.tier];
    const base = l.claimedBase ? { beads: 0, points: 0 } : COMMUNITY_DRIVE.baseReward;
    const r = { beads: base.beads + (t?.beads ?? 0), pinecones: t?.pinecones ?? 0, points: base.points + (t?.points ?? 0) };
    return r.beads || r.pinecones || r.points ? r : null;
  }

  claimBase(): DriveReward | null {
    const v = this.view();
    const c = this.s.current;
    if (!v?.canClaimBase || !c) return null;
    c.claimedBase = true;
    const r = { ...COMMUNITY_DRIVE.baseReward, pinecones: 0 };
    this.grant(r);
    this.save();
    return r;
  }

  claimLast(): DriveReward | null {
    const r = this.lastReward();
    if (!r || !this.s.last) return null;
    this.s.last.claimed = true;
    this.grant(r);
    this.save();
    return r;
  }

  get claimableCount(): number {
    return (this.view()?.canClaimBase ? 1 : 0) + (this.lastReward() ? 1 : 0);
  }

  /** Everyone's contribution right now, high → low (you included). */
  leaderboard(playerName: string, now = Date.now()): { name: string; score: number; isPlayer?: boolean }[] {
    const c = this.s.current;
    if (!c) return [];
    const crowd = this.crowdFor(c);
    const t = Math.min(now, c.endsAt) - c.startedAt;
    const rows: { name: string; score: number; isPlayer?: boolean }[] = [
      ...CROWD.map((name, i) => ({ name, score: contribution(crowd, i, t) })),
      { name: playerName, score: c.mine, isPlayer: true },
    ];
    return rows.sort((a, b) => b.score - a.score || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
  }

  subscribe(l: () => void): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  onNotice(l: (n: DriveNotice) => void): () => void { this.noticeListeners.add(l); return () => this.noticeListeners.delete(l); }

  /** Debug: end the current drive now. */
  debugEndNow(): void {
    const c = this.s.current;
    if (!c) return;
    c.endsAt = Date.now();
    this.tick();
  }

  /** Debug: add to your contribution. */
  debugContribute(n: number): void {
    if (!this.s.current) return;
    this.s.current.mine += n;
    this.save();
  }

  debugReset(): void {
    this.s = { seq: 0, difficulty: 1, current: null, last: null };
    this.save();
    this.tick();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private start(at: number): void {
    const seq = this.s.seq + 1;
    const template = COMMUNITY_DRIVES[(seq - 1) % COMMUNITY_DRIVES.length];
    const round = template.base >= 1000 ? 50 : 5;
    const target = Math.max(round, Math.round((template.base * this.s.difficulty) / round) * round);
    this.s.seq = seq;
    this.s.current = {
      seq, template: template.id, seed: hashString(`${seq}:${at}`), startedAt: at, endsAt: at + COMMUNITY_DRIVE.durationMs,
      target, difficulty: this.s.difficulty, mine: 0, claimedBase: false, completeNotified: false,
    };
    this.save();
    this.notify({ key: `drive-new:${seq}`, emoji: template.emoji, kicker: 'NEW COMMUNITY DRIVE',
      title: driveTitle(template, target), cta: 'Everyone chips in — 5 minutes!' });
  }

  private finish(c: Current): void {
    const total = this.total(c, c.endsAt);
    const completed = total >= c.target;
    const { rank, of } = this.rankAt(c, c.endsAt);
    const tier = completed && c.mine > 0 ? tierFor(rank, of) : -1;
    // Only one result is kept: pay out an older one that was never collected rather than lose it.
    if (this.lastReward()) this.claimLast();
    this.s.last = { seq: c.seq, template: c.template, target: c.target, total, completed, mine: c.mine, rank, of, tier,
      claimedBase: c.claimedBase, claimed: false };
    const d = this.s.difficulty * (completed ? COMMUNITY_DRIVE.harderAfterWin : COMMUNITY_DRIVE.easierAfterMiss);
    this.s.difficulty = Math.min(COMMUNITY_DRIVE.maxDifficulty, Math.max(COMMUNITY_DRIVE.minDifficulty, d));
    this.s.current = null;
    this.save();
    const t = PERCENTILE_TIERS[tier];
    this.notify(completed
      ? { key: `drive-end:${c.seq}`, emoji: '🏅', kicker: 'COMMUNITY DRIVE · RESULTS',
          title: t ? `You placed ${t.label} (#${rank})!` : 'Drive complete — next one\'s harder!', cta: 'Tap to collect' }
      : { key: `drive-end:${c.seq}`, emoji: '⏰', kicker: 'COMMUNITY DRIVE · MISSED',
          title: 'So close! The next drive is easier.', cta: 'Tap to see the new drive' });
  }

  private templateOf(c: Current): DriveTemplate {
    return COMMUNITY_DRIVES.find((t) => t.id === c.template) ?? COMMUNITY_DRIVES[0];
  }

  private total(c: Current, now: number): number {
    const crowd = this.crowdFor(c);
    const t = Math.min(now, c.endsAt) - c.startedAt;
    let sum = c.mine;
    for (let i = 0; i < CROWD.length; i++) sum += contribution(crowd, i, t);
    return sum;
  }

  private rankAt(c: Current, now: number): { rank: number; of: number } {
    const crowd = this.crowdFor(c);
    const t = Math.min(now, c.endsAt) - c.startedAt;
    let ahead = 0;
    for (let i = 0; i < CROWD.length; i++) if (contribution(crowd, i, t) > c.mine) ahead++;
    return { rank: ahead + 1, of: CROWD.length + 1 };
  }

  /** Seeded crowd for a drive: heavy-tailed rates, staggered starts. The crowd alone lands
   * between ~75% and ~118% of the target, so your share can decide it. */
  private crowdFor(c: Current): Crowd {
    if (this.crowd && this.crowdSeq === c.seq) return this.crowd;
    const r = seededRng(c.seed, 'community-drive');
    const D = c.endsAt - c.startedAt;
    const w = CROWD.map(() => 0.15 + Math.pow(r.next(), 2.5) * 3);
    const delay = CROWD.map(() => r.range(0, 0.35) * D);
    const pace = r.range(0.85, 1.35);
    const budget = w.reduce((s, wi, i) => s + wi * (D - delay[i]), 0);
    const k = c.target / (pace * budget);
    this.crowd = { rate: w.map((wi) => wi * k), delay };
    this.crowdSeq = c.seq;
    return this.crowd;
  }

  private grant(r: DriveReward): void {
    if (r.beads) economy.add(r.beads);
    if (r.pinecones) premium.add(r.pinecones);
    if (r.points) campPass.awardPoints(r.points);
  }

  private notify(n: DriveNotice): void { this.noticeListeners.forEach((l) => l(n)); }

  private save(emit = true): void {
    storageSet(KEY, this.s);
    if (emit) this.listeners.forEach((l) => l());
  }
}

function contribution(crowd: Crowd, i: number, t: number): number {
  return Math.floor(crowd.rate[i] * Math.max(0, t - crowd.delay[i]));
}

/** Percentile tier for a rank out of `of` (rank 1 = top). */
function tierFor(rank: number, of: number): number {
  const p = (rank - 1) / of;
  return PERCENTILE_TIERS.findIndex((t) => p < t.top);
}

export const communityDrive = new CommunityDrive();
