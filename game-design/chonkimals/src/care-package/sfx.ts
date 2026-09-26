// Care Package sounds: synthesized cardboard rattles + a reveal chime whose length
// and sparkle scale with rarity, layered with the game's existing boing/boom/whoosh
// clips. Volume follows the SFX setting.

import { gameSettings } from '../game-settings';
import { playBoom, playMinigameWin, playSpringBoing, playWhoosh } from '../minigame-sounds';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Call from a tap handler (browsers only start audio after a gesture). */
export function unlockCarePackageAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch { /* no audio */ }
}

const vol = () => gameSettings.get().sfxVolume;

/** One rattle of the box (`k` 0…1 = how hard). */
export function sfxRattle(k: number): void {
  if (!ctx || !noise || vol() <= 0.01) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 + Math.random() * 500 + k * 400;
    bp.Q.value = 3;
    const g = ctx.createGain();
    const at = t + i * 0.07;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime((0.35 + k * 0.4) * vol(), at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(at, Math.random() * 0.2, 0.12);
  }
}

/** The lid bursting off. */
export function sfxBurst(intensity: number): void {
  const v = vol();
  if (v <= 0.01) return;
  playSpringBoing(0.7 * v);
  if (intensity >= 1) playWhoosh((0.4 + intensity * 0.12) * v);
  if (intensity >= 2) playBoom((0.15 + intensity * 0.12) * v);
}

/** Rising arpeggio: more notes, higher and shinier for rarer rewards. */
export function sfxReveal(intensity: number, isNew: boolean): void {
  if (intensity >= 4 && isNew) playMinigameWin();
  if (!ctx || vol() <= 0.01) return;
  const scale = [0, 4, 7, 12, 16, 19, 24, 28]; // major arpeggio
  const n = 2 + intensity + (isNew ? 1 : 0);
  const base = 523.25; // C5
  const t = ctx.currentTime + 0.02;
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.085 - intensity * 0.008);
    for (const [type, mul, amp] of [['triangle', 1, 0.22], ['sine', 2, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = base * mul * Math.pow(2, scale[Math.min(i, scale.length - 1)] / 12);
      const g = ctx.createGain();
      const len = i === n - 1 ? 0.9 : 0.3;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(amp * vol(), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, at + len);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + len + 0.05);
    }
  }
}
