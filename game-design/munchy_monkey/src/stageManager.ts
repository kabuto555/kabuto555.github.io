// StageManager: handles stage lifecycle, button press logic, win/lose detection.
// Win condition: reveal all 3 hidden stars by eating surrounding emoji points.

import { FRUIT_SHAPES, StageConfig, generateInfiniteStage } from './fruitData';
import { SplatObject } from './splatObject';
import { BlastParticles } from './blastParticles';

export type StageState = 'playing' | 'cleared' | 'failed';

export interface StageResult {
  state: StageState;
  pressesUsed: number;
  pressesAllowed: number;
  starsFound: number;
  starsTotal: number;
}

export interface StageInfo {
  stageIndex: number;
  totalStages: number;
  shapeName: string;
  emojis: string[];
  /** Remaining uneaten sprite count per emoji index (parallel to emojis[]) */
  emojiCounts: number[];
  pressesAllowed: number;
  pressesUsed: number;
  starsFound: number;
  starsTotal: number;
}

export type MunchCallback = (emojiIndex: number, newStars: number) => void;
export type ItemTriggerCallback = (type: 'bomb' | 'extrabites', detail?: number) => void;

const INITIAL_BITES = 10;

export class StageManager {
  private currentStageIdx = 0;
  private scene: InstanceType<typeof THREE.Object3D>;
  private canvasEl: HTMLCanvasElement;
  private currentSplat: SplatObject | null = null;
  private pressesUsed = 0;
  private pressesAllowed = 0;
  private onStageChange: (info: StageInfo) => void;
  private onResult: (result: StageResult) => void;
  private onMunch: MunchCallback | null = null;
  private onItemTrigger: ItemTriggerCallback | null = null;
  private onEatSprites: ((sprites: Array<{ sprite: InstanceType<typeof THREE.Sprite> }>) => void) | null = null;
  private extraBitesBonus = 3;
  private blastParticles: BlastParticles;
  // Frenzy state (bite-count based, not time-based)
  private frenzyBitesLeft = 0;
  private onFrenzyEnd: (() => void) | null = null;
  // X-ray state
  private xrayUsed = false;
  // Guard: prevent onResult firing more than once per stage
  private _resultFired = false;

  constructor(
    scene: InstanceType<typeof THREE.Object3D>,
    canvasEl: HTMLCanvasElement,
    onStageChange: (info: StageInfo) => void,
    onResult: (result: StageResult) => void,
  ) {
    this.scene = scene;
    this.canvasEl = canvasEl;
    this.onStageChange = onStageChange;
    this.onResult = onResult;
    this.blastParticles = new BlastParticles(scene);
  }

  /** Register a callback fired on each successful button press */
  onMunchCallback(cb: MunchCallback): void { this.onMunch = cb; }

  /** Register a callback fired with eaten sprites (for fly-to-mouth animation) */
  onEatSpritesCallback(cb: (sprites: Array<{ sprite: InstanceType<typeof THREE.Sprite> }>) => void): void {
    this.onEatSprites = cb;
  }

  /** Register a callback fired when a bomb or extra-bites item triggers */
  onItemCallback(cb: ItemTriggerCallback): void { this.onItemTrigger = cb; }

  get stageIndex(): number { return this.currentStageIdx; }
  get totalStages(): number { return 0; } // endless
  get splat(): SplatObject | null { return this.currentSplat; }

  startStage(idx: number): void {
    if (this.currentSplat) {
      this.scene.remove(this.currentSplat.danceGroup);
      this.currentSplat.dispose();
      this.currentSplat = null;
    }

    this.currentStageIdx = idx;
    const cfg = generateInfiniteStage(idx);
    const shape = FRUIT_SHAPES[cfg.shapeIndex];

    const splat = new SplatObject(shape, cfg, this.canvasEl);
    splat.group.rotation.x = 0.3;
    splat.group.rotation.y = 0.4;
    splat.onBlast((worldPos, epicentre, tex, size) => {
      this.blastParticles.spawn(worldPos, epicentre, tex, size);
    });
    splat.onBombStar((n) => {
      // Stars revealed by an in-stage bomb get their own onMunch call
      // so main.ts fires a separate doober for each.
      if (n > 0) this.onMunch?.(-2, n);
      this._checkWin();
    });
    splat.onItem((type, detail) => {
      if (type === 'extrabites') {
        this.pressesAllowed += this.extraBitesBonus;
        this.onItemTrigger?.('extrabites', this.extraBitesBonus);
        this.onStageChange(this._buildInfo());
      } else if (type === 'bomb') {
        this.onItemTrigger?.('bomb', detail);
        this.onStageChange(this._buildInfo());
        this._checkWin(); // guarded by _resultFired
      }
    });
    this.scene.add(splat.danceGroup);
    this.currentSplat = splat;

    this.pressesUsed = 0;
    this.pressesAllowed = INITIAL_BITES;
    this.frenzyBitesLeft = 0;
    this.xrayUsed = false;
    this._resultFired = false;

    this.onStageChange(this._buildInfo());
  }

  // ── Power-up API ───────────────────────────────────────────────────────────

  addBites(n: number): void {
    this.pressesAllowed += n;
    // Player got more bites after a fail — reset the result gate so the stage
    // can end again (win or fail) after the extra bites are used.
    this._resultFired = false;
    this.onStageChange(this._buildInfo());
  }

  /** Pre-calculate the outer surface shell before the banana animation starts */
  prepareBananaPeel(
    camera: InstanceType<typeof THREE.Camera>,
    canvasRect: DOMRect,
  ): void {
    this.currentSplat?.preparePeelLayer(camera, canvasRect);
  }

  /**
   * Called each frame during the banana peel animation.
   * Eats pre-calculated outer-layer sprites whose screen-Y <= bananaScreenY.
   */
  eatBananaRow(bananaScreenY: number): void {
    if (!this.currentSplat) return;
    this.currentSplat.eatBananaLayerAtScreenY(bananaScreenY, (sprite, worldPos) => {
      this.blastParticles.spawnPeel(sprite, worldPos);
    });
    this._checkWin();
  }

  useBananaPeel(): number {
    if (!this.currentSplat) return 0;
    const newStars = this.currentSplat.eatBananaLayer();
    if (newStars > 0) this.onMunch?.(-1, newStars);
    this.onStageChange(this._buildInfo());
    this._checkWin();
    return newStars;
  }

  useXRay(): boolean {
    if (!this.currentSplat || this.xrayUsed) return false;
    this.xrayUsed = true;
    this.currentSplat.setXRay(true);
    return true;
  }

  get isXRayUsed(): boolean { return this.xrayUsed; }

  useMegaBomb(worldImpact?: InstanceType<typeof THREE.Vector3>): number {
    if (!this.currentSplat) return 0;
    const newStars = this.currentSplat.triggerMegaBomb(worldImpact);
    if (newStars > 0) this.onMunch?.(-1, newStars);
    this.onStageChange(this._buildInfo());
    this._checkWin();
    return newStars;
  }

  startFrenzy(bites: number, onEnd: () => void): void {
    this.frenzyBitesLeft = bites;
    this.onFrenzyEnd = onEnd;
  }

  get isFrenzyActive(): boolean { return this.frenzyBitesLeft > 0; }

  /** Check win condition after any action that may have revealed stars. */
  private _handleNewStars(newStars: number): void {
    if (!this.currentSplat) return;
    if (newStars > 0) this.onMunch?.(-1, newStars);
    this._checkWin();
  }

  /** Always-safe win check — call after any eat/blast/peel action. */
  private _checkWin(): void {
    if (!this.currentSplat || this._resultFired) return;
    const sf = this.currentSplat.starsRevealed;
    const st = this.currentSplat.starsTotal;
    if (sf >= st) {
      this._resultFired = true;
      this.onResult({
        state: 'cleared',
        pressesUsed: this.pressesUsed,
        pressesAllowed: this.pressesAllowed,
        starsFound: sf,
        starsTotal: st,
      });
    }
  }

  /**
   * Public escape hatch: if all stars are revealed but _resultFired was already
   * set (e.g. a prior action set it but the result never showed), reset the flag
   * and re-fire onResult so the win screen always appears.
   */
  forceCheckWin(): void {
    if (!this.currentSplat) return;
    const sf = this.currentSplat.starsRevealed;
    const st = this.currentSplat.starsTotal;
    if (sf >= st && !this._resultFired) {
      this._resultFired = true;
      this.onResult({
        state: 'cleared',
        pressesUsed: this.pressesUsed,
        pressesAllowed: this.pressesAllowed,
        starsFound: sf,
        starsTotal: st,
      });
    }
  }

  /** Debug: immediately clear the current stage regardless of state. */
  debugClear(): void {
    if (!this.currentSplat || this._resultFired) return;
    this._resultFired = true;
    const st = this.currentSplat.starsTotal;
    this.onResult({
      state: 'cleared',
      pressesUsed: this.pressesUsed,
      pressesAllowed: this.pressesAllowed,
      starsFound: st,
      starsTotal: st,
    });
  }

  startFirst(): void { this.startStage(0); }

  nextStage(): void {
    this.startStage(this.currentStageIdx + 1);
  }

  restartStage(): void { this.startStage(this.currentStageIdx); }

  /**
   * Player pressed a fruit button mapped to emojiIndex.
   * Eats visible matching points, checks for star reveals, checks win/fail.
   */
  pressButton(emojiIndex: number): (StageResult & {
    eatSprites: Array<{ sprite: InstanceType<typeof THREE.Sprite> }>;
  }) | null {
    if (!this.currentSplat) return null;
    this.pressesUsed++;

    const { eaten, newStars, eatSprites } = this.currentSplat.eatEmoji(emojiIndex);
    this.onMunch?.(emojiIndex, newStars);

    const starsFound = this.currentSplat.starsRevealed;
    const starsTotal = this.currentSplat.starsTotal;

    const result = {
      state: 'playing' as StageState,
      pressesUsed: this.pressesUsed,
      pressesAllowed: this.pressesAllowed,
      starsFound,
      starsTotal,
      eatSprites,
    };

    // Win: all stars found
    if (starsFound >= starsTotal && !this._resultFired) {
      this._resultFired = true;
      result.state = 'cleared';
      this.onResult(result);
      return result;
    }

    // Fail: out of bites
    if (this.pressesUsed >= this.pressesAllowed && !this._resultFired) {
      this._resultFired = true;
      result.state = 'failed';
      this.onResult(result);
      return result;
    }

    this.onStageChange(this._buildInfo());
    return result;
  }

  update(dt: number): void {
    this.currentSplat?.update(dt);
    this.blastParticles.update(dt);

    if (this.frenzyBitesLeft > 0 && this.currentSplat) {
      // Spin the fruit hard every frame
      this.currentSplat.applyFrenzySpin(dt);
      // Auto-eat one bite every 0.45 s
      this._frenzyEatAccum = (this._frenzyEatAccum ?? 0) + dt;
      if (this._frenzyEatAccum >= 0.45) {
        this._frenzyEatAccum = 0;
        const indices = [...this.currentSplat.getVisibleEmojiIndices()];
        if (indices.length > 0) {
          const idx = indices[Math.floor(Math.random() * indices.length)];
          const { newStars, eatSprites } = this.currentSplat.eatEmoji(idx);
          this.onMunch?.(idx, newStars);
          if (eatSprites.length) this.onEatSprites?.(eatSprites);
          this._checkWin();
        }
        this.frenzyBitesLeft--;
        if (this.frenzyBitesLeft <= 0) {
          this.onFrenzyEnd?.();
          this.onFrenzyEnd = null;
          this.onStageChange(this._buildInfo());
        }
      }
    }
  }
  private _frenzyEatAccum = 0;

  getVisibleEmojis(): Set<number> {
    return this.currentSplat?.getVisibleEmojiIndices() ?? new Set();
  }

  private _buildInfo(): StageInfo {
    const cfg = generateInfiniteStage(this.currentStageIdx);
    const shape = FRUIT_SHAPES[cfg.shapeIndex];
    const emojis = cfg.mergedEmojis ?? shape.emojis;
    const emojiCounts = emojis.map((_, i) =>
      this.currentSplat?.getEmojiCount(i) ?? 0,
    );
    return {
      stageIndex: this.currentStageIdx,
      totalStages: 0, // endless — no total
      shapeName: cfg.comboName ?? shape.name,
      emojis,
      emojiCounts,
      pressesAllowed: this.pressesAllowed,
      pressesUsed: this.pressesUsed,
      starsFound: this.currentSplat?.starsRevealed ?? 0,
      starsTotal: this.currentSplat?.starsTotal ?? 3,
    };
  }

  getCurrentInfo(): StageInfo { return this._buildInfo(); }
}
