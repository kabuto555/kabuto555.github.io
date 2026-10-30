import { navGraph } from '../../ai/nav';
import type { AreaDef, LevelDsl } from '../types';

/**
 * M2 shooting range (south-center lane, shot from the spawn at z=24 facing -Z). Dummy meshes are
 * spawned by main.ts from this table (combat/dummy.ts); yaw PI faces +Z (toward the spawn).
 */
export const RANGE_DUMMIES: ReadonlyArray<{ x: number; z: number; yaw: number; label: string; shield?: boolean }> = [
  { x: -1.5, z: 19, yaw: Math.PI, label: 'dummy 5m' },
  { x: 1.5, z: 9.5, yaw: Math.PI, label: 'dummy 15m' },
  { x: -2, z: -6, yaw: Math.PI, label: 'dummy 30m' },
  { x: 4, z: 14, yaw: Math.PI, label: 'shield dummy 10m', shield: true },
];

/**
 * M3 enemy arena (south-east, x 10..32, z 17..32): a 2.6 m wall at x = 17 (z 20..29) separates the
 * lane side from three sword hollows, so they must path around either end. Crates give cover.
 * Nav graph: west side (w_*), east side (e_*), and two lane nodes back toward the spawn.
 */
export const GYM_NAV = navGraph({
  nodes: {
    lane_s: [5, 24.5],
    lane_n: [5, 18.3],
    w_mid: [12.5, 24.5],
    w_n: [13, 18.3],
    w_s: [13, 30.6],
    e_n: [21, 18.3],
    e_ne: [25, 18.3],
    e_mid: [21, 24.5],
    e_far: [27, 24.5],
    e_s: [21, 30.6],
  },
  links: ['lane_s-lane_n-w_n', 'lane_s-w_mid-w_n-e_n-e_ne-e_far', 'w_mid-w_s-e_s-e_mid-e_n', 'e_mid-e_far-e_s'],
});

/**
 * M1 greybox movement gym. Spawn at the south end (z = +24) facing north (-Z).
 * Color code: grey = walkable/step, orange = mantle-able (0.6–1.8 m), yellow = needs jump+mantle,
 * red = too high, blue = jump gaps, green = stairs/ramps.
 *
 *            N (-Z)
 *   [gap run, blue, h=1]                 [pillar field]
 *   [ledge row: 0.3 .. 3.2 m]
 *   [sprint lane, west]  [beam/ceiling]  [stairs | ramp | steep ramp → platform h=2]
 *                    spawn (0, 0, 24)
 */
export const GYM: AreaDef = {
  id: 'gym',
  name: 'Movement Gym',
  fog: { color: 0x5a6270, near: 18, far: 70 },
  spawn: { pos: [0, 0, 24], yaw: 0 },
  build(L: LevelDsl) {
    const S = 32; // half extent
    // floor + perimeter walls
    L.box(0, -1, 0, S * 2, 1, S * 2, 'floor');
    L.box(0, 0, -S - 0.5, S * 2 + 2, 6, 1, 'wall');
    L.box(0, 0, S + 0.5, S * 2 + 2, 6, 1, 'wall');
    L.box(-S - 0.5, 0, 0, 1, 6, S * 2, 'wall');
    L.box(S + 0.5, 0, 0, 1, 6, S * 2, 'wall');

    // --- ledge row (approach from +z): heights step → too high
    const ledges: Array<[number, string]> = [
      [0.3, 'grey'], // auto step-up
      [0.5, 'grey'], // jump onto (below mantle window)
      [0.9, 'orange'],
      [1.3, 'orange'],
      [1.8, 'orange'], // top of the mantle window
      [2.4, 'yellow'], // jump, then mantle in the air
      [3.2, 'red'], // too high
    ];
    ledges.forEach(([h, mat], i) => L.box(-15 + i * 4, 0, -10, 3, h, 3, mat));

    // --- stairs / ramps up to a 2 m platform (east)
    L.box(15, 0, 4.5, 20, 2, 6, 'stone'); // platform z 1.5..7.5, top y=2
    L.stairs(8, 0, 10, 3, 2, 5, '-z', 'green', 10); // 10 × 0.2 m
    L.ramp(14, 0, 11.5, 3, 2, 8, '-z', 'green'); // 14°
    L.ramp(20, 0, 9, 3, 2, 3, '-z', 'green'); // 34°
    L.box(24, 2, 4.5, 2, 0.3, 6, 'grey'); // small step on the platform
    // a side stair facing +x to test other facings
    L.stairs(2.5, 0, 4.5, 5, 2, 3, '+x', 'green', 8); // rises toward +x into the platform's west face

    // --- jump gaps (north-west): platforms at h=1, gaps 2/3/4/5 m (5 m is not makeable)
    L.stairs(-20, 0, -18, 4, 1, 4, '-z', 'green', 5);
    L.box(-20, 0, -22, 6, 1, 4, 'blue'); // x -23..-17
    const gaps = [2, 3, 4, 5];
    let x = -17;
    for (const g of gaps) {
      x += g;
      L.box(x + 1.5, 0, -22, 3, 1, 4, 'blue');
      x += 3;
    }

    // --- sprint lane (west): 56 m with posts every 4 m
    for (let z = -26; z <= 26; z += 4) {
      L.box(-28.5, 0, z, 0.3, 1.2, 0.3, 'metal');
      L.box(-23.5, 0, z, 0.3, 1.2, 0.3, 'metal');
    }

    // --- low beam (ceiling bump when jumping) on two posts
    L.box(-8, 0, 8, 0.6, 2.2, 0.6, 'wood');
    L.box(-2, 0, 8, 0.6, 2.2, 0.6, 'wood');
    L.box(-5, 2.2, 8, 7, 0.3, 2.5, 'wood');

    // --- pillar field (north-east) for strafing / collide-and-slide
    for (let px = 18; px <= 28; px += 4) for (let pz = -26; pz <= -14; pz += 4) L.box(px, 0, pz, 0.9, 5, 0.9, 'brick');

    // --- angled wall corner (slide test) + an invisible barrier strip
    L.box(-14, 0, 14, 8, 3, 0.6, 'wall');
    L.box(-18.3, 0, 17, 0.6, 3, 6.6, 'wall');
    // --- shooting range (M2): distance pads on the lane at 5 / 10 / 15 / 20 / 30 m from the spawn
    for (const m of [5, 10, 15, 20, 30]) L.box(0, 0, 24 - m, 3, 0.04, 0.4, m % 10 === 0 ? 'yellow' : 'orange');
    L.barrier(0, 0, -30, 10, 4, 0.5, 'construction', { id: 'gym_barrier', label: 'Blocked' });

    // --- M3 enemy arena (see GYM_NAV)
    L.box(17, 0, 24.5, 1, 2.6, 9, 'wall'); // divider: x 16.5..17.5, z 20..29
    L.box(23, 0, 21, 1.2, 1.2, 1.2, 'wood'); // crates
    L.box(26, 0, 28.5, 1.5, 1, 1.5, 'wood');
    L.spawn('hollow_sword', [24, 0, 24.5], { yaw: Math.PI / 2, id: 'gym_hollow_1' }); // facing -X (the wall)
    L.spawn('hollow_sword', [27.5, 0, 20], { yaw: Math.PI / 2, id: 'gym_hollow_2' });
    // --- M4 loot corner (north-west of spawn, x -12..-4, z 28..31): two items, a chest, a locked door + key, an ammo cache
    L.item('gym_item_1', [-10, 0, 27], 'ground', [{ id: 'dogtags_lost_operator', count: 3 }]);
    L.item('gym_item_2', [-8, 0, 27], 'ground', [{ id: 'revolver_357', count: 1 }]);
    L.item('gym_key', [-6, 0, 27], 'ground', [{ id: 'residence_key', count: 1 }]);
    L.chest('gym_chest', [-10, 0, 30], [{ id: 'frag_grenade', count: 3 }, { id: 'plate_carrier', count: 1 }], Math.PI);
    L.cache([-4, 0, 28], { ammo: { rifle: 60, pistol: 24 } });
    L.box(-5.7, 0, 31, 1, 3, 0.4, 'wall'); // pillars + header around the 1.6 m doorway (x -7.8..-6.2)
    L.box(-8.4, 0, 31, 1.2, 3, 0.4, 'wall');
    L.box(-7, 2.2, 31, 1.6, 0.8, 0.4, 'wall');
    L.door('gym_door', [-7, 0, 31], 'residence_key', { yaw: 0, w: 1.6, h: 2.2 });
    L.item('gym_vault_item', [-7, 0, 31.8], 'ground', [{ id: 'basement_key', count: 1 }]); // behind the door

    L.spawn('hollow_sword', [28, 0, 27.5], { yaw: Math.PI * 0.75, id: 'gym_hollow_3' });
  },
};
