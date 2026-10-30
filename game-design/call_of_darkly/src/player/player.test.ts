import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { StatsResolver } from '../inventory/modifiers';
import { aabbFromFootprint } from '../physics/aabb';
import { SpatialGrid } from '../physics/grid';
import { Layer } from '../physics/types';
import { PlayerController } from './controller';
import { probeMantle } from './mantle';
import { ROLL_TIERS, rollTierFromRatio } from './rollTier';
import { canUseStamina, createStamina, drainStamina, regenStamina, spendStamina, STAMINA_TUNING } from './stamina';

const DT = 1 / 60;

function setup() {
  const world = new SpatialGrid(4);
  world.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
  const input = new Input();
  const bus = new EventBus();
  const stats = new StatsResolver();
  const player = new PlayerController({ world, input, events: bus, stats, spawn: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 } });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.update(DT);
      player.update(DT);
    }
  };
  tick(5);
  return { world, input, bus, player, tick };
}

describe('stamina rules', () => {
  it('exhausts at 0 and blocks actions until completely full', () => {
    let s = createStamina(100);
    s = spendStamina(s, 95)!;
    expect(canUseStamina(s)).toBe(true);
    s = spendStamina(s, 20)!; // DS-style: allowed with less than cost, bottoms out
    expect(s.value).toBe(0);
    expect(s.exhausted).toBe(true);
    expect(spendStamina(s, 1)).toBeNull();
    s = regenStamina(s, STAMINA_TUNING.exhaustDelay, 50); // delay only
    expect(s.value).toBe(0);
    s = regenStamina(s, 1.98, 50);
    expect(s.value).toBeCloseTo(99);
    expect(s.exhausted).toBe(true);
    s = regenStamina(s, 0.1, 50);
    expect(s.value).toBe(100);
    expect(s.exhausted).toBe(false);
  });
  it('drain restarts the regen delay', () => {
    let s = drainStamina(createStamina(100), 10, 1);
    s = regenStamina(s, STAMINA_TUNING.regenDelay - 0.01, 100);
    expect(s.value).toBe(90);
  });
});

describe('roll tiers', () => {
  it('maps equip-load ratio per §5 thresholds', () => {
    expect(rollTierFromRatio(0)).toBe('fast');
    expect(rollTierFromRatio(0.249)).toBe('fast');
    expect(rollTierFromRatio(0.25)).toBe('normal');
    expect(rollTierFromRatio(0.5)).toBe('normal');
    expect(rollTierFromRatio(0.51)).toBe('slow');
    expect(rollTierFromRatio(1)).toBe('slow');
    expect(rollTierFromRatio(1.01)).toBe('fat');
    expect(ROLL_TIERS.normal).toMatchObject({ distance: 3.5, duration: 0.5, iStart: 0.05, iEnd: 0.35 });
  });
});

describe('PlayerController (headless)', () => {
  it('walks forward (-Z at yaw 0) and stops quickly on release', () => {
    const { input, player, tick } = setup();
    input.codeDown('KeyW');
    tick(60);
    expect(player.position.z).toBeLessThan(-4);
    expect(Math.hypot(player.velocity.x, player.velocity.z)).toBeCloseTo(4.95, 1); // fast tier +10%
    input.codeUp('KeyW');
    tick(8);
    expect(Math.hypot(player.velocity.x, player.velocity.z)).toBe(0);
  });

  it('sprint drains stamina to exhaustion, which blocks jump until full', () => {
    const { input, player, bus, tick } = setup();
    let exhausted = 0;
    bus.on('staminaExhausted', () => exhausted++);
    input.codeDown('KeyW');
    input.codeDown('ShiftLeft');
    tick(60 * 12);
    expect(exhausted).toBe(1);
    expect(player.state.sprinting).toBe(false);
    input.codeUp('ShiftLeft');
    input.codeUp('KeyW');
    tick(10);
    input.codeDown('Space');
    tick(2);
    input.codeUp('Space');
    expect(player.state.exhausted).toBe(true);
    expect(player.velocity.y).toBeLessThanOrEqual(0);
    tick(60 * 10);
    expect(player.state.exhausted).toBe(false);
    expect(player.state.stamina).toBe(player.state.maxStamina);
  });

  it('jumps ~1.05 m and lands', () => {
    const { input, player, tick } = setup();
    input.codeDown('Space');
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      tick();
      maxY = Math.max(maxY, player.position.y);
      if (i === 1) input.codeUp('Space');
    }
    expect(maxY).toBeGreaterThan(0.95);
    expect(maxY).toBeLessThan(1.15);
    expect(player.grounded).toBe(true);
  });

  it('dodge rolls ~distance with an i-frame window', () => {
    const { input, player, tick } = setup();
    input.codeDown('KeyD');
    tick(1);
    const x0 = player.position.x;
    input.codeDown('ControlLeft');
    let inv = 0;
    for (let i = 0; i < 40; i++) {
      tick();
      if (player.invulnerable) inv++;
      if (i === 0) input.codeUp('ControlLeft');
      if (i === 0) input.codeUp('KeyD');
      if (player.state.move !== 'dodge') break;
    }
    const tier = ROLL_TIERS[player.rollTier];
    expect(player.position.x - x0).toBeGreaterThan(tier.distance * 0.9);
    expect(inv / 60).toBeCloseTo(tier.iEnd - tier.iStart, 1);
  });

  it('mantles a 1.3 m ledge with Space and not a 2.4 m wall', () => {
    const { world, input, player, tick } = setup();
    world.add({ aabb: aabbFromFootprint(0, 0, -2, 4, 1.3, 2), layer: Layer.World, solid: true }); // face at z=-1
    world.add({ aabb: aabbFromFootprint(10, 0, -2, 4, 2.4, 2), layer: Layer.World, solid: true });
    input.codeDown('KeyW');
    tick(30);
    expect(player.canMantle).toBe(true);
    input.codeDown('Space');
    tick(2);
    input.codeUp('Space');
    tick(30);
    expect(player.position.y).toBeCloseTo(1.3, 1);
    expect(player.position.z).toBeLessThan(-1.2);
    player.respawn({ x: 10, y: 0, z: 0 }, 0);
    tick(30);
    expect(player.canMantle).toBe(false);
  });

  it('rejects a mantle whose path is blocked by a lintel (end and start are clear)', () => {
    const { world, player } = setup();
    world.add({ aabb: aabbFromFootprint(0, 0, -3, 4, 1.3, 4), layer: Layer.World, solid: true }); // ledge top 1.3, face at z=-1
    // Lintel hanging over the wall face: above the head ray (y 1.7), blocks the capsule mid-path only.
    world.add({ aabb: aabbFromFootprint(0, 1.9, -1, 4, 0.4, 0.2), layer: Layer.World, solid: true });
    player.respawn({ x: 0, y: 0, z: 0 }, 0);
    const feet = { x: 0, y: 0, z: -0.3 }; // wall face at z=-1 is within reach (0.95)
    const o = { radius: 0.35, reach: 0.6, minHeight: 0.6, maxHeight: 1.8, inset: 0.15, facing: 0.5 };
    expect(player.capsule.overlaps(world, feet.x, 1.302, feet.z)).toBe(false); // start of the path is clear
    expect(player.capsule.overlaps(world, 0, 1.302, -1.5)).toBe(false); // so is the end
    expect(probeMantle(world, player.capsule, feet, 0, -1, o)).toBeNull();
    // Same ledge without the lintel mantles fine, with the end on support.
    const w2 = new SpatialGrid(4);
    w2.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
    w2.add({ aabb: aabbFromFootprint(0, 0, -3, 4, 1.3, 4), layer: Layer.World, solid: true });
    const t = probeMantle(w2, player.capsule, feet, 0, -1, o);
    expect(t).not.toBeNull();
    expect(t!.end.y).toBeCloseTo(1.3, 2);
  });

  it('shortens the mantle end (or rejects) when the ledge is too shallow to stand on', () => {
    const { player } = setup();
    const w = new SpatialGrid(4);
    w.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
    w.add({ aabb: aabbFromFootprint(0, 0, -1.3, 4, 1.3, 0.6), layer: Layer.World, solid: true }); // z -1.6..-1.0, 0.6 deep
    const o = { radius: 0.35, reach: 0.6, minHeight: 0.6, maxHeight: 1.8, inset: 0.15, facing: 0.5 };
    const feet = { x: 0, y: 0, z: -0.3 };
    const t = probeMantle(w, player.capsule, feet, 0, -1, o);
    expect(t).not.toBeNull();
    expect(t!.end.z).toBeGreaterThan(-1.6); // axis stays over the ledge
    const w2 = new SpatialGrid(4);
    w2.add({ aabb: aabbFromFootprint(0, -1, 0, 200, 1, 200), layer: Layer.World, solid: true });
    w2.add({ aabb: aabbFromFootprint(0, 0, -1.1, 4, 1.3, 0.2), layer: Layer.World, solid: true }); // 0.2 deep wall-ish
    expect(probeMantle(w2, player.capsule, feet, 0, -1, o)).toBeNull();
  });

  it('jump-grabs a 2.4 m ledge by holding Space from the takeoff press', () => {
    const { world, input, player, tick } = setup();
    world.add({ aabb: aabbFromFootprint(0, 0, -2, 4, 2.4, 2), layer: Layer.World, solid: true }); // top 2.4, face z=-1
    player.respawn({ x: 0, y: 0, z: -0.3 }, 0);
    tick(5);
    input.codeDown('Space');
    let mantled = false;
    for (let i = 0; i < 40 && !mantled; i++) {
      tick();
      mantled = player.state.move === 'mantle';
    }
    expect(mantled).toBe(true);
    input.codeUp('Space');
    tick(30);
    expect(player.position.y).toBeCloseTo(2.4, 1);
  });

  it('airborne grab needs a fresh press: Space merely held does not grab a low ledge', () => {
    const { world, input, player, tick } = setup();
    world.add({ aabb: aabbFromFootprint(0, 0, -2, 4, 1.0, 2), layer: Layer.World, solid: true }); // top 1.0, face z=-1
    // Space pressed far from the ledge, then held past the buffer window.
    player.respawn({ x: 0, y: 3, z: 8 }, 0);
    input.codeDown('Space');
    tick(10);
    expect(player.state.move).toBe('air');
    player.capsule.teleport({ x: 0, y: 0.4, z: -0.3 });
    tick(1);
    expect(player.state.move).toBe('air'); // held only: no grab
    // A fresh press does.
    input.codeUp('Space');
    tick(1);
    player.capsule.teleport({ x: 0, y: 0.4, z: -0.3 });
    input.codeDown('Space');
    tick(1);
    expect(player.state.move).toBe('mantle');
  });
});

describe('dodge timing', () => {
  it('moves on the press tick and gives a stable i-frame window of the tier length', () => {
    const { input, player, tick } = setup();
    input.codeDown('KeyD');
    tick(1);
    const x0 = player.position.x;
    input.codeDown('ControlLeft');
    tick(1);
    input.codeUp('ControlLeft');
    input.codeUp('KeyD');
    expect(player.state.move).toBe('dodge');
    expect(player.position.x - x0).toBeGreaterThan(0.05); // no dead tick
    const tier = ROLL_TIERS[player.rollTier];
    let inv = player.invulnerable ? 1 : 0;
    for (let i = 0; i < 60 && player.state.move === 'dodge'; i++) {
      tick();
      if (player.invulnerable) inv++;
    }
    expect(inv).toBe(Math.round((tier.iEnd - tier.iStart) * 60));
    expect(player.invulnerable).toBe(false);
  });

  it('estus cannot be drunk mid-roll', () => {
    const { input, player, tick } = setup();
    player.health.hp = 10;
    input.codeDown('ControlLeft');
    tick(1);
    input.codeUp('ControlLeft');
    expect(player.state.move).toBe('dodge');
    expect(player.drinkEstus()).toBe(false);
    tick(60);
    expect(player.drinkEstus()).toBe(true);
  });

  it('stamina regen delay restarts when the roll ends', () => {
    const { input, player, tick } = setup();
    input.codeDown('ControlLeft');
    tick(1);
    input.codeUp('ControlLeft');
    while (player.state.move === 'dodge') tick();
    const v0 = player.state.stamina;
    tick(Math.floor(0.55 * 60)); // still inside the 0.6 s post-roll pause
    expect(player.state.stamina).toBe(v0);
    tick(30);
    expect(player.state.stamina).toBeGreaterThan(v0);
  });
});

describe('playerDied', () => {
  it('emits once on the alive->dead transition with position and souls; later hits are ignored', () => {
    const { bus, player, tick } = setup();
    player.soulsProvider = () => 123;
    const died: { pos: { x: number; y: number; z: number }; souls: number }[] = [];
    bus.on('playerDied', (e) => died.push(e as never));
    const hit = (amount: number) => bus.emit('damage', { source: 99, target: player.id, amount, type: 0 as never, poiseDamage: 0, hitPos: { x: 0, y: 1, z: 0 } });
    hit(10);
    expect(died.length).toBe(0);
    hit(10000);
    hit(10000);
    tick(2);
    expect(player.state.move).toBe('dead');
    expect(died.length).toBe(1);
    expect(died[0]!.souls).toBe(123);
    expect(died[0]!.pos.x).toBe(0);
    expect(died[0]!.pos.y).toBeCloseTo(0, 1);
  });

  it('drives Martyrdom (frag spawns) and wipes timed buffs', async () => {
    const { createInventorySystem } = await import('../inventory/system');
    const { createConsumableSystem } = await import('../inventory/consumables');
    const { AccessoryHooks } = await import('../inventory/accessories');
    const { CONSUMABLES } = await import('../data/items');
    const { bus, player, world, input } = setup();
    const stats = new StatsResolver();
    const hooks = new AccessoryHooks();
    const inv = createInventorySystem({ combat: { setLoadout: () => {} }, player, events: bus, stats, hooks });
    const combat = { targets: { arr: [] }, guns: [null, null] as never, ammo: { add: () => 0, cap: () => 1 }, hitPlayer: () => ({ dealt: 0, blocked: false, poiseBroken: false, killed: false }) };
    const cons = createConsumableSystem({ combat, player: player as never, inv, world, input, events: bus, stats });
    inv.store.add('martyrdom_dogtag');
    inv.equipment.equip('accessory1', 'martyrdom_dogtag');
    const buff = Object.values(CONSUMABLES).find((c) => c.effect.type === 'buff')!;
    cons.apply(buff);
    expect(cons.buffRemaining((buff.effect as { buffId: string }).buffId)).toBeGreaterThan(0);
    expect(cons.grenades.pool.activeCount()).toBe(0);
    bus.emit('damage', { source: 99, target: player.id, amount: 10000, type: 0 as never, poiseDamage: 0, hitPos: { x: 0, y: 1, z: 0 } });
    expect(cons.grenades.pool.activeCount()).toBe(1); // Martyrdom frag
    expect(cons.buffRemaining((buff.effect as { buffId: string }).buffId)).toBe(0); // buff unregistered
  });
});
