// Birds — a few small flocks wheeling over camp. Deliberately low detail: each bird
// is a tiny body + two single-triangle wings, drawn as three InstancedMeshes (one
// draw call each, whatever the bird count). Flocks circle lazy loops at different
// heights and speeds; birds keep loose formation offsets, bob, and alternate flapping
// with long glides (wings held in a shallow V) so they read as birds from far off.
// All tuning in BIRD_TUNING.

type Vector3 = InstanceType<typeof THREE.Vector3>;
type InstancedMesh = InstanceType<typeof THREE.InstancedMesh>;

export const BIRD_TUNING = {
  flocks: 4,
  perFlock: [5, 8] as [number, number],
  /** Loop radius / height above the camp ground / speed (world units). */
  radius: [45, 120] as [number, number],
  height: [38, 75] as [number, number],
  speed: [9, 14] as [number, number],
  /** Size of one bird (wingspan, world units). */
  span: 1.5,
  color: 0x3d4a63,
};

interface Bird { flock: number; off: Vector3; phase: number; flapRate: number; glide: number }
interface Flock { c: Vector3; r: number; y: number; w: number; a: number; drift: number; tilt: number }

export class Birds {
  private body: InstancedMesh;
  private wingL: InstancedMesh;
  private wingR: InstancedMesh;
  private birds: Bird[] = [];
  private flocks: Flock[] = [];
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qw = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();
  private fwd = new THREE.Vector3();

  constructor(scene: InstanceType<typeof THREE.Scene>, campCentre: Vector3) {
    const T = BIRD_TUNING;
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    for (let f = 0; f < T.flocks; f++) {
      const c = campCentre.clone().add(new THREE.Vector3(rnd(-60, 60), 0, rnd(-50, 90)));
      this.flocks.push({ c, r: rnd(T.radius[0], T.radius[1]), y: rnd(T.height[0], T.height[1]),
        w: (rnd(T.speed[0], T.speed[1]) / rnd(T.radius[0], T.radius[1])) * (Math.random() < 0.5 ? 1 : -1),
        a: Math.random() * Math.PI * 2, drift: rnd(0, Math.PI * 2), tilt: 0 });
      const n = Math.round(rnd(T.perFlock[0], T.perFlock[1]));
      for (let i = 0; i < n; i++) {
        // Loose V: each bird trails the leader a little further back and out to a side.
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        this.birds.push({ flock: f, off: new THREE.Vector3(side * 2.4 + rnd(-0.6, 0.6), rnd(-1.2, 1.2), -Math.abs(side) * 2.2 + rnd(-0.6, 0.6)),
          phase: Math.random() * 10, flapRate: rnd(8, 11), glide: rnd(0, 10) });
      }
    }
    const count = this.birds.length;
    const half = T.span / 2;
    // Wings: one triangle each, root at the body, tip out to the side, swept back.
    const wing = (sx: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.22, sx * half, 0, -0.32], 3));
      g.computeVertexNormals();
      return g;
    };
    const mat = new THREE.MeshBasicMaterial({ color: T.color, side: THREE.DoubleSide, fog: true });
    const bodyGeo = new THREE.ConeGeometry(0.1, 0.62, 5).rotateX(Math.PI / 2);
    this.body = new THREE.InstancedMesh(bodyGeo, mat, count);
    this.wingL = new THREE.InstancedMesh(wing(-1), mat, count);
    this.wingR = new THREE.InstancedMesh(wing(1), mat, count);
    for (const im of [this.body, this.wingL, this.wingR]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.name = 'birds';
      scene.add(im);
    }
  }

  setVisible(v: boolean): void { for (const im of [this.body, this.wingL, this.wingR]) im.visible = v; }

  update(dt: number): void {
    if (!this.body.visible) return;
    this.t += dt;
    for (const f of this.flocks) {
      f.a += f.w * dt;
      f.drift += dt * 0.05;
      // Bank into the turn.
      f.tilt = -Math.sign(f.w) * 0.35;
    }
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const f = this.flocks[b.flock];
      // Leader path: a slowly wandering loop with gentle height swells.
      const r = f.r * (1 + Math.sin(f.drift * 3) * 0.15);
      const cx = f.c.x + Math.sin(f.drift) * 25, cz = f.c.z + Math.cos(f.drift * 0.7) * 25;
      const heading = f.a + (f.w > 0 ? Math.PI / 2 : -Math.PI / 2);   // tangent to the loop
      this.fwd.set(Math.sin(heading), 0, Math.cos(heading));
      // Formation offset in the flock's frame (x = right, z = forward).
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      this.p.set(
        cx + Math.sin(f.a) * r + rx * b.off.x + this.fwd.x * b.off.z,
        f.c.y + f.y + Math.sin(this.t * 0.6 + b.flock) * 3 + b.off.y + Math.sin(this.t * 1.7 + b.phase) * 0.35,
        cz + Math.cos(f.a) * r + rz * b.off.x + this.fwd.z * b.off.z,
      );
      this.q.setFromEuler(this.e.set(0, heading, f.tilt, 'YXZ'));
      this.m.compose(this.p, this.q, this.s);
      this.body.setMatrixAt(i, this.m);
      // Flap for a few beats, then glide with wings in a shallow V.
      const cycle = (this.t + b.glide) % 6;
      const flapping = cycle < 2.4;
      const ang = flapping ? Math.sin((this.t + b.phase) * b.flapRate) * 0.75 : 0.18 + Math.sin(this.t * 2 + b.phase) * 0.04;
      this.qw.setFromAxisAngle(this.fwdAxis, ang).premultiply(this.q);
      this.m.compose(this.p, this.qw, this.s);
      this.wingR.setMatrixAt(i, this.m);
      this.qw.setFromAxisAngle(this.fwdAxis, -ang).premultiply(this.q);
      this.m.compose(this.p, this.qw, this.s);
      this.wingL.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
  }

  private readonly fwdAxis = new THREE.Vector3(0, 0, 1);
}
