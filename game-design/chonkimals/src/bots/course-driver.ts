/**
 * CourseDriver — plays the river log course for a bot, the way a human
 * would: pauses at the start line, reacts with a skill-based delay, shuffles
 * lanes when stuck or when its log is about to sink, and sometimes misjudges
 * a hop into the water. Only issues the same commands the player can.
 * Aggressive bots happily hop onto occupied nodes to bump other frogs out.
 */
import type { LogCourse, Runner } from '../log-course';
import type { Rng } from '../rng';

export type CourseOutcome = 'running' | 'won' | 'bumped_out' | 'gave_up';

const READY_UP   = [0.6, 2.2] as const; // pause at the start line before the first hop
const RETRY_WAIT = [1.0, 2.5] as const; // pause after falling in and respawning
const MAX_RUN_TIME = 90;                // safety net: give up on a run this long
const SHOVE_RATE = 0.35;                // sideways griefs per second at full aggression
const MAX_BUMP_WAIT = 3;                // polite bots wait this long for a node to clear

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CourseDriver {
  private think: number;
  private stuck = 0;
  private blockedFor = 0;
  private seenSplashes = 0;
  private elapsed = 0;

  constructor(
    private readonly course: LogCourse,
    readonly runner: Runner,
    private readonly rng: Rng,
    private readonly skill: number,
    /** 0 = polite (waits for occupied nodes to clear), 1 = griefer. */
    private readonly aggression: number,
  ) {
    this.think = rng.range(...READY_UP);
  }

  update(dt: number): CourseOutcome {
    const r = this.runner;
    if (r.finished) return r.outcome === 'out' ? 'bumped_out' : r.outcome === 'quit' ? 'gave_up' : 'won';
    this.elapsed += dt;
    if (r.splashes !== this.seenSplashes) {
      // Out of attempts, the course swims the runner out and finishes it as 'quit'.
      this.seenSplashes = r.splashes;
      this.think = this.rng.range(...RETRY_WAIT);
      this.stuck = 0;
    }
    if (this.elapsed > MAX_RUN_TIME && r.mode === 'idle') return 'gave_up';
    if (r.mode !== 'idle' || r.pending) return 'running';

    this.think -= dt;
    if (this.think > 0) return 'running';
    const interval = lerp(0.55, 0.12, this.skill) * this.rng.range(0.7, 1.3);
    this.think = interval;

    const fwd = this.course.probe(r, 'fwd');
    const probes = { left: this.course.probe(r, 'left'), right: this.course.probe(r, 'right') };

    // Griefing: go out of the way to shove a neighbour sideways.
    const shoves = (['left', 'right'] as const).filter((c) => probes[c] === 'occupied');
    if (shoves.length > 0 && this.rng.chance(this.aggression * this.aggression * SHOVE_RATE * interval)) {
      return this.go('running', this.rng.pick(shoves));
    }
    // Blocked ahead: wait for the frog to move on, or lose patience and bump it.
    this.blockedFor = fwd === 'occupied' ? this.blockedFor + interval : 0;
    if (fwd === 'ok' || (fwd === 'occupied' && this.blockedFor > (1 - this.aggression) * MAX_BUMP_WAIT)) {
      return this.go('running', 'fwd');
    }

    this.stuck += interval;
    // Skilled players notice a sinking log sooner.
    const danger = this.course.inDanger(r, lerp(0.8, 2.2, this.skill));
    const patience = lerp(1.8, 0.5, this.skill);
    const sides = (['left', 'right'] as const).filter((c) => probes[c] === 'ok');
    if (sides.length > 0 && (danger || fwd === 'occupied' || this.stuck > patience)) {
      return this.go('running', this.rng.pick(sides));
    }

    // Nothing safe to land on: panic or misjudge and jump anyway (rate per second).
    const mistakeRate = danger ? lerp(0.5, 0.05, this.skill) : lerp(0.05, 0, this.skill);
    if (r.at.kind === 'log' && this.rng.chance(mistakeRate * interval)) this.course.command(r, 'fwd');
    return 'running';
  }

  private go(outcome: CourseOutcome, cmd: 'fwd' | 'left' | 'right'): CourseOutcome {
    this.course.command(this.runner, cmd);
    this.stuck = 0;
    this.blockedFor = 0;
    return outcome;
  }
}
