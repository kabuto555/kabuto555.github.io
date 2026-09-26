/**
 * Sumo AI — decides when and where a computer chonk launches.
 *
 * Near the edge and sliding outward it launches back toward the middle
 * (recovery); otherwise it picks a victim (favouring chonks close to the edge
 * and nearby ones), leads their motion a little and charges with some aim
 * wobble. Personality knobs make each regular feel different.
 */

export interface SumoBody {
  x: number; z: number;
  vx: number; vz: number;
  alive: boolean;
}

export interface SumoBrain {
  /** Seconds until the next decision. */
  think: number;
  /** Seconds between decisions (min, max). */
  pace: readonly [number, number];
  /** Aim wobble (radians, ±). */
  wobble: number;
  /** Chance per decision of noticing it's about to slide out. */
  awareness: number;
  /** 0 = picks the nearest, 1 = hunts whoever is closest to the edge. */
  edgeHunter: number;
  /** Chance per decision of going for a power-up instead of a chonk. */
  greed: number;
}

/** A power-up on the ring, as the AI sees it. */
export interface SumoPickup { kind: 'bomb' | 'pepper'; x: number; z: number }

export function makeBrain(): SumoBrain {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    think: r(0.2, 0.9),
    pace: [r(0.55, 0.9), r(1.1, 1.8)],
    wobble: r(0.08, 0.28),
    awareness: r(0.55, 0.95),
    edgeHunter: r(0.2, 0.9),
    greed: r(0.25, 0.7),
  };
}

export interface Launch { dx: number; dz: number; power: number }

const LEAD = 0.25; // seconds of target motion to aim ahead by
const PEPPER_REACH = 10;  // only chase peppers this close
const BOMB_REACH = 9;     // ...and bombs this close
const BOMB_CROWD_R = 5.5; // a bomb is worth hitting with 2+ rivals this near it

/**
 * Returns a launch (unit direction + 0..1 power) or null to wait. `me` is the
 * thinker, `others` everyone in the match (dead/self are skipped); cx/cz/R the ring.
 */
export function decide(
  me: SumoBody, brain: SumoBrain, others: readonly SumoBody[], cx: number, cz: number, R: number,
  pickups: readonly SumoPickup[] = [], spicy = false,
): Launch | null {
  const ox = me.x - cx, oz = me.z - cz;
  const rad = Math.hypot(ox, oz);
  const outward = rad > 1e-3 ? (me.vx * ox + me.vz * oz) / rad : 0;

  // Recovery: near the edge and drifting out → charge back toward the middle.
  if (rad > R * 0.68 && outward > 0.8 && Math.random() < brain.awareness) {
    const aim = Math.atan2(-ox, -oz) + (Math.random() - 0.5) * 0.4;
    return { dx: Math.sin(aim), dz: Math.cos(aim), power: 0.75 + Math.random() * 0.25 };
  }

  // Power-ups: grab a nearby pepper (unless already on fire), or set off a bomb
  // with a crowd round it.
  if (pickups.length > 0 && Math.random() < brain.greed) {
    let pick: SumoPickup | null = null, pd = Infinity;
    for (const p of pickups) {
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      const worth = p.kind === 'pepper'
        ? !spicy && d < PEPPER_REACH
        : d < BOMB_REACH && others.filter((o) => o.alive && o !== me
          && Math.hypot(o.x - p.x, o.z - p.z) < BOMB_CROWD_R).length >= 2;
      if (worth && d < pd) { pd = d; pick = p; }
    }
    if (pick && pd > 0.5) {
      const aim = Math.atan2(pick.x - me.x, pick.z - me.z) + (Math.random() - 0.5) * brain.wobble;
      return { dx: Math.sin(aim), dz: Math.cos(aim), power: Math.min(1, 0.45 + pd / 14) };
    }
  }

  let best: SumoBody | null = null, bestScore = -Infinity;
  for (const o of others) {
    if (!o.alive || o === me) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    const edge = Math.hypot(o.x - cx, o.z - cz) / R;
    const score = (1 - brain.edgeHunter) / (1 + d / 7) + brain.edgeHunter * edge * 1.6 + Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  if (!best) return null;
  const tx = best.x + best.vx * LEAD - me.x, tz = best.z + best.vz * LEAD - me.z;
  const d = Math.hypot(tx, tz);
  if (d < 0.5) return null;
  const aim = Math.atan2(tx, tz) + (Math.random() - 0.5) * 2 * brain.wobble;
  // Closer targets need less power; always enough to actually connect.
  const power = Math.min(1, 0.55 + d / 14 + Math.random() * 0.25);
  return { dx: Math.sin(aim), dz: Math.cos(aim), power };
}
