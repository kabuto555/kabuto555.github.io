import { describe, expect, it } from 'vitest';
import { AmmoStore } from '../combat/weapons';
import { EventBus } from '../core/events';
import { FIRELINK, FIRELINK_BONFIRE, FIRELINK_BONFIRE_ID } from './areas/firelink';
import { PISTOL_FLOOR, applyPistolFloor, bonfireRespawn } from './bonfire';
import { createLevelDsl } from './dsl';

describe('pistol floor (§9)', () => {
  it('tops pistol reserve up to 24 when lower', () => {
    const a = new AmmoStore(new EventBus());
    a.set('pistol', 3);
    expect(applyPistolFloor(a)).toBe(true);
    expect(a.get('pistol')).toBe(PISTOL_FLOOR);
  });
  it('never lowers a bigger reserve and leaves other ammo alone', () => {
    const a = new AmmoStore(new EventBus());
    a.set('pistol', 60);
    a.set('rifle', 5);
    expect(applyPistolFloor(a)).toBe(false);
    expect(a.get('pistol')).toBe(60);
    expect(a.get('rifle')).toBe(5);
    expect(PISTOL_FLOOR).toBe(24);
  });
});

describe('Firelink area', () => {
  const dsl = createLevelDsl();
  FIRELINK.build(dsl);
  it('has the bonfire, F1-F7 ids, 3-4 hollows and 2 caches', () => {
    const bf = dsl.ops.filter((o) => o.op === 'bonfire');
    expect(bf).toHaveLength(1);
    expect(bf[0]).toMatchObject({ id: FIRELINK_BONFIRE_ID, pos: [...FIRELINK_BONFIRE] });
    const ids = dsl.ops.flatMap((o) => (o.op === 'item' || o.op === 'chest' ? [o.id] : []));
    for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']) expect(ids).toContain(id);
    const hollows = dsl.ops.filter((o) => o.op === 'spawn');
    expect(hollows.length).toBeGreaterThanOrEqual(3);
    expect(hollows.length).toBeLessThanOrEqual(4);
    expect(dsl.ops.filter((o) => o.op === 'cache')).toHaveLength(2);
  });
  it('respawn is 2.2 m south of the bonfire, facing it', () => {
    const r = bonfireRespawn(FIRELINK_BONFIRE);
    expect(r.pos.z).toBeCloseTo(1.2, 6);
    expect(r.yaw).toBe(0);
  });
});
