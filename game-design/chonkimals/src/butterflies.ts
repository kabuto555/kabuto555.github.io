// Butterflies — small colourful butterflies around camp. Each one flutters about its
// patch (erratic zig-zag + bob), now and then drifts down to land — on a flower in
// its patch when it has some (ground-dressing.ts flower clumps), else the grass — and
// slowly fans its wings, and bursts back up and away if you walk close. Low detail:
// two textured wing quads + a tiny body per butterfly, drawn as three InstancedMeshes
// (three draw calls however many there are). Ground heights come from the game's
// ground raycast. Tuning in BUTTERFLY_TUNING.

type Vector3 = InstanceType<typeof THREE.Vector3>;
type InstancedMesh = InstanceType<typeof THREE.InstancedMesh>;

export const BUTTERFLY_TUNING = {
  count: 22,
  /** Wander radius around each butterfly's patch, and fly height above ground (world units). */
  wander: 5,
  height: [0.5, 2.2] as [number, number],
  speed: 1.6,
  /** Chance to land when a wander leg ends; how long it rests. */
  landChance: 0.45,
  rest: [3, 9] as [number, number],
  /** You scare it off within this distance (landed); it veers away within `shy` while flying. */
  scare: 2.8,
  shy: 1.4,
  fleeSpeed: 4.2,
  /** Wing length (world units; wingspan ≈ 2×). */
  wing: 0.38,
  colors: [0xffd23f, 0xff9f5a, 0x7fd3ff, 0xff7ab6, 0xfff4e2, 0x9b7bff, 0x8fe06a],
};

type State = 'fly' | 'descend' | 'rest' | 'flee';

interface Fly {
  p: Vector3; v: Vector3; home: Vector3; home0: Vector3; target: Vector3; perches: Vector3[];
  state: State; timer: number; phase: number; heading: number; ground: number; groundT: number;
}

/** One wing: an upper + lower lobe, white with dark veins/edge and spots (tinted per instance). */
function wingTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = c.getContext('2d')!;
  const lobe = (x: number, y: number, rx: number, ry: number, rot: number) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };
  ctx.fillStyle = '#2b2233';
  lobe(62, 44, 58, 38, -0.35); ctx.fill();
  lobe(48, 92, 38, 30, 0.45); ctx.fill();
  ctx.fillStyle = '#ffffff';
  lobe(62, 44, 50, 31, -0.35); ctx.fill();
  lobe(48, 92, 31, 23, 0.45); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(43,34,51,0.35)';
  ctx.lineWidth = 3;
  for (const [x2, y2] of [[100, 26], [104, 50], [74, 70], [62, 108]]) {
    ctx.beginPath(); ctx.moveTo(6, 64); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.fillStyle = '#2b2233';
  for (const [x, y, r] of [[96, 36, 6], [84, 58, 4], [50, 98, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Butterflies {
  private flies: Fly[] = [];
  private wingL: InstancedMesh;
  private wingR: InstancedMesh;
  private body: InstancedMesh;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qw = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();
  private axis = new THREE.Vector3(0, 0, 1);
  private tmp = new THREE.Vector3();

  /** `homes`: spots they hang around (+ flower heads to land on); `groundAt` = ground height (or null). */
  constructor(scene: InstanceType<typeof THREE.Scene>, homes: { centre: Vector3; perches?: Vector3[] }[],
              private groundAt: (x: number, z: number) => number | null) {
    const T = BUTTERFLY_TUNING;
    // Spread them over the patches (shuffled, so a big flower field doesn't hog them all).
    const order = homes.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < T.count; i++) {
      const src = homes[order[i % order.length]];
      const home = src.centre.clone();
      const g = this.ground(home.x, home.z, home.y);
      home.y = g;
      const p = home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random(), (Math.random() - 0.5) * 4));
      const f: Fly = { p, v: new THREE.Vector3(), home, home0: home.clone(), perches: src.perches ?? [], target: new THREE.Vector3(), state: 'fly', timer: 0,
        phase: Math.random() * 10, heading: Math.random() * 6.28, ground: g, groundT: Math.random() * 0.3 };
      this.pickWander(f);
      this.flies.push(f);
    }
    const W = T.wing;
    const wingGeo = (sx: number) => {
      const g = new THREE.PlaneGeometry(W, W).translate(W / 2, 0, 0).rotateX(Math.PI / 2); // big lobe forward
      if (sx < 0) g.scale(-1, 1, 1);
      return g;
    };
    const wingMat = new THREE.MeshBasicMaterial({ map: wingTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    this.wingR = new THREE.InstancedMesh(wingGeo(1), wingMat, T.count);
    this.wingL = new THREE.InstancedMesh(wingGeo(-1), wingMat, T.count);
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.03, 0.2, 2, 5).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2b2233 }), T.count);
    const col = new THREE.Color();
    for (let i = 0; i < T.count; i++) {
      col.setHex(T.colors[i % T.colors.length]);
      this.wingR.setColorAt(i, col);
      this.wingL.setColorAt(i, col);
    }
    for (const im of [this.wingL, this.wingR, this.body]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.name = 'butterflies';
      scene.add(im);
    }
  }

  setVisible(v: boolean): void { for (const im of [this.wingL, this.wingR, this.body]) im.visible = v; }

  update(dt: number, player: Vector3 | null): void {
    if (!this.body.visible) return;
    const T = BUTTERFLY_TUNING;
    this.t += dt;
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i];
      f.timer -= dt;
      const near = player ? Math.hypot(player.x - f.p.x, player.z - f.p.z) : Infinity;
      if ((f.state === 'rest' || f.state === 'descend') && near < T.scare) this.flee(f, player!);

      if (f.state === 'rest') {
        f.v.set(0, 0, 0);
        if (f.timer <= 0) { f.state = 'fly'; this.pickWander(f); f.v.y = 1.2; }
      } else {
        const speed = f.state === 'flee' ? T.fleeSpeed : T.speed;
        const want = this.tmp.copy(f.target).sub(f.p);
        const dist = want.length();
        if (f.state === 'fly' && near < T.shy && player) {
          want.set(f.p.x - player.x, 0.6, f.p.z - player.z); // veer away from you
        }
        want.normalize().multiplyScalar(speed);
        // Erratic flutter: zig-zag across the heading + bobbing (calmer on the way down to land).
        const jit = f.state === 'descend' ? Math.min(1, dist) * 0.3 : 1;
        want.x += Math.sin(this.t * 3.1 + f.phase) * 0.9 * jit;
        want.z += Math.cos(this.t * 2.7 + f.phase * 1.3) * 0.9 * jit;
        want.y += Math.sin(this.t * 6 + f.phase) * 0.8 * jit;
        f.v.lerp(want, 1 - Math.exp(-3 * dt));
        f.p.addScaledVector(f.v, dt);
        // Never through the ground (the terrain rises and falls under the patch).
        // Ground is re-sampled a few times a second (a raycast per butterfly per frame is wasteful).
        if ((f.groundT -= dt) <= 0) { f.groundT = 0.3; f.ground = this.ground(f.p.x, f.p.z, f.ground); }
        const g = f.ground;
        if (f.state !== 'descend' && f.p.y < g + 0.3) { f.p.y = g + 0.3; f.v.y = Math.abs(f.v.y); }
        if (Math.hypot(f.v.x, f.v.z) > 0.05) f.heading = Math.atan2(f.v.x, f.v.z);

        if (f.state === 'descend' && (dist < 0.15 || f.timer <= 0)) {
          f.p.copy(f.target);
          f.state = 'rest';
          f.timer = T.rest[0] + Math.random() * (T.rest[1] - T.rest[0]);
        } else if (f.state === 'flee' && f.timer <= 0) {
          f.state = 'fly';
          this.pickWander(f);
        } else if (f.state === 'fly' && (dist < 0.6 || f.timer <= 0)) {
          if (Math.random() < T.landChance && near > T.scare * 1.5) this.pickLanding(f);
          else this.pickWander(f);
        }
      }

      // Wings: quick flaps in the air, slow fanning while resting (mostly closed, upright).
      let ang: number;
      if (f.state === 'rest') ang = 1.15 - (0.5 + 0.5 * Math.sin(this.t * 1.6 + f.phase)) * 0.9;
      else ang = 0.15 + Math.abs(Math.sin(this.t * (f.state === 'flee' ? 26 : 17) + f.phase)) * 1.05;
      this.q.setFromEuler(this.e.set(f.state === 'rest' ? 0 : -0.25, f.heading, 0, 'YXZ'));
      this.m.compose(f.p, this.q, this.s);
      this.body.setMatrixAt(i, this.m);
      this.qw.setFromAxisAngle(this.axis, ang).premultiply(this.q);
      this.m.compose(f.p, this.qw, this.s);
      this.wingR.setMatrixAt(i, this.m);
      this.qw.setFromAxisAngle(this.axis, -ang).premultiply(this.q);
      this.m.compose(f.p, this.qw, this.s);
      this.wingL.setMatrixAt(i, this.m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
  }

  private ground(x: number, z: number, fallback: number): number {
    return this.groundAt(x, z) ?? fallback;
  }

  private pickWander(f: Fly): void {
    const T = BUTTERFLY_TUNING;
    const a = Math.random() * Math.PI * 2, r = Math.random() * T.wander;
    const x = f.home.x + Math.cos(a) * r, z = f.home.z + Math.sin(a) * r;
    const g = this.ground(x, z, f.home.y);
    f.target.set(x, g + T.height[0] + Math.random() * (T.height[1] - T.height[0]), z);
    f.timer = 3 + Math.random() * 4;
  }

  private pickLanding(f: Fly): void {
    // Prefer a flower in its patch that's close by.
    const near = f.perches.filter((p) => Math.hypot(p.x - f.p.x, p.z - f.p.z) < 5);
    if (near.length) {
      f.target.copy(near[Math.floor(Math.random() * near.length)]);
      f.state = 'descend';
      f.timer = 6;
      return;
    }
    const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.5;
    const x = f.p.x + Math.cos(a) * r, z = f.p.z + Math.sin(a) * r;
    const g = this.groundAt(x, z);
    if (g === null) { this.pickWander(f); return; }
    f.target.set(x, g + 0.06, z);
    f.state = 'descend';
    f.timer = 6;
  }

  private flee(f: Fly, from: Vector3): void {
    const away = this.tmp.set(f.p.x - from.x, 0, f.p.z - from.z).normalize();
    f.state = 'flee';
    f.timer = 1.4 + Math.random() * 0.8;
    f.target.set(f.p.x + away.x * 6, f.ground + 3 + Math.random() * 1.5, f.p.z + away.z * 6);
    f.v.set(away.x * 2, 2.5, away.z * 2);
    // Settle into a new patch a little further off.
    f.home.x += away.x * 3;
    f.home.z += away.z * 3;
    if (Math.hypot(f.home.x - f.home0.x, f.home.z - f.home0.z) > 8) f.home.copy(f.home0); // drift back home eventually
  }
}
