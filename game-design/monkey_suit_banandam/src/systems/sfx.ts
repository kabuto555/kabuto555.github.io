/**
 * Sound effects — native Web Audio API, no Tone.js.
 * Shares the AudioContext from music.ts. Routes through its own
 * SFX gain node so BGM ducking never affects SFX.
 */
import { getAudioContext } from './music';

// ── SFX bus ───────────────────────────────────────────────────────────────────
let _sfxGain: GainNode | null = null;

function ctx(): AudioContext | null { return getAudioContext(); }

export function initSfx(): void {
  const c = ctx();
  if (!c || _sfxGain) return;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -3; lim.ratio.value = 12;
  lim.attack.value = 0.001; lim.release.value = 0.05;
  lim.connect(c.destination);
  _sfxGain = c.createGain();
  _sfxGain.gain.value = 0.85;
  _sfxGain.connect(lim);
}

function dest(): AudioNode | null { return _sfxGain; }

// ── Low-level helpers ─────────────────────────────────────────────────────────

function osc(
  type: OscillatorType, freq: number,
  attackT: number, decayT: number, peakGain: number,
  freqEnd?: number,
): void {
  const c = ctx(); const d = dest();
  if (!c || !d) return;
  const now = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peakGain, now + attackT);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attackT + decayT);
  g.connect(d);
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (freqEnd !== undefined)
    o.frequency.exponentialRampToValueAtTime(freqEnd, now + attackT + decayT);
  o.connect(g); o.start(now); o.stop(now + attackT + decayT + 0.04);
}

function noise(
  filterType: BiquadFilterType, filterFreq: number, filterQ: number,
  decayT: number, gain: number,
  filterFreqEnd?: number,
): void {
  const c = ctx(); const d = dest();
  if (!c || !d) return;
  const now = c.currentTime;
  // Generate a short noise buffer on the fly
  const len = Math.ceil(c.sampleRate * (decayT + 0.04));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filterType; f.frequency.setValueAtTime(filterFreq, now); f.Q.value = filterQ;
  if (filterFreqEnd !== undefined)
    f.frequency.exponentialRampToValueAtTime(filterFreqEnd, now + decayT);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + decayT);
  src.connect(f); f.connect(g); g.connect(d);
  src.start(now); src.stop(now + decayT + 0.04);
}

// Schedule a note offset into the future (for arpeggios)
function oscAt(
  type: OscillatorType, freq: number,
  when: number, attackT: number, decayT: number, peakGain: number,
): void {
  const c = ctx(); const d = dest();
  if (!c || !d) return;
  const g = c.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peakGain, when + attackT);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attackT + decayT);
  g.connect(d);
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, when);
  o.connect(g); o.start(when); o.stop(when + attackT + decayT + 0.04);
}

// ── sfxShoot ──────────────────────────────────────────────────────────────────
export function sfxShoot(type: string): void {
  if (!_sfxGain) return;
  if (type === 'vulcan') {
    // Short metallic click: high sine blip
    osc('sine', 1800, 0.001, 0.028, 0.28, 420);
    noise('bandpass', 3200, 4, 0.018, 0.14);
  } else if (type === 'beam') {
    // FM-style laser buzz: sawtooth sweep down
    osc('sawtooth', 680, 0.001, 0.09, 0.22, 140);
    osc('square',   340, 0.001, 0.06, 0.10, 90);
  } else if (type === 'missile') {
    // Low whoosh: filtered noise sweep
    noise('bandpass', 280, 3, 0.22, 0.32, 600);
    osc('sine', 120, 0.01, 0.18, 0.18, 55);
  } else if (type === 'sword') {
    // Teal slash: high-to-low sine sweep + shimmer noise
    osc('triangle', 1200, 0.002, 0.20, 0.30, 180);
    noise('highpass', 3000, 1.5, 0.14, 0.18);
  }
}

// ── sfxEnemyHit ───────────────────────────────────────────────────────────────
export function sfxEnemyHit(isWeakPoint: boolean): void {
  if (!_sfxGain) return;
  if (isWeakPoint) {
    // Bright metallic thwack
    osc('sine', 1100, 0.001, 0.07, 0.45, 320);
    noise('bandpass', 4200, 3, 0.05, 0.35);
  } else {
    // Dull thud
    osc('sine', 340, 0.001, 0.06, 0.32, 110);
    noise('bandpass', 1800, 2, 0.04, 0.22);
  }
}

// ── sfxEnemyDie ───────────────────────────────────────────────────────────────
export function sfxEnemyDie(isBoss: boolean): void {
  if (!_sfxGain) return;
  if (isBoss) {
    // Big boom: deep sub thud + filtered noise explosion
    osc('sine', 80,  0.002, 0.70, 0.90, 22);
    osc('sine', 160, 0.002, 0.40, 0.55, 40);
    noise('lowpass', 600, 1, 0.55, 0.75);
    noise('bandpass', 2800, 2, 0.18, 0.45);
  } else {
    // Small crunch
    osc('sine', 180, 0.001, 0.20, 0.55, 45);
    noise('bandpass', 2200, 2, 0.12, 0.40);
  }
}

// ── sfxPlayerHurt ─────────────────────────────────────────────────────────────
export function sfxPlayerHurt(): void {
  if (!_sfxGain) return;
  // Low FM-style impact: square sweep down + low noise hit
  osc('square', 200, 0.001, 0.22, 0.45, 55);
  osc('sine',   100, 0.001, 0.18, 0.38, 40);
  noise('lowpass', 800, 2, 0.14, 0.30);
}

// ── sfxPickup ─────────────────────────────────────────────────────────────────
export function sfxPickup(kind: string): void {
  if (!_sfxGain) return;
  const c = ctx(); if (!c) return;
  const now = c.currentTime;
  if (kind === 'health') {
    // Warm two-note ascending chime
    oscAt('triangle', 523.3, now,        0.005, 0.18, 0.36); // C5
    oscAt('triangle', 784.0, now + 0.09, 0.005, 0.22, 0.40); // G5
  } else {
    // Bright 4-note sparkle arpeggio
    const freqs = [523.3, 659.3, 784.0, 1047]; // C5 E5 G5 C6
    freqs.forEach((f, i) => oscAt('triangle', f, now + i * 0.055, 0.004, 0.16, 0.32));
  }
}

// ── sfxBoost ──────────────────────────────────────────────────────────────────
export function sfxBoost(): void {
  if (!_sfxGain) return;
  const c = ctx(); if (!c) return;
  const d = dest();
  const now = c.currentTime;
  const DUR = 1.85; // matches BOOST_DURATION

  // ── Layer 1: high whoosh — white noise through a fast-sweeping bandpass ───
  // Sweeps from 400Hz up to 3200Hz in the first 0.2s (the initial rush),
  // then slowly falls back to 1800Hz over the remaining duration.
  {
    const len = Math.ceil(c.sampleRate * (DUR + 0.1));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(400, now);
    bp.frequency.exponentialRampToValueAtTime(3200, now + 0.18); // fast rush up
    bp.frequency.exponentialRampToValueAtTime(1800, now + DUR);  // drift down

    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.38, now + 0.08);  // snap in fast
    g.gain.setValueAtTime(0.32, now + DUR * 0.6);      // slight swell sustain
    g.gain.exponentialRampToValueAtTime(0.0001, now + DUR);

    src.connect(bp); bp.connect(g); g.connect(d!);
    src.start(now); src.stop(now + DUR + 0.05);
  }

  // ── Layer 2: body whoosh — pink-ish noise through a lower lowpass ──────────
  // Gives weight and rumble under the high whoosh.
  {
    const len = Math.ceil(c.sampleRate * (DUR + 0.1));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    // Pink-ish: accumulate two passes of white noise for slope
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.98 * b + 0.14 * w;
      data[i] = b * 6;
    }
    const src = c.createBufferSource(); src.buffer = buf;

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(200, now);
    lp.frequency.exponentialRampToValueAtTime(900, now + 0.25);
    lp.frequency.exponentialRampToValueAtTime(500, now + DUR);

    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + DUR);

    src.connect(lp); lp.connect(g); g.connect(d!);
    src.start(now); src.stop(now + DUR + 0.05);
  }

  // ── Layer 3: engine scream — sawtooth rising pitch ──────────────────────────
  // A detuned pair of saws that pitch-rises like a turbine spooling up.
  {
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, now + DUR);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 1;
    lp.connect(g); g.connect(d!);

    for (const detune of [-8, 0, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(60,  now);
      o.frequency.exponentialRampToValueAtTime(220, now + 0.30); // spool up fast
      o.frequency.exponentialRampToValueAtTime(160, now + DUR);  // settle
      o.detune.value = detune;
      o.connect(lp); o.start(now); o.stop(now + DUR + 0.05);
    }
  }

  // ── Layer 4: transient impact crack at the very start ────────────────────────
  // A sharp high-frequency burst on the first frame to sell the snap of activation.
  {
    const len = Math.ceil(c.sampleRate * 0.06);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;

    const bp = c.createBiquadFilter();
    bp.type = 'highpass'; bp.frequency.value = 5000;

    const g = c.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    src.connect(bp); bp.connect(g); g.connect(d!);
    src.start(now); src.stop(now + 0.07);
  }
}

// ── sfxCriticalHit ─────────────────────────────────────────────────────────────────
/**
 * Anime-style critical hit / death blow sound.
 * Four simultaneous layers: metallic clang, sub-bass thud,
 * freeze-frame pitch swell, and a glassy shimmer ring.
 * isBoss = true scales everything up for the boss kill.
 */
export function sfxCriticalHit(isBoss: boolean): void {
  if (!_sfxGain) return;
  const c = ctx(); const d = dest();
  if (!c || !d) return;
  const now = c.currentTime;
  const scale = isBoss ? 1.4 : 1.0;

  // ── Echo / delay bus — all layers send here for slapback echo ────────────
  // Two echoes at ~180ms and ~360ms, each quieter, with a gentle HP filter
  // so the echo is airy rather than muddy.
  const echoDelay1 = c.createDelay(0.5); echoDelay1.delayTime.value = 0.18;
  const echoDelay2 = c.createDelay(0.5); echoDelay2.delayTime.value = 0.36;
  const echoGain1  = c.createGain(); echoGain1.gain.value  = 0.38;
  const echoGain2  = c.createGain(); echoGain2.gain.value  = 0.18;
  const echoHP     = c.createBiquadFilter();
  echoHP.type = 'highpass'; echoHP.frequency.value = 300; // thin out the echo
  // Echo chain: source → echoDelay1 → echoGain1 → dest
  //                                  → echoDelay2 → echoGain2 → dest
  echoDelay1.connect(echoHP);
  echoHP.connect(echoGain1); echoGain1.connect(d);
  echoHP.connect(echoDelay2); echoDelay2.connect(echoGain2); echoGain2.connect(d);
  // Helper: send a node to both dry output and echo input
  function withEcho(node: AudioNode): void {
    node.connect(d!);         // dry
    node.connect(echoDelay1); // wet → echo chain
  }

  // ── 1. Metallic CLANG — struck-blade resonance ───────────────────────────
  // Slower decay (0.55→0.9, 0.30→0.5, 0.18→0.32) so the ring hangs longer
  for (const [freq, amp, decay] of [
    [1480, 0.70 * scale, 0.90],  // fundamental clang
    [2960, 0.35 * scale, 0.50],  // 2nd harmonic
    [4200, 0.20 * scale, 0.32],  // 3rd harmonic shimmer
  ] as [number, number, number][]) {
    const g = c.createGain();
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, now);
    o.connect(g); o.start(now); o.stop(now + decay + 0.05);
    withEcho(g);
  }

  // ── 2. Sub-bass thud — the weight of impact ────────────────────────────
  // Slower decay (0.32→0.55) for a longer rumble
  {
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.90 * scale, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(isBoss ? 140 : 120, now);
    o.frequency.exponentialRampToValueAtTime(22, now + 0.50);
    o.connect(g); o.start(now); o.stop(now + 0.60);
    withEcho(g);
  }
  // Impact crack transient (no echo — it should be tight and dry)
  {
    const len = Math.ceil(c.sampleRate * 0.04);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 3500; f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.60 * scale, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    src.connect(f); f.connect(g); g.connect(d); // dry only
    src.start(now); src.stop(now + 0.05);
  }

  // ── 3. Freeze-frame swell — rising pitch for the time-slow feel ───────────
  // Slower decay (0.80→1.20) so the swell lingers through the explosion
  {
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18 * scale, now + 0.10);
    g.gain.linearRampToValueAtTime(0.22 * scale, now + 0.30);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.20);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1.5;
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(80, now);
    o.frequency.exponentialRampToValueAtTime(isBoss ? 320 : 260, now + 1.0);
    o.connect(lp); lp.connect(g); o.start(now); o.stop(now + 1.25);
    withEcho(g);
  }

  // ── 4. Glassy shimmer ring — high-frequency overtone hanging in air ──────
  // Slower decay (0.90→1.6, 1.4→2.2) — the ring really hangs now
  {
    const ringFreq = isBoss ? 6800 : 5600;
    const ringDur  = isBoss ? 2.2 : 1.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.28 * scale, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + ringDur);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(ringFreq, now);
    o.frequency.exponentialRampToValueAtTime(ringFreq * 0.92, now + ringDur);
    o.connect(g); o.start(now); o.stop(now + ringDur + 0.05);
    withEcho(g);
  }

  // Boss-only: extra low rumble
  if (isBoss) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.45, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.40);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 0.8;
    lp.connect(g); g.connect(d);
    const len = Math.ceil(c.sampleRate * 1.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    src.connect(lp); src.start(now); src.stop(now + 1.5);
  }
}

// ── sfxLevelUp ─────────────────────────────────────────────────────────────────
export function sfxLevelUp(): void {
  if (!_sfxGain) return;
  const c = ctx(); if (!c) return;
  const now = c.currentTime;
  // Ascending major chord arpeggio — triumphant
  const freqs = [261.6, 329.6, 392.0, 523.3]; // C4 E4 G4 C5
  freqs.forEach((f, i) => {
    oscAt('sawtooth', f,     now + i * 0.08, 0.008, 0.38, 0.26);
    oscAt('sine',     f * 2, now + i * 0.08, 0.008, 0.30, 0.12); // octave shimmer
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
export function disposeSfx(): void {
  _sfxGain = null; // AudioContext owned by music.ts; just drop the reference
}
