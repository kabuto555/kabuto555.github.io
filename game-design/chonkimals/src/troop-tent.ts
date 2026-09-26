// Troop HQ — the west campsite tent (`prop_tent_1`) is the hub for the Scout Troop
// screen. `relocateTroopTent()` moves it off the main dirt spine onto the grass west
// of the path (run right after the world loads, before bots cache ground heights —
// every world mesh is a ground-raycast surface). `TroopTent.create()` then turns it
// scout red, posts Scoutmaster Tubbs at the door, and plants a felt camp pennant with
// the player's troop name. Walking up floats a "Scout Troop" button (a gate in main.ts).

import { CampNpc } from './npc';
import { COUNSELOR } from './bots/appearance';
import type { ChatService } from './chat/chat-service';
import { hashString } from './rng';
import { playerTroop, subscribeTroop } from './troops';
import { gearColors, troopStyle } from './troop-style';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Camera = import('three').Camera;
type Scene = import('three').Scene;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;

export const TROOP_TENT = {
  mesh: 'prop_tent_1',
  chunk: 'chunk_0_camp',
  campfire: 'prop_fire_flame',
  /** New spot, camp-local (build_camp.py coords): the grass west of the spine, between the
   * lake and hub paths. `yaw` turns the tent so its door faces the path and the campfire. */
  moveTo: { x: -12, z: 40, yaw: Math.PI / 2 },
  /** Linear RGB — the camp palette's unused `clay_tent_red`, softened to the cozy grade. */
  tentColor: [0.86, 0.36, 0.3] as const,
  poleColor: 0x8a5a3a,
  knobColor: 0xffc93f,
  /** Button shows within this distance of the tent's footprint. */
  reach: 2.4,
  /** How far in front of the entrance the Scoutmaster stands. */
  npcOut: 1.9,
  /** …and the button also shows within reach + this of the Scoutmaster. */
  npcReach: 1.2,
  /** Felt pennant size (world units) and pole height. */
  pennant: { length: 3.6, height: 1.75, pole: 4.9 },
};

/** Felt colours a troop's pennant can be (picked by troop id). */
const FELT = ['#d9483f', '#3a6fa8', '#4b9a5c', '#e3a634', '#8158a8', '#e2733f', '#2f9c95'];
const FELT_HQ = '#3a6fa8';

/** Moves the Troop HQ tent off the main path. Returns false if the camp has no such tent. */
export function relocateTroopTent(stageRoot: Object3D): boolean {
  const tent = stageRoot.getObjectByName(TROOP_TENT.mesh) as Mesh | undefined;
  const chunk = stageRoot.getObjectByName(TROOP_TENT.chunk);
  const parent = tent?.parent;
  if (!tent || !chunk || !parent) return false;
  stageRoot.updateWorldMatrix(true, true);
  // The tent's vertices are baked in place, so turn it about its own footprint centre.
  tent.geometry.computeBoundingBox();
  const g = tent.geometry.boundingBox!.getCenter(new THREE.Vector3()).setY(0);
  const { x, z, yaw } = TROOP_TENT.moveTo;
  const target = parent.worldToLocal(chunk.localToWorld(new THREE.Vector3(x, 0, z)));
  tent.rotation.set(0, yaw, 0);
  tent.position.copy(target).sub(g.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)).setY(tent.position.y);
  tent.updateWorldMatrix(false, false);
  return true;
}

export class TroopTent {
  /** Where "go to the troop tent" drops the player (in front of the entrance). */
  readonly gatePoint: Vector3;
  private readonly min: Vector3;
  private readonly max: Vector3;
  private flag: Object3D | null = null;
  private flagYaw = 0;
  private t = 0;
  private pennant: FeltPennant | null = null;
  private tentMat: InstanceType<typeof THREE.MeshStandardMaterial> | null = null;
  private unsubscribe: () => void = () => {};
  private unsubscribeStyle: () => void = () => {};

  private constructor(tent: Object3D, entrance: Vector3, private npcAt: Vector3, private npc: CampNpc | null) {
    const box = new THREE.Box3().setFromObject(tent);
    this.min = box.min; this.max = box.max;
    this.gatePoint = entrance;
  }

  /** Returns null if the camp has no tent to use (the hub is skipped). */
  static async create(scene: Scene, stageRoot: Object3D, container: HTMLElement, chat: ChatService): Promise<TroopTent | null> {
    const tent = stageRoot.getObjectByName(TROOP_TENT.mesh) as Mesh | undefined;
    if (!tent) return null;
    tent.updateWorldMatrix(true, false);

    // Scout red (own material — the sand one is shared with the other tent).
    const mat = (tent.material as InstanceType<typeof THREE.MeshStandardMaterial>).clone();
    mat.name = 'clay_tent_red';
    mat.color.setRGB(...TROOP_TENT.tentColor);
    tent.material = mat;

    // Entrance = the footprint end nearest the campfire (the tent ridge runs along its long axis).
    const box = new THREE.Box3().setFromObject(tent);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Props have their vertices baked in place (origin at 0), so use the fire's bounds, not its position.
    const fireMesh = stageRoot.getObjectByName(TROOP_TENT.campfire);
    const fire = fireMesh ? new THREE.Box3().setFromObject(fireMesh).getCenter(new THREE.Vector3())
      : c.clone().add(new THREE.Vector3(0, 0, -10));
    const alongX = size.x > size.z;
    const sign = alongX ? Math.sign(fire.x - c.x) || 1 : Math.sign(fire.z - c.z) || 1;
    const half = (alongX ? size.x : size.z) / 2;
    const out = new THREE.Vector3(alongX ? sign : 0, 0, alongX ? 0 : sign);
    const door = c.clone().addScaledVector(out, half).setY(box.min.y);
    const npcAt = door.clone().addScaledVector(out, TROOP_TENT.npcOut);

    const npc = await CampNpc.create(scene, container, chat, {
      id: 'scoutmaster', name: 'Scoutmaster Tubbs', tag: '<Troop HQ>',
      species: COUNSELOR.species, scale: COUNSELOR.scale, position: npcAt, facing: Math.atan2(out.x, out.z),
      greetLine: 'Join a scout troop! ⛺', greetRadius: 9, rearmRadius: 14,
    }).catch((e) => { console.warn('[troop] scoutmaster failed:', e); return null; });

    // Drop-in spot: past the Scoutmaster, off to the pennant-free side.
    const side = new THREE.Vector3(out.z, 0, -out.x);
    const hub = new TroopTent(tent, npcAt.clone().addScaledVector(out, 2.2).addScaledVector(side, -1.2), npcAt, npc);
    // Equipped troop gear (Care Packages / the Shop's Troop tab) recolours the tent.
    hub.tentMat = mat;
    const paintTent = () => {
      const gear = troopStyle.equipped('tent');
      if (gear) mat.color.set(gearColors(gear)[0]);
      else mat.color.setRGB(...TROOP_TENT.tentColor);
    };
    paintTent();
    hub.unsubscribeStyle = troopStyle.subscribe(paintTent);
    // Felt pennant in front of the tent beside the door, its face turned to the path.
    const width = (alongX ? size.z : size.x) / 2;
    hub.buildPennant(scene, door.clone().addScaledVector(side, width + 0.5).addScaledVector(out, 1.1), side);
    return hub;
  }

  /** XZ distance from `p` to the hub area: the tent's footprint, or a ring round the Scoutmaster. */
  distance(p: Vector3): number {
    const dx = Math.max(this.min.x - p.x, 0, p.x - this.max.x);
    const dz = Math.max(this.min.z - p.z, 0, p.z - this.max.z);
    const npc = Math.hypot(p.x - this.npcAt.x, p.z - this.npcAt.z) - TROOP_TENT.npcReach;
    return Math.min(Math.hypot(dx, dz), Math.max(0, npc));
  }

  get reach(): number { return TROOP_TENT.reach; }

  update(dt: number, camera: Camera, player: Vector3 | null, busy: boolean): void {
    this.t += dt;
    // A lazy sway (small enough that the name stays readable) plus a little flutter.
    if (this.flag) {
      this.flag.rotation.y = this.flagYaw + Math.sin(this.t * 1.3) * 0.09;
      this.flag.rotation.x = Math.sin(this.t * 2.7) * 0.03;
    }
    this.npc?.update(dt, camera, player, busy);
  }

  say(text: string): void { this.npc?.say(text); }

  dispose(): void { this.unsubscribe(); this.unsubscribeStyle(); }

  private buildPennant(scene: Scene, at: Vector3, side: Vector3): void {
    const P = TROOP_TENT.pennant;
    const group = new THREE.Group();
    group.name = 'troop_pennant';
    const clay = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, P.pole, 10), clay(TROOP_TENT.poleColor));
    pole.position.y = P.pole / 2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), clay(TROOP_TENT.knobColor));
    knob.position.y = P.pole + 0.08;
    const pivot = new THREE.Group();
    pivot.position.y = P.pole - 0.2;
    this.pennant = new FeltPennant(P.length, P.height);
    this.pennant.root.position.x = 0.06;
    pivot.add(this.pennant.root);
    group.add(pole, knob, pivot);
    group.position.copy(at);
    for (const m of [pole, knob]) { m.castShadow = true; m.receiveShadow = true; }
    // The pennant flies along `side` (away from the tent), face to the path.
    this.flagYaw = Math.atan2(-side.z, side.x);
    pivot.rotation.y = this.flagYaw;
    scene.add(group);
    this.flag = pivot;

    const refresh = () => {
      const troop = playerTroop();
      const gear = troopStyle.equipped('pennant');
      const cols = gear ? gearColors(gear) : null;
      // Equipped pennant gear: 2 colours = felt + hoist band, more = striped felt.
      this.pennant?.draw(troop ? troop.name : 'TROOP HQ',
        cols ? (cols.length > 2 ? cols : [cols[0]]) : [troop ? FELT[hashString(troop.id) % FELT.length] : FELT_HQ],
        cols && cols.length === 2 ? cols[1] : undefined);
    };
    refresh();
    this.unsubscribe = subscribeTroop(refresh);
    const unStyle = troopStyle.subscribe(refresh);
    const prev = this.unsubscribeStyle;
    this.unsubscribeStyle = () => { prev(); unStyle(); };
    // Canvas text needs the web font; redraw once it's in.
    void document.fonts?.load("700 120px 'Fredoka'").then(refresh).catch(() => {});
  }
}

/**
 * A felt camp pennant: a long felt triangle with a contrasting hoist band, stitched
 * border and appliqué letters, drawn to a canvas. Front and back faces get their own
 * texture so the name reads the right way round from both sides.
 */
class FeltPennant {
  readonly root = new THREE.Group();
  private readonly front: HTMLCanvasElement;
  private readonly back: HTMLCanvasElement;
  private readonly texFront: InstanceType<typeof THREE.CanvasTexture>;
  private readonly texBack: InstanceType<typeof THREE.CanvasTexture>;

  constructor(length: number, height: number) {
    const W = 1024, H = Math.round(W * height / length);
    this.front = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.back = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const tex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    this.texFront = tex(this.front);
    this.texBack = tex(this.back);
    // Hangs from its top-left corner (the pole end).
    const geo = new THREE.PlaneGeometry(length, height).translate(length / 2, -height / 2, 0);
    const mat = (map: InstanceType<typeof THREE.CanvasTexture>, side: number) =>
      // A touch of self-glow so the felt still reads when the pennant is in its own shadow.
      new THREE.MeshStandardMaterial({ map, side: side as never, roughness: 1, metalness: 0, alphaTest: 0.5,
        emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.22 });
    const f = new THREE.Mesh(geo, mat(this.texFront, THREE.FrontSide));
    const b = new THREE.Mesh(geo, mat(this.texBack, THREE.BackSide));
    for (const m of [f, b]) { m.castShadow = true; m.receiveShadow = true; this.root.add(m); }
  }

  /** `felt` = one colour, or several for a striped pennant; `hoist` = the band by the pole. */
  draw(name: string, felt: string[], hoist?: string): void {
    this.paint(this.front, name, felt, false, hoist);
    this.paint(this.back, name, felt, true, hoist);
    this.texFront.needsUpdate = true;
    this.texBack.needsUpdate = true;
  }

  private paint(c: HTMLCanvasElement, name: string, felt: string[], mirrorText: boolean, hoistColor = '#f3e6cf'): void {
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const hoist = W * 0.085;
    ctx.clearRect(0, 0, W, H);
    // The pennant triangle, pulled in by `inset` px on every edge (for the stitch line).
    const tri = (inset: number) => {
      const slope = (H / 2) / W;               // long edges fall/rise this much per px
      const k = Math.sqrt(1 + slope * slope);  // vertical offset per px of normal inset
      ctx.beginPath();
      ctx.moveTo(inset, inset * slope + inset * k);
      ctx.lineTo(W - inset * k / slope, H / 2);
      ctx.lineTo(inset, H - inset * slope - inset * k);
      ctx.closePath();
    };

    // Felt body + a lighter hoist band.
    ctx.save();
    tri(0);
    ctx.fillStyle = felt[0];
    ctx.fill();
    ctx.clip();
    // Striped felt: equal bands top to bottom.
    felt.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, (H / felt.length) * i, W, H / felt.length + 1); });
    ctx.fillStyle = hoistColor;
    ctx.fillRect(0, 0, hoist, H);
    // Felt grain: lots of tiny soft fibres.
    let seed = hashString(name) || 1;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 3 + rnd() * 7;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // Soft shading toward the edges so it reads as a thick, slightly puffy cloth.
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0.14)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Stitching: a dashed thread just inside the edge, and a seam along the hoist band.
    ctx.save();
    ctx.setLineDash([16, 11]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#fff4de';
    tri(20);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,60,40,0.55)';
    ctx.beginPath();
    ctx.moveTo(hoist + 2, 30);
    ctx.lineTo(hoist + 2, H - 30);
    ctx.stroke();
    ctx.restore();

    // Appliqué letters: chunky, cream, with a dark "cut edge" and a drop shadow, sized to fit
    // inside the narrowing triangle.
    const text = name.toUpperCase();
    const left = hoist + 34;
    let size = H * 0.4;
    const font = () => { ctx.font = `700 ${size}px 'Fredoka', system-ui, sans-serif`; };
    font();
    const fits = () => {
      const w = ctx.measureText(text).width;
      const room = H * (1 - (left + w) / W) - 40; // triangle height where the text ends
      return w < W * 0.86 - left && size * 0.72 < room;
    };
    while (size > 18 && !fits()) { size -= 3; font(); }
    const w = ctx.measureText(text).width;
    ctx.save();
    if (mirrorText) {
      // Seen from behind, the plane is mirrored; flip the lettering back (within its box).
      ctx.translate(left * 2 + w, 0);
      ctx.scale(-1, 1);
    }
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const y = H / 2 + size * 0.04;
    ctx.fillStyle = 'rgba(40,20,10,0.35)';
    ctx.fillText(text, left + 5, y + 7);
    ctx.lineWidth = Math.max(4, size * 0.08);
    ctx.strokeStyle = 'rgba(60,35,20,0.85)';
    ctx.strokeText(text, left, y);
    ctx.fillStyle = '#fff3dc';
    ctx.fillText(text, left, y);
    ctx.restore();
  }
}
