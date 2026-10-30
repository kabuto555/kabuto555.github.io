import { describe, expect, it } from 'vitest';
import type { DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Input } from '../core/input';
import { STATS } from '../data/stats';
import { StatsResolver } from '../inventory/modifiers';
import { aabbFromFootprint } from '../physics/aabb';
import { SpatialGrid } from '../physics/grid';
import { Layer } from '../physics/types';
import { PlayerController } from './controller';
import { ESTUS_TUNING, EstusFlask } from './estus';
import { PLAYER_ENTITY_ID } from './tuning';

const DT = 1 / 60;

describe('EstusFlask', () => {
  it('spends a charge on start, heals the full amount over the drink, then unlocks', () => {
    const f = new EstusFlask(5, 300);
    expect(f.start(100, 1000)).toBe(true);
    expect(f.charges).toBe(4);
    let total = 0;
    let ticks = 0;
    while (f.drinking) {
      total += f.update(DT);
      ticks++;
    }
    expect(total).toBeCloseTo(300, 5);
    expect(ticks * DT).toBeGreaterThanOrEqual(ESTUS_TUNING.drinkTime - DT);
    expect(f.moveMul).toBe(1);
  });

  it('heals nothing before healStart and is slowed while drinking', () => {
    const f = new EstusFlask(5, 300);
    f.start(10, 100);
    expect(f.moveMul).toBe(ESTUS_TUNING.moveMul);
    expect(f.update(ESTUS_TUNING.healStart - 0.01)).toBe(0);
  });

  it('refuses at 0 charges, when full HP, or mid-drink', () => {
    const f = new EstusFlask(1, 300);
    expect(f.start(1000, 1000)).toBe(false);
    expect(f.start(10, 1000)).toBe(true);
    expect(f.start(10, 1000)).toBe(false); // already drinking
    f.refill();
    f.charges = 0;
    expect(f.start(10, 1000)).toBe(false);
  });

  it('interrupt stops the heal and keeps the charge spent', () => {
    const f = new EstusFlask(5, 300);
    f.start(10, 1000);
    const total = f.update(0.6); // partway through the glug
    expect(f.interrupt()).toBe(true);
    expect(f.drinking).toBe(false);
    expect(f.update(1)).toBe(0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(300);
    expect(f.charges).toBe(4);
    expect(f.interrupt()).toBe(false);
  });

  it('refill restores charges and clears a drink in progress', () => {
    const f = new EstusFlask(5, 300);
    f.start(10, 1000);
    f.refill();
    expect(f.charges).toBe(5);
    expect(f.drinking).toBe(false);
  });
});

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
  player.health.maxHp = 1000; // headroom so the 300 heal never clamps
  player.health.hp = 1000;
  return { input, bus, player, tick };
}

const hit = (amount: number): DamageEvent => ({ target: PLAYER_ENTITY_ID, amount }) as unknown as DamageEvent;

describe('player estus', () => {
  it('drink: charge down, HP up over ~1 s, no fire while drinking, events emitted', () => {
    const { bus, player, tick } = setup();
    const drank: unknown[] = [];
    const changed: unknown[] = [];
    bus.on('estusDrink', (e) => drank.push(e));
    bus.on('estusChanged', (e) => changed.push(e));
    player.health.hp = 100;
    expect(player.drinkEstus()).toBe(true);
    expect(player.state.estusCharges).toBe(STATS.estusCharges - 1);
    expect(player.canFire).toBe(false);
    expect(player.state.move).toBe('drinking');
    tick(40);
    expect(player.health.hp).toBeGreaterThan(100);
    expect(player.health.hp).toBeLessThan(100 + STATS.estusHeal);
    tick(40);
    expect(player.health.hp).toBeCloseTo(100 + STATS.estusHeal, 3);
    expect(player.canFire).toBe(true);
    expect(drank).toHaveLength(1);
    expect(changed.length).toBeGreaterThanOrEqual(2); // start + finish
  });

  it('movement is slowed while drinking', () => {
    const { input, player, tick } = setup();
    input.codeDown('KeyW');
    tick(60);
    const free = Math.hypot(player.velocity.x, player.velocity.z);
    player.health.hp = 100;
    player.drinkEstus();
    tick(30);
    const slow = Math.hypot(player.velocity.x, player.velocity.z);
    expect(slow).toBeLessThan(free * 0.6);
  });

  it('a hit interrupts the drink: heal stops, charge is not refunded', () => {
    const { bus, player, tick } = setup();
    player.health.hp = 500;
    player.drinkEstus();
    tick(10);
    bus.emit('damage', hit(5));
    expect(player.estus.drinking).toBe(false);
    const hp = player.health.hp;
    tick(60);
    expect(player.health.hp).toBe(hp);
    expect(player.state.estusCharges).toBe(STATS.estusCharges - 1);
    expect(player.state.move).not.toBe('drinking');
  });

  it('refill() (bonfire rest) restores charges and HP', () => {
    const { player } = setup();
    player.health.hp = 10;
    player.drinkEstus();
    player.refill();
    expect(player.state.estusCharges).toBe(STATS.estusCharges);
    expect(player.health.hp).toBe(player.health.maxHp);
    expect(player.estus.drinking).toBe(false);
  });

  it('cannot drink at full HP or with no charges', () => {
    const { player } = setup();
    expect(player.drinkEstus()).toBe(false);
    player.health.hp = 10;
    player.estus.charges = 0;
    expect(player.drinkEstus()).toBe(false);
  });
});
