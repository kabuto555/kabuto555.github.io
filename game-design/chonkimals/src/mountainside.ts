/**
 * Mountainside — a forested mountain wrapped around the climb so the path reads
 * as a ledge cut into a mountain instead of pieces floating in the sky.
 *
 *  - North of the east–west stretches (toward the big peak) the ground rises in a
 *    steep rock band, then climbs away as a forested slope: a natural wall.
 *  - Everywhere else it drops from the path edges as cliffs, easing into forested
 *    slopes down to the valley floor.
 *  - Mostly greens; warm rock shows only on the steepest faces. Pines and rounded
 *    clay trees (a few cherries) are instanced over the gentler ground.
 *  - Invisible, un-jumpable rims run along every exposed path edge; openings where
 *    the path really continues (camp, the zipline deck, the glider ramp, joins
 *    between pieces) are found by raycast and left open.
 *
 * The path layout comes from the stage's chunk sockets, so it follows DEFAULT_STAGE
 * and its branches. Heights are a pure function (tunable in MOUNTAIN_TUNING).
 */

type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Vector3 = import('three').Vector3;

export const MOUNTAIN_TUNING = {
  /** Terrain footprint (world XZ) and grid spacing. */
  minX: -205, maxX: 195, minZ: 150, maxZ: 330, cell: 3,
  tileCells: 12,
  /** Valley floor (matches the baked Base_ground top). */
  floorY: -40.5,
  /** Mountain side: rock band height at the path edge, band width + steepness, then slope. */
  wallStep: 4.6, bandWidth: 5, bandRise: 2.2, slopeRise: 0.85, maxRise: 42,
  /** Drop side: cliff below the edge, then a forested slope down to the floor. */
  cliffDepth: 3.5, cliffWidth: 7, cliffDrop: 2.6, dropSlope: 1.05,
  /** Fade everything back to the floor near the footprint's outer edge. */
  edgeFade: 40,
  trees: 420,
  treeMaxSlope: 1.35,
  /** Invisible rims: height (> jump apex + step, < grounding ray start) and sample spacing. */
  rimHeight: 4.2, rimStep: 4,
};

interface Seg {
  a: Vector3;
  b: Vector3;
  /** Half width of the piece (world). */
  hw: number;
  /** Mountain rises on its +z side (east–west stretches under the peak). */
  uphillNorth: boolean;
}

/** Builds the mountain; returns meshes to add to the walkable collision list (terrain + rims). */
export function buildMountainside(scene: import('three').Scene, stageRoot: Object3D, ground: readonly Mesh[]): Mesh[] {
  stageRoot.updateMatrixWorld(true);
  const scale = stageRoot.getWorldScale(new THREE.Vector3()).x;
  const segs = pathSegments(stageRoot, scale);
  if (segs.length === 0) return [];
  const camp = stageRoot.getObjectByName('chunk_0_camp');
  const campBox = camp ? plateauBox(camp) : null;
  const out: Mesh[] = [];
  const group = new THREE.Group();
  group.name = 'mountainside';

  // Rims first — their "is the path continuing here?" test must not see the new terrain.
  out.push(...buildRims(group, segs, ground));
  const { tiles, heightAt, slopeAt } = buildTerrain(group, segs, campBox);
  out.push(...tiles);
  scatterTrees(group, segs, campBox, heightAt, slopeAt);
  scene.add(group);
  group.updateMatrixWorld(true);
  return out;
}

// ── Path layout ───────────────────────────────────────────────────────────────
function pathSegments(stageRoot: Object3D, scale: number): Seg[] {
  const segs: Seg[] = [];
  const hw = 12 * scale;
  const push = (a: Vector3, b: Vector3) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    segs.push({ a, b, hw, uphillNorth: Math.abs(dx) > Math.abs(dz) });
  };
  for (const inst of stageRoot.children) {
    if (!/^chunk_/.test(inst.name) || /_camp$/.test(inst.name)) continue;
    const pin = inst.getWorldPosition(new THREE.Vector3());
    const out = inst.getObjectByName('socket_out')?.getWorldPosition(new THREE.Vector3());
    if (!out) continue;
    if (/switchback/.test(inst.name)) {
      // Elbow: in → centre → out (and → the branch socket, if any).
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(inst.getWorldQuaternion(new THREE.Quaternion()));
      const centre = pin.clone().addScaledVector(fwd, hw);
      push(pin, centre);
      push(centre, out);
      const br = inst.getObjectByName('socket_branch')?.getWorldPosition(new THREE.Vector3());
      if (br) push(centre, br);
    } else {
      push(pin, out);
    }
  }
  return segs;
}

/**
 * Signed distance from (x, z) to the nearest piece's footprint (a rectangle along the
 * segment, `hw` either side; negative = on the path), the path height there, and which
 * side of the centreline the point is on (+z).
 */
function nearest(segs: Seg[], x: number, z: number): { d: number; y: number; seg: Seg; north: boolean } {
  let best = { d: Infinity, y: 0, seg: segs[0], north: false };
  for (const s of segs) {
    const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z;
    const len = Math.hypot(vx, vz) || 1;
    const ux = vx / len, uz = vz / len;
    const rx = x - s.a.x, rz = z - s.a.z;
    const u = rx * ux + rz * uz;          // along
    const v = -rx * uz + rz * ux;         // across
    const qx = Math.max(-u, u - len), qy = Math.abs(v) - s.hw;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
    if (d < best.d) {
      const t = THREE.MathUtils.clamp(u / len, 0, 1);
      best = { d, y: s.a.y + (s.b.y - s.a.y) * t, seg: s, north: z > s.a.z + vz * t };
    }
  }
  return best;
}

/** The camp plateau's XZ footprint (its terrain stays hidden under the plateau). */
function plateauBox(camp: Object3D): { minX: number; maxX: number; maxZ: number } {
  const g = camp.getObjectByName('Camp_ground') ?? camp;
  const b = new THREE.Box3().setFromObject(g);
  return { minX: Math.max(b.min.x, -82), maxX: Math.min(b.max.x, 82), maxZ: Math.min(b.max.z, 163) };
}

// ── Terrain ───────────────────────────────────────────────────────────────────
/** Hash-based value noise on an integer lattice, smoothly interpolated: 0..1. */
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const h = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Organic fractal noise (3 octaves, no directional banding), roughly −1..1. */
function noise(x: number, z: number): number {
  return (valueNoise(x * 0.045, z * 0.045) * 0.55 + valueNoise(x * 0.11 + 17, z * 0.11 - 9) * 0.3
    + valueNoise(x * 0.27 - 5, z * 0.27 + 31) * 0.15) * 2 - 1;
}

function buildTerrain(group: InstanceType<typeof THREE.Group>, segs: Seg[], campBox: ReturnType<typeof plateauBox> | null) {
  const T = MOUNTAIN_TUNING;
  const heightAt = (x: number, z: number): number => {
    const n = nearest(segs, x, z);
    const e = n.d; // outside the path edge (negative = under the path)
    let h: number;
    if (e < 0) {
      h = n.y - 3; // tucked under the path slab
    } else if (n.seg.uphillNorth && n.north) {
      // Mountain side: steep rock band, then a forested slope climbing away.
      const band = Math.min(e, T.bandWidth);
      h = n.y + T.wallStep + band * T.bandRise + Math.max(0, e - T.bandWidth) * T.slopeRise;
      h = Math.min(h, n.y + T.maxRise) + noise(x, z) * Math.min(1, e / 6) * 3.5;
    } else {
      // Drop side: cliff under the edge, then easing to a forested slope down to the floor.
      const c = Math.min(e, T.cliffWidth);
      h = n.y - T.cliffDepth - c * T.cliffDrop - Math.max(0, e - T.cliffWidth) * T.dropSlope;
      h += noise(x * 1.3, z * 1.3) * Math.min(1, e / 4) * 2.5;
    }
    // Taper back to the valley floor near the footprint's edge, and never below it.
    const edge = Math.min(x - T.minX, T.maxX - x, z - T.minZ + 60, T.maxZ - z);
    const fade = THREE.MathUtils.smoothstep(edge, 0, T.edgeFade);
    // Sit a hair above the baked valley slab so the two never z-fight where they meet.
    const floor = T.floorY + 0.15;
    h = floor + (h - floor) * fade;
    h = Math.max(h, floor);
    // Under the camp plateau: stay hidden below its top.
    if (campBox && x > campBox.minX && x < campBox.maxX && z < campBox.maxZ) h = Math.min(h, -2);
    return h;
  };
  const slopeAt = (x: number, z: number): number => {
    const s = 1.5;
    return Math.hypot(heightAt(x + s, z) - heightAt(x - s, z), heightAt(x, z + s) - heightAt(x, z - s)) / (2 * s);
  };

  const nx = Math.round((T.maxX - T.minX) / T.cell), nz = Math.round((T.maxZ - T.minZ) / T.cell);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = heightAt(T.minX + i * T.cell, T.minZ + j * T.cell);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  mat.name = 'mountain_forest';
  const grassA = new THREE.Color(0x5cb84f), grassB = new THREE.Color(0x3f9447), moss = new THREE.Color(0x6f9a4a);
  const rockA = new THREE.Color(0xc2a47e), rockB = new THREE.Color(0xa99079);
  const tmp = new THREE.Color();
  const tiles: Mesh[] = [];
  const tc = T.tileCells;
  for (let tj = 0; tj < nz; tj += tc) {
    for (let ti = 0; ti < nx; ti += tc) {
      const cw = Math.min(tc, nx - ti), ch = Math.min(tc, nz - tj);
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      for (let j = 0; j <= ch; j++) {
        for (let i = 0; i <= cw; i++) {
          const gi = ti + i, gj = tj + j;
          const x = T.minX + gi * T.cell, z = T.minZ + gj * T.cell, y = H[gj * (nx + 1) + gi];
          pos.push(x, y, z);
          const hx = H[gj * (nx + 1) + Math.min(nx, gi + 1)] - H[gj * (nx + 1) + Math.max(0, gi - 1)];
          const hz = H[Math.min(nz, gj + 1) * (nx + 1) + gi] - H[Math.max(0, gj - 1) * (nx + 1) + gi];
          const slope = Math.hypot(hx, hz) / (2 * T.cell);
          const v = 0.5 + 0.5 * noise(x * 2.1, z * 2.1);
          tmp.copy(grassA).lerp(grassB, v).lerp(moss, 0.25 * (1 - v));
          const rock = THREE.MathUtils.smoothstep(slope, 1.25, 2.1);
          if (rock > 0) tmp.lerp(new THREE.Color().copy(rockA).lerp(rockB, v), rock * 0.85);
          col.push(tmp.r, tmp.g, tmp.b);
        }
      }
      const w = cw + 1;
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.name = `Mountain_ground_${tiles.length}`; // "ground" → walkable; steep rises block like walls
      m.receiveShadow = true;
      group.add(m);
      tiles.push(m);
    }
  }
  return { tiles, heightAt, slopeAt };
}

// ── Forest ────────────────────────────────────────────────────────────────────
function scatterTrees(group: InstanceType<typeof THREE.Group>, segs: Seg[], campBox: ReturnType<typeof plateauBox> | null,
                      heightAt: (x: number, z: number) => number, slopeAt: (x: number, z: number) => number): void {
  const T = MOUNTAIN_TUNING;
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spots: { x: number; y: number; z: number; s: number; kind: 0 | 1 | 2 }[] = [];
  for (let tries = 0; tries < T.trees * 8 && spots.length < T.trees; tries++) {
    const x = T.minX + 10 + rnd() * (T.maxX - T.minX - 20);
    const z = T.minZ + rnd() * (T.maxZ - T.minZ - 10);
    if (campBox && x > campBox.minX - 4 && x < campBox.maxX + 4 && z < campBox.maxZ + 3) continue;
    const n = nearest(segs, x, z);
    if (n.d < 4) continue; // keep the path and its rims clear
    const y = heightAt(x, z);
    if (y <= T.floorY + 0.5 && rnd() < 0.75) continue; // mostly on the mountain, a few at its foot
    if (slopeAt(x, z) > T.treeMaxSlope) continue;
    const r = rnd();
    spots.push({ x, y, z, s: 0.8 + rnd() * 0.6, kind: r < 0.62 ? 0 : r < 0.94 ? 1 : 2 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const pineGeo = new THREE.ConeGeometry(2.6, 5.2, 9);
  pineGeo.translate(0, 2.6, 0);
  const puffGeo = new THREE.SphereGeometry(3, 10, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.85 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, roughness: 0.8 });
  const puffMat = new THREE.MeshStandardMaterial({ color: 0x59b84e, roughness: 0.8 });
  const cherryMat = new THREE.MeshStandardMaterial({ color: 0xf7a8cc, roughness: 0.75 });
  const pines = spots.filter((p) => p.kind === 0), puffs = spots.filter((p) => p.kind === 1), cherries = spots.filter((p) => p.kind === 2);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const pineLo = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
  const pineHi = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
  const puffA = new THREE.InstancedMesh(puffGeo, puffMat, puffs.length);
  const cherryA = new THREE.InstancedMesh(puffGeo, cherryMat, cherries.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    const trunkH = (p.kind === 0 ? 3 : 4.5) * p.s;
    q.setFromAxisAngle(up, p.x * 1.7 + p.z);
    m.compose(pv.set(p.x, p.y - 0.4, p.z), q, sv.set(p.s, trunkH, p.s));
    trunks.setMatrixAt(i, m);
  });
  pines.forEach((p, i) => {
    q.setFromAxisAngle(up, p.x);
    m.compose(pv.set(p.x, p.y + 2.2 * p.s, p.z), q, sv.set(p.s, p.s, p.s));
    pineLo.setMatrixAt(i, m);
    m.compose(pv.set(p.x, p.y + 5.0 * p.s, p.z), q, sv.set(p.s * 0.72, p.s * 0.8, p.s * 0.72));
    pineHi.setMatrixAt(i, m);
  });
  const puffAt = (arr: typeof spots, mesh: InstanceType<typeof THREE.InstancedMesh>) => arr.forEach((p, i) => {
    q.identity();
    m.compose(pv.set(p.x, p.y + 4.5 * p.s + 2.2 * p.s, p.z), q, sv.set(p.s, p.s * 0.88, p.s));
    mesh.setMatrixAt(i, m);
  });
  puffAt(puffs, puffA);
  puffAt(cherries, cherryA);
  for (const im of [trunks, pineLo, pineHi, puffA, cherryA]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'prop_mountain_trees'; // visual only (not walkable)
    group.add(im);
  }
}

// ── Rims ──────────────────────────────────────────────────────────────────────
/** Invisible walls along exposed path edges (where no walkable ground continues outward). */
function buildRims(group: InstanceType<typeof THREE.Group>, segs: Seg[], ground: readonly Mesh[]): Mesh[] {
  const T = MOUNTAIN_TUNING;
  const rc = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const groundNear = (x: number, z: number, y: number): boolean => {
    rc.set(new THREE.Vector3(x, y + 3, z), down);
    rc.far = 6;
    return rc.intersectObjects(ground as Mesh[], false).length > 0;
  };
  const insideAnother = (x: number, z: number, self: Seg) => segs.some((s) => s !== self && nearest([s], x, z).d < -0.5);
  const walls: Mesh[] = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });

  for (const s of segs) {
    const dir = new THREE.Vector3(s.b.x - s.a.x, 0, s.b.z - s.a.z);
    const len = dir.length();
    if (len < 0.01) continue;
    dir.normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    // The two long sides, plus the far end cap (a start cap is always joined to something).
    const edges: { o: Vector3; along: Vector3; n: Vector3; len: number; y0: number; y1: number }[] = [];
    for (const sd of [1, -1]) {
      const n = side.clone().multiplyScalar(sd);
      edges.push({ o: s.a.clone().addScaledVector(n, s.hw), along: dir, n, len, y0: s.a.y, y1: s.b.y });
    }
    edges.push({ o: s.b.clone().addScaledVector(side, -s.hw), along: side, n: dir, len: s.hw * 2, y0: s.b.y, y1: s.b.y });

    for (const e of edges) {
      const steps = Math.max(1, Math.round(e.len / T.rimStep));
      let runStart = -1;
      const flush = (k0: number, k1: number) => {
        if (k1 <= k0) return;
        const p0 = e.o.clone().addScaledVector(e.along, (k0 / steps) * e.len);
        const p1 = e.o.clone().addScaledVector(e.along, (k1 / steps) * e.len);
        p0.y = e.y0 + (e.y1 - e.y0) * (k0 / steps);
        p1.y = e.y0 + (e.y1 - e.y0) * (k1 / steps);
        const mid = p0.clone().lerp(p1, 0.5).addScaledVector(e.n, 1.2);
        const d3 = p1.clone().sub(p0);
        // + half a sample step past each end, so runs overlap at corners (no gap to slip through).
        const wall = new THREE.Mesh(new THREE.BoxGeometry(d3.length() + T.rimStep, T.rimHeight, 0.6), mat);
        wall.visible = false; // collision only
        wall.position.set(mid.x, mid.y + T.rimHeight / 2 - 0.3, mid.z);
        wall.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d3.normalize());
        wall.name = `Mountain_rim_cliff_${walls.length}`;
        group.add(wall);
        wall.updateMatrixWorld(true);
        walls.push(wall);
      };
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const p = e.o.clone().addScaledVector(e.along, t * e.len);
        const y = e.y0 + (e.y1 - e.y0) * t;
        const probe = p.clone().addScaledVector(e.n, 3.6);
        const open = !insideAnother(probe.x, probe.z, s) && !groundNear(probe.x, probe.z, y);
        if (open && runStart < 0) runStart = k;
        if (!open && runStart >= 0) { flush(runStart, k - 1 >= runStart ? k - 1 : runStart); runStart = -1; }
      }
      if (runStart >= 0) flush(runStart, steps);
    }
  }
  return walls;
}
