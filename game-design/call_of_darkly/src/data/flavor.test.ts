import { describe, it, expect } from 'vitest';
import { WEAPONS, ARMOR, ACCESSORIES, CONSUMABLES, GRENADES, KEYS } from './index';

const itemTables: Record<string, Record<string, { id: string; description: string }>> = {
  WEAPONS, ARMOR, ACCESSORIES, CONSUMABLES, GRENADES, KEYS,
};

describe('item flavor text', () => {
  for (const [name, table] of Object.entries(itemTables)) {
    it(`${name}: every record has a non-empty description <= 220 chars`, () => {
      for (const [id, rec] of Object.entries(table)) {
        expect(rec.description.trim(), `${id} description empty`).not.toBe('');
        expect(rec.description.length, `${id} description too long`).toBeLessThanOrEqual(220);
      }
    });
  }

  it('Basement Key text matches PLAN §7', () => {
    expect(KEYS.basement_key.description).toBe(
      'Opens the basement door. The door is behind a construction barrier. Pending budget approval.',
    );
  });
});
