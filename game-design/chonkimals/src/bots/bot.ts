/**
 * Bot — one fake player. Owns its motion (path following, facing, hops,
 * ground snapping, animation); the BotManager decides where it goes next.
 */
import { gameEvents } from '../events';
import type { FrogPose } from '../log-course';
import type { AnimState, PlayerResult } from '../player';
import type { Rng } from '../rng';
import type { BotProfile } from './roster';

type Vector3 = import('three').Vector3;
type Group = import('three').Group;

export interface BotWorld {
  /** Ground Y under (x, z), casting down from fromY; null if nothing there. */
  groundAt(x: number, z: number, fromY: number): number | null;
  /** Off-limits ground (e.g. a minigame's play area) a free-roaming bot must not enter;
   * `from` = where it's stepping from (some areas let you step back out). */
  blocked(x: number, z: number, fromX?: number, fromZ?: number): boolean;
}

const TURN_SPEED   = 9;     // exp-decay rate toward target yaw
const HOP_GRAVITY  = 18;    // matches the player's jump gravity
const ARRIVE_DIST  = 0.3;
const CORNER_DIST  = 0.9;   // intermediate waypoints are "reached" from further out
const Y_SMOOTH     = 14;
const FIDGET_EVERY = [2.5, 7] as const; // seconds between idle look-arounds
const FIDGET_TURN  = 0.7;   // max radians a look-around turns from the facing target
const WEDGED_SKIP  = 1.2;   // seconds pressed against off-limits ground before skipping a waypoint

export type BotMode = 'travel' | 'linger';

/** A pose an outside driver moves the bot with; rides add body pitch/roll (hanging, prone). */
export type ExternalPose = FrogPose & { pitch?: number; roll?: number };

export class Bot {
  readonly root: Group;
  readonly height: number;
  /** Separation velocity accumulated by the manager each frame (world u/s). */
  readonly push = new THREE.Vector3();

  mode: BotMode = 'linger';
  /** Hotspot being travelled to / stood at; null while wandering. */
  spotId: string | null = null;
  /** Where the bot intends to stand (camp-local XZ), for spacing neighbours. */
  standLocal: [number, number] = [0, 0];
  lingerLeft = 0;

  private path: Vector3[] = [];
  private pathIdx = 0;
  private pendingLinger = 0;
  private running = false;
  private baseFaceYaw: number | null = null;
  private faceYaw: number | null = null;
  private fidgetIn = 0;
  private groundY = 0;
  private smoothY = 0;
  private hopH = 0;
  private hopV = 0;
  private anim: AnimState = 'idle';
  private animDt = 0;
  private external: ExternalPose | null = null;
  private wedged = 0;
  private readonly meshes: import('three').Mesh[] = [];
  private shadows = true;
  /** Scripted pace (u/s) for the next trips (e.g. escorting the player); null = personality. */
  speedOverride: number | null = null;
  /** Sat down (at a board game, say): no random hops, and the crowd can't shove it out of its seat. */
  seated = false;

  constructor(
    readonly profile: BotProfile,
    private readonly character: PlayerResult,
    readonly rng: Rng,
  ) {
    this.root = character.root;
    this.height = character.height;
    this.root.name = `bot_${profile.id}_${profile.name}`;
    this.root.traverse((o) => { if ((o as import('three').Mesh).isMesh) this.meshes.push(o as import('three').Mesh); });
    this.root.rotation.y = rng.range(-Math.PI, Math.PI);
  }

  get airborne(): boolean {
    return this.hopH > 0 || this.hopV > 0;
  }

  placeAt(pos: Vector3, groundY: number): void {
    this.root.position.set(pos.x, groundY, pos.z);
    this.groundY = this.smoothY = groundY;
  }

  travel(path: Vector3[], faceYaw: number | null, lingerSeconds: number): void {
    this.path = path;
    this.pathIdx = 0;
    this.baseFaceYaw = faceYaw;
    this.pendingLinger = lingerSeconds;
    this.running = this.rng.chance(this.profile.personality.runChance);
    this.mode = path.length > 0 ? 'travel' : 'linger';
    if (this.mode === 'linger') this.startLinger();
  }

  /**
   * Hands motion to an outside driver (e.g. the log course) that updates
   * `pose` each frame; pass null to take control back where the pose left it.
   */
  setExternalPose(pose: ExternalPose | null): void {
    this.external = pose;
    if (pose) return;
    this.root.rotation.set(0, this.root.rotation.y, 0); // stand up straight again after a ride
    this.groundY = this.smoothY = this.root.position.y;
    this.hopH = this.hopV = 0;
    this.path = [];
    this.mode = 'linger';
    this.lingerLeft = 0;
  }

  get driven(): boolean {
    return this.external !== null;
  }

  /** Turns to (and keeps) a facing while lingering. */
  faceTowards(yaw: number): void {
    this.baseFaceYaw = this.faceYaw = yaw;
    this.fidgetIn = 1e9;
  }

  /** Skinned shadows are costly: only bots near the camera cast them. */
  setCastShadow(on: boolean): void {
    if (on === this.shadows) return;
    this.shadows = on;
    for (const m of this.meshes) m.castShadow = on;
  }

  /** Jumps now (if on the ground). */
  hop(): void {
    if (!this.airborne && !this.external) this.hopV = this.profile.personality.hopSpeed;
  }

  /** Cuts the current linger short so the bot re-decides soon. */
  hurry(maxSeconds: number): void {
    if (this.mode === 'linger') this.lingerLeft = Math.min(this.lingerLeft, this.rng.range(0, maxSeconds));
  }

  /** Where the nameplate anchors (world). */
  headPosition(out: Vector3, scale: number): Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.height * scale + 0.35);
  }

  /** Advances one frame. Returns true when the bot wants a new destination.
   * `footOffset` matches the player's grounding fine-tune (feet vs surface) so
   * bots sit at the same height as the player character. */
  update(dt: number, world: BotWorld, animate: boolean, footOffset = 0): boolean {
    if (this.external) {
      const ext = this.external;
      this.root.position.copy(ext.position);
      if (ext.pitch !== undefined || ext.roll !== undefined) {
        // Ride poses (zipline / glider) are already body positions, like the player's: no foot sink.
        this.root.rotation.set(ext.pitch ?? 0, ext.facing, (ext.roll ?? 0) * 0.6, 'YXZ');
      } else {
        // Poses are surface points (a log node, the ground); sink by the foot offset like free roam.
        this.root.position.y += footOffset;
        this.root.rotation.y = ext.facing;
      }
      this.push.set(0, 0, 0);
      this.animate(dt, this.external.anim, animate);
      return false;
    }
    const p = this.profile.personality;
    const pos = this.root.position;
    let moving = false;
    let wantsDecision = false;
    let targetYaw: number | null = null;

    if (this.mode === 'travel') {
      const target = this.path[this.pathIdx];
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? ARRIVE_DIST : CORNER_DIST)) {
        if (++this.pathIdx >= this.path.length) this.startLinger();
      } else {
        const speed = this.speedOverride ?? (this.running ? p.runSpeed : p.walkSpeed);
        const step = Math.min(d, speed * dt);
        targetYaw = Math.atan2(dx, dz);
        moving = this.tryMove((dx / d) * step, (dz / d) * step, world);
        // Route runs into off-limits ground: give up on this waypoint.
        this.wedged = moving ? 0 : this.wedged + dt;
        if (this.wedged > WEDGED_SKIP) {
          this.wedged = 0;
          if (++this.pathIdx >= this.path.length) this.startLinger();
        }
      }
    } else {
      this.lingerLeft -= dt;
      if (this.lingerLeft <= 0) wantsDecision = true;
      if ((this.fidgetIn -= dt) <= 0) {
        this.fidgetIn = this.rng.range(...FIDGET_EVERY);
        const base = this.baseFaceYaw ?? this.root.rotation.y;
        this.faceYaw = base + this.rng.range(-FIDGET_TURN, FIDGET_TURN);
      }
      targetYaw = this.faceYaw;
    }

    const pushed = !this.seated && this.push.lengthSq() > 1e-6 && this.tryMove(this.push.x * dt, this.push.z * dt, world);
    this.push.set(0, 0, 0);

    if (targetYaw !== null) {
      let d = targetYaw - this.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.root.rotation.y += d * (1 - Math.exp(-TURN_SPEED * dt));
    }

    // Hops — players spam jump, standing or running.
    const hopRate = this.seated ? 0 : moving ? p.moveHopRate : p.idleHopRate;
    if (!this.airborne && hopRate > 0 && this.rng.chance(hopRate * dt)) {
      this.hopV = p.hopSpeed;
      // Heard by the local player (main.ts); skipped while the crowd is hidden (dodge ball).
      if (this.root.visible && this.root.parent?.visible !== false) {
        gameEvents.emit({ type: 'jump', actor: { id: this.profile.memberId, name: this.profile.name }, pos: pos });
      }
    }
    if (this.airborne) {
      this.hopV -= HOP_GRAVITY * dt;
      this.hopH += this.hopV * dt;
      if (this.hopH <= 0) { this.hopH = 0; this.hopV = 0; }
    }

    if (moving || pushed) {
      const g = world.groundAt(pos.x, pos.z, this.groundY + 3);
      if (g !== null) this.groundY = g;
    }
    this.smoothY += (this.groundY - this.smoothY) * (1 - Math.exp(-Y_SMOOTH * dt));
    pos.y = this.smoothY + this.hopH + footOffset;

    this.animate(dt, this.airborne
      ? (this.hopV > 0 ? 'jumping_up' : 'falling_idle')
      : moving ? (this.running ? 'running' : 'walking') : 'idle', animate);
    return wantsDecision;
  }

  /** Moves by (dx, dz), sliding along off-limits ground; false if fully blocked. */
  private tryMove(dx: number, dz: number, world: BotWorld): boolean {
    const pos = this.root.position;
    for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
      if ((mx !== 0 || mz !== 0) && !world.blocked(pos.x + mx, pos.z + mz, pos.x, pos.z)) {
        pos.x += mx;
        pos.z += mz;
        return true;
      }
    }
    return false;
  }

  private animate(dt: number, state: AnimState, tick: boolean): void {
    this.anim = state;
    this.animDt += dt;
    if (tick) {
      this.character.update(this.animDt, this.anim);
      this.animDt = 0;
    }
  }

  private startLinger(): void {
    this.mode = 'linger';
    this.lingerLeft = this.pendingLinger;
    this.faceYaw = this.baseFaceYaw;
    this.fidgetIn = this.rng.range(...FIDGET_EVERY);
  }
}
