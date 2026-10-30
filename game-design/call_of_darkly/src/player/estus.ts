/**
 * Estus Flask (§3 Healing): N charges, flat heal per charge, refilled at a bonfire. Pure state
 * machine (no three, no events) so it is unit-testable; the controller drives it each sim tick and
 * emits `estusDrink` / `estusChanged`.
 *
 * DS1 rules: the charge is spent when the drink STARTS; getting hit interrupts it (the rest of the
 * heal is lost); the heal lands as a short glug in the middle of the animation lock.
 */

export const ESTUS_TUNING = {
  /** Total drink animation lock, s. */
  drinkTime: 1.0,
  /** Heal is applied evenly between these times (s into the drink). */
  healStart: 0.35,
  healEnd: 0.85,
  /** Movement speed multiplier while drinking (no sprint/jump/roll). */
  moveMul: 0.4,
} as const;

export class EstusFlask {
  charges: number;
  /** True during the drink lock. */
  drinking = false;
  /** Seconds into the current drink. */
  t = 0;
  /** HP delivered so far this drink. */
  healed = 0;

  constructor(
    public max: number,
    public healAmount: number,
    private readonly tune: typeof ESTUS_TUNING = ESTUS_TUNING,
  ) {
    this.charges = max;
  }

  /** Spend a charge and begin drinking. False if empty, already drinking, or HP already full. */
  start(hp: number, maxHp: number): boolean {
    if (this.drinking || this.charges <= 0 || hp >= maxHp) return false;
    this.charges--;
    this.drinking = true;
    this.t = 0;
    this.healed = 0;
    return true;
  }

  /** Advance dt seconds; returns HP to add this tick. Ends the drink when the lock is over. */
  update(dt: number): number {
    if (!this.drinking) return 0;
    const { healStart, healEnd, drinkTime } = this.tune;
    const t0 = this.t;
    const t1 = Math.min(drinkTime, t0 + dt);
    this.t = t1;
    const a = Math.min(Math.max(t0, healStart), healEnd);
    const b = Math.min(Math.max(t1, healStart), healEnd);
    let heal = ((b - a) / (healEnd - healStart)) * this.healAmount;
    if (t1 >= drinkTime) {
      this.drinking = false;
      // Float slop: deliver exactly the full amount.
      heal = this.healAmount - this.healed;
    }
    this.healed += heal;
    return heal;
  }

  /** Cancel an in-progress drink (hit taken). The spent charge is NOT refunded. True if one was active. */
  interrupt(): boolean {
    if (!this.drinking) return false;
    this.drinking = false;
    return true;
  }

  /** Bonfire rest / respawn: back to full charges, no drink in progress. */
  refill(): void {
    this.charges = this.max;
    this.drinking = false;
    this.t = 0;
    this.healed = 0;
  }

  setCharges(n: number): void {
    this.charges = Math.max(0, Math.min(this.max, Math.floor(n)));
  }

  get moveMul(): number {
    return this.drinking ? this.tune.moveMul : 1;
  }
}
