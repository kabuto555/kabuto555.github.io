import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aabbFromFootprint } from '../physics/aabb';
import { Layer, type Collider, type CollisionWorld } from '../physics/types';
import { makeBoxGeometry } from '../render/geometry';
import { PLAYER_TUNING } from '../player/tuning';
import { makePs1Material } from '../render/materials';
import { getTexture, type TextureKind } from '../render/textures';
import { createLevelDsl } from './dsl';
import type { AreaDef, Facing, LevelOp, MaterialId } from './types';

/**
 * Level builder (§12): recorded DSL ops → merged PS1 meshes + static colliders.
 *
 * - Geometry is merged per (texture, 32 m XZ chunk) → one draw call each; tint is a vertex color
 *   so differently-tinted greybox materials sharing a texture still merge.
 * - box: one AABB collider. stairs: one solid slab per step (base → step top).
 * - ramp: visual wedge; collider = stepped slabs ≤ RAMP_STEP tall (the capsule's rounded bottom
 *   rides 0.1 m steps as walkable ground; step-up + ground snap smooth the rest). Ramps steeper
 *   than the capsule slope limit (50°) should be authored as walls/stairs instead.
 * - barrier: Layer.Barrier collider (tag = id); 'construction'/'rubble' get a visual, 'fogWall' a
 *   translucent sheet, 'invisible' none.
 * - spawn: handed to `opts.onSpawn` (the AI system builds enemies); kept in `pending` when absent.
 * - cache/item/chest/mimic/door: handed to `opts.onCache/onItem/onChest/onMimic/onDoor` (M4 pickups,
 *   chests, doors); kept in `pending` when absent. bonfire: `opts.onBonfire` (M5 BonfireSystem). 'construction' barriers go to `opts.onBarrier` (props) when given.
 */

export interface MaterialDef {
  tex: TextureKind;
  seed: number;
  tint: number;
}

/** MaterialId → texture + tint. Unknown ids that name a TextureKind use it untinted. */
export const LEVEL_MATERIALS: Record<string, MaterialDef> = {
  floor: { tex: 'dirt', seed: 3, tint: 0xb8b0a0 },
  wall: { tex: 'brick', seed: 7, tint: 0xffffff },
  stone: { tex: 'stone', seed: 11, tint: 0xffffff },
  wood: { tex: 'wood', seed: 5, tint: 0xffffff },
  metal: { tex: 'metal', seed: 9, tint: 0xffffff },
  dirt: { tex: 'dirt', seed: 3, tint: 0xffffff },
  brick: { tex: 'brick', seed: 7, tint: 0xffffff },
  // greybox tints (stone texture, color-coded for the gym)
  grey: { tex: 'stone', seed: 21, tint: 0xd0d0d0 },
  orange: { tex: 'stone', seed: 21, tint: 0xf0a050 },
  red: { tex: 'stone', seed: 21, tint: 0xd85848 },
  blue: { tex: 'stone', seed: 21, tint: 0x7090e0 },
  green: { tex: 'stone', seed: 21, tint: 0x80c070 },
  yellow: { tex: 'stone', seed: 21, tint: 0xe8d060 },
};

const DEFAULT_MAT: MaterialDef = { tex: 'stone', seed: 11, tint: 0xc0c0c0 };
const TEXTURE_KINDS: readonly TextureKind[] = ['stone', 'brick', 'wood', 'dirt', 'metal'];

export function resolveMaterial(id: MaterialId): MaterialDef {
  const m = LEVEL_MATERIALS[id];
  if (m) return m;
  if ((TEXTURE_KINDS as readonly string[]).includes(id)) return { tex: id as TextureKind, seed: 1, tint: 0xffffff };
  return DEFAULT_MAT;
}

/** Max collider step for ramps, m. */
export const RAMP_STEP = 0.1;
const CHUNK = 32;

export interface BuiltLevel {
  group: THREE.Group;
  colliders: Collider[];
  /** Ops the builder doesn't handle yet (entities/props) — for later systems. */
  pending: LevelOp[];
  dispose(): void;
}

export interface BuildOptions {
  /** Texture size for level materials (32 or 64). Default 32. */
  texSize?: number;
  /** Receives every `spawn` op (M3: AiSystem.spawnOp). Without it spawn ops go to `pending`. */
  onSpawn?: (op: Extract<LevelOp, { op: 'spawn' }>) => void;
  /** M4 world entities. Each receives its op; without a callback the op goes to `pending`. */
  onItem?: (op: Extract<LevelOp, { op: 'item' }>) => void;
  onCache?: (op: Extract<LevelOp, { op: 'cache' }>) => void;
  onChest?: (op: Extract<LevelOp, { op: 'chest' }>) => void;
  onMimic?: (op: Extract<LevelOp, { op: 'mimic' }>) => void;
  onDoor?: (op: Extract<LevelOp, { op: 'door' }>) => void;
  /** M5 bonfires (BonfireSystem.addBonfire). */
  onBonfire?: (op: Extract<LevelOp, { op: 'bonfire' }>) => void;
  /** M5: dresses 'construction' barriers (pylons/sawhorses/sign via PropsBuilder); replaces the flat yellow box. */
  onBarrier?: (op: Extract<LevelOp, { op: 'barrier' }>) => void;
}

/** Record an area via the DSL, then build it. */
export function buildArea(area: AreaDef, world: CollisionWorld, opts?: BuildOptions): BuiltLevel {
  const dsl = createLevelDsl();
  area.build(dsl);
  return buildLevel(dsl.ops, world, opts);
}

/** On any build error the colliders already added to `world` are removed before rethrowing. */
export function buildLevel(ops: readonly LevelOp[], world: CollisionWorld, opts: BuildOptions = {}): BuiltLevel {
  const colliders: Collider[] = [];
  try {
    return buildLevelInner(ops, world, opts, colliders);
  } catch (e) {
    for (const c of colliders) world.remove(c.id);
    throw e;
  }
}

function buildLevelInner(ops: readonly LevelOp[], world: CollisionWorld, opts: BuildOptions, colliders: Collider[]): BuiltLevel {
  const texSize = opts.texSize ?? 32;
  const group = new THREE.Group();
  group.name = 'level';
  const pending: LevelOp[] = [];
  /** key → { mat, geos } */
  const buckets = new Map<string, { mat: MaterialDef; geos: THREE.BufferGeometry[] }>();
  const fogGeos: THREE.BufferGeometry[] = [];

  const addGeo = (mat: MaterialDef, geo: THREE.BufferGeometry, cx: number, cz: number) => {
    paint(geo, mat.tint);
    const k = `${mat.tex}:${mat.seed}:${Math.floor(cx / CHUNK)}:${Math.floor(cz / CHUNK)}`;
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { mat, geos: [] }));
    b.geos.push(geo);
  };
  const addCollider = (x: number, y: number, z: number, w: number, h: number, d: number, layer: number, tag?: string) => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    colliders.push(world.add({ aabb: aabbFromFootprint(x, y, z, w, h, d), layer, solid: true, tag }));
  };
  const boxGeo = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = makeBoxGeometry(w, h, d, { tile: 2 });
    g.translate(x, y + h / 2, z);
    return g;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'box': {
        const mat = resolveMaterial(op.mat);
        addGeo(mat, boxGeo(op.x, op.y, op.z, op.w, op.h, op.d), op.x, op.z);
        addCollider(op.x, op.y, op.z, op.w, op.h, op.d, Layer.World, op.mat);
        break;
      }
      case 'stairs': {
        const mat = resolveMaterial(op.mat);
        for (const s of stepSlabs(op.x, op.y, op.z, op.w, op.h, op.d, op.dir, op.steps)) {
          addGeo(mat, boxGeo(s.x, s.y, s.z, s.w, s.h, s.d), op.x, op.z);
          addCollider(s.x, s.y, s.z, s.w, s.h, s.d, Layer.World, op.mat);
        }
        break;
      }
      case 'ramp': {
        const mat = resolveMaterial(op.mat);
        addGeo(mat, makeWedgeGeometry(op.x, op.y, op.z, op.w, op.h, op.d, op.dir), op.x, op.z);
        const run = op.dir === '+x' || op.dir === '-x' ? op.w : op.d;
        const slopeDeg = (Math.atan2(op.h, run) * 180) / Math.PI;
        if (slopeDeg > PLAYER_TUNING.slopeLimitDeg) {
          // Too steep to walk: stepped slabs would be a climbable staircase. Solid block instead.
          console.warn(
            `[level] ramp at (${op.x}, ${op.y}, ${op.z}) is ${slopeDeg.toFixed(1)}° (> ${PLAYER_TUNING.slopeLimitDeg}° walkable limit): ` +
              `built as a solid block, not walkable steps. Author it as stairs/walls or lengthen the run.`,
          );
          addCollider(op.x, op.y, op.z, op.w, op.h, op.d, Layer.World, op.mat);
          break;
        }
        const n = Math.max(1, Math.ceil(op.h / RAMP_STEP - 1e-6));
        for (const s of stepSlabs(op.x, op.y, op.z, op.w, op.h, op.d, op.dir, n, true)) addCollider(s.x, s.y, s.z, s.w, s.h, s.d, Layer.World, op.mat);
        break;
      }
      case 'barrier': {
        addCollider(op.x, op.y, op.z, op.w, op.h, op.d, Layer.Barrier, op.id ?? `barrier:${op.kind}`);
        if (op.kind === 'construction') {
          if (opts.onBarrier) opts.onBarrier(op);
          else addGeo(resolveMaterial('yellow'), boxGeo(op.x, op.y, op.z, op.w, op.h, op.d), op.x, op.z);
        } else if (op.kind === 'rubble') addGeo(resolveMaterial('stone'), boxGeo(op.x, op.y, op.z, op.w, op.h, op.d), op.x, op.z);
        else if (op.kind === 'fogWall') fogGeos.push(boxGeo(op.x, op.y, op.z, op.w, op.h, op.d));
        break;
      }
      case 'spawn':
        if (opts.onSpawn) opts.onSpawn(op);
        else pending.push(op);
        break;
      case 'item':
        if (opts.onItem) opts.onItem(op);
        else pending.push(op);
        break;
      case 'cache':
        if (opts.onCache) opts.onCache(op);
        else pending.push(op);
        break;
      case 'chest':
        if (opts.onChest) opts.onChest(op);
        else pending.push(op);
        break;
      case 'mimic':
        if (opts.onMimic) opts.onMimic(op);
        else pending.push(op);
        break;
      case 'door':
        if (opts.onDoor) opts.onDoor(op);
        else pending.push(op);
        break;
      case 'bonfire':
        if (opts.onBonfire) opts.onBonfire(op);
        else pending.push(op);
        break;
    }
  }

  const materials: THREE.Material[] = [];
  const matCache = new Map<string, THREE.Material>();
  for (const [k, b] of buckets) {
    const mk = `${b.mat.tex}:${b.mat.seed}`;
    let m = matCache.get(mk);
    if (!m) {
      m = makePs1Material({ map: getTexture(b.mat.tex, texSize, b.mat.seed), vertexColors: true });
      matCache.set(mk, m);
      materials.push(m);
    }
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) {
      console.warn(`[level] mergeGeometries returned null for bucket "${k}" (${b.geos.length} geometries; mismatched attributes?): its visuals are missing.`);
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = `level:${k}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  if (fogGeos.length) {
    const merged = mergeGeometries(fogGeos, false);
    for (const g of fogGeos) g.dispose();
    if (!merged) console.warn(`[level] mergeGeometries returned null for fog walls (${fogGeos.length} geometries): fog walls are invisible.`);
    else {
      const m = makePs1Material({ lit: false, color: 0xe8e8f0, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      materials.push(m);
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = 'level:fogWalls';
      group.add(mesh);
    }
  }
  group.updateMatrixWorld(true);

  return {
    group,
    colliders,
    pending,
    dispose() {
      for (const c of colliders) world.remove(c.id);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of materials) m.dispose();
      group.removeFromParent();
    },
  };
}

interface Slab {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** Split a footprint into `n` solid slabs (base → top) rising toward `dir`. */
function stepSlabs(x: number, y: number, z: number, w: number, h: number, d: number, dir: Facing, n: number, ramp = false): Slab[] {
  const out: Slab[] = [];
  const alongX = dir === '+x' || dir === '-x';
  const run = alongX ? w : d;
  const sign = dir === '+x' || dir === '+z' ? 1 : -1;
  const lo = (alongX ? x : z) - (sign * run) / 2; // low edge coordinate
  const seg = run / n;
  for (let i = 0; i < n; i++) {
    // ramp slabs: top = wedge height at the slab's middle (within RAMP_STEP/2 of the surface).
    const top = ramp ? (h * (i + 0.5)) / n : (h * (i + 1)) / n;
    const a = lo + sign * seg * i;
    const b = lo + sign * seg * (i + 1);
    const c = (a + b) / 2;
    out.push(alongX ? { x: c, y, z, w: seg, h: top, d } : { x, y, z: c, w, h: top, d: seg });
  }
  return out;
}

/** Wedge rising toward `dir`, footprint (x,z) center, bottom y. Slope face subdivided (affine). */
export function makeWedgeGeometry(x: number, y: number, z: number, w: number, h: number, d: number, dir: Facing): THREE.BufferGeometry {
  // Build in local space rising toward -Z: width W along x, run L along z.
  const alongX = dir === '+x' || dir === '-x';
  const W = alongX ? d : w;
  const L = alongX ? w : d;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tile = 2;
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    e: [number, number, number],
    n: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
    ue: [number, number],
  ) => {
    const base = pos.length / 3;
    for (const [p, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
      [e, ue],
    ] as const) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(n[0], n[1], n[2]);
      uv.push(t[0] / tile, t[1] / tile);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const hw = W / 2;
  const hl = L / 2;
  const slopeY = (zz: number) => (h * (hl - zz)) / L; // 0 at +hl, h at -hl
  const slen = Math.hypot(L, h);
  const sn: [number, number, number] = [0, L / slen, h / slen];
  const nx = Math.max(1, Math.ceil(W / 2));
  const nz = Math.max(1, Math.ceil(slen / 2));
  // slope face grid (CCW seen from above/outside)
  for (let i = 0; i < nx; i++) {
    const x0 = -hw + (W * i) / nx;
    const x1 = -hw + (W * (i + 1)) / nx;
    for (let j = 0; j < nz; j++) {
      const z0 = hl - (L * j) / nz;
      const z1 = hl - (L * (j + 1)) / nz;
      const v0 = (slen * j) / nz;
      const v1 = (slen * (j + 1)) / nz;
      quad([x0, slopeY(z0), z0], [x1, slopeY(z0), z0], [x1, slopeY(z1), z1], [x0, slopeY(z1), z1], sn, [x0 + hw, v0], [x1 + hw, v0], [x1 + hw, v1], [x0 + hw, v1]);
    }
  }
  // back face (high end, z = -hl, faces -z)
  quad([hw, 0, -hl], [-hw, 0, -hl], [-hw, h, -hl], [hw, h, -hl], [0, 0, -1], [0, 0], [W, 0], [W, h], [0, h]);
  // sides as strips (x = ±hw)
  const ns = Math.max(1, Math.ceil(L / 2));
  for (let j = 0; j < ns; j++) {
    const z0 = hl - (L * j) / ns;
    const z1 = hl - (L * (j + 1)) / ns;
    const y0 = slopeY(z0);
    const y1 = slopeY(z1);
    // +x side (faces +x): order so normal = +x
    quad([hw, 0, z0], [hw, 0, z1], [hw, y1, z1], [hw, y0, z0], [1, 0, 0], [hl - z0, 0], [hl - z1, 0], [hl - z1, y1], [hl - z0, y0]);
    // -x side
    quad([-hw, 0, z1], [-hw, 0, z0], [-hw, y0, z0], [-hw, y1, z1], [-1, 0, 0], [hl - z1, 0], [hl - z0, 0], [hl - z0, y0], [hl - z1, y1]);
  }
  // bottom
  quad([-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl], [0, -1, 0], [0, 0], [W, 0], [W, L], [0, L]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const rot = dir === '-z' ? 0 : dir === '+z' ? Math.PI : dir === '+x' ? -Math.PI / 2 : Math.PI / 2;
  if (rot !== 0) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

/** Vertex-color tint (merged meshes share one material per texture). */
function paint(geo: THREE.BufferGeometry, tint: number): void {
  const c = new THREE.Color(tint);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
