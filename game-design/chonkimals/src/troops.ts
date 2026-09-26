/**
 * Scout troops — the registry of troops that exist plus who belongs to which.
 *
 * Game-wide (not bot-specific) so real players can join troops later.
 * Member ids are opaque strings, e.g. `bot:12` or a player id.
 *
 * The local player's troop, the troops they created, and their store purchases
 * (the troop boost) persist in `chonk.troop.v1`. No backend: other members are
 * the bots plus a faked roster (troop-life.ts).
 */
import { storageGet, storageSet } from './storage';
import { TROOP_CLUBS, type TroopClub } from './troop-presets';

export interface Troop {
  /** Stable slug, e.g. `troop-67`. */
  id: string;
  /** Display name, e.g. `Troop 67`. */
  name: string;
}

/** Premade troops (TROOP_CLUBS in troop-presets.ts carries their motto / focus). */
export const DEFAULT_TROOP_NAMES: readonly string[] = TROOP_CLUBS.map((c) => c.name);

/** A troop's club profile (premade troops only). */
export function troopClub(troopId: string): TroopClub | undefined {
  return TROOP_CLUBS.find((c) => troopSlug(c.name) === troopId);
}

const troops = new Map<string, Troop>();
const memberTroop = new Map<string, string>();
const troopMembers = new Map<string, Set<string>>();

export function troopSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Registers a troop (idempotent by slug) and returns it. */
export function registerTroop(name: string): Troop {
  const id = troopSlug(name);
  const existing = troops.get(id);
  if (existing) return existing;
  const troop = { id, name };
  troops.set(id, troop);
  troopMembers.set(id, new Set());
  return troop;
}

export function getTroop(id: string): Troop | undefined {
  return troops.get(id);
}

export function findTroopByName(name: string): Troop | undefined {
  return troops.get(troopSlug(name));
}

/** All registered troops, in registration order. */
export function listTroops(): Troop[] {
  return [...troops.values()];
}

/** The built-in troops (not player-founded) — bots only ever roll these, so a
 * player founding a troop doesn't reshuffle every bot's seeded troop. */
export function listDefaultTroops(): Troop[] {
  return DEFAULT_TROOP_NAMES.map((n) => troops.get(troopSlug(n))!);
}

/** WoW-guild-style tag shown under a name, e.g. `<Troop 67>`. */
export function formatTroopTag(troop: Troop): string {
  return `<${troop.name}>`;
}

// ── Membership ───────────────────────────────────────────────────────────────
/** Puts a member in a troop, leaving any previous one. */
export function joinTroop(memberId: string, troopId: string): void {
  const members = troopMembers.get(troopId);
  if (!members) throw new Error(`joinTroop: unknown troop "${troopId}"`);
  leaveTroop(memberId);
  members.add(memberId);
  memberTroop.set(memberId, troopId);
}

export function leaveTroop(memberId: string): void {
  const prev = memberTroop.get(memberId);
  if (prev === undefined) return;
  troopMembers.get(prev)?.delete(memberId);
  memberTroop.delete(memberId);
}

export function getMemberTroop(memberId: string): Troop | undefined {
  const id = memberTroop.get(memberId);
  return id === undefined ? undefined : troops.get(id);
}

export function getTroopMembers(troopId: string): string[] {
  return [...(troopMembers.get(troopId) ?? [])];
}

for (const name of DEFAULT_TROOP_NAMES) registerTroop(name);

// ── The local player ─────────────────────────────────────────────────────────
export const PLAYER_MEMBER_ID = 'player';
export const TROOP_NAME_MAX = 20;

interface SavedTroopState {
  /** Troop the player is in (slug), or null. */
  troopId: string | null;
  /** Names of troops the player founded (re-registered on load). */
  created: string[];
  /** Troops the player founded (and leads): slug → founding time (ms). */
  founded: Record<string, number>;
  /** Store purchase timestamps (ms) for the troop boost, per troop slug. */
  purchases: Record<string, number[]>;
}

const STATE_KEY = 'chonk.troop.v1';
const state: SavedTroopState = {
  troopId: null, created: [], founded: {}, purchases: {},
  ...storageGet<Partial<SavedTroopState>>(STATE_KEY, {}),
};
for (const name of state.created) registerTroop(name);
if (state.troopId && troops.has(state.troopId)) joinTroop(PLAYER_MEMBER_ID, state.troopId);
else state.troopId = null;

type Listener = () => void;
const listeners = new Set<Listener>();
function save(): void {
  storageSet(STATE_KEY, state);
  listeners.forEach((l) => l());
}

/** Calls `l` on every change to the player's troop state; returns an unsubscribe. */
export function subscribeTroop(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function playerTroop(): Troop | undefined {
  return getMemberTroop(PLAYER_MEMBER_ID);
}

export function playerLeads(troopId: string): boolean {
  return troopId in state.founded;
}

/** When the player founded this troop (ms), or undefined for everyone else's. */
export function troopFoundedAt(troopId: string): number | undefined {
  return state.founded[troopId];
}

export function joinPlayerTroop(troopId: string): void {
  joinTroop(PLAYER_MEMBER_ID, troopId);
  state.troopId = troopId;
  save();
}

export function leavePlayerTroop(): void {
  leaveTroop(PLAYER_MEMBER_ID);
  state.troopId = null;
  save();
}

/** Why a troop name can't be used, or null if it's fine. */
export function troopNameProblem(name: string): string | null {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length < 3) return 'Name needs at least 3 letters';
  if (!troopSlug(clean)) return 'Use some letters or numbers';
  if (findTroopByName(clean)) return 'That troop already exists';
  return null;
}

/** Founds a new troop, makes the player its leader and puts them in it. */
export function createPlayerTroop(name: string): Troop {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, TROOP_NAME_MAX);
  const problem = troopNameProblem(clean);
  if (problem) throw new Error(`createPlayerTroop: ${problem}`);
  const troop = registerTroop(clean);
  state.created.push(troop.name);
  state.founded[troop.id] = Date.now();
  joinPlayerTroop(troop.id);
  return troop;
}

// ── Troop boost ──────────────────────────────────────────────────────────────
// Buying anything in the store gives the buyer's troop a small boost to pony bead
// acquisition and camp pass progress. Each purchase counts for BOOST_WINDOW_MS.
export const TROOP_BOOST = {
  /** Percent per purchase. */
  perPurchase: 0.5,
  /** Cap on the troop's total boost, percent. */
  maxPercent: 10,
  windowMs: 24 * 60 * 60 * 1000,
} as const;

/** Logs a store purchase for the player's troop (no-op when solo). */
export function recordTroopPurchase(now = Date.now()): void {
  const id = state.troopId;
  if (!id) return;
  const list = (state.purchases[id] ??= []);
  list.push(now);
  state.purchases[id] = list.filter((t) => now - t < TROOP_BOOST.windowMs);
  save();
}

/** The player's own purchases for a troop inside the boost window. */
export function playerPurchasesFor(troopId: string, now = Date.now()): number {
  return (state.purchases[troopId] ?? []).filter((t) => now - t < TROOP_BOOST.windowMs).length;
}

/** Boost percent for a number of purchases in the window (capped). */
export function boostPercent(purchases: number): number {
  return Math.min(TROOP_BOOST.maxPercent, purchases * TROOP_BOOST.perPurchase);
}
