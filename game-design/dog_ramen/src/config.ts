export const GAME_WIDTH  = 786;
export const GAME_HEIGHT = 1704;

// ─── Ramen / Pot Theme Colors ─────────────────────────────────────────────────
export const COLORS = {
  bg: {
    primary:   0x2b1a0e,   // deep dark brown
    secondary: 0x3d2410,   // warm brown
    panel:     0x4a2e14,   // pot wall color
  },
  broth: {
    base:      0xc47a2b,   // amber broth
    shimmer:   0xe8a84a,   // lighter shimmer
    bubble:    0xf5c76a,   // bubble highlight
    dark:      0x8c540f,   // deep broth shadow
  },
  tile: {
    ramen:     0xf5e6c8,   // dry instant ramen block (pale noodle)
    ramenEdge: 0xd4b896,   // ramen edge shading
    ramenSunk: 0x8c6a3a,   // sinking ramen (darker)
    stone:     0x8a8a7a,   // stepping stone
    stoneEdge: 0x6a6a5a,
    potWall:   0x5a3820,   // pot rim / border
    potHandle: 0x7a4a28,   // handle color
    startGlow: 0x6ef27a,   // start handle glow
    endGlow:   0xf2d06e,   // end handle glow
  },
  player: {
    body:      0xe8b866,   // shiba inu golden
    dark:      0xb07830,   // shiba dark markings
    light:     0xfff0d0,   // shiba cream
    nose:      0x3a1a0a,
  },
  ui: {
    button:    0x7a4a28,
    buttonHov: 0x9a6038,
    hint:      0xf5c76a,
    hintText:  '#2b1a0e',
    disabled:  0x4a3a2a,
    border:    0x9a6038,
    winGold:   0xf5c76a,
    failRed:   0xd44a2a,
  },
  text: {
    primary:   '#fff5e0',
    secondary: '#d4a87a',
    muted:     '#8a6848',
    dark:      '#2b1a0e',
  },
} as const;

// ─── Text Styles ──────────────────────────────────────────────────────────────
export const TEXT_STYLES = {
  title:   { fontSize: '60px', fontFamily: 'Arial Black', color: COLORS.text.primary },
  heading: { fontSize: '40px', fontFamily: 'Arial', color: COLORS.text.primary, fontStyle: 'bold' as const },
  body:    { fontSize: '28px', fontFamily: 'Arial', color: COLORS.text.secondary },
  button:  { fontSize: '32px', fontFamily: 'Arial', color: '#fff5e0', fontStyle: 'bold' as const },
  small:   { fontSize: '22px', fontFamily: 'Arial', color: COLORS.text.muted },
  hint:    { fontSize: '26px', fontFamily: 'Arial', color: COLORS.ui.hintText, fontStyle: 'bold' as const },
  hud:     { fontSize: '30px', fontFamily: 'Arial Black', color: COLORS.text.primary },
} as const;

// ─── Level Scaling ─────────────────────────────────────────────────────────────
// level → { gridSize, ramenCount, stoneCount, brothCount }
export const LEVEL_PARAMS: Array<{ gridSize: number; ramenCount: number; stoneCount: number; brothCount: number }> = [
  { gridSize: 3, ramenCount: 3,  stoneCount: 0, brothCount: 0 },  // L1 — pure ramen intro
  { gridSize: 3, ramenCount: 3,  stoneCount: 2, brothCount: 1 },  // L2 — first stone bridge
  { gridSize: 4, ramenCount: 4,  stoneCount: 2, brothCount: 2 },  // L3
  { gridSize: 4, ramenCount: 5,  stoneCount: 3, brothCount: 3 },  // L4 — stone-heavy
  { gridSize: 5, ramenCount: 6,  stoneCount: 4, brothCount: 4 },  // L5
  { gridSize: 5, ramenCount: 8,  stoneCount: 5, brothCount: 5 },  // L6 — equal mix
  { gridSize: 6, ramenCount: 8,  stoneCount: 6, brothCount: 6 },  // L7 — stone-dominant
  { gridSize: 6, ramenCount: 10, stoneCount: 7, brothCount: 7 },  // L8
  { gridSize: 6, ramenCount: 12, stoneCount: 6, brothCount: 8 },  // L9 — ramen-heavy again
  { gridSize: 7, ramenCount: 10, stoneCount: 8, brothCount: 9 },  // L10 — big grid, stone maze
  { gridSize: 7, ramenCount: 14, stoneCount: 7, brothCount: 9 },  // L11
  { gridSize: 7, ramenCount: 16, stoneCount: 8, brothCount: 9 },  // L12+
];

// Tile size in pixels (cell size on screen)
export const TILE_DISPLAY_SIZE = 100; // base; scaled down for larger grids at runtime

// ─── Phaser Config ────────────────────────────────────────────────────────────
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
    parent: 'game',
    width:  GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.bg.primary,
    roundPixels: true,
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      preserveDrawingBuffer: true,
      antialias: true,
    },
    plugins: {
      scene: [{
        key:     'rexUI',
        plugin:  (window as any).rexuiplugin,
        mapping: 'rexUI',
      }],
    },
  };
}
