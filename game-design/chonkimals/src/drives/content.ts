// Drive content — Community Drives (one camp-wide, timed goal at a time, with a
// contribution leaderboard) and Scout Troop Drives (three untimed goals per troop).
// Data only (thin code, thick content): community-drive.ts / troop-drives.ts run them.
//
// Both count the same stats as the Camp Pass (camp-pass/content.ts StatId). No backend:
// the rest of camp (and your troopmates) are simulated, see the modules.

import { registerItems, type Item } from '../inventory/items';
import type { StatId } from '../camp-pass/content';

export interface DriveTemplate {
  id: string;
  /** Any of these stats counts toward the goal. */
  stats: StatId[];
  emoji: string;
  /** `{n}` = the target. */
  title: string;
  /** Target at difficulty 1. */
  base: number;
}

// ── Community Drives ────────────────────────────────────────────────────────

export const COMMUNITY_DRIVE = {
  /** Hackathon pacing: a drive lasts 5 minutes, then the next one starts. */
  durationMs: 5 * 60 * 1000,
  /** Difficulty × after a completed drive / a missed one (clamped to min…max). */
  harderAfterWin: 1.25,
  easierAfterMiss: 0.8,
  minDifficulty: 0.5,
  maxDifficulty: 3,
  /** Everyone gets this once the camp hits the target — even campers who show up late. */
  baseReward: { beads: 60, points: 80 },
};

export const COMMUNITY_DRIVES: DriveTemplate[] = [
  { id: 'jumps',     stats: ['jump'],                       emoji: '🦘', title: 'Jump-a-thon: {n} jumps camp-wide', base: 3000 },
  { id: 'minigames', stats: ['play:any'],                   emoji: '🎮', title: 'Play {n} minigames together',       base: 160 },
  { id: 'wins',      stats: ['win:any'],                    emoji: '🏆', title: 'Win {n} minigames as a camp',       base: 70 },
  { id: 'rides',     stats: ['ride:zipline', 'ride:glider'], emoji: '🚡', title: 'Take {n} zipline or glider rides', base: 120 },
  { id: 'chat',      stats: ['chat'],                       emoji: '💬', title: 'Send {n} friendly chats',           base: 450 },
];

/** Leaderboard bonus on a completed drive, by contribution percentile (first match wins).
 * Anyone who chipped in gets at least the last tier, so most players get something. */
export interface PercentileTier { label: string; top: number; beads: number; pinecones: number; points: number; }
export const PERCENTILE_TIERS: PercentileTier[] = [
  { label: 'Top 1%',      top: 0.01, beads: 300, pinecones: 10, points: 150 },
  { label: 'Top 10%',     top: 0.10, beads: 150, pinecones: 5,  points: 100 },
  { label: 'Top 25%',     top: 0.25, beads: 100, pinecones: 2,  points: 60 },
  { label: 'Top 50%',     top: 0.50, beads: 60,  pinecones: 0,  points: 40 },
  { label: 'Contributor', top: 1,    beads: 25,  pinecones: 0,  points: 20 },
];

// ── Scout Troop Drives ──────────────────────────────────────────────────────

export const TROOP_DRIVE = {
  /** Goals open at once. */
  slots: 3,
  /** Target grows by this share of base per level. */
  levelStep: 0.5,
  /** Simulated troop pace: minutes to finish a goal for a 15-member troop (smaller troops are slower). */
  minutesPerGoal: [4, 9] as [number, number],
  /** A troop-exclusive cosmetic on every Nth completed goal. */
  cosmeticEvery: 3,
};

export const TROOP_DRIVES: DriveTemplate[] = [
  { id: 't_minigames', stats: ['play:any'],                    emoji: '🎮', title: 'Play {n} minigames as a troop', base: 40 },
  { id: 't_wins',      stats: ['win:any'],                     emoji: '🏆', title: 'Win {n} minigames',             base: 15 },
  { id: 't_jumps',     stats: ['jump'],                        emoji: '🦘', title: 'Jump {n} times',                base: 800 },
  { id: 't_rides',     stats: ['ride:zipline', 'ride:glider'], emoji: '🚡', title: 'Ride the zipline or glider {n} times', base: 30 },
  { id: 't_chat',      stats: ['chat'],                        emoji: '💬', title: 'Chat {n} times around camp',    base: 120 },
  { id: 't_dodgeball', stats: ['play:dodgeball'],              emoji: '🏐', title: 'Play {n} games of Dodge Ball',  base: 12 },
  { id: 't_sumo',      stats: ['play:sumo'],                   emoji: '🌶️', title: 'Play {n} Sumo matches',        base: 12 },
  { id: 't_logs',      stats: ['play:logCourse'],              emoji: '🪵', title: 'Run the Log Course {n} times',  base: 12 },
  { id: 't_lunch',     stats: ['play:lunchDelivery'],          emoji: '🥪', title: 'Help with {n} Lunch Deliveries', base: 10 },
];

/** Rewards for finishing a troop goal at `level` (0 = the troop's first goal in that slot). */
export function troopGoalReward(level: number): { beads: number; points: number; pinecones: number } {
  return { beads: 80 + 30 * level, points: 60 + 20 * level, pinecones: level % 2 === 1 ? 2 + Math.floor(level / 2) : 0 };
}

const TX = 'Scout Troop';
export const TROOP_ITEMS: Item[] = [
  { id: 'tr_scout_cap',     name: 'Scout Cap',          kind: 'hat',       rarity: 'uncommon', emoji: '🧢', exclusive: TX, blurb: 'Your troop colours, on your head.' },
  { id: 'tr_merit_sash',    name: 'Merit Badge Sash',   kind: 'necklace',  rarity: 'rare',     emoji: '🎗️', exclusive: TX, blurb: 'One badge for every drive.' },
  { id: 'tr_scout_whistle', name: 'Scout Whistle',      kind: 'toy',       rarity: 'uncommon', emoji: '📯', sound: 'whistle', exclusive: TX, blurb: 'Rally the troop!' },
  { id: 'tr_troop_hoodie',  name: 'Troop Hoodie',       kind: 'top',       rarity: 'rare',     emoji: '🧥', exclusive: TX, blurb: 'Warm, cosy, extremely official.' },
  { id: 'tr_troop_chant',   name: 'Troop Chant',        kind: 'gesture',   rarity: 'rare',     emoji: '🙌', exclusive: TX, blurb: 'Two, four, six, eight…' },
  { id: 'tr_campfire_roll', name: 'Campfire Bedroll',   kind: 'bed_style', rarity: 'epic',     emoji: '🔥', exclusive: TX, blurb: 'Rolled out by the troop fire.' },
];
registerItems(TROOP_ITEMS);

export const driveTitle = (t: DriveTemplate, target: number): string => t.title.replace('{n}', target.toLocaleString('en-US'));
