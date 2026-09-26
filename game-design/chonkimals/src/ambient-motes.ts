// Ambient motes — pollen / dandelion fluff drifting through the air around you,
// catching the sun: soft warm-white dots that float on the breeze, bob, and twinkle
// in and out. One Points draw call with a tiny shader. The field is a box that
// travels with the player (each mote wraps around it), so the air near you is
// always alive without spending anything on the rest of the map. Tuning in MOTES.

type Vector3 = InstanceType<typeof THREE.Vector3>;

export const MOTES = {
  count: 90,
  /** Half-size of the box around the player (world units) and its height band above them. */
  half: 18,
  height: [0.4, 7] as [number, number],
  wind: { x: 0.55, z: 0.25 },
  size: 7,
  color: 0xfff3c4,
  /** Overall strength (it's a background touch, not a snowstorm). */
  opacity: 0.55,
};

const VERT = /* glsl */ `
  uniform float uTime, uSize;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Twinkle: each mote fades in and out on its own slow cycle, with a quick shimmer.
    float tw = 0.5 + 0.5 * sin(uTime * (0.7 + fract(aPhase * 7.3)) + aPhase * 6.2831);
    vAlpha = smoothstep(0.15, 1.0, tw) * (0.75 + 0.25 * sin(uTime * 9.0 + aPhase * 40.0));
    gl_PointSize = uSize * (0.6 + 0.6 * fract(aPhase * 3.7)) * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.0, r);
    a = a * a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }`;

export class AmbientMotes {
  private points: InstanceType<typeof THREE.Points>;
  private pos: Float32Array;
  private seed: Float32Array;
  private uniforms = { uTime: { value: 0 }, uSize: { value: MOTES.size }, uColor: { value: new THREE.Color(MOTES.color) },
    uOpacity: { value: MOTES.opacity } };
  private t = 0;

  constructor(scene: InstanceType<typeof THREE.Scene>, around: Vector3) {
    const n = MOTES.count, H = MOTES.half;
    this.pos = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = around.x + (Math.random() * 2 - 1) * H;
      this.pos[i * 3 + 1] = around.y + MOTES.height[0] + Math.random() * (MOTES.height[1] - MOTES.height[0]);
      this.pos[i * 3 + 2] = around.z + (Math.random() * 2 - 1) * H;
      this.seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(this.seed, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.name = 'ambient_motes';
    scene.add(this.points);
  }

  setVisible(v: boolean): void { this.points.visible = v; }

  update(dt: number, around: Vector3 | null): void {
    if (!this.points.visible) return;
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    if (!around) return;
    const H = MOTES.half, W = MOTES.wind, [h0, h1] = MOTES.height;
    const p = this.pos;
    for (let i = 0; i < this.seed.length; i++) {
      const s = this.seed[i], k = i * 3;
      // Breeze + a lazy looping drift + gentle rise and fall.
      p[k] += (W.x + Math.sin(this.t * 0.4 + s * 20) * 0.35) * dt;
      p[k + 1] += Math.sin(this.t * 0.8 + s * 31) * 0.18 * dt;
      p[k + 2] += (W.z + Math.cos(this.t * 0.33 + s * 17) * 0.35) * dt;
      // Wrap around the player's box so the field travels with you.
      const dx = p[k] - around.x, dz = p[k + 2] - around.z;
      if (dx > H) p[k] -= 2 * H; else if (dx < -H) p[k] += 2 * H;
      if (dz > H) p[k + 2] -= 2 * H; else if (dz < -H) p[k + 2] += 2 * H;
      const dy = p[k + 1] - around.y;
      if (dy < h0 || dy > h1) p[k + 1] = around.y + h0 + Math.random() * (h1 - h0);
    }
    (this.points.geometry.attributes.position as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
  }
}
