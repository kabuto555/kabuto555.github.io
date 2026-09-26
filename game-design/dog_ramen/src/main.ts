import { GAME_WIDTH, GAME_HEIGHT, COLORS, TEXT_STYLES, LEVEL_PARAMS, createGameConfig } from './config';
import { Tile, TileType, Direction, GameState, UndoEntry } from './types';

// ─── SFX ─────────────────────────────────────────────────────────────────────
// Procedural chiptune SFX via Web Audio API. No external files needed.

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

// ─── BGM ────────────────────────────────────────────────────────────
// Looping chiptune BGM — Blue Bird (Ikimono-gakari) inspired arrangement.
// A minor, 130 BPM, 8-bar loop. Pure Web Audio synthesis.

const BGM_BPM  = 130;
const BGM_BEAT = 60 / BGM_BPM;
const BGM_8TH  = BGM_BEAT / 2;
const BGM_16TH = BGM_BEAT / 4;
const BGM_BAR  = BGM_BEAT * 4;
const BGM_BARS = 8;
const BGM_LOOP = BGM_BAR * BGM_BARS;

// Frequencies — A minor scale
const A2=110, E3=165, A3=220, C4=262, D4=294, E4=330, F4=349, G4=392;
const A4=440, C5=523, D5=587, E5=659, F5=698, G5=784;

// Lead melody — iconic Blue Bird opening, 8 bars of 16th-note steps
// [freq, dur_in_16ths]
type NoteEvent = [number, number] | null;
const MELODY: NoteEvent[] = [
  // Bar 1:  E5 . D5 C5  D5 . E5 .   E5 . D5 C5  D5 . . .
  [E5,2],[D5,1],[C5,1], [D5,2],[E5,2],  [E5,2],[D5,1],[C5,1],  [D5,4],
  // Bar 2:  E5 . D5 C5  D5 E5 A5(A4oct) .   G4 . A4 .  C5 . . .
  [E5,2],[D5,1],[C5,1], [D5,1],[E5,1],[A4,2],  [G4,2],[A4,2],  [C5,4],
  // Bar 3:  C5 . D5 .   E5 . D5 C5  A4 . . .   C5 D5
  [C5,2],[D5,2],        [E5,2],[D5,1],[C5,1],  [A4,4],          [C5,2],[D5,2],
  // Bar 4:  E5 . . .   D5 C5 D5 .   E5 . D5 .  C5 . . .
  [E5,4],               [D5,1],[C5,1],[D5,2],  [E5,2],[D5,2],  [C5,4],
  // Bar 5 (variation): A4 C5 D5 E5  F5 . E5 .   D5 . C5 .  D5 . E5 .
  [A4,1],[C5,1],[D5,1],[E5,1], [F5,2],[E5,2],  [D5,2],[C5,2],  [D5,2],[E5,2],
  // Bar 6:  A4 . G4 .  A4 . C5 .   D5 . E5 .  D5 C5 A4 .
  [A4,2],[G4,2],        [A4,2],[C5,2],          [D5,2],[E5,2],  [D5,1],[C5,1],[A4,2],
  // Bar 7:  C5 D5 E5 .  G5 . F5 .   E5 . D5 .  C5 . . .
  [C5,1],[D5,1],[E5,2], [G5,2],[F5,2],           [E5,2],[D5,2],  [C5,4],
  // Bar 8 (cadence):  E5 . D5 C5  A4 . . .   A4 C5 D5 E5  A4 . . .
  [E5,2],[D5,1],[C5,1], [A4,4],                [A4,1],[C5,1],[D5,1],[E5,1], [A4,4],
];

interface SchedNote { step: number; freq: number; dur: number; }
function buildMelodySchedule(): SchedNote[] {
  const out: SchedNote[] = [];
  let pos = 0;
  for (const ev of MELODY) {
    if (ev) out.push({ step: pos, freq: ev[0], dur: ev[1] });
    pos += ev ? ev[1] : 2;
  }
  return out;
}
const MELODY_SCHED = buildMelodySchedule();

// Harmony voice — a third below the melody
// Am scale thirds: E5->C5, D5->B4(247), C5->A4, G5->E5, F5->D5, G4->E4
const THIRD_DOWN: {[k: number]: number} = {};
THIRD_DOWN[E5] = C5;  THIRD_DOWN[D5] = 247; THIRD_DOWN[C5] = A4;
THIRD_DOWN[G5] = E5;  THIRD_DOWN[F5] = D5;  THIRD_DOWN[G4] = E4; // v2
const HARMONY_SCHED: SchedNote[] = MELODY_SCHED.map(n => ({
  step: n.step,
  freq: THIRD_DOWN[n.freq] ?? n.freq * (5/6), // fallback: minor third down
  dur:  n.dur,
}));

// Counter-melody for bars 5-8 (B section) — upper voice a fifth above melody root
// Plays on long notes only (dur >= 2 steps), adds texture without cluttering
const B_SECTION_START = 16 * 4; // bar 5 starts at 16th-step 64
const COUNTER_SCHED: SchedNote[] = MELODY_SCHED
  .filter(n => n.step >= B_SECTION_START && n.dur >= 2)
  .map(n => ({
    step: n.step,
    freq: n.freq * (3/2) > G5 ? n.freq * (3/4) : n.freq * (3/2), // fifth up, octave-corrected
    dur:  Math.min(n.dur, 3),
  }));

// Chord pad schedule — sustained half-notes per chord block, triangle voice
// Am bars 1-2 & 5-6: A3 C4 E4 | G bars 3-4 & 7-8: G3 B3 D4 | F bars (not in loop): F3 A3 C4
const G3 = 196, B3 = 247;
interface PadNote { bar: number; freq: number; }
const PAD_NOTES: PadNote[] = [
  // Am (bars 0,1,4,5)
  ...[0,1,4,5].flatMap(b => [
    { bar: b, freq: A3 }, { bar: b, freq: C4 }, { bar: b, freq: E4 },
  ]),
  // G (bars 2,3,6,7)
  ...[2,3,6,7].flatMap(b => [
    { bar: b, freq: G3 }, { bar: b, freq: B3 }, { bar: b, freq: D4 },
  ]),
];

// Bass roots per bar (Am-G-F-G repeating)
const G3_BASS = 196, F3_BASS = 175;
const BASS_ROOTS = [A2, G3_BASS, F3_BASS, G3_BASS, A2, G3_BASS, F3_BASS, G3_BASS];

let _bgmGain: GainNode | null = null;
let _bgmTimer: ReturnType<typeof setInterval> | null = null;
let _bgmLoopStart = 0;    // AudioContext time of next loop start
let _bgmRunning = false;

const bgm = {
  get gain(): GainNode {
    if (!_bgmGain) {
      const ctx = getAudioCtx();
      _bgmGain = ctx.createGain();
      _bgmGain.gain.setValueAtTime(0.18, ctx.currentTime);
      _bgmGain.connect(ctx.destination);
    }
    return _bgmGain;
  },

  /** Schedule one full loop of notes starting at audioTime `loopAt`. */
  _scheduleLoop(loopAt: number): void {
    try {
      const ctx = getAudioCtx();
      const g = this.gain;

      // Square wave — lead melody voice
      const sq = (freq: number, t: number, dur: number, vol: number) => {
        const o = ctx.createOscillator();
        const gn = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, t);
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(vol, t + 0.010);
        gn.gain.setValueAtTime(vol * 0.65, t + dur * 0.55);
        gn.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(gn); gn.connect(g);
        o.start(t); o.stop(t + dur + 0.01);
      };

      // Triangle wave — bass and inner harmony
      const tri = (freq: number, t: number, dur: number, vol: number) => {
        const o = ctx.createOscillator();
        const gn = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t);
        gn.gain.setValueAtTime(vol, t);
        gn.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(gn); gn.connect(g);
        o.start(t); o.stop(t + dur + 0.01);
      };

      // Hi-hat tick
      const hat = (t: number, vol: number) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.04), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        const gn = ctx.createGain();
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass'; flt.frequency.value = 7000;
        src.buffer = buf;
        gn.gain.setValueAtTime(vol, t);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        src.connect(flt); flt.connect(gn); gn.connect(g);
        src.start(t); src.stop(t + 0.05);
      };

      // --- Lead melody (square, main voice) ---
      for (const note of MELODY_SCHED) {
        const t = loopAt + note.step * BGM_16TH;
        const dur = note.dur * BGM_16TH * 0.90;
        sq(note.freq, t, dur, 0.11);
      }

      // --- Harmony voice (triangle, third below melody) ---
      for (const note of HARMONY_SCHED) {
        const t = loopAt + note.step * BGM_16TH;
        const dur = note.dur * BGM_16TH * 0.85;
        tri(note.freq, t, dur, 0.07);
      }

      // --- Counter-melody B section (triangle, bars 5-8, fifth above) ---
      for (const note of COUNTER_SCHED) {
        const t = loopAt + note.step * BGM_16TH;
        const dur = note.dur * BGM_16TH * 0.80;
        tri(note.freq, t, dur, 0.06);
      }

      // --- Chord pads (triangle, sustained half-notes per bar) ---
      for (const pad of PAD_NOTES) {
        const bt = loopAt + pad.bar * BGM_BAR;
        // Two half-notes per bar
        tri(pad.freq, bt,                BGM_BEAT * 1.9, 0.04);
        tri(pad.freq, bt + BGM_BEAT * 2, BGM_BEAT * 1.9, 0.04);
      }

      // --- Bass (triangle, quarter notes, follows chord root) ---
      for (let bar = 0; bar < BGM_BARS; bar++) {
        const root = BASS_ROOTS[bar];
        const bt = loopAt + bar * BGM_BAR;
        tri(root, bt,                   BGM_BEAT * 0.85, 0.14);
        tri(root, bt + BGM_BEAT,        BGM_BEAT * 0.80, 0.09);
        tri(root, bt + BGM_BEAT * 2,    BGM_BEAT * 0.85, 0.11);
        tri(root, bt + BGM_BEAT * 3,    BGM_BEAT * 0.80, 0.09);
      }

      // --- Inner chord arpeggio ---
      const arps: number[][][] = [
        [[A3,C4,E4,A4], [A3,C4,E4,A4]],
        [[196,294,392,196*2],[196,294,392,196*2]],
        [[175,262,349,262],[175,262,349,262]],
        [[196,294,392,196*2],[196,294,392,196*2]],
      ];
      for (let bar = 0; bar < BGM_BARS; bar++) {
        const arpIdx = Math.floor(bar / 2);
        const barInPair = bar % 2;
        const tones = arps[arpIdx][barInPair];
        for (let beat = 0; beat < 4; beat++) {
          const bt = loopAt + bar * BGM_BAR + beat * BGM_BEAT;
          tones.forEach((f, i) => {
            tri(f, bt + i * BGM_8TH * 0.5, BGM_8TH * 0.45, 0.05);
          });
        }
      }

      // --- Percussion ---
      // Kick: low sine thud on beats 1 & 3
      const kick = (t: number) => {
        const o = ctx.createOscillator();
        const gn = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        gn.gain.setValueAtTime(0.30, t);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(gn); gn.connect(g);
        o.start(t); o.stop(t + 0.20);
      };
      // Snare: bandpass noise burst on beats 2 & 4
      const snare = (t: number) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const flt = ctx.createBiquadFilter();
        flt.type = 'bandpass'; flt.frequency.value = 1800; flt.Q.value = 0.8;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0.18, t);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.buffer = buf;
        src.connect(flt); flt.connect(gn); gn.connect(g);
        src.start(t); src.stop(t + 0.13);
      };
      for (let bar = 0; bar < BGM_BARS; bar++) {
        const bt = loopAt + bar * BGM_BAR;
        kick(bt);                    // beat 1
        snare(bt + BGM_BEAT);        // beat 2
        kick(bt + BGM_BEAT * 2);     // beat 3
        snare(bt + BGM_BEAT * 3);    // beat 4
      }

      // --- Hi-hat (8th-note pulse, accent on downbeats) ---
      const totalHats = BGM_BARS * 8;
      for (let s = 0; s < totalHats; s++) {
        hat(loopAt + s * BGM_8TH, s % 2 === 0 ? 0.040 : 0.018);
      }
    } catch (_) {}
  },

  play(): void {
    if (_bgmRunning) return;
    _bgmRunning = true;
    try {
      const ctx = getAudioCtx();
      _bgmLoopStart = ctx.currentTime + 0.05;
      this._scheduleLoop(_bgmLoopStart);
      // Pre-schedule a second loop so there's no gap on first wrap
      this._scheduleLoop(_bgmLoopStart + BGM_LOOP);

      // Rolling scheduler: every 4s, check if we need to schedule the next loop
      _bgmTimer = setInterval(() => {
        if (!_bgmRunning) return;
        try {
          const now = getAudioCtx().currentTime;
          // How many loops have elapsed?
          const elapsed = now - _bgmLoopStart;
          const loopsElapsed = Math.floor(elapsed / BGM_LOOP);
          // Schedule lookahead: 2 loops from now
          const nextLoop = _bgmLoopStart + (loopsElapsed + 2) * BGM_LOOP;
          // Only schedule if we haven't already (within 1 loop ahead)
          if (nextLoop - now < BGM_LOOP * 1.5) {
            this._scheduleLoop(nextLoop);
          }
        } catch (_) {}
      }, 4000);
    } catch (_) {}
  },

  stop(): void {
    _bgmRunning = false;
    if (_bgmTimer !== null) { clearInterval(_bgmTimer); _bgmTimer = null; }
    // Fade out
    try {
      const ctx = getAudioCtx();
      if (_bgmGain) {
        _bgmGain.gain.cancelScheduledValues(ctx.currentTime);
        _bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      }
    } catch (_) {}
  },

  /** Duck the BGM during the win jingle then restore. */
  duck(duckDur: number): void {
    try {
      const ctx = getAudioCtx();
      if (!_bgmGain) return;
      const now = ctx.currentTime;
      _bgmGain.gain.cancelScheduledValues(now);
      _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, now);
      _bgmGain.gain.linearRampToValueAtTime(0.04, now + 0.08);   // duck fast
      _bgmGain.gain.setValueAtTime(0.04, now + duckDur - 0.20);  // hold
      _bgmGain.gain.linearRampToValueAtTime(0.18, now + duckDur + 0.40); // restore
    } catch (_) {}
  },
};

const sfx = {
  /** Short ascending blip — dog steps onto a tile */
  step() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(780, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);
    } catch (_) {}
  },

  /** Low descending buzz — invalid move */
  invalid() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.10);
      gain.gain.setValueAtTime(0.20, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.13);
    } catch (_) {}
  },

  /** Capcom SNES-style stage clear jingle */
  win() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // Helper: play one square-wave note
      const sq = (freq: number, start: number, dur: number, vol: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(vol, start + 0.008); // snappy attack
        g.gain.setValueAtTime(vol, start + dur - 0.02);
        g.gain.linearRampToValueAtTime(0, start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(start); o.stop(start + dur);
      };

      // Helper: triangle (warmer, used for bass)
      const tri = (freq: number, start: number, dur: number, vol: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(vol, start);
        g.gain.linearRampToValueAtTime(0, start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(start); o.stop(start + dur);
      };

      // Helper: noise burst (hi-hat / cymbal crash)
      const noise = (start: number, dur: number, vol: number) => {
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass';
        flt.frequency.setValueAtTime(4000, start);
        src.buffer = buf;
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        src.connect(flt); flt.connect(g); g.connect(ctx.destination);
        src.start(start); src.stop(start + dur);
      };

      // --- Beat 0: BIG chord stab (C major, 3 voices + bass) ---
      sq(1047, now,        0.18, 0.16); // C6 lead
      sq( 784, now,        0.18, 0.13); // G5 harmony
      sq( 659, now,        0.18, 0.11); // E5 harmony
      tri( 262, now,       0.22, 0.18); // C4 bass
      noise(now,           0.12, 0.10); // snare hit

      // --- Beat 1 (t=0.20): melody run up ---
      // C5 D5 E5 G5  (Capcom punchy ascending run)
      const run = [523, 587, 659, 784, 880, 1047];
      const step = 0.10;
      run.forEach((f, i) => {
        const t = now + 0.20 + i * step;
        sq(f, t, step * 0.85, 0.15);
        if (i === 0) tri(f / 2, t, step * 0.9, 0.12); // bass follows root
      });

      // --- Final note (t=0.82): held high C with vibrato ---
      const finT = now + 0.20 + run.length * step;
      const finO = ctx.createOscillator();
      const finG = ctx.createGain();
      finO.type = 'square';
      finO.frequency.setValueAtTime(1047, finT);
      // Vibrato: ±18Hz at 6Hz
      const vibLFO = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vibLFO.frequency.setValueAtTime(6, finT);
      vibGain.gain.setValueAtTime(18, finT);
      vibLFO.connect(vibGain);
      vibGain.connect(finO.frequency);
      vibLFO.start(finT); vibLFO.stop(finT + 0.55);
      finG.gain.setValueAtTime(0.16, finT);
      finG.gain.setValueAtTime(0.16, finT + 0.30);
      finG.gain.linearRampToValueAtTime(0, finT + 0.55);
      finO.connect(finG); finG.connect(ctx.destination);
      finO.start(finT); finO.stop(finT + 0.55);
      // Crash cymbal on final note
      noise(finT, 0.35, 0.14);
      tri(262, finT, 0.40, 0.16); // bass thud
    } catch (_) {}
  },

  /** Title screen confirm — Capcom-style two-note dun-DUN */
  start() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // Low hit: square C3, punchy
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = 'square';
      o1.frequency.setValueAtTime(131, now);
      g1.gain.setValueAtTime(0, now);
      g1.gain.linearRampToValueAtTime(0.22, now + 0.008);
      g1.gain.linearRampToValueAtTime(0, now + 0.10);
      o1.connect(g1); g1.connect(ctx.destination);
      o1.start(now); o1.stop(now + 0.10);

      // High hit: C4 + E4 + G4 chord (major triad), square + triangle
      const chord = [262, 330, 392];
      chord.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i === 0 ? 'square' : 'triangle';
        o.frequency.setValueAtTime(freq, now + 0.11);
        g.gain.setValueAtTime(0, now + 0.11);
        g.gain.linearRampToValueAtTime(i === 0 ? 0.18 : 0.10, now + 0.118);
        g.gain.linearRampToValueAtTime(0, now + 0.32);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + 0.11); o.stop(now + 0.32);
      });
    } catch (_) {}
  },

  /** Descending mirror of step() — undo a move */
  undo() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(780, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(520, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);
    } catch (_) {}
  },

  /** Watery plunk — ramen tile sinks into broth */
  sink() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } catch (_) {}
  },
};

// ─── Module-level state ───────────────────────────────────────────────────────
let scene: Phaser.Scene;
let rexUI: any;
let gs: GameState;

// Display objects
let playerContainer: Phaser.GameObjects.Container;
let tileContainers: Phaser.GameObjects.Container[][] = [];
let startHandleObj: Phaser.GameObjects.Container;
let endHandleObj:   Phaser.GameObjects.Container;
let hudRamenText: Phaser.GameObjects.Text;
let hudLevelText: Phaser.GameObjects.Text;
let hintPanel: Phaser.GameObjects.Container | null = null;
let overlayContainer: Phaser.GameObjects.Container | null = null;
let bubbleTimers: Phaser.Time.TimerEvent[] = [];
let boardContainer: Phaser.GameObjects.Container;

// Swipe tracking
let swipeStartX = 0;
let swipeStartY = 0;
const SWIPE_THRESHOLD = 30;

// ─── Grid Clone Helpers ─────────────────────────────────────────────────────────

/** Deep-clone a grid so mutations to one don’t affect the other. */
function cloneGrid(grid: Tile[][]): Tile[][] {
  return grid.map(row => row.map(tile => ({ ...tile })));
}

/** Snapshot just the per-cell states (cheap for undo stack). */
function snapshotStates(grid: Tile[][]): string[][] {
  return grid.map(row => row.map(tile => tile.state));
}

/** Restore cell states from a snapshot. */
function restoreStates(grid: Tile[][], states: string[][]): void {
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      (grid[r][c] as any).state = states[r][c];
}

// ─── Level Generator ──────────────────────────────────────────────────────────

function getLevelParams(level: number) {
  const idx = Math.min(level - 1, LEVEL_PARAMS.length - 1);
  return LEVEL_PARAMS[idx];
}

/**
 * Backward-step generator:
 * 1. Walk BACKWARDS from (midRow, gridSize-1) — the last in-grid cell before the exit.
 * 2. Every cell in the backward walk becomes a ramen tile.
 * 3. Once we have >= ramenCount cells, steer back home to (midRow, 0).
 * 4. Reverse the walk to produce the forward solution.
 * 5. Scatter stone tiles off-path for decoration.
 */

const DIRS: Array<{ dr: number; dc: number; dir: Direction }> = [
  { dr: -1, dc:  0, dir: 'up'    },
  { dr:  1, dc:  0, dir: 'down'  },
  { dr:  0, dc: -1, dir: 'left'  },
  { dr:  0, dc:  1, dir: 'right' },
];

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};

// Hashes of every layout that has already been played this session.
// Prevents duplicate levels from appearing back-to-back or later in the run.
const seenLevelHashes = new Set<string>();

/** Cheap deterministic hash of a grid's tile types. */
function levelHash(grid: Tile[][]): string {
  return grid.map(row => row.map(t => t.type[0]).join('')).join('|');
}

function generateLevel(level: number): { grid: Tile[][]; solution: Direction[] } {
  const p = getLevelParams(level);
  const { gridSize, ramenCount, stoneCount } = p;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const result = tryGenerateLevel(gridSize, ramenCount, stoneCount);
    if (!result) continue;
    const hash = levelHash(result.grid);
    if (seenLevelHashes.has(hash)) continue;  // duplicate — try again
    seenLevelHashes.add(hash);
    return result;
  }
  return fallbackLevel(gridSize);
}

function tryGenerateLevel(
  gridSize: number, ramenCount: number, stoneCount: number,
): { grid: Tile[][]; solution: Direction[] } | null {

  const midCol = Math.floor(gridSize / 2);

  // Strategy: pick stone cells before walk, spread across whole grid.
  const preStones = new Set<string>();
  if (stoneCount > 0) {
    const candidates = pickSpreadStones(gridSize, stoneCount, midCol);
    for (const key of candidates) preStones.add(key);
  }

  // Backward walk from (gridSize-1, midCol) toward (0, midCol).
  // Forward solution will go top-to-bottom: entry top handle -> exit bottom handle.

  const ramenVisited = new Set<string>();
  const stoneOnPath  = new Set<string>();

  let r = gridSize - 1;
  let c = midCol;
  ramenVisited.add(`${r},${c}`);
  if (preStones.has(`${r},${c}`)) stoneOnPath.add(`${r},${c}`);

  const backCells: Array<{r: number; c: number}> = [{ r, c }];
  const backMoves: Direction[] = [];
  let ramenCollected = stoneOnPath.has(`${r},${c}`) ? 0 : 1;

  const MAX_STEPS = gridSize * gridSize * 6;

  for (let step = 0; step < MAX_STEPS; step++) {

    // Phase A: enough ramen, route home to (0, midCol)
    if (ramenCollected >= ramenCount) {
      if (r === 0 && c === midCol) break;

      const homeOrder: Array<{ dr: number; dc: number; dir: Direction }> = [];
      if (c > midCol) homeOrder.push({ dr: 0, dc: -1, dir: 'left' });
      if (c < midCol) homeOrder.push({ dr: 0, dc:  1, dir: 'right' });
      homeOrder.push(...[...DIRS].filter(d => d.dir === 'up' || d.dir === 'down'));
      homeOrder.push(...[...DIRS].filter(d => d.dir === 'left' || d.dir === 'right'));

      let moved = false;
      for (const { dr: dr2, dc: dc2, dir: dir2 } of homeOrder) {
        const nr = r + dr2;
        const nc = c + dc2;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const key = `${nr},${nc}`;
        // Can step on: unvisited, or pre-stone (re-enterable)
        const isBlockedRamen = ramenVisited.has(key) && !stoneOnPath.has(key) && !preStones.has(key);
        if (isBlockedRamen) continue;
        if (!ramenVisited.has(key)) {
          ramenVisited.add(key);
          if (preStones.has(key)) {
            stoneOnPath.add(key); // walked into a pre-stone
          } else {
            ramenCollected++;
          }
        }
        backCells.push({ r: nr, c: nc });
        backMoves.push(dir2);
        r = nr; c = nc;
        moved = true;
        break;
      }
      if (!moved) return null;
      continue;
    }

    // Phase B: collect ramen
    const shuffled = [...DIRS].sort(() => Math.random() - 0.5);
    const unvisited:  Array<{ nr: number; nc: number; dir: Direction }> = [];
    const reentrable: Array<{ nr: number; nc: number; dir: Direction }> = []; // pre-stones already visited
    const blocked:    Array<{ nr: number; nc: number; dir: Direction }> = []; // consumed ramen

    for (const { dr: dr2, dc: dc2, dir: dir2 } of shuffled) {
      const nr = r + dr2;
      const nc = c + dc2;
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
      const key = `${nr},${nc}`;
      if (!ramenVisited.has(key)) {
        unvisited.push({ nr, nc, dir: dir2 });
      } else if (stoneOnPath.has(key)) {
        reentrable.push({ nr, nc, dir: dir2 }); // already confirmed stone
      } else {
        blocked.push({ nr, nc, dir: dir2 }); // consumed ramen — can't re-enter
      }
    }

    let moved = false;

    // Priority 1: step onto an unvisited pre-stone cell (confirms it as stone, free re-entry later)
    if (!moved) {
      for (const nb of unvisited) {
        if (preStones.has(`${nb.nr},${nb.nc}`)) {
          ramenVisited.add(`${nb.nr},${nb.nc}`);
          stoneOnPath.add(`${nb.nr},${nb.nc}`);
          backCells.push({ r: nb.nr, c: nb.nc });
          backMoves.push(nb.dir);
          r = nb.nr; c = nb.nc;
          moved = true;
          break;
        }
      }
    }

    // Priority 2: re-enter an already-confirmed stone neighbour (40% chance, keeps loops active)
    if (!moved && reentrable.length > 0 && unvisited.length > 0 && Math.random() < 0.4) {
      const pick = reentrable[Math.floor(Math.random() * reentrable.length)];
      backCells.push({ r: pick.nr, c: pick.nc });
      backMoves.push(pick.dir);
      r = pick.nr; c = pick.nc;
      moved = true;
    }

    // Priority 3: step onto any unvisited neighbour (normal ramen collection)
    if (!moved && unvisited.length > 0) {
      const pick = unvisited[0];
      ramenVisited.add(`${pick.nr},${pick.nc}`);
      if (preStones.has(`${pick.nr},${pick.nc}`)) {
        stoneOnPath.add(`${pick.nr},${pick.nc}`);
      } else {
        ramenCollected++;
      }
      backCells.push({ r: pick.nr, c: pick.nc });
      backMoves.push(pick.dir);
      r = pick.nr; c = pick.nc;
      moved = true;
    }

    // Priority 4: re-enter confirmed stone (last resort when all neighbours visited)
    if (!moved && reentrable.length > 0) {
      const pick = reentrable[0];
      backCells.push({ r: pick.nr, c: pick.nc });
      backMoves.push(pick.dir);
      r = pick.nr; c = pick.nc;
      moved = true;
    }

    if (!moved) return null;
  }

  if (r !== 0 || c !== midCol) return null;
  if (ramenCollected < ramenCount) return null;

  // Forward solution: enter 'down' from top handle, reverse backward walk, exit 'down' to bottom handle
  const forwardMoves: Direction[] = ['down'];
  for (let i = backMoves.length - 1; i >= 0; i--) {
    forwardMoves.push(OPPOSITE[backMoves[i]]);
  }
  forwardMoves.push('down');

  // Build grid
  const grid: Tile[][] = [];
  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      grid[row][col] = { type: 'broth', state: 'active', row, col };
    }
  }
  for (const key of ramenVisited) {
    const [kr, kc] = key.split(',').map(Number);
    grid[kr][kc].type = stoneOnPath.has(key) ? 'stone' : 'ramen';
  }

  return { grid, solution: forwardMoves };
}

/**
 * Pick stoneCount cells spread evenly across the grid.
 * Divides the grid into a stoneCount-sized set of regions and picks one
 * random cell per region, ensuring spatial spread.
 * Avoids (midRow, 0) and (midRow, gridSize-1) which are entry/exit cells.
 */
function pickSpreadStones(gridSize: number, stoneCount: number, midCol: number): string[] {
  // Collect all interior cells, excluding the entry/exit cells
  const all: Array<{r: number; c: number}> = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (c === midCol && (r === 0 || r === gridSize - 1)) continue;
      all.push({ r, c });
    }
  }

  // Shuffle the full list
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  // Pick stoneCount cells with minimum distance enforcement
  // min distance = floor(gridSize / 2) so stones are spread across the grid
  const minDist = Math.max(2, Math.floor(gridSize / 2));
  const chosen: Array<{r: number; c: number}> = [];

  for (const cell of all) {
    if (chosen.length >= stoneCount) break;
    // Check distance to all already-chosen stones
    const tooClose = chosen.some(other =>
      Math.abs(other.r - cell.r) + Math.abs(other.c - cell.c) < minDist
    );
    if (!tooClose) chosen.push(cell);
  }

  // If strict minDist produced too few, relax to minDist=2 and fill up
  if (chosen.length < stoneCount) {
    for (const cell of all) {
      if (chosen.length >= stoneCount) break;
      const key = `${cell.r},${cell.c}`;
      if (chosen.some(o => o.r === cell.r && o.c === cell.c)) continue;
      const tooClose = chosen.some(other =>
        Math.abs(other.r - cell.r) + Math.abs(other.c - cell.c) < 2
      );
      if (!tooClose) chosen.push(cell);
    }
  }

  return chosen.map(({ r, c }) => `${r},${c}`);
}
function fallbackLevel(gridSize: number): { grid: Tile[][]; solution: Direction[] } {
  const midCol = Math.floor(gridSize / 2);
  const grid: Tile[][] = [];
  for (let r = 0; r < gridSize; r++) {
    grid[r] = [];
    for (let c = 0; c < gridSize; c++) {
      grid[r][c] = { type: c === midCol ? 'ramen' : 'broth', state: 'active', row: r, col: c };
    }
  }
  const solution: Direction[] = [];
  for (let i = 0; i <= gridSize; i++) solution.push('down');
  return { grid, solution };
}

// ─── Tile Size Helper ─────────────────────────────────────────────────────────

function getTileSize(gridSize: number): number {
  // Fit grid into available square area.
  // Board sits in the middle: HUD (120px) + top handle (80px) + pot + bottom handle (80px) + controls (340px)
  // Available height ~ GAME_HEIGHT - 120 - 80 - 80 - 340 - 80 (padding) = GAME_HEIGHT - 700
  const maxByHeight = Math.floor((GAME_HEIGHT - 700) / gridSize);
  const maxByWidth  = Math.floor((GAME_WIDTH - 80) / gridSize);
  return Math.min(maxByHeight, maxByWidth, 120);
}

// ─── Board Origin Helper ──────────────────────────────────────────────────────

function getBoardOrigin(gridSize: number): { ox: number; oy: number } {
  const ts = getTileSize(gridSize);
  const boardPx = ts * gridSize;
  const ox = (GAME_WIDTH - boardPx) / 2;
  // Top of board: below HUD (120px) + top handle area (90px)
  const oy = 210;
  return { ox, oy };
}

// ─── Phaser Scene ─────────────────────────────────────────────────────────────

function create(this: Phaser.Scene): void {
  scene = this;
  rexUI = (this as any).rexUI;

  drawBackground();
  buildHUD();
  setupInput();
  showTitleScreen();
}

function update(this: Phaser.Scene): void {
  // Intentionally empty — all logic is event/input driven
}

// ─── Background ───────────────────────────────────────────────────────────────

function drawBackground(): void {
  const bg = scene.add.graphics();
  bg.fillGradientStyle(
    COLORS.bg.secondary, COLORS.bg.secondary,
    COLORS.bg.primary,   COLORS.bg.primary, 1
  );
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Floating ramen ingredients drifting through the broth
  const ingredientCount = 22;
  for (let i = 0; i < ingredientCount; i++) {
    spawnIngredient();
  }
}

/** Draw and animate one random floating ramen ingredient. */
function spawnIngredient(): void {
  const x = Phaser.Math.Between(30, GAME_WIDTH - 30);
  const y = Phaser.Math.Between(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.88);
  const type = Phaser.Math.Between(0, 7);
  const g = scene.add.graphics();
  g.x = x;
  g.y = y;
  g.alpha = Phaser.Math.FloatBetween(0.18, 0.38);
  drawIngredient(g, type);

  const rise = Phaser.Math.Between(40, 130);
  const dur  = Phaser.Math.Between(4000, 9000);
  const delay = Phaser.Math.Between(0, 4000);

  scene.tweens.add({
    targets: g,
    y: y - rise,
    angle: Phaser.Math.Between(-20, 20),
    alpha: 0,
    duration: dur,
    delay,
    ease: 'Sine.easeIn',
    loop: -1,
    onLoop: () => {
      g.y = y + Phaser.Math.Between(0, 60);
      g.angle = 0;
      g.alpha = Phaser.Math.FloatBetween(0.18, 0.38);
    },
  });
}

/**
 * Draw a mini ramen ingredient graphic centred at (0,0).
 * type: 0=nori, 1=narutomaki, 2=chashu, 3=ajitama egg,
 *       4=bamboo shoot, 5=scallion, 6=mushroom, 7=broth bubble
 */
function drawIngredient(g: Phaser.GameObjects.Graphics, type: number): void {
  switch (type) {
    case 0: { // Nori (dark green rectangle with lighter vein lines)
      g.fillStyle(0x1a3a1a, 1);
      g.fillRoundedRect(-14, -9, 28, 18, 3);
      g.lineStyle(1, 0x2d6b2d, 0.6);
      g.lineBetween(-9, -9, -9, 9);
      g.lineBetween(0, -9, 0, 9);
      g.lineBetween(9, -9, 9, 9);
      g.lineBetween(-14, -3, 14, -3);
      g.lineBetween(-14, 3, 14, 3);
      break;
    }
    case 1: { // Narutomaki (white circle with pink swirl)
      g.fillStyle(0xfff5f5, 1);
      g.fillCircle(0, 0, 12);
      g.fillStyle(0xff8888, 1);
      // Pink swirl: two arcs approximated by filled points
      g.fillEllipse(0, 0, 6, 20); // vertical pink bar
      g.lineStyle(1.5, 0xffaaaa, 0.8);
      g.strokeCircle(0, 0, 12);
      break;
    }
    case 2: { // Chashu pork (oval slice with grain lines)
      g.fillStyle(0xc46040, 1);
      g.fillEllipse(0, 0, 28, 18);
      g.fillStyle(0xe8906a, 0.6);
      g.fillEllipse(-2, -2, 18, 10);
      g.lineStyle(1, 0x8a2800, 0.5);
      g.lineBetween(-8, 4, 8, 4);
      g.lineBetween(-6, 7, 6, 7);
      break;
    }
    case 3: { // Ajitsuke tamago (halved soft egg, golden yolk)
      g.fillStyle(0xfff8e0, 1);
      g.fillEllipse(0, 0, 22, 26);
      g.fillStyle(0xf5b800, 1);
      g.fillCircle(0, 2, 7);
      g.lineStyle(1.5, 0xe8c878, 0.6);
      g.strokeEllipse(0, 0, 22, 26);
      break;
    }
    case 4: { // Menma bamboo shoot (pale yellow rectangle with ridges)
      g.fillStyle(0xe8d898, 1);
      g.fillRoundedRect(-7, -14, 14, 28, 3);
      g.lineStyle(1, 0xb8a858, 0.7);
      for (let i = -10; i <= 10; i += 5) {
        g.lineBetween(-7, i, 7, i);
      }
      break;
    }
    case 5: { // Scallion / negi (small green circles cluster)
      g.fillStyle(0x4a8a2a, 1);
      for (let i = -2; i <= 2; i++) {
        g.fillCircle(i * 5, i % 2 === 0 ? -3 : 3, 4);
      }
      g.lineStyle(1, 0x2d5a1a, 0.5);
      g.lineBetween(-14, 0, 14, 0);
      break;
    }
    case 6: { // Shiitake mushroom (brown cap with gills)
      g.fillStyle(0x7a4a28, 1);
      g.fillEllipse(0, -4, 24, 14);
      g.fillStyle(0xd4a878, 1);
      g.fillEllipse(0, 2, 18, 8);
      g.lineStyle(1, 0x5a3010, 0.6);
      g.lineBetween(-7, 2, -7, 8);
      g.lineBetween(0, 2, 0, 8);
      g.lineBetween(7, 2, 7, 8);
      break;
    }
    default: { // Broth bubble (keep some plain bubbles)
      const r = Phaser.Math.Between(4, 11);
      g.fillStyle(COLORS.broth.bubble, 0.7);
      g.fillCircle(0, 0, r);
      g.lineStyle(1, 0xffffff, 0.3);
      g.strokeCircle(0, 0, r);
      break;
    }
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function buildHUD(): void {
  hudLevelText = scene.add.text(40, 48, 'Level 1', TEXT_STYLES.hud).setOrigin(0, 0.5);
  hudRamenText = scene.add.text(GAME_WIDTH - 40, 48, '🍜 0/0', TEXT_STYLES.hud).setOrigin(1, 0.5);
  hudLevelText.setDepth(20);
  hudRamenText.setDepth(20);
}

function updateHUD(): void {
  if (!gs) return;
  hudLevelText.setText(`Level ${gs.level}`);
  hudRamenText.setText(`🍜 ${gs.ramenCleared}/${gs.ramenTotal}`);
}

// ─── Input ────────────────────────────────────────────────────────────────────

function setupInput(): void {
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    swipeStartX = p.x;
    swipeStartY = p.y;
  });

  scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!gs || gs.phase !== 'playing') return;
    const dx = p.x - swipeStartX;
    const dy = p.y - swipeStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;
    let dir: Direction;
    if (adx > ady) dir = dx > 0 ? 'right' : 'left';
    else           dir = dy > 0 ? 'down'  : 'up';
    handleMove(dir);
  });

  // Also keyboard for desktop testing
  scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
    if (!gs || gs.phase !== 'playing') return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    if (map[e.key]) handleMove(map[e.key]);
    if (e.key === 'f' || e.key === 'F') handleUndo();
    if (e.key === ' ') retryLevel();
  });
}

// ─── Title Screen ─────────────────────────────────────────────────────────────

function showTitleScreen(): void {
  clearOverlay();
  const items: Phaser.GameObjects.GameObject[] = [];
  const cx = GAME_WIDTH / 2;

  // ── Full-screen gradient panel ─────────────────────────────────────
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x1a0a00, 0x1a0a00, 0x3d1a00, 0x3d1a00, 1);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  items.push(bg);

  // Scanline overlay (SNES feel)
  const scan = scene.add.graphics();
  for (let y = 0; y < GAME_HEIGHT; y += 4) {
    scan.fillStyle(0x000000, 0.08);
    scan.fillRect(0, y, GAME_WIDTH, 2);
  }
  items.push(scan);

  // ── Giant ghost Doge face in background ────────────────────────────────
  // Full drawShiba at giant scale, fully opaque — centrepiece of title
  const dogeG = scene.add.graphics();
  dogeG.alpha = 1;
  dogeG.x = cx;
  dogeG.y = GAME_HEIGHT * 0.44;
  drawShiba(dogeG, 310, true);
  items.push(dogeG);
  // Gentle slow breathing pulse
  scene.tweens.add({
    targets: dogeG,
    scaleX: 1.04, scaleY: 1.04,
    duration: 3200,
    yoyo: true,
    loop: -1,
    ease: 'Sine.easeInOut',
  });

  // ── Eye overlay graphics that follow the mouse cursor ──
  // These sit on top of the baked dogeG eyes and shift toward the pointer.
  const dogeY  = GAME_HEIGHT * 0.44;
  const r      = 310;
  const irisR  = r * 0.12;   // iris radius
  const pupilR = r * 0.07;   // pupil radius
  const maxShift = r * 0.05; // max distance pupils travel from rest position

  // Rest positions of the two iris centres in world space
  const eyeRestL = { x: cx - r * 0.32, y: dogeY - r * 0.20 };
  const eyeRestR = { x: cx + r * 0.32, y: dogeY - r * 0.20 };

  function makeEyeOverlay(restX: number, restY: number): Phaser.GameObjects.Graphics {
    const eg = scene.add.graphics();
    eg.x = restX;
    eg.y = restY;
    eg.fillStyle(0x8a4a18, 1);
    eg.fillCircle(0, 0, irisR);
    eg.fillStyle(COLORS.player.nose, 1);
    eg.fillCircle(0, 0, pupilR);
    eg.fillStyle(0xffffff, 0.9);
    eg.fillCircle(irisR * 0.22, -irisR * 0.28, irisR * 0.18);
    return eg;
  }

  const eyeL = makeEyeOverlay(eyeRestL.x, eyeRestL.y);
  const eyeR = makeEyeOverlay(eyeRestR.x, eyeRestR.y);
  eyeL.setDepth(12);
  eyeR.setDepth(12);
  items.push(eyeL);
  items.push(eyeR);

  const onPointerMove = (p: Phaser.Input.Pointer) => {
    for (const { eye, rest } of [
      { eye: eyeL, rest: eyeRestL },
      { eye: eyeR, rest: eyeRestR },
    ]) {
      const dx = p.x - rest.x;
      const dy = p.y - rest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, maxShift);
      const angle = Math.atan2(dy, dx);
      eye.x = rest.x + Math.cos(angle) * clamped;
      eye.y = rest.y + Math.sin(angle) * clamped;
    }
  };
  scene.input.on('pointermove', onPointerMove);
  // Clean up listener when the overlay is destroyed
  eyeL.on('destroy', () => scene.input.off('pointermove', onPointerMove));

  // ── Endless falling noodle strands into pot ───────────────────────────
  const potTopY  = GAME_HEIGHT * 0.70 - 155; // top edge of pot
  const noodleXs = [-220, -140, -60, 0, 60, 140, 220, 290];
  for (let ni = 0; ni < noodleXs.length; ni++) {
    const nx = cx + noodleXs[ni];
    const startY = Phaser.Math.Between(-200, -20);
    const strandG = scene.add.graphics();
    strandG.x = nx;
    strandG.y = startY;
    // Draw a wavy noodle strand (~180px tall)
    strandG.lineStyle(3 + (ni % 3), COLORS.tile.ramen, 0.85);
    strandG.beginPath();
    const strandLen = 160 + (ni % 4) * 20;
    for (let py = 0; py <= strandLen; py += 6) {
      const px = Math.sin(py * 0.09 + ni) * 10;
      if (py === 0) strandG.moveTo(px, py);
      else strandG.lineTo(px, py);
    }
    strandG.strokePath();
    // Also draw a second colour strand offset
    strandG.lineStyle(2, COLORS.tile.ramenEdge, 0.5);
    strandG.beginPath();
    for (let py = 0; py <= strandLen; py += 6) {
      const px = Math.sin(py * 0.09 + ni + 1.2) * 8 + 4;
      if (py === 0) strandG.moveTo(px, py);
      else strandG.lineTo(px, py);
    }
    strandG.strokePath();
    items.push(strandG);
    // Animate falling into the pot
    const fallDist = potTopY - startY;
    scene.tweens.add({
      targets: strandG,
      y: potTopY,
      duration: 900 + ni * 130,
      delay: ni * 80,
      ease: 'Sine.easeIn',
      loop: -1,
      onLoop: () => {
        strandG.y = Phaser.Math.Between(-240, -40);
      },
    });
  }

  // ── Pot (top-down, no shiba — doge is the background now) ──────────────
  const potG = scene.add.graphics();
  drawPotIllustration(potG, cx, GAME_HEIGHT * 0.70, 310);
  items.push(potG);

  // Noodle splash ripple on the broth surface — rings that pulse outward
  const rippleG = scene.add.graphics();
  rippleG.x = cx;
  rippleG.y = GAME_HEIGHT * 0.70;
  rippleG.lineStyle(2, COLORS.broth.shimmer, 0.6);
  rippleG.strokeCircle(0, 0, 30);
  items.push(rippleG);
  scene.tweens.add({
    targets: rippleG,
    scaleX: 4.5, scaleY: 4.5,
    alpha: 0,
    duration: 1100,
    loop: -1,
    ease: 'Sine.easeOut',
    onLoop: () => { rippleG.setScale(1); rippleG.alpha = 0.6; },
  });

  // ── Title logo block ───────────────────────────────────────────
  // TITLE_TOP is the top of the DOG text. Banner is derived from it.
  const TITLE_TOP = 100; // px from screen top
  const TITLE_H   = 148 + 112; // DOG + RAMEN pixel heights
  const BANNER_PAD = 16;
  const bannerG = scene.add.graphics();
  bannerG.fillStyle(0x000000, 0.45);
  bannerG.fillRect(0, TITLE_TOP - BANNER_PAD, GAME_WIDTH, TITLE_H + BANNER_PAD * 2);
  bannerG.lineStyle(4, COLORS.ui.winGold, 0.7);
  bannerG.strokeRect(0, TITLE_TOP - BANNER_PAD, GAME_WIDTH, TITLE_H + BANNER_PAD * 2);
  items.push(bannerG);

  // "DOG" — large, gold, thick stroke
  const dogText = scene.add.text(cx, TITLE_TOP, 'DOG', {
    fontSize: '148px',
    fontFamily: 'Arial Black',
    color: '#f5c76a',
    stroke: '#5a2800',
    strokeThickness: 14,
  }).setOrigin(0.5, 0);
  items.push(dogText);

  // "RAMEN" — slightly smaller, warm white, offset
  const ramenText = scene.add.text(cx, TITLE_TOP + 148, 'RAMEN', {
    fontSize: '112px',
    fontFamily: 'Arial Black',
    color: '#fff5e0',
    stroke: '#7a2800',
    strokeThickness: 12,
  }).setOrigin(0.5, 0);
  items.push(ramenText);

  // Engrish tagline directly under the title
  const taglineBg = scene.add.graphics();
  taglineBg.fillStyle(COLORS.broth.dark, 0.88);
  const taglineY = TITLE_TOP + 148 + 112 + 10;
  taglineBg.fillRoundedRect(cx - 300, taglineY, 600, 68, 8);
  items.push(taglineBg);
  const titleTagline = scene.add.text(cx, taglineY + 34,
    'CHEAT CUSTOMER WITH CHEAP RAMEN!\nPUSH NOODLE DOWN FOR COOK!', {
    fontSize: '21px', fontFamily: 'Arial Black',
    color: '#f5c76a', stroke: '#3d1a00', strokeThickness: 4,
    align: 'center',
  }).setOrigin(0.5);
  items.push(titleTagline);

  // Idle shimmer tween on DOG text
  scene.tweens.add({
    targets: dogText,
    scaleX: 1.03, scaleY: 1.03,
    duration: 900,
    yoyo: true,
    loop: -1,
    ease: 'Sine.easeInOut',
  });



  // Layout (bottom-up):
  //   Copyright    : GAME_HEIGHT - 36
  //   gap 16px
  //   Legend panel : legendH tall  (legendY = GAME_HEIGHT - 36 - 16 - legendH)
  //   gap 16px
  //   PUSH START   : 88px tall, sits above legend panel
  //
  // Legend content offsets:
  //   +16   tagline line 1&2  (~60px)
  //   +84   HOW TO PLAY header (28px)
  //   +120  tile icons (56px)
  //   +184  tile labels (~48px)
  //   +240  bottom padding
  const legendH  = 210;
  const legendY  = GAME_HEIGHT - 36 - 16 - legendH;
  const btnTopY  = legendY - 16 - 88;

  // How-to tile legend (no tagline here — it's under the title now)
  const legendBg = scene.add.graphics();
  legendBg.fillStyle(0x000000, 0.55);
  legendBg.fillRoundedRect(40, legendY, GAME_WIDTH - 80, legendH, 10);
  legendBg.lineStyle(2, COLORS.ui.border, 0.8);
  legendBg.strokeRoundedRect(40, legendY, GAME_WIDTH - 80, legendH, 10);
  items.push(legendBg);

  const howHeader = scene.add.text(cx, legendY + 16, 'HOW TO PLAY', {
    fontSize: '24px', fontFamily: 'Arial Black',
    color: '#fff5e0', stroke: '#3d1a00', strokeThickness: 4,
  }).setOrigin(0.5, 0);
  items.push(howHeader);

  const tileData: Array<{ label: string; x: number; isMesh: boolean; color: number }> = [
    { color: COLORS.tile.ramen, label: 'RAMEN\nSTEP ON!',    x: cx - 220, isMesh: false },
    { color: 0xb8a878,          label: 'STRAINER\nREUSE OK', x: cx,       isMesh: true  },
    { color: COLORS.broth.base, label: 'BROTH\nNO STEP!',   x: cx + 220, isMesh: false },
  ];
  for (const { color, label, x, isMesh } of tileData) {
    const tg = scene.make.graphics();
    if (isMesh) {
      const s = 56;
      tg.fillStyle(0xb8a878, 1);
      tg.fillRoundedRect(-s/2, -s/2, s, s, s * 0.18);
      const cols = 4, rows = 4;
      const cw = s / cols, ch = s / rows, hr = cw * 0.21;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (rr === 0 && cc === 0) continue;
          if (rr === 0 && cc === cols-1) continue;
          if (rr === rows-1 && cc === 0) continue;
          if (rr === rows-1 && cc === cols-1) continue;
          const hx = -s/2 + cw * (cc + 0.5);
          const hy = -s/2 + ch * (rr + 0.5);
          tg.fillStyle(COLORS.broth.base, 0.75);
          tg.fillCircle(hx, hy, hr);
        }
      }
      tg.lineStyle(2, 0x8a7040, 0.8);
      tg.strokeRoundedRect(-s/2, -s/2, s, s, s * 0.18);
    } else {
      tg.fillStyle(color, 1);
      tg.fillRoundedRect(-28, -28, 56, 56, 6);
      tg.lineStyle(2, 0x000000, 0.4);
      tg.strokeRoundedRect(-28, -28, 56, 56, 6);
    }
    const tc = scene.add.container(x, legendY + 104, [tg]);
    tc.setSize(56, 56);
    items.push(tc);
    const lbl = scene.add.text(x, legendY + 146, label, {
      fontSize: '20px', fontFamily: 'Arial Black',
      color: '#fff5e0', stroke: '#000', strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0);
    items.push(lbl);
  }

  // PUSH START button (pulsing)
  const startBtnBg = scene.add.graphics();
  startBtnBg.fillStyle(COLORS.ui.button, 1);
  startBtnBg.fillRoundedRect(cx - 200, btnTopY, 400, 88, 14);
  startBtnBg.lineStyle(3, COLORS.ui.winGold, 1);
  startBtnBg.strokeRoundedRect(cx - 200, btnTopY, 400, 88, 14);
  items.push(startBtnBg);

  const startText = scene.add.text(cx, btnTopY + 44, 'PUSH START!', {
    fontSize: '48px',
    fontFamily: 'Arial Black',
    color: '#f5c76a',
    stroke: '#3d1a00',
    strokeThickness: 7,
  }).setOrigin(0.5);
  items.push(startText);

  scene.tweens.add({
    targets: [startBtnBg, startText],
    alpha: 0.25,
    duration: 520,
    yoyo: true,
    loop: -1,
    ease: 'Sine.easeInOut',
  });

  const hitArea = scene.add.rectangle(cx, btnTopY + 44, 400, 88, 0x000000, 0)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', doStart);
  items.push(hitArea);

  // Copyright footer
  const copy = scene.add.text(cx, GAME_HEIGHT - 36,
    '(C)1993 WOOF SOFT  ALL RIGHT RESERVE', {
    fontSize: '20px', fontFamily: 'Arial',
    color: '#8a6848',
  }).setOrigin(0.5);
  overlayContainer = scene.add.container(0, 0, items);
  overlayContainer.setDepth(10);

  // Any key starts
  const onKey = () => { doStart(); };
  scene.input.keyboard?.once('keydown', onKey);

  function doStart() {
    sfx.start();
    bgm.play();
    scene.input.keyboard?.off('keydown', onKey);
    clearOverlay();
    startLevel(1);
  }
}

// ─── Level Start ──────────────────────────────────────────────────────────────

function startLevel(level: number): void {
  clearBoard();
  clearHintPanel();

  const { grid, solution } = generateLevel(level);
  const p = getLevelParams(level);
  const gridSize = p.gridSize;

  let ramenTotal = 0;
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++)
      if (grid[r][c].type === 'ramen') ramenTotal++;

  gs = {
    level,
    phase: 'intro',
    grid,
    playerRow: -1,
    playerCol: Math.floor(gridSize / 2),
    ramenCleared: 0,
    ramenTotal,
    solution,
    showingHint: false,
    savedGrid: cloneGrid(grid),      // frozen copy for retry
    savedSolution: [...solution],
    undoStack: [],
  };

  updateHUD();
  drawBoard();
  drawPlayer();
  buildControlButtons(gridSize);
  playIntroAnimation();
}

function retryLevel(): void {
  clearBoard();
  clearHintPanel();

  // Restore the exact same layout that was generated at level start
  const grid = cloneGrid(gs.savedGrid);
  const solution = [...gs.savedSolution];
  const gridSize = grid.length;

  let ramenTotal = 0;
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++)
      if (grid[r][c].type === 'ramen') ramenTotal++;

  gs = {
    level: gs.level,
    phase: 'intro',
    grid,
    playerRow: -1,
    playerCol: Math.floor(gridSize / 2),
    ramenCleared: 0,
    ramenTotal,
    solution,
    showingHint: false,
    savedGrid: cloneGrid(gs.savedGrid),  // preserve for future retries
    savedSolution: [...gs.savedSolution],
    undoStack: [],
  };

  updateHUD();
  drawBoard();
  drawPlayer();
  buildControlButtons(gridSize);
  playIntroAnimation();
}


// --- Intro Animation ---

/**
 * For each ramen tile, show a "instant ramen packet opens and drops in"
 * animation. Tiles start invisible; a red wrapper packet falls from above,
 * bursts open, and the ramen block lands with a bounce.
 * Staggered by tile index. Inputs blocked while phase === 'intro'.
 */
function playIntroAnimation(): void {
  const { grid } = gs;
  const gridSize = grid.length;
  const ts = getTileSize(gridSize);
  const { ox, oy } = getBoardOrigin(gridSize);

  // Collect ramen tile positions ordered row-first for natural stagger
  const ramenTiles: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++)
      if (grid[r][c].type === 'ramen') ramenTiles.push({ r, c });

  // Hide all ramen tiles immediately
  for (const { r, c } of ramenTiles) {
    const tc = tileContainers[r]?.[c];
    if (tc) tc.setAlpha(0).setScale(0.1);
  }

  const DROP_MS    = 420;
  const BURST_MS   = 220;
  const LAND_MS    = 280;
  // Quad-in eased stagger: early packets are well-spaced, later ones bunch up.
  // Total spread across which all start times are distributed.
  const TOTAL_STAGGER_MS = Math.max(180, ramenTiles.length * 120);
  let lastEndTime  = 0;

  ramenTiles.forEach(({ r, c }, idx) => {
    const n = Math.max(1, ramenTiles.length - 1);
    const t = idx / n;                          // 0..1
    const easedT = t * t;                       // quad-in: slow start, fast end
    const delay = Math.round(easedT * TOTAL_STAGGER_MS);
    const tx = ox + c * ts + ts / 2;
    const ty = oy + r * ts + ts / 2;

    // Packet wrapper drops from above
    const pktG = scene.make.graphics();
    pktG.fillStyle(0xe03020, 1);
    pktG.fillRoundedRect(-ts * 0.42, -ts * 0.42, ts * 0.84, ts * 0.84, 6);
    pktG.lineStyle(2, 0xfff0d0, 0.8);
    pktG.strokeRoundedRect(-ts * 0.42, -ts * 0.42, ts * 0.84, ts * 0.84, 6);
    pktG.lineStyle(1.5, 0xfff0d0, 0.6);
    pktG.lineBetween(-ts * 0.28, -ts * 0.22, ts * 0.02, -ts * 0.22);
    pktG.lineBetween(-ts * 0.24, -ts * 0.10, ts * 0.05, -ts * 0.10);

    // "INSTANT RAMEN" text on the packet
    const pktFontSize = Math.max(10, Math.round(ts * 0.18));
    const pktTxt = scene.add.text(0, ts * 0.10, 'INSTANT\nRAMEN', {
      fontSize: `${pktFontSize}px`,
      fontFamily: 'Arial Black',
      color: '#fff0d0',
      stroke: '#8a1000',
      strokeThickness: Math.max(2, Math.round(ts * 0.05)),
      align: 'center',
      lineSpacing: -2,
    }).setOrigin(0.5, 0);

    const pktContainer = scene.add.container(tx, ty - ts * 3.5, [pktG, pktTxt]);
    pktContainer.setDepth(6);

    scene.time.delayedCall(delay, () => {
      scene.tweens.add({
        targets: pktContainer,
        y: ty,
        duration: DROP_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          // Wrapper bursts open
          scene.tweens.add({
            targets: pktContainer,
            scaleX: 1.8, scaleY: 1.8,
            alpha: 0,
            duration: BURST_MS,
            ease: 'Power2',
            onComplete: () => pktContainer.destroy(),
          });
          // Ramen tile lands with elastic bounce
          sfx.sink();
          const tc = tileContainers[r]?.[c];
          if (tc) {
            tc.setAlpha(1).setScale(1.3);
            scene.tweens.add({
              targets: tc,
              scaleX: 1, scaleY: 1,
              duration: LAND_MS,
              ease: 'Back.easeOut',
            });
          }
        },
      });
    });

    const endTime = delay + DROP_MS + BURST_MS + LAND_MS;
    if (endTime > lastEndTime) lastEndTime = endTime;
  });

  // Unlock gameplay once all animations finish
  scene.time.delayedCall(lastEndTime + 100, () => {
    gs.phase = 'playing';
  });
}

// ─── Board Drawing ────────────────────────────────────────────────────────────

function clearBoard(): void {
  if (boardContainer) {
    boardContainer.destroy(true);
  }
  tileContainers = [];
  if (playerContainer) {
    scene.tweens.killTweensOf(playerContainer);
    playerContainer.destroy(true);
  }
  playerContainer = null as any;
}

function drawBoard(): void {
  const { grid } = gs;
  const gridSize = grid.length;
  const ts = getTileSize(gridSize);
  const { ox, oy } = getBoardOrigin(gridSize);
  const boardPx = ts * gridSize;

  const objs: Phaser.GameObjects.GameObject[] = [];

  // ── Pot body — top-down view ────────────────────────────────────────────
  const potPad = 24;
  const potG   = scene.add.graphics();

  // Outer pot ring (thick rim viewed from above)
  const rimRadius = boardPx / 2 + potPad + 14;
  const potCx = ox + boardPx / 2;
  const potCy = oy + boardPx / 2;
  potG.fillStyle(COLORS.tile.potWall, 1);
  potG.fillCircle(potCx, potCy, rimRadius);

  // Inner broth pool
  potG.fillStyle(COLORS.broth.base, 1);
  potG.fillCircle(potCx, potCy, rimRadius - 14);

  // Broth shimmer rings
  potG.lineStyle(2, COLORS.broth.shimmer, 0.25);
  potG.strokeCircle(potCx, potCy, (rimRadius - 14) * 0.75);
  potG.strokeCircle(potCx, potCy, (rimRadius - 14) * 0.45);

  // Rim highlight arc (top-left)
  potG.lineStyle(4, 0xffffff, 0.12);
  potG.beginPath();
  potG.arc(potCx, potCy, rimRadius - 7, Math.PI * 1.1, Math.PI * 1.6);
  potG.strokePath();

  objs.push(potG);

  // ── Floating ingredients inside broth ────────────────────────────────────
  // Pushed AFTER potG so they render on top of the broth circle.
  const ingredTypes = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const dist  = (rimRadius - 18) * Phaser.Math.FloatBetween(0.2, 0.82);
    const ix = potCx + Math.cos(angle) * dist;
    const iy = potCy + Math.sin(angle) * dist;
    const ig = scene.add.graphics();
    ig.x = ix;
    ig.y = iy;
    ig.alpha = Phaser.Math.FloatBetween(0.28, 0.52);
    drawIngredient(ig, ingredTypes[i % ingredTypes.length]);
    objs.push(ig);
    scene.tweens.add({
      targets: ig,
      x: ix + Phaser.Math.Between(-12, 12),
      y: iy + Phaser.Math.Between(-8, 8),
      angle: Phaser.Math.Between(-25, 25),
      duration: Phaser.Math.Between(3000, 6000),
      yoyo: true,
      loop: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Grid tiles ────────────────────────────────────────────────────────────
  tileContainers = [];
  for (let r = 0; r < gridSize; r++) {
    tileContainers[r] = [];
    for (let c = 0; c < gridSize; c++) {
      const tile = grid[r][c];
      const tx = ox + c * ts + ts / 2;
      const ty = oy + r * ts + ts / 2;
      const tc = drawTile(tile, tx, ty, ts);
      tileContainers[r][c] = tc;
      objs.push(tc);
    }
  }

  // ── Start handle (top, centre column) ──────────────────────────────────────────
  const handleSize = ts * 0.85;
  const midCol = Math.floor(gridSize / 2);
  const handleX = ox + midCol * ts + ts / 2;
  const topRimY = potCy - rimRadius;
  const startY  = topRimY - handleSize * 0.6;
  startHandleObj = drawHandle(handleX, startY, handleSize, true);
  objs.push(startHandleObj);

  // ── End handle (bottom, centre column) ─────────────────────────────────────────
  const botRimY = potCy + rimRadius;
  const endY    = botRimY + handleSize * 0.6;
  endHandleObj = drawHandle(handleX, endY, handleSize, false);
  objs.push(endHandleObj);

  boardContainer = scene.add.container(0, 0, objs);
  boardContainer.setDepth(1);
}

function drawTile(
  tile: Tile, cx: number, cy: number, ts: number
): Phaser.GameObjects.Container {
  const g = scene.make.graphics();
  const pad = 3;
  const s = ts - pad * 2;

  switch (tile.type) {
    case 'broth': {
      g.fillStyle(COLORS.broth.dark, 0.22);
      g.fillRect(-s / 2, -s / 2, s, s);
      break;
    }
    case 'ramen': {
      // Dry instant ramen block — pale noodle cake, no wrapper
      g.fillStyle(COLORS.tile.ramen, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, 7);

      // Subtle inner shadow border
      g.fillStyle(COLORS.tile.ramenEdge, 0.25);
      g.fillRoundedRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 5);
      g.fillStyle(COLORS.tile.ramen, 1);
      g.fillRoundedRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 12, 4);

      // Wavy noodle strands (4 rows across the block)
      g.lineStyle(1.5, COLORS.tile.ramenEdge, 0.75);
      const noodleTop = -s / 2 + s * 0.15;
      for (let row = 0; row < 4; row++) {
        const ny = noodleTop + row * (s * 0.19);
        const pts: { x: number; y: number }[] = [];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const px = -s / 2 + s * 0.08 + (s * 0.84) * (i / steps);
          const py = ny + Math.sin(i * Math.PI * 0.8) * (s * 0.035);
          pts.push({ x: px, y: py });
        }
        g.strokePoints(pts, false, false);
      }

      // Outer border
      g.lineStyle(2, COLORS.tile.ramenEdge, 1);
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, 7);
      break;
    }
    case 'stone': {
      // Soup strainer / mesh basket viewed from above
      const meshColor  = 0xb8a878; // warm steel / bamboo mesh
      const rimColor   = 0x8a7040; // darker rim
      const holeColor  = COLORS.broth.base; // broth shows through holes

      // Base fill (mesh material colour)
      g.fillStyle(meshColor, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);

      // Mesh holes — grid of small circles showing broth through the mesh
      const cols = 5, rows = 5;
      const cellW = s / cols;
      const cellH = s / rows;
      const holeR = cellW * 0.22;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const hx = -s / 2 + cellW * (col + 0.5);
          const hy = -s / 2 + cellH * (row + 0.5);
          // Skip holes near corners so the rounded shape looks right
          const edgeDist = Math.min(col, cols - 1 - col, row, rows - 1 - row);
          if (edgeDist === 0 && (col === 0 || col === cols - 1) && (row === 0 || row === rows - 1)) continue;
          g.fillStyle(holeColor, 0.75);
          g.fillCircle(hx, hy, holeR);
          // Wire ring around each hole
          g.lineStyle(0.8, rimColor, 0.5);
          g.strokeCircle(hx, hy, holeR);
        }
      }

      // Mesh grid lines (the wire strands)
      g.lineStyle(1.2, rimColor, 0.55);
      for (let col = 1; col < cols; col++) {
        const lx = -s / 2 + cellW * col;
        g.lineBetween(lx, -s / 2 + 4, lx, s / 2 - 4);
      }
      for (let row = 1; row < rows; row++) {
        const ly = -s / 2 + cellH * row;
        g.lineBetween(-s / 2 + 4, ly, s / 2 - 4, ly);
      }

      // Rim border
      g.lineStyle(2.5, rimColor, 1);
      g.strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);

      // Highlight arc top-left (metal sheen)
      g.lineStyle(2, 0xffffff, 0.25);
      g.beginPath();
      g.arc(-s * 0.15, -s * 0.15, s * 0.28, Math.PI * 1.1, Math.PI * 1.55);
      g.strokePath();
      break;
    }
    default:
      break;
  }

  const c = scene.add.container(cx, cy, [g]);
  c.setSize(ts, ts);
  return c;
}

function drawHandle(
  cx: number, cy: number, size: number, isStart: boolean
): Phaser.GameObjects.Container {
  const g = scene.make.graphics();
  const color = isStart ? COLORS.tile.startGlow : COLORS.tile.endGlow;
  const hw = size * 0.55;  // half-width of handle
  const hh = size * 0.38;  // half-height
  const thick = size * 0.18; // wall thickness

  // Pot handle shape: a U-bracket open toward the pot
  // Outer rectangle fill
  g.fillStyle(COLORS.tile.potHandle, 1);
  g.fillRoundedRect(-hw, -hh, hw * 2, hh * 2, thick * 0.7);
  // Inner cutout (hollow centre, open on the pot side)
  const innerSide = isStart ? hw - thick : -hw + thick;
  g.fillStyle(COLORS.broth.base, 1); // matches broth colour
  // hollow: leave left wall for start handle, right wall for end handle
  if (isStart) {
    // open on right side toward pot
    g.fillRoundedRect(innerSide - (hw - thick * 2), -hh + thick,
      hw - thick * 2, hh * 2 - thick * 2, thick * 0.4);
  } else {
    g.fillRoundedRect(-hw + thick, -hh + thick,
      hw - thick * 2, hh * 2 - thick * 2, thick * 0.4);
  }

  // Glow border
  g.lineStyle(3, color, 1);
  g.strokeRoundedRect(-hw, -hh, hw * 2, hh * 2, thick * 0.7);

  // Arrow pointing toward pot (shows direction)
  g.fillStyle(color, 1);
  const arrowSize = size * 0.18;
  if (isStart) {
    // Arrow pointing DOWN (toward pot, start is above)
    g.fillTriangle(
      0,           hh * 0.35,
      -arrowSize * 0.8, hh * 0.35 - arrowSize,
       arrowSize * 0.8, hh * 0.35 - arrowSize
    );
  } else {
    // Arrow pointing UP (back toward pot, goal is below)
    g.fillTriangle(
      0,            -hh * 0.35,
      -arrowSize * 0.8, -hh * 0.35 + arrowSize,
       arrowSize * 0.8, -hh * 0.35 + arrowSize
    );
  }

  // Label above handle
  const label = isStart ? 'START' : 'GOAL';
  const txt = scene.add.text(0, -hh - 18, label, {
    fontSize: `${Math.round(size * 0.20)}px`,
    fontFamily: 'Arial Black',
    color: `#${color.toString(16).padStart(6, '0')}`,
    stroke: '#2b1a0e',
    strokeThickness: 4,
  }).setOrigin(0.5, 1);

  const c = scene.add.container(cx, cy, [g, txt]);
  c.setSize(size, size * 0.76);
  return c;
}

// ─── Player (Shiba Inu — Doge) ───────────────────────────────────────────────

function drawPlayer(): void {
  if (playerContainer) playerContainer.destroy(true);

  const pos = getPlayerWorldPos();
  const gridSize = gs.grid.length;
  const ts = getTileSize(gridSize);
  const r = ts * 0.34;

  const g = scene.make.graphics();
  drawShiba(g, r);

  playerContainer = scene.add.container(pos.x, pos.y, [g]);
  playerContainer.setDepth(5);
  startIdleBounce(pos.y);
}

/** Draw the Shiba Inu (Doge) centred at origin with radius r.
 * @param skipIrises - if true, omit irises/pupils/shines (use when overlaying animated eye graphics)
 */
function drawShiba(g: Phaser.GameObjects.Graphics, r: number, skipIrises = false): void {
  // Body (sitting oval below head)
  g.fillStyle(COLORS.player.body, 1);
  g.fillEllipse(0, r * 1.1, r * 1.8, r * 1.6);
  // Chest lighter patch
  g.fillStyle(COLORS.player.light, 0.55);
  g.fillEllipse(0, r * 1.0, r * 0.9, r * 0.9);
  // Front paws at bottom of body
  g.fillStyle(COLORS.player.body, 1);
  g.fillEllipse(-r * 0.52, r * 1.82, r * 0.52, r * 0.30);
  g.fillEllipse( r * 0.52, r * 1.82, r * 0.52, r * 0.30);
  g.lineStyle(1, COLORS.player.dark, 0.30);
  g.lineBetween(-r*0.52, r*1.70, -r*0.52, r*1.92);
  g.lineBetween( r*0.52, r*1.70,  r*0.52, r*1.92);
  // Tail curled at right
  g.lineStyle(r * 0.18, COLORS.player.body, 1);
  g.beginPath();
  g.arc(r * 0.88, r * 0.88, r * 0.42, Math.PI * 0.9, Math.PI * 1.85, false);
  g.strokePath();

  // Neck connecting body to head
  g.fillStyle(COLORS.player.body, 1);
  g.fillEllipse(0, r * 0.44, r * 1.2, r * 0.7);

  // Head
  g.fillStyle(COLORS.player.body, 1);
  g.fillCircle(0, 0, r);

  // Forehead darker tuft
  g.fillStyle(COLORS.player.dark, 0.30);
  g.fillEllipse(0, -r * 0.70, r * 0.95, r * 0.55);

  // Ears — outer
  g.fillStyle(COLORS.player.body, 1);
  g.fillTriangle(-r*0.62,-r*0.52, -r*0.26,-r*1.18, -r*0.94,-r*1.22);
  g.fillTriangle( r*0.62,-r*0.52,  r*0.26,-r*1.18,  r*0.94,-r*1.22);
  // Ears — inner pink
  g.fillStyle(0xd4806a, 0.8);
  g.fillTriangle(-r*0.60,-r*0.60, -r*0.30,-r*1.07, -r*0.82,-r*1.10);
  g.fillTriangle( r*0.60,-r*0.60,  r*0.30,-r*1.07,  r*0.82,-r*1.10);

  // White muzzle patch
  g.fillStyle(COLORS.player.light, 1);
  g.fillEllipse(0, r * 0.24, r * 1.12, r * 0.72);

  // Nose
  g.fillStyle(COLORS.player.nose, 1);
  g.fillEllipse(0, r * 0.07, r * 0.30, r * 0.21);
  // Nostrils
  g.fillStyle(0x1a0a00, 0.65);
  g.fillCircle(-r*0.075, r*0.09, r*0.055);
  g.fillCircle( r*0.075, r*0.09, r*0.055);

  // Eyes — whites always drawn
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(-r*0.32, -r*0.22, r*0.32, r*0.28);
  g.fillEllipse( r*0.32, -r*0.22, r*0.32, r*0.28);
  // Irises, pupils and shines — skipped when overlay handles them
  if (!skipIrises) {
    g.fillStyle(0x8a4a18, 1);
    g.fillCircle(-r*0.32, -r*0.20, r*0.12);
    g.fillCircle( r*0.32, -r*0.20, r*0.12);
    g.fillStyle(COLORS.player.nose, 1);
    g.fillCircle(-r*0.30, -r*0.20, r*0.07);
    g.fillCircle( r*0.30, -r*0.20, r*0.07);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(-r*0.27, -r*0.25, r*0.035);
    g.fillCircle( r*0.34, -r*0.25, r*0.035);
  }
  // Worried upper eyelid arc
  g.lineStyle(1.5, COLORS.player.nose, 0.65);
  g.beginPath();
  g.arc(-r*0.32, -r*0.22, r*0.17, Math.PI*1.1, Math.PI*1.9);
  g.strokePath();
  g.beginPath();
  g.arc( r*0.32, -r*0.22, r*0.17, Math.PI*1.1, Math.PI*1.9);
  g.strokePath();

  // Inner brow marks
  g.fillStyle(COLORS.player.dark, 0.6);
  g.fillEllipse(-r*0.28, -r*0.40, r*0.22, r*0.10);
  g.fillEllipse( r*0.28, -r*0.40, r*0.22, r*0.10);

  // Smile
  g.lineStyle(1.5, COLORS.player.dark, 0.45);
  g.beginPath();
  g.arc(0, r*0.32, r*0.20, 0, Math.PI);
  g.strokePath();

  // Blush
  g.fillStyle(0xff8888, 0.26);
  g.fillCircle(-r*0.57, r*0.18, r*0.18);
  g.fillCircle( r*0.57, r*0.18, r*0.18);
}

function startIdleBounce(baseY: number): void {
  scene.tweens.add({
    targets: playerContainer,
    y: baseY - 7,
    duration: 650,
    yoyo: true,
    loop: -1,
    ease: 'Sine.easeInOut',
  });
}

function getPlayerWorldPos(): { x: number; y: number } {
  const gridSize = gs.grid.length;
  const ts = getTileSize(gridSize);
  const { ox, oy } = getBoardOrigin(gridSize);
  const midCol = Math.floor(gridSize / 2);
  const potPad = 24;
  const boardPx = ts * gridSize;
  const handleSize = ts * 0.85;
  const rimR = boardPx / 2 + potPad + 14;
  const potCy = oy + boardPx / 2;

  if (gs.playerRow === -1) {
    // On start handle (top)
    return { x: ox + midCol * ts + ts / 2, y: potCy - rimR - handleSize * 0.6 };
  }
  if (gs.playerRow === gridSize) {
    // On end handle (bottom)
    return { x: ox + midCol * ts + ts / 2, y: potCy + rimR + handleSize * 0.6 };
  }
  return {
    x: ox + gs.playerCol * ts + ts / 2,
    y: oy + gs.playerRow * ts + ts / 2,
  };
}

function movePlayerTo(targetX: number, targetY: number, onComplete?: () => void): void {
  scene.tweens.killTweensOf(playerContainer);

  // Capture the container reference at call time.
  // If clearBoard() runs before an onComplete fires, the captured ref is
  // stale and we abort the chain instead of targeting the new container.
  const cap = playerContainer;
  const alive = () => cap && !cap.scene === false && cap.active;

  scene.tweens.add({
    targets: cap,
    scaleX: 0.78, scaleY: 1.25,
    duration: 55,
    ease: 'Power2',
    onComplete: () => {
      if (!alive()) return;
      scene.tweens.add({
        targets: cap,
        x: targetX,
        y: targetY - 10,
        scaleX: 1.18, scaleY: 0.82,
        duration: 90,
        ease: 'Power1',
        onComplete: () => {
          if (!alive()) return;
          scene.tweens.add({
            targets: cap,
            x: targetX,
            y: targetY,
            scaleX: 1.08, scaleY: 0.92,
            duration: 55,
            ease: 'Power2',
            onComplete: () => {
              if (!alive()) return;
              scene.tweens.add({
                targets: cap,
                scaleX: 1, scaleY: 1,
                duration: 80,
                ease: 'Elastic.easeOut',
                onComplete: () => {
                  if (!alive()) return;
                  startIdleBounce(targetY);
                  onComplete?.();
                },
              });
            },
          });
        },
      });
    },
  });
}

// ─── Game Movement Logic ──────────────────────────────────────────────────────

function pushUndo(): void {
  gs.undoStack.push({
    playerRow: gs.playerRow,
    playerCol: gs.playerCol,
    ramenCleared: gs.ramenCleared,
    gridStates: snapshotStates(gs.grid),
  });
}

function handleUndo(): void {
  if (!gs || gs.phase !== 'playing') return;
  if (gs.undoStack.length === 0) return;
  sfx.undo();

  const entry = gs.undoStack.pop()!;
  gs.playerRow = entry.playerRow;
  gs.playerCol = entry.playerCol;
  gs.ramenCleared = entry.ramenCleared;
  restoreStates(gs.grid, entry.gridStates);

  // Restore tile visuals
  const gridSize = gs.grid.length;
  const ts = getTileSize(gridSize);
  const { ox, oy } = getBoardOrigin(gridSize);
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const tc = tileContainers[r]?.[c];
      if (!tc) continue;
      const tile = gs.grid[r][c];
      if (tile.state === 'active') {
        // Re-show if it was sunk
        scene.tweens.killTweensOf(tc);
        tc.setScale(1).setAlpha(1);
      }
    }
  }

  // Move player back immediately
  scene.tweens.killTweensOf(playerContainer);
  const pos = getPlayerWorldPos();
  playerContainer.x = pos.x;
  playerContainer.y = pos.y;
  // Restart idle bounce
  scene.tweens.add({
    targets: playerContainer,
    y: pos.y - 6,
    duration: 600,
    yoyo: true,
    loop: -1,
    ease: 'Sine.easeInOut',
  });

  updateHUD();
}

function handleMove(dir: Direction): void {
  if (!gs || gs.phase !== 'playing') return;

  const gridSize = gs.grid.length;
  let newRow = gs.playerRow;
  let newCol = gs.playerCol;

  switch (dir) {
    case 'up':    newRow--; break;
    case 'down':  newRow++; break;
    case 'left':  newCol--; break;
    case 'right': newCol++; break;
  }

  // Allow moving to end handle: player must be at last row moving down, centre column, all ramen cleared
  const isEndMove = (newRow === gridSize && newCol === Math.floor(gridSize / 2));
  if (isEndMove) {
    // The tile we're standing on will be cleared on departure — count it
    const gridSize2 = gs.grid.length;
    const standingOnRamen =
      gs.playerRow >= 0 && gs.playerRow < gridSize2 &&
      gs.playerCol >= 0 && gs.playerCol < gridSize2 &&
      gs.grid[gs.playerRow][gs.playerCol].type === 'ramen' &&
      gs.grid[gs.playerRow][gs.playerCol].state === 'active';
    const effectiveCleared = gs.ramenCleared + (standingOnRamen ? 1 : 0);
    if (effectiveCleared < gs.ramenTotal) {
      shakePlayer();
      return;
    }
    // Win! Clear the tile we're leaving first, then animate to handle
    pushUndo();
    const prevRow = gs.playerRow;
    const prevCol = gs.playerCol;
    applyTileEffect(prevRow, prevCol);
    gs.playerRow = newRow;
    gs.playerCol = newCol;
    const pos = getPlayerWorldPos();
    movePlayerTo(pos.x, pos.y, () => triggerWin());
    return;
  }

  // Out of bounds check
  if (newRow < 0 || newRow >= gridSize || newCol < 0 || newCol >= gridSize) {
    shakePlayer();
    return;
  }

  const targetTile = gs.grid[newRow][newCol];

  // Cannot step on broth or sunk tiles
  if (targetTile.type === 'broth' || targetTile.state === 'sunk') {
    shakePlayer();
    return;
  }

  // Valid move — apply effect to the tile we're LEAVING immediately (no tween delay)
  sfx.step();
  pushUndo();
  const prevRow = gs.playerRow;
  const prevCol = gs.playerCol;

  // Update position
  gs.playerRow = newRow;
  gs.playerCol = newCol;

  // Clear the tile we just stepped off, right now (no race condition)
  applyTileEffect(prevRow, prevCol);

  const pos = getPlayerWorldPos();
  movePlayerTo(pos.x, pos.y);
}

function applyTileEffect(r: number, c: number): void {
  // Guard: handle positions (-1 col or gridSize col) have no grid tile
  const gridSize = gs.grid.length;
  if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return;
  const tile = gs.grid[r][c];
  if (tile.type === 'ramen' && tile.state === 'active') {
    // Sink the tile we just left
    tile.state = 'sunk';
    gs.ramenCleared++;
    sfx.sink();
    animateSinkTile(r, c);
    updateHUD();
  }
  // Stone tiles: nothing happens (permanent)
}

function animateSinkTile(r: number, c: number): void {
  const tc = tileContainers[r]?.[c];
  if (!tc) return;
  scene.tweens.add({
    targets: tc,
    scaleX: 0.1,
    scaleY: 0.1,
    alpha: 0,
    duration: 350,
    ease: 'Power2',
  });
}

function shakePlayer(): void {
  sfx.invalid();
  scene.tweens.killTweensOf(playerContainer);
  scene.tweens.add({
    targets: playerContainer,
    x: playerContainer.x + 12,
    duration: 60,
    yoyo: true,
    repeat: 3,
    ease: 'Linear',
    onComplete: () => {
      const pos = getPlayerWorldPos();
      scene.tweens.add({
        targets: playerContainer,
        y: pos.y - 6,
        duration: 600,
        yoyo: true,
        loop: -1,
        ease: 'Sine.easeInOut',
      });
    },
  });
}

// ─── Win Fanfare ──────────────────────────────────────────────────────────────

const WIN_MESSAGES = [
  'SUCH RAMEN!\nVERY CLEAR!\nWOW!!',
  'OISHI DESU!!\nSHIBA APPROVE!',
  'NOODLE\nCOMPLETE!\nGOOD DOG!!',
  'YOU WIN IT!\nVERY NOODLE!\nBEST DOG!!',
  'SO SLURP!\nMUCH FINISH!\nDOGE WIN!!',
  'KANPAI!\nSHIBA IS\nNOODLE HERO!',
];

function triggerWin(): void {
  gs.phase = 'win';
  sfx.win();
  bgm.duck(2.2); // duck BGM for win jingle duration
  clearHintPanel();
  showWinFanfare();
}

function showWinFanfare(): void {
  clearOverlay();
  const nextLevel = gs.level + 1;
  const items: Phaser.GameObjects.GameObject[] = [];

  // Dim overlay
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  items.push(bg);
  scene.tweens.add({ targets: bg, alpha: 0.55, duration: 250 });

  // Pick a random engrish message
  const msg = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
  const goldHex = '#' + COLORS.ui.winGold.toString(16).padStart(6, '0');

  // Big bounce-in message
  const mainText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, msg, {
    fontSize: '72px',
    fontFamily: 'Arial Black',
    color: goldHex,
    align: 'center',
    stroke: '#2b1a0e',
    strokeThickness: 8,
    lineSpacing: 8,
  }).setOrigin(0.5).setScale(0).setDepth(16);
  items.push(mainText);

  scene.tweens.add({
    targets: mainText,
    scaleX: 1, scaleY: 1,
    duration: 320,
    ease: 'Back.easeOut',
  });

  // Level label beneath
  const levelText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, `- STAGE ${gs.level} KUDASAI -`, {
    fontSize: '30px',
    fontFamily: 'Arial',
    color: COLORS.text.secondary,
    align: 'center',
    stroke: '#2b1a0e',
    strokeThickness: 5,
  }).setOrigin(0.5).setAlpha(0).setDepth(16);
  items.push(levelText);
  scene.tweens.add({ targets: levelText, alpha: 1, duration: 300, delay: 250 });

  // Burst of floating ramen + paw emojis
  const burst = ['🍜', '🐾', '🍜', '✨', '🐕', '🍜', '🐾', '✨'];
  burst.forEach((emoji, i) => {
    const ex = Phaser.Math.Between(80, GAME_WIDTH - 80);
    const ey = Phaser.Math.Between(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.75);
    const et = scene.add.text(ex, ey + 60, emoji, {
      fontSize: `${Phaser.Math.Between(36, 64)}px`,
      fontFamily: 'Arial',
    }).setOrigin(0.5).setAlpha(0).setDepth(17);
    items.push(et);
    scene.tweens.add({
      targets: et,
      y: ey - Phaser.Math.Between(60, 160),
      alpha: 1,
      duration: 400,
      delay: 100 + i * 60,
      ease: 'Power2',
      onComplete: () => {
        scene.tweens.add({
          targets: et,
          alpha: 0,
          y: et.y - 40,
          duration: 350,
          delay: 400,
          ease: 'Power1',
        });
      },
    });
  });

  // Shiba spin-and-zoom
  if (playerContainer) {
    scene.tweens.killTweensOf(playerContainer);
    scene.tweens.add({
      targets: playerContainer,
      scaleX: 2.2, scaleY: 2.2,
      angle: 360,
      duration: 500,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: playerContainer,
          scaleX: 1.8, scaleY: 1.8,
          angle: 0,
          duration: 200,
          ease: 'Power1',
        });
      },
    });
  }

  overlayContainer = scene.add.container(0, 0, items);
  overlayContainer.setDepth(15);

  // Auto-advance after fanfare (~1.8s)
  scene.time.delayedCall(1800, () => {
    // Fade out whole overlay + board, then load next level
    if (overlayContainer) {
      scene.tweens.add({
        targets: overlayContainer,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          clearOverlay();
          startLevel(nextLevel);
        },
      });
    } else {
      startLevel(nextLevel);
    }
  });
}

// ─── Hint System ──────────────────────────────────────────────────────────────

function buildControlButtons(gridSize: number): void {
  clearHintPanel();

  // Controls anchored to bottom of screen — fixed positions independent of board size
  const btnSize = 80;
  const bx = GAME_WIDTH / 2;
  // D-pad centre sits at GAME_HEIGHT - 340
  const by = GAME_HEIGHT - 340;

  const upBtn    = makeArrowButton('↑', bx,       by - 90,  btnSize, () => handleMove('up'));
  const downBtn  = makeArrowButton('↓', bx,       by + 10,  btnSize, () => handleMove('down'));
  const leftBtn  = makeArrowButton('←', bx - 100, by - 40,  btnSize, () => handleMove('left'));
  const rightBtn = makeArrowButton('→', bx + 100, by - 40,  btnSize, () => handleMove('right'));

  const hintBtn  = makeButton('HINT',       bx + 80,  by + 120, 220, 72, COLORS.ui.button,    toggleHint);
  const undoBtn  = makeButton('UNDO [F]',   bx - 130, by + 120, 220, 72, COLORS.bg.secondary, handleUndo);
  const retryBtn = makeButton('RETRY [SPC]',bx,       by + 210, 280, 64, COLORS.bg.secondary, retryLevel);

  const controls = scene.add.container(0, 0, [upBtn, downBtn, leftBtn, rightBtn, hintBtn, undoBtn, retryBtn]);
  controls.setDepth(8);

  // Attach to boardContainer so it's destroyed on level change
  boardContainer.add(controls);
}

function makeArrowButton(
  label: string, x: number, y: number, size: number, onClick: () => void
): Phaser.GameObjects.Container {
  const g = scene.make.graphics();
  g.fillStyle(COLORS.ui.button, 1);
  g.fillRoundedRect(-size / 2, -size / 2, size, size, 12);
  g.lineStyle(2, COLORS.ui.border, 1);
  g.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);

  const txt = scene.add.text(0, 0, label, {
    fontSize: '38px', fontFamily: 'Arial', color: COLORS.text.primary,
  }).setOrigin(0.5);

  const c = scene.add.container(x, y, [g, txt]);
  c.setSize(size, size);
  c.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      scene.tweens.add({ targets: c, scaleX: 0.88, scaleY: 0.88, duration: 60, yoyo: true });
      onClick();
    });
  return c;
}

function toggleHint(): void {
  if (!gs || gs.phase !== 'playing') return;
  gs.showingHint = !gs.showingHint;
  if (gs.showingHint) showHint();
  else clearHintPanel();
}

function showHint(): void {
  clearHintPanel();
  const arrows: Record<Direction, string> = {
    up: '↑', down: '↓', left: '←', right: '→'
  };
  const hintText = gs.solution.map(d => arrows[d]).join(' ');
  const lines = splitHintIntoLines(hintText, 18);
  const joined = lines.join('\n');

  const gridSize = gs.grid.length;
  const ts = getTileSize(gridSize);
  const { oy } = getBoardOrigin(gridSize);
  const boardBottom = oy + ts * gridSize;

  const panelW = GAME_WIDTH - 80;
  const panelH = Math.max(120, lines.length * 36 + 60);
  const panelX = 40;
  const panelY = boardBottom + 20;

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.ui.hint, 0.95);
  bg.fillRoundedRect(panelX, panelY, panelW, panelH, 14);
  bg.lineStyle(2, COLORS.ui.button, 1);
  bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 14);

  const label = scene.add.text(panelX + panelW / 2, panelY + 16, 'SOLUTION:', {
    fontSize: '22px', fontFamily: 'Arial', color: COLORS.ui.hintText, fontStyle: 'bold',
  }).setOrigin(0.5, 0);

  const hint = scene.add.text(panelX + panelW / 2, panelY + 44, joined, {
    fontSize: '26px', fontFamily: 'Arial', color: COLORS.ui.hintText,
    align: 'center', wordWrap: { width: panelW - 20 },
  }).setOrigin(0.5, 0);

  hintPanel = scene.add.container(0, 0, [bg, label, hint]);
  hintPanel.setDepth(9);
}

function splitHintIntoLines(text: string, charsPerLine: number): string[] {
  const parts = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length + part.length + 1 > charsPerLine && current.length > 0) {
      lines.push(current);
      current = part;
    } else {
      current = current ? current + ' ' + part : part;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clearHintPanel(): void {
  if (hintPanel) { hintPanel.destroy(true); hintPanel = null; }
}

// ─── Overlay Helpers ──────────────────────────────────────────────────────────

function clearOverlay(): void {
  if (overlayContainer) { overlayContainer.destroy(true); overlayContainer = null; }
}

function makeButton(
  label: string, cx: number, cy: number, w: number, h: number,
  color: number, onClick: () => void
): Phaser.GameObjects.Container {
  const g = scene.make.graphics();
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.lineStyle(2, COLORS.ui.border, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);

  const txt = scene.add.text(0, 0, label, TEXT_STYLES.button).setOrigin(0.5);

  const c = scene.add.container(cx, cy, [g, txt]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => {
      scene.tweens.add({ targets: c, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
      onClick();
    });
  return c;
}

// ─── Pot Illustration (Title Screen — top-down view) ─────────────────────────

function drawPotIllustration(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number): void {
  const R = size / 2;

  // Outer rim ring
  g.fillStyle(COLORS.tile.potWall, 1);
  g.fillCircle(cx, cy, R);

  // Inner broth pool
  g.fillStyle(COLORS.broth.base, 1);
  g.fillCircle(cx, cy, R - 18);

  // Shimmer rings
  g.lineStyle(2, COLORS.broth.shimmer, 0.28);
  g.strokeCircle(cx, cy, (R - 18) * 0.65);
  g.strokeCircle(cx, cy, (R - 18) * 0.35);

  // Rim highlight
  g.lineStyle(5, 0xffffff, 0.13);
  g.beginPath();
  g.arc(cx, cy, R - 9, Math.PI * 1.1, Math.PI * 1.6);
  g.strokePath();

  // Floating ingredients around the pool
  const ingAngles = [0, 0.8, 1.6, 2.4, 3.2, 3.9, 4.7, 5.5];
  const ingTypes  = [0, 3,   1,   5,   2,   6,   4,   7  ];
  for (let i = 0; i < ingAngles.length; i++) {
    const dist = (R - 26) * (i % 2 === 0 ? 0.55 : 0.32);
    const ix = cx + Math.cos(ingAngles[i]) * dist;
    const iy = cy + Math.sin(ingAngles[i]) * dist;
    // Translate graphics to ingredient position, draw, reset
    g.translateCanvas(ix, iy);
    g.fillStyle(0x000000, 0); // no-op style reset
    drawIngredient(g, ingTypes[i]);
    g.translateCanvas(-ix, -iy);
  }

  // Handles on left/right
  g.fillStyle(COLORS.tile.potHandle, 1);
  g.fillRoundedRect(cx - R - 36, cy - 18, 36, 36, 8);
  g.fillRoundedRect(cx + R,      cy - 18, 36, 36, 8);
  g.lineStyle(2, COLORS.tile.startGlow, 0.9);
  g.strokeRoundedRect(cx - R - 36, cy - 18, 36, 36, 8);
  g.lineStyle(2, COLORS.tile.endGlow, 0.9);
  g.strokeRoundedRect(cx + R, cy - 18, 36, 36, 8);

  // Steam
  g.lineStyle(3, COLORS.broth.shimmer, 0.45);
  for (let i = -1; i <= 1; i++) {
    const sx = cx + i * 45;
    g.lineBetween(sx, cy - R - 8,  sx - 8,  cy - R - 28);
    g.lineBetween(sx - 8, cy - R - 28, sx, cy - R - 48);
  }
}


// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = createGameConfig();
config.scene = { create, update };
new Phaser.Game(config);
