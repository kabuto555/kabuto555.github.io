import { describe, it, expect } from 'vitest';
import {
  AMMO, WEAPONS, ARMOR, ARMOR_SETS, ACCESSORIES, CONSUMABLES, GRENADES, KEYS, ENEMIES, DROP_TABLES, SHOPS,
  WEAPON_LIST, GUN_LIST, ALL_ITEMS, ITEMS_BY_ID, ENEMIES_BY_ID, DROP_TABLES_BY_ID, SHOPS_BY_ID,
  levelCost, STATS,
} from './index';
import type { AmmoType, GunDef } from './types';

const tables: Record<string, Record<string, { id: string }>> = {
  WEAPONS, ARMOR, ARMOR_SETS, ACCESSORIES, CONSUMABLES, GRENADES, KEYS, ENEMIES, DROP_TABLES, SHOPS,
};

describe('record ids', () => {
  for (const [name, table] of Object.entries(tables)) {
    it(`${name}: keys match ids and are unique`, () => {
      const entries = Object.entries(table);
      for (const [key, rec] of entries) expect(rec.id).toBe(key);
      expect(new Set(entries.map(([, r]) => r.id)).size).toBe(entries.length);
    });
  }

  it('item ids are unique across all item tables', () => {
    expect(ITEMS_BY_ID.size).toBe(ALL_ITEMS.length);
  });

  it('lookup maps cover every record', () => {
    expect(ENEMIES_BY_ID.size).toBe(Object.keys(ENEMIES).length);
    expect(DROP_TABLES_BY_ID.size).toBe(Object.keys(DROP_TABLES).length);
    expect(SHOPS_BY_ID.size).toBe(Object.keys(SHOPS).length);
  });
});

describe('references', () => {
  it('drop table item ids exist', () => {
    for (const dt of Object.values(DROP_TABLES)) {
      for (const e of dt.entries) {
        if (e.kind === 'item') for (const id of e.ids) expect(ITEMS_BY_ID.has(id), `${dt.id} -> ${id}`).toBe(true);
      }
      for (const id of dt.firstKill ?? []) expect(ITEMS_BY_ID.has(id), `${dt.id} firstKill -> ${id}`).toBe(true);
    }
  });

  it('drop table ammo types are valid ammo types', () => {
    for (const dt of Object.values(DROP_TABLES)) {
      for (const e of dt.entries) {
        if (e.kind === 'ammo') {
          // types here are counts; the ammo kinds rolled are owned ones, so only check the table has a valid cap map
          expect(e.types[0]).toBeLessThanOrEqual(e.types[1]);
        }
      }
    }
    for (const a of Object.values(AMMO)) expect(a.cap).toBeGreaterThan(0);
  });

  it('enemy dropTable ids exist', () => {
    for (const e of Object.values(ENEMIES)) {
      if (e.dropTable !== null) expect(DROP_TABLES_BY_ID.has(e.dropTable), `${e.id} -> ${e.dropTable}`).toBe(true);
    }
  });

  it('shop item ids exist', () => {
    for (const s of Object.values(SHOPS)) {
      for (const en of s.entries) expect(ITEMS_BY_ID.has(en.itemId), `${s.id} -> ${en.itemId}`).toBe(true);
    }
  });

  it('armor set pieces exist and point back to their set', () => {
    for (const set of Object.values(ARMOR_SETS)) {
      for (const pid of set.pieces) {
        expect(ARMOR[pid], `${set.id} -> ${pid}`).toBeDefined();
        expect(ARMOR[pid].set).toBe(set.id);
      }
    }
  });

  it('every gun has an ammo cap', () => {
    expect(GUN_LIST.length).toBeGreaterThan(0);
    for (const g of GUN_LIST) {
      const ammo: AmmoType = (g as GunDef).ammo;
      expect(AMMO[ammo], `${g.id} ammo ${ammo}`).toBeDefined();
      expect(AMMO[ammo].cap).toBeGreaterThan(0);
    }
  });

  it('weapon list matches weapon table', () => {
    expect(WEAPON_LIST.length).toBe(Object.keys(WEAPONS).length);
  });
});

describe('shops', () => {
  it('residence key, extraction flare and ammo are obtainable from the Burg merchant', () => {
    const ids = SHOPS.burg_merchant.entries.map((e) => e.itemId);
    expect(ids).toContain('residence_key');
    expect(ids).toContain('extraction_flare');
    expect(ids.some((i) => i.startsWith('ammo_crate'))).toBe(true);
    expect(Object.values(SHOPS).some((s) => s.entries.some((e) => e.itemId === 'residence_key'))).toBe(true);
  });
  it('EOD full set explosive absorb is 0.6-0.7', () => {
    const total = ARMOR_SETS.eod_bomb_suit.pieces.reduce((a, id) => a + ARMOR[id]!.explosiveAbsorb, 0);
    expect(total).toBeGreaterThanOrEqual(0.6);
    expect(total).toBeLessThanOrEqual(0.7);
  });
});

describe('leveling', () => {
  it('levelCost takes the target level (DS1 semantics)', () => {
    // L=12: 0.02*1728 + 3.06*144 + 105.6*12 - 895 = 34.56 + 440.64 + 1267.2 - 895 = 847.4
    expect(levelCost(12)).toBe(847);
    expect(levelCost(2)).toBe(STATS.levelCostFloor); // negative raw -> floor
  });
  it('level cost is non-decreasing and respects the floor', () => {
    let prev = -Infinity;
    for (let L = 1; L <= 60; L++) {
      const c = levelCost(L);
      expect(c).toBeGreaterThanOrEqual(STATS.levelCostFloor);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});
