// The player's camp spot, built procedurally from their tent loadout: tent style +
// material, sleeping bag style + material, an optional lantern, and every item put on
// display. Display spots are generated, never authored — pennants fly ON the tent's
// peaks, a few things sit IN it by the bag, and the rest go on stumps AROUND it in
// rings that keep growing outward (the doorway path stays clear), so any number of
// items always gets a neat spot.

import { hashString } from '../rng';
import { itemById, type Item } from '../inventory/items';
import type { TentLoadout } from './loadout';
import { buildItemProp } from './attire';
import { gradient, patchwork, plaid, starry, stripes } from './patterns';

type Group = import('three').Group;
type Material = import('three').Material;
type BufferGeometry = import('three').BufferGeometry;

export interface TentModel {
  root: Group;
  /** Radius (from the tent centre) that everything fits in — for framing a camera. */
  extent: number;
  /** The tent shell's footprint half-size (x, z) — for a collider. */
  half: [number, number];
}

export interface BuildTentOptions {
  /** The grassy clearing under it (the Customize preview). Off in camp, where it stands on the real
   * ground — just the dirt pad + the path to the door are kept. Default true. */
  clearing?: boolean;
}

const DEFAULT_CANVAS = '#6f9e57';
const DEFAULT_NYLON = '#3a6fa8';
/** Tent door faces +Z. */
const DOOR_CLEAR = 0.42; // half-angle (rad) of the path kept free in front of the door

function colsOf(it: Item | undefined): string[] {
  if (!it?.swatch) return [];
  return typeof it.swatch === 'string' ? [it.swatch] : [...it.swatch];
}

function hashed(id: string, palette: readonly string[]): string { return palette[hashString(id) % palette.length]; }

/** Cloth for a tent / bag material (or colour) item; null → the default. */
function cloth(it: Item | undefined, fallback: string, bed: boolean): Material {
  const side = THREE.DoubleSide;
  const std = (o: ConstructorParameters<typeof THREE.MeshStandardMaterial>[0]) =>
    new THREE.MeshStandardMaterial({ roughness: 0.9, side, ...o });
  if (!it) return std({ color: fallback, map: bed ? stripes('#ffffff', '#dde6f2', 4, true) : null });
  const cols = colsOf(it);
  if (it.id === 'cp_tent_patchwork') return std({ map: patchwork(['#d9483f', '#f2b52c', '#3a6fa8', '#6aa84f', '#f3e6cf', '#8158a8']) });
  if (it.id === 'cp_bed_flannel') return std({ map: plaid('#c0392b', '#7a1f1a', '#f3e6cf') });
  if (it.id === 'tent_starry_night' || cols.length > 2) return std({ map: starry(cols[0] ?? '#2b2a6b') });
  if (cols.length === 2) return std({ map: bed ? stripes(cols[0], cols[1], 5, true) : gradient(cols[0], cols[1]) });
  if (cols.length === 1) return std({ color: cols[0] });
  // A material with no swatch yet: a hashed colour with a weave.
  return std({ color: hashed(it.id, ['#c9a26b', '#8f8a5a', '#b56f4a', '#6d8fa8', '#9a7bb0']), map: stripes('#ffffff', '#e4e4e4', 12, false) });
}

const wood = () => new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.85 });

function m(geo: BufferGeometry, mat: Material): import('three').Mesh {
  const x = new THREE.Mesh(geo, mat);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}

// ── Tents ─────────────────────────────────────────────────────────────────

interface Shell {
  group: Group;
  /** Footprint half-size (x, z). */
  half: [number, number];
  /** Floor spots inside, by the bag. */
  inside: [number, number][];
  /** Peaks a pennant can fly from (x, y, z). */
  on: [number, number, number][];
}

function aFrame(mat: Material): Shell {
  const g = new THREE.Group();
  const R = 1.25, L = 2.8;
  // Triangular prism along Z, one edge up (the ridge), the bottom face is the groundsheet.
  // (rotateX(-90°) turns the segment at +Z into the ridge; the other two edges sit at y = -R/2.)
  const prism = m(new THREE.CylinderGeometry(R, R, L, 3, 1, true).rotateX(-Math.PI / 2), mat);
  prism.position.y = R * 0.5;
  prism.scale.x = 1.15;
  g.add(prism);
  const back = m(new THREE.CircleGeometry(R, 3).rotateZ(Math.PI / 2), mat);
  back.position.set(0, R * 0.5, -L / 2);
  back.scale.x = 1.15;
  g.add(back);
  // Door flaps tied back.
  for (const s of [-1, 1]) {
    const flap = m(new THREE.CircleGeometry(R * 0.55, 3).rotateZ(Math.PI / 2), mat);
    flap.position.set(s * R * 0.62, R * 0.2, L / 2 + 0.02);
    flap.rotation.y = s * 0.9;
    g.add(flap);
  }
  // Poles + ridge knobs.
  for (const z of [-L / 2, L / 2]) {
    g.add(m(new THREE.CylinderGeometry(0.035, 0.035, R * 1.55, 6), wood()).translateY(R * 0.72).translateZ(z));
    g.add(m(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffc93f })).translateY(R * 1.52).translateZ(z));
  }
  return { group: g, half: [R * 1.0, L / 2], inside: [[-0.62, 0.7], [0.62, 0.7], [-0.62, -0.5], [0.62, -0.5]],
    on: [[0, R * 1.55, L / 2], [0, R * 1.55, -L / 2]] };
}

function teepee(mat: Material): Shell {
  const g = new THREE.Group();
  const R = 1.55, H = 3.1;
  const cone = m(new THREE.ConeGeometry(R, H, 10, 1, true, 0.42, Math.PI * 2 - 0.84), mat);
  cone.position.y = H / 2;
  g.add(cone);
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2 + 0.3;
    const pole = m(new THREE.CylinderGeometry(0.03, 0.04, H * 1.25, 6), wood());
    const top = new THREE.Vector3(0, H * 1.1, 0), bot = new THREE.Vector3(Math.sin(t) * R * 0.98, 0, Math.cos(t) * R * 0.98);
    pole.position.copy(top).add(bot).multiplyScalar(0.5);
    pole.lookAt(top);
    pole.rotateX(Math.PI / 2);
    g.add(pole);
  }
  return { group: g, half: [R, R], inside: [[-0.75, 0.45], [0.75, 0.45], [-0.55, -0.7], [0.55, -0.7]], on: [[0, H * 1.1, 0]] };
}

function dome(mat: Material): Shell {
  const g = new THREE.Group();
  const R = 1.6;
  const band = m(new THREE.SphereGeometry(R, 28, 12, Math.PI / 2 + 0.45, Math.PI * 2 - 0.9, Math.PI * 0.3, Math.PI * 0.2), mat);
  g.add(band);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.3),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  g.add(glass);
  const frame = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const arc = m(new THREE.TorusGeometry(R, 0.03, 6, 40, Math.PI), frame);
    arc.rotation.y = (i / 3) * Math.PI;
    g.add(arc);
  }
  g.add(m(new THREE.TorusGeometry(R, 0.04, 6, 40).rotateX(Math.PI / 2), frame).translateY(0.02));
  const floor = m(new THREE.CircleGeometry(R * 0.98, 32).rotateX(-Math.PI / 2), mat);
  floor.position.y = 0.01;
  g.add(floor);
  return { group: g, half: [R, R], inside: [[-0.85, 0.5], [0.85, 0.5], [-0.8, -0.6], [0.8, -0.6]], on: [[0, R, 0]] };
}

function tentShell(style: Item | undefined, mat: Material): Shell {
  if (!style) return aFrame(mat);
  if (style.id === 'cp_tent_teepee') return teepee(mat);
  if (style.id === 'cp_tent_stargazer') return dome(mat);
  // Future styles: pick one of the shapes by id until they get their own.
  return [aFrame, teepee, dome][hashString(style.id) % 3](mat);
}

// ── Sleeping bags ─────────────────────────────────────────────────────────

function bed(style: Item | undefined, mat: Material): Group {
  const g = new THREE.Group();
  const pillow = new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.95 });
  const id = style?.id;
  if (id === 'cp_bed_hammock') {
    const sling = m(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    sling.scale.set(0.9, 0.45, 2.2);
    sling.position.y = 0.62;
    g.add(sling);
    for (const z of [-1.2, 1.2]) {
      g.add(m(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), wood()).translateY(0.45).translateZ(z));
    }
    return g;
  }
  if (id === 'cp_bed_cloud') {
    const puff = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const spots: [number, number, number, number][] = [[0, 0.22, 0, 0.42], [-0.3, 0.2, 0.55, 0.34], [0.3, 0.2, 0.5, 0.36], [0, 0.2, -0.6, 0.4], [0.25, 0.4, -0.1, 0.3], [-0.25, 0.38, 0.1, 0.28]];
    spots.forEach(([x, y, z, r], i) => {
      const p = m(new THREE.SphereGeometry(r, 16, 12), i === 0 ? mat : puff);
      p.position.set(x, y, z);
      g.add(p);
    });
    return g;
  }
  if (id === 'tr_campfire_roll') {
    const blanket = m(new THREE.BoxGeometry(0.9, 0.08, 1.4), mat);
    blanket.position.set(0, 0.04, 0.15);
    g.add(blanket);
    const roll = m(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 16).rotateZ(Math.PI / 2), mat);
    roll.position.set(0, 0.2, -0.7);
    g.add(roll);
    return g;
  }
  // Sleeping bag (the default, and any bed style without its own model yet).
  const bag = m(new THREE.CapsuleGeometry(0.34, 1.3, 6, 14).rotateX(Math.PI / 2), mat);
  bag.scale.y = 0.45;
  bag.position.y = 0.16;
  g.add(bag);
  const head = m(new THREE.BoxGeometry(0.55, 0.14, 0.32), pillow);
  head.position.set(0, 0.2, -0.78);
  g.add(head);
  if (style) {
    const hue = hashed(style.id, ['#ffd23f', '#ff8fc8', '#6fe0a4']);
    g.add(m(new THREE.TorusGeometry(0.34, 0.03, 6, 20).rotateY(Math.PI / 2).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: hue })).translateY(0.16).translateZ(0.2));
  }
  return g;
}

// ── Lantern ───────────────────────────────────────────────────────────────

function lantern(it: Item): Group {
  const g = new THREE.Group();
  const glow = it.glow ?? '#ffc36b';
  const lamp = new THREE.MeshStandardMaterial({ color: glow, emissive: new THREE.Color(glow), emissiveIntensity: 1.6 });
  // Post with a hook.
  g.add(m(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6), wood()).translateY(0.7));
  g.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.04), wood()).translateY(1.38).translateX(0.15));
  const hang = new THREE.Group();
  hang.position.set(0.3, 1.18, 0);
  g.add(hang);
  if (it.id === 'lan_firefly_jar') {
    hang.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 14),
      new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.35, roughness: 0.1 })));
    hang.add(m(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.6 })).translateY(0.15));
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), lamp);
      f.position.set(Math.sin(i * 2.1) * 0.07, -0.08 + (i % 3) * 0.07, Math.cos(i * 2.1) * 0.07);
      hang.add(f);
    }
  } else if (it.id === 'lan_paper_moon') {
    hang.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), lamp));
  } else {
    hang.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), lamp));
    const cage = new THREE.MeshStandardMaterial({ color: 0x5b6b7a, metalness: 0.6, roughness: 0.4 });
    hang.add(m(new THREE.ConeGeometry(0.14, 0.12, 10), cage).translateY(0.16));
    hang.add(m(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10), cage).translateY(-0.11));
    hang.add(m(new THREE.TorusGeometry(0.05, 0.012, 6, 12), cage).translateY(0.25));
  }
  const light = new THREE.PointLight(glow, 3, 4.5, 1.6);
  hang.add(light);
  return g;
}

// ── Display spots ─────────────────────────────────────────────────────────

/** Spot n (0-based) outside the tent: rings of evenly spaced spots, nearest the door first. */
function outsideSpots(count: number, reach: number): { x: number; z: number; ring: number }[] {
  const out: { x: number; z: number; ring: number }[] = [];
  const spacing = 0.95;
  for (let ring = 0; out.length < count; ring++) {
    const r = reach + 0.75 + ring * 0.95;
    const arc = Math.PI * 2 - DOOR_CLEAR * 2;
    const n = Math.max(1, Math.floor((arc * r) / spacing));
    const spots: { x: number; z: number; ring: number; d: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = DOOR_CLEAR + (arc * (i + 0.5)) / n; // angle from +Z (the door), around the tent
      spots.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, ring, d: Math.min(a, Math.PI * 2 - a) });
    }
    // Fill each ring from the front corners backwards, alternating sides, so it looks balanced.
    spots.sort((p, q) => p.d - q.d || p.x - q.x);
    for (const s of spots) { if (out.length < count) out.push(s); }
  }
  return out;
}

// ── Build ─────────────────────────────────────────────────────────────────

export function buildTent(loadout: TentLoadout, opts: BuildTentOptions = {}): TentModel {
  const clearing = opts.clearing ?? true;
  const root = new THREE.Group();
  const get = (id?: string) => (id ? itemById(id) : undefined);
  const slots = loadout.slots;

  const shell = tentShell(get(slots.tentStyle), cloth(get(slots.tentMaterial), DEFAULT_CANVAS, false));
  root.add(shell.group);
  const reach = Math.hypot(shell.half[0], shell.half[1]) * 0.92;

  const b = bed(get(slots.bedStyle), cloth(get(slots.bedMaterial), DEFAULT_NYLON, true));
  b.position.z = -0.05;
  root.add(b);

  const lan = get(slots.lantern);
  if (lan) {
    const l = lantern(lan);
    l.position.set(shell.half[0] + 0.25, 0, shell.half[1] + 0.1);
    root.add(l);
  }

  // Displayed items: pennants on the peaks, then inside by the bag, then the rings outside.
  const items = loadout.displayed.map((id) => itemById(id)).filter((x): x is Item => !!x);
  const flags = items.filter((it) => it.kind === 'pennant').slice(0, shell.on.length);
  flags.forEach((it, i) => {
    const p = buildItemProp(it);
    const [x, y, z] = shell.on[i];
    p.scale.setScalar(0.8);
    p.position.set(x, y - 0.05, z);
    root.add(p);
  });
  const others = items.filter((it) => !flags.includes(it));
  const inside = others.slice(0, shell.inside.length);
  inside.forEach((it, i) => {
    const p = buildItemProp(it);
    const [x, z] = shell.inside[i];
    p.scale.setScalar(0.5);
    p.position.set(x, 0.02, z);
    p.rotation.y = x < 0 ? 0.5 : -0.5;
    root.add(p);
  });
  const rest = others.slice(inside.length);
  const spots = outsideSpots(rest.length, reach);
  const stump = new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.9 });
  const ringTop = new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.9 });
  let extent = reach + (lan ? 0.6 : 0.2);
  rest.forEach((it, i) => {
    const s = spots[i];
    const base = new THREE.Group();
    base.position.set(s.x, 0, s.z);
    base.rotation.y = Math.atan2(s.x, s.z); // face out from the tent
    base.add(m(new THREE.CylinderGeometry(0.26, 0.29, 0.16, 12), stump).translateY(0.08));
    base.add(m(new THREE.CylinderGeometry(0.255, 0.255, 0.01, 12), ringTop).translateY(0.165));
    const p = buildItemProp(it);
    p.scale.setScalar(0.72);
    p.position.y = 0.17;
    base.add(p);
    root.add(base);
    extent = Math.max(extent, Math.hypot(s.x, s.z) + 0.4);
  });

  // Ground: a grassy clearing (preview only) with a dirt path to the door. In camp the pad and
  // path sit a hair higher so they never z-fight the terrain.
  const lift = clearing ? 0 : 0.03;
  if (clearing) {
    const grass = new THREE.Mesh(new THREE.CircleGeometry(extent + 0.9, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x7cbf5a, roughness: 1 }));
    grass.receiveShadow = true;
    grass.position.y = -0.005;
    root.add(grass);
  }
  const pathLen = clearing ? extent + 0.9 : 1.4;
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.1, pathLen).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 1 }));
  path.receiveShadow = true;
  path.position.set(0, lift, shell.half[1] + pathLen / 2 - 0.2);
  root.add(path);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(reach + 0.2, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb58c5a, roughness: 1 }));
  dirt.receiveShadow = true;
  dirt.position.y = 0.002 + lift;
  root.add(dirt);

  return { root, extent, half: shell.half };
}
