import type { System, Vec3Like } from '../core/types';

export interface AabbTrigger {
  id: string;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** Calls `onEnter(trigger)` on the tick the player steps into each AABB (re-arms after leaving). */
export function createTriggerSystem<T extends AabbTrigger>(d: { player: { readonly position: Vec3Like }; triggers: readonly T[]; onEnter: (t: T) => void }): System {
  const inside = new Set<string>();
  return {
    name: 'worldTriggers',
    update() {
      const p = d.player.position;
      for (const t of d.triggers) {
        const hit = p.x >= t.min[0] && p.x <= t.max[0] && p.y >= t.min[1] && p.y <= t.max[1] && p.z >= t.min[2] && p.z <= t.max[2];
        if (hit && !inside.has(t.id)) {
          inside.add(t.id);
          d.onEnter(t);
        } else if (!hit) inside.delete(t.id);
      }
    },
  };
}
