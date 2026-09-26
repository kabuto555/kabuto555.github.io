// Where the camp's tents stand (data only — camp-tents.ts builds them; the bots' map
// (bots/camp-map.ts) makes each one a spot to hang out at).

export type TentSiteId = 'campfire' | 'beach' | 'meadow';

export interface TentSite {
  id: TentSiteId;
  label: string;
  emoji: string;
  /** Camp-local XZ of the site's heart (its fire, or the middle of the tents). */
  centre: readonly [number, number];
  /** Tents: camp-local XZ + the camp-local point the door faces. Spot 0 is the player's. */
  spots: readonly { at: readonly [number, number]; face: readonly [number, number] }[];
  /** A new campfire at the centre (the campfire site already has one). */
  newFire?: boolean;
}

const FIRE: readonly [number, number] = [6, 40]; // build_camp.py FCX, FCZ
const BEACH_FIRE: readonly [number, number] = [-90, 14];
const MEADOW_FACE: readonly [number, number] = [-2, 107];

export const TENT_SITES: readonly TentSite[] = [
  {
    id: 'campfire', label: 'Campfire Circle', emoji: '🔥', centre: FIRE,
    // Spread over the grass east of the spine path (≥ 11 apart, so they don't crowd): east of
    // the fire, up where the old camp path ran, and across the cabins path facing the spine —
    // all clear of the benches, the river and the bots' walking routes (camp-map.ts).
    spots: [{ at: [10.5, 46], face: FIRE }, { at: [9, 57], face: FIRE }, { at: [8.5, 73], face: [0, 71] }],
  },
  {
    id: 'beach', label: 'Beach Picnic', emoji: '🏖️', centre: BEACH_FIRE, newFire: true,
    spots: [{ at: [-90, 22.5], face: BEACH_FIRE }, { at: [-98.5, 15], face: BEACH_FIRE }, { at: [-92.5, 6], face: BEACH_FIRE }],
  },
  {
    id: 'meadow', label: 'Trailhead Meadow', emoji: '🌲', centre: [-11.5, 107.5],
    spots: [{ at: [-13, 106.5], face: MEADOW_FACE }, { at: [-11.5, 96], face: MEADOW_FACE }, { at: [-11, 116.5], face: MEADOW_FACE }],
  },
];
