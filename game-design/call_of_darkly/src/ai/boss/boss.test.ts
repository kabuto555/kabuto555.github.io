import { describe, expect, it } from 'vitest';
import type { DamageEvent } from '../../core/entity';
import { EventBus } from '../../core/events';
import { Rng } from '../../core/rng';
import { SIM_DT } from '../../core/time';
import type { DamageResult } from '../../combat/types';
import type { HitTarget } from '../../combat/targets';
import { ENEMIES } from '../../data/enemies';
import { StatsResolver } from '../../inventory/modifiers';
import { createCollisionWorld } from '../../physics/grid';
import { Layer } from '../../physics/types';
import { ROLL_TIERS, rollInvulnerable } from '../../player/rollTier';
import { createLevelDsl } from '../../world/dsl';
import { buildTaurusArena, TAURUS_TEST_AREA } from '../../world/areas/taurus';
import { AiSystem } from '../system';
import { ARENA, ArenaFrame, getTaurusArena } from './arena';
import { FOG_PROMPT } from './fogWall';
import { installTaurus, type TaurusInstall } from './index';
import { PLUNGE, PlungeTracker, plungeDamage } from './plunge';
import { chooseTaurusMove, CHARGE, JUMP, TAURUS_ID, TAURUS_MOVES, TAURUS_TUNING, taurusData } from './taurus';

const DEF = ENEMIES[TAURUS_ID]!;
const attack = (id: string) => DEF.attacks.find((a) => a.id === id)!;
const NORMAL = ROLL_TIERS.normal;

// ------------------------------------------------------------------ harness

interface Interactable {
  pos: { x: number; y: number; z: number };
  range: number;
  enabled?(): boolean;
  prompt(): string | null;
  interact(): void;
}

function harness(opts: { defeated?: boolean; hints?: number } = {}) {
  const world = createCollisionWorld(4);
  // approach + deck + far platform (one slab), parapet walls either side
  world.add({ aabb: { min: { x: -6, y: -1, z: -16 }, max: { x: 6, y: 0, z: 70 } }, layer: Layer.World, solid: true });
  world.add({ aabb: { min: { x: -4.5, y: 0, z: 0 }, max: { x: -4, y: 1.1, z: 60 } }, layer: Layer.World, solid: true });
  world.add({ aabb: { min: { x: 4, y: 0, z: 2.4 }, max: { x: 4.5, y: 1.1, z: 60 } }, layer: Layer.World, solid: true });
  const bus = new EventBus();
  const player = {
    id: 1,
    position: { x: 0, y: 0, z: -4 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    state: { move: 'ground' },
    health: { hp: 1000, maxHp: 1000 },
    invulnerable: false,
    capsule: { radius: 0.35 },
    teleports: 0,
    teleport(p: { x: number; y: number; z: number }) {
      this.position.x = p.x;
      this.position.y = p.y;
      this.position.z = p.z;
      this.teleports++;
    },
  };
  const hits: DamageEvent[] = [];
  const targets = new Set<HitTarget>();
  const combat = {
    addTarget: (t: HitTarget) => void targets.add(t),
    removeTarget: (t: HitTarget) => void targets.delete(t),
    hitPlayer(e: DamageEvent): DamageResult {
      hits.push(e);
      if (player.invulnerable) return { dealt: 0, blocked: false, poiseBroken: false, killed: false };
      player.health.hp -= e.amount;
      return { dealt: e.amount, blocked: false, poiseBroken: false, killed: player.health.hp <= 0 };
    },
  };
  const ai = new AiSystem({ world, combat, player, headless: true, events: bus, stats: new StatsResolver(), rng: new Rng(7) });
  const items: Interactable[] = [];
  const interact = {
    register(i: Interactable) {
      items.push(i);
      return () => void items.splice(items.indexOf(i), 1);
    },
  };
  const log: { name: string; payload: unknown }[] = [];
  for (const n of ['bossBar', 'banner', 'hintFlash', 'demoComplete', 'plungeHit'] as const) bus.on(n, (p) => log.push({ name: n, payload: p }));
  let defeated = opts.defeated ?? false;
  let hintCount = opts.hints ?? 0;
  const taurus: TaurusInstall = installTaurus({
    ai,
    player,
    world,
    events: bus,
    interact,
    arena: { pos: [0, 0, 0], yaw: 0 },
    isDefeated: () => defeated,
    setDefeated: () => (defeated = true),
    getDodgeHintCount: () => hintCount,
    incDodgeHintCount: () => void hintCount++,
  });
  const step = (seconds: number, each?: (t: number) => void) => {
    const n = Math.round(seconds / SIM_DT);
    for (let i = 0; i < n; i++) {
      each?.(i * SIM_DT);
      ai.update(SIM_DT);
      taurus.update(SIM_DT);
    }
  };
  step(SIM_DT); // lazy start: fog, barrier, boss
  return {
    world, bus, player, hits, targets, ai, taurus, items, log, step,
    get defeated() { return defeated; },
    get hints() { return hintCount; },
  };
}

type H = ReturnType<typeof harness>;

/** Engage, then put the boss at local z and the player `dist` m in front of it. */
function faceOff(h: H, dist: number, bossZ = 20) {
  h.taurus.engage();
  const b = h.taurus.boss!;
  b.capsule.teleport({ x: 0, y: 0, z: bossZ });
  b.transform.yaw = Math.PI; // facing +z
  h.player.position.x = 0;
  h.player.position.y = 0;
  h.player.position.z = bossZ + dist;
  return b;
}

/** Force a move and run it; the player rolls `rollAt` s after the windup starts (null = no roll). */
function runMove(h: H, id: string, rollAt: number | null, seconds?: number) {
  const b = h.taurus.boss!;
  const m = TAURUS_MOVES[id]!;
  seconds ??= attack(id).windup + (id === 'jump_slam' ? JUMP.flight : 0) + m.active + m.recover + 0.1;
  b.attackCooldown = 99; // no follow-ups
  b.ctx.currentAttack = attack(id);
  b.state = 'windup';
  h.step(seconds, (t) => {
    h.player.invulnerable = rollAt !== null && rollInvulnerable(NORMAL, t - rollAt);
    // the player stands still; keep it out of the boss capsule like the real push-out
  });
  h.player.invulnerable = false;
}

// ------------------------------------------------------------------ telegraphs vs §3 dodge

describe('Taurus telegraphs (§3 fairness)', () => {
  it('every move has a windup >= 0.6 s and a hit window that fits in a normal roll', () => {
    const iWindow = NORMAL.iEnd - NORMAL.iStart;
    for (const a of DEF.attacks) {
      const m = TAURUS_MOVES[a.id]!;
      expect(m, a.id).toBeDefined();
      expect(a.windup, a.id).toBeGreaterThanOrEqual(0.6);
      expect(m.active, a.id).toBeLessThanOrEqual(iWindow);
      // a roll started iStart before the hit window covers all of it
      const start = a.windup - NORMAL.iStart;
      for (let t = 0; t <= m.active; t += 0.01) expect(rollInvulnerable(NORMAL, a.windup + t - start), `${a.id}@${t}`).toBe(true);
      // commits (stops tracking) before the end of the windup, so a late roll sidesteps it too
      expect(m.track, a.id).toBeLessThanOrEqual(1);
    }
    // jump slam: the flight adds to the telegraph (landing ring shows the spot)
    expect(attack('jump_slam').windup + JUMP.flight).toBeGreaterThan(2);
  });

  it.each([
    ['overhead_smash', 3, 0],
    ['sweep', 3.5, 0],
    ['jump_slam', 9, JUMP.flight],
  ])('%s: standing still gets hit, a timed roll takes nothing', (id, dist, extra) => {
    const a = attack(id);
    const hit = harness();
    faceOff(hit, dist);
    runMove(hit, id, null);
    expect(hit.hits.length).toBe(1);
    expect(hit.player.health.hp).toBe(1000 - a.damage);

    const roll = harness();
    faceOff(roll, dist);
    runMove(roll, id, a.windup + extra - NORMAL.iStart - SIM_DT);
    expect(roll.hits.length).toBe(1); // rolled through: the swing is spent
    expect(roll.player.health.hp).toBe(1000);
  });

  it('charge: rolling when it is ~3.5 m away passes through it', () => {
    const a = attack('charge');
    const run = (doRoll: boolean) => {
      const h = harness();
      const b = faceOff(h, 12);
      let rollT = -1;
      b.attackCooldown = 99;
      b.ctx.currentAttack = a;
      b.state = 'windup';
      h.step(4, (t) => {
        const d = Math.hypot(h.player.position.x - b.capsule.position.x, h.player.position.z - b.capsule.position.z);
        if (doRoll && rollT < 0 && b.state === 'attack' && d < 3.6) rollT = t;
        h.player.invulnerable = rollT >= 0 && rollInvulnerable(NORMAL, t - rollT);
      });
      return h;
    };
    const hit = run(false);
    expect(hit.player.health.hp).toBe(1000 - a.damage);
    const dodged = run(true);
    expect(dodged.hits.length).toBe(1);
    expect(dodged.player.health.hp).toBe(1000);
    expect(CHARGE.speed * NORMAL.iStart).toBeLessThan(3.6 - (TAURUS_TUNING.capsuleRadius + CHARGE.reach));
  });

  it('move choice respects range bands (close = swings, far = gap closers)', () => {
    for (let i = 0; i < 20; i++) {
      const close = chooseTaurusMove(3, 0, i / 20, null, 0);
      expect(['overhead_smash', 'sweep']).toContain(close);
      const far = chooseTaurusMove(14, 0, i / 20, null, 0);
      expect(['jump_slam', 'charge']).toContain(far);
    }
    expect(chooseTaurusMove(40, 0, 0.5, null, 0)).toBeNull();
    // no third repeat when there is an alternative
    for (let i = 0; i < 20; i++) expect(chooseTaurusMove(3, 0, i / 20, 'sweep', 2)).toBe('overhead_smash');
  });

  it('flashes the dodge hint on the first 3 windups ever (persisted count)', () => {
    const h = harness({ hints: 1 });
    faceOff(h, 3);
    for (let i = 0; i < 4; i++) runMove(h, 'sweep', null);
    expect(h.log.filter((l) => l.name === 'hintFlash').length).toBe(2);
    expect(h.log.find((l) => l.name === 'hintFlash')!.payload).toMatchObject({ action: 'dodge', label: 'Dodge' });
    expect(h.hints).toBe(3);
  });
});

// ------------------------------------------------------------------ plunge

/** Free fall from `fromY` (player gravity 22) at horizontal offset `off` from a boss at y = 0. */
function fall(fromY: number, off: number, boss = { x: 0, y: 0, z: 0, height: 4.7 }) {
  const t = new PlungeTracker();
  let y = fromY;
  let vy = 0;
  t.update(off, y, 0, 0, true, boss); // standing on the ledge
  for (let i = 0; i < 400; i++) {
    vy -= 22 * SIM_DT;
    y += vy * SIM_DT;
    const grounded = y <= 0;
    if (grounded) y = 0;
    const hit = t.update(off, y, 0, grounded ? 0 : vy, grounded, boss);
    if (hit) return hit;
    if (grounded) return null;
  }
  return null;
}

describe('plunge detection', () => {
  it('a drop from the 8 m ledge onto the head is a head plunge', () => {
    expect(fall(8, 0.5)).toBe('head');
    expect(fall(8, PLUNGE.headRadius - 0.1)).toBe('head');
  });

  it('landing close (outside the head radius) still counts; far away does not', () => {
    expect(fall(8, PLUNGE.headRadius + 0.5)).toBe('land');
    expect(fall(8, PLUNGE.landRadius + 0.5)).toBeNull();
  });

  it('needs >= 5 m of fall', () => {
    expect(fall(PLUNGE.minFall + 0.2, 0.5)).toBe('head');
    expect(fall(PLUNGE.minFall - 0.3, 0.5)).toBeNull();
    expect(fall(2, 0.5)).toBeNull();
  });

  it('fires once per fall and ignores slow descents (stairs)', () => {
    const t = new PlungeTracker();
    const boss = { x: 0, y: 0, z: 0, height: 4.7 };
    t.update(0, 8, 0, 0, true, boss);
    expect(t.update(0, 4.5, 0, -15, false, boss)).toBe('head');
    expect(t.update(0, 3, 0, -16, false, boss)).toBeNull();
    expect(t.update(0, 0, 0, 0, true, boss)).toBeNull();
    // walking down: tiny airborne hops at low speed
    const s = new PlungeTracker();
    for (let y = 8; y > 0; y -= 0.2) {
      expect(s.update(0, y, 0, -2, false, boss)).toBeNull();
      expect(s.update(0, y - 0.1, 0, 0, true, boss)).toBeNull();
    }
  });

  it('system: a plunge deals 30% max HP and staggers the boss', () => {
    const h = harness();
    const b = faceOff(h, 6);
    h.step(2); // roar → chase
    expect(b.state).not.toBe('stagger');
    // drop from 8 m straight onto it
    const p = h.player;
    const bp = b.capsule.position;
    p.position.x = bp.x + 0.3;
    p.position.z = bp.z;
    p.position.y = 8;
    p.grounded = true;
    h.step(SIM_DT);
    p.grounded = false;
    let vy = 0;
    let n = 0;
    while (p.position.y > 0 && n++ < 200 && b.state !== 'stagger') {
      vy -= 22 * SIM_DT;
      p.velocity.y = vy;
      p.position.y = Math.max(0, p.position.y + vy * SIM_DT);
      p.position.x = bp.x + 0.3;
      p.position.z = bp.z;
      h.step(SIM_DT);
    }
    expect(b.state).toBe('stagger');
    expect(b.health.hp).toBe(DEF.hp - plungeDamage(DEF.hp));
    expect(plungeDamage(DEF.hp)).toBe(1050);
    expect(h.log.some((l) => l.name === 'plungeHit')).toBe(true);
  });
});

// ------------------------------------------------------------------ fog wall, reset, victory

const fogBlocked = (h: H) => h.world.overlapAABB({ min: { x: -1, y: 0.5, z: -0.1 }, max: { x: 1, y: 1.5, z: 0.1 } }, Layer.Barrier).length > 0;
const farBlocked = (h: H) => h.world.overlapAABB({ min: { x: -1, y: 0.5, z: ARENA.farZ - 0.1 }, max: { x: 1, y: 1.5, z: ARENA.farZ + 0.1 } }, Layer.Barrier).length > 0;

describe('fog wall + encounter', () => {
  it('fog wall is solid, prompts only from outside, and [E] drops the player in and starts the fight', () => {
    const h = harness();
    expect(fogBlocked(h)).toBe(true);
    expect(farBlocked(h)).toBe(true);
    const boss = h.taurus.boss!;
    expect(boss.state).toBe('idle');
    expect(h.targets.has(boss)).toBe(false); // can't be shot through the fog
    const fog = h.items[0]!;
    expect(fog.prompt()).toBe(FOG_PROMPT);
    fog.interact();
    expect(h.player.position.z).toBeCloseTo(ARENA.entry.z, 3);
    expect(h.taurus.engaged).toBe(true);
    expect(h.taurus.inBossArena()).toBe(TAURUS_ID);
    expect(fog.prompt()).toBeNull(); // one way
    expect(fogBlocked(h)).toBe(true);
    expect(h.targets.has(boss)).toBe(true);
    expect(h.log.find((l) => l.name === 'bossBar')!.payload).toMatchObject({ show: true, name: 'Taurus Demon', hp: 3500, max: 3500 });
    h.step(TAURUS_TUNING.alertTime + 0.2);
    expect(['chase', 'windup', 'attack', 'recover']).toContain(boss.state);
  });

  it('bossReset (died in the arena) heals, rehomes and re-arms; rests never respawn the boss', () => {
    const h = harness();
    const b = faceOff(h, 3);
    h.step(3);
    b.health.hp = 1200;
    const id = b.id;
    h.ai.respawnAll(); // bonfire rest / death respawn: bosses are pinned
    expect(h.taurus.boss).toBe(b);
    expect(h.ai.enemies.some((e) => e.id === id)).toBe(true);
    expect(b.health.hp).toBe(1200);
    h.bus.emit('bossReset', { bossId: TAURUS_ID });
    expect(b.health.hp).toBe(DEF.hp);
    expect(b.state).toBe('idle');
    expect(b.capsule.position.z).toBeCloseTo(ARENA.bossHome.z, 3);
    expect(h.taurus.engaged).toBe(false);
    expect(h.taurus.inBossArena()).toBeNull();
    expect(fogBlocked(h)).toBe(true);
    expect(h.targets.has(b)).toBe(false);
    expect(h.log[h.log.length - 1]).toEqual({ name: 'bossBar', payload: { show: false } });
    // the player is back outside: prompt again
    h.player.position.z = -3;
    h.player.position.x = 0;
    expect(h.items[0]!.prompt()).toBe(FOG_PROMPT);
  });

  it('death: VICTORY, souls via enemyDeath, gates open, Demo Complete after a beat; persisted', () => {
    const h = harness();
    const b = faceOff(h, 6);
    let souls = 0;
    h.bus.on('enemyDeath', (e) => (souls += e.souls));
    b.applyDamage({ source: 1, target: b.id, amount: 1e6, type: 0 as never, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 } });
    expect(souls).toBe(3000);
    expect(h.defeated).toBe(true);
    expect(h.log.some((l) => l.name === 'banner' && (l.payload as { kind: string }).kind === 'victory')).toBe(true);
    expect(fogBlocked(h)).toBe(false);
    expect(farBlocked(h)).toBe(false);
    expect(h.taurus.inBossArena()).toBeNull();
    h.step(3);
    expect(h.log.some((l) => l.name === 'demoComplete')).toBe(false);
    h.step(3.2);
    expect(h.log.filter((l) => l.name === 'demoComplete').length).toBe(1);
    expect(h.log.some((l) => l.name === 'banner' && (l.payload as { kind: string }).kind === 'demoComplete')).toBe(true);
    // a reset after the kill does nothing
    h.bus.emit('bossReset', { bossId: TAURUS_ID });
    expect(b.alive).toBe(false);

    // reload with the defeat persisted: no boss, no fog, bridge open
    const r = harness({ defeated: true });
    expect(r.taurus.boss).toBeNull();
    expect(r.ai.enemies.length).toBe(0);
    expect(fogBlocked(r)).toBe(false);
    expect(farBlocked(r)).toBe(false);
    expect(r.items.length).toBe(0);
    expect(r.taurus.inBossArena()).toBeNull();
  });

  it('AiSystem.bossInArena() forwards to the boss system', () => {
    const h = harness();
    expect(h.ai.bossInArena()).toBeNull();
    h.taurus.engage();
    expect(h.ai.bossInArena()).toBe(TAURUS_ID);
  });
});

// ------------------------------------------------------------------ arena layout

describe('Taurus arena', () => {
  it('frame round-trips and rotates local +z to world +x at a quarter turn', () => {
    const f = new ArenaFrame({ pos: [10, 2, -5], yaw: Math.PI / 2 });
    const w = f.toWorld(1, 3, 20);
    expect(w).toEqual({ x: 30, y: 5, z: -6 });
    expect(f.toLocal(w.x, w.y, w.z)).toEqual({ x: 1, y: 3, z: 20 });
    expect(f.inArena(w.x, w.y, w.z)).toBe(true);
    const out = f.toWorld(0, 0, -3);
    expect(f.inArena(out.x, out.y, out.z)).toBe(false);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('builds the deck and the 8 m plunge ledge at yaw %f', (yaw) => {
    const dsl = createLevelDsl();
    buildTaurusArena(dsl, { pos: [5, 10, 7], yaw });
    expect(getTaurusArena()).toEqual({ pos: [5, 10, 7], yaw });
    const f = new ArenaFrame({ pos: [5, 10, 7], yaw });
    const inside = (lx: number, ly: number, lz: number) => {
      const p = f.toWorld(lx, ly, lz);
      return dsl.ops.some((o) => o.op === 'box' && p.x > o.x - o.w / 2 && p.x < o.x + o.w / 2 && p.z > o.z - o.d / 2 && p.z < o.z + o.d / 2 && p.y > o.y && p.y < o.y + o.h);
    };
    expect(inside(0, -0.1, 30)).toBe(true); // deck
    expect(inside(0, 0.5, 30)).toBe(false); // nothing on the deck
    expect(inside(ARENA.ledge.x, ARENA.ledge.y - 0.1, ARENA.ledge.z)).toBe(true); // ledge top at +8
    expect(inside(0, 5, ARENA.ledge.z)).toBe(false); // clear drop under the ledge
    expect(dsl.ops.some((o) => o.op === 'spawn')).toBe(false); // boss is spawned by installTaurus
  });

  it('test area starts the player outside the fog, facing it', () => {
    const dsl = createLevelDsl();
    TAURUS_TEST_AREA.build(dsl);
    expect(TAURUS_TEST_AREA.spawn.pos[2]).toBeLessThan(ARENA.fogZ);
    expect(-Math.cos(TAURUS_TEST_AREA.spawn.yaw)).toBeCloseTo(1); // forward = +z
  });
});

// keep taurusData referenced for the headless jump test
describe('jump slam', () => {
  it('lands on the player spot (clamped to the deck) and shows the landing ring while airborne', () => {
    const h = harness();
    const b = faceOff(h, 9);
    h.player.position.x = 3.9; // near the parapet: landing is clamped inside
    b.ctx.currentAttack = attack('jump_slam');
    b.attackCooldown = 99;
    b.state = 'windup';
    let wasAirborne = false;
    h.step(attack('jump_slam').windup + JUMP.flight * 0.5 + SIM_DT, () => (wasAirborne ||= taurusData(b).airborne));
    expect(wasAirborne).toBe(true);
    expect(b.capsule.position.y).toBeGreaterThan(1);
    h.step(1.5);
    expect(b.capsule.position.y).toBeCloseTo(0, 1);
    expect(Math.abs(b.capsule.position.x)).toBeLessThanOrEqual(ARENA.halfWidth - TAURUS_TUNING.capsuleRadius);
    expect(b.capsule.position.z).toBeGreaterThan(26);
  });
});

describe('boss audio/fx events', () => {
  it('jump slam: one enemyWindup, one bossSlam at the landing', () => {
    const h = harness();
    faceOff(h, 9);
    const slams: { x: number; y: number; z: number; r: number }[] = [];
    let winds = 0;
    h.bus.on('bossSlam', (e) => slams.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, r: e.radius }));
    h.bus.on('enemyWindup', () => winds++);
    runMove(h, 'jump_slam', null);
    expect(winds).toBe(1);
    expect(slams.length).toBe(1);
    expect(slams[0]!.y).toBeCloseTo(0, 1);
    expect(slams[0]!.r).toBe(JUMP.aoeRadius);
  });
  it('overhead smash: one bossSlam; sweep: none', () => {
    const h = harness();
    faceOff(h, 3);
    let n = 0;
    h.bus.on('bossSlam', () => n++);
    runMove(h, 'overhead_smash', null);
    expect(n).toBe(1);
    runMove(h, 'sweep', null);
    expect(n).toBe(1);
  });
});

// ------------------------------------------------------------------ review fixes (M7/M8)

describe('fog bypass (Burg ledge / tower stairs over the wall)', () => {
  it('walking into the arena volume engages without a teleport; fog stays solid and one-way', () => {
    const h = harness();
    const boss = h.taurus.boss!;
    h.player.position.x = 0;
    h.player.position.y = 8.05; // the plunge ledge, 8 m over the deck
    h.player.position.z = 14;
    h.step(SIM_DT * 2);
    expect(h.player.teleports).toBe(0);
    expect(h.player.position.z).toBe(14);
    expect(h.taurus.engaged).toBe(true);
    expect(h.targets.has(boss)).toBe(true);
    expect(h.log.some((l) => l.name === 'bossBar' && (l.payload as { show: boolean }).show)).toBe(true);
    expect(fogBlocked(h)).toBe(true);
    expect(h.items[0]!.prompt()).toBeNull(); // no [E] from inside
  });

  it('outside the volume (approach, or dead in it) does not engage', () => {
    const h = harness();
    h.step(1);
    expect(h.taurus.engaged).toBe(false);
    h.player.position.z = 6;
    h.player.state.move = 'dead';
    h.step(0.2);
    expect(h.taurus.engaged).toBe(false);
    h.player.state.move = 'ground';
    h.step(0.2);
    expect(h.taurus.engaged).toBe(true);
  });

  it('a plunge from the ledge as the opener (never teleported) hits the boss', () => {
    const h = harness();
    const b = h.taurus.boss!;
    const p = h.player;
    b.capsule.teleport({ x: 0, y: 0, z: 14 });
    p.position.x = 0.2;
    p.position.y = 8.05;
    p.position.z = 14;
    p.grounded = true;
    h.step(SIM_DT * 2); // standing on the ledge: auto-engage + the tracker learns the ground
    expect(h.taurus.engaged).toBe(true);
    p.grounded = false;
    let vy = 0;
    let n = 0;
    while (p.position.y > 0 && n++ < 200 && b.state !== 'stagger') {
      vy -= 22 * SIM_DT;
      p.velocity.y = vy;
      p.position.y = Math.max(0, p.position.y + vy * SIM_DT);
      p.position.x = b.capsule.position.x + 0.2;
      p.position.z = b.capsule.position.z;
      h.step(SIM_DT);
    }
    expect(p.teleports).toBe(0);
    expect(b.state).toBe('stagger');
    expect(b.health.hp).toBe(DEF.hp - plungeDamage(DEF.hp));
  });

  it('PlungeTracker.reset clears the remembered ground / peak', () => {
    const t = new PlungeTracker();
    const boss = { x: 0, y: 0, z: 0, height: 4.7 };
    t.update(0, 8, 0, 0, true, boss); // stood on the ledge
    t.reset();
    expect(t.peakY).toBe(0);
    // a stale groundY of 8 would make this 3 m hop measure a 8 m fall and hit
    expect(t.update(0, 3, 0, -10, false, boss)).toBeNull();
  });
});

describe('debug kills do not write boss state', () => {
  it('killAll skips the pinned boss; a non-engaged boss death writes no victory flag', () => {
    const h = harness();
    const b = h.taurus.boss!;
    expect(h.ai.killAll()).toBe(0);
    expect(b.alive).toBe(true);
    b.kill(null); // dev kill while dormant behind the fog
    expect(h.defeated).toBe(false);
    expect(h.log.some((l) => l.name === 'banner')).toBe(false);
    expect(fogBlocked(h)).toBe(true);
  });

  it('a real kill (engaged) still sets the flag', () => {
    const h = harness();
    const b = faceOff(h, 6);
    b.applyDamage({ source: 1, target: b.id, amount: 1e6, type: 0 as never, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 } });
    expect(h.defeated).toBe(true);
  });
});

describe('victory sequence', () => {
  it('DEMO COMPLETE waits while the player is dead and fires after the respawn', () => {
    const h = harness();
    const b = faceOff(h, 6);
    b.applyDamage({ source: 1, target: b.id, amount: 1e6, type: 0 as never, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 } });
    h.player.state.move = 'dead';
    h.player.health.hp = 0;
    h.step(10);
    expect(h.log.some((l) => l.name === 'demoComplete')).toBe(false);
    h.player.state.move = 'ground';
    h.player.health.hp = 100;
    h.step(5.5);
    expect(h.log.some((l) => l.name === 'demoComplete')).toBe(false);
    h.step(1);
    expect(h.log.filter((l) => l.name === 'demoComplete').length).toBe(1);
  });

  it('a reload with the defeat persisted restores demoCompleted', () => {
    const r = harness({ defeated: true });
    expect(r.taurus.demoCompleted).toBe(true);
    expect(harness().taurus.demoCompleted).toBe(false);
  });
});
