/**
 * Sumo ring obstacles — logs, picnic tables and rocks dropped into the ring
 * each match (0–3 of them). Built from primitives; each has a flat XZ collider
 * the chonks bounce off (circle for rocks, oriented box for logs and tables).
 */

type Group = InstanceType<typeof THREE.Group>;
type Scene = InstanceType<typeof THREE.Scene>;

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; yaw: number };

/** Contact from `collide`: push-out normal (world XZ, unit) and overlap depth. */
export interface Contact { nx: number; nz: number; depth: number }

type Kind = 'log' | 'table' | 'rock';

interface Piece {
  kind: Kind;
  mesh: Group;
  /** Collider half-extents (box) or radius (circle) in the piece's local frame. */
  hx: number;
  hz: number;
  /** Rough footprint radius, for spacing pieces apart when laying out. */
  reach: number;
}

const BARK = 0x7a4a28;
const WOOD_END = 0xd9b27a;
const TABLE_WOOD = 0xb07a45;
const TABLE_DARK = 0x86582f;
const ROCK = 0x9aa0a8;

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });

function box(g: Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
}

function buildLog(): Piece {
  const g = new THREE.Group();
  const len = 3.6, r = 0.45;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat(BARK));
  trunk.rotation.z = Math.PI / 2; // lie along local x
  trunk.position.y = r;
  trunk.castShadow = true;
  g.add(trunk);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.04, 14), mat(WOOD_END));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(s * (len / 2 + 0.01), r, 0);
    g.add(cap);
  }
  return { kind: 'log', mesh: g, hx: len / 2, hz: r, reach: len / 2 + 0.5 };
}

function buildTable(): Piece {
  const g = new THREE.Group();
  box(g, 3.0, 0.14, 1.1, 0, 1.0, 0, TABLE_WOOD);            // top
  for (const s of [-1, 1]) {
    box(g, 3.0, 0.12, 0.42, 0, 0.55, s * 0.95, TABLE_WOOD); // benches
    box(g, 0.14, 1.0, 0.14, s * 1.15, 0.5, 0, TABLE_DARK);  // centre legs
    box(g, 0.14, 0.5, 2.3, s * 1.15, 0.28, 0, TABLE_DARK);  // bench supports
  }
  return { kind: 'table', mesh: g, hx: 1.5, hz: 1.15, reach: 2.0 };
}

function buildRock(): Piece {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: ROCK, roughness: 0.95, metalness: 0, flatShading: true }),
  );
  m.scale.set(1, 0.7, 0.9);
  m.position.y = 0.35;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return { kind: 'rock', mesh: g, hx: 0.95, hz: 0.95, reach: 1.4 };
}

export class SumoObstacles {
  readonly group = new THREE.Group();
  /** Colliders for this match's pieces. */
  readonly colliders: Collider[] = [];
  private readonly pool: Piece[];

  constructor(scene: Scene) {
    this.pool = [buildLog(), buildLog(), buildTable(), buildTable(), buildRock(), buildRock(), buildRock()];
    for (const p of this.pool) { p.mesh.visible = false; this.group.add(p.mesh); }
    scene.add(this.group);
  }

  /** Scatter 0–3 random pieces in the ring (centre cx,cz, radius R, floor y),
   * clear of the spawn points in `avoid` and of each other. */
  layout(cx: number, y: number, cz: number, R: number, avoid: readonly { x: number; z: number }[]): void {
    this.clear();
    const count = [0, 1, 1, 2, 2, 2, 3][Math.floor(Math.random() * 7)];
    const free = [...this.pool];
    const placed: { x: number; z: number; reach: number }[] = [];
    for (let n = 0; n < count && free.length > 0; n++) {
      const piece = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      for (let tries = 0; tries < 24; tries++) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * (R - piece.reach - 1.5);
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        const clear = avoid.every((p) => Math.hypot(p.x - x, p.z - z) > piece.reach + 2.2)
          && placed.every((p) => Math.hypot(p.x - x, p.z - z) > piece.reach + p.reach + 1.8);
        if (!clear) continue;
        const yaw = Math.random() * Math.PI * 2;
        piece.mesh.position.set(x, y, z);
        piece.mesh.rotation.set(0, yaw, 0);
        piece.mesh.visible = true;
        placed.push({ x, z, reach: piece.reach });
        this.colliders.push(piece.kind === 'rock'
          ? { kind: 'circle', x, z, r: piece.hx }
          : { kind: 'box', x, z, hx: piece.hx, hz: piece.hz, yaw });
        break;
      }
    }
  }

  clear(): void {
    this.colliders.length = 0;
    for (const p of this.pool) p.mesh.visible = false;
  }
}

/** Circle (x,z,r) vs collider. Fills `out` and returns true on overlap. */
export function collide(c: Collider, x: number, z: number, r: number, out: Contact): boolean {
  if (c.kind === 'circle') {
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d >= r + c.r) return false;
    if (d < 1e-6) { out.nx = 1; out.nz = 0; } else { out.nx = dx / d; out.nz = dz / d; }
    out.depth = r + c.r - d;
    return true;
  }
  // Oriented box: rotation.y = yaw maps local x → (cos, −sin), local z → (sin, cos).
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
  const ex = lx - qx, ez = lz - qz;
  const d = Math.hypot(ex, ez);
  let nlx: number, nlz: number;
  if (d > 1e-6) {
    if (d >= r) return false;
    nlx = ex / d; nlz = ez / d;
    out.depth = r - d;
  } else {
    // Centre inside the box: leave by the shallowest side.
    const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; out.depth = px + r; }
    else { nlx = 0; nlz = Math.sign(lz) || 1; out.depth = pz + r; }
  }
  out.nx = nlx * cs + nlz * sn;
  out.nz = -nlx * sn + nlz * cs;
  return true;
}
