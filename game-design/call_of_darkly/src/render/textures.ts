import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { TextureFactory } from './types';

/**
 * Procedural 32–64px PS1-style textures. All tile seamlessly (wrapped value noise, period-aligned
 * patterns). `getTexture(kind)` returns a cached CanvasTexture: NearestFilter, no mipmaps, sRGB,
 * RepeatWrapping — scale UVs in geometry (see geometry.ts) instead of mutating texture.repeat,
 * since the texture is shared.
 */

type RGB = [number, number, number];

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, img: ctx.createImageData(size, size) };
}

/** Tileable value noise in [0,1): random lattice of `cells`×`cells`, bilinear with smoothstep, wrapped. */
function valueNoise(rng: Rng, size: number, cells: number): Float32Array {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % cells;
      const a = lat[y0 * cells + x0]!;
      const b = lat[y0 * cells + x1]!;
      const c = lat[y1 * cells + x0]!;
      const d = lat[y1 * cells + x1]!;
      out[y * size + x] = a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
    }
  }
  return out;
}

/** 2-octave fBm, tileable. */
function fbm(rng: Rng, size: number, baseCells: number): Float32Array {
  const a = valueNoise(rng, size, baseCells);
  const b = valueNoise(rng, size, baseCells * 2);
  const c = valueNoise(rng, size, Math.min(size, baseCells * 4));
  for (let i = 0; i < a.length; i++) a[i] = a[i]! * 0.55 + b[i]! * 0.3 + c[i]! * 0.15;
  return a;
}

function put(img: ImageData, i: number, c: RGB, k: number): void {
  const o = i * 4;
  img.data[o] = Math.max(0, Math.min(255, c[0] * k));
  img.data[o + 1] = Math.max(0, Math.min(255, c[1] * k));
  img.data[o + 2] = Math.max(0, Math.min(255, c[2] * k));
  img.data[o + 3] = 255;
}

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** Irregular grey stone blocks (2 rows, staggered) with dark seams and mottling. */
export const stoneCanvas: TextureFactory = (size, seed) => {
  const rng = new Rng(seed);
  const { canvas, ctx, img } = makeCanvas(size);
  const n = fbm(rng, size, 4);
  const rows = 2;
  const rowH = size / rows;
  const tint: RGB[] = [];
  for (let i = 0; i < 8; i++) {
    const g = rng.float(0.8, 1.1);
    tint.push([118 * g, 114 * g, 104 * g]);
  }
  const splits: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? size / 4 : 0;
    splits.push([off + rng.int(-2, 2), off + size / 2 + rng.int(-3, 3)]);
  }
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const ly = y - r * rowH;
    const [s0, s1] = splits[r] as [number, number];
    for (let x = 0; x < size; x++) {
      const bx = wrap(x - s0, size);
      const block = bx < wrap(s1 - s0, size) ? 0 : 1;
      const edgeX = Math.min(Math.abs(bx), Math.abs(bx - wrap(s1 - s0, size)), size - bx);
      const seam = ly < 1 || edgeX < 1;
      const nv = n[y * size + x]!;
      const base = tint[(r * 2 + block) % tint.length]!;
      let k = 0.7 + nv * 0.6;
      if (seam) k = 0.32;
      else if (ly < 2 || edgeX < 2) k *= 1.12; // chipped highlight on block edges
      put(img, y * size + x, base, k);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Red-brown bricks, running bond, mortar lines, per-brick tint. */
export const brickCanvas: TextureFactory = (size, seed) => {
  const rng = new Rng(seed);
  const { canvas, ctx, img } = makeCanvas(size);
  const n = valueNoise(rng, size, size / 4);
  const rows = size >= 64 ? 8 : 4;
  const cols = 2;
  const bh = size / rows;
  const bw = size / cols;
  const tints: number[] = [];
  for (let i = 0; i < rows * cols; i++) tints.push(rng.float(0.75, 1.1));
  const mortar: RGB = [92, 86, 76];
  const brick: RGB = [128, 62, 44];
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / bh);
    const ly = y - r * bh;
    const off = r % 2 ? bw / 2 : 0;
    for (let x = 0; x < size; x++) {
      const bx = wrap(x + off, size);
      const c = Math.floor(bx / bw);
      const lx = bx - c * bw;
      const i = y * size + x;
      const nv = n[i]!;
      if (ly < 1 || lx < 1) put(img, i, mortar, 0.7 + nv * 0.3);
      else put(img, i, brick, tints[r * cols + c]! * (0.8 + nv * 0.35) * (ly < 2 ? 1.1 : 1));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Vertical wood planks with grain streaks, knots and dark gaps. */
export const woodCanvas: TextureFactory = (size, seed) => {
  const rng = new Rng(seed);
  const { canvas, ctx, img } = makeCanvas(size);
  const planks = 4;
  const pw = size / planks;
  const grain = new Float32Array(size); // per-column grain value
  for (let x = 0; x < size; x++) grain[x] = rng.next();
  const warp = valueNoise(rng, size, 4);
  const tints: number[] = [];
  for (let i = 0; i < planks; i++) tints.push(rng.float(0.8, 1.1));
  const base: RGB = [122, 86, 50];
  const knots: Array<[number, number]> = [];
  for (let i = 0; i < 3; i++) knots.push([rng.int(0, size - 1), rng.int(0, size - 1)]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = Math.floor(x / pw);
      const lx = x - p * pw;
      const i = y * size + x;
      const gx = wrap(Math.round(x + (warp[i]! - 0.5) * 3), size);
      let k = tints[p]! * (0.78 + grain[gx]! * 0.3);
      for (const [kx, ky] of knots) {
        const dx = Math.min(Math.abs(x - kx), size - Math.abs(x - kx));
        const dy = Math.min(Math.abs(y - ky), size - Math.abs(y - ky));
        if (dx * dx + dy * dy * 0.5 < 3) k *= 0.6;
      }
      if (lx < 1) k = 0.3;
      else if (lx === Math.floor(pw) - 1) k *= 0.8;
      put(img, i, base, k);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Brown packed dirt with darker patches and light pebbles. */
export const dirtCanvas: TextureFactory = (size, seed) => {
  const rng = new Rng(seed);
  const { canvas, ctx, img } = makeCanvas(size);
  const n = fbm(rng, size, 4);
  const base: RGB = [96, 74, 52];
  for (let i = 0; i < size * size; i++) {
    const speck = rng.next();
    let k = 0.65 + n[i]! * 0.6;
    if (speck < 0.04) k *= 1.35;
    else if (speck > 0.96) k *= 0.7;
    put(img, i, base, k);
  }
  const pebbles = Math.floor(size / 6);
  const pebble: RGB = [140, 128, 110];
  for (let p = 0; p < pebbles; p++) {
    const px = rng.int(0, size - 1);
    const py = rng.int(0, size - 1);
    const w = rng.int(1, 2);
    for (let dy = 0; dy < w; dy++)
      for (let dx = 0; dx < w + 1; dx++) put(img, wrap(py + dy, size) * size + wrap(px + dx, size), pebble, dy === 0 ? 1.1 : 0.85);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

/** Grey-blue riveted steel plate with scratches and rust blooms. */
export const metalCanvas: TextureFactory = (size, seed) => {
  const rng = new Rng(seed);
  const { canvas, ctx, img } = makeCanvas(size);
  const n = valueNoise(rng, size, 8);
  const rust = fbm(rng, size, 4);
  const base: RGB = [104, 110, 118];
  const rustC: RGB = [120, 66, 34];
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const lx = x % half;
      const ly = y % half;
      let k = 0.8 + n[i]! * 0.25 + ((x * 7 + y * 3) % 11 === 0 ? 0.08 : 0);
      if (lx === 0 || ly === 0) k = 0.45; // panel seams
      else if (lx === 1 || ly === 1) k *= 1.15;
      const rv = rust[i]!;
      if (rv > 0.72) put(img, i, rustC, 0.6 + (rv - 0.72) * 1.5);
      else put(img, i, base, k);
      const rivet = (lx === 3 || lx === half - 3) && (ly === 3 || ly === half - 3);
      if (rivet) put(img, i, base, 1.35);
      else if ((lx === 4 || lx === half - 2) && (ly === 4 || ly === half - 2)) put(img, i, base, 0.5);
    }
  }
  // scratches
  for (let s = 0; s < 4; s++) {
    let x = rng.int(0, size - 1);
    const y0 = rng.int(0, size - 1);
    const len = rng.int(size / 6, size / 3);
    for (let t = 0; t < len; t++) {
      put(img, wrap(y0 + t, size) * size + wrap(x, size), base, 1.3);
      if (rng.chance(0.3)) x++;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

export const TEXTURE_FACTORIES = {
  stone: stoneCanvas,
  brick: brickCanvas,
  wood: woodCanvas,
  dirt: dirtCanvas,
  metal: metalCanvas,
} as const satisfies Record<string, TextureFactory>;

export type TextureKind = keyof typeof TEXTURE_FACTORIES;

const cache = new Map<string, THREE.CanvasTexture>();

/** Wrap a canvas as a PS1 texture: nearest, no mips, sRGB, repeat. */
export function toPs1Texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Cached procedural texture. size 32 or 64 (default 32). Same (kind,size,seed) -> same instance. */
export function getTexture(kind: TextureKind, size = 32, seed = 1): THREE.CanvasTexture {
  const key = `${kind}:${size}:${seed}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = toPs1Texture(TEXTURE_FACTORIES[kind](size, seed));
    tex.name = key;
    cache.set(key, tex);
  }
  return tex;
}

/** Dispose all cached textures (area unload / HMR). */
export function clearTextureCache(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
