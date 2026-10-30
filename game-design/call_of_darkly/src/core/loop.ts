import type { System } from './types';
import { SIM_DT, time as globalTime, type SimTime } from './time';

export interface GameLoopOptions {
  /** Max sim ticks per frame before dropping the backlog (spiral-of-death clamp). Default 5. */
  maxSubSteps?: number;
  /** Max real frame time accepted, seconds (tab-switch hitch clamp). Default 0.25. */
  maxFrameDt?: number;
  /** Clock to advance. Default: the global `time`. */
  clock?: SimTime;
}

/**
 * Fixed-60Hz sim / uncapped render loop (accumulator pattern).
 * `advance(frameDt)` is the testable core; `start()` drives it from requestAnimationFrame.
 */
export class GameLoop {
  private readonly systems: System[] = [];
  private accumulator = 0;
  private rafId = 0;
  private lastMs = -1;
  private readonly maxSubSteps: number;
  private readonly maxFrameDt: number;
  readonly clock: SimTime;
  /** Sim speed multiplier (1 = normal). Render keeps running at real speed. */
  timeScale = 1;
  private hitstopLeft = 0;

  constructor(opts: GameLoopOptions = {}) {
    this.maxSubSteps = opts.maxSubSteps ?? 5;
    this.maxFrameDt = opts.maxFrameDt ?? 0.25;
    this.clock = opts.clock ?? globalTime;
  }

  add(system: System): this {
    this.systems.push(system);
    return this;
  }

  remove(system: System): void {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  /** Freeze the sim for `seconds` of REAL time (render keeps running). Overlapping calls take the longer. */
  hitstop(seconds: number): void {
    if (seconds > this.hitstopLeft) this.hitstopLeft = seconds;
  }

  /** Real seconds of freeze remaining. */
  get hitstopRemaining(): number {
    return this.hitstopLeft;
  }

  /** Run sim ticks for `frameDt` real seconds, then one render pass. Returns ticks run. */
  advance(frameDt: number): number {
    const dt = Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    let simDt = dt;
    if (this.hitstopLeft > 0) {
      const used = Math.min(this.hitstopLeft, dt);
      this.hitstopLeft -= used;
      simDt = dt - used;
    }
    this.accumulator += simDt * this.timeScale;
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < this.maxSubSteps) {
      for (const s of this.systems) s.update(SIM_DT);
      this.clock.step();
      this.accumulator -= SIM_DT;
      steps++;
    }
    // Still behind after max substeps: drop the backlog rather than spiral.
    if (this.accumulator >= SIM_DT) this.accumulator %= SIM_DT;
    const alpha = this.accumulator / SIM_DT;
    this.clock.alpha = alpha;
    this.clock.frameDt = dt;
    for (const s of this.systems) s.render?.(alpha, dt);
    return steps;
  }

  start(): void {
    if (this.rafId) return;
    this.lastMs = -1; // seeded from the first rAF timestamp (same clock as `ms`)
    const frame = (ms: number) => {
      this.rafId = requestAnimationFrame(frame);
      if (this.lastMs < 0) this.lastMs = ms;
      const frameDt = Math.min(Math.max((ms - this.lastMs) / 1000, 0), this.maxFrameDt);
      this.lastMs = ms;
      this.advance(frameDt);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
