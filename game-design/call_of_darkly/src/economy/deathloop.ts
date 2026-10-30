import type * as THREE from 'three';
import { DamageType } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import type { SaveData } from '../core/save';
import type { System, Vec3Like } from '../core/types';
import type { AmmoType } from '../data/types';
import { createBloodstainMarker, type BloodstainMarker, type InteractRegistry } from '../world/bloodstain';
import type { Bloodstain, SoulWallet } from './types';

declare module '../core/events' {
  interface EventMap {
    /** Death sequence: 'start' = show YOU DIED + death cam; 'end' = fade back in (player is respawned). */
    deathScreen: { phase: 'start' | 'end' };
    /** Player is back at the respawn point (controls re-enabled). */
    playerRespawned: { pos: Vec3Like };
    /** TODO(M8): died inside a boss arena - the boss system resets/heals the boss and re-locks the fog gate. */
    bossReset: { bossId: string };
  }
}

/** §9 pistol floor: reserve is topped up to at least this on respawn / rest. */
export const PISTOL_FLOOR = 24;
/** Death cam / YOU DIED beat before respawning (seconds). */
export const DEATH_CAM_SECONDS = 3;
/** Below this Y the player is dead (fell out of the world) and the death pos is unsafe. */
export const DEFAULT_KILL_Y = -40;

export interface RespawnPoint {
  pos: Vec3Like;
  yaw: number;
}

/** The slice of PlayerController the death loop uses. */
export interface DeathLoopPlayer {
  readonly id: number;
  readonly position: Vec3Like;
  readonly grounded: boolean;
  readonly state: { readonly move: string };
  controlsEnabled: boolean;
  respawn(pos: Vec3Like, yaw: number): void;
  refill(): void;
}

export interface DeathLoopWallet extends SoulWallet {
  set(total: number): void;
}

export interface DeathLoopDeps {
  player: DeathLoopPlayer;
  wallet: DeathLoopWallet;
  /** Accepted for API symmetry (world one-time state is untouched by death). */
  progress?: unknown;
  ai: { respawnAll(): void };
  pickups: { restockCaches(): void };
  combat: { ammo: { get(t: AmmoType): number; set(t: AmmoType, n: number): void } };
  interact: InteractRegistry;
  /** Scene/world group for the bloodstain visuals; null/omitted = headless. */
  scene?: THREE.Object3D | null;
  /** Loaded save (restores the persisted bloodstain). */
  save?: SaveData | null;
  /** Last rested bonfire (or the area spawn). */
  getRespawn: () => RespawnPoint;
  /** Id recorded with a new bloodstain; `pos` = where the stain goes (derive the area from it, not from stale tracking). Default 'main'. */
  getAreaId?: (pos?: Vec3Like) => string;
  /** Boss id when the player is inside a boss arena right now (M8 hook), else null. */
  inBossArena?: () => string | null;
  bus?: EventBus;
  killY?: number;
  /** Emit lethal damage when the player falls below killY. Default true. */
  voidKills?: boolean;
  deathSeconds?: number;
}

type Phase = 'alive' | 'dying';

/** Death loop (§9): death -> bloodstain -> respawn -> recover. Register after the player. */
export class DeathLoop implements System {
  readonly name = 'deathloop';
  /** Fired after the bloodstain changed (main.ts schedules a save). */
  onChange: (() => void) | null = null;

  private readonly d: DeathLoopDeps;
  private readonly bus: EventBus;
  private readonly killY: number;
  private readonly deathSeconds: number;
  private _phase: Phase = 'alive';
  private timer = 0;
  private stain: Bloodstain | null = null;
  private marker: BloodstainMarker | null = null;
  /** A saved stain from another area: not spawned here, but kept in the save until that area loads or the player dies. */
  private foreign: Bloodstain | null = null;
  private pendingBoss: string | null = null;
  /** Last position where the player stood on solid ground (fallback for unsafe death spots). */
  private readonly lastGrounded = { x: 0, y: 0, z: 0 };
  private haveGrounded = false;
  private readonly offs: (() => void)[] = [];

  constructor(deps: DeathLoopDeps) {
    this.d = deps;
    this.bus = deps.bus ?? globalEvents;
    this.killY = deps.killY ?? DEFAULT_KILL_Y;
    this.deathSeconds = deps.deathSeconds ?? DEATH_CAM_SECONDS;
    this.offs.push(this.bus.on('playerDied', (e) => this.onDied(e.pos)));
    // Instant moves (dev teleport, ladders, boss entry): the old grounded anchor may be in another area.
    this.offs.push(
      this.bus.on('playerTeleported', (e) => {
        if (this._phase !== 'alive' || !(e.pos.y > this.killY) || !Number.isFinite(e.pos.y)) return;
        this.lastGrounded.x = e.pos.x;
        this.lastGrounded.y = e.pos.y;
        this.lastGrounded.z = e.pos.z;
        this.haveGrounded = true;
      }),
    );
    this.load(deps.save ?? null);
  }

  get phase(): Phase {
    return this._phase;
  }

  /** The unrecovered bloodstain (copy), or null. */
  get bloodstain(): Bloodstain | null {
    return this.stain ? { areaId: this.stain.areaId, pos: [...this.stain.pos], souls: this.stain.souls } : null;
  }

  /** Restore from a save (also clears any current stain). */
  load(save: SaveData | null | undefined): void {
    this.clearStain();
    const b = save?.bloodstain;
    if (b && Array.isArray(b.pos) && b.pos.length === 3 && b.pos.every(Number.isFinite) && Number.isFinite(b.souls) && b.souls > 0) {
      const st: Bloodstain = { areaId: typeof b.areaId === 'string' ? b.areaId : 'main', pos: [b.pos[0]!, b.pos[1]!, b.pos[2]!], souls: Math.floor(b.souls) };
      if (st.areaId === (this.d.getAreaId?.() ?? 'main')) this.setStain(st, false);
      else this.foreign = st;
    }
  }

  writeSave(save: SaveData): SaveData {
    save.bloodstain = this.bloodstain ?? (this.foreign ? { areaId: this.foreign.areaId, pos: [...this.foreign.pos], souls: this.foreign.souls } : null);
    return save;
  }

  update(dt: number): void {
    const p = this.d.player;
    this.marker?.tick(dt);
    if (this._phase === 'alive') {
      const pos = p.position;
      if (p.state.move !== 'dead') {
        if (p.grounded && pos.y > this.killY && (p.state.move === 'ground' || p.state.move === 'dodge' || p.state.move === 'drinking')) {
          this.lastGrounded.x = pos.x;
          this.lastGrounded.y = pos.y;
          this.lastGrounded.z = pos.z;
          this.haveGrounded = true;
        } else if (pos.y < this.killY && this.d.voidKills !== false) {
          // Fell out of the world: lethal damage (the player controller emits playerDied).
          this.bus.emit('damage', { source: null, target: p.id, amount: 1e6, type: DamageType.Physical, poiseDamage: 0, hitPos: { x: pos.x, y: pos.y, z: pos.z } });
        }
      }
      return;
    }
    this.timer += dt;
    if (this.timer >= this.deathSeconds) this.finishRespawn();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.clearStain();
  }

  // ------------------------------------------------------------------ death

  private onDied(pos: Vec3Like): void {
    if (this._phase !== 'alive') return;
    const d = this.d;
    this._phase = 'dying';
    this.timer = 0;
    d.player.controlsEnabled = false;
    this.pendingBoss = d.inBossArena?.() ?? null;

    const souls = Math.floor(d.wallet.souls);
    // Dying again wipes any unrecovered stain for good (PLAN §9), even with 0 souls in hand.
    this.clearStain(false);
    if (souls > 0) {
      const at = this.safeSpot(pos);
      // Area follows the stain position (a teleport/transition may not have ticked yet).
      this.setStain({ areaId: d.getAreaId?.(at) ?? 'main', pos: [at.x, at.y, at.z], souls }, false);
      d.wallet.set(0);
    }
    // One notification after wallet + stain agree, so the save never holds souls AND the stain (or neither).
    this.onChange?.();
    this.bus.emit('deathScreen', { phase: 'start' });
  }

  /** Unsafe = below the kill plane or airborne at the moment of death -> last grounded spot. */
  private safeSpot(pos: Vec3Like): Vec3Like {
    const unsafe = !(pos.y > this.killY) || !this.d.player.grounded || !Number.isFinite(pos.y);
    if (!unsafe) return { x: pos.x, y: pos.y, z: pos.z };
    if (this.haveGrounded) return { ...this.lastGrounded };
    return { ...this.d.getRespawn().pos };
  }

  private finishRespawn(): void {
    const d = this.d;
    const r = d.getRespawn();
    d.player.respawn(r.pos, r.yaw);
    d.player.refill();
    d.ai.respawnAll();
    d.pickups.restockCaches();
    if (d.combat.ammo.get('pistol') < PISTOL_FLOOR) d.combat.ammo.set('pistol', PISTOL_FLOOR);
    // Fresh grounded anchor: the spawn.
    this.lastGrounded.x = r.pos.x;
    this.lastGrounded.y = r.pos.y;
    this.lastGrounded.z = r.pos.z;
    this.haveGrounded = true;
    d.player.controlsEnabled = true;
    this._phase = 'alive';
    // TODO(M8): boss system listens for bossReset (heal boss, re-lock arena gate, hide health bar).
    if (this.pendingBoss) this.bus.emit('bossReset', { bossId: this.pendingBoss });
    this.pendingBoss = null;
    this.bus.emit('deathScreen', { phase: 'end' });
    this.bus.emit('playerRespawned', { pos: { x: r.pos.x, y: r.pos.y, z: r.pos.z } });
  }

  // ------------------------------------------------------------------ bloodstain

  private setStain(s: Bloodstain, notify: boolean): void {
    this.stain = s;
    this.marker = createBloodstainMarker({
      pos: { x: s.pos[0], y: s.pos[1], z: s.pos[2] },
      souls: s.souls,
      interact: this.d.interact,
      parent: this.d.scene ?? null,
      onRecover: () => this.recover(),
      canRecover: () => this._phase === 'alive',
    });
    if (notify) this.onChange?.();
  }

  private clearStain(notify = true): void {
    const had = this.stain !== null || this.foreign !== null;
    this.foreign = null;
    this.marker?.dispose();
    this.marker = null;
    this.stain = null;
    if (had && notify) this.onChange?.();
  }

  /** [E] on the stain: souls back into the wallet. Returns souls recovered. */
  recover(): number {
    const s = this.stain;
    if (!s || this._phase !== 'alive') return 0;
    this.marker?.dispose();
    this.marker = null;
    this.stain = null;
    this.d.wallet.add(s.souls);
    this.bus.emit('bloodstainRecovered', { souls: s.souls });
    this.bus.emit('toast', { text: `SOULS RECOVERED +${s.souls}`, kind: 'info' });
    this.onChange?.();
    return s.souls;
  }
}

export function createDeathLoop(deps: DeathLoopDeps): DeathLoop {
  return new DeathLoop(deps);
}
