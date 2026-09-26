/**
 * Post-processing — hand-rolled on the global `THREE`, no addon dependency
 * (same reasoning as water.ts: the WIM addon allowlist can't be verified per
 * session, so the safe, portable choice is a self-contained pipeline built
 * from render targets + fullscreen ShaderMaterials).
 *
 * Pipeline (mobile-cheap):
 *   scene ──► LDR sRGB target (renderer keeps its Neutral tonemap, which — unlike
 *          │  ACES/AgX — preserves the vivid pastel-clay saturation)
 *          ├─► bright-pass (soft-knee threshold) at 1/2 res
 *          │      └─► gaussian blur H+V ──► blur again (wider) ──► bloom
 *          └─► COMPOSITE (full res):
 *                 + bloom ▸ vibrance ▸ saturation ▸ contrast ▸ warmth ▸
 *                 vignette ──► screen
 *
 * The scene is rendered into an sRGB render target, so the renderer applies its
 * usual tonemap + sRGB encode there exactly as it would to the canvas. The
 * composite then grades in display (gamma) space — which is what gives cartoon
 * games their punchy, predictable pop — and writes straight to the screen
 * (custom fullscreen shaders are NOT auto colour-managed by three, so writing
 * the already-sRGB value directly is correct — no double encode).
 */

type Renderer = InstanceType<typeof THREE.WebGLRenderer>;
type Scene = InstanceType<typeof THREE.Scene>;
type Camera = InstanceType<typeof THREE.Camera>;
type RenderTarget = InstanceType<typeof THREE.WebGLRenderTarget>;
// The exact union `renderer.setRenderTarget` accepts — casting to this keeps
// the `Texture | Texture[]` generic from `InstanceType` off our backs.
type RenderTargetArg = Parameters<Renderer['setRenderTarget']>[0];
type ShaderMaterial = InstanceType<typeof THREE.ShaderMaterial>;
type Vector2 = InstanceType<typeof THREE.Vector2>;

export interface PostFXParams {
  enabled: boolean;
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  bloomSoftKnee: number;
  saturation: number;
  contrast: number;
  vibrance: number;
  warmth: number;
  vignette: number;
}

// Tuned for the Animal-Crossing / Mario-Wonder brief: bright, high-key, very
// saturated, glossy highlight bloom. Live-editable via the debug panel.
// Locked from the user's live debug-panel tune (2026-09-23): bright but soft —
// vivid colour with low contrast for the cozy arts-and-crafts read.
export const postParams: PostFXParams = {
  enabled: true,
  exposure: 1.22,
  bloomStrength: 0.30,
  bloomThreshold: 0.46,
  bloomSoftKnee: 0.6,
  saturation: 1.28,
  contrast: 0.86,
  vibrance: 0.10,
  warmth: -0.010,
  vignette: 0.08,
};

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Extract bright regions with a soft knee so the bloom ramps in smoothly
// instead of hard-clipping at the threshold.
const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform float uThreshold;
  uniform float uKnee;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Soft-knee curve (Karis / Unreal style).
    float knee = uThreshold * uKnee + 1e-5;
    float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    float contrib = max(soft, l - uThreshold) / max(l, 1e-5);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

// Separable 9-tap gaussian.
const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uDir; // texel-sized step along one axis
  void main() {
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += texture2D(tDiffuse, vUv + uDir * 1.3846) * 0.316216;
    sum += texture2D(tDiffuse, vUv - uDir * 1.3846) * 0.316216;
    sum += texture2D(tDiffuse, vUv + uDir * 3.2308) * 0.070270;
    sum += texture2D(tDiffuse, vUv - uDir * 3.2308) * 0.070270;
    gl_FragColor = sum;
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;   // display-referred (sRGB) scene
  uniform sampler2D tBloom;   // sRGB bloom
  uniform float uExposure;
  uniform float uBloomStrength;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uVibrance;
  uniform float uWarmth;
  uniform float uVignette;

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb * uExposure;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    // Screen-blend the bloom so highlights glow without blowing out to white.
    vec3 col = 1.0 - (1.0 - scene) * (1.0 - bloom * uBloomStrength);

    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

    // Vibrance: push low-saturation pixels more than already-vivid ones, so the
    // whole frame gets juicier without the vivid bits going radioactive — the
    // Animal-Crossing / Mario-Wonder feel.
    float mx = max(col.r, max(col.g, col.b));
    float mn = min(col.r, min(col.g, col.b));
    float sat = mx - mn;
    col = mix(vec3(luma), col, 1.0 + uVibrance * (1.0 - sat));

    // Global saturation.
    col = mix(vec3(luma), col, uSaturation);

    // Contrast around mid-grey — gives the flat high-key lighting some form.
    col = (col - 0.5) * uContrast + 0.5;

    // Gentle warm/sunny push.
    col += vec3(uWarmth, uWarmth * 0.35, -uWarmth * 0.6);

    col = clamp(col, 0.0, 1.0);

    // Soft rounded vignette to frame the toy-diorama.
    vec2 q = vUv - 0.5;
    float vig = 1.0 - uVignette * dot(q, q) * 2.2;
    col *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeTarget(w: number, h: number, opts: { depth: boolean; srgb: boolean }): RenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: opts.depth, // only the scene target needs depth
  });
  // The scene target is sRGB so the renderer applies its tonemap + sRGB encode
  // exactly as it would to the canvas; the bloom targets are plain data.
  rt.texture.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  rt.texture.generateMipmaps = false;
  return rt;
}

export class PostFX {
  private readonly renderer: Renderer;
  private readonly quadScene: Scene;
  private readonly quadCamera: Camera;
  private readonly quad: InstanceType<typeof THREE.Mesh>;

  private sceneRT: RenderTarget;
  private brightRT: RenderTarget;
  private blurA: RenderTarget;
  private blurB: RenderTarget;

  private readonly brightMat: ShaderMaterial;
  private readonly blurMat: ShaderMaterial;
  private readonly compositeMat: ShaderMaterial;

  private width = 1;
  private height = 1;
  // Renderer logical size (CSS px). setViewport takes logical px and multiplies
  // by pixelRatio itself, so the screen pass must be reset with these, not the
  // buffer-pixel target sizes.
  private readonly logical: Vector2 = new THREE.Vector2(1, 1);

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    // The canvas backing store is the ground truth for the default framebuffer.
    // getDrawingBufferSize can drift from it when an external resizer sizes the
    // canvas directly (the WIM/preview shell does), which would make the
    // composite fill only a corner — so read the element's own width/height.
    this.width = Math.max(1, renderer.domElement.width);
    this.height = Math.max(1, renderer.domElement.height);
    renderer.getSize(this.logical);
    const bw = Math.max(1, Math.floor(this.width / 2));
    const bh = Math.max(1, Math.floor(this.height / 2));

    this.sceneRT = makeTarget(this.width, this.height, { depth: true, srgb: true });
    this.brightRT = makeTarget(bw, bh, { depth: false, srgb: false });
    this.blurA = makeTarget(bw, bh, { depth: false, srgb: false });
    this.blurB = makeTarget(bw, bh, { depth: false, srgb: false });

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        uThreshold: { value: postParams.bloomThreshold },
        uKnee: { value: postParams.bloomSoftKnee },
      },
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2() },
      },
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uExposure: { value: postParams.exposure },
        uBloomStrength: { value: postParams.bloomStrength },
        uSaturation: { value: postParams.saturation },
        uContrast: { value: postParams.contrast },
        uVibrance: { value: postParams.vibrance },
        uWarmth: { value: postParams.warmth },
        uVignette: { value: postParams.vignette },
      },
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brightMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.Camera();
  }

  /** Resize render targets to match the canvas backing store, if it changed. */
  private syncSize(): void {
    const w = Math.max(1, this.renderer.domElement.width);
    const h = Math.max(1, this.renderer.domElement.height);
    this.renderer.getSize(this.logical);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    this.sceneRT.setSize(w, h);
    this.brightRT.setSize(bw, bh);
    this.blurA.setSize(bw, bh);
    this.blurB.setSize(bw, bh);
  }

  private blit(material: ShaderMaterial, target: RenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target as RenderTargetArg);
    // Binding a render target sets its viewport automatically; the screen
    // (null) pass must be reset to the renderer's LOGICAL size (setViewport
    // multiplies by pixelRatio), otherwise it inherits the last bloom target's
    // viewport and only fills a corner.
    if (target === null) this.renderer.setViewport(0, 0, this.logical.x, this.logical.y);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  /** Drop-in for `renderer.render(scene, camera)`. */
  render(scene: Scene, camera: Camera): void {
    if (!postParams.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    this.syncSize();

    // 1. Scene → sRGB LDR target (renderer tonemaps + encodes as usual).
    this.renderer.setRenderTarget(this.sceneRT as RenderTargetArg);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    // 2. Bright-pass.
    const bw = this.brightRT.width;
    const bh = this.brightRT.height;
    this.brightMat.uniforms.tScene.value = this.sceneRT.texture;
    this.brightMat.uniforms.uThreshold.value = postParams.bloomThreshold;
    this.brightMat.uniforms.uKnee.value = postParams.bloomSoftKnee;
    this.blit(this.brightMat, this.brightRT);

    // 3. Blur (two separable passes = a wide, soft bloom).
    // H: bright → blurA
    this.blurMat.uniforms.tDiffuse.value = this.brightRT.texture;
    this.blurMat.uniforms.uDir.value.set(1 / bw, 0);
    this.blit(this.blurMat, this.blurA);
    // V: blurA → blurB
    this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1 / bh);
    this.blit(this.blurMat, this.blurB);
    // H (wider): blurB → blurA
    this.blurMat.uniforms.tDiffuse.value = this.blurB.texture;
    this.blurMat.uniforms.uDir.value.set(2 / bw, 0);
    this.blit(this.blurMat, this.blurA);
    // V (wider): blurA → blurB
    this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
    this.blurMat.uniforms.uDir.value.set(0, 2 / bh);
    this.blit(this.blurMat, this.blurB);

    // 4. Composite → screen.
    const u = this.compositeMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = this.blurB.texture;
    u.uExposure.value = postParams.exposure;
    u.uBloomStrength.value = postParams.bloomStrength;
    u.uSaturation.value = postParams.saturation;
    u.uContrast.value = postParams.contrast;
    u.uVibrance.value = postParams.vibrance;
    u.uWarmth.value = postParams.warmth;
    u.uVignette.value = postParams.vignette;
    this.blit(this.compositeMat, null);
  }
}
