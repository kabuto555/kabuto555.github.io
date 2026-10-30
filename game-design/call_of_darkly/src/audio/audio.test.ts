import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/events';
import { WEAPONS } from '../data/weapons';
import {
  AudioEngine, DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, VoiceLimiter, type KeyValueStore, type Voice,
} from './engine';
import { createAudioSystem } from './index';
import { bossLoopSeconds, renderBossLoop } from './music';
import { RECIPES, SFX_NAMES, SHOT_BY_CLASS, recipeDuration, renderRecipe } from './sfx';
import { spatialParams } from './spatial';

function memStore(): KeyValueStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** Minimal AudioContext mock that records created sources. */
function mockCtx() {
  const sources: { started: boolean; stopped: boolean; gainValue: number; onended: (() => void) | null }[] = [];
  const param = (v = 1) => ({ value: v, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), pan: param(0) });
  const ctx = {
    state: 'suspended' as string,
    currentTime: 0,
    destination: {},
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createGain: () => node(),
    createStereoPanner: () => node(),
    createBuffer: (_c: number, n: number) => ({ length: n, getChannelData: () => new Float32Array(n) }),
    createBufferSource() {
      const s = { buffer: null, loop: false, playbackRate: { value: 1 }, started: false, stopped: false, gainValue: 1, onended: null as (() => void) | null,
        connect() {}, disconnect() {}, start() { s.started = true; }, stop() { s.stopped = true; } };
      sources.push(s);
      return s;
    },
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, sources };
}

describe('recipes', () => {
  it('every recipe renders finite, bounded, non-silent samples with sane params', () => {
    for (const name of SFX_NAMES) {
      const r = RECIPES[name];
      expect(r.voices).toBeGreaterThanOrEqual(1);
      expect(r.gain).toBeGreaterThan(0);
      expect(r.gain).toBeLessThanOrEqual(1);
      expect(recipeDuration(r)).toBeLessThan(5);
      for (const l of r.layers) {
        expect(l.dur).toBeGreaterThan(0);
        if (l.wave !== 'noise') {
          expect(l.f0).toBeGreaterThan(0);
          expect(l.f1).toBeGreaterThan(0);
        }
      }
      const d = renderRecipe(r, name);
      let peak = 0;
      for (const v of d) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });
  it('is deterministic', () => {
    expect(renderRecipe(RECIPES.shot_ar, 'shot_ar')).toEqual(renderRecipe(RECIPES.shot_ar, 'shot_ar'));
  });
  it('every gun class has a shot recipe', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.class === 'melee' || w.class === 'shield') continue;
      expect(RECIPES[SHOT_BY_CLASS[w.class]!]).toBeDefined();
    }
  });
  it('sniper is longer than pistol; explosion longer still', () => {
    expect(recipeDuration(RECIPES.shot_sniper)).toBeGreaterThan(recipeDuration(RECIPES.shot_pistol));
    expect(recipeDuration(RECIPES.explosion)).toBeGreaterThan(recipeDuration(RECIPES.shot_sniper));
  });
  it('boss loop is finite, bounded and loops seamlessly-ish', () => {
    const d = renderBossLoop(8000);
    expect(d.length).toBe(Math.floor(bossLoopSeconds() * 8000));
    let peak = 0;
    for (const v of d) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(d[0]! - d[d.length - 1]!)).toBeLessThan(0.3);
  });
});

describe('spatial', () => {
  const l = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
  it('attenuates with distance and is silent past max', () => {
    expect(spatialParams(l, 0, 0, -2).gain).toBe(1);
    const mid = spatialParams(l, 0, 0, -20).gain;
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(spatialParams(l, 0, 0, -40).gain);
    expect(spatialParams(l, 0, 0, -100).gain).toBe(0);
  });
  it('pans toward the source side', () => {
    expect(spatialParams(l, 10, 0, 0).pan).toBeGreaterThan(0.5);
    expect(spatialParams(l, -10, 0, 0).pan).toBeLessThan(-0.5);
    expect(Math.abs(spatialParams(l, 0, 0, -10).pan)).toBeLessThan(0.01);
  });
});

describe('VoiceLimiter', () => {
  const mk = (): Voice & { stopped: boolean } => {
    const v = { stopped: false, stop() { v.stopped = true; }, setGain() {}, setPan() {} };
    return v;
  };
  it('steals the oldest voice at the cap', () => {
    const lim = new VoiceLimiter();
    const a = mk(), b = mk(), c = mk();
    lim.acquire('s', 2, a);
    lim.acquire('s', 2, b);
    const ev = lim.acquire('s', 2, c);
    expect(ev).toEqual([a]);
    expect(a.stopped).toBe(true);
    expect(lim.count('s')).toBe(2);
    lim.release('s', b);
    expect(lim.count('s')).toBe(1);
    expect(lim.count('other')).toBe(0);
  });
});

describe('engine', () => {
  it('persists volumes and reloads them', () => {
    const store = memStore();
    const e = new AudioEngine({ storage: store, autoUnlock: false, createContext: () => mockCtx().ctx });
    expect(e.settings).toEqual(DEFAULT_SETTINGS);
    e.setVolume('music', 0.25);
    e.setVolume('master', 7); // clamped
    expect(JSON.parse(store.m.get(SETTINGS_KEY)!)).toMatchObject({ music: 0.25, master: 1 });
    const e2 = new AudioEngine({ storage: store, autoUnlock: false, createContext: () => mockCtx().ctx });
    expect(e2.settings.music).toBe(0.25);
    expect(loadSettings({ getItem: () => '{bad', setItem() {} })).toEqual(DEFAULT_SETTINGS);
  });
  it('does nothing until unlocked, then plays with voice limiting', () => {
    const m = mockCtx();
    const e = new AudioEngine({ storage: memStore(), autoUnlock: false, createContext: () => m.ctx });
    expect(e.play('pickup')).toBeNull();
    e.unlock();
    expect(e.ready).toBe(true);
    const cap = RECIPES.shot_sniper.voices;
    for (let i = 0; i < cap + 3; i++) e.play('shot_sniper');
    expect(e.voiceCount('shot_sniper')).toBe(cap);
    expect(m.sources.filter((s) => s.stopped).length).toBe(3);
  });
});

describe('audio system wiring', () => {
  function setup(footstepVolume = 1) {
    const bus = new EventBus();
    const m = mockCtx();
    const player = { id: 1, transform: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, state: { move: 'ground', sprinting: false } };
    const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
    const sys = createAudioSystem({
      events: bus, player: player as never, camera,
      stats: { get: () => footstepVolume, has: () => false },
      bonfires: () => [],
      engine: { storage: memStore(), autoUnlock: false, createContext: () => m.ctx },
    });
    sys.engine.unlock();
    return { bus, m, sys, player };
  }
  it('plays a shot and respects distance', () => {
    const { bus, m } = setup();
    bus.emit('gunFired', { weaponId: 'm4_ar', pos: { x: 0, y: 0, z: -5 }, dir: { x: 0, y: 0, z: -1 } });
    expect(m.sources.length).toBe(1);
    bus.emit('gunFired', { weaponId: 'm4_ar', pos: { x: 0, y: 0, z: -500 }, dir: { x: 0, y: 0, z: -1 } });
    expect(m.sources.length).toBe(1);
  });
  it('new hook events play sounds (alert, windup, dry fire, bounce rate-limited, slam)', () => {
    const { bus, m } = setup();
    const pos = { x: 0, y: 0, z: -4 };
    bus.emit('enemyAlert', { enemyId: 1, pos });
    expect(m.sources.length).toBe(1);
    bus.emit('enemyWindup', { enemyId: 1, pos, attackId: 'x' });
    expect(m.sources.length).toBe(2);
    bus.emit('gunDryFire', { weaponId: 'm4_ar' });
    expect(m.sources.length).toBe(3);
    bus.emit('grenadeBounce', { pos, speed: 8 });
    bus.emit('grenadeBounce', { pos, speed: 8 });
    expect(m.sources.length).toBe(4);
    bus.emit('bossSlam', { pos, radius: 4 });
    expect(m.sources.length).toBeGreaterThanOrEqual(5);
  });
  it('boss music starts on bossBar show and stops on hide', () => {
    const { bus, sys } = setup();
    bus.emit('bossBar', { show: true, name: 'x' });
    bus.emit('bossBar', { show: true, hp: 1, max: 2 });
    expect(sys.engine.musicPlaying).toBe(true);
    bus.emit('bossBar', { show: false });
    m_advance(sys);
    expect(sys.engine.musicPlaying).toBe(false);
  });
  function m_advance(sys: { engine: AudioEngine; update(dt: number): void }) {
    (sys.engine.ctx as unknown as { currentTime: number }).currentTime = 100;
    sys.update(0.016);
  }
  function walk(h: ReturnType<typeof setup>): number {
    h.sys.update(0.016);
    const before = h.m.sources.length;
    for (let i = 0; i < 120; i++) {
      h.player.transform.position.z -= 0.1;
      h.sys.update(0.016);
    }
    return h.m.sources.length - before;
  }
  it('footsteps play when walking, silent with Dead Silence (footstepVolume 0)', () => {
    expect(walk(setup(1))).toBeGreaterThan(2);
    expect(walk(setup(0))).toBe(0);
  });
});

describe('engine unlock + music latch', () => {
  it('boss music requested while suspended starts once the context runs; listeners removed once running', () => {
    const m = mockCtx();
    const eng = new AudioEngine({ storage: memStore(), autoUnlock: false, createContext: () => m.ctx });
    eng.startMusic(); // locked: latched
    expect(eng.wantMusic).toBe(true);
    expect(eng.musicPlaying).toBe(false);
    eng.unlock(); // mock resume() -> running
    expect(eng.musicPlaying).toBe(true);
    eng.stopMusic(0.1);
    expect(eng.wantMusic).toBe(false);
  });
  it('latched music starts from tick() when resume completes later', () => {
    const m = mockCtx();
    m.raw.resume = () => Promise.resolve(); // stays suspended
    const eng = new AudioEngine({ storage: memStore(), autoUnlock: false, createContext: () => m.ctx });
    eng.unlock();
    eng.startMusic();
    expect(eng.musicPlaying).toBe(false);
    m.raw.state = 'running';
    eng.tick();
    expect(eng.musicPlaying).toBe(true);
  });
  it('voice nodes disconnect when the source ends', () => {
    const m = mockCtx();
    const eng = new AudioEngine({ storage: memStore(), autoUnlock: false, createContext: () => m.ctx });
    eng.unlock();
    eng.play('hitmarker');
    let dc = 0;
    (m.sources[0] as unknown as { disconnect(): void }).disconnect = () => void dc++;
    m.sources[0]!.onended!();
    expect(dc).toBe(1);
  });
  it('spatialParams reuses a provided out object', () => {
    const out = { gain: 0, pan: 0, dist: 0 };
    const r = spatialParams({ x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 }, 3, 0, 0, undefined, out);
    expect(r).toBe(out);
    expect(out.pan).toBeGreaterThan(0);
  });
});
