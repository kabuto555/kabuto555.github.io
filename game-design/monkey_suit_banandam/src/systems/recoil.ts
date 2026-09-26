// Recoil system — positional + rotational kick with damped spring snap-back.
// Rotation is much more visible at camera distance than position alone.

type V3 = InstanceType<typeof THREE.Vector3>;

export interface RecoilState {
  // Positional displacement (world units)
  offset: V3;
  velPos: V3;
  // Angular displacement (radians, applied as local Euler rotateX/Y/Z)
  angleX: number; // pitch — nose up/down
  angleY: number; // yaw   — nose left/right
  angleZ: number; // roll
  velAngX: number;
  velAngY: number;
  velAngZ: number;
}

export function createRecoilState(): RecoilState {
  return {
    offset: new THREE.Vector3(),
    velPos: new THREE.Vector3(),
    angleX: 0, angleY: 0, angleZ: 0,
    velAngX: 0, velAngY: 0, velAngZ: 0,
  };
}

/**
 * Apply a recoil kick.
 * @param posKick    Positional kick vector (world direction * strength)
 * @param angKick    Angular kick {x,y,z} in radians — added to angular velocity
 */
export function applyRecoilKick(
  state: RecoilState,
  posKick: V3,
  angKick: { x?: number; y?: number; z?: number },
): void {
  state.velPos.add(posKick);
  state.velAngX += angKick.x ?? 0;
  state.velAngY += angKick.y ?? 0;
  state.velAngZ += angKick.z ?? 0;
}

/** Integrate one frame. Returns true if still active. */
export function updateRecoil(
  state: RecoilState,
  dt: number,
  stiffness = 220,
  damping = 20,
): void {
  // Positional spring
  const apx = -stiffness * state.offset.x - damping * state.velPos.x;
  const apy = -stiffness * state.offset.y - damping * state.velPos.y;
  const apz = -stiffness * state.offset.z - damping * state.velPos.z;
  state.velPos.x += apx * dt; state.offset.x += state.velPos.x * dt;
  state.velPos.y += apy * dt; state.offset.y += state.velPos.y * dt;
  state.velPos.z += apz * dt; state.offset.z += state.velPos.z * dt;

  // Angular springs (same stiffness, same damping)
  state.velAngX += (-stiffness * state.angleX - damping * state.velAngX) * dt;
  state.angleX  += state.velAngX * dt;
  state.velAngY += (-stiffness * state.angleY - damping * state.velAngY) * dt;
  state.angleY  += state.velAngY * dt;
  state.velAngZ += (-stiffness * state.angleZ - damping * state.velAngZ) * dt;
  state.angleZ  += state.velAngZ * dt;

  // Zero out micro-jitter
  const posRest = state.offset.lengthSq() < 0.000001 && state.velPos.lengthSq() < 0.000001;
  const angRest = Math.abs(state.angleX) < 0.0001 && Math.abs(state.angleY) < 0.0001
               && Math.abs(state.angleZ) < 0.0001 && Math.abs(state.velAngX) < 0.0001
               && Math.abs(state.velAngY) < 0.0001 && Math.abs(state.velAngZ) < 0.0001;
  if (posRest) { state.offset.set(0,0,0); state.velPos.set(0,0,0); }
  if (angRest) { state.angleX=0; state.angleY=0; state.angleZ=0;
                 state.velAngX=0; state.velAngY=0; state.velAngZ=0; }
}

/**
 * Apply the recoil state's angular offset to a mesh's rotation (after lookAt/quaternion).
 * Call after setting position and orientation.
 */
export function applyRecoilRotation(
  state: RecoilState,
  obj: InstanceType<typeof THREE.Object3D>,
): void {
  if (state.angleX !== 0) obj.rotateX(state.angleX);
  if (state.angleY !== 0) obj.rotateY(state.angleY);
  if (state.angleZ !== 0) obj.rotateZ(state.angleZ);
}
