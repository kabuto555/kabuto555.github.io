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
  background: 0xffffff,
  hemisphereSky: 0xf2f6fb,
  hemisphereGround: 0xd6dee8,
  directionalLight: 0xffffff,
  // Brand blue (the app's --primary, hsl(213 94% 50%)) — used for the starter
  // "?" logo. Swap this for your game's own palette.
  brand: 0x0874f7,
  mesh: 0x4ecdc4,
} as const;
