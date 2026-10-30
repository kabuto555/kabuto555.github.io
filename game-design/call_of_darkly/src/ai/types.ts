import type { Entity, EntityId } from '../core/entity';
import type { Vec3Like } from '../core/types';
import type { EnemyAttackDef, EnemyDef } from '../data/types';

/**
 * §10 FSM states. The first eight are the PLAN chain; `patrol` (idle wander), `hitReact`
 * (startle flinch when hit unaware) and `return` (leash back home) were added in M3.
 */
export type AiStateId =
  | 'idle'
  | 'alert'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'stagger'
  | 'dead'
  | 'patrol'
  | 'hitReact'
  | 'return';

/** Per-enemy context passed to FSM states. */
export interface AiContext {
  readonly self: EnemyInstance;
  readonly def: EnemyDef;
  /** Seconds spent in the current state. */
  stateTime: number;
  /** Attack chosen at windup, executed in attack. */
  currentAttack: EnemyAttackDef | null;
  targetPos: Vec3Like | null;
  canSeeTarget: boolean;
}

/**
 * One FSM state. `update` returns the next state id to transition, or void to stay.
 * Generic over the state-id type so bosses can add their own ids (M3: default stays AiStateId).
 */
export interface FsmState<C = AiContext, S extends string = AiStateId> {
  readonly id: S;
  enter?(ctx: C, from: S | null): void;
  update(ctx: C, dt: number): S | void;
  exit?(ctx: C, to: S): void;
}

export interface EnemyInstance extends Entity {
  readonly defId: string;
  state: AiStateId;
  /** Spawn point (respawn on bonfire rest). */
  readonly home: Vec3Like;
}

/** Per-area waypoint graph. */
export interface NavGraph {
  nodes: Vec3Like[];
  edges: [a: number, b: number][];
  nearest(p: Vec3Like): number;
  /** Waypoints from the node nearest `from` to the node nearest `to` (cached; do not mutate). */
  path(from: Vec3Like, to: Vec3Like): Vec3Like[];
}

declare module '../core/events' {
  interface EventMap {
    /** An enemy died (M3). Drops/souls systems listen; `enemyId` is the runtime entity id. */
    /** An enemy noticed the player (idle/patrol -> alert). Payload is a reused scratch object. */
    enemyAlert: { enemyId: EntityId; pos: Vec3Like };
    /** An enemy entered an attack windup (telegraph). Payload is a reused scratch object. */
    enemyWindup: { enemyId: EntityId; pos: Vec3Like; attackId: string };
    /** Boss ground slam landed (overhead smash / jump slam). Payload is a reused scratch object. */
    bossSlam: { pos: Vec3Like; radius: number };
    enemyDeath: { enemyId: EntityId; defId: string; dropTableId: string | null; pos: Vec3Like; souls: number; killerId: EntityId | null };
  }
}
