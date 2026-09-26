// Procedural surface textures for the UI kit — ports of the two Figma shader
// fills used by the modal ("Clay" on the card, "Felt Fabric" on the header
// plaque). Figma ships these as WebGPU/WGSL, which isn't reliable on mobile
// WebViews, so they are ported line-for-line to GLSL ES 1.0 and baked ONCE per
// (shader, params, size) into an image URL used as a CSS background. Static
// (time = 0 in Figma), so a one-off bake is exact. If WebGL is unavailable the
// component keeps its flat fallback colour (same fallback Figma declares).

export type RGBA = [number, number, number, number];

export interface ClayParams {
  baseColor: RGBA;
  highlightColor: RGBA;
  bumpScale: number;
  depth: number;
  amount: number;
  /** 0 Finger pressed, 1 Pinched & pulled, 2 Kneaded, 3 Thumbprint clusters, 4 Smoothed over, 5 Rough sculpted */
  pattern: number;
  smoothness: number;
  lightAngle: number;
}

/** Felt with shapes / stitching / border stitch OFF — the only mode the design uses. */
export interface FeltParams {
  feltColor: RGBA;
  grainIntensity: number;
}

// Exact param values from the Figma modal (node 123:118 / 123:144).
export const MODAL_CLAY: ClayParams = {
  baseColor: [0.8784313797950745, 0.8039215803146362, 0.7058823704719543, 1],
  highlightColor: [0.9290000200271606, 0.8980000019073486, 0.8349999785423279, 1],
  bumpScale: 16.899999618530273,
  depth: 0.32999998331069946,
  amount: 1,
  pattern: 3,
  smoothness: 1,
  lightAngle: 135,
};

export const PLAQUE_FELT: FeltParams = {
  feltColor: [0.40392157435417175, 0.2823529541492462, 0.20000000298023224, 1],
  grainIntensity: 0.5,
};

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const CLAY_FRAG = `
precision highp float;
uniform vec2 uDims;
uniform vec3 uBase;
uniform vec3 uHighlight;
uniform float uBumpScale, uDepth, uAmount, uSmoothness, uLightAngle;
uniform int uPattern;

vec2 hash2(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float valueNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 uu = f * f * (3.0 - 2.0 * f);
  float a = hash1(i), b = hash1(i + vec2(1.0, 0.0));
  float c = hash1(i + vec2(0.0, 1.0)), d = hash1(i + vec2(1.0, 1.0));
  return mix(mix(a, b, uu.x), mix(c, d, uu.x), uu.y);
}
float fbm(vec2 p, int oct) {
  float val = 0.0, amp = 0.5; vec2 pos = p;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    val += amp * valueNoise(pos);
    pos = pos * 2.03 + vec2(1.7, 2.3);
    amp *= 0.5;
  }
  return val;
}
vec2 domainWarp(vec2 p, float s) {
  return p + vec2(fbm(p, 3), fbm(p + vec2(5.2, 1.3), 3)) * s;
}
vec2 domainWarp2(vec2 p, float s) {
  vec2 w1 = domainWarp(p, s);
  return w1 + vec2(fbm(w1 + vec2(1.7, 9.2), 3), fbm(w1 + vec2(8.3, 2.8), 3)) * s * 0.5;
}
float voronoiNoise(vec2 p, float smoothFactor) {
  vec2 ip = floor(p); vec2 fp = fract(p);
  float minDist = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 n = vec2(float(i), float(j));
      vec2 diff = n + hash2(ip + n) - fp;
      minDist = min(minDist, dot(diff, diff));
    }
  }
  return pow(sqrt(minDist), max(smoothFactor, 0.01));
}
float getHeight(vec2 coord, int pattern, float sm) {
  float h;
  if (pattern == 0) {
    vec2 wc = domainWarp2(coord, 1.5);
    h = 1.0 - voronoiNoise(wc, 0.3 + sm * 1.2);
    vec2 wc2 = domainWarp(coord * 1.7 + vec2(3.1, 7.4), 1.2);
    float h2 = 1.0 - voronoiNoise(wc2, 0.5 + sm);
    h = h * 0.6 + h2 * 0.25 + fbm(coord * 2.0, 3) * 0.15;
  } else if (pattern == 1) {
    vec2 wc = domainWarp2(vec2(coord.x * 0.6, coord.y * 1.8), 2.0);
    h = fbm(wc, 4);
    vec2 wc2 = domainWarp(coord * 1.3 + vec2(4.5, 2.1), 1.0);
    h = h * 0.7 + fbm(wc2 * vec2(0.5, 2.0), 3) * 0.3;
  } else if (pattern == 2) {
    vec2 wc = domainWarp2(coord, 2.5);
    h = fbm(wc, 5);
    vec2 wc2 = domainWarp(coord * 0.8 + vec2(2.3, 6.7), 1.8);
    h = h * 0.65 + fbm(wc2, 4) * 0.35;
  } else if (pattern == 3) {
    vec2 wc = domainWarp(coord, 1.3);
    float cluster = fbm(coord * 0.4 + vec2(3.3, 1.1), 3);
    float mask = smoothstep(0.3, 0.6, cluster);
    vec2 wc2 = domainWarp2(coord * 1.5 + vec2(7.1, 4.3), 1.0);
    float detail = 1.0 - voronoiNoise(wc2, 0.4 + sm);
    h = detail * mask * 0.7 + fbm(wc, 3) * 0.3;
  } else if (pattern == 4) {
    vec2 wc = domainWarp(coord * 0.5, 1.0);
    h = fbm(wc, 3) * 0.7 + fbm(coord * 1.5 + vec2(4.1, 2.8), 2) * 0.15;
    vec2 wc2 = domainWarp(coord * 2.0 + vec2(8.2, 3.5), 0.8);
    h = h + (1.0 - voronoiNoise(wc2, 1.0 + sm)) * 0.15;
  } else {
    vec2 wc = domainWarp2(coord, 2.0);
    h = fbm(wc, 5);
    vec2 wc2 = domainWarp(coord * 2.5 + vec2(1.9, 5.7), 1.5);
    float ridges = abs(fbm(wc2, 4) - 0.5) * 2.0;
    h = h * 0.5 + ridges * 0.3 + fbm(coord * 3.0, 3) * 0.2;
  }
  return mix(0.5, h, sm * 0.5 + 0.5);
}
void main() {
  vec2 dims = max(uDims, vec2(1.0));
  vec2 p = vec2(gl_FragCoord.x, dims.y - gl_FragCoord.y); // top-left origin, like the WGSL uv
  float sm = max(uSmoothness, 0.01);
  float k = 1.0 / min(dims.x, dims.y) * uBumpScale * uAmount;
  vec2 coord = p * k;
  float hv = getHeight(coord, uPattern, sm);
  float hR = getHeight(coord + vec2(k, 0.0), uPattern, sm);
  float hU = getHeight(coord + vec2(0.0, k), uPattern, sm);
  vec3 n = normalize(vec3(-(hR - hv) / k * uDepth * 0.8, -(hU - hv) / k * uDepth * 0.8, 1.0));
  float a = uLightAngle * 3.14159265 / 180.0;
  float diffuse = max(dot(n, normalize(vec3(cos(a), sin(a), 1.2))), 0.0);
  float shade = mix(1.0, 0.85 + 0.15 * diffuse, uDepth);
  vec3 tint = mix(uBase, uHighlight, diffuse * uDepth * 0.5);
  gl_FragColor = vec4(tint * shade, 1.0);
}
`;

const FELT_FRAG = `
precision highp float;
uniform vec2 uDims;
uniform vec3 uFelt;
uniform float uGrain;
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float val = 0.0, amp = 0.5; vec2 pp = p;
  for (int i = 0; i < 5; i++) { val += amp * vnoise(pp); pp *= 2.0; amp *= 0.5; }
  return val;
}
void main() {
  vec2 dims = max(uDims, vec2(1.0));
  vec2 p = vec2(gl_FragCoord.x, dims.y - gl_FragCoord.y);
  float g1 = fbm(p * 0.15);
  float g2 = fbm(p * 0.3 + vec2(100.0, 200.0));
  float grain = mix(0.5, g1 * 0.6 + g2 * 0.4, uGrain);
  gl_FragColor = vec4(clamp(uFelt * (0.85 + 0.3 * grain), 0.0, 1.0), 1.0);
}
`;

let gl: WebGLRenderingContext | null | undefined;
let canvas: HTMLCanvasElement;
const programs = new Map<string, WebGLProgram>();
const cache = new Map<string, Promise<string | null>>();

function getGL(): WebGLRenderingContext | null {
  if (gl !== undefined) return gl;
  canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }) as WebGLRenderingContext | null;
  if (gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  }
  return gl;
}

function program(g: WebGLRenderingContext, key: string, frag: string): WebGLProgram | null {
  const hit = programs.get(key);
  if (hit) return hit;
  const mk = (type: number, src: string) => {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
      console.warn('[ui] shader compile failed', g.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = mk(g.VERTEX_SHADER, VERT), fs = mk(g.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const p = g.createProgram()!;
  g.attachShader(p, vs); g.attachShader(p, fs);
  g.bindAttribLocation(p, 0, 'aPos');
  g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) return null;
  programs.set(key, p);
  return p;
}

function bake(kind: string, frag: string, w: number, h: number,
              setUniforms: (g: WebGLRenderingContext, p: WebGLProgram) => void): Promise<string | null> {
  const g = getGL();
  if (!g) return Promise.resolve(null);
  const p = program(g, kind, frag);
  if (!p) return Promise.resolve(null);
  canvas.width = w; canvas.height = h;
  g.viewport(0, 0, w, h);
  g.useProgram(p);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  g.uniform2f(g.getUniformLocation(p, 'uDims'), w, h);
  setUniforms(g, p);
  g.drawArrays(g.TRIANGLES, 0, 6);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png');
  });
}

/** Bake the Clay fill at design-pixel size (the pattern is normalised to min(w,h), so size-stable). */
export function clayTexture(params: ClayParams, w: number, h: number): Promise<string | null> {
  w = Math.round(w); h = Math.round(h);
  const key = `clay:${JSON.stringify(params)}:${w}x${h}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = bake('clay', CLAY_FRAG, w, h, (g, p) => {
      const u = (n: string) => g.getUniformLocation(p, n);
      g.uniform3f(u('uBase'), params.baseColor[0], params.baseColor[1], params.baseColor[2]);
      g.uniform3f(u('uHighlight'), params.highlightColor[0], params.highlightColor[1], params.highlightColor[2]);
      g.uniform1f(u('uBumpScale'), params.bumpScale);
      g.uniform1f(u('uDepth'), params.depth);
      g.uniform1f(u('uAmount'), params.amount);
      g.uniform1f(u('uSmoothness'), params.smoothness);
      g.uniform1f(u('uLightAngle'), params.lightAngle);
      g.uniform1i(u('uPattern'), Math.round(params.pattern));
    });
    cache.set(key, hit);
  }
  return hit;
}

/** Bake the Felt fill. Grain is per-pixel, so bake at DESIGN size to match Figma's 1x render. */
export function feltTexture(params: FeltParams, w: number, h: number): Promise<string | null> {
  w = Math.round(w); h = Math.round(h);
  const key = `felt:${JSON.stringify(params)}:${w}x${h}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = bake('felt', FELT_FRAG, w, h, (g, p) => {
      g.uniform3f(g.getUniformLocation(p, 'uFelt'), params.feltColor[0], params.feltColor[1], params.feltColor[2]);
      g.uniform1f(g.getUniformLocation(p, 'uGrain'), params.grainIntensity);
    });
    cache.set(key, hit);
  }
  return hit;
}

/** Apply a baked texture as an element's background once ready (fallback colour stays until then). */
export function applyTexture(el: HTMLElement, url: Promise<string | null>): void {
  url.then((u) => {
    if (!u) return;
    el.style.backgroundImage = `url("${u}")`;
    el.style.backgroundSize = '100% 100%';
  });
}
