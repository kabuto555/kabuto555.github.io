/**
 * World themes — each stage cycles through one of 10 distinct locales.
 * Each theme defines sky/fog colours, star colour, enemy tint overrides,
 * and a function that builds a themed obstacle mesh.
 */
import { createFlatMaterial } from '../materials';

type Mesh = InstanceType<typeof THREE.Mesh>;

export interface WorldTheme {
  name: string;
  skyColor:    number;
  fogDensity:  number;
  starColor:   number;
  starOpacity: number;
  hemisphereSky:    number;
  hemisphereGround: number;
  enemyTints: { snake: number | null; eagle: number | null; leopard: number | null };
  /** Build one environmental obstacle mesh */
  buildObstacle: (size: number) => Mesh;
  /** Build one fruit obstacle mesh — monkey-themed collectible-looking hazard */
  buildFruit: (size: number) => Mesh;
}

// ── Shared obstacle builders ───────────────────────────────────────────────────

function asteroid(size: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size, 0),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.scale.set(0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6);
  return m;
}

function crystal(size: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(size * 0.9, 0),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.scale.set(0.55 + Math.random() * 0.4, 1.4 + Math.random() * 0.8, 0.55 + Math.random() * 0.4);
  return m;
}

function cube(size: number, color: number): Mesh {
  const s = size * (0.8 + Math.random() * 0.4);
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.rotation.set(Math.random(), Math.random(), Math.random());
  return m;
}

function cylinder(size: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.3, size * 0.5, size * 2.2, 7),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.rotation.set(Math.random() * Math.PI, 0, Math.random() * Math.PI);
  return m;
}

function torus(size: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.7, size * 0.22, 6, 10),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  return m;
}

function spire(size: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.28, size * 2.5, 5),
    createFlatMaterial(color),
  );
  m.castShadow = true;
  m.rotation.set(Math.random() * 0.4 - 0.2, Math.random() * Math.PI, Math.random() * 0.4 - 0.2);
  return m;
}

// ── Fruit builders ──────────────────────────────────────────────────────────────────
// Each builds a stylised 3-D fruit as a Group of primitives

function banana(size: number): Mesh {
  // Crescent body: a torus arc scaled tall
  const g = new THREE.TorusGeometry(size * 0.55, size * 0.18, 6, 12, Math.PI * 1.1);
  const m = new THREE.Mesh(g, createFlatMaterial(0xffee22));
  m.rotation.z = Math.PI * 0.55;
  m.castShadow = true;
  return m;
}

function apple(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.55, 8, 7),
    createFlatMaterial(0xdd2222),
  );
  m.scale.set(1, 1.1, 0.95);
  m.castShadow = true;
  return m;
}

function watermelon(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.6, 8, 6),
    createFlatMaterial(0x228833),
  );
  m.scale.set(1.3, 1, 1);
  m.castShadow = true;
  return m;
}

function orange(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.52, 8, 7),
    createFlatMaterial(0xff8800),
  );
  m.castShadow = true;
  return m;
}

function mango(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.5, 8, 7),
    createFlatMaterial(0xffaa00),
  );
  m.scale.set(0.8, 1.25, 0.9);
  m.castShadow = true;
  return m;
}

function grape(size: number): Mesh {
  // Small cluster: three overlapping spheres
  const root = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.38, 7, 6),
    createFlatMaterial(0x8833cc),
  );
  root.castShadow = true;
  return root;
}

function pineapple(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.3, size * 0.35, size * 1.1, 7),
    createFlatMaterial(0xddaa22),
  );
  m.castShadow = true;
  return m;
}

function coconut(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.5, 7, 6),
    createFlatMaterial(0x886633),
  );
  m.scale.set(0.95, 1.05, 1);
  m.castShadow = true;
  return m;
}

function kiwi(size: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.45, 7, 6),
    createFlatMaterial(0x557722),
  );
  m.scale.set(0.9, 1.2, 0.9);
  m.castShadow = true;
  return m;
}

function starfruit(size: number): Mesh {
  // Five-pointed silhouette via a low-poly torus with 5 segments
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.45, size * 0.2, 5, 5),
    createFlatMaterial(0xeeee44),
  );
  m.castShadow = true;
  return m;
}

// ── The 10 themes (index 0–9, cycling with stageIndex % 10) ───────────────────

export const WORLD_THEMES: WorldTheme[] = [
  // 0 – Deep Space (default)
  {
    name: 'Deep Space',
    skyColor: 0x07122e, fogDensity: 0.026, starColor: 0xffffff, starOpacity: 0.85,
    hemisphereSky: 0x4466cc, hemisphereGround: 0x223355,
    enemyTints: { snake: null, eagle: null, leopard: null },
    buildObstacle: s => asteroid(s, 0x556677), buildFruit: s => banana(s),
  },
  // 1 – Crimson Nebula
  {
    name: 'Crimson Nebula',
    skyColor: 0x4a0a14, fogDensity: 0.024, starColor: 0xff9aaa, starOpacity: 0.9,
    hemisphereSky: 0xcc3355, hemisphereGround: 0x550011,
    enemyTints: { snake: 0xcc2222, eagle: 0xdd4422, leopard: 0xaa1133 },
    buildObstacle: s => asteroid(s, 0xaa3344), buildFruit: s => apple(s),
  },
  // 2 – Toxic Cloud
  {
    name: 'Toxic Cloud',
    skyColor: 0x0d2e14, fogDensity: 0.030, starColor: 0x99ffbb, starOpacity: 0.8,
    hemisphereSky: 0x336633, hemisphereGround: 0x112211,
    enemyTints: { snake: 0x22cc44, eagle: 0x44bb22, leopard: 0x88cc00 },
    buildObstacle: s => crystal(s, 0x44cc66), buildFruit: s => watermelon(s),
  },
  // 3 – Ice Field
  {
    name: 'Ice Field',
    skyColor: 0x0d2244, fogDensity: 0.020, starColor: 0xbbddff, starOpacity: 0.95,
    hemisphereSky: 0x5599cc, hemisphereGround: 0x223355,
    enemyTints: { snake: 0x44aacc, eagle: 0x66bbdd, leopard: 0x2288aa },
    buildObstacle: s => crystal(s, 0x88ccee), buildFruit: s => kiwi(s),
  },
  // 4 – Volcanic Belt
  {
    name: 'Volcanic Belt',
    skyColor: 0x3d1200, fogDensity: 0.032, starColor: 0xffcc66, starOpacity: 0.75,
    hemisphereSky: 0xaa3300, hemisphereGround: 0x441100,
    enemyTints: { snake: 0xdd4400, eagle: 0xff6600, leopard: 0xcc3300 },
    buildObstacle: s => cube(s, 0xcc4400), buildFruit: s => mango(s),
  },
  // 5 – Neon Grid
  {
    name: 'Neon Grid',
    skyColor: 0x000d2e, fogDensity: 0.018, starColor: 0x44ffff, starOpacity: 0.85,
    hemisphereSky: 0x0055cc, hemisphereGround: 0x000833,
    enemyTints: { snake: 0x00ffaa, eagle: 0x00ccff, leopard: 0x8800ff },
    buildObstacle: s => cube(s, 0x0099ff), buildFruit: s => starfruit(s),
  },
  // 6 – Gravity Ruins
  {
    name: 'Gravity Ruins',
    skyColor: 0x1a1033, fogDensity: 0.028, starColor: 0xddbbff, starOpacity: 0.88,
    hemisphereSky: 0x6633aa, hemisphereGround: 0x220033,
    enemyTints: { snake: 0x8833cc, eagle: 0xaa44ff, leopard: 0x662299 },
    buildObstacle: s => torus(s, 0x8833cc), buildFruit: s => grape(s),
  },
  // 7 – Sand Storm
  {
    name: 'Sand Storm',
    skyColor: 0x3d2800, fogDensity: 0.036, starColor: 0xffdd99, starOpacity: 0.65,
    hemisphereSky: 0xaa8833, hemisphereGround: 0x553300,
    enemyTints: { snake: 0xcc9933, eagle: 0xddaa44, leopard: 0xbb7722 },
    buildObstacle: s => spire(s, 0xbb9944), buildFruit: s => coconut(s),
  },
  // 8 – Frozen Core
  {
    name: 'Frozen Core',
    skyColor: 0x041e2e, fogDensity: 0.022, starColor: 0xccffff, starOpacity: 0.9,
    hemisphereSky: 0x0088aa, hemisphereGround: 0x003344,
    enemyTints: { snake: 0x00bbcc, eagle: 0x44ddee, leopard: 0x0099aa },
    buildObstacle: s => cylinder(s, 0x44bbcc), buildFruit: s => orange(s),
  },
  // 9 – Void Rift
  {
    name: 'Void Rift',
    skyColor: 0x1a001a, fogDensity: 0.024, starColor: 0xff66ff, starOpacity: 0.95,
    hemisphereSky: 0x660066, hemisphereGround: 0x220022,
    enemyTints: { snake: 0xff00aa, eagle: 0xcc0088, leopard: 0x880066 },
    buildObstacle: s => torus(s, 0xcc0099), buildFruit: s => pineapple(s),
  },
];

export function getTheme(stageIndex: number): WorldTheme {
  return WORLD_THEMES[stageIndex % WORLD_THEMES.length];
}
