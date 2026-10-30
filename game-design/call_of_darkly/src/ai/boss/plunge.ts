// §10 plunging attack: fall from the watchtower onto the Taurus Demon's head for a big hit + stagger.
// Detected by polling the player's position/velocity (no controller changes). Forgiving on purpose:
// no button press is needed — any fall of ≥ minFall that meets the boss's head, or lands close
// to it while still falling fast, counts.

/** Tuning (m, m/s, fractions). Player gravity is 22 m/s², so a 5 m drop arrives at ~14.8 m/s. */
export const PLUNGE = {
  /** Fall height: peak of the jump/fall minus the boss's feet. The ledge is 8 m above the deck. */
  minFall: 5,
  /** Downward speed needed (≈ a 1.5 m free fall): stair hops / mantles never count. */
  minSpeed: 5.5,
  /** Horizontal radius around the boss centre for a head contact (boss body radius 1.1 + forgiveness). */
  headRadius: 2.7,
  /** Head contact band: feet between boss.y + headMin and the top of the head + headMargin. */
  headMin: 1.2,
  headMargin: 0.8,
  /** Landing radius (feet within this of the boss centre on touchdown). */
  landRadius: 4.0,
  /** Damage as a fraction of the boss's max HP, and the poise damage (always breaks). */
  damageFrac: 0.3,
  poiseDamage: 100000,
} as const;

export type PlungeTuning = { -readonly [K in keyof typeof PLUNGE]: number };

export interface PlungeBoss {
  x: number;
  y: number;
  z: number;
  /** Top of the head above the feet. */
  height: number;
}

export type PlungeHit = 'head' | 'land' | null;

/**
 * Per-fall tracker. Call `update` every sim tick with the player's feet position, vertical velocity
 * and grounded flag. Fires at most once per airborne span.
 */
export class PlungeTracker {
  airborne = false;
  peakY = 0;
  used = false;
  private prevVy = 0;
  private groundY = 0;
  private readonly t: PlungeTuning;

  constructor(t: Partial<PlungeTuning> = {}) {
    this.t = { ...PLUNGE, ...t };
  }

  reset(): void {
    this.airborne = false;
    this.used = false;
    this.prevVy = 0;
    this.peakY = 0;
    this.groundY = 0;
  }

  update(px: number, py: number, pz: number, vy: number, grounded: boolean, boss: PlungeBoss | null): PlungeHit {
    const t = this.t;
    let hit: PlungeHit = null;
    if (!grounded) {
      if (!this.airborne) {
        this.airborne = true;
        this.used = false;
        this.peakY = Math.max(py, this.groundY); // walked off a ledge: measure from where we stood
      }
      if (py > this.peakY) this.peakY = py;
      if (boss && !this.used && vy <= -t.minSpeed && this.peakY - boss.y >= t.minFall) {
        const h = Math.hypot(px - boss.x, pz - boss.z);
        const rel = py - boss.y;
        if (h <= t.headRadius && rel <= boss.height + t.headMargin && rel >= t.headMin) hit = 'head';
      }
    } else if (this.airborne) {
      // touchdown: judge with last tick's speed (the controller zeroes vy on landing)
      this.airborne = false;
      if (boss && !this.used && this.prevVy <= -t.minSpeed && this.peakY - boss.y >= t.minFall && Math.abs(py - boss.y) < 1.5) {
        if (Math.hypot(px - boss.x, pz - boss.z) <= t.landRadius) hit = 'land';
      }
    }
    if (hit) this.used = true;
    if (grounded) this.groundY = py;
    this.prevVy = grounded ? 0 : vy;
    return hit;
  }
}

/** Damage dealt by a plunge on a boss with `maxHp`. */
export function plungeDamage(maxHp: number, t: Pick<PlungeTuning, 'damageFrac'> = PLUNGE): number {
  return Math.round(maxHp * t.damageFrac);
}
