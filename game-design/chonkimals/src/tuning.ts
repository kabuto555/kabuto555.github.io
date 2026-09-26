/**
 * Tuning constants — edit these to adjust game feel.
 * All speeds are world-units per second (terrain is 120 units across).
 */

/** Speed when joystick is at low deflection (below RUN_THRESHOLD). */
export const WALK_SPEED = 4;

/** Speed when joystick is at full deflection (at or above RUN_THRESHOLD). */
export const RUN_SPEED = 10;

/**
 * Joystick magnitude above which the frog switches walk → run.
 * Range 0–1.  0 = always run, 1 = never run.
 */
export const RUN_THRESHOLD = 0.6;

/** How quickly the frog snaps to face the movement direction (exp-decay k). */
export const TURN_SPEED = 14;

/** Initial upward velocity on jump (world-units/s). */
export const JUMP_HEIGHT = 6;

/**
 * Gravity used only during jump arc (world-units/s²).
 * Defined in main.ts as a local constant (JUMP_GRAVITY = 18).
 * Not exported — kept here as a reference comment.
 */
// JUMP_GRAVITY = 18 (local to main.ts)
