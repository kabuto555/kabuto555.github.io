// Black Knight (mini-boss) box model: ~2.3 m, dark plate with pale trim, horned helm, halberd in the
// right hand. Same bone layout as HumanoidRig so the HollowView pose channels drive it; geometry is
// merged per bone, cached at module level and shared by every instance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOB_LIFT, createBlobShadow, makeBoxGeometry, skinMeshes } from '../render';
import { enemyMaterials, type HumanoidRig } from './models';

type Part = readonly [w: number, h: number, d: number, x: number, y: number, z: number, color: number, tiltX?: number];

const PLATE = 0x2a2c34;
const PLATE_D = 0x1a1b20;
const PLATE_L = 0x3c3f4a;
const TRIM = 0xc4c0b2; // pale trim
const CLOTH = 0x3a1618; // faded crimson cape / tabard
const STEEL = 0x8e9096;
const SHAFT = 0x4a3220;
const SOCKET = 0x0c0c0e;

/** Hips pivot height (feet = 0); the view adds its pose offset to this. */
export const BK_HIPS_Y = 1.12;
export const BK_HEIGHT = 2.3;

// halberd axis: tilted 0.5 rad forward like the hollow's blade; d = distance along the shaft from the hand
const TILT = 0.5;
const at = (d: number): [y: number, z: number] => [-0.4 - d * Math.cos(TILT), -d * Math.sin(TILT)];
const shaftC = at(0.5);
const headC = at(1.3);
const spikeC = at(1.62);
const buttC = at(-0.5);

const PARTS = {
  pelvis: [
    [0.5, 0.2, 0.3, 0, 0, 0, PLATE_D],
    [0.52, 0.06, 0.32, 0, 0.08, 0, TRIM], // belt trim
    [0.3, 0.42, 0.04, 0, -0.26, -0.17, CLOTH, 0.06], // tabard front
    [0.34, 0.5, 0.04, 0, -0.26, 0.17, CLOTH, -0.06], // cape tail
  ],
  // spine pivot at hips + 0.1; shoulders y 0.5, head ~0.9
  torso: [
    [0.46, 0.22, 0.3, 0, 0.1, 0, PLATE_D], // abdomen plates
    [0.7, 0.48, 0.38, 0, 0.45, 0, PLATE], // breastplate
    [0.72, 0.05, 0.4, 0, 0.7, 0, TRIM], // collar trim
    [0.06, 0.4, 0.04, 0, 0.45, -0.2, TRIM], // chest ridge
    [0.28, 0.22, 0.34, -0.5, 0.58, 0, PLATE_L], // left pauldron
    [0.3, 0.05, 0.36, -0.5, 0.7, 0, TRIM],
    [0.28, 0.22, 0.34, 0.5, 0.58, 0, PLATE_L], // right pauldron
    [0.3, 0.05, 0.36, 0.5, 0.7, 0, TRIM],
    [0.62, 0.8, 0.05, 0, 0.3, 0.24, CLOTH], // back cape
    [0.14, 0.12, 0.14, 0, 0.78, 0.04, PLATE_D], // neck
    // horned helm (head centre y ~0.92)
    [0.34, 0.34, 0.36, 0, 0.94, 0.02, PLATE],
    [0.36, 0.05, 0.38, 0, 1.12, 0.02, TRIM], // brow band
    [0.07, 0.12, 0.3, 0, 1.2, 0.02, PLATE_L], // crest
    [0.3, 0.08, 0.04, 0, 0.9, -0.17, SOCKET], // visor slit
    [0.06, 0.18, 0.05, 0, 0.82, -0.18, PLATE_D], // nose guard
    [0.07, 0.1, 0.07, -0.21, 1.08, 0.02, TRIM], // left horn (stepped out + up)
    [0.07, 0.1, 0.07, -0.29, 1.17, 0.02, TRIM],
    [0.05, 0.08, 0.05, -0.34, 1.26, 0.02, TRIM],
    [0.07, 0.1, 0.07, 0.21, 1.08, 0.02, TRIM], // right horn
    [0.07, 0.1, 0.07, 0.29, 1.17, 0.02, TRIM],
    [0.05, 0.08, 0.05, 0.34, 1.26, 0.02, TRIM],
  ],
  upperArm: [
    [0.17, 0.42, 0.17, 0, -0.21, 0, PLATE],
    [0.19, 0.06, 0.19, 0, -0.38, 0, TRIM], // elbow trim
  ],
  foreArmL: [
    [0.15, 0.4, 0.15, 0, -0.2, 0, PLATE_L],
    [0.17, 0.14, 0.17, 0, -0.44, 0, PLATE_D], // gauntlet
  ],
  foreArmR: [
    [0.15, 0.4, 0.15, 0, -0.2, 0, PLATE_L],
    [0.17, 0.14, 0.17, 0, -0.44, 0, PLATE_D],
    [0.05, 1.9, 0.05, 0, shaftC[0], shaftC[1], SHAFT, TILT], // halberd shaft
    [0.34, 0.34, 0.04, -0.17, headC[0], headC[1], STEEL, TILT], // axe blade (out to the side)
    [0.08, 0.34, 0.08, 0, headC[0], headC[1], PLATE_L, TILT], // socket
    [0.05, 0.36, 0.05, 0, spikeC[0], spikeC[1], STEEL, TILT], // top spike
    [0.07, 0.1, 0.07, 0, buttC[0], buttC[1], TRIM, TILT], // butt cap
  ],
  thigh: [
    [0.21, 0.55, 0.21, 0, -0.27, 0, PLATE],
    [0.23, 0.06, 0.23, 0, -0.52, 0, TRIM], // knee trim
  ],
  shin: [
    [0.19, 0.55, 0.19, 0, -0.27, 0, PLATE_L],
    [0.21, 0.1, 0.34, 0, -0.5, -0.05, PLATE_D], // boot
  ],
  eyes: [
    [0.045, 0.03, 0.02, -0.07, 0.92, -0.185, 0xffffff],
    [0.045, 0.03, 0.02, 0.07, 0.92, -0.185, 0xffffff],
  ],
} satisfies Record<string, readonly Part[]>;

type Key = keyof typeof PARTS;
let geos: Record<Key, THREE.BufferGeometry> | null = null;

function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const nrm = g.getAttribute('normal');
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = nrm.getY(i) < -0.5 ? 0.7 : nrm.getY(i) > 0.5 ? 1.12 : 1;
    col[i * 3] = Math.min(1, c.r * s);
    col[i * 3 + 1] = Math.min(1, c.g * s);
    col[i * 3 + 2] = Math.min(1, c.b * s);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function build(parts: readonly Part[]): THREE.BufferGeometry {
  const list = parts.map(([w, h, d, x, y, z, color, tilt]) => {
    const g = makeBoxGeometry(w, h, d, { tile: 0.5, maxSegment: 0 });
    g.clearGroups();
    if (tilt) g.rotateX(tilt);
    g.translate(x, y, z);
    paint(g, color);
    return g;
  });
  const merged = mergeGeometries(list, false)!;
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function geometry(): Record<Key, THREE.BufferGeometry> {
  if (geos) return geos;
  const out = {} as Record<Key, THREE.BufferGeometry>;
  for (const k of Object.keys(PARTS) as Key[]) out[k] = build(PARTS[k]);
  geos = out;
  return out;
}

/** 2 draw calls (skinned body + eyes) + instanced blob shadow. */
export function createBlackKnightRig(): HumanoidRig {
  const G = geometry();
  const M = enemyMaterials();
  const meshes: THREE.Mesh[] = [];
  const all: THREE.Mesh[] = [];
  const group = (parent: THREE.Object3D, x: number, y: number, z: number, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material = M.body, flash = true) => {
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    all.push(m);
    if (flash) meshes.push(m);
  };
  const root = new THREE.Group();
  root.name = 'blackKnight';
  root.scale.setScalar(0.92); // authored tall (horn tips ~2.5 m) -> ~2.3 m
  const body = group(root, 0, 0, 0, 'body');
  const hips = group(body, 0, BK_HIPS_Y, 0, 'hips');
  mesh(hips, G.pelvis);
  const spine = group(hips, 0, 0.1, 0, 'spine');
  mesh(spine, G.torso);
  mesh(spine, G.eyes, M.eyes, false);
  const shL = group(spine, -0.48, 0.5, 0, 'shL');
  mesh(shL, G.upperArm);
  const elL = group(shL, 0, -0.42, 0, 'elL');
  mesh(elL, G.foreArmL);
  const shR = group(spine, 0.48, 0.5, 0, 'shR');
  mesh(shR, G.upperArm);
  const elR = group(shR, 0, -0.42, 0, 'elR');
  mesh(elR, G.foreArmR);
  const hipL = group(hips, -0.16, -0.02, 0, 'hipL');
  mesh(hipL, G.thigh);
  const kneeL = group(hipL, 0, -0.55, 0, 'kneeL');
  mesh(kneeL, G.shin);
  const hipR = group(hips, 0.16, -0.02, 0, 'hipR');
  mesh(hipR, G.thigh);
  const kneeR = group(hipR, 0, -0.55, 0, 'kneeR');
  mesh(kneeR, G.shin);
  const skinned = skinMeshes(root, all, 'blackKnight');
  if (skinned.length) {
    meshes.length = 0;
    for (const s of skinned) if (s.material === M.body) meshes.push(s.mesh);
  }
  const shadow = createBlobShadow(0.75);
  shadow.position.y = BLOB_LIFT;
  root.add(shadow);
  return { root, body, hips, spine, shL, elL, shR, elR, hipL, kneeL, hipR, kneeR, meshes, shadow };
}
