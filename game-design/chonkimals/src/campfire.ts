// Campfire upgrade — the camp's fire pit (build_camp.py prop_fire_*) had a single
// static clay cone for a flame. This swaps that cone for a living fire: a log teepee
// on a bed of glowing embers, three layered flickering flames (a small shader: sway +
// breathing + a hot-core → orange → red-tip gradient, additive so the bloom picks it
// up), rising sparks, lazy smoke puffs, a soft glow and a warm flickering light that
// paints the stones, benches and campers around it. The stone ring + pad stay.
//
// Built in world space at the old flame's spot (camp props have baked vertices — use
// its bounds, not its position). Call `Campfire.build()` after the stage loads and
// BEFORE static batching (it removes the old flame mesh). Tuning in CAMPFIRE.

type Scene = InstanceType<typeof THREE.Scene>;
type Object3D = InstanceType<typeof THREE.Object3D>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type Sprite = InstanceType<typeof THREE.Sprite>;
type Vector3 = InstanceType<typeof THREE.Vector3>;

export const CAMPFIRE = {
  flameMesh: 'prop_fire_flame',
  /** Overall size (world units; the camp is at WORLD_SCALE 1.35). */
  scale: 1.35,
  light: { color: 0xff8a3a, intensity: 18, distance: 16, flicker: 0.28 },
  sparks: 34,
  smoke: 7,
  colors: { log: 0x7a4a2a, logEnd: 0xd9a86a, ember: 0xff5a14, char: 0x2a1a12 },
};

const FLAME_VERT = /* glsl */ `
  uniform float uTime, uSeed;
  varying float vH;
  varying float vRim;
  void main() {
    vH = uv.y;
    vec3 p = position;
    float h = uv.y;
    // Sway (stronger toward the tip), breathing, and a fast lick.
    p.x += sin(uTime * 5.3 + uSeed + h * 3.0) * 0.14 * h * h + sin(uTime * 11.0 + uSeed * 2.0) * 0.04 * h;
    p.z += cos(uTime * 4.1 + uSeed * 1.7 + h * 2.0) * 0.1 * h * h;
    p.xz *= 1.0 + sin(uTime * 13.0 + h * 7.0 + uSeed) * 0.07;
    p.y *= 1.0 + sin(uTime * 7.7 + uSeed) * 0.09 + sin(uTime * 17.0 + uSeed * 3.0) * 0.04;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vRim = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;

const FLAME_FRAG = /* glsl */ `
  uniform vec3 uCore, uMid, uTip;
  uniform float uAlpha;
  varying float vH;
  varying float vRim;
  void main() {
    vec3 c = mix(uCore, uMid, smoothstep(0.05, 0.55, vH));
    c = mix(c, uTip, smoothstep(0.55, 1.0, vH));
    // Soft edges (facing the eye = bright) and a fade toward the tip.
    float a = smoothstep(0.05, 0.6, vRim) * (1.0 - smoothstep(0.7, 1.0, vH)) * uAlpha;
    gl_FragColor = vec4(c * a, a);
  }`;

function flameGeometry(): InstanceType<typeof THREE.LatheGeometry> {
  const prof: [number, number][] = [[0, 0], [0.3, 0.06], [0.42, 0.26], [0.37, 0.56], [0.23, 0.9], [0.09, 1.2], [0, 1.42]];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
}

function glowTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,200,120,1)');
  g.addColorStop(0.35, 'rgba(255,140,60,0.45)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = c.getContext('2d')!;
  for (const [x, y, r] of [[64, 70, 44], [46, 58, 30], [82, 56, 32], [62, 44, 28]] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(235,235,240,0.55)');
    g.addColorStop(1, 'rgba(235,235,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff { s: Sprite; t: number; life: number; drift: Vector3 }

export class Campfire {
  readonly root = new THREE.Group();
  private flames: { m: Mesh; u: Record<string, { value: unknown }> }[] = [];
  private light: InstanceType<typeof THREE.PointLight>;
  private glow: Sprite;
  private sparks: InstanceType<typeof THREE.Points>;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private puffs: Puff[] = [];
  private embers: InstanceType<typeof THREE.MeshStandardMaterial>;
  private t = 0;
  private full = true;

  private constructor(scene: Scene, at: Vector3) {
    const S = CAMPFIRE.scale, C = CAMPFIRE.colors;
    this.root.name = 'campfire';
    this.root.position.copy(at);
    this.root.scale.setScalar(S);
    scene.add(this.root);

    // Ember bed: a charred disc with glowing coals.
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: C.char, roughness: 1 }));
    bed.position.y = 0.04;
    bed.receiveShadow = true;
    this.root.add(bed);
    this.embers = new THREE.MeshStandardMaterial({ color: 0x5a1a08, emissive: C.ember, emissiveIntensity: 1.6, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.7;
      const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + Math.random() * 0.07, 0), this.embers);
      coal.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      coal.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.root.add(coal);
    }

    // Log teepee (leaning into a point) + two crossed logs underneath.
    const logMat = new THREE.MeshStandardMaterial({ color: C.log, roughness: 0.95 });
    const endMat = new THREE.MeshStandardMaterial({ color: C.logEnd, roughness: 0.9 });
    const log = (len: number, r: number) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, len, 9), [logMat, endMat, endMat]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const m = log(1.45, 0.075);
      const lean = 0.52;
      m.position.set(Math.cos(a) * 0.36, 0.62, Math.sin(a) * 0.36);
      m.rotation.set(0, -a, 0);
      m.rotateZ(lean);
      m.castShadow = true;
      this.root.add(m);
    }
    for (const a of [0.4, 0.4 + Math.PI / 2]) {
      const m = log(1.7, 0.09);
      m.rotation.set(0, a, Math.PI / 2);
      m.position.y = 0.14;
      m.castShadow = true;
      this.root.add(m);
    }

    // Flames: outer orange, mid, inner hot core (each on its own flicker seed).
    const geo = flameGeometry();
    const layers = [
      { s: [1.25, 1.35], core: 0xffb347, mid: 0xff6a1a, tip: 0xc8201a, a: 0.85, seed: 0.0 },
      { s: [0.9, 1.15], core: 0xffe08a, mid: 0xffa032, tip: 0xff4a1a, a: 0.9, seed: 2.1 },
      { s: [0.5, 0.75], core: 0xffffe0, mid: 0xffe27a, tip: 0xffa040, a: 1.0, seed: 4.3 },
    ];
    for (const L of layers) {
      const u = {
        uTime: { value: 0 }, uSeed: { value: L.seed }, uAlpha: { value: L.a },
        uCore: { value: new THREE.Color(L.core) }, uMid: { value: new THREE.Color(L.mid) }, uTip: { value: new THREE.Color(L.tip) },
      };
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: u, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.scale.set(L.s[0], L.s[1], L.s[0]);
      m.position.y = 0.08;
      m.renderOrder = 2;
      this.root.add(m);
      this.flames.push({ m, u });
    }
    // Little side tongues that lick up around the logs.
    for (let i = 0; i < 4; i++) {
      const u = {
        uTime: { value: 0 }, uSeed: { value: 7 + i * 1.3 }, uAlpha: { value: 0.8 },
        uCore: { value: new THREE.Color(0xffd070) }, uMid: { value: new THREE.Color(0xff7a22) }, uTip: { value: new THREE.Color(0xd8301a) },
      };
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: u, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      const a = (i / 4) * Math.PI * 2 + 0.7;
      m.position.set(Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42);
      m.scale.set(0.42, 0.62, 0.42);
      m.renderOrder = 2;
      this.root.add(m);
      this.flames.push({ m, u });
    }

    // Glow + light.
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.55 }));
    this.glow.position.y = 0.7;
    this.glow.scale.setScalar(3.4);
    this.glow.renderOrder = 1;
    this.root.add(this.glow);
    const L = CAMPFIRE.light;
    this.light = new THREE.PointLight(L.color, L.intensity, L.distance, 2);
    this.light.position.y = 1.1;
    this.root.add(this.light);

    // Sparks: points that float up, wiggle and wink out.
    const n = CAMPFIRE.sparks;
    const pos = new Float32Array(n * 3);
    this.sparkVel = new Float32Array(n * 3);
    this.sparkLife = new Float32Array(n);
    for (let i = 0; i < n; i++) this.resetSpark(pos, i, Math.random() * 2);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb04a, size: 0.09, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);

    // Smoke puffs.
    const st = smokeTexture();
    for (let i = 0; i < CAMPFIRE.smoke; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, opacity: 0 }));
      this.root.add(s);
      this.puffs.push({ s, t: (i / CAMPFIRE.smoke) * 5, life: 5, drift: new THREE.Vector3(0.18 + Math.random() * 0.1, 0, 0.08) });
    }

    this.root.traverse((o) => { o.userData.noBatch = true; });
  }

  /** Replaces the camp's static flame cone. Null if the fire pit isn't in the stage. */
  static build(scene: Scene, stageRoot: Object3D): Campfire | null {
    const old = stageRoot.getObjectByName(CAMPFIRE.flameMesh);
    if (!old) return null;
    old.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(old);
    const at = box.getCenter(new THREE.Vector3());
    at.y = box.min.y - 0.25; // the cone sat on a 0.2 plinth above the pad (camp units × WORLD_SCALE)
    old.parent?.remove(old);
    return new Campfire(scene, at);
  }

  /** A new fire (with a ring of stones) standing on the ground at world point `at`. */
  static at(scene: Scene, at: Vector3): Campfire {
    const f = new Campfire(scene, at);
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a9fa8, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stone);
      s.position.set(Math.cos(a) * 1.25, 0.12, Math.sin(a) * 1.25);
      s.scale.set(1.1, 0.7, 0.9);
      s.rotation.y = a;
      s.castShadow = true;
      s.userData.noBatch = true;
      f.root.add(s);
    }
    return f;
  }

  /** Low graphics: flames + embers only — no light (intensity 0, so no shader recompile), sparks or smoke. */
  setFull(full: boolean): void {
    this.full = full;
    this.sparks.visible = full;
    this.puffs.forEach((p) => { p.s.visible = full; });
    if (!full) this.light.intensity = 0;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    for (const f of this.flames) f.u.uTime.value = t;
    if (!this.full) return;
    // Flicker: layered noise-ish sines, never quite repeating.
    const k = 1 + (Math.sin(t * 9.1) * 0.5 + Math.sin(t * 15.7 + 1.3) * 0.3 + Math.sin(t * 23.3 + 2.1) * 0.2) * CAMPFIRE.light.flicker;
    this.light.intensity = CAMPFIRE.light.intensity * k;
    this.light.position.x = Math.sin(t * 3.3) * 0.08;
    this.glow.material.opacity = 0.45 + (k - 1) * 0.6;
    this.glow.scale.setScalar(3.2 + (k - 1) * 1.5);
    this.embers.emissiveIntensity = 1.4 + Math.sin(t * 2.3) * 0.35 + (k - 1) * 0.8;

    // Sparks.
    const pos = (this.sparks.geometry.attributes.position as InstanceType<typeof THREE.BufferAttribute>).array as Float32Array;
    for (let i = 0; i < this.sparkLife.length; i++) {
      this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) { this.resetSpark(pos, i, 1.2 + Math.random() * 1.4); continue; }
      pos[i * 3] += (this.sparkVel[i * 3] + Math.sin(t * 6 + i) * 0.15) * dt;
      pos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += (this.sparkVel[i * 3 + 2] + Math.cos(t * 5 + i) * 0.15) * dt;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    (this.sparks.material as InstanceType<typeof THREE.PointsMaterial>).opacity = 0.75 + Math.sin(t * 20) * 0.25;

    // Smoke: rise, swell, drift downwind, fade.
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t > p.life) p.t -= p.life;
      const u = p.t / p.life;
      p.s.position.set(p.drift.x * p.t * 2.2, 1.7 + u * 4.2, p.drift.z * p.t * 2.2);
      p.s.scale.setScalar(0.7 + u * 2.4);
      p.s.material.opacity = Math.sin(Math.PI * u) * 0.32;
    }
  }

  private resetSpark(pos: Float32Array, i: number, life: number): void {
    pos[i * 3] = (Math.random() - 0.5) * 0.5;
    pos[i * 3 + 1] = 0.5 + Math.random() * 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    this.sparkVel[i * 3] = (Math.random() - 0.5) * 0.35;
    this.sparkVel[i * 3 + 1] = 1.4 + Math.random() * 1.6;
    this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    this.sparkLife[i] = life;
  }
}
