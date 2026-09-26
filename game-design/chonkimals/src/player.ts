/**
 * Characters — loads a character GLB once (frog_wim.glb at NATURAL size, ~2
 * units tall), zeroes root motion, and stamps out independent animated
 * instances for the player and bots, each driving an animation state machine.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneSkinned } from './skeleton-clone';

export type AnimState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'jumping_up'
  | 'falling_idle'
  | 'hard_landing';

export interface PlayerResult {
  /** Root Group — add to scene and translate each frame. */
  root: import('three').Group;
  /** Height of the frog model in world units. */
  height: number;
  /** Call once per frame. */
  update(dt: number, state: AnimState): void;
  /**
   * Top of the posed model above the root, in unscaled model units (measured once,
   * precisely, from the current pose — `height` is the bind pose and can be off).
   * Multiply by root.scale.y. Costs a full vertex pass the first time; for NPCs.
   */
  top(): number;
}

const FADE = 0.2;

/** Per-character pose tweaks run right after the animation mixer each frame (e.g. raising an
 * arm to use a toy — customization/toy-use.ts). One per character root; null removes it. */
const poseOverlays = new WeakMap<import('three').Object3D, (dt: number) => void>();
export function setPoseOverlay(root: import('three').Object3D, fn: ((dt: number) => void) | null): void {
  if (fn) poseOverlays.set(root, fn);
  else poseOverlays.delete(root);
}

const FROG_URL = 'assets/frog_wim.glb';

type GLTF = Awaited<ReturnType<GLTFLoader['loadAsync']>>;
type BufferGeometry = import('three').BufferGeometry;
const gltfCache = new Map<string, Promise<GLTF>>();

// ── Distance LODs ─────────────────────────────────────────────────────────────
// Each character GLB may ship `<name>_lod1.glb` / `_lod2.glb` (tools/build_character_lods.mjs):
// simplified geometry with the same skin. At runtime those meshes are bound to the full
// model's skeleton (one mixer drives all three) and the right one is shown by distance.
/** Camera distance (world) where a character drops to LOD1 / LOD2. */
export const LOD_DISTANCES: readonly [number, number] = [22, 50];
const LOD_HYSTERESIS = 2;
const lodGeoms = new WeakMap<GLTF, BufferGeometry[]>();

interface LodEntry { root: import('three').Object3D; meshes: import('three').Object3D[]; level: number; seenParent: boolean; }
const lodEntries = new Set<LodEntry>();
const lodTmp = new THREE.Vector3();

function firstSkinnedGeometry(root: import('three').Object3D): BufferGeometry | null {
  let g: BufferGeometry | null = null;
  root.traverse((o) => { if (!g && (o as import('three').SkinnedMesh).isSkinnedMesh) g = (o as import('three').SkinnedMesh).geometry; });
  return g;
}

/** Once a frame: show each character's LOD for its distance from the camera. */
export function updateCharacterLods(camera: import('three').Camera): void {
  for (const e of lodEntries) {
    if (!e.root.parent) { if (e.seenParent) lodEntries.delete(e); continue; } // removed from the scene
    e.seenParent = true;
    const d = camera.position.distanceTo(e.root.getWorldPosition(lodTmp));
    const [d1, d2] = LOD_DISTANCES;
    const h = LOD_HYSTERESIS;
    let lvl = e.level;
    if (lvl === 0 && d > d1 + h) lvl = d > d2 + h ? 2 : 1;
    else if (lvl === 1) lvl = d < d1 - h ? 0 : d > d2 + h ? 2 : 1;
    else if (lvl === 2 && d < d2 - h) lvl = d < d1 - h ? 0 : 1;
    if (lvl === e.level) continue;
    e.level = lvl;
    e.meshes.forEach((m, i) => { m.visible = i === lvl; });
  }
}

/**
 * Loads a character GLB once per URL and zeroes root motion on its clips
 * (clips are shared by every instance, so this must only happen once).
 */
export function loadCharacterGltf(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    const lods = ['_lod1', '_lod2'].map((sfx) => loader.loadAsync(url.replace(/\.glb$/, `${sfx}.glb`))
      .then((g) => firstSkinnedGeometry(g.scene)).catch(() => null)); // optional: no LOD file = full detail only
    p = loader.loadAsync(url).then(async (gltf) => {
      const geos = await Promise.all(lods);
      if (geos.every((g) => g)) lodGeoms.set(gltf, geos as BufferGeometry[]);
      for (const clip of gltf.animations) {
        for (const track of clip.tracks) {
          if (!track.name.endsWith('.position')) continue;
          if (track instanceof THREE.VectorKeyframeTrack) {
            const v = track.values as Float32Array;
            const x0 = v[0], y0 = v[1], z0 = v[2];
            for (let i = 0; i < v.length; i += 3) {
              v[i] = x0; v[i + 1] = y0; v[i + 2] = z0;
            }
          }
        }
      }
      return gltf;
    });
    p.catch((error) => console.error(`[assets] failed to load ${url}`, error));
    gltfCache.set(url, p);
  }
  return p;
}

/**
 * Loads a species' character: the base GLB, re-skinned when `skinUrl` is set.
 * A skin is just a replacement base-colour texture painted on the base
 * model's UV layout, so every skin shares the base's geometry, clips and LODs
 * (one download) and only gets its own material. Cached per model+skin.
 */
export function loadSpeciesGltf(def: { modelUrl: string; skinUrl?: string }): Promise<GLTF> {
  if (!def.skinUrl) return loadCharacterGltf(def.modelUrl);
  const key = `${def.modelUrl}|${def.skinUrl}`;
  let p = gltfCache.get(key);
  if (!p) {
    const skinUrl = def.skinUrl;
    p = Promise.all([loadCharacterGltf(def.modelUrl), new THREE.TextureLoader().loadAsync(skinUrl)]).then(([base, map]) => {
      map.flipY = false; // glTF UV convention
      map.colorSpace = THREE.SRGBColorSpace;
      const scene = cloneSkinned(base.scene) as import('three').Group;
      scene.traverse((n) => {
        if (!(n instanceof THREE.Mesh)) return;
        const mat = (n.material as import('three').MeshStandardMaterial).clone();
        if (mat.map) { map.wrapS = mat.map.wrapS; map.wrapT = mat.map.wrapT; }
        mat.map = map;
        n.material = mat;
      });
      const skinned: GLTF = { ...base, scene };
      measured.set(skinned, measure(base)); // a fresh clone has no bone matrices, so reuse the base's bounds
      const lods = lodGeoms.get(base);
      if (lods) lodGeoms.set(skinned, lods);
      return skinned;
    });
    p.catch((error) => console.error(`[assets] failed to load skin ${skinUrl}`, error));
    gltfCache.set(key, p);
  }
  return p;
}

export async function loadPlayer(): Promise<PlayerResult> {
  const player = createCharacter(await loadCharacterGltf(FROG_URL));
  console.log(`[player] height: ${player.height.toFixed(3)} units`);
  return player;
}

const measured = new WeakMap<GLTF, { offset: import('three').Vector3; height: number }>();

/**
 * Bounds of the ORIGINAL scene, measured once. A fresh cloneSkinned copy
 * has no bone matrices yet, so measuring the clone collapses to ~0 height.
 */
function measure(gltf: GLTF): { offset: import('three').Vector3; height: number } {
  let m = measured.get(gltf);
  if (!m) {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const centre = box.getCenter(new THREE.Vector3());
    m = { offset: new THREE.Vector3(-centre.x, -box.min.y, -centre.z), height: box.max.y - box.min.y };
    measured.set(gltf, m);
  }
  return m;
}

/**
 * Builds an independent animated instance (own skeleton + mixer) from a
 * loaded character GLB. Feet at local y=0, centred on XZ.
 */
export function createCharacter(gltf: GLTF, opts: { lod?: boolean } = {}): PlayerResult {
  const { offset, height } = measure(gltf);
  const model = cloneSkinned(gltf.scene) as import('three').Group;
  // Centre horizontally, stand feet at y=0 of the root Group
  model.position.add(offset);

  const root = new THREE.Group();
  root.add(model);

  // Pose the cloned skeleton so skinned bounds (used for frustum culling) are
  // computed from the real pose rather than zeroed bone matrices; pad the
  // sphere so animation never pushes limbs outside it.
  root.updateMatrixWorld(true);
  model.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
    if (n instanceof THREE.SkinnedMesh) {
      n.skeleton.update();
      n.computeBoundingBox();
      n.computeBoundingSphere();
      n.boundingSphere!.radius *= 1.5;
    }
  });

  // Distance LODs: simplified meshes on the SAME skeleton (so the one mixer animates all).
  const lods = opts.lod === false ? undefined : lodGeoms.get(gltf);
  const skinned: import('three').SkinnedMesh[] = [];
  model.traverse((n) => { if (n instanceof THREE.SkinnedMesh) skinned.push(n); });
  if (lods && skinned.length === 1) {
    const full = skinned[0];
    const levels: import('three').Object3D[] = [full];
    for (const geo of lods) {
      const lm = new THREE.SkinnedMesh(geo, full.material);
      lm.name = `${full.name}_lod${levels.length}`;
      lm.position.copy(full.position);
      lm.quaternion.copy(full.quaternion);
      lm.scale.copy(full.scale);
      lm.castShadow = full.castShadow;
      lm.receiveShadow = full.receiveShadow;
      full.parent!.add(lm);
      lm.bind(full.skeleton, full.bindMatrix);
      lm.boundingSphere = full.boundingSphere!.clone(); // same body, same padded bounds
      lm.visible = false;
      levels.push(lm);
    }
    lodEntries.add({ root, meshes: levels, level: 0, seenParent: false });
  }

  // ── AnimationMixer ────────────────────────────────────────────────────
  const mixer = new THREE.AnimationMixer(model);

  const actionMap = new Map<string, import('three').AnimationAction>();
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    actionMap.set(clip.name, action);
  }

  let currentState: AnimState | null = null;
  let currentAction: import('three').AnimationAction | null = null;

  function playClip(name: string): void {
    const next = actionMap.get(name);
    if (!next) { console.warn('[player] missing clip:', name); return; }
    if (currentAction === next) return;
    if (currentAction) currentAction.fadeOut(FADE);
    next.reset().fadeIn(FADE).play();
    currentAction = next;
  }

  playClip('idle');
  currentState = 'idle';

  function update(dt: number, state: AnimState): void {
    if (state !== currentState) {
      currentState = state;
      switch (state) {
        case 'idle':         playClip('idle');         break;
        case 'walking':      playClip('walking');      break;
        case 'running':      playClip('running');      break;
        case 'jumping_up':   playClip('jumping_up');   break;
        case 'falling_idle': playClip('falling_idle'); break;
        case 'hard_landing': {
          const a = actionMap.get('hard_landing');
          if (a) {
            if (currentAction) currentAction.fadeOut(FADE);
            a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(FADE).play();
            a.clampWhenFinished = true;
            currentAction = a;
            const dur = a.getClip().duration;
            setTimeout(() => {
              if (currentState === 'hard_landing') {
                currentState = 'idle';
                playClip('idle');
              }
            }, Math.max(0, (dur - FADE) * 1000));
          }
          break;
        }
      }
    }
    mixer.update(dt);
    poseOverlays.get(root)?.(dt);
  }

  let topCache: number | null = null;
  function top(): number {
    if (topCache !== null) return topCache;
    // Wait for the idle clip to finish fading in, or we'd measure the bind pose.
    if (!currentAction || currentAction.getEffectiveWeight() < 0.999 || !currentAction.time) return height;
    root.updateMatrixWorld(true);
    for (const m of skinned) m.skeleton.update();
    const box = new THREE.Box3().setFromObject(skinned[0] ?? model, true);
    return (topCache = (box.max.y - root.position.y) / root.scale.y);
  }

  return { root, height, update, top };
}
