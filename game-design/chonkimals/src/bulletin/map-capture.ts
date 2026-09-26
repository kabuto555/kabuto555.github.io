// Camp map for the Bulletin Board: one top-down orthographic render of the actual
// world (so the map is always true to the camp), cropped to the points of interest,
// with the pins' positions projected into it. "Up" on the map is the direction you
// walk in through the main gate (camp +z).
//
// Renders straight into the game canvas (preserveDrawingBuffer) and copies it out
// before the normal frame overwrites it — no render target, so the colours match
// the game's tone mapping. Sprites (clouds, bubbles), bots and the player are hidden
// for the shot, and fog is pushed out without recompiling shaders.

import type { CampMap, MapPin } from './papers';

type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;

export interface MapPoi { label: string; icon: string; pos: Vector3 }

export interface CaptureOptions {
  pois: MapPoi[];
  /** World direction that points up the map. */
  up: Vector3;
  /** Output aspect (w/h) and width in px. */
  aspect: number;
  width: number;
  /** Extra objects to hide for the shot (bots, player…). */
  hide: (Object3D | null | undefined)[];
  /** Fraction of the POI span added around the edges. */
  pad?: number;
}

export function captureCampMap(renderer: InstanceType<typeof THREE.WebGLRenderer>, scene: InstanceType<typeof THREE.Scene>,
                               o: CaptureOptions): CampMap {
  const Y = new THREE.Vector3(0, 1, 0);
  const U = o.up.clone().setY(0).normalize();
  // Looking straight down with camera.up = U, screen-right is (−Y) × U.
  const R = new THREE.Vector3().crossVectors(Y.clone().negate(), U).normalize();
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, maxY = -Infinity;
  for (const p of o.pois) {
    const a = p.pos.dot(R), b = p.pos.dot(U);
    minA = Math.min(minA, a); maxA = Math.max(maxA, a);
    minB = Math.min(minB, b); maxB = Math.max(maxB, b);
    maxY = Math.max(maxY, p.pos.y);
  }
  const pad = o.pad ?? 0.12;
  let bw = (maxA - minA) * (1 + pad * 2), bh = (maxB - minB) * (1 + pad * 2);
  if (bw / bh < o.aspect) bw = bh * o.aspect; else bh = bw / o.aspect;
  const ca = (minA + maxA) / 2, cb = (minB + maxB) / 2;
  const centre = R.clone().multiplyScalar(ca).addScaledVector(U, cb).setY(maxY);

  // The game canvas has its own aspect: frame the box inside it, then crop it back out.
  const canvas = renderer.domElement;
  const cAspect = canvas.width / canvas.height;
  const fw = Math.max(bw, bh * cAspect), fh = fw / cAspect;
  const cam = new THREE.OrthographicCamera(-fw / 2, fw / 2, fh / 2, -fh / 2, 1, 2000);
  cam.up.copy(U);
  cam.position.copy(centre).addScaledVector(Y, 600);
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);

  // Hide what shouldn't be on a map.
  const hidden: Object3D[] = [];
  const hide = (obj: Object3D) => { if (obj.visible) { obj.visible = false; hidden.push(obj); } };
  o.hide.forEach((h) => h && hide(h));
  scene.traverse((obj) => { if ((obj as InstanceType<typeof THREE.Sprite>).isSprite) hide(obj); });
  // The water shader reads as black from straight above (it mirrors the sky at grazing angles):
  // paint water surfaces a flat map blue for the shot.
  const swapped: [InstanceType<typeof THREE.Mesh>, InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[]][] = [];
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x7cc6ee });
  scene.traverse((obj) => {
    const m = obj as InstanceType<typeof THREE.Mesh>;
    if (m.isMesh && /^water_/i.test(m.name) && !/(bed|bank)/i.test(m.name)) { swapped.push([m, m.material]); m.material = waterMat; }
  });
  const fog = scene.fog as InstanceType<typeof THREE.Fog> | null;
  const fogNF = fog ? [fog.near, fog.far] : null;
  if (fog) { fog.near = 1e5; fog.far = 2e5; }
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(null);
  renderer.render(scene, cam);

  const out = Object.assign(document.createElement('canvas'), {
    width: o.width, height: Math.round(o.width / o.aspect) });
  const sw = canvas.width * (bw / fw), sh = canvas.height * (bh / fh);
  out.getContext('2d')!.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, out.width, out.height);

  renderer.setRenderTarget(prevTarget);
  if (fog && fogNF) { fog.near = fogNF[0]; fog.far = fogNF[1]; }
  hidden.forEach((h) => { h.visible = true; });
  swapped.forEach(([m, mat]) => { m.material = mat; });
  waterMat.dispose();

  const toUV = (x: number, z: number) => {
    const p = new THREE.Vector3(x, 0, z);
    const u = (p.dot(R) - (ca - bw / 2)) / bw;
    const v = 1 - (p.dot(U) - (cb - bh / 2)) / bh;
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
  };
  const pins: MapPin[] = [];
  for (const p of o.pois) {
    const uv = toUV(p.pos.x, p.pos.z);
    if (uv) pins.push({ label: p.label, icon: p.icon, ...uv });
  }
  return { image: out, pins, toUV };
}
