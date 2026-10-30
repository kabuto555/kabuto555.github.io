/**
 * jsfxr-style procedural SFX. Recipes are plain data; `renderRecipe` turns one into mono samples (pure,
 * deterministic, no AudioContext needed). The engine uploads the result into a cached AudioBuffer.
 */
export type Wave = 'sine' | 'square' | 'saw' | 'tri' | 'noise';

export interface Layer {
  wave: Wave;
  /** Start / end frequency in Hz (exponential sweep). Ignored for noise. */
  f0: number;
  f1: number;
  /** Seconds. */
  dur: number;
  /** Start offset in seconds. */
  at?: number;
  /** Attack seconds (default 0.002). */
  attack?: number;
  /** Decay exponent: amplitude = (1-t)^curve. Higher = snappier (default 2). */
  curve?: number;
  /** Low-pass cutoff sweep Hz (0 = off). */
  lp0?: number;
  lp1?: number;
  /** High-pass cutoff Hz (0 = off). */
  hp?: number;
  gain?: number;
  vibHz?: number;
  vibAmt?: number;
  /** Square duty. */
  duty?: number;
}

export interface Recipe {
  layers: Layer[];
  /** Overall peak gain (<= 1). */
  gain: number;
  /** Optional feedback echo for tails. */
  echo?: { delay: number; fb: number; mix: number };
  /** Looping sound bed (edges faded for a quiet seam). */
  loop?: boolean;
  /** Max simultaneous voices of this sound. */
  voices: number;
  /** Bus: 'sfx' default; 'ui' is non-spatial feedback. */
  bus?: 'sfx' | 'ui';
}

const L = (l: Layer): Layer => l;
const N = (o: Omit<Layer, 'wave' | 'f0' | 'f1'>): Layer => ({ wave: 'noise', f0: 0, f1: 0, ...o });

export const SFX_RATE = 22050;

/** All sound recipes. Keys double as `SfxName`. */
export const RECIPES = {
  // ---- guns ----
  shot_pistol: { gain: 0.9, voices: 4, echo: { delay: 0.05, fb: 0.25, mix: 0.2 }, layers: [
    N({ dur: 0.16, curve: 4, lp0: 7000, lp1: 1500 }),
    L({ wave: 'saw', f0: 900, f1: 90, dur: 0.07, curve: 3, lp0: 3000, lp1: 500, gain: 0.7 }),
  ] },
  shot_revolver: { gain: 1, voices: 3, echo: { delay: 0.08, fb: 0.35, mix: 0.3 }, layers: [
    N({ dur: 0.3, curve: 3.5, lp0: 5000, lp1: 700 }),
    L({ wave: 'saw', f0: 500, f1: 50, dur: 0.14, curve: 2.5, lp0: 2000, lp1: 300, gain: 0.9 }),
  ] },
  shot_ar: { gain: 0.9, voices: 5, layers: [
    N({ dur: 0.14, curve: 4, lp0: 5500, lp1: 900 }),
    L({ wave: 'square', f0: 260, f1: 60, dur: 0.09, curve: 3, lp0: 1800, lp1: 300, gain: 0.8, duty: 0.4 }),
  ] },
  shot_smg: { gain: 0.8, voices: 6, layers: [
    N({ dur: 0.09, curve: 4, lp0: 6500, lp1: 1500 }),
    L({ wave: 'square', f0: 420, f1: 110, dur: 0.05, curve: 3, lp0: 2500, lp1: 500, gain: 0.6, duty: 0.3 }),
  ] },
  shot_shotgun: { gain: 1, voices: 3, echo: { delay: 0.09, fb: 0.3, mix: 0.25 }, layers: [
    N({ dur: 0.4, curve: 3, lp0: 4500, lp1: 400 }),
    L({ wave: 'sine', f0: 140, f1: 35, dur: 0.25, curve: 2 }),
  ] },
  shot_sniper: { gain: 1, voices: 2, echo: { delay: 0.17, fb: 0.45, mix: 0.4 }, layers: [
    N({ dur: 0.5, curve: 3.5, lp0: 9000, lp1: 800 }),
    L({ wave: 'saw', f0: 1400, f1: 70, dur: 0.12, curve: 3, lp0: 4000, lp1: 400, gain: 0.7 }),
    L({ wave: 'sine', f0: 90, f1: 40, dur: 0.3, curve: 2, gain: 0.8 }),
  ] },
  shot_lmg: { gain: 0.9, voices: 6, layers: [
    N({ dur: 0.15, curve: 3.5, lp0: 4500, lp1: 700 }),
    L({ wave: 'sine', f0: 170, f1: 45, dur: 0.1, curve: 2 }),
  ] },
  shot_rpg: { gain: 1, voices: 2, echo: { delay: 0.12, fb: 0.3, mix: 0.2 }, layers: [
    N({ dur: 0.8, attack: 0.05, curve: 1.5, lp0: 500, lp1: 3500, hp: 150, gain: 0.9 }),
    L({ wave: 'sine', f0: 120, f1: 50, dur: 0.3, curve: 2, gain: 0.9 }),
  ] },
  explosion: { gain: 1, voices: 4, echo: { delay: 0.14, fb: 0.4, mix: 0.3 }, layers: [
    N({ dur: 1.4, curve: 2.2, lp0: 3500, lp1: 120 }),
    L({ wave: 'sine', f0: 90, f1: 22, dur: 1.0, curve: 1.8 }),
  ] },
  empty: { gain: 0.5, voices: 2, layers: [
    L({ wave: 'square', f0: 1800, f1: 900, dur: 0.025, curve: 3, gain: 0.8, duty: 0.2 }),
    N({ dur: 0.03, curve: 4, hp: 2000, gain: 0.5 }),
  ] },
  // ---- reload / swap ----
  mag_out: { gain: 0.55, voices: 2, layers: [
    N({ dur: 0.05, curve: 4, hp: 800, lp0: 5000 }),
    L({ wave: 'square', f0: 300, f1: 180, dur: 0.04, curve: 3, gain: 0.5, duty: 0.5 }),
    N({ dur: 0.05, at: 0.08, curve: 3, lp0: 1500, gain: 0.5 }),
  ] },
  mag_in: { gain: 0.65, voices: 2, layers: [
    N({ dur: 0.04, curve: 3, lp0: 2500, gain: 0.8 }),
    L({ wave: 'square', f0: 500, f1: 250, dur: 0.05, at: 0.05, curve: 3, gain: 0.7, duty: 0.5 }),
    N({ dur: 0.03, at: 0.05, curve: 4, hp: 1500, gain: 0.8 }),
  ] },
  bolt: { gain: 0.65, voices: 2, layers: [
    N({ dur: 0.05, curve: 3, hp: 1200, gain: 0.9 }),
    L({ wave: 'square', f0: 700, f1: 350, dur: 0.04, at: 0.07, curve: 3, gain: 0.7, duty: 0.4 }),
    N({ dur: 0.05, at: 0.07, curve: 3, hp: 1800, gain: 0.8 }),
  ] },
  swap: { gain: 0.5, voices: 2, layers: [
    N({ dur: 0.12, attack: 0.03, curve: 1.5, hp: 400, lp0: 1200, lp1: 3500, gain: 0.8 }),
    L({ wave: 'square', f0: 400, f1: 260, dur: 0.04, at: 0.1, curve: 3, gain: 0.5, duty: 0.5 }),
  ] },
  // ---- feedback ----
  hitmarker: { gain: 0.45, voices: 3, bus: 'ui', layers: [
    L({ wave: 'square', f0: 1700, f1: 1500, dur: 0.035, curve: 2, gain: 0.8, duty: 0.35 }),
    N({ dur: 0.015, curve: 3, hp: 3000, gain: 0.5 }),
  ] },
  headshot: { gain: 0.5, voices: 2, bus: 'ui', layers: [
    L({ wave: 'sine', f0: 2200, f1: 2100, dur: 0.4, curve: 3, gain: 0.8 }),
    L({ wave: 'sine', f0: 3300, f1: 3150, dur: 0.25, curve: 3, gain: 0.35 }),
    L({ wave: 'square', f0: 1700, f1: 1500, dur: 0.03, curve: 2, gain: 0.5, duty: 0.35 }),
  ] },
  kill_tick: { gain: 0.5, voices: 2, bus: 'ui', layers: [
    L({ wave: 'square', f0: 1100, f1: 900, dur: 0.07, curve: 2, gain: 0.6, duty: 0.4 }),
    L({ wave: 'sine', f0: 600, f1: 500, dur: 0.1, curve: 2, gain: 0.5 }),
  ] },
  // ---- melee / shield ----
  knife_swish: { gain: 0.55, voices: 3, layers: [
    N({ dur: 0.18, attack: 0.05, curve: 1.8, hp: 600, lp0: 1500, lp1: 6000 }),
  ] },
  knife_hit: { gain: 0.8, voices: 4, layers: [
    N({ dur: 0.1, curve: 4, lp0: 3500, lp1: 600 }),
    L({ wave: 'sine', f0: 180, f1: 70, dur: 0.1, curve: 2.5, gain: 0.8 }),
  ] },
  shield_clang: { gain: 0.8, voices: 3, echo: { delay: 0.03, fb: 0.4, mix: 0.3 }, layers: [
    L({ wave: 'square', f0: 820, f1: 800, dur: 0.35, curve: 3, gain: 0.45, duty: 0.5 }),
    L({ wave: 'square', f0: 1230, f1: 1190, dur: 0.3, curve: 3, gain: 0.35, duty: 0.5 }),
    N({ dur: 0.06, curve: 4, hp: 1500, gain: 0.9 }),
  ] },
  sword_whoosh: { gain: 0.6, voices: 3, layers: [
    N({ dur: 0.35, attack: 0.12, curve: 1.6, hp: 300, lp0: 800, lp1: 4500 }),
  ] },
  // ---- movement ----
  footstep: { gain: 0.5, voices: 4, layers: [
    N({ dur: 0.08, curve: 3, lp0: 900, lp1: 250 }),
    L({ wave: 'sine', f0: 110, f1: 55, dur: 0.06, curve: 2, gain: 0.5 }),
  ] },
  jump: { gain: 0.35, voices: 2, layers: [
    N({ dur: 0.08, curve: 2.5, lp0: 1500, lp1: 400, gain: 0.8 }),
  ] },
  land: { gain: 0.7, voices: 2, layers: [
    L({ wave: 'sine', f0: 100, f1: 40, dur: 0.15, curve: 2.5 }),
    N({ dur: 0.1, curve: 3, lp0: 1200, lp1: 250, gain: 0.8 }),
  ] },
  roll: { gain: 0.5, voices: 2, layers: [
    N({ dur: 0.4, attack: 0.1, curve: 1.8, hp: 200, lp0: 600, lp1: 2800 }),
    N({ dur: 0.08, at: 0.32, curve: 3, lp0: 700, gain: 0.6 }),
  ] },
  mantle: { gain: 0.55, voices: 2, layers: [
    L({ wave: 'saw', f0: 190, f1: 120, dur: 0.22, attack: 0.03, curve: 1.5, lp0: 900, lp1: 500, gain: 0.8, vibHz: 28, vibAmt: 0.06 }),
    N({ dur: 0.2, attack: 0.02, curve: 2, lp0: 1200, gain: 0.35 }),
  ] },
  estus: { gain: 0.6, voices: 2, layers: [
    L({ wave: 'sine', f0: 200, f1: 90, dur: 0.14, curve: 2, gain: 0.8 }),
    L({ wave: 'sine', f0: 190, f1: 80, dur: 0.14, at: 0.2, curve: 2, gain: 0.8 }),
    L({ wave: 'sine', f0: 180, f1: 70, dur: 0.16, at: 0.4, curve: 2, gain: 0.8 }),
    N({ dur: 0.6, attack: 0.05, curve: 1.2, hp: 800, lp0: 3500, gain: 0.15 }),
  ] },
  exhausted: { gain: 0.5, voices: 1, layers: [
    N({ dur: 0.5, attack: 0.15, curve: 1.5, hp: 500, lp0: 2800, lp1: 1200 }),
  ] },
  player_hurt: { gain: 0.7, voices: 2, layers: [
    L({ wave: 'sine', f0: 90, f1: 40, dur: 0.18, curve: 2.5 }),
    L({ wave: 'saw', f0: 240, f1: 150, dur: 0.14, curve: 2, lp0: 900, gain: 0.5, vibHz: 22, vibAmt: 0.05 }),
    N({ dur: 0.07, curve: 4, lp0: 2500, gain: 0.5 }),
  ] },
  // ---- enemies ----
  enemy_alert: { gain: 0.6, voices: 3, layers: [
    L({ wave: 'saw', f0: 150, f1: 210, dur: 0.3, attack: 0.04, curve: 1.5, lp0: 900, lp1: 1400, gain: 0.9, vibHz: 14, vibAmt: 0.08 }),
    N({ dur: 0.3, attack: 0.05, curve: 1.5, lp0: 1500, gain: 0.25 }),
  ] },
  enemy_hurt: { gain: 0.55, voices: 4, layers: [
    L({ wave: 'saw', f0: 260, f1: 110, dur: 0.15, curve: 2, lp0: 1100, lp1: 400, gain: 0.9, vibHz: 30, vibAmt: 0.07 }),
    N({ dur: 0.05, curve: 4, lp0: 2500, gain: 0.5 }),
  ] },
  enemy_death: { gain: 0.7, voices: 4, layers: [
    L({ wave: 'saw', f0: 230, f1: 55, dur: 0.6, curve: 1.6, lp0: 1000, lp1: 200, gain: 0.9, vibHz: 18, vibAmt: 0.1 }),
    N({ dur: 0.25, at: 0.3, curve: 2, lp0: 700, gain: 0.5 }),
  ] },
  // ---- grenades / fire ----
  grenade_throw: { gain: 0.4, voices: 3, layers: [
    N({ dur: 0.15, attack: 0.04, curve: 1.8, hp: 400, lp0: 1200, lp1: 3500 }),
  ] },
  grenade_bounce: { gain: 0.5, voices: 3, layers: [
    L({ wave: 'square', f0: 900, f1: 500, dur: 0.05, curve: 3, gain: 0.6, duty: 0.5 }),
    N({ dur: 0.04, curve: 3, hp: 1200, gain: 0.7 }),
  ] },
  molotov_burst: { gain: 0.9, voices: 2, layers: [
    N({ dur: 0.7, attack: 0.02, curve: 2, lp0: 4000, lp1: 500 }),
    L({ wave: 'sine', f0: 120, f1: 45, dur: 0.4, curve: 2, gain: 0.7 }),
  ] },
  fire_loop: { gain: 0.55, voices: 3, loop: true, layers: [
    N({ dur: 2, attack: 0, curve: 0, lp0: 900, lp1: 900, hp: 100, gain: 0.7 }),
    N({ dur: 2, attack: 0, curve: 0, hp: 2500, gain: 0.15 }),
  ] },
  bonfire_loop: { gain: 0.45, voices: 1, loop: true, layers: [
    N({ dur: 2.5, attack: 0, curve: 0, lp0: 700, lp1: 700, hp: 80, gain: 0.5 }),
    N({ dur: 2.5, attack: 0, curve: 0, hp: 3500, gain: 0.12 }),
  ] },
  flashbang_bang: { gain: 1, voices: 2, layers: [
    N({ dur: 0.35, curve: 3, lp0: 9000, lp1: 1500 }),
    L({ wave: 'sine', f0: 150, f1: 60, dur: 0.2, curve: 2, gain: 0.8 }),
  ] },
  ring: { gain: 0.35, voices: 1, bus: 'ui', layers: [
    L({ wave: 'sine', f0: 4200, f1: 4100, dur: 3, attack: 0.01, curve: 2 }),
    L({ wave: 'sine', f0: 6300, f1: 6250, dur: 2, attack: 0.01, curve: 2.5, gain: 0.3 }),
  ] },
  // ---- stings / UI ----
  death_sting: { gain: 0.8, voices: 1, bus: 'ui', echo: { delay: 0.25, fb: 0.5, mix: 0.4 }, layers: [
    L({ wave: 'saw', f0: 110, f1: 55, dur: 2.2, attack: 0.02, curve: 1.8, lp0: 700, lp1: 150, gain: 0.9 }),
    L({ wave: 'saw', f0: 116, f1: 58, dur: 2.2, attack: 0.02, curve: 1.8, lp0: 700, lp1: 150, gain: 0.7 }),
    N({ dur: 0.5, curve: 3, lp0: 1500, lp1: 200, gain: 0.5 }),
  ] },
  victory_sting: { gain: 0.8, voices: 1, bus: 'ui', echo: { delay: 0.3, fb: 0.45, mix: 0.35 }, layers: [
    L({ wave: 'saw', f0: 220, f1: 220, dur: 2.8, attack: 0.15, curve: 1.4, lp0: 1400, lp1: 1000, gain: 0.5 }),
    L({ wave: 'saw', f0: 330, f1: 330, dur: 2.8, attack: 0.2, curve: 1.4, lp0: 1400, lp1: 1000, gain: 0.4 }),
    L({ wave: 'saw', f0: 440, f1: 440, dur: 2.8, attack: 0.25, curve: 1.4, lp0: 1600, lp1: 1000, gain: 0.35 }),
    L({ wave: 'sine', f0: 55, f1: 55, dur: 2.8, attack: 0.05, curve: 1.5, gain: 0.7 }),
  ] },
  bonfire_lit: { gain: 0.6, voices: 1, bus: 'ui', echo: { delay: 0.2, fb: 0.4, mix: 0.3 }, layers: [
    L({ wave: 'sine', f0: 392, f1: 392, dur: 1.2, attack: 0.05, curve: 2, gain: 0.6 }),
    L({ wave: 'sine', f0: 587, f1: 587, dur: 1.4, at: 0.12, attack: 0.05, curve: 2, gain: 0.5 }),
    N({ dur: 0.6, attack: 0.05, curve: 1.5, lp0: 800, lp1: 3000, gain: 0.3 }),
  ] },
  pickup: { gain: 0.45, voices: 3, bus: 'ui', layers: [
    L({ wave: 'sine', f0: 880, f1: 880, dur: 0.12, curve: 2, gain: 0.7 }),
    L({ wave: 'sine', f0: 1320, f1: 1320, dur: 0.2, at: 0.07, curve: 2, gain: 0.7 }),
  ] },
  bloodstain: { gain: 0.6, voices: 1, bus: 'ui', echo: { delay: 0.15, fb: 0.4, mix: 0.3 }, layers: [
    L({ wave: 'sine', f0: 330, f1: 660, dur: 0.8, attack: 0.1, curve: 1.6, gain: 0.7 }),
    L({ wave: 'sine', f0: 495, f1: 990, dur: 0.8, attack: 0.15, curve: 1.6, gain: 0.4 }),
  ] },
  boom_thud: { gain: 1, voices: 2, layers: [
    L({ wave: 'sine', f0: 70, f1: 25, dur: 0.6, curve: 2 }),
    N({ dur: 0.25, curve: 3, lp0: 1500, lp1: 150, gain: 0.8 }),
  ] },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof RECIPES;
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/** Weapon class -> shot recipe. */
export const SHOT_BY_CLASS: Record<string, SfxName> = {
  pistol: 'shot_pistol', revolver: 'shot_revolver', ar: 'shot_ar', smg: 'shot_smg',
  shotgun: 'shot_shotgun', marksman: 'shot_sniper', lmg: 'shot_lmg', launcher: 'shot_rpg',
};

/** Deterministic PRNG in [-1,1) so renders are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Total rendered length in seconds (layers + echo tail). */
export function recipeDuration(r: Recipe): number {
  let d = 0;
  for (const l of r.layers) d = Math.max(d, (l.at ?? 0) + l.dur);
  if (r.echo) d += r.echo.delay * 4;
  return d;
}

/** Render a recipe to mono Float32 samples in [-1, 1]. */
export function renderRecipe(r: Recipe, name = 'x', rate = SFX_RATE): Float32Array {
  const total = Math.max(1, Math.ceil(recipeDuration(r) * rate));
  const out = new Float32Array(total);
  const rnd = lcg(hash(name));
  for (const l of r.layers) {
    const start = Math.floor((l.at ?? 0) * rate);
    const n = Math.max(1, Math.floor(l.dur * rate));
    const atk = Math.max(1, Math.floor((l.attack ?? 0.002) * rate));
    const curve = l.curve ?? 2;
    const g = l.gain ?? 1;
    let phase = 0;
    let lpState = 0;
    let hpState = 0;
    let hpPrev = 0;
    const hpA = l.hp ? Math.exp((-2 * Math.PI * l.hp) / rate) : 0;
    const seam = 0.02 * rate;
    for (let i = 0; i < n && start + i < total; i++) {
      const t = i / n;
      let env = curve === 0 ? 1 : Math.pow(1 - t, curve);
      if (i < atk && atk > 1) env *= i / atk;
      if (r.loop) env *= Math.min(1, Math.min(i, n - 1 - i) / seam);
      let s: number;
      if (l.wave === 'noise') {
        s = rnd();
      } else {
        const vib = l.vibHz ? 1 + Math.sin((2 * Math.PI * l.vibHz * i) / rate) * (l.vibAmt ?? 0) : 1;
        const f = l.f0 * Math.pow(l.f1 / l.f0, t) * vib;
        phase += f / rate;
        phase -= Math.floor(phase);
        switch (l.wave) {
          case 'sine': s = Math.sin(phase * 2 * Math.PI); break;
          case 'square': s = phase < (l.duty ?? 0.5) ? 1 : -1; break;
          case 'saw': s = phase * 2 - 1; break;
          default: s = Math.abs(phase * 4 - 2) - 1; break;
        }
      }
      if (l.lp0) {
        const fc = l.lp0 * Math.pow((l.lp1 || l.lp0) / l.lp0, t);
        const a = 1 - Math.exp((-2 * Math.PI * fc) / rate);
        lpState += a * (s - lpState);
        s = lpState;
      }
      if (l.hp) {
        hpState = hpA * (hpState + s - hpPrev);
        hpPrev = s;
        s = hpState;
      }
      out[start + i]! += s * env * g;
    }
  }
  if (r.echo) {
    const d = Math.max(1, Math.floor(r.echo.delay * rate));
    for (let i = d; i < total; i++) out[i]! += out[i - d]! * r.echo.fb * r.echo.mix * 2;
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const k = peak > 0 ? r.gain / peak : 0;
  const norm = Math.tanh(1.2);
  for (let i = 0; i < total; i++) out[i] = Math.tanh(out[i]! * k * 1.2) / norm;
  return out;
}
