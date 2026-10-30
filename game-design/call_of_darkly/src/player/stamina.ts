/**
 * §3 Stamina — pure functions over an immutable state (unit-testable, no globals).
 *
 * Rules:
 * - A stamina action is allowed iff not exhausted and value > 0 (DS-style: you may start an
 *   action with less than its cost; the bar just bottoms out).
 * - Hitting 0 → **exhausted**: no stamina actions until the bar refills COMPLETELY.
 * - Any spend/drain restarts the regen delay (`regenDelay`); exhaustion uses the longer
 *   `exhaustDelay`. Regen only ticks once the delay has elapsed.
 */
export interface StaminaState {
  readonly value: number;
  readonly max: number;
  readonly exhausted: boolean;
  /** Seconds until regen resumes. */
  readonly delay: number;
}

export interface StaminaTuning {
  /** Regen pause after a spend/drain, s. */
  regenDelay: number;
  /** Regen pause after hitting 0, s. */
  exhaustDelay: number;
}

export const STAMINA_TUNING: StaminaTuning = {
  regenDelay: 0.6,
  exhaustDelay: 1.2,
};

export function createStamina(max: number): StaminaState {
  return { value: max, max, exhausted: false, delay: 0 };
}

/** Can a stamina action start right now? */
export function canUseStamina(s: StaminaState): boolean {
  return !s.exhausted && s.value > 0;
}

function afterSpend(s: StaminaState, value: number, t: StaminaTuning): StaminaState {
  const v = Math.max(0, value);
  if (v <= 0) return { value: 0, max: s.max, exhausted: true, delay: t.exhaustDelay };
  return { value: v, max: s.max, exhausted: s.exhausted, delay: Math.max(s.delay, t.regenDelay) };
}

/** Discrete action cost (jump, dodge, mantle, swing). Returns null (state unchanged) if refused. */
export function spendStamina(s: StaminaState, cost: number, t: StaminaTuning = STAMINA_TUNING): StaminaState | null {
  if (!canUseStamina(s)) return null;
  return afterSpend(s, s.value - Math.max(0, cost), t);
}

/** Continuous drain (sprint): `rate` per second over dt. No-op if exhausted. */
export function drainStamina(s: StaminaState, rate: number, dt: number, t: StaminaTuning = STAMINA_TUNING): StaminaState {
  if (s.exhausted) return s;
  return afterSpend(s, s.value - Math.max(0, rate) * dt, t);
}

/** Forced loss that ignores exhaustion gating (block hits). May exhaust. */
export function loseStamina(s: StaminaState, amount: number, t: StaminaTuning = STAMINA_TUNING): StaminaState {
  return afterSpend(s, s.value - Math.max(0, amount), t);
}

/** Advance regen by dt at `rate` per second. Clears exhaustion only at a full bar. */
export function regenStamina(s: StaminaState, dt: number, rate: number): StaminaState {
  let delay = s.delay;
  let rem = dt;
  if (delay > 0) {
    const used = Math.min(delay, rem);
    delay -= used;
    rem -= used;
  }
  let value = s.value;
  if (rem > 0 && value < s.max) value = Math.min(s.max, value + Math.max(0, rate) * rem);
  const exhausted = s.exhausted && value < s.max;
  if (value === s.value && delay === s.delay && exhausted === s.exhausted) return s;
  return { value, max: s.max, exhausted, delay };
}

/** Change max (Endurance level-up, maxStaminaBonus). Keeps the current value, clamped. */
export function setMaxStamina(s: StaminaState, max: number): StaminaState {
  if (max === s.max) return s;
  return { value: Math.min(s.value, max), max, exhausted: s.exhausted && s.value < max, delay: s.delay };
}

/** Full refill (bonfire rest / respawn). */
export function refillStamina(s: StaminaState): StaminaState {
  return { value: s.max, max: s.max, exhausted: false, delay: 0 };
}
