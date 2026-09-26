// Body fitting for clothes — plain JS so the game (attire.ts) and the offline checker
// (tools/measure_bodies.mjs) run the exact same maths. Works on a body's BIND-pose vertices in
// raw GLB space (glTF skinning: at bind, vertex world = its POSITION), each tagged with the
// bone group that owns it.
//
// A body's fit (body-fits.json) is authored from its silhouettes: where the tail is (tails are
// skinned to the hips / spine like the torso, so bones can't tell them apart), which heights the
// top and shorts cover, and where the chest is. From that, the torso is sliced
// into smooth superellipses (a rounded box: chonks are boxier than an ellipse) that clothes are
// built on — the tail and anything else excluded never shapes them.

/** @typedef {{ x: number, y: number, z: number, g: string }} BodyVert  g: bone group (see groupOf). */
/** @typedef {{ zBelow: number, y: [number, number] }} TailZone  Everything behind zBelow within y. */
/**
 * @typedef {{
 *   model: string, verts: number,
 *   tails?: TailZone[],
 *   top: [number, number], bottom: [number, number],
 *   chest: number,
 * }} BodyFit
 */
/** @typedef {{ y: number, cx: number, cz: number, rx: number, rz: number, p: number }} Slice */

/** Bone group: H head, N neck, T torso, L legs, F feet, A arms, h hands. */
export function groupOf(bone) {
  const b = bone.replace(/^mixamorig:?/i, '').toLowerCase();
  if (/^head/.test(b)) return 'H';
  if (/neck/.test(b)) return 'N';
  if (/hand|thumb|index|middle|ring|pinky/.test(b)) return 'h';
  if (/shoulder|arm/.test(b)) return 'A';
  if (/foot|toe/.test(b)) return 'F';
  if (/leg/.test(b)) return 'L';
  return 'T';
}

/** In one of the fit's tail zones. */
export function isTail(v, fit) {
  for (const t of fit.tails ?? []) if (v.z < t.zBelow && v.y >= t.y[0] && v.y <= t.y[1]) return true;
  return false;
}

/** Torso / hips / legs that clothes are shaped on (not head, arms, hands, feet or tail). */
export function isClothable(v, fit) {
  return (v.g === 'T' || v.g === 'L' || v.g === 'N') && !isTail(v, fit);
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

/**
 * The torso's cross-section at height y: a superellipse |dx/rx|^p + |dz/rz|^p = 1 around
 * (cx, cz), from the clothable vertices within `band` of y. The box is the vertices' 1st–99th
 * percentile extent; p (2 = ellipse … 4 = boxy) is the roundest that still holds 98% of them.
 * @returns {Slice | null}
 */
export function sliceAt(verts, y, band, fit) {
  let pick = verts.filter((v) => Math.abs(v.y - y) < band && isClothable(v, fit));
  if (pick.length < 12) pick = verts.filter((v) => Math.abs(v.y - y) < band * 2.5 && isClothable(v, fit));
  if (pick.length < 6) return null;
  const xs = pick.map((v) => v.x).sort((a, b) => a - b), zs = pick.map((v) => v.z).sort((a, b) => a - b);
  const x0 = pct(xs, 0.01), x1 = pct(xs, 0.99), z0 = pct(zs, 0.01), z1 = pct(zs, 0.99);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = Math.max(1e-3, (x1 - x0) / 2), rz = Math.max(1e-3, (z1 - z0) / 2);
  let p = 4;
  for (const q of [2, 2.5, 3, 3.5, 4]) {
    const inside = pick.filter((v) => Math.abs((v.x - cx) / rx) ** q + Math.abs((v.z - cz) / rz) ** q <= 1.02).length;
    if (inside >= pick.length * 0.98) { p = q; break; }
  }
  return { y, cx, cz, rx, rz, p };
}

/** `n` slices from range[0] (bottom) to range[1] (top), gaps filled, lightly smoothed vertically. */
export function slicesFor(verts, range, n, fit) {
  const [y0, y1] = range;
  const band = Math.abs(y1 - y0) / (n - 1) * 0.6;
  const out = [];
  for (let k = 0; k < n; k++) out.push(sliceAt(verts, y0 + (y1 - y0) * (k / (n - 1)), band, fit));
  for (let pass = 0; pass < n; pass++) for (let k = 0; k < n; k++) if (!out[k]) out[k] = out[k - 1] ?? out[k + 1] ?? null;
  if (out.some((s) => !s)) return null;
  // Smooth centre / radii (not y) so a lumpy slice doesn't dent the cloth.
  const sm = out.map((s, k) => {
    const a = out[Math.max(0, k - 1)], c = out[Math.min(n - 1, k + 1)];
    const mix = (key) => 0.25 * a[key] + 0.5 * s[key] + 0.25 * c[key];
    return { y: s.y, cx: mix('cx'), cz: mix('cz'), rx: Math.max(s.rx, mix('rx')), rz: Math.max(s.rz, mix('rz')), p: Math.max(s.p, mix('p')) };
  });
  return sm;
}

/** Point on a slice's outline at angle t (0 = +x, π/2 = +z / front), pushed out by `grow` (× radius) + `pad`. */
export function outlinePoint(s, t, grow = 0, pad = 0) {
  const c = Math.cos(t), sn = Math.sin(t), e = 2 / s.p;
  return {
    x: s.cx + Math.sign(c) * Math.abs(c) ** e * (s.rx * (1 + grow) + pad),
    y: s.y,
    z: s.cz + Math.sign(sn) * Math.abs(sn) ** e * (s.rz * (1 + grow) + pad),
  };
}

/** The slice at height y, interpolated from a stack (clamped to its ends). */
export function sliceAtHeight(slices, y) {
  if (y <= slices[0].y) return { ...slices[0], y };
  for (let k = 1; k < slices.length; k++) {
    const a = slices[k - 1], b = slices[k];
    if (y <= b.y) {
      const u = (y - a.y) / (b.y - a.y || 1);
      const lerp = (key) => a[key] + (b[key] - a[key]) * u;
      return { y, cx: lerp('cx'), cz: lerp('cz'), rx: lerp('rx'), rz: lerp('rz'), p: lerp('p') };
    }
  }
  return { ...slices[slices.length - 1], y };
}
