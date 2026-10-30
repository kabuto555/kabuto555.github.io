import { ARENA, ArenaFrame, setTaurusArena } from '../../ai/boss/arena';
import type { AreaDef, Facing, LevelDsl, MaterialId } from '../types';

/**
 * §10 beats 8–9: the Taurus Demon bridge (static geometry only).
 *
 * Local frame: the bridge is 8 m wide × 60 m long along local +z from `origin`, deck top at origin y.
 * - z = 0: entry arch (the fog wall itself is runtime: src/ai/boss/fogWall.ts).
 * - +x side: watchtower stairs (entered through a 1.8 m parapet gap at z 0.6–2.4, too narrow for
 *   the boss) up to a platform with a wooden plunge ledge whose tip is at local (0, +8, 14), over the deck.
 * - z = 57.5: far-end pylon barrier (runtime, opens on victory); z = 60: far gatehouse + exit platform.
 * The boss, fog wall and pylon barrier are created by `installTaurus` (they change at runtime).
 *
 * `origin.yaw` is snapped to quarter turns (the DSL is axis-aligned boxes).
 */
export function buildTaurusArena(d: LevelDsl, origin: { pos: [number, number, number]; yaw: number }): void {
  const f = new ArenaFrame(origin);
  setTaurusArena(origin);
  const w = { x: 0, y: 0, z: 0 };
  const box = (x: number, y: number, z: number, sw: number, h: number, sd: number, mat: MaterialId) => {
    f.toWorld(x, y, z, w);
    const [ww, dd] = f.sizeToWorld(sw, sd);
    d.box(w.x, w.y, w.z, ww, h, dd, mat);
  };
  const stairs = (x: number, y: number, z: number, sw: number, h: number, sd: number, dir: Facing, mat: MaterialId) => {
    f.toWorld(x, y, z, w);
    const [ww, dd] = f.sizeToWorld(sw, sd);
    d.stairs(w.x, w.y, w.z, ww, h, dd, rotFacing(dir, f.q), mat);
  };

  const HW = ARENA.halfWidth;
  const L = ARENA.length;

  // --- deck + parapets (1.1 m, crenellated) -------------------------------------------------
  box(0, -1, L / 2, HW * 2, 1, L, 'stone');
  // seams every 6 m (thin darker strips: reads as paving at PS1 res)
  for (let z = 6; z < L; z += 6) box(0, -0.02, z, HW * 2, 0.04, 0.25, 'brick');
  const PW = 0.5;
  const PH = 1.1;
  box(-HW - PW / 2, 0, L / 2, PW, PH, L, 'wall');
  const [g0, g1] = ARENA.stairGap;
  box(HW + PW / 2, 0, g0 / 2, PW, PH, g0, 'wall');
  box(HW + PW / 2, 0, (g1 + L) / 2, PW, PH, L - g1, 'wall');
  for (let z = 1; z < L - 0.5; z += 2.2) {
    box(-HW - PW / 2, PH, z, PW + 0.08, 0.45, 0.9, 'wall');
    if (z > g1 + 0.5) box(HW + PW / 2, PH, z, PW + 0.08, 0.45, 0.9, 'wall');
  }
  // support piers into the fog below
  for (const z of [8, 24, 40, 54]) {
    box(0, -14, z, 6.5, 13, 2.6, 'brick');
    box(0, -2.2, z, 8.6, 1.2, 3.2, 'stone'); // corbel
  }

  // --- entry arch at z = 0 (fog wall sits inside it) ----------------------------------------
  box(-HW - 0.6, 0, 0, 1.2, 6.4, 1.4, 'brick');
  box(HW + 0.6, 0, 0, 1.2, 6.4, 1.4, 'brick');
  box(0, 6.4, 0, HW * 2 + 2.4, 1.1, 1.6, 'stone');

  // --- watchtower (+x side): landing, 8 m stair run, top platform, plunge ledge ---------------
  const T = ARENA.tower;
  const sx = (T.x0 + 7.5) / 2; // stair centre x (4.5..7.5)
  const sw = 7.5 - T.x0;
  box(sx, -1, (g0 + g1) / 2, sw, 1, g1 - g0, 'stone'); // landing behind the gap (top y = 0)
  box((T.x0 + T.x1) / 2 + 0.25, -1, T.z0 / 2 + 0.15, T.x1 - T.x0 + 0.5, 7.5, 0.6, 'brick'); // south wall
  const runZ0 = g1;
  const runZ1 = 12.4;
  stairs(sx, 0, (runZ0 + runZ1) / 2, sw, 8, runZ1 - runZ0, '+z', 'stone');
  // outer tower wall (full height); the inner side stays open (drop onto the deck)
  box(T.x1, -1, (T.z0 + T.z1) / 2, 0.5, 10.6, T.z1 - T.z0, 'brick');
  // top platform (top y = 8)
  box(sx, 7.6, (runZ1 + T.z1) / 2, sw + 0.5, 0.4, T.z1 - runZ1, 'stone');
  box(sx, 8, T.z1 - 0.2, sw + 0.5, 1.0, 0.4, 'wall'); // north rail
  // the plunge ledge: wooden plank cantilevered over the deck, tip at local (0, 8, 14)
  const lx0 = ARENA.ledge.x - 0.6;
  box((lx0 + T.x0) / 2, 7.7, ARENA.ledge.z, T.x0 - lx0, 0.3, 1.6, 'wood');
  // tower crown (merlons) + roof posts
  for (let z = T.z0 + 0.8; z < T.z1; z += 2.4) box(T.x1, 9.6, z, 0.7, 0.6, 0.9, 'brick');
  box(sx + 1.2, 8, T.z1 - 0.4, 0.4, 2.6, 0.4, 'wood');
  box(sx + 1.2, 8, runZ1 + 0.3, 0.4, 2.6, 0.4, 'wood');
  box(sx + 1.0, 10.6, (runZ1 + T.z1) / 2, 2.6, 0.25, T.z1 - runZ1 + 0.6, 'wood');

  // --- far gatehouse (z = 60) + exit platform ------------------------------------------------
  box(-HW - 0.7, 0, L + 0.5, 1.4, 7.5, 1.6, 'brick');
  box(HW + 0.7, 0, L + 0.5, 1.4, 7.5, 1.6, 'brick');
  box(0, 7.5, L + 0.5, HW * 2 + 2.8, 1.2, 1.8, 'stone');
  box(0, -1, L + 5, HW * 2 + 2, 1, 9, 'stone');
  box(-HW - 1.25, 0, L + 5, 0.5, 4.5, 9, 'wall');
  box(HW + 1.25, 0, L + 5, 0.5, 4.5, 9, 'wall');
  box(0, 0, L + 9.75, HW * 2 + 3, 6, 0.5, 'brick');
  // side towers flanking the gate
  box(-HW - 3, -6, L + 1, 3.4, 16, 3.4, 'brick');
  box(HW + 3, -6, L + 1, 3.4, 16, 3.4, 'brick');
}

const FACINGS: readonly Facing[] = ['+z', '+x', '-z', '-x'];

/** Rotate a stair/ramp facing by q quarter turns (local +z → world +x for q = 1). */
function rotFacing(dir: Facing, q: number): Facing {
  return FACINGS[(FACINGS.indexOf(dir) + q) % 4]!;
}

/**
 * Dev-only area (origin 0,0,0): a short approach with a bonfire, then the arena. Register it as
 * `AREAS['taurus']` / `?area=taurus` to test the boss without the Burg.
 */
export const TAURUS_TEST_AREA: AreaDef = {
  id: 'taurus',
  name: 'Taurus Bridge (test)',
  fog: { color: 0x6a7480, near: 20, far: 95 },
  spawn: { pos: [0, 0, -6], yaw: Math.PI }, // facing +z (the fog wall)
  build(L: LevelDsl) {
    L.box(0, -1, -8, 10, 1, 16, 'stone');
    L.box(-5.25, 0, -8, 0.5, 3, 16, 'wall');
    L.box(5.25, 0, -8, 0.5, 3, 16, 'wall');
    L.box(0, 0, -16.25, 11, 4, 0.5, 'brick');
    L.bonfire('bonfire_taurus_test', [-3, 0, -11]);
    buildTaurusArena(L, { pos: [0, 0, 0], yaw: 0 });
  },
};
