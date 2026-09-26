// ── 3D piece rendering — explicit per-shape geometry, toon shading ─────────────
//
// Each ShapeId gets one hand-crafted geometry: RoundedBoxGeometry for rectangular
// pieces, a hand-drawn Shape+ExtrudeGeometry for L-shapes. No algorithmic contour
// tracing — each shape is defined explicitly and cached once.
//
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MERGE_CONFIG, PIECE_COLORS, PIECE_TINTS } from './merge-config';
import { SHAPES, type Piece, type ShapeId } from './game-types';

const { TILE_SIZE, TILE_HEIGHT, BOARD_COLS, BOARD_ROWS, BOARD_PADDING } = MERGE_CONFIG;

// Padding subtracted from each side of the piece footprint.
// A 1×1 piece footprint is TILE_SIZE × TILE_SIZE; its model is (TILE_SIZE-2*PAD) wide.
const PAD = 0.05;
// Corner radius for RoundedBoxGeometry
const R = 0.12;

// ── World-space helpers ───────────────────────────────────────────────────────

export function boardToWorld(col: number, row: number): { x: number; z: number } {
  const boardW = BOARD_COLS * TILE_SIZE;
  const boardD = BOARD_ROWS * TILE_SIZE;
  return {
    x: col * TILE_SIZE - boardW / 2 + TILE_SIZE / 2,
    z: row * TILE_SIZE - boardD / 2 + TILE_SIZE / 2,
  };
}

// ── Toon gradient map ─────────────────────────────────────────────────────────

let _gradientMap: import('three').DataTexture | null = null;
function getGradientMap(): import('three').DataTexture {
  if (_gradientMap) return _gradientMap;
  const data = new Uint8Array([40, 110, 190, 245]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _gradientMap = tex;
  return tex;
}

// ── Toon material cache ───────────────────────────────────────────────────────

const _matCache = new Map<number, import('three').MeshToonMaterial>();
function getToonMat(colorIndex: number): import('three').MeshToonMaterial {
  if (!_matCache.has(colorIndex)) {
    _matCache.set(colorIndex, new THREE.MeshToonMaterial({
      color: PIECE_COLORS[colorIndex],
      gradientMap: getGradientMap(),
    }));
  }
  return _matCache.get(colorIndex)!;
}

// ── L-shape geometry ──────────────────────────────────────────────────────────
//
// Each L is a single solid ExtrudeGeometry. The 2D outline is built as an array
// of Vector2 points (with arc subdivisions at convex corners, sharp at the
// concave notch) and passed to THREE.Shape.setFromPoints().
//
// Coordinate convention (eliminates all axis-flip confusion):
//   shape-X = world-X,  shape-Y = -world-Z  (negate Z so +Y = board top)
//   One transform: geo.rotateX(-PI/2) maps shape-XY → world-XZ, extrusion → +Y.
//   Result: bottom face at Y=0, top face at Y=TILE_HEIGHT.
//
// For a CCW polygon, convex corners turn RIGHT. The arc centre is therefore
// R units to the RIGHT of the travel direction.
//   Right of (dx, dy) = (dy, -dx)
//   arcCx = corner.x + (idy + ody) * R
//   arcCy = corner.y - (idx + odx) * R
// where (idx,idy) = incoming unit direction, (odx,ody) = outgoing unit direction.

/** Arc points for one convex corner. Returns 7 points (inclusive) tracing the
 *  quarter-circle from the incoming tangent to the outgoing tangent. */
function cornerArc(
  cx: number, cy: number,
  idx: number, idy: number,  // incoming unit direction
  odx: number, ody: number,  // outgoing unit direction
): Array<[number,number]> {
  // Tangent points (R back along incoming, R forward along outgoing)
  const tx0 = cx - idx * R, ty0 = cy - idy * R;
  const tx1 = cx + odx * R, ty1 = cy + ody * R;
  // Arc centre: R to the right of travel direction
  const arcCx = cx + (idy + ody) * R;
  const arcCy = cy - (idx + odx) * R;
  const startA = Math.atan2(ty0 - arcCy, tx0 - arcCx);
  const endA   = Math.atan2(ty1 - arcCy, tx1 - arcCx);
  // Use the shorter sweep (convex corners are always 90°).
  let sweep = endA - startA;
  // Normalise to (-PI, PI] to get the shorter arc
  while (sweep >  Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const N = 6;
  const pts: Array<[number,number]> = [];
  for (let i = 0; i <= N; i++) {
    const a = startA + sweep * i / N;
    pts.push([arcCx + Math.cos(a) * R, arcCy + Math.sin(a) * R]);
  }
  return pts;
}

function buildLGeo(shapeId: 'Lne'|'Lnw'|'Lse'|'Lsw'): import('three').BufferGeometry {
  const S = TILE_SIZE, P = PAD;
  // Outer padded edges of the 2×2 bounding box:
  const xL = -S/2+P;  // left outer
  const xR =  3*S/2-P; // right outer
  const yT =  S/2-P;  // top outer  (sy = -worldZ, so top of board = +sy)
  const yB = -3*S/2+P; // bottom outer
  // Inner notch coordinates (NO padding — internal boundary between tiles):
  const xN = S/2;   // X of notch (boundary between col 0 and col 1)
  const yN = -S/2;  // Y of notch (boundary between row 0 and row 1, negated)

  // Segment types
  type Seg =
    | { t: 'l'; x: number; y: number }
    | { t: 'c'; x: number; y: number; idx: number; idy: number; odx: number; ody: number };
  const R_ = [1,0] as const, L_ = [-1,0] as const;
  const U_ = [0,1] as const, D_ = [0,-1] as const;
  const c = (x:number,y:number,i:readonly[number,number],o:readonly[number,number]): Seg =>
    ({t:'c',x,y,idx:i[0],idy:i[1],odx:o[0],ody:o[1]});
  const l = (x:number,y:number): Seg => ({t:'l',x,y});

  // Each L has 5 convex corners (rounded) and 1 concave notch (sharp).
  // Segments listed CCW in shape-XY.
  let segs: Seg[];

  switch (shapeId) {
    // Lne: cells (0,0)(1,0)(0,1) — missing bottom-right
    // CCW trace: TL→TR→inner-TR→notch(sharp)→inner-BR→BL→back to TL
    case 'Lne': segs = [
      c(xL,yT, U_,R_),   // TL: arrive up (from left edge), leave right
      c(xR,yT, R_,D_),   // TR: arrive right, leave down
      c(xR,yN, D_,L_),   // inner-TR: arrive down, leave left
      l(xN,yN),           // sharp concave notch
      l(xN,yB),           // straight down right side of left col
      c(xN,yB, D_,L_),   // inner-BR: arrive down, leave left
      c(xL,yB, L_,U_),   // BL: arrive left, leave up
    ]; break;

    // Lnw: cells (0,0)(1,0)(1,1) — missing bottom-left
    // CCW trace: TL→TR→BR→inner-BR→notch(sharp)→inner-BL→back to TL
    case 'Lnw': segs = [
      c(xL,yT, U_,R_),   // TL: arrive up, leave right
      c(xR,yT, R_,D_),   // TR: arrive right, leave down
      c(xR,yB, D_,L_),   // BR: arrive down, leave left
      c(xN,yB, L_,U_),   // inner-BR: arrive left, leave up
      l(xN,yN),           // sharp concave notch
      l(xL,yN),           // straight left along inner bottom of left col
      c(xL,yN, L_,U_),   // inner-BL: arrive left, leave up
    ]; break;

    // Lse: cells (0,0)(0,1)(1,1) — missing top-right
    // CCW trace: TL→inner-TR→notch(sharp)→outer-TR→BR→BL→back to TL
    case 'Lse': segs = [
      c(xL,yT, U_,R_),   // TL: arrive up, leave right
      c(xN,yT, R_,D_),   // inner-TR: arrive right, leave down
      l(xN,yN),           // sharp concave notch
      l(xR,yN),           // straight right along inner top of right col
      c(xR,yN, R_,D_),   // outer-TR: arrive right, leave down
      c(xR,yB, D_,L_),   // BR: arrive down, leave left
      c(xL,yB, L_,U_),   // BL: arrive left, leave up
    ]; break;

    // Lsw: cells (1,0)(0,1)(1,1) — missing top-left
    // CCW trace: inner-TL→TR→BR→BL→outer-TL→notch(sharp)→back to inner-TL
    case 'Lsw': segs = [
      c(xN,yT, U_,R_),   // inner-TL: arrive up (from right col left edge), leave right
      c(xR,yT, R_,D_),   // TR: arrive right, leave down
      c(xR,yB, D_,L_),   // BR: arrive down, leave left
      c(xL,yB, L_,U_),   // BL: arrive left, leave up
      c(xL,yN, U_,R_),   // outer-TL: arrive up, leave right
      l(xN,yN),           // sharp concave notch
      l(xN,yT),           // straight up right side of right col
    ]; break;
  }

  // Build point list
  const pts: Array<[number,number]> = [];
  for (const seg of segs!) {
    if (seg.t === 'l') {
      pts.push([seg.x, seg.y]);
    } else {
      pts.push(...cornerArc(seg.x, seg.y, seg.idx, seg.idy, seg.odx, seg.ody));
    }
  }

  const vecs = pts.map(([x,y]) => new THREE.Vector2(x, y));
  const sh = new THREE.Shape(vecs);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: TILE_HEIGHT, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ── Geometry cache ────────────────────────────────────────────────────────────

const _geoCache = new Map<ShapeId, import('three').BufferGeometry>();

function getPieceGeo(shapeId: ShapeId): import('three').BufferGeometry {
  if (_geoCache.has(shapeId)) return _geoCache.get(shapeId)!;

  const S = TILE_SIZE;
  const w = S - 2 * PAD;  // single-tile padded size
  const segs = 3;
  let geo: import('three').BufferGeometry;

  switch (shapeId) {
    case '1x1':
      geo = new RoundedBoxGeometry(w, TILE_HEIGHT, w, segs, R);
      geo.translate(0, TILE_HEIGHT / 2, 0);  // bottom at Y=0
      break;

    case '1x2h': {
      // Spans cols 0 and 1. Anchor at col-0 centre. Piece centre at X=+S/2.
      const pw = 2 * S - 2 * PAD;
      geo = new RoundedBoxGeometry(pw, TILE_HEIGHT, w, segs, R);
      geo.translate(S / 2, TILE_HEIGHT / 2, 0);
      break;
    }
    case '1x2v': {
      // Spans rows 0 and 1. Anchor at row-0 centre. Piece centre at Z=+S/2.
      const pd = 2 * S - 2 * PAD;
      geo = new RoundedBoxGeometry(w, TILE_HEIGHT, pd, segs, R);
      geo.translate(0, TILE_HEIGHT / 2, S / 2);
      break;
    }
    case '2x2': {
      const p2 = 2 * S - 2 * PAD;
      geo = new RoundedBoxGeometry(p2, TILE_HEIGHT, p2, segs, R);
      geo.translate(S / 2, TILE_HEIGHT / 2, S / 2);
      break;
    }
    // L-shapes: each variant is an explicit 6-vertex extruded shape.
    // Tile definitions from game-types.ts:
    //   Lne: (0,0)(1,0)(0,1) — missing bottom-right
    //   Lnw: (0,0)(1,0)(1,1) — missing bottom-left
    //   Lse: (0,0)(0,1)(1,1) — missing top-right
    //   Lsw: (1,0)(0,1)(1,1) — missing top-left
    case 'Lne': geo = buildLGeo('Lne'); break;
    case 'Lnw': geo = buildLGeo('Lnw'); break;
    case 'Lse': geo = buildLGeo('Lse'); break;
    case 'Lsw': geo = buildLGeo('Lsw'); break;
  }

  _geoCache.set(shapeId, geo!);
  return geo!;
}

// ── Label canvas texture ──────────────────────────────────────────────────────

const _labelCache = new Map<string, import('three').CanvasTexture>();

function getLabelTexture(stackValue: number, colorIndex: number): import('three').CanvasTexture {
  const key = `${stackValue}_${colorIndex}`;
  if (_labelCache.has(key)) return _labelCache.get(key)!;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const tint = PIECE_TINTS[colorIndex];
  const tr = (tint >> 16) & 0xff;
  const tg = (tint >> 8) & 0xff;
  const tb = tint & 0xff;
  ctx.fillStyle = `rgba(${tr},${tg},${tb},0.88)`;
  const pad = 14;
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, 24);
  ctx.fill();

  ctx.fillStyle = '#1a1a2e';
  ctx.font = `bold ${stackValue >= 10 ? 50 : 62}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(stackValue), size / 2, size / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _labelCache.set(key, tex);
  return tex;
}

// ── Build piece group ─────────────────────────────────────────────────────────

function buildPieceMesh(piece: Piece, group: import('three').Group): void {
  const mat = getToonMat(piece.colorIndex).clone();
  const body = new THREE.Mesh(getPieceGeo(piece.shapeId), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Label centred on the first real tile of the shape.
  // For most shapes the anchor (dc=0,dr=0) is a real tile, but Lsw's anchor
  // is the missing corner — use the first tile in the definition instead.
  const firstTile = SHAPES[piece.shapeId].tiles[0];
  const labelTex = getLabelTexture(piece.stackValue, piece.colorIndex);
  const labelSize = TILE_SIZE * 0.68;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelSize, labelSize),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(
    firstTile.dc * TILE_SIZE,
    TILE_HEIGHT + 0.004,
    firstTile.dr * TILE_SIZE,
  );
  group.add(label);
}

// ── PieceMesh ─────────────────────────────────────────────────────────────────

export interface PieceMesh {
  pieceId: number;
  group: import('three').Group;
  targetX: number;
  targetZ: number;
  currentX: number;
  currentZ: number;
  bounceT: number;
  opacity: number;
  fading: boolean;
}

export function createPieceMesh(piece: Piece): PieceMesh {
  const group = new THREE.Group();
  buildPieceMesh(piece, group);
  const { x, z } = boardToWorld(piece.col, piece.row);
  group.position.set(x, 0, z);
  return { pieceId: piece.id, group, targetX: x, targetZ: z, currentX: x, currentZ: z, bounceT: 0, opacity: 1, fading: false };
}

export function refreshPieceLabel(pm: PieceMesh, piece: Piece): void {
  while (pm.group.children.length) pm.group.remove(pm.group.children[0]);
  buildPieceMesh(piece, pm.group);
}

// ── Per-frame animation ───────────────────────────────────────────────────────

export function updatePieceMeshes(meshes: PieceMesh[], dt: number): void {
  const speed = MERGE_CONFIG.SLIDE_SPEED * TILE_SIZE;
  for (const pm of meshes) {
    const dx = pm.targetX - pm.currentX;
    const dz = pm.targetZ - pm.currentZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      const step = Math.min(dist, speed * dt);
      pm.currentX += (dx / dist) * step;
      pm.currentZ += (dz / dist) * step;
    } else {
      pm.currentX = pm.targetX;
      pm.currentZ = pm.targetZ;
    }
    pm.group.position.x = pm.currentX;
    pm.group.position.z = pm.currentZ;

    if (pm.bounceT > 0) {
      pm.bounceT = Math.max(0, pm.bounceT - dt / MERGE_CONFIG.MERGE_BOUNCE_DUR);
      const b = Math.sin(pm.bounceT * Math.PI) * 0.2;
      pm.group.position.y = b;
      pm.group.scale.set(1 - b * 0.25, 1 + b * 0.5, 1 - b * 0.25);
    } else {
      pm.group.position.y = 0;
      pm.group.scale.setScalar(1);
    }

    if (pm.fading) {
      pm.opacity = Math.max(0, pm.opacity - dt / MERGE_CONFIG.CLEAR_FADE_DUR);
      pm.group.traverse(obj => {
        const mesh = obj as import('three').Mesh;
        if (!mesh.isMesh) return;
        (mesh.material as import('three').Material).transparent = true;
        (mesh.material as import('three').Material).opacity = pm.opacity;
      });
    }
  }
}

// ── Board floor ───────────────────────────────────────────────────────────────

export function createBoardFloor(): import('three').Group {
  const group = new THREE.Group();

  const boardW = BOARD_COLS * TILE_SIZE + BOARD_PADDING * 2;
  const boardD = BOARD_ROWS * TILE_SIZE + BOARD_PADDING * 2;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, 0.1, boardD),
    new THREE.MeshToonMaterial({ color: 0x1e2d3d, gradientMap: getGradientMap() }),
  );
  base.position.y = -TILE_HEIGHT / 2 - 0.05;
  base.receiveShadow = true;
  group.add(base);

  // Cell slot markers
  const cellMat = new THREE.MeshBasicMaterial({ color: 0x253547 });
  const cellSize = TILE_SIZE - 2 * PAD - 0.04;
  const cellGeo = new THREE.PlaneGeometry(cellSize, cellSize);
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const { x, z } = boardToWorld(c, r);
      const cell = new THREE.Mesh(cellGeo, cellMat);
      cell.rotation.x = -Math.PI / 2;
      cell.position.set(x, -TILE_HEIGHT / 2 + 0.001, z);
      group.add(cell);
    }
  }
  return group;
}
