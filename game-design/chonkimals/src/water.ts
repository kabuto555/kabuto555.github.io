/**
 * Water system — animated, WIM/mobile-safe water with no texture assets and no
 * reflection render-targets (the three.js Water addon needs both; see the note
 * at the bottom of this file). Everything is a hand-rolled ShaderMaterial on the
 * global `THREE`, matching the procedural approach used by scene.ts / dust.ts.
 *
 * Three jobs:
 *   1. Swap the flat static `clay_water` meshes in the stage GLB for animated
 *      water — a rippling, depth-graded SURFACE shader on horizontal bodies
 *      (lake, pools, river, wf_top) and a downward-scrolling FLOW shader on the
 *      vertical waterfall sheets/streaks.
 *   2. Expose `sampleWater(x, z)` so the controller can tell when the frog is
 *      standing in / walking through a water body (→ float / swim immersion).
 *   3. A pooled RIPPLE-RING field the controller pings while the frog floats or
 *      swims — expanding, fading rings laid flat on the water surface.
 *
 * Fog: both shaders opt into the scene's linear fog via the standard fog
 * uniforms + chunks so distant water fades into the horizon like everything else.
 */

type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Scene = import('three').Scene;
type ShaderMaterial = InstanceType<typeof THREE.ShaderMaterial>;
type CanvasTexture = InstanceType<typeof THREE.CanvasTexture>;

// Horizontal water bodies get the ripple/depth surface treatment.
const SURFACE_RE = /^water_/i;
// …except the vertical falls (scrolling flow) and the foam/mist accents (left
// as-authored — they already read as froth and don't want a mirror surface).
const FALL_RE = /(fall|sheet|streak)/i;
// Also skip the recessed-basin bed/bank meshes (named water_*_bed/bank_ground):
// they're opaque dark ground seen THROUGH the surface, not water surfaces.
const SKIP_RE = /(foam|mist|crest|bed|bank)/i;

// ── Shaders ─────────────────────────────────────────────────────────────────

const SURFACE_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  #include <fog_pars_vertex>
  void main() {
    vec3 pos = position;
    // Gentle vertical undulation. Only bends where the mesh is tessellated;
    // harmless (flat) on the single-quad strips — those ripple via the normal.
    pos.y += sin(pos.x * 0.6 + uTime * 1.3) * 0.045
           + cos(pos.z * 0.5 - uTime * 1.1) * 0.045;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vViewDir  = cameraPosition - wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SURFACE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uDeep;
  uniform vec3  uShallow;
  uniform vec3  uSun;
  uniform float uOpacity;
  uniform float uSparkle;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vWorldPos.xz;
    float t = uTime;
    // Summed directional waves → analytic surface gradient → perturbed normal.
    vec2 g = vec2(0.0);
    g += vec2(cos(p.x * 0.55 + t * 1.4),          cos(p.y * 0.50 - t * 1.1))          * 0.12;
    g += vec2(cos(p.x * 0.90 - t * 0.9 + p.y*0.3), cos(p.y * 1.10 + t * 1.6 + p.x*0.2)) * 0.06;
    // Far away (the FTUE's bird's-eye view) the ripples are sub-pixel and the sparkle
    // aliases into noise — calm them out with distance (normal play is well inside 90).
    g *= 1.0 - smoothstep(90.0, 200.0, length(vViewDir));
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(vViewDir);
    // Fresnel: look straight down → see the DEEP colour; graze the surface →
    // brighter SHALLOW/sky tint. That angle-shift is the depth read.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 col = mix(uDeep, uShallow, clamp(fres * 1.25, 0.0, 1.0));
    // Animated sparkle where the key light glances off ripple crests.
    vec3 L = normalize(uSun);
    vec3 H = normalize(L + V);
    col += pow(max(dot(N, H), 0.0), 60.0) * uSparkle;
    float alpha = clamp(uOpacity + fres * 0.15, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

const FALL_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uDeep;    // SAME palette as the pool surface so they read as one
  uniform vec3  uShallow;
  uniform vec3  uFoam;
  uniform float uSpeed;
  uniform float uOpacity;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    // One horizontal coord across the sheet (works whether it spans X or Z).
    float across = vWorldPos.x + vWorldPos.z;
    // Break the sheet into vertical columns, each falling at its own speed/phase.
    float colId  = floor(across * 1.6);
    float phase  = hash(colId) * 6.2831;
    float cspeed = uSpeed * (0.75 + hash(colId + 7.0) * 0.7);
    // DOWNWARD flow: a crest sits where (0.7*y + t*cspeed) is constant, and that
    // height DECREASES as time grows → the streak travels down the sheet.
    float flow   = vWorldPos.y * 0.7 + uTime * cspeed + phase;
    float streak = pow(0.5 + 0.5 * sin(flow), 2.0);          // sharp falling highlights
    float fine   = 0.5 + 0.5 * sin(across * 7.0 + uTime * 2.0);
    float foam   = clamp(streak * 0.85 + fine * 0.12, 0.0, 1.0);
    vec3 base = mix(uDeep, uShallow, 0.5 + 0.25 * sin(across * 0.5));
    vec3 col  = mix(base, uFoam, foam * 0.7);
    gl_FragColor = vec4(col, uOpacity);
    #include <fog_fragment>
  }
`;

function surfaceMaterial(): ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      {
        uTime:    { value: 0 },
        uDeep:    { value: new THREE.Color(0x0b4468) }, // tints the dark recessed bed
        uShallow: { value: new THREE.Color(0x74d6e6) },
        uSun:     { value: new THREE.Vector3(0.4, 1.0, 0.3).normalize() },
        uOpacity: { value: 0.72 }, // translucent now that a real deep bed sits below
        uSparkle: { value: 0.9 },
      },
    ]),
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
}

function fallMaterial(): ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      {
        uTime:    { value: 0 },
        uDeep:    { value: new THREE.Color(0x0b4468) }, // matched to surfaceMaterial
        uShallow: { value: new THREE.Color(0x74d6e6) },
        uFoam:    { value: new THREE.Color(0xeafaff) },
        uSpeed:   { value: 5.0 },
        uOpacity: { value: 0.85 },
      },
    ]),
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
}

// ── Ripple-ring field ────────────────────────────────────────────────────────

interface Ring {
  mesh: Mesh;
  life: number;   // seconds remaining
  ttl: number;    // total lifetime
  grow: number;   // world units/sec the outer radius expands
}

class RippleField {
  private readonly pool: Ring[] = [];
  private readonly mat: InstanceType<typeof THREE.MeshBasicMaterial>;

  constructor(private readonly scene: Scene, count = 18) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.RingGeometry(0.5, 0.62, 28);
    geo.rotateX(-Math.PI / 2); // lie flat on the water plane
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, this.mat.clone());
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0, ttl: 1, grow: 1 });
    }
  }

  /** Spawn a ring at (x, y, z). `strength` scales its brightness. */
  spawn(x: number, y: number, z: number, scale = 1, strength = 0.5): void {
    const r = this.pool.find((p) => p.life <= 0);
    if (!r) return;
    r.mesh.position.set(x, y + 0.05, z);
    r.mesh.scale.setScalar(0.4 * scale);
    r.ttl = 1.1;
    r.life = r.ttl;
    r.grow = 1.6 * scale;
    r.mesh.visible = true;
    (r.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = strength;
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = r.life / r.ttl;             // 1 → 0
      r.mesh.scale.addScalar(r.grow * dt);
      (r.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = k * k * 0.6;
    }
  }
}

// ── Spray / splash field ─────────────────────────────────────────────────────
// Camera-facing sprites (procedural soft puff, no texture asset). Spray is thrown
// off the WHOLE face of each waterfall — a mist veil down the sheet, biased dense
// at the base where it hits the pool and bursts up as splash. Fog-respecting.

// One draw call for all of it: every drop is a point in a single Points batch
// (soft puff texture, per-drop size + fade) rather than a sprite of its own —
// ~500 sprites were hundreds of draw calls while the falls were on screen.

interface Drop {
  i: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; ttl: number;
  s0: number; s1: number; // size lerp
}

// A waterfall sheet: centre XZ, its base→top Y span, and its XZ footprint size
// (one axis is the sheet width, the other its thickness).
interface Emitter { cx: number; yBase: number; yTop: number; cz: number; sx: number; sz: number; }

function softPuffTexture(): CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for spray texture');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(240,250,255,0.55)');
  g.addColorStop(1, 'rgba(240,250,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPRAY_GRAVITY = 11;

class SprayField {
  private readonly drops: Drop[] = [];
  private readonly emitters: Emitter[] = [];
  private acc = 0;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly geo = new THREE.BufferGeometry();

  constructor(scene: Scene, count = 500) {
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    const attr = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr(this.pos, 3));
    this.geo.setAttribute('aSize', attr(this.size, 1));
    this.geo.setAttribute('aAlpha', attr(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uMap: { value: null }, uViewH: { value: 1000 },
      }]),
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uViewH;
        varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          // World-size puff → pixels (matches a sprite of scale aSize).
          gl_PointSize = aAlpha > 0.0 ? aSize * projectionMatrix[1][1] * uViewH * 0.5 / -mvPosition.z : 0.0;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(t.rgb, t.a * vAlpha);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    });
    mat.uniforms.uMap.value = softPuffTexture();
    const points = new THREE.Points(this.geo, mat);
    points.frustumCulled = false; // drops fly all over; the batch is one cheap call anyway
    points.renderOrder = 4;
    points.name = 'waterfall_spray';
    points.onBeforeRender = (renderer) => { mat.uniforms.uViewH.value = renderer.getRenderTarget()?.height ?? renderer.domElement.height; };
    scene.add(points);
    for (let i = 0; i < count; i++) {
      this.drops.push({ i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, ttl: 1, s0: 0.4, s1: 1.4 });
    }
  }

  addEmitter(cx: number, yBase: number, yTop: number, cz: number, sx: number, sz: number): void {
    this.emitters.push({ cx, yBase, yTop, cz, sx, sz });
  }

  get emitterCount(): number { return this.emitters.length; }

  private spawn(e: Emitter): void {
    const d = this.drops.find((p) => p.life <= 0);
    if (!d) return;
    const r = Math.random;
    const height = Math.max(0.5, e.yTop - e.yBase);
    // ~70% of spray is a churning base splash where the flow slams the pool;
    // the rest is a mist veil peeling off the whole face.
    const atBase = r() < 0.7;
    const hy = atBase ? r() * 0.1 : 0.1 + r() * 0.9;
    d.x = e.cx + (r() - 0.5) * e.sx;
    d.y = e.yBase + hy * height + (r() - 0.5) * 0.4;
    d.z = e.cz + (r() - 0.5) * e.sz;
    if (atBase) {
      // Strong upward churn, thrown wide into the pool.
      d.vx = (r() - 0.5) * (e.sx * 0.22 + 2.4);
      d.vz = (r() - 0.5) * (e.sz * 0.22 + 2.4);
      d.vy = 2.8 + r() * 3.8;
      d.ttl = 0.55 + r() * 0.6;
      d.s0 = 0.6 + r() * 0.6;
      d.s1 = d.s0 + 1.6 + r() * 1.6;
    } else {
      // Mist peeling off the sheet — small, drifts, falls away.
      d.vx = (r() - 0.5) * (e.sx * 0.15 + 1.4);
      d.vz = (r() - 0.5) * (e.sz * 0.15 + 1.4);
      d.vy = -0.6 + r() * 1.6;
      d.ttl = 0.4 + r() * 0.5;
      d.s0 = 0.35 + r() * 0.4;
      d.s1 = d.s0 + 0.6 + r() * 0.9;
    }
    d.life = d.ttl;
  }

  update(dt: number): void {
    // Emission scales with each sheet's face area (width × height), so a big
    // waterfall throws far more spray than a little one.
    let area = 0;
    for (const e of this.emitters) {
      area += Math.max(1, Math.max(e.sx, e.sz)) * Math.max(1, e.yTop - e.yBase);
    }
    this.acc += area * 1.7 * dt;
    while (this.acc >= 1 && this.emitters.length) {
      this.acc -= 1;
      this.spawn(this.emitters[(Math.random() * this.emitters.length) | 0]!);
    }
    for (const d of this.drops) {
      const i = d.i;
      if (d.life <= 0) { this.alpha[i] = 0; continue; }
      d.life -= dt;
      if (d.life <= 0) { this.alpha[i] = 0; continue; }
      d.vy -= SPRAY_GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const k = d.life / d.ttl;                 // 1 → 0
      this.pos[i * 3] = d.x; this.pos[i * 3 + 1] = d.y; this.pos[i * 3 + 2] = d.z;
      this.size[i] = d.s0 + (d.s1 - d.s0) * (1 - k);
      // Fade in fast, out slow; brightest mid-life.
      this.alpha[i] = Math.min(1, k * 2.2) * 0.75;
    }
    for (const n of ['position', 'aSize', 'aAlpha']) (this.geo.getAttribute(n) as import('three').BufferAttribute).needsUpdate = true;
  }
}

// ── Water zones (gameplay immersion query) ───────────────────────────────────

interface Zone {
  minX: number; maxX: number; minZ: number; maxZ: number; surfaceY: number;
}

export interface WaterSample {
  /** World Y of the water surface at this XZ. */
  surfaceY: number;
}

export class WaterSystem {
  private readonly surfaces: ShaderMaterial[] = [];
  private readonly falls: ShaderMaterial[] = [];
  private readonly zones: Zone[] = [];
  private readonly ripples: RippleField;
  private readonly spray: SprayField;
  private time = 0;

  constructor(scene: Scene, stageRoot: Object3D) {
    this.ripples = new RippleField(scene);
    this.spray = new SprayField(scene);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    stageRoot.updateMatrixWorld(true);

    stageRoot.traverse((node) => {
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh;
      if (!SURFACE_RE.test(mesh.name)) return;
      if (SKIP_RE.test(mesh.name)) return; // leave foam/mist/crest as authored

      if (FALL_RE.test(mesh.name)) {
        const m = fallMaterial();
        mesh.material = m;
        this.falls.push(m);
        // A spray emitter spanning the sheet's whole face (base→top, full width).
        // Skip the thin decorative streaks — one emitter per real sheet.
        if (!/streak/i.test(mesh.name)) {
          box.setFromObject(mesh);
          box.getSize(size);
          box.getCenter(centre);
          this.spray.addEmitter(centre.x, box.min.y, box.max.y, centre.z, size.x, size.z);
        }
        return;
      }

      // Horizontal surface: swap material + register a gameplay zone from its
      // world-space bounds (WORLD_SCALE is already baked into the stage root).
      const m = surfaceMaterial();
      mesh.material = m;
      mesh.renderOrder = 2;
      this.surfaces.push(m);

      box.setFromObject(mesh);
      if (!box.isEmpty()) {
        this.zones.push({
          minX: box.min.x, maxX: box.max.x,
          minZ: box.min.z, maxZ: box.max.z,
          surfaceY: box.max.y,
        });
      }
    });

    console.log(
      `[water] ${this.surfaces.length} surfaces, ${this.falls.length} falls, ` +
      `${this.zones.length} zones, ${this.spray.emitterCount} spray emitters`,
    );
  }

  /** Is (x, z) over a water body? Returns the surface Y, or null. */
  sampleWater(x: number, z: number): WaterSample | null {
    let best: WaterSample | null = null;
    for (const zn of this.zones) {
      if (x < zn.minX || x > zn.maxX || z < zn.minZ || z > zn.maxZ) continue;
      if (best === null || zn.surfaceY > best.surfaceY) best = { surfaceY: zn.surfaceY };
    }
    return best;
  }

  /** Ping a ripple ring (used by the controller for float/swim wakes). */
  ripple(x: number, y: number, z: number, scale = 1, strength = 0.5): void {
    this.ripples.spawn(x, y, z, scale, strength);
  }

  update(dt: number): void {
    this.time += dt;
    for (const m of this.surfaces) m.uniforms['uTime'].value = this.time;
    for (const m of this.falls) m.uniforms['uTime'].value = this.time;
    this.ripples.update(dt);
    this.spray.update(dt);
  }
}

/*
 * Why not `three/addons/objects/Water.js`?  It needs (1) a normal-map texture
 * (`waterNormals`) — ENGINE.md forbids inventing asset URLs — and (2) a live
 * mirror rendered into a WebGLRenderTarget per water object, i.e. ~one extra
 * full scene render per body per frame. With ~8 water meshes in camp that's a
 * non-starter on a portrait phone. This shader gets the ripple/sparkle/depth
 * read for a few uniforms and zero extra passes.
 */
