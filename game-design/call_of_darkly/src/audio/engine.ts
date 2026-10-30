import { MUSIC_RATE, renderBossLoop } from './music';
import { RECIPES, renderRecipe, SFX_NAMES, SFX_RATE, type SfxName } from './sfx';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
}

export const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, music: 0.7 };
export const SETTINGS_KEY = 'cmw.audio.v1';

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export function loadSettings(store: KeyValueStore | null): AudioSettings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<AudioSettings>;
      s.master = clamp01(o.master, s.master);
      s.sfx = clamp01(o.sfx, s.sfx);
      s.music = clamp01(o.music, s.music);
    }
  } catch {
    /* corrupt or unavailable storage: defaults */
  }
  return s;
}

export function saveSettings(store: KeyValueStore | null, s: AudioSettings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export interface Voice {
  stop(): void;
  setGain(g: number): void;
  setPan(p: number): void;
}

/** Caps concurrent voices per sound key; the oldest voice is stolen when the cap is hit. */
export class VoiceLimiter {
  private active = new Map<string, Voice[]>();

  /** Register `v` under `key`. Returns the voices that were evicted (already stopped). */
  acquire(key: string, max: number, v: Voice): Voice[] {
    let list = this.active.get(key);
    if (!list) this.active.set(key, (list = []));
    const evicted: Voice[] = [];
    while (list.length >= max) {
      const old = list.shift()!;
      old.stop();
      evicted.push(old);
    }
    list.push(v);
    return evicted;
  }

  release(key: string, v: Voice): void {
    const list = this.active.get(key);
    if (!list) return;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
  }

  count(key: string): number {
    return this.active.get(key)?.length ?? 0;
  }
}

export interface PlayOpts {
  /** 0..1+ linear volume multiplier. */
  volume?: number;
  /** Playback rate (pitch). */
  rate?: number;
  pan?: number;
  loop?: boolean;
}

export interface EngineOpts {
  createContext?: () => AudioContext;
  storage?: KeyValueStore | null;
  /** Attach pointerdown/keydown listeners that unlock the context. Default: true when `window` exists. */
  autoUnlock?: boolean;
}

/** WebAudio wrapper: lazy context, three buses, cached procedural buffers, voice limiting. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  settings: AudioSettings;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicStopAt = -1;
  private buffers = new Map<string, AudioBuffer>();
  private limiter = new VoiceLimiter();
  private createContext: () => AudioContext;
  private store: KeyValueStore | null;
  private unlockHandler: (() => void) | null = null;
  /** Boss music requested (possibly while locked/suspended): started as soon as the context runs. */
  wantMusic = false;
  private wantFade = 1.5;

  constructor(opts: EngineOpts = {}) {
    this.store = opts.storage !== undefined ? opts.storage : safeLocalStorage();
    this.settings = loadSettings(this.store);
    this.createContext =
      opts.createContext ??
      (() => {
        const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!C) throw new Error('no AudioContext');
        return new C();
      });
    const auto = opts.autoUnlock ?? typeof window !== 'undefined';
    if (auto) {
      this.unlockHandler = () => this.unlock();
      window.addEventListener('pointerdown', this.unlockHandler);
      window.addEventListener('keydown', this.unlockHandler);
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create (first call) and resume the context. Call from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const ctx = this.createContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.sfxBus = ctx.createGain();
        this.musicBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(ctx.destination);
        this.applySettings();
        this.prewarm();
      }
      if (this.ctx.state !== 'running') {
        const p = this.ctx.resume?.();
        if (p && typeof p.then === 'function') void p.then(() => this.onRunning(), () => {});
      }
      this.onRunning();
    } catch {
      this.ctx = null;
    }
  }

  /** Once the context is running: drop the unlock listeners and honor a latched music request. */
  private onRunning(): void {
    if (!this.ready) return;
    this.removeUnlockListeners();
    if (this.wantMusic && !this.musicSrc) this.startMusic(this.wantFade);
  }

  private removeUnlockListeners(): void {
    if (this.unlockHandler && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlockHandler);
      window.removeEventListener('keydown', this.unlockHandler);
    }
    this.unlockHandler = null;
  }

  private prewarm(): void {
    if (typeof setTimeout === 'undefined') return;
    let i = 0;
    const step = () => {
      if (!this.ctx || i >= SFX_NAMES.length) return;
      this.getBuffer(SFX_NAMES[i++]!);
      setTimeout(step, 0);
    };
    setTimeout(step, 250);
  }

  setVolume(bus: keyof AudioSettings, v: number): void {
    this.settings[bus] = clamp01(v, this.settings[bus]);
    saveSettings(this.store, this.settings);
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.master || !this.sfxBus || !this.musicBus) return;
    this.master.gain.value = this.settings.master;
    this.sfxBus.gain.value = this.settings.sfx;
    this.musicBus.gain.value = this.settings.music;
  }

  /** Render (once) and cache the AudioBuffer for a recipe. */
  getBuffer(name: SfxName): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let b = this.buffers.get(name);
    if (!b) {
      const data = renderRecipe(RECIPES[name], name, SFX_RATE);
      b = ctx.createBuffer(1, data.length, SFX_RATE);
      b.getChannelData(0).set(data);
      this.buffers.set(name, b);
    }
    return b;
  }

  /** Play a cached procedural sound. Returns null when audio is locked/suspended. */
  play(name: SfxName, o: PlayOpts = {}): Voice | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus) return null;
    const recipe = RECIPES[name];
    const buf = this.getBuffer(name);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    src.loop = o.loop ?? !!(recipe as { loop?: boolean }).loop;
    const gain = ctx.createGain();
    gain.gain.value = o.volume ?? 1;
    src.connect(gain);
    let panner: StereoPannerNode | null = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = o.pan ?? 0;
      gain.connect(panner);
      panner.connect(this.sfxBus);
    } else {
      gain.connect(this.sfxBus);
    }
    let dead = false;
    const cleanup = () => {
      try {
        src.disconnect?.();
        gain.disconnect?.();
        panner?.disconnect?.();
      } catch {
        /* already disconnected */
      }
    };
    const voice: Voice = {
      stop: () => {
        if (dead) return;
        dead = true;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        this.limiter.release(name, voice);
      },
      setGain: (g) => {
        gain.gain.value = g;
      },
      setPan: (p) => {
        if (panner) panner.pan.value = p;
      },
    };
    src.onended = () => {
      dead = true;
      this.limiter.release(name, voice);
      cleanup();
    };
    this.limiter.acquire(name, recipe.voices, voice);
    src.start();
    return voice;
  }

  voiceCount(name: string): number {
    return this.limiter.count(name);
  }

  /** Fade the looped boss track in. Idempotent while already playing. */
  startMusic(fade = 1.5): void {
    this.wantMusic = true;
    this.wantFade = fade;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.musicBus) return;
    this.musicStopAt = -1;
    if (this.musicSrc && this.musicGain) {
      this.ramp(this.musicGain, 1, fade);
      return;
    }
    const buf = this.getMusicBuffer();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(this.musicBus);
    src.start();
    this.musicSrc = src;
    this.musicGain = g;
    this.ramp(g, 1, fade);
  }

  stopMusic(fade = 2): void {
    this.wantMusic = false;
    const ctx = this.ctx;
    if (!ctx || !this.musicSrc || !this.musicGain) return;
    this.ramp(this.musicGain, 0, fade);
    this.musicStopAt = ctx.currentTime + fade + 0.05;
  }

  get musicPlaying(): boolean {
    return !!this.musicSrc;
  }

  private musicBuf: AudioBuffer | null = null;
  private getMusicBuffer(): AudioBuffer {
    if (!this.musicBuf) {
      const data = renderBossLoop(MUSIC_RATE);
      this.musicBuf = this.ctx!.createBuffer(1, data.length, MUSIC_RATE);
      this.musicBuf.getChannelData(0).set(data);
    }
    return this.musicBuf;
  }

  private ramp(g: GainNode, to: number, secs: number): void {
    const t = this.ctx!.currentTime;
    const p = g.gain;
    p.cancelScheduledValues?.(t);
    p.setValueAtTime?.(p.value, t);
    if (p.linearRampToValueAtTime) p.linearRampToValueAtTime(to, t + Math.max(0.01, secs));
    else p.value = to;
  }

  /** Per-tick housekeeping (music stop after fade-out). */
  tick(): void {
    if (this.wantMusic && !this.musicSrc) this.onRunning();
    if (this.musicSrc && this.musicStopAt >= 0 && this.ctx && this.ctx.currentTime >= this.musicStopAt) {
      try {
        this.musicSrc.stop();
      } catch {
        /* ignore */
      }
      this.musicSrc.disconnect?.();
      this.musicSrc = null;
      this.musicGain = null;
      this.musicStopAt = -1;
    }
  }

  dispose(): void {
    this.removeUnlockListeners();
    try {
      void this.ctx?.close?.();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
