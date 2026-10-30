import { describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { SIM_DT } from '../core/time';
import type { DamageResult } from '../combat/types';
import type { HitTarget } from '../combat/targets';
import { ENEMIES } from '../data/enemies';
import { StatsResolver } from '../inventory/modifiers';
import { createCollisionWorld } from '../physics/grid';
import { Layer } from '../physics/types';
import { Fsm } from './fsm';
import {
  applyPoiseDamage,
  attackDuration,
  attackPhase,
  attackPhaseProgress,
  canHear,
  canSee,
  pickAttack,
  tickPoise,
  turnToward,
  wrapAngle,
} from './logic';
import { WaypointGraph, navGraph } from './nav';
import { Enemy } from './enemy';
import { HOLLOW_SWORD } from './hollow';
import { AiSystem } from './system';
import { bandIntent, FIREBOMB } from './firebomb';
import { boltAim, clampAimYaw, CROSSBOW, inAimCone } from './crossbow';
import { leadPoint, solveLob } from './hazards';
import type { FsmState } from './types';

// ------------------------------------------------------------------ FSM

describe('Fsm', () => {
  type Ctx = { stateTime: number; log: string[]; go?: 'b' };
  const mk = (): FsmState<Ctx, 'a' | 'b'>[] => [
    {
      id: 'a',
      enter: (c) => c.log.push('enter a'),
      update: (c) => (c.stateTime >= 0.5 ? 'b' : undefined),
      exit: (c) => c.log.push('exit a'),
    },
    { id: 'b', enter: (c, from) => c.log.push(`enter b from ${from}`), update: () => {} },
  ];

  it('runs enter/update/exit with stateTime and one transition per tick', () => {
    const ctx: Ctx = { stateTime: 0, log: [] };
    const f = new Fsm<Ctx, 'a' | 'b'>(mk(), 'a');
    f.start(ctx);
    expect(ctx.log).toEqual(['enter a']);
    for (let i = 0; i < 4; i++) f.update(ctx, 0.1);
    expect(f.current).toBe('a');
    f.update(ctx, 0.1); // stateTime 0.5 → b
    expect(f.current).toBe('b');
    expect(ctx.stateTime).toBe(0);
    expect(ctx.log).toEqual(['enter a', 'exit a', 'enter b from a']);
    expect(f.prev).toBe('a');
    expect(f.transitions).toBe(1);
  });

  it('go() forces a transition; re-entering restarts the state', () => {
    const ctx: Ctx = { stateTime: 0, log: [] };
    const f = new Fsm<Ctx, 'a' | 'b'>(mk(), 'a');
    f.update(ctx, 0.2);
    f.go(ctx, 'a');
    expect(ctx.stateTime).toBe(0);
    expect(ctx.log).toEqual(['enter a', 'exit a', 'enter a']);
    expect(() => f.go(ctx, 'zz' as 'a')).toThrow();
  });
});

// ------------------------------------------------------------------ poise

describe('poise', () => {
  it('breaks only when it would drop below 0, then resets to max', () => {
    const p = { current: 10, max: 10 };
    expect(applyPoiseDamage(p, 10)).toBe(false); // exactly 0: holds
    expect(p.current).toBe(0);
    expect(applyPoiseDamage(p, 1)).toBe(true);
    expect(p.current).toBe(10);
    expect(applyPoiseDamage(p, 0)).toBe(false);
  });

  it('hollow (poise 10) staggers on the 2nd AR bullet (poise dmg 10)', () => {
    const p = { current: ENEMIES.hollow_sword!.poise, max: ENEMIES.hollow_sword!.poise };
    expect(applyPoiseDamage(p, 10)).toBe(false);
    expect(applyPoiseDamage(p, 10)).toBe(true);
  });

  it('regens to full after the delay without hits', () => {
    const p = { current: 3, max: 10 };
    let since = 0;
    since = tickPoise(p, since, 1, 2.5);
    expect(p.current).toBe(3);
    since = tickPoise(p, since, 1.6, 2.5);
    expect(p.current).toBe(10);
    expect(since).toBeCloseTo(2.6);
  });
});

// ------------------------------------------------------------------ attack timing

describe('attack phases', () => {
  const a = { windup: 0.6, active: 0.2, recover: 0.8 };
  it('windup → active → recover → done', () => {
    expect(attackPhase(a, 0)).toBe('windup');
    expect(attackPhase(a, 0.59)).toBe('windup');
    expect(attackPhase(a, 0.6)).toBe('active');
    expect(attackPhase(a, 0.79)).toBe('active');
    expect(attackPhase(a, 0.8)).toBe('recover');
    expect(attackPhase(a, 1.6)).toBe('done');
    expect(attackDuration(a)).toBeCloseTo(1.6);
    expect(attackPhaseProgress(a, 0.3)).toBeCloseTo(0.5);
    expect(attackPhaseProgress(a, 0.7)).toBeCloseTo(0.5);
    expect(attackPhaseProgress(a, 2)).toBe(1);
  });

  it('every hollow attack telegraphs ≥ 0.4 s and its active window is shorter than a roll i-frame window', () => {
    const iframes = 0.35 - 0.05; // §3 dodge
    for (const atk of ENEMIES.hollow_sword!.attacks) {
      expect(atk.windup).toBeGreaterThanOrEqual(0.4);
      expect(atk.active).toBeLessThanOrEqual(iframes);
    }
  });

  it('pickAttack is weighted among in-range attacks', () => {
    const atks = [
      { id: 'near', range: 2, weight: 1 },
      { id: 'far', range: 6, weight: 3 },
    ] as unknown as Parameters<typeof pickAttack>[0];
    expect(pickAttack(atks, 10, 0.5)).toBeNull();
    expect(pickAttack(atks, 4, 0.1)!.id).toBe('far');
    expect(pickAttack(atks, 1, 0.1)!.id).toBe('near'); // 0.1*4 = 0.4 < 1
    expect(pickAttack(atks, 1, 0.9)!.id).toBe('far');
    expect(pickAttack(atks, 1, 0.1, (x) => x.id !== 'near')!.id).toBe('far');
  });
});

// ------------------------------------------------------------------ perception

describe('aggro checks', () => {
  const sight = { radius: 15, fovDeg: 140, proximity: 4 };
  it('needs LOS, radius and the view cone (except up close)', () => {
    // facing -Z
    expect(canSee(0, -10, 0, -1, true, sight)).toBe(true);
    expect(canSee(0, -10, 0, -1, false, sight)).toBe(false);
    expect(canSee(0, -16, 0, -1, true, sight)).toBe(false);
    expect(canSee(0, 10, 0, -1, true, sight)).toBe(false); // behind
    expect(canSee(0, 3, 0, -1, true, sight)).toBe(true); // behind but within proximity
    expect(canSee(10, -3, 0, -1, true, sight)).toBe(false); // 73° off-axis, outside 70° half-cone
    expect(canSee(3, -10, 0, -1, true, sight)).toBe(true);
  });
  it('aggroRadius modifier scales the sight radius (Ghillie)', () => {
    expect(canSee(0, -12, 0, -1, true, { ...sight, radius: 15 * 0.7 })).toBe(false);
  });
  it('hearing is a sphere', () => {
    expect(canHear(10, 0, 10, 15)).toBe(true);
    expect(canHear(15, 0, 15, 20)).toBe(false);
  });
  it('turnToward clamps and wraps', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // short way across ±PI
    expect(turnToward(3, -3, 0.5)).toBeCloseTo(-3);
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(wrapAngle(-7)).toBeCloseTo(-7 + Math.PI * 2);
    expect(turnToward(0, 0.1, 0.5)).toBeCloseTo(0.1);
  });
});

// ------------------------------------------------------------------ nav

describe('nav graph A*', () => {
  //  a(0,0) — b(10,0) — c(10,10)
  //   \_______ d(0,10) ___/      (a-d-c is 20 vs a-b-c 20; add e to make one shorter)
  const g = navGraph({
    nodes: { a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10], e: [5, 5], x: [50, 50] },
    links: ['a-b-c', 'a-d-c', 'a-e-c'],
  });
  it('finds the shortest path', () => {
    expect(g.findPath(0, 2)).toEqual([0, 4, 2]);
    expect(g.findPath(1, 3)).toEqual([1, 0, 3]); // b→a→d = 20 (b→c→d = 20 tie; via e = 7.07+7.07+... longer?)
  });
  it('returns [] when unreachable and [a] for a→a', () => {
    expect(g.findPath(0, 5)).toEqual([]);
    expect(g.findPath(2, 2)).toEqual([2]);
  });
  it('caches paths (same array, counted hit)', () => {
    const p1 = g.path({ x: 0.5, y: 0, z: 0.2 }, { x: 9.5, y: 0, z: 10.4 });
    const hits = g.cacheHits;
    const p2 = g.path({ x: 0.1, y: 0, z: -0.2 }, { x: 10.2, y: 0, z: 9.8 });
    expect(p2).toBe(p1);
    expect(g.cacheHits).toBeGreaterThan(hits);
    expect(p1.map((p) => [p.x, p.z])).toEqual([
      [0, 0],
      [5, 5],
      [10, 10],
    ]);
  });
  it('nearest prefers nodes with a clear line when los is set', () => {
    const h = new WaypointGraph(
      [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      [[0, 1]],
    );
    expect(h.nearest({ x: 1, y: 0, z: 0 })).toBe(0);
    h.los = (_a, b) => b.x === 3; // node 0 "behind a wall"
    expect(h.nearest({ x: 1, y: 0, z: 0 })).toBe(1);
  });
  it('rejects bad edges / unknown link names', () => {
    expect(() => new WaypointGraph([{ x: 0, y: 0, z: 0 }], [[0, 1]])).toThrow();
    expect(() => navGraph({ nodes: { a: [0, 0] }, links: ['a-b'] })).toThrow();
  });
});

// ------------------------------------------------------------------ headless enemy integration

interface Harness {
  ai: AiSystem;
  bus: EventBus;
  player: { id: number; position: { x: number; y: number; z: number }; health: { hp: number; maxHp: number }; invulnerable: boolean; shield: boolean; yaw: number };
  hits: DamageEvent[];
  targets: Set<HitTarget>;
  step(seconds: number, each?: () => void): void;
}

function harness(withWall: boolean): Harness {
  const world = createCollisionWorld(4);
  world.add({ aabb: { min: { x: -40, y: -1, z: -40 }, max: { x: 40, y: 0, z: 40 } }, layer: Layer.World, solid: true });
  if (withWall) world.add({ aabb: { min: { x: -0.5, y: 0, z: -4 }, max: { x: 0.5, y: 2.6, z: 4 } }, layer: Layer.World, solid: true });
  const bus = new EventBus();
  const player = { id: 1, position: { x: -6, y: 0, z: 0 }, health: { hp: 100, maxHp: 100 }, invulnerable: false, shield: false, yaw: 0 };
  const hits: DamageEvent[] = [];
  const targets = new Set<HitTarget>();
  const combat = {
    addTarget: (t: HitTarget) => void targets.add(t),
    removeTarget: (t: HitTarget) => void targets.delete(t),
    hitPlayer(e: DamageEvent): DamageResult {
      hits.push(e);
      if (player.invulnerable) return { dealt: 0, blocked: false, poiseBroken: false, killed: false };
      // frontal shield (same rule as combat: hit travelling against the player's facing)
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const blocked = player.shield && e.dir!.x * fx + e.dir!.z * fz < -0.3;
      const dealt = blocked ? 0 : e.amount;
      player.health.hp -= dealt;
      return { dealt, blocked, poiseBroken: false, killed: player.health.hp <= 0 };
    },
  };
  const nav = navGraph({
    nodes: { w: [-3, 0], wn: [-2, -5.5], en: [2, -5.5], e: [3, 0] },
    links: ['w-wn-en-e'],
  });
  const ai = new AiSystem({ world, combat, player, headless: true, nav, events: bus, stats: new StatsResolver(), rng: new Rng(1) });
  return {
    ai,
    bus,
    player,
    hits,
    targets,
    step(seconds, each) {
      const n = Math.round(seconds / SIM_DT);
      for (let i = 0; i < n; i++) {
        ai.update(SIM_DT);
        each?.();
      }
    },
  };
}

const shot = (targetId: number, amount: number, poise: number): DamageEvent => ({
  source: 1,
  target: targetId,
  amount,
  type: DamageType.Physical,
  poiseDamage: poise,
  hitPos: { x: 0, y: 1, z: 0 },
  dir: { x: 1, y: 0, z: 0 },
});

describe('sword hollow (headless)', () => {
  it('idles when the player is far / unseen, aggroes in sight, chases and lands a telegraphed hit', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 6, y: 0, z: 0 }, Math.PI / 2)!; // facing -X toward player
    expect(h.targets.has(e)).toBe(true);
    h.player.position.x = -30; // 36 m away
    h.step(1);
    expect(['idle', 'patrol']).toContain(e.state);
    h.player.position.x = -4; // 10 m, in front, clear LOS
    const seen: string[] = [];
    let windupStartHp = -1;
    let windupT = 0;
    h.step(6, () => {
      if (seen[seen.length - 1] !== e.state) seen.push(e.state);
      if (e.state === 'windup') windupT += SIM_DT;
      if (e.state === 'windup' && windupStartHp < 0) windupStartHp = h.player.health.hp;
    });
    const order = ['alert', 'chase', 'windup', 'attack', 'recover'].map((st) => seen.indexOf(st));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(seen).toContain('attack');
    expect(h.hits.length).toBeGreaterThan(0);
    const hit = h.hits[0]!;
    expect(hit.source).toBe(e.id);
    expect(hit.dir).toBeDefined();
    expect(hit.dir!.x).toBeLessThan(-0.9); // travelling from the hollow (+X) toward the player (-X)
    expect(h.player.health.hp).toBeLessThan(100);
    expect(windupT).toBeGreaterThanOrEqual(0.4);
  });

  it('emits enemyAlert once on idle->alert and enemyWindup once per windup', () => {
    const h = harness(false);
    const alerts: number[] = [];
    const winds: string[] = [];
    h.bus.on('enemyAlert', (e) => alerts.push(e.enemyId));
    h.bus.on('enemyWindup', (e) => winds.push(e.attackId));
    const e = h.ai.spawn('hollow_sword', { x: 6, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -30;
    h.step(1);
    expect(alerts.length).toBe(0);
    h.player.position.x = -4;
    let windups = 0;
    let prev = '';
    h.step(6, () => {
      if (e.state === 'windup' && prev !== 'windup') windups++;
      prev = e.state;
    });
    expect(alerts).toEqual([e.id]);
    expect(windups).toBeGreaterThan(0);
    expect(winds.length).toBe(windups);
  });

  it('i-frames and a frontal shield negate the hit; hits are spent per swing', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: -4.5, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -6;
    h.player.invulnerable = true;
    h.step(3);
    expect(h.hits.length).toBeGreaterThan(0);
    expect(h.player.health.hp).toBe(100);
    const swings = h.hits.length;
    h.player.invulnerable = false;
    h.player.shield = true;
    h.player.yaw = -Math.PI / 2; // facing +X, toward the hollow
    h.step(3);
    expect(h.hits.length).toBeGreaterThan(swings);
    expect(h.player.health.hp).toBe(100);
    expect(e.alive).toBe(true);
  });

  it('poise break → stagger; dies in 4 AR body shots and emits enemyDeath', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!;
    h.player.position.x = -20;
    const deaths: unknown[] = [];
    h.bus.on('enemyDeath', (d) => deaths.push(d));
    const ar = 22;
    e.applyDamage(shot(e.id, ar, 10));
    expect(e.state).not.toBe('stagger'); // poise holds (non-interrupting flinch)
    expect(e.flinch).toBeGreaterThan(0);
    h.step(0.05);
    e.applyDamage(shot(e.id, ar, 10));
    expect(e.state).toBe('stagger');
    e.applyDamage(shot(e.id, ar, 10));
    expect(e.alive).toBe(true);
    const r = e.applyDamage(shot(e.id, ar, 10));
    expect(r.killed).toBe(true);
    expect(e.state).toBe('dead');
    expect(e.alive).toBe(false);
    expect(deaths).toEqual([
      expect.objectContaining({ enemyId: e.id, defId: 'hollow_sword', dropTableId: 'drops_hollow_sword', souls: 20, killerId: 1 }),
    ]);
    // corpse lingers, then is removed and unregistered
    h.step(e.tuning.deathFall + e.tuning.corpseTime + e.tuning.sinkTime + 0.1);
    expect(h.ai.enemies).not.toContain(e);
    expect(h.targets.has(e)).toBe(false);
  });

  it('hears gunshots and an unaware hit startles into a chase', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!; // facing -Z, player off to the side & behind
    h.player.position.x = -6; // 16 m: out of sight radius
    h.player.position.z = 8;
    h.step(0.5);
    expect(e.aware).toBe(false);
    h.bus.emit('gunFired', { weaponId: 'm4_ar', pos: { x: -6, y: 1.5, z: 8 }, dir: { x: 1, y: 0, z: 0 } });
    h.step(SIM_DT * 2);
    expect(e.state).toBe('alert');
    const f = harness(false);
    const g = f.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!;
    f.player.position.x = -15;
    f.step(0.1);
    g.applyDamage(shot(g.id, 5, 1));
    f.step(SIM_DT * 2);
    expect(g.state).toBe('hitReact');
    f.step(0.5);
    expect(g.state).toBe('chase');
  });

  it('paths around a wall via the nav graph and reaches the player', () => {
    const h = harness(true); // wall x -0.5..0.5, z -4..4
    const e = h.ai.spawn('hollow_sword', { x: 4, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -5;
    e.hear({ x: -5, y: 1.5, z: 0 }); // can't see through the wall: alerted by a gunshot
    let minDist = Infinity;
    let usedNav = false;
    h.step(8, () => {
      minDist = Math.min(minDist, e.distToPlayer);
      if (e.waypoint) usedNav = true;
    });
    expect(usedNav).toBe(true);
    expect(minDist).toBeLessThan(2.5);
    expect(h.hits.length).toBeGreaterThan(0);
  });

  it('leashes home when the player runs too far', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 0, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -8;
    h.step(1.5);
    expect(e.aware).toBe(true);
    h.player.position.x = -39; // drag it across the map
    let returned = false;
    h.step(25, () => {
      if (e.state === 'return') returned = true;
    });
    expect(returned).toBe(true);
  });

  it('killAll + respawnAll', () => {
    const h = harness(false);
    h.ai.spawnOp({ enemy: 'hollow_sword', pos: [5, 0, 5], yaw: 0, id: 'h1' });
    h.ai.spawn('hollow_sword', { x: -5, y: 0, z: 5 }); // dev spawn: not respawned
    expect(h.ai.killAll()).toBe(2);
    h.bus.emit('bonfireRest', { bonfireId: 'x' });
    expect(h.ai.enemies.length).toBe(1);
    expect(h.ai.enemies[0]!.alive).toBe(true);
    expect(h.ai.enemies[0]!.placementId).toBe('h1');
  });
});

// ------------------------------------------------------------------ M3 review fixes

describe('M3 review fixes', () => {
  const awayShot = (id: number, poise: number, amount = 1): DamageEvent => shot(id, amount, poise);

  it('stun(): holds still in stagger, no attacks, token released; resumes after; bosses ignore it', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: -4.5, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -6;
    h.player.invulnerable = true; // we only count swings
    h.step(1.2);
    expect(e.aware).toBe(true);
    e.stun(2);
    expect(e.state).toBe('stagger');
    expect(e.hasToken).toBe(false);
    const swings = h.hits.length;
    h.step(1.9);
    expect(e.state).toBe('stagger'); // longer than staggerTime (0.9): held for the full stun
    expect(h.hits.length).toBe(swings);
    h.step(0.4);
    expect(e.state).not.toBe('stagger');
    h.step(3);
    expect(h.hits.length).toBeGreaterThan(swings);

    const boss = new Enemy({ ...ENEMIES.hollow_sword!, isBoss: true }, HOLLOW_SWORD, h.ai.shared, { x: 20, y: 0, z: 20 }, 0);
    expect(boss.isBoss).toBe(true);
    boss.stun(3);
    expect(boss.state).not.toBe('stagger');
    expect(e.isBoss).toBe(false);
  });

  it('stagger knockback from applyDamage is not discarded at tick start', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!; // faces -Z → knocked toward +Z
    h.player.position.x = -30;
    h.step(0.1);
    const z0 = e.capsule.position.z;
    e.applyDamage(shot(e.id, 1, 50)); // breaks poise
    expect(e.state).toBe('stagger');
    h.step(0.5);
    expect(e.capsule.position.z - z0).toBeGreaterThan(0.1);
  });

  it('empty nav result retries every repathInterval, not every tick', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 0, y: 0, z: 0 }, 0)!;
    let calls = 0;
    const nav = { nodes: [], edges: [] as [number, number][], nearest: () => 0, path: () => (calls++, [] as { x: number; y: number; z: number }[]) };
    h.ai.shared.nav = nav as never;
    const goal = { x: 10, y: 0, z: 10 };
    for (let i = 0; i < 60; i++) e.pursue(goal, 2, SIM_DT, 0.5, false);
    expect(e.pathValid).toBe(false);
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(Math.ceil(1 / e.tuning.repathInterval) + 1);
  });

  it('stagger immunity: poise damage ignored while staggered and briefly after', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!;
    h.player.position.x = -30;
    e.applyDamage(awayShot(e.id, 50));
    expect(e.state).toBe('stagger');
    const n = e.fsm.transitions;
    h.step(0.3);
    e.applyDamage(awayShot(e.id, 50)); // mid-stagger: no restart
    expect(e.fsm.transitions).toBe(n);
    expect(e.ctx.stateTime).toBeGreaterThan(0.25);
    h.step(e.tuning.staggerTime); // stagger ends
    expect(e.state).not.toBe('stagger');
    e.applyDamage(awayShot(e.id, 50)); // inside the post-stagger immunity window
    expect(e.state).not.toBe('stagger');
    h.step(e.tuning.staggerImmunity + 0.1);
    e.applyDamage(awayShot(e.id, 50));
    expect(e.state).toBe('stagger');
  });

  it('aggroPing alerts only the targeted enemy', () => {
    const h = harness(false);
    const a = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 0 }, 0)!;
    const b = h.ai.spawn('hollow_sword', { x: 10, y: 0, z: 6 }, 0)!;
    h.player.position.x = -30;
    h.step(0.2);
    h.bus.emit('aggroPing', { targetId: a.id, pos: { x: 3, y: 0, z: 3 } });
    h.step(SIM_DT * 3);
    expect(a.state).toBe('alert');
    expect(a.lastKnown.x).toBe(3);
    expect(b.aware).toBe(false);
    expect(b.state).not.toBe('alert');
  });

  it('no wallhack: an aware enemy does not track the true player position without LOS', () => {
    const h = harness(true);
    const e = h.ai.spawn('hollow_sword', { x: 4, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -5;
    e.hear({ x: -5, y: 1.5, z: 0 });
    h.step(0.5);
    h.player.position.z = 3;
    h.player.position.x = -8;
    h.step(1);
    expect(e.ctx.canSeeTarget).toBe(false);
    expect(e.lastKnown.x).toBeCloseTo(-5);
    expect(e.lastKnown.z).toBeCloseTo(0);
  });

  it('player cannot walk through an enemy: pushed out of its capsule', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_sword', { x: 0, y: 0, z: 0 }, 0)!;
    h.player.position.x = 0.1;
    h.player.position.z = 0.05;
    h.step(SIM_DT * 2);
    const q = e.capsule.position;
    const d = Math.hypot(h.player.position.x - q.x, h.player.position.z - q.z);
    expect(d).toBeGreaterThanOrEqual(0.35 + e.capsule.radius - 0.02);
  });
});

describe('hollow soldier (shield)', () => {
  it('spawns (archetype implemented) and blocks frontal damage via guards()', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_soldier', { x: 6, y: 0, z: 0 }, Math.PI / 2)!; // facing -X
    expect(e).not.toBeNull();
    expect(h.targets.has(e)).toBe(true);
    h.player.position.x = -30;
    const front = shot(e.id, 100, 0); // travelling +X, into the soldier's face
    expect(e.guards({ x: 1, y: 0, z: 0 }, front)).toBe(true);
    expect(e.guards({ x: -1, y: 0, z: 0 }, front)).toBe(false); // from behind
    expect(e.guards({ x: 1, y: 0, z: 0 }, { ...front, headshot: true })).toBe(false);
    const r = e.applyDamage({ ...front, dir: { x: 1, y: 0, z: 0 } });
    expect(r.blocked).toBe(true);
    expect(r.dealt).toBeCloseTo(100 * (1 - ENEMIES.hollow_soldier!.frontalBlock!));
    const back = e.applyDamage({ ...front, dir: { x: -1, y: 0, z: 0 }, amount: 10 });
    expect(back.blocked).toBe(false);
    expect(back.dealt).toBe(10);
  });

  it('drops the guard while staggered and while recovering from an attack', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_soldier', { x: 6, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -30;
    const ev = shot(e.id, 1, 0);
    const dir = { x: 1, y: 0, z: 0 };
    expect(e.guards(dir, ev)).toBe(true);
    e.fsm.go(e.ctx, 'recover');
    expect(e.guards(dir, ev)).toBe(false);
    e.fsm.go(e.ctx, 'stagger');
    expect(e.guards(dir, ev)).toBe(false);
  });

  it('chases, telegraphs and lands bash/thrust on an exposed player', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_soldier', { x: 6, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -2;
    const seen = new Set<string>();
    h.step(8, () => seen.add(e.state));
    expect(seen.has('windup')).toBe(true);
    expect(h.hits.length).toBeGreaterThan(0);
    expect(h.hits.some((x) => x.weaponId?.startsWith('hollow_soldier:'))).toBe(true);
    expect(h.player.health.hp).toBeLessThan(100);
  });
});

// ------------------------------------------------------------------ M7 Burg archetypes

describe('M7 aim helpers', () => {
  it('leadPoint under-leads along the player velocity and caps the lead distance', () => {
    const out = { x: 0, y: 0, z: 0 };
    leadPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 4, 10, 0.5, 3, out);
    expect(out.x).toBe(10);
    expect(out.z).toBeGreaterThan(1.5); // t ≈ 1 s * 4 m/s * 0.5
    expect(out.z).toBeLessThan(2.5);
    leadPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 40, 10, 1, 3, out);
    expect(out.z).toBeCloseTo(3);
    leadPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 0, 10, 1, 3, out);
    expect(out.z).toBe(0);
  });

  it('solveLob lands a ballistic arc on the target', () => {
    const v = { x: 0, y: 0, z: 0 };
    const from = { x: 0, y: 1.9, z: 0 };
    const to = { x: 11, y: 0.1, z: 0 };
    const t = solveLob(from, to, 14, 9.8, v);
    expect(from.x + v.x * t).toBeCloseTo(11, 3);
    expect(from.y + v.y * t - 0.5 * 9.8 * t * t).toBeCloseTo(0.1, 3);
    // out of range: still reaches (speed raised)
    const t2 = solveLob(from, { x: 30, y: 0.1, z: 0 }, 14, 9.8, v);
    expect(from.x + v.x * t2).toBeCloseTo(30, 3);
  });

  it('boltAim leads a strafing target and lifts against bolt drop', () => {
    const d = { x: 0, y: 0, z: 0 };
    boltAim({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.1, z: -20 }, 5, 0, 18, 0.8, d);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(d.x).toBeGreaterThan(0.05); // leads +X
    boltAim({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: -20 }, 0, 0, 18, 0.8, d);
    expect(d.y).toBeGreaterThan(0); // drop compensation
  });

  it('crossbow cone: inside tracks exactly, outside clamps to the edge', () => {
    const home = 0; // facing -Z
    expect(inAimCone(home, 0, -5)).toBe(true);
    expect(inAimCone(home, 5, -5)).toBe(true); // 45°
    expect(inAimCone(home, 5, 0.5)).toBe(false); // ~95°
    expect(inAimCone(home, 0, 5)).toBe(false); // behind
    expect(clampAimYaw(home, 0, -5)).toBeCloseTo(0);
    expect(Math.abs(clampAimYaw(home, -5, 0.5))).toBeCloseTo(CROSSBOW.cone);
    expect(Math.abs(clampAimYaw(home, 5, 0.5))).toBeCloseTo(CROSSBOW.cone);
  });
});

describe('firebomb hollow', () => {
  it('distance band intent', () => {
    expect(bandIntent(5)).toBe(-1);
    expect(bandIntent(FIREBOMB.bandMin)).toBe(0);
    expect(bandIntent(11)).toBe(0);
    expect(bandIntent(FIREBOMB.bandMax + 0.1)).toBe(1);
  });

  it('keeps its distance band, telegraphs and lobs a molotov that burns the player', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_firebomb', { x: 5, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -6; // 11 m
    let minD = Infinity;
    let maxD = 0;
    let lobbed = false;
    let windupT = 0;
    h.step(7, () => {
      if (e.state === 'windup') windupT = e.ctx.stateTime;
      if (h.ai.hazards.activeShots(1) > 0) lobbed = true;
      if (e.state === 'chase') {
        minD = Math.min(minD, e.distToPlayer);
        maxD = Math.max(maxD, e.distToPlayer);
      }
    });
    expect(lobbed).toBe(true);
    expect(windupT).toBeGreaterThanOrEqual(0.9); // clear 1 s windup before release
    expect(minD).toBeGreaterThan(5);
    expect(maxD).toBeLessThan(16);
    expect(h.hits.some((x) => x.type === DamageType.Fire)).toBe(true);
    expect(h.player.health.hp).toBeLessThan(100);
  });

  it('flees when the player closes in', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_firebomb', { x: 0, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -3.5; // inside the flee distance, outside swipe range
    h.step(2);
    expect(e.distToPlayer).toBeGreaterThan(4.5);
  });
});

describe('crossbow hollow', () => {
  it('stays on its perch, aims 0.8 s, fires a slow dodgeable bolt that hits via hitPlayer', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_crossbow', { x: 6, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -6;
    let windupT = 0;
    let boltSpeed = 0;
    h.step(6, () => {
      if (e.state === 'windup') windupT = e.ctx.stateTime;
      for (const s of h.ai.hazards.shots) if (s.active && s.kind === 0 && !boltSpeed) boltSpeed = Math.hypot(s.vx, s.vz);
    });
    expect(Math.hypot(e.capsule.position.x - 6, e.capsule.position.z)).toBeLessThan(0.05);
    expect(windupT).toBeGreaterThanOrEqual(0.75);
    expect(boltSpeed).toBeCloseTo(18, 0);
    expect(h.hits.length).toBeGreaterThan(0);
    expect(h.hits[0]!.source).toBe(e.id);
    expect(h.hits[0]!.amount).toBe(35);
    expect(h.player.health.hp).toBeLessThan(100);
  });

  it('a player who sidesteps the slow bolt is not hit', () => {
    const h = harness(false);
    h.ai.spawn('hollow_crossbow', { x: 12, y: 0, z: 0 }, Math.PI / 2);
    h.player.position.x = -6; // 18 m: 1 s flight
    let fired = false;
    h.step(3.5, () => {
      const live = h.ai.hazards.activeShots(0) > 0;
      if (live) fired = true;
      h.player.position.z = live ? 3 : 0; // step out of the lane while it flies
    });
    expect(fired).toBe(true);
    expect(h.hits.length).toBe(0);
    expect(h.player.health.hp).toBe(100);
  });

  it('does not fire at a player outside its cone', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_crossbow', { x: 6, y: 0, z: 0 }, Math.PI / 2)!; // faces -X
    h.player.position.x = 12; // behind it
    h.step(5);
    expect(h.ai.hazards.activeShots(0)).toBe(0);
    expect(h.hits.length).toBe(0);
    expect(e.alive).toBe(true);
  });

  it('stun holds it still and blocks shots (common Enemy base)', () => {
    const h = harness(false);
    const e = h.ai.spawn('hollow_crossbow', { x: 6, y: 0, z: 0 }, Math.PI / 2)!;
    h.player.position.x = -6;
    e.stun(5);
    h.step(3);
    expect(e.state).toBe('stagger');
    expect(h.hits.length).toBe(0);
  });
});

describe('barrel hollow', () => {
  const op = (extra: object = {}) => ({
    enemy: 'barrel_hollow',
    pos: [6, 0, 0] as [number, number, number],
    yaw: Math.PI / 2, // facing -X, toward the player lane
    id: 'barrel1',
    trigger: { min: [-8, -1, -3] as [number, number, number], max: [-4, 3, 3] as [number, number, number] },
    ...extra,
  });

  it('idles until the trigger volume is entered, then pushes a barrel that hits the player', () => {
    const h = harness(false);
    const knock: number[] = [];
    h.bus.on('playerKnockdown', (k) => knock.push(k.duration));
    const e = h.ai.spawnOp(op())!;
    h.player.position.x = -20; // outside the volume
    h.step(2);
    expect(e.state).toBe('idle');
    expect(h.ai.hazards.barrels.some((b) => b.phase === 1)).toBe(true); // staged
    h.player.position.x = -6; // inside
    const seen: string[] = [];
    let rolled = false;
    h.step(5, () => {
      if (seen[seen.length - 1] !== e.state) seen.push(e.state);
      if (h.ai.hazards.barrels.some((b) => b.phase === 2)) rolled = true;
    });
    expect(seen).toContain('windup');
    expect(seen).toContain('recover');
    expect(rolled).toBe(true);
    const hit = h.hits.find((x) => x.weaponId?.endsWith(':barrel'));
    expect(hit).toBeDefined();
    expect(hit!.amount).toBeGreaterThanOrEqual(40); // heavy
    expect(knock.length).toBe(1);
    expect(h.player.health.hp).toBeLessThanOrEqual(60);
    // barrel broke at the end of its path
    h.step(4);
    expect(h.ai.hazards.barrels.every((b) => b.phase === 0)).toBe(true);
    // the hollow then fights as a weak sword hollow
    expect(['chase', 'windup', 'attack', 'recover', 'alert']).toContain(e.state);
  });

  it('i-frames dodge the barrel: contact is spent, no damage, no knockdown', () => {
    const h = harness(false);
    const knock: number[] = [];
    h.bus.on('playerKnockdown', (k) => knock.push(k.duration));
    h.ai.spawnOp(op());
    h.player.position.x = -6;
    h.player.invulnerable = true;
    h.step(6);
    const barrelHits = h.hits.filter((x) => x.weaponId?.endsWith(':barrel'));
    expect(barrelHits.length).toBe(1); // spent after the (dodged) contact
    expect(knock.length).toBe(0);
    expect(h.player.health.hp).toBe(100);
  });

  it('triggerBarrel(id) starts the roll without a volume entry; unknown ids are ignored', () => {
    const h = harness(false);
    const e = h.ai.spawnOp(op({ trigger: { min: [100, 0, 100], max: [101, 1, 101] } }))!;
    h.player.position.x = -20;
    h.step(1.5);
    expect(e.state).toBe('idle');
    expect(h.ai.triggerBarrel('nope')).toBe(false);
    expect(h.ai.triggerBarrel('barrel1')).toBe(true);
    expect(h.ai.triggerBarrel('barrel1')).toBe(false); // already armed
    h.step(1.2);
    expect(h.ai.hazards.barrels.some((b) => b.phase >= 2)).toBe(true);
  });

  it('follows a custom waypoint path and breaks against a wall', () => {
    const h = harness(true); // wall at x∈[-0.5,0.5], z∈[-4,4]
    const e = h.ai.spawnOp(op({ pos: [8, 0, 0], path: [[-5, 0, 0]] }))!;
    h.player.position.x = -20;
    h.ai.triggerBarrel(e.id);
    h.step(6);
    expect(h.ai.hazards.barrels.every((b) => b.phase === 0)).toBe(true);
    expect(h.hits.some((x) => x.weaponId?.endsWith(':barrel'))).toBe(false);
  });

  it('barrel hollow is stunnable and not a boss (common Enemy base)', () => {
    const h = harness(false);
    const e = h.ai.spawnOp(op())!;
    expect(e.isBoss).toBe(false);
    e.stun(1);
    expect(e.state).toBe('stagger');
  });
});
