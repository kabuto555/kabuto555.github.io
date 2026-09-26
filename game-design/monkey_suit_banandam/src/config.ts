import { CANVAS_ASPECT } from './canvas-config';

function deriveCanvasDims(): { width: number; height: number } {
  const longEdge = 1704;
  const raw = CANVAS_ASPECT;
  if (typeof raw !== 'string') return { width: 786, height: longEdge };
  const parts = raw.split(':');
  if (parts.length !== 2) return { width: 786, height: longEdge };
  const w = parseFloat(parts[0]);
  const h = parseFloat(parts[1]);
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { width: 786, height: longEdge };
  const shortEdge = Math.round(longEdge * Math.min(w, h) / Math.max(w, h));
  if (w < h) return { width: shortEdge, height: longEdge };
  return { width: longEdge, height: shortEdge };
}

const _dims = deriveCanvasDims();
export const GAME_WIDTH = _dims.width;
export const GAME_HEIGHT = _dims.height;

export const COLORS = {
  background: 0x020818,       // deep space black-blue
  hemisphereSky: 0x4466cc,    // brighter mid-blue sky
  hemisphereGround: 0x223355, // dark-blue space ground bounce
  directionalLight: 0xffeedd, // warm starlight
  brand: 0x00ffe5,
  mesh: 0x4ecdc4,
  // Player
  playerBody: 0x2244cc,       // cobalt blue gundam suit
  playerAccent: 0xffdd00,     // yellow V-fin accent
  playerCockpit: 0x00ffcc,    // teal visor
  playerJetpack: 0x445566,    // grey jetpack
  // Enemies
  snakeColor: 0x44aa44,       // green snake ship
  eagleColor: 0xbb8833,       // gold eagle fighter
  leopardColor: 0xcc6622,     // orange leopard cruiser
  bossColor: 0xaa2222,        // red boss
  weakPoint: 0xffff00,        // bright yellow weak point
  // Projectiles
  playerShot: 0x00ffff,       // cyan vulcan
  playerMissile: 0xff8800,    // orange missile
  playerBeam: 0xff00ff,       // magenta beam
  enemyShot: 0xff4400,        // red-orange enemy bullet
  // Pickups
  healthPickup: 0xff3366,     // hot pink health
  weaponPickup: 0xffaa00,     // amber weapon powerup
  expOrb: 0xaaffaa,           // green exp
  // Environment
  obstacle: 0x556677,         // blue-grey asteroid
  starColor: 0xffffff,
} as const;
