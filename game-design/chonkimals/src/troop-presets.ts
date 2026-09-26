// Scout troop content: the premade troops, faked-member names, troop chat lines,
// and the tuning for the faked troop life (troop-life.ts). Data only — tweak freely.

/** What a club is into — themes its chat, member statuses, and which bots it recruits. */
export type TroopFocus = 'dodgeball' | 'sumo' | 'logCourse' | 'lunch' | 'campfire' | 'zipline';

export interface TroopClub {
  name: string;
  motto: string;
  focus: TroopFocus;
  emoji: string;
  /** Featured clubs are the busy ones: listed first as "Active Clubs", bigger and more online. */
  featured?: boolean;
  /** Relative share of the troop-joining bots this club gets. */
  botWeight: number;
}

/** The premade troops (order is stable — bots' seeded picks depend on it). */
export const TROOP_CLUBS: readonly TroopClub[] = [
  { name: 'Troop 67', motto: 'Dodge ball every night. No excuses.', focus: 'dodgeball', emoji: '🏐', featured: true, botWeight: 5 },
  { name: 'Burnt Marshmallows', motto: 'Chill campfire crew. Vibes only 🔥', focus: 'campfire', emoji: '🔥', featured: true, botWeight: 5 },
  { name: 'Maximum Rizz', motto: 'Undefeated in the sumo ring (allegedly)', focus: 'sumo', emoji: '💪', featured: true, botWeight: 4 },
  { name: 'Canteen Raiders', motto: 'Fastest lunch delivery in Chonkton', focus: 'lunch', emoji: '🥪', featured: true, botWeight: 4 },
  { name: 'We Tripped', motto: 'Log course speedrunners. We fall a lot.', focus: 'logCourse', emoji: '🪵', featured: true, botWeight: 4 },
  { name: 'Poop Troop', motto: 'we are exactly what it sounds like', focus: 'campfire', emoji: '💩', botWeight: 1 },
  { name: 'Sigma AFK', motto: 'brb', focus: 'campfire', emoji: '😴', botWeight: 1 },
  { name: 'Zero Aura Gang', motto: 'negative aura, positive vibes', focus: 'dodgeball', emoji: '🌀', botWeight: 1 },
  { name: 'Brainrot Badgers', motto: 'skibidi scouts', focus: 'sumo', emoji: '🦡', botWeight: 1 },
  { name: 'AURA FRFR', motto: 'aura farming since day 1', focus: 'zipline', emoji: '✨', botWeight: 1 },
  { name: 'Pony Bead Mafia', motto: 'we have the beads. we want more beads.', focus: 'lunch', emoji: '📿', botWeight: 1 },
  { name: 'Glamping Elite', motto: 'cabins only. no tents.', focus: 'zipline', emoji: '🏕️', botWeight: 1 },
  { name: 'Counselor’s Nightmare', motto: 'banned from the zipline twice', focus: 'zipline', emoji: '😈', botWeight: 1 },
  { name: '404: Brain Not Found', motto: 'loading…', focus: 'logCourse', emoji: '🧠', botWeight: 1 },
];

/** Where a club's online members say they are. */
export const TROOP_FOCUS_STATUS: Record<TroopFocus, readonly string[]> = {
  dodgeball: ['Playing Dodge Ball', 'Playing Dodge Ball', 'At camp'],
  sumo: ['Playing Sumo', 'Playing Sumo', 'At camp'],
  logCourse: ['On the Log Course', 'On the Log Course', 'At camp'],
  lunch: ['On Lunch Delivery', 'On Lunch Delivery', 'At camp'],
  campfire: ['At the campfire', 'At the campfire', 'At camp'],
  zipline: ['Riding the zipline', 'Hang gliding', 'At camp'],
};

/** Club-flavoured chat, mixed in with the general lines. */
export const TROOP_FOCUS_LINES: Record<TroopFocus, readonly string[]> = {
  dodgeball: ['dodge ball in 2 who is in', 'we went 5-0 last night 🏐', 'who threw that ball at my face 😭', 'need 2 more for dodge ball',
    'catching is so op', 'gg dodge ball squad'],
  sumo: ['sumo ring NOW', 'i just pushed 3 people out at once 💪', 'pepper power-up is broken lol', 'rematch???', 'sumo gang rise up'],
  logCourse: ['new PB on the log course!!', 'fell in the river 4 times in a row 💀', 'the second log is cursed', 'log course race?',
    'who bumped me off. confess'],
  lunch: ['lunch run starting!', 'delivered 12 sandwiches no drops 🥪', 'who dropped the soup', 'cart is leaving come on', 'hard mode lunch let\'s go'],
  campfire: ['campfire is lit 🔥', 'who brought marshmallows', 'just vibing by the fire', 'ghost stories at the campfire tonight 👻',
    'my marshmallow caught fire again'],
  zipline: ['zipline race!', 'hang glider landed right on the target 🪁', 'wheeeee', 'the view from the top is insane', 'glided into a tree 🌲'],
};

/** Faked (offline) member names are `<first><second>[_<number>]`. */
export const TROOP_NAME_PARTS = {
  first: ['Mossy', 'Chunky', 'Soggy', 'Crispy', 'Wobbly', 'Toasty', 'Sleepy', 'Feral', 'Tiny', 'Mega', 'Lil', 'Sir',
    'Goofy', 'Sneaky', 'Bouncy', 'Salty', 'Fluffy', 'Grumpy', 'Squishy', 'Turbo'],
  second: ['Acorn', 'Beaver', 'Marshmallow', 'Pinecone', 'Otter', 'Canteen', 'Badger', 'Tadpole', 'Mushroom', 'Hotdog',
    'Moose', 'Compass', 'Raccoon', 'Lantern', 'Pancake', 'Tater', 'Noodle', 'Goose', 'Bean', 'Hiker'],
  numbers: ['67', '99', '420', '3000', '2011', '1', '777', 'XD'],
} as const;

/** Chonk portraits faked members wear (assets/ui/chonks/<id>.png). */
export const TROOP_MEMBER_ART: readonly string[] = [
  'froggo', 'joey', 'doggo', 'yogi', 'garbo', 'ooga', 'meerkat', 'chippy', 'george', 'goat', 'hedgehog', 'hyena',
  'grey_cat', 'fox', 'shiba', 'jindo', 'tuxedo', 'german_shepherd', 'grey_wolf_dog', 'black_white_dog', 'tiger',
  'jackass', 'little', 'peppy',
];

/** Things troopmates say unprompted. */
export const TROOP_CHAT_LINES: readonly string[] = [
  'who wants to run dodge ball rn', 'just got bonked off the log course AGAIN 💀', 'sumo anyone?? i will not lose this time',
  'bought a hat. troop boost is ours now 😎', 'gm troop ☀️', 'gn troop 🌙', 'lunch delivery is so chaotic lmao',
  'the zipline is the best part of camp and i will not be taking questions', 'someone left a tombstone at the log start 🪦',
  'we need more members fr', 'who ate all the marshmallows', 'campfire meetup in 5 🔥', 'hang glider speedrun any%',
  'GG everyone', 'troop 67 is sus', 'my frog has no thoughts. only chonk', 'anyone seen the counselor? asking for a friend',
  'i tripped on a rock and lost dodge ball', 'this troop is goated 🐐', 'pony beads when',
];

/** Replies to the player. `{name}` becomes the player's name. */
export const TROOP_CHAT_REPLIES: readonly string[] = [
  'real', 'lol {name}', 'W {name}', 'omw!', 'fr fr', 'say less', '{name} is cooking 🍳', 'no way 😂', 'bet',
  'hi {name}!! 👋', 'ratio', 'based', 'ok but who asked 😭 jk ily {name}', 'same', 'lets gooo',
];

/** Said by troopmates when the player joins. */
export const TROOP_WELCOME_LINES: readonly string[] = [
  'welcome {name}!! 🎉', 'yooo {name} joined', 'new member lets gooo', 'hi {name} 👋 we play dodge ball a lot',
];

/** One-tap lines for the player (no typing needed on a phone). */
export const TROOP_QUICK_LINES: readonly string[] = ['Hi troop! 👋', 'Dodge ball?', 'GG!', 'lol', 'Campfire? 🔥'];

export const TROOP_TUNING = {
  /** Size of a built-in troop (bots at camp + faked offline members). */
  rosterSize: [6, 14] as const,
  /** …and of a featured club. */
  featuredRosterSize: [18, 28] as const,
  /** Fraction of bots that join a troop at all. */
  botTroopChance: 0.82,
  /** Minigame regulars are this many times likelier to join a club with that focus. */
  focusBotBoost: 5,
  /** Player-founded troops: a new recruit every this many minutes, up to `recruitCap`. */
  recruitEveryMin: 4,
  recruitCap: 9,
  /** Fraction of faked members shown as online (not at camp). */
  onlineChance: 0.25,
  featuredOnlineChance: 0.55,
  /** Troopmate chatter while the chat is open, seconds between lines. */
  chatterGap: [7, 16] as const,
  featuredChatterGap: [3, 8] as const,
  /** Chance a chatter line is club-flavoured rather than general. */
  focusLineChance: 0.55,
  /** Chance a troopmate answers the player, and how long they take (s). */
  replyChance: 0.7,
  replyDelay: [1.6, 4] as const,
  /** Backlog of old messages shown the first time a troop's chat opens. */
  backlog: [5, 9] as const,
  featuredBacklog: [12, 18] as const,
  /** Minutes between backlog messages (featured clubs talk more). */
  backlogGapMin: [1, 12] as const,
  featuredBacklogGapMin: [0.3, 3] as const,
  /** Troopmates at camp who shout a welcome in the world when you join. */
  worldWelcomes: 3,
  /** Faked member purchases in the boost window, per member (upper bound). */
  fakePurchasesPerMember: 0.6,
  /** Messages kept per troop chat (oldest drop off). */
  chatHistoryMax: 60,
};
