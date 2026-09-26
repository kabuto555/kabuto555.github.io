// Walk-up game-mode entry: each mode registers the gate for its area. While the
// player stands near a gate, `update()` reports it so the camp HUD can float a
// "Play <mode>" button; tapping that opens the mode's tutorial modal. A small
// exit margin (hysteresis) stops the button flickering at the edge of the radius.

import type { Vector3 } from 'three';

export interface Gate {
  id: string;
  /** Shown on the button: "Play <label>". */
  label: string;
  /** World position of the gate (only XZ is used). */
  position: Vector3;
  /** Show radius (world units); the button hides again past radius + exitMargin. */
  radius: number;
  exitMargin?: number;
  /** Custom distance from the player (XZ) to the gate area, replacing the
   * distance to `position` — e.g. a whole arena edge instead of one point. */
  distance?: (player: Vector3) => number;
}

export class GateTriggers {
  private gates: Gate[] = [];
  private current: Gate | null = null;

  add(g: Gate): void { this.gates.push(g); }

  /** Call each free-roam frame; returns the gate the player is at (or null). */
  update(player: Vector3): Gate | null {
    const dist = (g: Gate) => g.distance?.(player) ?? Math.hypot(player.x - g.position.x, player.z - g.position.z);
    if (this.current && dist(this.current) > this.current.radius + (this.current.exitMargin ?? 0.75)) this.current = null;
    if (!this.current) this.current = this.gates.find((g) => dist(g) <= g.radius) ?? null;
    return this.current;
  }
}
