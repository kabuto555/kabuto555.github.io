// Weapon system: vulcan, missile, beam rifle, beam sword
import { COLORS } from '../config';
import type { WeaponState, WeaponType } from '../types';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export const MAX_WEAPON_LEVEL = 5;

export interface HomingTarget {
  /** The enemy ship wrapper — has .root.position and .dead */
  ship: { root: { position: Vector3 }; dead: boolean };
  /** Snapshot of last known position — frozen when target dies */
  lastPos: Vector3;
}

export interface Projectile {
  mesh: Mesh | Group;
  velocity: Vector3;
  type: 'vulcan' | 'missile' | 'beam';
  damage: number;
  lifetime: number;
  homing?: HomingTarget | null;
  /** Missile arc: seconds remaining in upward launch phase */
  launchTimer?: number;
  /** Missile speed — accelerates during homing phase */
  missileSpeed?: number;
  /** Accumulated age in seconds — used for beam flash animation */
  age?: number;
}

export interface SwordState {
  active: boolean;
  swingCooldown: number;
  swingTimer: number;
  range: number;
  damage: number;
  attackRate: number;
}

// Geometry caches
let _vulcanGeo: InstanceType<typeof THREE.SphereGeometry> | null = null;
let _missileGeo: InstanceType<typeof THREE.CylinderGeometry> | null = null;
let _enemyShotGeo: InstanceType<typeof THREE.SphereGeometry> | null = null;

function getVulcanGeo(): InstanceType<typeof THREE.SphereGeometry> {
  if (!_vulcanGeo) _vulcanGeo = new THREE.SphereGeometry(0.07, 4, 3);
  return _vulcanGeo;
}

function getMissileGeo(): InstanceType<typeof THREE.CylinderGeometry> {
  // tip radius smaller than base, long axis Y — pre-rotated in mesh so tip faces +Z (forward)
  if (!_missileGeo) _missileGeo = new THREE.CylinderGeometry(0.04, 0.09, 0.38, 5);
  return _missileGeo;
}

function getBeamGeo(level: number): InstanceType<typeof THREE.BoxGeometry> {
  const thick = 0.05 + level * 0.04;
  const len = 1.2 + level * 0.6;
  return new THREE.BoxGeometry(thick, thick, len);
}

function getEnemyShotGeo(): InstanceType<typeof THREE.SphereGeometry> {
  if (!_enemyShotGeo) _enemyShotGeo = new THREE.SphereGeometry(0.12, 5, 4);
  return _enemyShotGeo;
}

export function getFireRate(weapon: WeaponState): number {
  switch (weapon.type) {
    case 'vulcan':  return 5;
    case 'missile': return 1.5 + weapon.level * 0.3;
    case 'beam':    return 1.5;
    case 'sword':   return 0;
    default: return 5;
  }
}

export function fireWeapon(
  weapon: WeaponState,
  origin: Vector3,
  forward: Vector3,
  damageMultiplier: number,
  nearestEnemy?: { root: { position: Vector3 }; dead: boolean } | null,
): Projectile[] {
  const shots: Projectile[] = [];

  if (weapon.type === 'vulcan') {
    // All shots fire perfectly straight — only spawn position is offset.
    // Lv1: 1 center. Lv2: center + right. Lv3: center + L/R. Lv4: + top. Lv5: + top/bottom.
    const OFFSETS: Array<[number, number]> = [
      [0, 0],                          // always: center
      [0.22, 0],                       // lv2: right
      [-0.22, 0],                      // lv3: left
      [0, 0.18],                       // lv4: top
      [0, -0.18],                      // lv5: bottom
    ];
    const count = weapon.level;
    for (let i = 0; i < count; i++) {
      const [ox, oy] = OFFSETS[i];
      const dir = forward.clone(); // all shots go dead straight
      const mesh = new THREE.Mesh(
        getVulcanGeo(),
        new THREE.MeshBasicMaterial({ color: COLORS.playerShot }),
      );
      mesh.position.copy(origin);
      mesh.position.x += ox;
      mesh.position.y += oy;
      shots.push({
        mesh,
        velocity: dir.clone().multiplyScalar(22),
        type: 'vulcan',
        damage: (8 + weapon.level * 2) * damageMultiplier,
        lifetime: 1.2,
      });
    }
  }

  if (weapon.type === 'missile') {
    // Only fire if there's a lock-on target
    if (!nearestEnemy) return shots;
    const count = weapon.level;
    const spread = (weapon.level - 1) * 0.28;
    for (let i = 0; i < count; i++) {
      const angle = (i - (count - 1) / 2) * spread;
      const mesh = new THREE.Mesh(
        getMissileGeo(),
        new THREE.MeshBasicMaterial({ color: COLORS.playerMissile }),
      );
      mesh.position.copy(origin);
      // Spread on spawn position
      mesh.position.x += Math.sin(angle) * 0.45;

      // Launch phase: fire upward + slightly forward, slow speed
      const launchVel = new THREE.Vector3(
        Math.sin(angle) * 1.5,  // spread
        3,                       // gentle upward kick (halved)
        forward.z * 3,           // gentle forward push
      );
      const initSpeed = 8;
      shots.push({
        mesh,
        velocity: launchVel.normalize().multiplyScalar(initSpeed),
        type: 'missile',
        damage: (4 + weapon.level * 1) * damageMultiplier,
        lifetime: 2.0,
        launchTimer: 0.35,       // 0.35s upward arc before homing kicks in
        missileSpeed: initSpeed,
        homing: nearestEnemy
          ? { ship: nearestEnemy, lastPos: nearestEnemy.root.position.clone() }
          : null,
      });
    }
  }

  if (weapon.type === 'beam') {
    const mesh = new THREE.Mesh(
      getBeamGeo(weapon.level),
      new THREE.MeshBasicMaterial({ color: COLORS.playerBeam, transparent: true, opacity: 0.9 }),
    );
    mesh.position.copy(origin);
    const vel = forward.clone().multiplyScalar(55);
    shots.push({
      mesh,
      velocity: vel,
      type: 'beam',
      damage: (30 + weapon.level * 10) * damageMultiplier,
      lifetime: 0.5,
      age: 0,
    });
  }

  return shots;
}

export function createSwordState(level: number): SwordState {
  return {
    active: true,
    swingCooldown: 0,
    swingTimer: 0,
    range: 1.2 + level * 0.2,
    damage: (25 + level * 8),
    attackRate: 1.0 + level * 0.1,
  };
}

export function spawnEnemyShot(origin: Vector3, toward: Vector3): Projectile {
  const mesh = new THREE.Mesh(
    getEnemyShotGeo(),
    new THREE.MeshBasicMaterial({ color: COLORS.enemyShot }),
  );
  mesh.position.copy(origin);
  const vel = toward.clone().normalize().multiplyScalar(7);
  return { mesh, velocity: vel, type: 'vulcan', damage: 18, lifetime: 3.0 };
}

export function updateProjectile(proj: Projectile, dt: number): boolean {
  proj.lifetime -= dt;
  if (proj.lifetime <= 0) return false;

  if (proj.type === 'missile') {
    if (proj.launchTimer !== undefined && proj.launchTimer > 0) {
      // Launch phase: coast upward, no steering
      proj.launchTimer -= dt;
    } else if (proj.homing) {
      // Homing phase: update snapshot, accelerate, steer hard toward target
      const h = proj.homing;
      if (!h.ship.dead) h.lastPos.copy(h.ship.root.position);

      const toTarget = h.lastPos.clone().sub(proj.mesh.position);
      const dist = toTarget.length();

      // If target is dead and we've reached last known pos, detonate
      if (h.ship.dead && dist < 1.5) {
        return false; // caller handles explosion
      } else if (dist > 0.1) {
        toTarget.divideScalar(dist);
        if (proj.missileSpeed !== undefined) {
          proj.missileSpeed = Math.min(proj.missileSpeed + 18 * dt, 22);
        }
        const speed = proj.missileSpeed ?? proj.velocity.length();
        const steer = 1 - Math.exp(-7 * dt);
        proj.velocity.lerp(toTarget.multiplyScalar(speed), steer);
      }
    }

    // Orient: missile mesh was pre-rotated so +Y is tip/front.
    // We need the mesh's +Y axis to point along velocity.
    // lookAt points +Z toward target; undo the -90° X pre-rotation by
    // setting quaternion from the velocity direction directly.
    if (proj.velocity.lengthSq() > 0.01) {
      const dir = proj.velocity.clone().normalize();
      // Build quaternion that rotates +Y onto dir
      const up = new THREE.Vector3(0, 1, 0);
      proj.mesh.quaternion.setFromUnitVectors(up, dir);
    }
  }

  proj.mesh.position.addScaledVector(proj.velocity, dt);

  if (proj.type === 'beam') {
    proj.mesh.lookAt(proj.mesh.position.clone().add(proj.velocity));
    // Flash between beam color and white at ~18Hz
    if (proj.age !== undefined) {
      proj.age += dt;
      const flash = Math.sin(proj.age * 110) > 0;
      const mat = (proj.mesh as InstanceType<typeof THREE.Mesh>).material as InstanceType<typeof THREE.MeshBasicMaterial>;
      mat.color.setHex(flash ? 0xffffff : COLORS.playerBeam);
    }
  }

  return true;
}

export function weaponLabel(w: WeaponState): string {
  const names: Record<WeaponType, string> = {
    vulcan: 'VULCAN',
    missile: 'MISSILE',
    beam: 'BEAM',
    sword: 'SWORD',
  };
  return `${names[w.type]} Lv${w.level}`;
}
