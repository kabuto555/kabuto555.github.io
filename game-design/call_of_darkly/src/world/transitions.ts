import * as THREE from 'three';
import { events as globalEvents, type EventBus } from '../core/events';
import type { System, Vec3Like } from '../core/types';
import { ARENA, ArenaFrame } from '../ai/boss/arena';
import { FOG_PRESETS } from '../render/fog';
import '../ui/events';
import { BURG_TAURUS_ORIGIN } from './areas/burg';

/**
 * Areas share ONE scene (M7 approach (a)): no load screens. This module maps a world position to the area
 * it belongs to (for bloodstain/respawn area ids, banners, fog), and blends the fog / lighting across the
 * Firelink -> Burg seam at the end of the aqueduct (z -58 .. -70).
 */
export type AreaName = 'firelink' | 'burg' | 'taurus';

export const AREA_LABELS: Record<AreaName, string> = { firelink: 'Firelink Shrine', burg: 'Undead Burg', taurus: 'Taurus Bridge' };

/** Aqueduct seam: Firelink side z > FIRELINK_EDGE, fully Burg at z < BURG_EDGE. */
const FIRELINK_EDGE = -58;
const BURG_EDGE = -70;
/** World z of the Taurus fog wall (bridge entry): derived from the arena placement so they cannot drift apart. */
const TAURUS_Z = new ArenaFrame(BURG_TAURUS_ORIGIN).toWorld(0, 0, ARENA.fogZ).z;

export function areaAtPosition(p: Vec3Like): AreaName {
  if (p.z < TAURUS_Z) return 'taurus';
  if (p.z < -63) return 'burg';
  return 'firelink';
}

/** 0 = Firelink, 1 = Burg (smoothstep across the aqueduct seam). */
export function burgBlend(z: number): number {
  const t = Math.min(1, Math.max(0, (FIRELINK_EDGE - z) / (FIRELINK_EDGE - BURG_EDGE)));
  return t * t * (3 - 2 * t);
}

export interface AreaBlend {
  fogColor: number;
  near: number;
  far: number;
  /** 0..1 Firelink -> Burg, for lighting tints. */
  t: number;
}

const ca = new THREE.Color();
const cb = new THREE.Color();
/** Fog at blend `t`, written into `out` (no allocation). */
function blendFogAt(t: number, out: AreaBlend): AreaBlend {
  const a = FOG_PRESETS.firelink;
  const b = FOG_PRESETS.burg;
  out.fogColor = ca.setHex(a.color).lerp(cb.setHex(b.color), t).getHex();
  out.near = a.near + (b.near - a.near) * t;
  out.far = a.far + (b.far - a.far) * t;
  out.t = t;
  return out;
}
export function blendFog(z: number): AreaBlend {
  return blendFogAt(burgBlend(z), { fogColor: 0, near: 0, far: 0, t: 0 });
}

export interface AreaTransitionDeps {
  player: { readonly position: Vec3Like };
  setFog: (color: number, near: number, far: number) => void;
  /** Called every tick with the blend (lighting tints). */
  onBlend?: (b: AreaBlend) => void;
  /** Called when the player enters a different area. */
  onAreaChange?: (to: AreaName, from: AreaName) => void;
  bus?: EventBus;
  /** Area restored from the save: counts as already announced (no banner replay). */
  initial?: AreaName;
}

/** Tracks the current area, blends fog, announces the Burg (banner + `areaExit {to}`). Not for the gym. */
export function createAreaTransitions(d: AreaTransitionDeps): System & { readonly current: AreaName } {
  const bus = d.bus ?? globalEvents;
  let current = areaAtPosition(d.player.position);
  let lastT = -1;
  const announced = new Set<AreaName>([current]);
  if (d.initial) announced.add(d.initial);
  const blend: AreaBlend = { fogColor: 0, near: 0, far: 0, t: 0 };
  const apply = (): void => {
    const t = burgBlend(d.player.position.z);
    if (lastT >= 0 && Math.abs(t - lastT) <= 1e-3) return; // unchanged: no colour math, no callbacks
    lastT = t;
    const b = blendFogAt(t, blend);
    d.setFog(b.fogColor, b.near, b.far);
    d.onBlend?.(b);
  };
  apply();
  return {
    name: 'areaTransitions',
    get current() {
      return current;
    },
    update() {
      apply();
      const a = areaAtPosition(d.player.position);
      if (a === current) return;
      const from = current;
      current = a;
      d.onAreaChange?.(a, from);
      bus.emit('areaExit', { to: a });
      if (!announced.has(a) && a !== 'taurus') {
        announced.add(a);
        bus.emit('banner', { kind: 'text', text: AREA_LABELS[a].toUpperCase(), hold: 2.5 });
      }
    },
  };
}
