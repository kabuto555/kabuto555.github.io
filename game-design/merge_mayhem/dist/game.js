(function(three) {
  "use strict";
  const CANVAS_ASPECT = "9:19.5";
  function deriveCanvasDims() {
    const longEdge = 1704;
    const raw = CANVAS_ASPECT;
    const parts = raw.split(":");
    if (parts.length !== 2) return { width: 786, height: longEdge };
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { width: 786, height: longEdge };
    const shortEdge = Math.round(longEdge * Math.min(w, h) / Math.max(w, h));
    if (w < h) return { width: shortEdge, height: longEdge };
    return { width: longEdge, height: shortEdge };
  }
  const _dims = deriveCanvasDims();
  const GAME_WIDTH = _dims.width;
  const GAME_HEIGHT = _dims.height;
  const COLORS = {
    hemisphereSky: 15922939,
    hemisphereGround: 14081768,
    directionalLight: 16777215
  };
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO = 1.5;
  function hasCoarsePointer() {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }
  function resolveDevicePixelRatio() {
    const cap = hasCoarsePointer() ? COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO : MAX_DEVICE_PIXEL_RATIO;
    return Math.min(window.devicePixelRatio || 1, cap);
  }
  function configureRenderer(renderer2) {
    renderer2.setPixelRatio(resolveDevicePixelRatio());
    renderer2.shadowMap.enabled = true;
    renderer2.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  function observeContainerResize(container2, renderer2, camera2) {
    let pendingFrame = null;
    function applyResize() {
      pendingFrame = null;
      const width = container2.clientWidth;
      const height = container2.clientHeight;
      if (width <= 0 || height <= 0) return;
      renderer2.setPixelRatio(resolveDevicePixelRatio());
      renderer2.setSize(width, height, false);
      camera2.aspect = width / height;
      camera2.updateProjectionMatrix();
    }
    function scheduleResize() {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(applyResize);
    }
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(container2);
    applyResize();
    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    };
  }
  function createLightingRig(scene2, frustumSize = 6) {
    const hemisphereLight = new THREE.HemisphereLight(
      COLORS.hemisphereSky,
      COLORS.hemisphereGround,
      0.9
    );
    scene2.add(hemisphereLight);
    const directionalLight = new THREE.DirectionalLight(COLORS.directionalLight, 1.4);
    directionalLight.position.set(4, 6, 3);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.camera.left = -frustumSize;
    directionalLight.shadow.camera.right = frustumSize;
    directionalLight.shadow.camera.top = frustumSize;
    directionalLight.shadow.camera.bottom = -frustumSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.bias = -5e-4;
    scene2.add(directionalLight);
    scene2.add(directionalLight.target);
    return { hemisphereLight, directionalLight };
  }
  const STYLE_TAG_ID = "__game-boot-gesture-hardening-styles";
  const REQUIRED_VIEWPORT_TOKENS = {
    "maximum-scale": "1.0",
    "user-scalable": "no",
    "viewport-fit": "cover"
  };
  function hardenViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    const parts = /* @__PURE__ */ new Map();
    for (const pair of meta.content.split(",")) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key) parts.set(key, value ?? "");
    }
    if (!parts.has("width")) parts.set("width", "device-width");
    if (!parts.has("initial-scale")) parts.set("initial-scale", "1.0");
    for (const [key, value] of Object.entries(REQUIRED_VIEWPORT_TOKENS)) {
      parts.set(key, value);
    }
    meta.content = Array.from(parts.entries()).map(([key, value]) => value ? `${key}=${value}` : key).join(", ");
  }
  function hardenGestures() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_TAG_ID;
    style.textContent = `
    html, body {
      touch-action: pan-x pan-y;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior: none;
    }
    :where(input, textarea) {
      user-select: text;
      -webkit-user-select: text;
      -webkit-touch-callout: default;
    }
  `;
    document.head.appendChild(style);
  }
  const MERGE_CONFIG = {
    // Board dimensions in tiles
    BOARD_COLS: 6,
    BOARD_ROWS: 8,
    // How many distinct piece colors appear on this stage (increases per stage)
    COLORS_PER_STAGE_BASE: 3,
    // stage 1 starts with this many colors
    COLORS_PER_STAGE_MAX: 6,
    // never more than this many colors
    // Stack value at which all pieces of that color are cleared from the board
    CLEAR_STACK_VALUE: 5,
    // When free-cell percentage drops below this, spawn new pieces
    SPAWN_THRESHOLD_PERCENT: 40,
    // 40% free → spawn batch
    // How many pieces to spawn per batch
    SPAWN_BATCH_SIZE: 3,
    // 3D visual constants
    TILE_SIZE: 1,
    // gap between pieces on the board
    TILE_HEIGHT: 0.32,
    // extrusion height of each tile
    BOARD_PADDING: 0.3,
    // world units of padding around the board
    // Camera
    CAM_HEIGHT: 14,
    CAM_TILT: 10,
    // degrees of tilt from straight-down
    // Animation
    SLIDE_SPEED: 12,
    // tiles/second for sliding animation
    MERGE_BOUNCE_DUR: 0.22,
    // seconds for merge bounce animation
    CLEAR_FADE_DUR: 0.35
    // seconds for color-clear fade
  };
  const PIECE_COLORS = [
    15158332,
    // red
    3447003,
    // blue
    3066993,
    // green
    15965202,
    // orange
    10181046,
    // purple
    1752220
    // teal
  ];
  const PIECE_TINTS = [
    15832202,
    8765929,
    8577194,
    16303217,
    12819411,
    7788484
  ];
  const SHAPES = {
    "1x1": { id: "1x1", tiles: [{ dc: 0, dr: 0 }], cols: 1, rows: 1 },
    "1x2h": { id: "1x2h", tiles: [{ dc: 0, dr: 0 }, { dc: 1, dr: 0 }], cols: 2, rows: 1 },
    "1x2v": { id: "1x2v", tiles: [{ dc: 0, dr: 0 }, { dc: 0, dr: 1 }], cols: 1, rows: 2 },
    // L-shapes: anchor is always the corner cell
    "Lne": { id: "Lne", tiles: [{ dc: 0, dr: 0 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }], cols: 2, rows: 2 },
    "Lnw": { id: "Lnw", tiles: [{ dc: 0, dr: 0 }, { dc: 1, dr: 0 }, { dc: 1, dr: 1 }], cols: 2, rows: 2 },
    "Lse": { id: "Lse", tiles: [{ dc: 0, dr: 0 }, { dc: 0, dr: 1 }, { dc: 1, dr: 1 }], cols: 2, rows: 2 },
    "Lsw": { id: "Lsw", tiles: [{ dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 1, dr: 1 }], cols: 2, rows: 2 },
    "2x2": { id: "2x2", tiles: [{ dc: 0, dr: 0 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 1, dr: 1 }], cols: 2, rows: 2 }
  };
  const SHAPES_BY_SIZE = {
    1: ["1x1"],
    2: ["1x2h", "1x2v"],
    3: ["Lne", "Lnw", "Lse", "Lsw"],
    4: ["2x2"]
  };
  const { BOARD_COLS: BOARD_COLS$1, BOARD_ROWS: BOARD_ROWS$1 } = MERGE_CONFIG;
  function pieceTileKeys(p) {
    return SHAPES[p.shapeId].tiles.map((t) => `${p.col + t.dc},${p.row + t.dr}`);
  }
  function buildOccupancy(pieces) {
    const map = /* @__PURE__ */ new Map();
    for (const p of pieces) {
      for (const key of pieceTileKeys(p)) map.set(key, p.id);
    }
    return map;
  }
  function countFreeCells(pieces) {
    const occ = buildOccupancy(pieces);
    return BOARD_COLS$1 * BOARD_ROWS$1 - occ.size;
  }
  function freePercent(pieces) {
    return countFreeCells(pieces) / (BOARD_COLS$1 * BOARD_ROWS$1) * 100;
  }
  const SHAPE_CELL_SETS = Object.values(SHAPES).map((s) => ({
    id: s.id,
    cells: new Set(s.tiles.map((t) => `${t.dc},${t.dr}`))
  }));
  function computeMerge(into, from) {
    const intoCells = SHAPES[into.shapeId].tiles.map((t) => ({ c: into.col + t.dc, r: into.row + t.dr }));
    const fromCells = SHAPES[from.shapeId].tiles.map((t) => ({ c: from.col + t.dc, r: from.row + t.dr }));
    const seen = /* @__PURE__ */ new Set();
    const union = [];
    for (const cell of [...intoCells, ...fromCells]) {
      const k = `${cell.c},${cell.r}`;
      if (!seen.has(k)) {
        seen.add(k);
        union.push(cell);
      }
    }
    const minC = Math.min(...union.map((u) => u.c));
    const minR = Math.min(...union.map((u) => u.r));
    const relSet = new Set(union.map((u) => `${u.c - minC},${u.r - minR}`));
    for (const s of SHAPE_CELL_SETS) {
      if (s.cells.size !== relSet.size) continue;
      let match = true;
      for (const k of s.cells) {
        if (!relSet.has(k)) {
          match = false;
          break;
        }
      }
      if (match) return { shapeId: s.id, col: minC, row: minR };
    }
    return null;
  }
  const DIR_DELTA = {
    left: { dc: -1, dr: 0 },
    right: { dc: 1, dr: 0 },
    up: { dc: 0, dr: -1 },
    down: { dc: 0, dr: 1 }
  };
  function inBounds(p, dc, dr) {
    const shape = SHAPES[p.shapeId];
    for (const t of shape.tiles) {
      const c = p.col + t.dc + dc;
      const r = p.row + t.dr + dr;
      if (c < 0 || c >= BOARD_COLS$1 || r < 0 || r >= BOARD_ROWS$1) return false;
    }
    return true;
  }
  function trySlideOne(piece, dir, allPieces) {
    const { dc, dr } = DIR_DELTA[dir];
    if (!inBounds(piece, dc, dr)) return { moved: false };
    const others = allPieces.filter((p) => p.id !== piece.id);
    const occ = buildOccupancy(others);
    const targetKeys = SHAPES[piece.shapeId].tiles.map(
      (t) => `${piece.col + t.dc + dc},${piece.row + t.dr + dr}`
    );
    const hitIds = /* @__PURE__ */ new Set();
    for (const key of targetKeys) {
      const id = occ.get(key);
      if (id !== void 0) hitIds.add(id);
    }
    if (hitIds.size > 1) return { moved: false };
    if (hitIds.size === 0) {
      return { moved: true, newCol: piece.col + dc, newRow: piece.row + dr };
    }
    const otherId = [...hitIds][0];
    const other = others.find((p) => p.id === otherId);
    if (other.colorIndex !== piece.colorIndex || other.stackValue !== piece.stackValue) {
      return { moved: false };
    }
    const otherCellSet = new Set(SHAPES[other.shapeId].tiles.map(
      (t) => `${other.col + t.dc},${other.row + t.dr}`
    ));
    const thirdPartyOcc = buildOccupancy(others.filter((p) => p.id !== other.id));
    SHAPES[piece.shapeId].tiles.length;
    SHAPES[other.shapeId].tiles.length;
    let bestMerge = null;
    let mCol = piece.col + dc;
    let mRow = piece.row + dr;
    for (let step = 0; step <= Math.max(BOARD_COLS$1, BOARD_ROWS$1); step++) {
      const candidate = { ...piece, col: mCol, row: mRow };
      const merged = computeMerge(other, candidate);
      if (merged !== null) {
        bestMerge = merged;
        break;
      }
      const nextCol = mCol + dc;
      const nextRow = mRow + dr;
      const nextTiles = SHAPES[piece.shapeId].tiles.map(
        (t) => ({ c: nextCol + t.dc, r: nextRow + t.dr })
      );
      const canPush = nextTiles.every(({ c, r }) => {
        if (c < 0 || c >= BOARD_COLS$1 || r < 0 || r >= BOARD_ROWS$1) return false;
        const k = `${c},${r}`;
        return otherCellSet.has(k) || !thirdPartyOcc.has(k);
      });
      const nextOverlap = nextTiles.filter(({ c, r }) => otherCellSet.has(`${c},${r}`)).length;
      if (!canPush || nextOverlap === 0) break;
      mCol = nextCol;
      mRow = nextRow;
    }
    if (!bestMerge) {
      return { moved: false };
    }
    const newStack = piece.stackValue + 1;
    return {
      moved: true,
      mergedInto: other.id,
      mergedFrom: piece.id,
      newStackValue: newStack,
      newShapeId: bestMerge.shapeId,
      newCol: bestMerge.col,
      newRow: bestMerge.row
    };
  }
  function slideToEnd(piece, dir, allPieces) {
    const { dc, dr } = DIR_DELTA[dir];
    let col = piece.col;
    let row = piece.row;
    let lastMerge = null;
    for (let step = 0; step < Math.max(BOARD_COLS$1, BOARD_ROWS$1); step++) {
      const moved = { ...piece, col, row };
      const result = trySlideOne(moved, dir, allPieces);
      if (!result.moved) break;
      if (result.mergedInto !== void 0) {
        lastMerge = result;
        break;
      }
      col = result.newCol;
      row = result.newRow;
    }
    return { finalCol: col, finalRow: row, merge: lastMerge };
  }
  const ALL_DIRS = ["left", "right", "up", "down"];
  function hasAnyMerge(pieces) {
    for (const piece of pieces) {
      for (const dir of ALL_DIRS) {
        const result = trySlideOne(piece, dir, pieces);
        if (result.moved && result.mergedInto !== void 0) return true;
      }
    }
    return false;
  }
  function findFreePosition(shape, pieces, rng) {
    const occ = buildOccupancy(pieces);
    const shapeDef = SHAPES[shape];
    const candidates = [];
    for (let r = 0; r <= BOARD_ROWS$1 - shapeDef.rows; r++) {
      for (let c = 0; c <= BOARD_COLS$1 - shapeDef.cols; c++) {
        const fits = shapeDef.tiles.every((t) => !occ.has(`${c + t.dc},${r + t.dr}`));
        if (fits) candidates.push({ col: c, row: r });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(rng() * candidates.length)];
  }
  function randomShape(colorsInPlay, rng) {
    const maxSize = Math.min(4, 1 + Math.floor(colorsInPlay / 2));
    const sizes = [];
    for (let s = 1; s <= maxSize; s++) sizes.push(s);
    const weights = sizes.map((s) => Math.pow(0.55, s - 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = rng() * total;
    let chosenSize = 1;
    for (let i = 0; i < sizes.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        chosenSize = sizes[i];
        break;
      }
    }
    const pool = SHAPES_BY_SIZE[chosenSize];
    return pool[Math.floor(rng() * pool.length)];
  }
  const {
    SPAWN_THRESHOLD_PERCENT,
    SPAWN_BATCH_SIZE,
    CLEAR_STACK_VALUE: CLEAR_STACK_VALUE$1,
    COLORS_PER_STAGE_BASE,
    COLORS_PER_STAGE_MAX
  } = MERGE_CONFIG;
  function createInitialState() {
    return {
      phase: "playing",
      stage: 1,
      score: 0,
      pieces: [],
      nextPieceId: 1,
      colorsInPlay: COLORS_PER_STAGE_BASE,
      clearedColors: []
    };
  }
  function colorsForStage(stage) {
    return Math.min(COLORS_PER_STAGE_BASE + stage - 1, COLORS_PER_STAGE_MAX);
  }
  let _rng = Math.random;
  function lowestStackForColor(colorIndex, pieces) {
    let min = null;
    for (const p of pieces) {
      if (p.colorIndex === colorIndex) {
        min = min === null ? p.stackValue : Math.min(min, p.stackValue);
      }
    }
    return min;
  }
  function spawnBatch(state2) {
    const spawned = [];
    const working = [...state2.pieces];
    const availableColors = [];
    for (let c = 0; c < state2.colorsInPlay; c++) {
      if (!state2.clearedColors.includes(c)) availableColors.push(c);
    }
    if (availableColors.length === 0) return spawned;
    for (let i = 0; i < SPAWN_BATCH_SIZE; i++) {
      const shape = randomShape(state2.colorsInPlay, _rng);
      const pos = findFreePosition(shape, working, _rng);
      if (!pos) break;
      const colorIndex = availableColors[Math.floor(_rng() * availableColors.length)];
      const existingMin = lowestStackForColor(colorIndex, working);
      const stackValue = existingMin !== null ? existingMin : 1;
      const piece = { id: state2.nextPieceId + i, shapeId: shape, colorIndex, stackValue, col: pos.col, row: pos.row };
      spawned.push(piece);
      working.push(piece);
    }
    return spawned;
  }
  function applySlide(state2, action) {
    const piece = state2.pieces.find((p) => p.id === action.pieceId);
    if (!piece) return { type: "no-move", pieces: state2.pieces, cleared: [], scoreDelta: 0 };
    const { finalCol, finalRow, merge } = slideToEnd(piece, action.dir, state2.pieces);
    if (finalCol === piece.col && finalRow === piece.row && !merge) {
      return { type: "no-move", pieces: state2.pieces, cleared: [], scoreDelta: 0 };
    }
    let pieces = state2.pieces.map(
      (p) => p.id === piece.id ? { ...p, col: finalCol, row: finalRow } : p
    );
    let scoreDelta = 0;
    let consumedPiece;
    let movedPiece;
    if (merge) {
      consumedPiece = state2.pieces.find((p) => p.id === merge.mergedFrom);
      pieces = pieces.filter((p) => p.id !== merge.mergedFrom).map((p) => p.id === merge.mergedInto ? {
        ...p,
        stackValue: merge.newStackValue,
        shapeId: merge.newShapeId,
        col: merge.newCol,
        row: merge.newRow
      } : p);
      scoreDelta = merge.newStackValue * 10;
      movedPiece = pieces.find((p) => p.id === merge.mergedInto);
      const mergedPiece = pieces.find((p) => p.id === merge.mergedInto);
      if (mergedPiece.stackValue >= CLEAR_STACK_VALUE$1) {
        const colorToClear = mergedPiece.colorIndex;
        const cleared = pieces.filter((p) => p.colorIndex === colorToClear);
        pieces = pieces.filter((p) => p.colorIndex !== colorToClear);
        scoreDelta += cleared.length * 50;
        return { type: "clear", pieces, cleared, scoreDelta, movedPiece, consumedPiece, clearedColorIndex: colorToClear };
      }
      return { type: "merge", pieces, cleared: [], scoreDelta, movedPiece, consumedPiece };
    }
    movedPiece = pieces.find((p) => p.id === piece.id);
    return { type: "slide", pieces, cleared: [], scoreDelta: 1, movedPiece };
  }
  function checkStageClear(state2) {
    return state2.pieces.length === 0;
  }
  function advanceStage(state2) {
    const stage = state2.stage + 1;
    const colorsInPlay = colorsForStage(stage);
    return {
      ...state2,
      stage,
      colorsInPlay,
      clearedColors: [],
      phase: "playing",
      pieces: []
    };
  }
  function isDeadlocked(state2) {
    if (state2.pieces.length === 0) return false;
    return !hasAnyMerge(state2.pieces);
  }
  function spawnRescue(state2) {
    const availableColors = [];
    for (let c = 0; c < state2.colorsInPlay; c++) {
      if (!state2.clearedColors.includes(c)) availableColors.push(c);
    }
    if (availableColors.length === 0) return null;
    const candidates = state2.pieces.filter((p) => availableColors.includes(p.colorIndex)).map((p) => ({ colorIndex: p.colorIndex, stackValue: p.stackValue })).sort(() => _rng() - 0.5);
    for (const { colorIndex, stackValue } of candidates) {
      const pos = findFreePosition("1x1", state2.pieces, _rng);
      if (pos) {
        return { id: state2.nextPieceId, shapeId: "1x1", colorIndex, stackValue, col: pos.col, row: pos.row };
      }
    }
    return null;
  }
  function needsSpawn(state2) {
    if (state2.pieces.length === 0) return true;
    const totalColors = state2.colorsInPlay;
    const remaining = totalColors - state2.clearedColors.length;
    if (remaining <= 0) return false;
    const effectiveThreshold = Math.min(100, SPAWN_THRESHOLD_PERCENT * (totalColors / remaining));
    return freePercent(state2.pieces) >= effectiveThreshold;
  }
  function getColorProgress(pieces) {
    const map = /* @__PURE__ */ new Map();
    for (const p of pieces) {
      const existing = map.get(p.colorIndex);
      if (!existing) {
        map.set(p.colorIndex, { colorIndex: p.colorIndex, maxStack: p.stackValue, count: 1 });
      } else {
        existing.maxStack = Math.max(existing.maxStack, p.stackValue);
        existing.count++;
      }
    }
    return [...map.values()].sort((a, b) => a.colorIndex - b.colorIndex);
  }
  const _tempNormal = new three.Vector3();
  function getUv(faceDirVector, normal, uvAxis, projectionAxis, radius, sideLength) {
    const totArcLength = 2 * Math.PI * radius / 4;
    const centerLength = Math.max(sideLength - 2 * radius, 0);
    const halfArc = Math.PI / 4;
    _tempNormal.copy(normal);
    _tempNormal[projectionAxis] = 0;
    _tempNormal.normalize();
    const arcUvRatio = 0.5 * totArcLength / (totArcLength + centerLength);
    const arcAngleRatio = 1 - _tempNormal.angleTo(faceDirVector) / halfArc;
    if (Math.sign(_tempNormal[uvAxis]) === 1) {
      return arcAngleRatio * arcUvRatio;
    } else {
      const lenUv = centerLength / (totArcLength + centerLength);
      return lenUv + arcUvRatio + arcUvRatio * (1 - arcAngleRatio);
    }
  }
  class RoundedBoxGeometry extends three.BoxGeometry {
    constructor(width = 1, height = 1, depth = 1, segments = 2, radius = 0.1) {
      segments = segments * 2 + 1;
      radius = Math.min(width / 2, height / 2, depth / 2, radius);
      super(1, 1, 1, segments, segments, segments);
      if (segments === 1) return;
      const geometry2 = this.toNonIndexed();
      this.index = null;
      this.attributes.position = geometry2.attributes.position;
      this.attributes.normal = geometry2.attributes.normal;
      this.attributes.uv = geometry2.attributes.uv;
      const position = new three.Vector3();
      const normal = new three.Vector3();
      const box = new three.Vector3(width, height, depth).divideScalar(2).subScalar(radius);
      const positions = this.attributes.position.array;
      const normals = this.attributes.normal.array;
      const uvs = this.attributes.uv.array;
      const faceTris = positions.length / 6;
      const faceDirVector = new three.Vector3();
      const halfSegmentSize = 0.5 / segments;
      for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
        position.fromArray(positions, i);
        normal.copy(position);
        normal.x -= Math.sign(normal.x) * halfSegmentSize;
        normal.y -= Math.sign(normal.y) * halfSegmentSize;
        normal.z -= Math.sign(normal.z) * halfSegmentSize;
        normal.normalize();
        positions[i + 0] = box.x * Math.sign(position.x) + normal.x * radius;
        positions[i + 1] = box.y * Math.sign(position.y) + normal.y * radius;
        positions[i + 2] = box.z * Math.sign(position.z) + normal.z * radius;
        normals[i + 0] = normal.x;
        normals[i + 1] = normal.y;
        normals[i + 2] = normal.z;
        const side = Math.floor(i / faceTris);
        switch (side) {
          case 0:
            faceDirVector.set(1, 0, 0);
            uvs[j + 0] = getUv(faceDirVector, normal, "z", "y", radius, depth);
            uvs[j + 1] = 1 - getUv(faceDirVector, normal, "y", "z", radius, height);
            break;
          case 1:
            faceDirVector.set(-1, 0, 0);
            uvs[j + 0] = 1 - getUv(faceDirVector, normal, "z", "y", radius, depth);
            uvs[j + 1] = 1 - getUv(faceDirVector, normal, "y", "z", radius, height);
            break;
          case 2:
            faceDirVector.set(0, 1, 0);
            uvs[j + 0] = 1 - getUv(faceDirVector, normal, "x", "z", radius, width);
            uvs[j + 1] = getUv(faceDirVector, normal, "z", "x", radius, depth);
            break;
          case 3:
            faceDirVector.set(0, -1, 0);
            uvs[j + 0] = 1 - getUv(faceDirVector, normal, "x", "z", radius, width);
            uvs[j + 1] = 1 - getUv(faceDirVector, normal, "z", "x", radius, depth);
            break;
          case 4:
            faceDirVector.set(0, 0, 1);
            uvs[j + 0] = 1 - getUv(faceDirVector, normal, "x", "y", radius, width);
            uvs[j + 1] = 1 - getUv(faceDirVector, normal, "y", "x", radius, height);
            break;
          case 5:
            faceDirVector.set(0, 0, -1);
            uvs[j + 0] = getUv(faceDirVector, normal, "x", "y", radius, width);
            uvs[j + 1] = 1 - getUv(faceDirVector, normal, "y", "x", radius, height);
            break;
        }
      }
    }
  }
  const { TILE_SIZE: TILE_SIZE$1, TILE_HEIGHT: TILE_HEIGHT$1, BOARD_COLS, BOARD_ROWS, BOARD_PADDING } = MERGE_CONFIG;
  const PAD = 0.05;
  const R = 0.12;
  function boardToWorld(col, row) {
    const boardW = BOARD_COLS * TILE_SIZE$1;
    const boardD = BOARD_ROWS * TILE_SIZE$1;
    return {
      x: col * TILE_SIZE$1 - boardW / 2 + TILE_SIZE$1 / 2,
      z: row * TILE_SIZE$1 - boardD / 2 + TILE_SIZE$1 / 2
    };
  }
  let _gradientMap = null;
  function getGradientMap() {
    if (_gradientMap) return _gradientMap;
    const data = new Uint8Array([40, 110, 190, 245]);
    const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    _gradientMap = tex;
    return tex;
  }
  const _matCache = /* @__PURE__ */ new Map();
  function getToonMat(colorIndex) {
    if (!_matCache.has(colorIndex)) {
      _matCache.set(colorIndex, new THREE.MeshToonMaterial({
        color: PIECE_COLORS[colorIndex],
        gradientMap: getGradientMap()
      }));
    }
    return _matCache.get(colorIndex);
  }
  function cornerArc(cx, cy, idx, idy, odx, ody) {
    const tx0 = cx - idx * R, ty0 = cy - idy * R;
    const tx1 = cx + odx * R, ty1 = cy + ody * R;
    const arcCx = cx + (idy + ody) * R;
    const arcCy = cy - (idx + odx) * R;
    const startA = Math.atan2(ty0 - arcCy, tx0 - arcCx);
    const endA = Math.atan2(ty1 - arcCy, tx1 - arcCx);
    let sweep = endA - startA;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const N = 6;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = startA + sweep * i / N;
      pts.push([arcCx + Math.cos(a) * R, arcCy + Math.sin(a) * R]);
    }
    return pts;
  }
  function buildLGeo(shapeId) {
    const S = TILE_SIZE$1, P = PAD;
    const xL = -S / 2 + P;
    const xR = 3 * S / 2 - P;
    const yT = S / 2 - P;
    const yB = -3 * S / 2 + P;
    const xN = S / 2;
    const yN = -S / 2;
    const R_ = [1, 0], L_ = [-1, 0];
    const U_ = [0, 1], D_ = [0, -1];
    const c = (x, y, i, o) => ({ t: "c", x, y, idx: i[0], idy: i[1], odx: o[0], ody: o[1] });
    const l = (x, y) => ({ t: "l", x, y });
    let segs;
    switch (shapeId) {
      // Lne: cells (0,0)(1,0)(0,1) — missing bottom-right
      // CCW trace: TL→TR→inner-TR→notch(sharp)→inner-BR→BL→back to TL
      case "Lne":
        segs = [
          c(xL, yT, U_, R_),
          // TL: arrive up (from left edge), leave right
          c(xR, yT, R_, D_),
          // TR: arrive right, leave down
          c(xR, yN, D_, L_),
          // inner-TR: arrive down, leave left
          l(xN, yN),
          // sharp concave notch
          l(xN, yB),
          // straight down right side of left col
          c(xN, yB, D_, L_),
          // inner-BR: arrive down, leave left
          c(xL, yB, L_, U_)
          // BL: arrive left, leave up
        ];
        break;
      // Lnw: cells (0,0)(1,0)(1,1) — missing bottom-left
      // CCW trace: TL→TR→BR→inner-BR→notch(sharp)→inner-BL→back to TL
      case "Lnw":
        segs = [
          c(xL, yT, U_, R_),
          // TL: arrive up, leave right
          c(xR, yT, R_, D_),
          // TR: arrive right, leave down
          c(xR, yB, D_, L_),
          // BR: arrive down, leave left
          c(xN, yB, L_, U_),
          // inner-BR: arrive left, leave up
          l(xN, yN),
          // sharp concave notch
          l(xL, yN),
          // straight left along inner bottom of left col
          c(xL, yN, L_, U_)
          // inner-BL: arrive left, leave up
        ];
        break;
      // Lse: cells (0,0)(0,1)(1,1) — missing top-right
      // CCW trace: TL→inner-TR→notch(sharp)→outer-TR→BR→BL→back to TL
      case "Lse":
        segs = [
          c(xL, yT, U_, R_),
          // TL: arrive up, leave right
          c(xN, yT, R_, D_),
          // inner-TR: arrive right, leave down
          l(xN, yN),
          // sharp concave notch
          l(xR, yN),
          // straight right along inner top of right col
          c(xR, yN, R_, D_),
          // outer-TR: arrive right, leave down
          c(xR, yB, D_, L_),
          // BR: arrive down, leave left
          c(xL, yB, L_, U_)
          // BL: arrive left, leave up
        ];
        break;
      // Lsw: cells (1,0)(0,1)(1,1) — missing top-left
      // CCW trace: inner-TL→TR→BR→BL→outer-TL→notch(sharp)→back to inner-TL
      case "Lsw":
        segs = [
          c(xN, yT, U_, R_),
          // inner-TL: arrive up (from right col left edge), leave right
          c(xR, yT, R_, D_),
          // TR: arrive right, leave down
          c(xR, yB, D_, L_),
          // BR: arrive down, leave left
          c(xL, yB, L_, U_),
          // BL: arrive left, leave up
          c(xL, yN, U_, R_),
          // outer-TL: arrive up, leave right
          l(xN, yN),
          // sharp concave notch
          l(xN, yT)
          // straight up right side of right col
        ];
        break;
    }
    const pts = [];
    for (const seg of segs) {
      if (seg.t === "l") {
        pts.push([seg.x, seg.y]);
      } else {
        pts.push(...cornerArc(seg.x, seg.y, seg.idx, seg.idy, seg.odx, seg.ody));
      }
    }
    const vecs = pts.map(([x, y]) => new THREE.Vector2(x, y));
    const sh = new THREE.Shape(vecs);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: TILE_HEIGHT$1, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  const _geoCache = /* @__PURE__ */ new Map();
  function getPieceGeo(shapeId) {
    if (_geoCache.has(shapeId)) return _geoCache.get(shapeId);
    const S = TILE_SIZE$1;
    const w = S - 2 * PAD;
    const segs = 3;
    let geo;
    switch (shapeId) {
      case "1x1":
        geo = new RoundedBoxGeometry(w, TILE_HEIGHT$1, w, segs, R);
        geo.translate(0, TILE_HEIGHT$1 / 2, 0);
        break;
      case "1x2h": {
        const pw = 2 * S - 2 * PAD;
        geo = new RoundedBoxGeometry(pw, TILE_HEIGHT$1, w, segs, R);
        geo.translate(S / 2, TILE_HEIGHT$1 / 2, 0);
        break;
      }
      case "1x2v": {
        const pd = 2 * S - 2 * PAD;
        geo = new RoundedBoxGeometry(w, TILE_HEIGHT$1, pd, segs, R);
        geo.translate(0, TILE_HEIGHT$1 / 2, S / 2);
        break;
      }
      case "2x2": {
        const p2 = 2 * S - 2 * PAD;
        geo = new RoundedBoxGeometry(p2, TILE_HEIGHT$1, p2, segs, R);
        geo.translate(S / 2, TILE_HEIGHT$1 / 2, S / 2);
        break;
      }
      // L-shapes: each variant is an explicit 6-vertex extruded shape.
      // Tile definitions from game-types.ts:
      //   Lne: (0,0)(1,0)(0,1) — missing bottom-right
      //   Lnw: (0,0)(1,0)(1,1) — missing bottom-left
      //   Lse: (0,0)(0,1)(1,1) — missing top-right
      //   Lsw: (1,0)(0,1)(1,1) — missing top-left
      case "Lne":
        geo = buildLGeo("Lne");
        break;
      case "Lnw":
        geo = buildLGeo("Lnw");
        break;
      case "Lse":
        geo = buildLGeo("Lse");
        break;
      case "Lsw":
        geo = buildLGeo("Lsw");
        break;
    }
    _geoCache.set(shapeId, geo);
    return geo;
  }
  const _labelCache = /* @__PURE__ */ new Map();
  function getLabelTexture(stackValue, colorIndex) {
    const key = `${stackValue}_${colorIndex}`;
    if (_labelCache.has(key)) return _labelCache.get(key);
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const tint = PIECE_TINTS[colorIndex];
    const tr = tint >> 16 & 255;
    const tg = tint >> 8 & 255;
    const tb = tint & 255;
    ctx.fillStyle = `rgba(${tr},${tg},${tb},0.88)`;
    const pad = 14;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, 24);
    ctx.fill();
    ctx.fillStyle = "#1a1a2e";
    ctx.font = `bold ${stackValue >= 10 ? 50 : 62}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(stackValue), size / 2, size / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    _labelCache.set(key, tex);
    return tex;
  }
  function buildPieceMesh(piece, group) {
    const mat = getToonMat(piece.colorIndex).clone();
    const body = new THREE.Mesh(getPieceGeo(piece.shapeId), mat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const firstTile = SHAPES[piece.shapeId].tiles[0];
    const labelTex = getLabelTexture(piece.stackValue, piece.colorIndex);
    const labelSize = TILE_SIZE$1 * 0.68;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(labelSize, labelSize),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(
      firstTile.dc * TILE_SIZE$1,
      TILE_HEIGHT$1 + 4e-3,
      firstTile.dr * TILE_SIZE$1
    );
    group.add(label);
  }
  function createPieceMesh(piece) {
    const group = new THREE.Group();
    buildPieceMesh(piece, group);
    const { x, z } = boardToWorld(piece.col, piece.row);
    group.position.set(x, 0, z);
    return { pieceId: piece.id, group, targetX: x, targetZ: z, currentX: x, currentZ: z, bounceT: 0, opacity: 1, fading: false };
  }
  function refreshPieceLabel(pm, piece) {
    while (pm.group.children.length) pm.group.remove(pm.group.children[0]);
    buildPieceMesh(piece, pm.group);
  }
  function updatePieceMeshes(meshes, dt) {
    const speed = MERGE_CONFIG.SLIDE_SPEED * TILE_SIZE$1;
    for (const pm of meshes) {
      const dx = pm.targetX - pm.currentX;
      const dz = pm.targetZ - pm.currentZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 1e-3) {
        const step = Math.min(dist, speed * dt);
        pm.currentX += dx / dist * step;
        pm.currentZ += dz / dist * step;
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
        pm.group.traverse((obj) => {
          const mesh = obj;
          if (!mesh.isMesh) return;
          mesh.material.transparent = true;
          mesh.material.opacity = pm.opacity;
        });
      }
    }
  }
  function createBoardFloor() {
    const group = new THREE.Group();
    const boardW = BOARD_COLS * TILE_SIZE$1 + BOARD_PADDING * 2;
    const boardD = BOARD_ROWS * TILE_SIZE$1 + BOARD_PADDING * 2;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(boardW, 0.1, boardD),
      new THREE.MeshToonMaterial({ color: 1977661, gradientMap: getGradientMap() })
    );
    base.position.y = -TILE_HEIGHT$1 / 2 - 0.05;
    base.receiveShadow = true;
    group.add(base);
    const cellMat = new THREE.MeshBasicMaterial({ color: 2438471 });
    const cellSize = TILE_SIZE$1 - 2 * PAD - 0.04;
    const cellGeo = new THREE.PlaneGeometry(cellSize, cellSize);
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const { x, z } = boardToWorld(c, r);
        const cell = new THREE.Mesh(cellGeo, cellMat);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(x, -TILE_HEIGHT$1 / 2 + 1e-3, z);
        group.add(cell);
      }
    }
    return group;
  }
  const CLEAR_STACK_VALUE = MERGE_CONFIG.CLEAR_STACK_VALUE;
  function createHud(container2) {
    const root = document.createElement("div");
    root.style.cssText = [
      "position:absolute;inset:0;pointer-events:none;",
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;",
      "display:flex;flex-direction:column;justify-content:space-between;",
      "padding:max(10px,env(safe-area-inset-top),var(--sat,0px)) ",
      "max(10px,env(safe-area-inset-right),var(--sar,0px)) ",
      "max(10px,env(safe-area-inset-bottom),var(--sab,0px)) ",
      "max(10px,env(safe-area-inset-left),var(--sal,0px));"
    ].join("");
    const topBar = document.createElement("div");
    topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center;background:rgba(20,30,48,0.82);border-radius:14px;padding:8px 16px;backdrop-filter:blur(6px);";
    const stageEl = document.createElement("span");
    stageEl.style.cssText = "color:#7ec8e3;font-size:clamp(14px,3.5vmin,20px);font-weight:700;";
    stageEl.textContent = "Stage 1";
    const titleEl = document.createElement("span");
    titleEl.style.cssText = "color:#ffffff;font-size:clamp(16px,4vmin,22px);font-weight:800;letter-spacing:0.03em;";
    titleEl.textContent = "MERGE MAYHEM";
    const scoreEl = document.createElement("span");
    scoreEl.style.cssText = "color:#f9ca24;font-size:clamp(14px,3.5vmin,20px);font-weight:700;";
    scoreEl.textContent = "0";
    topBar.appendChild(stageEl);
    topBar.appendChild(titleEl);
    topBar.appendChild(scoreEl);
    const progressBars = document.createElement("div");
    progressBars.style.cssText = "display:flex;flex-direction:column;gap:6px;background:rgba(20,30,48,0.82);border-radius:14px;padding:10px 14px;backdrop-filter:blur(6px);";
    const progressLabel = document.createElement("div");
    progressLabel.style.cssText = "color:#aab8c8;font-size:clamp(10px,2.5vmin,13px);font-weight:600;margin-bottom:2px;";
    progressLabel.textContent = "COLOR PROGRESS";
    progressBars.appendChild(progressLabel);
    const messageEl = document.createElement("div");
    messageEl.style.cssText = [
      "position:absolute;inset:0;display:none;flex-direction:column;",
      "align-items:center;justify-content:center;pointer-events:none;",
      "background:rgba(10,15,30,0.75);backdrop-filter:blur(4px);"
    ].join("");
    const msgTitle = document.createElement("div");
    msgTitle.style.cssText = "color:#fff;font-size:clamp(28px,7vmin,48px);font-weight:900;text-align:center;";
    const msgSub = document.createElement("div");
    msgSub.style.cssText = "color:#aab8c8;font-size:clamp(14px,3.5vmin,22px);margin-top:12px;text-align:center;";
    messageEl.appendChild(msgTitle);
    messageEl.appendChild(msgSub);
    root.appendChild(topBar);
    root.appendChild(progressBars);
    container2.appendChild(root);
    container2.appendChild(messageEl);
    function update(stage, score, progress) {
      stageEl.textContent = `Stage ${stage}`;
      scoreEl.textContent = String(score);
      while (progressBars.children.length > 1) progressBars.removeChild(progressBars.lastChild);
      for (const cp of progress) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;";
        const dot = document.createElement("div");
        const hex = PIECE_COLORS[cp.colorIndex];
        const r = hex >> 16 & 255;
        const g = hex >> 8 & 255;
        const b = hex & 255;
        dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:rgb(${r},${g},${b});flex-shrink:0;`;
        const track = document.createElement("div");
        track.style.cssText = "flex:1;height:8px;background:rgba(255,255,255,0.12);border-radius:4px;overflow:hidden;";
        const fill = document.createElement("div");
        const pct = Math.min(100, cp.maxStack / CLEAR_STACK_VALUE * 100);
        fill.style.cssText = `height:100%;border-radius:4px;background:rgb(${r},${g},${b});width:${pct.toFixed(1)}%;transition:width 0.3s ease;`;
        const valEl = document.createElement("div");
        valEl.style.cssText = "color:#ccd6f6;font-size:clamp(10px,2.5vmin,13px);font-weight:600;min-width:28px;text-align:right;";
        valEl.textContent = `${cp.maxStack}/${CLEAR_STACK_VALUE}`;
        track.appendChild(fill);
        row.appendChild(dot);
        row.appendChild(track);
        row.appendChild(valEl);
        progressBars.appendChild(row);
      }
    }
    function showMessage(text, sub = "") {
      msgTitle.textContent = text;
      msgSub.textContent = sub;
      messageEl.style.display = "flex";
    }
    function hideMessage() {
      messageEl.style.display = "none";
    }
    return { root, stageEl, scoreEl, progressBars, messageEl, update, showMessage, hideMessage };
  }
  const SWIPE_THRESHOLD_PX = 18;
  class DragInput {
    constructor(element, hitTest, onSwipe) {
      this.state = {
        active: false,
        pointerId: -1,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        selectedPieceId: null
      };
      this.onDown = (e) => {
        if (this.state.active) return;
        const bounds = this.element.getBoundingClientRect();
        const sx = e.clientX - bounds.left;
        const sy = e.clientY - bounds.top;
        const piece = this.hitTest(sx, sy);
        if (!piece) return;
        this.element.setPointerCapture(e.pointerId);
        this.state = {
          active: true,
          pointerId: e.pointerId,
          startX: sx,
          startY: sy,
          currentX: sx,
          currentY: sy,
          selectedPieceId: piece.id
        };
      };
      this.onMove = (e) => {
        if (!this.state.active || e.pointerId !== this.state.pointerId) return;
        const bounds = this.element.getBoundingClientRect();
        this.state.currentX = e.clientX - bounds.left;
        this.state.currentY = e.clientY - bounds.top;
      };
      this.onUp = (e) => {
        if (!this.state.active || e.pointerId !== this.state.pointerId) return;
        const dx = this.state.currentX - this.state.startX;
        const dy = this.state.currentY - this.state.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= SWIPE_THRESHOLD_PX && this.state.selectedPieceId !== null) {
          const dir = resolveDir(dx, dy);
          this.onSwipe({ pieceId: this.state.selectedPieceId, dir });
        }
        this.state = {
          active: false,
          pointerId: -1,
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0,
          selectedPieceId: null
        };
      };
      this.element = element;
      this.hitTest = hitTest;
      this.onSwipe = onSwipe;
      element.style.touchAction = "none";
      element.addEventListener("pointerdown", this.onDown);
      element.addEventListener("pointermove", this.onMove);
      element.addEventListener("pointerup", this.onUp);
      element.addEventListener("pointercancel", this.onUp);
    }
    /** Piece id that is currently "selected" (highlighted) */
    get selectedPieceId() {
      return this.state.selectedPieceId;
    }
    dispose() {
      this.element.removeEventListener("pointerdown", this.onDown);
      this.element.removeEventListener("pointermove", this.onMove);
      this.element.removeEventListener("pointerup", this.onUp);
      this.element.removeEventListener("pointercancel", this.onUp);
    }
  }
  function resolveDir(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? "right" : "left";
    }
    return dy > 0 ? "down" : "up";
  }
  class OutlineEffect {
    constructor(renderer2, parameters = {}) {
      this.enabled = true;
      const defaultThickness = parameters.defaultThickness !== void 0 ? parameters.defaultThickness : 3e-3;
      const defaultColor = new three.Color().fromArray(parameters.defaultColor !== void 0 ? parameters.defaultColor : [0, 0, 0]);
      const defaultAlpha = parameters.defaultAlpha !== void 0 ? parameters.defaultAlpha : 1;
      const defaultKeepAlive = parameters.defaultKeepAlive !== void 0 ? parameters.defaultKeepAlive : false;
      const cache = {};
      const removeThresholdCount = 60;
      const originalMaterials = {};
      const originalOnBeforeRenders = {};
      const uniformsOutline = {
        outlineThickness: { value: defaultThickness },
        outlineColor: { value: defaultColor },
        outlineAlpha: { value: defaultAlpha }
      };
      const vertexShader = [
        "#include <common>",
        "#include <uv_pars_vertex>",
        "#include <displacementmap_pars_vertex>",
        "#include <fog_pars_vertex>",
        "#include <morphtarget_pars_vertex>",
        "#include <skinning_pars_vertex>",
        "#include <logdepthbuf_pars_vertex>",
        "#include <clipping_planes_pars_vertex>",
        "uniform float outlineThickness;",
        "vec4 calculateOutline( vec4 pos, vec3 normal, vec4 skinned ) {",
        "	float thickness = outlineThickness;",
        "	const float ratio = 1.0;",
        // TODO: support outline thickness ratio for each vertex
        "	vec4 pos2 = projectionMatrix * modelViewMatrix * vec4( skinned.xyz + normal, 1.0 );",
        // NOTE: subtract pos2 from pos because BackSide objectNormal is negative
        "	vec4 norm = normalize( pos - pos2 );",
        "	return pos + norm * thickness * pos.w * ratio;",
        "}",
        "void main() {",
        "	#include <uv_vertex>",
        "	#include <beginnormal_vertex>",
        "	#include <morphnormal_vertex>",
        "	#include <skinbase_vertex>",
        "	#include <skinnormal_vertex>",
        "	#include <begin_vertex>",
        "	#include <morphtarget_vertex>",
        "	#include <skinning_vertex>",
        "	#include <displacementmap_vertex>",
        "	#include <project_vertex>",
        "	vec3 outlineNormal = - objectNormal;",
        // the outline material is always rendered with BackSide
        "	gl_Position = calculateOutline( gl_Position, outlineNormal, vec4( transformed, 1.0 ) );",
        "	#include <logdepthbuf_vertex>",
        "	#include <clipping_planes_vertex>",
        "	#include <fog_vertex>",
        "}"
      ].join("\n");
      const fragmentShader = [
        "#include <common>",
        "#include <fog_pars_fragment>",
        "#include <logdepthbuf_pars_fragment>",
        "#include <clipping_planes_pars_fragment>",
        "uniform vec3 outlineColor;",
        "uniform float outlineAlpha;",
        "void main() {",
        "	#include <clipping_planes_fragment>",
        "	#include <logdepthbuf_fragment>",
        "	gl_FragColor = vec4( outlineColor, outlineAlpha );",
        "	#include <tonemapping_fragment>",
        "	#include <colorspace_fragment>",
        "	#include <fog_fragment>",
        "	#include <premultiplied_alpha_fragment>",
        "}"
      ].join("\n");
      function createMaterial() {
        return new three.ShaderMaterial({
          type: "OutlineEffect",
          uniforms: three.UniformsUtils.merge([
            three.UniformsLib["fog"],
            three.UniformsLib["displacementmap"],
            uniformsOutline
          ]),
          vertexShader,
          fragmentShader,
          side: three.BackSide
        });
      }
      function getOutlineMaterialFromCache(originalMaterial) {
        let data = cache[originalMaterial.uuid];
        if (data === void 0) {
          data = {
            material: createMaterial(),
            used: true,
            keepAlive: defaultKeepAlive,
            count: 0
          };
          cache[originalMaterial.uuid] = data;
        }
        data.used = true;
        return data.material;
      }
      function getOutlineMaterial(originalMaterial) {
        const outlineMaterial = getOutlineMaterialFromCache(originalMaterial);
        originalMaterials[outlineMaterial.uuid] = originalMaterial;
        updateOutlineMaterial(outlineMaterial, originalMaterial);
        return outlineMaterial;
      }
      function isCompatible(object) {
        const geometry = object.geometry;
        const hasNormals = geometry !== void 0 && geometry.attributes.normal !== void 0;
        return object.isMesh === true && object.material !== void 0 && hasNormals === true;
      }
      function setOutlineMaterial(object) {
        if (isCompatible(object) === false) return;
        if (Array.isArray(object.material)) {
          for (let i = 0, il = object.material.length; i < il; i++) {
            object.material[i] = getOutlineMaterial(object.material[i]);
          }
        } else {
          object.material = getOutlineMaterial(object.material);
        }
        originalOnBeforeRenders[object.uuid] = object.onBeforeRender;
        object.onBeforeRender = onBeforeRender;
      }
      function restoreOriginalMaterial(object) {
        if (isCompatible(object) === false) return;
        if (Array.isArray(object.material)) {
          for (let i = 0, il = object.material.length; i < il; i++) {
            object.material[i] = originalMaterials[object.material[i].uuid];
          }
        } else {
          object.material = originalMaterials[object.material.uuid];
        }
        object.onBeforeRender = originalOnBeforeRenders[object.uuid];
      }
      function onBeforeRender(renderer3, scene2, camera2, geometry, material) {
        const originalMaterial = originalMaterials[material.uuid];
        if (originalMaterial === void 0) return;
        updateUniforms(material, originalMaterial);
      }
      function updateUniforms(material, originalMaterial) {
        const outlineParameters = originalMaterial.userData.outlineParameters;
        material.uniforms.outlineAlpha.value = originalMaterial.opacity;
        if (outlineParameters !== void 0) {
          if (outlineParameters.thickness !== void 0) material.uniforms.outlineThickness.value = outlineParameters.thickness;
          if (outlineParameters.color !== void 0) material.uniforms.outlineColor.value.fromArray(outlineParameters.color);
          if (outlineParameters.alpha !== void 0) material.uniforms.outlineAlpha.value = outlineParameters.alpha;
        }
        if (originalMaterial.displacementMap) {
          material.uniforms.displacementMap.value = originalMaterial.displacementMap;
          material.uniforms.displacementScale.value = originalMaterial.displacementScale;
          material.uniforms.displacementBias.value = originalMaterial.displacementBias;
        }
      }
      function updateOutlineMaterial(material, originalMaterial) {
        if (material.name === "invisible") return;
        const outlineParameters = originalMaterial.userData.outlineParameters;
        material.fog = originalMaterial.fog;
        material.toneMapped = originalMaterial.toneMapped;
        material.premultipliedAlpha = originalMaterial.premultipliedAlpha;
        material.displacementMap = originalMaterial.displacementMap;
        if (outlineParameters !== void 0) {
          if (originalMaterial.visible === false) {
            material.visible = false;
          } else {
            material.visible = outlineParameters.visible !== void 0 ? outlineParameters.visible : true;
          }
          material.transparent = outlineParameters.alpha !== void 0 && outlineParameters.alpha < 1 ? true : originalMaterial.transparent;
          if (outlineParameters.keepAlive !== void 0) cache[originalMaterial.uuid].keepAlive = outlineParameters.keepAlive;
        } else {
          material.transparent = originalMaterial.transparent;
          material.visible = originalMaterial.visible;
        }
        if (originalMaterial.wireframe === true || originalMaterial.depthTest === false) material.visible = false;
        if (originalMaterial.clippingPlanes) {
          material.clipping = true;
          material.clippingPlanes = originalMaterial.clippingPlanes;
          material.clipIntersection = originalMaterial.clipIntersection;
          material.clipShadows = originalMaterial.clipShadows;
        }
        material.version = originalMaterial.version;
      }
      function cleanupCache() {
        let keys;
        keys = Object.keys(originalMaterials);
        for (let i = 0, il = keys.length; i < il; i++) {
          originalMaterials[keys[i]] = void 0;
        }
        keys = Object.keys(originalOnBeforeRenders);
        for (let i = 0, il = keys.length; i < il; i++) {
          originalOnBeforeRenders[keys[i]] = void 0;
        }
        keys = Object.keys(cache);
        for (let i = 0, il = keys.length; i < il; i++) {
          const key = keys[i];
          if (cache[key].used === false) {
            cache[key].count++;
            if (cache[key].keepAlive === false && cache[key].count > removeThresholdCount) {
              delete cache[key];
            }
          } else {
            cache[key].used = false;
            cache[key].count = 0;
          }
        }
      }
      this.render = function(scene2, camera2) {
        if (this.enabled === false) {
          renderer2.render(scene2, camera2);
          return;
        }
        const currentAutoClear = renderer2.autoClear;
        renderer2.autoClear = this.autoClear;
        renderer2.render(scene2, camera2);
        renderer2.autoClear = currentAutoClear;
        this.renderOutline(scene2, camera2);
      };
      this.renderOutline = function(scene2, camera2) {
        const currentAutoClear = renderer2.autoClear;
        const currentSceneAutoUpdate = scene2.matrixWorldAutoUpdate;
        const currentSceneBackground = scene2.background;
        const currentShadowMapEnabled = renderer2.shadowMap.enabled;
        scene2.matrixWorldAutoUpdate = false;
        scene2.background = null;
        renderer2.autoClear = false;
        renderer2.shadowMap.enabled = false;
        scene2.traverse(setOutlineMaterial);
        renderer2.render(scene2, camera2);
        scene2.traverse(restoreOriginalMaterial);
        cleanupCache();
        scene2.matrixWorldAutoUpdate = currentSceneAutoUpdate;
        scene2.background = currentSceneBackground;
        renderer2.autoClear = currentAutoClear;
        renderer2.shadowMap.enabled = currentShadowMapEnabled;
      };
      this.autoClear = renderer2.autoClear;
      this.domElement = renderer2.domElement;
      this.shadowMap = renderer2.shadowMap;
      this.clear = function(color, depth, stencil) {
        renderer2.clear(color, depth, stencil);
      };
      this.getPixelRatio = function() {
        return renderer2.getPixelRatio();
      };
      this.setPixelRatio = function(value) {
        renderer2.setPixelRatio(value);
      };
      this.getSize = function(target) {
        return renderer2.getSize(target);
      };
      this.setSize = function(width, height, updateStyle) {
        renderer2.setSize(width, height, updateStyle);
      };
      this.setViewport = function(x, y, width, height) {
        renderer2.setViewport(x, y, width, height);
      };
      this.setScissor = function(x, y, width, height) {
        renderer2.setScissor(x, y, width, height);
      };
      this.setScissorTest = function(boolean) {
        renderer2.setScissorTest(boolean);
      };
      this.setRenderTarget = function(renderTarget) {
        renderer2.setRenderTarget(renderTarget);
      };
    }
  }
  const { TILE_SIZE, TILE_HEIGHT } = MERGE_CONFIG;
  const ARROW_Y = TILE_HEIGHT + 0.06;
  const ARROW_W = 0.3;
  const ARROW_H = 0.36;
  const ARROW_THICK = 0.06;
  const ARROW_GAP = 0.18;
  const PULSE_SPEED = 3.2;
  const PULSE_MIN = 0.35;
  const PULSE_MAX = 1;
  function makeChevronGeo() {
    const w = ARROW_W, h = ARROW_H / 2, notch = w * 0.45;
    const shape = new THREE.Shape();
    shape.moveTo(w, 0);
    shape.lineTo(0, h);
    shape.lineTo(notch, 0);
    shape.lineTo(0, -h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: ARROW_THICK,
      bevelEnabled: false
    });
    geo.translate(0, 0, -ARROW_THICK / 2);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  const DIRS = ["left", "right", "up", "down"];
  const DIR_ROT_Y = {
    right: 0,
    left: Math.PI,
    up: Math.PI / 2,
    down: -Math.PI / 2
  };
  const DIR_OFFSET = {
    left: { dx: -1, dz: 0 },
    right: { dx: 1, dz: 0 },
    up: { dx: 0, dz: -1 },
    down: { dx: 0, dz: 1 }
  };
  function createArrowSet(scene2) {
    const group = new THREE.Group();
    group.visible = false;
    scene2.add(group);
    const chevronGeo = makeChevronGeo();
    const meshes = {};
    for (const dir of DIRS) {
      const mat = new THREE.MeshBasicMaterial({
        color: 16777215,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(chevronGeo, mat);
      mesh.rotation.y = DIR_ROT_Y[dir];
      mesh.visible = false;
      group.add(mesh);
      meshes[dir] = mesh;
    }
    let _phaseOffset = 0;
    function update(t) {
      if (!group.visible) return;
      for (const dir of DIRS) {
        const mesh = meshes[dir];
        if (!mesh.visible) continue;
        const phase = t * PULSE_SPEED + _phaseOffset;
        const opacity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 + 0.5 * Math.sin(phase));
        mesh.material.opacity = opacity;
      }
    }
    function show(piece, allPieces) {
      const tiles = SHAPES[piece.shapeId].tiles;
      const minDc = Math.min(...tiles.map((t) => t.dc));
      const maxDc = Math.max(...tiles.map((t) => t.dc));
      const minDr = Math.min(...tiles.map((t) => t.dr));
      const maxDr = Math.max(...tiles.map((t) => t.dr));
      const anchorWorld = boardToWorld(piece.col, piece.row);
      const centreX = anchorWorld.x + (minDc + maxDc) / 2 * TILE_SIZE;
      const centreZ = anchorWorld.z + (minDr + maxDr) / 2 * TILE_SIZE;
      const halfW = (maxDc - minDc + 1) / 2 * TILE_SIZE;
      const halfD = (maxDr - minDr + 1) / 2 * TILE_SIZE;
      for (const dir of DIRS) {
        const canMove = trySlideOne(piece, dir, allPieces).moved;
        const mesh = meshes[dir];
        mesh.visible = canMove;
        if (canMove) {
          const { dx, dz } = DIR_OFFSET[dir];
          const edgeDist = (Math.abs(dx) > 0 ? halfW : halfD) + ARROW_GAP + ARROW_W;
          mesh.position.set(
            centreX + dx * edgeDist,
            ARROW_Y,
            centreZ + dz * edgeDist
          );
        }
      }
      _phaseOffset = Math.random() * Math.PI * 2;
      group.visible = true;
    }
    function hide() {
      group.visible = false;
      for (const dir of DIRS) meshes[dir].visible = false;
    }
    return { group, update, show, hide };
  }
  hardenViewport();
  hardenGestures();
  const container = document.getElementById("game");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
  configureRenderer(renderer);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(1120295);
  scene.fog = new THREE.Fog(1120295, 22, 45);
  const camera = new THREE.PerspectiveCamera(60, GAME_WIDTH / GAME_HEIGHT, 0.1, 80);
  const CAM_H = MERGE_CONFIG.CAM_HEIGHT;
  const CAM_TILT_RAD = MERGE_CONFIG.CAM_TILT * Math.PI / 180;
  camera.position.set(0, CAM_H, CAM_H * Math.tan(CAM_TILT_RAD));
  camera.lookAt(0, 0, 0);
  const outlineEffect = new OutlineEffect(renderer, {
    defaultThickness: 6e-3,
    // thicker = more readable on small tiles
    defaultColor: [0.05, 0.05, 0.08],
    defaultAlpha: 1,
    defaultKeepAlive: true
  });
  observeContainerResize(container, renderer, camera);
  createLightingRig(scene, 8);
  const boardFloor = createBoardFloor();
  scene.add(boardFloor);
  const arrowSet = createArrowSet(scene);
  const _raycaster = new THREE.Raycaster();
  const _boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hitPt = new THREE.Vector3();
  const _ndcVec = new THREE.Vector2();
  function screenToBoardPos(sx, sy) {
    const rect = renderer.domElement.getBoundingClientRect();
    _ndcVec.set(sx / rect.width * 2 - 1, -(sy / rect.height) * 2 + 1);
    _raycaster.setFromCamera(_ndcVec, camera);
    const hit = _raycaster.ray.intersectPlane(_boardPlane, _hitPt);
    if (!hit) return null;
    const col = Math.round((_hitPt.x + MERGE_CONFIG.BOARD_COLS * MERGE_CONFIG.TILE_SIZE / 2 - MERGE_CONFIG.TILE_SIZE / 2) / MERGE_CONFIG.TILE_SIZE);
    const row = Math.round((_hitPt.z + MERGE_CONFIG.BOARD_ROWS * MERGE_CONFIG.TILE_SIZE / 2 - MERGE_CONFIG.TILE_SIZE / 2) / MERGE_CONFIG.TILE_SIZE);
    return { col, row };
  }
  let state = createInitialState();
  const pieceMeshMap = /* @__PURE__ */ new Map();
  function addPieceToScene(piece) {
    const pm = createPieceMesh(piece);
    pieceMeshMap.set(piece.id, pm);
    scene.add(pm.group);
  }
  function removePieceFromScene(pieceId) {
    const pm = pieceMeshMap.get(pieceId);
    if (pm) {
      scene.remove(pm.group);
      pieceMeshMap.delete(pieceId);
    }
  }
  function syncMeshPositions() {
    for (const piece of state.pieces) {
      const pm = pieceMeshMap.get(piece.id);
      if (!pm) continue;
      const { x, z } = boardToWorld(piece.col, piece.row);
      pm.targetX = x;
      pm.targetZ = z;
    }
  }
  function doSpawn() {
    let iterations = 0;
    while (needsSpawn(state) && iterations < 10) {
      const spawned = spawnBatch(state);
      if (spawned.length === 0) break;
      state = {
        ...state,
        pieces: [...state.pieces, ...spawned],
        nextPieceId: state.nextPieceId + spawned.length
      };
      for (const p of spawned) addPieceToScene(p);
      iterations++;
    }
  }
  doSpawn();
  const hud = createHud(container);
  function refreshHud() {
    hud.update(state.stage, state.score, getColorProgress(state.pieces));
  }
  refreshHud();
  let _selectedId = null;
  function setSelected(id) {
    if (_selectedId !== null) {
      const prev = pieceMeshMap.get(_selectedId);
      if (prev) {
        prev.group.scale.setScalar(1);
        prev.group.position.y = 0;
      }
    }
    _selectedId = id;
    if (id !== null) {
      const pm = pieceMeshMap.get(id);
      if (pm) {
        pm.group.scale.setScalar(1.06);
        pm.group.position.y = 0.12;
      }
      const piece = state.pieces.find((p) => p.id === id);
      if (piece) arrowSet.show(piece, state.pieces);
    } else {
      arrowSet.hide();
    }
  }
  function hitTestPiece(sx, sy) {
    const bp = screenToBoardPos(sx, sy);
    if (!bp) return null;
    const { col, row } = bp;
    if (col < 0 || col >= MERGE_CONFIG.BOARD_COLS || row < 0 || row >= MERGE_CONFIG.BOARD_ROWS) return null;
    for (const piece of state.pieces) {
      const { tiles } = SHAPES[piece.shapeId];
      for (const t of tiles) {
        if (piece.col + t.dc === col && piece.row + t.dr === row) return piece;
      }
    }
    return null;
  }
  let _animating = false;
  const CLEAR_DELAY_MS = (MERGE_CONFIG.CLEAR_FADE_DUR + 0.1) * 1e3;
  function handleSwipe(pieceId, dir) {
    if (_animating || state.phase !== "playing") return;
    const outcome = applySlide(state, { pieceId, dir });
    if (outcome.type === "no-move") return;
    _animating = true;
    const newClearedColors = outcome.clearedColorIndex !== void 0 ? [...state.clearedColors, outcome.clearedColorIndex] : state.clearedColors;
    state = { ...state, pieces: outcome.pieces, score: state.score + outcome.scoreDelta, clearedColors: newClearedColors };
    if (outcome.consumedPiece) {
      removePieceFromScene(outcome.consumedPiece.id);
    }
    if (outcome.type === "merge" || outcome.type === "clear") {
      if (outcome.movedPiece) {
        const pm = pieceMeshMap.get(outcome.movedPiece.id);
        if (pm) {
          refreshPieceLabel(pm, outcome.movedPiece);
          pm.bounceT = 1;
        }
      }
    }
    syncMeshPositions();
    if (outcome.type === "clear") {
      for (const cp of outcome.cleared) {
        const pm = pieceMeshMap.get(cp.id);
        if (pm) pm.fading = true;
      }
      setTimeout(() => {
        for (const cp of outcome.cleared) removePieceFromScene(cp.id);
        _animating = false;
        refreshHud();
        checkAndProgress();
      }, CLEAR_DELAY_MS);
    } else {
      setTimeout(() => {
        _animating = false;
        refreshHud();
        checkAndProgress();
      }, 250);
    }
    setSelected(null);
    refreshHud();
  }
  function checkAndProgress() {
    if (checkStageClear(state)) {
      hud.showMessage("Stage Clear! 🎉", "Tap to continue");
      state = { ...state, phase: "stage-clear" };
      renderer.domElement.addEventListener("pointerup", onStageClearTap, { once: true });
      return;
    }
    if (needsSpawn(state)) {
      doSpawn();
      refreshHud();
      return;
    }
    if (isDeadlocked(state)) {
      const rescue = spawnRescue(state);
      if (rescue) {
        state = {
          ...state,
          pieces: [...state.pieces, rescue],
          nextPieceId: state.nextPieceId + 1
        };
        addPieceToScene(rescue);
        refreshHud();
      }
    }
  }
  function onStageClearTap() {
    hud.hideMessage();
    state = advanceStage(state);
    doSpawn();
    refreshHud();
  }
  new DragInput(
    renderer.domElement,
    (sx, sy) => hitTestPiece(sx, sy),
    (evt) => handleSwipe(evt.pieceId, evt.dir)
  );
  renderer.domElement.addEventListener("pointerdown", (e) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    const piece = hitTestPiece(e.clientX - bounds.left, e.clientY - bounds.top);
    setSelected(piece ? piece.id : null);
  });
  window.addEventListener("keydown", (e) => {
    if (_selectedId === null) return;
    const map = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      KeyA: "left",
      KeyD: "right",
      KeyW: "up",
      KeyS: "down"
    };
    const dir = map[e.code];
    if (dir) handleSwipe(_selectedId, dir);
  });
  const clock = new THREE.Clock();
  const _pms = [];
  let _elapsed = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    _elapsed += dt;
    _pms.length = 0;
    pieceMeshMap.forEach((pm) => _pms.push(pm));
    updatePieceMeshes(_pms, dt);
    arrowSet.update(_elapsed);
    outlineEffect.render(scene, camera);
  }
  animate();
})(THREE);
//# sourceMappingURL=game.js.map
