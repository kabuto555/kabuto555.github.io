import type { Camera } from 'three';

const KEY = 'fx.shakeIntensity';

export function loadShakeIntensity(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const v = Number(raw);
    return raw === null || !Number.isFinite(v) ? 1 : Math.min(2, Math.max(0, v));
  } catch {
    return 1;
  }
}
export function saveShakeIntensity(v: number): void {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Smooth pseudo-noise in [-1,1] (sum of sines; no allocations, deterministic). */
export function noise1(t: number, seed: number): number {
  return Math.sin(t + seed * 12.9898) * 0.5 + Math.sin(t * 2.3 + seed * 78.233) * 0.3 + Math.sin(t * 4.1 + seed * 37.719) * 0.2;
}

export const SHAKE = { decay: 1.4, maxPos: 0.035, maxRot: 0.03, freq: 22 } as const;

/** Trauma-based shake (shake = trauma^2 * noise). */
export class Shake {
  trauma = 0;
  intensity = 1;
  private t = 0;
  ox = 0;
  oy = 0;
  rx = 0;
  ry = 0;
  rz = 0;
  private savedValid = false;
  private readonly sp = [0, 0, 0];
  private readonly sr = [0, 0, 0];
  private readonly wp = [0, 0, 0];
  private readonly wr = [0, 0, 0];

  /** Unshaken camera position (what gameplay should use): undoes our own offset if it is still applied. */
  basePos(cam: Camera, out: { x: number; y: number; z: number }): void {
    const p = cam.position;
    if (this.savedValid && p.x === this.wp[0] && p.y === this.wp[1] && p.z === this.wp[2]) {
      out.x = this.sp[0]!; out.y = this.sp[1]!; out.z = this.sp[2]!;
    } else {
      out.x = p.x; out.y = p.y; out.z = p.z;
    }
  }

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Advance decay + sample offsets. */
  step(dt: number): void {
    this.trauma = Math.max(0, this.trauma - SHAKE.decay * dt);
    this.t += dt * SHAKE.freq;
    const s = this.trauma * this.trauma * this.intensity;
    this.ox = SHAKE.maxPos * s * noise1(this.t, 1);
    this.oy = SHAKE.maxPos * s * noise1(this.t, 2);
    this.rx = SHAKE.maxRot * s * noise1(this.t, 3);
    this.ry = SHAKE.maxRot * s * noise1(this.t, 4);
    this.rz = SHAKE.maxRot * 1.4 * s * noise1(this.t, 5);
  }

  /** Render-phase: undo last frame's offset if nobody overwrote it, then apply the new one. */
  apply(cam: Camera): void {
    const p = cam.position;
    const r = cam.rotation;
    if (this.savedValid && p.x === this.wp[0] && p.y === this.wp[1] && p.z === this.wp[2] && r.x === this.wr[0] && r.y === this.wr[1] && r.z === this.wr[2]) {
      p.set(this.sp[0]!, this.sp[1]!, this.sp[2]!);
      r.set(this.sr[0]!, this.sr[1]!, this.sr[2]!);
    }
    this.savedValid = false;
    if (this.ox === 0 && this.oy === 0 && this.rx === 0 && this.ry === 0 && this.rz === 0) return;
    this.sp[0] = p.x; this.sp[1] = p.y; this.sp[2] = p.z;
    this.sr[0] = r.x; this.sr[1] = r.y; this.sr[2] = r.z;
    cam.translateX(this.ox);
    cam.translateY(this.oy);
    r.x += this.rx;
    r.y += this.ry;
    r.z += this.rz;
    this.wp[0] = p.x; this.wp[1] = p.y; this.wp[2] = p.z;
    this.wr[0] = r.x; this.wr[1] = r.y; this.wr[2] = r.z;
    this.savedValid = true;
  }
}
