(function() {
  "use strict";
  const GAME_WIDTH = 786;
  const GAME_HEIGHT = 1704;
  const LEVEL_WIDTH = 786 * 2;
  const LEVEL_HEIGHT = 1704 * 2.5;
  const BEAR_SPEED = 280;
  const BEAR_HP = 5;
  const BEAR_RADIUS = 30;
  const DODGE_SPEED = 520;
  const DODGE_DURATION = 160;
  const DODGE_COOLDOWN = 1400;
  const DODGE_CHARGES = 2;
  const MELEE_SPEED = 130;
  const RANGED_SPEED = 60;
  const MELEE_HP = 2;
  const RANGED_HP = 2;
  const SLOW_DURATION = 2200;
  const SLOW_MOVE_MULT = 0.35;
  const SLOW_ATTACK_MULT = 0.35;
  const BEE_DPS = 1.2;
  const MELEE_ATTACK_RANGE = 55;
  const MELEE_ATTACK_COOLDOWN = 1200;
  const RANGED_SHOOT_COOLDOWN = 2500;
  const RANGED_DETECT_RANGE = 700;
  const MELEE_DETECT_RANGE = 560;
  const PROJECTILE_SPEED = 180;
  const BEE_SPEED_MIN = 240;
  const BEE_TRAVERSE_MS = 2800;
  const BEE_STING_RANGE = 50;
  const BEE_COUNT = 5;
  const BEE_MAX_SWARMS = 2;
  const BEE_RETURN_SPEED = 380;
  const BOSS_MAX_HP = 20;
  const BOSS_SPEED = 90;
  const BOSS_RADIUS = 70;
  const BOSS_AWAKEN_MS = 2200;
  const BOSS_STUN_PER_STING = 120;
  const CAGE_OPEN_RANGE = 80;
  const GOAL_RADIUS = 50;
  const TILE = 72;
  const COLORS = {
    bg: { primary: 2972187 },
    ground: { base: 4881455, dark: 3825696, path: 9139029, dirt: 7032896 },
    bear: { body: 9133628, dark: 6044958, snout: 12884588 },
    bee: { body: 16106818 },
    hive: { body: 13932042, dark: 10512896 },
    goal: { glow: 16772693 },
    city: {
      asphalt: 3815994,
      asphaltDark: 2763306,
      sidewalk: 11575424,
      sidewalkDark: 10128496,
      line: 16119200,
      building: 6978186,
      buildingDark: 4872810,
      window: 11197951,
      windowLit: 16772744
    },
    dc: {
      floor: 657938,
      floorLine: 1710634,
      rack: 1710638,
      rackDark: 855322,
      rackLight: 2763332,
      led: 65484,
      ledDim: 17459,
      ledRed: 16724770,
      ledAmber: 16755200,
      cable: 2236996,
      cableDark: 1118498,
      cooling: 1122867,
      coolingGlow: 26282,
      accent: 43775,
      accentGlow: 13158
    }
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
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
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
  let _ctx = null;
  function ctx() {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  }
  function ramp(g, now, attack, sustain, release, peak = 0.4) {
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + attack);
    g.gain.setValueAtTime(peak, now + attack + sustain);
    g.gain.linearRampToValueAtTime(0, now + attack + sustain + release);
  }
  function osc(type, freq, attack, sustain, release, peak = 0.35, dest) {
    const c = ctx();
    const now = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    o.connect(g);
    g.connect(c.destination);
    ramp(g, now, attack, sustain, release, peak);
    o.start(now);
    o.stop(now + attack + sustain + release + 0.05);
  }
  function oscGlide(type, freqStart, freqEnd, duration, peak = 0.35, dest) {
    const c = ctx();
    const now = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, now);
    o.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
    o.connect(g);
    g.connect(c.destination);
    ramp(g, now, 5e-3, duration * 0.7, duration * 0.3, peak);
    o.start(now);
    o.stop(now + duration + 0.05);
  }
  function noise(duration, peak = 0.25, attack = 5e-3, dest) {
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
    g.connect(c.destination);
    ramp(g, now, attack, duration * 0.3, duration * 0.7, peak);
    src.start(now);
    src.stop(now + duration + 0.05);
  }
  function reverbTail(duration, freq, peak = 0.18) {
    const c = ctx();
    const now = c.currentTime;
    const sr = c.sampleRate;
    const len = Math.ceil(sr * duration);
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = freq;
    filt.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(1e-4, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(c.destination);
    src.start(now);
    src.stop(now + duration + 0.05);
  }
  const SFX = {
    /** Bee swarm launched — buzzy oscillator burst */
    beeShoot() {
      oscGlide("sawtooth", 280, 520, 0.18, 0.22);
      osc("triangle", 180, 0.01, 0.1, 0.07, 0.1);
    },
    /** No bee slots available — low denied thud */
    noBees() {
      oscGlide("sawtooth", 120, 60, 0.12, 0.28);
      noise(0.08, 0.12, 2e-3);
    },
    /** Bear takes damage — sharp crunch grunt */
    bearHurt() {
      oscGlide("sine", 200, 60, 0.18, 0.45);
      noise(0.14, 0.3, 2e-3);
      oscGlide("sawtooth", 900, 200, 0.08, 0.15);
    },
    /** Enemy stung (per HP lost) — wet zap */
    enemyHurt() {
      oscGlide("square", 600, 300, 0.08, 0.18);
      noise(0.06, 0.14, 1e-3);
    },
    /** Enemy killed — dark crumble thud */
    enemyDie() {
      oscGlide("sine", 150, 40, 0.22, 0.4);
      noise(0.18, 0.22, 3e-3);
    },
    /** Zone entrance — soulslike long reverb bell toll */
    zoneEnter() {
      const c = ctx();
      const now = c.currentTime;
      const fund = c.createOscillator();
      const fundG = c.createGain();
      fund.type = "sine";
      fund.frequency.setValueAtTime(110, now);
      fund.connect(fundG);
      fundG.connect(c.destination);
      fundG.gain.setValueAtTime(0, now);
      fundG.gain.linearRampToValueAtTime(0.45, now + 0.02);
      fundG.gain.exponentialRampToValueAtTime(1e-4, now + 4.5);
      fund.start(now);
      fund.stop(now + 4.6);
      const ov1 = c.createOscillator();
      const ov1G = c.createGain();
      ov1.type = "sine";
      ov1.frequency.setValueAtTime(110 * 2.76, now);
      ov1.connect(ov1G);
      ov1G.connect(c.destination);
      ov1G.gain.setValueAtTime(0, now);
      ov1G.gain.linearRampToValueAtTime(0.2, now + 0.02);
      ov1G.gain.exponentialRampToValueAtTime(1e-4, now + 2.8);
      ov1.start(now);
      ov1.stop(now + 3);
      const ov2 = c.createOscillator();
      const ov2G = c.createGain();
      ov2.type = "sine";
      ov2.frequency.setValueAtTime(110 * 5.4, now);
      ov2.connect(ov2G);
      ov2G.connect(c.destination);
      ov2G.gain.setValueAtTime(0, now);
      ov2G.gain.linearRampToValueAtTime(0.08, now + 0.01);
      ov2G.gain.exponentialRampToValueAtTime(1e-4, now + 1.4);
      ov2.start(now);
      ov2.stop(now + 1.5);
      reverbTail(3, 220, 0.14);
    },
    /** Stage clear (non-boss) — ascending triumphant fanfare */
    stageClear() {
      const c = ctx();
      const now = c.currentTime;
      const notes = [261.6, 329.6, 392, 523.2];
      notes.forEach((freq, i) => {
        const delay = i * 0.14;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + delay);
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0, now + delay);
        g.gain.linearRampToValueAtTime(0.38, now + delay + 0.03);
        g.gain.setValueAtTime(0.38, now + delay + 0.18);
        g.gain.linearRampToValueAtTime(0, now + delay + 0.55);
        o.start(now + delay);
        o.stop(now + delay + 0.6);
      });
      [261.6, 329.6, 392].forEach((freq) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(freq, now + 0.3);
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0, now + 0.3);
        g.gain.linearRampToValueAtTime(0.15, now + 0.4);
        g.gain.linearRampToValueAtTime(0, now + 1.6);
        o.start(now + 0.3);
        o.stop(now + 1.7);
      });
    },
    /** Boss cleared — massive soulslike deep bell + collapse rumble */
    bossClear() {
      const c = ctx();
      const now = c.currentTime;
      const fund = c.createOscillator();
      const fundG = c.createGain();
      fund.type = "sine";
      fund.frequency.setValueAtTime(55, now);
      fund.connect(fundG);
      fundG.connect(c.destination);
      fundG.gain.setValueAtTime(0, now);
      fundG.gain.linearRampToValueAtTime(0.7, now + 0.015);
      fundG.gain.exponentialRampToValueAtTime(1e-4, now + 6);
      fund.start(now);
      fund.stop(now + 6.1);
      const ov = c.createOscillator();
      const ovG = c.createGain();
      ov.type = "sine";
      ov.frequency.setValueAtTime(55 * 2.17, now);
      ov.connect(ovG);
      ovG.connect(c.destination);
      ovG.gain.setValueAtTime(0, now);
      ovG.gain.linearRampToValueAtTime(0.25, now + 0.015);
      ovG.gain.exponentialRampToValueAtTime(1e-4, now + 3.5);
      ov.start(now);
      ov.stop(now + 3.6);
      noise(1.2, 0.35, 0.01);
      setTimeout(() => noise(1.5, 0.18, 0.05), 80);
      reverbTail(5, 110, 0.22);
      const resolveNotes = [220, 261.6, 311.1, 220];
      resolveNotes.forEach((freq, i) => {
        const delay = 0.6 + i * 0.28;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + delay);
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0, now + delay);
        g.gain.linearRampToValueAtTime(0.22, now + delay + 0.04);
        g.gain.linearRampToValueAtTime(0, now + delay + 0.45);
        o.start(now + delay);
        o.stop(now + delay + 0.5);
      });
    },
    /** Boss appears — creepy dissonant low drone swell */
    bossAppear() {
      const c = ctx();
      const now = c.currentTime;
      [[110, 0.55], [155.6, 0.35]].forEach(([freq, peak]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq, now);
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(peak, now + 0.8);
        g.gain.setValueAtTime(peak, now + 1.6);
        g.gain.linearRampToValueAtTime(0, now + 2.8);
        o.start(now);
        o.stop(now + 2.9);
      });
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(3.2, now);
      lfoG.gain.setValueAtTime(30, now);
      lfo.connect(lfoG);
      oscGlide("sine", 880, 660, 2.5, 0.08);
      noise(2, 0.2, 0.4);
      lfo.start(now);
      lfo.stop(now + 2.9);
    },
    /** Boss spawns — deep explosion thump */
    bossSpawn() {
      oscGlide("sine", 80, 25, 0.35, 0.55);
      noise(0.4, 0.45, 4e-3);
      oscGlide("sawtooth", 300, 60, 0.12, 0.25);
    },
    /** Enemy fires a projectile — sharp pew */
    enemyShoot() {
      oscGlide("square", 520, 180, 0.1, 0.16);
      noise(0.05, 0.08, 1e-3);
    },
    /** Critter rescued — bright cheerful chime */
    cageOpen() {
      const c = ctx();
      const now = c.currentTime;
      const chimeNotes = [[784, 0], [988, 0.13]];
      for (const [freq, delay] of chimeNotes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + delay);
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0, now + delay);
        g.gain.linearRampToValueAtTime(0.32, now + delay + 0.015);
        g.gain.exponentialRampToValueAtTime(1e-4, now + delay + 0.55);
        o.start(now + delay);
        o.stop(now + delay + 0.6);
      }
      osc("sine", 1568, 5e-3, 0.05, 0.2, 0.12);
    },
    /** Boss takes a bee sting — wailing beast: pitch falls then rises with random amounts */
    bossHurt() {
      const now200 = Date.now();
      if (now200 - _bossHurtLastTime < 200) return;
      _bossHurtLastTime = now200;
      const c = ctx();
      const now = c.currentTime;
      const startFreq = 320 + Math.random() * 160;
      const fallFreq = 55 + Math.random() * 60;
      const riseFreq = 180 + Math.random() * 200;
      const fallTime = 0.3 + Math.random() * 0.36;
      const riseTime = 0.42 + Math.random() * 0.54;
      const total = fallTime + riseTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(startFreq, now);
      o.frequency.exponentialRampToValueAtTime(fallFreq, now + fallTime);
      o.frequency.exponentialRampToValueAtTime(riseFreq, now + fallTime + riseTime);
      o.connect(g);
      g.connect(c.destination);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.13, now + 8e-3);
      g.gain.setValueAtTime(0.13, now + total * 0.6);
      g.gain.linearRampToValueAtTime(0, now + total + 0.04);
      o.start(now);
      o.stop(now + total + 0.08);
      const detune = 1.018 + Math.random() * 0.025;
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.type = "square";
      o2.frequency.setValueAtTime(startFreq * detune, now);
      o2.frequency.exponentialRampToValueAtTime(fallFreq * detune, now + fallTime);
      o2.frequency.exponentialRampToValueAtTime(riseFreq * detune, now + fallTime + riseTime);
      o2.connect(g2);
      g2.connect(c.destination);
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(0.06, now + 0.012);
      g2.gain.linearRampToValueAtTime(0, now + total + 0.04);
      o2.start(now);
      o2.stop(now + total + 0.08);
      noise(0.08, 0.07, 2e-3);
    },
    /** Boss fires attack — per attackType character */
    bossAttack(type) {
      switch (type) {
        case "slash":
          oscGlide("sawtooth", 800, 120, 0.15, 0.4);
          noise(0.12, 0.25, 2e-3);
          break;
        case "projectile":
          oscGlide("sine", 440, 220, 0.2, 0.22);
          osc("square", 110, 5e-3, 0.06, 0.1, 0.14);
          break;
        case "timebomb":
          osc("square", 220, 5e-3, 0.04, 0.06, 0.28);
          noise(0.06, 0.12, 2e-3);
          break;
        case "artillery":
          oscGlide("sine", 600, 80, 0.25, 0.45);
          noise(0.2, 0.35, 0.01);
          break;
      }
    }
  };
  let _bossHurtLastTime = 0;
  let _bgmMaster = null;
  let _bgmTrack = null;
  let _bgmLoopId = null;
  function bgmMaster() {
    const c = ctx();
    if (!_bgmMaster) {
      _bgmMaster = c.createGain();
      _bgmMaster.connect(c.destination);
    }
    return _bgmMaster;
  }
  function bgmNote(type, freq, startOff, dur, peak, baseTime) {
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
  function bgmNoise(startOff, dur, peak, filterFreq, baseTime) {
    const c = ctx();
    const sr = c.sampleRate;
    const len = Math.ceil(sr * (dur + 0.05));
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
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
  const STAGE_BAR = 5;
  function scheduleStageBar(barIdx) {
    if (_bgmTrack !== "stage") return;
    const c = ctx();
    const now = c.currentTime;
    bgmNote("sine", 55, 0, STAGE_BAR * 0.95, 0.06, now);
    bgmNote("triangle", 110, 0, STAGE_BAR * 0.95, 0.045, now);
    const cycle = barIdx % 4;
    if (cycle === 0) {
      bgmNote("triangle", 130.8, 0.4, 3.2, 0.09, now);
      bgmNote("sine", 164.8, 2.8, 1.8, 0.06, now);
    } else if (cycle === 1) {
      bgmNote("triangle", 220, 3.5, 1.2, 0.1, now);
    } else if (cycle === 2) {
      bgmNote("triangle", 196, 0.2, 2.2, 0.08, now);
      bgmNote("sine", 164.8, 2.6, 2, 0.07, now);
    } else {
      bgmNote("triangle", 261.6, 1, 2.8, 0.07, now);
    }
    if (barIdx % 2 === 0) {
      bgmNoise(STAGE_BAR * 0.3, STAGE_BAR * 0.5, 0.035, 400, now);
    }
    _bgmLoopId = setTimeout(() => {
      scheduleStageBar(barIdx + 1);
    }, (STAGE_BAR - 0.15) * 1e3);
  }
  const BOSS_BAR = 1.818;
  const BOSS_BEAT = BOSS_BAR / 4;
  function scheduleBossBar(barIdx) {
    if (_bgmTrack !== "boss") return;
    const c = ctx();
    const now = c.currentTime;
    const bassNotes = [73.4, 55, 73.4, 55];
    for (let b = 0; b < 4; b++) {
      bgmNote("sawtooth", bassNotes[b], b * BOSS_BEAT, BOSS_BEAT * 0.7, 0.18, now);
      bgmNote("sine", bassNotes[b], b * BOSS_BEAT, BOSS_BEAT * 0.9, 0.12, now);
    }
    const padNotes = [146.8, 174.6, 220];
    if (barIdx % 2 === 0) {
      for (const pf of padNotes) {
        bgmNote("sawtooth", pf, 0, BOSS_BEAT * 1.6, 0.055, now);
        bgmNote("sawtooth", pf, BOSS_BEAT * 2, BOSS_BEAT * 1.6, 0.055, now);
      }
    } else {
      const altPad = [116.5, 138.6, 174.6];
      for (const pf of altPad) {
        bgmNote("sawtooth", pf, 0, BOSS_BEAT * 1.6, 0.05, now);
        bgmNote("sawtooth", pf, BOSS_BEAT * 2, BOSS_BEAT * 1.4, 0.05, now);
      }
    }
    bgmNoise(0, 0.08, 0.18, 200, now);
    bgmNoise(BOSS_BEAT * 2, 0.08, 0.14, 200, now);
    bgmNoise(BOSS_BEAT, 0.06, 0.1, 2e3, now);
    bgmNoise(BOSS_BEAT * 3, 0.06, 0.1, 2e3, now);
    if (barIdx % 4 === 0) {
      bgmNote("triangle", 293.7, BOSS_BEAT * 0.5, BOSS_BEAT * 1.2, 0.09, now);
      bgmNote("triangle", 220, BOSS_BEAT * 1.8, BOSS_BEAT * 1.2, 0.09, now);
    } else if (barIdx % 4 === 2) {
      bgmNote("triangle", 174.6, BOSS_BEAT * 0.5, BOSS_BEAT * 0.8, 0.08, now);
      bgmNote("triangle", 220, BOSS_BEAT * 1.5, BOSS_BEAT * 0.9, 0.08, now);
      bgmNote("triangle", 261.6, BOSS_BEAT * 2.5, BOSS_BEAT * 0.8, 0.07, now);
    }
    _bgmLoopId = setTimeout(() => {
      scheduleBossBar(barIdx + 1);
    }, (BOSS_BAR - 0.05) * 1e3);
  }
  const BGM = {
    startStage() {
      this.stop();
      _bgmTrack = "stage";
      const m = bgmMaster();
      const c = ctx();
      m.gain.cancelScheduledValues(c.currentTime);
      m.gain.setValueAtTime(0, c.currentTime);
      m.gain.linearRampToValueAtTime(1, c.currentTime + 2);
      scheduleStageBar(0);
    },
    startBoss() {
      this.stop();
      _bgmTrack = "boss";
      const m = bgmMaster();
      const c = ctx();
      m.gain.cancelScheduledValues(c.currentTime);
      m.gain.setValueAtTime(0, c.currentTime);
      m.gain.linearRampToValueAtTime(1, c.currentTime + 0.4);
      scheduleBossBar(0);
    },
    stop() {
      _bgmTrack = null;
      if (_bgmLoopId !== null) {
        clearTimeout(_bgmLoopId);
        _bgmLoopId = null;
      }
      if (_bgmMaster) {
        const c = ctx();
        _bgmMaster.gain.cancelScheduledValues(c.currentTime);
        _bgmMaster.gain.setValueAtTime(_bgmMaster.gain.value, c.currentTime);
        _bgmMaster.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
      }
    }
  };
  let scene;
  let bear;
  let cursors;
  let wasd;
  let enemies = [];
  let cages = [];
  let projectiles = [];
  let beeSwarms = [];
  let pathGraphics;
  let goalSprite;
  let goalX = 0, goalY = 0;
  let boss = null;
  let bossHudBg;
  let bossHudBar;
  let bossHudNameText;
  let bossHudVisible = false;
  let hudBg;
  let hudHpBar;
  let hudStaminaBar;
  let hudCageText;
  let hudHpText;
  let hudDodgeText;
  let hudHintText;
  let hudBottomG;
  let hudSlotTexts = [];
  let hudBeeOrbitTime = 0;
  let fogGraphics;
  let hudCam;
  let indicatorG;
  let indicatorTexts = [];
  let hiveSlots = [true, true];
  let debugMenuOpen = false;
  let debugMenuBg;
  let debugMenuText;
  let pKey;
  let key1;
  let key2;
  let key3;
  let bKey;
  let currentStage = 1;
  let gameState;
  let enemyGroup;
  let projectileGroup;
  let terrainGroup;
  let bushZones = [];
  let bearDamageCooldown = 0;
  let spaceKey;
  let dodgeCooldown = 0;
  let dodgeCharges = DODGE_CHARGES;
  let dodgeTimer = 0;
  let dodgeVx = 0;
  let dodgeVy = 0;
  let lastFacingX = 0;
  let lastFacingY = 1;
  const HUD_H = 160;
  const SAFE_B = 28;
  const SAFE_R = 16;
  function create() {
    scene = this;
    enemies = [];
    cages = [];
    projectiles = [];
    beeSwarms = [];
    bushZones = [];
    BGM.stop();
    BGM.startStage();
    hudSlotTexts = [];
    indicatorTexts = [];
    hiveSlots = [true, true];
    debugMenuOpen = false;
    boss = null;
    bossHudVisible = false;
    bearDamageCooldown = 0;
    knockbackTimer = 0;
    knockbackVx = 0;
    knockbackVy = 0;
    dodgeCooldown = 0;
    dodgeCharges = DODGE_CHARGES;
    dodgeTimer = 0;
    dodgeVx = 0;
    dodgeVy = 0;
    lastFacingX = 0;
    lastFacingY = 1;
    hudBeeOrbitTime = 0;
    gameState = {
      bearHp: BEAR_HP,
      bearMaxHp: BEAR_HP,
      cagesTotal: 4,
      cagesRescued: 0,
      levelComplete: false,
      gameOver: false,
      drawing: false,
      drawPath: [],
      stage: currentStage
    };
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    if (currentStage === 2) drawCityBackground(this);
    else if (currentStage === 3) drawDataCenterBackground(this);
    else drawBackground(this);
    terrainGroup = this.physics.add.staticGroup();
    buildTerrain(this);
    enemyGroup = this.physics.add.group();
    projectileGroup = this.physics.add.group();
    spawnGoal(this);
    spawnCages(this);
    spawnEnemies(this);
    buildBearTextures(this);
    bear = this.physics.add.sprite(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 300, "bear");
    bear.setCollideWorldBounds(true).setDepth(10).setCircle(BEAR_RADIUS, 4, 4);
    this.physics.add.collider(bear, terrainGroup);
    this.physics.add.collider(enemyGroup, terrainGroup);
    pathGraphics = this.add.graphics().setDepth(20);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    this.cameras.main.startFollow(bear, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.8);
    cursors = this.input.keyboard.createCursorKeys();
    wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    bKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.input.on("pointerdown", onPointerDown, this);
    this.input.on("pointermove", onPointerMove, this);
    this.input.on("pointerup", onPointerUp, this);
    this.input.on("gameout", () => {
      if (gameState.drawing) onPointerUp.call(scene, {});
    }, this);
    this.physics.add.overlap(bear, enemyGroup, onBearEnemyOverlap, void 0, this);
    this.physics.add.overlap(bear, projectileGroup, onBearProjectileOverlap, void 0, this);
    buildHUD(this);
    hudBottomG = this.add.graphics().setDepth(63);
    fogGraphics = this.add.graphics().setDepth(49);
    indicatorG = this.add.graphics().setDepth(65);
    buildIndicatorTexts(this);
    hudCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT).setName("hud").setZoom(1).setScroll(0, 0);
    const hudObjects = [
      hudBg,
      hudHpBar,
      hudStaminaBar,
      hudHpText,
      hudDodgeText,
      hudCageText,
      hudHintText,
      hudBottomG,
      fogGraphics,
      indicatorG,
      debugMenuBg,
      debugMenuText,
      bossHudBg,
      bossHudBar,
      bossHudNameText,
      ...hudSlotTexts,
      ...indicatorTexts
    ];
    for (const obj of hudObjects) {
      obj.cameraFilter |= this.cameras.main.id;
    }
    this.cameras.main.ignore(hudObjects);
    const allObjs = this.children.list.filter((o) => !hudObjects.includes(o));
    hudCam.ignore(allObjs);
    showZoneEntrance(this);
  }
  function update(_time, delta) {
    if (Phaser.Input.Keyboard.JustDown(pKey)) {
      debugMenuOpen = !debugMenuOpen;
      drawDebugMenu();
    }
    if (debugMenuOpen) {
      if (Phaser.Input.Keyboard.JustDown(key1)) {
        debugMenuOpen = false;
        currentStage = 1;
        scene.scene.restart();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(key2)) {
        debugMenuOpen = false;
        currentStage = 2;
        scene.scene.restart();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(key3)) {
        debugMenuOpen = false;
        currentStage = 3;
        scene.scene.restart();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(bKey)) {
        debugMenuOpen = false;
        drawDebugMenu();
        if (currentStage !== 3) {
          currentStage = 3;
          scene.scene.restart();
          return;
        }
        for (const cage of cages) {
          if (!cage.opened) openCage(cage);
        }
        if (boss && boss.state === "dormant") awakenBoss(boss);
        return;
      }
    }
    if (gameState.gameOver || gameState.levelComplete) return;
    moveBear(delta);
    if (bearDamageCooldown > 0) bearDamageCooldown -= delta;
    for (const swarm of beeSwarms) updateSwarm(swarm, delta);
    renderPathPreview();
    for (const e of enemies) updateEnemy(e, delta);
    updateProjectiles();
    checkCages();
    checkGoal();
    if (boss) updateBoss(boss, delta);
    updateFog();
    updateIndicators();
    hudBeeOrbitTime += delta;
    refreshHUD();
  }
  function moveBear(delta) {
    if (dodgeCharges < DODGE_CHARGES) {
      dodgeCooldown -= delta;
      if (dodgeCooldown <= 0) {
        dodgeCharges++;
        dodgeCooldown = dodgeCharges < DODGE_CHARGES ? DODGE_COOLDOWN : 0;
      }
    }
    if (dodgeTimer > 0) dodgeTimer -= delta;
    if (knockbackTimer > 0) {
      knockbackTimer -= delta;
      bear.setVelocity(knockbackVx, knockbackVy);
      return;
    }
    let ix = 0, iy = 0;
    if (cursors.left.isDown || wasd.left.isDown) ix -= 1;
    if (cursors.right.isDown || wasd.right.isDown) ix += 1;
    if (cursors.up.isDown || wasd.up.isDown) iy -= 1;
    if (cursors.down.isDown || wasd.down.isDown) iy += 1;
    if (ix !== 0 && iy !== 0) {
      ix *= 0.707;
      iy *= 0.707;
    }
    if (ix !== 0 || iy !== 0) {
      lastFacingX = ix;
      lastFacingY = iy;
    }
    if (Phaser.Input.Keyboard.JustDown(spaceKey) && dodgeCharges > 0 && dodgeTimer <= 0) {
      const dx = ix !== 0 || iy !== 0 ? ix : lastFacingX;
      const dy = ix !== 0 || iy !== 0 ? iy : lastFacingY;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      dodgeVx = dx / mag * DODGE_SPEED;
      dodgeVy = dy / mag * DODGE_SPEED;
      dodgeTimer = DODGE_DURATION;
      dodgeCharges--;
      if (dodgeCooldown <= 0) dodgeCooldown = DODGE_COOLDOWN;
      scene.tweens.add({ targets: bear, alpha: 0.45, duration: DODGE_DURATION / 2, yoyo: true });
      bearDamageCooldown = Math.max(bearDamageCooldown, DODGE_DURATION + 100);
    }
    bear.setVelocity(dodgeTimer > 0 ? dodgeVx : ix * BEAR_SPEED, dodgeTimer > 0 ? dodgeVy : iy * BEAR_SPEED);
    if (dodgeTimer <= 0 && inBushZone(bear.x, bear.y)) {
      const bv = bear.body;
      bv.setVelocity(bv.velocity.x * 0.45, bv.velocity.y * 0.45);
    }
    if (ix !== 0) bear.setFlipX(ix < 0);
  }
  function onPointerDown(pointer) {
    if (gameState.levelComplete || gameState.gameOver) return;
    gameState.drawing = true;
    gameState.drawPath = [new Phaser.Math.Vector2(pointer.worldX, pointer.worldY)];
  }
  function onPointerMove(pointer) {
    if (!gameState.drawing) return;
    const path = gameState.drawPath;
    const last = path[path.length - 1];
    if (Phaser.Math.Distance.Between(last.x, last.y, pointer.worldX, pointer.worldY) > 18)
      path.push(new Phaser.Math.Vector2(pointer.worldX, pointer.worldY));
  }
  function onPointerUp(_pointer) {
    if (!gameState.drawing) return;
    gameState.drawing = false;
    if (gameState.drawPath.length < 2) {
      gameState.drawPath = [];
      return;
    }
    const slot = hiveSlots[0] ? 0 : hiveSlots[1] ? 1 : -1;
    if (slot === -1) {
      gameState.drawPath = [];
      SFX.noBees();
      return;
    }
    hiveSlots[slot] = false;
    const fullPath = [new Phaser.Math.Vector2(bear.x, bear.y), ...gameState.drawPath];
    gameState.drawPath = [];
    const swarm = createBeeSwarm(bear.x, bear.y, slot);
    beeSwarms.push(swarm);
    launchSwarm(swarm, fullPath);
    SFX.beeShoot();
    updateBearTexture();
  }
  function createBeeSwarm(sx, sy, slot) {
    const dots = [];
    for (let i = 0; i < BEE_COUNT; i++) {
      const d = scene.add.image(sx, sy, "bee_dot").setDepth(22).setVisible(false);
      dots.push(d);
    }
    return { dots, path: [], state: "idle", pathIndex: 0, speed: BEE_SPEED_MIN, sourceX: sx, sourceY: sy, slot };
  }
  function pathLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Phaser.Math.Distance.Between(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    return len;
  }
  function launchSwarm(swarm, path) {
    swarm.speed = Math.max(BEE_SPEED_MIN, pathLength(path) / (BEE_TRAVERSE_MS / 1e3));
    swarm.path = path;
    swarm.pathIndex = 0;
    swarm.state = "flying";
    swarm.sourceX = bear.x;
    swarm.sourceY = bear.y;
    for (const d of swarm.dots) {
      d.setPosition(path[0].x, path[0].y);
      d.setVisible(true);
    }
  }
  function updateSwarm(swarm, delta) {
    if (swarm.state === "idle") return;
    if (swarm.state === "returning") {
      const rs = BEE_RETURN_SPEED * delta / 1e3;
      let allHome = true;
      for (const d of swarm.dots) {
        const dist = Phaser.Math.Distance.Between(d.x, d.y, bear.x, bear.y);
        if (dist > rs) {
          const a = Math.atan2(bear.y - d.y, bear.x - d.x);
          d.x += Math.cos(a) * rs;
          d.y += Math.sin(a) * rs;
          allHome = false;
        } else {
          d.x = bear.x;
          d.y = bear.y;
        }
      }
      for (const e of enemies) {
        if (e.state === "dead") continue;
        for (const d of swarm.dots)
          if (Phaser.Math.Distance.Between(d.x, d.y, e.sprite.x, e.sprite.y) < BEE_STING_RANGE) {
            stingEnemy(e, delta);
            break;
          }
      }
      if (boss && boss.state === "active") {
        for (const d of swarm.dots)
          if (Phaser.Math.Distance.Between(d.x, d.y, boss.x, boss.y) < BEE_STING_RANGE + BOSS_RADIUS) {
            stingBoss(boss, delta);
            break;
          }
      }
      if (allHome) {
        for (const d of swarm.dots) d.destroy();
        beeSwarms = beeSwarms.filter((s) => s !== swarm);
        hiveSlots[swarm.slot] = true;
        updateBearTexture();
      }
      return;
    }
    const step = swarm.speed * delta / 1e3;
    const target = swarm.path[swarm.pathIndex];
    let allReached = true;
    for (let i = 0; i < swarm.dots.length; i++) {
      const d = swarm.dots[i];
      const tx = target.x + Math.sin(i * 1.8) * 12, ty = target.y + Math.cos(i * 1.8) * 12;
      const dist = Phaser.Math.Distance.Between(d.x, d.y, tx, ty);
      if (dist > step) {
        const a = Math.atan2(ty - d.y, tx - d.x);
        d.x += Math.cos(a) * step;
        d.y += Math.sin(a) * step;
        allReached = false;
      } else {
        d.x = tx;
        d.y = ty;
      }
    }
    if (allReached) {
      swarm.pathIndex++;
      if (swarm.pathIndex >= swarm.path.length) {
        swarm.state = "returning";
        swarm.path = [];
        return;
      }
    }
    for (const e of enemies) {
      if (e.state === "dead") continue;
      for (const d of swarm.dots)
        if (Phaser.Math.Distance.Between(d.x, d.y, e.sprite.x, e.sprite.y) < BEE_STING_RANGE) {
          stingEnemy(e, delta);
          break;
        }
    }
    if (boss && boss.state === "active") {
      for (const d of swarm.dots)
        if (Phaser.Math.Distance.Between(d.x, d.y, boss.x, boss.y) < BEE_STING_RANGE + BOSS_RADIUS) {
          stingBoss(boss, delta);
          break;
        }
    }
  }
  function renderPathPreview() {
    pathGraphics.clear();
    if (!gameState.drawing || gameState.drawPath.length < 1) return;
    const canFire = hiveSlots[0] || hiveSlots[1];
    const pathColor = canFire ? COLORS.bee.body : 16720418;
    const first = gameState.drawPath[0];
    pathGraphics.lineStyle(2, pathColor, canFire ? 0.4 : 0.6);
    pathGraphics.beginPath();
    const ddx = first.x - bear.x, ddy = first.y - bear.y;
    const tl = Math.sqrt(ddx * ddx + ddy * ddy);
    if (tl > 0) {
      const ux = ddx / tl, uy = ddy / tl;
      let dist = 0, seg = true;
      while (dist < tl) {
        const end = Math.min(dist + (seg ? 14 : 8), tl);
        if (seg) {
          pathGraphics.moveTo(bear.x + ux * dist, bear.y + uy * dist);
          pathGraphics.lineTo(bear.x + ux * end, bear.y + uy * end);
        }
        dist = end;
        seg = !seg;
      }
    }
    pathGraphics.strokePath();
    if (gameState.drawPath.length < 2) return;
    pathGraphics.lineStyle(3, pathColor, canFire ? 0.8 : 0.9);
    pathGraphics.beginPath();
    pathGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < gameState.drawPath.length; i++) pathGraphics.lineTo(gameState.drawPath[i].x, gameState.drawPath[i].y);
    pathGraphics.strokePath();
  }
  function updateEnemy(e, delta) {
    if (e.state === "dead") return;
    const isSlowed = e.slowTimer > 0;
    if (isSlowed) {
      e.slowTimer -= delta;
      e.slowIcon.setPosition(e.sprite.x, e.sprite.y - 45);
      if (e.slowTimer <= 0) {
        e.state = "patrol";
        e.slowIcon.setVisible(false);
      }
    }
    const mm = isSlowed ? SLOW_MOVE_MULT : 1;
    const am = isSlowed ? SLOW_ATTACK_MULT : 1;
    const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, bear.x, bear.y);
    const range = e.type === "melee" ? MELEE_DETECT_RANGE : RANGED_DETECT_RANGE;
    if (e.type === "melee") {
      if (e.state !== "slowed") e.state = dist < range ? "chase" : "patrol";
      if (dist < range) {
        scene.physics.moveToObject(e.sprite, bear, MELEE_SPEED * mm);
        e.attackCooldown -= delta;
        if (dist < MELEE_ATTACK_RANGE && e.attackCooldown <= 0) {
          e.attackCooldown = MELEE_ATTACK_COOLDOWN / am;
          damageBear(1, e.sprite.x, e.sprite.y);
        }
      } else {
        const od = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, e.patrolOriginX, e.patrolOriginY);
        if (od > 10) scene.physics.moveToObject(e.sprite, { x: e.patrolOriginX, y: e.patrolOriginY }, MELEE_SPEED * 0.4 * mm);
        else e.sprite.body.setVelocity(0, 0);
      }
    } else {
      if (dist < range) {
        if (dist < 150) {
          const a = Math.atan2(e.sprite.y - bear.y, e.sprite.x - bear.x);
          e.sprite.body.setVelocity(Math.cos(a) * RANGED_SPEED * mm, Math.sin(a) * RANGED_SPEED * mm);
        } else {
          e.sprite.body.setVelocity(0, 0);
        }
        e.attackCooldown -= delta;
        if (e.attackCooldown <= 0) {
          e.attackCooldown = RANGED_SHOOT_COOLDOWN / am;
          shootProjectile(e);
        }
      } else {
        e.sprite.body.setVelocity(0, 0);
      }
    }
    e.sprite.setFlipX(bear.x < e.sprite.x);
    if (inBushZone(e.sprite.x, e.sprite.y)) {
      const eb = e.sprite.body;
      eb.setVelocity(eb.velocity.x * 0.45, eb.velocity.y * 0.45);
    }
    updateEnemyHpBar(e);
  }
  function stingEnemy(e, delta) {
    if (e.state === "dead") return;
    e.state = "slowed";
    e.slowTimer = SLOW_DURATION;
    e.slowIcon.setVisible(true);
    const prevFloor = Math.floor(e.hpFrac);
    e.hpFrac -= BEE_DPS * delta / 1e3;
    e.hp = Math.ceil(Math.max(0, e.hpFrac));
    if (Math.floor(e.hpFrac) < prevFloor) {
      SFX.enemyHurt();
      scene.tweens.killTweensOf(e.sprite);
      e.sprite.setTint(16724787);
      scene.tweens.add({
        targets: e.sprite,
        scaleX: 1.25,
        scaleY: 0.8,
        duration: 60,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          e.sprite.clearTint();
          e.sprite.setScale(1);
        }
      });
      showFloatingText(e.sprite.x, e.sprite.y - 40, "🐝", "#f5c542");
    }
    if (e.hpFrac <= 0) {
      killEnemy(e);
      SFX.enemyDie();
      showFloatingText(e.sprite.x, e.sprite.y - 60, "💀", "#ffaa00");
    }
  }
  function killEnemy(e) {
    e.state = "dead";
    e.sprite.setTexture("skeleton").setAlpha(1).setDepth(4);
    e.sprite.body.setEnable(false);
    e.hpBar.setVisible(false);
    e.slowIcon.setVisible(false);
    scene.tweens.add({ targets: e.sprite, scaleX: 1.3, scaleY: 1.3, duration: 120, yoyo: true });
  }
  function updateEnemyHpBar(e) {
    const bar = e.hpBar, bx = e.sprite.x - 28, by = e.sprite.y - 55;
    bar.clear();
    bar.fillStyle(3346705, 1);
    bar.fillRect(bx, by, 56, 8);
    const pct = Math.max(0, e.hpFrac / e.maxHp);
    bar.fillStyle(pct > 0.4 ? 4513092 : 14500932, 1);
    bar.fillRect(bx, by, 56 * pct, 8);
  }
  function shootProjectile(e) {
    SFX.enemyShoot();
    const a = Math.atan2(bear.y - e.sprite.y, bear.x - e.sprite.x);
    const vx = Math.cos(a) * PROJECTILE_SPEED, vy = Math.sin(a) * PROJECTILE_SPEED;
    const s = projectileGroup.create(e.sprite.x, e.sprite.y, "projectile");
    s.setDepth(9);
    s.body.setVelocity(vx, vy);
    s.body.setAllowGravity(false);
    projectiles.push({ sprite: s, vx, vy });
    scene.time.delayedCall(4e3, () => {
      if (s.active) s.destroy();
      projectiles = projectiles.filter((p) => p.sprite !== s);
    });
  }
  function updateProjectiles() {
    projectiles = projectiles.filter((p) => p.sprite.active);
  }
  const KNOCKBACK_SPEED = 340;
  const KNOCKBACK_MS = 140;
  let knockbackTimer = 0;
  let knockbackVx = 0, knockbackVy = 0;
  function damageBear(amount, fromX, fromY) {
    if (bearDamageCooldown > 0) return;
    bearDamageCooldown = 800;
    SFX.bearHurt();
    gameState.bearHp = Math.max(0, gameState.bearHp - amount);
    scene.tweens.killTweensOf(bear);
    bear.setTint(16720418);
    scene.tweens.add({
      targets: bear,
      scaleX: 1.2,
      scaleY: 0.85,
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        bear.clearTint();
        bear.setScale(1);
      }
    });
    if (fromX !== void 0 && fromY !== void 0) {
      const ax = bear.x - fromX, ay = bear.y - fromY;
      const mag = Math.sqrt(ax * ax + ay * ay) || 1;
      knockbackVx = ax / mag * KNOCKBACK_SPEED;
      knockbackVy = ay / mag * KNOCKBACK_SPEED;
      knockbackTimer = KNOCKBACK_MS;
    }
    if (gameState.bearHp <= 0) triggerGameOver();
  }
  function onBearEnemyOverlap(_b, enemySprite) {
    const e = enemies.find((en) => en.sprite === enemySprite);
    if (!e || e.state === "dead") return;
    if (e.type === "melee") damageBear(1, e.sprite.x, e.sprite.y);
  }
  function onBearProjectileOverlap(_b, projSprite) {
    const p = projectiles.find((pr) => pr.sprite === projSprite);
    if (!p) return;
    damageBear(1, p.sprite.x, p.sprite.y);
    p.sprite.destroy();
    projectiles = projectiles.filter((pr) => pr !== p);
  }
  function checkCages() {
    for (const cage of cages) {
      if (cage.opened) continue;
      if (Phaser.Math.Distance.Between(bear.x, bear.y, cage.sprite.x, cage.sprite.y) < CAGE_OPEN_RANGE) openCage(cage);
    }
  }
  function openCage(cage) {
    cage.opened = true;
    gameState.cagesRescued++;
    SFX.cageOpen();
    cage.helpBubble.destroy();
    cage.helpText.destroy();
    scene.tweens.killTweensOf(cage.critterIcon);
    cage.critterIcon.destroy();
    scene.tweens.add({ targets: cage.sprite, alpha: 0, scaleY: 2, duration: 500, ease: "Power2" });
    cage.critter.setVisible(true);
    scene.tweens.add({
      targets: cage.critter,
      y: cage.critter.y - 140,
      alpha: 0,
      duration: 1400,
      ease: "Power2",
      onComplete: () => cage.critter.destroy()
    });
    const thanks = ["Thanks! 🐻♥", "Yay! Thank you!", "Free at last!", "You're my hero!"];
    const msg = thanks[gameState.cagesRescued - 1] ?? "Thank you!";
    showFloatingText(cage.sprite.x, cage.sprite.y - 30, msg, "#ffffaa");
    if (currentStage === 3 && gameState.cagesRescued >= gameState.cagesTotal && boss && boss.state === "dormant") {
      awakenBoss(boss);
    }
  }
  function checkGoal() {
    if (currentStage === 3) return;
    if (gameState.cagesRescued < gameState.cagesTotal) return;
    if (Phaser.Math.Distance.Between(bear.x, bear.y, goalX, goalY) < GOAL_RADIUS + BEAR_RADIUS) triggerLevelComplete();
  }
  function triggerLevelComplete() {
    if (gameState.levelComplete) return;
    gameState.levelComplete = true;
    bear.setVelocity(0, 0);
    if (currentStage !== 3 || !boss || boss.state !== "dead") SFX.stageClear();
    if (gameState.stage === 1) {
      showOverlay("🍯 Stage 1 Clear! 🍯", "#ffee55", "Heading to the city...", "#aaffaa", () => {
        currentStage = 2;
        scene.scene.restart();
      });
    } else if (gameState.stage === 2) {
      showOverlay("🚔 Stage 2 Clear! 🚔", "#aaddff", "Infiltrating the data center...", "#88ffee", () => {
        currentStage = 3;
        scene.scene.restart();
      });
    } else {
      showOverlay("🏆 Game Complete! 🏆", "#00ffcc", "All critters freed — the AI is defeated!", "#aaffee", () => {
        currentStage = 1;
        scene.scene.start("TitleScene");
      });
    }
  }
  function triggerGameOver() {
    if (gameState.gameOver) return;
    gameState.gameOver = true;
    bear.setVelocity(0, 0).setTint(16711680);
    BGM.stop();
    showOverlay("🐻 Game Over", "#ff6655", "The bear fell...", "#ffaaaa", () => {
      currentStage = 1;
      scene.scene.start("TitleScene");
    });
  }
  function showOverlay(title, titleColor, sub, subColor, onTap) {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const bg = scene.add.graphics().setDepth(68);
    bg.fillStyle(0, 0.72);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const t1 = scene.add.text(
      cx,
      cy - 90,
      title,
      { fontSize: "56px", fontFamily: "Arial Black", color: titleColor, stroke: "#000000", strokeThickness: 6 }
    ).setOrigin(0.5).setDepth(69);
    const t2 = scene.add.text(
      cx,
      cy,
      sub,
      { fontSize: "34px", fontFamily: "Arial", color: subColor }
    ).setOrigin(0.5).setDepth(69);
    const t3 = scene.add.text(
      cx,
      cy + 80,
      "Tap to continue",
      { fontSize: "30px", fontFamily: "Arial", color: "#ffffff" }
    ).setOrigin(0.5).setDepth(69);
    scene.cameras.main.ignore([bg, t1, t2, t3]);
    scene.input.once("pointerdown", () => {
      if (onTap) onTap();
      else scene.scene.restart();
    });
  }
  function showFloatingText(x, y, text, color = "#ffd700") {
    const t = scene.add.text(x, y, text, { fontSize: "28px", fontFamily: "Arial", color, fontStyle: "bold" }).setOrigin(0.5).setDepth(49);
    scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1200, ease: "Power2", onComplete: () => t.destroy() });
  }
  const INFO_H = 52;
  const INFO_Y = GAME_HEIGHT - HUD_H - INFO_H - SAFE_B;
  function buildHUD(sc) {
    hudBg = sc.add.graphics().setDepth(60);
    hudBg.fillStyle(0, 0.78);
    hudBg.fillRoundedRect(0, INFO_Y, GAME_WIDTH, INFO_H, 0);
    hudBg.lineStyle(2, 5596740, 0.9);
    hudBg.lineBetween(0, INFO_Y, GAME_WIDTH, INFO_Y);
    hudBg.lineStyle(1, 2241314, 0.6);
    hudBg.lineBetween(0, INFO_Y + INFO_H, GAME_WIDTH, INFO_Y + INFO_H);
    hudHpBar = sc.add.graphics().setDepth(61);
    hudStaminaBar = sc.add.graphics().setDepth(61);
    const textY = INFO_Y + 7;
    hudHpText = sc.add.text(
      10,
      textY,
      "",
      { fontSize: "22px", fontFamily: "Arial Black", color: "#ff6655", stroke: "#000000", strokeThickness: 3 }
    ).setDepth(62);
    hudDodgeText = sc.add.text(
      GAME_WIDTH / 2,
      textY,
      "",
      { fontSize: "22px", fontFamily: "Arial Black", color: "#66ccff", stroke: "#000000", strokeThickness: 3 }
    ).setOrigin(0.5, 0).setDepth(62);
    hudCageText = sc.add.text(
      GAME_WIDTH * 0.62,
      textY + 1,
      "",
      { fontSize: "22px", fontFamily: "Arial Black", color: "#88ffaa", stroke: "#000000", strokeThickness: 3 }
    ).setOrigin(0, 0).setDepth(62);
    hudHintText = sc.add.text(
      GAME_WIDTH / 2,
      INFO_Y - 5,
      "Drag to send bees  •  Rescue critters  •  Reach EXIT",
      { fontSize: "15px", fontFamily: "Arial", color: "#778866" }
    ).setOrigin(0.5, 1).setDepth(62).setAlpha(0.65);
    const portFrameW = 140;
    const slotW = (GAME_WIDTH - portFrameW - 32 - SAFE_R) / 2;
    const lSlotX = 8;
    const rSlotX = GAME_WIDTH - SAFE_R - 8 - slotW;
    const slotY = GAME_HEIGHT - HUD_H + 8;
    const slotH = HUD_H - 16;
    const slotPositions = [lSlotX, rSlotX];
    for (let s = 0; s < BEE_MAX_SWARMS; s++) {
      const lbl = sc.add.text(
        slotPositions[s] + slotW / 2,
        slotY + slotH - 34,
        s === 0 ? "L READY" : "R READY",
        { fontSize: "22px", fontFamily: "Arial Black", color: "#88ff44", stroke: "#000000", strokeThickness: 3 }
      ).setOrigin(0.5, 1).setDepth(64);
      hudSlotTexts.push(lbl);
    }
    debugMenuBg = sc.add.graphics().setDepth(80);
    debugMenuText = sc.add.text(0, 0, "", {
      fontSize: "22px",
      fontFamily: "Courier New",
      color: "#00ff88",
      backgroundColor: void 0,
      padding: { x: 0, y: 0 }
    }).setDepth(81).setVisible(false);
    drawDebugMenu();
    bossHudBg = sc.add.graphics().setDepth(70).setAlpha(0);
    bossHudBar = sc.add.graphics().setDepth(71).setAlpha(0);
    bossHudNameText = sc.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 68, "", {
      fontSize: "26px",
      fontFamily: "Georgia, serif",
      color: "#ddbbbb",
      stroke: "#000000",
      strokeThickness: 4,
      fontStyle: "italic"
    }).setOrigin(0.5, 1).setDepth(72).setAlpha(0);
  }
  function drawDebugMenu() {
    const open = debugMenuOpen;
    debugMenuBg.clear();
    debugMenuText.setVisible(open);
    if (!open) return;
    const pw = 320, ph = 162;
    const px = GAME_WIDTH - pw - 16, py = 16;
    debugMenuBg.fillStyle(0, 0.82);
    debugMenuBg.fillRoundedRect(px, py, pw, ph, 8);
    debugMenuBg.lineStyle(2, 65416, 0.9);
    debugMenuBg.strokeRoundedRect(px, py, pw, ph, 8);
    debugMenuText.setPosition(px + 14, py + 10);
    const stageLabel = (n) => n === currentStage ? ` ► Stage ${n}` : `   Stage ${n}`;
    debugMenuText.setText(
      `DEBUG  [P] close
[1]${stageLabel(1)}  (Forest)
[2]${stageLabel(2)}  (City)
[3]${stageLabel(3)}  (Data Center)
[B] Fight Boss (Stage 3)`
    );
  }
  function refreshHUD(delta) {
    var _a, _b;
    const barY = INFO_Y + 28;
    const barH = 16;
    const barR = 5;
    hudHpBar.clear();
    hudHpBar.fillStyle(2230280, 1);
    hudHpBar.fillRoundedRect(68, barY, 190, barH, barR);
    const pct = gameState.bearHp / gameState.bearMaxHp;
    const hpCol = pct > 0.6 ? 4513092 : pct > 0.3 ? 16755234 : 16724770;
    hudHpBar.fillStyle(hpCol, 1);
    const hpFill = Math.max(0, 190 * pct);
    hudHpBar.fillRoundedRect(68, barY, hpFill, barH, barR);
    if (hpFill > 6) {
      hudHpBar.fillStyle(16777215, 0.35);
      hudHpBar.fillRoundedRect(68, barY, hpFill, barH / 2, barR);
      hudHpBar.fillStyle(16777215, 0.55);
      hudHpBar.fillRect(68 + hpFill - 4, barY, 4, barH);
    }
    hudHpText.setText("HP").setColor(pct > 0.3 ? "#ff6655" : "#ff2200");
    hudStaminaBar.clear();
    const sbX = GAME_WIDTH / 2 - 82;
    const pipW = 74, pipH = barH, pipGap = 14;
    const stamReady = dodgeCharges > 0;
    for (let c = 0; c < DODGE_CHARGES; c++) {
      const px = sbX + c * (pipW + pipGap);
      const charged = c < dodgeCharges;
      hudStaminaBar.fillStyle(660768, 1);
      hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH, barR);
      if (charged) {
        hudStaminaBar.fillStyle(2267630, 1);
        hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH, barR);
        hudStaminaBar.fillStyle(16777215, 0.25);
        hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH / 2, barR);
      } else if (c === dodgeCharges && dodgeCooldown > 0) {
        const fillPct = 1 - dodgeCooldown / DODGE_COOLDOWN;
        hudStaminaBar.fillStyle(1136042, 1);
        hudStaminaBar.fillRoundedRect(px, barY, Math.max(0, pipW * fillPct), pipH, barR);
      }
    }
    hudDodgeText.setText(stamReady ? "DODGE" : "DODGE").setColor(stamReady ? "#55ddff" : "#335566");
    const r = gameState.cagesRescued, t = gameState.cagesTotal;
    const allDone = r >= t;
    hudCageText.setText(`Rescued: ${r}/${t}${allDone ? "  DONE" : ""}`);
    hudCageText.setColor(allDone ? "#ffee55" : "#88ffaa");
    for (let s = 0; s < BEE_MAX_SWARMS; s++) {
      const ready = hiveSlots[s];
      (_a = hudSlotTexts[s]) == null ? void 0 : _a.setColor(ready ? "#aaff44" : "#ff9933");
      (_b = hudSlotTexts[s]) == null ? void 0 : _b.setText(ready ? s === 0 ? "L READY" : "R READY" : s === 0 ? "L FLYING" : "R FLYING");
    }
    drawBottomHUD();
  }
  function drawBottomHUD() {
    const g = hudBottomG;
    g.clear();
    const panelY = GAME_HEIGHT - HUD_H - SAFE_B;
    const portFrameW = 140;
    const gap = 8;
    const slotW = (GAME_WIDTH - portFrameW - gap * 4 - SAFE_R) / 2;
    const lSlotX = gap;
    const rSlotX = GAME_WIDTH - SAFE_R - gap - slotW;
    const portFrameX = lSlotX + slotW + gap;
    const portCX = GAME_WIDTH / 2;
    const portCY = panelY + HUD_H / 2;
    const slotY = panelY + gap;
    const slotH = HUD_H - gap * 2;
    g.fillStyle(395272, 0.97);
    g.fillRect(0, panelY, GAME_WIDTH, HUD_H + SAFE_B);
    g.lineStyle(2, 4478259, 1);
    g.lineBetween(0, panelY, GAME_WIDTH, panelY);
    g.lineStyle(1, 2241314, 0.5);
    g.lineBetween(0, panelY + 2, GAME_WIDTH, panelY + 2);
    const slotXs = [lSlotX, rSlotX];
    for (let s = 0; s < BEE_MAX_SWARMS; s++) {
      const sx = slotXs[s];
      const ready = hiveSlots[s];
      g.fillStyle(ready ? 924166 : 1707524, 1);
      g.fillRoundedRect(sx, slotY, slotW, slotH, 10);
      g.fillStyle(ready ? 3827220 : 4463110, 0.4);
      g.fillRoundedRect(sx + 2, slotY + 2, slotW - 4, 10, 4);
      g.lineStyle(ready ? 3 : 2, ready ? 10088004 : 13391121, ready ? 0.95 : 0.7);
      g.strokeRoundedRect(sx, slotY, slotW, slotH, 10);
      if (ready) {
        g.lineStyle(1, 14544998, 0.5);
        g.lineBetween(sx + 10, slotY + 2, sx + 20, slotY + 2);
        g.lineBetween(sx + slotW - 20, slotY + 2, sx + slotW - 10, slotY + 2);
      }
      const hx = sx + slotW / 2, hy = slotY + slotH * 0.38;
      const ha = ready ? 1 : 0.22;
      g.fillStyle(ready ? COLORS.hive.body : 6702080, ha);
      g.fillEllipse(hx, hy, 46, 54);
      g.fillStyle(ready ? COLORS.hive.dark : 4465152, ha);
      g.fillRect(hx - 21, hy - 8, 42, 5);
      g.fillRect(hx - 21, hy + 0, 42, 5);
      g.fillRect(hx - 21, hy + 8, 42, 5);
      g.fillStyle(1706496, ha);
      g.fillEllipse(hx, hy + 17, 15, 9);
      if (ready) {
        g.fillStyle(16768324, 0.25);
        g.fillEllipse(hx, hy + 17, 22, 14);
      }
      if (ready) {
        const t2 = hudBeeOrbitTime / 1e3;
        for (let b = 0; b < 5; b++) {
          const angle = t2 * 2.4 + b / 5 * Math.PI * 2;
          const orb = 28 + Math.sin(t2 * 1.8 + b) * 5;
          const bx2 = hx + Math.cos(angle) * orb;
          const by2 = hy + Math.sin(angle) * orb * 0.42;
          g.fillStyle(14544639, 0.7);
          g.fillEllipse(bx2 - 5, by2 - 3, 9, 5);
          g.fillEllipse(bx2 + 3, by2 - 3, 9, 5);
          g.fillStyle(COLORS.bee.body, 1);
          g.fillCircle(bx2, by2, 5);
          g.fillStyle(1710592, 0.9);
          g.fillRect(bx2 - 2, by2 - 1, 4, 2);
        }
      }
    }
    g.fillStyle(659976, 1);
    g.fillRoundedRect(portFrameX, slotY, portFrameW, slotH, 10);
    g.fillStyle(2769944, 0.4);
    g.fillRoundedRect(portFrameX + 2, slotY + 2, portFrameW - 4, 10, 4);
    g.lineStyle(2, 6990394, 0.9);
    g.strokeRoundedRect(portFrameX, slotY, portFrameW, slotH, 10);
    g.fillStyle(2241314, 0.85);
    g.fillRoundedRect(portFrameX + portFrameW / 2 - 22, slotY - 1, 44, 16, 4);
    g.lineStyle(1, 5941802, 0.7);
    g.strokeRoundedRect(portFrameX + portFrameW / 2 - 22, slotY - 1, 44, 16, 4);
    drawBearPortrait(g, portCX, portCY, slotXs, slotW, slotY, slotH);
  }
  function drawBearPortrait(g, cx, cy, slotXs, slotW, slotY, slotH) {
    const hurt = gameState.bearHp <= 2;
    const dashing = dodgeTimer > 0;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const busy = !hiveSlots[s];
      const armY = busy ? cy + 44 : cy + 22;
      const pawTipX = cx + side * 50;
      const pawTipY = armY + 10;
      const slotConnX = s === 0 ? slotXs[0] + slotW : slotXs[1];
      const slotConnY = slotY + slotH * 0.38 + 16;
      g.lineStyle(3, busy ? 6702080 : COLORS.hive.body, busy ? 0.5 : 0.9);
      g.lineBetween(pawTipX, pawTipY, slotConnX, slotConnY);
    }
    g.fillStyle(COLORS.bear.body, 1);
    g.fillEllipse(cx, cy + 10, 80, 64);
    g.fillCircle(cx, cy - 18, 34);
    g.fillStyle(COLORS.bear.dark, 1);
    g.fillCircle(cx - 24, cy - 44, 14);
    g.fillCircle(cx + 24, cy - 44, 14);
    g.fillStyle(COLORS.bear.body, 1);
    g.fillCircle(cx - 24, cy - 44, 9);
    g.fillCircle(cx + 24, cy - 44, 9);
    g.fillStyle(COLORS.bear.snout, 1);
    g.fillEllipse(cx, cy - 10, 26, 16);
    g.fillStyle(1706496, 1);
    g.fillEllipse(cx, cy - 16, 10, 6);
    g.fillStyle(11154176, 0.75);
    g.fillRect(cx - 17, cy - 28, 34, 5);
    g.fillStyle(1706496, 1);
    g.fillTriangle(cx - 20, cy - 34, cx - 8, cy - 30, cx - 8, cy - 27);
    g.fillTriangle(cx - 20, cy - 34, cx - 20, cy - 30, cx - 8, cy - 27);
    g.fillTriangle(cx + 20, cy - 34, cx + 8, cy - 30, cx + 8, cy - 27);
    g.fillTriangle(cx + 20, cy - 34, cx + 20, cy - 30, cx + 8, cy - 27);
    if (dashing) {
      g.fillStyle(16777215, 1);
      g.fillEllipse(cx - 14, cy - 26, 14, 12);
      g.fillEllipse(cx + 14, cy - 26, 14, 12);
      g.fillStyle(16746496, 1);
      g.fillCircle(cx - 14, cy - 26, 5);
      g.fillCircle(cx + 14, cy - 26, 5);
      g.fillStyle(0, 1);
      g.fillCircle(cx - 14, cy - 26, 2);
      g.fillCircle(cx + 14, cy - 26, 2);
    } else if (hurt) {
      g.fillStyle(16720418, 1);
      g.fillRect(cx - 20, cy - 30, 8, 3);
      g.fillRect(cx - 17, cy - 27, 3, 8);
      g.fillRect(cx + 5, cy - 30, 8, 3);
      g.fillRect(cx + 8, cy - 27, 3, 8);
      g.fillStyle(16746496, 0.35);
      g.fillCircle(cx - 14, cy - 26, 7);
      g.fillCircle(cx + 14, cy - 26, 7);
    } else {
      g.fillStyle(16777215, 1);
      g.fillEllipse(cx - 14, cy - 26, 14, 8);
      g.fillEllipse(cx + 14, cy - 26, 14, 8);
      g.fillStyle(16746496, 1);
      g.fillCircle(cx - 14, cy - 26, 4);
      g.fillCircle(cx + 14, cy - 26, 4);
      g.fillStyle(0, 1);
      g.fillCircle(cx - 14, cy - 26, 2);
      g.fillCircle(cx + 14, cy - 26, 2);
      g.lineStyle(2, 1706496, 1);
      g.lineBetween(cx - 20, cy - 28, cx - 8, cy - 28);
      g.lineBetween(cx + 8, cy - 28, cx + 20, cy - 28);
    }
    g.fillStyle(1703936, 1);
    g.fillRoundedRect(cx - 10, cy - 7, 20, 10, 2);
    g.fillStyle(16777215, 1);
    g.fillRect(cx - 9, cy - 6, 4, 6);
    g.fillRect(cx - 3, cy - 6, 4, 6);
    g.fillRect(cx + 3, cy - 6, 4, 6);
    if (hurt) {
      g.lineStyle(2, 8921600, 0.7);
      g.lineBetween(cx - 18, cy - 12, cx - 14, cy - 4);
      g.lineBetween(cx + 14, cy - 4, cx + 18, cy - 12);
    }
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const busy = !hiveSlots[s];
      const armY = busy ? cy + 44 : cy + 22;
      const pawX = cx + side * 50;
      g.fillStyle(COLORS.bear.body, 1);
      g.fillEllipse(cx + side * 30, armY - 8, 20, busy ? 32 : 24);
      g.fillStyle(busy ? 6702080 : COLORS.hive.body, 1);
      g.fillEllipse(pawX, armY + 10, 22, 28);
      g.fillStyle(busy ? 4465152 : COLORS.hive.dark, 1);
      g.fillRect(pawX - 10, armY + 4, 20, 4);
      g.fillRect(pawX - 10, armY + 10, 20, 4);
    }
  }
  function buildBearTextures(sc) {
    makeBearTex(sc, "bear", false, false);
    makeBearTex(sc, "bear_l", true, false);
    makeBearTex(sc, "bear_r", false, true);
    makeBearTex(sc, "bear_lr", true, true);
  }
  function makeBearTex(sc, key, leftDown, rightDown) {
    const W = 64, H = 72, g = sc.make.graphics({}, false);
    const mid = W / 2;
    g.fillStyle(COLORS.bear.body, 1);
    g.fillEllipse(mid, H / 2 + 6, 48, 40);
    g.fillCircle(mid, 20, 18);
    g.fillStyle(COLORS.bear.dark, 1);
    g.fillCircle(20, 8, 8);
    g.fillCircle(44, 8, 8);
    g.fillStyle(COLORS.bear.body, 1);
    g.fillCircle(20, 8, 5);
    g.fillCircle(44, 8, 5);
    g.fillStyle(COLORS.bear.snout, 1);
    g.fillEllipse(mid, 24, 16, 10);
    g.fillStyle(1706496, 1);
    g.fillEllipse(mid, 18, 7, 5);
    g.fillStyle(1706496, 1);
    g.fillTriangle(16, 10, 26, 13, 26, 15);
    g.fillTriangle(16, 10, 16, 13, 26, 15);
    g.fillTriangle(48, 10, 38, 13, 38, 15);
    g.fillTriangle(48, 10, 48, 13, 38, 15);
    g.fillStyle(16777215, 1);
    g.fillEllipse(24, 17, 10, 6);
    g.fillEllipse(40, 17, 10, 6);
    g.fillStyle(16746496, 1);
    g.fillCircle(24, 17, 3);
    g.fillCircle(40, 17, 3);
    g.fillStyle(0, 1);
    g.fillCircle(24, 17, 1);
    g.fillCircle(40, 17, 1);
    g.lineStyle(2, 1706496, 1);
    g.lineBetween(18, 15, 30, 15);
    g.lineBetween(34, 15, 46, 15);
    g.fillStyle(1703936, 1);
    g.fillRoundedRect(mid - 7, 28, 14, 7, 2);
    g.fillStyle(16777215, 1);
    g.fillRect(mid - 6, 29, 3, 4);
    g.fillRect(mid - 2, 29, 3, 4);
    g.fillRect(mid + 2, 29, 3, 4);
    g.fillStyle(11154176, 0.7);
    g.fillRect(mid - 14, 14, 28, 3);
    const lY = leftDown ? H - 10 : H / 2 + 4;
    const rY = rightDown ? H - 10 : H / 2 + 4;
    g.fillStyle(COLORS.hive.body, 1);
    g.fillEllipse(8, lY, 14, 18);
    g.fillEllipse(56, rY, 14, 18);
    g.fillStyle(COLORS.hive.dark, 1);
    g.fillRect(2, lY - 4, 12, 3);
    g.fillRect(2, lY + 1, 12, 3);
    g.fillRect(50, rY - 4, 12, 3);
    g.fillRect(50, rY + 1, 12, 3);
    g.generateTexture(key, W, H);
    g.destroy();
  }
  function updateBearTexture() {
    const l = !hiveSlots[0], r = !hiveSlots[1];
    bear.setTexture(l && r ? "bear_lr" : l ? "bear_l" : r ? "bear_r" : "bear");
  }
  function spawnGoal(sc) {
    goalX = LEVEL_WIDTH / 2;
    goalY = 220;
    if (currentStage === 3) {
      spawnBoss(sc, goalX, goalY);
      return;
    }
    goalSprite = sc.add.circle(goalX, goalY, GOAL_RADIUS, COLORS.goal.glow, 0.85).setDepth(5);
    const exitEmoji = currentStage === 2 ? "🚪" : "⭐";
    sc.add.text(goalX, goalY, exitEmoji, { fontSize: "48px" }).setOrigin(0.5).setDepth(6);
    sc.tweens.add({ targets: goalSprite, scaleX: 1.2, scaleY: 1.2, alpha: 0.6, duration: 900, yoyo: true, repeat: -1 });
    sc.add.text(goalX, goalY + GOAL_RADIUS + 20, "EXIT", { fontSize: "24px", fontFamily: "Arial", color: "#ffee55", fontStyle: "bold" }).setOrigin(0.5).setDepth(6);
  }
  function spawnCages(sc) {
    const CRITTERS = currentStage === 3 ? ["🦉", "🦋", "🐸", "🦊"] : currentStage === 2 ? ["🐦", "🐀", "🐱", "🐶"] : ["🐇", "🦊", "🦔", "🦝"];
    const positions = [
      { x: LEVEL_WIDTH * 0.25, y: LEVEL_HEIGHT * 0.35 },
      { x: LEVEL_WIDTH * 0.75, y: LEVEL_HEIGHT * 0.35 },
      { x: LEVEL_WIDTH * 0.3, y: LEVEL_HEIGHT * 0.6 },
      { x: LEVEL_WIDTH * 0.7, y: LEVEL_HEIGHT * 0.6 }
    ];
    createCageTexture(sc);
    for (let i = 0; i < positions.length; i++) {
      const { x, y } = positions[i];
      const sprite = sc.add.sprite(x, y, "cage").setDepth(6);
      const critterIcon = sc.add.text(x, y + 4, CRITTERS[i], { fontSize: "28px" }).setOrigin(0.5).setDepth(5);
      sc.tweens.add({
        targets: critterIcon,
        y: y - 8,
        duration: 700 + i * 80,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      const helpBubble = sc.add.graphics().setDepth(7);
      drawHelpBubble(helpBubble, x, y - 52);
      const helpText = sc.add.text(x, y - 58, "HELP!", {
        fontSize: "16px",
        fontFamily: "Arial Black",
        color: "#cc2222"
      }).setOrigin(0.5).setDepth(8);
      sc.tweens.add({
        targets: helpText,
        scaleX: 1.12,
        scaleY: 1.12,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      const critter = sc.add.text(x, y, CRITTERS[i], { fontSize: "36px" }).setOrigin(0.5).setDepth(9).setVisible(false);
      cages.push({ sprite, opened: false, critter, critterIcon, helpBubble, helpText });
    }
  }
  function drawHelpBubble(g, cx, cy) {
    const bw = 62, bh = 26, br = 8;
    const bx = cx - bw / 2, by = cy - bh / 2;
    g.fillStyle(16777215, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, br);
    g.lineStyle(2, 13378082, 1);
    g.strokeRoundedRect(bx, by, bw, bh, br);
    g.fillStyle(16777215, 0.92);
    g.fillTriangle(cx - 6, by + bh, cx + 6, by + bh, cx, by + bh + 10);
    g.lineStyle(2, 13378082, 1);
    g.lineBetween(cx - 6, by + bh, cx, by + bh + 10);
    g.lineBetween(cx, by + bh + 10, cx + 6, by + bh);
  }
  function spawnEnemies(sc) {
    if (currentStage === 3) {
      createDCEnemyTexture(sc, "melee_enemy", false);
      createDCEnemyTexture(sc, "ranged_enemy", true);
      createBossProjTextures(sc);
    } else if (currentStage === 2) {
      createCityEnemyTexture(sc, "melee_enemy", false);
      createCityEnemyTexture(sc, "ranged_enemy", true);
    } else {
      createEnemyTexture(sc, "melee_enemy", false);
      createEnemyTexture(sc, "ranged_enemy", true);
    }
    createProjectileTexture(sc);
    createBeeDotTexture(sc);
    createSkeletonTexture(sc);
    const mp = [{ x: LEVEL_WIDTH * 0.2, y: LEVEL_HEIGHT * 0.45 }, { x: LEVEL_WIDTH * 0.8, y: LEVEL_HEIGHT * 0.45 }, { x: LEVEL_WIDTH * 0.5, y: LEVEL_HEIGHT * 0.4 }, { x: LEVEL_WIDTH * 0.35, y: LEVEL_HEIGHT * 0.7 }, { x: LEVEL_WIDTH * 0.65, y: LEVEL_HEIGHT * 0.7 }];
    const rp = [{ x: LEVEL_WIDTH * 0.15, y: LEVEL_HEIGHT * 0.3 }, { x: LEVEL_WIDTH * 0.85, y: LEVEL_HEIGHT * 0.3 }, { x: LEVEL_WIDTH * 0.5, y: LEVEL_HEIGHT * 0.55 }];
    for (const p of mp) spawnEnemy(sc, p.x, p.y, "melee");
    for (const p of rp) spawnEnemy(sc, p.x, p.y, "ranged");
  }
  function spawnEnemy(sc, x, y, type) {
    const sprite = enemyGroup.create(x, y, type === "melee" ? "melee_enemy" : "ranged_enemy");
    sprite.setDepth(8).setCircle(24, 8, 8);
    sprite.body.setAllowGravity(false);
    const hpBar = sc.add.graphics().setDepth(9);
    const slowIcon = sc.add.text(x, y - 45, "🐝 Slowed", { fontSize: "18px", color: "#ffff88" }).setOrigin(0.5).setDepth(11).setVisible(false);
    const e = {
      sprite,
      type,
      state: "patrol",
      hp: type === "melee" ? MELEE_HP : RANGED_HP,
      maxHp: type === "melee" ? MELEE_HP : RANGED_HP,
      hpFrac: type === "melee" ? MELEE_HP : RANGED_HP,
      slowTimer: 0,
      attackCooldown: type === "melee" ? MELEE_ATTACK_COOLDOWN : RANGED_SHOOT_COOLDOWN,
      patrolOriginX: x,
      patrolOriginY: y,
      hpBar,
      slowIcon
    };
    enemies.push(e);
    updateEnemyHpBar(e);
  }
  function createEnemyTexture(sc, key, isRanged) {
    const W = 56, H = 56, g = sc.make.graphics({}, false);
    g.fillStyle(isRanged ? 10044450 : 2245802, 1);
    g.fillRect(16, 24, 24, 22);
    g.fillStyle(15254682, 1);
    g.fillCircle(28, 18, 14);
    g.fillStyle(8921634, 1);
    g.fillRect(14, 4, 28, 8);
    g.fillRect(18, 2, 20, 6);
    g.fillStyle(3355443, 1);
    g.fillCircle(23, 16, 2);
    g.fillCircle(33, 16, 2);
    if (!isRanged) {
      g.fillStyle(8947848, 1);
      g.fillRect(44, 14, 6, 28);
      g.fillStyle(5592405, 1);
      g.fillRect(40, 12, 14, 8);
    } else {
      g.fillStyle(6702080, 1);
      g.fillRect(42, 18, 4, 20);
      g.lineStyle(2, 4465152, 1);
      g.arc(44, 28, 12, -0.9, 0.9, false);
      g.strokePath();
    }
    g.generateTexture(key, W, H);
    g.destroy();
  }
  function createProjectileTexture(sc) {
    const g = sc.make.graphics({}, false);
    g.fillStyle(16755200, 1);
    g.fillCircle(8, 8, 8);
    g.fillStyle(16737792, 0.7);
    g.fillCircle(8, 8, 5);
    g.generateTexture("projectile", 16, 16);
    g.destroy();
  }
  function createCageTexture(sc) {
    const W = 52, H = 56, g = sc.make.graphics({}, false);
    g.fillStyle(8947848, 1);
    g.fillRect(0, 0, W, 6);
    g.fillRect(0, H - 6, W, 6);
    for (let i = 0; i <= 5; i++) {
      const bx = Math.round(i / 5 * (W - 4));
      g.fillRect(bx, 0, 4, H);
    }
    g.generateTexture("cage", W, H);
    g.destroy();
  }
  function createBeeDotTexture(sc) {
    const g = sc.make.graphics({}, false);
    g.fillStyle(14544639, 0.7);
    g.fillEllipse(4, 4, 10, 6);
    g.fillEllipse(14, 4, 10, 6);
    g.fillStyle(COLORS.bee.body, 1);
    g.fillEllipse(9, 8, 10, 8);
    g.fillStyle(1710592, 0.9);
    g.fillRect(6, 7, 6, 2);
    g.fillStyle(1710592, 1);
    g.fillCircle(14, 8, 3);
    g.fillStyle(16777215, 1);
    g.fillCircle(15, 7, 1);
    g.generateTexture("bee_dot", 18, 14);
    g.destroy();
  }
  function createSkeletonTexture(sc) {
    const W = 56, H = 40, g = sc.make.graphics({}, false);
    const bone = 14540236, dark = 8947831;
    g.fillStyle(bone, 1);
    g.fillEllipse(28, 16, 30, 18);
    g.fillStyle(dark, 1);
    for (let r = 0; r < 3; r++) {
      g.fillRect(17, 10 + r * 4, 22, 2);
    }
    g.fillStyle(bone, 1);
    g.fillCircle(28, 8, 10);
    g.fillStyle(3355426, 1);
    g.fillCircle(24, 7, 3);
    g.fillCircle(32, 7, 3);
    g.fillStyle(3355426, 1);
    g.fillRect(27, 10, 2, 2);
    g.fillStyle(3355426, 1);
    g.fillRect(22, 13, 12, 3);
    g.fillStyle(bone, 1);
    for (let t = 0; t < 4; t++) {
      g.fillRect(23 + t * 3, 13, 2, 2);
    }
    g.fillStyle(bone, 1);
    g.fillRoundedRect(6, 18, 14, 4, 2);
    g.fillRoundedRect(2, 20, 8, 4, 2);
    g.fillRoundedRect(36, 18, 14, 4, 2);
    g.fillRoundedRect(46, 20, 8, 4, 2);
    g.fillRoundedRect(18, 28, 6, 12, 2);
    g.fillRoundedRect(22, 28, 6, 12, 2);
    g.fillRoundedRect(30, 28, 6, 12, 2);
    g.fillRoundedRect(34, 28, 6, 12, 2);
    g.generateTexture("skeleton", W, H);
    g.destroy();
  }
  function inBushZone(x, y) {
    for (const r of bushZones) {
      if (r.contains(x, y)) return true;
    }
    return false;
  }
  function buildTerrain(sc) {
    if (currentStage === 3) {
      buildDCTerrain();
      return;
    }
    if (currentStage === 2) {
      buildCityTerrain(sc);
      return;
    }
    const treePositions = [
      [55, 300],
      [55, 440],
      [40, 580],
      [70, 720],
      [45, 860],
      [60, 1e3],
      [50, 1140],
      [65, 1280],
      [45, 1420],
      [55, 1560],
      [160, 340],
      [150, 520],
      [170, 680],
      [155, 840],
      [165, 1020],
      [145, 1180],
      [170, 1340],
      [155, 1500],
      [LEVEL_WIDTH - 55, 300],
      [LEVEL_WIDTH - 55, 440],
      [LEVEL_WIDTH - 40, 580],
      [LEVEL_WIDTH - 70, 720],
      [LEVEL_WIDTH - 45, 860],
      [LEVEL_WIDTH - 60, 1e3],
      [LEVEL_WIDTH - 50, 1140],
      [LEVEL_WIDTH - 65, 1280],
      [LEVEL_WIDTH - 45, 1420],
      [LEVEL_WIDTH - 55, 1560],
      [LEVEL_WIDTH - 160, 340],
      [LEVEL_WIDTH - 150, 520],
      [LEVEL_WIDTH - 170, 680],
      [LEVEL_WIDTH - 155, 840],
      [LEVEL_WIDTH - 165, 1020],
      [LEVEL_WIDTH - 145, 1180],
      [LEVEL_WIDTH - 170, 1340],
      [LEVEL_WIDTH - 155, 1500],
      [200, 160],
      [340, 140],
      [480, 155],
      [620, 145],
      [760, 160],
      [900, 150],
      [LEVEL_WIDTH - 240, 160],
      [LEVEL_WIDTH - 380, 148],
      [260, 260],
      [420, 250],
      [560, 255],
      [700, 248],
      [840, 258],
      [980, 250],
      [200, LEVEL_HEIGHT - 160],
      [340, LEVEL_HEIGHT - 140],
      [480, LEVEL_HEIGHT - 155],
      [620, LEVEL_HEIGHT - 145],
      [760, LEVEL_HEIGHT - 160],
      [900, LEVEL_HEIGHT - 150],
      [LEVEL_WIDTH - 240, LEVEL_HEIGHT - 160],
      [260, LEVEL_HEIGHT - 260],
      [420, LEVEL_HEIGHT - 250],
      [560, LEVEL_HEIGHT - 255],
      [700, LEVEL_HEIGHT - 248],
      [240, 580],
      [300, 720],
      [220, 960],
      [310, 1100],
      [250, 1350],
      [330, 1480],
      [LEVEL_WIDTH - 240, 580],
      [LEVEL_WIDTH - 300, 720],
      [LEVEL_WIDTH - 220, 960],
      [LEVEL_WIDTH - 310, 1100],
      [LEVEL_WIDTH - 250, 1350],
      [LEVEL_WIDTH - 330, 1480]
    ];
    for (const [tx, ty] of treePositions) {
      const body = terrainGroup.create(tx, ty, void 0);
      body.setVisible(false).setActive(true);
      body.body.reset(tx, ty);
      body.body.setCircle(16, -16, -16);
      body.refreshBody();
    }
    bushZones = treePositions.map(([tx, ty]) => new Phaser.Geom.Circle(tx, ty, 50));
    const tentW = 160, tentH = 60;
    const tentY = LEVEL_HEIGHT * 0.5 - tentH / 2;
    for (const tx of [LEVEL_WIDTH / 2 - 200, LEVEL_WIDTH / 2 + 200]) {
      const tb = terrainGroup.create(tx, tentY + tentH / 2, void 0);
      tb.setVisible(false).setActive(true);
      tb.body.setSize(tentW, tentH);
      tb.body.reset(tx - tentW / 2, tentY);
      tb.refreshBody();
    }
  }
  function drawBackground(sc) {
    const g = sc.add.graphics().setDepth(0);
    g.fillStyle(COLORS.ground.base, 1);
    g.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    for (let tx = 0; tx < LEVEL_WIDTH; tx += TILE) for (let ty = 0; ty < LEVEL_HEIGHT; ty += TILE)
      if ((tx / TILE + ty / TILE) % 2 === 0) {
        g.fillStyle(COLORS.ground.dark, 0.35);
        g.fillRect(tx, ty, TILE, TILE);
      }
    g.fillStyle(COLORS.ground.path, 0.7);
    g.fillRect(0, LEVEL_HEIGHT * 0.5 - 40, LEVEL_WIDTH, 80);
    g.fillRect(LEVEL_WIDTH / 2 - 40, 0, 80, LEVEL_HEIGHT);
    g.fillStyle(COLORS.ground.dirt, 0.2);
    g.fillEllipse(LEVEL_WIDTH / 2, LEVEL_HEIGHT * 0.5, 700, 600);
    const d = sc.add.graphics().setDepth(1);
    const st = [[120, 200], [660, 180], [100, 700], [700, 650], [80, 1200], [680, 1300], [130, 1600], [650, 1550], [LEVEL_WIDTH - 120, 400], [LEVEL_WIDTH - 80, 900], [LEVEL_WIDTH - 100, 1400], [200, LEVEL_HEIGHT - 200], [LEVEL_WIDTH - 200, LEVEL_HEIGHT - 180]];
    for (const [tx, ty] of st) {
      d.fillStyle(6044958, 1);
      d.fillCircle(tx, ty, 20);
      d.fillStyle(8017200, 1);
      d.fillCircle(tx, ty, 14);
      d.fillStyle(9139029, 0.5);
      d.fillCircle(tx - 4, ty - 4, 6);
    }
    const lg = [[300, 350], [500, 420], [250, 900], [580, 880], [320, 1300], [460, 1350]];
    for (const [lx, ly] of lg) {
      d.fillStyle(6044958, 1);
      d.fillRoundedRect(lx - 35, ly - 10, 70, 20, 8);
      d.fillStyle(9139029, 0.4);
      d.fillCircle(lx - 30, ly, 10);
      d.fillCircle(lx + 30, ly, 10);
    }
    d.fillStyle(13404228, 0.8);
    d.fillTriangle(LEVEL_WIDTH / 2 - 200, LEVEL_HEIGHT * 0.5 - 60, LEVEL_WIDTH / 2 - 280, LEVEL_HEIGHT * 0.5 + 60, LEVEL_WIDTH / 2 - 120, LEVEL_HEIGHT * 0.5 + 60);
    d.fillStyle(11167266, 0.8);
    d.fillTriangle(LEVEL_WIDTH / 2 + 200, LEVEL_HEIGHT * 0.5 - 60, LEVEL_WIDTH / 2 + 120, LEVEL_HEIGHT * 0.5 + 60, LEVEL_WIDTH / 2 + 280, LEVEL_HEIGHT * 0.5 + 60);
    drawTrees(sc);
  }
  function drawTrees(sc) {
    const t = sc.add.graphics().setDepth(3);
    const trees = [
      // Left forest edge
      [55, 300],
      [55, 440],
      [40, 580],
      [70, 720],
      [45, 860],
      [60, 1e3],
      [50, 1140],
      [65, 1280],
      [45, 1420],
      [55, 1560],
      [160, 340],
      [150, 520],
      [170, 680],
      [155, 840],
      [165, 1020],
      [145, 1180],
      [170, 1340],
      [155, 1500],
      // Right forest edge
      [LEVEL_WIDTH - 55, 300],
      [LEVEL_WIDTH - 55, 440],
      [LEVEL_WIDTH - 40, 580],
      [LEVEL_WIDTH - 70, 720],
      [LEVEL_WIDTH - 45, 860],
      [LEVEL_WIDTH - 60, 1e3],
      [LEVEL_WIDTH - 50, 1140],
      [LEVEL_WIDTH - 65, 1280],
      [LEVEL_WIDTH - 45, 1420],
      [LEVEL_WIDTH - 55, 1560],
      [LEVEL_WIDTH - 160, 340],
      [LEVEL_WIDTH - 150, 520],
      [LEVEL_WIDTH - 170, 680],
      [LEVEL_WIDTH - 155, 840],
      [LEVEL_WIDTH - 165, 1020],
      [LEVEL_WIDTH - 145, 1180],
      [LEVEL_WIDTH - 170, 1340],
      [LEVEL_WIDTH - 155, 1500],
      // Top forest band (above camp)
      [200, 160],
      [340, 140],
      [480, 155],
      [620, 145],
      [760, 160],
      [900, 150],
      [LEVEL_WIDTH - 240, 160],
      [LEVEL_WIDTH - 380, 148],
      [260, 260],
      [420, 250],
      [560, 255],
      [700, 248],
      [840, 258],
      [980, 250],
      // Bottom forest band (below bear start)
      [200, LEVEL_HEIGHT - 160],
      [340, LEVEL_HEIGHT - 140],
      [480, LEVEL_HEIGHT - 155],
      [620, LEVEL_HEIGHT - 145],
      [760, LEVEL_HEIGHT - 160],
      [900, LEVEL_HEIGHT - 150],
      [LEVEL_WIDTH - 240, LEVEL_HEIGHT - 160],
      [260, LEVEL_HEIGHT - 260],
      [420, LEVEL_HEIGHT - 250],
      [560, LEVEL_HEIGHT - 255],
      [700, LEVEL_HEIGHT - 248],
      // Scattered interior trees (not on the dirt road or camp ellipse)
      [240, 580],
      [300, 720],
      [220, 960],
      [310, 1100],
      [250, 1350],
      [330, 1480],
      [LEVEL_WIDTH - 240, 580],
      [LEVEL_WIDTH - 300, 720],
      [LEVEL_WIDTH - 220, 960],
      [LEVEL_WIDTH - 310, 1100],
      [LEVEL_WIDTH - 250, 1350],
      [LEVEL_WIDTH - 330, 1480]
    ];
    for (const [tx, ty] of trees) {
      t.fillStyle(1716240, 0.5);
      t.fillEllipse(tx + 6, ty + 8, 44, 20);
      t.fillStyle(1985040, 1);
      t.fillCircle(tx, ty, 26);
      t.fillStyle(3041818, 1);
      t.fillCircle(tx - 3, ty - 4, 20);
      t.fillStyle(4098596, 1);
      t.fillCircle(tx - 5, ty - 8, 13);
      t.fillStyle(5943344, 0.7);
      t.fillCircle(tx - 7, ty - 11, 6);
    }
  }
  function drawCityBackground(sc) {
    const g = sc.add.graphics().setDepth(0);
    const C = COLORS.city;
    g.fillStyle(C.asphalt, 1);
    g.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    for (let tx = 0; tx < LEVEL_WIDTH; tx += TILE)
      for (let ty = 0; ty < LEVEL_HEIGHT; ty += TILE)
        if ((tx / TILE + ty / TILE) % 2 === 0) {
          g.fillStyle(C.asphaltDark, 0.3);
          g.fillRect(tx, ty, TILE, TILE);
        }
    g.fillStyle(C.sidewalk, 1);
    g.fillRect(0, 0, 130, LEVEL_HEIGHT);
    g.fillRect(LEVEL_WIDTH - 130, 0, 130, LEVEL_HEIGHT);
    g.fillStyle(C.sidewalkDark, 1);
    g.fillRect(128, 0, 4, LEVEL_HEIGHT);
    g.fillRect(LEVEL_WIDTH - 132, 0, 4, LEVEL_HEIGHT);
    g.fillStyle(C.sidewalk, 1);
    g.fillRect(0, 0, LEVEL_WIDTH, 100);
    g.fillRect(0, LEVEL_HEIGHT - 100, LEVEL_WIDTH, 100);
    g.fillStyle(C.line, 0.8);
    const laneX = LEVEL_WIDTH / 2;
    for (let dy = 0; dy < LEVEL_HEIGHT; dy += 80) {
      g.fillRect(laneX - 3, dy, 6, 44);
    }
    for (let dx = 140; dx < LEVEL_WIDTH - 140; dx += 80) {
      g.fillRect(dx, LEVEL_HEIGHT / 2 - 3, 44, 6);
    }
    const d = sc.add.graphics().setDepth(1);
    const buildingPositions = [
      // [x, y, w, h]
      [4, 160, 118, 180],
      [4, 380, 118, 140],
      [4, 560, 118, 200],
      [4, 800, 118, 160],
      [4, 1e3, 118, 180],
      [4, 1220, 118, 200],
      [4, 1460, 118, 160],
      [4, 1680, 118, 180],
      [LEVEL_WIDTH - 122, 160, 118, 180],
      [LEVEL_WIDTH - 122, 380, 118, 140],
      [LEVEL_WIDTH - 122, 560, 118, 200],
      [LEVEL_WIDTH - 122, 800, 118, 160],
      [LEVEL_WIDTH - 122, 1e3, 118, 180],
      [LEVEL_WIDTH - 122, 1220, 118, 200],
      [LEVEL_WIDTH - 122, 1460, 118, 160],
      [LEVEL_WIDTH - 122, 1680, 118, 180]
    ];
    for (const [bx, by, bw, bh] of buildingPositions) {
      d.fillStyle(C.building, 1);
      d.fillRect(bx, by, bw, bh);
      d.fillStyle(C.buildingDark, 1);
      d.fillRect(bx, by, bw, 6);
      d.lineStyle(1, C.buildingDark, 1);
      d.strokeRect(bx, by, bw, bh);
      const cols = Math.floor(bw / 28), rows = Math.floor(bh / 36);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = bx + 8 + c * 28, wy = by + 14 + r * 36;
          const lit = Math.random() > 0.35;
          d.fillStyle(lit ? C.windowLit : C.window, 0.85);
          d.fillRect(wx, wy, 16, 20);
        }
      }
    }
    d.fillStyle(15658700, 0.6);
    const cwY = [LEVEL_HEIGHT * 0.33, LEVEL_HEIGHT * 0.66];
    for (const cy2 of cwY) {
      for (let cx2 = 140; cx2 < LEVEL_WIDTH - 140; cx2 += 28)
        d.fillRect(cx2, cy2 - 20, 16, 40);
    }
    for (const [mx, my] of [[LEVEL_WIDTH * 0.3, LEVEL_HEIGHT * 0.25], [LEVEL_WIDTH * 0.7, LEVEL_HEIGHT * 0.45], [LEVEL_WIDTH * 0.5, LEVEL_HEIGHT * 0.6], [LEVEL_WIDTH * 0.4, LEVEL_HEIGHT * 0.75]]) {
      d.fillStyle(5592405, 1);
      d.fillCircle(mx, my, 18);
      d.fillStyle(4473924, 1);
      d.fillCircle(mx, my, 14);
      d.lineStyle(2, 6710886, 1);
      d.strokeCircle(mx, my, 16);
      d.lineBetween(mx - 12, my, mx + 12, my);
      d.lineBetween(mx, my - 12, mx, my + 12);
    }
    for (const [hx, hy] of [[160, 320], [160, 720], [160, 1100], [160, 1500], [LEVEL_WIDTH - 160, 440], [LEVEL_WIDTH - 160, 900], [LEVEL_WIDTH - 160, 1300]]) {
      d.fillStyle(14492194, 1);
      d.fillRect(hx - 8, hy - 14, 16, 20);
      d.fillStyle(11145489, 1);
      d.fillRect(hx - 10, hy + 4, 20, 6);
      d.fillStyle(16755200, 1);
      d.fillCircle(hx, hy - 14, 6);
    }
  }
  function buildCityTerrain(sc) {
    const wallRects = [
      // [x, y, w, h] — covers the building areas on the sidewalk edges
      [0, 100, 128, LEVEL_HEIGHT - 200],
      // entire left building strip
      [LEVEL_WIDTH - 128, 100, 128, LEVEL_HEIGHT - 200],
      // entire right building strip
      // Top & bottom walls
      [0, 0, LEVEL_WIDTH, 100],
      [0, LEVEL_HEIGHT - 100, LEVEL_WIDTH, 100]
    ];
    for (const [rx, ry, rw, rh] of wallRects) {
      const body = terrainGroup.create(rx + rw / 2, ry + rh / 2, void 0);
      body.setVisible(false).setActive(true);
      body.body.setSize(rw, rh);
      body.body.reset(rx, ry);
      body.refreshBody();
    }
    const carPositions = [
      [200, 350],
      [200, 520],
      [200, 700],
      [200, 880],
      [200, 1050],
      [200, 1230],
      [200, 1410],
      [200, 1580],
      [LEVEL_WIDTH - 200, 350],
      [LEVEL_WIDTH - 200, 520],
      [LEVEL_WIDTH - 200, 700],
      [LEVEL_WIDTH - 200, 880],
      [LEVEL_WIDTH - 200, 1050],
      [LEVEL_WIDTH - 200, 1230],
      [LEVEL_WIDTH - 200, 1410],
      [LEVEL_WIDTH - 200, 1580]
    ];
    const carG = sc.add.graphics().setDepth(2);
    for (const [cx3, cy3] of carPositions) {
      const facing = cx3 < LEVEL_WIDTH / 2 ? 1 : -1;
      drawCityCarAt(carG, cx3, cy3, facing);
      const body = terrainGroup.create(cx3, cy3, void 0);
      body.setVisible(false).setActive(true);
      body.body.setSize(70, 36);
      body.body.reset(cx3 - 35, cy3 - 18);
      body.refreshBody();
    }
    const dumpPositions = [
      [280, 440],
      [280, 800],
      [280, 1150],
      [280, 1490],
      [LEVEL_WIDTH - 280, 440],
      [LEVEL_WIDTH - 280, 800],
      [LEVEL_WIDTH - 280, 1150],
      [LEVEL_WIDTH - 280, 1490],
      [LEVEL_WIDTH / 2 - 200, LEVEL_HEIGHT * 0.4],
      [LEVEL_WIDTH / 2 + 200, LEVEL_HEIGHT * 0.6]
    ];
    const dumpG = sc.add.graphics().setDepth(3);
    for (const [dx2, dy2] of dumpPositions) {
      drawDumpsterAt(dumpG, dx2, dy2);
      const body = terrainGroup.create(dx2, dy2, void 0);
      body.setVisible(false).setActive(true);
      body.body.setSize(44, 32);
      body.body.reset(dx2 - 22, dy2 - 16);
      body.refreshBody();
      bushZones.push(new Phaser.Geom.Circle(dx2, dy2, 55));
    }
    const benchPositions = [
      [175, 250],
      [175, 620],
      [175, 990],
      [175, 1350],
      [LEVEL_WIDTH - 175, 250],
      [LEVEL_WIDTH - 175, 620],
      [LEVEL_WIDTH - 175, 990],
      [LEVEL_WIDTH - 175, 1350]
    ];
    const benchG = sc.add.graphics().setDepth(2);
    for (const [bx2, by2] of benchPositions) {
      drawBenchAt(benchG, bx2, by2);
      bushZones.push(new Phaser.Geom.Circle(bx2, by2, 36));
    }
  }
  function drawCityCarAt(g, cx3, cy3, facing) {
    g.fillStyle(Phaser.Math.RND.pick([2250154, 11149858, 2263091, 8947848, 10044416]), 1);
    g.fillRoundedRect(cx3 - 36, cy3 - 18, 72, 36, 6);
    g.fillStyle(11197951, 0.7);
    const wsX = cx3 + facing * 10;
    g.fillRoundedRect(wsX - 16, cy3 - 12, 32, 24, 3);
    g.fillStyle(1118481, 1);
    g.fillRect(cx3 - 36, cy3 - 18, 10, 8);
    g.fillRect(cx3 + 26, cy3 - 18, 10, 8);
    g.fillRect(cx3 - 36, cy3 + 10, 10, 8);
    g.fillRect(cx3 + 26, cy3 + 10, 10, 8);
    g.fillStyle(16777130, 1);
    const hlX = cx3 + facing * 34;
    g.fillRect(hlX - 4, cy3 - 14, 8, 6);
    g.fillRect(hlX - 4, cy3 + 8, 8, 6);
  }
  function drawDumpsterAt(g, dx2, dy2) {
    g.fillStyle(3368499, 1);
    g.fillRect(dx2 - 22, dy2 - 16, 44, 32);
    g.fillStyle(2245666, 1);
    g.fillRect(dx2 - 22, dy2 - 16, 44, 8);
    g.lineStyle(2, 1118481, 1);
    g.strokeRect(dx2 - 22, dy2 - 16, 44, 32);
    g.lineStyle(2, 2245666, 1);
    g.lineBetween(dx2 - 22, dy2 - 8, dx2 + 22, dy2 - 8);
  }
  function drawBenchAt(g, bx2, by2) {
    g.fillStyle(9136404, 1);
    g.fillRoundedRect(bx2 - 26, by2 - 6, 52, 12, 3);
    g.fillStyle(5592405, 1);
    g.fillRect(bx2 - 22, by2 + 4, 6, 8);
    g.fillRect(bx2 + 16, by2 + 4, 6, 8);
    g.fillStyle(7032592, 1);
    g.fillRoundedRect(bx2 - 26, by2 - 16, 52, 8, 2);
  }
  function createCityEnemyTexture(sc, key, isRanged) {
    const W = 56, H = 56, g = sc.make.graphics({}, false);
    g.fillStyle(isRanged ? 1714762 : 2767450, 1);
    g.fillRect(16, 24, 24, 22);
    g.fillStyle(15254682, 1);
    g.fillCircle(28, 18, 14);
    g.fillStyle(1710650, 1);
    g.fillRect(14, 4, 28, 8);
    g.fillRect(18, 2, 20, 6);
    g.fillStyle(16106818, 1);
    g.fillCircle(28, 8, 4);
    g.fillStyle(3355443, 1);
    g.fillCircle(23, 16, 2);
    g.fillCircle(33, 16, 2);
    if (!isRanged) {
      g.fillStyle(2236962, 1);
      g.fillRect(44, 14, 5, 28);
      g.fillStyle(4473924, 1);
      g.fillRect(40, 12, 12, 8);
      g.fillStyle(16106818, 1);
      g.fillRect(24, 28, 8, 10);
      g.fillStyle(1714762, 1);
      g.fillRect(25, 30, 6, 6);
    } else {
      g.fillStyle(2236962, 1);
      g.fillRect(42, 22, 5, 14);
      g.fillStyle(3355443, 1);
      g.fillRect(42, 18, 8, 6);
      g.fillStyle(16106818, 1);
      g.fillRect(24, 28, 8, 10);
      g.fillStyle(1714762, 1);
      g.fillCircle(28, 33, 3);
    }
    g.generateTexture(key, W, H);
    g.destroy();
  }
  function spawnBoss(sc, x, y) {
    const sprite = sc.add.graphics().setDepth(12);
    const hpBar = sc.add.graphics().setDepth(14);
    const nameText = sc.add.text(x, y - BOSS_RADIUS - 30, "???", {
      fontSize: "22px",
      fontFamily: "Arial Black",
      color: "#440044",
      stroke: "#000000",
      strokeThickness: 3
    }).setOrigin(0.5, 1).setDepth(14).setAlpha(0);
    const heads = [
      { name: "elon", label: "Elon", attackType: "slash", attackColor: 13369344, attackIcon: "⚡", cooldown: 0, cooldownMax: 4200, exprIdx: 0, exprTimer: 1200 },
      { name: "zuck", label: "Zuck", attackType: "projectile", attackColor: 1603570, attackIcon: "👍", cooldown: 1400, cooldownMax: 3200, exprIdx: 1, exprTimer: 2e3 },
      { name: "sam", label: "Sam", attackType: "timebomb", attackColor: 1090431, attackIcon: "🤖", cooldown: 2800, cooldownMax: 5500, exprIdx: 2, exprTimer: 1600 },
      { name: "jeff", label: "Jeff", attackType: "artillery", attackColor: 16750848, attackIcon: "📦", cooldown: 700, cooldownMax: 4800, exprIdx: 3, exprTimer: 2400 }
    ];
    boss = {
      x,
      y,
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      hpFrac: BOSS_MAX_HP,
      state: "dormant",
      sprite,
      hpBar,
      nameText,
      awakenTimer: 0,
      pulseT: 0,
      heads,
      timeBombs: [],
      slashGraphic: null,
      slashTimer: 0,
      stunTimer: 0
    };
    SFX.bossSpawn();
    drawBossBlob(boss);
  }
  function awakenBoss(b) {
    b.state = "awakening";
    b.awakenTimer = BOSS_AWAKEN_MS;
    showFloatingText(b.x, b.y - 120, "⚠ SYSTEM ALERT ⚠", "#ff2222");
    scene.cameras.main.shake(400, 0.012);
    BGM.stop();
    SFX.bossSpawn();
    setTimeout(() => BGM.startBoss(), 5500);
    scene.tweens.add({ targets: b.nameText, alpha: 1, duration: 600, ease: "Power2" });
  }
  function updateBoss(b, delta) {
    b.pulseT += delta;
    if (b.state === "dormant") {
      drawBossBlob(b);
      return;
    }
    if (b.state === "awakening") {
      b.awakenTimer -= delta;
      drawBossAwakening(b);
      if (b.awakenTimer <= 0) {
        b.state = "active";
        b.nameText.setText("BIG TECH CHIMERA");
        scene.cameras.main.shake(300, 0.018);
        showBossAppearBanner();
      }
      return;
    }
    if (b.state === "dead") return;
    if (b.stunTimer > 0) {
      b.stunTimer -= delta;
    } else {
      const dx = bear.x - b.x, dy = bear.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const spd = BOSS_SPEED * delta / 1e3;
      if (dist > BOSS_RADIUS + BEAR_RADIUS) {
        b.x += dx / dist * spd;
        b.y += dy / dist * spd;
      }
      for (const head of b.heads) {
        if (head.cooldown > 0) head.cooldown -= delta;
        if (head.cooldown <= 0) {
          fireHeadAttack(b, head);
          head.cooldown = head.cooldownMax;
        }
      }
    }
    const EXPR_COUNT = 5;
    const EXPR_DURATIONS = [1800, 1200, 900, 1400, 1e3];
    for (const head of b.heads) {
      head.exprTimer -= delta;
      if (head.exprTimer <= 0) {
        head.exprIdx = (head.exprIdx + 1) % EXPR_COUNT;
        head.exprTimer = EXPR_DURATIONS[head.exprIdx] + Math.random() * 600;
      }
    }
    updateTimeBombs(b, delta);
    if (b.slashTimer > 0) {
      b.slashTimer -= delta;
      if (b.slashTimer <= 0 && b.slashGraphic) {
        b.slashGraphic.clear();
      }
    }
    if (Phaser.Math.Distance.Between(b.x, b.y, bear.x, bear.y) < BOSS_RADIUS + BEAR_RADIUS) {
      damageBear(1, b.x, b.y);
    }
    drawBossActive(b);
    refreshBossHud(b);
    b.nameText.setPosition(b.x, b.y - BOSS_RADIUS - 30);
  }
  function fireHeadAttack(b, head) {
    const dx = bear.x - b.x, dy = bear.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    showFloatingText(b.x, b.y - BOSS_RADIUS - 60, head.attackIcon, "#ffffff");
    SFX.bossAttack(head.attackType);
    switch (head.attackType) {
      case "projectile": {
        const s = projectileGroup.create(b.x, b.y, "boss_proj_fb");
        s.setDepth(10);
        s.body.setVelocity(nx * 140, ny * 140).setAllowGravity(false);
        projectiles.push({ sprite: s, vx: nx * 140, vy: ny * 140 });
        scene.time.delayedCall(5e3, () => {
          if (s.active) s.destroy();
          projectiles = projectiles.filter((p) => p.sprite !== s);
        });
        break;
      }
      case "artillery": {
        const tx = bear.x + (Math.random() - 0.5) * 160;
        const ty = bear.y + (Math.random() - 0.5) * 160;
        const warn = scene.add.graphics().setDepth(11);
        warn.lineStyle(4, 16750848, 0.85);
        warn.strokeCircle(tx, ty, 55);
        warn.fillStyle(16750848, 0.18);
        warn.fillCircle(tx, ty, 55);
        const warningText = scene.add.text(tx, ty - 62, "📦", { fontSize: "28px" }).setOrigin(0.5).setDepth(12);
        scene.time.delayedCall(1200, () => {
          warn.destroy();
          warningText.destroy();
          const boom = scene.add.graphics().setDepth(11);
          boom.fillStyle(16750848, 0.7);
          boom.fillCircle(tx, ty, 55);
          scene.time.delayedCall(220, () => boom.destroy());
          if (Phaser.Math.Distance.Between(bear.x, bear.y, tx, ty) < 55 + BEAR_RADIUS)
            damageBear(1, tx, ty);
        });
        break;
      }
      case "timebomb": {
        const bx = b.x + nx * 120 + (Math.random() - 0.5) * 80;
        const by = b.y + ny * 120 + (Math.random() - 0.5) * 80;
        const bombG = scene.add.graphics().setDepth(11);
        const bomb = { sprite: bombG, x: bx, y: by, timer: 2800, radius: 90, warned: false };
        b.timeBombs.push(bomb);
        drawTimeBomb(bomb);
        break;
      }
      case "slash": {
        if (!b.slashGraphic) b.slashGraphic = scene.add.graphics().setDepth(13);
        const sg = b.slashGraphic;
        sg.clear();
        const angle = Math.atan2(dy, dx);
        sg.lineStyle(10, 13369344, 0.85);
        sg.beginPath();
        sg.arc(b.x, b.y, BOSS_RADIUS + 30, angle - 0.75, angle + 0.75, false);
        sg.strokePath();
        sg.lineStyle(4, 16737860, 0.6);
        sg.beginPath();
        sg.arc(b.x, b.y, BOSS_RADIUS + 50, angle - 0.55, angle + 0.55, false);
        sg.strokePath();
        b.slashTimer = 380;
        if (dist < BOSS_RADIUS + 90) damageBear(2, b.x, b.y);
        break;
      }
    }
  }
  function drawTimeBomb(bomb) {
    const g = bomb.sprite;
    g.clear();
    const pct = bomb.timer / 2800;
    const col = pct > 0.5 ? 1090431 : pct > 0.25 ? 16755200 : 16720418;
    g.fillStyle(0, 0.5);
    g.fillCircle(bomb.x, bomb.y, 18);
    g.lineStyle(3, col, 0.9);
    g.strokeCircle(bomb.x, bomb.y, 18);
    g.fillStyle(col, 1);
    g.fillCircle(bomb.x, bomb.y, 8);
    g.lineStyle(4, col, 0.7);
    g.beginPath();
    g.arc(bomb.x, bomb.y, 22, -Math.PI / 2, -Math.PI / 2 + (1 - pct) * Math.PI * 2, false);
    g.strokePath();
    g.lineStyle(1, col, 0.22);
    g.strokeCircle(bomb.x, bomb.y, bomb.radius);
  }
  function updateTimeBombs(b, delta) {
    for (let i = b.timeBombs.length - 1; i >= 0; i--) {
      const bomb = b.timeBombs[i];
      bomb.timer -= delta;
      if (!bomb.warned && bomb.timer < 700) {
        bomb.warned = true;
        scene.cameras.main.shake(120, 6e-3);
      }
      drawTimeBomb(bomb);
      if (bomb.timer <= 0) {
        bomb.sprite.clear();
        bomb.sprite.destroy();
        b.timeBombs.splice(i, 1);
        const boom = scene.add.graphics().setDepth(12);
        boom.fillStyle(1090431, 0.65);
        boom.fillCircle(bomb.x, bomb.y, bomb.radius);
        boom.lineStyle(3, 11206638, 0.8);
        boom.strokeCircle(bomb.x, bomb.y, bomb.radius);
        scene.cameras.main.shake(200, 0.014);
        scene.time.delayedCall(300, () => boom.destroy());
        if (Phaser.Math.Distance.Between(bear.x, bear.y, bomb.x, bomb.y) < bomb.radius + BEAR_RADIUS)
          damageBear(2, bomb.x, bomb.y);
      }
    }
  }
  function stingBoss(b, delta) {
    if (b.state !== "active") return;
    b.hpFrac -= BEE_DPS * delta / 1e3;
    b.hp = Math.max(0, Math.ceil(b.hpFrac));
    b.stunTimer = Math.min((b.stunTimer || 0) + BOSS_STUN_PER_STING, 600);
    b.sprite.setAlpha(0.6);
    SFX.bossHurt();
    scene.time.delayedCall(120, () => {
      if (b.sprite) b.sprite.setAlpha(1);
    });
    if (b.hpFrac <= 0) killBoss(b);
  }
  function killBoss(b) {
    b.state = "dead";
    b.sprite.clear();
    b.hpBar.clear();
    for (const bomb of b.timeBombs) {
      bomb.sprite.destroy();
    }
    b.timeBombs = [];
    if (b.slashGraphic) b.slashGraphic.clear();
    for (let i = 0; i < 6; i++) {
      scene.time.delayedCall(i * 200, () => {
        const ex = b.x + (Math.random() - 0.5) * 160;
        const ey = b.y + (Math.random() - 0.5) * 160;
        const boom = scene.add.graphics().setDepth(15);
        const col = [16729088, 16755200, 65484, 16720418][i % 4];
        boom.fillStyle(col, 0.8);
        boom.fillCircle(ex, ey, 40 + Math.random() * 30);
        scene.time.delayedCall(350, () => boom.destroy());
      });
    }
    scene.cameras.main.shake(500, 0.022);
    BGM.stop();
    SFX.bossClear();
    b.nameText.setText("** DEFEATED **").setColor("#00ffcc");
    scene.tweens.add({ targets: [bossHudBg, bossHudBar, bossHudNameText], alpha: 0, duration: 1200, delay: 400 });
    scene.time.delayedCall(1400, () => triggerLevelComplete());
  }
  function drawBossBlob(b) {
    const g = b.sprite;
    g.clear();
    const t = b.pulseT / 1e3;
    const r = BOSS_RADIUS * (0.85 + 0.1 * Math.sin(t * 1.8));
    g.fillStyle(655368, 0.92);
    g.fillCircle(b.x, b.y, r);
    g.lineStyle(3, 3342387, 0.7);
    g.strokeCircle(b.x, b.y, r);
    const qAlpha = 0.3 + 0.25 * Math.sin(t * 2.2);
    g.fillStyle(4456516, qAlpha);
    g.fillCircle(b.x, b.y, r * 0.45);
  }
  function drawBossAwakening(b) {
    const g = b.sprite;
    g.clear();
    const t = b.pulseT / 1e3;
    const prog = 1 - b.awakenTimer / BOSS_AWAKEN_MS;
    const r = BOSS_RADIUS * (0.85 + 0.18 * Math.sin(t * 5));
    g.fillStyle(655368, 0.9);
    g.fillCircle(b.x, b.y, r);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2 + t * 0.4;
      const len = r * prog * (0.6 + 0.4 * Math.sin(t * 3 + i));
      g.lineStyle(2, 16720418, prog * 0.8);
      g.lineBetween(b.x, b.y, b.x + Math.cos(angle) * len, b.y + Math.sin(angle) * len);
    }
    g.lineStyle(4, 16711748, prog * 0.9);
    g.strokeCircle(b.x, b.y, r);
  }
  const HEAD_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  function drawBossActive(b) {
    const g = b.sprite;
    g.clear();
    const t = b.pulseT / 1e3;
    const r = BOSS_RADIUS;
    g.fillStyle(1114129, 1);
    g.fillCircle(b.x, b.y, r);
    g.lineStyle(3, 4456516, 0.9);
    g.strokeCircle(b.x, b.y, r);
    if (b.stunTimer > 0) {
      g.lineStyle(5, 16776960, 0.7);
      g.strokeCircle(b.x, b.y, r + 6);
    }
    const ringRotation = t * 0.28;
    for (let i = 0; i < 4; i++) {
      const head = b.heads[i];
      const angle = HEAD_ANGLES[i] + ringRotation;
      const hx = b.x + Math.cos(angle) * (r - 4);
      const hy = b.y + Math.sin(angle) * (r - 4);
      drawBossHead(g, hx, hy, head, t, i);
    }
    const hpPct = b.hpFrac / b.maxHp;
    g.lineStyle(6, hpPct > 0.5 ? 65484 : hpPct > 0.25 ? 16755200 : 16720418, 0.8);
    g.beginPath();
    g.arc(b.x, b.y, r + 10, -Math.PI / 2, -Math.PI / 2 + hpPct * Math.PI * 2, false);
    g.strokePath();
  }
  function drawBossHead(g, hx, hy, head, t, idx) {
    const bob = Math.sin(t * 1.4 + idx * 1.1) * 3;
    const by2 = hy + bob;
    const expr = head.exprIdx;
    if (head.name === "elon") {
      const skin = 15783344;
      g.fillStyle(skin, 1);
      g.fillRoundedRect(hx - 22, by2 - 26, 44, 50, { tl: 10, tr: 10, bl: 14, br: 14 });
      g.fillStyle(7031336, 1);
      g.fillRect(hx - 22, by2 - 36, 44, 16);
      g.fillRoundedRect(hx - 20, by2 - 38, 40, 14, 5);
      g.fillStyle(skin, 1);
      g.fillTriangle(hx - 4, by2 - 32, hx + 4, by2 - 32, hx, by2 - 26);
      g.fillStyle(5913112, 1);
      g.fillRoundedRect(hx - 18, by2 - 18, 14, 5, 2);
      g.fillRoundedRect(hx + 4, by2 - 18, 14, 5, 2);
      g.fillStyle(skin, 1);
      g.fillEllipse(hx - 23, by2 - 5, 8, 12);
      g.fillEllipse(hx + 23, by2 - 5, 8, 12);
      g.fillStyle(13938832, 1);
      g.fillRoundedRect(hx - 8, by2 - 4, 16, 10, 4);
      g.fillStyle(12095594, 1);
      g.fillCircle(hx - 5, by2 + 4, 4);
      g.fillCircle(hx + 5, by2 + 4, 4);
      drawHeadExpression(g, hx, by2, skin, 6986448, expr);
      g.fillStyle(13369344, 1);
      g.fillTriangle(hx - 5, by2 + 22, hx + 5, by2 + 22, hx + 1, by2 + 30);
      g.fillTriangle(hx + 1, by2 + 28, hx + 7, by2 + 34, hx - 3, by2 + 34);
    } else if (head.name === "zuck") {
      const skin = 16111029;
      g.fillStyle(skin, 1);
      g.fillCircle(hx, by2, 28);
      g.fillStyle(4861456, 1);
      g.fillRect(hx - 28, by2 - 36, 56, 18);
      g.fillRoundedRect(hx - 26, by2 - 36, 52, 20, { tl: 14, tr: 14, bl: 0, br: 0 });
      g.fillRect(hx - 28, by2 - 20, 8, 16);
      g.fillRect(hx + 20, by2 - 20, 8, 16);
      g.fillStyle(5913112, 0.6);
      g.fillRect(hx - 17, by2 - 19, 12, 2);
      g.fillRect(hx + 5, by2 - 19, 12, 2);
      g.fillStyle(skin, 1);
      g.fillEllipse(hx - 29, by2 - 3, 8, 12);
      g.fillEllipse(hx + 29, by2 - 3, 8, 12);
      g.fillStyle(14727320, 1);
      g.fillCircle(hx, by2 + 2, 4);
      g.fillStyle(13146224, 1);
      g.fillCircle(hx - 3, by2 + 5, 2);
      g.fillCircle(hx + 3, by2 + 5, 2);
      drawHeadExpression(g, hx, by2, skin, 8081184, expr);
      g.fillStyle(1603570, 1);
      g.fillRoundedRect(hx - 6, by2 + 20, 12, 16, 3);
      g.fillStyle(skin, 1);
      g.fillRect(hx - 2, by2 + 20, 10, 5);
      g.fillStyle(16777215, 1);
      g.fillRect(hx - 2, by2 + 26, 8, 2);
    } else if (head.name === "sam") {
      const skin = 15583648;
      g.fillStyle(skin, 1);
      g.fillEllipse(hx, by2, 50, 56);
      g.fillStyle(2759176, 1);
      g.fillEllipse(hx, by2 - 28, 52, 26);
      for (let ci = -3; ci <= 3; ci++) g.fillCircle(hx + ci * 8, by2 - 36, 7);
      g.fillStyle(3809800, 1);
      g.fillRoundedRect(hx - 18, by2 - 18, 13, 4, 2);
      g.fillRoundedRect(hx + 5, by2 - 18, 13, 4, 2);
      g.fillStyle(13936760, 1);
      g.fillEllipse(hx, by2 - 1, 10, 12);
      g.fillStyle(12095594, 1);
      g.fillCircle(hx - 4, by2 + 5, 3);
      g.fillCircle(hx + 4, by2 + 5, 3);
      g.fillStyle(3809800, 0.35);
      for (let si = -3; si <= 3; si++) {
        g.fillCircle(hx + si * 5, by2 + 17, 2);
        g.fillCircle(hx + si * 4 - 10, by2 + 12, 1);
        g.fillCircle(hx + si * 4 + 10, by2 + 12, 1);
      }
      g.fillStyle(skin, 1);
      g.fillEllipse(hx - 26, by2 - 4, 8, 13);
      g.fillEllipse(hx + 26, by2 - 4, 8, 13);
      drawHeadExpression(g, hx, by2, skin, 7027210, expr);
      g.fillStyle(1090431, 1);
      g.fillCircle(hx, by2 + 30, 10);
      g.lineStyle(2, 16777215, 0.9);
      g.beginPath();
      g.arc(hx, by2 + 30, 6, 0, Math.PI * 2);
      g.strokePath();
      g.lineStyle(2, 16777215, 0.7);
      g.beginPath();
      g.arc(hx, by2 + 30, 3, -0.6, Math.PI * 1.8, false);
      g.strokePath();
    } else {
      const skin = 15782056;
      g.fillStyle(skin, 1);
      g.fillEllipse(hx, by2 - 4, 52, 60);
      g.fillStyle(16777215, 0.22);
      g.fillEllipse(hx - 8, by2 - 22, 18, 10);
      g.fillStyle(5913112, 1);
      g.fillRoundedRect(hx - 20, by2 - 15, 16, 6, 3);
      g.fillRoundedRect(hx + 4, by2 - 15, 16, 6, 3);
      g.fillStyle(skin, 1);
      g.fillEllipse(hx - 28, by2 - 4, 12, 20);
      g.fillEllipse(hx + 28, by2 - 4, 12, 20);
      g.fillStyle(13936760, 1);
      g.fillEllipse(hx - 28, by2 - 4, 7, 14);
      g.fillEllipse(hx + 28, by2 - 4, 7, 14);
      g.fillStyle(13936760, 1);
      g.fillEllipse(hx, by2 + 2, 14, 10);
      g.fillStyle(12095594, 1);
      g.fillCircle(hx - 5, by2 + 6, 4);
      g.fillCircle(hx + 5, by2 + 6, 4);
      drawHeadExpression(g, hx, by2, skin, 3809800, expr);
      g.lineStyle(3, 16750848, 1);
      g.beginPath();
      g.arc(hx, by2 + 26, 10, 0.25, Math.PI - 0.25, false);
      g.strokePath();
      g.fillStyle(16750848, 1);
      g.fillTriangle(hx + 9, by2 + 24, hx + 14, by2 + 28, hx + 8, by2 + 30);
    }
  }
  function drawHeadExpression(g, hx, by2, skin, irisCol, expr) {
    if (expr === 0) {
      g.fillStyle(16777215, 1);
      g.fillEllipse(hx - 12, by2 - 8, 16, 14);
      g.fillEllipse(hx + 12, by2 - 8, 16, 14);
      g.fillStyle(irisCol, 1);
      g.fillCircle(hx - 12, by2 - 8, 5);
      g.fillCircle(hx + 12, by2 - 8, 5);
      g.fillStyle(0, 1);
      g.fillCircle(hx - 12, by2 - 8, 2);
      g.fillCircle(hx + 12, by2 - 8, 2);
      g.fillStyle(16777215, 0.6);
      g.fillCircle(hx - 10, by2 - 10, 2);
      g.fillCircle(hx + 14, by2 - 10, 2);
      g.lineStyle(2, 5910544, 1);
      g.lineBetween(hx - 8, by2 + 12, hx + 8, by2 + 12);
    } else if (expr === 1) {
      g.fillStyle(16777215, 0.8);
      g.fillEllipse(hx - 12, by2 - 8, 16, 8);
      g.fillEllipse(hx + 12, by2 - 8, 16, 8);
      g.fillStyle(irisCol, 1);
      g.fillCircle(hx - 12, by2 - 8, 3);
      g.fillCircle(hx + 12, by2 - 8, 3);
      g.fillStyle(0, 1);
      g.fillCircle(hx - 12, by2 - 8, 2);
      g.fillCircle(hx + 12, by2 - 8, 2);
      g.lineStyle(3, 2756608, 1);
      g.lineBetween(hx - 18, by2 - 14, hx - 6, by2 - 10);
      g.lineBetween(hx + 6, by2 - 10, hx + 18, by2 - 14);
      g.fillStyle(3805184, 1);
      g.fillRoundedRect(hx - 14, by2 + 8, 28, 12, 3);
      g.fillStyle(16777215, 1);
      for (let ti = 0; ti < 5; ti++) g.fillRect(hx - 12 + ti * 6, by2 + 9, 4, 7);
    } else if (expr === 2) {
      g.fillStyle(16777215, 1);
      g.fillEllipse(hx - 12, by2 - 8, 18, 18);
      g.fillEllipse(hx + 12, by2 - 8, 18, 18);
      g.fillStyle(irisCol, 1);
      g.fillCircle(hx - 12, by2 - 8, 6);
      g.fillCircle(hx + 12, by2 - 8, 6);
      g.fillStyle(0, 1);
      g.fillCircle(hx - 12, by2 - 8, 3);
      g.fillCircle(hx + 12, by2 - 8, 3);
      g.lineStyle(3, 2756608, 1);
      g.lineBetween(hx - 18, by2 - 17, hx - 6, by2 - 19);
      g.lineBetween(hx + 6, by2 - 19, hx + 18, by2 - 17);
      g.fillStyle(1703936, 1);
      g.fillEllipse(hx, by2 + 12, 18, 14);
      g.fillStyle(13386820, 0.8);
      g.fillEllipse(hx, by2 + 13, 12, 9);
    } else if (expr === 3) {
      g.fillStyle(1706496, 1);
      g.fillEllipse(hx - 12, by2 - 8, 16, 16);
      g.fillEllipse(hx + 12, by2 - 8, 16, 16);
      g.fillStyle(3809296, 0.7);
      g.fillEllipse(hx - 12, by2 - 8, 10, 10);
      g.fillEllipse(hx + 12, by2 - 8, 10, 10);
      g.lineStyle(3, 2756608, 1);
      g.lineBetween(hx - 20, by2 - 16, hx - 4, by2 - 12);
      g.lineBetween(hx + 4, by2 - 12, hx + 20, by2 - 16);
      g.fillStyle(0, 1);
      g.fillEllipse(hx, by2 + 11, 22, 18);
      g.fillStyle(13378082, 0.6);
      g.fillEllipse(hx, by2 + 12, 14, 12);
      g.lineStyle(1, 16729156, 0.5);
      g.lineBetween(hx - 4, by2 + 6, hx - 4, by2 + 17);
      g.lineBetween(hx, by2 + 5, hx, by2 + 18);
      g.lineBetween(hx + 4, by2 + 6, hx + 4, by2 + 17);
      g.lineStyle(2, skin, 0.5);
      g.beginPath();
      g.moveTo(hx - 22, by2 - 5);
      g.lineTo(hx - 18, by2);
      g.lineTo(hx - 22, by2 + 5);
      g.strokePath();
      g.beginPath();
      g.moveTo(hx + 22, by2 - 5);
      g.lineTo(hx + 18, by2);
      g.lineTo(hx + 22, by2 + 5);
      g.strokePath();
    } else {
      g.fillStyle(16777215, 1);
      g.fillEllipse(hx - 12, by2 - 8, 14, 13);
      g.fillStyle(irisCol, 1);
      g.fillCircle(hx - 12, by2 - 8, 5);
      g.fillStyle(0, 1);
      g.fillCircle(hx - 12, by2 - 8, 2);
      g.fillStyle(16777215, 0.7);
      g.fillCircle(hx - 10, by2 - 10, 2);
      g.fillStyle(16711680, 0.18);
      g.fillCircle(hx + 12, by2 - 8, 16);
      g.fillStyle(16720418, 0.4);
      g.fillCircle(hx + 12, by2 - 8, 11);
      g.fillStyle(16711680, 1);
      g.fillCircle(hx + 12, by2 - 8, 7);
      g.fillStyle(16737894, 0.9);
      g.fillCircle(hx + 12, by2 - 8, 4);
      g.fillStyle(16777215, 1);
      g.fillCircle(hx + 14, by2 - 11, 2);
      g.lineStyle(2, 16729156, 0.85);
      for (let s = 0; s < 8; s++) {
        const sa = s / 8 * Math.PI * 2;
        g.lineBetween(
          hx + 12 + Math.cos(sa) * 8,
          by2 - 8 + Math.sin(sa) * 8,
          hx + 12 + Math.cos(sa) * 14,
          by2 - 8 + Math.sin(sa) * 14
        );
      }
      g.lineStyle(2, 5910544, 1);
      g.lineBetween(hx - 6, by2 + 12, hx + 6, by2 + 12);
    }
  }
  function showZoneEntrance(sc) {
    SFX.zoneEnter();
    const ZONE_NAMES = {
      1: "Dying Woods",
      2: "Data Farms Compound",
      3: "LLM Dimension Rendering"
    };
    const zoneName = ZONE_NAMES[currentStage] ?? `Stage ${currentStage}`;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 80;
    const lineG = sc.add.graphics().setDepth(75);
    lineG.lineStyle(1, 12298888, 0.7);
    lineG.lineBetween(cx - 300, cy - 22, cx + 300, cy - 22);
    lineG.lineBetween(cx - 300, cy + 50, cx + 300, cy + 50);
    sc.cameras.main.ignore(lineG);
    const nameT = sc.add.text(cx, cy, zoneName, {
      fontSize: "46px",
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: "#d4aa60",
      stroke: "#000000",
      strokeThickness: 6,
      fontStyle: "italic"
    }).setOrigin(0.5).setDepth(76).setAlpha(0);
    sc.cameras.main.ignore(nameT);
    const subT = sc.add.text(cx, cy + 34, "E N T E R S", {
      fontSize: "18px",
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: "#998855",
      stroke: "#000000",
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(76).setAlpha(0);
    sc.cameras.main.ignore(subT);
    sc.tweens.add({
      targets: [nameT, subT, lineG],
      alpha: 1,
      duration: 700,
      ease: "Power2",
      onComplete: () => {
        sc.time.delayedCall(2e3, () => {
          sc.tweens.add({
            targets: [nameT, subT, lineG],
            alpha: 0,
            duration: 800,
            ease: "Power2",
            onComplete: () => {
              nameT.destroy();
              subT.destroy();
              lineG.destroy();
            }
          });
        });
      }
    });
  }
  function showBossAppearBanner() {
    SFX.bossAppear();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 60;
    const lineG = scene.add.graphics().setDepth(75);
    lineG.lineStyle(2, 11149858, 0.85);
    lineG.lineBetween(cx - 320, cy - 28, cx + 320, cy - 28);
    lineG.lineBetween(cx - 320, cy + 56, cx + 320, cy + 56);
    scene.cameras.main.ignore(lineG);
    const nameT = scene.add.text(cx, cy, "Jeffelon Zuckerbezaltman", {
      fontSize: "52px",
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: "#cc2222",
      stroke: "#000000",
      strokeThickness: 8,
      fontStyle: "italic"
    }).setOrigin(0.5, 0.5).setDepth(76).setAlpha(0);
    scene.cameras.main.ignore(nameT);
    const subT = scene.add.text(cx, cy + 38, "A P P E A R S", {
      fontSize: "22px",
      fontFamily: 'Georgia, "Times New Roman", serif',
      color: "#882222",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5, 0.5).setDepth(76).setAlpha(0);
    scene.cameras.main.ignore(subT);
    scene.tweens.add({
      targets: [nameT, subT, lineG],
      alpha: 1,
      duration: 600,
      ease: "Power2",
      onComplete: () => {
        scene.time.delayedCall(1800, () => {
          scene.tweens.add({
            targets: [nameT, subT, lineG],
            alpha: 0,
            duration: 700,
            ease: "Power2",
            onComplete: () => {
              nameT.destroy();
              subT.destroy();
              lineG.destroy();
            }
          });
        });
      }
    });
  }
  function refreshBossHud(b) {
    if (!bossHudVisible) {
      bossHudVisible = true;
      scene.tweens.add({ targets: [bossHudBg, bossHudBar, bossHudNameText], alpha: 1, duration: 500 });
      bossHudNameText.setText("Big Tech Chimera");
    }
    const barW = GAME_WIDTH - 80, barH = 18;
    const barX = 40, barY = GAME_HEIGHT - 220;
    bossHudBg.clear();
    bossHudBg.fillStyle(0, 0.72);
    bossHudBg.fillRoundedRect(barX - 8, barY - 32, barW + 16, barH + 46, 6);
    bossHudBg.lineStyle(1, 8917265, 0.8);
    bossHudBg.strokeRoundedRect(barX - 8, barY - 32, barW + 16, barH + 46, 6);
    bossHudBar.clear();
    bossHudBar.fillStyle(3342336, 1);
    bossHudBar.fillRoundedRect(barX, barY, barW, barH, 4);
    const pct = Math.max(0, b.hpFrac / b.maxHp);
    const col = pct > 0.5 ? 14492194 : pct > 0.25 ? 16737792 : 16720418;
    bossHudBar.fillStyle(col, 1);
    bossHudBar.fillRoundedRect(barX, barY, Math.max(0, barW * pct), barH, 4);
    if (pct > 0.01) {
      const edgeX = barX + barW * pct;
      bossHudBar.fillStyle(16777215, 0.5);
      bossHudBar.fillRect(edgeX - 3, barY, 3, barH);
    }
    bossHudBar.lineStyle(1, 0, 0.4);
    for (let i = 1; i < b.maxHp; i++) {
      const tx = barX + barW / b.maxHp * i;
      bossHudBar.lineBetween(tx, barY, tx, barY + barH);
    }
    bossHudNameText.setPosition(GAME_WIDTH / 2, barY - 6);
  }
  function createBossProjTextures(sc) {
    const g = sc.make.graphics({}, false);
    g.fillStyle(1603570, 1);
    g.fillCircle(12, 12, 12);
    g.fillStyle(16777215, 0.6);
    g.fillCircle(9, 9, 4);
    g.generateTexture("boss_proj_fb", 24, 24);
    g.destroy();
  }
  function drawDataCenterBackground(sc) {
    const C = COLORS.dc;
    const g = sc.add.graphics().setDepth(0);
    g.fillStyle(C.floor, 1);
    g.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
    g.lineStyle(1, C.floorLine, 0.5);
    for (let x = 0; x < LEVEL_WIDTH; x += TILE) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, LEVEL_HEIGHT);
      g.strokePath();
    }
    for (let y = 0; y < LEVEL_HEIGHT; y += TILE) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(LEVEL_WIDTH, y);
      g.strokePath();
    }
    g.lineStyle(1, C.accent, 0.12);
    for (let tx = 0; tx < LEVEL_WIDTH; tx += TILE * 2)
      for (let ty = 0; ty < LEVEL_HEIGHT; ty += TILE * 2) {
        g.strokeRect(tx + 2, ty + 2, TILE * 2 - 4, TILE * 2 - 4);
        g.fillStyle(C.rackLight, 0.6);
        g.fillCircle(tx + 5, ty + 5, 3);
        g.fillCircle(tx + TILE * 2 - 5, ty + 5, 3);
        g.fillCircle(tx + 5, ty + TILE * 2 - 5, 3);
        g.fillCircle(tx + TILE * 2 - 5, ty + TILE * 2 - 5, 3);
      }
    const d = sc.add.graphics().setDepth(1);
    const rackW = 80, rackH = 180, rackGap = 20;
    const rackCols = [
      LEVEL_WIDTH * 0.22,
      LEVEL_WIDTH * 0.5,
      LEVEL_WIDTH * 0.78
    ];
    const rackRows = [];
    for (let ry = 180; ry < LEVEL_HEIGHT - 180; ry += rackH + rackGap) rackRows.push(ry);
    for (const cx4 of rackCols) {
      for (let ri = 0; ri < rackRows.length; ri++) {
        if (ri % 2 !== 0) continue;
        const ry = rackRows[ri];
        const rx = cx4 - rackW / 2;
        d.fillStyle(C.rack, 1);
        d.fillRect(rx, ry, rackW, rackH);
        d.fillStyle(C.rackDark, 1);
        d.fillRect(rx, ry, rackW, 6);
        d.fillStyle(C.rackDark, 1);
        d.fillRect(rx, ry + rackH - 6, rackW, 6);
        d.lineStyle(1, C.rackLight, 0.8);
        d.strokeRect(rx, ry, rackW, rackH);
        const slotH2 = 14, slotGap = 4;
        let sy = ry + 10;
        let ledIdx = 0;
        while (sy + slotH2 < ry + rackH - 10) {
          d.fillStyle(C.rackLight, 1);
          d.fillRect(rx + 4, sy, rackW - 8, slotH2);
          const ledColors = [C.led, C.led, C.ledAmber, C.ledRed, C.led, C.led, C.led, C.led];
          const lc = ledColors[ledIdx % ledColors.length];
          d.fillStyle(lc, 1);
          d.fillRect(rx + 6, sy + 4, 4, 6);
          d.fillStyle(C.led, 1);
          d.fillRect(rx + 12, sy + 4, 4, 6);
          d.fillStyle(C.rackDark, 1);
          for (let b = 0; b < 4; b++) d.fillRect(rx + 22 + b * 12, sy + 3, 10, slotH2 - 6);
          sy += slotH2 + slotGap;
          ledIdx++;
        }
        d.fillStyle(C.led, 0.7);
        d.fillRect(rx, ry + 2, 3, rackH - 4);
      }
    }
    const trayXs = [LEVEL_WIDTH * 0.35, LEVEL_WIDTH * 0.65];
    for (const tx2 of trayXs) {
      d.fillStyle(C.cable, 1);
      d.fillRect(tx2 - 8, 0, 16, LEVEL_HEIGHT);
      d.lineStyle(1, C.cableDark, 1);
      for (let cy5 = 20; cy5 < LEVEL_HEIGHT; cy5 += 40) {
        d.beginPath();
        d.arc(tx2, cy5, 6, 0, Math.PI * 2);
        d.strokePath();
      }
    }
    const coolerPositions = [
      [0, 0, LEVEL_WIDTH, 90],
      [0, LEVEL_HEIGHT - 90, LEVEL_WIDTH, 90]
    ];
    for (const [cx5, cy6, cw, ch] of coolerPositions) {
      d.fillStyle(C.cooling, 1);
      d.fillRect(cx5, cy6, cw, ch);
      d.fillStyle(C.coolingGlow, 0.4);
      d.fillRect(cx5, cy6, cw, ch);
      d.lineStyle(2, C.accent, 0.8);
      d.strokeRect(cx5, cy6, cw, ch);
      for (let vx = 20; vx < cw - 20; vx += 28) {
        d.fillStyle(C.rackDark, 1);
        d.fillRect(cx5 + vx, cy6 + 8, 18, ch - 16);
        d.lineStyle(1, C.accentGlow, 0.8);
        for (let vy = cy6 + 12; vy < cy6 + ch - 8; vy += 8) {
          d.beginPath();
          d.moveTo(cx5 + vx + 2, vy);
          d.lineTo(cx5 + vx + 16, vy);
          d.strokePath();
        }
      }
    }
    d.lineStyle(2, C.accent, 0.25);
    d.beginPath();
    d.moveTo(0, LEVEL_HEIGHT * 0.33);
    d.lineTo(LEVEL_WIDTH, LEVEL_HEIGHT * 0.33);
    d.strokePath();
    d.beginPath();
    d.moveTo(0, LEVEL_HEIGHT * 0.66);
    d.lineTo(LEVEL_WIDTH, LEVEL_HEIGHT * 0.66);
    d.strokePath();
    d.lineStyle(2, C.accent, 0.25);
    d.beginPath();
    d.moveTo(LEVEL_WIDTH * 0.35, 0);
    d.lineTo(LEVEL_WIDTH * 0.35, LEVEL_HEIGHT);
    d.strokePath();
    d.beginPath();
    d.moveTo(LEVEL_WIDTH * 0.65, 0);
    d.lineTo(LEVEL_WIDTH * 0.65, LEVEL_HEIGHT);
    d.strokePath();
  }
  function buildDCTerrain(sc) {
    const wallRects = [
      [0, 0, LEVEL_WIDTH, 90],
      [0, LEVEL_HEIGHT - 90, LEVEL_WIDTH, 90]
    ];
    for (const [rx, ry, rw, rh] of wallRects) {
      const body = terrainGroup.create(rx + rw / 2, ry + rh / 2, void 0);
      body.setVisible(false).setActive(true);
      body.body.setSize(rw, rh);
      body.body.reset(rx, ry);
      body.refreshBody();
    }
    const trayXs = [LEVEL_WIDTH * 0.35, LEVEL_WIDTH * 0.65];
    const traySlowYs = [LEVEL_HEIGHT * 0.25, LEVEL_HEIGHT * 0.5, LEVEL_HEIGHT * 0.75];
    for (const tx2 of trayXs) {
      for (const sy of traySlowYs) {
        bushZones.push(new Phaser.Geom.Circle(tx2, sy, 28));
      }
    }
  }
  function createDCEnemyTexture(sc, key, isRanged) {
    const W = 56, H = 56, g = sc.make.graphics({}, false);
    if (!isRanged) {
      g.fillStyle(2241348, 1);
      g.fillRect(16, 20, 24, 24);
      g.fillStyle(3359829, 1);
      g.fillRect(18, 22, 20, 20);
      g.fillStyle(COLORS.dc.led, 0.9);
      g.fillRect(22, 26, 12, 8);
      g.fillStyle(COLORS.dc.ledDim, 1);
      g.fillRect(23, 27, 10, 6);
      g.fillStyle(COLORS.dc.led, 1);
      g.fillRect(25, 29, 6, 2);
      g.fillStyle(2241348, 1);
      g.fillRect(16, 6, 24, 16);
      g.fillStyle(3359829, 1);
      g.fillRect(18, 8, 20, 12);
      g.fillStyle(COLORS.dc.led, 0.8);
      g.fillRect(19, 12, 18, 4);
      g.fillStyle(16777215, 0.6);
      g.fillRect(20, 13, 6, 2);
      g.fillStyle(4478310, 1);
      g.fillRect(40, 22, 6, 20);
      g.fillStyle(COLORS.dc.led, 0.9);
      g.fillRect(40, 20, 6, 6);
      g.fillStyle(2241348, 1);
      g.fillRect(18, 44, 8, 10);
      g.fillRect(30, 44, 8, 10);
      g.fillStyle(COLORS.dc.led, 0.5);
      g.fillRect(19, 50, 6, 2);
      g.fillRect(31, 50, 6, 2);
    } else {
      g.fillStyle(1122867, 1);
      g.fillCircle(28, 26, 18);
      g.fillStyle(2241348, 1);
      g.fillCircle(28, 24, 15);
      g.lineStyle(2, COLORS.dc.led, 0.9);
      g.strokeCircle(28, 26, 17);
      g.fillStyle(COLORS.dc.ledRed, 1);
      g.fillCircle(28, 24, 7);
      g.fillStyle(16737877, 0.8);
      g.fillCircle(28, 24, 4);
      g.fillStyle(16777215, 0.9);
      g.fillCircle(30, 22, 2);
      g.fillStyle(COLORS.dc.led, 0.2);
      g.fillEllipse(28, 46, 28, 8);
      g.fillStyle(3359829, 1);
      g.fillRect(42, 22, 12, 8);
      g.fillStyle(COLORS.dc.ledRed, 0.9);
      g.fillCircle(54, 26, 4);
      g.fillStyle(4478310, 0.8);
      g.fillRect(10, 10, 8, 4);
      g.fillRect(38, 10, 8, 4);
      g.fillRect(10, 38, 8, 4);
      g.fillRect(38, 38, 8, 4);
    }
    g.generateTexture(key, W, H);
    g.destroy();
  }
  const FOG_TILE = 48;
  const FOG_RADIUS = 280;
  const FOG_FADE = 80;
  function updateFog() {
    const g = fogGraphics;
    g.clear();
    const cam = scene.cameras.main;
    const zoom = cam.zoom;
    const bearScreenX = (bear.x - cam.worldView.x) * zoom;
    const bearScreenY = (bear.y - cam.worldView.y) * zoom;
    const visR = FOG_RADIUS * zoom;
    const fadeR = (FOG_RADIUS + FOG_FADE) * zoom;
    const tileS = FOG_TILE;
    for (let sx = 0; sx < GAME_WIDTH; sx += tileS) {
      for (let sy = 0; sy < GAME_HEIGHT; sy += tileS) {
        const tcx = sx + tileS / 2, tcy = sy + tileS / 2;
        const dist = Phaser.Math.Distance.Between(tcx, tcy, bearScreenX, bearScreenY);
        if (dist < visR) continue;
        if (dist < fadeR) {
          const t = (dist - visR) / (fadeR - visR);
          g.fillStyle(0, t * 0.82);
        } else {
          g.fillStyle(0, 0.82);
        }
        g.fillRect(sx, sy, tileS, tileS);
      }
    }
  }
  const IND_MARGIN = 52;
  const IND_ARROW = 14;
  function buildIndicatorTexts(sc) {
    const total = 5;
    for (let i = 0; i < total; i++) {
      const t = sc.add.text(0, 0, "", {
        fontSize: "20px",
        fontFamily: "Arial Black",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(66).setVisible(false);
      indicatorTexts.push(t);
    }
  }
  function updateIndicators() {
    var _a;
    indicatorG.clear();
    const cam = scene.cameras.main;
    const zoom = cam.zoom;
    const wv = cam.worldView;
    const camLeft = wv.x, camTop = wv.y;
    const camRight = wv.right, camBottom = wv.bottom;
    const mw = IND_MARGIN / zoom;
    const minX = IND_MARGIN, maxX = GAME_WIDTH - IND_MARGIN;
    const minY = IND_MARGIN, maxY = INFO_Y - IND_MARGIN;
    const allRescued = gameState.cagesRescued >= gameState.cagesTotal;
    const targets = [];
    if (!allRescued) {
      for (const cage of cages) {
        if (!cage.opened)
          targets.push({ wx: cage.sprite.x, wy: cage.sprite.y, label: "🐾", color: 8978346, textColor: "#88ffaa" });
      }
    } else if (currentStage === 3 && boss && boss.state === "active") {
      targets.push({ wx: boss.x, wy: boss.y, label: "👾", color: 16729156, textColor: "#ff4444" });
    } else if (currentStage !== 3) {
      targets.push({ wx: goalX, wy: goalY, label: "⭐", color: 16772693, textColor: "#ffee55" });
    }
    for (let i = targets.length; i < indicatorTexts.length; i++)
      (_a = indicatorTexts[i]) == null ? void 0 : _a.setVisible(false);
    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      const txt = indicatorTexts[i];
      if (!txt) continue;
      const onScreen = tgt.wx >= camLeft + mw && tgt.wx <= camRight - mw && tgt.wy >= camTop + mw && tgt.wy <= camBottom - mw;
      if (onScreen) {
        txt.setVisible(false);
        continue;
      }
      const sx = (tgt.wx - camLeft) * zoom;
      const sy = (tgt.wy - camTop) * zoom;
      const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
      const dx = sx - cx, dy = sy - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len, ny = dy / len;
      let ax = cx, ay = cy;
      if (Math.abs(nx) > 1e-4) {
        const tX = nx > 0 ? (maxX - cx) / nx : (minX - cx) / nx;
        const hitY = cy + ny * tX;
        if (hitY >= minY && hitY <= maxY) {
          ax = cx + nx * tX;
          ay = hitY;
        }
      }
      if (Math.abs(ny) > 1e-4) {
        const tY = ny > 0 ? (maxY - cy) / ny : (minY - cy) / ny;
        const hitX = cx + nx * tY;
        if (hitX >= minX && hitX <= maxX) {
          const tX2 = Math.abs(nx) > 1e-4 ? nx > 0 ? (maxX - cx) / nx : (minX - cx) / nx : Infinity;
          if (tY < tX2) {
            ax = hitX;
            ay = cy + ny * tY;
          }
        }
      }
      ax = Math.max(minX, Math.min(maxX, ax));
      ay = Math.max(minY, Math.min(maxY, ay));
      const worldDist = Math.round(Phaser.Math.Distance.Between(bear.x, bear.y, tgt.wx, tgt.wy));
      const px = -ny, py = nx;
      const tipX = ax + nx * IND_ARROW;
      const tipY = ay + ny * IND_ARROW;
      const baseX = ax - nx * IND_ARROW;
      const baseY = ay - ny * IND_ARROW;
      indicatorG.fillStyle(tgt.color, 0.9);
      indicatorG.fillTriangle(
        tipX,
        tipY,
        baseX + px * IND_ARROW * 0.7,
        baseY + py * IND_ARROW * 0.7,
        baseX - px * IND_ARROW * 0.7,
        baseY - py * IND_ARROW * 0.7
      );
      indicatorG.lineStyle(2, 0, 0.6);
      indicatorG.strokeTriangle(
        tipX,
        tipY,
        baseX + px * IND_ARROW * 0.7,
        baseY + py * IND_ARROW * 0.7,
        baseX - px * IND_ARROW * 0.7,
        baseY - py * IND_ARROW * 0.7
      );
      const lblX = baseX - nx * 18;
      const lblY = baseY - ny * 18;
      txt.setText(`${tgt.label} ${worldDist}m`);
      txt.setColor(tgt.textColor);
      txt.setPosition(lblX, lblY);
      txt.setVisible(true);
    }
  }
  class TitleScene extends Phaser.Scene {
    constructor() {
      super({ key: "TitleScene" });
    }
    create() {
      const W = GAME_WIDTH, H = GAME_HEIGHT;
      const cx = W / 2;
      const g = this.add.graphics();
      const gradStops = [
        [1703936, 0, H * 0.08],
        [2949888, H * 0.08, H * 0.18],
        [3999744, H * 0.18, H * 0.3],
        [2753536, H * 0.3, H * 0.42],
        [1704448, H * 0.42, H * 0.55],
        [917760, H * 0.55, H * 0.68],
        [393216, H * 0.68, H]
      ];
      for (const [col, y0, y1] of gradStops) {
        g.fillStyle(col, 1);
        g.fillRect(0, y0, W, y1 - y0);
      }
      for (let sy = 0; sy < H; sy += 4) {
        g.fillStyle(0, 0.18);
        g.fillRect(0, sy, W, 1);
      }
      for (let i = 0; i < 18; i++) {
        const sx = i / 18 * W * 1.6 - W * 0.3;
        g.lineStyle(1, 16720384, 0.04 + i % 3 * 0.02);
        g.lineBetween(sx, 0, sx - 220, H);
      }
      const burstCY = H * 0.52;
      for (let r = 440; r > 0; r -= 14) {
        const t = r / 440;
        const col2 = t > 0.6 ? 1703936 : t > 0.35 ? 16720384 : 16742144;
        g.fillStyle(col2, (1 - t) * 0.13);
        g.fillCircle(cx, burstCY, r);
      }
      for (let r = 90; r > 0; r -= 6) {
        g.fillStyle(16750848, (1 - r / 90) * 0.22);
        g.fillCircle(cx, burstCY, r);
      }
      this.drawDebrisField(g, cx, W, H);
      this.drawTitleBear(g, cx, H);
      this.drawSmokeWisps(g, cx, H);
      this.drawDoomTitle(cx, W);
      this.drawBeeSubtitle(cx, 226);
      const dg = this.add.graphics();
      dg.lineStyle(3, 13382400, 1);
      dg.lineBetween(cx - 300, 270, cx + 300, 270);
      dg.lineStyle(1, 16737792, 0.6);
      dg.lineBetween(cx - 300, 274, cx + 300, 274);
      dg.lineStyle(3, 16729088, 0.9);
      dg.lineBetween(cx - 300, 264, cx - 300, 278);
      dg.lineBetween(cx + 300, 264, cx + 300, 278);
      const panelY = H * 0.76;
      const pg = this.add.graphics();
      pg.fillStyle(655360, 0.88);
      pg.fillRoundedRect(cx - 330, panelY, 660, 252, 10);
      pg.lineStyle(3, 13378048, 0.9);
      pg.strokeRoundedRect(cx - 330, panelY, 660, 252, 10);
      pg.lineStyle(1, 16733440, 0.4);
      pg.strokeRoundedRect(cx - 326, panelY + 4, 652, 244, 8);
      this.add.text(cx, panelY + 18, "Stop the tech billionaire pollution!", {
        fontSize: "30px",
        fontFamily: "Arial Black",
        color: "#f5c542",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5, 0);
      this.add.text(cx, panelY + 64, "Fight back with beehive guns,\nsave the critters, and end tokenmaxxing!", {
        fontSize: "26px",
        fontFamily: "Arial",
        color: "#ddccaa",
        lineSpacing: 6,
        align: "center"
      }).setOrigin(0.5, 0);
      this.add.text(cx, panelY + 138, [
        "WASD: Move          Space: Dodge",
        "Click & Draw: Deploy Bees!"
      ].join("\n"), {
        fontSize: "28px",
        fontFamily: "Arial Black",
        color: "#aaddff",
        lineSpacing: 8,
        align: "center",
        stroke: "#000000",
        strokeThickness: 2
      }).setOrigin(0.5, 0);
      const tapY = H - 75;
      this.add.text(cx + 3, tapY + 4, "TAP TO BEGIN", {
        fontSize: "38px",
        fontFamily: "Arial Black",
        color: "#000000"
      }).setOrigin(0.5);
      this.add.text(cx + 1, tapY + 2, "TAP TO BEGIN", {
        fontSize: "38px",
        fontFamily: "Arial Black",
        color: "#882200"
      }).setOrigin(0.5);
      const startT = this.add.text(cx, tapY, "TAP TO BEGIN", {
        fontSize: "38px",
        fontFamily: "Arial Black",
        color: "#ffffff",
        stroke: "#ff6600",
        strokeThickness: 2
      }).setOrigin(0.5);
      this.tweens.add({ targets: startT, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
      const startGame = () => {
        currentStage = 1;
        this.scene.start("GameScene");
      };
      this.input.once("pointerdown", startGame);
      this.input.keyboard.once("keydown", startGame);
    }
    // ─── DOOM LOGO ENGINE ───────────────────────────────────────────────────────────────────
    //
    // Each letter is defined as an array of [x,y] normalized points (0–1 range,
    // origin top-left). The engine:
    //   1. Scales the points to (w × h) world pixels.
    //   2. Applies a low-angle perspective warp: the bottom edge fans out wider
    //      than the top by a `perspFlare` factor, so the letter looks like it
    //      is tilting toward the viewer.
    //   3. Draws the deep extrusion (parallelogram side faces, extruding down
    //      and slightly to the right) in near-black / dark-brown.
    //   4. Draws the letter face in two horizontal tones: bright orange-red on
    //      top half, deep blood-red on bottom half.
    //   5. Draws a thick beveled inset border (dark outline offset inward).
    //
    // Letters are laid out with the outer-most letters (B and K) using a larger
    // height scalar so they physically bracket the inner letters.
    drawDoomTitle(cx, W) {
      const g = this.add.graphics().setDepth(2);
      const baseY = 24;
      const baseH = 118;
      const extDepth = 30;
      const extSlant = 8;
      const perspFlare = 0.12;
      const COL_EXTRUDE_DARK = 1703936;
      const COL_EXTRUDE_MID = 3998976;
      const COL_FACE_DARK = 9109504;
      const COL_FACE_BRIGHT = 16724736;
      const COL_FACE_HILIGHT = 16742178;
      const COL_BEVEL_DARK = 3342336;
      const COL_BEVEL_LIGHT = 16750933;
      const warp = (nx, ny, lw, lh, lx, ly) => {
        const yFrac = ny;
        const xOff = (nx - 0.5) * lw * (1 + perspFlare * yFrac);
        return [lx + lw / 2 + xOff, ly + ny * lh];
      };
      const poly = (pts, col, alpha = 1) => {
        if (pts.length < 3) return;
        g.fillStyle(col, alpha);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.fillPath();
      };
      const strokePoly = (pts, col, lw2, alpha = 1) => {
        if (pts.length < 2) return;
        g.lineStyle(lw2, col, alpha);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.strokePath();
      };
      const drawLetter = (lx, ly, lw, lh, shape, cutouts = []) => {
        for (const pts of shape) {
          const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          for (let i = 0; i < face.length; i++) {
            const a = face[i];
            const b = face[(i + 1) % face.length];
            const ae = [a[0] + extSlant, a[1] + extDepth];
            const be = [b[0] + extSlant, b[1] + extDepth];
            poly([a, b, be, ae], COL_EXTRUDE_MID);
          }
          const extFace = face.map(([fx, fy]) => [fx + extSlant, fy + extDepth]);
          poly(extFace, COL_EXTRUDE_DARK);
          const sortedByX = [...face].sort((a, b2) => a[0] - b2[0]);
          const leftPts = sortedByX.slice(0, Math.ceil(face.length * 0.35));
          for (const lp of leftPts) {
            const lpe = [lp[0] + extSlant, lp[1] + extDepth];
            poly([lp, lpe, [lpe[0] - 2, lpe[1]], [lp[0] - 2, lp[1]]], COL_EXTRUDE_MID, 0.6);
          }
        }
        for (const pts of shape) {
          const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          poly(face, COL_FACE_DARK);
        }
        for (const cut of cutouts) {
          const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          poly(cFace, COL_EXTRUDE_MID);
        }
        for (const pts of shape) {
          const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          const ys = face.map((p) => p[1]);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const splitY = minY + (maxY - minY) * 0.52;
          poly(face, COL_FACE_BRIGHT);
          const lowerPts = [];
          for (let i = 0; i < face.length; i++) {
            const p = face[i];
            const q = face[(i + 1) % face.length];
            if (p[1] >= splitY) lowerPts.push(p);
            if (p[1] < splitY !== q[1] < splitY) {
              const t2 = (splitY - p[1]) / (q[1] - p[1]);
              lowerPts.push([p[0] + t2 * (q[0] - p[0]), splitY]);
            }
          }
          if (lowerPts.length >= 3) poly(lowerPts, COL_FACE_DARK);
        }
        for (const cut of cutouts) {
          const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          poly(cFace, COL_EXTRUDE_MID);
        }
        for (const pts of shape) {
          const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          const ys = face.map((p) => p[1]);
          const minY = Math.min(...ys);
          const topPts = [];
          const hiY = minY + lh * 0.1;
          for (let i = 0; i < face.length; i++) {
            const p = face[i];
            const q = face[(i + 1) % face.length];
            if (p[1] <= hiY) topPts.push(p);
            if (p[1] <= hiY !== q[1] <= hiY) {
              const t2 = (hiY - p[1]) / (q[1] - p[1]);
              topPts.push([p[0] + t2 * (q[0] - p[0]), hiY]);
            }
          }
          if (topPts.length >= 2) {
            g.lineStyle(3, COL_FACE_HILIGHT, 0.85);
            g.beginPath();
            g.moveTo(topPts[0][0], topPts[0][1]);
            for (let i = 1; i < topPts.length; i++) g.lineTo(topPts[i][0], topPts[i][1]);
            g.strokePath();
          }
        }
        const bv = lw * 0.055;
        for (const pts of shape) {
          const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          strokePoly(face, COL_BEVEL_DARK, 4, 0.9);
          strokePoly(face, COL_BEVEL_LIGHT, 1.5, 0.7);
          const cx2 = face.reduce((s, p) => s + p[0], 0) / face.length;
          const cy2 = face.reduce((s, p) => s + p[1], 0) / face.length;
          const inset = face.map(([fx, fy]) => [
            fx + (cx2 - fx) * (bv / Math.max(1, Math.sqrt((fx - cx2) ** 2 + (fy - cy2) ** 2))),
            fy + (cy2 - fy) * (bv / Math.max(1, Math.sqrt((fx - cx2) ** 2 + (fy - cy2) ** 2)))
          ]);
          strokePoly(inset, COL_BEVEL_DARK, 2, 0.6);
        }
        for (const cut of cutouts) {
          const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
          strokePoly(cFace, COL_BEVEL_DARK, 2, 0.7);
          strokePoly(cFace, COL_BEVEL_LIGHT, 1, 0.5);
        }
      };
      const R = (x0, y0, x12, y1) => [[x0, y0], [x12, y0], [x12, y1], [x0, y1]];
      const FULL = R(0, 0, 1, 1);
      const B = {
        shape: [FULL],
        cuts: [
          R(0.44, 0.06, 0.9, 0.44),
          // upper bowl hole
          R(0.44, 0.56, 0.94, 0.94)
          // lower bowl hole
        ]
      };
      const E2 = {
        shape: [FULL],
        cuts: [
          R(0.4, 0.08, 1, 0.41),
          R(0.4, 0.59, 1, 0.92)
        ]
      };
      const A = {
        shape: [
          // Left diagonal leg (wide at bottom, comes to apex at top-centre)
          [[0, 1], [0.38, 1], [0.5, 0], [0.3, 0]],
          // Right diagonal leg (mirror)
          [[0.62, 1], [1, 1], [0.7, 0], [0.5, 0]],
          // Crossbar — sits at 55% height
          R(0.15, 0.52, 0.85, 0.72)
        ],
        cuts: []
      };
      const Rlet = {
        shape: [
          // Left stem (full height)
          R(0, 0, 0.4, 1),
          // Upper bowl — right half-oval approximated as a fat rectangle with rounded hint
          // Use a pentagon that bulges right
          [[0.4, 0], [0.9, 0], [1, 0.12], [1, 0.38], [0.9, 0.5], [0.4, 0.5]],
          // Lower diagonal leg — kicks right from stem base
          [[0.4, 0.5], [0.88, 0.5], [1, 0.68], [1, 1], [0.72, 1], [0.4, 0.72]]
        ],
        cuts: [
          // Hollow out the bowl interior so it reads as an open loop
          [[0.4, 0.08], [0.8, 0.08], [0.88, 0.16], [0.88, 0.34], [0.8, 0.42], [0.4, 0.42]]
        ]
      };
      const T = {
        shape: [
          R(0, 0, 1, 0.28),
          // top bar
          R(0.28, 0.28, 0.72, 1)
          // stem
        ],
        cuts: []
      };
      const C = {
        shape: [FULL],
        cuts: [R(0.38, 0.1, 1.02, 0.9)]
      };
      const K = {
        shape: [
          R(0, 0, 0.38, 1),
          // left stem
          // Upper diagonal arm
          [[0.38, 0.38], [1, 0], [1, 0.22], [0.58, 0.5]],
          // Lower diagonal arm
          [[0.38, 0.62], [0.58, 0.5], [1, 0.78], [1, 1]]
        ],
        cuts: []
      };
      const letters1 = [
        { def: B, wRel: 0.8, hScale: 1, isOuter: true },
        // B
        { def: E2, wRel: 0.64, hScale: 0.84, isOuter: false },
        // E
        { def: A, wRel: 0.72, hScale: 0.84, isOuter: false },
        // A
        { def: Rlet, wRel: 0.72, hScale: 0.84, isOuter: false },
        // R
        { def: A, wRel: 0.72, hScale: 0.84, isOuter: false },
        // A (ATTACK)
        { def: T, wRel: 0.64, hScale: 0.84, isOuter: false },
        // T
        { def: T, wRel: 0.64, hScale: 0.84, isOuter: false },
        // T
        { def: A, wRel: 0.72, hScale: 0.84, isOuter: false },
        // A
        { def: C, wRel: 0.64, hScale: 0.84, isOuter: false },
        // C
        { def: K, wRel: 0.8, hScale: 1, isOuter: true }
        // K
      ];
      const availW = W - 32;
      const spaceW = availW * 0.055;
      const gap = availW * 0.012;
      const sumWRel = letters1.reduce((s, l) => s + l.wRel, 0);
      const unitW = (availW - gap * (letters1.length - 1) - spaceW) / sumWRel;
      const totalW1 = sumWRel * unitW + gap * (letters1.length - 1) + spaceW;
      let x1 = cx - totalW1 / 2;
      for (let i = 0; i < letters1.length; i++) {
        const l = letters1[i];
        const lw = l.wRel * unitW;
        const lh = l.hScale * baseH;
        const ly = baseY + baseH - lh;
        drawLetter(x1, ly, lw, lh, l.def.shape, l.def.cuts);
        x1 += lw + gap;
        if (i === 3) x1 += spaceW;
      }
    }
    // "BEE BEE GUNS" — flat, rounded, bee-themed with alternating black/yellow letters
    drawBeeSubtitle(cx, y) {
      const fontSize = 54;
      const ff = "Arial Rounded MT Bold, Arial Black, Arial";
      const g = this.add.graphics().setDepth(2);
      const charW = fontSize * 0.6;
      const spaceW = fontSize * 0.3;
      const approxH = fontSize * 1.15;
      const chars = "BEE BEE GUNS".split("");
      let totalW = 0;
      for (const ch of chars) totalW += ch === " " ? spaceW : charW;
      let lx = cx - totalW / 2;
      this.add.text(cx + 4, y + 5, "BEE BEE GUNS", {
        fontSize: `${fontSize}px`,
        fontFamily: ff,
        color: "#000000"
      }).setOrigin(0.5).setDepth(2);
      this.add.text(cx, y, "BEE BEE GUNS", {
        fontSize: `${fontSize}px`,
        fontFamily: ff,
        color: "#1a1400",
        stroke: "#000000",
        strokeThickness: 14
      }).setOrigin(0.5).setDepth(3);
      const bx = cx - totalW / 2;
      const by = y - approxH * 0.5;
      const stripes = 5;
      const bh = approxH / stripes;
      for (let i = 0; i < stripes; i++) {
        if (i % 2 === 0) continue;
        g.fillStyle(0, 0.65);
        g.fillRect(bx, by + i * bh, totalW, bh);
      }
      let letterIdx = 0;
      let px = lx;
      for (const ch of chars) {
        if (ch === " ") {
          px += spaceW;
          continue;
        }
        const isEven = letterIdx % 2 === 0;
        const fillCol = isEven ? "#ffe033" : "#111100";
        const strokeCol = isEven ? "#000000" : "#f5c518";
        this.add.text(px + charW / 2, y, ch, {
          fontSize: `${fontSize}px`,
          fontFamily: ff,
          color: fillCol,
          stroke: strokeCol,
          strokeThickness: 5
        }).setOrigin(0.5).setDepth(6);
        px += charW;
        letterIdx++;
      }
      this.add.text(cx - totalW / 2 - 38, y, "🐝", { fontSize: "30px" }).setOrigin(0.5).setDepth(6);
      this.add.text(cx + totalW / 2 + 38, y, "🐝", { fontSize: "30px" }).setOrigin(0.5).setDepth(6);
    }
    drawDebrisField(g, cx, W, H) {
      const groundY = H * 0.67;
      g.fillStyle(657416, 1);
      g.fillRect(0, groundY, W, H - groundY);
      g.fillStyle(1576456, 1);
      g.fillRect(0, groundY, W, 8);
      const chunks = [
        [cx - 280, groundY - 28, 120, 55, 1710638],
        [cx - 180, groundY - 44, 90, 70, 1714714],
        [cx - 80, groundY - 18, 70, 36, 2759178],
        [cx + 60, groundY - 38, 110, 62, 1710638],
        [cx + 200, groundY - 22, 95, 48, 662058],
        [cx - 240, groundY - 8, 160, 30, 1710618],
        [cx + 80, groundY - 10, 140, 28, 1118488]
      ];
      for (const [bx, by, bw, bh, col] of chunks) {
        g.fillStyle(col, 1);
        g.fillRoundedRect(bx, by, bw, bh, 3);
        g.lineStyle(1, 3359829, 0.6);
        g.strokeRoundedRect(bx, by, bw, bh, 3);
        g.fillStyle(65484, 0.8);
        g.fillRect(bx + 6, by + 6, 6, 4);
        g.fillStyle(16724736, 0.8);
        g.fillRect(bx + 16, by + 6, 6, 4);
        g.fillStyle(16755200, 0.6);
        g.fillRect(bx + 26, by + 6, 6, 4);
      }
      for (const [fx, fy] of [[cx - 310, groundY - 4], [cx - 200, groundY + 2], [cx - 50, groundY - 2]]) {
        g.fillStyle(860176, 1);
        g.fillRect(fx - 20, fy, 40, 10);
        g.lineStyle(1, 2245666, 0.7);
        g.strokeRect(fx - 20, fy, 40, 10);
        g.lineStyle(1, 43588, 0.5);
        g.lineBetween(fx - 16, fy + 3, fx + 16, fy + 3);
      }
      for (const [sx, sy] of [[cx - 180, groundY - 6], [cx + 150, groundY - 8]]) {
        g.fillStyle(16737792, 0.9);
        g.fillCircle(sx, sy, 3);
      }
    }
    drawTitleBear(g, cx, H) {
      const bx = cx;
      const by = H * 0.52;
      const C = COLORS.bear;
      const S = 3.1;
      g.fillStyle(0, 0.5);
      g.fillEllipse(bx, by + 115 * S * 0.55, 170 * S * 0.8, 22 * S * 0.5);
      g.fillStyle(C.body, 1);
      g.fillRoundedRect(bx - 38 * S * 0.55, by + 46 * S * 0.55, 32 * S * 0.55, 52 * S * 0.55, 8);
      g.fillRoundedRect(bx + 6 * S * 0.55, by + 46 * S * 0.55, 32 * S * 0.55, 52 * S * 0.55, 8);
      g.fillStyle(C.dark, 1);
      g.fillRoundedRect(bx - 44 * S * 0.55, by + 88 * S * 0.55, 42 * S * 0.55, 18 * S * 0.55, 6);
      g.fillRoundedRect(bx + 2 * S * 0.55, by + 88 * S * 0.55, 42 * S * 0.55, 18 * S * 0.55, 6);
      g.fillStyle(C.body, 1);
      g.fillEllipse(bx, by + 18 * S * 0.55, 120 * S * 0.55, 100 * S * 0.55);
      const shoulderLx = bx - 52 * S * 0.55, shoulderLy = by - 2 * S * 0.55;
      const elbowLx = bx - 82 * S * 0.55, elbowLy = by - 28 * S * 0.55;
      const wristLx = bx - 102 * S * 0.55, wristLy = by - 66 * S * 0.55;
      const armW = 28 * S * 0.55;
      for (let t = 0; t <= 1; t += 0.1) {
        const ax = shoulderLx + (elbowLx - shoulderLx) * t;
        const ay = shoulderLy + (elbowLy - shoulderLy) * t;
        g.fillStyle(C.body, 1);
        g.fillCircle(ax, ay, armW / 2);
      }
      for (let t = 0; t <= 1; t += 0.1) {
        const ax = elbowLx + (wristLx - elbowLx) * t;
        const ay = elbowLy + (wristLy - elbowLy) * t;
        g.fillStyle(C.body, 1);
        g.fillCircle(ax, ay, armW / 2 * 0.9);
      }
      const shoulderRx = bx + 52 * S * 0.55, shoulderRy = by - 2 * S * 0.55;
      const elbowRx = bx + 82 * S * 0.55, elbowRy = by - 28 * S * 0.55;
      const wristRx = bx + 102 * S * 0.55, wristRy = by - 66 * S * 0.55;
      for (let t = 0; t <= 1; t += 0.1) {
        const ax = shoulderRx + (elbowRx - shoulderRx) * t;
        const ay = shoulderRy + (elbowRy - shoulderRy) * t;
        g.fillStyle(C.body, 1);
        g.fillCircle(ax, ay, armW / 2);
      }
      for (let t = 0; t <= 1; t += 0.1) {
        const ax = elbowRx + (wristRx - elbowRx) * t;
        const ay = elbowRy + (wristRy - elbowRy) * t;
        g.fillStyle(C.body, 1);
        g.fillCircle(ax, ay, armW / 2 * 0.9);
      }
      this.drawTitleHive(g, wristLx, wristLy);
      this.drawTitleHive(g, wristRx, wristRy);
      const headR = 58 * S * 0.55;
      const headX = bx, headY = by - 64 * S * 0.55;
      g.fillStyle(C.body, 1);
      g.fillCircle(headX, headY, headR);
      g.fillStyle(C.dark, 1);
      g.fillCircle(headX - 40 * S * 0.55, headY - 46 * S * 0.55, 20 * S * 0.55);
      g.fillCircle(headX + 40 * S * 0.55, headY - 46 * S * 0.55, 20 * S * 0.55);
      g.fillStyle(C.body, 1);
      g.fillCircle(headX - 40 * S * 0.55, headY - 46 * S * 0.55, 13 * S * 0.55);
      g.fillCircle(headX + 40 * S * 0.55, headY - 46 * S * 0.55, 13 * S * 0.55);
      g.fillStyle(C.snout, 1);
      g.fillEllipse(headX, headY + 10 * S * 0.55, 42 * S * 0.55, 28 * S * 0.55);
      g.fillStyle(1706496, 1);
      g.fillEllipse(headX, headY - 2 * S * 0.55, 16 * S * 0.55, 10 * S * 0.55);
      g.fillStyle(1706496, 1);
      g.fillTriangle(
        headX - 30 * S * 0.55,
        headY - 24 * S * 0.55,
        headX - 8 * S * 0.55,
        headY - 18 * S * 0.55,
        headX - 8 * S * 0.55,
        headY - 14 * S * 0.55
      );
      g.fillTriangle(
        headX - 30 * S * 0.55,
        headY - 24 * S * 0.55,
        headX - 30 * S * 0.55,
        headY - 18 * S * 0.55,
        headX - 8 * S * 0.55,
        headY - 14 * S * 0.55
      );
      g.fillTriangle(
        headX + 30 * S * 0.55,
        headY - 24 * S * 0.55,
        headX + 8 * S * 0.55,
        headY - 18 * S * 0.55,
        headX + 8 * S * 0.55,
        headY - 14 * S * 0.55
      );
      g.fillTriangle(
        headX + 30 * S * 0.55,
        headY - 24 * S * 0.55,
        headX + 30 * S * 0.55,
        headY - 18 * S * 0.55,
        headX + 8 * S * 0.55,
        headY - 14 * S * 0.55
      );
      g.fillStyle(16777215, 1);
      g.fillEllipse(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 20 * S * 0.55, 10 * S * 0.55);
      g.fillEllipse(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 20 * S * 0.55, 10 * S * 0.55);
      g.fillStyle(16746496, 1);
      g.fillCircle(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 6 * S * 0.55);
      g.fillCircle(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 6 * S * 0.55);
      g.fillStyle(0, 1);
      g.fillCircle(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 3 * S * 0.55);
      g.fillCircle(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 3 * S * 0.55);
      g.lineStyle(4, 1706496, 1);
      g.lineBetween(headX - 28 * S * 0.55, headY - 10 * S * 0.55, headX - 8 * S * 0.55, headY - 10 * S * 0.55);
      g.lineBetween(headX + 8 * S * 0.55, headY - 10 * S * 0.55, headX + 28 * S * 0.55, headY - 10 * S * 0.55);
      g.fillStyle(1703936, 1);
      g.fillRoundedRect(headX - 20 * S * 0.55, headY + 16 * S * 0.55, 40 * S * 0.55, 18 * S * 0.55, 4);
      g.fillStyle(16777215, 1);
      const teethCount = 5;
      const teethW = 38 * S * 0.55 / teethCount;
      for (let t2 = 0; t2 < teethCount; t2++) {
        const tx2 = headX - 19 * S * 0.55 + t2 * teethW;
        g.fillRect(tx2, headY + 17 * S * 0.55, teethW - 2, 10 * S * 0.55);
      }
      g.lineStyle(3, 5908992, 0.6);
      g.lineBetween(headX - 38 * S * 0.55, headY + 8 * S * 0.55, headX - 22 * S * 0.55, headY + 14 * S * 0.55);
      g.lineBetween(headX + 22 * S * 0.55, headY + 14 * S * 0.55, headX + 38 * S * 0.55, headY + 8 * S * 0.55);
      g.fillStyle(11154176, 0.75);
      g.fillRect(headX - 34 * S * 0.55, headY - 16 * S * 0.55, 68 * S * 0.55, 7 * S * 0.55);
    }
    drawTitleHive(g, hx, hy) {
      const hs = 1.5;
      g.fillStyle(COLORS.hive.body, 1);
      g.fillEllipse(hx, hy, 44 * hs, 54 * hs);
      g.fillStyle(COLORS.hive.dark, 1);
      g.fillRect(hx - 20 * hs, hy - 10 * hs, 40 * hs, 7 * hs);
      g.fillRect(hx - 20 * hs, hy - 1 * hs, 40 * hs, 7 * hs);
      g.fillRect(hx - 20 * hs, hy + 8 * hs, 40 * hs, 7 * hs);
      g.fillStyle(1706496, 1);
      g.fillEllipse(hx, hy + 20 * hs, 16 * hs, 10 * hs);
      g.fillStyle(16768324, 0.3);
      g.fillEllipse(hx, hy + 20 * hs, 22 * hs, 14 * hs);
      const orbits = [
        { r: 34 * hs, count: 4, offset: 0.2 },
        { r: 50 * hs, count: 3, offset: 1.1 },
        { r: 62 * hs, count: 2, offset: 0.7 }
      ];
      for (const orb of orbits) {
        for (let b = 0; b < orb.count; b++) {
          const angle = orb.offset + b / orb.count * Math.PI * 2;
          const beeX = hx + Math.cos(angle) * orb.r;
          const beeY = hy + Math.sin(angle) * orb.r * 0.6;
          g.fillStyle(14544639, 0.75);
          g.fillEllipse(beeX - 5, beeY - 3, 10, 6);
          g.fillEllipse(beeX + 3, beeY - 3, 10, 6);
          g.fillStyle(COLORS.bee.body, 1);
          g.fillEllipse(beeX, beeY, 11, 8);
          g.fillStyle(1710592, 0.9);
          g.fillRect(beeX - 3, beeY - 1, 6, 2);
          g.fillStyle(8939008, 1);
          g.fillTriangle(beeX - 6, beeY, beeX - 9, beeY + 1, beeX - 6, beeY + 2);
        }
      }
    }
    drawSmokeWisps(g, cx, H) {
      const baseY = H * 0.67;
      for (const [sx, spread] of [[cx - 200, 18], [cx + 180, 14], [cx - 60, 10]]) {
        for (let s = 0; s < 5; s++) {
          g.fillStyle(3359829, 0.12 - s * 0.02);
          g.fillEllipse(sx + (s % 2 === 0 ? 4 : -4), baseY - s * 38, spread + s * 6, spread + s * 4);
        }
      }
    }
  }
  const config = createGameConfig();
  config.scene = [TitleScene, { key: "GameScene", create, update }];
  new Phaser.Game(config);
})();
//# sourceMappingURL=game.js.map
