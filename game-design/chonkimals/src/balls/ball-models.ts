// The big camp balls' looks, built from primitives with per-face vertex colours (no textures):
//  • beach ball — six bright gores from pole to pole, white caps at both poles
//  • soccer ball — white, with twelve black pentagon-ish patches at the icosahedron's corners
// Each is a unit-radius sphere; the ball code scales it.

type Mesh = import('three').Mesh;

/** Colours every triangle of a non-indexed geometry by its centre's direction. */
function paint(geo: import('three').BufferGeometry, colour: (dir: import('three').Vector3) => string): void {
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    col.set(colour(a.add(b).add(c).normalize()));
    for (let k = 0; k < 3; k++) col.toArray(cols, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  // Smooth shading: on a unit sphere the normal is just the position.
  geo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(pos.array as Float32Array), 3));
}

const GORES = ['#ff4d4d', '#ffd23f', '#3fa9ff', '#ffffff', '#46c96b', '#ff8a2b'];

export function beachBallMesh(): Mesh {
  const geo = new THREE.SphereGeometry(1, 36, 24).toNonIndexed();
  paint(geo, (d) => {
    if (Math.abs(d.y) > 0.93) return '#ffffff'; // the caps
    const a = (Math.atan2(d.z, d.x) + Math.PI) / (Math.PI * 2);
    return GORES[Math.floor(a * GORES.length) % GORES.length];
  });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0 }));
  m.castShadow = true;
  return m;
}

/** The icosahedron's 12 corners: where a soccer ball's pentagons sit. */
const CORNERS = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  return raw.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
})();

export function soccerBallMesh(): Mesh {
  const geo = new THREE.IcosahedronGeometry(1, 4); // already non-indexed
  const cos = Math.cos(0.36); // patch size (radians from its corner)
  paint(geo, (d) => (CORNERS.some((c) => c.dot(d) > cos) ? '#1f1f24' : '#f7f7f2'));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));
  m.castShadow = true;
  return m;
}
