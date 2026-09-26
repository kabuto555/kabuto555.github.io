export const GAME_WIDTH = 786;
export const GAME_HEIGHT = 1704;

// ── Track geometry ────────────────────────────────────────────────────────────
export const TRACK_CENTER_X = GAME_WIDTH / 2;
export const TRACK_TOP_Y = 0;           // stem starts at very top of screen
export const FORK_Y = 500;              // where track splits
export const FORK_END_Y = 620;          // where fork rejoins straight branches
export const LEFT_FORK_X = 120;
export const RIGHT_FORK_X = 666;
export const TRACK_BOTTOM_Y = GAME_HEIGHT; // branches extend to bottom
export const TRACK_WIDTH = 14;          // rail stroke width
export const TIE_COLOR = 0x8b6340;
export const RAIL_COLOR = 0xaaaaaa;
export const GRASS_COLOR = 0x2d5a27;

// ── Train ─────────────────────────────────────────────────────────────────────
export const TRAIN_SPEED_MS = 900;      // ms to travel from spawn to fork
export const TRAIN_BRANCH_MS = 600;     // ms to travel fork → fork end (diagonal)
export const TRAIN_CONTINUE_MS = 1400;  // ms to travel fork end → bottom of screen

// ── Karma bar ─────────────────────────────────────────────────────────────────
export const KARMA_BAR_Y = 56;          // top of screen
export const KARMA_BAR_W = GAME_WIDTH - 80;
export const KARMA_BAR_H = 44;
export const KARMA_MIN = -100;
export const KARMA_MAX = 100;
export const KARMA_START = 0;

// ── Rounds ────────────────────────────────────────────────────────────────────
export const TOTAL_ROUNDS = 8;
export const RESULT_DISPLAY_MS = 2200;

// ── Colors ────────────────────────────────────────────────────────────────────
export const COLORS = {
  bg: { primary: 0x0a0a1a, secondary: 0x12122e, panel: 0x1a1a40 },
  rail: RAIL_COLOR,
  tie: TIE_COLOR,
  grass: 0x1a6b1a,
  trainBody: 0xee2211,
  trainWindow: 0x99eeff,
  trainWheel: 0x222233,
  evil: 0xff2244,
  good: 0xffdd00,
  neutral: 0x44aaff,
  accent: { primary: 0xff4400, secondary: 0xffdd00, tertiary: 0x00ffcc },
  text: { primary: '#ffffff', secondary: '#ffee88', muted: '#8899cc' },
  ui: { button: 0xff4400, buttonHover: 0xff6600, disabled: 0x334466, border: 0xffdd00 },
  snes: {
    darkNavy:  0x080820,
    navy:      0x10103a,
    panelBg:   0x1c1c4e,
    yellow:    0xffdd00,
    red:       0xff2244,
    orange:    0xff6600,
    cyan:      0x00ffcc,
    pink:      0xff44aa,
    white:     0xffffff,
    outline:   0x000000,
  },
} as const;

export const TEXT_STYLES = {
  title:   { fontSize: '64px', fontFamily: 'Arial Black', color: COLORS.text.primary },
  heading: { fontSize: '40px', fontFamily: 'Arial', color: COLORS.text.primary, fontStyle: 'bold' as const },
  body:    { fontSize: '28px', fontFamily: 'Arial', color: COLORS.text.secondary },
  button:  { fontSize: '36px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  score:   { fontSize: '44px', fontFamily: 'Arial Black', color: '#ffffff' },
  small:   { fontSize: '22px', fontFamily: 'Arial', color: COLORS.text.muted },
  entity:  { fontSize: '52px', fontFamily: 'Arial', color: '#ffffff' },
  karma:   { fontSize: '30px', fontFamily: 'Arial Black', color: '#ffffff' },
} as const;

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
