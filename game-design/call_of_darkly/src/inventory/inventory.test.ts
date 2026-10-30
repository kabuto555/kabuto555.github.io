import { describe, expect, it, vi } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { newSave } from '../core/save';
import { ACCESSORIES, ARMOR, STATS } from '../data';
import { evalCurve } from '../player/curve';
import { rollTierFromRatio } from '../player/rollTier';
import { AccessoryHooks } from './accessories';
import { absorbFraction, applyAbsorb, playerPoise, poiseHolds } from './absorb';
import { BELT_SIZE, GrenadePouch, QuickBeltImpl } from './belt';
import { InventoryEquipLoad, loadoutWeight, maxEquipLoad } from './equipLoad';
import { EquipmentImpl, EQUIP_SLOTS } from './equipment';
import { MODIFIER_BASE, StatsResolver } from './modifiers';
import { Inventory } from './store';
import { createInventorySystem, startingGear } from './system';
import type { ModifierKey } from './types';

function rig() {
  const bus = new EventBus();
  const stats = new StatsResolver();
  const hooks = new AccessoryHooks();
  const inv = new Inventory(bus);
  const eq = new EquipmentImpl({ inventory: inv, stats, events: bus, hooks });
  return { bus, stats, hooks, inv, eq };
}

function snapshot(s: StatsResolver): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(MODIFIER_BASE) as ModifierKey[]) out[k] = s.get(k);
  return out;
}

const dmg = (amount: number, type: DamageType, poiseDamage = 0): DamageEvent => ({
  source: 1, target: 0, amount, type, poiseDamage, hitPos: { x: 0, y: 0, z: 0 },
});

describe('InventoryStore', () => {
  it('add/remove/has/count and events', () => {
    const { bus, inv } = rig();
    const added = vi.fn();
    const removed = vi.fn();
    bus.on('itemAdded', added);
    bus.on('itemRemoved', removed);
    inv.add('energy_drink', 3);
    expect(inv.count('energy_drink')).toBe(3);
    expect(inv.has('energy_drink')).toBe(true);
    expect(added).toHaveBeenCalledWith({ itemId: 'energy_drink', count: 3, total: 3 });
    expect(inv.remove('energy_drink', 5)).toBe(false);
    expect(inv.count('energy_drink')).toBe(3);
    expect(inv.remove('energy_drink', 3)).toBe(true);
    expect(inv.has('energy_drink')).toBe(false);
    expect(removed).toHaveBeenCalledWith({ itemId: 'energy_drink', count: 3, total: 0 });
  });

  it('clamps to max stack and rejects unknown ids', () => {
    const { inv } = rig();
    expect(inv.add('m4_ar', 2)).toBe(1);
    expect(inv.count('m4_ar')).toBe(1);
    expect(inv.add('m4_ar')).toBe(0);
    expect(() => inv.add('nope')).toThrow();
  });

  it('save round-trip keeps ids and counts, skips unknown ids', () => {
    const { inv } = rig();
    inv.add('m4_ar');
    inv.add('frag_grenade', 4);
    const rows = JSON.parse(JSON.stringify(inv.serialize())) as { id: string; count: number }[];
    const inv2 = new Inventory(new EventBus());
    inv2.load([...rows, { id: 'removed_item', count: 2 }]);
    expect(inv2.serialize()).toEqual(rows);
  });
});

describe('Equipment validation', () => {
  it('slot rules: guns right, melee/shield left, armor by piece, accessories x2', () => {
    const { inv, eq } = rig();
    for (const id of ['m4_ar', 'm1911_pistol', 'combat_knife', 'riot_shield', 'bdu_shirt', 'patrol_cap', 'bounty_tag', 'marathon_patch']) inv.add(id);
    expect(eq.equip('right1', 'm4_ar')).toBe(true);
    expect(eq.equip('right2', 'combat_knife')).toBe(false);
    expect(eq.equip('left1', 'm1911_pistol')).toBe(false);
    expect(eq.equip('left1', 'riot_shield')).toBe(true);
    expect(eq.equip('left2', 'combat_knife')).toBe(true);
    expect(eq.equip('chest', 'patrol_cap')).toBe(false);
    expect(eq.equip('head', 'patrol_cap')).toBe(true);
    expect(eq.equip('chest', 'bdu_shirt')).toBe(true);
    expect(eq.equip('right2', 'bounty_tag')).toBe(false);
    expect(eq.equip('accessory1', 'bounty_tag')).toBe(true);
    expect(eq.equip('accessory2', 'marathon_patch')).toBe(true);
    expect(eq.equip('accessory1', 'm4_ar')).toBe(false);
    expect(eq.equip('right1', 'ghost_item')).toBe(false);
    expect(eq.loadout.right1).toBe('m4_ar');
  });

  it('rejects unowned items and duplicate accessories; one copy cannot fill two slots', () => {
    const { inv, eq } = rig();
    expect(eq.equip('right1', 'm4_ar')).toBe(false);
    inv.add('m4_ar');
    inv.add('bounty_tag');
    expect(eq.equip('right1', 'm4_ar')).toBe(true);
    expect(eq.equip('right2', 'm4_ar')).toBe(false);
    expect(eq.equip('accessory1', 'bounty_tag')).toBe(true);
    expect(eq.equip('accessory2', 'bounty_tag')).toBe(false);
    expect(eq.loadout.accessory2).toBeNull();
  });

  it('emits equipmentChanged only on change; unequip with null', () => {
    const { bus, inv, eq } = rig();
    const fn = vi.fn();
    bus.on('equipmentChanged', fn);
    inv.add('m4_ar');
    eq.equip('right1', 'm4_ar');
    eq.equip('right1', 'm4_ar');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ slot: 'right1', itemId: 'm4_ar', prev: null });
    eq.equip('right1', null);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(eq.loadout.right1).toBeNull();
  });

  it('removing an equipped item from the inventory unequips it (system reconcile)', () => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const player = { equipLoadProvider: { weight: () => 0, maxLoad: () => 1 }, levels: { endurance: 10 } };
    const setLoadout = vi.fn();
    const sys = createInventorySystem({ combat: { setLoadout }, player, events: bus, stats, hooks: new AccessoryHooks() });
    expect(sys.equipment.loadout.right1).toBe('m4_ar');
    sys.store.remove('m4_ar');
    expect(sys.equipment.loadout.right1).toBeNull();
    expect(setLoadout).toHaveBeenLastCalledWith([null, 'm1911_pistol'], ['combat_knife', null]);
  });
});

describe('equip load -> roll tier', () => {
  it('max load follows the Endurance curve x equipLoad modifier', () => {
    const stats = new StatsResolver();
    expect(maxEquipLoad(10, stats)).toBeCloseTo(evalCurve(STATS.maxEquipLoad, 10), 9);
    stats.register('acc:tac_vest_frame', ACCESSORIES.tac_vest_frame!.modifiers);
    expect(maxEquipLoad(10, stats)).toBeCloseTo(evalCurve(STATS.maxEquipLoad, 10) * 1.4, 9);
    expect(maxEquipLoad(50, stats)).toBeGreaterThan(maxEquipLoad(10, stats));
  });

  it('tier boundaries via provider: <0.25 fast, 0.25/0.5 normal, 1.0 slow, >1 fat', () => {
    const { inv, eq, stats } = rig();
    let endurance = 10;
    const prov = new InventoryEquipLoad(eq, () => endurance, stats);
    inv.add('m4_ar'); // weight 3
    eq.equip('right1', 'm4_ar');
    expect(prov.weight()).toBe(3);
    const w = prov.weight();
    const tierAt = (ratio: number) => {
      // choose endurance-independent check: compare against rollTierFromRatio at that ratio
      return rollTierFromRatio(ratio);
    };
    expect(tierAt(0.2499)).toBe('fast');
    expect(tierAt(0.25)).toBe('normal');
    expect(tierAt(0.5)).toBe('normal');
    expect(tierAt(0.5001)).toBe('slow');
    expect(tierAt(1)).toBe('slow');
    expect(tierAt(1.0001)).toBe('fat');
    // Real provider: lowest endurance (max load 40) vs heavier kits.
    endurance = 1;
    expect(prov.maxLoad()).toBe(40);
    expect(prov.ratio()).toBeCloseTo(w / 40, 9);
    expect(prov.rollTier()).toBe('fast'); // 3/40 = 0.075
    for (const id of ['riot_shield', 'black_knights_halberd', 'rpg', 'eod_helmet', 'eod_jacket', 'eod_gauntlets', 'eod_trousers']) inv.add(id);
    eq.equip('left1', 'riot_shield'); // +9 = 12 -> 0.3
    expect(prov.rollTier()).toBe('normal');
    eq.equip('left2', 'black_knights_halberd'); // +12 = 24 -> 0.6
    expect(prov.rollTier()).toBe('slow');
    eq.equip('right2', 'rpg'); // +6 = 30 -> 0.75
    for (const [s, id] of [['head', 'eod_helmet'], ['chest', 'eod_jacket'], ['arms', 'eod_gauntlets'], ['legs', 'eod_trousers']] as const) eq.equip(s, id); // +12 = 42 -> 1.05
    expect(prov.weight()).toBe(42);
    expect(prov.rollTier()).toBe('fat');
    endurance = 99; // max 90 -> 0.467
    expect(prov.rollTier()).toBe('normal');
    // Tac Vest Frame lifts max load by 40%.
    inv.add('tac_vest_frame');
    endurance = 1;
    eq.equip('accessory1', 'tac_vest_frame'); // max 56 -> 0.75
    expect(prov.maxLoad()).toBeCloseTo(56, 9);
    expect(prov.rollTier()).toBe('slow');
  });

  it('exact tier thresholds with a stub weight source', () => {
    const stats = new StatsResolver();
    let weight = 0;
    const prov = new InventoryEquipLoad({ weight: () => weight }, () => 1, stats); // max 40
    const tier = (w: number) => ((weight = w), prov.rollTier());
    expect(tier(0)).toBe('fast');
    expect(tier(9.99)).toBe('fast');
    expect(tier(10)).toBe('normal');
    expect(tier(20)).toBe('normal');
    expect(tier(20.01)).toBe('slow');
    expect(tier(40)).toBe('slow');
    expect(tier(40.01)).toBe('fat');
  });

  it('loadout weight excludes accessories', () => {
    const { inv, eq } = rig();
    inv.add('bounty_tag');
    eq.equip('accessory1', 'bounty_tag');
    expect(eq.weight()).toBe(0);
    expect(loadoutWeight(eq.loadout)).toBe(0);
  });
});

describe('absorb + poise', () => {
  it('stacks armor pieces per damage type', () => {
    const { inv, eq, stats } = rig();
    for (const id of ['patrol_cap', 'bdu_shirt']) inv.add(id);
    eq.equip('head', 'patrol_cap');
    eq.equip('chest', 'bdu_shirt');
    const a = ARMOR.patrol_cap!;
    const b = ARMOR.bdu_shirt!;
    expect(absorbFraction(DamageType.Physical, stats)).toBeCloseTo(a.physAbsorb + b.physAbsorb, 9);
    expect(applyAbsorb(dmg(100, DamageType.Physical), stats)).toBeCloseTo(100 * (1 - a.physAbsorb - b.physAbsorb), 9);
    expect(applyAbsorb(dmg(100, DamageType.Fire), stats)).toBeCloseTo(100 * (1 - a.fireAbsorb - b.fireAbsorb), 9);
    expect(playerPoise(stats)).toBe(a.poise + b.poise);
  });

  it('caps: phys 0.7, fire/explosive 0.8, including accessory fire absorb', () => {
    const { inv, eq, stats } = rig();
    const heavy: [string, string][] = [
      ['head', 'eod_helmet'], ['chest', 'eod_jacket'], ['arms', 'eod_gauntlets'], ['legs', 'eod_trousers'],
    ];
    for (const [, id] of heavy) inv.add(id);
    for (const [s, id] of heavy) eq.equip(s as 'head', id);
    expect(absorbFraction(DamageType.Explosive, stats)).toBeCloseTo(0.64, 9); // 4 x 0.16, under the cap
    // Force phys over cap with extra source.
    stats.register('test:big', [{ key: 'physAbsorb', op: 'add', value: 5 }, { key: 'fireAbsorb', op: 'add', value: 5 }, { key: 'explosiveAbsorb', op: 'add', value: 0.5 }]);
    expect(absorbFraction(DamageType.Explosive, stats)).toBe(0.8);
    expect(absorbFraction(DamageType.Physical, stats)).toBe(0.7);
    expect(absorbFraction(DamageType.Fire, stats)).toBe(0.8);
    expect(applyAbsorb(dmg(200, DamageType.Physical), stats)).toBeCloseTo(60, 9);
    // A stub reader that ignores caps is still clamped.
    expect(absorbFraction(DamageType.Physical, { get: () => 3, has: () => true })).toBe(0.7);
  });

  it('Fire Discipline adds 0.25 fire absorb on top of armor', () => {
    const { inv, eq, stats } = rig();
    inv.add('fire_discipline_patch');
    eq.equip('accessory1', 'fire_discipline_patch');
    expect(absorbFraction(DamageType.Fire, stats)).toBeCloseTo(0.25, 9);
  });

  it('poise holds when total >= poise damage', () => {
    const { inv, eq, stats } = rig();
    inv.add('rusted_helm');
    eq.equip('head', 'rusted_helm'); // poise 10
    expect(poiseHolds(10, stats)).toBe(true);
    expect(poiseHolds(10.01, stats)).toBe(false);
    expect(poiseHolds(0, stats)).toBe(true);
  });

  it('Ghillie set bonus needs 2+ pieces and is removed below that', () => {
    const { inv, eq, stats } = rig();
    for (const id of ['ghillie_hood', 'ghillie_wrap', 'ghillie_leggings']) inv.add(id);
    const base = stats.get('aggroRadius');
    eq.equip('head', 'ghillie_hood');
    expect(stats.get('aggroRadius')).toBe(base);
    eq.equip('chest', 'ghillie_wrap');
    expect(stats.get('aggroRadius')).toBeCloseTo(0.65, 9);
    eq.equip('legs', 'ghillie_leggings');
    expect(stats.get('aggroRadius')).toBeCloseTo(0.65, 9); // does not stack per piece
    eq.equip('chest', null);
    eq.equip('legs', null);
    expect(stats.get('aggroRadius')).toBe(base);
    expect(stats.hasSource('set:ghillie_suit')).toBe(false);
  });

  it('swapping armor replaces its contribution exactly', () => {
    const { inv, eq, stats } = rig();
    inv.add('patrol_cap');
    inv.add('fast_helmet');
    const empty = snapshot(stats);
    eq.equip('head', 'patrol_cap');
    eq.equip('head', 'fast_helmet');
    eq.equip('head', null);
    expect(snapshot(stats)).toEqual(empty);
  });
});

describe('accessories', () => {
  it('register/unregister restores stats exactly (all 9)', () => {
    const { inv, eq, stats } = rig();
    const ids = Object.keys(ACCESSORIES);
    expect(ids).toHaveLength(9);
    const before = snapshot(stats);
    for (const id of ids) {
      inv.add(id);
      expect(eq.equip('accessory1', id)).toBe(true);
      expect(stats.hasSource(`acc:${id}`)).toBe(true);
      expect(snapshot(stats)).not.toEqual(before);
      eq.equip('accessory1', null);
      expect(stats.hasSource(`acc:${id}`)).toBe(false);
      expect(snapshot(stats)).toEqual(before);
    }
  });

  it('applies the PLAN values', () => {
    const { inv, eq, stats } = rig();
    inv.add('sleight_of_hand_patch');
    inv.add('dead_silence_patch');
    eq.equip('accessory1', 'sleight_of_hand_patch');
    eq.equip('accessory2', 'dead_silence_patch');
    expect(stats.get('reloadSpeed')).toBeCloseTo(1.4, 9);
    expect(stats.get('footstepVolume')).toBe(0);
    expect(stats.get('hearingRadius')).toBeCloseTo(0.5, 9);
  });

  it('martyrdom: modifier flag plus playerDeath hook only while equipped', () => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const hooks = new AccessoryHooks();
    const player = { equipLoadProvider: { weight: () => 0, maxLoad: () => 1 }, levels: { endurance: 10 } };
    const sys = createInventorySystem({ combat: { setLoadout: () => {} }, player, events: bus, stats, hooks });
    const fn = vi.fn();
    sys.hooks.on('playerDeath', fn);
    const pos = { x: 1, y: 2, z: 3 };
    bus.emit('playerDied', { pos, souls: 50 });
    expect(fn).not.toHaveBeenCalled();
    sys.store.add('martyrdom_dogtag');
    sys.equipment.equip('accessory2', 'martyrdom_dogtag');
    expect(stats.has('martyrdom')).toBe(true);
    bus.emit('playerDied', { pos, souls: 50 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ pos, souls: 50 }, 'martyrdom_dogtag');
    sys.equipment.equip('accessory2', null);
    bus.emit('playerDied', { pos, souls: 50 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('quick belt', () => {
  it('cycles forward/back skipping empty slots and count-0 items', () => {
    const { bus, inv } = rig();
    const belt = new QuickBeltImpl(inv, bus);
    inv.add('energy_drink', 2);
    inv.add('dogtags_large', 1);
    inv.add('extraction_flare', 1);
    expect(belt.assign(0, 'energy_drink')).toBe(true);
    expect(belt.assign(2, 'dogtags_large')).toBe(true);
    expect(belt.assign(4, 'extraction_flare')).toBe(true);
    expect(belt.assign(5, 'energy_drink')).toBe(false);
    expect(belt.assign(1, 'm4_ar')).toBe(false);
    expect(belt.assign(1, 'frag_grenade')).toBe(false); // grenades live in the pouch
    expect(belt.current()).toBe('energy_drink');
    expect(belt.cycle()).toBe('dogtags_large');
    expect(belt.selected).toBe(2);
    expect(belt.cycle()).toBe('extraction_flare');
    expect(belt.cycle()).toBe('energy_drink'); // wraps over empty 1/3
    expect(belt.cycle(-1)).toBe('extraction_flare');
    // use dogtags to 0: skipped afterwards, slot stays assigned
    belt.cycle(-1);
    expect(belt.current()).toBe('dogtags_large');
    expect(belt.use()).toBe('dogtags_large');
    expect(inv.count('dogtags_large')).toBe(0);
    expect(belt.use()).toBeNull();
    expect(belt.slots[2]).toBe('dogtags_large');
    expect(belt.cycle()).toBe('extraction_flare');
    expect(belt.cycle()).toBe('energy_drink');
    expect(belt.cycle()).toBe('extraction_flare');
  });

  it('cycle with nothing usable returns null and keeps selection; use decrements', () => {
    const { bus, inv } = rig();
    const belt = new QuickBeltImpl(inv, bus);
    expect(belt.cycle()).toBeNull();
    expect(belt.selected).toBe(0);
    inv.add('energy_drink', 2);
    belt.assign(3, 'energy_drink');
    expect(belt.cycle()).toBe('energy_drink');
    expect(belt.use()).toBe('energy_drink');
    expect(inv.count('energy_drink')).toBe(1);
    expect(belt.slots).toHaveLength(BELT_SIZE);
  });

  it('grenade pouch cycles owned grenades in data order', () => {
    const { inv } = rig();
    const pouch = new GrenadePouch(inv);
    expect(pouch.current()).toBeNull();
    inv.add('flashbang', 1);
    inv.add('frag_grenade', 2);
    expect(pouch.current()).toBe('frag_grenade');
    expect(pouch.cycle()).toBe('flashbang');
    expect(pouch.cycle()).toBe('frag_grenade');
    expect(pouch.use()).toBe('frag_grenade');
    expect(inv.count('frag_grenade')).toBe(1);
  });
});

describe('system + save round trip', () => {
  const player = () => ({ equipLoadProvider: { weight: () => 0, maxLoad: () => 1 }, levels: { endurance: 10 } });

  it('start gear holds no accessories (F3 scavenger patch must be pickable on a fresh save)', () => {
    const g = startingGear();
    for (const id of g.items) expect(ACCESSORIES[id]).toBeUndefined();
    const inv = new Inventory();
    inv.load(g.items.map((id) => ({ id, count: 1 })));
    expect(inv.count('scavenger_patch')).toBe(0);
    expect(inv.add('scavenger_patch', 1)).toBe(1);
    expect(inv.add('scavenger_patch', 1)).toBe(0); // duplicate of a unique accessory is refused
  });

  it('new game grants + equips start gear, wires provider and combat', () => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const p = player();
    const setLoadout = vi.fn();
    const sys = createInventorySystem({ combat: { setLoadout }, player: p, save: newSave(), events: bus, stats, hooks: new AccessoryHooks() });
    const g = startingGear();
    expect(g.equipment).toEqual({
      right1: 'm4_ar', right2: 'm1911_pistol', left1: 'combat_knife',
      head: 'patrol_cap', chest: 'bdu_shirt', arms: 'shooting_gloves', legs: 'cargo_pants',
    });
    expect(p.equipLoadProvider).toBe(sys.equipLoad);
    expect(setLoadout).toHaveBeenLastCalledWith(['m4_ar', 'm1911_pistol'], ['combat_knife', null]);
    expect(sys.equipLoad.weight()).toBeCloseTo(3 + 3 + 1 + 4 * 0.9, 6);
    expect(sys.equipment.rollTier()).toBe('fast'); // PLAN §5: starting kit rolls fast
    // combat re-synced when a hand slot changes, not for armor
    setLoadout.mockClear();
    sys.store.add('riot_shield');
    sys.equipment.equip('left2', 'riot_shield');
    expect(setLoadout).toHaveBeenCalledTimes(1);
    sys.store.add('fast_helmet');
    sys.equipment.equip('head', 'fast_helmet');
    expect(setLoadout).toHaveBeenCalledTimes(1);
  });

  it('serialize -> JSON -> load restores inventory, equipment, belt, grenade, stats', () => {
    const mk = () => {
      const bus = new EventBus();
      const stats = new StatsResolver();
      return { bus, stats, sys: createInventorySystem({ combat: { setLoadout: () => {} }, player: player(), events: bus, stats, hooks: new AccessoryHooks() }) };
    };
    const a = mk();
    for (const id of ['plate_carrier', 'bounty_tag', 'fire_discipline_patch']) a.sys.store.add(id);
    a.sys.store.add('energy_drink', 3);
    a.sys.store.add('molotov', 2);
    a.sys.equipment.equip('chest', 'plate_carrier');
    a.sys.equipment.equip('accessory1', 'bounty_tag');
    a.sys.equipment.equip('accessory2', 'fire_discipline_patch');
    a.sys.belt.assign(0, null); // (auto-assigned to slot 0 on pickup)
    a.sys.belt.assign(2, 'energy_drink');
    a.sys.pouch.cycle();
    const save = a.sys.writeSave(newSave());
    const json = JSON.parse(JSON.stringify(save)) as typeof save;
    expect(json.equipment.chest).toBe('plate_carrier');
    expect(json.quickBelt[2]).toBe('energy_drink');
    expect(json.grenade).toBe('molotov');

    const b = mk();
    b.sys.load(json);
    expect(b.sys.store.serialize()).toEqual(a.sys.store.serialize());
    expect(b.sys.equipment.serialize()).toEqual(a.sys.equipment.serialize());
    expect(b.sys.belt.serialize()).toEqual(a.sys.belt.serialize());
    expect(b.sys.belt.selected).toBe(2);
    expect(b.sys.pouch.selected).toBe('molotov');
    expect(snapshot(b.stats)).toEqual(snapshot(a.stats));
    expect(b.sys.equipment.weight()).toBe(a.sys.equipment.weight());
  });

  it('load drops equipment entries the inventory does not own and unknown ids', () => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const sys = createInventorySystem({ combat: { setLoadout: () => {} }, player: player(), events: bus, stats, hooks: new AccessoryHooks() });
    const s = newSave();
    s.inventory = [{ id: 'm4_ar', count: 1 }, { id: 'gone', count: 1 }];
    s.equipment = { right1: 'm4_ar', right2: 'rpg', left1: 'gone' };
    sys.load(s);
    expect(sys.equipment.serialize()).toEqual({ right1: 'm4_ar' });
    expect(EQUIP_SLOTS).toHaveLength(10);
  });
});

describe('gearGranted + belt auto-assign', () => {
  const mk = (save?: ReturnType<typeof newSave> | null) => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const player = { equipLoadProvider: { weight: () => 0, maxLoad: () => 1 }, levels: { endurance: 10 } };
    const sys = createInventorySystem({ combat: { setLoadout: () => {} }, player, events: bus, stats, hooks: new AccessoryHooks(), save });
    return { bus, sys };
  };

  it('a played save with an emptied inventory does NOT regrant the start gear', () => {
    const a = mk();
    expect(a.sys.store.count('m4_ar')).toBe(1);
    // player sells/drops everything
    for (const s of a.sys.store.list()) a.sys.store.remove(s.id, s.count);
    const save = JSON.parse(JSON.stringify(a.sys.writeSave(newSave()))) as ReturnType<typeof newSave>;
    expect(save.gearGranted).toBe(true);
    expect(save.inventory).toEqual([]);
    const b = mk(save);
    expect(b.sys.store.list()).toEqual([]);
    expect(b.sys.equipment.loadout.right1).toBeNull();
  });

  it('a fresh/legacy empty save still grants once and flags it', () => {
    const b = mk(newSave());
    expect(b.sys.store.count('m4_ar')).toBe(1);
    expect(b.sys.writeSave(newSave()).gearGranted).toBe(true);
    // a legacy non-empty save (no flag) is kept as is and gets flagged
    const legacy = newSave();
    legacy.inventory = [{ id: 'm1911_pistol', count: 1 }];
    const c = mk(legacy);
    expect(c.sys.store.count('m4_ar')).toBe(0);
    expect(c.sys.writeSave(newSave()).gearGranted).toBe(true);
  });

  it('first acquisition of a consumable fills the first empty belt slot (and selects it)', () => {
    const { bus, sys } = mk();
    const changed = vi.fn();
    bus.on('quickBeltChanged', changed);
    sys.store.add('energy_drink', 2);
    expect(sys.belt.slots[0]).toBe('energy_drink');
    expect(sys.belt.current()).toBe('energy_drink');
    expect(changed).toHaveBeenCalled();
    sys.store.add('energy_drink'); // already on the belt: no second slot
    expect(sys.belt.slots.filter((s) => s === 'energy_drink')).toHaveLength(1);
    sys.store.add('plate_carrier'); // not a consumable
    expect(sys.belt.slots.filter((s) => s !== null)).toHaveLength(1);
  });
});
