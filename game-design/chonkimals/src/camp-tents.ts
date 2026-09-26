// Camp tents — every camper's own tent, pitched in one of three tent sites:
//   🔥 Campfire Circle   three tents round the original campfire (one replaces the old yellow
//                        prop tent, `prop_tent_2`)
//   🏖️ Beach Picnic      three tents round a new campfire on the open sand past the picnic
//   🌲 Trailhead Meadow  three tents on the grass between the climb trail and the Dodge Ball arena
// One tent at your chosen site is yours (always the site's first spot — picked for you), built
// live from your tent loadout (customization/loadout.ts), so it re-dresses the moment you change
// it in Customize. Every other spot belongs to a camper (a bot name from the roster) with a
// procedural tent rolled from the whole catalog. Each carries a "Name's Tent" label.
// You pick your site in the FTUE (setPlayerSite); returning players default to the campfire.
//
// Built at runtime from customization/tent-model.ts as children of the camp chunk (camp-local
// units). Call `CampTents.build()` right after the world loads — before the grass dressing is
// scattered and bots cache ground heights — so the invisible colliders are in place.

import { buildTent, type TentModel } from './customization/tent-model';
import { playerLoadout, rollBotTent, type TentLoadout } from './customization/loadout';
import { botName } from './bots/roster';
import { Nameplates } from './bots/nameplates';
import { seededRng } from './rng';
import { storageGet, storageSet } from './storage';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Camera = import('three').Camera;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export { TENT_SITES, type TentSite, type TentSiteId } from './tent-sites';
import { TENT_SITES, type TentSite, type TentSiteId } from './tent-sites';

export const CAMP_TENTS = {
  chunk: 'chunk_0_camp',
  /** Stage meshes this removes: the yellow prop tent by the fire (build_camp.py prop_tent_2) and
   * the dirt path that led to it (Camp_path_camp) — the Campfire Circle tents stand on that grass. */
  replaces: ['prop_tent_2', 'Camp_path_camp'] as readonly string[],
  /** Tent model units → camp-local (the camp chunk is at WORLD_SCALE 1.35 on top). */
  scale: 1.35,
  /** The "Customize Tent" button shows within this distance (world) of your tent. */
  reach: 2.6,
  /** Roster ids of the campers who own the tents (one per spot, in TENT_SITES order). */
  owners: [4, 9, 13, 18, 22, 27, 31, 36, 40],
  playerColor: '#ffd23f',
  otherColor: '#ffffff',
};

const SITE_KEY = 'chonk.tentSite.v1';

interface Spot {
  site: TentSite;
  index: number;
  owner: string;
  /** Holder in the camp chunk (position + door yaw); the tent model is rebuilt inside it. */
  holder: Group;
  model: TentModel | null;
  collider: Mesh;
  /** Built for the player (vs the owner's rolled tent). */
  mine: boolean | null;
  plate: number;
  top: number;
}

export class CampTents {
  readonly colliders: Mesh[] = [];
  private readonly spots: Spot[] = [];
  private readonly plates: Nameplates;
  private readonly anchors: Vector3[] = [];
  private site: TentSiteId;
  private playerName = 'You';
  private pop = 1;
  private readonly tmp = new THREE.Vector3();

  private constructor(private readonly chunk: Object3D, container: HTMLElement) {
    this.plates = new Nameplates(container);
    const saved = storageGet<TentSiteId | null>(SITE_KEY, null);
    this.site = TENT_SITES.some((s) => s.id === saved) ? saved! : 'campfire';
  }

  /**
   * Builds every site's tents (and hides the old prop tent). `groundAt` is the world ground
   * height under a world XZ point. Null if the camp chunk isn't there.
   */
  static build(stageRoot: Object3D, container: HTMLElement,
               groundAt: (x: number, z: number) => number | null): CampTents | null {
    const chunk = stageRoot.getObjectByName(CAMP_TENTS.chunk);
    if (!chunk) return null;
    for (const name of CAMP_TENTS.replaces) {
      const old = stageRoot.getObjectByName(name);
      old?.parent?.remove(old);
    }
    chunk.updateMatrixWorld(true);
    const t = new CampTents(chunk, container);
    let o = 0;
    for (const site of TENT_SITES) {
      site.spots.forEach((sp, index) => {
        const holder = new THREE.Group();
        holder.name = `camp_tent_${site.id}_${index}`;
        const [x, z] = sp.at;
        const w = new THREE.Vector3(x, 0, z).applyMatrix4(chunk.matrixWorld);
        const gy = groundAt(w.x, w.z);
        const y = gy === null ? 0 : chunk.worldToLocal(w.setY(gy)).y;
        holder.position.set(x, y, z);
        holder.rotation.y = Math.atan2(sp.face[0] - x, sp.face[1] - z);
        holder.scale.setScalar(CAMP_TENTS.scale);
        chunk.add(holder);
        const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        collider.name = `${holder.name}_collider`;
        collider.visible = false; // collision only (raycasts still hit invisible meshes)
        holder.add(collider);
        t.colliders.push(collider);
        const owner = botName(CAMP_TENTS.owners[o++ % CAMP_TENTS.owners.length]);
        t.spots.push({ site, index, owner, holder, model: null, collider, mine: null, plate: t.plates.add('', null), top: 2 });
        t.anchors.push(new THREE.Vector3());
      });
    }
    t.refresh();
    // Your tent re-dresses live as you change it in Customize.
    playerLoadout.subscribe(() => t.rebuildMine());
    return t;
  }

  get playerSite(): TentSiteId { return this.site; }
  /** Whether the player has picked a site yet (the FTUE asks). */
  get hasChosen(): boolean { return storageGet<TentSiteId | null>(SITE_KEY, null) !== null; }

  /** Pitch your tent at `id` (its first spot). Persists; the camper who had it moves on. */
  setPlayerSite(id: TentSiteId): void {
    this.site = id;
    storageSet(SITE_KEY, id);
    this.refresh();
    this.pop = 0;
  }

  setPlayerName(name: string): void { this.playerName = name || 'You'; this.refreshLabels(); }

  /** Each site's heart on the ground (world), for the FTUE's bird's-eye picker. */
  sitePoints(): { id: TentSiteId; label: string; emoji: string; pos: Vector3 }[] {
    return TENT_SITES.map((s) => {
      const tents = this.spots.filter((sp) => sp.site === s);
      const pos = new THREE.Vector3();
      tents.forEach((sp) => pos.add(sp.holder.getWorldPosition(this.tmp)));
      pos.divideScalar(Math.max(1, tents.length));
      return { id: s.id, label: s.label, emoji: s.emoji, pos };
    });
  }

  /** Your tent's spot on the ground (world). */
  playerTentPosition(out = new THREE.Vector3()): Vector3 {
    return this.mySpot().holder.getWorldPosition(out);
  }

  /** The way your tent's door faces (world yaw). */
  get playerTentYaw(): number {
    const f = new THREE.Vector3(0, 0, 1).transformDirection(this.mySpot().holder.matrixWorld);
    return Math.atan2(f.x, f.z);
  }

  /** XZ distance from `p` to the edge of your tent. */
  distanceToPlayerTent(p: Vector3): number {
    const s = this.mySpot();
    const c = s.holder.getWorldPosition(this.tmp);
    const r = s.model ? Math.max(s.model.half[0], s.model.half[1]) * CAMP_TENTS.scale * this.chunkScale() : 2.5;
    return Math.max(0, Math.hypot(p.x - c.x, p.z - c.z) - r);
  }

  get reach(): number { return CAMP_TENTS.reach; }

  update(dt: number, camera: Camera, labels: boolean): void {
    if (this.pop < 1) {
      // Your tent pops up when it's pitched (FTUE pick / a new site).
      this.pop = Math.min(1, this.pop + dt / 0.55);
      const t = this.pop, c = 1.9;
      const k = Math.max(0.01, 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2));
      this.mySpot().holder.scale.set(CAMP_TENTS.scale * k, CAMP_TENTS.scale * Math.min(1.25, k), CAMP_TENTS.scale * k);
    }
    this.plates.visible = labels;
    this.spots.forEach((s, i) => {
      s.holder.getWorldPosition(this.anchors[i]);
      this.anchors[i].y += s.top * CAMP_TENTS.scale * this.chunkScale() + 0.6;
    });
    this.plates.update(camera, this.anchors);
  }

  private mySpot(): Spot {
    return this.spots.find((s) => s.site.id === this.site && s.index === 0)!;
  }

  private readonly scaleTmp = new THREE.Vector3();
  private chunkScale(): number { return this.chunk.getWorldScale(this.scaleTmp).x; }

  /** (Re)build any spot whose owner changed (player ↔ camper), then the labels. */
  private refresh(): void {
    for (const s of this.spots) {
      const mine = s.site.id === this.site && s.index === 0;
      if (s.mine !== mine) this.buildSpot(s, mine);
    }
    this.refreshLabels();
  }

  private mineKey = '';
  /** Loadout changes (avatar ones too) all notify: only rebuild when the tent itself changed. */
  private rebuildMine(): void {
    const key = JSON.stringify(playerLoadout.tent);
    if (key === this.mineKey) return;
    this.buildSpot(this.mySpot(), true);
  }

  private refreshLabels(): void {
    for (const s of this.spots) {
      this.plates.setName(s.plate, `${s.mine ? this.playerName : s.owner}'s Tent`,
        s.mine ? CAMP_TENTS.playerColor : CAMP_TENTS.otherColor);
    }
  }

  private buildSpot(s: Spot, mine: boolean): void {
    const loadout: TentLoadout = mine ? playerLoadout.tent
      : rollBotTent(seededRng(CAMP_TENTS.owners[this.spots.indexOf(s) % CAMP_TENTS.owners.length], 'tent'));
    if (s.model) { s.holder.remove(s.model.root); disposeTree(s.model.root); }
    const model = buildTent(loadout, { clearing: false });
    model.root.traverse((o) => { o.userData.noBatch = true; }); // rebuilt when owners / loadouts change
    s.holder.add(model.root);
    s.model = model;
    s.mine = mine;
    if (mine) this.mineKey = JSON.stringify(loadout);
    // Collider over the shell (tall enough to read as a wall to the step test).
    const [hx, hz] = model.half;
    s.collider.scale.set(hx * 2 * 0.92, 3, hz * 2 * 0.92);
    s.collider.position.set(0, 1.5, 0);
    s.holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    s.top = Math.min(3.2, (box.max.y - s.holder.getWorldPosition(this.tmp).y) / (CAMP_TENTS.scale * this.chunkScale()));
  }
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const map = (mat as InstanceType<typeof THREE.MeshStandardMaterial>).map;
      map?.dispose();
      mat.dispose();
    }
  });
}
