import type { BlockOffset } from './types';

export const GAME_WIDTH = 786;
export const GAME_HEIGHT = 1704;

// ─── Grid ────────────────────────────────────────────────────────────────────
/** Initial size of one grid cell in pixels — live size is in GameState */
export const CELL = 72;
/** Initial number of columns in the placement grid */
export const GRID_COLS = 9;
/** Initial number of rows in the placement grid */
export const GRID_ROWS = 12;
/** Grid area available for blocks (width × height px, used to compute live cellSize) */
export const GRID_PIXEL_W = GRID_COLS * CELL;  // 648
export const GRID_PIXEL_H = GRID_ROWS * CELL;  // 864
/** Fraction of grid cells occupied that triggers an expansion (+2 cols, +2 rows) */
export const GRID_EXPAND_THRESHOLD = 0.4;

// ─── Colors ──────────────────────────────────────────────────────────────────
export const COLORS = {
  bg:     { primary: 0x0a0e1a, secondary: 0x0f1923, panel: 0x151f2e },
  grid:   { line: 0x1e3050, fill: 0x0d1626, occupied: 0x1a2d44, hover: 0x203a55 },
  block:  {
    default:  0x2a5caa,
    placed:   0x1e4080,
    border:   0x4a8cda,
    ghost:    0x204060,
    ghostAlpha: 0.35,
  },
  weapon: {
    gun:     0xffe66d,  // yellow — bullet
    laser:   0xff6b6b,  // red — aimed bolt
    beam:    0x00ffff,  // cyan — column cannon
    mine:    0xff6600,  // orange — spiky drift
    missile: 0xff9900,  // amber — accelerating rocket
    funnel:  0xaa44ff,  // purple — autonomous unit
    rock:    0x886644,  // brown — heavy shot
    homing:  0xff4488,  // pink — tracking missile
  },
  accent: { primary: 0x4ecdc4, secondary: 0xff6b6b, tertiary: 0xffe66d },
  text:   { primary: '#ffffff', secondary: '#8899aa', muted: '#556677', gold: '#ffe66d' },
  ui:     { button: 0x4ecdc4, buttonHover: 0x45b7b0, disabled: 0x3a4a5a, border: 0x2a3a4a, danger: 0xff4444 },
  hp:     { full: 0x44dd88, low: 0xff6644 },
} as const;

export const TEXT_STYLES = {
  title:   { fontSize: '52px', fontFamily: 'Arial Black', color: COLORS.text.primary },
  heading: { fontSize: '36px', fontFamily: 'Arial', color: COLORS.text.primary, fontStyle: 'bold' as const },
  body:    { fontSize: '28px', fontFamily: 'Arial', color: COLORS.text.secondary },
  button:  { fontSize: '32px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  score:   { fontSize: '44px', fontFamily: 'Arial Black', color: '#ffffff' },
  small:   { fontSize: '22px', fontFamily: 'Arial', color: COLORS.text.muted },
  hud:     { fontSize: '26px', fontFamily: 'Arial', color: COLORS.text.primary, fontStyle: 'bold' as const },
} as const;

// ─── Piece Definitions ────────────────────────────────────────────────────────
/** All base piece shapes (before rotation), in grid-unit offsets from top-left origin */
export const PIECE_SHAPES: BlockOffset[][] = [
  // 1-block
  [{ col: 0, row: 0 }],

  // 2-block
  [{ col: 0, row: 0 }, { col: 1, row: 0 }],
  [{ col: 0, row: 0 }, { col: 0, row: 1 }],

  // 3-block line
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }],
  // 3-block L
  [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  // 3-block T
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }],

  // Tetrominoes (standard shapes)
  // I
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
  // O
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  // T
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }],
  // L
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }],
  // J
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }],
  // S
  [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  // Z
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
];

// ─── Game constants ───────────────────────────────────────────────────────────
/** Grid position of the player's core block (centre of the grid) */
export const CORE_COL = Math.floor(9 / 2);  // = 4 — fixed anchor; never changes
export const CORE_ROW = Math.floor(12 / 2); // = 6

export const BONUS_TILE_COUNT     = 3;   // bonus weapon tiles per build phase
export const BONUS_TILE_MAX_DIST  = 3;   // max Manhattan distance from ship to place a bonus tile
export const INITIAL_PIECE_COUNT  = 4;   // first build phase
export const SUBSEQUENT_PIECE_COUNT = 4; // subsequent build phases
export const INITIAL_ENEMY_PIECES = 3;   // enemy starts with 3 pieces
export const ENEMY_PIECE_GROWTH   = 8;   // +8 enemy pieces each round (player adds 4 pieces/stage)

export const PLAYER_MAX_HP = 20;
export const PLAYER_LIVES  = 3;    // total lives for the whole run
export const BLOCK_HP      = 5;          // each block has this many HP
export const GUN_DAMAGE    = 2;
export const LASER_DAMAGE  = 3;
export const BULLET_SPEED  = 600;
export const LASER_SPEED   = 800;

// ─── New weapon constants ─────────────────────────────────────────────────────
export const BEAM_DAMAGE       = 8;    // per-block instant damage
export const BEAM_CHARGE_TIME  = 1.2;  // seconds of telegraph before firing
export const BEAM_COOLDOWN     = 3.5;  // seconds between beam shots
export const BEAM_WIDTH        = 18;   // pixel width of beam
export const MINE_DAMAGE       = 6;
export const MINE_SPEED_MIN    = 28;   // px/s drift minimum (randomized per shot)
export const MINE_SPEED_MAX    = 90;   // px/s drift maximum (randomized per shot)
export const MINE_RADIUS       = 14;
export const MINE_HP           = 3;    // absorbs 3 hits before detonating
export const MISSILE_DAMAGE    = 5;
export const MISSILE_SPEED_MIN = 80;   // launch speed
export const MISSILE_ACCEL     = 320;  // px/s² acceleration
export const MISSILE_RADIUS    = 14;
export const FUNNEL_SPEED      = 300;  // funnel travel speed px/s
export const FUNNEL_LASER_DMG  = 2;
export const FUNNEL_FIRE_RATE  = 1.8;  // seconds between funnel shots
export const FUNNEL_RELEASE_RATE = 4.0; // seconds between funnel releases
export const ROCK_HP           = 4;
export const ROCK_RADIUS       = 22;
export const ROCK_SPEED        = 180;
export const ROCK_DAMAGE       = 4;
export const HOMING_DAMAGE     = 5;
export const HOMING_SPEED_MIN  = 80;
export const HOMING_ACCEL      = 260;
export const HOMING_TURN_SPEED = 3.2;  // rad/s max turn
export const HOMING_LOCK_DIST  = 120;  // px — goes straight once this close

/** Round number at which each weapon type becomes available (player + enemy) */
export const WEAPON_UNLOCK_ROUND: Record<string, number> = {
  gun:     1,
  laser:   1,
  beam:    2,
  mine:    3,
  missile: 4,
  funnel:  5,
  rock:    6,
  homing:  7,
};

// ─── Battle movement ──────────────────────────────────────────────────────────
export const PLAYER_SPEED      = 320;    // px/s keyboard movement
export const PLAYER_BOUNDS_PAD = 60;     // min px from screen edge
// Asteroid belt center band (Y range)
export const ASTEROID_BAND_Y   = GAME_HEIGHT * 0.48;
export const ASTEROID_BAND_H   = 180;    // half-height of belt
export const ASTEROID_SPEED_MIN = 80;
export const ASTEROID_SPEED_MAX = 200;
export const ASTEROID_HP        = 4;
export const ASTEROID_RADIUS_MIN = 18;
export const ASTEROID_RADIUS_MAX = 40;
export const ASTEROID_COUNT      = 6;    // live at any time
// Enemy AI
export const ENEMY_SPEED       = 160;    // px/s lateral strafe
export const ENEMY_BOUNDS_PAD  = 60;

// Boost / underdog
export const BOOST_COST         = 0.4;   // fraction of gauge used per boost
export const BOOST_REGEN        = 0.18;  // gauge units restored per second
export const BOOST_DISTANCE     = 130;   // total px traveled during a boost dash
export const BOOST_DURATION     = 0.22;  // seconds for one dash (quad-out easing)
export const UNDERDOG_SPEED_MAX = 2.0;   // max speed multiplier at 0% blocks remaining

// ─── Phaser Config ────────────────────────────────────────────────────────────
export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.bg.primary,
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
