// Procedural stage generator — spawns enemies, obstacles, and pickups along a rail
import { generateRail, type Rail } from './rail';
import { createEnemy, type EnemyShip, type EnemyType } from '../entities/enemies';
import { createPickup, type Pickup, type PickupKind } from './pickups';
import { WORLD_THEMES, type WorldTheme } from './themes';

type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;

export interface Obstacle {
  root: Group | Mesh;
  spawnT: number;
  offsetX: number;
  offsetY: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  scaleProgress: number;
}

export interface Stage {
  index: number;
  themeIndex: number;  // which WORLD_THEMES slot was chosen (for music track selection)
  theme: WorldTheme;
  rail: Rail;
  enemies: EnemyShip[];
  pickups: Pickup[];
  obstacles: Obstacle[];
  boss: EnemyShip | null;
  bossDefeated: boolean;
}

const ENEMY_TYPES: EnemyType[] = ['snake', 'eagle', 'leopard'];
const PICKUP_KINDS: PickupKind[] = ['health', 'vulcan', 'missile', 'beam', 'sword'];

// Obstacle building is now delegated to the stage's WorldTheme

export function generateStage(index: number): Stage {
  const rail = generateRail(index);
  // Pick a fully random theme each run — not tied to stage index
  const themeIndex = Math.floor(Math.random() * WORLD_THEMES.length);
  const theme = WORLD_THEMES[themeIndex];

  const enemies: EnemyShip[] = [];
  const pickups: Pickup[] = [];
  const obstacles: Obstacle[] = [];

  // Enemy density increases with stage
  const enemyCount = 6 + index * 2;
  // Keep enemies off the very start of the rail. The fly-in trigger adds its own
  // lead time on top, but we still need a floor so enemies don’t cluster at t≈0
  // and fire immediately as the stage begins.
  const ENEMY_MIN_T = 0.25;
  const ENEMY_MAX_T = 0.83;
  for (let i = 0; i < enemyCount; i++) {
    const t = ENEMY_MIN_T + Math.random() * Math.max(0, ENEMY_MAX_T - ENEMY_MIN_T);
    const type = ENEMY_TYPES[Math.floor(Math.random() * 3)];
    const ox = (Math.random() - 0.5) * 5;
    const oy = (Math.random() - 0.5) * 2.5;
    enemies.push(createEnemy(type, t, ox, oy, index));
  }

  // Pickups: ~4–6 per stage
  const pickupCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < pickupCount; i++) {
    const t = 0.1 + Math.random() * 0.75;
    const kind = PICKUP_KINDS[Math.floor(Math.random() * PICKUP_KINDS.length)];
    // Bias toward health early
    const actualKind: PickupKind = (i === 0) ? 'health' : kind;
    const ox = (Math.random() - 0.5) * 4;
    const oy = (Math.random() - 0.5) * 2;
    pickups.push(createPickup(actualKind, t, ox, oy));
  }

  // Asteroid obstacles: 8–14 per stage
  // Use the same safe zone as enemies so nothing spawns at the start.
  const obsCount = 8 + Math.floor(Math.random() * 6);
  for (let i = 0; i < obsCount; i++) {
    const t = ENEMY_MIN_T + Math.random() * Math.max(0, 0.85 - ENEMY_MIN_T);
    const ox = (Math.random() - 0.5) * 6;
    const oy = (Math.random() - 0.5) * 3;
    const size = 0.3 + Math.random() * 0.5;
    const mesh = theme.buildObstacle(size);
    // Scale obstacle HP with stage (same exponent as enemies)
    const obsStageScale = Math.pow(1.45, index);
    const hp = Math.round((30 + size * 60) * obsStageScale);
    obstacles.push({ root: mesh, spawnT: t, offsetX: ox, offsetY: oy, hp, maxHp: hp, dead: false, scaleProgress: 0 });
  }

  // Fruit obstacles: 4–7 per stage, scattered throughout
  const fruitCount = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < fruitCount; i++) {
    const t = ENEMY_MIN_T + Math.random() * Math.max(0, 0.85 - ENEMY_MIN_T);
    const ox = (Math.random() - 0.5) * 6;
    const oy = (Math.random() - 0.5) * 3;
    const size = 0.25 + Math.random() * 0.3; // fruits are slightly smaller than other obstacles
    const mesh = theme.buildFruit(size);
    const obsStageScale = Math.pow(1.45, index);
    const hp = Math.round((20 + size * 40) * obsStageScale);
    obstacles.push({ root: mesh, spawnT: t, offsetX: ox, offsetY: oy, hp, maxHp: hp, dead: false, scaleProgress: 0 });
  }

  // Boss at t=0.92 — random boss type each stage
  const bossTypes: EnemyType[] = ['boss_snake', 'boss_eagle', 'boss_leopard'];
  const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
  const boss = createEnemy(bossType, 0.92, 0, 0, index);

  return { index, themeIndex, theme, rail, enemies, pickups, obstacles, boss, bossDefeated: false };
}

/**
 * Create a single easy enemy for impromptu (no-enemies-on-screen) spawning.
 * spawnT is set to the current railT so it appears right in front of the player.
 */
export function createImpromptuEnemy(atRailT: number, stageIndex: number): EnemyShip {
  const types: EnemyType[] = ['snake', 'eagle', 'leopard'];
  const type = types[Math.floor(Math.random() * 3)];
  const ox = (Math.random() - 0.5) * 4;
  const oy = (Math.random() - 0.5) * 2;
  // Stage 0 HP regardless of stage so it's always easy
  return createEnemy(type, atRailT, ox, oy, 0);
}

/** Compute the world position for a stage entity at its rail-relative location */
export function getEntityPosition(
  stage: Stage,
  spawnT: number,
  offsetX: number,
  offsetY: number,
): InstanceType<typeof THREE.Vector3> {
  const { curve } = stage.rail;
  const t = Math.max(0, Math.min(1, spawnT));
  const pt = curve.getPointAt(t);
  const fwd = curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fwd, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  pt.addScaledVector(right, offsetX);
  pt.addScaledVector(up, offsetY);
  return pt;
}
