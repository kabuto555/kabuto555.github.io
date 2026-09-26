// Mr Kodak, the camp photographer — he's always somewhere with his camera, and snaps the
// local player's big moments: minigame wins, huge sumo slams, spring launches, catches,
// rides, big drops while wandering… Only the human player is ever photographed.
//
// Moments are grouped into sessions: a minigame or ride opens one (begin) and closes it
// (end); every moment in between is a candidate, and only the BEST one (highest score) is
// kept. Moments outside a session (wandering) open a short "wander" session of their own
// that closes after WANDER_WINDOW_MS, with a cooldown so camp isn't a paparazzi zone.
// When a session closes with a shot, the photo goes into the album (unseen) and
// `onDeveloped` fires — main lets you know (HUD photo button badge + a toast).
//
// A shot is a crop of the canvas's last frame (the renderer keeps its drawing buffer, and
// the HUD is DOM so it's never in the picture), framed around the player and scaled down to
// POSTCARD_PHOTO size as a JPEG.

import { photoAlbum, type Photo } from './album';
import { POSTCARD_PHOTO } from './postcard-art';
import { gameSettings } from '../game-settings';

/** Candidate-worthiness guide (0–100): wins 100, great plays 50–90, funny fails 30–40. */
export const KODAK_SCORE = {
  win: 100,
  ringOut: 80,
  catch: 75,
  splashAttack: 70,
  directHit: 60,
  bigSlam: 50,       // + force; sumo_hit by you
  spring: 50,
  ride: 45,          // + how exciting the moment is
  bugSquash: 35,
  bigDrop: 30,       // + fall height
  cannonball: 45,
  splash: 30,
} as const;

const WANDER_WINDOW_MS = 2500;   // a wander moment waits this long for a better one
const WANDER_COOLDOWN_MS = 60_000;
const DEVELOP_DELAY_MS = 1200;   // after a session ends, before Mr Kodak tells you
const MIN_CAPTURE_GAP_MS = 180;  // at most ~5 shots a second while scores keep climbing

export interface KodakOptions {
  canvas: HTMLCanvasElement;
  /** The player's spot on screen right now (0..1, y down), or null if off screen. */
  focus: () => { x: number; y: number } | null;
  /** A session closed with a photo (it's already in the album). */
  onDeveloped: (photo: Photo) => void;
}

interface Shot { score: number; caption: string; image: string; }
interface Session { place: string; wander: boolean; best: Shot | null; pendingBest: number; timer: number; }

export class MrKodak {
  private session: Session | null = null;
  private lastWanderShot = -Infinity;
  private lastCapture = 0;
  private readonly scratch = document.createElement('canvas');
  /** Off (e.g. during the FTUE) — moments are ignored. */
  enabled = true;

  constructor(private readonly opts: KodakOptions) {
    this.scratch.width = POSTCARD_PHOTO.w;
    this.scratch.height = POSTCARD_PHOTO.h;
  }

  /** A minigame / ride started at `place` ("the Log Course"). Closes any wander session first. */
  begin(place: string): void {
    if (this.session) this.end(0);
    this.session = { place, wander: false, best: null, pendingBest: -Infinity, timer: 0 };
  }

  /** The minigame / ride is over: keep the best shot (if any) and let the player know shortly. */
  end(delayMs = DEVELOP_DELAY_MS): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearTimeout(s.timer);
    if (!s.best) return;
    const best = s.best;
    if (s.wander) this.lastWanderShot = performance.now();
    const commit = () => this.opts.onDeveloped(photoAlbum.add({
      takenAt: Date.now(), image: best.image, caption: best.caption, place: s.place,
    }));
    if (delayMs > 0) window.setTimeout(commit, delayMs); else commit();
  }

  /**
   * Something photo-worthy just happened to the player. The frame is grabbed `delayMs`
   * later (let the splash rise / the launch get airborne) — and only if it would beat the
   * session's best so far. Outside a session, `wanderPlace` opens a wander session.
   */
  moment(caption: string, score: number, delayMs = 0, wanderPlace = 'Camp Chonkton'): void {
    if (!this.enabled) return;
    let s = this.session;
    if (!s) {
      if (performance.now() - this.lastWanderShot < WANDER_COOLDOWN_MS) return;
      s = this.session = { place: wanderPlace, wander: true, best: null, pendingBest: -Infinity, timer: 0 };
      s.timer = window.setTimeout(() => { if (this.session === s) this.end(); }, WANDER_WINDOW_MS + delayMs);
    }
    if (score <= Math.max(s.best?.score ?? -Infinity, s.pendingBest)) return;
    const now = performance.now();
    if (delayMs === 0 && now - this.lastCapture < MIN_CAPTURE_GAP_MS) return;
    s.pendingBest = score;
    const grab = () => {
      if (this.session !== s || score <= (s.best?.score ?? -Infinity)) return;
      const image = this.capture();
      if (image) s.best = { score, caption, image };
    };
    if (delayMs > 0) window.setTimeout(grab, delayMs);
    else grab();
  }

  /** The canvas's last frame, cropped to the post card photo's aspect around the player. */
  private capture(): string | null {
    const src = this.opts.canvas;
    const W = src.width, H = src.height;
    if (!W || !H) return null;
    this.lastCapture = performance.now();
    const aspect = POSTCARD_PHOTO.w / POSTCARD_PHOTO.h;
    // Portrait screen → a landscape band. A little tighter than full width so the player
    // reads bigger; slide the band to keep them in it.
    let cw = Math.min(W, H * aspect) * 0.92;
    let ch = cw / aspect;
    if (ch > H) { ch = H; cw = ch * aspect; }
    const f = this.opts.focus() ?? { x: 0.5, y: 0.55 };
    // The player sits a little below the band's centre (there's sky/action above them).
    const cx = THREE.MathUtils.clamp(f.x * W, cw / 2, W - cw / 2);
    const cy = THREE.MathUtils.clamp(f.y * H - ch * 0.08, ch / 2, H - ch / 2);
    const ctx = this.scratch.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(src, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, this.scratch.width, this.scratch.height);
      return this.scratch.toDataURL('image/jpeg', 0.78);
    } catch (e) {
      console.warn('[kodak] capture failed:', e);
      return null;
    }
  }
}

let shutterCtx: AudioContext | null = null;

/** Mr Kodak's shutter: a quick mechanical click-clack (synthesised noise bursts). */
export function playShutter(volume = 0.5): void {
  const v = volume * gameSettings.get().sfxVolume;
  if (v < 0.01) return;
  try {
    shutterCtx ??= new AudioContext();
    const ctx = shutterCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    for (const [at, gain, freq] of [[0, 1, 3200], [0.075, 0.7, 1800]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = v * gain;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(ctx.currentTime + at);
    }
  } catch { /* no audio */ }
}
