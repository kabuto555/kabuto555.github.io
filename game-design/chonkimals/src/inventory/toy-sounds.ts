// Toy sounds — one per ToySound preset, so a toy goes squeak / rattle / honk when it's played
// (Backpack, the HUD toy button, bots showing off). Presets with a recorded clip in CLIPS play
// that (fetched at load, decoded once audio unlocks); the rest — and any clip still loading —
// are tiny WebAudio synths. Toys never reuse the game's other sound clips (win / fail /
// minigame stingers), so a toy can't be mistaken for the moment that clip belongs to.

import { gameSettings } from '../game-settings';
import type { ToySound } from './items';

/** Recorded clips (and their loudness) for the presets that have one — each belongs to one toy. */
const CLIPS: Partial<Record<ToySound, { url: string; gain: number }>> = {
  kazoo:   { url: 'assets/toy-kazoo.mp3', gain: 0.8 },           // Kazoo
  whistle: { url: 'assets/toy-scout-whistle.mp3', gain: 0.7 },   // Scout Whistle
  dialup:  { url: 'assets/toy-dialup-walkie.mp3', gain: 0.8 },   // Dial-Up Walkie
  squeak:  { url: 'assets/toy-rubber-ducky.mp3', gain: 0.9 },    // Rubber Ducky
  scream:  { url: 'assets/toy-rubber-chicken.mp3', gain: 0.8 },  // Rubber Chicken
  slide:   { url: 'assets/toy-slide-whistle.mp3', gain: 0.8 },   // Slide Whistle
  bell:    { url: 'assets/toy-cowbell.mp3', gain: 0.8 },         // Cowbell
  honk:    { url: 'assets/toy-goose-honker.mp3', gain: 0.8 },    // Angry Goose Honker
  twang:   { url: 'assets/toy-jaw-harp.mp3', gain: 0.8 },        // Jaw Harp
  whirr:   { url: 'assets/toy-fidget-spinner.mp3', gain: 0.8 },  // Fidget Spinner
  fart:    { url: 'assets/toy-whoopee-cushion.mp3', gain: 0.9 }, // Whoopee Cushion
  ting:    { url: 'assets/toy-triangle.mp3', gain: 0.8 },        // Triangle
};

// Fetch now (no gesture needed); decode once there's an AudioContext.
const raw = new Map<ToySound, Promise<ArrayBuffer | null>>();
for (const [k, c] of Object.entries(CLIPS) as [ToySound, { url: string }][]) {
  raw.set(k, fetch(c.url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
}
const buffers = new Map<ToySound, AudioBuffer>();

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const c = ctx;
      for (const [k, p] of raw) {
        void p.then((data) => data && c.decodeAudioData(data.slice(0)))
          .then((buf) => { if (buf) buffers.set(k, buf); })
          .catch((e) => console.warn(`[toy-sounds] failed to decode ${CLIPS[k]?.url}`, e));
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Plays a decoded clip; false if it isn't ready (the caller synthesises instead). */
function clip(c: AudioContext, sound: ToySound, v: number): boolean {
  const buf = buffers.get(sound), def = CLIPS[sound];
  if (!buf || !def) return false;
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = buf;
  g.gain.value = def.gain * v;
  src.connect(g).connect(c.destination);
  src.start();
  return true;
}

function tone(c: AudioContext, f0: number, f1: number, dur: number, type: OscillatorType, gain: number, at = 0): OscillatorNode {
  const t = c.currentTime + at;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.015, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
  return osc;
}

function noise(c: AudioContext, dur: number, freq: number, gain: number, at = 0, q = 1): void {
  const t = c.currentTime + at;
  const n = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

/**
 * One oscillator voice with a pitch path — `pitch` is [time (s), Hz] points (ramped between) —
 * optional vibrato and band-pass filter, fading in fast and out over its length.
 */
function voice(c: AudioContext, o: {
  type: OscillatorType; pitch: [number, number][]; gain: number; at?: number;
  vibrato?: [number, number]; band?: [number, number];
}): void {
  const t = c.currentTime + (o.at ?? 0);
  const dur = o.pitch[o.pitch.length - 1][0];
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.pitch[0][1], t);
  for (const [at, f] of o.pitch.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + at);
  if (o.vibrato) {
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = o.vibrato[0]; depth.gain.value = o.vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + 0.02);
  g.gain.setValueAtTime(o.gain, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = osc;
  if (o.band) {
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = o.band[0]; f.Q.value = o.band[1];
    out = osc.connect(f);
  }
  out.connect(g).connect(c.destination);
  osc.start(t); osc.stop(t + dur + 0.05);
}

/** Plays a toy's sound; `volume` (0..1) scales it (bots far away are quieter). */
export function playToySound(sound: ToySound, volume = 1): void {
  const c = audio();
  const v = gameSettings.get().sfxVolume * volume;
  if (!c || v <= 0.01) return;
  if (clip(c, sound, v)) return;
  switch (sound) {
    case 'squeak': // rubber ducky: two rising squeezes
      tone(c, 900, 1500, 0.12, 'triangle', 0.25 * v);
      tone(c, 1000, 1700, 0.14, 'triangle', 0.25 * v, 0.16);
      break;
    case 'rattle':
      for (let i = 0; i < 6; i++) noise(c, 0.05, 4200, 0.3 * v, i * 0.055, 2);
      break;
    case 'kazoo': {
      const o = tone(c, 330, 392, 0.5, 'sawtooth', 0.12 * v);
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 7; depth.gain.value = 12;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(); lfo.stop(c.currentTime + 0.55);
      break;
    }
    case 'bell':
      tone(c, 880, 870, 0.9, 'sine', 0.22 * v);
      tone(c, 2200, 2180, 0.5, 'sine', 0.08 * v);
      break;
    case 'boing':
      tone(c, 180, 720, 0.35, 'sine', 0.3 * v);
      break;
    case 'drum':
      tone(c, 160, 50, 0.25, 'sine', 0.45 * v);
      noise(c, 0.08, 900, 0.2 * v);
      tone(c, 160, 50, 0.25, 'sine', 0.4 * v, 0.2);
      break;
    case 'chime':
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(c, f, f, 0.5, 'sine', 0.13 * v, i * 0.09));
      break;
    case 'whistle':
      tone(c, 1800, 2400, 0.18, 'sine', 0.18 * v);
      tone(c, 2400, 1700, 0.25, 'sine', 0.18 * v, 0.2);
      break;
    case 'scream': // rubber chicken: a strangled squawk that won't quit
      voice(c, { type: 'sawtooth', pitch: [[0, 520], [0.12, 1350], [0.6, 1250], [0.8, 820]], gain: 0.2 * v,
        vibrato: [16, 90], band: [1500, 2.5] });
      break;
    case 'slide': // slide whistle: wheee-ooo
      voice(c, { type: 'sine', pitch: [[0, 420], [0.38, 1700], [0.75, 520]], gain: 0.2 * v });
      break;
    case 'clap': // hand clapper: two woody clacks
      for (const at of [0, 0.15]) { noise(c, 0.05, 1900, 0.5 * v, at, 4); tone(c, 950, 700, 0.05, 'triangle', 0.15 * v, at); }
      break;
    case 'whirr': // fidget spinner: a buzzing whirr that winds down
      voice(c, { type: 'sawtooth', pitch: [[0, 140], [0.9, 70]], gain: 0.1 * v, vibrato: [34, 30], band: [420, 1.2] });
      break;
    case 'honk': // angry goose: HONK. HONK.
      for (const at of [0, 0.3]) voice(c, { type: 'square', pitch: [[0, 300], [0.22, 255]], gain: 0.16 * v, at, band: [1100, 1.8] });
      break;
    case 'recorder': { // squeaky recorder, hot-cross-buns grade, with the classic squeak at the end
      const notes: [number, number][] = [[659, 0], [587, 0.26], [523, 0.52], [659, 0.9], [587, 1.16], [1047, 1.42]];
      for (const [f, at] of notes) {
        voice(c, { type: 'triangle', pitch: [[0, f * 0.985], [0.22, f * (at > 1.4 ? 1.08 : 1.01)]], gain: 0.16 * v, at, vibrato: [5, 4] });
        noise(c, 0.12, f * 2, 0.04 * v, at, 3);
      }
      break;
    }
    case 'dialup': { // dial-up walkie: dial tones, then the handshake screech
      [[697, 1209], [770, 1336], [852, 1477]].forEach(([a, b], i) => {
        tone(c, a, a, 0.1, 'sine', 0.08 * v, i * 0.13); tone(c, b, b, 0.1, 'sine', 0.08 * v, i * 0.13);
      });
      voice(c, { type: 'sine', pitch: [[0, 1650], [0.25, 2250], [0.5, 1200], [0.8, 2100]], gain: 0.1 * v, at: 0.45, vibrato: [40, 300] });
      noise(c, 0.7, 2400, 0.12 * v, 0.55, 0.8);
      break;
    }
    case 'twang': // jaw harp: doyoyoing
      voice(c, { type: 'sawtooth', pitch: [[0, 112], [0.8, 108]], gain: 0.2 * v, band: [700, 6], vibrato: [7, 3] });
      voice(c, { type: 'sawtooth', pitch: [[0, 224], [0.8, 216]], gain: 0.06 * v, band: [1400, 5] });
      break;
    case 'fart': // whoopee cushion: a wet, low, wobbling brrrt
      voice(c, { type: 'sawtooth', pitch: [[0, 110], [0.3, 70]], gain: 0.25 * v, vibrato: [28, 25], band: [380, 1.5] });
      break;
    case 'ting': // triangle: one bright, shimmering ding
      [1760, 4230, 6540].forEach((f, i) => tone(c, f, f, 1.6 - i * 0.4, 'sine', (0.12 - i * 0.03) * v));
      break;
    case 'tiles': // a game box tipped out: wooden letter tiles clattering onto the ground
      for (let i = 0; i < 7; i++) {
        const at = i * 0.045 + Math.random() * 0.03;
        noise(c, 0.035, 2600 + Math.random() * 1400, 0.28 * v, at, 5);
        tone(c, 1300 + Math.random() * 500, 900, 0.03, 'triangle', 0.06 * v, at);
      }
      break;
    case 'dice': // dice shaken in a cup, then tumbling out: a rattle and a few hard clacks
      for (let i = 0; i < 6; i++) noise(c, 0.03, 3200 + Math.random() * 1200, 0.18 * v, i * 0.035 + Math.random() * 0.02, 3);
      for (const at of [0.3, 0.38, 0.45, 0.55, 0.62]) {
        const t = at + Math.random() * 0.04;
        noise(c, 0.025, 2200 + Math.random() * 900, 0.3 * v, t, 6);
        tone(c, 1700 + Math.random() * 400, 1200, 0.025, 'square', 0.04 * v, t);
      }
      break;
    case 'theremin': // spooky theremin: ooo-weee-ooo
      voice(c, { type: 'sine', pitch: [[0, 480], [0.45, 920], [0.9, 640], [1.3, 440]], gain: 0.18 * v, vibrato: [6, 22] });
      break;
  }
}

// Unlock audio (and decode the clips) on the first touch anywhere, so the first toy you play
// already has its recording ready.
window.addEventListener('pointerdown', () => { audio(); }, { once: true, capture: true });
