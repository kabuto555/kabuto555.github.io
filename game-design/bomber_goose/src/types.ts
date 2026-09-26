// ─── Block & Grid Types ──────────────────────────────────────────────────────

export type BlockColor = number; // index into BLOCK_COLORS array — dynamic

export type BlockType = 'normal' | 'empty' | 'poop';

// ─── Poop Types ──────────────────────────────────────────────────────────────
// Modular: add new entries here and implement handling in main.ts

export type PoopKind = 'detonator';
// Future kinds: 'bomb' | 'rainbow' | 'row_clear' | etc.

export interface PoopDef {
  kind: PoopKind;
  color: BlockColor;      // which color index this poop targets (detonator)
}

// ─── Grid Cell ───────────────────────────────────────────────────────────────

export interface Cell {
  type: BlockType;
  colorIndex: BlockColor; // index into BLOCK_COLORS; -1 if empty
  sprite: Phaser.GameObjects.Container | null;
}

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  grid: Cell[][];              // [row][col], row 0 = top
  score: number;
  level: number;               // index into LEVEL_CONFIG
  gooseCol: number;            // which column the goose is over
  pendingPoop: PoopDef | null;
  animating: boolean;
  gameOver: boolean;
  constructionPending: boolean; // true if a push fired while animating — drain in finishTurn
  queuedCol: number | null;    // column tapped while animating — drain in finishTurn
  queuedAt: number;            // performance.now() timestamp of the queued tap
}
