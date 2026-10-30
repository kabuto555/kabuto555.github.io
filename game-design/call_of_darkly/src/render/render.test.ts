import { describe, expect, it } from 'vitest';
import { bayerIndices, bayerMatrix, quantize5, rtSizeForAspect } from './ps1math';

describe('rtSizeForAspect', () => {
  it('is 320×240 at 4:3 and 427×240 at 16:9', () => {
    expect(rtSizeForAspect(4 / 3)).toEqual({ width: 320, height: 240 });
    expect(rtSizeForAspect(16 / 9)).toEqual({ width: 427, height: 240 });
  });
  it('keeps square pixels in between and clamps outside', () => {
    expect(rtSizeForAspect(16 / 10).width).toBe(384);
    expect(rtSizeForAspect(1).width).toBe(320);
    expect(rtSizeForAspect(21 / 9).width).toBe(427);
  });
  it('handles degenerate aspects', () => {
    expect(rtSizeForAspect(0)).toEqual({ width: 320, height: 240 });
    expect(rtSizeForAspect(Number.NaN)).toEqual({ width: 320, height: 240 });
  });
});

describe('bayer', () => {
  it('4×4 matches the classic matrix', () => {
    expect(bayerIndices(4)).toEqual([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
  });
  it('is a permutation with unbiased mean for 2/4/8', () => {
    for (const n of [2, 4, 8]) {
      const idx = bayerIndices(n);
      expect([...idx].sort((a, b) => a - b)).toEqual([...Array(n * n).keys()]);
      const m = bayerMatrix(n);
      const mean = m.reduce((a, b) => a + b, 0) / m.length;
      expect(mean).toBeCloseTo(0.5, 6);
      for (const v of m) expect(v > 0 && v < 1).toBe(true);
    }
  });
  it('rejects non power-of-two', () => {
    expect(() => bayerIndices(3)).toThrow();
  });
});

describe('quantize5', () => {
  it('maps extremes to 0 and 31', () => {
    expect(quantize5(0, 0.03)).toBe(0);
    expect(quantize5(1, 0.97)).toBe(31);
    expect(quantize5(-1, 0.5)).toBe(0);
    expect(quantize5(2, 0.5)).toBe(31);
  });
  it('ordered dither over a 4×4 tile preserves the average level', () => {
    const m = bayerMatrix(4);
    for (const c of [0.1, 0.33, 0.5, 0.77]) {
      let sum = 0;
      for (const t of m) sum += quantize5(c, t);
      expect(sum / m.length / 31).toBeCloseTo(c, 1);
    }
  });
});
