/**
 * Minigame "moment" sounds — reusable by any minigame.
 *
 *   playMinigameWin()   the local player won (dodgeball team win, log course finish)
 *   playMinigameFail()  the local player failed / got knocked out (hit, caught,
 *                       bumped out, fell in the water, …)
 *   playHopPop(vol)     a frog landed a hop in the log course (volume per call)
 *   playJump(vol)       someone jumped (yours full, other players' quieter)
 *   playSpringBoing(vol) a frog launched off a log-course spring pad
 *   playWaterSplash()   any frog fell in the log-course river
 *   playBumpFart()      the local player bumped someone out of place
 *   playTaikoCountdown(ka, don)  kabuki-style taiko countdown (sumo start):
 *                       "ka" rim clacks at the given times, then "don" hits
 *   playBoom(vol)       a sumo bomb exploded
 *   playSpicy(vol)      a sumo chonk ate a spicy pepper
 *   playPowerUp(vol)    grabbed a power-up (layered on the spicy pepper)
 *   playWhoosh(vol)     a sumo chonk launched (layered on the spring boing)
 *   playPunch(vol)      two sumo chonks collided
 *   (win and lose also duck the background music for the clip's length — music.ts)
 *   playMinigameLose()  the local player lost the minigame (dodgeball team lost,
 *                       log course attempt over). Supersedes a fail sound that's
 *                       still playing or pending, since the two often land together.
 *
 * Each moment has a ShuffledSounds set: one clip plays per call, drawn from a
 * shuffle bag, so every clip plays once before any repeats and a reshuffle
 * never puts the last one played first (no back-to-back repeats). A new future
 * moment is just another `new ShuffledSounds([...urls])`.
 *
 * Clips are fetched and decoded at load with an OfflineAudioContext (decoding
 * needs no user gesture), so they're ready immediately. Browsers only let audio
 * START after a gesture, so the one shared playback AudioContext is created on
 * the first pointer/key press.
 */

import { duckMusic } from './music';
import { gameSettings } from './game-settings';

const WIN_SOUND_URLS: readonly SoundClip[] = [
  'assets/win-winner.mp3',
  'assets/win-airhorn.mp3',
  // The GTA jingle runs ~15.6s; the others are 2–3s. Keep the recognisable
  // opening and fade the rest out.
  { url: 'assets/win-mission-passed.mp3', cutAt: 4, fade: 1.2 },
];

const LOSE_SOUND_URLS = [
  'assets/lose-dun-dun-dun.mp3',
  'assets/lose-nelson-haha.mp3',
  'assets/lose-nemesis.mp3',
  'assets/lose-price-is-right.mp3',
];

const FAIL_SOUND_URLS = [
  'assets/fail-vine-boom.mp3',
  'assets/fail-bruh.mp3',
  'assets/fail-goofy-bonk.mp3',
  'assets/fail-bonk.mp3',
  'assets/fail-ack.mp3',
  'assets/fail-erro.mp3',
  'assets/fail-faaah.mp3',
  'assets/fail-oohh.mp3',
];

// ── Shared audio (playback context created on the first user gesture) ─────────
let ctx: AudioContext | null = null;
let decoder: BaseAudioContext | null = null;
try { decoder = new OfflineAudioContext(2, 1, 44100); } catch { /* no Web Audio */ }

function unlock(): void {
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
  if (ctx) return;
  try {
    ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch { /* no audio */ }
}
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

/** A clip URL, or a URL with a cutoff: starts fading out `cutAt` seconds in,
 * silent `fade` seconds later (for clips much longer than their set-mates). */
export type SoundClip = string | { url: string; cutAt: number; fade?: number };

const DEFAULT_FADE = 1;

/** A set of interchangeable clips played in shuffled, non-repeating order. */
export class ShuffledSounds {
  private readonly urls: readonly string[];
  private readonly cuts: readonly ({ at: number; fade: number } | null)[];
  private readonly buffers: (AudioBuffer | null)[];
  private readonly failed = new Set<number>(); // couldn't load/decode — out of the rotation
  private bag: number[] = [];
  private last = -1;
  private playing: AudioBufferSourceNode | null = null;
  /** How long the clip from the last successful play() lasts (after any cutoff). */
  lastSeconds = 0;

  /** `volume` 0..1. Starting a clip stops this set's previous one if still
   * playing, unless `overlap` (for short, rapid-fire effects like hop pops). */
  constructor(
    clips: readonly SoundClip[],
    private readonly volume = 0.8,
    private readonly overlap = false,
  ) {
    this.urls = clips.map((c) => (typeof c === 'string' ? c : c.url));
    this.cuts = clips.map((c) => (typeof c === 'string' ? null : { at: c.cutAt, fade: c.fade ?? DEFAULT_FADE }));
    this.buffers = this.urls.map(() => null);
    // Fetch + decode now — neither needs a user gesture.
    this.urls.forEach((url, i) => {
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((data) => { if (!decoder) throw new Error('no Web Audio'); return decoder.decodeAudioData(data); })
        .then((buf) => { this.buffers[i] = buf; })
        .catch((e) => { this.failed.add(i); console.warn(`[minigame-sounds] failed to load ${url}`, e); });
    });
  }

  /** Next playable index from the shuffle bag (refilled + reshuffled when
   * empty). Skips clips that haven't finished decoding without using up their
   * turn; -1 if nothing is ready yet. */
  private next(): number {
    this.bag = this.bag.filter((i) => !this.failed.has(i));
    if (this.bag.length === 0) {
      this.bag = this.urls.map((_, i) => i).filter((i) => !this.failed.has(i));
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // Don't open the new round with the clip that closed the last one.
      if (this.bag.length > 1 && this.bag[0] === this.last) {
        [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
      }
    }
    const k = this.bag.findIndex((i) => this.buffers[i]);
    if (k < 0) return -1;
    this.last = this.bag.splice(k, 1)[0];
    return this.last;
  }

  /** Stop this set's clip if one is still playing. */
  stop(): void {
    try { this.playing?.stop(); } catch { /* already ended */ }
    this.playing = null;
  }

  /** Schedule the next clip `delay` seconds from now on the audio clock
   * (sample-accurate, unlike timers). Doesn't touch `playing`/`stop()`;
   * returns the source so the caller can cancel it, or null if not ready. */
  playAt(delay: number, scale = 1): AudioBufferSourceNode | null {
    if (!ctx || delay < -0.05) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    const i = this.next();
    if (i < 0) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[i]!;
    const g = ctx.createGain();
    g.gain.value = this.volume * scale;
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + Math.max(0, delay));
    return src;
  }

  /** Play the next clip now at `volume × scale`. Returns its URL, or null if
   * audio isn't ready. */
  play(scale = 1): string | null {
    if (!ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    const i = this.next();
    if (i < 0) return null; // nothing decoded yet (or all failed) — skip quietly
    if (!this.overlap) this.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[i]!;
    const g = ctx.createGain();
    const level = this.volume * scale;
    g.gain.value = level;
    src.connect(g).connect(ctx.destination);
    src.onended = () => { if (this.playing === src) this.playing = null; };
    src.start();
    const cut = this.cuts[i];
    this.lastSeconds = cut ? Math.min(src.buffer.duration, cut.at + cut.fade) : src.buffer.duration;
    if (cut) {
      // Hold, then ramp to silence and stop at the end of the fade.
      const t = ctx.currentTime;
      g.gain.setValueAtTime(level, t + cut.at);
      g.gain.linearRampToValueAtTime(0.0001, t + cut.at + cut.fade);
      src.stop(t + cut.at + cut.fade + 0.05);
    }
    this.playing = src;
    return this.urls[i];
  }
}

const winSounds = new ShuffledSounds(WIN_SOUND_URLS, 0.7);
const failSounds = new ShuffledSounds(FAIL_SOUND_URLS, 0.8);
const loseSounds = new ShuffledSounds(LOSE_SOUND_URLS, 0.8);
let pendingFail: ReturnType<typeof setTimeout> | null = null;
// Single-clip effects (the shuffle bag just replays the one clip).
const hopPop = new ShuffledSounds(['assets/sfx-hop-pop.mp3'], 1, true);
const jump = new ShuffledSounds(['assets/sfx-jump.mp3'], 0.6, true);
const bumpFart = new ShuffledSounds(['assets/sfx-bump-fart.mp3'], 0.8);
const springBoing = new ShuffledSounds(['assets/sfx-spring-boing.mp3'], 1, true);
const waterSplash = new ShuffledSounds(['assets/sfx-water-splash.mp3'], 0.8, true);
// Sumo: bomb blast, power-up (spicy pepper), launch whoosh, chonk-on-chonk punch.
const boom = new ShuffledSounds(['assets/sfx-sumo-explosion.mp3'], 0.9, true);
const spicy = new ShuffledSounds(['assets/sfx-sumo-spicy.mp3'], 1.6, true); // boosted: sits under the power-up pickup
const powerUp = new ShuffledSounds(['assets/sfx-power-up.mp3'], 0.9, true);
const whoosh = new ShuffledSounds(['assets/sfx-sumo-whoosh.mp3'], 0.8, true);
const punch = new ShuffledSounds(['assets/sfx-sumo-punch.mp3'], 0.9, true);
const taikoKa = new ShuffledSounds(['assets/sfx-taiko-ka.mp3'], 1, true);
const taikoDon = new ShuffledSounds(['assets/sfx-taiko-don.mp3'], 1, true);

// UI rewards: claiming anything (Camp Mail, Camp Pass goals / tiers, drive rewards) and the
// Camp Pass toast popping in. Claims overlap so rapid claiming stacks the wows; the toast
// is long-ish, so a new one cuts off the last.
const claimWow = new ShuffledSounds(['assets/sfx-claim-wow.mp3'], 0.7, true);
const toastSurprise = new ShuffledSounds(['assets/sfx-toast-surprise.mp3'], 1);

/** You claimed a reward. */
export function playClaim(volume = 1): void {
  const v = volume * gameSettings.get().sfxVolume;
  if (v > 0.01) claimWow.play(v);
}

// The toy button with no toy equipped: a friendly "Hey!".
const noToyHey = new ShuffledSounds(['assets/sfx-toy-hey.mp3'], 0.8, true);

/** Tapped the toy button with nothing in the toy slot. */
export function playNoToy(volume = 1): void {
  const v = volume * gameSettings.get().sfxVolume;
  if (v > 0.01) noToyHey.play(v);
}

/** A Camp Pass toast (goal complete, new stamp, drive news) slid in. */
export function playToastPop(volume = 1): void {
  const v = volume * gameSettings.get().sfxVolume;
  if (v > 0.01) toastSurprise.play(v);
}

/** A bomb went off, at `volume` (0..1). Overlapping booms are allowed. */
export function playBoom(volume = 1): void {
  if (volume > 0.01) boom.play(volume);
}

/** Sumo: ate a spicy pepper. */
export function playSpicy(volume = 1): void {
  if (volume > 0.01) spicy.play(volume);
}

/** Grabbed a power-up (layered on the sumo spicy pepper). Overlaps allowed. */
export function playPowerUp(volume = 1): void {
  if (volume > 0.01) powerUp.play(volume);
}

/** Sumo: a chonk launched (the whoosh layered on the spring boing). Overlaps allowed. */
export function playWhoosh(volume = 1): void {
  if (volume > 0.01) whoosh.play(volume);
}

/** Sumo: two chonks slammed together. Overlaps allowed. */
export function playPunch(volume = 1): void {
  if (volume > 0.01) punch.play(volume);
}

/** Kabuki taiko countdown: a "ka" rim clack at each time in `ka` and a "don"
 * drum hit at each time in `don` (seconds from now). Returns a cancel function
 * that silences anything still to come (e.g. the player left mid-countdown). */
export function playTaikoCountdown(ka: readonly number[], don: readonly number[], volume = 1): () => void {
  if (!ctx) return () => {}; // no audio until the first tap (attract rounds before that stay silent)
  let cancelled = false;
  const srcs: AudioBufferSourceNode[] = [];
  const schedule = (late: number) => {
    if (cancelled) return;
    for (const t of ka) { const s = taikoKa.playAt(t - late, volume); if (s) srcs.push(s); }
    for (const t of don) { const s = taikoDon.playAt(t - late, volume); if (s) srcs.push(s); }
    if (srcs.length === 0) console.warn('[minigame-sounds] taiko countdown: clips not ready');
  };
  // A suspended context has a frozen clock: scheduling against it would bunch
  // every hit up on resume. Wait for it to run, then shift by the time lost.
  const t0 = performance.now();
  if (ctx && ctx.state !== 'running') {
    void ctx.resume().then(() => schedule((performance.now() - t0) / 1000), () => schedule(0));
  } else {
    schedule(0);
  }
  return () => {
    cancelled = true;
    for (const s of srcs) { try { s.stop(); } catch { /* already ended */ } }
  };
}

/** Log-course hop pop at `volume` (0..1) — callers pick loud for the local
 * player, quiet for everyone else. Overlapping pops are allowed. */
export function playHopPop(volume: number): void {
  if (volume > 0.01) hopPop.play(volume);
}

/** Log-course spring launch at `volume` (0..1). Overlapping boings are allowed. */
export function playSpringBoing(volume: number): void {
  if (volume > 0.01) springBoing.play(volume);
}

/** Someone jumped, at `volume` (0..1; 1 = the local player's own). Overlaps,
 * so quick re-jumps each get their own. */
export function playJump(volume = 1): void {
  if (volume > 0.01) jump.play(volume);
}

/** A frog fell in the log-course river, at `volume` (0..1). Overlapping
 * splashes are allowed. */
export function playWaterSplash(volume = 1): void {
  if (volume > 0.01) waterSplash.play(volume);
}

/** The local player bumped another frog out of place on the log course. */
export function playBumpFart(): void {
  bumpFart.play();
}

/** The local player won a minigame. */
export function playMinigameWin(): string | null {
  const url = winSounds.play();
  if (url) duckMusic(winSounds.lastSeconds); // let the sting land over the music
  return url;
}

/** The local player failed / got knocked out of a minigame. `delay` (seconds)
 * lets it land just after the game's own impact sound instead of on top of it. */
export function playMinigameFail(delay = 0): void {
  if (pendingFail) clearTimeout(pendingFail);
  pendingFail = null;
  if (delay > 0) pendingFail = setTimeout(() => { pendingFail = null; failSounds.play(); }, delay * 1000);
  else failSounds.play();
}

/** The local player lost a minigame. Cuts off any fail sound still playing or
 * waiting to play, so the two don't pile on top of each other. */
export function playMinigameLose(): string | null {
  if (pendingFail) clearTimeout(pendingFail);
  pendingFail = null;
  failSounds.stop();
  const url = loseSounds.play();
  if (url) duckMusic(loseSounds.lastSeconds);
  return url;
}

/** Debug: play a fail clip now and report which one. */
export function playMinigameFailNow(): string | null {
  return failSounds.play();
}
