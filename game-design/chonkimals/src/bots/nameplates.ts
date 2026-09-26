/**
 * MMO-style floating nameplates (DOM overlay — no CSS2DRenderer):
 *
 *        SkibidiBear67
 *        <Poop Troop>
 *
 * Each frame the manager hands in a world-space anchor per plate; plates are
 * projected to the container, scaled/faded by distance, and hidden off-screen.
 */

type Camera = import('three').Camera;
type Vector3 = import('three').Vector3;

const NEAR_FULL = 8;    // full size inside this distance
const FADE_START = 30;
const FADE_END = 45;
const MIN_SCALE = 0.62;

const LAYER_CSS = [
  'position:absolute', 'inset:0', 'overflow:hidden', 'pointer-events:none', 'z-index:5',
].join(';');

const PLATE_CSS = [
  'position:absolute', 'left:0', 'top:0', 'display:none',
  'text-align:center', 'white-space:nowrap', 'line-height:1.15',
  "font-family:'Fredoka',system-ui,-apple-system,'Segoe UI',sans-serif",
  'text-shadow:0 0 2px #000,0 0 2px #000,1px 1px 1px #000',
  'transform-origin:50% 100%', 'will-change:transform,opacity',
].join(';');

const NAME_CSS = 'font-weight:700;font-size:clamp(11px,2.9vmin,15px);color:#4fb4ff;';
const TAG_CSS = 'font-weight:600;font-size:clamp(10px,2.5vmin,13px);color:#f2f2f2;';

interface Plate {
  el: HTMLDivElement;
  shown: boolean;
}

export class Nameplates {
  private readonly layer: HTMLDivElement;
  private readonly plates: Plate[] = [];
  private readonly v = new THREE.Vector3();
  private _visible = true;

  // Toggling visibility hides the whole layer immediately (not just on the next
  // update()), so callers that stop driving update() — e.g. a minigame takes
  // over the loop — don't leave stale plates on screen.
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) {
    this._visible = v;
    this.layer.style.display = v ? '' : 'none';
  }

  constructor(container: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = LAYER_CSS;
    container.appendChild(this.layer);
  }

  /** Adds a plate and returns its index. */
  add(name: string, tag: string | null, nameColor?: string): number {
    const el = document.createElement('div');
    el.style.cssText = PLATE_CSS;
    const n = document.createElement('div');
    n.style.cssText = NAME_CSS;
    n.textContent = name;
    if (nameColor) n.style.color = nameColor;
    el.appendChild(n);
    if (tag) {
      const t = document.createElement('div');
      t.style.cssText = TAG_CSS;
      t.textContent = tag;
      el.appendChild(t);
    }
    this.layer.appendChild(el);
    this.plates.push({ el, shown: false });
    return this.plates.length - 1;
  }

  /** Change plate `i`'s name line (and its colour). */
  setName(i: number, name: string, color?: string): void {
    const n = this.plates[i]?.el.firstElementChild as HTMLElement | null;
    if (!n) return;
    if (n.textContent !== name) n.textContent = name;
    if (color) n.style.color = color;
  }

  /** anchors[i] is the world point above plate i's head. */
  update(camera: Camera, anchors: readonly Vector3[]): void {
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    for (let i = 0; i < this.plates.length; i++) {
      const plate = this.plates[i];
      const a = anchors[i];
      const dist = a ? camera.position.distanceTo(a) : Infinity;
      const v = a ? this.v.copy(a).project(camera) : null;
      const onScreen = this.visible && !!v && dist < FADE_END &&
        v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      if (!onScreen || !v) {
        if (plate.shown) { plate.el.style.display = 'none'; plate.shown = false; }
        continue;
      }
      if (!plate.shown) { plate.el.style.display = 'block'; plate.shown = true; }
      const x = (v.x + 1) * 0.5 * w;
      const y = (1 - v.y) * 0.5 * h;
      const s = Math.max(MIN_SCALE, Math.min(1, NEAR_FULL / Math.max(dist, NEAR_FULL) + 0.35));
      const fade = 1 - Math.max(0, Math.min(1, (dist - FADE_START) / (FADE_END - FADE_START)));
      plate.el.style.transform =
        `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
      plate.el.style.opacity = fade.toFixed(2);
      plate.el.style.zIndex = String(10000 - Math.round(dist * 10));
    }
  }
}
