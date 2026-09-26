/**
 * Sumo controls + feedback:
 *
 *   DragLauncher  full-screen pointer overlay: tap and drag anywhere to pull
 *                 back (slingshot), release to launch. Draws a DOM rubber band
 *                 from where the finger went down to where it is now.
 *   LaunchArrow   flat 3D arrow on the ring from the chonk to where the launch
 *                 would carry it (turns red when that's out of the ring).
 */

type Scene = InstanceType<typeof THREE.Scene>;
type Mesh = InstanceType<typeof THREE.Mesh>;

const MIN_DRAG_PX = 14;          // shorter pulls are a tap (ignored)
const FULL_PULL_FRAC = 0.32;     // pull this fraction of the short screen side for full power

export interface DragState {
  /** Pull vector in screen px (x right, y down) from the press point. */
  dx: number;
  dy: number;
  /** 0..1 launch strength. */
  power: number;
}

export class DragLauncher {
  private readonly layer: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private x0 = 0; private y0 = 0;
  private readonly state: DragState = { dx: 0, dy: 0, power: 0 };
  private dragging = false;

  /** `onRelease` gets the final pull (only for pulls past the tap threshold). */
  constructor(container: HTMLElement, private readonly onRelease: (s: DragState) => void) {
    this.layer = document.createElement('div');
    this.layer.style.cssText =
      'position:absolute;inset:0;z-index:15;touch-action:none;user-select:none;display:none;';
    this.band = document.createElement('div');
    this.band.style.cssText =
      'position:absolute;left:0;top:0;height:8px;border-radius:4px;transform-origin:0 50%;pointer-events:none;' +
      'background:rgba(255,246,220,0.85);box-shadow:0 0 0 2px rgba(90,61,26,0.6);display:none;';
    this.knob = document.createElement('div');
    this.knob.style.cssText =
      'position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;' +
      'pointer-events:none;background:rgba(255,246,220,0.9);box-shadow:0 0 0 3px rgba(90,61,26,0.7);display:none;';
    this.layer.append(this.band, this.knob);
    container.appendChild(this.layer);

    this.layer.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return; // one finger at a time
      e.stopPropagation();
      try { this.layer.setPointerCapture(e.pointerId); } catch { /* fine without */ }
      this.pointerId = e.pointerId;
      const p = this.local(e);
      this.x0 = p.x; this.y0 = p.y;
      this.dragging = true;
      this.setDrag(p.x, p.y);
    });
    this.layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      const p = this.local(e);
      this.setDrag(p.x, p.y);
    });
    const end = (e: PointerEvent, fire: boolean) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      const launched = fire && Math.hypot(this.state.dx, this.state.dy) >= MIN_DRAG_PX;
      this.cancel();
      if (launched) this.onRelease({ ...this.lastPull });
    };
    this.layer.addEventListener('pointerup', (e) => end(e, true));
    this.layer.addEventListener('pointercancel', (e) => end(e, false));
  }

  private readonly lastPull: DragState = { dx: 0, dy: 0, power: 0 };

  /** Current pull while a finger is down and past the tap threshold, else null. */
  get drag(): DragState | null {
    return this.dragging && Math.hypot(this.state.dx, this.state.dy) >= MIN_DRAG_PX ? this.state : null;
  }

  setEnabled(on: boolean): void {
    this.layer.style.display = on ? 'block' : 'none';
    if (!on) { this.pointerId = null; this.cancel(); }
  }

  private cancel(): void {
    this.dragging = false;
    this.state.dx = this.state.dy = this.state.power = 0;
    this.band.style.display = 'none';
    this.knob.style.display = 'none';
  }

  /** Pointer position relative to the overlay (never raw clientX/Y). */
  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.layer.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private setDrag(x: number, y: number): void {
    const r = this.layer.getBoundingClientRect();
    const full = Math.max(60, Math.min(r.width, r.height) * FULL_PULL_FRAC);
    let dx = x - this.x0, dy = y - this.y0;
    const len = Math.hypot(dx, dy);
    // The band stops stretching at full power.
    if (len > full) { dx *= full / len; dy *= full / len; }
    this.state.dx = dx; this.state.dy = dy;
    this.state.power = Math.min(1, len / full);
    Object.assign(this.lastPull, this.state);
    const show = len >= MIN_DRAG_PX;
    this.band.style.display = show ? 'block' : 'none';
    this.knob.style.display = show ? 'block' : 'none';
    if (!show) return;
    const bl = Math.hypot(dx, dy);
    this.band.style.width = `${bl.toFixed(1)}px`;
    this.band.style.transform =
      `translate(${this.x0.toFixed(1)}px,${(this.y0 - 4).toFixed(1)}px) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    this.knob.style.transform = `translate(${(this.x0 + dx).toFixed(1)}px,${(this.y0 + dy).toFixed(1)}px)`;
  }
}

const ARROW_OK = new THREE.Color(0xffe14a);
const ARROW_HOT = new THREE.Color(0xff8a2a);
const ARROW_OUT = new THREE.Color(0xff3b30);
const ARROW_WAIT = new THREE.Color(0xb8b8b8);

export class LaunchArrow {
  private readonly group = new THREE.Group();
  private readonly shaft: Mesh;
  private readonly head: Mesh;
  private readonly mat: InstanceType<typeof THREE.MeshBasicMaterial>;
  private readonly tmpC = new THREE.Color();

  constructor(scene: Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: ARROW_OK, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    });
    // Unit shaft along +z (scaled to length), triangle head at its tip.
    const shaftGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.shaft = new THREE.Mesh(shaftGeo, this.mat);
    const tri = new THREE.Shape();
    tri.moveTo(-0.9, 0); tri.lineTo(0.9, 0); tri.lineTo(0, 1.3); tri.closePath();
    const headGeo = new THREE.ShapeGeometry(tri).rotateX(Math.PI / 2);
    // ShapeGeometry lies in XY; rotateX(+90°) maps +y → +z (pointing forward) facing up.
    this.head = new THREE.Mesh(headGeo, this.mat);
    this.shaft.renderOrder = this.head.renderOrder = 5;
    this.group.add(this.shaft, this.head);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Show from (x,y,z) along world yaw `yaw`, `length` long. `power` tints it;
   * `out` = the launch would carry you out of the ring; `ready` = off cooldown. */
  show(x: number, y: number, z: number, yaw: number, length: number, power: number, out: boolean, ready: boolean): void {
    const start = 1.1; // clear of the chonk's body
    const len = Math.max(0.3, length - start - 1.3);
    this.group.position.set(x, y + 0.06, z);
    this.group.rotation.set(0, yaw, 0);
    const w = 0.35 + 0.25 * power;
    this.shaft.scale.set(w, 1, len);
    this.shaft.position.z = start;
    this.head.scale.setScalar(0.5 + 0.35 * power);
    this.head.position.z = start + len;
    if (!ready) this.mat.color.copy(ARROW_WAIT);
    else if (out) this.mat.color.copy(ARROW_OUT);
    else this.mat.color.copy(this.tmpC.copy(ARROW_OK).lerp(ARROW_HOT, power));
    this.group.visible = true;
  }

  hide(): void { this.group.visible = false; }
}
