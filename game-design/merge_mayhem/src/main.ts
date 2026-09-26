// ── Merge Mayhem — boot file ──────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { configureRenderer, createLightingRig, observeContainerResize } from './scene';
import { hardenGestures, hardenViewport } from './gesture-hardening';
import { MERGE_CONFIG } from './merge-config';
import { SHAPES, type Piece, type Direction } from './game-types';
import {
  createInitialState, spawnBatch, applySlide, checkStageClear,
  advanceStage, needsSpawn, isDeadlocked, spawnRescue, getColorProgress, type GameState,
} from './game-state';
import {
  createPieceMesh, refreshPieceLabel, updatePieceMeshes,
  createBoardFloor, boardToWorld, type PieceMesh,
} from './piece-renderer';
import { createHud } from './hud';
import { DragInput } from './drag-input';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { createArrowSet } from './arrows';

hardenViewport();
hardenGestures();

// ── Renderer ──────────────────────────────────────────────────────────────────
const container = document.getElementById('game')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
configureRenderer(renderer);
renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
container.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);
scene.fog = new THREE.Fog(0x111827, 22, 45);

// Camera: top-down with slight tilt for portrait layout
const camera = new THREE.PerspectiveCamera(60, GAME_WIDTH / GAME_HEIGHT, 0.1, 80);
const CAM_H = MERGE_CONFIG.CAM_HEIGHT;
const CAM_TILT_RAD = (MERGE_CONFIG.CAM_TILT * Math.PI) / 180;
camera.position.set(0, CAM_H, CAM_H * Math.tan(CAM_TILT_RAD));
camera.lookAt(0, 0, 0);

// Toon outline — wraps the renderer; call outlineEffect.render() instead of renderer.render()
const outlineEffect = new OutlineEffect(renderer, {
  defaultThickness: 0.006,  // thicker = more readable on small tiles
  defaultColor: [0.05, 0.05, 0.08],
  defaultAlpha: 1.0,
  defaultKeepAlive: true,
});

observeContainerResize(container, renderer, camera);
createLightingRig(scene, 8);

// Board floor
const boardFloor = createBoardFloor();
scene.add(boardFloor);

// Direction arrows
const arrowSet = createArrowSet(scene);

// ── Raycasting for hit-test ───────────────────────────────────────────────────
const _raycaster = new THREE.Raycaster();
const _boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPt = new THREE.Vector3();
const _ndcVec = new THREE.Vector2();

function screenToBoardPos(sx: number, sy: number): { col: number; row: number } | null {
  const rect = renderer.domElement.getBoundingClientRect();
  _ndcVec.set((sx / rect.width) * 2 - 1, -(sy / rect.height) * 2 + 1);
  _raycaster.setFromCamera(_ndcVec, camera);
  const hit = _raycaster.ray.intersectPlane(_boardPlane, _hitPt);
  if (!hit) return null;
  const col = Math.round((_hitPt.x + (MERGE_CONFIG.BOARD_COLS * MERGE_CONFIG.TILE_SIZE) / 2 - MERGE_CONFIG.TILE_SIZE / 2) / MERGE_CONFIG.TILE_SIZE);
  const row = Math.round((_hitPt.z + (MERGE_CONFIG.BOARD_ROWS * MERGE_CONFIG.TILE_SIZE) / 2 - MERGE_CONFIG.TILE_SIZE / 2) / MERGE_CONFIG.TILE_SIZE);
  return { col, row };
}

// ── Game state ────────────────────────────────────────────────────────────────
let state: GameState = createInitialState();
const pieceMeshMap = new Map<number, PieceMesh>(); // pieceId → PieceMesh

function addPieceToScene(piece: Piece): void {
  const pm = createPieceMesh(piece);
  pieceMeshMap.set(piece.id, pm);
  scene.add(pm.group);
}

function removePieceFromScene(pieceId: number): void {
  const pm = pieceMeshMap.get(pieceId);
  if (pm) {
    scene.remove(pm.group);
    pieceMeshMap.delete(pieceId);
  }
}

function syncMeshPositions(): void {
  for (const piece of state.pieces) {
    const pm = pieceMeshMap.get(piece.id);
    if (!pm) continue;
    const { x, z } = boardToWorld(piece.col, piece.row);
    pm.targetX = x;
    pm.targetZ = z;
  }
}

// Spawn pieces until the board is sufficiently full
function doSpawn(): void {
  let iterations = 0;
  while (needsSpawn(state) && iterations < 10) {
    const spawned = spawnBatch(state);
    if (spawned.length === 0) break;
    state = {
      ...state,
      pieces: [...state.pieces, ...spawned],
      nextPieceId: state.nextPieceId + spawned.length,
    };
    for (const p of spawned) addPieceToScene(p);
    iterations++;
  }
}

doSpawn();

// ── HUD ───────────────────────────────────────────────────────────────────────
const hud = createHud(container);
function refreshHud(): void {
  hud.update(state.stage, state.score, getColorProgress(state.pieces));
}
refreshHud();

// ── Selection highlight ───────────────────────────────────────────────────────
let _selectedId: number | null = null;

function setSelected(id: number | null): void {
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
    const piece = state.pieces.find(p => p.id === id);
    if (piece) arrowSet.show(piece, state.pieces);
  } else {
    arrowSet.hide();
  }
}

// ── Hit test: find piece at screen coordinates ────────────────────────────────
function hitTestPiece(sx: number, sy: number): Piece | null {
  const bp = screenToBoardPos(sx, sy);
  if (!bp) return null;
  const { col, row } = bp;
  if (col < 0 || col >= MERGE_CONFIG.BOARD_COLS || row < 0 || row >= MERGE_CONFIG.BOARD_ROWS) return null;

  // Find piece whose tiles include this cell
  for (const piece of state.pieces) {
    const { tiles } = SHAPES[piece.shapeId];
    for (const t of tiles) {
      if (piece.col + t.dc === col && piece.row + t.dr === row) return piece;
    }
  }
  return null;
}

// ── Slide action handler ──────────────────────────────────────────────────────
let _animating = false;
const CLEAR_DELAY_MS = (MERGE_CONFIG.CLEAR_FADE_DUR + 0.1) * 1000;

function handleSwipe(pieceId: number, dir: Direction): void {
  if (_animating || state.phase !== 'playing') return;

  const outcome = applySlide(state, { pieceId, dir });
  if (outcome.type === 'no-move') return;

  _animating = true;
  const newClearedColors = outcome.clearedColorIndex !== undefined
    ? [...state.clearedColors, outcome.clearedColorIndex]
    : state.clearedColors;
  state = { ...state, pieces: outcome.pieces, score: state.score + outcome.scoreDelta, clearedColors: newClearedColors };

  // Remove consumed piece mesh immediately (it will be replaced by surviving piece)
  if (outcome.consumedPiece) {
    removePieceFromScene(outcome.consumedPiece.id);
  }

  // Refresh surviving merged piece label
  if (outcome.type === 'merge' || outcome.type === 'clear') {
    if (outcome.movedPiece) {
      const pm = pieceMeshMap.get(outcome.movedPiece.id);
      if (pm) {
        refreshPieceLabel(pm, outcome.movedPiece);
        pm.bounceT = 1;
      }
    }
  }

  // Sync all positions (animate via updatePieceMeshes)
  syncMeshPositions();

  if (outcome.type === 'clear') {
    // Fade out cleared pieces
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

function checkAndProgress(): void {
  if (checkStageClear(state)) {
    hud.showMessage('Stage Clear! 🎉', 'Tap to continue');
    state = { ...state, phase: 'stage-clear' };
    renderer.domElement.addEventListener('pointerup', onStageClearTap, { once: true });
    return;
  }
  if (needsSpawn(state)) {
    doSpawn();
    refreshHud();
    return;
  }
  // Deadlock rescue: if no merge is possible, force-spawn a matching piece.
  if (isDeadlocked(state)) {
    const rescue = spawnRescue(state);
    if (rescue) {
      state = {
        ...state,
        pieces: [...state.pieces, rescue],
        nextPieceId: state.nextPieceId + 1,
      };
      addPieceToScene(rescue);
      refreshHud();
    }
  }
}

function onStageClearTap(): void {
  hud.hideMessage();
  state = advanceStage(state);
  doSpawn();
  refreshHud();
}

// ── Drag input ────────────────────────────────────────────────────────────────
const dragInput = new DragInput(
  renderer.domElement,
  (sx, sy) => hitTestPiece(sx, sy),
  (evt) => handleSwipe(evt.pieceId, evt.dir),
);

// Update selection highlight as user touches
renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
  const bounds = renderer.domElement.getBoundingClientRect();
  const piece = hitTestPiece(e.clientX - bounds.left, e.clientY - bounds.top);
  setSelected(piece ? piece.id : null);
});

// ── Keyboard fallback (desktop preview) ──────────────────────────────────────
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (_selectedId === null) return;
  const map: Record<string, Direction> = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  };
  const dir = map[e.code];
  if (dir) handleSwipe(_selectedId, dir);
});

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const _pms: PieceMesh[] = [];

let _elapsed = 0;
function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  _elapsed += dt;

  // Sync pieceMeshMap values into array for update
  _pms.length = 0;
  pieceMeshMap.forEach(pm => _pms.push(pm));
  updatePieceMeshes(_pms, dt);

  arrowSet.update(_elapsed);

  outlineEffect.render(scene, camera);
}
animate();
