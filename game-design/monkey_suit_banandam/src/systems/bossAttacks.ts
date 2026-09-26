/**
 * Boss attack patterns — varied projectile shapes, colours, and multi-source bursts.
 * Each boss type has its own palette and attack style.
 */
import type { EnemyType } from '../entities/enemies';
import type { Projectile } from './weapons';

type V3 = InstanceType<typeof THREE.Vector3>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

// ── Projectile geometry builders ─────────────────────────────────────────────

function makeSphere(r: number, color: number): Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r, 6, 5),
    new THREE.MeshBasicMaterial({ color }),
  );
}

function makeCube(s: number, color: number): Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    new THREE.MeshBasicMaterial({ color }),
  );
  m.rotation.set(Math.random(), Math.random(), Math.random());
  return m;
}

function makeStar(r: number, color: number): Mesh {
  // Octahedron read as a "spike" star
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(r, 0),
    new THREE.MeshBasicMaterial({ color }),
  );
}

function makeSlash(color: number): Group {
  // A thin elongated diamond (blade slash silhouette)
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.07, 0.07),
    new THREE.MeshBasicMaterial({ color }),
  );
  blade.rotation.z = Math.PI / 4;
  g.add(blade);
  const blade2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.07, 0.07),
    new THREE.MeshBasicMaterial({ color }),
  );
  blade2.rotation.z = -Math.PI / 4;
  g.add(blade2);
  return g;
}

function makeRing(color: number): Mesh {
  return new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.06, 5, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
}

// ── Boss attack configs ───────────────────────────────────────────────────────

export interface BossAttackConfig {
  /** Fire cooldown range in seconds [min, max] */
  cooldownRange: [number, number];
  /** Per-burst: list of lateral [x, y] offsets from boss centre for each shot */
  shotOffsets: Array<[number, number]>;
  /** Trail colour for bullet-trail system */
  trailColor: number;
  /** Build one projectile mesh */
  buildProjectile: () => Mesh | Group;
  /** Projectile speed (world units/sec) */
  speed: number;
  /** Damage per hit */
  damage: number;
}

// boss_snake — wide spread of spinning cube projectiles, acid-green palette
const SNAKE_BOSS_CONFIG: BossAttackConfig = {
  cooldownRange: [1.6, 2.4],
  shotOffsets: [[-1.4, 0], [0, 0.2], [1.4, 0]],   // 3 shots: left, centre, right
  trailColor: 0x44ff44,
  buildProjectile: () => makeCube(0.18, 0x22dd44),
  speed: 8,
  damage: 14,
};

// boss_eagle — twin angled spike stars, golden/orange palette
const EAGLE_BOSS_CONFIG: BossAttackConfig = {
  cooldownRange: [1.2, 1.9],
  shotOffsets: [[-0.65, 0.1], [0.65, 0.1]],         // 2 shots from wing cannons
  trailColor: 0xff8800,
  buildProjectile: () => makeStar(0.2, 0xff6600),
  speed: 10,
  damage: 16,
};

// boss_leopard — crossing blade slashes + centre sphere, purple/magenta
const LEOPARD_BOSS_CONFIG: BossAttackConfig = {
  cooldownRange: [1.8, 2.6],
  shotOffsets: [[-1.0, 0.2], [0, 0], [1.0, 0.2]],  // blades from claws + centre
  trailColor: 0xcc44ff,
  buildProjectile: () => (Math.random() < 0.5 ? makeSlash(0xdd22ff) : makeRing(0xff44cc)),
  speed: 9,
  damage: 15,
};

const BOSS_CONFIGS: Partial<Record<EnemyType, BossAttackConfig>> = {
  boss_snake:   SNAKE_BOSS_CONFIG,
  boss_eagle:   EAGLE_BOSS_CONFIG,
  boss_leopard: LEOPARD_BOSS_CONFIG,
};

export function getBossConfig(type: EnemyType): BossAttackConfig {
  return BOSS_CONFIGS[type] ?? SNAKE_BOSS_CONFIG;
}

/** Spawn one burst of boss projectiles; returns the new Projectile array to add */
export function fireBossBurst(
  config: BossAttackConfig,
  bossPos: V3,
  bossRight: V3,
  bossUp: V3,
  toPlayer: V3,
): Array<{ proj: Projectile; trailColor: number }> {
  const dir = toPlayer.clone().normalize();
  const results: Array<{ proj: Projectile; trailColor: number }> = [];

  for (const [ox, oy] of config.shotOffsets) {
    const origin = bossPos.clone()
      .addScaledVector(bossRight, ox)
      .addScaledVector(bossUp, oy);

    // Spread: shots from wide offsets angle slightly inward toward player
    const spread = new THREE.Vector3(
      dir.x + (-ox * 0.04),
      dir.y + (-oy * 0.04),
      dir.z,
    ).normalize();

    const obj = config.buildProjectile();
    obj.position.copy(origin);

    const proj: Projectile = {
      mesh: obj as unknown as Mesh,
      velocity: spread.multiplyScalar(config.speed),
      type: 'vulcan',
      damage: config.damage,
      lifetime: 3.5,
    };

    results.push({ proj, trailColor: config.trailColor });
  }

  return results;
}
