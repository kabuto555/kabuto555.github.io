/** Fixed simulation step: 60 Hz. All gameplay tuning assumes this dt. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Simulation clock. Advanced only by the GameLoop (one call to `step` per sim tick).
 * Gameplay code reads `time.now` / `time.tick`; never use performance.now() for gameplay.
 */
export class SimTime {
  /** Sim ticks elapsed since start. */
  tick = 0;
  /** Sim seconds elapsed (tick * SIM_DT). */
  now = 0;
  /** Interpolation alpha for the current render frame (set by the loop). */
  alpha = 0;
  /** Real seconds of the last rendered frame (unclamped, for fps readout / UI anims). */
  frameDt = 0;

  step(): void {
    this.tick++;
    this.now = this.tick * SIM_DT;
  }

  /** Seconds since a past sim time. */
  since(t: number): number {
    return this.now - t;
  }

  reset(): void {
    this.tick = 0;
    this.now = 0;
    this.alpha = 0;
    this.frameDt = 0;
  }
}

/** Global sim clock singleton. */
export const time = new SimTime();
