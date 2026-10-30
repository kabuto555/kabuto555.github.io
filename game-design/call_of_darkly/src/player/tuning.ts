/**
 * Player feel constants. PLAN.md (§3) gives: dodge ≈0.5 s / 3.5 m / i-frames 0.05–0.35 s
 * (normal roll, see rollTier.ts), mantle window 0.6–1.8 m over ≈0.35 s, roll-tier thresholds.
 * Everything else here is tuned (not in PLAN) — adjust freely.
 */
const STEP_HEIGHT = 0.35;

export const PLAYER_TUNING = {
  // --- capsule ---
  radius: 0.35,
  height: 1.8,
  eyeHeight: 1.62,
  stepHeight: STEP_HEIGHT,
  slopeLimitDeg: 50,

  // --- locomotion (m/s, m/s²) ---
  walkSpeed: 4.5,
  sprintSpeed: 7.0,
  /** Ground accel toward the wish velocity (snappy: 0→walk in ~75 ms). */
  groundAccel: 60,
  /** Ground decel with no input (no ice skating: sprint→0 in ~140 ms). */
  groundDecel: 55,
  airAccel: 12,
  gravity: 22,
  terminalVelocity: 40,
  /** Apex height of a standing jump, m. */
  jumpHeight: 1.05,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  dodgeBuffer: 0.15,

  // --- stamina costs (§3 lists which actions cost; amounts are tuned) ---
  sprintCostPerSec: 15,
  jumpCost: 12,
  mantleCost: 10,
  dodgeCost: 22,
  // Stamina regen delay (STAMINA_TUNING.regenDelay = 0.6 s, exhaustDelay 1.2 s): any spend/drain
  // restarts it. Roll/mantle: the delay is re-armed when the action ENDS, so the pause is a full
  // regenDelay after the roll/mantle (not eaten by its 0.5 s). Airborne sprint drains nothing and
  // regen is gated only by the delay.

  // --- mantle (§3) ---
  mantleMinHeight: 0.6,
  /** Airborne grabs accept lower ledges (relative to the current feet), but never ones the auto step-up handles. */
  mantleMinHeightAir: STEP_HEIGHT + 0.1,
  /**
   * After a jump press, holding Space keeps the airborne grab armed for this long (s), so jumping
   * at a 2.4 m wall and holding Space still catches the lip. Later grabs need a fresh press
   * (within `jumpBuffer`); merely holding Space never grabs.
   */
  mantleGrabWindow: 0.55,
  /** HUD `canMantle` prompt probe cadence (sim ticks) when no jump is pending. */
  mantlePromptEvery: 6,
  mantleMaxHeight: 1.8,
  mantleDuration: 0.35,
  /** Horizontal probe reach beyond the capsule radius. */
  mantleReach: 0.6,
  /** How far onto the ledge the mantle ends (beyond the radius). */
  mantleInset: 0.15,
  /** Min facing: -dot(wallNormal, lookForward). 0.5 = within 60°. */
  mantleFacing: 0.5,

  // --- camera / feel ---
  mouseSensitivity: 0.0022,
  fov: 75,
  sprintFovKick: 6,
  stepSmoothRate: 14,
  bobWalk: 0.03,
  bobSprint: 0.05,
  /** Meters per full bob cycle (two footsteps). */
  bobStride: 2.4,
  landDipPerMs: 0.015,
  landDipMax: 0.18,
  dodgeCamDrop: 0.55,
  dodgeCamRoll: 0.14,
  mantleCamDip: 0.12,
} as const;

/** Runtime entity id of the (single) player. Enemies allocate from 2 upward. */
export const PLAYER_ENTITY_ID = 1;
