import * as THREE from 'three';

/**
 * Global PS1 uniforms shared by every ps1ified material (same object refs are injected into each
 * program, so the pipeline updates them once per resize / toggle — no recompiles).
 */
export const ps1Uniforms = {
  /** Snap grid in RT pixels (RT size × snapScale). */
  uPs1SnapRes: { value: new THREE.Vector2(320, 240) },
  /** 1 = snapping on, 0 = off (global debug toggle). */
  uPs1Snap: { value: 1 },
  /** 1 = affine UVs, 0 = perspective-correct (global debug toggle). */
  uPs1Affine: { value: 1 },
};

export interface Ps1MaterialOptions {
  /** Vertex snap to the low-res grid. Default true. Turn off for viewmodels/UI quads if they swim too much. */
  snap?: boolean;
  /** Affine (screen-linear) texture mapping. Default true. */
  affine?: boolean;
}

const PATCHED = Symbol('ps1');

const VERT_PARS = /* glsl */ `
uniform vec2 uPs1SnapRes;
uniform float uPs1Snap;
#ifdef PS1_AFFINE
varying vec3 vPs1AffineUv;
#endif
`;

const VERT_SNAP = /* glsl */ `
#ifdef PS1_SNAP
if (uPs1Snap > 0.5 && gl_Position.w > 0.0) {
  vec2 ps1Grid = uPs1SnapRes * 0.5;
  vec2 ndc = gl_Position.xy / gl_Position.w;
  gl_Position.xy = floor(ndc * ps1Grid + 0.5) / ps1Grid * gl_Position.w;
}
#endif
#if defined(PS1_AFFINE) && defined(USE_MAP)
// GLSL ES 3.00 has no 'noperspective': carry uv·w and w through a perspective-correct varying
// and divide per fragment -> screen-space-linear (affine) interpolation.
vPs1AffineUv = vec3(vMapUv * gl_Position.w, gl_Position.w);
#elif defined(PS1_AFFINE)
vPs1AffineUv = vec3(0.0, 0.0, 1.0);
#endif
`;

const FRAG_PARS = /* glsl */ `
#ifdef PS1_AFFINE
uniform float uPs1Affine;
varying vec3 vPs1AffineUv;
#endif
`;

const FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
  #ifdef PS1_AFFINE
  vec2 ps1MapUv = uPs1Affine > 0.5 ? vPs1AffineUv.xy / vPs1AffineUv.z : vMapUv;
  #else
  vec2 ps1MapUv = vMapUv;
  #endif
  vec4 sampledDiffuseColor = texture2D( map, ps1MapUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/**
 * Patch a standard three material (Basic/Lambert/Phong/Standard — anything using the
 * `project_vertex` + `map_fragment` chunks) in place with PS1 vertex snapping + affine UVs.
 * Idempotent. Chains any existing onBeforeCompile. Returns the same material.
 */
export function ps1ify<T extends THREE.Material>(material: T, opts: Ps1MaterialOptions = {}): T {
  const m = material as T & { [PATCHED]?: true };
  if (m[PATCHED]) return material;
  m[PATCHED] = true;
  const snap = opts.snap ?? true;
  const affine = opts.affine ?? true;
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uPs1SnapRes = ps1Uniforms.uPs1SnapRes;
    shader.uniforms.uPs1Snap = ps1Uniforms.uPs1Snap;
    shader.uniforms.uPs1Affine = ps1Uniforms.uPs1Affine;
    const defs = (snap ? '#define PS1_SNAP\n' : '') + (affine ? '#define PS1_AFFINE\n' : '');
    shader.vertexShader =
      defs +
      VERT_PARS +
      shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_SNAP}`);
    shader.fragmentShader =
      defs + FRAG_PARS + shader.fragmentShader.replace('#include <map_fragment>', FRAG_MAP);
  };
  material.customProgramCacheKey = () => `${prevKey()}|ps1:${snap ? 1 : 0}${affine ? 1 : 0}`;
  material.needsUpdate = true;
  return material;
}

export interface MakePs1MaterialParams extends Ps1MaterialOptions {
  map?: THREE.Texture | null;
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  /** Lambert (lit) when true, Basic (unlit/emissive look) when false. Default true. */
  lit?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  /** Lambert only: emissive tint (e.g. bonfire embers, glowing items). */
  emissive?: THREE.ColorRepresentation;
}

/** Convenience: build a ps1ified Lambert/Basic material. Use for every world/character mesh. */
export function makePs1Material(p: MakePs1MaterialParams = {}): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial {
  const common = {
    map: p.map ?? null,
    color: p.color ?? 0xffffff,
    vertexColors: p.vertexColors ?? false,
    transparent: p.transparent ?? false,
    opacity: p.opacity ?? 1,
    alphaTest: p.alphaTest ?? 0,
    side: p.side ?? THREE.FrontSide,
  };
  const mat =
    p.lit === false
      ? new THREE.MeshBasicMaterial(common)
      : new THREE.MeshLambertMaterial({ ...common, emissive: p.emissive ?? 0x000000 });
  return ps1ify(mat, p);
}
