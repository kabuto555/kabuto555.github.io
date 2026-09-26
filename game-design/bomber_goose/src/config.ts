export const GAME_WIDTH = 786;
export const GAME_HEIGHT = 1704;

// ─── Grid ─────────────────────────────────────────────────────────────────────
export const GRID_COLS = 7;
export const GRID_ROWS = 13;       // total visible rows
export const GRID_EMPTY_ROWS = 3;  // top rows kept empty as the drop zone

export const GRID_MARGIN_X = 32;  // left/right margin
export const CELL_GAP = 6;

// Derived cell size (square cells)
export const CELL_SIZE = 96;

// Grid origin (top-left of cell [0][0]) — centred horizontally
export const GRID_ORIGIN_X = Math.floor((GAME_WIDTH - GRID_COLS * CELL_SIZE) / 2);
export const GRID_ORIGIN_Y = 300; // HUD ~140px + goose ~80px above

// ─── Scoring ─────────────────────────────────────────────────────────────────
// Points for clearing n blocks in a single group.
// Formula: BASE_POINTS * n * n  — quadratic so larger groups reward far more.
// e.g. 3 blocks = 3*3*10 = 90 pts, 8 blocks = 8*8*10 = 640 pts, 15 = 2250 pts.
export const SCORE_BASE = 10;

// Combo multiplier for chain number c (1-indexed: first cascade = 1).
// Formula: c * c  — each extra chain level is much more valuable than the last.
// c=1 → ×1, c=2 → ×4, c=3 → ×9, c=4 → ×16 …
export function comboMultiplier(c: number): number {
  return c * c;
}

// ─── Level Progression ───────────────────────────────────────────────────────
// Each entry defines the score needed to reach this level, how often (ms) the
// construction crew adds rows, and how many rows they add each time.
export const LEVEL_CONFIG: Array<{
  scoreThreshold: number;  // score required to be at this level
  intervalMs: number;      // construction push interval in ms
  rowsAdded: number;       // rows pushed up per construction event
  clearRefillRows: number; // rows added from bottom when stage is cleared
  unlockedColors: number;  // how many BLOCK_COLORS entries are active at this level
}> = [
  { scoreThreshold: 0,     intervalMs: 18000, rowsAdded: 1, clearRefillRows: 4, unlockedColors: 3 }, // level 1
  { scoreThreshold: 800,   intervalMs: 14000, rowsAdded: 1, clearRefillRows: 5, unlockedColors: 3 }, // level 2
  { scoreThreshold: 2000,  intervalMs: 11000, rowsAdded: 1, clearRefillRows: 6, unlockedColors: 4 }, // level 3 — purple unlocked
  { scoreThreshold: 4500,  intervalMs: 8000,  rowsAdded: 1, clearRefillRows: 7, unlockedColors: 4 }, // level 4
  { scoreThreshold: 9000,  intervalMs: 6000,  rowsAdded: 1, clearRefillRows: 8, unlockedColors: 5 }, // level 5 — blue unlocked
  { scoreThreshold: 16000, intervalMs: 5000,  rowsAdded: 1, clearRefillRows: 8, unlockedColors: 5 }, // level 6
  { scoreThreshold: 26000, intervalMs: 4000,  rowsAdded: 1, clearRefillRows: 9, unlockedColors: 6 }, // level 7 — orange unlocked
];

// Each entry: [hex fill, hex border]
export const BLOCK_COLORS: Array<{ fill: number; border: number; name: string }> = [
  { fill: 0xe63946, border: 0xb52530, name: 'Red'    }, // 0 — always active
  { fill: 0x2a9d8f, border: 0x1d7068, name: 'Teal'   }, // 1 — always active
  { fill: 0xe9c46a, border: 0xc49a3c, name: 'Gold'   }, // 2 — always active
  { fill: 0x9b5de5, border: 0x6a3aab, name: 'Purple' }, // 3 — unlocked level 3
  { fill: 0x4895ef, border: 0x2a6abf, name: 'Blue'   }, // 4 — unlocked level 5
  { fill: 0xf4845f, border: 0xc45a35, name: 'Orange' }, // 5 — unlocked level 7
];

// ─── UI Colors ────────────────────────────────────────────────────────────────
export const COLORS = {
  bg:     { sky: 0x87ceeb, ground: 0x2d5a1b, city: 0x1a2a3a },
  ui:     { hud: 0x0f1923, border: 0x2a3a4a, panel: 0x1e2f3f },
  text:   { primary: '#ffffff', secondary: '#aaccee', muted: '#556677' },
  poop:   { detonator: 0x5a3a00, splat: 0xd4a017 },
  goose:  { body: 0xfafafa, beak: 0xe8a020, neck: 0xfafafa },
  empty:  0x1a2535,
} as const;

// ─── Text Styles ──────────────────────────────────────────────────────────────
export const TEXT_STYLES = {
  title:   { fontSize: '64px', fontFamily: 'Arial Black', color: '#ffffff' },
  heading: { fontSize: '40px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  body:    { fontSize: '30px', fontFamily: 'Arial', color: '#aaccee' },
  button:  { fontSize: '36px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  score:   { fontSize: '48px', fontFamily: 'Arial Black', color: '#ffffff' },
  hud:     { fontSize: '28px', fontFamily: 'Arial', color: '#aaccee' },
  small:   { fontSize: '22px', fontFamily: 'Arial', color: '#556677' },
} as const;

// ─── Phaser Config ────────────────────────────────────────────────────────────
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#87ceeb',
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      preserveDrawingBuffer: true,
      antialias: true,
    },
    plugins: {
      scene: [{
        key: 'rexUI',
        plugin: (window as any).rexuiplugin,
        mapping: 'rexUI',
      }],
    },
  };
}
