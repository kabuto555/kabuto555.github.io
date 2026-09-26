/**
 * Speech bubbles — quick-chat lines float above the speaker (DOM overlay),
 * sitting just above their nameplate. There is no chat log: a bubble is only
 * visible to players close enough to the speaker.
 */

type Camera = import('three').Camera;
type Vector3 = import('three').Vector3;

const LIFETIME     = 3.6;   // seconds a bubble stays up
const FADE_OUT     = 0.4;   // last part of the lifetime spent fading
const NEAR_FULL    = 8;     // full size inside this camera distance
const MIN_SCALE    = 0.6;
const PLATE_GAP_PX = 38;    // lift above the anchor so bubbles clear the nameplate

const STYLE_ID = 'cc-speech-bubbles';
const STYLE = `
.cc-bubble-layer { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:6; }
.cc-bubble {
  position:absolute; left:0; top:0; display:none;
  transform-origin:50% 100%; will-change:transform,opacity;
}
.cc-bubble-body {
  position:relative; max-width:min(220px,46vw); padding:6px 11px;
  border-radius:14px; background:#fffdf6; color:#2a1d10;
  border:2px solid #3d2412; box-shadow:0 3px 0 rgba(0,0,0,0.25);
  font:700 clamp(12px,3vmin,16px)/1.2 'Fredoka',system-ui,-apple-system,"Segoe UI",sans-serif;
  text-align:center; white-space:normal;
  animation:cc-bubble-pop 0.22s cubic-bezier(.2,1.6,.4,1);
}
.cc-bubble-body::after {
  content:''; position:absolute; left:50%; bottom:-9px; transform:translateX(-50%);
  border:8px solid transparent; border-top-color:#3d2412; border-bottom:0;
}
.cc-bubble-body::before {
  content:''; position:absolute; left:50%; bottom:-5px; transform:translateX(-50%);
  border:6px solid transparent; border-top-color:#fffdf6; border-bottom:0; z-index:1;
}
@keyframes cc-bubble-pop { from { transform:scale(0.4); opacity:0; } to { transform:scale(1); opacity:1; } }
`;

interface Bubble {
  el: HTMLDivElement;
  body: HTMLDivElement;
  age: number;
  shown: boolean;
}

export class SpeechBubbles {
  private readonly layer: HTMLDivElement;
  private readonly bubbles = new Map<string, Bubble>();
  private readonly v = new THREE.Vector3();

  constructor(container: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this.layer = document.createElement('div');
    this.layer.className = 'cc-bubble-layer';
    container.appendChild(this.layer);
  }

  /** Hide/show the whole bubble layer at once (e.g. while a minigame runs). */
  setVisible(v: boolean): void {
    this.layer.style.display = v ? '' : 'none';
  }

  /** Shows (or replaces) the bubble for a speaker. */
  show(key: string, text: string): void {
    let b = this.bubbles.get(key);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'cc-bubble';
      const body = document.createElement('div');
      body.className = 'cc-bubble-body';
      el.appendChild(body);
      this.layer.appendChild(el);
      b = { el, body, age: 0, shown: false };
      this.bubbles.set(key, b);
    }
    b.body.textContent = text;
    b.age = 0;
    // Restart the pop animation.
    b.body.style.animation = 'none';
    void b.body.offsetWidth;
    b.body.style.animation = '';
  }

  /**
   * Ages bubbles and places them. `anchor(key, out)` writes the speaker's head
   * point (or returns false if gone); `audible(key)` says whether the local
   * player is close enough to see it.
   */
  update(
    dt: number,
    camera: Camera,
    anchor: (key: string, out: Vector3) => boolean,
    audible: (key: string) => number,
  ): void {
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    for (const [key, b] of this.bubbles) {
      b.age += dt;
      const alive = b.age < LIFETIME;
      const hearing = alive ? audible(key) : 0;
      const v = this.v;
      const placed = alive && hearing > 0 && anchor(key, v);
      const dist = placed ? camera.position.distanceTo(v) : 0;
      if (placed) v.project(camera);
      const onScreen = placed && v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      if (!onScreen) {
        if (b.shown) { b.el.style.display = 'none'; b.shown = false; }
        if (!alive) { b.el.remove(); this.bubbles.delete(key); }
        continue;
      }
      if (!b.shown) { b.el.style.display = 'block'; b.shown = true; }
      const x = (v.x + 1) * 0.5 * w;
      const y = (1 - v.y) * 0.5 * h;
      const s = Math.max(MIN_SCALE, Math.min(1, NEAR_FULL / Math.max(dist, NEAR_FULL) + 0.35));
      const life = Math.min(1, (LIFETIME - b.age) / FADE_OUT);
      b.el.style.transform =
        `translate3d(${x.toFixed(1)}px,${(y - PLATE_GAP_PX * s).toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
      b.el.style.opacity = (life * hearing).toFixed(2);
      b.el.style.zIndex = String(10000 - Math.round(dist * 10));
    }
  }
}
