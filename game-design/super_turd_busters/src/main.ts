import {
  GAME_WIDTH, GAME_HEIGHT,
  COLORS, TEXT_STYLES,
  GRID_PADDING, GRID_TOP, GRID_BOTTOM_MARGIN,
  createGameConfig,
} from './config';
import type { Direction, CellType, Cell, Level, GameState } from './types';
import {
  initAudio, startMusic,
  sfxBup, sfxBupRewind, sfxThud, sfxSquelch, sfxLevelClear,
} from './audio';

// ─── Level Generation ─────────────────────────────────────────────────────────

/**
 * Difficulty scaling — procedurally growing poops and walls:
 *
 * Grid tiers (same as before):
 *   L1      : 3×4
 *   L2      : 3×4  (1 wall to introduce obstacles)
 *   L3–4    : 4×5
 *   L5–6    : 4×6
 *   L7–9    : 5×7
 *   L10–12  : 5×8
 *   L13–15  : 6×9
 *   L16–18  : 7×10
 *   L19+    : 8×11
 *
 * Poops: floor(1 + level/4), capped at 6.
 *   L1=1, L4=2, L8=3, L12=4, L16=5, L20+=6
 *
 * Walls: floor(level * 0.65), capped at floor(cols*rows*0.28).
 *
 * minInputs: grows with poopCount and grid size so puzzles stay non-trivial.
 */
function difficultyFor(level: number): { cols: number; rows: number; extraWalls: number; minInputs: number; poopCount: number } {
  // Grid tier
  let cols: number, rows: number;
  if      (level === 1)   { cols = 3; rows = 4;  }
  else if (level === 2)   { cols = 3; rows = 4;  }
  else if (level <= 4)    { cols = 4; rows = 5;  }
  else if (level <= 6)    { cols = 4; rows = 6;  }
  else if (level <= 9)    { cols = 5; rows = 7;  }
  else if (level <= 12)   { cols = 5; rows = 8;  }
  else if (level <= 15)   { cols = 6; rows = 9;  }
  else if (level <= 18)   { cols = 7; rows = 10; }
  else                    { cols = 8; rows = 11; }

  // Poop count tied to grid tier so each size jump brings more poops.
  // L1–2: 1 poop (tutorial), L3–6: 2 poops, L7–12: 3 poops,
  // L13–18: 4 poops, L19–24: 5 poops, L25+: 6 poops.
  let poopCount: number;
  if      (level <= 2)    poopCount = 1;
  else if (level <= 6)    poopCount = 2;
  else if (level <= 12)   poopCount = 3;
  else if (level <= 18)   poopCount = 4;
  else if (level <= 24)   poopCount = 5;
  else                    poopCount = 6;

  // Wall count: ramps with level, capped at 28% of grid cells
  const maxWalls   = Math.floor(cols * rows * 0.28);
  const rawWalls   = level === 1 ? 0 : Math.floor(level * 0.65);
  const extraWalls = Math.min(rawWalls, maxWalls);

  // minInputs: at least 2 × poopCount (each poop needs ~2 moves to reach)
  const minInputs = Math.max(2, poopCount * 2 + Math.floor(level / 6));

  return { cols, rows, extraWalls, minInputs, poopCount };
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Shuffle an array in-place using a seeded rand function */
function shuffle<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Simulate one slide of the snake in direction d, respecting:
 *   - grid walls
 *   - grid boundaries
 *   - row -1 is the toilet row: only the toilet column exists there,
 *     so left/right/up from row -1 produce no movement
 *   - the snake's own body (body acts as a wall — stops before hitting self)
 *
 * Returns the new head position after sliding, plus all cells traversed.
 * The snake body passed in is the list of occupied cells BEFORE this move.
 */
function simulateSlide(
  grid: CellType[][], rows: number, cols: number,
  head: Cell, body: Cell[], dir: Direction,
  toiletCol: number,
): { stops: Cell; passed: Cell[] } {
  const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
  const dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
  const bodySet = new Set(body.map(b => `${b.row},${b.col}`));
  const passed: Cell[] = [];
  let pr = head.row, pc = head.col;
  while (true) {
    const nr = pr + dr, nc = pc + dc;
    // Can't go above row -1
    if (nr < -1) break;
    // Can't go below grid or outside columns
    if (nr >= rows || nc < 0 || nc >= cols) break;
    // At row -1, only the toilet column cell exists — lateral moves are blocked
    if (nr === -1 && nc !== toiletCol) break;
    // Entering row -1 from row 0 is only allowed when moving up in the toilet column
    if (nr === -1 && pc !== toiletCol) break;
    // Grid wall block (only rows 0+)
    if (nr >= 0 && grid[nr][nc] === 'wall') break;
    // Self block
    if (bodySet.has(`${nr},${nc}`)) break;
    pr = nr; pc = nc;
    passed.push({ row: pr, col: pc });
  }
  return { stops: { row: pr, col: pc }, passed };
}

/**
 * Full game-aware BFS — any-order multi-poop collection.
 *
 * Tracks which poops have been cleared via a bitmask (bit i = poopCells[i]).
 * Win condition: all bits set. The snake must collect all poops but in any order.
 */
function bfsSolve(
  grid: CellType[][], rows: number, cols: number,
  toiletCol: number,
  poopCells: Cell[],
  minInputs: number, maxInputs: number,
): Direction[] | null {
  const allDirs: Direction[] = ['down', 'right', 'left', 'up'];
  const allCleared = (1 << poopCells.length) - 1;

  type State = { head: Cell; body: Cell[]; dirs: Direction[]; cleared: number };

  const encodeState = (head: Cell, body: Cell[], cleared: number): string => {
    const sorted = body.map(b => `${b.row},${b.col}`).sort().join('|');
    return `${head.row},${head.col};${cleared};${sorted}`;
  };

  const initHead: Cell = { row: -1, col: toiletCol };
  const initBody: Cell[] = [initHead];
  const queue: State[] = [{ head: initHead, body: initBody, dirs: [], cleared: 0 }];
  const seen = new Set<string>();
  seen.add(encodeState(initHead, initBody, 0));

  while (queue.length > 0) {
    const { head, body, dirs, cleared } = queue.shift()!;
    if (dirs.length >= maxInputs) continue;

    for (const dir of allDirs) {
      const { stops, passed } = simulateSlide(grid, rows, cols, head, body, dir, toiletCol);
      if (stops.row === head.row && stops.col === head.col && passed.length === 0) continue;

      const newBody = [...passed, ...body];
      const newDirs = [...dirs, dir];
      const allCells = [...passed, stops];

      // Update cleared mask: check each passed+stop cell against all poops
      let newCleared = cleared;
      for (const cell of allCells) {
        for (let i = 0; i < poopCells.length; i++) {
          if (!(newCleared & (1 << i)) &&
              cell.row === poopCells[i].row && cell.col === poopCells[i].col) {
            newCleared |= (1 << i);
          }
        }
      }

      if (newCleared === allCleared && newDirs.length >= minInputs) {
        return newDirs; // all poops cleared with enough moves
      }

      if (newCleared === allCleared) continue; // too few moves — keep exploring

      const key = encodeState(stops, newBody, newCleared);
      if (seen.has(key)) continue;
      seen.add(key);

      queue.push({ head: stops, body: newBody, dirs: newDirs, cleared: newCleared });
    }
  }
  return null;
}

/**
 * Compute a compact fingerprint of a level layout for duplicate detection.
 */
function levelFingerprint(grid: CellType[][], rows: number, cols: number, toiletCol: number, poopCells: Cell[]): string {
  const cells = grid.map(r => r.map(c => c[0]).join('')).join('/');
  const poops = poopCells.map(p => `${p.row},${p.col}`).join('+');
  return `${cols}x${rows}|t${toiletCol}|p${poops}|${cells}`;
}

// Set of layout fingerprints seen this session — prevents duplicate levels
const seenLevelLayouts = new Set<string>();

/**
 * Generate a level by:
 * 1. Randomising toilet column position
 * 2. Placing walls + multiple ordered poops randomly on a grid
 * 3. Running the game-aware BFS (all poops must be cleared in order)
 * 4. Checking against seen layouts to avoid duplicates
 * 5. Retrying with different seeds until a valid unique layout is found
 */
function generateLevel(level: number): Level {
  const { cols, rows, extraWalls, minInputs, poopCount } = difficultyFor(level);
  const safeMin = Math.max(2, minInputs);
  const maxInputs = safeMin + 5; // wider window gives BFS more room for multi-poop layouts

  for (let attempt = 0; attempt < 120; attempt++) {
    const rand = rng(level * 251 + attempt * 997 + 13);

    const toiletCol = Math.floor(rand() * cols);

    const grid: CellType[][] = Array.from({ length: rows }, () =>
      Array(cols).fill('empty') as CellType[]
    );
    grid[0][toiletCol] = 'toilet';

    // Place poopCount poops at distinct random positions (not the toilet start cell)
    const poopCells: Cell[] = [];
    const usedKeys = new Set<string>([`0,${toiletCol}`]);
    let placedPoops = 0;
    let poopAttempts = 0;
    while (placedPoops < poopCount && poopAttempts < 50) {
      poopAttempts++;
      const pr = 1 + Math.floor(rand() * (rows - 1));
      const pc = Math.floor(rand() * cols);
      const key = `${pr},${pc}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      grid[pr][pc] = 'poop';
      poopCells.push({ row: pr, col: pc });
      placedPoops++;
    }
    if (poopCells.length < poopCount) continue; // couldn't place all poops

    // Place extra walls on remaining empty cells
    const candidates: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 'empty') candidates.push({ row: r, col: c });
      }
    }
    shuffle(candidates, rand);
    for (let i = 0; i < extraWalls && i < candidates.length; i++) {
      grid[candidates[i].row][candidates[i].col] = 'wall';
    }

    // BFS: verify a solution exists clearing all poops in order
    const solution = bfsSolve(grid, rows, cols, toiletCol, poopCells, safeMin, maxInputs);
    if (!solution) continue;

    // Reject duplicate layouts
    const fp = levelFingerprint(grid, rows, cols, toiletCol, poopCells);
    if (seenLevelLayouts.has(fp)) continue;
    seenLevelLayouts.add(fp);

    return { grid, cols, rows, toiletCol, poopCells, solution };
  }

  // Fallback: open 4x5 grid, two poops in a simple 2-move-each arrangement
  const toiletCol = 0;
  const grid: CellType[][] = Array.from({ length: rows }, () =>
    Array(cols).fill('empty') as CellType[]
  );
  grid[0][toiletCol] = 'toilet';
  const poopCells: Cell[] = [{ row: rows - 1, col: 0 }];
  grid[rows - 1][0] = 'poop';
  if (poopCount > 1 && cols > 1) {
    grid[rows - 1][cols - 1] = 'poop';
    poopCells.push({ row: rows - 1, col: cols - 1 });
  }
  if (rows > 2) grid[Math.floor(rows / 2)][toiletCol] = 'wall';
  const fallbackSolution = bfsSolve(grid, rows, cols, toiletCol, poopCells, 2, 10) ?? ['down', 'right'];
  return { grid, cols, rows, toiletCol, poopCells, solution: fallbackSolution };
}

// ─── Game State Helpers ───────────────────────────────────────────────────────

function buildState(level: Level, levelNum: number): GameState {
  const grid: CellType[][] = level.grid.map(row => [...row] as CellType[]);
  const snake: Cell[] = [{ row: -1, col: level.toiletCol }];
  return {
    level: levelNum,
    snake,
    direction: 'down',
    grid,
    cols: level.cols,
    rows: level.rows,
    toiletCol: level.toiletCol,
    poopCells: level.poopCells,
    clearedPoopKeys: [],
    moving: false,
    won: false,
    lost: false,
  };
}

/**
 * Attempt to queue a new direction for the snake. Returns updated state.
 * The snake will slide in the new direction from its current head position.
 */
function applyDirection(state: GameState, dir: Direction): GameState {
  if (state.moving || state.won || state.lost) return state;
  return { ...state, direction: dir, moving: true };
}

/** Advance snake one cell in current direction. Returns new state. */
function stepSnake(state: GameState): GameState {
  const { snake, direction, grid, rows, cols, poopCells, clearedPoopKeys } = state;
  const head = snake[0];
  const dr = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
  const dc = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
  const nr = head.row + dr;
  const nc = head.col + dc;

  if (nr < -1 || nr >= rows || nc < 0 || nc >= cols) return { ...state, moving: false };
  if (nr === -1 && nc !== state.toiletCol)            return { ...state, moving: false };

  const cell = nr >= 0 ? grid[nr][nc] : 'empty';
  if (nr >= 0 && cell === 'wall')                     return { ...state, moving: false };

  const hitSelf = snake.some(s => s.row === nr && s.col === nc);
  if (hitSelf)                                        return { ...state, moving: false };

  const newSnake = [{ row: nr, col: nc }, ...snake];
  const newGrid  = grid.map(r => [...r] as CellType[]);
  if (nr >= 0) newGrid[nr][nc] = 'snake';

  // Any-order poop collection: check if landing on any un-cleared poop
  const cellKey = `${nr},${nc}`;
  const isPoop  = poopCells.some(p => p.row === nr && p.col === nc);
  const alreadyCleared = clearedPoopKeys.includes(cellKey);

  if (isPoop && !alreadyCleared) {
    const newCleared = [...clearedPoopKeys, cellKey];
    const won = newCleared.length >= poopCells.length;
    return { ...state, snake: newSnake, grid: newGrid, clearedPoopKeys: newCleared, moving: !won, won };
  }

  return { ...state, snake: newSnake, grid: newGrid, moving: true };
}

// ─── Scene Globals ────────────────────────────────────────────────────────────

let scene: Phaser.Scene;
let rexUI: any;
let gs: GameState;
let currentLevel = 1;

// Visual layer
let cellSize = 80;
let gridOffsetX = 0;
let gridOffsetY = 0;

let gridGraphics: Phaser.GameObjects.Graphics;
let snakeGraphics: Phaser.GameObjects.Graphics;
let overlayGroup: Phaser.GameObjects.Group;
let levelTexts: Phaser.GameObjects.Text[] = []; // 4-layer SF2 level label
let msgText: Phaser.GameObjects.Text;

// Step timing
let stepTimer = 0;
const STEP_DELAY      = 70;  // ms per cell during normal forward movement
const STEP_DELAY_UNDO = 35;  // ms per cell during undo rewind (2× speed)
let   currentStepDelay = STEP_DELAY; // active delay, switches during undo rewind

// State history for undo (one snapshot per completed slide)
let stateHistory: GameState[] = [];

// Solution hint for current level
let currentSolution: Direction[] = [];
let hintOverlay: Phaser.GameObjects.Container | null = null;
let winOverlay:  Phaser.GameObjects.Container | null = null;
let currentLevelData: Level | null = null; // stored for undo-to-start

// Undo rewind animation: cells to visually retract one-by-one at 2x speed
let rewindCells: Cell[] = [];   // ordered head→tail cells being retracted
let rewindTargetState: GameState | null = null;

// Track the direction of the last completed slide for reverse-to-undo
let lastCompletedDir: Direction | null = null;
let queuedDir: Direction | null = null;

// Swipe tracking
let pointerDownX = 0;
let pointerDownY = 0;

// Plumber arm animation
let plumberArmPhase = 0;   // 0–1 oscillating cycle
let plumberArmActive = false; // true while snake is moving or rewind is running

// Audio state per-slide
let slideSloshPlayed = false;  // true once slosh has fired for the current slide
let slidePoopCount  = 0;       // clearedPoopKeys.length at slide start, to detect new clears

// Active particle graphics (poop burst, win splash) — cleared on level load
let particleGraphics: Phaser.GameObjects.Graphics[] = [];

// ─── Phaser Lifecycle ─────────────────────────────────────────────────────────

function create(this: Phaser.Scene): void {
  scene = this;
  rexUI = (this as any).rexUI;

  // Read the level chosen from Level Select (defaults to 1)
  const reg = this.registry.get('startLevel');
  currentLevel = (typeof reg === 'number' && reg >= 1) ? reg : 1;

  // Clear session-dedup set so replaying a level always reproduces the same layout
  seenLevelLayouts.clear();

  // Background gradient
  const bgGfx = this.add.graphics();
  bgGfx.fillGradientStyle(COLORS.bg.primary, COLORS.bg.primary, COLORS.bg.secondary, COLORS.bg.secondary, 1);
  bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Pipe texture background
  const pipeGfx = this.add.graphics();
  pipeGfx.lineStyle(3, COLORS.pipe.stroke, 0.3);
  for (let x = 0; x < GAME_WIDTH; x += 60) pipeGfx.lineBetween(x, 0, x, GAME_HEIGHT);
  for (let y = 0; y < GAME_HEIGHT; y += 60) pipeGfx.lineBetween(0, y, GAME_WIDTH, y);

  // Message overlay text (win/lose)
  msgText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    ...TEXT_STYLES.heading,
    fontSize: '64px',
  }).setOrigin(0.5).setAlpha(0).setDepth(10);

  // Grid and snake graphics layers
  gridGraphics  = this.add.graphics();
  snakeGraphics = this.add.graphics();

  // Overlay group (for emoji sprites/text)
  overlayGroup = this.add.group();

  // Control buttons
  buildControls(this);

  // Swipe input
  this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    pointerDownX = p.x;
    pointerDownY = p.y;
  });
  this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
    const dx = p.x - pointerDownX;
    const dy = p.y - pointerDownY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const SWIPE_MIN = 30;
    if (absDx < SWIPE_MIN && absDy < SWIPE_MIN) return;
    if (absDx > absDy) {
      handleDirInput(dx > 0 ? 'right' : 'left');
    } else {
      handleDirInput(dy > 0 ? 'down' : 'up');
    }
  });

  // Keyboard input
  const keys = this.input.keyboard!.createCursorKeys();
  const wasd = this.input.keyboard!.addKeys('W,A,S,D') as any;

  this.input.keyboard!.on('keydown', (evt: KeyboardEvent) => {
    if (keys.left.isDown  || wasd.A.isDown) { handleDirInput('left');  return; }
    if (keys.right.isDown || wasd.D.isDown) { handleDirInput('right'); return; }
    if (keys.up.isDown    || wasd.W.isDown) { handleDirInput('up');    return; }
    if (keys.down.isDown  || wasd.S.isDown) { handleDirInput('down');  return; }
  });

  loadLevel(currentLevel);

  // Start audio — safe here because we always arrive via a user gesture
  initAudio();
  startMusic();

  // ── Back button — returns to Level Select ────────────────────────────────
  const backGfx = this.add.graphics().setDepth(50);
  const BW = 180, BH = 60;
  const BX = BW / 2 + 12, BY = BH / 2 + 12;
  const drawBack = (pressed: boolean) => {
    backGfx.clear();
    backGfx.fillStyle(pressed ? 0x2a1a3e : 0x1a0a2e, 0.88);
    backGfx.fillRoundedRect(BX - BW / 2, BY - BH / 2, BW, BH, 10);
    backGfx.lineStyle(2, 0x6644aa, 1);
    backGfx.strokeRoundedRect(BX - BW / 2, BY - BH / 2, BW, BH, 10);
  };
  drawBack(false);
  this.add.text(BX, BY, '◀ LEVELS', {
    fontSize: '26px', fontFamily: 'Arial Black, Arial',
    color: '#aaaaff', stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(51);
  const backZone = this.add.zone(BX, BY, BW, BH).setInteractive({ useHandCursor: true }).setDepth(52);
  backZone.on('pointerdown', () => drawBack(true));
  backZone.on('pointerup',   () => { drawBack(false); this.scene.start('LevelSelect'); });
  backZone.on('pointerout',  () => drawBack(false));
}

function update(this: Phaser.Scene, _time: number, delta: number): void {
  // ── Plumber arm animation ─────────────────────────────────────────
  const wasActive = plumberArmActive;
  plumberArmActive = !!(gs && (gs.moving || rewindCells.length > 0));
  if (plumberArmActive) {
    // Advance phase: one full pump cycle every ~300 ms
    plumberArmPhase = (plumberArmPhase + delta / 300) % 1;
    drawGrid(); // redraw plumber each frame while animating
  } else if (wasActive) {
    // Just stopped — snap arm back to rest and redraw once
    plumberArmPhase = 0;
    drawGrid();
  }

  // ── Undo rewind animation ───────────────────────────────────────
  if (rewindCells.length > 0) {
    stepTimer += delta;
    if (stepTimer >= STEP_DELAY_UNDO) {
      stepTimer = 0;
      rewindCells.shift(); // remove head cell — snake retracts from front
      sfxBupRewind();      // per-step rewind bup
      const targetLen = rewindTargetState ? rewindTargetState.snake.length : 0;
      if (rewindCells.length <= targetLen) {
        // Animation done — snap to target state
        gs = rewindTargetState!;
        rewindTargetState = null;
        rewindCells = [];
        currentStepDelay = STEP_DELAY; // restore normal speed
        drawGrid();
        drawSnake();
      } else {
        // Draw the in-progress retracted snake
        const savedSnake = gs.snake;
        gs = { ...gs, snake: rewindCells };
        drawSnake();
        gs = { ...gs, snake: savedSnake };
      }
    }
    return;
  }

  // ── Normal forward movement ───────────────────────────────────────
  if (!gs || !gs.moving) return;

  stepTimer += delta;
  if (stepTimer >= currentStepDelay) {
    stepTimer = 0;
    const prevMoving   = gs.moving;
    const prevCleared  = gs.clearedPoopKeys.length;
    gs = stepSnake(gs);
    drawSnake();

    // Snake steps each cell — fire bup per step for bup-bup-bup effect
    sfxBup();

    // Squelch + particle burst when a new poop is cleared mid-slide
    if (gs.clearedPoopKeys.length > prevCleared) {
      sfxSquelch();
      // The new poop key is the last one added; find its cell
      const newKey = gs.clearedPoopKeys[gs.clearedPoopKeys.length - 1];
      const [pr, pc] = newKey.split(',').map(Number);
      spawnPoopBurst(pr, pc);
    }

    // Snapshot when the snake finishes a slide (moving just became false)
    // Only record if the head actually moved — skip no-ops (blocked moves)
    const headMoved = gs.snake[0].row !== (stateHistory.length > 0
      ? stateHistory[stateHistory.length - 1].snake[0].row
      : -1) ||
      gs.snake[0].col !== (stateHistory.length > 0
      ? stateHistory[stateHistory.length - 1].snake[0].col
      : gs.toiletCol);
    if (prevMoving && !gs.moving && !gs.won && !gs.lost && headMoved) {
      // Snake stopped — play thud (hit a wall / edge / self)
      sfxThud();

      stateHistory.push(gs);
      lastCompletedDir = gs.direction; // remember direction for reverse-to-undo
      // Redraw grid in case a poop was just cleared
      drawGrid();

      // Consume queued direction if one was buffered during the slide
      if (queuedDir !== null) {
        const next = queuedDir;
        queuedDir = null;
        // Only apply if it actually causes movement (not blocked immediately)
        const { passed } = simulateSlide(
          gs.grid, gs.rows, gs.cols,
          gs.snake[0], gs.snake, next, gs.toiletCol,
        );
        if (passed.length > 0) {
          slidePoopCount = gs.clearedPoopKeys.length;
          gs = applyDirection(gs, next);
          stepTimer = 0;
        } else {
          sfxThud();
        }
      }
    }

    if (gs.won) {
      sfxLevelClear();
      spawnWinSplash();
      saveBestLevel(Math.max(loadBestLevel(), currentLevel + 1));
      showWinOverlay(() => {
        currentLevel++;
        loadLevel(currentLevel);
      });
    } else if (gs.lost) {
      showMessage('💀 OOPS!', COLORS.ui.lose, () => {
        loadLevel(currentLevel);
      });
    }
  }
}

// ─── Level Loading & Rendering ────────────────────────────────────────────────

function loadLevel(levelNum: number): void {
  const level = generateLevel(levelNum);
  currentLevelData = level;
  gs = buildState(level, levelNum);
  currentSolution = level.solution;

  // Hide any open hint overlay
  if (hintOverlay) { hintOverlay.destroy(); hintOverlay = null; }
  if (winOverlay)  { winOverlay.destroy();  winOverlay  = null; }

  // Compute cell size to fit grid in available vertical space
  const availW = GAME_WIDTH - GRID_PADDING * 2;
  const availH = GAME_HEIGHT - GRID_TOP - GRID_BOTTOM_MARGIN;
  cellSize = Math.floor(Math.min(availW / gs.cols, availH / gs.rows));
  cellSize = Math.max(cellSize, 60); // minimum cell size

  const gridW = cellSize * gs.cols;
  const gridH = cellSize * gs.rows;
  gridOffsetX = Math.floor((GAME_WIDTH - gridW) / 2);
  gridOffsetY = GRID_TOP;

  // (Re)build SF2-style level label, positioned inside the plumber panel
  for (const t of levelTexts) { if (t.active) t.destroy(); }
  const sceneTop = gridOffsetY - cellSize * 2.2;
  const labelY   = sceneTop + 48; // vertically centred near top of panel
  levelTexts = makeSF2Texts(
    scene,
    `LEVEL ${levelNum}`,
    GAME_WIDTH / 2, labelY,
    '#ffdd22', '#aa6600',
    '58px', 6,
  );

  msgText.setAlpha(0).setText('');
  stepTimer = 0;
  currentStepDelay = STEP_DELAY; // reset to normal speed
  stateHistory = []; // clear undo history on new level
  queuedDir = null;  // clear any pending queued input
  rewindCells = [];
  rewindTargetState = null;
  lastCompletedDir = null;
  plumberArmPhase = 0;
  plumberArmActive = false;

  // Destroy any lingering particle graphics
  for (const pg of particleGraphics) { if (pg.active) pg.destroy(); }
  particleGraphics = [];

  // Clear any tweens on msgText
  scene.tweens.killTweensOf(msgText);

  // Clear overlay group
  overlayGroup.clear(true, true);

  drawGrid();
  drawSnake();
}

/** Draw the static grid: background, walls, toilet, poop */
function drawGrid(): void {
  gridGraphics.clear();
  const { grid, rows, cols } = gs;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gridOffsetX + c * cellSize;
      const y = gridOffsetY + r * cellSize;
      const cell = grid[r][c];

      // Cell background — toilet cell gets same pipe fill as empty
      const showFill = cell === 'empty' || cell === 'snake' || cell === 'toilet';
      gridGraphics.fillStyle(COLORS.pipe.fill, showFill ? 0.18 : 0);
      gridGraphics.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

      // Grid lines
      gridGraphics.lineStyle(1, COLORS.pipe.stroke, 0.25);
      gridGraphics.strokeRect(x, y, cellSize, cellSize);

      if (cell === 'wall') {
        drawWall(gridGraphics, x, y);
      }
    }
  }

  // Draw toilet one cell ABOVE the grid (row -1)
  drawToilet(gridOffsetX + gs.toiletCol * cellSize, gridOffsetY - cellSize);

  // Draw all un-cleared poops (all look the same now — any order is allowed)
  for (const p of gs.poopCells) {
    const key = `${p.row},${p.col}`;
    if (!gs.clearedPoopKeys.includes(key)) {
      drawPoop(gridOffsetX + p.col * cellSize, gridOffsetY + p.row * cellSize, p.row, p.col);
    }
  }
}

/** Cell-centre world position (works for row -1 = toilet row above grid) */
function cellCenter(row: number, col: number): { cx: number; cy: number } {
  return {
    cx: gridOffsetX + col * cellSize + cellSize / 2,
    cy: gridOffsetY + row * cellSize + cellSize / 2,  // row -1 → one cell above gridOffsetY
  };
}

/** Draw the plumbing snake: grey steel cable body with diagonal ridges, auger drill head.
 *  Body cells that overlap cleared poop positions get brown splat overlays. */
function drawSnake(): void {
  snakeGraphics.clear();
  const { snake, direction, poopCells, clearedPoopKeys } = gs;
  if (snake.length === 0) return;

  // Build set of cleared poop keys for fast lookup
  const clearedSet = new Set(clearedPoopKeys);
  // Build set of poop cell positions (all, for splotch check)
  const poopKeySet = new Set(poopCells.map(p => `${p.row},${p.col}`));

  const cableW  = cellSize * 0.38;   // cable diameter as line width
  const ridgeW  = cellSize * 0.08;   // diagonal ridge line width
  const ridgeSpacing = cellSize * 0.28; // spacing between ridge lines

  // ── 1. Draw cable body (dark outline then grey fill) ─────────────────────
  for (let i = snake.length - 1; i >= 1; i--) {
    const { cx: ax, cy: ay } = cellCenter(snake[i].row,     snake[i].col);
    const { cx: bx, cy: by } = cellCenter(snake[i - 1].row, snake[i - 1].col);
    snakeGraphics.lineStyle(cableW + 6, COLORS.snake.stroke, 1);
    snakeGraphics.lineBetween(ax, ay, bx, by);
    snakeGraphics.lineStyle(cableW, COLORS.snake.body, 1);
    snakeGraphics.lineBetween(ax, ay, bx, by);
  }

  // ── 2. Draw diagonal ridge lines on each segment ─────────────────────────
  for (let i = snake.length - 1; i >= 1; i--) {
    const { cx: ax, cy: ay } = cellCenter(snake[i].row,     snake[i].col);
    const { cx: bx, cy: by } = cellCenter(snake[i - 1].row, snake[i - 1].col);
    const segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    if (segLen < 1) continue;

    // Unit vectors along and perpendicular to the segment
    const ux = (bx - ax) / segLen;
    const uy = (by - ay) / segLen;
    const px = -uy, py = ux; // perpendicular

    const halfW = cableW * 0.45;
    const numRidges = Math.max(1, Math.floor(segLen / ridgeSpacing));

    snakeGraphics.lineStyle(ridgeW, COLORS.snake.ridge, 0.7);
    for (let r = 0; r <= numRidges; r++) {
      const t   = (r / numRidges) * segLen;
      const mx  = ax + ux * t;
      const my  = ay + uy * t;
      // Diagonal slash: slant 45° across the cable width
      const slant = halfW * 0.7;
      const x1 = mx + px * halfW  - ux * slant;
      const y1 = my + py * halfW  - uy * slant;
      const x2 = mx - px * halfW  + ux * slant;
      const y2 = my - py * halfW  + uy * slant;
      snakeGraphics.lineBetween(x1, y1, x2, y2);
    }
  }

  // ── 3. Poop splotches on body cells that passed through cleared poops ────
  for (let i = 1; i < snake.length; i++) {
    const seg = snake[i];
    const key = `${seg.row},${seg.col}`;
    if (clearedSet.has(key) || (poopKeySet.has(key) && !clearedSet.has(key) === false)) {
      // Draw brown splotch blobs on this segment
      const { cx, cy } = cellCenter(seg.row, seg.col);
      const r = cableW * 0.52;
      // Use a simple deterministic offset based on segment index
      const offsets = [
        { dx: -r * 0.3, dy: -r * 0.4 },
        { dx:  r * 0.5, dy:  r * 0.1 },
        { dx: -r * 0.1, dy:  r * 0.5 },
        { dx:  r * 0.4, dy: -r * 0.3 },
      ];
      for (const { dx, dy } of offsets) {
        snakeGraphics.fillStyle(COLORS.poop.fill, 0.85);
        snakeGraphics.fillCircle(cx + dx, cy + dy, r * 0.42);
      }
    }
  }

  // ── 4. Draw auger drill head at snake[0] ─────────────────────────────────
  const { cx: hx, cy: hy } = cellCenter(snake[0].row, snake[0].col);

  const fdx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
  const fdy = direction === 'down'  ? 1 : direction === 'up'   ? -1 : 0;
  const perpX = -fdy, perpY = fdx;

  const collarR = cableW * 0.58;
  const tipLen  = cellSize * 0.46;
  const tipX    = hx + fdx * tipLen;
  const tipY    = hy + fdy * tipLen;

  // Collar disc
  snakeGraphics.fillStyle(COLORS.snake.stroke, 1);
  snakeGraphics.fillCircle(hx, hy, collarR + 3);
  snakeGraphics.fillStyle(COLORS.snake.body, 1);
  snakeGraphics.fillCircle(hx, hy, collarR);

  // Auger cone body (filled triangle pointing forward)
  snakeGraphics.fillStyle(COLORS.snake.stroke, 1);
  snakeGraphics.fillPoints([
    { x: hx + perpX * collarR,  y: hy + perpY * collarR  },
    { x: hx - perpX * collarR,  y: hy - perpY * collarR  },
    { x: tipX,                   y: tipY                  },
  ], true, true);
  snakeGraphics.fillStyle(COLORS.snake.body, 1);
  snakeGraphics.fillPoints([
    { x: hx + perpX * (collarR - 3),  y: hy + perpY * (collarR - 3)  },
    { x: hx - perpX * (collarR - 3),  y: hy - perpY * (collarR - 3)  },
    { x: tipX - fdx * 4,               y: tipY - fdy * 4              },
  ], true, true);

  // Diagonal flute lines across the auger cone
  const fluteCount = 4;
  snakeGraphics.lineStyle(2, COLORS.snake.ridge, 0.8);
  for (let f = 1; f < fluteCount; f++) {
    const t   = f / fluteCount;
    const fx  = hx + fdx * tipLen * t;
    const fy  = hy + fdy * tipLen * t;
    const hw  = collarR * (1 - t) + 1;
    snakeGraphics.lineBetween(
      fx + perpX * hw + fdx * hw * 0.5,
      fy + perpY * hw + fdy * hw * 0.5,
      fx - perpX * hw - fdx * hw * 0.5,
      fy - perpY * hw - fdy * hw * 0.5,
    );
  }

  // Bright silver tip point
  snakeGraphics.fillStyle(COLORS.snake.tip, 1);
  snakeGraphics.fillCircle(tipX, tipY, 4);

  // Collar highlight
  snakeGraphics.fillStyle(0xffffff, 0.25);
  snakeGraphics.fillCircle(
    hx - fdx * collarR * 0.3 - perpX * collarR * 0.3,
    hy - fdy * collarR * 0.3 - perpY * collarR * 0.3,
    collarR * 0.3,
  );

  // Poop splotch on head if it's sitting on a cleared poop cell
  const headKey = `${snake[0].row},${snake[0].col}`;
  if (clearedSet.has(headKey)) {
    snakeGraphics.fillStyle(COLORS.poop.fill, 0.8);
    snakeGraphics.fillCircle(hx + fdx * collarR * 0.3, hy + fdy * collarR * 0.3, collarR * 0.45);
    snakeGraphics.fillCircle(hx - perpX * collarR * 0.4, hy - perpY * collarR * 0.4, collarR * 0.3);
  }
}

// ─── Cell Drawing Helpers ─────────────────────────────────────────────────────

function drawWall(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  const s = cellSize;
  // Brick fill
  g.fillStyle(COLORS.wall.fill, 1);
  g.fillRect(x + 2, y + 2, s - 4, s - 4);
  // Brick pattern lines
  g.lineStyle(1.5, COLORS.wall.grout, 1);
  const half = s / 2;
  // Horizontal mortar lines
  g.lineBetween(x + 2, y + half, x + s - 2, y + half);
  // Vertical brick offsets
  g.lineBetween(x + half, y + 2, x + half, y + half);
  g.lineBetween(x + s * 0.25, y + half, x + s * 0.25, y + s - 2);
  g.lineBetween(x + s * 0.75, y + half, x + s * 0.75, y + s - 2);
  // Outer border
  g.lineStyle(2, COLORS.wall.stroke, 1);
  g.strokeRect(x + 2, y + 2, s - 4, s - 4);
}

/**
 * Draw the plumber scene above the grid.
 * Toilet bowl is centred on toiletCol. Plumber stands on whichever side has more room.
 * Cartoony Mario-style character: round head, cap, moustache, overalls.
 */
function drawToilet(toiletX: number, _unused: number): void {
  const g = gridGraphics;
  const armPhase = plumberArmPhase; // 0–1 oscillating pump cycle

  // Scene geometry
  const sceneLeft  = gridOffsetX;
  const sceneRight = gridOffsetX + gs.cols * cellSize;
  const sceneW     = sceneRight - sceneLeft;
  const sceneBot   = gridOffsetY;
  const sceneTop   = gridOffsetY - cellSize * 2.2;
  const sceneH     = sceneBot - sceneTop;

  // Toilet bowl centre (aligned to toiletCol)
  const tCX = toiletX + cellSize * 0.5;
  const tCY = sceneBot - sceneH * 0.28;
  const tBW = cellSize * 1.05;
  const tBH = cellSize * 0.65;

  // Background panel
  g.fillStyle(0x2a1a3e, 0.55);
  g.fillRect(sceneLeft, sceneTop, sceneW, sceneH);

  // Decide which side the plumber stands on (more room = that side)
  const spaceRight = sceneRight - (tCX + tBW * 0.5);
  const spaceLeft  = (tCX - tBW * 0.5) - sceneLeft;
  const plumberOnRight = spaceRight >= spaceLeft;

  // Plumber unit scale based on scene height
  const U = sceneH * 0.44; // one "unit" = roughly half scene height

  // Plumber centre X
  const pCX = plumberOnRight
    ? Math.min(tCX + tBW * 0.5 + U * 0.7, sceneRight - U * 0.4)
    : Math.max(tCX - tBW * 0.5 - U * 0.7, sceneLeft + U * 0.4);
  const pFeet = sceneBot - sceneH * 0.04;
  // Facing direction: toward toilet
  const facing = plumberOnRight ? -1 : 1; // -1 = left, 1 = right

  // ── Toilet: tank ────────────────────────────────────────────────────────────
  const tkW = tBW * 0.5;
  const tkH = sceneH * 0.36;
  const tkY = tCY - tBH * 0.5 - tkH;
  g.fillStyle(COLORS.toilet.bowl, 1);
  g.fillRoundedRect(tCX - tkW * 0.5, tkY, tkW, tkH, 5);
  g.lineStyle(2, COLORS.toilet.rim, 1);
  g.strokeRoundedRect(tCX - tkW * 0.5, tkY, tkW, tkH, 5);
  g.fillStyle(COLORS.toilet.rim, 1);
  g.fillCircle(tCX, tkY + tkH * 0.28, tkW * 0.1);

  // ── Toilet: bowl ────────────────────────────────────────────────────────────
  g.fillStyle(COLORS.toilet.bowl, 1);
  g.fillEllipse(tCX, tCY, tBW, tBH);
  g.lineStyle(3, COLORS.toilet.rim, 1);
  g.strokeEllipse(tCX, tCY, tBW, tBH);
  g.lineStyle(3, COLORS.toilet.rim, 0.6);
  g.strokeEllipse(tCX, tCY - tBH * 0.1, tBW * 0.88, tBH * 0.58); // seat
  g.fillStyle(COLORS.toilet.water, 0.6);
  g.fillEllipse(tCX, tCY + tBH * 0.06, tBW * 0.58, tBH * 0.38);

  // ── Toilet: pipe below (snake exits here) ────────────────────────────────────
  const pipeW  = cellSize * 0.26;
  const pipeCX = tCX;
  const pipeTop = tCY + tBH * 0.44;
  g.fillStyle(0xbbbbcc, 1);
  g.fillRect(pipeCX - pipeW * 0.5, pipeTop, pipeW, sceneBot - pipeTop + 4);
  g.lineStyle(2, 0x8888aa, 1);
  g.strokeRect(pipeCX - pipeW * 0.5, pipeTop, pipeW, sceneBot - pipeTop + 4);

  // ── Cartoon plumber ─────────────────────────────────────────────────────────
  // All proportions relative to U
  const headR  = U * 0.22;
  const bodyH  = U * 0.28;
  const bodyW  = U * 0.32;
  const legH   = U * 0.22;
  const legW   = U * 0.10;
  const bootH  = U * 0.10;
  const bootW  = U * 0.15;
  const armLen = U * 0.28;

  const headCY = pFeet - legH - bootH - bodyH - headR;
  const headCX = pCX;
  const bodBot = pFeet - legH - bootH;
  const bodTop = bodBot - bodyH;

  // Boots
  g.fillStyle(COLORS.plumber.boots, 1);
  g.fillEllipse(pCX - legW * 0.6,            pFeet, bootW, bootH);
  g.fillEllipse(pCX + legW * 0.6,            pFeet, bootW, bootH);

  // Legs (blue overalls)
  g.fillStyle(COLORS.plumber.overalls, 1);
  g.fillRect(pCX - legW * 1.1, bodBot, legW, legH);
  g.fillRect(pCX + legW * 0.1, bodBot, legW, legH);

  // Body / overalls bib
  g.fillStyle(COLORS.plumber.overalls, 1);
  g.fillRoundedRect(pCX - bodyW * 0.5, bodTop, bodyW, bodyH, 5);
  // Red shirt underneath (peeking from sides)
  g.fillStyle(COLORS.plumber.shirt, 1);
  g.fillRect(pCX - bodyW * 0.5 - legW * 0.5, bodTop, legW * 0.6, bodyH * 0.7);
  g.fillRect(pCX + bodyW * 0.5 - legW * 0.1, bodTop, legW * 0.6, bodyH * 0.7);
  // Overalls straps (two diagonal lines)
  g.lineStyle(legW * 0.8, COLORS.plumber.overalls, 1);
  g.lineBetween(pCX - bodyW * 0.18, bodTop, pCX - bodyW * 0.28, bodTop - headR * 0.3);
  g.lineBetween(pCX + bodyW * 0.18, bodTop, pCX + bodyW * 0.28, bodTop - headR * 0.3);
  // Overalls bib pocket dot
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(pCX, bodTop + bodyH * 0.35, legW * 0.35);

  // ── Both arms pump the cable toward the pipe, alternating half-phase apart ──
  const pump  = Math.sin(armPhase * Math.PI * 2);              // arm 1: facing side
  const pump2 = Math.sin((armPhase + 0.5) * Math.PI * 2);     // arm 2: back side, offset by half cycle

  // Arm 1 (facing side) — reaches across to pipe
  const handRestX = pipeCX + (plumberOnRight ? -tBW * 0.22 : tBW * 0.22);
  const handRestY = tCY - tBH * 0.25;
  const pipeVecX = pipeCX - handRestX;
  const pipeVecY = pipeTop - handRestY;
  const pipeVecLen = Math.sqrt(pipeVecX * pipeVecX + pipeVecY * pipeVecY) || 1;
  const pushAmp = U * 0.18;
  const handX = handRestX + (pipeVecX / pipeVecLen) * pump  * pushAmp;
  const handY = handRestY + (pipeVecY / pipeVecLen) * pump  * pushAmp;

  // Arm 2 (back side) — also reaches to the pipe from behind, slightly lower grip
  const hand2RestX = pipeCX + (plumberOnRight ? -tBW * 0.12 : tBW * 0.12);
  const hand2RestY = tCY - tBH * 0.05;  // slightly lower on the cable
  const pipe2VecX = pipeCX - hand2RestX;
  const pipe2VecY = pipeTop - hand2RestY;
  const pipe2VecLen = Math.sqrt(pipe2VecX * pipe2VecX + pipe2VecY * pipe2VecY) || 1;
  const hand2X = hand2RestX + (pipe2VecX / pipe2VecLen) * pump2 * pushAmp;
  const hand2Y = hand2RestY + (pipe2VecY / pipe2VecLen) * pump2 * pushAmp;

  const shoulderX  = pCX + facing * bodyW * 0.46;
  const shoulder2X = pCX - facing * bodyW * 0.46;
  const shoulderY  = bodTop + bodyH * 0.18;

  // Draw arm 1 (facing side)
  g.lineStyle(legW * 1.6, COLORS.plumber.shirt, 1);
  g.lineBetween(shoulderX, shoulderY, shoulderX + facing * armLen * 0.5, shoulderY + armLen * 0.2);
  g.lineStyle(legW * 1.4, COLORS.plumber.skin, 1);
  g.lineBetween(shoulderX + facing * armLen * 0.5, shoulderY + armLen * 0.2, handX, handY);
  g.fillStyle(COLORS.plumber.skin, 1);
  g.fillCircle(handX, handY, legW * 0.9);

  // Draw arm 2 (back side) — also reaching to the pipe
  g.lineStyle(legW * 1.6, COLORS.plumber.shirt, 1);
  g.lineBetween(shoulder2X, shoulderY, shoulder2X - facing * armLen * 0.4, shoulderY + armLen * 0.25);
  g.lineStyle(legW * 1.4, COLORS.plumber.skin, 1);
  g.lineBetween(shoulder2X - facing * armLen * 0.4, shoulderY + armLen * 0.25, hand2X, hand2Y);
  g.fillStyle(COLORS.plumber.skin, 1);
  g.fillCircle(hand2X, hand2Y, legW * 0.9);

  // Head (big circle)
  g.fillStyle(COLORS.plumber.skin, 1);
  g.fillCircle(headCX, headCY, headR);

  // Eyes — two cartoon eyes on the facing half of the head, tracking snake head
  // Eye positions: near eye (closer to face centre) and far eye (toward face edge)
  const eyeNearX = headCX + facing * headR * 0.18;
  const eyeFarX  = headCX + facing * headR * 0.56;
  const eyeY     = headCY - headR * 0.08;
  const eyeW     = headR * 0.36;
  const eyeH     = headR * 0.42;

  // Compute look direction: vector from head centre toward snake head world pos
  const snakeHead = gs.snake[0];
  const { cx: snakeWX, cy: snakeWY } = cellCenter(snakeHead.row, snakeHead.col);
  const lookDX = snakeWX - headCX;
  const lookDY = snakeWY - headCY;
  const lookLen = Math.sqrt(lookDX * lookDX + lookDY * lookDY) || 1;
  // Clamp pupil travel to 30% of eye half-width
  const pupilTravel = eyeW * 0.30;
  const pupilOX = (lookDX / lookLen) * pupilTravel;
  const pupilOY = (lookDY / lookLen) * pupilTravel;

  // Draw both eye whites
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(eyeNearX, eyeY, eyeW, eyeH);
  g.fillEllipse(eyeFarX,  eyeY, eyeW, eyeH);
  // Pupils
  g.fillStyle(0x1a1a55, 1);
  g.fillCircle(eyeNearX + pupilOX, eyeY + pupilOY, headR * 0.12);
  g.fillCircle(eyeFarX  + pupilOX, eyeY + pupilOY, headR * 0.12);
  // Eye shines
  g.fillStyle(0xffffff, 1);
  g.fillCircle(eyeNearX + pupilOX + headR * 0.05, eyeY + pupilOY - headR * 0.04, headR * 0.045);
  g.fillCircle(eyeFarX  + pupilOX + headR * 0.05, eyeY + pupilOY - headR * 0.04, headR * 0.045);

  // Ear (opposite side)
  g.fillStyle(COLORS.plumber.skin, 1);
  g.fillEllipse(headCX - facing * headR * 0.92, headCY + headR * 0.08, headR * 0.26, headR * 0.36);
  g.fillStyle(COLORS.plumber.skinDark, 1);
  g.fillEllipse(headCX - facing * headR * 0.92, headCY + headR * 0.08, headR * 0.14, headR * 0.22);

  // Big bushy moustache
  g.fillStyle(COLORS.plumber.mustache, 1);
  g.fillEllipse(headCX + facing * headR * 0.18, headCY + headR * 0.38, headR * 0.7,  headR * 0.28);
  g.fillEllipse(headCX + facing * headR * 0.58, headCY + headR * 0.35, headR * 0.45, headR * 0.22);

  // Nose (round)
  g.fillStyle(COLORS.plumber.skinDark, 1);
  g.fillCircle(headCX + facing * headR * 0.55, headCY + headR * 0.18, headR * 0.18);

  // Cap
  const capBaseY = headCY - headR * 0.6;
  g.fillStyle(COLORS.plumber.cap, 1);
  g.fillEllipse(headCX, headCY - headR * 0.72, headR * 2.0, headR * 0.78);
  // Brim
  g.fillStyle(COLORS.plumber.capBrim, 1);
  g.fillRect(headCX - headR * 1.0, capBaseY - headR * 0.06, headR * 2.0, headR * 0.18);
  // Cap shine
  g.fillStyle(0xffffff, 0.22);
  g.fillEllipse(headCX - facing * headR * 0.25, headCY - headR * 0.82, headR * 0.55, headR * 0.22);

  // ── Effort FX: sweat drops only (aura removed) ───────────────────────────
  if (plumberArmActive) {
    // Each drop: staggered cycle, randomised emission angle, slower travel, thicker body
    const sweatDefs = [
      // cycle, phase offset, angle (radians away from head, -facing side), drop radius
      { cycle: 2.2, offset: 0.00, ang: Math.PI * 0.72, r: headR * 0.16  },
      { cycle: 1.8, offset: 0.33, ang: Math.PI * 0.90, r: headR * 0.13  },
      { cycle: 2.6, offset: 0.61, ang: Math.PI * 0.58, r: headR * 0.115 },
    ];
    for (const sd of sweatDefs) {
      const sweatPhase = (plumberArmPhase * sd.cycle + sd.offset) % 1;
      // Slower travel: headR * 0.9 instead of 1.6
      const travel = sweatPhase * headR * 0.9;
      const alpha  = sweatPhase < 0.65 ? 0.92 : 0.92 * (1 - (sweatPhase - 0.65) / 0.35);
      // Launch from behind/above head; angle points away from facing direction
      const emitAng = (facing > 0 ? Math.PI : 0) - sd.ang * facing;
      const nx = Math.cos(emitAng), ny = Math.sin(emitAng);
      const ax = headCX + nx * headR * 0.7; // anchor on scalp edge
      const ay = headCY - headR * 0.4;
      const sx = ax + nx * travel;
      const sy = ay + ny * travel;
      const r  = sd.r;
      // Thicker teardrop body + longer pointed tail
      g.fillStyle(0x66bbff, alpha);
      g.fillCircle(sx, sy, r);
      g.fillTriangle(
        sx - nx * r * 0.9,  sy - ny * r * 0.9,  // base one side
        sx + ny * r * 0.5,  sy - nx * r * 0.5,  // base other side (perpendicular)
        sx - nx * r * 3.0,  sy - ny * r * 3.0,  // longer tail tip
      );
    }
  }
  // Snake cables from both hands to pipe
  g.lineStyle(cellSize * 0.10, COLORS.snake.stroke, 1);
  g.lineBetween(handX,  handY,  pipeCX, pipeTop);
  g.lineBetween(hand2X, hand2Y, pipeCX, pipeTop);
  g.lineStyle(cellSize * 0.07, COLORS.snake.body, 1);
  g.lineBetween(handX,  handY,  pipeCX, pipeTop);
  g.lineBetween(hand2X, hand2Y, pipeCX, pipeTop);
}

function drawPoop(x: number, y: number, poopRow: number, poopCol: number): void {
  const g = gridGraphics;
  const s = cellSize;
  const cx = x + s / 2;
  const cy = y + s / 2;

  // Is the snake moving nearby? Chebyshev distance ≤ 2 = shocked
  const snakeHead = gs.snake[0];
  const dist = Math.max(Math.abs(snakeHead.row - poopRow), Math.abs(snakeHead.col - poopCol));
  const shocked = gs.moving && dist <= 2;

  // Poop base layers (3 stacked ovals tapering)
  const layers = [
    { oy: s * 0.25, rx: s * 0.38, ry: s * 0.22 },
    { oy: s * 0.05, rx: s * 0.28, ry: s * 0.18 },
    { oy: -s * 0.14, rx: s * 0.18, ry: s * 0.14 },
  ];
  for (const { oy, rx, ry } of layers) {
    g.fillStyle(COLORS.poop.fill, 1);
    g.fillEllipse(cx, cy + oy, rx * 2, ry * 2);
  }
  // Swirl top
  g.fillStyle(COLORS.poop.shine, 1);
  g.fillCircle(cx, cy - s * 0.24, s * 0.1);
  // Shine
  g.fillStyle(0xffffff, 0.25);
  g.fillCircle(cx - s * 0.07, cy - s * 0.05, s * 0.06);

  // Eye tracking: look vector from poop centre toward snake head
  const { cx: sWX, cy: sWY } = cellCenter(snakeHead.row, snakeHead.col);
  const ldx = sWX - cx, ldy = sWY - cy;
  const llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
  const eyeTravel = s * 0.025; // max pupil travel
  const pox = (ldx / llen) * eyeTravel;
  const poy = (ldy / llen) * eyeTravel;

  const eyeY = cy + s * 0.05;
  if (shocked) {
    // ── Shocked expression: wide round eyes, straight brows, O-mouth, sweat drop ──
    // Wide white eyes
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - s * 0.11, eyeY, s * 0.09);
    g.fillCircle(cx + s * 0.11, eyeY, s * 0.09);
    // Small pupils tracking snake
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx - s * 0.11 + pox, eyeY + poy, s * 0.035);
    g.fillCircle(cx + s * 0.11 + pox, eyeY + poy, s * 0.035);
    // Straight alarmed eyebrows (horizontal lines)
    g.lineStyle(s * 0.025, 0x3a1a00, 1);
    g.lineBetween(cx - s * 0.17, eyeY - s * 0.12, cx - s * 0.05, eyeY - s * 0.12);
    g.lineBetween(cx + s * 0.05, eyeY - s * 0.12, cx + s * 0.17, eyeY - s * 0.12);
    // O-shaped open mouth
    g.fillStyle(0x3a1a00, 1);
    g.fillEllipse(cx, eyeY + s * 0.16, s * 0.14, s * 0.12);
    g.fillStyle(0x111111, 0.7);
    g.fillEllipse(cx, eyeY + s * 0.16, s * 0.09, s * 0.08);
    // Sweat drop on forehead
    const swY = cy - s * 0.32;
    g.fillStyle(0x88ccff, 0.9);
    g.fillCircle(cx + s * 0.14, swY, s * 0.055);
    g.fillTriangle(
      cx + s * 0.14 - s * 0.055, swY,
      cx + s * 0.14 + s * 0.055 * 0.3, swY,
      cx + s * 0.14, swY - s * 0.13,
    );
  } else {
    // ── Normal expression: calm eyes + smile ──
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - s * 0.1, eyeY, s * 0.07);
    g.fillCircle(cx + s * 0.1, eyeY, s * 0.07);
    g.fillStyle(0x222222, 1);
    g.fillCircle(cx - s * 0.1 + pox, eyeY + poy, s * 0.04);
    g.fillCircle(cx + s * 0.1 + pox, eyeY + poy, s * 0.04);
    // Smile
    g.lineStyle(2, 0x5a2a08, 1);
    g.arc(cx, eyeY + s * 0.06, s * 0.12, 0.2, Math.PI - 0.2);
    g.strokePath();
  }
}

// ─── VFX: Poop particle burst ────────────────────────────────────────────────────────────
/**
 * Fire a burst of poop-coloured particles from cell (row, col).
 * Each particle is a small circle that flies outward and fades.
 */
function spawnPoopBurst(row: number, col: number): void {
  const { cx, cy } = cellCenter(row, col);
  const COUNT = 18;
  const COLORS_POOP = [0x8B4513, 0x5a2a08, 0xb06030, 0x6b3410, 0xd4701a];

  for (let i = 0; i < COUNT; i++) {
    const angle  = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    // Much larger travel: 1.5–3× cellSize
    const speed  = cellSize * (1.5 + Math.random() * 1.5);
    // Larger particles: 12–28% of cellSize
    const radius = cellSize * (0.12 + Math.random() * 0.16);
    const color  = COLORS_POOP[Math.floor(Math.random() * COLORS_POOP.length)];

    const g = scene.add.graphics();
    g.setDepth(8);
    particleGraphics.push(g);

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const dummy = { t: 0 };
    scene.tweens.add({
      targets: dummy,
      t: 1,
      duration: 550 + Math.random() * 200,
      ease: 'Quad.easeOut',
      onUpdate: (_tween: Phaser.Tweens.Tween, _target: { t: number }, _key: string, current: number) => {
        if (!g.active) return;
        const px = cx + vx * current;
        const py = cy + vy * current;
        const alpha = 1 - current;
        const r = radius * (1 - current * 0.4);
        g.clear();
        g.fillStyle(color, alpha);
        g.fillCircle(px, py, r);
      },
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── VFX: Win water splash ───────────────────────────────────────────────────────────────
/**
 * Animate water-blue ellipses splashing in from the edges of the screen,
 * expanding and fading — like water sloshing when the toilet flushes.
 */
function spawnWinSplash(): void {
  // Each splash: start position (offscreen edge), target position (on screen), size
  const splashes = [
    { x: -120,              y: GAME_HEIGHT * 0.30, w: 340, h: 160, tx: GAME_WIDTH * 0.18,  ty: GAME_HEIGHT * 0.35 },
    { x: GAME_WIDTH + 120,  y: GAME_HEIGHT * 0.22, w: 380, h: 140, tx: GAME_WIDTH * 0.80,  ty: GAME_HEIGHT * 0.28 },
    { x: -120,              y: GAME_HEIGHT * 0.52, w: 300, h: 170, tx: GAME_WIDTH * 0.20,  ty: GAME_HEIGHT * 0.50 },
    { x: GAME_WIDTH + 120,  y: GAME_HEIGHT * 0.58, w: 360, h: 150, tx: GAME_WIDTH * 0.78,  ty: GAME_HEIGHT * 0.55 },
    { x: GAME_WIDTH * 0.5,  y: -120,               w: 420, h: 130, tx: GAME_WIDTH * 0.50,  ty: GAME_HEIGHT * 0.18 },
    { x: GAME_WIDTH * 0.25, y: GAME_HEIGHT + 120,  w: 320, h: 160, tx: GAME_WIDTH * 0.28,  ty: GAME_HEIGHT * 0.72 },
    { x: GAME_WIDTH * 0.75, y: GAME_HEIGHT + 120,  w: 350, h: 145, tx: GAME_WIDTH * 0.70,  ty: GAME_HEIGHT * 0.68 },
  ];

  const WATER_COLORS = [0xa8d8f0, 0x5bb8e8, 0x2a8acd, 0xd0eefb];

  splashes.forEach((s, idx) => {
    const delay = idx * 90;
    const g = scene.add.graphics();
    g.setDepth(9);
    // No setAlpha(0) — alpha is controlled entirely through fillStyle
    particleGraphics.push(g);

    const color = WATER_COLORS[idx % WATER_COLORS.length];

    // Phase 1: fly in from edge to target (380 ms)
    const d1 = { v: 0 };
    scene.tweens.add({
      targets: d1,
      v: 1,
      duration: 380,
      delay,
      ease: 'Back.easeOut',
      onUpdate: (_tw: Phaser.Tweens.Tween, _tgt: typeof d1, _k: string, v: number) => {
        if (!g.active) return;
        const curX = s.x + (s.tx - s.x) * v;
        const curY = s.y + (s.ty - s.y) * v;
        const curW = s.w * (0.4 + v * 0.6);
        const curH = s.h * (0.4 + v * 0.6);
        g.clear();
        g.fillStyle(color, 0.88 * Math.min(v * 2, 1)); // fade in fast
        g.fillEllipse(curX, curY, curW, curH);
        g.fillStyle(0xffffff, 0.35 * Math.min(v * 2, 1));
        g.fillEllipse(curX - curW * 0.15, curY - curH * 0.22, curW * 0.45, curH * 0.38);
      },
      onComplete: () => {
        if (!g.active) return;
        // Phase 2: expand outward and fade away (500 ms)
        const d2 = { v: 0 };
        scene.tweens.add({
          targets: d2,
          v: 1,
          duration: 500,
          ease: 'Quad.easeIn',
          onUpdate: (_tw: Phaser.Tweens.Tween, _tgt: typeof d2, _k: string, v: number) => {
            if (!g.active) return;
            const curW = s.w * (1 + v * 1.0);
            const curH = s.h * (1 + v * 0.6);
            g.clear();
            g.fillStyle(color, 0.88 * (1 - v));
            g.fillEllipse(s.tx, s.ty, curW, curH);
            g.fillStyle(0xffffff, 0.35 * (1 - v));
            g.fillEllipse(s.tx - curW * 0.15, s.ty - curH * 0.22, curW * 0.45, curH * 0.38);
          },
          onComplete: () => { if (g.active) g.destroy(); },
        });
      },
    });
  });
}

/**
 * Layout: two columns inside the bottom strip.
 *
 * Left column  — compact keyboard-style D-pad:
 *   Row 0 (top) :  [UP / W]
 *   Row 1 (bot) :  [LEFT / A]  [DOWN / S]  [RIGHT / D]
 *
 * Right column — stacked util buttons:
 *   [↺ RESET]
 *   [↩ UNDO]
 *   [💡 HINT]
 *
 * The strip sits from (GAME_HEIGHT - GRID_BOTTOM_MARGIN) to GAME_HEIGHT.
 * All positions are computed so nothing overlaps the grid above.
 */
function buildControls(sc: Phaser.Scene): void {
  const STRIP_TOP = GAME_HEIGHT - GRID_BOTTOM_MARGIN;
  const STRIP_H   = GRID_BOTTOM_MARGIN;

  // ── D-pad dimensions ────────────────────────────────────────────────────────
  const BTN  = 90;   // arrow button square size
  const GAP  = 6;    // gap between arrow buttons

  // D-pad cluster size: 3 cols × 1 row (bottom) + 1 key top-centre
  const clusterW = BTN * 3 + GAP * 2;          // 3 buttons wide
  const clusterH = BTN * 2 + GAP;              // 2 buttons tall

  // Left column: centre of d-pad cluster
  const dpadCX = GAME_WIDTH * 0.26;
  const dpadCY = STRIP_TOP + (STRIP_H - clusterH) / 2 + clusterH / 2;

  // Row centres
  const row0Y = dpadCY - BTN / 2 - GAP / 2 - BTN / 2;  // top row (UP)
  const row1Y = dpadCY + BTN / 2 + GAP / 2 - BTN / 2 + BTN / 2; // bottom row

  // Actually: simpler arithmetic —
  // top of cluster = dpadCY - clusterH/2
  // row0 centre = topOfCluster + BTN/2
  // row1 centre = topOfCluster + BTN + GAP + BTN/2
  const clusterTop = dpadCY - clusterH / 2;
  const upY   = clusterTop + BTN / 2;
  const botY  = clusterTop + BTN + GAP + BTN / 2;
  const leftX  = dpadCX - BTN - GAP;
  const centX  = dpadCX;
  const rightX = dpadCX + BTN + GAP;

  makeArrowBtn(sc, centX,  upY,  BTN, '▲', '(W)', 'up');
  makeArrowBtn(sc, leftX,  botY, BTN, '◀', '(A)', 'left');
  makeArrowBtn(sc, centX,  botY, BTN, '▼', '(S)', 'down');
  makeArrowBtn(sc, rightX, botY, BTN, '▶', '(D)', 'right');

  // ── Util buttons (right column) ─────────────────────────────────────────────
  const utilW  = 160;
  const utilH  = 64;
  const utilGap = 14;
  const utilX  = GAME_WIDTH * 0.73;

  // 3 buttons stacked, vertically centred in strip
  const stackH   = utilH * 3 + utilGap * 2;
  const stackTop = STRIP_TOP + (STRIP_H - stackH) / 2;
  const utilY0   = stackTop + utilH / 2;
  const utilY1   = utilY0 + utilH + utilGap;
  const utilY2   = utilY1 + utilH + utilGap;

  makeUtilBtn(sc, utilX, utilY0, utilW, utilH, '↺ RESET', 0x7a3a1a, 0x5a2a0a, doReset);
  makeUtilBtn(sc, utilX, utilY1, utilW, utilH, '↩ UNDO',  0x1a4a7a, 0x0a3a5a, doUndo);
  makeUtilBtn(sc, utilX, utilY2, utilW, utilH, '💡 HINT', 0x5a3a7a, 0x3a1a5a, doHint);
}

function makeUtilBtn(
  sc: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, fillColor: number, strokeColor: number, onClick: () => void,
): void {
  const bg = sc.add.graphics();
  const draw = (pressed: boolean) => {
    bg.clear();
    bg.fillStyle(pressed ? (fillColor + 0x222222) : fillColor, 1);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    bg.lineStyle(2, strokeColor, 1);
    bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
  };
  draw(false);
  sc.add.text(x, y, label, { ...TEXT_STYLES.button, fontSize: '28px' }).setOrigin(0.5);
  const zone = sc.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => { draw(true);  onClick(); });
  zone.on('pointerup',   () => { draw(false); });
  zone.on('pointerout',  () => { draw(false); });
}

function makeArrowBtn(sc: Phaser.Scene, x: number, y: number, size: number, label: string, hint: string, dir: Direction): void {
  const bg = sc.add.graphics();
  const drawBg = (pressed: boolean) => {
    bg.clear();
    bg.fillStyle(pressed ? COLORS.button.active : COLORS.button.fill, 1);
    bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
    bg.lineStyle(2, COLORS.button.stroke, 1);
    bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);
  };
  drawBg(false);

  // Arrow glyph — shifted slightly above centre to leave room for hint text
  sc.add.text(x, y - size * 0.10, label, { ...TEXT_STYLES.button, fontSize: '36px' }).setOrigin(0.5);

  // Small keyboard hint below the arrow
  sc.add.text(x, y + size * 0.26, hint, {
    fontSize: '18px',
    fontFamily: 'Arial',
    color: '#aaccff',
  }).setOrigin(0.5);

  // Invisible hit zone
  const zone = sc.add.zone(x, y, size, size).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => { drawBg(true);  handleDirInput(dir); });
  zone.on('pointerup',   () => { drawBg(false); });
  zone.on('pointerout',  () => { drawBg(false); });
}

// ─── Input Handler ────────────────────────────────────────────────────────────

function doReset(): void {
  if (gs.moving) return; // wait for slide to finish
  // Replay the SAME level layout (don't re-generate)
  if (currentLevelData) {
    gs = buildState(currentLevelData, currentLevel);
    currentSolution = currentLevelData.solution;
    if (hintOverlay) { hintOverlay.destroy(); hintOverlay = null; }
    msgText.setAlpha(0).setText('');
    stepTimer = 0;
    currentStepDelay = STEP_DELAY;
    stateHistory = [];
    queuedDir = null;
    rewindCells = [];
    rewindTargetState = null;
    lastCompletedDir = null;
    scene.tweens.killTweensOf(msgText);
    overlayGroup.clear(true, true);
    drawGrid();
    drawSnake();
  } else {
    loadLevel(currentLevel);
  }
}

function doUndo(): void {
  if (gs.moving || rewindCells.length > 0) return; // busy
  if (stateHistory.length === 0) return;

  // Determine the target state after undo
  stateHistory.pop();
  const target = stateHistory.length > 0
    ? { ...stateHistory[stateHistory.length - 1] }
    : buildState(currentLevelData!, currentLevel);

  // Update lastCompletedDir to the direction of the new top of stack,
  // so chained reverse-direction undos keep working.
  lastCompletedDir = stateHistory.length > 0
    ? stateHistory[stateHistory.length - 1].direction
    : null;

  // Build the rewind cell sequence:
  // Current snake has grown beyond target snake. We need to retract the
  // cells that were added during the last move — i.e. the head cells of
  // the current snake that are NOT in the target snake.
  const targetKeys = new Set(target.snake.map(c => `${c.row},${c.col}`));
  const addedCells = gs.snake.filter(c => !targetKeys.has(`${c.row},${c.col}`));

  if (addedCells.length === 0) {
    // Nothing to animate — just snap
    sfxBupRewind();
    gs = target;
    drawGrid();
    drawSnake();
    return;
  }

  // The rewind sequence starts from the full current snake and removes
  // one head cell per frame until it reaches the target snake length.
  // We only animate the cells that were added by the last move.
  sfxBupRewind();
  rewindTargetState = target;
  rewindCells = [...gs.snake]; // starts at current, shrinks to target length
  stepTimer = 0;
  currentStepDelay = STEP_DELAY_UNDO;

  // Redraw grid now so poops that may reappear are shown during rewind
  // (use target state for poop visibility)
  const savedGs = gs;
  gs = target;
  drawGrid();
  gs = savedGs;

  scene.tweens.killTweensOf(msgText);
  msgText.setAlpha(0);
}

function doHint(): void {
  if (gs.moving) return;

  // Toggle: tap again to dismiss
  if (hintOverlay) {
    hintOverlay.destroy();
    hintOverlay = null;
    return;
  }

  // Map direction to arrow glyph
  const arrow: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
  const steps = currentSolution.map((d, i) => `${i + 1}. ${arrow[d]}`).join('   ');
  const label = `Solution (${currentSolution.length} moves):\n${steps}`;

  // Panel dimensions
  const panW = GAME_WIDTH - 80;
  const panH = 160;
  const panX = GAME_WIDTH / 2;
  const panY = gridOffsetY - cellSize - panH / 2 - 12;  // just above toilet

  const bg = scene.make.graphics();
  bg.fillStyle(0x1a0a2e, 0.92);
  bg.fillRoundedRect(-panW / 2, -panH / 2, panW, panH, 16);
  bg.lineStyle(2, 0x9966cc, 1);
  bg.strokeRoundedRect(-panW / 2, -panH / 2, panW, panH, 16);

  const txt = scene.add.text(0, 0, label, {
    fontSize: '30px',
    fontFamily: 'Arial',
    color: '#eeddff',
    align: 'center',
    wordWrap: { width: panW - 32 },
  }).setOrigin(0.5);

  hintOverlay = scene.add.container(panX, panY, [bg, txt]);
  hintOverlay.setSize(panW, panH);
  hintOverlay.setDepth(30);

  // Close on tap
  hintOverlay.setInteractive();
  hintOverlay.on('pointerdown', () => {
    if (hintOverlay) { hintOverlay.destroy(); hintOverlay = null; }
  });
}

function handleDirInput(dir: Direction): void {
  if (!gs || gs.won || gs.lost) return;
  // Dismiss hint on any input
  if (hintOverlay) { hintOverlay.destroy(); hintOverlay = null; }

  // Pressing the reverse of the last completed direction triggers undo
  const reverse: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (!gs.moving && rewindCells.length === 0 &&
      lastCompletedDir !== null && dir === reverse[lastCompletedDir] &&
      stateHistory.length > 0) {
    doUndo();
    return;
  }

  if (gs.moving) {
    // Buffer the input — will be applied when current slide ends
    queuedDir = dir;
  } else {
    // Idle: check whether this direction will actually move the snake
    const { passed } = simulateSlide(
      gs.grid, gs.rows, gs.cols,
      gs.snake[0], gs.snake, dir, gs.toiletCol,
    );
    if (passed.length === 0) {
      // Immediately blocked — thud, no movement
      sfxThud();
    } else {
      // Will move — first step bup fires in the update loop per-step
    }
    queuedDir = null;
    gs = applyDirection(gs, dir);
    stepTimer = 0;
  }
}

// ─── Overlay / Messages ───────────────────────────────────────────────────────

// 90s Engrish celebration phrases
const ENGRISH_PHRASES: string[] = [
  "YOU ARE WIN! TOILET IS GRATEFUL!",
  "GREAT! THE POOP HAVE GONE!",
  "CONGRATURATION! YOU BUSTED THE TURDS!",
  "ALL YOUR POOP ARE BELONG TO US.",
  "A WINNER IS YOU! VERY GOOD FLUSH!",
  "SOMEONE SET UP US THE PLUNGER!",
  "MOVE ZIG! FOR GREAT HYGIENE!",
  "YOU ARE MOST EXCELLENT TURD BUSTER!",
  "GRORIOUS! POOP HAS BEEN EXTERMINATE!",
  "WOW! YOU ARE SUPER TOILET HERO!",
  "TOILET IS PLEASED WITH YOUR EFFORT!",
  "SO MANY FLUSH! MUCH CONGRATULATE!",
  "YOU HAVE BEAT THE POOP VERY MUCH!",
  "NICE JOB! SMELL IS LEAVE THIS AREA!",
  "STAGE IS CLEAR! TURD IS REGRET!",
];

/**
 * Build SF2-style layered text directly in the game scene.
 * Returns all created Text objects so they can be added to a container.
 */
function makeSF2Texts(
  sc: Phaser.Scene,
  text: string, cx: number, cy: number,
  faceColor: string, shadowColor: string,
  fontSize: string, depth: number,
): Phaser.GameObjects.Text[] {
  const STROKE = 16;
  const SDX = 6, SDY = 7;
  const base = { fontFamily: 'Arial Black, Impact, Arial', fontStyle: 'italic' };
  const t1 = sc.add.text(cx + SDX + 2, cy + SDY + 2, text, {
    ...base, fontSize, color: '#000000', stroke: '#000000', strokeThickness: STROKE + 4,
  }).setOrigin(0.5).setDepth(depth);
  const t2 = sc.add.text(cx + SDX, cy + SDY, text, {
    ...base, fontSize, color: shadowColor, stroke: '#000000', strokeThickness: STROKE,
  }).setOrigin(0.5).setDepth(depth + 0.1);
  const t3 = sc.add.text(cx, cy, text, {
    ...base, fontSize, color: faceColor, stroke: '#000000', strokeThickness: STROKE,
  }).setOrigin(0.5).setDepth(depth + 0.2);
  const t4 = sc.add.text(cx, cy - 3, text, {
    ...base, fontSize, color: '#ffffff', stroke: '#ffffff', strokeThickness: 2,
  }).setOrigin(0.5, 1).setDepth(depth + 0.3).setAlpha(0.22);
  return [t1, t2, t3, t4];
}

/** Show the SF2-style "TOILET CLEAR" overlay with a random Engrish subtitle. */
function showWinOverlay(onDone: () => void): void {
  if (winOverlay) { winOverlay.destroy(); winOverlay = null; }

  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const DEPTH = 25;

  // Dark semi-transparent panel
  const panel = scene.add.graphics();
  panel.fillStyle(0x000000, 0.62);
  panel.fillRect(0, cy - 220, GAME_WIDTH, 440);
  panel.setDepth(DEPTH - 1);

  // SF2-style "TOILET" (gold) and "CLEAR" (electric blue) stacked
  const toiletTexts = makeSF2Texts(scene, 'TOILET', cx, cy - 100,
    '#ffdd22', '#aa6600', '110px', DEPTH);
  const clearTexts  = makeSF2Texts(scene, 'CLEAR',  cx, cy + 20,
    '#44ccff', '#0044aa', '110px', DEPTH);

  // Random Engrish subtitle
  const phrase = ENGRISH_PHRASES[Math.floor(Math.random() * ENGRISH_PHRASES.length)];
  const sub = scene.add.text(cx, cy + 130, phrase, {
    fontSize: '28px',
    fontFamily: 'Arial, sans-serif',
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 5,
    align: 'center',
    wordWrap: { width: GAME_WIDTH - 80 },
  }).setOrigin(0.5, 0).setDepth(DEPTH + 1);

  // Collect everything for group alpha tween
  const all: Phaser.GameObjects.GameObject[] = [
    panel, sub, ...toiletTexts, ...clearTexts,
  ];

  // Store in container-like structure for cleanup
  // We use a Group (not Container) to avoid coordinate-space issues with
  // independently-positioned text objects.
  winOverlay = scene.add.container(0, 0);
  // Container holds nothing spatially — we just use it as a lifecycle handle.
  // Set alpha on each object individually via tweens.

  // Start invisible
  all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0));

  // Fade in
  scene.tweens.add({
    targets: all,
    alpha: 1,
    duration: 350,
    ease: 'Quad.easeOut',
    onComplete: () => {
      // Hold, then fade out
      scene.time.delayedCall(1800, () => {
        scene.tweens.add({
          targets: all,
          alpha: 0,
          duration: 350,
          ease: 'Quad.easeIn',
          onComplete: () => {
            all.forEach(o => (o as Phaser.GameObjects.GameObject).destroy());
            if (winOverlay) { winOverlay.destroy(); winOverlay = null; }
            onDone();
          },
        });
      });
    },
  });
}

function showMessage(text: string, color: number, onDone: () => void): void {
  const hexStr = '#' + color.toString(16).padStart(6, '0');
  msgText.setText(text).setColor(hexStr).setAlpha(0).setDepth(20);

  scene.tweens.add({
    targets: msgText,
    alpha: 1,
    duration: 300,
    yoyo: false,
    onComplete: () => {
      scene.time.delayedCall(1200, () => {
        scene.tweens.add({
          targets: msgText,
          alpha: 0,
          duration: 300,
          onComplete: () => onDone(),
        });
      });
    },
  });
}

// ─── Title Scene ─────────────────────────────────────────────────────────────

class TitleScene extends Phaser.Scene {
  private poops: Array<{ x: number; y: number; vy: number; vx: number; rot: number; vr: number; scale: number }> = [];
  private btnGfx!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'Title' }); }

  // ── SF2-style word: thick black plate shadow + coloured face + white top edge ──
  private addSF2Word(
    text: string, cx: number, cy: number,
    faceColor: string, shadowColor: string, fontSize: string, depth: number,
  ): Phaser.GameObjects.Text {
    const STROKE = 18;
    const SDX = 7, SDY = 8;   // shadow plate offset
    // 1. Black outer stroke (furthest back)
    this.add.text(cx + SDX + 2, cy + SDY + 2, text, {
      fontSize, fontFamily: 'Arial Black, Impact, Arial',
      fontStyle: 'italic',
      color: '#000000', stroke: '#000000', strokeThickness: STROKE + 4,
    }).setOrigin(0.5).setDepth(depth);
    // 2. Coloured shadow plate (gives SF2 "extruded" depth)
    this.add.text(cx + SDX, cy + SDY, text, {
      fontSize, fontFamily: 'Arial Black, Impact, Arial',
      fontStyle: 'italic',
      color: shadowColor, stroke: '#000000', strokeThickness: STROKE,
    }).setOrigin(0.5).setDepth(depth + 0.1);
    // 3. Main coloured face
    const face = this.add.text(cx, cy, text, {
      fontSize, fontFamily: 'Arial Black, Impact, Arial',
      fontStyle: 'italic',
      color: faceColor, stroke: '#000000', strokeThickness: STROKE,
    }).setOrigin(0.5).setDepth(depth + 0.2);
    // 4. White highlight line (top-edge shine)
    this.add.text(cx, cy - 3, text, {
      fontSize, fontFamily: 'Arial Black, Impact, Arial',
      fontStyle: 'italic',
      color: '#ffffff', stroke: '#ffffff', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(depth + 0.3).setAlpha(0.22);
    return face;
  }

  // ── Draw the title art: turd impaled by auger, poop particles ──────────────
  private drawTitleArt(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Perspective: auger enters from lower-left, tip points upper-right.
    // Angle ~35° from horizontal.
    const ANG   = -0.62;          // radians (~-35°)
    const cosA  = Math.cos(ANG);
    const sinA  = Math.sin(ANG);

    // ── Auger cable body (enters from lower-left off-screen) ──────────────
    const cableLen = 560;
    const cableW   = 36;
    // tail end (lower-left, behind turd)
    const tx0 = cx - cosA * cableLen * 0.55;
    const ty0 = cy - sinA * cableLen * 0.55;
    // tip end (upper-right, beyond turd)
    const tx1 = cx + cosA * cableLen * 0.45;
    const ty1 = cy + sinA * cableLen * 0.45;

    // Cable dark stroke
    g.lineStyle(cableW + 10, COLORS.snake.stroke, 1);
    g.lineBetween(tx0, ty0, tx1, ty1);
    // Cable grey fill
    g.lineStyle(cableW, COLORS.snake.body, 1);
    g.lineBetween(tx0, ty0, tx1, ty1);

    // Diagonal ridge lines along cable (draw after body)
    const perp = { x: -sinA, y: cosA };
    const ridgeSpacing = 28;
    const ridgeCount = Math.floor(cableLen / ridgeSpacing);
    g.lineStyle(6, COLORS.snake.ridge, 0.65);
    for (let i = 0; i < ridgeCount; i++) {
      const t   = i / ridgeCount;
      const mx  = tx0 + (tx1 - tx0) * t;
      const my  = ty0 + (ty1 - ty0) * t;
      const hw  = cableW * 0.48;
      const sl  = hw * 0.65; // slant along axis
      g.lineBetween(
        mx + perp.x * hw  - cosA * sl, my + perp.y * hw  - sinA * sl,
        mx - perp.x * hw  + cosA * sl, my - perp.y * hw  + sinA * sl,
      );
    }

    // ── Auger tip (cone pointing upper-right toward viewer) ──────────────
    // We fake 3/4 perspective: draw collar as an ellipse, cone as tapered shape
    const tipX = tx1 + cosA * 20;
    const tipY = ty1 + sinA * 20;
    const collarR = cableW * 0.62;
    // Collar disc (foreshortened: ellipse)
    g.fillStyle(COLORS.snake.stroke, 1);
    g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.4, collarR * 1.0);
    g.fillStyle(COLORS.snake.body, 1);
    g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.1, collarR * 0.85);
    // Cone body (tapers to a point)
    const coneLen = 90;
    const tipPt   = { x: tipX + cosA * coneLen, y: tipY + sinA * coneLen };
    g.fillStyle(COLORS.snake.stroke, 1);
    g.fillPoints([
      { x: tipX + perp.x * collarR,  y: tipY + perp.y * collarR  },
      { x: tipX - perp.x * collarR,  y: tipY - perp.y * collarR  },
      { x: tipPt.x,                   y: tipPt.y                   },
    ], true, true);
    g.fillStyle(COLORS.snake.body, 1);
    g.fillPoints([
      { x: tipX + perp.x * (collarR - 5),  y: tipY + perp.y * (collarR - 5)  },
      { x: tipX - perp.x * (collarR - 5),  y: tipY - perp.y * (collarR - 5)  },
      { x: tipPt.x - cosA * 6,              y: tipPt.y - sinA * 6              },
    ], true, true);
    // Flute lines on cone
    g.lineStyle(3, COLORS.snake.ridge, 0.8);
    for (let f = 1; f < 4; f++) {
      const tf  = f / 4;
      const fx  = tipX + cosA * coneLen * tf;
      const fy  = tipY + sinA * coneLen * tf;
      const hw  = collarR * (1 - tf) + 1;
      g.lineBetween(
        fx + perp.x * hw + cosA * hw * 0.5,
        fy + perp.y * hw + sinA * hw * 0.5,
        fx - perp.x * hw - cosA * hw * 0.5,
        fy - perp.y * hw - sinA * hw * 0.5,
      );
    }
    // Silver tip
    g.fillStyle(COLORS.snake.tip, 1);
    g.fillCircle(tipPt.x, tipPt.y, 7);

    // ── TURD shape (centred at cx, cy — impaled on the cable) ─────────────
    // Draw turd AFTER the tail section of cable but BEFORE the tip section.
    // We layer it: back half of cable, turd, front half of cable + tip.
    // (Graphics draws in order — we redraw the front segment on top.)
    const turdR = 72;  // rough radius
    // Base blob (3 stacked ovals)
    const layers = [
      { oy:  turdR * 0.35, rx: turdR * 0.92, ry: turdR * 0.58 },
      { oy:  turdR * 0.05, rx: turdR * 0.72, ry: turdR * 0.50 },
      { oy: -turdR * 0.32, rx: turdR * 0.50, ry: turdR * 0.42 },
    ];
    for (const { oy, rx, ry } of layers) {
      // Dark outline
      g.fillStyle(0x3a1a00, 1);
      g.fillEllipse(cx, cy + oy, rx * 2 + 8, ry * 2 + 8);
      g.fillStyle(COLORS.poop.fill, 1);
      g.fillEllipse(cx, cy + oy, rx * 2, ry * 2);
    }
    // Swirl top knot
    g.fillStyle(0x3a1a00, 1);
    g.fillCircle(cx, cy - turdR * 0.62, turdR * 0.30 + 3);
    g.fillStyle(COLORS.poop.shine, 1);
    g.fillCircle(cx, cy - turdR * 0.62, turdR * 0.30);
    g.fillStyle(0x3a1a00, 1);
    g.fillCircle(cx + turdR * 0.08, cy - turdR * 0.88, turdR * 0.20 + 2);
    g.fillStyle(COLORS.poop.fill, 1);
    g.fillCircle(cx + turdR * 0.08, cy - turdR * 0.88, turdR * 0.20);
    // Shine highlight
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(cx - turdR * 0.25, cy - turdR * 0.12, turdR * 0.16);
    // Cartoon eyes (horrified expression)
    const eyeY = cy + turdR * 0.05;
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx - turdR * 0.28, eyeY, turdR * 0.30, turdR * 0.36);
    g.fillEllipse(cx + turdR * 0.28, eyeY, turdR * 0.30, turdR * 0.36);
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx - turdR * 0.26, eyeY + turdR * 0.04, turdR * 0.11);
    g.fillCircle(cx + turdR * 0.26, eyeY + turdR * 0.04, turdR * 0.11);
    // Eye shines
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - turdR * 0.22, eyeY - turdR * 0.04, turdR * 0.045);
    g.fillCircle(cx + turdR * 0.30, eyeY - turdR * 0.04, turdR * 0.045);
    // Zig-zag scream mouth
    g.lineStyle(4, 0x3a1a00, 1);
    const mouthY = cy + turdR * 0.30;
    const mouthPoints = [
      { x: cx - turdR * 0.28, y: mouthY },
      { x: cx - turdR * 0.14, y: mouthY + turdR * 0.14 },
      { x: cx,                 y: mouthY },
      { x: cx + turdR * 0.14, y: mouthY + turdR * 0.14 },
      { x: cx + turdR * 0.28, y: mouthY },
    ];
    g.strokePoints(mouthPoints, false, false);

    // ── Redraw the FRONT half of cable on top of the turd ─────────────────
    // (from just past centre-point to the tip region, before the cone)
    const fStart = { x: cx - cosA * 12, y: cy - sinA * 12 };
    g.lineStyle(cableW + 10, COLORS.snake.stroke, 1);
    g.lineBetween(fStart.x, fStart.y, tipX, tipY);
    g.lineStyle(cableW, COLORS.snake.body, 1);
    g.lineBetween(fStart.x, fStart.y, tipX, tipY);
    // Ridges on front half only
    g.lineStyle(6, COLORS.snake.ridge, 0.65);
    const frontLen = Math.sqrt((tipX - fStart.x) ** 2 + (tipY - fStart.y) ** 2);
    const frontRidges = Math.floor(frontLen / ridgeSpacing);
    for (let i = 0; i <= frontRidges; i++) {
      const tf  = i / Math.max(frontRidges, 1);
      const mx  = fStart.x + (tipX - fStart.x) * tf;
      const my  = fStart.y + (tipY - fStart.y) * tf;
      const hw  = cableW * 0.48;
      const sl  = hw * 0.65;
      g.lineBetween(
        mx + perp.x * hw  - cosA * sl, my + perp.y * hw  - sinA * sl,
        mx - perp.x * hw  + cosA * sl, my - perp.y * hw  + sinA * sl,
      );
    }
    // Redraw collar + cone + tip on top
    g.fillStyle(COLORS.snake.stroke, 1);
    g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.4, collarR * 1.0);
    g.fillStyle(COLORS.snake.body, 1);
    g.fillEllipse(tipX - cosA * 4, tipY - sinA * 4, collarR * 2.1, collarR * 0.85);
    g.fillStyle(COLORS.snake.stroke, 1);
    g.fillPoints([
      { x: tipX + perp.x * collarR,       y: tipY + perp.y * collarR  },
      { x: tipX - perp.x * collarR,       y: tipY - perp.y * collarR  },
      { x: tipPt.x,                         y: tipPt.y                  },
    ], true, true);
    g.fillStyle(COLORS.snake.body, 1);
    g.fillPoints([
      { x: tipX + perp.x * (collarR - 5), y: tipY + perp.y * (collarR - 5) },
      { x: tipX - perp.x * (collarR - 5), y: tipY - perp.y * (collarR - 5) },
      { x: tipPt.x - cosA * 6,             y: tipPt.y - sinA * 6            },
    ], true, true);
    g.lineStyle(3, COLORS.snake.ridge, 0.8);
    for (let f = 1; f < 4; f++) {
      const tf  = f / 4;
      const fx  = tipX + cosA * coneLen * tf;
      const fy  = tipY + sinA * coneLen * tf;
      const hw  = collarR * (1 - tf) + 1;
      g.lineBetween(
        fx + perp.x * hw + cosA * hw * 0.5,
        fy + perp.y * hw + sinA * hw * 0.5,
        fx - perp.x * hw - cosA * hw * 0.5,
        fy - perp.y * hw - sinA * hw * 0.5,
      );
    }
    g.fillStyle(COLORS.snake.tip, 1);
    g.fillCircle(tipPt.x, tipPt.y, 7);
    // Tip glow
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(tipPt.x, tipPt.y, 4);

    // ── Poop particle splatter (radially from turd, biased upper-right) ────
    const splatterSeed = rng(77);
    const particles = [
      // angle (rad from right), dist, radius, alpha
      { a: -1.1, d: 150, r: 22, al: 1.0 },
      { a: -0.5, d: 200, r: 18, al: 0.95 },
      { a: -1.6, d: 130, r: 16, al: 0.9 },
      { a: -0.2, d: 220, r: 14, al: 0.85 },
      { a: -2.0, d: 110, r: 20, al: 0.9 },
      { a: -0.8, d: 170, r: 12, al: 0.8 },
      { a:  0.1, d: 250, r: 10, al: 0.75 },
      { a: -1.3, d: 260, r: 8,  al: 0.7 },
      { a: -2.3, d: 90,  r: 14, al: 0.85 },
      { a: -0.35,d: 310, r: 7,  al: 0.6 },
      { a:  0.3, d: 190, r: 9,  al: 0.7 },
      { a: -2.6, d: 75,  r: 18, al: 0.9 },
    ];
    for (const pt of particles) {
      const px = cx + Math.cos(pt.a) * pt.d;
      const py = cy + Math.sin(pt.a) * pt.d;
      // Dark outline blob
      g.fillStyle(0x3a1a00, pt.al);
      g.fillCircle(px, py, pt.r + 3);
      g.fillStyle(COLORS.poop.fill, pt.al);
      g.fillCircle(px, py, pt.r);
      // Small shine
      if (pt.r >= 12) {
        g.fillStyle(0xffffff, 0.18);
        g.fillCircle(px - pt.r * 0.28, py - pt.r * 0.28, pt.r * 0.28);
      }
    }
    // Splatter streaks
    g.lineStyle(5, 0x5a2a08, 0.5);
    const streaks = [
      { a: -0.4, d0: 80,  d1: 195 },
      { a: -1.0, d0: 85,  d1: 140 },
      { a: -1.8, d0: 80,  d1: 120 },
      { a:  0.2, d0: 80,  d1: 240 },
    ];
    for (const sk of streaks) {
      g.lineBetween(
        cx + Math.cos(sk.a) * sk.d0, cy + Math.sin(sk.a) * sk.d0,
        cx + Math.cos(sk.a) * sk.d1, cy + Math.sin(sk.a) * sk.d1,
      );
    }
  }

  create(): void {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0020, 0x0a0020, 0x1a0a3a, 0x1a0a3a, 1);
    bg.fillRect(0, 0, W, H);

    // Subtle pipe grid
    const grid = this.add.graphics();
    grid.lineStyle(2, 0x2a1a4a, 0.35);
    for (let x = 0; x < W; x += 70) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 70) grid.lineBetween(0, y, W, y);

    // Floating poop emojis (background decoration)
    const poopEmojis: Phaser.GameObjects.Text[] = [];
    const rand = rng(42);
    for (let i = 0; i < 14; i++) {
      const px = rand() * W;
      const py = rand() * H;
      const scale = 0.6 + rand() * 1.0;
      const t = this.add.text(px, py, '💩', {
        fontSize: `${Math.round(60 * scale)}px`,
      }).setOrigin(0.5).setAlpha(0.12 + rand() * 0.12).setDepth(1);
      poopEmojis.push(t);
      this.poops.push({
        x: px, y: py,
        vx: (rand() - 0.5) * 0.4,
        vy: -(0.3 + rand() * 0.5),
        rot: rand() * Math.PI * 2,
        vr: (rand() - 0.5) * 0.012,
        scale,
      });
    }

    // Shared graphics layer for animated elements
    this.gfx = this.add.graphics().setDepth(2);

    // ── SUPER TURD BUSTERS title — SF2 Capcom style, one word per line ──────
    // Three stacked words. Vertical centre of the block sits at ~28% down.
    // Word heights (approximate at chosen font sizes):
    //   SUPER   ~100px  fontSize 96px
    //   TURD    ~130px  fontSize 128px
    //   BUSTERS ~110px  fontSize 108px
    // Gap between words: 18px.  Total block ≈ 376px tall.
    const titleBlockCY = H * 0.255;  // centre of entire 3-word block
    const superY   = titleBlockCY - 148;
    const turdY    = titleBlockCY + 10;
    const bustersY = titleBlockCY + 158;

    // SUPER — electric blue, dark-blue shadow plate
    const superWord = this.addSF2Word('SUPER',   W * 0.5, superY,   '#44ccff', '#0033aa', '96px',  4);
    // TURD — sludge brown/gold, dark-brown shadow
    const turdWord  = this.addSF2Word('TURD',    W * 0.5, turdY,    '#ddaa22', '#7a3a00', '128px', 4);
    // BUSTERS — hot red/orange, dark-red shadow (like SF2 logo red)
    const bustersWord = this.addSF2Word('BUSTERS', W * 0.5, bustersY, '#ff4422', '#8a1100', '108px', 4);

    this.titleText = turdWord;

    // Subtle staggered bob tween — each word bobs slightly out of phase
    const bobAmp = 12;
    this.tweens.add({ targets: superWord,   y: superY   - bobAmp, duration: 1100, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 0 });
    this.tweens.add({ targets: turdWord,    y: turdY    - bobAmp, duration: 1100, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 180 });
    this.tweens.add({ targets: bustersWord, y: bustersY - bobAmp, duration: 1100, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 360 });

    // ── Title art: turd impaled by auger ────────────────────────────────────
    const artGfx = this.add.graphics().setDepth(3);
    this.drawTitleArt(artGfx, W * 0.5, H * 0.60);

    // ── TAP TO PLAY button ──────────────────────────────────────────────────
    const btnY = H * 0.80;
    const btnW = 480, btnH = 110;

    this.btnGfx = this.add.graphics().setDepth(5);
    this.drawBtn(false);

    const btnText = this.add.text(W * 0.5, btnY, 'TAP TO PLAY', {
      fontSize: '60px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#0a0a2a',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(6);

    // Pulse tween on button
    this.tweens.add({
      targets: btnText,
      scaleX: 1.06, scaleY: 1.06,
      duration: 700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // ── Credits/version line ────────────────────────────────────────────────
    this.add.text(W * 0.5, H * 0.92, 'Swipe or use arrow keys to navigate', {
      fontSize: '28px',
      fontFamily: 'Arial',
      color: '#556677',
    }).setOrigin(0.5).setDepth(4);

    // ── Input: any tap/key starts game ──────────────────────────────────────
    // Use pointerup (not pointerdown) so the tap finishes on the title screen
    // and does not bleed a swipe-down event into the first move of the game.
    const startGame = () => {
      initAudio(); // prime AudioContext on the first user gesture
      // Skip level select if the player hasn't cleared level 1 yet
      if (loadBestLevel() <= 1) {
        this.registry.set('startLevel', 1);
        this.scene.start('Game');
      } else {
        this.scene.start('LevelSelect');
      }
    };
    this.input.once('pointerup', startGame);
    this.input.keyboard!.once('keydown', startGame);
  }

  private drawBtn(pressed: boolean): void {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const btnY = H * 0.80;
    const btnW = 480, btnH = 110;
    this.btnGfx.clear();
    this.btnGfx.fillStyle(pressed ? 0x226622 : 0x338833, 1);
    this.btnGfx.fillRoundedRect(W * 0.5 - btnW / 2, btnY - btnH / 2, btnW, btnH, 22);
    this.btnGfx.lineStyle(4, pressed ? 0x114411 : 0x55aa55, 1);
    this.btnGfx.strokeRoundedRect(W * 0.5 - btnW / 2, btnY - btnH / 2, btnW, btnH, 22);
    // Inner highlight
    if (!pressed) {
      this.btnGfx.lineStyle(3, 0x88ee88, 0.4);
      this.btnGfx.strokeRoundedRect(W * 0.5 - btnW / 2 + 6, btnY - btnH / 2 + 6, btnW - 12, btnH * 0.45, 14);
    }
  }

  update(): void {
    // Drift floating poop emojis upward, wrap at top
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const objs = this.children.list.filter(
      (c): c is Phaser.GameObjects.Text => c instanceof Phaser.GameObjects.Text && c.text === '💩'
    );
    for (let i = 0; i < this.poops.length && i < objs.length; i++) {
      const p = this.poops[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < -80) { p.y = H + 60; p.x = Math.random() * W; }
      objs[i].setPosition(p.x, p.y).setRotation(p.rot);
    }
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────
//
// Best-effort multi-method save: localStorage → sessionStorage → cookie → memory.
// Published games run in iframes where localStorage is often blocked by the
// browser (throws SecurityError). We try every available mechanism so at least
// one works in any given host environment.

const SAVE_KEY    = 'stb_bestLevel';
const COOKIE_NAME = 'stb_bl';          // short cookie name
let   _memBest    = 1;                 // in-memory fallback (survives scene restarts)

/** Parse and validate a raw string value from any storage source. */
function _parseLevel(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 1 ? n : null;
}

/** Read the best-level cookie value, or null if absent/invalid. */
function _readCookie(): number | null {
  try {
    const match = document.cookie
      .split(';')
      .map(s => s.trim())
      .find(s => s.startsWith(COOKIE_NAME + '='));
    return match ? _parseLevel(match.split('=')[1]) : null;
  } catch { return null; }
}

/** Write the best-level cookie (1-year expiry, lax samesite). */
function _writeCookie(lvl: number): void {
  try {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${lvl};expires=${expires};path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

function loadBestLevel(): number {
  // 1. localStorage
  try {
    const v = _parseLevel(localStorage.getItem(SAVE_KEY));
    if (v !== null) { _memBest = v; return v; }
  } catch { /* blocked */ }

  // 2. sessionStorage
  try {
    const v = _parseLevel(sessionStorage.getItem(SAVE_KEY));
    if (v !== null) { _memBest = v; return v; }
  } catch { /* blocked */ }

  // 3. cookie
  const cv = _readCookie();
  if (cv !== null) { _memBest = cv; return cv; }

  // 4. in-memory
  return _memBest;
}

function saveBestLevel(lvl: number): void {
  _memBest = lvl; // always update memory first

  // 1. localStorage
  try { localStorage.setItem(SAVE_KEY, String(lvl)); } catch { /* blocked */ }

  // 2. sessionStorage
  try { sessionStorage.setItem(SAVE_KEY, String(lvl)); } catch { /* blocked */ }

  // 3. cookie
  _writeCookie(lvl);
}

// ─── Level Select Scene ───────────────────────────────────────────────────────

class LevelSelectScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelSelect' }); }

  create(): void {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const bestLevel = loadBestLevel();
    // bestLevel = highest level the player has *unlocked* (can play)
    // Levels 1..(bestLevel) are unlocked; bestLevel is the "current" frontier

    // ── Start BGM if not already playing ─────────────────────────────────────
    // AudioContext is already primed from the Title screen tap
    initAudio();
    startMusic();

    // ── Background ────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0020, 0x0a0020, 0x1a0a3a, 0x1a0a3a, 1);
    bg.fillRect(0, 0, W, H);
    const grid = this.add.graphics();
    grid.lineStyle(2, 0x2a1a4a, 0.35);
    for (let x = 0; x < W; x += 70) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 70) grid.lineBetween(0, y, W, y);

    // ── SF2-style header ──────────────────────────────────────────────────
    this.addSF2Word('LEVEL',  W * 0.5, 130, '#ffdd22', '#aa6600', '88px', 4);
    this.addSF2Word('SELECT', W * 0.5, 240, '#44ccff', '#0044aa', '88px', 4);

    // ── CONTINUE button (goes straight to bestLevel) ──────────────────────
    const contY   = 370;
    const contW   = 520, contH = 96;
    const contGfx = this.add.graphics().setDepth(5);
    const drawCont = (pressed: boolean) => {
      contGfx.clear();
      contGfx.fillStyle(pressed ? 0x226622 : 0x338833, 1);
      contGfx.fillRoundedRect(W / 2 - contW / 2, contY - contH / 2, contW, contH, 20);
      contGfx.lineStyle(3, pressed ? 0x114411 : 0x55aa55, 1);
      contGfx.strokeRoundedRect(W / 2 - contW / 2, contY - contH / 2, contW, contH, 20);
    };
    drawCont(false);
    this.add.text(W / 2, contY - 12, `▶ CONTINUE`, {
      fontSize: '44px', fontFamily: 'Arial Black, Arial',
      color: '#ffffff', stroke: '#003300', strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(6);
    this.add.text(W / 2, contY + 24, `LEVEL ${bestLevel}`, {
      fontSize: '26px', fontFamily: 'Arial', color: '#aaffaa',
    }).setOrigin(0.5, 0.5).setDepth(6);
    const contZone = this.add.zone(W / 2, contY, contW, contH).setInteractive({ useHandCursor: true });
    contZone.on('pointerdown', () => drawCont(true));
    contZone.on('pointerup',   () => { drawCont(false); this.launchLevel(bestLevel); });
    contZone.on('pointerout',  () => drawCont(false));

    // ── Level grid ────────────────────────────────────────────────────────
    // Show up to bestLevel + 5 locked levels as a preview
    const COLS     = 5;
    const BTN      = 110;
    const GAP      = 14;
    const GRID_TOP_Y = 490;
    const totalShow = Math.min(bestLevel + 4, 30); // show up to 30 tiles max
    const rows     = Math.ceil(totalShow / COLS);

    const gridW    = COLS * BTN + (COLS - 1) * GAP;
    const startX   = Math.floor((W - gridW) / 2) + BTN / 2;

    for (let i = 0; i < totalShow; i++) {
      const lvl   = i + 1;
      const col   = i % COLS;
      const row   = Math.floor(i / COLS);
      const bx    = startX + col * (BTN + GAP);
      const by    = GRID_TOP_Y + row * (BTN + GAP);
      const unlocked = lvl <= bestLevel;
      const isFrontier = lvl === bestLevel;

      // Button background
      const btnGfx = this.add.graphics().setDepth(5);
      const fillCol   = isFrontier ? 0xaa6600 : unlocked ? 0x1a4a7a : 0x1a1a2e;
      const strokeCol = isFrontier ? 0xffdd22 : unlocked ? 0x4488cc : 0x333355;
      const drawBtn = (pressed: boolean) => {
        btnGfx.clear();
        btnGfx.fillStyle(pressed ? 0x333366 : fillCol, 1);
        btnGfx.fillRoundedRect(bx - BTN / 2, by - BTN / 2, BTN, BTN, 14);
        btnGfx.lineStyle(isFrontier ? 3 : 2, strokeCol, 1);
        btnGfx.strokeRoundedRect(bx - BTN / 2, by - BTN / 2, BTN, BTN, 14);
      };
      drawBtn(false);

      if (unlocked) {
        // Level number
        this.add.text(bx, by - 8, String(lvl), {
          fontSize: '40px', fontFamily: 'Arial Black',
          color: isFrontier ? '#ffdd22' : '#ffffff',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(6);
        // Small poop count hint
        const { poopCount } = difficultyFor(lvl);
        this.add.text(bx, by + 28, '💩'.repeat(Math.min(poopCount, 4)), {
          fontSize: '18px',
        }).setOrigin(0.5).setDepth(6);

        const zone = this.add.zone(bx, by, BTN, BTN).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => drawBtn(true));
        zone.on('pointerup',   () => { drawBtn(false); this.launchLevel(lvl); });
        zone.on('pointerout',  () => drawBtn(false));
      } else {
        // Locked
        this.add.text(bx, by, '🔒', { fontSize: '36px' }).setOrigin(0.5).setDepth(6);
      }
    }

    // ── Scroll hint if many levels ─────────────────────────────────────────
    const gridBottom = GRID_TOP_Y + rows * (BTN + GAP);
    if (gridBottom > H - 160) {
      this.add.text(W / 2, H - 130, 'scroll to see more levels', {
        fontSize: '24px', fontFamily: 'Arial', color: '#556677',
      }).setOrigin(0.5).setDepth(6);
    }

    // ── Reset progress button (two-tap confirm) ────────────────────────────
    const resetW = 360, resetH = 58;
    const resetX = W / 2, resetY = H - 56;
    const resetGfx = this.add.graphics().setDepth(7);
    const resetTxt = this.add.text(resetX, resetY, '🗑 RESET PROGRESS', {
      fontSize: '24px', fontFamily: 'Arial Black, Arial',
      color: '#884444', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);

    let confirmPending = false;
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;

    const drawReset = (pressed: boolean, confirm: boolean) => {
      resetGfx.clear();
      resetGfx.fillStyle(pressed ? 0x550000 : confirm ? 0x660000 : 0x1a0a0a, 0.9);
      resetGfx.fillRoundedRect(resetX - resetW / 2, resetY - resetH / 2, resetW, resetH, 10);
      resetGfx.lineStyle(2, confirm ? 0xff4444 : 0x552222, 1);
      resetGfx.strokeRoundedRect(resetX - resetW / 2, resetY - resetH / 2, resetW, resetH, 10);
    };
    drawReset(false, false);

    const resetZone = this.add.zone(resetX, resetY, resetW, resetH).setInteractive({ useHandCursor: true }).setDepth(9);
    resetZone.on('pointerdown', () => drawReset(true, confirmPending));
    resetZone.on('pointerout',  () => drawReset(false, confirmPending));
    resetZone.on('pointerup', () => {
      if (!confirmPending) {
        // First tap — arm confirm state
        confirmPending = true;
        drawReset(false, true);
        resetTxt.setText('⚠️ TAP AGAIN TO CONFIRM');
        resetTxt.setStyle({ ...resetTxt.style, color: '#ff6666' });
        // Auto-cancel after 3 s
        confirmTimer = setTimeout(() => {
          confirmPending = false;
          drawReset(false, false);
          resetTxt.setText('🗑 RESET PROGRESS');
          resetTxt.setStyle({ ...resetTxt.style, color: '#884444' });
        }, 3000);
      } else {
        // Second tap — confirmed, reset to level 1
        if (confirmTimer) clearTimeout(confirmTimer);
        saveBestLevel(1);
        this.scene.restart();
      }
    });
  }

  private launchLevel(lvl: number): void {
    this.registry.set('startLevel', lvl);
    this.scene.start('Game');
  }

  // SF2-style word — same as TitleScene
  private addSF2Word(
    text: string, cx: number, cy: number,
    faceColor: string, shadowColor: string, fontSize: string, depth: number,
  ): void {
    const STROKE = 16, SDX = 6, SDY = 7;
    const base = { fontFamily: 'Arial Black, Impact, Arial', fontStyle: 'italic' };
    this.add.text(cx+SDX+2, cy+SDY+2, text, { ...base, fontSize, color: '#000000', stroke: '#000000', strokeThickness: STROKE+4 }).setOrigin(0.5).setDepth(depth);
    this.add.text(cx+SDX,   cy+SDY,   text, { ...base, fontSize, color: shadowColor, stroke: '#000000', strokeThickness: STROKE }).setOrigin(0.5).setDepth(depth+0.1);
    this.add.text(cx,       cy,       text, { ...base, fontSize, color: faceColor,   stroke: '#000000', strokeThickness: STROKE }).setOrigin(0.5).setDepth(depth+0.2);
    this.add.text(cx, cy-3,           text, { ...base, fontSize, color: '#ffffff',   stroke: '#ffffff', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(depth+0.3).setAlpha(0.22);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = createGameConfig(); // boot
config.scene = [
  TitleScene,
  LevelSelectScene,
  { key: 'Game', create, update },
];
new Phaser.Game(config);
