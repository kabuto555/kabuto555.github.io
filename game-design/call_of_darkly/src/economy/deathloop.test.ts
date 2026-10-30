import { describe, expect, it } from 'vitest';
import { AmmoStore } from '../combat/weapons';
import { EventBus } from '../core/events';
import { newSave, SaveStore, type KeyValueStorage } from '../core/save';
import type { Vec3Like } from '../core/types';
import type { Interactable } from '../world/interact';
import { DeathLoop, DEATH_CAM_SECONDS, PISTOL_FLOOR, type DeathLoopPlayer } from './deathloop';
import { Wallet } from './wallet';

const SPAWN = { pos: { x: 1, y: 0, z: 2 }, yaw: 0.5 };

function setup(over: { save?: ReturnType<typeof newSave> | null; areaBoss?: string | null; getAreaId?: (pos?: Vec3Like) => string } = {}) {
  const bus = new EventBus();
  const wallet = new Wallet(bus);
  const ammo = new AmmoStore(bus);
  const items = new Set<Interactable>();
  const calls = { respawnAll: 0, restock: 0, refill: 0, respawn: [] as { pos: Vec3Like; yaw: number }[] };
  const player: DeathLoopPlayer & { position: Vec3Like; grounded: boolean; state: { move: string } } = {
    id: 1,
    position: { x: 5, y: 0, z: 5 },
    grounded: true,
    state: { move: 'ground' },
    controlsEnabled: true,
    respawn(pos: Vec3Like, yaw: number) {
      calls.respawn.push({ pos, yaw });
      this.position = { ...pos };
      this.state.move = 'ground';
    },
    refill() {
      calls.refill++;
    },
  };
  const log: string[] = [];
  bus.on('deathScreen', (e) => log.push(`screen:${e.phase}`));
  bus.on('playerRespawned', () => log.push('respawned'));
  bus.on('bossReset', (e) => log.push(`boss:${e.bossId}`));
  bus.on('toast', (e) => log.push(`toast:${e.text}`));
  const loop = new DeathLoop({
    player,
    wallet,
    ai: { respawnAll: () => void calls.respawnAll++ },
    pickups: { restockCaches: () => void calls.restock++ },
    combat: { ammo },
    interact: { register: (i) => (items.add(i), () => void items.delete(i)) },
    save: over.save ?? null,
    getRespawn: () => SPAWN,
    inBossArena: () => over.areaBoss ?? null,
    getAreaId: over.getAreaId,
    bus,
  });
  const die = (pos: Vec3Like = player.position): void => {
    player.state.move = 'dead';
    bus.emit('playerDied', { pos, souls: wallet.souls });
  };
  const run = (secs: number): void => {
    for (let t = 0; t < secs; t += 1 / 60) loop.update(1 / 60);
  };
  const stainItem = (): Interactable | undefined => [...items][0];
  return { bus, wallet, ammo, items, calls, player, loop, die, run, log, stainItem };
}

describe('death loop', () => {
  it('drops souls as a bloodstain, respawns, then [E] recovers them', () => {
    const s = setup();
    s.wallet.add(500);
    s.player.position = { x: 10, y: 3, z: -4 };
    s.die();
    expect(s.wallet.souls).toBe(0);
    expect(s.player.controlsEnabled).toBe(false);
    expect(s.loop.bloodstain).toEqual({ areaId: 'main', pos: [10, 3, -4], souls: 500 });
    expect(s.log).toEqual(['screen:start']);
    // Not respawned during the death cam, and the stain is not usable yet.
    s.run(DEATH_CAM_SECONDS - 0.5);
    expect(s.calls.respawn.length).toBe(0);
    expect(s.stainItem()!.enabled!()).toBe(false);
    s.run(1);
    expect(s.calls.respawn).toEqual([SPAWN]);
    expect(s.calls.refill).toBe(1);
    expect(s.calls.respawnAll).toBe(1);
    expect(s.calls.restock).toBe(1);
    expect(s.player.controlsEnabled).toBe(true);
    expect(s.log).toEqual(['screen:start', 'screen:end', 'respawned']);
    // Recover.
    const it = s.stainItem()!;
    expect(it.enabled!()).toBe(true);
    expect(it.prompt()).toContain('500');
    it.interact();
    expect(s.wallet.souls).toBe(500);
    expect(s.loop.bloodstain).toBeNull();
    expect(s.items.size).toBe(0);
    expect(s.log.at(-1)).toContain('toast:SOULS RECOVERED');
  });

  it('dying twice wipes the first stain for good', () => {
    const s = setup();
    s.wallet.add(300);
    s.player.position = { x: 1, y: 0, z: 1 };
    s.die();
    s.run(DEATH_CAM_SECONDS + 0.1);
    s.wallet.add(40);
    s.player.position = { x: 9, y: 0, z: 9 };
    s.die();
    expect(s.loop.bloodstain).toEqual({ areaId: 'main', pos: [9, 0, 9], souls: 40 });
    expect(s.items.size).toBe(1);
    s.run(DEATH_CAM_SECONDS + 0.1);
    s.stainItem()!.interact();
    expect(s.wallet.souls).toBe(40);
  });

  it('a saved stain from another area is not spawned but stays in the save', () => {
    const save = newSave();
    save.bloodstain = { areaId: 'burg', pos: [1, 0, 1], souls: 77 };
    const s = setup({ save });
    expect(s.items.size).toBe(0);
    expect(s.loop.bloodstain).toBeNull();
    expect(s.loop.writeSave(newSave()).bloodstain).toEqual({ areaId: 'burg', pos: [1, 0, 1], souls: 77 });
    // dying (even with 0 souls) wipes it for good
    s.die();
    expect(s.loop.writeSave(newSave()).bloodstain).toBeNull();
  });

  it('a saved stain from the current area is spawned', () => {
    const save = newSave();
    save.bloodstain = { areaId: 'main', pos: [1, 0, 1], souls: 77 };
    const s = setup({ save });
    expect(s.items.size).toBe(1);
  });

  it('dying with 0 souls still wipes the existing stain (PLAN §9)', () => {
    const s = setup();
    s.wallet.add(100);
    s.die();
    s.run(DEATH_CAM_SECONDS + 0.1);
    s.die();
    expect(s.loop.bloodstain).toBeNull();
  });

  it('pistol floor >= 24 on respawn; other ammo persists', () => {
    const s = setup();
    s.ammo.set('pistol', 5);
    s.ammo.set('rifle', 17);
    s.die();
    s.run(DEATH_CAM_SECONDS + 0.1);
    expect(s.ammo.get('pistol')).toBe(PISTOL_FLOOR);
    expect(s.ammo.get('rifle')).toBe(17);
    s.ammo.set('pistol', 60);
    s.die();
    s.run(DEATH_CAM_SECONDS + 0.1);
    expect(s.ammo.get('pistol')).toBe(60);
  });

  it('save round-trip restores the bloodstain', () => {
    const s = setup();
    s.wallet.add(250);
    s.die(); // stain at (5,0,5)
    const store = (() => {
      const m = new Map<string, string>();
      const st: KeyValueStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
      return new SaveStore(st);
    })();
    store.save(s.loop.writeSave(newSave()));
    const loaded = store.load()!;
    expect(loaded.bloodstain).toEqual({ areaId: 'main', pos: [5, 0, 5], souls: 250 });

    const s2 = setup({ save: loaded });
    expect(s2.loop.bloodstain).toEqual(loaded.bloodstain);
    expect(s2.items.size).toBe(1);
    s2.stainItem()!.interact();
    expect(s2.wallet.souls).toBe(250);
    expect(s2.loop.writeSave(newSave()).bloodstain).toBeNull();
  });

  it('unsafe death pos (below kill plane / airborne) falls back to the last grounded position', () => {
    const s = setup();
    s.wallet.add(80);
    s.player.position = { x: 20, y: 2, z: 20 };
    s.run(0.1); // records grounded spot
    // Walks off a ledge and falls below the kill plane.
    s.player.grounded = false;
    s.player.state.move = 'air';
    s.player.position = { x: 24, y: -90, z: 20 };
    s.die();
    expect(s.loop.bloodstain?.pos).toEqual([20, 2, 20]);
    expect(s.loop.bloodstain?.souls).toBe(80);
  });

  it('airborne death (above kill plane) also uses the last grounded position', () => {
    const s = setup();
    s.wallet.add(10);
    s.player.position = { x: 3, y: 1, z: 3 };
    s.run(0.1);
    s.player.grounded = false;
    s.player.position = { x: 4, y: 3, z: 3 };
    s.die();
    expect(s.loop.bloodstain?.pos).toEqual([3, 1, 3]);
  });

  it('falling below killY emits lethal damage on the player', () => {
    const s = setup();
    const hits: { target: number; amount: number }[] = [];
    s.bus.on('damage', (e) => hits.push({ target: e.target, amount: e.amount }));
    s.player.grounded = false;
    s.player.position = { x: 0, y: -100, z: 0 };
    s.run(0.05);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ target: 1 });
    expect(hits[0]!.amount).toBeGreaterThan(1000);
  });

  it('boss-arena death emits bossReset on respawn', () => {
    const s = setup({ areaBoss: 'taurus' });
    s.die();
    s.run(DEATH_CAM_SECONDS + 0.1);
    expect(s.log).toContain('boss:taurus');
  });

  it('a second playerDied during the death cam is ignored', () => {
    const s = setup();
    s.wallet.add(50);
    s.die();
    s.wallet.add(70); // e.g. a late pickup
    s.die();
    expect(s.loop.bloodstain?.souls).toBe(50);
    expect(s.log.filter((l) => l === 'screen:start').length).toBe(1);
  });

  it('teleport then immediate airborne death stains the teleport spot, in that spot\'s area (not the stale one)', () => {
    // Player stood in "firelink" at (5,0,5); dev teleport to the Burg and die before any update tick / landing.
    const area = (p?: Vec3Like): string => ((p?.z ?? 0) < -63 ? 'burg' : 'firelink');
    const s = setup({ getAreaId: area });
    s.run(0.1); // grounded anchor = firelink spot
    s.wallet.set(3500);
    const burg = { x: 10, y: 4, z: -74 };
    s.player.position = { ...burg };
    s.player.grounded = false; // capsule.teleport clears grounded
    s.bus.emit('playerTeleported', { pos: burg });
    s.die(burg);
    expect(s.wallet.souls).toBe(0);
    expect(s.loop.bloodstain).toEqual({ areaId: 'burg', pos: [10, 4, -74], souls: 3500 });
    const save = s.loop.writeSave(newSave());
    expect(save.bloodstain?.areaId).toBe('burg');
  });

  it('reports one change after wallet and stain agree (save never holds souls and stain together)', () => {
    const s = setup();
    s.wallet.set(900);
    const seen: { souls: number; stain: number | null }[] = [];
    s.loop.onChange = () => seen.push({ souls: s.wallet.souls, stain: s.loop.bloodstain?.souls ?? null });
    s.die();
    expect(seen).toEqual([{ souls: 0, stain: 900 }]);
  });
});
