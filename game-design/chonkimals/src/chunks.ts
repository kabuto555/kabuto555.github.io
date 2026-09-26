/**
 * Modular chunk-kit assembler.
 *
 * Loads the authored base chunks (clean collidable geometry — the reusable
 * "bases") and stitches an ordered list of them into a stage by matching each
 * chunk's `socket_in` to the previous chunk's `socket_out` (position + yaw).
 *
 * Chunk contract (authored in Blender, see build_chunks.py):
 *   - 24x24u footprint, 1u = 1m, Y-up, walkable TOP at socket Y.
 *   - `socket_in`  at local origin (0,0,0), identity rotation (entry edge).
 *   - `socket_out` at the exit edge; its Y = entry Y + rise, its yaw = turn.
 *
 * Returns the same shape as world.ts's loadWorld so main.ts is a drop-in swap.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Group = InstanceType<typeof THREE.Group>;
type Object3D = InstanceType<typeof THREE.Object3D>;

export type ChunkName = 'camp' | 'flat' | 'slope' | 'switchback_l' | 'fork'
  | 'switchback_t' | 'slope_steep' | 'glide_launch';

const CHUNK_FILES: Record<ChunkName, string> = {
  camp: 'assets/chunks/camp_base.glb',
  flat: 'assets/chunks/chunk_flat.glb',
  slope: 'assets/chunks/chunk_slope.glb',
  switchback_l: 'assets/chunks/chunk_switchback_l.glb',
  fork: 'assets/chunks/chunk_fork.glb',
  switchback_t: 'assets/chunks/chunk_switchback_t.glb',
  slope_steep: 'assets/chunks/chunk_slope_steep.glb',
  glide_launch: 'assets/chunks/chunk_glide_launch.glb',
};

/**
 * Only meshes whose name matches this are walkable (raycast grounding targets).
 * Everything else (props: tents, huts, campfire, signpost) is visual-only so
 * the frog can't "ground" on top of a tent roof.
 */
const WALKABLE_RE = /surface|ground|path|cliff|^prop_bridge_.+_(rail|deck)/i;

/** Meshes that don't cast shadows (large flat walkable surfaces, water). */
const NO_SHADOW_RE = /surface|ground|_path|water|foam|sand|mist/i;

/** Uniform scale applied to the whole assembled world (spacing / grandeur). */
const WORLD_SCALE = 1.35;

/**
 * Default stage — the camp village, then the climb up the hill, ending at the
 * fork: the way up (a slope, barricaded "Under Construction") or the zipline
 * down to the beach (src/zipline.ts).
 */
export const DEFAULT_STAGE: ChunkName[] = [
  'camp', 'slope', 'flat', 'switchback_t', 'slope', 'flat', 'fork', 'slope',
];

/** A side route stitched onto a named socket of one of the main stage's pieces. */
export interface StageBranch {
  /** Index into the main layout of the piece that has the socket. */
  from: number;
  socket: string;
  layout: ChunkName[];
}

/** Off the switchback's east side: the steep climb to the hang-glider launch (src/glider.ts). */
export const DEFAULT_BRANCHES: StageBranch[] = [
  { from: 3, socket: 'socket_branch', layout: ['slope_steep', 'slope_steep', 'glide_launch'] },
];

interface ChunkTemplate {
  scene: Group;
  socketOut: Object3D;
}

export interface StageResult {
  root: Group;
  /** Walkable chunk-surface meshes — raycast against these for grounding. */
  collisionMeshes: import('three').Mesh[];
  centre: import('three').Vector3;
  box: import('three').Box3;
  appliedScale: number;
  /** Suggested spawn point (on the first chunk, near its entry). */
  spawn: import('three').Vector3;
}

function loadTemplate(url: string): Promise<ChunkTemplate> {
  return new GLTFLoader().loadAsync(url).then((gltf) => {
    const scene = gltf.scene as Group;
    const socketOut = scene.getObjectByName('socket_out');
    if (!socketOut) throw new Error(`${url}: missing socket_out marker`);
    return { scene, socketOut };
  });
}

export async function assembleStage(
  scene: import('three').Scene,
  layout: ChunkName[] = DEFAULT_STAGE,
  branches: StageBranch[] = DEFAULT_BRANCHES,
): Promise<StageResult> {
  // Load each distinct chunk once, then clone per instance.
  const names = Array.from(new Set([...layout, ...branches.flatMap((b) => b.layout)]));
  const templates = {} as Record<ChunkName, ChunkTemplate>;
  await Promise.all(
    names.map(async (n) => { templates[n] = await loadTemplate(CHUNK_FILES[n]); }),
  );

  const root = new THREE.Group();
  root.name = 'stage';
  const collisionMeshes: import('three').Mesh[] = [];

  // The running "attach" transform: where the next chunk's socket_in must land.
  const cursorPos = new THREE.Vector3(0, 0, 0);
  const cursorQuat = new THREE.Quaternion();

  const outPos = new THREE.Vector3();
  const outQuat = new THREE.Quaternion();
  const outScale = new THREE.Vector3();

  const placed: Object3D[] = [];
  const place = (name: ChunkName, instName: string): Object3D => {
    const tpl = templates[name];
    const inst = tpl.scene.clone(true);
    inst.name = instName;

    // socket_in is at the clone's local origin, so placing the clone AT the
    // cursor aligns socket_in to the cursor exactly.
    inst.position.copy(cursorPos);
    inst.quaternion.copy(cursorQuat);
    root.add(inst);
    inst.updateMatrixWorld(true);

    inst.traverse((node) => {
      if ((node as import('three').Mesh).isMesh) {
        const m = node as import('three').Mesh;
        m.receiveShadow = true;
        // Flat ground / paths / water can't throw a visible shadow — skip them in the shadow pass.
        m.castShadow = !NO_SHADOW_RE.test(m.name);
        // Only walkable surfaces are grounding targets; props are visual-only.
        if (WALKABLE_RE.test(m.name)) collisionMeshes.push(m);
      }
    });

    // Advance the cursor to this instance's socket_out world transform.
    const socketOut = inst.getObjectByName('socket_out')!;
    socketOut.matrixWorld.decompose(outPos, outQuat, outScale);
    cursorPos.copy(outPos);
    cursorQuat.copy(outQuat);
    return inst;
  };

  for (const [i, name] of layout.entries()) placed.push(place(name, `chunk_${i}_${name}`));

  // Side routes: restart the cursor at the named socket and stitch on.
  for (const [bi, br] of branches.entries()) {
    const host = placed[br.from];
    const sock = host?.getObjectByName(br.socket);
    if (!sock) { console.warn(`[chunks] branch ${bi}: ${br.socket} not found on piece ${br.from}`); continue; }
    sock.matrixWorld.decompose(outPos, outQuat, outScale);
    cursorPos.copy(outPos);
    cursorQuat.copy(outQuat);
    for (const [i, name] of br.layout.entries()) place(name, `chunk_b${bi}_${i}_${name}`);
  }

  // Scale the whole assembled world up so everything is more spaced apart and
  // grander relative to the (unscaled) frog. Applied to the root so the camp
  // and the hill chunks stay consistent; spawn/box are read AFTER scaling.
  root.scale.setScalar(WORLD_SCALE);
  scene.add(root);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const centre = new THREE.Vector3();
  box.getCenter(centre);

  // Spawn: use the `spawn` marker baked into the first piece (the camp), else
  // fall back to just inside the first chunk.
  const spawn = new THREE.Vector3(0, 0, 6);
  const spawnMarker = root.getObjectByName('spawn');
  if (spawnMarker) spawnMarker.getWorldPosition(spawn);

  return { root, collisionMeshes, centre, box, appliedScale: 1, spawn };
}
