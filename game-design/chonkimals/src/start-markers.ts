// Floating "play here" arrows over each minigame / activity start spot, so campers wandering
// by can see where to stand. Each one points down at its spot and gently bobs; it fades out
// once you're standing there (the Play button takes over) and hides while you're in a mode.

import type { Vector3 } from 'three';
import { FONT } from './ui/theme';

type Group = InstanceType<typeof THREE.Group>;
type Material = InstanceType<typeof THREE.Material>;

const SIZE = 1.5;       // overall scale — big enough to spot from across camp
const HOVER = 3.4;       // arrow tip height above the spot (clears a camper's head)
const BOB_AMP = 0.3;     // up/down travel
const BOB_SPEED = 2.2;   // rad/s
const FADE_SPEED = 5;    // opacity per second

interface Marker {
  root: Group;
  mats: Material[];
  base: Vector3;
  /** Extra height over HOVER (e.g. to clear a sign over the spot). */
  lift: number;
  /** Fades out within this distance (XZ) — you're already there. */
  hideWithin: number;
  phase: number;
  opacity: number;
}

function buildArrow(): { root: Group; mats: Material[] } {
  const root = new THREE.Group();
  const fill = new THREE.MeshStandardMaterial({
    color: 0xffd23f, emissive: 0xff9a1f, emissiveIntensity: 0.45, roughness: 0.55, transparent: true,
  });
  const rim = new THREE.MeshStandardMaterial({ color: 0x7a3e12, roughness: 0.8, transparent: true, side: THREE.BackSide });
  // Head: a cone tipped down at the spot, with a shaft above it.
  const headGeo = new THREE.ConeGeometry(0.55, 0.8, 20);
  headGeo.rotateX(Math.PI);
  headGeo.translate(0, 0.4, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16);
  shaftGeo.translate(0, 1.1, 0);
  for (const geo of [headGeo, shaftGeo]) {
    root.add(new THREE.Mesh(geo, fill));
    const outline = new THREE.Mesh(geo, rim); // inverted-hull outline for the clay/sticker look
    outline.scale.setScalar(1.12);
    root.add(outline);
  }
  root.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  // "Play" floating above the arrow — always faces the camera.
  const label = new THREE.SpriteMaterial({ map: playTexture(), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(label);
  sprite.scale.set(2.2, 1.1, 1);
  sprite.position.y = 2.1;
  root.add(sprite);
  return { root, mats: [fill, rim, label] };
}

let playTex: InstanceType<typeof THREE.CanvasTexture> | null = null;
/** One shared "Play" texture (redrawn once the web font is in, in case it wasn't yet). */
function playTexture(): InstanceType<typeof THREE.CanvasTexture> {
  if (playTex) return playTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = `700 76px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 14;
    g.strokeStyle = '#7a3e12';
    g.strokeText('Play', 128, 66);
    g.fillStyle = '#ffd23f';
    g.fillText('Play', 128, 66);
    tex.needsUpdate = true;
  };
  draw();
  void document.fonts?.ready.then(draw);
  playTex = tex;
  return tex;
}

export class StartMarkers {
  private markers: Marker[] = [];
  private t = 0;

  constructor(private scene: InstanceType<typeof THREE.Scene>) {}

  /** `spot` is the ground point to stand on; `lift` raises the arrow further (over a sign). */
  add(spot: Vector3, hideWithin = 3, lift = 0): void {
    const { root, mats } = buildArrow();
    root.name = 'start_marker';
    root.scale.setScalar(SIZE);
    this.scene.add(root);
    this.markers.push({ root, mats, base: spot.clone(), lift, hideWithin, phase: this.markers.length * 1.3, opacity: 1 });
  }

  /** `show` false (in a mode, an overlay, the FTUE…) fades every arrow out. */
  update(dt: number, player: Vector3 | null, show: boolean): void {
    this.t += dt;
    for (const m of this.markers) {
      const near = !!player && Math.hypot(player.x - m.base.x, player.z - m.base.z) < m.hideWithin;
      const target = show && !near ? 1 : 0;
      m.opacity += Math.sign(target - m.opacity) * Math.min(Math.abs(target - m.opacity), FADE_SPEED * dt);
      m.root.visible = m.opacity > 0.01;
      if (!m.root.visible) continue;
      for (const mat of m.mats) mat.opacity = m.opacity;
      const s = Math.sin(this.t * BOB_SPEED + m.phase);
      m.root.position.set(m.base.x, m.base.y + HOVER + m.lift + s * BOB_AMP, m.base.z);
    }
  }
}
