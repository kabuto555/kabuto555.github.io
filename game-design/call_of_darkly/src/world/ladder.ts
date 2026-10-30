import * as THREE from 'three';
import { input as globalInput, type Input } from '../core/input';
import type { System, Vec3Like } from '../core/types';
import { makePs1Material } from '../render/materials';
import { coloredBoxes, type ColoredBox } from './props';
import type { Interactable, InteractSystem } from './interact';

export interface LadderSpec {
  id: string;
  /** Ladder foot on the wall face (x, z). */
  x: number;
  z: number;
  yBottom: number;
  yTop: number;
  /** Horizontal unit vector pointing from the wall toward the climber (the side the ladder is used from). */
  n: readonly [number, number];
}

/** What the ladder needs from the player (PlayerController satisfies it). */
export interface LadderPlayer {
  readonly position: Vec3Like;
  readonly state: { readonly move: string };
  /** While true the controller skips locomotion/gravity (mouse look still works). */
  hold: boolean;
  teleport(pos: Vec3Like, yaw: number): void;
  /** Smooth climb step (interpolated by render); falls back to teleport when absent. */
  climbTo?(pos: Vec3Like, yaw: number): void;
}

export interface LadderDeps {
  parent: THREE.Object3D;
  interact: InteractSystem;
  player: LadderPlayer;
  input?: Input;
  /** True while a menu holds the mouse. */
  isBlocked?: () => boolean;
}

const SPEED = 2.4;
/** Auto-dismount onto the top platform once the climber's feet are this close to the lip (resting) ... */
const TOP_REACH = 0.4;
/** ... or this close while still pushing up (the eyes clear the lip about 1.6 m above the feet, so stopping there looked like the top). */
const TOP_REACH_UP = 0.9;
const OFFSET = 0.5; // player distance from the wall while climbing
const NEAR_Y = 1.6;

const canMount = (move: string): boolean => move === 'ground' || move === 'air';

/** Ladder visual: two rails + rungs, origin at the foot, facing local +Z (toward the climber). */
function ladderGeometry(h: number): THREE.BufferGeometry {
  const parts: ColoredBox[] = [
    [0.07, h, 0.07, -0.3, h / 2, 0.08, 0x6a4a2c],
    [0.07, h, 0.07, 0.3, h / 2, 0.08, 0x6a4a2c],
  ];
  for (let y = 0.3; y < h; y += 0.35) parts.push([0.6, 0.05, 0.05, 0, y, 0.08, 0x8a6a40]);
  return coloredBoxes(parts);
}

/**
 * Climbable ladders (§10 beat 8). E at the bottom starts the climb, W/S move along it, E / Space lets go.
 * Reaching the top or bottom dismounts onto the surface beyond (top: away from the climber side).
 * Uses `player.hold` + `teleport` so no collision tweaks are needed.
 */
export class LadderSystem implements System {
  readonly name = 'ladders';
  active: LadderSpec | null = null;
  private y = 0;
  private vy = 0;
  private readonly input: Input;
  private readonly ladders: LadderSpec[] = [];
  private readonly offs: Array<() => void> = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly mat = makePs1Material({ vertexColors: true });

  constructor(private readonly d: LadderDeps) {
    this.input = d.input ?? globalInput;
  }

  addLadder(s: LadderSpec): void {
    this.ladders.push(s);
    const h = s.yTop - s.yBottom + 0.9; // rails stick out above the lip
    const mesh = new THREE.Mesh(ladderGeometry(h), this.mat);
    mesh.position.set(s.x, s.yBottom, s.z);
    mesh.rotation.y = Math.atan2(s.n[0], s.n[1]);
    mesh.name = `ladder:${s.id}`;
    this.d.parent.add(mesh);
    this.meshes.push(mesh);
    const mk = (top: boolean): Interactable => {
      const k = top ? -0.7 : 0.55;
      return {
        pos: { x: s.x + s.n[0] * k, y: (top ? s.yTop : s.yBottom) + 1.0, z: s.z + s.n[1] * k },
        range: 2.0,
        enabled: () => this.active === null && this.nearEnd(s, top),
        prompt: () => (this.active === null && this.nearEnd(s, top) ? (top ? 'Climb down' : 'Climb ladder') : null),
        interact: () => this.mount(s, top),
      };
    };
    this.offs.push(this.d.interact.register(mk(false)), this.d.interact.register(mk(true)));
  }

  /** Dev: jump straight onto a ladder. */
  mountById(id: string, fromTop = false): boolean {
    const s = this.ladders.find((l) => l.id === id);
    if (!s) return false;
    this.mount(s, fromTop);
    return true;
  }

  private nearEnd(s: LadderSpec, top: boolean): boolean {
    if (this.d.isBlocked?.() || !canMount(this.d.player.state.move)) return false;
    const py = this.d.player.position.y;
    return Math.abs(py - (top ? s.yTop : s.yBottom)) < NEAR_Y;
  }

  private faceYaw(s: LadderSpec): number {
    return Math.atan2(s.n[0], s.n[1]); // looking along -n (into the wall)
  }

  private mount(s: LadderSpec, top: boolean): void {
    // No mounting out of a roll / mantle / knockdown / estus drink / death (the hold would eat that state).
    if (this.active || !canMount(this.d.player.state.move)) return;
    this.active = s;
    this.y = top ? s.yTop - 0.3 : s.yBottom + 0.05;
    this.vy = 0;
    this.d.player.hold = true;
    this.place(s);
  }

  private place(s: LadderSpec): void {
    const pos = { x: s.x + s.n[0] * OFFSET, y: this.y, z: s.z + s.n[1] * OFFSET };
    if (this.d.player.climbTo) this.d.player.climbTo(pos, this.faceYaw(s));
    else this.d.player.teleport(pos, this.faceYaw(s));
  }

  private release(at: Vec3Like | null): void {
    const s = this.active;
    this.active = null;
    this.d.player.hold = false;
    if (s && at) this.d.player.teleport(at, this.faceYaw(s));
  }

  update(dt: number): void {
    const s = this.active;
    if (!s) return;
    const pl = this.d.player;
    if (pl.state.move === 'dead') return this.release(null);
    if (this.input.pressed('interact') || this.input.pressed('jump')) {
      // let go: step back off the ladder at the current height
      return this.release({ x: s.x + s.n[0] * 0.85, y: this.y, z: s.z + s.n[1] * 0.85 });
    }
    const dy = this.d.isBlocked?.() ? 0 : this.input.moveAxis().y;
    // ease toward the target climb speed so start/stop does not snap the camera
    this.vy += (dy * SPEED - this.vy) * Math.min(1, dt * 14);
    this.y += this.vy * dt;
    if (this.y >= s.yTop - (dy > 0 ? TOP_REACH_UP : TOP_REACH)) {
      this.y = s.yTop;
      return this.release({ x: s.x - s.n[0] * 0.9, y: s.yTop + 0.05, z: s.z - s.n[1] * 0.9 });
    }
    if (this.y <= s.yBottom) {
      this.y = s.yBottom;
      return this.release({ x: s.x + s.n[0] * 0.9, y: s.yBottom + 0.05, z: s.z + s.n[1] * 0.9 });
    }
    this.place(s);
  }

  dispose(): void {
    for (const o of this.offs) o();
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.mat.dispose();
    this.d.player.hold = false;
  }
}
