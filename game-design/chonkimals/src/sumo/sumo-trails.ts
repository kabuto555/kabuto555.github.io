/**
 * Sumo movement streaks: a flat, fading ribbon behind each chonk while it's
 * sliding fast, so launches, bounces and ring-outs read clearly from the high
 * camera. Points are laid down every SPACING units, age out after LIFE
 * seconds, and taper + fade from the chonk back to the tail. Opacity follows
 * the speed at the moment each point was laid, so a big launch leaves a bold
 * streak that thins as the chonk slows.
 */

type Scene = InstanceType<typeof THREE.Scene>;
type Color = InstanceType<typeof THREE.Color>;

const MAX_PTS = 26;
const SPACING = 0.28;      // world units between ribbon points
const LIFE = 0.5;          // seconds a point lives
const MIN_SPEED = 4;       // below this, no new streak
const FULL_SPEED = 13;     // streak at full strength from here
const MAX_ALPHA = 0.85;
const WHITE = new THREE.Color(0xffffff);

class Trail {
  private readonly x = new Float32Array(MAX_PTS);
  private readonly z = new Float32Array(MAX_PTS);
  private readonly age = new Float32Array(MAX_PTS);
  private readonly power = new Float32Array(MAX_PTS);
  private n = 0;
  /** Where the last ribbon point was laid (the head itself follows the chonk). */
  private laidX = 0; private laidZ = 0;
  private readonly pos: InstanceType<typeof THREE.BufferAttribute>;
  private readonly col: InstanceType<typeof THREE.BufferAttribute>;
  private readonly geo = new THREE.BufferGeometry();
  readonly mesh: InstanceType<typeof THREE.Mesh>;

  constructor(scene: Scene) {
    this.pos = new THREE.BufferAttribute(new Float32Array(MAX_PTS * 2 * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(MAX_PTS * 2 * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('color', this.col);
    const idx: number[] = [];
    for (let i = 0; i < MAX_PTS - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false; // vertices move every frame; bounds would go stale
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  reset(): void { this.n = 0; this.geo.setDrawRange(0, 0); }

  /** Advance: age points, lay a new one if the chonk moved far enough, rebuild the ribbon. */
  update(dt: number, x: number, y: number, z: number, speed: number, width: number, color: Color): void {
    // Age out the tail.
    for (let i = 0; i < this.n; i++) this.age[i] += dt;
    while (this.n > 0 && this.age[this.n - 1] >= LIFE) this.n--;

    const p = THREE.MathUtils.clamp((speed - MIN_SPEED) / (FULL_SPEED - MIN_SPEED), 0, 1);
    const moved = this.n === 0 ? Infinity : Math.hypot(x - this.laidX, z - this.laidZ);
    if (p > 0 && moved >= SPACING) {
      // Shift everything back one slot and lay the new head point.
      const last = Math.min(this.n, MAX_PTS - 1);
      for (let i = last; i > 0; i--) {
        this.x[i] = this.x[i - 1]; this.z[i] = this.z[i - 1];
        this.age[i] = this.age[i - 1]; this.power[i] = this.power[i - 1];
      }
      this.x[0] = x; this.z[0] = z; this.age[0] = 0; this.power[0] = p;
      this.n = last + 1;
      this.laidX = x; this.laidZ = z;
    } else if (this.n > 0) {
      // Between points, keep the head glued to the chonk so the ribbon never lags.
      this.x[0] = x; this.z[0] = z;
    }
    if (this.n < 2) { this.geo.setDrawRange(0, 0); return; }

    const pa = this.pos.array as Float32Array, ca = this.col.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      // Direction along the ribbon at this point (central difference where possible).
      const i0 = Math.max(0, i - 1), i1 = Math.min(this.n - 1, i + 1);
      let dx = this.x[i0] - this.x[i1], dz = this.z[i0] - this.z[i1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const t = i / (this.n - 1);                 // 0 at the chonk, 1 at the tail
      const life = 1 - this.age[i] / LIFE;
      const w = width * (1 - 0.85 * t) * (0.5 + 0.5 * life) * 0.5;
      const nx = -dz * w, nz = dx * w;
      const v = i * 6;
      pa[v] = this.x[i] + nx; pa[v + 1] = y; pa[v + 2] = this.z[i] + nz;
      pa[v + 3] = this.x[i] - nx; pa[v + 4] = y; pa[v + 5] = this.z[i] - nz;
      const a = MAX_ALPHA * Math.sqrt(this.power[i]) * life * (1 - t * 0.6);
      const c = i * 8;
      ca[c] = ca[c + 4] = color.r; ca[c + 1] = ca[c + 5] = color.g;
      ca[c + 2] = ca[c + 6] = color.b; ca[c + 3] = ca[c + 7] = a;
    }
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.geo.setDrawRange(0, (this.n - 1) * 6);
  }
}

export class SumoTrails {
  private readonly trails: Trail[] = [];
  private readonly tint = new THREE.Color();

  constructor(scene: Scene, count: number) {
    for (let i = 0; i < count; i++) this.trails.push(new Trail(scene));
  }

  reset(): void { for (const t of this.trails) t.reset(); }

  /** Streak for chonk `i` at (x, y, z) moving at `speed`, tinted toward `color`. */
  update(i: number, dt: number, x: number, y: number, z: number, speed: number, width: number, color: number): void {
    // Mostly white with a wash of the chonk's colour, so every streak reads on the sand.
    this.tint.setHex(color).lerp(WHITE, 0.3);
    this.trails[i]?.update(dt, x, y, z, speed, width, this.tint);
  }
}
