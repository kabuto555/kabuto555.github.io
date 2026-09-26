/**
 * Hiking-trail safety railing along the cliff ramp down to the beach: rustic
 * timber posts with a round handrail and a mid rail, following the slope.
 * Runs along the ramp's outer (drop) side and around the open edges of the
 * flat landing at the top (see terrain-fixes.ts).
 *
 * Built from primitives in camp-local units (build_camp.py coordinates) as a
 * child of the camp chunk, so it scales with the world. Each post-to-post span
 * also gets an invisible collision slab, taller than a jump, that joins the
 * walkable collision list — main.ts's step-height test then treats the railing
 * as a wall, so you can't walk (or hop) off the side of the trail.
 */
type Object3D = import('three').Object3D;
type Mesh = import('three').Mesh;
type Vec3 = import('three').Vector3;

/** Railing line, camp-local XZ: landing's east edge → along the ramp's outer ledge (the ramp and
 * landing end at z −11), stopping short of the beach. */
const RAIL_EDGE_Z = -10.5;
const RAIL_LINE: readonly (readonly [number, number])[] = [[20.6, -0.4], [20.6, RAIL_EDGE_Z], [-52, RAIL_EDGE_Z]];
const POST_SPACING = 2.2;
const POST_H = 1.2;          // above the ground
const TOP_RAIL_H = 1.08;     // handrail height
const MID_RAIL_H = 0.55;
const WALL_H = 5;            // invisible collision slab height — clears the frog's jump apex
const WALL_THICK = 0.35;

export function addRampRails(stageRoot: Object3D, ground: readonly Mesh[]): Mesh[] {
  const camp = stageRoot.getObjectByName('chunk_0_camp');
  if (!camp || ground.length === 0) return [];
  camp.updateMatrixWorld(true);
  const toWorld = camp.matrixWorld;
  const toLocal = toWorld.clone().invert();
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const tmp = new THREE.Vector3();

  /** Ground height (camp-local) under a camp-local XZ point. */
  const groundAt = (x: number, z: number): number | null => {
    const from = tmp.set(x, 20, z).applyMatrix4(toWorld);
    raycaster.set(from, down);
    raycaster.far = 200;
    const hit = raycaster.intersectObjects(ground as Mesh[], false)[0];
    return hit ? hit.point.clone().applyMatrix4(toLocal).y : null;
  };

  // Posts: evenly spaced along each straight run, always including the corners.
  const posts: Vec3[] = [];
  for (let i = 0; i < RAIL_LINE.length - 1; i++) {
    const [ax, az] = RAIL_LINE[i], [bx, bz] = RAIL_LINE[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / POST_SPACING));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const x = ax + (bx - ax) * (k / n), z = az + (bz - az) * (k / n);
      const y = groundAt(x, z);
      if (y !== null) posts.push(new THREE.Vector3(x, y, z));
    }
  }
  if (posts.length < 2) return [];

  const group = new THREE.Group();
  group.name = 'ramp_rails';
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6e4526, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, POST_H + 0.3, 7);
  const capGeo = new THREE.ConeGeometry(0.13, 0.12, 7);
  for (const p of posts) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(p.x, p.y + (POST_H + 0.3) / 2 - 0.3, p.z); // sunk a little into the ground
    post.rotation.y = Math.random() * Math.PI;
    post.castShadow = true;
    const cap = new THREE.Mesh(capGeo, postMat);
    cap.position.set(p.x, p.y + POST_H + 0.06, p.z);
    group.add(post, cap);
  }

  // Rails between neighbouring posts (following the slope), plus the collision slab.
  const walls: Mesh[] = [];
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i], b = posts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    q.setFromUnitVectors(yAxis, dir);
    for (const [h, r] of [[TOP_RAIL_H, 0.07], [MID_RAIL_H, 0.05]] as const) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len + 0.12, 6), railMat);
      rail.quaternion.copy(q);
      rail.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2);
      // A little sag/wobble so it reads as hand-built timber, not a CAD fence.
      rail.position.y += (Math.random() - 0.5) * 0.04;
      rail.castShadow = true;
      group.add(rail);
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len + WALL_THICK, WALL_H, WALL_THICK), wallMat);
    wall.quaternion.setFromUnitVectors(xAxis, new THREE.Vector3(dir.x, 0, dir.z).normalize());
    wall.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + WALL_H / 2 - 0.2, (a.z + b.z) / 2);
    wall.visible = false; // collision only (raycasts still hit invisible meshes)
    wall.name = `Bound_ramprail_cliff_${i}`;
    walls.push(wall);
    group.add(wall);
  }
  camp.add(group);
  camp.updateMatrixWorld(true);
  return walls;
}
