import { describe, expect, it } from 'vitest';
import { equipLoadRatio, ROLL_TIERS, rollDistanceFrac, rollInvulnerable, rollTierFromRatio } from './rollTier';
import type { RollTier } from './rollTier';
import {
  canUseStamina,
  createStamina,
  drainStamina,
  loseStamina,
  refillStamina,
  regenStamina,
  setMaxStamina,
  spendStamina,
  STAMINA_TUNING,
} from './stamina';

const T = STAMINA_TUNING;

describe('stamina spend / canUse boundaries', () => {
  it('spending exactly the full bar exhausts (value hits 0)', () => {
    const s = spendStamina(createStamina(50), 50)!;
    expect(s.value).toBe(0);
    expect(s.exhausted).toBe(true);
    expect(canUseStamina(s)).toBe(false);
  });

  it('cost just under the value leaves a sliver and is still usable', () => {
    const s = spendStamina(createStamina(50), 50 - 1e-6)!;
    expect(s.value).toBeCloseTo(1e-6, 9);
    expect(s.exhausted).toBe(false);
    expect(canUseStamina(s)).toBe(true);
  });

  it('cost just over the value is allowed (DS-style) and bottoms out to exhausted', () => {
    const s = spendStamina(createStamina(50), 50 + 1e-6)!;
    expect(s.value).toBe(0);
    expect(s.exhausted).toBe(true);
  });

  it('refused spend returns null', () => {
    const s = spendStamina(createStamina(10), 10)!;
    expect(spendStamina(s, 0)).toBeNull();
  });

  it('zero-cost spend on a healthy bar leaves value unchanged but restarts regen delay', () => {
    const s = spendStamina(createStamina(10), 0)!;
    expect(s.value).toBe(10);
    expect(s.delay).toBe(T.regenDelay);
  });

  it('negative cost is treated as zero', () => {
    const s = spendStamina(createStamina(10), -5)!;
    expect(s.value).toBe(10);
  });
});

describe('regen timing', () => {
  it('does not regen during the delay, even for a long dt inside it', () => {
    const s = spendStamina(createStamina(100), 20)!;
    const after = regenStamina(s, T.regenDelay - 1e-6, 100);
    expect(after.value).toBe(80);
    expect(after.delay).toBeGreaterThan(0);
  });

  it('starts regen only after the delay elapses, consuming the delay first', () => {
    const s = spendStamina(createStamina(100), 20)!;
    const after = regenStamina(s, T.regenDelay + 0.5, 10);
    expect(after.value).toBeCloseTo(85, 9);
    expect(after.delay).toBe(0);
  });

  it('regen is capped at max', () => {
    const s = spendStamina(createStamina(100), 5)!;
    const after = regenStamina(s, 100, 1000);
    expect(after.value).toBe(100);
    expect(after.exhausted).toBe(false);
  });

  it('a spend during the delay restarts the delay (no regen leaks through)', () => {
    let s = spendStamina(createStamina(100), 10)!;
    s = regenStamina(s, T.regenDelay * 0.9, 100);
    s = spendStamina(s, 1)!;
    expect(s.delay).toBe(T.regenDelay);
    s = regenStamina(s, T.regenDelay * 0.9, 100);
    expect(s.value).toBe(89);
  });

  it('a continuous drain keeps the delay pinned while sprinting', () => {
    let s = createStamina(100);
    for (let i = 0; i < 10; i++) {
      s = drainStamina(s, 5, 1 / 60);
      s = regenStamina(s, 1 / 60, 100);
    }
    expect(s.delay).toBeCloseTo(T.regenDelay - 1 / 60, 9);
  });

  it('drain is a no-op while exhausted', () => {
    const s = spendStamina(createStamina(10), 10)!;
    expect(drainStamina(s, 100, 1)).toBe(s);
  });

  it('forced loss ignores exhaustion gating and can re-exhaust', () => {
    const s = loseStamina(spendStamina(createStamina(10), 10)!, 5);
    expect(s.value).toBe(0);
    expect(s.exhausted).toBe(true);
    expect(s.delay).toBe(T.exhaustDelay);
  });
});

describe('exhaustion', () => {
  it('uses the longer exhaustDelay after hitting 0', () => {
    const s = spendStamina(createStamina(10), 10)!;
    expect(s.delay).toBe(T.exhaustDelay);
    const after = regenStamina(s, T.exhaustDelay - 1e-6, 100);
    expect(after.value).toBe(0);
    expect(after.exhausted).toBe(true);
  });

  it('stays exhausted until the bar is completely full, not merely above zero', () => {
    let s = spendStamina(createStamina(10), 10)!;
    s = regenStamina(s, T.exhaustDelay, 1);
    s = regenStamina(s, 9.9, 1);
    expect(s.value).toBeCloseTo(9.9, 9);
    expect(s.exhausted).toBe(true);
    expect(canUseStamina(s)).toBe(false);
    expect(spendStamina(s, 1)).toBeNull();
    s = regenStamina(s, 0.1, 1);
    expect(s.value).toBe(10);
    expect(s.exhausted).toBe(false);
    expect(canUseStamina(s)).toBe(true);
  });

  it('a partial refill that reaches 1 unit below max does not clear exhaustion', () => {
    let s = spendStamina(createStamina(10), 10)!;
    s = regenStamina(s, T.exhaustDelay + 1, 9);
    expect(s.value).toBeCloseTo(9, 9);
    expect(s.exhausted).toBe(true);
  });

  it('refill clears exhaustion and the delay', () => {
    const s = refillStamina(spendStamina(createStamina(10), 10)!);
    expect(s).toEqual({ value: 10, max: 10, exhausted: false, delay: 0 });
    expect(canUseStamina(s)).toBe(true);
  });
});

describe('setMaxStamina', () => {
  it('shrinking below current value clamps the current value', () => {
    const s = setMaxStamina(createStamina(100), 60);
    expect(s.max).toBe(60);
    expect(s.value).toBe(60);
  });

  it('shrinking above current value keeps the current value', () => {
    const s = setMaxStamina(spendStamina(createStamina(100), 30)!, 50);
    expect(s.max).toBe(50);
    expect(s.value).toBe(50);
  });

  it('growing max keeps the current value (does not auto-fill)', () => {
    const s = setMaxStamina(spendStamina(createStamina(100), 30)!, 150);
    expect(s.value).toBe(70);
    expect(s.max).toBe(150);
  });

  it('exhaustion persists when max grows while value is still 0', () => {
    const s = setMaxStamina(spendStamina(createStamina(100), 100)!, 150);
    expect(s.exhausted).toBe(true);
    expect(canUseStamina(s)).toBe(false);
  });

  it('exhaustion clears if max shrinks onto a value that is already full', () => {
    // Exhausted with value 0 and max shrunk to 0: value == max, so exhaustion clears
    // but no action is possible (value must be > 0).
    const s = setMaxStamina(spendStamina(createStamina(100), 100)!, 0);
    expect(s.exhausted).toBe(false);
    expect(canUseStamina(s)).toBe(false);
  });

  it('same max returns the identical state object', () => {
    const s = createStamina(100);
    expect(setMaxStamina(s, 100)).toBe(s);
  });
});

describe('equipLoadRatio', () => {
  it('max load 0 with any weight is overloaded (Infinity)', () => {
    expect(equipLoadRatio(1, 0)).toBe(Infinity);
    expect(equipLoadRatio(0.001, 0)).toBe(Infinity);
  });

  it('max load 0 with zero weight is 0 (not NaN)', () => {
    expect(equipLoadRatio(0, 0)).toBe(0);
  });

  it('negative max load behaves like 0', () => {
    expect(equipLoadRatio(5, -10)).toBe(Infinity);
    expect(equipLoadRatio(0, -10)).toBe(0);
  });

  it('negative weight clamps to 0', () => {
    expect(equipLoadRatio(-5, 100)).toBe(0);
  });

  it('plain ratio', () => {
    expect(equipLoadRatio(25, 100)).toBe(0.25);
  });
});

describe('rollTierFromRatio boundaries', () => {
  it.each([
    [0.25 - 1e-9, 'fast'],
    [0.25, 'normal'],
    [0.25 + 1e-9, 'normal'],
    [0.5 - 1e-9, 'normal'],
    [0.5, 'normal'],
    [0.5 + 1e-9, 'slow'],
    [1 - 1e-9, 'slow'],
    [1, 'slow'],
    [1 + 1e-9, 'fat'],
  ] as const)('ratio %s -> %s', (ratio, tier) => {
    expect(rollTierFromRatio(ratio)).toBe(tier);
  });

  it('ratio 0 and very large ratio', () => {
    expect(rollTierFromRatio(0)).toBe('fast');
    expect(rollTierFromRatio(Infinity)).toBe('fat');
  });
});

describe('rollInvulnerable windows', () => {
  const tiers: RollTier[] = ['fast', 'normal', 'slow', 'fat'];

  it.each(tiers)('%s: start edge inclusive, end edge exclusive', (tier) => {
    const p = ROLL_TIERS[tier];
    expect(rollInvulnerable(p, p.iStart - 1e-9)).toBe(false);
    expect(rollInvulnerable(p, p.iStart)).toBe(true);
    expect(rollInvulnerable(p, p.iEnd - 1e-9)).toBe(true);
    expect(rollInvulnerable(p, p.iEnd)).toBe(false);
  });

  it.each(tiers)('%s: i-frame window is inside the roll duration', (tier) => {
    const p = ROLL_TIERS[tier];
    expect(p.iStart).toBeGreaterThanOrEqual(0);
    expect(p.iEnd).toBeLessThanOrEqual(p.duration);
    expect(p.iStart).toBeLessThan(p.iEnd);
  });

  it('normal tier matches PLAN §3 (0.05–0.35 s)', () => {
    expect(rollInvulnerable(ROLL_TIERS.normal, 0.05)).toBe(true);
    expect(rollInvulnerable(ROLL_TIERS.normal, 0.35)).toBe(false);
    expect(rollInvulnerable(ROLL_TIERS.normal, 0.04)).toBe(false);
  });

  it('negative time is never invulnerable', () => {
    expect(rollInvulnerable(ROLL_TIERS.fast, -0.01)).toBe(false);
  });
});

describe('roll tier monotonicity', () => {
  const order: RollTier[] = ['fast', 'normal', 'slow', 'fat'];

  it('roll distance strictly decreases from fast to fat', () => {
    for (let i = 1; i < order.length; i++) {
      expect(ROLL_TIERS[order[i]].distance).toBeLessThan(ROLL_TIERS[order[i - 1]].distance);
    }
  });

  it('i-frame window width does not grow from fast to fat', () => {
    const width = (t: RollTier) => ROLL_TIERS[t].iEnd - ROLL_TIERS[t].iStart;
    for (let i = 1; i < order.length; i++) {
      expect(width(order[i])).toBeLessThanOrEqual(width(order[i - 1]));
    }
  });

  it('move speed multiplier does not increase from fast to fat', () => {
    for (let i = 1; i < order.length; i++) {
      expect(ROLL_TIERS[order[i]].moveSpeedMul).toBeLessThanOrEqual(ROLL_TIERS[order[i - 1]].moveSpeedMul);
    }
  });

  it('only fat disables sprint', () => {
    expect(ROLL_TIERS.fat.canSprint).toBe(false);
    expect(ROLL_TIERS.fast.canSprint && ROLL_TIERS.normal.canSprint && ROLL_TIERS.slow.canSprint).toBe(true);
  });

  it.each(order)('%s: rollDistanceFrac is 0 at t<=0, 1 at move end, monotonic in between', (tier) => {
    const p = ROLL_TIERS[tier];
    const mt = p.duration * p.moveFrac;
    expect(rollDistanceFrac(p, 0)).toBe(0);
    expect(rollDistanceFrac(p, -1)).toBe(0);
    expect(rollDistanceFrac(p, mt)).toBe(1);
    expect(rollDistanceFrac(p, p.duration)).toBe(1);
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const f = rollDistanceFrac(p, (mt * i) / 100);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
  });

  it('rollDistanceFrac has an ease-out burst (more than half the distance in the first half of the move phase)', () => {
    const p = ROLL_TIERS.normal;
    const half = (p.duration * p.moveFrac) / 2;
    expect(rollDistanceFrac(p, half)).toBeGreaterThan(0.5);
  });
});
