import { describe, it, expect } from 'vitest';
import { BURG, BURG_NAV, BURG_TAURUS_ORIGIN, BURG_TELEPORTS, BURG_TRIGGERS } from './burg';
import { createLevelDsl } from '../dsl';
import { ENEMIES } from '../../data/enemies';
import { SHOPS } from '../../data/shops';
import { areaAtPosition, burgBlend } from '../transitions';
import type { LevelOp } from '../types';
import { ITEMS_BY_ID } from '../../data';

const B_IDS = Array.from({ length: 17 }, (_, i) => `B${i + 1}`);

describe('Undead Burg layout', () => {
  const dsl = createLevelDsl();
  BURG.build(dsl);
  const ops: LevelOp[] = dsl.ops;

  for (const id of B_IDS) {
    it(`${id} exists exactly once`, () => {
      const m = ops.filter((o) => (o.op === 'item' || o.op === 'chest' || o.op === 'mimic') && o.id === id);
      expect(m).toHaveLength(1);
    });
  }

  it('B7 is the mimic; B3/B4/B6/B8/B10/B15 are chests', () => {
    expect(ops.some((o) => o.op === 'mimic' && o.id === 'B7')).toBe(true);
    for (const id of ['B3', 'B4', 'B6', 'B8', 'B10', 'B15']) expect(ops.some((o) => o.op === 'chest' && o.id === id)).toBe(true);
  });

  it('every spawn def exists in the enemy data and each beat archetype is placed', () => {
    const defs = ops.filter((o): o is Extract<LevelOp, { op: 'spawn' }> => o.op === 'spawn').map((o) => o.enemy);
    for (const d of defs) expect(ENEMIES[d], d).toBeDefined();
    for (const d of ['barrel_hollow', 'black_knight', 'hollow_soldier', 'hollow_crossbow', 'hollow_firebomb', 'hollow_sword']) expect(defs).toContain(d);
  });

  it('triggers refer to placed spawn ids', () => {
    const ids = ops.filter((o) => o.op === 'spawn').map((o) => (o as { id?: string }).id);
    for (const t of BURG_TRIGGERS) if (t.spawnId) expect(ids).toContain(t.spawnId);
  });

  it('Taurus origin + deck exist: deck top at origin y, 8 x 60 along local +Z', () => {
    const [ox, oy, oz] = BURG_TAURUS_ORIGIN.pos;
    const deck = ops.find((o) => o.op === 'box' && Math.abs(o.y + o.h - oy) < 1e-6 && Math.abs(o.x - ox) < 1e-6 && Math.max(o.w, o.d) === 60);
    expect(deck).toBeDefined();
    if (deck?.op === 'box') {
      expect(Math.min(deck.w, deck.d)).toBe(8);
      expect(Math.abs(deck.z - oz)).toBeCloseTo(30, 5); // centre 30 m along the bridge
    }
  });

  it('plunge ledge sits 8 m over the deck covering local (0, 8, 14)', () => {
    const [, oy] = BURG_TAURUS_ORIGIN.pos;
    const ledge = ops.find((o) => o.op === 'box' && Math.abs(o.y + o.h - (oy + 8)) < 1e-6 && o.x - o.w / 2 <= 79 && o.x + o.w / 2 >= 79 && o.z - o.d / 2 <= -282 && o.z + o.d / 2 >= -282);
    expect(ledge).toBeDefined();
  });

  it('Burg bonfire, residence + watchtower doors, merchant shop id', () => {
    expect(ops.some((o) => o.op === 'bonfire' && o.id === 'burg')).toBe(true);
    expect(ops.some((o) => o.op === 'door' && o.id === 'burg_residence' && o.keyId === 'residence_key')).toBe(true);
    expect(ops.some((o) => o.op === 'door' && o.id === 'burg_watchtower' && o.keyId === 'watchtower_key')).toBe(true);
    expect(SHOPS['burg_merchant']).toBeDefined();
  });

  it('blocked exits and at least 5 ammo caches', () => {
    const ids = ops.filter((o) => o.op === 'barrier' && o.kind === 'construction').map((o) => (o as { id?: string }).id);
    // Bridge end is gated by the Taurus arena (ai/boss), not a Burg barrier.
    for (const id of ['barrier_lower_burg', 'barrier_havel', 'barrier_alley_s']) expect(ids).toContain(id);
    expect(ops.filter((o) => o.op === 'cache').length).toBeGreaterThanOrEqual(5);
  });

  it('nav graph links Firelink to the rampart end', () => {
    const a = BURG_NAV.names.indexOf('plaza');
    const b = BURG_NAV.names.indexOf('rp_5');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(BURG_NAV.path(BURG_NAV.nodes[a]!, BURG_NAV.nodes[b]!).length).toBeGreaterThan(5);
  });

  it('teleports + area mapping', () => {
    expect(Object.keys(BURG_TELEPORTS)).toContain('burg_bonfire');
    expect(areaAtPosition({ x: 0, y: 4, z: -40 })).toBe('firelink');
    expect(areaAtPosition({ x: 40, y: 4, z: -90 })).toBe('burg');
    expect(areaAtPosition({ x: 79, y: 12, z: -280 })).toBe('taurus');
    expect(burgBlend(-50)).toBe(0);
    expect(burgBlend(-80)).toBe(1);
  });

  it('every B1-B17 (except B7 mimic) has non-empty loot whose ids resolve', () => {
    for (const id of B_IDS) {
      if (id === 'B7') continue;
      const op = ops.find((o) => (o.op === 'item' || o.op === 'chest') && o.id === id);
      const loot = op?.op === 'item' ? op.loot : op?.op === 'chest' ? op.contents : undefined;
      expect(loot, id).toBeDefined();
      expect(loot!.length, id).toBeGreaterThan(0);
      for (const l of loot!) expect(ITEMS_BY_ID.has(l.id), `${id}: ${l.id}`).toBe(true);
    }
  });

  it('Watchtower Key is at B13', () => {
    const b13 = ops.find((o) => o.op === 'item' && o.id === 'B13');
    expect(b13 && b13.op === 'item' && b13.loot.some((l) => l.id === 'watchtower_key')).toBe(true);
  });
});
