import * as THREE from 'three';
import type { EventBus } from '../core/events';
import type { GameLoop } from '../core/loop';
import type { System } from '../core/types';
import type { CollisionWorld } from '../physics/types';
import { DamageType } from '../core/entity';
import { WEAPONS } from '../data/weapons';
import { PLAYER_ENTITY_ID } from '../player/tuning';
import type { Viewmodel } from '../player/viewmodel';
import { HITSTOP, Hitstop } from './hitstop';
import { DecalPool, ParticlePool, spawnBodyHit, spawnImpact } from './impacts';
import { MuzzleLight, ShellPool } from './muzzle';
import { Shake, loadShakeIntensity, saveShakeIntensity } from './shake';

export * from './hitstop';
export * from './shake';
export * from './impacts';
export * from './muzzle';

export interface FxDeps {
  events: EventBus;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Object3D;
  viewmodel?: Viewmodel;
  loop: Pick<GameLoop, 'hitstop'>;
  world?: CollisionWorld;
  /** Player feet position (shell floor); falls back to camera-based estimate. */
  player?: { position: { y: number } };
}

export interface FxSystem extends System {
  readonly shake: Shake;
  readonly hitstop: Hitstop;
  readonly decals: DecalPool;
  readonly particles: ParticlePool;
  readonly shells: ShellPool;
  /** 0..2 (1 = default); persisted to localStorage `fx.shakeIntensity`. */
  setShakeIntensity(v: number): void;
  dispose(): void;
}

/** Per-class gunfire camera kick (trauma); other classes are silent. */
const GUN_TRAUMA: Record<string, number> = { lmg: 0.05, shotgun: 0.22, marksman: 0.2, launcher: 0.3 };
/** DoT / repeated damage from one source inside this window only adds a small trauma. */
export const DOT_WINDOW = 0.25;
export const DOT_TRAUMA = 0.04;
export function damageTrauma(amount: number): number {
  return Math.min(0.6, amount / 60);
}
const NO_SHELL = new Set(['launcher', 'revolver']);

export function createFxSystem(deps: FxDeps): FxSystem {
  const { events, camera, scene, loop } = deps;
  let clock = 0;
  let lastDmgAt = -1;
  let lastDmgSrc: unknown = undefined;
  const shake = new Shake();
  shake.intensity = loadShakeIntensity();
  const hitstop = new Hitstop(loop);
  const decals = new DecalPool(64);
  const particles = new ParticlePool(128);
  const shells = new ShellPool(24);
  const light = new MuzzleLight();
  scene.add(decals.mesh, particles.mesh, shells.mesh, light.light);

  const base = { x: 0, y: 0, z: 0 };
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const toCam = { x: 0, y: 0, z: 0 };

  const offs = [
    events.on('hit', (e) => {
      const w = WEAPONS[e.weaponId];
      if (w?.class === 'melee') hitstop.trigger(e.killed ? HITSTOP.meleeKill : HITSTOP.melee);
      else if (e.headshot && e.killed) hitstop.trigger(HITSTOP.headshotKill);
      shake.basePos(camera, base);
      toCam.x = base.x - e.pos.x;
      toCam.y = base.y - e.pos.y;
      toCam.z = base.z - e.pos.z;
      const l = Math.hypot(toCam.x, toCam.y, toCam.z) || 1;
      toCam.x /= l; toCam.y /= l; toCam.z /= l;
      spawnBodyHit(particles, e.pos, toCam, e.blocked);
    }),
    events.on('shieldBlock', (e) => {
      if (e.guardBroken) {
        hitstop.trigger(HITSTOP.guardBreak);
        shake.add(0.35);
      } else shake.add(0.12);
    }),
    events.on('plungeHit', (e) => {
      hitstop.trigger(HITSTOP.plunge);
      shake.add(e.kind === 'land' ? 0.7 : 0.55);
    }),
    events.on('damage', (e) => {
      if (e.target !== PLAYER_ENTITY_ID) return;
      const dot = e.type === DamageType.Fire || (e.source === lastDmgSrc && clock - lastDmgAt < DOT_WINDOW);
      lastDmgAt = clock;
      lastDmgSrc = e.source;
      shake.add(dot ? Math.min(DOT_TRAUMA, damageTrauma(e.amount)) : damageTrauma(e.amount));
    }),
    events.on('grenadeExploded', (e) => {
      shake.basePos(camera, base);
      const d = Math.hypot(base.x - e.pos.x, base.y - e.pos.y, base.z - e.pos.z);
      const reach = Math.max(8, e.radius * 4);
      if (d < reach) shake.add(0.85 * (1 - d / reach));
    }),
    events.on('bossSlam', (e) => {
      shake.basePos(camera, base);
      const d = Math.hypot(base.x - e.pos.x, base.y - e.pos.y, base.z - e.pos.z);
      const reach = Math.max(18, e.radius * 5);
      if (d < reach) shake.add(0.75 * (1 - d / reach));
    }),
    events.on('playerLand', (e) => {
      if (e.fallSpeed > 9) shake.add(Math.min(0.6, (e.fallSpeed - 9) * 0.05 + 0.15));
    }),
    events.on('playerKnockdown', () => shake.add(0.5)),
    events.on('bulletImpact', (e) => {
      spawnImpact(decals, particles, e.pos, e.normal, e.surface, undefined, e.dynamic);
    }),
    events.on('bonfireRest', () => decals.clear()),
    events.on('doorOpened', () => decals.clear()),
    events.on('gunFired', (e) => {
      const cls = WEAPONS[e.weaponId]?.class ?? 'ar';
      const k = GUN_TRAUMA[cls];
      if (k) shake.add(k);
      light.flash(e.pos.x + e.dir.x * 0.8, e.pos.y + e.dir.y * 0.8, e.pos.z + e.dir.z * 0.8, cls === 'shotgun' || cls === 'launcher' ? 3 : 2);
      if (!NO_SHELL.has(cls)) {
        camera.getWorldDirection(fwd);
        up.set(0, 1, 0);
        right.crossVectors(fwd, up).normalize();
        const p = base;
        shake.basePos(camera, base);
        shells.eject(
          p.x + fwd.x * 0.45 + right.x * 0.14,
          p.y + fwd.y * 0.45 - 0.1,
          p.z + fwd.z * 0.45 + right.z * 0.14,
          right.x * 2 + fwd.x * 0.3,
          1.6,
          right.z * 2 + fwd.z * 0.3,
          (deps.player ? deps.player.position.y : p.y - 1.6) + 0.03,
        );
      }
    }),
  ];

  return {
    name: 'fx',
    shake,
    hitstop,
    decals,
    particles,
    shells,
    update() {},
    render(_alpha, dt) {
      clock += dt;
      particles.update(dt);
      shells.update(dt);
      light.update(dt);
      shake.step(dt);
      shake.apply(camera); // after controller + combat wrote the camera; undone next frame
    },
    setShakeIntensity(v) {
      shake.intensity = Math.min(2, Math.max(0, v));
      saveShakeIntensity(shake.intensity);
    },
    dispose() {
      for (const o of offs) o();
      scene.remove(decals.mesh, particles.mesh, shells.mesh, light.light);
    },
  };
}
