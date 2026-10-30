import { describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { Rng } from '../core/rng';
import { AMMO } from '../data/ammo';
import { WEAPONS } from '../data/weapons';
import type { GunDef, ShieldDef } from '../data/types';
import { StatsResolver } from '../inventory/modifiers';
import { aabbFromFootprint } from '../physics/aabb';
import { SpatialGrid } from '../physics/grid';
import { Layer } from '../physics/types';
import type { PlayerState } from '../player/types';
import { castBullet, newBulletHit } from './hitscan';
import {
  addCapped,
  bloomStep,
  bulletDamage,
  computeSpread,
  damageFalloff,
  fireInterval,
  hitsFront,
  inMeleeArc,
  pelletsForShot,
  rayVCapsule,
  raySphere,
  recoilKick,
  recoilRecover,
  reloadDuration,
  reloadFill,
  resolveBlock,
  roundsPerShot,
} from './math';
import { HUMANOID_SHAPE, type HitTarget } from './targets';
import { COMBAT_TUNING as C } from './tuning';
import { CombatSystem, type CombatPlayer } from './system';
import { AmmoStore } from './weapons';

const AR = WEAPONS.m4_ar as GunDef;
const RIOT = WEAPONS.riot_shield as ShieldDef;
const BALLISTIC = WEAPONS.ballistic_shield as ShieldDef;

describe('damage falloff / headshots', () => {
  it('is 1 up close, falloffMin at range, linear between, flat beyond', () => {
    expect(damageFalloff(40, 0.5, 0)).toBe(1);
    expect(damageFalloff(40, 0.5, 40 * C.falloffStartFrac)).toBe(1);
    expect(damageFalloff(40, 0.5, 40)).toBeCloseTo(0.5);
    expect(damageFalloff(40, 0.5, 100)).toBeCloseTo(0.5);
    const mid = damageFalloff(40, 0.5, (40 * C.falloffStartFrac + 40) / 2);
    expect(mid).toBeCloseTo(0.75);
  });
  it('applies headshot multiplier and stat multiplier', () => {
    expect(bulletDamage(AR, 0, false, 1)).toBe(22);
    expect(bulletDamage(AR, 0, true, 1)).toBe(44);
    expect(bulletDamage(AR, 0, false, 1.5)).toBeCloseTo(33);
    const mk = WEAPONS.marksman_rifle as GunDef;
    expect(bulletDamage(mk, 0, true, 1)).toBeCloseTo(175);
  });
  it('fire interval from rpm', () => {
    expect(fireInterval(750)).toBeCloseTo(0.08);
    expect(fireInterval(60)).toBe(1);
  });
});

describe('spread / bloom', () => {
  const base = { hip: 3, ads: 1, adsT: 0, speed: 0, walkSpeed: 4.5, airborne: false, bloom: 0, classMul: 1, adsSway: 1 };
  it('ADS tightens, movement and air widen, bloom adds', () => {
    const hip = computeSpread(base);
    expect(hip).toBeCloseTo(3);
    expect(computeSpread({ ...base, adsT: 1 })).toBeCloseTo(1);
    expect(computeSpread({ ...base, speed: 4.5 })).toBeGreaterThan(hip);
    expect(computeSpread({ ...base, airborne: true })).toBeGreaterThan(hip);
    expect(computeSpread({ ...base, bloom: 1 })).toBeCloseTo(hip + 1);
    expect(computeSpread({ ...base, adsT: 1, adsSway: 0.5 })).toBeCloseTo(0.5);
  });
  it('bloom grows per shot (capped) and decays', () => {
    let b = 0;
    for (let i = 0; i < 100; i++) b = bloomStep(b, 0.016, true);
    expect(b).toBe(C.bloomMax);
    for (let i = 0; i < 200; i++) b = bloomStep(b, 0.016, false);
    expect(b).toBe(0);
  });
});

describe('recoil', () => {
  it('climbs over a burst, ADS and recoil modifier reduce it', () => {
    const k0 = recoilKick(AR, 0, 0.5, false, 1);
    const k9 = recoilKick(AR, 9, 0.5, false, 1);
    expect(k9.up).toBeGreaterThan(k0.up);
    expect(recoilKick(AR, 3, 0.5, true, 1).up).toBeLessThan(recoilKick(AR, 3, 0.5, false, 1).up);
    expect(recoilKick(AR, 3, 0.5, false, 0.5).up).toBeCloseTo(recoilKick(AR, 3, 0.5, false, 1).up * 0.5);
  });
  it('horizontal jitter is symmetric about 0', () => {
    expect(recoilKick(AR, 0, 0.5, false, 1).side).toBeCloseTo(0);
    expect(recoilKick(AR, 0, 1, false, 1).side).toBeGreaterThan(0);
    expect(recoilKick(AR, 0, 0, false, 1).side).toBeLessThan(0);
  });
  it('recovers only after the delay and never overshoots', () => {
    expect(recoilRecover(2, 0.016, 0)).toBe(0);
    let acc = 2;
    for (let i = 0; i < 300; i++) acc -= recoilRecover(acc, 0.016, 1);
    expect(acc).toBeCloseTo(0, 5);
    expect(recoilRecover(-1, 0.016, 1)).toBeLessThan(0);
  });
});

describe('reload / ammo caps', () => {
  it('tactical is faster than empty; reloadSpeed divides', () => {
    expect(reloadDuration(2.5, 10, 1)).toBeLessThan(reloadDuration(2.5, 0, 1));
    expect(reloadDuration(2.5, 0, 1)).toBe(2.5);
    expect(reloadDuration(2.5, 0, 2)).toBe(1.25);
  });
  it('fills the mag from reserve', () => {
    expect(reloadFill(10, 30, 100)).toEqual({ mag: 30, reserve: 80 });
    expect(reloadFill(0, 30, 12)).toEqual({ mag: 12, reserve: 0 });
    expect(reloadFill(30, 30, 50)).toEqual({ mag: 30, reserve: 50 });
  });
  it('caps match PLAN and overflow is reported', () => {
    expect(AMMO.rifle.cap).toBe(240);
    expect(addCapped(230, 30, 240)).toEqual({ total: 240, overflow: 20 });
    expect(addCapped(0, 10, 90)).toEqual({ total: 10, overflow: 0 });
    const bus = new EventBus();
    const a = new AmmoStore(bus);
    expect(a.add('pistol', 200)).toBe(110);
    expect(a.get('pistol')).toBe(90);
    a.set('launcher', 99);
    expect(a.get('launcher')).toBe(4);
    expect(a.take('pistol', 100)).toBe(90);
  });
  it('double-barrel consumes both barrels in one click', () => {
    const db = WEAPONS.double_barrel as GunDef;
    expect(roundsPerShot('double', 2)).toBe(2);
    expect(roundsPerShot('double', 1)).toBe(1);
    expect(pelletsForShot(db, 2)).toBe(db.pellets);
    expect(pelletsForShot(db, 1)).toBe(db.pellets / 2);
    expect(pelletsForShot(WEAPONS.pump_shotgun as GunDef, 1)).toBe(12);
  });
});

describe('shield block', () => {
  it('riot blocks 100% physical; stamina = damage × (1 − stability)', () => {
    const r = resolveBlock(30, DamageType.Physical, RIOT, 100);
    expect(r.damageTaken).toBe(0);
    expect(r.staminaCost).toBeCloseTo(30 * (1 - RIOT.stability));
    expect(r.guardBroken).toBe(false);
  });
  it('ballistic leaks 20% and costs less', () => {
    const r = resolveBlock(50, DamageType.Physical, BALLISTIC, 100);
    expect(r.damageTaken).toBeCloseTo(10);
    expect(r.staminaCost).toBeCloseTo(40 * (1 - BALLISTIC.stability));
  });
  it('does not block fire/explosive', () => {
    expect(resolveBlock(40, DamageType.Fire, RIOT, 100)).toEqual({ damageTaken: 40, staminaCost: 0, guardBroken: false });
  });
  it('guard breaks when stamina cannot cover the hit; uncovered part goes through', () => {
    const full = 100 * (1 - RIOT.stability); // stamina the whole block would cost (> 20)
    const r = resolveBlock(100, DamageType.Physical, RIOT, 20);
    expect(r.guardBroken).toBe(true);
    expect(r.staminaCost).toBe(20);
    expect(r.damageTaken).toBeCloseTo(100 - 100 * (20 / full));
  });
  it('facing check', () => {
    expect(hitsFront(0, 1, 0, -1)).toBe(true); // hit travels +Z toward a player facing -Z
    expect(hitsFront(0, -1, 0, -1)).toBe(false); // from behind
    expect(hitsFront(0, 0, 0, -1)).toBe(true);
  });
});

describe('ray shapes', () => {
  const o = { x: 0, y: 1, z: 0 };
  const fwd = { x: 0, y: 0, z: -1 };
  it('ray vs sphere', () => {
    expect(raySphere(o, fwd, { x: 0, y: 1, z: -10 }, 1, 100)).toBeCloseTo(9);
    expect(raySphere(o, fwd, { x: 3, y: 1, z: -10 }, 1, 100)).toBe(-1);
    expect(raySphere(o, fwd, { x: 0, y: 1, z: -10 }, 1, 5)).toBe(-1);
    expect(raySphere(o, fwd, { x: 0, y: 1, z: 10 }, 1, 100)).toBe(-1); // behind
  });
  it('ray vs vertical capsule: side, caps, miss', () => {
    expect(rayVCapsule(o, fwd, 0, 0.5, -10, 1.5, 0.3, 100)).toBeCloseTo(9.7);
    expect(rayVCapsule({ x: 0, y: 0.3, z: 0 }, fwd, 0, 0.5, -10, 1.5, 0.3, 100)).toBeGreaterThan(9.7); // low: hits bottom cap
    expect(rayVCapsule({ x: 0, y: 3, z: 0 }, fwd, 0, 0.5, -10, 1.5, 0.3, 100)).toBe(-1); // over the top
    expect(rayVCapsule(o, fwd, 1, 0.5, -10, 1.5, 0.3, 100)).toBe(-1);
  });
  it('melee arc', () => {
    const f = { x: 0, y: 0, z: -1 };
    expect(inMeleeArc(0, 0, -1, f, 1.5, 90, 0.3)).toBe(true);
    expect(inMeleeArc(0, 0, -3, f, 1.5, 90, 0.3)).toBe(false); // out of reach
    expect(inMeleeArc(0, 0, 1, f, 1.5, 90, 0.3)).toBe(false); // behind
    expect(inMeleeArc(1, 0, -1.05, f, 1.5, 90, 0.0)).toBe(true); // 45° edge
    expect(inMeleeArc(1.2, 0, -1, f, 1.5, 90, 0.0)).toBe(false);
  });
});

// ---------------------------------------------------------------- headless system tests

const DT = 1 / 60;

class TestTarget implements HitTarget {
  readonly id: number;
  readonly team = 'enemy' as const;
  readonly transform;
  readonly health = { hp: 500, maxHp: 500 };
  readonly poise = { current: 0, max: 0 };
  readonly hit = HUMANOID_SHAPE;
  received: DamageEvent[] = [];
  constructor(id: number, x: number, z: number) {
    this.id = id;
    this.transform = { position: { x, y: 0, z }, yaw: Math.PI };
  }
  get alive() {
    return this.health.hp > 0;
  }
  applyDamage(e: DamageEvent) {
    this.received.push(e);
    this.health.hp -= e.amount;
    return { dealt: e.amount, blocked: false, poiseBroken: false, killed: this.health.hp <= 0 };
  }
}

function makePlayer(): CombatPlayer & { state: PlayerState; canFire: boolean; invulnerable: boolean } {
  const state = { move: 'ground', stamina: 100, maxStamina: 100, exhausted: false, estusCharges: 5, sprinting: false, ads: false, adsT: 0, yaw: 0, pitch: 0 } as PlayerState;
  const p = {
    id: 1,
    state,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    canFire: true,
    health: { hp: 1000, maxHp: 1000 },
    transform: { yaw: 0 },
    controlsEnabled: true,
    invulnerable: false,
    loseStamina(n: number) {
      state.stamina = Math.max(0, state.stamina - n);
      if (state.stamina <= 0) state.exhausted = true;
    },
    spendStamina(n: number) {
      if (state.exhausted || state.stamina <= 0) return false;
      state.stamina = Math.max(0, state.stamina - n);
      if (state.stamina <= 0) state.exhausted = true;
      return true;
    },
  };
  return p;
}

function setup() {
  const world = new SpatialGrid(4);
  world.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
  const input = new Input();
  const bus = new EventBus();
  const stats = new StatsResolver();
  const player = makePlayer();
  const combat = new CombatSystem({ player, world, input, events: bus, stats, rng: new Rng(7) });
  // damage events -> player HP (what the controller does)
  bus.on('damage', (e) => {
    if (e.target === player.id) player.health.hp -= e.amount;
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.update(DT);
      combat.update(DT);
    }
  };
  return { world, input, bus, stats, player, combat, tick };
}

describe('CombatSystem (headless)', () => {
  it('hitscan hits a target ahead, emits damage + hit, falls off with distance', () => {
    const s = setup();
    const t = new TestTarget(100, 0, -10);
    s.combat.addTarget(t);
    s.player.state.pitch = Math.atan2(1.0 - 1.62, 10); // chest height
    const dmg: DamageEvent[] = [];
    const hits: boolean[] = [];
    s.bus.on('damage', (e) => e.target === 100 && dmg.push(e));
    s.bus.on('hit', (e) => hits.push(e.headshot));
    s.input.codeDown('Mouse0');
    s.tick(2);
    s.input.codeUp('Mouse0');
    s.tick(1);
    expect(s.combat.gun!.mag).toBe(29);
    expect(t.received.length).toBe(1);
    expect(dmg.length).toBe(1);
    expect(hits).toEqual([false]);
    expect(dmg[0]!.amount).toBeCloseTo(22 * damageFalloff(AR.range, AR.falloffMin, dmg[0]!.hitPos ? 10 : 0), 0);
  });

  it('headshot multiplies', () => {
    const s = setup();
    const t = new TestTarget(100, 0, -10);
    s.combat.addTarget(t);
    s.combat.debugAimAt(0, 1.62, -10);
    s.input.codeDown('Mouse2'); // ADS for tight spread
    s.tick(30);
    s.input.codeDown('Mouse0');
    s.tick(1);
    const e = t.received[0]!;
    expect(e.headshot).toBe(true);
    expect(e.amount).toBeCloseTo(44, 0);
  });

  it('cannot fire while sprinting or during a roll; empties the mag; auto-reloads from reserve', () => {
    const s = setup();
    s.player.state.sprinting = true;
    s.input.codeDown('Mouse0');
    s.tick(5);
    expect(s.combat.gun!.mag).toBe(30);
    s.player.state.sprinting = false;
    s.player.canFire = false;
    s.tick(5);
    expect(s.combat.gun!.mag).toBe(30);
    s.player.canFire = true;
    s.tick(60 * 3); // hold fire 3 s: 30 rounds at 750 rpm take 2.4 s
    expect(s.combat.gun!.mag).toBe(0);
    s.input.codeUp('Mouse0');
    const reserve0 = s.combat.ammo.get('rifle');
    s.input.codeDown('KeyR');
    s.tick(1);
    s.input.codeUp('KeyR');
    expect(s.combat.gun!.reloading).toBe(true);
    s.tick(60 * 3);
    expect(s.combat.gun!.reloading).toBe(false);
    expect(s.combat.gun!.mag).toBe(30);
    expect(s.combat.ammo.get('rifle')).toBe(reserve0 - 30);
  });

  it('emits gunDryFire once per press on an empty mag with no reserve', () => {
    const s = setup();
    s.combat.gun!.mag = 0;
    s.combat.ammo.set('rifle', 0);
    let n = 0;
    s.bus.on('gunDryFire', (e) => { if (e.weaponId === s.combat.gun!.id) n++; });
    s.input.codeDown('Mouse0');
    s.tick(30);
    expect(n).toBe(1);
    s.input.codeUp('Mouse0');
    s.input.codeDown('Mouse0');
    s.tick(3);
    expect(n).toBe(2);
  });

  it('auto fire rate ≈ rpm', () => {
    const s = setup();
    s.input.codeDown('Mouse0');
    s.tick(60); // 1 s
    const fired = 30 - s.combat.gun!.mag;
    expect(fired).toBeGreaterThanOrEqual(12);
    expect(fired).toBeLessThanOrEqual(13);
  });

  it('semi pistol fires once per press', () => {
    const s = setup();
    s.input.codeDown('Digit1');
    s.tick(1);
    s.input.codeUp('Digit1');
    s.tick(60);
    expect(s.combat.gun!.id).toBe('m1911_pistol');
    s.input.codeDown('Mouse0');
    s.tick(60);
    expect(s.combat.gun!.mag).toBe(7);
  });

  it('reload cancel by sprint: before insert point keeps the old mag, after keeps the new one', () => {
    const s = setup();
    s.combat.gun!.mag = 10;
    const reserve0 = s.combat.ammo.get('rifle');
    s.input.codeDown('KeyR');
    s.tick(1);
    s.input.codeUp('KeyR');
    s.tick(10);
    s.player.state.sprinting = true;
    s.tick(1);
    expect(s.combat.gun!.reloading).toBe(false);
    expect(s.combat.gun!.mag).toBe(10);
    expect(s.combat.ammo.get('rifle')).toBe(reserve0);
    s.player.state.sprinting = false;
    s.input.codeDown('KeyR');
    s.tick(1);
    s.input.codeUp('KeyR');
    s.tick(Math.ceil((AR.reloadTime * C.tacticalReloadFrac * (C.reloadInsertPoint + 0.05)) / DT));
    s.player.state.sprinting = true;
    s.tick(1);
    expect(s.combat.gun!.mag).toBe(30);
    expect(s.combat.ammo.get('rifle')).toBe(reserve0 - 20);
  });

  it('swap switches slot after the lower time and blocks firing meanwhile', () => {
    const s = setup();
    s.input.codeDown('Digit1');
    s.tick(1);
    s.input.codeUp('Digit1');
    expect(s.combat.swapping).toBe(true);
    s.input.codeDown('Mouse0');
    s.tick(5);
    expect(s.combat.guns[0]!.mag).toBe(30);
    s.input.codeUp('Mouse0');
    s.tick(Math.ceil((C.swapLower + C.swapRaise) / DT) + 2);
    expect(s.combat.swapping).toBe(false);
    expect(s.combat.gun!.id).toBe('m1911_pistol');
    // swap back via wheel
    s.input.wheel(-1);
    s.tick(60);
    expect(s.combat.gun!.id).toBe('m4_ar');
  });

  it('ADS blends in, slows movement via the stats source, releases', () => {
    const s = setup();
    s.input.codeDown('Mouse2');
    s.tick(60);
    expect(s.combat.ads).toBe(1);
    expect(s.player.state.ads).toBe(true);
    expect(s.stats.get('moveSpeed')).toBeCloseTo(C.adsMoveMul);
    s.input.codeUp('Mouse2');
    s.tick(60);
    expect(s.combat.ads).toBe(0);
    expect(s.stats.get('moveSpeed')).toBe(1);
  });

  it('recoil kicks the camera up and recovers when the player does not counter', () => {
    const s = setup();
    s.input.codeDown('Mouse0');
    s.tick(20);
    s.input.codeUp('Mouse0');
    const kicked = s.player.state.pitch;
    expect(kicked).toBeGreaterThan(0.02);
    s.tick(90);
    expect(s.player.state.pitch).toBeLessThan(kicked * 0.3);
  });

  it('knife swing costs stamina, hits a target in arc once, and is denied when exhausted', () => {
    const s = setup();
    const t = new TestTarget(100, 0, -1.5);
    s.combat.addTarget(t);
    s.player.state.pitch = Math.atan2(1.0 - 1.62, 1.5);
    s.input.codeDown('KeyV');
    s.tick(1);
    s.input.codeUp('KeyV');
    expect(s.player.state.stamina).toBeCloseTo(100 - (WEAPONS.combat_knife as { staminaCost: number }).staminaCost);
    s.tick(60);
    expect(t.received.length).toBe(1);
    expect(t.received[0]!.amount).toBeCloseTo(35);
    expect(t.received[0]!.weaponId).toBe('combat_knife');
    // exhausted: no swing
    s.player.state.stamina = 0;
    s.player.state.exhausted = true;
    s.input.codeDown('KeyV');
    s.tick(1);
    s.input.codeUp('KeyV');
    s.tick(60);
    expect(t.received.length).toBe(1);
  });

  it('knife out of reach / behind a wall does not hit', () => {
    const s = setup();
    const far = new TestTarget(100, 0, -5);
    s.combat.addTarget(far);
    s.input.codeDown('KeyV');
    s.tick(1);
    s.input.codeUp('KeyV');
    s.tick(60);
    expect(far.received.length).toBe(0);
    const near = new TestTarget(101, 0, -1.5);
    s.world.add({ aabb: aabbFromFootprint(0, 0, -0.8, 4, 3, 0.2), layer: Layer.World, solid: true });
    s.combat.addTarget(near);
    s.player.state.stamina = 100;
    s.player.state.exhausted = false;
    s.input.codeDown('KeyV');
    s.tick(1);
    s.input.codeUp('KeyV');
    s.tick(60);
    expect(near.received.length).toBe(0);
  });

  it('bullets stop at walls', () => {
    const s = setup();
    const t = new TestTarget(100, 0, -10);
    s.combat.addTarget(t);
    s.world.add({ aabb: aabbFromFootprint(0, 0, -5, 6, 4, 0.5), layer: Layer.World, solid: true });
    s.combat.debugAimAt(0, 1.0, -10);
    s.input.codeDown('Mouse0');
    s.tick(3);
    expect(t.received.length).toBe(0);
    const bh = castBullet(s.world, [t], { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 100, newBulletHit());
    expect(bh.kind).toBe('world');
    expect(bh.distance).toBeCloseTo(4.75);
  });

  it('shield: holding V blocks physical hits from the front, drains stamina; guard breaks at 0', () => {
    const s = setup();
    s.combat.setLoadout(['m4_ar', 'm1911_pistol'], ['riot_shield', 'combat_knife']);
    const hp0 = s.player.health.hp;
    // not raised: full damage
    s.combat.debugHitPlayer(20);
    expect(s.player.health.hp).toBe(hp0 - 20);
    s.input.codeDown('KeyV');
    s.tick(30);
    expect(s.combat.blocking).toBe(true);
    const hp1 = s.player.health.hp;
    const sta0 = s.player.state.stamina;
    const r = s.combat.debugHitPlayer(20);
    expect(r.blocked).toBe(true);
    expect(s.player.health.hp).toBe(hp1);
    expect(s.player.state.stamina).toBeCloseTo(sta0 - 20 * (1 - RIOT.stability));
    // from behind is not blocked
    s.combat.debugHitPlayer(15, false);
    expect(s.player.health.hp).toBe(hp1 - 15);
    // fire damage is not blocked
    s.combat.debugHitPlayer(10, true, DamageType.Fire);
    expect(s.player.health.hp).toBe(hp1 - 25);
    // guard break
    s.player.state.stamina = 5;
    const hp2 = s.player.health.hp;
    const broke = s.combat.debugHitPlayer(100);
    expect(broke.poiseBroken).toBe(true);
    expect(s.combat.guardBroken).toBe(true);
    expect(s.combat.blocking).toBe(false);
    expect(s.player.health.hp).toBeLessThan(hp2);
    expect(s.player.state.exhausted).toBe(true);
  });

  it('i-frames ignore damage; left swap cycles slots', () => {
    const s = setup();
    s.player.invulnerable = true;
    const hp = s.player.health.hp;
    s.combat.debugHitPlayer(50);
    expect(s.player.health.hp).toBe(hp);
    s.player.invulnerable = false;
    expect(s.combat.leftDefNow!.id).toBe('combat_knife');
    s.input.codeDown('Digit2');
    s.tick(1);
    s.input.codeUp('Digit2');
    s.tick(60);
    expect(s.combat.leftDefNow!.id).toBe('riot_shield');
  });

  it('shotgun pellets all land; per-target damage aggregated per region', () => {
    const s = setup();
    s.combat.setLoadout(['pump_shotgun', 'm4_ar'], ['combat_knife', null]);
    const t = new TestTarget(100, 0, -3);
    s.combat.addTarget(t);
    s.combat.debugAimAt(0, 1.0, -3);
    s.input.codeDown('Mouse0');
    s.tick(1);
    const body = t.received.filter((e) => !e.headshot).reduce((a, e) => a + e.amount, 0);
    expect(t.received.length).toBeLessThanOrEqual(2);
    expect(body).toBeGreaterThan(8 * 3); // several of 12 pellets landed
    expect(s.combat.gun!.mag).toBe(5);
  });

  it('block: missing dir derives from the source entity; unknown source is unblockable; exhausted never blocks', () => {
    const s = setup();
    s.combat.setLoadout(['m4_ar', null], ['riot_shield', 'combat_knife']);
    const front = new TestTarget(100, 0, -3);
    const back = new TestTarget(101, 0, 3);
    s.combat.addTarget(front);
    s.combat.addTarget(back);
    s.input.codeDown('KeyV');
    s.tick(30);
    expect(s.combat.blocking).toBe(true);
    const mk = (source: number | null): DamageEvent => ({ source, target: s.player.id, amount: 20, type: DamageType.Physical, poiseDamage: 0, hitPos: { x: 0, y: 1, z: 0 } });
    expect(s.combat.hitPlayer(mk(100)).blocked).toBe(true);
    expect(s.combat.hitPlayer(mk(101)).blocked).toBe(false);
    expect(s.combat.hitPlayer(mk(999)).blocked).toBe(false);
    expect(s.combat.hitPlayer(mk(null)).blocked).toBe(false);
    s.player.state.exhausted = true;
    expect(s.combat.blocking).toBe(false);
  });

  it('block: a fully absorbed hit emits shieldBlock but no zero-amount damage; stamina loss can break the guard', () => {
    const s = setup();
    s.combat.setLoadout(['m4_ar', null], ['riot_shield', 'combat_knife']);
    s.input.codeDown('KeyV');
    s.tick(30);
    const dmg: number[] = [];
    let blocks = 0;
    s.bus.on('damage', (e) => e.target === s.player.id && dmg.push(e.amount));
    s.bus.on('shieldBlock', () => blocks++);
    s.combat.debugHitPlayer(20);
    expect(blocks).toBe(1);
    expect(dmg).toEqual([]);
    s.player.state.stamina = 3;
    const r = s.combat.debugHitPlayer(100);
    expect(r.poiseBroken).toBe(true);
    expect(s.player.state.stamina).toBe(0);
    expect(s.player.state.exhausted).toBe(true);
    expect(dmg.length).toBe(1);
  });

  it('setLoadout keeps per-gun mags across re-equip/reorder; first acquisition starts full', () => {
    const s = setup();
    s.combat.gun!.mag = 7;
    s.combat.setLoadout(['m1911_pistol', 'm4_ar'], ['combat_knife', null]);
    expect(s.combat.guns[1]!.mag).toBe(7);
    expect(s.combat.guns[0]!.mag).toBe((WEAPONS.m1911_pistol as GunDef).mag);
    s.combat.guns[0]!.mag = 2;
    s.combat.setLoadout(['m4_ar', 'm1911_pistol'], ['combat_knife', null]);
    expect(s.combat.guns[0]!.mag).toBe(7);
    expect(s.combat.guns[1]!.mag).toBe(2);
    s.combat.setLoadout(['pump_shotgun', null], ['combat_knife', null]);
    expect(s.combat.guns[0]!.mag).toBe((WEAPONS.pump_shotgun as GunDef).mag);
    s.combat.setLoadout(['m4_ar', null], ['combat_knife', null]);
    expect(s.combat.guns[0]!.mag).toBe(7);
  });

  it('hit fires exactly once per target per shot (with fire bonus: extra damage event, no extra hit)', () => {
    const s = setup();
    s.stats.register('inc', [{ key: 'gunFireDamage', op: 'add', value: 10 }]);
    const t = new TestTarget(100, 0, -4);
    s.combat.addTarget(t);
    s.combat.debugAimAt(0, 1.0, -4);
    let hits = 0;
    let fire = 0;
    let phys = 0;
    s.bus.on('hit', () => hits++);
    s.bus.on('damage', (e) => {
      if (e.target !== 100) return;
      if (e.type === DamageType.Fire) fire++;
      else phys++;
    });
    s.input.codeDown('Mouse0');
    s.tick(60);
    s.input.codeUp('Mouse0');
    expect(s.combat.shotCount).toBeGreaterThan(8);
    expect(phys).toBeGreaterThan(0);
    expect(hits).toBe(phys);
    expect(fire).toBe(phys);
    expect(t.received.length).toBe(phys + fire);
  });

  it('shotgun: one hit event per target even with head + body pellets', () => {
    const s = setup();
    s.combat.setLoadout(['pump_shotgun', null], ['combat_knife', null]);
    const t = new TestTarget(100, 0, -2);
    s.combat.addTarget(t);
    s.combat.debugAimAt(0, 1.45, -2);
    let hits = 0;
    s.bus.on('hit', () => hits++);
    s.input.codeDown('Mouse0');
    s.tick(1);
    expect(hits).toBe(1);
  });

  it('launcher: instant splash with linear falloff, hits several targets, self-damage, no direct bullet damage', () => {
    const s = setup();
    s.combat.setLoadout(['rpg', null], ['combat_knife', null]);
    s.combat.ammo.set('launcher', 4);
    const near = new TestTarget(100, 0, -12);
    const side = new TestTarget(101, 2.5, -12);
    const far = new TestTarget(102, 8, -12);
    for (const t of [near, side, far]) s.combat.addTarget(t);
    s.combat.debugAimAt(0, 1.0, -12);
    const hp0 = s.player.health.hp;
    const dmgTypes: string[] = [];
    s.bus.on('damage', (e) => e.target === 100 && dmgTypes.push(e.type));
    s.input.codeDown('Mouse0');
    s.tick(1);
    expect(near.received.length).toBe(1);
    expect(dmgTypes).toEqual([DamageType.Explosive]);
    expect(near.received[0]!.amount).toBeGreaterThan(300);
    expect(side.received.length).toBe(1);
    expect(side.received[0]!.amount).toBeLessThan(near.received[0]!.amount);
    expect(side.received[0]!.amount).toBeGreaterThan(0);
    expect(far.received.length).toBe(0);
    expect(s.player.health.hp).toBe(hp0); // 12 m away: outside the 5 m radius
  });

  it('launcher: firing at a nearby wall damages the player', () => {
    const s = setup();
    s.world.add({ aabb: aabbFromFootprint(0, 0, -3, 10, 4, 0.5), layer: Layer.World, solid: true });
    s.combat.setLoadout(['rpg', null], ['combat_knife', null]);
    s.combat.ammo.set('launcher', 4);
    s.combat.debugAimAt(0, 1.0, -3);
    const hp0 = s.player.health.hp;
    s.input.codeDown('Mouse0');
    s.tick(1);
    expect(s.player.health.hp).toBeLessThan(hp0);
  });

  it('melee swing is cancelled when a roll starts', () => {
    const s = setup();
    s.input.codeDown('KeyV');
    s.tick(1);
    s.input.codeUp('KeyV');
    expect(s.combat.swinging).toBe(true);
    s.player.canFire = false;
    s.tick(1);
    expect(s.combat.swinging).toBe(false);
  });

  it('does not start a reload while sprinting; both guns tick cooldown', () => {
    const s = setup();
    s.combat.gun!.mag = 10;
    s.player.state.sprinting = true;
    s.input.codeDown('KeyR');
    s.tick(2);
    expect(s.combat.gun!.reloading).toBe(false);
    s.player.state.sprinting = false;
    s.combat.guns[1]!.cooldown = 0.5;
    s.tick(60);
    expect(s.combat.guns[1]!.cooldown).toBeLessThanOrEqual(0);
  });
});
