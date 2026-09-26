import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { AudioAnalyser } from './audioAnalyser';
import { configureRenderer, createLightingRig, observeContainerResize } from './scene';
import { hardenGestures, hardenViewport } from './gesture-hardening';
import { StageManager, StageInfo, StageResult } from './stageManager';
import { GameHUD } from './hud';
import { MonkeyModel } from './monkeyModel';
import { PowerUpHUD } from './powerupHUD';
import { TrippyBackground } from './trippyBackground';
import { CoconutWallet, POWERUP_COST, STAGE_CLEAR_REWARD } from './coconuts';
import { MunchParticles } from './munchParticles';

hardenViewport();
hardenGestures();

// ── BGM ──────────────────────────────────────────────────────────────
const bgm = document.createElement('audio');
bgm.src = 'assets/dk-rap.mp3';
bgm.loop = true;
bgm.volume = 0.45;
bgm.preload = 'auto';

// ── SFX: munch ───────────────────────────────────────────────────────
const munchSfx = document.createElement('audio');
munchSfx.src = 'assets/munch-sound-effect.mp3';
munchSfx.volume = 0.75;
munchSfx.preload = 'auto';

function playMunch(): void {
  munchSfx.currentTime = 0;
  munchSfx.play().catch(() => {});
}

const failSfx = document.createElement('audio');
failSfx.src = 'assets/priceisrightfail_1.mp3';
failSfx.volume = 0.85;
failSfx.preload = 'auto';

function playFail(): void {
  failSfx.currentTime = 0;
  failSfx.play().catch(() => {});
}

const successSfx = document.createElement('audio');
successSfx.src = 'assets/jet-set-radio-success.mp3';
successSfx.volume = 0.85;
successSfx.preload = 'auto';

function playSuccess(): void {
  successSfx.currentTime = 0;
  successSfx.play().catch(() => {});
}

const starSfx = document.createElement('audio');
starSfx.src = 'assets/anime-wow-sound-effect-mp3cut.mp3';
starSfx.volume = 0.8;
starSfx.preload = 'auto';

function playStar(): void {
  starSfx.currentTime = 0;
  starSfx.play().catch(() => {});
}

const bananaSfx = document.createElement('audio');
bananaSfx.src = 'assets/banana-peel-slip.mp3';
bananaSfx.volume = 0.45;
bananaSfx.preload = 'auto';

function playBananaPeel(): void {
  bananaSfx.currentTime = 0;
  bananaSfx.play().catch(() => {});
}

const xraySfx = document.createElement('audio');
xraySfx.src = 'assets/splinter-cell-night-vision-goggle-sound-effect.mp3';
xraySfx.volume = 0.3;
xraySfx.preload = 'auto';

function playXRay(): void {
  xraySfx.currentTime = 0;
  xraySfx.play().catch(() => {});
}

const explosionSfx = document.createElement('audio');
explosionSfx.src = 'assets/explosion_1.mp3';
explosionSfx.volume = 0.7;
explosionSfx.preload = 'auto';

function playExplosion(): void {
  explosionSfx.currentTime = 0;
  explosionSfx.play().catch(() => {});
}

const chimpSfx = document.createElement('audio');
chimpSfx.src = 'assets/chimpanzee-laugh.mp3';
chimpSfx.volume = 0.7;
chimpSfx.preload = 'auto';

function playChimp(): void {
  chimpSfx.currentTime = 0;
  chimpSfx.play().catch(() => {});
}

const saiyanSfx = document.createElement('audio');
saiyanSfx.src = 'assets/saiyan.mp3';
saiyanSfx.volume = 0.30;
saiyanSfx.preload = 'auto';
let _saiyanFadeRaf = 0;

function playSaiyan(): void {
  cancelAnimationFrame(_saiyanFadeRaf);
  saiyanSfx.volume = 0.30;
  saiyanSfx.currentTime = 0;
  saiyanSfx.play().catch(() => {});
}

function fadeSaiyan(): void {
  cancelAnimationFrame(_saiyanFadeRaf);
  const step = () => {
    saiyanSfx.volume = Math.max(0, saiyanSfx.volume - 0.04);
    if (saiyanSfx.volume > 0) {
      _saiyanFadeRaf = requestAnimationFrame(step);
    } else {
      saiyanSfx.pause();
    }
  };
  _saiyanFadeRaf = requestAnimationFrame(step);
}

const analyser = new AudioAnalyser();

let bgmStarted = false;
function startBGM(): void {
  if (bgmStarted) return;
  bgmStarted = true;
  analyser.connect(bgm);   // connect BEFORE play() so AudioContext is ready
  bgm.play().catch(() => { /* autoplay blocked — mute btn still works */ });
  analyser.resume();
}

// Start BGM on first user interaction (required by browsers)
document.addEventListener('pointerdown', startBGM, { once: true });

const container = document.getElementById('game');
if (!container) throw new Error('#game container not found');

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
configureRenderer(renderer);
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
container.style.background = '#000'; // shader owns the background
container.appendChild(renderer.domElement);

// ── Scene & Camera ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
renderer.setClearColor(0x000000, 0);

// ── Trippy background ─────────────────────────────────────────────────────────
const trippyBg = new TrippyBackground(scene);

const camera = new THREE.PerspectiveCamera(54, GAME_WIDTH / GAME_HEIGHT, 0.1, 100);
// Zoomed out (FOV 54, Z=7.5) so the play area is ~3.6 world units tall —
// enough to fit fruit + gap + monkey without crowding.
// lookAt Y=-1.9 centres on the play-area midpoint between the two UI cards.
camera.position.set(0, -2.6, 7.5);
camera.lookAt(0, -2.6, 0);

observeContainerResize(container, renderer, camera);
createLightingRig(scene);

// ── Monkey model ──────────────────────────────────────────────────────────────
const monkey = new MonkeyModel();
// Portrait canvas: visible X ~±1.24, visible Y ~-2.9 to +2.5 at Z=0.
// Monkey sits at bottom-centre; arms reach up toward the fruit above.
monkey.group.scale.setScalar(0.82);
monkey.setBaseY(-4.5);
// Z position is managed inside monkeyModel.update() (base -1.8, lunge toward fruit)
scene.add(monkey.group);

// ── Fruit group position ──────────────────────────────────────────────────────
// Fruit at Y=-0.2 keeps its top (~+0.7) below the header card bottom.
// Monkey base at Y=-2.0; midpoint Y=-1.1, camera lookAt Y=-0.9.
const FRUIT_Y = -2.1;
const fruitPivot = new THREE.Group();
fruitPivot.position.set(0, FRUIT_Y, 0);
scene.add(fruitPivot);
monkey.setFruitWorldY(FRUIT_Y);

// ── Coconut wallet ───────────────────────────────────────────────────────────
const wallet = new CoconutWallet();

// ── Munch particles (emoji fly-to-mouth animation) ───────────────────────────
const munchParticles = new MunchParticles();

// ── Game state ────────────────────────────────────────────────────────────────
let gameStarted = false;
let pendingResult: StageResult | null = null;

// ── HUD ───────────────────────────────────────────────────────────────────────
const hud = new GameHUD(container, (emojiIndex: number) => {
  if (!gameStarted || pendingResult) return;
  const result = stageManager.pressButton(emojiIndex);
  if (result) {
    hud.flashButton(emojiIndex, result.starsFound > 0 || result.state === 'playing');
    hud.updateStage(stageManager.getCurrentInfo());
    // Tween eaten sprites into the monkey's mouth
    if (result.eatSprites?.length) {
      const getTarget = () => monkey.getMouthWorldPos();
      result.eatSprites.forEach(({ sprite }) => {
        munchParticles.spawn(sprite, getTarget);
      });
    }
  }
});

// ── Stage manager ─────────────────────────────────────────────────────────────
// BGM always on — no mute button.
hud.updateCoconuts(wallet.balance);

// Buy coconuts button: watch mock ad → +10 coconuts, doobers fly to counter
hud.addBuyCoconutsButton(() => {
  powerupHUD.showAdModal(() => {
    const AD_REWARD = 10;
    wallet.earn(AD_REWARD);
    // Fly doobers from the centre of the screen to the counter
    const rect = renderer.domElement.getBoundingClientRect();
    hud.punchCoconuts(AD_REWARD, rect.left + rect.width / 2, rect.top + rect.height * 0.5);
  });
});

wallet.onChange((bal) => {
  hud.updateCoconuts(bal);
  powerupHUD.setAffordable(bal >= POWERUP_COST);
});

const stageManager = new StageManager(
  fruitPivot,          // splat groups are children of the fruitPivot
  renderer.domElement,
  (info: StageInfo) => {
    hud.updateStage(info);
  },
  (result: StageResult) => {
    pendingResult = result;
    const isLast = false; // endless — there is no last stage
    if (result.state === 'failed') {
      playFail();
      // Out of bites — show ad-gate modal instead of regular result
      setTimeout(() => {
        powerupHUD.showOutOfBitesModal(
          result.starsFound, result.starsTotal,
          () => { // Retry
            pendingResult = null;
            stageManager.restartStage();
            onStageStarted();
          },
          () => { // Watch ad → 3-second mock ad → +5 bites
            powerupHUD.showAdModal(() => {
              pendingResult = null;
              stageManager.addBites(5);
              hud.updateStage(stageManager.getCurrentInfo());
            });
          },
        );
      }, 600);
    } else {
      playSuccess();
      // Grant coconuts on clear
      const earned = result.state === 'cleared' ? STAGE_CLEAR_REWARD : 0;
      if (earned > 0) wallet.earn(earned);
      setTimeout(() => {
        hud.showResult(
          result, isLast, earned,
          () => {
            pendingResult = null;
            stageManager.nextStage();
            onStageStarted();
          },
          // Coconut doober: fly from earn row to counter
          (originX, originY) => {
            hud.punchCoconuts(earned, originX, originY);
          },
        );
      }, 800);
    }
  },
);

// Helper: project a world-space point to CSS-pixel viewport coords
function worldToViewport(worldPos: InstanceType<typeof THREE.Vector3>): { x: number; y: number } {
  const ndc = worldPos.clone().project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
    y: rect.top  + (-ndc.y * 0.5 + 0.5) * rect.height,
  };
}

// Track how many stars have been collected this stage for slot indexing
let starsCollectedThisStage = 0;

// Wire eat-sprites callback: tween eaten sprites to monkey mouth (frenzy)
stageManager.onEatSpritesCallback((sprites) => {
  const getTarget = () => monkey.getMouthWorldPos();
  sprites.forEach(({ sprite }) => {
    munchParticles.spawn(sprite, getTarget);
  });
});

// Wire munch callback: monkey animates + doober star into HUD slot
stageManager.onMunchCallback((emojiIndex, newStars) => {
  monkey.triggerMunch();
  playMunch();
  if (newStars > 0) {
    playStar();
    for (let i = 0; i < newStars; i++) {
      const splat = stageManager.splat;
      const worldPos = splat?.getLastRevealedStarWorldPos() ?? null;
      const slotIndex = starsCollectedThisStage;
      starsCollectedThisStage++;
      if (worldPos) {
        const vp = worldToViewport(worldPos);
        hud.punchStars(slotIndex, vp.x, vp.y);
      } else {
        const rect = renderer.domElement.getBoundingClientRect();
        hud.punchStars(slotIndex, rect.left + rect.width / 2, rect.top + rect.height * 0.35);
      }
    }
    // Reconcile after doobers land
    setTimeout(() => {
      const revealed = stageManager.splat?.starsRevealed ?? 0;
      hud.reconcileStars(revealed);
    }, 700);
  }
});

// Wire item callback: show toast for bomb/extrabites
stageManager.onItemCallback((type, detail) => {
  hud.showItemToast(type, detail);
  if (type === 'bomb') {
    playExplosion();
    hud.updateStage(stageManager.getCurrentInfo());
  }
  if (type === 'extrabites') playChimp();
});

// ── Power-up HUD ──────────────────────────────────────────────────────────────
const powerupHUD = new PowerUpHUD(container, (id) => {
  if (!gameStarted || pendingResult) return;

  // X-Ray is free (once per stage, permanently on)
  if (id === 'xray') {
    const ok = stageManager.useXRay();
    if (ok) {
      playXRay();
      powerupHUD.lockXRay();
      monkey.showSunglasses();
    }
    return;
  }

  // All other power-ups cost coconuts and are reusable
  if (!wallet.canAfford()) {
    hud.showItemToast('broke', 0);
    return;
  }
  wallet.spend(); // deducts and fires onChange → updates HUD + button affordability

  if (id === 'banana') {
    playBananaPeel();
    const canvasRect = renderer.domElement.getBoundingClientRect();
    stageManager.prepareBananaPeel(camera, canvasRect);
    powerupHUD.animateBananaPeel(
      (bananaScreenY) => {
        // bananaScreenY is the banana element's bottom edge in viewport pixels
        stageManager.eatBananaRow(bananaScreenY);
        hud.updateStage(stageManager.getCurrentInfo());
      },
      () => {
        stageManager.splat?.clearPeelCache();
        hud.updateStage(stageManager.getCurrentInfo());
      },
    );
  }

  if (id === 'megabomb') {
    const splat = stageManager.splat;
    const target = splat
      ? splat.getRandomSurfaceWorldPos()
      : (() => { const v = new THREE.Vector3(); fruitPivot.getWorldPosition(v); return v; })();
    monkey.throwBomb(scene, target, () => {
      if (pendingResult) return;
      playExplosion();
      stageManager.useMegaBomb(target);
      // onMunchCallback already fires triggerStarDoobers via useMegaBomb — don't double-call
      hud.updateStage(stageManager.getCurrentInfo());
      if (!pendingResult && stageManager.splat) {
        const info = stageManager.getCurrentInfo();
        if (info.starsFound >= info.starsTotal) stageManager.forceCheckWin();
      }
    });
  }

  if (id === 'frenzy') {
    playSaiyan();
    stageManager.startFrenzy(3, () => {
      hud.updateStage(stageManager.getCurrentInfo());
      fadeSaiyan();
    });
  }
});
hud.attachPowerUpBar(powerupHUD.getBar());

// Helper: trigger star doobers for newly revealed stars after a power-up
function triggerStarDoobers(count: number): void {
  for (let i = 0; i < count; i++) {
    const splat = stageManager.splat;
    const worldPos = splat?.getLastRevealedStarWorldPos() ?? null;
    const slotIndex = starsCollectedThisStage;
    starsCollectedThisStage++;
    const rect = renderer.domElement.getBoundingClientRect();
    const vp = worldPos ? worldToViewport(worldPos)
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.35 };
    hud.punchStars(slotIndex, vp.x, vp.y);
  }
  // 700ms after the last doober lands, reconcile HUD slots against actual star count
  setTimeout(() => {
    const revealed = stageManager.splat?.starsRevealed ?? 0;
    hud.reconcileStars(revealed);
  }, 700);
}

// Called after every stage start to wire drag + reset HUD stars
function onStageStarted(): void {
  starsCollectedThisStage = 0;
  hud.resetStars();
  powerupHUD.resetAll();
  powerupHUD.setAffordable(wallet.canAfford());
  monkey.hideSunglasses();
  hud.showDragHint();
  // X-ray is reset per-stage inside StageManager (new splat = no xray applied)
  const splat = stageManager.splat;
  if (!splat) return;
  splat.onDrag((rotX, rotY, isDragging) => {
    if (isDragging) hud.dismissDragHint();
    monkey.setFruitRotation(rotX, rotY, isDragging);
  });
}

// ── Debug: P key force-clears the current stage ─────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'p' && e.key !== 'P') return;
  if (!gameStarted || pendingResult) return;
  stageManager.debugClear();
});

// ── Intro screen ──────────────────────────────────────────────────────────────
hud.showIntro(() => {
  gameStarted = true;
  stageManager.startFirst();
  onStageStarted();
});

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  analyser.update(dt);
  const beat   = analyser.getBeat();
  const energy = analyser.getEnergy();

  trippyBg.update(clock.elapsedTime, energy, beat);
  hud.setBeatEnergy(beat, energy, dt);
  powerupHUD.setBeatEnergy(beat, energy, dt);

  if (gameStarted) {
    stageManager.update(dt);
    stageManager.splat?.setDanceEnergy(beat);
    // Trigger munch animation during frenzy
    if (stageManager.isFrenzyActive) monkey.triggerMunch();
  }

  monkey.setDanceEnergy(energy);
  monkey.update(dt);
  munchParticles.update(dt);
  renderer.render(scene, camera);
}
animate();
