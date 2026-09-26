// One game of Dice With Friends between two seats: whose turn, the five dice (and which are
// held), the rolls left, and both scorecards. The match (dice-match.ts) drives it — the
// human's taps from the HUD, the bots' choices from bot-ai.ts.

import type { Rng } from '../../rng';
import type { Seat } from '../match';
import { CATEGORIES, DICE, ROLLS, YAHTZEE_BONUS, filled, isYahtzee, scoreFor, total, type Card, type Category } from './rules';

export interface DicePlayer {
  name: string;
  card: Card;
  /** +100 per extra Yahtzee. */
  bonus: number;
  readonly score: number;
}

export type DiceTurn = { seat: Seat; cat: Category; score: number; yahtzeeBonus: boolean };

export class DiceGame {
  readonly players: [DicePlayer, DicePlayer];
  readonly history: DiceTurn[] = [];
  /** Face values (1–6); meaningless until the turn's first roll. */
  readonly dice: number[] = new Array(DICE).fill(1);
  readonly held: boolean[] = new Array(DICE).fill(false);
  rollsLeft = ROLLS;
  turn: Seat;
  over = false;
  winner: Seat | null = null;

  constructor(names: [string, string], private readonly rng: Rng) {
    const player = (name: string): DicePlayer => ({
      name, card: {}, bonus: 0,
      get score() { return total(this.card, this.bonus); },
    });
    this.players = [player(names[0]), player(names[1])];
    this.turn = rng.chance(0.5) ? 0 : 1;
  }

  /** Rolled at least once this turn (so it can be scored / dice held). */
  get rolled(): boolean { return this.rollsLeft < ROLLS; }
  /** Round 1–13 (the one being played). */
  get round(): number { return Math.min(CATEGORIES.length, filled(this.players[this.turn].card) + 1); }

  /** Rolls every die that isn't held. Returns which dice rolled, or null if no rolls are left. */
  roll(): boolean[] | null {
    if (this.over || this.rollsLeft <= 0) return null;
    if (!this.rolled) this.held.fill(false);
    const rolled = this.held.map((h) => !h);
    rolled.forEach((r, i) => { if (r) this.dice[i] = 1 + Math.floor(this.rng.range(0, 6)); });
    this.rollsLeft--;
    return rolled;
  }

  setHeld(i: number, on: boolean): void {
    if (this.over || !this.rolled || this.rollsLeft <= 0) return;
    this.held[i] = on;
  }

  /** What the current dice would score in `cat` for whoever's turn it is (null = box used). */
  potential(cat: Category): number | null {
    const card = this.players[this.turn].card;
    return card[cat] !== undefined ? null : scoreFor(cat, this.dice, card);
  }

  /** Scores the dice in `cat` and passes the turn. False if it can't (not rolled / box used). */
  score(cat: Category): boolean {
    const p = this.players[this.turn];
    if (this.over || !this.rolled || p.card[cat] !== undefined) return false;
    const bonus = isYahtzee(this.dice) && p.card.yahtzee === 50;
    if (bonus) p.bonus += YAHTZEE_BONUS;
    const s = scoreFor(cat, this.dice, p.card);
    p.card[cat] = s;
    this.history.push({ seat: this.turn, cat, score: s, yahtzeeBonus: bonus });
    this.rollsLeft = ROLLS;
    this.held.fill(false);
    if (this.players.every((q) => filled(q.card) === CATEGORIES.length)) this.finish();
    else this.turn = this.turn === 0 ? 1 : 0;
    return true;
  }

  get lastTurn(): DiceTurn | undefined { return this.history[this.history.length - 1]; }

  /** Someone left: the other seat wins. */
  forfeit(seat: Seat): void {
    if (this.over) return;
    this.over = true;
    this.winner = seat === 0 ? 1 : 0;
  }

  /** Called time: highest score wins as it stands. */
  endNow(): void { if (!this.over) this.finish(); }

  private finish(): void {
    this.over = true;
    const [a, b] = this.players;
    this.winner = a.score === b.score ? null : a.score > b.score ? 0 : 1;
  }
}
