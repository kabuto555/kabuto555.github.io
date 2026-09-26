/**
 * Lunch Delivery route — the cart's path from the Camp Hub down to the beach,
 * plus the walkable corridor around it that the minigame's "navmesh" is built
 * from.
 *
 * The corridor is a strip of convex quads, one per polyline segment, each with
 * its own half-width (narrow on the bridge and the cliff ramp, roomy in camp).
 * Ground agents (ants, maggots, AI teammates) stay inside it via `clamp`, and
 * route around bends with `steerTarget` (follow the centreline toward a goal
 * further along the path instead of cutting across the cliff). Heights come
 * from a ground profile sampled once along the centreline, so a swarm of
 * bugs never raycasts per frame.
 */
type Vec3 = InstanceType<typeof THREE.Vector3>;

/** Camp-local XZ (build_camp.py units, before WORLD_SCALE) + corridor half-width. */
export type RoutePoint = readonly [x: number, z: number, halfWidth: number];

/** Hub front → spine → south bridge → east bank → cliff ramp → beach picnic. */
export const ROUTE_LOCAL: readonly RoutePoint[] = [
  [-21, 56.4, 3.2],   // Camp Hub front porch (start)
  [-14, 53.3, 3.2],
  [-6, 49.5, 3.0],
  [-5.6, 43, 2.4],    // west of tent 1
  [-3, 36, 3.0],
  [-0.5, 27, 3.4],
  [0, 19.5, 3.4],     // plaza
  [4.5, 16, 2.0],     // south bridge (log course start — deck only)
  [13.5, 16, 2.0],
  [16.5, 12, 3.0],    // east bank
  [17.5, 5, 3.0],
  // Ramp + landing: along the dirt trail, between the cliff wall (z 0) and the safety rail
  // at the ledge (z −10.5, ramp-rails.ts).
  [16, -3.5, 3.0],    // flat landing above the cliff ramp
  [8.5, -3.5, 3.0],   // ramp crest (see terrain-fixes.ts RAMP_CREST_X)
  [-10, -3.5, 3.0],
  [-35, -3.5, 3.0],
  [-55, -3.5, 2.6],   // bottom of the ramp
  // Swing wide around the plateau's SW corner (−60, 0) so the path stays on the sand —
  // cutting the corner sampled the cliff top as the ground height and the cart popped up there.
  [-61, -4.5, 3.0],
  [-66, -1, 3.5],     // (clear of prop_beach_tree1's trunk at −64, −6)
  [-68, 12, 4.0],     // beach picnic (delivery point)
];

/** Where the picnic sits, camp-local (just past the delivery point). */
export const PICNIC_LOCAL: readonly [number, number] = [-73, 18];

export class RouteNav {
  readonly pts: Vec3[] = [];
  readonly halfW: number[] = [];
  /** Cumulative arc length at each point. */
  readonly cum: number[] = [0];
  readonly length: number;
  private profile: Float32Array = new Float32Array(0);
  private readonly step = 0.5;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpT = new THREE.Vector3();
  private readonly tmpT2 = new THREE.Vector3();

  constructor(local: readonly RoutePoint[], toWorld: (x: number, z: number, out: Vec3) => Vec3, scale: number) {
    for (const [x, z, hw] of local) {
      this.pts.push(toWorld(x, z, new THREE.Vector3()));
      this.halfW.push(hw * scale);
    }
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Sample the ground height along the centreline (call once the world is loaded). */
  sampleGround(groundAt: (x: number, z: number) => number | null): void {
    const n = Math.ceil(this.length / this.step) + 1;
    this.profile = new Float32Array(n);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(i * this.step, this.tmp);
      const g = groundAt(p.x, p.z);
      if (g !== null) last = g;
      this.profile[i] = last;
    }
  }

  /** Ground height at arc length s (from the sampled profile). */
  heightAt(s: number): number {
    if (this.profile.length === 0) return 0;
    const f = THREE.MathUtils.clamp(s / this.step, 0, this.profile.length - 1);
    const i = Math.floor(f), t = f - i;
    const a = this.profile[i], b = this.profile[Math.min(i + 1, this.profile.length - 1)];
    return a + (b - a) * t;
  }

  private seg(s: number): number {
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    return i;
  }

  pointAt(s: number, out: Vec3): Vec3 {
    s = THREE.MathUtils.clamp(s, 0, this.length);
    const i = this.seg(s);
    const a = this.pts[i], b = this.pts[i + 1];
    const t = (s - this.cum[i]) / Math.max(1e-6, this.cum[i + 1] - this.cum[i]);
    return out.set(a.x + (b.x - a.x) * t, this.heightAt(s), a.z + (b.z - a.z) * t);
  }

  /** Unit XZ tangent at s. Blended across corners so turns aren't a snap. */
  tangentAt(s: number, out: Vec3): Vec3 {
    const a = this.rawTangent(s - 1.2, this.tmpT2);
    const b = this.rawTangent(s + 1.2, out);
    return out.set(a.x + b.x, 0, a.z + b.z).normalize();
  }

  private rawTangent(s: number, out: Vec3): Vec3 {
    const i = this.seg(THREE.MathUtils.clamp(s, 0, this.length));
    const a = this.pts[i], b = this.pts[i + 1];
    return out.set(b.x - a.x, 0, b.z - a.z).normalize();
  }

  halfWidthAt(s: number): number {
    // The narrower end of the segment, so corners never open onto a cliff.
    const i = this.seg(THREE.MathUtils.clamp(s, 0, this.length));
    return Math.min(this.halfW[i], this.halfW[i + 1]);
  }

  /** Closest arc length to (x, z) and the signed lateral offset (+ = right of travel). */
  project(x: number, z: number): { s: number; lateral: number } {
    let best = Infinity, bestS = 0, bestLat = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      const t = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / len2, 0, 1);
      const cx = a.x + abx * t, cz = a.z + abz * t;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < best) {
        best = d;
        bestS = this.cum[i] + Math.sqrt(len2) * t;
        const len = Math.sqrt(len2);
        // Right of travel (dx, dz) is (dz, −dx) — same convention as main.ts's camera right.
        bestLat = ((x - cx) * (abz / len) + (z - cz) * (-abx / len));
      }
    }
    return { s: bestS, lateral: bestLat };
  }

  /** World point at arc length s shifted `lateral` to the right of travel. */
  offsetPoint(s: number, lateral: number, out: Vec3): Vec3 {
    this.pointAt(s, out);
    const t = this.rawTangent(s, this.tmpT);
    out.x += t.z * lateral;
    out.z += -t.x * lateral;
    return out;
  }

  /** Keep a ground agent inside the corridor (mutates p's XZ). Returns its arc length. */
  clamp(p: Vec3, margin = 0): number {
    const { s, lateral } = this.project(p.x, p.z);
    const hw = Math.max(0.2, this.halfWidthAt(s) - margin);
    if (Math.abs(lateral) > hw || s <= 0 || s >= this.length) {
      const lat = THREE.MathUtils.clamp(lateral, -hw, hw);
      const c = this.offsetPoint(THREE.MathUtils.clamp(s, 0, this.length), lat, this.tmp);
      p.x = c.x; p.z = c.z;
    }
    return s;
  }

  /**
   * Where a ground agent at arc length `sFrom` should head to reach `goal`
   * (arc length `sGoal`) without cutting across the corridor: straight at the
   * goal when it's close along the path, else a centreline point `lookahead`
   * further along toward it.
   */
  steerTarget(sFrom: number, goal: Vec3, sGoal: number, out: Vec3, lookahead = 6): Vec3 {
    if (Math.abs(sGoal - sFrom) <= lookahead) return out.copy(goal);
    return this.pointAt(sFrom + Math.sign(sGoal - sFrom) * lookahead, out);
  }
}
