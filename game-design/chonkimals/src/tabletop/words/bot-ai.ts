// Bots playing Words With Friends: every legal play they can make from their rack (words
// from the listed dictionary, 2–8 letters), then a pick that fits the bot — sharp bots take
// the top score, sloppy ones something from further down the list.
//
// The search is a generator the table steps a few milliseconds per frame (a full search
// can touch a few hundred thousand candidate spots), so thinking never stutters the camp.
//
//   1. Words the rack + board could possibly spell (letter counts, blanks as wildcards).
//   2. For every row and column, every segment that could hold a new word: bounded by
//      empty squares, has room for the rack, and touches the tiles already down (the first
//      play covers the ★). Each empty square carries a mask of letters whose cross word
//      (the one it'd make the other way) is a real word.
//   3. Words of that length matching the segment's fixed letters + masks + the rack.

import { botWords, isWord } from './dictionary';
import {
  CENTER, RACK_SIZE, SIZE, evaluate,
  type Board, type Placement, type Tile,
} from './rules';

export interface BotMove {
  placements: Placement[];
  score: number;
  words: string[];
  usesBlank: boolean;
}

const MAX_LEN = 8;
const A = 65;
const ALL = (1 << 26) - 1;
/** Word checks between yields. */
const CHUNK = 1500;

const code = (ch: string) => ch.charCodeAt(0) - A;

/**
 * Finds the rack's plays; `yield`s now and then so the caller can spread the work over
 * frames. Returns them best-first (at most `keep`).
 */
export function* searchMoves(board: Board, rack: readonly Tile[], keep = 60): Generator<void, BotMove[]> {
  const rackCount = new Array<number>(26).fill(0);
  let blanks = 0;
  for (const t of rack) { if (t.letter === '?') blanks++; else rackCount[code(t.letter)]++; }
  const boardCount = new Array<number>(26).fill(0);
  for (const p of board.cells) if (p) boardCount[code(p.face)]++;

  // 1. What the letters on hand (and on the board) could possibly spell, by length.
  const pool: string[][] = [];
  const counts = new Array<number>(26);
  let work = 0;
  for (let len = 2; len <= MAX_LEN; len++) {
    const list: string[] = [];
    for (const w of botWords(len)) {
      counts.fill(0);
      let short = 0;
      for (let i = 0; i < w.length; i++) {
        const k = w.charCodeAt(i) - 97;
        if (k < 0 || k > 25) { short = 99; break; }
        if (++counts[k] > rackCount[k] + boardCount[k]) short++;
      }
      if (short <= blanks) list.push(w.toUpperCase());
      if (++work % (CHUNK * 8) === 0) yield;
    }
    pool[len] = list;
  }

  // Cross-check masks: which letters may go in an empty square, per direction of the main word.
  const faceAt = (r: number, c: number) => board.get(r, c)?.face ?? null;
  const masks = [new Map<number, number>(), new Map<number, number>()];
  const maskAt = (r: number, c: number, horiz: boolean): number => {
    const m = masks[horiz ? 0 : 1];
    const key = r * SIZE + c;
    const hit = m.get(key);
    if (hit !== undefined) return hit;
    // The cross word runs the other way.
    const dr = horiz ? 1 : 0, dc = horiz ? 0 : 1;
    let before = '', after = '';
    for (let rr = r - dr, cc = c - dc; faceAt(rr, cc); rr -= dr, cc -= dc) before = faceAt(rr, cc)! + before;
    for (let rr = r + dr, cc = c + dc; faceAt(rr, cc); rr += dr, cc += dc) after += faceAt(rr, cc)!;
    let mask = ALL;
    if (before || after) {
      mask = 0;
      for (let k = 0; k < 26; k++) if (isWord(before + String.fromCharCode(A + k) + after, true)) mask |= 1 << k;
    }
    m.set(key, mask);
    return mask;
  };
  const hasNeighbour = (r: number, c: number) =>
    !!(faceAt(r - 1, c) || faceAt(r + 1, c) || faceAt(r, c - 1) || faceAt(r, c + 1));

  // 2–3. Every segment of every line.
  const found: BotMove[] = [];
  const seen = new Set<string>();
  const need = new Array<number>(26);
  const fixed: (string | null)[] = [];
  const allow: number[] = [];
  for (const horiz of [true, false]) {
    for (let line = 0; line < SIZE; line++) {
      const cell = (i: number): [number, number] => (horiz ? [line, i] : [i, line]);
      for (let s = 0; s < SIZE; s++) {
        const [pr, pc] = cell(s - 1);
        if (s > 0 && faceAt(pr, pc)) continue; // a word can't start right after a tile
        for (let len = 2; len <= MAX_LEN && s + len <= SIZE; len++) {
          const [nr, nc] = cell(s + len);
          if (s + len < SIZE && faceAt(nr, nc)) continue; // …or end right before one
          let empties = 0, touches = false, dead = false;
          for (let i = 0; i < len; i++) {
            const [r, c] = cell(s + i);
            const f = faceAt(r, c);
            fixed[i] = f;
            if (f) { touches = true; allow[i] = 0; continue; }
            empties++;
            if (board.empty ? r === CENTER && c === CENTER : hasNeighbour(r, c)) touches = true;
            allow[i] = maskAt(r, c, horiz);
            if (allow[i] === 0) { dead = true; break; }
          }
          if (dead || !touches || empties === 0 || empties > rack.length) continue;
          for (const w of pool[len]) {
            if (++work % CHUNK === 0) yield;
            let ok = true, wild = 0;
            for (let k = 0; k < 26; k++) need[k] = 0;
            for (let i = 0; i < len && ok; i++) {
              const ch = w[i];
              if (fixed[i]) { ok = fixed[i] === ch; continue; }
              const k = code(ch);
              if (!(allow[i] & (1 << k))) { ok = false; continue; }
              if (++need[k] > rackCount[k]) ok = ++wild <= blanks;
            }
            if (!ok) continue;
            const key = `${horiz ? 'h' : 'v'}${line}:${s}:${w}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const move = build(board, rack, w, s, cell);
            if (move) found.push(move);
          }
        }
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, keep);
}

/** Lays word `w` along a segment from `s`, taking tiles off the rack (blanks for what's missing). */
function build(board: Board, rack: readonly Tile[], w: string, s: number, cell: (i: number) => [number, number]): BotMove | null {
  const left = [...rack];
  const placements: Placement[] = [];
  const empties: [number, number, string][] = [];
  for (let i = 0; i < w.length; i++) {
    const [r, c] = cell(s + i);
    if (!board.get(r, c)) empties.push([r, c, w[i]]);
  }
  // Real letters first, so blanks only fill what's really missing.
  const missing: [number, number, string][] = [];
  for (const e of empties) {
    const j = left.findIndex((t) => t.letter === e[2]);
    if (j < 0) { missing.push(e); continue; }
    placements.push({ r: e[0], c: e[1], tile: left[j], face: e[2] });
    left.splice(j, 1);
  }
  for (const e of missing) {
    const j = left.findIndex((t) => t.letter === '?');
    if (j < 0) return null;
    placements.push({ r: e[0], c: e[1], tile: left[j], face: e[2] });
    left.splice(j, 1);
  }
  const res = evaluate(board, placements, false);
  if (!res.ok) return null;
  return { placements, score: res.score, words: res.words.map((x) => x.word), usesBlank: missing.length > 0 };
}

/**
 * Picks a play for a bot of `skill` (0..1): the best at 1, drifting further down the list
 * (and wasting blanks on small plays less carefully) as it drops. `roll` is 0..1.
 */
export function chooseMove(moves: readonly BotMove[], skill: number, roll: number): BotMove | null {
  if (moves.length === 0) return null;
  const ranked = [...moves].sort((a, b) => worth(b, skill) - worth(a, skill));
  const spread = Math.max(1, Math.round((1 - skill) * Math.min(ranked.length, 24)));
  return ranked[Math.min(ranked.length - 1, Math.floor(roll * roll * spread))];
}

const worth = (m: BotMove, skill: number) =>
  m.score - (m.usesBlank && m.placements.length < RACK_SIZE ? 10 * skill : 0);

/** Tiles worth swapping when there's no play: clunky high-value letters and duplicates first. */
export function swapPick(rack: readonly Tile[]): Tile[] {
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const t of rack) {
    if (t.letter === '?') continue;
    if ('QZXJKV'.includes(t.letter) || seen.has(t.letter)) out.push(t);
    seen.add(t.letter);
  }
  return out.length ? out : rack.filter((t) => t.letter !== '?').slice(0, 4);
}
