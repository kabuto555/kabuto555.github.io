export const GAME_WIDTH = 786;
export const GAME_HEIGHT = 1704;

// Level world size (larger than viewport — camera scrolls)
export const LEVEL_WIDTH = 786 * 2;
export const LEVEL_HEIGHT = 1704 * 2.5;

// Player
export const BEAR_SPEED = 280;
export const BEAR_HP = 5;
export const BEAR_RADIUS = 30;
export const BEAR_COLOR = 0x8b5e3c;
export const BEAR_DARK = 0x5c3d1e;
export const DODGE_SPEED = 520;      // px/s burst velocity (shorter dash, 2-charge system)
export const DODGE_DURATION = 160;   // ms the burst lasts
export const DODGE_COOLDOWN = 1400;  // ms to recharge one dodge charge
export const DODGE_CHARGES = 2;      // max simultaneous dodge charges

// Enemies
export const MELEE_SPEED = 130;
export const RANGED_SPEED = 60;
export const MELEE_HP = 2;
export const RANGED_HP = 2;
export const SLOW_DURATION = 2200;     // ms the slow debuff lasts (refreshed on each sting)
export const SLOW_MOVE_MULT = 0.35;    // speed multiplier while slowed
export const SLOW_ATTACK_MULT = 0.35;  // attack-rate multiplier while slowed
export const BEE_DPS = 1.2;            // HP damage per second while bees are in range
export const MELEE_ATTACK_RANGE = 55;
export const MELEE_ATTACK_COOLDOWN = 1200;
export const RANGED_SHOOT_COOLDOWN = 2500;
export const RANGED_DETECT_RANGE = 700;
export const MELEE_DETECT_RANGE = 560;
export const PROJECTILE_SPEED = 180;

// Bees
export const BEE_SPEED_MIN = 240;    // px/s minimum speed
export const BEE_TRAVERSE_MS = 2800; // target duration to fly any path
export const BEE_STING_RANGE = 50;
export const BEE_COUNT = 5;            // dots per swarm
export const BEE_MAX_SWARMS = 2;       // max simultaneous bee swarms (one per paw)
export const BEE_RETURN_SPEED = 380; // px/s lerp back to bear

// Camera
export const CAMERA_ZOOM = 1.8;  // zoom level — higher = closer

// Boss
export const BOSS_MAX_HP        = 20;
export const BOSS_SPEED          = 90;   // px/s when chasing
export const BOSS_RADIUS         = 70;   // collision/display radius
export const BOSS_MELEE_RANGE    = 110;  // px — slash triggers
export const BOSS_AWAKEN_MS      = 2200; // ms for awakening animation
export const BOSS_STUN_PER_STING = 120;  // ms stun added per bee tick

// Cage
export const CAGE_OPEN_RANGE = 80;

// Goal
export const GOAL_RADIUS = 50;

// Tile
export const TILE = 72;

// Colors
export const COLORS = {
  bg:     { primary: 0x2d5a1b, secondary: 0x1e3d0f, panel: 0x243447 },
  ground: { base: 0x4a7c2f, dark: 0x3a6020, path: 0x8b7355, dirt: 0x6b5040 },
  accent: { primary: 0xf5c542, secondary: 0xff6b6b, tertiary: 0x7ecfff },
  text:   { primary: '#ffffff', secondary: '#cceecc', muted: '#88aa88' },
  ui:     { button: 0xf5c542, buttonHover: 0xd4a830, disabled: 0x3a4a5a, border: 0x2a3a2a },
  bear:   { body: 0x8b5e3c, dark: 0x5c3d1e, snout: 0xc49a6c, eye: 0x1a0a00 },
  enemy:  { body: 0xe8c49a, shirt: 0x2244aa, axe: 0x888888 },
  bee:    { body: 0xf5c542, stripe: 0x1a1a00 },
  hive:   { body: 0xd4960a, dark: 0xa06a00 },
  cage:   { bar: 0x888888, dark: 0x555555 },
  goal:   { glow: 0xffee55, ring: 0xffd700 },
  hp:     { full: 0x44dd44, low: 0xdd4444, bg: 0x331111 },
  city:   {
    asphalt: 0x3a3a3a, asphaltDark: 0x2a2a2a,
    sidewalk: 0xb0a080, sidewalkDark: 0x9a8c70,
    road: 0x555555, line: 0xf5f5a0,
    building: 0x6a7a8a, buildingDark: 0x4a5a6a, buildingLight: 0x8a9aaa,
    window: 0xaaddff, windowLit: 0xffee88,
    wall: 0x8a7a6a,
  },
  dc: {
    floor: 0x0a0a12, floorDark: 0x060608, floorLine: 0x1a1a2a,
    rack: 0x1a1a2e, rackDark: 0x0d0d1a, rackLight: 0x2a2a44,
    led: 0x00ffcc, ledDim: 0x004433, ledRed: 0xff3322, ledAmber: 0xffaa00,
    cable: 0x222244, cableDark: 0x111122,
    cooling: 0x112233, coolingGlow: 0x0066aa,
    accent: 0x00aaff, accentGlow: 0x003366,
    panel: 0x0d1a2a, panelBorder: 0x00ffcc,
  },
} as const;

export const TEXT_STYLES = {
  title:   { fontSize: '52px', fontFamily: 'Arial Black', color: '#ffffff' },
  heading: { fontSize: '36px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
  body:    { fontSize: '28px', fontFamily: 'Arial', color: '#cceecc' },
  button:  { fontSize: '32px', fontFamily: 'Arial', color: '#1a1a00', fontStyle: 'bold' as const },
  score:   { fontSize: '40px', fontFamily: 'Arial Black', color: '#ffffff' },
  small:   { fontSize: '22px', fontFamily: 'Arial', color: '#88aa88' },
  hud:     { fontSize: '30px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' as const },
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
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
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
