/**
 * Load-time fixes to the baked camp terrain (camp_base.glb), for geometry that
 * can't be re-exported from Blender right now. tools/build_camp.py has the same
 * changes, so once the GLB is re-baked these become no-ops (each fix checks
 * whether its geometry already has the new shape).
 *
 * All coordinates are camp-local (build_camp.py units): the camp meshes have
 * identity transforms with their geometry baked in the camp chunk's frame, so
 * edits happen directly on the geometry, same as Dodgeball.tightenEnclosure.
 */
type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;

/** Where the cliff ramp now starts descending (it used to start at x = 18, right at the edge). */
export const RAMP_CREST_X = 8;
const OLD_RAMP_TOP_X = 18;
/** Flat landing at plateau height between the end of the road and the ramp crest. */
const LANDING = { x0: RAMP_CREST_X, x1: 21, z0: -11, z1: 0, bottom: -30 };
/** Dirt across the landing, joining the road from camp to the ramp's dirt path. */
const LANDING_PATH = { x0: RAMP_CREST_X, x1: 19.5, z0: -5, z1: 3, y: 0.025 };

/**
 * The road down to the beach overhung the cliff, and the ramp started falling
 * away right at the plateau edge. Pull the ramp's crest back to RAMP_CREST_X
 * and fill the gap with a flat landing (with a dirt path on it), so the road
 * runs onto solid ground and there's a level spot before the descent.
 * Returns new walkable meshes to add to the collision list.
 */
export function fixBeachRamp(stageRoot: Object3D): Mesh[] {
  const camp = stageRoot.getObjectByName('chunk_0_camp');
  const ground = stageRoot.getObjectByName('Camp_ground_swhill') as Mesh | undefined;
  const path = stageRoot.getObjectByName('Camp_path_swhill') as Mesh | undefined;
  if (!camp || !ground || !path) return [];
  ground.geometry.computeBoundingBox();
  if (ground.geometry.boundingBox!.max.x < OLD_RAMP_TOP_X - 0.5) return []; // already baked in

  // Move the ramp's top end back (both the grass hillside and its dirt path).
  // The dirt's top face meets the landing path instead of standing proud of it.
  for (const [m, crestTopY] of [[ground, 0], [path, LANDING_PATH.y + 0.02]] as const) {
    const pos = m.geometry.attributes.position;
    let topY = -Infinity;
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) > OLD_RAMP_TOP_X - 0.5) topY = Math.max(topY, pos.getY(i));
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) < OLD_RAMP_TOP_X - 0.5) continue;
      pos.setX(i, RAMP_CREST_X);
      if (m === path) pos.setY(i, pos.getY(i) - topY + crestTopY); // keeps the slab's thickness
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  }

  // The landing: a solid block of plateau (grass), same material as the hillside.
  const { x0, x1, z0, z1, bottom } = LANDING;
  const landingGeo = new THREE.BoxGeometry(x1 - x0, -bottom, z1 - z0);
  landingGeo.translate((x0 + x1) / 2, bottom / 2, (z0 + z1) / 2);
  const landing = new THREE.Mesh(landingGeo, ground.material);
  landing.name = 'Camp_ground_ramplanding';

  const p = LANDING_PATH;
  const pathGeo = new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0).rotateX(-Math.PI / 2);
  pathGeo.translate((p.x0 + p.x1) / 2, p.y, (p.z0 + p.z1) / 2);
  const landingPath = new THREE.Mesh(pathGeo, path.material);
  landingPath.name = 'Camp_path_ramplanding';

  for (const m of [landing, landingPath]) {
    m.receiveShadow = true;
    m.castShadow = m === landing;
    camp.add(m);
  }
  camp.updateMatrixWorld(true);
  return [landing, landingPath];
}
