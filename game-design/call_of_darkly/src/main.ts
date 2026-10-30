import * as THREE from 'three';
import { GameLoop, events, input, time, type System } from './core';
import { CombatSystem, TrainingDummy } from './combat';
import { createInventorySystem, createConsumableSystem } from './inventory';
import { newSave, saves, type SaveData } from './core/save';
import { DropSystem, MagRestorer, Wallet, WorldProgress, collectMags } from './economy';
import { createUi, playerLevel, type UiSystem } from './ui';
import { STATS } from './data/stats';
import { stats as modStats } from './inventory/modifiers';
import { evalCurve } from './player/curve';
import { ChestSystem } from './world/chests';
import { DoorSystem, type DoorOp } from './world/doors';
import { InteractSystem } from './world/interact';
import { PickupSystem } from './world/pickups';
import type { LevelOp } from './world/types';
import { createColliderDebugMesh } from './physics/debugDraw';
import { createCollisionWorld } from './physics/grid';
import { PlayerController } from './player/controller';
import { type RollTier } from './player/rollTier';
import { applyFogPreset, attachPs1DebugKeys, createPs1Pipeline } from './render';
import { createTestRoom } from './render/testRoom';
import { Viewmodel } from './player/viewmodel';
import { GYM_NAV, RANGE_DUMMIES } from './world/areas/gym';
import { AREAS, WORLD_AREAS } from './world/areas';
import { FIRELINK_NPCS, FIRELINK_TELEPORTS, firelinkProps } from './world/areas/firelink';
import { BURG_BONFIRE_ID, BURG_LADDERS, BURG_NAV, BURG_NPCS, BURG_TELEPORTS, BURG_TRIGGERS, burgProps } from './world/areas/burg';
import { LadderSystem } from './world/ladder';
import { createTriggerSystem } from './world/triggers';
import { areaAtPosition, createAreaTransitions } from './world/transitions';
import { createDeathLoop } from './economy';
import { createFxSystem } from './fx';
import { createAudioSystem } from './audio';
import { BonfireSystem, applyPistolFloor, type BonfireOp } from './world/bonfire';
import { NpcSystem } from './world/npcs';
import { PropsBuilder } from './world/props';
import { buildArea, type BuildOptions } from './world/builder';
import { AiSystem } from './ai/system';
import { BLACK_KNIGHT_FLAG, configureBlackKnight, MimicSystem } from './ai'; // also registers the black_knight + mimic archetypes
import { installTaurus } from './ai/boss';
import { createAiDebugOverlay, type AiDebugOverlay } from './ai/debug';
import type { SpawnOpLike } from './ai/spawner';

const TINT_BURG_SKY = new THREE.Color();
const TINT_BURG_GROUND = new THREE.Color();
const TINT_BURG_SUN = new THREE.Color();

// ---- renderer / scene ----
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
app.appendChild(renderer.domElement);

const pipeline = createPs1Pipeline();
pipeline.init(renderer);
if (import.meta.env.DEV) attachPs1DebugKeys(pipeline); // F6: cycle PS1 effects, F7: cycle fog presets

const scene = new THREE.Scene(); // background/fog owned by the pipeline (clear = fog color)
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);

function resize(): void {
  const w = app.clientWidth;
  const h = app.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  pipeline.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---- input ----
input.attach(window);
renderer.domElement.addEventListener('click', () => input.requestPointerLock(renderer.domElement));

// ---- fps readout ----
const fpsEl = document.getElementById('fps');
let debugVisible = false; // F9 (dev only): collider overlay + fps + debug text
if (fpsEl) fpsEl.style.display = 'none';
let fpsFrames = 0;
let fpsTime = 0;
const fpsReadout: System = {
  name: 'fps',
  update() {},
  render(_alpha, frameDt) {
    if (fpsEl) fpsEl.style.display = debugVisible || room === 'test' ? '' : 'none';
    fpsFrames++;
    fpsTime += frameDt;
    if (fpsTime >= 0.5) {
      if (fpsEl) fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} fps | ${perfLine()}`;
      fpsFrames = 0;
      fpsTime = 0;
    }
  },
};

// ---- dev perf metrics (F9 overlay + __game.perf): main-pass draw calls/tris, frame/sim/render ms ----
const perf = { calls: 0, tris: 0, frameMs: 0, simMs: 0, renderMs: 0 };
let perfSimT0 = 0;
let perfSimAcc = 0;
/** Register first: stamps tick start; render() publishes last frame's accumulated sim ms. */
const perfBegin: System = {
  name: 'perfBegin',
  update() {
    perfSimT0 = performance.now();
  },
  render(_a, frameDt) {
    perf.simMs = perfSimAcc;
    perfSimAcc = 0;
    perf.frameMs += (frameDt * 1000 - perf.frameMs) * 0.1;
  },
};
/** Register right before the render pass. */
const perfEnd: System = {
  name: 'perfEnd',
  update() {
    perfSimAcc += performance.now() - perfSimT0;
  },
};
const perfLine = (): string =>
  `${perf.calls} calls ${(perf.tris / 1000).toFixed(1)}k tris | frame ${perf.frameMs.toFixed(1)}ms sim ${perf.simMs.toFixed(2)} render ${perf.renderMs.toFixed(2)}`;

// Final render pass system: must be registered last.
const renderPass: System = {
  name: 'render',
  update() {},
  render() {
    const t0 = performance.now();
    pipeline.render(scene, camera);
    perf.renderMs += (performance.now() - t0 - perf.renderMs) * 0.1;
    const st = pipeline.stats;
    if (st) {
      perf.calls = st.calls;
      perf.tris = st.triangles;
    }
  },
};

const loop = new GameLoop();
const room = new URLSearchParams(location.search).get('room');
let player: PlayerController | null = null;

if (room === 'test') {
  // M0 test room (orbit camera): ?room=test
  applyFogPreset(pipeline, 'firelink');
  const testRoom = createTestRoom(camera);
  scene.add(testRoom.group);
  loop.add(perfBegin).add(input).add(testRoom.system).add(fpsReadout).add(renderPass);
} else {
  // Area select: default Firelink Shrine; ?area=gym keeps the movement/combat gym.
  const areaId = new URLSearchParams(location.search).get('area') ?? 'firelink';
  const area = AREAS[areaId] ?? AREAS['firelink']!;
  const isGym = area.id === 'gym';
  // Standalone areas (gym, dev-only ?area=taurus) are built alone; firelink/burg share one continuous world.
  const solo = !WORLD_AREAS.includes(area);
  const nav = solo ? GYM_NAV : BURG_NAV;
  const props = new PropsBuilder();
  if (!solo) {
    firelinkProps(props);
    burgProps(props);
  }
  pipeline.setFog(area.fog.color, area.fog.near, area.fog.far);
  const world = createCollisionWorld(4);
  const spawnOps: SpawnOpLike[] = [];
  const itemOps: Extract<LevelOp, { op: 'item' }>[] = [];
  const cacheOps: Extract<LevelOp, { op: 'cache' }>[] = [];
  const chestOps: Extract<LevelOp, { op: 'chest' }>[] = [];
  const mimicOps: Extract<LevelOp, { op: 'mimic' }>[] = [];
  const doorOps: DoorOp[] = [];
  const bonfireOps: BonfireOp[] = [];
  const buildOpts: BuildOptions = {
    onSpawn: (op) => spawnOps.push(op),
    onItem: (op) => itemOps.push(op),
    onCache: (op) => cacheOps.push(op),
    onChest: (op) => chestOps.push(op),
    onMimic: (op) => mimicOps.push(op),
    onDoor: (op) => doorOps.push(op),
    onBonfire: (op) => bonfireOps.push(op),
    onBarrier: (op) => props.barrier(op),
  };
  // M7: Firelink + Burg (+ the Taurus bridge) are ONE continuous scene (no load screens); the gym stays alone.
  const levels = (solo ? [area] : WORLD_AREAS).map((a) => buildArea(a, world, buildOpts));
  const level = levels[0]!;
  for (const lv of levels) scene.add(lv.group);
  // Firelink's gate to the Burg is a plain walk-through now: drop its barrier collider (the fog sheet stays as the seam).
  if (!solo) for (const c of level.colliders) if (c.tag === 'exit_burg') world.remove(c.id);
  const builtProps = props.build(world);
  scene.add(builtProps.group);
  // Warm dusk at Firelink, cool grey in the gym.
  const hemi = solo ? new THREE.HemisphereLight(0xb8c0d8, 0x40362c, 1.1) : new THREE.HemisphereLight(0xe8c8a0, 0x3a2c22, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(solo ? 0xfff0d8 : 0xffc890, 1.2);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);

  const [sx, sy, sz] = area.spawn.pos;
  player = new PlayerController({ world, camera, now: () => time.now, spawn: { pos: { x: sx, y: sy, z: sz }, yaw: area.spawn.yaw } });
  const pl = player;

  // F9 collider overlay.
  const overlay = createColliderDebugMesh(world.all());
  overlay.visible = false;
  scene.add(overlay);

  // F10 cycles the debug equip load (roll tiers) until M4 inventory provides real weight.
  const loads: Array<[RollTier, number]> = [
    ['fast', 0.15],
    ['normal', 0.4],
    ['slow', 0.75],
    ['fat', 1.2],
  ];
  let loadIdx = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F10') return;
    e.preventDefault();
    loadIdx = (loadIdx + 1) % loads.length;
    const lp = pl.equipLoadProvider;
    if ('weightValue' in lp) (lp as { weightValue: number }).weightValue = loads[loadIdx]![1] * lp.maxLoad();
  });

  let aiDebug: AiDebugOverlay | null = null;
  const debugSys: System = {
    name: 'debug',
    update() {
      if (input.pressed('debugOverlay') && import.meta.env.DEV) {
        overlay.visible = !overlay.visible;
        debugVisible = overlay.visible;
        if (aiDebug) aiDebug.visible = overlay.visible;
      }
    },
  };

  // Dev-only debug text (F9). The real HUD is createUi (below).
  const ui = document.getElementById('ui')!;
  const hud = document.createElement('pre');
  hud.style.cssText = 'position:absolute;left:8px;top:6px;margin:0;font:12px/1.35 monospace;color:#ddd;text-shadow:1px 1px 0 #000;display:none';
  if (import.meta.env.DEV) ui.appendChild(hud);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);font:14px monospace;color:#fff;text-shadow:1px 1px 0 #000;text-align:center';
  hint.textContent = 'click to play';
  ui.appendChild(hint);
  let hudT = 0;
  const hudSys: System = {
    name: 'hud',
    update() {},
    render(_a, frameDt) {
      hint.style.display = input.pointerLocked || uiCapturing ? 'none' : 'block';
      if (!import.meta.env.DEV) return;
      hud.style.display = debugVisible ? 'block' : 'none';
      if (!debugVisible) return;
      hudT += frameDt;
      if (hudT < 0.1) return;
      hudT = 0;
      const s = pl.state;
      const v = pl.velocity;
      hud.textContent =
        `state ${s.move}${s.sprinting ? ' +sprint' : ''}${pl.grounded ? '' : ' (air)'}${pl.invulnerable ? ' I-FRAMES' : ''}\n` +
        `roll ${pl.rollTier} (load ${(pl.equipLoad * 100).toFixed(0)}%)\n` +
        `vel ${Math.hypot(v.x, v.z).toFixed(2)} m/s  vy ${v.y.toFixed(2)}\n` +
        `pos ${pl.position.x.toFixed(1)} ${pl.position.y.toFixed(2)} ${pl.position.z.toFixed(1)}`;
    },
  };
  // True while a UI menu holds the mouse (createUi emits `uiCapture`): the world ignores E / fire etc.
  let uiCapturing = false;
  events.on('uiCapture', (e) => (uiCapturing = e.capturing));

  // M2 combat: guns + left hand, viewmodel (child of the camera, in-scene so the PS1 pipeline dithers it).
  scene.add(camera);
  const viewmodel = new Viewmodel();
  camera.add(viewmodel.group);
  const combat = new CombatSystem({ player: pl, world, camera, viewmodel, scene });
  for (const d of isGym ? RANGE_DUMMIES : []) {
    const dummy = new TrainingDummy({ x: d.x, z: d.z, yaw: d.yaw, label: d.label, shield: d.shield });
    scene.add(dummy.group);
    combat.addDummy(dummy);
  }

  // M4 inventory: equipment → combat loadout + equip load; armor absorb on player damage.
  const saveData: SaveData = saves.load() ?? newSave();
  // §8 leveling: restore stat levels, derive max HP/stamina, and feed Firearms/Strength into the damage multipliers.
  const clampLevel = (n: unknown, def: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(99, Math.max(def, Math.floor(n))) : def);
  pl.levels = {
    vitality: clampLevel(saveData.stats.vitality, STATS.start.vitality),
    endurance: clampLevel(saveData.stats.endurance, STATS.start.endurance),
    firearms: clampLevel(saveData.stats.firearms, STATS.start.firearms),
    strength: clampLevel(saveData.stats.strength, STATS.start.strength),
  };
  /** Gun/melee damage multipliers relative to the starting block (start = x1.0 so tuned weapon numbers stay put). */
  const applyLevelMods = (): void => {
    const gun = evalCurve(STATS.gunDamage, pl.levels.firearms) / evalCurve(STATS.gunDamage, STATS.start.firearms);
    const melee = evalCurve(STATS.meleeDamage, pl.levels.strength) / evalCurve(STATS.meleeDamage, STATS.start.strength);
    modStats.register('level:stats', [
      { key: 'gunDamage', op: 'mul', value: gun },
      { key: 'meleeDamage', op: 'mul', value: melee },
    ]);
  };
  applyLevelMods();
  pl.recomputeStats(true);
  const inv = createInventorySystem({ combat, player: pl, save: saveData });
  pl.damageFilter = (e) => inv.absorb(e);
  const consumables = createConsumableSystem({ combat, player: pl, inv, world, scene, camera });
  for (const [k, v] of Object.entries(saveData.ammo)) if (typeof v === 'number') combat.ammo.set(k as keyof SaveData['ammo'], v);
  pl.setEstusCharges(saveData.estusCharges);
  // §9 pistol floor also applies on respawn (death loop calls player.respawn); the initial load tops up too.
  const baseRespawn = pl.respawn.bind(pl);
  pl.respawn = (pos, yaw) => {
    baseRespawn(pos, yaw);
    applyPistolFloor(combat.ammo);
  };
  applyPistolFloor(combat.ammo);

  // M4 economy + world items: souls, drops, pickups, chests, doors, toasts, looted-id save.
  const wallet = new Wallet();
  wallet.load(saveData);
  pl.soulsProvider = () => wallet.souls; // reported in `playerDied` (bloodstain)
  // Saved magazine rounds go back into combat's per-gun state the first time each gun is held.
  const magRestore = new MagRestorer(saveData.mags);
  magRestore.apply(combat.guns);
  events.on('equipmentChanged', () => magRestore.apply(combat.guns));
  const progress = new WorldProgress();
  progress.load(saveData);
  // The Black Knight's kill persists as a world flag; must be configured before the level spawns it.
  configureBlackKnight({ isKilled: () => progress.hasFlag(BLACK_KNIGHT_FLAG), markKilled: () => progress.setFlag(BLACK_KNIGHT_FLAG) });
  events.on('soulsGranted', (e) => wallet.add(e.amount));
  let dirty = false;
  let deathSave: ((s: SaveData) => void) | null = null; // set once the death loop exists
  const persist = (): void => {
    inv.writeSave(saveData);
    wallet.writeSave(saveData);
    progress.writeSave(saveData);
    drops.writeSave(saveData);
    deathSave?.(saveData);
    collectMags(combat.guns, saveData.mags);
    saveData.ammo = { ...(Object.fromEntries((['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'launcher'] as const).map((t) => [t, combat.ammo.get(t)])) as SaveData['ammo']) };
    saveData.estusCharges = pl.state.estusCharges;
    saveData.stats = { ...pl.levels };
    saveData.level = playerLevel(pl.levels);
    // killedBosses mirrors the `boss:<id>` flags (written on real kills only: Black Knight, Taurus Demon).
    saveData.killedBosses = saveData.flags.filter((f) => f.startsWith('boss:')).map((f) => f.slice(5));
    saves.save(saveData);
    dirty = false;
  };
  progress.onChange = () => (dirty = true);
  for (const ev of ['itemAdded', 'itemRemoved', 'equipmentChanged', 'soulsChanged', 'ammoChanged', 'quickBeltChanged', 'estusChanged'] as const) events.on(ev, () => (dirty = true));
  const persistSys: System = { name: 'persist', update() { if (dirty) persist(); } };
  // Mags change silently while firing: always flush when the tab is hidden / closed.
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });

  // Dead / in the death cam: no bonfire rest, shop or NPC talk (death is declared below; only read at call time).
  const isDeadNow = (): boolean => death.phase !== 'alive' || pl.state.move === 'dead';
  const interact = new InteractSystem({ player: pl, world, isBlocked: () => uiCapturing || isDeadNow() });
  const pickups = new PickupSystem({ parent: scene, camera, player: pl, combat, inv, progress, interact });
  const chests = new ChestSystem({ parent: scene, world, interact, pickups, progress });
  const doors = new DoorSystem({ parent: scene, world, interact, progress, inventory: inv.store, player: pl });
  const drops = new DropSystem({
    wallet,
    progress,
    ownedItems: () => inv.store.list().map((s) => s.id),
    spawn: (d) => pickups.spawn(d),
    firstKillPending: (flag) => pickups.hasFirstKill(flag),
  });
  drops.load(saveData);
  drops.onChange = () => (dirty = true);
  for (const op of itemOps) pickups.spawnItemOp(op);
  for (const op of cacheOps) pickups.spawnCacheOp(op);
  for (const op of chestOps) chests.addChest(op);
  for (const op of mimicOps) chests.addMimic(op);
  for (const op of doorOps) doors.addDoor(op);

  // M3 enemies: level spawn ops → AiSystem (FSM, nav graph, hit reactions, death).
  const ai = new AiSystem({ world, combat, player: pl, scene, nav });
  for (const op of spawnOps) ai.spawnOp(op);
  if (import.meta.env.DEV) aiDebug = createAiDebugOverlay(ai, scene, camera, ui);
  // M5 bonfires, NPCs, area exits. Respawn point = last rested bonfire (falls back to the area spawn).
  const bonfires = new BonfireSystem({ parent: scene, interact, player: pl, ammo: combat.ammo, save: saveData, persist, alive: () => !isDeadNow() });
  for (const op of bonfireOps) bonfires.addBonfire(op);
  const npcs = new NpcSystem(scene, interact);
  if (!solo) for (const n of [...FIRELINK_NPCS, ...BURG_NPCS]) npcs.add(n);
  // ?area=burg starts at the Burg bonfire until a bonfire has been rested.
  const startBonfire = area.id === 'burg' && !saveData.bonfireId ? BURG_BONFIRE_ID : saveData.bonfireId;
  const respawnTo = bonfires.respawnPoint(startBonfire) ?? bonfires.respawnPoint(bonfireOps[0]?.id ?? null);
  if (respawnTo) pl.respawn(respawnTo.pos, respawnTo.yaw);
  // respawn() refills estus: re-apply the saved charges after the initial placement.
  pl.setEstusCharges(saveData.estusCharges);

  // M8 Taurus Demon: boss, its fog wall + far barrier (arena geometry is part of the Burg level).
  const dodgeHints = (): number => [1, 2, 3].filter((n) => progress.hasFlag(`hint:dodge:${n}`)).length;
  const taurus = installTaurus({
    ai, combat, player: pl, scene, world, events, interact,
    isDefeated: () => progress.hasFlag('boss:taurus_demon'),
    setDefeated: () => {
      progress.setFlag('boss:taurus_demon');
      persist();
    },
    getDodgeHintCount: dodgeHints,
    incDodgeHintCount: () => progress.setFlag(`hint:dodge:${dodgeHints() + 1}`),
  });

  // M5 death loop: bloodstain, respawn at last rested bonfire, enemy respawn, pistol floor.
  // M7: areas share one scene; the area id (bloodstain, respawn) follows the player. A saved stain is restored
  // in whichever area it was dropped in (areaOverride only lives while the death loop loads).
  const areaTransitions = solo
    ? null
    : createAreaTransitions({
        player: pl,
        initial: (['firelink', 'burg', 'taurus'] as const).find((a) => a === saveData.area),
        onAreaChange: (to) => {
          saveData.area = to;
          dirty = true;
        },
        setFog: (c, n, f) => pipeline.setFog(c, n, f),
        onBlend: (b) => {
          hemi.color.setHex(0xe8c8a0).lerp(TINT_BURG_SKY.set(0xaab8d0), b.t);
          hemi.groundColor.setHex(0x3a2c22).lerp(TINT_BURG_GROUND.set(0x2c3038), b.t);
          sun.color.setHex(0xffc890).lerp(TINT_BURG_SUN.set(0xb8c8e0), b.t);
        },
      });
  let areaOverride: string | null = saveData.bloodstain?.areaId ?? null;
  if (areaTransitions) saveData.area = areaTransitions.current;
  const currentAreaId = (pos?: { x: number; y: number; z: number }): string => areaOverride ?? (areaTransitions ? (pos ? areaAtPosition(pos) : areaTransitions.current) : areaId);
  const spawnFallback = { pos: { x: pl.position.x, y: pl.position.y, z: pl.position.z }, yaw: pl.state.yaw };
  const death = createDeathLoop({
    player: pl, wallet, progress, ai, pickups, combat, interact, scene, save: saveData,
    getRespawn: () => bonfires.respawnPoint(saveData.bonfireId) ?? respawnTo ?? spawnFallback,
    getAreaId: currentAreaId, inBossArena: () => taurus.inBossArena() ?? ai.bossInArena?.() ?? null,
  });
  areaOverride = null;
  death.onChange = () => persist(); // stain + wallet change together: flush now, not on the next tick
  deathSave = (sd) => death.writeSave(sd);
  const exitSys: System = areaTransitions ?? { name: 'areaExit', update() {} };
  // Burg triggers: barrel rolls use the spawn op's own AABB (AI); crossbowAlert wakes the tower crossbows.
  const triggerSys = createTriggerSystem({
    player: pl,
    triggers: solo ? [] : BURG_TRIGGERS.filter((t) => t.kind === 'crossbowAlert'),
    onEnter: () => {
      for (const e of ai.enemies) if (e.alive && e.placementId?.startsWith('B_crossbow')) events.emit('aggroPing', { targetId: e.id, pos: { x: pl.position.x, y: pl.position.y, z: pl.position.z } });
    },
  });
  // M7 ladders (watchtower).
  const ladders = new LadderSystem({ parent: scene, interact, player: pl, isBlocked: () => uiCapturing || isDeadNow() });
  if (!solo) {
    for (const l of BURG_LADDERS) ladders.addLadder(l);
  }
  // M6 UI: HUD, Tab menu, bonfire/level-up, shop, banners, dialogue, toasts (createUi owns all of them).
  const controlLocks = new Set<string>();
  const applyLocks = (): void => {
    pl.controlsEnabled = controlLocks.size === 0;
  };
  const lockControls = (reason: string): void => {
    controlLocks.add(reason);
    applyLocks();
  };
  const unlockControls = (reason: string): void => {
    controlLocks.delete(reason);
    applyLocks();
  };
  // M7 mimics: B7 is a mimic op that looks like a chest; ChestSystem forwards the ops and drives the mimic tick.
  const mimics = new MimicSystem({
    ai, combat, player: pl, world, interact, progress, parent: scene,
    lockControls: (on) => (on ? lockControls('mimic') : unlockControls('mimic')),
  });
  chests.setMimicHost(mimics);
  const gameUi: UiSystem = createUi({
    shopStock: saveData.shopStock,
    onShopStock: (st) => {
      saveData.shopStock = st;
      dirty = true;
    },
    root: ui,
    events,
    player: pl,
    combat,
    inv,
    wallet,
    input,
    getPrompt: () => (uiCapturing || pl.state.move === 'dead' ? null : interact.current?.prompt() ?? null),
    onLevelUp: (stat) => {
      if (pl.levels[stat] >= 99) return false;
      pl.levels = { ...pl.levels, [stat]: pl.levels[stat] + 1 };
      applyLevelMods();
      pl.recomputeStats(); // Vitality -> max HP; Endurance -> max stamina (regen + max equip load read levels live)
      persist();
    },
    // Control locks (above) own `controlsEnabled`, so UI and the death cam never overwrite each other.
    gateControls: false,
    onCapture: (on) => (on ? lockControls('ui') : unlockControls('ui')),
  });
  // Menus don't pause the sim: dying with one open closes it (UI) but must keep controls locked until respawn.
  events.on('deathScreen', (e) => (e.phase === 'start' ? lockControls('death') : unlockControls('death')));

  loop.add(perfBegin).add(input).add(pl).add(death).add(combat).add(consumables).add(ai).add(taurus).add(ladders).add(triggerSys).add(interact).add(bonfires).add(exitSys).add(pickups).add(chests).add(doors).add(persistSys).add(debugSys).add(fpsReadout).add(hudSys).add(gameUi);
  if (aiDebug) loop.add(aiDebug);
  const fx = createFxSystem({ events, camera, scene, viewmodel, loop, world, player: pl });
  const audio = createAudioSystem({ events, player: pl, camera, stats: modStats });
  loop.add(fx).add(audio);
  loop.add(perfEnd);
  loop.add(renderPass);

  if (import.meta.env.DEV) {
    const aiDev = {
      system: ai,
      nav,
      list: () => ai.list(),
      states: () => ai.enemies.map((e) => `${e.id}:${e.state}`),
      spawn: (defId: string, pos: { x: number; y?: number; z: number } | [number, number, number], yaw = 0) => {
        const p = Array.isArray(pos) ? { x: pos[0], y: pos[1], z: pos[2] } : { x: pos.x, y: pos.y ?? 0, z: pos.z };
        return ai.spawn(defId, p, yaw)?.id ?? null;
      },
      killAll: () => ai.killAll(), // skips bosses: debug kills never write boss flags
      respawnAll: () => ai.respawnAll(),
      get: (id: number) => ai.enemies.find((e) => e.id === id) ?? null,
    };
    const ALL_TELEPORTS: Record<string, { pos: readonly [number, number, number]; yaw: number }> = { ...FIRELINK_TELEPORTS, ...BURG_TELEPORTS };
    const areaDev = {
      id: area.id,
      current: () => areaAtPosition(pl.position),
      triggers: BURG_TRIGGERS,
      ladders,
      drawCalls: () => perf.calls,
      bonfires: bonfireOps.map((b) => ({ id: b.id, pos: b.pos })),
      props: builtProps.counts,
      rest: (id?: string) => bonfires.rest(id ?? bonfireOps[0]?.id ?? ''),
      teleportNames: () => (solo ? ['spawn'] : Object.keys(ALL_TELEPORTS)),
      teleport: (name: string): boolean => {
        const v3 = (a: readonly [number, number, number]) => ({ x: a[0], y: a[1], z: a[2] });
        const named = solo ? (name === 'spawn' ? area.spawn : undefined) : ALL_TELEPORTS[name];
        const t = named ? { pos: v3(named.pos), yaw: named.yaw } : bonfires.respawnPoint(name);
        if (!t) return false;
        const q = t.pos;
        pl.teleport(q, t.yaw);
        return true;
      },
    };
    // Dev: wipe the save and reload. Freezes flushing first (pagehide/visibilitychange persist() would rewrite it).
    const resetSave = (): void => {
      saves.frozen = true;
      saves.clear();
      location.reload();
    };
    (window as unknown as { __game: unknown }).__game = { resetSave, perf, renderer, area: areaDev, bonfires, npcs, player: pl, world, level, scene, levels, camera, input, loop, combat, consumables, audio, ai: aiDev, taurus, mimics, inv, ui: gameUi, econ: { wallet, progress, pickups, chests, doors, drops, interact, persist, saves, events } };
  }
}

if (import.meta.env.DEV && !player) (window as unknown as { __game: unknown }).__game = { perf, renderer, scene, camera, input, loop };

loop.start();
