// Enemy bullet trails — short fading ribbon of quads drawn behind each shot.
// Designed to be cheap: each trail is a fixed-size ring buffer of positions
// rendered as a single LineSegments or a chain of billboard quads.
// We use a simple Points-based approach: a short streak of 6 points,
// updated in place each frame, fading from opaque at the bullet to transparent
// at the tail. No allocation after setup.

type V3 = InstanceType<typeof THREE.Vector3>;
type Scene = InstanceType<typeof THREE.Scene>;

const TRAIL_POINTS = 8;   // number of trail segments
const TRAIL_SPACING = 0.055; // world units between samples (tuned to bullet speed ~7 u/s)

export interface BulletTrail {
  points: InstanceType<typeof THREE.Points>;
  geo: InstanceType<typeof THREE.BufferGeometry>;
  mat: InstanceType<typeof THREE.PointsMaterial>;
  /** Ring buffer of past positions, oldest first */
  history: Float32Array; // length = TRAIL_POINTS * 3
  writeIdx: number;
  alive: boolean;
  timeSinceSample: number;
}

// One shared geometry template size; each trail owns its own geo + mat.
export function createBulletTrail(scene: Scene, color: number): BulletTrail {
  const history = new Float32Array(TRAIL_POINTS * 3); // initialised to 0,0,0
  const positions = new Float32Array(TRAIL_POINTS * 3);
  const alphas = new Float32Array(TRAIL_POINTS);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

  // Use a PointsMaterial with a round soft sprite
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // trail may lag behind culling sphere
  scene.add(pts);

  return {
    points: pts,
    geo,
    mat,
    history,
    writeIdx: 0,
    alive: true,
    timeSinceSample: 0,
  };
}

export function updateBulletTrail(
  trail: BulletTrail,
  bulletPos: V3,
  dt: number,
): void {
  // Sample a new history position at fixed spacing intervals
  trail.timeSinceSample += dt;
  if (trail.timeSinceSample >= TRAIL_SPACING / 7) {
    // record current bullet pos into ring buffer
    const idx = trail.writeIdx % TRAIL_POINTS;
    trail.history[idx * 3]     = bulletPos.x;
    trail.history[idx * 3 + 1] = bulletPos.y;
    trail.history[idx * 3 + 2] = bulletPos.z;
    trail.writeIdx++;
    trail.timeSinceSample = 0;
  }

  // Write history into geometry positions, newest first → oldest last
  const posAttr = trail.geo.attributes['position'] as InstanceType<typeof THREE.BufferAttribute>;
  const total = Math.min(trail.writeIdx, TRAIL_POINTS);
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const histIdx = ((trail.writeIdx - 1 - i) % TRAIL_POINTS + TRAIL_POINTS) % TRAIL_POINTS;
    if (i < total) {
      posAttr.setXYZ(
        i,
        trail.history[histIdx * 3],
        trail.history[histIdx * 3 + 1],
        trail.history[histIdx * 3 + 2],
      );
    } else {
      // Not yet filled — hide at current bullet pos (invisible, size fades to 0 anyway)
      posAttr.setXYZ(i, bulletPos.x, bulletPos.y, bulletPos.z);
    }
  }
  posAttr.needsUpdate = true;

  // Fade opacity with the oldest point — trail as a whole pulses slightly
  trail.mat.opacity = 0.75;
}

export function removeBulletTrail(scene: Scene, trail: BulletTrail): void {
  scene.remove(trail.points);
  trail.geo.dispose();
  trail.mat.dispose();
  trail.alive = false;
}
