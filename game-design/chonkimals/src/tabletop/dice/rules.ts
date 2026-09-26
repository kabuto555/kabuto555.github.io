// Dice With Friends — the classic five-dice scoring game (Yahtzee rules). Each turn: roll up to
// three times, holding any dice between rolls, then score the dice in one empty category.
// Thirteen categories, so thirteen rounds each; the highest total wins.
//
//   Upper: Ones…Sixes score that face's total; 63+ across them earns a 35 bonus.
//   Lower: 3 / 4 of a Kind (all five dice), Full House 25, Small Straight (four in a row) 30,
//          Large Straight (five) 40, Yahtzee (five of a kind) 50, Chance (all five dice).
//   Every extra Yahtzee after a scored 50 is +100, and may be played as a joker: a full
//   Full House / Straight, if its face's upper box is already filled.

export type Category =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'three_kind' | 'four_kind' | 'full_house' | 'small_straight' | 'large_straight' | 'yahtzee' | 'chance';

export const UPPER: readonly Category[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER: readonly Category[] = ['three_kind', 'four_kind', 'full_house', 'small_straight', 'large_straight', 'yahtzee', 'chance'];
export const CATEGORIES: readonly Category[] = [...UPPER, ...LOWER];

export const LABEL: Record<Category, string> = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  three_kind: '3 of a Kind', four_kind: '4 of a Kind', full_house: 'Full House',
  small_straight: 'Sm Straight', large_straight: 'Lg Straight', yahtzee: 'Yahtzee', chance: 'Chance',
};

export const UPPER_BONUS_AT = 63, UPPER_BONUS = 35, YAHTZEE_BONUS = 100;
export const DICE = 5, ROLLS = 3;

export type Card = Partial<Record<Category, number>>;

const sum = (d: readonly number[]) => d.reduce((a, b) => a + b, 0);
const counts = (d: readonly number[]) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of d) c[v]++; return c; };
const run = (d: readonly number[]) => {
  const has = new Set(d);
  let best = 0, cur = 0;
  for (let v = 1; v <= 6; v++) { cur = has.has(v) ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
};

export const isYahtzee = (d: readonly number[]): boolean => d.every((v) => v === d[0]);

/** What `dice` would score in `cat` on `card` (joker rules included). */
export function scoreFor(cat: Category, dice: readonly number[], card: Card): number {
  const c = counts(dice), most = Math.max(...c);
  const up = UPPER.indexOf(cat);
  if (up >= 0) return c[up + 1] * (up + 1);
  // Joker: an extra Yahtzee (50 already scored) whose face's upper box is taken fills any lower box in full.
  const joker = isYahtzee(dice) && card.yahtzee === 50 && card[UPPER[dice[0] - 1]] !== undefined;
  switch (cat) {
    case 'three_kind': return most >= 3 ? sum(dice) : 0;
    case 'four_kind': return most >= 4 ? sum(dice) : 0;
    case 'full_house': return joker || (c.includes(3) && c.includes(2)) ? 25 : 0;
    case 'small_straight': return joker || run(dice) >= 4 ? 30 : 0;
    case 'large_straight': return joker || run(dice) >= 5 ? 40 : 0;
    case 'yahtzee': return most === 5 ? 50 : 0;
    case 'chance': return sum(dice);
  }
  return 0;
}

export function upperTotal(card: Card): number { return UPPER.reduce((s, k) => s + (card[k] ?? 0), 0); }
export function upperBonus(card: Card): number { return upperTotal(card) >= UPPER_BONUS_AT ? UPPER_BONUS : 0; }

/** Everything on the card, bonuses included. */
export function total(card: Card, yahtzeeBonus: number): number {
  return CATEGORIES.reduce((s, k) => s + (card[k] ?? 0), 0) + upperBonus(card) + yahtzeeBonus;
}

export const filled = (card: Card): number => CATEGORIES.filter((k) => card[k] !== undefined).length;
export const open = (card: Card): Category[] => CATEGORIES.filter((k) => card[k] === undefined);
