// Camp Pass content — the season's goals, its reward track and its exclusive cosmetics
// (thin code, thick content: edit these tables, camp-pass.ts and the screen stay put).
//
// Goals are LINES of steps on one stat ("Play 3 minigames" → 10 → 25 …). Stats are
// season totals, so the next step picks up where the last left off. Claiming a step
// pays pony beads + Camp Pass points; every PASS.pointsPerStamp points earns a stamp,
// and each stamp unlocks the next tier's free (and, with Premium, premium) reward.

import { registerItems, type Item } from '../inventory/items';

export type MinigameId = 'dodgeball' | 'logCourse' | 'sumo' | 'lunchDelivery';
export type RideId = 'zipline' | 'glider';

/** Everything the pass counts. `play:any` / `win:any` go up alongside the per-mode stat. */
export type StatId =
  | 'play:any' | `play:${MinigameId}`
  | 'win:any' | `win:${MinigameId}`
  | `ride:${RideId}`
  | 'jump' | 'chat' | 'mail' | 'care_package';

export const MINIGAME_NAMES: Record<MinigameId, string> = {
  dodgeball: 'Dodge Ball', logCourse: 'the Log Course', sumo: 'Sumo', lunchDelivery: 'Lunch Delivery',
};

export const PASS = {
  season: 'Season 1 · Summer of Chonk',
  pointsPerStamp: 100,
  /** Golden pinecones to unlock the premium track (rewards for tiers already stamped become claimable too). */
  premiumPrice: 50,
};

export interface GoalStep { target: number; points: number; beads: number; }

export interface GoalLine {
  id: string;
  stat: StatId;
  emoji: string;
  /** [singular, plural]; `{n}` is replaced with the step's target. */
  title: [string, string];
  steps: GoalStep[];
}

const steps = (targets: number[], points: number[], beads: number[]): GoalStep[] =>
  targets.map((target, i) => ({ target, points: points[i], beads: beads[i] }));

export const GOALS: GoalLine[] = [
  { id: 'play_any', stat: 'play:any', emoji: '🎮', title: ['Play a minigame', 'Play {n} minigames'],
    steps: steps([1, 5, 15, 30, 60], [60, 100, 150, 200, 300], [20, 40, 60, 80, 120]) },
  { id: 'win_any', stat: 'win:any', emoji: '🏆', title: ['Win a minigame', 'Win {n} minigames'],
    steps: steps([1, 5, 15, 30], [80, 120, 200, 300], [25, 50, 80, 120]) },
  { id: 'play_dodgeball', stat: 'play:dodgeball', emoji: '🏐', title: ['Play Dodge Ball', 'Play Dodge Ball {n} times'],
    steps: steps([1, 5, 15], [50, 100, 150], [15, 30, 50]) },
  { id: 'win_dodgeball', stat: 'win:dodgeball', emoji: '🥇', title: ['Win a game of Dodge Ball', 'Win Dodge Ball {n} times'],
    steps: steps([1, 3, 10], [80, 120, 200], [25, 40, 70]) },
  { id: 'play_logCourse', stat: 'play:logCourse', emoji: '🪵', title: ['Try the Log Course', 'Try the Log Course {n} times'],
    steps: steps([1, 5, 15], [50, 100, 150], [15, 30, 50]) },
  { id: 'win_logCourse', stat: 'win:logCourse', emoji: '🐸', title: ['Finish the Log Course', 'Finish the Log Course {n} times'],
    steps: steps([1, 3, 10], [80, 120, 200], [25, 40, 70]) },
  { id: 'play_sumo', stat: 'play:sumo', emoji: '🌶️', title: ['Play Sumo', 'Play Sumo {n} times'],
    steps: steps([1, 5, 15], [50, 100, 150], [15, 30, 50]) },
  { id: 'win_sumo', stat: 'win:sumo', emoji: '💪', title: ['Win a Sumo match', 'Win {n} Sumo matches'],
    steps: steps([1, 3, 10], [80, 120, 200], [25, 40, 70]) },
  { id: 'play_lunch', stat: 'play:lunchDelivery', emoji: '🥪', title: ['Help with a Lunch Delivery', 'Help with {n} Lunch Deliveries'],
    steps: steps([1, 5, 15], [50, 100, 150], [15, 30, 50]) },
  { id: 'win_lunch', stat: 'win:lunchDelivery', emoji: '🧺', title: ['Deliver lunch to the picnic', 'Deliver lunch {n} times'],
    steps: steps([1, 3, 10], [80, 120, 200], [25, 40, 70]) },
  { id: 'ride_zipline', stat: 'ride:zipline', emoji: '🚡', title: ['Ride the zipline', 'Ride the zipline {n} times'],
    steps: steps([1, 5, 15], [50, 80, 120], [15, 25, 40]) },
  { id: 'ride_glider', stat: 'ride:glider', emoji: '🪁', title: ['Fly the hang glider', 'Fly the hang glider {n} times'],
    steps: steps([1, 5, 15], [50, 80, 120], [15, 25, 40]) },
  { id: 'jump', stat: 'jump', emoji: '🦘', title: ['Jump', 'Jump {n} times'],
    steps: steps([50, 250, 1000], [40, 80, 150], [10, 25, 50]) },
  { id: 'chat', stat: 'chat', emoji: '💬', title: ['Say hi in chat', 'Chat {n} times'],
    steps: steps([5, 25, 100], [40, 80, 150], [10, 25, 50]) },
  { id: 'mail', stat: 'mail', emoji: '📬', title: ['Check your Camp Mail', 'Check your Camp Mail {n} days'],
    steps: steps([1, 3, 7], [50, 100, 200], [15, 30, 60]) },
  { id: 'care_package', stat: 'care_package', emoji: '📦', title: ['Open a Care Package', 'Open {n} Care Packages'],
    steps: steps([1, 5, 15], [60, 120, 200], [20, 40, 70]) },
];

export function goalTitle(g: GoalLine, step: GoalStep): string {
  return (step.target === 1 ? g.title[0] : g.title[1]).replace('{n}', String(step.target));
}

// ── Exclusive cosmetics ─────────────────────────────────────────────────────

const X = 'Camp Pass';
export const CAMP_PASS_ITEMS: Item[] = [
  // Camp spot: tents + beds (type, material, colour).
  { id: 'cp_tent_teepee',       name: 'Teepee Tent',          kind: 'tent_style',    rarity: 'rare',      emoji: '⛺', exclusive: X, blurb: 'Tall, pointy, perfect for storytime.' },
  { id: 'cp_tent_stargazer',    name: 'Stargazer Dome',       kind: 'tent_style',    rarity: 'legendary', emoji: '🔭', exclusive: X, blurb: 'A see-through roof for counting stars.' },
  { id: 'cp_tent_patchwork',    name: 'Patchwork Canvas',     kind: 'tent_material', rarity: 'uncommon',  emoji: '🧵', exclusive: X, blurb: 'Stitched from every old camp T-shirt.' },
  { id: 'cp_tent_sunset',       name: 'Sunset Stripe Tent',   kind: 'tent_colour',   rarity: 'rare',      swatch: ['#ffb36b', '#ff7aa2'], exclusive: X, blurb: 'Golden hour, all day long.' },
  { id: 'cp_bed_hammock',       name: 'Lakeside Hammock',     kind: 'bed_style',     rarity: 'rare',      emoji: '🪢', exclusive: X, blurb: 'Swing yourself to sleep.' },
  { id: 'cp_bed_cloud',         name: 'Cloud Pillow Pile',    kind: 'bed_style',     rarity: 'epic',      emoji: '☁️', exclusive: X, blurb: 'Softer than a marshmallow.' },
  { id: 'cp_bed_flannel',       name: 'Cozy Flannel',         kind: 'bed_material',  rarity: 'uncommon',  emoji: '🧣', exclusive: X, blurb: 'Warm on chilly lake nights.' },
  { id: 'cp_bed_mint',          name: 'Mint Chip Sleeping Bag', kind: 'bed_colour',  rarity: 'uncommon',  swatch: ['#7ee8c1', '#5b3a24'], exclusive: X, blurb: 'Smells faintly of ice cream.' },
  // Headwear.
  { id: 'cp_hat_backwards',     name: 'Backwards Cap',        kind: 'hat', rarity: 'common',   emoji: '🧢', exclusive: X, blurb: 'Worn backwards. No cap.' },
  { id: 'cp_hat_propeller',     name: 'Propeller Beanie',     kind: 'hat', rarity: 'uncommon', emoji: '🚁', exclusive: X, blurb: 'Achieves liftoff at top speed (it does not).' },
  // Toys (tap one in your Backpack to play it).
  { id: 'cp_toy_clapper',       name: 'Hand Clapper',         kind: 'toy', rarity: 'common',   emoji: '👏', sound: 'clap',   exclusive: X, blurb: 'Applause on demand. Mostly for yourself.' },
  { id: 'cp_toy_slide_whistle', name: 'Slide Whistle',        kind: 'toy', rarity: 'uncommon', emoji: '🪈', sound: 'slide',  exclusive: X, blurb: 'The official sound of falling off the log course.' },
  { id: 'cp_toy_rubber_chicken', name: 'Rubber Chicken',      kind: 'toy', rarity: 'rare',     emoji: '🐔', sound: 'scream', exclusive: X, blurb: 'Squeeze for instant regret.' },
  { id: 'cp_toy_ducky',         name: 'Rubber Ducky',         kind: 'toy', rarity: 'common',   emoji: '🦆', sound: 'squeak', exclusive: X, blurb: 'Squeak squeak!' },
  { id: 'cp_toy_maraca',        name: 'Camp Maraca',          kind: 'toy', rarity: 'common',   emoji: '🪇', sound: 'rattle', exclusive: X, blurb: 'Shake it at the campfire.' },
  { id: 'cp_toy_kazoo',         name: 'Kazoo',                kind: 'toy', rarity: 'uncommon', emoji: '🎺', sound: 'kazoo',  exclusive: X, blurb: 'Every song is better on kazoo.' },
  { id: 'cp_toy_cowbell',       name: 'Cowbell',              kind: 'toy', rarity: 'rare',     emoji: '🔔', sound: 'bell',   exclusive: X, blurb: 'Needs more of it.' },
  // Wearables.
  { id: 'cp_hat_bucket',        name: 'Bucket Hat',           kind: 'hat',      rarity: 'common',   emoji: '👒', exclusive: X, blurb: 'Keeps the sun (and bugs) off.' },
  { id: 'cp_hat_frog_beanie',   name: 'Froggy Beanie',        kind: 'hat',      rarity: 'epic',     emoji: '🐸', exclusive: X, blurb: 'Ribbit.' },
  { id: 'cp_wrist_friendship',  name: 'Friendship Bracelet',  kind: 'wrist',    rarity: 'common',   emoji: '🧶', exclusive: X, blurb: 'Made one for every cabinmate.' },
  { id: 'cp_neck_pony',         name: 'Pony Bead Necklace',   kind: 'necklace', rarity: 'uncommon', emoji: '📿', exclusive: X, blurb: 'Every colour of bead in camp.' },
  { id: 'cp_bag_backpack',      name: 'Mini Backpack',        kind: 'bag',      rarity: 'rare',     emoji: '🎒', exclusive: X, blurb: 'Snacks. Mostly snacks.' },
  { id: 'cp_shoes_hiking',      name: 'Trail Boots',          kind: 'shoes',    rarity: 'uncommon', emoji: '🥾', exclusive: X, blurb: 'Muddy in all the right places.' },
  { id: 'cp_shoes_lightup',     name: 'Light-Up Sneakers',    kind: 'shoes',    rarity: 'epic',     emoji: '👟', exclusive: X, blurb: 'Blink blink blink.' },
  { id: 'cp_top_camp_tee',      name: 'Camp Chonkton Tee',    kind: 'top',      rarity: 'common',   emoji: '👕', exclusive: X, blurb: 'Official. Slightly too big.' },
  { id: 'cp_top_puffy_vest',    name: 'Puffy Vest',           kind: 'top',      rarity: 'rare',     emoji: '🦺', exclusive: X, blurb: 'Extra puff for extra chonk.' },
  { id: 'cp_bottom_cargo',      name: 'Cargo Shorts',         kind: 'bottom',   rarity: 'uncommon', emoji: '🩳', exclusive: X, blurb: 'So. Many. Pockets.' },
  // Ninja set (collected across the season; the katana is the premium grail).
  { id: 'cp_hat_ninja_band',    name: 'Ninja Headband',       kind: 'hat',       rarity: 'uncommon', emoji: '🥷', exclusive: X, blurb: 'Believe it.' },
  { id: 'cp_shoes_tabi',        name: 'Split-Toe Tabi',       kind: 'shoes',     rarity: 'rare',     emoji: '🦶', exclusive: X, blurb: 'Silent on the dock. Loud in the Canteen.' },
  { id: 'cp_top_ninja_gi',      name: 'Ninja Gi',             kind: 'top',       rarity: 'rare',     emoji: '🥋', exclusive: X, blurb: 'Hands behind you. Run like it.' },
  { id: 'cp_acc_katana',        name: 'Ninja Sword',          kind: 'accessory', rarity: 'epic',     emoji: '⚔️', exclusive: X, blurb: 'Worn on the back. Makes you 40% faster (in your heart).' },
  // Emotes.
  { id: 'cp_dance_shuffle',     name: 'Campfire Shuffle',     kind: 'dance',   rarity: 'rare',     emoji: '🕺', exclusive: X, blurb: 'Left, right, marshmallow.' },
  { id: 'cp_dance_wiggle',      name: 'Wiggle Wobble',        kind: 'dance',   rarity: 'epic',     emoji: '💃', exclusive: X, blurb: 'Jelly-belly approved.' },
  { id: 'cp_gesture_thumbs',    name: 'Thumbs Up',            kind: 'gesture', rarity: 'common',   emoji: '👍', exclusive: X, blurb: 'Nice one, camper.' },
  { id: 'cp_gesture_heart',     name: 'Heart Hands',          kind: 'gesture', rarity: 'uncommon', emoji: '🫶', exclusive: X, blurb: 'Camp love.' },
];
registerItems(CAMP_PASS_ITEMS);

// ── Reward track ────────────────────────────────────────────────────────────

export type PassReward =
  | { kind: 'beads'; amount: number }
  | { kind: 'pinecones'; amount: number }
  | { kind: 'care_package'; count: number }
  | { kind: 'item'; id: string };

const beads = (amount: number): PassReward => ({ kind: 'beads', amount });
const cones = (amount: number): PassReward => ({ kind: 'pinecones', amount });
const pkg = (count = 1): PassReward => ({ kind: 'care_package', count });
const item = (id: string): PassReward => ({ kind: 'item', id });

/** Tier N (1-based) = index N-1. Every stamp unlocks one tier. */
export const TIERS: { free: PassReward; premium: PassReward }[] = [
  { free: beads(50),                    premium: item('cp_hat_bucket') },
  { free: item('cp_gesture_thumbs'),    premium: item('cp_hat_propeller') },
  { free: item('cp_hat_backwards'),     premium: item('cp_toy_ducky') },
  { free: cones(2),                     premium: item('cp_top_camp_tee') },
  { free: pkg(),                        premium: pkg() },
  { free: item('cp_hat_ninja_band'),    premium: item('cp_tent_teepee') },
  { free: item('cp_toy_maraca'),        premium: item('cp_tent_patchwork') },
  { free: item('cp_toy_clapper'),       premium: cones(10) },
  { free: item('cp_bed_mint'),          premium: item('cp_bed_hammock') },
  { free: pkg(),                        premium: item('cp_dance_shuffle') },
  { free: item('cp_toy_slide_whistle'), premium: item('cp_shoes_hiking') },
  { free: item('cp_wrist_friendship'),  premium: item('cp_bottom_cargo') },
  { free: item('cp_shoes_tabi'),        premium: item('cp_toy_kazoo') },
  { free: cones(3),                     premium: item('cp_neck_pony') },
  { free: pkg(),                        premium: pkg(2) },
  { free: item('cp_tent_sunset'),       premium: item('cp_bag_backpack') },
  { free: item('cp_bed_flannel'),       premium: item('cp_top_ninja_gi') },
  { free: item('cp_gesture_heart'),     premium: item('cp_acc_katana') },
  { free: beads(250),                   premium: item('cp_hat_frog_beanie') },
  { free: pkg(),                        premium: item('cp_top_puffy_vest') },
  { free: item('cp_toy_cowbell'),       premium: item('cp_shoes_lightup') },
  { free: item('cp_toy_rubber_chicken'), premium: item('cp_dance_wiggle') },
  { free: cones(5),                     premium: pkg(3) },
  { free: beads(400),                   premium: item('cp_bed_cloud') },
  { free: pkg(2),                       premium: item('cp_tent_stargazer') },
];
