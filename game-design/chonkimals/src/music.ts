/**
 * Background music — one looping camp track, kept well under the SFX.
 *
 *   startMusic()        call once at boot; playback begins on the first
 *                       pointer/key press (browsers block audio before that)
 *   duckMusic(seconds)  dip the track for a big moment (win / lose stings),
 *                       then ease it back up
 *
 * The track streams from an <audio> element (no 86 s decode held in memory)
 * routed through a Web Audio gain node, so volume changes and ducks are smooth
 * ramps — and work on iOS, where an element's own `volume` is ignored.
 * Level: a quarter volume at the default Music Volume setting, scaled by the slider.
 */
import { gameSettings, DEFAULT_SETTINGS } from './game-settings';

const TRACK_URL = 'assets/music-dads-on-the-beach.mp3';
const BASE_LEVEL = 0.25;        // gain at the default Music Volume slider
const DUCK_LEVEL = 0.12;        // share of the normal level while ducked
const DUCK_IN = 0.25;           // seconds to dip down
const DUCK_OUT = 1.4;           // seconds to come back up after the sting
const VOLUME_RAMP = 0.15;       // seconds to follow a slider change

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let el: HTMLAudioElement | null = null;
let duckUntil = 0;              // ctx time the current duck ends
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

/** Normal (un-ducked) gain for the current Music Volume setting. */
function level(): number {
  return BASE_LEVEL * gameSettings.get().musicVolume / DEFAULT_SETTINGS.musicVolume;
}

function rampTo(target: number, seconds: number): void {
  if (!ctx || !gain) return;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(target, t + seconds);
}

function begin(): void {
  window.removeEventListener('pointerdown', begin, true);
  window.removeEventListener('keydown', begin, true);
  if (ctx) return;
  try {
    ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    el = new Audio(TRACK_URL);
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener('error', () => console.warn(`[music] failed to load ${TRACK_URL}`));
    gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
    void el.play().catch((e) => console.warn('[music] play blocked', e));
    rampTo(level(), 1.5); // gentle fade-in rather than a blast on first tap
  } catch (e) {
    console.warn('[music] unavailable', e);
  }
}

/** Arm the background track (it starts on the first user gesture). */
export function startMusic(): void {
  window.addEventListener('pointerdown', begin, true);
  window.addEventListener('keydown', begin, true);
  // Follow the Music Volume slider (unless a duck is holding it down).
  gameSettings.subscribe(() => {
    if (ctx && ctx.currentTime >= duckUntil) rampTo(level(), VOLUME_RAMP);
  });
  // Silence it while the tab is in the background.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

/** Dip the music for `seconds` (e.g. a win/lose sting's length), then ease back up.
 * Overlapping ducks extend the dip rather than stacking. */
export function duckMusic(seconds: number): void {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  if (now >= duckUntil) rampTo(level() * DUCK_LEVEL, DUCK_IN);
  duckUntil = Math.max(duckUntil, now + DUCK_IN + seconds);
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    rampTo(level(), DUCK_OUT);
  }, (duckUntil - now) * 1000);
}
