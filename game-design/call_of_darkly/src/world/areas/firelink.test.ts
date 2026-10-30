import { describe, it, expect } from 'vitest';
import { FIRELINK } from './firelink';
import { createLevelDsl } from '../dsl';
import { ITEMS_BY_ID } from '../../data';
import type { LevelOp } from '../types';

const F_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'] as const;

describe('Firelink item placements F1-F7', () => {
  const dsl = createLevelDsl();
  FIRELINK.build(dsl);
  const ops: LevelOp[] = dsl.ops;

  for (const id of F_IDS) {
    it(`${id} exists exactly once with non-empty loot`, () => {
      const matches = ops.filter(
        (o): o is Extract<LevelOp, { op: 'item' | 'chest' }> =>
          (o.op === 'item' || o.op === 'chest') && o.id === id,
      );
      expect(matches).toHaveLength(1);
      const loot = matches[0].op === 'item' ? matches[0].loot : matches[0].contents;
      expect(loot.length).toBeGreaterThan(0);
    });
  }

  it('every F loot id resolves in the data item table', () => {
    for (const o of ops) {
      if (!((o.op === 'item' || o.op === 'chest') && (F_IDS as readonly string[]).includes(o.id))) continue;
      const loot = o.op === 'item' ? o.loot : o.contents;
      for (const entry of loot) {
        expect(ITEMS_BY_ID.has(entry.id), `${o.id}: unknown item id ${entry.id}`).toBe(true);
      }
    }
  });
});
