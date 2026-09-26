/**
 * ChatService — the only way anyone (player or bot) says a quick-chat line.
 *
 * Enforces "only what's in your loadout" and a per-speaker anti-spam gap,
 * shows the line as a speech bubble over the speaker (visible only to a
 * nearby local player — there's no chat log), and emits a `chat` game event
 * so others can react.
 */
import { gameEvents, type Actor } from '../events';
import type { ChatLoadout } from './loadout';
import { getQuickChat } from './quick-chat';
import { SpeechBubbles } from './speech-bubbles';

type Vector3 = import('three').Vector3;
type Camera = import('three').Camera;

const MIN_GAP = 1.2;       // seconds between lines from one speaker
const HEAR_FULL = 22;      // bubbles fully visible within this distance of the local player
const EMOTES = ['😂', '👍', '❤️', '🎉', '😮', '😎', '🐸', '🔥', '👋', '😭'];
const HEAR_MAX = 30;       // ...and fade out by this distance

export interface ChatSpeaker {
  actor: Actor;
  loadout: ChatLoadout;
  /** Writes the point above the speaker's head (world). */
  anchor(out: Vector3): Vector3;
  /** True while the speaker isn't shown (e.g. the camp crowd hidden during dodge ball): no bubble. */
  hidden?(): boolean;
}

export class ChatService {
  private readonly speakers = new Map<string, ChatSpeaker>();
  private readonly lastSaid = new Map<string, number>();
  private readonly bubbles: SpeechBubbles;
  private readonly tmp = new THREE.Vector3();
  private readonly listener = new THREE.Vector3();
  private clock = 0;
  private readonly shown = new Set<(actor: Actor, text: string, pos: Vector3) => void>();
  /** The local player's actor id; their own bubbles are always visible. */
  localActorId = 'player';

  constructor(container: HTMLElement) {
    this.bubbles = new SpeechBubbles(container);
  }

  /** Hide/show all speech bubbles (e.g. while a minigame takes over the loop). */
  setVisible(v: boolean): void {
    this.bubbles.setVisible(v);
  }

  register(speaker: ChatSpeaker): void {
    this.speakers.set(speaker.actor.id, speaker);
  }

  /** Hear every line / emote as it's shown (e.g. a board game's HUD, where the speakers' heads
   * are out of shot). Returns the unsubscribe. */
  onShow(fn: (actor: Actor, text: string, pos: Vector3) => void): () => void {
    this.shown.add(fn);
    return () => this.shown.delete(fn);
  }

  private tell(speaker: ChatSpeaker, text: string): void {
    if (this.shown.size === 0) return;
    const pos = speaker.anchor(new THREE.Vector3());
    this.shown.forEach((f) => f(speaker.actor, text, pos));
  }

  unregister(actorId: string): void {
    this.speakers.delete(actorId);
  }

  getSpeaker(actorId: string): ChatSpeaker | undefined {
    return this.speakers.get(actorId);
  }

  /** Seconds until this speaker may talk again (0 = now). */
  cooldown(actorId: string): number {
    const last = this.lastSaid.get(actorId);
    return last === undefined ? 0 : Math.max(0, last + MIN_GAP - this.clock);
  }

  /**
   * Says an equipped message. Returns false if the speaker is unknown, the
   * message isn't in their loadout, or they're talking too fast.
   */
  say(actorId: string, messageId: string): boolean {
    const speaker = this.speakers.get(actorId);
    const msg = getQuickChat(messageId);
    if (!speaker || !msg || !speaker.loadout.has(messageId) || this.cooldown(actorId) > 0) return false;
    this.lastSaid.set(actorId, this.clock);
    this.bubbles.show(actorId, msg.text);
    this.tell(speaker, msg.text);
    gameEvents.emit({ type: 'chat', actor: speaker.actor, pos: speaker.anchor(this.tmp), messageId });
    return true;
  }

  /** Emotes a floating reaction over an actor. Unlike chat, emotes are not
   * loadout-gated; a fresh emote just replaces the actor's current bubble. */
  emote(actorId: string, emoji?: string): boolean {
    const speaker = this.speakers.get(actorId);
    if (!speaker) return false;
    const e = emoji ?? EMOTES[Math.floor(Math.random() * EMOTES.length)];
    this.bubbles.show(actorId, e);
    this.tell(speaker, e);
    return true;
  }

  /** Call once per frame after the camera is placed. `listener` = local player position. */
  update(dt: number, camera: Camera, listener: Vector3): void {
    this.clock += dt;
    this.listener.copy(listener);
    this.bubbles.update(
      dt,
      camera,
      (key, out) => {
        const s = this.speakers.get(key);
        if (!s || s.hidden?.()) return false;
        s.anchor(out);
        return true;
      },
      (key) => {
        if (key === this.localActorId) return 1;
        const s = this.speakers.get(key);
        if (!s) return 0;
        const d = s.anchor(this.tmp).distanceTo(this.listener);
        return 1 - Math.max(0, Math.min(1, (d - HEAR_FULL) / (HEAR_MAX - HEAR_FULL)));
      },
    );
  }
}
