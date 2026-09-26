// ── Board logic: occupancy, movement, merge rules ─────────────────────────────
import { MERGE_CONFIG } from './merge-config';
import { SHAPES, SHAPES_BY_SIZE, type Piece, type Direction, type ShapeId, type TileOffset } from './game-types';

const { BOARD_COLS, BOARD_ROWS } = MERGE_CONFIG;

// ── Occupancy grid ────────────────────────────────────────────────────────────

/** Returns a set of "col,row" strings for all tiles occupied by a piece */
export function pieceTileKeys(p: Piece): string[] {
  return SHAPES[p.shapeId].tiles.map(t => `${p.col + t.dc},${p.row + t.dr}`);
}

/** Build a map of "col,row" → piece id for all pieces */
export function buildOccupancy(pieces: Piece[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of pieces) {
    for (const key of pieceTileKeys(p)) map.set(key, p.id);
  }
  return map;
}

/** Count free cells */
export function countFreeCells(pieces: Piece[]): number {
  const occ = buildOccupancy(pieces);
  return BOARD_COLS * BOARD_ROWS - occ.size;
}

/** Free-space percentage 0–100 */
export function freePercent(pieces: Piece[]): number {
  return (countFreeCells(pieces) / (BOARD_COLS * BOARD_ROWS)) * 100;
}

// ── Shape-merge rules ─────────────────────────────────────────────────────────

/** All known shapes as lookup sets of "dc,dr" strings relative to their anchor */
const SHAPE_CELL_SETS: Array<{ id: ShapeId; cells: Set<string> }> =
  (Object.values(SHAPES) as import('./game-types').ShapeDef[]).map(s => ({
    id: s.id,
    cells: new Set(s.tiles.map(t => `${t.dc},${t.dr}`)),
  }));

/**
 * Given two pieces about to merge (stationary = `into`, moving = `from`),
 * compute the resulting shapeId and new anchor (col, row).
 *
 * Algorithm:
 *  1. Collect the union of absolute board cells from both pieces (deduped).
 *  2. Find the bounding-box top-left (minCol, minRow) as the new anchor.
 *  3. Express cells relative to that anchor and match to a known ShapeId.
 *
 * This correctly handles:
 *  - 1x1 + 1x1 (same cell) → still 1x1 (union = 1 cell)
 *  - 1x2h + 1x2h (same cells) → still 1x2h
 *  - 1x2h + 1x2v (one shared cell) → L shape determined by which cell is shared
 *  - L + L → 2x2
 */
export function computeMerge(
  into: Piece,
  from: Piece,
): { shapeId: ShapeId; col: number; row: number } | null {
  // Absolute cells
  const intoCells = SHAPES[into.shapeId].tiles.map(t => ({ c: into.col + t.dc, r: into.row + t.dr }));
  const fromCells  = SHAPES[from.shapeId].tiles.map(t => ({ c: from.col  + t.dc, r: from.row  + t.dr }));

  // Union (dedup)
  const seen = new Set<string>();
  const union: Array<{ c: number; r: number }> = [];
  for (const cell of [...intoCells, ...fromCells]) {
    const k = `${cell.c},${cell.r}`;
    if (!seen.has(k)) { seen.add(k); union.push(cell); }
  }

  // New anchor = top-left of bounding box
  const minC = Math.min(...union.map(u => u.c));
  const minR = Math.min(...union.map(u => u.r));

  // Relative cell set
  const relSet = new Set(union.map(u => `${u.c - minC},${u.r - minR}`));

  // Match to known ShapeId
  for (const s of SHAPE_CELL_SETS) {
    if (s.cells.size !== relSet.size) continue;
    let match = true;
    for (const k of s.cells) { if (!relSet.has(k)) { match = false; break; } }
    if (match) return { shapeId: s.id, col: minC, row: minR };
  }

  // No known shape matched — return null so callers can detect the fallback.
  return null;
}

// ── Movement / slide ──────────────────────────────────────────────────────────

/** Delta col/row for each direction */
const DIR_DELTA: Record<Direction, TileOffset> = {
  left:  { dc: -1, dr:  0 },
  right: { dc:  1, dr:  0 },
  up:    { dc:  0, dr: -1 },
  down:  { dc:  0, dr:  1 },
};

/** Check if a piece at (col+dc, row+dr) would be in bounds */
function inBounds(p: Piece, dc: number, dr: number): boolean {
  const shape = SHAPES[p.shapeId];
  for (const t of shape.tiles) {
    const c = p.col + t.dc + dc;
    const r = p.row + t.dr + dr;
    if (c < 0 || c >= BOARD_COLS || r < 0 || r >= BOARD_ROWS) return false;
  }
  return true;
}

export interface SlideResult {
  moved: boolean;
  mergedInto?: number;   // id of piece that was merged into
  mergedFrom?: number;   // id of piece that was consumed
  newStackValue?: number;
  newShapeId?: ShapeId;
  newCol?: number;
  newRow?: number;
}

/**
 * Try to slide `piece` one step in `dir`.
 * Returns what happened. Does NOT mutate the pieces array — caller does that.
 */
export function trySlideOne(
  piece: Piece,
  dir: Direction,
  allPieces: Piece[],
): SlideResult {
  const { dc, dr } = DIR_DELTA[dir];

  // Can we even move one step?
  if (!inBounds(piece, dc, dr)) return { moved: false };

  // Build occupancy excluding the moving piece
  const others = allPieces.filter(p => p.id !== piece.id);
  const occ = buildOccupancy(others);

  // Check what's in the target cells
  const targetKeys = SHAPES[piece.shapeId].tiles.map(t =>
    `${piece.col + t.dc + dc},${piece.row + t.dr + dr}`
  );
  const hitIds = new Set<number>();
  for (const key of targetKeys) {
    const id = occ.get(key);
    if (id !== undefined) hitIds.add(id);
  }

  // Blocked by wall already handled above; blocked by piece(s)?
  if (hitIds.size > 1) return { moved: false }; // multiple pieces in the way

  if (hitIds.size === 0) {
    // Free move
    return { moved: true, newCol: piece.col + dc, newRow: piece.row + dr };
  }

  // Exactly one piece in the way
  const otherId = [...hitIds][0];
  const other = others.find(p => p.id === otherId)!;

  // Can merge? Must be same color AND same stack value
  if (other.colorIndex !== piece.colorIndex || other.stackValue !== piece.stackValue) {
    return { moved: false };
  }

  // For different-size merges, slide the moving piece forward until the union
  // of its cells with `other` forms a valid known shape, or until it can't
  // move further. For same-size merges the first step is always the answer.
  const otherCellSet = new Set(SHAPES[other.shapeId].tiles.map(
    t => `${other.col + t.dc},${other.row + t.dr}`
  ));
  const thirdPartyOcc = buildOccupancy(others.filter(p => p.id !== other.id));
  const movingSize  = SHAPES[piece.shapeId].tiles.length;
  const stationarySize = SHAPES[other.shapeId].tiles.length;

  // Try positions starting from one step forward, pushing deeper until the
  // union matches a known shape or the next step is invalid.
  let bestMerge: { shapeId: ShapeId; col: number; row: number } | null = null;

  let mCol = piece.col + dc;
  let mRow = piece.row + dr;

  for (let step = 0; step <= Math.max(BOARD_COLS, BOARD_ROWS); step++) {
    // computeMerge returns null when the union doesn't match any known shape.
    const candidate: Piece = { ...piece, col: mCol, row: mRow };
    const merged = computeMerge(other, candidate);

    if (merged !== null) {
      bestMerge = merged;
      // Stop at the first position that produces a valid shape.
      break;
    }

    // Try to push one more step forward.
    const nextCol = mCol + dc;
    const nextRow = mRow + dr;
    const nextTiles = SHAPES[piece.shapeId].tiles.map(
      t => ({ c: nextCol + t.dc, r: nextRow + t.dr })
    );
    const canPush = nextTiles.every(({ c, r }) => {
      if (c < 0 || c >= BOARD_COLS || r < 0 || r >= BOARD_ROWS) return false;
      const k = `${c},${r}`;
      // A tile can advance if it's going into `other`'s space or is unoccupied.
      return otherCellSet.has(k) || !thirdPartyOcc.has(k);
    });
    // Also stop if moving forward would take us completely past `other`
    // (no tiles of the moving piece overlap `other` any more).
    const nextOverlap = nextTiles.filter(({ c, r }) => otherCellSet.has(`${c},${r}`)).length;
    if (!canPush || nextOverlap === 0) break;
    mCol = nextCol;
    mRow = nextRow;
  }

  if (!bestMerge) {
    // No position produced a valid union shape — block the move.
    return { moved: false };
  }

  const newStack = piece.stackValue + 1;
  return {
    moved: true,
    mergedInto: other.id,
    mergedFrom: piece.id,
    newStackValue: newStack,
    newShapeId: bestMerge.shapeId,
    newCol: bestMerge.col,
    newRow: bestMerge.row,
  };
}

/**
 * Slide `piece` as far as it can go in `dir`, stopping before collision or merging.
 * Returns the full sequence of steps as SlideResult (only last step matters for merge).
 */
export function slideToEnd(
  piece: Piece,
  dir: Direction,
  allPieces: Piece[],
): { finalCol: number; finalRow: number; merge: SlideResult | null } {
  const { dc, dr } = DIR_DELTA[dir];
  let col = piece.col;
  let row = piece.row;
  let lastMerge: SlideResult | null = null;

  // Slide one step at a time
  for (let step = 0; step < Math.max(BOARD_COLS, BOARD_ROWS); step++) {
    const moved = { ...piece, col, row };
    const result = trySlideOne(moved, dir, allPieces);

    if (!result.moved) break;

    if (result.mergedInto !== undefined) {
      lastMerge = result;
      break;
    }

    col = result.newCol!;
    row = result.newRow!;
  }

  return { finalCol: col, finalRow: row, merge: lastMerge };
}

// ── Deadlock detection ───────────────────────────────────────────────────────

const ALL_DIRS: Direction[] = ['left', 'right', 'up', 'down'];

/**
 * Returns true if any piece on the board has at least one valid merge move.
 * Used to detect deadlock before deciding whether to force-spawn.
 */
export function hasAnyMerge(pieces: Piece[]): boolean {
  for (const piece of pieces) {
    for (const dir of ALL_DIRS) {
      const result = trySlideOne(piece, dir, pieces);
      if (result.moved && result.mergedInto !== undefined) return true;
    }
  }
  return false;
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

/** Pick a random free anchor position for a given shape */
export function findFreePosition(
  shape: ShapeId,
  pieces: Piece[],
  rng: () => number,
): { col: number; row: number } | null {
  const occ = buildOccupancy(pieces);
  const shapeDef = SHAPES[shape];
  const candidates: Array<{ col: number; row: number }> = [];

  for (let r = 0; r <= BOARD_ROWS - shapeDef.rows; r++) {
    for (let c = 0; c <= BOARD_COLS - shapeDef.cols; c++) {
      const fits = shapeDef.tiles.every(t => !occ.has(`${c + t.dc},${r + t.dr}`));
      if (fits) candidates.push({ col: c, row: r });
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Pick a random shape weighted toward smaller pieces */
export function randomShape(colorsInPlay: number, rng: () => number): ShapeId {
  // Stage 1 → mostly 1x1; later stages allow bigger pieces
  const maxSize = Math.min(4, 1 + Math.floor(colorsInPlay / 2));
  const sizes: number[] = [];
  for (let s = 1; s <= maxSize; s++) sizes.push(s);

  // Weight: smaller pieces are more common
  const weights = sizes.map(s => Math.pow(0.55, s - 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = rng() * total;
  let chosenSize = 1;
  for (let i = 0; i < sizes.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { chosenSize = sizes[i]; break; }
  }

  const pool = SHAPES_BY_SIZE[chosenSize];
  return pool[Math.floor(rng() * pool.length)];
}
