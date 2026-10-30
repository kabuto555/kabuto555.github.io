import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameLoop } from '../core/loop';
import { SIM_DT, SimTime } from '../core/time';
import { DecalPool, ParticlePool } from './impacts';
import { EventBus } from '../core/events';
import { DamageType } from '../core/entity';
import { createFxSystem, damageTrauma, DOT_TRAUMA } from './index';
import { ShellPool } from './muzzle';
import { Shake, SHAKE } from './shake';

describe('shake', () => {
  it('trauma decays to zero and offsets scale with trauma^2', () => {
    const s = new Shake();
    s.add(1);
    s.step(0.1);
    const big = Math.hypot(s.rx, s.ry, s.rz, s.ox, s.oy);
    s.trauma = 0.5;
    s.step(0);
    const half = Math.hypot(s.rx, s.ry, s.rz, s.ox, s.oy);
    expect(half).toBeLessThan(big * 0.5);
    s.step(1 / SHAKE.decay + 0.01);
    expect(s.trauma).toBe(0);
    expect(Math.abs(s.ox)).toBe(0);
  });
  it('applies after camera writes and restores (no drift)', () => {
    const s = new Shake();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 3);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(0.1, 0.2, 0);
    s.add(1);
    for (let i = 0; i < 20; i++) {
      s.step(0.016);
      s.apply(cam); // camera NOT rewritten by anyone
    }
    s.trauma = 0;
    s.step(0);
    s.apply(cam);
    expect(cam.position.distanceTo(new THREE.Vector3(1, 2, 3))).toBeLessThan(1e-9);
    expect(cam.rotation.y).toBeCloseTo(0.2, 9);
  });
});

describe('hitstop vs loop', () => {
  it('freezes sim for the requested real time, render continues, then resumes', () => {
    const loop = new GameLoop({ clock: new SimTime() });
    let ups = 0;
    let rends = 0;
    loop.add({ update: () => ups++, render: () => rends++ });
    loop.advance(SIM_DT);
    expect(ups).toBe(1);
    loop.hitstop(0.04);
    for (let i = 0; i < 3; i++) loop.advance(SIM_DT);
    expect(ups).toBe(1);
    expect(rends).toBe(4);
    loop.advance(SIM_DT);
    expect(ups).toBe(2);
    expect(loop.hitstopRemaining).toBe(0);
  });
  it('overlapping hitstops take the max; timeScale slows sim', () => {
    const loop = new GameLoop({ clock: new SimTime() });
    loop.hitstop(0.1);
    loop.hitstop(0.04);
    expect(loop.hitstopRemaining).toBeCloseTo(0.1);
    const l2 = new GameLoop({ clock: new SimTime() });
    let n = 0;
    l2.add({ update: () => n++ });
    l2.timeScale = 0.5;
    for (let i = 0; i < 60; i++) l2.advance(SIM_DT);
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(31);
  });
});

describe('pools', () => {
  it('decals recycle oldest at capacity', () => {
    const d = new DecalPool(4);
    for (let i = 0; i < 6; i++) d.add({ x: i, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.1, 0);
    expect(d.count).toBe(4);
    expect(d.next).toBe(2);
    const m = new THREE.Matrix4();
    d.mesh.getMatrixAt(0, m);
    expect(m.elements[12]).toBe(4); // slot 0 overwritten by 5th decal (x=4)
  });
  it('particles and shells expire and recycle', () => {
    const p = new ParticlePool(8, () => 0.5);
    p.burst({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 20, 0xffffff, 1, 0.05, 0.2, 1);
    p.update(0.016);
    expect(p.alive).toBe(8);
    p.update(1);
    expect(p.alive).toBe(0);
    const s = new ShellPool(3, () => 0.5);
    for (let i = 0; i < 5; i++) s.eject(0, 1, 0, 1, 1, 0, 0);
    s.update(0.016);
    expect(s.alive).toBe(3);
    s.update(2);
    expect(s.alive).toBe(0);
  });
});

describe('damage trauma', () => {
  const mk = () => {
    const events = new EventBus();
    const fx = createFxSystem({ events, camera: new THREE.PerspectiveCamera(), scene: new THREE.Group(), loop: { hitstop() {} } });
    const dmg = (amount: number, type = DamageType.Physical, source: number | null = 5) =>
      events.emit('damage', { source, target: 1, amount, type, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 } });
    return { fx, dmg };
  };
  it('scales with amount (no per-event floor)', () => {
    expect(damageTrauma(3)).toBeLessThan(0.06);
    expect(damageTrauma(1000)).toBe(0.6);
  });
  it('fire / rapid same-source ticks stay small instead of pinning the shake', () => {
    const { fx, dmg } = mk();
    for (let i = 0; i < 30; i++) {
      dmg(4, DamageType.Fire, null);
      fx.render?.(0, 0.1);
    }
    expect(fx.shake.trauma).toBeLessThan(0.05);
    const b = mk();
    b.dmg(30);
    expect(b.fx.shake.trauma).toBeCloseTo(0.5, 5);
    b.dmg(30); // same source, same instant: DoT-limited
    expect(b.fx.shake.trauma).toBeCloseTo(0.5 + DOT_TRAUMA, 5);
  });
});
