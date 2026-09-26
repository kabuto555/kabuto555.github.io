// Core game loop logic — collision, hit detection, state transitions
import type { PlayerState, WeaponState } from '../types';
import type { EnemyShip } from '../entities/enemies';
import type { Pickup } from './pickups';
import type { Projectile } from './weapons';
import { MAX_WEAPON_LEVEL } from './weapons';
import type { Stage } from './stage';

type Vector3 = InstanceType<typeof THREE.Vector3>;

const EXP_PER_LEVEL = 60;        // faster first level-up
const LEVEL_DAMAGE_BONUS = 0.08; // 8% dmg per level
const LEVEL_HP_BONUS = 20;       // +20 max HP per level

// ── Default player state ────────────────────────────────────────────────────
export function createPlayerState(): PlayerState {
  return {
    hp: 100,
    maxHp: 100,
    level: 1,
    exp: 0,
    expToNext: EXP_PER_LEVEL,
    score: 0,
    weapons: [{ type: 'vulcan', level: 1 }],
    activeWeaponIndex: 0,
    invincibleTimer: 0,
    damageMultiplier: 1,
  };
}

// ── Weapon upgrade / pickup logic ───────────────────────────────────────────
export function applyWeaponPickup(player: PlayerState, kind: string): { leveled: boolean; expGained: number } {
  if (kind === 'health') return { leveled: false, expGained: 0 };

  const wType = kind as WeaponState['type'];
  const existing = player.weapons.find(w => w.type === wType);

  if (existing) {
    if (existing.level >= MAX_WEAPON_LEVEL) {
      // Already maxed — give EXP instead
      const gained = 30;
      player.exp += gained;
      return { leveled: false, expGained: gained };
    }
    existing.level += 1;
    return { leveled: true, expGained: 0 };
  }

  // New weapon type — add it (keep up to 4 slots)
  if (player.weapons.length < 4) {
    player.weapons.push({ type: wType, level: 1 });
  }
  return { leveled: true, expGained: 0 };
}

// ── Player takes damage ─────────────────────────────────────────────────────
export function applyDamageToPlayer(player: PlayerState, dmg: number): { downgraded: boolean } {
  if (player.invincibleTimer > 0) return { downgraded: false };

  player.hp -= dmg;
  player.invincibleTimer = 1.2; // 1.2 seconds of i-frames

  // Downgrade check: below 33% HP remaining after a single heavy hit
  const downgradeThreshold = player.maxHp * 0.3;
  if (player.hp <= downgradeThreshold && player.weapons.length > 0) {
    const primary = player.weapons[player.activeWeaponIndex];
    if (primary && primary.level > 1) {
      primary.level -= 1;
      return { downgraded: true };
    }
  }
  return { downgraded: false };
}

// ── Gain EXP and level up ───────────────────────────────────────────────────
export function gainExp(player: PlayerState, amount: number): boolean {
  player.exp += amount;
  if (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.expToNext = Math.floor(EXP_PER_LEVEL * Math.pow(1.18, player.level - 1));
    player.maxHp += LEVEL_HP_BONUS;
    player.hp = Math.min(player.hp + LEVEL_HP_BONUS, player.maxHp);
    player.damageMultiplier = 1 + (player.level - 1) * LEVEL_DAMAGE_BONUS;
    return true; // leveled up
  }
  return false;
}

// ── Sphere-sphere collision test ────────────────────────────────────────────
export function sphereCollides(aPos: Vector3, aRadius: number, bPos: Vector3, bRadius: number): boolean {
  return aPos.distanceToSquared(bPos) < (aRadius + bRadius) ** 2;
}

// ── Hit test: projectile vs enemy ───────────────────────────────────────────
export function testProjectileEnemy(proj: Projectile, enemy: EnemyShip): {
  hit: boolean;
  isWeakPoint: boolean;
} {
  const hitRadius = proj.type === 'beam' ? 0.4 : 0.25;
  const enemyRadius = enemy.isBoss ? 1.2 : 0.7;
  const pPos = proj.mesh.position;
  const ePos = enemy.root.position;

  // Check weak points FIRST — their hitbox takes priority over the body sphere.
  // This prevents the large body collider from obscuring weak point hits.
  for (const wp of enemy.weakPoints) {
    const wpWorld = new THREE.Vector3();
    wp.getWorldPosition(wpWorld);
    if (sphereCollides(pPos, hitRadius, wpWorld, 0.45)) {
      return { hit: true, isWeakPoint: true };
    }
  }

  // Fall back to body hit
  if (!sphereCollides(pPos, hitRadius, ePos, enemyRadius)) {
    return { hit: false, isWeakPoint: false };
  }

  return { hit: true, isWeakPoint: false };
}

// ── Hit test: player vs enemy projectile ────────────────────────────────────
export function testEnemyShotPlayer(proj: Projectile, playerPos: Vector3): boolean {
  return sphereCollides(proj.mesh.position, 0.2, playerPos, 0.6);
}

// ── Hit test: player vs pickup ───────────────────────────────────────────────
export function testPickupPlayer(pickup: Pickup, playerPos: Vector3): boolean {
  return sphereCollides(pickup.root.position, 0.4, playerPos, 0.7);
}

// ── Apply hit to enemy ───────────────────────────────────────────────────────
export function applyDamageToEnemy(
  enemy: EnemyShip,
  damage: number,
  isWeakPoint: boolean,
): { killed: boolean; expGained: number } {
  const actualDmg = (enemy.isBoss && isWeakPoint) ? damage * 4 : damage;
  enemy.hp -= actualDmg;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    const exp = enemy.isBoss ? 80 : (enemy.type === 'leopard' ? 20 : 12);
    return { killed: true, expGained: exp };
  }
  return { killed: false, expGained: 0 };
}

// ── Sword swing hit test (area effect) ──────────────────────────────────────
export function testSwordEnemies(
  playerPos: Vector3,
  swordRange: number,
  stage: Stage,
): EnemyShip[] {
  const hits: EnemyShip[] = [];
  const allEnemies = [...stage.enemies, ...(stage.boss && !stage.boss.dead ? [stage.boss] : [])];
  for (const enemy of allEnemies) {
    if (enemy.dead) continue;
    if (playerPos.distanceTo(enemy.root.position) <= swordRange) {
      hits.push(enemy);
    }
  }
  return hits;
}
