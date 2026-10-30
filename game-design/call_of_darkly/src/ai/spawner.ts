// Archetype registry + spawn records (level `spawn` ops → enemies; respawn on bonfire rest).
import type { Vec3Like, Vec3Tuple } from '../core/types';
import type { EnemyArchetype, EnemyDef } from '../data/types';
import { ENEMIES } from '../data/enemies';
import type { ArchetypeDef } from './enemy';
import { HOLLOW_SWORD } from './hollow';
import { HOLLOW_SOLDIER } from './soldier';
import { HOLLOW_FIREBOMB } from './firebomb';
import { HOLLOW_CROSSBOW } from './crossbow';
import { BARREL_HOLLOW } from './barrel';

const ARCHETYPES = new Map<EnemyArchetype, ArchetypeDef>([
  [HOLLOW_SWORD.archetype, HOLLOW_SWORD],
  [HOLLOW_SOLDIER.archetype, HOLLOW_SOLDIER],
  [HOLLOW_FIREBOMB.archetype, HOLLOW_FIREBOMB],
  [HOLLOW_CROSSBOW.archetype, HOLLOW_CROSSBOW],
  [BARREL_HOLLOW.archetype, BARREL_HOLLOW],
]);

/** Register (or replace) an archetype implementation (later enemies, Taurus boss). */
export function registerArchetype(def: ArchetypeDef): void {
  ARCHETYPES.set(def.archetype, def);
}

export function archetypeFor(def: EnemyDef): ArchetypeDef | undefined {
  return ARCHETYPES.get(def.archetype);
}

export function enemyDef(defId: string): EnemyDef | undefined {
  return ENEMIES[defId];
}

/** A placed spawn (from the level DSL or dev `spawn()`); kept so rests can respawn it. */
export interface SpawnRecord {
  readonly defId: string;
  readonly pos: Vec3Like;
  readonly yaw: number;
  readonly placementId?: string;
  /** Level-authored (respawns on rest) vs dev-spawned (one-off). */
  readonly placed: boolean;
  /** Barrel hollow: AABB trigger volume (world min/max); entering it starts the roll. */
  readonly trigger?: { min: Vec3Tuple; max: Vec3Tuple };
  /** Barrel hollow: waypoints the barrel rolls through after leaving the hollow (default: straight ahead 14 m). */
  readonly path?: readonly Vec3Tuple[];
}

/** Shape of the world builder's `spawn` op. */
export interface SpawnOpLike {
  enemy: string;
  pos: Vec3Tuple;
  yaw: number;
  id?: string;
  /** Barrel hollow only: AABB trigger volume; player entering it (or `ai.triggerBarrel(id)`) starts the roll. */
  trigger?: { min: Vec3Tuple; max: Vec3Tuple };
  /** Barrel hollow only: waypoints for the rolling barrel (ground-following; default straight ahead). */
  path?: readonly Vec3Tuple[];
}

export function recordFromOp(op: SpawnOpLike): SpawnRecord {
  return { defId: op.enemy, pos: { x: op.pos[0], y: op.pos[1], z: op.pos[2] }, yaw: op.yaw, placementId: op.id, placed: true, trigger: op.trigger, path: op.path };
}
