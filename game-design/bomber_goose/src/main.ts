import {
  GAME_WIDTH, GAME_HEIGHT,
  GRID_COLS, GRID_ROWS, GRID_EMPTY_ROWS,
  CELL_SIZE, CELL_GAP,
  GRID_ORIGIN_X, GRID_ORIGIN_Y,
  BLOCK_COLORS, COLORS, TEXT_STYLES,
  LEVEL_CONFIG,
  SCORE_BASE, comboMultiplier,
  createGameConfig,
} from './config';
import { Cell, GameState, PoopDef, PoopKind } from './types';

// ─── Scene-level refs ────────────────────────────────────────────────────────
let scene: Phaser.Scene;
let state: GameState;

// Title screen
let titleActive = true;
let titleContainer: Phaser.GameObjects.Container | null = null;
let titlePoopTimer: Phaser.Time.TimerEvent | null = null;

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
let bgmScheduler: number | null = null;   // setInterval handle
let bgmBarIndex  = 0;                     // which bar we're on (loops)
let bgmNextTime  = 0;                     // Web Audio clock for next event
let bgmTempo     = 88;                    // BPM — bumped per level
let bgmMasterGain: GainNode | null = null;
let bgmRunning   = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ─── BGM: Original Toronto-inspired late-night synth track ───────────────────
// Original composition in D minor at 95 BPM.
// Aesthetic: sparse trap drums, warm sub-bass, lush detuned pads, melodic lead.

// ─── BGM: 90s Boom-Bap — Original Composition ────────────────────────────────────
// C minor, 88 BPM, 4-bar loop.
// Channels: kick, snare, sub-bass, piano chords, ambient synth pad.
// Chord progression: Cm – Ab – Eb – Bb  (i–VI–III–VII)
// Freq ref (C minor): C3=131 D3=147 Eb3=156 F3=175 G3=196 Ab3=208 Bb3=233 C4=262

/** Boom-bap kick — deep sine thud, long warm tail */
function bgmKick(ctx: AudioContext, master: GainNode, t: number): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(master);
  osc.type = 'sine';
  // Pitch drops fast: classic boom-bap body
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  gain.gain.setValueAtTime(0.0, t);
  gain.gain.linearRampToValueAtTime(0.88, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  osc.start(t); osc.stop(t + 0.44);
  // Sub-click layer for attack transient
  const click = ctx.createOscillator();
  const cg    = ctx.createGain();
  click.connect(cg); cg.connect(master);
  click.type = 'sine';
  click.frequency.setValueAtTime(520, t);
  click.frequency.exponentialRampToValueAtTime(60, t + 0.018);
  cg.gain.setValueAtTime(0.38, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  click.start(t); click.stop(t + 0.025);
}

/** Boom-bap snare — layered noise body + tonal crack */
function bgmSnare(ctx: AudioContext, master: GainNode, t: number): void {
  // Noise body
  const bufLen = Math.ceil(ctx.sampleRate * 0.22);
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp  = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const ng  = ctx.createGain();
  ng.gain.setValueAtTime(0.0,  t);
  ng.gain.linearRampToValueAtTime(0.50, t + 0.003);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  src.connect(hp); hp.connect(ng); ng.connect(master);
  src.start(t);
  // Tonal crack
  const osc = ctx.createOscillator();
  const og  = ctx.createGain();
  osc.connect(og); og.connect(master);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(260, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.055);
  og.gain.setValueAtTime(0.32, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.start(t); osc.stop(t + 0.08);
}

/** Sub-bass — warm sine with gentle attack, long sustain */
function bgmBass(ctx: AudioContext, master: GainNode, t: number, freq: number, dur: number): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(master);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0, t);
  gain.gain.linearRampToValueAtTime(0.62, t + 0.035);
  gain.gain.setValueAtTime(0.62, t + dur - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.02);
}

/** Piano chord — triangle oscillators with fast attack, natural ring decay */
function bgmPiano(ctx: AudioContext, master: GainNode, t: number, freqs: number[], dur: number): void {
  freqs.forEach((f, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(master);
    osc.type = 'triangle';
    osc.frequency.value = f;
    // Slight stagger per note for natural chord roll feel
    const onset = t + i * 0.012;
    const vol   = 0.13 / freqs.length;
    gain.gain.setValueAtTime(0.0,  onset);
    gain.gain.linearRampToValueAtTime(vol * 1.6, onset + 0.008); // bright transient
    gain.gain.exponentialRampToValueAtTime(vol,  onset + 0.06);  // settle
    gain.gain.setValueAtTime(vol,  onset + dur - 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + dur);
    osc.start(onset); osc.stop(onset + dur + 0.05);
  });
}

/** Ambient synth pad — slow-attack detuned sines, cold swelling texture */
function bgmPad(ctx: AudioContext, master: GainNode, t: number, freqs: number[], dur: number): void {
  freqs.forEach((f, fi) => {
    // Two detuned voices per note for width
    [-5, 5].forEach(detuneCents => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(master);
      osc.type   = 'sine';
      osc.frequency.value = f * Math.pow(2, detuneCents / 1200);
      const vol = 0.038 / freqs.length;
      // Slow swell in, hold, slow fade — ambient breath
      const attack  = dur * 0.30;
      const release = dur * 0.28;
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(vol, t + attack);
      gain.gain.setValueAtTime(vol,  t + dur - release);
      gain.gain.linearRampToValueAtTime(0.0, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
    });
  });
}

// ─── Song Data ────────────────────────────────────────────────────────────────────────
// 4-bar loop, 88 BPM. Each bar = 4 beats.
// Chord map: bar0=Cm  bar1=Ab  bar2=Eb  bar3=Bb
//
// Kick pattern: boom-bap feel
//   Beat 1 every bar (downbeat) + syncopated 16th-note ghost on the "e" of 3
//   (beat 2.5 = "and" of 2 in boom-bap, feel the pocket)
const BGM_KICKS: number[] = [
  0,    2.5,          // bar 0: 1, and-of-2
  4,    6.5,          // bar 1
  8,    10.5,         // bar 2
  12,   14.5,         // bar 3
];

// Snare: beats 2 & 4 of every bar
const BGM_SNARES: number[] = [1, 3, 5, 7, 9, 11, 13, 15];

// Sub-bass: slow root movement, one note per half-bar, long sustain
// [beat, freq-Hz, dur-beats]
const BGM_BASS_LINE: Array<[number, number, number]> = [
  // bar 0: Cm — C2=65.4
  [0,   65.4,  2.8],
  [3,   65.4,  0.9],
  // bar 1: Ab — Ab2=51.9 (Ab2=~52)
  [4,   51.9,  2.8],
  [7,   51.9,  0.9],
  // bar 2: Eb — Eb2=38.9
  [8,   77.8,  2.8],  // Eb3=77.8 (one octave up, fuller sound)
  [11,  77.8,  0.9],
  // bar 3: Bb — Bb2=58.3
  [12,  58.3,  2.8],
  [15,  58.3,  0.9],
];

// Piano chords: soulful voiced C minor progression
// Each chord held for slightly under 4 beats for natural separation
// Voiced in mid register: C4=262 D4=294 Eb4=311 F4=349 G4=392 Ab4=415 Bb4=466
const BGM_PIANO: Array<[number, number[], number]> = [
  // bar 0: Cm — C Eb G (minor triad)
  [0,  [262, 311, 392], 3.6],
  // bar 1: Ab — Ab C Eb (major triad)
  [4,  [415, 523, 622], 3.6],  // Ab4 C5 Eb5 — upper voicing for brightness
  // bar 2: Eb — Eb G Bb
  [8,  [311, 392, 466], 3.6],
  // bar 3: Bb — Bb D F
  [12, [466, 587, 698], 3.6],  // Bb4 D5 F5
];

// Ambient synth pad: same chord progression, full 4-beat sustain, slow swell
const BGM_PAD: Array<[number, number[], number]> = [
  // Lower octave voicing for depth separation from piano
  [0,  [131, 156, 196], 4.2],  // Cm: C3 Eb3 G3
  [4,  [104, 131, 156], 4.2],  // Ab: Ab2 C3 Eb3
  [8,  [156, 196, 233], 4.2],  // Eb: Eb3 G3 Bb3
  [12, [117, 147, 175], 4.2],  // Bb: Bb2 D3 F3
];

/**
 * Schedule one full 4-bar loop.
 * Returns the duration of the loop in seconds.
 */
function bgmScheduleLoop(ctx: AudioContext, master: GainNode, startT: number): number {
  const bps     = bgmTempo / 60;
  const beatSec = 1 / bps;
  const loopSec = 4 * 4 * beatSec; // 4 bars × 4 beats

  // Channel 1: Drums
  BGM_KICKS.forEach(b  => bgmKick(ctx, master, startT + b * beatSec));
  BGM_SNARES.forEach(b => bgmSnare(ctx, master, startT + b * beatSec));

  // Channel 2: Sub-bass
  BGM_BASS_LINE.forEach(([b, freq, dur]) =>
    bgmBass(ctx, master, startT + b * beatSec, freq, dur * beatSec),
  );

  // Channel 3: Piano chords
  BGM_PIANO.forEach(([b, freqs, dur]) =>
    bgmPiano(ctx, master, startT + b * beatSec, freqs, dur * beatSec),
  );

  // Channel 4: Ambient synth pad
  BGM_PAD.forEach(([b, freqs, dur]) =>
    bgmPad(ctx, master, startT + b * beatSec, freqs, dur * beatSec),
  );

  return loopSec;
}

/** Start BGM. Call on first user interaction. */
function startBGM(): void {
  if (bgmRunning) return;
  try {
    const ctx    = getAudioCtx();
    bgmRunning   = true;
    bgmNextTime  = ctx.currentTime + 0.05;

    // Master gain with gentle limiter-like ceiling
    bgmMasterGain = ctx.createGain();
    bgmMasterGain.gain.value = 0.38;
    bgmMasterGain.connect(ctx.destination);

    const LOOKAHEAD_MS  = 120;   // schedule this far ahead
    const INTERVAL_MS   = 80;    // how often the scheduler runs

    function tick(): void {
      if (!bgmRunning || !bgmMasterGain) return;
      const ctx2 = getAudioCtx();
      const scheduleUntil = ctx2.currentTime + LOOKAHEAD_MS / 1000;
      while (bgmNextTime < scheduleUntil) {
        // Sync tempo to current level each loop
        bgmTempo = 88 + (state?.level ?? 0) * 1;
        const loopDur = bgmScheduleLoop(ctx2, bgmMasterGain, bgmNextTime);
        bgmNextTime += loopDur;
        bgmBarIndex++;
      }
    }

    tick(); // prime immediately
    bgmScheduler = window.setInterval(tick, INTERVAL_MS) as unknown as number;
  } catch (_) { /* audio unavailable */ }
}

/** Stop BGM (fade out gracefully). */
function stopBGM(): void {
  bgmRunning = false;
  if (bgmScheduler !== null) { clearInterval(bgmScheduler); bgmScheduler = null; }
  if (bgmMasterGain) {
    try {
      const ctx = getAudioCtx();
      bgmMasterGain.gain.setValueAtTime(bgmMasterGain.gain.value, ctx.currentTime);
      bgmMasterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    } catch (_) {}
    bgmMasterGain = null;
  }
}

/** Goose poop SFX — honk squeak followed by a wet splat. */
function sfxGoosePoop(): void {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // ── Honk squeak: pitch-bent oscillator ──
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.start(now);
    osc.stop(now + 0.23);

    // ── Splat: short burst of filtered noise ──
    const splatStart = now + 0.18;
    const bufLen = Math.ceil(ctx.sampleRate * 0.14);
    const splatBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = splatBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = splatBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, splatStart);
    filter.frequency.exponentialRampToValueAtTime(180, splatStart + 0.13);

    const splatGain = ctx.createGain();
    splatGain.gain.setValueAtTime(0.55, splatStart);
    splatGain.gain.exponentialRampToValueAtTime(0.001, splatStart + 0.14);

    src.connect(filter);
    filter.connect(splatGain);
    splatGain.connect(ctx.destination);
    src.start(splatStart);
  } catch (_) { /* audio unavailable — silent fail */ }
}

/**
 * Block clear SFX — ascending chime sweep across the cleared group size,
 * so clearing more blocks produces a longer, higher-pitched ring.
 */
function sfxBlockClear(blockCount: number): void {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const count = Math.max(1, Math.min(blockCount, 20));

    // Base pitch scales with group size (more blocks = higher start)
    const baseFreq = 320 + count * 28;
    const steps = Math.min(count, 8);

    for (let i = 0; i < steps; i++) {
      const t = now + i * 0.045;
      const freq = baseFreq * Math.pow(1.12, i);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, t + 0.12);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.start(t);
      osc.stop(t + 0.24);
    }

    // Final bright pop at the end
    const popT = now + steps * 0.045;
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.connect(popGain);
    popGain.connect(ctx.destination);
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(baseFreq * Math.pow(1.12, steps), popT);
    popOsc.frequency.exponentialRampToValueAtTime(baseFreq * Math.pow(1.12, steps) * 1.5, popT + 0.06);
    popGain.gain.setValueAtTime(0.30, popT);
    popGain.gain.exponentialRampToValueAtTime(0.001, popT + 0.18);
    popOsc.start(popT);
    popOsc.stop(popT + 0.20);
  } catch (_) { /* audio unavailable — silent fail */ }
}

/** Construction row SFX — industrial thud, metallic rattle, then a rising crew whistle. */
function sfxConstructionRow(): void {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // ── Deep thud: low sine burst ──
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(90, now);
    thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    thudGain.gain.setValueAtTime(0.7, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thudOsc.start(now);
    thudOsc.stop(now + 0.20);

    // ── Metallic rattle: short noise burst through bandpass ──
    const rattleStart = now + 0.05;
    const rattleBufLen = Math.ceil(ctx.sampleRate * 0.18);
    const rattleBuf = ctx.createBuffer(1, rattleBufLen, ctx.sampleRate);
    const rattleData = rattleBuf.getChannelData(0);
    for (let i = 0; i < rattleBufLen; i++) rattleData[i] = (Math.random() * 2 - 1);

    const rattleSrc = ctx.createBufferSource();
    rattleSrc.buffer = rattleBuf;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2800, rattleStart);
    bandpass.Q.value = 3.5;

    const rattleGain = ctx.createGain();
    rattleGain.gain.setValueAtTime(0.32, rattleStart);
    rattleGain.gain.exponentialRampToValueAtTime(0.001, rattleStart + 0.18);

    rattleSrc.connect(bandpass);
    bandpass.connect(rattleGain);
    rattleGain.connect(ctx.destination);
    rattleSrc.start(rattleStart);

    // ── Crew whistle: quick ascending tone ──
    const whistleStart = now + 0.22;
    const whistleOsc = ctx.createOscillator();
    const whistleGain = ctx.createGain();
    whistleOsc.connect(whistleGain);
    whistleGain.connect(ctx.destination);
    whistleOsc.type = 'sine';
    whistleOsc.frequency.setValueAtTime(880, whistleStart);
    whistleOsc.frequency.exponentialRampToValueAtTime(1480, whistleStart + 0.14);
    whistleGain.gain.setValueAtTime(0.18, whistleStart);
    whistleGain.gain.exponentialRampToValueAtTime(0.001, whistleStart + 0.18);
    whistleOsc.start(whistleStart);
    whistleOsc.stop(whistleStart + 0.20);
  } catch (_) { /* audio unavailable — silent fail */ }
}

// Sprite layers
let gooseContainer: Phaser.GameObjects.Container;
let gooseImg: Phaser.GameObjects.Image;
let gooseFlapTimer: Phaser.Time.TimerEvent | null = null;
let gridContainer: Phaser.GameObjects.Container;
let poopSprite: Phaser.GameObjects.Container | null = null;
let constructionCrewGraphic: Phaser.GameObjects.Graphics | null = null;
let constructionMeterFill: Phaser.GameObjects.Graphics | null = null;
let constructionMeterBg: Phaser.GameObjects.Graphics | null = null;
let workerContainers: Phaser.GameObjects.Container[] = [];
let workerSparkTimer: Phaser.Time.TimerEvent | null = null;

// Construction timer — recreated on level-up
let constructionTimer: Phaser.Time.TimerEvent | null = null;

// HUD
let scoreText: Phaser.GameObjects.Text;
let levelText: Phaser.GameObjects.Text;
let nextLevelText: Phaser.GameObjects.Text;
let levelProgressBar: Phaser.GameObjects.Graphics;
let poopIndicator: Phaser.GameObjects.Container;
let poopIndicatorLabel: Phaser.GameObjects.Text;
let messageText: Phaser.GameObjects.Text;
let dangerOverlay: Phaser.GameObjects.Graphics;

// ─── Constants ────────────────────────────────────────────────────────────────
const CELL_INNER = CELL_SIZE - CELL_GAP;
const POOP_DROP_DURATION = 320; // ms — kept for future use

/** How many colors are currently in play. Pass an explicit level during init
 *  before state is assigned; otherwise reads from the live state.
 */
function activeColors(level?: number): number {
  const lvl = level ?? state?.level ?? 0;
  return LEVEL_CONFIG[lvl].unlockedColors;
}

// ─── Poop registry ───────────────────────────────────────────────────────────
// Modular: register new poop kinds here.
// Each handler receives (poop, grid) and returns the set of cells to destroy.

// Handler receives the poop def, the full grid, and the (row, col) where the
// poop landed. Returns the set of [row, col] cells to destroy.
type PoopHandler = (
  poop: PoopDef,
  grid: Cell[][],
  landRow: number,
  landCol: number,
) => Array<[number, number]>;

const POOP_HANDLERS: Record<PoopKind, PoopHandler> = {

  /**
   * Detonator: checks the 4 cells adjacent to the landing position.
   * For each neighbor that matches the poop color, flood-fills that
   * connected group and collects all cells in it to destroy.
   */
  detonator: (poop, grid, landRow, landCol) => {
    const adjacents: Array<[number, number]> = [
      [landRow - 1, landCol],
      [landRow + 1, landCol],
      [landRow,     landCol - 1],
      [landRow,     landCol + 1],
    ];

    const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
    const result: Array<[number, number]> = [];

    for (const [ar, ac] of adjacents) {
      if (
        ar >= 0 && ar < GRID_ROWS &&
        ac >= 0 && ac < GRID_COLS &&
        !visited[ar][ac] &&
        (grid[ar][ac].type === 'normal' || grid[ar][ac].type === 'poop') &&
        grid[ar][ac].colorIndex === poop.color
      ) {
        floodFillGroup(grid, ar, ac, poop.color, visited, result);
      }
    }

    return result;
  },

};

// ─── Entry Points ─────────────────────────────────────────────────────────────

function create(this: Phaser.Scene): void {
  scene = this;

  buildTextures();

  gridContainer = scene.add.container(0, 0);
  initState();
  buildGrid();
  buildGridOverlay();
  buildGoose();
  buildHUD();
  updateScoreHUD();
  buildPoopIndicator();
  buildConstructionCrew();
  // Construction timer starts only after title is dismissed
  setupInput();
  buildTitleScreen();
}

function update(_time: number, _delta: number): void {
  updateConstructionMeter();
  updateDangerOverlay();
}

// ─── Procedural Textures ──────────────────────────────────────────────────────

function buildTextures(): void {
  // One texture per color index
  BLOCK_COLORS.forEach((col, i) => {
    const g = scene.make.graphics({}, false);
    // Block face
    g.fillStyle(col.fill, 1);
    g.fillRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
    // Window grid illusion
    g.fillStyle(0x000000, 0.18);
    const winW = CELL_INNER * 0.22;
    const winH = CELL_INNER * 0.22;
    [[0.18, 0.18],[0.58, 0.18],[0.18, 0.56],[0.58, 0.56]].forEach(([fx, fy]) => {
      g.fillRoundedRect(CELL_INNER * fx, CELL_INNER * fy, winW, winH, 2);
    });
    // Highlight
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(0, 0, CELL_INNER, CELL_INNER * 0.3, { tl: 6, tr: 6, bl: 0, br: 0 });
    // Border
    g.lineStyle(2, col.border, 1);
    g.strokeRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
    g.generateTexture(`block_${i}`, CELL_INNER, CELL_INNER);
    g.destroy();
  });

  // Empty cell — fully transparent so background shows through
  {
    const g = scene.make.graphics({}, false);
    g.lineStyle(1, 0x3a4a5a, 0.35);
    g.strokeRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
    g.generateTexture('block_empty', CELL_INNER, CELL_INNER);
    g.destroy();
  }

  // Detonator poop: fresh falling teardrop — pointed tip at top, round at bottom
  {
    const sz = 64;
    const g = scene.make.graphics({}, false);

    // Main teardrop body (off-white)
    // Tip at top-centre, widens into a circle at the bottom
    const tipX = 32, tipY = 4;
    const bulgeX = 32, bulgeY = 40, bulgeR = 18;
    g.fillStyle(0xe8e8e0, 1);
    g.fillPoints([
      { x: tipX,          y: tipY },          // pointed tip
      { x: tipX + 8,      y: tipY + 14 },     // right shoulder
      { x: tipX + bulgeR, y: bulgeY },         // right side of bulge
      { x: tipX + bulgeR, y: bulgeY + 8 },
      { x: tipX + 12,     y: bulgeY + 18 },   // bottom-right
      { x: tipX,          y: bulgeY + 20 },   // bottom centre
      { x: tipX - 12,     y: bulgeY + 18 },   // bottom-left
      { x: tipX - bulgeR, y: bulgeY + 8 },
      { x: tipX - bulgeR, y: bulgeY },         // left side of bulge
      { x: tipX - 8,      y: tipY + 14 },     // left shoulder
    ], true, true);

    // Specular highlight — small bright ellipse upper-left of bulge
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(bulgeX - 6, bulgeY - 4, 10, 8);

    // Dark nucleus
    g.fillStyle(0x9a9080, 1);
    g.fillEllipse(bulgeX + 2, bulgeY + 4, 8, 7);

    g.generateTexture('poop_detonator', sz, sz);
    g.destroy();
  }

  // One color ring texture per block color — stable keys, never overwritten.
  // Uses the same teardrop outline as the poop body so the ring matches the shape.
  BLOCK_COLORS.forEach((col, i) => {
    const sz = 64;
    const g = scene.make.graphics({}, false);
    const tipX = 32, tipY = 4;
    const bulgeY = 40, bulgeR = 18;
    g.lineStyle(8, col.fill, 1);
    g.strokePoints([
      { x: tipX,          y: tipY },
      { x: tipX + 8,      y: tipY + 14 },
      { x: tipX + bulgeR, y: bulgeY },
      { x: tipX + bulgeR, y: bulgeY + 8 },
      { x: tipX + 12,     y: bulgeY + 18 },
      { x: tipX,          y: bulgeY + 20 },
      { x: tipX - 12,     y: bulgeY + 18 },
      { x: tipX - bulgeR, y: bulgeY + 8 },
      { x: tipX - bulgeR, y: bulgeY },
      { x: tipX - 8,      y: tipY + 14 },
    ], true, true);
    g.generateTexture(`poop_ring_${i}`, sz, sz);
    g.destroy();
  });
}

// ─── State Init ───────────────────────────────────────────────────────────────

function initState(): void {
  // Reset poop-color streak so a new game always starts fresh.
  lastPoopColor  = -1;
  lastPoopStreak =  0;

  const grid: Cell[][] = [];

  // Per-column stagger: each column's top 0–2 placeable rows are left empty
  // so the building has a natural jagged roofline.
  const colStagger: number[] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    colStagger.push(Phaser.Math.Between(0, 2));
  }

  for (let r = 0; r < GRID_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      // Empty zone = drop rows + 3-row buffer + per-column stagger
      if (r < GRID_EMPTY_ROWS + 3 + colStagger[c]) {
        grid[r][c] = { type: 'empty', colorIndex: -1, sprite: null };
      } else {
        const colorIndex = Phaser.Math.Between(0, activeColors(0) - 1);
        grid[r][c] = { type: 'normal', colorIndex, sprite: null };
      }
    }
  }

  state = {
    grid,
    score: 0,
    level: 0,
    gooseCol: Math.floor(GRID_COLS / 2),
    pendingPoop: pickRandomPoop(grid),
    animating: false,
    gameOver: false,
    constructionPending: false,
    queuedCol: null,
    queuedAt: 0,
  };
}

// Streak tracking: prevent the same poop color appearing more than 2 times in a row.
let lastPoopColor  = -1;
let lastPoopStreak =  0;

function pickRandomPoop(grid?: Cell[][]): PoopDef {
  // Only offer colors that still exist on the grid (normal blocks or placed poops).
  // Falls back to the full palette if no grid is provided or the grid is empty.
  const g = grid ?? state?.grid;
  const presentColors = new Set<number>();
  if (g) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = g[r][c];
        if (cell.type === 'normal' || cell.type === 'poop') {
          presentColors.add(cell.colorIndex);
        }
      }
    }
  }
  const pool = presentColors.size > 0
    ? Array.from(presentColors)
    : BLOCK_COLORS.map((_, i) => i);

  // Cap same-color streak at 2: if we've already shown this color twice in a
  // row and there are other colors available, exclude it from the pick.
  let pickPool = pool;
  if (lastPoopStreak >= 2 && pool.length > 1) {
    pickPool = pool.filter(c => c !== lastPoopColor);
  }

  const colorIndex = pickPool[Phaser.Math.Between(0, pickPool.length - 1)];

  // Update streak tracker.
  if (colorIndex === lastPoopColor) {
    lastPoopStreak++;
  } else {
    lastPoopColor  = colorIndex;
    lastPoopStreak = 1;
  }

  return { kind: 'detonator', color: colorIndex };
}

// ─── Grid Rendering ───────────────────────────────────────────────────────────

function buildGrid(): void {
  gridContainer.removeAll(true);

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = state.grid[r][c];
      const sprite = makeCellSprite(cell, r, c);
      cell.sprite = sprite;
      gridContainer.add(sprite);
    }
  }
}

/** Draw a permanent grid overlay for the placeable rows (rows GRID_EMPTY_ROWS+). */
function buildGridOverlay(): void {
  const g = scene.add.graphics();

  // Pixel bounds of the placeable area
  const x0 = GRID_ORIGIN_X;
  const y0 = GRID_ORIGIN_Y + GRID_EMPTY_ROWS * CELL_SIZE;
  const x1 = GRID_ORIGIN_X + GRID_COLS * CELL_SIZE;
  const y1 = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;

  // Interior grid lines only — no outer border (it confuses the drop zone boundary)
  g.lineStyle(1, 0xffffff, 0.12);

  // Vertical column dividers
  for (let c = 1; c < GRID_COLS; c++) {
    const lx = GRID_ORIGIN_X + c * CELL_SIZE;
    g.lineBetween(lx, y0, lx, y1);
  }

  // Horizontal row dividers
  for (let r = GRID_EMPTY_ROWS + 1; r < GRID_ROWS; r++) {
    const ly = GRID_ORIGIN_Y + r * CELL_SIZE;
    g.lineBetween(x0, ly, x1, ly);
  }
}

function cellX(col: number): number {
  return GRID_ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2;
}

function cellY(row: number): number {
  return GRID_ORIGIN_Y + row * CELL_SIZE + CELL_SIZE / 2;
}

function makeCellSprite(cell: Cell, row: number, col: number): Phaser.GameObjects.Container {
  const x = cellX(col);
  const y = cellY(row);

  const textureKey = cell.type === 'empty' ? 'block_empty' : `block_${cell.colorIndex}`;
  const img = scene.add.image(0, 0, textureKey);

  const container = scene.add.container(x, y, [img]);
  container.setSize(CELL_INNER, CELL_INNER);
  return container;
}

function refreshCellSprite(row: number, col: number): void {
  const cell = state.grid[row][col];
  if (cell.sprite) {
    cell.sprite.destroy();
    cell.sprite = null;
  }
  const sprite = makeCellSprite(cell, row, col);
  cell.sprite = sprite;
  gridContainer.add(sprite);
}

// ─── Goose ────────────────────────────────────────────────────────────────────

function buildGoose(): void {
  if (gooseContainer) gooseContainer.destroy();
  if (gooseFlapTimer) { gooseFlapTimer.remove(); gooseFlapTimer = null; }

  const W = 160, H = 140;

  // Generate three frames if not already cached
  if (!scene.textures.exists('goose_idle_0')) { drawGooseTexture('goose_idle_0', W, H, 'idle_0'); }
  if (!scene.textures.exists('goose_idle_1')) { drawGooseTexture('goose_idle_1', W, H, 'idle_1'); }
  if (!scene.textures.exists('goose_poop'))   { drawGooseTexture('goose_poop',   W, H, 'poop');   }

  gooseImg = scene.add.image(0, 0, 'goose_idle_0').setScale(0.85);
  gooseContainer = scene.add.container(
    cellX(state.gooseCol),
    GRID_ORIGIN_Y - 80,
    [gooseImg],
  );

  // Idle bobbing
  scene.tweens.add({
    targets: gooseContainer,
    y: gooseContainer.y - 12,
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  startGooseFlap();
}

/** Draw one goose frame into a texture. variant controls pose. */
function drawGooseTexture(key: string, W: number, H: number, variant: 'idle_0' | 'idle_1' | 'poop'): void {
  const g = scene.make.graphics({}, false);

  // Wing offset: idle_1 raises wing, poop spreads it
  const wingOffsetY = variant === 'idle_1' ? -14 : variant === 'poop' ? 6 : 0;
  const wingW       = variant === 'poop'   ? 130 : 80;
  const wingH       = variant === 'poop'   ? 22  : 30;
  // Body tilt: poop frame shifts body down-front
  const bodyOffsetY = variant === 'poop' ? 6 : 0;

  // ─ Body ─
  g.fillStyle(0x7a6a4a, 1);
  g.fillEllipse(78, 88 + bodyOffsetY, 110, 68);

  // ─ Breast ─
  g.fillStyle(0xd4bc8a, 1);
  g.fillEllipse(108, 94 + bodyOffsetY, 42, 52);

  // ─ Wing ─
  g.fillStyle(0x5a4e36, 1);
  g.fillEllipse(68, 82 + wingOffsetY, wingW, wingH);

  // ─ Tail ─
  g.fillStyle(0x111111, 1);
  g.fillTriangle(22, 80, 18, 108, 50, 92);

  // ─ Neck ─
  g.fillStyle(0x111111, 1);
  g.fillEllipse(104, 50, 28, 72);

  // ─ Head ─
  g.fillStyle(0x111111, 1);
  g.fillCircle(112, 26, 26);

  // ─ Chinstrap ─
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(108, 36, 30, 18);

  // ─ Beak (open on poop frame) ─
  g.fillStyle(0x1a1a1a, 1);
  if (variant === 'poop') {
    // Open beak — two triangles
    g.fillTriangle(132, 18, 155, 23, 133, 27);
    g.fillTriangle(132, 28, 155, 23, 133, 34);
    // Little tongue
    g.fillStyle(0xcc4444, 1);
    g.fillEllipse(146, 27, 14, 5);
  } else {
    g.fillTriangle(132, 20, 155, 26, 132, 32);
  }

  // ─ Eye ─
  g.fillStyle(0xffffff, 1);
  g.fillCircle(120, 20, 5);
  g.fillStyle(0x000000, 1);
  g.fillCircle(121, 20, 3);

  // ─ Legs ─
  g.fillStyle(0x333333, 1);
  g.fillRect(74, 116, 8, 16);
  g.fillRect(92, 116, 8, 16);

  // ─ Feet ─
  g.fillStyle(0x8a7050, 1);
  g.fillEllipse(72, 133, 22, 8);
  g.fillEllipse(92, 133, 22, 8);

  // ─ Poop drop hint on poop frame ─
  if (variant === 'poop') {
    g.fillStyle(0xe8e8e0, 1);
    g.fillCircle(85, 120, 7);
  }

  g.generateTexture(key, W, H);
  g.destroy();
}

/** Start the idle wing-flap cycle. */
function startGooseFlap(): void {
  if (gooseFlapTimer) { gooseFlapTimer.remove(); }
  let frame = 0;
  gooseFlapTimer = scene.time.addEvent({
    delay: 320,
    loop: true,
    callback: () => {
      if (state.animating || state.gameOver) return;
      frame = 1 - frame;
      gooseImg.setTexture(frame === 0 ? 'goose_idle_0' : 'goose_idle_1');
    },
  });
}

/** Switch goose to pooping pose, then restore idle after delay. */
function playGoosePoopAnim(durationMs: number): void {
  if (gooseFlapTimer) gooseFlapTimer.paused = true;
  gooseImg.setTexture('goose_poop');
  sfxGoosePoop();
  // Squish down
  scene.tweens.add({
    targets: gooseContainer,
    scaleY: 0.88,
    duration: 80,
    yoyo: true,
    ease: 'Quad.easeOut',
  });
  scene.time.delayedCall(durationMs, () => {
    gooseImg.setTexture('goose_idle_0');
    if (gooseFlapTimer) gooseFlapTimer.paused = false;
  });
}

function moveGooseTo(col: number): void {
  state.gooseCol = col;
  scene.tweens.add({
    targets: gooseContainer,
    x: cellX(col),
    duration: 160,
    ease: 'Sine.easeOut',
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function buildHUD(): void {
  // Score panel at top
  const panelH = 130;
  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.ui.hud, 0.85);
  bg.fillRoundedRect(20, 20, GAME_WIDTH - 40, panelH, 16);

  // Score — centred, large
  scoreText = scene.add.text(GAME_WIDTH / 2, 72, 'Score: 0', TEXT_STYLES.score)
    .setOrigin(0.5);

  // Right-side level cluster: label, progress bar, pts-to-next
  const rightX = GAME_WIDTH - 44;

  levelText = scene.add.text(rightX, 32, 'Level 1', TEXT_STYLES.hud)
    .setOrigin(1, 0);

  // Progress bar drawn dynamically — placeholder Graphics object
  levelProgressBar = scene.add.graphics();

  nextLevelText = scene.add.text(rightX, 104, '', {
    fontSize: '19px', fontFamily: 'Arial', color: '#aaccee',
  }).setOrigin(1, 0);

  // Danger vignette — redrawn every frame in updateDangerOverlay()
  dangerOverlay = scene.add.graphics().setDepth(9);

  // Message text (center screen — hidden initially)
  messageText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    ...TEXT_STYLES.heading,
    color: '#ffffff',
    align: 'center',
    wordWrap: { width: GAME_WIDTH - 80 },
    backgroundColor: '#00000088',
    padding: { x: 32, y: 20 },
  }).setOrigin(0.5).setAlpha(0).setDepth(10);
}

function updateScoreHUD(): void {
  scoreText.setText(`Score: ${state.score}`);
  checkLevelUp();

  // Right-side level progress cluster
  const barW   = 180;
  const barH   = 10;
  const rightX = GAME_WIDTH - 44;
  const barX   = rightX - barW; // bar right-aligns to rightX
  const barY   = 66;            // sits between level label (y32) and pts text (y104)

  const nextIdx = state.level + 1;
  const atMax   = nextIdx >= LEVEL_CONFIG.length;

  // Progress fraction: 0–1 within current level band
  let fraction = 1;
  if (!atMax) {
    const lo  = LEVEL_CONFIG[state.level].scoreThreshold;
    const hi  = LEVEL_CONFIG[nextIdx].scoreThreshold;
    fraction  = Math.min(1, Math.max(0, (state.score - lo) / (hi - lo)));
    const needed = hi - state.score;
    nextLevelText.setText(`${needed.toLocaleString()} pts to Lv ${nextIdx + 1}`);
  } else {
    nextLevelText.setText('MAX LEVEL');
  }

  // Redraw progress bar
  levelProgressBar.clear();
  // Track
  levelProgressBar.fillStyle(0x1a2535, 1);
  levelProgressBar.fillRoundedRect(barX, barY, barW, barH, 4);
  // Fill — colour ramps green → gold → red as level progresses
  const fillColor = atMax ? 0xffdd00
    : fraction < 0.5  ? 0x44cc44
    : fraction < 0.85 ? 0xffaa00
    : 0xff6633;
  const fillW = Math.max(0, barW * fraction);
  if (fillW > 4) {
    levelProgressBar.fillStyle(fillColor, 1);
    levelProgressBar.fillRoundedRect(barX, barY, fillW, barH, 4);
  }
  // Thin border
  levelProgressBar.lineStyle(1, 0x445566, 1);
  levelProgressBar.strokeRoundedRect(barX, barY, barW, barH, 4);
}

// ─── Color Unlock Announcement ──────────────────────────────────────────────

/** Flash a color-unlock banner — styled in the new color. */
function showColorUnlockMessage(colorName: string, colorHex: number): void {
  const hex = '#' + colorHex.toString(16).padStart(6, '0');
  const spawnY = GRID_ORIGIN_Y + 60;

  const txt = scene.add.text(GAME_WIDTH / 2, spawnY, `🎨 ${colorName.toUpperCase()}\nUNLOCKED!`, {
    fontSize: '72px',
    fontFamily: 'Arial Black',
    color: hex,
    stroke: '#000000',
    strokeThickness: 12,
    align: 'center',
    lineSpacing: -4,
    shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(0.3);

  scene.tweens.add({
    targets: txt,
    alpha: 1,
    scale: 1,
    duration: 200,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.time.delayedCall(900, () => {
        scene.tweens.add({
          targets: txt,
          alpha: 0,
          scale: 1.4,
          y: spawnY - 60,
          duration: 300,
          ease: 'Quad.easeIn',
          onComplete: () => txt.destroy(),
        });
      });
    },
  });
}

function checkLevelUp(): void {
  // Loop in case a single score jump skips multiple thresholds
  let advanced = false;
  let colorUnlocked = false;
  const colorsBefore = LEVEL_CONFIG[state.level].unlockedColors;
  while (true) {
    const nextLevel = state.level + 1;
    if (nextLevel >= LEVEL_CONFIG.length) break; // already at max level
    if (state.score >= LEVEL_CONFIG[nextLevel].scoreThreshold) {
      state.level = nextLevel;
      advanced = true;
    } else {
      break;
    }
  }
  if (advanced) {
    levelText.setText(`Level ${state.level + 1}`);
    startConstructionTimer();
    if (LEVEL_CONFIG[state.level].unlockedColors > colorsBefore) {
      colorUnlocked = true;
    }
  }
  if (colorUnlocked) {
    const newColor = BLOCK_COLORS[LEVEL_CONFIG[state.level].unlockedColors - 1];
    showColorUnlockMessage(newColor.name, newColor.fill);
  }
}

// ─── Poop Indicator ───────────────────────────────────────────────────────────

function buildPoopIndicator(): void {
  if (poopIndicator) poopIndicator.destroy();

  const x = GRID_ORIGIN_X + 64;
  const y = GRID_ORIGIN_Y - 80;

  const bg = scene.make.graphics({}, false);
  bg.fillStyle(COLORS.ui.panel, 0.9);
  bg.fillRoundedRect(-52, -38, 104, 76, 10);
  bg.lineStyle(2, 0x445566, 1);
  bg.strokeRoundedRect(-52, -38, 104, 76, 10);

  const icon = scene.add.image(0, -4, 'poop_detonator').setScale(0.65);

  // Color ring overlay
  if (state.pendingPoop) {
    const ringImg = scene.add.image(0, -4, `poop_ring_${state.pendingPoop.color}`).setScale(0.65);
    poopIndicatorLabel = scene.add.text(0, 32, nextPoopLabel(), {
      fontSize: '20px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    poopIndicator = scene.add.container(x, y, [bg, icon, ringImg, poopIndicatorLabel]);
  } else {
    poopIndicatorLabel = scene.add.text(0, 32, '', {
      fontSize: '20px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5);
    poopIndicator = scene.add.container(x, y, [bg, icon, poopIndicatorLabel]);
  }

  poopIndicator.setSize(104, 76);

  scene.add.text(x, y - 56, 'NEXT POOP', {
    fontSize: '18px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
  }).setOrigin(0.5);
}

function nextPoopLabel(): string {
  if (!state.pendingPoop) return '';
  const col = BLOCK_COLORS[state.pendingPoop.color];
  return col.name;
}

function refreshPoopIndicator(): void {
  buildPoopIndicator();
}

// ─── Title Screen ────────────────────────────────────────────────────────────

function buildTitleScreen(): void {
  const W = GAME_WIDTH;
  const H = GAME_HEIGHT;
  const cx = W / 2;

  // Full-screen dark backdrop
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 1);
  bg.fillRect(0, 0, W, H);

  // Sky gradient — deep night blue at top fading to orange-red smog at bottom
  const skyG = scene.add.graphics();
  for (let y = 0; y < H * 0.62; y++) {
    const t = y / (H * 0.62);
    const r = Math.round(Phaser.Math.Linear(0x08, 0xb8, t));
    const g2 = Math.round(Phaser.Math.Linear(0x0a, 0x3a, t));
    const b2 = Math.round(Phaser.Math.Linear(0x28, 0x20, t));
    skyG.fillStyle((r << 16) | (g2 << 8) | b2, 1);
    skyG.fillRect(0, y, W, 1);
  }

  // City silhouette along the bottom third
  const cityG = scene.add.graphics();
  cityG.fillStyle(0x0a0a12, 1);
  const buildings = [
    [0,   220, 90],  [80,  260, 70],  [140, 180, 110],
    [240, 300, 80],  [310, 200, 100], [400, 280, 90],
    [480, 160, 120], [590, 240, 80],  [660, 200, 100],
    [720, 180, 66],
  ];
  const cityBaseY = H * 0.68;
  buildings.forEach(([bx, bh, bw]) => {
    cityG.fillRect(bx, cityBaseY - bh, bw, bh + H);
    // Windows — random grid of lit yellow squares
    cityG.fillStyle(0xffe066, 1);
    for (let wy = cityBaseY - bh + 12; wy < cityBaseY - 10; wy += 22) {
      for (let wx = bx + 8; wx < bx + bw - 8; wx += 16) {
        if (Math.random() > 0.45) cityG.fillRect(wx, wy, 7, 10);
      }
    }
    cityG.fillStyle(0x0a0a12, 1);
  });

  // ── KEY ART: Angry goose diving beak-first at viewer ──────────────────────
  // Perspective: viewer is looking up — belly visible, long neck extends downward.

  const gx = cx;
  const gy = H * 0.30;  // visual centre of the goose body

  // Shadow on ground
  const gsShadow = scene.add.graphics();
  gsShadow.fillStyle(0x000000, 0.28);
  gsShadow.fillEllipse(gx, H * 0.67, 260, 40);

  // ── Static body graphic ──
  const gsBody = scene.add.graphics();

  // Back / dorsal feathers peeking around top of body
  gsBody.fillStyle(0x7a6a4a, 1);
  gsBody.fillEllipse(gx, gy - 80, 240, 80);

  // Body: large pale-tan oval seen from below
  gsBody.fillStyle(0xd4bc8a, 1);
  gsBody.fillEllipse(gx, gy, 300, 220);

  // Feet dangling up
  gsBody.fillStyle(0x8a7050, 1);
  gsBody.fillRect(gx - 60, gy - 100, 14, 28);
  gsBody.fillRect(gx + 46, gy - 100, 14, 28);
  gsBody.fillTriangle(gx - 66, gy - 74, gx - 46, gy - 74, gx - 56, gy - 60);
  gsBody.fillTriangle(gx + 40, gy - 74, gx + 60, gy - 74, gx + 50, gy - 60);

  // ── Long neck — tall black column bridging body to head ──
  // Neck is now much taller (160px) and slightly tapered
  gsBody.fillStyle(0x111111, 1);
  gsBody.fillPoints([
    { x: gx - 38, y: gy + 70  },  // top-left where neck meets body
    { x: gx + 38, y: gy + 70  },  // top-right
    { x: gx + 28, y: gy + 230 },  // bottom-right (narrower at head)
    { x: gx - 28, y: gy + 230 },  // bottom-left
  ], true, true);

  // Head — large black circle at bottom of long neck
  gsBody.fillCircle(gx, gy + 272, 80);

  // White chinstrap
  gsBody.fillStyle(0xffffff, 1);
  gsBody.fillEllipse(gx, gy + 300, 90, 38);

  // Eyes — wide angry
  gsBody.fillStyle(0xffffff, 1);
  gsBody.fillEllipse(gx - 32, gy + 250, 34, 28);
  gsBody.fillEllipse(gx + 32, gy + 250, 34, 28);
  // Angry furrowed brow
  gsBody.fillStyle(0x111111, 1);
  gsBody.fillTriangle(gx - 48, gy + 236, gx - 14, gy + 236, gx - 28, gy + 250);
  gsBody.fillTriangle(gx + 48, gy + 236, gx + 14, gy + 236, gx + 28, gy + 250);
  // Pupils
  gsBody.fillStyle(0x000000, 1);
  gsBody.fillCircle(gx - 28, gy + 258, 12);
  gsBody.fillCircle(gx + 28, gy + 258, 12);
  // Eye shine
  gsBody.fillStyle(0xffffff, 1);
  gsBody.fillCircle(gx - 22, gy + 254, 4);
  gsBody.fillCircle(gx + 34, gy + 254, 4);

  // Beak — open wide, pointing down
  gsBody.fillStyle(0x333333, 1);
  gsBody.fillEllipse(gx, gy + 320, 70, 28);
  gsBody.fillTriangle(gx - 35, gy + 320, gx + 35, gy + 320, gx, gy + 370);
  gsBody.fillStyle(0x1a1a1a, 1);
  gsBody.fillTriangle(gx - 28, gy + 322, gx + 28, gy + 322, gx, gy + 360);
  gsBody.fillStyle(0xcc3333, 1);
  gsBody.fillEllipse(gx, gy + 340, 28, 14);

  // ── Wings — drawn relative to their own (0,0) origin, positioned via x/y ──
  // This ensures scaleY/y tweens pivot correctly at the wing root.
  const WING_ROOT_L_X = gx - 110;  // where left wing meets body
  const WING_ROOT_R_X = gx + 110;  // where right wing meets body
  const WING_Y = gy - 28;

  const gsWingL = scene.add.graphics();
  gsWingL.fillStyle(0x5a4e36, 1);
  gsWingL.fillEllipse(-90, 0, 200, 70);   // ellipse drawn left of root
  gsWingL.fillStyle(0x3a3020, 1);
  gsWingL.fillTriangle(-120, 10, -200, 55, -55, 42); // tip
  gsWingL.x = WING_ROOT_L_X;
  gsWingL.y = WING_Y;

  const gsWingR = scene.add.graphics();
  gsWingR.fillStyle(0x5a4e36, 1);
  gsWingR.fillEllipse(90, 0, 200, 70);    // ellipse drawn right of root
  gsWingR.fillStyle(0x3a3020, 1);
  gsWingR.fillTriangle(120, 10, 200, 55, 55, 42); // tip
  gsWingR.x = WING_ROOT_R_X;
  gsWingR.y = WING_Y;

  // Wing flap — tween y offset so wings beat up and down from the root
  const FLAP_UP   = -55;
  const FLAP_DOWN =  30;
  scene.tweens.add({
    targets: gsWingL,
    y: WING_Y + FLAP_UP,
    duration: 380,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: gsWingR,
    y: WING_Y + FLAP_UP,
    duration: 380,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Whole-body bob (vertical) + left-right oscillation
  const gooseGroup = scene.add.container(0, 0, [gsWingL, gsBody, gsWingR, gsShadow]);
  scene.tweens.add({
    targets: gooseGroup,
    y: -18,
    duration: 800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: gooseGroup,
    x: 30,
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // ── Animated poop spawner — drops every 0.8 seconds ──
  // Each poop is its own short-lived graphics object that falls and fades.
  function spawnTitlePoop(): void {
    if (!titleActive) return;
    const px = gx + Phaser.Math.Between(-60, 60);
    // Start just below the beak
    const startY = gy + 375;
    const pg = scene.add.graphics();
    // Teardrop body
    pg.fillStyle(0xe8e8d0, 1);
    pg.fillEllipse(0, 44, 52, 64);
    pg.fillStyle(0xd4d4bc, 1);
    pg.fillTriangle(0, -10, -22, 30, 22, 30);
    // Highlight
    pg.fillStyle(0xffffff, 0.55);
    pg.fillEllipse(-6, 20, 16, 12);
    pg.x = px;
    pg.y = startY;
    pg.setDepth(101);
    // Falls and grows slightly (perspective) then fades
    scene.tweens.add({
      targets: pg,
      y: startY + 520,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeIn',
      onComplete: () => pg.destroy(),
    });
  }

  titlePoopTimer = scene.time.addEvent({
    delay: 800,
    loop: true,
    callback: spawnTitlePoop,
  });
  // Spawn one immediately so there's no initial wait
  spawnTitlePoop();

  // ── TITLE TEXT ────────────────────────────────────────────────────────────
  // Drop shadow
  const shadow1 = scene.add.text(cx + 5, H * 0.075 + 5, 'BOMBER', {
    fontSize: '112px', fontFamily: 'Arial Black',
    color: '#000000',
  }).setOrigin(0.5).setAlpha(0.45);
  const shadow2 = scene.add.text(cx + 5, H * 0.075 + 118 + 5, 'G-0053', {
    fontSize: '96px', fontFamily: 'Arial Black',
    color: '#000000',
  }).setOrigin(0.5).setAlpha(0.45);

  // Main title — bright yellow-orange arcade style
  const titleLine1 = scene.add.text(cx, H * 0.075, 'BOMBER', {
    fontSize: '112px',
    fontFamily: 'Arial Black',
    color: '#ffe333',
    stroke: '#cc4400',
    strokeThickness: 10,
    shadow: { offsetX: 4, offsetY: 4, color: '#000000', blur: 8, fill: true },
  }).setOrigin(0.5);

  const titleLine2 = scene.add.text(cx, H * 0.075 + 118, 'G-0053', {
    fontSize: '96px',
    fontFamily: 'Arial Black',
    color: '#ff6622',
    stroke: '#881100',
    strokeThickness: 10,
    shadow: { offsetX: 4, offsetY: 4, color: '#000000', blur: 8, fill: true },
  }).setOrigin(0.5);

  // Subtitle flavour text
  const sub = scene.add.text(cx, H * 0.075 + 210, '🪿  THE GOOSE IS LOOSE  🪿', {
    fontSize: '30px',
    fontFamily: 'Arial',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 5,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  // Pulsing TAP TO START
  const tapText = scene.add.text(cx, H * 0.84, 'TAP TO START', {
    fontSize: '52px',
    fontFamily: 'Arial Black',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 8,
    shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 6, fill: true },
  }).setOrigin(0.5);

  scene.tweens.add({
    targets: tapText,
    alpha: 0.1,
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Version / credit footer
  const footer = scene.add.text(cx, H * 0.92, 'CLEAR BLOCKS · DROP POOP · BEAT THE CREW', {
    fontSize: '24px', fontFamily: 'Arial', color: '#888888',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5);

  // Bundle everything into a single container so we can destroy it cleanly
  titleContainer = scene.add.container(0, 0, [
    bg, skyG, cityG, gooseGroup,
    shadow1, shadow2, titleLine1, titleLine2, sub, tapText, footer,
  ]);
  titleContainer.setDepth(100);

  // Subtle entrance: container fades + drops in
  titleContainer.setAlpha(0);
  titleContainer.y = 30;
  scene.tweens.add({
    targets: titleContainer,
    alpha: 1,
    y: 0,
    duration: 500,
    ease: 'Quad.easeOut',
  });
}

function dismissTitleScreen(): void {
  if (!titleActive) return;
  titleActive = false;
  if (titlePoopTimer) { titlePoopTimer.remove(); titlePoopTimer = null; }
  startBGM();

  if (titleContainer) {
    scene.tweens.add({
      targets: titleContainer,
      alpha: 0,
      y: -40,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (titleContainer) { titleContainer.destroy(true); titleContainer = null; }
        startConstructionTimer();
      },
    });
  } else {
    startConstructionTimer();
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

function setupInput(): void {
  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    // Title screen: any tap dismisses it and starts the game
    if (titleActive) {
      dismissTitleScreen();
      return;
    }
    // Start BGM on first touch (satisfies browser autoplay policy)
    if (!bgmRunning) startBGM();
    if (state.gameOver) return;

    const col = pointerToCol(pointer.x);
    if (col < 0 || col >= GRID_COLS) return;
    if (state.grid[0][col].type !== 'empty') return;

    if (state.animating) {
      // Queue this tap — will fire in finishTurn() if within 200ms grace
      state.queuedCol = col;
      state.queuedAt  = performance.now();
      // Move goose immediately so it feels responsive
      moveGooseTo(col);
      return;
    }

    // Normal immediate drop
    moveGooseTo(col);
    scene.time.delayedCall(180, () => dropPoop(col));
  });
}

function pointerToCol(px: number): number {
  return Math.floor((px - GRID_ORIGIN_X) / CELL_SIZE);
}

// ─── Poop Drop ────────────────────────────────────────────────────────────────

function dropPoop(col: number): void {
  if (!state.pendingPoop) return;
  state.animating = true;

  const poop = state.pendingPoop;

  // Pick the next poop immediately so the player can plan while this one flies
  state.pendingPoop = pickRandomPoop();
  refreshPoopIndicator();

  // Find the landing row: the row just above the top-most occupied cell in
  // this column. If the whole column is empty, land at row 0.
  // "Landing row" is where the poop will sit — it is NOT a grid cell itself;
  // it sits visually on top of the highest block (or at top of grid).
  let topOccupied = GRID_ROWS; // one past the bottom = column is empty
  for (let r = 0; r < GRID_ROWS; r++) {
    if (state.grid[r][col].type === 'normal' || state.grid[r][col].type === 'poop') {
      topOccupied = r;
      break;
    }
  }
  // The poop lands at the row index just above topOccupied.
  // If topOccupied === 0 the column is full to the top — land at row 0 anyway
  // (poop sits on top of row 0 block).
  const landRow = Math.max(0, topOccupied - 1);

  const startX = cellX(col);
  const startY = gooseContainer.y + 30; // just below the goose
  // Land visually just above the top block (half a cell above the landRow center)
  const endY = cellY(landRow) - CELL_SIZE * 0.5;

  const poopImg = scene.add.image(0, 0, 'poop_detonator');
  const ringImg = scene.add.image(0, 0, `poop_ring_${poop.color}`);

  poopSprite = scene.add.container(startX, startY, [poopImg, ringImg]);

  // How many rows does it travel? Use that to scale duration so fast/slow feel right.
  const rowsToTravel = Math.max(1, landRow + 1);
  const dropDuration = 120 + rowsToTravel * 60;

  // Trigger poop animation on the goose for the duration of the drop
  playGoosePoopAnim(dropDuration + 200);

  scene.tweens.add({
    targets: poopSprite,
    y: endY,
    duration: dropDuration,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      if (poopSprite) { poopSprite.destroy(); poopSprite = null; }
      activatePoop(poop, col, landRow);
    },
  });
}

// ─── Poop Activation (modular dispatch) ──────────────────────────────────────

function activatePoop(poop: PoopDef, col: number, landRow: number): void {
  const handler = POOP_HANDLERS[poop.kind];
  if (!handler) { finishTurn(); return; }

  const toDestroy = handler(poop, state.grid, landRow, col);

  if (toDestroy.length === 0) {
    // No adjacent match — poop lands on the grid as a block
    placeMissedPoop(poop, col, landRow, () => {
      checkWinLose();
    });
    return;
  }

  destroyCells(toDestroy, () => {
    applyGravity((movedPoops) => {
      state.score += SCORE_BASE * toDestroy.length * toDestroy.length;
      updateScoreHUD();
      checkCombos(movedPoops, 1, () => {
        checkWinLose();
      });
    });
  });
}

/** Place a missed poop as a 'poop' cell on top of the column. */
function placeMissedPoop(poop: PoopDef, col: number, landRow: number, onDone: () => void): void {
  // The poop sits at landRow in this column.
  // If landRow is already occupied by a normal block, push it on top (landRow - 1),
  // but landRow was already computed as the row ABOVE the top block, so it should
  // be empty. Mark it as a poop cell.
  const targetRow = landRow;

  // Destroy whatever placeholder sprite is there (empty cell)
  if (state.grid[targetRow][col].sprite) {
    state.grid[targetRow][col].sprite!.destroy();
    state.grid[targetRow][col].sprite = null;
  }

  state.grid[targetRow][col] = {
    type: 'poop',
    colorIndex: poop.color,  // remember the color for visual
    sprite: null,
  };

  // Build a poop-cell sprite: poop icon tinted with its color + stable ring texture
  const poopCellImg = scene.add.image(0, 0, 'poop_detonator').setScale(0.7);
  poopCellImg.setTint(BLOCK_COLORS[poop.color].fill);
  const ringImg2 = scene.add.image(0, 0, `poop_ring_${poop.color}`);
  ringImg2.setScale(0.75);

  const container = scene.add.container(
    cellX(col),
    cellY(targetRow) - CELL_SIZE,  // start above, then drop in
    [poopCellImg, ringImg2],
  );
  container.setSize(CELL_INNER, CELL_INNER);
  state.grid[targetRow][col].sprite = container;
  gridContainer.add(container);

  scene.tweens.add({
    targets: container,
    y: cellY(targetRow),
    duration: 200,
    ease: 'Bounce.easeOut',
    onComplete: onDone,
  });
}

// ─── Flood Fill ──────────────────────────────────────────────────────────────

/**
 * BFS flood-fill from (startR, startC) collecting all connected cells that
 * have the given colorIndex. Results are pushed into `result`.
 * `visited` is shared so callers can run multiple seeds without overlap.
 */
function floodFillGroup(
  grid: Cell[][],
  startR: number,
  startC: number,
  colorIndex: number,
  visited: boolean[][],
  result: Array<[number, number]>,
): void {
  const queue: Array<[number, number]> = [[startR, startC]];
  visited[startR][startC] = true;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    result.push([r, c]);

    const neighbors: Array<[number, number]> = [
      [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (
        nr >= 0 && nr < GRID_ROWS &&
        nc >= 0 && nc < GRID_COLS &&
        !visited[nr][nc] &&
        (grid[nr][nc].type === 'normal' || grid[nr][nc].type === 'poop') &&
        grid[nr][nc].colorIndex === colorIndex
      ) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
}

// ─── Cell Destruction Animation ───────────────────────────────────────────────

function destroyCells(cells: Array<[number, number]>, onComplete: () => void): void {
  let completed = 0;
  const total = cells.length;

  // Fire clear SFX scaled to how many blocks are being cleared
  sfxBlockClear(total);

  cells.forEach(([r, c]) => {
    const cell = state.grid[r][c];
    if (!cell.sprite) { completed++; if (completed === total) onComplete(); return; }

    // Splat tween: scale up + fade out
    scene.tweens.add({
      targets: cell.sprite,
      scaleX: 1.4,
      scaleY: 1.4,
      alpha: 0,
      duration: 220,
      ease: 'Power2',
      onComplete: () => {
        if (cell.sprite) { cell.sprite.destroy(); cell.sprite = null; }
        // Mark cell as empty in state
        state.grid[r][c] = { type: 'empty', colorIndex: -1, sprite: null };
        completed++;
        if (completed === total) onComplete();
      },
    });
  });
}

// ─── Gravity ─────────────────────────────────────────────────────────────────

// Pixels per millisecond for falling blocks — constant speed regardless of distance.
const FALL_SPEED_PX_MS = 1.4;

/**
 * After cells are cleared, blocks above fall down to fill gaps.
 * Only blocks that actually move get a tween. Stationary blocks keep their
 * existing sprite untouched. All falling blocks share the same px/ms speed.
 * Calls onComplete with the list of poop cells that actually moved (row, col).
 */
function applyGravity(onComplete: (movedPoops: Array<[number, number]>) => void): void {
  let pending = 0;
  const movedPoops: Array<[number, number]> = [];

  for (let c = 0; c < GRID_COLS; c++) {
    // Build a compact list of surviving cells top-to-bottom, keeping their
    // current sprite references so we can reuse them.
    const survivors: { colorIndex: number; type: Cell['type']; sprite: Phaser.GameObjects.Container | null }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = state.grid[r][c];
      if (cell.type === 'normal' || cell.type === 'poop') {
        survivors.push({ colorIndex: cell.colorIndex, type: cell.type, sprite: cell.sprite });
        // Detach sprite from old cell so we don't double-destroy it below
        state.grid[r][c].sprite = null;
      }
    }

    const emptyRows = GRID_ROWS - survivors.length;

    // Fill top rows with empty cells, destroying any leftover empty sprites
    for (let r = 0; r < emptyRows; r++) {
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.destroy();
        state.grid[r][c].sprite = null;
      }
      state.grid[r][c] = { type: 'empty', colorIndex: -1, sprite: null };
      // Create a fresh empty-cell sprite (no animation needed)
      const sprite = makeCellSprite(state.grid[r][c], r, c);
      gridContainer.add(sprite);
      state.grid[r][c].sprite = sprite;
    }

    // Place survivors into bottom rows
    for (let i = 0; i < survivors.length; i++) {
      const destRow = emptyRows + i;
      const src = survivors[i];

      state.grid[destRow][c] = { type: src.type, colorIndex: src.colorIndex, sprite: null };

      const targetY = cellY(destRow);

      if (src.sprite) {
        // Re-use the existing sprite — just move it
        const currentY = src.sprite.y;
        const dist = targetY - currentY;

        state.grid[destRow][c].sprite = src.sprite;

        if (dist > 1) {
          // Block needs to fall — tween at constant speed
          const duration = dist / FALL_SPEED_PX_MS;
          // Track poop cells that actually fell — they may trigger a combo
          if (src.type === 'poop') {
            movedPoops.push([destRow, c]);
          }
          pending++;
          scene.tweens.add({
            targets: src.sprite,
            y: targetY,
            duration,
            ease: 'Quad.easeIn',
            onComplete: () => {
              pending--;
              if (pending === 0) onComplete(movedPoops);
            },
          });
        }
        // dist <= 1: block already at destination, no tween needed
      } else {
        // No existing sprite (shouldn't happen for survivors, but guard anyway)
        const sprite = makeCellSprite(state.grid[destRow][c], destRow, c);
        gridContainer.add(sprite);
        state.grid[destRow][c].sprite = sprite;
      }
    }
  }

  if (pending === 0) {
    scene.time.delayedCall(50, () => onComplete(movedPoops));
  }
}

// ─── Combo Chain ──────────────────────────────────────────────────────────────

const COMBO_LABELS = [
  '',              // 0 — unused
  'COMBO!!',       // 1 — first cascade
  'SUPER!!',       // 2
  'FEVER!!',       // 3
  'HONK HONK!!',   // 4
  'UNSTOPPABLE!!', // 5+
];

/**
 * After gravity settles, check every poop cell that just moved.
 * If any now has adjacent same-color groups, trigger another clear cascade.
 * comboCount starts at 1 (the original drop), increments each cascade.
 */
function checkCombos(
  movedPoops: Array<[number, number]>,
  comboCount: number,
  onDone: () => void,
): void {
  if (movedPoops.length === 0) { onDone(); return; }

  // Gather all cells to destroy across all moved poop positions
  const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
  const toDestroy: Array<[number, number]> = [];

  for (const [landRow, landCol] of movedPoops) {
    const cell = state.grid[landRow][landCol];
    // The poop cell must still be on the grid (wasn't itself destroyed)
    if (cell.type !== 'poop') continue;

    const adjacents: Array<[number, number]> = [
      [landRow - 1, landCol],
      [landRow + 1, landCol],
      [landRow,     landCol - 1],
      [landRow,     landCol + 1],
    ];

    for (const [ar, ac] of adjacents) {
      if (
        ar >= 0 && ar < GRID_ROWS &&
        ac >= 0 && ac < GRID_COLS &&
        !visited[ar][ac] &&
        (state.grid[ar][ac].type === 'normal' || state.grid[ar][ac].type === 'poop') &&
        state.grid[ar][ac].colorIndex === cell.colorIndex
      ) {
        floodFillGroup(state.grid, ar, ac, cell.colorIndex, visited, toDestroy);
      }
    }
  }

  if (toDestroy.length === 0) { onDone(); return; }

  // We have a combo — announce it, then cascade
  const label = COMBO_LABELS[Math.min(comboCount, COMBO_LABELS.length - 1)];
  if (label) showComboText(label, comboCount);

  destroyCells(toDestroy, () => {
    applyGravity((nextMovedPoops) => {
      state.score += SCORE_BASE * toDestroy.length * toDestroy.length * comboMultiplier(comboCount); // quadratic group size × quadratic combo chain
      updateScoreHUD();
      checkCombos(nextMovedPoops, comboCount + 1, onDone);
    });
  });
}

/** Arcade-style combo announcement — slams in, holds, then pops off. */
function showComboText(label: string, comboCount: number): void {
  // Stroke color cycles through the block palette for extra flair
  const color = BLOCK_COLORS[(comboCount - 1) % BLOCK_COLORS.length].fill;
  const hex = '#' + color.toString(16).padStart(6, '0');

  // Position above the grid, well clear of blocks
  const spawnY = GRID_ORIGIN_Y - 30;

  const txt = scene.add.text(GAME_WIDTH / 2, spawnY, `${label}\n${comboCount + 1}x`, {
    fontSize: '96px',
    fontFamily: 'Arial Black',
    color: '#ffffff',
    stroke: hex,
    strokeThickness: 14,
    align: 'center',
    lineSpacing: -8,
    shadow: { offsetX: 4, offsetY: 4, color: '#000000', blur: 8, fill: true },
  }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(0.4);

  // Slam in from small → overshoot → settle
  scene.tweens.add({
    targets: txt,
    alpha: 1,
    scale: 1,
    duration: 180,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Hold, then blast upward and fade
      scene.time.delayedCall(520, () => {
        scene.tweens.add({
          targets: txt,
          alpha: 0,
          scale: 1.5,
          y: spawnY - 80,
          duration: 280,
          ease: 'Quad.easeIn',
          onComplete: () => txt.destroy(),
        });
      });
    },
  });
}

// ─── Construction Crew ───────────────────────────────────────────────────────────

/** Draw the static construction zone and spawn animated worker containers. */
function buildConstructionCrew(): void {
  if (constructionCrewGraphic) { constructionCrewGraphic.destroy(); }
  if (constructionMeterBg)     { constructionMeterBg.destroy(); }
  if (constructionMeterFill)   { constructionMeterFill.destroy(); }
  if (workerSparkTimer)        { workerSparkTimer.remove(); workerSparkTimer = null; }
  workerContainers.forEach(w => w.destroy());
  workerContainers = [];

  const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
  const crewH = 64;

  // ─ Static ground strip + hazard stripes ─
  const g = scene.add.graphics();
  constructionCrewGraphic = g;
  g.fillStyle(0xc8a040, 1);
  g.fillRect(0, bottomY, GAME_WIDTH, crewH);
  g.fillStyle(0x1a1a1a, 1);
  const stripeW = 28;
  for (let x = -crewH; x < GAME_WIDTH + crewH; x += stripeW * 2) {
    g.fillPoints([
      { x: x,                   y: bottomY },
      { x: x + stripeW,         y: bottomY },
      { x: x + stripeW + crewH, y: bottomY + crewH },
      { x: x + crewH,           y: bottomY + crewH },
    ], true, true);
  }

  // ─ Animated worker containers ─
  const workerPositions = [80, 220, 380, 540, 700];
  const workerBaseY = bottomY + crewH - 4; // feet on the ground

  workerPositions.forEach((wx, i) => {
    const wg = scene.make.graphics({}, false);
    // Body (orange hi-vis vest)
    wg.fillStyle(0xee8800, 1);
    wg.fillRect(-8, -38, 16, 26);
    // Arms out (working pose) — alternate sides per worker
    wg.fillStyle(0xee8800, 1);
    if (i % 2 === 0) {
      wg.fillRect(-18, -34, 10, 5);  // left arm out
      wg.fillRect(8,   -30, 10, 5);  // right arm down
    } else {
      wg.fillRect(8,   -34, 10, 5);  // right arm out
      wg.fillRect(-18, -30, 10, 5);  // left arm down
    }
    // Head (skin tone)
    wg.fillStyle(0xf5c09a, 1);
    wg.fillCircle(0, -48, 10);
    // Hard hat
    wg.fillStyle(0xffdd00, 1);
    wg.fillRect(-12, -57, 24, 6);
    wg.fillEllipse(0, -58, 22, 10);
    // Tool: hammer held by every other worker, wrench by the rest
    if (i % 2 === 0) {
      // Hammer
      wg.fillStyle(0x888888, 1);
      wg.fillRect(14, -42, 4, 14);   // handle
      wg.fillRect(10, -46, 12, 6);   // head
    } else {
      // Wrench
      wg.fillStyle(0x888888, 1);
      wg.fillRect(14, -40, 3, 16);   // shaft
      wg.fillCircle(15, -43, 5);     // wrench head
    }

    const container = scene.add.container(wx, workerBaseY, [wg]);
    container.setSize(32, 64);
    workerContainers.push(container);

    // Staggered idle hop: each worker bounces at a different phase
    const hopDelay = i * 160;
    scene.time.delayedCall(hopDelay, () => {
      scene.tweens.add({
        targets: container,
        y: workerBaseY - 10,
        duration: 280,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  });

  // ─ Periodic construction sparks ─
  workerSparkTimer = scene.time.addEvent({
    delay: 600,
    loop: true,
    callback: spawnConstructionSpark,
  });

  // ─ Construction meter ─
  const meterPad = 8;
  const meterH   = 28;
  const meterY   = bottomY + crewH + meterPad;
  const meterW   = GAME_WIDTH - GRID_ORIGIN_X * 2;
  const meterX   = GRID_ORIGIN_X;

  const panelG = scene.add.graphics();
  panelG.fillStyle(0x0f1923, 0.85);
  panelG.fillRoundedRect(meterX - meterPad, meterY - meterPad, meterW + meterPad * 2, meterH + meterPad * 2, 8);
  panelG.lineStyle(1, 0x445566, 1);
  panelG.strokeRoundedRect(meterX - meterPad, meterY - meterPad, meterW + meterPad * 2, meterH + meterPad * 2, 8);
  constructionMeterBg = panelG;

  scene.add.text(meterX + meterW / 2, meterY + meterH / 2, '🚧 CONSTRUCTION', {
    fontSize: '18px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(1);

  constructionMeterFill = scene.add.graphics();
}

/** Pop a small spark/chip emoji near a random worker. */
function spawnConstructionSpark(): void {
  if (state.gameOver || workerContainers.length === 0) return;
  const worker = workerContainers[Phaser.Math.Between(0, workerContainers.length - 1)];
  const sparks = ['✨', '🔨', '⚡', '★', '💥'];
  const txt = scene.add.text(
    worker.x + Phaser.Math.Between(-16, 16),
    worker.y - 50,
    Phaser.Utils.Array.GetRandom(sparks) as string,
    { fontSize: '18px' },
  ).setOrigin(0.5).setDepth(5).setAlpha(1);

  scene.tweens.add({
    targets: txt,
    y: txt.y - Phaser.Math.Between(28, 50),
    alpha: 0,
    duration: Phaser.Math.Between(500, 900),
    ease: 'Quad.easeOut',
    onComplete: () => txt.destroy(),
  });
}

/** Workers celebrate when construction completes (rows pushed up). */
function playWorkerCelebration(): void {
  if (workerContainers.length === 0) return;
  const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
  const workerBaseY = bottomY + 64 - 4;

  workerContainers.forEach((w, i) => {
    // Stop normal hop tween and do a big jump + spin
    scene.tweens.killTweensOf(w);
    scene.time.delayedCall(i * 80, () => {
      // Big jump up
      scene.tweens.add({
        targets: w,
        y: workerBaseY - 36,
        scaleX: -1,          // flip = spin illusion
        duration: 200,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => {
          w.scaleX = 1;
          // Resume normal hop
          scene.tweens.add({
            targets: w,
            y: workerBaseY - 10,
            duration: 280,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        },
      });
      // Confetti star burst from above the worker
      const confetti = ['⭐', '🎉', '✨', '👏'];
      for (let c = 0; c < 3; c++) {
        scene.time.delayedCall(c * 80, () => {
          const cf = scene.add.text(
            w.x + Phaser.Math.Between(-22, 22),
            w.y - 60,
            Phaser.Utils.Array.GetRandom(confetti) as string,
            { fontSize: '20px' },
          ).setOrigin(0.5).setDepth(5);
          scene.tweens.add({
            targets: cf,
            y: cf.y - Phaser.Math.Between(40, 80),
            x: cf.x + Phaser.Math.Between(-20, 20),
            alpha: 0,
            duration: 700,
            ease: 'Quad.easeOut',
            onComplete: () => cf.destroy(),
          });
        });
      }
    });
  });
}

/**
 * Fraction of placeable cells (rows GRID_EMPTY_ROWS+) that are occupied.
 * Used to speed up construction when the board is sparse.
 */
function boardFillFraction(): number {
  const total = (GRID_ROWS - GRID_EMPTY_ROWS) * GRID_COLS;
  let occupied = 0;
  for (let r = GRID_EMPTY_ROWS; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].type !== 'empty') occupied++;
    }
  }
  return occupied / total;
}

/** Start (or restart) the construction timer. Self-rescheduling so the
 *  interval adapts to board fill each cycle.
 */
function startConstructionTimer(): void {
  if (constructionTimer) { constructionTimer.remove(); }
  scheduleNextConstruction();
}

function scheduleNextConstruction(): void {
  const cfg = LEVEL_CONFIG[state.level];
  // Continuous speed-up: factor lerps from 0.35 (empty board) to 1.0 (full board).
  // Every block cleared makes the crew measurably faster, not just at fixed thresholds.
  const fill   = boardFillFraction();
  const factor = Phaser.Math.Clamp(Phaser.Math.Linear(0.35, 1.0, fill), 0.35, 1.0);
  const delay  = Math.round(cfg.intervalMs * factor);

  constructionTimer = scene.time.addEvent({
    delay,
    loop: false,
    callback: () => {
      if (state.gameOver) return;
      if (state.animating) {
        // Queue the push; reschedule so the meter keeps ticking
        state.constructionPending = true;
        scheduleNextConstruction();
        return;
      }
      pushRowsFromBottom(cfg.rowsAdded);
      scheduleNextConstruction();
    },
  });
}

/** Called every frame from update() — redraws the construction meter fill. */
function updateConstructionMeter(): void {
  if (!constructionMeterFill || !constructionTimer) return;

  const progress = constructionTimer.getProgress(); // 0 → 1
  const meterW  = GAME_WIDTH - GRID_ORIGIN_X * 2;
  const meterX  = GRID_ORIGIN_X;
  const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
  const meterPad = 8;
  const meterH   = 28;
  const crewH    = 64;
  const meterY   = bottomY + crewH + meterPad;

  // Color: green → orange → red as it fills
  let fillColor: number;
  if (progress < 0.6)       fillColor = 0x44cc44;
  else if (progress < 0.85) fillColor = 0xffaa00;
  else                      fillColor = 0xff3333;

  constructionMeterFill.clear();

  // Track (empty bar background)
  constructionMeterFill.fillStyle(0x1a2535, 1);
  constructionMeterFill.fillRoundedRect(meterX, meterY, meterW, meterH, 6);

  // Fill
  const fillW = Math.max(0, meterW * progress);
  if (fillW > 6) {
    constructionMeterFill.fillStyle(fillColor, 1);
    constructionMeterFill.fillRoundedRect(meterX, meterY, fillW, meterH, 6);
  }

  // Bright pulse flash when almost full (> 90%)
  if (progress > 0.9) {
    const pulse = 0.3 + 0.3 * Math.sin(Date.now() / 80);
    constructionMeterFill.fillStyle(0xffffff, pulse);
    constructionMeterFill.fillRoundedRect(meterX, meterY, fillW, meterH, 6);
  }
}

/**
 * Redraws red edge vignette when occupied blocks are close to the top.
 * Danger fraction: 0 = safe, 1 = blocks at the very top placeable row.
 * Uses Math.sin for a pulsing effect that speeds up with danger.
 */
function updateDangerOverlay(): void {
  if (!dangerOverlay) return;
  dangerOverlay.clear();
  if (!state || state.gameOver) return;

  // Find the highest occupied row across all columns
  let highestOccupied = GRID_ROWS; // start at bottom (nothing found)
  for (let r = GRID_EMPTY_ROWS; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].type !== 'empty') {
        if (r < highestOccupied) highestOccupied = r;
      }
    }
  }

  // Danger triggers when the highest block is within 4 rows of row 0 (game-over row).
  // dangerStartRow = 4 means: first faint glow at row 4, full intensity at row 0.
  const DANGER_ROWS = 4;
  if (highestOccupied > DANGER_ROWS) return; // no danger yet

  // 0 = just entered danger zone (row 4), 1 = blocks at row 0 (game over imminent)
  const danger = 1 - highestOccupied / DANGER_ROWS;

  // Pulse: faster and brighter as danger increases
  const speed = 2 + danger * 6; // radians/sec range 2..8
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000 * speed);
  const alpha = danger * 0.55 * pulse; // max alpha ~0.55

  if (alpha < 0.01) return;

  const edgeW = 60; // width of each side strip
  const h = GAME_HEIGHT;

  dangerOverlay.fillStyle(0xff1111, alpha);
  // Left strip
  dangerOverlay.fillRect(0, 0, edgeW, h);
  // Right strip
  dangerOverlay.fillRect(GAME_WIDTH - edgeW, 0, edgeW, h);
  // Top strip
  dangerOverlay.fillRect(0, 0, GAME_WIDTH, edgeW);
}

/**
 * Push n new random rows up from the bottom.
 * Shifts existing grid rows up by n. If any occupied cell is pushed past
 * row 0, triggers game over.
 */
function pushRowsFromBottom(n: number): void {
  // Block normal input during the push animation
  state.animating = true;

  // Workers celebrate and play construction SFX
  playWorkerCelebration();
  sfxConstructionRow();

  // Check overflow: if any of the top n rows have occupied cells they will
  // be pushed off the grid entirely.
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].type !== 'empty') {
        // Overflow — trigger game over
        triggerOverflowLose();
        return;
      }
    }
  }

  // Shift existing rows upward by n (destroy sprites for rows that move off top)
  for (let r = 0; r < GRID_ROWS - n; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const src = state.grid[r + n][c];
      // Destroy old sprite at target row
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.destroy();
        state.grid[r][c].sprite = null;
      }
      // Move sprite reference up
      state.grid[r][c] = { type: src.type, colorIndex: src.colorIndex, sprite: src.sprite };
      state.grid[r + n][c].sprite = null; // detached
      // Reposition the sprite to the new row
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.y = cellY(r);
      }
    }
  }

  // Fill the bottom n rows with new random blocks
  for (let r = GRID_ROWS - n; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.destroy();
        state.grid[r][c].sprite = null;
      }
      const colorIndex = Phaser.Math.Between(0, activeColors() - 1);
      state.grid[r][c] = { type: 'normal', colorIndex, sprite: null };
      const sprite = makeCellSprite(state.grid[r][c], r, c);
      // Slide in from below
      sprite.y = cellY(r) + CELL_SIZE * n;
      gridContainer.add(sprite);
      state.grid[r][c].sprite = sprite;
    }
  }

  // Animate: slide all sprites to their final positions
  let pending = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const sprite = state.grid[r][c].sprite;
      if (!sprite) continue;
      const targetY = cellY(r);
      if (Math.abs(sprite.y - targetY) > 1) {
        pending++;
        scene.tweens.add({
          targets: sprite,
          y: targetY,
          duration: 300,
          ease: 'Quad.easeOut',
          onComplete: () => {
            pending--;
            if (pending === 0) {
              state.animating = false;
              checkWinLose();
            }
          },
        });
      }
    }
  }
  if (pending === 0) {
    state.animating = false;
    checkWinLose();
  }
  // NOTE: do NOT refresh pendingPoop here — the player's queued poop must not change
  // just because the construction crew pushed new rows.
}

function triggerOverflowLose(): void {
  state.gameOver = true;
  state.animating = false;
  showMessage('🚧 Construction wins!\nBuilding too tall!', 0);
  scene.time.delayedCall(2200, resetGame);
}

// ─── Win/Lose ─────────────────────────────────────────────────────────────────

function checkWinLose(): void {
  // Win = no normal blocks remain (poop cells are allowed to linger)
  const noNormalBlocks = state.grid.every(row =>
    row.every(cell => cell.type !== 'normal'),
  );

  if (noNormalBlocks) {
    state.animating = true;
    showMessage('🪿 CLEARED!\nHonk honk!', 900);
    scene.time.delayedCall(1000, () => {
      refillFromBottom();
    });
    return;
  }

  // No moves left when the absolute top row is occupied (truly no space left)
  const noMoves = state.grid[0].every(cell => cell.type !== 'empty');
  if (noMoves) {
    state.gameOver = true;
    state.animating = false;
    showMessage('💩 No moves left!\nGame over!', 0);
    scene.time.delayedCall(2200, resetGame);
    return;
  }

  finishTurn();
}

/**
 * On a clear: push n fresh rows in from the bottom.
 * Any surviving poop cells are already above the empty zone so they
 * ride up naturally as the new rows fill from below.
 * No overflow check needed — the board just cleared.
 */
function refillFromBottom(): void {
  const n = LEVEL_CONFIG[state.level].clearRefillRows;

  // Wipe every remaining poop cell sprite and mark cells empty so the
  // push fills a clean slate.
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].type === 'poop') {
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite!.destroy();
          state.grid[r][c].sprite = null;
        }
        state.grid[r][c] = { type: 'empty', colorIndex: -1, sprite: null };
        // Refresh the visual empty-cell placeholder
        refreshCellSprite(r, c);
      }
    }
  }

  // Shift existing rows (all empty now) upward by n to make room at bottom
  for (let r = 0; r < GRID_ROWS - n; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const src = state.grid[r + n][c];
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.destroy();
        state.grid[r][c].sprite = null;
      }
      state.grid[r][c] = { type: src.type, colorIndex: src.colorIndex, sprite: src.sprite };
      state.grid[r + n][c].sprite = null;
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.y = cellY(r);
      }
    }
  }

  // Fill bottom n rows with new random blocks, sliding in from below.
  // Per-column stagger (0–2 rows) gives a jagged roofline on the new block.
  const colStagger: number[] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    colStagger.push(Phaser.Math.Between(0, 2));
  }

  for (let r = GRID_ROWS - n; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (state.grid[r][c].sprite) {
        state.grid[r][c].sprite!.destroy();
        state.grid[r][c].sprite = null;
      }
      // Skip the top colStagger[c] rows of this column's new block
      const colStartRow = GRID_ROWS - n + colStagger[c];
      if (r < colStartRow) {
        state.grid[r][c] = { type: 'empty', colorIndex: -1, sprite: null };
        const sprite = makeCellSprite(state.grid[r][c], r, c);
        gridContainer.add(sprite);
        state.grid[r][c].sprite = sprite;
        continue;
      }
      const colorIndex = Phaser.Math.Between(0, activeColors() - 1);
      state.grid[r][c] = { type: 'normal', colorIndex, sprite: null };
      const sprite = makeCellSprite(state.grid[r][c], r, c);
      sprite.y = cellY(r) + CELL_SIZE * n; // start below, slide up
      sprite.setAlpha(0);
      gridContainer.add(sprite);
      state.grid[r][c].sprite = sprite;
    }
  }

  // Animate all sprites to their target rows
  let pending = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const sprite = state.grid[r][c].sprite;
      if (!sprite) continue;
      const targetY = cellY(r);
      const delay = (GRID_ROWS - 1 - r) * 18; // bottom rows first
      if (Math.abs(sprite.y - targetY) > 1 || sprite.alpha < 1) {
        pending++;
        scene.time.delayedCall(delay, () => {
          scene.tweens.add({
            targets: sprite,
            y: targetY,
            alpha: 1,
            duration: 300,
            ease: 'Quad.easeOut',
            onComplete: () => {
              pending--;
              if (pending === 0) {
                state.pendingPoop = pickRandomPoop();
                refreshPoopIndicator();
                finishTurn();
              }
            },
          });
        });
      }
    }
  }

  if (pending === 0) {
    state.pendingPoop = pickRandomPoop();
    refreshPoopIndicator();
    finishTurn();
  }
}

function finishTurn(): void {
  state.animating = false;

  // Drain any queued tap if it's still within the 200ms grace window
  if (state.queuedCol !== null && !state.gameOver) {
    const age = performance.now() - state.queuedAt;
    const col = state.queuedCol;
    state.queuedCol = null;
    if (age <= 200 && state.grid[0][col].type === 'empty') {
      scene.time.delayedCall(180, () => dropPoop(col));
      // Skip construction drain this turn — drop takes priority
      return;
    }
  }

  // Drain any construction push that fired while we were busy
  if (state.constructionPending && !state.gameOver) {
    state.constructionPending = false;
    const cfg = LEVEL_CONFIG[state.level];
    pushRowsFromBottom(cfg.rowsAdded);
  }
}

function resetGame(): void {
  stopBGM();
  messageText.setAlpha(0);
  gridContainer.removeAll(true);
  if (constructionTimer) { constructionTimer.remove(); constructionTimer = null; }
  if (gooseFlapTimer)    { gooseFlapTimer.remove();    gooseFlapTimer = null; }
  if (workerSparkTimer)  { workerSparkTimer.remove();  workerSparkTimer = null; }
  workerContainers.forEach(w => w.destroy());
  workerContainers = [];
  initState();
  buildGrid();
  buildGoose();
  refreshPoopIndicator();
  buildConstructionCrew();
  // Do NOT start construction timer here — title screen holds it
  levelText.setText('Level 1');
  updateScoreHUD();
  state.gameOver = false;
  state.animating = false;
  // Show title screen again
  titleActive = true;
  buildTitleScreen();
}


// ─── Floating Message ─────────────────────────────────────────────────────────

function showMessage(msg: string, duration: number): void {
  messageText.setText(msg).setAlpha(1);
  if (duration > 0) {
    scene.time.delayedCall(duration, () => {
      scene.tweens.add({ targets: messageText, alpha: 0, duration: 300 });
    });
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────────

const config = createGameConfig();
config.scene = { create, update };
new Phaser.Game(config);
