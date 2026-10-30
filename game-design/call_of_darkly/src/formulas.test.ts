import { describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from './core/entity';
import { ARMOR, ARMOR_SETS, STATS, WEAPONS, levelCost } from './data';
import type { EquipSlot, GunDef, ItemId } from './data/types';
import { absorbFraction, applyAbsorb } from './inventory/absorb';
import { loadoutWeight, maxEquipLoad } from './inventory/equipLoad';
import { StatsResolver } from './inventory/modifiers';
import type { Modifier } from './inventory/types';
import { bulletDamage, damageFalloff } from './combat/math';
import { COMBAT_TUNING as C } from './combat/tuning';
import { equipLoadRatio, rollTierFromRatio } from './player/rollTier';
import { rollTierForLoad } from './inventory/equipLoad';

// ------------------------------------------------------------------ helpers

const EMPTY_LOADOUT = (): Record<EquipSlot, ItemId | null> => ({
  right1: null, right2: null, left1: null, left2: null,
  head: null, chest: null, arms: null, legs: null,
  accessory1: null, accessory2: null,
});

const dmg = (amount: number, type: DamageType): DamageEvent => ({
  source: 1, target: 0, amount, type, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 },
});

/** Register every worn armor piece the way EquipmentImpl does (`armor:<id>`, add ops). */
function wear(ids: readonly ItemId[], extra: Modifier[] = []): StatsResolver {
  const s = new StatsResolver();
  for (const id of ids) {
    const a = ARMOR[id]!;
    const m: Modifier[] = [];
    if (a.physAbsorb) m.push({ key: 'physAbsorb', op: 'add', value: a.physAbsorb });
    if (a.fireAbsorb) m.push({ key: 'fireAbsorb', op: 'add', value: a.fireAbsorb });
    if (a.explosiveAbsorb) m.push({ key: 'explosiveAbsorb', op: 'add', value: a.explosiveAbsorb });
    if (m.length) s.register(`armor:${id}`, m);
  }
  if (extra.length) s.register('test:extra', extra);
  return s;
}

const SET = (set: keyof typeof ARMOR_SETS) => [...ARMOR_SETS[set].pieces] as ItemId[];

/** Stub reader returning a fixed raw value for every key (for clamp tests). */
const stub = (v: number) => ({ get: () => v, has: () => v > 0 });

/** The PLAN §8 formula, written independently of src/data/stats.ts. */
const planCost = (L: number) => Math.max(STATS.levelCostFloor, Math.round(0.02 * L ** 3 + 3.06 * L ** 2 + 105.6 * L - 895));

// ------------------------------------------------------------------ level cost (PLAN §8)

describe('levelCost (PLAN §8)', () => {
  it('matches the PLAN formula with floor for L = 1..20', () => {
    for (let L = 1; L <= 20; L++) expect(levelCost(L)).toBe(planCost(L));
  });

  it('low levels sit on the floor; first level above the floor is L=8', () => {
    for (let L = 1; L <= 7; L++) expect(levelCost(L)).toBe(STATS.levelCostFloor);
    expect(levelCost(8)).toBe(156);
    expect(levelCost(10)).toBe(487);
    expect(levelCost(20)).toBe(2601);
  });

  it('is monotonic non-decreasing for L = 1..20', () => {
    let prev = -Infinity;
    for (let L = 1; L <= 20; L++) {
      const c = levelCost(L);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('is strictly increasing once above the floor', () => {
    for (let L = 9; L <= 20; L++) expect(levelCost(L)).toBeGreaterThan(levelCost(L - 1));
  });
});

// ------------------------------------------------------------------ armor absorb

describe('absorb fraction and damage (PLAN §5)', () => {
  const types = [DamageType.Physical, DamageType.Fire, DamageType.Explosive] as const;

  it('no armor: every type absorbs 0 and takes full damage', () => {
    const s = new StatsResolver();
    for (const t of types) {
      expect(absorbFraction(t, s)).toBe(0);
      expect(applyAbsorb(dmg(50, t), s)).toBe(50);
    }
  });

  it('one piece: absorb equals that piece\'s data value for its type only', () => {
    const plate = wear(['plate_carrier']);
    expect(absorbFraction(DamageType.Physical, plate)).toBeCloseTo(ARMOR.plate_carrier!.physAbsorb);
    expect(absorbFraction(DamageType.Fire, plate)).toBeCloseTo(ARMOR.plate_carrier!.fireAbsorb);
    expect(applyAbsorb(dmg(100, DamageType.Physical), plate)).toBeCloseTo(100 * (1 - ARMOR.plate_carrier!.physAbsorb));
  });

  it('full operator set: absorb is the sum of its four pieces', () => {
    const ids = SET('operator_fatigues');
    const s = wear(ids);
    const phys = ids.reduce((a, id) => a + ARMOR[id]!.physAbsorb, 0);
    expect(absorbFraction(DamageType.Physical, s)).toBeCloseTo(phys);
    expect(applyAbsorb(dmg(100, DamageType.Physical), s)).toBeCloseTo(100 * (1 - phys));
  });

  it('full EOD set: explosive absorb is the sum of its pieces and stays under the 0.8 cap', () => {
    const ids = SET('eod_bomb_suit');
    const s = wear(ids);
    const expl = ids.reduce((a, id) => a + ARMOR[id]!.explosiveAbsorb, 0);
    expect(absorbFraction(DamageType.Explosive, s)).toBeCloseTo(expl);
    expect(expl).toBeLessThanOrEqual(0.8);
    expect(applyAbsorb(dmg(100, DamageType.Explosive), s)).toBeCloseTo(100 * (1 - expl));
  });

  it('physical absorb caps at 0.7 even when pieces stack past it', () => {
    const s = wear(SET('plate_carrier'), [{ key: 'physAbsorb', op: 'add', value: 0.9 }]);
    expect(absorbFraction(DamageType.Physical, s)).toBe(0.7);
    expect(applyAbsorb(dmg(100, DamageType.Physical), s)).toBeCloseTo(30);
  });

  it('fire and explosive absorb cap at 0.8', () => {
    const s = wear([], [
      { key: 'fireAbsorb', op: 'add', value: 0.95 },
      { key: 'explosiveAbsorb', op: 'add', value: 0.95 },
    ]);
    expect(absorbFraction(DamageType.Fire, s)).toBe(0.8);
    expect(absorbFraction(DamageType.Explosive, s)).toBe(0.8);
    expect(applyAbsorb(dmg(100, DamageType.Fire), s)).toBeCloseTo(20);
  });

  it('absorb is clamped to 0 below and never produces negative damage', () => {
    expect(absorbFraction(DamageType.Physical, stub(-0.5))).toBe(0);
    expect(applyAbsorb(dmg(40, DamageType.Physical), stub(-0.5))).toBe(40);
    expect(applyAbsorb(dmg(40, DamageType.Physical), stub(5))).toBeCloseTo(40 * 0.3);
    expect(applyAbsorb(dmg(40, DamageType.Fire), stub(5))).toBeCloseTo(40 * 0.2);
    expect(applyAbsorb(dmg(0, DamageType.Physical), stub(0.7))).toBe(0);
    for (const v of [-10, -1, 0, 0.3, 0.7, 1, 10]) {
      expect(applyAbsorb(dmg(25, DamageType.Explosive), stub(v))).toBeGreaterThanOrEqual(0);
    }
  });
});

// ------------------------------------------------------------------ equip load

describe('equip load and roll tiers (PLAN §3, §5)', () => {
  // Real data loadouts. Weights come from the item tables, not hard-coded numbers.
  const light = (() => {
    const l = EMPTY_LOADOUT();
    Object.assign(l, {
      right1: 'm4_ar', right2: 'm1911_pistol', left1: 'combat_knife',
      head: 'patrol_cap', chest: 'bdu_shirt', arms: 'shooting_gloves', legs: 'cargo_pants',
    });
    return l;
  })();
  const medium = (() => {
    const l = EMPTY_LOADOUT();
    Object.assign(l, {
      right1: 'smg_mp5', right2: 'revolver_357', left1: 'riot_shield',
      head: 'fast_helmet', chest: 'plate_carrier', arms: 'kevlar_sleeves', legs: 'knee_pad_pants',
    });
    return l;
  })();
  const heavy = (() => {
    const l = EMPTY_LOADOUT();
    Object.assign(l, {
      right1: 'rpg', right2: 'marksman_rifle', left1: 'riot_shield', left2: 'ballistic_shield',
      head: 'eod_helmet', chest: 'eod_jacket', arms: 'eod_gauntlets', legs: 'eod_trousers',
    });
    return l;
  })();

  const expectedWeight = (l: Record<EquipSlot, ItemId | null>) => {
    let w = 0;
    for (const id of Object.values(l)) {
      if (!id) continue;
      const wpn = WEAPONS[id];
      const arm = ARMOR[id];
      w += (wpn?.weight ?? arm?.weight ?? 0);
    }
    return w;
  };

  it('loadoutWeight sums real weights for the three sample loadouts', () => {
    expect(loadoutWeight(light)).toBeCloseTo(expectedWeight(light));
    expect(loadoutWeight(medium)).toBeCloseTo(expectedWeight(medium));
    expect(loadoutWeight(heavy)).toBeCloseTo(expectedWeight(heavy));
    expect(loadoutWeight(light)).toBeLessThan(loadoutWeight(medium));
    expect(loadoutWeight(medium)).toBeLessThan(loadoutWeight(heavy));
  });

  it('boundaries: <0.25 fast, exactly 0.25 normal, exactly 0.5 normal, exactly 1.0 slow, >1 fat', () => {
    expect(rollTierFromRatio(0.2499)).toBe('fast');
    expect(rollTierFromRatio(0.25)).toBe('normal');
    expect(rollTierFromRatio(0.5)).toBe('normal');
    expect(rollTierFromRatio(0.5001)).toBe('slow');
    expect(rollTierFromRatio(1)).toBe('slow');
    expect(rollTierFromRatio(1.0001)).toBe('fat');
  });

  it('rollTierForLoad hits every boundary with a real loadout weight', () => {
    const w = loadoutWeight(medium);
    expect(rollTierForLoad(w, w / 0.2)).toBe('fast');
    expect(rollTierForLoad(w, w / 0.25)).toBe('normal');
    expect(rollTierForLoad(w, w / 0.5)).toBe('normal');
    expect(rollTierForLoad(w, w / 1)).toBe('slow');
    expect(rollTierForLoad(w, w / 1.01)).toBe('fat');
  });

  it('zero max load: any weight is fat, no weight is fast', () => {
    expect(equipLoadRatio(5, 0)).toBe(Infinity);
    expect(rollTierForLoad(5, 0)).toBe('fat');
    expect(rollTierForLoad(0, 0)).toBe('fast');
  });

  it('sample loadouts at start Endurance land in the expected tier', () => {
    const mods = new StatsResolver();
    const max = maxEquipLoad(STATS.start.endurance, mods);
    // Tiers are asserted from the actual ratio so the test follows data tuning.
    const tierOf = (l: Record<EquipSlot, ItemId | null>) => rollTierForLoad(loadoutWeight(l), max);
    for (const [l, name] of [[light, 'light'], [medium, 'medium'], [heavy, 'heavy']] as const) {
      const r = loadoutWeight(l) / max;
      const want = r < 0.25 ? 'fast' : r <= 0.5 ? 'normal' : r <= 1 ? 'slow' : 'fat';
      expect(tierOf(l), name).toBe(want);
    }
  });

  it('maxEquipLoad grows with Endurance (curve endpoints and monotonic)', () => {
    const mods = new StatsResolver();
    expect(maxEquipLoad(1, mods)).toBeCloseTo(STATS.maxEquipLoad[0]![1]);
    expect(maxEquipLoad(99, mods)).toBeCloseTo(STATS.maxEquipLoad[1]![1]);
    let prev = -Infinity;
    for (let e = 1; e <= 99; e++) {
      const v = maxEquipLoad(e, mods);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(maxEquipLoad(20, mods)).toBeGreaterThan(maxEquipLoad(10, mods));
  });

  it('equipLoad modifier scales max load multiplicatively (Tac Vest Frame +40%)', () => {
    const base = maxEquipLoad(10, new StatsResolver());
    const s = new StatsResolver();
    s.register('acc:tac_vest_frame', [{ key: 'equipLoad', op: 'pct', value: 0.4 }]);
    expect(maxEquipLoad(10, s)).toBeCloseTo(base * 1.4);
  });
});

// ------------------------------------------------------------------ falloff and headshots

describe('damage falloff (combat/math)', () => {
  const range = 40;
  const falloffMin = 0.5;
  const start = range * C.falloffStartFrac;

  it('0 m: full damage', () => {
    expect(damageFalloff(range, falloffMin, 0)).toBe(1);
  });

  it('at start distance: full damage; just past it: below full', () => {
    expect(damageFalloff(range, falloffMin, start)).toBe(1);
    expect(damageFalloff(range, falloffMin, start + 0.5)).toBeLessThan(1);
  });

  it('at range: falloffMin; beyond range: flat at falloffMin', () => {
    expect(damageFalloff(range, falloffMin, range)).toBeCloseTo(falloffMin);
    expect(damageFalloff(range, falloffMin, range + 1)).toBeCloseTo(falloffMin);
    expect(damageFalloff(range, falloffMin, 1000)).toBeCloseTo(falloffMin);
  });

  it('linear between start and range', () => {
    const mid = (start + range) / 2;
    expect(damageFalloff(range, falloffMin, mid)).toBeCloseTo(0.75);
  });

  it('real gun: damage at point-blank vs beyond range matches falloffMin', () => {
    const g = WEAPONS.m4_ar as GunDef;
    expect(bulletDamage(g, 0, false, 1)).toBeCloseTo(g.damage);
    expect(bulletDamage(g, g.range * 10, false, 1)).toBeCloseTo(g.damage * g.falloffMin);
  });
});

describe('headshot multiplier (applied once)', () => {
  const gun = { damage: 10, range: 40, falloffMin: 0.5, headshotMult: 2.5 };

  it('body shot at point-blank: base damage', () => {
    expect(bulletDamage(gun, 0, false, 1)).toBe(10);
  });

  it('headshot multiplies by headshotMult exactly once', () => {
    expect(bulletDamage(gun, 0, true, 1)).toBeCloseTo(25);
  });

  it('headshot composes with stat multiplier and falloff without double-applying', () => {
    expect(bulletDamage(gun, 0, true, 1.5)).toBeCloseTo(37.5);
    expect(bulletDamage(gun, 40, true, 1)).toBeCloseTo(10 * 0.5 * 2.5);
  });

  it('real marksman rifle headshot equals damage x headshotMult', () => {
    const mk = WEAPONS.marksman_rifle as GunDef;
    expect(bulletDamage(mk, 0, true, 1)).toBeCloseTo(mk.damage * mk.headshotMult);
  });
});
