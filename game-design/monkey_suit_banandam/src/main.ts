import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { configureRenderer, createLightingRig, observeContainerResize } from './scene';
import { hardenGestures, hardenViewport } from './gesture-hardening';
import { KeyboardInput } from './input';

import { createPlayerShip, animatePlayerShip, getMuzzlePosition } from './entities/player';
import { generateStage, createImpromptuEnemy, type Stage } from './systems/stage';
import {
  createInitialTrack, appendStage, pruneOldSegments,
  getWorldPosition, getWorldBasis, getEntityWorldPosition, resolveCurrentSegment, isInGap,
  type WorldTrack, type TrackSegment,
} from './systems/worldTrack';
import { animateEnemy, animateWeakPoints, getEnemyMeshes } from './entities/enemies';
import {
  fireWeapon, updateProjectile, spawnEnemyShot,
  createSwordState, type Projectile, type SwordState,
} from './systems/weapons';
import { getBossConfig, fireBossBurst } from './systems/bossAttacks';
import { animatePickup, updatePickupMagnet } from './systems/pickups';
import { createStarfield, updateStarfield } from './systems/starfield';
import { startAudio, beginMusic, playThemeTrack, pauseMusic, resumeMusic, restartMusic, duckMusic, unduckMusic } from './systems/music';
import { initSfx, sfxShoot, sfxEnemyHit, sfxEnemyDie, sfxPlayerHurt, sfxPickup, sfxBoost, sfxLevelUp, sfxCriticalHit } from './systems/sfx';
import { startEpicExplosion, type EpicExplosion } from './systems/epicExplosion';
import { getTheme, type WorldTheme } from './systems/themes';
import { createDragInput } from './systems/dragInput';
import { createRecoilState, applyRecoilKick, updateRecoil, applyRecoilRotation, type RecoilState } from './systems/recoil';
import {
  createPlayerState, applyDamageToPlayer, gainExp,
  applyWeaponPickup, applyDamageToEnemy,
  testProjectileEnemy, testEnemyShotPlayer, testPickupPlayer, testSwordEnemies,
} from './systems/gameloop';
import {
  createHud, updateHud, updateBoostHud, showBossBar, hideBossBar,
  showOverlay, hideOverlay, type HudElements,
} from './ui/hud';
import { createTitleScreen, applyHeroPose, animateHeroPose, type TitleScreen } from './ui/titleScreen';
import { spawnDamageNumber, spawnXpFloat, spawnLevelUpBanner, spawnPickupBanner, updateDamageNumbers } from './ui/damageNumbers';
import type { GameState } from './types';
import {
  spawnObstacleSpark, spawnObstacleDebris, spawnSwordArc,
  spawnEnemyHitBurst, spawnEnemyDeathBurst,
  spawnHitFlash, updateEffects, emitSmokePuff,
} from './systems/effects';
import {
  createBulletTrail, updateBulletTrail, removeBulletTrail,
  type BulletTrail,
} from './systems/bulletTrails';
import { spawnBoostStreaks, updateBoostStreaks, clearBoostStreaks } from './systems/boostStreaks';

type V3 = import('three').Vector3;
type Obj3D = import('three').Object3D;

// CSS color per projectile type — matches the MeshBasicMaterial colors used in weapons.ts
const PROJ_COLOR: Record<string, string> = {
  vulcan:  '#00ffff',
  missile: '#ff8800',
  beam:    '#ff00ff',
};

hardenViewport();
hardenGestures();

// ── Renderer ────────────────────────────────────────────────────────────────
const container = document.getElementById('game');
if (!container) throw new Error('#game container not found');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
configureRenderer(renderer);
renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
container.appendChild(renderer.domElement);

// ── Scene & camera ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
scene.fog = new THREE.FogExp2(COLORS.background, 0.028);

// ── Theme tween ───────────────────────────────────────────────────────────────
const _skyColor  = new THREE.Color(COLORS.background);
const _starColor = new THREE.Color(0xffffff);
let   _fogDensity = 0.028;
const THEME_TWEEN_K = 1.2;

function applyTheme(theme: WorldTheme, alpha: number): void {
  _skyColor.lerp(new THREE.Color(theme.skyColor), alpha);
  _starColor.lerp(new THREE.Color(theme.starColor), alpha);
  _fogDensity += (theme.fogDensity - _fogDensity) * alpha;
  (scene.background as InstanceType<typeof THREE.Color>).copy(_skyColor);
  (scene.fog as InstanceType<typeof THREE.FogExp2>).color.copy(_skyColor);
  (scene.fog as InstanceType<typeof THREE.FogExp2>).density = _fogDensity;
  const starMat = starfield.points.material as InstanceType<typeof THREE.PointsMaterial>;
  starMat.color.copy(_starColor);
  starMat.opacity = theme.starOpacity;
}

const camera = new THREE.PerspectiveCamera(55, GAME_WIDTH / GAME_HEIGHT, 0.1, 300);
observeContainerResize(container, renderer, camera);

createLightingRig(scene, 20);

// ── Starfield ─────────────────────────────────────────────────────────────────
const starfield = createStarfield(1400);
(starfield.points.material as InstanceType<typeof THREE.PointsMaterial>).fog = false;
scene.add(starfield.points);

// ── Target reticle ────────────────────────────────────────────────────────────
// A ring floating ahead of the player to show where shots are aimed.
const reticleGroup = new THREE.Group();
const reticleRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.28, 0.03, 6, 24),
  new THREE.MeshBasicMaterial({ color: 0xff2222 }),
);
const reticleCross = new THREE.Mesh(
  new THREE.PlaneGeometry(0.55, 0.03),
  new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide }),
);
const reticleCrossV = new THREE.Mesh(
  new THREE.PlaneGeometry(0.03, 0.55),
  new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide }),
);
reticleGroup.add(reticleRing);
reticleGroup.add(reticleCross);
reticleGroup.add(reticleCrossV);
scene.add(reticleGroup);

// Smoothed aim offset — follows input velocity, springs back to zero at rest
let reticleAimX = 0;
let reticleAimY = 0;
// Raw input velocity captured each frame before drag delta is consumed
let rawInputX = 0;
let rawInputY = 0;

// ── Player ship ───────────────────────────────────────────────────────────────
const playerShip = createPlayerShip();
scene.add(playerShip.root);

// Store original mesh colors for hurt-flash restore
const playerOrigColors = new Map<InstanceType<typeof THREE.Mesh>, number>();
playerShip.root.traverse((child) => {
  const mesh = child as InstanceType<typeof THREE.Mesh>;
  if (!mesh.isMesh) return;
  const mat = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>;
  if (mat.color) playerOrigColors.set(mesh, mat.color.getHex());
});

// ── Input ──────────────────────────────────────────────────────────────────────
const keyboard = new KeyboardInput();
const drag = createDragInput(renderer.domElement);

// Start audio on first user gesture (Web Audio API requires it)
{
  let _audioStarted = false;
  const _startOnGesture = async () => {
    if (_audioStarted) return;
    _audioStarted = true;
    await startAudio();
    initSfx();
    playThemeTrack(currentStage.themeIndex); // queue the current stage's track before beginMusic
    beginMusic();
  };
  renderer.domElement.addEventListener('pointerdown', _startOnGesture, { once: true });
  window.addEventListener('keydown', _startOnGesture as any, { once: true });
}

// ── HUD ────────────────────────────────────────────────────────────────────────
const hud: HudElements = createHud(container);

// ── Title screen ───────────────────────────────────────────────────────────────
let titleScreen: TitleScreen | null = createTitleScreen(container);

function dismissTitle(): void {
  if (!titleScreen) return;
  titleScreen.dismiss(() => {
    gameState.phase = 'playing';
    titleScreen = null;
  });
}

titleScreen.root.addEventListener('pointerdown', () => dismissTitle(), { once: true });
window.addEventListener('keydown', () => dismissTitle(), { once: true });

// ── Game state ─────────────────────────────────────────────────────────────────
const gameState: GameState = {
  phase: 'title',
  stageIndex: 0,
  player: createPlayerState(),
};

// ── World track & stage management ───────────────────────────────────────────
const _stage0 = generateStage(0);
const _stage1 = generateStage(1);
let worldTrack: WorldTrack = createInitialTrack(_stage0, _stage1);
// activeStages mirrors the stage segments in worldTrack in insertion order
let activeStages: Stage[] = [_stage0, _stage1];
// The stage the player is currently on (used for enemy/pickup/obstacle queries)
let currentStage: Stage = _stage0;
// Index of the next stage to generate when we need to append
let nextStageIndex = 2;

const playerProjectiles: Projectile[] = [];
const enemyProjectiles: Projectile[] = [];
// Trail per enemy projectile (parallel array, same indices)
const enemyProjectileTrails: (BulletTrail | null)[] = [];

let swordState: SwordState | null = null;
let swordSwingCooldown = 0;

// Sword swing animation state
interface SwordAnimState {
  phase: 'raise' | 'slash' | 'recover';
  timer: number;        // seconds into current phase
  targetDir: InstanceType<typeof THREE.Vector3> | null;
}
let swordAnim: SwordAnimState | null = null;
const SWORD_RAISE_T  = 0.12;  // seconds to raise blade
const SWORD_SLASH_T  = 0.10;  // seconds for the slash itself
const SWORD_RECOVER_T = 0.12; // seconds to recover

let worldDist = 0;             // player's position along the world track (world units)
const RAIL_SPEED = 0.045;      // fraction-of-stage-length per second baseline
const BASE_STAGE_LENGTH = 80;  // matches generateRail stage 0 length for speed calibration
// Smoothed forward/right/up — exponentially tracks raw rail basis to hide segment-boundary snaps
let smoothForward = new THREE.Vector3(0, 0, -1);
let smoothRight   = new THREE.Vector3(1, 0, 0);
let smoothUp      = new THREE.Vector3(0, 1, 0);
const BASIS_SMOOTH_K = 12; // higher = tighter tracking, lower = more lag

// Impromptu enemies (fly-in when no enemies on screen)
const impromptuEnemies: import('./entities/enemies').EnemyShip[] = [];
let impromptuSpawnCooldown = 0;

// Active epic explosion (blocks game logic while playing)
let activeExplosion: EpicExplosion | null = null; // seconds until next impromptu spawn is allowed

// Boost system
const BOOST_DURATION  = 1.8;   // seconds of boosted speed
const BOOST_COOLDOWN  = 4.0;   // seconds before boost is available again
const BOOST_MULTIPLIER = 3.2;  // rail speed multiplier during boost
let boostTimer    = 0;         // counts down while boosting
let boostCooldown = 0;         // counts down during cooldown
let boostFactor   = 1.0;       // smoothed, 1=normal, BOOST_MULTIPLIER=full boost
// Double-key detection for WASD boost
const _keyLastPress = new Map<string, number>();
const DOUBLE_KEY_MS = 250;

let playerOffsetX = 0;
let playerOffsetY = 0;
const MAX_OFFSET_X = 3.8;
const MAX_OFFSET_Y = 2.2;
const OFFSET_LERP = 8;

let targetOffsetX = 0;
let targetOffsetY = 0;

// Per-weapon fire timers so each weapon fires at its own independent rate
const shootTimers = new Map<string, number>();

// Recoil states
const playerRecoil = createRecoilState();
const enemyRecoilMap = new WeakMap<object, RecoilState>();

function getEnemyRecoil(enemy: { shakeGroup: object }): RecoilState {
  let r = enemyRecoilMap.get(enemy.shakeGroup);
  if (!r) { r = createRecoilState(); enemyRecoilMap.set(enemy.shakeGroup, r); }
  return r;
}

/** Trigger a visible hit-shake on an enemy's shakeGroup. */
function shakeEnemy(
  enemy: import('./entities/enemies').EnemyShip,
  isWeakPoint: boolean,
): void {
  if (enemy.isBoss && !isWeakPoint) return;
  // Reset timer so the shake animation plays from the start
  enemy.shakeTimer = enemy.shakeMax;
}
let elapsed = 0;

// Smoothed vernier input — drives thruster tilt and flame intensity
let vernierInputX = 0; // -1..1 lateral
let vernierInputY = 0; // -1..1 vertical
let prevOffsetX = 0;
let prevOffsetY = 0;

// Hurt state — flash red + shake when taking damage
const HURT_DURATION = 1.2; // seconds (matches invincibility timer)
let hurtTimer = 0;         // counts down from HURT_DURATION

function triggerHurt(damage: number): void {
  const { downgraded } = applyDamageToPlayer(gameState.player, damage);
  if (downgraded || gameState.player.invincibleTimer <= 0.01) return; // i-frames already active
  hurtTimer = HURT_DURATION;
  void downgraded; // suppress unused warning
}

function triggerHurtDirect(damage: number): void {
  // Used for collision damage — only triggers if not invincible
  if (gameState.player.invincibleTimer > 0) return;
  applyDamageToPlayer(gameState.player, damage);
  hurtTimer = HURT_DURATION;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Find the TrackSegment that owns this stage */
function segmentForStage(stage: Stage): TrackSegment | null {
  return worldTrack.segments.find(s => s.stage === stage) ?? null;
}
// (TrackSegment.stage is now always a Stage, never null)

function addStageObjects(stage: Stage, grantIframes = false): void {
  // Boss added immediately at world position; regular enemies fly in on demand.
  if (stage.boss && !stage.boss.dead) {
    scene.add(stage.boss.root);
    stage.boss.inScene = true;
    stage.boss.flyIn = 'arrived';
  }
  for (const p of stage.pickups) scene.add(p.root);
  for (const o of stage.obstacles) scene.add(o.root as Obj3D);
  if (grantIframes) {
    gameState.player.invincibleTimer = Math.max(gameState.player.invincibleTimer, 2.5);
  }
}

function removeStageObjects(stage: Stage): void {
  for (const e of stage.enemies) {
    if (e.inScene) { scene.remove(e.root); e.inScene = false; }
  }
  if (stage.boss && stage.boss.inScene) { scene.remove(stage.boss.root); stage.boss.inScene = false; }
  for (const p of stage.pickups) scene.remove(p.root);
  for (const o of stage.obstacles) scene.remove(o.root as Obj3D);
}

function placeEntityOnSegment(obj: Obj3D, seg: TrackSegment, spawnT: number, ox: number, oy: number): void {
  obj.position.copy(getEntityWorldPosition(seg, spawnT, ox, oy));
}

// Add all initially active stages
for (const s of activeStages) addStageObjects(s, true);

// ── Input reading ──────────────────────────────────────────────────────────────
const DRAG_SENSITIVITY = 0.008;

function readInput(dt: number): void {
  const dragDX = drag.state.active ? drag.state.deltaX * DRAG_SENSITIVITY : 0;
  const dragDY = drag.state.active ? -drag.state.deltaY * DRAG_SENSITIVITY : 0;

  // Capture normalised input velocity for reticle BEFORE zeroing the delta
  const kv = keyboard.getMoveVector();
  if (drag.state.active && (drag.state.deltaX !== 0 || drag.state.deltaY !== 0)) {
    // Convert drag pixels to a -1..1 range using a reference of ~80px = full deflection
    rawInputX = Math.max(-1, Math.min(1, drag.state.deltaX / 12));
    rawInputY = Math.max(-1, Math.min(1, -drag.state.deltaY / 12));
  } else {
    rawInputX = kv.x;
    rawInputY = -kv.y;
  }

  if (drag.state.active) {
    drag.state.startX = drag.state.currentX;
    drag.state.startY = drag.state.currentY;
    drag.state.deltaX = 0;
    drag.state.deltaY = 0;
  }

  // Boost trigger: double-tap (touch) or double-press any movement key (desktop)
  if (drag.state.doubleTapped) {
    drag.state.doubleTapped = false;
    tryActivateBoost();
  }
  // Keyboard double-press detection
  const boostKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  for (const code of boostKeys) {
    if (keyboard.isDown(code)) {
      const last = _keyLastPress.get(code) ?? -9999;
      const now = performance.now();
      if (now - last < DOUBLE_KEY_MS && last > 0) {
        tryActivateBoost();
        _keyLastPress.set(code, -9999); // consume
      } else if (last < 0 || now - last > DOUBLE_KEY_MS) {
        _keyLastPress.set(code, now);
      }
    }
  }

  const kx = kv.x * 4 * dt;
  const ky = -kv.y * 4 * dt;

  targetOffsetX = Math.max(-MAX_OFFSET_X, Math.min(MAX_OFFSET_X, targetOffsetX + dragDX + kx));
  targetOffsetY = Math.max(-MAX_OFFSET_Y, Math.min(MAX_OFFSET_Y, targetOffsetY + dragDY + ky));
}

function tryActivateBoost(): void {
  if (boostTimer > 0 || boostCooldown > 0) return; // already boosting or on cooldown
  boostTimer = BOOST_DURATION;
  boostCooldown = BOOST_COOLDOWN;
  sfxBoost();
  duckMusic(0.28, 0.12); // snap BGM down quickly on boost hit
}

// ── Shooting ───────────────────────────────────────────────────────────────────
// All collected weapons fire simultaneously, each at its own fire rate.
function doShooting(dt: number, playerPos: V3, forward: V3): void {
  const player = gameState.player;

  // Find the nearest living enemy ahead of the player (for missile lock-on)
  const allEnemies = [
    ...activeStages.flatMap(s => s.enemies),
    ...impromptuEnemies,
    ...activeStages.flatMap(s => s.boss && !s.boss.dead ? [s.boss] : []),
  ].filter(e => !e.dead && e.inScene);
  const MISSILE_LOCK_RANGE = 18;
  let nearestEnemy: typeof allEnemies[0] | null = null;
  let nearestDist = Infinity;
  for (const e of allEnemies) {
    const d = playerPos.distanceTo(e.root.position);
    if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
  }
  // No target in range — missiles don't fire
  const missileTarget = (nearestEnemy && nearestDist <= MISSILE_LOCK_RANGE) ? nearestEnemy : null;

  for (const weapon of player.weapons) {
    if (weapon.type === 'sword') continue;

    const fireRate = weapon.type === 'vulcan' ? 5
                   : weapon.type === 'missile' ? (1.5 + weapon.level * 0.3)
                   : 1.5; // beam
    const key = weapon.type;
    const timer = (shootTimers.get(key) ?? 0) + dt;
    const fireInterval = 1 / fireRate;
    if (timer >= fireInterval) {
      shootTimers.set(key, timer - fireInterval);
      // Fire from the weapon's muzzle point on the model
      const muzzlePos = getMuzzlePosition(playerShip, weapon.type);
      const shots = fireWeapon(
        weapon, muzzlePos, forward.clone(), player.damageMultiplier,
        weapon.type === 'missile' ? missileTarget : null,
      );
      for (const s of shots) {
        scene.add(s.mesh);
        playerProjectiles.push(s);
      }
      sfxShoot(weapon.type);
      // Recoil: push back along forward + pitch nose up + random roll
      // Values are noticeable but not nauseating
      const wt = weapon.type as string;
      const posStrength = wt === 'beam'    ? 0.55
                        : wt === 'missile' ? 0.70
                        : wt === 'sword'   ? 0.30
                        : 0.22; // vulcan
      const pitchKick  = wt === 'beam'    ? -0.18
                        : wt === 'missile' ? -0.24
                        : wt === 'sword'   ? -0.12
                        : -0.07;
      const rollKick   = (Math.random() - 0.5) * (weapon.type === 'missile' ? 0.14 : 0.06);
      const posDir = forward.clone().multiplyScalar(posStrength);
      applyRecoilKick(playerRecoil, posDir, { x: pitchKick, z: rollKick });
    } else {
      shootTimers.set(key, timer);
    }
  }
}

// ── Sword attack ───────────────────────────────────────────────────────────────
function doSword(dt: number, playerPos: V3, aimDir: V3): void {
  if (!swordState) return;

  if (swordAnim === null) swordSwingCooldown -= dt;

  if (swordSwingCooldown <= 0 && swordAnim === null) {
    swordSwingCooldown = 1 / swordState.attackRate;
    const allNear = [
      ...activeStages.flatMap(s => s.enemies),
      ...impromptuEnemies,
      ...activeStages.flatMap(s => s.boss && !s.boss.dead ? [s.boss] : []),
    ].filter(e => !e.dead && e.inScene && playerPos.distanceTo(e.root.position) <= swordState!.range);
    let targetDir = aimDir.clone();
    if (allNear.length > 0) {
      const nearest = allNear.reduce((a, b) =>
        playerPos.distanceTo(a.root.position) < playerPos.distanceTo(b.root.position) ? a : b);
      targetDir = nearest.root.position.clone().sub(playerPos).normalize();
    }
    swordAnim = { phase: 'raise', timer: 0, targetDir };
  }

  if (swordAnim !== null) {
    swordAnim.timer += dt;
    const { phase, timer, targetDir } = swordAnim;

    if (phase === 'raise') {
      const t = Math.min(1, timer / SWORD_RAISE_T);
      playerShip.swordBlade.visible = true;
      playerShip.swordBlade.position.z = -0.85 + (1 - t) * 0.8;
      playerShip.swordBlade.scale.set(1, 1, t);
      if (targetDir) {
        const tiltQ = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, -1), targetDir.clone().normalize(),
        );
        playerShip.root.quaternion.slerp(tiltQ, t * 0.4);
      }
      if (timer >= SWORD_RAISE_T) swordAnim = { phase: 'slash', timer: 0, targetDir };

    } else if (phase === 'slash') {
      if (timer < dt * 2) {
        // Sword hits enemies from all active stages + impromptu
        const stageHits = activeStages.flatMap(s => testSwordEnemies(playerPos, swordState!.range, s));
        const impHits = impromptuEnemies.filter(
          e => !e.dead && e.inScene && playerPos.distanceTo(e.root.position) <= swordState!.range,
        );
        const hits = [...stageHits, ...impHits];
        for (const enemy of hits) {
          const result = applyDamageToEnemy(enemy, swordState.damage, false);
          if (result.killed) {
            const leveled = gainExp(gameState.player, result.expGained);
            if (result.expGained > 0) spawnXpFloat(scene, enemy.root.position.clone(), result.expGained);
            if (leveled) { sfxLevelUp(); spawnLevelUpBanner(scene, playerPos.clone(), gameState.player.level, () => playerShip.root.position.clone()); }
            gameState.player.score += enemy.isBoss ? 500 : 100;
            sfxEnemyDie(enemy.isBoss);
            spawnEnemyDeathBurst(scene, enemy.root.position.clone(), enemy.isBoss);
            scene.remove(enemy.root);
            enemy.inScene = false;
          } else {
            shakeEnemy(enemy, false);
            spawnEnemyHitBurst(scene, enemy.root.position.clone(), false);
            spawnHitFlash(getEnemyMeshes(enemy), false);
          }
        }
        for (const obs of activeStages.flatMap(s => s.obstacles)) {
          if (obs.dead) continue;
          if (playerPos.distanceTo((obs.root as Obj3D).position) <= swordState.range * 1.5) {
            obs.dead = true;
            scene.remove(obs.root as Obj3D);
            spawnObstacleDebris(scene, (obs.root as Obj3D).position.clone());
          }
        }
        spawnSwordArc(scene, playerPos.clone(), targetDir ?? aimDir, 0x00ffff, swordState.range);
      }
      const t = Math.min(1, timer / SWORD_SLASH_T);
      playerShip.swordBlade.rotation.y = t * Math.PI * 1.2;
      if (timer >= SWORD_SLASH_T) swordAnim = { phase: 'recover', timer: 0, targetDir };

    } else {
      const t = Math.min(1, timer / SWORD_RECOVER_T);
      playerShip.swordBlade.scale.set(1, 1, 1 - t);
      if (timer >= SWORD_RECOVER_T) {
        swordAnim = null;
        playerShip.swordBlade.visible = false;
        playerShip.swordBlade.scale.set(1, 1, 1);
        playerShip.swordBlade.rotation.y = 0;
        playerShip.swordBlade.position.z = -0.85;
      }
    }
  }

  if (swordAnim === null) playerShip.swordBlade.visible = false;
}

// ── Enemy motion patterns ────────────────────────────────────────────────────────────
// Pre-baked polygon loop vertices for 'poly' pattern (3–5 sided)
const POLY_SHAPES: Array<Array<[number, number]>> = [
  // Triangle
  [[0, 1], [-0.87, -0.5], [0.87, -0.5]],
  // Square
  [[0, 1], [-1, 0], [0, -1], [1, 0]],
  // Pentagon
  [[0, 1], [-0.95, 0.31], [-0.59, -0.81], [0.59, -0.81], [0.95, 0.31]],
];

/**
 * Returns [dx, dy] world-space offsets from base position for a given enemy.
 * `t` is elapsed seconds since the enemy arrived.
 */
function getMotionOffset(
  enemy: import('./entities/enemies').EnemyShip,
  t: number,
): [number, number] {
  const { motionPattern: pat, motionPhase: ph, motionAmp: amp } = enemy;
  const speed = enemy.isBoss ? 0.6 : 1.0;
  const a = t * speed + ph;

  if (pat === 'h') {
    return [Math.sin(a * 1.5) * amp, 0];
  }
  if (pat === 'v') {
    return [0, Math.sin(a * 1.2) * amp * 0.7];
  }
  if (pat === 'circle') {
    const r = amp * 0.75;
    return [Math.cos(a * 0.9) * r, Math.sin(a * 0.9) * r * 0.55];
  }
  // 'poly' — smooth loop around a polygon using slerped segments
  const shape = POLY_SHAPES[Math.floor((enemy.spawnT * 31) % POLY_SHAPES.length)];
  const n = shape.length;
  const loopT = ((a * 0.35) % (Math.PI * 2)) / (Math.PI * 2); // 0–1
  const seg = loopT * n;
  const idx0 = Math.floor(seg) % n;
  const idx1 = (idx0 + 1) % n;
  const frac = seg - Math.floor(seg);
  // Smooth step for rounded corners
  const smooth = frac * frac * (3 - 2 * frac);
  const [x0, y0] = shape[idx0];
  const [x1, y1] = shape[idx1];
  return [
    (x0 + (x1 - x0) * smooth) * amp * 0.85,
    (y0 + (y1 - y0) * smooth) * amp * 0.55,
  ];
}

// ── Fly-in helpers ────────────────────────────────────────────────────────────
// How far ahead of the player (rail-T fraction) the trigger fires.
// Larger = more warning time before the enemy arrives.
const FLY_IN_TRIGGER_T = 0.42;  // ~42% of rail ≈ 35-50 world units of lead time
const FLY_IN_DURATION  = 2.8;   // seconds for the fly-in animation

// Enemies fly in from the sides/above, well ahead of the player so they
// appear in view banking toward their destination — not materialising next to the player.
function pickFlyInOrigin(
  dest: V3, right: V3, up: V3, forward: V3,
): V3 {
  const side = Math.random() < 0.5 ? -1 : 1;
  const useVertical = Math.random() < 0.3; // 30% come from above/below
  const lateralAxis = useVertical ? up : right;
  return dest.clone()
    .addScaledVector(lateralAxis, side * (80 + Math.random() * 30)) // 80-110 units off-axis
    .addScaledVector(up, useVertical ? 0 : (Math.random() - 0.5) * 12)
    .addScaledVector(forward, 35 + Math.random() * 20); // 35-55 units further AHEAD
}

function triggerFlyIn(
  enemy: import('./entities/enemies').EnemyShip,
  dest: V3, right: V3, up: V3, forward: V3,
): void {
  enemy.flyIn = 'flying';
  enemy.flyInTimer = 0;
  enemy.flyInDuration = FLY_IN_DURATION * (0.8 + Math.random() * 0.4);
  enemy.flyInOrigin = pickFlyInOrigin(dest, right, up, forward);
  if (!enemy.inScene) {
    scene.add(enemy.root);
    enemy.inScene = true;
  }
}

// ── Enemy AI ───────────────────────────────────────────────────────────────────
function updateEnemies(dt: number, playerPos: V3, forward: V3): void {
  const { right, up } = getWorldBasis(worldTrack, worldDist);
  // Trigger window: FLY_IN_TRIGGER_T fraction × current stage length in world units
  const triggerWindowWU = FLY_IN_TRIGGER_T * currentStage.rail.length;

  // ── Trigger pending fly-ins for all active stage enemies ─────────────────
  for (const stage of activeStages) {
    const seg = segmentForStage(stage);
    if (!seg) continue;
    for (const e of stage.enemies) {
      if (e.dead || e.flyIn !== 'pending') continue;
      // Convert enemy spawnT to world distance
      const enemyWorldDist = seg.startDist + e.spawnT * seg.rail.length;
      const gap = enemyWorldDist - worldDist; // positive = ahead
      if (gap >= 0 && gap <= triggerWindowWU) {
        const dest = getEntityWorldPosition(seg, e.spawnT, e.offsetX, e.offsetY);
        triggerFlyIn(e, dest, right, up, forward);
      }
      // Straggler catch: player just passed it
      if (gap < 0 && gap > -2) {
        const dest = getEntityWorldPosition(seg, e.spawnT, e.offsetX, e.offsetY);
        triggerFlyIn(e, dest, right, up, forward);
      }
    }
  }

  // ── Impromptu spawn: if no active enemy visible ──────────────────────────
  impromptuSpawnCooldown -= dt;
  const bossNear = currentStage.boss && !currentStage.boss.dead &&
    playerPos.distanceTo(currentStage.boss.root.position) < 30;
  if (!bossNear) {
    const hasActiveEnemy = [
      ...activeStages.flatMap(s => s.enemies),
      ...impromptuEnemies,
    ].some(e => !e.dead && (e.flyIn === 'flying' || e.flyIn === 'arrived'));

    if (!hasActiveEnemy && impromptuSpawnCooldown <= 0) {
      impromptuSpawnCooldown = 6 + Math.random() * 4;
      // Place well ahead in world space
      const impWorldDist = worldDist + triggerWindowWU + (0.38 + Math.random() * 0.08) * currentStage.rail.length;
      const seg = segmentForStage(currentStage);
      const triggerT = seg
        ? Math.min(0.98, (impWorldDist - seg.startDist) / seg.rail.length)
        : 0.5;
      const imp = createImpromptuEnemy(Math.max(0, Math.min(0.98, triggerT)), gameState.stageIndex);
      const dest = seg
        ? getEntityWorldPosition(seg, imp.spawnT, imp.offsetX, imp.offsetY)
        : playerPos.clone().addScaledVector(forward, 30);
      triggerFlyIn(imp, dest, right, up, forward);
      impromptuEnemies.push(imp);
    }
  }

  // ── Combine all active enemies ───────────────────────────────────────────────
  const allEnemies = [
    ...activeStages.flatMap(s => s.enemies),
    ...impromptuEnemies,
    ...activeStages.flatMap(s => s.boss && !s.boss.dead ? [s.boss] : []),
  ].filter(e => !e.dead && e.inScene);

  for (const enemy of allEnemies) {
    if (enemy.dead) continue;
    enemy.age += dt;

    // Find which segment owns this enemy for world-space positioning
    const ownerStage = activeStages.find(s =>
      s.enemies.includes(enemy as any) || s.boss === enemy,
    ) ?? currentStage;
    const ownerSeg = segmentForStage(ownerStage);
    const basePos = ownerSeg
      ? getEntityWorldPosition(ownerSeg, enemy.spawnT, enemy.offsetX, enemy.offsetY)
      : enemy.root.position.clone();

    // Pattern-based motion offset (applied after arrival)
    const [motDx, motDy] = enemy.flyIn === 'arrived'
      ? getMotionOffset(enemy, enemy.age)
      : [0, 0];

    // Fly-in interpolation
    if (enemy.flyIn === 'flying') {
      enemy.flyInTimer += dt;
      const rawT = Math.min(1, enemy.flyInTimer / enemy.flyInDuration);
      const easedT = 1 - Math.pow(1 - rawT, 3);
      if (enemy.flyInOrigin) {
        const arrived = basePos.clone();
        // Pre-compute arrival offset so fly-in aims at the right spot
        const [adx, ady] = getMotionOffset(enemy, 0);
        arrived.x += adx; arrived.y += ady;
        enemy.root.position.lerpVectors(enemy.flyInOrigin, arrived, easedT);
      }
      if (rawT >= 1) enemy.flyIn = 'arrived';
    } else {
      // Arrived or boss — apply motion pattern offset
      enemy.root.position.copy(basePos);
      enemy.root.position.x += motDx;
      enemy.root.position.y += motDy;
    }

    const toPlayer = playerPos.clone().sub(enemy.root.position);
    const distToPlayer = toPlayer.length();
    // Point the enemy's -Z (model forward) toward the player.
    // lookAt aims +Z at the target, so we pass a point in the OPPOSITE direction
    // (behind the enemy relative to the player) to flip it 180°.
    // Using quaternion-based lookAt avoids clobbering the world-space rotation
    // that the segment placement baked into the root.
    if (distToPlayer > 0.01) {
      // Enemies face -Z toward the player. Only yaw around world Y so the
      // model's built-in up (+Y) is always preserved — no roll or pitch.
      enemy.root.rotation.set(0, Math.atan2(toPlayer.x, toPlayer.z) + Math.PI, 0);
    }

    // Hit-shake: drives shakeGroup directly, independent of all other transforms.
    // Uses enemy.age as clock so each enemy shakes at its own phase.
    if (enemy.shakeTimer > 0) {
      enemy.shakeTimer = Math.max(0, enemy.shakeTimer - dt);
      const progress = 1 - (enemy.shakeTimer / enemy.shakeMax); // 0→1
      const decay = 1 - progress * progress;                     // 1→0 (ease-out)
      const str  = enemy.isBoss ? 0.12 : 0.20;                   // noticeable but not violent
      const freq = Math.PI * 2 * 18;                             // 18Hz oscillation
      const age  = enemy.age;
      enemy.shakeGroup.position.set(
        Math.sin(age * freq)           * str * decay,
        Math.cos(age * freq * 1.1)     * str * 0.5 * decay,
        Math.sin(age * freq * 0.7 + 1) * str * 0.3 * decay,
      );
    } else {
      enemy.shakeGroup.position.set(0, 0, 0);
    }

    animateEnemy(enemy, elapsed);

    // Enemy is "in front" when the vector from player TO enemy aligns with forward.
    // toPlayer is enemy->player, so negate it to get player->enemy.
    const SHOOT_RANGE = enemy.isBoss ? 28 : 20;
    const playerToEnemy = toPlayer.clone().negate().normalize();
    const inFront = playerToEnemy.dot(forward) > 0.0;
    const inRange = distToPlayer < SHOOT_RANGE && inFront;

    // Don't shoot while still flying in
    if (inRange && enemy.flyIn !== 'arrived') {
      enemy.shootCooldown = (enemy.isBoss ? 2.0 : 3.5) + Math.random() * 1.0;
      enemy.chargeMesh.visible = false;
    } else if (inRange) {
      // Tick cooldown
      if (enemy.hasEnteredRange) enemy.shootCooldown -= dt;

      // Telegraph: show charge glow during the window just before firing
      const CHARGE_WINDOW = enemy.chargeMax; // seconds before shot to start glowing
      const readyToCharge = enemy.hasEnteredRange && enemy.shootCooldown <= CHARGE_WINDOW;
      if (readyToCharge || !enemy.hasEnteredRange) {
        // chargeTimer counts from 0 → chargeMax
        enemy.chargeTimer = Math.min(enemy.chargeMax,
          enemy.chargeTimer + dt);
      } else {
        enemy.chargeTimer = 0;
      }

      const chargeT = enemy.chargeMax > 0 ? enemy.chargeTimer / enemy.chargeMax : 0;
      const chargeMat = enemy.chargeMesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      if (chargeT > 0.05) {
        enemy.chargeMesh.visible = true;
        // Pulse faster as chargeT approaches 1
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * (4 + chargeT * 12));
        const brightness = chargeT * pulse;
        chargeMat.opacity = 0.4 + brightness * 0.6;
        // Scale from tiny to full
        const s = 0.4 + chargeT * 0.9;
        enemy.chargeMesh.scale.setScalar(s);
        // Shift colour: yellow → orange → red as charge builds
        const r = 1.0;
        const g = Math.max(0, 0.8 - chargeT * 0.8);
        chargeMat.color.setRGB(r, g, 0);
      } else {
        enemy.chargeMesh.visible = false;
      }

      const shouldFire = (!enemy.hasEnteredRange) ||
        (enemy.shootCooldown <= 0 && enemy.chargeTimer >= enemy.chargeMax);

      if (shouldFire) {
        enemy.hasEnteredRange = true;
        enemy.chargeMesh.visible = false;
        enemy.chargeTimer = 0;
        const [cdMin, cdMax] = enemy.isBoss
          ? getBossConfig(enemy.type).cooldownRange
          : [3.5, 5.0];
        enemy.shootCooldown = cdMin + Math.random() * (cdMax - cdMin);

        if (enemy.isBoss) {
          // Boss: multi-source burst with themed projectile shapes
          const cfg = getBossConfig(enemy.type);
          const bRight = new THREE.Vector3(1, 0, 0);
          const bUp    = new THREE.Vector3(0, 1, 0);
          const burst = fireBossBurst(cfg, enemy.root.position.clone(), bRight, bUp, toPlayer);
          for (const { proj, trailColor } of burst) {
            scene.add(proj.mesh);
            enemyProjectiles.push(proj);
            enemyProjectileTrails.push(createBulletTrail(scene, trailColor));
          }
        } else {
          // Regular enemy: single standard shot
          const shot = spawnEnemyShot(enemy.root.position.clone(), toPlayer);
          scene.add(shot.mesh);
          enemyProjectiles.push(shot);
          enemyProjectileTrails.push(createBulletTrail(scene, 0xff4400));
        }

        // Recoil kick — enemy lurches backward from the shot
        const eStr = enemy.isBoss ? 0.8 : 0.45;
        const posDir = toPlayer.clone().negate().normalize().multiplyScalar(eStr);
        applyRecoilKick(getEnemyRecoil(enemy), posDir, {
          x: (Math.random() - 0.5) * (enemy.isBoss ? 0.28 : 0.16),
          y: (Math.random() - 0.5) * (enemy.isBoss ? 0.22 : 0.12),
          z: (Math.random() - 0.5) * 0.10,
        });
      }
    } else {
      // Out of range or behind player — reset charge
      enemy.chargeMesh.visible = false;
      enemy.chargeTimer = 0;
      if (!inFront) enemy.hasEnteredRange = false;
    }
  }
}

// ── Collision resolution ───────────────────────────────────────────────────────
function resolveCollisions(playerPos: V3): void {
  const player = gameState.player;

  for (let i = playerProjectiles.length - 1; i >= 0; i--) {
    const proj = playerProjectiles[i];
    let hit = false;

    // 1. Obstacles — destructible by all weapons, beam does more damage
    for (const obs of activeStages.flatMap(s => s.obstacles)) {
      if (obs.dead) continue;
      const obsPos = (obs.root as Obj3D).position;
      if (proj.mesh.position.distanceTo(obsPos) < 0.9) {
        const dmg = proj.type === 'beam' ? 40 : proj.type === 'missile' ? 20 : 10;
        obs.hp -= dmg;
        if (obs.hp <= 0) {
          obs.dead = true;
          scene.remove(obs.root as Obj3D);
          spawnObstacleDebris(scene, obsPos.clone());
        } else {
          // Hit but not destroyed — spark + chip
          spawnObstacleSpark(scene, proj.mesh.position.clone());
          // Scale obstacle down slightly to show damage
          const damageFrac = obs.hp / obs.maxHp;
          (obs.root as Obj3D).scale.setScalar(0.6 + damageFrac * 0.4);
        }
        // Beam pierces obstacles; others are consumed
        if (proj.type !== 'beam') {
          scene.remove(proj.mesh);
          playerProjectiles.splice(i, 1);
          hit = true;
        }
        break;
      }
    }
    if (hit) continue;

    // 2. Test vs enemies — beams pierce, others stop on first hit
    const allEnemies = [
      ...activeStages.flatMap(s => s.enemies),
      ...impromptuEnemies,
      ...activeStages.flatMap(s => s.boss && !s.boss.dead ? [s.boss] : []),
    ].filter(e => e.inScene);
    for (const enemy of allEnemies) {
      if (enemy.dead) continue;
      const { hit: didHit, isWeakPoint } = testProjectileEnemy(proj, enemy);
      if (didHit) {
        sfxEnemyHit(isWeakPoint);
        shakeEnemy(enemy, isWeakPoint);
        spawnEnemyHitBurst(scene, proj.mesh.position.clone(), isWeakPoint);
        spawnHitFlash(getEnemyMeshes(enemy), isWeakPoint);
        const actualDmg = (enemy.isBoss && isWeakPoint) ? proj.damage * 4 : proj.damage;
        const color = PROJ_COLOR[proj.type] ?? '#ffffff';
        const smallNum = enemy.isBoss && !isWeakPoint;
        spawnDamageNumber(scene, proj.mesh.position.clone(), actualDmg, color, isWeakPoint, smallNum);
        const result = applyDamageToEnemy(enemy, proj.damage, isWeakPoint);
        if (result.killed) {
          const leveled = gainExp(player, result.expGained);
          if (result.expGained > 0) spawnXpFloat(scene, enemy.root.position.clone(), result.expGained);
          if (leveled) { sfxLevelUp(); spawnLevelUpBanner(scene, playerPos.clone(), player.level, () => playerShip.root.position.clone()); }
          player.score += enemy.isBoss ? 500 : 100;
          sfxEnemyDie(enemy.isBoss);
          spawnEnemyDeathBurst(scene, enemy.root.position.clone(), enemy.isBoss);
          scene.remove(enemy.root);
          enemy.inScene = false;
        }
        if (proj.type !== 'beam') {
          // Non-piercing: remove on first hit
          scene.remove(proj.mesh);
          playerProjectiles.splice(i, 1);
          hit = true;
          break;
        }
        // Beam: keep going, hit next enemy
      }
    }
    if (hit) continue;
  }

  // Enemy projectiles hit player
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const proj = enemyProjectiles[i];
    if (testEnemyShotPlayer(proj, playerPos)) {
      if (player.invincibleTimer <= 0) { hurtTimer = HURT_DURATION; sfxPlayerHurt(); }
      applyDamageToPlayer(player, proj.damage);
      scene.remove(proj.mesh);
      const t = enemyProjectileTrails[i];
      if (t) removeBulletTrail(scene, t);
      enemyProjectiles.splice(i, 1);
      enemyProjectileTrails.splice(i, 1);
    }
  }

  // Obstacle collision — player touching an asteroid takes damage
  if (player.invincibleTimer <= 0) {
    for (const obs of activeStages.flatMap(s => s.obstacles)) {
      if (obs.dead) continue;
      const obsPos = (obs.root as Obj3D).position;
      if (playerPos.distanceTo(obsPos) < 1.0) {
        applyDamageToPlayer(player, 12);
        hurtTimer = HURT_DURATION;
        obs.dead = true;
        scene.remove(obs.root as Obj3D);
        spawnObstacleDebris(scene, obsPos.clone());
        break; // one collision per frame is enough
      }
    }
  }

  // Enemy body collision — player touches an enemy ship
  if (player.invincibleTimer <= 0) {
    const allEnemyBodies = [
      ...activeStages.flatMap(s => s.enemies),
      ...impromptuEnemies,
      ...activeStages.flatMap(s => s.boss && !s.boss.dead ? [s.boss] : []),
    ].filter(e => e.inScene);
    for (const enemy of allEnemyBodies) {
      if (enemy.dead) continue;
      const collRadius = enemy.isBoss ? 1.4 : 0.9;
      if (playerPos.distanceTo(enemy.root.position) < collRadius) {
        applyDamageToPlayer(player, enemy.isBoss ? 18 : 10);
        hurtTimer = HURT_DURATION;
        spawnEnemyHitBurst(scene, playerPos.clone(), false);
        break;
      }
    }
  }

  for (const pickup of activeStages.flatMap(s => s.pickups)) {
    if (pickup.dead) continue;
    if (testPickupPlayer(pickup, playerPos)) {
      pickup.dead = true;
      scene.remove(pickup.root);
      const getPos = () => playerShip.root.position.clone();
      if (pickup.kind === 'health') {
        player.hp = Math.min(player.maxHp, player.hp + 40);
        sfxPickup('health');
        spawnPickupBanner(scene, playerPos.clone(), 'health', '+40 HP', getPos);
      } else {
        const r = applyWeaponPickup(player, pickup.kind);
        sfxPickup(pickup.kind);
        if (r.expGained > 0) {
          // Weapon was already max level — gave EXP instead
          const leveled = gainExp(player, r.expGained);
          spawnXpFloat(scene, pickup.root.position.clone(), r.expGained);
          spawnPickupBanner(scene, playerPos.clone(), pickup.kind, 'MAX LEVEL!', getPos);
          if (leveled) { sfxLevelUp(); spawnLevelUpBanner(scene, playerPos.clone(), player.level, getPos); }
        } else {
          // Weapon upgraded or newly added
          const weapon = player.weapons.find(w => w.type === pickup.kind);
          const lvStr = weapon ? `Level ${weapon.level}` : 'ACQUIRED';
          spawnPickupBanner(scene, playerPos.clone(), pickup.kind, lvStr, getPos);
        }
        // Sync sword state whenever sword slot exists
        const sw = player.weapons.find(w => w.type === 'sword');
        if (sw) {
          swordState = createSwordState(sw.level);
          playerShip.swordBlade.visible = false;
        }
      }
    }
  }
}

// ── Stage transition ───────────────────────────────────────────────────────────
// Stage transitions are handled inline in the render loop via worldTrack.

// ── Death / restart ────────────────────────────────────────────────────────────
function handleDeath(): void {
  if (gameState.phase === 'dead') return; // already dying
  gameState.phase = 'dead';
  clearBoostStreaks(scene);
  pauseMusic();
  const deathPos = playerShip.root.position.clone();
  sfxCriticalHit(false);       // anime critical hit sound on death freeze-frame
  duckMusic(0.0, 0.08);         // silence BGM instantly on death hit-pause
  activeExplosion = startEpicExplosion(scene, deathPos, false, () => {
    activeExplosion = null;
    showOverlay(hud, 'GAME OVER', `Score: ${gameState.player.score}`, 'Restart', () => {
      restartGame();
    });
  });
}

function restartGame(): void {
  if (activeExplosion) { activeExplosion.dispose(); activeExplosion = null; }
  for (const p of playerProjectiles) scene.remove(p.mesh);
  for (const p of enemyProjectiles) scene.remove(p.mesh);
  for (const t of enemyProjectileTrails) if (t) removeBulletTrail(scene, t);
  playerProjectiles.length = 0;
  enemyProjectiles.length = 0;
  enemyProjectileTrails.length = 0;
  // Remove all active stages from scene
  for (const s of activeStages) removeStageObjects(s);
  activeStages.length = 0;
  // Remove impromptu enemies
  for (const e of impromptuEnemies) if (e.inScene) scene.remove(e.root);
  impromptuEnemies.length = 0;
  impromptuSpawnCooldown = 0;
  clearBoostStreaks(scene);

  gameState.player = createPlayerState();
  gameState.stageIndex = 0;
  gameState.phase = 'playing';
  worldDist = 0;
  // Reset theme tween to stage 0
  _skyColor.setHex(getTheme(0).skyColor);
  _starColor.setHex(getTheme(0).starColor);
  _fogDensity = getTheme(0).fogDensity;
  smoothForward.set(0, 0, -1);
  smoothRight.set(1, 0, 0);
  smoothUp.set(0, 1, 0);
  playerOffsetX = 0;
  playerOffsetY = 0;
  targetOffsetX = 0;
  targetOffsetY = 0;
  swordState = null;
  elapsed = 0;
  shootTimers.clear();

  // Rebuild world track from scratch
  const r0 = generateStage(0);
  const r1 = generateStage(1);
  worldTrack = createInitialTrack(r0, r1);
  activeStages.push(r0, r1);
  currentStage = r0;
  nextStageIndex = 2;
  for (const s of activeStages) addStageObjects(s, true);
  hideOverlay(hud);
  hideBossBar(hud);
  // Restart BGM cleanly on the new stage 0's theme track (unducks too)
  restartMusic(r0.themeIndex);
  unduckMusic(0); // instant restore — restartMusic sets gain fresh via setGain fade-in
}

// ── Render loop ────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // Tick active explosion (runs during 'playing' and 'dead' phases)
  if (activeExplosion) {
    const stillRunning = activeExplosion.update(dt);
    if (!stillRunning) activeExplosion = null;
    renderer.render(scene, camera);
    return; // freeze all other game logic during explosion
  }

  // ── Title screen phase ─────────────────────────────────────────────────────
  if (gameState.phase === 'title') {
    // Position player in hero pose for the title backdrop
    playerShip.root.position.set(0, -0.5, 2);
    playerShip.root.rotation.set(0, Math.PI, 0); // face camera
    applyHeroPose(playerShip);
    animateHeroPose(playerShip, elapsed);
    // Gentle vernier glow at idle
    playerShip.verniers.forEach(v => {
      const idleThrust = 0.18 + Math.sin(elapsed * 14) * 0.06;
      v.flameCore.scale.set(1, 1, idleThrust);
      v.flameMid.scale.set(0.7, 0.7, idleThrust * 0.9);
      v.flameHalo.scale.set(0.5, 0.5, idleThrust * 0.7);
      const coreMat = v.flameCore.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      coreMat.opacity = 0.55; coreMat.color.setRGB(0.75, 0.9, 1.0);
      const midMat = v.flameMid.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      midMat.opacity = 0.30; midMat.color.setRGB(0.2, 0.6, 1.0);
      const haloMat = v.flameHalo.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      haloMat.opacity = 0.12;
      const rimMat = v.rimGlow.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      rimMat.opacity = 0.45;
      v.rimGlow.scale.set(1, 1, 1);
    });
    // Title camera: frame the character from slightly below, looking up
    camera.position.set(0, 0.2, 6.5);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.4, 2);
    updateStarfield(starfield, camera.position);
    titleScreen?.update(elapsed);
    renderer.render(scene, camera);
    return;
  }

  if (gameState.phase !== 'playing') {
    renderer.render(scene, camera);
    return;
  }

  const player = gameState.player;

  if (player.hp <= 0) {
    handleDeath();
    renderer.render(scene, camera);
    return;
  }

  if (player.invincibleTimer > 0) player.invincibleTimer -= dt;

  readInput(dt);

  // Smooth offsets (frame-rate-independent exponential)
  playerOffsetX += (targetOffsetX - playerOffsetX) * (1 - Math.exp(-OFFSET_LERP * dt));
  playerOffsetY += (targetOffsetY - playerOffsetY) * (1 - Math.exp(-OFFSET_LERP * dt));

  // Boost timers
  if (boostTimer > 0) {
    boostTimer -= dt;
    if (boostTimer <= 0) {
      boostTimer = 0;
      unduckMusic(0.6); // restore BGM smoothly as boost fades
    }
  }
  if (boostCooldown > 0) {
    boostCooldown -= dt;
    if (boostCooldown <= 0) boostCooldown = 0;
  }
  // Smooth boostFactor: ramp up fast, decay when done
  const boostTarget = boostTimer > 0 ? BOOST_MULTIPLIER : 1.0;
  boostFactor += (boostTarget - boostFactor) * (1 - Math.exp(-(boostTimer > 0 ? 12 : 6) * dt));

  // World-space rail advance (world units per second)
  const worldSpeed = RAIL_SPEED * BASE_STAGE_LENGTH * boostFactor;
  worldDist += worldSpeed * dt;

  // Determine which stage the player is currently on
  const currentSeg = resolveCurrentSegment(worldTrack, worldDist);
  if (currentSeg.stage !== currentStage) {
    currentStage = currentSeg.stage;
    gameState.stageIndex = currentStage.index;
    // Cross-fade to the BGM track matching this stage's world theme
    playThemeTrack(currentStage.themeIndex);
  }

  // Boss stop: halt worldDist so player fights boss in place
  const bossAlive = currentStage.boss && !currentStage.boss.dead;
  if (bossAlive) {
    const seg = segmentForStage(currentStage);
    if (seg) {
      const bossWorldDist = seg.startDist + currentStage.boss!.spawnT * seg.rail.length - 14;
      if (worldDist >= bossWorldDist) worldDist = bossWorldDist;
      if (worldDist >= bossWorldDist - 12) {
        showBossBar(hud, currentStage.boss!.hp / currentStage.boss!.maxHp);
      }
    }
  }

  // Boss defeated — epic explosion first, then stage progression
  if (currentStage.boss && currentStage.boss.dead && !currentStage.bossDefeated) {
    currentStage.bossDefeated = true;
    player.score += 1000;
    hideBossBar(hud);
    const bossPos = currentStage.boss.root.position.clone();
    // Remove boss mesh immediately so it doesn’t render during explosion
    scene.remove(currentStage.boss.root);
    currentStage.boss.inScene = false;
    // Capture stage ref for closure
    const clearedStage = currentStage;
    sfxCriticalHit(true);        // epic anime critical hit for boss kill
    duckMusic(0.08, 0.10);        // deep duck BGM during boss death hit-pause
    activeExplosion = startEpicExplosion(scene, bossPos, true, () => {
      activeExplosion = null;
      unduckMusic(1.2); // restore BGM as the new stage begins
      // Append new stage after explosion completes
      const newStage = generateStage(nextStageIndex++);
      appendStage(worldTrack, newStage);
      addStageObjects(newStage);
      activeStages.push(newStage);
      const pruned = pruneOldSegments(worldTrack, worldDist);
      for (const seg of pruned) {
        if (seg.stage && seg.stage !== clearedStage) {
          removeStageObjects(seg.stage);
          activeStages = activeStages.filter(s => s !== seg.stage);
        }
      }
    });
  }

  // Player world position
  const railPos = getWorldPosition(worldTrack, worldDist);
  const rawBasis = getWorldBasis(worldTrack, worldDist);

  // Smooth the basis vectors to hide instantaneous snaps at segment boundaries.
  // We slerp forward toward the raw value, then re-derive right/up from it
  // so they stay orthonormal and don’t drift independently.
  const alpha = 1 - Math.exp(-BASIS_SMOOTH_K * dt);
  smoothForward.lerp(rawBasis.forward, alpha).normalize();
  // Re-derive right and up from the smoothed forward
  const worldUpRef = new THREE.Vector3(0, 1, 0);
  smoothRight.crossVectors(smoothForward, worldUpRef).normalize();
  smoothUp.crossVectors(smoothRight, smoothForward).normalize();

  const forward = smoothForward;
  const right   = smoothRight;
  const up      = smoothUp;

  const playerWorldPos = railPos.clone()
    .addScaledVector(right, playerOffsetX)
    .addScaledVector(up, playerOffsetY);

  // Player recoil — softer spring (80/12) so kick is visible before snapping back
  updateRecoil(playerRecoil, dt, 80, 12);

  // Player ship position & orientation
  playerShip.root.position.copy(playerWorldPos).add(playerRecoil.offset);
  // lookAt makes +Z face the target. Model nose faces -Z, so point +Z *backward*
  const lookTarget = playerWorldPos.clone().addScaledVector(forward, -3);
  playerShip.root.lookAt(lookTarget);
  animatePlayerShip(playerShip, elapsed);
  // Note: recoil rotation applied AFTER IK lean (see below)

  // ── Vernier thruster animation ───────────────────────────────────────────
  // Derive movement velocity from offset delta this frame
  const velX = (playerOffsetX - prevOffsetX) / Math.max(dt, 0.001);
  const velY = (playerOffsetY - prevOffsetY) / Math.max(dt, 0.001);
  prevOffsetX = playerOffsetX;
  prevOffsetY = playerOffsetY;

  // Also fold in raw input for instant response, blend with velocity
  const inputInfluenceX = rawInputX * 0.6 + Math.sign(velX) * Math.min(Math.abs(velX) / 4, 0.4);
  const inputInfluenceY = rawInputY * 0.6 + Math.sign(velY) * Math.min(Math.abs(velY) / 4, 0.4);
  // Smooth vernier input
  const VERNIER_SMOOTH = 1 - Math.exp(-10 * dt);
  vernierInputX += (inputInfluenceX - vernierInputX) * VERNIER_SMOOTH;
  vernierInputY += (inputInfluenceY - vernierInputY) * VERNIER_SMOOTH;

  // Boost visual: pitch ship nose-forward proportional to boost
  const boostNorm = (boostFactor - 1) / (BOOST_MULTIPLIER - 1); // 0..1
  playerShip.recoilPivot.rotateX(boostNorm * 0.32); // nose dips forward

  // Forward thrust base — at full boost this blows out to ~3.8, giving 4× longer jets
  const fwdThrust = 0.3 + Math.sin(elapsed * 18) * 0.08 + boostNorm * 3.5;

  // During boost: flicker frequency ramps up (turbulent, violent flame)
  const flickerSpeedMult = 1.0 + boostNorm * 2.2;

  playerShip.verniers.forEach((v, idx) => {
    const isXAxis = idx !== 2 && idx !== 3;
    const input   = isXAxis ? vernierInputX : vernierInputY;
    const fireSign = (idx === 0 || idx === 2 || idx === 4) ? -1 : 1;
    const thrust = Math.max(0, fwdThrust + Math.max(0, input * fireSign) * 0.9);

    // Pivot tilt — during boost, all jets kick hard backward
    const TILT_MAX = 0.35;
    const boostTiltBack = boostNorm * 0.55; // extra backward lean on all nozzles
    v.pivot.rotation.x = v.baseRotX + boostTiltBack
      + (idx === 2 || idx === 3 ? vernierInputY * TILT_MAX : 0);
    v.pivot.rotation.z = v.baseRotZ
      + (isXAxis ? vernierInputX * TILT_MAX * (idx % 2 === 0 ? 1 : -1) : 0);

    // Per-layer flicker — faster and more violent during boost
    const fs = flickerSpeedMult;
    const flickerCore = 0.88 + Math.sin(elapsed * 52 * fs + idx * 2.3) * (0.12 + boostNorm * 0.10);
    const flickerMid  = 0.82 + Math.sin(elapsed * 31 * fs + idx * 1.7) * (0.18 + boostNorm * 0.12);
    const flickerHalo = 0.75 + Math.sin(elapsed * 19 * fs + idx * 1.1) * (0.25 + boostNorm * 0.15);

    // Heat colour: normal = cool blue-white; boost = fierce orange→white core
    // boostNorm=0: coreHeat drives blue-white. boostNorm=1: pure white/orange blowout.
    const coreHeat   = Math.min(1, thrust * (boostNorm > 0.1 ? 0.5 : 1.3));
    const boostHeat  = boostNorm * boostNorm; // quadratic so it really kicks at high boost

    // ── Inner core ────────────────────────────────────────────────────────────
    // Boost: core stretches to 3.5× and blows out pure white
    const coreLen = Math.max(0.02, thrust * flickerCore);
    v.flameCore.scale.set(
      1 + boostNorm * 0.6,          // widens slightly at boost
      1 + boostNorm * 0.6,
      coreLen,
    );
    const coreMat = v.flameCore.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    coreMat.opacity = Math.min(1.0, 0.5 + thrust * 0.18 + boostNorm * 0.5);
    // Colour: blue-white → pure white at boost
    coreMat.color.setRGB(
      0.6 + coreHeat * 0.4 + boostHeat * 0.4,
      0.85 + coreHeat * 0.15 - boostHeat * 0.1,
      1.0 - boostHeat * 0.3,        // less blue = more white/orange at full boost
    );

    // ── Mid plume ─────────────────────────────────────────────────────────────
    // Boost: blooms very wide and long, shifts from blue → hot orange-white
    const midLen = Math.max(0.01, thrust * flickerMid * 1.1);
    const midWidth = 0.6 + thrust * 0.5 + boostNorm * 1.8; // huge bloom at boost
    v.flameMid.scale.set(midWidth, midWidth, midLen);
    const midMat = v.flameMid.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    midMat.opacity = Math.min(0.92, 0.15 + thrust * 0.18 + boostNorm * 0.75);
    // Normal: blue. Boost: orange-white (1.0, 0.65→0.9, 0.2→0.0)
    midMat.color.setRGB(
      0.1 + thrust * 0.1 + boostHeat * 0.90,
      0.55 + thrust * 0.12 - boostHeat * 0.08,
      1.0 - boostHeat * 0.85,
    );

    // ── Outer halo ────────────────────────────────────────────────────────────
    // Boost: massive bloom — this is the big glowing exhaust cloud
    const haloLen = Math.max(0.01, thrust * flickerHalo * 1.2);
    const haloWidth = 0.4 + thrust * 0.7 + boostNorm * 3.2; // enormous at full boost
    v.flameHalo.scale.set(haloWidth, haloWidth, haloLen);
    const haloMat = v.flameHalo.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    haloMat.opacity = Math.min(0.88, 0.02 + thrust * 0.10 + boostNorm * 0.80);
    // Halo colour: deep blue → vivid orange glow
    haloMat.color.setRGB(
      0.4 + boostHeat * 0.60,
      0.3 + boostHeat * 0.30,
      1.0 - boostHeat * 0.90,
    );

    // ── Rim glow ring ─────────────────────────────────────────────────────────
    // Boost: blazing ring, shifts to hot amber-white
    const rimMat = v.rimGlow.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    rimMat.opacity = Math.min(1.0, thrust * flickerCore * 0.30 + boostNorm * 0.95);
    rimMat.color.setRGB(
      0.3 + thrust * 0.2 + boostHeat * 0.70,
      0.7 + thrust * 0.1 - boostHeat * 0.20,
      1.0 - boostHeat * 0.80,
    );
    // Rim ring also scales out during boost for a dramatic corona
    const rimScale = 1.0 + boostNorm * 1.4;
    v.rimGlow.scale.set(rimScale, rimScale, 1);
  });

  // Hurt animation: shake position + red flash overlay
  if (hurtTimer > 0) {
    hurtTimer -= dt;
    const hurtT = hurtTimer / HURT_DURATION;
    const shakeAmt = hurtT * 0.18;
    playerShip.root.position.x += Math.sin(elapsed * 55) * shakeAmt;
    playerShip.root.position.y += Math.sin(elapsed * 47) * shakeAmt * 0.7;
  }
  // Red flash: visible when hurt, alternates at ~10Hz
  const flashRed = hurtTimer > 0 && Math.sin(elapsed * 62) > 0;
  playerShip.root.traverse((child) => {
    const mesh = child as InstanceType<typeof THREE.Mesh>;
    if (!mesh.isMesh) return;
    const mat = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>;
    if (!mat.color) return;
    const stored = playerOrigColors.get(mesh);
    if (stored === undefined) return;
    mat.color.setHex(flashRed ? 0xff1111 : stored);
  });

  // Sword blade visibility managed by doSword() animation state machine

  // Camera: sits BEHIND player — pulls further back during boost for speed feel
  const camDist = 4.5 + boostNorm * 2.5;  // 4.5 normal → 7.0 at full boost
  const camBack = forward.clone().multiplyScalar(-camDist);
  const camUp = up.clone().multiplyScalar(1.2 + boostNorm * 0.4);
  camera.position.copy(playerWorldPos).add(camBack).add(camUp);
  // Tighten FOV slightly during boost for tunnel-vision effect
  camera.fov = 55 + boostNorm * 12;
  camera.updateProjectionMatrix();
  const camLookAt = playerWorldPos.clone().addScaledVector(forward, 8 + boostNorm * 4);
  camera.lookAt(camLookAt);

  // Place boss and all stage entities across all active stages
  for (const stage of activeStages) {
    const seg = segmentForStage(stage);
    if (!seg) continue;
    if (stage.boss && !stage.boss.dead && stage.boss.inScene) {
      placeEntityOnSegment(stage.boss.root, seg, stage.boss.spawnT, 0, 0);
    }
    for (const p of stage.pickups) {
      if (!p.dead) {
        placeEntityOnSegment(p.root, seg, p.spawnT, p.offsetX, p.offsetY);
        p.root.position.add(p.magnetOffset);
        p.position.copy(p.root.position);
        updatePickupMagnet(p, playerWorldPos, dt);
        animatePickup(p, dt);
      }
    }
    for (const o of stage.obstacles) {
      if (!o.dead) placeEntityOnSegment(o.root as Obj3D, seg, o.spawnT, o.offsetX, o.offsetY);
    }
  }
  // Regular enemies and impromptu enemies are positioned inside updateEnemies()
  // Reticle aim offset: driven by rawInputX/Y captured before drag delta was zeroed
  const RETICLE_DIST = 12;
  const RETICLE_MAX_AIM = 1.8;
  const RETICLE_FOLLOW = 6.0;
  const RETICLE_RETURN = 3.5;

  const hasInput = Math.abs(rawInputX) > 0.01 || Math.abs(rawInputY) > 0.01;
  if (hasInput) {
    reticleAimX += (rawInputX * RETICLE_MAX_AIM - reticleAimX) * (1 - Math.exp(-RETICLE_FOLLOW * dt));
    reticleAimY += (rawInputY * RETICLE_MAX_AIM - reticleAimY) * (1 - Math.exp(-RETICLE_FOLLOW * dt));
  } else {
    reticleAimX *= Math.exp(-RETICLE_RETURN * dt);
    reticleAimY *= Math.exp(-RETICLE_RETURN * dt);
  }
  reticleAimX = Math.max(-RETICLE_MAX_AIM, Math.min(RETICLE_MAX_AIM, reticleAimX));
  reticleAimY = Math.max(-RETICLE_MAX_AIM, Math.min(RETICLE_MAX_AIM, reticleAimY));

  // Reticle world position
  const reticlePos = playerWorldPos.clone()
    .addScaledVector(forward, RETICLE_DIST)
    .addScaledVector(right, reticleAimX)
    .addScaledVector(up, reticleAimY);
  reticleGroup.position.copy(reticlePos);
  reticleGroup.quaternion.copy(camera.quaternion);
  const reticleScale = 1 + 0.1 * Math.sin(elapsed * 6);
  reticleGroup.scale.setScalar(reticleScale);

  // Aim direction: from player toward reticle — shots follow the reticle
  const aimDir = reticlePos.clone().sub(playerWorldPos).normalize();

  // ── IK aim: body lean + head + arm rotation toward reticle ──────────────
  // Body lean: small additional rotation on root after lookAt
  // Normalise aim offsets to -1..1 range for lean amount
  const leanX = reticleAimX / RETICLE_MAX_AIM; // -1..1 lateral
  const leanY = reticleAimY / RETICLE_MAX_AIM; // -1..1 vertical
  const IK_LEAN = 1 - Math.exp(-5 * dt);
  // Smooth lean targets stored frame-to-frame
  playerShip.recoilPivot.rotateY(leanX * 0.18);
  playerShip.recoilPivot.rotateX(-leanY * 0.12);

  // Head IK — rotate headGroup so face points toward reticle
  // 1. Get head world position
  const headWorldPos = new THREE.Vector3();
  playerShip.headGroup.getWorldPosition(headWorldPos);
  // 2. Direction from head to reticle, in head-parent (root) local space
  const toReticleWorld = reticlePos.clone().sub(headWorldPos).normalize();
  // Convert to root-local space
  const rootInvQuat = playerShip.root.quaternion.clone().invert();
  const toReticleLocal = toReticleWorld.clone().applyQuaternion(rootInvQuat);
  // The head's rest look direction is -Z in local space
  const headRestDir = new THREE.Vector3(0, 0, -1);
  const headTargetQuat = new THREE.Quaternion().setFromUnitVectors(headRestDir, toReticleLocal.normalize());
  // Clamp: don't let head rotate more than ~35 degrees from rest
  const headAngle = headTargetQuat.angleTo(new THREE.Quaternion());
  const MAX_HEAD_ANGLE = Math.PI / 5;
  if (headAngle > MAX_HEAD_ANGLE) {
    headTargetQuat.slerp(new THREE.Quaternion(), 1 - MAX_HEAD_ANGLE / headAngle);
  }
  playerShip.headGroup.quaternion.slerp(headTargetQuat, 1 - Math.exp(-8 * dt));

  // Arm IK — rotate arm groups so muzzles point toward reticle
  // For each arm, the arm's forward axis in local space is -Z (arms reach forward)
  function aimArmAtReticle(armGroup: InstanceType<typeof THREE.Group>, maxAngleDeg: number): void {
    const armWorldPos = new THREE.Vector3();
    armGroup.getWorldPosition(armWorldPos);
    const toRet = reticlePos.clone().sub(armWorldPos).normalize();
    // Convert to arm-parent (root) local space
    const toRetLocal = toRet.clone().applyQuaternion(rootInvQuat);
    const armRestDir = new THREE.Vector3(0, -0.48, -0.85).normalize(); // arm rest forward
    const armQuat = new THREE.Quaternion().setFromUnitVectors(armRestDir, toRetLocal.normalize());
    // Clamp rotation
    const angle = armQuat.angleTo(new THREE.Quaternion());
    const maxRad = (maxAngleDeg * Math.PI) / 180;
    if (angle > maxRad) armQuat.slerp(new THREE.Quaternion(), 1 - maxRad / angle);
    armGroup.quaternion.slerp(armQuat, 1 - Math.exp(-8 * dt));
  }
  aimArmAtReticle(playerShip.armR, 50);
  aimArmAtReticle(playerShip.armL, 50);
  // Recoil rotation last — nothing overwrites it after this point
  applyRecoilRotation(playerRecoil, playerShip.recoilPivot);

  // Shooting & sword
  doShooting(dt, playerWorldPos, aimDir);
  doSword(dt, playerWorldPos, aimDir);

  // Update projectiles
  for (let i = playerProjectiles.length - 1; i >= 0; i--) {
    const proj = playerProjectiles[i];
    if (!updateProjectile(proj, dt)) {
      if (proj.type === 'missile') {
        spawnEnemyHitBurst(scene, proj.mesh.position.clone(), false);
      }
      scene.remove(proj.mesh);
      playerProjectiles.splice(i, 1);
    } else if (proj.type === 'missile') {
      emitSmokePuff(scene, proj.mesh.position.clone());
    }
  }
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const eproj = enemyProjectiles[i];
    const trail = enemyProjectileTrails[i];
    if (!updateProjectile(eproj, dt)) {
      scene.remove(eproj.mesh);
      if (trail) removeBulletTrail(scene, trail);
      enemyProjectiles.splice(i, 1);
      enemyProjectileTrails.splice(i, 1);
    } else {
      if (trail) updateBulletTrail(trail, eproj.mesh.position as InstanceType<typeof THREE.Vector3>, dt);
    }
  }

  updateEnemies(dt, playerWorldPos, forward);

  // Prune dead impromptu enemies
  for (let i = impromptuEnemies.length - 1; i >= 0; i--) {
    const ie = impromptuEnemies[i];
    if (ie.dead) {
      if (ie.inScene) { scene.remove(ie.root); ie.inScene = false; }
      impromptuEnemies.splice(i, 1);
    }
  }

  resolveCollisions(playerWorldPos);

  updateStarfield(starfield, camera.position);

  // Boost streak lines — anime speed effect
  spawnBoostStreaks(scene, playerWorldPos, forward, right, up, boostNorm, dt, camera.position);
  updateBoostStreaks(scene, dt);

  // Theme tween — exponential smoothing toward current stage's theme handles cross-fade naturally
  applyTheme(currentStage.theme, 1 - Math.exp(-THEME_TWEEN_K * dt));

  updateEffects(scene, dt);
  updateDamageNumbers(scene, camera, dt);

  updateHud(hud, player, gameState.stageIndex, currentStage.theme.name);
  updateBoostHud(hud, boostTimer, boostCooldown, BOOST_DURATION, BOOST_COOLDOWN);
  // Boost reminder: visible while traversing the gap between stages
  hud.boostReminder.style.display = isInGap(worldTrack, worldDist) ? 'flex' : 'none';

  renderer.render(scene, camera);
}

animate();
