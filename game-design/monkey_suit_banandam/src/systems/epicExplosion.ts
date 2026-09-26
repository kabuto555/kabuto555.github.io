/**
 * Epic mecha-anime death/boss-kill explosion sequence.
 *
 * Phases:
 *  0.00–0.015s Hit-pause: DOM white flash, game logic frozen
 *  0.20–0.55s  Hard cuts of expanding debris rings (rapid flash frames)
 *  0.20–2.40s  Spinning light rays emanate from epicentre
 *  0.20–2.40s  Core bright sphere pulses + grows
 *  0.90–1.60s  Shockwave torus ring expands outward
 *  2.10–2.80s  Final nova sphere expands and blanks the screen
 *  2.80s       onComplete callback fires
 */

type Scene = InstanceType<typeof THREE.Scene>;
type V3    = InstanceType<typeof THREE.Vector3>;
type Mesh  = InstanceType<typeof THREE.Mesh>;
type Group = InstanceType<typeof THREE.Group>;

export interface EpicExplosion {
  /** Call every frame while active. Returns true while still running. */
  update(dt: number): boolean;
  /** Remove all meshes from scene immediately. */
  dispose(): void;
}

// ── Flash overlay (DOM) ───────────────────────────────────────────────────────
function makeFlashOverlay(): HTMLDivElement {
  const d = document.createElement('div');
  d.style.cssText =
    'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:9999;opacity:1;' +
    'transition:opacity 0.08s linear;';
  document.body.appendChild(d);
  return d;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function makeRay(length: number, width: number, color: number): Mesh {
  const geo = new THREE.PlaneGeometry(width, length);
  // Pivot at bottom so it radiates outward from centre
  geo.translate(0, length / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}

function makeSphere(r: number, color: number, opacity = 1): Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
}

function makeTorus(r: number, tube: number, color: number): Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 32), mat);
}

// ── Main factory ──────────────────────────────────────────────────────────────
export function startEpicExplosion(
  scene: Scene,
  worldPos: V3,
  isBoss: boolean,
  onComplete: () => void,
): EpicExplosion {
  const pos = worldPos.clone();
  let t = 0;          // seconds since explosion started
  let done = false;
  const TOTAL = 2.8;

  // ── DOM flash overlay ──────────────────────────────────────────────────────
  const overlay = makeFlashOverlay();
  // Fade out after brief flash
  requestAnimationFrame(() => {
    overlay.style.opacity = '0';
  });
  setTimeout(() => overlay.remove(), 300);

  // ── Root group ─────────────────────────────────────────────────────────────
  const root = new THREE.Group();
  root.position.copy(pos);
  scene.add(root);

  const allMeshes: (Mesh | Group)[] = [];
  function track<T extends Mesh | Group>(m: T): T { allMeshes.push(m); return m; }

  // ── Light rays ─────────────────────────────────────────────────────────────
  const RAY_COUNT = isBoss ? 14 : 10;
  const rayGroup = track(new THREE.Group());
  root.add(rayGroup);
  const rays: Mesh[] = [];
  const rayAngles: number[] = [];
  const raySpeeds: number[] = [];
  const rayLengths: number[] = [];

  for (let i = 0; i < RAY_COUNT; i++) {
    const baseAngle = (i / RAY_COUNT) * Math.PI * 2;
    const speed = (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 1.4);
    const len = isBoss ? (3.5 + Math.random() * 4.0) : (2.0 + Math.random() * 2.5);
    const width = 0.18 + Math.random() * 0.28;
    const ray = makeRay(len, width, 0xffffff);
    ray.rotation.z = baseAngle;
    ray.renderOrder = 10;
    rayGroup.add(ray);
    rays.push(ray);
    rayAngles.push(baseAngle);
    raySpeeds.push(speed);
    rayLengths.push(len);
  }

  // ── Core sphere ────────────────────────────────────────────────────────────
  const coreR = isBoss ? 1.0 : 0.55;
  const core = track(makeSphere(coreR, 0xffffff));
  core.renderOrder = 11;
  root.add(core);

  // ── Inner glow ring (torus) ────────────────────────────────────────────────
  const ringR = isBoss ? 2.2 : 1.3;
  const shockwave = track(makeTorus(ringR, 0.18, 0xffaa44));
  shockwave.renderOrder = 9;
  shockwave.visible = false;
  root.add(shockwave);

  // ── Second outer ring ──────────────────────────────────────────────────────
  const outerRing = track(makeTorus(ringR * 1.6, 0.10, 0xff6600));
  outerRing.renderOrder = 9;
  outerRing.visible = false;
  root.add(outerRing);

  // ── Nova sphere (final flash) ──────────────────────────────────────────────
  const novaMax = isBoss ? 18 : 10;
  const nova = track(makeSphere(0.1, 0xffffff, 0));
  nova.renderOrder = 12;
  root.add(nova);

  // ── Debris particle sparks ─────────────────────────────────────────────────
  const SPARK_COUNT = isBoss ? 80 : 48;
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  for (let i = 0; i < SPARK_COUNT; i++) {
    const phi   = Math.random() * Math.PI * 2;
    const theta = Math.acos(2 * Math.random() - 1);
    const spd   = (isBoss ? 4 : 2.5) * (0.4 + Math.random() * 0.6);
    sparkVel[i*3]   = spd * Math.sin(theta) * Math.cos(phi);
    sparkVel[i*3+1] = spd * Math.sin(theta) * Math.sin(phi);
    sparkVel[i*3+2] = spd * Math.cos(theta);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffcc44, size: isBoss ? 0.18 : 0.12,
    sizeAttenuation: true, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.renderOrder = 10;
  root.add(sparks);
  allMeshes.push(sparks as any);

  // Keep mutable spark positions
  const sparkPositions = sparkPos.slice();

  // ── Helper: lerp colour ────────────────────────────────────────────────────
  function lerpColor(a: number, b: number, f: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (
      (Math.round(ar + (br - ar) * f) << 16) |
      (Math.round(ag + (bg - ag) * f) << 8)  |
      Math.round(ab + (bb - ab) * f)
    );
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update(dt: number): boolean {
    if (done) return false;

    // During the first 0.015s (hit-pause) advance t very slowly — brief punch freeze
    const effectiveDt = t < 0.015 ? dt * 0.05 : dt;
    t += effectiveDt;

    if (t >= TOTAL) {
      done = true;
      dispose();
      onComplete();
      return false;
    }

    const norm = t / TOTAL; // 0→1 over full sequence

    // ── Rays ──────────────────────────────────────────────────────────────────
    if (t >= 0.2) {
      const rayT = Math.min(1, (t - 0.2) / 2.2);
      // Colour: white → orange → gold → fade
      const rayColor = rayT < 0.3
        ? lerpColor(0xffffff, 0xff8800, rayT / 0.3)
        : rayT < 0.7
          ? lerpColor(0xff8800, 0xffcc00, (rayT - 0.3) / 0.4)
          : lerpColor(0xffcc00, 0xff4400, (rayT - 0.7) / 0.3);

      const rayOpacity = rayT < 0.7 ? 0.9 : 0.9 * (1 - (rayT - 0.7) / 0.3);
      const scaleGrow  = 0.3 + rayT * 1.4;

      rays.forEach((ray, i) => {
        const mat = ray.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        mat.color.setHex(rayColor);
        mat.opacity = Math.max(0, rayOpacity);
        rayAngles[i] += raySpeeds[i] * effectiveDt;
        ray.rotation.z = rayAngles[i];
        ray.scale.set(scaleGrow * (0.7 + i % 3 * 0.2), scaleGrow, 1);
      });
    }

    // ── Core sphere ───────────────────────────────────────────────────────────
    if (t >= 0.2) {
      const cT = Math.min(1, (t - 0.2) / 2.2);
      const pulse = 0.85 + 0.15 * Math.sin(t * 22);
      const coreScale = (0.5 + cT * 1.8) * pulse;
      core.scale.setScalar(coreScale);
      const cMat = core.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      const cColor = cT < 0.5
        ? lerpColor(0xffffff, 0xff8800, cT * 2)
        : lerpColor(0xff8800, 0xff2200, (cT - 0.5) * 2);
      cMat.color.setHex(cColor);
      cMat.opacity = cT < 0.8 ? 1.0 : 1 - (cT - 0.8) / 0.2;
    }

    // ── Shockwave ring ────────────────────────────────────────────────────────
    if (t >= 0.9 && t < 1.8) {
      shockwave.visible = true;
      const sw = (t - 0.9) / 0.9; // 0→1
      shockwave.scale.setScalar(1 + sw * 3.5);
      const swMat = shockwave.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      swMat.opacity = 0.9 * (1 - sw);
    } else {
      shockwave.visible = false;
    }

    // ── Outer ring ────────────────────────────────────────────────────────────
    if (t >= 1.1 && t < 2.0) {
      outerRing.visible = true;
      const or = (t - 1.1) / 0.9;
      outerRing.scale.setScalar(1 + or * 5);
      const orMat = outerRing.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      orMat.opacity = 0.7 * (1 - or);
    } else {
      outerRing.visible = false;
    }

    // ── Sparks ────────────────────────────────────────────────────────────────
    if (t >= 0.2) {
      const elapsed = t - 0.2;
      const attr = sparks.geometry.attributes['position'] as InstanceType<typeof THREE.BufferAttribute>;
      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkPositions[i*3]   = sparkVel[i*3]   * elapsed;
        sparkPositions[i*3+1] = sparkVel[i*3+1] * elapsed;
        sparkPositions[i*3+2] = sparkVel[i*3+2] * elapsed;
      }
      attr.array.set(sparkPositions);
      attr.needsUpdate = true;
      const sMat = sparks.material as InstanceType<typeof THREE.PointsMaterial>;
      sMat.opacity = Math.max(0, 1 - (t - 0.2) / 2.0);
    }

    // ── Nova flash ────────────────────────────────────────────────────────────
    if (t >= 2.1) {
      const nt = (t - 2.1) / 0.7; // 0→1
      nova.scale.setScalar(nt * novaMax);
      const nMat = nova.material as InstanceType<typeof THREE.MeshBasicMaterial>;
      nMat.opacity = nt < 0.4 ? nt / 0.4 : 1 - (nt - 0.4) / 0.6;
    }

    // ── Screen flash at nova peak ─────────────────────────────────────────────
    if (t >= 2.35 && t < 2.45) {
      const f = makeFlashOverlay();
      f.style.opacity = String(0.7 * (1 - (t - 2.35) / 0.1));
      setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 200); }, 50);
    }

    return true;
  }

  function dispose(): void {
    scene.remove(root);
    allMeshes.forEach(m => {
      if ((m as any).geometry) (m as any).geometry.dispose();
      if ((m as any).material) (m as any).material.dispose();
    });
    sparkGeo.dispose();
    sparkMat.dispose();
  }

  return { update, dispose };
}
