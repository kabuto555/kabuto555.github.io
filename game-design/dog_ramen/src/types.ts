// ─── Tile Types ─────────────────────────────────────────────────────────────

export type TileType =
  | 'broth'    // impassable hot broth — cannot be stepped on
  | 'ramen'    // ramen square — must be stepped on, then sinks (cleared)
  | 'stone'    // solid stepping stone — permanent, does not disappear
  | 'start'    // pot handle start (outside grid)
  | 'end';     // pot handle end (outside grid)

export type TileState =
  | 'active'   // tile is present and interactive
  | 'sunk'     // ramen tile that has been stepped on (gone)
  | 'cleared'; // ramen tile successfully cleared (visual feedback then sunk)

export interface Tile {
  type: TileType;
  state: TileState;
  row: number;    // -1 = start handle, gridSize = end handle
  col: number;
  sprite?: Phaser.GameObjects.Container;
}

// ─── Level Definition ────────────────────────────────────────────────────────

export interface LevelConfig {
  levelNumber: number;
  gridSize: number;          // n x n play area
  ramenCount: number;        // how many ramen tiles to include
  stoneCount: number;        // immovable stepping-stone tiles
  brothCount: number;        // impassable broth holes
  solutionPath: Direction[]; // ordered list of moves to solve
}

export type Direction = 'up' | 'down' | 'left' | 'right';

// ─── Undo ────────────────────────────────────────────────────────────────────

export interface UndoEntry {
  playerRow: number;
  playerCol: number;
  ramenCleared: number;
  gridStates: string[][];
}

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  level: number;
  phase: 'title' | 'intro' | 'playing' | 'win' | 'fail';
  grid: Tile[][];
  playerRow: number;
  playerCol: number;
  ramenCleared: number;
  ramenTotal: number;
  solution: Direction[];
  showingHint: boolean;
  // Saved initial layout for retry (never mutated after level start)
  savedGrid: Tile[][];
  savedSolution: Direction[];
  // Undo stack
  undoStack: UndoEntry[];
}
