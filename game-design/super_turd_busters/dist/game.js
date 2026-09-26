(function() {
  "use strict";
  const GAME_WIDTH = 786;
  const GAME_HEIGHT = 1704;
  const GRID_PADDING = 40;
  const GRID_TOP = 420;
  const GRID_BOTTOM_MARGIN = 260;
  const COLORS = {
    bg: { primary: 1706542, secondary: 2759230 },
    pipe: { fill: 4890314, stroke: 2780826 },
    wall: { fill: 5917242, stroke: 3811866, grout: 2759178 },
    snake: {
      body: 8952234,
      // steel grey cable
      stroke: 4478310,
      // dark steel outline
      ridge: 11189196,
      // lighter diagonal ridge highlight
      tip: 14544639
      // bright silver drill tip
    },
    toilet: { bowl: 15659250, rim: 13422288, water: 11065584 },
    plumber: {
      skin: 16040586,
      // skin tone
      skinDark: 13931082,
      // shadow / shading
      shirt: 16724770,
      // red shirt
      overalls: 2245802,
      // dark brown hair
      cap: 16724770,
      // red cap
      capBrim: 13378065,
      boots: 2759176,
      // dark brown boots
      mustache: 3809800
      // moustache
    },
    poop: { fill: 9127187, shine: 11558960 },
    button: { fill: 3824298, stroke: 2771594, active: 5929676 },
    ui: {
      lose: 14500932
    }
  };
  const TEXT_STYLES = {
    heading: { fontSize: "48px", fontFamily: "Arial", color: "#ffffff", fontStyle: "bold" },
    button: { fontSize: "44px", fontFamily: "Arial", color: "#ffffff", fontStyle: "bold" }
  };
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
  let ctx = null;
  let masterGain = null;
  let bgmGain = null;
  let bgmRunning = false;
  function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 1;
    bgmGain.connect(masterGain);
  }
  function getCtx() {
    if (!ctx) initAudio();
    return ctx;
  }
  function getMaster() {
    if (!masterGain) initAudio();
    return masterGain;
  }
  function getBgmGain() {
    if (!bgmGain) initAudio();
    return bgmGain;
  }
  function noteHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function envelope(gain, now, attack, sustain, release, peak = 1) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.setValueAtTime(peak, now + attack + sustain);
    gain.gain.linearRampToValueAtTime(0, now + attack + sustain + release);
  }
  function sfxBup() {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(494, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.028);
    const g = ac.createGain();
    envelope(g, now, 2e-3, 0.012, 0.016, 0.13);
    osc.connect(g);
    g.connect(getMaster());
    osc.start(now);
    osc.stop(now + 0.04);
  }
  function sfxBupRewind() {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(370, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.032);
    const g = ac.createGain();
    envelope(g, now, 2e-3, 0.01, 0.018, 0.24);
    osc.connect(g);
    g.connect(getMaster());
    osc.start(now);
    osc.stop(now + 0.04);
  }
  function sfxThud() {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
    const bufLen = Math.floor(ac.sampleRate * 0.08);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noiseSrc = ac.createBufferSource();
    noiseSrc.buffer = buf;
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 350;
    const noiseGain = ac.createGain();
    envelope(noiseGain, now, 2e-3, 0.01, 0.07, 0.18);
    const g = ac.createGain();
    envelope(g, now, 2e-3, 0.02, 0.1, 0.55);
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
  function sfxSquelch() {
    const ac = getCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.32);
    const g = ac.createGain();
    envelope(g, now, 5e-3, 0.12, 0.18, 0.55);
    osc.connect(g);
    g.connect(getMaster());
    osc.start(now);
    osc.stop(now + 0.38);
    const bufLen = Math.floor(ac.sampleRate * 0.3);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const nd = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    const nSrc = ac.createBufferSource();
    nSrc.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700, now);
    bp.frequency.linearRampToValueAtTime(160, now + 0.26);
    bp.Q.value = 2;
    const ng = ac.createGain();
    envelope(ng, now, 4e-3, 0.1, 0.16, 0.38);
    nSrc.connect(bp);
    bp.connect(ng);
    ng.connect(getMaster());
    nSrc.start(now);
    nSrc.stop(now + 0.32);
    const pip = ac.createOscillator();
    pip.type = "square";
    pip.frequency.setValueAtTime(1040, now + 0.04);
    pip.frequency.exponentialRampToValueAtTime(520, now + 0.16);
    const pg = ac.createGain();
    envelope(pg, now + 0.04, 5e-3, 0.06, 0.08, 0.16);
    pip.connect(pg);
    pg.connect(getMaster());
    pip.start(now + 0.04);
    pip.stop(now + 0.22);
  }
  function sfxLevelClear() {
    const ac = getCtx();
    const now = ac.currentTime;
    const DELAY = 0.32;
    const t0 = now + DELAY;
    const duck = getBgmGain().gain;
    const duckEnd = t0 + 1.5;
    const riseEnd = duckEnd + 0.4;
    duck.cancelScheduledValues(now);
    duck.setValueAtTime(duck.value, now);
    duck.linearRampToValueAtTime(0.12, now + 0.08);
    duck.setValueAtTime(0.12, duckEnd);
    duck.linearRampToValueAtTime(1, riseEnd);
    const S = 0.083;
    const E = S * 2;
    const Q = S * 4;
    const mel = (midi, t, dur, vol = 0.32) => {
      const o = ac.createOscillator();
      o.type = "square";
      o.frequency.value = noteHz(midi);
      const g = ac.createGain();
      envelope(g, t, 5e-3, dur * 0.6, dur * 0.35, vol);
      o.connect(g);
      g.connect(getMaster());
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const har = (midi, t, dur, vol = 0.18) => {
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.value = noteHz(midi);
      const g = ac.createGain();
      envelope(g, t, 8e-3, dur * 0.55, dur * 0.38, vol);
      o.connect(g);
      g.connect(getMaster());
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const rim = (t) => {
      const len = Math.floor(ac.sampleRate * 0.06);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3e3;
      const g = ac.createGain();
      envelope(g, t, 1e-3, 0.015, 0.04, 0.3);
      src.connect(hp);
      hp.connect(g);
      g.connect(getMaster());
      src.start(t);
      src.stop(t + 0.07);
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(440, t);
      o.frequency.linearRampToValueAtTime(200, t + 0.03);
      const og = ac.createGain();
      envelope(og, t, 1e-3, 0.01, 0.025, 0.22);
      o.connect(og);
      og.connect(getMaster());
      o.start(t);
      o.stop(t + 0.04);
    };
    let cur = t0;
    mel(77, cur, S);
    har(65, cur, S);
    cur += S;
    mel(81, cur, S);
    har(69, cur, S);
    cur += S;
    mel(84, cur, E);
    har(72, cur, E);
    cur += E;
    mel(81, cur, S);
    har(69, cur, S);
    cur += S;
    mel(79, cur, S);
    har(67, cur, S);
    cur += S;
    mel(81, cur, S);
    har(69, cur, S);
    cur += S;
    mel(84, cur, S);
    har(72, cur, S);
    cur += S;
    mel(86, cur, S);
    har(74, cur, S);
    cur += S;
    rim(cur);
    mel(89, cur, Q, 0.38);
    har(77, cur, Q, 0.22);
    cur += Q * 0.5;
    const chordT = cur + Q * 0.55;
    [77, 81, 84, 89].forEach((midi) => mel(midi, chordT, Q * 1.6, 0.22));
    [65, 69, 72, 77].forEach((midi) => har(midi, chordT, Q * 1.6, 0.14));
    rim(chordT);
    const flushStart = t0 + 0.1;
    const flushLen = 1.2;
    const fbufLen = Math.floor(ac.sampleRate * flushLen);
    const fbuf = ac.createBuffer(1, fbufLen, ac.sampleRate);
    const fd = fbuf.getChannelData(0);
    for (let i = 0; i < fbufLen; i++) fd[i] = Math.random() * 2 - 1;
    const fSrc = ac.createBufferSource();
    fSrc.buffer = fbuf;
    const fBP = ac.createBiquadFilter();
    fBP.type = "bandpass";
    fBP.frequency.setValueAtTime(2400, flushStart);
    fBP.frequency.exponentialRampToValueAtTime(120, flushStart + flushLen);
    fBP.Q.value = 1.8;
    const fLP = ac.createBiquadFilter();
    fLP.type = "lowpass";
    fLP.frequency.setValueAtTime(3e3, flushStart);
    fLP.frequency.exponentialRampToValueAtTime(300, flushStart + flushLen);
    const fg = ac.createGain();
    envelope(fg, flushStart, 0.05, flushLen * 0.45, flushLen * 0.5, 0.28);
    fSrc.connect(fBP);
    fBP.connect(fLP);
    fLP.connect(fg);
    fg.connect(getMaster());
    fSrc.start(flushStart);
    fSrc.stop(flushStart + flushLen + 0.05);
    for (let b = 0; b < 5; b++) {
      const bt = flushStart + 0.08 + b * 0.16;
      const bo = ac.createOscillator();
      bo.type = "sine";
      bo.frequency.setValueAtTime(360 - b * 30, bt);
      bo.frequency.linearRampToValueAtTime(160 - b * 18, bt + 0.1);
      const bg = ac.createGain();
      envelope(bg, bt, 5e-3, 0.04, 0.06, 0.1);
      bo.connect(bg);
      bg.connect(getMaster());
      bo.start(bt);
      bo.stop(bt + 0.14);
    }
  }
  const BPM = 175;
  const BEAT = 60 / BPM;
  const STEP = BEAT / 4;
  const LOOKAHEAD = STEP * 4;
  const SCHEDULE = STEP * 3;
  const MELODY_NOTES = [
    // ── Section A (bars 1–8): energetic hook ─────────────────────────────────
    // Bar 1 — opening run up
    74,
    0,
    78,
    0,
    81,
    0,
    83,
    0,
    81,
    78,
    76,
    74,
    0,
    0,
    0,
    0,
    // Bar 2 — sequence down with syncopation
    78,
    0,
    76,
    74,
    76,
    0,
    0,
    74,
    71,
    0,
    74,
    0,
    76,
    74,
    71,
    0,
    // Bar 3 — rising phrase
    74,
    0,
    76,
    0,
    78,
    0,
    81,
    0,
    83,
    0,
    81,
    83,
    86,
    0,
    0,
    0,
    // Bar 4 — answer phrase, cadence
    83,
    0,
    81,
    78,
    76,
    0,
    78,
    0,
    0,
    76,
    74,
    0,
    71,
    0,
    69,
    0,
    // Bar 5 — hook repeat with variation
    74,
    0,
    78,
    0,
    81,
    83,
    81,
    0,
    78,
    0,
    76,
    78,
    81,
    0,
    0,
    0,
    // Bar 6 — busier run
    76,
    74,
    76,
    78,
    81,
    0,
    78,
    76,
    74,
    76,
    74,
    71,
    74,
    0,
    0,
    0,
    // Bar 7 — build up
    78,
    0,
    81,
    0,
    83,
    0,
    86,
    0,
    88,
    86,
    83,
    81,
    83,
    0,
    0,
    0,
    // Bar 8 — turnaround back to top
    81,
    0,
    78,
    76,
    74,
    0,
    71,
    0,
    69,
    0,
    71,
    74,
    76,
    0,
    0,
    0,
    // ── Section B (bars 9–16): secondary theme ────────────────────────────────
    // Bar 9 — new melodic idea, stepwise
    83,
    0,
    0,
    83,
    81,
    83,
    81,
    78,
    76,
    0,
    78,
    0,
    81,
    0,
    0,
    0,
    // Bar 10
    78,
    0,
    76,
    0,
    74,
    76,
    74,
    71,
    69,
    0,
    71,
    0,
    74,
    0,
    0,
    0,
    // Bar 11 — call
    76,
    0,
    78,
    0,
    81,
    0,
    83,
    81,
    78,
    76,
    74,
    0,
    0,
    74,
    76,
    0,
    // Bar 12 — response
    78,
    0,
    81,
    83,
    81,
    0,
    78,
    0,
    76,
    0,
    74,
    76,
    78,
    0,
    0,
    0,
    // Bar 13 — energetic run
    74,
    76,
    78,
    81,
    83,
    81,
    78,
    76,
    74,
    0,
    76,
    0,
    78,
    81,
    83,
    0,
    // Bar 14 — winding down phrase
    81,
    0,
    78,
    0,
    76,
    0,
    74,
    0,
    71,
    0,
    69,
    71,
    74,
    0,
    0,
    0,
    // Bar 15 — build to ending
    78,
    0,
    81,
    0,
    83,
    0,
    86,
    83,
    81,
    83,
    81,
    78,
    76,
    0,
    78,
    0,
    // Bar 16 — final turnaround
    81,
    78,
    76,
    74,
    71,
    0,
    69,
    0,
    71,
    74,
    76,
    78,
    81,
    0,
    0,
    0
  ];
  const COUNTER_NOTES = [
    // Section A
    71,
    0,
    74,
    0,
    78,
    0,
    81,
    0,
    78,
    74,
    71,
    69,
    0,
    0,
    0,
    0,
    74,
    0,
    71,
    69,
    71,
    0,
    0,
    71,
    66,
    0,
    69,
    0,
    71,
    69,
    66,
    0,
    71,
    0,
    74,
    0,
    76,
    0,
    78,
    0,
    81,
    0,
    78,
    81,
    83,
    0,
    0,
    0,
    81,
    0,
    78,
    74,
    71,
    0,
    74,
    0,
    0,
    71,
    69,
    0,
    66,
    0,
    64,
    0,
    71,
    0,
    74,
    0,
    78,
    81,
    78,
    0,
    74,
    0,
    71,
    74,
    78,
    0,
    0,
    0,
    71,
    69,
    71,
    74,
    78,
    0,
    74,
    71,
    69,
    71,
    69,
    66,
    69,
    0,
    0,
    0,
    74,
    0,
    78,
    0,
    81,
    0,
    83,
    0,
    86,
    83,
    81,
    78,
    81,
    0,
    0,
    0,
    78,
    0,
    74,
    71,
    69,
    0,
    66,
    0,
    64,
    0,
    66,
    69,
    71,
    0,
    0,
    0,
    // Section B
    81,
    0,
    0,
    81,
    78,
    81,
    78,
    74,
    71,
    0,
    74,
    0,
    78,
    0,
    0,
    0,
    74,
    0,
    71,
    0,
    69,
    71,
    69,
    66,
    64,
    0,
    66,
    0,
    69,
    0,
    0,
    0,
    71,
    0,
    74,
    0,
    78,
    0,
    81,
    78,
    74,
    71,
    69,
    0,
    0,
    69,
    71,
    0,
    74,
    0,
    78,
    81,
    78,
    0,
    74,
    0,
    71,
    0,
    69,
    71,
    74,
    0,
    0,
    0,
    69,
    71,
    74,
    78,
    81,
    78,
    74,
    71,
    69,
    0,
    71,
    0,
    74,
    78,
    81,
    0,
    78,
    0,
    74,
    0,
    71,
    0,
    69,
    0,
    66,
    0,
    64,
    66,
    69,
    0,
    0,
    0,
    74,
    0,
    78,
    0,
    81,
    0,
    83,
    81,
    78,
    81,
    78,
    74,
    71,
    0,
    74,
    0,
    78,
    74,
    71,
    69,
    66,
    0,
    64,
    0,
    66,
    69,
    71,
    74,
    78,
    0,
    0,
    0
  ];
  const ARP_NOTES = [
    // bar 1–2: D  D  D  D  | A  A  A  A
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    // bar 3–4: G  G  G  G  | A  A  A  A
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    // bar 5–6: D  D  D  D  | Bm Bm Bm Bm (B3=59,D4=62,F#4=66)
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    // bar 7–8: G  G  G  G  | A  A  A  A
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    // bar 9–16: repeat same chord pattern
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    69,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    0,
    66,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    62,
    0,
    55,
    0,
    59,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61,
    0,
    64,
    0,
    57,
    0,
    61
  ];
  const BASS_NOTES = [
    // Section A (bars 1–8)
    50,
    50,
    57,
    57,
    // bar 1:  D3 D3 A3 A3
    50,
    50,
    57,
    45,
    // bar 2:  D3 D3 A3 A2
    43,
    43,
    57,
    57,
    // bar 3:  G2 G2 A2 A2  (wait—let's keep in D octave)
    50,
    50,
    57,
    57,
    // bar 4:  D3 D3 A3 A3  (reuse pattern)
    50,
    50,
    59,
    57,
    // bar 5:  D3 D3 B3 A3
    47,
    47,
    50,
    50,
    // bar 6:  B2 B2 D3 D3
    43,
    43,
    57,
    57,
    // bar 7:  G2 G2 A3 A3
    50,
    45,
    43,
    45,
    // bar 8:  D3 A2 G2 A2 (turnaround)
    // Section B (bars 9–16)
    50,
    57,
    50,
    57,
    // bar 9
    50,
    50,
    43,
    45,
    // bar 10
    47,
    47,
    50,
    57,
    // bar 11
    50,
    57,
    47,
    50,
    // bar 12
    50,
    50,
    57,
    57,
    // bar 13
    47,
    50,
    43,
    45,
    // bar 14
    43,
    43,
    57,
    57,
    // bar 15
    50,
    45,
    43,
    45
    // bar 16 (turnaround back to top)
  ];
  const DRUM_PATTERN = [
    "K",
    "H",
    "H",
    "H",
    "S",
    "H",
    "H",
    "H",
    "K",
    "H",
    "K",
    "H",
    "S",
    "H",
    "H",
    "H"
  ];
  function playSquareNote(ac, out, hz, t, dur, vol = 0.18) {
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.value = hz;
    const g = ac.createGain();
    envelope(g, t, 8e-3, dur * 0.6, dur * 0.35, vol);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function playTriNote(ac, out, hz, t, dur, vol = 0.22) {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const g = ac.createGain();
    envelope(g, t, 0.01, dur * 0.65, dur * 0.3, vol);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function playKick(ac, out, t) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ac.createGain();
    envelope(g, t, 3e-3, 0.05, 0.1, 0.55);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }
  function playSnare(ac, out, t) {
    const bufLen = Math.floor(ac.sampleRate * 0.12);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const g = ac.createGain();
    envelope(g, t, 2e-3, 0.025, 0.07, 0.28);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.12);
    const body = ac.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(220, t);
    body.frequency.linearRampToValueAtTime(110, t + 0.05);
    const bg2 = ac.createGain();
    envelope(bg2, t, 2e-3, 0.02, 0.05, 0.18);
    body.connect(bg2);
    bg2.connect(out);
    body.start(t);
    body.stop(t + 0.08);
  }
  function playHihat(ac, out, t) {
    const bufLen = Math.floor(ac.sampleRate * 0.04);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7e3;
    const g = ac.createGain();
    envelope(g, t, 1e-3, 0.01, 0.025, 0.14);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.045);
  }
  function startBGM(ac, out) {
    const melGain = ac.createGain();
    melGain.gain.value = 0.85;
    melGain.connect(out);
    const ctrGain = ac.createGain();
    ctrGain.gain.value = 0.55;
    ctrGain.connect(out);
    const arpGain = ac.createGain();
    arpGain.gain.value = 0.3;
    arpGain.connect(out);
    const basGain = ac.createGain();
    basGain.gain.value = 0.8;
    basGain.connect(out);
    const drumGain = ac.createGain();
    drumGain.gain.value = 0.7;
    drumGain.connect(out);
    const totalSteps = MELODY_NOTES.length;
    const totalBeats = BASS_NOTES.length;
    const totalArp = ARP_NOTES.length;
    const drumSteps = DRUM_PATTERN.length;
    let stepIdx = 0;
    let beatIdx = 0;
    let nextTime = ac.currentTime + 0.05;
    let stopped = false;
    function schedule() {
      if (stopped) return;
      while (nextTime < ac.currentTime + LOOKAHEAD) {
        const t = nextTime;
        const si = stepIdx % totalSteps;
        const mMidi = MELODY_NOTES[si];
        if (mMidi > 0) playSquareNote(ac, melGain, noteHz(mMidi), t, STEP * 0.78);
        const cMidi = COUNTER_NOTES[si];
        if (cMidi > 0) playTriNote(ac, ctrGain, noteHz(cMidi), t, STEP * 0.72, 0.14);
        const aMidi = ARP_NOTES[stepIdx % totalArp];
        if (aMidi > 0) playTriNote(ac, arpGain, noteHz(aMidi), t, STEP * 0.45, 0.18);
        if (stepIdx % 4 === 0) {
          const bMidi = BASS_NOTES[beatIdx % totalBeats];
          if (bMidi > 0) playTriNote(ac, basGain, noteHz(bMidi), t, BEAT * 0.88, 0.28);
          beatIdx++;
        }
        const hit = DRUM_PATTERN[stepIdx % drumSteps];
        if (hit === "K") playKick(ac, drumGain, t);
        else if (hit === "S") playSnare(ac, drumGain, t);
        else if (hit === "H") playHihat(ac, drumGain, t);
        stepIdx++;
        nextTime += STEP;
      }
    }
    const intervalId = window.setInterval(schedule, SCHEDULE * 1e3);
    schedule();
    return {
      stop() {
        stopped = true;
        window.clearInterval(intervalId);
      }
    };
  }
  function startMusic() {
    if (bgmRunning) return;
    const ac = getCtx();
    if (ac.state === "suspended") ac.resume();
    startBGM(ac, getBgmGain());
    bgmRunning = true;
  }
  function difficultyFor(level) {
    let cols, rows;
    if (level === 1) {
      cols = 3;
      rows = 4;
    } else if (level === 2) {
      cols = 3;
      rows = 4;
    } else if (level <= 4) {
      cols = 4;
      rows = 5;
    } else if (level <= 6) {
      cols = 4;
      rows = 6;
    } else if (level <= 9) {
      cols = 5;
      rows = 7;
    } else if (level <= 12) {
      cols = 5;
      rows = 8;
    } else if (level <= 15) {
      cols = 6;
      rows = 9;
    } else if (level <= 18) {
      cols = 7;
      rows = 10;
    } else {
      cols = 8;
      rows = 11;
    }
    let poopCount;
    if (level <= 2) poopCount = 1;
    else if (level <= 6) poopCount = 2;
    else if (level <= 12) poopCount = 3;
    else if (level <= 18) poopCount = 4;
    else if (level <= 24) poopCount = 5;
    else poopCount = 6;
    const maxWalls = Math.floor(cols * rows * 0.28);
    const rawWalls = level === 1 ? 0 : Math.floor(level * 0.65);
    const extraWalls = Math.min(rawWalls, maxWalls);
    const minInputs = Math.max(2, poopCount * 2 + Math.floor(level / 6));
    return { cols, rows, extraWalls, minInputs, poopCount };
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s, 1664525) + 1013904223 >>> 0;
      return s / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function simulateSlide(grid, rows, cols, head, body, dir, toiletCol) {
    const dr = dir === "down" ? 1 : dir === "up" ? -1 : 0;
    const dc = dir === "right" ? 1 : dir === "left" ? -1 : 0;
    const bodySet = new Set(body.map((b) => `${b.row},${b.col}`));
    const passed = [];
    let pr = head.row, pc = head.col;
    while (true) {
      const nr = pr + dr, nc = pc + dc;
      if (nr < -1) break;
      if (nr >= rows || nc < 0 || nc >= cols) break;
      if (nr === -1 && nc !== toiletCol) break;
      if (nr === -1 && pc !== toiletCol) break;
      if (nr >= 0 && grid[nr][nc] === "wall") break;
      if (bodySet.has(`${nr},${nc}`)) break;
      pr = nr;
      pc = nc;
      passed.push({ row: pr, col: pc });
    }
    return { stops: { row: pr, col: pc }, passed };
  }
  function bfsSolve(grid, rows, cols, toiletCol, poopCells, minInputs, maxInputs) {
    const allDirs = ["down", "right", "left", "up"];
    const allCleared = (1 << poopCells.length) - 1;
    const encodeState = (head, body, cleared) => {
      const sorted = body.map((b) => `${b.row},${b.col}`).sort().join("|");
      return `${head.row},${head.col};${cleared};${sorted}`;
    };
    const initHead = { row: -1, col: toiletCol };
    const initBody = [initHead];
    const queue = [{ head: initHead, body: initBody, dirs: [], cleared: 0 }];
    const seen = /* @__PURE__ */ new Set();
    seen.add(encodeState(initHead, initBody, 0));
    while (queue.length > 0) {
      const { head, body, dirs, cleared } = queue.shift();
      if (dirs.length >= maxInputs) continue;
      for (const dir of allDirs) {
        const { stops, passed } = simulateSlide(grid, rows, cols, head, body, dir, toiletCol);
        if (stops.row === head.row && stops.col === head.col && passed.length === 0) continue;
        const newBody = [...passed, ...body];
        const newDirs = [...dirs, dir];
        const allCells = [...passed, stops];
        let newCleared = cleared;
        for (const cell of allCells) {
          for (let i = 0; i < poopCells.length; i++) {
            if (!(newCleared & 1 << i) && cell.row === poopCells[i].row && cell.col === poopCells[i].col) {
              newCleared |= 1 << i;
            }
          }
        }
        if (newCleared === allCleared && newDirs.length >= minInputs) {
          return newDirs;
        }
        if (newCleared === allCleared) continue;
        const key = encodeState(stops, newBody, newCleared);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ head: stops, body: newBody, dirs: newDirs, cleared: newCleared });
      }
    }
    return null;
  }
  function levelFingerprint(grid, rows, cols, toiletCol, poopCells) {
    const cells = grid.map((r) => r.map((c) => c[0]).join("")).join("/");
    const poops = poopCells.map((p) => `${p.row},${p.col}`).join("+");
    return `${cols}x${rows}|t${toiletCol}|p${poops}|${cells}`;
  }
  const seenLevelLayouts = /* @__PURE__ */ new Set();
  function generateLevel(level) {
    const { cols, rows, extraWalls, minInputs, poopCount } = difficultyFor(level);
    const safeMin = Math.max(2, minInputs);
    const maxInputs = safeMin + 5;
    for (let attempt = 0; attempt < 120; attempt++) {
      const rand = rng(level * 251 + attempt * 997 + 13);
      const toiletCol2 = Math.floor(rand() * cols);
      const grid2 = Array.from(
        { length: rows },
        () => Array(cols).fill("empty")
      );
      grid2[0][toiletCol2] = "toilet";
      const poopCells2 = [];
      const usedKeys = /* @__PURE__ */ new Set([`0,${toiletCol2}`]);
      let placedPoops = 0;
      let poopAttempts = 0;
      while (placedPoops < poopCount && poopAttempts < 50) {
        poopAttempts++;
        const pr = 1 + Math.floor(rand() * (rows - 1));
        const pc = Math.floor(rand() * cols);
        const key = `${pr},${pc}`;
        if (usedKeys.has(key)) continue;
        usedKeys.add(key);
        grid2[pr][pc] = "poop";
        poopCells2.push({ row: pr, col: pc });
        placedPoops++;
      }
      if (poopCells2.length < poopCount) continue;
      const candidates = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid2[r][c] === "empty") candidates.push({ row: r, col: c });
        }
      }
      shuffle(candidates, rand);
      for (let i = 0; i < extraWalls && i < candidates.length; i++) {
        grid2[candidates[i].row][candidates[i].col] = "wall";
      }
      const solution = bfsSolve(grid2, rows, cols, toiletCol2, poopCells2, safeMin, maxInputs);
      if (!solution) continue;
      const fp = levelFingerprint(grid2, rows, cols, toiletCol2, poopCells2);
      if (seenLevelLayouts.has(fp)) continue;
      seenLevelLayouts.add(fp);
      return { grid: grid2, cols, rows, toiletCol: toiletCol2, poopCells: poopCells2, solution };
    }
    const toiletCol = 0;
    const grid = Array.from(
      { length: rows },
      () => Array(cols).fill("empty")
    );
    grid[0][toiletCol] = "toilet";
    const poopCells = [{ row: rows - 1, col: 0 }];
    grid[rows - 1][0] = "poop";
    if (poopCount > 1 && cols > 1) {
      grid[rows - 1][cols - 1] = "poop";
      poopCells.push({ row: rows - 1, col: cols - 1 });
    }
    if (rows > 2) grid[Math.floor(rows / 2)][toiletCol] = "wall";
    const fallbackSolution = bfsSolve(grid, rows, cols, toiletCol, poopCells, 2, 10) ?? ["down", "right"];
    return { grid, cols, rows, toiletCol, poopCells, solution: fallbackSolution };
  }
  function buildState(level, levelNum) {
    const grid = level.grid.map((row) => [...row]);
    const snake = [{ row: -1, col: level.toiletCol }];
    return {
      level: levelNum,
      snake,
      direction: "down",
      grid,
      cols: level.cols,
      rows: level.rows,
      toiletCol: level.toiletCol,
      poopCells: level.poopCells,
      clearedPoopKeys: [],
      moving: false,
      won: false,
      lost: false
    };
  }
  function applyDirection(state, dir) {
    if (state.moving || state.won || state.lost) return state;
    return { ...state, direction: dir, moving: true };
  }
  function stepSnake(state) {
    const { snake, direction, grid, rows, cols, poopCells, clearedPoopKeys } = state;
    const head = snake[0];
    const dr = direction === "down" ? 1 : direction === "up" ? -1 : 0;
    const dc = direction === "right" ? 1 : direction === "left" ? -1 : 0;
    const nr = head.row + dr;
    const nc = head.col + dc;
    if (nr < -1 || nr >= rows || nc < 0 || nc >= cols) return { ...state, moving: false };
    if (nr === -1 && nc !== state.toiletCol) return { ...state, moving: false };
    const cell = nr >= 0 ? grid[nr][nc] : "empty";
    if (nr >= 0 && cell === "wall") return { ...state, moving: false };
    const hitSelf = snake.some((s) => s.row === nr && s.col === nc);
    if (hitSelf) return { ...state, moving: false };
    const newSnake = [{ row: nr, col: nc }, ...snake];
    const newGrid = grid.map((r) => [...r]);
    if (nr >= 0) newGrid[nr][nc] = "snake";
    const cellKey = `${nr},${nc}`;
    const isPoop = poopCells.some((p) => p.row === nr && p.col === nc);
    const alreadyCleared = clearedPoopKeys.includes(cellKey);
    if (isPoop && !alreadyCleared) {
      const newCleared = [...clearedPoopKeys, cellKey];
      const won = newCleared.length >= poopCells.length;
      return { ...state, snake: newSnake, grid: newGrid, clearedPoopKeys: newCleared, moving: !won, won };
    }
    return { ...state, snake: newSnake, grid: newGrid, moving: true };
  }
  let scene;
  let gs;
  let currentLevel = 1;
  let cellSize = 80;
  let gridOffsetX = 0;
  let gridOffsetY = 0;
  let gridGraphics;
  let snakeGraphics;
  let overlayGroup;
  let levelTexts = [];
  let msgText;
  let stepTimer = 0;
  const STEP_DELAY = 70;
  const STEP_DELAY_UNDO = 35;
  let currentStepDelay = STEP_DELAY;
  let stateHistory = [];
  let currentSolution = [];
  let hintOverlay = null;
  let winOverlay = null;
  let currentLevelData = null;
  let rewindCells = [];
  let rewindTargetState = null;
  let lastCompletedDir = null;
  let queuedDir = null;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let plumberArmPhase = 0;
  let plumberArmActive = false;
  let particleGraphics = [];
  function create() {
    scene = this;
    this.rexUI;
    const reg = this.registry.get("startLevel");
    currentLevel = typeof reg === "number" && reg >= 1 ? reg : 1;
    seenLevelLayouts.clear();
    const bgGfx = this.add.graphics();
    bgGfx.fillGradientStyle(COLORS.bg.primary, COLORS.bg.primary, COLORS.bg.secondary, COLORS.bg.secondary, 1);
    bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const pipeGfx = this.add.graphics();
    pipeGfx.lineStyle(3, COLORS.pipe.stroke, 0.3);
    for (let x = 0; x < GAME_WIDTH; x += 60) pipeGfx.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 60) pipeGfx.lineBetween(0, y, GAME_WIDTH, y);
    msgText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "", {
      ...TEXT_STYLES.heading,
      fontSize: "64px"
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
    gridGraphics = this.add.graphics();
    snakeGraphics = this.add.graphics();
    overlayGroup = this.add.group();
    buildControls(this);
    this.input.on("pointerdown", (p) => {
      pointerDownX = p.x;
      pointerDownY = p.y;
    });
    this.input.on("pointerup", (p) => {
      const dx = p.x - pointerDownX;
      const dy = p.y - pointerDownY;
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      const SWIPE_MIN = 30;
      if (absDx < SWIPE_MIN && absDy < SWIPE_MIN) return;
      if (absDx > absDy) {
        handleDirInput(dx > 0 ? "right" : "left");
      } else {
        handleDirInput(dy > 0 ? "down" : "up");
      }
    });
    const keys = this.input.keyboard.createCursorKeys();
    const wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.on("keydown", (evt) => {
      if (keys.left.isDown || wasd.A.isDown) {
        handleDirInput("left");
        return;
      }
      if (keys.right.isDown || wasd.D.isDown) {
        handleDirInput("right");
        return;
      }
      if (keys.up.isDown || wasd.W.isDown) {
        handleDirInput("up");
        return;
      }
      if (keys.down.isDown || wasd.S.isDown) {
        handleDirInput("down");
        return;
      }
    });
    loadLevel(currentLevel);
    initAudio();
    startMusic();
    const backGfx = this.add.graphics().setDepth(50);
    const BW = 180, BH = 60;
    const BX = BW / 2 + 12, BY = BH / 2 + 12;
    const drawBack = (pressed) => {
      backGfx.clear();
      backGfx.fillStyle(pressed ? 2759230 : 1706542, 0.88);
      backGfx.fillRoundedRect(BX - BW / 2, BY - BH / 2, BW, BH, 10);
      backGfx.lineStyle(2, 6702250, 1);
      backGfx.strokeRoundedRect(BX - BW / 2, BY - BH / 2, BW, BH, 10);
    };
    drawBack(false);
    this.add.text(BX, BY, "◀ LEVELS", {
      fontSize: "26px",
      fontFamily: "Arial Black, Arial",
      color: "#aaaaff",
      stroke: "#000000",
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(51);
    const backZone = this.add.zone(BX, BY, BW, BH).setInteractive({ useHandCursor: true }).setDepth(52);
    backZone.on("pointerdown", () => drawBack(true));
    backZone.on("pointerup", () => {
      drawBack(false);
      this.scene.start("LevelSelect");
    });
    backZone.on("pointerout", () => drawBack(false));
  }
  function update(_time, delta) {
    const wasActive = plumberArmActive;
    plumberArmActive = !!(gs && (gs.moving || rewindCells.length > 0));
    if (plumberArmActive) {
      plumberArmPhase = (plumberArmPhase + delta / 300) % 1;
      drawGrid();
    } else if (wasActive) {
      plumberArmPhase = 0;
      drawGrid();
    }
    if (rewindCells.length > 0) {
      stepTimer += delta;
      if (stepTimer >= STEP_DELAY_UNDO) {
        stepTimer = 0;
        rewindCells.shift();
        sfxBupRewind();
        const targetLen = rewindTargetState ? rewindTargetState.snake.length : 0;
        if (rewindCells.length <= targetLen) {
          gs = rewindTargetState;
          rewindTargetState = null;
          rewindCells = [];
          currentStepDelay = STEP_DELAY;
          drawGrid();
          drawSnake();
        } else {
          const savedSnake = gs.snake;
          gs = { ...gs, snake: rewindCells };
          drawSnake();
          gs = { ...gs, snake: savedSnake };
        }
      }
      return;
    }
    if (!gs || !gs.moving) return;
    stepTimer += delta;
    if (stepTimer >= currentStepDelay) {
      stepTimer = 0;
      const prevMoving = gs.moving;
      const prevCleared = gs.clearedPoopKeys.length;
      gs = stepSnake(gs);
      drawSnake();
      sfxBup();
      if (gs.clearedPoopKeys.length > prevCleared) {
        sfxSquelch();
        const newKey = gs.clearedPoopKeys[gs.clearedPoopKeys.length - 1];
        const [pr, pc] = newKey.split(",").map(Number);
        spawnPoopBurst(pr, pc);
      }
      const headMoved = gs.snake[0].row !== (stateHistory.length > 0 ? stateHistory[stateHistory.length - 1].snake[0].row : -1) || gs.snake[0].col !== (stateHistory.length > 0 ? stateHistory[stateHistory.length - 1].snake[0].col : gs.toiletCol);
      if (prevMoving && !gs.moving && !gs.won && !gs.lost && headMoved) {
        sfxThud();
        stateHistory.push(gs);
        lastCompletedDir = gs.direction;
        drawGrid();
        if (queuedDir !== null) {
          const next = queuedDir;
          queuedDir = null;
          const { passed } = simulateSlide(
            gs.grid,
            gs.rows,
            gs.cols,
            gs.snake[0],
            gs.snake,
            next,
            gs.toiletCol
          );
          if (passed.length > 0) {
            gs.clearedPoopKeys.length;
            gs = applyDirection(gs, next);
            stepTimer = 0;
          } else {
            sfxThud();
          }
        }
      }
      if (gs.won) {
        sfxLevelClear();
        spawnWinSplash();
        saveBestLevel(Math.max(loadBestLevel(), currentLevel + 1));
        showWinOverlay(() => {
          currentLevel++;
          loadLevel(currentLevel);
        });
      } else if (gs.lost) {
        showMessage("💀 OOPS!", COLORS.ui.lose, () => {
          loadLevel(currentLevel);
        });
      }
    }
  }
  function loadLevel(levelNum) {
    const level = generateLevel(levelNum);
    currentLevelData = level;
    gs = buildState(level, levelNum);
    currentSolution = level.solution;
    if (hintOverlay) {
      hintOverlay.destroy();
      hintOverlay = null;
    }
    if (winOverlay) {
      winOverlay.destroy();
      winOverlay = null;
    }
    const availW = GAME_WIDTH - GRID_PADDING * 2;
    const availH = GAME_HEIGHT - GRID_TOP - GRID_BOTTOM_MARGIN;
    cellSize = Math.floor(Math.min(availW / gs.cols, availH / gs.rows));
    cellSize = Math.max(cellSize, 60);
    const gridW = cellSize * gs.cols;
    cellSize * gs.rows;
    gridOffsetX = Math.floor((GAME_WIDTH - gridW) / 2);
    gridOffsetY = GRID_TOP;
    for (const t of levelTexts) {
      if (t.active) t.destroy();
    }
    const sceneTop = gridOffsetY - cellSize * 2.2;
    const labelY = sceneTop + 48;
    levelTexts = makeSF2Texts(
      scene,
      `LEVEL ${levelNum}`,
      GAME_WIDTH / 2,
      labelY,
      "#ffdd22",
      "#aa6600",
      "58px",
      6
    );
    msgText.setAlpha(0).setText("");
    stepTimer = 0;
    currentStepDelay = STEP_DELAY;
    stateHistory = [];
    queuedDir = null;
    rewindCells = [];
    rewindTargetState = null;
    lastCompletedDir = null;
    plumberArmPhase = 0;
    plumberArmActive = false;
    for (const pg of particleGraphics) {
      if (pg.active) pg.destroy();
    }
    particleGraphics = [];
    scene.tweens.killTweensOf(msgText);
    overlayGroup.clear(true, true);
    drawGrid();
    drawSnake();
  }
  function drawGrid() {
    gridGraphics.clear();
    const { grid, rows, cols } = gs;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gridOffsetX + c * cellSize;
        const y = gridOffsetY + r * cellSize;
        const cell = grid[r][c];
        const showFill = cell === "empty" || cell === "snake" || cell === "toilet";
        gridGraphics.fillStyle(COLORS.pipe.fill, showFill ? 0.18 : 0);
        gridGraphics.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        gridGraphics.lineStyle(1, COLORS.pipe.stroke, 0.25);
        gridGraphics.strokeRect(x, y, cellSize, cellSize);
        if (cell === "wall") {
          drawWall(gridGraphics, x, y);
        }
      }
    }
    drawToilet(gridOffsetX + gs.toiletCol * cellSize);
    for (const p of gs.poopCells) {
      const key = `${p.row},${p.col}`;
      if (!gs.clearedPoopKeys.includes(key)) {
        drawPoop(gridOffsetX + p.col * cellSize, gridOffsetY + p.row * cellSize, p.row, p.col);
      }
    }
  }
  function cellCenter(row, col) {
    return {
      cx: gridOffsetX + col * cellSize + cellSize / 2,
      cy: gridOffsetY + row * cellSize + cellSize / 2
      // row -1 → one cell above gridOffsetY
    };
  }
  function drawSnake() {
    snakeGraphics.clear();
    const { snake, direction, poopCells, clearedPoopKeys } = gs;
    if (snake.length === 0) return;
    const clearedSet = new Set(clearedPoopKeys);
    const poopKeySet = new Set(poopCells.map((p) => `${p.row},${p.col}`));
    const cableW = cellSize * 0.38;
    const ridgeW = cellSize * 0.08;
    const ridgeSpacing = cellSize * 0.28;
    for (let i = snake.length - 1; i >= 1; i--) {
      const { cx: ax, cy: ay } = cellCenter(snake[i].row, snake[i].col);
      const { cx: bx, cy: by } = cellCenter(snake[i - 1].row, snake[i - 1].col);
      snakeGraphics.lineStyle(cableW + 6, COLORS.snake.stroke, 1);
      snakeGraphics.lineBetween(ax, ay, bx, by);
      snakeGraphics.lineStyle(cableW, COLORS.snake.body, 1);
      snakeGraphics.lineBetween(ax, ay, bx, by);
    }
    for (let i = snake.length - 1; i >= 1; i--) {
      const { cx: ax, cy: ay } = cellCenter(snake[i].row, snake[i].col);
      const { cx: bx, cy: by } = cellCenter(snake[i - 1].row, snake[i - 1].col);
      const segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
      if (segLen < 1) continue;
      const ux = (bx - ax) / segLen;
      const uy = (by - ay) / segLen;
      const px = -uy, py = ux;
      const halfW = cableW * 0.45;
      const numRidges = Math.max(1, Math.floor(segLen / ridgeSpacing));
      snakeGraphics.lineStyle(ridgeW, COLORS.snake.ridge, 0.7);
      for (let r = 0; r <= numRidges; r++) {
        const t = r / numRidges * segLen;
        const mx = ax + ux * t;
        const my = ay + uy * t;
        const slant = halfW * 0.7;
        const x1 = mx + px * halfW - ux * slant;
        const y1 = my + py * halfW - uy * slant;
        const x2 = mx - px * halfW + ux * slant;
        const y2 = my - py * halfW + uy * slant;
        snakeGraphics.lineBetween(x1, y1, x2, y2);
      }
    }
    for (let i = 1; i < snake.length; i++) {
      const seg = snake[i];
      const key = `${seg.row},${seg.col}`;
      if (clearedSet.has(key) || poopKeySet.has(key) && !clearedSet.has(key) === false) {
        const { cx, cy } = cellCenter(seg.row, seg.col);
        const r = cableW * 0.52;
        const offsets = [
          { dx: -r * 0.3, dy: -r * 0.4 },
          { dx: r * 0.5, dy: r * 0.1 },
          { dx: -r * 0.1, dy: r * 0.5 },
          { dx: r * 0.4, dy: -r * 0.3 }
        ];
        for (const { dx, dy } of offsets) {
          snakeGraphics.fillStyle(COLORS.poop.fill, 0.85);
          snakeGraphics.fillCircle(cx + dx, cy + dy, r * 0.42);
        }
      }
    }
    const { cx: hx, cy: hy } = cellCenter(snake[0].row, snake[0].col);
    const fdx = direction === "right" ? 1 : direction === "left" ? -1 : 0;
    const fdy = direction === "down" ? 1 : direction === "up" ? -1 : 0;
    const perpX = -fdy, perpY = fdx;
    const collarR = cableW * 0.58;
    const tipLen = cellSize * 0.46;
    const tipX = hx + fdx * tipLen;
    const tipY = hy + fdy * tipLen;
    snakeGraphics.fillStyle(COLORS.snake.stroke, 1);
    snakeGraphics.fillCircle(hx, hy, collarR + 3);
    snakeGraphics.fillStyle(COLORS.snake.body, 1);
    snakeGraphics.fillCircle(hx, hy, collarR);
    snakeGraphics.fillStyle(COLORS.snake.stroke, 1);
    snakeGraphics.fillPoints([
      { x: hx + perpX * collarR, y: hy + perpY * collarR },
      { x: hx - perpX * collarR, y: hy - perpY * collarR },
      { x: tipX, y: tipY }
    ], true, true);
    snakeGraphics.fillStyle(COLORS.snake.body, 1);
    snakeGraphics.fillPoints([
      { x: hx + perpX * (collarR - 3), y: hy + perpY * (collarR - 3) },
      { x: hx - perpX * (collarR - 3), y: hy - perpY * (collarR - 3) },
      { x: tipX - fdx * 4, y: tipY - fdy * 4 }
    ], true, true);
    const fluteCount = 4;
    snakeGraphics.lineStyle(2, COLORS.snake.ridge, 0.8);
    for (let f = 1; f < fluteCount; f++) {
      const t = f / fluteCount;
      const fx = hx + fdx * tipLen * t;
      const fy = hy + fdy * tipLen * t;
      const hw = collarR * (1 - t) + 1;
      snakeGraphics.lineBetween(
        fx + perpX * hw + fdx * hw * 0.5,
        fy + perpY * hw + fdy * hw * 0.5,
        fx - perpX * hw - fdx * hw * 0.5,
        fy - perpY * hw - fdy * hw * 0.5
      );
    }
    snakeGraphics.fillStyle(COLORS.snake.tip, 1);
    snakeGraphics.fillCircle(tipX, tipY, 4);
    snakeGraphics.fillStyle(16777215, 0.25);
    snakeGraphics.fillCircle(
      hx - fdx * collarR * 0.3 - perpX * collarR * 0.3,
      hy - fdy * collarR * 0.3 - perpY * collarR * 0.3,
      collarR * 0.3
    );
    const headKey = `${snake[0].row},${snake[0].col}`;
    if (clearedSet.has(headKey)) {
      snakeGraphics.fillStyle(COLORS.poop.fill, 0.8);
      snakeGraphics.fillCircle(hx + fdx * collarR * 0.3, hy + fdy * collarR * 0.3, collarR * 0.45);
      snakeGraphics.fillCircle(hx - perpX * collarR * 0.4, hy - perpY * collarR * 0.4, collarR * 0.3);
    }
  }
  function drawWall(g, x, y) {
    const s = cellSize;
    g.fillStyle(COLORS.wall.fill, 1);
    g.fillRect(x + 2, y + 2, s - 4, s - 4);
    g.lineStyle(1.5, COLORS.wall.grout, 1);
    const half = s / 2;
    g.lineBetween(x + 2, y + half, x + s - 2, y + half);
    g.lineBetween(x + half, y + 2, x + half, y + half);
    g.lineBetween(x + s * 0.25, y + half, x + s * 0.25, y + s - 2);
    g.lineBetween(x + s * 0.75, y + half, x + s * 0.75, y + s - 2);
    g.lineStyle(2, COLORS.wall.stroke, 1);
    g.strokeRect(x + 2, y + 2, s - 4, s - 4);
  }
  function drawToilet(toiletX, _unused) {
    const g = gridGraphics;
    const armPhase = plumberArmPhase;
    const sceneLeft = gridOffsetX;
    const sceneRight = gridOffsetX + gs.cols * cellSize;
    const sceneW = sceneRight - sceneLeft;
    const sceneBot = gridOffsetY;
    const sceneTop = gridOffsetY - cellSize * 2.2;
    const sceneH = sceneBot - sceneTop;
    const tCX = toiletX + cellSize * 0.5;
    const tCY = sceneBot - sceneH * 0.28;
    const tBW = cellSize * 1.05;
    const tBH = cellSize * 0.65;
    g.fillStyle(2759230, 0.55);
    g.fillRect(sceneLeft, sceneTop, sceneW, sceneH);
    const spaceRight = sceneRight - (tCX + tBW * 0.5);
    const spaceLeft = tCX - tBW * 0.5 - sceneLeft;
    const plumberOnRight = spaceRight >= spaceLeft;
    const U = sceneH * 0.44;
    const pCX = plumberOnRight ? Math.min(tCX + tBW * 0.5 + U * 0.7, sceneRight - U * 0.4) : Math.max(tCX - tBW * 0.5 - U * 0.7, sceneLeft + U * 0.4);
    const pFeet = sceneBot - sceneH * 0.04;
    const facing = plumberOnRight ? -1 : 1;
    const tkW = tBW * 0.5;
    const tkH = sceneH * 0.36;
    const tkY = tCY - tBH * 0.5 - tkH;
    g.fillStyle(COLORS.toilet.bowl, 1);
    g.fillRoundedRect(tCX - tkW * 0.5, tkY, tkW, tkH, 5);
    g.lineStyle(2, COLORS.toilet.rim, 1);
    g.strokeRoundedRect(tCX - tkW * 0.5, tkY, tkW, tkH, 5);
    g.fillStyle(COLORS.toilet.rim, 1);
    g.fillCircle(tCX, tkY + tkH * 0.28, tkW * 0.1);
    g.fillStyle(COLORS.toilet.bowl, 1);
    g.fillEllipse(tCX, tCY, tBW, tBH);
    g.lineStyle(3, COLORS.toilet.rim, 1);
    g.strokeEllipse(tCX, tCY, tBW, tBH);
    g.lineStyle(3, COLORS.toilet.rim, 0.6);
    g.strokeEllipse(tCX, tCY - tBH * 0.1, tBW * 0.88, tBH * 0.58);
    g.fillStyle(COLORS.toilet.water, 0.6);
    g.fillEllipse(tCX, tCY + tBH * 0.06, tBW * 0.58, tBH * 0.38);
    const pipeW = cellSize * 0.26;
    const pipeCX = tCX;
    const pipeTop = tCY + tBH * 0.44;
    g.fillStyle(12303308, 1);
    g.fillRect(pipeCX - pipeW * 0.5, pipeTop, pipeW, sceneBot - pipeTop + 4);
    g.lineStyle(2, 8947882, 1);
    g.strokeRect(pipeCX - pipeW * 0.5, pipeTop, pipeW, sceneBot - pipeTop + 4);
    const headR = U * 0.22;
    const bodyH = U * 0.28;
    const bodyW = U * 0.32;
    const legH = U * 0.22;
    const legW = U * 0.1;
    const bootH = U * 0.1;
    const bootW = U * 0.15;
    const armLen = U * 0.28;
    const headCY = pFeet - legH - bootH - bodyH - headR;
    const headCX = pCX;
    const bodBot = pFeet - legH - bootH;
    const bodTop = bodBot - bodyH;
    g.fillStyle(COLORS.plumber.boots, 1);
    g.fillEllipse(pCX - legW * 0.6, pFeet, bootW, bootH);
    g.fillEllipse(pCX + legW * 0.6, pFeet, bootW, bootH);
    g.fillStyle(COLORS.plumber.overalls, 1);
    g.fillRect(pCX - legW * 1.1, bodBot, legW, legH);
    g.fillRect(pCX + legW * 0.1, bodBot, legW, legH);
    g.fillStyle(COLORS.plumber.overalls, 1);
    g.fillRoundedRect(pCX - bodyW * 0.5, bodTop, bodyW, bodyH, 5);
    g.fillStyle(COLORS.plumber.shirt, 1);
    g.fillRect(pCX - bodyW * 0.5 - legW * 0.5, bodTop, legW * 0.6, bodyH * 0.7);
    g.fillRect(pCX + bodyW * 0.5 - legW * 0.1, bodTop, legW * 0.6, bodyH * 0.7);
    g.lineStyle(legW * 0.8, COLORS.plumber.overalls, 1);
    g.lineBetween(pCX - bodyW * 0.18, bodTop, pCX - bodyW * 0.28, bodTop - headR * 0.3);
    g.lineBetween(pCX + bodyW * 0.18, bodTop, pCX + bodyW * 0.28, bodTop - headR * 0.3);
    g.fillStyle(16777215, 0.4);
    g.fillCircle(pCX, bodTop + bodyH * 0.35, legW * 0.35);
    const pump = Math.sin(armPhase * Math.PI * 2);
    const pump2 = Math.sin((armPhase + 0.5) * Math.PI * 2);
    const handRestX = pipeCX + (plumberOnRight ? -tBW * 0.22 : tBW * 0.22);
    const handRestY = tCY - tBH * 0.25;
    const pipeVecX = pipeCX - handRestX;
    const pipeVecY = pipeTop - handRestY;
    const pipeVecLen = Math.sqrt(pipeVecX * pipeVecX + pipeVecY * pipeVecY) || 1;
    const pushAmp = U * 0.18;
    const handX = handRestX + pipeVecX / pipeVecLen * pump * pushAmp;
    const handY = handRestY + pipeVecY / pipeVecLen * pump * pushAmp;
    const hand2RestX = pipeCX + (plumberOnRight ? -tBW * 0.12 : tBW * 0.12);
    const hand2RestY = tCY - tBH * 0.05;
    const pipe2VecX = pipeCX - hand2RestX;
    const pipe2VecY = pipeTop - hand2RestY;
    const pipe2VecLen = Math.sqrt(pipe2VecX * pipe2VecX + pipe2VecY * pipe2VecY) || 1;
    const hand2X = hand2RestX + pipe2VecX / pipe2VecLen * pump2 * pushAmp;
    const hand2Y = hand2RestY + pipe2VecY / pipe2VecLen * pump2 * pushAmp;
    const shoulderX = pCX + facing * bodyW * 0.46;
    const shoulder2X = pCX - facing * bodyW * 0.46;
    const shoulderY = bodTop + bodyH * 0.18;
    g.lineStyle(legW * 1.6, COLORS.plumber.shirt, 1);
    g.lineBetween(shoulderX, shoulderY, shoulderX + facing * armLen * 0.5, shoulderY + armLen * 0.2);
    g.lineStyle(legW * 1.4, COLORS.plumber.skin, 1);
    g.lineBetween(shoulderX + facing * armLen * 0.5, shoulderY + armLen * 0.2, handX, handY);
    g.fillStyle(COLORS.plumber.skin, 1);
    g.fillCircle(handX, handY, legW * 0.9);
    g.lineStyle(legW * 1.6, COLORS.plumber.shirt, 1);
    g.lineBetween(shoulder2X, shoulderY, shoulder2X - facing * armLen * 0.4, shoulderY + armLen * 0.25);
    g.lineStyle(legW * 1.4, COLORS.plumber.skin, 1);
    g.lineBetween(shoulder2X - facing * armLen * 0.4, shoulderY + armLen * 0.25, hand2X, hand2Y);
    g.fillStyle(COLORS.plumber.skin, 1);
    g.fillCircle(hand2X, hand2Y, legW * 0.9);
    g.fillStyle(COLORS.plumber.skin, 1);
    g.fillCircle(headCX, headCY, headR);
    const eyeNearX = headCX + facing * headR * 0.18;
    const eyeFarX = headCX + facing * headR * 0.56;
    const eyeY = headCY - headR * 0.08;
    const eyeW = headR * 0.36;
    const eyeH = headR * 0.42;
    const snakeHead = gs.snake[0];
    const { cx: snakeWX, cy: snakeWY } = cellCenter(snakeHead.row, snakeHead.col);
    const lookDX = snakeWX - headCX;
    const lookDY = snakeWY - headCY;
    const lookLen = Math.sqrt(lookDX * lookDX + lookDY * lookDY) || 1;
    const pupilTravel = eyeW * 0.3;
    const pupilOX = lookDX / lookLen * pupilTravel;
    const pupilOY = lookDY / lookLen * pupilTravel;
    g.fillStyle(16777215, 1);
    g.fillEllipse(eyeNearX, eyeY, eyeW, eyeH);
    g.fillEllipse(eyeFarX, eyeY, eyeW, eyeH);
    g.fillStyle(1710677, 1);
    g.fillCircle(eyeNearX + pupilOX, eyeY + pupilOY, headR * 0.12);
    g.fillCircle(eyeFarX + pupilOX, eyeY + pupilOY, headR * 0.12);
    g.fillStyle(16777215, 1);
    g.fillCircle(eyeNearX + pupilOX + headR * 0.05, eyeY + pupilOY - headR * 0.04, headR * 0.045);
    g.fillCircle(eyeFarX + pupilOX + headR * 0.05, eyeY + pupilOY - headR * 0.04, headR * 0.045);
    g.fillStyle(COLORS.plumber.skin, 1);
    g.fillEllipse(headCX - facing * headR * 0.92, headCY + headR * 0.08, headR * 0.26, headR * 0.36);
    g.fillStyle(COLORS.plumber.skinDark, 1);
    g.fillEllipse(headCX - facing * headR * 0.92, headCY + headR * 0.08, headR * 0.14, headR * 0.22);
    g.fillStyle(COLORS.plumber.mustache, 1);
    g.fillEllipse(headCX + facing * headR * 0.18, headCY + headR * 0.38, headR * 0.7, headR * 0.28);
    g.fillEllipse(headCX + facing * headR * 0.58, headCY + headR * 0.35, headR * 0.45, headR * 0.22);
    g.fillStyle(COLORS.plumber.skinDark, 1);
    g.fillCircle(headCX + facing * headR * 0.55, headCY + headR * 0.18, headR * 0.18);
    const capBaseY = headCY - headR * 0.6;
    g.fillStyle(COLORS.plumber.cap, 1);
    g.fillEllipse(headCX, headCY - headR * 0.72, headR * 2, headR * 0.78);
    g.fillStyle(COLORS.plumber.capBrim, 1);
    g.fillRect(headCX - headR * 1, capBaseY - headR * 0.06, headR * 2, headR * 0.18);
    g.fillStyle(16777215, 0.22);
    g.fillEllipse(headCX - facing * headR * 0.25, headCY - headR * 0.82, headR * 0.55, headR * 0.22);
    if (plumberArmActive) {
      const sweatDefs = [
        // cycle, phase offset, angle (radians away from head, -facing side), drop radius
        { cycle: 2.2, offset: 0, ang: Math.PI * 0.72, r: headR * 0.16 },
        { cycle: 1.8, offset: 0.33, ang: Math.PI * 0.9, r: headR * 0.13 },
        { cycle: 2.6, offset: 0.61, ang: Math.PI * 0.58, r: headR * 0.115 }
      ];
      for (const sd of sweatDefs) {
        const sweatPhase = (plumberArmPhase * sd.cycle + sd.offset) % 1;
        const travel = sweatPhase * headR * 0.9;
        const alpha = sweatPhase < 0.65 ? 0.92 : 0.92 * (1 - (sweatPhase - 0.65) / 0.35);
        const emitAng = (facing > 0 ? Math.PI : 0) - sd.ang * facing;
        const nx = Math.cos(emitAng), ny = Math.sin(emitAng);
        const ax = headCX + nx * headR * 0.7;
        const ay = headCY - headR * 0.4;
        const sx = ax + nx * travel;
        const sy = ay + ny * travel;
        const r = sd.r;
        g.fillStyle(6732799, alpha);
        g.fillCircle(sx, sy, r);
        g.fillTriangle(
          sx - nx * r * 0.9,
          sy - ny * r * 0.9,
          // base one side
          sx + ny * r * 0.5,
          sy - nx * r * 0.5,
          // base other side (perpendicular)
          sx - nx * r * 3,
          sy - ny * r * 3
          // longer tail tip
        );
      }
    }
    g.lineStyle(cellSize * 0.1, COLORS.snake.stroke, 1);
    g.lineBetween(handX, handY, pipeCX, pipeTop);
    g.lineBetween(hand2X, hand2Y, pipeCX, pipeTop);
    g.lineStyle(cellSize * 0.07, COLORS.snake.body, 1);
    g.lineBetween(handX, handY, pipeCX, pipeTop);
    g.lineBetween(hand2X, hand2Y, pipeCX, pipeTop);
  }
  function drawPoop(x, y, poopRow, poopCol) {
    const g = gridGraphics;
    const s = cellSize;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const snakeHead = gs.snake[0];
    const dist = Math.max(Math.abs(snakeHead.row - poopRow), Math.abs(snakeHead.col - poopCol));
    const shocked = gs.moving && dist <= 2;
    const layers = [
      { oy: s * 0.25, rx: s * 0.38, ry: s * 0.22 },
      { oy: s * 0.05, rx: s * 0.28, ry: s * 0.18 },
      { oy: -s * 0.14, rx: s * 0.18, ry: s * 0.14 }
    ];
    for (const { oy, rx, ry } of layers) {
      g.fillStyle(COLORS.poop.fill, 1);
      g.fillEllipse(cx, cy + oy, rx * 2, ry * 2);
    }
    g.fillStyle(COLORS.poop.shine, 1);
    g.fillCircle(cx, cy - s * 0.24, s * 0.1);
    g.fillStyle(16777215, 0.25);
    g.fillCircle(cx - s * 0.07, cy - s * 0.05, s * 0.06);
    const { cx: sWX, cy: sWY } = cellCenter(snakeHead.row, snakeHead.col);
    const ldx = sWX - cx, ldy = sWY - cy;
    const llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
    const eyeTravel = s * 0.025;
    const pox = ldx / llen * eyeTravel;
    const poy = ldy / llen * eyeTravel;
    const eyeY = cy + s * 0.05;
    if (shocked) {
      g.fillStyle(16777215, 1);
      g.fillCircle(cx - s * 0.11, eyeY, s * 0.09);
      g.fillCircle(cx + s * 0.11, eyeY, s * 0.09);
      g.fillStyle(1118481, 1);
      g.fillCircle(cx - s * 0.11 + pox, eyeY + poy, s * 0.035);
      g.fillCircle(cx + s * 0.11 + pox, eyeY + poy, s * 0.035);
      g.lineStyle(s * 0.025, 3807744, 1);
      g.lineBetween(cx - s * 0.17, eyeY - s * 0.12, cx - s * 0.05, eyeY - s * 0.12);
      g.lineBetween(cx + s * 0.05, eyeY - s * 0.12, cx + s * 0.17, eyeY - s * 0.12);
      g.fillStyle(3807744, 1);
      g.fillEllipse(cx, eyeY + s * 0.16, s * 0.14, s * 0.12);
      g.fillStyle(1118481, 0.7);
      g.fillEllipse(cx, eyeY + s * 0.16, s * 0.09, s * 0.08);
      const swY = cy - s * 0.32;
      g.fillStyle(8965375, 0.9);
      g.fillCircle(cx + s * 0.14, swY, s * 0.055);
      g.fillTriangle(
        cx + s * 0.14 - s * 0.055,
        swY,
        cx + s * 0.14 + s * 0.055 * 0.3,
        swY,
        cx + s * 0.14,
        swY - s * 0.13
      );
    } else {
      g.fillStyle(16777215, 1);
      g.fillCircle(cx - s * 0.1, eyeY, s * 0.07);
      g.fillCircle(cx + s * 0.1, eyeY, s * 0.07);
      g.fillStyle(2236962, 1);
      g.fillCircle(cx - s * 0.1 + pox, eyeY + poy, s * 0.04);
      g.fillCircle(cx + s * 0.1 + pox, eyeY + poy, s * 0.04);
      g.lineStyle(2, 5909e3, 1);
      g.arc(cx, eyeY + s * 0.06, s * 0.12, 0.2, Math.PI - 0.2);
      g.strokePath();
    }
  }
  function spawnPoopBurst(row, col) {
    const { cx, cy } = cellCenter(row, col);
    const COUNT = 18;
    const COLORS_POOP = [9127187, 5909e3, 11558960, 7025680, 13922330];
    for (let i = 0; i < COUNT; i++) {
      const angle = i / COUNT * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = cellSize * (1.5 + Math.random() * 1.5);
      const radius = cellSize * (0.12 + Math.random() * 0.16);
      const color = COLORS_POOP[Math.floor(Math.random() * COLORS_POOP.length)];
      const g = scene.add.graphics();
      g.setDepth(8);
      particleGraphics.push(g);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const dummy = { t: 0 };
      scene.tweens.add({
        targets: dummy,
        t: 1,
        duration: 550 + Math.random() * 200,
        ease: "Quad.easeOut",
        onUpdate: (_tween, _target, _key, current) => {
          if (!g.active) return;
          const px = cx + vx * current;
          const py = cy + vy * current;
          const alpha = 1 - current;
          const r = radius * (1 - current * 0.4);
          g.clear();
          g.fillStyle(color, alpha);
          g.fillCircle(px, py, r);
        },
        onComplete: () => {
          if (g.active) g.destroy();
        }
      });
    }
  }
  function spawnWinSplash() {
    const splashes = [
      { x: -120, y: GAME_HEIGHT * 0.3, w: 340, h: 160, tx: GAME_WIDTH * 0.18, ty: GAME_HEIGHT * 0.35 },
      { x: GAME_WIDTH + 120, y: GAME_HEIGHT * 0.22, w: 380, h: 140, tx: GAME_WIDTH * 0.8, ty: GAME_HEIGHT * 0.28 },
      { x: -120, y: GAME_HEIGHT * 0.52, w: 300, h: 170, tx: GAME_WIDTH * 0.2, ty: GAME_HEIGHT * 0.5 },
      { x: GAME_WIDTH + 120, y: GAME_HEIGHT * 0.58, w: 360, h: 150, tx: GAME_WIDTH * 0.78, ty: GAME_HEIGHT * 0.55 },
      { x: GAME_WIDTH * 0.5, y: -120, w: 420, h: 130, tx: GAME_WIDTH * 0.5, ty: GAME_HEIGHT * 0.18 },
      { x: GAME_WIDTH * 0.25, y: GAME_HEIGHT + 120, w: 320, h: 160, tx: GAME_WIDTH * 0.28, ty: GAME_HEIGHT * 0.72 },
      { x: GAME_WIDTH * 0.75, y: GAME_HEIGHT + 120, w: 350, h: 145, tx: GAME_WIDTH * 0.7, ty: GAME_HEIGHT * 0.68 }
    ];
    const WATER_COLORS = [11065584, 6011112, 2788045, 13692667];
    splashes.forEach((s, idx) => {
      const delay = idx * 90;
      const g = scene.add.graphics();
      g.setDepth(9);
      particleGraphics.push(g);
      const color = WATER_COLORS[idx % WATER_COLORS.length];
      const d1 = { v: 0 };
      scene.tweens.add({
        targets: d1,
        v: 1,
        duration: 380,
        delay,
        ease: "Back.easeOut",
        onUpdate: (_tw, _tgt, _k, v) => {
          if (!g.active) return;
          const curX = s.x + (s.tx - s.x) * v;
          const curY = s.y + (s.ty - s.y) * v;
          const curW = s.w * (0.4 + v * 0.6);
          const curH = s.h * (0.4 + v * 0.6);
          g.clear();
          g.fillStyle(color, 0.88 * Math.min(v * 2, 1));
          g.fillEllipse(curX, curY, curW, curH);
          g.fillStyle(16777215, 0.35 * Math.min(v * 2, 1));
          g.fillEllipse(curX - curW * 0.15, curY - curH * 0.22, curW * 0.45, curH * 0.38);
        },
        onComplete: () => {
          if (!g.active) return;
          const d2 = { v: 0 };
          scene.tweens.add({
            targets: d2,
            v: 1,
            duration: 500,
            ease: "Quad.easeIn",
            onUpdate: (_tw, _tgt, _k, v) => {
              if (!g.active) return;
              const curW = s.w * (1 + v * 1);
              const curH = s.h * (1 + v * 0.6);
              g.clear();
              g.fillStyle(color, 0.88 * (1 - v));
              g.fillEllipse(s.tx, s.ty, curW, curH);
              g.fillStyle(16777215, 0.35 * (1 - v));
              g.fillEllipse(s.tx - curW * 0.15, s.ty - curH * 0.22, curW * 0.45, curH * 0.38);
            },
            onComplete: () => {
              if (g.active) g.destroy();
            }
          });
        }
      });
    });
  }
  function buildControls(sc) {
    const STRIP_TOP = GAME_HEIGHT - GRID_BOTTOM_MARGIN;
    const STRIP_H = GRID_BOTTOM_MARGIN;
    const BTN = 90;
    const GAP = 6;
    const clusterH = BTN * 2 + GAP;
    const dpadCX = GAME_WIDTH * 0.26;
    const dpadCY = STRIP_TOP + (STRIP_H - clusterH) / 2 + clusterH / 2;
    const clusterTop = dpadCY - clusterH / 2;
    const upY = clusterTop + BTN / 2;
    const botY = clusterTop + BTN + GAP + BTN / 2;
    const leftX = dpadCX - BTN - GAP;
    const centX = dpadCX;
    const rightX = dpadCX + BTN + GAP;
    makeArrowBtn(sc, centX, upY, BTN, "▲", "(W)", "up");
    makeArrowBtn(sc, leftX, botY, BTN, "◀", "(A)", "left");
    makeArrowBtn(sc, centX, botY, BTN, "▼", "(S)", "down");
    makeArrowBtn(sc, rightX, botY, BTN, "▶", "(D)", "right");
    const utilW = 160;
    const utilH = 64;
    const utilGap = 14;
    const utilX = GAME_WIDTH * 0.73;
    const stackH = utilH * 3 + utilGap * 2;
    const stackTop = STRIP_TOP + (STRIP_H - stackH) / 2;
    const utilY0 = stackTop + utilH / 2;
    const utilY1 = utilY0 + utilH + utilGap;
    const utilY2 = utilY1 + utilH + utilGap;
    makeUtilBtn(sc, utilX, utilY0, utilW, utilH, "↺ RESET", 8010266, 5909002, doReset);
    makeUtilBtn(sc, utilX, utilY1, utilW, utilH, "↩ UNDO", 1723002, 670298, doUndo);
    makeUtilBtn(sc, utilX, utilY2, utilW, utilH, "💡 HINT", 5913210, 3807834, doHint);
  }
  function makeUtilBtn(sc, x, y, w, h, label, fillColor, strokeColor, onClick) {
    const bg = sc.add.graphics();
    const draw = (pressed) => {
      bg.clear();
      bg.fillStyle(pressed ? fillColor + 2236962 : fillColor, 1);
      bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
      bg.lineStyle(2, strokeColor, 1);
      bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    };
    draw(false);
    sc.add.text(x, y, label, { ...TEXT_STYLES.button, fontSize: "28px" }).setOrigin(0.5);
    const zone = sc.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => {
      draw(true);
      onClick();
    });
    zone.on("pointerup", () => {
      draw(false);
    });
    zone.on("pointerout", () => {
      draw(false);
    });
  }
  function makeArrowBtn(sc, x, y, size, label, hint, dir) {
    const bg = sc.add.graphics();
    const drawBg = (pressed) => {
      bg.clear();
      bg.fillStyle(pressed ? COLORS.button.active : COLORS.button.fill, 1);
      bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
      bg.lineStyle(2, COLORS.button.stroke, 1);
      bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);
    };
    drawBg(false);
    sc.add.text(x, y - size * 0.1, label, { ...TEXT_STYLES.button, fontSize: "36px" }).setOrigin(0.5);
    sc.add.text(x, y + size * 0.26, hint, {
      fontSize: "18px",
      fontFamily: "Arial",
      color: "#aaccff"
    }).setOrigin(0.5);
    const zone = sc.add.zone(x, y, size, size).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => {
      drawBg(true);
      handleDirInput(dir);
    });
    zone.on("pointerup", () => {
      drawBg(false);
    });
    zone.on("pointerout", () => {
      drawBg(false);
    });
  }
  function doReset() {
    if (gs.moving) return;
    if (currentLevelData) {
      gs = buildState(currentLevelData, currentLevel);
      currentSolution = currentLevelData.solution;
      if (hintOverlay) {
        hintOverlay.destroy();
        hintOverlay = null;
      }
      msgText.setAlpha(0).setText("");
      stepTimer = 0;
      currentStepDelay = STEP_DELAY;
      stateHistory = [];
      queuedDir = null;
      rewindCells = [];
      rewindTargetState = null;
      lastCompletedDir = null;
      scene.tweens.killTweensOf(msgText);
      overlayGroup.clear(true, true);
      drawGrid();
      drawSnake();
    } else {
      loadLevel(currentLevel);
    }
  }
  function doUndo() {
    if (gs.moving || rewindCells.length > 0) return;
    if (stateHistory.length === 0) return;
    stateHistory.pop();
    const target = stateHistory.length > 0 ? { ...stateHistory[stateHistory.length - 1] } : buildState(currentLevelData, currentLevel);
    lastCompletedDir = stateHistory.length > 0 ? stateHistory[stateHistory.length - 1].direction : null;
    const targetKeys = new Set(target.snake.map((c) => `${c.row},${c.col}`));
    const addedCells = gs.snake.filter((c) => !targetKeys.has(`${c.row},${c.col}`));
    if (addedCells.length === 0) {
      sfxBupRewind();
      gs = target;
      drawGrid();
      drawSnake();
      return;
    }
    sfxBupRewind();
    rewindTargetState = target;
    rewindCells = [...gs.snake];
    stepTimer = 0;
    currentStepDelay = STEP_DELAY_UNDO;
    const savedGs = gs;
    gs = target;
    drawGrid();
    gs = savedGs;
    scene.tweens.killTweensOf(msgText);
    msgText.setAlpha(0);
  }
  function doHint() {
    if (gs.moving) return;
    if (hintOverlay) {
      hintOverlay.destroy();
      hintOverlay = null;
      return;
    }
    const arrow = { up: "▲", down: "▼", left: "◀", right: "▶" };
    const steps = currentSolution.map((d, i) => `${i + 1}. ${arrow[d]}`).join("   ");
    const label = `Solution (${currentSolution.length} moves):
${steps}`;
    const panW = GAME_WIDTH - 80;
    const panH = 160;
    const panX = GAME_WIDTH / 2;
    const panY = gridOffsetY - cellSize - panH / 2 - 12;
    const bg = scene.make.graphics();
    bg.fillStyle(1706542, 0.92);
    bg.fillRoundedRect(-panW / 2, -panH / 2, panW, panH, 16);
    bg.lineStyle(2, 10053324, 1);
    bg.strokeRoundedRect(-panW / 2, -panH / 2, panW, panH, 16);
    const txt = scene.add.text(0, 0, label, {
      fontSize: "30px",
      fontFamily: "Arial",
      color: "#eeddff",
      align: "center",
      wordWrap: { width: panW - 32 }
    }).setOrigin(0.5);
    hintOverlay = scene.add.container(panX, panY, [bg, txt]);
    hintOverlay.setSize(panW, panH);
    hintOverlay.setDepth(30);
    hintOverlay.setInteractive();
    hintOverlay.on("pointerdown", () => {
      if (hintOverlay) {
        hintOverlay.destroy();
        hintOverlay = null;
      }
    });
  }
  function handleDirInput(dir) {
    if (!gs || gs.won || gs.lost) return;
    if (hintOverlay) {
      hintOverlay.destroy();
      hintOverlay = null;
    }
    const reverse = { up: "down", down: "up", left: "right", right: "left" };
    if (!gs.moving && rewindCells.length === 0 && lastCompletedDir !== null && dir === reverse[lastCompletedDir] && stateHistory.length > 0) {
      doUndo();
      return;
    }
    if (gs.moving) {
      queuedDir = dir;
    } else {
      const { passed } = simulateSlide(
        gs.grid,
        gs.rows,
        gs.cols,
        gs.snake[0],
        gs.snake,
        dir,
        gs.toiletCol
      );
      if (passed.length === 0) {
        sfxThud();
      }
      queuedDir = null;
      gs = applyDirection(gs, dir);
      stepTimer = 0;
    }
  }
  const ENGRISH_PHRASES = [
    "YOU ARE WIN! TOILET IS GRATEFUL!",
    "GREAT! THE POOP HAVE GONE!",
    "CONGRATURATION! YOU BUSTED THE TURDS!",
    "ALL YOUR POOP ARE BELONG TO US.",
    "A WINNER IS YOU! VERY GOOD FLUSH!",
    "SOMEONE SET UP US THE PLUNGER!",
    "MOVE ZIG! FOR GREAT HYGIENE!",
    "YOU ARE MOST EXCELLENT TURD BUSTER!",
    "GRORIOUS! POOP HAS BEEN EXTERMINATE!",
    "WOW! YOU ARE SUPER TOILET HERO!",
    "TOILET IS PLEASED WITH YOUR EFFORT!",
    "SO MANY FLUSH! MUCH CONGRATULATE!",
    "YOU HAVE BEAT THE POOP VERY MUCH!",
    "NICE JOB! SMELL IS LEAVE THIS AREA!",
    "STAGE IS CLEAR! TURD IS REGRET!"
  ];
  function makeSF2Texts(sc, text, cx, cy, faceColor, shadowColor, fontSize, depth) {
    const STROKE = 16;
    const SDX = 6, SDY = 7;
    const base = { fontFamily: "Arial Black, Impact, Arial", fontStyle: "italic" };
    const t1 = sc.add.text(cx + SDX + 2, cy + SDY + 2, text, {
      ...base,
      fontSize,
      color: "#000000",
      stroke: "#000000",
      strokeThickness: STROKE + 4
    }).setOrigin(0.5).setDepth(depth);
    const t2 = sc.add.text(cx + SDX, cy + SDY, text, {
      ...base,
      fontSize,
      color: shadowColor,
      stroke: "#000000",
      strokeThickness: STROKE
    }).setOrigin(0.5).setDepth(depth + 0.1);
    const t3 = sc.add.text(cx, cy, text, {
      ...base,
      fontSize,
      color: faceColor,
      stroke: "#000000",
      strokeThickness: STROKE
    }).setOrigin(0.5).setDepth(depth + 0.2);
    const t4 = sc.add.text(cx, cy - 3, text, {
      ...base,
      fontSize,
      color: "#ffffff",
      stroke: "#ffffff",
      strokeThickness: 2
    }).setOrigin(0.5, 1).setDepth(depth + 0.3).setAlpha(0.22);
    return [t1, t2, t3, t4];
  }
  function showWinOverlay(onDone) {
    if (winOverlay) {
      winOverlay.destroy();
      winOverlay = null;
    }
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const DEPTH = 25;
    const panel = scene.add.graphics();
    panel.fillStyle(0, 0.62);
    panel.fillRect(0, cy - 220, GAME_WIDTH, 440);
    panel.setDepth(DEPTH - 1);
    const toiletTexts = makeSF2Texts(
      scene,
      "TOILET",
      cx,
      cy - 100,
      "#ffdd22",
      "#aa6600",
      "110px",
      DEPTH
    );
    const clearTexts = makeSF2Texts(
      scene,
      "CLEAR",
      cx,
      cy + 20,
      "#44ccff",
      "#0044aa",
      "110px",
      DEPTH
    );
    const phrase = ENGRISH_PHRASES[Math.floor(Math.random() * ENGRISH_PHRASES.length)];
    const sub = scene.add.text(cx, cy + 130, phrase, {
      fontSize: "28px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
      align: "center",
      wordWrap: { width: GAME_WIDTH - 80 }
    }).setOrigin(0.5, 0).setDepth(DEPTH + 1);
    const all = [
      panel,
      sub,
      ...toiletTexts,
      ...clearTexts
    ];
    winOverlay = scene.add.container(0, 0);
    all.forEach((o) => o.setAlpha(0));
    scene.tweens.add({
      targets: all,
      alpha: 1,
      duration: 350,
      ease: "Quad.easeOut",
      onComplete: () => {
        scene.time.delayedCall(1800, () => {
          scene.tweens.add({
            targets: all,
            alpha: 0,
            duration: 350,
            ease: "Quad.easeIn",
            onComplete: () => {
              all.forEach((o) => o.destroy());
              if (winOverlay) {
                winOverlay.destroy();
                winOverlay = null;
              }
              onDone();
            }
          });
        });
      }
    });
  }
  function showMessage(text, color, onDone) {
    const hexStr = "#" + color.toString(16).padStart(6, "0");
    msgText.setText(text).setColor(hexStr).setAlpha(0).setDepth(20);
    scene.tweens.add({
      targets: msgText,
      alpha: 1,
      duration: 300,
      yoyo: false,
      onComplete: () => {
        scene.time.delayedCall(1200, () => {
          scene.tweens.add({
            targets: msgText,
            alpha: 0,
            duration: 300,
            onComplete: () => onDone()
          });
        });
      }
    });
  }
  class TitleScene extends Phaser.Scene {
    constructor() {
      super({ key: "Title" });
      this.poops = [];
    }
    // ── SF2-style word: thick black plate shadow + coloured face + white top edge ──
    addSF2Word(text, cx, cy, faceColor, shadowColor, fontSize, depth) {
      const STROKE = 18;
      const SDX = 7, SDY = 8;
      this.add.text(cx + SDX + 2, cy + SDY + 2, text, {
        fontSize,
        fontFamily: "Arial Black, Impact, Arial",
        fontStyle: "italic",
        color: "#000000",
        stroke: "#000000",
        strokeThickness: STROKE + 4
      }).setOrigin(0.5).setDepth(depth);
      this.add.text(cx + SDX, cy + SDY, text, {
        fontSize,
        fontFamily: "Arial Black, Impact, Arial",
        fontStyle: "italic",
        color: shadowColor,
        stroke: "#000000",
        strokeThickness: STROKE
      }).setOrigin(0.5).setDepth(depth + 0.1);
      const face = this.add.text(cx, cy, text, {
        fontSize,
        fontFamily: "Arial Black, Impact, Arial",
        fontStyle: "italic",
        color: faceColor,
        stroke: "#000000",
        strokeThickness: STROKE
      }).setOrigin(0.5).setDepth(depth + 0.2);
      this.add.text(cx, cy - 3, text, {
        fontSize,
        fontFamily: "Arial Black, Impact, Arial",
        fontStyle: "italic",
        color: "#ffffff",
        stroke: "#ffffff",
        strokeThickness: 2
      }).setOrigin(0.5, 1).setDepth(depth + 0.3).setAlpha(0.22);
      return face;
    }
    // ── Draw the title art: turd impaled by auger, poop particles ──────────────
    drawTitleArt(g, cx, cy) {
      const ANG = -0.62;
      const cosA = Math.cos(ANG);
      const sinA = Math.sin(ANG);
      const cableLen = 560;
      const cableW = 36;
      const tx0 = cx - cosA * cableLen * 0.55;
      const ty0 = cy - sinA * cableLen * 0.55;
      const tx1 = cx + cosA * cableLen * 0.45;
      const ty1 = cy + sinA * cableLen * 0.45;
      g.lineStyle(cableW + 10, COLORS.snake.stroke, 1);
      g.lineBetween(tx0, ty0, tx1, ty1);
      g.lineStyle(cableW, COLORS.snake.body, 1);
      g.lineBetween(tx0, ty0, tx1, ty1);
      const perp = { x: -sinA, y: cosA };
      const ridgeSpacing = 28;
      const ridgeCount = Math.floor(cableLen / ridgeSpacing);
      g.lineStyle(6, COLORS.snake.ridge, 0.65);
      for (let i = 0; i < ridgeCount; i++) {
        const t = i / ridgeCount;
        const mx = tx0 + (tx1 - tx0) * t;
        const my = ty0 + (ty1 - ty0) * t;
        const hw = cableW * 0.48;
        const sl = hw * 0.65;
        g.lineBetween(
          mx + perp.x * hw - cosA * sl,
          my + perp.y * hw - sinA * sl,
          mx - perp.x * hw + cosA * sl,
          my - perp.y * hw + sinA * sl
        );
      }
      const tipX = tx1 + cosA * 20;
      const tipY = ty1 + sinA * 20;
      const collarR = cableW * 0.62;
      g.fillStyle(COLORS.snake.stroke, 1);
      g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.4, collarR * 1);
      g.fillStyle(COLORS.snake.body, 1);
      g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.1, collarR * 0.85);
      const coneLen = 90;
      const tipPt = { x: tipX + cosA * coneLen, y: tipY + sinA * coneLen };
      g.fillStyle(COLORS.snake.stroke, 1);
      g.fillPoints([
        { x: tipX + perp.x * collarR, y: tipY + perp.y * collarR },
        { x: tipX - perp.x * collarR, y: tipY - perp.y * collarR },
        { x: tipPt.x, y: tipPt.y }
      ], true, true);
      g.fillStyle(COLORS.snake.body, 1);
      g.fillPoints([
        { x: tipX + perp.x * (collarR - 5), y: tipY + perp.y * (collarR - 5) },
        { x: tipX - perp.x * (collarR - 5), y: tipY - perp.y * (collarR - 5) },
        { x: tipPt.x - cosA * 6, y: tipPt.y - sinA * 6 }
      ], true, true);
      g.lineStyle(3, COLORS.snake.ridge, 0.8);
      for (let f = 1; f < 4; f++) {
        const tf = f / 4;
        const fx = tipX + cosA * coneLen * tf;
        const fy = tipY + sinA * coneLen * tf;
        const hw = collarR * (1 - tf) + 1;
        g.lineBetween(
          fx + perp.x * hw + cosA * hw * 0.5,
          fy + perp.y * hw + sinA * hw * 0.5,
          fx - perp.x * hw - cosA * hw * 0.5,
          fy - perp.y * hw - sinA * hw * 0.5
        );
      }
      g.fillStyle(COLORS.snake.tip, 1);
      g.fillCircle(tipPt.x, tipPt.y, 7);
      const turdR = 72;
      const layers = [
        { oy: turdR * 0.35, rx: turdR * 0.92, ry: turdR * 0.58 },
        { oy: turdR * 0.05, rx: turdR * 0.72, ry: turdR * 0.5 },
        { oy: -turdR * 0.32, rx: turdR * 0.5, ry: turdR * 0.42 }
      ];
      for (const { oy, rx, ry } of layers) {
        g.fillStyle(3807744, 1);
        g.fillEllipse(cx, cy + oy, rx * 2 + 8, ry * 2 + 8);
        g.fillStyle(COLORS.poop.fill, 1);
        g.fillEllipse(cx, cy + oy, rx * 2, ry * 2);
      }
      g.fillStyle(3807744, 1);
      g.fillCircle(cx, cy - turdR * 0.62, turdR * 0.3 + 3);
      g.fillStyle(COLORS.poop.shine, 1);
      g.fillCircle(cx, cy - turdR * 0.62, turdR * 0.3);
      g.fillStyle(3807744, 1);
      g.fillCircle(cx + turdR * 0.08, cy - turdR * 0.88, turdR * 0.2 + 2);
      g.fillStyle(COLORS.poop.fill, 1);
      g.fillCircle(cx + turdR * 0.08, cy - turdR * 0.88, turdR * 0.2);
      g.fillStyle(16777215, 0.22);
      g.fillCircle(cx - turdR * 0.25, cy - turdR * 0.12, turdR * 0.16);
      const eyeY = cy + turdR * 0.05;
      g.fillStyle(16777215, 1);
      g.fillEllipse(cx - turdR * 0.28, eyeY, turdR * 0.3, turdR * 0.36);
      g.fillEllipse(cx + turdR * 0.28, eyeY, turdR * 0.3, turdR * 0.36);
      g.fillStyle(1118481, 1);
      g.fillCircle(cx - turdR * 0.26, eyeY + turdR * 0.04, turdR * 0.11);
      g.fillCircle(cx + turdR * 0.26, eyeY + turdR * 0.04, turdR * 0.11);
      g.fillStyle(16777215, 1);
      g.fillCircle(cx - turdR * 0.22, eyeY - turdR * 0.04, turdR * 0.045);
      g.fillCircle(cx + turdR * 0.3, eyeY - turdR * 0.04, turdR * 0.045);
      g.lineStyle(4, 3807744, 1);
      const mouthY = cy + turdR * 0.3;
      const mouthPoints = [
        { x: cx - turdR * 0.28, y: mouthY },
        { x: cx - turdR * 0.14, y: mouthY + turdR * 0.14 },
        { x: cx, y: mouthY },
        { x: cx + turdR * 0.14, y: mouthY + turdR * 0.14 },
        { x: cx + turdR * 0.28, y: mouthY }
      ];
      g.strokePoints(mouthPoints, false, false);
      const fStart = { x: cx - cosA * 12, y: cy - sinA * 12 };
      g.lineStyle(cableW + 10, COLORS.snake.stroke, 1);
      g.lineBetween(fStart.x, fStart.y, tipX, tipY);
      g.lineStyle(cableW, COLORS.snake.body, 1);
      g.lineBetween(fStart.x, fStart.y, tipX, tipY);
      g.lineStyle(6, COLORS.snake.ridge, 0.65);
      const frontLen = Math.sqrt((tipX - fStart.x) ** 2 + (tipY - fStart.y) ** 2);
      const frontRidges = Math.floor(frontLen / ridgeSpacing);
      for (let i = 0; i <= frontRidges; i++) {
        const tf = i / Math.max(frontRidges, 1);
        const mx = fStart.x + (tipX - fStart.x) * tf;
        const my = fStart.y + (tipY - fStart.y) * tf;
        const hw = cableW * 0.48;
        const sl = hw * 0.65;
        g.lineBetween(
          mx + perp.x * hw - cosA * sl,
          my + perp.y * hw - sinA * sl,
          mx - perp.x * hw + cosA * sl,
          my - perp.y * hw + sinA * sl
        );
      }
      g.fillStyle(COLORS.snake.stroke, 1);
      g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.4, collarR * 1);
      g.fillStyle(COLORS.snake.body, 1);
      g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.1, collarR * 0.85);
      g.fillStyle(COLORS.snake.stroke, 1);
      g.fillPoints([
        { x: tipX + perp.x * collarR, y: tipY + perp.y * collarR },
        { x: tipX - perp.x * collarR, y: tipY - perp.y * collarR },
        { x: tipPt.x, y: tipPt.y }
      ], true, true);
      g.fillStyle(COLORS.snake.body, 1);
      g.fillPoints([
        { x: tipX + perp.x * (collarR - 5), y: tipY + perp.y * (collarR - 5) },
        { x: tipX - perp.x * (collarR - 5), y: tipY - perp.y * (collarR - 5) },
        { x: tipPt.x - cosA * 6, y: tipPt.y - sinA * 6 }
      ], true, true);
      g.lineStyle(3, COLORS.snake.ridge, 0.8);
      for (let f = 1; f < 4; f++) {
        const tf = f / 4;
        const fx = tipX + cosA * coneLen * tf;
        const fy = tipY + sinA * coneLen * tf;
        const hw = collarR * (1 - tf) + 1;
        g.lineBetween(
          fx + perp.x * hw + cosA * hw * 0.5,
          fy + perp.y * hw + sinA * hw * 0.5,
          fx - perp.x * hw - cosA * hw * 0.5,
          fy - perp.y * hw - sinA * hw * 0.5
        );
      }
      g.fillStyle(COLORS.snake.tip, 1);
      g.fillCircle(tipPt.x, tipPt.y, 7);
      g.fillStyle(16777215, 0.55);
      g.fillCircle(tipPt.x, tipPt.y, 4);
      const particles = [
        // angle (rad from right), dist, radius, alpha
        { a: -1.1, d: 150, r: 22, al: 1 },
        { a: -0.5, d: 200, r: 18, al: 0.95 },
        { a: -1.6, d: 130, r: 16, al: 0.9 },
        { a: -0.2, d: 220, r: 14, al: 0.85 },
        { a: -2, d: 110, r: 20, al: 0.9 },
        { a: -0.8, d: 170, r: 12, al: 0.8 },
        { a: 0.1, d: 250, r: 10, al: 0.75 },
        { a: -1.3, d: 260, r: 8, al: 0.7 },
        { a: -2.3, d: 90, r: 14, al: 0.85 },
        { a: -0.35, d: 310, r: 7, al: 0.6 },
        { a: 0.3, d: 190, r: 9, al: 0.7 },
        { a: -2.6, d: 75, r: 18, al: 0.9 }
      ];
      for (const pt of particles) {
        const px = cx + Math.cos(pt.a) * pt.d;
        const py = cy + Math.sin(pt.a) * pt.d;
        g.fillStyle(3807744, pt.al);
        g.fillCircle(px, py, pt.r + 3);
        g.fillStyle(COLORS.poop.fill, pt.al);
        g.fillCircle(px, py, pt.r);
        if (pt.r >= 12) {
          g.fillStyle(16777215, 0.18);
          g.fillCircle(px - pt.r * 0.28, py - pt.r * 0.28, pt.r * 0.28);
        }
      }
      g.lineStyle(5, 5909e3, 0.5);
      const streaks = [
        { a: -0.4, d0: 80, d1: 195 },
        { a: -1, d0: 85, d1: 140 },
        { a: -1.8, d0: 80, d1: 120 },
        { a: 0.2, d0: 80, d1: 240 }
      ];
      for (const sk of streaks) {
        g.lineBetween(
          cx + Math.cos(sk.a) * sk.d0,
          cy + Math.sin(sk.a) * sk.d0,
          cx + Math.cos(sk.a) * sk.d1,
          cy + Math.sin(sk.a) * sk.d1
        );
      }
    }
    create() {
      const W = GAME_WIDTH, H = GAME_HEIGHT;
      const bg = this.add.graphics();
      bg.fillGradientStyle(655392, 655392, 1706554, 1706554, 1);
      bg.fillRect(0, 0, W, H);
      const grid = this.add.graphics();
      grid.lineStyle(2, 2759242, 0.35);
      for (let x = 0; x < W; x += 70) grid.lineBetween(x, 0, x, H);
      for (let y = 0; y < H; y += 70) grid.lineBetween(0, y, W, y);
      const rand = rng(42);
      for (let i = 0; i < 14; i++) {
        const px = rand() * W;
        const py = rand() * H;
        const scale = 0.6 + rand() * 1;
        this.add.text(px, py, "💩", {
          fontSize: `${Math.round(60 * scale)}px`
        }).setOrigin(0.5).setAlpha(0.12 + rand() * 0.12).setDepth(1);
        this.poops.push({
          x: px,
          y: py,
          vx: (rand() - 0.5) * 0.4,
          vy: -(0.3 + rand() * 0.5),
          rot: rand() * Math.PI * 2,
          vr: (rand() - 0.5) * 0.012,
          scale
        });
      }
      this.gfx = this.add.graphics().setDepth(2);
      const titleBlockCY = H * 0.255;
      const superY = titleBlockCY - 148;
      const turdY = titleBlockCY + 10;
      const bustersY = titleBlockCY + 158;
      const superWord = this.addSF2Word("SUPER", W * 0.5, superY, "#44ccff", "#0033aa", "96px", 4);
      const turdWord = this.addSF2Word("TURD", W * 0.5, turdY, "#ddaa22", "#7a3a00", "128px", 4);
      const bustersWord = this.addSF2Word("BUSTERS", W * 0.5, bustersY, "#ff4422", "#8a1100", "108px", 4);
      this.titleText = turdWord;
      const bobAmp = 12;
      this.tweens.add({ targets: superWord, y: superY - bobAmp, duration: 1100, ease: "Sine.easeInOut", yoyo: true, repeat: -1, delay: 0 });
      this.tweens.add({ targets: turdWord, y: turdY - bobAmp, duration: 1100, ease: "Sine.easeInOut", yoyo: true, repeat: -1, delay: 180 });
      this.tweens.add({ targets: bustersWord, y: bustersY - bobAmp, duration: 1100, ease: "Sine.easeInOut", yoyo: true, repeat: -1, delay: 360 });
      const artGfx = this.add.graphics().setDepth(3);
      this.drawTitleArt(artGfx, W * 0.5, H * 0.6);
      const btnY = H * 0.8;
      this.btnGfx = this.add.graphics().setDepth(5);
      this.drawBtn(false);
      const btnText = this.add.text(W * 0.5, btnY, "TAP TO PLAY", {
        fontSize: "60px",
        fontFamily: "Arial Black, Arial",
        color: "#ffffff",
        stroke: "#0a0a2a",
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(6);
      this.tweens.add({
        targets: btnText,
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 700,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1
      });
      this.add.text(W * 0.5, H * 0.92, "Swipe or use arrow keys to navigate", {
        fontSize: "28px",
        fontFamily: "Arial",
        color: "#556677"
      }).setOrigin(0.5).setDepth(4);
      const startGame = () => {
        initAudio();
        if (loadBestLevel() <= 1) {
          this.registry.set("startLevel", 1);
          this.scene.start("Game");
        } else {
          this.scene.start("LevelSelect");
        }
      };
      this.input.once("pointerup", startGame);
      this.input.keyboard.once("keydown", startGame);
    }
    drawBtn(pressed) {
      const W = GAME_WIDTH, H = GAME_HEIGHT;
      const btnY = H * 0.8;
      const btnW = 480, btnH = 110;
      this.btnGfx.clear();
      this.btnGfx.fillStyle(pressed ? 2254370 : 3377203, 1);
      this.btnGfx.fillRoundedRect(W * 0.5 - btnW / 2, btnY - btnH / 2, btnW, btnH, 22);
      this.btnGfx.lineStyle(4, pressed ? 1131537 : 5614165, 1);
      this.btnGfx.strokeRoundedRect(W * 0.5 - btnW / 2, btnY - btnH / 2, btnW, btnH, 22);
      if (!pressed) {
        this.btnGfx.lineStyle(3, 8973960, 0.4);
        this.btnGfx.strokeRoundedRect(W * 0.5 - btnW / 2 + 6, btnY - btnH / 2 + 6, btnW - 12, btnH * 0.45, 14);
      }
    }
    update() {
      const W = GAME_WIDTH, H = GAME_HEIGHT;
      const objs = this.children.list.filter(
        (c) => c instanceof Phaser.GameObjects.Text && c.text === "💩"
      );
      for (let i = 0; i < this.poops.length && i < objs.length; i++) {
        const p = this.poops[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < -80) {
          p.y = H + 60;
          p.x = Math.random() * W;
        }
        objs[i].setPosition(p.x, p.y).setRotation(p.rot);
      }
    }
  }
  const SAVE_KEY = "stb_bestLevel";
  const COOKIE_NAME = "stb_bl";
  let _memBest = 1;
  function _parseLevel(v) {
    if (!v) return null;
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1 ? n : null;
  }
  function _readCookie() {
    try {
      const match = document.cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE_NAME + "="));
      return match ? _parseLevel(match.split("=")[1]) : null;
    } catch {
      return null;
    }
  }
  function _writeCookie(lvl) {
    try {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toUTCString();
      document.cookie = `${COOKIE_NAME}=${lvl};expires=${expires};path=/;SameSite=Lax`;
    } catch {
    }
  }
  function loadBestLevel() {
    try {
      const v = _parseLevel(localStorage.getItem(SAVE_KEY));
      if (v !== null) {
        _memBest = v;
        return v;
      }
    } catch {
    }
    try {
      const v = _parseLevel(sessionStorage.getItem(SAVE_KEY));
      if (v !== null) {
        _memBest = v;
        return v;
      }
    } catch {
    }
    const cv = _readCookie();
    if (cv !== null) {
      _memBest = cv;
      return cv;
    }
    return _memBest;
  }
  function saveBestLevel(lvl) {
    _memBest = lvl;
    try {
      localStorage.setItem(SAVE_KEY, String(lvl));
    } catch {
    }
    try {
      sessionStorage.setItem(SAVE_KEY, String(lvl));
    } catch {
    }
    _writeCookie(lvl);
  }
  class LevelSelectScene extends Phaser.Scene {
    constructor() {
      super({ key: "LevelSelect" });
    }
    create() {
      const W = GAME_WIDTH, H = GAME_HEIGHT;
      const bestLevel = loadBestLevel();
      initAudio();
      startMusic();
      const bg = this.add.graphics();
      bg.fillGradientStyle(655392, 655392, 1706554, 1706554, 1);
      bg.fillRect(0, 0, W, H);
      const grid = this.add.graphics();
      grid.lineStyle(2, 2759242, 0.35);
      for (let x = 0; x < W; x += 70) grid.lineBetween(x, 0, x, H);
      for (let y = 0; y < H; y += 70) grid.lineBetween(0, y, W, y);
      this.addSF2Word("LEVEL", W * 0.5, 130, "#ffdd22", "#aa6600", "88px", 4);
      this.addSF2Word("SELECT", W * 0.5, 240, "#44ccff", "#0044aa", "88px", 4);
      const contY = 370;
      const contW = 520, contH = 96;
      const contGfx = this.add.graphics().setDepth(5);
      const drawCont = (pressed) => {
        contGfx.clear();
        contGfx.fillStyle(pressed ? 2254370 : 3377203, 1);
        contGfx.fillRoundedRect(W / 2 - contW / 2, contY - contH / 2, contW, contH, 20);
        contGfx.lineStyle(3, pressed ? 1131537 : 5614165, 1);
        contGfx.strokeRoundedRect(W / 2 - contW / 2, contY - contH / 2, contW, contH, 20);
      };
      drawCont(false);
      this.add.text(W / 2, contY - 12, `▶ CONTINUE`, {
        fontSize: "44px",
        fontFamily: "Arial Black, Arial",
        color: "#ffffff",
        stroke: "#003300",
        strokeThickness: 5
      }).setOrigin(0.5, 0.5).setDepth(6);
      this.add.text(W / 2, contY + 24, `LEVEL ${bestLevel}`, {
        fontSize: "26px",
        fontFamily: "Arial",
        color: "#aaffaa"
      }).setOrigin(0.5, 0.5).setDepth(6);
      const contZone = this.add.zone(W / 2, contY, contW, contH).setInteractive({ useHandCursor: true });
      contZone.on("pointerdown", () => drawCont(true));
      contZone.on("pointerup", () => {
        drawCont(false);
        this.launchLevel(bestLevel);
      });
      contZone.on("pointerout", () => drawCont(false));
      const COLS = 5;
      const BTN = 110;
      const GAP = 14;
      const GRID_TOP_Y = 490;
      const totalShow = Math.min(bestLevel + 4, 30);
      const rows = Math.ceil(totalShow / COLS);
      const gridW = COLS * BTN + (COLS - 1) * GAP;
      const startX = Math.floor((W - gridW) / 2) + BTN / 2;
      for (let i = 0; i < totalShow; i++) {
        const lvl = i + 1;
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const bx = startX + col * (BTN + GAP);
        const by = GRID_TOP_Y + row * (BTN + GAP);
        const unlocked = lvl <= bestLevel;
        const isFrontier = lvl === bestLevel;
        const btnGfx = this.add.graphics().setDepth(5);
        const fillCol = isFrontier ? 11167232 : unlocked ? 1723002 : 1710638;
        const strokeCol = isFrontier ? 16768290 : unlocked ? 4491468 : 3355477;
        const drawBtn = (pressed) => {
          btnGfx.clear();
          btnGfx.fillStyle(pressed ? 3355494 : fillCol, 1);
          btnGfx.fillRoundedRect(bx - BTN / 2, by - BTN / 2, BTN, BTN, 14);
          btnGfx.lineStyle(isFrontier ? 3 : 2, strokeCol, 1);
          btnGfx.strokeRoundedRect(bx - BTN / 2, by - BTN / 2, BTN, BTN, 14);
        };
        drawBtn(false);
        if (unlocked) {
          this.add.text(bx, by - 8, String(lvl), {
            fontSize: "40px",
            fontFamily: "Arial Black",
            color: isFrontier ? "#ffdd22" : "#ffffff",
            stroke: "#000000",
            strokeThickness: 4
          }).setOrigin(0.5).setDepth(6);
          const { poopCount } = difficultyFor(lvl);
          this.add.text(bx, by + 28, "💩".repeat(Math.min(poopCount, 4)), {
            fontSize: "18px"
          }).setOrigin(0.5).setDepth(6);
          const zone = this.add.zone(bx, by, BTN, BTN).setInteractive({ useHandCursor: true });
          zone.on("pointerdown", () => drawBtn(true));
          zone.on("pointerup", () => {
            drawBtn(false);
            this.launchLevel(lvl);
          });
          zone.on("pointerout", () => drawBtn(false));
        } else {
          this.add.text(bx, by, "🔒", { fontSize: "36px" }).setOrigin(0.5).setDepth(6);
        }
      }
      const gridBottom = GRID_TOP_Y + rows * (BTN + GAP);
      if (gridBottom > H - 160) {
        this.add.text(W / 2, H - 130, "scroll to see more levels", {
          fontSize: "24px",
          fontFamily: "Arial",
          color: "#556677"
        }).setOrigin(0.5).setDepth(6);
      }
      const resetW = 360, resetH = 58;
      const resetX = W / 2, resetY = H - 56;
      const resetGfx = this.add.graphics().setDepth(7);
      const resetTxt = this.add.text(resetX, resetY, "🗑 RESET PROGRESS", {
        fontSize: "24px",
        fontFamily: "Arial Black, Arial",
        color: "#884444",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(8);
      let confirmPending = false;
      let confirmTimer = null;
      const drawReset = (pressed, confirm) => {
        resetGfx.clear();
        resetGfx.fillStyle(pressed ? 5570560 : confirm ? 6684672 : 1706506, 0.9);
        resetGfx.fillRoundedRect(resetX - resetW / 2, resetY - resetH / 2, resetW, resetH, 10);
        resetGfx.lineStyle(2, confirm ? 16729156 : 5579298, 1);
        resetGfx.strokeRoundedRect(resetX - resetW / 2, resetY - resetH / 2, resetW, resetH, 10);
      };
      drawReset(false, false);
      const resetZone = this.add.zone(resetX, resetY, resetW, resetH).setInteractive({ useHandCursor: true }).setDepth(9);
      resetZone.on("pointerdown", () => drawReset(true, confirmPending));
      resetZone.on("pointerout", () => drawReset(false, confirmPending));
      resetZone.on("pointerup", () => {
        if (!confirmPending) {
          confirmPending = true;
          drawReset(false, true);
          resetTxt.setText("⚠️ TAP AGAIN TO CONFIRM");
          resetTxt.setStyle({ ...resetTxt.style, color: "#ff6666" });
          confirmTimer = setTimeout(() => {
            confirmPending = false;
            drawReset(false, false);
            resetTxt.setText("🗑 RESET PROGRESS");
            resetTxt.setStyle({ ...resetTxt.style, color: "#884444" });
          }, 3e3);
        } else {
          if (confirmTimer) clearTimeout(confirmTimer);
          saveBestLevel(1);
          this.scene.restart();
        }
      });
    }
    launchLevel(lvl) {
      this.registry.set("startLevel", lvl);
      this.scene.start("Game");
    }
    // SF2-style word — same as TitleScene
    addSF2Word(text, cx, cy, faceColor, shadowColor, fontSize, depth) {
      const STROKE = 16, SDX = 6, SDY = 7;
      const base = { fontFamily: "Arial Black, Impact, Arial", fontStyle: "italic" };
      this.add.text(cx + SDX + 2, cy + SDY + 2, text, { ...base, fontSize, color: "#000000", stroke: "#000000", strokeThickness: STROKE + 4 }).setOrigin(0.5).setDepth(depth);
      this.add.text(cx + SDX, cy + SDY, text, { ...base, fontSize, color: shadowColor, stroke: "#000000", strokeThickness: STROKE }).setOrigin(0.5).setDepth(depth + 0.1);
      this.add.text(cx, cy, text, { ...base, fontSize, color: faceColor, stroke: "#000000", strokeThickness: STROKE }).setOrigin(0.5).setDepth(depth + 0.2);
      this.add.text(cx, cy - 3, text, { ...base, fontSize, color: "#ffffff", stroke: "#ffffff", strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(depth + 0.3).setAlpha(0.22);
    }
  }
  const config = createGameConfig();
  config.scene = [
    TitleScene,
    LevelSelectScene,
    { key: "Game", create, update }
  ];
  new Phaser.Game(config);
})();
//# sourceMappingURL=game.js.map
