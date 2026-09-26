/**
 * World loader — loads mining_inst.glb, scales it so its widest XZ dimension
 * is TARGET_WORLD_SIZE units, adds it to the scene, and exposes collision meshes.
 *
 * Collision mesh filtering:
 *   EXCLUDE InstancedMesh (GPU-instanced trees/foliage)
 *   EXCLUDE any mesh whose name matches FOLIAGE_RE (named trees, bushes, etc.)
 *   INCLUDE everything else (ground, paths, mountains, rocks)
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Widest XZ dimension the terrain is scaled to (world units). */
export const TARGET_WORLD_SIZE = 120;

/** Name pattern for foliage to exclude from ground raycasting. */
const FOLIAGE_RE = /tree|birch|bush|shrub|leaf|leaves|flower|daffodil|fern|grass|weed|plant|foliage/i;

export interface WorldResult {
  root: import('three').Group;
  /** Non-foliage ground meshes — safe to raycast against for grounding. */
  collisionMeshes: import('three').Mesh[];
  /** World-space centre of the scaled terrain bounding box. */
  centre: import('three').Vector3;
  /** Terrain bounding box AFTER scaling. */
  box: import('three').Box3;
  /** Scale factor applied to the root group. */
  appliedScale: number;
}

export function loadWorld(scene: import('three').Scene): Promise<WorldResult> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      'assets/mining_inst.glb',
      (gltf) => {
        const root = gltf.scene;

        // 1. Measure raw bounding box BEFORE scaling
        const rawBox = new THREE.Box3().setFromObject(root);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);
        const rawWidest = Math.max(rawSize.x, rawSize.z);

        // 2. Scale terrain so widest XZ = TARGET_WORLD_SIZE
        const s = TARGET_WORLD_SIZE / rawWidest;
        root.scale.setScalar(s);

        // 3. Re-measure after scaling
        const box = new THREE.Box3().setFromObject(root);
        const centre = new THREE.Vector3();
        box.getCenter(centre);
        const size = new THREE.Vector3();
        box.getSize(size);

        console.log(
          `[world] raw widest XZ: ${rawWidest.toFixed(1)} → ` +
          `scale ${s.toFixed(4)} → ` +
          `final: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`,
        );

        // 4. Log ALL mesh names so we can see what the GLB contains
        const allNames: string[] = [];
        root.traverse((n) => { if (n instanceof THREE.Mesh) allNames.push(n.name || '(unnamed)'); });
        console.log('[world] all mesh names:', allNames.join(', '));

        // 5. Collect ground collision meshes
        //    Exclude: InstancedMesh (GPU trees) and foliage by name
        const collisionMeshes: import('three').Mesh[] = [];
        let skipped = 0;
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          if (node instanceof THREE.InstancedMesh) { skipped++; return; }
          if (FOLIAGE_RE.test(node.name)) { skipped++; return; }
          node.receiveShadow = true;
          collisionMeshes.push(node);
        });

        console.log(
          `[world] ${collisionMeshes.length} collision meshes kept, ${skipped} foliage/instanced skipped.`,
          collisionMeshes.map((m) => m.name || '(unnamed)').join(', '),
        );

        scene.add(root);
        resolve({ root, collisionMeshes, centre, box, appliedScale: s });
      },
      undefined,
      (error) => {
        console.error('[assets] failed to load assets/mining_inst.glb', error);
        reject(error);
      },
    );
  });
}

/**
 * One-shot raycast from startY straight down at (x,z).
 * Returns hit Y or null. Used for spawn placement.
 */
export function findGroundY(
  x: number,
  z: number,
  meshes: import('three').Mesh[],
  startY = 1000,
): number | null {
  if (meshes.length === 0) return null;
  const rc = new THREE.Raycaster();
  rc.set(new THREE.Vector3(x, startY, z), new THREE.Vector3(0, -1, 0));
  rc.far = startY * 2;
  const hits = rc.intersectObjects(meshes, false);
  return hits.length > 0 ? hits[0].point.y : null;
}
