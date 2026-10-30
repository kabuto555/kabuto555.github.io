import { events as globalEvents, type EventBus } from '../core/events';
import { input as globalInput, type Input } from '../core/input';
import '../ui/events';
import type { System } from '../core/types';
import type { Vec3Like } from '../core/types';
import { Layer, type CollisionWorld } from '../physics/types';
import { PLAYER_TUNING } from '../player/tuning';

/** Anything the player can press E on (pickups, chests, doors; later bonfires, merchants). */
export interface Interactable {
  /** World-space aim point. */
  readonly pos: Vec3Like;
  /** Max distance from the eye (m). */
  readonly range: number;
  /** Cheap "currently interactable?" check; when present the picker uses it instead of building the prompt. */
  enabled?(): boolean;
  /** Prompt text after "[E] ", or null when currently not interactable. */
  prompt(): string | null;
  interact(): void;
}

export interface InteractPlayer {
  readonly position: Vec3Like;
  readonly state: { readonly yaw: number; readonly pitch: number };
}

export interface InteractOptions {
  player: InteractPlayer;
  world?: CollisionWorld;
  input?: Input;
  /** Where to mount the DOM prompt (#ui). Omit when the M6 HUD draws the prompt (it consumes `promptChanged`). */
  ui?: HTMLElement;
  events?: EventBus;
  /** While true the E press is ignored (UI menus hold the mouse). */
  isBlocked?: () => boolean;
}

/** Minimum cos(angle) between view dir and the target to count as "looking at" it (~35 deg). */
const LOOK_COS = 0.82;
/** Horizontal-only cone: lets low items (floor pickups in doorways) be picked without staring at the ground. */
const FLAT_COS = 0.88;
/** Max angle between the view pitch and the elevation to the item for the horizontal cone (cos). */
const ELEV_COS = 0.34; // ~70 deg
/** Inside this distance the view-cone test is skipped (item at your feet). */
const NEAR = 0.9;

/**
 * Picks the best interactable (in range, roughly in view, not behind a wall), shows the "[E] ..."
 * context prompt, and fires `interact()` on the `interact` action. Register after the player.
 */
export class InteractSystem implements System {
  readonly name = 'interact';
  current: Interactable | null = null;
  private readonly items = new Set<Interactable>();
  private readonly player: InteractPlayer;
  private readonly world: CollisionWorld | null;
  private readonly input: Input;
  private readonly el: HTMLElement | null = null;
  private shownFor: Interactable | null = null;
  private shownText = '';
  private sentText = '';
  private readonly bus: EventBus;
  private readonly isBlocked: () => boolean;

  constructor(o: InteractOptions) {
    this.player = o.player;
    this.bus = o.events ?? globalEvents;
    this.isBlocked = o.isBlocked ?? (() => false);
    this.world = o.world ?? null;
    this.input = o.input ?? globalInput;
    if (o.ui) {
      this.el = document.createElement('div');
      this.el.style.cssText =
        'position:absolute;left:50%;top:62%;transform:translateX(-50%);font:14px monospace;color:#fff;text-shadow:1px 1px 0 #000;display:none;white-space:nowrap';
      o.ui.appendChild(this.el);
    }
  }

  register(i: Interactable): () => void {
    this.items.add(i);
    return () => {
      this.items.delete(i);
      if (this.current === i) this.current = null;
    };
  }

  update(): void {
    this.current = this.pick();
    if (this.current && this.input.pressed('interact') && !this.isBlocked()) this.current.interact();
  }

  render(): void {
    const cur = this.current;
    const txt = cur?.prompt() ?? '';
    if (txt !== this.sentText) {
      this.sentText = txt;
      this.bus.emit('promptChanged', { text: txt || null });
    }
    if (!this.el) return;
    if (cur === this.shownFor && txt === this.shownText) return;
    this.shownFor = cur;
    this.shownText = txt;
    this.el.textContent = txt ? `[E] ${txt}` : '';
    this.el.style.display = txt ? 'block' : 'none';
  }

  private pick(): Interactable | null {
    const p = this.player.position;
    const ex = p.x;
    const ey = p.y + PLAYER_TUNING.eyeHeight;
    const ez = p.z;
    const { yaw, pitch } = this.player.state;
    const cp = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cp;
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * cp;
    // Horizontal forward (for the low-item tolerance).
    const fh = Math.hypot(fx, fz);
    const fhx = fh > 1e-4 ? fx / fh : 0;
    const fhz = fh > 1e-4 ? fz / fh : 0;
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items) {
      const dx = it.pos.x - ex;
      const dy = it.pos.y - ey;
      const dz = it.pos.z - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > it.range) continue;
      if (it.enabled ? !it.enabled() : it.prompt() === null) continue;
      let dot = dist < 1e-4 ? 1 : (dx * fx + dy * fy + dz * fz) / dist;
      if (dist > NEAR && dot < LOOK_COS) {
        // Tolerant fallback: aimed at the item horizontally, with a generous vertical angle.
        const hd = Math.hypot(dx, dz);
        const flat = hd > 1e-4 ? (dx * fhx + dz * fhz) / hd : 1;
        if (flat < FLAT_COS) continue;
        // cos of the angle between the view pitch and the elevation to the item.
        const elev = Math.atan2(dy, hd);
        if (Math.cos(elev - pitch) < ELEV_COS) continue;
        dot = Math.max(dot, flat * 0.85);
      }
      const score = dot * 2 - dist * 0.1;
      if (score <= bestScore) continue;
      if (this.world && dist > NEAR && this.blocked(ex, ey, ez, dx / dist, dy / dist, dz / dist, dist)) continue;
      best = it;
      bestScore = score;
    }
    return best;
  }

  private blocked(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dist: number): boolean {
    const hit = this.world!.raycast({ origin: { x: ox, y: oy, z: oz }, dir: { x: dx, y: dy, z: dz }, maxDist: dist }, Layer.World | Layer.Barrier);
    return !!hit && hit.distance < dist - 0.3;
  }

  dispose(): void {
    this.el?.remove();
  }
}
