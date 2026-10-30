import type { Object3D } from 'three';
import '../combat/events';
import { events as globalEvents, type EventBus } from '../core/events';
import { Rng } from '../core/rng';
import type { System, Vec3Like } from '../core/types';
import { stats as globalStats } from '../inventory/modifiers';
import type { StatsReader } from '../inventory/types';
import type { CollisionWorld } from '../physics/types';
import { Enemy, type AiCombat, type AiShared, type AiTarget } from './enemy';
import { canHear } from './logic';
import { LineOfSight } from './perception';
import { archetypeFor, enemyDef, recordFromOp, type SpawnOpLike, type SpawnRecord } from './spawner';
import type { AiStateId, NavGraph } from './types';
import { WaypointGraph } from './nav';
import { BarrelRegistry } from './barrel';
import { AiHazards } from './hazards';

export interface AiSystemOptions {
  world: CollisionWorld;
  combat: AiCombat;
  player: AiTarget;
  /** Scene/group enemy meshes are added to. Omit (or `headless`) to run without visuals (tests). */
  scene?: Object3D;
  headless?: boolean;
  nav?: NavGraph | null;
  stats?: StatsReader;
  events?: EventBus;
  rng?: Rng;
  /** Max enemies winding up/attacking at once (Souls-style attack tokens). Default 2. */
  maxAttackers?: number;
}

export interface AiEnemyInfo {
  id: number;
  defId: string;
  state: AiStateId;
  hp: number;
  poise: number;
  pos: { x: number; y: number; z: number };
  yaw: number;
  aware: boolean;
}

/**
 * Owns every enemy: spawn/despawn, per-tick update (sense → FSM → capsule move → pose), neighbour
 * separation, gunshot hearing, corpse removal and respawn on bonfire rest. Register after the
 * player and combat systems in the loop.
 */
export class AiSystem implements System {
  readonly name = 'ai';
  readonly enemies: Enemy[] = [];
  readonly shared: AiShared;
  /** Pooled bolts / bottles / fire pools / rolling barrels. */
  readonly hazards: AiHazards;
  /** Scripted barrel hollows (trigger volumes, `triggerBarrel`). */
  readonly barrels = new BarrelRegistry();
  private readonly scene: Object3D | null;
  private readonly records: SpawnRecord[] = [];
  /** record index per live enemy id (respawn). */
  private readonly recordOf = new Map<number, SpawnRecord>();
  private readonly offs: Array<() => void> = [];
  /** Bosses (M8): never despawned/respawned by `respawnAll` (their own system resets them). */
  private readonly pinned = new Set<Enemy>();
  /** M8: boss system hook answering "which boss arena is the player fighting in?" (death loop). */
  bossArenaQuery: (() => string | null) | null = null;

  constructor(o: AiSystemOptions) {
    const bus = o.events ?? globalEvents;
    this.scene = o.headless ? null : (o.scene ?? null);
    this.hazards = new AiHazards({ world: o.world, combat: o.combat, player: o.player, bus, scene: this.scene });
    this.shared = {
      hazards: this.hazards,
      world: o.world,
      combat: o.combat,
      player: o.player,
      stats: o.stats ?? globalStats,
      bus,
      rng: o.rng ?? new Rng(0xa11ce),
      los: new LineOfSight(o.world),
      nav: null,
      attackers: 0,
      maxAttackers: o.maxAttackers ?? 2,
    };
    this.setNav(o.nav ?? null);
    this.offs.push(bus.on('gunFired', (e) => this.onNoise(e.pos)));
    this.offs.push(bus.on('aggroPing', (e) => this.onPing(e.targetId, e.pos)));
    this.offs.push(bus.on('bonfireRest', () => this.respawnAll()));
  }

  get nav(): NavGraph | null {
    return this.shared.nav;
  }

  setNav(nav: NavGraph | null): void {
    this.shared.nav = nav;
    if (nav instanceof WaypointGraph) {
      const los = this.shared.los;
      nav.los = (a, b) => los.walkable(a, b);
      nav.clearCache();
    }
  }

  /** Spawn an enemy by data id. Returns null for unknown ids/archetypes (warns). */
  spawn(defId: string, pos: Vec3Like, yaw = 0, placementId?: string): Enemy | null {
    return this.spawnRecord({ defId, pos: { x: pos.x, y: pos.y, z: pos.z }, yaw, placementId, placed: false });
  }

  /** World-builder `spawn` op callback (level-authored: respawns on rest). */
  spawnOp(op: SpawnOpLike): Enemy | null {
    const rec = recordFromOp(op);
    this.records.push(rec);
    return this.spawnRecord(rec);
  }

  private spawnRecord(rec: SpawnRecord): Enemy | null {
    const def = enemyDef(rec.defId);
    if (!def) {
      console.warn(`[ai] unknown enemy "${rec.defId}"`);
      return null;
    }
    const arch = archetypeFor(def);
    if (!arch) {
      console.warn(`[ai] no archetype implementation for "${def.archetype}" (${def.id}) yet; skipped`);
      return null;
    }
    const view = this.scene ? arch.createView() : null;
    const e = new Enemy(def, arch, this.shared, rec.pos, rec.yaw, rec.placementId, view);
    if (view) {
      this.scene!.add(view.root);
      view.render(e, 1);
    }
    this.enemies.push(e);
    this.recordOf.set(e.id, rec);
    this.shared.combat.addTarget(e);
    if (def.archetype === 'barrelHollow') this.barrels.attach(e, rec, this.hazards);
    return e;
  }

  /** Exclude a (boss) enemy from `respawnAll`. Cleared on despawn. */
  pin(e: Enemy): void {
    this.pinned.add(e);
  }

  /** Boss id when the player is inside an engaged boss arena, else null (DeathLoop `inBossArena`). */
  bossInArena(): string | null {
    return this.bossArenaQuery?.() ?? null;
  }

  despawn(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.pinned.delete(e);
    e.releaseToken();
    this.enemies.splice(i, 1);
    this.shared.combat.removeTarget(e);
    this.barrels.detach(e);
    e.view?.dispose();
    e.removed = true;
    this.recordOf.delete(e.id);
  }

  /**
   * Start the barrel roll of a scripted barrel hollow, by level placement id (spawn op `id`) or
   * enemy runtime id. Returns false if none matches / already triggered / dead. Trigger volumes
   * (spawn op `trigger`) call this automatically when the player enters them.
   */
  triggerBarrel(id: string | number): boolean {
    return this.barrels.trigger(id);
  }

  /** Dev: kills every live non-boss enemy (pinned bosses are skipped so debug kills can't write boss save flags). */
  killAll(): number {
    let n = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss || this.pinned.has(e)) continue;
      e.kill(null);
      n++;
    }
    return n;
  }

  /** Bonfire rest: every level-placed enemy whose def respawns is reset at its spawn. */
  respawnAll(): void {
    this.hazards.clear();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      if (this.pinned.has(e)) continue;
      const rec = this.recordOf.get(e.id);
      if (!rec?.placed || e.def.respawns) this.despawn(e);
    }
    const alive = new Set<SpawnRecord>(this.recordOf.values());
    for (const rec of this.records) {
      const def = enemyDef(rec.defId);
      if (def?.respawns && !alive.has(rec)) this.spawnRecord(rec);
    }
  }

  clear(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) this.despawn(this.enemies[i]!);
    this.records.length = 0;
    this.hazards.clear();
    this.barrels.clear();
  }

  list(): AiEnemyInfo[] {
    return this.enemies.map((e) => ({
      id: e.id,
      defId: e.defId,
      state: e.state,
      hp: e.health.hp,
      poise: e.poise.current,
      pos: { x: +e.transform.position.x.toFixed(2), y: +e.transform.position.y.toFixed(2), z: +e.transform.position.z.toFixed(2) },
      yaw: +e.transform.yaw.toFixed(2),
      aware: e.aware,
    }));
  }

  private onPing(targetId: number, p: Vec3Like): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (e.id === targetId) {
        e.ping(p);
        return;
      }
    }
  }

  private onNoise(p: Vec3Like): void {
    const mul = this.shared.stats.get('hearingRadius');
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (!e.alive) continue;
      const q = e.transform.position;
      if (canHear(p.x - q.x, p.y - q.y, p.z - q.z, e.def.hearingRadius * mul)) e.hear(p);
    }
  }

  update(dt: number): void {
    const list = this.enemies;
    // neighbour separation (O(n²), n is small per area)
    for (let i = 0; i < list.length; i++) list[i]!.sepX = list[i]!.sepZ = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (!a.alive) continue;
      const pa = a.capsule.position;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (!b.alive) continue;
        const pb = b.capsule.position;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const min = a.capsule.radius + b.capsule.radius + 0.25;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(pb.y - pa.y) > 1.5) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const push = ((min - d) / min) * 3; // m/s
        const nx = d2 > 1e-6 ? dx / d : 1;
        const nz = d2 > 1e-6 ? dz / d : 0;
        a.sepX -= nx * push;
        a.sepZ -= nz * push;
        b.sepX += nx * push;
        b.sepZ += nz * push;
      }
    }
    for (let i = 0; i < list.length; i++) list[i]!.update(dt);
    this.barrels.update(this.shared.player.position);
    this.hazards.update(dt);
    // remove finished corpses (keep their spawn records for respawn)
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      if (e.corpseDone) this.despawn(e);
    }
    this.pushPlayerOut();
  }

  /**
   * Enemies are solid to the player: after everyone moved, push the player capsule out of each
   * live enemy capsule horizontally (rolling through an enemy is blocked, Souls-style).
   */
  private pushPlayerOut(): void {
    const pl = this.shared.player;
    if (pl.health.hp <= 0) return;
    const pp = pl.position as { x: number; y: number; z: number };
    const pr = pl.capsule?.radius ?? 0.35;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.alive) continue;
      const q = e.capsule.position;
      if (q.y > pp.y + 1.7 || q.y + e.tuning.capsuleHeight < pp.y) continue;
      const dx = pp.x - q.x;
      const dz = pp.z - q.z;
      const min = pr + e.capsule.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      pp.x += nx * (min - d);
      pp.z += nz * (min - d);
    }
  }

  render(alpha: number): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      e.view?.render(e, alpha);
    }
  }

  dispose(): void {
    this.clear();
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.hazards.dispose();
  }
}
