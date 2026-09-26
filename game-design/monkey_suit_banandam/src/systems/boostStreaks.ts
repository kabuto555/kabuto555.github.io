/**
 * Anime-style speed streak lines that appear during boost.
 * Each streak is a thin elongated quad flying backward past the camera,
 * rendered with additive blending so it glows against the dark space background.
 *
 * Visual design:
 *  - White core with coloured glow (cyan/yellow depending on boost intensity)
 *  - Spawn at random offsets around the player, fanning out from the edges of view
 *  - Length and count scale with boostNorm (0→1)
 *  - Instant appear, fast exponential fade — classic manga speed-line feel
 */

type Scene  = InstanceType<typeof THREE.Scene>;
type V3     = InstanceType<typeof THREE.Vector3>;
type Mesh   = InstanceType<typeof THREE.Mesh>;

interface BoostStreak {
  mesh: Mesh;
  life: number;       // seconds remaining
  maxLife: number;
  vel: V3;            // world-space velocity (flies backward past camera)
}

const _streaks: BoostStreak[] = [];

// Reusable geometry/material pool — we recycle meshes instead of allocating per-frame
const POOL_SIZE = 40;
const _pool: Mesh[] = [];

function getPooledMesh(): Mesh | null {
  return _pool.pop() ?? null;
}

function returnToPool(mesh: Mesh, scene: Scene): void {
  scene.remove(mesh);
  mesh.visible = false;
  _pool.push(mesh);
}

function makeMesh(): Mesh {
  // Thin elongated plane: width=0.04, height=1 (length set per-streak via scale)
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  return mesh;
}

// Pre-fill pool on first use
function ensurePool(): void {
  while (_pool.length < POOL_SIZE) _pool.push(makeMesh());
}

// Streak colours: white core at low boost, shifts cyan→yellow-white at full
function streakColor(boostNorm: number): number {
  if (boostNorm > 0.85) return 0xffffff;        // pure white at full boost
  if (boostNorm > 0.55) return 0xaaddff;        // cyan-white mid boost
  return 0x88ccff;                               // soft blue-cyan early boost
}

/**
 * Call this every frame while boosting to spawn new streaks.
 * @param scene        THREE scene
 * @param playerPos    Current player world position
 * @param forward      Normalised forward direction of travel
 * @param right        Normalised right axis
 * @param up           Normalised up axis
 * @param boostNorm    0..1 smoothed boost intensity
 * @param dt           Delta time
 * @param camPos       Camera position (streaks spawn between cam and player)
 */
export function spawnBoostStreaks(
  scene: Scene,
  playerPos: V3,
  forward: V3,
  right: V3,
  up: V3,
  boostNorm: number,
  dt: number,
  camPos: V3,
): void {
  ensurePool();

  if (boostNorm < 0.05) return;

  // Spawn rate: 0 at boostNorm=0, up to ~28 streaks/sec at full boost
  const spawnRate = boostNorm * boostNorm * 28;
  const spawnCount = Math.floor(spawnRate * dt + Math.random());
  if (spawnCount <= 0) return;

  const color = streakColor(boostNorm);

  for (let s = 0; s < spawnCount; s++) {
    const mesh = getPooledMesh() ?? makeMesh();

    // Spawn point: midpoint between camera and player, with random lateral spread
    // Wider spread at higher boost (more cinematic)
    const spread = 2.5 + boostNorm * 3.5;
    const lateralX = (Math.random() - 0.5) * spread;
    const lateralY = (Math.random() - 0.5) * spread * 0.65;

    // Bias toward screen edges — streaks look best in peripheral vision
    const edgeBias = (Math.random() < 0.6) ? (Math.random() < 0.5 ? 1 : -1) : 0;
    const ox = lateralX + edgeBias * (spread * 0.5);
    const oy = lateralY;

    // Place between camera and player (t=0 is cam, t=1 is player)
    const t = 0.15 + Math.random() * 0.55;
    const spawnPos = camPos.clone()
      .lerp(playerPos, t)
      .addScaledVector(right, ox)
      .addScaledVector(up, oy);

    mesh.position.copy(spawnPos);

    // Length: short flicker at low boost, long slash at full boost
    const length = (0.8 + Math.random() * 1.4) * (0.4 + boostNorm * 2.2);
    const width  = 0.022 + Math.random() * 0.028;

    // Orient along forward direction
    // The plane's Y axis (length axis) should align with forward
    const worldUp = new THREE.Vector3(0, 1, 0);
    const lookAxis = forward.clone();
    // Build a quaternion that aligns +Y to forward direction
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, lookAxis);
    mesh.quaternion.copy(alignQuat);
    // Slight random roll for variety
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(forward, (Math.random() - 0.5) * 0.4);
    mesh.quaternion.premultiply(rollQuat);

    mesh.scale.set(width, length, 1);

    // Material colour and opacity
    const mat = mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    mat.color.setHex(color);
    const baseOpacity = 0.55 + boostNorm * 0.40;
    mat.opacity = baseOpacity * (0.7 + Math.random() * 0.3);

    mesh.visible = true;
    scene.add(mesh);

    // Velocity: streaks fly backward along forward direction at high speed
    // Speed variation adds flicker/depth
    const streakSpeed = (18 + Math.random() * 22) * boostNorm;
    const vel = forward.clone().multiplyScalar(-streakSpeed);
    // Small lateral drift
    vel.addScaledVector(right, (Math.random() - 0.5) * 1.5);
    vel.addScaledVector(up,    (Math.random() - 0.5) * 0.8);

    const maxLife = 0.06 + Math.random() * 0.09; // very short — 60-150ms
    _streaks.push({ mesh, life: maxLife, maxLife, vel });
  }
}

/**
 * Update all active streaks — call every frame regardless of boost state.
 */
export function updateBoostStreaks(scene: Scene, dt: number): void {
  for (let i = _streaks.length - 1; i >= 0; i--) {
    const s = _streaks[i];
    s.life -= dt;

    if (s.life <= 0) {
      returnToPool(s.mesh, scene);
      _streaks.splice(i, 1);
      continue;
    }

    // Move backward
    s.mesh.position.addScaledVector(s.vel, dt);
    // Stretch along velocity direction as speed increases (very slight)
    s.vel.multiplyScalar(0.92); // drag

    // Fade out exponentially — sharp snap off at end
    const t = s.life / s.maxLife; // 1→0
    const mat = s.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    mat.opacity = t * t * 0.95; // quadratic fade
  }
}

/** Clear all streaks immediately (e.g. on death / game over). */
export function clearBoostStreaks(scene: Scene): void {
  for (const s of _streaks) returnToPool(s.mesh, scene);
  _streaks.length = 0;
}
