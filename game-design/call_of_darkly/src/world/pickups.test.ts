import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AmmoStore } from '../combat/weapons';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { newSave, SaveStore, type KeyValueStorage } from '../core/save';
import { WorldProgress } from '../economy/progress';
import { Inventory } from '../inventory/store';
import { PLAYER_TUNING } from '../player/tuning';
import { InteractSystem } from './interact';
import { PICKUP_TTL, PickupSystem } from './pickups';

// glow.ts builds a canvas texture (needs a DOM); stub it for node.
vi.mock('./glow', () => ({
  createGlow: () => new THREE.Mesh(),
  glowPulse: () => 1,
}));

const mem = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

function rig(progress = new WorldProgress()) {
  const bus = new EventBus();
  const store = new Inventory(bus);
  const player = { position: { x: 0, y: 0, z: 0 }, state: { yaw: 0, pitch: 0 } };
  const interact = new InteractSystem({ player, input: new Input() });
  const combat = { ammo: new AmmoStore(bus), rightIdx: 0, guns: [null, null] };
  const sys = new PickupSystem({
    parent: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    player,
    combat: combat as never,
    inv: { store, equipment: {} as never },
    progress,
    interact,
    bus,
  });
  return { bus, store, player, interact, sys, progress, combat };
}

const here = { x: 0, y: 0.3, z: -1 };

describe('first-kill pickups', () => {
  it('never despawn, and set the flag only when taken', () => {
    const r = rig();
    const p = r.sys.spawn({ pos: here, loot: [{ id: 'basement_key', count: 1 }], firstKillFlag: 'firstKill:x', ttl: Infinity });
    for (let i = 0; i < 20; i++) r.sys.update(10); // 200 s > any ttl
    expect(r.sys.pickups.has(p)).toBe(true);
    expect(r.sys.hasFirstKill('firstKill:x')).toBe(true);
    expect(r.progress.hasFlag('firstKill:x')).toBe(false);
    p.interact();
    expect(r.store.count('basement_key')).toBe(1);
    expect(r.sys.pickups.size).toBe(0);
    expect(r.sys.hasFirstKill('firstKill:x')).toBe(false);
    expect(r.progress.hasFlag('firstKill:x')).toBe(true);
  });

  it('ordinary drops still despawn after the ttl', () => {
    const r = rig();
    const p = r.sys.spawn({ pos: here, loot: [{ id: 'energy_drink', count: 1 }] });
    r.sys.update(PICKUP_TTL - 1);
    expect(r.sys.pickups.has(p)).toBe(true);
    r.sys.update(2);
    expect(r.sys.pickups.size).toBe(0);
  });
});

describe('partial takes persist', () => {
  it('first take marks looted + saves the remainder; reload restores only the remainder', () => {
    const storage = new SaveStore(mem());
    const r = rig();
    const full = [{ id: 'energy_drink', count: 120 }]; // stack cap 99
    const p = r.sys.spawnPlaced('chest:c1', here, full)!;
    p.interact();
    expect(r.store.count('energy_drink')).toBe(99);
    expect(r.progress.isLooted('chest:c1')).toBe(true);
    expect(r.progress.getPartial('chest:c1')).toEqual([{ id: 'energy_drink', count: 21 }]);
    expect(r.sys.pickups.has(p)).toBe(true); // 21 still on the ground

    // reload
    const save = r.progress.writeSave(newSave());
    expect(storage.save(save)).toBe(true);
    const p2 = new WorldProgress();
    p2.load(storage.load());
    const r2 = rig(p2);
    const again = r2.sys.spawnPlaced('chest:c1', here, full)!;
    expect(again.loot).toEqual([{ id: 'energy_drink', count: 21 }]); // no duplicate of the 99 already taken

    // take the rest: fully looted, remainder cleared, nothing respawns
    again.interact();
    expect(r2.store.count('energy_drink')).toBe(21);
    expect(p2.getPartial('chest:c1')).toBeNull();
    expect(r2.sys.pickups.size).toBe(0);
    const p3 = new WorldProgress();
    p3.load(p2.writeSave(newSave()));
    expect(rig(p3).sys.spawnPlaced('chest:c1', here, full)).toBeNull();
  });

  it('a take that carries nothing does not mark the loot looted', () => {
    const r = rig();
    r.store.add('energy_drink', 99);
    const p = r.sys.spawnPlaced('item1', here, [{ id: 'energy_drink', count: 5 }])!;
    p.interact();
    expect(r.progress.isLooted('item1')).toBe(false);
    expect(r.sys.pickups.has(p)).toBe(true);
  });
});

describe('interact: low items', () => {
  it('picks an item on the floor a step ahead without looking down at it', () => {
    const r = rig();
    const item = r.sys.spawn({ pos: { x: 0, y: 0.35, z: -1.4 }, loot: [{ id: 'energy_drink', count: 1 }], ttl: Infinity });
    r.interact.update();
    expect(r.interact.current).toBe(item);
    // looking the other way: not picked
    r.player.state.yaw = Math.PI;
    r.interact.update();
    expect(r.interact.current).toBeNull();
    // and a floor item is not picked when it is far off to the side
    r.player.state.yaw = Math.PI / 2;
    r.interact.update();
    expect(r.interact.current).toBeNull();
    expect(PLAYER_TUNING.eyeHeight).toBeGreaterThan(1);
  });
});
