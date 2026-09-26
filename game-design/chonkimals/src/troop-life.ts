// Faked troop life (no backend). Each troop's roster = the bots in it that are at
// camp or in a minigame + a seeded pool of offline "players" padding it to a
// believable size; player-founded troops fill up with recruits over time. Troop
// chat is local: a seeded backlog, idle chatter while it's open, and replies to
// the player. The troop boost counts the player's real store purchases plus a
// seeded, hourly-changing number of the faked members' purchases.

import { hashString, seededRng } from './rng';
import { getBotProfile } from './bots/roster';
import { DODGEBALL_BOT_ID_BASE, LUNCH_BOT_ID_BASE, SUMO_BOT_ID_BASE } from './bots/roster';
import {
  boostPercent, getTroop, getTroopMembers, playerPurchasesFor, PLAYER_MEMBER_ID, troopClub, troopFoundedAt, type Troop,
} from './troops';
import {
  TROOP_CHAT_LINES, TROOP_CHAT_REPLIES, TROOP_FOCUS_LINES, TROOP_FOCUS_STATUS, TROOP_MEMBER_ART, TROOP_NAME_PARTS,
  TROOP_TUNING, TROOP_WELCOME_LINES, type TroopClub,
} from './troop-presets';
import { portraitForSpecies } from './bots/appearance';

export type MemberStatus = 'camp' | 'online' | 'offline';

export interface TroopMember {
  id: string;
  name: string;
  /** Chonk portrait id (assets/ui/chonks/<art>.png). */
  art: string;
  status: MemberStatus;
  /** "At camp", "Playing Sumo", "Last seen 3h ago"… */
  statusText: string;
  leader: boolean;
  isPlayer: boolean;
}

export interface PlayerInfo { name: string; art: string; }

const STATUS_ORDER: Record<MemberStatus, number> = { camp: 0, online: 1, offline: 2 };

function fakeName(r: ReturnType<typeof seededRng>): string {
  const n = r.pick(TROOP_NAME_PARTS.first) + r.pick(TROOP_NAME_PARTS.second);
  return r.chance(0.45) ? `${n}_${r.pick(TROOP_NAME_PARTS.numbers)}` : n;
}

function botStatus(id: number): string {
  if (id >= SUMO_BOT_ID_BASE) return 'Playing Sumo';
  if (id >= LUNCH_BOT_ID_BASE) return 'On Lunch Delivery';
  if (id >= DODGEBALL_BOT_ID_BASE) return 'Playing Dodge Ball';
  return 'At camp';
}

/** How many faked members a troop has right now. */
function fakeCount(troop: Troop, realBots: number, now: number): number {
  const founded = troopFoundedAt(troop.id);
  if (founded !== undefined) {
    const minutes = (now - founded) / 60000;
    return Math.min(TROOP_TUNING.recruitCap, Math.floor(minutes / TROOP_TUNING.recruitEveryMin));
  }
  const [lo, hi] = troopClub(troop.id)?.featured ? TROOP_TUNING.featuredRosterSize : TROOP_TUNING.rosterSize;
  return Math.max(0, seededRng(hashString(troop.id), 'roster-size').int(lo, hi) - realBots);
}

/** Everyone in the troop, the player first, then at camp → online → offline. */
export function troopRoster(troopId: string, player: PlayerInfo, now = Date.now()): TroopMember[] {
  const troop = getTroop(troopId);
  if (!troop) return [];
  const out: TroopMember[] = [];
  const ids = getTroopMembers(troopId);
  const playerLeads = troopFoundedAt(troopId) !== undefined;

  if (ids.includes(PLAYER_MEMBER_ID)) {
    out.push({ id: PLAYER_MEMBER_ID, name: player.name, art: player.art, status: 'camp', statusText: 'You',
      leader: playerLeads, isPlayer: true });
  }
  const bots = ids.filter((id) => id !== PLAYER_MEMBER_ID).map((id) => getBotProfile(id)).filter((p) => !!p);
  for (const p of bots) {
    out.push({ id: p.memberId, name: p.name, art: portraitForSpecies(p.appearance.species), status: 'camp',
      statusText: botStatus(p.id), leader: false, isPlayer: false });
  }
  const seed = hashString(troop.id);
  const n = fakeCount(troop, bots.length, now);
  const club = troopClub(troopId);
  const onlineChance = club?.featured ? TROOP_TUNING.featuredOnlineChance : TROOP_TUNING.onlineChance;
  // Who's online shifts every 20 minutes so busy clubs feel live.
  const slot = Math.floor(now / 1.2e6);
  for (let i = 0; i < n; i++) {
    const r = seededRng(seed + i * 7919, 'member');
    const name = fakeName(r);
    const art = r.pick(TROOP_MEMBER_ART);
    const presence = seededRng(seed + i * 7919 + slot, 'online');
    const online = presence.chance(onlineChance);
    const doing = club ? presence.pick(TROOP_FOCUS_STATUS[club.focus]) : 'Online';
    // Last-seen drifts with the hour so the roster doesn't look frozen.
    const hours = seededRng(seed + i * 7919 + Math.floor(now / 3.6e6), 'seen').int(1, 72);
    out.push({ id: `fake:${troop.id}:${i}`, name, art, status: online ? 'online' : 'offline',
      statusText: online ? doing : hours < 24 ? `Last seen ${hours}h ago` : `Last seen ${Math.floor(hours / 24)}d ago`,
      leader: false, isPlayer: false });
  }
  const rest = out.filter((m) => !m.isPlayer).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  // Built-in troops: the longest-standing member (first faked one, else first bot) leads.
  if (!playerLeads) {
    const fakes = out.filter((m) => m.id.startsWith('fake:'));
    const lead = fakes.find((m) => m.status === 'online') ?? fakes[0] ?? rest[0];
    if (lead) lead.leader = true;
  }
  return [...out.filter((m) => m.isPlayer), ...rest.filter((m) => m.leader), ...rest.filter((m) => !m.leader)];
}

export interface TroopSummary {
  troop: Troop;
  club: TroopClub | undefined;
  members: number;
  /** Members at camp or online. */
  active: number;
  /** Bots in the troop that are in camp right now (you can see them walking around). */
  atCamp: number;
  /** Purchases in the boost window and the resulting boost percent. */
  purchases: number;
  boost: number;
}

export function troopSummary(troopId: string, player: PlayerInfo, now = Date.now()): TroopSummary | null {
  const troop = getTroop(troopId);
  if (!troop) return null;
  const roster = troopRoster(troopId, player, now);
  const others = roster.filter((m) => !m.isPlayer).length;
  const hour = Math.floor(now / 3.6e6);
  const fake = seededRng(hashString(troop.id) + hour, 'purchases')
    .int(0, Math.floor(others * TROOP_TUNING.fakePurchasesPerMember));
  const purchases = fake + playerPurchasesFor(troopId, now);
  return { troop, club: troopClub(troopId), members: roster.length,
    active: roster.filter((m) => m.status !== 'offline').length,
    atCamp: roster.filter((m) => !m.isPlayer && m.status === 'camp').length,
    purchases, boost: boostPercent(purchases) };
}

// ── Troop chat ───────────────────────────────────────────────────────────────

export interface TroopMessage {
  from: string;
  text: string;
  /** ms timestamp. */
  at: number;
  mine: boolean;
}

type ChatListener = (m: TroopMessage) => void;

/** Local troop chat for one troop. Chatter/replies only run while `open()`. */
export class TroopChat {
  readonly messages: TroopMessage[] = [];
  private listeners = new Set<ChatListener>();
  private timers: number[] = [];
  private chatter = 0;
  private opened = false;

  private readonly club: TroopClub | undefined;

  constructor(readonly troopId: string, private player: () => PlayerInfo) {
    this.club = troopClub(troopId);
    const roster = this.others();
    if (roster.length === 0) return;
    const r = seededRng(hashString(troopId) + Math.floor(Date.now() / 3.6e6), 'backlog');
    const featured = !!this.club?.featured;
    const [lo, hi] = featured ? TROOP_TUNING.featuredBacklog : TROOP_TUNING.backlog;
    const [gLo, gHi] = featured ? TROOP_TUNING.featuredBacklogGapMin : TROOP_TUNING.backlogGapMin;
    const n = r.int(lo, hi);
    // Distinct lines, walking back in time from just now (busy clubs) or a few minutes ago.
    const lines = [...TROOP_CHAT_LINES, ...(this.club ? TROOP_FOCUS_LINES[this.club.focus] : [])];
    let t = Date.now() - (featured ? r.range(0.3, 2) : r.range(2, 8)) * 60000;
    for (let i = 0; i < n && lines.length > 0; i++) {
      const text = lines.splice(r.int(0, lines.length - 1), 1)[0];
      this.messages.unshift({ from: r.pick(roster).name, text, at: t, mine: false });
      t -= r.range(gLo, gHi) * 60000;
    }
  }

  subscribe(l: ChatListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Start troopmate chatter (while the chat tab is visible). */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.scheduleChatter();
  }

  close(): void {
    this.opened = false;
    window.clearTimeout(this.chatter);
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  send(text: string): void {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) return;
    this.push({ from: this.player().name, text: clean, at: Date.now(), mine: true });
    if (Math.random() < TROOP_TUNING.replyChance) this.later(TROOP_TUNING.replyDelay, TROOP_CHAT_REPLIES);
  }

  /** A troopmate or two greets the player (call right after they join). */
  welcome(): void {
    this.later([0.8, 2], TROOP_WELCOME_LINES);
    if (Math.random() < 0.6) this.later([2.5, 5], TROOP_WELCOME_LINES);
  }

  private others(): TroopMember[] {
    const roster = troopRoster(this.troopId, this.player()).filter((m) => !m.isPlayer);
    const active = roster.filter((m) => m.status !== 'offline');
    return active.length > 0 ? active : roster;
  }

  private later(delay: readonly [number, number], pool: readonly string[]): void {
    const others = this.others();
    if (others.length === 0) return;
    const ms = (delay[0] + Math.random() * (delay[1] - delay[0])) * 1000;
    this.timers.push(window.setTimeout(() => {
      const from = others[Math.floor(Math.random() * others.length)].name;
      const text = pool[Math.floor(Math.random() * pool.length)].replace(/\{name\}/g, this.player().name);
      this.push({ from, text, at: Date.now(), mine: false });
    }, ms));
  }

  private scheduleChatter(): void {
    const [lo, hi] = this.club?.featured ? TROOP_TUNING.featuredChatterGap : TROOP_TUNING.chatterGap;
    this.chatter = window.setTimeout(() => {
      if (!this.opened) return;
      const themed = this.club && Math.random() < TROOP_TUNING.focusLineChance;
      this.later([0, 0], themed ? TROOP_FOCUS_LINES[this.club!.focus] : TROOP_CHAT_LINES);
      this.scheduleChatter();
    }, (lo + Math.random() * (hi - lo)) * 1000);
  }

  private push(m: TroopMessage): void {
    this.messages.push(m);
    if (this.messages.length > TROOP_TUNING.chatHistoryMax) this.messages.shift();
    this.listeners.forEach((l) => l(m));
  }
}

const chats = new Map<string, TroopChat>();

/** The (session-long) chat for a troop. */
export function troopChat(troopId: string, player: () => PlayerInfo): TroopChat {
  let c = chats.get(troopId);
  if (!c) { c = new TroopChat(troopId, player); chats.set(troopId, c); }
  return c;
}
