(function() {
  "use strict";
  const GAME_WIDTH = 786;
  const GAME_HEIGHT = 1704;
  const CELL = 72;
  const GRID_COLS = 9;
  const GRID_ROWS = 12;
  const GRID_PIXEL_W = GRID_COLS * CELL;
  const GRID_PIXEL_H = GRID_ROWS * CELL;
  const GRID_EXPAND_THRESHOLD = 0.4;
  const COLORS = {
    bg: { primary: 658970, secondary: 989475, panel: 1384238 },
    grid: { line: 1978448, fill: 857638 },
    block: {
      default: 2776234,
      placed: 1982592,
      border: 4885722,
      ghostAlpha: 0.35
    },
    weapon: {
      gun: 16770669,
      // yellow — bullet
      laser: 16739179,
      // red — aimed bolt
      beam: 65535,
      // cyan — column cannon
      mine: 16737792,
      // orange — spiky drift
      missile: 16750848,
      // amber — accelerating rocket
      funnel: 11158783,
      // purple — autonomous unit
      rock: 8939076,
      // brown — heavy shot
      homing: 16729224
      // pink — tracking missile
    },
    accent: { primary: 5164484, secondary: 16739179 },
    text: { primary: "#ffffff" },
    ui: { border: 2767434, danger: 16729156 },
    hp: { full: 4513160, low: 16737860 }
  };
  const TEXT_STYLES = {
    heading: { fontSize: "36px", fontFamily: "Arial", color: COLORS.text.primary, fontStyle: "bold" },
    button: { fontSize: "32px", fontFamily: "Arial", color: "#ffffff", fontStyle: "bold" },
    hud: { fontSize: "26px", fontFamily: "Arial", color: COLORS.text.primary, fontStyle: "bold" }
  };
  const PIECE_SHAPES = [
    // 1-block
    [{ col: 0, row: 0 }],
    // 2-block
    [{ col: 0, row: 0 }, { col: 1, row: 0 }],
    [{ col: 0, row: 0 }, { col: 0, row: 1 }],
    // 3-block line
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }],
    // 3-block L
    [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
    // 3-block T
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }],
    // Tetrominoes (standard shapes)
    // I
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
    // O
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
    // T
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }],
    // L
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }],
    // J
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }],
    // S
    [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
    // Z
    [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }]
  ];
  const CORE_COL = Math.floor(9 / 2);
  const CORE_ROW = Math.floor(12 / 2);
  const BONUS_TILE_COUNT = 3;
  const BONUS_TILE_MAX_DIST = 3;
  const INITIAL_PIECE_COUNT = 4;
  const SUBSEQUENT_PIECE_COUNT = 4;
  const INITIAL_ENEMY_PIECES = 3;
  const ENEMY_PIECE_GROWTH = 8;
  const PLAYER_MAX_HP = 20;
  const PLAYER_LIVES = 3;
  const BLOCK_HP = 5;
  const GUN_DAMAGE = 2;
  const LASER_DAMAGE = 3;
  const BULLET_SPEED = 600;
  const LASER_SPEED = 800;
  const BEAM_DAMAGE = 8;
  const BEAM_CHARGE_TIME = 1.2;
  const BEAM_COOLDOWN = 3.5;
  const BEAM_WIDTH = 18;
  const MINE_DAMAGE = 6;
  const MINE_SPEED_MIN = 28;
  const MINE_SPEED_MAX = 90;
  const MINE_RADIUS = 14;
  const MINE_HP = 3;
  const MISSILE_DAMAGE = 5;
  const MISSILE_SPEED_MIN = 80;
  const MISSILE_ACCEL = 320;
  const MISSILE_RADIUS = 14;
  const FUNNEL_SPEED = 300;
  const FUNNEL_LASER_DMG = 2;
  const FUNNEL_FIRE_RATE = 1.8;
  const FUNNEL_RELEASE_RATE = 4;
  const ROCK_HP = 4;
  const ROCK_RADIUS = 22;
  const ROCK_SPEED = 180;
  const ROCK_DAMAGE = 4;
  const HOMING_DAMAGE = 5;
  const HOMING_SPEED_MIN = 80;
  const HOMING_ACCEL = 260;
  const HOMING_TURN_SPEED = 3.2;
  const HOMING_LOCK_DIST = 120;
  const PLAYER_SPEED = 320;
  const PLAYER_BOUNDS_PAD = 60;
  const ASTEROID_BAND_Y = GAME_HEIGHT * 0.48;
  const ASTEROID_BAND_H = 180;
  const ASTEROID_SPEED_MIN = 80;
  const ASTEROID_SPEED_MAX = 200;
  const ASTEROID_HP = 4;
  const ASTEROID_RADIUS_MIN = 18;
  const ASTEROID_RADIUS_MAX = 40;
  const ASTEROID_COUNT = 6;
  const ENEMY_SPEED = 160;
  const ENEMY_BOUNDS_PAD = 60;
  const BOOST_COST = 0.4;
  const BOOST_REGEN = 0.18;
  const BOOST_DISTANCE = 130;
  const BOOST_DURATION = 0.22;
  const UNDERDOG_SPEED_MAX = 2;
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
  class SoundManager {
    constructor() {
      this.ctx = null;
      this._played = /* @__PURE__ */ new Set();
    }
    // dedup within one frame
    getCtx() {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    /** Call once per frame (top of update) to reset dedup. */
    clearFrame() {
      this._played.clear();
    }
    /** Play a named sound, deduped per frame. */
    play(key) {
      if (this._played.has(key)) return;
      this._played.add(key);
      try {
        const c = this.getCtx();
        switch (key) {
          // ── Build scene ─────────────────────────────────────────────────
          case "piece_pickup":
            this._toneBlip(c, 520, 0.06, 0.09, "sine");
            break;
          case "piece_rotate":
            this._toneBlip(c, 880, 0.05, 0.07, "square");
            break;
          case "piece_place":
            this._tonePlunk(c, 300, 0.12, 0.18);
            break;
          case "bonus_pickup":
            this._chime(c, [880, 1100, 1320], 0.1);
            break;
          // ── Weapon fire ────────────────────────────────────────────────
          case "fire_gun":
            this._gunShot(c);
            break;
          case "fire_laser":
            this._laserShot(c);
            break;
          case "fire_beam":
            this._beamCharge(c);
            break;
          case "fire_mine":
            this._mineDeploy(c);
            break;
          case "fire_missile":
            this._missileShot(c);
            break;
          case "fire_funnel":
            this._funnelDeploy(c);
            break;
          case "fire_rock":
            this._rockThrow(c);
            break;
          case "fire_homing":
            this._homingShot(c);
            break;
          // ── Movement ─────────────────────────────────────────────────────────────
          case "boost":
            this._boostWhoosh(c);
            break;
          // ── Weapon hit (projectile impacts ship) ───────────────────────────
          case "hit_gun":
            this._impactTick(c, 200, 0.1);
            break;
          case "hit_laser":
            this._impactTick(c, 320, 0.08);
            break;
          case "hit_beam":
            this._impactBoom(c, 80, 0.2, 0.3);
            break;
          case "hit_mine":
            this._impactBoom(c, 60, 0.22, 0.35);
            break;
          case "hit_missile":
            this._impactBoom(c, 70, 0.18, 0.28);
            break;
          case "hit_funnel":
            this._impactTick(c, 280, 0.08);
            break;
          case "hit_rock":
            this._impactBoom(c, 90, 0.16, 0.25);
            break;
          case "hit_homing":
            this._impactBoom(c, 75, 0.19, 0.3);
            break;
          // ── Environment / events ─────────────────────────────────────────────
          case "hit_asteroid":
            this._impactBoom(c, 120, 0.14, 0.22);
            break;
          case "explosion":
            this._explosion(c);
            break;
          case "victory":
            this._mechaVictory(c);
            break;
          case "defeat":
            this._mechaDefeat(c);
            break;
        }
      } catch (_) {
      }
    }
    // ──────────── Low-level synth helpers ───────────────────────────────────────
    _toneBlip(c, freq, vol, dur, type) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    }
    _tonePlunk(c, freq, vol, dur) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq * 1.5, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq, c.currentTime + 0.04);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    }
    _chime(c, freqs, vol) {
      freqs.forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = f;
        const t0 = c.currentTime + i * 0.07;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.35);
        o.connect(g);
        g.connect(c.destination);
        o.start(t0);
        o.stop(t0 + 0.4);
      });
    }
    _noise(c, dur, vol, filterFreq) {
      const bufSize = Math.ceil(c.sampleRate * dur);
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filt = c.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = filterFreq;
      filt.Q.value = 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(c.destination);
      src.start();
      src.stop(c.currentTime + dur);
    }
    // ──────────── Weapon fire sounds ─────────────────────────────────────────────
    _gunShot(c) {
      this._noise(c, 0.06, 0.18, 1200);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(280, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.07);
      g.gain.setValueAtTime(0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.07);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.07);
    }
    _laserShot(c) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(600, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.12);
      g.gain.setValueAtTime(0.1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.12);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.14);
    }
    _beamCharge(c) {
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      const g = c.createGain();
      o1.type = "sawtooth";
      o1.frequency.setValueAtTime(60, c.currentTime);
      o1.frequency.linearRampToValueAtTime(220, c.currentTime + 1);
      o2.type = "sine";
      o2.frequency.setValueAtTime(120, c.currentTime);
      o2.frequency.linearRampToValueAtTime(440, c.currentTime + 1);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.14, c.currentTime + 0.3);
      g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.9);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 1.2);
      o1.connect(g);
      o2.connect(g);
      g.connect(c.destination);
      o1.start();
      o1.stop(c.currentTime + 1.25);
      o2.start();
      o2.stop(c.currentTime + 1.25);
    }
    _mineDeploy(c) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(180, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.15);
      g.gain.setValueAtTime(0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.18);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.2);
      this._noise(c, 0.04, 0.12, 3e3);
    }
    _missileShot(c) {
      this._noise(c, 0.18, 0.16, 600);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(100, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(340, c.currentTime + 0.15);
      g.gain.setValueAtTime(0.1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.2);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.22);
    }
    _funnelDeploy(c) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1400, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.14);
      g.gain.setValueAtTime(0.08, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.16);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.18);
    }
    _rockThrow(c) {
      this._noise(c, 0.12, 0.2, 250);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(90, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.14);
      g.gain.setValueAtTime(0.18, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.18);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.2);
    }
    _boostWhoosh(c) {
      const bufSize = Math.ceil(c.sampleRate * 0.1);
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900;
      hp.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.1);
      src.connect(hp);
      hp.connect(g);
      g.connect(c.destination);
      src.start();
      src.stop(c.currentTime + 0.11);
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(200, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.08);
      og.gain.setValueAtTime(0.06, c.currentTime);
      og.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.09);
      o.connect(og);
      og.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.1);
    }
    _homingShot(c) {
      this._toneBlip(c, 1100, 0.09, 0.08, "square");
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(400, c.currentTime + 0.06);
      o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.22);
      g.gain.setValueAtTime(0.08, c.currentTime + 0.06);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.24);
      o.connect(g);
      g.connect(c.destination);
      o.start(c.currentTime + 0.06);
      o.stop(c.currentTime + 0.26);
    }
    // ──────────── Impact / explosion sounds ────────────────────────────────────
    _impactTick(c, freq, vol) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + 0.05);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.08);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.1);
      this._noise(c, 0.04, vol * 0.5, 1500);
    }
    _impactBoom(c, freq, vol, dur) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * 2.5, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq, c.currentTime + dur * 0.4);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
      this._noise(c, dur * 0.6, vol * 0.7, freq * 3);
    }
    _explosion(c) {
      this._noise(c, 0.5, 0.28, 400);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(120, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(25, c.currentTime + 0.4);
      g.gain.setValueAtTime(0.22, c.currentTime);
      g.gain.exponentialRampToValueAtTime(1e-4, c.currentTime + 0.5);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.55);
    }
    _mechaVictory(c) {
      const t = c.currentTime;
      const sub = c.createOscillator();
      const subG = c.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(80, t);
      sub.frequency.exponentialRampToValueAtTime(35, t + 0.25);
      subG.gain.setValueAtTime(0.28, t);
      subG.gain.exponentialRampToValueAtTime(1e-4, t + 0.3);
      sub.connect(subG);
      subG.connect(c.destination);
      sub.start(t);
      sub.stop(t + 0.32);
      const brassFreqs = [147, 220, 294];
      brassFreqs.forEach((freq, i) => {
        const o = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = "sawtooth";
        o.frequency.value = freq * (1 + (i - 1) * 4e-3);
        f.type = "lowpass";
        f.frequency.value = 2200;
        f.Q.value = 0.8;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.02);
        g.gain.setValueAtTime(0.18, t + 0.08);
        g.gain.exponentialRampToValueAtTime(1e-4, t + 0.55);
        o.connect(f);
        f.connect(g);
        g.connect(c.destination);
        o.start(t);
        o.stop(t + 0.6);
      });
      const swellFreqs = [294, 440, 587];
      swellFreqs.forEach((freq, i) => {
        const o = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = "sawtooth";
        o.frequency.value = freq * (1 + (i - 1) * 6e-3);
        f.type = "lowpass";
        f.frequency.value = 3500;
        const t1 = t + 0.12;
        g.gain.setValueAtTime(0, t1);
        g.gain.linearRampToValueAtTime(0.13, t1 + 0.15);
        g.gain.setValueAtTime(0.13, t1 + 0.55);
        g.gain.exponentialRampToValueAtTime(1e-4, t1 + 1.3);
        o.connect(f);
        f.connect(g);
        g.connect(c.destination);
        o.start(t1);
        o.stop(t1 + 1.4);
      });
      const shimmer = c.createOscillator();
      const shimG = c.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(880, t + 0.1);
      shimmer.frequency.exponentialRampToValueAtTime(2640, t + 0.9);
      shimG.gain.setValueAtTime(0, t + 0.1);
      shimG.gain.linearRampToValueAtTime(0.09, t + 0.25);
      shimG.gain.exponentialRampToValueAtTime(1e-4, t + 1);
      shimmer.connect(shimG);
      shimG.connect(c.destination);
      shimmer.start(t + 0.1);
      shimmer.stop(t + 1.05);
      this._noise(c, 0.08, 0.16, 900);
    }
    _mechaDefeat(c) {
      const t = c.currentTime;
      this._noise(c, 0.12, 0.22, 500);
      const sub = c.createOscillator();
      const subG = c.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(90, t);
      sub.frequency.exponentialRampToValueAtTime(28, t + 0.18);
      subG.gain.setValueAtTime(0.3, t);
      subG.gain.exponentialRampToValueAtTime(1e-4, t + 0.22);
      sub.connect(subG);
      subG.connect(c.destination);
      sub.start(t);
      sub.stop(t + 0.25);
      [165, 247, 330].forEach((freq, i) => {
        const o = c.createOscillator();
        const f = c.createBiquadFilter();
        const g = c.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq * (1 + (i - 1) * 7e-3), t + 0.05);
        o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 2.2);
        f.type = "lowpass";
        f.frequency.value = 1800;
        f.Q.value = 1.2;
        g.gain.setValueAtTime(0, t + 0.05);
        g.gain.linearRampToValueAtTime(0.14, t + 0.2);
        g.gain.setValueAtTime(0.14, t + 0.5);
        g.gain.exponentialRampToValueAtTime(1e-4, t + 2.4);
        o.connect(f);
        f.connect(g);
        g.connect(c.destination);
        o.start(t + 0.05);
        o.stop(t + 2.5);
      });
      const groan = c.createOscillator();
      const groanF = c.createBiquadFilter();
      const groanG = c.createGain();
      groan.type = "sawtooth";
      groan.frequency.setValueAtTime(104, t + 0.08);
      groan.frequency.setValueAtTime(112, t + 0.4);
      groan.frequency.setValueAtTime(98, t + 0.7);
      groan.frequency.linearRampToValueAtTime(60, t + 1.3);
      groanF.type = "bandpass";
      groanF.frequency.value = 320;
      groanF.Q.value = 3;
      groanG.gain.setValueAtTime(0, t + 0.08);
      groanG.gain.linearRampToValueAtTime(0.18, t + 0.2);
      groanG.gain.setValueAtTime(0.18, t + 0.8);
      groanG.gain.exponentialRampToValueAtTime(1e-4, t + 1.4);
      groan.connect(groanF);
      groanF.connect(groanG);
      groanG.connect(c.destination);
      groan.start(t + 0.08);
      groan.stop(t + 1.5);
      const rumble = c.createOscillator();
      const rumbleG = c.createGain();
      rumble.type = "sine";
      rumble.frequency.setValueAtTime(52, t + 0.1);
      rumble.frequency.linearRampToValueAtTime(28, t + 2.5);
      rumbleG.gain.setValueAtTime(0, t + 0.1);
      rumbleG.gain.linearRampToValueAtTime(0.2, t + 0.35);
      rumbleG.gain.exponentialRampToValueAtTime(1e-4, t + 2.6);
      rumble.connect(rumbleG);
      rumbleG.connect(c.destination);
      rumble.start(t + 0.1);
      rumble.stop(t + 2.7);
      const tail = c.createOscillator();
      const tailG = c.createGain();
      tail.type = "sine";
      tail.frequency.setValueAtTime(698, t + 0.3);
      tail.frequency.linearRampToValueAtTime(660, t + 2.5);
      tailG.gain.setValueAtTime(0, t + 0.3);
      tailG.gain.linearRampToValueAtTime(0.07, t + 0.55);
      tailG.gain.exponentialRampToValueAtTime(1e-4, t + 2.6);
      tail.connect(tailG);
      tailG.connect(c.destination);
      tail.start(t + 0.3);
      tail.stop(t + 2.7);
    }
    _defeatStab(c) {
    }
  }
  const SFX = new SoundManager();
  class MusicManager {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this._current = null;
      this._stopFlag = false;
      this._scheduleHandle = 0;
      this._trackGain = null;
    }
    getCtx() {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.28;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    stop() {
      this._stopFlag = true;
      clearTimeout(this._scheduleHandle);
      this._current = null;
      if (this._trackGain && this.ctx) {
        const tg = this._trackGain;
        tg.gain.cancelScheduledValues(this.ctx.currentTime);
        tg.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      this._trackGain = null;
    }
    playBuild() {
      if (this._current === "build") return;
      this.stop();
      this._stopFlag = false;
      this._current = "build";
      try {
        const c = this.getCtx();
        const mg = this.masterGain;
        const tg = c.createGain();
        tg.gain.setValueAtTime(0, c.currentTime);
        tg.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
        tg.connect(mg);
        this._trackGain = tg;
        const t0 = c.currentTime + 0.05;
        this._scheduleBuild(c, tg, t0, 0);
      } catch (_) {
      }
    }
    playBattle() {
      if (this._current === "battle") return;
      this.stop();
      this._stopFlag = false;
      this._current = "battle";
      try {
        const c = this.getCtx();
        const mg = this.masterGain;
        const tg = c.createGain();
        tg.gain.setValueAtTime(0, c.currentTime);
        tg.gain.linearRampToValueAtTime(1, c.currentTime + 0.3);
        tg.connect(mg);
        this._trackGain = tg;
        const t0 = c.currentTime + 0.05;
        this._scheduleBattle(c, tg, t0, 0);
      } catch (_) {
      }
    }
    // ─── BUILD BGM ─────────────────────────────────────────────────────────────
    // D minor, 72 BPM, 8-bar loop.
    // Channels: string pad, sparse piano, walking bass, light percussion.
    _scheduleBuild(c, mg, t, beat) {
      if (this._stopFlag || this._current !== "build") return;
      const BPM = 72;
      const BEAT = 60 / BPM;
      const BAR = BEAT * 4;
      const LOOP = BAR * 8;
      const BEATS = 32;
      const D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196;
      const A3 = 220, Bb3 = 233.08, C4 = 261.63, D4 = 293.66;
      const A4 = 440;
      const D2 = 73.42, A2 = 110, C3 = 130.81, Bb2 = 116.54, G2 = 98;
      const osc = (freq, type, tStart, dur, vol, attack = 0.015, release = 0.08) => {
        const o = c.createOscillator();
        const g = c.createGain();
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1800;
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, tStart);
        g.gain.linearRampToValueAtTime(vol, tStart + attack);
        g.gain.setValueAtTime(vol, tStart + dur - release);
        g.gain.linearRampToValueAtTime(0, tStart + dur);
        o.connect(lp);
        lp.connect(g);
        g.connect(mg);
        o.start(tStart);
        o.stop(tStart + dur + 0.01);
      };
      const noise = (tStart, dur, vol, filterF) => {
        const bufSize = Math.ceil(c.sampleRate * dur);
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = filterF;
        f.Q.value = 2;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, tStart);
        g.gain.exponentialRampToValueAtTime(1e-4, tStart + dur);
        src.connect(f);
        f.connect(g);
        g.connect(mg);
        src.start(tStart);
        src.stop(tStart + dur + 0.01);
      };
      const padChords = [
        [D3, F3, A3],
        // Dm
        [Bb2 * 2, D3, F3],
        // Bb — reuse Bb3 octave down trick
        [F3 * 0.5 * 2, A3 * 0.5 * 2, C4],
        // F  (F3,A3,C4)
        [C3, E3, G3]
        // C
      ];
      for (let ci = 0; ci < 4; ci++) {
        const tChord = t + ci * BAR * 2;
        for (const freq of padChords[ci]) {
          osc(freq, "sawtooth", tChord, BAR * 2 - 0.1, 0.045, 0.25, 0.5);
        }
      }
      const melody = [
        // [beat offset, freq]
        [0, A3],
        [1, G3],
        [2, F3],
        [3.5, D3],
        [4, A3],
        [5, C4],
        [6, D4],
        [7.5, A3],
        [8, G3],
        [9, F3],
        [10, E3],
        [11.5, D3],
        [12, F3],
        [13, A3],
        [14, G3],
        [15.5, E3],
        [16, D3],
        [17, F3],
        [18, A3],
        [19.5, C4],
        [20, Bb3],
        [21, A3],
        [22, G3],
        [23.5, F3],
        [24, A4 * 0.5 * 2 * 0.5],
        // A3 reuse
        [24, D4],
        [25, C4],
        [26, Bb3],
        [27.5, A3],
        [28, G3],
        [29, F3],
        [30, E3],
        [31.5, D3]
      ];
      for (const [bOff, freq] of melody) {
        osc(freq, "triangle", t + bOff * BEAT, BEAT * 0.55, 0.055, 0.01, 0.15);
      }
      const bassLine = [
        D2,
        D2,
        A2,
        C3,
        // bar1
        Bb2,
        Bb2,
        F3 * 0.5,
        A2,
        // bar2 (Bb2,Bb2,F2,A2)
        F3 * 0.5,
        F3 * 0.5,
        C3,
        E3 * 0.5,
        // bar3 (F2,F2,C3,E2)
        C3,
        C3,
        G2,
        Bb2,
        // bar4
        D2,
        D2,
        A2,
        C3,
        // bar5
        Bb2,
        Bb2,
        F3 * 0.5,
        G2,
        // bar6
        A2,
        A2,
        E3 * 0.5,
        G2,
        // bar7
        D2,
        D2,
        A2,
        D2
        // bar8
      ];
      for (let i = 0; i < BEATS; i++) {
        osc(bassLine[i] ?? D2, "sine", t + i * BEAT, BEAT * 0.7, 0.1, 0.01, 0.08);
      }
      for (let bar = 0; bar < 8; bar++) {
        const tBar = t + bar * BAR;
        noise(tBar, 0.18, 0.18, 80);
        noise(tBar + BEAT * 2, 0.18, 0.18, 80);
        for (let e = 0; e < 8; e++) {
          noise(tBar + e * BEAT * 0.5, 0.06, 0.045, 8e3);
        }
        if (bar % 2 === 1) {
          noise(tBar + BEAT * 2, 0.12, 0.1, 2e3);
        }
      }
      const msUntilLoop = (LOOP - 0.1) * 1e3;
      this._scheduleHandle = window.setTimeout(() => {
        this._scheduleBuild(c, mg, t + LOOP, 0);
      }, msUntilLoop);
    }
    // ─── BATTLE BGM ────────────────────────────────────────────────────────────
    // GameBoy Volley Fire-inspired shonen heroic track.
    // E minor, 170 BPM, 8-bar loop.
    // 4 channels mimicking GB hardware: square lead, square harmony, triangle bass, noise drums.
    _scheduleBattle(c, mg, t, _beat) {
      if (this._stopFlag || this._current !== "battle") return;
      const BPM = 170;
      const BEAT = 60 / BPM;
      const X = BEAT * 0.25;
      const BAR = BEAT * 4;
      const LOOP = BAR * 8;
      const E2 = 82.41, Fs2 = 87.31, G2 = 98, A2 = 110, B2 = 123.47, C3 = 130.81, D3 = 146.83;
      const E3 = 164.81, Fs3 = 185, G3 = 196, A3 = 220, B3 = 246.94, C4 = 261.63, D4 = 293.66;
      const E4 = 329.63, Fs4 = 369.99, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25;
      const sq = (freq, tS, dur, vol) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "square";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, tS);
        g.gain.linearRampToValueAtTime(vol, tS + 6e-3);
        g.gain.setValueAtTime(vol, tS + dur * 0.55);
        g.gain.linearRampToValueAtTime(0, tS + dur);
        o.connect(g);
        g.connect(mg);
        o.start(tS);
        o.stop(tS + dur + 5e-3);
      };
      const tri = (freq, tS, dur, vol) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle";
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, tS);
        g.gain.setValueAtTime(vol, tS + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, tS + dur);
        o.connect(g);
        g.connect(mg);
        o.start(tS);
        o.stop(tS + dur + 5e-3);
      };
      const drum = (tS, dur, vol, filterF, q = 1.8) => {
        const bufSize = Math.ceil(c.sampleRate * Math.min(dur, 0.25));
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = filterF;
        f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, tS);
        g.gain.exponentialRampToValueAtTime(1e-4, tS + dur);
        src.connect(f);
        f.connect(g);
        g.connect(mg);
        src.start(tS);
        src.stop(tS + dur + 5e-3);
      };
      const lead = [
        // [beat-offset, freq, duration-in-beats]
        // ── Bar 1: strong upward leap, E → B → E ─────────────────────────────
        [0, E4, 0.5],
        [0.5, G4, 0.5],
        [1, B4, 0.5],
        [1.5, G4, 0.25],
        [1.75, E4, 0.25],
        [2, B4, 0.5],
        [2.5, A4, 0.25],
        [2.75, G4, 0.25],
        [3, Fs4, 0.5],
        [3.5, E4, 0.5],
        // ── Bar 2: response phrase, skipping up to D5 ─────────────────────────
        [4, E4, 0.25],
        [4.25, Fs4, 0.25],
        [4.5, G4, 0.5],
        [5, A4, 0.5],
        [5.5, B4, 0.5],
        [6, D5, 0.5],
        [6.5, B4, 0.25],
        [6.75, A4, 0.25],
        [7, G4, 0.5],
        [7.5, Fs4, 0.5],
        // ── Bar 3: riff — E pentatonic run ────────────────────────────────────
        [8, E4, 0.5],
        [8.5, G4, 0.5],
        [9, A4, 0.5],
        [9.5, B4, 0.5],
        [10, G4, 0.25],
        [10.25, E4, 0.25],
        [10.5, D4, 0.5],
        [11, E4, 0.75],
        [11.75, D4, 0.25],
        // ── Bar 4: closing phrase, fall to tonic ──────────────────────────────
        [12, B3, 0.5],
        [12.5, D4, 0.5],
        [13, E4, 0.5],
        [13.5, G4, 0.5],
        [14, Fs4, 0.5],
        [14.5, E4, 0.25],
        [14.75, D4, 0.25],
        [15, E4, 1],
        // ── Bar 5: A' — same idea, shifted an octave for climax ───────────────
        [16, E5, 0.5],
        [16.5, D5, 0.5],
        [17, B4, 0.5],
        [17.5, G4, 0.25],
        [17.75, A4, 0.25],
        [18, B4, 0.5],
        [18.5, C5, 0.25],
        [18.75, B4, 0.25],
        [19, A4, 0.5],
        [19.5, G4, 0.5],
        // ── Bar 6: high run with syncopation ──────────────────────────────────
        [20, G4, 0.25],
        [20.25, A4, 0.25],
        [20.5, B4, 0.5],
        [21, D5, 0.5],
        [21.5, E5, 0.5],
        [22, D5, 0.25],
        [22.25, C5, 0.25],
        [22.5, B4, 0.5],
        [23, A4, 0.5],
        [23.5, Fs4, 0.5],
        // ── Bar 7: building tension ────────────────────────────────────────────
        [24, G4, 0.5],
        [24.5, A4, 0.5],
        [25, B4, 0.75],
        [25.75, A4, 0.25],
        [26, G4, 0.5],
        [26.5, Fs4, 0.5],
        [27, E4, 0.75],
        [27.75, D4, 0.25],
        // ── Bar 8: final rush back to tonic ────────────────────────────────────
        [28, E4, 0.25],
        [28.25, Fs4, 0.25],
        [28.5, G4, 0.25],
        [28.75, A4, 0.25],
        [29, B4, 0.25],
        [29.25, C5, 0.25],
        [29.5, B4, 0.25],
        [29.75, A4, 0.25],
        [30, G4, 0.5],
        [30.5, Fs4, 0.5],
        [31, E4, 1]
      ];
      for (const [bOff, freq, dur] of lead) {
        sq(freq, t + bOff * BEAT, dur * BEAT * 0.88, 0.055);
      }
      const harm = [
        // Bars 1-4: parallel thirds below lead
        [0, C4, 0.5],
        [0.5, E4, 0.5],
        [1, G4, 0.5],
        [1.5, E4, 0.25],
        [1.75, C4, 0.25],
        [2, G4, 0.5],
        [2.5, Fs4, 0.25],
        [2.75, E4, 0.25],
        [3, D4, 0.5],
        [3.5, C4, 0.5],
        [4, C4, 0.25],
        [4.25, D4, 0.25],
        [4.5, E4, 0.5],
        [5, Fs4, 0.5],
        [5.5, G4, 0.5],
        [6, B4, 0.5],
        [6.5, G4, 0.25],
        [6.75, Fs4, 0.25],
        [7, E4, 0.5],
        [7.5, D4, 0.5],
        [8, C4, 0.5],
        [8.5, E4, 0.5],
        [9, Fs4, 0.5],
        [9.5, G4, 0.5],
        [10, E4, 0.25],
        [10.25, C4, 0.25],
        [10.5, B3, 0.5],
        [11, C4, 1],
        [12, G3, 0.5],
        [12.5, B3, 0.5],
        [13, C4, 0.5],
        [13.5, E4, 0.5],
        [14, D4, 0.5],
        [14.5, C4, 0.5],
        [15, B3, 1],
        // Bars 5-8: counter-melody (lower, punchy answer)
        [16, B3, 0.5],
        [16.5, A3, 0.5],
        [17, G3, 0.5],
        [17.5, Fs3, 0.5],
        [18, G3, 0.5],
        [18.5, A3, 0.5],
        [19, B3, 0.5],
        [19.5, C4, 0.5],
        [20, E3, 0.5],
        [20.5, Fs3, 0.5],
        [21, G3, 0.5],
        [21.5, A3, 0.5],
        [22, B3, 0.5],
        [22.5, G3, 0.5],
        [23, Fs3, 0.5],
        [23.5, E3, 0.5],
        [24, E3, 0.5],
        [24.5, Fs3, 0.5],
        [25, G3, 0.75],
        [25.75, Fs3, 0.25],
        [26, E3, 0.5],
        [26.5, D3, 0.5],
        [27, B2, 0.75],
        [27.75, A2, 0.25],
        [28, B2, 0.25],
        [28.25, C3, 0.25],
        [28.5, D3, 0.25],
        [28.75, E3, 0.25],
        [29, Fs3, 0.25],
        [29.25, G3, 0.25],
        [29.5, Fs3, 0.25],
        [29.75, E3, 0.25],
        [30, D3, 0.5],
        [30.5, B2, 0.5],
        [31, E3, 1]
      ];
      for (const [bOff, freq, dur] of harm) {
        sq(freq, t + bOff * BEAT, dur * BEAT * 0.8, 0.03);
      }
      const bass = [
        // Bar 1 — Em
        [0, E2, 0.9],
        [1, E2, 0.9],
        [2, B2, 0.45],
        [2.5, G2, 0.45],
        [3, E2, 0.9],
        [3.5, B2, 0.45],
        // Bar 2 — Em
        [4, E2, 0.9],
        [5, G2, 0.9],
        [6, B2, 0.9],
        [7, A2, 0.45],
        [7.5, G2, 0.45],
        // Bar 3 — C
        [8, C3, 0.9],
        [9, C3, 0.9],
        [10, G2, 0.45],
        [10.5, E2, 0.45],
        [11, C3, 0.9],
        [11.5, D3, 0.45],
        // Bar 4 — G
        [12, G2, 0.9],
        [13, G2, 0.9],
        [14, D3, 0.9],
        [15, B2, 0.45],
        [15.5, A2, 0.45],
        // Bar 5 — Em
        [16, E2, 0.9],
        [17, E2, 0.9],
        [18, B2, 0.45],
        [18.5, A2, 0.45],
        [19, G2, 0.9],
        [19.5, Fs2, 0.45],
        // Bar 6 — Am
        [20, A2, 0.9],
        [21, A2, 0.9],
        [22, E2, 0.45],
        [22.5, G2, 0.45],
        [23, A2, 0.9],
        [23.5, B2, 0.45],
        // Bar 7 — C
        [24, C3, 0.9],
        [25, C3, 0.9],
        [26, G2, 0.45],
        [26.5, E2, 0.45],
        [27, C3, 0.9],
        [27.5, D3, 0.45],
        // Bar 8 — B (dominant, tension before loop)
        [28, B2, 0.9],
        [29, B2, 0.9],
        [30, Fs3, 0.45],
        [30.5, D3, 0.45],
        [31, B2, 0.9]
      ];
      for (const [bOff, freq, dur] of bass) {
        tri(freq, t + bOff * BEAT, dur * BEAT, 0.18);
      }
      for (let bar = 0; bar < 8; bar++) {
        const tb = t + bar * BAR;
        drum(tb, 0.1, 0.35, 80, 1);
        drum(tb + BEAT * 2, 0.1, 0.35, 80, 1);
        if (bar % 2 === 1) drum(tb + BEAT * 2.5, 0.07, 0.2, 100, 1.2);
        drum(tb + BEAT, 0.09, 0.28, 2500, 2.5);
        drum(tb + BEAT * 3, 0.09, 0.28, 2500, 2.5);
        for (let s = 0; s < 16; s++) {
          drum(tb + s * X, 0.03, 0.06, 1e4, 4);
        }
        drum(tb + BEAT * 2.5, 0.07, 0.1, 7e3, 1.2);
      }
      drum(t, 0.5, 0.14, 4e3, 0.4);
      const msUntilLoop = (LOOP - 0.1) * 1e3;
      this._scheduleHandle = window.setTimeout(() => {
        this._scheduleBattle(c, mg, t + LOOP, 0);
      }, msUntilLoop);
    }
  }
  const BGM = new MusicManager();
  function rotateCW(blocks) {
    const maxRow = Math.max(...blocks.map((b) => b.row));
    return blocks.map((b) => ({ col: maxRow - b.row, row: b.col }));
  }
  function normalise(blocks) {
    const minCol = Math.min(...blocks.map((b) => b.col));
    const minRow = Math.min(...blocks.map((b) => b.row));
    return blocks.map((b) => ({ col: b.col - minCol, row: b.row - minRow }));
  }
  function randomPiece(round = 1, weaponOrder = gameState.playerWeaponOrder) {
    const shape = PIECE_SHAPES[Phaser.Math.Between(0, PIECE_SHAPES.length - 1)];
    const blocks = shape.map((b) => ({ ...b }));
    const available = unlockedWeapons(weaponOrder, round);
    const wType = available[Phaser.Math.Between(0, available.length - 1)];
    return {
      blocks,
      weapons: [{ type: wType, blockIndex: Phaser.Math.Between(0, blocks.length - 1) }],
      rotation: 0
    };
  }
  function overlaps(a, b) {
    return a.some((ba) => b.some((bb) => ba.col === bb.col && ba.row === bb.row));
  }
  function absoluteBlocks(p) {
    return p.blocks.map((b) => ({ col: p.gridCol + b.col, row: p.gridRow + b.row }));
  }
  function inBounds(blocks) {
    return blocks.every((b) => b.col >= 0 && b.col < gameState.gridCols && b.row >= 0 && b.row < gameState.gridRows);
  }
  function drawBlock(g, px, py, fillColor, borderColor, alpha, weaponType, isCore = false, cs = CELL) {
    const cx = px + cs / 2;
    const cy = py + cs / 2;
    const pad = Math.max(1, cs * 0.05);
    const r = Math.max(2, cs * 0.07);
    g.fillStyle(borderColor, alpha * 0.55);
    g.fillRoundedRect(px + pad * 0.5, py + pad * 0.5, cs - pad, cs - pad, r + 1);
    g.fillStyle(fillColor, alpha);
    g.fillRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);
    const ip = pad * 2.5;
    const innerDark = blendToward(fillColor, 0, 0.38);
    g.fillStyle(innerDark, alpha * 0.7);
    g.fillRoundedRect(px + ip, py + ip, cs - ip * 2, cs - ip * 2, Math.max(1, r * 0.6));
    const hiColor = blendToward(fillColor, 16777215, 0.5);
    g.lineStyle(Math.max(1, cs * 0.025), hiColor, alpha * 0.55);
    g.lineBetween(px + pad + r, py + pad, px + cs - pad - r, py + pad);
    g.lineBetween(px + pad, py + pad + r, px + pad, py + cs - pad - r);
    g.lineStyle(Math.max(1, cs * 0.025), 0, alpha * 0.5);
    g.lineBetween(px + pad + r, py + cs - pad, px + cs - pad - r, py + cs - pad);
    g.lineBetween(px + cs - pad, py + pad + r, px + cs - pad, py + cs - pad - r);
    g.lineStyle(
      isCore ? Math.max(2, cs * 0.045) : Math.max(1, cs * 0.03),
      isCore ? 65518 : borderColor,
      alpha
    );
    g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);
    if (!isCore && cs >= 28) {
      const ventY = py + cs - pad * 3.5;
      const ventX1 = px + ip + cs * 0.08;
      const ventX2 = px + cs - ip - cs * 0.08;
      const ventSpacing = cs * 0.045;
      g.lineStyle(Math.max(1, cs * 0.022), 0, alpha * 0.55);
      g.lineBetween(ventX1, ventY, ventX2, ventY);
      g.lineBetween(ventX1, ventY + ventSpacing, ventX2, ventY + ventSpacing);
      g.lineStyle(Math.max(1, cs * 0.015), hiColor, alpha * 0.2);
      g.lineBetween(ventX1, ventY - 1, ventX2, ventY - 1);
    }
    if (isCore) {
      g.lineStyle(
        isCore ? Math.max(2, cs * 0.045) : Math.max(1, cs * 0.03),
        65518,
        alpha
      );
      g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);
      g.fillStyle(65518, alpha * 0.12);
      g.fillCircle(cx, cy, cs * 0.42);
      g.fillStyle(52411, alpha * 0.45);
      g.fillCircle(cx, cy, cs * 0.28);
      g.fillStyle(8738, alpha * 0.9);
      g.fillCircle(cx, cy, cs * 0.18);
      g.fillStyle(4521966, alpha);
      g.fillCircle(cx, cy, cs * 0.09);
      const sr = cs * 0.38;
      g.lineStyle(Math.max(1, cs * 0.032), 65518, alpha * 0.7);
      g.lineBetween(cx, cy - cs * 0.18, cx, cy - sr);
      g.lineBetween(cx, cy + cs * 0.18, cx, cy + sr);
      g.lineBetween(cx - cs * 0.18, cy, cx - sr, cy);
      g.lineBetween(cx + cs * 0.18, cy, cx + sr, cy);
      g.lineStyle(Math.max(1, cs * 0.038), 65518, alpha * 0.9);
      g.strokeCircle(cx, cy, cs * 0.28);
      return;
    }
    if (!weaponType) return;
    const wColors = COLORS.weapon;
    const wColor = wColors[weaponType] ?? 16777215;
    switch (weaponType) {
      case "gun": {
        const tr = cs * 0.18;
        g.fillStyle(blendToward(fillColor, 1118481, 0.55), alpha);
        g.fillCircle(cx, cy, tr);
        g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
        g.strokeCircle(cx, cy, tr);
        const bw = cs * 0.09, bh = cs * 0.22;
        g.fillStyle(wColor, alpha);
        g.fillRect(cx - bw / 2, cy - tr - bh, bw, bh);
        g.fillStyle(16777215, alpha * 0.9);
        g.fillCircle(cx, cy - tr - bh, cs * 0.04);
        break;
      }
      case "laser": {
        const lensR = cs * 0.12;
        const finW = cs * 0.08, finH = cs * 0.28;
        g.fillStyle(blendToward(wColor, 0, 0.4), alpha);
        g.fillRect(cx - cs * 0.26 - finW / 2, cy - finH / 2, finW, finH);
        g.fillRect(cx + cs * 0.26 - finW / 2, cy - finH / 2, finW, finH);
        g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.9);
        g.lineBetween(
          cx - cs * 0.26 - finW / 2,
          cy - finH / 2,
          cx - cs * 0.26 + finW / 2,
          cy - finH / 2
        );
        g.lineBetween(
          cx + cs * 0.26 - finW / 2,
          cy - finH / 2,
          cx + cs * 0.26 + finW / 2,
          cy - finH / 2
        );
        g.fillStyle(wColor, alpha * 0.25);
        g.fillCircle(cx, cy, lensR);
        g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
        g.strokeCircle(cx, cy, lensR);
        g.lineStyle(Math.max(1, cs * 0.022), wColor, alpha * 0.8);
        g.lineBetween(cx - lensR * 0.6, cy, cx + lensR * 0.6, cy);
        g.lineBetween(cx, cy - lensR * 0.6, cx, cy + lensR * 0.6);
        break;
      }
      case "beam": {
        const bw = cs * 0.18, bh = cs * 0.35;
        g.fillStyle(blendToward(fillColor, 17, 0.6), alpha);
        g.fillRect(cx - bw / 2, cy - bh * 0.65, bw, bh);
        g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
        g.strokeRect(cx - bw / 2, cy - bh * 0.65, bw, bh);
        const rr1 = bw * 0.38, rr2 = bw * 0.25;
        g.fillStyle(wColor, alpha * 0.35);
        g.fillCircle(cx, cy - bh * 0.18, rr1);
        g.fillStyle(wColor, alpha * 0.7);
        g.fillCircle(cx, cy - bh * 0.18, rr2);
        g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.65);
        g.lineBetween(cx - cs * 0.3, cy + bh * 0.1, cx - bw / 2, cy + bh * 0.1);
        g.lineBetween(cx + bw / 2, cy + bh * 0.1, cx + cs * 0.3, cy + bh * 0.1);
        break;
      }
      case "mine": {
        const pr = cs * 0.14;
        g.fillStyle(blendToward(wColor, 0, 0.5), alpha);
        g.fillCircle(cx, cy, pr);
        g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
        g.strokeCircle(cx, cy, pr);
        for (let s = 0; s < 6; s++) {
          const a = s / 6 * Math.PI * 2 - Math.PI / 6;
          const innerR = pr;
          const outerR = pr + cs * 0.11;
          g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
          g.lineBetween(
            cx + Math.cos(a) * innerR,
            cy + Math.sin(a) * innerR,
            cx + Math.cos(a) * outerR,
            cy + Math.sin(a) * outerR
          );
        }
        g.fillStyle(16720384, alpha);
        g.fillCircle(cx, cy, cs * 0.055);
        break;
      }
      case "missile": {
        const pw = cs * 0.28, ph = cs * 0.32;
        g.fillStyle(blendToward(fillColor, 2228224, 0.65), alpha);
        g.fillRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
        g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
        g.strokeRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
        const tubeR = cs * 0.055;
        g.fillStyle(0, alpha);
        g.fillCircle(cx - pw * 0.28, cy - ph * 0.6, tubeR);
        g.fillCircle(cx + pw * 0.28, cy - ph * 0.6, tubeR);
        g.lineStyle(Math.max(1, cs * 0.025), wColor, alpha * 0.8);
        g.strokeCircle(cx - pw * 0.28, cy - ph * 0.6, tubeR);
        g.strokeCircle(cx + pw * 0.28, cy - ph * 0.6, tubeR);
        g.fillStyle(wColor, alpha * 0.85);
        g.fillTriangle(
          cx,
          cy - ph * 0.68,
          cx - cs * 0.065,
          cy - ph * 0.4,
          cx + cs * 0.065,
          cy - ph * 0.4
        );
        break;
      }
      case "funnel": {
        const hr = cs * 0.2;
        g.fillStyle(wColor, alpha * 0.2);
        for (let s = 0; s < 6; s++) {
          const a1 = s / 6 * Math.PI * 2 - Math.PI / 6;
          const a2 = (s + 1) / 6 * Math.PI * 2 - Math.PI / 6;
          g.fillTriangle(
            cx,
            cy,
            cx + Math.cos(a1) * hr,
            cy + Math.sin(a1) * hr,
            cx + Math.cos(a2) * hr,
            cy + Math.sin(a2) * hr
          );
        }
        g.lineStyle(Math.max(1, cs * 0.04), wColor, alpha);
        g.strokeCircle(cx, cy, hr);
        g.fillStyle(wColor, alpha);
        for (let s = 0; s < 6; s++) {
          const a = s / 6 * Math.PI * 2 - Math.PI / 6;
          g.fillCircle(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr, cs * 0.035);
        }
        g.fillStyle(16777215, alpha * 0.55);
        g.fillCircle(cx, cy, cs * 0.07);
        break;
      }
      case "rock": {
        const rr = cs * 0.17;
        g.fillStyle(blendToward(wColor, 0, 0.35), alpha);
        for (let s = 0; s < 8; s++) {
          const a1 = s / 8 * Math.PI * 2;
          const a2 = (s + 1) / 8 * Math.PI * 2;
          const j = s % 2 === 0 ? 0.82 : 1;
          g.fillTriangle(
            cx,
            cy,
            cx + Math.cos(a1) * rr * j,
            cy + Math.sin(a1) * rr * j,
            cx + Math.cos(a2) * rr * j,
            cy + Math.sin(a2) * rr * j
          );
        }
        g.lineStyle(Math.max(1, cs * 0.04), wColor, alpha * 0.9);
        g.strokeCircle(cx, cy, rr);
        g.lineStyle(Math.max(1, cs * 0.03), blendToward(wColor, 16777215, 0.5), alpha * 0.75);
        g.lineBetween(cx, cy - rr, cx, cy - rr - cs * 0.12);
        g.fillStyle(wColor, alpha);
        g.fillCircle(cx, cy, cs * 0.065);
        break;
      }
      case "homing": {
        const fh = cs * 0.24, fw = cs * 0.2;
        g.fillStyle(blendToward(wColor, 0, 0.45), alpha);
        g.fillTriangle(
          cx,
          cy - fh,
          cx - fw,
          cy + fh * 0.45,
          cx + fw,
          cy + fh * 0.45
        );
        g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
        g.lineBetween(cx, cy - fh, cx - fw, cy + fh * 0.45);
        g.lineBetween(cx, cy - fh, cx + fw, cy + fh * 0.45);
        g.lineBetween(cx - fw, cy + fh * 0.45, cx + fw, cy + fh * 0.45);
        g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.7);
        g.lineBetween(cx - fw, cy + fh * 0.45, cx - fw * 1.55, cy + fh * 0.85);
        g.lineBetween(cx + fw, cy + fh * 0.45, cx + fw * 1.55, cy + fh * 0.85);
        g.fillStyle(wColor, alpha * 0.9);
        g.fillCircle(cx, cy - fh * 0.15, cs * 0.07);
        g.fillStyle(16777215, alpha * 0.8);
        g.fillCircle(cx, cy - fh * 0.15, cs * 0.03);
        break;
      }
    }
  }
  function drawLivesRow(g, x, y, total, filled, pipSize = 14) {
    g.clear();
    const spacing = pipSize * 1.9;
    const totalW = spacing * (total - 1);
    const startX = x - totalW / 2;
    for (let i = 0; i < total; i++) {
      const px = startX + i * spacing;
      const isFull = i < filled;
      drawHeart(g, px, y, pipSize, isFull);
    }
  }
  function drawHeart(g, cx, cy, size, filled) {
    const r = size * 0.34;
    const lx = cx - r * 0.95;
    const rx = cx + r * 0.95;
    const ty = cy - size * 0.12;
    const bx = cx;
    const by = cy + size * 0.52;
    const pts = [];
    const arcSteps = 10;
    for (let s = 0; s <= arcSteps; s++) {
      const a = Math.PI * (1.18 + s * (1 / arcSteps));
      pts.push({ x: lx + Math.cos(a) * r, y: ty + Math.sin(a) * r });
    }
    for (let s = 0; s <= arcSteps; s++) {
      const a = Math.PI * (2.18 - s * (1 / arcSteps));
      pts.push({ x: rx + Math.cos(a) * r, y: ty + Math.sin(a) * r });
    }
    pts.push({ x: bx, y: by });
    if (filled) {
      g.fillStyle(16720452, 0.2);
      g.fillCircle(cx, cy, size * 0.72);
      g.fillStyle(16720452, 1);
      g.fillPoints(pts, true);
      g.fillStyle(16746666, 0.65);
      g.fillCircle(lx - r * 0.15, ty - r * 0.2, r * 0.38);
      g.lineStyle(Math.max(1, size * 0.07), 16737928, 1);
      g.strokePoints(pts, true);
    } else {
      g.fillStyle(1706e3, 0.75);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(1, size * 0.07), 5579315, 0.8);
      g.strokePoints(pts, true);
    }
  }
  function drawMechaExplosion(scene, x, y, r, color, duration = 340, depth = 20) {
    const g = scene.add.graphics({ x, y }).setDepth(depth);
    const ellipseCount = 5;
    const colors = [color, blendToward(color, 16777215, 0.45), blendToward(color, 16746496, 0.35), 16777215, blendToward(color, 0, 0.3)];
    const alphas = [0.85, 0.6, 0.5, 0.35, 0.7];
    for (let e = 0; e < ellipseCount; e++) {
      const ang = e / ellipseCount * Math.PI;
      const rw = r * (0.55 + e * 0.18);
      const rh = r * (0.22 + e * 0.06);
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const pts = [];
      const steps = 12;
      for (let s = 0; s < steps; s++) {
        const a = s / steps * Math.PI * 2;
        const ex = Math.cos(a) * rw;
        const ey = Math.sin(a) * rh;
        pts.push({ x: ex * cos - ey * sin, y: ex * sin + ey * cos });
      }
      g.fillStyle(colors[e % colors.length], alphas[e % alphas.length]);
      g.fillPoints(pts, true);
    }
    const spikeCount = 10;
    for (let s = 0; s < spikeCount; s++) {
      const ang = s / spikeCount * Math.PI * 2 + 0.18;
      const len = r * (0.9 + s % 3 * 0.35);
      const midA = ang + 0.14;
      const midLen = len * 0.45;
      g.fillStyle(blendToward(color, 16777215, 0.55), 0.75);
      g.fillTriangle(
        Math.cos(ang) * len,
        Math.sin(ang) * len,
        Math.cos(midA) * midLen,
        Math.sin(midA) * midLen,
        Math.cos(ang - 0.14) * midLen,
        Math.sin(ang - 0.14) * midLen
      );
    }
    g.lineStyle(Math.max(2, r * 0.1), blendToward(color, 16777215, 0.6), 0.8);
    g.strokeCircle(0, 0, r * 0.72);
    g.fillStyle(16777215, 0.95);
    g.fillCircle(0, 0, r * 0.32);
    g.fillStyle(color, 0.7);
    g.fillCircle(0, 0, r * 0.18);
    scene.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration,
      ease: "Quad.easeOut",
      onComplete: () => g.destroy()
    });
  }
  function spawnAsteroidDebris(scene, x, y, r, seed) {
    const chunkCount = Math.max(5, Math.min(9, Math.floor(r / 6)));
    for (let i = 0; i < chunkCount; i++) {
      const baseAng = i / chunkCount * Math.PI * 2;
      const ang = baseAng + (seed * 0.07 + i * 0.31) % 1 * 0.8 - 0.4;
      const speed = r * (1.8 + (seed + i * 17) % 10 / 10 * 2.2);
      const cSize = r * (0.18 + (seed + i * 7) % 8 / 8 * 0.22);
      const facets = 5 + i % 3;
      const pts = [];
      for (let f = 0; f < facets; f++) {
        const fa = f / facets * Math.PI * 2;
        const jit = 0.65 + 0.35 * Math.sin((seed + i * 13 + f * 29) * 0.9);
        pts.push({ x: Math.cos(fa) * cSize * jit, y: Math.sin(fa) * cSize * jit });
      }
      const t0 = i / chunkCount;
      const col = blendToward(10118707, 5911313, t0 * 0.6);
      const rimC = blendToward(col, 16777215, 0.35);
      const g = scene.add.graphics({ x, y }).setDepth(18);
      g.fillStyle(col, 1);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(1, cSize * 0.12), rimC, 0.7);
      g.strokePoints(pts, true);
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed;
      const dur = 520 + (seed + i * 11) % 6 * 60;
      scene.tweens.add({
        targets: g,
        x: x + vx * (dur / 1e3),
        y: y + vy * (dur / 1e3),
        angle: (i % 2 === 0 ? 1 : -1) * (120 + i * 37 % 80),
        alpha: 0,
        duration: dur,
        ease: "Quad.easeOut",
        onComplete: () => g.destroy()
      });
    }
  }
  function initStarLayers(scene, speedScale) {
    const H = GAME_HEIGHT;
    const W = GAME_WIDTH;
    const layerDefs = [
      // Layer 0: distant tiny dim stars — many, slow
      {
        count: 90,
        speed: 45 * speedScale,
        radius: 1,
        glint: false,
        colors: [8952234, 10070715, 11189196]
      },
      // Layer 1: mid-field stars — medium speed
      {
        count: 45,
        speed: 100 * speedScale,
        radius: 1.5,
        glint: false,
        colors: [11189196, 12307677, 13426144]
      },
      // Layer 2: bright foreground stars with glint — fastest, fewest
      {
        count: 14,
        speed: 190 * speedScale,
        radius: 2,
        glint: true,
        colors: [16777215, 15266047, 16775392]
      }
    ];
    return layerDefs.map((def) => {
      const stars = Array.from({ length: def.count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H
      }));
      const g = scene.add.graphics().setDepth(0);
      return {
        stars,
        speed: def.speed,
        radius: def.radius,
        glint: def.glint,
        colors: def.colors,
        graphics: g
      };
    });
  }
  function updateStarLayers(layers, dt) {
    const H = GAME_HEIGHT;
    for (const layer of layers) {
      const g = layer.graphics;
      g.clear();
      const dist = layer.speed * dt;
      for (let i = 0; i < layer.stars.length; i++) {
        const s = layer.stars[i];
        s.y += dist;
        if (s.y > H) s.y -= H;
        const col = layer.colors[i % layer.colors.length];
        g.fillStyle(col, 1);
        g.fillCircle(s.x, s.y, layer.radius);
        if (layer.glint) {
          g.lineStyle(1, col, 0.35);
          g.lineBetween(s.x - 5, s.y, s.x + 5, s.y);
          g.lineBetween(s.x, s.y - 5, s.x, s.y + 5);
        }
      }
    }
  }
  function blendToward(a, b, t) {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
    const br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return rr << 16 | rg << 8 | rb;
  }
  function drawHullBlock(g, px, py, fillColor, borderColor, alpha, weaponType, isCore, cs, nb) {
    const cx = px + cs / 2;
    const cy = py + cs / 2;
    const RIM = Math.max(2, cs * 0.1);
    const CHAMFER = Math.max(3, cs * 0.28);
    const eTop = nb.top ? py : py + RIM;
    const eBottom = nb.bottom ? py + cs : py + cs - RIM;
    const eLeft = nb.left ? px : px + RIM;
    const eRight = nb.right ? px + cs : px + cs - RIM;
    const tlX = eLeft;
    const tlY = eTop;
    const trX = eRight;
    const trY = eTop;
    const brX = eRight;
    const brY = eBottom;
    const blX = eLeft;
    const blY = eBottom;
    const pts = [];
    if (!nb.top && !nb.left) {
      pts.push({ x: tlX, y: tlY + CHAMFER });
      pts.push({ x: tlX + CHAMFER, y: tlY });
    } else {
      pts.push({ x: tlX, y: tlY });
    }
    if (!nb.top && !nb.right) {
      pts.push({ x: trX - CHAMFER, y: trY });
      pts.push({ x: trX, y: trY + CHAMFER });
    } else {
      pts.push({ x: trX, y: trY });
    }
    if (!nb.bottom && !nb.right) {
      pts.push({ x: brX, y: brY - CHAMFER });
      pts.push({ x: brX - CHAMFER, y: brY });
    } else {
      pts.push({ x: brX, y: brY });
    }
    if (!nb.bottom && !nb.left) {
      pts.push({ x: blX + CHAMFER, y: blY });
      pts.push({ x: blX, y: blY - CHAMFER });
    } else {
      pts.push({ x: blX, y: blY });
    }
    const shadowPts = pts.map((p) => ({ x: p.x + 2, y: p.y + 2 }));
    g.fillStyle(0, alpha * 0.5);
    g.fillPoints(shadowPts, true);
    g.fillStyle(fillColor, alpha);
    g.fillPoints(pts, true);
    const PI = Math.max(2, cs * 0.13);
    const panelPts = [
      { x: tlX + PI, y: tlY + PI },
      { x: trX - PI, y: trY + PI },
      { x: brX - PI, y: brY - PI },
      { x: blX + PI, y: blY - PI }
    ];
    const panelDark = blendToward(fillColor, 0, 0.45);
    g.fillStyle(panelDark, alpha * 0.85);
    g.fillPoints(panelPts, true);
    const PI2 = PI + Math.max(2, cs * 0.08);
    const innerPts = [
      { x: tlX + PI2, y: tlY + PI2 },
      { x: trX - PI2, y: trY + PI2 },
      { x: brX - PI2, y: brY - PI2 },
      { x: blX + PI2, y: blY - PI2 }
    ];
    const innerDark = blendToward(fillColor, 0, 0.62);
    g.fillStyle(innerDark, alpha * 0.75);
    g.fillPoints(innerPts, true);
    const hiColor = blendToward(fillColor, 16777215, 0.72);
    const bevW = Math.max(1, cs * 0.04);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dy <= 0) {
        g.lineStyle(bevW, hiColor, alpha * 0.85);
      } else if (dx < 0) {
        g.lineStyle(bevW, hiColor, alpha * 0.55);
      } else if (dy > 0 && dx >= 0) {
        g.lineStyle(bevW, 0, alpha * 0.55);
      } else {
        g.lineStyle(bevW, 0, alpha * 0.35);
      }
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const borderW = isCore ? Math.max(2, cs * 0.05) : Math.max(1, cs * 0.032);
    const borderCol = isCore ? 16770669 : borderColor;
    g.lineStyle(borderW, borderCol, alpha);
    g.strokePoints(pts, true);
    if (!isCore && cs >= 20) {
      const iX0 = tlX + PI2, iY0 = tlY + PI2;
      const iX1 = trX - PI2;
      const iY3 = brY - PI2;
      const iW = iX1 - iX0;
      const iH = iY3 - iY0;
      const detCol = blendToward(fillColor, 16777215, 0.55);
      g.lineStyle(Math.max(1, cs * 0.025), detCol, alpha * 0.65);
      g.lineBetween(iX0, iY3, iX0 + iW * 0.55, iY0);
      g.lineStyle(Math.max(1, cs * 0.018), detCol, alpha * 0.38);
      g.lineBetween(iX0 + iW * 0.45, iY3, iX1, iY0 + iH * 0.4);
      g.lineStyle(Math.max(1, cs * 0.02), detCol, alpha * 0.5);
      g.lineBetween(iX0, iY0 + iH * 0.72, iX1, iY0 + iH * 0.72);
      if (cs >= 30) {
        const rivR = Math.max(1, cs * 0.045);
        const rivCol = blendToward(fillColor, 16777215, 0.5);
        g.fillStyle(rivCol, alpha * 0.8);
        g.fillCircle(tlX + PI, tlY + PI, rivR);
        g.fillCircle(trX - PI, trY + PI, rivR);
        g.fillCircle(brX - PI, brY - PI, rivR);
        g.fillCircle(blX + PI, blY - PI, rivR);
      }
    }
    if (!isCore && cs >= 28) {
      const vLen = cs * 0.18;
      const vW = Math.max(1, cs * 0.022);
      const vSpc = cs * 0.048;
      const ventDark = 0;
      const ventHi = blendToward(fillColor, 16777215, 0.45);
      if (!nb.bottom) {
        const vy1 = brY - cs * 0.065;
        const vy2 = vy1 + vSpc;
        g.lineStyle(vW, ventDark, alpha * 0.7);
        g.lineBetween(cx - vLen, vy1, cx + vLen, vy1);
        g.lineBetween(cx - vLen, vy2, cx + vLen, vy2);
        g.lineStyle(Math.max(1, cs * 0.013), ventHi, alpha * 0.35);
        g.lineBetween(cx - vLen, vy1 - 1, cx + vLen, vy1 - 1);
      }
      if (!nb.top) {
        const vy1 = tlY + cs * 0.065;
        const vy2 = vy1 + vSpc;
        g.lineStyle(vW, ventDark, alpha * 0.5);
        g.lineBetween(cx - vLen, vy1, cx + vLen, vy1);
        g.lineBetween(cx - vLen, vy2, cx + vLen, vy2);
      }
    }
    if (isCore) {
      g.fillStyle(65518, alpha * 0.12);
      g.fillCircle(cx, cy, cs * 0.44);
      g.fillStyle(52411, alpha * 0.45);
      g.fillCircle(cx, cy, cs * 0.3);
      g.fillStyle(8738, alpha * 0.9);
      g.fillCircle(cx, cy, cs * 0.2);
      g.fillStyle(4521966, alpha);
      g.fillCircle(cx, cy, cs * 0.1);
      const sr = cs * 0.4;
      g.lineStyle(Math.max(1, cs * 0.035), 65518, alpha * 0.7);
      g.lineBetween(cx, cy - cs * 0.2, cx, cy - sr);
      g.lineBetween(cx, cy + cs * 0.2, cx, cy + sr);
      g.lineBetween(cx - cs * 0.2, cy, cx - sr, cy);
      g.lineBetween(cx + cs * 0.2, cy, cx + sr, cy);
      g.lineStyle(Math.max(1, cs * 0.022), 65518, alpha * 0.45);
      const ds = cs * 0.28;
      g.lineBetween(cx + cs * 0.14, cy - cs * 0.14, cx + ds * 0.72, cy - ds * 0.72);
      g.lineBetween(cx - cs * 0.14, cy - cs * 0.14, cx - ds * 0.72, cy - ds * 0.72);
      g.lineBetween(cx + cs * 0.14, cy + cs * 0.14, cx + ds * 0.72, cy + ds * 0.72);
      g.lineBetween(cx - cs * 0.14, cy + cs * 0.14, cx - ds * 0.72, cy + ds * 0.72);
      g.lineStyle(Math.max(1, cs * 0.04), 65518, alpha * 0.9);
      g.strokeCircle(cx, cy, cs * 0.3);
      g.lineStyle(Math.max(1, cs * 0.025), 4521966, alpha * 0.6);
      g.strokeCircle(cx, cy, cs * 0.2);
      return;
    }
    if (!weaponType) return;
    const wColors = COLORS.weapon;
    const wColor = wColors[weaponType] ?? 16777215;
    switch (weaponType) {
      case "gun": {
        const tr = cs * 0.17;
        g.fillStyle(blendToward(fillColor, 1118481, 0.55), alpha);
        g.fillCircle(cx, cy + cs * 0.04, tr);
        g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
        g.strokeCircle(cx, cy + cs * 0.04, tr);
        const bw = cs * 0.09, bh = cs * 0.24;
        g.fillStyle(wColor, alpha);
        g.fillRect(cx - bw / 2, cy + cs * 0.04 - tr - bh, bw, bh);
        g.fillStyle(16777215, alpha * 0.9);
        g.fillCircle(cx, cy + cs * 0.04 - tr - bh, cs * 0.038);
        break;
      }
      case "laser": {
        const lensR = cs * 0.11;
        const finW = cs * 0.075, finH = cs * 0.26;
        g.fillStyle(blendToward(wColor, 0, 0.4), alpha);
        g.fillRect(cx - cs * 0.25 - finW / 2, cy - finH / 2, finW, finH);
        g.fillRect(cx + cs * 0.25 - finW / 2, cy - finH / 2, finW, finH);
        g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.9);
        g.lineBetween(
          cx - cs * 0.25 - finW / 2,
          cy - finH / 2,
          cx - cs * 0.25 + finW / 2,
          cy - finH / 2
        );
        g.lineBetween(
          cx + cs * 0.25 - finW / 2,
          cy - finH / 2,
          cx + cs * 0.25 + finW / 2,
          cy - finH / 2
        );
        g.fillStyle(wColor, alpha * 0.22);
        g.fillCircle(cx, cy, lensR);
        g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
        g.strokeCircle(cx, cy, lensR);
        g.lineStyle(Math.max(1, cs * 0.02), wColor, alpha * 0.75);
        g.lineBetween(cx - lensR * 0.55, cy, cx + lensR * 0.55, cy);
        g.lineBetween(cx, cy - lensR * 0.55, cx, cy + lensR * 0.55);
        break;
      }
      case "beam": {
        const bw = cs * 0.2, bh = cs * 0.34;
        g.fillStyle(blendToward(fillColor, 17, 0.62), alpha);
        g.fillRect(cx - bw / 2, cy - bh * 0.68, bw, bh);
        g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
        g.strokeRect(cx - bw / 2, cy - bh * 0.68, bw, bh);
        g.fillStyle(wColor, alpha * 0.32);
        g.fillCircle(cx, cy - bh * 0.2, bw * 0.36);
        g.fillStyle(wColor, alpha * 0.7);
        g.fillCircle(cx, cy - bh * 0.2, bw * 0.22);
        g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.6);
        g.lineBetween(cx - cs * 0.31, cy + bh * 0.08, cx - bw / 2, cy + bh * 0.08);
        g.lineBetween(cx + bw / 2, cy + bh * 0.08, cx + cs * 0.31, cy + bh * 0.08);
        break;
      }
      case "mine": {
        const pr = cs * 0.13;
        g.fillStyle(blendToward(wColor, 0, 0.5), alpha);
        g.fillCircle(cx, cy, pr);
        g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
        g.strokeCircle(cx, cy, pr);
        for (let s = 0; s < 6; s++) {
          const a = s / 6 * Math.PI * 2 - Math.PI / 6;
          g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
          g.lineBetween(
            cx + Math.cos(a) * pr,
            cy + Math.sin(a) * pr,
            cx + Math.cos(a) * (pr + cs * 0.1),
            cy + Math.sin(a) * (pr + cs * 0.1)
          );
        }
        g.fillStyle(16720384, alpha);
        g.fillCircle(cx, cy, cs * 0.05);
        break;
      }
      case "missile": {
        const pw = cs * 0.28, ph = cs * 0.3;
        g.fillStyle(blendToward(fillColor, 2228224, 0.65), alpha);
        g.fillRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
        g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha);
        g.strokeRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
        const tubeR = cs * 0.052;
        g.fillStyle(0, alpha);
        g.fillCircle(cx - pw * 0.27, cy - ph * 0.58, tubeR);
        g.fillCircle(cx + pw * 0.27, cy - ph * 0.58, tubeR);
        g.lineStyle(Math.max(1, cs * 0.022), wColor, alpha * 0.8);
        g.strokeCircle(cx - pw * 0.27, cy - ph * 0.58, tubeR);
        g.strokeCircle(cx + pw * 0.27, cy - ph * 0.58, tubeR);
        g.fillStyle(wColor, alpha * 0.85);
        g.fillTriangle(
          cx,
          cy - ph * 0.68,
          cx - cs * 0.06,
          cy - ph * 0.42,
          cx + cs * 0.06,
          cy - ph * 0.42
        );
        break;
      }
      case "funnel": {
        const hr = cs * 0.19;
        g.fillStyle(wColor, alpha * 0.18);
        for (let s = 0; s < 6; s++) {
          const a1 = s / 6 * Math.PI * 2 - Math.PI / 6;
          const a2 = (s + 1) / 6 * Math.PI * 2 - Math.PI / 6;
          g.fillTriangle(
            cx,
            cy,
            cx + Math.cos(a1) * hr,
            cy + Math.sin(a1) * hr,
            cx + Math.cos(a2) * hr,
            cy + Math.sin(a2) * hr
          );
        }
        g.lineStyle(Math.max(1, cs * 0.038), wColor, alpha);
        g.strokeCircle(cx, cy, hr);
        g.fillStyle(wColor, alpha);
        for (let s = 0; s < 6; s++) {
          const a = s / 6 * Math.PI * 2 - Math.PI / 6;
          g.fillCircle(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr, cs * 0.033);
        }
        g.fillStyle(16777215, alpha * 0.55);
        g.fillCircle(cx, cy, cs * 0.065);
        break;
      }
      case "rock": {
        const rr = cs * 0.16;
        g.fillStyle(blendToward(wColor, 0, 0.35), alpha);
        for (let s = 0; s < 8; s++) {
          const a1 = s / 8 * Math.PI * 2;
          const a2 = (s + 1) / 8 * Math.PI * 2;
          const j = s % 2 === 0 ? 0.8 : 1;
          g.fillTriangle(
            cx,
            cy,
            cx + Math.cos(a1) * rr * j,
            cy + Math.sin(a1) * rr * j,
            cx + Math.cos(a2) * rr * j,
            cy + Math.sin(a2) * rr * j
          );
        }
        g.lineStyle(Math.max(1, cs * 0.038), wColor, alpha * 0.9);
        g.strokeCircle(cx, cy, rr);
        g.lineStyle(Math.max(1, cs * 0.028), blendToward(wColor, 16777215, 0.5), alpha * 0.75);
        g.lineBetween(cx, cy - rr, cx, cy - rr - cs * 0.11);
        g.fillStyle(wColor, alpha);
        g.fillCircle(cx, cy, cs * 0.06);
        break;
      }
      case "homing": {
        const fh = cs * 0.23, fw = cs * 0.19;
        g.fillStyle(blendToward(wColor, 0, 0.45), alpha);
        g.fillTriangle(
          cx,
          cy - fh,
          cx - fw,
          cy + fh * 0.42,
          cx + fw,
          cy + fh * 0.42
        );
        g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha);
        g.lineBetween(cx, cy - fh, cx - fw, cy + fh * 0.42);
        g.lineBetween(cx, cy - fh, cx + fw, cy + fh * 0.42);
        g.lineBetween(cx - fw, cy + fh * 0.42, cx + fw, cy + fh * 0.42);
        g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.65);
        g.lineBetween(cx - fw, cy + fh * 0.42, cx - fw * 1.5, cy + fh * 0.8);
        g.lineBetween(cx + fw, cy + fh * 0.42, cx + fw * 1.5, cy + fh * 0.8);
        g.fillStyle(wColor, alpha * 0.9);
        g.fillCircle(cx, cy - fh * 0.12, cs * 0.065);
        g.fillStyle(16777215, alpha * 0.8);
        g.fillCircle(cx, cy - fh * 0.12, cs * 0.028);
        break;
      }
    }
  }
  function nbFromSet(col, row, occupied) {
    return {
      top: occupied.has(`${col},${row - 1}`),
      bottom: occupied.has(`${col},${row + 1}`),
      left: occupied.has(`${col - 1},${row}`),
      right: occupied.has(`${col + 1},${row}`)
    };
  }
  function drawPiece(g, originX, originY, piece, fillColor, borderColor, alpha, cs = CELL) {
    const occ = new Set(piece.blocks.map((b) => `${b.col},${b.row}`));
    piece.blocks.forEach((b, i) => {
      const wt = weaponTypeAtIndex(piece.weapons, i);
      const nb = nbFromSet(b.col, b.row, occ);
      drawHullBlock(
        g,
        originX + b.col * cs,
        originY + b.row * cs,
        fillColor,
        borderColor,
        alpha,
        wt,
        false,
        cs,
        nb
      );
    });
  }
  function weaponTypeAtIndex(weapons, i) {
    for (const w of weapons) {
      if (w.blockIndex === i) return w.type;
    }
    return null;
  }
  const ADVANCED_WEAPONS = ["beam", "mine", "missile", "funnel", "rock", "homing"];
  function makeWeaponOrder() {
    const rest = Phaser.Utils.Array.Shuffle([...ADVANCED_WEAPONS]);
    return ["gun", "laser", ...rest];
  }
  function unlockedWeapons(order, round) {
    return order.slice(0, Math.max(2, round + 1));
  }
  const gameState = {
    placedPieces: [],
    coreCol: CORE_COL,
    coreRow: CORE_ROW,
    round: 1,
    enemyPieceCount: INITIAL_ENEMY_PIECES,
    playerHp: PLAYER_MAX_HP,
    playerMaxHp: PLAYER_MAX_HP,
    lives: PLAYER_LIVES,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    cellSize: CELL,
    // Weapon orders are generated lazily on first use (Phaser.Utils.Array.Shuffle
    // needs Phaser to be instantiated; we can't call it at module level before
    // new Phaser.Game()). The BuildScene.init() will initialise them if empty.
    playerWeaponOrder: [],
    enemyWeaponOrder: []
  };
  class BuildScene extends Phaser.Scene {
    constructor() {
      super({ key: "BuildScene" });
      this.gridOriginX = 0;
      this.gridOriginY = 0;
      this.bonusTiles = [];
      this.bonusTileLabels = [];
      this.trayPieces = [];
      this.trayGraphics = [];
      this.trayContainers = [];
      this.dragging = null;
      this.draggingIndex = -1;
      this.dragContainer = null;
      this.ghostCol = -1;
      this.ghostRow = -1;
      this.ghostValid = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.dragMoved = false;
      this.starLayers = [];
      this.piecesAllowed = INITIAL_PIECE_COUNT;
      this.gridExpandedThisPhase = false;
      this.TRAY_Y_START = 1460;
      this.TRAY_SLOT_W = GAME_WIDTH / 2;
      this.TRAY_ROWS = 2;
    }
    init(data) {
      if (data == null ? void 0 : data.state) Object.assign(gameState, data.state);
      if (gameState.playerWeaponOrder.length === 0) {
        gameState.playerWeaponOrder = makeWeaponOrder();
      }
      if (gameState.enemyWeaponOrder.length === 0) {
        gameState.enemyWeaponOrder = makeWeaponOrder();
      }
      this.piecesAllowed = gameState.placedPieces.length === 0 ? INITIAL_PIECE_COUNT : SUBSEQUENT_PIECE_COUNT;
      if (gameState.placedPieces.length > 0) {
        const occupied = gameState.placedPieces.flatMap(absoluteBlocks).length + 1;
        const total = gameState.gridCols * gameState.gridRows;
        if (occupied / total >= GRID_EXPAND_THRESHOLD) {
          const oldCols = gameState.gridCols;
          const oldRows = gameState.gridRows;
          const newCols = oldCols + 2;
          const newRows = oldRows + 2;
          const dCol = 1;
          const dRow = 1;
          for (const p of gameState.placedPieces) {
            p.gridCol += dCol;
            p.gridRow += dRow;
          }
          gameState.coreCol += dCol;
          gameState.coreRow += dRow;
          gameState.gridCols = newCols;
          gameState.gridRows = newRows;
          gameState.cellSize = Math.floor(Math.min(GRID_PIXEL_W / newCols, GRID_PIXEL_H / newRows));
          this.gridExpandedThisPhase = true;
        } else {
          this.gridExpandedThisPhase = false;
        }
      } else {
        this.gridExpandedThisPhase = false;
      }
    }
    create() {
      this.rexUI = this.rexUI;
      this.trayContainers = [];
      this.trayGraphics = [];
      this.bonusTileLabels = [];
      this.dragging = null;
      this.dragContainer = null;
      this.draggingIndex = -1;
      this.dragMoved = false;
      const bg = this.add.graphics();
      bg.fillGradientStyle(COLORS.bg.primary, COLORS.bg.primary, COLORS.bg.secondary, COLORS.bg.secondary, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.starLayers = initStarLayers(this, 0.28);
      BGM.playBuild();
      const cs = gameState.cellSize;
      const gridW = gameState.gridCols * cs;
      gameState.gridRows * cs;
      this.gridOriginX = Math.floor((GAME_WIDTH - gridW) / 2);
      this.gridOriginY = 180;
      this.gridGraphics = this.add.graphics();
      this.bonusTilesGraphics = this.add.graphics();
      this.shipGraphics = this.add.graphics();
      this.ghostGraphics = this.add.graphics();
      this.drawGrid();
      this.spawnBonusTiles();
      this.drawBonusTiles();
      this.drawShip();
      if (this.gridExpandedThisPhase) {
        const toast = this.add.text(
          GAME_WIDTH / 2,
          this.gridOriginY + gameState.gridRows * gameState.cellSize + 24,
          `⚡ Grid expanded to ${gameState.gridCols}×${gameState.gridRows}!`,
          {
            fontSize: "26px",
            fontFamily: "Arial",
            color: "#4ecdc4",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 3,
            align: "center"
          }
        ).setOrigin(0.5, 0).setDepth(15);
        this.tweens.add({
          targets: toast,
          alpha: 0,
          y: toast.y - 40,
          delay: 1600,
          duration: 700,
          ease: "Quad.easeIn",
          onComplete: () => toast.destroy()
        });
      }
      this.trayPieces = Array.from({ length: this.piecesAllowed }, () => randomPiece(gameState.round));
      if (gameState.round === 1) {
        this.trayPieces.forEach((p, i) => {
          const assignedType = i % 2 === 0 ? "gun" : "laser";
          if (p.weapons.length > 0) {
            p.weapons[0] = { type: assignedType, blockIndex: p.weapons[0].blockIndex };
          }
        });
      } else {
        const newWeaponIdx = gameState.round;
        const newWeapon = newWeaponIdx >= 2 && newWeaponIdx < gameState.playerWeaponOrder.length ? gameState.playerWeaponOrder[newWeaponIdx] : null;
        if (newWeapon) {
          const p = this.trayPieces[0];
          if (p.weapons.length > 0) {
            p.weapons[0] = { type: newWeapon, blockIndex: p.weapons[0].blockIndex };
          }
        }
      }
      this.buildTray();
      const headerPanel = this.add.graphics();
      headerPanel.fillStyle(461848, 0.88);
      headerPanel.fillRect(0, 0, GAME_WIDTH, 150);
      headerPanel.lineStyle(2, COLORS.accent.primary, 0.6);
      headerPanel.lineBetween(40, 148, GAME_WIDTH - 40, 148);
      const bLen = 24;
      headerPanel.lineStyle(2, COLORS.accent.primary, 0.45);
      headerPanel.lineBetween(16, 16, 16 + bLen, 16);
      headerPanel.lineBetween(16, 16, 16, 16 + bLen);
      headerPanel.lineBetween(GAME_WIDTH - 16, 16, GAME_WIDTH - 16 - bLen, 16);
      headerPanel.lineBetween(GAME_WIDTH - 16, 16, GAME_WIDTH - 16, 16 + bLen);
      headerPanel.setAlpha(0).setY(-30);
      this.tweens.add({ targets: headerPanel, alpha: 1, y: 0, duration: 380, ease: "Quad.easeOut" });
      this.hudText = this.add.text(GAME_WIDTH / 2, 50, "", {
        ...TEXT_STYLES.hud,
        align: "center"
      }).setOrigin(0.5, 0.5);
      this.hudText.setAlpha(0);
      this.tweens.add({ targets: this.hudText, alpha: 1, duration: 400, delay: 120, ease: "Quad.easeOut" });
      this.livesGfx = this.add.graphics().setDepth(11);
      this.livesGfx.setAlpha(0);
      this.tweens.add({ targets: this.livesGfx, alpha: 1, duration: 400, delay: 120, ease: "Quad.easeOut" });
      this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 164, "Drag pieces onto the grid  •  Tap to rotate", {
        fontSize: "24px",
        fontFamily: "Arial",
        color: "#7799bb",
        align: "center",
        fontStyle: "italic"
      }).setOrigin(0.5, 0.5);
      this.pieceCountText = this.add.text(GAME_WIDTH / 2, 1222, "", {
        fontSize: "38px",
        fontFamily: "Arial Black",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
        stroke: "#000000",
        strokeThickness: 5
      }).setOrigin(0.5, 0.5).setDepth(2);
      this.updateHud();
      const trayPanel = this.add.graphics();
      trayPanel.fillStyle(461848, 0.85);
      trayPanel.fillRect(0, GAME_HEIGHT - 310, GAME_WIDTH, 310);
      trayPanel.lineStyle(2, COLORS.accent.primary, 0.35);
      trayPanel.lineBetween(40, GAME_HEIGHT - 308, GAME_WIDTH - 40, GAME_HEIGHT - 308);
      trayPanel.setDepth(-1);
      this.fightBtn = this.createButton("FIGHT!", COLORS.accent.secondary, () => this.startBattle());
      this.fightBtn.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 90);
      this.fightBtn.setVisible(false);
      this.addLegend();
      this.input.on("pointermove", this.onPointerMove, this);
      this.input.on("pointerup", this.onPointerUp, this);
    }
    // ─── Grid drawing ──────────────────────────────────────────────────────────
    drawGrid() {
      const g = this.gridGraphics;
      const cs = gameState.cellSize;
      const cols = gameState.gridCols;
      const rows = gameState.gridRows;
      g.clear();
      g.fillStyle(COLORS.grid.fill, 1);
      g.fillRect(this.gridOriginX, this.gridOriginY, cols * cs, rows * cs);
      g.lineStyle(1, COLORS.grid.line, 0.7);
      for (let col = 0; col <= cols; col++) {
        const x = this.gridOriginX + col * cs;
        g.lineBetween(x, this.gridOriginY, x, this.gridOriginY + rows * cs);
      }
      for (let row = 0; row <= rows; row++) {
        const y = this.gridOriginY + row * cs;
        g.lineBetween(this.gridOriginX, y, this.gridOriginX + cols * cs, y);
      }
    }
    drawShip() {
      const g = this.shipGraphics;
      const cs = gameState.cellSize;
      g.clear();
      const occ = /* @__PURE__ */ new Set();
      occ.add(`${gameState.coreCol},${gameState.coreRow}`);
      for (const p of gameState.placedPieces) {
        for (const b of p.blocks) {
          occ.add(`${p.gridCol + b.col},${p.gridRow + b.row}`);
        }
      }
      const cpx = this.gridOriginX + gameState.coreCol * cs;
      const cpy = this.gridOriginY + gameState.coreRow * cs;
      const coreNB = nbFromSet(gameState.coreCol, gameState.coreRow, occ);
      drawHullBlock(g, cpx, cpy, 6690, 65518, 1, null, true, cs, coreNB);
      for (const p of gameState.placedPieces) {
        p.blocks.forEach((b, i) => {
          const wt = weaponTypeAtIndex(p.weapons, i);
          const col = p.gridCol + b.col;
          const row = p.gridRow + b.row;
          const px = this.gridOriginX + col * cs;
          const py = this.gridOriginY + row * cs;
          const nb = nbFromSet(col, row, occ);
          drawHullBlock(g, px, py, COLORS.block.placed, COLORS.block.border, 1, wt, false, cs, nb);
        });
      }
    }
    drawGhost() {
      const g = this.ghostGraphics;
      const cs = gameState.cellSize;
      g.clear();
      if (!this.dragging || this.ghostCol < 0) return;
      const abs = this.dragging.blocks.map((b) => ({
        col: this.ghostCol + b.col,
        row: this.ghostRow + b.row
      }));
      const color = this.ghostValid ? COLORS.block.default : COLORS.ui.danger;
      abs.forEach((b) => {
        const px = this.gridOriginX + b.col * cs;
        const py = this.gridOriginY + b.row * cs;
        drawBlock(g, px, py, color, this.ghostValid ? COLORS.block.border : COLORS.ui.danger, COLORS.block.ghostAlpha, null, false, cs);
      });
    }
    // ─── Bonus tiles ───────────────────────────────────────────────────────────
    spawnBonusTiles() {
      this.bonusTiles = [];
      const occupied = /* @__PURE__ */ new Set();
      occupied.add(`${gameState.coreCol},${gameState.coreRow}`);
      for (const p of gameState.placedPieces) {
        for (const b of p.blocks) {
          occupied.add(`${p.gridCol + b.col},${p.gridRow + b.row}`);
        }
      }
      const pool = unlockedWeapons(gameState.playerWeaponOrder, gameState.round);
      const newWeaponIdx = gameState.round;
      const newWeapon = newWeaponIdx >= 2 && newWeaponIdx < gameState.playerWeaponOrder.length ? gameState.playerWeaponOrder[newWeaponIdx] : null;
      const shipCells = [
        { col: gameState.coreCol, row: gameState.coreRow },
        ...gameState.placedPieces.flatMap(
          (p) => p.blocks.map((b) => ({ col: p.gridCol + b.col, row: p.gridRow + b.row }))
        )
      ];
      const candidates = [];
      for (let col = 0; col < gameState.gridCols; col++) {
        for (let row = 0; row < gameState.gridRows; row++) {
          if (occupied.has(`${col},${row}`)) continue;
          const nearEnough = shipCells.some(
            (s) => Math.abs(col - s.col) + Math.abs(row - s.row) <= BONUS_TILE_MAX_DIST
          );
          if (nearEnough) candidates.push({ col, row });
        }
      }
      Phaser.Utils.Array.Shuffle(candidates);
      let candidateIdx = 0;
      const placeTile = (type) => {
        while (candidateIdx < candidates.length) {
          const { col, row } = candidates[candidateIdx++];
          const key = `${col},${row}`;
          if (occupied.has(key)) continue;
          occupied.add(key);
          this.bonusTiles.push({ col, row, type });
          return true;
        }
        return false;
      };
      if (newWeapon) placeTile(newWeapon);
      while (this.bonusTiles.length < BONUS_TILE_COUNT) {
        const type = pool[Phaser.Math.Between(0, pool.length - 1)];
        if (!placeTile(type)) break;
      }
    }
    drawBonusTiles() {
      const g = this.bonusTilesGraphics;
      const cs = gameState.cellSize;
      g.clear();
      const wColors = COLORS.weapon;
      for (const tile of this.bonusTiles) {
        const px = this.gridOriginX + tile.col * cs;
        const py = this.gridOriginY + tile.row * cs;
        const glowColor = wColors[tile.type] ?? 16777215;
        const r = (glowColor >> 16 & 255) >> 2;
        const grn = (glowColor >> 8 & 255) >> 2;
        const b = (glowColor & 255) >> 2;
        const fillColor = r << 16 | grn << 8 | b;
        const pad = Math.max(2, cs * 0.06);
        g.fillStyle(fillColor, 0.85);
        g.fillRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, Math.max(4, cs * 0.11));
        g.lineStyle(2, glowColor, 0.9);
        g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, Math.max(4, cs * 0.11));
        drawBlock(g, px, py, fillColor, glowColor, 1, tile.type, false, cs);
      }
      this.refreshBonusTileLabels();
    }
    refreshBonusTileLabels() {
      for (const t of this.bonusTileLabels) t.destroy();
      this.bonusTileLabels = [];
      const cs = gameState.cellSize;
      const wColors = COLORS.weapon;
      const wNames = {
        gun: "GUN",
        laser: "LASER",
        beam: "BEAM",
        mine: "MINE",
        missile: "MSSL",
        funnel: "FUNNEL",
        rock: "ROCK",
        homing: "HOME"
      };
      for (const tile of this.bonusTiles) {
        const cx = this.gridOriginX + tile.col * cs + cs / 2;
        const cy = this.gridOriginY + tile.row * cs + cs / 2;
        const colNum = wColors[tile.type] ?? 16777215;
        const color = "#" + colNum.toString(16).padStart(6, "0");
        const label = wNames[tile.type] ?? tile.type.toUpperCase();
        const fontSize = Math.max(10, Math.round(cs * 0.22));
        const t = this.add.text(cx, cy, label + "\nFREE", {
          fontSize: `${fontSize}px`,
          fontFamily: "Arial",
          color,
          fontStyle: "bold",
          align: "center",
          stroke: "#000000",
          strokeThickness: 3
        }).setOrigin(0.5, 0.5).setDepth(5);
        this.bonusTileLabels.push(t);
      }
    }
    buildTray() {
      this.trayContainers.forEach((c) => c.destroy());
      this.trayGraphics.forEach((g) => g.destroy());
      this.trayContainers = [];
      this.trayGraphics = [];
      const slotW = this.TRAY_SLOT_W;
      const slotH = 120;
      const cols = 2;
      this.trayPieces.forEach((piece, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const slotCx = (col + 0.5) * slotW;
        const slotCy = this.TRAY_Y_START - slotH * (this.TRAY_ROWS - 1 - row) * 1.15;
        const bg = this.add.graphics();
        bg.fillStyle(COLORS.bg.panel, 1);
        bg.fillRoundedRect(slotCx - slotW / 2 + 6, slotCy - slotH / 2 + 4, slotW - 12, slotH - 8, 10);
        bg.lineStyle(2, COLORS.ui.border, 1);
        bg.strokeRoundedRect(slotCx - slotW / 2 + 6, slotCy - slotH / 2 + 4, slotW - 12, slotH - 8, 10);
        const pieceG = this.add.graphics();
        this.trayGraphics.push(pieceG);
        this.redrawTrayPiece(idx);
        const container = this.add.container(slotCx, slotCy);
        container.setSize(slotW - 12, slotH - 8);
        container.setInteractive({ useHandCursor: true });
        this.trayContainers.push(container);
        container.on("pointerdown", (ptr) => {
          const liveIdx = this.trayContainers.indexOf(container);
          if (liveIdx < 0) return;
          this.startDrag(liveIdx, ptr.x, ptr.y);
        });
      });
    }
    piecePixelSize(piece) {
      const maxCol = Math.max(...piece.blocks.map((b) => b.col));
      const maxRow = Math.max(...piece.blocks.map((b) => b.row));
      const cs = gameState.cellSize;
      return { w: (maxCol + 1) * cs, h: (maxRow + 1) * cs };
    }
    redrawTrayPiece(idx) {
      const piece = this.trayPieces[idx];
      const g = this.trayGraphics[idx];
      if (!g || !piece) return;
      g.clear();
      const slotW = this.TRAY_SLOT_W;
      const slotH = 120;
      const cols = 2;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const slotCx = (col + 0.5) * slotW;
      const slotCy = this.TRAY_Y_START - slotH * (this.TRAY_ROWS - 1 - row) * 1.15;
      const { w, h } = this.piecePixelSize(piece);
      const maxW = slotW - 24;
      const maxH = slotH - 16;
      const scale = Math.min(maxW / w, maxH / h, 1);
      const drawW = w * scale;
      const drawH = h * scale;
      const ox = slotCx - drawW / 2;
      const oy = slotCy - drawH / 2;
      const cs = gameState.cellSize;
      const scaledCs = cs * scale;
      drawPiece(g, ox, oy, piece, COLORS.block.default, COLORS.block.border, 1, scaledCs);
    }
    // ─── Drag ──────────────────────────────────────────────────────────────────
    startDrag(idx, px, py) {
      const piece = this.trayPieces[idx];
      if (!piece) return;
      SFX.play("piece_pickup");
      this.dragging = piece;
      this.draggingIndex = idx;
      this.dragStartX = px;
      this.dragStartY = py;
      this.dragMoved = false;
      if (this.dragContainer) this.dragContainer.destroy();
      const g = this.add.graphics();
      const { w, h } = this.piecePixelSize(piece);
      drawPiece(g, -w / 2, -h / 2, piece, COLORS.block.default, COLORS.block.border, 0.85);
      this.dragContainer = this.add.container(px, py, [g]);
      this.dragContainer.setDepth(10);
      this.dragContainer.setVisible(false);
    }
    onPointerMove(ptr) {
      var _a, _b;
      if (!this.dragging) return;
      const dx = ptr.x - this.dragStartX;
      const dy = ptr.y - this.dragStartY;
      if (!this.dragMoved && Math.hypot(dx, dy) > 20) {
        this.dragMoved = true;
        (_a = this.dragContainer) == null ? void 0 : _a.setVisible(true);
        (_b = this.trayGraphics[this.draggingIndex]) == null ? void 0 : _b.setVisible(false);
      }
      if (!this.dragMoved) return;
      if (this.dragContainer) {
        this.dragContainer.setPosition(ptr.x, ptr.y);
      }
      const relX = ptr.x - this.gridOriginX;
      const relY = ptr.y - this.gridOriginY;
      const cs = gameState.cellSize;
      this.ghostCol = Math.floor((relX - cs / 2) / cs);
      this.ghostRow = Math.floor((relY - cs / 2) / cs);
      this.validateGhost();
      this.drawGhost();
    }
    validateGhost() {
      if (!this.dragging) {
        this.ghostValid = false;
        return;
      }
      const abs = this.dragging.blocks.map((b) => ({
        col: this.ghostCol + b.col,
        row: this.ghostRow + b.row
      }));
      if (!inBounds(abs)) {
        this.ghostValid = false;
        return;
      }
      if (abs.some((b) => b.col === gameState.coreCol && b.row === gameState.coreRow)) {
        this.ghostValid = false;
        return;
      }
      if (overlaps(abs, gameState.placedPieces.flatMap(absoluteBlocks))) {
        this.ghostValid = false;
        return;
      }
      const coreAsPlaced = [{ col: gameState.coreCol, row: gameState.coreRow }];
      const allOccupied = [...coreAsPlaced, ...gameState.placedPieces.flatMap(absoluteBlocks)];
      this.ghostValid = abs.some(
        (b) => allOccupied.some((o) => Math.abs(b.col - o.col) + Math.abs(b.row - o.row) === 1)
      );
    }
    onPointerUp(_ptr) {
      if (!this.dragging) return;
      if (!this.dragMoved) {
        this.rotateTrayPiece(this.draggingIndex);
        this.cancelDrag();
        return;
      }
      if (this.ghostValid && this.ghostCol >= 0) {
        this.placePiece(this.draggingIndex, this.ghostCol, this.ghostRow);
      } else {
        this.cancelDrag();
      }
      this.ghostGraphics.clear();
      this.ghostCol = -1;
    }
    cancelDrag() {
      var _a;
      if (this.dragContainer) {
        this.dragContainer.destroy();
        this.dragContainer = null;
      }
      if (this.draggingIndex >= 0) {
        (_a = this.trayGraphics[this.draggingIndex]) == null ? void 0 : _a.setVisible(true);
      }
      this.dragging = null;
      this.draggingIndex = -1;
      this.dragMoved = false;
    }
    rotateTrayPiece(idx) {
      const piece = this.trayPieces[idx];
      if (!piece) return;
      SFX.play("piece_rotate");
      piece.blocks = normalise(rotateCW(piece.blocks));
      piece.rotation = (piece.rotation + 1) % 4;
      this.redrawTrayPiece(idx);
    }
    placePiece(idx, gridCol, gridRow) {
      const piece = this.trayPieces[idx];
      if (!piece) return;
      const newPiece = {
        gridCol,
        gridRow,
        blocks: piece.blocks.map((b) => ({ ...b })),
        weapons: piece.weapons.map((w) => ({ ...w }))
      };
      gameState.placedPieces.push(newPiece);
      SFX.play("piece_place");
      this.claimBonusTiles(newPiece);
      if (this.dragContainer) {
        this.dragContainer.destroy();
        this.dragContainer = null;
      }
      this.dragging = null;
      this.draggingIndex = -1;
      this.dragMoved = false;
      this.trayPieces.splice(idx, 1);
      this.buildTray();
      this.drawBonusTiles();
      this.drawShip();
      this.updateHud();
      if (this.trayPieces.length === 0) {
        this.showFightButton();
      }
    }
    rebuildTrayAfterRemove() {
    }
    /** Check if any blocks of the just-placed piece overlap a bonus tile. If so,
     *  grant the bonus weapon on that block, displacing any existing weapon to the
     *  nearest free block (by grid distance) within the piece. */
    claimBonusTiles(placed) {
      for (let ti = this.bonusTiles.length - 1; ti >= 0; ti--) {
        const tile = this.bonusTiles[ti];
        const hitIdx = placed.blocks.findIndex(
          (b) => placed.gridCol + b.col === tile.col && placed.gridRow + b.row === tile.row
        );
        if (hitIdx < 0) continue;
        const existingWeaponIdx = placed.weapons.findIndex((w) => w.blockIndex === hitIdx);
        if (existingWeaponIdx >= 0) {
          const takenIndices = new Set(placed.weapons.map((w) => w.blockIndex));
          takenIndices.delete(hitIdx);
          const hitBlock = placed.blocks[hitIdx];
          let bestFreeIdx = -1;
          let bestDist = Infinity;
          for (let bi = 0; bi < placed.blocks.length; bi++) {
            if (bi === hitIdx || takenIndices.has(bi)) continue;
            const b = placed.blocks[bi];
            const d = Math.abs(b.col - hitBlock.col) + Math.abs(b.row - hitBlock.row);
            if (d < bestDist) {
              bestDist = d;
              bestFreeIdx = bi;
            }
          }
          if (bestFreeIdx >= 0) {
            placed.weapons[existingWeaponIdx] = {
              ...placed.weapons[existingWeaponIdx],
              blockIndex: bestFreeIdx
            };
          } else {
            placed.weapons.splice(existingWeaponIdx, 1);
          }
        }
        placed.weapons.push({ type: tile.type, blockIndex: hitIdx });
        this.bonusTiles.splice(ti, 1);
        const cs = gameState.cellSize;
        const px = this.gridOriginX + tile.col * cs + cs / 2;
        const py = this.gridOriginY + tile.row * cs + cs / 2;
        const wColors = COLORS.weapon;
        const flashColor = wColors[tile.type] ?? 16777215;
        drawMechaExplosion(this, px, py, cs * 0.62, flashColor, 420, 20);
        const wNames = {
          gun: "GUN",
          laser: "LASER",
          beam: "BEAM",
          mine: "MINE",
          missile: "MISSILE",
          funnel: "FUNNEL",
          rock: "ROCK",
          homing: "HOMING"
        };
        const wLabel = wNames[tile.type] ?? tile.type.toUpperCase();
        const flashHex = "#" + flashColor.toString(16).padStart(6, "0");
        const label = `⚡ FREE ${wLabel}!`;
        const popup = this.add.text(px, py - cs * 0.6, label, {
          fontSize: "26px",
          fontFamily: "Arial",
          color: flashHex,
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 4
        }).setOrigin(0.5, 1).setDepth(21);
        this.tweens.add({
          targets: popup,
          y: py - cs * 1.6,
          alpha: 0,
          duration: 900,
          ease: "Quad.easeOut",
          onComplete: () => popup.destroy()
        });
        SFX.play("bonus_pickup");
        break;
      }
    }
    // ─── Camera centering ──────────────────────────────────────────────────────
    centerCamera() {
      if (gameState.placedPieces.length === 0) return;
      const allBlocks = gameState.placedPieces.flatMap(absoluteBlocks);
      const minCol = Math.min(...allBlocks.map((b) => b.col));
      const maxCol = Math.max(...allBlocks.map((b) => b.col));
      const minRow = Math.min(...allBlocks.map((b) => b.row));
      const maxRow = Math.max(...allBlocks.map((b) => b.row));
      (maxCol - minCol + 1) * gameState.cellSize;
      (maxRow - minRow + 1) * gameState.cellSize;
      const areaH = this.TRAY_Y_START - 100 - 180;
      const areaW = GAME_WIDTH - 48;
      areaW / (gameState.gridCols * gameState.cellSize);
      areaH / (gameState.gridRows * gameState.cellSize);
    }
    // ─── UI helpers ────────────────────────────────────────────────────────────
    updateHud() {
      var _a;
      const remaining = this.trayPieces.length;
      const phase = gameState.round === 1 ? "Build Your Ship" : `Round ${gameState.round} — Add Pieces`;
      (_a = this.hudText) == null ? void 0 : _a.setText(phase);
      if (this.livesGfx) {
        drawLivesRow(this.livesGfx, GAME_WIDTH / 2, 112, PLAYER_LIVES, gameState.lives, 16);
      }
      if (this.pieceCountText) {
        if (remaining === 0) {
          this.pieceCountText.setText("All pieces placed!").setVisible(true).setColor("#4ecdc4");
        } else {
          const label = remaining === 1 ? "1 piece to place" : `${remaining} pieces to place`;
          this.pieceCountText.setText(label).setVisible(true).setColor("#ffffff");
        }
      }
    }
    showFightButton() {
      this.fightBtn.setVisible(true);
      this.infoText.setText("Ship complete! Ready to fight?");
      this.tweens.add({
        targets: this.fightBtn,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 500,
        yoyo: true,
        repeat: -1
      });
    }
    addLegend() {
      const labelFor = {
        gun: "Gun",
        laser: "Laser",
        beam: "Beam",
        mine: "Mine",
        missile: "Missile",
        funnel: "Funnel",
        rock: "Rock",
        homing: "Homing"
      };
      const entries = gameState.playerWeaponOrder.map((type, i) => ({
        type,
        label: labelFor[type],
        round: i <= 1 ? 1 : i
      }));
      const wColors = COLORS.weapon;
      const rowH = 34;
      const startY = 168;
      const panelW = 130;
      const iconX = GAME_WIDTH - 16;
      const textX = GAME_WIDTH - 32;
      const panelH = entries.length * rowH + 16;
      const legendBg = this.add.graphics();
      legendBg.fillStyle(461848, 0.72);
      legendBg.fillRoundedRect(GAME_WIDTH - panelW - 4, startY - 10, panelW + 4, panelH, 8);
      legendBg.lineStyle(1, COLORS.ui.border, 0.5);
      legendBg.strokeRoundedRect(GAME_WIDTH - panelW - 4, startY - 10, panelW + 4, panelH, 8);
      this.add.text(GAME_WIDTH - panelW / 2 - 4, startY - 4, "WEAPONS", {
        fontSize: "13px",
        fontFamily: "Arial",
        color: "#445566",
        fontStyle: "bold"
      }).setOrigin(0.5, 1);
      entries.forEach((entry, i) => {
        const y = startY + i * rowH + rowH / 2;
        const locked = entry.round > gameState.round;
        const color = wColors[entry.type] ?? 16777215;
        const alpha = locked ? 0.22 : 1;
        const hexStr = "#" + color.toString(16).padStart(6, "0");
        const labelColor = locked ? "#334455" : hexStr;
        if (!locked) {
          const rowBg = this.add.graphics().setAlpha(0.12);
          rowBg.fillStyle(color, 1);
          rowBg.fillRoundedRect(GAME_WIDTH - panelW - 2, y - rowH / 2 + 1, panelW, rowH - 2, 4);
        }
        const g = this.add.graphics().setAlpha(alpha);
        const cx = iconX - 12, cy = y;
        const cs = 20;
        g.fillStyle(color, 1);
        switch (entry.type) {
          case "gun":
            g.fillCircle(cx, cy, 5);
            break;
          case "laser":
            g.fillTriangle(cx, cy - 6, cx + 5, cy, cx, cy + 6);
            g.fillTriangle(cx, cy - 6, cx - 5, cy, cx, cy + 6);
            break;
          case "beam":
            g.fillRect(cx - 2, cy - 7, 4, 14);
            g.lineStyle(1, color, 0.6);
            g.lineBetween(cx - 7, cy, cx - 3, cy);
            g.lineBetween(cx + 3, cy, cx + 7, cy);
            break;
          case "mine":
            g.fillCircle(cx, cy, 4);
            g.lineStyle(1, color, 1);
            for (let s = 0; s < 6; s++) {
              const a = s / 6 * Math.PI * 2;
              g.lineBetween(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
            }
            break;
          case "missile":
            g.fillTriangle(cx, cy - 7, cx - 3, cy + 4, cx + 3, cy + 4);
            break;
          case "funnel":
            g.fillStyle(color, 0.35);
            for (let s = 0; s < 6; s++) {
              const a1 = s / 6 * Math.PI * 2, a2 = (s + 1) / 6 * Math.PI * 2;
              g.fillTriangle(cx, cy, cx + Math.cos(a1) * cs * 0.38, cy + Math.sin(a1) * cs * 0.38, cx + Math.cos(a2) * cs * 0.38, cy + Math.sin(a2) * cs * 0.38);
            }
            g.lineStyle(1, color, 1);
            g.strokeCircle(cx, cy, cs * 0.38);
            break;
          case "rock":
            for (let s = 0; s < 8; s++) {
              const a1 = s / 8 * Math.PI * 2, a2 = (s + 1) / 8 * Math.PI * 2, j = s % 2 === 0 ? 0.8 : 1;
              g.fillStyle(color, 0.9);
              g.fillTriangle(cx, cy, cx + Math.cos(a1) * 5 * j, cy + Math.sin(a1) * 5 * j, cx + Math.cos(a2) * 5 * j, cy + Math.sin(a2) * 5 * j);
            }
            break;
          case "homing":
            g.fillTriangle(cx, cy - 7, cx - 3, cy + 3, cx + 3, cy + 3);
            g.lineStyle(1, color, 0.7);
            g.lineBetween(cx - 3, cy + 3, cx - 6, cy + 7);
            g.lineBetween(cx + 3, cy + 3, cx + 6, cy + 7);
            break;
        }
        const suffix = locked ? ` R${entry.round}` : "";
        this.add.text(textX, y, entry.label + suffix, {
          fontSize: "16px",
          fontFamily: "Arial",
          color: labelColor,
          fontStyle: locked ? "normal" : "bold"
        }).setOrigin(1, 0.5);
      });
    }
    createButton(label, color, onClick) {
      const w = 340, h = 90, r = 16;
      const shadow = this.add.graphics();
      shadow.fillStyle(0, 0.45);
      shadow.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, r);
      const bg = this.add.graphics();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      bg.fillStyle(16777215, 0.12);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, r);
      bg.lineStyle(2, 16777215, 0.25);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      const text = this.add.text(0, 0, label, {
        ...TEXT_STYLES.button,
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5);
      const c = this.add.container(0, 0, [shadow, bg, text]);
      c.setSize(w, h);
      c.setInteractive({ useHandCursor: true }).on("pointerover", () => {
        this.tweens.add({ targets: c, scaleX: 1.04, scaleY: 1.04, duration: 100, ease: "Quad.easeOut" });
      }).on("pointerout", () => {
        this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 100, ease: "Quad.easeOut" });
      }).on("pointerdown", () => {
        this.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
        onClick();
      });
      return c;
    }
    startBattle() {
      this.scene.start("BattleScene", { state: gameState });
    }
    update(_time, delta) {
      SFX.clearFrame();
      updateStarLayers(this.starLayers, delta / 1e3);
    }
  }
  class BattleScene extends Phaser.Scene {
    constructor() {
      super({ key: "BattleScene" });
      this.playerBlocks = [];
      this.enemyBlocks = [];
      this.projectiles = [];
      this.asteroids = [];
      this.beamCharges = [];
      this.beamCooldowns = /* @__PURE__ */ new WeakMap();
      this.funnelCooldowns = /* @__PURE__ */ new WeakMap();
      this.battleCellSize = CELL;
      this._enemyPlaced = [];
      this._enemyCoreCol = CORE_COL;
      this._enemyCoreRow = CORE_ROW;
      this.PLAYER_LANE_Y = GAME_HEIGHT * 0.75;
      this.ENEMY_LANE_Y = GAME_HEIGHT * 0.22;
      this.playerOffX = 0;
      this.playerOffY = 0;
      this.enemyOffX = 0;
      this.playerBoost = 1;
      this.enemyBoost = 1;
      this.playerBoostDirX = 0;
      this.playerBoostDirY = 0;
      this.playerBoostT = 1;
      this.enemyBoostDirX = 0;
      this.enemyBoostT = 1;
      this.playerStartBlocks = 1;
      this.enemyStartBlocks = 1;
      this.enemyTargetX = 0;
      this.enemyDodgeTimer = 0;
      this.starLayers = [];
      this.battleOver = false;
      this.playerWon = false;
      this._oLives = null;
    }
    init(data) {
      if (data == null ? void 0 : data.state) Object.assign(gameState, data.state);
    }
    create() {
      this.battleOver = false;
      this.playerWon = false;
      this.playerBlocks = [];
      this.enemyBlocks = [];
      this.projectiles = [];
      this.asteroids = [];
      this.beamCharges = [];
      this.beamCooldowns = /* @__PURE__ */ new WeakMap();
      this.funnelCooldowns = /* @__PURE__ */ new WeakMap();
      this.playerOffX = 0;
      this.playerOffY = 0;
      this.enemyOffX = 0;
      this.playerBoost = 1;
      this.enemyBoost = 1;
      this.playerBoostDirX = 0;
      this.playerBoostDirY = 0;
      this.playerBoostT = 1;
      this.enemyBoostDirX = 0;
      this.enemyBoostT = 1;
      this.battleCellSize = CELL;
      this._enemyPlaced = [];
      this._enemyCoreCol = CORE_COL;
      this._enemyCoreRow = CORE_ROW;
      const bg = this.add.graphics();
      bg.fillGradientStyle(395280, 395280, 658970, 658970, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.starLayers = initStarLayers(this, 1);
      BGM.playBattle();
      const band = this.add.graphics();
      band.fillStyle(3351040, 0.18);
      band.fillRect(0, ASTEROID_BAND_Y - ASTEROID_BAND_H, GAME_WIDTH, ASTEROID_BAND_H * 2);
      this.buildPlayerShip();
      this.buildEnemyShip();
      this.applySharedScale();
      this.playerStartBlocks = this.playerBlocks.length;
      this.enemyStartBlocks = this.enemyBlocks.length;
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };
      this.boostKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      const shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this._shiftKey = shiftKey;
      const enemyPanel = this.add.graphics().setDepth(9);
      enemyPanel.fillStyle(395280, 0.82);
      enemyPanel.fillRect(0, 0, GAME_WIDTH, 108);
      enemyPanel.lineStyle(2, 16739179, 0.35);
      enemyPanel.lineBetween(20, 106, GAME_WIDTH - 20, 106);
      const playerPanel = this.add.graphics().setDepth(9);
      playerPanel.fillStyle(395280, 0.82);
      playerPanel.fillRect(0, GAME_HEIGHT - 120, GAME_WIDTH, 120);
      playerPanel.lineStyle(2, 4513160, 0.35);
      playerPanel.lineBetween(20, GAME_HEIGHT - 118, GAME_WIDTH - 20, GAME_HEIGHT - 118);
      const roundBadge = this.add.graphics().setDepth(10);
      const badgeW = 180, badgeH = 38, badgeR = 10;
      roundBadge.fillStyle(COLORS.accent.primary, 0.15);
      roundBadge.fillRoundedRect(GAME_WIDTH / 2 - badgeW / 2, 6, badgeW, badgeH, badgeR);
      roundBadge.lineStyle(1, COLORS.accent.primary, 0.55);
      roundBadge.strokeRoundedRect(GAME_WIDTH / 2 - badgeW / 2, 6, badgeW, badgeH, badgeR);
      this.playerHpText = this.add.text(20, GAME_HEIGHT - 72, "", {
        ...TEXT_STYLES.hud,
        color: "#44dd88"
      }).setOrigin(0, 1).setDepth(10);
      this.enemyHpText = this.add.text(20, 60, "", {
        ...TEXT_STYLES.hud,
        color: "#ff6b6b"
      }).setOrigin(0, 0).setDepth(10);
      this.livesGfx = this.add.graphics().setDepth(10);
      this.add.text(GAME_WIDTH / 2, 25, `ROUND  ${gameState.round}`, {
        fontSize: "22px",
        fontFamily: "Arial",
        color: "#4ecdc4",
        fontStyle: "bold"
      }).setOrigin(0.5, 0.5).setDepth(10);
      this.playerBoostBar = this.add.graphics().setDepth(10);
      this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 44, "BOOST", {
        fontSize: "15px",
        fontFamily: "Arial",
        color: "#4ecdc4",
        fontStyle: "bold"
      }).setOrigin(1, 1).setDepth(10);
      this.add.text(20, GAME_HEIGHT - 42, "WASD / arrows  •  SPACE boost", {
        fontSize: "16px",
        fontFamily: "Arial",
        color: "#223344"
      }).setOrigin(0, 1).setDepth(10);
      const overlayPanel = this.add.graphics().setDepth(28).setVisible(false);
      overlayPanel.fillStyle(0, 0.72);
      overlayPanel.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      const cardW = 520, cardH = 280, cardR = 20;
      const cardX = GAME_WIDTH / 2 - cardW / 2;
      const cardY = GAME_HEIGHT / 2 - cardH / 2 - 30;
      overlayPanel.fillStyle(659488, 0.96);
      overlayPanel.fillRoundedRect(cardX, cardY, cardW, cardH, cardR);
      overlayPanel.lineStyle(2, COLORS.accent.primary, 0.6);
      overlayPanel.strokeRoundedRect(cardX, cardY, cardW, cardH, cardR);
      const al = 20;
      overlayPanel.lineStyle(3, COLORS.accent.primary, 0.9);
      overlayPanel.lineBetween(cardX + 10, cardY + 10, cardX + 10 + al, cardY + 10);
      overlayPanel.lineBetween(cardX + 10, cardY + 10, cardX + 10, cardY + 10 + al);
      overlayPanel.lineBetween(cardX + cardW - 10, cardY + 10, cardX + cardW - 10 - al, cardY + 10);
      overlayPanel.lineBetween(cardX + cardW - 10, cardY + 10, cardX + cardW - 10, cardY + 10 + al);
      overlayPanel.lineBetween(cardX + 10, cardY + cardH - 10, cardX + 10 + al, cardY + cardH - 10);
      overlayPanel.lineBetween(cardX + 10, cardY + cardH - 10, cardX + 10, cardY + cardH - 10 - al);
      overlayPanel.lineBetween(cardX + cardW - 10, cardY + cardH - 10, cardX + cardW - 10 - al, cardY + cardH - 10);
      overlayPanel.lineBetween(cardX + cardW - 10, cardY + cardH - 10, cardX + cardW - 10, cardY + cardH - 10 - al);
      this._overlayPanel = overlayPanel;
      this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 55, "", {
        ...TEXT_STYLES.heading,
        align: "center",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(31).setVisible(false);
      this.continueBtn = this.makeBattleButton("CONTINUE", COLORS.accent.primary, () => {
        if (!this.battleOver) return;
        if (this.playerWon) {
          this.scene.start("BuildScene", { state: gameState });
        } else if (gameState.lives > 0) {
          this.respawnPlayer();
        } else {
          gameState.placedPieces = [];
          gameState.coreCol = CORE_COL;
          gameState.coreRow = CORE_ROW;
          gameState.round = 1;
          gameState.enemyPieceCount = INITIAL_ENEMY_PIECES;
          gameState.gridCols = GRID_COLS;
          gameState.gridRows = GRID_ROWS;
          gameState.cellSize = CELL;
          gameState.lives = PLAYER_LIVES;
          gameState.playerWeaponOrder = makeWeaponOrder();
          gameState.enemyWeaponOrder = makeWeaponOrder();
          this.scene.start("BuildScene", { state: gameState });
        }
      });
      this.continueBtn.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60).setDepth(30).setVisible(false);
      this.updateHud();
      this.playerFireTimer = this.time.addEvent({
        delay: 1200,
        callback: this.playerFire,
        callbackScope: this,
        loop: true
      });
      this.enemyFireTimer = this.time.addEvent({
        delay: 1500,
        callback: this.enemyFire,
        callbackScope: this,
        loop: true
      });
      this.asteroidSpawnTimer = this.time.addEvent({
        delay: 1400,
        callback: this.spawnAsteroid,
        callbackScope: this,
        loop: true
      });
      for (let i = 0; i < ASTEROID_COUNT; i++) this.spawnAsteroid();
    }
    // ─── Ship builders ──────────────────────────────────────────────────────────
    /** Convert placedPieces into LiveBlocks centred at (cx, cy).
     *  Uses this.battleCellSize (shared across both ships) so relative sizes are preserved.
     */
    makeShipBlocks(placed, coreCol, coreRow, cx, cy, isEnemy) {
      const allAbs = [
        { col: coreCol, row: coreRow },
        ...placed.flatMap(absoluteBlocks)
      ];
      const minCol = Math.min(...allAbs.map((b) => b.col));
      const maxCol = Math.max(...allAbs.map((b) => b.col));
      const minRow = Math.min(...allAbs.map((b) => b.row));
      const maxRow = Math.max(...allAbs.map((b) => b.row));
      const cs = this.battleCellSize;
      const shipW = (maxCol - minCol + 1) * cs;
      const shipH = (maxRow - minRow + 1) * cs;
      const ox = cx - shipW / 2 - minCol * cs;
      const oy = cy - shipH / 2 - minRow * cs;
      const blocks = [];
      const cg = this.add.graphics();
      const chpBar = this.add.graphics();
      const coreBlock = {
        baseX: ox + coreCol * cs,
        baseY: oy + coreRow * cs,
        gridCol: coreCol,
        gridRow: coreRow,
        isCore: true,
        hp: BLOCK_HP * 2,
        maxHp: BLOCK_HP * 2,
        weaponType: null,
        graphics: cg,
        hpBar: chpBar,
        destroyed: false,
        disconnected: false,
        cellSize: cs
      };
      this.redrawBlock(coreBlock, 0, 0, isEnemy);
      blocks.push(coreBlock);
      for (const p of placed) {
        p.blocks.forEach((b, i) => {
          const col = p.gridCol + b.col;
          const row = p.gridRow + b.row;
          if (col === coreCol && row === coreRow) return;
          const wt = weaponTypeAtIndex(p.weapons, i);
          const g = this.add.graphics();
          const hpBar = this.add.graphics();
          const block = {
            baseX: ox + col * cs,
            baseY: oy + row * cs,
            gridCol: col,
            gridRow: row,
            isCore: false,
            hp: BLOCK_HP,
            maxHp: BLOCK_HP,
            weaponType: wt,
            graphics: g,
            hpBar,
            destroyed: false,
            disconnected: false,
            cellSize: cs
          };
          this.redrawBlock(block, 0, 0, isEnemy);
          blocks.push(block);
        });
      }
      return blocks;
    }
    /** Compute the cell size needed to fit a ship's bounding box within the zone,
     *  without actually building blocks. Never exceeds CELL. */
    computeCellSize(placed, coreCol, coreRow) {
      const allAbs = [
        { col: coreCol, row: coreRow },
        ...placed.flatMap(absoluteBlocks)
      ];
      const minCol = Math.min(...allAbs.map((b) => b.col));
      const maxCol = Math.max(...allAbs.map((b) => b.col));
      const minRow = Math.min(...allAbs.map((b) => b.row));
      const maxRow = Math.max(...allAbs.map((b) => b.row));
      const gridW = maxCol - minCol + 1;
      const gridH = maxRow - minRow + 1;
      const zoneW = GAME_WIDTH - 80;
      const zoneH = GAME_HEIGHT * 0.22 - 20;
      return Math.min(CELL, zoneW / (gridW * CELL) * CELL, zoneH / (gridH * CELL) * CELL);
    }
    buildPlayerShip() {
    }
    buildEnemyShip() {
      const pieceCount = gameState.enemyPieceCount;
      const placed = [];
      const coreCell = { col: CORE_COL, row: CORE_ROW };
      const occupied = /* @__PURE__ */ new Set();
      occupied.add(`${CORE_COL},${CORE_ROW}`);
      const frontier = [{ ...coreCell }];
      const distToCore = (b) => Math.abs(b.col - CORE_COL) + Math.abs(b.row - CORE_ROW);
      const dirs = [
        { dc: 0, dr: -1 },
        { dc: 0, dr: 1 },
        { dc: -1, dr: 0 },
        { dc: 1, dr: 0 }
      ];
      for (let i = 0; i < pieceCount; i++) {
        const piece = randomPiece(gameState.round, gameState.enemyWeaponOrder);
        let placed_ = false;
        frontier.sort((a, b) => distToCore(a) - distToCore(b));
        for (const anchor of frontier) {
          const shuffledDirs = Phaser.Utils.Array.Shuffle([...dirs]);
          for (const dir of shuffledDirs) {
            const tryCol = anchor.col + dir.dc;
            const tryRow = anchor.row + dir.dr;
            let blocks = piece.blocks;
            for (let rot = 0; rot < 4; rot++) {
              const candidate = blocks.map((b) => ({ col: tryCol + b.col, row: tryRow + b.row }));
              const overlapping = candidate.some((c) => occupied.has(`${c.col},${c.row}`));
              if (!overlapping) {
                placed.push({ gridCol: tryCol, gridRow: tryRow, blocks: blocks.map((b) => ({ ...b })), weapons: piece.weapons.map((w) => ({ ...w })) });
                for (const c of candidate) {
                  const key = `${c.col},${c.row}`;
                  if (!occupied.has(key)) {
                    occupied.add(key);
                    frontier.push({ col: c.col, row: c.row });
                  }
                }
                placed_ = true;
                break;
              }
              blocks = normalise(rotateCW(blocks));
            }
            if (placed_) break;
          }
          if (placed_) break;
        }
      }
      this._enemyPlaced = placed;
      const allCells = [
        { col: CORE_COL, row: CORE_ROW },
        ...placed.flatMap(absoluteBlocks)
      ];
      const avgCol = allCells.reduce((s, c) => s + c.col, 0) / allCells.length;
      const avgRow = allCells.reduce((s, c) => s + c.row, 0) / allCells.length;
      let bestCell = allCells[0];
      let bestDist = Infinity;
      for (const c of allCells) {
        const d = Math.hypot(c.col - avgCol, c.row - avgRow);
        if (d < bestDist) {
          bestDist = d;
          bestCell = c;
        }
      }
      this._enemyCoreCol = bestCell.col;
      this._enemyCoreRow = bestCell.row;
    }
    /** Called after both ships are generated. Computes the shared (minimum) cell size
     *  so both ships maintain their relative proportions and asteroids match. */
    applySharedScale() {
      const playerCs = gameState.placedPieces.length > 0 ? this.computeCellSize(gameState.placedPieces, gameState.coreCol, gameState.coreRow) : CELL;
      const enemyCs = this._enemyPlaced.length > 0 ? this.computeCellSize(this._enemyPlaced, this._enemyCoreCol, this._enemyCoreRow) : CELL;
      this.battleCellSize = Math.min(playerCs, enemyCs);
      if (gameState.placedPieces.length > 0) {
        this.playerBlocks = this.makeShipBlocks(
          gameState.placedPieces,
          gameState.coreCol,
          gameState.coreRow,
          GAME_WIDTH / 2,
          this.PLAYER_LANE_Y,
          false
        );
      }
      this.enemyBlocks = this.makeShipBlocks(
        this._enemyPlaced,
        this._enemyCoreCol,
        this._enemyCoreRow,
        GAME_WIDTH / 2,
        this.ENEMY_LANE_Y,
        true
      );
      this.enemyTargetX = 0;
    }
    findAttachPosition(placed, newBlocks) {
      const allCells = placed.flatMap(absoluteBlocks);
      const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
      for (let attempt = 0; attempt < 200; attempt++) {
        const anchor = allCells[Phaser.Math.Between(0, allCells.length - 1)];
        const dir = dirs[Phaser.Math.Between(0, 3)];
        const tryCol = anchor.col + dir.dc;
        const tryRow = anchor.row + dir.dr;
        const candidate = newBlocks.map((b) => ({ col: tryCol + b.col, row: tryRow + b.row }));
        if (overlaps(candidate, allCells)) continue;
        return { col: tryCol, row: tryRow };
      }
      return null;
    }
    /** Compute NeighbourMask for a block from the live block array */
    nbForBlock(block, blocks) {
      const live = /* @__PURE__ */ new Set();
      for (const b of blocks) {
        if (!b.destroyed) live.add(`${b.gridCol},${b.gridRow}`);
      }
      return nbFromSet(block.gridCol, block.gridRow, live);
    }
    /** Redraw a block's graphics and hp bar at baseX+offX, baseY+offY */
    redrawBlock(block, offX, offY, isEnemy) {
      const px = block.baseX + offX;
      const py = block.baseY + offY;
      const cs = block.cellSize;
      const fill = block.isCore ? isEnemy ? 2228275 : 6690 : isEnemy ? 8921634 : COLORS.block.placed;
      const border = block.isCore ? 65518 : isEnemy ? 14500932 : COLORS.block.border;
      const blocks = isEnemy ? this.enemyBlocks : this.playerBlocks;
      const nb = this.nbForBlock(block, blocks);
      block.graphics.clear();
      drawHullBlock(block.graphics, px, py, fill, border, 1, block.weaponType, block.isCore, cs, nb);
      block.hpBar.clear();
      const barW = cs - 8;
      const ratio = block.hp / block.maxHp;
      const barColor = ratio > 0.5 ? COLORS.hp.full : COLORS.hp.low;
      block.hpBar.fillStyle(2236962, 0.8);
      block.hpBar.fillRect(px + 4, py + cs - 10, Math.max(4, barW), 5);
      block.hpBar.fillStyle(barColor, 1);
      block.hpBar.fillRect(px + 4, py + cs - 10, Math.max(1, barW * ratio), 5);
    }
    /** Live world centre of a block, accounting for ship offset */
    blockWorldX(b, offX) {
      return b.baseX + offX + b.cellSize / 2;
    }
    blockWorldY(b, offY) {
      return b.baseY + offY + b.cellSize / 2;
    }
    /**
     * BFS from the core block through all live (non-destroyed) blocks.
     * Any block that cannot be reached is marked disconnected and destroyed.
     * Returns true if any blocks were pruned.
     */
    pruneDisconnected(blocks, offX, offY, isEnemy) {
      const live = blocks.filter((b) => !b.destroyed && !b.disconnected);
      const core = live.find((b) => b.isCore);
      if (!core) return false;
      const visited = /* @__PURE__ */ new Set();
      const queue = [core];
      visited.add(core);
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const nb of live) {
          if (visited.has(nb)) continue;
          const dc = Math.abs(nb.gridCol - cur.gridCol);
          const dr = Math.abs(nb.gridRow - cur.gridRow);
          if (dc === 1 && dr === 0 || dc === 0 && dr === 1) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      let pruned = false;
      for (const b of live) {
        if (!visited.has(b)) {
          b.disconnected = true;
          b.destroyed = true;
          const wx = this.blockWorldX(b, offX);
          const wy = this.blockWorldY(b, offY);
          b.graphics.destroy();
          b.hpBar.destroy();
          drawMechaExplosion(this, wx, wy, b.cellSize * 0.65, 16746564, 260);
          pruned = true;
        }
      }
      return pruned;
    }
    /** True if this ship has no remaining live weapon blocks (mercy rule) */
    shipDisarmed(blocks) {
      return blocks.every((b) => b.destroyed || b.weaponType === null);
    }
    // ─── Weapons ─────────────────────────────────────────────────────────────────
    playerFire() {
      if (this.battleOver) return;
      for (const b of this.playerBlocks) {
        if (!b.destroyed && b.weaponType !== null)
          this.fireWeapon(b, this.playerOffX, this.playerOffY, this.enemyBlocks, this.enemyOffX, 0, true);
      }
    }
    enemyFire() {
      if (this.battleOver) return;
      for (const b of this.enemyBlocks) {
        if (!b.destroyed && b.weaponType !== null)
          this.fireWeapon(b, this.enemyOffX, 0, this.playerBlocks, this.playerOffX, this.playerOffY, false);
      }
    }
    fireWeapon(shooter, sOffX, sOffY, targets, tOffX, tOffY, isPlayer) {
      const sx = this.blockWorldX(shooter, sOffX);
      const sy = this.blockWorldY(shooter, sOffY);
      const alive = targets.filter((t) => !t.destroyed);
      if (alive.length === 0) return;
      const wt = shooter.weaponType;
      if (wt === "beam") {
        const now = this.time.now / 1e3;
        const lastFired = this.beamCooldowns.get(shooter) ?? 0;
        if (now - lastFired < BEAM_COOLDOWN) return;
        if (this.beamCharges.some((bc) => bc.shooter === shooter && !bc.fired)) return;
        const cg = this.add.graphics();
        this.beamCharges.push({
          shooter,
          targets,
          tOffX,
          tOffY,
          isPlayer,
          timer: BEAM_CHARGE_TIME,
          graphics: cg,
          fired: false
        });
        SFX.play("fire_beam");
        return;
      }
      if (wt === "funnel") {
        const now = this.time.now / 1e3;
        const lastReleased = this.funnelCooldowns.get(shooter) ?? 0;
        if (now - lastReleased < FUNNEL_RELEASE_RATE) return;
        this.funnelCooldowns.set(shooter, now);
        const dir2 = isPlayer ? -1 : 1;
        const g2 = this.add.graphics();
        this.projectiles.push({
          x: sx,
          y: sy,
          vx: 0,
          vy: dir2 * FUNNEL_SPEED,
          damage: 0,
          weaponType: "funnel",
          isPlayer,
          graphics: g2,
          destroyed: false,
          funnelFireTimer: FUNNEL_FIRE_RATE,
          funnelTargets: targets,
          funnelTOffX: tOffX,
          funnelTOffY: tOffY
        });
        SFX.play("fire_funnel");
        return;
      }
      const dir = isPlayer ? -1 : 1;
      let vx = 0, vy = 0;
      let damage = GUN_DAMAGE;
      let accel;
      let radius;
      let hp;
      switch (wt) {
        case "gun":
          vx = 0;
          vy = dir * BULLET_SPEED;
          damage = GUN_DAMAGE;
          break;
        case "laser": {
          let nearestDist = Infinity, nx = sx, ny = sy;
          for (const t of alive) {
            const tx = this.blockWorldX(t, tOffX);
            const ty = this.blockWorldY(t, tOffY);
            const d = Math.hypot(tx - sx, ty - sy);
            if (d < nearestDist) {
              nearestDist = d;
              nx = tx;
              ny = ty;
            }
          }
          const ang = Math.atan2(ny - sy, nx - sx);
          vx = Math.cos(ang) * LASER_SPEED;
          vy = Math.sin(ang) * LASER_SPEED;
          damage = LASER_DAMAGE;
          break;
        }
        case "mine":
          vx = 0;
          vy = dir * Phaser.Math.FloatBetween(MINE_SPEED_MIN, MINE_SPEED_MAX);
          damage = MINE_DAMAGE;
          radius = MINE_RADIUS;
          hp = MINE_HP;
          break;
        case "missile":
          vx = 0;
          vy = dir * MISSILE_SPEED_MIN;
          damage = MISSILE_DAMAGE;
          accel = MISSILE_ACCEL;
          radius = MISSILE_RADIUS;
          break;
        case "rock":
          vx = 0;
          vy = dir * ROCK_SPEED;
          damage = ROCK_DAMAGE;
          radius = ROCK_RADIUS;
          hp = ROCK_HP;
          break;
        case "homing": {
          vx = 0;
          vy = dir * HOMING_SPEED_MIN;
          damage = HOMING_DAMAGE;
          accel = HOMING_ACCEL;
          break;
        }
      }
      const g = this.add.graphics();
      const proj = {
        x: sx,
        y: sy,
        vx,
        vy,
        damage,
        weaponType: wt,
        isPlayer,
        graphics: g,
        destroyed: false
      };
      if (accel !== void 0) proj.accel = accel;
      if (radius !== void 0) proj.radius = radius;
      if (hp !== void 0) {
        proj.hp = hp;
        proj.maxHp = hp;
      }
      if (wt === "homing") {
        proj.homingBlocks = targets;
        proj.homingOffX = tOffX;
        proj.homingOffY = tOffY;
      }
      SFX.play(`fire_${wt}`);
      this.projectiles.push(proj);
      this.drawProjectile(proj);
    }
    // ── Beam charge telegraph & fire ──────────────────────────────────────────
    updateBeamCharges(dt) {
      for (let i = this.beamCharges.length - 1; i >= 0; i--) {
        const bc = this.beamCharges[i];
        if (bc.shooter.destroyed) {
          bc.graphics.destroy();
          this.beamCharges.splice(i, 1);
          continue;
        }
        bc.timer -= dt;
        const sOffX = bc.isPlayer ? this.playerOffX : this.enemyOffX;
        const sOffY = bc.isPlayer ? this.playerOffY : 0;
        const sx = this.blockWorldX(bc.shooter, sOffX);
        const sy = this.blockWorldY(bc.shooter, sOffY);
        bc.graphics.clear();
        const progress = 1 - Math.max(0, bc.timer / BEAM_CHARGE_TIME);
        const beamColor = COLORS.weapon.beam;
        const r = bc.shooter.cellSize * (0.3 + progress * 0.5);
        bc.graphics.lineStyle(3, beamColor, 0.4 + progress * 0.5);
        bc.graphics.strokeCircle(sx, sy, r);
        bc.graphics.fillStyle(beamColor, 0.06 + progress * 0.1);
        bc.graphics.fillCircle(sx, sy, r);
        const previewY1 = bc.isPlayer ? 0 : sy;
        const previewY2 = bc.isPlayer ? sy : GAME_HEIGHT;
        bc.graphics.lineStyle(Math.max(1, BEAM_WIDTH * 0.4), beamColor, 0.08 + progress * 0.18);
        bc.graphics.lineBetween(sx, previewY1, sx, previewY2);
        if (bc.timer <= 0 && !bc.fired) {
          bc.fired = true;
          this.fireBeamInstant(bc, sOffX, sOffY);
          bc.graphics.destroy();
          this.beamCharges.splice(i, 1);
          this.beamCooldowns.set(bc.shooter, this.time.now / 1e3);
        }
      }
    }
    fireBeamInstant(bc, sOffX, sOffY) {
      const sx = this.blockWorldX(bc.shooter, sOffX);
      const sy = this.blockWorldY(bc.shooter, sOffY);
      const beamX = sx;
      const beamY1 = bc.isPlayer ? 0 : sy;
      const beamY2 = bc.isPlayer ? sy : GAME_HEIGHT;
      const beamColor = COLORS.weapon.beam;
      const flash = this.add.graphics();
      flash.fillStyle(beamColor, 0.9);
      flash.fillRect(beamX - BEAM_WIDTH / 2, beamY1, BEAM_WIDTH, beamY2 - beamY1);
      flash.lineStyle(Math.max(2, BEAM_WIDTH * 0.3), 16777215, 0.85);
      flash.lineBetween(beamX, beamY1, beamX, beamY2);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 300,
        ease: "Quad.easeIn",
        onComplete: () => flash.destroy()
      });
      const liveTOffX = bc.isPlayer ? this.enemyOffX : this.playerOffX;
      const liveTOffY = bc.isPlayer ? 0 : this.playerOffY;
      for (const t of bc.targets) {
        if (t.destroyed || t.isCore) continue;
        const tx = this.blockWorldX(t, liveTOffX);
        if (Math.abs(tx - beamX) < BEAM_WIDTH / 2 + t.cellSize * 0.5) {
          t.hp -= BEAM_DAMAGE;
          if (t.hp <= 0) {
            t.hp = 0;
            t.destroyed = true;
            t.graphics.destroy();
            t.hpBar.destroy();
            drawMechaExplosion(this, this.blockWorldX(t, liveTOffX), this.blockWorldY(t, liveTOffY), t.cellSize * 0.7, beamColor, 280);
            SFX.play("hit_beam");
            SFX.play("explosion");
          } else {
            this.redrawBlock(t, liveTOffX, liveTOffY, !bc.isPlayer);
          }
        }
      }
      if (bc.isPlayer) this.pruneDisconnected(bc.targets, liveTOffX, liveTOffY, true);
      else this.pruneDisconnected(bc.targets, liveTOffX, liveTOffY, false);
      this.updateHud();
    }
    drawProjectile(p) {
      p.graphics.clear();
      const g = p.graphics;
      const x = p.x, y = p.y;
      switch (p.weaponType) {
        case "gun": {
          const ang = Math.atan2(p.vy, p.vx);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          g.fillStyle(COLORS.weapon.gun, 0.22);
          g.fillCircle(x, y, 11);
          g.fillStyle(COLORS.weapon.gun, 1);
          g.fillRect(x - ca * 10 - Math.abs(sa) * 3, y - sa * 10 - Math.abs(ca) * 3, Math.abs(ca) * 20 + 6, Math.abs(sa) * 20 + 6);
          g.fillStyle(16777215, 0.95);
          g.fillCircle(x, y, 3);
          g.fillStyle(16777215, 0.7);
          g.fillCircle(x + ca * 9, y + sa * 9, 2);
          break;
        }
        case "laser": {
          const ang = Math.atan2(p.vy, p.vx);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const len = 28;
          g.lineStyle(10, COLORS.weapon.laser, 0.2);
          g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
          g.lineStyle(5, COLORS.weapon.laser, 0.7);
          g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
          g.lineStyle(2, 16720418, 1);
          g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
          g.fillStyle(16746632, 0.9);
          g.fillCircle(x + ca * len / 2, y + sa * len / 2, 2.5);
          break;
        }
        case "mine": {
          const r = p.radius ?? MINE_RADIUS;
          const ratio = (p.hp ?? 1) / (p.maxHp ?? 1);
          g.fillStyle(COLORS.weapon.mine, 0.15);
          g.fillCircle(x, y, r + 6);
          g.fillStyle(blendToward(2232576, COLORS.weapon.mine, 0.4), 1);
          g.fillCircle(x, y, r);
          g.lineStyle(2, COLORS.weapon.mine, 1);
          g.strokeCircle(x, y, r);
          g.lineStyle(1, 16755200, 0.7);
          g.strokeCircle(x, y, r * 0.6);
          const spikeLen = 5 + ratio * 5;
          for (let s = 0; s < 8; s++) {
            const a = s / 8 * Math.PI * 2;
            g.lineStyle(2, COLORS.weapon.mine, 0.85);
            g.lineBetween(
              x + Math.cos(a) * r,
              y + Math.sin(a) * r,
              x + Math.cos(a) * (r + spikeLen),
              y + Math.sin(a) * (r + spikeLen)
            );
            g.fillStyle(16746496, 1);
            g.fillCircle(x + Math.cos(a) * (r + spikeLen), y + Math.sin(a) * (r + spikeLen), 1.5);
          }
          g.fillStyle(16720384, 1);
          g.fillCircle(x, y, r * 0.25);
          break;
        }
        case "missile": {
          const speed = Math.hypot(p.vx, p.vy);
          const ang = Math.atan2(p.vy, p.vx);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const nx = -sa, ny = ca;
          const bodyLen = 18 + Math.min(speed / 60, 14);
          const tipX = x + ca * bodyLen, tipY = y + sa * bodyLen;
          const baseX = x - ca * bodyLen * 0.5, baseY = y - sa * bodyLen * 0.5;
          g.fillStyle(16737792, 0.35);
          g.fillCircle(baseX - ca * 5, baseY - sa * 5, 9);
          const fw = 7;
          g.fillStyle(13391104, 1);
          g.fillTriangle(
            baseX,
            baseY,
            baseX + nx * fw,
            baseY + ny * fw,
            baseX - ca * 10,
            baseY - sa * 10
          );
          g.fillTriangle(
            baseX,
            baseY,
            baseX - nx * fw,
            baseY - ny * fw,
            baseX - ca * 10,
            baseY - sa * 10
          );
          g.fillStyle(COLORS.weapon.missile, 1);
          g.fillTriangle(
            tipX,
            tipY,
            baseX + nx * 4,
            baseY + ny * 4,
            baseX - nx * 4,
            baseY - ny * 4
          );
          g.fillStyle(16772744, 1);
          g.fillCircle(tipX, tipY, 3);
          g.fillStyle(16772608, 0.9);
          g.fillCircle(baseX - ca * 4, baseY - sa * 4, 4);
          g.fillStyle(16777215, 0.7);
          g.fillCircle(baseX - ca * 3, baseY - sa * 3, 2);
          break;
        }
        case "funnel": {
          const r = 9;
          g.fillStyle(COLORS.weapon.funnel, 0.18);
          g.fillCircle(x, y, r + 5);
          g.fillStyle(blendToward(2228292, COLORS.weapon.funnel, 0.35), 1);
          for (let s = 0; s < 6; s++) {
            const a1 = s / 6 * Math.PI * 2;
            const a2 = (s + 1) / 6 * Math.PI * 2;
            g.fillTriangle(
              x,
              y,
              x + Math.cos(a1) * r,
              y + Math.sin(a1) * r,
              x + Math.cos(a2) * r,
              y + Math.sin(a2) * r
            );
          }
          g.lineStyle(2, COLORS.weapon.funnel, 1);
          for (let s = 0; s < 6; s++) {
            const a1 = s / 6 * Math.PI * 2;
            const a2 = (s + 1) / 6 * Math.PI * 2;
            g.lineBetween(
              x + Math.cos(a1) * r,
              y + Math.sin(a1) * r,
              x + Math.cos(a2) * r,
              y + Math.sin(a2) * r
            );
          }
          g.fillStyle(COLORS.weapon.funnel, 1);
          for (let s = 0; s < 6; s++) {
            const a = s / 6 * Math.PI * 2;
            g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2);
          }
          g.fillStyle(16777215, 0.85);
          g.fillCircle(x, y, 3);
          g.fillStyle(COLORS.weapon.funnel, 0.6);
          g.fillCircle(x, y, 2);
          break;
        }
        case "rock": {
          const r = p.radius ?? ROCK_RADIUS;
          const ratio = (p.hp ?? ROCK_HP) / (p.maxHp ?? ROCK_HP);
          const wColor = COLORS.weapon.rock;
          const darkBody = blendToward(wColor, 0, 0.45);
          const rimCol = blendToward(wColor, 16777215, 0.4);
          g.fillStyle(0, 0.3);
          g.fillCircle(x + 2, y + 3, r);
          g.fillStyle(darkBody, 1);
          for (let s = 0; s < 8; s++) {
            const a1 = s / 8 * Math.PI * 2;
            const a2 = (s + 1) / 8 * Math.PI * 2;
            const j = s % 2 === 0 ? 0.78 : 1;
            g.fillTriangle(
              x,
              y,
              x + Math.cos(a1) * r * j,
              y + Math.sin(a1) * r * j,
              x + Math.cos(a2) * r * j,
              y + Math.sin(a2) * r * j
            );
          }
          g.lineStyle(2, rimCol, 0.6);
          g.strokeCircle(x, y, r);
          g.lineStyle(1, blendToward(3346688, 16737792, 1 - ratio), 0.55 + (1 - ratio) * 0.4);
          g.lineBetween(x - r * 0.35, y - r * 0.45, x + r * 0.25, y + r * 0.35);
          g.lineBetween(x + r * 0.3, y - r * 0.25, x - r * 0.15, y + r * 0.4);
          g.fillStyle(rimCol, 0.55);
          g.fillCircle(x - r * 0.2, y - r * 0.2, r * 0.18);
          break;
        }
        case "homing": {
          const ang = Math.atan2(p.vy, p.vx);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const nx = -sa, ny = ca;
          const bodyLen = 22;
          const tipX = x + ca * bodyLen, tipY = y + sa * bodyLen;
          const baseX = x - ca * bodyLen * 0.45, baseY = y - sa * bodyLen * 0.45;
          g.fillStyle(COLORS.weapon.homing, 0.18);
          g.fillCircle(baseX, baseY, 10);
          g.fillStyle(blendToward(3342370, COLORS.weapon.homing, 0.5), 1);
          g.fillTriangle(
            tipX,
            tipY,
            baseX + nx * 8,
            baseY + ny * 8,
            baseX - nx * 8,
            baseY - ny * 8
          );
          g.lineStyle(2, COLORS.weapon.homing, 0.9);
          g.lineBetween(tipX, tipY, baseX + nx * 8, baseY + ny * 8);
          g.lineBetween(tipX, tipY, baseX - nx * 8, baseY - ny * 8);
          g.lineBetween(baseX + nx * 8, baseY + ny * 8, baseX - nx * 8, baseY - ny * 8);
          g.lineStyle(1.5, COLORS.weapon.homing, 0.6);
          g.lineBetween(baseX + nx * 8, baseY + ny * 8, baseX - ca * 8 + nx * 12, baseY - sa * 8 + ny * 12);
          g.lineBetween(baseX - nx * 8, baseY - ny * 8, baseX - ca * 8 - nx * 12, baseY - sa * 8 - ny * 12);
          g.fillStyle(COLORS.weapon.homing, 1);
          g.fillCircle(tipX, tipY, 4);
          g.fillStyle(16777215, 0.9);
          g.fillCircle(tipX, tipY, 2);
          g.lineStyle(1, COLORS.weapon.homing, 0.5);
          g.strokeCircle(x, y, 12);
          break;
        }
      }
    }
    // ─── Asteroids ──────────────────────────────────────────────────────────────
    spawnAsteroid() {
      if (this.battleOver) return;
      const scale = this.battleCellSize / CELL;
      const targetCount = Math.round(ASTEROID_COUNT / Math.max(0.3, scale));
      const live = this.asteroids.filter((a) => !a.destroyed).length;
      if (live >= targetCount) return;
      const baseR = Phaser.Math.Between(ASTEROID_RADIUS_MIN, ASTEROID_RADIUS_MAX);
      const r = Math.max(8, Math.round(baseR * scale));
      const vx = Phaser.Math.Between(ASTEROID_SPEED_MIN, ASTEROID_SPEED_MAX) * (Math.random() < 0.5 ? 1 : -1);
      const x = vx > 0 ? -r - 10 : GAME_WIDTH + r + 10;
      const y = Phaser.Math.Clamp(
        ASTEROID_BAND_Y + Phaser.Math.Between(-ASTEROID_BAND_H, ASTEROID_BAND_H),
        ASTEROID_BAND_Y - ASTEROID_BAND_H + r,
        ASTEROID_BAND_Y + ASTEROID_BAND_H - r
      );
      const g = this.add.graphics();
      const astSeed = Phaser.Math.Between(0, 9999);
      const ast = { x, y, vx, radius: r, hp: ASTEROID_HP, maxHp: ASTEROID_HP, seed: astSeed, graphics: g, destroyed: false };
      this.drawAsteroid(ast);
      this.asteroids.push(ast);
    }
    drawAsteroid(a) {
      a.graphics.clear();
      const g = a.graphics;
      const x = a.x, y = a.y, r = a.radius;
      const ratio = a.hp / a.maxHp;
      const seed = a.seed % 100;
      const facets = 9;
      const baseCol = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(8017203),
        Phaser.Display.Color.ValueToColor(14496529),
        100,
        Math.floor((1 - ratio) * 100)
      );
      const bodyCol = Phaser.Display.Color.GetColor(baseCol.r, baseCol.g, baseCol.b);
      g.fillStyle(0, 0.35);
      g.fillCircle(x + 2, y + 3, r);
      const pts = [];
      for (let i = 0; i < facets; i++) {
        const baseAng = i / facets * Math.PI * 2;
        const jitter = 0.72 + 0.28 * Math.sin((seed + i * 37) * 0.9);
        pts.push({ x: x + Math.cos(baseAng) * r * jitter, y: y + Math.sin(baseAng) * r * jitter });
      }
      g.fillStyle(bodyCol, 1);
      g.fillPoints(pts, true);
      const innerPts = [];
      for (let i = 0; i < facets; i++) {
        const baseAng = i / facets * Math.PI * 2 + 0.18;
        const jitter = 0.42 + 0.22 * Math.sin((seed + i * 53) * 1.1);
        innerPts.push({ x: x + Math.cos(baseAng) * r * jitter, y: y + Math.sin(baseAng) * r * jitter });
      }
      const darkFacet = Phaser.Display.Color.GetColor(
        Math.floor(baseCol.r * 0.55),
        Math.floor(baseCol.g * 0.55),
        Math.floor(baseCol.b * 0.55)
      );
      g.fillStyle(darkFacet, 0.8);
      g.fillPoints(innerPts, true);
      const rimCol = Phaser.Display.Color.GetColor(
        Math.min(255, Math.floor(baseCol.r * 1.55 + 30)),
        Math.min(255, Math.floor(baseCol.g * 1.4 + 20)),
        Math.min(255, Math.floor(baseCol.b * 1.2 + 10))
      );
      g.lineStyle(Math.max(1, r * 0.06), rimCol, 0.55);
      const hlPts = [];
      for (let i = 0; i <= 6; i++) {
        const a2 = Math.PI * (0.85 + i * 0.08);
        hlPts.push({ x: x + Math.cos(a2) * r * 0.9, y: y + Math.sin(a2) * r * 0.9 });
      }
      g.strokePoints(hlPts, false);
      g.lineStyle(Math.max(1, r * 0.04), 2232576, 0.9);
      g.strokePoints(pts, true);
      const craterCount = Math.max(1, Math.min(3, Math.floor(r / 10)));
      for (let i = 0; i < craterCount; i++) {
        const ca = (seed * 0.11 + i * 2.1) % (Math.PI * 2);
        const cd = r * (0.25 + (seed % 17 + i * 11) % 20 / 60);
        const cr = Math.max(2, r * (0.12 + i * 0.06));
        const cx2 = x + Math.cos(ca) * cd;
        const cy2 = y + Math.sin(ca) * cd;
        g.fillStyle(0, 0.35);
        g.fillCircle(cx2, cy2, cr);
        g.lineStyle(1, rimCol, 0.28);
        g.strokeCircle(cx2 - cr * 0.15, cy2 - cr * 0.15, cr * 0.7);
      }
      if (ratio < 0.65) {
        const crackAlpha = 0.55 + (1 - ratio) * 0.4;
        g.lineStyle(1, 1115392, crackAlpha);
        g.lineBetween(x - r * 0.25, y - r * 0.45, x + r * 0.2, y + r * 0.38);
        g.lineBetween(x + r * 0.38, y - r * 0.28, x - r * 0.15, y + r * 0.48);
        if (ratio < 0.35) {
          g.lineStyle(1, 16737792, 0.6);
          g.lineBetween(x - r * 0.1, y - r * 0.5, x + r * 0.35, y + r * 0.3);
        }
      }
    }
    // ─── Enemy AI ──────────────────────────────────────────────────────────────────
    updateEnemyAI(dt) {
      if (this.battleOver) return;
      this.enemyBoost = Math.min(1, this.enemyBoost + BOOST_REGEN * dt);
      const speedMult = this.underdogMult(this.enemyBlocks, this.enemyStartBlocks);
      if (this.enemyBoost >= BOOST_COST && this.enemyBoostT >= 1) {
        const enemyY = this.ENEMY_LANE_Y;
        for (const p of this.projectiles) {
          if (p.destroyed || !p.isPlayer || p.vy >= 0) continue;
          const t = (enemyY - p.y) / p.vy;
          if (t > 0 && t < 0.6) {
            const impactX = p.x + p.vx * t;
            const enemyCx2 = GAME_WIDTH / 2 + this.enemyOffX;
            if (Math.abs(impactX - enemyCx2) < this.battleCellSize * 2) {
              this.enemyBoost -= BOOST_COST;
              this.enemyBoostDirX = impactX < enemyCx2 ? 1 : -1;
              this.enemyBoostT = 0;
              SFX.play("boost");
              break;
            }
          }
        }
      }
      if (this.enemyBoostT < 1) {
        const prevT = this.enemyBoostT;
        this.enemyBoostT = Math.min(1, prevT + dt / BOOST_DURATION);
        const prevEase = 1 - (1 - prevT) * (1 - prevT);
        const newEase = 1 - (1 - this.enemyBoostT) * (1 - this.enemyBoostT);
        this.enemyOffX += this.enemyBoostDirX * (newEase - prevEase) * BOOST_DISTANCE;
      }
      this.enemyDodgeTimer -= dt;
      if (this.enemyDodgeTimer <= 0) {
        this.pickEnemyTarget();
        this.enemyDodgeTimer = Phaser.Math.FloatBetween(0.8, 2);
      }
      const enemyCx = GAME_WIDTH / 2 + this.enemyOffX;
      const dx = this.enemyTargetX - enemyCx;
      if (Math.abs(dx) > 4) {
        const step = Math.sign(dx) * ENEMY_SPEED * speedMult * dt;
        this.enemyOffX += Math.abs(step) < Math.abs(dx) ? step : dx;
      }
      const maxOff = GAME_WIDTH / 2 - ENEMY_BOUNDS_PAD;
      this.enemyOffX = Phaser.Math.Clamp(this.enemyOffX, -maxOff, maxOff);
    }
    pickEnemyTarget() {
      const playerCx = GAME_WIDTH / 2 + this.playerOffX;
      const incomingX = [];
      for (const p of this.projectiles) {
        if (p.destroyed || p.isPlayer) continue;
        if (p.vy < 0) continue;
        const enemyY = this.ENEMY_LANE_Y;
        if (p.vy !== 0) {
          const t = (enemyY - p.y) / p.vy;
          if (t > 0 && t < 3) incomingX.push(p.x + p.vx * t);
        }
      }
      for (const p of this.projectiles) {
        if (p.destroyed || !p.isPlayer) continue;
        const enemyY = this.ENEMY_LANE_Y;
        if (p.vy < 0) {
          const t = (enemyY - p.y) / p.vy;
          if (t > 0 && t < 3) incomingX.push(p.x + p.vx * t);
        }
      }
      const liveAsteroids = this.asteroids.filter((a) => !a.destroyed);
      GAME_WIDTH / 2 + this.enemyOffX;
      const candidates = [playerCx, playerCx - 80, playerCx + 80, GAME_WIDTH * 0.25, GAME_WIDTH * 0.5, GAME_WIDTH * 0.75];
      let bestScore = -Infinity;
      let bestX = playerCx;
      for (const cx of candidates) {
        if (cx < ENEMY_BOUNDS_PAD || cx > GAME_WIDTH - ENEMY_BOUNDS_PAD) continue;
        let score = 0;
        score -= Math.abs(cx - playerCx) * 0.5;
        for (const ix of incomingX) {
          if (Math.abs(cx - ix) < CELL * 1.5) score -= 200;
        }
        const shotBlocked = liveAsteroids.some((a) => {
          const dx = playerCx - cx;
          const dy = this.PLAYER_LANE_Y - this.ENEMY_LANE_Y;
          const len = Math.hypot(dx, dy);
          if (len === 0) return false;
          const t = Phaser.Math.Clamp(((a.x - cx) * dx + (a.y - this.ENEMY_LANE_Y) * dy) / (len * len), 0, 1);
          const closestX = cx + t * dx;
          const closestY = this.ENEMY_LANE_Y + t * dy;
          return Math.hypot(closestX - a.x, closestY - a.y) < a.radius + CELL * 0.6;
        });
        if (shotBlocked) score -= 120;
        score += Phaser.Math.FloatBetween(-20, 20);
        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
        }
      }
      this.enemyTargetX = Phaser.Math.Clamp(bestX, ENEMY_BOUNDS_PAD, GAME_WIDTH - ENEMY_BOUNDS_PAD);
    }
    // ─── Player input ───────────────────────────────────────────────────────────
    /** Returns a speed multiplier based on how many blocks remain (underdog rule).
     *  At full health: 1x. At 0 blocks: UNDERDOG_SPEED_MAX x. */
    underdogMult(blocks, startCount) {
      const alive = blocks.filter((b) => !b.destroyed).length;
      const ratio = startCount > 0 ? alive / startCount : 1;
      return 1 + (UNDERDOG_SPEED_MAX - 1) * (1 - ratio);
    }
    updatePlayerMovement(dt) {
      if (this.battleOver) return;
      const speedMult = this.underdogMult(this.playerBlocks, this.playerStartBlocks);
      const speed = PLAYER_SPEED * speedMult;
      const left = this.cursors.left.isDown || this.wasd.left.isDown;
      const right = this.cursors.right.isDown || this.wasd.right.isDown;
      const up = this.cursors.up.isDown || this.wasd.up.isDown;
      const down = this.cursors.down.isDown || this.wasd.down.isDown;
      if (left) this.playerOffX -= speed * dt;
      if (right) this.playerOffX += speed * dt;
      if (up) this.playerOffY -= speed * dt;
      if (down) this.playerOffY += speed * dt;
      const shiftKey = this._shiftKey;
      const boostJustPressed = Phaser.Input.Keyboard.JustDown(this.boostKey) || Phaser.Input.Keyboard.JustDown(shiftKey);
      const bx = right ? 1 : left ? -1 : 0;
      const by = down ? 1 : up ? -1 : 0;
      const anyDir = bx !== 0 || by !== 0;
      if (boostJustPressed && anyDir && this.playerBoost >= BOOST_COST && this.playerBoostT >= 1) {
        this.playerBoost -= BOOST_COST;
        const len = Math.hypot(bx, by);
        this.playerBoostDirX = bx / len;
        this.playerBoostDirY = by / len;
        this.playerBoostT = 0;
        SFX.play("boost");
      }
      if (this.playerBoostT < 1) {
        const prevT = this.playerBoostT;
        this.playerBoostT = Math.min(1, prevT + dt / BOOST_DURATION);
        const prevEase = 1 - (1 - prevT) * (1 - prevT);
        const newEase = 1 - (1 - this.playerBoostT) * (1 - this.playerBoostT);
        const delta = (newEase - prevEase) * BOOST_DISTANCE;
        this.playerOffX += this.playerBoostDirX * delta;
        this.playerOffY += this.playerBoostDirY * delta;
      }
      this.playerBoost = Math.min(1, this.playerBoost + BOOST_REGEN * dt);
      const maxX = GAME_WIDTH / 2 - PLAYER_BOUNDS_PAD;
      const maxY = 120;
      this.playerOffX = Phaser.Math.Clamp(this.playerOffX, -maxX, maxX);
      this.playerOffY = Phaser.Math.Clamp(this.playerOffY, -maxY, maxY);
      this.playerBoostBar.clear();
      const barX = GAME_WIDTH - 20, barY = GAME_HEIGHT - 30;
      const bw = 170, bh = 10;
      this.playerBoostBar.fillStyle(662036, 1);
      this.playerBoostBar.fillRoundedRect(barX - bw, barY, bw, bh, 5);
      this.playerBoostBar.lineStyle(1, 1722936, 1);
      this.playerBoostBar.strokeRoundedRect(barX - bw, barY, bw, bh, 5);
      const fillColor = this.playerBoost >= BOOST_COST ? 5164484 : 1725764;
      const fillW = Math.max(0, bw * this.playerBoost);
      this.playerBoostBar.fillStyle(fillColor, 1);
      this.playerBoostBar.fillRoundedRect(barX - bw, barY, fillW, bh, 5);
      if (fillW > 6) {
        this.playerBoostBar.fillStyle(16777215, 0.18);
        this.playerBoostBar.fillRoundedRect(barX - bw, barY, fillW, bh / 2, 5);
      }
    }
    // ─── Update loop ──────────────────────────────────────────────────────────
    update(_time, delta) {
      const dt = delta / 1e3;
      SFX.clearFrame();
      updateStarLayers(this.starLayers, dt);
      if (this.battleOver) return;
      this.updatePlayerMovement(dt);
      this.updateEnemyAI(dt);
      this.updateBeamCharges(dt);
      for (const b of this.playerBlocks) {
        if (!b.destroyed) this.redrawBlock(b, this.playerOffX, this.playerOffY, false);
      }
      for (const b of this.enemyBlocks) {
        if (!b.destroyed) this.redrawBlock(b, this.enemyOffX, 0, true);
      }
      for (const p of this.projectiles) {
        if (p.destroyed) continue;
        if (p.weaponType === "missile" && p.accel !== void 0) {
          const spd = Math.hypot(p.vx, p.vy);
          const dir = Math.atan2(p.vy, p.vx);
          const newSpd = spd + p.accel * dt;
          p.vx = Math.cos(dir) * newSpd;
          p.vy = Math.sin(dir) * newSpd;
        }
        if (p.weaponType === "homing" && p.accel !== void 0 && p.homingBlocks) {
          const spd = Math.hypot(p.vx, p.vy);
          const curDir = Math.atan2(p.vy, p.vx);
          const newSpd = Math.min(spd + p.accel * dt, LASER_SPEED * 1.1);
          const pool = p.homingBlocks.filter((b) => !b.destroyed);
          const tOffX2 = p.homingOffX ?? 0;
          const tOffY2 = p.homingOffY ?? 0;
          let nearX = p.x + Math.cos(curDir) * 200;
          let nearY = p.y + Math.sin(curDir) * 200;
          let nearDist = Infinity;
          for (const t of pool) {
            const tx = this.blockWorldX(t, tOffX2);
            const ty = this.blockWorldY(t, tOffY2);
            const priority = t.isCore ? 1e3 : 0;
            const d = Math.hypot(tx - p.x, ty - p.y) + priority;
            if (d < nearDist) {
              nearDist = d;
              nearX = tx;
              nearY = ty;
            }
          }
          if (nearDist > HOMING_LOCK_DIST) {
            const desiredDir = Math.atan2(nearY - p.y, nearX - p.x);
            let dAngle = desiredDir - curDir;
            while (dAngle > Math.PI) dAngle -= Math.PI * 2;
            while (dAngle < -Math.PI) dAngle += Math.PI * 2;
            const maxTurn = HOMING_TURN_SPEED * dt;
            const turn = Phaser.Math.Clamp(dAngle, -maxTurn, maxTurn);
            const newDir = curDir + turn;
            p.vx = Math.cos(newDir) * newSpd;
            p.vy = Math.sin(newDir) * newSpd;
          } else {
            p.vx = Math.cos(curDir) * newSpd;
            p.vy = Math.sin(curDir) * newSpd;
          }
        }
        if (p.weaponType === "funnel") {
          p.funnelFireTimer = (p.funnelFireTimer ?? FUNNEL_FIRE_RATE) - dt;
          if (p.funnelFireTimer <= 0) {
            p.funnelFireTimer = FUNNEL_FIRE_RATE;
            const tgts = (p.funnelTargets ?? []).filter((t) => !t.destroyed);
            if (tgts.length > 0) {
              const tOffX2 = p.funnelTOffX ?? 0;
              const tOffY2 = p.funnelTOffY ?? 0;
              let nearDist = Infinity;
              let nx = p.x, ny = p.y;
              for (const t of tgts) {
                const tx = this.blockWorldX(t, tOffX2);
                const ty = this.blockWorldY(t, tOffY2);
                const d = Math.hypot(tx - p.x, ty - p.y);
                if (d < nearDist) {
                  nearDist = d;
                  nx = tx;
                  ny = ty;
                }
              }
              const ang = Math.atan2(ny - p.y, nx - p.x);
              const lg = this.add.graphics();
              this.projectiles.push({
                x: p.x,
                y: p.y,
                vx: Math.cos(ang) * LASER_SPEED * 0.8,
                vy: Math.sin(ang) * LASER_SPEED * 0.8,
                damage: FUNNEL_LASER_DMG,
                weaponType: "laser",
                isPlayer: p.isPlayer,
                graphics: lg,
                destroyed: false
              });
            }
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -80 || p.x > GAME_WIDTH + 80 || p.y < -160 || p.y > GAME_HEIGHT + 160) {
          p.graphics.destroy();
          p.destroyed = true;
          continue;
        }
        if (p.weaponType === "rock") {
          const r = p.radius ?? ROCK_RADIUS;
          for (const other of this.projectiles) {
            if (other === p || other.destroyed || other.isPlayer === p.isPlayer) continue;
            if (other.weaponType === "rock") continue;
            if (Math.hypot(other.x - p.x, other.y - p.y) < r + (other.radius ?? 6)) {
              other.graphics.destroy();
              other.destroyed = true;
              if (p.hp !== void 0) {
                p.hp--;
                if (p.hp <= 0) {
                  p.graphics.destroy();
                  p.destroyed = true;
                }
              }
            }
          }
          if (p.destroyed) continue;
        }
        if (p.weaponType === "mine") {
          const r = p.radius ?? MINE_RADIUS;
          for (const other of this.projectiles) {
            if (other === p || other.destroyed || other.weaponType !== "mine") continue;
            if (other.isPlayer === p.isPlayer) continue;
            if (Math.hypot(other.x - p.x, other.y - p.y) < r + (other.radius ?? MINE_RADIUS)) {
              const mx = (p.x + other.x) / 2;
              const my = (p.y + other.y) / 2;
              drawMechaExplosion(this, mx, my, r * 2, 16737792, 320);
              SFX.play("explosion");
              other.graphics.destroy();
              other.destroyed = true;
              p.graphics.destroy();
              p.destroyed = true;
              break;
            }
          }
          if (p.destroyed) continue;
        }
        let hitAst = false;
        for (const a of this.asteroids) {
          if (a.destroyed) continue;
          const collR = (p.radius ?? 5) + a.radius;
          if (Math.hypot(p.x - a.x, p.y - a.y) < collR) {
            if (p.weaponType !== "rock" && p.weaponType !== "mine" && p.weaponType !== "funnel") {
              a.hp -= p.damage;
              if (a.hp <= 0) {
                a.destroyed = true;
                a.graphics.destroy();
                drawMechaExplosion(this, a.x, a.y, a.radius * 1.6, 16746496, 360);
                SFX.play("hit_asteroid");
                SFX.play("explosion");
                spawnAsteroidDebris(this, a.x, a.y, a.radius, a.seed);
              } else {
                this.drawAsteroid(a);
              }
              p.graphics.destroy();
              p.destroyed = true;
              hitAst = true;
              break;
            }
          }
        }
        if (hitAst) continue;
        const targets = p.isPlayer ? this.enemyBlocks : this.playerBlocks;
        const tOffX = p.isPlayer ? this.enemyOffX : this.playerOffX;
        const tOffY = p.isPlayer ? 0 : this.playerOffY;
        if (p.weaponType === "funnel") {
          this.drawProjectile(p);
          continue;
        }
        let hit = false;
        for (const t of targets) {
          if (t.destroyed) continue;
          const tx = this.blockWorldX(t, tOffX);
          const ty = this.blockWorldY(t, tOffY);
          const collR = p.radius ?? 0;
          let dist;
          if (p.weaponType === "laser") {
            const BOLT_HALF = 11;
            const bLen = Math.hypot(p.vx, p.vy);
            if (bLen === 0) {
              dist = Math.hypot(p.x - tx, p.y - ty) < t.cellSize * 0.5;
            } else {
              const ux = p.vx / bLen, uy = p.vy / bLen;
              const proj = Phaser.Math.Clamp(
                (tx - p.x) * ux + (ty - p.y) * uy,
                -BOLT_HALF,
                BOLT_HALF
              );
              const closestX = p.x + ux * proj;
              const closestY = p.y + uy * proj;
              dist = Math.hypot(closestX - tx, closestY - ty) < t.cellSize * 0.5;
            }
          } else if (collR > 0) {
            dist = Math.hypot(p.x - tx, p.y - ty) < collR + t.cellSize * 0.5;
          } else {
            dist = Math.abs(p.x - tx) < t.cellSize * 0.52 && Math.abs(p.y - ty) < t.cellSize * 0.52;
          }
          if (t.isCore) {
            if (dist) {
              const coreOffX = p.isPlayer ? this.enemyOffX : this.playerOffX;
              const coreOffY = p.isPlayer ? 0 : this.playerOffY;
              const allBlocks = p.isPlayer ? this.enemyBlocks : this.playerBlocks;
              const neighbours = allBlocks.filter(
                (nb) => !nb.destroyed && !nb.isCore && Math.abs(nb.gridCol - t.gridCol) + Math.abs(nb.gridRow - t.gridRow) === 1
              );
              const dmgTargets = neighbours.length > 0 ? neighbours : [];
              let anyDestroyed = false;
              for (const nb of dmgTargets) {
                nb.hp -= p.damage;
                if (nb.hp <= 0) {
                  nb.hp = 0;
                  nb.destroyed = true;
                  nb.graphics.destroy();
                  nb.hpBar.destroy();
                  drawMechaExplosion(this, this.blockWorldX(nb, coreOffX), this.blockWorldY(nb, coreOffY), nb.cellSize * 0.7, 65518, 280);
                  SFX.play(`hit_${p.weaponType}`);
                  SFX.play("explosion");
                  anyDestroyed = true;
                } else {
                  this.redrawBlock(nb, coreOffX, coreOffY, !p.isPlayer);
                }
              }
              if (anyDestroyed) {
                if (p.isPlayer) this.pruneDisconnected(this.enemyBlocks, coreOffX, coreOffY, true);
                else this.pruneDisconnected(this.playerBlocks, coreOffX, coreOffY, false);
              }
              p.graphics.destroy();
              p.destroyed = true;
              drawMechaExplosion(this, p.x, p.y, t.cellSize * 0.28, 65518, 180, 15);
              this.updateHud();
            }
            continue;
          }
          if (dist) {
            if ((p.weaponType === "mine" || p.weaponType === "rock") && p.hp !== void 0) {
              p.hp--;
              if (p.hp <= 0) {
                p.graphics.destroy();
                p.destroyed = true;
              }
            } else {
              p.graphics.destroy();
              p.destroyed = true;
            }
            t.hp -= p.damage;
            if (t.hp <= 0) {
              t.hp = 0;
              t.destroyed = true;
              t.graphics.destroy();
              t.hpBar.destroy();
              drawMechaExplosion(this, tx, ty, t.cellSize * 0.7, 16777215, 300);
              SFX.play(`hit_${p.weaponType}`);
              SFX.play("explosion");
              if (p.isPlayer) this.pruneDisconnected(this.enemyBlocks, this.enemyOffX, 0, true);
              else this.pruneDisconnected(this.playerBlocks, this.playerOffX, this.playerOffY, false);
            } else {
              const impactColor = p.isPlayer ? 16770669 : 16739179;
              drawMechaExplosion(this, tx, ty, t.cellSize * 0.38, impactColor, 180);
              SFX.play(`hit_${p.weaponType}`);
              this.redrawBlock(t, tOffX, tOffY, !p.isPlayer);
            }
            hit = true;
            this.updateHud();
            break;
          }
        }
        if (!hit && !p.destroyed) this.drawProjectile(p);
      }
      this.projectiles = this.projectiles.filter((q) => !q.destroyed);
      for (const a of this.asteroids) {
        if (a.destroyed) continue;
        a.x += a.vx * dt;
        if (a.x < -80 || a.x > GAME_WIDTH + 80) {
          a.destroyed = true;
          a.graphics.destroy();
        } else {
          this.drawAsteroid(a);
        }
      }
      this.asteroids = this.asteroids.filter((a) => !a.destroyed);
      const enemyLoses = this.shipDisarmed(this.enemyBlocks);
      const playerAlive = this.playerBlocks.filter((b) => !b.destroyed).length;
      const playerCore = this.playerBlocks.find((b) => b.isCore && !b.destroyed);
      const playerLoses = playerAlive === 0 || !playerCore || this.shipDisarmed(this.playerBlocks);
      if (enemyLoses) this.endBattle(true);
      else if (playerLoses) this.endBattle(false);
    }
    endBattle(playerWon) {
      if (this.battleOver) return;
      this.battleOver = true;
      this.playerWon = playerWon;
      this.playerFireTimer.remove();
      this.enemyFireTimer.remove();
      this.asteroidSpawnTimer.remove();
      const losingBlocks = playerWon ? this.enemyBlocks : this.playerBlocks;
      const losingOffX = playerWon ? this.enemyOffX : this.playerOffX;
      const losingOffY = playerWon ? 0 : this.playerOffY;
      this.spawnShipDeathExplosion(losingBlocks, losingOffX, losingOffY, () => {
        const overlayPanel = this._overlayPanel;
        overlayPanel == null ? void 0 : overlayPanel.setVisible(true).setAlpha(0);
        if (overlayPanel) {
          this.tweens.add({ targets: overlayPanel, alpha: 1, duration: 250, ease: "Quad.easeOut" });
        }
        if (playerWon) {
          gameState.round++;
          gameState.enemyPieceCount += ENEMY_PIECE_GROWTH;
          this.statusText.setText("★  VICTORY  ★\nEnemy disarmed!").setVisible(true).setColor("#4ecdc4");
          SFX.play("victory");
        } else {
          gameState.lives = Math.max(0, gameState.lives - 1);
          const disarmed = this.shipDisarmed(this.playerBlocks);
          const reason = disarmed ? "Disarmed!" : "Ship Destroyed!";
          SFX.play("defeat");
          if (gameState.lives > 0) {
            const livesLabel = `${gameState.lives} ${gameState.lives === 1 ? "life" : "lives"} remaining  —  Respawning…`;
            this.statusText.setText(`✖  ${reason}
${livesLabel}`).setVisible(true).setColor("#ff6b6b");
            this._oLives = this.add.graphics().setDepth(32);
            drawLivesRow(this._oLives, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, PLAYER_LIVES, gameState.lives, 18);
          } else {
            this.statusText.setText(`✖  ${reason}
No lives remaining
GAME OVER`).setVisible(true).setColor("#ff4444");
          }
        }
        this.continueBtn.setVisible(true);
        this.tweens.add({
          targets: this.continueBtn,
          scaleX: 1.06,
          scaleY: 1.06,
          duration: 420,
          yoyo: true,
          repeat: -1
        });
      });
    }
    /** Cascading 90s mecha death explosion sequence across a ship's block positions.
     *  Fires staggered drawMechaExplosion calls, then a final super-burst at the centroid.
     *  Calls onComplete after the full sequence. */
    spawnShipDeathExplosion(blocks, offX, offY, onComplete) {
      const live = blocks.filter((b) => !b.destroyed);
      if (live.length === 0) {
        onComplete();
        return;
      }
      const positions = live.map((b) => ({
        x: b.baseX + offX + b.cellSize / 2,
        y: b.baseY + offY + b.cellSize / 2,
        cs: b.cellSize
      }));
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
      const avgCs = positions.reduce((s, p) => s + p.cs, 0) / positions.length;
      const interval = 75;
      const totalDur = positions.length * interval;
      positions.forEach((pos, i) => {
        this.time.delayedCall(i * interval, () => {
          const colors = [16737792, 16777215, 65518, 16729088, 16763904];
          const col = colors[i % colors.length];
          drawMechaExplosion(this, pos.x, pos.y, pos.cs * 0.85, col, 400, 25);
          if (i < 4) {
            const shakeAmt = 8 - i * 1.5;
            this.cameras.main.shake(120, shakeAmt / GAME_WIDTH);
          }
        });
      });
      this.time.delayedCall(totalDur + 80, () => {
        drawMechaExplosion(this, cx, cy, avgCs * 3.5, 16777215, 600, 26);
        drawMechaExplosion(this, cx, cy, avgCs * 2.5, 16737792, 700, 25);
        drawMechaExplosion(this, cx, cy, avgCs * 1.8, 16763904, 500, 27);
        this.cameras.main.shake(350, 0.018);
      });
      this.time.delayedCall(totalDur + 200, onComplete);
    }
    /** Rebuild the player ship at full HP in the same battle, leaving the enemy untouched. */
    respawnPlayer() {
      for (const b of this.playerBlocks) {
        try {
          b.graphics.destroy();
        } catch (_) {
        }
        try {
          b.hpBar.destroy();
        } catch (_) {
        }
      }
      this.playerBlocks = [];
      for (const p of this.projectiles) {
        try {
          p.graphics.destroy();
        } catch (_) {
        }
      }
      this.projectiles = [];
      for (const bc of this.beamCharges) {
        try {
          bc.graphics.destroy();
        } catch (_) {
        }
      }
      this.beamCharges = [];
      this.beamCooldowns = /* @__PURE__ */ new WeakMap();
      this.funnelCooldowns = /* @__PURE__ */ new WeakMap();
      if (gameState.placedPieces.length > 0) {
        this.playerBlocks = this.makeShipBlocks(
          gameState.placedPieces,
          gameState.coreCol,
          gameState.coreRow,
          GAME_WIDTH / 2,
          this.PLAYER_LANE_Y,
          false
        );
      }
      this.playerStartBlocks = this.playerBlocks.length;
      this.playerOffX = 0;
      this.playerOffY = 0;
      this.playerBoost = 1;
      this.playerBoostDirX = 0;
      this.playerBoostDirY = 0;
      this.playerBoostT = 1;
      this.playerFireTimer.remove();
      this.enemyFireTimer.remove();
      this.playerFireTimer = this.time.addEvent({
        delay: 1200,
        callback: this.playerFire,
        callbackScope: this,
        loop: true
      });
      this.enemyFireTimer = this.time.addEvent({
        delay: 1500,
        callback: this.enemyFire,
        callbackScope: this,
        loop: true
      });
      this.battleOver = false;
      this.playerWon = false;
      this.statusText.setVisible(false);
      this.continueBtn.setVisible(false);
      const overlayPanel = this._overlayPanel;
      overlayPanel == null ? void 0 : overlayPanel.setVisible(false);
      if (this._oLives) {
        this._oLives.destroy();
        this._oLives = null;
      }
      this.updateHud();
      const flash = this.add.graphics().setDepth(25);
      flash.fillStyle(5164484, 0.35);
      flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => flash.destroy()
      });
    }
    updateHud() {
      var _a, _b;
      const pa = this.playerBlocks.filter((b) => !b.destroyed).length;
      const ea = this.enemyBlocks.filter((b) => !b.destroyed).length;
      const pw = this.playerBlocks.filter((b) => !b.destroyed && b.weaponType !== null).length;
      const ew = this.enemyBlocks.filter((b) => !b.destroyed && b.weaponType !== null).length;
      (_a = this.playerHpText) == null ? void 0 : _a.setText(`■ Your ship: ${pa} blocks  ⚡${pw} weapons`);
      (_b = this.enemyHpText) == null ? void 0 : _b.setText(`■ Enemy: ${ea} blocks  ⚡${ew} weapons`);
      if (this.livesGfx) {
        drawLivesRow(this.livesGfx, GAME_WIDTH / 2, GAME_HEIGHT - 96, PLAYER_LIVES, gameState.lives, 16);
      }
    }
    makeBattleButton(label, color, onClick) {
      const w = 260, h = 72, r = 14;
      const shadow = this.add.graphics();
      shadow.fillStyle(0, 0.4);
      shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, r);
      const bg = this.add.graphics();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      bg.fillStyle(16777215, 0.12);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, r);
      bg.lineStyle(2, 16777215, 0.22);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      const text = this.add.text(0, 0, label, {
        fontSize: "26px",
        fontFamily: "Arial",
        color: "#fff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5);
      const c = this.add.container(0, 0, [shadow, bg, text]);
      c.setSize(w, h);
      c.setInteractive({ useHandCursor: true }).on("pointerover", () => {
        this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: "Quad.easeOut" });
      }).on("pointerout", () => {
        this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 100, ease: "Quad.easeOut" });
      }).on("pointerdown", () => {
        this.tweens.add({ targets: c, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
        onClick();
      });
      return c;
    }
  }
  class TitleScene extends Phaser.Scene {
    constructor() {
      super({ key: "TitleScene" });
      this.starLayers = [];
    }
    create() {
      BGM.playBuild();
      const bg = this.add.graphics();
      bg.fillGradientStyle(132110, 132110, 396314, 396314, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.starLayers = initStarLayers(this, 0.18);
      const CX = GAME_WIDTH / 2;
      this._drawArwing(CX, 350);
      this._drawMechaTitle(CX, 530);
      this._drawInstructions(CX, 790);
      const tap = this.add.text(CX, 1220, "TAP TO START", {
        fontSize: "38px",
        fontFamily: "Arial Black",
        color: "#4ecdc4",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6,
        letterSpacing: 8
      }).setOrigin(0.5).setDepth(5);
      this.tweens.add({
        targets: tap,
        alpha: 0.15,
        duration: 820,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      this.input.once("pointerdown", () => {
        this.scene.start("BuildScene");
      });
    }
    update(_t, delta) {
      updateStarLayers(this.starLayers, delta / 1e3);
    }
    // ─── Arwing-style fighter (top-down view) ─────────────────────────────────
    _drawArwing(cx, cy) {
      const g = this.add.graphics().setDepth(3);
      for (const ox of [-72, 0, 72]) {
        g.fillStyle(52479, ox === 0 ? 0.18 : 0.12);
        g.fillCircle(cx + ox, cy + 130, ox === 0 ? 38 : 28);
        g.fillStyle(4517631, ox === 0 ? 0.35 : 0.25);
        g.fillCircle(cx + ox, cy + 130, ox === 0 ? 20 : 14);
        g.fillStyle(11206655, 1);
        g.fillCircle(cx + ox, cy + 130, ox === 0 ? 7 : 5);
      }
      const lWing = [
        { x: cx - 30, y: cy - 60 },
        // root leading edge
        { x: cx - 240, y: cy + 80 },
        // tip leading edge
        { x: cx - 200, y: cy + 130 },
        // tip trailing
        { x: cx - 30, y: cy + 100 }
        // root trailing
      ];
      g.fillStyle(1717584, 1);
      g.fillPoints(lWing, true);
      g.lineStyle(2, 3832490, 0.85);
      g.strokePoints(lWing, true);
      const rWing = lWing.map((p) => ({ x: cx + (cx - p.x), y: p.y }));
      g.fillStyle(1717584, 1);
      g.fillPoints(rWing, true);
      g.lineStyle(2, 3832490, 0.85);
      g.strokePoints(rWing, true);
      const wingPairs = [[lWing, -1], [rWing, 1]];
      for (const [pts, sign] of wingPairs) {
        const wx0 = pts[0].x, wy0 = pts[0].y;
        const wx1 = pts[1].x, wy1 = pts[1].y;
        g.lineStyle(1, 4889292, 0.4);
        for (const t of [0.55, 0.78]) {
          g.lineBetween(
            cx + sign * 30,
            cy - 20 + 120 * t,
            wx0 + (wx1 - wx0) * t,
            wy0 + (wy1 - wy0) * t
          );
        }
      }
      for (const ox of [-72, 72]) {
        const nacPts = [
          { x: cx + ox - 18, y: cy - 30 },
          { x: cx + ox + 18, y: cy - 30 },
          { x: cx + ox + 22, y: cy + 120 },
          { x: cx + ox - 22, y: cy + 120 }
        ];
        g.fillStyle(2374998, 1);
        g.fillPoints(nacPts, true);
        g.lineStyle(2, 4885162, 0.8);
        g.strokePoints(nacPts, true);
        g.lineStyle(1, 6992076, 0.5);
        g.lineBetween(cx + ox, cy - 30, cx + ox, cy + 120);
      }
      const fusPts = [
        { x: cx, y: cy - 160 },
        // nose tip
        { x: cx + 30, y: cy - 60 },
        // nose right shoulder
        { x: cx + 46, y: cy + 100 },
        // body right
        { x: cx + 22, y: cy + 140 },
        // tail right
        { x: cx - 22, y: cy + 140 },
        // tail left
        { x: cx - 46, y: cy + 100 },
        // body left
        { x: cx - 30, y: cy - 60 }
        // nose left shoulder
      ];
      g.fillStyle(1981010, 1);
      g.fillPoints(fusPts, true);
      g.lineStyle(2.5, 4885162, 0.9);
      g.strokePoints(fusPts, true);
      g.lineStyle(1, 3829904, 0.5);
      g.lineBetween(cx, cy - 60, cx, cy + 140);
      g.lineBetween(cx - 30, cy + 10, cx + 30, cy + 10);
      g.lineBetween(cx - 40, cy + 70, cx + 40, cy + 70);
      const canPts = [
        { x: cx, y: cy - 130 },
        // front
        { x: cx + 16, y: cy - 55 },
        // right
        { x: cx + 12, y: cy + 20 },
        // right rear
        { x: cx - 12, y: cy + 20 },
        // left rear
        { x: cx - 16, y: cy - 55 }
        // left
      ];
      g.fillStyle(663088, 1);
      g.fillPoints(canPts, true);
      g.lineStyle(1.5, 52479, 0.7);
      g.strokePoints(canPts, true);
      g.fillStyle(4500223, 0.18);
      g.fillPoints(canPts, true);
      g.lineStyle(1, 4500223, 0.5);
      g.lineBetween(cx, cy - 130, cx, cy + 20);
      g.fillStyle(8969727, 0.9);
      g.fillCircle(cx, cy - 162, 6);
      g.fillStyle(16777215, 1);
      g.fillCircle(cx, cy - 162, 3);
      g.fillStyle(4500223, 0.25);
      g.fillCircle(cx, cy - 155, 18);
      for (const ox of [-200, 200]) {
        g.fillStyle(1981010, 1);
        g.fillRect(cx + ox - 8, cy + 70, 16, 32);
        g.lineStyle(1, 4885162, 0.7);
        g.strokeRect(cx + ox - 8, cy + 70, 16, 32);
        g.fillStyle(6992076, 0.9);
        g.fillRect(cx + ox - 3, cy + 62, 6, 14);
        g.fillStyle(11206655, 0.8);
        g.fillCircle(cx + ox, cy + 63, 4);
      }
      g.fillStyle(663600, 1);
      g.fillCircle(cx, cy + 50, 14);
      g.lineStyle(1.5, 52479, 0.7);
      g.strokeCircle(cx, cy + 50, 14);
      g.fillStyle(65518, 0.35);
      g.fillCircle(cx, cy + 50, 8);
      g.fillStyle(11206655, 1);
      g.fillCircle(cx, cy + 50, 4);
      const glow2 = this.add.graphics().setDepth(2);
      glow2.fillStyle(17578, 0.07);
      glow2.fillEllipse(cx, cy + 30, 500, 200);
      glow2.fillStyle(35071, 0.05);
      glow2.fillEllipse(cx, cy + 30, 340, 130);
    }
    // ─── Mecha-style title text ──────────────────────────────────────────────
    _drawMechaTitle(cx, y) {
      const line1 = this.add.text(cx, y, "BATTLEWING", {
        fontSize: "96px",
        fontFamily: "Arial Black, Impact, sans-serif",
        color: "#e8f4ff",
        fontStyle: "bold",
        stroke: "#001828",
        strokeThickness: 10,
        letterSpacing: 6
      }).setOrigin(0.5, 0).setDepth(5);
      this.add.text(cx, y + 108, "ARCHITECT", {
        fontSize: "72px",
        fontFamily: "Arial Black, Impact, sans-serif",
        color: "#4ecdc4",
        fontStyle: "bold",
        stroke: "#001020",
        strokeThickness: 8,
        letterSpacing: 14
      }).setOrigin(0.5, 0).setDepth(5);
      const g = this.add.graphics().setDepth(4);
      const b1 = line1.getBounds();
      const pad = 14;
      const chamfer = 18;
      const fx = b1.x - pad, fy = b1.y - pad;
      const fw = b1.width + pad * 2, fh = b1.height + pad * 2;
      const framePts = [
        { x: fx + chamfer, y: fy },
        { x: fx + fw, y: fy },
        { x: fx + fw, y: fy + fh - chamfer },
        { x: fx + fw - chamfer, y: fy + fh },
        { x: fx, y: fy + fh },
        { x: fx, y: fy + chamfer }
      ];
      g.lineStyle(2, 65518, 0.55);
      g.strokePoints(framePts, true);
      const acL = 28;
      g.lineStyle(3, 65518, 0.9);
      g.lineBetween(fx, fy + chamfer, fx, fy + chamfer + acL);
      g.lineBetween(fx + chamfer, fy, fx + chamfer + acL, fy);
      g.lineBetween(fx + fw, fy + fh - chamfer, fx + fw, fy + fh - chamfer - acL);
      g.lineBetween(fx + fw - chamfer, fy + fh, fx + fw - chamfer - acL, fy + fh);
      g.lineStyle(1, 65518, 0.2);
      for (let scan = 0; scan < fh; scan += 5) {
        g.lineBetween(fx, fy + scan, fx + fw, fy + scan);
      }
      const sepY = y + 106;
      g.lineStyle(2, 65518, 0.5);
      g.lineBetween(cx - 180, sepY, cx + 180, sepY);
      g.fillStyle(65518, 0.9);
      g.fillTriangle(cx, sepY - 7, cx - 7, sepY, cx, sepY + 7);
      g.fillTriangle(cx, sepY - 7, cx + 7, sepY, cx, sepY + 7);
      const glow = this.add.graphics().setDepth(3);
      glow.fillStyle(65518, 0.04);
      glow.fillRect(fx - 20, fy - 20, fw + 40, fh + 160);
    }
    // ─── Instruction cards ───────────────────────────────────────────────────
    _drawInstructions(cx, y) {
      const g = this.add.graphics().setDepth(4);
      const cards = [
        { icon: "⬡", text: "Build your ship — drag pieces\nonto the grid, touching the core" },
        { icon: "✛", text: "WASD / arrows to move\nyour ship in battle" },
        { icon: "◈", text: "SPACE to boost-dodge\nin your held direction" },
        { icon: "✦", text: "Destroy all enemy weapons\nto win each round" }
      ];
      const cardW = GAME_WIDTH - 60;
      const cardH = 90;
      const cardGap = 14;
      cards.forEach((card, i) => {
        const cy2 = y + i * (cardH + cardGap);
        const cx2 = cx;
        g.fillStyle(661544, 0.88);
        g.fillRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 8);
        g.lineStyle(1, 1982560, 0.9);
        g.strokeRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 8);
        g.fillStyle(65518, 0.7);
        g.fillRect(cx2 - cardW / 2, cy2 + 10, 3, cardH - 20);
        this.add.text(cx2 - cardW / 2 + 28, cy2 + cardH / 2, card.icon, {
          fontSize: "32px",
          color: "#00ffee"
        }).setOrigin(0.5).setDepth(5);
        this.add.text(cx2 - cardW / 2 + 60, cy2 + cardH / 2, card.text, {
          fontSize: "26px",
          fontFamily: "Arial",
          color: "#c8e8f8",
          lineSpacing: 4
        }).setOrigin(0, 0.5).setDepth(5);
      });
    }
  }
  const config = createGameConfig();
  config.scene = [TitleScene, BuildScene, BattleScene];
  new Phaser.Game(config);
})();
//# sourceMappingURL=game.js.map
