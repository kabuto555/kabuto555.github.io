/**
 * Game events — a tiny typed pub/sub bus for things that happen in the world.
 *
 * Gameplay systems (minigames, chat) emit; anything that wants to react
 * (bots, audio, UI) subscribes. Every event carries a world position so
 * listeners can decide whether it happened near them.
 */

type Vector3 = import('three').Vector3;

/** Who did something: `player` for the local player, `bot:<id>` for bots. */
export interface Actor {
  id: string;
  name: string;
}

export type GameEvent =
  /** Jumped in free roam (the player, or a bot hopping around camp) — fires a lot. */
  | { type: 'jump'; actor: Actor; pos: Vector3 }
  | { type: 'course_start'; actor: Actor; pos: Vector3 }
  /** Crossed a progress milestone (0..1 of the way up the course). */
  | { type: 'course_progress'; actor: Actor; pos: Vector3; progress: number }
  /** Landed a hop on a node (log or bridge) — fires a lot. */
  | { type: 'course_hop'; actor: Actor; pos: Vector3 }
  /** Launched off a spring pad — a big play. */
  | { type: 'course_spring'; actor: Actor; pos: Vector3 }
  /** `splashes` = falls before this one this attempt (2+ means they're struggling). */
  | { type: 'course_splash'; actor: Actor; pos: Vector3; bumpedBy: Actor | null; splashes: number }
  /** `actor` hopped onto `target`'s node and shoved it. */
  | { type: 'course_bump'; actor: Actor; target: Actor; pos: Vector3; result: 'node' | 'water' | 'bank' }
  | { type: 'course_bumped_out'; actor: Actor; pos: Vector3; by: Actor | null }
  | { type: 'course_win'; actor: Actor; pos: Vector3; splashes: number }
  /** The attempt ended without winning (bumped out onto the bank). */
  | { type: 'course_lose'; actor: Actor; pos: Vector3 }
  | { type: 'course_quit'; actor: Actor; pos: Vector3 }
  /** Sumo: `actor` slammed into `target` hard (`force` ≈ impact speed, u/s). */
  | { type: 'sumo_hit'; actor: Actor; target: Actor; pos: Vector3; force: number }
  /** Sumo: knocked out of the ring (`by` = whoever hit them last, if recent). */
  | { type: 'sumo_out'; actor: Actor; pos: Vector3; by: Actor | null }
  /** Sumo: `actor` touched a power-up (a bomb blows up right there). */
  | { type: 'sumo_item'; actor: Actor; pos: Vector3; item: 'bomb' | 'pepper' }
  /** Sumo: last chonk standing. */
  | { type: 'sumo_win'; actor: Actor; pos: Vector3 }
  | { type: 'chat'; actor: Actor; pos: Vector3; messageId: string }
  /** Played a toy (the HUD toy button, or a bot showing off); `itemId` null = no toy, just a "Hey!". */
  | { type: 'toy'; actor: Actor; pos: Vector3; itemId: string | null };

export type GameEventType = GameEvent['type'];
type Handler<T extends GameEventType> = (e: Extract<GameEvent, { type: T }>) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<(e: GameEvent) => void>>();
  private readonly any = new Set<(e: GameEvent) => void>();

  on<T extends GameEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = handler as (e: GameEvent) => void;
    set.add(h);
    return () => set!.delete(h);
  }

  /** Subscribe to every event; returns an unsubscribe function. */
  onAny(handler: (e: GameEvent) => void): () => void {
    this.any.add(handler);
    return () => this.any.delete(handler);
  }

  emit(e: GameEvent): void {
    // Positions are snapshotted so listeners can hold on to them.
    const ev = { ...e, pos: e.pos.clone() } as GameEvent;
    this.handlers.get(ev.type)?.forEach((h) => h(ev));
    this.any.forEach((h) => h(ev));
  }
}

/** The shared game-wide bus. */
export const gameEvents = new EventBus();

export const PLAYER_ACTOR: Actor = { id: 'player', name: 'You' };
