import { describe, expect, it } from 'vitest';
import { DamageType, type DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { newSave } from '../core/save';
import { SIM_DT } from '../core/time';
import type { HitTarget } from '../combat/targets';
import type { DamageResult } from '../combat/types';
import { ENEMIES } from '../data/enemies';
import { DropSystem, type DropSpawn } from '../economy/drops';
import { WorldProgress } from '../economy/progress';
import { Wallet } from '../economy/wallet';
import { StatsResolver } from '../inventory/modifiers';
import { createCollisionWorld } from '../physics/grid';
import { Layer } from '../physics/types';
import type { Interactable } from '../world/interact';
import { ChestSystem } from '../world/chests';
import { mimicFlag, MimicSystem, MIMIC_CHOMP_FRACTION } from './mimic';
import { MIMIC_TIMING } from './mimicModel';
import { AiSystem } from './system';

const OP = { id: 'B7', pos: [10, 0, 0] as [number, number, number], yaw: -Math.PI / 2 };

function rig(progress = new WorldProgress(), bus = new EventBus()) {
  const world = createCollisionWorld(4);
  world.add({ aabb: { min: { x: -40, y: -1, z: -40 }, max: { x: 40, y: 0, z: 40 } }, layer: Layer.World, solid: true });
  const player = { id: 1, position: { x: 7.5, y: 0, z: 0 }, health: { hp: 100, maxHp: 100 }, invulnerable: false, shield: false };
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
  const ai = new AiSystem({ world, combat, player, headless: true, events: bus, stats: new StatsResolver(), rng: new Rng(3) });
  const interactables = new Set<Interactable>();
  const locks: boolean[] = [];
  const mimics = new MimicSystem({
    ai,
    combat,
    player,
    world,
    progress,
    bus,
    interact: { register: (i) => (interactables.add(i), () => void interactables.delete(i)) },
    lockControls: (on) => locks.push(on),
  });
  const step = (seconds: number, each?: () => void): void => {
    for (let i = 0, n = Math.round(seconds / SIM_DT); i < n; i++) {
      ai.update(SIM_DT);
      mimics.update(SIM_DT);
      each?.();
    }
  };
  const shot = (target: HitTarget, amount = 20): DamageEvent => ({
    source: player.id,
    target: target.id,
    amount,
    type: DamageType.Physical,
    poiseDamage: 10,
    hitPos: { x: 10, y: 0.3, z: 0 },
    dir: { x: 1, y: 0, z: 0 },
  });
  return { world, player, hits, targets, ai, mimics, interactables, locks, progress, bus, step, shot };
}

const live = (r: ReturnType<typeof rig>) => r.ai.enemies.filter((e) => e.defId === 'mimic' && e.alive);

describe('mimic data', () => {
  it('has a def: ~400 hp, high poise, telegraphed attacks, never respawns, drops the patch', () => {
    const d = ENEMIES.mimic!;
    expect(d.hp).toBe(400);
    expect(d.poise).toBeGreaterThanOrEqual(150);
    expect(d.respawns).toBe(false);
    for (const a of d.attacks) expect(a.windup).toBeGreaterThanOrEqual(0.35);
    expect(d.attacks.map((a) => a.id).sort()).toEqual(['hop_back', 'lunge_bite', 'sweep']);
    expect(d.attacks.find((a) => a.id === 'hop_back')!.damage).toBe(0);
  });

  it('kill drops the Dead Silence Patch, guaranteed (first-kill pickup that never despawns)', () => {
    const bus = new EventBus();
    const stats = new StatsResolver();
    const spawned: DropSpawn[] = [];
    const sys = new DropSystem({ wallet: new Wallet(bus, stats), progress: new WorldProgress(), ownedItems: () => [], spawn: (d) => spawned.push(d), rng: new Rng(1), stats, events: bus });
    bus.emit('enemyDeath', { enemyId: 9, defId: 'mimic', dropTableId: ENEMIES.mimic!.dropTable, pos: { x: 0, y: 0, z: 0 }, souls: 300, killerId: 1 });
    expect(spawned.some((d) => d.loot?.[0]?.id === 'dead_silence_patch' && d.ttl === Infinity)).toBe(true);
    sys.dispose();
  });
});

describe('mimic: dormant chest', () => {
  it('looks like a chest: prompt "Open chest", shootable target, solid on the Barrier layer, no enemy yet', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    expect(slot.prompt()).toBe('Open chest');
    expect(slot.enabled()).toBe(true);
    expect(r.interactables.has(slot)).toBe(true);
    expect(r.targets.has(slot)).toBe(true);
    expect(r.ai.enemies.length).toBe(0);
    expect(slot.collider!.layer).toBe(Layer.Barrier); // bullets (World|Prop) reach the target instead of the box
  });
});

describe('mimic: E chomps', () => {
  it('bites for 40% max HP through i-frames, unblockable, locks controls ~1.2 s, then stands up and fights', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    r.player.invulnerable = true; // mid-dodge: the grab ignores it
    r.player.shield = true;
    slot.interact();
    expect(r.locks).toEqual([true]);
    expect(slot.phase).toBe('awake');
    expect(r.interactables.has(slot)).toBe(false);
    expect(r.targets.has(slot)).toBe(false);
    const e = live(r)[0]!;
    expect(e).toBeDefined();
    expect(r.hits.length).toBe(0); // the bite lands at biteAt, not instantly

    r.step(MIMIC_TIMING.biteAt + 0.1);
    expect(r.hits.length).toBe(1);
    const h = r.hits[0]!;
    expect(h.amount).toBe(Math.round(100 * MIMIC_CHOMP_FRACTION));
    expect(h.dir).toBeUndefined(); // no facing: a shield cannot block it
    expect(h.source).toBeNull();
    expect(r.player.health.hp).toBe(60);
    expect(r.player.invulnerable).toBe(true); // restored after the grab
    expect(r.mimics.bites).toBe(1);

    r.step(MIMIC_TIMING.grabLock - MIMIC_TIMING.biteAt - 0.1 - 0.05);
    expect(r.locks).toEqual([true]); // still held
    r.step(0.2);
    expect(r.locks).toEqual([true, false]);

    r.step(MIMIC_TIMING.chompRise);
    expect(e.state).not.toBe('alert');
    expect(['chase', 'windup', 'attack', 'recover']).toContain(e.state);
    expect(r.hits.length).toBeGreaterThanOrEqual(1);
    // one chomp only
    expect(r.mimics.bites).toBe(1);
  });

  it('then fights: telegraphed lunge hits the player, the guard-less chomp is not repeated', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    slot.interact();
    const e = live(r)[0]!;
    r.step(MIMIC_TIMING.chompRise + 0.1);
    const states = new Set<string>();
    let windupT = 0;
    r.step(8, () => {
      states.add(e.state);
      if (e.state === 'windup') windupT += SIM_DT;
      r.player.health.hp = 100; // keep the player alive to watch the whole fight
    });
    expect(states.has('windup')).toBe(true);
    expect(states.has('attack')).toBe(true);
    expect(windupT).toBeGreaterThan(0.3);
    expect(r.hits.some((h) => h.weaponId !== 'mimic:chomp')).toBe(true);
    expect(r.mimics.bites).toBe(1);
  });
});

describe('mimic: shooting the closed chest wakes it without the chomp', () => {
  it('wakes on damage, takes the shot, no grab, no lock, no bite', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    const res = slot.applyDamage(r.shot(slot, 25));
    expect(res.dealt).toBe(25);
    expect(slot.phase).toBe('awake');
    expect(r.targets.has(slot)).toBe(false);
    const e = live(r)[0]!;
    expect(e.health.hp).toBe(375);
    r.step(MIMIC_TIMING.shotRise + 0.2);
    expect(r.locks).toEqual([]);
    expect(r.hits.length).toBe(0);
    expect(r.mimics.bites).toBe(0);
    expect(e.state).not.toBe('alert');
    expect(r.player.health.hp).toBe(100);
  });

  it('a second shot lands on the awake mimic, not on a stale chest', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    slot.applyDamage(r.shot(slot, 10));
    expect(slot.applyDamage(r.shot(slot, 10)).dealt).toBe(0); // chest is gone from combat; direct calls are inert
    const e = live(r)[0]!;
    expect(r.ai.enemies.filter((x) => x.defId === 'mimic').length).toBe(1);
    expect(e.applyDamage(r.shot(slot, 10)).dealt).toBe(10);
    expect(e.health.hp).toBe(380);
  });
});

describe('mimic: kill persistence and rest', () => {
  it('kill sets the progress flag, the corpse becomes an open dead chest, no respawn on rest', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    slot.interact();
    const e = live(r)[0]!;
    r.step(MIMIC_TIMING.chompRise + 0.1);
    const deaths: string[] = [];
    r.bus.on('enemyDeath', (d) => deaths.push(`${d.defId}:${d.dropTableId}`));
    e.applyDamage({ source: 1, target: e.id, amount: 9999, type: DamageType.Physical, poiseDamage: 0, hitPos: { x: 0, y: 0, z: 0 } });
    expect(e.state).toBe('dead');
    expect(deaths).toEqual(['mimic:drops_mimic']);
    expect(r.progress.hasFlag(mimicFlag('B7'))).toBe(true);
    r.step(3); // corpse lingers then is removed
    expect(e.removed).toBe(true);
    expect(slot.phase).toBe('dead');
    expect(slot.prompt()).toBeNull();
    expect(r.interactables.has(slot)).toBe(false);
    expect(slot.collider!.layer).toBe(Layer.Prop);
    // bonfire rest: stays dead, nothing respawns
    r.bus.emit('bonfireRest', { bonfireId: 'x' });
    r.step(1);
    expect(slot.phase).toBe('dead');
    expect(r.ai.enemies.length).toBe(0);
  });

  it('a dev kill (no player killer) does not persist the mimic flag', () => {
    const r = rig();
    r.mimics.add(OP).interact();
    r.step(MIMIC_TIMING.chompRise + 0.1);
    live(r)[0]!.kill(null);
    expect(r.progress.hasFlag(mimicFlag('B7'))).toBe(false);
  });

  it('reload: a persisted flag restores a dead open chest (no mimic, not interactable, not a target)', () => {
    const first = rig();
    first.mimics.add(OP);
    first.mimics.slots.get('B7')!.interact();
    first.step(MIMIC_TIMING.chompRise + 0.1);
    const e = live(first)[0]!;
    e.kill(1);
    // save + load into a fresh world
    const save = first.progress.writeSave(newSave());
    expect(save.flags).toContain('mimic:B7');
    const progress = new WorldProgress();
    progress.load(save);
    const second = rig(progress);
    const slot = second.mimics.add(OP);
    expect(slot.phase).toBe('dead');
    expect(second.interactables.size).toBe(0);
    expect(second.targets.size).toBe(0);
    expect(second.ai.enemies.length).toBe(0);
    expect(slot.collider).not.toBeNull();
  });

  it('bonfire rest resets a living mimic to a dormant chest (it can chomp again); hp is fresh', () => {
    const r = rig();
    const slot = r.mimics.add(OP);
    slot.interact();
    r.step(MIMIC_TIMING.chompRise + 0.1);
    live(r)[0]!.health.hp = 100;
    r.bus.emit('bonfireRest', { bonfireId: 'x' });
    expect(slot.phase).toBe('dormant');
    expect(live(r).length).toBe(0);
    expect(r.interactables.has(slot)).toBe(true);
    expect(r.targets.has(slot)).toBe(true);
    expect(r.progress.hasFlag(mimicFlag('B7'))).toBe(false);
    const hp = r.player.health.hp;
    slot.interact();
    r.step(MIMIC_TIMING.biteAt + 0.1);
    expect(r.player.health.hp).toBe(hp - 40);
    expect(live(r)[0]!.health.hp).toBe(400);
  });

  it('rest during the grab releases the control lock', () => {
    const r = rig();
    r.mimics.add(OP).interact();
    expect(r.locks).toEqual([true]);
    r.bus.emit('bonfireRest', { bonfireId: 'x' });
    expect(r.locks).toEqual([true, false]);
  });
});

describe('ChestSystem mimic hook', () => {
  it('replays recorded mimic ops to the host, forwards later ones, and drives update/dispose', () => {
    const calls: string[] = [];
    const host = { add: (op: { id: string }) => calls.push(`add:${op.id}`), update: () => calls.push('update'), dispose: () => calls.push('dispose') };
    const world = createCollisionWorld(4);
    const chests = new ChestSystem({
      parent: { add() {} } as never,
      world,
      interact: { register: () => () => {} } as never,
      pickups: {} as never,
      progress: new WorldProgress(),
    });
    chests.addMimic({ op: 'mimic', id: 'A', pos: [0, 0, 0], yaw: 0 });
    chests.setMimicHost(host);
    chests.addMimic({ op: 'mimic', id: 'B', pos: [1, 0, 0], yaw: 0 });
    chests.update(0.016);
    chests.dispose();
    expect(calls).toEqual(['add:A', 'add:B', 'update', 'dispose']);
  });
});
