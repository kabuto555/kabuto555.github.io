// Merit Badges (our achievements) — WoW-style, permanent, earned once and sewn onto your
// sash. Thin code, thick content: add a badge here and achievements.ts + the sash screen
// pick it up.
//
// A badge is earned by one of:
//   stat — a lifetime counter reaching a target (jumps, metres walked, minigame wins…). Every
//          Camp Pass stat feeds in (as lifetime totals — the pass's own counts reset each
//          season), plus a few of our own (walk_m, swim_m, toy…) and derived ones (below).
//   flag — a one-time thing happening (found a camp location, joined a scout troop…).
// Series (Hiker I / II / III) are separate badges on the same stat with a `tier`.

import { TIERS, type StatId } from '../camp-pass/content';

/** Places in camp that are "discovered" the first time you walk up to them (main.ts places them). */
export type LocationId =
  | 'plaza' | 'canteen' | 'corner' | 'troop_hq' | 'photo_booth' | 'campfire' | 'dock'
  | 'dodgeball' | 'sumo' | 'log_course' | 'lunch' | 'zipline' | 'glider' | 'beach' | 'meadow';

export interface CampLocation { id: LocationId; name: string; emoji: string; /** Discovery radius (world units ≈ m). */ radius: number; }

export const LOCATIONS: CampLocation[] = [
  { id: 'plaza',       name: 'Camp Plaza',        emoji: '⛩️', radius: 10 },
  { id: 'canteen',     name: 'The Canteen',       emoji: '🍿', radius: 8 },
  { id: 'corner',      name: 'Mail Corner',       emoji: '📬', radius: 8 },
  { id: 'troop_hq',    name: 'Troop HQ',          emoji: '⛺', radius: 8 },
  { id: 'photo_booth', name: 'Photo Booth',       emoji: '📸', radius: 8 },
  { id: 'campfire',    name: 'Campfire Circle',   emoji: '🔥', radius: 10 },
  { id: 'dock',        name: 'The Dock',          emoji: '🛶', radius: 9 },
  { id: 'dodgeball',   name: 'Dodge Ball Court',  emoji: '🏐', radius: 9 },
  { id: 'sumo',        name: 'Sumo Ring',         emoji: '🤼', radius: 9 },
  { id: 'log_course',  name: 'Log Course',        emoji: '🪵', radius: 9 },
  { id: 'lunch',       name: 'Lunch Hub',         emoji: '🍔', radius: 9 },
  { id: 'zipline',     name: 'Zipline Tower',     emoji: '🚡', radius: 8 },
  { id: 'glider',      name: 'Glider Cliff',      emoji: '🪁', radius: 8 },
  { id: 'beach',       name: 'Beach Picnic',      emoji: '🏖️', radius: 14 },
  { id: 'meadow',      name: 'Trailhead Meadow',  emoji: '🌲', radius: 14 },
];

/** Our own lifetime counters (on top of every Camp Pass stat). */
export type OwnStatId = 'walk_m' | 'swim_m' | 'toy' | 'emote' | 'photo' | 'splash' | 'spring' | 'ring_out';
/** Worked out on the fly rather than counted. */
export type DerivedStatId = 'discovered' | 'badges' | 'pass_stamps';
export type AchStatId = StatId | OwnStatId | DerivedStatId;

export type FlagId = `discover:${LocationId}` | 'troop_join' | 'troop_found' | 'premium_pass' | 'cannonball' | 'big_drop';

export type Criteria = { kind: 'stat'; stat: AchStatId; target: number } | { kind: 'flag'; flag: FlagId };

export type BadgeCategory = 'explorer' | 'athlete' | 'games' | 'social' | 'camp';

/** Sash sections, in order. `felt` = the patch's middle, `rim` = its stitched border. */
export const CATEGORIES: Record<BadgeCategory, { label: string; felt: string; rim: string }> = {
  explorer: { label: 'Explorer',   felt: '#4f9a52', rim: '#2f5f31' },
  athlete:  { label: 'Athletics',  felt: '#e0613f', rim: '#8e3220' },
  games:    { label: 'Camp Games', felt: '#3f8fd6', rim: '#22557f' },
  social:   { label: 'Fellowship', felt: '#9a64d8', rim: '#5a3486' },
  camp:     { label: 'Camp Life',  felt: '#e6a83a', rim: '#8f5f12' },
};
export const CATEGORY_ORDER: BadgeCategory[] = ['explorer', 'athlete', 'games', 'social', 'camp'];

export interface Badge {
  id: string;
  name: string;
  /** How you earn it (shown on the badge card; a secret badge's is hidden until earned). */
  blurb: string;
  emoji: string;
  category: BadgeCategory;
  /** Merit points (the sash's total — like achievement points). */
  points: number;
  criteria: Criteria;
  /** 1 / 2 / 3 → bronze / silver / gold stars on a series badge. */
  tier?: 1 | 2 | 3;
  /** Shows as a "?" patch until earned. */
  secret?: boolean;
}

const stat = (s: AchStatId, target: number): Criteria => ({ kind: 'stat', stat: s, target });
const flag = (f: FlagId): Criteria => ({ kind: 'flag', flag: f });

/** A I / II / III series on one stat. */
function series(id: string, name: string, emoji: string, category: BadgeCategory, s: AchStatId,
  steps: { target: number; points: number; blurb: string }[]): Badge[] {
  const roman = ['I', 'II', 'III'];
  return steps.map((st, i) => ({
    id: `${id}_${i + 1}`, name: `${name} ${roman[i]}`, blurb: st.blurb, emoji, category, points: st.points,
    criteria: stat(s, st.target), tier: (i + 1) as 1 | 2 | 3,
  }));
}

export const BADGES: Badge[] = [
  // ── Explorer ─────────────────────────────────────────────────────────────
  ...LOCATIONS.map((l): Badge => ({
    id: `discover_${l.id}`, name: l.name, blurb: `Discover ${l.name}.`, emoji: l.emoji, category: 'explorer',
    points: 5, criteria: flag(`discover:${l.id}`),
  })),
  { id: 'trailblazer', name: 'Trailblazer', blurb: 'Discover every spot in camp.', emoji: '🧭', category: 'explorer',
    points: 25, criteria: stat('discovered', LOCATIONS.length) },
  ...series('hiker', 'Hiker', '🥾', 'explorer', 'walk_m', [
    { target: 1000, points: 10, blurb: 'Walk or run 1 km around camp.' },
    { target: 10000, points: 20, blurb: 'Walk or run 10 km around camp.' },
    { target: 42195, points: 40, blurb: 'Walk or run a whole marathon (42.2 km).' },
  ]),
  ...series('swimmer', 'Swimmer', '🏊', 'explorer', 'swim_m', [
    { target: 100, points: 10, blurb: 'Swim 100 m.' },
    { target: 1000, points: 20, blurb: 'Swim 1 km.' },
    { target: 5000, points: 30, blurb: 'Swim 5 km. Gills pending.' },
  ]),

  // ── Athletics ────────────────────────────────────────────────────────────
  ...series('jumper', 'Hopper', '🦘', 'athlete', 'jump', [
    { target: 100, points: 10, blurb: 'Jump 100 times.' },
    { target: 1000, points: 20, blurb: 'Jump 1,000 times.' },
    { target: 10000, points: 40, blurb: 'Jump 10,000 times. Your knees salute you.' },
  ]),
  { id: 'zipline_1', name: 'Zip Rider', blurb: 'Ride the zipline.', emoji: '🚡', category: 'athlete', points: 10,
    criteria: stat('ride:zipline', 1) },
  { id: 'zipline_25', name: 'Zip Master', blurb: 'Ride the zipline 25 times.', emoji: '⚡', category: 'athlete', points: 20,
    criteria: stat('ride:zipline', 25), tier: 2 },
  { id: 'glider_1', name: 'Aviator', blurb: 'Fly the hang glider.', emoji: '🪁', category: 'athlete', points: 10,
    criteria: stat('ride:glider', 1) },
  { id: 'glider_25', name: 'Sky Captain', blurb: 'Fly the hang glider 25 times.', emoji: '🦅', category: 'athlete', points: 20,
    criteria: stat('ride:glider', 25), tier: 2 },
  { id: 'big_drop', name: 'Leap of Faith', blurb: 'Take a really big drop off a ledge.', emoji: '🪂', category: 'athlete',
    points: 15, criteria: flag('big_drop'), secret: true },
  { id: 'cannonball', name: 'Cannonball!', blurb: 'Leap into the lake from way up high.', emoji: '💦', category: 'athlete',
    points: 15, criteria: flag('cannonball'), secret: true },

  // ── Camp Games ───────────────────────────────────────────────────────────
  ...series('player', 'Game On', '🎮', 'games', 'play:any', [
    { target: 10, points: 10, blurb: 'Play 10 minigames.' },
    { target: 50, points: 20, blurb: 'Play 50 minigames.' },
    { target: 200, points: 40, blurb: 'Play 200 minigames.' },
  ]),
  ...series('winner', 'Champion', '🏆', 'games', 'win:any', [
    { target: 1, points: 10, blurb: 'Win a minigame.' },
    { target: 25, points: 25, blurb: 'Win 25 minigames.' },
    { target: 100, points: 50, blurb: 'Win 100 minigames.' },
  ]),
  { id: 'win_dodgeball', name: 'Dodge Ball Ace', blurb: 'Win a game of Dodge Ball.', emoji: '🏐', category: 'games', points: 10,
    criteria: stat('win:dodgeball', 1) },
  { id: 'win_dodgeball_10', name: 'Untouchable', blurb: 'Win Dodge Ball 10 times.', emoji: '🥇', category: 'games', points: 20,
    criteria: stat('win:dodgeball', 10), tier: 2 },
  { id: 'win_logCourse', name: 'Log Roller', blurb: 'Finish the Log Course.', emoji: '🪵', category: 'games', points: 10,
    criteria: stat('win:logCourse', 1) },
  { id: 'win_logCourse_10', name: 'River Runner', blurb: 'Finish the Log Course 10 times.', emoji: '🐸', category: 'games', points: 20,
    criteria: stat('win:logCourse', 10), tier: 2 },
  { id: 'win_sumo', name: 'Sumo Star', blurb: 'Win a Sumo match.', emoji: '🌶️', category: 'games', points: 10,
    criteria: stat('win:sumo', 1) },
  { id: 'win_sumo_10', name: 'Yokozuna', blurb: 'Win 10 Sumo matches.', emoji: '💪', category: 'games', points: 20,
    criteria: stat('win:sumo', 10), tier: 2 },
  { id: 'win_lunch', name: 'Lunch Hero', blurb: 'Deliver lunch to the picnic.', emoji: '🥪', category: 'games', points: 10,
    criteria: stat('win:lunchDelivery', 1) },
  { id: 'win_lunch_10', name: 'Meals on Wheels', blurb: 'Deliver lunch 10 times.', emoji: '🧺', category: 'games', points: 20,
    criteria: stat('win:lunchDelivery', 10), tier: 2 },
  { id: 'springs', name: 'Boing Boing', blurb: 'Launch off 25 spring pads on the Log Course.', emoji: '🌀', category: 'games',
    points: 15, criteria: stat('spring', 25) },
  { id: 'ring_outs', name: 'Pushover', blurb: 'Knock 25 chonks out of the Sumo ring.', emoji: '🫸', category: 'games',
    points: 15, criteria: stat('ring_out', 25) },
  { id: 'splashes', name: 'Soggy Chonk', blurb: 'Fall in the river 50 times.', emoji: '🫧', category: 'games',
    points: 10, criteria: stat('splash', 50), secret: true },

  // ── Fellowship ───────────────────────────────────────────────────────────
  { id: 'troop_join', name: 'Troop Member', blurb: 'Join a scout troop.', emoji: '🎖️', category: 'social', points: 10,
    criteria: flag('troop_join') },
  { id: 'troop_found', name: 'Troop Leader', blurb: 'Found your own scout troop.', emoji: '🚩', category: 'social', points: 20,
    criteria: flag('troop_found') },
  ...series('chatter', 'Chatterbox', '💬', 'social', 'chat', [
    { target: 10, points: 10, blurb: 'Chat 10 times.' },
    { target: 100, points: 20, blurb: 'Chat 100 times.' },
    { target: 500, points: 30, blurb: 'Chat 500 times.' },
  ]),
  { id: 'emotes', name: 'Showboat', blurb: 'Emote 25 times.', emoji: '🥳', category: 'social', points: 10,
    criteria: stat('emote', 25) },
  { id: 'toys', name: 'Noisemaker', blurb: 'Play with your toys 50 times.', emoji: '🦆', category: 'social', points: 10,
    criteria: stat('toy', 50) },
  { id: 'photo_1', name: 'Say Cheese', blurb: 'Get snapped by Mr Kodak.', emoji: '📷', category: 'social', points: 10,
    criteria: stat('photo', 1) },
  { id: 'photo_25', name: 'Camp Celebrity', blurb: 'Get snapped by Mr Kodak 25 times.', emoji: '🌟', category: 'social', points: 20,
    criteria: stat('photo', 25), tier: 2 },

  // ── Camp Life ────────────────────────────────────────────────────────────
  { id: 'mail_7', name: 'Pen Pal', blurb: 'Check your Camp Mail 7 days.', emoji: '📬', category: 'camp', points: 10,
    criteria: stat('mail', 7) },
  { id: 'mail_30', name: 'Postmaster', blurb: 'Check your Camp Mail 30 days.', emoji: '📮', category: 'camp', points: 25,
    criteria: stat('mail', 30), tier: 2 },
  { id: 'care_1', name: 'Special Delivery', blurb: 'Open a Care Package.', emoji: '📦', category: 'camp', points: 10,
    criteria: stat('care_package', 1) },
  { id: 'care_25', name: 'Package Hoarder', blurb: 'Open 25 Care Packages.', emoji: '🎁', category: 'camp', points: 25,
    criteria: stat('care_package', 25), tier: 2 },
  { id: 'stamps_10', name: 'Stamp Collector', blurb: 'Earn 10 Camp Pass stamps in a season.', emoji: '🏕️', category: 'camp',
    points: 15, criteria: stat('pass_stamps', 10) },
  { id: 'stamps_25', name: 'Camp Legend', blurb: 'Complete a whole Camp Pass.', emoji: '👑', category: 'camp', points: 40,
    criteria: stat('pass_stamps', TIERS.length), tier: 3 },
  { id: 'premium_pass', name: 'Golden Ticket', blurb: 'Unlock the Camp Pass Premium track.', emoji: '🎟️', category: 'camp',
    points: 10, criteria: flag('premium_pass') },
  ...series('merit', 'Merit Scout', '⭐', 'camp', 'badges', [
    { target: 10, points: 10, blurb: 'Earn 10 merit badges.' },
    { target: 30, points: 25, blurb: 'Earn 30 merit badges.' },
    { target: 60, points: 50, blurb: 'Earn 60 merit badges. Eagle Chonk!' },
  ]),
];

export const badgeById = (id: string): Badge | undefined => BADGES.find((b) => b.id === id);

/** Scout rank by badges earned (the title on your sash). */
export const RANKS: { at: number; title: string }[] = [
  { at: 0, title: 'Tenderfoot' },
  { at: 5, title: 'Second Class' },
  { at: 12, title: 'First Class' },
  { at: 20, title: 'Star Scout' },
  { at: 32, title: 'Life Scout' },
  { at: 50, title: 'Eagle Chonk' },
];

export function rankFor(earned: number): { title: string; next: { at: number; title: string } | null } {
  let i = 0;
  while (i + 1 < RANKS.length && earned >= RANKS[i + 1].at) i++;
  return { title: RANKS[i].title, next: RANKS[i + 1] ?? null };
}
