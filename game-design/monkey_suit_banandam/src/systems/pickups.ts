// Pickup system — health packs and weapon powerup orbs
import { COLORS } from '../config';

type Group = InstanceType<typeof THREE.Group>;
type Vector3 = InstanceType<typeof THREE.Vector3>;

export type PickupKind = 'health' | 'vulcan' | 'missile' | 'beam' | 'sword';

export interface Pickup {
  root: Group;
  kind: PickupKind;
  position: Vector3;
  spawnT: number;       // rail-t position
  offsetX: number;
  offsetY: number;
  age: number;
  dead: boolean;
  scaleProgress: number;
  /** World-space offset accumulated by magnet pull — added on top of rail position */
  magnetOffset: Vector3;
}

// Geometry caches
let _healthGeo: InstanceType<typeof THREE.BoxGeometry> | null = null;
let _orbGeo: InstanceType<typeof THREE.IcosahedronGeometry> | null = null;

function buildHealthPickup(): Group {
  const root = new THREE.Group();
  if (!_healthGeo) _healthGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const crossH = new THREE.Mesh(_healthGeo,
    new THREE.MeshBasicMaterial({ color: COLORS.healthPickup }));
  root.add(crossH);
  // Plus sign on front
  const barH = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.12, 0.45),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  root.add(barH);
  const barV = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.38, 0.45),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  root.add(barV);
  return root;
}

function buildWeaponPickup(kind: PickupKind): Group {
  const root = new THREE.Group();
  if (!_orbGeo) _orbGeo = new THREE.IcosahedronGeometry(0.25, 1);

  const color = kind === 'vulcan'  ? 0x00aaff
              : kind === 'missile' ? COLORS.playerMissile
              : kind === 'beam'    ? COLORS.playerBeam
              : 0x00ffcc; // sword
  const orb = new THREE.Mesh(_orbGeo,
    new THREE.MeshBasicMaterial({ color, wireframe: false }));
  root.add(orb);

  // Icon ring around it
  const ringGeo = new THREE.TorusGeometry(0.38, 0.04, 6, 16);
  const ring = new THREE.Mesh(ringGeo,
    new THREE.MeshBasicMaterial({ color: COLORS.weaponPickup }));
  root.add(ring);

  return root;
}

export function createPickup(kind: PickupKind, spawnT: number, offsetX: number, offsetY: number): Pickup {
  const root = kind === 'health' ? buildHealthPickup() : buildWeaponPickup(kind);
  return {
    root,
    kind,
    position: new THREE.Vector3(0, 0, 0),
    spawnT,
    offsetX,
    offsetY,
    age: 0,
    dead: false,
    scaleProgress: 0,
    magnetOffset: new THREE.Vector3(0, 0, 0),
  };
}

const MAGNET_RADIUS = 7;    // world units — attraction starts here
const MAGNET_SPEED  = 5.5;  // units per second at full pull

/**
 * Pull pickup toward playerPos when within MAGNET_RADIUS.
 * Call before animatePickup so the offset is already set.
 */
export function updatePickupMagnet(pickup: Pickup, playerPos: Vector3, dt: number): void {
  const toPlayer = new THREE.Vector3().subVectors(playerPos, pickup.root.position);
  const dist = toPlayer.length();
  if (dist < 0.01 || dist > MAGNET_RADIUS) return;
  // Strength ramps up as pickup gets closer (inverse linear, capped)
  const strength = Math.min(1, (MAGNET_RADIUS - dist) / MAGNET_RADIUS);
  toPlayer.normalize().multiplyScalar(MAGNET_SPEED * strength * dt);
  pickup.magnetOffset.add(toPlayer);
}

/** Spin/bob animation — applies magnetOffset on top of rail-placed position. */
export function animatePickup(pickup: Pickup, dt: number): void {
  pickup.age += dt;
  pickup.root.rotation.y += dt * 1.5;
  // Bob uses the rail position as the baseline; magnet offset is already baked into root.position
  pickup.root.position.y = pickup.position.y + pickup.magnetOffset.y + Math.sin(pickup.age * 2.5) * 0.15;
}
