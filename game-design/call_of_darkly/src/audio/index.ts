import type { EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import type { Entity } from '../core/entity';
import type { StatsReader } from '../inventory/types';
import { WEAPONS } from '../data/weapons';
import { BURG_BONFIRE } from '../world/areas/burg';
import { FIRELINK_BONFIRE } from '../world/areas/firelink';
import { AudioEngine, type EngineOpts, type Voice } from './engine';
import { SHOT_BY_CLASS, type SfxName } from './sfx';
import { poseFromMatrix, spatialParams, type ListenerPose, type SpatialOpts, type SpatialResult } from './spatial';

export * from './engine';
export * from './sfx';
export * from './music';
export * from './spatial';

export interface AudioSystemOpts {
  events: EventBus;
  player: Entity & { state: { move: string; sprinting: boolean } };
  /** Anything with a three.js-style `matrixWorld.elements` (a THREE.Camera). */
  camera: { matrixWorld: { elements: ArrayLike<number> } };
  stats: StatsReader;
  /** Bonfire positions for the crackle loop (default: Firelink + Burg). */
  bonfires?: () => Iterable<readonly [number, number, number]>;
  engine?: EngineOpts;
}

export interface AudioSystem extends System {
  readonly engine: AudioEngine;
  dispose(): void;
}

const BONFIRE_HEAR = 22;
const FIRE_LIFETIME = 5;
const WIDE: SpatialOpts = { ref: 12, max: 160, rolloff: 0.6 };
const BOUNCE_GAP = 0.08;
const MID: SpatialOpts = { ref: 6, max: 90 };
const BONFIRE_OPTS: SpatialOpts = { ref: 3, max: BONFIRE_HEAR };

interface FireLoop {
  voice: Voice;
  pos: Vec3Like;
  t: number;
}

export function createAudioSystem(o: AudioSystemOpts): AudioSystem {
  const { events, player, camera, stats } = o;
  const engine = new AudioEngine(o.engine);
  const pose: ListenerPose = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
  const bonfires = o.bonfires ?? (() => [FIRELINK_BONFIRE, BURG_BONFIRE]);
  const fires: FireLoop[] = [];
  const scratch: SpatialResult = { gain: 0, pan: 0, dist: 0 };
  let bonfireVoice: Voice | null = null;
  let bonfireScan = 0;
  let prevX = NaN;
  let prevZ = NaN;
  let stride = 0;
  let lastBounce = -Infinity;

  const jitter = (a = 0.06) => 1 + (Math.random() * 2 - 1) * a;
  const refresh = () => poseFromMatrix(camera.matrixWorld.elements, pose);

  /** Play at a world position (distance gain + pan). Silent if out of range. */
  const at = (name: SfxName, p: Vec3Like, vol = 1, so: SpatialOpts = MID, rate = jitter()): Voice | null => {
    if (!engine.ready) return null;
    refresh();
    const s = spatialParams(pose, p.x, p.y, p.z, so);
    const g = s.gain * vol;
    if (g < 0.01) return null;
    return engine.play(name, { volume: g, pan: s.pan, rate });
  };
  const ui = (name: SfxName, vol = 1, rate = 1) => engine.play(name, { volume: vol, rate });

  const unsubs: Array<() => void> = [];
  const on: EventBus['on'] = (t, fn) => {
    const off = events.on(t, fn);
    unsubs.push(off);
    return off;
  };

  on('gunFired', (e) => {
    const cls = WEAPONS[e.weaponId]?.class ?? 'ar';
    at(SHOT_BY_CLASS[cls] ?? 'shot_ar', e.pos, 1, WIDE, jitter(0.04));
  });
  on('gunReload', (e) => {
    if (e.phase === 'start') ui('mag_out', 0.8, jitter(0.03));
    else if (e.phase === 'done') {
      ui('mag_in', 0.9, jitter(0.03));
      if (e.empty) engine.play('bolt', { volume: 0.9, rate: jitter(0.03) });
    }
  });
  on('weaponSwap', () => ui('swap', 0.8, jitter(0.05)));
  on('meleeSwing', () => ui('knife_swish', 0.8, jitter(0.08)));
  on('shieldBlock', (e) => ui('shield_clang', e.guardBroken ? 1 : 0.7, e.guardBroken ? 0.7 : jitter(0.05)));
  on('hit', (e) => {
    const melee = WEAPONS[e.weaponId]?.class === 'melee';
    if (melee) at('knife_hit', e.pos, 0.9, MID);
    if (e.blocked) return;
    ui('hitmarker', 0.8, jitter(0.03));
    if (e.headshot) ui('headshot', 0.9);
    if (e.killed) ui('kill_tick', 0.8);
  });
  on('damage', (e) => {
    if (e.target === player.id) ui('player_hurt', Math.min(1, 0.45 + e.amount / 60), jitter(0.08));
    else at('enemy_hurt', e.hitPos, 0.8, MID, jitter(0.15));
  });
  on('enemyAlert', (e) => at('enemy_alert', e.pos, 1, MID, jitter(0.1)));
  on('enemyWindup', (e) => at('sword_whoosh', e.pos, 0.9, MID, jitter(0.1)));
  on('gunDryFire', () => ui('empty', 0.8, jitter(0.03)));
  on('grenadeBounce', (e) => {
    const t = performance.now() / 1000;
    if (t - lastBounce < BOUNCE_GAP) return;
    lastBounce = t;
    at('grenade_bounce', e.pos, Math.min(1, 0.4 + e.speed / 14), MID, jitter(0.1));
  });
  on('bossSlam', (e) => {
    at('explosion', e.pos, 0.8, WIDE, 0.7);
    at('boom_thud', e.pos, 1, WIDE, 0.8);
  });
  on('enemyDeath', (e) => at('enemy_death', e.pos, 1, MID, jitter(0.12)));
  on('grenadeThrown', (e) => at('grenade_throw', e.pos, 1, MID));
  on('grenadeExploded', (e) => {
    if (e.kind === 'flashbang') return; // handled by `flashbang`
    if (e.kind === 'molotov') {
      at('molotov_burst', e.pos, 1, WIDE);
      const v = at('fire_loop', e.pos, 1, MID, 1);
      if (v) fires.push({ voice: v, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z }, t: FIRE_LIFETIME });
      return;
    }
    at('explosion', e.pos, 1, WIDE, jitter(0.1));
  });
  on('flashbang', (e) => {
    at('flashbang_bang', e.pos, 1, WIDE);
    if (!engine.ready) return;
    refresh();
    const d = spatialParams(pose, e.pos.x, e.pos.y, e.pos.z, { ref: e.radius * 0.5, max: e.radius * 1.2 }).gain;
    if (d > 0.05) ui('ring', d);
  });
  on('plungeHit', (e) => ui('boom_thud', e.kind === 'head' ? 1 : 0.8, 0.9));
  on('playerJump', () => ui('jump', 0.7, jitter(0.08)));
  on('playerLand', (e) => {
    if (e.fallSpeed > 3) ui('land', Math.min(1, 0.3 + e.fallSpeed / 18), jitter(0.06));
  });
  on('playerDodge', () => ui('roll', 1, jitter(0.06)));
  on('playerMantle', () => ui('mantle', 1, jitter(0.06)));
  on('playerKnockdown', () => ui('boom_thud', 0.7, 1.2));
  on('estusDrink', () => ui('estus'));
  on('staminaExhausted', () => ui('exhausted'));
  on('itemPickup', () => ui('pickup', 1, jitter(0.03)));
  on('bloodstainRecovered', () => ui('bloodstain'));
  on('bonfireRest', () => ui('bonfire_lit'));
  on('banner', (e) => {
    if (e.kind === 'victory') {
      ui('victory_sting');
      engine.stopMusic(2.5);
    } else if (e.kind === 'bonfireLit') ui('bonfire_lit');
  });
  on('deathScreen', (e) => {
    if (e.phase !== 'start') return;
    ui('death_sting');
    engine.stopMusic(1.5);
  });
  on('bossBar', (e) => {
    if (e.show) engine.startMusic(1.5);
    else engine.stopMusic(2);
  });
  on('demoComplete', () => engine.stopMusic(3));

  function footsteps(dt: number): void {
    const p = (player as unknown as { transform: { position: Vec3Like } }).transform.position;
    const dx = p.x - prevX;
    const dz = p.z - prevZ;
    prevX = p.x;
    prevZ = p.z;
    if (!(dt > 0) || !isFinite(dx) || player.state.move !== 'ground') {
      stride = 0;
      return;
    }
    const d = Math.hypot(dx, dz);
    if (d > 3 || d / dt < 0.8) return; // teleport / standing still
    stride += d;
    const len = player.state.sprinting ? 3.0 : 2.1;
    if (stride < len) return;
    stride -= len;
    const vol = stats.get('footstepVolume'); // Dead Silence Patch -> 0
    if (vol <= 0) return;
    ui('footstep', Math.min(1, 0.5 * vol * (player.state.sprinting ? 1.1 : 0.7)), jitter(0.12));
  }

  function bonfireLoop(dt: number): void {
    bonfireScan -= dt;
    if (bonfireScan > 0 && !bonfireVoice) return;
    refresh();
    let best = Infinity;
    let bx = 0, by = 0, bz = 0;
    for (const b of bonfires()) {
      const d = Math.hypot(b[0] - pose.x, b[1] - pose.y, b[2] - pose.z);
      if (d < best) { best = d; bx = b[0]; by = b[1]; bz = b[2]; }
    }
    if (best > BONFIRE_HEAR) {
      bonfireVoice?.stop();
      bonfireVoice = null;
      bonfireScan = 0.5;
      return;
    }
    if (!bonfireVoice && engine.ready) bonfireVoice = engine.play('bonfire_loop', { volume: 0 });
    if (bonfireVoice) {
      const s = spatialParams(pose, bx, by, bz, BONFIRE_OPTS, scratch);
      bonfireVoice.setGain(s.gain);
      bonfireVoice.setPan(s.pan);
    }
  }

  return {
    name: 'audio',
    engine,
    update(dt: number): void {
      engine.tick();
      if (!engine.ready) return;
      footsteps(dt);
      bonfireLoop(dt);
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]!;
        f.t -= dt;
        if (f.t <= 0) {
          f.voice.stop();
          fires[i] = fires[fires.length - 1]!;
          fires.pop();
          continue;
        }
        refresh();
        const s = spatialParams(pose, f.pos.x, f.pos.y, f.pos.z, MID, scratch);
        f.voice.setGain(s.gain * Math.min(1, f.t));
        f.voice.setPan(s.pan);
      }
    },
    dispose(): void {
      for (const u of unsubs) u();
      unsubs.length = 0;
      engine.dispose();
    },
  };
}
