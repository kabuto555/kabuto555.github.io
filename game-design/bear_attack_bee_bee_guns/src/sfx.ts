/**
 * sfx.ts — Procedural sound effects via Web Audio API.
 * No audio files required. All sounds are synthesised at runtime.
 *
 * Usage:  SFX.beeShoot();  SFX.bearHurt();  etc.
 *
 * A single shared AudioContext is created on first use and reused.
 * Browsers require a user gesture before audio can start; Phaser's first
 * pointer interaction already satisfies this on all platforms.
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// ── Utility helpers ──────────────────────────────────────────────────────────

/** Linear gain ramp: fade in then fade out */
function ramp(g: GainNode, now: number, attack: number, sustain: number, release: number, peak = 0.4): void {
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + attack);
  g.gain.setValueAtTime(peak, now + attack + sustain);
  g.gain.linearRampToValueAtTime(0, now + attack + sustain + release);
}

/** Create an oscillator, connect through a gain, start+stop automatically */
function osc(
  type: OscillatorType,
  freq: number,
  attack: number,
  sustain: number,
  release: number,
  peak = 0.35,
  dest?: AudioNode,
): void {
  const c = ctx();
  const now = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  o.connect(g);
  g.connect(dest ?? c.destination);
  ramp(g, now, attack, sustain, release, peak);
  o.start(now);
  o.stop(now + attack + sustain + release + 0.05);
}

/** Frequency glide oscillator */
function oscGlide(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  peak = 0.35,
  dest?: AudioNode,
): void {
  const c = ctx();
  const now = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freqStart, now);
  o.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
  o.connect(g);
  g.connect(dest ?? c.destination);
  ramp(g, now, 0.005, duration * 0.7, duration * 0.3, peak);
  o.start(now);
  o.stop(now + duration + 0.05);
}

/** White-noise burst via AudioBuffer */
function noise(duration: number, peak = 0.25, attack = 0.005, dest?: AudioNode): void {
  const c = ctx();
  const now = c.currentTime;
  const sr = c.sampleRate;
  const len = Math.ceil(sr * (duration + 0.05));
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  src.connect(g);
  g.connect(dest ?? c.destination);
  ramp(g, now, attack, duration * 0.3, duration * 0.7, peak);
  src.start(now);
  src.stop(now + duration + 0.05);
}

/** Reverb-like tail: a short noise burst filtered through a BiquadFilter */
function reverbTail(duration: number, freq: number, peak = 0.18): void {
  const c = ctx();
  const now = c.currentTime;
  const sr = c.sampleRate;
  const len = Math.ceil(sr * duration);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  // Exponential decay into the noise buffer for a reverb feel
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = freq;
  filt.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filt);
  filt.connect(g);
  g.connect(c.destination);
  src.start(now);
  src.stop(now + duration + 0.05);
}

// ── Public SFX interface ─────────────────────────────────────────────────────

export const SFX = {

  /** Bee swarm launched — buzzy oscillator burst */
  beeShoot(): void {
    // Fast sawtooth buzz rising in pitch
    oscGlide('sawtooth', 280, 520, 0.18, 0.22);
    // Layer a soft triangle underneath
    osc('triangle', 180, 0.01, 0.10, 0.07, 0.10);
  },

  /** No bee slots available — low denied thud */
  noBees(): void {
    oscGlide('sawtooth', 120, 60, 0.12, 0.28);
    noise(0.08, 0.12, 0.002);
  },

  /** Bear takes damage — sharp crunch grunt */
  bearHurt(): void {
    // Deep thump
    oscGlide('sine', 200, 60, 0.18, 0.45);
    // Gritty noise layer
    noise(0.14, 0.30, 0.002);
    // High scratch
    oscGlide('sawtooth', 900, 200, 0.08, 0.15);
  },

  /** Enemy stung (per HP lost) — wet zap */
  enemyHurt(): void {
    oscGlide('square', 600, 300, 0.08, 0.18);
    noise(0.06, 0.14, 0.001);
  },

  /** Enemy killed — dark crumble thud */
  enemyDie(): void {
    oscGlide('sine', 150, 40, 0.22, 0.40);
    noise(0.18, 0.22, 0.003);
  },

  /** Zone entrance — soulslike long reverb bell toll */
  zoneEnter(): void {
    const c = ctx();
    const now = c.currentTime;
    // Deep bell fundamental
    const fund = c.createOscillator();
    const fundG = c.createGain();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(110, now);
    fund.connect(fundG);
    fundG.connect(c.destination);
    fundG.gain.setValueAtTime(0, now);
    fundG.gain.linearRampToValueAtTime(0.45, now + 0.02);
    fundG.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    fund.start(now);
    fund.stop(now + 4.6);
    // Bell overtone (ratio ~2.76 for inharmonic bell quality)
    const ov1 = c.createOscillator();
    const ov1G = c.createGain();
    ov1.type = 'sine';
    ov1.frequency.setValueAtTime(110 * 2.76, now);
    ov1.connect(ov1G); ov1G.connect(c.destination);
    ov1G.gain.setValueAtTime(0, now);
    ov1G.gain.linearRampToValueAtTime(0.20, now + 0.02);
    ov1G.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    ov1.start(now); ov1.stop(now + 3.0);
    // High shimmer
    const ov2 = c.createOscillator();
    const ov2G = c.createGain();
    ov2.type = 'sine';
    ov2.frequency.setValueAtTime(110 * 5.4, now);
    ov2.connect(ov2G); ov2G.connect(c.destination);
    ov2G.gain.setValueAtTime(0, now);
    ov2G.gain.linearRampToValueAtTime(0.08, now + 0.01);
    ov2G.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    ov2.start(now); ov2.stop(now + 1.5);
    // Reverb tail
    reverbTail(3.0, 220, 0.14);
  },

  /** Stage clear (non-boss) — ascending triumphant fanfare */
  stageClear(): void {
    const c = ctx();
    const now = c.currentTime;
    // Ascending arpeggio: C4 E4 G4 C5
    const notes = [261.6, 329.6, 392.0, 523.2];
    notes.forEach((freq, i) => {
      const delay = i * 0.14;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, now + delay);
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.38, now + delay + 0.03);
      g.gain.setValueAtTime(0.38, now + delay + 0.18);
      g.gain.linearRampToValueAtTime(0, now + delay + 0.55);
      o.start(now + delay);
      o.stop(now + delay + 0.6);
    });
    // Sustain chord underneath
    [261.6, 329.6, 392.0].forEach((freq) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, now + 0.3);
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, now + 0.3);
      g.gain.linearRampToValueAtTime(0.15, now + 0.4);
      g.gain.linearRampToValueAtTime(0, now + 1.6);
      o.start(now + 0.3); o.stop(now + 1.7);
    });
  },

  /** Boss cleared — massive soulslike deep bell + collapse rumble */
  bossClear(): void {
    const c = ctx();
    const now = c.currentTime;
    // Very deep bell strike
    const fund = c.createOscillator();
    const fundG = c.createGain();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(55, now);      // A1 — very deep
    fund.connect(fundG); fundG.connect(c.destination);
    fundG.gain.setValueAtTime(0, now);
    fundG.gain.linearRampToValueAtTime(0.7, now + 0.015);
    fundG.gain.exponentialRampToValueAtTime(0.0001, now + 6.0);
    fund.start(now); fund.stop(now + 6.1);
    // Inharmonic overtone — foreboding quality
    const ov = c.createOscillator();
    const ovG = c.createGain();
    ov.type = 'sine';
    ov.frequency.setValueAtTime(55 * 2.17, now);
    ov.connect(ovG); ovG.connect(c.destination);
    ovG.gain.setValueAtTime(0, now);
    ovG.gain.linearRampToValueAtTime(0.25, now + 0.015);
    ovG.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
    ov.start(now); ov.stop(now + 3.6);
    // Low rumble noise collapse
    noise(1.2, 0.35, 0.01);
    // Mid-range noise decay
    setTimeout(() => noise(1.5, 0.18, 0.05), 80);
    // Reverb tail — long
    reverbTail(5.0, 110, 0.22);
    // Ascending minor chord resolving downward
    const resolveNotes = [220, 261.6, 311.1, 220];  // A3 C4 Eb4 A3
    resolveNotes.forEach((freq, i) => {
      const delay = 0.6 + i * 0.28;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, now + delay);
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.22, now + delay + 0.04);
      g.gain.linearRampToValueAtTime(0, now + delay + 0.45);
      o.start(now + delay); o.stop(now + delay + 0.5);
    });
  },

  /** Boss appears — creepy dissonant low drone swell */
  bossAppear(): void {
    const c = ctx();
    const now = c.currentTime;
    // Dissonant tritone drone: A2 + Eb3 (the "devil's interval")
    [[110, 0.55], [155.6, 0.35]].forEach(([freq, peak]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq as number, now);
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak as number, now + 0.8);
      g.gain.setValueAtTime(peak as number, now + 1.6);
      g.gain.linearRampToValueAtTime(0, now + 2.8);
      o.start(now); o.stop(now + 2.9);
    });
    // Slow low-frequency tremolo via LFO modulation
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(3.2, now);   // 3.2 Hz tremolo
    lfoG.gain.setValueAtTime(30, now);
    lfo.connect(lfoG);
    // Haunted high whistle glide
    oscGlide('sine', 880, 660, 2.5, 0.08);
    // Noise swell
    noise(2.0, 0.20, 0.4);
    lfo.start(now); lfo.stop(now + 2.9);
  },

  /** Boss spawns — deep explosion thump */
  bossSpawn(): void {
    // Sub-bass punch
    oscGlide('sine', 80, 25, 0.35, 0.55);
    // Noise explosion body
    noise(0.40, 0.45, 0.004);
    // Short mid crack on top
    oscGlide('sawtooth', 300, 60, 0.12, 0.25);
  },

  /** Enemy fires a projectile — sharp pew */
  enemyShoot(): void {
    oscGlide('square', 520, 180, 0.10, 0.16);
    noise(0.05, 0.08, 0.001);
  },

  /** Critter rescued — bright cheerful chime */
  cageOpen(): void {
    const c = ctx();
    const now = c.currentTime;
    // Two-note rising chime: G5 then B5
    const chimeNotes: [number, number][] = [[784, 0], [988, 0.13]];
    for (const [freq, delay] of chimeNotes) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, now + delay);
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.32, now + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.55);
      o.start(now + delay);
      o.stop(now + delay + 0.6);
    }
    // Soft sparkle shimmer
    osc('sine', 1568, 0.005, 0.05, 0.20, 0.12);
  },

  /** Boss takes a bee sting — wailing beast: pitch falls then rises with random amounts */
  bossHurt(): void {
    const now200 = Date.now();
    if (now200 - _bossHurtLastTime < 200) return;
    _bossHurtLastTime = now200;
    const c = ctx();
    const now = c.currentTime;
    // Randomise the wail shape every call
    const startFreq = 320 + Math.random() * 160;          // 320–480 Hz
    const fallFreq  =  55 + Math.random() *  60;          //  55–115 Hz (deep fall)
    const riseFreq  = 180 + Math.random() * 200;          // 180–380 Hz (rise back up)
    const fallTime  = 0.30 + Math.random() * 0.36;        // 0.30–0.66 s to bottom
    const riseTime  = 0.42 + Math.random() * 0.54;        // 0.42–0.96 s to rise
    const total     = fallTime + riseTime;

    const o  = c.createOscillator();
    const g  = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(startFreq, now);
    o.frequency.exponentialRampToValueAtTime(fallFreq,  now + fallTime);
    o.frequency.exponentialRampToValueAtTime(riseFreq,  now + fallTime + riseTime);
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.008);
    g.gain.setValueAtTime(0.13, now + total * 0.6);
    g.gain.linearRampToValueAtTime(0, now + total + 0.04);
    o.start(now);
    o.stop(now + total + 0.08);

    // Second layered voice — slightly detuned for thickness
    const detune = 1.018 + Math.random() * 0.025;
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = 'square';
    o2.frequency.setValueAtTime(startFreq * detune, now);
    o2.frequency.exponentialRampToValueAtTime(fallFreq  * detune, now + fallTime);
    o2.frequency.exponentialRampToValueAtTime(riseFreq  * detune, now + fallTime + riseTime);
    o2.connect(g2);
    g2.connect(c.destination);
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.06, now + 0.012);
    g2.gain.linearRampToValueAtTime(0, now + total + 0.04);
    o2.start(now);
    o2.stop(now + total + 0.08);

    // Short noise transient on the attack
    noise(0.08, 0.07, 0.002);
  },

  /** Boss fires attack — per attackType character */
  bossAttack(type: 'slash' | 'projectile' | 'timebomb' | 'artillery'): void {
    switch (type) {
      case 'slash':
        // Elon — fast sharp whoosh downward
        oscGlide('sawtooth', 800, 120, 0.15, 0.40);
        noise(0.12, 0.25, 0.002);
        break;
      case 'projectile':
        // Zuck — hollow bubble pop
        oscGlide('sine', 440, 220, 0.20, 0.22);
        osc('square', 110, 0.005, 0.06, 0.10, 0.14);
        break;
      case 'timebomb':
        // Sam — ominous ticking placement
        osc('square', 220, 0.005, 0.04, 0.06, 0.28);
        noise(0.06, 0.12, 0.002);
        break;
      case 'artillery':
        // Jeff — distant thud + whistle in
        oscGlide('sine', 600, 80, 0.25, 0.45);
        noise(0.20, 0.35, 0.01);
        break;
    }
  },

};

// ────────────────────────────────────────────────────────────────────────────
// BGM — Procedural looping background music
// Two tracks:
//   stage  — sombre, melancholic, gothic Bloodborne-like ambient
//   boss   — epic Dark Souls-style driving battle music
//
// Architecture: each track schedules a bar's worth of Web Audio nodes,
// then uses setTimeout to re-invoke itself for the next bar, creating a
// seamless loop. A master GainNode per track allows smooth fade-out.
// ────────────────────────────────────────────────────────────────────────────

let _bossHurtLastTime = 0;  // throttle: min 200ms between calls

// BGM track type
type BgmTrack = 'stage' | 'boss' | null;

let _bgmMaster: GainNode | null = null;
let _bgmTrack: BgmTrack = null;
let _bgmLoopId: ReturnType<typeof setTimeout> | null = null;
let _bgmBar = 0;   // bar counter, increments each loop for variation

function bgmMaster(): GainNode {
  const c = ctx();
  if (!_bgmMaster) {
    _bgmMaster = c.createGain();
    _bgmMaster.connect(c.destination);
  }
  return _bgmMaster;
}

/** Schedule one oscillator note into the master BGM bus */
function bgmNote(
  type: OscillatorType,
  freq: number,
  startOff: number,
  dur: number,
  peak: number,
  baseTime: number,
): void {
  const c = ctx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, baseTime + startOff);
  o.connect(g);
  g.connect(bgmMaster());
  const atk = Math.min(0.04, dur * 0.1);
  const rel = Math.min(0.3, dur * 0.4);
  g.gain.setValueAtTime(0, baseTime + startOff);
  g.gain.linearRampToValueAtTime(peak, baseTime + startOff + atk);
  g.gain.setValueAtTime(peak, baseTime + startOff + dur - rel);
  g.gain.linearRampToValueAtTime(0, baseTime + startOff + dur);
  o.start(baseTime + startOff);
  o.stop(baseTime + startOff + dur + 0.05);
}

/** Schedule one bar of filtered noise into the master BGM bus */
function bgmNoise(
  startOff: number,
  dur: number,
  peak: number,
  filterFreq: number,
  baseTime: number,
): void {
  const c = ctx();
  const sr = c.sampleRate;
  const len = Math.ceil(sr * (dur + 0.05));
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, baseTime + startOff);
  g.gain.linearRampToValueAtTime(peak, baseTime + startOff + 0.01);
  g.gain.linearRampToValueAtTime(0, baseTime + startOff + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(bgmMaster());
  src.start(baseTime + startOff);
  src.stop(baseTime + startOff + dur + 0.05);
}

// ── Stage BGM: sombre gothic Bloodborne-like ambient ────────────────────────
// Key: A natural minor (A B C D E F G)
// A2=110, C3=130.8, E3=164.8, G3=196, A3=220, C4=261.6, E4=329.6
// Tempo: very slow, ~48 bpm, barLen = 5 seconds
const STAGE_BAR = 5.0;  // seconds per bar

function scheduleStageBar(barIdx: number): void {
  if (_bgmTrack !== 'stage') return;
  const c = ctx();
  const now = c.currentTime;

  // Deep drone: A1 (55 Hz) — always present, very soft
  bgmNote('sine', 55, 0, STAGE_BAR * 0.95, 0.06, now);
  // Mid drone: A2 (110 Hz) — always present
  bgmNote('triangle', 110, 0, STAGE_BAR * 0.95, 0.045, now);

  // Sparse melodic fragments — vary by bar parity
  // Use 4-bar cycle of different note choices
  const cycle = barIdx % 4;

  if (cycle === 0) {
    // Bar 0: single long C3 note at beat 1, fading E3 at beat 3
    bgmNote('triangle', 130.8, 0.4,  3.2, 0.09, now);
    bgmNote('sine',     164.8, 2.8,  1.8, 0.06, now);
  } else if (cycle === 1) {
    // Bar 1: silence then a lonely A3 near the end
    bgmNote('triangle', 220, 3.5, 1.2, 0.10, now);
  } else if (cycle === 2) {
    // Bar 2: G3 and E3 — descending two-note sigh
    bgmNote('triangle', 196,   0.2, 2.2, 0.08, now);
    bgmNote('sine',     164.8, 2.6, 2.0, 0.07, now);
  } else {
    // Bar 3: single hollow C4 — lonely high note
    bgmNote('triangle', 261.6, 1.0, 2.8, 0.07, now);
  }

  // Occasional soft reverb-filtered noise breath (every other bar)
  if (barIdx % 2 === 0) {
    bgmNoise(STAGE_BAR * 0.3, STAGE_BAR * 0.5, 0.035, 400, now);
  }

  // Schedule next bar
  _bgmLoopId = setTimeout(() => {
    scheduleStageBar(barIdx + 1);
  }, (STAGE_BAR - 0.15) * 1000);  // 150 ms overlap to avoid gaps
}

// ── Boss BGM: epic Dark Souls-style driving battle music ────────────────────
// Key: D minor (dark, powerful)
// D2=73.4, A2=110, F2=87.3, C3=130.8, D3=146.8, F3=174.6, A3=220, D4=293.7
// Tempo: driving ~132 bpm, barLen = 1.82 s (one 4/4 bar at 132 bpm)
const BOSS_BAR  = 1.818; // seconds per bar (4 beats at 132 bpm)
const BOSS_BEAT = BOSS_BAR / 4;

function scheduleBossBar(barIdx: number): void {
  if (_bgmTrack !== 'boss') return;
  const c = ctx();
  const now = c.currentTime;

  // ── Driving bass ostinato (all 4 beats) ──
  // D2 on beats 1+3, A1 on beats 2+4 — creates relentless forward motion
  const bassNotes = [73.4, 55.0, 73.4, 55.0];
  for (let b = 0; b < 4; b++) {
    bgmNote('sawtooth', bassNotes[b], b * BOSS_BEAT,       BOSS_BEAT * 0.7, 0.18, now);
    bgmNote('sine',     bassNotes[b], b * BOSS_BEAT,       BOSS_BEAT * 0.9, 0.12, now); // sub reinforce
  }

  // ── Choir-like pad (sawtooth through imaginary filter — use triangle) ──
  // D minor chord stabs on beats 1 and 3
  const padNotes = [146.8, 174.6, 220];  // D3 F3 A3
  if (barIdx % 2 === 0) {
    for (const pf of padNotes) {
      bgmNote('sawtooth', pf, 0,           BOSS_BEAT * 1.6, 0.055, now);
      bgmNote('sawtooth', pf, BOSS_BEAT*2, BOSS_BEAT * 1.6, 0.055, now);
    }
  } else {
    // Bar 2: shift to Bb minor colour (Bb2 Db3 F3) for tension
    const altPad = [116.5, 138.6, 174.6];  // Bb2 Db3 F3
    for (const pf of altPad) {
      bgmNote('sawtooth', pf, 0,           BOSS_BEAT * 1.6, 0.05, now);
      bgmNote('sawtooth', pf, BOSS_BEAT*2, BOSS_BEAT * 1.4, 0.05, now);
    }
  }

  // ── Rhythmic percussion noise hits on beats 1 and 3 ──
  bgmNoise(0,              0.08, 0.18, 200, now);  // beat 1 kick
  bgmNoise(BOSS_BEAT * 2,  0.08, 0.14, 200, now);  // beat 3 kick
  // Snare-ish on beats 2 and 4
  bgmNoise(BOSS_BEAT,      0.06, 0.10, 2000, now);
  bgmNoise(BOSS_BEAT * 3,  0.06, 0.10, 2000, now);

  // ── Melodic accent every 4 bars ──
  if (barIdx % 4 === 0) {
    // Dramatic falling D4→A3 line
    bgmNote('triangle', 293.7, BOSS_BEAT * 0.5, BOSS_BEAT * 1.2, 0.09, now);
    bgmNote('triangle', 220,   BOSS_BEAT * 1.8, BOSS_BEAT * 1.2, 0.09, now);
  } else if (barIdx % 4 === 2) {
    // Rising tension: F3→A3
    bgmNote('triangle', 174.6, BOSS_BEAT * 0.5, BOSS_BEAT * 0.8, 0.08, now);
    bgmNote('triangle', 220,   BOSS_BEAT * 1.5, BOSS_BEAT * 0.9, 0.08, now);
    bgmNote('triangle', 261.6, BOSS_BEAT * 2.5, BOSS_BEAT * 0.8, 0.07, now); // C4
  }

  _bgmLoopId = setTimeout(() => {
    scheduleBossBar(barIdx + 1);
  }, (BOSS_BAR - 0.05) * 1000);  // 50 ms overlap
}

export const BGM = {

  startStage(): void {
    this.stop();
    _bgmTrack = 'stage';
    _bgmBar   = 0;
    // Fade master in
    const m = bgmMaster();
    const c = ctx();
    m.gain.cancelScheduledValues(c.currentTime);
    m.gain.setValueAtTime(0, c.currentTime);
    m.gain.linearRampToValueAtTime(1, c.currentTime + 2.0);
    scheduleStageBar(0);
  },

  startBoss(): void {
    this.stop();
    _bgmTrack = 'boss';
    _bgmBar   = 0;
    const m = bgmMaster();
    const c = ctx();
    m.gain.cancelScheduledValues(c.currentTime);
    m.gain.setValueAtTime(0, c.currentTime);
    m.gain.linearRampToValueAtTime(1, c.currentTime + 0.4);
    scheduleBossBar(0);
  },

  stop(): void {
    _bgmTrack = null;
    if (_bgmLoopId !== null) { clearTimeout(_bgmLoopId); _bgmLoopId = null; }
    if (_bgmMaster) {
      const c = ctx();
      _bgmMaster.gain.cancelScheduledValues(c.currentTime);
      _bgmMaster.gain.setValueAtTime(_bgmMaster.gain.value, c.currentTime);
      _bgmMaster.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
    }
  },

};
