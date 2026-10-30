/**
 * Seeded deterministic RNG (mulberry32). Use for drops, AI variation, procedural textures.
 * Never use Math.random() in gameplay code — pass/own an Rng so runs are reproducible.
 */
export class Rng {
  private s: number;

  constructor(seed: number = 0x9e3779b9) {
    this.s = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min = 0, max = 1): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (inclusive both ends). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** Weighted pick: weights parallel to items, need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i] ?? 0;
      if (r < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Independent child stream (e.g. one per enemy) derived from this seed + salt. */
  fork(salt: number): Rng {
    // Hash parent state + salt (murmur3 finalizer), then advance the parent so repeated forks differ.
    let h = (this.s ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    this.next();
    return new Rng(h);
  }

  /** Serializable state. */
  get state(): number {
    return this.s;
  }
  set state(v: number) {
    this.s = v >>> 0;
  }
}

/** Global gameplay RNG. Reseed at session start if determinism across runs matters. */
export const rng = new Rng();
