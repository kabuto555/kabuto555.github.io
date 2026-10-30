import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { StatsResolver } from '../inventory/modifiers';
import { aabbFromFootprint } from '../physics/aabb';
import { SpatialGrid } from '../physics/grid';
import { Layer } from '../physics/types';
import { PlayerController } from '../player/controller';
import { newSave, SaveStore } from '../core/save';
import { BURG, BURG_TRIGGERS, BURG_NPCS } from './areas/burg';
import { SHOPS } from '../data/shops';
import { createLevelDsl } from './dsl';
import { LadderSystem } from './ladder';
import { createTriggerSystem } from './triggers';
import '../ai/hazards';

const DT = 1 / 60;

function rig() {
  const world = new SpatialGrid(4);
  world.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
  const input = new Input();
  const bus = new EventBus();
  const player = new PlayerController({ world, input, events: bus, stats: new StatsResolver(), spawn: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 } });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.update(DT);
      player.update(DT);
    }
  };
  tick(5);
  return { bus, player, tick, input, world };
}

describe('burg spawn ops', () => {
  it('barrel hollow spawn carries trigger AABB + path from BURG_TRIGGERS', () => {
    const dsl = createLevelDsl();
    BURG.build(dsl);
    const t = BURG_TRIGGERS.find((x) => x.kind === 'barrelRoll')!;
    const op = dsl.ops.find((o) => o.op === 'spawn' && o.id === t.spawnId);
    expect(op).toMatchObject({ op: 'spawn', trigger: { min: [...t.min], max: [...t.max] }, path: [[...t.from!], [...t.to!]] });
  });
  it('plain spawns carry no trigger/path keys', () => {
    const dsl = createLevelDsl();
    dsl.spawn('hollow_sword', [0, 0, 0], { id: 'x' });
    expect(dsl.ops[0]).not.toHaveProperty('trigger');
    expect(dsl.ops[0]).not.toHaveProperty('path');
  });
  it('merchant shop id exists; doors are keyed', () => {
    for (const n of BURG_NPCS) if (n.shopId) expect(SHOPS[n.shopId]).toBeDefined();
    const dsl = createLevelDsl();
    BURG.build(dsl);
    const doors = dsl.ops.filter((o) => o.op === 'door');
    expect(doors.find((d) => d.op === 'door' && d.id === 'burg_residence')).toBeDefined();
    expect(doors.find((d) => d.op === 'door' && d.id === 'burg_watchtower')).toBeDefined();
  });
});

describe('trigger system', () => {
  it('fires once on enter, re-arms after leaving', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const hits: string[] = [];
    const sys = createTriggerSystem({ player: { position: pos }, triggers: [{ id: 'a', min: [1, 0, 1], max: [2, 1, 2] }], onEnter: (t) => hits.push(t.id) });
    sys.update(DT);
    pos.x = 1.5; pos.z = 1.5;
    sys.update(DT);
    sys.update(DT);
    expect(hits).toEqual(['a']);
    pos.x = 9;
    sys.update(DT);
    pos.x = 1.5;
    sys.update(DT);
    expect(hits).toEqual(['a', 'a']);
  });
});

describe('knockdown', () => {
  it('locks input for duration, slides along dir, then get-up i-frames, then control', () => {
    const r = rig();
    r.bus.emit('playerKnockdown', { sourceId: 1, dir: { x: 1, y: 0, z: 0 }, duration: 0.5 });
    expect(r.player.state.move).toBe('knockdown');
    expect(r.player.canFire).toBe(false);
    const x0 = r.player.position.x;
    r.input.codeDown('KeyW');
    r.tick(Math.round(0.4 / DT));
    expect(r.player.position.x).toBeGreaterThan(x0 + 0.2);
    expect(r.player.invulnerable).toBe(false);
    r.tick(Math.round(0.2 / DT)); // past 0.5s: get-up
    expect(r.player.state.move).toBe('knockdown');
    expect(r.player.invulnerable).toBe(true);
    r.tick(Math.round(0.3 / DT));
    expect(r.player.state.move).toBe('ground');
    expect(r.player.invulnerable).toBe(false);
  });
  it('ignores a second knockdown while down and while rolling', () => {
    const r = rig();
    r.player.knockDown({ x: 0, y: 0, z: 1 }, 0.5);
    r.tick(10);
    r.player.knockDown({ x: 0, y: 0, z: 1 }, 5);
    r.tick(Math.round(1.2 / DT));
    expect(r.player.state.move).toBe('ground');
  });
});

describe('ladder', () => {
  it('climbs incrementally via climbTo (no teleport jumps)', () => {
    const r = rig();
    const ys: number[] = [];
    const interact = { register: () => () => {} } as never;
    const ladders = new LadderSystem({ parent: { add() {} } as never, interact, player: r.player, input: r.input });
    ladders.addLadder({ id: 'l', x: 5, z: 5, yBottom: 0, yTop: 6, n: [0, 1] });
    ladders.mountById('l');
    expect(r.player.hold).toBe(true);
    r.input.codeDown('KeyW');
    for (let i = 0; i < 60; i++) {
      r.input.update(DT);
      ladders.update(DT);
      r.player.update(DT);
      ys.push(r.player.position.y);
    }
    const steps = ys.slice(1).map((y, i) => y - ys[i]!);
    expect(Math.max(...steps)).toBeLessThan(0.06);
    expect(ys[59]!).toBeGreaterThan(1);
  });
});

describe('ladder dismount + mount rules', () => {
  const mk = () => {
    const r = rig();
    // top platform behind the ladder (ladder at x5,z5 facing +z; top y6; dismount lands at z4.1)
    r.world.add({ aabb: aabbFromFootprint(5, 5, 3, 6, 1, 4), layer: Layer.World, solid: true });
    const interact = { register: () => () => {} } as never;
    const ladders = new LadderSystem({ parent: { add() {} } as never, interact, player: r.player, input: r.input });
    ladders.addLadder({ id: 'l', x: 5, z: 5, yBottom: 0, yTop: 6, n: [0, 1] });
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        r.input.update(DT);
        ladders.update(DT);
        r.player.update(DT);
      }
    };
    return { r, ladders, step };
  };

  it('auto-dismounts onto the top platform (holding W) and the player can walk away', () => {
    const { r, ladders, step } = mk();
    ladders.mountById('l');
    r.input.codeDown('KeyW');
    let n = 0;
    while (ladders.active && n++ < 60 * 8) step(1);
    expect(ladders.active).toBeNull();
    expect(r.player.hold).toBe(false);
    r.input.codeUp('KeyW');
    step(30);
    expect(r.player.position.y).toBeCloseTo(6, 1); // stands on the platform, not the ground
    expect(r.player.state.move).toBe('ground');
    const z0 = r.player.position.z;
    r.input.codeDown('KeyS'); // back off the ladder side: free movement (S would otherwise climb down)
    step(30);
    expect(Math.abs(r.player.position.z - z0)).toBeGreaterThan(0.3);
  });

  it('dismounts as soon as the eyes clear the lip while pushing up (stopping there used to strand the climber)', () => {
    const { r, ladders, step } = mk();
    ladders.mountById('l');
    r.input.codeDown('KeyW');
    let n = 0;
    while (ladders.active && r.player.position.y < 5.0 && n++ < 60 * 8) step(1);
    // within 0.9 m of the top while still holding up: released by now or on the next ticks
    step(3);
    expect(ladders.active).toBeNull();
  });

  it('climbing down past the bottom dismounts on the ground', () => {
    const { r, ladders, step } = mk();
    ladders.mountById('l', true);
    r.input.codeDown('KeyS');
    let n = 0;
    while (ladders.active && n++ < 60 * 8) step(1);
    expect(ladders.active).toBeNull();
    expect(r.player.hold).toBe(false);
  });

  it('refuses to mount while rolling / knocked down; hold clears i-frames and grounded', () => {
    const { r, ladders, step } = mk();
    r.player.knockDown({ x: 0, y: 0, z: 1 }, 1);
    expect(ladders.mountById('l')).toBe(true); // dev entry point found the ladder...
    expect(ladders.active).toBeNull(); // ...but the mount was refused
    expect(r.player.hold).toBe(false);
    step(120);
    expect(r.player.state.move).toBe('ground');
    ladders.mountById('l');
    expect(ladders.active).not.toBeNull();
    (r.player as unknown as { invulnerable: boolean }).invulnerable = true; // stale i-frames
    step(2);
    expect(r.player.invulnerable).toBe(false);
    expect(r.player.grounded).toBe(false);
  });
});

describe('save area', () => {
  it('defaults to firelink and back-fills old saves', () => {
    expect(newSave().area).toBe('firelink');
    const store = new SaveStore({ getItem: () => JSON.stringify({ ...newSave(), area: undefined }), setItem() {}, removeItem() {} } as never);
    expect(store.load()?.area).toBe('firelink');
  });
});
