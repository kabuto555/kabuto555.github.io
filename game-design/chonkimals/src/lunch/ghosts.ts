/**
 * Lunch Delivery ghosts: when a camper gets taken out by the bugs, a little
 * sobbing ghost pops out of them and drifts up to heaven — swaying side to
 * side, halo on, tears dripping — fading away high above the route.
 *
 * Built from primitives and pooled (no per-spawn allocation). Purely visual;
 * the crying sound lives in LunchSfx.ghostCry().
 */

type Scene = InstanceType<typeof THREE.Scene>;
type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Vec3 = InstanceType<typeof THREE.Vector3>;

const POOL = 6;
const RISE_TIME = 5.5;        // seconds from pop-out to gone
const RISE_HEIGHT = 22;       // how far up it floats (world)
const POP_TIME = 0.35;        // squash-and-stretch pop out of the body
const SWAY = 1.1;             // side-to-side drift (world)
const TEAR_EVERY = 0.22;      // seconds between tear drops
const DRIFT = 14;             // drifts this far away from the camera as it climbs (never up past the lens)

interface Tear { mesh: Mesh; vy: number; t: number }
interface Ghost {
  root: Group;
  body: Group;
  mats: InstanceType<typeof THREE.MeshStandardMaterial | typeof THREE.MeshBasicMaterial>[];
  mouth: Mesh;
  halo: Mesh;
  tears: Tear[];
  tearIn: number;
  t: number;
  live: boolean;
  from: Vec3;
  /** Horizontal unit direction away from the camera, captured at spawn. */
  awayX: number; awayZ: number;
  phase: number;
  scale: number;
}

function buildGhost(): Omit<Ghost, 't' | 'live' | 'from' | 'phase' | 'scale' | 'tearIn' | 'awayX' | 'awayZ'> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const white = new THREE.MeshStandardMaterial({
    color: 0xf4f8ff, emissive: 0xbfd6ff, emissiveIntensity: 0.45, roughness: 0.4,
    transparent: true, opacity: 0.85, depthWrite: false,
  });
  // Round head + a skirt that flares out, finished with a scalloped hem of little bumps.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), white);
  head.position.y = 0.9;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.9, 20, 1, true), white);
  skirt.position.y = 0.45;
  body.add(head, skirt);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), white);
    bump.position.set(Math.cos(a) * 0.56, 0.02, Math.sin(a) * 0.56);
    body.add(bump);
  }
  // Sad face on the +z side: droopy eyes, brows tilted up in the middle, a wailing "O".
  const ink = new THREE.MeshBasicMaterial({ color: 0x2a2a3a, transparent: true, opacity: 1 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), ink);
    eye.scale.set(1, 1.35, 0.6);
    eye.position.set(s * 0.19, 1.0, 0.5);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), ink);
    brow.position.set(s * 0.2, 1.16, 0.51);
    brow.rotation.z = -s * 0.45; // inner ends (toward the nose) up → sad, not angry
    body.add(eye, brow);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), ink);
  mouth.scale.set(0.9, 1.25, 0.5);
  mouth.position.set(0, 0.78, 0.52);
  body.add(mouth);
  // Going to heaven: a little gold halo.
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 1 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24), gold);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.72;
  body.add(halo);
  // Tears (pooled; drip from the eyes and fall back down).
  const tearMat = new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.95 });
  const tears: Tear[] = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), tearMat);
    mesh.scale.set(1, 1.5, 1);
    mesh.visible = false;
    root.add(mesh);
    tears.push({ mesh, vy: 0, t: 0 });
  }
  root.visible = false;
  root.renderOrder = 8;
  return { root, body, mats: [white, ink, gold, tearMat], mouth, halo, tears };
}

export class LunchGhosts {
  private readonly ghosts: Ghost[] = [];
  private next = 0;

  constructor(scene: Scene) {
    for (let i = 0; i < POOL; i++) {
      const g = buildGhost();
      scene.add(g.root);
      this.ghosts.push({ ...g, t: 0, live: false, from: new THREE.Vector3(), awayX: 0, awayZ: 1, phase: 0, scale: 1, tearIn: 0 });
    }
  }

  /** A ghost leaves the body at `pos` (feet), sized to a character `height` tall. */
  spawn(pos: Vec3, height: number, camera: InstanceType<typeof THREE.Camera> | null = null): void {
    const g = this.ghosts[this.next];
    const dx = camera ? pos.x - camera.position.x : 0, dz = camera ? pos.z - camera.position.z : 1;
    const dl = Math.hypot(dx, dz) || 1;
    g.awayX = dx / dl; g.awayZ = dz / dl;
    this.next = (this.next + 1) % this.ghosts.length;
    g.live = true;
    g.t = 0;
    g.from.copy(pos);
    g.phase = Math.random() * Math.PI * 2;
    g.scale = THREE.MathUtils.clamp(height * 0.7, 0.9, 1.3);
    g.tearIn = 0.3;
    for (const tr of g.tears) tr.mesh.visible = false;
    g.root.visible = true;
  }

  /** Face the ghosts toward `camera` (so you see the sad face) and float them up. */
  update(dt: number, camera: InstanceType<typeof THREE.Camera> | null): void {
    for (const g of this.ghosts) {
      if (!g.live) continue;
      g.t += dt;
      const u = g.t / RISE_TIME;
      if (u >= 1) { g.live = false; g.root.visible = false; continue; }
      // Rise slowly at first, then float off faster; sway like it's drifting on a breeze.
      const rise = RISE_HEIGHT * u * u * (1.5 - 0.5 * u);
      const sway = Math.sin(g.t * 2.2 + g.phase) * SWAY * Math.min(1, g.t);
      // Drift away from where the camera was, so it climbs into the sky ahead
      // instead of floating up past the lens. Sway is across that direction.
      const drift = DRIFT * u * (0.6 + 0.4 * u);
      const bob = Math.cos(g.t * 1.7 + g.phase) * SWAY * 0.4;
      g.root.position.set(
        g.from.x + g.awayX * (drift + bob) + g.awayZ * sway,
        g.from.y + 0.4 + rise,
        g.from.z + g.awayZ * (drift + bob) - g.awayX * sway,
      );
      if (camera) {
        const dx = camera.position.x - g.root.position.x, dz = camera.position.z - g.root.position.z;
        g.root.rotation.y = Math.atan2(dx, dz);
      }
      g.body.rotation.z = Math.sin(g.t * 2.2 + g.phase + 0.6) * 0.18; // lean into the sway
      // Pop out of the body with a squash-and-stretch, then bob gently.
      const pop = Math.min(1, g.t / POP_TIME);
      const stretch = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.35 : 1 + Math.sin(g.t * 5) * 0.04;
      const s = g.scale * (0.2 + 0.8 * (1 - Math.pow(1 - pop, 3)));
      g.body.scale.set(s / Math.sqrt(stretch), s * stretch, s / Math.sqrt(stretch));
      // Sobbing mouth, wobbling halo.
      g.mouth.scale.set(0.9, 1.25 + 0.45 * Math.abs(Math.sin(g.t * 9)), 0.5);
      g.halo.position.y = 1.72 + 0.05 * Math.sin(g.t * 4);
      // Fade out over the last 40% of the climb.
      const fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      g.mats[0].opacity = 0.85 * fade;
      for (let i = 1; i < g.mats.length; i++) g.mats[i].opacity = fade;
      // Tears drip from the eyes and fall away.
      if ((g.tearIn -= dt) <= 0 && u < 0.7) {
        g.tearIn = TEAR_EVERY * (0.7 + Math.random() * 0.6);
        const tr = g.tears.find((q) => !q.mesh.visible);
        if (tr) {
          const side = Math.random() < 0.5 ? -1 : 1;
          tr.mesh.position.set(side * 0.2 * g.scale, 0.93 * g.scale, 0.5 * g.scale);
          tr.vy = 0.5; tr.t = 0;
          tr.mesh.visible = true;
        }
      }
      for (const tr of g.tears) {
        if (!tr.mesh.visible) continue;
        tr.t += dt;
        tr.vy -= 9 * dt;
        tr.mesh.position.y += tr.vy * dt;
        if (tr.t > 0.8) tr.mesh.visible = false;
      }
    }
  }
}
