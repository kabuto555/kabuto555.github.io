// Every tabletop game a toy can set up (tabletop.ts runs the tables): its name and badge, the
// toy sound it makes on the table, how to start a match, and what bots shout over it.

import type { TabletopGameId } from '../inventory/items';
import type { Rng } from '../rng';
import type { MatchHooks, TabletopMatch } from './match';
import { WordsMatch } from './words/words-match';
import { DiceMatch } from './dice/dice-match';

export interface TabletopGame {
  name: string;
  emoji: string;
  sound: 'tiles' | 'dice';
  create(size: number, rng: Rng, hooks: MatchHooks): TabletopMatch;
  /** Bots' lines after a good move / the best kind of move / no move (a pass, a zero). */
  big: readonly string[];
  huge: readonly string[];
  stuck: readonly string[];
}

export const GAMES: Record<TabletopGameId, TabletopGame> = {
  words: {
    name: 'Words With Friends', emoji: '📝', sound: 'tiles',
    create: (size, rng, hooks) => new WordsMatch(size, rng, hooks),
    big: ['TRIPLE WORD 😤', 'read it and weep 🤓', 'ez points', 'big brain move 🧠', 'BOOM 💥', 'calculated 😎'],
    huge: ['BINGO!!! 🎉', 'ALL SEVEN TILES 😱', 'did you SEE that 🤯'],
    stuck: ['all vowels 😭', 'my rack is cursed', 'pass 😔', 'these letters 💀'],
  },
  dice: {
    name: 'Dice With Friends', emoji: '🎲', sound: 'dice',
    create: (size, rng, hooks) => new DiceMatch(size, rng, hooks),
    big: ['ez points', 'read em and weep 🎲', 'calculated 😎', 'the dice LOVE me', 'BOOM 💥'],
    huge: ['YAHTZEE!!! 🎲🎉', 'FIVE OF A KIND 😱', 'did you SEE that 🤯'],
    stuck: ['a big fat zero 💀', 'the dice hate me 😭', 'scratch 😔', 'rigged 🙄'],
  },
};

export const GAME_IDS = Object.keys(GAMES) as TabletopGameId[];
