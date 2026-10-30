import { navGraph } from '../../ai/nav';
import { FOG_PRESETS } from '../../render/fog';
import type { NpcSpec } from '../npcs';
import type { PropsBuilder } from '../props';
import type { AreaDef, LevelDsl } from '../types';

/**
 * M5 Firelink Shrine (§10). Plaza in the south (z -14..34), canyon north of it (z < -14) carrying the
 * stairs + aqueduct deck up to the Burg exit. -Z is north. Y up, deck at y = 4.
 *
 *   cliffs                                     N (-Z)
 *   [exit trigger @ z=-60]  <- deck (x -3..3, y 4) over a canyon, 4 hollows, ledge F7 (west, +1.4 m)
 *                           stairs (z -20..-12) up from the plaza
 *   [well alcove 🚧]  [Crestfallen]  BONFIRE  [Petrus]  [ruined shrine, chest F4 on a ledge]
 *   plaza (spawn = bonfire + 3 m south)                                     [elevator 🚧]
 *   [graveyard gate 🚧, skeletons behind]
 */

export const FIRELINK_BONFIRE_ID = 'firelink';
export const FIRELINK_BONFIRE: readonly [number, number, number] = [0, 0, -1];

const faceYaw = (from: readonly [number, number, number], to: readonly [number, number, number]) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

/** Static NPCs (npcs.ts). E on the Crestfallen Warrior emits `npcTalk`, on Petrus `shopOpen`. */
export const FIRELINK_NPCS: readonly NpcSpec[] = [
  {
    id: 'crestfallen_warrior',
    name: 'Crestfallen Warrior',
    model: 'crestfallen',
    pos: [-5.5, 0, -7.5],
    yaw: faceYaw([-5.5, 0, -7.5], FIRELINK_BONFIRE),
    lines: [
      'Hmph... another one. Do not go looking for glory out there.',
      'The ones behind the barrier... even the hollows are on a break.',
      'I tried to leave once. They put up a sign. ROAD CLOSED. Can you believe it?',
      'Keep your pistol topped up. Rest here, and the world forgives you. Mostly.',
    ],
  },
  {
    id: 'petrus',
    name: 'Petrus',
    model: 'petrus',
    pos: [6.5, 0, -4.5],
    yaw: faceYaw([6.5, 0, -4.5], FIRELINK_BONFIRE),
    shopId: 'petrus_firelink',
  },
];

/** Waypoints for the stairs/aqueduct hollows (y matters: the deck is at 4). */
export const FIRELINK_NAV = navGraph({
  nodes: {
    plaza: [0, 0, 2],
    plaza_n: [0, 0, -8],
    s_bot: [0, 0.2, -12.5],
    s_mid: [0, 2, -16],
    s_top: [0, 4, -20.5],
    d1: [0, 4, -26],
    d2: [0, 4, -33],
    d3: [0, 4, -44],
    d4: [0, 4, -54],
    d_end: [0, 4, -59],
  },
  links: ['plaza-plaza_n-s_bot-s_mid-s_top-d1-d2-d3-d4-d_end'],
});

/** Area exit triggers (main.ts emits `areaExit {to}` when the player's feet enter the box). */
export const FIRELINK_EXITS: ReadonlyArray<{ id: string; to: string; min: readonly [number, number, number]; max: readonly [number, number, number] }> = [
  { id: 'exit_burg', to: 'burg', min: [-3, 3.5, -61.8], max: [3, 6, -59.2] },
];

/** `__game.area.teleport(name)` targets. */
export const FIRELINK_TELEPORTS: Record<string, { pos: readonly [number, number, number]; yaw: number }> = {
  plaza: { pos: [0, 0, 1.2], yaw: 0 },
  shrine: { pos: [-9, 0, -4], yaw: Math.PI * 0.5 },
  graveyard: { pos: [-20, 0, 14], yaw: Math.PI },
  elevator: { pos: [20, 0, 14], yaw: -Math.PI / 2 },
  well: { pos: [-22, 0, 11], yaw: Math.PI },
  stairs: { pos: [0, 0, -8], yaw: 0 },
  aqueduct: { pos: [0, 4, -22], yaw: 0 },
  deck: { pos: [0, 4, -40], yaw: 0 },
  exit: { pos: [0, 4, -56], yaw: 0 },
};

/** Instanced props (crates, rubble, skeleton silhouettes). Barrier pylons/signs come from the barrier ops. */
export function firelinkProps(p: PropsBuilder): void {
  // Petrus's stall + stock
  p.crate(9.4, 0, -6.4, 1.1, 1.0, 1.1);
  p.crate(9.4, 1.0, -6.4, 0.7, 0.7, 0.7, 0.3);
  p.crate(10.6, 0, -5.4, 0.9, 0.8, 0.9);
  // shrine ruin clutter
  p.rubble(-10.5, 0, -11, 1.4, 0.4);
  p.rubble(11, 0, -11, 1.8, 1.2);
  p.rubble(-3.8, 0, 9, 0.9, 0.2);
  p.rubble(8.5, 0, 12, 1.1, 2.1);
  p.rubble(16.5, 0, -6, 1.0, 0.7);
  p.rubble(-14, 0, 2, 1.3, 1.0);
  // elevator side
  p.crate(24.2, 0, 17.4, 1.2, 1.2, 1.2);
  p.rubble(23, 0, 9, 1.2, 0.5);
  // aqueduct deck cover + debris
  p.crate(2.0, 4, -38, 1.1, 1.0, 1.1);
  p.crate(-1.8, 4, -49, 1.0, 0.9, 1.0);
  p.rubble(-2.2, 4, -28, 1.0, 0.3);
  p.rubble(2.0, 4, -56, 1.2, 1.7);
  // graveyard: idle skeletons behind the gate (non-aggro, unreachable)
  const yard: Array<[number, number, number]> = [
    [-25, 25.5, 0.4],
    [-22.4, 27.5, 2.5],
    [-20, 24.6, 3.9],
    [-17.6, 28, 5.6],
    [-15, 25.2, 1.1],
    [-23, 30, 4.4],
    [-18.5, 31, 0.2],
    [-27.5, 28.5, 2.9],
  ];
  for (const [x, z, yaw] of yard) p.skeleton(x, 0, z, yaw);
}

export const FIRELINK: AreaDef = {
  id: 'firelink',
  name: 'Firelink Shrine',
  fog: { ...FOG_PRESETS.firelink },
  spawn: { pos: [0, 0, 1.2], yaw: 0 },
  build(L: LevelDsl) {
    // ---------------------------------------------------------------- ground + perimeter
    L.box(0, -1, 10, 84, 1, 48, 'floor'); // plaza + wings: x -42..42, z -14..34
    L.box(0, -1, -40, 29, 1, 52, 'floor'); // canyon: x -14.5..14.5, z -66..-14
    L.box(0, 0, 2, 24, 0.06, 28, 'grey'); // plaza paving, x -12..12, z -12..16
    L.box(0, 0, -9, 6, 0.06, 5, 'grey');
    L.box(0, 0, 34.6, 85, 6, 1.2, 'stone'); // south
    L.box(-42.6, 0, 10, 1.2, 8, 48.5, 'stone'); // west
    L.box(42.6, 0, 10, 1.2, 8, 48.5, 'stone'); // east
    // north cliff line (z -14), broken by the stair gap x -2.5..2.5
    L.box(-22.25, 0, -14.6, 39.5, 8, 1.2, 'wall');
    L.box(22.25, 0, -14.6, 39.5, 8, 1.2, 'wall');
    // canyon walls + far end
    L.box(-15.1, 0, -40, 1.2, 9, 51, 'stone');
    L.box(15.1, 0, -40, 1.2, 9, 51, 'stone');
    // (no end wall: the deck continues into the Burg's aqueduct room, see burg.ts)

    // ---------------------------------------------------------------- bonfire plaza + shrine ruins
    L.bonfire(FIRELINK_BONFIRE_ID, [...FIRELINK_BONFIRE]);
    // broken colonnade framing the plaza (heights vary: ruined)
    for (const [x, z, h] of [
      [-9.5, -9, 3.8],
      [9.5, -9, 2.2],
      [-9.5, 6, 1.6],
      [9.5, 6, 3.4],
      [-9.5, 12, 2.6],
      [9.5, 12, 1.2],
    ] as const) {
      L.box(x, 0, z, 1.0, h, 1.0, 'stone');
      L.box(x, 0, z, 1.5, 0.35, 1.5, 'stone'); // plinth
    }
    L.box(-6, 0, -10, 5.5, 1.2, 0.6, 'stone'); // low ruin wall behind the Crestfallen Warrior
    L.box(-3.2, 0, -10.8, 0.6, 1.2, 2.4, 'stone');
    L.box(8.4, 0, -4.5, 0.8, 0.95, 1.8, 'wood'); // Petrus's stall counter

    // ruined shrine building (NE): doorway on the south side (x 18..20); chest ledge at the back
    L.box(19, 0, -12.4, 9.6, 3.4, 0.8, 'wall'); // north wall (touches the cliff)
    L.box(14.6, 0, -8.2, 0.8, 3.4, 8.4, 'wall'); // west
    L.box(23.4, 0, -8.2, 0.8, 3.4, 8.4, 'wall'); // east
    L.box(16.2, 0, -4.2, 3.9, 3.0, 0.8, 'wall'); // south, west of the door
    L.box(21.9, 0, -4.2, 3.9, 2.0, 0.8, 'wall'); // south, east of the door (collapsed lower)
    L.box(19, 3.0, -4.2, 2.0, 0.5, 0.8, 'wall'); // lintel
    L.box(21.2, 0, -10.8, 3.4, 1.2, 2.4, 'stone'); // F4 ledge (mantle up), x 19.5..22.9, z -12..-9.6
    L.chest('F4', [21.2, 1.2, -10.8], [{ id: 'revolver_357', count: 1 }, { id: 'ammo_crate_small', count: 1 }], Math.PI);
    L.cache([-10, 0, -6], { ammo: { rifle: 30, pistol: 16, smg: 24 } }); // shrine ruins cache

    // ---------------------------------------------------------------- F items (contents filled later)
    L.item('F1', [-6.5, 0, -11.2], 'slumped', [{ id: 'extraction_flare', count: 2 }]); // shrine ruins, behind the Crestfallen Warrior
    L.item('F2', [-27, 2, -8], 'sitWall', [{ id: 'dogtags_lost_operator', count: 1 }]); // upper ruins ledge by the well
    L.item('F3', [25, 0, 12.5], 'facedown', [{ id: 'scavenger_patch', count: 1 }]); // cliff edge, in front of the elevator barrier
    L.item('F5', [-20, 0, 19.6], 'ground', [{ id: 'fast_helmet', count: 1 }]); // graveyard gate, in front of the barrier
    L.item('F6', [1.8, 4, -22.4], 'facedown', [{ id: 'molotov', count: 3 }]); // aqueduct stairs (top)
    L.item('F7', [-6, 5.4, -40], 'sitWall', [{ id: 'dogtags_large', count: 1 }]); // aqueduct upper ledge (mantle only)

    // ---------------------------------------------------------------- well (blocked) + upper ledge
    L.box(-22, 0, 1.2, 2.6, 1.0, 2.6, 'stone'); // well ring
    L.box(-22, 1.0, 1.2, 2.0, 0.05, 2.0, 'metal'); // dark cover
    L.box(-23.3, 0, 1.2, 0.18, 2.6, 0.18, 'wood'); // frame
    L.box(-20.7, 0, 1.2, 0.18, 2.6, 0.18, 'wood');
    L.box(-22, 2.5, 1.2, 2.9, 0.18, 0.18, 'wood');
    L.box(-27.5, 0, 1.8, 0.8, 4, 8.4, 'wall'); // alcove west
    L.box(-16.5, 0, 1.8, 0.8, 4, 8.4, 'wall'); // alcove east
    L.box(-22, 0, -2.4, 11.8, 4, 0.8, 'wall'); // alcove back (north)
    L.barrier(-22, 0, 5.6, 10.8, 4, 0.6, 'construction', { id: 'barrier_well', label: 'Well' });
    // upper ruins ledge, reached by stairs from the plaza side (x -23..-18)
    L.box(-27, 0, -8, 8, 2.0, 8, 'stone'); // top y=2, x -31..-23, z -12..-4
    L.stairs(-20.5, 0, -8, 5, 2.0, 3.6, '-x', 'stone', 10);
    L.box(-27, 2, -11.7, 7.6, 0.8, 0.5, 'wall'); // parapet fragments
    L.box(-30.7, 2, -8, 0.5, 1.6, 7.6, 'wall');

    // ---------------------------------------------------------------- elevator (blocked)
    L.box(31.2, 0, 15, 6.4, 0.4, 6.4, 'metal'); // platform
    L.box(34.6, 0, 15, 0.8, 7, 7.2, 'metal'); // back
    L.box(31.2, 0, 11.8, 6.8, 7, 0.8, 'metal'); // sides
    L.box(31.2, 0, 18.2, 6.8, 7, 0.8, 'metal');
    L.box(31.2, 5, 15, 6.8, 0.6, 6.4, 'metal'); // roof / winch
    L.barrier(27.6, 0, 15, 0.6, 4, 6.4, 'construction', { id: 'barrier_elevator', label: 'Elevator' });
    L.box(25.5, 0, 9.4, 0.5, 1.0, 5.0, 'stone'); // cliff-edge low wall (decor)

    // ---------------------------------------------------------------- graveyard gate (blocked) + yard
    L.box(-29.0, 0, 22, 11.0, 3.6, 1.0, 'wall'); // gate wall W (x -34.5..-23.5)
    L.box(-11.8, 0, 22, 9.2, 3.6, 1.0, 'wall'); // gate wall E (x -16.4..-7.2)
    L.box(-23.9, 0, 22, 1.0, 4.6, 1.2, 'stone'); // gate pillars
    L.box(-16.1, 0, 22, 1.0, 4.6, 1.2, 'stone');
    L.box(-20, 4.0, 22, 8.0, 0.6, 1.2, 'stone'); // lintel
    L.box(-34.8, 0, 28.5, 0.8, 3.6, 12.5, 'wall'); // yard west wall
    L.box(-6.8, 0, 28.5, 0.8, 3.6, 12.5, 'wall'); // yard east wall
    L.barrier(-20, 0, 21.6, 7.4, 4, 0.6, 'construction', { id: 'barrier_graveyard', label: 'Graveyard' });
    // tombstones (stone slabs) in the yard
    for (const [x, z] of [[-28, 26], [-24.5, 29.5], [-21.5, 27], [-19, 30.5], [-13, 27.5], [-10, 30]] as const) L.box(x, 0, z, 0.7, 1.0, 0.25, 'stone');

    // ---------------------------------------------------------------- stairs + aqueduct up to the Burg
    L.stairs(0, 0, -16, 5, 4, 8, '-z', 'stone', 20); // z -20..-12 up to y=4
    L.box(-2.85, 0, -16, 0.6, 5.2, 8, 'wall'); // stair side walls
    L.box(2.85, 0, -16, 0.6, 5.2, 8, 'wall');
    L.box(0, 3.5, -41.5, 6, 0.5, 43, 'stone'); // deck: z -63..-20, top y=4 (z -20 butts the stair top)
    for (const z of [-26, -34, -48, -56]) {
      L.box(-2.5, 0, z, 0.9, 3.5, 0.9, 'brick'); // piers + cross beams (aqueduct arches)
      L.box(2.5, 0, z, 0.9, 3.5, 0.9, 'brick');
      L.box(0, 3.0, z, 5.9, 0.5, 0.9, 'brick');
    }
    // parapets (1.2 m), gap on the west at the F7 ledge (z -42.5..-37.5)
    L.box(3.0, 4, -41.5, 0.5, 1.2, 43, 'brick');
    L.box(-3.0, 4, -52.8, 0.5, 1.2, 20.4, 'brick'); // z -63..-42.6
    L.box(-3.0, 4, -29.3, 0.5, 1.2, 18.6, 'brick'); // z -38.6..-20
    L.box(-6, 0, -40, 6.0, 5.4, 5, 'stone'); // F7 ledge: top y=5.4, x -9..-3, z -42.5..-37.5
    L.box(-8.2, 5.4, -40, 0.6, 0.8, 4.4, 'brick'); // back lip
    L.cache([-2.2, 4, -35.2], { ammo: { rifle: 30, pistol: 12, shotgun: 6 } }); // aqueduct cache
    // far end: gate to the Burg (placeholder fog wall; trigger in FIRELINK_EXITS)
    L.box(-2.6, 4, -63.4, 0.9, 3.4, 1.6, 'stone');
    L.box(2.6, 4, -63.4, 0.9, 3.4, 1.6, 'stone');
    L.barrier(0, 4, -62.9, 6, 4.4, 0.5, 'fogWall', { id: 'exit_burg', label: 'To the Undead Burg' });

    // ---------------------------------------------------------------- hollows on the way (sword)
    L.spawn('hollow_sword', [-1.5, 4, -25], { yaw: Math.PI, id: 'F_hollow_1' }); // yaw PI faces +Z (down the stairs)
    L.spawn('hollow_sword', [1.5, 4, -33], { yaw: Math.PI, id: 'F_hollow_2' });
    L.spawn('hollow_sword', [-1, 4, -45], { yaw: Math.PI, id: 'F_hollow_3' });
    L.spawn('hollow_sword', [1, 4, -54], { yaw: Math.PI, id: 'F_hollow_4' });
  },
};
