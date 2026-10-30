import type { Vec3Tuple } from '../core/types';
import type { AmmoType, EnemyId, ItemId } from '../data/types';

/** Save-tracked placement id from the level DSL (e.g. 'F1', 'B12', 'door_residence'). */
export type PlacementId = string;

/** Material key → procedural texture + vertex tint (render/textures resolves it). */
export type MaterialId = string;

/** Axis a stair/ramp rises toward. */
export type Facing = '+x' | '-x' | '+z' | '-z';

export type CorpsePose = 'ground' | 'sitWall' | 'slumped' | 'facedown';

export type BarrierKind = 'invisible' | 'construction' | 'rubble' | 'fogWall';

/** Loot inside an item glow / chest. */
export type Loot = readonly { id: ItemId; count: number }[];

/** Ammo cache contents (refills on bonfire rest, never saved). */
export interface CacheContents {
  ammo?: Partial<Record<AmmoType, number>>;
  items?: Loot;
}

/**
 * One recorded DSL op. Box convention for box/stairs/ramp/barrier:
 * (x, z) = footprint CENTER, y = BOTTOM, w/h/d = size along x/y/z (meters).
 */
export type LevelOp =
  | { op: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; mat: MaterialId }
  | { op: 'stairs'; x: number; y: number; z: number; w: number; h: number; d: number; dir: Facing; steps: number; mat: MaterialId }
  | { op: 'ramp'; x: number; y: number; z: number; w: number; h: number; d: number; dir: Facing; mat: MaterialId }
  | { op: 'barrier'; x: number; y: number; z: number; w: number; h: number; d: number; kind: BarrierKind; id?: PlacementId; label?: string }
  | { op: 'spawn'; enemy: EnemyId; pos: Vec3Tuple; yaw: number; id?: PlacementId; trigger?: { min: Vec3Tuple; max: Vec3Tuple }; path?: readonly Vec3Tuple[] }
  | { op: 'cache'; pos: Vec3Tuple; contents: CacheContents }
  | { op: 'item'; id: PlacementId; pos: Vec3Tuple; pose: CorpsePose; loot: Loot }
  | { op: 'chest'; id: PlacementId; pos: Vec3Tuple; yaw: number; contents: Loot }
  | { op: 'mimic'; id: PlacementId; pos: Vec3Tuple; yaw: number }
  | { op: 'door'; id: PlacementId; pos: Vec3Tuple; yaw: number; keyId: ItemId | null; w: number; h: number }
  | { op: 'bonfire'; id: PlacementId; pos: Vec3Tuple };

/** One area module (world/areas/*.ts). */
export interface AreaDef {
  id: string;
  name: string;
  fog: { color: number; near: number; far: number };
  /** Player start / default respawn if no bonfire rested yet. */
  spawn: { pos: Vec3Tuple; yaw: number };
  /** Author the level by calling DSL functions; returns nothing (ops are recorded). */
  build(dsl: LevelDsl): void;
}

/** The level-authoring API (§12). Implemented by world/dsl.ts `createLevelDsl()`. */
export interface LevelDsl {
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: MaterialId): void;
  stairs(x: number, y: number, z: number, w: number, h: number, d: number, dir: Facing, mat: MaterialId, steps?: number): void;
  ramp(x: number, y: number, z: number, w: number, h: number, d: number, dir: Facing, mat: MaterialId): void;
  barrier(x: number, y: number, z: number, w: number, h: number, d: number, kind?: BarrierKind, opts?: { id?: PlacementId; label?: string }): void;
  spawn(enemy: EnemyId, pos: Vec3Tuple, opts?: { yaw?: number; id?: PlacementId; trigger?: { min: Vec3Tuple; max: Vec3Tuple }; path?: readonly Vec3Tuple[] }): void;
  cache(pos: Vec3Tuple, contents: CacheContents): void;
  /** World item glow, usually on a corpse. `id` is the save key; `loot` is what it gives. */
  item(id: PlacementId, pos: Vec3Tuple, pose: CorpsePose, loot: Loot): void;
  chest(id: PlacementId, pos: Vec3Tuple, contents: Loot, yaw?: number): void;
  mimic(id: PlacementId, pos: Vec3Tuple, yaw?: number): void;
  door(id: PlacementId, pos: Vec3Tuple, keyId?: ItemId | null, opts?: { yaw?: number; w?: number; h?: number }): void;
  bonfire(id: PlacementId, pos: Vec3Tuple): void;
}
