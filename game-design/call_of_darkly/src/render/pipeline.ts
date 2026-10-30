import * as THREE from 'three';
import type { Ps1Options, Ps1Pipeline } from './types';
import { ps1Uniforms } from './materials';
import { flushInstanceBatches } from './batch';
import { bayerMatrix, rtSizeForAspect, PS1_HEIGHT } from './ps1math';

export const DEFAULT_PS1_OPTIONS: Ps1Options = {
  width: 320,
  height: PS1_HEIGHT,
  snap: true,
  affine: true,
  dither: true,
  autoSize: true,
  snapScale: 1,
  enabled: true,
};

const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Linear HalfFloat RT -> sRGB encode -> 5 bits/channel with 4×4 Bayer ordered dither,
// evaluated per *RT* pixel so the dither cells upscale as chunky pixels.
const BLIT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRtSize;
uniform float uDither;
uniform float uBayer[16];
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tScene, vUv);
  vec3 srgb = clamp(linearToOutputTexel(vec4(c.rgb, 1.0)).rgb, 0.0, 1.0);
  ivec2 p = ivec2(floor(vUv * uRtSize)) & 3;
  float t = uDither > 0.5 ? uBayer[p.y * 4 + p.x] : 0.5;
  vec3 q = clamp(floor(srgb * 31.0 + t), 0.0, 31.0) / 31.0;
  gl_FragColor = vec4(q, 1.0);
}
`;

/** Real PS1 pipeline: low-res HalfFloat RT (snap/affine materials) -> nearest upscale + 15-bit dither blit. */
export function createPs1Pipeline(): Ps1Pipeline {
  let renderer: THREE.WebGLRenderer | null = null;
  const opts: Ps1Options = { ...DEFAULT_PS1_OPTIONS };
  let displayW = 1;
  let displayH = 1;

  const rt = new THREE.WebGLRenderTarget(opts.width, opts.height, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });

  const blitMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: rt.texture },
      uRtSize: { value: new THREE.Vector2(opts.width, opts.height) },
      uDither: { value: 1 },
      uBayer: { value: Array.from(bayerMatrix(4)) },
    },
    vertexShader: BLIT_VERT,
    fragmentShader: BLIT_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  // Single oversized triangle covering the viewport.
  const blitGeo = new THREE.BufferGeometry();
  blitGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const blitMesh = new THREE.Mesh(blitGeo, blitMat);
  blitMesh.frustumCulled = false;
  const blitScene = new THREE.Scene();
  blitScene.add(blitMesh);
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const stats = { calls: 0, triangles: 0 };
  const fog = new THREE.Fog(0x202028, 4, 30);
  const clearColor = new THREE.Color(0x202028);

  function applySize(): void {
    if (opts.autoSize) {
      const s = rtSizeForAspect(displayW / Math.max(displayH, 1), opts.height);
      opts.width = s.width;
      opts.height = s.height;
    }
    rt.setSize(opts.width, opts.height);
    blitMat.uniforms.uRtSize!.value.set(opts.width, opts.height);
    ps1Uniforms.uPs1SnapRes.value.set(opts.width * opts.snapScale, opts.height * opts.snapScale);
  }

  function applyToggles(): void {
    const on = opts.enabled;
    ps1Uniforms.uPs1Snap.value = on && opts.snap ? 1 : 0;
    ps1Uniforms.uPs1Affine.value = on && opts.affine ? 1 : 0;
    blitMat.uniforms.uDither!.value = opts.dither ? 1 : 0;
  }

  return {
    get options(): Readonly<Ps1Options> {
      return opts;
    },
    stats,
    init(r, o) {
      renderer = r;
      if (o) Object.assign(opts, o);
      if (o && (o.width !== undefined || o.height !== undefined) && o.autoSize === undefined) opts.autoSize = false;
      applySize();
      applyToggles();
    },
    setOptions(o) {
      Object.assign(opts, o);
      if ((o.width !== undefined || o.height !== undefined) && o.autoSize === undefined) opts.autoSize = false;
      applySize();
      applyToggles();
    },
    resize(w, h) {
      displayW = Math.max(1, Math.floor(w));
      displayH = Math.max(1, Math.floor(h));
      renderer?.setSize(displayW, displayH, false);
      applySize();
    },
    render(scene, camera) {
      if (!renderer) return;
      if (scene.fog !== fog) scene.fog = fog;
      // Nothing past full fog is visible (fragments = clear color): match the far plane to it.
      if (camera instanceof THREE.PerspectiveCamera) {
        const far = fog.far + 1;
        if (camera.far !== far) {
          camera.far = far;
          camera.updateProjectionMatrix();
        }
      }
      // One matrix pass (the renderer's own is disabled) so instance batches read fresh matrixWorlds.
      scene.matrixWorldAutoUpdate = false;
      scene.updateMatrixWorld();
      if (camera.parent === null) camera.updateMatrixWorld();
      flushInstanceBatches(scene);
      renderer.setClearColor(clearColor, 1);
      if (!opts.enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        stats.calls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
        return;
      }
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      // info auto-resets at the start of each render(): capture the main pass before the blit wipes it.
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      renderer.setRenderTarget(null);
      renderer.render(blitScene, blitCam);
    },
    setFog(color, near, far) {
      fog.color.set(color);
      fog.near = near;
      fog.far = far;
      clearColor.copy(fog.color);
    },
    dispose() {
      renderer?.setRenderTarget(null);
      rt.dispose();
      blitGeo.dispose();
      blitMat.dispose();
      renderer = null;
    },
  };
}
