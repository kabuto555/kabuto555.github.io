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
  /** Resting spot (bottom-left) when nobody's touching it. */
  left?: string;
  bottom?: string;
  /** Fraction of the screen height, from the bottom, where a touch summons the stick. */
  zoneHeight?: number;
}

/**
 * A floating virtual joystick driven entirely by Pointer Events. Touch anywhere in the
 * bottom `zoneHeight` of the screen and the stick appears under your thumb; let go and it
 * drifts back to its resting spot (bottom-left). Buttons stacked above the zone (higher
 * z-index) still get their own taps. setPointerCapture keeps the drag alive when the finger
 * leaves the zone; touch-action: none stops the browser scrolling / zooming.
 */
export class VirtualJoystick {
  readonly base: HTMLDivElement;
  readonly stick: HTMLDivElement;
  /** The touch area (bottom of the screen). */
  readonly zone: HTMLDivElement;

  private readonly radius: number;
  private readonly size: number;
  private vector: Vec2 = { x: 0, y: 0 };
  private activePointerId: number | null = null;
  private center = { x: 0, y: 0 };
  private showAtRest = true;
  private visible = true;
  private readonly rest: { left: string; bottom: string };

  constructor(options: JoystickOptions = {}) {
    const size = options.size ?? 120;
    this.size = size;
    this.radius = size / 2;
    const container = options.container ?? document.body;
    this.rest = { left: options.left ?? '28px', bottom: options.bottom ?? '28px' };

    this.zone = document.createElement('div');
    this.zone.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${(options.zoneHeight ?? 1 / 3) * 100}%;` +
      'touch-action:none;pointer-events:auto;z-index:19;-webkit-user-select:none;user-select:none;';

    // Clay look to match the action buttons: a soft dark well, a cream knob with a brown rim.
    this.base = document.createElement('div');
    this.base.style.cssText = `position:absolute;left:${this.rest.left};bottom:${this.rest.bottom};` +
      `width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;` +
      'background:rgba(58,36,21,0.2);border:3px solid rgba(255,248,234,0.6);pointer-events:none;z-index:19;' +
      'transition:opacity 160ms ease;';

    this.stick = document.createElement('div');
    const stickSize = Math.round(size * 0.46);
    this.stick.style.cssText = `position:absolute;left:50%;top:50%;width:${stickSize}px;height:${stickSize}px;` +
      `margin-left:${-stickSize / 2}px;margin-top:${-stickSize / 2}px;border-radius:50%;box-sizing:border-box;` +
      'background:#e4d4b3;border:4px solid #6d5236;box-shadow:0 3px 0 #3a2917;pointer-events:none;';

    this.base.appendChild(this.stick);
    container.append(this.zone, this.base);

    this.zone.addEventListener('pointerdown', this.handlePointerDown);
    this.zone.addEventListener('pointermove', this.handlePointerMove);
    this.zone.addEventListener('pointerup', this.handlePointerEnd);
    this.zone.addEventListener('pointercancel', this.handlePointerEnd);
    this.applyRest();
  }

  /** Off = the stick only shows while you're using it. */
  setShowAtRest(show: boolean): void {
    this.showAtRest = show;
    if (this.activePointerId === null) this.applyRest();
  }

  /** Hide / show the whole control (zone included), e.g. in minigames that don't use it. */
  setVisible(v: boolean): void {
    this.visible = v;
    this.zone.style.display = v ? '' : 'none';
    this.base.style.display = v ? '' : 'none';
    if (!v) this.release();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return; // one thumb steers
    this.activePointerId = event.pointerId;
    try { this.zone.setPointerCapture(event.pointerId); } catch { /* synthetic pointer: fine without */ }
    // Centre the stick under the thumb, kept fully on screen.
    const host = this.zone.getBoundingClientRect();
    const r = this.radius;
    this.center = {
      x: Math.min(Math.max(event.clientX, host.left + r + 4), host.right - r - 4),
      y: Math.min(Math.max(event.clientY, host.top + r), host.bottom - r - 4),
    };
    const parent = (this.base.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? host;
    this.base.style.transition = 'opacity 120ms ease';
    this.base.style.left = `${this.center.x - parent.left - r}px`;
    this.base.style.bottom = `${parent.bottom - this.center.y - r}px`;
    this.base.style.opacity = '1';
    this.updateFromClient(event.clientX, event.clientY);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.updateFromClient(event.clientX, event.clientY);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return;
    this.release();
  };

  private release(): void {
    this.activePointerId = null;
    this.vector = { x: 0, y: 0 };
    this.stick.style.transform = 'translate(0px, 0px)';
    this.applyRest();
  }

  /** Back to the resting spot (bottom-left), shown or hidden per the setting. */
  private applyRest(): void {
    this.base.style.transition = 'opacity 160ms ease, left 180ms ease, bottom 180ms ease';
    this.base.style.left = this.rest.left;
    this.base.style.bottom = this.rest.bottom;
    this.base.style.opacity = this.showAtRest && this.visible ? '0.85' : '0';
  }

  private updateFromClient(clientX: number, clientY: number): void {
    this.vector = joystickVector(this.center.x, this.center.y, clientX, clientY, this.radius);
    this.stick.style.transform =
      `translate(${this.vector.x * this.radius}px, ${this.vector.y * this.radius}px)`;
  }

  /** Current normalized stick vector; {x:0,y:0} when idle. */
  getVector(): Vec2 {
    return { x: this.vector.x, y: this.vector.y };
  }

  /** Stick diameter in CSS px. */
  get diameter(): number { return this.size; }

  dispose(): void {
    this.zone.removeEventListener('pointerdown', this.handlePointerDown);
    this.zone.removeEventListener('pointermove', this.handlePointerMove);
    this.zone.removeEventListener('pointerup', this.handlePointerEnd);
    this.zone.removeEventListener('pointercancel', this.handlePointerEnd);
    this.zone.remove();
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

export interface ClayButtonOptions {
  container?: HTMLElement;
  size?: number;
  right?: string;
  bottom?: string;
  icon?: string;          // inline SVG markup, centred in the button
  iconUrl?: string;       // or an image (icon art), centred
  onTap?: () => void;     // fired on release if it was a tap (for chat / emote)
  ariaLabel?: string;
}

/**
 * A clay-styled circular HUD button (cream face, brown rim, 3D bottom depth) to
 * match the camp's toy look. `isPressed()` drives held actions like jump;
 * `onTap` fires once on release for one-shot actions like chat and emote.
 */
export class ClayButton {
  readonly element: HTMLDivElement;
  private pressed = false;
  private activePointerId: number | null = null;
  private readonly onTap?: () => void;
  private readonly restShadow: string;
  private readonly downShadow = '0 2px 0 #3a2917, inset 0 -2px 0 rgba(0,0,0,0.08)';

  constructor(options: ClayButtonOptions = {}) {
    const size = options.size ?? 80;
    const container = options.container ?? document.body;
    this.onTap = options.onTap;
    this.restShadow = '0 5px 0 #3a2917, 0 6px 8px rgba(0,0,0,0.28), inset 0 -3px 0 rgba(0,0,0,0.08)';

    const el = document.createElement('div');
    this.element = el;
    el.setAttribute('role', 'button');
    if (options.ariaLabel) el.setAttribute('aria-label', options.ariaLabel);
    el.style.cssText = [
      'position:absolute',
      `right:${options.right ?? '24px'}`,
      `bottom:${options.bottom ?? '24px'}`,
      `width:${size}px`, `height:${size}px`,
      'border-radius:50%', 'box-sizing:border-box',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:#e4d4b3',
      `border:${Math.max(3, Math.round(size * 0.07))}px solid #6d5236`,
      `box-shadow:${this.restShadow}`,
      'touch-action:none', 'pointer-events:auto', 'user-select:none',
      '-webkit-user-select:none', 'cursor:pointer',
      'transition:transform 0.06s ease, box-shadow 0.06s ease',
      'z-index:20', 'color:#4a3320',
    ].join(';');

    if (options.iconUrl) {
      el.appendChild(ClayButton.iconImage(options.iconUrl));
    } else if (options.icon) {
      el.innerHTML = options.icon;
      const svg = el.querySelector('svg');
      if (svg) {
        const px = `${Math.round(size * 0.48)}px`;
        svg.style.width = px;
        svg.style.height = px;
        svg.style.display = 'block';
        svg.style.pointerEvents = 'none';
      }
    }

    container.appendChild(el);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.pressed = true;
    this.activePointerId = e.pointerId;
    try { this.element.setPointerCapture(e.pointerId); } catch { /* pointer already gone (or synthetic): fine without capture */ }
    this.element.style.transform = 'translateY(3px) scale(0.96)';
    this.element.style.boxShadow = this.downShadow;
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    const wasPressed = this.pressed;
    this.resetPress();
    if (wasPressed) this.onTap?.();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    this.resetPress();
  };

  private resetPress(): void {
    this.pressed = false;
    this.activePointerId = null;
    this.element.style.transform = '';
    this.element.style.boxShadow = this.restShadow;
  }

  isPressed(): boolean { return this.pressed; }
  setVisible(v: boolean): void { this.element.style.display = v ? 'flex' : 'none'; }

  /** Icon art sized to sit inside the button (72% — the art has its own padding). */
  static iconImage(src: string): HTMLImageElement {
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.draggable = false;
    img.style.cssText = 'width:72%;height:72%;object-fit:contain;pointer-events:none;display:block;';
    return img;
  }
  dispose(): void { this.element.remove(); }
}
