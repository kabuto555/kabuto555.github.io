/**
 * audio.ts — All synthesised sound for Super Turd Busters.
 *
 * No audio files are loaded. Everything is Web Audio API synthesis.
 * Call initAudio() once on the first user gesture (Phaser's pointerup works).
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmGain: GainNode | null = null;   // BGM-only gain — ducked during fanfare
let bgmNode: ReturnType<typeof startBGM> | null = null;
let bgmRunning = false;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export function initAudio(): void {
  if (ctx) return;
  ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(ctx.destination);
  // BGM feeds through its own gain node so we can duck it independently
  bgmGain = ctx.createGain();
  bgmGain.gain.value = 1.0;
  bgmGain.connect(masterGain);
}

function getCtx(): AudioContext {
  if (!ctx) initAudio();
  return ctx!;
}

function getMaster(): GainNode {
  if (!masterGain) initAudio();
  return masterGain!;
}

function getBgmGain(): GainNode {
  if (!bgmGain) initAudio();
  return bgmGain!;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noteHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Create a gain envelope: attack → sustain → release */
function envelope(
  gain: GainNode,
  now: number,
  attack: number,
  sustain: number,
  release: number,
  peak = 1,
): void {
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.setValueAtTime(peak, now + attack + sustain);
  gain.gain.linearRampToValueAtTime(0, now + attack + sustain + release);
}

// ─── SFX: NES bup-bup-bup move sound ────────────────────────────────────────
// Staccato square-wave blips at mid-high pitch — one blip per call,
// rapid-fires as the snake steps each cell.
export function sfxBup(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(494, now);
  osc.frequency.linearRampToValueAtTime(440, now + 0.028);
  const g = ac.createGain();
  envelope(g, now, 0.002, 0.012, 0.016, 0.13); // was 0.28 — halved
  osc.connect(g);
  g.connect(getMaster());
  osc.start(now);
  osc.stop(now + 0.04);
}

// ─── SFX: NES rewind bup (undo) — descending pitch blip ─────────────────────
export function sfxBupRewind(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  // Pitch sweeps down quickly — rewinding feel
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(370, now);
  osc.frequency.linearRampToValueAtTime(220, now + 0.032);
  const g = ac.createGain();
  envelope(g, now, 0.002, 0.010, 0.018, 0.24);
  osc.connect(g);
  g.connect(getMaster());
  osc.start(now);
  osc.stop(now + 0.04);
}

// ─── SFX: Wall Thud ───────────────────────────────────────────────────────────

export function sfxThud(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  // Low sine sweep: thud impact
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);

  // Short noise layer for "smack" texture
  const bufLen = Math.floor(ac.sampleRate * 0.08);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noiseSrc = ac.createBufferSource();
  noiseSrc.buffer = buf;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 350;
  const noiseGain = ac.createGain();
  envelope(noiseGain, now, 0.002, 0.01, 0.07, 0.18);

  const g = ac.createGain();
  envelope(g, now, 0.002, 0.02, 0.1, 0.55);

  osc.connect(g);
  g.connect(getMaster());
  osc.start(now);
  osc.stop(now + 0.18);

  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(getMaster());
  noiseSrc.start(now);
  noiseSrc.stop(now + 0.1);
}

// ─── SFX: Poop Squelch ────────────────────────────────────────────────────────

export function sfxSquelch(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  // Descending sine “splat” blob — longer sweep, louder
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, now);               // start higher
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.32); // longer sweep
  const g = ac.createGain();
  envelope(g, now, 0.005, 0.12, 0.18, 0.55);            // tad quieter (was 0.75)
  osc.connect(g);
  g.connect(getMaster());
  osc.start(now);
  osc.stop(now + 0.38);

  // Wet noise burst — longer and louder
  const bufLen = Math.floor(ac.sampleRate * 0.30);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const nd = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
  const nSrc = ac.createBufferSource();
  nSrc.buffer = buf;

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700, now);
  bp.frequency.linearRampToValueAtTime(160, now + 0.26);
  bp.Q.value = 2.0;

  const ng = ac.createGain();
  envelope(ng, now, 0.004, 0.10, 0.16, 0.38);           // tad quieter (was 0.50)
  nSrc.connect(bp);
  bp.connect(ng);
  ng.connect(getMaster());
  nSrc.start(now);
  nSrc.stop(now + 0.32);

  // High-pitched “pip” for cartoon feel
  const pip = ac.createOscillator();
  pip.type = 'square';
  pip.frequency.setValueAtTime(1040, now + 0.04);        // higher pip
  pip.frequency.exponentialRampToValueAtTime(520, now + 0.16);
  const pg = ac.createGain();
  envelope(pg, now + 0.04, 0.005, 0.06, 0.08, 0.16);    // tad quieter (was 0.20)
  pip.connect(pg);
  pg.connect(getMaster());
  pip.start(now + 0.04);
  pip.stop(now + 0.22);
}

// ─── SFX: Level Clear (fanfare + flush) ───────────────────────────────────────

export function sfxLevelClear(): void {
  const ac  = getCtx();
  const now = ac.currentTime;

  // Fanfare starts after a short delay so the squelch SFX finishes first
  const DELAY = 0.32;
  const t0    = now + DELAY;

  // ── Duck the BGM ────────────────────────────────────────────────────────────
  const duck    = getBgmGain().gain;
  const duckEnd = t0 + 1.5;
  const riseEnd = duckEnd + 0.4;
  duck.cancelScheduledValues(now);
  duck.setValueAtTime(duck.value, now);
  duck.linearRampToValueAtTime(0.12, now + 0.08);
  duck.setValueAtTime(0.12, duckEnd);
  duck.linearRampToValueAtTime(1.0, riseEnd);

  // ── Jingle: Japanese 90s puzzle-clear style ──────────────────────────────
  //
  // Inspired by Puyo Puyo / Panel de Pon / Tetris Attack clears:
  // bright F-major, two-voice (square lead + triangle harmony),
  // percussive rimshot accent, ends on a punchy held chord.
  //
  // Melody phrase (16th + 8th note mix, ~1.1 s total):
  //   F5  A5  C6  A5 | F5  G5  A5  (quick run)
  //   C6  –  –  –  | F5  (landing)
  // Harmony: thirds below the melody
  //
  // Tempo feel: ~180 BPM → 16th = 0.083 s, 8th = 0.167 s

  const S = 0.083;  // 16th note duration
  const E = S * 2;  // 8th note
  const Q = S * 4;  // quarter note

  // helper: schedule one square-wave melody note
  const mel = (midi: number, t: number, dur: number, vol = 0.32) => {
    const o = ac.createOscillator(); o.type = 'square';
    o.frequency.value = noteHz(midi);
    const g = ac.createGain();
    envelope(g, t, 0.005, dur * 0.6, dur * 0.35, vol);
    o.connect(g); g.connect(getMaster());
    o.start(t); o.stop(t + dur + 0.02);
  };

  // helper: schedule one triangle harmony note
  const har = (midi: number, t: number, dur: number, vol = 0.18) => {
    const o = ac.createOscillator(); o.type = 'triangle';
    o.frequency.value = noteHz(midi);
    const g = ac.createGain();
    envelope(g, t, 0.008, dur * 0.55, dur * 0.38, vol);
    o.connect(g); g.connect(getMaster());
    o.start(t); o.stop(t + dur + 0.02);
  };

  // helper: rimshot-style percussive accent
  const rim = (t: number) => {
    // short filtered noise burst
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const hp  = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g   = ac.createGain();
    envelope(g, t, 0.001, 0.015, 0.04, 0.30);
    src.connect(hp); hp.connect(g); g.connect(getMaster());
    src.start(t); src.stop(t + 0.07);
    // body click
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.linearRampToValueAtTime(200, t + 0.03);
    const og = ac.createGain();
    envelope(og, t, 0.001, 0.01, 0.025, 0.22);
    o.connect(og); og.connect(getMaster());
    o.start(t); o.stop(t + 0.04);
  };

  // ── Phrase 1: quick rising run F5–A5–C6 (16ths) ──
  //   F5=77  A5=81  C6=84
  let cur = t0;
  mel(77, cur, S);        har(65, cur, S);         cur += S;   // F5 / F4
  mel(81, cur, S);        har(69, cur, S);         cur += S;   // A5 / A4
  mel(84, cur, E);        har(72, cur, E);         cur += E;   // C6 / C5 (held 8th)

  // ── Phrase 2: bounce A5–G5–A5 (16ths) ──
  mel(81, cur, S);        har(69, cur, S);         cur += S;   // A5
  mel(79, cur, S);        har(67, cur, S);         cur += S;   // G5 / G4
  mel(81, cur, S);        har(69, cur, S);         cur += S;   // A5

  // ── Phrase 3: ascending cadence C6–D6 (16ths) ──
  mel(84, cur, S);        har(72, cur, S);         cur += S;   // C6
  mel(86, cur, S);        har(74, cur, S);         cur += S;   // D6 / D5

  // ── Landing: F6 quarter + rimshot accent ──
  rim(cur);
  mel(89, cur, Q, 0.38);  har(77, cur, Q, 0.22);              // F6 / F5 big landing note
  cur += Q * 0.5;

  // ── Resolution chord: F-major triad (F5+A5+C6+F6) ──
  const chordT = cur + Q * 0.55;
  [77, 81, 84, 89].forEach(midi => mel(midi, chordT, Q * 1.6, 0.22));
  [65, 69, 72, 77].forEach(midi => har(midi, chordT, Q * 1.6, 0.14));
  rim(chordT);

  // ── Flush whoosh layered under the jingle ─────────────────────────────────
  const flushStart = t0 + 0.1;
  const flushLen   = 1.2;
  const fbufLen    = Math.floor(ac.sampleRate * flushLen);
  const fbuf       = ac.createBuffer(1, fbufLen, ac.sampleRate);
  const fd         = fbuf.getChannelData(0);
  for (let i = 0; i < fbufLen; i++) fd[i] = Math.random() * 2 - 1;
  const fSrc = ac.createBufferSource(); fSrc.buffer = fbuf;
  const fBP  = ac.createBiquadFilter(); fBP.type = 'bandpass';
  fBP.frequency.setValueAtTime(2400, flushStart);
  fBP.frequency.exponentialRampToValueAtTime(120, flushStart + flushLen);
  fBP.Q.value = 1.8;
  const fLP  = ac.createBiquadFilter(); fLP.type = 'lowpass';
  fLP.frequency.setValueAtTime(3000, flushStart);
  fLP.frequency.exponentialRampToValueAtTime(300, flushStart + flushLen);
  const fg = ac.createGain();
  envelope(fg, flushStart, 0.05, flushLen * 0.45, flushLen * 0.5, 0.28); // quieter under jingle
  fSrc.connect(fBP); fBP.connect(fLP); fLP.connect(fg); fg.connect(getMaster());
  fSrc.start(flushStart); fSrc.stop(flushStart + flushLen + 0.05);

  // Gurgle blips
  for (let b = 0; b < 5; b++) {
    const bt = flushStart + 0.08 + b * 0.16;
    const bo = ac.createOscillator(); bo.type = 'sine';
    bo.frequency.setValueAtTime(360 - b * 30, bt);
    bo.frequency.linearRampToValueAtTime(160 - b * 18, bt + 0.1);
    const bg = ac.createGain();
    envelope(bg, bt, 0.005, 0.04, 0.06, 0.10);
    bo.connect(bg); bg.connect(getMaster());
    bo.start(bt); bo.stop(bt + 0.14);
  }
}

// ─── BGM: 90s Japanese arcade/SNES puzzle chiptune ─────────────────────────
//
// Inspired by Puyo Puyo, Magical Drop, Panel de Pon, Puzzle Bobble.
// Structure: 4/4, 175 BPM — energetic and fast.
// Step unit: 16th note  (BEAT/4)
// - Melody:   Square wave, D-major, 8-bar A section + 8-bar B section
// - Harmony:  Triangle, inner thirds/sixths
// - Arp:      Triangle, offbeat chord arpeggios (Puyo Puyo flavour)
// - Bass:     Triangle, quarter-note root/fifth pump
// - Kick:     On beats 1 & 3 (steps 0, 8 of each bar)
// - Snare:    On beats 2 & 4 (steps 4, 12 of each bar)
// - Hi-hat:   16th-note pulse for speed feel

const BPM       = 175;
const BEAT      = 60 / BPM;          // seconds per beat (~0.343 s)
const STEP      = BEAT / 4;          // 16th note (~0.0857 s)
const LOOKAHEAD = STEP * 4;          // schedule 4 steps ahead
const SCHEDULE  = STEP * 3;          // call scheduler every ~3 steps

// ── Melody: D major, 8+8 bars, 16 steps/bar = 128 steps total ──────────────
// D4=62 F#4=66 A4=69 B4=71 D5=74 E5=76 F#5=78 A5=81 B5=83 D6=86 E6=88
// 0 = rest
const MELODY_NOTES: number[] = [
  // ── Section A (bars 1–8): energetic hook ─────────────────────────────────
  // Bar 1 — opening run up
  74, 0,  78, 0,  81, 0,  83, 0,  81, 78, 76, 74,  0,  0,  0,  0,
  // Bar 2 — sequence down with syncopation
  78, 0,  76, 74, 76, 0,   0, 74,  71, 0,  74, 0,  76, 74, 71, 0,
  // Bar 3 — rising phrase
  74, 0,  76, 0,  78, 0,  81, 0,  83, 0,  81, 83,  86, 0,   0, 0,
  // Bar 4 — answer phrase, cadence
  83, 0,  81, 78, 76, 0,  78, 0,   0, 76, 74, 0,   71, 0,  69, 0,
  // Bar 5 — hook repeat with variation
  74, 0,  78, 0,  81, 83, 81, 0,  78, 0,  76, 78,  81, 0,   0, 0,
  // Bar 6 — busier run
  76, 74, 76, 78, 81, 0,  78, 76,  74, 76, 74, 71,  74, 0,   0, 0,
  // Bar 7 — build up
  78, 0,  81, 0,  83, 0,  86, 0,  88, 86, 83, 81,  83, 0,   0, 0,
  // Bar 8 — turnaround back to top
  81, 0,  78, 76, 74, 0,  71, 0,   69, 0, 71, 74,  76, 0,   0, 0,
  // ── Section B (bars 9–16): secondary theme ────────────────────────────────
  // Bar 9 — new melodic idea, stepwise
  83, 0,   0, 83, 81, 83, 81, 78,  76, 0,  78, 0,  81, 0,   0, 0,
  // Bar 10
  78, 0,  76, 0,  74, 76, 74, 71,  69, 0,  71, 0,  74, 0,   0, 0,
  // Bar 11 — call
  76, 0,  78, 0,  81, 0,  83, 81,  78, 76, 74, 0,   0, 74,  76, 0,
  // Bar 12 — response
  78, 0,  81, 83, 81, 0,  78, 0,  76, 0,  74, 76,  78, 0,   0, 0,
  // Bar 13 — energetic run
  74, 76, 78, 81, 83, 81, 78, 76,  74, 0,  76, 0,  78, 81,  83, 0,
  // Bar 14 — winding down phrase
  81, 0,  78, 0,  76, 0,  74, 0,  71, 0,  69, 71,  74, 0,   0, 0,
  // Bar 15 — build to ending
  78, 0,  81, 0,  83, 0,  86, 83, 81, 83, 81, 78,  76, 0,  78, 0,
  // Bar 16 — final turnaround
  81, 78, 76, 74, 71, 0,  69, 0,  71, 74, 76, 78,  81, 0,   0, 0,
];

// ── Harmony: triangle, thirds/sixths below melody ────────────────────────────
const COUNTER_NOTES: number[] = [
  // Section A
  71, 0,  74, 0,  78, 0,  81, 0,  78, 74, 71, 69,   0,  0,  0,  0,
  74, 0,  71, 69, 71, 0,   0, 71,  66, 0,  69, 0,  71, 69, 66, 0,
  71, 0,  74, 0,  76, 0,  78, 0,  81, 0,  78, 81,  83, 0,   0, 0,
  81, 0,  78, 74, 71, 0,  74, 0,   0, 71, 69, 0,   66, 0,  64, 0,
  71, 0,  74, 0,  78, 81, 78, 0,  74, 0,  71, 74,  78, 0,   0, 0,
  71, 69, 71, 74, 78, 0,  74, 71,  69, 71, 69, 66,  69, 0,   0, 0,
  74, 0,  78, 0,  81, 0,  83, 0,  86, 83, 81, 78,  81, 0,   0, 0,
  78, 0,  74, 71, 69, 0,  66, 0,   64, 0, 66, 69,  71, 0,   0, 0,
  // Section B
  81, 0,   0, 81, 78, 81, 78, 74,  71, 0,  74, 0,  78, 0,   0, 0,
  74, 0,  71, 0,  69, 71, 69, 66,  64, 0,  66, 0,  69, 0,   0, 0,
  71, 0,  74, 0,  78, 0,  81, 78,  74, 71, 69, 0,   0, 69,  71, 0,
  74, 0,  78, 81, 78, 0,  74, 0,  71, 0,  69, 71,  74, 0,   0, 0,
  69, 71, 74, 78, 81, 78, 74, 71,  69, 0,  71, 0,  74, 78,  81, 0,
  78, 0,  74, 0,  71, 0,  69, 0,  66, 0,  64, 66,  69, 0,   0, 0,
  74, 0,  78, 0,  81, 0,  83, 81, 78, 81, 78, 74,  71, 0,  74, 0,
  78, 74, 71, 69, 66, 0,  64, 0,  66, 69, 71, 74,  78, 0,   0, 0,
];

// ── Chord arp: triangle, offbeat 16ths on D-major triads ─────────────────────
// Plays on 16th-note offbeats (steps 1,3,5,7... of pattern)
// Pattern: D triad (D4=62, F#4=66, A4=69) / A triad (A3=57, C#4=61, E4=64)
// / G triad (G3=55, B3=59, D4=62) cycling per bar
const ARP_NOTES: number[] = [
  // bar 1–2: D  D  D  D  | A  A  A  A
   0,62, 0,66,  0,69, 0,62,   0,66, 0,69,  0,62, 0,66,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
  // bar 3–4: G  G  G  G  | A  A  A  A
   0,55, 0,59,  0,62, 0,55,   0,59, 0,62,  0,55, 0,59,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
  // bar 5–6: D  D  D  D  | Bm Bm Bm Bm (B3=59,D4=62,F#4=66)
   0,62, 0,66,  0,69, 0,62,   0,66, 0,69,  0,62, 0,66,
   0,59, 0,62,  0,66, 0,59,   0,62, 0,66,  0,59, 0,62,
  // bar 7–8: G  G  G  G  | A  A  A  A
   0,55, 0,59,  0,62, 0,55,   0,59, 0,62,  0,55, 0,59,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
  // bar 9–16: repeat same chord pattern
   0,62, 0,66,  0,69, 0,62,   0,66, 0,69,  0,62, 0,66,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
   0,55, 0,59,  0,62, 0,55,   0,59, 0,62,  0,55, 0,59,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
   0,62, 0,66,  0,69, 0,62,   0,66, 0,69,  0,62, 0,66,
   0,59, 0,62,  0,66, 0,59,   0,62, 0,66,  0,59, 0,62,
   0,55, 0,59,  0,62, 0,55,   0,59, 0,62,  0,55, 0,59,
   0,57, 0,61,  0,64, 0,57,   0,61, 0,64,  0,57, 0,61,
];

// ── Bass: triangle, one note per beat (quarter note) ─────────────────────────
// 4 beats/bar × 16 bars = 64 entries   D2=38 A2=45 G2=43 Bm=47 E2=40
const BASS_NOTES: number[] = [
  // Section A (bars 1–8)
  50, 50, 57, 57,   // bar 1:  D3 D3 A3 A3
  50, 50, 57, 45,   // bar 2:  D3 D3 A3 A2
  43, 43, 57, 57,   // bar 3:  G2 G2 A2 A2  (wait—let's keep in D octave)
  50, 50, 57, 57,   // bar 4:  D3 D3 A3 A3  (reuse pattern)
  50, 50, 59, 57,   // bar 5:  D3 D3 B3 A3
  47, 47, 50, 50,   // bar 6:  B2 B2 D3 D3
  43, 43, 57, 57,   // bar 7:  G2 G2 A3 A3
  50, 45, 43, 45,   // bar 8:  D3 A2 G2 A2 (turnaround)
  // Section B (bars 9–16)
  50, 57, 50, 57,   // bar 9
  50, 50, 43, 45,   // bar 10
  47, 47, 50, 57,   // bar 11
  50, 57, 47, 50,   // bar 12
  50, 50, 57, 57,   // bar 13
  47, 50, 43, 45,   // bar 14
  43, 43, 57, 57,   // bar 15
  50, 45, 43, 45,   // bar 16 (turnaround back to top)
];

// ── Drums: 16-step pattern (1 bar), repeats ───────────────────────────────────
// K=kick S=snare H=hihat _=rest
// 16th grid:  1e+a 2e+a 3e+a 4e+a
type DrumHit = 'K' | 'S' | 'H' | '_';
const DRUM_PATTERN: DrumHit[] = [
  'K','H','H','H', 'S','H','H','H', 'K','H','K','H', 'S','H','H','H',
];

function playSquareNote(ac: AudioContext, out: AudioNode, hz: number, t: number, dur: number, vol = 0.18): void {
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.value = hz;
  const g = ac.createGain();
  envelope(g, t, 0.008, dur * 0.6, dur * 0.35, vol);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function playTriNote(ac: AudioContext, out: AudioNode, hz: number, t: number, dur: number, vol = 0.22): void {
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = hz;
  const g = ac.createGain();
  envelope(g, t, 0.01, dur * 0.65, dur * 0.3, vol);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function playKick(ac: AudioContext, out: AudioNode, t: number): void {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ac.createGain();
  envelope(g, t, 0.003, 0.05, 0.1, 0.55);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + 0.2);
}

function playSnare(ac: AudioContext, out: AudioNode, t: number): void {
  const bufLen = Math.floor(ac.sampleRate * 0.12);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const g = ac.createGain();
  envelope(g, t, 0.002, 0.025, 0.07, 0.28);
  src.connect(hp); hp.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.12);

  // Body sine click
  const body = ac.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(220, t);
  body.frequency.linearRampToValueAtTime(110, t + 0.05);
  const bg2 = ac.createGain();
  envelope(bg2, t, 0.002, 0.02, 0.05, 0.18);
  body.connect(bg2); bg2.connect(out);
  body.start(t); body.stop(t + 0.08);
}

function playHihat(ac: AudioContext, out: AudioNode, t: number): void {
  const bufLen = Math.floor(ac.sampleRate * 0.04);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ac.createGain();
  envelope(g, t, 0.001, 0.01, 0.025, 0.14);
  src.connect(hp); hp.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.045);
}

interface BGMHandle {
  stop(): void;
}

function startBGM(ac: AudioContext, out: AudioNode): BGMHandle {
  // Separate gain buses
  const melGain  = ac.createGain(); melGain.gain.value  = 0.85; melGain.connect(out);
  const ctrGain  = ac.createGain(); ctrGain.gain.value  = 0.55; ctrGain.connect(out);
  const arpGain  = ac.createGain(); arpGain.gain.value  = 0.30; arpGain.connect(out);
  const basGain  = ac.createGain(); basGain.gain.value  = 0.80; basGain.connect(out);
  const drumGain = ac.createGain(); drumGain.gain.value = 0.70; drumGain.connect(out);

  const totalSteps = MELODY_NOTES.length;   // 256 (16 bars × 16 steps)
  const totalBeats = BASS_NOTES.length;     // 64  (16 bars × 4 beats)
  const totalArp   = ARP_NOTES.length;      // 256
  const drumSteps  = DRUM_PATTERN.length;   // 16  (1 bar)

  let stepIdx = 0;   // 16th-note step index
  let beatIdx = 0;   // quarter-note beat index (increments every 4 steps)
  let nextTime = ac.currentTime + 0.05;
  let stopped  = false;

  function schedule(): void {
    if (stopped) return;
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      const t = nextTime;
      const si = stepIdx % totalSteps;

      // Melody (square)
      const mMidi = MELODY_NOTES[si];
      if (mMidi > 0) playSquareNote(ac, melGain, noteHz(mMidi), t, STEP * 0.78);

      // Harmony counter (triangle)
      const cMidi = COUNTER_NOTES[si];
      if (cMidi > 0) playTriNote(ac, ctrGain, noteHz(cMidi), t, STEP * 0.72, 0.14);

      // Chord arp (triangle, short stabs)
      const aMidi = ARP_NOTES[stepIdx % totalArp];
      if (aMidi > 0) playTriNote(ac, arpGain, noteHz(aMidi), t, STEP * 0.45, 0.18);

      // Bass — fires every 4 steps (quarter note)
      if (stepIdx % 4 === 0) {
        const bMidi = BASS_NOTES[beatIdx % totalBeats];
        if (bMidi > 0) playTriNote(ac, basGain, noteHz(bMidi), t, BEAT * 0.88, 0.28);
        beatIdx++;
      }

      // Drums
      const hit = DRUM_PATTERN[stepIdx % drumSteps];
      if      (hit === 'K') playKick  (ac, drumGain, t);
      else if (hit === 'S') playSnare (ac, drumGain, t);
      else if (hit === 'H') playHihat (ac, drumGain, t);

      stepIdx++;
      nextTime += STEP;
    }
  }

  const intervalId = window.setInterval(schedule, SCHEDULE * 1000);
  schedule(); // prime immediately

  return {
    stop() {
      stopped = true;
      window.clearInterval(intervalId);
    },
  };
}

// ─── Public BGM controls ──────────────────────────────────────────────────────

export function startMusic(): void {
  if (bgmRunning) return;
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  bgmNode = startBGM(ac, getBgmGain()); // BGM routes through bgmGain, not masterGain
  bgmRunning = true;
}

export function stopMusic(): void {
  if (!bgmRunning || !bgmNode) return;
  bgmNode.stop();
  bgmNode = null;
  bgmRunning = false;
}
