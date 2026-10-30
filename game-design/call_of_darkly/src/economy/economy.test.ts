import { describe, expect, it } from 'vitest';
import { AmmoStore } from '../combat/weapons';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { newSave, SaveStore, type KeyValueStorage } from '../core/save';
import { AMMO, DROP_TABLES } from '../data';
import { StatsResolver } from '../inventory/modifiers';
import { collectMags, MagRestorer } from './persist';
import { collectAmmo, DropSystem, ownedAmmoTypes, rollDrops, type DropSpawn } from './drops';
import { WorldProgress } from './progress';
import { Wallet } from './wallet';

const mem = (): KeyValueStorage & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('drop roller', () => {
  const owned = ['rifle', 'pistol'];
  const stats = new StatsResolver();

  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 50 }, () => rollDrops(DROP_TABLES.drops_hollow_sword!, rng, stats, owned, false));
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('only drops owned ammo types, 1..2 of them, scaled by ammoPackAmount', () => {
    const rng = new Rng(1);
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      for (const d of rollDrops(DROP_TABLES.drops_hollow_sword!, rng, stats, owned, false)) {
        if (d.kind !== 'ammo') continue;
        seen++;
        const types = Object.keys(d.ammo);
        expect(types.length).toBeGreaterThanOrEqual(1);
        expect(types.length).toBeLessThanOrEqual(2);
        for (const t of types) {
          expect(owned).toContain(t);
          expect(d.ammo[t]).toBeGreaterThanOrEqual(10);
          expect(d.ammo[t]).toBeLessThanOrEqual(30);
        }
      }
    }
    expect(seen).toBeGreaterThan(80); // ~50% of 300
    // no owned types -> no ammo; 1 owned type caps the pack to 1 type
    expect(rollDrops(DROP_TABLES.drops_hollow_sword!, new Rng(3), stats, [], false)).toEqual([]);
    const boosted = new StatsResolver();
    boosted.register('t', [{ key: 'ammoPackAmount', op: 'mul', value: 2 }]);
    const d = rollDrops({ id: 'x', entries: [{ kind: 'ammo', chance: 1, types: [2, 2], amount: [10, 10] }] }, new Rng(1), boosted, ['smg'], false);
    expect(d).toEqual([{ kind: 'ammo', ammo: { smg: 20 } }]);
  });

  it('ammoDropChance scales ammo chance; first-kill items are guaranteed once', () => {
    const t = { id: 'x', entries: [{ kind: 'ammo' as const, chance: 0.5, types: [1, 1] as [number, number], amount: [5, 5] as [number, number] }] };
    const count = (s: StatsResolver) => {
      const rng = new Rng(11);
      let n = 0;
      for (let i = 0; i < 400; i++) n += rollDrops(t, rng, s, ['rifle'], false).length;
      return n;
    };
    const hi = new StatsResolver();
    hi.register('scav', [{ key: 'ammoDropChance', op: 'mul', value: 2 }]);
    expect(count(hi)).toBe(400); // 0.5 * 2 = 1
    expect(count(stats)).toBeLessThan(260);
    const hs = DROP_TABLES.drops_hollow_soldier!;
    const first = rollDrops(hs, new Rng(5), stats, owned, true);
    expect(first).toContainEqual({ kind: 'item', id: 'basement_key', count: 1, firstKill: true });
    expect(rollDrops(hs, new Rng(5), stats, owned, false).some((d) => d.kind === 'item' && d.id === 'basement_key')).toBe(false);
  });

  it('owned ammo types come from guns in the inventory', () => {
    expect(ownedAmmoTypes(['m4_ar', 'm1911_pistol', 'combat_knife', 'plate_carrier']).sort()).toEqual(['pistol', 'rifle']);
  });
});

describe('ammo pickup', () => {
  it('clamps to the cap, reports overflow, and leaves full types alone', () => {
    const bus = new EventBus();
    const store = new AmmoStore(bus);
    store.set('rifle', AMMO.rifle.cap - 10);
    store.set('pistol', AMMO.pistol.cap);
    const taken = collectAmmo(store, { rifle: 30, pistol: 12, smg: 20 });
    expect(taken).toEqual({ rifle: 10, smg: 20 });
    expect(store.get('rifle')).toBe(AMMO.rifle.cap);
    expect(store.get('pistol')).toBe(AMMO.pistol.cap);
  });
});

describe('drop system', () => {
  const rig = (seed = 1) => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const wallet = new Wallet(bus, stats);
    const progress = new WorldProgress();
    const spawned: DropSpawn[] = [];
    const sys = new DropSystem({ wallet, progress, ownedItems: () => ['m4_ar'], spawn: (d) => spawned.push(d), rng: new Rng(seed), stats, events: bus });
    return { bus, stats, wallet, progress, spawned, sys };
  };
  const death = (bus: EventBus) =>
    bus.emit('enemyDeath', { enemyId: 1, defId: 'hollow_soldier', dropTableId: 'drops_hollow_soldier', pos: { x: 1, y: 0, z: 2 }, souls: 40, killerId: null });

  it('souls always go to the wallet (soulGain applied); first kill drops the Basement Key once', () => {
    const r = rig();
    r.stats.register('bounty', [{ key: 'soulGain', op: 'pct', value: 0.5 }]);
    death(r.bus);
    expect(r.wallet.souls).toBe(60);
    expect(r.spawned.some((d) => d.loot?.[0]?.id === 'basement_key')).toBe(true);
    // The flag is set when the pickup is taken (world/pickups), not when it spawns.
    expect(r.progress.hasFlag('firstKill:hollow_soldier')).toBe(false);
    const key = r.spawned.find((d) => d.loot?.[0]?.id === 'basement_key')!;
    expect(key.firstKillFlag).toBe('firstKill:hollow_soldier');
    expect(key.ttl).toBe(Infinity); // never despawns
    r.progress.setFlag('firstKill:hollow_soldier'); // ...as the pickup does when taken
    r.spawned.length = 0;
    death(r.bus);
    expect(r.wallet.souls).toBe(120);
    expect(r.spawned.some((d) => d.loot?.[0]?.id === 'basement_key')).toBe(false);
  });

  it('dropped guns carry a partial mag and reserve', () => {
    const r = rig();
    const t = { id: 'g', entries: [{ kind: 'item' as const, chance: 1, ids: ['smg_mp5'] }] };
    const drops = rollDrops(t, r.sys.rng, r.stats, [], false);
    expect(drops).toEqual([{ kind: 'item', id: 'smg_mp5', count: 1 }]);
    // through the system (table registered in data): hollow soldier gun is 5%, so just check shape on a forced spawn
    const forced = rig(2);
    let guns = 0;
    for (let i = 0; i < 400; i++) {
      forced.spawned.length = 0;
      death(forced.bus);
      for (const d of forced.spawned) if (d.gun) (guns++, expect(d.gun.mag).toBeLessThan(31), expect(d.gun.reserve).toBeGreaterThan(0));
    }
    expect(guns).toBeGreaterThan(0);
  });

  it('wallet add/spend and events', () => {
    const bus = new EventBus();
    const w = new Wallet(bus, new StatsResolver());
    const seen: number[] = [];
    bus.on('soulsChanged', (e) => seen.push(e.delta));
    w.add(100);
    expect(w.spend(150)).toBe(false);
    expect(w.spend(60)).toBe(true);
    expect(w.souls).toBe(40);
    expect(seen).toEqual([100, -60]);
  });
});

describe('first-kill guarantee', () => {
  const mk = (pending: () => boolean, seed = 1) => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const progress = new WorldProgress();
    const spawned: DropSpawn[] = [];
    const sys = new DropSystem({ wallet: new Wallet(bus, stats), progress, ownedItems: () => [], spawn: (d) => spawned.push(d), rng: new Rng(seed), stats, events: bus, firstKillPending: pending });
    const death = () => bus.emit('enemyDeath', { enemyId: 1, defId: 'hollow_soldier', dropTableId: 'drops_hollow_soldier', pos: { x: 0, y: 0, z: 0 }, souls: 1, killerId: null });
    return { progress, spawned, death, sys };
  };
  const keys = (s: DropSpawn[]) => s.filter((d) => d.loot?.[0]?.id === 'basement_key').length;

  it('re-drops each kill until taken, but never stacks a second copy on the ground', () => {
    let onGround = false;
    const r = mk(() => onGround);
    r.death();
    expect(keys(r.spawned)).toBe(1);
    onGround = true; // the first one is still lying there
    r.death();
    expect(keys(r.spawned)).toBe(1);
    onGround = false; // e.g. reloaded: the pickup is gone but was never taken
    r.death();
    expect(keys(r.spawned)).toBe(2);
    r.progress.setFlag('firstKill:hollow_soldier');
    r.death();
    expect(keys(r.spawned)).toBe(2);
  });
});

describe('drop rng persistence', () => {
  it('a reload continues the roll sequence instead of restarting it', () => {
    const run = (n: number, save?: ReturnType<typeof newSave>) => {
      const bus = new EventBus();
      const stats = new StatsResolver();
      const spawned: DropSpawn[] = [];
      const sys = new DropSystem({ wallet: new Wallet(bus, stats), progress: new WorldProgress(), ownedItems: () => ['m4_ar'], spawn: (d) => spawned.push(d), stats, events: bus });
      sys.load(save);
      for (let i = 0; i < n; i++) bus.emit('enemyDeath', { enemyId: i, defId: 'hollow_sword', dropTableId: 'drops_hollow_sword', pos: { x: 0, y: 0, z: 0 }, souls: 1, killerId: null });
      return { spawned, sys };
    };
    const whole = run(40);
    const first = run(15);
    const save = first.sys.writeSave(newSave());
    expect(save.killCounter).toBe(15);
    const restored = JSON.parse(JSON.stringify(save)) as typeof save;
    const second = run(25, restored);
    expect(second.sys.killCounter).toBe(40);
    expect([...first.spawned, ...second.spawned]).toEqual(whole.spawned); // identical to never reloading
    // ...and differs from a reload that forgot the counter
    expect(run(25).spawned).not.toEqual(second.spawned);
  });
});

describe('world progress persistence', () => {
  it('looted ids, opened chests/doors and flags round-trip through the save store', () => {
    const storage = mem();
    const store = new SaveStore(storage);
    const a = new WorldProgress();
    let changes = 0;
    a.onChange = () => changes++;
    a.markLooted('gym_item_1');
    a.markLooted('gym_item_1'); // idempotent
    a.markLooted('chest:gym_chest');
    a.markChestOpened('gym_chest');
    a.markDoorOpened('gym_door');
    a.setFlag('firstKill:hollow_soldier');
    expect(changes).toBe(5);
    const save = newSave();
    save.flags = ['other_system_flag'];
    expect(store.save(a.writeSave(save))).toBe(true);

    const loaded = store.load()!;
    const b = new WorldProgress();
    b.load(loaded);
    expect(b.isLooted('gym_item_1')).toBe(true);
    expect(b.isLooted('chest:gym_chest')).toBe(true);
    expect(b.isLooted('gym_item_2')).toBe(false);
    expect(b.isChestOpened('gym_chest')).toBe(true);
    expect(b.isDoorOpened('gym_door')).toBe(true);
    expect(b.hasFlag('firstKill:hollow_soldier')).toBe(true);
    expect(loaded.flags).toContain('other_system_flag');
  });

  it('partly-taken loot remainders round-trip', () => {
    const store = new SaveStore(mem());
    const a = new WorldProgress();
    a.markLooted('chest:c1');
    a.setPartial('chest:c1', [{ id: 'energy_drink', count: 2 }]);
    const save = a.writeSave(newSave());
    expect(store.save(save)).toBe(true);
    const b = new WorldProgress();
    b.load(store.load());
    expect(b.getPartial('chest:c1')).toEqual([{ id: 'energy_drink', count: 2 }]);
    b.setPartial('chest:c1', null);
    expect(b.getPartial('chest:c1')).toBeNull();
  });

  it('old saves without the new fields load with defaults', () => {
    const m = mem();
    m.setItem('cmw.save', JSON.stringify({ version: 1, souls: 5, inventory: [{ id: 'm4_ar', count: 1 }] }));
    const s = new SaveStore(m).load()!;
    expect(s.gearGranted).toBe(false);
    expect(s.killCounter).toBe(0);
    expect(s.partialLoot).toEqual({});
    expect(s.souls).toBe(5);
  });
});

describe('mag persistence', () => {
  it('saves equipped mags (keeping unequipped entries) and restores each gun once, clamped to its mag size', () => {
    const into: Record<string, number> = { smg_mp5: 7 };
    collectMags([{ id: 'm4_ar', mag: 12 }, null], into);
    expect(into).toEqual({ smg_mp5: 7, m4_ar: 12 });
    const r = new MagRestorer({ m4_ar: 12, smg_mp5: 7, m1911_pistol: 9999 });
    const m4 = { id: 'm4_ar', mag: 30 };
    r.apply([m4, null]);
    expect(m4.mag).toBe(12);
    m4.mag = 3; // live state wins afterwards
    r.apply([m4, null]);
    expect(m4.mag).toBe(3);
    const pistol = { id: 'm1911_pistol', mag: 8 };
    r.apply([m4, pistol]);
    expect(pistol.mag).toBe(8); // clamped to mag size
    const mp5 = { id: 'smg_mp5', mag: 30 };
    r.apply([mp5, null]); // equipped later: still gets its saved rounds
    expect(mp5.mag).toBe(7);
  });
});
