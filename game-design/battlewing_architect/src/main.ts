import {
  GAME_WIDTH, GAME_HEIGHT, COLORS, TEXT_STYLES, createGameConfig,
  CELL, GRID_COLS, GRID_ROWS, GRID_PIXEL_W, GRID_PIXEL_H, GRID_EXPAND_THRESHOLD,
  PIECE_SHAPES,
  INITIAL_PIECE_COUNT, SUBSEQUENT_PIECE_COUNT,
  INITIAL_ENEMY_PIECES, ENEMY_PIECE_GROWTH,
  PLAYER_MAX_HP, PLAYER_LIVES, BLOCK_HP, GUN_DAMAGE, LASER_DAMAGE, BULLET_SPEED, LASER_SPEED,
  BEAM_DAMAGE, BEAM_CHARGE_TIME, BEAM_COOLDOWN, BEAM_WIDTH,
  MINE_DAMAGE, MINE_SPEED_MIN, MINE_SPEED_MAX, MINE_RADIUS, MINE_HP,
  MISSILE_DAMAGE, MISSILE_SPEED_MIN, MISSILE_ACCEL, MISSILE_RADIUS,
  FUNNEL_SPEED, FUNNEL_LASER_DMG, FUNNEL_FIRE_RATE, FUNNEL_RELEASE_RATE,
  ROCK_HP, ROCK_RADIUS, ROCK_SPEED, ROCK_DAMAGE,
  HOMING_DAMAGE, HOMING_SPEED_MIN, HOMING_ACCEL, HOMING_TURN_SPEED, HOMING_LOCK_DIST,
  PLAYER_SPEED, PLAYER_BOUNDS_PAD,
  ASTEROID_BAND_Y, ASTEROID_BAND_H, ASTEROID_SPEED_MIN, ASTEROID_SPEED_MAX,
  ASTEROID_HP, ASTEROID_RADIUS_MIN, ASTEROID_RADIUS_MAX, ASTEROID_COUNT,
  ENEMY_SPEED, ENEMY_BOUNDS_PAD,
  BOOST_COST, BOOST_REGEN, BOOST_DISTANCE, BOOST_DURATION, UNDERDOG_SPEED_MAX,
  CORE_COL, CORE_ROW,
  BONUS_TILE_COUNT,
  BONUS_TILE_MAX_DIST,
} from './config';
import type { BlockOffset, PieceDef, PlacedPiece, GameState, WeaponType, Weapon } from './types';

// ─── Procedural Sound Manager ──────────────────────────────────────────────────
// All sounds synthesized via Web Audio API — no external files needed.

class SoundManager {
  private ctx: AudioContext | null = null;
  private _played = new Set<string>();   // dedup within one frame

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Call once per frame (top of update) to reset dedup. */
  clearFrame(): void { this._played.clear(); }

  /** Play a named sound, deduped per frame. */
  play(key: string): void {
    if (this._played.has(key)) return;
    this._played.add(key);
    try {
      const c = this.getCtx();
      switch (key) {
        // ── Build scene ─────────────────────────────────────────────────
        case 'piece_pickup':    this._toneBlip(c, 520, 0.06, 0.09, 'sine');   break;
        case 'piece_rotate':    this._toneBlip(c, 880, 0.05, 0.07, 'square'); break;
        case 'piece_place':     this._tonePlunk(c, 300, 0.12, 0.18);           break;
        case 'bonus_pickup':    this._chime(c, [880, 1100, 1320], 0.10);       break;
        // ── Weapon fire ────────────────────────────────────────────────
        case 'fire_gun':        this._gunShot(c);                               break;
        case 'fire_laser':      this._laserShot(c);                             break;
        case 'fire_beam':       this._beamCharge(c);                            break;
        case 'fire_mine':       this._mineDeploy(c);                            break;
        case 'fire_missile':    this._missileShot(c);                           break;
        case 'fire_funnel':     this._funnelDeploy(c);                          break;
        case 'fire_rock':       this._rockThrow(c);                             break;
        case 'fire_homing':     this._homingShot(c);                            break;
        // ── Movement ─────────────────────────────────────────────────────────────
        case 'boost':           this._boostWhoosh(c);                            break;
        // ── Weapon hit (projectile impacts ship) ───────────────────────────
        case 'hit_gun':         this._impactTick(c, 200, 0.10);                 break;
        case 'hit_laser':       this._impactTick(c, 320, 0.08);                 break;
        case 'hit_beam':        this._impactBoom(c, 80, 0.20, 0.30);           break;
        case 'hit_mine':        this._impactBoom(c, 60, 0.22, 0.35);           break;
        case 'hit_missile':     this._impactBoom(c, 70, 0.18, 0.28);           break;
        case 'hit_funnel':      this._impactTick(c, 280, 0.08);                break;
        case 'hit_rock':        this._impactBoom(c, 90, 0.16, 0.25);           break;
        case 'hit_homing':      this._impactBoom(c, 75, 0.19, 0.30);           break;
        // ── Environment / events ─────────────────────────────────────────────
        case 'hit_asteroid':    this._impactBoom(c, 120, 0.14, 0.22);          break;
        case 'explosion':       this._explosion(c);                             break;
        case 'victory':         this._mechaVictory(c);                         break;
        case 'defeat':          this._mechaDefeat(c);                           break;
      }
    } catch (_) { /* AudioContext blocked or unavailable — silently skip */ }
  }

  // ──────────── Low-level synth helpers ───────────────────────────────────────

  private _toneBlip(c: AudioContext, freq: number, vol: number, dur: number, type: OscillatorType): void {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  private _tonePlunk(c: AudioContext, freq: number, vol: number, dur: number): void {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.5, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq, c.currentTime + 0.04);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  private _chime(c: AudioContext, freqs: number[], vol: number): void {
    freqs.forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = c.currentTime + i * 0.07;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + 0.4);
    });
  }

  private _noise(c: AudioContext, dur: number, vol: number, filterFreq: number): void {
    const bufSize = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = filterFreq; filt.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start(); src.stop(c.currentTime + dur);
  }

  // ──────────── Weapon fire sounds ─────────────────────────────────────────────

  private _gunShot(c: AudioContext): void {
    // Short sharp crack: noise burst + pitched tail
    this._noise(c, 0.06, 0.18, 1200);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(280, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.07);
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.07);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.07);
  }

  private _laserShot(c: AudioContext): void {
    // Rising zip: oscillator sweeping up
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.12);
    g.gain.setValueAtTime(0.10, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.14);
  }

  private _beamCharge(c: AudioContext): void {
    // Low rising hum with harmonics
    const o1 = c.createOscillator(); const o2 = c.createOscillator();
    const g = c.createGain();
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(60, c.currentTime);
    o1.frequency.linearRampToValueAtTime(220, c.currentTime + 1.0);
    o2.type = 'sine';     o2.frequency.setValueAtTime(120, c.currentTime);
    o2.frequency.linearRampToValueAtTime(440, c.currentTime + 1.0);
    g.gain.setValueAtTime(0.0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.14, c.currentTime + 0.3);
    g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
    o1.connect(g); o2.connect(g); g.connect(c.destination);
    o1.start(); o1.stop(c.currentTime + 1.25);
    o2.start(); o2.stop(c.currentTime + 1.25);
  }

  private _mineDeploy(c: AudioContext): void {
    // Low dunk + metallic click
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(180, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.15);
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.2);
    this._noise(c, 0.04, 0.12, 3000);
  }

  private _missileShot(c: AudioContext): void {
    // Whoosh ignition
    this._noise(c, 0.18, 0.16, 600);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(100, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(340, c.currentTime + 0.15);
    g.gain.setValueAtTime(0.10, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.20);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.22);
  }

  private _funnelDeploy(c: AudioContext): void {
    // Sparkle sweep
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1400, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.14);
    g.gain.setValueAtTime(0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.18);
  }

  private _rockThrow(c: AudioContext): void {
    // Heavy thud + rumble
    this._noise(c, 0.12, 0.20, 250);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.14);
    g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.20);
  }

  private _boostWhoosh(c: AudioContext): void {
    // Very short filtered noise burst with a quick pitch-up tail — punchy but subtle
    const bufSize = Math.ceil(c.sampleRate * 0.10);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    // High-pass to keep it airy, not bassy
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900; hp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.10, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.10);
    src.connect(hp); hp.connect(g); g.connect(c.destination);
    src.start(); src.stop(c.currentTime + 0.11);
    // Short rising sine — gives the "thrust kick" character
    const o = c.createOscillator(); const og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(200, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.08);
    og.gain.setValueAtTime(0.06, c.currentTime);
    og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    o.connect(og); og.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.10);
  }

  private _homingShot(c: AudioContext): void {
    // Locking beep + trail
    this._toneBlip(c, 1100, 0.09, 0.08, 'square');
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime + 0.06);
    o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.22);
    g.gain.setValueAtTime(0.08, c.currentTime + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.24);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + 0.06); o.stop(c.currentTime + 0.26);
  }

  // ──────────── Impact / explosion sounds ────────────────────────────────────

  private _impactTick(c: AudioContext, freq: number, vol: number): void {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + 0.05);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.1);
    this._noise(c, 0.04, vol * 0.5, 1500);
  }

  private _impactBoom(c: AudioContext, freq: number, vol: number, dur: number): void {
    // Sub boom + noise burst
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 2.5, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq, c.currentTime + dur * 0.4);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    this._noise(c, dur * 0.6, vol * 0.7, freq * 3);
  }

  private _explosion(c: AudioContext): void {
    // Full explosion: sub boom + wide noise
    this._noise(c, 0.5, 0.28, 400);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(120, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(25, c.currentTime + 0.4);
    g.gain.setValueAtTime(0.22, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.55);
  }

  private _mechaVictory(c: AudioContext): void {
    const t = c.currentTime;

    // ── 1. Sub impact boom (frames the hit) ──────────────────────────────
    const sub = c.createOscillator(); const subG = c.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    subG.gain.setValueAtTime(0.28, t);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
    sub.connect(subG); subG.connect(c.destination);
    sub.start(t); sub.stop(t + 0.32);

    // ── 2. Brass stab chord — three sawtooth voices (root / fifth / octave) ─
    // D major: D3=147, A3=220, D4=294
    const brassFreqs = [147, 220, 294];
    brassFreqs.forEach((freq, i) => {
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      // Slight detune per voice for fatness
      o.frequency.value = freq * (1 + (i - 1) * 0.004);
      f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.8;
      // Short hard attack — brass punch
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.setValueAtTime(0.18, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.6);
    });

    // ── 3. Power chord swell — held major chord fading in after the hit ──
    // An octave up: D4=294, A4=440, D5=587
    const swellFreqs = [294, 440, 587];
    swellFreqs.forEach((freq, i) => {
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq * (1 + (i - 1) * 0.006);
      f.type = 'lowpass'; f.frequency.value = 3500;
      const t1 = t + 0.12;   // starts just after the stab
      g.gain.setValueAtTime(0.0, t1);
      g.gain.linearRampToValueAtTime(0.13, t1 + 0.15);
      g.gain.setValueAtTime(0.13, t1 + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 1.30);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t1); o.stop(t1 + 1.4);
    });

    // ── 4. High synth energy shimmer — rising bright sine ─────────────────
    const shimmer = c.createOscillator(); const shimG = c.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(880, t + 0.10);
    shimmer.frequency.exponentialRampToValueAtTime(2640, t + 0.90);
    shimG.gain.setValueAtTime(0.0, t + 0.10);
    shimG.gain.linearRampToValueAtTime(0.09, t + 0.25);
    shimG.gain.exponentialRampToValueAtTime(0.0001, t + 1.00);
    shimmer.connect(shimG); shimG.connect(c.destination);
    shimmer.start(t + 0.10); shimmer.stop(t + 1.05);

    // ── 5. Noise burst — impact texture ───────────────────────────────────
    this._noise(c, 0.08, 0.16, 900);
  }

  private _mechaDefeat(c: AudioContext): void {
    const t = c.currentTime;

    // ── 1. Impact crunch — noise burst + sub hit at the moment of destruction ─
    this._noise(c, 0.12, 0.22, 500);
    const sub = c.createOscillator(); const subG = c.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.18);
    subG.gain.setValueAtTime(0.30, t);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    sub.connect(subG); subG.connect(c.destination);
    sub.start(t); sub.stop(t + 0.25);

    // ── 2. Mournful brass fall — Em chord sliding down in pitch ────────────
    // E minor: E3=165, B3=247, E4=330 Hz — fades in then slowly bends down
    [165, 247, 330].forEach((freq, i) => {
      const o = c.createOscillator();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      o.type = 'sawtooth';
      // Each voice starts slightly detuned for a strained, fatigued sound
      o.frequency.setValueAtTime(freq * (1 + (i - 1) * 0.007), t + 0.05);
      // Slow downward pitch bend — the ship losing power
      o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 2.2);
      f.type = 'lowpass'; f.frequency.value = 1800; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0, t + 0.05);
      g.gain.linearRampToValueAtTime(0.14, t + 0.20);
      g.gain.setValueAtTime(0.14, t + 0.50);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.40);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t + 0.05); o.stop(t + 2.50);
    });

    // ── 3. Reactor groan — dissonant filtered sawtooth, wobbles then cuts ───
    // G#2 = 104 Hz (dissonant against E minor)
    const groan = c.createOscillator();
    const groanF = c.createBiquadFilter();
    const groanG = c.createGain();
    groan.type = 'sawtooth';
    groan.frequency.setValueAtTime(104, t + 0.08);
    groan.frequency.setValueAtTime(112, t + 0.40);   // brief detune wobble
    groan.frequency.setValueAtTime(98,  t + 0.70);   // sag
    groan.frequency.linearRampToValueAtTime(60, t + 1.30);  // dying fall
    groanF.type = 'bandpass'; groanF.frequency.value = 320; groanF.Q.value = 3.0;
    groanG.gain.setValueAtTime(0.0,  t + 0.08);
    groanG.gain.linearRampToValueAtTime(0.18, t + 0.20);
    groanG.gain.setValueAtTime(0.18, t + 0.80);
    groanG.gain.exponentialRampToValueAtTime(0.0001, t + 1.40);  // cuts out
    groan.connect(groanF); groanF.connect(groanG); groanG.connect(c.destination);
    groan.start(t + 0.08); groan.stop(t + 1.50);

    // ── 4. Low bass rumble — sub sine drifting toward silence ────────────
    const rumble = c.createOscillator(); const rumbleG = c.createGain();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(52, t + 0.10);
    rumble.frequency.linearRampToValueAtTime(28, t + 2.50);
    rumbleG.gain.setValueAtTime(0.0,  t + 0.10);
    rumbleG.gain.linearRampToValueAtTime(0.20, t + 0.35);
    rumbleG.gain.exponentialRampToValueAtTime(0.0001, t + 2.60);
    rumble.connect(rumbleG); rumbleG.connect(c.destination);
    rumble.start(t + 0.10); rumble.stop(t + 2.70);

    // ── 5. High resonant tail — thin sine at minor 9th, lonely and fading ──
    // F5 = 698 Hz (minor 9th above E, creates unresolved tension)
    const tail = c.createOscillator(); const tailG = c.createGain();
    tail.type = 'sine';
    tail.frequency.setValueAtTime(698, t + 0.30);
    tail.frequency.linearRampToValueAtTime(660, t + 2.50);  // slow flat
    tailG.gain.setValueAtTime(0.0,  t + 0.30);
    tailG.gain.linearRampToValueAtTime(0.07, t + 0.55);
    tailG.gain.exponentialRampToValueAtTime(0.0001, t + 2.60);
    tail.connect(tailG); tailG.connect(c.destination);
    tail.start(t + 0.30); tail.stop(t + 2.70);
  }

  private _defeatStab(c: AudioContext): void {
    // Kept for reference — replaced by _mechaDefeat
    void c;
  }
}

/** Module-level singleton — shared across all scenes. */
const SFX = new SoundManager();

// ─── Music Manager ────────────────────────────────────────────────────────────
// Procedural looping BGM via Web Audio API scheduler.
// Two tracks: 'build' (pensive, D-minor, 72 BPM) and 'battle' (frenetic, E-minor, 160 BPM).

class MusicManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _current: 'build' | 'battle' | null = null;
  private _stopFlag = false;
  private _scheduleHandle = 0;
  // Per-track gain node — zeroed immediately on stop to silence queued oscillators
  private _trackGain: GainNode | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.28;  // fixed BGM volume — track gains handle fade in/out
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  stop(): void {
    this._stopFlag = true;
    clearTimeout(this._scheduleHandle);
    this._current = null;
    // Immediately zero the track gain — this silences all already-queued
    // oscillator/buffer nodes for the old track (they all route through it).
    if (this._trackGain && this.ctx) {
      const tg = this._trackGain;
      tg.gain.cancelScheduledValues(this.ctx.currentTime);
      tg.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    this._trackGain = null;
  }

  playBuild(): void {
    if (this._current === 'build') return;
    this.stop();
    this._stopFlag = false;
    this._current = 'build';
    try {
      const c = this.getCtx();
      const mg = this.masterGain!;
      // Fresh track gain for this track's oscillators
      const tg = c.createGain();
      tg.gain.setValueAtTime(0, c.currentTime);
      tg.gain.linearRampToValueAtTime(1.0, c.currentTime + 0.6);
      tg.connect(mg);
      this._trackGain = tg;
      const t0 = c.currentTime + 0.05;
      this._scheduleBuild(c, tg, t0, 0);
    } catch (_) { /* AudioContext unavailable */ }
  }

  playBattle(): void {
    if (this._current === 'battle') return;
    this.stop();
    this._stopFlag = false;
    this._current = 'battle';
    try {
      const c = this.getCtx();
      const mg = this.masterGain!;
      // Fresh track gain for this track's oscillators
      const tg = c.createGain();
      tg.gain.setValueAtTime(0, c.currentTime);
      tg.gain.linearRampToValueAtTime(1.0, c.currentTime + 0.3);
      tg.connect(mg);
      this._trackGain = tg;
      const t0 = c.currentTime + 0.05;
      this._scheduleBattle(c, tg, t0, 0);
    } catch (_) { /* AudioContext unavailable */ }
  }

  // ─── BUILD BGM ─────────────────────────────────────────────────────────────
  // D minor, 72 BPM, 8-bar loop.
  // Channels: string pad, sparse piano, walking bass, light percussion.

  private _scheduleBuild(c: AudioContext, mg: GainNode, t: number, beat: number): void {
    if (this._stopFlag || this._current !== 'build') return;

    const BPM   = 72;
    const BEAT  = 60 / BPM;        // seconds per beat
    const BAR   = BEAT * 4;        // 4/4
    const LOOP  = BAR * 8;         // 8-bar loop = 32 beats
    const BEATS = 32;

    // ── Frequency tables ──────────────────────────────────────────────────
    // D minor scale: D3 D4 E3 F3 G3 A3 Bb3 C4 D4
    const D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.00;
    const A3 = 220.00, Bb3 = 233.08, C4 = 261.63, D4 = 293.66;
    const F4 = 349.23, A4 = 440.00;
    const D2 = 73.42,  A2 = 110.00, C3 = 130.81, Bb2 = 116.54, G2 = 98.00;

    // ── Helpers ───────────────────────────────────────────────────────────
    const osc = (freq: number, type: OscillatorType, tStart: number, dur: number,
                 vol: number, attack = 0.015, release = 0.08): void => {
      const o = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1800;
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, tStart);
      g.gain.linearRampToValueAtTime(vol, tStart + attack);
      g.gain.setValueAtTime(vol, tStart + dur - release);
      g.gain.linearRampToValueAtTime(0, tStart + dur);
      o.connect(lp); lp.connect(g); g.connect(mg);
      o.start(tStart); o.stop(tStart + dur + 0.01);
    };

    const noise = (tStart: number, dur: number, vol: number, filterF: number): void => {
      const bufSize = Math.ceil(c.sampleRate * dur);
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = filterF; f.Q.value = 2.0;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, tStart);
      g.gain.exponentialRampToValueAtTime(0.0001, tStart + dur);
      src.connect(f); f.connect(g); g.connect(mg);
      src.start(tStart); src.stop(tStart + dur + 0.01);
    };

    // ── String pad: slow sawtooth chords, one chord per 2 bars ───────────
    // i minor (bars 1-2), VI (bars 3-4), III (bars 5-6), VII (bars 7-8)
    const padChords: [number, number, number][] = [
      [D3, F3, A3],   // Dm
      [Bb2 * 2, D3, F3],  // Bb — reuse Bb3 octave down trick
      [F3 * 0.5 * 2, A3 * 0.5 * 2, C4],  // F  (F3,A3,C4)
      [C3, E3, G3],   // C
    ];
    for (let ci = 0; ci < 4; ci++) {
      const tChord = t + ci * BAR * 2;
      for (const freq of padChords[ci]) {
        osc(freq, 'sawtooth', tChord, BAR * 2 - 0.1, 0.045, 0.25, 0.5);
      }
    }

    // ── Sparse piano plucks (triangle): melodic motif ─────────────────────
    // A melancholy 4-note motif repeating with slight variation each bar
    const melody: Array<[number, number]> = [
      // [beat offset, freq]
      [0,  A3], [1,  G3], [2,  F3], [3.5, D3],
      [4,  A3], [5,  C4], [6,  D4], [7.5, A3],
      [8,  G3], [9,  F3], [10, E3], [11.5,D3],
      [12, F3], [13, A3], [14, G3], [15.5,E3],
      [16, D3], [17, F3], [18, A3], [19.5,C4],
      [20, Bb3],[21, A3], [22, G3], [23.5,F3],
      [24, A4 * 0.5 * 2 * 0.5], // A3 reuse
      [24, D4], [25, C4], [26, Bb3],[27.5,A3],
      [28, G3], [29, F3], [30, E3], [31.5,D3],
    ];
    for (const [bOff, freq] of melody) {
      osc(freq, 'triangle', t + bOff * BEAT, BEAT * 0.55, 0.055, 0.01, 0.15);
    }

    // ── Walking bass (sine): steady quarter notes on root/fifth ──────────
    const bassLine: number[] = [
      D2, D2, A2, C3,   // bar1
      Bb2, Bb2, F3*0.5, A2,  // bar2 (Bb2,Bb2,F2,A2)
      F3*0.5, F3*0.5, C3, E3*0.5, // bar3 (F2,F2,C3,E2)
      C3, C3, G2, Bb2,  // bar4
      D2, D2, A2, C3,   // bar5
      Bb2, Bb2, F3*0.5, G2,  // bar6
      A2, A2, E3*0.5, G2,   // bar7
      D2, D2, A2, D2,   // bar8
    ];
    for (let i = 0; i < BEATS; i++) {
      osc(bassLine[i] ?? D2, 'sine', t + i * BEAT, BEAT * 0.7, 0.10, 0.01, 0.08);
    }

    // ── Light percussion: kick on 1 & 3, soft hi-hat 8ths ────────────────
    for (let bar = 0; bar < 8; bar++) {
      const tBar = t + bar * BAR;
      // Kick on beats 1 and 3
      noise(tBar,           0.18, 0.18, 80);
      noise(tBar + BEAT * 2, 0.18, 0.18, 80);
      // Soft hi-hat on every 8th note
      for (let e = 0; e < 8; e++) {
        noise(tBar + e * BEAT * 0.5, 0.06, 0.045, 8000);
      }
      // Sparse snare on beat 3 (bar 2,4,6,8 only for sparseness)
      if (bar % 2 === 1) {
        noise(tBar + BEAT * 2, 0.12, 0.10, 2000);
      }
    }

    // Schedule next loop iteration slightly before the loop end
    const msUntilLoop = (LOOP - 0.1) * 1000;
    this._scheduleHandle = window.setTimeout(() => {
      this._scheduleBuild(c, mg, t + LOOP, 0);
    }, msUntilLoop) as unknown as number;
  }

  // ─── BATTLE BGM ────────────────────────────────────────────────────────────
  // GameBoy Volley Fire-inspired shonen heroic track.
  // E minor, 170 BPM, 8-bar loop.
  // 4 channels mimicking GB hardware: square lead, square harmony, triangle bass, noise drums.

  private _scheduleBattle(c: AudioContext, mg: GainNode, t: number, _beat: number): void {
    if (this._stopFlag || this._current !== 'battle') return;

    const BPM  = 170;
    const BEAT = 60 / BPM;
    const S    = BEAT * 0.5;   // 8th note
    const X    = BEAT * 0.25;  // 16th note
    const BAR  = BEAT * 4;
    const LOOP = BAR * 8;      // 8-bar loop

    // ── Note frequencies (E natural minor: E F# G A B C D) ───────────────
    //  Octave 2
    const E2 = 82.41,  Fs2 = 87.31,  G2 = 98.00,  A2 = 110.00,
          B2 = 123.47, C3  = 130.81, D3 = 146.83;
    //  Octave 3
    const E3 = 164.81, Fs3 = 185.00, G3 = 196.00, A3 = 220.00,
          B3 = 246.94, C4  = 261.63, D4 = 293.66;
    //  Octave 4
    const E4 = 329.63, Fs4 = 369.99, G4 = 392.00, A4 = 440.00,
          B4 = 493.88, C5  = 523.25, D5 = 587.33, E5 = 659.25;

    // ── Low-level note emitters ───────────────────────────────────────────
    // Square wave — GB pulse channels 1 & 2
    const sq = (freq: number, tS: number, dur: number, vol: number): void => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square'; o.frequency.value = freq;
      // Instant-ish attack, short decay — classic chiptune envelope
      g.gain.setValueAtTime(0, tS);
      g.gain.linearRampToValueAtTime(vol, tS + 0.006);
      g.gain.setValueAtTime(vol, tS + dur * 0.55);
      g.gain.linearRampToValueAtTime(0, tS + dur);
      o.connect(g); g.connect(mg);
      o.start(tS); o.stop(tS + dur + 0.005);
    };

    // Triangle wave — GB channel 3 bass
    const tri = (freq: number, tS: number, dur: number, vol: number): void => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, tS);
      g.gain.setValueAtTime(vol, tS + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, tS + dur);
      o.connect(g); g.connect(mg);
      o.start(tS); o.stop(tS + dur + 0.005);
    };

    // Noise — GB channel 4 drums
    const drum = (tS: number, dur: number, vol: number, filterF: number, q = 1.8): void => {
      const bufSize = Math.ceil(c.sampleRate * Math.min(dur, 0.25));
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = filterF; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, tS);
      g.gain.exponentialRampToValueAtTime(0.0001, tS + dur);
      src.connect(f); f.connect(g); g.connect(mg);
      src.start(tS); src.stop(tS + dur + 0.005);
    };

    // ── CHANNEL 1 — Square lead melody (shonen heroic hook) ──────────────
    // 8-bar A-A' form. Bars 1-4: rising call phrase. Bars 5-8: higher answer.
    // Inspired by Volley Fire's energetic 8th-note runs and big octave leaps.
    const lead: Array<[number, number, number]> = [
      // [beat-offset, freq, duration-in-beats]
      // ── Bar 1: strong upward leap, E → B → E ─────────────────────────────
      [0,   E4, 0.5], [0.5, G4, 0.5], [1,   B4, 0.5], [1.5, G4, 0.25], [1.75, E4, 0.25],
      [2,   B4, 0.5], [2.5, A4, 0.25],[2.75, G4,0.25],[3,   Fs4,0.5],  [3.5, E4, 0.5],
      // ── Bar 2: response phrase, skipping up to D5 ─────────────────────────
      [4,   E4, 0.25],[4.25,Fs4,0.25],[4.5, G4, 0.5], [5,   A4, 0.5],  [5.5, B4, 0.5],
      [6,   D5, 0.5], [6.5, B4, 0.25],[6.75,A4, 0.25],[7,   G4, 0.5],  [7.5, Fs4,0.5],
      // ── Bar 3: riff — E pentatonic run ────────────────────────────────────
      [8,   E4, 0.5], [8.5, G4, 0.5], [9,   A4, 0.5], [9.5, B4, 0.5],
      [10,  G4, 0.25],[10.25,E4,0.25],[10.5,D4, 0.5], [11,  E4, 0.75], [11.75,D4,0.25],
      // ── Bar 4: closing phrase, fall to tonic ──────────────────────────────
      [12,  B3, 0.5], [12.5,D4, 0.5], [13,  E4, 0.5], [13.5,G4, 0.5],
      [14,  Fs4,0.5], [14.5,E4, 0.25],[14.75,D4,0.25],[15,  E4, 1.0],
      // ── Bar 5: A' — same idea, shifted an octave for climax ───────────────
      [16,  E5, 0.5], [16.5,D5, 0.5], [17,  B4, 0.5], [17.5,G4, 0.25],[17.75,A4,0.25],
      [18,  B4, 0.5], [18.5,C5, 0.25],[18.75,B4,0.25],[19,  A4, 0.5],  [19.5,G4, 0.5],
      // ── Bar 6: high run with syncopation ──────────────────────────────────
      [20,  G4, 0.25],[20.25,A4,0.25],[20.5, B4,0.5],  [21, D5, 0.5],  [21.5,E5, 0.5],
      [22,  D5, 0.25],[22.25,C5,0.25],[22.5, B4,0.5],  [23, A4, 0.5],  [23.5,Fs4,0.5],
      // ── Bar 7: building tension ────────────────────────────────────────────
      [24,  G4, 0.5], [24.5,A4, 0.5], [25,  B4, 0.75],[25.75,A4,0.25],
      [26,  G4, 0.5], [26.5,Fs4,0.5], [27,  E4, 0.75],[27.75,D4,0.25],
      // ── Bar 8: final rush back to tonic ────────────────────────────────────
      [28,  E4, 0.25],[28.25,Fs4,0.25],[28.5,G4, 0.25],[28.75,A4,0.25],
      [29,  B4, 0.25],[29.25,C5, 0.25],[29.5,B4, 0.25],[29.75,A4,0.25],
      [30,  G4, 0.5], [30.5,Fs4,0.5], [31,  E4, 1.0],
    ];
    for (const [bOff, freq, dur] of lead) {
      sq(freq, t + bOff * BEAT, dur * BEAT * 0.88, 0.055);
    }

    // ── CHANNEL 2 — Square harmony (parallel 3rds / counter-melody) ──────
    // Runs a 3rd below the lead for the first 4 bars, counter-melody bars 5-8.
    const harm: Array<[number, number, number]> = [
      // Bars 1-4: parallel thirds below lead
      [0,   C4, 0.5], [0.5, E4, 0.5], [1,   G4, 0.5], [1.5, E4, 0.25],[1.75,C4, 0.25],
      [2,   G4, 0.5], [2.5, Fs4,0.25],[2.75,E4, 0.25],[3,   D4, 0.5],  [3.5, C4, 0.5],
      [4,   C4, 0.25],[4.25,D4, 0.25],[4.5, E4, 0.5], [5,   Fs4,0.5],  [5.5, G4, 0.5],
      [6,   B4, 0.5], [6.5, G4, 0.25],[6.75,Fs4,0.25],[7,   E4, 0.5],  [7.5, D4, 0.5],
      [8,   C4, 0.5], [8.5, E4, 0.5], [9,   Fs4,0.5], [9.5, G4, 0.5],
      [10,  E4, 0.25],[10.25,C4,0.25],[10.5,B3, 0.5], [11,  C4, 1.0],
      [12,  G3, 0.5], [12.5,B3, 0.5], [13,  C4, 0.5], [13.5,E4, 0.5],
      [14,  D4, 0.5], [14.5,C4, 0.5], [15,  B3, 1.0],
      // Bars 5-8: counter-melody (lower, punchy answer)
      [16,  B3, 0.5], [16.5,A3, 0.5], [17,  G3, 0.5], [17.5,Fs3,0.5],
      [18,  G3, 0.5], [18.5,A3, 0.5], [19,  B3, 0.5], [19.5,C4, 0.5],
      [20,  E3, 0.5], [20.5,Fs3,0.5], [21,  G3, 0.5], [21.5,A3, 0.5],
      [22,  B3, 0.5], [22.5,G3, 0.5], [23,  Fs3,0.5], [23.5,E3, 0.5],
      [24,  E3, 0.5], [24.5,Fs3,0.5], [25,  G3, 0.75],[25.75,Fs3,0.25],
      [26,  E3, 0.5], [26.5,D3, 0.5], [27,  B2, 0.75],[27.75,A2,0.25],
      [28,  B2, 0.25],[28.25,C3,0.25],[28.5,D3, 0.25],[28.75,E3,0.25],
      [29,  Fs3,0.25],[29.25,G3,0.25],[29.5,Fs3,0.25],[29.75,E3,0.25],
      [30,  D3, 0.5], [30.5,B2, 0.5], [31,  E3, 1.0],
    ];
    for (const [bOff, freq, dur] of harm) {
      sq(freq, t + bOff * BEAT, dur * BEAT * 0.80, 0.030);
    }

    // ── CHANNEL 3 — Triangle bass (GB-style, no harmonics) ───────────────
    // Quarter-note root + syncopated 8th approach notes.
    // Chord: Em | Em | C | G | Em | Am | C | B (then loop)
    const bass: Array<[number, number, number]> = [
      // Bar 1 — Em
      [0,E2,0.9],[1,E2,0.9],[2,B2,0.45],[2.5,G2,0.45],[3,E2,0.9],[3.5,B2,0.45],
      // Bar 2 — Em
      [4,E2,0.9],[5,G2,0.9],[6,B2,0.9],[7,A2,0.45],[7.5,G2,0.45],
      // Bar 3 — C
      [8,C3,0.9],[9,C3,0.9],[10,G2,0.45],[10.5,E2,0.45],[11,C3,0.9],[11.5,D3,0.45],
      // Bar 4 — G
      [12,G2,0.9],[13,G2,0.9],[14,D3,0.9],[15,B2,0.45],[15.5,A2,0.45],
      // Bar 5 — Em
      [16,E2,0.9],[17,E2,0.9],[18,B2,0.45],[18.5,A2,0.45],[19,G2,0.9],[19.5,Fs2,0.45],
      // Bar 6 — Am
      [20,A2,0.9],[21,A2,0.9],[22,E2,0.45],[22.5,G2,0.45],[23,A2,0.9],[23.5,B2,0.45],
      // Bar 7 — C
      [24,C3,0.9],[25,C3,0.9],[26,G2,0.45],[26.5,E2,0.45],[27,C3,0.9],[27.5,D3,0.45],
      // Bar 8 — B (dominant, tension before loop)
      [28,B2,0.9],[29,B2,0.9],[30,Fs3,0.45],[30.5,D3,0.45],[31,B2,0.9],
    ];
    for (const [bOff, freq, dur] of bass) {
      tri(freq, t + bOff * BEAT, dur * BEAT, 0.18);
    }

    // ── CHANNEL 4 — Noise drums (GB-style) ───────────────────────────────
    // Kick on 1 & 3, snare on 2 & 4, 16th hi-hats, open hat on off-beats.
    for (let bar = 0; bar < 8; bar++) {
      const tb = t + bar * BAR;
      // Kick — beats 1 and 3 (low-tuned noise, short punchy)
      drum(tb,            0.10, 0.35, 80,  1.0);
      drum(tb + BEAT * 2, 0.10, 0.35, 80,  1.0);
      // Extra kick on beat 3.5 in bars 2,4,6,8 for shonen syncopation
      if (bar % 2 === 1) drum(tb + BEAT * 2.5, 0.07, 0.20, 100, 1.2);
      // Snare — beats 2 and 4 (mid-noise crack)
      drum(tb + BEAT,     0.09, 0.28, 2500, 2.5);
      drum(tb + BEAT * 3, 0.09, 0.28, 2500, 2.5);
      // Closed hi-hat — every 16th note (tight, high noise)
      for (let s = 0; s < 16; s++) {
        drum(tb + s * X, 0.03, 0.06, 10000, 4.0);
      }
      // Open hi-hat accent on the "and" of beat 2 (beat 2.5)
      drum(tb + BEAT * 2.5, 0.07, 0.10, 7000, 1.2);
    }
    // Crash on loop downbeat
    drum(t, 0.5, 0.14, 4000, 0.4);

    const msUntilLoop = (LOOP - 0.1) * 1000;
    this._scheduleHandle = window.setTimeout(() => {
      this._scheduleBattle(c, mg, t + LOOP, 0);
    }, msUntilLoop) as unknown as number;
  }
}

/** Module-level BGM singleton. */
const BGM = new MusicManager();

// ─── Utility helpers ──────────────────────────────────────────────────────────────────

function rotateCW(blocks: BlockOffset[]): BlockOffset[] {
  // Rotate 90° clockwise: (col, row) → (maxRow - row, col)
  const maxRow = Math.max(...blocks.map(b => b.row));
  return blocks.map(b => ({ col: maxRow - b.row, row: b.col }));
}

function normalise(blocks: BlockOffset[]): BlockOffset[] {
  const minCol = Math.min(...blocks.map(b => b.col));
  const minRow = Math.min(...blocks.map(b => b.row));
  return blocks.map(b => ({ col: b.col - minCol, row: b.row - minRow }));
}

function randomPiece(round = 1, weaponOrder: WeaponType[] = gameState.playerWeaponOrder): PieceDef {
  const shape = PIECE_SHAPES[Phaser.Math.Between(0, PIECE_SHAPES.length - 1)];
  const blocks = shape.map(b => ({ ...b }));
  const available = unlockedWeapons(weaponOrder, round);
  const wType = available[Phaser.Math.Between(0, available.length - 1)];
  return {
    blocks,
    weapons: [{ type: wType, blockIndex: Phaser.Math.Between(0, blocks.length - 1) }],
    rotation: 0,
  };
}

/** Check if two block-offset arrays share any (col,row) cell */
function overlaps(a: BlockOffset[], b: BlockOffset[]): boolean {
  return a.some(ba => b.some(bb => ba.col === bb.col && ba.row === bb.row));
}

/** Returns absolute grid cells occupied by a PlacedPiece */
function absoluteBlocks(p: PlacedPiece): BlockOffset[] {
  return p.blocks.map(b => ({ col: p.gridCol + b.col, row: p.gridRow + b.row }));
}

/** True if candidate blocks (absolute) touch any existing placed piece */
function touchesPlaced(candidate: BlockOffset[], placed: PlacedPiece[]): boolean {
  const neighbours = candidate.flatMap(b => [
    { col: b.col - 1, row: b.row },
    { col: b.col + 1, row: b.row },
    { col: b.col,     row: b.row - 1 },
    { col: b.col,     row: b.row + 1 },
  ]);
  const allPlaced = placed.flatMap(absoluteBlocks);
  return neighbours.some(n => allPlaced.some(p => p.col === n.col && p.row === n.row));
}

/** True if all blocks fit within grid bounds (uses live grid dims from gameState) */
function inBounds(blocks: BlockOffset[]): boolean {
  return blocks.every(b => b.col >= 0 && b.col < gameState.gridCols && b.row >= 0 && b.row < gameState.gridRows);
}

// ─── Shared draw helpers ──────────────────────────────────────────────────────

/** Draw a single block with weapon indicator into a Graphics object.
 *  Styled as a detailed sci-fi hull panel (R-Type / Raiden aesthetic).
 */
function drawBlock(
  g: Phaser.GameObjects.Graphics,
  px: number, py: number,
  fillColor: number, borderColor: number,
  alpha: number,
  weaponType: WeaponType | null,
  isCore = false,
  cs = CELL,   // cell size — allows scaled rendering
): void {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const pad = Math.max(1, cs * 0.05);
  const r   = Math.max(2, cs * 0.07);

  // ── Layer 1: outer hull plate (slightly lighter rim) ─────────────────────
  g.fillStyle(borderColor, alpha * 0.55);
  g.fillRoundedRect(px + pad * 0.5, py + pad * 0.5, cs - pad, cs - pad, r + 1);

  // ── Layer 2: main hull body ───────────────────────────────────────────────
  g.fillStyle(fillColor, alpha);
  g.fillRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);

  // ── Layer 3: recessed inner panel (dark chamfer) ──────────────────────────
  const ip = pad * 2.5;
  const innerDark = blendToward(fillColor, 0x000000, 0.38);
  g.fillStyle(innerDark, alpha * 0.7);
  g.fillRoundedRect(px + ip, py + ip, cs - ip * 2, cs - ip * 2, Math.max(1, r * 0.6));

  // ── Layer 4: highlight bevel (top-left rim glint) ─────────────────────────
  const hiColor = blendToward(fillColor, 0xffffff, 0.5);
  g.lineStyle(Math.max(1, cs * 0.025), hiColor, alpha * 0.55);
  // top edge glint
  g.lineBetween(px + pad + r, py + pad, px + cs - pad - r, py + pad);
  // left edge glint
  g.lineBetween(px + pad, py + pad + r, px + pad, py + cs - pad - r);

  // ── Layer 5: bottom-right shadow edge ────────────────────────────────────
  g.lineStyle(Math.max(1, cs * 0.025), 0x000000, alpha * 0.5);
  g.lineBetween(px + pad + r, py + cs - pad, px + cs - pad - r, py + cs - pad);
  g.lineBetween(px + cs - pad, py + pad + r, px + cs - pad, py + cs - pad - r);

  // ── Layer 6: border stroke ────────────────────────────────────────────────
  g.lineStyle(isCore ? Math.max(2, cs * 0.045) : Math.max(1, cs * 0.03),
              isCore ? 0x00ffee : borderColor, alpha);
  g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);

  // ── Layer 7: vent slits (horizontal lines near bottom of block) ───────────
  if (!isCore && cs >= 28) {
    const ventY  = py + cs - pad * 3.5;
    const ventX1 = px + ip + cs * 0.08;
    const ventX2 = px + cs - ip - cs * 0.08;
    const ventSpacing = cs * 0.045;
    g.lineStyle(Math.max(1, cs * 0.022), 0x000000, alpha * 0.55);
    g.lineBetween(ventX1, ventY,                  ventX2, ventY);
    g.lineBetween(ventX1, ventY + ventSpacing,    ventX2, ventY + ventSpacing);
    // vent highlight
    g.lineStyle(Math.max(1, cs * 0.015), hiColor, alpha * 0.2);
    g.lineBetween(ventX1, ventY - 1,              ventX2, ventY - 1);
  }

  // ── Core block: Gundam-style reactor (cyan, distinct from gun yellow) ────
  if (isCore) {
    g.lineStyle(isCore ? Math.max(2, cs * 0.045) : Math.max(1, cs * 0.03),
                0x00ffee, alpha);
    g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, r);
    g.fillStyle(0x00ffee, alpha * 0.12);
    g.fillCircle(cx, cy, cs * 0.42);
    g.fillStyle(0x00ccbb, alpha * 0.45);
    g.fillCircle(cx, cy, cs * 0.28);
    g.fillStyle(0x002222, alpha * 0.9);
    g.fillCircle(cx, cy, cs * 0.18);
    g.fillStyle(0x44ffee, alpha);
    g.fillCircle(cx, cy, cs * 0.09);
    const sr = cs * 0.38;
    g.lineStyle(Math.max(1, cs * 0.032), 0x00ffee, alpha * 0.7);
    g.lineBetween(cx, cy - cs * 0.18, cx, cy - sr);
    g.lineBetween(cx, cy + cs * 0.18, cx, cy + sr);
    g.lineBetween(cx - cs * 0.18, cy, cx - sr, cy);
    g.lineBetween(cx + cs * 0.18, cy, cx + sr, cy);
    g.lineStyle(Math.max(1, cs * 0.038), 0x00ffee, alpha * 0.9);
    g.strokeCircle(cx, cy, cs * 0.28);
    return;
  }

  // ── Weapon hardpoints ────────────────────────────────────────────────────
  if (!weaponType) return;

  const wColors: Record<string, number> = COLORS.weapon;
  const wColor = wColors[weaponType] ?? 0xffffff;

  switch (weaponType) {

    case 'gun': {
      // Cannon barrel: cylindrical turret ring + protruding barrel
      const tr = cs * 0.18;  // turret base radius
      g.fillStyle(blendToward(fillColor, 0x111111, 0.55), alpha);
      g.fillCircle(cx, cy, tr);
      g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
      g.strokeCircle(cx, cy, tr);
      // barrel pointing up
      const bw = cs * 0.09, bh = cs * 0.22;
      g.fillStyle(wColor, alpha);
      g.fillRect(cx - bw / 2, cy - tr - bh, bw, bh);
      // muzzle dot
      g.fillStyle(0xffffff, alpha * 0.9);
      g.fillCircle(cx, cy - tr - bh, cs * 0.04);
      break;
    }

    case 'laser': {
      // Targeting array: two angled emitter fins + centre lens
      const lensR = cs * 0.12;
      // emitter pods (left and right angled fins)
      const finW = cs * 0.08, finH = cs * 0.28;
      g.fillStyle(blendToward(wColor, 0x000000, 0.4), alpha);
      g.fillRect(cx - cs * 0.26 - finW / 2, cy - finH / 2, finW, finH);
      g.fillRect(cx + cs * 0.26 - finW / 2, cy - finH / 2, finW, finH);
      // fin edge lines
      g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.9);
      g.lineBetween(cx - cs * 0.26 - finW / 2, cy - finH / 2,
                    cx - cs * 0.26 + finW / 2, cy - finH / 2);
      g.lineBetween(cx + cs * 0.26 - finW / 2, cy - finH / 2,
                    cx + cs * 0.26 + finW / 2, cy - finH / 2);
      // centre targeting lens
      g.fillStyle(wColor, alpha * 0.25);
      g.fillCircle(cx, cy, lensR);
      g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
      g.strokeCircle(cx, cy, lensR);
      // crosshair inside lens
      g.lineStyle(Math.max(1, cs * 0.022), wColor, alpha * 0.8);
      g.lineBetween(cx - lensR * 0.6, cy, cx + lensR * 0.6, cy);
      g.lineBetween(cx, cy - lensR * 0.6, cx, cy + lensR * 0.6);
      break;
    }

    case 'beam': {
      // Super cannon: wide barrel housing + charge rings
      const bw = cs * 0.18, bh = cs * 0.35;
      // housing
      g.fillStyle(blendToward(fillColor, 0x000011, 0.6), alpha);
      g.fillRect(cx - bw / 2, cy - bh * 0.65, bw, bh);
      g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
      g.strokeRect(cx - bw / 2, cy - bh * 0.65, bw, bh);
      // charge rings stacked inside barrel
      const rr1 = bw * 0.38, rr2 = bw * 0.25;
      g.fillStyle(wColor, alpha * 0.35);
      g.fillCircle(cx, cy - bh * 0.18, rr1);
      g.fillStyle(wColor, alpha * 0.7);
      g.fillCircle(cx, cy - bh * 0.18, rr2);
      // side conduits
      g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.65);
      g.lineBetween(cx - cs * 0.3, cy + bh * 0.1,  cx - bw / 2, cy + bh * 0.1);
      g.lineBetween(cx + bw / 2,   cy + bh * 0.1,  cx + cs * 0.3, cy + bh * 0.1);
      break;
    }

    case 'mine': {
      // Mine dispenser: cylindrical pod with launch tube
      const pr = cs * 0.14;
      g.fillStyle(blendToward(wColor, 0x000000, 0.5), alpha);
      g.fillCircle(cx, cy, pr);
      g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
      g.strokeCircle(cx, cy, pr);
      // 6 launch spikes
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 - Math.PI / 6;
        const innerR = pr;
        const outerR = pr + cs * 0.11;
        g.lineStyle(Math.max(1, cs * 0.035), wColor, alpha);
        g.lineBetween(
          cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR,
          cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR,
        );
      }
      // centre hazard dot
      g.fillStyle(0xff2200, alpha);
      g.fillCircle(cx, cy, cs * 0.055);
      break;
    }

    case 'missile': {
      // Rocket pod: rectangular housing with two tube openings
      const pw = cs * 0.28, ph = cs * 0.32;
      g.fillStyle(blendToward(fillColor, 0x220000, 0.65), alpha);
      g.fillRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
      g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
      g.strokeRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
      // two tube openings at top
      const tubeR = cs * 0.055;
      g.fillStyle(0x000000, alpha);
      g.fillCircle(cx - pw * 0.28, cy - ph * 0.6, tubeR);
      g.fillCircle(cx + pw * 0.28, cy - ph * 0.6, tubeR);
      g.lineStyle(Math.max(1, cs * 0.025), wColor, alpha * 0.8);
      g.strokeCircle(cx - pw * 0.28, cy - ph * 0.6, tubeR);
      g.strokeCircle(cx + pw * 0.28, cy - ph * 0.6, tubeR);
      // centre warhead icon
      g.fillStyle(wColor, alpha * 0.85);
      g.fillTriangle(cx, cy - ph * 0.68,
                     cx - cs * 0.065, cy - ph * 0.4,
                     cx + cs * 0.065, cy - ph * 0.4);
      break;
    }

    case 'funnel': {
      // Bit-launcher: hexagonal emitter ring + core
      const hr = cs * 0.2;
      // hexagon fill
      g.fillStyle(wColor, alpha * 0.2);
      for (let s = 0; s < 6; s++) {
        const a1 = (s / 6) * Math.PI * 2 - Math.PI / 6;
        const a2 = ((s + 1) / 6) * Math.PI * 2 - Math.PI / 6;
        g.fillTriangle(cx, cy,
          cx + Math.cos(a1) * hr, cy + Math.sin(a1) * hr,
          cx + Math.cos(a2) * hr, cy + Math.sin(a2) * hr);
      }
      // hexagon border
      g.lineStyle(Math.max(1, cs * 0.04), wColor, alpha);
      g.strokeCircle(cx, cy, hr);
      // 6 node dots at vertices
      g.fillStyle(wColor, alpha);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 - Math.PI / 6;
        g.fillCircle(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr, cs * 0.035);
      }
      // centre orb
      g.fillStyle(0xffffff, alpha * 0.55);
      g.fillCircle(cx, cy, cs * 0.07);
      break;
    }

    case 'rock': {
      // Mass driver: heavy octagonal mass + launch groove
      const rr = cs * 0.17;
      g.fillStyle(blendToward(wColor, 0x000000, 0.35), alpha);
      for (let s = 0; s < 8; s++) {
        const a1 = (s / 8) * Math.PI * 2;
        const a2 = ((s + 1) / 8) * Math.PI * 2;
        const j  = s % 2 === 0 ? 0.82 : 1.0;
        g.fillTriangle(cx, cy,
          cx + Math.cos(a1) * rr * j, cy + Math.sin(a1) * rr * j,
          cx + Math.cos(a2) * rr * j, cy + Math.sin(a2) * rr * j);
      }
      g.lineStyle(Math.max(1, cs * 0.04), wColor, alpha * 0.9);
      g.strokeCircle(cx, cy, rr);
      // launch groove (vertical)
      g.lineStyle(Math.max(1, cs * 0.03), blendToward(wColor, 0xffffff, 0.5), alpha * 0.75);
      g.lineBetween(cx, cy - rr, cx, cy - rr - cs * 0.12);
      // centre slug
      g.fillStyle(wColor, alpha);
      g.fillCircle(cx, cy, cs * 0.065);
      break;
    }

    case 'homing': {
      // Seeker pod: swept delta fin shape + sensor eye
      const fh = cs * 0.24, fw = cs * 0.2;
      // swept body
      g.fillStyle(blendToward(wColor, 0x000000, 0.45), alpha);
      g.fillTriangle(cx, cy - fh,
                     cx - fw, cy + fh * 0.45,
                     cx + fw, cy + fh * 0.45);
      // fin edges
      g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
      g.lineBetween(cx, cy - fh, cx - fw, cy + fh * 0.45);
      g.lineBetween(cx, cy - fh, cx + fw, cy + fh * 0.45);
      g.lineBetween(cx - fw, cy + fh * 0.45, cx + fw, cy + fh * 0.45);
      // swept tail fins
      g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha * 0.7);
      g.lineBetween(cx - fw, cy + fh * 0.45, cx - fw * 1.55, cy + fh * 0.85);
      g.lineBetween(cx + fw, cy + fh * 0.45, cx + fw * 1.55, cy + fh * 0.85);
      // seeker eye
      g.fillStyle(wColor, alpha * 0.9);
      g.fillCircle(cx, cy - fh * 0.15, cs * 0.07);
      g.fillStyle(0xffffff, alpha * 0.8);
      g.fillCircle(cx, cy - fh * 0.15, cs * 0.03);
      break;
    }
  }
}

// ─── Lives icon helper ───────────────────────────────────────────────────────

/** Draw N heart icons into a Graphics object.
 *  Full hearts: bright red/pink filled heart. Empty hearts: dim outline only.
 *  Each heart is ~pipSize px tall, spaced by pipSize*1.8 px, drawn centred at (x, y). */
function drawLivesRow(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  total: number, filled: number,
  pipSize = 14,
): void {
  g.clear();
  const spacing = pipSize * 1.9;
  const totalW  = spacing * (total - 1);
  const startX  = x - totalW / 2;
  for (let i = 0; i < total; i++) {
    const px = startX + i * spacing;
    const isFull = i < filled;
    drawHeart(g, px, y, pipSize, isFull);
  }
}

/** Draw a single heart icon centred at (cx, cy) with the given size.
 *  Approximates a heart using two circle lobes + a downward triangle. */
function drawHeart(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  size: number,
  filled: boolean,
): void {
  // Heart geometry: two circle lobes on top, a triangle pointing down.
  // Lobe radius and offsets tuned for a classic heart silhouette.
  const r  = size * 0.34;   // lobe radius
  const lx = cx - r * 0.95; // left lobe centre x
  const rx = cx + r * 0.95; // right lobe centre x
  const ty = cy - size * 0.12; // top of lobes (y centre of circles)
  const bx = cx;             // bottom tip x
  const by = cy + size * 0.52; // bottom tip y
  // The heart outline as a polygon (approximated with arc + triangle)
  // We build pts: top arc of left lobe, top arc of right lobe, then tip.
  const pts: { x: number; y: number }[] = [];
  const arcSteps = 10;
  // Left lobe: arc from ~220° to 360° (bottom-left to top-centre)
  for (let s = 0; s <= arcSteps; s++) {
    const a = Math.PI * (1.18 + s * (1.0 / arcSteps)); // 213° → 393° = 33°
    pts.push({ x: lx + Math.cos(a) * r, y: ty + Math.sin(a) * r });
  }
  // Right lobe: arc from ~180° to ~360° (top-centre to bottom-right)
  for (let s = 0; s <= arcSteps; s++) {
    const a = Math.PI * (2.18 - s * (1.0 / arcSteps)); // 393° → 213° reversed
    pts.push({ x: rx + Math.cos(a) * r, y: ty + Math.sin(a) * r });
  }
  // Bottom tip
  pts.push({ x: bx, y: by });

  if (filled) {
    // Outer glow
    g.fillStyle(0xff2244, 0.20);
    g.fillCircle(cx, cy, size * 0.72);
    // Main fill — warm red
    g.fillStyle(0xff2244, 1);
    g.fillPoints(pts, true);
    // Highlight lobe-left glint
    g.fillStyle(0xff88aa, 0.65);
    g.fillCircle(lx - r * 0.15, ty - r * 0.2, r * 0.38);
    // Stroke
    g.lineStyle(Math.max(1, size * 0.07), 0xff6688, 1);
    g.strokePoints(pts, true);
  } else {
    // Empty: very dark fill + dim outline
    g.fillStyle(0x1a0810, 0.75);
    g.fillPoints(pts, true);
    g.lineStyle(Math.max(1, size * 0.07), 0x552233, 0.8);
    g.strokePoints(pts, true);
  }
}

// ─── Mecha explosion helper ───────────────────────────────────────────────────

/** 90s Gundam/mecha-anime style explosion:
 *  - Layered ellipses at varied angles (eclipse-burst silhouettes)
 *  - Jagged spike rays around the perimeter
 *  - Bright white core flash
 *  Draws geometry centred at local (0,0), then positions at (x,y) so
 *  the scale tween expands outward from the correct world point. */
function drawMechaExplosion(
  scene: Phaser.Scene,
  x: number, y: number,
  r: number,
  color: number,
  duration = 340,
  depth = 20,
): void {
  // Position the Graphics at (x,y); draw all geometry relative to (0,0)
  const g = scene.add.graphics({ x, y }).setDepth(depth);

  // ── Eclipse ellipses — multiple overlapping ovals at rotated angles ────────
  const ellipseCount = 5;
  const colors = [color, blendToward(color, 0xffffff, 0.45), blendToward(color, 0xff8800, 0.35), 0xffffff, blendToward(color, 0x000000, 0.3)];
  const alphas  = [0.85, 0.6, 0.5, 0.35, 0.7];
  for (let e = 0; e < ellipseCount; e++) {
    const ang  = (e / ellipseCount) * Math.PI;  // spread across 180°
    const rw   = r * (0.55 + e * 0.18);          // wide axis
    const rh   = r * (0.22 + e * 0.06);          // narrow axis (flat eclipse)
    const cos  = Math.cos(ang);
    const sin  = Math.sin(ang);
    const pts: { x: number; y: number }[] = [];
    const steps = 12;
    for (let s = 0; s < steps; s++) {
      const a  = (s / steps) * Math.PI * 2;
      const ex = Math.cos(a) * rw;
      const ey = Math.sin(a) * rh;
      pts.push({ x: ex * cos - ey * sin, y: ex * sin + ey * cos });
    }
    g.fillStyle(colors[e % colors.length], alphas[e % alphas.length]);
    g.fillPoints(pts, true);
  }

  // ── Jagged spike rays ─────────────────────────────────────────────────────
  const spikeCount = 10;
  for (let s = 0; s < spikeCount; s++) {
    const ang  = (s / spikeCount) * Math.PI * 2 + 0.18;
    const len  = r * (0.9 + (s % 3) * 0.35);
    const midA = ang + 0.14;
    const midLen = len * 0.45;
    g.fillStyle(blendToward(color, 0xffffff, 0.55), 0.75);
    g.fillTriangle(
      Math.cos(ang) * len,        Math.sin(ang) * len,
      Math.cos(midA) * midLen,    Math.sin(midA) * midLen,
      Math.cos(ang - 0.14) * midLen, Math.sin(ang - 0.14) * midLen,
    );
  }

  // ── Outer ring flash ─────────────────────────────────────────────────────
  g.lineStyle(Math.max(2, r * 0.1), blendToward(color, 0xffffff, 0.6), 0.8);
  g.strokeCircle(0, 0, r * 0.72);

  // ── Bright core ───────────────────────────────────────────────────────────
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(0, 0, r * 0.32);
  g.fillStyle(color, 0.7);
  g.fillCircle(0, 0, r * 0.18);

  // ── Tween out — scale around the Graphics' own position (x,y) ─────────────
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.4, scaleY: 1.4,
    duration,
    ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  });
}

/** Spawn rocky debris chunks when an asteroid is destroyed.
 *  Each chunk is a small irregular polygon that flies outward, tumbles, and fades. */
function spawnAsteroidDebris(
  scene: Phaser.Scene,
  x: number, y: number,
  r: number,
  seed: number,
): void {
  const chunkCount = Math.max(5, Math.min(9, Math.floor(r / 6)));
  for (let i = 0; i < chunkCount; i++) {
    // Spread evenly around the circle with jitter
    const baseAng = (i / chunkCount) * Math.PI * 2;
    const ang     = baseAng + ((seed * 0.07 + i * 0.31) % 1.0) * 0.8 - 0.4;
    const speed   = r * (1.8 + ((seed + i * 17) % 10) / 10 * 2.2);
    const cSize   = r * (0.18 + ((seed + i * 7) % 8) / 8 * 0.22);
    const facets  = 5 + (i % 3);

    // Build the chunk polygon relative to (0,0)
    const pts: { x: number; y: number }[] = [];
    for (let f = 0; f < facets; f++) {
      const fa = (f / facets) * Math.PI * 2;
      const jit = 0.65 + 0.35 * Math.sin((seed + i * 13 + f * 29) * 0.9);
      pts.push({ x: Math.cos(fa) * cSize * jit, y: Math.sin(fa) * cSize * jit });
    }

    // Rocky warm-brown colour, lighter on fresher chunks
    const t0   = (i / chunkCount);
    const col  = blendToward(0x9a6633, 0x5a3311, t0 * 0.6);
    const rimC = blendToward(col, 0xffffff, 0.35);

    const g = scene.add.graphics({ x, y }).setDepth(18);
    g.fillStyle(col, 1);
    g.fillPoints(pts, true);
    g.lineStyle(Math.max(1, cSize * 0.12), rimC, 0.7);
    g.strokePoints(pts, true);

    // Fly outward + tumble + fade
    const vx   = Math.cos(ang) * speed;
    const vy   = Math.sin(ang) * speed;
    const dur  = 520 + ((seed + i * 11) % 6) * 60; // 520–870 ms
    scene.tweens.add({
      targets: g,
      x: x + vx * (dur / 1000),
      y: y + vy * (dur / 1000),
      angle: ((i % 2 === 0) ? 1 : -1) * (120 + (i * 37) % 80),
      alpha: 0,
      duration: dur,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

// ─── Parallax star field helpers ──────────────────────────────────────────────────

interface StarLayer {
  stars:   { x: number; y: number }[];
  speed:   number;   // px/s downward (parallax scroll speed)
  radius:  number;   // dot size
  glint:   boolean;  // draw cross-glint lines
  colors:  number[]; // cycle through these per star
  graphics: Phaser.GameObjects.Graphics;
}

/** Create star layer data + a Graphics object for each layer.
 *  speedScale multiplies all layer speeds (1.0 = battle, 0.28 = build). */
function initStarLayers(
  scene: Phaser.Scene,
  speedScale: number,
): StarLayer[] {
  const H = GAME_HEIGHT;
  const W = GAME_WIDTH;

  const layerDefs = [
    // Layer 0: distant tiny dim stars — many, slow
    { count: 90,  speed: 45  * speedScale, radius: 1,   glint: false,
      colors: [0x8899aa, 0x99aabb, 0xaabbcc] },
    // Layer 1: mid-field stars — medium speed
    { count: 45,  speed: 100 * speedScale, radius: 1.5, glint: false,
      colors: [0xaabbcc, 0xbbccdd, 0xccdde0] },
    // Layer 2: bright foreground stars with glint — fastest, fewest
    { count: 14,  speed: 190 * speedScale, radius: 2,   glint: true,
      colors: [0xffffff, 0xe8f0ff, 0xfff8e0] },
  ];

  return layerDefs.map(def => {
    // Seed random positions spread across double the screen height
    // so the field looks full immediately (no empty top half on start)
    const stars = Array.from({ length: def.count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
    }));
    const g = scene.add.graphics().setDepth(0);
    return { stars, speed: def.speed, radius: def.radius,
             glint: def.glint, colors: def.colors, graphics: g };
  });
}

/** Advance star positions by dt seconds and redraw each layer. */
function updateStarLayers(layers: StarLayer[], dt: number): void {
  const H = GAME_HEIGHT;
  for (const layer of layers) {
    const g = layer.graphics;
    g.clear();
    const dist = layer.speed * dt;
    for (let i = 0; i < layer.stars.length; i++) {
      const s = layer.stars[i];
      s.y += dist;
      if (s.y > H) s.y -= H;  // wrap top
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

/** Simple linear blend between two hex colours. t=0 → a, t=1 → b */
function blendToward(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}

/**
 * Neighbour mask for tileset rendering.
 * Each flag is true when that side is occupied by another ship block.
 */
interface NeighbourMask {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Draw a hull block using a tileset approach:
 * - Exposed corners get a large 45° chamfer (angled armour cut)
 * - Adjacent edges are flush with the neighbouring block (no gap)
 * - Rich sci-fi hull texturing: raised rim, recessed panel, circuit lines, vents
 * - Weapon hardpoints drawn on top
 */
function drawHullBlock(
  g: Phaser.GameObjects.Graphics,
  px: number, py: number,
  fillColor: number, borderColor: number,
  alpha: number,
  weaponType: WeaponType | null,
  isCore: boolean,
  cs: number,
  nb: NeighbourMask,
): void {
  const cx = px + cs / 2;
  const cy = py + cs / 2;

  // ── Tileset geometry constants ──────────────────────────────────────────
  // Adjacent sides butt flush to the cell boundary (0 inset).
  // Exposed sides inset by RIM so the chamfer has room.
  // CHAMFER is how far the 45° cut travels along each exposed edge.
  const RIM     = Math.max(2, cs * 0.10);   // inset on every exposed edge
  const CHAMFER = Math.max(3, cs * 0.28);   // length of the 45° chamfer cut

  // Edge positions (flush on joined sides, inset on exposed sides)
  const eTop    = nb.top    ? py              : py + RIM;
  const eBottom = nb.bottom ? py + cs         : py + cs - RIM;
  const eLeft   = nb.left   ? px              : px + RIM;
  const eRight  = nb.right  ? px + cs         : px + cs - RIM;

  // Corner positions
  const tlX = eLeft;  const tlY = eTop;
  const trX = eRight; const trY = eTop;
  const brX = eRight; const brY = eBottom;
  const blX = eLeft;  const blY = eBottom;

  // ── Build hull polygon with 45° chamfers on exposed corners ─────────────
  // Walking CW: TL → along top → TR → along right → BR → along bottom → BL → along left
  // A corner gets chamfered only when BOTH its edges are exposed.
  const pts: { x: number; y: number }[] = [];

  // Top-Left corner
  if (!nb.top && !nb.left) {
    pts.push({ x: tlX, y: tlY + CHAMFER });   // end of left edge (coming up)
    pts.push({ x: tlX + CHAMFER, y: tlY });   // start of top edge (going right)
  } else {
    pts.push({ x: tlX, y: tlY });
  }

  // Top-Right corner
  if (!nb.top && !nb.right) {
    pts.push({ x: trX - CHAMFER, y: trY });   // along top edge inward
    pts.push({ x: trX, y: trY + CHAMFER });   // along right edge downward
  } else {
    pts.push({ x: trX, y: trY });
  }

  // Bottom-Right corner
  if (!nb.bottom && !nb.right) {
    pts.push({ x: brX, y: brY - CHAMFER });   // along right edge upward
    pts.push({ x: brX - CHAMFER, y: brY });   // along bottom edge inward
  } else {
    pts.push({ x: brX, y: brY });
  }

  // Bottom-Left corner
  if (!nb.bottom && !nb.left) {
    pts.push({ x: blX + CHAMFER, y: blY });   // along bottom edge inward
    pts.push({ x: blX, y: blY - CHAMFER });   // along left edge upward
  } else {
    pts.push({ x: blX, y: blY });
  }

  // ── Fill 1: drop-shadow (shifted down-right) ─────────────────────────────
  const shadowPts = pts.map(p => ({ x: p.x + 2, y: p.y + 2 }));
  g.fillStyle(0x000000, alpha * 0.5);
  g.fillPoints(shadowPts, true);

  // ── Fill 2: main hull armour plate ───────────────────────────────────────
  g.fillStyle(fillColor, alpha);
  g.fillPoints(pts, true);

  // ── Fill 3: recessed inner panel (darker) ────────────────────────────────
  // Inset the polygon uniformly to get the inner panel area
  const PI = Math.max(2, cs * 0.13);   // panel inset from hull edge
  const panelPts = [
    { x: tlX + PI, y: tlY + PI },
    { x: trX - PI, y: trY + PI },
    { x: brX - PI, y: brY - PI },
    { x: blX + PI, y: blY - PI },
  ];
  const panelDark = blendToward(fillColor, 0x000000, 0.45);
  g.fillStyle(panelDark, alpha * 0.85);
  g.fillPoints(panelPts, true);

  // ── Fill 4: second inner recess (very dark) ───────────────────────────────
  const PI2 = PI + Math.max(2, cs * 0.08);
  const innerPts = [
    { x: tlX + PI2, y: tlY + PI2 },
    { x: trX - PI2, y: trY + PI2 },
    { x: brX - PI2, y: brY - PI2 },
    { x: blX + PI2, y: blY - PI2 },
  ];
  const innerDark = blendToward(fillColor, 0x000000, 0.62);
  g.fillStyle(innerDark, alpha * 0.75);
  g.fillPoints(innerPts, true);

  // ── Lit bevel strips: walk the hull polygon edges ─────────────────────────
  // Top / left edges = bright; Bottom / right edges = dark
  const hiColor  = blendToward(fillColor, 0xffffff, 0.72);
  const bevW = Math.max(1, cs * 0.04);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dy <= 0) {
      // top / diagonal — bright highlight
      g.lineStyle(bevW, hiColor, alpha * 0.85);
    } else if (dx < 0) {
      // left-going diagonal — medium highlight
      g.lineStyle(bevW, hiColor, alpha * 0.55);
    } else if (dy > 0 && dx >= 0) {
      // right or down — shadow
      g.lineStyle(bevW, 0x000000, alpha * 0.55);
    } else {
      g.lineStyle(bevW, 0x000000, alpha * 0.35);
    }
    g.lineBetween(a.x, a.y, b.x, b.y);
  }

  // ── Outer border ─────────────────────────────────────────────────────────
  const borderW  = isCore ? Math.max(2, cs * 0.05) : Math.max(1, cs * 0.032);
  const borderCol = isCore ? 0xffe66d : borderColor;
  g.lineStyle(borderW, borderCol, alpha);
  g.strokePoints(pts, true);

  // ── Sci-fi tech-line details on the inner panel ───────────────────────────
  if (!isCore && cs >= 20) {
    const iX0 = tlX + PI2, iY0 = tlY + PI2;
    const iX1 = trX - PI2, iY1 = trY + PI2;
    const iX2 = trX - PI2, iY2 = brY - PI2;
    const iX3 = tlX + PI2, iY3 = brY - PI2;
    const iW   = iX1 - iX0;
    const iH   = iY3 - iY0;
    const detCol = blendToward(fillColor, 0xffffff, 0.55);
    // Diagonal slash — lower-left to upper-right across inner panel
    g.lineStyle(Math.max(1, cs * 0.025), detCol, alpha * 0.65);
    g.lineBetween(iX0, iY3, iX0 + iW * 0.55, iY0);
    // Parallel slash offset
    g.lineStyle(Math.max(1, cs * 0.018), detCol, alpha * 0.38);
    g.lineBetween(iX0 + iW * 0.45, iY3, iX1, iY0 + iH * 0.4);
    // Horizontal accent line in lower third
    g.lineStyle(Math.max(1, cs * 0.02), detCol, alpha * 0.5);
    g.lineBetween(iX0, iY0 + iH * 0.72, iX1, iY0 + iH * 0.72);
    // Small corner rivet dots at inner panel corners
    if (cs >= 30) {
      const rivR = Math.max(1, cs * 0.045);
      const rivCol = blendToward(fillColor, 0xffffff, 0.5);
      g.fillStyle(rivCol, alpha * 0.8);
      g.fillCircle(tlX + PI, tlY + PI, rivR);
      g.fillCircle(trX - PI, trY + PI, rivR);
      g.fillCircle(brX - PI, brY - PI, rivR);
      g.fillCircle(blX + PI, blY - PI, rivR);
    }
  }

  // ── Vent slits on every exposed edge ─────────────────────────────────────
  if (!isCore && cs >= 28) {
    const vLen = cs * 0.18;
    const vW   = Math.max(1, cs * 0.022);
    const vSpc = cs * 0.048;
    const ventDark = 0x000000;
    const ventHi   = blendToward(fillColor, 0xffffff, 0.45);
    // Bottom vent slits
    if (!nb.bottom) {
      const vy1 = brY - cs * 0.065;
      const vy2 = vy1 + vSpc;
      g.lineStyle(vW, ventDark, alpha * 0.7);
      g.lineBetween(cx - vLen, vy1, cx + vLen, vy1);
      g.lineBetween(cx - vLen, vy2, cx + vLen, vy2);
      g.lineStyle(Math.max(1, cs * 0.013), ventHi, alpha * 0.35);
      g.lineBetween(cx - vLen, vy1 - 1, cx + vLen, vy1 - 1);
    }
    // Top vent slits
    if (!nb.top) {
      const vy1 = tlY + cs * 0.065;
      const vy2 = vy1 + vSpc;
      g.lineStyle(vW, ventDark, alpha * 0.5);
      g.lineBetween(cx - vLen, vy1, cx + vLen, vy1);
      g.lineBetween(cx - vLen, vy2, cx + vLen, vy2);
    }
  }

  // ── Core block: Gundam-style power core (cyan/teal, NOT yellow) ─────────────
  if (isCore) {
    // Hull plate is already drawn above; add the core reactor on top
    // Outer energy halo
    g.fillStyle(0x00ffee, alpha * 0.12);
    g.fillCircle(cx, cy, cs * 0.44);
    // Mid ring — bright teal
    g.fillStyle(0x00ccbb, alpha * 0.45);
    g.fillCircle(cx, cy, cs * 0.30);
    // Inner reactor chamber (dark)
    g.fillStyle(0x002222, alpha * 0.9);
    g.fillCircle(cx, cy, cs * 0.20);
    // Core gem — bright cyan centre
    g.fillStyle(0x44ffee, alpha);
    g.fillCircle(cx, cy, cs * 0.10);
    // 4 cardinal spokes
    const sr = cs * 0.40;
    g.lineStyle(Math.max(1, cs * 0.035), 0x00ffee, alpha * 0.7);
    g.lineBetween(cx, cy - cs * 0.20, cx, cy - sr);
    g.lineBetween(cx, cy + cs * 0.20, cx, cy + sr);
    g.lineBetween(cx - cs * 0.20, cy, cx - sr, cy);
    g.lineBetween(cx + cs * 0.20, cy, cx + sr, cy);
    // 4 diagonal shorter spokes
    g.lineStyle(Math.max(1, cs * 0.022), 0x00ffee, alpha * 0.45);
    const ds = cs * 0.28;
    g.lineBetween(cx + cs * 0.14, cy - cs * 0.14, cx + ds * 0.72, cy - ds * 0.72);
    g.lineBetween(cx - cs * 0.14, cy - cs * 0.14, cx - ds * 0.72, cy - ds * 0.72);
    g.lineBetween(cx + cs * 0.14, cy + cs * 0.14, cx + ds * 0.72, cy + ds * 0.72);
    g.lineBetween(cx - cs * 0.14, cy + cs * 0.14, cx - ds * 0.72, cy + ds * 0.72);
    // Outer ring stroke
    g.lineStyle(Math.max(1, cs * 0.04), 0x00ffee, alpha * 0.9);
    g.strokeCircle(cx, cy, cs * 0.30);
    // Inner ring stroke (secondary)
    g.lineStyle(Math.max(1, cs * 0.025), 0x44ffee, alpha * 0.6);
    g.strokeCircle(cx, cy, cs * 0.20);
    return;
  }

  // ── Weapon hardpoints (drawn on top of hull) ──────────────────────────────
  if (!weaponType) return;

  const wColors: Record<string, number> = COLORS.weapon;
  const wColor = wColors[weaponType] ?? 0xffffff;

  switch (weaponType) {

    case 'gun': {
      // Turret base ring + barrel pointing up
      const tr = cs * 0.17;
      g.fillStyle(blendToward(fillColor, 0x111111, 0.55), alpha);
      g.fillCircle(cx, cy + cs * 0.04, tr);
      g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
      g.strokeCircle(cx, cy + cs * 0.04, tr);
      // barrel
      const bw = cs * 0.09, bh = cs * 0.24;
      g.fillStyle(wColor, alpha);
      g.fillRect(cx - bw / 2, cy + cs * 0.04 - tr - bh, bw, bh);
      // muzzle flash dot
      g.fillStyle(0xffffff, alpha * 0.9);
      g.fillCircle(cx, cy + cs * 0.04 - tr - bh, cs * 0.038);
      break;
    }

    case 'laser': {
      // Dual angled emitter fins + targeting lens
      const lensR = cs * 0.11;
      const finW = cs * 0.075, finH = cs * 0.26;
      g.fillStyle(blendToward(wColor, 0x000000, 0.4), alpha);
      g.fillRect(cx - cs * 0.25 - finW / 2, cy - finH / 2, finW, finH);
      g.fillRect(cx + cs * 0.25 - finW / 2, cy - finH / 2, finW, finH);
      // angled tip lines
      g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.9);
      g.lineBetween(cx - cs * 0.25 - finW / 2, cy - finH / 2,
                    cx - cs * 0.25 + finW / 2, cy - finH / 2);
      g.lineBetween(cx + cs * 0.25 - finW / 2, cy - finH / 2,
                    cx + cs * 0.25 + finW / 2, cy - finH / 2);
      // lens
      g.fillStyle(wColor, alpha * 0.22);
      g.fillCircle(cx, cy, lensR);
      g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
      g.strokeCircle(cx, cy, lensR);
      g.lineStyle(Math.max(1, cs * 0.02), wColor, alpha * 0.75);
      g.lineBetween(cx - lensR * 0.55, cy, cx + lensR * 0.55, cy);
      g.lineBetween(cx, cy - lensR * 0.55, cx, cy + lensR * 0.55);
      break;
    }

    case 'beam': {
      // Wide super-cannon housing + charge rings
      const bw = cs * 0.2, bh = cs * 0.34;
      g.fillStyle(blendToward(fillColor, 0x000011, 0.62), alpha);
      g.fillRect(cx - bw / 2, cy - bh * 0.68, bw, bh);
      g.lineStyle(Math.max(1, cs * 0.03), wColor, alpha);
      g.strokeRect(cx - bw / 2, cy - bh * 0.68, bw, bh);
      // charge rings
      g.fillStyle(wColor, alpha * 0.32);
      g.fillCircle(cx, cy - bh * 0.2, bw * 0.36);
      g.fillStyle(wColor, alpha * 0.7);
      g.fillCircle(cx, cy - bh * 0.2, bw * 0.22);
      // side conduits
      g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.6);
      g.lineBetween(cx - cs * 0.31, cy + bh * 0.08, cx - bw / 2, cy + bh * 0.08);
      g.lineBetween(cx + bw / 2,    cy + bh * 0.08, cx + cs * 0.31, cy + bh * 0.08);
      break;
    }

    case 'mine': {
      // Dispenser pod + 6 arming spikes
      const pr = cs * 0.13;
      g.fillStyle(blendToward(wColor, 0x000000, 0.5), alpha);
      g.fillCircle(cx, cy, pr);
      g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
      g.strokeCircle(cx, cy, pr);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 - Math.PI / 6;
        g.lineStyle(Math.max(1, cs * 0.032), wColor, alpha);
        g.lineBetween(
          cx + Math.cos(a) * pr, cy + Math.sin(a) * pr,
          cx + Math.cos(a) * (pr + cs * 0.1), cy + Math.sin(a) * (pr + cs * 0.1),
        );
      }
      g.fillStyle(0xff2200, alpha);
      g.fillCircle(cx, cy, cs * 0.05);
      break;
    }

    case 'missile': {
      // Dual-tube rocket pod
      const pw = cs * 0.28, ph = cs * 0.3;
      g.fillStyle(blendToward(fillColor, 0x220000, 0.65), alpha);
      g.fillRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
      g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha);
      g.strokeRoundedRect(cx - pw / 2, cy - ph * 0.72, pw, ph, Math.max(2, cs * 0.04));
      const tubeR = cs * 0.052;
      g.fillStyle(0x000000, alpha);
      g.fillCircle(cx - pw * 0.27, cy - ph * 0.58, tubeR);
      g.fillCircle(cx + pw * 0.27, cy - ph * 0.58, tubeR);
      g.lineStyle(Math.max(1, cs * 0.022), wColor, alpha * 0.8);
      g.strokeCircle(cx - pw * 0.27, cy - ph * 0.58, tubeR);
      g.strokeCircle(cx + pw * 0.27, cy - ph * 0.58, tubeR);
      g.fillStyle(wColor, alpha * 0.85);
      g.fillTriangle(cx, cy - ph * 0.68,
        cx - cs * 0.06, cy - ph * 0.42,
        cx + cs * 0.06, cy - ph * 0.42);
      break;
    }

    case 'funnel': {
      // Hexagonal bit-launcher
      const hr = cs * 0.19;
      g.fillStyle(wColor, alpha * 0.18);
      for (let s = 0; s < 6; s++) {
        const a1 = (s / 6) * Math.PI * 2 - Math.PI / 6;
        const a2 = ((s + 1) / 6) * Math.PI * 2 - Math.PI / 6;
        g.fillTriangle(cx, cy,
          cx + Math.cos(a1) * hr, cy + Math.sin(a1) * hr,
          cx + Math.cos(a2) * hr, cy + Math.sin(a2) * hr);
      }
      g.lineStyle(Math.max(1, cs * 0.038), wColor, alpha);
      g.strokeCircle(cx, cy, hr);
      g.fillStyle(wColor, alpha);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 - Math.PI / 6;
        g.fillCircle(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr, cs * 0.033);
      }
      g.fillStyle(0xffffff, alpha * 0.55);
      g.fillCircle(cx, cy, cs * 0.065);
      break;
    }

    case 'rock': {
      // Mass-driver: heavy jagged octagon
      const rr = cs * 0.16;
      g.fillStyle(blendToward(wColor, 0x000000, 0.35), alpha);
      for (let s = 0; s < 8; s++) {
        const a1 = (s / 8) * Math.PI * 2;
        const a2 = ((s + 1) / 8) * Math.PI * 2;
        const j  = s % 2 === 0 ? 0.8 : 1.0;
        g.fillTriangle(cx, cy,
          cx + Math.cos(a1) * rr * j, cy + Math.sin(a1) * rr * j,
          cx + Math.cos(a2) * rr * j, cy + Math.sin(a2) * rr * j);
      }
      g.lineStyle(Math.max(1, cs * 0.038), wColor, alpha * 0.9);
      g.strokeCircle(cx, cy, rr);
      g.lineStyle(Math.max(1, cs * 0.028), blendToward(wColor, 0xffffff, 0.5), alpha * 0.75);
      g.lineBetween(cx, cy - rr, cx, cy - rr - cs * 0.11);
      g.fillStyle(wColor, alpha);
      g.fillCircle(cx, cy, cs * 0.06);
      break;
    }

    case 'homing': {
      // Swept delta seeker pod + sensor eye
      const fh = cs * 0.23, fw = cs * 0.19;
      g.fillStyle(blendToward(wColor, 0x000000, 0.45), alpha);
      g.fillTriangle(cx, cy - fh,
        cx - fw, cy + fh * 0.42,
        cx + fw, cy + fh * 0.42);
      g.lineStyle(Math.max(1, cs * 0.028), wColor, alpha);
      g.lineBetween(cx, cy - fh, cx - fw, cy + fh * 0.42);
      g.lineBetween(cx, cy - fh, cx + fw, cy + fh * 0.42);
      g.lineBetween(cx - fw, cy + fh * 0.42, cx + fw, cy + fh * 0.42);
      g.lineStyle(Math.max(1, cs * 0.026), wColor, alpha * 0.65);
      g.lineBetween(cx - fw, cy + fh * 0.42, cx - fw * 1.5, cy + fh * 0.8);
      g.lineBetween(cx + fw, cy + fh * 0.42, cx + fw * 1.5, cy + fh * 0.8);
      g.fillStyle(wColor, alpha * 0.9);
      g.fillCircle(cx, cy - fh * 0.12, cs * 0.065);
      g.fillStyle(0xffffff, alpha * 0.8);
      g.fillCircle(cx, cy - fh * 0.12, cs * 0.028);
      break;
    }
  }
}

/** Build a NeighbourMask for one block given a set of occupied "col,row" keys */
function nbFromSet(col: number, row: number, occupied: Set<string>): NeighbourMask {
  return {
    top:    occupied.has(`${col},${row - 1}`),
    bottom: occupied.has(`${col},${row + 1}`),
    left:   occupied.has(`${col - 1},${row}`),
    right:  occupied.has(`${col + 1},${row}`),
  };
}

/** Draw a piece's blocks relative to a top-left pixel origin,
 *  using neighbour-aware hull tiles so adjacent blocks show flush joins. */
function drawPiece(
  g: Phaser.GameObjects.Graphics,
  originX: number, originY: number,
  piece: PieceDef,
  fillColor: number, borderColor: number,
  alpha: number,
  cs: number = CELL,
): void {
  // Build occupied set for this piece
  const occ = new Set<string>(piece.blocks.map(b => `${b.col},${b.row}`));
  piece.blocks.forEach((b, i) => {
    const wt = weaponTypeAtIndex(piece.weapons, i);
    const nb = nbFromSet(b.col, b.row, occ);
    drawHullBlock(g, originX + b.col * cs, originY + b.row * cs,
      fillColor, borderColor, alpha, wt, false, cs, nb);
  });
}

/** Return the WeaponType for block index i, or null if none. Last weapon wins on collision. */
function weaponTypeAtIndex(weapons: Weapon[], i: number): WeaponType | null {
  for (const w of weapons) {
    if (w.blockIndex === i) return w.type;
  }
  return null;
}

// ─── Global game state ────────────────────────────────────────────────────────

/** All weapon types that can appear after gun+laser, in a fixed source order. */
const ADVANCED_WEAPONS: WeaponType[] = ['beam', 'mine', 'missile', 'funnel', 'rock', 'homing'];

/** Generate a weapon unlock order: gun and laser are always positions 0 and 1,
 *  followed by a Phaser-shuffled copy of the remaining 6 weapons. */
function makeWeaponOrder(): WeaponType[] {
  const rest = Phaser.Utils.Array.Shuffle([...ADVANCED_WEAPONS]) as WeaponType[];
  return ['gun', 'laser', ...rest];
}

/** Weapons from `order` available at `round`.
 *  Gun (index 0) and laser (index 1) are both available from round 1.
 *  Each advanced weapon (index 2+) unlocks one per round starting at round 3.
 *  Formula: always include at least the first 2, then add one more per round above 1. */
function unlockedWeapons(order: WeaponType[], round: number): WeaponType[] {
  return order.slice(0, Math.max(2, round + 1));
}

const gameState: GameState = {
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
  enemyWeaponOrder:  [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD SCENE
// ═══════════════════════════════════════════════════════════════════════════════

class BuildScene extends Phaser.Scene {
  private rexUI!: any;

  // Grid display
  private gridOriginX = 0;
  private gridOriginY = 0;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private shipGraphics!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  private bonusTilesGraphics!: Phaser.GameObjects.Graphics;

  // Bonus weapon tiles
  private bonusTiles: { col: number; row: number; type: WeaponType }[] = [];
  private bonusTileLabels: Phaser.GameObjects.Text[] = [];

  // Tray of pieces to place
  private trayPieces: PieceDef[] = [];
  private trayGraphics: Phaser.GameObjects.Graphics[] = [];
  private trayContainers: Phaser.GameObjects.Container[] = [];

  // Drag state
  private dragging: PieceDef | null = null;
  private draggingIndex = -1;
  private dragContainer: Phaser.GameObjects.Container | null = null;
  private ghostCol = -1;
  private ghostRow = -1;
  private ghostValid = false;
  // Track drag-start position manually so threshold is reliable
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;

  // UI
  private hudText!: Phaser.GameObjects.Text;
  private livesGfx!: Phaser.GameObjects.Graphics;
  private fightBtn!: Phaser.GameObjects.Container;
  private starLayers: StarLayer[] = [];
  private infoText!: Phaser.GameObjects.Text;
  private pieceCountText!: Phaser.GameObjects.Text;

  // How many pieces the player gets this phase
  private piecesAllowed = INITIAL_PIECE_COUNT;

  // Set by init() when the grid was just expanded this phase
  private gridExpandedThisPhase = false;

  constructor() { super({ key: 'BuildScene' }); }

  init(data: { state?: GameState }): void {
    if (data?.state) Object.assign(gameState, data.state);

    // Generate weapon orders on first run (lazy: Phaser must be running for shuffle)
    if (gameState.playerWeaponOrder.length === 0) {
      gameState.playerWeaponOrder = makeWeaponOrder();
    }
    if (gameState.enemyWeaponOrder.length === 0) {
      gameState.enemyWeaponOrder = makeWeaponOrder();
    }

    this.piecesAllowed = gameState.placedPieces.length === 0
      ? INITIAL_PIECE_COUNT
      : SUBSEQUENT_PIECE_COUNT;

    // Grid expansion: if ship occupies ≥ GRID_EXPAND_THRESHOLD of cells, grow by +2/+2
    if (gameState.placedPieces.length > 0) {
      const occupied = gameState.placedPieces.flatMap(absoluteBlocks).length + 1; // +1 for core
      const total    = gameState.gridCols * gameState.gridRows;
      if (occupied / total >= GRID_EXPAND_THRESHOLD) {
        const oldCols = gameState.gridCols;
        const oldRows = gameState.gridRows;
        const newCols = oldCols + 2;
        const newRows = oldRows + 2;
        // Shift all placed pieces so the ship stays centred in the larger grid
        const dCol = 1; // +1 col each side
        const dRow = 1;
        for (const p of gameState.placedPieces) {
          p.gridCol += dCol;
          p.gridRow += dRow;
        }
        gameState.coreCol += dCol;
        gameState.coreRow += dRow;
        // Recompute cell size to fill the same pixel area
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

  create(): void {
    this.rexUI = (this as any).rexUI;

    // Clear stale references from a previous scene visit — Phaser already destroyed
    // these objects during shutdown, so just reset the arrays without calling destroy().
    this.trayContainers  = [];
    this.trayGraphics    = [];
    this.bonusTileLabels = [];
    this.dragging        = null;
    this.dragContainer   = null;
    this.draggingIndex   = -1;
    this.dragMoved       = false;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.bg.primary, COLORS.bg.primary, COLORS.bg.secondary, COLORS.bg.secondary, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.starLayers = initStarLayers(this, 0.28);
    BGM.playBuild();

    // Centre the grid on screen using live grid dimensions
    const cs    = gameState.cellSize;
    const gridW = gameState.gridCols * cs;
    const gridH = gameState.gridRows * cs;
    this.gridOriginX = Math.floor((GAME_WIDTH - gridW) / 2);
    this.gridOriginY = 180;

    // Layers
    this.gridGraphics      = this.add.graphics();
    this.bonusTilesGraphics = this.add.graphics();
    this.shipGraphics      = this.add.graphics();
    this.ghostGraphics     = this.add.graphics();

    this.drawGrid();
    this.spawnBonusTiles();
    this.drawBonusTiles();
    this.drawShip();

    // Toast if the grid expanded this phase
    if (this.gridExpandedThisPhase) {
      const toast = this.add.text(GAME_WIDTH / 2, this.gridOriginY + gameState.gridRows * gameState.cellSize + 24,
        `⚡ Grid expanded to ${gameState.gridCols}×${gameState.gridRows}!`, {
        fontSize: '26px', fontFamily: 'Arial', color: '#4ecdc4',
        fontStyle: 'bold', stroke: '#000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5, 0).setDepth(15);
      this.tweens.add({
        targets: toast, alpha: 0, y: toast.y - 40,
        delay: 1600, duration: 700, ease: 'Quad.easeIn',
        onComplete: () => toast.destroy(),
      });
    }

    // Generate tray — guarantee variety in round 1, and spotlight new unlocks thereafter.
    this.trayPieces = Array.from({ length: this.piecesAllowed }, () => randomPiece(gameState.round));

    if (gameState.round === 1) {
      // Round 1: ensure the player sees both gun AND laser by alternating assignments.
      // Pieces at even indices get gun, odd indices get laser (or vice-versa).
      this.trayPieces.forEach((p, i) => {
        const assignedType: WeaponType = i % 2 === 0 ? 'gun' : 'laser';
        if (p.weapons.length > 0) {
          p.weapons[0] = { type: assignedType, blockIndex: p.weapons[0].blockIndex };
        }
      });
    } else {
      // Round 2+: the newly unlocked advanced weapon is at index (round) in the order
      // (because both gun+laser are at 0,1 and advanced weapons start at index 2,
      // unlocking one per round starting from round 2).
      // newWeaponIdx = gameState.round  (e.g. round 2 → index 2, round 3 → index 3 …)
      const newWeaponIdx = gameState.round;
      const newWeapon: WeaponType | null =
        newWeaponIdx >= 2 && newWeaponIdx < gameState.playerWeaponOrder.length
          ? gameState.playerWeaponOrder[newWeaponIdx]
          : null;
      if (newWeapon) {
        const p = this.trayPieces[0];
        if (p.weapons.length > 0) {
          p.weapons[0] = { type: newWeapon, blockIndex: p.weapons[0].blockIndex };
        }
      }
    }
    this.buildTray();

    // ── Header panel ───────────────────────────────────────────────────────────────────
    const headerPanel = this.add.graphics();
    headerPanel.fillStyle(0x070c18, 0.88);
    headerPanel.fillRect(0, 0, GAME_WIDTH, 150);
    // accent line at bottom of header
    headerPanel.lineStyle(2, COLORS.accent.primary, 0.6);
    headerPanel.lineBetween(40, 148, GAME_WIDTH - 40, 148);
    // corner brackets
    const bLen = 24;
    headerPanel.lineStyle(2, COLORS.accent.primary, 0.45);
    headerPanel.lineBetween(16, 16, 16 + bLen, 16);
    headerPanel.lineBetween(16, 16, 16, 16 + bLen);
    headerPanel.lineBetween(GAME_WIDTH - 16, 16, GAME_WIDTH - 16 - bLen, 16);
    headerPanel.lineBetween(GAME_WIDTH - 16, 16, GAME_WIDTH - 16, 16 + bLen);
    // Fade header in from top
    headerPanel.setAlpha(0).setY(-30);
    this.tweens.add({ targets: headerPanel, alpha: 1, y: 0, duration: 380, ease: 'Quad.easeOut' });

    // HUD
    this.hudText = this.add.text(GAME_WIDTH / 2, 50, '', {
      ...TEXT_STYLES.hud, align: 'center',
    }).setOrigin(0.5, 0.5);
    this.hudText.setAlpha(0);
    this.tweens.add({ targets: this.hudText, alpha: 1, duration: 400, delay: 120, ease: 'Quad.easeOut' });
    // Lives pips graphic — positioned right of hudText, vertically centred in header
    this.livesGfx = this.add.graphics().setDepth(11);
    this.livesGfx.setAlpha(0);
    this.tweens.add({ targets: this.livesGfx, alpha: 1, duration: 400, delay: 120, ease: 'Quad.easeOut' });
    // NOTE: updateHud() is called after pieceCountText is created below

    this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 164, 'Drag pieces onto the grid  •  Tap to rotate', {
      fontSize: '24px', fontFamily: 'Arial', color: '#7799bb',
      align: 'center', fontStyle: 'italic',
    }).setOrigin(0.5, 0.5);

    // Piece count label — just above the tray slots
    // Top tray row centre: TRAY_Y_START - slotH * 1 * 1.15 = 1460 - 138 = 1322; place label ~34px above
    this.pieceCountText = this.add.text(GAME_WIDTH / 2, 1222, '', {
      fontSize: '38px', fontFamily: 'Arial Black', color: '#ffffff',
      fontStyle: 'bold', align: 'center',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(2);
    this.updateHud(); // both hudText and pieceCountText are ready now

    // Tray footer panel
    const trayPanel = this.add.graphics();
    trayPanel.fillStyle(0x070c18, 0.85);
    trayPanel.fillRect(0, GAME_HEIGHT - 310, GAME_WIDTH, 310);
    trayPanel.lineStyle(2, COLORS.accent.primary, 0.35);
    trayPanel.lineBetween(40, GAME_HEIGHT - 308, GAME_WIDTH - 40, GAME_HEIGHT - 308);
    trayPanel.setDepth(-1);

    // Fight button (hidden until all pieces placed)
    this.fightBtn = this.createButton('FIGHT!', COLORS.accent.secondary, () => this.startBattle());
    this.fightBtn.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 90);
    this.fightBtn.setVisible(false);

    // Weapon legend
    this.addLegend();

    // Global drag
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);
  }

  // ─── Grid drawing ──────────────────────────────────────────────────────────

  private drawGrid(): void {
    const g = this.gridGraphics;
    const cs = gameState.cellSize;
    const cols = gameState.gridCols;
    const rows = gameState.gridRows;
    g.clear();
    // Background fill
    g.fillStyle(COLORS.grid.fill, 1);
    g.fillRect(this.gridOriginX, this.gridOriginY, cols * cs, rows * cs);
    // Grid lines
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

  private drawShip(): void {
    const g = this.shipGraphics;
    const cs = gameState.cellSize;
    g.clear();

    // Build occupied-cell set: core + all placed blocks
    const occ = new Set<string>();
    occ.add(`${gameState.coreCol},${gameState.coreRow}`);
    for (const p of gameState.placedPieces) {
      for (const b of p.blocks) {
        occ.add(`${p.gridCol + b.col},${p.gridRow + b.row}`);
      }
    }

    // Draw core block
    const cpx = this.gridOriginX + gameState.coreCol * cs;
    const cpy = this.gridOriginY + gameState.coreRow * cs;
    const coreNB = nbFromSet(gameState.coreCol, gameState.coreRow, occ);
    drawHullBlock(g, cpx, cpy, 0x001a22, 0x00ffee, 1, null, true, cs, coreNB);

    // Draw placed pieces
    for (const p of gameState.placedPieces) {
      p.blocks.forEach((b, i) => {
        const wt  = weaponTypeAtIndex(p.weapons, i);
        const col = p.gridCol + b.col;
        const row = p.gridRow + b.row;
        const px  = this.gridOriginX + col * cs;
        const py  = this.gridOriginY + row * cs;
        const nb  = nbFromSet(col, row, occ);
        drawHullBlock(g, px, py, COLORS.block.placed, COLORS.block.border, 1, wt, false, cs, nb);
      });
    }
  }

  private drawGhost(): void {
    const g = this.ghostGraphics;
    const cs = gameState.cellSize;
    g.clear();
    if (!this.dragging || this.ghostCol < 0) return;
    const abs = this.dragging.blocks.map(b => ({
      col: this.ghostCol + b.col,
      row: this.ghostRow + b.row,
    }));
    const color = this.ghostValid ? COLORS.block.default : COLORS.ui.danger;
    abs.forEach(b => {
      const px = this.gridOriginX + b.col * cs;
      const py = this.gridOriginY + b.row * cs;
      drawBlock(g, px, py, color, this.ghostValid ? COLORS.block.border : COLORS.ui.danger, COLORS.block.ghostAlpha, null, false, cs);
    });
  }

  // ─── Bonus tiles ───────────────────────────────────────────────────────────

  private spawnBonusTiles(): void {
    this.bonusTiles = [];
    const occupied = new Set<string>();
    // Core is always occupied
    occupied.add(`${gameState.coreCol},${gameState.coreRow}`);
    // Already-placed blocks
    for (const p of gameState.placedPieces) {
      for (const b of p.blocks) {
        occupied.add(`${p.gridCol + b.col},${p.gridRow + b.row}`);
      }
    }

    // Pool = all weapons unlocked so far for the player
    const pool = unlockedWeapons(gameState.playerWeaponOrder, gameState.round);
    // Newly unlocked weapon this round: at index gameState.round in the order
    // (gun=0, laser=1 both available from round 1; index 2 unlocks at round 2, etc.)
    const newWeaponIdx = gameState.round;
    const newWeapon: WeaponType | null =
      newWeaponIdx >= 2 && newWeaponIdx < gameState.playerWeaponOrder.length
        ? gameState.playerWeaponOrder[newWeaponIdx]
        : null;

    // Build a list of all ship cells (core + placed blocks) for proximity check
    const shipCells: { col: number; row: number }[] = [
      { col: gameState.coreCol, row: gameState.coreRow },
      ...gameState.placedPieces.flatMap(p =>
        p.blocks.map(b => ({ col: p.gridCol + b.col, row: p.gridRow + b.row }))
      ),
    ];

    // Candidate cells: in-bounds, not occupied, within BONUS_TILE_MAX_DIST
    // Manhattan distance of any ship cell.
    const candidates: { col: number; row: number }[] = [];
    for (let col = 0; col < gameState.gridCols; col++) {
      for (let row = 0; row < gameState.gridRows; row++) {
        if (occupied.has(`${col},${row}`)) continue;
        const nearEnough = shipCells.some(
          s => Math.abs(col - s.col) + Math.abs(row - s.row) <= BONUS_TILE_MAX_DIST
        );
        if (nearEnough) candidates.push({ col, row });
      }
    }

    // Shuffle the candidate list so we can pick from it without replacement
    Phaser.Utils.Array.Shuffle(candidates);
    let candidateIdx = 0;

    /** Place one tile of a specific type from the candidate pool. Returns true on success. */
    const placeTile = (type: WeaponType): boolean => {
      while (candidateIdx < candidates.length) {
        const { col, row } = candidates[candidateIdx++];
        const key = `${col},${row}`;
        if (occupied.has(key)) continue; // already claimed by a previous tile
        occupied.add(key);
        this.bonusTiles.push({ col, row, type });
        return true;
      }
      return false;
    };

    // If there is a newly unlocked weapon, guarantee one tile for it
    if (newWeapon) placeTile(newWeapon);

    // Fill remaining slots from the full unlocked pool at random
    while (this.bonusTiles.length < BONUS_TILE_COUNT) {
      const type = pool[Phaser.Math.Between(0, pool.length - 1)];
      if (!placeTile(type)) break; // no more candidates
    }
  }

  private drawBonusTiles(): void {
    const g = this.bonusTilesGraphics;
    const cs = gameState.cellSize;
    g.clear();
    const wColors: Record<string, number> = COLORS.weapon;
    for (const tile of this.bonusTiles) {
      const px = this.gridOriginX + tile.col * cs;
      const py = this.gridOriginY + tile.row * cs;
      const glowColor = wColors[tile.type] ?? 0xffffff;
      // Darken the weapon colour for the cell background fill
      const r = ((glowColor >> 16) & 0xff) >> 2;
      const grn = ((glowColor >> 8) & 0xff) >> 2;
      const b = (glowColor & 0xff) >> 2;
      const fillColor = (r << 16) | (grn << 8) | b;
      const pad = Math.max(2, cs * 0.06);
      // Glowing cell background
      g.fillStyle(fillColor, 0.85);
      g.fillRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, Math.max(4, cs * 0.11));
      g.lineStyle(2, glowColor, 0.9);
      g.strokeRoundedRect(px + pad, py + pad, cs - pad * 2, cs - pad * 2, Math.max(4, cs * 0.11));
      // Weapon icon — reuse the existing drawBlock icon logic
      drawBlock(g, px, py, fillColor, glowColor, 1, tile.type, false, cs);
    }
    this.refreshBonusTileLabels();
  }

  private refreshBonusTileLabels(): void {
    // Destroy old label texts
    for (const t of this.bonusTileLabels) t.destroy();
    this.bonusTileLabels = [];
    const cs = gameState.cellSize;
    const wColors: Record<string, number> = COLORS.weapon;
    const wNames: Record<string, string> = {
      gun: 'GUN', laser: 'LASER', beam: 'BEAM', mine: 'MINE',
      missile: 'MSSL', funnel: 'FUNNEL', rock: 'ROCK', homing: 'HOME',
    };
    for (const tile of this.bonusTiles) {
      const cx = this.gridOriginX + tile.col * cs + cs / 2;
      const cy = this.gridOriginY + tile.row * cs + cs / 2;
      const colNum = wColors[tile.type] ?? 0xffffff;
      const color = '#' + colNum.toString(16).padStart(6, '0');
      const label = wNames[tile.type] ?? tile.type.toUpperCase();
      const fontSize = Math.max(10, Math.round(cs * 0.22));
      const t = this.add.text(cx, cy, label + '\nFREE', {
        fontSize: `${fontSize}px`, fontFamily: 'Arial', color,
        fontStyle: 'bold', align: 'center',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setDepth(5);
      this.bonusTileLabels.push(t);
    }
  }



  private readonly TRAY_Y_START = 1460;
  private readonly TRAY_SLOT_W  = GAME_WIDTH / 2;
  private readonly TRAY_ROWS    = 2;

  private buildTray(): void {
    // Destroy old
    this.trayContainers.forEach(c => c.destroy());
    this.trayGraphics.forEach(g => g.destroy());
    this.trayContainers = [];
    this.trayGraphics = [];

    // 2-column × 2-row grid so each slot is big enough for wide pieces
    const slotW = this.TRAY_SLOT_W;   // GAME_WIDTH / 2
    const slotH = 120;
    const cols  = 2;

    this.trayPieces.forEach((piece, idx) => {
      const col    = idx % cols;
      const row    = Math.floor(idx / cols);
      const slotCx = (col + 0.5) * slotW;
      const slotCy = this.TRAY_Y_START - slotH * (this.TRAY_ROWS - 1 - row) * 1.15;

      // Slot bg
      const bg = this.add.graphics();
      bg.fillStyle(COLORS.bg.panel, 1);
      bg.fillRoundedRect(slotCx - slotW / 2 + 6, slotCy - slotH / 2 + 4, slotW - 12, slotH - 8, 10);
      bg.lineStyle(2, COLORS.ui.border, 1);
      bg.strokeRoundedRect(slotCx - slotW / 2 + 6, slotCy - slotH / 2 + 4, slotW - 12, slotH - 8, 10);

      // Piece graphic
      const pieceG = this.add.graphics();
      this.trayGraphics.push(pieceG);
      this.redrawTrayPiece(idx);

      // Hit area container — full slot size so any touch on the slot registers
      const container = this.add.container(slotCx, slotCy);
      container.setSize(slotW - 12, slotH - 8);
      container.setInteractive({ useHandCursor: true });
      this.trayContainers.push(container);

      // Look up live index at event time so splice re-indexing never breaks this
      container.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        const liveIdx = this.trayContainers.indexOf(container);
        if (liveIdx < 0) return;
        this.startDrag(liveIdx, ptr.x, ptr.y);
      });
    });
  }

  private piecePixelSize(piece: PieceDef): { w: number; h: number } {
    const maxCol = Math.max(...piece.blocks.map(b => b.col));
    const maxRow = Math.max(...piece.blocks.map(b => b.row));
    const cs = gameState.cellSize;
    return { w: (maxCol + 1) * cs, h: (maxRow + 1) * cs };
  }

  private redrawTrayPiece(idx: number): void {
    const piece = this.trayPieces[idx];
    const g = this.trayGraphics[idx];
    if (!g || !piece) return;
    g.clear();

    const slotW = this.TRAY_SLOT_W;
    const slotH = 120;
    const cols  = 2;
    const col   = idx % cols;
    const row   = Math.floor(idx / cols);
    const slotCx = (col + 0.5) * slotW;
    const slotCy = this.TRAY_Y_START - slotH * (this.TRAY_ROWS - 1 - row) * 1.15;

    // Scale piece to fit inside slot
    const { w, h } = this.piecePixelSize(piece);
    const maxW = slotW - 24;
    const maxH = slotH - 16;
    const scale = Math.min(maxW / w, maxH / h, 1);
    const drawW = w * scale;
    const drawH = h * scale;
    const ox = slotCx - drawW / 2;
    const oy = slotCy - drawH / 2;

    // Draw scaled using drawPiece (neighbour-aware hull tiles)
    const cs = gameState.cellSize;
    const scaledCs = cs * scale;
    drawPiece(g, ox, oy, piece, COLORS.block.default, COLORS.block.border, 1, scaledCs);
  }

  // ─── Drag ──────────────────────────────────────────────────────────────────

  private startDrag(idx: number, px: number, py: number): void {
    const piece = this.trayPieces[idx];
    if (!piece) return;
    SFX.play('piece_pickup');
    this.dragging = piece;
    this.draggingIndex = idx;
    this.dragStartX = px;
    this.dragStartY = py;
    this.dragMoved = false;

    // Create floating drag visual (hidden until moved, so a tap just shows briefly)
    if (this.dragContainer) this.dragContainer.destroy();
    const g = this.add.graphics();
    const { w, h } = this.piecePixelSize(piece);
    drawPiece(g, -w / 2, -h / 2, piece, COLORS.block.default, COLORS.block.border, 0.85);
    this.dragContainer = this.add.container(px, py, [g]);
    this.dragContainer.setDepth(10);
    this.dragContainer.setVisible(false); // shown on first move
  }

  private onPointerMove(ptr: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const dx = ptr.x - this.dragStartX;
    const dy = ptr.y - this.dragStartY;
    if (!this.dragMoved && Math.hypot(dx, dy) > 20) {
      this.dragMoved = true;
      this.dragContainer?.setVisible(true);
      // Hide tray graphic only once we're sure it's a drag
      this.trayGraphics[this.draggingIndex]?.setVisible(false);
    }
    if (!this.dragMoved) return;
    if (this.dragContainer) {
      this.dragContainer.setPosition(ptr.x, ptr.y);
    }
    // Compute ghost position (use live cellSize for snapping).
    // Subtract cs/2 so the ghost top-left aligns with the drag visual's top-left
    // (the drag visual is centred on the pointer, so its TL is cs/2 above-left).
    const relX = ptr.x - this.gridOriginX;
    const relY = ptr.y - this.gridOriginY;
    const cs   = gameState.cellSize;
    this.ghostCol = Math.floor((relX - cs / 2) / cs);
    this.ghostRow = Math.floor((relY - cs / 2) / cs);
    this.validateGhost();
    this.drawGhost();
  }

  private validateGhost(): void {
    if (!this.dragging) { this.ghostValid = false; return; }
    const abs = this.dragging.blocks.map(b => ({
      col: this.ghostCol + b.col,
      row: this.ghostRow + b.row,
    }));
    if (!inBounds(abs)) { this.ghostValid = false; return; }
    // Cannot overlap the core
    if (abs.some(b => b.col === gameState.coreCol && b.row === gameState.coreRow)) {
      this.ghostValid = false; return;
    }
    if (overlaps(abs, gameState.placedPieces.flatMap(absoluteBlocks))) {
      this.ghostValid = false; return;
    }
    // First piece must touch the core; subsequent pieces must touch core OR any placed block
    const coreAsPlaced: BlockOffset[] = [{ col: gameState.coreCol, row: gameState.coreRow }];
    const allOccupied: BlockOffset[] = [...coreAsPlaced, ...gameState.placedPieces.flatMap(absoluteBlocks)];
    this.ghostValid = abs.some(b =>
      allOccupied.some(o => Math.abs(b.col - o.col) + Math.abs(b.row - o.row) === 1)
    );
  }

  private onPointerUp(_ptr: Phaser.Input.Pointer): void {
    if (!this.dragging) return;

    if (!this.dragMoved) {
      // Tap = rotate
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

  private cancelDrag(): void {
    if (this.dragContainer) { this.dragContainer.destroy(); this.dragContainer = null; }
    if (this.draggingIndex >= 0) {
      this.trayGraphics[this.draggingIndex]?.setVisible(true);
    }
    this.dragging = null;
    this.draggingIndex = -1;
    this.dragMoved = false;
  }

  private rotateTrayPiece(idx: number): void {
    const piece = this.trayPieces[idx];
    if (!piece) return;
    SFX.play('piece_rotate');
    piece.blocks = normalise(rotateCW(piece.blocks));
    piece.rotation = (piece.rotation + 1) % 4;
    this.redrawTrayPiece(idx);
  }

  private placePiece(idx: number, gridCol: number, gridRow: number): void {
    const piece = this.trayPieces[idx];
    if (!piece) return;

    const newPiece: PlacedPiece = {
      gridCol, gridRow,
      blocks: piece.blocks.map(b => ({ ...b })),
      weapons: piece.weapons.map(w => ({ ...w })),
    };
    gameState.placedPieces.push(newPiece);
    SFX.play('piece_place');

    // Check if any block of the newly placed piece landed on a bonus tile
    this.claimBonusTiles(newPiece);

    // Destroy drag visual
    if (this.dragContainer) { this.dragContainer.destroy(); this.dragContainer = null; }

    // Clear drag state before rebuilding tray
    this.dragging = null;
    this.draggingIndex = -1;
    this.dragMoved = false;

    // Remove placed piece from data array
    this.trayPieces.splice(idx, 1);

    // Fully rebuild tray so positions, graphics, and hit areas are all consistent
    this.buildTray();

    this.drawBonusTiles();
    this.drawShip();
    this.updateHud();

    if (this.trayPieces.length === 0) {
      this.showFightButton();
    }
  }

  private rebuildTrayAfterRemove(): void {
    // No longer used — buildTray() is called directly after placement
  }

  /** Check if any blocks of the just-placed piece overlap a bonus tile. If so,
   *  grant the bonus weapon on that block, displacing any existing weapon to the
   *  nearest free block (by grid distance) within the piece. */
  private claimBonusTiles(placed: PlacedPiece): void {
    let anyClaimedFlash = false;
    for (let ti = this.bonusTiles.length - 1; ti >= 0; ti--) {
      const tile = this.bonusTiles[ti];
      // Find which block in this piece (if any) lands on the tile
      const hitIdx = placed.blocks.findIndex(
        b => placed.gridCol + b.col === tile.col && placed.gridRow + b.row === tile.row
      );
      if (hitIdx < 0) continue;

      // If another weapon already occupies hitIdx, move it to the nearest free block.
      const existingWeaponIdx = placed.weapons.findIndex(w => w.blockIndex === hitIdx);
      if (existingWeaponIdx >= 0) {
        // Build set of block indices already carrying a weapon (excluding hitIdx,
        // since that weapon is about to move away).
        const takenIndices = new Set(placed.weapons.map(w => w.blockIndex));
        takenIndices.delete(hitIdx);

        // Find the free block closest (Manhattan in piece-local grid) to hitIdx.
        const hitBlock = placed.blocks[hitIdx];
        let bestFreeIdx = -1;
        let bestDist = Infinity;
        for (let bi = 0; bi < placed.blocks.length; bi++) {
          if (bi === hitIdx || takenIndices.has(bi)) continue;
          const b = placed.blocks[bi];
          const d = Math.abs(b.col - hitBlock.col) + Math.abs(b.row - hitBlock.row);
          if (d < bestDist) { bestDist = d; bestFreeIdx = bi; }
        }

        if (bestFreeIdx >= 0) {
          // Move the displaced weapon to the nearest free block
          placed.weapons[existingWeaponIdx] = {
            ...placed.weapons[existingWeaponIdx],
            blockIndex: bestFreeIdx,
          };
        } else {
          // Single-block piece (or all other blocks taken): drop the displaced weapon
          placed.weapons.splice(existingWeaponIdx, 1);
        }
      }

      // Grant the bonus weapon at the hit block
      placed.weapons.push({ type: tile.type, blockIndex: hitIdx });

      // Remove consumed tile
      this.bonusTiles.splice(ti, 1);

      // Flash at tile world position
      const cs = gameState.cellSize;
      const px = this.gridOriginX + tile.col * cs + cs / 2;
      const py = this.gridOriginY + tile.row * cs + cs / 2;
      const wColors: Record<string, number> = COLORS.weapon;
      const flashColor = wColors[tile.type] ?? 0xffffff;
      drawMechaExplosion(this, px, py, cs * 0.62, flashColor, 420, 20);

      // Show a label popup
      const wNames: Record<string, string> = {
        gun: 'GUN', laser: 'LASER', beam: 'BEAM', mine: 'MINE',
        missile: 'MISSILE', funnel: 'FUNNEL', rock: 'ROCK', homing: 'HOMING',
      };
      const wLabel = wNames[tile.type] ?? tile.type.toUpperCase();
      const flashHex = '#' + flashColor.toString(16).padStart(6, '0');
      const label = `⚡ FREE ${wLabel}!`;
      const popup = this.add.text(px, py - cs * 0.6, label, {
        fontSize: '26px', fontFamily: 'Arial', color: flashHex,
        fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(21);
      this.tweens.add({
        targets: popup,
        y: py - cs * 1.6,
        alpha: 0,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => popup.destroy(),
      });

      anyClaimedFlash = true;
      SFX.play('bonus_pickup');
      // Only claim one tile per piece (first hit wins)
      break;
    }
    void anyClaimedFlash;
  }

  // ─── Camera centering ──────────────────────────────────────────────────────

  private centerCamera(): void {
    if (gameState.placedPieces.length === 0) return;
    const allBlocks = gameState.placedPieces.flatMap(absoluteBlocks);
    const minCol = Math.min(...allBlocks.map(b => b.col));
    const maxCol = Math.max(...allBlocks.map(b => b.col));
    const minRow = Math.min(...allBlocks.map(b => b.row));
    const maxRow = Math.max(...allBlocks.map(b => b.row));

    const shipW = (maxCol - minCol + 1) * gameState.cellSize;
    const shipH = (maxRow - minRow + 1) * gameState.cellSize;

    // Available grid area height (below HUD)
    const areaH = this.TRAY_Y_START - 100 - 180;
    const areaW = GAME_WIDTH - 48;

    // Scale so ship fits nicely
    const scaleX = areaW / (gameState.gridCols * gameState.cellSize);
    const scaleY = areaH / (gameState.gridRows * gameState.cellSize);
    const scale  = Math.min(scaleX, scaleY, 1);

    // We don't actually zoom the camera here (keep simple); just note the ship position
    void shipW; void shipH; void scale;
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  private updateHud(): void {
    const remaining = this.trayPieces.length;
    const phase = gameState.round === 1 ? 'Build Your Ship' : `Round ${gameState.round} — Add Pieces`;
    this.hudText?.setText(phase);
    // Draw lives hearts below the phase text, centred in the header
    if (this.livesGfx) {
      drawLivesRow(this.livesGfx, GAME_WIDTH / 2, 112, PLAYER_LIVES, gameState.lives, 16);
    }
    if (this.pieceCountText) {
      if (remaining === 0) {
        this.pieceCountText.setText('All pieces placed!').setVisible(true).setColor('#4ecdc4');
      } else {
        const label = remaining === 1 ? '1 piece to place' : `${remaining} pieces to place`;
        this.pieceCountText.setText(label).setVisible(true).setColor('#ffffff');
      }
    }
  }

  private showFightButton(): void {
    this.fightBtn.setVisible(true);
    this.infoText.setText('Ship complete! Ready to fight?');
    this.tweens.add({
      targets: this.fightBtn,
      scaleX: 1.04, scaleY: 1.04,
      duration: 500, yoyo: true, repeat: -1,
    });
  }

  private addLegend(): void {
    // Build entries from the player's actual weapon unlock order this run
    const labelFor: Record<WeaponType, string> = {
      gun: 'Gun', laser: 'Laser', beam: 'Beam', mine: 'Mine',
      missile: 'Missile', funnel: 'Funnel', rock: 'Rock', homing: 'Homing',
    };
    const entries = gameState.playerWeaponOrder.map((type, i) => ({
      type,
      label: labelFor[type],
      round: i <= 1 ? 1 : i,
    }));
    const wColors: Record<string, number> = COLORS.weapon;
    const rowH   = 34;
    const startY = 168;
    const panelW = 130;
    const iconX  = GAME_WIDTH - 16;
    const textX  = GAME_WIDTH - 32;

    // Panel background
    const panelH = entries.length * rowH + 16;
    const legendBg = this.add.graphics();
    legendBg.fillStyle(0x070c18, 0.72);
    legendBg.fillRoundedRect(GAME_WIDTH - panelW - 4, startY - 10, panelW + 4, panelH, 8);
    legendBg.lineStyle(1, COLORS.ui.border, 0.5);
    legendBg.strokeRoundedRect(GAME_WIDTH - panelW - 4, startY - 10, panelW + 4, panelH, 8);
    // Header label
    this.add.text(GAME_WIDTH - panelW / 2 - 4, startY - 4, 'WEAPONS', {
      fontSize: '13px', fontFamily: 'Arial', color: '#445566',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1);

    entries.forEach((entry, i) => {
      const y = startY + i * rowH + rowH / 2;
      const locked  = entry.round > gameState.round;
      const color   = wColors[entry.type] ?? 0xffffff;
      const alpha   = locked ? 0.22 : 1;
      const hexStr  = '#' + color.toString(16).padStart(6, '0');
      const labelColor = locked ? '#334455' : hexStr;

      // Highlight row for unlocked
      if (!locked) {
        const rowBg = this.add.graphics().setAlpha(0.12);
        rowBg.fillStyle(color, 1);
        rowBg.fillRoundedRect(GAME_WIDTH - panelW - 2, y - rowH / 2 + 1, panelW, rowH - 2, 4);
      }

      // Icon
      const g = this.add.graphics().setAlpha(alpha);
      const cx = iconX - 12, cy = y;
      const cs = 20;
      g.fillStyle(color, 1);
      switch (entry.type) {
        case 'gun':     g.fillCircle(cx, cy, 5); break;
        case 'laser':   g.fillTriangle(cx, cy - 6, cx + 5, cy, cx, cy + 6);
                        g.fillTriangle(cx, cy - 6, cx - 5, cy, cx, cy + 6); break;
        case 'beam':    g.fillRect(cx - 2, cy - 7, 4, 14);
                        g.lineStyle(1, color, 0.6); g.lineBetween(cx - 7, cy, cx - 3, cy); g.lineBetween(cx + 3, cy, cx + 7, cy); break;
        case 'mine':    g.fillCircle(cx, cy, 4);
                        g.lineStyle(1, color, 1);
                        for (let s = 0; s < 6; s++) { const a = s / 6 * Math.PI * 2; g.lineBetween(cx + Math.cos(a)*4, cy + Math.sin(a)*4, cx + Math.cos(a)*8, cy + Math.sin(a)*8); }
                        break;
        case 'missile': g.fillTriangle(cx, cy - 7, cx - 3, cy + 4, cx + 3, cy + 4); break;
        case 'funnel':  g.fillStyle(color, 0.35);
                        for (let s = 0; s < 6; s++) { const a1 = s/6*Math.PI*2, a2 = (s+1)/6*Math.PI*2; g.fillTriangle(cx, cy, cx+Math.cos(a1)*cs*0.38, cy+Math.sin(a1)*cs*0.38, cx+Math.cos(a2)*cs*0.38, cy+Math.sin(a2)*cs*0.38); }
                        g.lineStyle(1, color, 1); g.strokeCircle(cx, cy, cs * 0.38); break;
        case 'rock':    for (let s = 0; s < 8; s++) { const a1=s/8*Math.PI*2, a2=(s+1)/8*Math.PI*2, j=s%2===0?0.8:1.0; g.fillStyle(color, 0.9); g.fillTriangle(cx, cy, cx+Math.cos(a1)*5*j, cy+Math.sin(a1)*5*j, cx+Math.cos(a2)*5*j, cy+Math.sin(a2)*5*j); } break;
        case 'homing':  g.fillTriangle(cx, cy - 7, cx - 3, cy + 3, cx + 3, cy + 3);
                        g.lineStyle(1, color, 0.7); g.lineBetween(cx-3, cy+3, cx-6, cy+7); g.lineBetween(cx+3, cy+3, cx+6, cy+7); break;
      }

      // Label
      const suffix = locked ? ` R${entry.round}` : '';
      this.add.text(textX, y, entry.label + suffix, {
        fontSize: '16px', fontFamily: 'Arial', color: labelColor,
        fontStyle: locked ? 'normal' : 'bold',
      }).setOrigin(1, 0.5);
    });
  }

  private createButton(label: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
    const w = 340, h = 90, r = 16;
    // Shadow layer
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.45);
    shadow.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, r);
    // Main body
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    // Top highlight
    bg.fillStyle(0xffffff, 0.12);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, r);
    // Border
    bg.lineStyle(2, 0xffffff, 0.25);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    const text = this.add.text(0, 0, label, {
      ...TEXT_STYLES.button,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const c = this.add.container(0, 0, [shadow, bg, text]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        this.tweens.add({ targets: c, scaleX: 1.04, scaleY: 1.04, duration: 100, ease: 'Quad.easeOut' });
      })
      .on('pointerout', () => {
        this.tweens.add({ targets: c, scaleX: 1.0, scaleY: 1.0, duration: 100, ease: 'Quad.easeOut' });
      })
      .on('pointerdown', () => {
        this.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
        onClick();
      });
    return c;
  }

  private startBattle(): void {
    this.scene.start('BattleScene', { state: gameState });
  }

  update(_time: number, delta: number): void {
    SFX.clearFrame();
    updateStarLayers(this.starLayers, delta / 1000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATTLE SCENE
// ═══════════════════════════════════════════════════════════════════════════════

/** One block of a ship in battle. baseX/baseY are its position when shipOffsetX/Y = 0. */
interface LiveBlock {
  baseX: number;
  baseY: number;
  gridCol: number;  // grid coordinate used for adjacency BFS
  gridRow: number;
  isCore: boolean;  // core block — ship is defeated if this is destroyed
  hp: number; maxHp: number;
  weaponType: WeaponType | null;
  graphics: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  destroyed: boolean;
  disconnected: boolean; // true once pruned by connectivity check
  cellSize: number;  // scaled cell size for this ship
}

interface LiveProjectile {
  x: number; y: number;
  vx: number; vy: number;
  damage: number;
  weaponType: WeaponType;
  isPlayer: boolean;
  graphics: Phaser.GameObjects.Graphics;
  destroyed: boolean;
  // Optional per-type fields
  accel?: number;            // missile / homing acceleration px/s²
  homingBlocks?: LiveBlock[]; // homing: target pool
  homingOffX?: number;
  homingOffY?: number;
  radius?: number;           // mine / missile / rock collision radius
  hp?: number;               // mine / rock durability
  maxHp?: number;
  funnelFireTimer?: number;  // funnel: time until next laser shot
  funnelTargets?: LiveBlock[];
  funnelTOffX?: number;
  funnelTOffY?: number;
}

/** Beam charge state — one per shooter block while charging */
interface BeamCharge {
  shooter: LiveBlock;
  targets: LiveBlock[]; tOffX: number; tOffY: number;
  isPlayer: boolean;
  timer: number;   // counts down from BEAM_CHARGE_TIME
  graphics: Phaser.GameObjects.Graphics;
  fired: boolean;
}

interface Asteroid {
  x: number; y: number;
  vx: number;
  radius: number;
  hp: number; maxHp: number;
  seed: number;  // stable per-asteroid shape seed, set at spawn
  graphics: Phaser.GameObjects.Graphics;
  destroyed: boolean;
}

class BattleScene extends Phaser.Scene {
  // Ships
  private playerBlocks: LiveBlock[] = [];
  private enemyBlocks:  LiveBlock[] = [];
  private projectiles:  LiveProjectile[] = [];
  private asteroids:    Asteroid[] = [];
  private beamCharges:  BeamCharge[] = [];
  // Per-block beam cooldown: key = block object ref via WeakMap
  private beamCooldowns = new WeakMap<LiveBlock, number>();
  // Per-block funnel release cooldown
  private funnelCooldowns = new WeakMap<LiveBlock, number>();

  // Shared cell size for this battle (both ships use the same scale)
  private battleCellSize = CELL;
  // Temporary storage: enemy placed pieces, set by buildEnemyShip, consumed by applySharedScale
  private _enemyPlaced: PlacedPiece[] = [];
  // Enemy core position after centroid recentring (may differ from CORE_COL/CORE_ROW)
  private _enemyCoreCol = CORE_COL;
  private _enemyCoreRow = CORE_ROW;

  // Ship center Y lanes (fixed)
  private readonly PLAYER_LANE_Y = GAME_HEIGHT * 0.75;
  private readonly ENEMY_LANE_Y  = GAME_HEIGHT * 0.22;

  // Live ship offsets
  private playerOffX = 0;
  private playerOffY = 0;
  private enemyOffX  = 0;

  // Boost gauges (0–1)
  private playerBoost = 1.0;
  private enemyBoost  = 1.0;
  // Dash state: direction (normalised) and progress 0→1 over BOOST_DURATION
  private playerBoostDirX = 0;
  private playerBoostDirY = 0;
  private playerBoostT    = 1.0;  // 1.0 = not dashing
  private enemyBoostDirX  = 0;
  private enemyBoostT     = 1.0;

  // Starting block counts (set after ships are built, used for underdog multiplier)
  private playerStartBlocks = 1;
  private enemyStartBlocks  = 1;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private boostKey!: Phaser.Input.Keyboard.Key;

  // HUD boost bar
  private playerBoostBar!: Phaser.GameObjects.Graphics;

  // Fire timers
  private playerFireTimer!: Phaser.Time.TimerEvent;
  private enemyFireTimer!:  Phaser.Time.TimerEvent;
  private asteroidSpawnTimer!: Phaser.Time.TimerEvent;

  // Enemy AI state
  private enemyTargetX = 0;
  private enemyDodgeTimer = 0;

  // HUD
  private playerHpText!: Phaser.GameObjects.Text;
  private enemyHpText!:  Phaser.GameObjects.Text;
  private statusText!:   Phaser.GameObjects.Text;
  private continueBtn!:  Phaser.GameObjects.Container;
  private livesGfx!:    Phaser.GameObjects.Graphics;
  private starLayers:   StarLayer[] = [];

  private battleOver = false;
  private playerWon  = false;
  private _oLives: Phaser.GameObjects.Graphics | null = null;

  constructor() { super({ key: 'BattleScene' }); }

  init(data: { state?: GameState }): void {
    if (data?.state) Object.assign(gameState, data.state);
  }

  create(): void {
    this.battleOver  = false;
    this.playerWon   = false;
    this.playerBlocks = [];
    this.enemyBlocks  = [];
    this.projectiles  = [];
    this.asteroids    = [];
    this.beamCharges  = [];
    this.beamCooldowns  = new WeakMap();
    this.funnelCooldowns = new WeakMap();
    this.playerOffX   = 0;
    this.playerOffY   = 0;
    this.enemyOffX    = 0;
    this.playerBoost  = 1.0;
    this.enemyBoost   = 1.0;
    this.playerBoostDirX = 0;
    this.playerBoostDirY = 0;
    this.playerBoostT    = 1.0;
    this.enemyBoostDirX  = 0;
    this.enemyBoostT     = 1.0;
    this.battleCellSize = CELL;
    this._enemyPlaced   = [];
    this._enemyCoreCol  = CORE_COL;
    this._enemyCoreRow  = CORE_ROW;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x060810, 0x060810, 0x0a0e1a, 0x0a0e1a, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.starLayers = initStarLayers(this, 1.0);
    BGM.playBattle();

    // Asteroid belt zone indicator (faint band)
    const band = this.add.graphics();
    band.fillStyle(0x332200, 0.18);
    band.fillRect(0, ASTEROID_BAND_Y - ASTEROID_BAND_H, GAME_WIDTH, ASTEROID_BAND_H * 2);

    // Generate both ships, compute shared scale, then build blocks
    this.buildPlayerShip();
    this.buildEnemyShip();
    this.applySharedScale();
    // Record starting counts for underdog speed multiplier
    this.playerStartBlocks = this.playerBlocks.length;
    this.enemyStartBlocks  = this.enemyBlocks.length;

    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.boostKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    // Also treat Shift as boost
    const shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    // Combined check handled in updatePlayerMovement via this.boostKey and shiftKey ref
    (this as any)._shiftKey = shiftKey;

    // ── Battle HUD panels ────────────────────────────────────────────────────────
    // Enemy HUD strip (top)
    const enemyPanel = this.add.graphics().setDepth(9);
    enemyPanel.fillStyle(0x060810, 0.82);
    enemyPanel.fillRect(0, 0, GAME_WIDTH, 108);
    enemyPanel.lineStyle(2, 0xff6b6b, 0.35);
    enemyPanel.lineBetween(20, 106, GAME_WIDTH - 20, 106);
    // Player HUD strip (bottom) — 120px tall for 3-row layout
    const playerPanel = this.add.graphics().setDepth(9);
    playerPanel.fillStyle(0x060810, 0.82);
    playerPanel.fillRect(0, GAME_HEIGHT - 120, GAME_WIDTH, 120);
    playerPanel.lineStyle(2, 0x44dd88, 0.35);
    playerPanel.lineBetween(20, GAME_HEIGHT - 118, GAME_WIDTH - 20, GAME_HEIGHT - 118);
    // Round badge (centre top)
    const roundBadge = this.add.graphics().setDepth(10);
    const badgeW = 180, badgeH = 38, badgeR = 10;
    roundBadge.fillStyle(COLORS.accent.primary, 0.15);
    roundBadge.fillRoundedRect(GAME_WIDTH / 2 - badgeW / 2, 6, badgeW, badgeH, badgeR);
    roundBadge.lineStyle(1, COLORS.accent.primary, 0.55);
    roundBadge.strokeRoundedRect(GAME_WIDTH / 2 - badgeW / 2, 6, badgeW, badgeH, badgeR);

    // HUD text
    this.playerHpText = this.add.text(20, GAME_HEIGHT - 72, '', {
      ...TEXT_STYLES.hud, color: '#44dd88',
    }).setOrigin(0, 1).setDepth(10);
    this.enemyHpText = this.add.text(20, 60, '', {
      ...TEXT_STYLES.hud, color: '#ff6b6b',
    }).setOrigin(0, 0).setDepth(10);
    // Lives hearts — top row of player HUD strip, centred
    this.livesGfx = this.add.graphics().setDepth(10);
    this.add.text(GAME_WIDTH / 2, 25, `ROUND  ${gameState.round}`, {
      fontSize: '22px', fontFamily: 'Arial', color: '#4ecdc4',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(10);

    // Boost bar (bottom row of player strip)
    this.playerBoostBar = this.add.graphics().setDepth(10);
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 44, 'BOOST', {
      fontSize: '15px', fontFamily: 'Arial', color: '#4ecdc4', fontStyle: 'bold',
    }).setOrigin(1, 1).setDepth(10);
    // Controls hint (very subtle, left side bottom row)
    this.add.text(20, GAME_HEIGHT - 42, 'WASD / arrows  •  SPACE boost', {
      fontSize: '16px', fontFamily: 'Arial', color: '#223344',
    }).setOrigin(0, 1).setDepth(10);

    // Status overlay
    const overlayPanel = this.add.graphics().setDepth(28).setVisible(false);
    overlayPanel.fillStyle(0x000000, 0.72);
    overlayPanel.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // Bordered card
    const cardW = 520, cardH = 280, cardR = 20;
    const cardX = GAME_WIDTH / 2 - cardW / 2;
    const cardY = GAME_HEIGHT / 2 - cardH / 2 - 30;
    overlayPanel.fillStyle(0x0a1020, 0.96);
    overlayPanel.fillRoundedRect(cardX, cardY, cardW, cardH, cardR);
    overlayPanel.lineStyle(2, COLORS.accent.primary, 0.6);
    overlayPanel.strokeRoundedRect(cardX, cardY, cardW, cardH, cardR);
    // Corner accents
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
    (this as any)._overlayPanel = overlayPanel;

    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 55, '', {
      ...TEXT_STYLES.heading, align: 'center', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(31).setVisible(false);

    this.continueBtn = this.makeBattleButton('CONTINUE', COLORS.accent.primary, () => {
      if (!this.battleOver) return;
      if (this.playerWon) {
        this.scene.start('BuildScene', { state: gameState });
      } else if (gameState.lives > 0) {
        // Respawn in-place: rebuild player ship, keep enemy state
        this.respawnPlayer();
      } else {
        // Game over: full reset including lives
        gameState.placedPieces    = [];
        gameState.coreCol         = CORE_COL;
        gameState.coreRow         = CORE_ROW;
        gameState.round           = 1;
        gameState.enemyPieceCount = INITIAL_ENEMY_PIECES;
        gameState.gridCols        = GRID_COLS;
        gameState.gridRows        = GRID_ROWS;
        gameState.cellSize        = CELL;
        gameState.lives           = PLAYER_LIVES;
        // New run = new randomised weapon unlock orders
        gameState.playerWeaponOrder = makeWeaponOrder();
        gameState.enemyWeaponOrder  = makeWeaponOrder();
        this.scene.start('BuildScene', { state: gameState });
      }
    });
    this.continueBtn.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60).setDepth(30).setVisible(false);

    this.updateHud();

    // Fire timers
    this.playerFireTimer = this.time.addEvent({
      delay: 1200, callback: this.playerFire, callbackScope: this, loop: true,
    });
    this.enemyFireTimer = this.time.addEvent({
      delay: 1500, callback: this.enemyFire, callbackScope: this, loop: true,
    });

    // Asteroid spawn
    this.asteroidSpawnTimer = this.time.addEvent({
      delay: 1400, callback: this.spawnAsteroid, callbackScope: this, loop: true,
    });
    // Pre-populate belt
    for (let i = 0; i < ASTEROID_COUNT; i++) this.spawnAsteroid();
  }

  // ─── Ship builders ──────────────────────────────────────────────────────────

  /** Convert placedPieces into LiveBlocks centred at (cx, cy).
   *  Uses this.battleCellSize (shared across both ships) so relative sizes are preserved.
   */
  private makeShipBlocks(
    placed: PlacedPiece[],
    coreCol: number, coreRow: number,
    cx: number, cy: number,
    isEnemy: boolean,
  ): LiveBlock[] {
    const allAbs: BlockOffset[] = [
      { col: coreCol, row: coreRow },
      ...placed.flatMap(absoluteBlocks),
    ];
    const minCol = Math.min(...allAbs.map(b => b.col));
    const maxCol = Math.max(...allAbs.map(b => b.col));
    const minRow = Math.min(...allAbs.map(b => b.row));
    const maxRow = Math.max(...allAbs.map(b => b.row));

    const cs = this.battleCellSize;  // shared scale
    const shipW = (maxCol - minCol + 1) * cs;
    const shipH = (maxRow - minRow + 1) * cs;
    const ox = cx - shipW / 2 - minCol * cs;
    const oy = cy - shipH / 2 - minRow * cs;

    const blocks: LiveBlock[] = [];

    // Core block first
    const cg     = this.add.graphics();
    const chpBar = this.add.graphics();
    const coreBlock: LiveBlock = {
      baseX: ox + coreCol * cs, baseY: oy + coreRow * cs,
      gridCol: coreCol, gridRow: coreRow,
      isCore: true,
      hp: BLOCK_HP * 2, maxHp: BLOCK_HP * 2,
      weaponType: null, graphics: cg, hpBar: chpBar,
      destroyed: false, disconnected: false,
      cellSize: cs,
    };
    this.redrawBlock(coreBlock, 0, 0, isEnemy);
    blocks.push(coreBlock);

    // Piece blocks — skip any block that coincides with the core cell
    // (the centroid-recentred core may land on a piece-block cell)
    for (const p of placed) {
      p.blocks.forEach((b, i) => {
        const col = p.gridCol + b.col;
        const row = p.gridRow + b.row;
        if (col === coreCol && row === coreRow) return; // core block covers this cell
        const wt: WeaponType | null = weaponTypeAtIndex(p.weapons, i);
        const g    = this.add.graphics();
        const hpBar = this.add.graphics();
        const block: LiveBlock = {
          baseX: ox + col * cs, baseY: oy + row * cs,
          gridCol: col, gridRow: row,
          isCore: false,
          hp: BLOCK_HP, maxHp: BLOCK_HP,
          weaponType: wt, graphics: g, hpBar,
          destroyed: false, disconnected: false,
          cellSize: cs,
        };
        this.redrawBlock(block, 0, 0, isEnemy);
        blocks.push(block);
      });
    }
    return blocks;
  }

  /** Compute the cell size needed to fit a ship's bounding box within the zone,
   *  without actually building blocks. Never exceeds CELL. */
  private computeCellSize(
    placed: PlacedPiece[],
    coreCol: number, coreRow: number,
  ): number {
    const allAbs: BlockOffset[] = [
      { col: coreCol, row: coreRow },
      ...placed.flatMap(absoluteBlocks),
    ];
    const minCol = Math.min(...allAbs.map(b => b.col));
    const maxCol = Math.max(...allAbs.map(b => b.col));
    const minRow = Math.min(...allAbs.map(b => b.row));
    const maxRow = Math.max(...allAbs.map(b => b.row));
    const gridW  = maxCol - minCol + 1;
    const gridH  = maxRow - minRow + 1;
    const zoneW  = GAME_WIDTH - 80;
    const zoneH  = GAME_HEIGHT * 0.22 - 20;
    return Math.min(CELL, (zoneW / (gridW * CELL)) * CELL, (zoneH / (gridH * CELL)) * CELL);
  }

  private buildPlayerShip(): void {
    // Player ship blocks are built in applySharedScale() after enemy is also generated
  }

  private buildEnemyShip(): void {
    const pieceCount = gameState.enemyPieceCount;
    const placed: PlacedPiece[] = [];

    // BFS-order growth from the core so the core stays central.
    // `frontier` = occupied cells that still have free neighbours to attach to.
    const coreCell: BlockOffset = { col: CORE_COL, row: CORE_ROW };
    const occupied  = new Set<string>();
    occupied.add(`${CORE_COL},${CORE_ROW}`);

    // Frontier sorted by Manhattan distance to core (ascending) — BFS order.
    const frontier: BlockOffset[] = [{ ...coreCell }];
    const distToCore = (b: BlockOffset) => Math.abs(b.col - CORE_COL) + Math.abs(b.row - CORE_ROW);
    const dirs = [
      { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
      { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
    ];

    for (let i = 0; i < pieceCount; i++) {
      const piece = randomPiece(gameState.round, gameState.enemyWeaponOrder);
      let placed_ = false;

      // Sort frontier so we always try cells nearest to core first.
      frontier.sort((a, b) => distToCore(a) - distToCore(b));

      for (const anchor of frontier) {
        // Shuffle directions for variety at equal BFS depth.
        const shuffledDirs = Phaser.Utils.Array.Shuffle([...dirs]) as typeof dirs;
        for (const dir of shuffledDirs) {
          const tryCol = anchor.col + dir.dc;
          const tryRow = anchor.row + dir.dr;
          // Try all 4 rotations of the piece.
          let blocks = piece.blocks;
          for (let rot = 0; rot < 4; rot++) {
            const candidate = blocks.map(b => ({ col: tryCol + b.col, row: tryRow + b.row }));
            const overlapping = candidate.some(c => occupied.has(`${c.col},${c.row}`));
            if (!overlapping) {
              placed.push({ gridCol: tryCol, gridRow: tryRow, blocks: blocks.map(b => ({ ...b })), weapons: piece.weapons.map(w => ({ ...w })) });
              // Mark all new cells occupied and add them to frontier.
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

    // Re-centre the core: compute the centroid of all occupied cells
    // (core + every block in every placed piece), then find the occupied
    // cell closest to that centroid and promote it to be the core.
    const allCells: BlockOffset[] = [
      { col: CORE_COL, row: CORE_ROW },
      ...placed.flatMap(absoluteBlocks),
    ];
    const avgCol = allCells.reduce((s, c) => s + c.col, 0) / allCells.length;
    const avgRow = allCells.reduce((s, c) => s + c.row, 0) / allCells.length;
    let bestCell = allCells[0];
    let bestDist = Infinity;
    for (const c of allCells) {
      const d = Math.hypot(c.col - avgCol, c.row - avgRow);
      if (d < bestDist) { bestDist = d; bestCell = c; }
    }
    this._enemyCoreCol = bestCell.col;
    this._enemyCoreRow = bestCell.row;
  }

  /** Called after both ships are generated. Computes the shared (minimum) cell size
   *  so both ships maintain their relative proportions and asteroids match. */
  private applySharedScale(): void {
    const playerCs = gameState.placedPieces.length > 0
      ? this.computeCellSize(gameState.placedPieces, gameState.coreCol, gameState.coreRow)
      : CELL;
    const enemyCs = this._enemyPlaced.length > 0
      ? this.computeCellSize(this._enemyPlaced, this._enemyCoreCol, this._enemyCoreRow)
      : CELL;
    // Both ships use the smaller of the two — preserves relative size
    this.battleCellSize = Math.min(playerCs, enemyCs);

    // Build actual blocks now that we have the shared scale
    if (gameState.placedPieces.length > 0) {
      this.playerBlocks = this.makeShipBlocks(
        gameState.placedPieces,
        gameState.coreCol, gameState.coreRow,
        GAME_WIDTH / 2, this.PLAYER_LANE_Y, false,
      );
    }
    this.enemyBlocks = this.makeShipBlocks(
      this._enemyPlaced, this._enemyCoreCol, this._enemyCoreRow,
      GAME_WIDTH / 2, this.ENEMY_LANE_Y, true,
    );
    this.enemyTargetX = 0;
  }

  private findAttachPosition(
    placed: PlacedPiece[],
    newBlocks: BlockOffset[],
  ): { col: number; row: number } | null {
    const allCells = placed.flatMap(absoluteBlocks);
    const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
    for (let attempt = 0; attempt < 200; attempt++) {
      const anchor = allCells[Phaser.Math.Between(0, allCells.length - 1)];
      const dir = dirs[Phaser.Math.Between(0, 3)];
      const tryCol = anchor.col + dir.dc;
      const tryRow = anchor.row + dir.dr;
      const candidate = newBlocks.map(b => ({ col: tryCol + b.col, row: tryRow + b.row }));
      // No grid-bounds check here — enemy ships are unbounded; only prevent overlap
      if (overlaps(candidate, allCells)) continue;
      return { col: tryCol, row: tryRow };
    }
    return null;
  }

  /** Compute NeighbourMask for a block from the live block array */
  private nbForBlock(block: LiveBlock, blocks: LiveBlock[]): NeighbourMask {
    const live = new Set<string>();
    for (const b of blocks) {
      if (!b.destroyed) live.add(`${b.gridCol},${b.gridRow}`);
    }
    return nbFromSet(block.gridCol, block.gridRow, live);
  }

  /** Redraw a block's graphics and hp bar at baseX+offX, baseY+offY */
  private redrawBlock(block: LiveBlock, offX: number, offY: number, isEnemy: boolean): void {
    const px = block.baseX + offX;
    const py = block.baseY + offY;
    const cs = block.cellSize;
    const fill   = block.isCore
      ? (isEnemy ? 0x220033 : 0x001a22)
      : (isEnemy ? 0x882222 : COLORS.block.placed);
    const border = block.isCore
      ? 0x00ffee
      : (isEnemy ? 0xdd4444 : COLORS.block.border);
    const blocks = isEnemy ? this.enemyBlocks : this.playerBlocks;
    const nb = this.nbForBlock(block, blocks);
    block.graphics.clear();
    drawHullBlock(block.graphics, px, py, fill, border, 1, block.weaponType, block.isCore, cs, nb);
    block.hpBar.clear();
    const barW = cs - 8;
    const ratio = block.hp / block.maxHp;
    const barColor = ratio > 0.5 ? COLORS.hp.full : COLORS.hp.low;
    block.hpBar.fillStyle(0x222222, 0.8);
    block.hpBar.fillRect(px + 4, py + cs - 10, Math.max(4, barW), 5);
    block.hpBar.fillStyle(barColor, 1);
    block.hpBar.fillRect(px + 4, py + cs - 10, Math.max(1, barW * ratio), 5);
  }

  /** Live world centre of a block, accounting for ship offset */
  private blockWorldX(b: LiveBlock, offX: number): number { return b.baseX + offX + b.cellSize / 2; }
  private blockWorldY(b: LiveBlock, offY: number): number { return b.baseY + offY + b.cellSize / 2; }

  /**
   * BFS from the core block through all live (non-destroyed) blocks.
   * Any block that cannot be reached is marked disconnected and destroyed.
   * Returns true if any blocks were pruned.
   */
  private pruneDisconnected(blocks: LiveBlock[], offX: number, offY: number, isEnemy: boolean): boolean {
    const live = blocks.filter(b => !b.destroyed && !b.disconnected);
    const core = live.find(b => b.isCore);
    if (!core) return false; // core already gone — whole-ship destruction handled elsewhere

    // BFS using grid adjacency
    const visited = new Set<LiveBlock>();
    const queue: LiveBlock[] = [core];
    visited.add(core);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of live) {
        if (visited.has(nb)) continue;
        const dc = Math.abs(nb.gridCol - cur.gridCol);
        const dr = Math.abs(nb.gridRow - cur.gridRow);
        if ((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) {
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
        // pop flash — mecha eclipse explosion
        drawMechaExplosion(this, wx, wy, b.cellSize * 0.65, 0xff8844, 260);
        pruned = true;
      }
    }
    return pruned;
  }

  /** True if this ship has no remaining live weapon blocks (mercy rule) */
  private shipDisarmed(blocks: LiveBlock[]): boolean {
    return blocks.every(b => b.destroyed || b.weaponType === null);
  }

  // ─── Weapons ─────────────────────────────────────────────────────────────────

  private playerFire(): void {
    if (this.battleOver) return;
    for (const b of this.playerBlocks) {
      if (!b.destroyed && b.weaponType !== null)
        this.fireWeapon(b, this.playerOffX, this.playerOffY, this.enemyBlocks, this.enemyOffX, 0, true);
    }
  }

  private enemyFire(): void {
    if (this.battleOver) return;
    for (const b of this.enemyBlocks) {
      if (!b.destroyed && b.weaponType !== null)
        this.fireWeapon(b, this.enemyOffX, 0, this.playerBlocks, this.playerOffX, this.playerOffY, false);
    }
  }

  private fireWeapon(
    shooter: LiveBlock, sOffX: number, sOffY: number,
    targets: LiveBlock[], tOffX: number, tOffY: number,
    isPlayer: boolean,
  ): void {
    const sx = this.blockWorldX(shooter, sOffX);
    const sy = this.blockWorldY(shooter, sOffY);
    const alive = targets.filter(t => !t.destroyed);
    if (alive.length === 0) return;
    const wt = shooter.weaponType!;

    // ── Beam: start charge, not a projectile ──────────────────────────────
    if (wt === 'beam') {
      const now = this.time.now / 1000;
      const lastFired = this.beamCooldowns.get(shooter) ?? 0;
      if (now - lastFired < BEAM_COOLDOWN) return;
      // Don't start a second charge if one is already active for this block
      if (this.beamCharges.some(bc => bc.shooter === shooter && !bc.fired)) return;
      const cg = this.add.graphics();
      this.beamCharges.push({
        shooter,
        targets, tOffX, tOffY,
        isPlayer,
        timer: BEAM_CHARGE_TIME,
        graphics: cg,
        fired: false,
      });
      SFX.play('fire_beam');
      return;
    }

    // ── Funnel: release a funnel projectile ───────────────────────────────
    if (wt === 'funnel') {
      const now = this.time.now / 1000;
      const lastReleased = this.funnelCooldowns.get(shooter) ?? 0;
      if (now - lastReleased < FUNNEL_RELEASE_RATE) return;
      this.funnelCooldowns.set(shooter, now);
      const dir = isPlayer ? -1 : 1;
      const g = this.add.graphics();
      this.projectiles.push({
        x: sx, y: sy,
        vx: 0, vy: dir * FUNNEL_SPEED,
        damage: 0, weaponType: 'funnel', isPlayer,
        graphics: g, destroyed: false,
        funnelFireTimer: FUNNEL_FIRE_RATE,
        funnelTargets: targets,
        funnelTOffX: tOffX,
        funnelTOffY: tOffY,
      });
      SFX.play('fire_funnel');
      return;
    }

    // ── Standard projectile types ─────────────────────────────────────────
    const dir = isPlayer ? -1 : 1;
    let vx = 0, vy = 0;
    let damage = GUN_DAMAGE;
    let accel: number | undefined;
    let radius: number | undefined;
    let hp: number | undefined;

    switch (wt) {
      case 'gun':
        vx = 0; vy = dir * BULLET_SPEED;
        damage = GUN_DAMAGE;
        break;
      case 'laser': {
        let nearestDist = Infinity, nx = sx, ny = sy;
        for (const t of alive) {
          const tx = this.blockWorldX(t, tOffX);
          const ty = this.blockWorldY(t, tOffY);
          const d = Math.hypot(tx - sx, ty - sy);
          if (d < nearestDist) { nearestDist = d; nx = tx; ny = ty; }
        }
        const ang = Math.atan2(ny - sy, nx - sx);
        vx = Math.cos(ang) * LASER_SPEED;
        vy = Math.sin(ang) * LASER_SPEED;
        damage = LASER_DAMAGE;
        break;
      }
      case 'mine':
        vx = 0; vy = dir * Phaser.Math.FloatBetween(MINE_SPEED_MIN, MINE_SPEED_MAX);
        damage = MINE_DAMAGE; radius = MINE_RADIUS; hp = MINE_HP;
        break;
      case 'missile':
        vx = 0; vy = dir * MISSILE_SPEED_MIN;
        damage = MISSILE_DAMAGE; accel = MISSILE_ACCEL; radius = MISSILE_RADIUS;
        break;
      case 'rock':
        vx = 0; vy = dir * ROCK_SPEED;
        damage = ROCK_DAMAGE; radius = ROCK_RADIUS; hp = ROCK_HP;
        break;
      case 'homing': {
        vx = 0; vy = dir * HOMING_SPEED_MIN;
        damage = HOMING_DAMAGE; accel = HOMING_ACCEL;
        break;
      }
    }

    const g = this.add.graphics();
    const proj: LiveProjectile = {
      x: sx, y: sy, vx, vy, damage,
      weaponType: wt, isPlayer, graphics: g, destroyed: false,
    };
    if (accel !== undefined) proj.accel = accel;
    if (radius !== undefined) proj.radius = radius;
    if (hp !== undefined) { proj.hp = hp; proj.maxHp = hp; }
    if (wt === 'homing') {
      proj.homingBlocks = targets;
      proj.homingOffX = tOffX;
      proj.homingOffY = tOffY;
    }
    SFX.play(`fire_${wt}`);
    this.projectiles.push(proj);
    this.drawProjectile(proj);
  }

  // ── Beam charge telegraph & fire ──────────────────────────────────────────
  private updateBeamCharges(dt: number): void {
    for (let i = this.beamCharges.length - 1; i >= 0; i--) {
      const bc = this.beamCharges[i];
      if (bc.shooter.destroyed) { bc.graphics.destroy(); this.beamCharges.splice(i, 1); continue; }
      bc.timer -= dt;
      // Derive live ship offset so the telegraph tracks the moving ship
      const sOffX = bc.isPlayer ? this.playerOffX : this.enemyOffX;
      const sOffY = bc.isPlayer ? this.playerOffY : 0;
      const sx = this.blockWorldX(bc.shooter, sOffX);
      const sy = this.blockWorldY(bc.shooter, sOffY);
      // Draw telegraph: growing charge circle + column preview line
      bc.graphics.clear();
      const progress = 1 - Math.max(0, bc.timer / BEAM_CHARGE_TIME);
      const beamColor = COLORS.weapon.beam;
      const r = bc.shooter.cellSize * (0.3 + progress * 0.5);
      // Charge circle at shooter
      bc.graphics.lineStyle(3, beamColor, 0.4 + progress * 0.5);
      bc.graphics.strokeCircle(sx, sy, r);
      bc.graphics.fillStyle(beamColor, 0.06 + progress * 0.1);
      bc.graphics.fillCircle(sx, sy, r);
      // Column preview: faint line showing where beam will fire
      const previewY1 = bc.isPlayer ? 0 : sy;
      const previewY2 = bc.isPlayer ? sy : GAME_HEIGHT;
      bc.graphics.lineStyle(Math.max(1, BEAM_WIDTH * 0.4), beamColor, 0.08 + progress * 0.18);
      bc.graphics.lineBetween(sx, previewY1, sx, previewY2);

      if (bc.timer <= 0 && !bc.fired) {
        bc.fired = true;
        this.fireBeamInstant(bc, sOffX, sOffY);
        bc.graphics.destroy();
        this.beamCharges.splice(i, 1);
        this.beamCooldowns.set(bc.shooter, this.time.now / 1000);
      }
    }
  }

  private fireBeamInstant(bc: BeamCharge, sOffX: number, sOffY: number): void {
    const sx = this.blockWorldX(bc.shooter, sOffX);
    const sy = this.blockWorldY(bc.shooter, sOffY);
    // Player fires upward: beam spans sy → top of screen.
    // Enemy fires downward: beam spans sy → bottom of screen.
    const beamX = sx;
    const beamY1 = bc.isPlayer ? 0            : sy;
    const beamY2 = bc.isPlayer ? sy           : GAME_HEIGHT;
    const beamColor = COLORS.weapon.beam;
    // Flash graphics — full beam column
    const flash = this.add.graphics();
    flash.fillStyle(beamColor, 0.9);
    flash.fillRect(beamX - BEAM_WIDTH / 2, beamY1, BEAM_WIDTH, beamY2 - beamY1);
    // Bright core line
    flash.lineStyle(Math.max(2, BEAM_WIDTH * 0.3), 0xffffff, 0.85);
    flash.lineBetween(beamX, beamY1, beamX, beamY2);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 300, ease: 'Quad.easeIn',
      onComplete: () => flash.destroy(),
    });
    // Use live target offset at the moment the beam fires, NOT the stale offset
    // captured when the charge started — so moving during the charge matters.
    const liveTOffX = bc.isPlayer ? this.enemyOffX  : this.playerOffX;
    const liveTOffY = bc.isPlayer ? 0               : this.playerOffY;
    // Damage all target blocks in beam column
    let anyDestroyed = false;
    for (const t of bc.targets) {
      if (t.destroyed || t.isCore) continue;
      const tx = this.blockWorldX(t, liveTOffX);
      if (Math.abs(tx - beamX) < BEAM_WIDTH / 2 + t.cellSize * 0.5) {
        t.hp -= BEAM_DAMAGE;
        if (t.hp <= 0) {
          t.hp = 0; t.destroyed = true;
          t.graphics.destroy(); t.hpBar.destroy();
          drawMechaExplosion(this, this.blockWorldX(t, liveTOffX), this.blockWorldY(t, liveTOffY), t.cellSize * 0.7, beamColor, 280);
          SFX.play('hit_beam'); SFX.play('explosion');
          anyDestroyed = true;
        } else {
          this.redrawBlock(t, liveTOffX, liveTOffY, !bc.isPlayer);
        }
      }
    }
    if (bc.isPlayer) this.pruneDisconnected(bc.targets, liveTOffX, liveTOffY, true);
    else             this.pruneDisconnected(bc.targets, liveTOffX, liveTOffY, false);
    this.updateHud();
  }

  private drawProjectile(p: LiveProjectile): void {
    p.graphics.clear();
    const g = p.graphics;
    const x = p.x, y = p.y;
    switch (p.weaponType) {

      case 'gun': {
        // Bullet-hell capsule: bright core + glow halo + thin elongated body
        const ang = Math.atan2(p.vy, p.vx);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        // Glow halo
        g.fillStyle(COLORS.weapon.gun, 0.22);
        g.fillCircle(x, y, 11);
        // Elongated capsule body
        g.fillStyle(COLORS.weapon.gun, 1);
        g.fillRect(x - ca * 10 - Math.abs(sa) * 3, y - sa * 10 - Math.abs(ca) * 3, Math.abs(ca) * 20 + 6, Math.abs(sa) * 20 + 6);
        // Bright white core
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(x, y, 3);
        // Leading edge spark
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(x + ca * 9, y + sa * 9, 2);
        break;
      }

      case 'laser': {
        // Sharp energy bolt — red needle with red glow, clearly readable
        const ang = Math.atan2(p.vy, p.vx);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const len = 28;
        // Outer glow (wide, faint red)
        g.lineStyle(10, COLORS.weapon.laser, 0.2);
        g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
        // Mid glow (red)
        g.lineStyle(5, COLORS.weapon.laser, 0.7);
        g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
        // Bright core needle (bright red, not white)
        g.lineStyle(2, 0xff2222, 1);
        g.lineBetween(x - ca * len / 2, y - sa * len / 2, x + ca * len / 2, y + sa * len / 2);
        // Tip spark (red-tinted)
        g.fillStyle(0xff8888, 0.9);
        g.fillCircle(x + ca * len / 2, y + sa * len / 2, 2.5);
        break;
      }

      case 'mine': {
        // Spiky contact mine with blinking hazard ring
        const r = p.radius ?? MINE_RADIUS;
        const ratio = (p.hp ?? 1) / (p.maxHp ?? 1);
        // Outer glow
        g.fillStyle(COLORS.weapon.mine, 0.15);
        g.fillCircle(x, y, r + 6);
        // Body
        g.fillStyle(blendToward(0x221100, COLORS.weapon.mine, 0.4), 1);
        g.fillCircle(x, y, r);
        // Ring
        g.lineStyle(2, COLORS.weapon.mine, 1);
        g.strokeCircle(x, y, r);
        // Inner hazard ring
        g.lineStyle(1, 0xffaa00, 0.7);
        g.strokeCircle(x, y, r * 0.6);
        // 8 arming spikes — length shrinks as hp drops
        const spikeLen = 5 + ratio * 5;
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          g.lineStyle(2, COLORS.weapon.mine, 0.85);
          g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r,
                        x + Math.cos(a) * (r + spikeLen), y + Math.sin(a) * (r + spikeLen));
          // spike tip dot
          g.fillStyle(0xff8800, 1);
          g.fillCircle(x + Math.cos(a) * (r + spikeLen), y + Math.sin(a) * (r + spikeLen), 1.5);
        }
        // Centre hazard dot
        g.fillStyle(0xff2200, 1);
        g.fillCircle(x, y, r * 0.25);
        break;
      }

      case 'missile': {
        // Accelerating rocket with swept fins and exhaust flame
        const speed = Math.hypot(p.vx, p.vy);
        const ang = Math.atan2(p.vy, p.vx);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = -sa, ny = ca;  // perpendicular
        const bodyLen = 18 + Math.min(speed / 60, 14);
        const tipX = x + ca * bodyLen, tipY = y + sa * bodyLen;
        const baseX = x - ca * bodyLen * 0.5, baseY = y - sa * bodyLen * 0.5;
        // Exhaust glow
        g.fillStyle(0xff6600, 0.35);
        g.fillCircle(baseX - ca * 5, baseY - sa * 5, 9);
        // Swept fins (two triangles off the base)
        const fw = 7;
        g.fillStyle(0xcc5500, 1);
        g.fillTriangle(baseX, baseY,
          baseX + nx * fw, baseY + ny * fw,
          baseX - ca * 10, baseY - sa * 10);
        g.fillTriangle(baseX, baseY,
          baseX - nx * fw, baseY - ny * fw,
          baseX - ca * 10, baseY - sa * 10);
        // Body
        g.fillStyle(COLORS.weapon.missile, 1);
        g.fillTriangle(tipX, tipY,
          baseX + nx * 4, baseY + ny * 4,
          baseX - nx * 4, baseY - ny * 4);
        // Nose cone (bright)
        g.fillStyle(0xffee88, 1);
        g.fillCircle(tipX, tipY, 3);
        // Exhaust core flame
        g.fillStyle(0xffee00, 0.9);
        g.fillCircle(baseX - ca * 4, baseY - sa * 4, 4);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(baseX - ca * 3, baseY - sa * 3, 2);
        break;
      }

      case 'funnel': {
        // Autonomous bit: rotating hexagon body with energy core
        const r = 9;
        // Outer spin glow
        g.fillStyle(COLORS.weapon.funnel, 0.18);
        g.fillCircle(x, y, r + 5);
        // Hexagonal body
        g.fillStyle(blendToward(0x220044, COLORS.weapon.funnel, 0.35), 1);
        for (let s = 0; s < 6; s++) {
          const a1 = (s / 6) * Math.PI * 2;
          const a2 = ((s + 1) / 6) * Math.PI * 2;
          g.fillTriangle(x, y,
            x + Math.cos(a1) * r, y + Math.sin(a1) * r,
            x + Math.cos(a2) * r, y + Math.sin(a2) * r);
        }
        // Hex outline
        g.lineStyle(2, COLORS.weapon.funnel, 1);
        for (let s = 0; s < 6; s++) {
          const a1 = (s / 6) * Math.PI * 2;
          const a2 = ((s + 1) / 6) * Math.PI * 2;
          g.lineBetween(x + Math.cos(a1) * r, y + Math.sin(a1) * r,
                        x + Math.cos(a2) * r, y + Math.sin(a2) * r);
        }
        // Vertex dots
        g.fillStyle(COLORS.weapon.funnel, 1);
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2;
          g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2);
        }
        // Energy core
        g.fillStyle(0xffffff, 0.85);
        g.fillCircle(x, y, 3);
        g.fillStyle(COLORS.weapon.funnel, 0.6);
        g.fillCircle(x, y, 2);
        break;
      }

      case 'rock': {
        // Weapon rock: chunky brown boulder
        const r = p.radius ?? ROCK_RADIUS;
        const ratio = (p.hp ?? ROCK_HP) / (p.maxHp ?? ROCK_HP);
        const wColor = COLORS.weapon.rock;  // 0x886644 — warm brown
        const darkBody = blendToward(wColor, 0x000000, 0.45);
        const rimCol   = blendToward(wColor, 0xffffff, 0.40);
        // Shadow for depth
        g.fillStyle(0x000000, 0.30);
        g.fillCircle(x + 2, y + 3, r);
        // Jagged octagon body
        g.fillStyle(darkBody, 1);
        for (let s = 0; s < 8; s++) {
          const a1 = (s / 8) * Math.PI * 2;
          const a2 = ((s + 1) / 8) * Math.PI * 2;
          const j = s % 2 === 0 ? 0.78 : 1.0;
          g.fillTriangle(x, y,
            x + Math.cos(a1) * r * j, y + Math.sin(a1) * r * j,
            x + Math.cos(a2) * r * j, y + Math.sin(a2) * r * j);
        }
        // Brown rim highlight (top-left)
        g.lineStyle(2, rimCol, 0.6);
        g.strokeCircle(x, y, r);
        // Crack lines that glow orange when damaged
        g.lineStyle(1, blendToward(0x331100, 0xff6600, 1 - ratio), 0.55 + (1 - ratio) * 0.4);
        g.lineBetween(x - r * 0.35, y - r * 0.45, x + r * 0.25, y + r * 0.35);
        g.lineBetween(x + r * 0.30, y - r * 0.25, x - r * 0.15, y + r * 0.40);
        // Bright centre highlight spot
        g.fillStyle(rimCol, 0.55);
        g.fillCircle(x - r * 0.2, y - r * 0.2, r * 0.18);
        break;
      }

      case 'homing': {
        // Tracking warhead: swept delta with glowing sensor eye
        const ang = Math.atan2(p.vy, p.vx);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = -sa, ny = ca;
        const bodyLen = 22;
        const tipX = x + ca * bodyLen, tipY = y + sa * bodyLen;
        const baseX = x - ca * bodyLen * 0.45, baseY = y - sa * bodyLen * 0.45;
        // Motion glow trail
        g.fillStyle(COLORS.weapon.homing, 0.18);
        g.fillCircle(baseX, baseY, 10);
        // Swept delta body
        g.fillStyle(blendToward(0x330022, COLORS.weapon.homing, 0.5), 1);
        g.fillTriangle(tipX, tipY,
          baseX + nx * 8, baseY + ny * 8,
          baseX - nx * 8, baseY - ny * 8);
        // Body outline
        g.lineStyle(2, COLORS.weapon.homing, 0.9);
        g.lineBetween(tipX, tipY, baseX + nx * 8, baseY + ny * 8);
        g.lineBetween(tipX, tipY, baseX - nx * 8, baseY - ny * 8);
        g.lineBetween(baseX + nx * 8, baseY + ny * 8, baseX - nx * 8, baseY - ny * 8);
        // Swept back fin lines
        g.lineStyle(1.5, COLORS.weapon.homing, 0.6);
        g.lineBetween(baseX + nx * 8, baseY + ny * 8, baseX - ca * 8 + nx * 12, baseY - sa * 8 + ny * 12);
        g.lineBetween(baseX - nx * 8, baseY - ny * 8, baseX - ca * 8 - nx * 12, baseY - sa * 8 - ny * 12);
        // Sensor eye on nose
        g.fillStyle(COLORS.weapon.homing, 1);
        g.fillCircle(tipX, tipY, 4);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(tipX, tipY, 2);
        // Lock ring
        g.lineStyle(1, COLORS.weapon.homing, 0.5);
        g.strokeCircle(x, y, 12);
        break;
      }
    }
  }

  // ─── Asteroids ──────────────────────────────────────────────────────────────

  private spawnAsteroid(): void {
    if (this.battleOver) return;
    // Scale asteroid count up when ships are smaller (more room in band)
    const scale = this.battleCellSize / CELL;  // 0 < scale <= 1
    const targetCount = Math.round(ASTEROID_COUNT / Math.max(0.3, scale));
    const live = this.asteroids.filter(a => !a.destroyed).length;
    if (live >= targetCount) return;
    // Scale radius proportionally so asteroids feel the same size relative to ships
    const baseR = Phaser.Math.Between(ASTEROID_RADIUS_MIN, ASTEROID_RADIUS_MAX);
    const r = Math.max(8, Math.round(baseR * scale));
    const vx = Phaser.Math.Between(ASTEROID_SPEED_MIN, ASTEROID_SPEED_MAX) * (Math.random() < 0.5 ? 1 : -1);
    const x  = vx > 0 ? -r - 10 : GAME_WIDTH + r + 10;
    const y  = Phaser.Math.Clamp(
      ASTEROID_BAND_Y + Phaser.Math.Between(-ASTEROID_BAND_H, ASTEROID_BAND_H),
      ASTEROID_BAND_Y - ASTEROID_BAND_H + r,
      ASTEROID_BAND_Y + ASTEROID_BAND_H - r,
    );
    const g = this.add.graphics();
    const astSeed = Phaser.Math.Between(0, 9999);
    const ast: Asteroid = { x, y, vx, radius: r, hp: ASTEROID_HP, maxHp: ASTEROID_HP, seed: astSeed, graphics: g, destroyed: false };
    this.drawAsteroid(ast);
    this.asteroids.push(ast);
  }

  private drawAsteroid(a: Asteroid): void {
    a.graphics.clear();
    const g = a.graphics;
    const x = a.x, y = a.y, r = a.radius;
    const ratio = a.hp / a.maxHp;

    // Use the asteroid's stable seed for consistent facet offsets (position-based seed changes every frame = fake spin)
    const seed = a.seed % 100;
    const facets = 9;

    // Base colour: warm rocky brown → glowing orange-red when damaged
    const baseCol = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x7a5533),
      Phaser.Display.Color.ValueToColor(0xdd3311),
      100, Math.floor((1 - ratio) * 100),
    );
    const bodyCol = Phaser.Display.Color.GetColor(baseCol.r, baseCol.g, baseCol.b);

    // ── Shadow (offset silhouette for depth) ──────────────────────────────
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(x + 2, y + 3, r);

    // ── Irregular rocky polygon body ─────────────────────────────────────
    // Build a jittered polygon using the seed for repeatable shape
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < facets; i++) {
      const baseAng = (i / facets) * Math.PI * 2;
      const jitter = 0.72 + 0.28 * Math.sin((seed + i * 37) * 0.9);
      pts.push({ x: x + Math.cos(baseAng) * r * jitter, y: y + Math.sin(baseAng) * r * jitter });
    }
    g.fillStyle(bodyCol, 1);
    g.fillPoints(pts, true);

    // ── Darker flat facets (inner polygon, slightly smaller) ──────────────
    const innerPts: { x: number; y: number }[] = [];
    for (let i = 0; i < facets; i++) {
      const baseAng = (i / facets) * Math.PI * 2 + 0.18;
      const jitter = 0.42 + 0.22 * Math.sin((seed + i * 53) * 1.1);
      innerPts.push({ x: x + Math.cos(baseAng) * r * jitter, y: y + Math.sin(baseAng) * r * jitter });
    }
    const darkFacet = Phaser.Display.Color.GetColor(
      Math.floor(baseCol.r * 0.55), Math.floor(baseCol.g * 0.55), Math.floor(baseCol.b * 0.55));
    g.fillStyle(darkFacet, 0.8);
    g.fillPoints(innerPts, true);

    // ── Rim highlight (top-left)— bright edge glint ───────────────────────
    const rimCol = Phaser.Display.Color.GetColor(
      Math.min(255, Math.floor(baseCol.r * 1.55 + 30)),
      Math.min(255, Math.floor(baseCol.g * 1.4 + 20)),
      Math.min(255, Math.floor(baseCol.b * 1.2 + 10)));
    g.lineStyle(Math.max(1, r * 0.06), rimCol, 0.55);
    // Arc the rim highlight on the top-left quarter
    const hlPts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (0.85 + i * 0.08);
      hlPts.push({ x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.9 });
    }
    g.strokePoints(hlPts, false);

    // ── Rocky outline ─────────────────────────────────────────────────────
    g.lineStyle(Math.max(1, r * 0.04), 0x221100, 0.9);
    g.strokePoints(pts, true);

    // ── Craters (stable positions from seed) ──────────────────────────────
    const craterCount = Math.max(1, Math.min(3, Math.floor(r / 10)));
    for (let i = 0; i < craterCount; i++) {
      const ca = (seed * 0.11 + i * 2.1) % (Math.PI * 2);
      const cd = r * (0.25 + (seed % 17 + i * 11) % 20 / 60);
      const cr = Math.max(2, r * (0.12 + i * 0.06));
      const cx2 = x + Math.cos(ca) * cd;
      const cy2 = y + Math.sin(ca) * cd;
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(cx2, cy2, cr);
      g.lineStyle(1, rimCol, 0.28);
      g.strokeCircle(cx2 - cr * 0.15, cy2 - cr * 0.15, cr * 0.7);
    }

    // ── Crack lines when damaged ──────────────────────────────────────────
    if (ratio < 0.65) {
      const crackAlpha = 0.55 + (1 - ratio) * 0.4;
      g.lineStyle(1, 0x110500, crackAlpha);
      g.lineBetween(x - r * 0.25, y - r * 0.45, x + r * 0.2, y + r * 0.38);
      g.lineBetween(x + r * 0.38, y - r * 0.28, x - r * 0.15, y + r * 0.48);
      if (ratio < 0.35) {
        // Glowing crack when near death
        g.lineStyle(1, 0xff6600, 0.6);
        g.lineBetween(x - r * 0.1, y - r * 0.5, x + r * 0.35, y + r * 0.3);
      }
    }
  }

  // ─── Enemy AI ──────────────────────────────────────────────────────────────────

  private updateEnemyAI(dt: number): void {
    if (this.battleOver) return;

    // Regen enemy boost
    this.enemyBoost = Math.min(1, this.enemyBoost + BOOST_REGEN * dt);

    // Underdog speed multiplier
    const speedMult = this.underdogMult(this.enemyBlocks, this.enemyStartBlocks);

    // Emergency boost: if a player projectile is about to reach enemy Y, dodge it
    if (this.enemyBoost >= BOOST_COST && this.enemyBoostT >= 1.0) {
      const enemyY = this.ENEMY_LANE_Y;
      for (const p of this.projectiles) {
        if (p.destroyed || !p.isPlayer || p.vy >= 0) continue;
        const t = (enemyY - p.y) / p.vy;
        if (t > 0 && t < 0.6) {
          const impactX = p.x + p.vx * t;
          const enemyCx = GAME_WIDTH / 2 + this.enemyOffX;
          if (Math.abs(impactX - enemyCx) < this.battleCellSize * 2) {
            this.enemyBoost -= BOOST_COST;
            this.enemyBoostDirX = impactX < enemyCx ? 1 : -1;
            this.enemyBoostT = 0.0;
            SFX.play('boost');
            break;
          }
        }
      }
    }

    // Advance enemy dash and apply quad-out displacement
    if (this.enemyBoostT < 1.0) {
      const prevT   = this.enemyBoostT;
      this.enemyBoostT = Math.min(1.0, prevT + dt / BOOST_DURATION);
      const prevEase = 1 - (1 - prevT) * (1 - prevT);
      const newEase  = 1 - (1 - this.enemyBoostT) * (1 - this.enemyBoostT);
      this.enemyOffX += this.enemyBoostDirX * (newEase - prevEase) * BOOST_DISTANCE;
    }

    // Periodically pick a new target X
    this.enemyDodgeTimer -= dt;
    if (this.enemyDodgeTimer <= 0) {
      this.pickEnemyTarget();
      this.enemyDodgeTimer = Phaser.Math.FloatBetween(0.8, 2.0);
    }

    // Move toward target
    const enemyCx = GAME_WIDTH / 2 + this.enemyOffX;
    const dx = this.enemyTargetX - enemyCx;
    if (Math.abs(dx) > 4) {
      const step = Math.sign(dx) * ENEMY_SPEED * speedMult * dt;
      this.enemyOffX += Math.abs(step) < Math.abs(dx) ? step : dx;
    }
    // Clamp
    const maxOff = GAME_WIDTH / 2 - ENEMY_BOUNDS_PAD;
    this.enemyOffX = Phaser.Math.Clamp(this.enemyOffX, -maxOff, maxOff);
  }

  private pickEnemyTarget(): void {
    const playerCx = GAME_WIDTH / 2 + this.playerOffX;

    // 1. Dodge: check if any player projectile is heading toward the enemy band
    const incomingX: number[] = [];
    for (const p of this.projectiles) {
      if (p.destroyed || p.isPlayer) continue;
      if (p.vy < 0) continue; // only upward shots can't hit enemy; skip
      // project where shot will be when it reaches enemy Y
      const enemyY = this.ENEMY_LANE_Y;
      if (p.vy !== 0) {
        const t = (enemyY - p.y) / p.vy;
        if (t > 0 && t < 3) incomingX.push(p.x + p.vx * t);
      }
    }
    // Also track player bullets heading up toward enemy
    for (const p of this.projectiles) {
      if (p.destroyed || !p.isPlayer) continue;
      const enemyY = this.ENEMY_LANE_Y;
      if (p.vy < 0) {
        const t = (enemyY - p.y) / p.vy;
        if (t > 0 && t < 3) incomingX.push(p.x + p.vx * t);
      }
    }

    // 2. Find asteroids blocking line-of-sight to player
    const liveAsteroids = this.asteroids.filter(a => !a.destroyed);
    const enemyCx = GAME_WIDTH / 2 + this.enemyOffX;

    // Try a few candidate X positions; score by (closeness to player line + dodge value)
    const candidates: number[] = [playerCx, playerCx - 80, playerCx + 80, GAME_WIDTH * 0.25, GAME_WIDTH * 0.5, GAME_WIDTH * 0.75];
    let bestScore = -Infinity;
    let bestX = playerCx;

    for (const cx of candidates) {
      if (cx < ENEMY_BOUNDS_PAD || cx > GAME_WIDTH - ENEMY_BOUNDS_PAD) continue;
      let score = 0;

      // Reward being near player's X (to aim at them)
      score -= Math.abs(cx - playerCx) * 0.5;

      // Penalise positions where incoming shots will hit
      for (const ix of incomingX) {
        if (Math.abs(cx - ix) < CELL * 1.5) score -= 200;
      }

      // Check if asteroid blocks shot from this position to player
      const shotBlocked = liveAsteroids.some(a => {
        // rough line-segment vs circle: does line from (cx, ENEMY_LANE_Y) to (playerCx, PLAYER_LANE_Y) pass within radius of asteroid?
        const dx = playerCx - cx;
        const dy = this.PLAYER_LANE_Y - this.ENEMY_LANE_Y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return false;
        const t = Phaser.Math.Clamp(((a.x - cx) * dx + (a.y - this.ENEMY_LANE_Y) * dy) / (len * len), 0, 1);
        const closestX = cx + t * dx;
        const closestY = this.ENEMY_LANE_Y + t * dy;
        return Math.hypot(closestX - a.x, closestY - a.y) < a.radius + CELL * 0.6;
      });
      if (shotBlocked) score -= 120; // prefer unblocked lane

      // Slight randomness to avoid pure determinism
      score += Phaser.Math.FloatBetween(-20, 20);

      if (score > bestScore) { bestScore = score; bestX = cx; }
    }

    this.enemyTargetX = Phaser.Math.Clamp(bestX, ENEMY_BOUNDS_PAD, GAME_WIDTH - ENEMY_BOUNDS_PAD);
  }

  // ─── Player input ───────────────────────────────────────────────────────────

  /** Returns a speed multiplier based on how many blocks remain (underdog rule).
   *  At full health: 1x. At 0 blocks: UNDERDOG_SPEED_MAX x. */
  private underdogMult(blocks: LiveBlock[], startCount: number): number {
    const alive = blocks.filter(b => !b.destroyed).length;
    const ratio = startCount > 0 ? alive / startCount : 1;
    // At 100% blocks: 1×. At 0% blocks: UNDERDOG_SPEED_MAX×. Linear interpolation.
    return 1 + (UNDERDOG_SPEED_MAX - 1) * (1 - ratio);
  }

  private updatePlayerMovement(dt: number): void {
    if (this.battleOver) return;

    const speedMult = this.underdogMult(this.playerBlocks, this.playerStartBlocks);
    const speed = PLAYER_SPEED * speedMult;

    const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.down.isDown;
    if (left)  this.playerOffX -= speed * dt;
    if (right) this.playerOffX += speed * dt;
    if (up)    this.playerOffY -= speed * dt;
    if (down)  this.playerOffY += speed * dt;

    // Boost (Space or Shift) — fired on key-just-pressed
    const shiftKey = (this as any)._shiftKey as Phaser.Input.Keyboard.Key;
    const boostJustPressed = Phaser.Input.Keyboard.JustDown(this.boostKey) ||
                             Phaser.Input.Keyboard.JustDown(shiftKey);
    const bx = right ? 1 : left ? -1 : 0;
    const by = down  ? 1 : up   ? -1 : 0;
    const anyDir = bx !== 0 || by !== 0;
    if (boostJustPressed && anyDir && this.playerBoost >= BOOST_COST && this.playerBoostT >= 1.0) {
      this.playerBoost -= BOOST_COST;
      // Direction: exactly the keys the player is holding
      const len = Math.hypot(bx, by);
      this.playerBoostDirX = bx / len;
      this.playerBoostDirY = by / len;
      this.playerBoostT = 0.0;  // start the dash
      SFX.play('boost');
    }

    // Advance dash and apply quad-out displacement
    if (this.playerBoostT < 1.0) {
      const prevT    = this.playerBoostT;
      this.playerBoostT = Math.min(1.0, prevT + dt / BOOST_DURATION);
      const prevEase = 1 - (1 - prevT) * (1 - prevT);
      const newEase  = 1 - (1 - this.playerBoostT) * (1 - this.playerBoostT);
      const delta    = (newEase - prevEase) * BOOST_DISTANCE;
      this.playerOffX += this.playerBoostDirX * delta;
      this.playerOffY += this.playerBoostDirY * delta;
    }

    // Regen
    this.playerBoost = Math.min(1, this.playerBoost + BOOST_REGEN * dt);

    // Clamp
    const maxX = GAME_WIDTH / 2 - PLAYER_BOUNDS_PAD;
    const maxY = 120;
    this.playerOffX = Phaser.Math.Clamp(this.playerOffX, -maxX, maxX);
    this.playerOffY = Phaser.Math.Clamp(this.playerOffY, -maxY, maxY);

    // Draw boost bar
    this.playerBoostBar.clear();
    const barX = GAME_WIDTH - 20, barY = GAME_HEIGHT - 30;
    const bw = 170, bh = 10;
    // Track background
    this.playerBoostBar.fillStyle(0x0a1a14, 1);
    this.playerBoostBar.fillRoundedRect(barX - bw, barY, bw, bh, 5);
    // Track border
    this.playerBoostBar.lineStyle(1, 0x1a4a38, 1);
    this.playerBoostBar.strokeRoundedRect(barX - bw, barY, bw, bh, 5);
    // Fill
    const fillColor = this.playerBoost >= BOOST_COST ? 0x4ecdc4 : 0x1a5544;
    const fillW = Math.max(0, bw * this.playerBoost);
    this.playerBoostBar.fillStyle(fillColor, 1);
    this.playerBoostBar.fillRoundedRect(barX - bw, barY, fillW, bh, 5);
    // Shine
    if (fillW > 6) {
      this.playerBoostBar.fillStyle(0xffffff, 0.18);
      this.playerBoostBar.fillRoundedRect(barX - bw, barY, fillW, bh / 2, 5);
    }
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    SFX.clearFrame();
    updateStarLayers(this.starLayers, dt);
    if (this.battleOver) return;

    this.updatePlayerMovement(dt);
    this.updateEnemyAI(dt);
    this.updateBeamCharges(dt);

    // Redraw ships at new offsets
    for (const b of this.playerBlocks) {
      if (!b.destroyed) this.redrawBlock(b, this.playerOffX, this.playerOffY, false);
    }
    for (const b of this.enemyBlocks) {
      if (!b.destroyed) this.redrawBlock(b, this.enemyOffX, 0, true);
    }

    // Move + draw projectiles
    for (const p of this.projectiles) {
      if (p.destroyed) continue;

      // ─ Per-type physics before moving ─
      if (p.weaponType === 'missile' && p.accel !== undefined) {
        const spd = Math.hypot(p.vx, p.vy);
        const dir = Math.atan2(p.vy, p.vx);
        const newSpd = spd + p.accel * dt;
        p.vx = Math.cos(dir) * newSpd;
        p.vy = Math.sin(dir) * newSpd;
      }
      if (p.weaponType === 'homing' && p.accel !== undefined && p.homingBlocks) {
        // Accelerate
        const spd = Math.hypot(p.vx, p.vy);
        const curDir = Math.atan2(p.vy, p.vx);
        const newSpd = Math.min(spd + p.accel * dt, LASER_SPEED * 1.1);
        // Find nearest weapon block (or core) to home toward
        const pool = (p.homingBlocks).filter(b => !b.destroyed);
        const tOffX = p.homingOffX ?? 0;
        const tOffY = p.homingOffY ?? 0;
        let nearX = p.x + Math.cos(curDir) * 200;
        let nearY = p.y + Math.sin(curDir) * 200;
        let nearDist = Infinity;
        for (const t of pool) {
          const tx = this.blockWorldX(t, tOffX);
          const ty = this.blockWorldY(t, tOffY);
          // Prefer weapon blocks; core as fallback
          const priority = t.isCore ? 1000 : 0;
          const d = Math.hypot(tx - p.x, ty - p.y) + priority;
          if (d < nearDist) { nearDist = d; nearX = tx; nearY = ty; }
        }
        if (nearDist > HOMING_LOCK_DIST) {
          // Steer toward target
          const desiredDir = Math.atan2(nearY - p.y, nearX - p.x);
          let dAngle = desiredDir - curDir;
          // Normalise to [-PI, PI]
          while (dAngle > Math.PI)  dAngle -= Math.PI * 2;
          while (dAngle < -Math.PI) dAngle += Math.PI * 2;
          const maxTurn = HOMING_TURN_SPEED * dt;
          const turn = Phaser.Math.Clamp(dAngle, -maxTurn, maxTurn);
          const newDir = curDir + turn;
          p.vx = Math.cos(newDir) * newSpd;
          p.vy = Math.sin(newDir) * newSpd;
        } else {
          // Close enough — go straight
          p.vx = Math.cos(curDir) * newSpd;
          p.vy = Math.sin(curDir) * newSpd;
        }
      }
      if (p.weaponType === 'funnel') {
        // Funnel fires its own lasers on a timer
        p.funnelFireTimer = (p.funnelFireTimer ?? FUNNEL_FIRE_RATE) - dt;
        if (p.funnelFireTimer <= 0) {
          p.funnelFireTimer = FUNNEL_FIRE_RATE;
          const tgts = (p.funnelTargets ?? []).filter(t => !t.destroyed);
          if (tgts.length > 0) {
            const tOffX = p.funnelTOffX ?? 0;
            const tOffY = p.funnelTOffY ?? 0;
            let nearDist = Infinity;
            let nx = p.x, ny = p.y;
            for (const t of tgts) {
              const tx = this.blockWorldX(t, tOffX);
              const ty = this.blockWorldY(t, tOffY);
              const d = Math.hypot(tx - p.x, ty - p.y);
              if (d < nearDist) { nearDist = d; nx = tx; ny = ty; }
            }
            const ang = Math.atan2(ny - p.y, nx - p.x);
            const lg = this.add.graphics();
            this.projectiles.push({
              x: p.x, y: p.y,
              vx: Math.cos(ang) * LASER_SPEED * 0.8,
              vy: Math.sin(ang) * LASER_SPEED * 0.8,
              damage: FUNNEL_LASER_DMG,
              weaponType: 'laser', isPlayer: p.isPlayer,
              graphics: lg, destroyed: false,
            });
          }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < -80 || p.x > GAME_WIDTH + 80 || p.y < -160 || p.y > GAME_HEIGHT + 160) {
        p.graphics.destroy(); p.destroyed = true; continue;
      }

      // Rock absorbs enemy projectiles (the rock itself travels as a projectile).
      // Rocks also destroy mines on contact.
      if (p.weaponType === 'rock') {
        const r = p.radius ?? ROCK_RADIUS;
        for (const other of this.projectiles) {
          if (other === p || other.destroyed || other.isPlayer === p.isPlayer) continue;
          if (other.weaponType === 'rock') continue;  // rock vs rock — ignore
          if (Math.hypot(other.x - p.x, other.y - p.y) < r + (other.radius ?? 6)) {
            other.graphics.destroy(); other.destroyed = true;
            if (p.hp !== undefined) {
              p.hp--;
              if (p.hp <= 0) { p.graphics.destroy(); p.destroyed = true; }
            }
          }
        }
        if (p.destroyed) continue;
      }

      // Mines cancel out opposing mines on contact (both destroyed)
      if (p.weaponType === 'mine') {
        const r = p.radius ?? MINE_RADIUS;
        for (const other of this.projectiles) {
          if (other === p || other.destroyed || other.weaponType !== 'mine') continue;
          if (other.isPlayer === p.isPlayer) continue;  // same side — ignore
          if (Math.hypot(other.x - p.x, other.y - p.y) < r + (other.radius ?? MINE_RADIUS)) {
            // Both detonate
            const mx = (p.x + other.x) / 2;
            const my = (p.y + other.y) / 2;
            drawMechaExplosion(this, mx, my, r * 2.0, 0xff6600, 320);
            SFX.play('explosion');
            other.graphics.destroy(); other.destroyed = true;
            p.graphics.destroy();     p.destroyed = true;
            break;
          }
        }
        if (p.destroyed) continue;
      }

      // Asteroid collision
      let hitAst = false;
      for (const a of this.asteroids) {
        if (a.destroyed) continue;
        const collR = (p.radius ?? 5) + a.radius;
        if (Math.hypot(p.x - a.x, p.y - a.y) < collR) {
          // rocks and mines don't get stopped by asteroids
          if (p.weaponType !== 'rock' && p.weaponType !== 'mine' && p.weaponType !== 'funnel') {
            a.hp -= p.damage;
            if (a.hp <= 0) {
              a.destroyed = true; a.graphics.destroy();
              drawMechaExplosion(this, a.x, a.y, a.radius * 1.6, 0xff8800, 360);
              SFX.play('hit_asteroid'); SFX.play('explosion');
              spawnAsteroidDebris(this, a.x, a.y, a.radius, a.seed);
            } else { this.drawAsteroid(a); }
            p.graphics.destroy(); p.destroyed = true;
            hitAst = true; break;
          }
        }
      }
      if (hitAst) continue;

      // Ship block collision
      const targets = p.isPlayer ? this.enemyBlocks : this.playerBlocks;
      const tOffX   = p.isPlayer ? this.enemyOffX   : this.playerOffX;
      const tOffY   = p.isPlayer ? 0                : this.playerOffY;
      // Funnels don't do direct collision damage
      if (p.weaponType === 'funnel') { this.drawProjectile(p); continue; }
      let hit = false;
      for (const t of targets) {
        if (t.destroyed) continue;
        const tx = this.blockWorldX(t, tOffX);
        const ty = this.blockWorldY(t, tOffY);
        const collR = (p.radius ?? 0);
        // For laser bolts use a line-segment vs circle test so the hitbox
        // matches the visual length of the bolt (22 px) and does NOT trigger
        // when the projectile centre is far from the block.
        let dist: boolean;
        if (p.weaponType === 'laser') {
          const BOLT_HALF = 11; // half the bolt's visual length
          const bLen = Math.hypot(p.vx, p.vy);
          if (bLen === 0) {
            dist = Math.hypot(p.x - tx, p.y - ty) < t.cellSize * 0.5;
          } else {
            const ux = p.vx / bLen, uy = p.vy / bLen;
            // Project block centre onto bolt axis, clamp to bolt endpoints
            const proj = Phaser.Math.Clamp(
              (tx - p.x) * ux + (ty - p.y) * uy,
              -BOLT_HALF, BOLT_HALF,
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
            // Core is hittable: spread damage to all live adjacent blocks
            const coreOffX = p.isPlayer ? this.enemyOffX  : this.playerOffX;
            const coreOffY = p.isPlayer ? 0               : this.playerOffY;
            const allBlocks = p.isPlayer ? this.enemyBlocks : this.playerBlocks;
            const neighbours = allBlocks.filter(nb =>
              !nb.destroyed && !nb.isCore &&
              Math.abs(nb.gridCol - t.gridCol) + Math.abs(nb.gridRow - t.gridRow) === 1
            );
            const dmgTargets = neighbours.length > 0 ? neighbours : [];
            let anyDestroyed = false;
            for (const nb of dmgTargets) {
              nb.hp -= p.damage;
              if (nb.hp <= 0) {
                nb.hp = 0; nb.destroyed = true;
                nb.graphics.destroy(); nb.hpBar.destroy();
                drawMechaExplosion(this, this.blockWorldX(nb, coreOffX), this.blockWorldY(nb, coreOffY), nb.cellSize * 0.7, 0x00ffee, 280);
                SFX.play(`hit_${p.weaponType}`); SFX.play('explosion');
                anyDestroyed = true;
              } else {
                this.redrawBlock(nb, coreOffX, coreOffY, !p.isPlayer);
              }
            }
            if (anyDestroyed) {
              if (p.isPlayer) this.pruneDisconnected(this.enemyBlocks, coreOffX, coreOffY, true);
              else            this.pruneDisconnected(this.playerBlocks, coreOffX, coreOffY, false);
            }
            // Consume the projectile and flash the core
            p.graphics.destroy(); p.destroyed = true;
            drawMechaExplosion(this, p.x, p.y, t.cellSize * 0.28, 0x00ffee, 180, 15);
            this.updateHud();
          }
          continue;
        }
        if (dist) {
          // Mine/rock have their own hp — deplete on contact
          if ((p.weaponType === 'mine' || p.weaponType === 'rock') && p.hp !== undefined) {
            p.hp--;
            if (p.hp <= 0) { p.graphics.destroy(); p.destroyed = true; }
          } else {
            p.graphics.destroy(); p.destroyed = true;
          }
          t.hp -= p.damage;
          if (t.hp <= 0) {
            t.hp = 0; t.destroyed = true;
            t.graphics.destroy(); t.hpBar.destroy();
            drawMechaExplosion(this, tx, ty, t.cellSize * 0.7, 0xffffff, 300);
            SFX.play(`hit_${p.weaponType}`); SFX.play('explosion');
            if (p.isPlayer) this.pruneDisconnected(this.enemyBlocks, this.enemyOffX, 0, true);
            else            this.pruneDisconnected(this.playerBlocks, this.playerOffX, this.playerOffY, false);
          } else {
            // Block survived — small impact flash
            const impactColor = p.isPlayer ? 0xffe66d : 0xff6b6b;
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

    this.projectiles = this.projectiles.filter(q => !q.destroyed);

    // Move asteroids
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
    this.asteroids = this.asteroids.filter(a => !a.destroyed);

    // Win condition: enemy must be fully disarmed (core is invincible).
    // Player loses if all their blocks are gone, core is gone, or they are disarmed.
    const enemyLoses  = this.shipDisarmed(this.enemyBlocks);
    const playerAlive = this.playerBlocks.filter(b => !b.destroyed).length;
    const playerCore  = this.playerBlocks.find(b => b.isCore && !b.destroyed);
    const playerLoses = playerAlive === 0 || !playerCore || this.shipDisarmed(this.playerBlocks);
    if (enemyLoses)       this.endBattle(true);
    else if (playerLoses) this.endBattle(false);
  }

  private endBattle(playerWon: boolean): void {
    if (this.battleOver) return;
    this.battleOver = true;
    this.playerWon  = playerWon;
    this.playerFireTimer.remove();
    this.enemyFireTimer.remove();
    this.asteroidSpawnTimer.remove();

    // Determine losing ship for the death cascade
    const losingBlocks  = playerWon ? this.enemyBlocks  : this.playerBlocks;
    const losingOffX    = playerWon ? this.enemyOffX    : this.playerOffX;
    const losingOffY    = playerWon ? 0                 : this.playerOffY;

    // Cascade death explosions, then reveal UI
    this.spawnShipDeathExplosion(losingBlocks, losingOffX, losingOffY, () => {
      // Show overlay panel
      const overlayPanel = (this as any)._overlayPanel as Phaser.GameObjects.Graphics;
      overlayPanel?.setVisible(true).setAlpha(0);
      if (overlayPanel) {
        this.tweens.add({ targets: overlayPanel, alpha: 1, duration: 250, ease: 'Quad.easeOut' });
      }

      if (playerWon) {
        gameState.round++;
        gameState.enemyPieceCount += ENEMY_PIECE_GROWTH;
        this.statusText.setText('★  VICTORY  ★\nEnemy disarmed!').setVisible(true).setColor('#4ecdc4');
        SFX.play('victory');
      } else {
        gameState.lives = Math.max(0, gameState.lives - 1);
        const disarmed = this.shipDisarmed(this.playerBlocks);
        const reason = disarmed ? 'Disarmed!' : 'Ship Destroyed!';
        SFX.play('defeat');
        if (gameState.lives > 0) {
          const livesLabel = `${gameState.lives} ${gameState.lives === 1 ? 'life' : 'lives'} remaining  —  Respawning…`;
          this.statusText.setText(`✖  ${reason}\n${livesLabel}`).setVisible(true).setColor('#ff6b6b');
          this._oLives = this.add.graphics().setDepth(32);
          drawLivesRow(this._oLives, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, PLAYER_LIVES, gameState.lives, 18);
        } else {
          this.statusText.setText(`✖  ${reason}\nNo lives remaining\nGAME OVER`).setVisible(true).setColor('#ff4444');
        }
      }
      this.continueBtn.setVisible(true);
      this.tweens.add({
        targets: this.continueBtn,
        scaleX: 1.06, scaleY: 1.06,
        duration: 420, yoyo: true, repeat: -1,
      });
    });
  }

  /** Cascading 90s mecha death explosion sequence across a ship's block positions.
   *  Fires staggered drawMechaExplosion calls, then a final super-burst at the centroid.
   *  Calls onComplete after the full sequence. */
  private spawnShipDeathExplosion(
    blocks: LiveBlock[],
    offX: number, offY: number,
    onComplete: () => void,
  ): void {
    const live = blocks.filter(b => !b.destroyed);
    if (live.length === 0) { onComplete(); return; }

    // Collect world positions
    const positions = live.map(b => ({
      x: b.baseX + offX + b.cellSize / 2,
      y: b.baseY + offY + b.cellSize / 2,
      cs: b.cellSize,
    }));

    // Shuffle positions for a random cascade order
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Centroid for the final super-burst
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
    const avgCs = positions.reduce((s, p) => s + p.cs, 0) / positions.length;

    // Stagger: fire one explosion every ~80ms across all blocks, then the super-burst
    const interval = 75;  // ms between each block explosion
    const totalDur = positions.length * interval;

    positions.forEach((pos, i) => {
      this.time.delayedCall(i * interval, () => {
        // Alternate colours: orange/white/cyan for variety
        const colors = [0xff6600, 0xffffff, 0x00ffee, 0xff4400, 0xffcc00];
        const col = colors[i % colors.length];
        drawMechaExplosion(this, pos.x, pos.y, pos.cs * 0.85, col, 400, 25);
        // Screen shake: brief offset on the first few explosions
        if (i < 4) {
          const shakeAmt = 8 - i * 1.5;
          this.cameras.main.shake(120, shakeAmt / GAME_WIDTH);
        }
      });
    });

    // Final super-burst: two massive overlapping explosions at the centroid
    this.time.delayedCall(totalDur + 80, () => {
      drawMechaExplosion(this, cx, cy, avgCs * 3.5, 0xffffff,  600, 26);
      drawMechaExplosion(this, cx, cy, avgCs * 2.5, 0xff6600,  700, 25);
      drawMechaExplosion(this, cx, cy, avgCs * 1.8, 0xffcc00,  500, 27);
      this.cameras.main.shake(350, 0.018);
    });

    // Complete callback after cascade + super-burst has had time to read
    this.time.delayedCall(totalDur + 200, onComplete);
  }

  /** Rebuild the player ship at full HP in the same battle, leaving the enemy untouched. */
  private respawnPlayer(): void {
    // 1. Destroy old player block graphics
    for (const b of this.playerBlocks) {
      try { b.graphics.destroy(); } catch (_) { /* ignore */ }
      try { b.hpBar.destroy(); } catch (_) { /* ignore */ }
    }
    this.playerBlocks = [];

    // 2. Clear all projectiles and beam charges (fresh slate for both sides)
    for (const p of this.projectiles) {
      try { p.graphics.destroy(); } catch (_) { /* ignore */ }
    }
    this.projectiles = [];
    for (const bc of this.beamCharges) {
      try { bc.graphics.destroy(); } catch (_) { /* ignore */ }
    }
    this.beamCharges = [];
    this.beamCooldowns   = new WeakMap();
    this.funnelCooldowns = new WeakMap();

    // 3. Rebuild player ship from gameState.placedPieces at the existing battleCellSize
    if (gameState.placedPieces.length > 0) {
      this.playerBlocks = this.makeShipBlocks(
        gameState.placedPieces,
        gameState.coreCol, gameState.coreRow,
        GAME_WIDTH / 2, this.PLAYER_LANE_Y, false,
      );
    }
    this.playerStartBlocks = this.playerBlocks.length;

    // 4. Reset player position and boost
    this.playerOffX = 0;
    this.playerOffY = 0;
    this.playerBoost = 1.0;
    this.playerBoostDirX = 0;
    this.playerBoostDirY = 0;
    this.playerBoostT = 1.0;

    // 5. Restart fire timers (endBattle stopped them)
    this.playerFireTimer.remove();
    this.enemyFireTimer.remove();
    this.playerFireTimer = this.time.addEvent({
      delay: 1200, callback: this.playerFire, callbackScope: this, loop: true,
    });
    this.enemyFireTimer = this.time.addEvent({
      delay: 1500, callback: this.enemyFire, callbackScope: this, loop: true,
    });

    // 6. Resume battle
    this.battleOver = false;
    this.playerWon  = false;
    this.statusText.setVisible(false);
    this.continueBtn.setVisible(false);
    const overlayPanel = (this as any)._overlayPanel as Phaser.GameObjects.Graphics;
    overlayPanel?.setVisible(false);
    if (this._oLives) { this._oLives.destroy(); this._oLives = null; }
    this.updateHud();

    // 7. Full-screen flash to signal the respawn
    const flash = this.add.graphics().setDepth(25);
    flash.fillStyle(0x4ecdc4, 0.35);
    flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 500, ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private updateHud(): void {
    const pa = this.playerBlocks.filter(b => !b.destroyed).length;
    const ea = this.enemyBlocks.filter(b  => !b.destroyed).length;
    const pw = this.playerBlocks.filter(b => !b.destroyed && b.weaponType !== null).length;
    const ew = this.enemyBlocks.filter(b  => !b.destroyed && b.weaponType !== null).length;
    this.playerHpText?.setText(`■ Your ship: ${pa} blocks  ⚡${pw} weapons`);
    this.enemyHpText?.setText(`■ Enemy: ${ea} blocks  ⚡${ew} weapons`);
    // Redraw lives hearts — top row of player HUD strip, centred
    if (this.livesGfx) {
      drawLivesRow(this.livesGfx, GAME_WIDTH / 2, GAME_HEIGHT - 96, PLAYER_LIVES, gameState.lives, 16);
    }
  }

  private makeBattleButton(label: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
    const w = 260, h = 72, r = 14;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, r);
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.fillStyle(0xffffff, 0.12);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, r);
    bg.lineStyle(2, 0xffffff, 0.22);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    const text = this.add.text(0, 0, label, {
      fontSize: '26px', fontFamily: 'Arial', color: '#fff',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const c = this.add.container(0, 0, [shadow, bg, text]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: 'Quad.easeOut' });
      })
      .on('pointerout', () => {
        this.tweens.add({ targets: c, scaleX: 1.0, scaleY: 1.0, duration: 100, ease: 'Quad.easeOut' });
      })
      .on('pointerdown', () => {
        this.tweens.add({ targets: c, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true });
        onClick();
      });
    return c;
  }

}

// ═══════════════════════════════════════════════════════════════════════════════
// TITLE SCENE
// ═══════════════════════════════════════════════════════════════════════════════

class TitleScene extends Phaser.Scene {
  private starLayers: StarLayer[] = [];

  constructor() { super({ key: 'TitleScene' }); }

  create(): void {
    BGM.playBuild();

    // ── Background ────────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x02040e, 0x02040e, 0x060c1a, 0x060c1a, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.starLayers = initStarLayers(this, 0.18);

    const CX = GAME_WIDTH / 2;

    // ── Arwing ship key art ────────────────────────────────────────────────
    this._drawArwing(CX, 350);

    // ── Mecha title ───────────────────────────────────────────────────────────
    this._drawMechaTitle(CX, 530);

    // ── Instruction cards ─────────────────────────────────────────────────────
    this._drawInstructions(CX, 790);

    // ── Tap to start ─────────────────────────────────────────────────────────
    const tap = this.add.text(CX, 1220, 'TAP TO START', {
      fontSize: '38px', fontFamily: 'Arial Black', color: '#4ecdc4',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 6,
      letterSpacing: 8,
    }).setOrigin(0.5).setDepth(5);
    this.tweens.add({
      targets: tap, alpha: 0.15, duration: 820, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── Tap / click to proceed ────────────────────────────────────────────────
    this.input.once('pointerdown', () => {
      this.scene.start('BuildScene');
    });
  }

  update(_t: number, delta: number): void {
    updateStarLayers(this.starLayers, delta / 1000);
  }

  // ─── Arwing-style fighter (top-down view) ─────────────────────────────────
  private _drawArwing(cx: number, cy: number): void {
    const g = this.add.graphics().setDepth(3);

    // ── Engine thruster glow (drawn first, behind everything) ──────────────
    // Two main engine nacelles + central exhaust
    for (const ox of [-72, 0, 72]) {
      g.fillStyle(0x00ccff, ox === 0 ? 0.18 : 0.12);
      g.fillCircle(cx + ox, cy + 130, ox === 0 ? 38 : 28);
      g.fillStyle(0x44eeff, ox === 0 ? 0.35 : 0.25);
      g.fillCircle(cx + ox, cy + 130, ox === 0 ? 20 : 14);
      g.fillStyle(0xaaffff, 1);
      g.fillCircle(cx + ox, cy + 130, ox === 0 ? 7 : 5);
    }

    // ── Outer swept delta wings ─────────────────────────────────────────
    // Left wing: sweeps back and outward from fuselage mid to tip
    const lWing = [
      { x: cx - 30,  y: cy - 60  },   // root leading edge
      { x: cx - 240, y: cy + 80  },   // tip leading edge
      { x: cx - 200, y: cy + 130 },   // tip trailing
      { x: cx - 30,  y: cy + 100 },   // root trailing
    ];
    g.fillStyle(0x1a3550, 1);
    g.fillPoints(lWing, true);
    g.lineStyle(2, 0x3a7aaa, 0.85);
    g.strokePoints(lWing, true);
    // Right wing mirror
    const rWing = lWing.map(p => ({ x: cx + (cx - p.x), y: p.y }));
    g.fillStyle(0x1a3550, 1);
    g.fillPoints(rWing, true);
    g.lineStyle(2, 0x3a7aaa, 0.85);
    g.strokePoints(rWing, true);

    // Wing panel detail lines
    const wingPairs: Array<[{x:number,y:number}[], number]> = [[lWing, -1], [rWing, 1]];
    for (const [pts, sign] of wingPairs) {
      const wx0 = pts[0].x, wy0 = pts[0].y;
      const wx1 = pts[1].x, wy1 = pts[1].y;
      g.lineStyle(1, 0x4a9acc, 0.4);
      // Two ribs from root to 60% and 80% span
      for (const t of [0.55, 0.78]) {
        g.lineBetween(
          cx + sign * 30, cy - 20 + 120 * t,
          wx0 + (wx1 - wx0) * t, wy0 + (wy1 - wy0) * t
        );
      }
    }

    // ── Engine nacelles (left and right) ─────────────────────────────────
    for (const ox of [-72, 72]) {
      const nacPts = [
        { x: cx + ox - 18, y: cy - 30  },
        { x: cx + ox + 18, y: cy - 30  },
        { x: cx + ox + 22, y: cy + 120 },
        { x: cx + ox - 22, y: cy + 120 },
      ];
      g.fillStyle(0x243d56, 1);
      g.fillPoints(nacPts, true);
      g.lineStyle(2, 0x4a8aaa, 0.8);
      g.strokePoints(nacPts, true);
      // Nacelle centre spine
      g.lineStyle(1, 0x6ab0cc, 0.5);
      g.lineBetween(cx + ox, cy - 30, cx + ox, cy + 120);
    }

    // ── Central fuselage body ─────────────────────────────────────────────
    const fusPts = [
      { x: cx,       y: cy - 160 },  // nose tip
      { x: cx + 30,  y: cy - 60  },  // nose right shoulder
      { x: cx + 46,  y: cy + 100 },  // body right
      { x: cx + 22,  y: cy + 140 },  // tail right
      { x: cx - 22,  y: cy + 140 },  // tail left
      { x: cx - 46,  y: cy + 100 },  // body left
      { x: cx - 30,  y: cy - 60  },  // nose left shoulder
    ];
    g.fillStyle(0x1e3a52, 1);
    g.fillPoints(fusPts, true);
    g.lineStyle(2.5, 0x4a8aaa, 0.9);
    g.strokePoints(fusPts, true);

    // Fuselage panel lines
    g.lineStyle(1, 0x3a7090, 0.5);
    g.lineBetween(cx, cy - 60, cx, cy + 140);    // centre spine
    g.lineBetween(cx - 30, cy + 10, cx + 30, cy + 10);  // mid cross
    g.lineBetween(cx - 40, cy + 70, cx + 40, cy + 70);  // rear cross

    // ── Cockpit canopy ──────────────────────────────────────────────────
    const canPts = [
      { x: cx,       y: cy - 130 },  // front
      { x: cx + 16,  y: cy - 55  },  // right
      { x: cx + 12,  y: cy + 20  },  // right rear
      { x: cx - 12,  y: cy + 20  },  // left rear
      { x: cx - 16,  y: cy - 55  },  // left
    ];
    g.fillStyle(0x0a1e30, 1);
    g.fillPoints(canPts, true);
    g.lineStyle(1.5, 0x00ccff, 0.7);
    g.strokePoints(canPts, true);
    // Canopy inner reflection highlight
    g.fillStyle(0x44aaff, 0.18);
    g.fillPoints(canPts, true);
    // Canopy frame spine
    g.lineStyle(1, 0x44aaff, 0.5);
    g.lineBetween(cx, cy - 130, cx, cy + 20);

    // ── Nose laser cannon tip ────────────────────────────────────────────
    g.fillStyle(0x88ddff, 0.9);
    g.fillCircle(cx, cy - 162, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy - 162, 3);
    // Nose glow
    g.fillStyle(0x44aaff, 0.25);
    g.fillCircle(cx, cy - 155, 18);

    // ── Wing-tip cannons ────────────────────────────────────────────────
    for (const ox of [-200, 200]) {
      // Small cannon pod on wing tip
      g.fillStyle(0x1e3a52, 1);
      g.fillRect(cx + ox - 8, cy + 70, 16, 32);
      g.lineStyle(1, 0x4a8aaa, 0.7);
      g.strokeRect(cx + ox - 8, cy + 70, 16, 32);
      // Barrel
      g.fillStyle(0x6ab0cc, 0.9);
      g.fillRect(cx + ox - 3, cy + 62, 6, 14);
      // Glow dot
      g.fillStyle(0xaaffff, 0.8);
      g.fillCircle(cx + ox, cy + 63, 4);
    }

    // ── Shield generator / sensor dome (centre fuselage) ─────────────────
    g.fillStyle(0x0a2030, 1);
    g.fillCircle(cx, cy + 50, 14);
    g.lineStyle(1.5, 0x00ccff, 0.7);
    g.strokeCircle(cx, cy + 50, 14);
    g.fillStyle(0x00ffee, 0.35);
    g.fillCircle(cx, cy + 50, 8);
    g.fillStyle(0xaaffff, 1);
    g.fillCircle(cx, cy + 50, 4);

    // ── Ambient glow under the ship ─────────────────────────────────────
    const glow2 = this.add.graphics().setDepth(2);
    glow2.fillStyle(0x0044aa, 0.07);
    glow2.fillEllipse(cx, cy + 30, 500, 200);
    glow2.fillStyle(0x0088ff, 0.05);
    glow2.fillEllipse(cx, cy + 30, 340, 130);
  }

  // ─── Mecha-style title text ──────────────────────────────────────────────
  private _drawMechaTitle(cx: number, y: number): void {
    // Line 1: BATTLEWING
    const line1 = this.add.text(cx, y, 'BATTLEWING', {
      fontSize: '96px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#e8f4ff',
      fontStyle: 'bold',
      stroke: '#001828',
      strokeThickness: 10,
      letterSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(5);

    // Line 2: ARCHITECT
    const line2 = this.add.text(cx, y + 108, 'ARCHITECT', {
      fontSize: '72px',
      fontFamily: 'Arial Black, Impact, sans-serif',
      color: '#4ecdc4',
      fontStyle: 'bold',
      stroke: '#001020',
      strokeThickness: 8,
      letterSpacing: 14,
    }).setOrigin(0.5, 0).setDepth(5);

    // Decorative frame around BATTLEWING
    const g = this.add.graphics().setDepth(4);
    const b1 = line1.getBounds();
    const pad = 14;
    const chamfer = 18;
    const fx = b1.x - pad, fy = b1.y - pad;
    const fw = b1.width + pad * 2, fh = b1.height + pad * 2;

    // Outer frame with chamfered corners (top-right, bottom-left)
    const framePts = [
      { x: fx + chamfer,      y: fy },
      { x: fx + fw,           y: fy },
      { x: fx + fw,           y: fy + fh - chamfer },
      { x: fx + fw - chamfer, y: fy + fh },
      { x: fx,                y: fy + fh },
      { x: fx,                y: fy + chamfer },
    ];
    g.lineStyle(2, 0x00ffee, 0.55);
    g.strokePoints(framePts, true);

    // Corner accent brackets
    const acL = 28;
    g.lineStyle(3, 0x00ffee, 0.9);
    // Top-left bracket
    g.lineBetween(fx, fy + chamfer, fx, fy + chamfer + acL);
    g.lineBetween(fx + chamfer, fy, fx + chamfer + acL, fy);
    // Bottom-right bracket
    g.lineBetween(fx + fw, fy + fh - chamfer, fx + fw, fy + fh - chamfer - acL);
    g.lineBetween(fx + fw - chamfer, fy + fh, fx + fw - chamfer - acL, fy + fh);

    // Scan-line accent under BATTLEWING
    g.lineStyle(1, 0x00ffee, 0.20);
    for (let scan = 0; scan < fh; scan += 5) {
      g.lineBetween(fx, fy + scan, fx + fw, fy + scan);
    }

    // Thin separator line between lines 1 and 2
    const sepY = y + 106;
    g.lineStyle(2, 0x00ffee, 0.5);
    g.lineBetween(cx - 180, sepY, cx + 180, sepY);
    // Diamond centre mark on separator
    g.fillStyle(0x00ffee, 0.9);
    g.fillTriangle(cx, sepY - 7, cx - 7, sepY, cx, sepY + 7);
    g.fillTriangle(cx, sepY - 7, cx + 7, sepY, cx, sepY + 7);

    // Subtle glow behind title
    const glow = this.add.graphics().setDepth(3);
    glow.fillStyle(0x00ffee, 0.04);
    glow.fillRect(fx - 20, fy - 20, fw + 40, fh + 160);
  }

  // ─── Instruction cards ───────────────────────────────────────────────────
  private _drawInstructions(cx: number, y: number): void {
    const g = this.add.graphics().setDepth(4);

    const cards: Array<{ icon: string; text: string }> = [
      { icon: '⬡', text: 'Build your ship — drag pieces\nonto the grid, touching the core' },
      { icon: '✛', text: 'WASD / arrows to move\nyour ship in battle' },
      { icon: '◈', text: 'SPACE to boost-dodge\nin your held direction' },
      { icon: '✦', text: 'Destroy all enemy weapons\nto win each round' },
    ];

    const cardW = GAME_WIDTH - 60;
    const cardH = 90;
    const cardGap = 14;

    cards.forEach((card, i) => {
      const cy2 = y + i * (cardH + cardGap);
      const cx2 = cx;

      // Card background
      g.fillStyle(0x0a1828, 0.88);
      g.fillRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 8);
      g.lineStyle(1, 0x1e4060, 0.9);
      g.strokeRoundedRect(cx2 - cardW / 2, cy2, cardW, cardH, 8);
      // Left accent bar
      g.fillStyle(0x00ffee, 0.7);
      g.fillRect(cx2 - cardW / 2, cy2 + 10, 3, cardH - 20);

      // Icon
      this.add.text(cx2 - cardW / 2 + 28, cy2 + cardH / 2, card.icon, {
        fontSize: '32px', color: '#00ffee',
      }).setOrigin(0.5).setDepth(5);

      // Text
      this.add.text(cx2 - cardW / 2 + 60, cy2 + cardH / 2, card.text, {
        fontSize: '26px', fontFamily: 'Arial', color: '#c8e8f8',
        lineSpacing: 4,
      }).setOrigin(0, 0.5).setDepth(5);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════════

const config = createGameConfig();
config.scene = [TitleScene, BuildScene, BattleScene];
new Phaser.Game(config);
