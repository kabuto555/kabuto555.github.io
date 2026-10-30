import { WaypointGraph, navGraph } from '../../ai/nav';
import { FOG_PRESETS } from '../../render/fog';
import type { LadderSpec } from '../ladder';
import type { NpcSpec } from '../npcs';
import type { PropsBuilder } from '../props';
import type { AreaDef, LevelDsl } from '../types';
import { FIRELINK_NAV } from './firelink';
import { buildTaurusArena } from './taurus';

/**
 * M7 Undead Burg (§10 beats 1-9), blocky scale. It lives in the SAME scene as Firelink (approach (a)):
 * world coordinates continue north (-Z) from the aqueduct deck end (0, 4, -63). Y up; the Burg street level is y = 4.
 *
 *   FIRELINK deck ─▶ [1 aqueduct room]─corridor─▶ [2 courtyard]──stairs(↑y9)──▶ [terrace/merchant ledge y9] ─ [Residence 🔒]
 *                                                    │ house (firebomb, y4/y9, basement) west of the courtyard
 *                                                    └ side street (B10)            ledge stairs ↓
 *   [5 bonfire yard y4] ─ rampart stairs ↑ ─▶ [6 rampart y12 ▲ N] ─ BK stairs ↓ ─▶ [7 Black Knight arena y4]
 *        └ west alley (B9)        crossbow tower (east)    └ Watchtower (key door ↔ shortcut corridor back to the yard)
 *   [8 watchtower: ladder ↑ y20, catwalk, plunge ledge] ... [9 fog wall] ─▶ Taurus bridge (north)
 */

export const BURG_BONFIRE_ID = 'burg';
export const BURG_BONFIRE: readonly [number, number, number] = [50, 4, -176];

/** Taurus bridge contract: 8 m x 60 m along local +Z, deck top at origin y. yaw PI -> the bridge runs north (-Z). */
export const BURG_TAURUS_ORIGIN = { pos: [79, 12, -268] as [number, number, number], yaw: Math.PI };
/** World position of the plunge-ledge point at local (0, +8, 14) of the Taurus origin (yaw PI mirrors x and z). */
export const BURG_PLUNGE_POINT: readonly [number, number, number] = [79, 20, -282];

const faceYaw = (from: readonly [number, number, number], to: readonly [number, number, number]) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

export const BURG_NPCS: readonly NpcSpec[] = [
  {
    id: 'undead_merchant',
    name: 'Undead Merchant',
    model: 'merchant',
    pos: [56, 9, -132],
    yaw: faceYaw([56, 9, -132], [48, 9, -118]),
    shopId: 'burg_merchant',
  },
];

/** Climbable ladders (ladder.ts). Tower west face -> roof (the plunge-ledge catwalk starts on the roof). */
export const BURG_LADDERS: readonly LadderSpec[] = [{ id: 'watchtower', x: 88, z: -248, yBottom: 12, yTop: 20, n: [-1, 0] }];

/**
 * Scripted trigger volumes (feet inside the box) the AI agent can hook.
 * `barrelRoll`: when the player enters, the Barrel Hollow `spawnId` at the stair top starts its roll down `dir` to `to`.
 * `crossbowAlert`: wake the tower crossbows when the player steps onto the rampart.
 */
export interface BurgTrigger {
  id: string;
  kind: 'barrelRoll' | 'crossbowAlert';
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Spawn-op placement id of the enemy to activate. */
  spawnId?: string;
  from?: readonly [number, number, number];
  to?: readonly [number, number, number];
}
export const BURG_TRIGGERS: readonly BurgTrigger[] = [
  { id: 'trg_barrel_stairs', kind: 'barrelRoll', min: [39, 4, -104], max: [49, 7, -96], spawnId: 'B_barrel_hollow', from: [44, 9, -110], to: [44, 4, -92] },
  { id: 'trg_crossbow_rampart', kind: 'crossbowAlert', min: [74, 11.5, -200], max: [84, 14, -176] },
];

/** `__game.area.teleport(name)` targets. */
export const BURG_TELEPORTS: Record<string, { pos: readonly [number, number, number]; yaw: number }> = {
  burg_entry: { pos: [0, 4, -66], yaw: 0 },
  burg_corner: { pos: [10, 4, -74], yaw: -Math.PI / 2 },
  courtyard: { pos: [30, 4, -66], yaw: -Math.PI / 2 },
  stairs: { pos: [44, 4, -97], yaw: 0 },
  terrace: { pos: [44, 9, -114], yaw: 0 },
  house_ground: { pos: [14, 4, -90], yaw: -Math.PI / 2 },
  house_upper: { pos: [22, 9, -101], yaw: Math.PI },
  basement: { pos: [6, 0, -86], yaw: Math.PI / 2 },
  merchant: { pos: [50, 9, -126], yaw: -Math.PI / 4 },
  residence: { pos: [64, 9, -132], yaw: -Math.PI / 2 },
  burg_bonfire: { pos: [50, 4, -172], yaw: 0 },
  alley: { pos: [8, 4, -166], yaw: Math.PI / 2 },
  rampart: { pos: [79, 12, -168], yaw: 0 },
  crossbow: { pos: [79, 12, -196], yaw: 0 },
  blackknight: { pos: [58, 4, -234], yaw: Math.PI / 2 },
  ladder: { pos: [86, 12, -248], yaw: -Math.PI / 2 },
  tower_top: { pos: [96, 20, -250], yaw: Math.PI / 2 },
  plunge: { pos: [BURG_PLUNGE_POINT[0], 20.05, BURG_PLUNGE_POINT[2]], yaw: 0 },
  stash: { pos: [93, 12, -252], yaw: Math.PI / 2 },
  fog: { pos: [79, 12, -262], yaw: 0 },
  bridge: { pos: [79, 12, -272], yaw: Math.PI },
};

const N = (...a: number[]) => a as unknown as [number, number, number];

/** Burg waypoint graph merged onto Firelink's (the aqueduct's last node links to the Burg entry). */
const BURG_ONLY = navGraph({
  nodes: {
    b_in: N(0, 4, -66),
    r1_c: N(0, 4, -72),
    r1_e: N(5, 4, -74),
    cor1: N(12, 4, -74),
    cor2: N(24, 4, -74),
    cy_w: N(30, 4, -74),
    cy_c: N(44, 4, -80),
    cy_sw: N(32, 4, -64),
    cy_se: N(58, 4, -64),
    cy_nw: N(32, 4, -94),
    cy_ne: N(58, 4, -94),
    st_bot: N(44, 4, -99),
    st_mid: N(44, 6.5, -104),
    st_top: N(44, 9, -109),
    t_c: N(44, 9, -118),
    t_w: N(34, 9, -118),
    t_ne: N(60, 9, -112),
    t_merch: N(54, 9, -128),
    t_n: N(40, 9, -136),
    t_nw: N(32, 9, -139),
    sd_top: N(32, 9, -144),
    sd_bot: N(32, 4, -151),
    h_e: N(30, 4, -87),
    h_in: N(21, 4, -87),
    h_sb: N(22, 4, -89),
    h_sm: N(23, 6.5, -95),
    h_st: N(23, 9, -100),
    h_up: N(14, 9, -96),
    h_door: N(23, 9, -105),
    w_1: N(23, 9, -110),
    y_c: N(32, 4, -160),
    y_e: N(52, 4, -162),
    y_b: N(50, 4, -172),
    rs_bot: N(60, 4, -166),
    rs_top: N(74, 12, -166),
    rp_0: N(79, 12, -170),
    rp_1: N(79, 12, -190),
    rp_2: N(79, 12, -215),
    rp_3: N(79, 12, -230),
    rp_4: N(79, 12, -250),
    rp_5: N(79, 12, -262),
    bk_top: N(74, 12, -234),
    bk_bot: N(60, 4, -234),
    bk_c: N(44, 4, -248),
  },
  links: [
    'b_in-r1_c-r1_e-cor1-cor2-cy_w-cy_c-cy_nw',
    'cy_w-cy_sw-cy_se-cy_ne-cy_nw',
    'cy_c-st_bot-st_mid-st_top-t_c-t_w',
    't_c-t_ne',
    't_c-t_merch-t_n-t_nw-sd_top-sd_bot-y_c-y_e-y_b',
    'y_e-rs_bot-rs_top-rp_0-rp_1-rp_2-rp_3-rp_4-rp_5',
    'rp_3-bk_top-bk_bot-bk_c',
    'cy_nw-h_e-h_in-h_sb-h_sm-h_st-h_up',
    'h_st-h_door-w_1-t_w',
  ],
});

export const BURG_NAV: WaypointGraph = (() => {
  const nodes = [...FIRELINK_NAV.nodes, ...BURG_ONLY.nodes];
  const names = [...FIRELINK_NAV.names, ...BURG_ONLY.names];
  const off = FIRELINK_NAV.nodes.length;
  const edges: [number, number][] = [...FIRELINK_NAV.edges, ...BURG_ONLY.edges.map(([a, b]): [number, number] => [a + off, b + off])];
  edges.push([FIRELINK_NAV.names.indexOf('d_end'), off + BURG_ONLY.names.indexOf('b_in')]);
  return new WaypointGraph(nodes, edges, names);
})();

/** Instanced props: crates, rubble, barrels' worth of clutter. 'construction' barriers are dressed by the barrier ops. */
export function burgProps(p: PropsBuilder): void {
  // aqueduct room + corridor
  p.crate(-4.6, 4, -76.4, 1.2, 1.0, 1.2, 0.3);
  p.rubble(4, 4, -66, 1.0, 0.4);
  p.rubble(18, 4, -75.5, 0.9, 1.2);
  // courtyard
  p.crate(62, 4, -62, 1.2, 1.1, 1.2);
  p.crate(62, 5.1, -62, 0.8, 0.8, 0.8, 0.5);
  p.crate(29, 4, -96, 1.0, 1.0, 1.0);
  p.crate(60, 4, -90, 1.1, 0.9, 1.1, 0.2);
  p.rubble(36, 4, -80, 1.4, 0.8);
  p.rubble(52, 4, -70, 1.1, 2.2);
  p.rubble(46, 4, -90, 0.9, 0.1);
  // house + basement (gap kept at the stair foot)
  p.crate(6.4, 0, -87.4, 1.1, 1.0, 1.1);
  p.crate(6.4, 0, -84.8, 1.0, 0.9, 1.0, 0.4);
  p.crate(13, 9, -86, 1.0, 1.0, 1.0);
  // terrace + merchant stall
  p.crate(59, 9, -137, 1.2, 1.0, 1.2);
  p.crate(60.4, 9, -135.6, 0.8, 0.7, 0.8, 0.5);
  p.crate(50, 9, -139, 1.0, 0.9, 1.0);
  p.rubble(36, 9, -112, 1.0, 0.7);
  // bonfire yard
  p.crate(56, 4, -178, 1.2, 1.0, 1.2);
  p.crate(18, 4, -154, 1.0, 1.0, 1.0);
  p.rubble(42, 4, -178, 1.2, 0.6);
  p.rubble(24, 4, -156, 1.0, 1.9);
  // rampart cover (hollow soldiers flank around these)
  p.crate(82.2, 12, -178, 1.4, 1.2, 1.4);
  p.crate(75.8, 12, -198, 1.2, 1.0, 1.2, 0.2);
  p.crate(82, 12, -226, 1.1, 1.0, 1.1);
  p.rubble(78, 12, -206, 1.0, 0.8);
  p.rubble(79, 12, -244, 1.1, 2.0);
  // black knight arena
  p.rubble(24, 4, -230, 1.4, 0.5);
  p.rubble(55, 4, -268, 1.3, 1.4);
  p.skeleton(22, 4, -262, 0.7);
  p.skeleton(24, 4, -268, 2.1);
}

export const BURG: AreaDef = {
  id: 'burg',
  name: 'Undead Burg',
  fog: { ...FOG_PRESETS.burg },
  spawn: { pos: [50, 4, -173.8], yaw: 0 },
  build(L: LevelDsl) {
    /** Axis-aligned box from ranges: x0..x1, z0..z1, bottom y, height h. */
    const R = (x0: number, x1: number, z0: number, z1: number, y: number, h: number, mat: string): void => L.box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, mat);
    /** Floor slab whose top is at `top`. */
    const F = (x0: number, x1: number, z0: number, z1: number, top: number, mat = 'grey'): void => R(x0, x1, z0, z1, top - 1, 1, mat);
    /** Wall (brick) from `y` up `h`. */
    const W = (x0: number, x1: number, z0: number, z1: number, y: number, h: number): void => R(x0, x1, z0, z1, y, h, 'wall');
    /** Low parapet on a surface at `top`. */
    const P = (x0: number, x1: number, z0: number, z1: number, top: number): void => R(x0, x1, z0, z1, top, 1.2, 'brick');
    /** Solid block from y=4 up to `top` (raised terrace / rampart). */
    const S = (x0: number, x1: number, z0: number, z1: number, top: number, mat = 'stone'): void => R(x0, x1, z0, z1, 4, top - 4, mat);

    // ================================================================ 1. aqueduct exit room + corridor
    // (Firelink's deck ends at z -63; its canyon end wall is removed so the deck runs straight in.)
    F(-6, 6, -79, -63, 4);
    W(-6.6, -6, -79.6, -63, 4, 5); // west
    W(-6.6, 6.6, -79.6, -79, 4, 5); // north
    W(-6.6, -3, -63.6, -63, 4, 5); // entry shoulders (the deck is 6 wide)
    W(3, 6.6, -63.6, -63, 4, 5);
    W(6, 6.6, -79, -77, 4, 5); // east, around the corridor mouth
    W(6, 6.6, -71, -63, 4, 5);
    F(6, 26, -77, -71, 4); // corridor to the courtyard (turns the corner)
    W(6, 26, -77.6, -77, 4, 5);
    W(6, 26, -71, -70.4, 4, 5);
    L.item('B1', [-4.4, 4, -67], 'slumped', [{ id: 'dogtags_lost_operator', count: 2 }]); // first room after the aqueduct
    L.spawn('hollow_sword', [-1.5, 4, -72], { yaw: Math.PI, id: 'B_hollow_1' });
    L.spawn('hollow_sword', [13, 4, -75.8], { yaw: -Math.PI / 2, id: 'B_hollow_2' }); // around the corner, east of the door

    // ================================================================ 2. courtyard + stairs
    F(26, 66, -100, -58, 4);
    // south wall: 🚧 side alley (x30..36) and the Lower Burg door (x44..52)
    W(26, 30, -58.6, -58, 4, 5);
    W(36, 44, -58.6, -58, 4, 5);
    W(52, 66.6, -58.6, -58, 4, 5);
    L.barrier(33, 4, -58.3, 6, 4, 0.6, 'construction', { id: 'barrier_alley_s', label: 'Side alley' });
    R(43.4, 44.6, -59, -57.4, 4, 7, 'stone'); // Lower Burg door frame
    R(51.4, 52.6, -59, -57.4, 4, 7, 'stone');
    R(43.4, 52.6, -59, -57.4, 8.6, 1.2, 'stone');
    L.barrier(48, 4, -58.3, 8, 4.6, 0.6, 'construction', { id: 'barrier_lower_burg', label: 'Lower Burg' });
    // east wall: side street gap z -78..-70
    W(66, 66.6, -100.6, -78, 4, 5);
    W(66, 66.6, -70, -58, 4, 5);
    // west wall: corridor mouth z -77..-71, house door z -88.5..-85.5; the house rises to y13 above z -104.6..-84
    W(25.4, 26, -104.6, -88.5, 4, 9);
    W(25.4, 26, -85.5, -84, 4, 9);
    R(25.4, 26, -88.5, -85.5, 8.3, 4.7, 'wall'); // house door lintel (gap z-88.5..-85.5)
    W(25.4, 26, -84, -77, 4, 5);
    W(25.4, 26, -71, -58, 4, 5);
    // north wall: stair opening x40..48, Havel's tower door 🚧 at x54..60
    W(26, 40, -100.6, -100, 4, 5);
    W(48, 54, -100.6, -100, 4, 5);
    W(60, 66.6, -100.6, -100, 4, 5);
    R(53.4, 54.6, -101.4, -99.6, 4, 7, 'stone');
    R(59.4, 60.6, -101.4, -99.6, 4, 7, 'stone');
    R(53.4, 60.6, -101.4, -99.6, 8.6, 1.2, 'stone');
    L.barrier(57, 4, -100.2, 6, 4.6, 0.6, 'construction', { id: 'barrier_havel', label: "Havel's tower" });
    L.cache([28.5, 4, -62], { ammo: { rifle: 30, pistol: 16, smg: 24 } }); // after the first hollow pair
    L.spawn('hollow_sword', [48, 4, -84], { yaw: 0, id: 'B_hollow_3' });
    L.spawn('hollow_sword', [56, 4, -72], { yaw: Math.PI, id: 'B_hollow_4' });
    // side street (B10, dead end)
    F(66, 84, -78, -70, 4);
    W(66, 84.6, -78.6, -78, 4, 5);
    W(66, 84.6, -70, -69.4, 4, 5);
    W(84, 84.6, -78.6, -69.4, 4, 5);
    L.chest('B10', [82.4, 4, -74], [{ id: 'tactical_tomahawk', count: 1 }], Math.PI / 2);
    // stairs up to the terrace (barrel hollow at the top)
    L.stairs(44, 4, -104, 8, 5, 8, '-z', 'stone', 25); // z -108..-100, rises toward -z
    W(39.4, 40, -108, -100, 4, 6.2);
    W(48, 48.6, -108, -100, 4, 6.2);
    L.item('B2', [33.6, 4, -98.4], 'facedown', [{ id: 'frag_grenade', count: 3 }]); // beside the barrel stairs

    // ================================================================ 3. house (ground / upper floor / basement)
    F(8, 26, -104, -88, 4, 'stone'); // ground slab (hole for the basement stairs at x8..16, z-88..-84)
    F(16, 26, -88, -84, 4, 'stone');
    F(-2, 8, -92, -84, 4, 'stone'); // basement ceiling (outside the house, y3..4)
    F(-2, 16, -92, -84, 0, 'stone'); // basement floor (top y0)
    L.stairs(12, 0, -86, 8, 4, 4, '+x', 'stone', 20); // down to the basement (rises toward +x, top y4 at x16)
    W(-2.6, -2, -92.6, -83.4, 0, 3);
    W(-2.6, 16.6, -92.6, -92, 0, 3);
    W(-2.6, 16.6, -84, -83.4, 0, 3);
    F(8, 20, -104, -84, 9, 'wood'); // upper floor
    F(20, 26, -104, -100, 9, 'wood');
    L.stairs(23, 4, -95, 6, 5, 10, '-z', 'wood', 25); // inner stairs z-100..-90, top meets the upper floor
    W(7.4, 8, -104.6, -83.4, 4, 9); // west wall
    W(7.4, 21, -104.6, -104, 4, 9); // north wall, door gap x21..25 on the upper floor
    W(25, 26.6, -104.6, -104, 4, 9);
    R(21, 25, -104.6, -104, 4, 5, 'wall');
    R(21, 25, -104.6, -104, 12.4, 0.6, 'wall');
    W(7.4, 26.6, -84, -83.4, 4, 9); // south wall
    R(7.4, 26.6, -104.6, -83.4, 13, 0.6, 'wood'); // roof
    L.spawn('hollow_firebomb', [13, 9, -94], { yaw: -Math.PI / 4, id: 'B_hollow_fb' }); // upper floor, lobs at the stairs
    L.chest('B3', [10, 9, -102], [{ id: 'plate_carrier', count: 1 }], 0); // upper floor
    L.chest('B4', [-0.4, 0, -88.4], [{ id: 'night_vision_visor', count: 1 }], Math.PI / 2); // basement, behind crates

    // ================================================================ 4. terrace / merchant ledge + Residence
    S(30, 66, -143, -108, 9); // terrace y9
    S(18, 30, -114, -104.6, 9); // wing: the house's upper door opens onto it
    P(30, 40, -108.6, -108, 9);
    P(48, 66, -108.6, -108, 9);
    P(29.4, 30.6, -143, -114.6, 9);
    P(17.4, 18, -114.6, -104.6, 9);
    P(17.4, 30, -114.6, -114, 9);
    P(34, 66, -143, -142.4, 9); // north edge, gap x30..34 = stairs down to the bonfire yard
    P(65.4, 66, -122, -108, 9);
    const bt = BURG_TRIGGERS.find((t) => t.kind === 'barrelRoll')!;
    L.spawn('barrel_hollow', [44, 9, -111], {
      yaw: Math.PI,
      id: 'B_barrel_hollow',
      trigger: { min: [...bt.min], max: [...bt.max] },
      path: [[...bt.from!], [...bt.to!]],
    }); // rolls down the stairs (BURG_TRIGGERS)
    L.spawn('hollow_sword', [36, 9, -120], { yaw: Math.PI, id: 'B_hollow_5' });
    L.cache([34, 9, -113], { ammo: { rifle: 24, shotgun: 8, pistol: 12 } }); // after the barrel stairs
    L.item('B5', [33.4, 9, -139.4], 'sitWall', [{ id: 'energy_drink', count: 2 }]); // merchant ledge
    // Residence (locked): x66..82, z-142..-122, floor y9
    S(66, 82, -142, -122, 9, 'wood');
    W(66, 66.6, -142.6, -133, 9, 5);
    W(66, 66.6, -131, -121.4, 9, 5);
    R(66, 66.6, -133, -131, 11.3, 2.7, 'wall');
    W(66, 82.6, -142.6, -142, 9, 5);
    W(66, 82.6, -122, -121.4, 9, 5);
    W(82, 82.6, -142.6, -121.4, 9, 5);
    R(66, 82.6, -142.6, -121.4, 14, 0.6, 'wood');
    L.door('burg_residence', [66.3, 9, -132], 'residence_key', { yaw: Math.PI / 2, w: 2, h: 2.3 });
    L.chest('B6', [80.6, 9, -139.6], [{ id: 'bounty_tag', count: 1 }, { id: 'kevlar_sleeves', count: 1 }], -Math.PI / 2);
    L.mimic('B7', [80.6, 9, -124.4], -Math.PI / 2);
    // stairs down to the bonfire yard (shortcut-style: the yard loops back via the rampart)
    L.stairs(32, 4, -147, 4, 5, 8, '+z', 'stone', 25); // z -151..-143, top y9 at z-143
    W(29.4, 30, -151, -143, 4, 6.2);
    W(34, 34.6, -151, -143, 4, 6.2);

    // ================================================================ 5. bonfire yard, bonfire house, alley
    F(16, 60, -182, -151, 4);
    W(15.4, 60.6, -182.6, -182, 4, 5);
    W(15.4, 30, -151.6, -151, 4, 5);
    W(34, 60.6, -151.6, -151, 4, 5);
    W(15.4, 16, -182, -171, 4, 5);
    W(15.4, 16, -161, -151.6, 4, 5);
    W(60, 60.6, -182, -170.6, 4, 5);
    W(60, 60.6, -161.4, -157.6, 4, 5);
    L.bonfire(BURG_BONFIRE_ID, [...BURG_BONFIRE]);
    L.cache([55, 4, -177], { ammo: { rifle: 30, pistol: 12, smg: 24, shotgun: 8 } }); // bonfire yard
    // bonfire house (door south, x28..32)
    W(20, 28, -166.6, -166, 4, 5);
    W(32, 40, -166.6, -166, 4, 5);
    W(19.4, 20, -182, -166, 4, 5);
    W(40, 40.6, -182, -166, 4, 5);
    R(20, 40.6, -182, -166, 9, 0.6, 'wood'); // roof
    R(28, 32, -166.6, -166, 6.3, 2.7, 'wall'); // lintel
    L.chest('B8', [30, 4, -180.4], [{ id: 'sleight_of_hand_patch', count: 1 }], 0); // bonfire house
    // alley behind the bonfire (west), dead end
    F(2, 16, -171, -161, 4);
    W(2, 16, -171.6, -171, 4, 5);
    W(2, 16, -161, -160.4, 4, 5);
    W(1.4, 2, -171.6, -160.4, 4, 5);
    L.item('B9', [4, 4, -166], 'sitWall', [{ id: 'double_barrel', count: 1 }, { id: 'ammo_crate_small', count: 1 }]); // TODO(data): shotgun shells (no shell item id; closest ammo_crate_small) alley
    L.spawn('hollow_sword', [10, 4, -166], { yaw: -Math.PI / 2, id: 'B_hollow_6' });

    // ================================================================ 6. rampart + crossbow tower
    L.stairs(67, 4, -166, 14, 8, 8, '+x', 'stone', 40); // x60..74, up to the rampart y12
    W(60, 74, -170.6, -170, 4, 9.2);
    W(60, 74, -162, -161.4, 4, 9.2);
    S(74, 84, -268, -160, 12); // rampart deck y12 (also the plaza before the fog wall)
    P(74, 74.6, -238, -170, 12); // west parapet, gap z-238..-230 (Black Knight stairs)
    P(74, 74.6, -268, -238, 12);
    P(74, 74.6, -230, -170, 12);
    P(74, 84, -160.6, -160, 12);
    P(83.4, 84, -200, -160, 12);
    P(83.4, 84, -242, -214, 12);
    P(83.4, 84, -268, -258, 12);
    R(84, 94, -214, -200, 4, 18, 'brick'); // crossbow tower (top y22)
    P(83.4, 84, -214, -200, 22); // crenel lip (west, facing the rampart)
    P(84, 94, -214.6, -214, 22);
    P(84, 94, -200, -199.4, 22);
    P(94, 94.6, -214.6, -199.4, 22);
    L.spawn('hollow_soldier', [78, 12, -186], { yaw: Math.PI, id: 'B_soldier_1' });
    L.spawn('hollow_soldier', [81, 12, -204], { yaw: Math.PI, id: 'B_soldier_2' });
    L.spawn('hollow_crossbow', [88, 22, -208.4], { yaw: Math.PI / 2, id: 'B_crossbow_1' });
    L.spawn('hollow_crossbow', [88, 22, -205.2], { yaw: Math.PI / 2, id: 'B_crossbow_2' });
    L.spawn('hollow_crossbow', [91, 22, -202.6], { yaw: Math.PI / 2, id: 'B_crossbow_3' });
    L.item('B11', [77.2, 12, -166], 'slumped', [{ id: 'ballistic_shield', count: 1 }]); // rampart start
    L.item('B12', [82.4, 12, -217], 'ground', [{ id: 'incendiary_rounds', count: 3 }]); // crossbow tower base
    L.item('B13', [78, 12, -227], 'sitWall', [{ id: 'watchtower_key', count: 1 }]); // before the Black Knight path
    L.cache([80, 12, -218], { ammo: { rifle: 30, sniper: 5, pistol: 12, smg: 24 } }); // after the crossbows

    // ================================================================ 7. Black Knight side area
    F(18, 60, -272, -224, 4);
    W(17.4, 18, -272.6, -223.4, 4, 6);
    W(17.4, 60.6, -272.6, -272, 4, 6);
    W(17.4, 60.6, -224, -223.4, 4, 6);
    W(60, 60.6, -272, -238, 4, 6);
    W(60, 60.6, -230, -224, 4, 6);
    L.stairs(67, 4, -234, 14, 8, 8, '+x', 'stone', 40); // rampart -> arena (low end at x60)
    W(60, 74, -238.6, -238, 4, 9.2);
    W(60, 74, -230, -229.4, 4, 9.2);
    for (const [x, z] of [[30, -240], [48, -240], [30, -256], [48, -256]] as const) R(x - 1, x + 1, z - 1, z + 1, 4, 6, 'stone');
    L.spawn('black_knight', [40, 4, -250], { yaw: -Math.PI / 2, id: 'B_black_knight' });
    L.item('B14', [20.4, 4, -269.6], 'sitWall', [{ id: 'martyrdom_dogtag', count: 1 }]); // arena corner
    L.cache([22, 4, -228], { ammo: { rifle: 30, pistol: 12, shotgun: 8, smg: 24 } }); // after the Black Knight

    // ================================================================ 8. watchtower, ladder, catwalk, plunge ledge
    S(84, 88, -258, -242, 12); // platform in front of the tower (ladder + key door)
    P(84, 88, -258.6, -258, 12);
    P(84, 88, -242, -241.4, 12);
    // tower x88..104, z-262..-240: solid below the platform, hollow stash room above
    R(88, 89, -262, -240, 4, 8, 'brick'); // west foundation
    R(88, 89, -262, -257, 12, 4, 'brick'); // west wall above the platform, door gap z-257..-255
    R(88, 89, -255, -240, 12, 4, 'brick');
    R(88, 89, -257, -255, 14.3, 1.7, 'brick');
    R(89, 104, -262, -261, 4, 12, 'brick'); // north
    R(103, 104, -262, -240, 4, 12, 'brick'); // east
    R(89, 99, -241, -240, 4, 12, 'brick'); // south, stair exit gap x99..103 up to y8
    R(103, 104, -241, -240, 4, 12, 'brick');
    R(99, 103, -241, -240, 8, 8, 'brick');
    R(88, 104, -262, -240, 16, 4, 'stone'); // roof, top y20
    F(89, 99, -261, -241, 12, 'wood'); // stash floor (top y12)
    F(89, 103, -261, -259, 12, 'wood');
    L.stairs(101, 4, -251, 4, 8, 16, '-z', 'stone', 40); // shortcut down: top z-259 (y12) -> low z-243 (y4)
    F(99, 103, -243, -241, 4);
    L.door('burg_watchtower', [88.5, 12, -256], 'watchtower_key', { yaw: Math.PI / 2, w: 2, h: 2.3 });
    L.chest('B15', [91, 12, -259.4], [{ id: 'tac_vest_frame', count: 1 }, { id: 'knee_pad_pants', count: 1 }], Math.PI);
    // roof parapets + ladder gap (z-250..-246 on the west edge), catwalk gap on the north edge
    P(88, 88.6, -262, -250, 20);
    P(88, 88.6, -246, -240, 20);
    P(88, 104, -240.6, -240, 20);
    P(103.4, 104, -262, -240, 20);
    P(92, 104, -262, -261.4, 20);
    L.item('B16', [98, 20, -248], 'sitWall', [{ id: 'steady_aim_patch', count: 1 }, { id: 'flashbang', count: 3 }]); // watchtower top
    // catwalk north to the plunge ledge above the bridge
    R(88, 92, -286, -262, 19.4, 0.6, 'wood');
    R(78, 92, -286, -279, 19.4, 0.6, 'wood'); // plunge ledge (8 m over the deck; covers local (0, +8, 14))
    P(92, 92.6, -286, -262, 19.4 + 0.6);
    P(87.4, 88, -279, -262, 19.4 + 0.6);
    // shortcut corridor back to the bonfire yard: x98..104 north-south, then west at z-157..-151
    F(98, 104, -241, -151, 4);
    W(97.4, 98, -241, -157.6, 4, 5);
    W(104, 104.6, -241, -150.4, 4, 5);
    F(60, 98, -157, -151, 4);
    W(60, 98, -157.6, -157, 4, 5);
    W(60, 97.4, -151, -150.4, 4, 5);
    W(97.4, 104.6, -151, -150.4, 4, 5);

    // ================================================================ 9. the Taurus bridge (its fog wall is runtime: ai/boss/fogWall.ts)
    L.item('B17', [79, 12, -263], 'ground', [{ id: 'ammo_crate_large', count: 1 }]); // pre-boss restock
    buildTaurusArena(L, BURG_TAURUS_ORIGIN);
  },
};
