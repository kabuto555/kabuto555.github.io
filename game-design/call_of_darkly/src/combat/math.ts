/**
 * Pure combat math (no globals, no three): unit-testable. Angles in degrees unless stated.
 */
import type { DamageType } from '../core/entity';
import type { Vec3Like } from '../core/types';
import type { AmmoType, GunDef, ShieldDef } from '../data/types';
import { COMBAT_TUNING as C } from './tuning';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const DEG = Math.PI / 180;

// ------------------------------------------------------------------ fire rate / damage

/** Seconds between shots at `rpm`. */
export function fireInterval(rpm: number): number {
  return 60 / Math.max(1, rpm);
}

/** Damage multiplier by distance: 1 up to start fraction of range, linear to falloffMin at range, flat after. */
export function damageFalloff(range: number, falloffMin: number, dist: number): number {
  const start = range * C.falloffStartFrac;
  if (dist <= start) return 1;
  if (dist >= range) return falloffMin;
  const t = (dist - start) / Math.max(1e-6, range - start);
  return 1 + (falloffMin - 1) * t;
}

/** Final per-bullet damage: base × stat multiplier × falloff × headshot. */
export function bulletDamage(def: Pick<GunDef, 'damage' | 'range' | 'falloffMin' | 'headshotMult'>, dist: number, head: boolean, gunDamageMul: number): number {
  return def.damage * gunDamageMul * damageFalloff(def.range, def.falloffMin, dist) * (head ? def.headshotMult : 1);
}

// ------------------------------------------------------------------ spread

export interface SpreadInput {
  hip: number;
  ads: number;
  /** 0..1 ADS blend. */
  adsT: number;
  /** Horizontal speed, m/s, and walk speed for normalisation. */
  speed: number;
  walkSpeed: number;
  airborne: boolean;
  /** Accumulated per-shot bloom (deg). */
  bloom: number;
  classMul: number;
  /** `adsSway` modifier (Steady Aim): scales the ADS cone. */
  adsSway: number;
}

/** Cone half-angle (deg): blend hip→ADS, grow with movement/air, plus bloom. */
export function computeSpread(i: SpreadInput): number {
  const hip = i.hip * i.classMul;
  const ads = i.ads * i.classMul * i.adsSway;
  const base = hip + (ads - hip) * clamp(i.adsT, 0, 1);
  const speedFrac = clamp(i.speed / Math.max(0.1, i.walkSpeed), 0, 1.6);
  const moveMul = 1 + C.moveSpreadGain * speedFrac * (1 - 0.6 * clamp(i.adsT, 0, 1));
  return base * moveMul + (i.airborne ? C.airSpread : 0) + i.bloom * (1 - 0.5 * clamp(i.adsT, 0, 1));
}

export function bloomStep(bloom: number, dt: number, fired: boolean): number {
  if (fired) return Math.min(C.bloomMax, bloom + C.bloomPerShot);
  return Math.max(0, bloom - C.bloomDecay * dt);
}

/** Uniform point in a cone: returns offsets (radians) along right/up for random u1,u2 in [0,1). */
export function coneOffset(spreadDeg: number, u1: number, u2: number, out: { r: number; u: number } = { r: 0, u: 0 }): { r: number; u: number } {
  const ang = spreadDeg * DEG * Math.sqrt(u1);
  const az = u2 * Math.PI * 2;
  out.r = Math.cos(az) * ang;
  out.u = Math.sin(az) * ang;
  return out;
}

// ------------------------------------------------------------------ recoil

export interface RecoilKick {
  /** Degrees, pitch up positive. */
  up: number;
  /** Degrees, yaw; sign random. */
  side: number;
}

/**
 * One shot's kick. `shotIdx` = index within the current burst (0 = first). Vertical climbs
 * (ramps rampMin→rampMax), horizontal is symmetric jitter. `rnd` in [0,1).
 */
export function recoilKick(def: Pick<GunDef, 'recoil'>, shotIdx: number, rnd: number, ads: boolean, recoilMul: number): RecoilKick {
  const ramp = C.recoilRampMin + (C.recoilRampMax - C.recoilRampMin) * clamp(shotIdx / C.recoilRampShots, 0, 1);
  const s = C.recoilScale * recoilMul * (ads ? C.recoilAdsMul : 1);
  return { up: def.recoil.up * ramp * s, side: def.recoil.side * (rnd * 2 - 1) * s };
}

/** Amount (deg) of the outstanding recoil `acc` to take back this tick; 0 until `idle` > recoverDelay. */
export function recoilRecover(acc: number, dt: number, idle: number): number {
  if (idle < C.recoilRecoverDelay || acc === 0) return 0;
  const sign = Math.sign(acc);
  const mag = Math.abs(acc);
  const d = Math.min(mag, mag * (1 - Math.exp(-C.recoilRecoverRate * dt)) + C.recoilRecoverMin * dt);
  return sign * d;
}

// ------------------------------------------------------------------ reload / ammo

/** Reload seconds: empty = full time, tactical (rounds left) shorter; `reloadSpeed` modifier divides. */
export function reloadDuration(reloadTime: number, mag: number, reloadSpeed: number): number {
  const base = mag > 0 ? reloadTime * C.tacticalReloadFrac : reloadTime;
  return base / Math.max(0.1, reloadSpeed);
}

/** Move rounds from reserve into the mag. */
export function reloadFill(mag: number, capacity: number, reserve: number): { mag: number; reserve: number } {
  const take = Math.max(0, Math.min(capacity - mag, reserve));
  return { mag: mag + take, reserve: reserve - take };
}

/** Clamp a reserve to the per-type cap (AMMO table). */
export function clampReserve(n: number, cap: number): number {
  return clamp(Math.floor(n), 0, cap);
}

/** Add `n` to `have` under `cap`: returns new total and the overflow that did not fit. */
export function addCapped(have: number, n: number, cap: number): { total: number; overflow: number } {
  const total = clampReserve(have + n, cap);
  return { total, overflow: Math.max(0, have + n - total) };
}

/** Rounds consumed by one trigger pull (double-barrel fires both). */
export function roundsPerShot(fireMode: GunDef['fireMode'], mag: number): number {
  return fireMode === 'double' ? Math.min(2, mag) : 1;
}

/** Pellets for this pull (double-barrel firing one shell fires half). */
export function pelletsForShot(def: Pick<GunDef, 'pellets' | 'fireMode'>, rounds: number): number {
  return def.fireMode === 'double' ? Math.max(1, Math.round((def.pellets * rounds) / 2)) : def.pellets;
}

export type { AmmoType };

// ------------------------------------------------------------------ shield

export interface BlockResult {
  /** Damage that gets through to the player. */
  damageTaken: number;
  /** Stamina the block costs (clamped to what the player has when guard breaks). */
  staminaCost: number;
  guardBroken: boolean;
}

/**
 * Shield block. Only physical damage is blocked (`blockPhys` fraction); each blocked point costs
 * (1 − stability) stamina. If the player cannot afford it the guard breaks: the part of the block
 * that stamina could not cover goes through, stamina drops to 0.
 */
export function resolveBlock(amount: number, type: DamageType | string, shield: Pick<ShieldDef, 'blockPhys' | 'stability'>, stamina: number): BlockResult {
  const frac = type === 'physical' ? clamp(shield.blockPhys, 0, 1) : 0;
  const absorbed = amount * frac;
  if (absorbed <= 0) return { damageTaken: amount, staminaCost: 0, guardBroken: false };
  const cost = absorbed * (1 - clamp(shield.stability, 0, 1));
  if (cost < stamina || cost <= 0) return { damageTaken: amount - absorbed, staminaCost: cost, guardBroken: false };
  const covered = absorbed * (stamina / cost);
  return { damageTaken: amount - covered, staminaCost: stamina, guardBroken: true };
}

/** True if a hit travelling along `dir` strikes the front of a holder facing `fwd` (both unit, XZ used). */
export function hitsFront(dirX: number, dirZ: number, fwdX: number, fwdZ: number): boolean {
  const l = Math.hypot(dirX, dirZ);
  if (l < 1e-6) return true; // vertical/unknown: treat as frontal
  return (dirX * fwdX + dirZ * fwdZ) / l < C.blockFacingDot;
}

// ------------------------------------------------------------------ ray vs shapes

/** Ray (unit dir) vs sphere: nearest t >= 0 within maxT, or -1. */
export function raySphere(o: Vec3Like, d: Vec3Like, c: Vec3Like, r: number, maxT: number): number {
  const mx = o.x - c.x;
  const my = o.y - c.y;
  const mz = o.z - c.z;
  const b = mx * d.x + my * d.y + mz * d.z;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc > 0 && b > 0) return -1;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = Math.max(0, -b - Math.sqrt(disc));
  return t <= maxT ? t : -1;
}

/**
 * Ray (unit dir) vs vertical capsule: axis from (x, y0, z) to (x, y1, z), radius r (y0..y1 are the
 * sphere CENTERS). Nearest t in [0, maxT] or -1.
 */
const capC0 = { x: 0, y: 0, z: 0 };
const capC1 = { x: 0, y: 0, z: 0 };

export function rayVCapsule(o: Vec3Like, d: Vec3Like, x: number, y0: number, z: number, y1: number, r: number, maxT: number): number {
  let best = -1;
  // side cylinder (infinite in y), then clip to [y0, y1]
  const ox = o.x - x;
  const oz = o.z - z;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / a;
      if (t < 0) t = (-b + sq) / a; // origin inside the cylinder
      const y = o.y + d.y * t;
      if (t >= 0 && t <= maxT && y >= y0 && y <= y1) best = t;
    }
  }
  capC0.x = capC1.x = x;
  capC0.z = capC1.z = z;
  capC0.y = y0;
  capC1.y = y1;
  const t0 = raySphere(o, d, capC0, r, maxT);
  if (t0 >= 0 && (best < 0 || t0 < best)) best = t0;
  const t1 = raySphere(o, d, capC1, r, maxT);
  if (t1 >= 0 && (best < 0 || t1 < best)) best = t1;
  return best;
}

// ------------------------------------------------------------------ explosions

/** Splash damage multiplier: 1 at the blast centre, linear to 0 at `radius`. */
export function splashFalloff(dist: number, radius: number): number {
  if (radius <= 0 || dist >= radius) return 0;
  return dist <= 0 ? 1 : 1 - dist / radius;
}

/** Distance from point (px,py,pz) to a vertical segment (x, y0..y1, z), minus `radius` (>= 0). */
export function distToVCapsule(px: number, py: number, pz: number, x: number, y0: number, y1: number, z: number, radius: number): number {
  const cy = py < y0 ? y0 : py > y1 ? y1 : py;
  return Math.max(0, Math.hypot(px - x, py - cy, pz - z) - radius);
}

// ------------------------------------------------------------------ melee

/**
 * Is a point at offset (vx,vy,vz) from the eye within the swing? `fwd` unit look vector,
 * `reach` m (measured to the target surface via `targetRadius`), `arcDeg` full arc width.
 */
export function inMeleeArc(vx: number, vy: number, vz: number, fwd: Vec3Like, reach: number, arcDeg: number, targetRadius: number): boolean {
  const len = Math.hypot(vx, vy, vz);
  if (len - targetRadius > reach) return false;
  if (len < 1e-6) return true;
  const cos = (vx * fwd.x + vy * fwd.y + vz * fwd.z) / len;
  // widen by the target's angular radius so grazing hits count
  const widen = Math.asin(clamp(targetRadius / Math.max(len, targetRadius + 1e-6), 0, 1));
  return Math.acos(clamp(cos, -1, 1)) <= arcDeg * DEG * 0.5 + widen;
}
