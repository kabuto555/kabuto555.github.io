// Taurus encounter runtime: spawns the boss into the AiSystem (pinned: rests never respawn it),
// owns the fog wall + far barrier, the boss bar, the plunge check, the dodge tutorial flash,
// bossReset (player died in the arena) and the victory → Demo Complete sequence.
import type { Object3D } from 'three';
import { DamageType, type EntityId } from '../../core/entity';
import { events as globalEvents, type EventBus } from '../../core/events';
import type { System, Vec3Like } from '../../core/types';
import { dealDamage } from '../../combat/damage';
import type { CollisionWorld } from '../../physics/types';
import '../../ui/events';
import '../../economy/deathloop';
import type { AiCombat, Enemy } from '../enemy';
import type { AiSystem } from '../system';
import { ARENA, ArenaFrame, getTaurusArena, type ArenaPlacement } from './arena';
import { FarBarrier, FogWall, type FogInteract } from './fogWall';
import { PlungeTracker, plungeDamage, PLUNGE } from './plunge';
import { TAURUS_HEIGHT, TAURUS_ID, taurusData } from './taurus';

declare module '../../core/events' {
  interface EventMap {
    /** M8: the Taurus Demon died and the victory beat finished: the demo is over. */
    demoComplete: { bossId: string };
    /** M8: plunging attack landed on a boss (juice / audio hooks). */
    plungeHit: { bossId: string; dealt: number; kind: 'head' | 'land' };
  }
}

/** What the encounter reads from the player (PlayerController satisfies it; read-only + teleport). */
export interface TaurusPlayer {
  readonly id: EntityId;
  readonly position: Vec3Like;
  readonly velocity: Vec3Like;
  readonly grounded: boolean;
  readonly state: { readonly move: string };
  readonly health: { hp: number };
  teleport(pos: Vec3Like, yaw: number): void;
}

export interface TaurusDeps {
  ai: AiSystem;
  /** Defaults to the AI system's combat. */
  combat?: AiCombat;
  player: TaurusPlayer;
  /** Scene for the fog wall / barrier visuals; null = headless. */
  scene?: Object3D | null;
  world: CollisionWorld;
  events?: EventBus;
  /** [E] registry for the fog wall prompt (InteractSystem). Without it, call `traverseFog()`. */
  interact?: FogInteract | null;
  isDefeated(): boolean;
  setDefeated(): void;
  /** Dodge tutorial flashes shown so far (persisted by the caller); flashes while < `dodgeHints`. */
  getDodgeHintCount(): number;
  incDodgeHintCount(): void;
  /** Arena placement; default = the one `buildTaurusArena` recorded. */
  arena?: ArenaPlacement | null;
  /** Seconds from the kill to `demoComplete` (VICTORY banner holds 5 s). Default 6. */
  demoCompleteDelay?: number;
  dodgeHints?: number;
}

export class TaurusSystem implements System {
  readonly name = 'taurus';
  boss: Enemy | null = null;
  fog: FogWall | null = null;
  far: FarBarrier | null = null;
  frame: ArenaFrame | null = null;
  readonly plunge = new PlungeTracker();
  /** Seconds since the kill (victory sequence), -1 = not running. */
  victoryT = -1;
  demoCompleted = false;
  private readonly d: TaurusDeps;
  private readonly bus: EventBus;
  private readonly combat: AiCombat;
  private started = false;
  private lastHp = -1;
  private readonly offs: (() => void)[] = [];
  private readonly tmp = { x: 0, y: 0, z: 0 };
  /** Reused plunge target (no per-tick allocation). */
  private readonly pb = { x: 0, y: 0, z: 0, height: TAURUS_HEIGHT };

  constructor(d: TaurusDeps) {
    this.d = d;
    this.bus = d.events ?? globalEvents;
    this.combat = d.combat ?? d.ai.shared.combat;
    this.offs.push(this.bus.on('enemyDeath', (e) => this.boss && e.enemyId === this.boss.id && this.onVictory()));
    this.offs.push(this.bus.on('bossReset', (e) => e.bossId === TAURUS_ID && this.reset()));
    d.ai.bossArenaQuery = () => this.inBossArena();
  }

  get engaged(): boolean {
    return !!this.boss && taurusData(this.boss).engaged;
  }

  /** Boss id while the fight is on (player through the fog, boss alive), else null. */
  inBossArena(): string | null {
    return this.boss?.alive && taurusData(this.boss).engaged ? TAURUS_ID : null;
  }

  /** Lazy: the arena is registered while the level builds, which may run after install. */
  private start(): boolean {
    if (this.started) return true;
    const placement = this.d.arena ?? getTaurusArena();
    if (!placement) return false;
    this.started = true;
    const f = (this.frame = new ArenaFrame(placement));
    if (this.d.isDefeated()) {
      this.demoCompleted = true; // restored from the persisted defeat flag: the demo is already over
      return true; // fog gone, bridge open, no boss
    }
    const scene = this.d.scene ?? null;
    this.fog = new FogWall({ world: this.d.world, frame: f, parent: scene, interact: this.d.interact ?? null, player: this.d.player, onTraverse: () => this.engage() });
    this.far = new FarBarrier(this.d.world, f, scene);
    this.spawnBoss();
    return true;
  }

  private spawnBoss(): void {
    const f = this.frame!;
    const h = ARENA.bossHome;
    const e = this.d.ai.spawn(TAURUS_ID, f.toWorld(h.x, h.y, h.z), f.yawToWorld(ARENA.bossYaw), 'boss:taurus');
    if (!e) return;
    this.boss = e;
    this.d.ai.pin(e);
    const data = taurusData(e);
    data.frame = f;
    data.onWindup = () => this.onWindup();
    // dormant behind the fog: not shootable until the fight starts
    this.combat.removeTarget(e);
  }

  /** Walk through the fog wall (the [E] action): drop the player inside and start the fight. */
  engage(): void {
    const e = this.boss;
    const f = this.frame;
    if (!e || !e.alive || !f) return;
    const p = this.d.player.position;
    const l = f.toLocal(p.x, p.y, p.z, this.tmp);
    const lx = Math.max(-ARENA.halfWidth + 0.6, Math.min(ARENA.halfWidth - 0.6, l.x));
    this.d.player.teleport(f.toWorld(lx, ARENA.entry.y + 0.05, ARENA.entry.z), f.yawToWorld(Math.PI));
    this.plunge.reset();
    this.beginFight();
  }

  /** Start the fight (no player move). Idempotent. */
  private beginFight(): void {
    const e = this.boss;
    if (!e || !e.alive) return;
    const data = taurusData(e);
    if (data.engaged) return;
    data.engaged = true;
    this.combat.addTarget(e);
    this.lastHp = e.health.hp;
    this.bus.emit('bossBar', { show: true, name: e.def.name, hp: e.health.hp, max: e.health.maxHp });
  }

  /** Dev / no-InteractSystem path: [E] on the fog from outside. */
  traverseFog(): boolean {
    return this.fog?.traverse() ?? false;
  }

  private onWindup(): void {
    const max = this.d.dodgeHints ?? 3;
    if (!this.engaged || this.d.getDodgeHintCount() >= max) return;
    this.d.incDodgeHintCount();
    this.bus.emit('hintFlash', { action: 'dodge', label: 'Dodge', hold: 1.2 });
  }

  /** Big hit + guaranteed stagger. Returns damage dealt. */
  applyPlunge(kind: 'head' | 'land'): number {
    const e = this.boss;
    if (!e?.alive) return 0;
    const pp = this.d.player.position;
    const amount = plungeDamage(e.health.maxHp);
    e.staggerImmuneT = 0;
    const r = dealDamage(
      e,
      {
        source: this.d.player.id,
        target: e.id,
        amount,
        type: DamageType.Physical,
        poiseDamage: PLUNGE.poiseDamage,
        hitPos: { x: pp.x, y: pp.y, z: pp.z },
        dir: { x: 0, y: -1, z: 0 },
        weaponId: 'plunge',
      },
      this.bus,
    );
    if (e.alive && e.state !== 'stagger') e.state = 'stagger';
    this.bus.emit('plungeHit', { bossId: TAURUS_ID, dealt: r.dealt, kind });
    this.bus.emit('toast', { text: 'PLUNGING ATTACK', kind: 'info' });
    return r.dealt;
  }

  private onVictory(): void {
    const e = this.boss!;
    // Only a real fight counts (a dev killAll / kill on the dormant boss must not write the victory flag).
    if (!taurusData(e).engaged) return;
    taurusData(e).engaged = false;
    this.d.setDefeated();
    this.fog?.remove();
    this.far?.open();
    this.bus.emit('bossBar', { show: false });
    this.bus.emit('banner', { kind: 'victory' });
    this.victoryT = 0;
  }

  /** Player died in the arena: heal + rehome the boss, re-arm the fog, hide the bar. */
  reset(): void {
    const e = this.boss;
    if (!e || !e.alive) return;
    const data = taurusData(e);
    data.engaged = false;
    data.airborne = false;
    data.slamT = Infinity;
    data.lastMove = null;
    data.repeats = 0;
    e.health.hp = e.health.maxHp;
    e.poise.current = e.poise.max;
    e.capsule.teleport(e.home);
    e.prevPos.x = e.home.x;
    e.prevPos.y = e.home.y;
    e.prevPos.z = e.home.z;
    e.transform.yaw = e.prevYaw = e.homeYaw;
    e.attackCooldown = 0;
    e.staggerImmuneT = 0;
    e.attackSpent = false;
    e.ctx.currentAttack = null;
    e.state = 'idle';
    this.combat.removeTarget(e);
    this.fog?.arm();
    this.plunge.reset();
    this.lastHp = -1;
    this.bus.emit('bossBar', { show: false });
  }

  update(dt: number): void {
    if (!this.start()) return;
    this.fog?.update(dt);
    const pl = this.d.player;
    const dead = pl.state.move === 'dead' || pl.health.hp <= 0;
    if (this.victoryT >= 0 && !this.demoCompleted) {
      if (!dead) this.victoryT += dt; // DEMO COMPLETE waits for the respawn when you die after the kill
      if (this.victoryT >= (this.d.demoCompleteDelay ?? 6)) {
        this.demoCompleted = true;
        this.bus.emit('demoComplete', { bossId: TAURUS_ID });
        this.bus.emit('banner', { kind: 'demoComplete' });
      }
    }
    const e = this.boss;
    if (!e?.alive) return;
    const p = pl.position;
    // Any way into the arena volume (fog wall, or the Burg ledge/tower stairs over the wall) starts the fight.
    if (!taurusData(e).engaged) {
      if (dead || !this.frame || !this.frame.inArena(p.x, p.y, p.z)) return;
      this.plunge.reset();
      this.beginFight();
    }
    if (!dead) {
      const b = e.capsule.position;
      const pb = this.pb;
      pb.x = b.x;
      pb.y = b.y;
      pb.z = b.z;
      const hit = this.plunge.update(p.x, p.y, p.z, pl.velocity.y, pl.grounded, pb);
      if (hit) this.applyPlunge(hit);
    }
    if (e.alive && e.health.hp !== this.lastHp) {
      this.lastHp = e.health.hp;
      this.bus.emit('bossBar', { show: true, hp: e.health.hp, max: e.health.maxHp });
    }
  }

  render(): void {
    this.fog?.render();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (this.d.ai.bossArenaQuery) this.d.ai.bossArenaQuery = null;
    this.fog?.dispose();
    this.far?.dispose();
    if (this.boss) this.d.ai.despawn(this.boss);
    this.boss = null;
  }
}
