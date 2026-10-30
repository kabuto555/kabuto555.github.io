import { describe, expect, it } from 'vitest';
import { aabbFromFootprint } from './aabb';
import { KinematicCapsule } from './capsule';
import { SpatialGrid } from './grid';
import { Layer } from './types';

const DT = 1 / 60;
const G = 22;

function worldWithFloor(): SpatialGrid {
  const w = new SpatialGrid(4);
  w.add({ aabb: aabbFromFootprint(0, -1, 0, 100, 1, 100), layer: Layer.World, solid: true, tag: 'floor' });
  return w;
}

/** Run n sim ticks with constant horizontal velocity + gravity. */
function run(c: KinematicCapsule, w: SpatialGrid, vx: number, vz: number, ticks: number) {
  let r = c.move(0, w);
  for (let i = 0; i < ticks; i++) {
    c.velocity.x = vx;
    c.velocity.z = vz;
    c.velocity.y -= G * DT;
    r = c.move(DT, w);
  }
  return r;
}

describe('SpatialGrid raycast', () => {
  it('hits the nearest box with point/normal/collider, across many cells', () => {
    const w = new SpatialGrid(4);
    const far = w.add({ aabb: aabbFromFootprint(0, 0, -30, 2, 2, 2), layer: Layer.World, solid: true, tag: 'far' });
    const near = w.add({ aabb: aabbFromFootprint(0, 0, -10, 2, 2, 2), layer: Layer.World, solid: true, tag: 'near' });
    const hit = w.raycast({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 }, maxDist: 100 })!;
    expect(hit.collider).toBe(near);
    expect(hit.distance).toBeCloseTo(9);
    expect(hit.point.z).toBeCloseTo(-9);
    expect(hit.normal).toEqual({ x: 0, y: 0, z: 1 });
    w.remove(near.id);
    expect(w.raycast({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 }, maxDist: 100 })!.collider).toBe(far);
  });

  it('respects maxDist and the layer mask, and finds a big box spanning cells', () => {
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(0, 0, -10, 2, 2, 2), layer: Layer.Barrier, solid: true });
    const ray = { origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 }, maxDist: 5 };
    expect(w.raycast(ray)).toBeNull();
    expect(w.raycast({ ...ray, maxDist: 50 }, Layer.World)).toBeNull();
    expect(w.raycast({ ...ray, maxDist: 50 }, Layer.Barrier)).not.toBeNull();
    // Down ray onto a large floor whose min corner is far from the origin cell.
    const f = w.add({ aabb: aabbFromFootprint(0, -1, 0, 60, 1, 60), layer: Layer.World, solid: true });
    const d = w.raycast({ origin: { x: 13.3, y: 5, z: 7.1 }, dir: { x: 0, y: -1, z: 0 }, maxDist: 20 }, Layer.World)!;
    expect(d.collider).toBe(f);
    expect(d.point.y).toBeCloseTo(0);
    expect(d.normal.y).toBe(1);
  });

  it('handles diagonal rays and negative coordinates', () => {
    const w = new SpatialGrid(2);
    const b = w.add({ aabb: aabbFromFootprint(-7, -3, -7, 1, 1, 1), layer: Layer.World, solid: true });
    const dir = { x: -1, y: -0.5, z: -1 };
    const l = Math.hypot(dir.x, dir.y, dir.z);
    const hit = w.raycast({ origin: { x: 0, y: 0.5, z: 0 }, dir: { x: dir.x / l, y: dir.y / l, z: dir.z / l }, maxDist: 30 });
    expect(hit?.collider).toBe(b);
  });

  it('ignores a collider containing the ray origin', () => {
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(0, 0, 0, 2, 2, 2), layer: Layer.World, solid: true });
    expect(w.raycast({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 }, maxDist: 10 })).toBeNull();
  });

  it('sweepAABB reports time of impact and normal', () => {
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(5, 0, 0, 1, 2, 4), layer: Layer.World, solid: true });
    const box = aabbFromFootprint(0, 0.5, 0, 1, 1, 1);
    const hit = w.sweepAABB(box, { x: 10, y: 0, z: 0 })!;
    expect(hit.t).toBeCloseTo(0.4); // 0.5 → 4.5
    expect(hit.normal.x).toBe(-1);
    expect(w.sweepAABB(box, { x: 0, y: 0, z: 10 })).toBeNull();
  });

  it('sweepAABB ignores initial overlap when moving away/along, reports it when moving in; out param is reused', () => {
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(0, 0, 0, 4, 1, 4), layer: Layer.World, solid: true });
    // Box sunk 0.1 into the top face (resting contact): least-penetration axis is +y.
    const box = aabbFromFootprint(0, 0.9, 0, 1, 1, 1);
    expect(w.sweepAABB(box, { x: 3, y: 0, z: 0 })).toBeNull(); // sliding along: free
    expect(w.sweepAABB(box, { x: 0, y: 2, z: 0 })).toBeNull(); // moving away: free
    const hit = w.sweepAABB(box, { x: 0, y: -1, z: 0 })!; // moving into: blocked at t = 0
    expect(hit.t).toBe(0);
    expect(hit.normal.y).toBe(1);
    const out = { t: 9, normal: { x: 0, y: 0, z: 0 }, collider: hit.collider };
    const again = w.sweepAABB(box, { x: 0, y: -1, z: 0 }, undefined, out);
    expect(again).toBe(out);
    expect(out.t).toBe(0);
    expect(out.normal.y).toBe(1);
    expect(w.sweepAABB(box, { x: 3, y: 0, z: 0 }, undefined, out)).toBeNull();
  });

  it('rejects colliders outside the packable cell range with a clear error', () => {
    const w = new SpatialGrid(4);
    expect(() => w.add({ aabb: aabbFromFootprint(0, 0, 5000, 1, 1, 1), layer: Layer.World, solid: true, tag: 'far' })).toThrow(/packable range/);
    expect(() => w.add({ aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: Infinity, y: 1, z: 1 } }, layer: Layer.World, solid: true })).toThrow(RangeError);
    expect(w.size).toBe(0);
  });
});

describe('KinematicCapsule collide-and-slide', () => {
  it('rests on the floor and reports grounded', () => {
    const w = worldWithFloor();
    const c = new KinematicCapsule();
    c.teleport({ x: 0, y: 1, z: 0 });
    const r = run(c, w, 0, 0, 60);
    expect(r.grounded).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 2);
  });

  it('stops at a wall', () => {
    const w = worldWithFloor();
    w.add({ aabb: aabbFromFootprint(0, 0, -5, 10, 3, 1), layer: Layer.World, solid: true }); // face at z = -4.5
    const c = new KinematicCapsule({ radius: 0.35 });
    c.teleport({ x: 0, y: 0, z: 0 });
    const r = run(c, w, 0, -6, 120);
    expect(c.position.z).toBeGreaterThan(-4.5 + 0.35 - 0.01);
    expect(c.position.z).toBeLessThan(-4.5 + 0.35 + 0.02);
    expect(r.hitWall).toBe(true);
    expect(c.velocity.z).toBeCloseTo(0);
  });

  it('slides along a wall when moving diagonally', () => {
    const w = worldWithFloor();
    w.add({ aabb: aabbFromFootprint(0, 0, -5, 40, 3, 1), layer: Layer.World, solid: true });
    const c = new KinematicCapsule();
    c.teleport({ x: 0, y: 0, z: -3.5 });
    run(c, w, 4, -4, 60); // 1 s
    expect(c.position.z).toBeGreaterThan(-4.5 + 0.34);
    expect(c.position.x).toBeGreaterThan(3.5); // kept (almost) all tangential speed
  });

  it('does not tunnel through a thin floor at high fall speed', () => {
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(0, -0.2, 0, 10, 0.2, 10), layer: Layer.World, solid: true });
    const c = new KinematicCapsule();
    c.teleport({ x: 0, y: 3, z: 0 });
    let r = c.move(0, w);
    for (let i = 0; i < 8; i++) {
      c.velocity.y = -40; // 0.67 m per tick vs a 0.2 m slab
      r = c.move(DT, w);
    }
    expect(c.position.y).toBeGreaterThan(-0.01);
    expect(r.grounded).toBe(true);
  });

  it('steps up a small ledge but not a tall one', () => {
    const w = worldWithFloor();
    w.add({ aabb: aabbFromFootprint(0, 0, -3, 4, 0.3, 2), layer: Layer.World, solid: true }); // 0.3 step, front at z=-2
    const c = new KinematicCapsule({ stepHeight: 0.35 });
    c.teleport({ x: 0, y: 0, z: 0 });
    run(c, w, 0, -4, 5); // settle on floor
    run(c, w, 0, -4, 45);
    expect(c.position.y).toBeCloseTo(0.3, 1);
    expect(c.position.z).toBeLessThan(-2.4);

    const w2 = worldWithFloor();
    w2.add({ aabb: aabbFromFootprint(0, 0, -3, 4, 0.6, 2), layer: Layer.World, solid: true });
    const c2 = new KinematicCapsule({ stepHeight: 0.35 });
    c2.teleport({ x: 0, y: 0, z: 0 });
    run(c2, w2, 0, -4, 60);
    expect(c2.position.y).toBeCloseTo(0, 2);
    expect(c2.position.z).toBeGreaterThan(-2 + 0.34);
  });

  it('climbs and descends a staircase while staying grounded (step-up + ground snap)', () => {
    const w = worldWithFloor();
    for (let i = 0; i < 5; i++) w.add({ aabb: aabbFromFootprint(0, 0, -2 - i * 0.5 - 0.25, 3, (i + 1) * 0.2, 0.5), layer: Layer.World, solid: true });
    w.add({ aabb: aabbFromFootprint(0, 0, -6.5, 3, 1, 4), layer: Layer.World, solid: true }); // landing at y=1
    const c = new KinematicCapsule();
    c.teleport({ x: 0, y: 0, z: 0 });
    run(c, w, 0, 0, 5);
    run(c, w, 0, -4, 60);
    expect(c.position.y).toBeCloseTo(1, 1);
    // walk back down: should never be airborne for long (snap keeps us glued)
    let airTicks = 0;
    for (let i = 0; i < 60; i++) {
      const r = run(c, w, 0, 4, 1);
      if (!r.grounded) airTicks++;
    }
    expect(c.position.y).toBeCloseTo(0, 2);
    expect(airTicks).toBeLessThan(3);
  });

  it('crossing a thin curb at sprint speed does not float (y returns to the floor)', () => {
    const w = worldWithFloor();
    w.add({ aabb: aabbFromFootprint(0, 0, -3, 6, 0.3, 0.2), layer: Layer.World, solid: true }); // 0.3 tall, 0.2 deep
    const c = new KinematicCapsule({ stepHeight: 0.35 });
    c.teleport({ x: 0, y: 0, z: 0 });
    run(c, w, 0, 0, 5);
    let maxY = 0;
    let pastTicks = -1; // ticks since the axis passed the curb's far edge (z = -3.1)
    let floatTicks = 0;
    for (let i = 0; i < 40; i++) {
      run(c, w, 0, -7, 1);
      maxY = Math.max(maxY, c.position.y);
      if (c.position.z < -3.1) pastTicks++;
      if (pastTicks >= 0 && c.position.y > 0.05) floatTicks++;
    }
    expect(maxY).toBeGreaterThan(0.2); // it did step onto the curb
    expect(floatTicks).toBeLessThanOrEqual(2);
    expect(c.position.y).toBeCloseTo(0, 2);
    expect(c.grounded).toBe(true);
  });

  it('stops upward velocity on a ceiling', () => {
    const w = worldWithFloor();
    w.add({ aabb: aabbFromFootprint(0, 2.2, 0, 4, 0.3, 4), layer: Layer.World, solid: true });
    const c = new KinematicCapsule({ height: 1.8 });
    c.teleport({ x: 0, y: 0, z: 0 });
    c.velocity.y = 7;
    let hitCeiling = false;
    for (let i = 0; i < 20; i++) {
      c.velocity.y -= G * DT;
      if (c.move(DT, w).hitCeiling) hitCeiling = true;
    }
    expect(hitCeiling).toBe(true);
    expect(c.position.y + 1.8).toBeLessThanOrEqual(2.2 + 0.01);
  });
});
