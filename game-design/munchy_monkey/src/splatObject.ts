// SplatObject: renders a 3D emoji "gaussian splat" point cloud using
// THREE.Sprite with CanvasTexture per emoji. Supports touch/drag rotation.
// Stars (⭐) are hidden inside the fruit; they become visible (revealed) when
// surrounding emoji points are eaten away, exposing them to the camera.

import { SplatPoint, FruitShape, StageConfig, FRUIT_SHAPES } from './fruitData';

export type ItemType = 'star' | 'bomb' | 'extrabites';

export interface SplatSprite {
  sprite: InstanceType<typeof THREE.Sprite>;
  point: SplatPoint;
  eaten: boolean;
  itemType: ItemType | null; // null = regular emoji
  revealed: boolean;         // star/item collected
}

/** Called during drag so external systems (monkey) can mirror the rotation */
export type DragCallback = (rotX: number, rotY: number, isDragging: boolean) => void;
/** Called when a bomb or extra-bites item is triggered */
export type ItemCallback = (type: 'bomb' | 'extrabites', blastCount?: number) => void;
/** Called for each sprite blasted by a bomb — provides world pos + texture for particle FX */
export type BlastCallback = (
  worldPos: InstanceType<typeof THREE.Vector3>,
  epicentre: InstanceType<typeof THREE.Vector3>,
  tex: InstanceType<typeof THREE.CanvasTexture>,
  spriteSize: number,
) => void;

const STAR_COUNT      = 3;
const BOMB_COUNT      = 1;   // one bomb per stage
const EXTRABITES_COUNT = 1;  // one extra-bites per stage
const STAR_EMOJI      = '⭐';
const BOMB_EMOJI      = '💣';
const EXTRABITES_EMOJI = '🐵'; // monkey face = extra bites

// Reveal thresholds (in local-space distance units)
const REVEAL_RADIUS   = 0.22;  // neighbours within this distance block reveal
const REVEAL_MAX_BLOCKERS = 3; // reveal when ≤ this many neighbours remain

export class SplatObject {
  /** Outer wrapper — add THIS to the scene. Beat dance rotates this. */
  danceGroup: InstanceType<typeof THREE.Group>;
  /** Inner group — player drag rotates this. Scale from config applied here. */
  group: InstanceType<typeof THREE.Group>;

  private sprites: SplatSprite[] = [];
  private shape: FruitShape;
  private config: StageConfig;
  /** Effective emoji list — may be a merged combo set from config */
  private emojis: string[];
  private textures: Map<string, InstanceType<typeof THREE.CanvasTexture>> = new Map();

  // Drag state
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private angularVelX = 0; // screen-space angular velocity (radians/s)
  private angularVelY = 0;
  // Accumulated orientation as a quaternion so world-space axes are always used
  private _orientation = new THREE.Quaternion();
  // Reusable temporaries to avoid per-frame allocation
  private _qTmp = new THREE.Quaternion();
  private static _WORLD_UP    = new THREE.Vector3(0, 1, 0);
  private static _WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

  // External drag listener
  private dragCallback: DragCallback | null = null;

  // The canvas element the renderer is drawing into (for getBoundingClientRect)
  private canvasEl: HTMLCanvasElement;

  // Item tracking
  private starsFoundCount = 0;
  private itemCallback: ItemCallback | null = null;
  private blastCallback: BlastCallback | null = null;
  /** Fired when an in-stage bomb reveals stars, separate from the press newStars */
  private bombStarCallback: ((n: number) => void) | null = null;

  // Beat dance state
  private danceEnergy = 0;
  private danceTime   = 0;

  /** Register callback for bomb/extrabites triggers */
  onItem(cb: ItemCallback): void { this.itemCallback = cb; }
  /** Register callback for stars revealed by an in-stage bomb (separate doober) */
  onBombStar(cb: (n: number) => void): void { this.bombStarCallback = cb; }
  /** Register callback fired per-sprite when a bomb blasts (for particle FX) */
  onBlast(cb: BlastCallback): void { this.blastCallback = cb; }

  /** Feed real-time beat energy (0–1) each frame for dance animation */
  setDanceEnergy(e: number): void { this.danceEnergy = e; }

  constructor(shape: FruitShape, config: StageConfig, canvasEl: HTMLCanvasElement) {
    this.shape = shape;
    this.config = config;
    this.canvasEl = canvasEl;
    this.emojis = config.mergedEmojis ?? shape.emojis;
    this.danceGroup = new THREE.Group();
    this.group = new THREE.Group();
    this.group.scale.set(config.scaleX, config.scaleY, config.scaleZ);
    this.danceGroup.add(this.group);
    this._buildTextures();
    this._buildSprites();
    this._bindInput();
  }

  /** Register a callback invoked whenever the fruit rotates */
  onDrag(cb: DragCallback): void {
    this.dragCallback = cb;
  }

  // ── Textures ─────────────────────────────────────────────────────────────────

  private _buildTextures(): void {
    // For combo stages, emojis covers both shapes already (mergedEmojis)
    const allEmojis = [...this.emojis, STAR_EMOJI, BOMB_EMOJI, EXTRABITES_EMOJI];
    for (const emoji of allEmojis) {
      if (this.textures.has(emoji)) continue;
      const size = 128;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.font = `${size * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, size / 2, size / 2);
      const tex = new THREE.CanvasTexture(c);
      this.textures.set(emoji, tex);
    }
  }

  // ── Sprite construction ───────────────────────────────────────────────────────

  private _buildSprites(): void {
    const isCombo = this.config.shapeIndexB !== undefined;
    if (isCombo) {
      this._buildComboSprites();
    } else {
      const placed = this._buildSingleSprites(this.shape, this.shape.emojis, this.config.seed, 0);
      this._starsTotal = placed;
    }
  }

  /** Build a single-shape sprite cloud offset by xOffset in local space */
  /** Returns the number of stars actually placed. */
  private _buildSingleSprites(
    shape: FruitShape,
    emojis: string[],
    seed: number,
    xOffset: number,
    starCount = STAR_COUNT,
    bombCount = BOMB_COUNT,
    extraBitesCount = EXTRABITES_COUNT,
    emojiIndexOffset = 0,
  ): number {
    const rawPts = shape.generate(6);

    let s = (seed ^ 0xabcdef) >>> 0;
    const rng = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };

    const lo = Math.floor(rawPts.length * 0.15);
    const hi = Math.floor(rawPts.length * 0.85);
    const specialIndices = new Map<number, ItemType>();
    const totalSpecial = starCount + bombCount + extraBitesCount;
    let attempts = 0;
    while (specialIndices.size < totalSpecial && attempts < 1000) {
      const idx = lo + Math.floor(rng() * (hi - lo));
      if (!specialIndices.has(idx)) {
        const count = specialIndices.size;
        if (count < starCount)                         specialIndices.set(idx, 'star');
        else if (count < starCount + bombCount)        specialIndices.set(idx, 'bomb');
        else                                           specialIndices.set(idx, 'extrabites');
      }
      attempts++;
    }

    const emojiForType: Record<ItemType, string> = {
      star: STAR_EMOJI, bomb: BOMB_EMOJI, extrabites: EXTRABITES_EMOJI,
    };
    const sizeForType: Record<ItemType, number> = {
      star: 0.30, bomb: 0.28, extrabites: 0.28,
    };

    for (let i = 0; i < rawPts.length; i++) {
      const pt = rawPts[i];
      const itemType = specialIndices.get(i) ?? null;
      const isItem = itemType !== null;
      // Map local emoji index to the merged emoji list
      const localIdx = pt.emojiIndex % emojis.length;
      const mergedIdx = localIdx + emojiIndexOffset;
      const emoji = isItem ? emojiForType[itemType!] : emojis[localIdx];
      const tex   = this.textures.get(emoji)!;
      const size  = isItem ? sizeForType[itemType!] : 0.22 * pt.scale;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);
      sprite.position.set(pt.x + xOffset, pt.y, pt.z);
      this.group.add(sprite);
      // Store merged emojiIndex so getEmojiCount maps to the right HUD button
      const mergedPt = { ...pt, x: pt.x + xOffset, emojiIndex: isItem ? pt.emojiIndex : mergedIdx };
      this.sprites.push({ sprite, point: mergedPt, eaten: false, itemType, revealed: false });
    }
    // Return actual stars placed (may be < starCount if shape had too few points)
    let placed = 0;
    for (const [, t] of specialIndices) if (t === 'star') placed++;
    return placed;
  }

  /** Build two side-by-side shapes for combo stages */
  private _buildComboSprites(): void {
    const cfg = this.config;
    const shapeA = FRUIT_SHAPES[cfg.shapeIndex];
    const shapeB = FRUIT_SHAPES[cfg.shapeIndexB!];
    const emojisA = shapeA.emojis.slice(0, 2);
    const emojisB = shapeB.emojis.slice(0, 2);

    // Side-by-side: A on the left, B on the right, gap of 0.25 between them
    const OFFSET = 0.72;
    // Guaranteed: 2 stars in A, 1 star in B = 3 total, at least 1 in each fruit.
    const placedA = this._buildSingleSprites(shapeA, emojisA, cfg.seed,       -OFFSET, 2, 1, 0, 0);
    const placedB = this._buildSingleSprites(shapeB, emojisB, cfg.seedB ?? 0, +OFFSET, 1, 0, 1, 2);
    this._starsTotal = placedA + placedB;
  }

  // ── Queries ───────────────────────────────────────────────────────────────────

  /** Non-eaten, non-item sprites remaining */
  get totalRemaining(): number {
    return this.sprites.filter(s => !s.eaten && !s.itemType).length;
  }

  get totalCount(): number {
    return this.sprites.filter(s => !s.itemType).length;
  }

  get starsRevealed(): number { return this.starsFoundCount; }
  get starsTotal(): number    { return this._starsTotal; }
  private _starsTotal = STAR_COUNT;

  /** A random world position on the visible (front-facing) surface of the fruit */
  getRandomSurfaceWorldPos(): InstanceType<typeof THREE.Vector3> {
    const alive = this.sprites.filter(ss => !ss.eaten && !ss.itemType);
    if (alive.length === 0) return this.group.getWorldPosition(new THREE.Vector3());
    // Sort by world Z descending, take the front quartile
    const withZ = alive.map(ss => ({ ss, z: this._worldZ(ss) }));
    withZ.sort((a, b) => b.z - a.z);
    const front = withZ.slice(0, Math.max(1, Math.floor(withZ.length * 0.25)));
    const pick = front[Math.floor(Math.random() * front.length)];
    return pick.ss.sprite.getWorldPosition(new THREE.Vector3());
  }

  /** World position of the most recently revealed star (for doober origin) */
  getLastRevealedStarWorldPos(): InstanceType<typeof THREE.Vector3> | null {
    // Walk in reverse to find the last star that was just revealed
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const ss = this.sprites[i];
      if (ss.itemType === 'star' && ss.revealed) {
        return ss.sprite.getWorldPosition(new THREE.Vector3());
      }
    }
    return null;
  }

  /**
   * Get the world-space Z of a sprite (higher = closer to camera at Z=+inf).
   * We use the sprite's world position Z directly — camera is at positive Z
   * looking toward origin, so higher worldZ = closer to camera.
   */
  private _worldZ(ss: SplatSprite): number {
    return ss.sprite.getWorldPosition(new THREE.Vector3()).z;
  }

  // ── Power-up methods ──────────────────────────────────────────────────────────

  /**
   * Progressive banana peel: eat front-layer sprites whose world-Y >= worldYThreshold.
   * Fires blastCallback (peel scatter) for each. Returns newly revealed star count.
   * Called repeatedly as the banana overlay descends.
   */
  /**
   * Pre-calculate the true outer surface shell: for each X/Y grid cell,
   * pick the sprite with the highest world-Z (closest to camera).
   * Stores world positions alongside each sprite so per-frame calls are cheap.
   * Call once before starting the animation.
   */
  preparePeelLayer(
    camera: InstanceType<typeof THREE.Camera>,
    canvasRect: DOMRect,
  ): void {
    this._peelEntries = [];
    const alive = this.sprites.filter(ss => !ss.eaten && !ss.itemType);
    if (alive.length === 0) return;

    // Project world position to viewport screen-Y (CSS pixels, top-down).
    const toScreenY = (wp: InstanceType<typeof THREE.Vector3>): number => {
      const ndc = wp.clone().project(camera);
      // NDC y: +1 = top, -1 = bottom. Convert to CSS pixels from viewport top.
      return canvasRect.top + (-ndc.y * 0.5 + 0.5) * canvasRect.height;
    };

    // Bucket sprites by (localX, localY) rounded to grid cell
    const CELL = 0.18;
    const LAYERS = 2;
    const buckets = new Map<string, { ss: SplatSprite; worldZ: number; worldPos: InstanceType<typeof THREE.Vector3>; screenY: number }[]>();
    for (const ss of alive) {
      const lp = ss.sprite.position;
      const cx = Math.round(lp.x / CELL);
      const cy = Math.round(lp.y / CELL);
      const key = `${cx},${cy}`;
      const wp = ss.sprite.getWorldPosition(new THREE.Vector3());
      const list = buckets.get(key) ?? [];
      list.push({ ss, worldZ: wp.z, worldPos: wp, screenY: toScreenY(wp) });
      buckets.set(key, list);
    }

    // Flatten: for each cell keep the LAYERS frontmost sprites
    const entries: { ss: SplatSprite; worldZ: number; worldPos: InstanceType<typeof THREE.Vector3>; screenY: number }[] = [];
    for (const list of buckets.values()) {
      list.sort((a, b) => b.worldZ - a.worldZ);
      entries.push(...list.slice(0, LAYERS));
    }

    // Sort top-to-bottom by screen Y (ascending = top of screen first)
    this._peelEntries = entries.sort((a, b) => a.screenY - b.screenY);
  }

  /**
   * Called each frame during the banana animation.
   * Eats pre-calculated outer-layer sprites whose screen-Y <= bananaScreenY
   * (i.e. the banana overlay has reached or passed the sprite on screen).
   */
  /**
   * Called each frame during the banana animation.
   * When the banana's bottom edge (bananaScreenY) reaches a tracked sprite's
   * screen-Y, marks it eaten and hands the sprite to peelCallback so the
   * caller can animate it flying away. The sprite is NOT hidden here —
   * the callback takes ownership and removes it from the group.
   */
  eatBananaLayerAtScreenY(
    bananaScreenY: number,
    peelCallback: (sprite: InstanceType<typeof THREE.Sprite>, worldPos: InstanceType<typeof THREE.Vector3>) => void,
  ): number {
    if (!this._peelEntries) return 0;
    let ate = false;
    for (const entry of this._peelEntries) {
      if (entry.ss.eaten) continue;
      if (entry.screenY > bananaScreenY) continue; // banana not here yet
      entry.ss.eaten = true;
      // Live world position at the moment of removal (fruit may have rotated)
      const liveWorldPos = entry.ss.sprite.getWorldPosition(new THREE.Vector3());
      // Hand the sprite to the callback — do NOT set visible=false here;
      // spawnPeel will detach it from the group and animate it
      peelCallback(entry.ss.sprite, liveWorldPos);
      ate = true;
    }
    return ate ? this._checkItemReveal() : 0;
  }
  private _peelEntries: { ss: SplatSprite; worldZ: number; worldPos: InstanceType<typeof THREE.Vector3>; screenY: number }[] | null = null;

  /** Clear the cached peel layer after the animation completes */
  clearPeelCache(): void { this._peelEntries = null; }

  /**
   * Banana Peel: eat only the very outermost shell of ALL emoji types at once.
   * Shallow depth (0.20) so it just skims the surface, not a deep clear.
   * Returns stars newly revealed.
   */
  eatBananaLayer(): number {
    const all = this.sprites.filter(ss => !ss.eaten && !ss.itemType);
    if (all.length === 0) return 0;
    const worldZs = all.map(ss => this._worldZ(ss));
    const maxZ = Math.max(...worldZs);
    const PEEL_DEPTH = 0.20; // shallow — just the skin
    for (let i = 0; i < all.length; i++) {
      if (worldZs[i] >= maxZ - PEEL_DEPTH) {
        all[i].eaten = true;
        all[i].sprite.visible = false;
      }
    }
    return this._checkItemReveal();
  }

  /**
   * X-Ray: set all regular emoji sprites to half opacity.
   * Stars/items stay full opacity so they stand out.
   */
  setXRay(active: boolean): void {
    for (const ss of this.sprites) {
      if (ss.eaten || ss.itemType) continue;
      (ss.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).opacity =
        active ? 0.60 : 1.0;
    }
  }

  /**
   * Mega bomb: blast a large radius from the fruit centre.
   * Fires blastCallback for each hit sprite (particle FX).
   * Returns stars newly revealed.
   */
  triggerMegaBomb(worldImpact?: InstanceType<typeof THREE.Vector3>): number {
    const MEGA_RADIUS = 0.55;
    // Convert impact point to local space; fall back to fruit centre
    const worldEpi = worldImpact ?? this.group.getWorldPosition(new THREE.Vector3());
    const localImpact = worldImpact
      ? this.group.worldToLocal(worldImpact.clone())
      : new THREE.Vector3(0, 0, 0);
    for (const ss of this.sprites) {
      if (ss.eaten || ss.itemType) continue;
      if (ss.sprite.position.distanceTo(localImpact) < MEGA_RADIUS) {
        ss.eaten = true;
        ss.sprite.visible = false;
        if (this.blastCallback) {
          const wp = ss.sprite.getWorldPosition(new THREE.Vector3());
          const tex = (ss.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).map as InstanceType<typeof THREE.CanvasTexture>;
          this.blastCallback(wp, worldEpi, tex, ss.sprite.scale.x);
        }
      }
    }
    return this._checkItemReveal();
  }

  /**
   * Frenzy spin: apply random rotation delta each frame during frenzy.
   * Call from update loop while frenzy is active.
   */
  applyFrenzySpin(dt: number): void {
    this.group.rotation.y += (Math.random() - 0.5) * 14 * dt;
    this.group.rotation.x += (Math.random() - 0.5) * 10 * dt;
    this.group.rotation.z += (Math.random() - 0.5) * 6  * dt;
  }

  /** Count uneaten regular sprites for a given emoji index */
  getEmojiCount(emojiIndex: number): number {
    return this.sprites.filter(
      ss => !ss.eaten && !ss.itemType && ss.point.emojiIndex === emojiIndex,
    ).length;
  }

  /** Returns emoji indices that have at least one uneaten regular sprite */
  getVisibleEmojiIndices(): Set<number> {
    const visible = new Set<number>();
    for (const ss of this.sprites) {
      if (!ss.eaten && !ss.itemType) visible.add(ss.point.emojiIndex);
    }
    return visible;
  }

  /**
   * Eat the front-most layer of regular (non-item) sprites matching emojiIndex.
   * Uses world-space Z depth peeling: each press removes the closest shell.
   * Returns { eaten, newStars } counts.
   */
  /**
   * Eat the front-most layer of regular (non-item) sprites matching emojiIndex.
   * Marks sprites eaten and returns them (with live world positions) so the
   * caller can animate them flying into the monkey's mouth instead of popping.
   */
  eatEmoji(emojiIndex: number): {
    eaten: number;
    newStars: number;
    eatSprites: Array<{ sprite: InstanceType<typeof THREE.Sprite> }>;
  } {
    const candidates = this.sprites.filter(
      ss => !ss.eaten && !ss.itemType && ss.point.emojiIndex === emojiIndex,
    );
    if (candidates.length === 0) return { eaten: 0, newStars: 0, eatSprites: [] };

    const worldZs = candidates.map(ss => this._worldZ(ss));
    const maxZ = Math.max(...worldZs);
    const LAYER_DEPTH = 0.45;
    const eatSprites: Array<{ sprite: InstanceType<typeof THREE.Sprite> }> = [];
    for (let i = 0; i < candidates.length; i++) {
      if (worldZs[i] >= maxZ - LAYER_DEPTH) {
        candidates[i].eaten = true;
        // Don't hide — MunchParticles tweens the sprite to the mouth
        eatSprites.push({ sprite: candidates[i].sprite });
      }
    }

    const newStars = this._checkItemReveal();
    return { eaten: eatSprites.length, newStars, eatSprites };
  }

  /**
   * After eating, check each unrevealed item/star.
   * Revealed when ≤ REVEAL_MAX_BLOCKERS regular (non-item) neighbours
   * remain within REVEAL_RADIUS. Stars count toward win; bomb/extrabites
   * trigger their effect immediately via itemCallback.
   * Returns count of newly revealed stars.
   */
  private _checkItemReveal(): number {
    let newStars = 0;

    for (const ss of this.sprites) {
      if (!ss.itemType || ss.revealed) continue;

      // Count non-eaten regular neighbours within reveal radius
      let blockers = 0;
      for (const other of this.sprites) {
        if (other.eaten || other.itemType) continue;
        if (ss.sprite.position.distanceTo(other.sprite.position) < REVEAL_RADIUS) blockers++;
      }
      if (blockers > REVEAL_MAX_BLOCKERS) continue;

      // Uncovered — trigger the item
      ss.revealed = true;

      if (ss.itemType === 'star') {
        this.starsFoundCount++;
        newStars++;
        ss.sprite.visible = false; // hide from fruit once collected — doober flies to UI
      } else if (ss.itemType === 'bomb') {
        const BOMB_RADIUS = 0.55;
        // Epicentre in world space (for outward velocity direction)
        const epicentre = ss.sprite.getWorldPosition(new THREE.Vector3());
        let blasted = 0;
        for (const other of this.sprites) {
          if (other.eaten || other.itemType) continue;
          if (ss.sprite.position.distanceTo(other.sprite.position) < BOMB_RADIUS) {
            other.eaten = true;
            other.sprite.visible = false;
            // Fire blast callback so caller can spawn a particle at world pos
            if (this.blastCallback) {
              const worldPos = other.sprite.getWorldPosition(new THREE.Vector3());
              const tex = (other.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).map as InstanceType<typeof THREE.CanvasTexture>;
              const size = other.sprite.scale.x;
              this.blastCallback(worldPos, epicentre, tex, size);
            }
            blasted++;
          }
        }
        ss.sprite.visible = false;
        this.itemCallback?.('bomb', blasted);
        // Report bomb-revealed stars via a separate callback so they get
        // their own doober rather than being bundled with the current press.
        const bombStars = this._checkItemReveal();
        if (bombStars > 0) this.bombStarCallback?.(bombStars);
      } else if (ss.itemType === 'extrabites') {
        ss.sprite.visible = false;
        this.itemCallback?.('extrabites');
      }
    }

    return newStars;
  }

  update(dt: number): void {
    this.danceTime += dt;

    if (!this.isDragging) {
      // Damped inertia — apply via quaternion so axes stay screen-consistent
      this.angularVelX *= Math.exp(-3 * dt);
      this.angularVelY *= Math.exp(-3 * dt);
      if (Math.abs(this.angularVelY) > 0.001) {
        this._qTmp.setFromAxisAngle(SplatObject._WORLD_UP,    this.angularVelY * dt);
        this._orientation.premultiply(this._qTmp);
      }
      if (Math.abs(this.angularVelX) > 0.001) {
        this._qTmp.setFromAxisAngle(SplatObject._WORLD_RIGHT, this.angularVelX * dt);
        this._orientation.premultiply(this._qTmp);
      }
      this.group.quaternion.copy(this._orientation);
    }

    // Beat-reactive dance on danceGroup (independent of player drag)
    const e = this.danceEnergy;
    // Pulse scale: base 1, swells up to +18% on beat
    const pulse = 1 + e * 0.18;
    this.danceGroup.scale.setScalar(pulse);
    // Gentle wobble rotation that intensifies with energy
    this.danceGroup.rotation.y = Math.sin(this.danceTime * 2.1) * 0.08 * (1 + e * 2.5);
    this.danceGroup.rotation.z = Math.sin(this.danceTime * 1.7) * 0.05 * (1 + e * 2.0);

    // Pulse uncollected stars and unrevealed items
    const spritePulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.006);
    for (const ss of this.sprites) {
      if (ss.itemType === 'star' && !ss.revealed) {
        ss.sprite.scale.setScalar(0.30 * spritePulse);
      } else if (ss.itemType && !ss.revealed && !ss.eaten) {
        // Gentle pulse on bomb/extrabites too so they stand out
        ss.sprite.scale.setScalar(0.28 * (0.9 + 0.1 * Math.sin(Date.now() * 0.005)));
      }
    }
  }

  dispose(): void {
    this._unbindInput();
    for (const ss of this.sprites) {
      (ss.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).dispose();
    }
    this.itemCallback = null;
    this.blastCallback = null;
    this.bombStarCallback = null;
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
    this.sprites = [];
  }

  // ── Input binding ─────────────────────────────────────────────────────────────

  private _onPointerDown = (e: PointerEvent): void => {
    const rect = this.canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.angularVelX = 0;
    this.angularVelY = 0;
    // Capture current orientation (may have drifted via inertia or frenzy)
    this._orientation.copy(this.group.quaternion);
    this.canvasEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private _onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    const sensitivity = 0.007;
    // Rotate around world-space Y (horizontal drag) and world-space X (vertical drag).
    // Pre-multiplying keeps axes fixed to the screen regardless of current orientation.
    this._qTmp.setFromAxisAngle(SplatObject._WORLD_UP,    dx * sensitivity);
    this._orientation.premultiply(this._qTmp);
    this._qTmp.setFromAxisAngle(SplatObject._WORLD_RIGHT, dy * sensitivity);
    this._orientation.premultiply(this._qTmp);
    this.group.quaternion.copy(this._orientation);
    this.angularVelY = dx * sensitivity * 60;
    this.angularVelX = dy * sensitivity * 60;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.dragCallback?.(this.group.rotation.x, this.group.rotation.y, true);
    e.preventDefault();
  };

  private _onPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragCallback?.(this.group.rotation.x, this.group.rotation.y, false);
    e.preventDefault();
  };

  private _bindInput(): void {
    this.canvasEl.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    this.canvasEl.addEventListener('pointermove', this._onPointerMove, { passive: false });
    this.canvasEl.addEventListener('pointerup',   this._onPointerUp,   { passive: false });
    this.canvasEl.addEventListener('pointercancel', this._onPointerUp, { passive: false });
  }

  private _unbindInput(): void {
    this.canvasEl.removeEventListener('pointerdown', this._onPointerDown);
    this.canvasEl.removeEventListener('pointermove', this._onPointerMove);
    this.canvasEl.removeEventListener('pointerup',   this._onPointerUp);
    this.canvasEl.removeEventListener('pointercancel', this._onPointerUp);
  }
}
