import type { AiStateId, FsmState } from './types';

/**
 * Generic finite state machine (§10). States are plain objects with enter/update/exit; `update`
 * returns the next state id to transition. Reused by every enemy archetype and the Taurus boss.
 *
 * - One transition per tick: the new state's `update` first runs next tick (stateTime = 0 on enter).
 * - `go()` forces a transition from outside (hit reactions, death) — it runs exit/enter immediately.
 * - `ctx.stateTime` is owned by the FSM.
 */
export class Fsm<C extends { stateTime: number }, S extends string = AiStateId> {
  private readonly states = new Map<S, FsmState<C, S>>();
  private _current: S;
  private _prev: S | null = null;
  private started = false;
  /** Transition counter (debug / tests). */
  transitions = 0;
  /** Optional observer (debug overlay, tests). */
  onChange: ((from: S, to: S) => void) | null = null;

  constructor(states: Iterable<FsmState<C, S>>, initial: S) {
    for (const s of states) this.states.set(s.id, s);
    if (!this.states.has(initial)) throw new Error(`[fsm] initial state "${initial}" not registered`);
    this._current = initial;
  }

  get current(): S {
    return this._current;
  }
  get prev(): S | null {
    return this._prev;
  }

  has(id: S): boolean {
    return this.states.has(id);
  }

  /** Enter the initial state (idempotent). */
  start(ctx: C): void {
    if (this.started) return;
    this.started = true;
    ctx.stateTime = 0;
    this.states.get(this._current)!.enter?.(ctx, null);
  }

  /** Force a transition. Re-entering the current state restarts it (e.g. stagger on stagger). */
  go(ctx: C, to: S): void {
    const next = this.states.get(to);
    if (!next) throw new Error(`[fsm] unknown state "${to}"`);
    if (!this.started) this.start(ctx);
    const from = this._current;
    this.states.get(from)!.exit?.(ctx, to);
    this._prev = from;
    this._current = to;
    ctx.stateTime = 0;
    this.transitions++;
    next.enter?.(ctx, from);
    this.onChange?.(from, to);
  }

  update(ctx: C, dt: number): void {
    if (!this.started) this.start(ctx);
    ctx.stateTime += dt;
    const next = this.states.get(this._current)!.update(ctx, dt);
    if (next !== undefined && next !== this._current) this.go(ctx, next);
  }
}

/** Countdown helper for state-local timers (no allocation; reuse one per purpose). */
export class Timer {
  remaining = 0;
  set(seconds: number): void {
    this.remaining = seconds;
  }
  /** Tick; returns true on the tick it expires. */
  tick(dt: number): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    return this.remaining <= 0;
  }
  get done(): boolean {
    return this.remaining <= 0;
  }
}
