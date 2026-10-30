import * as THREE from 'three';

/**
 * Geometry helpers with world-scale UVs (texture tiles every `tile` meters), so shared cached
 * textures need no per-mesh `repeat`. Keep polys moderately subdivided: affine mapping warps
 * badly on big triangles (that was true on PS1 too — the fix there was tessellation).
 */

export interface BoxGeoOptions {
  /** Meters per texture repeat. Default 2. */
  tile?: number;
  /** Max edge length per segment in meters (subdivision for affine). Default 2. 0 = no subdivision. */
  maxSegment?: number;
}

const segs = (len: number, max: number) => (max > 0 ? Math.max(1, Math.ceil(len / max - 1e-6)) : 1);

/** BoxGeometry with per-face UVs scaled to face dimensions / tile. Origin at box center. */
export function makeBoxGeometry(w: number, h: number, d: number, opts: BoxGeoOptions = {}): THREE.BoxGeometry {
  const tile = opts.tile ?? 2;
  const max = opts.maxSegment ?? 2;
  const sx = segs(w, max);
  const sy = segs(h, max);
  const sz = segs(d, max);
  const geo = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z. (u, v) spans per face:
  const spans: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const groups = geo.groups;
  for (let f = 0; f < groups.length; f++) {
    const g = groups[f]!;
    const [su, sv] = spans[f]!;
    // groups index into the index buffer; collect vertex range via index.
    const index = geo.getIndex()!;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = g.start; i < g.start + g.count; i++) {
      const v = index.getX(i);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    for (let v = lo; v <= hi; v++) uv.setXY(v, (uv.getX(v) * su) / tile, (uv.getY(v) * sv) / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Horizontal ground plane (XZ, facing +Y) with world UVs and subdivision. Origin at center. */
export function makeFloorGeometry(w: number, d: number, opts: BoxGeoOptions = {}): THREE.PlaneGeometry {
  const tile = opts.tile ?? 2;
  const max = opts.maxSegment ?? 2;
  const geo = new THREE.PlaneGeometry(w, d, segs(w, max), segs(d, max));
  geo.rotateX(-Math.PI / 2);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  uv.needsUpdate = true;
  return geo;
}
