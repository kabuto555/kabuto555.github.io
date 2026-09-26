(function() {
  "use strict";
  const GAME_WIDTH = 786;
  const GAME_HEIGHT = 1704;
  const GRID_COLS = 7;
  const GRID_ROWS = 13;
  const GRID_EMPTY_ROWS = 3;
  const CELL_GAP = 6;
  const CELL_SIZE = 96;
  const GRID_ORIGIN_X = Math.floor((GAME_WIDTH - GRID_COLS * CELL_SIZE) / 2);
  const GRID_ORIGIN_Y = 300;
  const SCORE_BASE = 10;
  function comboMultiplier(c) {
    return c * c;
  }
  const LEVEL_CONFIG = [
    { scoreThreshold: 0, intervalMs: 18e3, rowsAdded: 1, clearRefillRows: 4, unlockedColors: 3 },
    // level 1
    { scoreThreshold: 800, intervalMs: 14e3, rowsAdded: 1, clearRefillRows: 5, unlockedColors: 3 },
    // level 2
    { scoreThreshold: 2e3, intervalMs: 11e3, rowsAdded: 1, clearRefillRows: 6, unlockedColors: 4 },
    // level 3 — purple unlocked
    { scoreThreshold: 4500, intervalMs: 8e3, rowsAdded: 1, clearRefillRows: 7, unlockedColors: 4 },
    // level 4
    { scoreThreshold: 9e3, intervalMs: 6e3, rowsAdded: 1, clearRefillRows: 8, unlockedColors: 5 },
    // level 5 — blue unlocked
    { scoreThreshold: 16e3, intervalMs: 5e3, rowsAdded: 1, clearRefillRows: 8, unlockedColors: 5 },
    // level 6
    { scoreThreshold: 26e3, intervalMs: 4e3, rowsAdded: 1, clearRefillRows: 9, unlockedColors: 6 }
    // level 7 — orange unlocked
  ];
  const BLOCK_COLORS = [
    { fill: 15087942, border: 11871536, name: "Red" },
    // 0 — always active
    { fill: 2792847, border: 1929320, name: "Teal" },
    // 1 — always active
    { fill: 15320170, border: 12884540, name: "Gold" },
    // 2 — always active
    { fill: 10182117, border: 6961835, name: "Purple" },
    // 3 — unlocked level 3
    { fill: 4756975, border: 2779839, name: "Blue" },
    // 4 — unlocked level 5
    { fill: 16024671, border: 12868149, name: "Orange" }
    // 5 — unlocked level 7
  ];
  const COLORS = {
    ui: { hud: 989475, panel: 1978175 }
  };
  const TEXT_STYLES = {
    heading: { fontSize: "40px", fontFamily: "Arial", color: "#ffffff", fontStyle: "bold" },
    score: { fontSize: "48px", fontFamily: "Arial Black", color: "#ffffff" },
    hud: { fontSize: "28px", fontFamily: "Arial", color: "#aaccee" }
  };
  function createGameConfig() {
    return {
      type: Phaser.CANVAS,
      parent: "game",
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#87ceeb",
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
  let scene;
  let state;
  let titleActive = true;
  let titleContainer = null;
  let titlePoopTimer = null;
  let audioCtx = null;
  let bgmScheduler = null;
  let bgmBarIndex = 0;
  let bgmNextTime = 0;
  let bgmTempo = 88;
  let bgmMasterGain = null;
  let bgmRunning = false;
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function bgmKick(ctx, master, t) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(master);
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.88, t + 4e-3);
    gain.gain.exponentialRampToValueAtTime(1e-3, t + 0.42);
    osc.start(t);
    osc.stop(t + 0.44);
    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.connect(cg);
    cg.connect(master);
    click.type = "sine";
    click.frequency.setValueAtTime(520, t);
    click.frequency.exponentialRampToValueAtTime(60, t + 0.018);
    cg.gain.setValueAtTime(0.38, t);
    cg.gain.exponentialRampToValueAtTime(1e-3, t + 0.022);
    click.start(t);
    click.stop(t + 0.025);
  }
  function bgmSnare(ctx, master, t) {
    const bufLen = Math.ceil(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.5, t + 3e-3);
    ng.gain.exponentialRampToValueAtTime(1e-3, t + 0.22);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(master);
    src.start(t);
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.connect(og);
    og.connect(master);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.055);
    og.gain.setValueAtTime(0.32, t);
    og.gain.exponentialRampToValueAtTime(1e-3, t + 0.07);
    osc.start(t);
    osc.stop(t + 0.08);
  }
  function bgmBass(ctx, master, t, freq, dur) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(master);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.62, t + 0.035);
    gain.gain.setValueAtTime(0.62, t + dur - 0.06);
    gain.gain.exponentialRampToValueAtTime(1e-3, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function bgmPiano(ctx, master, t, freqs, dur) {
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(master);
      osc.type = "triangle";
      osc.frequency.value = f;
      const onset = t + i * 0.012;
      const vol = 0.13 / freqs.length;
      gain.gain.setValueAtTime(0, onset);
      gain.gain.linearRampToValueAtTime(vol * 1.6, onset + 8e-3);
      gain.gain.exponentialRampToValueAtTime(vol, onset + 0.06);
      gain.gain.setValueAtTime(vol, onset + dur - 0.12);
      gain.gain.exponentialRampToValueAtTime(1e-3, onset + dur);
      osc.start(onset);
      osc.stop(onset + dur + 0.05);
    });
  }
  function bgmPad(ctx, master, t, freqs, dur) {
    freqs.forEach((f, fi) => {
      [-5, 5].forEach((detuneCents) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(master);
        osc.type = "sine";
        osc.frequency.value = f * Math.pow(2, detuneCents / 1200);
        const vol = 0.038 / freqs.length;
        const attack = dur * 0.3;
        const release = dur * 0.28;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.setValueAtTime(vol, t + dur - release);
        gain.gain.linearRampToValueAtTime(0, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    });
  }
  const BGM_KICKS = [
    0,
    2.5,
    // bar 0: 1, and-of-2
    4,
    6.5,
    // bar 1
    8,
    10.5,
    // bar 2
    12,
    14.5
    // bar 3
  ];
  const BGM_SNARES = [1, 3, 5, 7, 9, 11, 13, 15];
  const BGM_BASS_LINE = [
    // bar 0: Cm — C2=65.4
    [0, 65.4, 2.8],
    [3, 65.4, 0.9],
    // bar 1: Ab — Ab2=51.9 (Ab2=~52)
    [4, 51.9, 2.8],
    [7, 51.9, 0.9],
    // bar 2: Eb — Eb2=38.9
    [8, 77.8, 2.8],
    // Eb3=77.8 (one octave up, fuller sound)
    [11, 77.8, 0.9],
    // bar 3: Bb — Bb2=58.3
    [12, 58.3, 2.8],
    [15, 58.3, 0.9]
  ];
  const BGM_PIANO = [
    // bar 0: Cm — C Eb G (minor triad)
    [0, [262, 311, 392], 3.6],
    // bar 1: Ab — Ab C Eb (major triad)
    [4, [415, 523, 622], 3.6],
    // Ab4 C5 Eb5 — upper voicing for brightness
    // bar 2: Eb — Eb G Bb
    [8, [311, 392, 466], 3.6],
    // bar 3: Bb — Bb D F
    [12, [466, 587, 698], 3.6]
    // Bb4 D5 F5
  ];
  const BGM_PAD = [
    // Lower octave voicing for depth separation from piano
    [0, [131, 156, 196], 4.2],
    // Cm: C3 Eb3 G3
    [4, [104, 131, 156], 4.2],
    // Ab: Ab2 C3 Eb3
    [8, [156, 196, 233], 4.2],
    // Eb: Eb3 G3 Bb3
    [12, [117, 147, 175], 4.2]
    // Bb: Bb2 D3 F3
  ];
  function bgmScheduleLoop(ctx, master, startT) {
    const bps = bgmTempo / 60;
    const beatSec = 1 / bps;
    const loopSec = 4 * 4 * beatSec;
    BGM_KICKS.forEach((b) => bgmKick(ctx, master, startT + b * beatSec));
    BGM_SNARES.forEach((b) => bgmSnare(ctx, master, startT + b * beatSec));
    BGM_BASS_LINE.forEach(
      ([b, freq, dur]) => bgmBass(ctx, master, startT + b * beatSec, freq, dur * beatSec)
    );
    BGM_PIANO.forEach(
      ([b, freqs, dur]) => bgmPiano(ctx, master, startT + b * beatSec, freqs, dur * beatSec)
    );
    BGM_PAD.forEach(
      ([b, freqs, dur]) => bgmPad(ctx, master, startT + b * beatSec, freqs, dur * beatSec)
    );
    return loopSec;
  }
  function startBGM() {
    if (bgmRunning) return;
    try {
      let tick = function() {
        if (!bgmRunning || !bgmMasterGain) return;
        const ctx2 = getAudioCtx();
        const scheduleUntil = ctx2.currentTime + LOOKAHEAD_MS / 1e3;
        while (bgmNextTime < scheduleUntil) {
          bgmTempo = 88 + ((state == null ? void 0 : state.level) ?? 0) * 1;
          const loopDur = bgmScheduleLoop(ctx2, bgmMasterGain, bgmNextTime);
          bgmNextTime += loopDur;
          bgmBarIndex++;
        }
      };
      const ctx = getAudioCtx();
      bgmRunning = true;
      bgmNextTime = ctx.currentTime + 0.05;
      bgmMasterGain = ctx.createGain();
      bgmMasterGain.gain.value = 0.38;
      bgmMasterGain.connect(ctx.destination);
      const LOOKAHEAD_MS = 120;
      const INTERVAL_MS = 80;
      tick();
      bgmScheduler = window.setInterval(tick, INTERVAL_MS);
    } catch (_) {
    }
  }
  function stopBGM() {
    bgmRunning = false;
    if (bgmScheduler !== null) {
      clearInterval(bgmScheduler);
      bgmScheduler = null;
    }
    if (bgmMasterGain) {
      try {
        const ctx = getAudioCtx();
        bgmMasterGain.gain.setValueAtTime(bgmMasterGain.gain.value, ctx.currentTime);
        bgmMasterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      } catch (_) {
      }
      bgmMasterGain = null;
    }
  }
  function sfxGoosePoop() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
      const splatStart = now + 0.18;
      const bufLen = Math.ceil(ctx.sampleRate * 0.14);
      const splatBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = splatBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = splatBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, splatStart);
      filter.frequency.exponentialRampToValueAtTime(180, splatStart + 0.13);
      const splatGain = ctx.createGain();
      splatGain.gain.setValueAtTime(0.55, splatStart);
      splatGain.gain.exponentialRampToValueAtTime(1e-3, splatStart + 0.14);
      src.connect(filter);
      filter.connect(splatGain);
      splatGain.connect(ctx.destination);
      src.start(splatStart);
    } catch (_) {
    }
  }
  function sfxBlockClear(blockCount) {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const count = Math.max(1, Math.min(blockCount, 20));
      const baseFreq = 320 + count * 28;
      const steps = Math.min(count, 8);
      for (let i = 0; i < steps; i++) {
        const t = now + i * 0.045;
        const freq = baseFreq * Math.pow(1.12, i);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.08, t + 0.12);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(1e-3, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.24);
      }
      const popT = now + steps * 0.045;
      const popOsc = ctx.createOscillator();
      const popGain = ctx.createGain();
      popOsc.connect(popGain);
      popGain.connect(ctx.destination);
      popOsc.type = "sine";
      popOsc.frequency.setValueAtTime(baseFreq * Math.pow(1.12, steps), popT);
      popOsc.frequency.exponentialRampToValueAtTime(baseFreq * Math.pow(1.12, steps) * 1.5, popT + 0.06);
      popGain.gain.setValueAtTime(0.3, popT);
      popGain.gain.exponentialRampToValueAtTime(1e-3, popT + 0.18);
      popOsc.start(popT);
      popOsc.stop(popT + 0.2);
    } catch (_) {
    }
  }
  function sfxConstructionRow() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.type = "sine";
      thudOsc.frequency.setValueAtTime(90, now);
      thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
      thudGain.gain.setValueAtTime(0.7, now);
      thudGain.gain.exponentialRampToValueAtTime(1e-3, now + 0.18);
      thudOsc.start(now);
      thudOsc.stop(now + 0.2);
      const rattleStart = now + 0.05;
      const rattleBufLen = Math.ceil(ctx.sampleRate * 0.18);
      const rattleBuf = ctx.createBuffer(1, rattleBufLen, ctx.sampleRate);
      const rattleData = rattleBuf.getChannelData(0);
      for (let i = 0; i < rattleBufLen; i++) rattleData[i] = Math.random() * 2 - 1;
      const rattleSrc = ctx.createBufferSource();
      rattleSrc.buffer = rattleBuf;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(2800, rattleStart);
      bandpass.Q.value = 3.5;
      const rattleGain = ctx.createGain();
      rattleGain.gain.setValueAtTime(0.32, rattleStart);
      rattleGain.gain.exponentialRampToValueAtTime(1e-3, rattleStart + 0.18);
      rattleSrc.connect(bandpass);
      bandpass.connect(rattleGain);
      rattleGain.connect(ctx.destination);
      rattleSrc.start(rattleStart);
      const whistleStart = now + 0.22;
      const whistleOsc = ctx.createOscillator();
      const whistleGain = ctx.createGain();
      whistleOsc.connect(whistleGain);
      whistleGain.connect(ctx.destination);
      whistleOsc.type = "sine";
      whistleOsc.frequency.setValueAtTime(880, whistleStart);
      whistleOsc.frequency.exponentialRampToValueAtTime(1480, whistleStart + 0.14);
      whistleGain.gain.setValueAtTime(0.18, whistleStart);
      whistleGain.gain.exponentialRampToValueAtTime(1e-3, whistleStart + 0.18);
      whistleOsc.start(whistleStart);
      whistleOsc.stop(whistleStart + 0.2);
    } catch (_) {
    }
  }
  let gooseContainer;
  let gooseImg;
  let gooseFlapTimer = null;
  let gridContainer;
  let poopSprite = null;
  let constructionCrewGraphic = null;
  let constructionMeterFill = null;
  let constructionMeterBg = null;
  let workerContainers = [];
  let workerSparkTimer = null;
  let constructionTimer = null;
  let scoreText;
  let levelText;
  let nextLevelText;
  let levelProgressBar;
  let poopIndicator;
  let poopIndicatorLabel;
  let messageText;
  let dangerOverlay;
  const CELL_INNER = CELL_SIZE - CELL_GAP;
  function activeColors(level) {
    const lvl = level ?? (state == null ? void 0 : state.level) ?? 0;
    return LEVEL_CONFIG[lvl].unlockedColors;
  }
  const POOP_HANDLERS = {
    /**
     * Detonator: checks the 4 cells adjacent to the landing position.
     * For each neighbor that matches the poop color, flood-fills that
     * connected group and collects all cells in it to destroy.
     */
    detonator: (poop, grid, landRow, landCol) => {
      const adjacents = [
        [landRow - 1, landCol],
        [landRow + 1, landCol],
        [landRow, landCol - 1],
        [landRow, landCol + 1]
      ];
      const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
      const result = [];
      for (const [ar, ac] of adjacents) {
        if (ar >= 0 && ar < GRID_ROWS && ac >= 0 && ac < GRID_COLS && !visited[ar][ac] && (grid[ar][ac].type === "normal" || grid[ar][ac].type === "poop") && grid[ar][ac].colorIndex === poop.color) {
          floodFillGroup(grid, ar, ac, poop.color, visited, result);
        }
      }
      return result;
    }
  };
  function create() {
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
    setupInput();
    buildTitleScreen();
  }
  function update(_time, _delta) {
    updateConstructionMeter();
    updateDangerOverlay();
  }
  function buildTextures() {
    BLOCK_COLORS.forEach((col, i) => {
      const g = scene.make.graphics({}, false);
      g.fillStyle(col.fill, 1);
      g.fillRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
      g.fillStyle(0, 0.18);
      const winW = CELL_INNER * 0.22;
      const winH = CELL_INNER * 0.22;
      [[0.18, 0.18], [0.58, 0.18], [0.18, 0.56], [0.58, 0.56]].forEach(([fx, fy]) => {
        g.fillRoundedRect(CELL_INNER * fx, CELL_INNER * fy, winW, winH, 2);
      });
      g.fillStyle(16777215, 0.12);
      g.fillRoundedRect(0, 0, CELL_INNER, CELL_INNER * 0.3, { tl: 6, tr: 6, bl: 0, br: 0 });
      g.lineStyle(2, col.border, 1);
      g.strokeRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
      g.generateTexture(`block_${i}`, CELL_INNER, CELL_INNER);
      g.destroy();
    });
    {
      const g = scene.make.graphics({}, false);
      g.lineStyle(1, 3820122, 0.35);
      g.strokeRoundedRect(0, 0, CELL_INNER, CELL_INNER, 6);
      g.generateTexture("block_empty", CELL_INNER, CELL_INNER);
      g.destroy();
    }
    {
      const sz = 64;
      const g = scene.make.graphics({}, false);
      const tipX = 32, tipY = 4;
      const bulgeX = 32, bulgeY = 40, bulgeR = 18;
      g.fillStyle(15263968, 1);
      g.fillPoints([
        { x: tipX, y: tipY },
        // pointed tip
        { x: tipX + 8, y: tipY + 14 },
        // right shoulder
        { x: tipX + bulgeR, y: bulgeY },
        // right side of bulge
        { x: tipX + bulgeR, y: bulgeY + 8 },
        { x: tipX + 12, y: bulgeY + 18 },
        // bottom-right
        { x: tipX, y: bulgeY + 20 },
        // bottom centre
        { x: tipX - 12, y: bulgeY + 18 },
        // bottom-left
        { x: tipX - bulgeR, y: bulgeY + 8 },
        { x: tipX - bulgeR, y: bulgeY },
        // left side of bulge
        { x: tipX - 8, y: tipY + 14 }
        // left shoulder
      ], true, true);
      g.fillStyle(16777215, 0.9);
      g.fillEllipse(bulgeX - 6, bulgeY - 4, 10, 8);
      g.fillStyle(10129536, 1);
      g.fillEllipse(bulgeX + 2, bulgeY + 4, 8, 7);
      g.generateTexture("poop_detonator", sz, sz);
      g.destroy();
    }
    BLOCK_COLORS.forEach((col, i) => {
      const sz = 64;
      const g = scene.make.graphics({}, false);
      const tipX = 32, tipY = 4;
      const bulgeY = 40, bulgeR = 18;
      g.lineStyle(8, col.fill, 1);
      g.strokePoints([
        { x: tipX, y: tipY },
        { x: tipX + 8, y: tipY + 14 },
        { x: tipX + bulgeR, y: bulgeY },
        { x: tipX + bulgeR, y: bulgeY + 8 },
        { x: tipX + 12, y: bulgeY + 18 },
        { x: tipX, y: bulgeY + 20 },
        { x: tipX - 12, y: bulgeY + 18 },
        { x: tipX - bulgeR, y: bulgeY + 8 },
        { x: tipX - bulgeR, y: bulgeY },
        { x: tipX - 8, y: tipY + 14 }
      ], true, true);
      g.generateTexture(`poop_ring_${i}`, sz, sz);
      g.destroy();
    });
  }
  function initState() {
    lastPoopColor = -1;
    lastPoopStreak = 0;
    const grid = [];
    const colStagger = [];
    for (let c = 0; c < GRID_COLS; c++) {
      colStagger.push(Phaser.Math.Between(0, 2));
    }
    for (let r = 0; r < GRID_ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (r < GRID_EMPTY_ROWS + 3 + colStagger[c]) {
          grid[r][c] = { type: "empty", colorIndex: -1, sprite: null };
        } else {
          const colorIndex = Phaser.Math.Between(0, activeColors(0) - 1);
          grid[r][c] = { type: "normal", colorIndex, sprite: null };
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
      queuedAt: 0
    };
  }
  let lastPoopColor = -1;
  let lastPoopStreak = 0;
  function pickRandomPoop(grid) {
    const g = grid ?? (state == null ? void 0 : state.grid);
    const presentColors = /* @__PURE__ */ new Set();
    if (g) {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const cell = g[r][c];
          if (cell.type === "normal" || cell.type === "poop") {
            presentColors.add(cell.colorIndex);
          }
        }
      }
    }
    const pool = presentColors.size > 0 ? Array.from(presentColors) : BLOCK_COLORS.map((_, i) => i);
    let pickPool = pool;
    if (lastPoopStreak >= 2 && pool.length > 1) {
      pickPool = pool.filter((c) => c !== lastPoopColor);
    }
    const colorIndex = pickPool[Phaser.Math.Between(0, pickPool.length - 1)];
    if (colorIndex === lastPoopColor) {
      lastPoopStreak++;
    } else {
      lastPoopColor = colorIndex;
      lastPoopStreak = 1;
    }
    return { kind: "detonator", color: colorIndex };
  }
  function buildGrid() {
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
  function buildGridOverlay() {
    const g = scene.add.graphics();
    const x0 = GRID_ORIGIN_X;
    const y0 = GRID_ORIGIN_Y + GRID_EMPTY_ROWS * CELL_SIZE;
    const x1 = GRID_ORIGIN_X + GRID_COLS * CELL_SIZE;
    const y1 = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
    g.lineStyle(1, 16777215, 0.12);
    for (let c = 1; c < GRID_COLS; c++) {
      const lx = GRID_ORIGIN_X + c * CELL_SIZE;
      g.lineBetween(lx, y0, lx, y1);
    }
    for (let r = GRID_EMPTY_ROWS + 1; r < GRID_ROWS; r++) {
      const ly = GRID_ORIGIN_Y + r * CELL_SIZE;
      g.lineBetween(x0, ly, x1, ly);
    }
  }
  function cellX(col) {
    return GRID_ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2;
  }
  function cellY(row) {
    return GRID_ORIGIN_Y + row * CELL_SIZE + CELL_SIZE / 2;
  }
  function makeCellSprite(cell, row, col) {
    const x = cellX(col);
    const y = cellY(row);
    const textureKey = cell.type === "empty" ? "block_empty" : `block_${cell.colorIndex}`;
    const img = scene.add.image(0, 0, textureKey);
    const container = scene.add.container(x, y, [img]);
    container.setSize(CELL_INNER, CELL_INNER);
    return container;
  }
  function refreshCellSprite(row, col) {
    const cell = state.grid[row][col];
    if (cell.sprite) {
      cell.sprite.destroy();
      cell.sprite = null;
    }
    const sprite = makeCellSprite(cell, row, col);
    cell.sprite = sprite;
    gridContainer.add(sprite);
  }
  function buildGoose() {
    if (gooseContainer) gooseContainer.destroy();
    if (gooseFlapTimer) {
      gooseFlapTimer.remove();
      gooseFlapTimer = null;
    }
    const W = 160, H = 140;
    if (!scene.textures.exists("goose_idle_0")) {
      drawGooseTexture("goose_idle_0", W, H, "idle_0");
    }
    if (!scene.textures.exists("goose_idle_1")) {
      drawGooseTexture("goose_idle_1", W, H, "idle_1");
    }
    if (!scene.textures.exists("goose_poop")) {
      drawGooseTexture("goose_poop", W, H, "poop");
    }
    gooseImg = scene.add.image(0, 0, "goose_idle_0").setScale(0.85);
    gooseContainer = scene.add.container(
      cellX(state.gooseCol),
      GRID_ORIGIN_Y - 80,
      [gooseImg]
    );
    scene.tweens.add({
      targets: gooseContainer,
      y: gooseContainer.y - 12,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    startGooseFlap();
  }
  function drawGooseTexture(key, W, H, variant) {
    const g = scene.make.graphics({}, false);
    const wingOffsetY = variant === "idle_1" ? -14 : variant === "poop" ? 6 : 0;
    const wingW = variant === "poop" ? 130 : 80;
    const wingH = variant === "poop" ? 22 : 30;
    const bodyOffsetY = variant === "poop" ? 6 : 0;
    g.fillStyle(8022602, 1);
    g.fillEllipse(78, 88 + bodyOffsetY, 110, 68);
    g.fillStyle(13941898, 1);
    g.fillEllipse(108, 94 + bodyOffsetY, 42, 52);
    g.fillStyle(5918262, 1);
    g.fillEllipse(68, 82 + wingOffsetY, wingW, wingH);
    g.fillStyle(1118481, 1);
    g.fillTriangle(22, 80, 18, 108, 50, 92);
    g.fillStyle(1118481, 1);
    g.fillEllipse(104, 50, 28, 72);
    g.fillStyle(1118481, 1);
    g.fillCircle(112, 26, 26);
    g.fillStyle(16777215, 1);
    g.fillEllipse(108, 36, 30, 18);
    g.fillStyle(1710618, 1);
    if (variant === "poop") {
      g.fillTriangle(132, 18, 155, 23, 133, 27);
      g.fillTriangle(132, 28, 155, 23, 133, 34);
      g.fillStyle(13386820, 1);
      g.fillEllipse(146, 27, 14, 5);
    } else {
      g.fillTriangle(132, 20, 155, 26, 132, 32);
    }
    g.fillStyle(16777215, 1);
    g.fillCircle(120, 20, 5);
    g.fillStyle(0, 1);
    g.fillCircle(121, 20, 3);
    g.fillStyle(3355443, 1);
    g.fillRect(74, 116, 8, 16);
    g.fillRect(92, 116, 8, 16);
    g.fillStyle(9072720, 1);
    g.fillEllipse(72, 133, 22, 8);
    g.fillEllipse(92, 133, 22, 8);
    if (variant === "poop") {
      g.fillStyle(15263968, 1);
      g.fillCircle(85, 120, 7);
    }
    g.generateTexture(key, W, H);
    g.destroy();
  }
  function startGooseFlap() {
    if (gooseFlapTimer) {
      gooseFlapTimer.remove();
    }
    let frame = 0;
    gooseFlapTimer = scene.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        if (state.animating || state.gameOver) return;
        frame = 1 - frame;
        gooseImg.setTexture(frame === 0 ? "goose_idle_0" : "goose_idle_1");
      }
    });
  }
  function playGoosePoopAnim(durationMs) {
    if (gooseFlapTimer) gooseFlapTimer.paused = true;
    gooseImg.setTexture("goose_poop");
    sfxGoosePoop();
    scene.tweens.add({
      targets: gooseContainer,
      scaleY: 0.88,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut"
    });
    scene.time.delayedCall(durationMs, () => {
      gooseImg.setTexture("goose_idle_0");
      if (gooseFlapTimer) gooseFlapTimer.paused = false;
    });
  }
  function moveGooseTo(col) {
    state.gooseCol = col;
    scene.tweens.add({
      targets: gooseContainer,
      x: cellX(col),
      duration: 160,
      ease: "Sine.easeOut"
    });
  }
  function buildHUD() {
    const panelH = 130;
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.ui.hud, 0.85);
    bg.fillRoundedRect(20, 20, GAME_WIDTH - 40, panelH, 16);
    scoreText = scene.add.text(GAME_WIDTH / 2, 72, "Score: 0", TEXT_STYLES.score).setOrigin(0.5);
    const rightX = GAME_WIDTH - 44;
    levelText = scene.add.text(rightX, 32, "Level 1", TEXT_STYLES.hud).setOrigin(1, 0);
    levelProgressBar = scene.add.graphics();
    nextLevelText = scene.add.text(rightX, 104, "", {
      fontSize: "19px",
      fontFamily: "Arial",
      color: "#aaccee"
    }).setOrigin(1, 0);
    dangerOverlay = scene.add.graphics().setDepth(9);
    messageText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "", {
      ...TEXT_STYLES.heading,
      color: "#ffffff",
      align: "center",
      wordWrap: { width: GAME_WIDTH - 80 },
      backgroundColor: "#00000088",
      padding: { x: 32, y: 20 }
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
  }
  function updateScoreHUD() {
    scoreText.setText(`Score: ${state.score}`);
    checkLevelUp();
    const barW = 180;
    const barH = 10;
    const rightX = GAME_WIDTH - 44;
    const barX = rightX - barW;
    const barY = 66;
    const nextIdx = state.level + 1;
    const atMax = nextIdx >= LEVEL_CONFIG.length;
    let fraction = 1;
    if (!atMax) {
      const lo = LEVEL_CONFIG[state.level].scoreThreshold;
      const hi = LEVEL_CONFIG[nextIdx].scoreThreshold;
      fraction = Math.min(1, Math.max(0, (state.score - lo) / (hi - lo)));
      const needed = hi - state.score;
      nextLevelText.setText(`${needed.toLocaleString()} pts to Lv ${nextIdx + 1}`);
    } else {
      nextLevelText.setText("MAX LEVEL");
    }
    levelProgressBar.clear();
    levelProgressBar.fillStyle(1713461, 1);
    levelProgressBar.fillRoundedRect(barX, barY, barW, barH, 4);
    const fillColor = atMax ? 16768256 : fraction < 0.5 ? 4508740 : fraction < 0.85 ? 16755200 : 16737843;
    const fillW = Math.max(0, barW * fraction);
    if (fillW > 4) {
      levelProgressBar.fillStyle(fillColor, 1);
      levelProgressBar.fillRoundedRect(barX, barY, fillW, barH, 4);
    }
    levelProgressBar.lineStyle(1, 4478310, 1);
    levelProgressBar.strokeRoundedRect(barX, barY, barW, barH, 4);
  }
  function showColorUnlockMessage(colorName, colorHex) {
    const hex = "#" + colorHex.toString(16).padStart(6, "0");
    const spawnY = GRID_ORIGIN_Y + 60;
    const txt = scene.add.text(GAME_WIDTH / 2, spawnY, `🎨 ${colorName.toUpperCase()}
UNLOCKED!`, {
      fontSize: "72px",
      fontFamily: "Arial Black",
      color: hex,
      stroke: "#000000",
      strokeThickness: 12,
      align: "center",
      lineSpacing: -4,
      shadow: { offsetX: 3, offsetY: 3, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(0.3);
    scene.tweens.add({
      targets: txt,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        scene.time.delayedCall(900, () => {
          scene.tweens.add({
            targets: txt,
            alpha: 0,
            scale: 1.4,
            y: spawnY - 60,
            duration: 300,
            ease: "Quad.easeIn",
            onComplete: () => txt.destroy()
          });
        });
      }
    });
  }
  function checkLevelUp() {
    let advanced = false;
    let colorUnlocked = false;
    const colorsBefore = LEVEL_CONFIG[state.level].unlockedColors;
    while (true) {
      const nextLevel = state.level + 1;
      if (nextLevel >= LEVEL_CONFIG.length) break;
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
  function buildPoopIndicator() {
    if (poopIndicator) poopIndicator.destroy();
    const x = GRID_ORIGIN_X + 64;
    const y = GRID_ORIGIN_Y - 80;
    const bg = scene.make.graphics({}, false);
    bg.fillStyle(COLORS.ui.panel, 0.9);
    bg.fillRoundedRect(-52, -38, 104, 76, 10);
    bg.lineStyle(2, 4478310, 1);
    bg.strokeRoundedRect(-52, -38, 104, 76, 10);
    const icon = scene.add.image(0, -4, "poop_detonator").setScale(0.65);
    if (state.pendingPoop) {
      const ringImg = scene.add.image(0, -4, `poop_ring_${state.pendingPoop.color}`).setScale(0.65);
      poopIndicatorLabel = scene.add.text(0, 32, nextPoopLabel(), {
        fontSize: "20px",
        fontFamily: "Arial",
        color: "#ffffff",
        fontStyle: "bold"
      }).setOrigin(0.5);
      poopIndicator = scene.add.container(x, y, [bg, icon, ringImg, poopIndicatorLabel]);
    } else {
      poopIndicatorLabel = scene.add.text(0, 32, "", {
        fontSize: "20px",
        fontFamily: "Arial",
        color: "#ffffff"
      }).setOrigin(0.5);
      poopIndicator = scene.add.container(x, y, [bg, icon, poopIndicatorLabel]);
    }
    poopIndicator.setSize(104, 76);
    scene.add.text(x, y - 56, "NEXT POOP", {
      fontSize: "18px",
      fontFamily: "Arial",
      color: "#ffffff",
      fontStyle: "bold",
      shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 3, fill: true }
    }).setOrigin(0.5);
  }
  function nextPoopLabel() {
    if (!state.pendingPoop) return "";
    const col = BLOCK_COLORS[state.pendingPoop.color];
    return col.name;
  }
  function refreshPoopIndicator() {
    buildPoopIndicator();
  }
  function buildTitleScreen() {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const bg = scene.add.graphics();
    bg.fillStyle(0, 1);
    bg.fillRect(0, 0, W, H);
    const skyG = scene.add.graphics();
    for (let y = 0; y < H * 0.62; y++) {
      const t = y / (H * 0.62);
      const r = Math.round(Phaser.Math.Linear(8, 184, t));
      const g2 = Math.round(Phaser.Math.Linear(10, 58, t));
      const b2 = Math.round(Phaser.Math.Linear(40, 32, t));
      skyG.fillStyle(r << 16 | g2 << 8 | b2, 1);
      skyG.fillRect(0, y, W, 1);
    }
    const cityG = scene.add.graphics();
    cityG.fillStyle(657938, 1);
    const buildings = [
      [0, 220, 90],
      [80, 260, 70],
      [140, 180, 110],
      [240, 300, 80],
      [310, 200, 100],
      [400, 280, 90],
      [480, 160, 120],
      [590, 240, 80],
      [660, 200, 100],
      [720, 180, 66]
    ];
    const cityBaseY = H * 0.68;
    buildings.forEach(([bx, bh, bw]) => {
      cityG.fillRect(bx, cityBaseY - bh, bw, bh + H);
      cityG.fillStyle(16769126, 1);
      for (let wy = cityBaseY - bh + 12; wy < cityBaseY - 10; wy += 22) {
        for (let wx = bx + 8; wx < bx + bw - 8; wx += 16) {
          if (Math.random() > 0.45) cityG.fillRect(wx, wy, 7, 10);
        }
      }
      cityG.fillStyle(657938, 1);
    });
    const gx = cx;
    const gy = H * 0.3;
    const gsShadow = scene.add.graphics();
    gsShadow.fillStyle(0, 0.28);
    gsShadow.fillEllipse(gx, H * 0.67, 260, 40);
    const gsBody = scene.add.graphics();
    gsBody.fillStyle(8022602, 1);
    gsBody.fillEllipse(gx, gy - 80, 240, 80);
    gsBody.fillStyle(13941898, 1);
    gsBody.fillEllipse(gx, gy, 300, 220);
    gsBody.fillStyle(9072720, 1);
    gsBody.fillRect(gx - 60, gy - 100, 14, 28);
    gsBody.fillRect(gx + 46, gy - 100, 14, 28);
    gsBody.fillTriangle(gx - 66, gy - 74, gx - 46, gy - 74, gx - 56, gy - 60);
    gsBody.fillTriangle(gx + 40, gy - 74, gx + 60, gy - 74, gx + 50, gy - 60);
    gsBody.fillStyle(1118481, 1);
    gsBody.fillPoints([
      { x: gx - 38, y: gy + 70 },
      // top-left where neck meets body
      { x: gx + 38, y: gy + 70 },
      // top-right
      { x: gx + 28, y: gy + 230 },
      // bottom-right (narrower at head)
      { x: gx - 28, y: gy + 230 }
      // bottom-left
    ], true, true);
    gsBody.fillCircle(gx, gy + 272, 80);
    gsBody.fillStyle(16777215, 1);
    gsBody.fillEllipse(gx, gy + 300, 90, 38);
    gsBody.fillStyle(16777215, 1);
    gsBody.fillEllipse(gx - 32, gy + 250, 34, 28);
    gsBody.fillEllipse(gx + 32, gy + 250, 34, 28);
    gsBody.fillStyle(1118481, 1);
    gsBody.fillTriangle(gx - 48, gy + 236, gx - 14, gy + 236, gx - 28, gy + 250);
    gsBody.fillTriangle(gx + 48, gy + 236, gx + 14, gy + 236, gx + 28, gy + 250);
    gsBody.fillStyle(0, 1);
    gsBody.fillCircle(gx - 28, gy + 258, 12);
    gsBody.fillCircle(gx + 28, gy + 258, 12);
    gsBody.fillStyle(16777215, 1);
    gsBody.fillCircle(gx - 22, gy + 254, 4);
    gsBody.fillCircle(gx + 34, gy + 254, 4);
    gsBody.fillStyle(3355443, 1);
    gsBody.fillEllipse(gx, gy + 320, 70, 28);
    gsBody.fillTriangle(gx - 35, gy + 320, gx + 35, gy + 320, gx, gy + 370);
    gsBody.fillStyle(1710618, 1);
    gsBody.fillTriangle(gx - 28, gy + 322, gx + 28, gy + 322, gx, gy + 360);
    gsBody.fillStyle(13382451, 1);
    gsBody.fillEllipse(gx, gy + 340, 28, 14);
    const WING_ROOT_L_X = gx - 110;
    const WING_ROOT_R_X = gx + 110;
    const WING_Y = gy - 28;
    const gsWingL = scene.add.graphics();
    gsWingL.fillStyle(5918262, 1);
    gsWingL.fillEllipse(-90, 0, 200, 70);
    gsWingL.fillStyle(3813408, 1);
    gsWingL.fillTriangle(-120, 10, -200, 55, -55, 42);
    gsWingL.x = WING_ROOT_L_X;
    gsWingL.y = WING_Y;
    const gsWingR = scene.add.graphics();
    gsWingR.fillStyle(5918262, 1);
    gsWingR.fillEllipse(90, 0, 200, 70);
    gsWingR.fillStyle(3813408, 1);
    gsWingR.fillTriangle(120, 10, 200, 55, 55, 42);
    gsWingR.x = WING_ROOT_R_X;
    gsWingR.y = WING_Y;
    const FLAP_UP = -55;
    scene.tweens.add({
      targets: gsWingL,
      y: WING_Y + FLAP_UP,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    scene.tweens.add({
      targets: gsWingR,
      y: WING_Y + FLAP_UP,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    const gooseGroup = scene.add.container(0, 0, [gsWingL, gsBody, gsWingR, gsShadow]);
    scene.tweens.add({
      targets: gooseGroup,
      y: -18,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    scene.tweens.add({
      targets: gooseGroup,
      x: 30,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    function spawnTitlePoop() {
      if (!titleActive) return;
      const px = gx + Phaser.Math.Between(-60, 60);
      const startY = gy + 375;
      const pg = scene.add.graphics();
      pg.fillStyle(15263952, 1);
      pg.fillEllipse(0, 44, 52, 64);
      pg.fillStyle(13948092, 1);
      pg.fillTriangle(0, -10, -22, 30, 22, 30);
      pg.fillStyle(16777215, 0.55);
      pg.fillEllipse(-6, 20, 16, 12);
      pg.x = px;
      pg.y = startY;
      pg.setDepth(101);
      scene.tweens.add({
        targets: pg,
        y: startY + 520,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0,
        duration: 900,
        ease: "Quad.easeIn",
        onComplete: () => pg.destroy()
      });
    }
    titlePoopTimer = scene.time.addEvent({
      delay: 800,
      loop: true,
      callback: spawnTitlePoop
    });
    spawnTitlePoop();
    const shadow1 = scene.add.text(cx + 5, H * 0.075 + 5, "BOMBER", {
      fontSize: "112px",
      fontFamily: "Arial Black",
      color: "#000000"
    }).setOrigin(0.5).setAlpha(0.45);
    const shadow2 = scene.add.text(cx + 5, H * 0.075 + 118 + 5, "G-0053", {
      fontSize: "96px",
      fontFamily: "Arial Black",
      color: "#000000"
    }).setOrigin(0.5).setAlpha(0.45);
    const titleLine1 = scene.add.text(cx, H * 0.075, "BOMBER", {
      fontSize: "112px",
      fontFamily: "Arial Black",
      color: "#ffe333",
      stroke: "#cc4400",
      strokeThickness: 10,
      shadow: { offsetX: 4, offsetY: 4, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5);
    const titleLine2 = scene.add.text(cx, H * 0.075 + 118, "G-0053", {
      fontSize: "96px",
      fontFamily: "Arial Black",
      color: "#ff6622",
      stroke: "#881100",
      strokeThickness: 10,
      shadow: { offsetX: 4, offsetY: 4, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5);
    const sub = scene.add.text(cx, H * 0.075 + 210, "🪿  THE GOOSE IS LOOSE  🪿", {
      fontSize: "30px",
      fontFamily: "Arial",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
      fontStyle: "bold"
    }).setOrigin(0.5);
    const tapText = scene.add.text(cx, H * 0.84, "TAP TO START", {
      fontSize: "52px",
      fontFamily: "Arial Black",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 8,
      shadow: { offsetX: 3, offsetY: 3, color: "#000000", blur: 6, fill: true }
    }).setOrigin(0.5);
    scene.tweens.add({
      targets: tapText,
      alpha: 0.1,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    const footer = scene.add.text(cx, H * 0.92, "CLEAR BLOCKS · DROP POOP · BEAT THE CREW", {
      fontSize: "24px",
      fontFamily: "Arial",
      color: "#888888",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5);
    titleContainer = scene.add.container(0, 0, [
      bg,
      skyG,
      cityG,
      gooseGroup,
      shadow1,
      shadow2,
      titleLine1,
      titleLine2,
      sub,
      tapText,
      footer
    ]);
    titleContainer.setDepth(100);
    titleContainer.setAlpha(0);
    titleContainer.y = 30;
    scene.tweens.add({
      targets: titleContainer,
      alpha: 1,
      y: 0,
      duration: 500,
      ease: "Quad.easeOut"
    });
  }
  function dismissTitleScreen() {
    if (!titleActive) return;
    titleActive = false;
    if (titlePoopTimer) {
      titlePoopTimer.remove();
      titlePoopTimer = null;
    }
    startBGM();
    if (titleContainer) {
      scene.tweens.add({
        targets: titleContainer,
        alpha: 0,
        y: -40,
        duration: 380,
        ease: "Quad.easeIn",
        onComplete: () => {
          if (titleContainer) {
            titleContainer.destroy(true);
            titleContainer = null;
          }
          startConstructionTimer();
        }
      });
    } else {
      startConstructionTimer();
    }
  }
  function setupInput() {
    scene.input.on("pointerdown", (pointer) => {
      if (titleActive) {
        dismissTitleScreen();
        return;
      }
      if (!bgmRunning) startBGM();
      if (state.gameOver) return;
      const col = pointerToCol(pointer.x);
      if (col < 0 || col >= GRID_COLS) return;
      if (state.grid[0][col].type !== "empty") return;
      if (state.animating) {
        state.queuedCol = col;
        state.queuedAt = performance.now();
        moveGooseTo(col);
        return;
      }
      moveGooseTo(col);
      scene.time.delayedCall(180, () => dropPoop(col));
    });
  }
  function pointerToCol(px) {
    return Math.floor((px - GRID_ORIGIN_X) / CELL_SIZE);
  }
  function dropPoop(col) {
    if (!state.pendingPoop) return;
    state.animating = true;
    const poop = state.pendingPoop;
    state.pendingPoop = pickRandomPoop();
    refreshPoopIndicator();
    let topOccupied = GRID_ROWS;
    for (let r = 0; r < GRID_ROWS; r++) {
      if (state.grid[r][col].type === "normal" || state.grid[r][col].type === "poop") {
        topOccupied = r;
        break;
      }
    }
    const landRow = Math.max(0, topOccupied - 1);
    const startX = cellX(col);
    const startY = gooseContainer.y + 30;
    const endY = cellY(landRow) - CELL_SIZE * 0.5;
    const poopImg = scene.add.image(0, 0, "poop_detonator");
    const ringImg = scene.add.image(0, 0, `poop_ring_${poop.color}`);
    poopSprite = scene.add.container(startX, startY, [poopImg, ringImg]);
    const rowsToTravel = Math.max(1, landRow + 1);
    const dropDuration = 120 + rowsToTravel * 60;
    playGoosePoopAnim(dropDuration + 200);
    scene.tweens.add({
      targets: poopSprite,
      y: endY,
      duration: dropDuration,
      ease: "Cubic.easeIn",
      onComplete: () => {
        if (poopSprite) {
          poopSprite.destroy();
          poopSprite = null;
        }
        activatePoop(poop, col, landRow);
      }
    });
  }
  function activatePoop(poop, col, landRow) {
    const handler = POOP_HANDLERS[poop.kind];
    if (!handler) {
      finishTurn();
      return;
    }
    const toDestroy = handler(poop, state.grid, landRow, col);
    if (toDestroy.length === 0) {
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
  function placeMissedPoop(poop, col, landRow, onDone) {
    const targetRow = landRow;
    if (state.grid[targetRow][col].sprite) {
      state.grid[targetRow][col].sprite.destroy();
      state.grid[targetRow][col].sprite = null;
    }
    state.grid[targetRow][col] = {
      type: "poop",
      colorIndex: poop.color,
      // remember the color for visual
      sprite: null
    };
    const poopCellImg = scene.add.image(0, 0, "poop_detonator").setScale(0.7);
    poopCellImg.setTint(BLOCK_COLORS[poop.color].fill);
    const ringImg2 = scene.add.image(0, 0, `poop_ring_${poop.color}`);
    ringImg2.setScale(0.75);
    const container = scene.add.container(
      cellX(col),
      cellY(targetRow) - CELL_SIZE,
      // start above, then drop in
      [poopCellImg, ringImg2]
    );
    container.setSize(CELL_INNER, CELL_INNER);
    state.grid[targetRow][col].sprite = container;
    gridContainer.add(container);
    scene.tweens.add({
      targets: container,
      y: cellY(targetRow),
      duration: 200,
      ease: "Bounce.easeOut",
      onComplete: onDone
    });
  }
  function floodFillGroup(grid, startR, startC, colorIndex, visited, result) {
    const queue = [[startR, startC]];
    visited[startR][startC] = true;
    while (queue.length > 0) {
      const [r, c] = queue.shift();
      result.push([r, c]);
      const neighbors = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1]
      ];
      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && !visited[nr][nc] && (grid[nr][nc].type === "normal" || grid[nr][nc].type === "poop") && grid[nr][nc].colorIndex === colorIndex) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
  }
  function destroyCells(cells, onComplete) {
    let completed = 0;
    const total = cells.length;
    sfxBlockClear(total);
    cells.forEach(([r, c]) => {
      const cell = state.grid[r][c];
      if (!cell.sprite) {
        completed++;
        if (completed === total) onComplete();
        return;
      }
      scene.tweens.add({
        targets: cell.sprite,
        scaleX: 1.4,
        scaleY: 1.4,
        alpha: 0,
        duration: 220,
        ease: "Power2",
        onComplete: () => {
          if (cell.sprite) {
            cell.sprite.destroy();
            cell.sprite = null;
          }
          state.grid[r][c] = { type: "empty", colorIndex: -1, sprite: null };
          completed++;
          if (completed === total) onComplete();
        }
      });
    });
  }
  const FALL_SPEED_PX_MS = 1.4;
  function applyGravity(onComplete) {
    let pending = 0;
    const movedPoops = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const survivors = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        const cell = state.grid[r][c];
        if (cell.type === "normal" || cell.type === "poop") {
          survivors.push({ colorIndex: cell.colorIndex, type: cell.type, sprite: cell.sprite });
          state.grid[r][c].sprite = null;
        }
      }
      const emptyRows = GRID_ROWS - survivors.length;
      for (let r = 0; r < emptyRows; r++) {
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.destroy();
          state.grid[r][c].sprite = null;
        }
        state.grid[r][c] = { type: "empty", colorIndex: -1, sprite: null };
        const sprite = makeCellSprite(state.grid[r][c], r, c);
        gridContainer.add(sprite);
        state.grid[r][c].sprite = sprite;
      }
      for (let i = 0; i < survivors.length; i++) {
        const destRow = emptyRows + i;
        const src = survivors[i];
        state.grid[destRow][c] = { type: src.type, colorIndex: src.colorIndex, sprite: null };
        const targetY = cellY(destRow);
        if (src.sprite) {
          const currentY = src.sprite.y;
          const dist = targetY - currentY;
          state.grid[destRow][c].sprite = src.sprite;
          if (dist > 1) {
            const duration = dist / FALL_SPEED_PX_MS;
            if (src.type === "poop") {
              movedPoops.push([destRow, c]);
            }
            pending++;
            scene.tweens.add({
              targets: src.sprite,
              y: targetY,
              duration,
              ease: "Quad.easeIn",
              onComplete: () => {
                pending--;
                if (pending === 0) onComplete(movedPoops);
              }
            });
          }
        } else {
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
  const COMBO_LABELS = [
    "",
    // 0 — unused
    "COMBO!!",
    // 1 — first cascade
    "SUPER!!",
    // 2
    "FEVER!!",
    // 3
    "HONK HONK!!",
    // 4
    "UNSTOPPABLE!!"
    // 5+
  ];
  function checkCombos(movedPoops, comboCount, onDone) {
    if (movedPoops.length === 0) {
      onDone();
      return;
    }
    const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
    const toDestroy = [];
    for (const [landRow, landCol] of movedPoops) {
      const cell = state.grid[landRow][landCol];
      if (cell.type !== "poop") continue;
      const adjacents = [
        [landRow - 1, landCol],
        [landRow + 1, landCol],
        [landRow, landCol - 1],
        [landRow, landCol + 1]
      ];
      for (const [ar, ac] of adjacents) {
        if (ar >= 0 && ar < GRID_ROWS && ac >= 0 && ac < GRID_COLS && !visited[ar][ac] && (state.grid[ar][ac].type === "normal" || state.grid[ar][ac].type === "poop") && state.grid[ar][ac].colorIndex === cell.colorIndex) {
          floodFillGroup(state.grid, ar, ac, cell.colorIndex, visited, toDestroy);
        }
      }
    }
    if (toDestroy.length === 0) {
      onDone();
      return;
    }
    const label = COMBO_LABELS[Math.min(comboCount, COMBO_LABELS.length - 1)];
    if (label) showComboText(label, comboCount);
    destroyCells(toDestroy, () => {
      applyGravity((nextMovedPoops) => {
        state.score += SCORE_BASE * toDestroy.length * toDestroy.length * comboMultiplier(comboCount);
        updateScoreHUD();
        checkCombos(nextMovedPoops, comboCount + 1, onDone);
      });
    });
  }
  function showComboText(label, comboCount) {
    const color = BLOCK_COLORS[(comboCount - 1) % BLOCK_COLORS.length].fill;
    const hex = "#" + color.toString(16).padStart(6, "0");
    const spawnY = GRID_ORIGIN_Y - 30;
    const txt = scene.add.text(GAME_WIDTH / 2, spawnY, `${label}
${comboCount + 1}x`, {
      fontSize: "96px",
      fontFamily: "Arial Black",
      color: "#ffffff",
      stroke: hex,
      strokeThickness: 14,
      align: "center",
      lineSpacing: -8,
      shadow: { offsetX: 4, offsetY: 4, color: "#000000", blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(0.4);
    scene.tweens.add({
      targets: txt,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: "Back.easeOut",
      onComplete: () => {
        scene.time.delayedCall(520, () => {
          scene.tweens.add({
            targets: txt,
            alpha: 0,
            scale: 1.5,
            y: spawnY - 80,
            duration: 280,
            ease: "Quad.easeIn",
            onComplete: () => txt.destroy()
          });
        });
      }
    });
  }
  function buildConstructionCrew() {
    if (constructionCrewGraphic) {
      constructionCrewGraphic.destroy();
    }
    if (constructionMeterBg) {
      constructionMeterBg.destroy();
    }
    if (constructionMeterFill) {
      constructionMeterFill.destroy();
    }
    if (workerSparkTimer) {
      workerSparkTimer.remove();
      workerSparkTimer = null;
    }
    workerContainers.forEach((w) => w.destroy());
    workerContainers = [];
    const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
    const crewH = 64;
    const g = scene.add.graphics();
    constructionCrewGraphic = g;
    g.fillStyle(13148224, 1);
    g.fillRect(0, bottomY, GAME_WIDTH, crewH);
    g.fillStyle(1710618, 1);
    const stripeW = 28;
    for (let x = -crewH; x < GAME_WIDTH + crewH; x += stripeW * 2) {
      g.fillPoints([
        { x, y: bottomY },
        { x: x + stripeW, y: bottomY },
        { x: x + stripeW + crewH, y: bottomY + crewH },
        { x: x + crewH, y: bottomY + crewH }
      ], true, true);
    }
    const workerPositions = [80, 220, 380, 540, 700];
    const workerBaseY = bottomY + crewH - 4;
    workerPositions.forEach((wx, i) => {
      const wg = scene.make.graphics({}, false);
      wg.fillStyle(15632384, 1);
      wg.fillRect(-8, -38, 16, 26);
      wg.fillStyle(15632384, 1);
      if (i % 2 === 0) {
        wg.fillRect(-18, -34, 10, 5);
        wg.fillRect(8, -30, 10, 5);
      } else {
        wg.fillRect(8, -34, 10, 5);
        wg.fillRect(-18, -30, 10, 5);
      }
      wg.fillStyle(16105626, 1);
      wg.fillCircle(0, -48, 10);
      wg.fillStyle(16768256, 1);
      wg.fillRect(-12, -57, 24, 6);
      wg.fillEllipse(0, -58, 22, 10);
      if (i % 2 === 0) {
        wg.fillStyle(8947848, 1);
        wg.fillRect(14, -42, 4, 14);
        wg.fillRect(10, -46, 12, 6);
      } else {
        wg.fillStyle(8947848, 1);
        wg.fillRect(14, -40, 3, 16);
        wg.fillCircle(15, -43, 5);
      }
      const container = scene.add.container(wx, workerBaseY, [wg]);
      container.setSize(32, 64);
      workerContainers.push(container);
      const hopDelay = i * 160;
      scene.time.delayedCall(hopDelay, () => {
        scene.tweens.add({
          targets: container,
          y: workerBaseY - 10,
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      });
    });
    workerSparkTimer = scene.time.addEvent({
      delay: 600,
      loop: true,
      callback: spawnConstructionSpark
    });
    const meterPad = 8;
    const meterH = 28;
    const meterY = bottomY + crewH + meterPad;
    const meterW = GAME_WIDTH - GRID_ORIGIN_X * 2;
    const meterX = GRID_ORIGIN_X;
    const panelG = scene.add.graphics();
    panelG.fillStyle(989475, 0.85);
    panelG.fillRoundedRect(meterX - meterPad, meterY - meterPad, meterW + meterPad * 2, meterH + meterPad * 2, 8);
    panelG.lineStyle(1, 4478310, 1);
    panelG.strokeRoundedRect(meterX - meterPad, meterY - meterPad, meterW + meterPad * 2, meterH + meterPad * 2, 8);
    constructionMeterBg = panelG;
    scene.add.text(meterX + meterW / 2, meterY + meterH / 2, "🚧 CONSTRUCTION", {
      fontSize: "18px",
      fontFamily: "Arial",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(1);
    constructionMeterFill = scene.add.graphics();
  }
  function spawnConstructionSpark() {
    if (state.gameOver || workerContainers.length === 0) return;
    const worker = workerContainers[Phaser.Math.Between(0, workerContainers.length - 1)];
    const sparks = ["✨", "🔨", "⚡", "★", "💥"];
    const txt = scene.add.text(
      worker.x + Phaser.Math.Between(-16, 16),
      worker.y - 50,
      Phaser.Utils.Array.GetRandom(sparks),
      { fontSize: "18px" }
    ).setOrigin(0.5).setDepth(5).setAlpha(1);
    scene.tweens.add({
      targets: txt,
      y: txt.y - Phaser.Math.Between(28, 50),
      alpha: 0,
      duration: Phaser.Math.Between(500, 900),
      ease: "Quad.easeOut",
      onComplete: () => txt.destroy()
    });
  }
  function playWorkerCelebration() {
    if (workerContainers.length === 0) return;
    const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
    const workerBaseY = bottomY + 64 - 4;
    workerContainers.forEach((w, i) => {
      scene.tweens.killTweensOf(w);
      scene.time.delayedCall(i * 80, () => {
        scene.tweens.add({
          targets: w,
          y: workerBaseY - 36,
          scaleX: -1,
          // flip = spin illusion
          duration: 200,
          ease: "Quad.easeOut",
          yoyo: true,
          onComplete: () => {
            w.scaleX = 1;
            scene.tweens.add({
              targets: w,
              y: workerBaseY - 10,
              duration: 280,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut"
            });
          }
        });
        const confetti = ["⭐", "🎉", "✨", "👏"];
        for (let c = 0; c < 3; c++) {
          scene.time.delayedCall(c * 80, () => {
            const cf = scene.add.text(
              w.x + Phaser.Math.Between(-22, 22),
              w.y - 60,
              Phaser.Utils.Array.GetRandom(confetti),
              { fontSize: "20px" }
            ).setOrigin(0.5).setDepth(5);
            scene.tweens.add({
              targets: cf,
              y: cf.y - Phaser.Math.Between(40, 80),
              x: cf.x + Phaser.Math.Between(-20, 20),
              alpha: 0,
              duration: 700,
              ease: "Quad.easeOut",
              onComplete: () => cf.destroy()
            });
          });
        }
      });
    });
  }
  function boardFillFraction() {
    const total = (GRID_ROWS - GRID_EMPTY_ROWS) * GRID_COLS;
    let occupied = 0;
    for (let r = GRID_EMPTY_ROWS; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].type !== "empty") occupied++;
      }
    }
    return occupied / total;
  }
  function startConstructionTimer() {
    if (constructionTimer) {
      constructionTimer.remove();
    }
    scheduleNextConstruction();
  }
  function scheduleNextConstruction() {
    const cfg = LEVEL_CONFIG[state.level];
    const fill = boardFillFraction();
    const factor = Phaser.Math.Clamp(Phaser.Math.Linear(0.35, 1, fill), 0.35, 1);
    const delay = Math.round(cfg.intervalMs * factor);
    constructionTimer = scene.time.addEvent({
      delay,
      loop: false,
      callback: () => {
        if (state.gameOver) return;
        if (state.animating) {
          state.constructionPending = true;
          scheduleNextConstruction();
          return;
        }
        pushRowsFromBottom(cfg.rowsAdded);
        scheduleNextConstruction();
      }
    });
  }
  function updateConstructionMeter() {
    if (!constructionMeterFill || !constructionTimer) return;
    const progress = constructionTimer.getProgress();
    const meterW = GAME_WIDTH - GRID_ORIGIN_X * 2;
    const meterX = GRID_ORIGIN_X;
    const bottomY = GRID_ORIGIN_Y + GRID_ROWS * CELL_SIZE;
    const meterPad = 8;
    const meterH = 28;
    const crewH = 64;
    const meterY = bottomY + crewH + meterPad;
    let fillColor;
    if (progress < 0.6) fillColor = 4508740;
    else if (progress < 0.85) fillColor = 16755200;
    else fillColor = 16724787;
    constructionMeterFill.clear();
    constructionMeterFill.fillStyle(1713461, 1);
    constructionMeterFill.fillRoundedRect(meterX, meterY, meterW, meterH, 6);
    const fillW = Math.max(0, meterW * progress);
    if (fillW > 6) {
      constructionMeterFill.fillStyle(fillColor, 1);
      constructionMeterFill.fillRoundedRect(meterX, meterY, fillW, meterH, 6);
    }
    if (progress > 0.9) {
      const pulse = 0.3 + 0.3 * Math.sin(Date.now() / 80);
      constructionMeterFill.fillStyle(16777215, pulse);
      constructionMeterFill.fillRoundedRect(meterX, meterY, fillW, meterH, 6);
    }
  }
  function updateDangerOverlay() {
    if (!dangerOverlay) return;
    dangerOverlay.clear();
    if (!state || state.gameOver) return;
    let highestOccupied = GRID_ROWS;
    for (let r = GRID_EMPTY_ROWS; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].type !== "empty") {
          if (r < highestOccupied) highestOccupied = r;
        }
      }
    }
    const DANGER_ROWS = 4;
    if (highestOccupied > DANGER_ROWS) return;
    const danger = 1 - highestOccupied / DANGER_ROWS;
    const speed = 2 + danger * 6;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1e3 * speed);
    const alpha = danger * 0.55 * pulse;
    if (alpha < 0.01) return;
    const edgeW = 60;
    const h = GAME_HEIGHT;
    dangerOverlay.fillStyle(16716049, alpha);
    dangerOverlay.fillRect(0, 0, edgeW, h);
    dangerOverlay.fillRect(GAME_WIDTH - edgeW, 0, edgeW, h);
    dangerOverlay.fillRect(0, 0, GAME_WIDTH, edgeW);
  }
  function pushRowsFromBottom(n) {
    state.animating = true;
    playWorkerCelebration();
    sfxConstructionRow();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].type !== "empty") {
          triggerOverflowLose();
          return;
        }
      }
    }
    for (let r = 0; r < GRID_ROWS - n; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const src = state.grid[r + n][c];
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.destroy();
          state.grid[r][c].sprite = null;
        }
        state.grid[r][c] = { type: src.type, colorIndex: src.colorIndex, sprite: src.sprite };
        state.grid[r + n][c].sprite = null;
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.y = cellY(r);
        }
      }
    }
    for (let r = GRID_ROWS - n; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.destroy();
          state.grid[r][c].sprite = null;
        }
        const colorIndex = Phaser.Math.Between(0, activeColors() - 1);
        state.grid[r][c] = { type: "normal", colorIndex, sprite: null };
        const sprite = makeCellSprite(state.grid[r][c], r, c);
        sprite.y = cellY(r) + CELL_SIZE * n;
        gridContainer.add(sprite);
        state.grid[r][c].sprite = sprite;
      }
    }
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
            ease: "Quad.easeOut",
            onComplete: () => {
              pending--;
              if (pending === 0) {
                state.animating = false;
                checkWinLose();
              }
            }
          });
        }
      }
    }
    if (pending === 0) {
      state.animating = false;
      checkWinLose();
    }
  }
  function triggerOverflowLose() {
    state.gameOver = true;
    state.animating = false;
    showMessage("🚧 Construction wins!\nBuilding too tall!", 0);
    scene.time.delayedCall(2200, resetGame);
  }
  function checkWinLose() {
    const noNormalBlocks = state.grid.every(
      (row) => row.every((cell) => cell.type !== "normal")
    );
    if (noNormalBlocks) {
      state.animating = true;
      showMessage("🪿 CLEARED!\nHonk honk!", 900);
      scene.time.delayedCall(1e3, () => {
        refillFromBottom();
      });
      return;
    }
    const noMoves = state.grid[0].every((cell) => cell.type !== "empty");
    if (noMoves) {
      state.gameOver = true;
      state.animating = false;
      showMessage("💩 No moves left!\nGame over!", 0);
      scene.time.delayedCall(2200, resetGame);
      return;
    }
    finishTurn();
  }
  function refillFromBottom() {
    const n = LEVEL_CONFIG[state.level].clearRefillRows;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].type === "poop") {
          if (state.grid[r][c].sprite) {
            state.grid[r][c].sprite.destroy();
            state.grid[r][c].sprite = null;
          }
          state.grid[r][c] = { type: "empty", colorIndex: -1, sprite: null };
          refreshCellSprite(r, c);
        }
      }
    }
    for (let r = 0; r < GRID_ROWS - n; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const src = state.grid[r + n][c];
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.destroy();
          state.grid[r][c].sprite = null;
        }
        state.grid[r][c] = { type: src.type, colorIndex: src.colorIndex, sprite: src.sprite };
        state.grid[r + n][c].sprite = null;
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.y = cellY(r);
        }
      }
    }
    const colStagger = [];
    for (let c = 0; c < GRID_COLS; c++) {
      colStagger.push(Phaser.Math.Between(0, 2));
    }
    for (let r = GRID_ROWS - n; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (state.grid[r][c].sprite) {
          state.grid[r][c].sprite.destroy();
          state.grid[r][c].sprite = null;
        }
        const colStartRow = GRID_ROWS - n + colStagger[c];
        if (r < colStartRow) {
          state.grid[r][c] = { type: "empty", colorIndex: -1, sprite: null };
          const sprite2 = makeCellSprite(state.grid[r][c], r, c);
          gridContainer.add(sprite2);
          state.grid[r][c].sprite = sprite2;
          continue;
        }
        const colorIndex = Phaser.Math.Between(0, activeColors() - 1);
        state.grid[r][c] = { type: "normal", colorIndex, sprite: null };
        const sprite = makeCellSprite(state.grid[r][c], r, c);
        sprite.y = cellY(r) + CELL_SIZE * n;
        sprite.setAlpha(0);
        gridContainer.add(sprite);
        state.grid[r][c].sprite = sprite;
      }
    }
    let pending = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const sprite = state.grid[r][c].sprite;
        if (!sprite) continue;
        const targetY = cellY(r);
        const delay = (GRID_ROWS - 1 - r) * 18;
        if (Math.abs(sprite.y - targetY) > 1 || sprite.alpha < 1) {
          pending++;
          scene.time.delayedCall(delay, () => {
            scene.tweens.add({
              targets: sprite,
              y: targetY,
              alpha: 1,
              duration: 300,
              ease: "Quad.easeOut",
              onComplete: () => {
                pending--;
                if (pending === 0) {
                  state.pendingPoop = pickRandomPoop();
                  refreshPoopIndicator();
                  finishTurn();
                }
              }
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
  function finishTurn() {
    state.animating = false;
    if (state.queuedCol !== null && !state.gameOver) {
      const age = performance.now() - state.queuedAt;
      const col = state.queuedCol;
      state.queuedCol = null;
      if (age <= 200 && state.grid[0][col].type === "empty") {
        scene.time.delayedCall(180, () => dropPoop(col));
        return;
      }
    }
    if (state.constructionPending && !state.gameOver) {
      state.constructionPending = false;
      const cfg = LEVEL_CONFIG[state.level];
      pushRowsFromBottom(cfg.rowsAdded);
    }
  }
  function resetGame() {
    stopBGM();
    messageText.setAlpha(0);
    gridContainer.removeAll(true);
    if (constructionTimer) {
      constructionTimer.remove();
      constructionTimer = null;
    }
    if (gooseFlapTimer) {
      gooseFlapTimer.remove();
      gooseFlapTimer = null;
    }
    if (workerSparkTimer) {
      workerSparkTimer.remove();
      workerSparkTimer = null;
    }
    workerContainers.forEach((w) => w.destroy());
    workerContainers = [];
    initState();
    buildGrid();
    buildGoose();
    refreshPoopIndicator();
    buildConstructionCrew();
    levelText.setText("Level 1");
    updateScoreHUD();
    state.gameOver = false;
    state.animating = false;
    titleActive = true;
    buildTitleScreen();
  }
  function showMessage(msg, duration) {
    messageText.setText(msg).setAlpha(1);
    if (duration > 0) {
      scene.time.delayedCall(duration, () => {
        scene.tweens.add({ targets: messageText, alpha: 0, duration: 300 });
      });
    }
  }
  const config = createGameConfig();
  config.scene = { create, update };
  new Phaser.Game(config);
})();
//# sourceMappingURL=game.js.map
