/**
 * Lunch Delivery action SFX — recorded clips for the tools, bug squish and your
 * "ow" (CLIPS), tiny WebAudio synths for the rest. World sounds take a 0..1 volume
 * from the caller (distance falloff, sfx-falloff.ts). The big moments (win / lose /
 * you got taken out by bugs) reuse the shared clips in minigame-sounds.ts instead.
 */
import { gameSettings } from '../game-settings';

const CLIPS = {
  whoosh: 'assets/sfx-swat-whoosh.mp3', // every swatter swing
  slap: 'assets/sfx-swat-slap.mp3',     // the swing connects with a bug
  powerUp: 'assets/sfx-power-up.mp3',   // grabbed a spray / water gun power-up
  pew: 'assets/sfx-water-pew.mp3',      // water gun shot (played pitched up)
  spray: 'assets/sfx-bug-spray.mp3',    // bug spray puff (the file has 3 bursts; we play the first)
  squish: 'assets/sfx-bug-squish.mp3',  // a bug dies
  hurt: 'assets/sfx-lunch-hurt.mp3',    // you got bitten (a voice, played pitched up)
} as const;
type ClipName = keyof typeof CLIPS;

export class LunchSfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  /** Clip bytes fetched up front; decoded into `clips` once there's an AudioContext. */
  private readonly clipData = new Map<ClipName, Promise<ArrayBuffer>>();
  private readonly clips = new Map<ClipName, AudioBuffer>();

  constructor() {
    for (const [name, url] of Object.entries(CLIPS) as [ClipName, string][]) {
      const data = fetch(url).then((r) => r.arrayBuffer());
      data.catch(() => console.warn(`[lunch sfx] couldn't load ${url}`));
      this.clipData.set(name, data);
    }
  }

  resume(): void {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.noise) {
        const n = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      this.decodeClips();
    } catch { /* no audio */ }
  }

  private decodeClips(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [name, data] of this.clipData) {
      this.clipData.delete(name); // once
      data.then((buf) => ctx.decodeAudioData(buf)).then((b) => this.clips.set(name, b)).catch(() => {});
    }
  }

  /** Play a clip `delay` seconds from now (scheduled on the audio clock, so it lands exactly).
   * `span` = [offset, duration] in clip seconds plays just that slice, fading out at its end. */
  private clip(name: ClipName, gain: number, delay = 0, rate = 1, span?: [number, number]): void {
    const ctx = this.ctx, buf = this.clips.get(name);
    const vol = gameSettings.get().sfxVolume;
    if (!ctx || !buf || vol <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * vol;
    src.connect(g).connect(ctx.destination);
    const t = ctx.currentTime + delay;
    if (span) {
      const end = t + span[1] / rate;
      g.gain.setValueAtTime(gain * vol, end - 0.03);
      g.gain.linearRampToValueAtTime(0.0001, end);
      src.start(t, span[0]);
      src.stop(end + 0.01);
    } else {
      src.start(t);
    }
  }

  /** Rate-limit per sound so a swarm dying at once isn't a wall of noise. */
  private gate(key: string, gapMs: number): boolean {
    const now = performance.now();
    if (now - (this.last.get(key) ?? 0) < gapMs) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx;
    const vol = gameSettings.get().sfxVolume;
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, freq: number, gain: number, q = 0.8): void {
    const ctx = this.ctx;
    const vol = gameSettings.get().sfxVolume;
    if (!ctx || !this.noise || vol <= 0) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  swing(): void { this.clip('whoosh', 0.7); }
  /** `volume` < 1 for a teammate's hit nearby (yours is full); `delay` lines the slap up with
   * the swatter reaching full extension. */
  swatHit(volume = 1, delay = 0): void { if (volume > 0.01 && this.gate('swat', 50)) this.clip('slap', 0.8 * volume, delay); }
  /** Just the first of the clip's three bursts. `volume` < 1 for a teammate's spray. */
  spray(volume = 1): void { if (volume > 0.01 && this.gate('spray', 90)) this.clip('spray', 0.7 * volume, 0, 1, [0, 0.2]); }
  /** Pitched up (with a little jitter) for a squeaky, kawaii pew. `volume` < 1 for a teammate's shot. */
  pew(volume = 1): void { if (volume > 0.01 && this.gate('pew', 60)) this.clip('pew', 0.7 * volume, 0, 1.6 + Math.random() * 0.2); }
  // `v` (0..1) on the world sounds below = distance falloff from the caller (sfx-falloff.ts).
  splash(v = 1): void { if (v > 0.01 && this.gate('splash', 70)) this.hiss(0.12, 1800, 0.14 * v, 2); }
  squish(v = 1): void { if (v > 0.01 && this.gate('squish', 60)) this.clip('squish', 1 * v, 0, 0.95 + Math.random() * 0.15); }
  /** Pitched up for a squeaky, kawaii "ow". Always yours, so no falloff. */
  hurt(): void { if (this.gate('hurt', 150)) this.clip('hurt', 0.9, 0, 1.4); }
  nom(v = 1): void {
    if (v > 0.01 && this.gate('nom', 420)) { this.tone(520, 260, 0.07, 'triangle', 0.1 * v); this.tone(480, 240, 0.07, 'triangle', 0.1 * v, 0.1); }
  }
  pickup(): void { this.clip('powerUp', 0.8); }
  checkpoint(v = 1): void {
    if (v > 0.01) { this.tone(660, 660, 0.12, 'triangle', 0.2 * v); this.tone(990, 990, 0.2, 'triangle', 0.2 * v, 0.12); }
  }
  cleared(v = 1): void { if (v > 0.01) { this.tone(300, 800, 0.2, 'triangle', 0.22 * v); this.hiss(0.2, 900, 0.15 * v); } }
  crash(v = 1): void { if (v > 0.01) { this.tone(120, 40, 0.35, 'sawtooth', 0.22 * v); this.hiss(0.35, 400, 0.3 * v, 0.6); } }
  buzz(v = 1): void { if (v > 0.01 && this.gate('buzz', 1800)) this.tone(170, 190, 0.5, 'sawtooth', 0.05 * v); }
  whistle(v = 1): void { if (v > 0.01) this.tone(900, 1100, 0.3, 'square', 0.16 * v); }
  respawn(): void { this.tone(330, 660, 0.25, 'sine', 0.18); }

  /** A ghost sobbing its way up to heaven: "hu-hu-hu… hoooOOooo". `volume` 0..1,
   * `delay` seconds (to land after the knock-out sting). */
  ghostCry(volume = 1, delay = 0): void {
    const ctx = this.ctx;
    const vol = gameSettings.get().sfxVolume * volume;
    if (!ctx || vol <= 0.01 || !this.gate('ghost', 400)) return;
    const t0 = ctx.currentTime + delay;
    // One wobbly "oo" voice: two slightly detuned triangles with vibrato, through
    // a resonant low-pass so it reads as a hollow, ghostly vowel.
    const voice = (at: number, dur: number, f0: number, f1: number, peak: number, wobble: number) => {
      const t = t0 + at;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(peak * vol, t + Math.min(0.06, dur * 0.3));
      out.gain.setValueAtTime(peak * vol, t + dur * 0.7);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 5;
      lp.connect(out).connect(ctx.destination);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(5.5, t);
      lfo.frequency.linearRampToValueAtTime(7.5, t + dur);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(f0 * wobble * 0.3, t);
      depth.gain.linearRampToValueAtTime(f0 * wobble, t + dur); // the wail gets shakier
      lfo.connect(depth);
      for (const detune of [0, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
        depth.connect(osc.frequency);
        osc.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.05);
      }
      lfo.start(t); lfo.stop(t + dur + 0.05);
    };
    // "hu-hu-hu" — three quick sobbing hiccups, each a little lower…
    voice(0.0, 0.16, 640, 540, 0.22, 0.02);
    voice(0.2, 0.16, 610, 510, 0.22, 0.02);
    voice(0.4, 0.18, 580, 480, 0.24, 0.02);
    // …then the long, wobbling, falling "hoooOOooo".
    voice(0.66, 1.6, 700, 250, 0.3, 0.06);
  }
}
