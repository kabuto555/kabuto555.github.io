import { events as globalEvents, type EventBus } from '../core/events';
import { Rng } from '../core/rng';
import type { SaveData } from '../core/save';
import type { Vec3Like } from '../core/types';
import { AMMO, DROP_TABLES_BY_ID, ITEMS_BY_ID } from '../data';
import type { AmmoType, DropTableDef, GunDef, ItemId } from '../data/types';
import '../ai/types';
import { stats as globalStats } from '../inventory/modifiers';
import type { StatsReader } from '../inventory/types';
import type { WorldProgress } from './progress';
import type { DropRoller, RolledDrop } from './types';
import type { Wallet } from './wallet';

/** Ammo types usable by the guns in `itemIds` (§4 "owned"). */
export function ownedAmmoTypes(itemIds: Iterable<ItemId>): AmmoType[] {
  const out = new Set<AmmoType>();
  for (const id of itemIds) {
    const d = ITEMS_BY_ID.get(id);
    if (d && d.kind === 'weapon' && 'ammo' in d) out.add(d.ammo);
  }
  return [...out];
}

/**
 * Roll a drop table (pure given the rng). Entries roll independently in table order; ammo chance is
 * scaled by `ammoDropChance`, ammo amounts by `ammoPackAmount`; ammo only drops for `owned` types.
 * `firstKill` appends the table's guaranteed first-kill items.
 */
export const rollDrops: DropRoller = (table, rng, stats, owned, firstKill) => {
  const out: RolledDrop[] = [];
  for (const e of table.entries) {
    if (e.kind === 'ammo') {
      const chance = Math.min(1, e.chance * stats.get('ammoDropChance'));
      if (!rng.chance(chance)) continue;
      if (owned.length === 0) continue;
      const want = Math.min(owned.length, rng.int(e.types[0], e.types[1]));
      const pool = [...owned];
      const ammo: Partial<Record<string, number>> = {};
      for (let i = 0; i < want; i++) {
        const t = pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!;
        ammo[t] = Math.max(1, Math.round(rng.int(e.amount[0], e.amount[1]) * stats.get('ammoPackAmount')));
      }
      out.push({ kind: 'ammo', ammo });
    } else {
      if (!rng.chance(e.chance)) continue;
      const id = rng.pick(e.ids);
      const count = e.count ? rng.int(e.count[0], e.count[1]) : 1;
      out.push({ kind: 'item', id, count });
    }
  }
  if (firstKill && table.firstKill) for (const id of table.firstKill) out.push({ kind: 'item', id, count: 1, firstKill: true });
  return out;
};

/** Clamp-add ammo to a store: returns what was actually taken per type (the rest is overflow). */
export function collectAmmo(
  store: { get(t: AmmoType): number; cap(t: AmmoType): number; add(t: AmmoType, n: number): number },
  ammo: Partial<Record<string, number>>,
): Partial<Record<AmmoType, number>> {
  const taken: Partial<Record<AmmoType, number>> = {};
  for (const [k, n] of Object.entries(ammo)) {
    const t = k as AmmoType;
    if (!n || n <= 0 || !AMMO[t]) continue;
    if (store.get(t) >= store.cap(t)) continue;
    const overflow = store.add(t, n);
    const got = n - overflow;
    if (got > 0) taken[t] = got;
  }
  return taken;
}

/** What a rolled drop becomes in the world (consumed by world/pickups). */
export interface DropSpawn {
  pos: Vec3Like;
  loot?: { id: ItemId; count: number }[];
  ammo?: Partial<Record<string, number>>;
  /** Right-hand gun pickups: rounds in the mag + reserve ammo that comes with it. */
  gun?: { mag: number; reserve: number };
  /** Guaranteed first-kill drop: the progress flag is set when this pickup is taken, not when it spawns. */
  firstKillFlag?: string;
  /** Seconds until despawn (Infinity = never). First-kill drops never despawn. */
  ttl?: number;
}

export interface DropSystemOptions {
  wallet: Wallet;
  progress: WorldProgress;
  /** Current inventory item ids (to derive owned ammo types). */
  ownedItems: () => Iterable<ItemId>;
  spawn: (d: DropSpawn) => void;
  /** Fixed rng (tests). Without it each kill rolls from `seed` + the persisted kill counter. */
  rng?: Rng;
  seed?: number;
  stats?: StatsReader;
  events?: EventBus;
  /** True while an untaken first-kill pickup for `flag` is on the ground (so a re-kill doesn't duplicate it). */
  firstKillPending?: (flag: string) => boolean;
}

const DEFAULT_SEED = 0xd20b5;
/** Per-kill rng seed: stable across reloads because the counter is saved. */
function killSeed(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Listens to `enemyDeath`: souls -> wallet, roll the table, spawn world pickups. */
export class DropSystem {
  /** Rng of the kill being (or last) rolled. */
  rng: Rng;
  /** Kills that rolled a table so far (persisted so a reload doesn't repeat rolls). */
  killCounter = 0;
  /** Fired when `killCounter` changes (main schedules a save). */
  onChange: (() => void) | null = null;
  private readonly seed: number;
  private readonly off: () => void;
  private readonly bus: EventBus;
  private readonly stats: StatsReader;

  constructor(private readonly o: DropSystemOptions) {
    this.seed = o.seed ?? DEFAULT_SEED;
    this.rng = o.rng ?? new Rng(killSeed(this.seed, 0));
    this.bus = o.events ?? globalEvents;
    this.stats = o.stats ?? globalStats;
    this.off = this.bus.on('enemyDeath', (e) => this.onDeath(e));
  }

  dispose(): void {
    this.off();
  }

  load(save: SaveData | null | undefined): void {
    this.killCounter = Math.max(0, Math.floor(save?.killCounter ?? 0));
    if (!this.o.rng) this.rng = new Rng(killSeed(this.seed, this.killCounter));
  }

  writeSave(save: SaveData): SaveData {
    save.killCounter = this.killCounter;
    return save;
  }

  onDeath(e: { defId: string; dropTableId: string | null; pos: Vec3Like; souls: number }): RolledDrop[] {
    this.o.wallet.addKill(e.souls);
    const table: DropTableDef | undefined = e.dropTableId ? DROP_TABLES_BY_ID.get(e.dropTableId) : undefined;
    if (!table) return [];
    if (!this.o.rng) this.rng = new Rng(killSeed(this.seed, this.killCounter));
    this.killCounter++;
    this.onChange?.();
    // First-kill drops are guaranteed until the player actually takes them (flag set on pickup);
    // while one is still lying around, further kills don't add a second copy.
    const flag = `firstKill:${e.defId}`;
    const first = !this.o.progress.hasFlag(flag) && !(this.o.firstKillPending?.(flag) ?? false);
    const drops = rollDrops(table, this.rng, this.stats, ownedAmmoTypes(this.o.ownedItems()), first);
    for (const d of drops) {
      const a = this.rng.float(0, Math.PI * 2);
      const r = this.rng.float(0.2, 0.7);
      const pos = { x: e.pos.x + Math.cos(a) * r, y: e.pos.y + 0.3, z: e.pos.z + Math.sin(a) * r };
      if (d.kind === 'ammo') this.o.spawn({ pos, ammo: d.ammo });
      else {
        const def = ITEMS_BY_ID.get(d.id);
        const gun = def && def.kind === 'weapon' && def.hand === 'R' ? (def as GunDef) : null;
        this.o.spawn({
          pos,
          loot: [{ id: d.id, count: d.count }],
          firstKillFlag: d.firstKill ? flag : undefined,
          ttl: d.firstKill ? Infinity : undefined,
          gun: gun ? { mag: Math.max(1, Math.round(gun.mag * this.rng.float(0.25, 0.75))), reserve: gun.mag * this.rng.int(1, 3) } : undefined,
        });
      }
    }
    return drops;
  }
}
