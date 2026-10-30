import type { Entity } from '../core/entity';
import type { System } from '../core/types';

/** §3 movement states. */
export type MoveState = 'ground' | 'air' | 'mantle' | 'dodge' | 'drinking' | 'knockdown' | 'dead';

/** Player state other systems (HUD, combat, AI) read. */
export interface PlayerState {
  move: MoveState;
  stamina: number;
  maxStamina: number;
  /** §3 exhaustion: hit 0 → no stamina actions until full. */
  exhausted: boolean;
  estusCharges: number;
  sprinting: boolean;
  ads: boolean;
  /** 0..1 ADS blend. */
  adsT: number;
  /** Camera look, radians. */
  yaw: number;
  pitch: number;
}

export interface Player extends Entity, System {
  readonly state: Readonly<PlayerState>;
  /** Spend stamina; false (and no spend) if exhausted. */
  spendStamina(amount: number): boolean;
  /** Respawn at a bonfire position. */
  respawn(pos: { x: number; y: number; z: number }, yaw: number): void;
}
