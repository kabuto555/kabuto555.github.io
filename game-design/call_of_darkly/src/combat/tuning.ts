/**
 * Combat feel constants. PLAN §4 gives mag/damage/rpm/caps; everything here is tuned (not in PLAN).
 */
import type { GunClass } from '../data/types';

export const COMBAT_TUNING = {
  /** Fraction of `range` at which damage falloff starts (linear to falloffMin at `range`). */
  falloffStartFrac: 0.35,
  /** Bullets travel this far (m); falloff is flat past `range`. */
  maxRayDist: 200,
  /** Multiplier on data spread (deg) per gun class (data defaults are one-size-fits-all placeholders). */
  spreadClassMul: { ar: 0.5, pistol: 0.5, revolver: 0.4, smg: 0.6, shotgun: 2.2, marksman: 0.25, lmg: 0.6, launcher: 0.5 } as Record<GunClass, number>,
  /** Spread grows by this fraction at full walk speed (x2 sprint-ish cap handled by speed clamp). */
  moveSpreadGain: 0.9,
  /** Extra cone (deg) while airborne. */
  airSpread: 2.5,
  /** Bloom (deg) added per shot, max, and decay rate (deg/s). */
  bloomPerShot: 0.3,
  bloomMax: 2.5,
  bloomDecay: 6,
  /** Global recoil scale on data kick (deg/shot). ADS multiplies by recoilAdsMul. */
  recoilScale: 0.55,
  recoilAdsMul: 0.7,
  /** Shots into a burst over which vertical kick ramps from rampMin to rampMax. */
  recoilRampShots: 10,
  recoilRampMin: 0.8,
  recoilRampMax: 1.4,
  /** Seconds after the last shot before the burst counter and recovery reset/start. */
  recoilBurstReset: 0.3,
  recoilRecoverDelay: 0.1,
  /** Recovery: fraction of the outstanding recoil removed per second (exp) plus a minimum deg/s. */
  recoilRecoverRate: 5,
  recoilRecoverMin: 1.5,
  /** Pending kick is applied to the camera with this time constant (s): snappy, not instant. */
  recoilKickTau: 0.025,
  /** Reload: tactical (rounds left in mag) is this fraction of the empty reload time. */
  tacticalReloadFrac: 0.72,
  /** Past this reload progress a cancel (sprint/swap/dodge) still keeps the new mag. */
  reloadInsertPoint: 0.65,
  /** Right-hand swap: lower time then raise time (s). */
  swapLower: 0.18,
  swapRaise: 0.27,
  /** Left-hand swap (s total, switch at half). */
  leftSwap: 0.4,
  /** Fire presses within this window before the cooldown ends are buffered (semi). */
  fireBuffer: 0.12,
  /** ADS FOV zoom (tan-based) per class. */
  adsZoom: { ar: 1.35, pistol: 1.2, revolver: 1.2, smg: 1.25, shotgun: 1.15, marksman: 2.2, lmg: 1.4, launcher: 1.3 } as Record<GunClass, number>,
  /** Move speed multiplier while fully ADS (per class; default adsMoveMul). */
  adsMoveMul: 0.65,
  adsMoveMulByClass: { lmg: 0.5, marksman: 0.55 } as Partial<Record<GunClass, number>>,
  /** Move speed multiplier while shield is up. */
  blockMoveMul: 0.75,
  /** Seconds to raise/lower the shield. Block is effective once past `blockReadyT`. */
  blockRaise: 0.12,
  blockReadyT: 0.7,
  /** Shield guard-break lockout (s). */
  guardBreakTime: 1.1,
  /** Shield protects hits whose travel direction opposes facing: dot(dir, forward) < this. */
  blockFacingDot: -0.25,
  /** Melee: total swing duration (s) and hit moment (fraction of the swing) per speed. */
  swingTime: { fast: 0.32, medium: 0.5, slow: 0.75 } as Record<'fast' | 'medium' | 'slow', number>,
  swingHitFrac: 0.4,
  /**
   * New-game reserves. PLAN §9: AR 30+90, Pistol 8+32 (≈ 3-4 encounters). The other types are a small
   * "first purchase" starter so a freshly bought gun is not dry; they are invisible until the gun is owned.
   */
  startReserve: { rifle: 90, pistol: 32, smg: 60, shotgun: 12, sniper: 10, launcher: 3 } as Record<string, number>,
} as const;
