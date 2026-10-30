import type { Ps1Pipeline } from './types';

export interface FogPreset {
  color: number;
  near: number;
  far: number;
}

/** Per-area fog (PLAN §2): warm dusk at Firelink, cold grey-blue in the Burg. Also the clear color. */
export const FOG_PRESETS = {
  firelink: { color: 0x4a3626, near: 5, far: 26 },
  burg: { color: 0x56606e, near: 3, far: 20 },
  /** Boss arena / interiors: near-black, short. */
  interior: { color: 0x0e0c0c, near: 2, far: 16 },
} as const satisfies Record<string, FogPreset>;

export type FogPresetName = keyof typeof FOG_PRESETS;

export function applyFogPreset(pipeline: Ps1Pipeline, preset: FogPresetName | FogPreset): void {
  const p = typeof preset === 'string' ? FOG_PRESETS[preset] : preset;
  pipeline.setFog(p.color, p.near, p.far);
}
