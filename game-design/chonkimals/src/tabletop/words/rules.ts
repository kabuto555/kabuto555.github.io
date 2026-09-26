// Words With Friends — the rules, on a smaller 11×11 board (the full game is 15×15).
// Letter values, the 35-point bingo and the scoring are Words With Friends'; the tile bag
// is scaled down to suit the board (62 tiles, one blank) and the bonus squares are laid
// out fresh with the same 8-way symmetry. The centre star has no bonus.
//
// `evaluate` checks a move (tiles in one line, joined up, touching what's there, every
// word it makes a real word) and scores it — the human's plays and the bots' search both
// go through it.

import { isWord } from './dictionary';

export const SIZE = 11;
export const CENTER = 5;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 35;

export const LETTER_VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 4, C: 4, D: 2, E: 1, F: 4, G: 3, H: 3, I: 1, J: 10, K: 5, L: 2, M: 4,
  N: 2, O: 1, P: 4, Q: 10, R: 1, S: 1, T: 1, U: 2, V: 5, W: 4, X: 8, Y: 3, Z: 10, '?': 0,
};

/** Tiles in the bag at the start ('?' = blank). */
export const DISTRIBUTION: Readonly<Record<string, number>> = {
  A: 5, B: 1, C: 2, D: 3, E: 8, F: 1, G: 2, H: 2, I: 5, J: 1, K: 1, L: 3, M: 2,
  N: 3, O: 5, P: 2, Q: 1, R: 4, S: 3, T: 4, U: 2, V: 1, W: 1, X: 1, Y: 1, Z: 1, '?': 1,
};

export type Premium = 'TW' | 'DW' | 'TL' | 'DL';

/** One quadrant's bonus squares (row, col from the corner); mirrored 8 ways. */
const QUADRANT: [number, number, Premium][] = [
  [0, 2, 'TW'],
  [1, 1, 'DW'], [3, 3, 'DW'],
  [0, 0, 'TL'], [3, 5, 'TL'],
  [0, 5, 'DL'], [1, 4, 'DL'], [2, 2, 'DL'], [4, 4, 'DL'],
];

const PREMIUMS: (Premium | null)[] = new Array(SIZE * SIZE).fill(null);
for (const [r0, c0, p] of QUADRANT) {
  for (const [r, c] of [[r0, c0], [c0, r0]]) {
    for (const rr of [r, SIZE - 1 - r]) for (const cc of [c, SIZE - 1 - c]) PREMIUMS[rr * SIZE + cc] = p;
  }
}

export const premiumAt = (r: number, c: number): Premium | null => PREMIUMS[r * SIZE + c];
export const inBounds = (r: number, c: number): boolean => r >= 0 && c >= 0 && r < SIZE && c < SIZE;

export interface Tile {
  id: number;
  /** 'A'–'Z', or '?' for a blank. */
  letter: string;
}

/** A tile on the board: `face` is the letter it reads as (a blank's chosen letter). */
export interface Placed { tile: Tile; face: string; }

export interface Placement { r: number; c: number; tile: Tile; face: string; }

export const tileValue = (t: Tile): number => LETTER_VALUES[t.letter] ?? 0;

export class Board {
  readonly cells: (Placed | null)[] = new Array(SIZE * SIZE).fill(null);
  count = 0;

  get(r: number, c: number): Placed | null {
    return inBounds(r, c) ? this.cells[r * SIZE + c] : null;
  }

  set(r: number, c: number, p: Placed): void {
    if (!this.cells[r * SIZE + c]) this.count++;
    this.cells[r * SIZE + c] = p;
  }

  get empty(): boolean { return this.count === 0; }
}

export interface WordScore { word: string; score: number; }

export type MoveResult =
  | { ok: true; score: number; words: WordScore[]; bingo: boolean }
  | { ok: false; error: string };

const fail = (error: string): MoveResult => ({ ok: false, error });

/**
 * Checks and scores a move. `checkWords` false skips the dictionary (the bots' search has
 * already matched the main word, and checks crosses itself).
 */
export function evaluate(board: Board, placements: readonly Placement[], checkWords = true): MoveResult {
  const n = placements.length;
  if (n === 0) return fail('Place some tiles first');
  const at = new Map<number, Placement>();
  for (const p of placements) {
    if (!inBounds(p.r, p.c) || board.get(p.r, p.c)) return fail('That square is taken');
    at.set(p.r * SIZE + p.c, p);
  }
  if (at.size !== n) return fail('That square is taken');
  const sameRow = placements.every((p) => p.r === placements[0].r);
  const sameCol = placements.every((p) => p.c === placements[0].c);
  if (!sameRow && !sameCol) return fail('Tiles must be in one line');

  const face = (r: number, c: number): string | null => at.get(r * SIZE + c)?.face ?? board.get(r, c)?.face ?? null;
  const filled = (r: number, c: number) => inBounds(r, c) && face(r, c) !== null;

  // Main direction: along the line; a lone tile takes whichever way makes a word.
  let dr = sameRow ? 0 : 1, dc = sameRow ? 1 : 0;
  if (n === 1) {
    const { r, c } = placements[0];
    const horiz = filled(r, c - 1) || filled(r, c + 1);
    const vert = filled(r - 1, c) || filled(r + 1, c);
    if (!horiz && vert) { dr = 1; dc = 0; } else { dr = 0; dc = 1; }
  }
  // Joined up: no gaps between the first and last new tile.
  const along = (p: Placement) => (dr ? p.r : p.c);
  const lo = Math.min(...placements.map(along)), hi = Math.max(...placements.map(along));
  const { r: r0, c: c0 } = placements[0];
  for (let i = lo; i <= hi; i++) {
    const r = dr ? i : r0, c = dr ? c0 : i;
    if (!filled(r, c)) return fail('Tiles must be joined up');
  }

  if (board.empty) {
    if (!at.has(CENTER * SIZE + CENTER)) return fail('The first word must cover the ★');
    if (n < 2) return fail('Words need at least 2 letters');
  } else {
    const touches = placements.some((p) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !!board.get(p.r + a, p.c + b)));
    if (!touches) return fail('Build off the tiles already on the board');
  }

  const words: WordScore[] = [];
  const read = (r: number, c: number, wr: number, wc: number): WordScore | null => {
    while (filled(r - wr, c - wc)) { r -= wr; c -= wc; }
    let word = '', sum = 0, mult = 1;
    for (; filled(r, c); r += wr, c += wc) {
      const p = at.get(r * SIZE + c);
      const tile = p?.tile ?? board.get(r, c)!.tile;
      let v = tileValue(tile);
      if (p) {
        const pr = premiumAt(r, c);
        if (pr === 'DL') v *= 2; else if (pr === 'TL') v *= 3;
        else if (pr === 'DW') mult *= 2; else if (pr === 'TW') mult *= 3;
      }
      word += face(r, c);
      sum += v;
    }
    return word.length > 1 ? { word, score: sum * mult } : null;
  };

  const main = read(placements[0].r, placements[0].c, dr, dc);
  if (!main) return fail('Words need at least 2 letters');
  words.push(main);
  for (const p of placements) {
    const cross = read(p.r, p.c, dc, dr);
    if (cross) words.push(cross);
  }
  if (checkWords) {
    const bad = words.find((w) => !isWord(w.word));
    if (bad) return fail(`${bad.word} isn't a word`);
  }
  const bingo = n === RACK_SIZE;
  const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0);
  return { ok: true, score, words, bingo };
}
