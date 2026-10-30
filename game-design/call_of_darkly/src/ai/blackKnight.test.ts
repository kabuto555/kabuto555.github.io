import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { SIM_DT } from '../core/time';
import type { HitTarget } from '../combat/targets';
import type { DamageResult } from '../combat/types';
import { ENEMIES } from '../data/enemies';
import { DROP_TABLES } from '../data/droptables';
import { StatsResolver } from '../inventory/modifiers';
import { createCollisionWorld } from '../physics/grid';
import { Layer } from '../physics/types';
import { BK, BLACK_KNIGHT, BLACK_KNIGHT_FLAG, configureBlackKnight } from './blackKnight';
import { registerArchetype } from './spawner';
import { AiSystem } from './system';

registerArchetype(BLACK_KNIGHT);

function setup(wallBetween = false) {
  const world = createCollisionWorld(4);
  world.add({ aabb: { min: { x: -40, y: -1, z: -40 }, max: { x: 40, y: 0, z: 40 } }, layer: Layer.World, solid: true });
  // wall across the sight line (player is at -Z of the knight)
  if (wallBetween) world.add({ aabb: { min: { x: -4, y: 0, z: -4 }, max: { x: 4, y: 3, z: -3.5 } }, layer: Layer.World, solid: true });
  const bus = new EventBus();
  const player = { id: 1, position: { x: 0, y: 0, z: -8 }, health: { hp: 1000, maxHp: 1000 } };
  const hits: DamageEvent[] = [];
  const combat = {
    addTarget: (_t: HitTarget) => {},
    removeTarget: (_t: HitTarget) => {},
    hitPlayer(e: DamageEvent): DamageResult {
      hits.push(e);
      return { dealt: e.amount, blocked: false, poiseBroken: false, killed: false };
    },
  };
  const ai = new AiSystem({ world, combat, player, headless: true, events: bus, stats: new StatsResolver(), rng: new Rng(3) });
  const bars: { show: boolean; name?: string; hp?: number; max?: number }[] = [];
  bus.on('bossBar', (e) => bars.push(e));
  const deaths: string[] = [];
  bus.on('enemyDeath', (e) => deaths.push(e.defId));
  const step = (s: number) => {
    for (let i = 0, n = Math.round(s / SIM_DT); i < n; i++) ai.update(SIM_DT);
  };
  return { ai, bus, player, hits, bars, deaths, step };
}

const blow = (targetId: number, amount: number, poise: number): DamageEvent => ({
  source: 1,
  target: targetId,
  amount,
  type: DamageType.Physical,
  poiseDamage: poise,
  hitPos: { x: 0, y: 1, z: 0 },
  dir: { x: 0, y: 0, z: 1 },
});

/** Knight at origin facing -Z, engaged with the player 8 m ahead; opportunist thrust/attacks blocked. */
function engaged(wall = false) {
  const h = setup(wall);
  const e = h.ai.spawn('black_knight', { x: 0, y: 0, z: 0 }, 0)!;
  for (let i = 0; i < 180; i++) {
    e.attackCooldown = 99; // hold fire until the test says so
    h.ai.update(SIM_DT);
  }
  return { h, e };
}

beforeEach(() => configureBlackKnight(null));
afterEach(() => configureBlackKnight(null));

describe('black knight data', () => {
  it('900 HP, 400 souls, high poise, guaranteed Halberd', () => {
    const d = ENEMIES.black_knight!;
    expect(d.hp).toBe(900);
    expect(d.souls).toBe(400);
    expect(d.poise).toBeGreaterThanOrEqual(150);
    expect(DROP_TABLES.drops_black_knight!.entries.some((x) => x.kind === 'item' && x.chance === 1 && x.ids.includes('black_knights_halberd'))).toBe(true);
  });

  it('every attack telegraphs at least the dodge window; has overhead, 2-hit sweep and thrust', () => {
    const atk = ENEMIES.black_knight!.attacks;
    for (const a of atk) expect(a.windup, a.id).toBeGreaterThanOrEqual(BK.dodgeWindow);
    expect(atk.map((a) => a.id)).toEqual(['overhead', 'sweep_1', 'sweep_2', 'thrust']);
    expect(BLACK_KNIGHT.attackExtras.sweep_1!.followUp).toBe('sweep_2');
  });
});

describe('reload punish', () => {
  it('a reload start within 10 m with LOS triggers a telegraphed thrust that lands', () => {
    const { h, e } = engaged();
    expect(e.aware).toBe(true);
    e.attackCooldown = 99; // block ordinary attacks and the opportunist thrust
    h.step(0.2);
    expect(e.state).toBe('chase');
    h.bus.emit('gunReload', { weaponId: 'm4_ar', phase: 'start', empty: false });
    h.step(SIM_DT * 3);
    expect(e.state).toBe('windup');
    expect(e.ctx.currentAttack!.id).toBe('thrust');
    expect(e.ctx.currentAttack!.windup).toBeGreaterThanOrEqual(BK.dodgeWindow);
    const swings = h.hits.length;
    h.step(e.ctx.currentAttack!.windup - 0.15);
    expect(h.hits.length).toBe(swings); // still telegraphing: no damage during the windup
    h.step(1.2);
    expect(h.hits.some((x) => x.weaponId === 'black_knight:thrust')).toBe(true);
  });

  it('ignores reloads that are far, finished/cancelled, or out of sight', () => {
    const far = engaged();
    far.e.attackCooldown = 99;
    far.h.player.position.z = -30; // knight has closed to ~2.4 m: well past 10 m
    far.h.step(0.5);
    far.h.bus.emit('gunReload', { weaponId: 'm4_ar', phase: 'start', empty: false });
    far.h.step(0.1);
    expect(far.e.state).toBe('chase');

    const done = engaged();
    done.e.attackCooldown = 99;
    done.h.bus.emit('gunReload', { weaponId: 'm4_ar', phase: 'done', empty: false });
    done.h.bus.emit('gunReload', { weaponId: 'm4_ar', phase: 'cancel', empty: false });
    done.h.step(0.1);
    expect(done.e.state).toBe('chase');

    const h = setup(true);
    const e = h.ai.spawn('black_knight', { x: 0, y: 0, z: 0 }, 0)!;
    h.step(0.5);
    e.aware = true; // pretend aggro (e.g. shot from cover); the wall blocks sight
    e.attackCooldown = 99;
    h.step(0.5);
    h.bus.emit('gunReload', { weaponId: 'm4_ar', phase: 'start', empty: false });
    h.step(0.1);
    expect(['windup', 'attack']).not.toContain(e.state);
  });
});

describe('poise and mini-boss bar', () => {
  it('small hits do not stagger; a big burst does', () => {
    const { h, e } = engaged();
    for (let i = 0; i < 6; i++) e.applyDamage(blow(e.id, 5, 10));
    expect(e.state).not.toBe('stagger');
    e.applyDamage(blow(e.id, 5, 400));
    expect(e.state).toBe('stagger');
    expect(h.bars.length).toBeGreaterThan(0);
  });

  it('shows the bar while engaged with live hp and hides on death', () => {
    const { h, e } = engaged();
    const shown = h.bars.filter((b) => b.show);
    expect(shown[0]).toMatchObject({ show: true, name: 'Black Knight', hp: 900, max: 900 });
    e.applyDamage(blow(e.id, 100, 0));
    h.step(0.1);
    expect(h.bars[h.bars.length - 1]).toMatchObject({ show: true, hp: 800 });
    e.applyDamage(blow(e.id, 5000, 0));
    h.step(0.1);
    expect(h.bars[h.bars.length - 1]).toEqual({ show: false });
  });

  it('hides the bar when the player escapes (leash/return)', () => {
    const { h, e } = engaged();
    h.player.health.hp = 0; // player dead: knight gives up
    h.step(0.5);
    expect(e.aware).toBe(false);
    expect(h.bars[h.bars.length - 1]).toEqual({ show: false });
  });
});

describe('no respawn after kill', () => {
  it('marks the kill, drops via enemyDeath once, and a bonfire rest does not bring him back', () => {
    let killed = false;
    configureBlackKnight({ isKilled: () => killed, markKilled: () => void (killed = true) });
    const h = setup();
    const e = h.ai.spawnOp({ enemy: 'black_knight', pos: [0, 0, 0], yaw: 0, id: 'bk' })!;
    h.step(0.2);
    e.applyDamage(blow(e.id, 5000, 0));
    expect(killed).toBe(true);
    expect(h.deaths).toEqual(['black_knight']);
    h.step(15); // corpse sinks and is removed
    expect(h.ai.enemies.length).toBe(0);
    h.bus.emit('bonfireRest', {} as never);
    expect(h.ai.enemies.length).toBe(0);
    h.step(1);
    expect(h.ai.enemies.length).toBe(0);
  });

  it('debug kills (killAll / kill() / non-player damage) do not write the flag', () => {
    let killed = false;
    configureBlackKnight({ isKilled: () => killed, markKilled: () => void (killed = true) });
    const h = setup();
    const e = h.ai.spawnOp({ enemy: 'black_knight', pos: [0, 0, 0], yaw: 0, id: 'bk' })!;
    h.step(0.2);
    expect(h.ai.killAll()).toBe(0); // bosses are skipped
    expect(e.alive).toBe(true);
    e.kill(null);
    expect(e.alive).toBe(false);
    expect(killed).toBe(false);
  });

  it('a flagged knight vanishes silently on spawn (reload of a save): no drops, no souls, no bar', () => {
    configureBlackKnight({ isKilled: () => true });
    const h = setup();
    const e = h.ai.spawnOp({ enemy: 'black_knight', pos: [0, 0, 0], yaw: 0, id: 'bk' })!;
    h.step(0.1);
    expect(e.alive).toBe(false);
    expect(h.ai.enemies.length).toBe(0);
    expect(h.deaths).toEqual([]);
    expect(h.bars.length).toBe(0);
  });

  it('exports the progress flag id', () => {
    expect(BLACK_KNIGHT_FLAG).toBe('boss:black_knight');
  });
});
