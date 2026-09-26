// ── Direction arrows: pulsing chevrons shown when a piece is selected ─────────
//
// Four flat arrow meshes (left/right/up/down) are kept in the scene at all
// times; show/hide toggles their visibility. Each arrow is a chevron drawn
// as a THREE.Shape, extruded thin, and placed just outside the selected
// piece's bounding box edge. They pulse via opacity animation each frame.
//
import { MERGE_CONFIG } from './merge-config';
import { SHAPES, type Piece, type Direction } from './game-types';
import { trySlideOne } from './board';
import { boardToWorld } from './piece-renderer';

const { TILE_SIZE, TILE_HEIGHT } = MERGE_CONFIG;

// Arrow visual constants
const ARROW_Y       = TILE_HEIGHT + 0.06;  // height above board surface
const ARROW_W       = 0.30;               // chevron width (along travel axis)
const ARROW_H       = 0.36;               // chevron height (perpendicular)
const ARROW_THICK   = 0.06;               // extrusion depth
const ARROW_GAP     = 0.18;               // gap between piece edge and arrow tip
const PULSE_SPEED   = 3.2;               // radians per second
const PULSE_MIN     = 0.35;              // minimum opacity
const PULSE_MAX     = 1.0;               // maximum opacity

// ── Arrow chevron shape (in XY, pointing +X) ─────────────────────────────────
// We build one canonical right-pointing chevron, then rotate each instance.
//
//        ╱|
//       ╱ |
//      ╱  |
//      ╲  |
//       ╲ |
//        ╲|
//
// The tip is at (ARROW_W, 0), the two base corners at (0, ±ARROW_H/2).
// The inner notch creates the hollow chevron look.

function makeChevronGeo(): import('three').BufferGeometry {
  const w = ARROW_W, h = ARROW_H / 2, notch = w * 0.45;

  const shape = new THREE.Shape();
  shape.moveTo(w,  0);          // tip
  shape.lineTo(0,  h);          // top-left outer
  shape.lineTo(notch, 0);       // inner notch
  shape.lineTo(0, -h);          // bottom-left outer
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ARROW_THICK,
    bevelEnabled: false,
  });
  // Centre on Z (extrusion axis), lie flat in XZ: rotate -90° around X
  geo.translate(0, 0, -ARROW_THICK / 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ── Arrow mesh group ──────────────────────────────────────────────────────────

export interface ArrowSet {
  group: import('three').Group;
  /** Call every frame with elapsed time to animate pulse. */
  update(t: number): void;
  /** Show arrows for the valid directions of `piece` among `allPieces`. */
  show(piece: Piece, allPieces: Piece[]): void;
  /** Hide all arrows. */
  hide(): void;
}

const DIRS: Direction[] = ['left', 'right', 'up', 'down'];

// Rotation around Y to point the +X chevron in each board direction.
// Board: +X = right, +Z = down. Arrow base points +X.
// left  → rotate 180°
// right → rotate 0°
// up    → rotate +90° (pointing toward -Z = board up)
// down  → rotate -90° (pointing toward +Z = board down)
const DIR_ROT_Y: Record<Direction, number> = {
  right:  0,
  left:   Math.PI,
  up:     Math.PI / 2,
  down:  -Math.PI / 2,
};

// Offset from piece bounding-box centre to arrow position (in XZ)
// We compute this dynamically per piece in show(), but we need the direction vector:
const DIR_OFFSET: Record<Direction, { dx: number; dz: number }> = {
  left:  { dx: -1, dz:  0 },
  right: { dx:  1, dz:  0 },
  up:    { dx:  0, dz: -1 },
  down:  { dx:  0, dz:  1 },
};

export function createArrowSet(scene: import('three').Scene): ArrowSet {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const chevronGeo = makeChevronGeo();

  // One mesh per direction
  const meshes: Record<Direction, import('three').Mesh> = {} as never;
  for (const dir of DIRS) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(chevronGeo, mat);
    mesh.rotation.y = DIR_ROT_Y[dir];
    mesh.visible = false;
    group.add(mesh);
    meshes[dir] = mesh;
  }

  let _phaseOffset = 0;

  function update(t: number): void {
    if (!group.visible) return;
    for (const dir of DIRS) {
      const mesh = meshes[dir];
      if (!mesh.visible) continue;
      // Each arrow gets a slight phase offset for a cascading feel
      const phase = t * PULSE_SPEED + _phaseOffset;
      const opacity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 + 0.5 * Math.sin(phase));
      (mesh.material as import('three').MeshBasicMaterial).opacity = opacity;
    }
  }

  function show(piece: Piece, allPieces: Piece[]): void {
    // Compute piece bounding-box centre in world XZ
    const tiles = SHAPES[piece.shapeId].tiles;
    const minDc = Math.min(...tiles.map(t => t.dc));
    const maxDc = Math.max(...tiles.map(t => t.dc));
    const minDr = Math.min(...tiles.map(t => t.dr));
    const maxDr = Math.max(...tiles.map(t => t.dr));

    const anchorWorld = boardToWorld(piece.col, piece.row);
    const centreX = anchorWorld.x + ((minDc + maxDc) / 2) * TILE_SIZE;
    const centreZ = anchorWorld.z + ((minDr + maxDr) / 2) * TILE_SIZE;

    // Half-extents of the bounding box (in world units)
    const halfW = ((maxDc - minDc + 1) / 2) * TILE_SIZE;
    const halfD = ((maxDr - minDr + 1) / 2) * TILE_SIZE;

    for (const dir of DIRS) {
      const canMove = trySlideOne(piece, dir, allPieces).moved;
      const mesh = meshes[dir];
      mesh.visible = canMove;

      if (canMove) {
        const { dx, dz } = DIR_OFFSET[dir];
        // Place arrow tip just outside the piece edge
        const edgeDist = (Math.abs(dx) > 0 ? halfW : halfD) + ARROW_GAP + ARROW_W;
        mesh.position.set(
          centreX + dx * edgeDist,
          ARROW_Y,
          centreZ + dz * edgeDist,
        );
      }
    }

    _phaseOffset = Math.random() * Math.PI * 2; // randomise start phase
    group.visible = true;
  }

  function hide(): void {
    group.visible = false;
    for (const dir of DIRS) meshes[dir].visible = false;
  }

  return { group, update, show, hide };
}
