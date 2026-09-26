// Bots playing Dice With Friends. Two decisions a turn:
//  • which dice to hold before a reroll — every one of the 32 ways is tried by sampling the
//    rolls left (the middle one re-holding greedily) and scoring where the dice end up;
//  • which box to score — the one whose score beats what that box usually gets the most
//    (so a 12 in Fours is good, a 12 in Chance isn't), leaning toward the upper bonus.
// Sloppier bots add noise to both, so they miss holds and waste boxes like people do.

import type { Rng } from '../../rng';
import { UPPER, UPPER_BONUS, UPPER_BONUS_AT, open, scoreFor, upperTotal, type Card, type Category } from './rules';

/** Roughly what each box averages over a game — the bar a score has to clear. */
const TYPICAL: Record<Category, number> = {
  ones: 2.1, twos: 5.3, threes: 8.6, fours: 12.2, fives: 15.7, sixes: 19.2,
  three_kind: 15, four_kind: 6, full_house: 10, small_straight: 18, large_straight: 10, yahtzee: 3, chance: 21,
};
const OPPORTUNITY = 0.8;
const SAMPLES = 36;

/** How good scoring `dice` in `cat` is right now (score, less what the box usually gets, plus bonus pull). */
function worth(cat: Category, dice: readonly number[], card: Card): number {
  const s = scoreFor(cat, dice, card);
  let w = s - TYPICAL[cat] * OPPORTUNITY;
  const face = UPPER.indexOf(cat) + 1;
  if (face > 0) {
    // On pace for the bonus (three of a face each) is worth a share of it; short of pace costs.
    const par = face * 3, left = UPPER_BONUS_AT - upperTotal(card);
    if (left > 0) w += ((s - par) / Math.max(6, left)) * UPPER_BONUS * 0.5;
  }
  if (s === 0 && cat !== 'yahtzee') w -= 4; // a zero stings more than its number says
  return w;
}

function bestWorth(dice: readonly number[], card: Card): number {
  let best = -Infinity;
  for (const c of open(card)) best = Math.max(best, worth(c, dice, card));
  return best;
}

/** The box to score `dice` in. */
export function chooseCategory(dice: readonly number[], card: Card, skill: number, rng: Rng): Category {
  const noise = (1 - skill) * 5;
  let best: Category = open(card)[0], bw = -Infinity;
  for (const c of open(card)) {
    const w = worth(c, dice, card) + rng.range(-noise, noise);
    if (w > bw) { bw = w; best = c; }
  }
  return best;
}

/** A quick hold for a simulated middle roll: the biggest set of a face, or a straight run. */
function greedyHold(dice: readonly number[]): boolean[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of dice) c[v]++;
  const has = new Set(dice);
  for (const start of [2, 1, 3]) {
    if ([0, 1, 2, 3].every((k) => has.has(start + k))) {
      const keep = new Set([start, start + 1, start + 2, start + 3]);
      return dice.map((v) => { const k = keep.has(v); keep.delete(v); return k; });
    }
  }
  let face = 6;
  for (let v = 6; v >= 1; v--) if (c[v] > c[face]) face = v;
  return dice.map((v) => v === face);
}

function rerolled(dice: readonly number[], hold: readonly boolean[], rng: Rng): number[] {
  return dice.map((v, i) => (hold[i] ? v : 1 + Math.floor(rng.range(0, 6))));
}

/** Which dice to hold with `rollsLeft` rolls still to come (all held = stop and score). */
export function chooseHolds(dice: readonly number[], rollsLeft: number, card: Card, skill: number, rng: Rng): boolean[] {
  const noise = (1 - skill) * 4;
  let best: boolean[] = dice.map(() => true), bv = bestWorth(dice, card) + rng.range(-noise, noise);
  const samples = Math.round(SAMPLES * (0.4 + 0.6 * skill));
  for (let mask = 0; mask < 31; mask++) { // 31 = everything held (the "stop" above)
    const hold = dice.map((_, i) => !!(mask & (1 << i)));
    let sum = 0;
    for (let n = 0; n < samples; n++) {
      let d = rerolled(dice, hold, rng);
      if (rollsLeft > 1) d = rerolled(d, greedyHold(d), rng);
      sum += bestWorth(d, card);
    }
    const v = sum / samples + rng.range(-noise, noise);
    if (v > bv) { bv = v; best = hold; }
  }
  return best;
}
