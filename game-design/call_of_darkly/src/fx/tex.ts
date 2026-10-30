import * as THREE from 'three';

function make(size: number, fn: (u: number, v: number) => number, rgb: [number, number, number]): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const i = (y * size + x) * 4;
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
      d[i + 3] = fn(u, v) > 0 ? 255 : 0;
    }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** 32px pointed star (headless-safe, no canvas). */
export function makeStarTexture(): THREE.DataTexture {
  return make(
    32,
    (u, v) => {
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      return 0.95 * (0.28 + 0.72 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3)) - r;
    },
    [255, 233, 160],
  );
}

/** 16px ragged bullet-hole blob. */
export function makeDecalTexture(): THREE.DataTexture {
  return make(
    16,
    (u, v) => {
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      return 0.85 + 0.15 * Math.sin(a * 5) - r;
    },
    [255, 255, 255],
  );
}
