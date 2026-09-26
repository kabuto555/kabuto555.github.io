/**
 * Bot roster — who the fake players are.
 *
 * Bot `id` (0..BOT_COUNT-1) is the seed for everything procedural about the
 * bot, so the same bot always has the same troop, look, and personality.
 */
import { rollLoadout, type ChatLoadout } from '../chat/loadout';
import { seededRng } from '../rng';
import { listDefaultTroops, joinTroop, troopClub, PLAYER_MEMBER_ID, type Troop } from '../troops';
import { TROOP_TUNING, type TroopFocus } from '../troop-presets';
import { CAMP_BODY_MIX, isDogBody, rollAppearance, type Appearance, type Body } from './appearance';
import { playerLoadout, rollBotAvatar, type AvatarLoadout } from '../customization/loadout';
import type { HotspotKind } from './camp-map';

export const BOT_NAMES: readonly string[] = [
  'Chonk_FrFr', 'SkibidiBear67', 'GoatedPanda', 'PeakChonkton', 'ZeroRizzOtter',
  'FanumTaxBear', 'MewingCapybara', 'NegativeAura_', 'Aura_Farmer_99', 'SigmaMoose',
  'GyatticUS_Maximus', 'RizzlyBear', 'BrainrotCapy', 'UnspokenRizzly', 'Rizzosaurus',
  'AuraMonster67', 'LordTubby', 'SquishyBoyo', 'AbsoluteUnit', 'ThiccRaccoon',
  'GigaChonk', 'HeCometh', 'Clumsy_Oaf', 'TrippedOnARock', 'BouncingPotato',
  'Chonksters', 'BreadLoafFox', 'WideWalkingBunny', 'RoundBoi', 'Chonkules',
  'Afk_InTheLake', 'NoThoughts_JustChonk', 'I_Tripped', 'Lagging_Real_Hard', 'ProfessionalGriefer',
  'StealsYourBeads', 'Ad_Skipper_3000', 'WorstPlayerEU', 'I_Paid_To_Win', 'NotMyFault',
  'WhoPushedMe', 'Mums_Credit_Card', 'Smore_Enjoyer', 'CampCounselor_No', 'SirSlurbsALot',
  'GlampingGod', 'BugJuiceConsumer', 'PonyBead_Baron', 'PeakGogogo_Surviver', 'Sled_Menace',
  'Syrup_Slurper',
];

export const BOT_COUNT = BOT_NAMES.length;

/** The dodgeball court's regulars (the 4v4 attract match). Their ids start at
 * DODGEBALL_BOT_ID_BASE so their seeds never collide with the campgoers'. */
export const DODGEBALL_BOT_NAMES: readonly string[] = [
  'DodgingFrFr', 'BallMagnet67', 'AimBotCapy', 'BallHog_Real',
  'SledgeChonk', 'Brainrot_Moose', 'Butterfingers_67', 'BroThinksHesSlick',
];
export const DODGEBALL_BOT_ID_BASE = 1000;

/** The Lunch Delivery crew (the human's 3 AI teammates). Ids start at
 * LUNCH_BOT_ID_BASE so their seeds never collide with anyone else's. */
export const LUNCH_BOT_NAMES: readonly string[] = ['LunchLady_Chonk', 'SandwichSigma', 'BugSquasher67'];
export const LUNCH_BOT_ID_BASE = 2000;

/** The sumo ring's regulars (the 5-way attract match). Ids start at
 * SUMO_BOT_ID_BASE so their seeds never collide with anyone else's. */
export const SUMO_BOT_NAMES: readonly string[] = ['BellyBump_67', 'ThiccWrestler', 'RingOutRizzly', 'YokozunaChonk', 'PushyPanda'];
export const SUMO_BOT_ID_BASE = 3000;

/** The club focus a minigame's regulars lean towards (campgoers have none). */
function regularFocus(id: number): TroopFocus | null {
  if (id >= SUMO_BOT_ID_BASE) return 'sumo';
  if (id >= LUNCH_BOT_ID_BASE) return 'lunch';
  if (id >= DODGEBALL_BOT_ID_BASE) return 'dodgeball';
  return null;
}

/** How a bot moves and what it likes doing. */
export interface Personality {
  walkSpeed: number;
  runSpeed: number;
  /** Chance a trip is run rather than walked. */
  runChance: number;
  /** Hops per second while standing / while moving (players spam jump). */
  idleHopRate: number;
  moveHopRate: number;
  hopSpeed: number;
  /** Multiplier on hotspot linger times. */
  lingerScale: number;
  /** Chance a decision is a random wander instead of a hotspot. */
  wanderChance: number;
  /** Preference per hotspot kind. */
  affinity: Record<HotspotKind, number>;
  /** Hotspot id this bot keeps drifting back to. */
  favorite?: string;
  /** Log course: 0 = hopeless, 1 = sweaty tryhard. */
  courseSkill: number;
  /** Chance of hopping on the course when at its start line. */
  courseJoin: number;
  /** Falls in the river this many times before rage-quitting. */
  courseAttempts: number;
  /** Log course: chance of hopping onto an occupied node to bump its frog. */
  courseAggression: number;
  /** Quick-chat: 0 = rarely talks, 1 = never shuts up. */
  chattiness: number;
}

export interface BotProfile {
  id: number;
  /** Member id used in the troop registry. */
  memberId: string;
  name: string;
  troop: Troop | null;
  appearance: Appearance;
  personality: Personality;
  /** Equipped quick-chat messages. */
  chatLoadout: ChatLoadout;
}

/** Hand-tuned quirks for bots whose names beg for it. Partial overrides. */
const OVERRIDES: Record<string, Partial<Personality>> = {
  Smore_Enjoyer:        { favorite: 'campfire' },
  CampCounselor_No:     { favorite: 'hub_porch' },
  Sled_Menace:          { runChance: 1, runSpeed: 11, moveHopRate: 0.6 },
  BouncingPotato:       { idleHopRate: 0.8, moveHopRate: 0.8 },
  GlampingGod:          { favorite: 'cabins_yard', runChance: 0.1 },
  ProfessionalGriefer:  { favorite: 'log_start_bridge', courseJoin: 0.9, courseAggression: 1 },
  WhoPushedMe:          { courseAggression: 0.05 },
  NotMyFault:           { courseAggression: 0.85 },
  StealsYourBeads:      { courseAggression: 0.8, chattiness: 0.9 },
  Afk_InTheLake:        { favorite: 'dock', lingerScale: 4, idleHopRate: 0, wanderChance: 0.02, chattiness: 0.05 },
  SkibidiBear67:        { chattiness: 1 },
  NoThoughts_JustChonk: { lingerScale: 2.5, idleHopRate: 0, chattiness: 0.15 },
  I_Paid_To_Win:        { courseSkill: 0.95, courseJoin: 0.8 },
  GoatedPanda:          { courseSkill: 1, courseJoin: 0.7 },
  WorstPlayerEU:        { courseSkill: 0.1, courseJoin: 0.8, courseAttempts: 4 },
  I_Tripped:            { courseSkill: 0.15 },
  TrippedOnARock:       { courseSkill: 0.2 },
  Clumsy_Oaf:           { courseSkill: 0.15, courseAttempts: 3 },
};

function rollCourse(id: number): Pick<Personality, 'courseSkill' | 'courseJoin' | 'courseAttempts' | 'courseAggression'> {
  const r = seededRng(id, 'course');
  return {
    courseSkill: r.range(0.25, 1),
    courseJoin: r.range(0.45, 0.9),
    courseAttempts: r.int(2, 4),
    // Rolled last so earlier course traits keep their values per seed.
    courseAggression: r.chance(0.3) ? r.range(0.5, 0.9) : r.range(0.05, 0.3),
  };
}

function rollPersonality(id: number, name: string): Personality {
  const r = seededRng(id, 'personality');
  const p: Personality = {
    walkSpeed: r.range(3.2, 4.4),
    runSpeed: r.range(7.5, 10),
    runChance: r.range(0.35, 0.95),
    idleHopRate: r.chance(0.35) ? r.range(0.05, 0.35) : 0,
    moveHopRate: r.chance(0.4) ? r.range(0.05, 0.4) : 0,
    hopSpeed: r.range(6, 8.5),
    lingerScale: r.range(0.9, 2.2),
    wanderChance: r.range(0.08, 0.3),
    affinity: {
      minigame_start: r.range(0.4, 1.6),
      minigame_end: r.range(0.3, 1.2),
      spectate: r.range(0.4, 1.6),
      social: r.range(0.5, 1.5),
    },
    ...rollCourse(id),
    chattiness: seededRng(id, 'chattiness').range(0.25, 1),
  };
  return { ...p, ...OVERRIDES[name] };
}

export function botName(id: number): string {
  const base = BOT_NAMES[id % BOT_COUNT];
  const lap = Math.floor(id / BOT_COUNT);
  return lap === 0 ? base : `${base}${lap + 1}`;
}

const profiles = new Map<string, BotProfile>();

/** A bot's profile by troop member id (`bot:12`), once it's been created. */
export function getBotProfile(memberId: string): BotProfile | undefined {
  return profiles.get(memberId);
}

/**
 * Camp bodies (ids 0+): CAMP_BODY_MIX laid out as a deck and shuffled once with
 * a fixed seed, so the camp always has exactly that mix in the same order.
 */
const campDeck: Body[] = (() => {
  const deck = (Object.entries(CAMP_BODY_MIX) as [Body, number][]).flatMap(([b, n]) => Array<Body>(n).fill(b));
  const rng = seededRng(0, 'camp-bodies');
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
})();

/** The camp bot's dealt body; undefined (= weighted roll) for minigame rosters. */
function campBody(id: number): Body | undefined {
  return id < 1000 ? campDeck[id] ?? 'dog' : undefined;
}

/**
 * How many dog-bodied bots come before `id` in its id block (camp 0+, dodgeball
 * 1000+, lunch 2000+, sumo 3000+), so dog skins are dealt out in rotation per
 * roster. Pure function of the id (re-derives the earlier bodies), memoized.
 */
const dogRanks = new Map<number, number>();
function dogStyleIndex(id: number): number {
  const base = Math.floor(id / 1000) * 1000;
  let rank = 0;
  for (let i = base; i < id; i++) {
    let r = dogRanks.get(i);
    if (r === undefined) { r = isDogBody(rollAppearance(seededRng(i, 'appearance'), undefined, campBody(i)).species) ? 1 : 0; dogRanks.set(i, r); }
    rank += r;
  }
  return rank;
}

/** What anyone in camp is wearing: the player's own loadout, or a bot's rolled outfit. */
export function avatarLoadoutOf(memberId: string): AvatarLoadout | undefined {
  if (memberId === PLAYER_MEMBER_ID) return playerLoadout.avatar;
  return profiles.get(memberId)?.appearance.attire;
}

/** Builds (and registers troop membership for) the bot with this id. `name`
 * defaults to the campgoer name for the id; other rosters pass their own. */
export function createBotProfile(id: number, name = botName(id)): BotProfile {
  const memberId = `bot:${id}`;
  const tr = seededRng(id, 'troop');
  const troops = listDefaultTroops();
  // Solo bots exist too, like real players. The busy premade clubs get most members.
  const inTroop = tr.chance(TROOP_TUNING.botTroopChance);
  const focus = regularFocus(id);
  const pick = tr.weighted(troops, (t) => {
    const club = troopClub(t.id);
    return (club?.botWeight ?? 1) * (focus && club?.focus === focus ? TROOP_TUNING.focusBotBoost : 1);
  });
  const troop = inTroop && pick ? pick : null;
  if (troop) joinTroop(memberId, troop.id);
  const personality = rollPersonality(id, name);

  const profile: BotProfile = {
    id,
    memberId,
    name,
    troop,
    appearance: {
      ...rollAppearance(seededRng(id, 'appearance'), dogStyleIndex(id), campBody(id)),
      attire: rollBotAvatar(seededRng(id, 'attire')),
    },
    personality,
    chatLoadout: rollLoadout(seededRng(id, 'chat-loadout'), {
      // Griefers talk trash; polite players cheer; spectators vibe.
      roast: 0.5 + personality.courseAggression * 2,
      accuse: 0.6 + personality.courseAggression * 1.5,
      cheer: 1.6 - personality.courseAggression,
      team: 1.4 - personality.courseAggression,
      chill: 0.6 + personality.affinity.spectate * 0.6,
    }),
  };
  profiles.set(memberId, profile);
  return profile;
}
