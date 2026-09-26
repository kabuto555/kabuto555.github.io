// Touch-first input primitives: keyboard held-key state, a Pointer-Events
// virtual joystick, and a Pointer-Events action button. No THREE reference —
// this module is pure DOM + math so it stays importable outside a browser.

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Pure joystick math: given a joystick base center and a pointer position,
 * return the normalized (-1..1 per axis, magnitude clamped to 1) stick
 * vector. Kept free of any DOM/THREE reference so it can be unit tested
 * without a browser or the global THREE runtime.
 */
export function joystickVector(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number,
  radius: number,
): Vec2 {
  if (!(radius > 0)) return { x: 0, y: 0 };

  const dx = pointerX - centerX;
  const dy = pointerY - centerY;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };

  const clampedDist = Math.min(dist, radius);
  const scale = clampedDist / radius / dist;
  return { x: dx * scale, y: dy * scale };
}

/** Tracks currently-held keyboard keys via KeyboardEvent.code. */
export class KeyboardInput {
  private readonly held = new Set<string>();
  private readonly target: Window;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.held.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  constructor(target: Window = window) {
    this.target = target;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** WASD/arrow-key movement collapsed to a normalized {x,y} vector. */
  getMoveVector(): Vec2 {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) -
      (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0) -
      (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0);
    const length = Math.hypot(x, y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
  }
}

export interface JoystickOptions {
  container?: HTMLElement;
  size?: number;
  left?: string;
  bottom?: string;
}

/**
 * A DOM-overlay virtual joystick driven entirely by Pointer Events. Uses
 * setPointerCapture so drag tracking survives the finger leaving the base,
 * and touch-action: none so the browser never intercepts the gesture as a
 * page scroll/zoom.
 */
export class VirtualJoystick {
  readonly base: HTMLDivElement;
  readonly stick: HTMLDivElement;

  private readonly radius: number;
  private vector: Vec2 = { x: 0, y: 0 };
  private activePointerId: number | null = null;

  constructor(options: JoystickOptions = {}) {
    const size = options.size ?? 120;
    this.radius = size / 2;
    const container = options.container ?? document.body;

    this.base = document.createElement('div');
    this.base.style.position = 'absolute';
    this.base.style.left = options.left ?? '24px';
    this.base.style.bottom = options.bottom ?? '24px';
    this.base.style.width = `${size}px`;
    this.base.style.height = `${size}px`;
    this.base.style.borderRadius = '50%';
    this.base.style.background = 'rgba(255,255,255,0.15)';
    this.base.style.touchAction = 'none';
    this.base.style.pointerEvents = 'auto';
    this.base.style.zIndex = '20';

    this.stick = document.createElement('div');
    const stickSize = size * 0.5;
    this.stick.style.position = 'absolute';
    this.stick.style.left = '50%';
    this.stick.style.top = '50%';
    this.stick.style.width = `${stickSize}px`;
    this.stick.style.height = `${stickSize}px`;
    this.stick.style.marginLeft = `${-stickSize / 2}px`;
    this.stick.style.marginTop = `${-stickSize / 2}px`;
    this.stick.style.borderRadius = '50%';
    this.stick.style.background = 'rgba(255,255,255,0.4)';
    this.stick.style.pointerEvents = 'none';

    this.base.appendChild(this.stick);
    container.appendChild(this.base);

    this.base.addEventListener('pointerdown', this.handlePointerDown);
    this.base.addEventListener('pointermove', this.handlePointerMove);
    this.base.addEventListener('pointerup', this.handlePointerEnd);
    this.base.addEventListener('pointercancel', this.handlePointerEnd);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.activePointerId = event.pointerId;
    this.base.setPointerCapture(event.pointerId);
    this.updateFromClient(event.clientX, event.clientY);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.updateFromClient(event.clientX, event.clientY);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.vector = { x: 0, y: 0 };
    this.stick.style.transform = 'translate(0px, 0px)';
  };

  private updateFromClient(clientX: number, clientY: number): void {
    const rect = this.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    this.vector = joystickVector(centerX, centerY, clientX, clientY, this.radius);
    this.stick.style.transform =
      `translate(${this.vector.x * this.radius}px, ${this.vector.y * this.radius}px)`;
  }

  /** Current normalized stick vector; {x:0,y:0} when idle. */
  getVector(): Vec2 {
    return { x: this.vector.x, y: this.vector.y };
  }

  dispose(): void {
    this.base.removeEventListener('pointerdown', this.handlePointerDown);
    this.base.removeEventListener('pointermove', this.handlePointerMove);
    this.base.removeEventListener('pointerup', this.handlePointerEnd);
    this.base.removeEventListener('pointercancel', this.handlePointerEnd);
    this.base.remove();
  }
}

export interface ActionButtonOptions {
  container?: HTMLElement;
  label?: string;
  size?: number;
  right?: string;
  bottom?: string;
}

/** A DOM-overlay action/jump button driven by Pointer Events. */
export class ActionButton {
  readonly element: HTMLDivElement;

  private pressed = false;
  private activePointerId: number | null = null;

  constructor(options: ActionButtonOptions = {}) {
    const size = options.size ?? 72;
    const container = options.container ?? document.body;

    this.element = document.createElement('div');
    this.element.textContent = options.label ?? '';
    this.element.style.position = 'absolute';
    this.element.style.right = options.right ?? '24px';
    this.element.style.bottom = options.bottom ?? '24px';
    this.element.style.width = `${size}px`;
    this.element.style.height = `${size}px`;
    this.element.style.borderRadius = '50%';
    this.element.style.background = 'rgba(255,255,255,0.2)';
    this.element.style.display = 'flex';
    this.element.style.alignItems = 'center';
    this.element.style.justifyContent = 'center';
    this.element.style.touchAction = 'none';
    this.element.style.pointerEvents = 'auto';
    this.element.style.userSelect = 'none';
    this.element.style.zIndex = '20';

    container.appendChild(this.element);

    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointerup', this.handlePointerEnd);
    this.element.addEventListener('pointercancel', this.handlePointerEnd);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pressed = true;
    this.activePointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.pressed = false;
    this.activePointerId = null;
  };

  isPressed(): boolean {
    return this.pressed;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointerup', this.handlePointerEnd);
    this.element.removeEventListener('pointercancel', this.handlePointerEnd);
    this.element.remove();
  }
}
