import type { System } from './types';

/** Every bindable action (§3 controls + debug). */
export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump' // also mantles near a ledge
  | 'dodge'
  | 'fire'
  | 'ads'
  | 'reload'
  | 'leftHand' // melee swing / hold to block
  | 'swapRight' // gun slot 1 <-> 2
  | 'swapLeft' // left-hand slot 1 <-> 2
  | 'estus'
  | 'throwGrenade'
  | 'cycleGrenade'
  | 'useQuick'
  | 'cycleQuick'
  | 'interact'
  | 'menu' // does NOT pause
  | 'controlsCard' // F1
  | 'debugOverlay' // F9
  | 'debugFly';

/**
 * Input codes: KeyboardEvent.code ('KeyW', 'ShiftLeft', ...), mouse buttons 'Mouse0' (LMB),
 * 'Mouse1' (MMB), 'Mouse2' (RMB), and wheel impulses 'WheelUp' / 'WheelDown'.
 */
export type InputCode = string;

/** THE bindings table. Rebinding = editing this (or replacing entries at runtime). */
export const BINDINGS: Record<Action, InputCode[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  dodge: ['ControlLeft', 'KeyC'],
  fire: ['Mouse0'],
  ads: ['Mouse2'],
  reload: ['KeyR'],
  leftHand: ['KeyV'],
  swapRight: ['WheelUp', 'WheelDown', 'Digit1'],
  swapLeft: ['Digit2'],
  estus: ['KeyQ'],
  throwGrenade: ['KeyG'],
  cycleGrenade: ['KeyT'],
  useQuick: ['KeyZ'],
  cycleQuick: ['KeyX'],
  interact: ['KeyE'],
  menu: ['Tab', 'Escape'],
  controlsCard: ['F1'],
  debugOverlay: ['F9'],
  debugFly: ['F8'],
};

/** Codes whose browser default we suppress (tab focus, ctrl shortcuts, F1 help, space scroll). */
const PREVENT_DEFAULT = new Set(['Tab', 'Space', 'F1', 'F8', 'F9', 'ControlLeft', 'KeyC']);

/**
 * Keyboard/mouse state with sim-tick edges.
 * - Raw DOM events accumulate between ticks; `update()` (call first each sim tick — register
 *   this as the first System) latches them, so `pressed`/`released` are true for exactly one
 *   tick even if several ticks run in one frame, and taps shorter than a tick are never lost.
 * - Mouse look: `mouseDelta` is the delta for this sim tick. For render-rate camera look
 *   (smoother on 144Hz) use `takeLookDelta()` once per render frame instead — pick one per use.
 */
export class Input implements System {
  readonly name = 'input';
  bindings: Record<Action, InputCode[]>;

  private held = new Set<InputCode>();
  private pressedAcc = new Set<InputCode>();
  private releasedAcc = new Set<InputCode>();
  private pressedTick = new Set<InputCode>();
  private releasedTick = new Set<InputCode>();
  private mdxAcc = 0;
  private mdyAcc = 0;
  private lookX = 0;
  private lookY = 0;
  /** Mouse delta (px) accumulated over the latest sim tick. */
  readonly mouseDelta = { x: 0, y: 0 };
  private lockTarget: HTMLElement | null = null;

  constructor(bindings: Record<Action, InputCode[]> = BINDINGS) {
    this.bindings = bindings;
  }

  // ---- queries (valid during sim update) ----
  /** Held this tick (or tapped since the previous tick). */
  down(a: Action): boolean {
    for (const c of this.bindings[a]) if (this.held.has(c) || this.pressedTick.has(c)) return true;
    return false;
  }
  /** Went down since the previous sim tick. */
  pressed(a: Action): boolean {
    for (const c of this.bindings[a]) if (this.pressedTick.has(c)) return true;
    return false;
  }
  /** Went up since the previous sim tick. */
  released(a: Action): boolean {
    for (const c of this.bindings[a]) if (this.releasedTick.has(c)) return true;
    return false;
  }
  /** -1..1 movement axes from WASD (x = right, y = forward). Not normalized. */
  moveAxis(): { x: number; y: number } {
    return {
      x: (this.down('moveRight') ? 1 : 0) - (this.down('moveLeft') ? 1 : 0),
      y: (this.down('moveForward') ? 1 : 0) - (this.down('moveBack') ? 1 : 0),
    };
  }
  /** Mouse delta since the last call (render-rate look). */
  takeLookDelta(): { x: number; y: number } {
    const d = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return d;
  }

  // ---- System: latch edges at the start of each sim tick ----
  update(_dt: number): void {
    [this.pressedTick, this.pressedAcc] = [this.pressedAcc, this.pressedTick];
    [this.releasedTick, this.releasedAcc] = [this.releasedAcc, this.releasedTick];
    this.pressedAcc.clear();
    this.releasedAcc.clear();
    this.mouseDelta.x = this.mdxAcc;
    this.mouseDelta.y = this.mdyAcc;
    this.mdxAcc = this.mdyAcc = 0;
  }

  // ---- raw feeds (DOM-free, used by attach() and tests) ----
  codeDown(code: InputCode): void {
    if (this.held.has(code)) return; // ignore key repeat
    this.held.add(code);
    this.pressedAcc.add(code);
  }
  codeUp(code: InputCode): void {
    if (!this.held.delete(code)) return;
    this.releasedAcc.add(code);
  }
  wheel(deltaY: number): void {
    const code = deltaY < 0 ? 'WheelUp' : 'WheelDown';
    this.pressedAcc.add(code);
    this.releasedAcc.add(code);
  }
  mouseMove(dx: number, dy: number): void {
    this.mdxAcc += dx;
    this.mdyAcc += dy;
    this.lookX += dx;
    this.lookY += dy;
  }
  /** Release everything (window blur / pointer-lock loss) so keys don't stick. */
  releaseAll(): void {
    for (const c of this.held) this.releasedAcc.add(c);
    this.held.clear();
  }

  // ---- pointer lock ----
  get pointerLocked(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.lockTarget && !!this.lockTarget;
  }
  requestPointerLock(el: HTMLElement): void {
    this.lockTarget = el;
    try {
      const r = el.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch {
      /* lock refused (e.g. no user gesture) */
    }
  }
  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** True if `code` is bound to any action. */
  isBound(code: InputCode): boolean {
    for (const a in this.bindings) if (this.bindings[a as Action].includes(code)) return true;
    return false;
  }

  /** Wire DOM listeners. Returns a detach function. */
  attach(target: Window = window): () => void {
    const kd = (e: KeyboardEvent) => {
      // Stop Ctrl/Cmd+R/S/D/F/A etc. (Ctrl is the dodge key) and held-key browser shortcuts.
      if (PREVENT_DEFAULT.has(e.code) || (this.isBound(e.code) && (e.ctrlKey || e.metaKey || this.held.size > 0))) {
        e.preventDefault();
      }
      this.codeDown(e.code);
    };
    const ku = (e: KeyboardEvent) => this.codeUp(e.code);
    // Game actions only while pointer-locked, so the lock-acquiring click doesn't fire.
    // Releases are never gated, so held state always clears.
    const md = (e: MouseEvent) => {
      if (this.pointerLocked) this.codeDown(`Mouse${e.button}`);
    };
    const mu = (e: MouseEvent) => this.codeUp(`Mouse${e.button}`);
    const mm = (e: MouseEvent) => {
      if (this.pointerLocked) this.mouseMove(e.movementX, e.movementY);
    };
    const wh = (e: WheelEvent) => {
      if (e.deltaY !== 0) this.wheel(e.deltaY);
    };
    const ctx = (e: Event) => e.preventDefault();
    const blur = () => this.releaseAll();
    const plc = () => {
      if (!this.pointerLocked) this.releaseAll();
    };
    target.addEventListener('keydown', kd);
    target.addEventListener('keyup', ku);
    target.addEventListener('mousedown', md);
    target.addEventListener('mouseup', mu);
    target.addEventListener('mousemove', mm);
    target.addEventListener('wheel', wh, { passive: true });
    target.addEventListener('contextmenu', ctx);
    target.addEventListener('blur', blur);
    document.addEventListener('pointerlockchange', plc);
    return () => {
      target.removeEventListener('keydown', kd);
      target.removeEventListener('keyup', ku);
      target.removeEventListener('mousedown', md);
      target.removeEventListener('mouseup', mu);
      target.removeEventListener('mousemove', mm);
      target.removeEventListener('wheel', wh);
      target.removeEventListener('contextmenu', ctx);
      target.removeEventListener('blur', blur);
      document.removeEventListener('pointerlockchange', plc);
    };
  }
}

/** Global input singleton. */
export const input = new Input();
