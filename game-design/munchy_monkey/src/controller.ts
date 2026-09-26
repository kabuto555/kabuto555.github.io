// Camera-relative character movement, raycast-to-ground gravity/jump, and a
// Box3 AABB collision helper. Core THREE only (global THREE — no addon
// imports). The character body is built from core mesh geometry
// (CapsuleGeometry/SphereGeometry in a Group) — NOT the addon Capsule
// collision-math class.

// Upper bound on a single frame's delta-seconds. On mobile a backgrounded tab
// can deliver a multi-second dt on refocus; feeding that raw into the linear
// position/velocity integration below would teleport the character (or launch
// it via accumulated gravity). Exponential damping self-saturates and doesn't
// need this, but the linear terms do.
const MAX_DT = 0.1;

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export interface CharacterBodyOptions {
  radius?: number;
  height?: number;
  color?: number;
}

/**
 * A simple humanoid stand-in built from core primitives (capsule body +
 * sphere head) in a Group, so it can be positioned/rotated as one unit and
 * animated via child pivots. This is a graybox body, not the addon
 * `Capsule` collision-math class.
 */
export function createCharacterBody(options: CharacterBodyOptions = {}): import('three').Group {
  const radius = options.radius ?? 0.4;
  const height = options.height ?? 1.6;
  const color = options.color ?? 0xffffff;

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color });

  const bodyLength = Math.max(height - radius * 2, 0.05);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius, bodyLength, 4, 8), material);
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 12), material);
  head.position.y = height - radius * 0.4;
  head.castShadow = true;
  group.add(head);

  return group;
}

export interface CharacterControllerOptions {
  moveSpeed?: number;
  turnDamping?: number;
  gravity?: number;
  jumpSpeed?: number;
  groundRaycastOffset?: number;
  groundLevel?: number;
}

/**
 * Camera-relative movement + rotate-to-face for a character root Object3D,
 * plus raycast-to-ground gravity/jump. `cameraYaw` (radians) supplies the
 * "forward" direction so input.y/x map onto camera-relative world axes
 * regardless of orbit/follow camera state.
 */
export class CharacterController {
  readonly root: import('three').Object3D;

  private readonly moveSpeed: number;
  private readonly turnDamping: number;
  private readonly gravity: number;
  private readonly jumpSpeed: number;
  private readonly groundRaycastOffset: number;
  private readonly groundLevel: number;

  private readonly raycaster = new THREE.Raycaster();
  private readonly downVector = new THREE.Vector3(0, -1, 0);
  private velocityY = 0;
  private grounded = false;
  private jumpHeld = false;

  constructor(root: import('three').Object3D, options: CharacterControllerOptions = {}) {
    this.root = root;
    this.moveSpeed = options.moveSpeed ?? 4;
    this.turnDamping = options.turnDamping ?? 12;
    this.gravity = options.gravity ?? 18;
    this.jumpSpeed = options.jumpSpeed ?? 7;
    this.groundRaycastOffset = options.groundRaycastOffset ?? 2;
    this.groundLevel = options.groundLevel ?? 0;
  }

  /**
   * Advance the character one frame.
   * @param moveInput {x,y} input (joystick/keyboard), x = strafe, y = forward(-)/back(+); magnitude below 1 gives proportional (analog) speed
   * @param jumpPressed raw jump button/key held-state; the controller edge-detects internally, so holding does not auto-repeat the jump
   * @param cameraYaw current camera yaw in radians, used to make movement camera-relative
   * @param dt delta seconds
   * @param groundObjects optional meshes to raycast against for ground height; falls back to groundLevel
   */
  update(
    moveInput: { x: number; y: number },
    jumpPressed: boolean,
    cameraYaw: number,
    dt: number,
    groundObjects: import('three').Object3D[] = [],
  ): void {
    dt = Math.min(dt, MAX_DT);
    const inputLength = Math.hypot(moveInput.x, moveInput.y);

    if (inputLength > 0.001) {
      const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
      const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

      const moveDirection = new THREE.Vector3()
        .addScaledVector(right, moveInput.x)
        .addScaledVector(forward, -moveInput.y);
      // Cap at unit length so diagonal keyboard input isn't faster, WITHOUT
      // discarding analog joystick deflection below full travel — clampLength
      // preserves sub-unit magnitude for proportional-speed movement.
      moveDirection.clampLength(0, 1);

      this.root.position.addScaledVector(moveDirection, this.moveSpeed * dt);

      if (moveDirection.lengthSq() > 0) {
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        const factor = 1 - Math.exp(-this.turnDamping * dt);
        this.root.rotation.y += shortestAngleDelta(this.root.rotation.y, targetAngle) * factor;
      }
    }

    this.applyGravityAndGround(groundObjects, dt);

    // Edge-trigger: jump only on the press's rising edge, so a held button
    // doesn't re-fire every frame the character is grounded (bunny-hop).
    if (jumpPressed && !this.jumpHeld && this.grounded) {
      this.velocityY = this.jumpSpeed;
      this.grounded = false;
    }
    this.jumpHeld = jumpPressed;
  }

  private applyGravityAndGround(groundObjects: import('three').Object3D[], dt: number): void {
    this.velocityY -= this.gravity * dt;
    this.root.position.y += this.velocityY * dt;

    if (groundObjects.length > 0) {
      const origin = this.root.position.clone();
      origin.y += this.groundRaycastOffset;
      this.raycaster.set(origin, this.downVector);
      const hits = this.raycaster.intersectObjects(groundObjects, true);
      if (hits.length > 0 && this.root.position.y <= hits[0].point.y) {
        this.root.position.y = hits[0].point.y;
        this.velocityY = 0;
        this.grounded = true;
        return;
      }
      this.grounded = false;
      return;
    }

    if (this.root.position.y <= this.groundLevel) {
      this.root.position.y = this.groundLevel;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  isGrounded(): boolean {
    return this.grounded;
  }
}

/** World-space AABB for an Object3D (and its descendants). */
export function getWorldAABB(object: import('three').Object3D): import('three').Box3 {
  return new THREE.Box3().setFromObject(object);
}

/** True if the world-space AABBs of two objects overlap. */
export function intersectsAABB(a: import('three').Object3D, b: import('three').Object3D): boolean {
  return getWorldAABB(a).intersectsBox(getWorldAABB(b));
}

/**
 * Minimal-translation correction (world-space, XZ-plane) to push `mover`
 * out of `obstacle` along whichever axis has the smaller overlap. Returns a
 * zero vector when the two AABBs don't intersect.
 */
export function resolveAABBOverlap(mover: import('three').Object3D, obstacle: import('three').Object3D): import('three').Vector3 {
  const moverBox = getWorldAABB(mover);
  const obstacleBox = getWorldAABB(obstacle);
  const correction = new THREE.Vector3();
  if (!moverBox.intersectsBox(obstacleBox)) return correction;

  const overlapX = Math.min(moverBox.max.x, obstacleBox.max.x) - Math.max(moverBox.min.x, obstacleBox.min.x);
  const overlapZ = Math.min(moverBox.max.z, obstacleBox.max.z) - Math.max(moverBox.min.z, obstacleBox.min.z);

  const moverCenter = new THREE.Vector3();
  moverBox.getCenter(moverCenter);
  const obstacleCenter = new THREE.Vector3();
  obstacleBox.getCenter(obstacleCenter);

  if (overlapX < overlapZ) {
    correction.x = moverCenter.x > obstacleCenter.x ? overlapX : -overlapX;
  } else {
    correction.z = moverCenter.z > obstacleCenter.z ? overlapZ : -overlapZ;
  }
  return correction;
}
