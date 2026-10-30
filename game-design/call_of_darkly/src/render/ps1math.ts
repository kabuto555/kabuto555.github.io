/** Pure PS1-pipeline helpers (no three / DOM) — unit-tested in render.test.ts. */

/** Internal RT height. Width follows aspect (320 at 4:3 … 427 at 16:9). */
export const PS1_HEIGHT = 240;
export const PS1_MIN_WIDTH = 320;
export const PS1_MAX_WIDTH = 427;

/**
 * Low-res render-target size for a display aspect (w/h). Keeps pixels square:
 * width = round(240·aspect) clamped to [320, 427] — exactly 320×240 at 4:3 and 427×240 at 16:9.
 * Narrower/wider displays clamp (slightly non-square pixels) rather than blow the pixel budget.
 */
export function rtSizeForAspect(aspect: number, height = PS1_HEIGHT): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  const minW = Math.round((PS1_MIN_WIDTH * height) / PS1_HEIGHT);
  const maxW = Math.round((PS1_MAX_WIDTH * height) / PS1_HEIGHT);
  const width = Math.min(maxW, Math.max(minW, Math.round(height * a)));
  return { width, height };
}

/** Integer n×n Bayer index matrix (values 0..n²-1), row-major. Recursive: M2n = [[4M, 4M+2], [4M+3, 4M+1]]. */
export function bayerIndices(n = 4): number[] {
  if (n < 1 || (n & (n - 1)) !== 0) throw new Error(`bayerIndices: n must be a power of two, got ${n}`);
  let m = [0];
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array<number>(s2 * s2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = 4 * (m[y * size + x] as number);
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    }
    m = next;
    size = s2;
  }
  return m;
}

/** n×n Bayer thresholds normalized to (0,1): (index + 0.5) / n² — mean exactly 0.5 (unbiased). */
export function bayerMatrix(n = 4): Float32Array {
  const idx = bayerIndices(n);
  const out = new Float32Array(idx.length);
  const nn = n * n;
  for (let i = 0; i < idx.length; i++) out[i] = ((idx[i] as number) + 0.5) / nn;
  return out;
}

/**
 * CPU reference of the blit's per-channel 15-bit quantize with ordered dither (the shader mirrors it).
 * `c` in [0,1] display (sRGB) space, `threshold` from bayerMatrix. Returns the 5-bit level 0..31.
 */
export function quantize5(c: number, threshold: number): number {
  const v = Math.floor(Math.min(1, Math.max(0, c)) * 31 + threshold);
  return Math.min(31, Math.max(0, v));
}
