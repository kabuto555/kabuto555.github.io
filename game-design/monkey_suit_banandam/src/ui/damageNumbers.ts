// Floating damage numbers rendered as 3D billboard quads with CanvasTexture.
// Each number is a PlaneGeometry facing the camera, textured from an offscreen canvas.

type V3 = InstanceType<typeof THREE.Vector3>;
type Camera = InstanceType<typeof THREE.PerspectiveCamera>;

interface DamageNumber {
  mesh: InstanceType<typeof THREE.Mesh>;
  vx: number;
  vy: number;
  ax: number;
  life: number;
  maxLife: number;
  /** If set, mesh position tracks this world-space anchor each frame + local offset */
  trackTarget?: { getPos: () => InstanceType<typeof THREE.Vector3> } | null;
  trackOffsetY: number; // accumulated Y offset from tracking origin
}

const active: DamageNumber[] = [];

interface TextureOpts {
  size?: number;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  glowColor?: string;
  bold?: boolean;
}

function makeTexture(
  text: string,
  opts: TextureOpts = {},
): InstanceType<typeof THREE.CanvasTexture> {
  const {
    size = 128,
    fontSize = 38,
    color = '#ffffff',
    strokeColor = '#000000',
    glowColor = color,
    bold = true,
  } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const weight = bold ? '900' : '700';
  ctx.font = `${weight} ${fontSize}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow pass
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = glowColor;
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 3; i++) ctx.fillText(text, size / 2, size / 2);

  // Outline
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.lineWidth = fontSize * 0.2;
  ctx.strokeStyle = strokeColor;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, size / 2, size / 2);

  // Fill
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Pickup icon renderers ─────────────────────────────────────────────────────
// Each draws a small canvas that matches the in-game 3-D pickup shape.

/** Draw a pink box with a white plus cross — matches the health pickup */
function drawHealthIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Pink square body
  ctx.fillStyle = '#ff3366';
  ctx.shadowColor = '#ff3366';
  ctx.shadowBlur = 8;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.shadowBlur = 0;
  // White cross
  ctx.fillStyle = '#ffffff';
  const t = r * 0.28; // bar thickness
  ctx.fillRect(cx - r * 0.7, cy - t, r * 1.4, t * 2); // horizontal
  ctx.fillRect(cx - t, cy - r * 0.7, t * 2, r * 1.4); // vertical
}

/** Vulcan — two short cyan-blue bullet pills side by side */
function drawVulcanIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const bw = r * 0.38, bh = r * 0.72;
  const gap = r * 0.22;
  ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#00aaff';
  for (const dx of [-gap - bw / 2, gap + bw / 2]) {
    const x = cx + dx - bw / 2, y = cy - bh / 2;
    const rx = bw / 2;
    ctx.beginPath();
    ctx.moveTo(x + rx, y);
    ctx.lineTo(x + bw - rx, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + rx);
    ctx.lineTo(x + bw, y + bh - rx);
    ctx.quadraticCurveTo(x + bw, y + bh, x + bw - rx, y + bh);
    ctx.lineTo(x + rx, y + bh);
    ctx.quadraticCurveTo(x, y + bh, x, y + bh - rx);
    ctx.lineTo(x, y + rx);
    ctx.quadraticCurveTo(x, y, x + rx, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Bright tip highlight
  ctx.fillStyle = 'rgba(180,240,255,0.55)';
  for (const dx of [-gap - bw / 2, gap + bw / 2]) {
    ctx.fillRect(cx + dx - bw / 2 + bw * 0.25, cy - bh / 2, bw * 0.5, bh * 0.22);
  }
}

/** Beam — long thick horizontal magenta bar with bright core */
function drawBeamIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const w = r * 2.1, h = r * 0.38;
  const x = cx - w / 2, y = cy - h / 2;
  // Outer glow
  ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#cc00cc';
  ctx.fillRect(x, y, w, h);
  // Bright core stripe
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x, cy - h * 0.15, w, h * 0.3);
  ctx.globalAlpha = 1;
}

/** Missile — orange tapered body pointing right with exhaust */
function drawMissileIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const bw = r * 1.7, bh = r * 0.42;
  // Body (tapers at nose/right)
  ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#ff8800';
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, cy - bh / 2); // tail top
  ctx.lineTo(cx + bw * 0.35, cy - bh / 2); // shoulder top
  ctx.lineTo(cx + bw / 2, cy);             // nose tip
  ctx.lineTo(cx + bw * 0.35, cy + bh / 2); // shoulder bot
  ctx.lineTo(cx - bw / 2, cy + bh / 2);   // tail bot
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Dark detail stripe
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - bw * 0.15, cy - bh / 2, bw * 0.12, bh);
  // Small fin at tail
  ctx.fillStyle = '#cc5500';
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, cy);
  ctx.lineTo(cx - bw * 0.3, cy - bh * 0.75);
  ctx.lineTo(cx - bw * 0.25, cy);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, cy);
  ctx.lineTo(cx - bw * 0.3, cy + bh * 0.75);
  ctx.lineTo(cx - bw * 0.25, cy);
  ctx.fill();
}

/** Sword — teal curved arc slash */
function drawSwordIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // Arc slash
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = r * 0.38;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy + r * 0.3, r * 1.1, -Math.PI * 0.75, -Math.PI * 0.05);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Bright core of arc
  ctx.strokeStyle = 'rgba(180,255,240,0.6)';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy + r * 0.3, r * 1.1, -Math.PI * 0.75, -Math.PI * 0.05);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/**
 * Draw a pickup icon onto an existing canvas context.
 * kind: 'health' | 'vulcan' | 'missile' | 'beam' | 'sword'
 */
export function drawPickupIcon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  kind: string,
): void {
  if      (kind === 'health')  drawHealthIcon(ctx, cx, cy, r);
  else if (kind === 'vulcan')  drawVulcanIcon(ctx, cx, cy, r);
  else if (kind === 'beam')    drawBeamIcon(ctx, cx, cy, r);
  else if (kind === 'missile') drawMissileIcon(ctx, cx, cy, r);
  else if (kind === 'sword')   drawSwordIcon(ctx, cx, cy, r);
  else {
    // fallback circle
    ctx.fillStyle = '#aaaaaa';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

/**
 * Create a small standalone HTMLCanvasElement with a pickup icon drawn on it.
 * Used in the HUD weapon pill list.
 */
export function makePickupIconCanvas(kind: string, sizePx: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sizePx; c.height = sizePx;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, sizePx, sizePx);
  drawPickupIcon(ctx, sizePx / 2, sizePx / 2, sizePx * 0.34, kind);
  return c;
}

/** Make a wide banner texture for multi-word labels */
function makeBannerTexture(
  line1: string, line2: string,
  color1: string, color2: string,
): InstanceType<typeof THREE.CanvasTexture> {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';

  function drawLine(text: string, color: string, y: number, size: number): void {
    ctx.font = `900 ${size}px system-ui,sans-serif`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) ctx.fillText(text, W / 2, y);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 5;
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  drawLine(line1, color1, H * 0.36, 40);
  drawLine(line2, color2, H * 0.72, 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function spawnDamageNumber(
  scene: InstanceType<typeof THREE.Scene>,
  worldPos: V3,
  damage: number,
  color: string,
  isWeakPoint: boolean,
  small = false,
): void {
  const text = isWeakPoint ? `★${Math.round(damage)}` : `${Math.round(damage)}`;
  const texSize = isWeakPoint ? 128 : 96;
  const texFontSize = isWeakPoint ? 52 : 38;
  const tex = makeTexture(text, { size: texSize, fontSize: texFontSize, color, glowColor: color });

  const scale = isWeakPoint ? 1.4 : small ? 0.5 : 0.9;
  const geo = new THREE.PlaneGeometry(scale, scale);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(worldPos);
  mesh.position.x += (Math.random() - 0.5) * 0.5;
  mesh.position.y += (Math.random() - 0.5) * 0.3;
  if (isWeakPoint) mesh.scale.setScalar(1.4); // mark crits for grow animation
  scene.add(mesh);

  const lateralSign = Math.random() < 0.5 ? 1 : -1;

  active.push({
    mesh,
    vx: lateralSign * (0.15 + Math.random() * 0.25),
    vy: 0.8 + Math.random() * 0.5,
    ax: lateralSign * (0.15 + Math.random() * 0.2),
    life: 1.1,
    maxLife: 1.1,
    trackTarget: null,
    trackOffsetY: 0,
  });
}

/** Shared spawner for any billboard float text */
function spawnFloat(
  scene: InstanceType<typeof THREE.Scene>,
  tex: InstanceType<typeof THREE.CanvasTexture>,
  worldPos: V3,
  quadW: number,
  quadH: number,
  life: number,
  vy: number,
  vx = 0,
  ax = 0,
  trackTarget?: DamageNumber['trackTarget'],
): void {
  const geo = new THREE.PlaneGeometry(quadW, quadH);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(worldPos);
  if (!trackTarget) {
    mesh.position.x += (Math.random() - 0.5) * 0.4;
    mesh.position.y += (Math.random() - 0.5) * 0.2;
  }
  scene.add(mesh);
  active.push({ mesh, vx, vy, ax, life, maxLife: life, trackTarget, trackOffsetY: 0 });
}

/**
 * Floating "+N XP" text spawned at a world position (enemy kill location).
 */
export function spawnXpFloat(
  scene: InstanceType<typeof THREE.Scene>,
  worldPos: V3,
  amount: number,
): void {
  // Square 128×128 canvas → square 1.0×1.0 plane — no squish
  const tex = makeTexture(`+${amount} XP`, {
    size: 128,
    fontSize: 36,
    color: '#aaffaa',
    glowColor: '#44ff44',
  });
  spawnFloat(scene, tex, worldPos, 1.0, 1.0, 1.4,
    1.0 + Math.random() * 0.4,
    (Math.random() - 0.5) * 0.3,
    (Math.random() - 0.5) * 0.15,
  );
}

/**
 * Quick pickup notification: drawn icon + item name quad, tracks the player briefly.
 * kind drives the icon shape/colour to match the in-game pickup.
 */
export function spawnPickupBanner(
  scene: InstanceType<typeof THREE.Scene>,
  worldPos: V3,
  kind: string,       // 'health' | 'vulcan' | 'missile' | 'beam' | 'sword'
  label: string,      // second-line text, e.g. '+40 HP' or 'Level 2'
  getPlayerPos?: () => InstanceType<typeof THREE.Vector3>,
): void {
  const W = 256, H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  // Left half: pickup icon
  const iconCx = H / 2, iconCy = H / 2;
  const iconR  = H * 0.34;
  drawPickupIcon(ctx, iconCx, iconCy, iconR, kind);

  // Right half: two lines of text
  ctx.textAlign = 'left';
  ctx.lineJoin  = 'round';
  const tx = H + 6; // text x start

  // Line 1 — pickup name in bright colour
  const nameColor = kind === 'health' ? '#ff6688'
    : kind === 'vulcan'  ? '#44ccff'
    : kind === 'missile' ? '#ffaa44'
    : kind === 'beam'    ? '#ff66ff'
    : '#44ffdd'; // sword
  const name = kind === 'health' ? 'HEALTH'
    : kind.toUpperCase();
  ctx.font = '900 28px system-ui,sans-serif';
  ctx.shadowColor = nameColor; ctx.shadowBlur = 10;
  ctx.fillStyle = nameColor; ctx.globalAlpha = 0.45;
  ctx.fillText(name, tx, H * 0.40);
  ctx.globalAlpha = 1; ctx.shadowBlur = 4;
  ctx.lineWidth = 5; ctx.strokeStyle = '#000';
  ctx.strokeText(name, tx, H * 0.40);
  ctx.shadowBlur = 0;
  ctx.fillText(name, tx, H * 0.40);

  // Line 2 — sub-label in white
  ctx.font = '700 22px system-ui,sans-serif';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 4;
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.45;
  ctx.fillText(label, tx, H * 0.72);
  ctx.globalAlpha = 1; ctx.shadowBlur = 3;
  ctx.lineWidth = 4; ctx.strokeStyle = '#000';
  ctx.strokeText(label, tx, H * 0.72);
  ctx.shadowBlur = 0;
  ctx.fillText(label, tx, H * 0.72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const offset = new THREE.Vector3(0, -0.3, 1.5);
  const bannerPos = worldPos.clone().add(offset);
  const trackTarget = getPlayerPos
    ? { getPos: () => getPlayerPos().clone().add(offset) }
    : null;
  // 256:96 aspect ≈ 2.67:1 — render smaller so it doesn't dominate the screen
  spawnFloat(scene, tex, bannerPos, 1.0, 0.38, 1.6, 0.35, 0, 0, trackTarget);
}

/**
 * "LEVEL UP!" banner + stat line, displayed at the player's world position.
 */
export function spawnLevelUpBanner(
  scene: InstanceType<typeof THREE.Scene>,
  worldPos: V3,
  newLevel: number,
  /** Optional: if provided, banner tracks this position each frame */
  getPlayerPos?: () => InstanceType<typeof THREE.Vector3>,
): void {
  // 256×128 canvas → 2.4×1.2 plane (2:1 aspect, no squish)
  const tex = makeBannerTexture(
    'LEVEL UP!',
    `► Level ${newLevel}`,
    '#ffee44',
    '#ffffff',
  );
  // Place the banner close to the camera and below the player model so it
  // occupies the lower portion of screen rather than centre-stage.
  // We offset the spawn point: slightly forward (toward camera) and down.
  const bannerPos = worldPos.clone().add(new THREE.Vector3(0, -0.3, 1.5));
  const trackTarget = getPlayerPos
    ? { getPos: () => getPlayerPos().clone().add(new THREE.Vector3(0, -0.3, 1.5)) }
    : null;
  spawnFloat(scene, tex,
    bannerPos,
    1.4, 0.7, 2.4,  // smaller quad (was 2.4×1.2)
    0.3,            // very gentle upward drift
    0, 0,
    trackTarget,
  );
}

export function updateDamageNumbers(
  scene: InstanceType<typeof THREE.Scene>,
  camera: Camera,
  dt: number,
): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const d = active[i];
    d.life -= dt;

    if (d.life <= 0) {
      scene.remove(d.mesh);
      (d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).map?.dispose();
      (d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
      d.mesh.geometry.dispose();
      active.splice(i, 1);
      continue;
    }

    // Integrate position
    d.vx += d.ax * dt;
    if (d.trackTarget) {
      // Follow player world position + accumulated Y offset
      d.trackOffsetY += d.vy * dt;
      const anchor = d.trackTarget.getPos();
      d.mesh.position.set(
        anchor.x + d.vx,
        anchor.y + d.trackOffsetY,
        anchor.z,
      );
    } else {
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
    }

    // Billboard: always face the camera
    d.mesh.quaternion.copy(camera.quaternion);

    // Fade out in last 40% of life
    const t = 1 - d.life / d.maxLife;
    const opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    const mat = d.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    mat.opacity = opacity;

    // Scale up slightly on crit
    // Crit numbers grow slightly as they rise
    if (d.mesh.scale.x > 1.3) d.mesh.scale.setScalar(1 + t * 0.25);
  }
}
