// Hero mountain — the big snow-capped massif on the northern horizon, rebuilt at
// runtime so it actually reads. The GLB's backdrop cones sat past the fog's end
// (fog finishes at 340; they were ~385 out), so they washed out to flat blue. This
// one ignores scene fog and bakes its own aerial perspective into vertex colours:
// crisp snowy peaks, rock that cools toward the sky colour lower down, and a misty
// base that melts into the valley haze. A paler back range sits behind for depth.
//
// It rides along with the camera (with a touch of parallax) so it always stays at
// backdrop distance — inside the camera's far plane — however far you roam.
// Procedural geometry + vertex colours: no textures, one material, ~3 draw calls.

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Group = InstanceType<typeof THREE.Group>;

export const HERO_MOUNTAIN = {
  /** World distance from the camp centre to the massif: just past the hike climb (~180 north of
   * the camp centre), and near enough that the back range stays inside the camera's far plane (600). */
  distance: 360,
  /** Backdrop-local units → world. */
  scale: 0.68,
  /** Extra stretch across the horizon (the massif reads bigger wide than tall). */
  width: 1.55,
  /** How much the backdrop follows the camera (1 = glued to it, 0 = fixed in the world). */
  follow: 0.9,
  /** Base sits this far below the plateau so the valley haze swallows it. */
  baseY: -42,
  colors: {
    rock: 0x6f7fc4, rockDark: 0x4f5c9e, forest: 0x4f7f6a, snow: 0xf4f8ff, snowShade: 0xc9d6f2,
    haze: 0x9fcdf0,
  },
};

interface Peak { x: number; z: number; r: number; h: number; ridges: number; seed: number; haze: number; snow?: number }

/** Front massif (the hero) and a paler back range, in backdrop-local units (+z = away from camp). */
const PEAKS: Peak[] = [
  { x: 0, z: 0, r: 175, h: 265, ridges: 7, seed: 1, haze: 0.1 },          // the dominant peak
  { x: -150, z: 30, r: 120, h: 165, ridges: 6, seed: 2, haze: 0.2 },      // shoulders
  { x: 165, z: 20, r: 130, h: 180, ridges: 6, seed: 3, haze: 0.2 },
  { x: -80, z: -45, r: 70, h: 88, ridges: 5, seed: 4, haze: 0.18, snow: 2 },   // green foothills
  { x: 100, z: -50, r: 72, h: 94, ridges: 5, seed: 5, haze: 0.18, snow: 2 },
  { x: -290, z: 80, r: 130, h: 170, ridges: 6, seed: 6, haze: 0.5 },      // back range (hazier)
  { x: 300, z: 90, r: 140, h: 185, ridges: 6, seed: 7, haze: 0.5 },
  { x: -70, z: 110, r: 130, h: 200, ridges: 6, seed: 8, haze: 0.55 },
  { x: 130, z: 120, r: 130, h: 185, ridges: 6, seed: 9, haze: 0.58 },
];

export class HeroMountain {
  readonly root: Group;
  private readonly anchor = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();

  /** `campCentre` / `north` in world space (north = the direction the massif sits in). */
  constructor(scene: InstanceType<typeof THREE.Scene>, campCentre: Vector3, north: Vector3) {
    const n = north.clone().setY(0).normalize();
    this.centre.copy(campCentre).setY(0);
    this.anchor.copy(this.centre).addScaledVector(n, HERO_MOUNTAIN.distance).setY(HERO_MOUNTAIN.baseY);
    this.root = new THREE.Group();
    this.root.name = 'hero_mountain';
    this.root.rotation.y = Math.atan2(n.x, n.z);
    this.root.scale.set(HERO_MOUNTAIN.scale * HERO_MOUNTAIN.width, HERO_MOUNTAIN.scale, HERO_MOUNTAIN.scale);
    // Lighting is baked into the vertex colours (a key light from the camp side): the scene's sun
    // sits behind the massif, which left the face you look at in dull shadow.
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    // Near (front) peaks first so the back range draws behind them cheaply.
    const front = PEAKS.filter((p) => p.haze < 0.4), back = PEAKS.filter((p) => p.haze >= 0.4);
    for (const set of [front, back]) {
      const geo = mergeGeometries(set.map((p) => peakGeometry(p)));
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false; // follows the camera; its bounds would lag
      this.root.add(m);
    }
    this.root.position.copy(this.anchor);
    scene.add(this.root);
  }

  /** Keep it at backdrop distance: follow the camera with a little parallax. */
  update(camera: Object3D): void {
    const f = HERO_MOUNTAIN.follow;
    this.root.position.set(
      this.anchor.x + (camera.position.x - this.centre.x) * f,
      HERO_MOUNTAIN.baseY + Math.max(0, camera.position.y - 20) * f * 0.6,
      this.anchor.z + (camera.position.z - this.centre.z) * f,
    );
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────
const RINGS = 26;
const SEGS = 72;

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i + seed * 57) * (1 - u) + hash(i + 1 + seed * 57) * u;
}

/** One craggy peak: a radial grid pushed up by a steep profile, carved by ridges + noise. */
function peakGeometry(p: Peak) {
  const C = HERO_MOUNTAIN.colors;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cRock = new THREE.Color(C.rock), cDark = new THREE.Color(C.rockDark), cForest = new THREE.Color(C.forest);
  const cSnow = new THREE.Color(C.snow), cSnowS = new THREE.Color(C.snowShade), cHaze = new THREE.Color(C.haze);
  const tmp = new THREE.Color();
  const phase = hash(p.seed) * Math.PI * 2;
  const snowLine = p.snow ?? 0.64;
  for (let ri = 0; ri <= RINGS; ri++) {
    const t = ri / RINGS;                           // 0 at the summit → 1 at the base
    for (let si = 0; si < SEGS; si++) {
      const a = (si / SEGS) * Math.PI * 2;
      // Ridges: sharp spurs running down from the summit, strongest mid-slope.
      const ridge = Math.pow(Math.abs(Math.sin(a * p.ridges * 0.5 + phase)), 3);
      const crag = noise1(a * 6 + t * 3, p.seed) - 0.5;
      const rr = p.r * t * (1 + (ridge * 0.16 + crag * 0.12) * Math.sin(Math.PI * Math.min(1, t * 1.3)));
      // Steep near the top, flaring into long foothill skirts.
      let h = p.h * Math.pow(1 - t, 1.55);
      h += p.h * (ridge * 0.06 + crag * 0.05) * (1 - t) * t * 4;
      if (ri === 0) h = p.h * 1.02;
      const x = p.x + Math.sin(a) * rr, z = p.z + Math.cos(a) * rr;
      pos.push(x, h, z);
      // Colour: forest skirt → rock → snow (a noisy snowline that dips down the ridges).
      const hN = h / p.h;
      const sl = snowLine - ridge * 0.1 + crag * 0.08;
      if (hN > sl) {
        tmp.copy(cSnow).lerp(cSnowS, Math.max(0, 0.5 - ridge) * 0.6);
        // Rocky gullies streak down through the snow between the ridges.
        const gully = Math.max(0, 0.25 - ridge) * 4 * Math.max(0, -crag * 3) * (1 - Math.max(0, hN - 0.85) * 6);
        tmp.lerp(cDark, Math.min(0.7, gully));
      }
      else if (hN > 0.22) tmp.copy(cRock).lerp(cDark, (1 - ridge) * 0.45 + crag * 0.3);
      else tmp.copy(cForest).lerp(cRock, hN / 0.22);
      // Aerial perspective: more haze low down (valley mist) and on the back range.
      const haze = Math.min(0.92, p.haze + (1 - hN) * 0.5 * (1 - p.haze) + (t > 0.85 ? (t - 0.85) * 2.4 : 0));
      tmp.lerp(cHaze, haze);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let ri = 0; ri < RINGS; ri++) {
    for (let si = 0; si < SEGS; si++) {
      const a = ri * SEGS + si, b = ri * SEGS + ((si + 1) % SEGS);
      const c = a + SEGS, d = b + SEGS;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  bakeLight(g, p.haze);
  return g;
}

/** Key light from the camp side (local −z) and above, a cool sky fill, and a sunlit rim on
 * the ridges — then the result pulled back toward the haze for far ranges. */
function bakeLight(g: ReturnType<typeof peakGeometry> extends infer T ? T : never, haze: number): void {
  const n = g.attributes.normal, c = g.attributes.color;
  const key = new THREE.Vector3(0.55, 0.62, -0.56).normalize();
  const hazeC = new THREE.Color(HERO_MOUNTAIN.colors.haze);
  const v = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    v.set(n.getX(i), n.getY(i), n.getZ(i));
    const d = Math.max(0, v.dot(key));
    const sky = 0.5 + 0.5 * Math.max(0, v.y);
    const light = 0.58 + d * 0.55 + sky * 0.12;
    col.setRGB(c.getX(i) * light, c.getY(i) * light, c.getZ(i) * light).lerp(hazeC, haze * 0.25);
    c.setXYZ(i, Math.min(1, col.r), Math.min(1, col.g), Math.min(1, col.b));
  }
}

function mergeGeometries(gs: ReturnType<typeof peakGeometry>[]) {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of gs) {
    type Attr = InstanceType<typeof THREE.BufferAttribute>;
    const p = (g.attributes.position as Attr).array, c = (g.attributes.color as Attr).array, n = (g.attributes.normal as Attr).array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); col.push(c[i]); nor.push(n[i]); }
    const ia = g.index!.array;
    for (let i = 0; i < ia.length; i++) idx.push(ia[i] + off);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
