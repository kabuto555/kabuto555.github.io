// Hand-rolled, touch-first camera rigs built on core THREE only (global
// THREE — no addon imports, no import * as THREE). All smoothing uses
// frame-rate-independent exponential damping: factor = 1 - exp(-k * dt),
// never a fixed per-frame lerp constant.

import { getSafeLayout, pointInRect } from './safe-layout';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface OrbitCameraOptions {
  target?: import('three').Vector3;
  radius?: number;
  minRadius?: number;
  maxRadius?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  rotateSpeed?: number;
  damping?: number;
}

/**
 * Drag-to-orbit + pinch-to-zoom camera rig around a fixed target, built on
 * THREE.Spherical. Multi-touch aware: a second pointer switches from orbit
 * drag to pinch zoom.
 */
export class OrbitCamera {
  readonly camera: import('three').PerspectiveCamera;
  readonly target: import('three').Vector3;

  private readonly element: HTMLElement;
  private readonly minRadius: number;
  private readonly maxRadius: number;
  private readonly minPolarAngle: number;
  private readonly maxPolarAngle: number;
  private readonly rotateSpeed: number;
  private readonly damping: number;

  private readonly current: import('three').Spherical;
  private readonly desired: import('three').Spherical;

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinchStartDistance = 0;
  private pinchStartRadius = 0;

  constructor(camera: import('three').PerspectiveCamera, element: HTMLElement, options: OrbitCameraOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.target = options.target ?? new THREE.Vector3(0, 0, 0);
    this.minRadius = options.minRadius ?? 2;
    this.maxRadius = options.maxRadius ?? 20;
    this.minPolarAngle = options.minPolarAngle ?? 0.15;
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.15;
    this.rotateSpeed = options.rotateSpeed ?? 0.006;
    this.damping = options.damping ?? 10;

    const offset = new THREE.Vector3().subVectors(camera.position, this.target);
    this.current = new THREE.Spherical().setFromVector3(offset);
    if (options.radius !== undefined) this.current.radius = options.radius;
    this.desired = this.current.clone();

    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerEnd);
    element.addEventListener('pointercancel', this.handlePointerEnd);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    // Don't let an orbit-drag/pinch gesture hijack a tap meant for the player
    // app's floating overlay (see safe-layout.ts's keep-out rect) — measured
    // in the element's own client box so it lines up with clientX/clientY.
    const bounds = this.element.getBoundingClientRect();
    const { keepOutRect } = getSafeLayout(bounds.width, bounds.height, this.element);
    if (pointInRect(event.clientX - bounds.left, event.clientY - bounds.top, keepOutRect)) return;

    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    } else if (this.pointers.size === 2) {
      this.dragging = false;
      const [a, b] = [...this.pointers.values()];
      this.pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStartRadius = this.desired.radius;
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStartDistance > 0) {
        const scale = this.pinchStartDistance / distance;
        this.desired.radius = clamp(this.pinchStartRadius * scale, this.minRadius, this.maxRadius);
      }
      return;
    }

    if (this.dragging) {
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.desired.theta -= dx * this.rotateSpeed;
      this.desired.phi = clamp(this.desired.phi - dy * this.rotateSpeed, this.minPolarAngle, this.maxPolarAngle);
    }
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.dragging = this.pointers.size === 1;
    if (this.pointers.size === 0) this.pinchStartDistance = 0;
  };

  /** Advance the smoothed camera state; call once per frame with delta seconds. */
  update(dt: number): void {
    const factor = 1 - Math.exp(-this.damping * dt);
    this.current.theta += (this.desired.theta - this.current.theta) * factor;
    this.current.phi += (this.desired.phi - this.current.phi) * factor;
    this.current.radius += (this.desired.radius - this.current.radius) * factor;
    this.current.makeSafe();

    const offset = new THREE.Vector3().setFromSpherical(this.current);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerEnd);
    this.element.removeEventListener('pointercancel', this.handlePointerEnd);
  }
}

export interface ThirdPersonCameraOptions {
  offset?: import('three').Vector3;
  lookAtOffset?: import('three').Vector3;
  damping?: number;
}

/**
 * Smoothed third-person follow camera: trails a target's position/rotation
 * with a local-space offset (behind + above), damped exponentially so
 * catch-up speed is frame-rate independent.
 */
export class ThirdPersonCamera {
  readonly camera: import('three').PerspectiveCamera;

  private readonly offset: import('three').Vector3;
  private readonly lookAtOffset: import('three').Vector3;
  private readonly damping: number;
  private readonly currentPosition = new THREE.Vector3();
  private readonly currentLookAt = new THREE.Vector3();
  private initialized = false;

  constructor(camera: import('three').PerspectiveCamera, options: ThirdPersonCameraOptions = {}) {
    this.camera = camera;
    this.offset = options.offset ?? new THREE.Vector3(0, 3, -6);
    this.lookAtOffset = options.lookAtOffset ?? new THREE.Vector3(0, 1, 0);
    this.damping = options.damping ?? 6;
  }

  /** Advance the follow camera toward `target`; call once per frame. */
  update(target: import('three').Object3D, dt: number): void {
    const desiredPosition = this.offset.clone().applyQuaternion(target.quaternion).add(target.position);
    const desiredLookAt = this.lookAtOffset.clone().add(target.position);

    if (!this.initialized) {
      this.currentPosition.copy(desiredPosition);
      this.currentLookAt.copy(desiredLookAt);
      this.initialized = true;
    } else {
      const factor = 1 - Math.exp(-this.damping * dt);
      this.currentPosition.lerp(desiredPosition, factor);
      this.currentLookAt.lerp(desiredLookAt, factor);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}

export interface FirstPersonLookOptions {
  sensitivity?: number;
  minPitch?: number;
  maxPitch?: number;
  damping?: number;
}

/**
 * First-person drag-look. Deliberately NOT PointerLock — PointerLock is
 * unavailable on mobile browsers, so look input is a plain drag gesture via
 * Pointer Events instead.
 */
export class FirstPersonLook {
  readonly camera: import('three').PerspectiveCamera;

  private readonly element: HTMLElement;
  private readonly sensitivity: number;
  private readonly minPitch: number;
  private readonly maxPitch: number;
  private readonly damping: number;

  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private activePointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(camera: import('three').PerspectiveCamera, element: HTMLElement, options: FirstPersonLookOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.sensitivity = options.sensitivity ?? 0.0035;
    this.minPitch = options.minPitch ?? -Math.PI / 2 + 0.05;
    this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.05;
    this.damping = options.damping ?? 14;

    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerEnd);
    element.addEventListener('pointercancel', this.handlePointerEnd);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    // Same keep-out guard OrbitCamera.handlePointerDown carries: a look-drag
    // must not hijack a tap meant for the player app's floating overlay.
    const bounds = this.element.getBoundingClientRect();
    const { keepOutRect } = getSafeLayout(bounds.width, bounds.height, this.element);
    if (pointInRect(event.clientX - bounds.left, event.clientY - bounds.top, keepOutRect)) return;

    this.activePointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.targetYaw -= dx * this.sensitivity;
    this.targetPitch = clamp(this.targetPitch - dy * this.sensitivity, this.minPitch, this.maxPitch);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
  };

  /** Advance smoothed yaw/pitch and apply to the camera; call once per frame. */
  update(dt: number): void {
    const factor = 1 - Math.exp(-this.damping * dt);
    this.yaw += (this.targetYaw - this.yaw) * factor;
    this.pitch += (this.targetPitch - this.pitch) * factor;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  /** Current smoothed yaw (radians), useful for camera-relative movement. */
  getYaw(): number {
    return this.yaw;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerEnd);
    this.element.removeEventListener('pointercancel', this.handlePointerEnd);
  }
}
