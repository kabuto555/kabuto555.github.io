import type { Curve } from '../data/types';

/** Piecewise-linear stat curve lookup (data/types Curve), clamped at the ends. */
export function evalCurve(curve: Curve, level: number): number {
  if (curve.length === 0) return 0;
  const first = curve[0]!;
  if (level <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const [l1, v1] = curve[i]!;
    if (level <= l1) {
      const [l0, v0] = curve[i - 1]!;
      return l1 === l0 ? v1 : v0 + ((v1 - v0) * (level - l0)) / (l1 - l0);
    }
  }
  return curve[curve.length - 1]![1];
}
