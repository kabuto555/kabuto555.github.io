import * as THREE from 'three';
import { events } from '../core/events';
import { InstanceBatch } from '../render/batch';
import { makePs1Material } from '../render/materials';
import { BLOB_LIFT } from '../render/shadow';
import type { Interactable, InteractSystem } from './interact';
import { coloredBoxes, type ColoredBox } from './props';

declare module '../core/events' {
  interface EventMap {
    /** Player talked to a static NPC; the UI renders `line`. */
    npcTalk: { npcId: string; line: string; name?: string };
    /** Player opened an NPC shop; the UI renders it. */
    shopOpen: { shopId: string };
    /** Player reached an area exit trigger. */
    areaExit: { to: string };
  }
}

export interface NpcSpec {
  id: string;
  name: string;
  model: 'crestfallen' | 'petrus' | 'merchant';
  pos: readonly [number, number, number];
  yaw: number;
  /** Flavor lines, cycled on E. */
  lines?: readonly string[];
  /** When set, E emits `shopOpen { shopId }` instead of `npcTalk`. */
  shopId?: string;
}

const STEEL = 0x5a6470;
const STEEL_D = 0x3c444e;
const CLOTH = 0x3a4a6a;
const SKIN = 0xb09478;
const ROBE = 0xd8d2c0;
const ROBE_D = 0xa89e88;
const GOLD = 0xb89a40;

/** Crestfallen Warrior: slumped sitting knight, blue-grey plate, head bowed. Origin at the ground, facing -Z. */
function crestfallenGeometry(): THREE.BufferGeometry {
  const parts: ColoredBox[] = [
    [0.5, 0.12, 0.5, 0, 0.06, 0, STEEL_D], // seat stone
    [0.42, 0.22, 0.3, 0, 0.23, 0.05, CLOTH], // hips
    [0.16, 0.16, 0.5, -0.12, 0.34, -0.25, STEEL], // thighs
    [0.16, 0.16, 0.5, 0.12, 0.34, -0.25, STEEL],
    [0.14, 0.4, 0.14, -0.12, 0.2, -0.5, STEEL_D], // shins
    [0.14, 0.4, 0.14, 0.12, 0.2, -0.5, STEEL_D],
    [0.46, 0.5, 0.28, 0, 0.62, 0.08, STEEL], // torso
    [0.54, 0.12, 0.34, 0, 0.88, 0.08, STEEL_D], // pauldron bar
    [0.12, 0.34, 0.12, -0.3, 0.64, -0.04, STEEL, 0, 0.1], // arms resting on knees
    [0.12, 0.34, 0.12, 0.3, 0.64, -0.04, STEEL, 0, -0.1],
    [0.22, 0.22, 0.24, 0, 0.98, -0.06, STEEL_D], // helmet (bowed)
    [0.1, 0.05, 0.12, 0, 0.97, -0.2, SKIN], // face slit
    [0.5, 0.5, 0.05, 0, 0.55, 0.28, CLOTH], // tabard drape
  ];
  return coloredBoxes(parts);
}

/** Petrus: standing cleric in a cream robe with a gold-trimmed hood and a mace on the belt. */
function petrusGeometry(): THREE.BufferGeometry {
  const parts: ColoredBox[] = [
    [0.5, 0.9, 0.34, 0, 0.45, 0, ROBE], // robe skirt
    [0.54, 0.06, 0.38, 0, 0.04, 0, ROBE_D],
    [0.44, 0.5, 0.26, 0, 1.15, 0, ROBE], // torso
    [0.46, 0.06, 0.28, 0, 0.92, 0, GOLD], // sash
    [0.58, 0.14, 0.3, 0, 1.4, 0, ROBE_D], // shoulders
    [0.12, 0.5, 0.12, -0.33, 1.15, -0.04, ROBE_D, 0, 0.12], // arms
    [0.12, 0.5, 0.12, 0.33, 1.15, -0.04, ROBE_D, 0, -0.12],
    [0.1, 0.1, 0.1, -0.38, 0.88, -0.07, SKIN], // hands
    [0.1, 0.1, 0.1, 0.38, 0.88, -0.07, SKIN],
    [0.3, 0.3, 0.3, 0, 1.64, 0, ROBE], // hood
    [0.2, 0.2, 0.06, 0, 1.62, -0.14, SKIN], // face
    [0.34, 0.06, 0.34, 0, 1.8, 0, GOLD], // hood trim
    [0.06, 0.5, 0.06, 0.44, 0.66, -0.1, 0x4a3020], // mace haft
    [0.14, 0.14, 0.14, 0.44, 0.96, -0.1, 0x8a8a90], // mace head
  ];
  return coloredBoxes(parts);
}

const MCLOTH = 0x4a4038;
const MCLOTH_D = 0x2c2620;
const MMASK = 0xc8b898;

/** Undead Merchant: hooded, masked, hunched under a towering pack of wares (crates, rifle barrel, lantern). Faces -Z. */
function merchantGeometry(): THREE.BufferGeometry {
  const parts: ColoredBox[] = [
    [0.5, 0.8, 0.34, 0, 0.4, 0, MCLOTH_D], // legs / robe
    [0.46, 0.5, 0.3, 0, 1.0, 0.04, MCLOTH], // torso (hunched forward)
    [0.6, 0.14, 0.34, 0, 1.28, 0.06, MCLOTH_D], // shoulders
    [0.12, 0.46, 0.12, -0.34, 1.0, -0.06, MCLOTH, 0, 0.1],
    [0.12, 0.46, 0.12, 0.34, 1.0, -0.06, MCLOTH, 0, -0.1],
    [0.3, 0.3, 0.3, 0, 1.52, -0.04, MCLOTH_D], // hood
    [0.2, 0.22, 0.06, 0, 1.5, -0.2, MMASK], // mask
    [0.5, 0.9, 0.34, 0, 1.2, 0.36, 0x6a5238], // pack
    [0.4, 0.4, 0.3, 0.05, 1.9, 0.38, 0x7a6244], // upper crate
    [0.08, 0.7, 0.08, -0.2, 2.0, 0.42, 0x303438], // rifle barrel
    [0.12, 0.16, 0.12, 0.3, 0.75, 0.6, 0xe8c050], // lantern
  ];
  return coloredBoxes(parts);
}

interface NpcRec {
  spec: NpcSpec;
  group: THREE.Group;
  unregister: () => void;
  line: number;
}

/** Static NPCs (E to talk / shop). One mesh + blob shadow each. */
export class NpcSystem {
  readonly npcs = new Map<string, NpcRec>();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mat = makePs1Material({ vertexColors: true });
  private readonly shadowMat = makePs1Material({ lit: false, color: 0x000000, transparent: true, opacity: 0.45 });
  private readonly shadowGeo = new THREE.CircleGeometry(0.5, 10);
  /** All NPC ground blobs: one InstancedMesh (render/batch). */
  private readonly shadowBatch = new InstanceBatch(this.shadowGeo, this.shadowMat, 'npcShadow', 1, 8);

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly interact: InteractSystem,
  ) {}

  add(spec: NpcSpec): void {
    const geo = spec.model === 'petrus' ? petrusGeometry() : spec.model === 'merchant' ? merchantGeometry() : crestfallenGeometry();
    this.geos.push(geo);
    const group = new THREE.Group();
    group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    group.rotation.y = spec.yaw;
    group.name = `npc:${spec.id}`;
    const sh = this.shadowBatch.proxy();
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = BLOB_LIFT;
    group.add(new THREE.Mesh(geo, this.mat), sh);
    this.parent.add(group);
    const rec: NpcRec = { spec, group, unregister: () => {}, line: 0 };
    const it: Interactable = {
      pos: { x: spec.pos[0], y: spec.pos[1] + 1.0, z: spec.pos[2] },
      range: 3.2,
      prompt: () => (spec.shopId ? `Trade with ${spec.name}` : `Talk to ${spec.name}`),
      interact: () => {
        if (spec.shopId) {
          events.emit('shopOpen', { shopId: spec.shopId });
          return;
        }
        const lines = spec.lines ?? ['...'];
        events.emit('npcTalk', { npcId: spec.id, line: lines[rec.line++ % lines.length]! });
      },
    };
    rec.unregister = this.interact.register(it);
    this.npcs.set(spec.id, rec);
  }

  dispose(): void {
    for (const n of this.npcs.values()) {
      n.unregister();
      n.group.removeFromParent();
    }
    this.npcs.clear();
    for (const g of this.geos) g.dispose();
    this.shadowBatch.dispose();
    this.mat.dispose();
    this.shadowMat.dispose();
    this.shadowGeo.dispose();
  }
}
