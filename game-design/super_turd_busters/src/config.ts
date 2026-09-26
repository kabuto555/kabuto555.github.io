export const GAME_WIDTH = 786;
export const GAME_HEIGHT = 1704;

// ─── Grid / Cell Constants ───────────────────────────────────────────────────
export const GRID_PADDING = 40;          // px from screen edge
export const GRID_TOP = 420;             // px from top where grid starts (extra room for plumber art)
export const GRID_BOTTOM_MARGIN = 260;   // px reserved for controls at bottom

// Cell size is derived at runtime from grid cols (see levelUtils)

// ─── Colors ──────────────────────────────────────────────────────────────────
export const COLORS = {
  bg: { primary: 0x1a0a2e, secondary: 0x2a1a3e, panel: 0x3a2a4e },
  pipe: { fill: 0x4a9eca, stroke: 0x2a6e9a, shadow: 0x1a4e7a },
  wall: { fill: 0x5a4a3a, stroke: 0x3a2a1a, grout: 0x2a1a0a },
  snake: {
    body:   0x8899aa,   // steel grey cable
    stroke: 0x445566,   // dark steel outline
    ridge:  0xaabbcc,   // lighter diagonal ridge highlight
    tip:    0xddeeff,   // bright silver drill tip
  },
  toilet: { bowl: 0xeef0f2, rim: 0xccced0, water: 0xa8d8f0 },
  plumber: {
    skin:     0xf4c28a,  // skin tone
    skinDark: 0xd4924a,  // shadow / shading
    shirt:    0xff3322,  // red shirt
    overalls: 0x2244aa,  // blue overalls
    hair:     0x3a2208,  // dark brown hair
    cap:      0xff3322,  // red cap
    capBrim:  0xcc2211,
    boots:    0x2a1a08,  // dark brown boots
    mustache: 0x3a2208,  // moustache
  },
  poop: { fill: 0x8B4513, stroke: 0x5a2a08, shine: 0xb06030 },
  button: { fill: 0x3a5aaa, stroke: 0x2a4a8a, text: '#ffffff', active: 0x5a7acc },
  ui: {
    border: 0x2a3a4a,
    text: '#ffffff',
    subtext: '#88aacc',
    muted: '#556677',
    win: 0x44dd88,
    lose: 0xdd4444,
  },
} as const;

// ─── Text Styles ─────────────────────────────────────────────────────────────
export const TEXT_STYLES = {
  title:   { fontSize: '72px', fontFamily: 'Arial Black', color: '#ffffff' },
  heading: { fontSize: '48px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  level:   { fontSize: '38px', fontFamily: 'Arial Black', color: '#aaccff' },
  body:    { fontSize: '30px', fontFamily: 'Arial', color: '#88aacc' },
  button:  { fontSize: '44px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  small:   { fontSize: '24px', fontFamily: 'Arial', color: '#556677' },
} as const;

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
