import {
  GAME_WIDTH, GAME_HEIGHT, LEVEL_WIDTH, LEVEL_HEIGHT,
  BEAR_SPEED, BEAR_HP, BEAR_RADIUS,
  DODGE_SPEED, DODGE_DURATION, DODGE_COOLDOWN, DODGE_CHARGES,
  MELEE_SPEED, RANGED_SPEED, MELEE_HP, RANGED_HP,
  SLOW_DURATION, SLOW_MOVE_MULT, SLOW_ATTACK_MULT, BEE_DPS,
  MELEE_ATTACK_RANGE, MELEE_ATTACK_COOLDOWN,
  RANGED_SHOOT_COOLDOWN, RANGED_DETECT_RANGE, MELEE_DETECT_RANGE,
  PROJECTILE_SPEED,
  BEE_SPEED_MIN, BEE_TRAVERSE_MS, BEE_STING_RANGE, BEE_COUNT, BEE_RETURN_SPEED, BEE_MAX_SWARMS,
  CAGE_OPEN_RANGE, GOAL_RADIUS, TILE, COLORS,
  BOSS_MAX_HP, BOSS_SPEED, BOSS_RADIUS, BOSS_MELEE_RANGE, BOSS_AWAKEN_MS, BOSS_STUN_PER_STING,
  createGameConfig,
} from './config';
import type { Enemy, Cage, BeeSwarm, Projectile, GameState, Boss, BossTimeBomb } from './types';
import { SFX, BGM } from './sfx';

// ─── Scene globals ─────────────────────────────────────────────────────────────
let scene: Phaser.Scene;
let bear: Phaser.Physics.Arcade.Sprite;
let cursors: Phaser.Types.Input.Keyboard.CursorKeys;
let wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
let enemies: Enemy[] = [];
let cages: Cage[] = [];
let projectiles: Projectile[] = [];
let beeSwarms: BeeSwarm[] = [];
let pathGraphics: Phaser.GameObjects.Graphics;
let goalSprite: Phaser.GameObjects.Arc;
let goalX = 0, goalY = 0;
let boss: Boss | null = null;   // stage 3 only

// Boss HUD (soulslike bar at bottom of screen, rendered by hudCam)
let bossHudBg: Phaser.GameObjects.Graphics;
let bossHudBar: Phaser.GameObjects.Graphics;
let bossHudNameText: Phaser.GameObjects.Text;
let bossHudVisible = false; // true once boss activates

// HUD
let hudBg: Phaser.GameObjects.Graphics;
let hudHpBar: Phaser.GameObjects.Graphics;
let hudStaminaBar: Phaser.GameObjects.Graphics;
let hudCageText: Phaser.GameObjects.Text;
let hudHpText: Phaser.GameObjects.Text;
let hudDodgeText: Phaser.GameObjects.Text;
let hudHintText: Phaser.GameObjects.Text;
let hudBottomG: Phaser.GameObjects.Graphics;
let hudSlotTexts: Phaser.GameObjects.Text[] = [];
let hudBeeOrbitTime = 0;
let fogGraphics: Phaser.GameObjects.Graphics;
let hudCam: Phaser.Cameras.Scene2D.Camera;           // zoom-1 overlay camera for all UI
let indicatorG: Phaser.GameObjects.Graphics;         // screen-edge direction indicators
let indicatorTexts: Phaser.GameObjects.Text[] = [];   // one text per cage + 1 for exit

// Hive weapon slots: true = available/ready
let hiveSlots: [boolean, boolean] = [true, true];

// Debug menu
let debugMenuOpen = false;
let debugMenuBg: Phaser.GameObjects.Graphics;
let debugMenuText: Phaser.GameObjects.Text;
let pKey: Phaser.Input.Keyboard.Key;
let key1: Phaser.Input.Keyboard.Key;
let key2: Phaser.Input.Keyboard.Key;
let key3: Phaser.Input.Keyboard.Key;
let bKey: Phaser.Input.Keyboard.Key;

let currentStage = 1;  // persists across scene restarts via stageToLoad
let gameState: GameState;
let enemyGroup: Phaser.Physics.Arcade.Group;
let projectileGroup: Phaser.Physics.Arcade.Group;
let terrainGroup: Phaser.Physics.Arcade.StaticGroup;  // solid tree trunks
let bushZones: Phaser.Geom.Circle[] = [];           // soft slow zones (per tree)
let bearDamageCooldown = 0;
let spaceKey: Phaser.Input.Keyboard.Key;
let dodgeCooldown = 0;   // ms until next charge is restored
let dodgeCharges  = DODGE_CHARGES; // current available charges (0–DODGE_CHARGES)
let dodgeTimer = 0;
let dodgeVx = 0;
let dodgeVy = 0;
let lastFacingX = 0;
let lastFacingY = 1;

// Bottom HUD layout constants
const HUD_H   = 160;
const PORT_W  = 130;
const SAFE_B  = 28;   // bottom inset so panel clears canvas edge
const SAFE_R  = 16;   // right inset so right slot clears canvas edge

// ─── CREATE ───────────────────────────────────────────────────────────────────
function create(this: Phaser.Scene): void {
  scene = this;
  // Reset all module-level arrays and state so restart is clean
  enemies = [];
  cages = [];
  projectiles = [];
  beeSwarms = [];
  bushZones = [];
  BGM.stop();
  BGM.startStage();
  hudSlotTexts = [];
  indicatorTexts = [];
  hiveSlots = [true, true];
  debugMenuOpen = false;
  boss = null;
  bossHudVisible = false;
  bearDamageCooldown = 0;
  knockbackTimer = 0; knockbackVx = 0; knockbackVy = 0;
  dodgeCooldown = 0;
  dodgeCharges = DODGE_CHARGES;
  dodgeTimer = 0;
  dodgeVx = 0; dodgeVy = 0;
  lastFacingX = 0; lastFacingY = 1;
  hudBeeOrbitTime = 0;
  gameState = {
    bearHp: BEAR_HP, bearMaxHp: BEAR_HP,
    cagesTotal: 4, cagesRescued: 0,
    levelComplete: false, gameOver: false,
    drawing: false, drawPath: [],
    stage: currentStage,
  };
  this.physics.world.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
  if (currentStage === 2) drawCityBackground(this);
  else if (currentStage === 3) drawDataCenterBackground(this);
  else drawBackground(this);
  terrainGroup = this.physics.add.staticGroup();
  buildTerrain(this);
  enemyGroup      = this.physics.add.group();
  projectileGroup = this.physics.add.group();
  spawnGoal(this);
  spawnCages(this);
  spawnEnemies(this);
  buildBearTextures(this);          // generates bear / bear_l / bear_r / bear_lr
  bear = this.physics.add.sprite(LEVEL_WIDTH / 2, LEVEL_HEIGHT - 300, 'bear');
  bear.setCollideWorldBounds(true).setDepth(10).setCircle(BEAR_RADIUS, 4, 4);
  this.physics.add.collider(bear, terrainGroup);
  this.physics.add.collider(enemyGroup, terrainGroup);
  pathGraphics = this.add.graphics().setDepth(20);
  this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);
  this.cameras.main.startFollow(bear, true, 0.1, 0.1);
  this.cameras.main.setZoom(1.8);  // zoom in — shows ~55% of raw viewport
  cursors = this.input.keyboard!.createCursorKeys();
  wasd = {
    up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  };
  spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  pKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  key1 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
  key2 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
  key3 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
  bKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
  this.input.on('pointerdown', onPointerDown, this);
  this.input.on('pointermove', onPointerMove, this);
  this.input.on('pointerup',   onPointerUp,   this);
  // Mouse leaving canvas = treat as pointer release
  this.input.on('gameout', () => { if (gameState.drawing) onPointerUp.call(scene, {} as Phaser.Input.Pointer); }, this);
  this.physics.add.overlap(bear, enemyGroup,      onBearEnemyOverlap      as any, undefined, this);
  this.physics.add.overlap(bear, projectileGroup, onBearProjectileOverlap as any, undefined, this);
  buildHUD(this);
  hudBottomG = this.add.graphics().setDepth(63);
  fogGraphics = this.add.graphics().setDepth(49);
  indicatorG  = this.add.graphics().setDepth(65);
  buildIndicatorTexts(this);

  // ── HUD Camera: zoom=1, no scroll, renders only UI objects ──
  hudCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT)
    .setName('hud').setZoom(1).setScroll(0, 0);
  // Main camera ignores all HUD objects; hudCam ignores all non-HUD objects.
  // We achieve this by setting cameraFilter on each group.
  const hudObjects: Phaser.GameObjects.GameObject[] = [
    hudBg, hudHpBar, hudStaminaBar, hudHpText, hudDodgeText, hudCageText, hudHintText,
    hudBottomG, fogGraphics, indicatorG,
    debugMenuBg, debugMenuText,
    bossHudBg, bossHudBar, bossHudNameText,
    ...hudSlotTexts, ...indicatorTexts,
  ];
  for (const obj of hudObjects) {
    // Ignore from main camera (bit 0 = cameras.main id)
    (obj as any).cameraFilter |= this.cameras.main.id;
  }
  // hudCam will see ONLY the hud objects — set all world objects to ignore hudCam
  // The simplest way: set hudCam to ignore everything, then un-ignore hud objects.
  // Actually use the inverse: tell hudCam to ignore by default using setBackgroundColor none
  // and ignore world groups explicitly.
  this.cameras.main.ignore(hudObjects as any);
  // hudCam ignores all world objects by filtering out everything not in hudObjects
  const allObjs = this.children.list.filter(o => !hudObjects.includes(o));
  hudCam.ignore(allObjs as any);

  // Zone entrance banner (soulslike style)
  showZoneEntrance(this);
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update(this: Phaser.Scene, _time: number, delta: number): void {
  // ── Debug menu (runs even when game over / level complete) ──
  if (Phaser.Input.Keyboard.JustDown(pKey)) {
    debugMenuOpen = !debugMenuOpen;
    drawDebugMenu();
  }
  if (debugMenuOpen) {
    if (Phaser.Input.Keyboard.JustDown(key1)) { debugMenuOpen = false; currentStage = 1; scene.scene.restart(); return; }
    if (Phaser.Input.Keyboard.JustDown(key2)) { debugMenuOpen = false; currentStage = 2; scene.scene.restart(); return; }
    if (Phaser.Input.Keyboard.JustDown(key3)) { debugMenuOpen = false; currentStage = 3; scene.scene.restart(); return; }
    if (Phaser.Input.Keyboard.JustDown(bKey)) {
      debugMenuOpen = false;
      drawDebugMenu();
      // If not on stage 3, warp there first
      if (currentStage !== 3) { currentStage = 3; scene.scene.restart(); return; }
      // Already on stage 3 — rescue all cages and awaken boss immediately
      for (const cage of cages) { if (!cage.opened) openCage(cage); }
      if (boss && boss.state === 'dormant') awakenBoss(boss);
      return;
    }
  }
  if (gameState.gameOver || gameState.levelComplete) return;
  moveBear(delta);
  if (bearDamageCooldown > 0) bearDamageCooldown -= delta;
  for (const swarm of beeSwarms) updateSwarm(swarm, delta);
  renderPathPreview();
  for (const e of enemies) updateEnemy(e, delta);
  updateProjectiles();
  checkCages();
  checkGoal();
  if (boss) updateBoss(boss, delta);
  updateFog();
  updateIndicators();
  hudBeeOrbitTime += delta;
  refreshHUD(delta);
}

// ─── MOVEMENT ───────────────────────────────────────────────────────────────────
function moveBear(delta: number): void {
  // Recharge one charge at a time on the cooldown timer
  if (dodgeCharges < DODGE_CHARGES) {
    dodgeCooldown -= delta;
    if (dodgeCooldown <= 0) {
      dodgeCharges++;
      dodgeCooldown = dodgeCharges < DODGE_CHARGES ? DODGE_COOLDOWN : 0;
    }
  }
  if (dodgeTimer    > 0) dodgeTimer    -= delta;
  if (knockbackTimer > 0) {
    knockbackTimer -= delta;
    bear.setVelocity(knockbackVx, knockbackVy);
    return; // skip normal input during knockback
  }
  let ix = 0, iy = 0;
  if (cursors.left.isDown  || wasd.left.isDown)  ix -= 1;
  if (cursors.right.isDown || wasd.right.isDown) ix += 1;
  if (cursors.up.isDown    || wasd.up.isDown)    iy -= 1;
  if (cursors.down.isDown  || wasd.down.isDown)  iy += 1;
  if (ix !== 0 && iy !== 0) { ix *= 0.707; iy *= 0.707; }
  if (ix !== 0 || iy !== 0) { lastFacingX = ix; lastFacingY = iy; }
  if (Phaser.Input.Keyboard.JustDown(spaceKey) && dodgeCharges > 0 && dodgeTimer <= 0) {
    const dx = ix !== 0 || iy !== 0 ? ix : lastFacingX;
    const dy = ix !== 0 || iy !== 0 ? iy : lastFacingY;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    dodgeVx = (dx / mag) * DODGE_SPEED; dodgeVy = (dy / mag) * DODGE_SPEED;
    dodgeTimer = DODGE_DURATION;
    dodgeCharges--;
    // Start recharge timer only if not already counting down
    if (dodgeCooldown <= 0) dodgeCooldown = DODGE_COOLDOWN;
    scene.tweens.add({ targets: bear, alpha: 0.45, duration: DODGE_DURATION / 2, yoyo: true });
    bearDamageCooldown = Math.max(bearDamageCooldown, DODGE_DURATION + 100);
  }
  bear.setVelocity(dodgeTimer > 0 ? dodgeVx : ix * BEAR_SPEED, dodgeTimer > 0 ? dodgeVy : iy * BEAR_SPEED);
  // Bush slow: halve velocity when inside a bush zone (dodge ignores it)
  if (dodgeTimer <= 0 && inBushZone(bear.x, bear.y)) {
    const bv = bear.body as Phaser.Physics.Arcade.Body;
    bv.setVelocity(bv.velocity.x * 0.45, bv.velocity.y * 0.45);
  }
  if (ix !== 0) bear.setFlipX(ix < 0);
}

// ─── BEE PATH INPUT ──────────────────────────────────────────────────────────
function onPointerDown(this: Phaser.Scene, pointer: Phaser.Input.Pointer): void {
  if (gameState.levelComplete || gameState.gameOver) return;
  gameState.drawing = true;
  gameState.drawPath = [new Phaser.Math.Vector2(pointer.worldX, pointer.worldY)];
}
function onPointerMove(this: Phaser.Scene, pointer: Phaser.Input.Pointer): void {
  if (!gameState.drawing) return;
  const path = gameState.drawPath;
  const last = path[path.length - 1];
  if (Phaser.Math.Distance.Between(last.x, last.y, pointer.worldX, pointer.worldY) > 18)
    path.push(new Phaser.Math.Vector2(pointer.worldX, pointer.worldY));
}
function onPointerUp(this: Phaser.Scene, _pointer: Phaser.Input.Pointer): void {
  if (!gameState.drawing) return;
  gameState.drawing = false;
  if (gameState.drawPath.length < 2) { gameState.drawPath = []; return; }
  // Pick the first free slot (0 = left paw, 1 = right paw)
  const slot = hiveSlots[0] ? 0 : hiveSlots[1] ? 1 : -1;
  if (slot === -1) { gameState.drawPath = []; SFX.noBees(); return; } // both paws busy
  hiveSlots[slot as 0 | 1] = false;
  const fullPath = [new Phaser.Math.Vector2(bear.x, bear.y), ...gameState.drawPath];
  gameState.drawPath = [];
  const swarm = createBeeSwarm(bear.x, bear.y, slot as 0 | 1);
  beeSwarms.push(swarm);
  launchSwarm(swarm, fullPath);
  SFX.beeShoot();
  updateBearTexture();
}

// ─── BEE SWARM ───────────────────────────────────────────────────────────────
function createBeeSwarm(sx: number, sy: number, slot: 0 | 1): BeeSwarm {
  const dots: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < BEE_COUNT; i++) {
    const d = scene.add.image(sx, sy, 'bee_dot').setDepth(22).setVisible(false) as unknown as Phaser.GameObjects.Arc;
    dots.push(d);
  }
  return { dots, path: [], state: 'idle', pathIndex: 0, speed: BEE_SPEED_MIN, sourceX: sx, sourceY: sy, slot };
}
function pathLength(pts: Phaser.Math.Vector2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Phaser.Math.Distance.Between(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y);
  return len;
}
function launchSwarm(swarm: BeeSwarm, path: Phaser.Math.Vector2[]): void {
  swarm.speed = Math.max(BEE_SPEED_MIN, pathLength(path) / (BEE_TRAVERSE_MS / 1000));
  swarm.path = path; swarm.pathIndex = 0; swarm.state = 'flying';
  swarm.sourceX = bear.x; swarm.sourceY = bear.y;
  for (const d of swarm.dots) { d.setPosition(path[0].x, path[0].y); d.setVisible(true); }
}
function updateSwarm(swarm: BeeSwarm, delta: number): void {
  if (swarm.state === 'idle') return;
  if (swarm.state === 'returning') {
    const rs = (BEE_RETURN_SPEED * delta) / 1000;
    let allHome = true;
    for (const d of swarm.dots) {
      const dist = Phaser.Math.Distance.Between(d.x, d.y, bear.x, bear.y);
      if (dist > rs) { const a = Math.atan2(bear.y-d.y, bear.x-d.x); d.x+=Math.cos(a)*rs; d.y+=Math.sin(a)*rs; allHome=false; }
      else { d.x = bear.x; d.y = bear.y; }
    }
    // Sting enemies while returning too
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      for (const d of swarm.dots)
        if (Phaser.Math.Distance.Between(d.x, d.y, e.sprite.x, e.sprite.y) < BEE_STING_RANGE) { stingEnemy(e, delta); break; }
    }
    if (boss && boss.state === 'active') {
      for (const d of swarm.dots)
        if (Phaser.Math.Distance.Between(d.x, d.y, boss.x, boss.y) < BEE_STING_RANGE + BOSS_RADIUS) { stingBoss(boss, delta); break; }
    }
    if (allHome) {
      for (const d of swarm.dots) d.destroy();
      beeSwarms = beeSwarms.filter(s => s !== swarm);
      hiveSlots[swarm.slot] = true;
      updateBearTexture();
    }
    return;
  }
  const step = (swarm.speed * delta) / 1000;
  const target = swarm.path[swarm.pathIndex];
  let allReached = true;
  for (let i = 0; i < swarm.dots.length; i++) {
    const d = swarm.dots[i];
    const tx = target.x + Math.sin(i*1.8)*12, ty = target.y + Math.cos(i*1.8)*12;
    const dist = Phaser.Math.Distance.Between(d.x, d.y, tx, ty);
    if (dist > step) { const a = Math.atan2(ty-d.y, tx-d.x); d.x+=Math.cos(a)*step; d.y+=Math.sin(a)*step; allReached=false; }
    else { d.x=tx; d.y=ty; }
  }
  if (allReached) {
    swarm.pathIndex++;
    if (swarm.pathIndex >= swarm.path.length) { swarm.state = 'returning'; swarm.path = []; return; }
  }
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    for (const d of swarm.dots)
      if (Phaser.Math.Distance.Between(d.x, d.y, e.sprite.x, e.sprite.y) < BEE_STING_RANGE) { stingEnemy(e, delta); break; }
  }
  // Sting boss
  if (boss && boss.state === 'active') {
    for (const d of swarm.dots)
      if (Phaser.Math.Distance.Between(d.x, d.y, boss.x, boss.y) < BEE_STING_RANGE + BOSS_RADIUS) { stingBoss(boss, delta); break; }
  }
}
// End updateSwarm

// ─── PATH PREVIEW ─────────────────────────────────────────────────────────────────
function renderPathPreview(): void {
  pathGraphics.clear();
  if (!gameState.drawing || gameState.drawPath.length < 1) return;
  // Red if no slots free, yellow-gold if a slot is ready
  const canFire = hiveSlots[0] || hiveSlots[1];
  const pathColor = canFire ? COLORS.bee.body : 0xff2222;
  const first = gameState.drawPath[0];
  // Dashed connector bear -> first point
  pathGraphics.lineStyle(2, pathColor, canFire ? 0.4 : 0.6);
  pathGraphics.beginPath();
  const ddx = first.x - bear.x, ddy = first.y - bear.y;
  const tl = Math.sqrt(ddx*ddx + ddy*ddy);
  if (tl > 0) {
    const ux = ddx/tl, uy = ddy/tl;
    let dist = 0, seg = true;
    while (dist < tl) {
      const end = Math.min(dist + (seg ? 14 : 8), tl);
      if (seg) { pathGraphics.moveTo(bear.x+ux*dist, bear.y+uy*dist); pathGraphics.lineTo(bear.x+ux*end, bear.y+uy*end); }
      dist = end; seg = !seg;
    }
  }
  pathGraphics.strokePath();
  if (gameState.drawPath.length < 2) return;
  pathGraphics.lineStyle(3, pathColor, canFire ? 0.8 : 0.9);
  pathGraphics.beginPath();
  pathGraphics.moveTo(first.x, first.y);
  for (let i = 1; i < gameState.drawPath.length; i++) pathGraphics.lineTo(gameState.drawPath[i].x, gameState.drawPath[i].y);
  pathGraphics.strokePath();
}

// ─── ENEMY AI ────────────────────────────────────────────────────────────────────
function updateEnemy(e: Enemy, delta: number): void {
  if (e.state === 'dead') return;
  const isSlowed = e.slowTimer > 0;
  if (isSlowed) {
    e.slowTimer -= delta;
    e.slowIcon.setPosition(e.sprite.x, e.sprite.y - 45);
    if (e.slowTimer <= 0) { e.state = 'patrol'; e.slowIcon.setVisible(false); }
  }
  const mm = isSlowed ? SLOW_MOVE_MULT : 1;
  const am = isSlowed ? SLOW_ATTACK_MULT : 1;
  const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, bear.x, bear.y);
  const range = e.type === 'melee' ? MELEE_DETECT_RANGE : RANGED_DETECT_RANGE;
  if (e.type === 'melee') {
    if (e.state !== 'slowed') e.state = dist < range ? 'chase' : 'patrol';
    if (dist < range) {
      scene.physics.moveToObject(e.sprite, bear, MELEE_SPEED * mm);
      e.attackCooldown -= delta;
      if (dist < MELEE_ATTACK_RANGE && e.attackCooldown <= 0) {
        e.attackCooldown = MELEE_ATTACK_COOLDOWN / am; damageBear(1, e.sprite.x, e.sprite.y);
      }
    } else {
      const od = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, e.patrolOriginX, e.patrolOriginY);
      if (od > 10) scene.physics.moveToObject(e.sprite, { x: e.patrolOriginX, y: e.patrolOriginY } as any, MELEE_SPEED * 0.4 * mm);
      else (e.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }
  } else {
    if (dist < range) {
      if (dist < 150) {
        const a = Math.atan2(e.sprite.y - bear.y, e.sprite.x - bear.x);
        (e.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a)*RANGED_SPEED*mm, Math.sin(a)*RANGED_SPEED*mm);
      } else { (e.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0,0); }
      e.attackCooldown -= delta;
      if (e.attackCooldown <= 0) { e.attackCooldown = RANGED_SHOOT_COOLDOWN / am; shootProjectile(e); }
    } else { (e.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0,0); }
  }
  e.sprite.setFlipX(bear.x < e.sprite.x);
  // Bush slow for enemies
  if (inBushZone(e.sprite.x, e.sprite.y)) {
    const eb = e.sprite.body as Phaser.Physics.Arcade.Body;
    eb.setVelocity(eb.velocity.x * 0.45, eb.velocity.y * 0.45);
  }
  updateEnemyHpBar(e);
}
function stingEnemy(e: Enemy, delta: number): void {
  if (e.state === 'dead') return;
  e.state = 'slowed'; e.slowTimer = SLOW_DURATION; e.slowIcon.setVisible(true);
  const prevFloor = Math.floor(e.hpFrac);
  e.hpFrac -= (BEE_DPS * delta) / 1000;
  e.hp = Math.ceil(Math.max(0, e.hpFrac));
  if (Math.floor(e.hpFrac) < prevFloor) {
    // Red tint + wiggle on each HP lost
    SFX.enemyHurt();
    scene.tweens.killTweensOf(e.sprite);
    e.sprite.setTint(0xff3333);
    scene.tweens.add({
      targets: e.sprite,
      scaleX: 1.25, scaleY: 0.8,
      duration: 60, yoyo: true, repeat: 2,
      onComplete: () => { e.sprite.clearTint(); e.sprite.setScale(1); },
    });
    showFloatingText(e.sprite.x, e.sprite.y - 40, '🐝', '#f5c542');
  }
  if (e.hpFrac <= 0) { killEnemy(e); SFX.enemyDie(); showFloatingText(e.sprite.x, e.sprite.y - 60, '💀', '#ffaa00'); }
}
function killEnemy(e: Enemy): void {
  e.state = 'dead';
  // Replace lumberjack sprite with skeleton lying on ground
  e.sprite.setTexture('skeleton').setAlpha(1).setDepth(4); // depth 4 = below live entities
  (e.sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
  e.hpBar.setVisible(false); e.slowIcon.setVisible(false);
  // Small death pop
  scene.tweens.add({ targets: e.sprite, scaleX: 1.3, scaleY: 1.3, duration: 120, yoyo: true });
}
function updateEnemyHpBar(e: Enemy): void {
  const bar = e.hpBar, bx = e.sprite.x-28, by = e.sprite.y-55;
  bar.clear();
  bar.fillStyle(0x331111,1); bar.fillRect(bx,by,56,8);
  const pct = Math.max(0, e.hpFrac / e.maxHp);
  bar.fillStyle(pct>0.4?0x44dd44:0xdd4444,1); bar.fillRect(bx,by,56*pct,8);
}

// ─── PROJECTILES ───────────────────────────────────────────────────────────────────
function shootProjectile(e: Enemy): void {
  SFX.enemyShoot();
  const a = Math.atan2(bear.y-e.sprite.y, bear.x-e.sprite.x);
  const vx = Math.cos(a)*PROJECTILE_SPEED, vy = Math.sin(a)*PROJECTILE_SPEED;
  const s = projectileGroup.create(e.sprite.x, e.sprite.y, 'projectile') as Phaser.Physics.Arcade.Sprite;
  s.setDepth(9);
  (s.body as Phaser.Physics.Arcade.Body).setVelocity(vx,vy);
  (s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  projectiles.push({sprite:s,vx,vy});
  scene.time.delayedCall(4000, ()=>{ if(s.active) s.destroy(); projectiles=projectiles.filter(p=>p.sprite!==s); });
}
function updateProjectiles(): void { projectiles = projectiles.filter(p => p.sprite.active); }

// ─── BEAR DAMAGE ───────────────────────────────────────────────────────────────────
const KNOCKBACK_SPEED = 340; // px/s impulse on bear hit
const KNOCKBACK_MS    = 140; // ms the knockback lasts
let   knockbackTimer  = 0;   // counts down; bear velocity overridden while > 0
let   knockbackVx = 0, knockbackVy = 0;

function damageBear(amount: number, fromX?: number, fromY?: number): void {
  if (bearDamageCooldown > 0) return;
  bearDamageCooldown = 800;
  SFX.bearHurt();
  gameState.bearHp = Math.max(0, gameState.bearHp - amount);
  // Red tint + scale pulse
  scene.tweens.killTweensOf(bear);
  bear.setTint(0xff2222);
  scene.tweens.add({
    targets: bear,
    scaleX: 1.2, scaleY: 0.85,
    duration: 80, yoyo: true, repeat: 2,
    onComplete: () => { bear.clearTint(); bear.setScale(1); },
  });
  // Knockback: push bear away from attacker
  if (fromX !== undefined && fromY !== undefined) {
    const ax = bear.x - fromX, ay = bear.y - fromY;
    const mag = Math.sqrt(ax*ax + ay*ay) || 1;
    knockbackVx = (ax/mag) * KNOCKBACK_SPEED;
    knockbackVy = (ay/mag) * KNOCKBACK_SPEED;
    knockbackTimer = KNOCKBACK_MS;
  }
  if (gameState.bearHp <= 0) triggerGameOver();
}
function onBearEnemyOverlap(_b: any, enemySprite: any): void {
  const e = enemies.find(en => en.sprite === enemySprite);
  if (!e || e.state === 'dead') return;
  if (e.type === 'melee') damageBear(1, e.sprite.x, e.sprite.y);
}
function onBearProjectileOverlap(_b: any, projSprite: any): void {
  const p = projectiles.find(pr => pr.sprite === projSprite);
  if (!p) return;
  damageBear(1, p.sprite.x, p.sprite.y); p.sprite.destroy();
  projectiles = projectiles.filter(pr => pr !== p);
}

// ─── CAGES / GOAL / WIN / LOSE ────────────────────────────────────────────────────
function checkCages(): void {
  for (const cage of cages) {
    if (cage.opened) continue;
    if (Phaser.Math.Distance.Between(bear.x, bear.y, cage.sprite.x, cage.sprite.y) < CAGE_OPEN_RANGE) openCage(cage);
  }
}
function openCage(cage: Cage): void {
  cage.opened = true; gameState.cagesRescued++;
  SFX.cageOpen();
  // Remove in-cage visuals
  cage.helpBubble.destroy();
  cage.helpText.destroy();
  scene.tweens.killTweensOf(cage.critterIcon);
  cage.critterIcon.destroy();
  // Cage bars shrink away
  scene.tweens.add({ targets: cage.sprite, alpha: 0, scaleY: 2, duration: 500, ease: 'Power2' });
  // Fly-out critter
  cage.critter.setVisible(true);
  scene.tweens.add({
    targets: cage.critter, y: cage.critter.y - 140, alpha: 0,
    duration: 1400, ease: 'Power2', onComplete: ()=>cage.critter.destroy(),
  });
  // Thank-you speech bubble (floating text)
  const thanks = ['Thanks! 🐻♥','Yay! Thank you!','Free at last!','You\'re my hero!'];
  const msg = thanks[gameState.cagesRescued - 1] ?? 'Thank you!';
  showFloatingText(cage.sprite.x, cage.sprite.y - 30, msg, '#ffffaa');
  // Stage 3: all rescued — awaken the boss
  if (currentStage === 3 && gameState.cagesRescued >= gameState.cagesTotal && boss && boss.state === 'dormant') {
    awakenBoss(boss);
  }
}
function checkGoal(): void {
  if (currentStage === 3) return; // stage 3 win is triggered by boss death
  if (gameState.cagesRescued < gameState.cagesTotal) return;
  if (Phaser.Math.Distance.Between(bear.x, bear.y, goalX, goalY) < GOAL_RADIUS + BEAR_RADIUS) triggerLevelComplete();
}
function triggerLevelComplete(): void {
  if (gameState.levelComplete) return;
  gameState.levelComplete = true; bear.setVelocity(0,0);
  // bossClear() is called directly in killBoss; only play stageClear here for non-boss wins
  if (currentStage !== 3 || !boss || boss.state !== 'dead') SFX.stageClear();
  if (gameState.stage === 1) {
    showOverlay('🍯 Stage 1 Clear! 🍯', '#ffee55', 'Heading to the city...', '#aaffaa', () => {
      currentStage = 2; scene.scene.restart();
    });
  } else if (gameState.stage === 2) {
    showOverlay('🚔 Stage 2 Clear! 🚔', '#aaddff', 'Infiltrating the data center...', '#88ffee', () => {
      currentStage = 3; scene.scene.restart();
    });
  } else {
    showOverlay('🏆 Game Complete! 🏆', '#00ffcc', 'All critters freed — the AI is defeated!', '#aaffee', () => {
      currentStage = 1; scene.scene.start('TitleScene');
    });
  }
}
function triggerGameOver(): void {
  if (gameState.gameOver) return;
  gameState.gameOver = true; bear.setVelocity(0,0).setTint(0xff0000);
  BGM.stop();
  showOverlay('🐻 Game Over', '#ff6655', 'The bear fell...', '#ffaaaa', () => {
    currentStage = 1;
    scene.scene.start('TitleScene');
  });
}
function showOverlay(title: string, titleColor: string, sub: string, subColor: string, onTap?: () => void): void {
  // Build overlay in canvas pixel space (rendered by hudCam at zoom=1)
  const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
  const bg = scene.add.graphics().setDepth(68);
  bg.fillStyle(0x000000, 0.72);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  const t1 = scene.add.text(cx, cy - 90, title,
    {fontSize:'56px',fontFamily:'Arial Black',color:titleColor,stroke:'#000000',strokeThickness:6})
    .setOrigin(0.5).setDepth(69);
  const t2 = scene.add.text(cx, cy,      sub,
    {fontSize:'34px',fontFamily:'Arial',color:subColor})
    .setOrigin(0.5).setDepth(69);
  const t3 = scene.add.text(cx, cy + 80, 'Tap to continue',
    {fontSize:'30px',fontFamily:'Arial',color:'#ffffff'})
    .setOrigin(0.5).setDepth(69);
  // Route to hudCam only — ignore from main camera
  scene.cameras.main.ignore([bg, t1, t2, t3] as any);
  scene.input.once('pointerdown', () => {
    if (onTap) onTap();
    else scene.scene.restart();
  });
}
function showFloatingText(x: number, y: number, text: string, color = '#ffd700'): void {
  const t = scene.add.text(x, y, text, {fontSize:'28px',fontFamily:'Arial',color,fontStyle:'bold'}).setOrigin(0.5).setDepth(49);
  scene.tweens.add({ targets:t, y:y-70, alpha:0, duration:1200, ease:'Power2', onComplete:()=>t.destroy() });
}

// ─── HUD ───────────────────────────────────────────────────────────────────────────
// Info strip sits just above the bottom bear HUD panel
const INFO_H = 52;
const INFO_Y = GAME_HEIGHT - HUD_H - INFO_H - SAFE_B; // lifted by safe-area inset

function buildHUD(sc: Phaser.Scene): void {
  // Info strip background — dark translucent panel with top border line
  hudBg = sc.add.graphics().setDepth(60);
  hudBg.fillStyle(0x000000, 0.78);
  hudBg.fillRoundedRect(0, INFO_Y, GAME_WIDTH, INFO_H, 0);
  hudBg.lineStyle(2, 0x556644, 0.9);
  hudBg.lineBetween(0, INFO_Y, GAME_WIDTH, INFO_Y); // crisp top edge
  hudBg.lineStyle(1, 0x223322, 0.6);
  hudBg.lineBetween(0, INFO_Y + INFO_H, GAME_WIDTH, INFO_Y + INFO_H); // bottom edge

  // Graphics for bar fills
  hudHpBar      = sc.add.graphics().setDepth(61);
  hudStaminaBar = sc.add.graphics().setDepth(61);

  // Labels — vertically centred in the strip
  const textY = INFO_Y + 7;
  hudHpText    = sc.add.text(10, textY, '',
    {fontSize:'22px',fontFamily:'Arial Black',color:'#ff6655',stroke:'#000000',strokeThickness:3}).setDepth(62);
  hudDodgeText = sc.add.text(GAME_WIDTH/2, textY, '',
    {fontSize:'22px',fontFamily:'Arial Black',color:'#66ccff',stroke:'#000000',strokeThickness:3}).setOrigin(0.5,0).setDepth(62);
  hudCageText  = sc.add.text(GAME_WIDTH * 0.62, textY + 1, '',
    {fontSize:'22px',fontFamily:'Arial Black',color:'#88ffaa',stroke:'#000000',strokeThickness:3}).setOrigin(0,0).setDepth(62);

  // Hint text — subtle, smaller
  hudHintText = sc.add.text(GAME_WIDTH/2, INFO_Y - 5,
    'Drag to send bees  •  Rescue critters  •  Reach EXIT',
    {fontSize:'15px',fontFamily:'Arial',color:'#778866'}).setOrigin(0.5,1).setDepth(62).setAlpha(0.65);

  // Slot labels — centered in each slot panel
  const portFrameW = 140;
  const slotW = (GAME_WIDTH - portFrameW - 32 - SAFE_R) / 2;
  const lSlotX = 8;
  const rSlotX = GAME_WIDTH - SAFE_R - 8 - slotW;
  const slotY  = GAME_HEIGHT - HUD_H + 8;
  const slotH  = HUD_H - 16;
  const slotPositions = [lSlotX, rSlotX];
  for (let s = 0; s < BEE_MAX_SWARMS; s++) {
    const lbl = sc.add.text(slotPositions[s] + slotW/2, slotY + slotH - 34,
      s===0 ? 'L READY' : 'R READY',
      {fontSize:'22px',fontFamily:'Arial Black',color:'#88ff44',stroke:'#000000',strokeThickness:3})
      .setOrigin(0.5, 1).setDepth(64);
    hudSlotTexts.push(lbl);
  }
  // ── Debug menu (hidden by default, toggled by P) ──
  debugMenuBg = sc.add.graphics().setDepth(80);
  debugMenuText = sc.add.text(0, 0, '', {
    fontSize: '22px', fontFamily: 'Courier New',
    color: '#00ff88', backgroundColor: undefined,
    padding: { x: 0, y: 0 },
  }).setDepth(81).setVisible(false);
  drawDebugMenu();

  // ── Boss soulslike HUD bar (bottom of screen, hidden until boss activates) ──
  bossHudBg  = sc.add.graphics().setDepth(70).setAlpha(0);
  bossHudBar = sc.add.graphics().setDepth(71).setAlpha(0);
  bossHudNameText = sc.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 68, '', {
    fontSize: '26px', fontFamily: 'Georgia, serif',
    color: '#ddbbbb', stroke: '#000000', strokeThickness: 4,
    fontStyle: 'italic',
  }).setOrigin(0.5, 1).setDepth(72).setAlpha(0);
}

function drawDebugMenu(): void {
  const open = debugMenuOpen;
  debugMenuBg.clear();
  debugMenuText.setVisible(open);
  if (!open) return;
  const pw = 320, ph = 162;
  const px = GAME_WIDTH - pw - 16, py = 16;
  debugMenuBg.fillStyle(0x000000, 0.82);
  debugMenuBg.fillRoundedRect(px, py, pw, ph, 8);
  debugMenuBg.lineStyle(2, 0x00ff88, 0.9);
  debugMenuBg.strokeRoundedRect(px, py, pw, ph, 8);
  debugMenuText.setPosition(px + 14, py + 10);
  const stageLabel = (n: number) => n === currentStage ? ` ► Stage ${n}` : `   Stage ${n}`;
  debugMenuText.setText(
    `DEBUG  [P] close\n` +
    `[1]${stageLabel(1)}  (Forest)\n` +
    `[2]${stageLabel(2)}  (City)\n` +
    `[3]${stageLabel(3)}  (Data Center)\n` +
    `[B] Fight Boss (Stage 3)`
  );
}

function refreshHUD(delta: number): void {
  // ── Info strip bars ──
  const barY  = INFO_Y + 28;
  const barH  = 16;
  const barR  = 5;

  // HP bar — trough + fill + bright leading edge
  hudHpBar.clear();
  hudHpBar.fillStyle(0x220808, 1); hudHpBar.fillRoundedRect(68, barY, 190, barH, barR);
  const pct = gameState.bearHp / gameState.bearMaxHp;
  const hpCol = pct > 0.6 ? 0x44dd44 : pct > 0.3 ? 0xffaa22 : 0xff3322;
  hudHpBar.fillStyle(hpCol, 1);
  const hpFill = Math.max(0, 190 * pct);
  hudHpBar.fillRoundedRect(68, barY, hpFill, barH, barR);
  // Bright leading-edge shimmer
  if (hpFill > 6) {
    hudHpBar.fillStyle(0xffffff, 0.35);
    hudHpBar.fillRoundedRect(68, barY, hpFill, barH / 2, barR);
    hudHpBar.fillStyle(0xffffff, 0.55);
    hudHpBar.fillRect(68 + hpFill - 4, barY, 4, barH);
  }
  hudHpText.setText('HP').setColor(pct > 0.3 ? '#ff6655' : '#ff2200');

  // Stamina — 2 pips, glow when charged
  hudStaminaBar.clear();
  const sbX = GAME_WIDTH / 2 - 82;
  const pipW = 74, pipH = barH, pipGap = 14;
  const stamReady = dodgeCharges > 0;
  for (let c = 0; c < DODGE_CHARGES; c++) {
    const px = sbX + c * (pipW + pipGap);
    const charged = c < dodgeCharges;
    // Trough
    hudStaminaBar.fillStyle(0x0a1520, 1);
    hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH, barR);
    if (charged) {
      hudStaminaBar.fillStyle(0x2299ee, 1);
      hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH, barR);
      // Shimmer
      hudStaminaBar.fillStyle(0xffffff, 0.25);
      hudStaminaBar.fillRoundedRect(px, barY, pipW, pipH / 2, barR);
    } else if (c === dodgeCharges && dodgeCooldown > 0) {
      const fillPct = 1 - (dodgeCooldown / DODGE_COOLDOWN);
      hudStaminaBar.fillStyle(0x1155aa, 1);
      hudStaminaBar.fillRoundedRect(px, barY, Math.max(0, pipW * fillPct), pipH, barR);
    }
  }
  hudDodgeText.setText(stamReady ? 'DODGE' : 'DODGE').setColor(stamReady ? '#55ddff' : '#335566');

  // Cage count — pulse gold when all rescued
  const r = gameState.cagesRescued, t = gameState.cagesTotal;
  const allDone = r >= t;
  hudCageText.setText(`Rescued: ${r}/${t}${allDone ? '  DONE' : ''}`);
  hudCageText.setColor(allDone ? '#ffee55' : '#88ffaa');

  for (let s = 0; s < BEE_MAX_SWARMS; s++) {
    const ready = hiveSlots[s];
    hudSlotTexts[s]?.setColor(ready ? '#aaff44' : '#ff9933');
    hudSlotTexts[s]?.setText(ready ? (s===0 ? 'L READY' : 'R READY') : (s===0 ? 'L FLYING' : 'R FLYING'));
  }
  // Bottom bear portrait panel
  drawBottomHUD();
}

// ─── BOTTOM HUD ───────────────────────────────────────────────────────────────────
function drawBottomHUD(): void {
  const g = hudBottomG;
  g.clear();
  const panelY = GAME_HEIGHT - HUD_H - SAFE_B;  // lifted by safe-area inset

  // Layout constants — bear portrait centred, slots left+right
  const portFrameW = 140;
  const gap = 8;
  const slotW = (GAME_WIDTH - portFrameW - gap * 4 - SAFE_R) / 2;
  const lSlotX = gap;
  const rSlotX = GAME_WIDTH - SAFE_R - gap - slotW;
  const portFrameX = lSlotX + slotW + gap;  // left edge of portrait frame
  const portCX = GAME_WIDTH / 2;             // portrait centre x
  const portCY = panelY + HUD_H / 2;        // portrait centre y
  const slotY  = panelY + gap;
  const slotH  = HUD_H - gap * 2;

  // Panel bg — dark gradient feel with top separator, extends to canvas bottom
  g.fillStyle(0x060808, 0.97); g.fillRect(0, panelY, GAME_WIDTH, HUD_H + SAFE_B);
  g.lineStyle(2, 0x445533, 1);  g.lineBetween(0, panelY, GAME_WIDTH, panelY);
  g.lineStyle(1, 0x223322, 0.5); g.lineBetween(0, panelY + 2, GAME_WIDTH, panelY + 2);

  // ── Slot panels ──────────────────────────────────────────────────────────
  const slotXs = [lSlotX, rSlotX];
  for (let s = 0; s < BEE_MAX_SWARMS; s++) {
    const sx = slotXs[s];
    const ready = hiveSlots[s];
    // Slot bg with subtle inner tint
    g.fillStyle(ready ? 0x0e1a06 : 0x1a0e04, 1);
    g.fillRoundedRect(sx, slotY, slotW, slotH, 10);
    // Inner highlight strip at top
    g.fillStyle(ready ? 0x3a6614 : 0x441a06, 0.4);
    g.fillRoundedRect(sx + 2, slotY + 2, slotW - 4, 10, 4);
    // Border — thicker, brighter
    g.lineStyle(ready ? 3 : 2, ready ? 0x99ee44 : 0xcc5511, ready ? 0.95 : 0.7);
    g.strokeRoundedRect(sx, slotY, slotW, slotH, 10);
    // Corner accent marks
    if (ready) {
      g.lineStyle(1, 0xddf066, 0.5);
      g.lineBetween(sx + 10, slotY + 2, sx + 20, slotY + 2);
      g.lineBetween(sx + slotW - 20, slotY + 2, sx + slotW - 10, slotY + 2);
    }
    // Hive icon
    const hx = sx + slotW / 2, hy = slotY + slotH * 0.38;
    const ha = ready ? 1 : 0.22;
    g.fillStyle(ready ? COLORS.hive.body : 0x664400, ha);
    g.fillEllipse(hx, hy, 46, 54);
    g.fillStyle(ready ? COLORS.hive.dark : 0x442200, ha);
    g.fillRect(hx-21, hy-8, 42, 5); g.fillRect(hx-21, hy+0, 42, 5); g.fillRect(hx-21, hy+8, 42, 5);
    g.fillStyle(0x1a0a00, ha); g.fillEllipse(hx, hy+17, 15, 9);
    // Entrance glow when ready
    if (ready) { g.fillStyle(0xffdd44, 0.25); g.fillEllipse(hx, hy+17, 22, 14); }
    // Orbiting bees when ready — 5 bees with wing detail
    if (ready) {
      const t2 = hudBeeOrbitTime / 1000;
      for (let b = 0; b < 5; b++) {
        const angle = t2 * 2.4 + (b / 5) * Math.PI * 2;
        const orb = 28 + Math.sin(t2 * 1.8 + b) * 5;
        const bx2 = hx + Math.cos(angle) * orb;
        const by2 = hy + Math.sin(angle) * orb * 0.42;
        // Wings
        g.fillStyle(0xddeeff, 0.7);
        g.fillEllipse(bx2 - 5, by2 - 3, 9, 5);
        g.fillEllipse(bx2 + 3, by2 - 3, 9, 5);
        // Body
        g.fillStyle(COLORS.bee.body, 1); g.fillCircle(bx2, by2, 5);
        g.fillStyle(0x1a1a00, 0.9); g.fillRect(bx2-2, by2-1, 4, 2);
      }
    }
  }

  // ── Portrait frame ──
  g.fillStyle(0x0a1208, 1); g.fillRoundedRect(portFrameX, slotY, portFrameW, slotH, 10);
  // Inner top highlight
  g.fillStyle(0x2a4418, 0.4); g.fillRoundedRect(portFrameX + 2, slotY + 2, portFrameW - 4, 10, 4);
  g.lineStyle(2, 0x6aaa3a, 0.9); g.strokeRoundedRect(portFrameX, slotY, portFrameW, slotH, 10);
  // Stage number badge top-centre
  g.fillStyle(0x223322, 0.85); g.fillRoundedRect(portFrameX + portFrameW/2 - 22, slotY - 1, 44, 16, 4);
  g.lineStyle(1, 0x5aaa2a, 0.7); g.strokeRoundedRect(portFrameX + portFrameW/2 - 22, slotY - 1, 44, 16, 4);

  // ── Bear portrait with arm lines connecting to slots ─────────────────────
  drawBearPortrait(g, portCX, portCY, slotXs, slotW, slotY, slotH);
}

function drawBearPortrait(
  g: Phaser.GameObjects.Graphics, cx: number, cy: number,
  slotXs: number[], slotW: number, slotY: number, slotH: number
): void {
  const hurt    = gameState.bearHp <= 2;
  const dashing = dodgeTimer > 0;

  // For each paw: compute paw tip world-x and connect to slot with a line
  for (let s = 0; s < 2; s++) {
    const side   = s === 0 ? -1 : 1;     // left paw = -1, right = +1
    const busy   = !hiveSlots[s];
    const armY   = busy ? cy + 44 : cy + 22;
    const pawTipX = cx + side * 50;       // end of the paw
    const pawTipY = armY + 10;
    // Slot connection point: right edge of left slot / left edge of right slot
    const slotConnX = s === 0 ? slotXs[0] + slotW : slotXs[1];
    const slotConnY = slotY + slotH * 0.38 + 16;  // align with hive hole
    // Connector line
    g.lineStyle(3, busy ? 0x664400 : COLORS.hive.body, busy ? 0.5 : 0.9);
    g.lineBetween(pawTipX, pawTipY, slotConnX, slotConnY);
  }

  // Body
  g.fillStyle(COLORS.bear.body,1); g.fillEllipse(cx, cy+10, 80, 64);
  // Head
  g.fillCircle(cx, cy-18, 34);
  // Ears
  g.fillStyle(COLORS.bear.dark,1); g.fillCircle(cx-24,cy-44,14); g.fillCircle(cx+24,cy-44,14);
  g.fillStyle(COLORS.bear.body,1); g.fillCircle(cx-24,cy-44,9);  g.fillCircle(cx+24,cy-44,9);
  // Snout
  g.fillStyle(COLORS.bear.snout,1); g.fillEllipse(cx,cy-10,26,16);
  g.fillStyle(0x1a0a00,1); g.fillEllipse(cx,cy-16,10,6); // nose
  // War-paint stripe (always present)
  g.fillStyle(0xaa3300,0.75); g.fillRect(cx-17,cy-28,34,5);
  // Menacing angled brows (always present)
  g.fillStyle(0x1a0a00,1);
  g.fillTriangle(cx-20,cy-34, cx-8,cy-30, cx-8,cy-27); g.fillTriangle(cx-20,cy-34, cx-20,cy-30, cx-8,cy-27);
  g.fillTriangle(cx+20,cy-34, cx+8,cy-30, cx+8,cy-27); g.fillTriangle(cx+20,cy-34, cx+20,cy-30, cx+8,cy-27);
  // Eyes — state-dependent
  if (dashing) {
    // Wide rage: large amber eyes, fully open
    g.fillStyle(0xffffff,1); g.fillEllipse(cx-14,cy-26,14,12); g.fillEllipse(cx+14,cy-26,14,12);
    g.fillStyle(0xff8800,1); g.fillCircle(cx-14,cy-26,5); g.fillCircle(cx+14,cy-26,5);
    g.fillStyle(0x000000,1); g.fillCircle(cx-14,cy-26,2); g.fillCircle(cx+14,cy-26,2);
  } else if (hurt) {
    // Pain X-eyes with amber flash
    g.fillStyle(0xff2222,1);
    g.fillRect(cx-20,cy-30,8,3); g.fillRect(cx-17,cy-27,3,8); // left X
    g.fillRect(cx+5, cy-30,8,3); g.fillRect(cx+8, cy-27,3,8); // right X
    // Amber glow behind X
    g.fillStyle(0xff8800,0.35); g.fillCircle(cx-14,cy-26,7); g.fillCircle(cx+14,cy-26,7);
  } else {
    // Normal: narrowed amber squint
    g.fillStyle(0xffffff,1); g.fillEllipse(cx-14,cy-26,14,8); g.fillEllipse(cx+14,cy-26,14,8);
    g.fillStyle(0xff8800,1); g.fillCircle(cx-14,cy-26,4); g.fillCircle(cx+14,cy-26,4);
    g.fillStyle(0x000000,1); g.fillCircle(cx-14,cy-26,2); g.fillCircle(cx+14,cy-26,2);
    // Squint lid
    g.lineStyle(2,0x1a0a00,1); g.lineBetween(cx-20,cy-28,cx-8,cy-28); g.lineBetween(cx+8,cy-28,cx+20,cy-28);
  }
  // Snarl mouth — open with teeth in all states
  g.fillStyle(0x1a0000,1);
  g.fillRoundedRect(cx-10,cy-7,20,10,2);
  g.fillStyle(0xffffff,1);
  g.fillRect(cx-9,cy-6,4,6); g.fillRect(cx-3,cy-6,4,6); g.fillRect(cx+3,cy-6,4,6);
  if (hurt) {
    // Pained variation: add cheek drip lines
    g.lineStyle(2,0x882200,0.7);
    g.lineBetween(cx-18,cy-12,cx-14,cy-4); g.lineBetween(cx+14,cy-4,cx+18,cy-12);
  }
  // Arms and hive paws
  for (let s = 0; s < 2; s++) {
    const side = s===0 ? -1 : 1;
    const busy = !hiveSlots[s];
    const armY = busy ? cy+44 : cy+22;
    const pawX = cx + side*50;
    g.fillStyle(COLORS.bear.body,1);
    g.fillEllipse(cx + side*30, armY - 8, 20, busy ? 32 : 24);
    g.fillStyle(busy ? 0x664400 : COLORS.hive.body, 1);
    g.fillEllipse(pawX, armY+10, 22, 28);
    g.fillStyle(busy ? 0x442200 : COLORS.hive.dark, 1);
    g.fillRect(pawX-10, armY+4,  20, 4);
    g.fillRect(pawX-10, armY+10, 20, 4);
  }
}

// ─── BEAR SPRITE TEXTURES (4 arm variants) ─────────────────────────────────────────
function buildBearTextures(sc: Phaser.Scene): void {
  makeBearTex(sc, 'bear',    false, false);
  makeBearTex(sc, 'bear_l',  true,  false);
  makeBearTex(sc, 'bear_r',  false, true);
  makeBearTex(sc, 'bear_lr', true,  true);
}
function makeBearTex(sc: Phaser.Scene, key: string, leftDown: boolean, rightDown: boolean): void {
  const W=64, H=72, g=sc.make.graphics({},false);
  const mid=W/2;
  // Body + head
  g.fillStyle(COLORS.bear.body,1); g.fillEllipse(mid,H/2+6,48,40); g.fillCircle(mid,20,18);
  // Ears
  g.fillStyle(COLORS.bear.dark,1); g.fillCircle(20,8,8); g.fillCircle(44,8,8);
  g.fillStyle(COLORS.bear.body,1); g.fillCircle(20,8,5); g.fillCircle(44,8,5);
  // Snout
  g.fillStyle(COLORS.bear.snout,1); g.fillEllipse(mid,24,16,10);
  g.fillStyle(0x1a0a00,1); g.fillEllipse(mid,18,7,5); // nose
  // Menacing angled brows
  g.fillStyle(0x1a0a00,1);
  g.fillTriangle(16,10, 26,13, 26,15); g.fillTriangle(16,10, 16,13, 26,15); // left brow
  g.fillTriangle(48,10, 38,13, 38,15); g.fillTriangle(48,10, 48,13, 38,15); // right brow
  // Narrowed squint eyes with amber iris
  g.fillStyle(0xffffff,1); g.fillEllipse(24,17,10,6); g.fillEllipse(40,17,10,6);
  g.fillStyle(0xff8800,1); g.fillCircle(24,17,3); g.fillCircle(40,17,3);
  g.fillStyle(0x000000,1); g.fillCircle(24,17,1); g.fillCircle(40,17,1);
  // Squint lid lines
  g.lineStyle(2,0x1a0a00,1); g.lineBetween(18,15,30,15); g.lineBetween(34,15,46,15);
  // Snarl mouth with teeth
  g.fillStyle(0x1a0000,1); g.fillRoundedRect(mid-7,28,14,7,2);
  g.fillStyle(0xffffff,1);
  g.fillRect(mid-6,29,3,4); g.fillRect(mid-2,29,3,4); g.fillRect(mid+2,29,3,4);
  // War-paint stripe
  g.fillStyle(0xaa3300,0.7); g.fillRect(mid-14,14,28,3);
  // Hive paws
  const lY = leftDown  ? H-10 : H/2+4;
  const rY = rightDown ? H-10 : H/2+4;
  g.fillStyle(COLORS.hive.body,1); g.fillEllipse(8,  lY, 14,18); g.fillEllipse(56, rY, 14,18);
  g.fillStyle(COLORS.hive.dark,1);
  g.fillRect(2, lY-4,12,3); g.fillRect(2, lY+1,12,3);
  g.fillRect(50,rY-4,12,3); g.fillRect(50,rY+1,12,3);
  g.generateTexture(key,W,H); g.destroy();
}
function updateBearTexture(): void {
  const l=!hiveSlots[0], r=!hiveSlots[1];
  bear.setTexture(l&&r?'bear_lr':l?'bear_l':r?'bear_r':'bear');
}

// ─── SPAWNERS ──────────────────────────────────────────────────────────────────────
function spawnGoal(sc: Phaser.Scene): void {
  goalX = LEVEL_WIDTH / 2; goalY = 220;
  if (currentStage === 3) {
    // Stage 3: spawn mystery dormant boss blob — no exit circle
    spawnBoss(sc, goalX, goalY);
    return;
  }
  goalSprite = sc.add.circle(goalX, goalY, GOAL_RADIUS, COLORS.goal.glow, 0.85).setDepth(5);
  const exitEmoji = currentStage === 2 ? '🚪' : '⭐';
  sc.add.text(goalX, goalY, exitEmoji, {fontSize:'48px'}).setOrigin(0.5).setDepth(6);
  sc.tweens.add({targets:goalSprite, scaleX:1.2, scaleY:1.2, alpha:0.6, duration:900, yoyo:true, repeat:-1});
  sc.add.text(goalX, goalY + GOAL_RADIUS + 20, 'EXIT', {fontSize:'24px', fontFamily:'Arial', color:'#ffee55', fontStyle:'bold'}).setOrigin(0.5).setDepth(6);
}
function spawnCages(sc: Phaser.Scene): void {
  const CRITTERS = currentStage === 3
    ? ['🦉','🦋','🐸','🦊']
    : currentStage === 2
    ? ['🐦','🐀','🐱','🐶']
    : ['🐇','🦊','🦔','🦝'];
  const NAMES = currentStage === 3
    ? ['Owl','Butterfly','Frog','Fox Cub']
    : currentStage === 2
    ? ['Pigeon','Rat','Alley Cat','Stray Dog']
    : ['Bunny','Fox','Hedgehog','Raccoon'];
  const positions=[
    {x:LEVEL_WIDTH*0.25,y:LEVEL_HEIGHT*0.35},{x:LEVEL_WIDTH*0.75,y:LEVEL_HEIGHT*0.35},
    {x:LEVEL_WIDTH*0.3, y:LEVEL_HEIGHT*0.6 },{x:LEVEL_WIDTH*0.7, y:LEVEL_HEIGHT*0.6 },
  ];
  createCageTexture(sc);
  for (let i=0;i<positions.length;i++) {
    const {x,y}=positions[i];

    // Cage bars sprite
    const sprite = sc.add.sprite(x,y,'cage').setDepth(6);

    // Critter icon inside cage — bobs up and down
    const critterIcon = sc.add.text(x, y+4, CRITTERS[i], {fontSize:'28px'})
      .setOrigin(0.5).setDepth(5); // depth 5 = inside cage bars
    sc.tweens.add({
      targets: critterIcon, y: y - 8,
      duration: 700 + i*80, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Speech bubble (static graphics, drawn once above cage)
    const helpBubble = sc.add.graphics().setDepth(7);
    drawHelpBubble(helpBubble, x, y - 52);

    // HELP! text inside bubble
    const helpText = sc.add.text(x, y - 58, 'HELP!', {
      fontSize: '16px', fontFamily: 'Arial Black', color: '#cc2222',
    }).setOrigin(0.5).setDepth(8);
    // Slight pulse on the HELP text
    sc.tweens.add({
      targets: helpText, scaleX: 1.12, scaleY: 1.12,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Fly-out critter text (hidden until rescue)
    const critter = sc.add.text(x, y, CRITTERS[i], {fontSize:'36px'})
      .setOrigin(0.5).setDepth(9).setVisible(false);

    cages.push({ sprite, opened:false, critter, critterIcon, helpBubble, helpText });
  }
}

function drawHelpBubble(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const bw=62, bh=26, br=8;
  const bx=cx-bw/2, by=cy-bh/2;
  // White fill
  g.fillStyle(0xffffff, 0.92); g.fillRoundedRect(bx,by,bw,bh,br);
  // Red border
  g.lineStyle(2, 0xcc2222, 1); g.strokeRoundedRect(bx,by,bw,bh,br);
  // Bubble tail (small triangle pointing down toward critter)
  g.fillStyle(0xffffff,0.92);
  g.fillTriangle(cx-6,by+bh, cx+6,by+bh, cx,by+bh+10);
  g.lineStyle(2,0xcc2222,1);
  g.lineBetween(cx-6,by+bh, cx,by+bh+10);
  g.lineBetween(cx,by+bh+10, cx+6,by+bh);
}
function spawnEnemies(sc: Phaser.Scene): void {
  if (currentStage === 3) {
    createDCEnemyTexture(sc, 'melee_enemy', false);
    createDCEnemyTexture(sc, 'ranged_enemy', true);
    createBossProjTextures(sc);
  } else if (currentStage === 2) {
    createCityEnemyTexture(sc, 'melee_enemy', false);
    createCityEnemyTexture(sc, 'ranged_enemy', true);
  } else {
    createEnemyTexture(sc,'melee_enemy',false); createEnemyTexture(sc,'ranged_enemy',true);
  }
  createProjectileTexture(sc); createBeeDotTexture(sc); createSkeletonTexture(sc);
  const mp=[{x:LEVEL_WIDTH*0.2,y:LEVEL_HEIGHT*0.45},{x:LEVEL_WIDTH*0.8,y:LEVEL_HEIGHT*0.45},{x:LEVEL_WIDTH*0.5,y:LEVEL_HEIGHT*0.4},{x:LEVEL_WIDTH*0.35,y:LEVEL_HEIGHT*0.7},{x:LEVEL_WIDTH*0.65,y:LEVEL_HEIGHT*0.7}];
  const rp=[{x:LEVEL_WIDTH*0.15,y:LEVEL_HEIGHT*0.3},{x:LEVEL_WIDTH*0.85,y:LEVEL_HEIGHT*0.3},{x:LEVEL_WIDTH*0.5,y:LEVEL_HEIGHT*0.55}];
  for (const p of mp) spawnEnemy(sc,p.x,p.y,'melee');
  for (const p of rp) spawnEnemy(sc,p.x,p.y,'ranged');
}
function spawnEnemy(sc: Phaser.Scene, x: number, y: number, type: import('./types').EnemyType): void {
  const sprite=enemyGroup.create(x,y,type==='melee'?'melee_enemy':'ranged_enemy') as Phaser.Physics.Arcade.Sprite;
  sprite.setDepth(8).setCircle(24,8,8);
  (sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  const hpBar=sc.add.graphics().setDepth(9);
  const slowIcon=sc.add.text(x,y-45,'🐝 Slowed',{fontSize:'18px',color:'#ffff88'}).setOrigin(0.5).setDepth(11).setVisible(false);
  const e: Enemy={ sprite, type, state:'patrol',
    hp:type==='melee'?MELEE_HP:RANGED_HP, maxHp:type==='melee'?MELEE_HP:RANGED_HP,
    hpFrac:type==='melee'?MELEE_HP:RANGED_HP, slowTimer:0,
    attackCooldown:type==='melee'?MELEE_ATTACK_COOLDOWN:RANGED_SHOOT_COOLDOWN,
    patrolOriginX:x, patrolOriginY:y, hpBar, slowIcon };
  enemies.push(e); updateEnemyHpBar(e);
}

// ─── TEXTURES ───────────────────────────────────────────────────────────────────────
function createEnemyTexture(sc: Phaser.Scene, key: string, isRanged: boolean): void {
  const W=56,H=56,g=sc.make.graphics({},false);
  g.fillStyle(isRanged?0x994422:0x2244aa,1); g.fillRect(16,24,24,22);
  g.fillStyle(0xe8c49a,1); g.fillCircle(28,18,14);
  g.fillStyle(0x882222,1); g.fillRect(14,4,28,8); g.fillRect(18,2,20,6);
  g.fillStyle(0x333333,1); g.fillCircle(23,16,2); g.fillCircle(33,16,2);
  if (!isRanged){g.fillStyle(0x888888,1);g.fillRect(44,14,6,28);g.fillStyle(0x555555,1);g.fillRect(40,12,14,8);}
  else{g.fillStyle(0x664400,1);g.fillRect(42,18,4,20);g.lineStyle(2,0x442200,1);g.arc(44,28,12,-0.9,0.9,false);g.strokePath();}
  g.generateTexture(key,W,H); g.destroy();
}
function createProjectileTexture(sc: Phaser.Scene): void {
  const g=sc.make.graphics({},false);
  g.fillStyle(0xffaa00,1);g.fillCircle(8,8,8);g.fillStyle(0xff6600,0.7);g.fillCircle(8,8,5);
  g.generateTexture('projectile',16,16); g.destroy();
}
function createCageTexture(sc: Phaser.Scene): void {
  const W=52,H=56,g=sc.make.graphics({},false);
  g.fillStyle(0x888888,1);g.fillRect(0,0,W,6);g.fillRect(0,H-6,W,6);
  for(let i=0;i<=5;i++){const bx=Math.round((i/5)*(W-4));g.fillRect(bx,0,4,H);}
  g.generateTexture('cage',W,H); g.destroy();
}
function createBeeDotTexture(sc: Phaser.Scene): void {
  // 18x14 bee: yellow oval body, dark stripe, two white wings
  const g=sc.make.graphics({},false);
  // Wings (white, semi-transparent, behind body)
  g.fillStyle(0xddeeff,0.7); g.fillEllipse(4,4,10,6); g.fillEllipse(14,4,10,6);
  // Body
  g.fillStyle(COLORS.bee.body,1); g.fillEllipse(9,8,10,8);
  // Stripe
  g.fillStyle(0x1a1a00,0.9); g.fillRect(6,7,6,2);
  // Head
  g.fillStyle(0x1a1a00,1); g.fillCircle(14,8,3);
  // Eye
  g.fillStyle(0xffffff,1); g.fillCircle(15,7,1);
  g.generateTexture('bee_dot',18,14); g.destroy();
}
function createSkeletonTexture(sc: Phaser.Scene): void {
  // 56x56 skeleton lying on ground
  const W=56,H=40,g=sc.make.graphics({},false);
  const bone=0xddddcc, dark=0x888877;
  // Ribcage
  g.fillStyle(bone,1); g.fillEllipse(28,16,30,18);
  g.fillStyle(dark,1);
  for(let r=0;r<3;r++){g.fillRect(17,10+r*4,22,2);}
  // Skull (top-down, face-up, grimacing)
  g.fillStyle(bone,1); g.fillCircle(28,8,10);
  // Eye sockets
  g.fillStyle(0x333322,1); g.fillCircle(24,7,3); g.fillCircle(32,7,3);
  // Nose hole
  g.fillStyle(0x333322,1); g.fillRect(27,10,2,2);
  // Grimace mouth (jagged teeth on ground)
  g.fillStyle(0x333322,1); g.fillRect(22,13,12,3);
  g.fillStyle(bone,1);
  for(let t=0;t<4;t++){g.fillRect(23+t*3,13,2,2);}
  // Limb bones
  g.fillStyle(bone,1);
  // Left arm
  g.fillRoundedRect(6,18,14,4,2); g.fillRoundedRect(2,20,8,4,2);
  // Right arm
  g.fillRoundedRect(36,18,14,4,2); g.fillRoundedRect(46,20,8,4,2);
  // Legs
  g.fillRoundedRect(18,28,6,12,2); g.fillRoundedRect(22,28,6,12,2);
  g.fillRoundedRect(30,28,6,12,2); g.fillRoundedRect(34,28,6,12,2);
  g.generateTexture('skeleton',W,H); g.destroy();
}

// ─── TERRAIN ───────────────────────────────────────────────────────────────────────
function inBushZone(x: number, y: number): boolean {
  for (const r of bushZones) { if (r.contains(x, y)) return true; }
  return false;
}

function buildTerrain(sc: Phaser.Scene): void {
  if (currentStage === 3) { buildDCTerrain(sc); return; }
  if (currentStage === 2) { buildCityTerrain(sc); return; }
  // We use a small invisible rectangle at each trunk base as the blocker.
  const treePositions = [
    [55,300],[55,440],[40,580],[70,720],[45,860],[60,1000],[50,1140],[65,1280],[45,1420],[55,1560],
    [160,340],[150,520],[170,680],[155,840],[165,1020],[145,1180],[170,1340],[155,1500],
    [LEVEL_WIDTH-55,300],[LEVEL_WIDTH-55,440],[LEVEL_WIDTH-40,580],[LEVEL_WIDTH-70,720],
    [LEVEL_WIDTH-45,860],[LEVEL_WIDTH-60,1000],[LEVEL_WIDTH-50,1140],[LEVEL_WIDTH-65,1280],
    [LEVEL_WIDTH-45,1420],[LEVEL_WIDTH-55,1560],
    [LEVEL_WIDTH-160,340],[LEVEL_WIDTH-150,520],[LEVEL_WIDTH-170,680],[LEVEL_WIDTH-155,840],
    [LEVEL_WIDTH-165,1020],[LEVEL_WIDTH-145,1180],[LEVEL_WIDTH-170,1340],[LEVEL_WIDTH-155,1500],
    [200,160],[340,140],[480,155],[620,145],[760,160],[900,150],[LEVEL_WIDTH-240,160],[LEVEL_WIDTH-380,148],
    [260,260],[420,250],[560,255],[700,248],[840,258],[980,250],
    [200,LEVEL_HEIGHT-160],[340,LEVEL_HEIGHT-140],[480,LEVEL_HEIGHT-155],[620,LEVEL_HEIGHT-145],
    [760,LEVEL_HEIGHT-160],[900,LEVEL_HEIGHT-150],[LEVEL_WIDTH-240,LEVEL_HEIGHT-160],
    [260,LEVEL_HEIGHT-260],[420,LEVEL_HEIGHT-250],[560,LEVEL_HEIGHT-255],[700,LEVEL_HEIGHT-248],
    [240,580],[300,720],[220,960],[310,1100],[250,1350],[330,1480],
    [LEVEL_WIDTH-240,580],[LEVEL_WIDTH-300,720],[LEVEL_WIDTH-220,960],
    [LEVEL_WIDTH-310,1100],[LEVEL_WIDTH-250,1350],[LEVEL_WIDTH-330,1480],
  ];
  // Create invisible static physics body (16x16) per tree trunk
  for (const [tx, ty] of treePositions) {
    const body = terrainGroup.create(tx, ty, undefined as any) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false).setActive(true);
    body.body!.reset(tx, ty);
    (body.body as Phaser.Physics.Arcade.StaticBody).setCircle(16, -16, -16);
    body.refreshBody();
  }

  // ── Bush slow zones — one circle per tree, radius=50 (canopy edge) ──
  bushZones = treePositions.map(([tx, ty]) => new Phaser.Geom.Circle(tx, ty, 50));

  // ── Tent colliders — two triangle tents in the camp centre ──
  // Left tent: vertices approx (LEVEL_WIDTH/2-280, LEVEL_HEIGHT*0.5+60) → (LEVEL_WIDTH/2-120, LEVEL_HEIGHT*0.5+60)
  // Use a rectangle covering each tent footprint
  const tentW = 160, tentH = 60;
  const tentY = LEVEL_HEIGHT * 0.5 - tentH / 2;
  for (const tx of [LEVEL_WIDTH/2 - 200, LEVEL_WIDTH/2 + 200]) {
    const tb = terrainGroup.create(tx, tentY + tentH/2, undefined as any) as Phaser.Physics.Arcade.Sprite;
    tb.setVisible(false).setActive(true);
    (tb.body as Phaser.Physics.Arcade.StaticBody).setSize(tentW, tentH);
    (tb.body as Phaser.Physics.Arcade.StaticBody).reset(tx - tentW/2, tentY);
    tb.refreshBody();
  }
}

// ─── BACKGROUND ─────────────────────────────────────────────────────────────────────
function drawBackground(sc: Phaser.Scene): void {
  const g=sc.add.graphics().setDepth(0);
  g.fillStyle(COLORS.ground.base,1);g.fillRect(0,0,LEVEL_WIDTH,LEVEL_HEIGHT);
  for(let tx=0;tx<LEVEL_WIDTH;tx+=TILE)for(let ty=0;ty<LEVEL_HEIGHT;ty+=TILE)
    if((tx/TILE+ty/TILE)%2===0){g.fillStyle(COLORS.ground.dark,0.35);g.fillRect(tx,ty,TILE,TILE);}
  g.fillStyle(COLORS.ground.path,0.7);
  g.fillRect(0,LEVEL_HEIGHT*0.5-40,LEVEL_WIDTH,80); g.fillRect(LEVEL_WIDTH/2-40,0,80,LEVEL_HEIGHT);
  g.fillStyle(COLORS.ground.dirt,0.2); g.fillEllipse(LEVEL_WIDTH/2,LEVEL_HEIGHT*0.5,700,600);
  const d=sc.add.graphics().setDepth(1);
  const st=[[120,200],[660,180],[100,700],[700,650],[80,1200],[680,1300],[130,1600],[650,1550],[LEVEL_WIDTH-120,400],[LEVEL_WIDTH-80,900],[LEVEL_WIDTH-100,1400],[200,LEVEL_HEIGHT-200],[LEVEL_WIDTH-200,LEVEL_HEIGHT-180]];
  for(const[tx,ty]of st){d.fillStyle(0x5c3d1e,1);d.fillCircle(tx,ty,20);d.fillStyle(0x7a5530,1);d.fillCircle(tx,ty,14);d.fillStyle(0x8b7355,0.5);d.fillCircle(tx-4,ty-4,6);}
  const lg=[[300,350],[500,420],[250,900],[580,880],[320,1300],[460,1350]];
  for(const[lx,ly]of lg){d.fillStyle(0x5c3d1e,1);d.fillRoundedRect(lx-35,ly-10,70,20,8);d.fillStyle(0x8b7355,0.4);d.fillCircle(lx-30,ly,10);d.fillCircle(lx+30,ly,10);}
  d.fillStyle(0xcc8844,0.8);d.fillTriangle(LEVEL_WIDTH/2-200,LEVEL_HEIGHT*0.5-60,LEVEL_WIDTH/2-280,LEVEL_HEIGHT*0.5+60,LEVEL_WIDTH/2-120,LEVEL_HEIGHT*0.5+60);
  d.fillStyle(0xaa6622,0.8);d.fillTriangle(LEVEL_WIDTH/2+200,LEVEL_HEIGHT*0.5-60,LEVEL_WIDTH/2+120,LEVEL_HEIGHT*0.5+60,LEVEL_WIDTH/2+280,LEVEL_HEIGHT*0.5+60);
  drawTrees(sc);
}

function drawTrees(sc: Phaser.Scene): void {
  const t = sc.add.graphics().setDepth(3); // above ground, below sprites
  // Tree positions — clustered in the forest border, away from roads and camp centre
  const trees = [
    // Left forest edge
    [55,300],[55,440],[40,580],[70,720],[45,860],[60,1000],[50,1140],[65,1280],[45,1420],[55,1560],
    [160,340],[150,520],[170,680],[155,840],[165,1020],[145,1180],[170,1340],[155,1500],
    // Right forest edge
    [LEVEL_WIDTH-55,300],[LEVEL_WIDTH-55,440],[LEVEL_WIDTH-40,580],[LEVEL_WIDTH-70,720],
    [LEVEL_WIDTH-45,860],[LEVEL_WIDTH-60,1000],[LEVEL_WIDTH-50,1140],[LEVEL_WIDTH-65,1280],
    [LEVEL_WIDTH-45,1420],[LEVEL_WIDTH-55,1560],
    [LEVEL_WIDTH-160,340],[LEVEL_WIDTH-150,520],[LEVEL_WIDTH-170,680],[LEVEL_WIDTH-155,840],
    [LEVEL_WIDTH-165,1020],[LEVEL_WIDTH-145,1180],[LEVEL_WIDTH-170,1340],[LEVEL_WIDTH-155,1500],
    // Top forest band (above camp)
    [200,160],[340,140],[480,155],[620,145],[760,160],[900,150],[LEVEL_WIDTH-240,160],[LEVEL_WIDTH-380,148],
    [260,260],[420,250],[560,255],[700,248],[840,258],[980,250],
    // Bottom forest band (below bear start)
    [200,LEVEL_HEIGHT-160],[340,LEVEL_HEIGHT-140],[480,LEVEL_HEIGHT-155],[620,LEVEL_HEIGHT-145],
    [760,LEVEL_HEIGHT-160],[900,LEVEL_HEIGHT-150],[LEVEL_WIDTH-240,LEVEL_HEIGHT-160],
    [260,LEVEL_HEIGHT-260],[420,LEVEL_HEIGHT-250],[560,LEVEL_HEIGHT-255],[700,LEVEL_HEIGHT-248],
    // Scattered interior trees (not on the dirt road or camp ellipse)
    [240,580],[300,720],[220,960],[310,1100],[250,1350],[330,1480],
    [LEVEL_WIDTH-240,580],[LEVEL_WIDTH-300,720],[LEVEL_WIDTH-220,960],
    [LEVEL_WIDTH-310,1100],[LEVEL_WIDTH-250,1350],[LEVEL_WIDTH-330,1480],
  ];
  for (const [tx, ty] of trees) {
    // Shadow / trunk base
    t.fillStyle(0x1a3010, 0.5);
    t.fillEllipse(tx + 6, ty + 8, 44, 20);
    // Outer canopy (dark ring)
    t.fillStyle(0x1e4a10, 1);
    t.fillCircle(tx, ty, 26);
    // Mid canopy
    t.fillStyle(0x2e6a1a, 1);
    t.fillCircle(tx - 3, ty - 4, 20);
    // Highlight cap
    t.fillStyle(0x3e8a24, 1);
    t.fillCircle(tx - 5, ty - 8, 13);
    // Bright specular spot
    t.fillStyle(0x5ab030, 0.7);
    t.fillCircle(tx - 7, ty - 11, 6);
  }
}

// ─── CITY BACKGROUND (Stage 2) ──────────────────────────────────────────────────────
function drawCityBackground(sc: Phaser.Scene): void {
  const g = sc.add.graphics().setDepth(0);
  const C = COLORS.city;

  // Base asphalt fill
  g.fillStyle(C.asphalt, 1);
  g.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

  // Checker variation
  for (let tx = 0; tx < LEVEL_WIDTH; tx += TILE)
    for (let ty = 0; ty < LEVEL_HEIGHT; ty += TILE)
      if ((tx/TILE + ty/TILE) % 2 === 0) { g.fillStyle(C.asphaltDark, 0.3); g.fillRect(tx, ty, TILE, TILE); }

  // Sidewalks (thick borders on left/right)
  g.fillStyle(C.sidewalk, 1);
  g.fillRect(0, 0, 130, LEVEL_HEIGHT);
  g.fillRect(LEVEL_WIDTH - 130, 0, 130, LEVEL_HEIGHT);
  g.fillStyle(C.sidewalkDark, 1);
  g.fillRect(128, 0, 4, LEVEL_HEIGHT);
  g.fillRect(LEVEL_WIDTH - 132, 0, 4, LEVEL_HEIGHT);

  // Horizontal sidewalks (top/bottom)
  g.fillStyle(C.sidewalk, 1);
  g.fillRect(0, 0, LEVEL_WIDTH, 100);
  g.fillRect(0, LEVEL_HEIGHT - 100, LEVEL_WIDTH, 100);

  // Main road lane lines (vertical centre)
  g.fillStyle(C.line, 0.8);
  const laneX = LEVEL_WIDTH / 2;
  for (let dy = 0; dy < LEVEL_HEIGHT; dy += 80) {
    g.fillRect(laneX - 3, dy, 6, 44);
  }
  // Horizontal road lines
  for (let dx = 140; dx < LEVEL_WIDTH - 140; dx += 80) {
    g.fillRect(dx, LEVEL_HEIGHT / 2 - 3, 44, 6);
  }

  // Buildings on left and right sidewalks
  const d = sc.add.graphics().setDepth(1);
  const buildingPositions: [number, number, number, number][] = [
    // [x, y, w, h]
    [4, 160, 118, 180],  [4, 380, 118, 140],  [4, 560, 118, 200],
    [4, 800, 118, 160],  [4, 1000, 118, 180], [4, 1220, 118, 200],
    [4, 1460, 118, 160], [4, 1680, 118, 180],
    [LEVEL_WIDTH - 122, 160, 118, 180], [LEVEL_WIDTH - 122, 380, 118, 140],
    [LEVEL_WIDTH - 122, 560, 118, 200], [LEVEL_WIDTH - 122, 800, 118, 160],
    [LEVEL_WIDTH - 122, 1000, 118, 180],[LEVEL_WIDTH - 122, 1220, 118, 200],
    [LEVEL_WIDTH - 122, 1460, 118, 160],[LEVEL_WIDTH - 122, 1680, 118, 180],
  ];
  for (const [bx, by, bw, bh] of buildingPositions) {
    // Building face
    d.fillStyle(C.building, 1);     d.fillRect(bx, by, bw, bh);
    d.fillStyle(C.buildingDark, 1); d.fillRect(bx, by, bw, 6);   // roofline
    d.lineStyle(1, C.buildingDark, 1); d.strokeRect(bx, by, bw, bh);
    // Windows grid
    const cols = Math.floor(bw / 28), rows = Math.floor(bh / 36);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = bx + 8 + c * 28, wy = by + 14 + r * 36;
        const lit = Math.random() > 0.35;
        d.fillStyle(lit ? C.windowLit : C.window, 0.85);
        d.fillRect(wx, wy, 16, 20);
      }
    }
  }

  // Crosswalk stripes
  d.fillStyle(0xeeeecc, 0.6);
  const cwY = [LEVEL_HEIGHT * 0.33, LEVEL_HEIGHT * 0.66];
  for (const cy2 of cwY) {
    for (let cx2 = 140; cx2 < LEVEL_WIDTH - 140; cx2 += 28)
      d.fillRect(cx2, cy2 - 20, 16, 40);
  }

  // Ground detail: manhole covers
  for (const [mx, my] of [[LEVEL_WIDTH*0.3,LEVEL_HEIGHT*0.25],[LEVEL_WIDTH*0.7,LEVEL_HEIGHT*0.45],[LEVEL_WIDTH*0.5,LEVEL_HEIGHT*0.6],[LEVEL_WIDTH*0.4,LEVEL_HEIGHT*0.75]]) {
    d.fillStyle(0x555555, 1); d.fillCircle(mx, my, 18);
    d.fillStyle(0x444444, 1); d.fillCircle(mx, my, 14);
    d.lineStyle(2, 0x666666, 1); d.strokeCircle(mx, my, 16);
    d.lineBetween(mx - 12, my, mx + 12, my); d.lineBetween(mx, my - 12, mx, my + 12);
  }

  // Fire hydrants (decorative)
  for (const [hx, hy] of [[160, 320],[160, 720],[160, 1100],[160, 1500],[LEVEL_WIDTH-160,440],[LEVEL_WIDTH-160,900],[LEVEL_WIDTH-160,1300]]) {
    d.fillStyle(0xdd2222, 1); d.fillRect(hx - 8, hy - 14, 16, 20);
    d.fillStyle(0xaa1111, 1); d.fillRect(hx - 10, hy + 4, 20, 6);
    d.fillStyle(0xffaa00, 1); d.fillCircle(hx, hy - 14, 6);
  }
}

// ─── CITY TERRAIN (stage 2 blockers + slow zones) ────────────────────────────────────
function buildCityTerrain(sc: Phaser.Scene): void {
  // Wall blockers: building facades on left/right edges
  const wallRects: [number, number, number, number][] = [
    // [x, y, w, h] — covers the building areas on the sidewalk edges
    [0, 100, 128, LEVEL_HEIGHT - 200],         // entire left building strip
    [LEVEL_WIDTH - 128, 100, 128, LEVEL_HEIGHT - 200], // entire right building strip
    // Top & bottom walls
    [0, 0, LEVEL_WIDTH, 100],
    [0, LEVEL_HEIGHT - 100, LEVEL_WIDTH, 100],
  ];
  for (const [rx, ry, rw, rh] of wallRects) {
    const body = terrainGroup.create(rx + rw/2, ry + rh/2, undefined as any) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false).setActive(true);
    (body.body as Phaser.Physics.Arcade.StaticBody).setSize(rw, rh);
    (body.body as Phaser.Physics.Arcade.StaticBody).reset(rx, ry);
    body.refreshBody();
  }

  // Parked cars — solid blockers in two rows
  const carPositions: [number, number][] = [
    [200, 350],[200, 520],[200, 700],[200, 880],[200, 1050],[200, 1230],[200, 1410],[200, 1580],
    [LEVEL_WIDTH-200, 350],[LEVEL_WIDTH-200, 520],[LEVEL_WIDTH-200, 700],[LEVEL_WIDTH-200, 880],
    [LEVEL_WIDTH-200, 1050],[LEVEL_WIDTH-200, 1230],[LEVEL_WIDTH-200, 1410],[LEVEL_WIDTH-200, 1580],
  ];
  const carG = sc.add.graphics().setDepth(2);
  for (const [cx3, cy3] of carPositions) {
    // Draw car
    const facing = cx3 < LEVEL_WIDTH / 2 ? 1 : -1;
    drawCityCarAt(carG, cx3, cy3, facing);
    // Physics blocker (car body footprint)
    const body = terrainGroup.create(cx3, cy3, undefined as any) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false).setActive(true);
    (body.body as Phaser.Physics.Arcade.StaticBody).setSize(70, 36);
    (body.body as Phaser.Physics.Arcade.StaticBody).reset(cx3 - 35, cy3 - 18);
    body.refreshBody();
  }

  // Dumpsters — solid blockers + mild slow zones
  const dumpPositions: [number, number][] = [
    [280, 440],[280, 800],[280, 1150],[280, 1490],
    [LEVEL_WIDTH-280, 440],[LEVEL_WIDTH-280, 800],[LEVEL_WIDTH-280, 1150],[LEVEL_WIDTH-280, 1490],
    [LEVEL_WIDTH/2 - 200, LEVEL_HEIGHT*0.4],[LEVEL_WIDTH/2 + 200, LEVEL_HEIGHT*0.6],
  ];
  const dumpG = sc.add.graphics().setDepth(3);
  for (const [dx2, dy2] of dumpPositions) {
    drawDumpsterAt(dumpG, dx2, dy2);
    const body = terrainGroup.create(dx2, dy2, undefined as any) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false).setActive(true);
    (body.body as Phaser.Physics.Arcade.StaticBody).setSize(44, 32);
    (body.body as Phaser.Physics.Arcade.StaticBody).reset(dx2 - 22, dy2 - 16);
    body.refreshBody();
    // Slow zone (alley gunk smell radius)
    bushZones.push(new Phaser.Geom.Circle(dx2, dy2, 55));
  }

  // Benches — moderate slow zones, no hard block
  const benchPositions: [number, number][] = [
    [175, 250],[175, 620],[175, 990],[175, 1350],
    [LEVEL_WIDTH-175, 250],[LEVEL_WIDTH-175, 620],[LEVEL_WIDTH-175, 990],[LEVEL_WIDTH-175, 1350],
  ];
  const benchG = sc.add.graphics().setDepth(2);
  for (const [bx2, by2] of benchPositions) {
    drawBenchAt(benchG, bx2, by2);
    bushZones.push(new Phaser.Geom.Circle(bx2, by2, 36));
  }
}

function drawCityCarAt(g: Phaser.GameObjects.Graphics, cx3: number, cy3: number, facing: number): void {
  // Body (top-down)
  g.fillStyle(Phaser.Math.RND.pick([0x2255aa, 0xaa2222, 0x228833, 0x888888, 0x994400]), 1);
  g.fillRoundedRect(cx3 - 36, cy3 - 18, 72, 36, 6);
  // Windshield
  g.fillStyle(0xaaddff, 0.7);
  const wsX = cx3 + facing * 10;
  g.fillRoundedRect(wsX - 16, cy3 - 12, 32, 24, 3);
  // Wheels
  g.fillStyle(0x111111, 1);
  g.fillRect(cx3 - 36, cy3 - 18, 10, 8); g.fillRect(cx3 + 26, cy3 - 18, 10, 8);
  g.fillRect(cx3 - 36, cy3 + 10, 10, 8); g.fillRect(cx3 + 26, cy3 + 10, 10, 8);
  // Headlights
  g.fillStyle(0xffffaa, 1);
  const hlX = cx3 + facing * 34;
  g.fillRect(hlX - 4, cy3 - 14, 8, 6); g.fillRect(hlX - 4, cy3 + 8, 8, 6);
}

function drawDumpsterAt(g: Phaser.GameObjects.Graphics, dx2: number, dy2: number): void {
  g.fillStyle(0x336633, 1); g.fillRect(dx2 - 22, dy2 - 16, 44, 32);
  g.fillStyle(0x224422, 1); g.fillRect(dx2 - 22, dy2 - 16, 44, 8);
  g.lineStyle(2, 0x111111, 1); g.strokeRect(dx2 - 22, dy2 - 16, 44, 32);
  // Lid line
  g.lineStyle(2, 0x224422, 1); g.lineBetween(dx2 - 22, dy2 - 8, dx2 + 22, dy2 - 8);
}

function drawBenchAt(g: Phaser.GameObjects.Graphics, bx2: number, by2: number): void {
  // Bench seat
  g.fillStyle(0x8b6914, 1); g.fillRoundedRect(bx2 - 26, by2 - 6, 52, 12, 3);
  // Bench legs
  g.fillStyle(0x555555, 1); g.fillRect(bx2 - 22, by2 + 4, 6, 8); g.fillRect(bx2 + 16, by2 + 4, 6, 8);
  // Backrest
  g.fillStyle(0x6b4f10, 1); g.fillRoundedRect(bx2 - 26, by2 - 16, 52, 8, 2);
}

// ─── CITY ENEMY TEXTURES (security guard + cop) ──────────────────────────────────────
function createCityEnemyTexture(sc: Phaser.Scene, key: string, isRanged: boolean): void {
  const W=56, H=56, g=sc.make.graphics({},false);
  // Body — dark navy uniform
  g.fillStyle(isRanged ? 0x1a2a4a : 0x2a3a5a, 1); g.fillRect(16, 24, 24, 22);
  // Head — skin tone
  g.fillStyle(0xe8c49a, 1); g.fillCircle(28, 18, 14);
  // Cap — dark blue
  g.fillStyle(0x1a1a3a, 1); g.fillRect(14, 4, 28, 8); g.fillRect(18, 2, 20, 6);
  // Cap badge — gold star
  g.fillStyle(0xf5c542, 1); g.fillCircle(28, 8, 4);
  // Eyes
  g.fillStyle(0x333333, 1); g.fillCircle(23, 16, 2); g.fillCircle(33, 16, 2);
  if (!isRanged) {
    // Security guard: baton
    g.fillStyle(0x222222, 1); g.fillRect(44, 14, 5, 28);
    g.fillStyle(0x444444, 1); g.fillRect(40, 12, 12, 8);
    // Badge on chest
    g.fillStyle(0xf5c542, 1); g.fillRect(24, 28, 8, 10);
    g.fillStyle(0x1a2a4a, 1); g.fillRect(25, 30, 6, 6);
  } else {
    // Cop: pistol
    g.fillStyle(0x222222, 1); g.fillRect(42, 22, 5, 14);
    g.fillStyle(0x333333, 1); g.fillRect(42, 18, 8, 6);
    // Police badge
    g.fillStyle(0xf5c542, 1); g.fillRect(24, 28, 8, 10);
    g.fillStyle(0x1a2a4a, 1); g.fillCircle(28, 33, 3);
  }
  g.generateTexture(key, W, H); g.destroy();
}

// ─── BOSS SYSTEM (Stage 3) ──────────────────────────────────────────────────────────────

function spawnBoss(sc: Phaser.Scene, x: number, y: number): void {
  const sprite  = sc.add.graphics().setDepth(12);
  const hpBar   = sc.add.graphics().setDepth(14);
  const nameText = sc.add.text(x, y - BOSS_RADIUS - 30, '???', {
    fontSize: '22px', fontFamily: 'Arial Black', color: '#440044',
    stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5, 1).setDepth(14).setAlpha(0.0);

  const heads: import('./types').BossHead[] = [
    { name: 'elon',  label: 'Elon',  attackType: 'slash',      attackColor: 0xcc0000, attackIcon: '⚡', cooldown: 0,    cooldownMax: 4200, exprIdx: 0, exprTimer: 1200 },
    { name: 'zuck',  label: 'Zuck',  attackType: 'projectile', attackColor: 0x1877f2, attackIcon: '👍', cooldown: 1400, cooldownMax: 3200, exprIdx: 1, exprTimer: 2000 },
    { name: 'sam',   label: 'Sam',   attackType: 'timebomb',   attackColor: 0x10a37f, attackIcon: '🤖', cooldown: 2800, cooldownMax: 5500, exprIdx: 2, exprTimer: 1600 },
    { name: 'jeff',  label: 'Jeff',  attackType: 'artillery',  attackColor: 0xff9900, attackIcon: '📦', cooldown: 700,  cooldownMax: 4800, exprIdx: 3, exprTimer: 2400 },
  ];

  boss = {
    x, y, hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, hpFrac: BOSS_MAX_HP,
    state: 'dormant', sprite, hpBar, nameText,
    awakenTimer: 0, pulseT: 0,
    heads, timeBombs: [],
    slashGraphic: null, slashTimer: 0, stunTimer: 0,
  };
  SFX.bossSpawn();
  drawBossBlob(boss);
}

function awakenBoss(b: Boss): void {
  b.state = 'awakening';
  b.awakenTimer = BOSS_AWAKEN_MS;
  showFloatingText(b.x, b.y - 120, '⚠ SYSTEM ALERT ⚠', '#ff2222');
  scene.cameras.main.shake(400, 0.012);
  // Stop stage BGM, play explosion, then start boss BGM after entrance drone finishes
  // Timeline: explosion (~1.2s) + awaken animation (2.2s) + bossAppear drone (~2.9s) ≈ 5.5s
  BGM.stop();
  SFX.bossSpawn();
  setTimeout(() => BGM.startBoss(), 5500);
  // Reveal name
  scene.tweens.add({ targets: b.nameText, alpha: 1, duration: 600, ease: 'Power2' });
}

function updateBoss(b: Boss, delta: number): void {
  b.pulseT += delta;

  if (b.state === 'dormant') {
    drawBossBlob(b);
    return;
  }

  if (b.state === 'awakening') {
    b.awakenTimer -= delta;
    drawBossAwakening(b);
    if (b.awakenTimer <= 0) {
      b.state = 'active';
      b.nameText.setText('BIG TECH CHIMERA');
      scene.cameras.main.shake(300, 0.018);
      showBossAppearBanner();
    }
    return;
  }

  if (b.state === 'dead') return;

  // --- ACTIVE ---
  if (b.stunTimer > 0) {
    b.stunTimer -= delta;
  } else {
    // Move toward bear
    const dx = bear.x - b.x, dy = bear.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const spd = (BOSS_SPEED * delta) / 1000;
    if (dist > BOSS_RADIUS + BEAR_RADIUS) {
      b.x += (dx / dist) * spd;
      b.y += (dy / dist) * spd;
    }
    // Tick head attack cooldowns
    for (const head of b.heads) {
      if (head.cooldown > 0) head.cooldown -= delta;
      if (head.cooldown <= 0) {
        fireHeadAttack(b, head);
        head.cooldown = head.cooldownMax;
      }
    }
  }

  // Tick head expression timers
  const EXPR_COUNT = 5;
  const EXPR_DURATIONS = [1800, 1200, 900, 1400, 1000]; // ms per expression
  for (const head of b.heads) {
    head.exprTimer -= delta;
    if (head.exprTimer <= 0) {
      head.exprIdx = (head.exprIdx + 1) % EXPR_COUNT;
      head.exprTimer = EXPR_DURATIONS[head.exprIdx] + Math.random() * 600;
    }
  }

  // Update time bombs
  updateTimeBombs(b, delta);

  // Slash visual decay
  if (b.slashTimer > 0) {
    b.slashTimer -= delta;
    if (b.slashTimer <= 0 && b.slashGraphic) {
      b.slashGraphic.clear();
    }
  }

  // Melee contact damage
  if (Phaser.Math.Distance.Between(b.x, b.y, bear.x, bear.y) < BOSS_RADIUS + BEAR_RADIUS) {
    damageBear(1, b.x, b.y);
  }

  drawBossActive(b);
  refreshBossHud(b);
  b.nameText.setPosition(b.x, b.y - BOSS_RADIUS - 30);
}

// ── Head attacks ──────────────────────────────────────────────────────────────
function fireHeadAttack(b: Boss, head: import('./types').BossHead): void {
  const dx = bear.x - b.x, dy = bear.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist, ny = dy / dist;

  // Telegraph flash
  showFloatingText(b.x, b.y - BOSS_RADIUS - 60, head.attackIcon, '#ffffff');
  SFX.bossAttack(head.attackType);

  switch (head.attackType) {
    case 'projectile': {
      // Zuck — Facebook blue slow homing blob
      const s = projectileGroup.create(b.x, b.y, 'boss_proj_fb') as Phaser.Physics.Arcade.Sprite;
      s.setDepth(10);
      (s.body as Phaser.Physics.Arcade.Body).setVelocity(nx * 140, ny * 140).setAllowGravity(false);
      projectiles.push({ sprite: s, vx: nx * 140, vy: ny * 140 });
      scene.time.delayedCall(5000, () => { if (s.active) s.destroy(); projectiles = projectiles.filter(p => p.sprite !== s); });
      break;
    }
    case 'artillery': {
      // Jeff — Amazon orange: target-circle telegraph then delayed impact
      const tx = bear.x + (Math.random() - 0.5) * 160;
      const ty = bear.y + (Math.random() - 0.5) * 160;
      const warn = scene.add.graphics().setDepth(11);
      warn.lineStyle(4, 0xff9900, 0.85); warn.strokeCircle(tx, ty, 55);
      warn.fillStyle(0xff9900, 0.18);    warn.fillCircle(tx, ty, 55);
      const warningText = scene.add.text(tx, ty - 62, '📦', { fontSize: '28px' }).setOrigin(0.5).setDepth(12);
      scene.time.delayedCall(1200, () => {
        warn.destroy(); warningText.destroy();
        // Detonation
        const boom = scene.add.graphics().setDepth(11);
        boom.fillStyle(0xff9900, 0.7); boom.fillCircle(tx, ty, 55);
        scene.time.delayedCall(220, () => boom.destroy());
        if (Phaser.Math.Distance.Between(bear.x, bear.y, tx, ty) < 55 + BEAR_RADIUS)
          damageBear(1, tx, ty);
      });
      break;
    }
    case 'timebomb': {
      // Sam — ChatGPT teal: placed bomb with visible countdown, large blast
      const bx = b.x + nx * 120 + (Math.random() - 0.5) * 80;
      const by = b.y + ny * 120 + (Math.random() - 0.5) * 80;
      const bombG = scene.add.graphics().setDepth(11);
      const bomb: import('./types').BossTimeBomb = { sprite: bombG, x: bx, y: by, timer: 2800, radius: 90, warned: false };
      b.timeBombs.push(bomb);
      drawTimeBomb(bomb);
      break;
    }
    case 'slash': {
      // Elon — Tesla red: wide arc melee slash in bear's direction
      if (!b.slashGraphic) b.slashGraphic = scene.add.graphics().setDepth(13);
      const sg = b.slashGraphic;
      sg.clear();
      const angle = Math.atan2(dy, dx);
      sg.lineStyle(10, 0xcc0000, 0.85);
      sg.beginPath();
      sg.arc(b.x, b.y, BOSS_RADIUS + 30, angle - 0.75, angle + 0.75, false);
      sg.strokePath();
      sg.lineStyle(4, 0xff6644, 0.6);
      sg.beginPath();
      sg.arc(b.x, b.y, BOSS_RADIUS + 50, angle - 0.55, angle + 0.55, false);
      sg.strokePath();
      b.slashTimer = 380;
      if (dist < BOSS_RADIUS + 90) damageBear(2, b.x, b.y);
      break;
    }
  }
}

// ── Time bombs ────────────────────────────────────────────────────────────────
function drawTimeBomb(bomb: import('./types').BossTimeBomb): void {
  const g = bomb.sprite;
  g.clear();
  const pct = bomb.timer / 2800;
  const col = pct > 0.5 ? 0x10a37f : pct > 0.25 ? 0xffaa00 : 0xff2222;
  g.fillStyle(0x000000, 0.5); g.fillCircle(bomb.x, bomb.y, 18);
  g.lineStyle(3, col, 0.9);   g.strokeCircle(bomb.x, bomb.y, 18);
  g.fillStyle(col, 1);        g.fillCircle(bomb.x, bomb.y, 8);
  // Countdown arc
  g.lineStyle(4, col, 0.7);
  g.beginPath();
  g.arc(bomb.x, bomb.y, 22, -Math.PI / 2, -Math.PI / 2 + (1 - pct) * Math.PI * 2, false);
  g.strokePath();
  // Blast radius ring (faint)
  g.lineStyle(1, col, 0.22); g.strokeCircle(bomb.x, bomb.y, bomb.radius);
}

function updateTimeBombs(b: Boss, delta: number): void {
  for (let i = b.timeBombs.length - 1; i >= 0; i--) {
    const bomb = b.timeBombs[i];
    bomb.timer -= delta;
    if (!bomb.warned && bomb.timer < 700) {
      bomb.warned = true;
      scene.cameras.main.shake(120, 0.006);
    }
    drawTimeBomb(bomb);
    if (bomb.timer <= 0) {
      // Detonate
      bomb.sprite.clear();
      bomb.sprite.destroy();
      b.timeBombs.splice(i, 1);
      const boom = scene.add.graphics().setDepth(12);
      boom.fillStyle(0x10a37f, 0.65); boom.fillCircle(bomb.x, bomb.y, bomb.radius);
      boom.lineStyle(3, 0xaaffee, 0.8); boom.strokeCircle(bomb.x, bomb.y, bomb.radius);
      scene.cameras.main.shake(200, 0.014);
      scene.time.delayedCall(300, () => boom.destroy());
      if (Phaser.Math.Distance.Between(bear.x, bear.y, bomb.x, bomb.y) < bomb.radius + BEAR_RADIUS)
        damageBear(2, bomb.x, bomb.y);
    }
  }
}

// ── Boss bee-sting damage ─────────────────────────────────────────────────────
function stingBoss(b: Boss, delta: number): void {
  if (b.state !== 'active') return;
  b.hpFrac -= (BEE_DPS * delta) / 1000;
  b.hp = Math.max(0, Math.ceil(b.hpFrac));
  b.stunTimer = Math.min((b.stunTimer || 0) + BOSS_STUN_PER_STING, 600);
  // Tint flash
  b.sprite.setAlpha(0.6);
  SFX.bossHurt();
  scene.time.delayedCall(120, () => { if (b.sprite) b.sprite.setAlpha(1); });
  if (b.hpFrac <= 0) killBoss(b);
}

function killBoss(b: Boss): void {
  b.state = 'dead';
  b.sprite.clear();
  b.hpBar.clear();
  // Clean up any remaining bombs
  for (const bomb of b.timeBombs) { bomb.sprite.destroy(); }
  b.timeBombs = [];
  if (b.slashGraphic) b.slashGraphic.clear();
  // Big explosion sequence
  for (let i = 0; i < 6; i++) {
    scene.time.delayedCall(i * 200, () => {
      const ex = b.x + (Math.random() - 0.5) * 160;
      const ey = b.y + (Math.random() - 0.5) * 160;
      const boom = scene.add.graphics().setDepth(15);
      const col = [0xff4400, 0xffaa00, 0x00ffcc, 0xff2222][i % 4];
      boom.fillStyle(col, 0.8); boom.fillCircle(ex, ey, 40 + Math.random() * 30);
      scene.time.delayedCall(350, () => boom.destroy());
    });
  }
  scene.cameras.main.shake(500, 0.022);
  BGM.stop();
  SFX.bossClear();
  b.nameText.setText('** DEFEATED **').setColor('#00ffcc');
  // Fade out the soulslike HUD bar
  scene.tweens.add({ targets: [bossHudBg, bossHudBar, bossHudNameText], alpha: 0, duration: 1200, delay: 400 });
  scene.time.delayedCall(1400, () => triggerLevelComplete());
}

// ── Boss draw routines (banner, hud, blob, active) ─────────────────────────
function drawBossBlob(b: Boss): void {
  const g = b.sprite; g.clear();
  const t = b.pulseT / 1000;
  const r = BOSS_RADIUS * (0.85 + 0.1 * Math.sin(t * 1.8));
  // Shadowy black blob with dark purple shimmer
  g.fillStyle(0x0a0008, 0.92); g.fillCircle(b.x, b.y, r);
  g.lineStyle(3, 0x330033, 0.7); g.strokeCircle(b.x, b.y, r);
  // Mystery ? mark
  const qAlpha = 0.3 + 0.25 * Math.sin(t * 2.2);
  g.fillStyle(0x440044, qAlpha); g.fillCircle(b.x, b.y, r * 0.45);
}

function drawBossAwakening(b: Boss): void {
  const g = b.sprite; g.clear();
  const t = b.pulseT / 1000;
  const prog = 1 - (b.awakenTimer / BOSS_AWAKEN_MS);
  const r = BOSS_RADIUS * (0.85 + 0.18 * Math.sin(t * 5));
  // Blob cracking open — shifting from black to coloured
  g.fillStyle(0x0a0008, 0.9); g.fillCircle(b.x, b.y, r);
  // Crack lines radiating out
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + t * 0.4;
    const len = r * prog * (0.6 + 0.4 * Math.sin(t * 3 + i));
    g.lineStyle(2, 0xff2222, prog * 0.8);
    g.lineBetween(b.x, b.y, b.x + Math.cos(angle) * len, b.y + Math.sin(angle) * len);
  }
  g.lineStyle(4, 0xff0044, prog * 0.9); g.strokeCircle(b.x, b.y, r);
}

const HEAD_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]; // top, right, bottom, left
// head order: elon(top), zuck(right), sam(bottom), jeff(left)

function drawBossActive(b: Boss): void {
  const g = b.sprite; g.clear();
  const t = b.pulseT / 1000;
  const r = BOSS_RADIUS;

  // Central body — dark pulsing mass
  g.fillStyle(0x110011, 1); g.fillCircle(b.x, b.y, r);
  g.lineStyle(3, 0x440044, 0.9); g.strokeCircle(b.x, b.y, r);

  // Stun indicator
  if (b.stunTimer > 0) {
    g.lineStyle(5, 0xffff00, 0.7); g.strokeCircle(b.x, b.y, r + 6);
  }

  // Draw each of the 4 heads on the perimeter — ring rotates slowly
  const ringRotation = t * 0.28; // ~0.28 rad/s = one full rotation every ~22s
  for (let i = 0; i < 4; i++) {
    const head = b.heads[i];
    const angle = HEAD_ANGLES[i] + ringRotation;
    const hx = b.x + Math.cos(angle) * (r - 4);
    const hy = b.y + Math.sin(angle) * (r - 4);
    drawBossHead(g, hx, hy, head, t, i);
  }

  // HP fraction display as glowing ring segments
  const hpPct = b.hpFrac / b.maxHp;
  g.lineStyle(6, hpPct > 0.5 ? 0x00ffcc : hpPct > 0.25 ? 0xffaa00 : 0xff2222, 0.8);
  g.beginPath();
  g.arc(b.x, b.y, r + 10, -Math.PI / 2, -Math.PI / 2 + hpPct * Math.PI * 2, false);
  g.strokePath();
}

function drawBossHead(
  g: Phaser.GameObjects.Graphics,
  hx: number, hy: number,
  head: import('./types').BossHead,
  t: number, idx: number
): void {
  const bob = Math.sin(t * 1.4 + idx * 1.1) * 3;
  const by2 = hy + bob;
  const expr = head.exprIdx; // 0=neutral 1=grin 2=shout 3=scream 4=red-eye

  if (head.name === 'elon') {
    const skin = 0xf0d5b0;
    g.fillStyle(skin, 1);
    g.fillRoundedRect(hx - 22, by2 - 26, 44, 50, { tl:10, tr:10, bl:14, br:14 });
    g.fillStyle(0x6b4a28, 1);
    g.fillRect(hx - 22, by2 - 36, 44, 16);
    g.fillRoundedRect(hx - 20, by2 - 38, 40, 14, 5);
    g.fillStyle(skin, 1);
    g.fillTriangle(hx - 4, by2 - 32, hx + 4, by2 - 32, hx, by2 - 26);
    g.fillStyle(0x5a3a18, 1);
    g.fillRoundedRect(hx - 18, by2 - 18, 14, 5, 2);
    g.fillRoundedRect(hx + 4,  by2 - 18, 14, 5, 2);
    g.fillStyle(skin, 1);
    g.fillEllipse(hx - 23, by2 - 5, 8, 12);
    g.fillEllipse(hx + 23, by2 - 5, 8, 12);
    g.fillStyle(0xd4b090, 1);
    g.fillRoundedRect(hx - 8, by2 - 4, 16, 10, 4);
    g.fillStyle(0xb8906a, 1);
    g.fillCircle(hx - 5, by2 + 4, 4); g.fillCircle(hx + 5, by2 + 4, 4);
    drawHeadExpression(g, hx, by2, skin, 0x6a9ad0, expr);
    g.fillStyle(0xcc0000, 1);
    g.fillTriangle(hx - 5, by2 + 22, hx + 5, by2 + 22, hx + 1, by2 + 30);
    g.fillTriangle(hx + 1, by2 + 28, hx + 7, by2 + 34, hx - 3, by2 + 34);

  } else if (head.name === 'zuck') {
    const skin = 0xf5d5b5;
    g.fillStyle(skin, 1); g.fillCircle(hx, by2, 28);
    g.fillStyle(0x4a2e10, 1);
    g.fillRect(hx - 28, by2 - 36, 56, 18);
    g.fillRoundedRect(hx - 26, by2 - 36, 52, 20, { tl:14, tr:14, bl:0, br:0 });
    g.fillRect(hx - 28, by2 - 20, 8, 16);
    g.fillRect(hx + 20, by2 - 20, 8, 16);
    g.fillStyle(0x5a3a18, 0.6);
    g.fillRect(hx - 17, by2 - 19, 12, 2);
    g.fillRect(hx + 5,  by2 - 19, 12, 2);
    g.fillStyle(skin, 1);
    g.fillEllipse(hx - 29, by2 - 3, 8, 12); g.fillEllipse(hx + 29, by2 - 3, 8, 12);
    g.fillStyle(0xe0b898, 1); g.fillCircle(hx, by2 + 2, 4);
    g.fillStyle(0xc89870, 1); g.fillCircle(hx - 3, by2 + 5, 2); g.fillCircle(hx + 3, by2 + 5, 2);
    drawHeadExpression(g, hx, by2, skin, 0x7b4f20, expr);
    g.fillStyle(0x1877f2, 1); g.fillRoundedRect(hx - 6, by2 + 20, 12, 16, 3);
    g.fillStyle(skin, 1);     g.fillRect(hx - 2, by2 + 20, 10, 5);
    g.fillStyle(0xffffff, 1); g.fillRect(hx - 2, by2 + 26, 8, 2);

  } else if (head.name === 'sam') {
    const skin = 0xedc9a0;
    g.fillStyle(skin, 1); g.fillEllipse(hx, by2, 50, 56);
    g.fillStyle(0x2a1a08, 1);
    g.fillEllipse(hx, by2 - 28, 52, 26);
    for (let ci = -3; ci <= 3; ci++) g.fillCircle(hx + ci * 8, by2 - 36, 7);
    g.fillStyle(0x3a2208, 1);
    g.fillRoundedRect(hx - 18, by2 - 18, 13, 4, 2);
    g.fillRoundedRect(hx + 5,  by2 - 18, 13, 4, 2);
    g.fillStyle(0xd4a878, 1); g.fillEllipse(hx, by2 - 1, 10, 12);
    g.fillStyle(0xb8906a, 1); g.fillCircle(hx - 4, by2 + 5, 3); g.fillCircle(hx + 4, by2 + 5, 3);
    g.fillStyle(0x3a2208, 0.35);
    for (let si = -3; si <= 3; si++) {
      g.fillCircle(hx + si * 5, by2 + 17, 2);
      g.fillCircle(hx + si * 4 - 10, by2 + 12, 1);
      g.fillCircle(hx + si * 4 + 10, by2 + 12, 1);
    }
    g.fillStyle(skin, 1);
    g.fillEllipse(hx - 26, by2 - 4, 8, 13); g.fillEllipse(hx + 26, by2 - 4, 8, 13);
    drawHeadExpression(g, hx, by2, skin, 0x6b3a0a, expr);
    g.fillStyle(0x10a37f, 1); g.fillCircle(hx, by2 + 30, 10);
    g.lineStyle(2, 0xffffff, 0.9);
    g.beginPath(); g.arc(hx, by2 + 30, 6, 0, Math.PI * 2); g.strokePath();
    g.lineStyle(2, 0xffffff, 0.7);
    g.beginPath(); g.arc(hx, by2 + 30, 3, -0.6, Math.PI * 1.8, false); g.strokePath();

  } else {
    const skin = 0xf0d0a8;
    g.fillStyle(skin, 1); g.fillEllipse(hx, by2 - 4, 52, 60);
    g.fillStyle(0xffffff, 0.22); g.fillEllipse(hx - 8, by2 - 22, 18, 10);
    g.fillStyle(0x5a3a18, 1);
    g.fillRoundedRect(hx - 20, by2 - 15, 16, 6, 3);
    g.fillRoundedRect(hx + 4,  by2 - 15, 16, 6, 3);
    g.fillStyle(skin, 1);
    g.fillEllipse(hx - 28, by2 - 4, 12, 20);
    g.fillEllipse(hx + 28, by2 - 4, 12, 20);
    g.fillStyle(0xd4a878, 1);
    g.fillEllipse(hx - 28, by2 - 4, 7, 14);
    g.fillEllipse(hx + 28, by2 - 4, 7, 14);
    g.fillStyle(0xd4a878, 1); g.fillEllipse(hx, by2 + 2, 14, 10);
    g.fillStyle(0xb8906a, 1); g.fillCircle(hx - 5, by2 + 6, 4); g.fillCircle(hx + 5, by2 + 6, 4);
    drawHeadExpression(g, hx, by2, skin, 0x3a2208, expr);
    g.lineStyle(3, 0xff9900, 1);
    g.beginPath(); g.arc(hx, by2 + 26, 10, 0.25, Math.PI - 0.25, false); g.strokePath();
    g.fillStyle(0xff9900, 1);
    g.fillTriangle(hx + 9, by2 + 24, hx + 14, by2 + 28, hx + 8, by2 + 30);
  }
}

// Expressions: 0=neutral 1=menacing grin 2=shouting 3=scream 4=anime red-eye
function drawHeadExpression(
  g: Phaser.GameObjects.Graphics,
  hx: number, by2: number,
  skin: number, irisCol: number,
  expr: number
): void {
  if (expr === 0) {
    // Neutral — standard eyes + calm mouth
    g.fillStyle(0xffffff, 1); g.fillEllipse(hx - 12, by2 - 8, 16, 14); g.fillEllipse(hx + 12, by2 - 8, 16, 14);
    g.fillStyle(irisCol, 1);  g.fillCircle(hx - 12, by2 - 8, 5); g.fillCircle(hx + 12, by2 - 8, 5);
    g.fillStyle(0x000000, 1); g.fillCircle(hx - 12, by2 - 8, 2); g.fillCircle(hx + 12, by2 - 8, 2);
    g.fillStyle(0xffffff, 0.6); g.fillCircle(hx - 10, by2 - 10, 2); g.fillCircle(hx + 14, by2 - 10, 2);
    g.lineStyle(2, 0x5a3010, 1); g.lineBetween(hx - 8, by2 + 12, hx + 8, by2 + 12);

  } else if (expr === 1) {
    // Menacing grin — heavy squint + wide jagged smile
    // Squinted eyes (narrow slits with sinister tilt)
    g.fillStyle(0xffffff, 0.8); g.fillEllipse(hx - 12, by2 - 8, 16, 8); g.fillEllipse(hx + 12, by2 - 8, 16, 8);
    g.fillStyle(irisCol, 1);    g.fillCircle(hx - 12, by2 - 8, 3); g.fillCircle(hx + 12, by2 - 8, 3);
    g.fillStyle(0x000000, 1);   g.fillCircle(hx - 12, by2 - 8, 2); g.fillCircle(hx + 12, by2 - 8, 2);
    // Heavy lowered brow lines
    g.lineStyle(3, 0x2a1000, 1);
    g.lineBetween(hx - 18, by2 - 14, hx - 6, by2 - 10);
    g.lineBetween(hx + 6, by2 - 10, hx + 18, by2 - 14);
    // Wide jagged grin showing teeth
    g.fillStyle(0x3a1000, 1);
    g.fillRoundedRect(hx - 14, by2 + 8, 28, 12, 3);
    g.fillStyle(0xffffff, 1);
    for (let ti = 0; ti < 5; ti++) g.fillRect(hx - 12 + ti * 6, by2 + 9, 4, 7);

  } else if (expr === 2) {
    // Shouting — eyes wide + large open O mouth
    g.fillStyle(0xffffff, 1); g.fillEllipse(hx - 12, by2 - 8, 18, 18); g.fillEllipse(hx + 12, by2 - 8, 18, 18);
    g.fillStyle(irisCol, 1);  g.fillCircle(hx - 12, by2 - 8, 6); g.fillCircle(hx + 12, by2 - 8, 6);
    g.fillStyle(0x000000, 1); g.fillCircle(hx - 12, by2 - 8, 3); g.fillCircle(hx + 12, by2 - 8, 3);
    // Raised brows
    g.lineStyle(3, 0x2a1000, 1);
    g.lineBetween(hx - 18, by2 - 17, hx - 6, by2 - 19);
    g.lineBetween(hx + 6, by2 - 19, hx + 18, by2 - 17);
    // Open O mouth
    g.fillStyle(0x1a0000, 1); g.fillEllipse(hx, by2 + 12, 18, 14);
    g.fillStyle(0xcc4444, 0.8); g.fillEllipse(hx, by2 + 13, 12, 9);

  } else if (expr === 3) {
    // Scream — Munch-style: eyes as dark hollow arcs + huge oval mouth with lines
    // Dark hollow eye sockets
    g.fillStyle(0x1a0a00, 1); g.fillEllipse(hx - 12, by2 - 8, 16, 16); g.fillEllipse(hx + 12, by2 - 8, 16, 16);
    g.fillStyle(0x3a2010, 0.7); g.fillEllipse(hx - 12, by2 - 8, 10, 10); g.fillEllipse(hx + 12, by2 - 8, 10, 10);
    // Contorted brows sweeping outward
    g.lineStyle(3, 0x2a1000, 1);
    g.lineBetween(hx - 20, by2 - 16, hx - 4, by2 - 12);
    g.lineBetween(hx + 4, by2 - 12, hx + 20, by2 - 16);
    // Huge open scream mouth
    g.fillStyle(0x000000, 1); g.fillEllipse(hx, by2 + 11, 22, 18);
    g.fillStyle(0xcc2222, 0.6); g.fillEllipse(hx, by2 + 12, 14, 12);
    // Scream lines inside mouth
    g.lineStyle(1, 0xff4444, 0.5);
    g.lineBetween(hx - 4, by2 + 6, hx - 4, by2 + 17);
    g.lineBetween(hx,     by2 + 5, hx,     by2 + 18);
    g.lineBetween(hx + 4, by2 + 6, hx + 4, by2 + 17);
    // Wavy cheek lines (Munch)
    g.lineStyle(2, skin, 0.5);
    g.beginPath(); g.moveTo(hx - 22, by2 - 5); g.lineTo(hx - 18, by2); g.lineTo(hx - 22, by2 + 5); g.strokePath();
    g.beginPath(); g.moveTo(hx + 22, by2 - 5); g.lineTo(hx + 18, by2); g.lineTo(hx + 22, by2 + 5); g.strokePath();

  } else {
    // Anime red-eye twinkle — one normal eye, one giant glowing red star
    // Normal left eye
    g.fillStyle(0xffffff, 1); g.fillEllipse(hx - 12, by2 - 8, 14, 13);
    g.fillStyle(irisCol, 1);  g.fillCircle(hx - 12, by2 - 8, 5);
    g.fillStyle(0x000000, 1); g.fillCircle(hx - 12, by2 - 8, 2);
    g.fillStyle(0xffffff, 0.7); g.fillCircle(hx - 10, by2 - 10, 2);
    // Right eye: huge glowing red
    g.fillStyle(0xff0000, 0.18); g.fillCircle(hx + 12, by2 - 8, 16); // outer glow
    g.fillStyle(0xff2222, 0.4);  g.fillCircle(hx + 12, by2 - 8, 11); // mid glow
    g.fillStyle(0xff0000, 1);    g.fillCircle(hx + 12, by2 - 8, 7);  // core
    g.fillStyle(0xff6666, 0.9);  g.fillCircle(hx + 12, by2 - 8, 4);  // bright center
    g.fillStyle(0xffffff, 1);    g.fillCircle(hx + 14, by2 - 11, 2); // specular
    // Star burst lines around red eye
    g.lineStyle(2, 0xff4444, 0.85);
    for (let s = 0; s < 8; s++) {
      const sa = (s / 8) * Math.PI * 2;
      g.lineBetween(
        hx + 12 + Math.cos(sa) * 8, by2 - 8 + Math.sin(sa) * 8,
        hx + 12 + Math.cos(sa) * 14, by2 - 8 + Math.sin(sa) * 14
      );
    }
    // Small calm mouth
    g.lineStyle(2, 0x5a3010, 1); g.lineBetween(hx - 6, by2 + 12, hx + 6, by2 + 12);
  }
}

function showZoneEntrance(sc: Phaser.Scene): void {
  SFX.zoneEnter();
  const ZONE_NAMES: Record<number, string> = {
    1: 'Dying Woods',
    2: 'Data Farms Compound',
    3: 'LLM Dimension Rendering',
  };
  const zoneName = ZONE_NAMES[currentStage] ?? `Stage ${currentStage}`;
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2 - 80;

  // Horizontal lines
  const lineG = sc.add.graphics().setDepth(75);
  lineG.lineStyle(1, 0xbbaa88, 0.7);
  lineG.lineBetween(cx - 300, cy - 22, cx + 300, cy - 22);
  lineG.lineBetween(cx - 300, cy + 50, cx + 300, cy + 50);
  sc.cameras.main.ignore(lineG as any);

  // Zone name — large gold serif
  const nameT = sc.add.text(cx, cy, zoneName, {
    fontSize: '46px',
    fontFamily: 'Georgia, "Times New Roman", serif',
    color: '#d4aa60',
    stroke: '#000000',
    strokeThickness: 6,
    fontStyle: 'italic',
  }).setOrigin(0.5).setDepth(76).setAlpha(0);
  sc.cameras.main.ignore(nameT as any);

  // Subtitle
  const subT = sc.add.text(cx, cy + 34, 'E N T E R S', {
    fontSize: '18px',
    fontFamily: 'Georgia, "Times New Roman", serif',
    color: '#998855',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(76).setAlpha(0);
  sc.cameras.main.ignore(subT as any);

  // Fade in → hold → fade out
  sc.tweens.add({
    targets: [nameT, subT, lineG], alpha: 1,
    duration: 700, ease: 'Power2',
    onComplete: () => {
      sc.time.delayedCall(2000, () => {
        sc.tweens.add({
          targets: [nameT, subT, lineG], alpha: 0,
          duration: 800, ease: 'Power2',
          onComplete: () => { nameT.destroy(); subT.destroy(); lineG.destroy(); },
        });
      });
    },
  });
}

function showBossAppearBanner(): void {
  SFX.bossAppear();
  // Dark Souls-style appearance banner rendered via hudCam
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2 - 60;

  // Horizontal separator lines
  const lineG = scene.add.graphics().setDepth(75);
  lineG.lineStyle(2, 0xaa2222, 0.85);
  lineG.lineBetween(cx - 320, cy - 28, cx + 320, cy - 28);
  lineG.lineBetween(cx - 320, cy + 56, cx + 320, cy + 56);
  scene.cameras.main.ignore(lineG as any);

  // Boss name — large, red, Georgia serif
  const nameT = scene.add.text(cx, cy, 'Jeffelon Zuckerbezaltman', {
    fontSize: '52px',
    fontFamily: 'Georgia, "Times New Roman", serif',
    color: '#cc2222',
    stroke: '#000000',
    strokeThickness: 8,
    fontStyle: 'italic',
  }).setOrigin(0.5, 0.5).setDepth(76).setAlpha(0);
  scene.cameras.main.ignore(nameT as any);

  // Subtitle line
  const subT = scene.add.text(cx, cy + 38, 'A P P E A R S', {
    fontSize: '22px',
    fontFamily: 'Georgia, "Times New Roman", serif',
    color: '#882222',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5, 0.5).setDepth(76).setAlpha(0);
  scene.cameras.main.ignore(subT as any);

  // Fade in
  scene.tweens.add({
    targets: [nameT, subT, lineG], alpha: 1,
    duration: 600, ease: 'Power2',
    onComplete: () => {
      // Hold, then fade out
      scene.time.delayedCall(1800, () => {
        scene.tweens.add({
          targets: [nameT, subT, lineG], alpha: 0,
          duration: 700, ease: 'Power2',
          onComplete: () => { nameT.destroy(); subT.destroy(); lineG.destroy(); },
        });
      });
    },
  });
}

function refreshBossHud(b: Boss): void {
  // Show the boss HUD elements if not yet visible
  if (!bossHudVisible) {
    bossHudVisible = true;
    scene.tweens.add({ targets: [bossHudBg, bossHudBar, bossHudNameText], alpha: 1, duration: 500 });
    bossHudNameText.setText('Big Tech Chimera');
  }

  // Layout: wide bar near the bottom of screen, above the bear HUD panel
  const barW = GAME_WIDTH - 80, barH = 18;
  const barX = 40, barY = GAME_HEIGHT - 220; // sits above the bear HUD

  // Background panel
  bossHudBg.clear();
  bossHudBg.fillStyle(0x000000, 0.72);
  bossHudBg.fillRoundedRect(barX - 8, barY - 32, barW + 16, barH + 46, 6);
  bossHudBg.lineStyle(1, 0x881111, 0.8);
  bossHudBg.strokeRoundedRect(barX - 8, barY - 32, barW + 16, barH + 46, 6);

  // HP bar track
  bossHudBar.clear();
  bossHudBar.fillStyle(0x330000, 1);
  bossHudBar.fillRoundedRect(barX, barY, barW, barH, 4);

  // HP fill
  const pct = Math.max(0, b.hpFrac / b.maxHp);
  const col = pct > 0.5 ? 0xdd2222 : pct > 0.25 ? 0xff6600 : 0xff2222;
  bossHudBar.fillStyle(col, 1);
  bossHudBar.fillRoundedRect(barX, barY, Math.max(0, barW * pct), barH, 4);

  // Bright leading edge
  if (pct > 0.01) {
    const edgeX = barX + barW * pct;
    bossHudBar.fillStyle(0xffffff, 0.5);
    bossHudBar.fillRect(edgeX - 3, barY, 3, barH);
  }

  // Segment ticks (one per max HP point)
  bossHudBar.lineStyle(1, 0x000000, 0.4);
  for (let i = 1; i < b.maxHp; i++) {
    const tx = barX + (barW / b.maxHp) * i;
    bossHudBar.lineBetween(tx, barY, tx, barY + barH);
  }

  // Name text position
  bossHudNameText.setPosition(GAME_WIDTH / 2, barY - 6);
}

// Also create a texture for the FB projectile
function createBossProjTextures(sc: Phaser.Scene): void {
  // Facebook blue blob
  const g = sc.make.graphics({}, false);
  g.fillStyle(0x1877f2, 1); g.fillCircle(12, 12, 12);
  g.fillStyle(0xffffff, 0.6); g.fillCircle(9, 9, 4);
  g.generateTexture('boss_proj_fb', 24, 24); g.destroy();
}

// ─── DATA CENTER BACKGROUND (Stage 3) ───────────────────────────────────────────────────
function drawDataCenterBackground(sc: Phaser.Scene): void {
  const C = COLORS.dc;
  const g = sc.add.graphics().setDepth(0);

  // Base floor — very dark
  g.fillStyle(C.floor, 1);
  g.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

  // Floor grid — subtle cyan lines
  g.lineStyle(1, C.floorLine, 0.5);
  for (let x = 0; x < LEVEL_WIDTH; x += TILE) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, LEVEL_HEIGHT); g.strokePath(); }
  for (let y = 0; y < LEVEL_HEIGHT; y += TILE) { g.beginPath(); g.moveTo(0, y); g.lineTo(LEVEL_WIDTH, y); g.strokePath(); }

  // Raised floor panel marks (2x2 tile squares with corner bolts)
  g.lineStyle(1, C.accent, 0.12);
  for (let tx = 0; tx < LEVEL_WIDTH; tx += TILE * 2)
    for (let ty = 0; ty < LEVEL_HEIGHT; ty += TILE * 2) {
      g.strokeRect(tx + 2, ty + 2, TILE * 2 - 4, TILE * 2 - 4);
      // Corner bolts
      g.fillStyle(C.rackLight, 0.6);
      g.fillCircle(tx + 5, ty + 5, 3);       g.fillCircle(tx + TILE*2-5, ty + 5, 3);
      g.fillCircle(tx + 5, ty + TILE*2-5, 3); g.fillCircle(tx + TILE*2-5, ty + TILE*2-5, 3);
    }

  const d = sc.add.graphics().setDepth(1);

  // Server rack rows — 3 columns of racks running vertically
  // Draw every other rack (even indices only) — matches the physics blockers
  const rackW = 80, rackH = 180, rackGap = 20;
  const rackCols = [
    LEVEL_WIDTH * 0.22, LEVEL_WIDTH * 0.5, LEVEL_WIDTH * 0.78,
  ];
  const rackRows: number[] = [];
  for (let ry = 180; ry < LEVEL_HEIGHT - 180; ry += rackH + rackGap) rackRows.push(ry);

  for (const cx4 of rackCols) {
    for (let ri = 0; ri < rackRows.length; ri++) {
      if (ri % 2 !== 0) continue; // skip odd — only draw even-indexed racks
      const ry = rackRows[ri];
      const rx = cx4 - rackW / 2;
      // Rack body
      d.fillStyle(C.rack, 1);      d.fillRect(rx, ry, rackW, rackH);
      d.fillStyle(C.rackDark, 1);  d.fillRect(rx, ry, rackW, 6);   // top bar
      d.fillStyle(C.rackDark, 1);  d.fillRect(rx, ry + rackH - 6, rackW, 6); // bottom bar
      d.lineStyle(1, C.rackLight, 0.8); d.strokeRect(rx, ry, rackW, rackH);
      // Unit slots
      const slotH2 = 14, slotGap = 4;
      let sy = ry + 10;
      let ledIdx = 0;
      while (sy + slotH2 < ry + rackH - 10) {
        d.fillStyle(C.rackLight, 1); d.fillRect(rx + 4, sy, rackW - 8, slotH2);
        // LED indicators
        const ledColors = [C.led, C.led, C.ledAmber, C.ledRed, C.led, C.led, C.led, C.led];
        const lc = ledColors[ledIdx % ledColors.length];
        d.fillStyle(lc, 1);  d.fillRect(rx + 6,  sy + 4, 4, 6);
        d.fillStyle(C.led, 1); d.fillRect(rx + 12, sy + 4, 4, 6);
        // Drive bays
        d.fillStyle(C.rackDark, 1);
        for (let b = 0; b < 4; b++) d.fillRect(rx + 22 + b * 12, sy + 3, 10, slotH2 - 6);
        sy += slotH2 + slotGap;
        ledIdx++;
      }
      // Glowing accent strip on front
      d.fillStyle(C.led, 0.7); d.fillRect(rx, ry + 2, 3, rackH - 4);
    }
  }

  // Overhead cable trays (drawn as thick dark lines with small loops)
  const trayXs = [LEVEL_WIDTH * 0.35, LEVEL_WIDTH * 0.65];
  for (const tx2 of trayXs) {
    d.fillStyle(C.cable, 1); d.fillRect(tx2 - 8, 0, 16, LEVEL_HEIGHT);
    d.lineStyle(1, C.cableDark, 1);
    for (let cy5 = 20; cy5 < LEVEL_HEIGHT; cy5 += 40) {
      d.beginPath(); d.arc(tx2, cy5, 6, 0, Math.PI * 2); d.strokePath();
    }
  }

  // Cooling units — large blue boxes at top & bottom
  const coolerPositions: [number, number, number, number][] = [
    [0, 0, LEVEL_WIDTH, 90],
    [0, LEVEL_HEIGHT - 90, LEVEL_WIDTH, 90],
  ];
  for (const [cx5, cy6, cw, ch] of coolerPositions) {
    d.fillStyle(C.cooling, 1);      d.fillRect(cx5, cy6, cw, ch);
    d.fillStyle(C.coolingGlow, 0.4); d.fillRect(cx5, cy6, cw, ch);
    d.lineStyle(2, C.accent, 0.8);  d.strokeRect(cx5, cy6, cw, ch);
    // Vent grilles
    for (let vx = 20; vx < cw - 20; vx += 28) {
      d.fillStyle(C.rackDark, 1); d.fillRect(cx5 + vx, cy6 + 8, 18, ch - 16);
      d.lineStyle(1, C.accentGlow, 0.8);
      for (let vy = cy6 + 12; vy < cy6 + ch - 8; vy += 8) {
        d.beginPath(); d.moveTo(cx5 + vx + 2, vy); d.lineTo(cx5 + vx + 16, vy); d.strokePath();
      }
    }
  }

  // Glowing data conduit lines along corridors
  d.lineStyle(2, C.accent, 0.25);
  d.beginPath(); d.moveTo(0, LEVEL_HEIGHT * 0.33); d.lineTo(LEVEL_WIDTH, LEVEL_HEIGHT * 0.33); d.strokePath();
  d.beginPath(); d.moveTo(0, LEVEL_HEIGHT * 0.66); d.lineTo(LEVEL_WIDTH, LEVEL_HEIGHT * 0.66); d.strokePath();
  d.lineStyle(2, C.accent, 0.25);
  d.beginPath(); d.moveTo(LEVEL_WIDTH * 0.35, 0); d.lineTo(LEVEL_WIDTH * 0.35, LEVEL_HEIGHT); d.strokePath();
  d.beginPath(); d.moveTo(LEVEL_WIDTH * 0.65, 0); d.lineTo(LEVEL_WIDTH * 0.65, LEVEL_HEIGHT); d.strokePath();
}

// ─── DATA CENTER TERRAIN (stage 3 blockers + slow zones) ──────────────────────────
function buildDCTerrain(sc: Phaser.Scene): void {
  // Cooling units at top and bottom are solid walls
  const wallRects: [number, number, number, number][] = [
    [0, 0, LEVEL_WIDTH, 90],
    [0, LEVEL_HEIGHT - 90, LEVEL_WIDTH, 90],
  ];
  for (const [rx, ry, rw, rh] of wallRects) {
    const body = terrainGroup.create(rx + rw/2, ry + rh/2, undefined as any) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false).setActive(true);
    (body.body as Phaser.Physics.Arcade.StaticBody).setSize(rw, rh);
    (body.body as Phaser.Physics.Arcade.StaticBody).reset(rx, ry);
    body.refreshBody();
  }

  // Server racks — no collision blockers (decoration only)

  // Cable trays — only slow at the 3 cross-aisle intersections where cables bunch up
  const trayXs = [LEVEL_WIDTH * 0.35, LEVEL_WIDTH * 0.65];
  const traySlowYs = [LEVEL_HEIGHT * 0.25, LEVEL_HEIGHT * 0.5, LEVEL_HEIGHT * 0.75];
  for (const tx2 of trayXs) {
    for (const sy of traySlowYs) {
      bushZones.push(new Phaser.Geom.Circle(tx2, sy, 28));
    }
  }
}

// ─── DATA CENTER ENEMY TEXTURES (security bot + turret drone) ───────────────────────
function createDCEnemyTexture(sc: Phaser.Scene, key: string, isRanged: boolean): void {
  const W = 56, H = 56, g = sc.make.graphics({}, false);
  if (!isRanged) {
    // Security Bot — angular humanoid robot
    // Torso
    g.fillStyle(0x223344, 1); g.fillRect(16, 20, 24, 24);
    g.fillStyle(0x334455, 1); g.fillRect(18, 22, 20, 20);
    // Glowing chest panel
    g.fillStyle(COLORS.dc.led, 0.9); g.fillRect(22, 26, 12, 8);
    g.fillStyle(COLORS.dc.ledDim, 1); g.fillRect(23, 27, 10, 6);
    g.fillStyle(COLORS.dc.led, 1); g.fillRect(25, 29, 6, 2);
    // Head — boxy helmet
    g.fillStyle(0x223344, 1); g.fillRect(16, 6, 24, 16);
    g.fillStyle(0x334455, 1); g.fillRect(18, 8, 20, 12);
    // Visor — glowing cyan slit
    g.fillStyle(COLORS.dc.led, 0.8); g.fillRect(19, 12, 18, 4);
    g.fillStyle(0xffffff, 0.6);       g.fillRect(20, 13, 6, 2);
    // Baton arm (right)
    g.fillStyle(0x445566, 1); g.fillRect(40, 22, 6, 20);
    g.fillStyle(COLORS.dc.led, 0.9); g.fillRect(40, 20, 6, 6);
    // Legs
    g.fillStyle(0x223344, 1); g.fillRect(18, 44, 8, 10); g.fillRect(30, 44, 8, 10);
    g.fillStyle(COLORS.dc.led, 0.5); g.fillRect(19, 50, 6, 2); g.fillRect(31, 50, 6, 2);
  } else {
    // Turret Drone — hovering orb with laser arm
    // Main orb body
    g.fillStyle(0x112233, 1); g.fillCircle(28, 26, 18);
    g.fillStyle(0x223344, 1); g.fillCircle(28, 24, 15);
    // Glowing ring
    g.lineStyle(2, COLORS.dc.led, 0.9); g.strokeCircle(28, 26, 17);
    // Eye / sensor
    g.fillStyle(COLORS.dc.ledRed, 1); g.fillCircle(28, 24, 7);
    g.fillStyle(0xff6655, 0.8);         g.fillCircle(28, 24, 4);
    g.fillStyle(0xffffff, 0.9);         g.fillCircle(30, 22, 2);
    // Hover glow underneath
    g.fillStyle(COLORS.dc.led, 0.2); g.fillEllipse(28, 46, 28, 8);
    // Laser cannon arm
    g.fillStyle(0x334455, 1); g.fillRect(42, 22, 12, 8);
    g.fillStyle(COLORS.dc.ledRed, 0.9); g.fillCircle(54, 26, 4);
    // Rotor fins
    g.fillStyle(0x445566, 0.8);
    g.fillRect(10, 10, 8, 4); g.fillRect(38, 10, 8, 4);
    g.fillRect(10, 38, 8, 4); g.fillRect(38, 38, 8, 4);
  }
  g.generateTexture(key, W, H);
  g.destroy();
}

// ─── FOG OF WAR ──────────────────────────────────────────────────────────────────────
const FOG_TILE   = 48;          // fog cell size (smaller = smoother reveal edge)
const FOG_RADIUS = 280;         // visibility radius in world pixels (pre-zoom)
const FOG_FADE   = 80;          // partial-dark annulus width beyond FOG_RADIUS

function updateFog(): void {
  const g = fogGraphics;
  g.clear();
  const cam  = scene.cameras.main;
  const zoom = cam.zoom;
  // The camera follows the bear and centres on it.
  // Use cam.worldView (the world rect visible on screen) for accurate projection.
  const bearScreenX = (bear.x - cam.worldView.x) * zoom;
  const bearScreenY = (bear.y - cam.worldView.y) * zoom;
  const visR  = FOG_RADIUS * zoom;
  const fadeR = (FOG_RADIUS + FOG_FADE) * zoom;
  const tileS = FOG_TILE;
  for (let sx = 0; sx < GAME_WIDTH; sx += tileS) {
    for (let sy = 0; sy < GAME_HEIGHT; sy += tileS) {
      const tcx = sx + tileS / 2, tcy = sy + tileS / 2;
      const dist = Phaser.Math.Distance.Between(tcx, tcy, bearScreenX, bearScreenY);
      if (dist < visR) continue;
      if (dist < fadeR) {
        const t = (dist - visR) / (fadeR - visR);
        g.fillStyle(0x000000, t * 0.82);
      } else {
        g.fillStyle(0x000000, 0.82);
      }
      g.fillRect(sx, sy, tileS, tileS);
    }
  }
}

// ─── SCREEN-EDGE INDICATORS ───────────────────────────────────────────────────────────────
const IND_MARGIN = 52;   // px from screen edge where arrow tip sits
const IND_ARROW  = 14;   // arrow half-size

function buildIndicatorTexts(sc: Phaser.Scene): void {
  // One label per cage + one for exit
  const total = 5; // 4 cages + 1 exit
  for (let i = 0; i < total; i++) {
    const t = sc.add.text(0, 0, '', {
      fontSize: '20px', fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(66).setVisible(false);
    indicatorTexts.push(t);
  }
}

function updateIndicators(): void {
  indicatorG.clear();
  const cam  = scene.cameras.main;
  const zoom = cam.zoom;
  // Use worldView for accurate world->screen projection (accounts for zoom)
  const wv = cam.worldView;
  const camLeft   = wv.x,  camTop    = wv.y;
  const camRight  = wv.right, camBottom = wv.bottom;
  // Inset margin in world units (for on-screen check)
  const mw = IND_MARGIN / zoom;
  // Screen boundary for arrow placement
  const minX = IND_MARGIN, maxX = GAME_WIDTH  - IND_MARGIN;
  const minY = IND_MARGIN, maxY = INFO_Y - IND_MARGIN;

  const allRescued = gameState.cagesRescued >= gameState.cagesTotal;

  // Build target list: cages (until rescued) or exit (after all rescued)
  type Target = { wx: number; wy: number; label: string; color: number; textColor: string };
  const targets: Target[] = [];

  if (!allRescued) {
    for (const cage of cages) {
      if (!cage.opened)
        targets.push({ wx: cage.sprite.x, wy: cage.sprite.y, label: '🐾', color: 0x88ffaa, textColor: '#88ffaa' });
    }
  } else if (currentStage === 3 && boss && boss.state === 'active') {
    targets.push({ wx: boss.x, wy: boss.y, label: '👾', color: 0xff4444, textColor: '#ff4444' });
  } else if (currentStage !== 3) {
    targets.push({ wx: goalX, wy: goalY, label: '⭐', color: 0xffee55, textColor: '#ffee55' });
  }

  // Hide any unused text slots
  for (let i = targets.length; i < indicatorTexts.length; i++)
    indicatorTexts[i]?.setVisible(false);

  for (let i = 0; i < targets.length; i++) {
    const tgt  = targets[i];
    const txt  = indicatorTexts[i];
    if (!txt) continue;

    // Check if target is already on screen (with margin)
    const onScreen = tgt.wx >= camLeft + mw && tgt.wx <= camRight  - mw &&
                     tgt.wy >= camTop  + mw && tgt.wy <= camBottom - mw;
    if (onScreen) { txt.setVisible(false); continue; }

    // Project world position to screen position using worldView
    const sx = (tgt.wx - camLeft) * zoom;
    const sy = (tgt.wy - camTop)  * zoom;

    // Direction from screen centre toward target
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const dx = sx - cx, dy = sy - cy;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = dx / len, ny = dy / len;

    // Ray-rect intersection: find where the ray from centre hits the inset boundary
    let ax = cx, ay = cy;
    // Test X walls
    if (Math.abs(nx) > 0.0001) {
      const tX = nx > 0 ? (maxX - cx) / nx : (minX - cx) / nx;
      const hitY = cy + ny * tX;
      if (hitY >= minY && hitY <= maxY) { ax = cx + nx * tX; ay = hitY; }
    }
    // Test Y walls (overrides X if Y boundary is hit sooner)
    if (Math.abs(ny) > 0.0001) {
      const tY = ny > 0 ? (maxY - cy) / ny : (minY - cy) / ny;
      const hitX = cx + nx * tY;
      if (hitX >= minX && hitX <= maxX) {
        // Pick whichever boundary is closer to centre
        const tX2 = Math.abs(nx) > 0.0001 ? (nx > 0 ? (maxX-cx)/nx : (minX-cx)/nx) : Infinity;
        if (tY < tX2) { ax = hitX; ay = cy + ny * tY; }
      }
    }
    ax = Math.max(minX, Math.min(maxX, ax));
    ay = Math.max(minY, Math.min(maxY, ay));

    // Distance in world pixels
    const worldDist = Math.round(Phaser.Math.Distance.Between(bear.x, bear.y, tgt.wx, tgt.wy));

    // Draw arrow triangle pointing in direction of target
    const px = -ny, py = nx; // perpendicular
    const tipX  = ax + nx * IND_ARROW;
    const tipY  = ay + ny * IND_ARROW;
    const baseX = ax - nx * IND_ARROW;
    const baseY = ay - ny * IND_ARROW;
    indicatorG.fillStyle(tgt.color, 0.9);
    indicatorG.fillTriangle(
      tipX, tipY,
      baseX + px * IND_ARROW * 0.7, baseY + py * IND_ARROW * 0.7,
      baseX - px * IND_ARROW * 0.7, baseY - py * IND_ARROW * 0.7
    );
    indicatorG.lineStyle(2, 0x000000, 0.6);
    indicatorG.strokeTriangle(
      tipX, tipY,
      baseX + px * IND_ARROW * 0.7, baseY + py * IND_ARROW * 0.7,
      baseX - px * IND_ARROW * 0.7, baseY - py * IND_ARROW * 0.7
    );

    // Label (emoji + distance) positioned just behind the arrow base
    const lblX = baseX - nx * 18;
    const lblY = baseY - ny * 18;
    txt.setText(`${tgt.label} ${worldDist}m`);
    txt.setColor(tgt.textColor);
    txt.setPosition(lblX, lblY);
    txt.setVisible(true);
  }
}

// ─── TITLE SCENE ────────────────────────────────────────────────────────────────────────
class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  create(): void {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const cx = W / 2;
    const g = this.add.graphics();

    // ── Vibrant background gradient (top: blood-red → mid: deep maroon → bottom: near-black) ──
    // Built as stacked horizontal strips to fake a vertical gradient
    const gradStops: [number, number, number][] = [
      [0x1a0000, 0,   H * 0.08],
      [0x2d0300, H * 0.08, H * 0.18],
      [0x3d0800, H * 0.18, H * 0.30],
      [0x2a0400, H * 0.30, H * 0.42],
      [0x1a0200, H * 0.42, H * 0.55],
      [0x0e0100, H * 0.55, H * 0.68],
      [0x060000, H * 0.68, H],
    ];
    for (const [col, y0, y1] of gradStops) {
      g.fillStyle(col, 1); g.fillRect(0, y0, W, y1 - y0);
    }

    // Scan-line texture overlay
    for (let sy = 0; sy < H; sy += 4) {
      g.fillStyle(0x000000, 0.18); g.fillRect(0, sy, W, 1);
    }

    // Diagonal streak lines (hellish atmosphere)
    for (let i = 0; i < 18; i++) {
      const sx = (i / 18) * W * 1.6 - W * 0.3;
      g.lineStyle(1, 0xff2200, 0.04 + (i % 3) * 0.02);
      g.lineBetween(sx, 0, sx - 220, H);
    }

    // Central radial hellfire burst behind bear
    const burstCY = H * 0.52;
    for (let r = 440; r > 0; r -= 14) {
      const t = r / 440;
      const col2 = t > 0.6 ? 0x1a0000 : t > 0.35 ? 0xff2200 : 0xff7700;
      g.fillStyle(col2, (1 - t) * 0.13);
      g.fillCircle(cx, burstCY, r);
    }
    // Hot bright core
    for (let r = 90; r > 0; r -= 6) {
      g.fillStyle(0xff9900, (1 - r / 90) * 0.22);
      g.fillCircle(cx, burstCY, r);
    }

    this.drawDebrisField(g, cx, W, H);
    this.drawTitleBear(g, cx, H);
    this.drawSmokeWisps(g, cx, H);

    // ── DOOM-style title logo ──
    this.drawDoomTitle(cx, W);

    // Subtitle — bee-themed stripe treatment
    this.drawBeeSubtitle(cx, 226);

    // Decorative separator line under titles
    const dg = this.add.graphics();
    dg.lineStyle(3, 0xcc3300, 1);   dg.lineBetween(cx - 300, 270, cx + 300, 270);
    dg.lineStyle(1, 0xff6600, 0.6); dg.lineBetween(cx - 300, 274, cx + 300, 274);
    // Corner spike marks
    dg.lineStyle(3, 0xff4400, 0.9);
    dg.lineBetween(cx - 300, 264, cx - 300, 278);
    dg.lineBetween(cx + 300, 264, cx + 300, 278);

    const panelY = H * 0.76;
    const pg = this.add.graphics();
    // Panel with strong red border glow — taller to hold bigger text
    pg.fillStyle(0x0a0000, 0.88); pg.fillRoundedRect(cx - 330, panelY, 660, 252, 10);
    pg.lineStyle(3, 0xcc2200, 0.9); pg.strokeRoundedRect(cx - 330, panelY, 660, 252, 10);
    pg.lineStyle(1, 0xff5500, 0.4); pg.strokeRoundedRect(cx - 326, panelY + 4, 652, 244, 8);

    this.add.text(cx, panelY + 18, 'Stop the tech billionaire pollution!', {
      fontSize: '30px', fontFamily: 'Arial Black', color: '#f5c542',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.add.text(cx, panelY + 64, 'Fight back with beehive guns,\nsave the critters, and end tokenmaxxing!', {
      fontSize: '26px', fontFamily: 'Arial', color: '#ddccaa',
      lineSpacing: 6, align: 'center',
    }).setOrigin(0.5, 0);

    this.add.text(cx, panelY + 138, [
      'WASD: Move          Space: Dodge',
      'Click & Draw: Deploy Bees!',
    ].join('\n'), {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#aaddff',
      lineSpacing: 8, align: 'center',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0);

    // "TAP TO BEGIN" — layered like the title but smaller
    const tapY = H - 75;
    this.add.text(cx + 3, tapY + 4, 'TAP TO BEGIN', {
      fontSize: '38px', fontFamily: 'Arial Black', color: '#000000',
    }).setOrigin(0.5);
    this.add.text(cx + 1, tapY + 2, 'TAP TO BEGIN', {
      fontSize: '38px', fontFamily: 'Arial Black', color: '#882200',
    }).setOrigin(0.5);
    const startT = this.add.text(cx, tapY, 'TAP TO BEGIN', {
      fontSize: '38px', fontFamily: 'Arial Black',
      color: '#ffffff', stroke: '#ff6600', strokeThickness: 2,
    }).setOrigin(0.5);
    this.tweens.add({ targets: startT, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });

    const startGame = () => { currentStage = 1; this.scene.start('GameScene'); };
    this.input.once('pointerdown', startGame);
    this.input.keyboard!.once('keydown', startGame);
  }

  // ─── DOOM LOGO ENGINE ───────────────────────────────────────────────────────────────────
  //
  // Each letter is defined as an array of [x,y] normalized points (0–1 range,
  // origin top-left). The engine:
  //   1. Scales the points to (w × h) world pixels.
  //   2. Applies a low-angle perspective warp: the bottom edge fans out wider
  //      than the top by a `perspFlare` factor, so the letter looks like it
  //      is tilting toward the viewer.
  //   3. Draws the deep extrusion (parallelogram side faces, extruding down
  //      and slightly to the right) in near-black / dark-brown.
  //   4. Draws the letter face in two horizontal tones: bright orange-red on
  //      top half, deep blood-red on bottom half.
  //   5. Draws a thick beveled inset border (dark outline offset inward).
  //
  // Letters are laid out with the outer-most letters (B and K) using a larger
  // height scalar so they physically bracket the inner letters.

  private drawDoomTitle(cx: number, W: number): void {
    const g = this.add.graphics().setDepth(2);

    // ─ Layout parameters ─
    const baseY    = 24;     // top of the tallest (outer) letters
    const baseH    = 118;    // height of outer bracket letters (B, K) — reduced to fit width
    const extDepth = 30;     // extrusion depth
    const extSlant = 8;      // horizontal slant of extrusion
    const perspFlare = 0.12; // bottom-wider perspective flare

    // ─ Colors ─
    const COL_EXTRUDE_DARK  = 0x1a0000;  // deepest extrusion face (bottom)
    const COL_EXTRUDE_MID   = 0x3d0500;  // upper extrusion face
    const COL_FACE_DARK     = 0x8b0000;  // face bottom half (shadow)
    const COL_FACE_BRIGHT   = 0xff3300;  // face top half (lit)
    const COL_FACE_HILIGHT  = 0xff7722;  // top-edge highlight strip
    const COL_BEVEL_DARK    = 0x330000;  // bevel inset shadow
    const COL_BEVEL_LIGHT   = 0xff9955;  // bevel inset highlight

    // ── Letter definitions (normalized 0–1 paths, closed polygons) ──
    // Each is an array of [nx, ny] points. All ultra-bold, flat-topped rectangles
    // with cutouts represented as separate filled shapes drawn on top in bg color.
    // We use a simple fill-with-holes approach: draw outer shape, then overdraw
    // interior cutouts in the extrusion / face colors as needed.

    // Helper: apply perspective warp to a normalized point given letter width/height
    // Returns world [x, y] relative to letter's left edge baseline (bottom-left origin)
    const warp = (nx: number, ny: number, lw: number, lh: number, lx: number, ly: number): [number, number] => {
      // ny=0 is top, ny=1 is bottom
      // Perspective: bottom (ny=1) is full width, top (ny=0) is narrower by perspFlare
      const yFrac = ny;
      const xScale = 1 + perspFlare * (1 - yFrac);  // top is wider in "leaning toward" mode
      // Actually Doom leans bottom-toward-viewer: bottom wider
      const xOff = (nx - 0.5) * lw * (1 + perspFlare * yFrac);
      // Vertical: slight keystoning — bottom y is at ly+lh, top y is at ly (no vertical squeeze needed)
      return [lx + lw / 2 + xOff, ly + ny * lh];
    };

    // Helper: draw one closed polygon
    const poly = (pts: [number,number][], col: number, alpha = 1): void => {
      if (pts.length < 3) return;
      g.fillStyle(col, alpha);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fillPath();
    };

    const strokePoly = (pts: [number,number][], col: number, lw2: number, alpha = 1): void => {
      if (pts.length < 2) return;
      g.lineStyle(lw2, col, alpha);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.strokePath();
    };

    // Build all warped corner points for a letter block
    // returns { tl, tr, bl, br } in world coords
    const letterCorners = (lx: number, ly: number, lw: number, lh: number) => ({
      tl: warp(0, 0, lw, lh, lx, ly),
      tr: warp(1, 0, lw, lh, lx, ly),
      bl: warp(0, 1, lw, lh, lx, ly),
      br: warp(1, 1, lw, lh, lx, ly),
    });

    // ── Draw one full letter block (extrusion + face + bevel) ──
    // letterShape: array of normalized [nx, ny] polygon paths describing the letter silhouette
    // cutouts: array of normalized polygons to cut out (drawn after in a neutral color)
    const drawLetter = (
      lx: number, ly: number, lw: number, lh: number,
      shape: [number,number][][],    // outer faces
      cutouts: [number,number][][] = [],  // holes
    ): void => {
      // ─ Step 1: Extrusion (3D block below and behind the letter face) ─
      // Build extruded bottom by offsetting all bottom-edge points by (extSlant, extDepth)
      for (const pts of shape) {
        // Project all warped face points
        const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        // The extrusion goes down-right. For each edge on the bottom contour we
        // form a parallelogram quad.
        for (let i = 0; i < face.length; i++) {
          const a = face[i];
          const b = face[(i + 1) % face.length];
          // Only extrude downward-facing edges (where both points are near bottom)
          // Use a simpler approach: extrude the whole silhouette as a shadow offset
          const ae: [number,number] = [a[0] + extSlant, a[1] + extDepth];
          const be: [number,number] = [b[0] + extSlant, b[1] + extDepth];
          // Upper extrusion face (top half of extrusion block) — mid-brown
          poly([a, b, be, ae], COL_EXTRUDE_MID);
        }
        // Solid dark fill over full extrusion footprint
        const extFace = face.map(([fx, fy]): [number,number] => [fx + extSlant, fy + extDepth]);
        poly(extFace, COL_EXTRUDE_DARK);
        // Left face of extrusion (visible side plane)
        // Take leftmost edge of the shape and build a side face
        const sortedByX = [...face].sort((a, b2) => a[0] - b2[0]);
        const leftPts = sortedByX.slice(0, Math.ceil(face.length * 0.35));
        for (const lp of leftPts) {
          const lpe: [number,number] = [lp[0] + extSlant, lp[1] + extDepth];
          poly([lp, lpe, [lpe[0]-2, lpe[1]], [lp[0]-2, lp[1]]], COL_EXTRUDE_MID, 0.6);
        }
      }

      // ─ Step 2: Face — bottom (darker) half ─
      for (const pts of shape) {
        const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        poly(face, COL_FACE_DARK);
      }
      // Cutouts on dark face
      for (const cut of cutouts) {
        const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        // Extrude cutout slightly less to show depth rim
        poly(cFace, COL_EXTRUDE_MID);
      }

      // ─ Step 3: Face — top (brighter) half, clipped to upper 55% ─
      // Simulate by drawing the full face bright, then overdrawing the lower 45%
      // with the dark color again via a horizontal clip band.
      for (const pts of shape) {
        const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        // Get the y-range of this shape
        const ys = face.map(p => p[1]);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const splitY = minY + (maxY - minY) * 0.52;
        // Draw full face in bright color
        poly(face, COL_FACE_BRIGHT);
        // Overdraw lower portion in dark — approximate by drawing a dark rect over bottom half
        // then re-clip to the shape. We approximate by finding all points below splitY
        // and drawing the lower trapezoid.
        const lowerPts: [number,number][] = [];
        for (let i = 0; i < face.length; i++) {
          const p = face[i];
          const q = face[(i + 1) % face.length];
          if (p[1] >= splitY) lowerPts.push(p);
          // Check for intersection with splitY on this edge
          if ((p[1] < splitY) !== (q[1] < splitY)) {
            const t2 = (splitY - p[1]) / (q[1] - p[1]);
            lowerPts.push([p[0] + t2 * (q[0] - p[0]), splitY]);
          }
        }
        if (lowerPts.length >= 3) poly(lowerPts, COL_FACE_DARK);
      }

      // Re-draw cutouts over face
      for (const cut of cutouts) {
        const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        poly(cFace, COL_EXTRUDE_MID);
      }

      // ─ Step 4: Top-edge highlight strip ─
      for (const pts of shape) {
        const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        const ys = face.map(p => p[1]);
        const minY = Math.min(...ys);
        // Draw a thin bright strip at the very top
        const topPts: [number,number][] = [];
        const hiY = minY + lh * 0.10;
        for (let i = 0; i < face.length; i++) {
          const p = face[i];
          const q = face[(i + 1) % face.length];
          if (p[1] <= hiY) topPts.push(p);
          if ((p[1] <= hiY) !== (q[1] <= hiY)) {
            const t2 = (hiY - p[1]) / (q[1] - p[1]);
            topPts.push([p[0] + t2 * (q[0] - p[0]), hiY]);
          }
        }
        if (topPts.length >= 2) {
          g.lineStyle(3, COL_FACE_HILIGHT, 0.85);
          g.beginPath();
          g.moveTo(topPts[0][0], topPts[0][1]);
          for (let i = 1; i < topPts.length; i++) g.lineTo(topPts[i][0], topPts[i][1]);
          g.strokePath();
        }
      }

      // ─ Step 5: Bevel inset border ─
      const bv = lw * 0.055; // bevel inset amount
      for (const pts of shape) {
        const face = pts.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        strokePoly(face, COL_BEVEL_DARK, 4, 0.9);
        strokePoly(face, COL_BEVEL_LIGHT, 1.5, 0.7);
        // Inset polygon (shrunk by bv) — dark inner line
        const cx2 = face.reduce((s, p) => s + p[0], 0) / face.length;
        const cy2 = face.reduce((s, p) => s + p[1], 0) / face.length;
        const inset = face.map(([fx, fy]): [number,number] => [
          fx + (cx2 - fx) * (bv / Math.max(1, Math.sqrt((fx-cx2)**2+(fy-cy2)**2))),
          fy + (cy2 - fy) * (bv / Math.max(1, Math.sqrt((fx-cx2)**2+(fy-cy2)**2))),
        ]);
        strokePoly(inset, COL_BEVEL_DARK, 2, 0.6);
      }
      for (const cut of cutouts) {
        const cFace = cut.map(([nx, ny]) => warp(nx, ny, lw, lh, lx, ly));
        strokePoly(cFace, COL_BEVEL_DARK, 2, 0.7);
        strokePoly(cFace, COL_BEVEL_LIGHT, 1, 0.5);
      }
    };

    // ── Letter shape library ──
    // All shapes are ultra-bold rectangles. We define only the outer rect (0,0,1,1)
    // and specify cutout regions as normalized rects [x0,y0, x1,y1] pairs.
    // A "rect cutout" helper converts [x0,y0,x1,y1] to a polygon path.
    const R = (x0: number, y0: number, x1: number, y1: number): [number,number][] =>
      [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const FULL = R(0, 0, 1, 1);

    // Letter: B  — full rect + two right-side bumps (we overdraw the right interior)
    const B = {
      shape: [FULL],
      cuts: [
        R(0.44, 0.06, 0.90, 0.44),  // upper bowl hole
        R(0.44, 0.56, 0.94, 0.94),  // lower bowl hole
      ],
    };
    // Letter: E  — full rect + upper/lower right cutouts (center bar preserved)
    const E2 = {
      shape: [FULL],
      cuts: [
        R(0.40, 0.08, 1.00, 0.41),
        R(0.40, 0.59, 1.00, 0.92),
      ],
    };
    // Letter: A  — explicit shapes: left leg, right leg, crossbar
    // No cutouts needed — built from 3 solid pieces so it's unambiguous
    const A = {
      shape: [
        // Left diagonal leg (wide at bottom, comes to apex at top-centre)
        [[0.00,1.00],[0.38,1.00],[0.50,0.00],[0.30,0.00]] as [number,number][],
        // Right diagonal leg (mirror)
        [[0.62,1.00],[1.00,1.00],[0.70,0.00],[0.50,0.00]] as [number,number][],
        // Crossbar — sits at 55% height
        R(0.15, 0.52, 0.85, 0.72),
      ],
      cuts: [],
    };
    // Letter: R — stem + D-shaped upper bowl + kicked diagonal leg
    // Built from explicit shapes so the bowl and leg read clearly
    const Rlet = {
      shape: [
        // Left stem (full height)
        R(0.00, 0.00, 0.40, 1.00),
        // Upper bowl — right half-oval approximated as a fat rectangle with rounded hint
        // Use a pentagon that bulges right
        [[0.40,0.00],[0.90,0.00],[1.00,0.12],[1.00,0.38],[0.90,0.50],[0.40,0.50]] as [number,number][],
        // Lower diagonal leg — kicks right from stem base
        [[0.40,0.50],[0.88,0.50],[1.00,0.68],[1.00,1.00],[0.72,1.00],[0.40,0.72]] as [number,number][],
      ],
      cuts: [
        // Hollow out the bowl interior so it reads as an open loop
        [[0.40,0.08],[0.80,0.08],[0.88,0.16],[0.88,0.34],[0.80,0.42],[0.40,0.42]] as [number,number][],
      ],
    };
    // Letter: T — full top bar + stem
    const T = {
      shape: [
        R(0, 0, 1, 0.28),           // top bar
        R(0.28, 0.28, 0.72, 1.00),  // stem
      ],
      cuts: [],
    };
    // Letter: C — rect + right-side cutout
    const C = {
      shape: [FULL],
      cuts: [ R(0.38, 0.10, 1.02, 0.90) ],
    };
    // Letter: K — full left stem + two diagonal arms
    const K = {
      shape: [
        R(0, 0, 0.38, 1),        // left stem
        // Upper diagonal arm
        [[0.38,0.38],[1.0,0.0],[1.0,0.22],[0.58,0.50]] as [number,number][],
        // Lower diagonal arm
        [[0.38,0.62],[0.58,0.50],[1.0,0.78],[1.0,1.0]] as [number,number][],
      ],
      cuts: [],
    };

    // ── Measure and lay out letters for "BEAR ATTACK" ──
    // Letter widths (relative units) — B and K are wider to bracket
    // Columns: B  E  A  R     A  T  T  A  C  K
    type LetterDef = { shape: [number,number][][]; cuts: [number,number][][]; };
    const letters1: { def: LetterDef; wRel: number; hScale: number; isOuter: boolean }[] = [
      { def: B,    wRel: 0.80, hScale: 1.00, isOuter: true  },  // B
      { def: E2,   wRel: 0.64, hScale: 0.84, isOuter: false },  // E
      { def: A,    wRel: 0.72, hScale: 0.84, isOuter: false },  // A
      { def: Rlet, wRel: 0.72, hScale: 0.84, isOuter: false },  // R
      { def: A,    wRel: 0.72, hScale: 0.84, isOuter: false },  // A (ATTACK)
      { def: T,    wRel: 0.64, hScale: 0.84, isOuter: false },  // T
      { def: T,    wRel: 0.64, hScale: 0.84, isOuter: false },  // T
      { def: A,    wRel: 0.72, hScale: 0.84, isOuter: false },  // A
      { def: C,    wRel: 0.64, hScale: 0.84, isOuter: false },  // C
      { def: K,    wRel: 0.80, hScale: 1.00, isOuter: true  },  // K
    ];

    // Scale unit: fit 10 letters + 9 gaps + 1 word-space inside W with margin
    // Target total width = W - 32px margins (16 each side)
    const availW   = W - 32;
    const spaceW   = availW * 0.055; // gap between BEAR and ATTACK
    const gap      = availW * 0.012;
    // unitW: solve  sum(wRel)*unitW + 9*gap + spaceW = availW
    const sumWRel  = letters1.reduce((s, l) => s + l.wRel, 0);
    const unitW    = (availW - gap * (letters1.length - 1) - spaceW) / sumWRel;

    const totalW1  = sumWRel * unitW + gap * (letters1.length - 1) + spaceW;
    let x1 = cx - totalW1 / 2;

    for (let i = 0; i < letters1.length; i++) {
      const l = letters1[i];
      const lw = l.wRel * unitW;
      const lh = l.hScale * baseH;
      // Align all letters by their bottom edge
      const ly = baseY + baseH - lh;
      drawLetter(x1, ly, lw, lh, l.def.shape, l.def.cuts);
      x1 += lw + gap;
      // Extra space between BEAR and ATTACK (after index 3)
      if (i === 3) x1 += spaceW;
    }
  }

  // "BEE BEE GUNS" — flat, rounded, bee-themed with alternating black/yellow letters
  private drawBeeSubtitle(cx: number, y: number): void {
    const fontSize = 54;
    const ff = 'Arial Rounded MT Bold, Arial Black, Arial';
    const g  = this.add.graphics().setDepth(2);

    // Approximate metrics
    const charW  = fontSize * 0.60;  // avg char width
    const spaceW = fontSize * 0.30;  // space width
    const approxH = fontSize * 1.15;

    // Build the character sequence with per-letter x positions
    // "BEE BEE GUNS" — split by char, track letter index (ignoring spaces)
    const chars = 'BEE BEE GUNS'.split('');
    let totalW = 0;
    for (const ch of chars) totalW += ch === ' ' ? spaceW : charW;
    let lx = cx - totalW / 2;

    // ── Pass 1: full-string shadow and thick border (whole string, no alternation needed) ──
    this.add.text(cx + 4, y + 5, 'BEE BEE GUNS', {
      fontSize: `${fontSize}px`, fontFamily: ff, color: '#000000',
    }).setOrigin(0.5).setDepth(2);

    this.add.text(cx, y, 'BEE BEE GUNS', {
      fontSize: `${fontSize}px`, fontFamily: ff,
      color: '#1a1400', stroke: '#000000', strokeThickness: 14,
    }).setOrigin(0.5).setDepth(3);

    // ── Pass 2: horizontal stripe overlay (black bands, whole string) ──
    const bx = cx - totalW / 2;
    const by = y - approxH * 0.5;
    const stripes = 5;
    const bh = approxH / stripes;
    for (let i = 0; i < stripes; i++) {
      if (i % 2 === 0) continue;
      g.fillStyle(0x000000, 0.65);
      g.fillRect(bx, by + i * bh, totalW, bh);
    }

    // ── Pass 3: per-letter colored text on top ──
    // Even letter index (0,2,4…) = yellow fill + black stroke
    // Odd  letter index (1,3,5…) = black fill + yellow stroke
    let letterIdx = 0;
    let px = lx;
    for (const ch of chars) {
      if (ch === ' ') {
        px += spaceW;
        continue;
      }
      const isEven = letterIdx % 2 === 0;
      const fillCol   = isEven ? '#ffe033' : '#111100';
      const strokeCol = isEven ? '#000000' : '#f5c518';
      // Position: use left-origin, offset by half charW so origin(0.5) lands correctly
      this.add.text(px + charW / 2, y, ch, {
        fontSize: `${fontSize}px`, fontFamily: ff,
        color: fillCol,
        stroke: strokeCol,
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(6);
      px += charW;
      letterIdx++;
    }

    // ── Bee emoji flankers — pushed well clear of the text ──
    this.add.text(cx - totalW / 2 - 38, y, '🐝', { fontSize: '30px' }).setOrigin(0.5).setDepth(6);
    this.add.text(cx + totalW / 2 + 38, y, '🐝', { fontSize: '30px' }).setOrigin(0.5).setDepth(6);
  }

  private drawDebrisField(g: Phaser.GameObjects.Graphics, cx: number, W: number, H: number): void {
    const groundY = H * 0.67;
    g.fillStyle(0x0a0808, 1); g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle(0x180e08, 1); g.fillRect(0, groundY, W, 8);
    const chunks: [number, number, number, number, number][] = [
      [cx - 280, groundY - 28, 120, 55, 0x1a1a2e], [cx - 180, groundY - 44, 90, 70, 0x1a2a1a],
      [cx - 80,  groundY - 18, 70,  36, 0x2a1a0a], [cx + 60,  groundY - 38, 110, 62, 0x1a1a2e],
      [cx + 200, groundY - 22, 95,  48, 0x0a1a2a], [cx - 240, groundY - 8, 160, 30, 0x1a1a1a],
      [cx + 80,  groundY - 10, 140, 28, 0x111118],
    ];
    for (const [bx, by, bw, bh, col] of chunks) {
      g.fillStyle(col, 1); g.fillRoundedRect(bx, by, bw, bh, 3);
      g.lineStyle(1, 0x334455, 0.6); g.strokeRoundedRect(bx, by, bw, bh, 3);
      g.fillStyle(0x00ffcc, 0.8); g.fillRect(bx + 6,  by + 6, 6, 4);
      g.fillStyle(0xff3300, 0.8); g.fillRect(bx + 16, by + 6, 6, 4);
      g.fillStyle(0xffaa00, 0.6); g.fillRect(bx + 26, by + 6, 6, 4);
    }
    for (const [fx, fy] of [[cx-310,groundY-4],[cx-200,groundY+2],[cx-50,groundY-2]] as [number,number][]) {
      g.fillStyle(0x0d2010, 1); g.fillRect(fx - 20, fy, 40, 10);
      g.lineStyle(1, 0x224422, 0.7); g.strokeRect(fx - 20, fy, 40, 10);
      g.lineStyle(1, 0x00aa44, 0.5); g.lineBetween(fx - 16, fy + 3, fx + 16, fy + 3);
    }
    for (const [sx, sy] of [[cx-180,groundY-6],[cx+150,groundY-8]] as [number,number][]) {
      g.fillStyle(0xff6600, 0.9); g.fillCircle(sx, sy, 3);
    }
  }

  private drawTitleBear(g: Phaser.GameObjects.Graphics, cx: number, H: number): void {
    // All coords relative to bear centre (bx, by). S = scale multiplier.
    const bx = cx;
    const by = H * 0.52;  // lowered to fill more vertical space
    const C = COLORS.bear;
    const S = 3.1;         // bigger bear filling the screen

    // Ground shadow
    g.fillStyle(0x000000, 0.5); g.fillEllipse(bx, by + 115 * S * 0.55, 170 * S * 0.8, 22 * S * 0.5);

    // ── LEGS ──
    g.fillStyle(C.body, 1);
    g.fillRoundedRect(bx - 38 * S * 0.55, by + 46 * S * 0.55, 32 * S * 0.55, 52 * S * 0.55, 8);
    g.fillRoundedRect(bx +  6 * S * 0.55, by + 46 * S * 0.55, 32 * S * 0.55, 52 * S * 0.55, 8);
    // Paw boots
    g.fillStyle(C.dark, 1);
    g.fillRoundedRect(bx - 44 * S * 0.55, by + 88 * S * 0.55, 42 * S * 0.55, 18 * S * 0.55, 6);
    g.fillRoundedRect(bx +  2 * S * 0.55, by + 88 * S * 0.55, 42 * S * 0.55, 18 * S * 0.55, 6);

    // ── BODY ── (drawn before arms so arms overlap it at shoulder)
    g.fillStyle(C.body, 1); g.fillEllipse(bx, by + 18 * S * 0.55, 120 * S * 0.55, 100 * S * 0.55);

    // ── ARMS ──
    // Each arm: shoulder at body edge, elbow mid-point, wrist where hive sits.
    // Left arm: shoulder at body left (~bx - 54), raised up-left
    const shoulderLx = bx - 52 * S * 0.55, shoulderLy = by - 2 * S * 0.55;
    const elbowLx    = bx - 82 * S * 0.55, elbowLy    = by - 28 * S * 0.55;
    const wristLx    = bx - 102 * S * 0.55, wristLy   = by - 66 * S * 0.55;
    // Draw arm as thick filled ellipses along the path (shoulder, elbow, wrist)
    const armW = 28 * S * 0.55;
    for (let t = 0; t <= 1; t += 0.1) {
      const ax = shoulderLx + (elbowLx - shoulderLx) * t;
      const ay = shoulderLy + (elbowLy - shoulderLy) * t;
      g.fillStyle(C.body, 1); g.fillCircle(ax, ay, armW / 2);
    }
    for (let t = 0; t <= 1; t += 0.1) {
      const ax = elbowLx + (wristLx - elbowLx) * t;
      const ay = elbowLy + (wristLy - elbowLy) * t;
      g.fillStyle(C.body, 1); g.fillCircle(ax, ay, armW / 2 * 0.9);
    }
    // Right arm: shoulder at body right, raised up-right
    const shoulderRx = bx + 52 * S * 0.55, shoulderRy = by - 2 * S * 0.55;
    const elbowRx    = bx + 82 * S * 0.55, elbowRy    = by - 28 * S * 0.55;
    const wristRx    = bx + 102 * S * 0.55, wristRy   = by - 66 * S * 0.55;
    for (let t = 0; t <= 1; t += 0.1) {
      const ax = shoulderRx + (elbowRx - shoulderRx) * t;
      const ay = shoulderRy + (elbowRy - shoulderRy) * t;
      g.fillStyle(C.body, 1); g.fillCircle(ax, ay, armW / 2);
    }
    for (let t = 0; t <= 1; t += 0.1) {
      const ax = elbowRx + (wristRx - elbowRx) * t;
      const ay = elbowRy + (wristRy - elbowRy) * t;
      g.fillStyle(C.body, 1); g.fillCircle(ax, ay, armW / 2 * 0.9);
    }

    // Beehives exactly at wrist positions
    this.drawTitleHive(g, wristLx, wristLy);
    this.drawTitleHive(g, wristRx, wristRy);

    // ── HEAD (drawn last so it sits on top of body) ──
    const headR = 58 * S * 0.55;
    const headX = bx, headY = by - 64 * S * 0.55;
    g.fillStyle(C.body, 1); g.fillCircle(headX, headY, headR);

    // Ears
    g.fillStyle(C.dark, 1);
    g.fillCircle(headX - 40 * S * 0.55, headY - 46 * S * 0.55, 20 * S * 0.55);
    g.fillCircle(headX + 40 * S * 0.55, headY - 46 * S * 0.55, 20 * S * 0.55);
    g.fillStyle(C.body, 1);
    g.fillCircle(headX - 40 * S * 0.55, headY - 46 * S * 0.55, 13 * S * 0.55);
    g.fillCircle(headX + 40 * S * 0.55, headY - 46 * S * 0.55, 13 * S * 0.55);

    // Snout
    g.fillStyle(C.snout, 1); g.fillEllipse(headX, headY + 10 * S * 0.55, 42 * S * 0.55, 28 * S * 0.55);
    // Nose
    g.fillStyle(0x1a0a00, 1); g.fillEllipse(headX, headY - 2 * S * 0.55, 16 * S * 0.55, 10 * S * 0.55);

    // ── MENACING FACE ──
    // Heavy angled brows (inner corners raised = angry)
    g.fillStyle(0x1a0a00, 1);
    // Left brow: angled downward toward nose bridge
    g.fillTriangle(
      headX - 30 * S * 0.55, headY - 24 * S * 0.55,
      headX - 8  * S * 0.55, headY - 18 * S * 0.55,
      headX - 8  * S * 0.55, headY - 14 * S * 0.55
    );
    g.fillTriangle(
      headX - 30 * S * 0.55, headY - 24 * S * 0.55,
      headX - 30 * S * 0.55, headY - 18 * S * 0.55,
      headX - 8  * S * 0.55, headY - 14 * S * 0.55
    );
    // Right brow: mirror
    g.fillTriangle(
      headX + 30 * S * 0.55, headY - 24 * S * 0.55,
      headX + 8  * S * 0.55, headY - 18 * S * 0.55,
      headX + 8  * S * 0.55, headY - 14 * S * 0.55
    );
    g.fillTriangle(
      headX + 30 * S * 0.55, headY - 24 * S * 0.55,
      headX + 30 * S * 0.55, headY - 18 * S * 0.55,
      headX + 8  * S * 0.55, headY - 14 * S * 0.55
    );

    // Eyes: narrowed, glowing amber — squinting with rage
    // Eye whites (partially hidden by squint)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 20 * S * 0.55, 10 * S * 0.55);
    g.fillEllipse(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 20 * S * 0.55, 10 * S * 0.55);
    // Amber iris
    g.fillStyle(0xff8800, 1);
    g.fillCircle(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 6 * S * 0.55);
    g.fillCircle(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 6 * S * 0.55);
    // Pupil
    g.fillStyle(0x000000, 1);
    g.fillCircle(headX - 18 * S * 0.55, headY - 8 * S * 0.55, 3 * S * 0.55);
    g.fillCircle(headX + 18 * S * 0.55, headY - 8 * S * 0.55, 3 * S * 0.55);
    // Squint lid lines
    g.lineStyle(4, 0x1a0a00, 1);
    g.lineBetween(headX - 28 * S * 0.55, headY - 10 * S * 0.55, headX - 8 * S * 0.55, headY - 10 * S * 0.55);
    g.lineBetween(headX + 8  * S * 0.55, headY - 10 * S * 0.55, headX + 28 * S * 0.55, headY - 10 * S * 0.55);

    // Menacing open grin — wide snarl showing teeth
    g.fillStyle(0x1a0000, 1);
    g.fillRoundedRect(headX - 20 * S * 0.55, headY + 16 * S * 0.55, 40 * S * 0.55, 18 * S * 0.55, 4);
    // Jagged teeth
    g.fillStyle(0xffffff, 1);
    const teethCount = 5;
    const teethW = 38 * S * 0.55 / teethCount;
    for (let t2 = 0; t2 < teethCount; t2++) {
      const tx2 = headX - 19 * S * 0.55 + t2 * teethW;
      g.fillRect(tx2, headY + 17 * S * 0.55, teethW - 2, 10 * S * 0.55);
    }
    // Snarl lines on cheeks
    g.lineStyle(3, 0x5a2a00, 0.6);
    g.lineBetween(headX - 38 * S * 0.55, headY + 8 * S * 0.55, headX - 22 * S * 0.55, headY + 14 * S * 0.55);
    g.lineBetween(headX + 22 * S * 0.55, headY + 14 * S * 0.55, headX + 38 * S * 0.55, headY + 8 * S * 0.55);

    // War paint stripe
    g.fillStyle(0xaa3300, 0.75);
    g.fillRect(headX - 34 * S * 0.55, headY - 16 * S * 0.55, 68 * S * 0.55, 7 * S * 0.55);
  }

  private drawTitleHive(g: Phaser.GameObjects.Graphics, hx: number, hy: number): void {
    const hs = 1.5; // hive scale relative to old size
    // Hive body
    g.fillStyle(COLORS.hive.body, 1); g.fillEllipse(hx, hy, 44 * hs, 54 * hs);
    g.fillStyle(COLORS.hive.dark, 1);
    g.fillRect(hx - 20 * hs, hy - 10 * hs, 40 * hs, 7 * hs);
    g.fillRect(hx - 20 * hs, hy - 1  * hs, 40 * hs, 7 * hs);
    g.fillRect(hx - 20 * hs, hy + 8  * hs, 40 * hs, 7 * hs);
    g.fillStyle(0x1a0a00, 1); g.fillEllipse(hx, hy + 20 * hs, 16 * hs, 10 * hs);
    // Entrance glow
    g.fillStyle(0xffdd44, 0.3); g.fillEllipse(hx, hy + 20 * hs, 22 * hs, 14 * hs);

    // Bee swarm: 9 bees at 3 orbit radii and varied angles
    const orbits = [
      { r: 34 * hs, count: 4, offset: 0.2 },
      { r: 50 * hs, count: 3, offset: 1.1 },
      { r: 62 * hs, count: 2, offset: 0.7 },
    ];
    for (const orb of orbits) {
      for (let b = 0; b < orb.count; b++) {
        const angle = orb.offset + (b / orb.count) * Math.PI * 2;
        const beeX = hx + Math.cos(angle) * orb.r;
        const beeY = hy + Math.sin(angle) * orb.r * 0.6;
        // Wings
        g.fillStyle(0xddeeff, 0.75);
        g.fillEllipse(beeX - 5, beeY - 3, 10, 6);
        g.fillEllipse(beeX + 3, beeY - 3, 10, 6);
        // Body
        g.fillStyle(COLORS.bee.body, 1); g.fillEllipse(beeX, beeY, 11, 8);
        // Stripe
        g.fillStyle(0x1a1a00, 0.9); g.fillRect(beeX - 3, beeY - 1, 6, 2);
        // Stinger
        g.fillStyle(0x886600, 1); g.fillTriangle(beeX - 6, beeY, beeX - 9, beeY + 1, beeX - 6, beeY + 2);
      }
    }
  }

  private drawSmokeWisps(g: Phaser.GameObjects.Graphics, cx: number, H: number): void {
    const baseY = H * 0.67;
    for (const [sx, spread] of [[cx - 200, 18], [cx + 180, 14], [cx - 60, 10]] as [number,number][]) {
      for (let s = 0; s < 5; s++) {
        g.fillStyle(0x334455, 0.12 - s * 0.02);
        g.fillEllipse(sx + (s % 2 === 0 ? 4 : -4), baseY - s * 38, spread + s * 6, spread + s * 4);
      }
    }
  }
}

// ─── BOOT ──────────────────────────────────────────────────────────────────────────
const config = createGameConfig();
config.scene = [TitleScene, { key: 'GameScene', create, update }];
new Phaser.Game(config);
