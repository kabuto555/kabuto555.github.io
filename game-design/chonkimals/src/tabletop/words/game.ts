// One game of Words With Friends between two seats: the bag, both racks, the board, whose
// turn it is, and the end. The table (tabletop/words-table.ts) drives it — the human's
// moves from the HUD, the bots' from bot-ai.ts.
//
// Ends when the bag's empty and someone plays out their rack (they get their opponent's
// leftover tile values, which the opponent loses), or after four scoreless turns in a row
// (everyone loses what's left on their rack).

import type { Rng } from '../../rng';
import {
  Board, DISTRIBUTION, RACK_SIZE, evaluate, tileValue,
  type MoveResult, type Placement, type Tile,
} from './rules';

export type Seat = 0 | 1;

export interface WordsPlayer {
  name: string;
  rack: Tile[];
  score: number;
}

export type TurnRecord =
  | { seat: Seat; kind: 'play'; words: string[]; score: number; bingo: boolean; placements: Placement[] }
  | { seat: Seat; kind: 'swap'; count: number }
  | { seat: Seat; kind: 'pass' };

const SCORELESS_END = 4;

export class WordsGame {
  readonly board = new Board();
  readonly players: [WordsPlayer, WordsPlayer];
  readonly history: TurnRecord[] = [];
  private bag: Tile[] = [];
  turn: Seat;
  over = false;
  /** null while playing, or on a draw. */
  winner: Seat | null = null;
  private scoreless = 0;

  constructor(names: [string, string], private readonly rng: Rng) {
    let id = 0;
    for (const [letter, n] of Object.entries(DISTRIBUTION)) {
      for (let i = 0; i < n; i++) this.bag.push({ id: id++, letter });
    }
    this.shuffle(this.bag);
    this.players = [
      { name: names[0], rack: [], score: 0 },
      { name: names[1], rack: [], score: 0 },
    ];
    this.draw(0);
    this.draw(1);
    this.turn = rng.chance(0.5) ? 0 : 1;
  }

  get bagCount(): number { return this.bag.length; }
  get lastTurn(): TurnRecord | undefined { return this.history[this.history.length - 1]; }

  /** Plays tiles from the current player's rack. Nothing changes if it isn't legal. */
  play(placements: Placement[]): MoveResult {
    if (this.over) return { ok: false, error: 'The game is over' };
    const p = this.players[this.turn];
    if (!placements.every((pl) => p.rack.includes(pl.tile))) return { ok: false, error: 'Those tiles aren\'t yours' };
    const res = evaluate(this.board, placements);
    if (!res.ok) return res;
    for (const pl of placements) {
      this.board.set(pl.r, pl.c, { tile: pl.tile, face: pl.face });
      p.rack.splice(p.rack.indexOf(pl.tile), 1);
    }
    p.score += res.score;
    this.draw(this.turn);
    this.scoreless = 0;
    this.history.push({ seat: this.turn, kind: 'play', words: res.words.map((w) => w.word), score: res.score, bingo: res.bingo, placements });
    if (p.rack.length === 0 && this.bag.length === 0) this.finish(this.turn);
    else this.next();
    return res;
  }

  /** Swaps some rack tiles for fresh ones (needs that many left in the bag). */
  swap(tiles: Tile[]): boolean {
    const p = this.players[this.turn];
    if (this.over || tiles.length === 0 || tiles.length > this.bag.length || !tiles.every((t) => p.rack.includes(t))) return false;
    for (const t of tiles) p.rack.splice(p.rack.indexOf(t), 1);
    this.draw(this.turn);
    this.bag.push(...tiles);
    this.shuffle(this.bag);
    this.history.push({ seat: this.turn, kind: 'swap', count: tiles.length });
    this.scorelessTurn();
    return true;
  }

  pass(): void {
    if (this.over) return;
    this.history.push({ seat: this.turn, kind: 'pass' });
    this.scorelessTurn();
  }

  /** Someone left: the other seat wins. */
  forfeit(seat: Seat): void {
    if (this.over) return;
    this.over = true;
    this.winner = seat === 0 ? 1 : 0;
  }

  /** Called time on a long game: highest score wins as it stands. */
  endNow(): void {
    if (this.over) return;
    this.over = true;
    this.winner = this.leader();
  }

  private scorelessTurn(): void {
    if (++this.scoreless >= SCORELESS_END) {
      for (const p of this.players) p.score -= p.rack.reduce((s, t) => s + tileValue(t), 0);
      this.over = true;
      this.winner = this.leader();
    } else this.next();
  }

  private finish(out: Seat): void {
    const other = this.players[out === 0 ? 1 : 0];
    const left = other.rack.reduce((s, t) => s + tileValue(t), 0);
    this.players[out].score += left;
    other.score -= left;
    this.over = true;
    this.winner = this.leader();
  }

  private leader(): Seat | null {
    const [a, b] = this.players;
    return a.score === b.score ? null : a.score > b.score ? 0 : 1;
  }

  private next(): void { this.turn = this.turn === 0 ? 1 : 0; }

  private draw(seat: Seat): void {
    const rack = this.players[seat].rack;
    while (rack.length < RACK_SIZE && this.bag.length > 0) rack.push(this.bag.pop()!);
  }

  private shuffle<T>(a: T[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.range(0, i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
}
