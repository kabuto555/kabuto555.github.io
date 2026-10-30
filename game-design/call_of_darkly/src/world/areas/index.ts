import type { AreaDef } from '../types';
import { BURG } from './burg';
import { FIRELINK } from './firelink';
import { GYM } from './gym';
import { TAURUS_TEST_AREA } from './taurus';

/** Area registry. Firelink + Burg (+ the Taurus bridge, built inside the Burg) share one scene, see WORLD_AREAS. */
export const AREAS: Record<string, AreaDef> = {
  [FIRELINK.id]: FIRELINK,
  [BURG.id]: BURG,
  [GYM.id]: GYM,
  // Dev-only boss test arena (?area=taurus): never reachable in production builds.
  ...(import.meta.env.DEV ? { [TAURUS_TEST_AREA.id]: TAURUS_TEST_AREA } : {}),
};

/** Areas built into the single continuous world, in build order (M7: no load screens). */
export const WORLD_AREAS: readonly AreaDef[] = [FIRELINK, BURG];
