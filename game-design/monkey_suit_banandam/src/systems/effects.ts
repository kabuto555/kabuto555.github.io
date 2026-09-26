// Visual effects: particle bursts and hit flashes
// All particles are pooled Points objects to avoid per-frame allocation.

type V3 = InstanceType<typeof THREE.Vector3>;
type Points = InstanceType<typeof THREE.Points>;
type Mesh = InstanceType<typeof THREE.Mesh>;

export interface ParticleBurst {
  points: Points;
  velocities: Float32Array; // x,y,z per particle
  life: number;             // seconds remaining
  maxLife: number;
}

export interface HitFlash {
  targets: Mesh[];
  origColors: number[];     // original hex colors to restore
  timer: number;            // seconds remaining
}

// Active effects lists — call updateEffects() each frame
const bursts: ParticleBurst[] = [];
const flashes: HitFlash[] = [];

export function getActiveBursts(): ParticleBurst[] { return bursts; }
export function getActiveFlashes(): HitFlash[] { return flashes; }

// ── Particle burst factory ────────────────────────────────────────────────────
function spawnBurst(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
  count: number,
  color: number,
  speed: number,
  life: number,
  size: number,
): void {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    // Random direction in sphere
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = speed * (0.5 + Math.random() * 0.5);
    velocities[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    velocities[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    velocities[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  bursts.push({ points, velocities, life, maxLife: life });
}

// ── Public spawn helpers ──────────────────────────────────────────────────────

/** Spark ricochet off an indestructible obstacle */
export function spawnObstacleSpark(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
): void {
  spawnBurst(scene, pos, 12, 0xffaa33, 4.5, 0.35, 0.12);
  spawnBurst(scene, pos,  6, 0xcccccc, 2.5, 0.25, 0.08);
}

/** Impact burst when a player shot hits an enemy */
export function spawnEnemyHitBurst(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
  isWeakPoint: boolean,
): void {
  const color  = isWeakPoint ? 0xffff00 : 0xff6600;
  const color2 = isWeakPoint ? 0xffffff : 0xff2200;
  const count  = isWeakPoint ? 20 : 12;
  const speed  = isWeakPoint ? 6  : 4;
  spawnBurst(scene, pos, count, color,  speed,       0.45, 0.14);
  spawnBurst(scene, pos, count / 2, color2, speed * 0.6, 0.30, 0.10);
}

/** Single smoke puff emitted from a missile each frame */
export function emitSmokePuff(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
): void {
  spawnBurst(scene, pos, 3, 0xaaaaaa, 0.8, 0.5, 0.09);
}

/** Death explosion when an enemy is killed */
export function spawnEnemyDeathBurst(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
  isBoss: boolean,
): void {
  const count = isBoss ? 60 : 28;
  const speed = isBoss ? 10 : 6;
  spawnBurst(scene, pos, count,      0xff4400, speed,       isBoss ? 0.9 : 0.6, 0.18);
  spawnBurst(scene, pos, count / 2,  0xffcc00, speed * 0.7, isBoss ? 0.8 : 0.5, 0.14);
  spawnBurst(scene, pos, count / 3,  0xffffff, speed * 1.2, isBoss ? 0.6 : 0.4, 0.10);
}

// ── Obstacle debris ─────────────────────────────────────────────────────────────────────

interface DebrisChunk {
  mesh: InstanceType<typeof THREE.Mesh>;
  vel: V3;
  rotVel: V3;
  life: number;
  maxLife: number;
}

const debrisChunks: DebrisChunk[] = [];

/** Rocky debris explosion when an obstacle is destroyed */
export function spawnObstacleDebris(
  scene: InstanceType<typeof THREE.Scene>,
  pos: V3,
): void {
  // Particle burst first
  spawnBurst(scene, pos, 18, 0x887766, 7, 0.7, 0.13);
  spawnBurst(scene, pos, 10, 0xffaa44, 5, 0.4, 0.10);

  // 6-10 rocky chunks
  const count = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.18;
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const colVal = 0x556677 + Math.floor(Math.random() * 0x111111);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: colVal }),
    );
    mesh.position.copy(pos);
    mesh.scale.set(
      0.7 + Math.random() * 0.6,
      0.7 + Math.random() * 0.6,
      0.7 + Math.random() * 0.6,
    );
    scene.add(mesh);

    // Random outward velocity
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const spd   = 3 + Math.random() * 5;
    const vel   = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * spd,
      Math.sin(phi) * Math.sin(theta) * spd,
      Math.cos(phi) * spd,
    );
    const rotVel = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
    );
    const life = 0.5 + Math.random() * 0.5;
    debrisChunks.push({ mesh, vel, rotVel, life, maxLife: life });
  }
}

// ── Sword slash arc ────────────────────────────────────────────────────────────────────

interface SwordArc {
  mesh: InstanceType<typeof THREE.Mesh>;
  life: number;
  maxLife: number;
  rotSpeed: number;
}

const swordArcs: SwordArc[] = [];

/**
 * Spawn a glowing crescent arc representing a sword slash.
 * @param scene
 * @param origin  World position of the slash (player position)
 * @param aimDir  Direction the slash faces (toward target)
 * @param color   Beam sword color
 * @param radius  Arc radius (matches sword range)
 */
export function spawnSwordArc(
  scene: InstanceType<typeof THREE.Scene>,
  origin: V3,
  aimDir: V3,
  color: number,
  radius: number,
): void {
  // Build a torus segment as the arc — a partial torus facing the aim direction
  const arcGeo = new THREE.TorusGeometry(radius * 0.7, 0.06, 5, 20, Math.PI * 1.1);
  const arcMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(arcGeo, arcMat);
  mesh.position.copy(origin);
  // Orient arc to face aim direction
  if (aimDir.lengthSq() > 0.01) {
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, aimDir.clone().normalize());
  }
  // Random initial roll so slash looks different each time
  mesh.rotateOnAxis(aimDir.clone().normalize(), Math.random() * Math.PI * 2);
  scene.add(mesh);
  swordArcs.push({ mesh, life: 0.35, maxLife: 0.35, rotSpeed: (Math.random() > 0.5 ? 1 : -1) * 8 });

  // Also spawn a bright particle burst along the arc
  spawnBurst(scene, origin, 14, color, 5, 0.3, 0.12);
  spawnBurst(scene, origin,  6, 0xffffff, 3, 0.2, 0.08);
}

// ── Hit flash on enemy meshes ─────────────────────────────────────────────────
export function spawnHitFlash(
  meshes: Mesh[],
  isWeakPoint: boolean,
): void {
  const flashColor = isWeakPoint ? 0xffffff : 0xff8800;
  const origColors: number[] = [];

  for (const mesh of meshes) {
    const mat = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>
              | InstanceType<typeof THREE.MeshBasicMaterial>;
    // Store original color as hex number
    origColors.push(mat.color.getHex());
    mat.color.setHex(flashColor);
  }

  // Remove any existing flash on these same meshes first
  for (let i = flashes.length - 1; i >= 0; i--) {
    if (flashes[i].targets === meshes) flashes.splice(i, 1);
  }

  flashes.push({ targets: meshes, origColors, timer: isWeakPoint ? 0.12 : 0.08 });
}

// ── Per-frame update ──────────────────────────────────────────────────────────
export function updateEffects(
  scene: InstanceType<typeof THREE.Scene>,
  dt: number,
): void {
  // Update bursts
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
      bursts.splice(i, 1);
      continue;
    }

    const posAttr = b.points.geometry.attributes['position'] as
      InstanceType<typeof THREE.BufferAttribute>;
    const arr = posAttr.array as Float32Array;
    const fade = b.life / b.maxLife;
    const mat = b.points.material as InstanceType<typeof THREE.PointsMaterial>;
    mat.opacity = fade * fade; // ease-out fade

    for (let p = 0; p < arr.length / 3; p++) {
      arr[p * 3]     += b.velocities[p * 3]     * dt;
      arr[p * 3 + 1] += b.velocities[p * 3 + 1] * dt;
      arr[p * 3 + 2] += b.velocities[p * 3 + 2] * dt;
      // Light drag
      b.velocities[p * 3]     *= 0.96;
      b.velocities[p * 3 + 1] *= 0.96;
      b.velocities[p * 3 + 2] *= 0.96;
    }
    posAttr.needsUpdate = true;
  }

  // Update debris chunks
  for (let i = debrisChunks.length - 1; i >= 0; i--) {
    const d = debrisChunks[i];
    d.life -= dt;
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
      debrisChunks.splice(i, 1);
      continue;
    }
    d.mesh.position.addScaledVector(d.vel, dt);
    d.vel.multiplyScalar(0.88); // drag
    d.mesh.rotation.x += d.rotVel.x * dt;
    d.mesh.rotation.y += d.rotVel.y * dt;
    d.mesh.rotation.z += d.rotVel.z * dt;
    const fade = d.life / d.maxLife;
    (d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = fade;
    (d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).transparent = true;
  }

  // Update sword arcs
  for (let i = swordArcs.length - 1; i >= 0; i--) {
    const a = swordArcs[i];
    a.life -= dt;
    if (a.life <= 0) {
      scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      (a.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
      swordArcs.splice(i, 1);
      continue;
    }
    // Spin the arc as it fades
    a.mesh.rotation.y += a.rotSpeed * dt;
    const fade = a.life / a.maxLife;
    const mat = a.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    mat.opacity = fade * 0.9;
    // Scale up slightly as it expands outward
    const s = 1 + (1 - fade) * 0.5;
    a.mesh.scale.setScalar(s);
  }

  // Restore hit-flash colors
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.timer -= dt;
    if (f.timer <= 0) {
      for (let m = 0; m < f.targets.length; m++) {
        const mat = f.targets[m].material as
          InstanceType<typeof THREE.MeshStandardMaterial>;
        mat.color.setHex(f.origColors[m]);
      }
      flashes.splice(i, 1);
    }
  }
}
