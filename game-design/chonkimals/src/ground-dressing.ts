// Ground dressing — grass tufts, little flowers and small leafy sprigs scattered in
// clumps over the camp's walkable grass (the areas you actually walk and look at —
// not the far valley, the mountain or the beach). One scatter pass at load, kept
// cheap because the camp ground is one big mesh (three.js raycasts test every
// triangle, so it's hit once per clump, never per piece):
//   • a clump centre must be standable on the bots' camp map (keeps the lake, river,
//     tents, fire pad, sumo ring… clear), have nothing but ground under it (no path,
//     prop, collider or water — the small "blocker" meshes), and land on camp GRASS
//     at plateau height (so no pieces float over the lake banks or ramps);
//   • each piece sits at the clump's ground height and is skipped if a blocker is
//     under it (a path edge, a bench…).
// Everything is instanced (one draw call per piece type), unlit-ish Lambert with the
// normals pointed up so it takes the light like the ground, and sways in a shared
// breeze in the vertex shader. Flower clumps double as butterfly patches: `clumps`
// returns their centres + flower-head perches. Tuning in DRESSING.

import { isStandable } from './bots/camp-map';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Intersection = import('three').Intersection;

export const DRESSING = {
  /** Clump attempts over the camp (many get rejected). */
  clumpTries: 700,
  /** Mix of clump kinds (weights). */
  kinds: { grass: 0.42, flowers: 0.4, foliage: 0.18 },
  /** Per clump: [min, max] pieces and radius (world units). */
  grass: { n: [7, 14], r: 2.2 },
  flowers: { n: [6, 12], r: 1.9 },
  foliage: { n: [2, 4], r: 1.6 },
  /** Camp-local margin inside the plateau edges. */
  bounds: { x: [-44, 44] as [number, number], z: [4, 116] as [number, number] },
  flowerColors: [0xffffff, 0xfff1a8, 0xff9ac8, 0xc9a8ff, 0x8fd0ff, 0xffb070, 0xff6f8a],
  // Close to the lawn (clay_grass) so tufts read as the lawn itself, a touch deeper/juicier.
  grassColors: [0x9cc877, 0x8fbf6a, 0xa6d27f, 0x86b666],
  leafColors: [0x6fb35a, 0x7cc265, 0x5fa24f],
  sway: 0.18,
};

export interface FlowerClump { centre: Vector3; perches: Vector3[] }

export interface DressingOptions {
  campChunk: Object3D;
  /** The camp's big ground mesh(es) — raycast once per clump. */
  groundMeshes: Mesh[];
  /** Every other walkable/collision mesh (paths, props, colliders, arenas, water). */
  blockers: Mesh[];
}

const isGrass = (h: Intersection | null) => {
  if (!h) return false;
  const m = (h.object as Mesh).material as InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[];
  const name = Array.isArray(m) ? m[0]?.name : m?.name;
  return /^Camp_ground/.test(h.object.name) && name === 'clay_grass';
};

export class GroundDressing {
  readonly clumps: FlowerClump[] = [];
  private uniforms = { uTime: { value: 0 } };
  private meshes: InstanceType<typeof THREE.InstancedMesh>[] = [];

  constructor(scene: InstanceType<typeof THREE.Scene>, o: DressingOptions) {
    const D = DRESSING;
    const cam = o.campChunk;
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const cast = (meshes: Mesh[], x: number, z: number): Intersection | null => {
      ray.set(new THREE.Vector3(x, 60, z), down);
      ray.far = 120;
      return ray.intersectObjects(meshes, false)[0] ?? null;
    };
    const campY = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld).y;
    // Only things at/above the plateau count (the valley floor, lake beds etc. lie far below it).
    const blocked = (x: number, z: number) => {
      const h = cast(o.blockers, x, z);
      return !!h && h.point.y > campY - 0.3;
    };
    const tufts: { p: Vector3; s: number; r: number; c: number }[] = [];
    const flowers: { p: Vector3; s: number; r: number; c: number }[] = [];
    const leaves: { p: Vector3; s: number; r: number; c: number }[] = [];
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    const local = new THREE.Vector3();

    for (let i = 0; i < D.clumpTries; i++) {
      const lx = rnd(D.bounds.x[0], D.bounds.x[1]), lz = rnd(D.bounds.z[0], D.bounds.z[1]);
      if (!isStandable([lx, lz])) continue;
      const w = local.set(lx, 0, lz).applyMatrix4(cam.matrixWorld);
      if (blocked(w.x, w.z)) continue;
      const hit = cast(o.groundMeshes, w.x, w.z);
      if (!isGrass(hit) || Math.abs(hit!.point.y - campY) > 0.08) continue;
      const gy = hit!.point.y;
      const roll = Math.random();
      const kind = roll < D.kinds.grass ? 'grass' : roll < D.kinds.grass + D.kinds.flowers ? 'flowers' : 'foliage';
      const cfg = D[kind];
      const n = Math.round(rnd(cfg.n[0], cfg.n[1]));
      const clump: FlowerClump | null = kind === 'flowers' ? { centre: hit!.point.clone(), perches: [] } : null;
      const tone = pick(D.flowerColors);
      for (let k = 0; k < n + (kind === 'grass' ? 0 : 3); k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * cfg.r;
        const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
        if (blocked(x, z)) continue;
        const p = new THREE.Vector3(x, gy, z);
        // The extra few in flower / foliage clumps are grass to tie them into the lawn.
        const piece = k >= n ? 'grass' : kind;
        if (piece === 'grass') tufts.push({ p, s: rnd(0.8, 1.35), r: Math.random() * 6.28, c: pick(D.grassColors) });
        else if (piece === 'flowers') {
          const s = rnd(0.85, 1.25);
          // Mostly one colour per clump, with the odd white/yellow stray.
          flowers.push({ p, s, r: Math.random() * 6.28, c: Math.random() < 0.8 ? tone : pick(D.flowerColors) });
          clump!.perches.push(p.clone().add(new THREE.Vector3(0, FLOWER_H * s * 1.35, 0)));
        } else leaves.push({ p, s: rnd(0.8, 1.3), r: Math.random() * 6.28, c: pick(D.leafColors) });
      }
      if (clump && clump.perches.length) this.clumps.push(clump);
    }

    const place = (geo: ConstructorParameters<typeof THREE.InstancedMesh>[0], items: typeof tufts, colorOf: (it: typeof tufts[0]) => number,
                   sway: number, name: string) => {
      if (!items.length) return;
      const mat = this.swayMaterial(sway);
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
      const up = new THREE.Vector3(0, 1, 0);
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        sc.setScalar(it.s * 1.35); // camp WORLD_SCALE
        m.compose(it.p, q, sc);
        im.setMatrixAt(i, m);
        im.setColorAt(i, c.setHex(colorOf(it)));
      });
      im.name = name;
      im.userData.noBatch = true;
      im.receiveShadow = true;
      scene.add(im);
      this.meshes.push(im);
    };
    place(tuftGeometry(), tufts, (it) => it.c, 1, 'dressing_grass');
    place(leafGeometry(), leaves, (it) => it.c, 0.6, 'dressing_foliage');
    place(stemGeometry(), flowers, () => 0x5f9a45, 1, 'dressing_flower_stems');
    place(petalGeometry(), flowers, (it) => it.c, 1, 'dressing_flower_petals');
    place(centreGeometry(), flowers, () => 0xffc93f, 1, 'dressing_flower_centres');
    console.log(`[dressing] ${tufts.length} tufts, ${flowers.length} flowers, ${leaves.length} sprigs, ${this.clumps.length} flower clumps`);
  }

  update(dt: number): void { this.uniforms.uTime.value += dt; }

  /** Graphics level: flowers from medium up, grass tufts + sprigs only on high. */
  setLevel(level: 'low' | 'medium' | 'high'): void {
    for (const m of this.meshes) {
      m.visible = /flower/.test(m.name) ? level !== 'low' : level === 'high';
    }
  }

  /** Lambert (DoubleSide) with a breeze: vertices bend by their height, phase by world position. */
  private swayMaterial(amount: number): InstanceType<typeof THREE.MeshLambertMaterial> {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime;
      // Double-sided normally flips the normal on back faces (→ pointing down → dark blades);
      // keep the baked up-normal on both sides so every blade lights like the lawn.
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float h = max(position.y, 0.0);
          float w = sin(uTime * 1.7 + wp.x * 0.31 + wp.z * 0.23) * 0.6 + sin(uTime * 3.3 + wp.x * 0.9 - wp.z * 0.5) * 0.25;
          transformed.x += w * h * ${(DRESSING.sway * amount).toFixed(3)} * 2.0;
          transformed.z += w * h * ${(DRESSING.sway * amount).toFixed(3)} * 1.2;
        }`);
    };
    return mat;
  }
}

// ── Geometry (model units ≈ camp-local; placed at ×1.35) ────────────────────
/** Point every normal straight up so thin pieces light like the ground they stand on. */
function upNormals<T extends InstanceType<typeof THREE.BufferGeometry>>(g: T): T {
  const n = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3);
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  g.setAttribute('normal', n);
  return g;
}

function fromTris(pos: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return upNormals(g);
}

/** A chunky cartoon tuft: seven wide blades fanning out of a point, one leaning triangle each. */
function tuftGeometry() {
  const pos: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.4;
    const h = 0.2 + (i % 3) * 0.05, w = 0.06, lean = 0.12 + (i % 2) * 0.06;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * w, pz = cx * w;
    pos.push(px, 0, pz, -px, 0, -pz, cx * lean, h, cz * lean);
  }
  return fromTris(pos);
}

/** A little leafy sprig: five pointed leaves arching up and out. */
function leafGeometry() {
  const pos: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * 0.07, pz = cx * 0.07;
    const midR = 0.14, midY = 0.14, tipR = 0.26, tipY = 0.18;
    // Diamond leaf: base → two side points at mid → tip.
    pos.push(0, 0.02, 0, cx * midR + px, midY, cz * midR + pz, cx * tipR, tipY, cz * tipR);
    pos.push(0, 0.02, 0, cx * tipR, tipY, cz * tipR, cx * midR - px, midY, cz * midR - pz);
  }
  return fromTris(pos);
}

const FLOWER_H = 0.38;

function stemGeometry() {
  const w = 0.012;
  return fromTris([
    -w, 0, 0, w, 0, 0, w, FLOWER_H, 0, -w, 0, 0, w, FLOWER_H, 0, -w, FLOWER_H, 0,
    0, 0, -w, 0, 0, w, 0, FLOWER_H, w, 0, 0, -w, 0, FLOWER_H, w, 0, FLOWER_H, -w,
    // A leaf part-way up.
    0, 0.12, 0, 0.1, 0.2, 0.02, 0.03, 0.2, -0.02,
  ]);
}

/** Five round-ish petals, facing up and a touch toward the viewer. */
function petalGeometry() {
  const pos: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / 5, am = (a0 + a1) / 2;
    const r = 0.12, rm = 0.14;
    pos.push(0, FLOWER_H, 0, Math.cos(a0) * r * 0.5, FLOWER_H, Math.sin(a0) * r * 0.5, Math.cos(am) * rm, FLOWER_H + 0.012, Math.sin(am) * rm);
    pos.push(0, FLOWER_H, 0, Math.cos(am) * rm, FLOWER_H + 0.012, Math.sin(am) * rm, Math.cos(a1) * r * 0.5, FLOWER_H, Math.sin(a1) * r * 0.5);
  }
  const g = fromTris(pos);
  g.translate(0, -FLOWER_H, 0).rotateX(-0.35).translate(0, FLOWER_H, 0); // tilt the head on the stem top
  return g;
}

function centreGeometry() {
  const g = new THREE.CircleGeometry(0.045, 6).rotateX(-Math.PI / 2).translate(0, FLOWER_H + 0.016, 0);
  g.translate(0, -FLOWER_H, 0).rotateX(-0.35).translate(0, FLOWER_H, 0);
  return upNormals(g);
}
