import { describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { CONSUMABLES, GRENADES } from '../data/items';
import { AccessoryHooks } from '../inventory/accessories';
import { GrenadePouch, QuickBeltImpl } from '../inventory/belt';
import { createConsumableSystem } from '../inventory/consumables';
import { StatsResolver } from '../inventory/modifiers';
import { Inventory } from '../inventory/store';
import { aabbFromFootprint } from '../physics/aabb';
import { SpatialGrid } from '../physics/grid';
import { Layer } from '../physics/types';
import { GrenadeSystem, splashDamage } from './grenades';
import { splashFalloff } from './math';
import { HUMANOID_SHAPE, type HitTarget } from './targets';
import type { DamageResult, GunState } from './types';
import { AmmoStore } from './weapons';

const DT = 1 / 60;

class FakeTarget implements HitTarget {
  readonly team = 'enemy' as const;
  readonly transform;
  readonly health = { hp: 500, maxHp: 500 };
  readonly poise = { current: 0, max: 0 };
  readonly hit = HUMANOID_SHAPE;
  alive = true;
  taken: DamageEvent[] = [];
  stunned = 0;
  isBoss = false;
  constructor(readonly id: number, x: number, z: number) {
    this.transform = { position: { x, y: 0, z }, yaw: 0 };
  }
  applyDamage(e: DamageEvent): DamageResult {
    this.taken.push(e);
    this.health.hp -= e.amount;
    return { dealt: e.amount, blocked: false, poiseBroken: false, killed: false };
  }
  stun(s: number): void {
    this.stunned = s;
  }
}

function rig(opts: { items?: Record<string, number> } = {}) {
  const bus = new EventBus();
  const hooks = new AccessoryHooks();
  const stats = new StatsResolver();
  const input = new Input();
  const world = new SpatialGrid();
  world.add({ aabb: { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } }, layer: Layer.World, solid: true });
  world.add({ aabb: aabbFromFootprint(0, 0, -12, 20, 6, 0.5), layer: Layer.World, solid: true }); // wall at z=-12
  const store = new Inventory(bus);
  for (const [id, n] of Object.entries(opts.items ?? {})) store.add(id, n);
  const belt = new QuickBeltImpl(store, bus);
  const pouch = new GrenadePouch(store);
  const targets: FakeTarget[] = [];
  const playerHits: DamageEvent[] = [];
  const guns: (GunState | null)[] = [{ id: 'm4_ar', mag: 30, cooldown: 0, reloading: false, reloadT: 0 }, null];
  const ammo = new AmmoStore(bus);
  const combat = {
    targets: { arr: targets as HitTarget[] },
    guns,
    ammo,
    hitPlayer(e: DamageEvent): DamageResult {
      playerHits.push(e);
      return { dealt: e.amount, blocked: false, poiseBroken: false, killed: false };
    },
  };
  const player = { id: 1, position: { x: 0, y: 0, z: 0 }, state: { yaw: 0, pitch: 0, move: 'ground' }, controlsEnabled: true };
  return { bus, hooks, stats, input, world, store, belt, pouch, targets, playerHits, guns, ammo, combat, player };
}

function tick(r: ReturnType<typeof rig>, sys: { update(dt: number): void }, n = 1): void {
  for (let i = 0; i < n; i++) {
    r.input.update(DT);
    sys.update(DT);
  }
}

function grenadeSys(r: ReturnType<typeof rig>): GrenadeSystem {
  return new GrenadeSystem({ combat: r.combat, player: r.player, pouch: r.pouch, world: r.world, input: r.input, events: r.bus, hooks: r.hooks });
}

describe('splash falloff', () => {
  it('frag: full at centre, linear, zero at radius', () => {
    const f = GRENADES.frag_grenade!;
    expect(splashDamage(f.damage, 0, f.radius)).toBe(150);
    expect(splashDamage(f.damage, f.radius / 2, f.radius)).toBeCloseTo(75);
    expect(splashDamage(f.damage, f.radius, f.radius)).toBe(0);
    expect(splashFalloff(1, f.radius)).toBeGreaterThan(splashFalloff(4, f.radius));
  });
  it('explode damages targets by distance and the player when asked', () => {
    const r = rig();
    const near = new FakeTarget(10, 0, -2);
    const far = new FakeTarget(11, 0, -5);
    const out = new FakeTarget(12, 0, -30);
    r.targets.push(near, far, out);
    const g = grenadeSys(r);
    g.explode(GRENADES.frag_grenade!, 0, 0.9, -1, false);
    expect(near.taken.length).toBe(1);
    expect(far.taken.length).toBe(1);
    expect(out.taken.length).toBe(0);
    expect(near.taken[0]!.amount).toBeGreaterThan(far.taken[0]!.amount);
    expect(near.taken[0]!.type).toBe(DamageType.Explosive);
    expect(r.playerHits.length).toBe(0);
    g.explode(GRENADES.frag_grenade!, 0, 0.9, -1, true);
    expect(r.playerHits.length).toBe(1);
  });
});

describe('splash line of sight + falloff measure', () => {
  it('frag at 3 m from a (feet-based) humanoid does ~82 damage, not single digits', () => {
    const r = rig();
    const t = new FakeTarget(70, 0, -3);
    r.targets.push(t);
    grenadeSys(r).explode(GRENADES.frag_grenade!, 0, 0.1, 0, false);
    // capsule surface is 3 - 0.3 m from the blast: 150 * (1 - 2.7/6)
    expect(t.taken[0]!.amount).toBeCloseTo(82.5, 0);
  });
  it('a wall between the blast and the target blocks the splash (enemies and the player)', () => {
    const r = rig();
    const behind = new FakeTarget(71, 0, -14); // wall at z=-12, blast at z=-10
    const open = new FakeTarget(72, 4, -10);
    r.targets.push(behind, open);
    r.player.position.z = -14; // player behind the wall too
    const g = grenadeSys(r);
    g.explode(GRENADES.frag_grenade!, 0, 0.9, -10, true);
    expect(behind.taken.length).toBe(0);
    expect(open.taken.length).toBe(1);
    expect(r.playerHits.length).toBe(0);
    r.player.position.z = -8; // same side of the wall
    g.explode(GRENADES.frag_grenade!, 0, 0.9, -10, true);
    expect(r.playerHits.length).toBe(1);
  });
});

describe('cooking', () => {
  it('release before the fuse launches a grenade with the remaining fuse; consumes one', () => {
    const r = rig({ items: { frag_grenade: 2 } });
    const g = grenadeSys(r);
    r.input.codeDown('KeyG');
    tick(r, g);
    expect(g.cooking).not.toBeNull();
    expect(r.store.count('frag_grenade')).toBe(1);
    tick(r, g, 60); // cook 1s
    r.input.codeUp('KeyG');
    tick(r, g);
    expect(g.cooking).toBeNull();
    const p = g.pool.items.find((i) => i.active)!;
    expect(p).toBeTruthy();
    expect(p.fuse).toBeGreaterThan(1.2);
    expect(p.fuse).toBeLessThan(1.6);
  });
  it('over-cooking explodes in hand and hurts the player', () => {
    const r = rig({ items: { frag_grenade: 1 } });
    const g = grenadeSys(r);
    r.input.codeDown('KeyG');
    tick(r, g, Math.ceil(2.5 / DT) + 2);
    expect(g.cooking).toBeNull();
    expect(r.playerHits.length).toBe(1);
    expect(r.playerHits[0]!.type).toBe(DamageType.Explosive);
    expect(g.pool.activeCount()).toBe(0);
  });
  it('a thrown frag bounces off the wall and detonates on its fuse', () => {
    const r = rig({ items: { frag_grenade: 1 } });
    const g = grenadeSys(r);
    r.input.codeDown('KeyG');
    tick(r, g);
    r.input.codeUp('KeyG');
    tick(r, g); // thrown
    let exploded = 0;
    const bounces: number[] = [];
    r.bus.on('grenadeBounce', (e) => bounces.push(e.speed));
    r.bus.on('grenadeExploded', () => exploded++);
    const p = g.pool.items.find((i) => i.active)!;
    let minZ = 0;
    let bounced = false;
    for (let i = 0; i < 200; i++) {
      tick(r, g);
      minZ = Math.min(minZ, p.z);
      if (p.active && p.vz > 0) bounced = true;
    }
    expect(bounces.length).toBeGreaterThan(0);
    expect(bounces.every((s) => s >= 3)).toBe(true);
    expect(minZ).toBeGreaterThan(-12); // never tunnels through the wall
    expect(bounced).toBe(true);
    expect(exploded).toBe(1);
    expect(g.pool.activeCount()).toBe(0);
  });
});

describe('other grenades', () => {
  it('flashbang stuns non-boss targets in radius', () => {
    const r = rig();
    const a = new FakeTarget(30, 0, -3);
    const boss = new FakeTarget(31, 1, -3);
    boss.isBoss = true;
    const far = new FakeTarget(32, 0, -40);
    r.targets.push(a, boss, far);
    const g = grenadeSys(r);
    (g as unknown as { flash(d: unknown, x: number, y: number, z: number): void }).flash(GRENADES.flashbang!, 0, 1, -2);
    expect(a.stunned).toBe(3);
    expect(boss.stunned).toBe(0);
    expect(far.stunned).toBe(0);
  });
  it('molotov pool applies Fire DoT to targets inside and the player, then expires', () => {
    const r = rig({ items: { molotov: 1 } });
    r.player.position.z = -4;
    const t = new FakeTarget(40, 0, -4.5);
    r.targets.push(t);
    const g = grenadeSys(r);
    (g as unknown as { startFire(d: unknown, x: number, y: number, z: number): void }).startFire(GRENADES.molotov!, 0, 0, -4);
    expect(g.activeFireZones()).toBe(1);
    tick(r, g, 60);
    expect(t.taken.length).toBeGreaterThanOrEqual(1);
    expect(t.taken.every((e) => e.type === DamageType.Fire)).toBe(true);
    expect(r.playerHits.length).toBeGreaterThanOrEqual(1);
    tick(r, g, 300);
    expect(g.activeFireZones()).toBe(0);
  });
  it('throwing knife is silent, damages one target and pings only it', () => {
    const r = rig({ items: { throwing_knife: 3 } });
    r.pouch.load('throwing_knife');
    const t = new FakeTarget(50, 0, -6);
    const other = new FakeTarget(51, 3, -6);
    r.targets.push(t, other);
    const g = grenadeSys(r);
    const noise: string[] = [];
    const pings: number[] = [];
    r.bus.on('gunFired', () => noise.push('gun'));
    r.bus.on('aggroPing', (e) => pings.push(e.targetId));
    r.input.codeDown('KeyG');
    tick(r, g, 2);
    tick(r, g, 30);
    expect(noise.length).toBe(0);
    expect(t.taken.length).toBe(1);
    expect(t.taken[0]!.amount).toBeGreaterThanOrEqual(30);
    expect(other.taken.length).toBe(0);
    expect(pings).toEqual([50]);
    expect(r.store.count('throwing_knife')).toBe(2);
  });
  it('Martyrdom hook spawns a frag that spares the player', () => {
    const r = rig();
    const g = grenadeSys(r);
    const t = new FakeTarget(60, 2, 0);
    r.targets.push(t);
    r.hooks.setSlot('accessory1', 'martyrdom_dogtag');
    r.hooks.emit('playerDeath', { pos: { x: 0, y: 0, z: 0 }, souls: 10 });
    expect(g.pool.activeCount()).toBe(1);
    tick(r, g, 90);
    expect(t.taken.length).toBe(1);
    expect(r.playerHits.length).toBe(0);
  });
});

describe('quick belt consumables', () => {
  function csys(r: ReturnType<typeof rig>) {
    return createConsumableSystem({ combat: r.combat, player: r.player, inv: { store: r.store, belt: r.belt, pouch: r.pouch, hooks: r.hooks }, world: r.world, input: r.input, events: r.bus, stats: r.stats });
  }

  it('use decrements the belt item after the use animation and blocks firing', () => {
    const r = rig({ items: { dogtags_lost_operator: 2 } });
    r.belt.assign(0, 'dogtags_lost_operator');
    const c = csys(r);
    const granted: number[] = [];
    r.bus.on('soulsGranted', (e) => granted.push(e.amount));
    r.input.codeDown('KeyZ');
    tick(r, c);
    expect(c.useLock).toBeGreaterThan(0);
    expect(r.guns[0]!.cooldown).toBeGreaterThan(0);
    expect(r.store.count('dogtags_lost_operator')).toBe(2); // not consumed until the animation ends
    tick(r, c, Math.ceil(CONSUMABLES.dogtags_lost_operator!.useTime / DT) + 2);
    expect(r.store.count('dogtags_lost_operator')).toBe(1);
    expect(granted).toEqual([200]);
    expect(c.useLock).toBe(0);
  });

  it('flare emits warpToBonfire; empty belt does nothing', () => {
    const r = rig({ items: { extraction_flare: 1 } });
    const c = csys(r);
    expect(c.use()).toBe(false);
    r.belt.assign(0, 'extraction_flare');
    let warps = 0;
    r.bus.on('warpToBonfire', () => warps++);
    c.apply(CONSUMABLES.extraction_flare!);
    expect(warps).toBe(1);
  });

  it('buff registers modifiers then unregisters after the duration', () => {
    const r = rig();
    const c = csys(r);
    c.apply(CONSUMABLES.energy_drink!);
    expect(r.stats.hasSource('buff:energy_drink')).toBe(true);
    expect(r.stats.get('staminaRegen')).toBeCloseTo(1.5);
    tick(r, c, Math.floor(29 / DT));
    expect(r.stats.hasSource('buff:energy_drink')).toBe(true);
    tick(r, c, Math.ceil(2 / DT));
    expect(r.stats.hasSource('buff:energy_drink')).toBe(false);
    expect(r.stats.get('staminaRegen')).toBe(1);
    c.apply(CONSUMABLES.incendiary_rounds!);
    expect(r.stats.get('gunFireDamage')).toBeGreaterThan(0);
    tick(r, c, Math.ceil(61 / DT));
    expect(r.stats.get('gunFireDamage')).toBe(0);
  });

  it('ammo crate refills a fraction of the cap for owned ammo types only, capped', () => {
    const r = rig({ items: { m4_ar: 1 } });
    const c = csys(r);
    const cap = r.ammo.cap('rifle');
    r.ammo.set('rifle', 0);
    r.ammo.set('pistol', 0);
    c.apply(CONSUMABLES.ammo_crate_small!);
    expect(r.ammo.get('rifle')).toBe(Math.ceil(cap * 0.25));
    expect(r.ammo.get('pistol')).toBe(0); // no pistol owned
    r.ammo.set('rifle', cap - 5);
    c.apply(CONSUMABLES.ammo_crate_large!);
    expect(r.ammo.get('rifle')).toBe(cap);
  });
});
