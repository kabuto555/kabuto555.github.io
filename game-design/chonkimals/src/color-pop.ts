/**
 * Palette + material pass — a load-time recolour and "cozy arts-and-crafts"
 * finish for the authored world materials, WITHOUT re-baking the GLB.
 *
 * Art direction (2026-09-23): soft, cozy, hand-crafted — a mix of clay and felt,
 * NOT a bright saturated "green screen". So the greens are softened and warmed,
 * everything goes fully matte (felt has no sheen), and the big flat terrain
 * surfaces get a subtle procedural world-space GRAIN (mottle + fine speckle) so
 * they read as fabric/clay rather than flat colour.
 *
 * The camp GLB uses named per-material base colours (clay_grass, clay_rock, …).
 * Chunk instances share the template materials by reference, so each unique
 * material is processed exactly once (a WeakSet guards the shared-ref reuse).
 *
 * Runs on the world root only — the character and water shaders own their look.
 */

type Object3D = InstanceType<typeof THREE.Object3D>;
type Material = InstanceType<typeof THREE.Material>;
type MeshStandardMaterial = InstanceType<typeof THREE.MeshStandardMaterial>;

// Explicit retargets, keyed by the GLB material name. Values are linear RGB
// (three's material.color is linear), matching the GLB baseColorFactor space.
const RETARGET: Record<string, [number, number, number]> = {
  // Airy periwinkle peaks that recede into the blue haze (not white cardboard).
  clay_rock: [0.44, 0.56, 0.84],
  clay_snow: [0.72, 0.82, 0.95],
  // Softer, warmer, cozier greens — sage/meadow rather than neon lawn, so the
  // big grass fields stop reading as a bright green screen.
  clay_grass: [0.42, 0.6, 0.34],
  clay_grass2: [0.3, 0.47, 0.3], // arena enclosure — deeper meadow green
  clay_tree: [0.4, 0.58, 0.36],
  clay_lily: [0.46, 0.64, 0.44],
  // Warm sandy path/earth — neutral enough that the grade won't push it orange.
  clay_sand: [0.86, 0.79, 0.62],
  clay_dirt: [0.72, 0.58, 0.44],
  clay_straw: [0.88, 0.76, 0.52],
};

// Terrain materials get the felt/clay grain + fully-matte finish.
const TERRAIN = new Set(['clay_grass', 'clay_grass2', 'clay_sand', 'clay_dirt', 'clay_straw', 'clay_tree', 'clay_lily']);

const SATURATION_BOOST = 1.06; // gentle nudge for everything not retargeted

function isStandard(m: Material): m is MeshStandardMaterial {
  return (m as MeshStandardMaterial).isMeshStandardMaterial === true;
}

// Cheap value-noise fbm sampled from world XZ — a large soft mottle plus a fine
// speckle, multiplied onto the albedo. Reads as felt fibre / clay unevenness and
// breaks up the flat uniform colour that made surfaces look like a green screen.
const GRAIN_GLSL = /* glsl */ `
  varying vec3 vFeltWPos;
  float feltHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float feltNoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = feltHash(i), b = feltHash(i + vec2(1.0, 0.0));
    float c = feltHash(i + vec2(0.0, 1.0)), d = feltHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

/** Give a material the matte felt/clay grain (procedural, no UVs needed). */
function feltify(mat: MeshStandardMaterial): void {
  mat.roughness = 0.98; // fully matte — felt/clay, no plastic sheen
  mat.metalness = 0;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vFeltWPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vFeltWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = GRAIN_GLSL + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 wp = vFeltWPos.xz;
        float mottle = feltNoise(wp * 0.55);              // large soft patches
        float speckle = feltNoise(wp * 7.0);              // fine felt fibre
        float g = mix(0.92, 1.08, mottle) * mix(0.96, 1.04, speckle);
        diffuseColor.rgb *= g;
      }`,
    );
  };
  // Feltified terrain shares one program (color/roughness are uniforms).
  mat.customProgramCacheKey = () => 'felt-terrain';
  mat.needsUpdate = true;
}

/** Recolour + finish the authored world materials in place. Call once per load. */
export function richenPalette(root: Object3D): void {
  const seen = new WeakSet<Material>();
  const hsl = { h: 0, s: 0, l: 0 };

  root.traverse((node) => {
    const mesh = node as InstanceType<typeof THREE.Mesh>;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      if (!isStandard(mat)) continue;

      const target = RETARGET[mat.name];
      if (target) {
        mat.color.setRGB(target[0], target[1], target[2]);
      } else {
        // Gentle saturation nudge for everything else (roofs, flowers, props).
        mat.color.getHSL(hsl);
        mat.color.setHSL(hsl.h, Math.min(1, hsl.s * SATURATION_BOOST), hsl.l);
      }

      if (TERRAIN.has(mat.name)) {
        feltify(mat);
      } else {
        // Everything else: soft matte clay (no glossy sheen), a touch of body.
        mat.roughness = Math.max(mat.roughness, 0.88);
        mat.metalness = 0;
        mat.needsUpdate = true;
      }
    }
  });
}
