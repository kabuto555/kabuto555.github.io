// ── Merge Mayhem — all tunable game parameters ───────────────────────────────

export const MERGE_CONFIG = {
  // Board dimensions in tiles
  BOARD_COLS: 6,
  BOARD_ROWS: 8,

  // How many distinct piece colors appear on this stage (increases per stage)
  COLORS_PER_STAGE_BASE: 3,      // stage 1 starts with this many colors
  COLORS_PER_STAGE_MAX: 6,       // never more than this many colors

  // Stack value at which all pieces of that color are cleared from the board
  CLEAR_STACK_VALUE: 5,

  // When free-cell percentage drops below this, spawn new pieces
  SPAWN_THRESHOLD_PERCENT: 40,   // 40% free → spawn batch

  // How many pieces to spawn per batch
  SPAWN_BATCH_SIZE: 3,

  // 3D visual constants
  TILE_SIZE: 1.0,          // world units per tile
  TILE_GAP: 0.10,          // gap between pieces on the board
  TILE_HEIGHT: 0.32,       // extrusion height of each tile
  BOARD_PADDING: 0.3,      // world units of padding around the board

  // Camera
  CAM_HEIGHT: 14,
  CAM_TILT: 10,            // degrees of tilt from straight-down

  // Animation
  SLIDE_SPEED: 12,         // tiles/second for sliding animation
  MERGE_BOUNCE_DUR: 0.22,  // seconds for merge bounce animation
  CLEAR_FADE_DUR: 0.35,    // seconds for color-clear fade
} as const;

// Piece color palette — hex values, one per possible color index
export const PIECE_COLORS: readonly number[] = [
  0xe74c3c, // red
  0x3498db, // blue
  0x2ecc71, // green
  0xf39c12, // orange
  0x9b59b6, // purple
  0x1abc9c, // teal
];

// Lighter tints for label contrast
export const PIECE_TINTS: readonly number[] = [
  0xf1948a,
  0x85c1e9,
  0x82e0aa,
  0xf8c471,
  0xc39bd3,
  0x76d7c4,
];
