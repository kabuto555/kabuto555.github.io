// Camp Care Package — the INVENTORY SHEET of everything a package can contain
// (thin code, thick content: edit this table, the screens stay untouched).
//
// Rewards are placeholders until real art lands: drop a PNG (square, transparent,
// ~512 px) at  assets/ui/rewards/<id>.png  and it replaces the generated
// placeholder automatically. Characters already use their chonk portrait.
// See assets/ui/rewards/README.md for the full filename list.

import { KIND_INFO, registerItems, type Item, type ItemKind } from '../inventory/items';

export type RewardKind = ItemKind;
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** A Care Package reward is just a catalog item (inventory/items.ts). */
export type Reward = Item;

/** Troop gear recolours your Troop HQ in camp (troop-style.ts). */
export const isTroopGear = (r: Reward): boolean => r.kind === 'pennant' || r.kind === 'tent';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_INFO: Record<Rarity, {
  label: string;
  /** Roll weight (relative). Legendary ≈ 1.25% — characters and a few grails are extremely rare
   * (nudged up from 1 as the legendary pool grew, so each character keeps its ~0.14% odds). */
  weight: number;
  /** Glow / ribbon colour. */
  color: string;
  /** Darker rim for the UI ribbon. */
  rim: string;
  /** Pony beads (soft currency) given back when you already own the item. */
  dupeBeads: number;
  /** Opening-animation intensity, 0 (a polite pop) … 4 (the whole show). */
  intensity: number;
}> = {
  common:    { label: 'Common',    weight: 50, color: '#8fd16a', rim: '#4f8f33', dupeBeads: 5,   intensity: 0 },
  uncommon:  { label: 'Uncommon',  weight: 28, color: '#4fc3e8', rim: '#2a7fa3', dupeBeads: 10,  intensity: 1 },
  rare:      { label: 'Rare',      weight: 15, color: '#5b7cff', rim: '#3246b0', dupeBeads: 20,  intensity: 2 },
  epic:      { label: 'Epic',      weight: 6,  color: '#b35cff', rim: '#6d2aa8', dupeBeads: 40,  intensity: 3 },
  legendary: { label: 'Legendary', weight: 1.25,color: '#ffc629', rim: '#b27a00', dupeBeads: 100, intensity: 4 },
};

export const KIND_LABEL = Object.fromEntries(
  Object.entries(KIND_INFO).map(([k, v]) => [k, v.label])) as Record<RewardKind, string>;

/** A free Care Package (Camp Pass reward): the Care Package screen opens one instead of taking pinecones. */
export const CARE_PACKAGE_TOKEN: Item = {
  id: 'token_care_package', name: 'Camp Care Package', kind: 'token', rarity: 'rare', emoji: '📦',
  blurb: 'A free Care Package — open it at the Canteen!',
};

export const CARE_PACKAGE = {
  /** Golden pinecones (premium currency) per package (≈ $0.99 at the small-pack rate). */
  price: 10,
  /** Pity: at most this many opens in a row without Epic or better. */
  pityEvery: 20,
  /** Golden pinecones handed out instead once every Care Package item is collected. */
  allCollectedPinecones: 15,
};

/** Everything a Camp Care Package can roll. Rarity decides the odds (RARITY_INFO.weight),
 * then an item is picked evenly within that rarity. */
export const CARE_PACKAGE_REWARDS: Reward[] = [
  // ── Accessories + headwear (common → rare). Ids keep their acc_ prefix (saves use them). ──
  { id: 'acc_acorn_cap',       name: 'Acorn Cap',            kind: 'hat', rarity: 'common',   emoji: '🌰', blurb: 'Fell off a tree. Fits perfectly.' },
  { id: 'acc_neckerchief',     name: 'Scout Neckerchief',    kind: 'accessory', rarity: 'common',   emoji: '🧣', blurb: 'Regulation issue, slightly chewed.' },
  { id: 'acc_camp_visor',      name: 'Camp Visor',           kind: 'hat', rarity: 'common',   emoji: '🧢', blurb: 'For squinting at the lake.' },
  { id: 'acc_marshmallow',     name: 'Marshmallow Stick',    kind: 'accessory', rarity: 'common',   emoji: '🍡', blurb: 'Perfectly toasted. Do not eat.' },
  { id: 'acc_bug_goggles',     name: 'Bug-Eye Goggles',      kind: 'accessory', rarity: 'uncommon', emoji: '🥽', blurb: 'See the world like a dragonfly.' },
  { id: 'acc_paddle_pack',     name: 'Canoe Paddle Pack',    kind: 'accessory', rarity: 'uncommon', emoji: '🛶', blurb: 'Always ready for the lake.' },
  { id: 'acc_lantern_hat',     name: 'Lantern Hat',          kind: 'hat', rarity: 'uncommon', emoji: '🏮', blurb: 'Lights the way after lights-out.' },
  { id: 'acc_flower_crown',    name: 'Wildflower Crown',     kind: 'hat', rarity: 'rare',     emoji: '🌼', blurb: 'Picked from the meadow by the falls.' },
  { id: 'acc_moon_monocle',    name: 'Moon Monocle',         kind: 'accessory', rarity: 'rare',     emoji: '🧐', blurb: 'Rumoured to show where the moon went.' },

  // ── Big-brain headwear (uncommon → legendary) ──
  { id: 'hat_traffic_cone',    name: 'Traffic Cone',         kind: 'hat',       rarity: 'uncommon', emoji: '🚧', blurb: 'Road work ahead? Uh, yeah, I sure hope it does.' },
  { id: 'hat_mullet_cap',      name: 'Mullet Cap',           kind: 'hat',       rarity: 'uncommon', emoji: '🦅', blurb: 'Business in the front. Party in the back.' },
  { id: 'hat_tinfoil',         name: 'Tinfoil Hat',          kind: 'hat',       rarity: 'rare',     emoji: '🛸', blurb: "The birds can't read your thoughts now." },
  { id: 'hat_cheese_head',     name: 'Cheese Head',          kind: 'hat',       rarity: 'rare',     emoji: '🧀', blurb: 'Grate for game day. Smells like it too.' },
  { id: 'hat_crab_rave',       name: 'Crab Rave Crab',       kind: 'hat',       rarity: 'epic',     emoji: '🦀', blurb: 'He lives up there now. He is always dancing.' },
  { id: 'hat_galaxy_brain',    name: 'Galaxy Brain',         kind: 'hat',       rarity: 'legendary', emoji: '🧠', blurb: 'Big thoughts. Glowing thoughts. Mostly about snacks.' },

  // ── Noisy toys (common → epic). All synthesised (inventory/toy-sounds.ts). ──
  { id: 'toy_fidget_spinner',  name: 'Fidget Spinner',       kind: 'toy',       rarity: 'common',   emoji: '🌀', sound: 'whirr',    blurb: "It's 2017 somewhere." },
  { id: 'toy_recorder',        name: 'Squeaky Recorder',     kind: 'toy',       rarity: 'common',   emoji: '🎶', sound: 'recorder', blurb: 'Hot cross buns. Hot cross BUNS. Hot cross— *SQUEAK*' },
  { id: 'toy_goose_honker',    name: 'Angry Goose Honker',   kind: 'toy',       rarity: 'uncommon', emoji: '🪿', sound: 'honk',     blurb: 'Peace was never an option.' },
  { id: 'toy_jaw_harp',        name: 'Jaw Harp',             kind: 'toy',       rarity: 'uncommon', emoji: '🎸', sound: 'twang',    blurb: 'Doyoyoyoing.' },
  { id: 'toy_dialup_walkie',   name: 'Dial-Up Walkie',       kind: 'toy',       rarity: 'rare',     emoji: '📟', sound: 'dialup',   blurb: 'Connecting to the camp wifi… please hold for 45 minutes.' },
  { id: 'toy_triangle',        name: 'Orchestra Triangle',   kind: 'toy',       rarity: 'common',   emoji: '🔺', sound: 'ting',     blurb: 'Waits 40 minutes for one ding. Nails it.' },
  { id: 'toy_whoopee_cushion', name: 'Whoopee Cushion',      kind: 'toy',       rarity: 'uncommon', emoji: '💨', sound: 'fart',     blurb: 'Wasn\'t me.' },
  { id: 'toy_theremin',        name: 'Spooky Theremin',      kind: 'toy',       rarity: 'epic',     emoji: '👻', sound: 'theremin', blurb: 'For campfire stories that need a soundtrack.' },
  // Game toys: set up on the ground to challenge another camper (tabletop/).
  { id: 'toy_words_with_friends', name: 'Words With Friends', kind: 'toy',     rarity: 'rare',     emoji: '🔤', sound: 'tiles', game: 'words',
    blurb: 'Tip it out anywhere and challenge a camper to a word-off.' },
  { id: 'toy_dice_with_friends', name: 'Dice With Friends', kind: 'toy',       rarity: 'rare',     emoji: '🎲', sound: 'dice', game: 'dice',
    blurb: 'Five dice, one cup, zero mercy. Challenge a camper to a roll-off.' },

  // ── Drip: meme-grade tops, bottoms and kicks (common → legendary) ──
  { id: 'top_tux_tee',         name: 'Tuxedo T-Shirt',       kind: 'top',       rarity: 'common', emoji: '🤵', blurb: 'Formal enough for the talent show. Casual enough for the lake.' },
  { id: 'top_vacation_mode',   name: 'Vacation Mode Shirt',  kind: 'top',       rarity: 'uncommon', emoji: '🌺', blurb: 'Out of office. Forever.' },
  { id: 'top_this_is_fine',    name: 'This Is Fine Tee',     kind: 'top',       rarity: 'rare',     emoji: '🔥', blurb: 'Everything is under control. Probably.' },
  { id: 'top_sigma_hoodie',    name: 'Sigma Grindset Hoodie', kind: 'top',      rarity: 'rare',     emoji: '🐺', blurb: 'Up at 4am. Asleep by 4:05am.' },
  { id: 'top_drip_puffer',     name: 'Mega Drip Puffer',     kind: 'top',       rarity: 'epic',     emoji: '🧥', blurb: 'Is it a jacket or a bouncy castle? Yes.' },
  { id: 'top_hot_dog_suit',    name: 'Hot Dog Suit',         kind: 'top',       rarity: 'epic',     emoji: '🌭', blurb: "We're all trying to find the camper who did this." },
  { id: 'bot_jorts',           name: 'Jorts',                kind: 'bottom',    rarity: 'common',   emoji: '👖', blurb: 'Jeans that chose freedom.' },
  { id: 'bot_touch_grass',     name: 'Touch Grass Shorts',   kind: 'bottom',    rarity: 'uncommon', emoji: '🌱', blurb: 'Doctor-recommended. Grass-certified.' },
  { id: 'bot_business_shorts', name: 'Business Shorts',      kind: 'bottom',    rarity: 'uncommon',     emoji: '💼', blurb: 'Board meeting up top, cannonball down below.' },
  { id: 'bot_aura_tutu',       name: 'Tutu of Infinite Aura', kind: 'bottom',   rarity: 'epic',     emoji: '🩰', blurb: '+1000 aura. Every twirl.' },
  { id: 'shoe_toe_shoes',      name: 'Toe Shoes',            kind: 'shoes',     rarity: 'common',   emoji: '🦶', blurb: 'Five toes. Zero regrets. Some regrets.' },
  { id: 'shoe_crocs_socks',    name: 'Crocs & Socks',        kind: 'shoes',     rarity: 'common', emoji: '🐊', blurb: 'Strap in: sport mode activated.' },
  { id: 'shoe_heelys',         name: 'Heelys',               kind: 'shoes',     rarity: 'rare',     emoji: '🛼', blurb: 'Banned from the Canteen. Worth it.' },
  { id: 'shoe_big_red_boots',  name: 'Big Red Boots',        kind: 'shoes',     rarity: 'epic',     emoji: '👢', blurb: 'Cartoon feet, real life. Mind the log course.' },
  { id: 'shoe_air_chonkdan',   name: 'Air Chonkdan 1s',      kind: 'shoes',     rarity: 'legendary',     emoji: '👟', blurb: 'The sickest kicks at camp. Do not crease.' },

  // ── Meme armoury: fruit hats, raid-boss plate and a sword nobody can lift (common → legendary) ──
  { id: 'top_banana_suit',     name: 'Banana Suit',          kind: 'top',       rarity: 'common',   emoji: '🍌', blurb: "It's peanut butter jelly time." },
  { id: 'bot_zoom_pyjamas',    name: 'Zoom Call Pyjamas',    kind: 'bottom',    rarity: 'common',   emoji: '💤', blurb: 'Camera on from the waist up only.' },
  { id: 'acc_fanny_pack',      name: 'Fanny Pack',           kind: 'bag',       rarity: 'common',   emoji: '👛', blurb: "Dad's finest. Holds exactly one granola bar." },
  { id: 'hat_banana_peel',     name: 'Banana Peel Hat',      kind: 'hat',       rarity: 'uncommon', emoji: '🍌', blurb: 'Slippery when worn.' },
  { id: 'hat_melon_helmet',    name: 'Melon Helmet',         kind: 'hat',       rarity: 'uncommon', emoji: '🍉', blurb: 'Safety first. Snacks second. Also first.' },
  { id: 'top_stonks_tee',      name: 'Stonks Tee',           kind: 'top',       rarity: 'uncommon', emoji: '📈', blurb: 'Line goes up.' },
  { id: 'shoe_bunny_slippers', name: 'Bunny Slippers',       kind: 'shoes',     rarity: 'uncommon', emoji: '🐰', blurb: 'Built for zero-speed pursuits.' },
  { id: 'hat_let_him_cook',    name: 'Let Him Cook Hat',     kind: 'hat',       rarity: 'rare',     emoji: '👨‍🍳', blurb: "He's cooking. Nobody knows what. Let him." },
  { id: 'bot_battle_kilt',     name: 'Battle Kilt',          kind: 'bottom',    rarity: 'rare',     emoji: '🏴', blurb: 'FREEDOOOOM (to go swimming).' },
  { id: 'acc_drip_chain',      name: 'Pinecone Drip Chain',  kind: 'necklace',  rarity: 'rare',     emoji: '📿', blurb: 'Solid gold. Probably. Do not bite it.' },
  { id: 'acc_hip_sword',       name: "Hero's Hip Sword",     kind: 'accessory', rarity: 'rare',     emoji: '🗡️', blurb: "It's dangerous to go alone. Take this." },
  { id: 'hat_warchief_helm',   name: 'Warchief Helm',        kind: 'hat',       rarity: 'epic',     emoji: '🪖', blurb: 'Lok\'tar, campers.' },
  { id: 'bot_warchief_greaves', name: 'Warchief Greaves',    kind: 'bottom',    rarity: 'epic',     emoji: '🛡️', blurb: 'Clanks with every step. Sneaking is off the table.' },
  { id: 'shoe_warchief_sabatons', name: 'Warchief Sabatons', kind: 'shoes',     rarity: 'epic',     emoji: '🥾', blurb: 'Leeroy-proof toes.' },
  { id: 'top_warchief_plate',  name: 'Warchief Raid Plate',  kind: 'top',       rarity: 'legendary', emoji: '⚔️', blurb: 'Shoulder pads wider than the canoe. Worth every raid.' },
  { id: 'acc_buster_sword',    name: 'Buster Sword',         kind: 'accessory', rarity: 'legendary', emoji: '🗡️', blurb: 'Bigger than you. Not compensating for anything.' },

  // ── Lanterns for your camp spot (common → rare) ──
  { id: 'lan_tin',             name: 'Tin Camp Lantern',     kind: 'lantern',   rarity: 'common',   emoji: '🏮', glow: '#ffc36b', blurb: 'Dented, trusty, a little smoky.' },
  { id: 'lan_firefly_jar',     name: 'Firefly Jar',          kind: 'lantern',   rarity: 'uncommon', emoji: '🫙', glow: '#d8ff6b', blurb: 'They were already in there. Honest.' },
  { id: 'lan_paper_moon',      name: 'Paper Moon Lantern',   kind: 'lantern',   rarity: 'rare',     emoji: '🌕', glow: '#bcd6ff', blurb: 'A stand-in until the real moon turns up.' },

  // ── Emotes (common → rare) ──
  { id: 'emo_wave',            name: 'Big Wave',             kind: 'emote',     rarity: 'common',   emoji: '👋', blurb: 'Hi hello hey!!' },
  { id: 'emo_happy_hop',       name: 'Happy Hop',            kind: 'emote',     rarity: 'common',   emoji: '🐸', blurb: 'Boing boing boing.' },
  { id: 'emo_marshmallow',     name: 'Marshmallow Munch',    kind: 'emote',     rarity: 'common',   emoji: '😋', blurb: 'Nom.' },
  { id: 'emo_belly_flop',      name: 'Belly Flop',           kind: 'emote',     rarity: 'uncommon', emoji: '💦', blurb: 'A 10 from the judges.' },
  { id: 'emo_campfire_song',   name: 'Campfire Song',        kind: 'emote',     rarity: 'uncommon', emoji: '🎸', blurb: 'Kumbaya, chonk.' },
  { id: 'emo_chonk_wiggle',    name: 'Chonk Wiggle',         kind: 'emote',     rarity: 'uncommon', emoji: '🍑', blurb: 'Every roll jiggles.' },
  { id: 'emo_dramatic_faint',  name: 'Dramatic Faint',       kind: 'emote',     rarity: 'rare',     emoji: '😵', blurb: 'For when dodgeball gets personal.' },
  { id: 'emo_eclipse_dance',   name: 'Eclipse Dance',        kind: 'emote',     rarity: 'rare',     emoji: '🌘', blurb: 'An old camp ritual. Nobody knows why.' },

  // ── Colours (rare → epic) ──
  { id: 'col_bubblegum',       name: 'Bubblegum',            kind: 'colour',    rarity: 'rare',     swatch: '#ff8fc8', blurb: 'Pop!' },
  { id: 'col_minty',           name: 'Minty Fresh',          kind: 'colour',    rarity: 'rare',     swatch: '#7ee8c1', blurb: 'Smells like toothpaste.' },
  { id: 'col_blueberry',       name: 'Blueberry',            kind: 'colour',    rarity: 'rare',     swatch: '#5a78ff', blurb: 'Picked fresh on the trail.' },
  { id: 'col_sherbet',         name: 'Sunset Sherbet',       kind: 'colour',    rarity: 'rare',     swatch: ['#ffb36b', '#ff7aa2'], blurb: 'Two scoops.' },
  { id: 'col_lavender',        name: 'Lavender Haze',        kind: 'colour',    rarity: 'epic',     swatch: ['#c9a6ff', '#8f7bff'], blurb: 'Dreamy.' },
  { id: 'col_golden_hour',     name: 'Golden Hour',          kind: 'colour',    rarity: 'epic',     swatch: ['#ffe07a', '#ffae2b'], blurb: 'Glows like the last campfire.' },
  { id: 'col_galaxy',          name: 'Galaxy Swirl',         kind: 'colour',    rarity: 'epic',     swatch: ['#2b2a6b', '#8a4fff', '#ff6fd8'], blurb: 'Contains at least one star.' },
  { id: 'col_moonbeam',        name: 'Moonbeam',             kind: 'colour',    rarity: 'epic',     swatch: ['#f4f7ff', '#b9d4ff', '#e6c9ff'], blurb: 'A sliver of the missing moon.' },

  // ── Troop gear: pennant colours (common → epic) — recolours your Troop HQ pennant ──
  // swatch = [felt, hoist band]. Items with a shopPrice are also in the Shop's Troop tab.
  { id: 'pen_scout_red',       name: 'Scout Red Pennant',    kind: 'pennant',   rarity: 'common',   swatch: ['#d9483f', '#f3e6cf'], shopPrice: 60,  blurb: 'Classic. Loud. Proud.' },
  { id: 'pen_lake_blue',       name: 'Lake Blue Pennant',    kind: 'pennant',   rarity: 'common',   swatch: ['#3a6fa8', '#f3e6cf'], shopPrice: 60,  blurb: 'Calm as Chonk Lake at dawn.' },
  { id: 'pen_pine_green',      name: 'Pine Green Pennant',   kind: 'pennant',   rarity: 'common',   swatch: ['#3f8a4f', '#f3e6cf'], shopPrice: 60,  blurb: 'Smells faintly of forest.' },
  { id: 'pen_sunflower',       name: 'Sunflower Pennant',    kind: 'pennant',   rarity: 'uncommon', swatch: ['#f2b52c', '#7a4a1e'], shopPrice: 90,  blurb: 'Visible from the summit.' },
  { id: 'pen_grape_soda',      name: 'Grape Soda Pennant',   kind: 'pennant',   rarity: 'uncommon', swatch: ['#8158a8', '#ffd23f'], shopPrice: 90,  blurb: 'Fizzy.' },
  { id: 'pen_rainbow',         name: 'Rainbow Pennant',      kind: 'pennant',   rarity: 'rare',     swatch: ['#ff6b6b', '#ffd23f', '#6fe0a4', '#5a9bff', '#b37bff'], blurb: 'Every troop colour at once.' },
  { id: 'pen_midnight_moon',   name: 'Midnight Moon Pennant', kind: 'pennant',  rarity: 'epic',     swatch: ['#1d2458', '#f4f7ff'], blurb: 'Stitched with the missing moon.' },

  // ── Troop gear: tent colours (uncommon → epic) — recolours your Troop HQ tent ──
  { id: 'tent_campfire',       name: 'Campfire Orange Tent', kind: 'tent',      rarity: 'uncommon', swatch: '#ee7a3a', shopPrice: 150, blurb: 'Cozy. Warm. Slightly smoky.' },
  { id: 'tent_sky_blue',       name: 'Sky Blue Tent',        kind: 'tent',      rarity: 'uncommon', swatch: '#5aa9e6', shopPrice: 150, blurb: 'Naps under a clear sky.' },
  { id: 'tent_moss',           name: 'Mossy Green Tent',     kind: 'tent',      rarity: 'uncommon', swatch: '#6aa84f', shopPrice: 150, blurb: 'Blends right into the woods.' },
  { id: 'tent_bubblegum',      name: 'Bubblegum Tent',       kind: 'tent',      rarity: 'rare',     swatch: '#ff8fc8', shopPrice: 250, blurb: 'The talk of the campsite.' },
  { id: 'tent_starry_night',   name: 'Starry Night Tent',    kind: 'tent',      rarity: 'epic',     swatch: ['#2b2a6b', '#8a4fff'], blurb: 'Stargazing, indoors.' },
  { id: 'tent_golden',         name: 'Golden Pinecone Tent', kind: 'tent',      rarity: 'epic',     swatch: ['#ffe07a', '#e0a010'], blurb: 'Only the fanciest troops.' },

  // ── Characters (legendary — extremely rare) ──
  { id: 'chr_george',          name: 'George',               kind: 'character', rarity: 'legendary', chonk: 'george',   blurb: 'A brand-new camper joins your cabin!' },
  { id: 'chr_chippy',          name: 'Chippy',               kind: 'character', rarity: 'legendary', chonk: 'chippy',   blurb: 'A brand-new camper joins your cabin!' },
  { id: 'chr_peppy',           name: 'Peppy',                kind: 'character', rarity: 'legendary', chonk: 'peppy',    blurb: 'A brand-new camper joins your cabin!' },
  { id: 'chr_hedgehog',        name: 'Prickles',             kind: 'character', rarity: 'legendary', chonk: 'hedgehog', blurb: 'A brand-new camper joins your cabin!' },
  { id: 'chr_goat',            name: 'Gruff',                kind: 'character', rarity: 'legendary', chonk: 'goat',     blurb: 'A brand-new camper joins your cabin!' },
];

registerItems(CARE_PACKAGE_REWARDS);
registerItems([CARE_PACKAGE_TOKEN]);

/** Drop-rate table for the odds sheet: chance of each rarity, in %. */
export function rarityOdds(): { rarity: Rarity; percent: number; count: number }[] {
  const total = RARITIES.reduce((s, r) => s + (poolOf(r).length ? RARITY_INFO[r].weight : 0), 0);
  return RARITIES.map((r) => ({
    rarity: r,
    percent: poolOf(r).length ? (RARITY_INFO[r].weight / total) * 100 : 0,
    count: poolOf(r).length,
  }));
}

export function poolOf(r: Rarity): Reward[] {
  return CARE_PACKAGE_REWARDS.filter((x) => x.rarity === r);
}

export function rewardById(id: string): Reward | undefined {
  return CARE_PACKAGE_REWARDS.find((x) => x.id === id);
}
