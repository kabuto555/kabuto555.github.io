// Graybox material kit: cheap, lit, and legible without any texture/model
// assets (none can load in this sandbox — see ENGINE.md).

// The global `THREE` is a `const` value (see global.d.ts), not a namespace,
// so `THREE.Foo` cannot be written as a bare type. `InstanceType<typeof
// THREE.Foo>` recovers the instance type from the global without an
// `import * as THREE from 'three'`.
type MeshStandardMaterial = InstanceType<typeof THREE.MeshStandardMaterial>;
type CanvasTexture = InstanceType<typeof THREE.CanvasTexture>;

export interface FlatMaterialOptions {
  roughness?: number;
  metalness?: number;
}

// Flat-shaded MeshStandardMaterial: facets read distinctly under the
// lighting rig instead of smoothing into a flat silhouette — good default
// for primitive-composed props and characters.
export function createFlatMaterial(
  color: number,
  options: FlatMaterialOptions = {},
): MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0.05,
  });
}

// Vertex-color MeshStandardMaterial: pair with a BufferGeometry that has a
// 'color' attribute (e.g. per-face colors baked onto a merged primitive) to
// get multi-color meshes without any texture asset.
export function createVertexColorMaterial(
  options: FlatMaterialOptions = {},
): MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0.05,
  });
}

export interface GridTextureOptions {
  size?: number;
  divisions?: number;
  colorA?: string;
  colorB?: string;
  lineColor?: string;
}

// Procedural checker/grid CanvasTexture — no image asset required. Set
// `.colorSpace = THREE.SRGBColorSpace` (done here) so albedo colors match
// what the lighting rig expects under r170's default color management.
export function createGridTexture(options: GridTextureOptions = {}): CanvasTexture {
  const size = options.size ?? 512;
  const divisions = options.divisions ?? 8;
  const colorA = options.colorA ?? '#3a3f47';
  const colorB = options.colorB ?? '#454b54';
  const lineColor = options.lineColor ?? '#5a616b';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for grid texture');

  const cell = size / divisions;
  for (let y = 0; y < divisions; y++) {
    for (let x = 0; x < divisions; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  for (let i = 0; i <= divisions; i++) {
    const pos = i * cell;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export interface GroundOptions {
  size?: number;
  repeat?: number;
}

// Convenience: a receiveShadow-ready ground material built on the grid
// texture, sized so the checker reads at a legible scale on the default
// portrait camera framing.
export function createGroundMaterial(options: GroundOptions = {}): MeshStandardMaterial {
  const repeat = options.repeat ?? 10;
  const texture = createGridTexture();
  texture.repeat.set(repeat, repeat);

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.95,
    metalness: 0,
  });
}
