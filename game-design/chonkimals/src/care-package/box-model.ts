// The Camp Care Package: a chunky kraft-cardboard box with a lid, red ribbon + bow
// and a camp stamp — built from rounded "clay" boxes on the global THREE (no GLB,
// no addons). Used by the opening scene and as a prop on the Canteen counter.
// Units: the box is ~1.4 wide, base at y = 0.

type Mesh = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;
type Material = InstanceType<typeof THREE.MeshStandardMaterial>;

export interface CarePackageModel {
  root: Group;
  /** Lid assembly (ribbon + bow ride on it); its origin is the body's top centre. */
  lid: Group;
  body: Mesh;
  /** Light pouring out of the open box (emissive; 0 = hidden). */
  glow: Mesh;
  glowMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  /** Seam light leaking out under the lid while it rattles. */
  seam: Mesh;
  seamMat: InstanceType<typeof THREE.MeshBasicMaterial>;
  bodyHeight: number;
}

const KRAFT = 0xc98f55;
const KRAFT_LID = 0xb97d45;
const RIBBON = 0xe8483f;

/**
 * Box with rounded edges: a segmented BoxGeometry whose vertices are pushed onto a
 * rounded-corner shape (clamp to the inner box, then out along the offset by `r`).
 */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 4): InstanceType<typeof THREE.BoxGeometry> {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    v.sub(c);
    if (v.lengthSq() > 1e-10) v.setLength(r);
    v.add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const clay = (color: number, roughness = 0.82): Material =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

export function buildCarePackage(): CarePackageModel {
  const root = new THREE.Group();
  root.name = 'care_package';
  const W = 1.4, H = 1.0, D = 1.15;

  const body = new THREE.Mesh(roundedBox(W, H, D, 0.12), clay(KRAFT));
  body.position.y = H / 2;
  root.add(body);

  // Stamp label on the front.
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62),
    new THREE.MeshStandardMaterial({ map: stampTexture(), transparent: true, roughness: 0.9 }));
  label.position.set(0, H * 0.48, D / 2 + 0.004);
  root.add(label);

  // Ribbon down the body's sides (the front stays clear for the stamp).
  const ribbonMat = clay(RIBBON, 0.6);
  const band = new THREE.Mesh(roundedBox(W + 0.02, H - 0.02, 0.22, 0.04, 2), ribbonMat);
  band.position.y = H / 2;
  root.add(band);

  // Glow plane just above the body top (seen when the lid is off).
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = H + 0.012;
  root.add(glow);

  // Lid.
  const lid = new THREE.Group();
  lid.position.y = H;
  const lidMesh = new THREE.Mesh(roundedBox(W + 0.1, 0.26, D + 0.1, 0.1), clay(KRAFT_LID));
  lidMesh.position.y = 0.1;
  lid.add(lidMesh);
  for (const [sx, sz] of [[0.24, D + 0.14], [W + 0.14, 0.24]] as const) {
    const band = new THREE.Mesh(roundedBox(sx, 0.28, sz, 0.05, 2), ribbonMat);
    band.position.y = 0.11;
    lid.add(band);
  }
  // Bow: two squashed loops + tails + a knot.
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.065, 10, 20), ribbonMat);
    loop.scale.set(1.25, 1, 0.8);
    loop.position.set(s * 0.2, 0.36, 0);
    loop.rotation.set(0, 0, s * 0.5);
    lid.add(loop);
    const tail = new THREE.Mesh(roundedBox(0.12, 0.04, 0.34, 0.02, 1), ribbonMat);
    tail.position.set(s * 0.1, 0.25, 0.16);
    tail.rotation.set(0.2, s * 0.5, 0);
    lid.add(tail);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), ribbonMat);
  knot.position.y = 0.33;
  knot.scale.set(1, 0.85, 0.9);
  lid.add(knot);
  root.add(lid);

  // Seam light between body and lid.
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.07, D + 0.06), seamMat);
  seam.position.y = H + 0.01;
  root.add(seam);

  root.traverse((o) => { if ((o as Mesh).isMesh && o !== glow && o !== seam) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, lid, body, glow, glowMat, seam, seamMat, bodyHeight: H };
}

/** "CAMP CARE PACKAGE" rubber stamp with a paw print. */
function stampTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const W = 512, H = 334;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  const ink = 'rgba(92,52,26,0.82)';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect?.(14, 14, W - 28, H - 28, 36);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "700 62px 'Fredoka', system-ui, sans-serif";
  ctx.fillText('CAMP', W / 2, 78);
  ctx.font = "700 46px 'Fredoka', system-ui, sans-serif";
  ctx.fillText('CARE PACKAGE', W / 2, 250);
  // Paw print.
  const px = W / 2, py = 165;
  ctx.beginPath(); ctx.ellipse(px, py + 14, 34, 28, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy] of [[-40, -18], [-14, -38], [14, -38], [40, -18]]) {
    ctx.beginPath(); ctx.ellipse(px + dx, py + dy, 12, 15, 0, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
