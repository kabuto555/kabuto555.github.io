/**
 * Core shared types. Leaf module: imports nothing from game folders.
 */

/** Structural 3-vector. THREE.Vector3 satisfies this, so sim code need not depend on three. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Terse tuple form used in data tables, the level DSL and save data (JSON-friendly). */
export type Vec3Tuple = readonly [x: number, y: number, z: number];

/**
 * A game system driven by the main loop.
 * - `update` runs at the fixed sim rate (dt is always SIM_DT seconds).
 * - `render` runs once per animation frame; `alpha` in [0,1) is how far we are between
 *   the previous and current sim tick — lerp(prev, curr, alpha) for smooth visuals.
 * Systems run in registration order (register input first).
 */
export interface System {
  readonly name?: string;
  update(dt: number): void;
  render?(alpha: number, frameDt: number): void;
}
