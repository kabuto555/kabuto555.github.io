// The camp's Bulletin Board — a big clay notice board at the front of camp beside
// the Mailbox, angled (like the mailbox) to face the main torii gate so you see it
// walking in. Its four notices are the real, live papers (map / news / leaderboard /
// daily challenge) at half resolution, and a bobbing "!" floats over the roof while
// there's unread news, a challenge you haven't looked at, or a reward to claim.
// Walking up floats a "Bulletin Board" button (a gate in main.ts) that opens the
// close-up board screen. Build before bots sample ground heights (it has a collider).

import { bangTexture } from '../mailbox';
import { buildBoardModel, BOARD_LAYOUT } from './board-model';
import { PaperSet, type PaperData, type PaperKind } from './papers';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export const BULLETIN_BOARD = {
  chunk: 'chunk_0_camp',
  /** Camp-local: on the grass north of the Canteen, beside the Mailbox — side by side as seen
   * from the gate (not one behind the other), clear of the plaza and the lake path. */
  at: { x: -16.3, z: 21.1 },
  /** Faces the torii gate (build_camp.py prop_entrance_gate), like the Mailbox. */
  faceToward: { x: 0, z: 7 },
  /** Model units → camp-local. */
  scale: 0.72,
  reach: 2.4,
};

export class BulletinBoard {
  readonly colliders: Mesh[] = [];
  readonly gatePoint = new THREE.Vector3();
  /** Camera heading that looks at the board's face. */
  frontHeading = 0;
  readonly papers: PaperSet;
  private bang: InstanceType<typeof THREE.Sprite>;
  private pivots: Record<PaperKind, Group>;
  private alert = false;
  private bangAmt = 0;
  private t = 0;
  private readonly centre = new THREE.Vector3();
  private halfWidth = 1;

  private constructor(private readonly root: Group, data: () => PaperData) {
    this.papers = new PaperSet(0.5, data);
    const model = buildBoardModel(this.papers.textures);
    root.add(model.root);
    this.pivots = model.pivots;
    this.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTexture(), transparent: true, depthWrite: false }));
    this.bang.center.set(0.5, 0);
    this.bang.position.set(0, BOARD_LAYOUT.centerY + BOARD_LAYOUT.corkH / 2 + 2.6, 0.2);
    root.add(this.bang);
    // Papers redraw + flutter and the "!" bobs: keep them out of static batching.
    for (const k of Object.keys(this.pivots) as PaperKind[]) this.pivots[k].traverse((o) => { o.userData.noBatch = true; });
    this.bang.userData.noBatch = true;
  }

  static build(stageRoot: Object3D, data: () => PaperData): BulletinBoard | null {
    const chunk = stageRoot.getObjectByName(BULLETIN_BOARD.chunk);
    if (!chunk) return null;
    const B = BULLETIN_BOARD;
    const g = new THREE.Group();
    g.name = 'bulletin_board';
    g.position.set(B.at.x, 0, B.at.z);
    g.rotation.y = Math.atan2(B.faceToward.x - B.at.x, B.faceToward.z - B.at.z);
    g.scale.setScalar(B.scale);
    chunk.add(g);
    const b = new BulletinBoard(g, data);
    g.updateMatrixWorld(true);

    const col = new THREE.Mesh(new THREE.BoxGeometry(BOARD_LAYOUT.corkW + 0.8, 8, 0.9), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    col.name = 'bulletin_board_collider';
    col.position.set(0, 4, -0.05);
    col.visible = false;
    g.add(col);
    col.updateMatrixWorld(true);
    b.colliders.push(col);

    const front = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld).setY(0).normalize();
    b.centre.copy(g.localToWorld(new THREE.Vector3()));
    b.halfWidth = g.localToWorld(new THREE.Vector3((BOARD_LAYOUT.corkW + 0.8) / 2, 0, 0)).distanceTo(b.centre);
    b.gatePoint.copy(b.centre).addScaledVector(front, 2.2);
    b.frontHeading = Math.atan2(front.x, front.z);
    return b;
  }

  /** XZ distance from `p` to the board (a line segment across its width). */
  distance(p: Vector3): number {
    const right = new THREE.Vector3(Math.cos(this.frontHeading), 0, -Math.sin(this.frontHeading));
    const dx = p.x - this.centre.x, dz = p.z - this.centre.z;
    const along = THREE.MathUtils.clamp(dx * right.x + dz * right.z, -this.halfWidth, this.halfWidth);
    return Math.max(0, Math.hypot(dx - right.x * along, dz - right.z * along) - 0.4);
  }

  get reach(): number { return BULLETIN_BOARD.reach; }
  get worldCentre(): Vector3 { return this.centre; }

  setAlert(v: boolean): void { this.alert = v; }

  update(dt: number): void {
    this.t += dt;
    this.bangAmt += ((this.alert ? 1 : 0) - this.bangAmt) * (1 - Math.exp(-6 * dt));
    this.bang.visible = this.bangAmt > 0.05;
    const s = (1.35 + Math.sin(this.t * 6) * 0.06) * this.bangAmt;
    this.bang.scale.set(s, s * 1.25, s);
    this.bang.position.y = BOARD_LAYOUT.centerY + BOARD_LAYOUT.corkH / 2 + 2.6 + Math.sin(this.t * 3) * 0.15;
    // Notices stir in the breeze.
    let i = 0;
    for (const k of Object.keys(this.pivots) as PaperKind[]) {
      const base = BOARD_LAYOUT.papers[k].rot;
      this.pivots[k].rotation.z = base + Math.sin(this.t * 1.7 + i * 1.9) * 0.012;
      this.pivots[k].rotation.x = -Math.max(0, Math.sin(this.t * 1.1 + i * 2.3)) * 0.05;
      i++;
    }
  }
}
