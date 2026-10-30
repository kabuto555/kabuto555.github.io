// Box-built low-poly enemy meshes (PS1 style). Geometry is merged per bone and cached at module
// level; materials are shared across every instance (hit flash swaps to a shared flash material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { makeBoxGeometry, makePs1Material, toPs1Texture, createBlobShadow, BLOB_LIFT, skinMeshes } from '../render';

/** One box part: size, center (bone-local), vertex tint. Optional X tilt (rad) about its center. */
type Part = readonly [w: number, h: number, d: number, x: number, y: number, z: number, color: number, tiltX?: number];

function paint(geo: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  // slight per-face shade variation (fake AO): darker on the -y faces
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i++) {
    const shade = nrm.getY(i) < -0.5 ? 0.7 : nrm.getY(i) > 0.5 ? 1.08 : 1;
    col[i * 3] = Math.min(1, c.r * shade);
    col[i * 3 + 1] = Math.min(1, c.g * shade);
    col[i * 3 + 2] = Math.min(1, c.b * shade);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function buildPart(parts: readonly Part[]): THREE.BufferGeometry {
  const geos = parts.map(([w, h, d, x, y, z, color, tilt]) => {
    const g = makeBoxGeometry(w, h, d, { tile: 0.5, maxSegment: 0 });
    g.clearGroups();
    if (tilt) g.rotateX(tilt);
    g.translate(x, y, z);
    paint(g, color);
    return g;
  });
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** 32px desiccated-skin texture: mottled grey-brown, dark creases. Tinted by vertex colors. */
function hollowSkinCanvas(size = 32, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = new Rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // value noise-ish: blotches + vertical sinew streaks
      const blot = Math.sin(x * 0.7 + seed) * Math.cos(y * 0.5) * 0.08;
      const streak = Math.sin(x * 2.1 + Math.sin(y * 0.3) * 2) > 0.85 ? -0.18 : 0;
      const v = 0.78 + blot + streak + (rng.next() - 0.5) * 0.16;
      const o = (y * size + x) * 4;
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[o] = g;
      img.data[o + 1] = Math.round(g * 0.96);
      img.data[o + 2] = Math.round(g * 0.9);
      img.data[o + 3] = 255;
    }
  }
  // a few dark cracks
  for (let k = 0; k < 6; k++) {
    let x = Math.floor(rng.next() * size);
    let y = Math.floor(rng.next() * size);
    for (let s = 0; s < 8; s++) {
      const o = (((y + size) % size) * size + ((x + size) % size)) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 70;
      x += rng.next() < 0.5 ? -1 : 1;
      y += 1;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ shared materials

export interface EnemyMaterials {
  body: THREE.Material;
  flashHit: THREE.Material;
  flashBlock: THREE.Material;
  flashStagger: THREE.Material;
  eyes: THREE.Material;
}

let mats: EnemyMaterials | null = null;

export function enemyMaterials(): EnemyMaterials {
  if (mats) return mats;
  const tex = toPs1Texture(hollowSkinCanvas());
  tex.name = 'hollowSkin';
  const mk = (emissive: number) => makePs1Material({ map: tex, vertexColors: true, emissive });
  mats = {
    body: mk(0x000000),
    flashHit: mk(0x902010),
    flashBlock: mk(0x2050a0),
    flashStagger: mk(0xb0a070),
    eyes: makePs1Material({ lit: false, color: 0xffb040 }),
  };
  return mats;
}

// ------------------------------------------------------------------ humanoid rig

/** Bone pivots of a box humanoid. Rotations are driven by the archetype's animator. */
export interface HumanoidRig {
  root: THREE.Group; // feet, yaw
  body: THREE.Group; // feet pivot: death fall / stagger lean
  hips: THREE.Group;
  spine: THREE.Group;
  shL: THREE.Group;
  elL: THREE.Group;
  shR: THREE.Group;
  elR: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  /** Optional shield pivot (soldier), child of the spine; animated by the view. */
  shield?: THREE.Group;
  /** Optional held-weapon pivot (crossbow), child of the spine; animated by the view. */
  weapon?: THREE.Group;
  /** Optional lit-bottle glow (firebomb), child of the right forearm; the view toggles it. */
  glow?: THREE.Mesh;
  /** Meshes whose material flashes on hit. */
  meshes: THREE.Mesh[];
  shadow: THREE.Mesh;
}

// Hollow palette (vertex tints over the skin texture)
const SKIN = 0x8c8272;
const SKIN_D = 0x6c6254;
const RAG = 0x4e3e2c;
const RAG_D = 0x3a2e22;
const BELT = 0x2a221a;
const HAIR = 0x2c2622;
const BLADE = 0xa8a8a0;
const RUST = 0x7a5232;
const GRIP = 0x3a2818;
const SOCKET = 0x1c1814;

/** Hollow sword-holder geometry, bone-local. Hips pivot at y = 0.92 (feet = 0). */
const HOLLOW_PARTS = {
  pelvis: [
    [0.32, 0.16, 0.2, 0, 0, 0, RAG_D],
    [0.34, 0.06, 0.22, 0, 0.06, 0, BELT], // rope belt
    [0.26, 0.3, 0.04, 0.02, -0.17, -0.11, RAG, 0.08], // front loincloth flap
    [0.22, 0.24, 0.04, -0.03, -0.15, 0.11, RAG_D, -0.06], // back flap
  ],
  // spine pivot at hips + 0.08; head set back (+z) so the hunch keeps it over the hit sphere
  torso: [
    [0.28, 0.16, 0.17, 0, 0.06, 0, SKIN_D], // gaunt belly
    [0.4, 0.34, 0.22, 0, 0.3, 0, SKIN], // chest
    [0.42, 0.12, 0.24, 0, 0.42, 0.01, RAG], // tattered shoulder wrap
    [0.16, 0.18, 0.04, 0.1, 0.25, -0.12, RAG_D, 0.15], // hanging rag strip
    [0.09, 0.1, 0.09, 0, 0.53, 0.06, SKIN_D], // neck
    [0.21, 0.23, 0.21, 0, 0.66, 0.08, SKIN], // skull
    [0.22, 0.06, 0.22, 0, 0.79, 0.09, HAIR], // scalp patches
    [0.17, 0.06, 0.06, 0, 0.56, -0.01, SKIN_D], // sunken jaw
    [0.16, 0.05, 0.03, 0, 0.68, -0.025, SOCKET], // eye sockets band
  ],
  upperArm: [[0.1, 0.32, 0.1, 0, -0.16, 0, SKIN]],
  foreArmL: [
    [0.085, 0.3, 0.085, 0, -0.15, 0, SKIN_D],
    [0.095, 0.1, 0.1, 0, -0.34, 0, SKIN_D], // hand
  ],
  // right forearm + hand + sword (blade continues the forearm axis, tilted 30° forward)
  foreArmR: [
    [0.085, 0.3, 0.085, 0, -0.15, 0, SKIN_D],
    [0.1, 0.1, 0.1, 0, -0.34, 0, SKIN_D],
    [0.035, 0.16, 0.035, 0, -0.34, 0, GRIP, 0.52], // grip
    [0.2, 0.035, 0.05, 0, -0.392, -0.03, RUST, 0.52], // crossguard
    [0.07, 0.84, 0.018, 0, -0.774, -0.249, BLADE, 0.52], // blade
    [0.05, 0.12, 0.02, 0, -1.19, -0.487, RUST, 0.52], // chipped rusty tip
  ],
  thigh: [[0.13, 0.42, 0.13, 0, -0.21, 0, SKIN_D]],
  shin: [
    [0.11, 0.42, 0.11, 0, -0.21, 0, SKIN],
    [0.13, 0.12, 0.14, 0, -0.33, 0, RAG_D], // foot wraps
    [0.12, 0.06, 0.2, 0, -0.45, -0.04, RAG_D], // foot
  ],
  eyes: [
    [0.035, 0.03, 0.02, -0.05, 0.68, -0.04, 0xffffff],
    [0.035, 0.03, 0.02, 0.05, 0.68, -0.04, 0xffffff],
  ],
} satisfies Record<string, readonly Part[]>;

type PartKey = keyof typeof HOLLOW_PARTS;
type PartTable = Record<PartKey, readonly Part[]> & { shield?: readonly Part[]; weapon?: readonly Part[] };
const geoCache = new Map<string, Record<string, THREE.BufferGeometry>>();

function geometryFor(name: string, table: PartTable): Record<string, THREE.BufferGeometry> {
  const hit = geoCache.get(name);
  if (hit) return hit;
  const out: Record<string, THREE.BufferGeometry> = {};
  for (const k of Object.keys(table)) out[k] = buildPart((table as Record<string, readonly Part[]>)[k]!);
  geoCache.set(name, out);
  return out;
}

/** 2 draw calls (skinned body + eyes); blob shadow is instanced. Geometry/materials are shared by all hollows. */
export function createHollowRig(): HumanoidRig {
  return buildRig('hollow', HOLLOW_PARTS, false);
}

// ------------------------------------------------------------------ shield hollow soldier

const STEEL = 0x8a8c90;
const STEEL_D = 0x5c5e64;
const MAIL = 0x6a6c70;
const MAIL_D = 0x4a4c52;
const WOOD = 0x6a4a2a;
const WOOD_D = 0x4e341c;
const TABARD = 0x5a2a22;

/**
 * Hollow Soldier: stockier, rusted helm + chainmail, short sword held low for thrusts. The kite
 * shield is a separate pivot on the spine (never on the arm) so it always reads as "front".
 */
const SOLDIER_PARTS = {
  ...HOLLOW_PARTS,
  torso: [
    [0.3, 0.17, 0.19, 0, 0.06, 0, MAIL_D], // belly mail
    [0.46, 0.36, 0.25, 0, 0.3, 0, MAIL], // chainmail chest
    [0.4, 0.2, 0.01, 0, 0.26, -0.13, TABARD], // faded tabard front
    [0.5, 0.11, 0.27, 0, 0.45, 0.01, STEEL_D], // pauldron bar
    [0.12, 0.1, 0.12, -0.27, 0.45, 0, STEEL], // left pauldron
    [0.12, 0.1, 0.12, 0.27, 0.45, 0, STEEL], // right pauldron
    [0.1, 0.1, 0.1, 0, 0.53, 0.06, SKIN_D], // neck
    [0.24, 0.17, 0.24, 0, 0.64, 0.08, STEEL], // helm dome
    [0.25, 0.06, 0.25, 0, 0.74, 0.08, STEEL_D], // helm crown
    [0.05, 0.1, 0.05, 0, 0.8, 0.08, RUST], // crest stub
    [0.24, 0.1, 0.03, 0, 0.58, -0.04, STEEL_D], // visor / cheek guard
    [0.18, 0.03, 0.03, 0, 0.645, -0.045, SOCKET], // eye slit
  ],
  eyes: [
    [0.035, 0.025, 0.02, -0.05, 0.645, -0.05, 0xffffff],
    [0.035, 0.025, 0.02, 0.05, 0.645, -0.05, 0xffffff],
  ],
  // short sword (blade follows the forearm axis, tilted 30° like the hollow's)
  foreArmR: [
    [0.09, 0.3, 0.09, 0, -0.15, 0, MAIL_D],
    [0.1, 0.1, 0.1, 0, -0.34, 0, SKIN_D],
    [0.035, 0.16, 0.035, 0, -0.34, 0, GRIP, 0.52],
    [0.22, 0.04, 0.05, 0, -0.392, -0.03, STEEL_D, 0.52],
    [0.06, 0.62, 0.018, 0, -0.69, -0.2, BLADE, 0.52],
    [0.04, 0.1, 0.02, 0, -1.03, -0.4, RUST, 0.52],
  ],
  foreArmL: [
    [0.09, 0.3, 0.09, 0, -0.15, 0, MAIL_D],
    [0.1, 0.1, 0.1, 0, -0.34, 0, STEEL_D], // gauntlet
  ],
  shield: [
    [0.52, 0.7, 0.06, 0, 0, 0, WOOD], // board
    [0.56, 0.05, 0.08, 0, 0.36, 0, STEEL_D], // top rim
    [0.56, 0.05, 0.08, 0, -0.36, 0, STEEL_D], // bottom rim
    [0.05, 0.7, 0.08, -0.27, 0, 0, STEEL_D], // left rim
    [0.05, 0.7, 0.08, 0.27, 0, 0, STEEL_D], // right rim
    [0.04, 0.66, 0.075, 0, 0, 0, WOOD_D], // center plank seam
    [0.2, 0.2, 0.05, 0, 0.05, -0.05, STEEL], // boss
    [0.08, 0.08, 0.05, 0, 0.05, -0.09, RUST], // boss spike
  ],
} satisfies Record<string, readonly Part[]>;

/** Shield pivot rest position on the spine (view animates offsets on top). */
export const SHIELD_BASE = { x: -0.19, y: 0.28, z: -0.24 };

export function createSoldierRig(): HumanoidRig {
  return buildRig('soldier', SOLDIER_PARTS, true);
}

function buildRig(name: string, table: PartTable, withShield: boolean, decorate?: (rig: HumanoidRig) => void): HumanoidRig {
  const G = geometryFor(name, table) as Record<PartKey | 'shield' | 'weapon', THREE.BufferGeometry>;
  const M = enemyMaterials();
  const meshes: THREE.Mesh[] = [];
  const all: THREE.Mesh[] = [];
  const group = (parent: THREE.Object3D, x: number, y: number, z: number, gname: string) => {
    const g = new THREE.Group();
    g.name = gname;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = M.body, flash = true) => {
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    all.push(m);
    if (flash) meshes.push(m);
    return m;
  };
  const root = new THREE.Group();
  root.name = name;
  const body = group(root, 0, 0, 0, 'body');
  const hips = group(body, 0, 0.92, 0, 'hips');
  mesh(hips, G.pelvis);
  const spine = group(hips, 0, 0.08, 0, 'spine');
  mesh(spine, G.torso);
  mesh(spine, G.eyes, M.eyes, false);
  const shL = group(spine, -0.25, 0.4, 0, 'shL');
  mesh(shL, G.upperArm);
  const elL = group(shL, 0, -0.32, 0, 'elL');
  mesh(elL, G.foreArmL);
  const shR = group(spine, 0.25, 0.4, 0, 'shR');
  mesh(shR, G.upperArm);
  const elR = group(shR, 0, -0.32, 0, 'elR');
  mesh(elR, G.foreArmR);
  const hipL = group(hips, -0.1, -0.02, 0, 'hipL');
  mesh(hipL, G.thigh);
  const kneeL = group(hipL, 0, -0.42, 0, 'kneeL');
  mesh(kneeL, G.shin);
  const hipR = group(hips, 0.1, -0.02, 0, 'hipR');
  mesh(hipR, G.thigh);
  const kneeR = group(hipR, 0, -0.42, 0, 'kneeR');
  mesh(kneeR, G.shin);
  let shield: THREE.Group | undefined;
  if (withShield) {
    shield = group(spine, SHIELD_BASE.x, SHIELD_BASE.y, SHIELD_BASE.z, 'shield');
    mesh(shield, G.shield);
  }
  const shadow = createBlobShadow(withShield ? 0.5 : 0.42);
  shadow.position.y = BLOB_LIFT;
  root.add(shadow);
  const rig: HumanoidRig = { root, body, hips, spine, shL, elL, shR, elR, hipL, kneeL, hipR, kneeR, shield, meshes, shadow };
  if (table.weapon) {
    rig.weapon = group(spine, WEAPON_BASE.x, WEAPON_BASE.y, WEAPON_BASE.z, 'weapon');
    mesh(rig.weapon, G.weapon);
  }
  // Collapse the ~13 per-bone meshes into one SkinnedMesh per material (body + eyes): 2 draw calls per enemy.
  const skinned = skinMeshes(root, all, name);
  if (skinned.length) {
    meshes.length = 0;
    for (const s of skinned) if (s.material === M.body) meshes.push(s.mesh);
  }
  decorate?.(rig);
  return rig;
}

// ------------------------------------------------------------------ firebomb hollow

const GLASS = 0x5a7a3a;
const GLASS_D = 0x3c5428;
const LEATHER = 0x5a3a22;
const SOOT = 0x2a2420;
const LEATHER_D = 0x3e281a;
const SCARF = 0x9a3a1a;
const WICK = 0xd8b070;

/**
 * Firebomb hollow: hooded + scarf, hunched under a big satchel of bottles (necks poking out of the
 * pack = the silhouette), a lit bottle in the right hand that the windup raises overhead.
 */
const FIREBOMB_PARTS = {
  ...HOLLOW_PARTS,
  torso: [
    ...HOLLOW_PARTS.torso.slice(0, 6), // belly, chest, wrap, rag strip, neck, skull
    [0.27, 0.16, 0.27, 0, 0.74, 0.09, SOOT], // soot hood
    [0.3, 0.08, 0.3, 0, 0.64, 0.09, SCARF], // scarf
    [0.17, 0.06, 0.06, 0, 0.56, -0.01, SKIN_D], // jaw
    [0.4, 0.34, 0.22, 0, 0.3, 0.2, LEATHER], // big satchel (back, +z)
    [0.34, 0.1, 0.1, 0, 0.52, 0.24, LEATHER_D], // flap
    [0.05, 0.16, 0.05, -0.12, 0.6, 0.22, GLASS], // bottle necks in the pack
    [0.05, 0.2, 0.05, 0.02, 0.64, 0.24, GLASS_D],
    [0.05, 0.14, 0.05, 0.14, 0.58, 0.2, GLASS],
    [0.04, 0.05, 0.04, 0.02, 0.76, 0.24, WICK], // wick
    [0.5, 0.05, 0.27, 0, 0.3, 0, BELT, 0.35], // bandolier
    [0.07, 0.12, 0.07, 0.14, 0.2, -0.13, GLASS], // bandolier bottles
    [0.07, 0.12, 0.07, -0.02, 0.28, -0.13, GLASS_D],
  ],
  foreArmR: [
    [0.085, 0.3, 0.085, 0, -0.15, 0, SKIN_D],
    [0.1, 0.1, 0.1, 0, -0.34, 0, SKIN_D],
    [0.14, 0.24, 0.14, 0, -0.5, -0.02, GLASS], // bottle belly
    [0.06, 0.12, 0.06, 0, -0.68, -0.02, GLASS_D], // neck
    [0.05, 0.1, 0.05, 0, -0.78, -0.02, WICK], // rag wick
  ],
  eyes: HOLLOW_PARTS.eyes,
} satisfies Record<string, readonly Part[]>;

let glowMat: THREE.MeshBasicMaterial | null = null;
let glowGeo: THREE.BufferGeometry | null = null;

export function createFirebombRig(): HumanoidRig {
  return buildRig('firebomb', FIREBOMB_PARTS, false, (rig) => {
    glowMat ??= new THREE.MeshBasicMaterial({ color: 0xffa030 });
    glowGeo ??= makeBoxGeometry(0.15, 0.2, 0.15, { maxSegment: 0 });
    const g = new THREE.Mesh(glowGeo, glowMat);
    g.position.set(0, -0.84, -0.02);
    g.visible = false;
    rig.elR.add(g);
    rig.glow = g;
  });
}

// ------------------------------------------------------------------ crossbow hollow

const CB_WOOD = 0x6a4a2a;
const CB_WOOD_D = 0x4a3220;
const CB_STEEL = 0x8a8c90;
const STRING = 0xc8c0a8;

/** Crossbow pivot rest position on the spine (view animates it on top). */
export const WEAPON_BASE = { x: 0.06, y: 0.26, z: -0.2 };

/**
 * Crossbow hollow: wide-brimmed rotted cap + quiver of bolts on the back; the crossbow is its own
 * pivot (child of the spine, aimed along -z) so the view can raise it to the shoulder in the windup.
 */
const CROSSBOW_PARTS = {
  ...HOLLOW_PARTS,
  torso: [
    ...HOLLOW_PARTS.torso.slice(0, 7), // …scalp patches
    [0.4, 0.04, 0.4, 0, 0.77, 0.09, CB_WOOD_D], // wide brim
    [0.2, 0.1, 0.2, 0, 0.84, 0.09, CB_WOOD], // cap crown
    [0.17, 0.06, 0.06, 0, 0.56, -0.01, SKIN_D],
    [0.16, 0.05, 0.03, 0, 0.68, -0.025, SOCKET],
    [0.13, 0.5, 0.13, 0.12, 0.3, 0.2, LEATHER], // quiver
    [0.03, 0.14, 0.03, 0.09, 0.64, 0.2, CB_STEEL], // bolt tips
    [0.03, 0.14, 0.03, 0.15, 0.66, 0.2, CB_STEEL],
    [0.04, 0.05, 0.04, 0.12, 0.72, 0.2, WICK], // fletching
  ],
  eyes: HOLLOW_PARTS.eyes,
  weapon: [
    [0.07, 0.09, 0.74, 0, 0, -0.3, CB_WOOD], // stock
    [0.1, 0.12, 0.16, 0, -0.03, 0.04, CB_WOOD_D], // butt
    [0.78, 0.045, 0.06, 0, 0.02, -0.6, CB_WOOD_D], // prod (bow) centre
    [0.22, 0.045, 0.06, -0.46, 0.02, -0.52, CB_WOOD_D, 0], // limb tips swept back
    [0.22, 0.045, 0.06, 0.46, 0.02, -0.52, CB_WOOD_D, 0],
    [0.7, 0.012, 0.012, 0, 0.02, -0.46, STRING], // string
    [0.025, 0.025, 0.5, 0, 0.065, -0.4, CB_STEEL], // bolt
    [0.05, 0.04, 0.08, 0, 0.065, -0.68, CB_STEEL], // bolt head
    [0.06, 0.12, 0.05, 0, -0.07, -0.16, CB_WOOD_D], // trigger grip
  ],
} satisfies Record<string, readonly Part[]>;

export function createCrossbowRig(): HumanoidRig {
  return buildRig('crossbow', CROSSBOW_PARTS, false);
}

// ------------------------------------------------------------------ barrel hollow

const APRON = 0x6a5a40;

/** Barrel hollow: bare-chested brute in a leather apron and head-wrap, arms built for shoving. */
const BARREL_PARTS = {
  ...HOLLOW_PARTS,
  torso: [
    [0.3, 0.18, 0.2, 0, 0.06, 0, SKIN_D],
    [0.46, 0.34, 0.24, 0, 0.3, 0, SKIN], // broad bare chest
    [0.34, 0.4, 0.03, 0, 0.22, -0.13, APRON], // leather apron front
    [0.5, 0.1, 0.26, 0, 0.45, 0.01, SKIN_D], // heavy shoulders
    [0.09, 0.1, 0.09, 0, 0.53, 0.06, SKIN_D],
    [0.21, 0.23, 0.21, 0, 0.66, 0.08, SKIN],
    [0.24, 0.07, 0.24, 0, 0.74, 0.08, RUST], // head-wrap
    [0.17, 0.06, 0.06, 0, 0.56, -0.01, SKIN_D],
    [0.16, 0.05, 0.03, 0, 0.68, -0.025, SOCKET],
  ],
  eyes: HOLLOW_PARTS.eyes,
} satisfies Record<string, readonly Part[]>;

export function createBarrelHollowRig(): HumanoidRig {
  return buildRig('barrelHollow', BARREL_PARTS, false);
}

// ------------------------------------------------------------------ hazard meshes (bolt, bottle, barrel)

let hazMat: THREE.Material | null = null;
let hazGeo: { bolt: THREE.BufferGeometry; bottle: THREE.BufferGeometry } | null = null;

function hazards(): { mat: THREE.Material; bolt: THREE.BufferGeometry; bottle: THREE.BufferGeometry } {
  hazMat ??= makePs1Material({ vertexColors: true, emissive: 0x201004 });
  hazGeo ??= {
    // bolt along -z (lookAt points +z at the target, so the head is at +z)
    bolt: buildPart([
      [0.05, 0.05, 0.6, 0, 0, 0, CB_WOOD],
      [0.1, 0.1, 0.16, 0, 0, 0.38, CB_STEEL],
      [0.1, 0.02, 0.1, 0, 0, -0.3, WICK],
    ]),
    bottle: buildPart([
      [0.14, 0.2, 0.14, 0, 0, 0, GLASS],
      [0.06, 0.1, 0.06, 0, 0.15, 0, GLASS_D],
      [0.05, 0.08, 0.05, 0, 0.24, 0, 0xffb040],
    ]),
  };
  return { mat: hazMat, ...hazGeo };
}

export function createBoltMesh(): THREE.Mesh {
  const h = hazards();
  return new THREE.Mesh(h.bolt, h.mat);
}

export function createBottleMesh(): THREE.Mesh {
  const h = hazards();
  return new THREE.Mesh(h.bottle, h.mat);
}

let barrelGeo: THREE.BufferGeometry | null = null;

/** Barrel: Group (yaw, position) > Mesh (rolls about local X). 10-sided belly + 2 iron bands. */
export function createBarrelMesh(): THREE.Group {
  if (!barrelGeo) {
    const SEG = 10;
    const parts: THREE.BufferGeometry[] = [];
    const add = (rTop: number, rBot: number, h: number, y: number, c1: number, c2: number) => {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, SEG, 1);
      g.rotateZ(Math.PI / 2); // axle along X
      g.translate(0, 0, 0);
      const pos = g.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const a = new THREE.Color(c1);
      const b = new THREE.Color(c2);
      for (let i = 0; i < pos.count; i++) {
        const side = i < (SEG + 1) * 2;
        const k = side ? (i % (SEG + 1)) % 2 : 1;
        const c = k ? b : a;
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.translate(y, 0, 0);
      parts.push(g.index ? g.toNonIndexed() : g);
      g.dispose();
    };
    add(0.43, 0.5, 0.42, -0.21, 0x7a5a32, 0x5c4222);
    add(0.5, 0.43, 0.42, 0.21, 0x7a5a32, 0x5c4222);
    add(0.5, 0.5, 0.07, -0.26, 0x2c2a2a, 0x3a3836); // bands
    add(0.5, 0.5, 0.07, 0.26, 0x2c2a2a, 0x3a3836);
    barrelGeo = mergeGeometries(parts, false)!;
    barrelGeo.computeBoundingSphere();
    for (const p of parts) p.dispose();
  }
  const root = new THREE.Group();
  root.add(new THREE.Mesh(barrelGeo, hazards().mat));
  return root;
}
