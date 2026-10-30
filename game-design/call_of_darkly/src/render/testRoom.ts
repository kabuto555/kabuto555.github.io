import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { System } from '../core/types';
import { Rng } from '../core/rng';
import { makePs1Material } from './materials';
import { getTexture } from './textures';
import { makeBoxGeometry, makeFloorGeometry } from './geometry';
import { createBlobShadow, BLOB_LIFT } from './shadow';

/**
 * M0 test room: dirt floor, brick walls (merged, 1 draw), stone dais + pillars (instanced),
 * wood crates (instanced), a spinning metal cube with a blob shadow, a flickering fire light.
 * ~8 draw calls. Returns the group + a System that orbits the camera and animates (sim-rate,
 * render-interpolated, zero per-frame allocations).
 */
export function createTestRoom(camera: THREE.PerspectiveCamera): { group: THREE.Group; system: System } {
  const group = new THREE.Group();
  group.name = 'testRoom';
  const rng = new Rng(1337);
  const ROOM = 16;
  const WALL_H = 4;
  const WALL_T = 0.5;

  // Floor
  const floor = new THREE.Mesh(makeFloorGeometry(ROOM, ROOM, { tile: 2 }), makePs1Material({ map: getTexture('dirt', 32, 3) }));
  group.add(floor);

  // Walls — merged into one mesh.
  const half = ROOM / 2;
  const wallGeos: THREE.BufferGeometry[] = [];
  const addWall = (w: number, d: number, x: number, z: number) => {
    const g = makeBoxGeometry(w, WALL_H, d, { tile: 2 });
    g.translate(x, WALL_H / 2, z);
    wallGeos.push(g);
  };
  addWall(ROOM + WALL_T * 2, WALL_T, 0, -half - WALL_T / 2);
  addWall(ROOM + WALL_T * 2, WALL_T, 0, half + WALL_T / 2);
  addWall(WALL_T, ROOM, -half - WALL_T / 2, 0);
  addWall(WALL_T, ROOM, half + WALL_T / 2, 0);
  const walls = new THREE.Mesh(mergeGeometries(wallGeos, false), makePs1Material({ map: getTexture('brick', 32, 7) }));
  for (const g of wallGeos) g.dispose();
  group.add(walls);

  // Stone dais
  const stoneMat = makePs1Material({ map: getTexture('stone', 32, 11) });
  const dais = new THREE.Mesh(makeBoxGeometry(6, 0.3, 6, { tile: 2 }), stoneMat);
  dais.position.y = 0.15;
  group.add(dais);

  // Pillars — instanced.
  const pillarGeo = makeBoxGeometry(0.8, WALL_H, 0.8, { tile: 2 });
  const pillarSpots: Array<[number, number]> = [
    [-4.5, -4.5],
    [4.5, -4.5],
    [-4.5, 4.5],
    [4.5, 4.5],
    [0, -7],
    [-7, 0],
  ];
  const pillars = new THREE.InstancedMesh(pillarGeo, stoneMat, pillarSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  pillarSpots.forEach(([x, z], i) => pillars.setMatrixAt(i, m4.makeTranslation(x, WALL_H / 2, z)));
  group.add(pillars);

  // Crates — instanced, some stacked, jittered yaw.
  const CRATE = 0.9;
  const crateGeo = makeBoxGeometry(CRATE, CRATE, CRATE, { tile: CRATE });
  const crateSpots: Array<[number, number, number]> = [];
  const clusters: Array<[number, number]> = [
    [6, -6],
    [-6, 5.5],
    [6.2, 3],
    [-2, -6.3],
  ];
  for (const [cx, cz] of clusters) {
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) {
      crateSpots.push([cx + rng.float(-1, 1), 0, cz + rng.float(-0.8, 0.8)]);
    }
    crateSpots.push([cx, 1, cz]); // stacked
  }
  const crates = new THREE.InstancedMesh(crateGeo, makePs1Material({ map: getTexture('wood', 32, 5) }), crateSpots.length);
  crateSpots.forEach(([x, level, z], i) => {
    q.setFromAxisAngle(up, rng.float(-0.4, 0.4));
    pos.set(x, CRATE / 2 + level * CRATE, z);
    crates.setMatrixAt(i, m4.compose(pos, q, scl));
  });
  group.add(crates);

  // Metal door plate on the north wall.
  const door = new THREE.Mesh(makeBoxGeometry(2, 3, 0.1, { tile: 2 }), makePs1Material({ map: getTexture('metal', 32, 9) }));
  door.position.set(3, 1.5, -half + 0.05);
  group.add(door);

  // Spinning metal cube over the dais + blob shadow.
  const cube = new THREE.Mesh(makeBoxGeometry(1, 1, 1, { tile: 1 }), makePs1Material({ map: getTexture('metal', 32, 2) }));
  cube.position.set(0, 1.4, 0);
  group.add(cube);
  const blob = createBlobShadow(0.6);
  blob.position.set(0, 0.3 + BLOB_LIFT, 0);
  group.add(blob);

  // Fire: emissive "embers" box + flickering point light (bonfire stand-in).
  const ember = new THREE.Mesh(
    makeBoxGeometry(0.4, 0.25, 0.4, { tile: 1 }),
    makePs1Material({ lit: false, color: 0xff8a30 }),
  );
  ember.position.set(-2, 0.425, 2);
  group.add(ember);
  const fire = new THREE.PointLight(0xff9a50, 14, 12, 1);
  fire.position.set(-2, 1.2, 2);
  group.add(fire);
  group.add(new THREE.HemisphereLight(0x8a90a8, 0x2a2018, 0.9));
  const moon = new THREE.DirectionalLight(0xb8c0d8, 0.8);
  moon.position.set(-4, 8, 3);
  group.add(moon);

  // Animation state (sim-rate, render interpolates).
  let prev = 0;
  let curr = 0;
  const target = new THREE.Vector3(0, 1, 0);
  const ORBIT_R = 6.5;
  const system: System = {
    name: 'testRoom',
    update(dt) {
      prev = curr;
      curr += dt;
    },
    render(alpha) {
      const t = prev + (curr - prev) * alpha;
      const a = t * 0.18;
      camera.position.set(Math.cos(a) * ORBIT_R, 1.7 + Math.sin(t * 0.5) * 0.25, Math.sin(a) * ORBIT_R);
      camera.lookAt(target);
      cube.rotation.set(t * 0.4, t * 0.9, 0);
      // Flicker: two incommensurate sines, cheap and allocation-free.
      fire.intensity = 12 + Math.sin(t * 13.1) * 1.6 + Math.sin(t * 7.3 + 1.7) * 1.2;
    },
  };
  return { group, system };
}
