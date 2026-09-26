// introMonkey.ts
// Renders a live MonkeyModel doing a Fortnite-style dance into a small canvas
// that can be embedded in the intro overlay card.

import { MonkeyModel } from './monkeyModel';

export type DanceMode = 'orange-justice' | 'floss';

export class IntroMonkey {
  readonly canvas: HTMLCanvasElement;
  private renderer: InstanceType<typeof THREE.WebGLRenderer>;
  private scene:    InstanceType<typeof THREE.Scene>;
  private camera:   InstanceType<typeof THREE.PerspectiveCamera>;
  private monkey:   MonkeyModel;
  private clock:    InstanceType<typeof THREE.Clock>;
  private _raf      = 0;
  private _t        = 0;
  private _mode:    DanceMode;

  constructor(sizePx = 160, mode: DanceMode = 'orange-justice') {
    this._mode = mode;
    // ── Renderer ──────────────────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.canvas.width  = sizePx;
    this.canvas.height = sizePx;
    this.canvas.style.cssText =
      `width:${sizePx}px;height:${sizePx}px;display:block;border-radius:50%;` +
      'overflow:hidden;background:transparent;';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,           // transparent background
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(sizePx, sizePx);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // ── Scene & lights ────────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x443322, 1.2);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);

    // ── Camera ────────────────────────────────────────────────────────────
    // Camera centred on monkey torso: baseY(-0.4) + ~0.5 torso offset = Y≈0.1
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 50);
    this.camera.position.set(0, -0.05, 1.2);
    this.camera.lookAt(0, -0.05, 0);

    // ── Monkey ────────────────────────────────────────────────────────────
    this.monkey = new MonkeyModel();
    this.monkey.group.scale.setScalar(1.4);
    this.monkey.setBaseY(-0.3);
    this.scene.add(this.monkey.group);

    this.clock = new THREE.Clock();
    this._loop();
  }

  private _loop = (): void => {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._t += dt;
    this._dance(dt);
    this.monkey.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Orange Justice / Fortnite dance approximation:
   * - Hips bounce on every beat (~1.8 Hz)
   * - Arms alternate: left pumps up while right pumps down, then swap
   * - Head bobs in sync
   * - Body leans side-to-side
   */
  private _dance(dt: number): void {
    if (this._mode === 'floss') { this._floss(); return; }
    this._orangeJustice();
  }

  private _orangeJustice(): void {
    const t = this._t;
    const FREQ = 1.8;
    const beat = Math.sin(t * FREQ * Math.PI * 2);
    const beatAbs = Math.abs(beat);

    // Hip bounce — body bobs up/down (baseY is set in constructor)
    this.monkey.group.position.y = this.monkey['_baseY'] + beatAbs * 0.12;

    // Side lean
    this.monkey.group.rotation.z = beat * 0.18;

    // Alternating arm pump (Orange Justice signature move)
    // Left arm: pumps UP on positive beat, DOWN on negative
    this.monkey['leftArm'].rotation.z  =  0.25 + beat * 1.1;
    this.monkey['leftArm'].rotation.x  = -beat * 0.5;
    this.monkey['leftForearm'].rotation.y = beat * 0.6;

    // Right arm: opposite phase
    this.monkey['rightArm'].rotation.z = -0.25 - beat * 1.1;
    this.monkey['rightArm'].rotation.x =  beat * 0.5;
    this.monkey['rightForearm'].rotation.y = -beat * 0.6;

    // Leg stomp — alternate
    this.monkey['leftLeg'].position.y  =  Math.max(0, beat) * 0.18;
    this.monkey['rightLeg'].position.y =  Math.max(0, -beat) * 0.18;

    // Head bob
    this.monkey['headGroup'].rotation.z = -beat * 0.12;
    this.monkey['headGroup'].rotation.x =  beatAbs * 0.08;

    // Jaw: big grin open on beat peak
    const jawOpen = beatAbs * 0.6;
    this.monkey['jawPivot'].rotation.x = jawOpen * 0.9;
    this.monkey['jawPivot'].scale.set(1 + jawOpen * 0.5, 1, 1);
  }

  /**
   * Fortnite Floss dance:
   * Hips sway L↔R while arms swing in opposite directions each half-beat.
   * Left arm swings BACK when right swings FORWARD and vice-versa.
   */
  private _floss(): void {
    const t = this._t;
    const FREQ = 2.2; // slightly faster than orange justice
    const beat     = Math.sin(t * FREQ * Math.PI * 2);       // −1 ↔ +1
    const beatFast = Math.sin(t * FREQ * Math.PI * 2 * 2);   // double-time for arm swing
    const beatAbs  = Math.abs(beat);

    // Hip sway side-to-side (body slides L↔R)
    this.monkey.group.position.x = beat * 0.18;
    this.monkey.group.position.y = this.monkey['_baseY'] + beatAbs * 0.06;
    this.monkey.group.rotation.z = beat * 0.12;

    // Arms: opposite phase, large forward/back swing (rotation.x)
    // Left arm swings forward (+x) while right goes back (-x)
    const armSwing = beatFast * 1.4;
    this.monkey['leftArm'].rotation.x  =  armSwing;
    this.monkey['leftArm'].rotation.z  =  0.25 + beatFast * 0.3;
    this.monkey['rightArm'].rotation.x = -armSwing;
    this.monkey['rightArm'].rotation.z = -0.25 - beatFast * 0.3;

    // Forearms flick outward on each swing peak
    this.monkey['leftForearm'].rotation.y  =  beatFast * 0.8;
    this.monkey['rightForearm'].rotation.y = -beatFast * 0.8;

    // Legs: small alternating kick
    this.monkey['leftLeg'].position.y  = Math.max(0,  beat) * 0.12;
    this.monkey['rightLeg'].position.y = Math.max(0, -beat) * 0.12;

    // Head bobs with hips
    this.monkey['headGroup'].rotation.z = -beat * 0.08;
    this.monkey['headGroup'].rotation.x =  beatAbs * 0.05;

    // Wide grin throughout
    const jawOpen = 0.45 + beatAbs * 0.3;
    this.monkey['jawPivot'].rotation.x = jawOpen * 0.9;
    this.monkey['jawPivot'].scale.set(1 + jawOpen * 0.4, 1, 1);
  }

  /** Stop the render loop and free GPU resources */
  dispose(): void {
    cancelAnimationFrame(this._raf);
    this.renderer.dispose();
  }
}
