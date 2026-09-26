// Scrolling starfield — simple particle system for space atmosphere

type Points = InstanceType<typeof THREE.Points>;

export interface Starfield {
  points: Points;
}

export function createStarfield(count = 1200): Starfield {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 120;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });
  const points = new THREE.Points(geo, mat);
  return { points };
}

/** Keep starfield centred on the camera so stars are always visible regardless of rail position */
export function updateStarfield(
  sf: Starfield,
  cameraPos: InstanceType<typeof THREE.Vector3>,
): void {
  sf.points.position.copy(cameraPos);
}
