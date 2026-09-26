// ── Game state machine: spawn, merge, clear, stage ───────────────────────────
import { MERGE_CONFIG } from './merge-config';
import {
  type Piece, type GameState, type Direction, type ShapeId,
} from './game-types';
export type { GameState } from './game-types';
import {
  slideToEnd, findFreePosition, randomShape, freePercent, hasAnyMerge,
} from './board';

const { SPAWN_THRESHOLD_PERCENT, SPAWN_BATCH_SIZE, CLEAR_STACK_VALUE,
        COLORS_PER_STAGE_BASE, COLORS_PER_STAGE_MAX } = MERGE_CONFIG;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    phase: 'playing',
    stage: 1,
    score: 0,
    pieces: [],
    nextPieceId: 1,
    colorsInPlay: COLORS_PER_STAGE_BASE,
    clearedColors: [],
  };
}

function colorsForStage(stage: number): number {
  return Math.min(COLORS_PER_STAGE_BASE + stage - 1, COLORS_PER_STAGE_MAX);
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

let _rng = Math.random;
export function setRng(fn: () => number): void { _rng = fn; }

function makePiece(id: number, shapeId: ShapeId, colorIndex: number, col: number, row: number): Piece {
  return { id, shapeId, colorIndex, stackValue: 1, col, row };
}

/**
 * Return the lowest stackValue for a given colorIndex among all pieces,
 * or null if no piece of that color exists.
 */
function lowestStackForColor(colorIndex: number, pieces: Piece[]): number | null {
  let min: number | null = null;
  for (const p of pieces) {
    if (p.colorIndex === colorIndex) {
      min = min === null ? p.stackValue : Math.min(min, p.stackValue);
    }
  }
  return min;
}

export function spawnBatch(state: GameState): Piece[] {
  const spawned: Piece[] = [];
  const working = [...state.pieces];

  // Build the pool of colors still available for spawning this stage.
  const availableColors: number[] = [];
  for (let c = 0; c < state.colorsInPlay; c++) {
    if (!state.clearedColors.includes(c)) availableColors.push(c);
  }
  if (availableColors.length === 0) return spawned; // all colors cleared

  for (let i = 0; i < SPAWN_BATCH_SIZE; i++) {
    const shape = randomShape(state.colorsInPlay, _rng);
    const pos = findFreePosition(shape, working, _rng);
    if (!pos) break;

    const colorIndex = availableColors[Math.floor(_rng() * availableColors.length)];

    // Ensure the spawned piece can merge with an existing piece of the same color.
    // Use the lowest stack value of that color already on the board (including
    // pieces spawned earlier in this same batch). If no piece of that color
    // exists yet, stackValue 1 is fine.
    const existingMin = lowestStackForColor(colorIndex, working);
    const stackValue = existingMin !== null ? existingMin : 1;

    const piece: Piece = { id: state.nextPieceId + i, shapeId: shape, colorIndex, stackValue, col: pos.col, row: pos.row };
    spawned.push(piece);
    working.push(piece);
  }
  return spawned;
}

// ── Slide action ──────────────────────────────────────────────────────────────

export interface SlideAction {
  pieceId: number;
  dir: Direction;
}

export interface SlideOutcome {
  type: 'no-move' | 'slide' | 'merge' | 'clear';
  pieces: Piece[];
  cleared: Piece[];
  scoreDelta: number;
  movedPiece?: Piece;
  consumedPiece?: Piece;
  /** Set when type === 'clear': the color index that was just completed */
  clearedColorIndex?: number;
}

export function applySlide(state: GameState, action: SlideAction): SlideOutcome {
  const piece = state.pieces.find(p => p.id === action.pieceId);
  if (!piece) return { type: 'no-move', pieces: state.pieces, cleared: [], scoreDelta: 0 };

  const { finalCol, finalRow, merge } = slideToEnd(piece, action.dir, state.pieces);

  // No movement and no merge
  if (finalCol === piece.col && finalRow === piece.row && !merge) {
    return { type: 'no-move', pieces: state.pieces, cleared: [], scoreDelta: 0 };
  }

  let pieces = state.pieces.map(p => p.id === piece.id
    ? { ...p, col: finalCol, row: finalRow }
    : p
  );

  let scoreDelta = 0;
  let consumedPiece: Piece | undefined;
  let movedPiece: Piece | undefined;

  if (merge) {
    // Remove consumed piece, update surviving piece
    consumedPiece = state.pieces.find(p => p.id === merge.mergedFrom);
    pieces = pieces
      .filter(p => p.id !== merge.mergedFrom)
      .map(p => p.id === merge.mergedInto ? {
        ...p,
        stackValue: merge.newStackValue!,
        shapeId: merge.newShapeId!,
        col: merge.newCol!,
        row: merge.newRow!,
      } : p);

    scoreDelta = merge.newStackValue! * 10;
    movedPiece = pieces.find(p => p.id === merge.mergedInto);

    // Check if this color reached CLEAR_STACK_VALUE
    const mergedPiece = pieces.find(p => p.id === merge.mergedInto)!;
    if (mergedPiece.stackValue >= CLEAR_STACK_VALUE) {
      const colorToClear = mergedPiece.colorIndex;
      const cleared = pieces.filter(p => p.colorIndex === colorToClear);
      pieces = pieces.filter(p => p.colorIndex !== colorToClear);
      scoreDelta += cleared.length * 50;
      return { type: 'clear', pieces, cleared, scoreDelta, movedPiece, consumedPiece, clearedColorIndex: colorToClear };
    }

    return { type: 'merge', pieces, cleared: [], scoreDelta, movedPiece, consumedPiece };
  }

  movedPiece = pieces.find(p => p.id === piece.id);
  return { type: 'slide', pieces, cleared: [], scoreDelta: 1, movedPiece };
}

// ── Stage progression ─────────────────────────────────────────────────────────

export function checkStageClear(state: GameState): boolean {
  return state.pieces.length === 0;
}

export function advanceStage(state: GameState): GameState {
  const stage = state.stage + 1;
  const colorsInPlay = colorsForStage(stage);
  return {
    ...state,
    stage,
    colorsInPlay,
    clearedColors: [],
    phase: 'playing',
    pieces: [],
  };
}

// ── Spawn-check ───────────────────────────────────────────────────────────────

// ── Deadlock rescue ────────────────────────────────────────────────────────────

/** True when pieces exist but none has a valid merge move. */
export function isDeadlocked(state: GameState): boolean {
  if (state.pieces.length === 0) return false;
  return !hasAnyMerge(state.pieces);
}

/**
 * Force-spawn one piece that matches an existing piece's color+stack so a
 * merge is immediately possible. Uses a 1x1 (smallest footprint) to maximise
 * the chance of finding a free cell. Returns null if the board is full.
 */
export function spawnRescue(state: GameState): Piece | null {
  const availableColors: number[] = [];
  for (let c = 0; c < state.colorsInPlay; c++) {
    if (!state.clearedColors.includes(c)) availableColors.push(c);
  }
  if (availableColors.length === 0) return null;

  // Shuffle existing pieces so we don't always rescue the same color.
  const candidates = state.pieces
    .filter(p => availableColors.includes(p.colorIndex))
    .map(p => ({ colorIndex: p.colorIndex, stackValue: p.stackValue }))
    .sort(() => _rng() - 0.5);

  for (const { colorIndex, stackValue } of candidates) {
    const pos = findFreePosition('1x1', state.pieces, _rng);
    if (pos) {
      return { id: state.nextPieceId, shapeId: '1x1', colorIndex, stackValue, col: pos.col, row: pos.row };
    }
  }
  return null; // board completely full
}

export function needsSpawn(state: GameState): boolean {
  if (state.pieces.length === 0) return true;
  // Scale the spawn threshold down proportionally as colors are cleared.
  // With 3 colors total and 1 cleared (2 remaining), we only want to fill
  // 2/3 as much of the board, so the threshold drops to 2/3 of the base.
  const totalColors = state.colorsInPlay;
  const remaining = totalColors - state.clearedColors.length;
  if (remaining <= 0) return false; // all colors done, never spawn
  const effectiveThreshold = Math.min(100, SPAWN_THRESHOLD_PERCENT * (totalColors / remaining));
  return freePercent(state.pieces) >= effectiveThreshold;
}

// ── Color progress (for HUD) ──────────────────────────────────────────────────

export interface ColorProgress {
  colorIndex: number;
  maxStack: number;
  count: number;
}

export function getColorProgress(pieces: Piece[]): ColorProgress[] {
  const map = new Map<number, ColorProgress>();
  for (const p of pieces) {
    const existing = map.get(p.colorIndex);
    if (!existing) {
      map.set(p.colorIndex, { colorIndex: p.colorIndex, maxStack: p.stackValue, count: 1 });
    } else {
      existing.maxStack = Math.max(existing.maxStack, p.stackValue);
      existing.count++;
    }
  }
  return [...map.values()].sort((a, b) => a.colorIndex - b.colorIndex);
}
