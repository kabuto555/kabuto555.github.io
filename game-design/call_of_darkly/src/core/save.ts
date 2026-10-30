import type { AmmoType, EquipSlot, ItemId, StatBlock } from '../data/types';
import type { Vec3Tuple } from './types';

export const SAVE_VERSION = 1;
const DEFAULT_KEY = 'cmw.save';

/** Everything persisted. IDS ONLY — never serialize defs or runtime objects. */
export interface SaveData {
  version: number;
  /** Epoch ms (informational). */
  savedAt: number;
  level: number;
  stats: StatBlock;
  souls: number;
  /** Last rested bonfire id (respawn point). null before first rest. */
  bonfireId: string | null;
  /** Area the player was last in ('firelink' | 'burg' | 'taurus'); drives fog/transition state and bloodstain area on load. */
  area: string;
  /** Souls dropped at death; null when none / wiped. */
  bloodstain: { areaId: string; pos: Vec3Tuple; souls: number } | null;
  inventory: { id: ItemId; count: number }[];
  equipment: Partial<Record<EquipSlot, ItemId>>;
  /** 5-slot quick belt + selected grenade id. */
  quickBelt: (ItemId | null)[];
  grenade: ItemId | null;
  ammo: Partial<Record<AmmoType, number>>;
  /** Rounds currently in each owned gun's magazine. */
  mags: Record<ItemId, number>;
  estusCharges: number;
  /** Starting gear has been granted (an emptied inventory must not regrant it). */
  gearGranted: boolean;
  /** Kills that rolled a drop table (drop rng position). */
  killCounter: number;
  /** Placed/chest loot partly taken: remaining stacks by looted id (the id is also in lootedItems). */
  partialLoot: Record<string, { id: ItemId; count: number }[]>;
  /** One-time world state, keyed by level-DSL ids. */
  lootedItems: string[];
  openedChests: string[];
  openedDoors: string[];
  /** Boss ids killed (never respawn), plus misc one-shot flags (e.g. 'firstKill:hollow_soldier'). */
  killedBosses: string[];
  flags: string[];
  /** Remaining finite shop stock, keyed `shopId:itemId` (absent = full stock). */
  shopStock: Record<string, number>;
}

/** Migrations: MIGRATIONS[n] upgrades a version-n save to n+1. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

/** Minimal Storage subset (localStorage, or a Map-backed fake in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Fresh new-game save. Phase 1 data tables decide real starting gear; this is the shape. */
export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: 0,
    level: 1,
    stats: { vitality: 10, endurance: 10, firearms: 10, strength: 10 },
    souls: 0,
    bonfireId: null,
    area: 'firelink',
    bloodstain: null,
    inventory: [],
    equipment: {},
    quickBelt: [null, null, null, null, null],
    grenade: null,
    ammo: {},
    mags: {},
    estusCharges: 5,
    gearGranted: false,
    killCounter: 0,
    partialLoot: {},
    lootedItems: [],
    openedChests: [],
    openedDoors: [],
    killedBosses: [],
    flags: [],
    shopStock: {},
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `src` over `def`: result has exactly def's shape. A field takes src's value only if
 * its type matches the default's (object/array/primitive); null/wrong-type -> default.
 * Defaults that are null accept any non-undefined src value (nullable fields). Free-form maps
 * (default `{}`) keep all src keys whose values are numbers/strings/booleans/objects.
 */
function mergeDefaults<T>(def: T, src: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(src) ? src : def) as T;
  if (isObj(def)) {
    if (!isObj(src)) return def;
    const out: Record<string, unknown> = {};
    const defKeys = Object.keys(def);
    for (const k of defKeys) out[k] = mergeDefaults(def[k], src[k]);
    if (defKeys.length === 0) for (const k of Object.keys(src)) if (src[k] != null) out[k] = src[k];
    return out as T;
  }
  if (def === null) return (src === undefined ? def : src) as T;
  return (typeof src === typeof def && (typeof src !== 'number' || Number.isFinite(src)) ? src : def) as T;
}

/** Random per-save-lineage token (stored beside the save; see SaveStore.save). */
function newSessionToken(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export class SaveStore {
  /**
   * Token of the save this store loaded / wrote (stored in the JSON as `sid`). Once known, a flush only
   * overwrites a stored save carrying the SAME token: if storage was cleared externally (devtools
   * `localStorage.clear()`, another tab's new game) the unload flush must not resurrect the in-memory save.
   */
  private sid: string | null = null;
  /** When true `save()` is a no-op (dev reset: clear + reload without the unload flush rewriting it). */
  frozen = false;
  /** Set by load() when the stored save is from a newer game version (raw copy kept in a backup key). */
  newerVersionDetected = false;
  /** Version number of the newer save, when detected. */
  newerVersion = 0;

  constructor(
    private readonly storage: KeyValueStorage | null = defaultStorage(),
    private readonly key = DEFAULT_KEY,
  ) {}

  private storedVersion(): number {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return 0;
      const d = JSON.parse(raw) as Record<string, unknown>;
      return isObj(d) && typeof d.version === 'number' ? d.version : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Returns null if absent, corrupt, or from a newer (unknown) version. For a newer version it also
   * sets `newerVersionDetected`/`newerVersion` and backs the raw string up to `<key>.backup.v<n>`;
   * `save()` then refuses to overwrite it.
   */
  load(): SaveData | null {
    this.newerVersionDetected = false;
    this.newerVersion = 0;
    this.sid = null;
    let raw: string | null | undefined;
    try {
      raw = this.storage?.getItem(this.key);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      let d = JSON.parse(raw) as Record<string, unknown>;
      if (!isObj(d)) return null;
      if (typeof d.sid === 'string') this.sid = d.sid;
      let v = typeof d.version === 'number' ? d.version : 0;
      if (v > SAVE_VERSION) {
        this.newerVersionDetected = true;
        this.newerVersion = v;
        try {
          this.storage?.setItem(`${this.key}.backup.v${v}`, raw);
        } catch {
          /* quota: best effort */
        }
        return null;
      }
      while (v < SAVE_VERSION) {
        const m = MIGRATIONS[v];
        if (!m) return null;
        d = m(d);
        v++;
      }
      const merged = mergeDefaults(newSave(), d);
      merged.version = SAVE_VERSION;
      return merged;
    } catch {
      return null;
    }
  }

  /** Returns false if storage is unavailable/full or the stored save is newer (never overwritten). */
  save(data: SaveData): boolean {
    if (!this.storage || this.frozen) return false;
    if (this.newerVersionDetected || this.storedVersion() > SAVE_VERSION) return false;
    try {
      if (this.sid !== null) {
        // We know a save existed: it must still be ours. Missing = cleared externally; other token = replaced.
        const raw = this.storage.getItem(this.key);
        if (!raw) return false;
        let stored: unknown;
        try {
          stored = (JSON.parse(raw) as Record<string, unknown>).sid;
        } catch {
          /* corrupt: overwrite */
        }
        if (typeof stored === 'string' && stored !== this.sid) return false;
      }
      this.sid ??= newSessionToken();
      this.storage.setItem(this.key, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now(), sid: this.sid }));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.newerVersionDetected = false;
    this.newerVersion = 0;
    this.sid = null;
    this.storage?.removeItem(this.key);
  }
}

/** Global save store (localStorage). */
export const saves = new SaveStore();
