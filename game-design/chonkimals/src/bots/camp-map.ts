/**
 * Camp Chonkton bot map — authored in CAMP-LOCAL coordinates (the same x/z
 * numbers as tools/build_camp.py, before WORLD_SCALE). The bot manager
 * transforms everything through the camp chunk's world matrix.
 *
 * To extend: add nav nodes/edges for new areas, add hotspots for new
 * minigames/spectator spots (give them a `group` so interest can be boosted
 * while that activity is live), and add keep-outs for new props.
 */

import { TENT_SITES } from '../tent-sites';

/** Camp-local distance from a tent's middle out to where visitors stand at its door. */
const TENT_DOOR = 3.4;

export type HotspotKind = 'minigame_start' | 'minigame_end' | 'spectate' | 'social';

export type XZ = readonly [number, number];

export interface HotspotDef {
  id: string;
  kind: HotspotKind;
  /** Activity this belongs to; interest can be boosted per group. */
  group?: string;
  center: XZ;
  /** Standing points are picked in the ring minRadius..radius around center. */
  radius: number;
  minRadius?: number;
  /** Where lingering bots look: a point, or the hotspot centre. */
  face?: XZ | 'center';
  weight: number;
  /** Soft cap; weight drops sharply once this many bots target it. */
  capacity: number;
  /** Seconds, before personality lingerScale. */
  linger: readonly [number, number];
  /** Chance-weighted hotspots to head to next (e.g. start → finish). */
  next?: readonly { id: string; chance: number }[];
}

// ── Navigation graph ─────────────────────────────────────────────────────────
// Nodes follow the dirt paths, detour around props, and only cross the river
// on the bridges.
export const NAV_NODES: Record<string, XZ> = {
  gate:         [0, 3],
  plaza:        [0, 14],
  plaza_w:      [-9, 18],
  bridge_s_w:   [3.5, 16],
  bridge_s_mid: [9.5, 16],
  bridge_s_e:   [15.5, 16],
  spine_27:     [0, 27],
  lake_path:    [-13, 27.5],
  dock:         [-24.8, 28],
  dock_end:     [-25, 32.5],
  spine_38:     [-1, 38],
  campfire:     [2, 35],
  tent_w:       [-1, 45],     // was a detour round the tent; the Troop HQ tent moved off the spine (troop-tent.ts)
  spine_50:     [-1, 50.5],
  hub_mid:      [-15, 54],
  hub_front:    [-23, 56],
  hub_s:        [-32, 52.5],
  forest:       [-50, 57.5],
  spine_64:     [0, 64],
  bridge_c_w:   [21.5, 65.3],
  bridge_c_mid: [28, 65.5],
  bridge_c_e:   [34.5, 65.8],
  cabins_yard:  [43, 61],
  spine_86:     [0, 86],
  dodge:        [-6, 90],
  // Sumo ring: a loop of nodes round the outside so bots walk AROUND the ring
  // (never across it) to reach the far side. 'sumo' is the one on the camp path.
  sumo_22:      [32.2, 97.1],
  sumo_68:      [25.1, 104.2],
  sumo_112:     [14.9, 104.2],
  sumo_158:     [7.8, 97.1],
  sumo:         [7.8, 86.9],
  sumo_248:     [14.9, 79.8],
  sumo_292:     [25.1, 79.8],
  sumo_338:     [32.2, 86.9],
  north:        [0, 108],
  // River banks (spectator walkways)
  wb_30:        [9, 30],
  wb_43:        [14.5, 43],
  wb_58:        [19, 58],
  eb_30:        [20, 30],
  eb_45:        [25.5, 45],
  eb_58:        [31, 57],
  // Down to the beach (the Lunch Delivery route): east bank → cliff ramp → picnic.
  beach_top:    [17.5, 8],
  ramp_top:     [15.5, -3.5],  // flat landing above the ramp
  ramp_crest:   [8.5, -3.5],
  ramp_mid:     [-20, -3.5],
  ramp_low:     [-55, -3.5],
  beach:        [-62, 4],
  picnic:       [-68, 12],
  shore:        [-78, 24],
  // Up the climb beyond the camp (the chunk path, camp-local): north exit → switchback →
  // west to the fork's zipline deck, or east up the steep branch to the glider launch.
  climb_0:      [0, 121],
  climb_1:      [0, 144],
  climb_2:      [0, 168],
  switchback:   [0, 180],
  climb_w1:     [-12, 180],
  climb_w2:     [-36, 180],
  climb_w3:     [-60, 180],
  fork:         [-72, 180],
  zip_path:     [-72, 172],
  zip_deck:     [-72, 166],
  climb_e1:     [12, 180],
  climb_e2:     [36, 180],
  climb_e3:     [60, 180],
  launch_pad:   [70, 180],
  launch_ramp:  [72, 172],
};

export const NAV_EDGES: readonly (readonly [string, string])[] = [
  ['gate', 'plaza'], ['plaza', 'plaza_w'], ['plaza', 'bridge_s_w'], ['plaza', 'spine_27'],
  ['plaza_w', 'lake_path'], ['spine_27', 'lake_path'], ['lake_path', 'dock'], ['dock', 'dock_end'],
  ['bridge_s_w', 'bridge_s_mid'], ['bridge_s_mid', 'bridge_s_e'], ['bridge_s_w', 'wb_30'],
  ['bridge_s_e', 'eb_30'], ['eb_30', 'eb_45'], ['eb_45', 'eb_58'], ['eb_58', 'bridge_c_e'],
  ['spine_27', 'wb_30'], ['spine_27', 'spine_38'], ['spine_38', 'campfire'], ['campfire', 'wb_30'],
  ['wb_30', 'wb_43'], ['wb_43', 'wb_58'], ['wb_58', 'bridge_c_w'],
  ['spine_38', 'tent_w'], ['tent_w', 'spine_50'],
  ['spine_50', 'hub_mid'], ['hub_mid', 'hub_front'], ['hub_front', 'hub_s'], ['hub_s', 'forest'],
  ['spine_50', 'spine_64'], ['spine_64', 'bridge_c_w'],
  ['bridge_c_w', 'bridge_c_mid'], ['bridge_c_mid', 'bridge_c_e'], ['bridge_c_e', 'cabins_yard'],
  ['spine_64', 'spine_86'], ['spine_86', 'dodge'], ['spine_86', 'sumo'], ['spine_86', 'north'],
  ['sumo_22', 'sumo_68'], ['sumo_68', 'sumo_112'], ['sumo_112', 'sumo_158'], ['sumo_158', 'sumo'], ['sumo', 'sumo_248'], ['sumo_248', 'sumo_292'], ['sumo_292', 'sumo_338'], ['sumo_338', 'sumo_22'],
  ['bridge_s_e', 'beach_top'], ['beach_top', 'ramp_top'], ['ramp_top', 'ramp_crest'], ['ramp_crest', 'ramp_mid'], ['ramp_mid', 'ramp_low'],
  ['ramp_low', 'beach'], ['beach', 'picnic'], ['picnic', 'shore'],
  ['north', 'climb_0'], ['climb_0', 'climb_1'], ['climb_1', 'climb_2'], ['climb_2', 'switchback'],
  ['switchback', 'climb_w1'], ['climb_w1', 'climb_w2'], ['climb_w2', 'climb_w3'], ['climb_w3', 'fork'],
  ['fork', 'zip_path'], ['zip_path', 'zip_deck'],
  ['switchback', 'climb_e1'], ['climb_e1', 'climb_e2'], ['climb_e2', 'climb_e3'], ['climb_e3', 'launch_pad'],
  ['launch_pad', 'launch_ramp'],
];

// ── Hotspots ─────────────────────────────────────────────────────────────────
const LOG_COURSE_FINISHES = [
  { id: 'log_finish_bridge', chance: 0.25 },
  { id: 'log_finish_w', chance: 0.15 },
  { id: 'log_finish_e', chance: 0.1 },
];

export const HOTSPOTS: readonly HotspotDef[] = [
  // River log course — start (south bridge) and finish (cabins bridge).
  { id: 'log_start_queue', kind: 'minigame_start', group: 'log_course', center: [2.5, 19], radius: 2.8,
    face: [9.5, 19], weight: 1.4, capacity: 7, linger: [3, 9], next: LOG_COURSE_FINISHES },
  { id: 'log_start_bridge', kind: 'minigame_start', group: 'log_course', center: [9, 16.5], radius: 2,
    face: [10, 24], weight: 1.2, capacity: 5, linger: [3, 8], next: LOG_COURSE_FINISHES },
  { id: 'log_finish_bridge', kind: 'minigame_end', group: 'log_course', center: [28, 66], radius: 2,
    face: [25, 55], weight: 0.8, capacity: 5, linger: [5, 12] },
  { id: 'log_finish_w', kind: 'minigame_end', group: 'log_course', center: [21, 61.5], radius: 2.2,
    face: [27, 60], weight: 0.6, capacity: 4, linger: [5, 12] },
  { id: 'log_finish_e', kind: 'minigame_end', group: 'log_course', center: [36, 61.5], radius: 2,
    face: [29, 60], weight: 0.5, capacity: 4, linger: [5, 12] },

  // River log course — spectator banks.
  { id: 'log_watch_w1', kind: 'spectate', group: 'log_course', center: [8.2, 27], radius: 1.4,
    face: [13, 27], weight: 1, capacity: 4, linger: [8, 22] },
  { id: 'log_watch_w2', kind: 'spectate', group: 'log_course', center: [12.3, 39], radius: 1.6,
    face: [17, 40], weight: 1, capacity: 4, linger: [8, 22] },
  { id: 'log_watch_w3', kind: 'spectate', group: 'log_course', center: [18, 52], radius: 1.5,
    face: [23.5, 53], weight: 0.9, capacity: 3, linger: [8, 22] },
  { id: 'log_watch_e1', kind: 'spectate', group: 'log_course', center: [19.2, 26], radius: 1.6,
    face: [12.8, 26], weight: 0.9, capacity: 4, linger: [8, 22] },
  { id: 'log_watch_e2', kind: 'spectate', group: 'log_course', center: [24.8, 41.5], radius: 1.6,
    face: [19, 42], weight: 0.9, capacity: 4, linger: [8, 22] },
  { id: 'log_watch_e3', kind: 'spectate', group: 'log_course', center: [30.5, 55.5], radius: 1.4,
    face: [25, 56], weight: 0.8, capacity: 3, linger: [8, 22] },

  // Future minigames — for now people just hang around them.
  // Arenas are 1.5x now: court players spread wider, spectators sit clear of the edges.
  { id: 'dodge_court', kind: 'minigame_start', group: 'dodgeball', center: [-10, 96], radius: 6,
    face: 'center', weight: 0.6, capacity: 6, linger: [6, 16] },
  { id: 'dodge_sideline', kind: 'spectate', group: 'dodgeball', center: [-10, 86.5], radius: 1.4,
    face: [-10, 96], weight: 0.4, capacity: 4, linger: [6, 16] },
  // Sumo — the crowd rings the ring (outside the apron keep-out) and watches the
  // regulars' attract match; interest is boosted while the player is in a match.
  { id: 'sumo_ring', kind: 'spectate', group: 'sumo', center: [20, 92], minRadius: 11.8, radius: 13.6,
    face: 'center', weight: 0.8, capacity: 12, linger: [8, 20] },

  // Lunch Delivery — campers queue by the cart at the Camp Hub, and gather at the
  // beach picnic (the delivery point) to wait for lunch. Interest in the group is
  // boosted while a delivery is under way and while the feast is out.
  { id: 'lunch_start', kind: 'minigame_start', group: 'lunch_delivery', center: [-15, 47.5], radius: 2,
    face: [-21, 56.4], weight: 0.5, capacity: 5, linger: [4, 10], next: [{ id: 'lunch_picnic', chance: 0.3 }] },
  { id: 'lunch_picnic', kind: 'minigame_end', group: 'lunch_delivery', center: [-73, 18], minRadius: 3.2, radius: 7,
    face: 'center', weight: 0.8, capacity: 10, linger: [10, 24] },
  { id: 'lunch_shore', kind: 'social', group: 'lunch_delivery', center: [-80, 26], radius: 3.5, face: [-78, 58],
    weight: 0.4, capacity: 5, linger: [8, 20] },

  // Rides at the top of the climb: bots queue on the zipline deck / glider ramp, then go
  // (BotManager hands them to the ride when their linger ends — see BotRideSpot).
  { id: 'zip_top', kind: 'minigame_start', group: 'zipline', center: [-72, 165.4], radius: 1.2,
    face: [-72, 140], weight: 0.35, capacity: 2, linger: [1.5, 4] },
  { id: 'glide_top', kind: 'minigame_start', group: 'glider', center: [72, 170.4], radius: 1.2,
    face: [72, 140], weight: 0.35, capacity: 2, linger: [1.5, 4] },

  // Social hangouts.
  { id: 'spawn_plaza', kind: 'social', center: [-3, 14], radius: 5, weight: 1.1, capacity: 8, linger: [4, 12] },
  { id: 'campfire', kind: 'social', center: [6, 40], minRadius: 3.3, radius: 4.6, face: 'center',
    weight: 1.2, capacity: 8, linger: [10, 25] },
  { id: 'hub_porch', kind: 'social', center: [-22.5, 55.5], radius: 2.8, face: [-32, 60],
    weight: 0.8, capacity: 5, linger: [6, 16] },
  { id: 'dock', kind: 'social', center: [-25, 31], radius: 1.2, face: [-40, 28],
    weight: 0.5, capacity: 3, linger: [8, 20] },
  { id: 'cabins_yard', kind: 'social', center: [43, 61], radius: 3, face: [46, 70],
    weight: 0.5, capacity: 4, linger: [6, 16] },
  { id: 'north_gate', kind: 'social', center: [0, 110], radius: 3, face: [0, 130],
    weight: 0.3, capacity: 4, linger: [4, 10] },

  // Everyone's tents (tent-sites.ts): campers drop by and hang out at the door, facing in.
  ...TENT_SITES.flatMap((site) => site.spots.map((sp, i): HotspotDef => {
    const dx = sp.face[0] - sp.at[0], dz = sp.face[1] - sp.at[1], d = Math.hypot(dx, dz) || 1;
    return {
      id: `tent_${site.id}_${i}`, kind: 'social', group: 'tents',
      center: [sp.at[0] + (dx / d) * TENT_DOOR, sp.at[1] + (dz / d) * TENT_DOOR], radius: 1.7, face: sp.at,
      weight: 0.2, capacity: 3, linger: [6, 16],
    };
  })),
];

// ── Keep-outs ────────────────────────────────────────────────────────────────
// Standing points inside these are rejected (unless inside an allow zone).
export type Shape =
  | { kind: 'circle'; c: XZ; r: number }
  | { kind: 'rect'; min: XZ; max: XZ }
  | { kind: 'polyline'; pts: readonly XZ[]; halfWidth: number };

export const KEEP_OUTS: readonly Shape[] = [
  { kind: 'polyline', pts: [[48, 100], [36, 78], [24, 54], [14, 30], [6, 4]], halfWidth: 3.4 }, // river
  { kind: 'circle', c: [48, 100], r: 8.8 },            // waterfall pool
  { kind: 'circle', c: [-40, 26], r: 17 },             // lake
  { kind: 'circle', c: [6, 40], r: 2.9 },              // fire pad
  { kind: 'circle', c: [-16.3, 21.1], r: 1.7 },        // Bulletin Board
  { kind: 'circle', c: [-18.0, 18.95], r: 1.0 },       // Mailbox
  { kind: 'rect', min: [-2, 41.5], max: [4, 48.5] },   // tent 1
  { kind: 'rect', min: [9, 46.5], max: [15, 53.5] },   // tent 2
  { kind: 'rect', min: [-38, 55], max: [-26, 65] },    // hub
  { kind: 'rect', min: [41.5, 66], max: [50.5, 74] },  // cabin 1
  { kind: 'rect', min: [47.5, 50], max: [56.5, 58] },  // cabin 2
  { kind: 'rect', min: [38, 99], max: [58, 118] },     // waterfall ledge
  { kind: 'circle', c: [20, 92], r: 11.4 },            // sumo ring + apron (spectators stay outside)
  { kind: 'circle', c: [9, 92], r: 1.1 },              // sumo banners
  { kind: 'circle', c: [31, 92], r: 1.1 },
  { kind: 'circle', c: [-70.3, 16.9], r: 1.7 },        // beach picnic tables
  { kind: 'circle', c: [-75.5, 16.2], r: 1.7 },
  { kind: 'circle', c: [-73, 20.5], r: 1.7 },
  ...TENT_SITES.flatMap((site) => site.spots.map((sp): Shape => ({ kind: 'circle', c: sp.at, r: 2.3 }))), // the tents
];

/** Walkable spots inside keep-outs (bridges, dock). */
export const ALLOW_ZONES: readonly Shape[] = [
  { kind: 'rect', min: [4.5, 13.6], max: [13.5, 18.4] },   // south bridge deck
  { kind: 'rect', min: [23.5, 63.6], max: [32.5, 68.4] },  // cabins bridge deck
  { kind: 'rect', min: [-26.3, 26.5], max: [-23.7, 33.8] }, // dock
];

function segDist(p: XZ, a: XZ, b: XZ): number {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}

export function inShape(p: XZ, s: Shape): boolean {
  switch (s.kind) {
    case 'circle': return Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) < s.r;
    case 'rect': return p[0] > s.min[0] && p[0] < s.max[0] && p[1] > s.min[1] && p[1] < s.max[1];
    case 'polyline':
      for (let i = 0; i < s.pts.length - 1; i++) if (segDist(p, s.pts[i], s.pts[i + 1]) < s.halfWidth) return true;
      return false;
  }
}

export function isStandable(p: XZ): boolean {
  if (ALLOW_ZONES.some((s) => inShape(p, s))) return true;
  return !KEEP_OUTS.some((s) => inShape(p, s));
}
