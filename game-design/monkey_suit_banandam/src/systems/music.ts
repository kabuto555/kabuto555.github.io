/**
 * BGM — Hypnotic game trance, 10 themed tracks, native Web Audio API.
 * Each track has unique instruments, 4-bar phrase evolution, and slow
 * filter/effect automation for a living, breathing feel.
 */

// ── Audio context & master chain ──────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _masterComp: DynamicsCompressorNode | null = null;

let _playing = false;
let _curIdx  = -1;
let _curLoop: TrackLoop | null = null;

interface TrackLoop {
  stop(): void;
  setGain(value: number, rampSecs: number): void;
}

export async function startAudio(): Promise<void> {
  if (_ctx) return;
  _ctx = new AudioContext();
  if (_ctx.state === 'suspended') await _ctx.resume();

  _masterComp = _ctx.createDynamicsCompressor();
  _masterComp.threshold.value = -10;
  _masterComp.knee.value      =  8;
  _masterComp.ratio.value     =  4;
  _masterComp.attack.value    =  0.003;
  _masterComp.release.value   =  0.20;
  _masterComp.connect(_ctx.destination);

  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.80;
  _masterGain.connect(_masterComp);
}

// ── Noise buffers ─────────────────────────────────────────────────────────────
let _whiteBuf: AudioBuffer | null = null;
let _pinkBuf:  AudioBuffer | null = null;

function getWhite(): AudioBuffer {
  if (_whiteBuf) return _whiteBuf;
  const sr = _ctx!.sampleRate, len = sr * 2;
  _whiteBuf = _ctx!.createBuffer(1, len, sr);
  const d = _whiteBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _whiteBuf;
}

function getPink(): AudioBuffer {
  if (_pinkBuf) return _pinkBuf;
  const sr = _ctx!.sampleRate, len = sr * 2;
  _pinkBuf = _ctx!.createBuffer(1, len, sr);
  const d = _pinkBuf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
    b6=w*0.115926;
  }
  return _pinkBuf;
}

// ── Note → Hz ─────────────────────────────────────────────────────────────────
function hz(n: string): number {
  const T: Record<string,number> = {
    'B0':30.87,
    'C1':32.70,'C#1':34.65,'D1':36.71,'Eb1':38.89,'E1':41.20,'F1':43.65,'F#1':46.25,
    'G1':49.00,'Ab1':51.91,'A1':55.00,'Bb1':58.27,'B1':61.74,
    'C2':65.41,'C#2':69.30,'D2':73.42,'Eb2':77.78,'E2':82.41,'F2':87.31,'F#2':92.50,
    'G2':98.00,'Ab2':103.8,'A2':110.0,'Bb2':116.5,'B2':123.5,
    'C3':130.8,'C#3':138.6,'D3':146.8,'Eb3':155.6,'E3':164.8,'F3':174.6,'F#3':185.0,
    'G3':196.0,'Ab3':207.7,'A3':220.0,'Bb3':233.1,'B3':246.9,
    'C4':261.6,'C#4':277.2,'D4':293.7,'Eb4':311.1,'E4':329.6,'F4':349.2,'F#4':370.0,
    'G4':392.0,'Ab4':415.3,'A4':440.0,'Bb4':466.2,'B4':493.9,
    'C5':523.3,'C#5':554.4,'D5':587.3,'Eb5':622.3,'E5':659.3,'F5':698.5,'F#5':740.0,
    'G5':784.0,'Ab5':830.6,'A5':880.0,'Bb5':932.3,'B5':987.8,
    'C6':1047,'D6':1175,'E6':1319,'G6':1568,
  };
  return T[n] ?? 220;
}

// ── Shared low-level helpers ───────────────────────────────────────────────────

/** One-shot oscillator burst with ADSR-style gain envelope. */
function burst(
  dest: AudioNode, when: number,
  type: OscillatorType, freq: number,
  attackT: number, decayT: number, peakGain: number,
  freqEnd?: number,
): void {
  const ctx = _ctx!;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peakGain, when + attackT);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attackT + decayT);
  g.connect(dest);
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, when);
  if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(freqEnd, when + attackT + decayT);
  o.connect(g); o.start(when); o.stop(when + attackT + decayT + 0.05);
}

/** One-shot noise burst through a biquad filter. */
function noiseBurst(
  dest: AudioNode, buf: AudioBuffer, when: number,
  filterType: BiquadFilterType, filterFreq: number, filterQ: number,
  decayT: number, gain: number,
): void {
  const ctx = _ctx!;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decayT);
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = filterFreq; f.Q.value = filterQ;
  const s = ctx.createBufferSource(); s.buffer = buf;
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(when); s.stop(when + decayT + 0.02);
}

/** Standard EDM kick: pitched sub-sine drop + click transient + noise thud. */
function kick(dest: AudioNode, when: number, rootHz = 54, gain = 0.90): void {
  const ctx = _ctx!;
  // Sub-sine pitch drop
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0, when);
  sg.gain.linearRampToValueAtTime(gain, when + 0.002);
  sg.gain.exponentialRampToValueAtTime(0.0001, when + 0.40);
  sg.connect(dest);
  const so = ctx.createOscillator(); so.type = 'sine';
  so.frequency.setValueAtTime(rootHz * 4.5, when);
  so.frequency.exponentialRampToValueAtTime(rootHz, when + 0.07);
  so.frequency.exponentialRampToValueAtTime(rootHz * 0.55, when + 0.36);
  so.connect(sg); so.start(when); so.stop(when + 0.42);
  // Click
  burst(dest, when, 'sine', 2600, 0.001, 0.016, 0.50, 110);
  // Thud
  noiseBurst(dest, getWhite(), when, 'lowpass', 160, 1.0, 0.055, 0.24);
}

/** Sidechain duck: gain dip on every kick for trance pump. */
function sidechainDuck(gainNode: GainNode, when: number, fullGain: number): void {
  const g = gainNode.gain;
  g.setValueAtTime(fullGain * 0.12, when);
  g.setTargetAtTime(fullGain, when + 0.004, 0.055);
}

/** Standard punchy snare. */
function snare(dest: AudioNode, when: number, gain = 0.65): void {
  noiseBurst(dest, getWhite(), when, 'highpass', 950,  0.8, 0.13, gain);
  noiseBurst(dest, getWhite(), when, 'bandpass', 2400, 1.6, 0.06, gain * 0.60);
  burst(dest, when, 'sine', 340, 0.001, 0.028, gain * 0.38, 120);
}

/** Crisp hi-hat, closed or open. */
function hat(dest: AudioNode, when: number, gain = 0.20, open = false): void {
  noiseBurst(dest, getWhite(), when, 'highpass', 7200, 0.4, open ? 0.11 : 0.025, gain);
}

/** Clap: layered noise with slight pre-delay for realism. */
function clap(dest: AudioNode, when: number, gain = 0.60): void {
  for (let i = 0; i < 3; i++) {
    noiseBurst(dest, getWhite(), when + i * 0.008, 'bandpass', 1800, 1.2, 0.06, gain * (1 - i * 0.2));
  }
}

// ── Scheduler engine ─────────────────────────────────────────────────────────
// Each track is a factory function that owns its own instruments and returns
// a TrackLoop. The scheduler runs 16-step bars, calls the track's per-step
// callback, and passes a phrase counter so the track can evolve over time.

const LOOKAHEAD   = 0.15;  // seconds to schedule ahead
const SCHEDULE_MS = 25;    // scheduler poll interval

type StepFn = (dest: AudioNode, when: number, step: number, bar: number, phrase: number) => void;

function buildLoop(
  bpm: number,
  stepFn: StepFn,
  dest: AudioNode,
  fullGain: number,
): TrackLoop {
  const ctx      = _ctx!;
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(dest);

  const stepSecs = 60 / bpm / 4; // 16th note
  let step       = 0;  // 0-15 within bar
  let bar        = 0;  // bar within phrase (0-3 for 4-bar phrases)
  let phrase     = 0;  // phrase counter (increments every 4 bars)
  let nextTime   = ctx.currentTime + 0.05;
  let stopped    = false;
  let timerId    = -1;

  function schedule(): void {
    if (stopped) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      stepFn(gainNode, nextTime, step, bar, phrase);
      step++;
      if (step >= 16) {
        step = 0;
        bar++;
        if (bar >= 4) { bar = 0; phrase++; }
      }
      nextTime += stepSecs;
    }
    timerId = window.setTimeout(schedule, SCHEDULE_MS) as unknown as number;
  }

  schedule();

  return {
    stop() { stopped = true; clearTimeout(timerId); },
    setGain(value: number, rampSecs: number) {
      const g = gainNode.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(g.value, 1e-5), ctx.currentTime);
      if (rampSecs <= 0) g.setValueAtTime(value, ctx.currentTime);
      else               g.setTargetAtTime(value, ctx.currentTime, rampSecs / 3);
    },
  };
}

// Slow automated lowpass: returns a filter whose cutoff drifts over time.
// Call this once per track at build time; it runs as a persistent node.
function makeSweepFilter(dest: AudioNode, baseFreq: number, sweepHz: number, sweepPeriodSec: number): BiquadFilterNode {
  const ctx = _ctx!;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 1.2;
  f.frequency.value = baseFreq;
  f.connect(dest);
  // Use an LFO oscillator modulating the filter cutoff via a GainNode shim
  // AudioParam automation: schedule a long slow ramp that cycles
  // We approximate a sine LFO via a sequence of ramps
  const now = ctx.currentTime;
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = now + (i / steps) * sweepPeriodSec * 4; // 4 cycles
    const v = baseFreq + sweepHz * Math.sin((i / steps) * Math.PI * 2 * 4);
    if (i === 0) f.frequency.setValueAtTime(Math.max(80, v), t);
    else         f.frequency.linearRampToValueAtTime(Math.max(80, v), t);
  }
  return f;
}

// ── TRACK 0: DEEP SPACE ───────────────────────────────────────────────────────
// Instruments: sine bell pad, deep sub-kick (50Hz), metallic high perc, sparse
// Key: Cm. BPM: 128. Very spacious, slow-evolving filter, bell arpeggios.
function buildTrack0(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.68;

  // Slowly sweeping reverb-like feedback delay
  const dly = ctx.createDelay(1.0); dly.delayTime.value = 0.52;
  const dlFB = ctx.createGain(); dlFB.gain.value = 0.40;
  const dlOut = ctx.createGain(); dlOut.gain.value = 0.28;
  dly.connect(dlFB); dlFB.connect(dly); dly.connect(dlOut); dlOut.connect(dest);

  // Slow LP sweep on the whole mix bus (80Hz → 1200Hz over 32 bars)
  const sweep = makeSweepFilter(dest, 400, 380, 16);

  // Bell/sine pad: short attack, long decay, pure sine with slight octave
  function bell(when: number, freq: number, gain: number, dur: number): void {
    burst(sweep, when, 'sine', freq,     0.003, dur,       gain);
    burst(sweep, when, 'sine', freq * 2, 0.003, dur * 0.6, gain * 0.30);
    // Send to delay for space
    burst(dlOut, when, 'sine', freq,     0.003, dur,       gain * 0.35);
  }

  // Metallic 'shimmer' perc: very short sine with high freq
  function shimmer(when: number, freq: number): void {
    burst(sweep, when, 'sine', freq, 0.001, 0.08, 0.12);
  }

  // Cm pentatonic bell notes
  const CM = [hz('C4'),hz('Eb4'),hz('G4'),hz('Bb4'),hz('C5'),hz('Eb5'),hz('G5')];
  // 4-bar bass note sequence (root of each chord)
  const BASS_SEQ = [hz('C2'),hz('Ab1'),hz('Bb1'),hz('G1')];
  // Arp melody sequences per phrase (cycling)
  const ARP_SEQS = [
    [0,2,4,2,1,3,5,3], // phrase 0
    [4,2,0,2,6,4,2,4], // phrase 1
    [6,5,4,3,2,1,0,1], // phrase 2
    [2,4,6,5,3,4,2,0], // phrase 3
  ];

  return buildLoop(128, (g, when, step, bar, phrase) => {
    const ph4 = phrase % 4;
    const barsTotal = phrase * 4 + bar;

    // Kick: on 1 and 3 of every bar (steps 0 and 8)
    if (step === 0 || step === 8) {
      kick(g, when, 50, 0.85);
      sidechainDuck(g as GainNode, when, FG);
    }
    // Snare: step 4 and 12, but only after phrase 1
    if ((step === 4 || step === 12) && phrase >= 1) snare(g, when, 0.50);
    // Hat: every even step from phrase 2 onward
    if (step % 2 === 0 && phrase >= 2) hat(g, when, 0.14);
    // Open hat on step 6 and 14 from phrase 3 onward
    if ((step === 6 || step === 14) && phrase >= 3) hat(g, when, 0.18, true);

    // Bass pad: held low sine on step 0 of each bar (2-bar duration feel)
    if (step === 0) {
      const bNote = BASS_SEQ[bar % BASS_SEQ.length];
      burst(g, when, 'sine', bNote, 0.04, 1.8, 0.55);
      burst(g, when, 'sine', bNote * 0.5, 0.04, 1.8, 0.28); // sub
    }

    // Bell arp: every 2 steps, uses phrase-specific melody
    if (step % 2 === 0) {
      const arpSeq = ARP_SEQS[ph4];
      const noteIdx = arpSeq[(step / 2) % arpSeq.length];
      const freq = CM[noteIdx % CM.length];
      const arpGain = 0.18 + (barsTotal % 8 > 3 ? 0.06 : 0); // louder in second half of 8-bar
      bell(when, freq, arpGain, 0.38);
    }

    // Shimmer on steps 3, 7, 11 from phrase 2 onward
    if ((step === 3 || step === 7 || step === 11) && phrase >= 2) {
      shimmer(when, 2200 + (step * 180));
    }
  }, dest, FG);
}

// ── TRACK 1: CRIMSON NEBULA ───────────────────────────────────────────────────
// Instruments: distorted square lead, gritty noise clap, pulsing square bass
// Key: Am. BPM: 138. Aggressive, relentless, distorted hypnosis.
function buildTrack1(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.72;

  // Waveshaper distortion for the lead
  const ws = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = Math.tanh(x * 4); }
  ws.curve = curve; ws.connect(dest);

  // Short feedback delay for echo on lead stabs
  const dly = ctx.createDelay(0.5); dly.delayTime.value = 0.218; // 1 bar at 138bpm * 0.5
  const dlFB = ctx.createGain(); dlFB.gain.value = 0.32;
  const dlOut = ctx.createGain(); dlOut.gain.value = 0.20;
  dly.connect(dlFB); dlFB.connect(dly); dly.connect(dlOut); dlOut.connect(dest);

  // Square lead stab: two detuned squares → distortion
  function sqLead(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(ws); g.connect(dlOut);
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.setValueAtTime(freq, when);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(freq * 1.008, when);
    const g2 = ctx.createGain(); g2.gain.value = 0.7; g2.connect(g);
    o1.connect(g); o2.connect(g2); o1.start(when); o2.start(when); o1.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  // Pulsing square bass with filter
  function sqBass(when: number, freq: number, dur: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.58, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.85);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
    lp.connect(g); g.connect(dest);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, when);
    o.connect(lp); o.start(when); o.stop(when + dur + 0.03);
    // Sub
    burst(dest, when, 'sine', freq * 0.5, 0.004, dur * 0.8, 0.40);
  }

  const AM_CHORDS: number[][] = [
    [hz('A3'),hz('C4'),hz('E4')],
    [hz('F3'),hz('A3'),hz('C4')],
    [hz('G3'),hz('B3'),hz('D4')],
    [hz('E3'),hz('G3'),hz('B3')],
  ];
  const AM_ARP = [hz('A4'),hz('C5'),hz('E5'),hz('A5'),hz('G5'),hz('E5'),hz('C5'),hz('A4')];
  const BASS_ROOTS = [hz('A1'),hz('F1'),hz('G1'),hz('E1')];
  const stepSecs = 60 / 138 / 4;

  return buildLoop(138, (g, when, step, bar, phrase) => {
    // Kick: 4-on-floor always
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      kick(g, when, 56, 0.88); sidechainDuck(g as GainNode, when, FG);
    }
    // Gritty clap on 2&4
    if (step === 4 || step === 12) clap(g, when, 0.62);
    // 16th hats from phrase 1
    if (phrase >= 1) hat(g, when, 0.16 + (step % 4 === 2 ? 0.06 : 0));

    // Bass: on step 0 of each bar, and a syncopated hit on step 10
    if (step === 0) sqBass(when, BASS_ROOTS[bar % 4], stepSecs * 3.5);
    if (step === 10 && phrase >= 1) sqBass(when, BASS_ROOTS[bar % 4] * 1.5, stepSecs * 1.5);

    // Lead chord stab: every 4 steps (quarter note), varies with phrase
    if (step % 4 === 0) {
      const chord = AM_CHORDS[(bar + phrase) % AM_CHORDS.length];
      const dur = phrase >= 2 ? stepSecs * 3.5 : stepSecs * 1.8; // longer in later phrases
      for (const f of chord) sqLead(when, f, dur, 0.20);
    }

    // Arp melody: every 2 steps from phrase 1
    if (step % 2 === 0 && phrase >= 1) {
      const f = AM_ARP[(step / 2 + bar * 4 + phrase) % AM_ARP.length];
      burst(dest, when, 'square', f, 0.003, stepSecs * 1.6, 0.12);
    }
  }, dest, FG);
}

// ── TRACK 2: TOXIC CLOUD ─────────────────────────────────────────────────────
// Instruments: ring-mod wobble bass, filtered pink noise clap, eerie sine pad
// Key: Fm. BPM: 132. Sinister, wobbly, slowly mutating.
function buildTrack2(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.70;

  // Ring modulator for wobble bass: carrier × modulator
  function ringBass(when: number, carrierHz: number, modHz: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    // Slowly sweep the filter over the note duration
    lp.frequency.setValueAtTime(200, when);
    lp.frequency.exponentialRampToValueAtTime(1800, when + dur * 0.4);
    lp.frequency.exponentialRampToValueAtTime(300, when + dur * 0.85);
    lp.connect(g); g.connect(dest);
    const carrier = ctx.createOscillator(); carrier.type = 'sawtooth'; carrier.frequency.setValueAtTime(carrierHz, when);
    const modGain = ctx.createGain(); modGain.gain.setValueAtTime(carrierHz * 0.8, when); // ring mod depth
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(modHz, when);
    // Modulate carrier frequency with modulator (FM-style ring)
    mod.connect(modGain); modGain.connect(carrier.frequency);
    carrier.connect(lp); carrier.start(when); mod.start(when);
    carrier.stop(when + dur + 0.05); mod.stop(when + dur + 0.05);
    // Sub sine
    burst(dest, when, 'sine', carrierHz * 0.5, 0.01, dur * 0.8, gain * 0.35);
  }

  // Eerie sine pad: very slow attack, long sustain
  function eerePad(when: number, freqs: number[], dur: number, gain: number): void {
    for (const f of freqs) {
      burst(dest, when, 'sine', f, 0.18, dur - 0.18, gain);
      burst(dest, when, 'sine', f * 2.007, 0.18, dur - 0.18, gain * 0.22); // slightly detuned octave
    }
  }

  const FM_BASS_ROOTS = [hz('F1'),hz('Db1'),hz('Ab1'),hz('Eb1')];
  const MOD_RATIOS   = [1.5, 2.0, 0.75, 3.0]; // modulator ratio per bar
  const FM_CHORDS: number[][] = [
    [hz('F3'),hz('Ab3'),hz('C4'),hz('Eb4')],
    [hz('Db3'),hz('F3'),hz('Ab3'),hz('C4')],
    [hz('Ab3'),hz('C4'),hz('Eb4'),hz('Ab4')],
    [hz('Eb3'),hz('G3'),hz('Bb3'),hz('Db4')],
  ];
  const stepSecs = 60 / 132 / 4;

  return buildLoop(132, (g, when, step, bar, phrase) => {
    // Kick: 4-on-floor but slightly softer — this track is more atmospheric
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      kick(g, when, 52, 0.75); sidechainDuck(g as GainNode, when, FG);
    }
    // Pink noise clap (not white) — softer, more organic
    if (step === 4 || step === 12) noiseBurst(g, getPink(), when, 'bandpass', 1600, 1.4, 0.18, 0.55);
    // Sparse hat: only on 8ths in later phrases
    if (step % 2 === 0 && phrase >= 2) hat(g, when, 0.12);
    // Extra open hat on step 14 from phrase 3
    if (step === 14 && phrase >= 3) hat(g, when, 0.16, true);

    // Ring-mod bass: on each bar's beat 1, and syncopated on beat 3+
    if (step === 0) {
      const root = FM_BASS_ROOTS[bar % 4];
      const modRatio = MOD_RATIOS[bar % 4];
      ringBass(when, root, root * modRatio, stepSecs * 3.8, 0.60);
    }
    if (step === 10 && phrase >= 1) {
      const root = FM_BASS_ROOTS[(bar + 1) % 4];
      ringBass(when, root * 1.5, root * 2.0, stepSecs * 1.6, 0.42);
    }

    // Eerie pad chord: every 4 bars (held long)
    if (step === 0 && bar === 0) {
      const chord = FM_CHORDS[phrase % FM_CHORDS.length];
      eerePad(when, chord, stepSecs * 64, 0.10); // 4-bar sustain
    }

    // Acid arp: every 3 steps (polyrhythmic against the 4/4)
    if (step % 3 === 0 && phrase >= 1) {
      const noteSet = FM_CHORDS[bar % FM_CHORDS.length];
      const f = noteSet[Math.floor(step / 3) % noteSet.length];
      burst(g, when, 'sawtooth', f * 2, 0.004, stepSecs * 2.2, 0.13);
    }
  }, dest, FG);
}

// ── TRACK 3: ICE FIELD ────────────────────────────────────────────────────────
// Instruments: triangle-wave chimes (pitched perc), crystal sine pad, icy hat melody
// Key: Am (relative major feel). BPM: 124. Delicate, shimmering, uplifting.
function buildTrack3(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.68;

  // Long reverb-like delay for shimmer
  const dly = ctx.createDelay(1.2); dly.delayTime.value = 0.68;
  const dlFB = ctx.createGain(); dlFB.gain.value = 0.44;
  const dlOut = ctx.createGain(); dlOut.gain.value = 0.24;
  dly.connect(dlFB); dlFB.connect(dly); dly.connect(dlOut); dlOut.connect(dest);

  // Triangle chime: pure triangle, fast attack, medium decay
  function chime(when: number, freq: number, gain: number, dur: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(dest); g.connect(dlOut);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    o.connect(g); o.start(when); o.stop(when + dur + 0.05);
    // Harmonic shimmer
    const g2 = ctx.createGain(); g2.gain.value = 0.18; g2.connect(dlOut);
    const o2 = ctx.createOscillator(); o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 3.01, when);
    o2.connect(g2); o2.start(when); o2.stop(when + dur * 0.5 + 0.05);
  }

  // Crystal pad: slow attack triangle sustain
  function crystalPad(when: number, freqs: number[], dur: number, gain: number): void {
    for (const f of freqs) {
      burst(dest, when, 'triangle', f,     0.25, dur - 0.25, gain);
      burst(dest, when, 'triangle', f * 2, 0.35, dur - 0.35, gain * 0.15);
    }
  }

  // Pitched hat: very short triangle bursts (ice crystals)
  function icyHat(when: number, freq: number): void {
    burst(dest, when, 'triangle', freq, 0.001, 0.035, 0.10);
    noiseBurst(dest, getWhite(), when, 'highpass', 8000, 0.3, 0.018, 0.08);
  }

  const AM_NOTES  = [hz('A4'),hz('C5'),hz('E5'),hz('G5'),hz('A5'),hz('B5'),hz('D5'),hz('F5')];
  const CHORDS: number[][] = [
    [hz('A3'),hz('C4'),hz('E4'),hz('G4')],
    [hz('F3'),hz('A3'),hz('C4'),hz('E4')],
    [hz('C3'),hz('E3'),hz('G3'),hz('B3')],
    [hz('G3'),hz('B3'),hz('D4'),hz('F4')],
  ];
  const ICY_HAT_FREQS = [1760, 2093, 2637, 1975, 2349, 1760, 2093, 2637];
  const stepSecs = 60 / 124 / 4;

  return buildLoop(124, (g, when, step, bar, phrase) => {
    // Kick: very soft, half-time feel (only on 1 and 3 of every other bar)
    if (step === 0 && bar % 2 === 0) { kick(g, when, 54, 0.60); sidechainDuck(g as GainNode, when, FG); }
    if (step === 8) { kick(g, when, 54, 0.40); sidechainDuck(g as GainNode, when, FG * 0.7); }
    // Snare: step 4 and 12 but just a soft triangle hit
    if (step === 4 || step === 12) burst(g, when, 'triangle', 220, 0.001, 0.06, 0.22);

    // Icy hats: every 2 steps, pitched sequence
    if (step % 2 === 0) icyHat(when, ICY_HAT_FREQS[step / 2]);

    // Chime melody: every 2 steps, Am pentatonic ascending per phrase
    if (step % 2 === 0) {
      const noteIdx = (step / 2 + bar * 8 + phrase * 3) % AM_NOTES.length;
      const dur = stepSecs * (1.8 + (phrase % 2) * 0.8);
      chime(when, AM_NOTES[noteIdx], 0.20 + (phrase > 1 ? 0.06 : 0), dur);
    }

    // Crystal pad chord: every 4 bars, long sustain
    if (step === 0 && bar === 0) {
      const ch = CHORDS[phrase % CHORDS.length];
      crystalPad(when, ch, stepSecs * 64, 0.09);
    }
  }, dest, FG);
}

// ── TRACK 4: VOLCANIC BELT ───────────────────────────────────────────────────
// Instruments: detuned unison sawtooth bass, distorted low kick, driven lead
// Key: Em. BPM: 140. Heavy, grinding, relentless momentum.
function buildTrack4(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.74;

  // Waveshaper for the driven bass
  const wsB = ctx.createWaveShaper();
  const crvB = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const x = (i*2)/512-1; crvB[i] = Math.tanh(x * 2.5); }
  wsB.curve = crvB; wsB.connect(dest);

  // Heavy detuned unison saw bass
  function unisonBass(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, when);
    lp.frequency.linearRampToValueAtTime(1200, when + dur * 0.3);
    lp.frequency.exponentialRampToValueAtTime(600, when + dur * 0.8);
    lp.connect(g); g.connect(wsB);
    const detunes = [0, -8, +8, -16]; // cents
    for (const d of detunes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * Math.pow(2, d/1200), when);
      o.connect(lp); o.start(when); o.stop(when + dur + 0.05);
    }
    burst(dest, when, 'sine', freq * 0.5, 0.005, dur * 0.8, gain * 0.45);
  }

  // Power chord lead: two saws a perfect 5th apart
  function powerChord(when: number, rootHz: number, dur: number, gain: number): void {
    for (const f of [rootHz, rootHz * 1.5, rootHz * 2]) {
      burst(dest, when, 'sawtooth', f, 0.008, dur, gain * (f === rootHz * 1.5 ? 0.7 : 0.5));
    }
  }

  const EM_BASS = [hz('E1'),hz('D1'),hz('G1'),hz('C1'),hz('A1'),hz('B1')];
  const EM_LEAD = [hz('E3'),hz('G3'),hz('D3'),hz('C3')];
  const EM_ARP  = [hz('E4'),hz('G4'),hz('B4'),hz('D5'),hz('E5'),hz('D5'),hz('B4'),hz('G4')];
  const stepSecs = 60 / 140 / 4;

  return buildLoop(140, (g, when, step, bar, phrase) => {
    // Heavy kick: 4-on-floor but with extra on step 2 from phrase 2
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      kick(g, when, 48, 0.95); sidechainDuck(g as GainNode, when, FG);
    }
    if (step === 2 && phrase >= 2) kick(g, when, 48, 0.50);
    // Snare: 2&4 from phrase 1
    if ((step === 4 || step === 12) && phrase >= 1) snare(g, when, 0.70);
    // Hat: 8ths from phrase 1, 16ths from phrase 3
    const hatStep = phrase >= 3 ? 1 : 2;
    if (step % hatStep === 0 && phrase >= 1) hat(g, when, 0.15);

    // Unison bass on step 0, and a push on step 9
    if (step === 0) unisonBass(when, EM_BASS[bar % EM_BASS.length], stepSecs * 3.6, 0.65);
    if (step === 9 && phrase >= 1) unisonBass(when, EM_BASS[(bar+1) % EM_BASS.length], stepSecs * 1.4, 0.45);

    // Power chord lead: every 4 steps
    if (step % 4 === 0) {
      powerChord(when, EM_LEAD[bar % EM_LEAD.length], stepSecs * 3.8, 0.18);
    }

    // Driving arp from phrase 1: every 2 steps
    if (step % 2 === 0 && phrase >= 1) {
      const f = EM_ARP[(step / 2 + bar * 2) % EM_ARP.length];
      burst(dest, when, 'sawtooth', f, 0.003, stepSecs * 1.5, 0.14);
    }
  }, dest, FG);
}

// ── TRACK 5: NEON GRID ──────────────────────────────────────────────────────────
// Instruments: PWM-style pulse wave, digital blips, glitchy percussion
// Key: Gm. BPM: 142. Precise, digital, hypnotic grid.
function buildTrack5(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.72;

  // Comb-filter for digital metallic color
  const comb = ctx.createDelay(0.05); comb.delayTime.value = 1/440;
  const combFB = ctx.createGain(); combFB.gain.value = 0.85;
  const combOut = ctx.createGain(); combOut.gain.value = 0.30;
  comb.connect(combFB); combFB.connect(comb); comb.connect(combOut); combOut.connect(dest);

  // PWM-style lead: square with narrowing pulse feel via detuned square sum
  function pwmLead(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, when);
    lp.frequency.linearRampToValueAtTime(3200, when + dur * 0.2);
    lp.frequency.exponentialRampToValueAtTime(1200, when + dur * 0.8);
    lp.Q.value = 3; lp.connect(g); g.connect(dest); g.connect(combOut);
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.setValueAtTime(freq, when);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(freq * 1.006, when);
    const g2 = ctx.createGain(); g2.gain.value = -0.8; // phase cancel = narrow pulse
    o2.connect(g2); g2.connect(lp); o1.connect(lp);
    o1.start(when); o2.start(when); o1.stop(when+dur+0.05); o2.stop(when+dur+0.05);
  }

  // Digital blip: very short square burst (bit-crusher feel)
  function blip(when: number, freq: number, gain: number): void {
    burst(comb, when, 'square', freq, 0.001, 0.022, gain);
  }

  const GM_BASS  = [hz('G1'),hz('Eb1'),hz('Bb1'),hz('F1')];
  const GM_LEAD  = [hz('G3'),hz('Eb3'),hz('Bb3'),hz('F3')];
  const GM_ARP   = [hz('G4'),hz('Bb4'),hz('D5'),hz('F5'),hz('G5'),hz('F5'),hz('D5'),hz('Bb4')];
  const BLIP_FREQS = [880,1047,1175,988,1319,1175,987,1047];
  const stepSecs = 60/142/4;

  return buildLoop(142, (g, when, step, bar, phrase) => {
    if (step===0||step===4||step===8||step===12) { kick(g,when,55,0.85); sidechainDuck(g as GainNode,when,FG); }
    if (step===4||step===12) snare(g,when,0.60);
    // 16th hats always — this track is precise
    hat(g, when, 0.13 + (step % 4 === 2 ? 0.05 : 0));

    // Bass: short tight pulses
    if (step % 4 === 0) {
      const f = GM_BASS[bar % GM_BASS.length];
      burst(dest, when, 'square', f, 0.003, stepSecs*1.5, 0.50);
      burst(dest, when, 'sine',   f*0.5, 0.003, stepSecs*1.5, 0.35);
    }

    // PWM lead: every 4 steps
    if (step % 4 === 0) pwmLead(when, GM_LEAD[bar%GM_LEAD.length], stepSecs*3.5, 0.22);

    // Blip arp: every 2 steps
    if (step % 2 === 0) blip(when, BLIP_FREQS[step/2], 0.18);

    // Extra melodic arp from phrase 1
    if (step % 2 === 0 && phrase >= 1) {
      const f = GM_ARP[(step/2 + bar*4 + phrase) % GM_ARP.length];
      pwmLead(when, f, stepSecs*1.6, 0.15);
    }

    // Glitchy extra blip burst on off-beats from phrase 2
    if ((step===3||step===7||step===11) && phrase >= 2) {
      blip(when, BLIP_FREQS[(step+3) % BLIP_FREQS.length] * 2, 0.14);
    }
  }, dest, FG);
}

// ── TRACK 6: GRAVITY RUINS ────────────────────────────────────────────────────
// Instruments: slow-attack triangle pad, phaser-sweep filter, muted percussive bass
// Key: Bbm. BPM: 126. Hypnotic, floating, gravitational pull.
function buildTrack6(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.68;

  // Phaser-style all-pass chain for the pad (2 all-pass filters)
  const ap1 = ctx.createBiquadFilter(); ap1.type = 'allpass'; ap1.Q.value = 10;
  const ap2 = ctx.createBiquadFilter(); ap2.type = 'allpass'; ap2.Q.value = 10;
  // Slowly sweep allpass frequency for phaser effect
  const sweepNow = ctx.currentTime;
  for (let i = 0; i <= 64; i++) {
    const t = sweepNow + i * 2; // 2 seconds per step
    const v = 200 + 800 * Math.abs(Math.sin(i * 0.18));
    if (i === 0) { ap1.frequency.setValueAtTime(v, t); ap2.frequency.setValueAtTime(v*1.3, t); }
    else { ap1.frequency.linearRampToValueAtTime(v, t); ap2.frequency.linearRampToValueAtTime(v*1.3, t); }
  }
  ap1.connect(ap2); ap2.connect(dest);

  // Slow triangle pad: very long attack and release
  function gravPad(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.6);
    g.gain.setValueAtTime(gain, when + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(ap1);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    o.connect(g); o.start(when); o.stop(when + dur + 0.1);
    burst(ap1, when, 'sine', freq * 1.998, 0.5, dur - 0.5, gain * 0.20);
  }

  // Muted bass: triangle with very short gate
  function muteBass(when: number, freq: number, stepSecs: number): void {
    burst(dest, when, 'triangle', freq,     0.003, stepSecs * 0.55, 0.55);
    burst(dest, when, 'sine',    freq * 0.5, 0.003, stepSecs * 0.55, 0.30);
  }

  const BBM_CHORDS: number[][] = [
    [hz('Bb3'),hz('Db4'),hz('F4'),hz('Ab4')],
    [hz('Gb3'),hz('Bb3'),hz('Db4'),hz('F4')],
    [hz('Db3'),hz('F3'),hz('Ab3'),hz('C4')],
    [hz('Ab3'),hz('C4'),hz('Eb4'),hz('Gb4')],
  ];
  const BBM_BASS = [hz('Bb1'),hz('Gb1'),hz('Db1'),hz('Ab1')];
  const BBM_ARP  = [hz('Bb4'),hz('Db5'),hz('F5'),hz('Ab5'),hz('Gb5'),hz('Eb5'),hz('Db5'),hz('Bb4')];
  const stepSecs = 60/126/4;

  return buildLoop(126, (g, when, step, bar, phrase) => {
    // Kick: half-time feel — only on 1 and occasionally 3
    if (step === 0) { kick(g, when, 51, 0.78); sidechainDuck(g as GainNode, when, FG); }
    if (step === 8 && bar % 2 === 1) { kick(g, when, 51, 0.55); sidechainDuck(g as GainNode, when, FG * 0.8); }
    // Soft clap on 2&4
    if (step === 4 || step === 12) clap(g, when, 0.44);
    // Sparse hat: upbeats only from phrase 2
    if ((step===2||step===6||step===10||step===14) && phrase>=2) hat(g, when, 0.11);

    // Muted bass: steady quarter notes
    if (step % 4 === 0) muteBass(when, BBM_BASS[bar % BBM_BASS.length], stepSecs);

    // Floating gravity pad chord: every 4 bars
    if (step === 0 && bar === 0) {
      const ch = BBM_CHORDS[phrase % BBM_CHORDS.length];
      for (const f of ch) gravPad(when, f, stepSecs * 62, 0.11);
    }

    // Arp melody: every 2 steps from phrase 1
    if (step % 2 === 0 && phrase >= 1) {
      const f = BBM_ARP[(step/2 + bar*3) % BBM_ARP.length];
      burst(ap1, when, 'sine', f, 0.02, stepSecs * 2.8, 0.12);
    }
  }, dest, FG);
}

// ── TRACK 7: SAND STORM ─────────────────────────────────────────────────────────
// Instruments: pitched pink-noise 'tabla' perc, triangle pluck melody, dusty pad
// Key: Dm (dorian). BPM: 134. Tribal, hypnotic, desert heat.
function buildTrack7(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.70;

  // Pink-noise tabla hit: tuned bandpass burst, two sizes
  function tabla(when: number, freq: number, gain: number, dur: number): void {
    noiseBurst(dest, getPink(), when, 'bandpass', freq, 8, dur, gain);
    burst(dest, when, 'sine', freq * 0.8, 0.001, dur * 0.5, gain * 0.45);
  }

  // Triangle pluck: instant attack, exponential decay (sitar-ish)
  function pluck(when: number, freq: number, gain: number, dur: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 5, when);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.5, when + dur * 0.6);
    lp.Q.value = 1.5; lp.connect(g); g.connect(dest);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq, when);
    o.connect(lp); o.start(when); o.stop(when + dur + 0.04);
    // Harmonic shimmer at 5th
    burst(dest, when, 'sine', freq * 1.5, 0.001, dur * 0.4, gain * 0.18);
  }

  // Dusty sine pad: very low pass, like heat haze
  function dustPad(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.4);
    g.gain.setValueAtTime(gain, when + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.5;
    lp.connect(g); g.connect(dest);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, when); o.connect(lp); o.start(when); o.stop(when + dur + 0.1);
  }

  const DM_PLUCK = [hz('D4'),hz('F4'),hz('A4'),hz('C5'),hz('D5'),hz('E4'),hz('G4'),hz('Bb4')];
  const DM_BASS  = [hz('D1'),hz('Bb1'),hz('F1'),hz('C1')];
  const DM_CHORDS: number[][] = [
    [hz('D3'),hz('F3'),hz('A3'),hz('C4')],
    [hz('Bb2'),hz('D3'),hz('F3'),hz('A3')],
    [hz('F3'),hz('A3'),hz('C4'),hz('E4')],
    [hz('C3'),hz('E3'),hz('G3'),hz('Bb3')],
  ];
  const TABLA_FREQS = [180, 260, 220, 320, 180, 280, 200, 240];
  const stepSecs = 60/134/4;

  return buildLoop(134, (g, when, step, bar, phrase) => {
    // Kick (tabla-ish low thud) on 1 and 3
    if (step === 0 || step === 8) {
      kick(g, when, 53, 0.80); sidechainDuck(g as GainNode, when, FG);
    }
    // Tabla hits: syncopated pattern
    const tablaPattern = [0,0,1,0, 1,1,0,1, 0,1,0,0, 1,0,1,0]; // 1=tabla
    if (tablaPattern[step] && !(step===0||step===8)) {
      tabla(when, TABLA_FREQS[step % TABLA_FREQS.length], 0.45, 0.06);
    }
    // High tabla accent (different tuning)
    if ((step===5||step===13) && phrase >= 1) tabla(when, 420, 0.35, 0.04);

    // Bass pluck: on each quarter note, Dm dorian walking line
    if (step % 4 === 0) {
      pluck(when, DM_BASS[bar % DM_BASS.length], 0.58, stepSecs * 1.6);
      burst(dest, when, 'sine', DM_BASS[bar%DM_BASS.length]*0.5, 0.005, stepSecs*1.6, 0.30);
    }

    // Pluck melody: every 2 steps
    if (step % 2 === 0) {
      const noteIdx = (step/2 + bar*5 + phrase*3) % DM_PLUCK.length;
      const dur = stepSecs * (1.4 + (phrase % 2) * 0.6);
      pluck(when, DM_PLUCK[noteIdx], 0.22, dur);
    }

    // Dusty pad chord: every 4 bars
    if (step === 0 && bar === 0) {
      const ch = DM_CHORDS[phrase % DM_CHORDS.length];
      for (const f of ch) dustPad(when, f, stepSecs * 60, 0.08);
    }
  }, dest, FG);
}

// ── TRACK 8: FROZEN CORE ───────────────────────────────────────────────────────
// Instruments: organ pulse-wave (duty ~50%), slowly evolving HP filter, deep sub
// Key: Fm. BPM: 130. Majestic, dark, icy organ hypnosis.
function buildTrack8(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.68;

  // Slowly rising highpass for the organ (ice melting effect over 8 phrases)
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.5;
  const hpNow = ctx.currentTime;
  hp.frequency.setValueAtTime(800, hpNow);
  hp.frequency.linearRampToValueAtTime(80, hpNow + 60 * 8); // descend over 8 phrases (looping track is long)
  hp.connect(dest);

  // Organ: square + sub-square (imitate drawbar organ tone)
  function organ(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.setValueAtTime(gain * 0.85, when + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(hp);
    // 8' square
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.setValueAtTime(freq, when);
    // 4' square (octave up, quieter)
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(freq*2, when);
    // 16' square (sub)
    const g3 = ctx.createGain(); g3.gain.value = 0.30;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.setValueAtTime(freq*0.5, when);
    o1.connect(g); g2.connect(g); g3.connect(g);
    o2.connect(g2); o3.connect(g3);
    [o1,o2,o3].forEach(o => { o.start(when); o.stop(when+dur+0.06); });
    // Deep sub
    burst(dest, when, 'sine', freq * 0.25, 0.02, dur * 0.9, gain * 0.28);
  }

  const FM_CHORDS: number[][] = [
    [hz('F3'),hz('Ab3'),hz('C4'),hz('Eb4')],
    [hz('Db3'),hz('F3'),hz('Ab3'),hz('C4')],
    [hz('Ab3'),hz('C4'),hz('Eb4'),hz('Ab4')],
    [hz('Eb3'),hz('G3'),hz('Bb3'),hz('Db4')],
  ];
  const FM_MELODY = [hz('F4'),hz('Ab4'),hz('C5'),hz('Eb5'),hz('Db5'),hz('Ab4'),hz('Bb4'),hz('F4')];
  const FM_BASS   = [hz('F1'),hz('Db1'),hz('Ab1'),hz('Eb1')];
  const stepSecs  = 60/130/4;

  return buildLoop(130, (g, when, step, bar, phrase) => {
    // Sparse kick: half-time, only on beat 1
    if (step === 0) { kick(g, when, 50, 0.72); sidechainDuck(g as GainNode, when, FG); }
    if (step === 8 && phrase >= 2) { kick(g, when, 50, 0.48); sidechainDuck(g as GainNode, when, FG * 0.7); }
    // Soft clap on 2&4 from phrase 1
    if ((step===4||step===12) && phrase >= 1) clap(g, when, 0.38);
    // Sparse hat upbeats from phrase 2
    if ((step===2||step===6||step===10||step===14) && phrase >= 2) hat(g, when, 0.10);

    // Deep organ bass: on every beat
    if (step % 4 === 0) organ(when, FM_BASS[bar % FM_BASS.length], stepSecs * 3.5, 0.48);

    // Organ chord: every 4 bars, held the full 4 bars
    if (step === 0 && bar === 0) {
      const ch = FM_CHORDS[phrase % FM_CHORDS.length];
      for (const f of ch) organ(when, f, stepSecs * 63, 0.12);
    }

    // Organ melody: every 2 steps from phrase 1
    if (step % 2 === 0 && phrase >= 1) {
      const f = FM_MELODY[(step/2 + bar*2 + phrase) % FM_MELODY.length];
      organ(when, f, stepSecs * 1.8, 0.16);
    }
  }, dest, FG);
}

// ── TRACK 9: VOID RIFT ──────────────────────────────────────────────────────────
// Instruments: massively detuned twin-saw, overdriven kick, chaotic noise perc
// Key: Bm (tritone tension). BPM: 148. Relentless, void-energy chaos.
function buildTrack9(dest: AudioNode): TrackLoop {
  const ctx = _ctx!;
  const FG = 0.76;

  // Heavy waveshaper (extreme drive)
  const wsH = ctx.createWaveShaper();
  const crvH = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const x=(i*2)/512-1; crvH[i]=Math.tanh(x*8)*0.9; }
  wsH.curve = crvH;
  const wsGain = ctx.createGain(); wsGain.gain.value = 0.38; wsGain.connect(dest);
  wsH.connect(wsGain);

  // Detuned chaos saw: 5 oscillators with wide spread
  function chaosSaw(when: number, freq: number, dur: number, gain: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(600, when);
    lp.frequency.linearRampToValueAtTime(4000, when + dur * 0.15);
    lp.frequency.exponentialRampToValueAtTime(800, when + dur * 0.75);
    lp.connect(g); g.connect(wsH);
    const detunes = [-24, -12, 0, 12, 24]; // cents — very wide
    for (const d of detunes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * Math.pow(2, d/1200), when);
      o.connect(lp); o.start(when); o.stop(when + dur + 0.05);
    }
    burst(dest, when, 'sine', freq * 0.5, 0.004, dur * 0.8, gain * 0.55);
  }

  // Chaos noise perc: sharp filtered noise burst
  function chaosPerc(when: number): void {
    noiseBurst(dest, getWhite(), when, 'bandpass', 3200 + Math.random()*800, 4, 0.04, 0.55);
  }

  const BM_BASS   = [hz('B1'),hz('F1'),hz('D1'),hz('A1'),hz('G1'),hz('E1')];
  const BM_CHORDS: number[][] = [
    [hz('B3'),hz('D4'),hz('F4'),hz('A4')],
    [hz('G3'),hz('B3'),hz('D4'),hz('F4')],
    [hz('F3'),hz('A3'),hz('C4'),hz('E4')],
    [hz('A3'),hz('C4'),hz('E4'),hz('G4')],
  ];
  const BM_ARP = [hz('B4'),hz('D5'),hz('F5'),hz('A5'),hz('B5'),hz('A5'),hz('F5'),hz('D5')];
  const stepSecs = 60/148/4;

  return buildLoop(148, (g, when, step, bar, phrase) => {
    // Aggressive 4-on-floor
    if (step===0||step===4||step===8||step===12) { kick(g,when,60,0.95); sidechainDuck(g as GainNode,when,FG); }
    // Extra kick on step 2 and 10 from phrase 2 (relentless)
    if ((step===2||step===10) && phrase >= 2) kick(g, when, 60, 0.55);
    // Snare: 2&4, plus ghost on 3-e from phrase 2
    if (step===4||step===12) snare(g, when, 0.72);
    if ((step===3||step===11) && phrase >= 2) snare(g, when, 0.28);
    // Full 16th hats always
    hat(g, when, 0.16 + (step%4===2 ? 0.07:0));
    // Chaos noise perc on offbeats from phrase 1
    if ((step===2||step===6||step===10||step===14) && phrase >= 1) chaosPerc(when);

    // Chaos bass: driving 8ths
    if (step % 2 === 0) {
      const f = BM_BASS[(Math.floor(step/2) + bar) % BM_BASS.length];
      chaosSaw(when, f, stepSecs * 1.7, 0.60);
    }

    // Lead chord every 4 steps
    if (step % 4 === 0) {
      const ch = BM_CHORDS[bar % BM_CHORDS.length];
      for (const f of ch) chaosSaw(when, f, stepSecs * 3.5, 0.16);
    }

    // Fast arp always
    const f = BM_ARP[(step/2 + bar*5 + phrase) % BM_ARP.length];
    if (step % 2 === 0) burst(dest, when, 'sawtooth', f, 0.003, stepSecs*1.4, 0.16);
  }, dest, FG);
}

// ── Track factory ─────────────────────────────────────────────────────────────────
const TRACK_BUILDERS = [
  buildTrack0, buildTrack1, buildTrack2, buildTrack3, buildTrack4,
  buildTrack5, buildTrack6, buildTrack7, buildTrack8, buildTrack9,
];
const TRACK_GAINS = [0.68, 0.72, 0.70, 0.68, 0.74, 0.72, 0.68, 0.70, 0.68, 0.76];

// ── Public API ────────────────────────────────────────────────────────────────
export function beginMusic(): void {
  if (_playing || !_ctx || !_masterGain) return;
  _playing = true;
  const i = _curIdx < 0 ? 0 : _curIdx;
  _curIdx  = i;
  _curLoop = TRACK_BUILDERS[i % TRACK_BUILDERS.length](_masterGain);
  _curLoop.setGain(TRACK_GAINS[i % TRACK_GAINS.length], 1.8);
}

export function playThemeTrack(idx: number): void {
  if (!_ctx || !_masterGain) { _curIdx = idx; return; }
  const i = ((idx % TRACK_BUILDERS.length) + TRACK_BUILDERS.length) % TRACK_BUILDERS.length;
  if (!_playing) { _curIdx = i; return; }
  if (i === _curIdx) return;
  const prev = _curLoop;
  _curIdx  = i;
  _curLoop = TRACK_BUILDERS[i](_masterGain);
  _curLoop.setGain(TRACK_GAINS[i], 2.0);
  if (prev) { prev.setGain(0, 1.5); setTimeout(() => prev.stop(), 2500); }
}

export function pauseMusic(): void  { _curLoop?.setGain(0, 0.4); }
export function resumeMusic(): void {
  const g = TRACK_GAINS[Math.max(0, _curIdx) % TRACK_GAINS.length];
  _curLoop?.setGain(g, 0.5);
}

export function restartMusic(startIdx?: number): void {
  if (!_ctx || !_masterGain) return;
  _curLoop?.stop(); _curLoop = null;
  _playing = false;
  _curIdx  = startIdx !== undefined ? startIdx : 0;
  beginMusic();
}

export function disposeMusic(): void {
  _curLoop?.stop(); _curLoop = null;
  _playing = false; _curIdx = -1;
}

/**
 * Duck the BGM master gain to `targetGain` over `rampSecs`.
 * SFX is unaffected — it connects to a separate gain node (see sfx.ts).
 */
export function duckMusic(targetGain: number, rampSecs: number): void {
  if (!_masterGain) return;
  const g = _masterGain.gain;
  g.cancelScheduledValues(_ctx!.currentTime);
  g.setValueAtTime(Math.max(g.value, 1e-4), _ctx!.currentTime);
  g.setTargetAtTime(targetGain, _ctx!.currentTime, Math.max(0.01, rampSecs / 3));
}

/**
 * Restore the BGM master gain to its normal level over `rampSecs`.
 */
export function unduckMusic(rampSecs: number): void {
  if (!_masterGain) return;
  const g = _masterGain.gain;
  g.cancelScheduledValues(_ctx!.currentTime);
  g.setValueAtTime(Math.max(g.value, 1e-4), _ctx!.currentTime);
  g.setTargetAtTime(0.80, _ctx!.currentTime, Math.max(0.01, rampSecs / 3));
}

/** Expose the shared AudioContext so sfx.ts can reuse it. */
export function getAudioContext(): AudioContext | null { return _ctx; }
