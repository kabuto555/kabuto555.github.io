/**
 * GroundCache — cheap ground heights for bots. Raycasting every walking bot against
 * the (bevelled, detailed) collision meshes every frame cost ~5–6 ms; the ground
 * never moves, so each lattice corner is raycast ONCE (lazily, on first use) and the
 * heights of every surface stacked there (bridge over river, path over valley…) are
 * kept. A query bilinearly blends the four corners, each on the highest layer the
 * bot can step up onto from where it already is (like the player's max step-up), so
 * it climbs onto bridge decks instead of following the bank / water underneath, and
 * never pops up onto rails or anything overhead.
 * Anything ambiguous (a corner with no layer near the bot) falls back to a real ray.
 */
type Mesh = import('three').Mesh;

const CELL = 1.0;        // world units between lattice corners
const TOP = 160;         // rays start this high…
const DEPTH = 260;       // …and reach this far down
const MERGE = 0.25;      // surfaces closer than this at one corner count as one
const LAYER_REACH = 3.5; // a corner layer must be within this of the bot's height…
const STEP_UP = 1.0;     // …and at most this far above it (matches the player's maxStepUp)

export class GroundCache {
  private readonly layers = new Map<number, Float32Array>();
  private readonly rc = new THREE.Raycaster();
  private readonly from = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);

  constructor(private readonly meshes: readonly Mesh[]) {}

  /**
   * Ground under (x, z) for something standing around `nearY`; `fromY` is the
   * highest surface it may step onto (same meaning as a ray cast down from fromY).
   */
  heightAt(x: number, z: number, fromY: number, nearY: number): number | null {
    const gx = x / CELL, gz = z / CELL;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = this.pick(i, j, fromY, nearY), b = this.pick(i + 1, j, fromY, nearY);
    const c = this.pick(i, j + 1, fromY, nearY), d = this.pick(i + 1, j + 1, fromY, nearY);
    if (a === null || b === null || c === null || d === null) return this.ray(x, z, Math.min(fromY, nearY + STEP_UP));
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /** The highest layer at a corner the bot can step onto (not above fromY), or null. */
  private pick(i: number, j: number, fromY: number, nearY: number): number | null {
    const ys = this.corner(i, j);
    const top = Math.min(fromY, nearY + STEP_UP) + 0.01;
    for (let k = 0; k < ys.length; k++) { // hits are sorted top-down
      const y = ys[k];
      if (y > top) continue;
      return y >= nearY - LAYER_REACH ? y : null;
    }
    return null;
  }

  private corner(i: number, j: number): Float32Array {
    const key = (i + 50000) * 100000 + (j + 50000); // exact (no hash collisions) for |i|,|j| < 50k
    let ys = this.layers.get(key);
    if (ys) return ys;
    this.rc.set(this.from.set(i * CELL, TOP, j * CELL), this.down);
    this.rc.far = DEPTH;
    const hits = this.rc.intersectObjects(this.meshes as Mesh[], false);
    const out: number[] = [];
    for (const h of hits) if (!out.length || out[out.length - 1] - h.point.y > MERGE) out.push(h.point.y);
    ys = Float32Array.from(out);
    this.layers.set(key, ys);
    return ys;
  }

  private ray(x: number, z: number, fromY: number): number | null {
    this.rc.set(this.from.set(x, fromY, z), this.down);
    this.rc.far = 30;
    const hits = this.rc.intersectObjects(this.meshes as Mesh[], false);
    return hits.length ? hits[0].point.y : null;
  }
}
