/**
 * CampNpc — a named, stationary camp character (a counselor at their post):
 * idles on the spot, turns to face the player when they're close, has a gold
 * nameplate, and can say free-text lines in the world speech bubbles.
 *
 * Greeting is edge-triggered: `greetLine` is said once when the player walks
 * within `greetRadius`, and re-arms after they leave `rearmRadius`.
 */
import { params } from './debug-panel';
import { createCharacter, loadSpeciesGltf, type PlayerResult } from './player';
import { SPECIES, type SpeciesId } from './bots/appearance';
import { Nameplates } from './bots/nameplates';
import { ChatLoadout } from './chat/loadout';
import type { ChatService } from './chat/chat-service';

type Vector3 = import('three').Vector3;
type Camera = import('three').Camera;

export interface CampNpcOptions {
  id: string;
  name: string;
  tag?: string;
  species: SpeciesId;
  /** Size relative to a camper. */
  scale?: number;
  /** Ground position (world) and the way they face when nobody's around. */
  position: Vector3;
  facing: number;
  greetLine?: string;
  greetRadius?: number;
  rearmRadius?: number;
  /** Turn to face the player inside this distance. */
  lookRadius?: number;
}

export class CampNpc {
  private character: PlayerResult | null = null;
  private readonly plates: Nameplates;
  private readonly anchor = new THREE.Vector3();
  private yaw: number;
  private greeted = false;
  private readonly actorId: string;

  private constructor(private readonly opts: CampNpcOptions, container: HTMLElement, private readonly chat: ChatService) {
    this.yaw = opts.facing;
    this.actorId = `npc:${opts.id}`;
    this.plates = new Nameplates(container);
    this.plates.add(opts.name, opts.tag ?? null, '#ffd23f');
    chat.register({
      actor: { id: this.actorId, name: opts.name },
      loadout: new ChatLoadout([]),
      anchor: (out) => this.headPosition(out),
    });
  }

  static async create(scene: import('three').Scene, container: HTMLElement, chat: ChatService,
                      opts: CampNpcOptions): Promise<CampNpc> {
    const npc = new CampNpc(opts, container, chat);
    npc.character = createCharacter(await loadSpeciesGltf(SPECIES[opts.species]));
    npc.character.root.name = `npc_${opts.id}`;
    scene.add(npc.character.root);
    return npc;
  }

  /** Say any line in a speech bubble over their head. */
  say(text: string): void {
    this.chat.emote(this.actorId, text);
  }

  update(dt: number, camera: Camera, player: Vector3 | null, busy = false): void {
    const c = this.character;
    if (!c) return;
    const o = this.opts;
    const sp = SPECIES[o.species];
    const s = params.frogScale * sp.scale * (o.scale ?? 1);
    c.root.scale.setScalar(s);
    c.root.position.set(o.position.x, o.position.y + params.footOffset + sp.footOffset * (o.scale ?? 1), o.position.z);

    const d = player ? Math.hypot(player.x - o.position.x, player.z - o.position.z) : Infinity;
    let want = o.facing;
    if (player && d < (o.lookRadius ?? 12)) want = Math.atan2(player.x - o.position.x, player.z - o.position.z);
    let dy = want - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * (1 - Math.exp(-4 * dt));
    c.root.rotation.y = this.yaw;
    c.update(dt, 'idle');

    if (o.greetLine && !busy) {
      if (!this.greeted && d < (o.greetRadius ?? 7)) { this.greeted = true; this.say(o.greetLine); }
      else if (this.greeted && d > (o.rearmRadius ?? 11)) this.greeted = false;
    }

    this.plates.visible = params.showNameplates;
    this.plates.update(camera, [this.headPosition(this.anchor)]);
  }

  private headPosition(out: Vector3): Vector3 {
    const c = this.character;
    if (!c) return out.copy(this.opts.position);
    return out.copy(c.root.position).setY(c.root.position.y + c.top() * c.root.scale.y + 0.35);
  }
}
