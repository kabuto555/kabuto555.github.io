(function() {
  "use strict";
  const GAME_WIDTH = 786;
  const GAME_HEIGHT = 1704;
  const COLORS = {
    bg: {
      primary: 2824718,
      // deep dark brown
      secondary: 4006928
    },
    broth: {
      base: 12876331,
      // amber broth
      shimmer: 15247434,
      // lighter shimmer
      bubble: 16107370,
      // bubble highlight
      dark: 9196559
      // deep broth shadow
    },
    tile: {
      ramen: 16115400,
      // dry instant ramen block (pale noodle)
      ramenEdge: 13940886,
      potWall: 5912608,
      // pot rim / border
      potHandle: 8014376,
      // handle color
      startGlow: 7271034,
      // start handle glow
      endGlow: 15913070
      // end handle glow
    },
    player: {
      body: 15251558,
      // shiba inu golden
      dark: 11565104,
      // shiba dark markings
      light: 16773328,
      // shiba cream
      nose: 3807754
    },
    ui: {
      button: 8014376,
      hint: 16107370,
      hintText: "#2b1a0e",
      border: 10117176,
      winGold: 16107370
    },
    text: {
      primary: "#fff5e0",
      secondary: "#d4a87a"
    }
  };
  const TEXT_STYLES = {
    button: { fontSize: "32px", fontFamily: "Arial", color: "#fff5e0", fontStyle: "bold" },
    hud: { fontSize: "30px", fontFamily: "Arial Black", color: COLORS.text.primary }
  };
  const LEVEL_PARAMS = [
    { gridSize: 3, ramenCount: 3, stoneCount: 0, brothCount: 0 },
    // L1 — pure ramen intro
    { gridSize: 3, ramenCount: 3, stoneCount: 2, brothCount: 1 },
    // L2 — first stone bridge
    { gridSize: 4, ramenCount: 4, stoneCount: 2, brothCount: 2 },
    // L3
    { gridSize: 4, ramenCount: 5, stoneCount: 3, brothCount: 3 },
    // L4 — stone-heavy
    { gridSize: 5, ramenCount: 6, stoneCount: 4, brothCount: 4 },
    // L5
    { gridSize: 5, ramenCount: 8, stoneCount: 5, brothCount: 5 },
    // L6 — equal mix
    { gridSize: 6, ramenCount: 8, stoneCount: 6, brothCount: 6 },
    // L7 — stone-dominant
    { gridSize: 6, ramenCount: 10, stoneCount: 7, brothCount: 7 },
    // L8
    { gridSize: 6, ramenCount: 12, stoneCount: 6, brothCount: 8 },
    // L9 — ramen-heavy again
    { gridSize: 7, ramenCount: 10, stoneCount: 8, brothCount: 9 },
    // L10 — big grid, stone maze
    { gridSize: 7, ramenCount: 14, stoneCount: 7, brothCount: 9 },
    // L11
    { gridSize: 7, ramenCount: 16, stoneCount: 8, brothCount: 9 }
    // L12+
  ];
  function createGameConfig() {
    return {
      type: Phaser.CANVAS,
      parent: "game",
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: COLORS.bg.primary,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      render: {
        preserveDrawingBuffer: true,
        antialias: true
      },
      plugins: {
        scene: [{
          key: "rexUI",
          plugin: window.rexuiplugin,
          mapping: "rexUI"
        }]
      }
    };
  }
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new AudioContext();
    return _audioCtx;
  }
  const BGM_BPM = 130;
  const BGM_BEAT = 60 / BGM_BPM;
  const BGM_8TH = BGM_BEAT / 2;
  const BGM_16TH = BGM_BEAT / 4;
  const BGM_BAR = BGM_BEAT * 4;
  const BGM_BARS = 8;
  const BGM_LOOP = BGM_BAR * BGM_BARS;
  const A2 = 110, A3 = 220, C4 = 262, D4 = 294, E4 = 330, G4 = 392;
  const A4 = 440, C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784;
  const MELODY = [
    // Bar 1:  E5 . D5 C5  D5 . E5 .   E5 . D5 C5  D5 . . .
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [D5, 2],
    [E5, 2],
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [D5, 4],
    // Bar 2:  E5 . D5 C5  D5 E5 A5(A4oct) .   G4 . A4 .  C5 . . .
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [D5, 1],
    [E5, 1],
    [A4, 2],
    [G4, 2],
    [A4, 2],
    [C5, 4],
    // Bar 3:  C5 . D5 .   E5 . D5 C5  A4 . . .   C5 D5
    [C5, 2],
    [D5, 2],
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [A4, 4],
    [C5, 2],
    [D5, 2],
    // Bar 4:  E5 . . .   D5 C5 D5 .   E5 . D5 .  C5 . . .
    [E5, 4],
    [D5, 1],
    [C5, 1],
    [D5, 2],
    [E5, 2],
    [D5, 2],
    [C5, 4],
    // Bar 5 (variation): A4 C5 D5 E5  F5 . E5 .   D5 . C5 .  D5 . E5 .
    [A4, 1],
    [C5, 1],
    [D5, 1],
    [E5, 1],
    [F5, 2],
    [E5, 2],
    [D5, 2],
    [C5, 2],
    [D5, 2],
    [E5, 2],
    // Bar 6:  A4 . G4 .  A4 . C5 .   D5 . E5 .  D5 C5 A4 .
    [A4, 2],
    [G4, 2],
    [A4, 2],
    [C5, 2],
    [D5, 2],
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [A4, 2],
    // Bar 7:  C5 D5 E5 .  G5 . F5 .   E5 . D5 .  C5 . . .
    [C5, 1],
    [D5, 1],
    [E5, 2],
    [G5, 2],
    [F5, 2],
    [E5, 2],
    [D5, 2],
    [C5, 4],
    // Bar 8 (cadence):  E5 . D5 C5  A4 . . .   A4 C5 D5 E5  A4 . . .
    [E5, 2],
    [D5, 1],
    [C5, 1],
    [A4, 4],
    [A4, 1],
    [C5, 1],
    [D5, 1],
    [E5, 1],
    [A4, 4]
  ];
  function buildMelodySchedule() {
    const out = [];
    let pos = 0;
    for (const ev of MELODY) {
      if (ev) out.push({ step: pos, freq: ev[0], dur: ev[1] });
      pos += ev ? ev[1] : 2;
    }
    return out;
  }
  const MELODY_SCHED = buildMelodySchedule();
  const THIRD_DOWN = {};
  THIRD_DOWN[E5] = C5;
  THIRD_DOWN[D5] = 247;
  THIRD_DOWN[C5] = A4;
  THIRD_DOWN[G5] = E5;
  THIRD_DOWN[F5] = D5;
  THIRD_DOWN[G4] = E4;
  const HARMONY_SCHED = MELODY_SCHED.map((n) => ({
    step: n.step,
    freq: THIRD_DOWN[n.freq] ?? n.freq * (5 / 6),
    // fallback: minor third down
    dur: n.dur
  }));
  const B_SECTION_START = 16 * 4;
  const COUNTER_SCHED = MELODY_SCHED.filter((n) => n.step >= B_SECTION_START && n.dur >= 2).map((n) => ({
    step: n.step,
    freq: n.freq * (3 / 2) > G5 ? n.freq * (3 / 4) : n.freq * (3 / 2),
    // fifth up, octave-corrected
    dur: Math.min(n.dur, 3)
  }));
  const G3 = 196, B3 = 247;
  const PAD_NOTES = [
    // Am (bars 0,1,4,5)
    ...[0, 1, 4, 5].flatMap((b) => [
      { bar: b, freq: A3 },
      { bar: b, freq: C4 },
      { bar: b, freq: E4 }
    ]),
    // G (bars 2,3,6,7)
    ...[2, 3, 6, 7].flatMap((b) => [
      { bar: b, freq: G3 },
      { bar: b, freq: B3 },
      { bar: b, freq: D4 }
    ])
  ];
  const G3_BASS = 196, F3_BASS = 175;
  const BASS_ROOTS = [A2, G3_BASS, F3_BASS, G3_BASS, A2, G3_BASS, F3_BASS, G3_BASS];
  let _bgmGain = null;
  let _bgmTimer = null;
  let _bgmLoopStart = 0;
  let _bgmRunning = false;
  const bgm = {
    get gain() {
      if (!_bgmGain) {
        const ctx = getAudioCtx();
        _bgmGain = ctx.createGain();
        _bgmGain.gain.setValueAtTime(0.18, ctx.currentTime);
        _bgmGain.connect(ctx.destination);
      }
      return _bgmGain;
    },
    /** Schedule one full loop of notes starting at audioTime `loopAt`. */
    _scheduleLoop(loopAt) {
      try {
        const ctx = getAudioCtx();
        const g = this.gain;
        const sq = (freq, t, dur, vol) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = "square";
          o.frequency.setValueAtTime(freq, t);
          gn.gain.setValueAtTime(0, t);
          gn.gain.linearRampToValueAtTime(vol, t + 0.01);
          gn.gain.setValueAtTime(vol * 0.65, t + dur * 0.55);
          gn.gain.linearRampToValueAtTime(0, t + dur);
          o.connect(gn);
          gn.connect(g);
          o.start(t);
          o.stop(t + dur + 0.01);
        };
        const tri = (freq, t, dur, vol) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(freq, t);
          gn.gain.setValueAtTime(vol, t);
          gn.gain.linearRampToValueAtTime(0, t + dur);
          o.connect(gn);
          gn.connect(g);
          o.start(t);
          o.stop(t + dur + 0.01);
        };
        const hat = (t, vol) => {
          const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.04), ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          const gn = ctx.createGain();
          const flt = ctx.createBiquadFilter();
          flt.type = "highpass";
          flt.frequency.value = 7e3;
          src.buffer = buf;
          gn.gain.setValueAtTime(vol, t);
          gn.gain.exponentialRampToValueAtTime(1e-4, t + 0.04);
          src.connect(flt);
          flt.connect(gn);
          gn.connect(g);
          src.start(t);
          src.stop(t + 0.05);
        };
        for (const note of MELODY_SCHED) {
          const t = loopAt + note.step * BGM_16TH;
          const dur = note.dur * BGM_16TH * 0.9;
          sq(note.freq, t, dur, 0.11);
        }
        for (const note of HARMONY_SCHED) {
          const t = loopAt + note.step * BGM_16TH;
          const dur = note.dur * BGM_16TH * 0.85;
          tri(note.freq, t, dur, 0.07);
        }
        for (const note of COUNTER_SCHED) {
          const t = loopAt + note.step * BGM_16TH;
          const dur = note.dur * BGM_16TH * 0.8;
          tri(note.freq, t, dur, 0.06);
        }
        for (const pad of PAD_NOTES) {
          const bt = loopAt + pad.bar * BGM_BAR;
          tri(pad.freq, bt, BGM_BEAT * 1.9, 0.04);
          tri(pad.freq, bt + BGM_BEAT * 2, BGM_BEAT * 1.9, 0.04);
        }
        for (let bar = 0; bar < BGM_BARS; bar++) {
          const root = BASS_ROOTS[bar];
          const bt = loopAt + bar * BGM_BAR;
          tri(root, bt, BGM_BEAT * 0.85, 0.14);
          tri(root, bt + BGM_BEAT, BGM_BEAT * 0.8, 0.09);
          tri(root, bt + BGM_BEAT * 2, BGM_BEAT * 0.85, 0.11);
          tri(root, bt + BGM_BEAT * 3, BGM_BEAT * 0.8, 0.09);
        }
        const arps = [
          [[A3, C4, E4, A4], [A3, C4, E4, A4]],
          [[196, 294, 392, 196 * 2], [196, 294, 392, 196 * 2]],
          [[175, 262, 349, 262], [175, 262, 349, 262]],
          [[196, 294, 392, 196 * 2], [196, 294, 392, 196 * 2]]
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
        const kick = (t) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(150, t);
          o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
          gn.gain.setValueAtTime(0.3, t);
          gn.gain.exponentialRampToValueAtTime(1e-4, t + 0.18);
          o.connect(gn);
          gn.connect(g);
          o.start(t);
          o.stop(t + 0.2);
        };
        const snare = (t) => {
          const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          const flt = ctx.createBiquadFilter();
          flt.type = "bandpass";
          flt.frequency.value = 1800;
          flt.Q.value = 0.8;
          const gn = ctx.createGain();
          gn.gain.setValueAtTime(0.18, t);
          gn.gain.exponentialRampToValueAtTime(1e-4, t + 0.12);
          src.buffer = buf;
          src.connect(flt);
          flt.connect(gn);
          gn.connect(g);
          src.start(t);
          src.stop(t + 0.13);
        };
        for (let bar = 0; bar < BGM_BARS; bar++) {
          const bt = loopAt + bar * BGM_BAR;
          kick(bt);
          snare(bt + BGM_BEAT);
          kick(bt + BGM_BEAT * 2);
          snare(bt + BGM_BEAT * 3);
        }
        const totalHats = BGM_BARS * 8;
        for (let s = 0; s < totalHats; s++) {
          hat(loopAt + s * BGM_8TH, s % 2 === 0 ? 0.04 : 0.018);
        }
      } catch (_) {
      }
    },
    play() {
      if (_bgmRunning) return;
      _bgmRunning = true;
      try {
        const ctx = getAudioCtx();
        _bgmLoopStart = ctx.currentTime + 0.05;
        this._scheduleLoop(_bgmLoopStart);
        this._scheduleLoop(_bgmLoopStart + BGM_LOOP);
        _bgmTimer = setInterval(() => {
          if (!_bgmRunning) return;
          try {
            const now = getAudioCtx().currentTime;
            const elapsed = now - _bgmLoopStart;
            const loopsElapsed = Math.floor(elapsed / BGM_LOOP);
            const nextLoop = _bgmLoopStart + (loopsElapsed + 2) * BGM_LOOP;
            if (nextLoop - now < BGM_LOOP * 1.5) {
              this._scheduleLoop(nextLoop);
            }
          } catch (_) {
          }
        }, 4e3);
      } catch (_) {
      }
    },
    stop() {
      _bgmRunning = false;
      if (_bgmTimer !== null) {
        clearInterval(_bgmTimer);
        _bgmTimer = null;
      }
      try {
        const ctx = getAudioCtx();
        if (_bgmGain) {
          _bgmGain.gain.cancelScheduledValues(ctx.currentTime);
          _bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        }
      } catch (_) {
      }
    },
    /** Duck the BGM during the win jingle then restore. */
    duck(duckDur) {
      try {
        const ctx = getAudioCtx();
        if (!_bgmGain) return;
        const now = ctx.currentTime;
        _bgmGain.gain.cancelScheduledValues(now);
        _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, now);
        _bgmGain.gain.linearRampToValueAtTime(0.04, now + 0.08);
        _bgmGain.gain.setValueAtTime(0.04, now + duckDur - 0.2);
        _bgmGain.gain.linearRampToValueAtTime(0.18, now + duckDur + 0.4);
      } catch (_) {
      }
    }
  };
  const sfx = {
    /** Short ascending blip — dog steps onto a tile */
    step() {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(780, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
      } catch (_) {
      }
    },
    /** Low descending buzz — invalid move */
    invalid() {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.13);
      } catch (_) {
      }
    },
    /** Capcom SNES-style stage clear jingle */
    win() {
      try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const sq = (freq, start, dur, vol) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "square";
          o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(vol, start + 8e-3);
          g.gain.setValueAtTime(vol, start + dur - 0.02);
          g.gain.linearRampToValueAtTime(0, start + dur);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(start);
          o.stop(start + dur);
        };
        const tri = (freq, start, dur, vol) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(vol, start);
          g.gain.linearRampToValueAtTime(0, start + dur);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(start);
          o.stop(start + dur);
        };
        const noise = (start, dur, vol) => {
          const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          const g = ctx.createGain();
          const flt = ctx.createBiquadFilter();
          flt.type = "highpass";
          flt.frequency.setValueAtTime(4e3, start);
          src.buffer = buf;
          g.gain.setValueAtTime(vol, start);
          g.gain.exponentialRampToValueAtTime(1e-4, start + dur);
          src.connect(flt);
          flt.connect(g);
          g.connect(ctx.destination);
          src.start(start);
          src.stop(start + dur);
        };
        sq(1047, now, 0.18, 0.16);
        sq(784, now, 0.18, 0.13);
        sq(659, now, 0.18, 0.11);
        tri(262, now, 0.22, 0.18);
        noise(now, 0.12, 0.1);
        const run = [523, 587, 659, 784, 880, 1047];
        const step = 0.1;
        run.forEach((f, i) => {
          const t = now + 0.2 + i * step;
          sq(f, t, step * 0.85, 0.15);
          if (i === 0) tri(f / 2, t, step * 0.9, 0.12);
        });
        const finT = now + 0.2 + run.length * step;
        const finO = ctx.createOscillator();
        const finG = ctx.createGain();
        finO.type = "square";
        finO.frequency.setValueAtTime(1047, finT);
        const vibLFO = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vibLFO.frequency.setValueAtTime(6, finT);
        vibGain.gain.setValueAtTime(18, finT);
        vibLFO.connect(vibGain);
        vibGain.connect(finO.frequency);
        vibLFO.start(finT);
        vibLFO.stop(finT + 0.55);
        finG.gain.setValueAtTime(0.16, finT);
        finG.gain.setValueAtTime(0.16, finT + 0.3);
        finG.gain.linearRampToValueAtTime(0, finT + 0.55);
        finO.connect(finG);
        finG.connect(ctx.destination);
        finO.start(finT);
        finO.stop(finT + 0.55);
        noise(finT, 0.35, 0.14);
        tri(262, finT, 0.4, 0.16);
      } catch (_) {
      }
    },
    /** Title screen confirm — Capcom-style two-note dun-DUN */
    start() {
      try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        const o1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        o1.type = "square";
        o1.frequency.setValueAtTime(131, now);
        g1.gain.setValueAtTime(0, now);
        g1.gain.linearRampToValueAtTime(0.22, now + 8e-3);
        g1.gain.linearRampToValueAtTime(0, now + 0.1);
        o1.connect(g1);
        g1.connect(ctx.destination);
        o1.start(now);
        o1.stop(now + 0.1);
        const chord = [262, 330, 392];
        chord.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = i === 0 ? "square" : "triangle";
          o.frequency.setValueAtTime(freq, now + 0.11);
          g.gain.setValueAtTime(0, now + 0.11);
          g.gain.linearRampToValueAtTime(i === 0 ? 0.18 : 0.1, now + 0.118);
          g.gain.linearRampToValueAtTime(0, now + 0.32);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + 0.11);
          o.stop(now + 0.32);
        });
      } catch (_) {
      }
    },
    /** Descending mirror of step() — undo a move */
    undo() {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(780, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(520, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
      } catch (_) {
      }
    },
    /** Watery plunk — ramen tile sinks into broth */
    sink() {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      } catch (_) {
      }
    }
  };
  let scene;
  let gs;
  let playerContainer;
  let tileContainers = [];
  let startHandleObj;
  let endHandleObj;
  let hudRamenText;
  let hudLevelText;
  let hintPanel = null;
  let overlayContainer = null;
  let boardContainer;
  let swipeStartX = 0;
  let swipeStartY = 0;
  const SWIPE_THRESHOLD = 30;
  function cloneGrid(grid) {
    return grid.map((row) => row.map((tile) => ({ ...tile })));
  }
  function snapshotStates(grid) {
    return grid.map((row) => row.map((tile) => tile.state));
  }
  function restoreStates(grid, states) {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        grid[r][c].state = states[r][c];
  }
  function getLevelParams(level) {
    const idx = Math.min(level - 1, LEVEL_PARAMS.length - 1);
    return LEVEL_PARAMS[idx];
  }
  const DIRS = [
    { dr: -1, dc: 0, dir: "up" },
    { dr: 1, dc: 0, dir: "down" },
    { dr: 0, dc: -1, dir: "left" },
    { dr: 0, dc: 1, dir: "right" }
  ];
  const OPPOSITE = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };
  const seenLevelHashes = /* @__PURE__ */ new Set();
  function levelHash(grid) {
    return grid.map((row) => row.map((t) => t.type[0]).join("")).join("|");
  }
  function generateLevel(level) {
    const p = getLevelParams(level);
    const { gridSize, ramenCount, stoneCount } = p;
    for (let attempt = 0; attempt < 1e3; attempt++) {
      const result = tryGenerateLevel(gridSize, ramenCount, stoneCount);
      if (!result) continue;
      const hash = levelHash(result.grid);
      if (seenLevelHashes.has(hash)) continue;
      seenLevelHashes.add(hash);
      return result;
    }
    return fallbackLevel(gridSize);
  }
  function tryGenerateLevel(gridSize, ramenCount, stoneCount) {
    const midCol = Math.floor(gridSize / 2);
    const preStones = /* @__PURE__ */ new Set();
    if (stoneCount > 0) {
      const candidates = pickSpreadStones(gridSize, stoneCount, midCol);
      for (const key of candidates) preStones.add(key);
    }
    const ramenVisited = /* @__PURE__ */ new Set();
    const stoneOnPath = /* @__PURE__ */ new Set();
    let r = gridSize - 1;
    let c = midCol;
    ramenVisited.add(`${r},${c}`);
    if (preStones.has(`${r},${c}`)) stoneOnPath.add(`${r},${c}`);
    const backCells = [{ r, c }];
    const backMoves = [];
    let ramenCollected = stoneOnPath.has(`${r},${c}`) ? 0 : 1;
    const MAX_STEPS = gridSize * gridSize * 6;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ramenCollected >= ramenCount) {
        if (r === 0 && c === midCol) break;
        const homeOrder = [];
        if (c > midCol) homeOrder.push({ dr: 0, dc: -1, dir: "left" });
        if (c < midCol) homeOrder.push({ dr: 0, dc: 1, dir: "right" });
        homeOrder.push(...[...DIRS].filter((d) => d.dir === "up" || d.dir === "down"));
        homeOrder.push(...[...DIRS].filter((d) => d.dir === "left" || d.dir === "right"));
        let moved2 = false;
        for (const { dr: dr2, dc: dc2, dir: dir2 } of homeOrder) {
          const nr = r + dr2;
          const nc = c + dc2;
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
          const key = `${nr},${nc}`;
          const isBlockedRamen = ramenVisited.has(key) && !stoneOnPath.has(key) && !preStones.has(key);
          if (isBlockedRamen) continue;
          if (!ramenVisited.has(key)) {
            ramenVisited.add(key);
            if (preStones.has(key)) {
              stoneOnPath.add(key);
            } else {
              ramenCollected++;
            }
          }
          backCells.push({ r: nr, c: nc });
          backMoves.push(dir2);
          r = nr;
          c = nc;
          moved2 = true;
          break;
        }
        if (!moved2) return null;
        continue;
      }
      const shuffled = [...DIRS].sort(() => Math.random() - 0.5);
      const unvisited = [];
      const reentrable = [];
      for (const { dr: dr2, dc: dc2, dir: dir2 } of shuffled) {
        const nr = r + dr2;
        const nc = c + dc2;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        const key = `${nr},${nc}`;
        if (!ramenVisited.has(key)) {
          unvisited.push({ nr, nc, dir: dir2 });
        } else if (stoneOnPath.has(key)) {
          reentrable.push({ nr, nc, dir: dir2 });
        } else ;
      }
      let moved = false;
      if (!moved) {
        for (const nb of unvisited) {
          if (preStones.has(`${nb.nr},${nb.nc}`)) {
            ramenVisited.add(`${nb.nr},${nb.nc}`);
            stoneOnPath.add(`${nb.nr},${nb.nc}`);
            backCells.push({ r: nb.nr, c: nb.nc });
            backMoves.push(nb.dir);
            r = nb.nr;
            c = nb.nc;
            moved = true;
            break;
          }
        }
      }
      if (!moved && reentrable.length > 0 && unvisited.length > 0 && Math.random() < 0.4) {
        const pick = reentrable[Math.floor(Math.random() * reentrable.length)];
        backCells.push({ r: pick.nr, c: pick.nc });
        backMoves.push(pick.dir);
        r = pick.nr;
        c = pick.nc;
        moved = true;
      }
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
        r = pick.nr;
        c = pick.nc;
        moved = true;
      }
      if (!moved && reentrable.length > 0) {
        const pick = reentrable[0];
        backCells.push({ r: pick.nr, c: pick.nc });
        backMoves.push(pick.dir);
        r = pick.nr;
        c = pick.nc;
        moved = true;
      }
      if (!moved) return null;
    }
    if (r !== 0 || c !== midCol) return null;
    if (ramenCollected < ramenCount) return null;
    const forwardMoves = ["down"];
    for (let i = backMoves.length - 1; i >= 0; i--) {
      forwardMoves.push(OPPOSITE[backMoves[i]]);
    }
    forwardMoves.push("down");
    const grid = [];
    for (let row = 0; row < gridSize; row++) {
      grid[row] = [];
      for (let col = 0; col < gridSize; col++) {
        grid[row][col] = { type: "broth", state: "active", row, col };
      }
    }
    for (const key of ramenVisited) {
      const [kr, kc] = key.split(",").map(Number);
      grid[kr][kc].type = stoneOnPath.has(key) ? "stone" : "ramen";
    }
    return { grid, solution: forwardMoves };
  }
  function pickSpreadStones(gridSize, stoneCount, midCol) {
    const all = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (c === midCol && (r === 0 || r === gridSize - 1)) continue;
        all.push({ r, c });
      }
    }
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const minDist = Math.max(2, Math.floor(gridSize / 2));
    const chosen = [];
    for (const cell of all) {
      if (chosen.length >= stoneCount) break;
      const tooClose = chosen.some(
        (other) => Math.abs(other.r - cell.r) + Math.abs(other.c - cell.c) < minDist
      );
      if (!tooClose) chosen.push(cell);
    }
    if (chosen.length < stoneCount) {
      for (const cell of all) {
        if (chosen.length >= stoneCount) break;
        `${cell.r},${cell.c}`;
        if (chosen.some((o) => o.r === cell.r && o.c === cell.c)) continue;
        const tooClose = chosen.some(
          (other) => Math.abs(other.r - cell.r) + Math.abs(other.c - cell.c) < 2
        );
        if (!tooClose) chosen.push(cell);
      }
    }
    return chosen.map(({ r, c }) => `${r},${c}`);
  }
  function fallbackLevel(gridSize) {
    const midCol = Math.floor(gridSize / 2);
    const grid = [];
    for (let r = 0; r < gridSize; r++) {
      grid[r] = [];
      for (let c = 0; c < gridSize; c++) {
        grid[r][c] = { type: c === midCol ? "ramen" : "broth", state: "active", row: r, col: c };
      }
    }
    const solution = [];
    for (let i = 0; i <= gridSize; i++) solution.push("down");
    return { grid, solution };
  }
  function getTileSize(gridSize) {
    const maxByHeight = Math.floor((GAME_HEIGHT - 700) / gridSize);
    const maxByWidth = Math.floor((GAME_WIDTH - 80) / gridSize);
    return Math.min(maxByHeight, maxByWidth, 120);
  }
  function getBoardOrigin(gridSize) {
    const ts = getTileSize(gridSize);
    const boardPx = ts * gridSize;
    const ox = (GAME_WIDTH - boardPx) / 2;
    const oy = 210;
    return { ox, oy };
  }
  function create() {
    scene = this;
    this.rexUI;
    drawBackground();
    buildHUD();
    setupInput();
    showTitleScreen();
  }
  function update() {
  }
  function drawBackground() {
    const bg = scene.add.graphics();
    bg.fillGradientStyle(
      COLORS.bg.secondary,
      COLORS.bg.secondary,
      COLORS.bg.primary,
      COLORS.bg.primary,
      1
    );
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const ingredientCount = 22;
    for (let i = 0; i < ingredientCount; i++) {
      spawnIngredient();
    }
  }
  function spawnIngredient() {
    const x = Phaser.Math.Between(30, GAME_WIDTH - 30);
    const y = Phaser.Math.Between(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.88);
    const type = Phaser.Math.Between(0, 7);
    const g = scene.add.graphics();
    g.x = x;
    g.y = y;
    g.alpha = Phaser.Math.FloatBetween(0.18, 0.38);
    drawIngredient(g, type);
    const rise = Phaser.Math.Between(40, 130);
    const dur = Phaser.Math.Between(4e3, 9e3);
    const delay = Phaser.Math.Between(0, 4e3);
    scene.tweens.add({
      targets: g,
      y: y - rise,
      angle: Phaser.Math.Between(-20, 20),
      alpha: 0,
      duration: dur,
      delay,
      ease: "Sine.easeIn",
      loop: -1,
      onLoop: () => {
        g.y = y + Phaser.Math.Between(0, 60);
        g.angle = 0;
        g.alpha = Phaser.Math.FloatBetween(0.18, 0.38);
      }
    });
  }
  function drawIngredient(g, type) {
    switch (type) {
      case 0: {
        g.fillStyle(1718810, 1);
        g.fillRoundedRect(-14, -9, 28, 18, 3);
        g.lineStyle(1, 2976557, 0.6);
        g.lineBetween(-9, -9, -9, 9);
        g.lineBetween(0, -9, 0, 9);
        g.lineBetween(9, -9, 9, 9);
        g.lineBetween(-14, -3, 14, -3);
        g.lineBetween(-14, 3, 14, 3);
        break;
      }
      case 1: {
        g.fillStyle(16774645, 1);
        g.fillCircle(0, 0, 12);
        g.fillStyle(16746632, 1);
        g.fillEllipse(0, 0, 6, 20);
        g.lineStyle(1.5, 16755370, 0.8);
        g.strokeCircle(0, 0, 12);
        break;
      }
      case 2: {
        g.fillStyle(12869696, 1);
        g.fillEllipse(0, 0, 28, 18);
        g.fillStyle(15241322, 0.6);
        g.fillEllipse(-2, -2, 18, 10);
        g.lineStyle(1, 9054208, 0.5);
        g.lineBetween(-8, 4, 8, 4);
        g.lineBetween(-6, 7, 6, 7);
        break;
      }
      case 3: {
        g.fillStyle(16775392, 1);
        g.fillEllipse(0, 0, 22, 26);
        g.fillStyle(16103424, 1);
        g.fillCircle(0, 2, 7);
        g.lineStyle(1.5, 15255672, 0.6);
        g.strokeEllipse(0, 0, 22, 26);
        break;
      }
      case 4: {
        g.fillStyle(15259800, 1);
        g.fillRoundedRect(-7, -14, 14, 28, 3);
        g.lineStyle(1, 12101720, 0.7);
        for (let i = -10; i <= 10; i += 5) {
          g.lineBetween(-7, i, 7, i);
        }
        break;
      }
      case 5: {
        g.fillStyle(4885034, 1);
        for (let i = -2; i <= 2; i++) {
          g.fillCircle(i * 5, i % 2 === 0 ? -3 : 3, 4);
        }
        g.lineStyle(1, 2972186, 0.5);
        g.lineBetween(-14, 0, 14, 0);
        break;
      }
      case 6: {
        g.fillStyle(8014376, 1);
        g.fillEllipse(0, -4, 24, 14);
        g.fillStyle(13936760, 1);
        g.fillEllipse(0, 2, 18, 8);
        g.lineStyle(1, 5910544, 0.6);
        g.lineBetween(-7, 2, -7, 8);
        g.lineBetween(0, 2, 0, 8);
        g.lineBetween(7, 2, 7, 8);
        break;
      }
      default: {
        const r = Phaser.Math.Between(4, 11);
        g.fillStyle(COLORS.broth.bubble, 0.7);
        g.fillCircle(0, 0, r);
        g.lineStyle(1, 16777215, 0.3);
        g.strokeCircle(0, 0, r);
        break;
      }
    }
  }
  function buildHUD() {
    hudLevelText = scene.add.text(40, 48, "Level 1", TEXT_STYLES.hud).setOrigin(0, 0.5);
    hudRamenText = scene.add.text(GAME_WIDTH - 40, 48, "🍜 0/0", TEXT_STYLES.hud).setOrigin(1, 0.5);
    hudLevelText.setDepth(20);
    hudRamenText.setDepth(20);
  }
  function updateHUD() {
    if (!gs) return;
    hudLevelText.setText(`Level ${gs.level}`);
    hudRamenText.setText(`🍜 ${gs.ramenCleared}/${gs.ramenTotal}`);
  }
  function setupInput() {
    var _a;
    scene.input.on("pointerdown", (p) => {
      swipeStartX = p.x;
      swipeStartY = p.y;
    });
    scene.input.on("pointerup", (p) => {
      if (!gs || gs.phase !== "playing") return;
      const dx = p.x - swipeStartX;
      const dy = p.y - swipeStartY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;
      let dir;
      if (adx > ady) dir = dx > 0 ? "right" : "left";
      else dir = dy > 0 ? "down" : "up";
      handleMove(dir);
    });
    (_a = scene.input.keyboard) == null ? void 0 : _a.on("keydown", (e) => {
      if (!gs || gs.phase !== "playing") return;
      const map = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right"
      };
      if (map[e.key]) handleMove(map[e.key]);
      if (e.key === "f" || e.key === "F") handleUndo();
      if (e.key === " ") retryLevel();
    });
  }
  function showTitleScreen() {
    var _a;
    clearOverlay();
    const items = [];
    const cx = GAME_WIDTH / 2;
    const bg = scene.add.graphics();
    bg.fillGradientStyle(1706496, 1706496, 4004352, 4004352, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    items.push(bg);
    const scan = scene.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y += 4) {
      scan.fillStyle(0, 0.08);
      scan.fillRect(0, y, GAME_WIDTH, 2);
    }
    items.push(scan);
    const dogeG = scene.add.graphics();
    dogeG.alpha = 1;
    dogeG.x = cx;
    dogeG.y = GAME_HEIGHT * 0.44;
    drawShiba(dogeG, 310, true);
    items.push(dogeG);
    scene.tweens.add({
      targets: dogeG,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 3200,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut"
    });
    const dogeY = GAME_HEIGHT * 0.44;
    const r = 310;
    const irisR = r * 0.12;
    const pupilR = r * 0.07;
    const maxShift = r * 0.05;
    const eyeRestL = { x: cx - r * 0.32, y: dogeY - r * 0.2 };
    const eyeRestR = { x: cx + r * 0.32, y: dogeY - r * 0.2 };
    function makeEyeOverlay(restX, restY) {
      const eg = scene.add.graphics();
      eg.x = restX;
      eg.y = restY;
      eg.fillStyle(9062936, 1);
      eg.fillCircle(0, 0, irisR);
      eg.fillStyle(COLORS.player.nose, 1);
      eg.fillCircle(0, 0, pupilR);
      eg.fillStyle(16777215, 0.9);
      eg.fillCircle(irisR * 0.22, -irisR * 0.28, irisR * 0.18);
      return eg;
    }
    const eyeL = makeEyeOverlay(eyeRestL.x, eyeRestL.y);
    const eyeR = makeEyeOverlay(eyeRestR.x, eyeRestR.y);
    eyeL.setDepth(12);
    eyeR.setDepth(12);
    items.push(eyeL);
    items.push(eyeR);
    const onPointerMove = (p) => {
      for (const { eye, rest } of [
        { eye: eyeL, rest: eyeRestL },
        { eye: eyeR, rest: eyeRestR }
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
    scene.input.on("pointermove", onPointerMove);
    eyeL.on("destroy", () => scene.input.off("pointermove", onPointerMove));
    const potTopY = GAME_HEIGHT * 0.7 - 155;
    const noodleXs = [-220, -140, -60, 0, 60, 140, 220, 290];
    for (let ni = 0; ni < noodleXs.length; ni++) {
      const nx = cx + noodleXs[ni];
      const startY = Phaser.Math.Between(-200, -20);
      const strandG = scene.add.graphics();
      strandG.x = nx;
      strandG.y = startY;
      strandG.lineStyle(3 + ni % 3, COLORS.tile.ramen, 0.85);
      strandG.beginPath();
      const strandLen = 160 + ni % 4 * 20;
      for (let py = 0; py <= strandLen; py += 6) {
        const px = Math.sin(py * 0.09 + ni) * 10;
        if (py === 0) strandG.moveTo(px, py);
        else strandG.lineTo(px, py);
      }
      strandG.strokePath();
      strandG.lineStyle(2, COLORS.tile.ramenEdge, 0.5);
      strandG.beginPath();
      for (let py = 0; py <= strandLen; py += 6) {
        const px = Math.sin(py * 0.09 + ni + 1.2) * 8 + 4;
        if (py === 0) strandG.moveTo(px, py);
        else strandG.lineTo(px, py);
      }
      strandG.strokePath();
      items.push(strandG);
      scene.tweens.add({
        targets: strandG,
        y: potTopY,
        duration: 900 + ni * 130,
        delay: ni * 80,
        ease: "Sine.easeIn",
        loop: -1,
        onLoop: () => {
          strandG.y = Phaser.Math.Between(-240, -40);
        }
      });
    }
    const potG = scene.add.graphics();
    drawPotIllustration(potG, cx, GAME_HEIGHT * 0.7, 310);
    items.push(potG);
    const rippleG = scene.add.graphics();
    rippleG.x = cx;
    rippleG.y = GAME_HEIGHT * 0.7;
    rippleG.lineStyle(2, COLORS.broth.shimmer, 0.6);
    rippleG.strokeCircle(0, 0, 30);
    items.push(rippleG);
    scene.tweens.add({
      targets: rippleG,
      scaleX: 4.5,
      scaleY: 4.5,
      alpha: 0,
      duration: 1100,
      loop: -1,
      ease: "Sine.easeOut",
      onLoop: () => {
        rippleG.setScale(1);
        rippleG.alpha = 0.6;
      }
    });
    const TITLE_TOP = 100;
    const TITLE_H = 148 + 112;
    const BANNER_PAD = 16;
    const bannerG = scene.add.graphics();
    bannerG.fillStyle(0, 0.45);
    bannerG.fillRect(0, TITLE_TOP - BANNER_PAD, GAME_WIDTH, TITLE_H + BANNER_PAD * 2);
    bannerG.lineStyle(4, COLORS.ui.winGold, 0.7);
    bannerG.strokeRect(0, TITLE_TOP - BANNER_PAD, GAME_WIDTH, TITLE_H + BANNER_PAD * 2);
    items.push(bannerG);
    const dogText = scene.add.text(cx, TITLE_TOP, "DOG", {
      fontSize: "148px",
      fontFamily: "Arial Black",
      color: "#f5c76a",
      stroke: "#5a2800",
      strokeThickness: 14
    }).setOrigin(0.5, 0);
    items.push(dogText);
    const ramenText = scene.add.text(cx, TITLE_TOP + 148, "RAMEN", {
      fontSize: "112px",
      fontFamily: "Arial Black",
      color: "#fff5e0",
      stroke: "#7a2800",
      strokeThickness: 12
    }).setOrigin(0.5, 0);
    items.push(ramenText);
    const taglineBg = scene.add.graphics();
    taglineBg.fillStyle(COLORS.broth.dark, 0.88);
    const taglineY = TITLE_TOP + 148 + 112 + 10;
    taglineBg.fillRoundedRect(cx - 300, taglineY, 600, 68, 8);
    items.push(taglineBg);
    const titleTagline = scene.add.text(
      cx,
      taglineY + 34,
      "CHEAT CUSTOMER WITH CHEAP RAMEN!\nPUSH NOODLE DOWN FOR COOK!",
      {
        fontSize: "21px",
        fontFamily: "Arial Black",
        color: "#f5c76a",
        stroke: "#3d1a00",
        strokeThickness: 4,
        align: "center"
      }
    ).setOrigin(0.5);
    items.push(titleTagline);
    scene.tweens.add({
      targets: dogText,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 900,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut"
    });
    const legendH = 210;
    const legendY = GAME_HEIGHT - 36 - 16 - legendH;
    const btnTopY = legendY - 16 - 88;
    const legendBg = scene.add.graphics();
    legendBg.fillStyle(0, 0.55);
    legendBg.fillRoundedRect(40, legendY, GAME_WIDTH - 80, legendH, 10);
    legendBg.lineStyle(2, COLORS.ui.border, 0.8);
    legendBg.strokeRoundedRect(40, legendY, GAME_WIDTH - 80, legendH, 10);
    items.push(legendBg);
    const howHeader = scene.add.text(cx, legendY + 16, "HOW TO PLAY", {
      fontSize: "24px",
      fontFamily: "Arial Black",
      color: "#fff5e0",
      stroke: "#3d1a00",
      strokeThickness: 4
    }).setOrigin(0.5, 0);
    items.push(howHeader);
    const tileData = [
      { color: COLORS.tile.ramen, label: "RAMEN\nSTEP ON!", x: cx - 220, isMesh: false },
      { color: 12101752, label: "STRAINER\nREUSE OK", x: cx, isMesh: true },
      { color: COLORS.broth.base, label: "BROTH\nNO STEP!", x: cx + 220, isMesh: false }
    ];
    for (const { color, label, x, isMesh } of tileData) {
      const tg = scene.make.graphics();
      if (isMesh) {
        const s = 56;
        tg.fillStyle(12101752, 1);
        tg.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
        const cols = 4, rows = 4;
        const cw = s / cols, ch = s / rows, hr = cw * 0.21;
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            if (rr === 0 && cc === 0) continue;
            if (rr === 0 && cc === cols - 1) continue;
            if (rr === rows - 1 && cc === 0) continue;
            if (rr === rows - 1 && cc === cols - 1) continue;
            const hx = -s / 2 + cw * (cc + 0.5);
            const hy = -s / 2 + ch * (rr + 0.5);
            tg.fillStyle(COLORS.broth.base, 0.75);
            tg.fillCircle(hx, hy, hr);
          }
        }
        tg.lineStyle(2, 9072704, 0.8);
        tg.strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
      } else {
        tg.fillStyle(color, 1);
        tg.fillRoundedRect(-28, -28, 56, 56, 6);
        tg.lineStyle(2, 0, 0.4);
        tg.strokeRoundedRect(-28, -28, 56, 56, 6);
      }
      const tc = scene.add.container(x, legendY + 104, [tg]);
      tc.setSize(56, 56);
      items.push(tc);
      const lbl = scene.add.text(x, legendY + 146, label, {
        fontSize: "20px",
        fontFamily: "Arial Black",
        color: "#fff5e0",
        stroke: "#000",
        strokeThickness: 3,
        align: "center"
      }).setOrigin(0.5, 0);
      items.push(lbl);
    }
    const startBtnBg = scene.add.graphics();
    startBtnBg.fillStyle(COLORS.ui.button, 1);
    startBtnBg.fillRoundedRect(cx - 200, btnTopY, 400, 88, 14);
    startBtnBg.lineStyle(3, COLORS.ui.winGold, 1);
    startBtnBg.strokeRoundedRect(cx - 200, btnTopY, 400, 88, 14);
    items.push(startBtnBg);
    const startText = scene.add.text(cx, btnTopY + 44, "PUSH START!", {
      fontSize: "48px",
      fontFamily: "Arial Black",
      color: "#f5c76a",
      stroke: "#3d1a00",
      strokeThickness: 7
    }).setOrigin(0.5);
    items.push(startText);
    scene.tweens.add({
      targets: [startBtnBg, startText],
      alpha: 0.25,
      duration: 520,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut"
    });
    const hitArea = scene.add.rectangle(cx, btnTopY + 44, 400, 88, 0, 0).setInteractive({ useHandCursor: true }).on("pointerdown", doStart);
    items.push(hitArea);
    scene.add.text(
      cx,
      GAME_HEIGHT - 36,
      "(C)1993 WOOF SOFT  ALL RIGHT RESERVE",
      {
        fontSize: "20px",
        fontFamily: "Arial",
        color: "#8a6848"
      }
    ).setOrigin(0.5);
    overlayContainer = scene.add.container(0, 0, items);
    overlayContainer.setDepth(10);
    const onKey = () => {
      doStart();
    };
    (_a = scene.input.keyboard) == null ? void 0 : _a.once("keydown", onKey);
    function doStart() {
      var _a2;
      sfx.start();
      bgm.play();
      (_a2 = scene.input.keyboard) == null ? void 0 : _a2.off("keydown", onKey);
      clearOverlay();
      startLevel(1);
    }
  }
  function startLevel(level) {
    clearBoard();
    clearHintPanel();
    const { grid, solution } = generateLevel(level);
    const p = getLevelParams(level);
    const gridSize = p.gridSize;
    let ramenTotal = 0;
    for (let r = 0; r < gridSize; r++)
      for (let c = 0; c < gridSize; c++)
        if (grid[r][c].type === "ramen") ramenTotal++;
    gs = {
      level,
      phase: "intro",
      grid,
      playerRow: -1,
      playerCol: Math.floor(gridSize / 2),
      ramenCleared: 0,
      ramenTotal,
      solution,
      showingHint: false,
      savedGrid: cloneGrid(grid),
      // frozen copy for retry
      savedSolution: [...solution],
      undoStack: []
    };
    updateHUD();
    drawBoard();
    drawPlayer();
    buildControlButtons();
    playIntroAnimation();
  }
  function retryLevel() {
    clearBoard();
    clearHintPanel();
    const grid = cloneGrid(gs.savedGrid);
    const solution = [...gs.savedSolution];
    const gridSize = grid.length;
    let ramenTotal = 0;
    for (let r = 0; r < gridSize; r++)
      for (let c = 0; c < gridSize; c++)
        if (grid[r][c].type === "ramen") ramenTotal++;
    gs = {
      level: gs.level,
      phase: "intro",
      grid,
      playerRow: -1,
      playerCol: Math.floor(gridSize / 2),
      ramenCleared: 0,
      ramenTotal,
      solution,
      showingHint: false,
      savedGrid: cloneGrid(gs.savedGrid),
      // preserve for future retries
      savedSolution: [...gs.savedSolution],
      undoStack: []
    };
    updateHUD();
    drawBoard();
    drawPlayer();
    buildControlButtons();
    playIntroAnimation();
  }
  function playIntroAnimation() {
    var _a;
    const { grid } = gs;
    const gridSize = grid.length;
    const ts = getTileSize(gridSize);
    const { ox, oy } = getBoardOrigin(gridSize);
    const ramenTiles = [];
    for (let r = 0; r < gridSize; r++)
      for (let c = 0; c < gridSize; c++)
        if (grid[r][c].type === "ramen") ramenTiles.push({ r, c });
    for (const { r, c } of ramenTiles) {
      const tc = (_a = tileContainers[r]) == null ? void 0 : _a[c];
      if (tc) tc.setAlpha(0).setScale(0.1);
    }
    const DROP_MS = 420;
    const BURST_MS = 220;
    const LAND_MS = 280;
    const TOTAL_STAGGER_MS = Math.max(180, ramenTiles.length * 120);
    let lastEndTime = 0;
    ramenTiles.forEach(({ r, c }, idx) => {
      const n = Math.max(1, ramenTiles.length - 1);
      const t = idx / n;
      const easedT = t * t;
      const delay = Math.round(easedT * TOTAL_STAGGER_MS);
      const tx = ox + c * ts + ts / 2;
      const ty = oy + r * ts + ts / 2;
      const pktG = scene.make.graphics();
      pktG.fillStyle(14692384, 1);
      pktG.fillRoundedRect(-ts * 0.42, -ts * 0.42, ts * 0.84, ts * 0.84, 6);
      pktG.lineStyle(2, 16773328, 0.8);
      pktG.strokeRoundedRect(-ts * 0.42, -ts * 0.42, ts * 0.84, ts * 0.84, 6);
      pktG.lineStyle(1.5, 16773328, 0.6);
      pktG.lineBetween(-ts * 0.28, -ts * 0.22, ts * 0.02, -ts * 0.22);
      pktG.lineBetween(-ts * 0.24, -ts * 0.1, ts * 0.05, -ts * 0.1);
      const pktFontSize = Math.max(10, Math.round(ts * 0.18));
      const pktTxt = scene.add.text(0, ts * 0.1, "INSTANT\nRAMEN", {
        fontSize: `${pktFontSize}px`,
        fontFamily: "Arial Black",
        color: "#fff0d0",
        stroke: "#8a1000",
        strokeThickness: Math.max(2, Math.round(ts * 0.05)),
        align: "center",
        lineSpacing: -2
      }).setOrigin(0.5, 0);
      const pktContainer = scene.add.container(tx, ty - ts * 3.5, [pktG, pktTxt]);
      pktContainer.setDepth(6);
      scene.time.delayedCall(delay, () => {
        scene.tweens.add({
          targets: pktContainer,
          y: ty,
          duration: DROP_MS,
          ease: "Cubic.easeIn",
          onComplete: () => {
            var _a2;
            scene.tweens.add({
              targets: pktContainer,
              scaleX: 1.8,
              scaleY: 1.8,
              alpha: 0,
              duration: BURST_MS,
              ease: "Power2",
              onComplete: () => pktContainer.destroy()
            });
            sfx.sink();
            const tc = (_a2 = tileContainers[r]) == null ? void 0 : _a2[c];
            if (tc) {
              tc.setAlpha(1).setScale(1.3);
              scene.tweens.add({
                targets: tc,
                scaleX: 1,
                scaleY: 1,
                duration: LAND_MS,
                ease: "Back.easeOut"
              });
            }
          }
        });
      });
      const endTime = delay + DROP_MS + BURST_MS + LAND_MS;
      if (endTime > lastEndTime) lastEndTime = endTime;
    });
    scene.time.delayedCall(lastEndTime + 100, () => {
      gs.phase = "playing";
    });
  }
  function clearBoard() {
    if (boardContainer) {
      boardContainer.destroy(true);
    }
    tileContainers = [];
    if (playerContainer) {
      scene.tweens.killTweensOf(playerContainer);
      playerContainer.destroy(true);
    }
    playerContainer = null;
  }
  function drawBoard() {
    const { grid } = gs;
    const gridSize = grid.length;
    const ts = getTileSize(gridSize);
    const { ox, oy } = getBoardOrigin(gridSize);
    const boardPx = ts * gridSize;
    const objs = [];
    const potPad = 24;
    const potG = scene.add.graphics();
    const rimRadius = boardPx / 2 + potPad + 14;
    const potCx = ox + boardPx / 2;
    const potCy = oy + boardPx / 2;
    potG.fillStyle(COLORS.tile.potWall, 1);
    potG.fillCircle(potCx, potCy, rimRadius);
    potG.fillStyle(COLORS.broth.base, 1);
    potG.fillCircle(potCx, potCy, rimRadius - 14);
    potG.lineStyle(2, COLORS.broth.shimmer, 0.25);
    potG.strokeCircle(potCx, potCy, (rimRadius - 14) * 0.75);
    potG.strokeCircle(potCx, potCy, (rimRadius - 14) * 0.45);
    potG.lineStyle(4, 16777215, 0.12);
    potG.beginPath();
    potG.arc(potCx, potCy, rimRadius - 7, Math.PI * 1.1, Math.PI * 1.6);
    potG.strokePath();
    objs.push(potG);
    const ingredTypes = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2 + Math.random() * 0.5;
      const dist = (rimRadius - 18) * Phaser.Math.FloatBetween(0.2, 0.82);
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
        duration: Phaser.Math.Between(3e3, 6e3),
        yoyo: true,
        loop: -1,
        ease: "Sine.easeInOut"
      });
    }
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
    const handleSize = ts * 0.85;
    const midCol = Math.floor(gridSize / 2);
    const handleX = ox + midCol * ts + ts / 2;
    const topRimY = potCy - rimRadius;
    const startY = topRimY - handleSize * 0.6;
    startHandleObj = drawHandle(handleX, startY, handleSize, true);
    objs.push(startHandleObj);
    const botRimY = potCy + rimRadius;
    const endY = botRimY + handleSize * 0.6;
    endHandleObj = drawHandle(handleX, endY, handleSize, false);
    objs.push(endHandleObj);
    boardContainer = scene.add.container(0, 0, objs);
    boardContainer.setDepth(1);
  }
  function drawTile(tile, cx, cy, ts) {
    const g = scene.make.graphics();
    const pad = 3;
    const s = ts - pad * 2;
    switch (tile.type) {
      case "broth": {
        g.fillStyle(COLORS.broth.dark, 0.22);
        g.fillRect(-s / 2, -s / 2, s, s);
        break;
      }
      case "ramen": {
        g.fillStyle(COLORS.tile.ramen, 1);
        g.fillRoundedRect(-s / 2, -s / 2, s, s, 7);
        g.fillStyle(COLORS.tile.ramenEdge, 0.25);
        g.fillRoundedRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 5);
        g.fillStyle(COLORS.tile.ramen, 1);
        g.fillRoundedRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 12, 4);
        g.lineStyle(1.5, COLORS.tile.ramenEdge, 0.75);
        const noodleTop = -s / 2 + s * 0.15;
        for (let row = 0; row < 4; row++) {
          const ny = noodleTop + row * (s * 0.19);
          const pts = [];
          const steps = 10;
          for (let i = 0; i <= steps; i++) {
            const px = -s / 2 + s * 0.08 + s * 0.84 * (i / steps);
            const py = ny + Math.sin(i * Math.PI * 0.8) * (s * 0.035);
            pts.push({ x: px, y: py });
          }
          g.strokePoints(pts, false, false);
        }
        g.lineStyle(2, COLORS.tile.ramenEdge, 1);
        g.strokeRoundedRect(-s / 2, -s / 2, s, s, 7);
        break;
      }
      case "stone": {
        const meshColor = 12101752;
        const rimColor = 9072704;
        const holeColor = COLORS.broth.base;
        g.fillStyle(meshColor, 1);
        g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
        const cols = 5, rows = 5;
        const cellW = s / cols;
        const cellH = s / rows;
        const holeR = cellW * 0.22;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const hx = -s / 2 + cellW * (col + 0.5);
            const hy = -s / 2 + cellH * (row + 0.5);
            const edgeDist = Math.min(col, cols - 1 - col, row, rows - 1 - row);
            if (edgeDist === 0 && (col === 0 || col === cols - 1) && (row === 0 || row === rows - 1)) continue;
            g.fillStyle(holeColor, 0.75);
            g.fillCircle(hx, hy, holeR);
            g.lineStyle(0.8, rimColor, 0.5);
            g.strokeCircle(hx, hy, holeR);
          }
        }
        g.lineStyle(1.2, rimColor, 0.55);
        for (let col = 1; col < cols; col++) {
          const lx = -s / 2 + cellW * col;
          g.lineBetween(lx, -s / 2 + 4, lx, s / 2 - 4);
        }
        for (let row = 1; row < rows; row++) {
          const ly = -s / 2 + cellH * row;
          g.lineBetween(-s / 2 + 4, ly, s / 2 - 4, ly);
        }
        g.lineStyle(2.5, rimColor, 1);
        g.strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.18);
        g.lineStyle(2, 16777215, 0.25);
        g.beginPath();
        g.arc(-s * 0.15, -s * 0.15, s * 0.28, Math.PI * 1.1, Math.PI * 1.55);
        g.strokePath();
        break;
      }
    }
    const c = scene.add.container(cx, cy, [g]);
    c.setSize(ts, ts);
    return c;
  }
  function drawHandle(cx, cy, size, isStart) {
    const g = scene.make.graphics();
    const color = isStart ? COLORS.tile.startGlow : COLORS.tile.endGlow;
    const hw = size * 0.55;
    const hh = size * 0.38;
    const thick = size * 0.18;
    g.fillStyle(COLORS.tile.potHandle, 1);
    g.fillRoundedRect(-hw, -hh, hw * 2, hh * 2, thick * 0.7);
    const innerSide = isStart ? hw - thick : -hw + thick;
    g.fillStyle(COLORS.broth.base, 1);
    if (isStart) {
      g.fillRoundedRect(
        innerSide - (hw - thick * 2),
        -hh + thick,
        hw - thick * 2,
        hh * 2 - thick * 2,
        thick * 0.4
      );
    } else {
      g.fillRoundedRect(
        -hw + thick,
        -hh + thick,
        hw - thick * 2,
        hh * 2 - thick * 2,
        thick * 0.4
      );
    }
    g.lineStyle(3, color, 1);
    g.strokeRoundedRect(-hw, -hh, hw * 2, hh * 2, thick * 0.7);
    g.fillStyle(color, 1);
    const arrowSize = size * 0.18;
    if (isStart) {
      g.fillTriangle(
        0,
        hh * 0.35,
        -arrowSize * 0.8,
        hh * 0.35 - arrowSize,
        arrowSize * 0.8,
        hh * 0.35 - arrowSize
      );
    } else {
      g.fillTriangle(
        0,
        -hh * 0.35,
        -arrowSize * 0.8,
        -hh * 0.35 + arrowSize,
        arrowSize * 0.8,
        -hh * 0.35 + arrowSize
      );
    }
    const label = isStart ? "START" : "GOAL";
    const txt = scene.add.text(0, -hh - 18, label, {
      fontSize: `${Math.round(size * 0.2)}px`,
      fontFamily: "Arial Black",
      color: `#${color.toString(16).padStart(6, "0")}`,
      stroke: "#2b1a0e",
      strokeThickness: 4
    }).setOrigin(0.5, 1);
    const c = scene.add.container(cx, cy, [g, txt]);
    c.setSize(size, size * 0.76);
    return c;
  }
  function drawPlayer() {
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
  function drawShiba(g, r, skipIrises = false) {
    g.fillStyle(COLORS.player.body, 1);
    g.fillEllipse(0, r * 1.1, r * 1.8, r * 1.6);
    g.fillStyle(COLORS.player.light, 0.55);
    g.fillEllipse(0, r * 1, r * 0.9, r * 0.9);
    g.fillStyle(COLORS.player.body, 1);
    g.fillEllipse(-r * 0.52, r * 1.82, r * 0.52, r * 0.3);
    g.fillEllipse(r * 0.52, r * 1.82, r * 0.52, r * 0.3);
    g.lineStyle(1, COLORS.player.dark, 0.3);
    g.lineBetween(-r * 0.52, r * 1.7, -r * 0.52, r * 1.92);
    g.lineBetween(r * 0.52, r * 1.7, r * 0.52, r * 1.92);
    g.lineStyle(r * 0.18, COLORS.player.body, 1);
    g.beginPath();
    g.arc(r * 0.88, r * 0.88, r * 0.42, Math.PI * 0.9, Math.PI * 1.85, false);
    g.strokePath();
    g.fillStyle(COLORS.player.body, 1);
    g.fillEllipse(0, r * 0.44, r * 1.2, r * 0.7);
    g.fillStyle(COLORS.player.body, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(COLORS.player.dark, 0.3);
    g.fillEllipse(0, -r * 0.7, r * 0.95, r * 0.55);
    g.fillStyle(COLORS.player.body, 1);
    g.fillTriangle(-r * 0.62, -r * 0.52, -r * 0.26, -r * 1.18, -r * 0.94, -r * 1.22);
    g.fillTriangle(r * 0.62, -r * 0.52, r * 0.26, -r * 1.18, r * 0.94, -r * 1.22);
    g.fillStyle(13926506, 0.8);
    g.fillTriangle(-r * 0.6, -r * 0.6, -r * 0.3, -r * 1.07, -r * 0.82, -r * 1.1);
    g.fillTriangle(r * 0.6, -r * 0.6, r * 0.3, -r * 1.07, r * 0.82, -r * 1.1);
    g.fillStyle(COLORS.player.light, 1);
    g.fillEllipse(0, r * 0.24, r * 1.12, r * 0.72);
    g.fillStyle(COLORS.player.nose, 1);
    g.fillEllipse(0, r * 0.07, r * 0.3, r * 0.21);
    g.fillStyle(1706496, 0.65);
    g.fillCircle(-r * 0.075, r * 0.09, r * 0.055);
    g.fillCircle(r * 0.075, r * 0.09, r * 0.055);
    g.fillStyle(16777215, 1);
    g.fillEllipse(-r * 0.32, -r * 0.22, r * 0.32, r * 0.28);
    g.fillEllipse(r * 0.32, -r * 0.22, r * 0.32, r * 0.28);
    if (!skipIrises) {
      g.fillStyle(9062936, 1);
      g.fillCircle(-r * 0.32, -r * 0.2, r * 0.12);
      g.fillCircle(r * 0.32, -r * 0.2, r * 0.12);
      g.fillStyle(COLORS.player.nose, 1);
      g.fillCircle(-r * 0.3, -r * 0.2, r * 0.07);
      g.fillCircle(r * 0.3, -r * 0.2, r * 0.07);
      g.fillStyle(16777215, 0.9);
      g.fillCircle(-r * 0.27, -r * 0.25, r * 0.035);
      g.fillCircle(r * 0.34, -r * 0.25, r * 0.035);
    }
    g.lineStyle(1.5, COLORS.player.nose, 0.65);
    g.beginPath();
    g.arc(-r * 0.32, -r * 0.22, r * 0.17, Math.PI * 1.1, Math.PI * 1.9);
    g.strokePath();
    g.beginPath();
    g.arc(r * 0.32, -r * 0.22, r * 0.17, Math.PI * 1.1, Math.PI * 1.9);
    g.strokePath();
    g.fillStyle(COLORS.player.dark, 0.6);
    g.fillEllipse(-r * 0.28, -r * 0.4, r * 0.22, r * 0.1);
    g.fillEllipse(r * 0.28, -r * 0.4, r * 0.22, r * 0.1);
    g.lineStyle(1.5, COLORS.player.dark, 0.45);
    g.beginPath();
    g.arc(0, r * 0.32, r * 0.2, 0, Math.PI);
    g.strokePath();
    g.fillStyle(16746632, 0.26);
    g.fillCircle(-r * 0.57, r * 0.18, r * 0.18);
    g.fillCircle(r * 0.57, r * 0.18, r * 0.18);
  }
  function startIdleBounce(baseY) {
    scene.tweens.add({
      targets: playerContainer,
      y: baseY - 7,
      duration: 650,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut"
    });
  }
  function getPlayerWorldPos() {
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
      return { x: ox + midCol * ts + ts / 2, y: potCy - rimR - handleSize * 0.6 };
    }
    if (gs.playerRow === gridSize) {
      return { x: ox + midCol * ts + ts / 2, y: potCy + rimR + handleSize * 0.6 };
    }
    return {
      x: ox + gs.playerCol * ts + ts / 2,
      y: oy + gs.playerRow * ts + ts / 2
    };
  }
  function movePlayerTo(targetX, targetY, onComplete) {
    scene.tweens.killTweensOf(playerContainer);
    const cap = playerContainer;
    const alive = () => cap && !cap.scene === false && cap.active;
    scene.tweens.add({
      targets: cap,
      scaleX: 0.78,
      scaleY: 1.25,
      duration: 55,
      ease: "Power2",
      onComplete: () => {
        if (!alive()) return;
        scene.tweens.add({
          targets: cap,
          x: targetX,
          y: targetY - 10,
          scaleX: 1.18,
          scaleY: 0.82,
          duration: 90,
          ease: "Power1",
          onComplete: () => {
            if (!alive()) return;
            scene.tweens.add({
              targets: cap,
              x: targetX,
              y: targetY,
              scaleX: 1.08,
              scaleY: 0.92,
              duration: 55,
              ease: "Power2",
              onComplete: () => {
                if (!alive()) return;
                scene.tweens.add({
                  targets: cap,
                  scaleX: 1,
                  scaleY: 1,
                  duration: 80,
                  ease: "Elastic.easeOut",
                  onComplete: () => {
                    if (!alive()) return;
                    startIdleBounce(targetY);
                    onComplete == null ? void 0 : onComplete();
                  }
                });
              }
            });
          }
        });
      }
    });
  }
  function pushUndo() {
    gs.undoStack.push({
      playerRow: gs.playerRow,
      playerCol: gs.playerCol,
      ramenCleared: gs.ramenCleared,
      gridStates: snapshotStates(gs.grid)
    });
  }
  function handleUndo() {
    var _a;
    if (!gs || gs.phase !== "playing") return;
    if (gs.undoStack.length === 0) return;
    sfx.undo();
    const entry = gs.undoStack.pop();
    gs.playerRow = entry.playerRow;
    gs.playerCol = entry.playerCol;
    gs.ramenCleared = entry.ramenCleared;
    restoreStates(gs.grid, entry.gridStates);
    const gridSize = gs.grid.length;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const tc = (_a = tileContainers[r]) == null ? void 0 : _a[c];
        if (!tc) continue;
        const tile = gs.grid[r][c];
        if (tile.state === "active") {
          scene.tweens.killTweensOf(tc);
          tc.setScale(1).setAlpha(1);
        }
      }
    }
    scene.tweens.killTweensOf(playerContainer);
    const pos = getPlayerWorldPos();
    playerContainer.x = pos.x;
    playerContainer.y = pos.y;
    scene.tweens.add({
      targets: playerContainer,
      y: pos.y - 6,
      duration: 600,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut"
    });
    updateHUD();
  }
  function handleMove(dir) {
    if (!gs || gs.phase !== "playing") return;
    const gridSize = gs.grid.length;
    let newRow = gs.playerRow;
    let newCol = gs.playerCol;
    switch (dir) {
      case "up":
        newRow--;
        break;
      case "down":
        newRow++;
        break;
      case "left":
        newCol--;
        break;
      case "right":
        newCol++;
        break;
    }
    const isEndMove = newRow === gridSize && newCol === Math.floor(gridSize / 2);
    if (isEndMove) {
      const gridSize2 = gs.grid.length;
      const standingOnRamen = gs.playerRow >= 0 && gs.playerRow < gridSize2 && gs.playerCol >= 0 && gs.playerCol < gridSize2 && gs.grid[gs.playerRow][gs.playerCol].type === "ramen" && gs.grid[gs.playerRow][gs.playerCol].state === "active";
      const effectiveCleared = gs.ramenCleared + (standingOnRamen ? 1 : 0);
      if (effectiveCleared < gs.ramenTotal) {
        shakePlayer();
        return;
      }
      pushUndo();
      const prevRow2 = gs.playerRow;
      const prevCol2 = gs.playerCol;
      applyTileEffect(prevRow2, prevCol2);
      gs.playerRow = newRow;
      gs.playerCol = newCol;
      const pos2 = getPlayerWorldPos();
      movePlayerTo(pos2.x, pos2.y, () => triggerWin());
      return;
    }
    if (newRow < 0 || newRow >= gridSize || newCol < 0 || newCol >= gridSize) {
      shakePlayer();
      return;
    }
    const targetTile = gs.grid[newRow][newCol];
    if (targetTile.type === "broth" || targetTile.state === "sunk") {
      shakePlayer();
      return;
    }
    sfx.step();
    pushUndo();
    const prevRow = gs.playerRow;
    const prevCol = gs.playerCol;
    gs.playerRow = newRow;
    gs.playerCol = newCol;
    applyTileEffect(prevRow, prevCol);
    const pos = getPlayerWorldPos();
    movePlayerTo(pos.x, pos.y);
  }
  function applyTileEffect(r, c) {
    const gridSize = gs.grid.length;
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return;
    const tile = gs.grid[r][c];
    if (tile.type === "ramen" && tile.state === "active") {
      tile.state = "sunk";
      gs.ramenCleared++;
      sfx.sink();
      animateSinkTile(r, c);
      updateHUD();
    }
  }
  function animateSinkTile(r, c) {
    var _a;
    const tc = (_a = tileContainers[r]) == null ? void 0 : _a[c];
    if (!tc) return;
    scene.tweens.add({
      targets: tc,
      scaleX: 0.1,
      scaleY: 0.1,
      alpha: 0,
      duration: 350,
      ease: "Power2"
    });
  }
  function shakePlayer() {
    sfx.invalid();
    scene.tweens.killTweensOf(playerContainer);
    scene.tweens.add({
      targets: playerContainer,
      x: playerContainer.x + 12,
      duration: 60,
      yoyo: true,
      repeat: 3,
      ease: "Linear",
      onComplete: () => {
        const pos = getPlayerWorldPos();
        scene.tweens.add({
          targets: playerContainer,
          y: pos.y - 6,
          duration: 600,
          yoyo: true,
          loop: -1,
          ease: "Sine.easeInOut"
        });
      }
    });
  }
  const WIN_MESSAGES = [
    "SUCH RAMEN!\nVERY CLEAR!\nWOW!!",
    "OISHI DESU!!\nSHIBA APPROVE!",
    "NOODLE\nCOMPLETE!\nGOOD DOG!!",
    "YOU WIN IT!\nVERY NOODLE!\nBEST DOG!!",
    "SO SLURP!\nMUCH FINISH!\nDOGE WIN!!",
    "KANPAI!\nSHIBA IS\nNOODLE HERO!"
  ];
  function triggerWin() {
    gs.phase = "win";
    sfx.win();
    bgm.duck(2.2);
    clearHintPanel();
    showWinFanfare();
  }
  function showWinFanfare() {
    clearOverlay();
    const nextLevel = gs.level + 1;
    const items = [];
    const bg = scene.add.graphics();
    bg.fillStyle(0, 0);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    items.push(bg);
    scene.tweens.add({ targets: bg, alpha: 0.55, duration: 250 });
    const msg = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
    const goldHex = "#" + COLORS.ui.winGold.toString(16).padStart(6, "0");
    const mainText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, msg, {
      fontSize: "72px",
      fontFamily: "Arial Black",
      color: goldHex,
      align: "center",
      stroke: "#2b1a0e",
      strokeThickness: 8,
      lineSpacing: 8
    }).setOrigin(0.5).setScale(0).setDepth(16);
    items.push(mainText);
    scene.tweens.add({
      targets: mainText,
      scaleX: 1,
      scaleY: 1,
      duration: 320,
      ease: "Back.easeOut"
    });
    const levelText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, `- STAGE ${gs.level} KUDASAI -`, {
      fontSize: "30px",
      fontFamily: "Arial",
      color: COLORS.text.secondary,
      align: "center",
      stroke: "#2b1a0e",
      strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0).setDepth(16);
    items.push(levelText);
    scene.tweens.add({ targets: levelText, alpha: 1, duration: 300, delay: 250 });
    const burst = ["🍜", "🐾", "🍜", "✨", "🐕", "🍜", "🐾", "✨"];
    burst.forEach((emoji, i) => {
      const ex = Phaser.Math.Between(80, GAME_WIDTH - 80);
      const ey = Phaser.Math.Between(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.75);
      const et = scene.add.text(ex, ey + 60, emoji, {
        fontSize: `${Phaser.Math.Between(36, 64)}px`,
        fontFamily: "Arial"
      }).setOrigin(0.5).setAlpha(0).setDepth(17);
      items.push(et);
      scene.tweens.add({
        targets: et,
        y: ey - Phaser.Math.Between(60, 160),
        alpha: 1,
        duration: 400,
        delay: 100 + i * 60,
        ease: "Power2",
        onComplete: () => {
          scene.tweens.add({
            targets: et,
            alpha: 0,
            y: et.y - 40,
            duration: 350,
            delay: 400,
            ease: "Power1"
          });
        }
      });
    });
    if (playerContainer) {
      scene.tweens.killTweensOf(playerContainer);
      scene.tweens.add({
        targets: playerContainer,
        scaleX: 2.2,
        scaleY: 2.2,
        angle: 360,
        duration: 500,
        ease: "Back.easeOut",
        onComplete: () => {
          scene.tweens.add({
            targets: playerContainer,
            scaleX: 1.8,
            scaleY: 1.8,
            angle: 0,
            duration: 200,
            ease: "Power1"
          });
        }
      });
    }
    overlayContainer = scene.add.container(0, 0, items);
    overlayContainer.setDepth(15);
    scene.time.delayedCall(1800, () => {
      if (overlayContainer) {
        scene.tweens.add({
          targets: overlayContainer,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            clearOverlay();
            startLevel(nextLevel);
          }
        });
      } else {
        startLevel(nextLevel);
      }
    });
  }
  function buildControlButtons(gridSize) {
    clearHintPanel();
    const btnSize = 80;
    const bx = GAME_WIDTH / 2;
    const by = GAME_HEIGHT - 340;
    const upBtn = makeArrowButton("↑", bx, by - 90, btnSize, () => handleMove("up"));
    const downBtn = makeArrowButton("↓", bx, by + 10, btnSize, () => handleMove("down"));
    const leftBtn = makeArrowButton("←", bx - 100, by - 40, btnSize, () => handleMove("left"));
    const rightBtn = makeArrowButton("→", bx + 100, by - 40, btnSize, () => handleMove("right"));
    const hintBtn = makeButton("HINT", bx + 80, by + 120, 220, 72, COLORS.ui.button, toggleHint);
    const undoBtn = makeButton("UNDO [F]", bx - 130, by + 120, 220, 72, COLORS.bg.secondary, handleUndo);
    const retryBtn = makeButton("RETRY [SPC]", bx, by + 210, 280, 64, COLORS.bg.secondary, retryLevel);
    const controls = scene.add.container(0, 0, [upBtn, downBtn, leftBtn, rightBtn, hintBtn, undoBtn, retryBtn]);
    controls.setDepth(8);
    boardContainer.add(controls);
  }
  function makeArrowButton(label, x, y, size, onClick) {
    const g = scene.make.graphics();
    g.fillStyle(COLORS.ui.button, 1);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, 12);
    g.lineStyle(2, COLORS.ui.border, 1);
    g.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);
    const txt = scene.add.text(0, 0, label, {
      fontSize: "38px",
      fontFamily: "Arial",
      color: COLORS.text.primary
    }).setOrigin(0.5);
    const c = scene.add.container(x, y, [g, txt]);
    c.setSize(size, size);
    c.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      scene.tweens.add({ targets: c, scaleX: 0.88, scaleY: 0.88, duration: 60, yoyo: true });
      onClick();
    });
    return c;
  }
  function toggleHint() {
    if (!gs || gs.phase !== "playing") return;
    gs.showingHint = !gs.showingHint;
    if (gs.showingHint) showHint();
    else clearHintPanel();
  }
  function showHint() {
    clearHintPanel();
    const arrows = {
      up: "↑",
      down: "↓",
      left: "←",
      right: "→"
    };
    const hintText = gs.solution.map((d) => arrows[d]).join(" ");
    const lines = splitHintIntoLines(hintText, 18);
    const joined = lines.join("\n");
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
    const label = scene.add.text(panelX + panelW / 2, panelY + 16, "SOLUTION:", {
      fontSize: "22px",
      fontFamily: "Arial",
      color: COLORS.ui.hintText,
      fontStyle: "bold"
    }).setOrigin(0.5, 0);
    const hint = scene.add.text(panelX + panelW / 2, panelY + 44, joined, {
      fontSize: "26px",
      fontFamily: "Arial",
      color: COLORS.ui.hintText,
      align: "center",
      wordWrap: { width: panelW - 20 }
    }).setOrigin(0.5, 0);
    hintPanel = scene.add.container(0, 0, [bg, label, hint]);
    hintPanel.setDepth(9);
  }
  function splitHintIntoLines(text, charsPerLine) {
    const parts = text.split(" ");
    const lines = [];
    let current = "";
    for (const part of parts) {
      if (current.length + part.length + 1 > charsPerLine && current.length > 0) {
        lines.push(current);
        current = part;
      } else {
        current = current ? current + " " + part : part;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  function clearHintPanel() {
    if (hintPanel) {
      hintPanel.destroy(true);
      hintPanel = null;
    }
  }
  function clearOverlay() {
    if (overlayContainer) {
      overlayContainer.destroy(true);
      overlayContainer = null;
    }
  }
  function makeButton(label, cx, cy, w, h, color, onClick) {
    const g = scene.make.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, COLORS.ui.border, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const txt = scene.add.text(0, 0, label, TEXT_STYLES.button).setOrigin(0.5);
    const c = scene.add.container(cx, cy, [g, txt]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      scene.tweens.add({ targets: c, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
      onClick();
    });
    return c;
  }
  function drawPotIllustration(g, cx, cy, size) {
    const R = size / 2;
    g.fillStyle(COLORS.tile.potWall, 1);
    g.fillCircle(cx, cy, R);
    g.fillStyle(COLORS.broth.base, 1);
    g.fillCircle(cx, cy, R - 18);
    g.lineStyle(2, COLORS.broth.shimmer, 0.28);
    g.strokeCircle(cx, cy, (R - 18) * 0.65);
    g.strokeCircle(cx, cy, (R - 18) * 0.35);
    g.lineStyle(5, 16777215, 0.13);
    g.beginPath();
    g.arc(cx, cy, R - 9, Math.PI * 1.1, Math.PI * 1.6);
    g.strokePath();
    const ingAngles = [0, 0.8, 1.6, 2.4, 3.2, 3.9, 4.7, 5.5];
    const ingTypes = [0, 3, 1, 5, 2, 6, 4, 7];
    for (let i = 0; i < ingAngles.length; i++) {
      const dist = (R - 26) * (i % 2 === 0 ? 0.55 : 0.32);
      const ix = cx + Math.cos(ingAngles[i]) * dist;
      const iy = cy + Math.sin(ingAngles[i]) * dist;
      g.translateCanvas(ix, iy);
      g.fillStyle(0, 0);
      drawIngredient(g, ingTypes[i]);
      g.translateCanvas(-ix, -iy);
    }
    g.fillStyle(COLORS.tile.potHandle, 1);
    g.fillRoundedRect(cx - R - 36, cy - 18, 36, 36, 8);
    g.fillRoundedRect(cx + R, cy - 18, 36, 36, 8);
    g.lineStyle(2, COLORS.tile.startGlow, 0.9);
    g.strokeRoundedRect(cx - R - 36, cy - 18, 36, 36, 8);
    g.lineStyle(2, COLORS.tile.endGlow, 0.9);
    g.strokeRoundedRect(cx + R, cy - 18, 36, 36, 8);
    g.lineStyle(3, COLORS.broth.shimmer, 0.45);
    for (let i = -1; i <= 1; i++) {
      const sx = cx + i * 45;
      g.lineBetween(sx, cy - R - 8, sx - 8, cy - R - 28);
      g.lineBetween(sx - 8, cy - R - 28, sx, cy - R - 48);
    }
  }
  const config = createGameConfig();
  config.scene = { create, update };
  new Phaser.Game(config);
})();
//# sourceMappingURL=game.js.map
