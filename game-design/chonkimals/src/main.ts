/**
 * Frog Explorer — boot file.
 * Grounding: per-frame raycast from frog+rayStartH, smooth Y snap, hysteresis.
 * Camera: damped heading follow + drag orbit; camera-relative move toggle.
 * Frog: Y-axis rotation only (never tilts to match slope).
 */
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { configureRenderer, createLightingRig, createSkyEnvironment } from './scene';
import { PostFX, postParams } from './postfx';
import { gameSettings, cameraSensitivityScale } from './game-settings';
import { richenPalette } from './color-pop';
import { CloudLayer } from './sky-clouds';
import { setSafeAreaMode } from './safe-layout';
import { HeroMountain } from './hero-mountain';
import { Birds } from './birds';
import { Campfire } from './campfire';
import { Butterflies } from './butterflies';
import { GroundDressing } from './ground-dressing';
import { AmbientMotes } from './ambient-motes';
import { hardenGestures, hardenViewport } from './gesture-hardening';
import { VirtualJoystick, ClayButton, KeyboardInput } from './input';
import { assembleStage } from './chunks';
import { fixBeachRamp } from './terrain-fixes';
import { addRampRails } from './ramp-rails';
import { buildMountainside } from './mountainside';
import { perfStart, perfEnd, perfFrame, perfSummary } from './perf';
import { batchStatic, mergeGroup } from './static-batch';
import { createCharacter, loadSpeciesGltf, updateCharacterLods, type AnimState } from './player';
import { CHONK_SPECIES, COUNSELOR, SPECIES, speciesForChonk } from './bots/appearance';
import { Ftue } from './ftue';
import { Zipline } from './zipline';
import { CampNpc } from './npc';
import { Glider } from './glider';
import { createDebugPanel, params } from './debug-panel';
import { createCharacterLineup } from './debug-lineup';
import { LogCourse } from './log-course';
import { Dodgeball } from './dodgeball';
import { Sumo } from './sumo/sumo';
import { LunchDelivery } from './lunch/lunch-delivery';
import { BotManager, type BotRideSpot } from './bots/bot-manager';
import { DustSystem } from './dust';
import { WaterSystem } from './water';
import { ChatService } from './chat/chat-service';
import { loadPlayerLoadout } from './chat/loadout';
import { PLAYER_ACTOR, gameEvents } from './events';
import { playMinigameWin, playMinigameFail, playMinigameFailNow, playMinigameLose, playHopPop, playSpringBoing, playBumpFart, playWaterSplash, playJump, playNoToy, playPunch } from './minigame-sounds';
import {
  showTutorialModal, DODGEBALL_TUTORIAL, TEMPLATE_TUTORIAL, SUMO_TUTORIAL,
  showCharacterSelect, showShop, OWNED_CHARACTERS, SHOP_TABS,
  openGameSettings, showLeaderboard, buildLeaderboard, CampHud, LOG_COURSE_TUTORIAL, LUNCH_DELIVERY_TUTORIAL,
  LeaveButton,
  showTroopScreen, showCarePackage, showCheckout, showMail, PREMIUM_TAB, type ShopScreen,
  showCampPass, showBackpack, showCustomize, PassToasts, type CampPassScreen,
} from './ui';
import { playerLoadout as outfit } from './customization/loadout';
import { POI_ICONS, icon } from './ui/icons';
import { celebratePinecones } from './ui/pinecone-burst';
import { LoadingScreen, TitleScreen } from './ui/title-screen';
import { useToy } from './customization/toy-use';
import { rewardIconUrl } from './care-package/reward-art';
import { playToySound } from './inventory/toy-sounds';
import { dressCharacter } from './customization/attire';
import { playerInventory } from './inventory/inventory';
import { allItems, itemById } from './inventory/items';
import { economy, premium } from './economy';
import { Canteen } from './canteen';
import { Mailbox } from './mailbox';
import { BulletinBoard } from './bulletin/board-prop';
import { bulletin } from './bulletin/bulletin';
import { captureCampMap, type MapPoi } from './bulletin/map-capture';
import { MAP_ASPECT, type CampMap, type PaperData } from './bulletin/papers';
import { showBulletinBoard } from './ui/bulletin-screen';
import { dailyRewards } from './daily-rewards';
import { inventory } from './care-package/inventory';
import { campPass } from './camp-pass/camp-pass';
import { communityDrive } from './drives/community-drive';
import { troopDrives } from './drives/troop-drives';
import { troopSummary } from './troop-life';
import { rewardById } from './care-package/rewards';
import { troopStyle } from './troop-style';
import { recordTroopPurchase } from './troops';
import { TROOP_TUNING, TROOP_WELCOME_LINES } from './troop-presets';
import { TroopTent, relocateTroopTent } from './troop-tent';
import { GateTriggers } from './gates';
import { StartMarkers } from './start-markers';
import { startMusic } from './music';
import { MrKodak, KODAK_SCORE, playShutter } from './postcards/kodak';
import { photoAlbum } from './postcards/album';
import { PhotoBooth } from './postcards/photo-booth';
import { CampTents, TENT_SITES, CAMP_TENTS, type TentSiteId } from './camp-tents';
import { showPostcards } from './ui/postcard-screen';
import { PhotoHudButton, showKodakNote } from './ui/photo-hud';
import { showBadgeSash, type BadgeSashScreen } from './ui/badge-sash-screen';
import { achievements } from './achievements/achievements';
import { LOCATIONS, type LocationId } from './achievements/content';
import { Tabletop } from './tabletop/tabletop';
import { CampBalls, beachBall, soccerBall, type Kicker } from './balls/camp-balls';

hardenViewport();
(window as unknown as { __perf: () => string }).__perf = perfSummary; // dev: read timings from the console
hardenGestures();
startMusic(); // camp background track (starts on the first tap)

// ── Renderer ──────────────────────────────────────────────────────────────────
const container = document.getElementById('game');
if (!container) throw new Error('#game container not found');
const gameRoot: HTMLElement = container;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
renderer.info.autoReset = false; // perf.ts totals every pass of a frame (scene, shadows, post-FX)
configureRenderer(renderer);
// configureRenderer keeps the saturation-preserving Neutral tonemap; the
// PostFX composite renders the scene into an sRGB target (so that tonemap
// still applies) and then adds bloom + a vivid grade + vignette on top.
renderer.domElement.style.display = 'block';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
container.appendChild(renderer.domElement);

// ── Post-processing (bloom + vivid grade + vignette; hand-rolled, WIM-safe) ──
const postfx = new PostFX(renderer);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// Gradient sky + soft studio IBL (see scene.ts). The fog is a SATURATED
// sky-blue (not the old near-white haze) so distant peaks fade to blue —
// real aerial perspective — instead of washing out to white cardboard. Pushed
// a little less dense so the mountains keep their colour and read as depth.
createSkyEnvironment(renderer, scene);
scene.fog = new THREE.Fog(0x8fc4ec, 110, 340);

// ── Camera ────────────────────────────────────────────────────────────────────
// Far plane just past where the fog (ends at 340) hides everything: far geometry is culled
// instead of drawn into solid fog, and depth precision is much better (less z-fighting).
const camera = new THREE.PerspectiveCamera(params.camFov, GAME_WIDTH / GAME_HEIGHT, 0.1, 600);

// ── Lighting ──────────────────────────────────────────────────────────────────
const rig = createLightingRig(scene, 55);

// ── Sky clouds (soft drifting billboards; fills the storybook sky) ──────────
const clouds = new CloudLayer(scene);
let heroMountain: HeroMountain | null = null; // the big snowy massif on the northern horizon
let birds: Birds | null = null;               // little flocks wheeling over camp
let campfire: Campfire | null = null;         // the living fire in the campsite pit
let butterflies: Butterflies | null = null;   // flutter about, land, scatter when you come close
let dressing: GroundDressing | null = null;   // grass tufts, flowers + sprigs on the walkable grass
let motes: AmbientMotes | null = null;        // pollen drifting in the air around you

// ── Footstep dust ───────────────────────────────────────────────────────────
const dust = new DustSystem(scene);
// Minigame moment sounds for the local player (see minigame-sounds.ts).
gameEvents.on('course_win', (e) => { if (e.actor.id === PLAYER_ACTOR.id) playMinigameWin(); });
// Camp Pass stats for the local player (minigame plays/wins + rides are recorded in their callbacks below).
gameEvents.on('course_win', (e) => { if (e.actor.id === PLAYER_ACTOR.id) campPass.recordMinigame('logCourse', 'win'); });
gameEvents.on('jump', (e) => { if (e.actor.id === PLAYER_ACTOR.id) campPass.record('jump'); });
gameEvents.on('chat', (e) => { if (e.actor.id === PLAYER_ACTOR.id) campPass.record('chat'); });
// Merit badge stats the pass doesn't count (lifetime; see achievements/content.ts).
gameEvents.on('course_splash', (e) => { if (e.actor.id === PLAYER_ACTOR.id) achievements.add('splash'); });
gameEvents.on('course_spring', (e) => { if (e.actor.id === PLAYER_ACTOR.id) achievements.add('spring'); });
gameEvents.on('sumo_out', (e) => { if (e.by?.id === PLAYER_ACTOR.id) achievements.add('ring_out'); });
gameEvents.on('course_splash', (e) => { if (e.actor.id === PLAYER_ACTOR.id) playMinigameFail(); });
gameEvents.on('course_bumped_out', (e) => { if (e.actor.id === PLAYER_ACTOR.id) playMinigameFail(); });
gameEvents.on('course_lose', (e) => { if (e.actor.id === PLAYER_ACTOR.id) playMinigameLose(); });
// Log-course action sounds (hop pop, spring boing): loud for your own frog;
// other frogs' (bots racing you, or you watching from the bank) are quiet,
// fade with distance from the camera, and are rate-limited per sound so a busy
// course doesn't turn into a wall of noise.
function courseSfx(play: (volume: number) => void): (e: { actor: { id: string }; pos: import('three').Vector3 }) => void {
  let lastOther = 0;
  return (e) => {
    if (e.actor.id === PLAYER_ACTOR.id) { play(COURSE_SFX_VOLUME_PLAYER); return; }
    const now = performance.now();
    if (now - lastOther < COURSE_SFX_OTHERS_GAP_MS) return;
    const d = camera.position.distanceTo(e.pos);
    const falloff = THREE.MathUtils.clamp(1 - (d - COURSE_SFX_NEAR) / (COURSE_SFX_FAR - COURSE_SFX_NEAR), 0, 1);
    if (falloff <= 0) return;
    lastOther = now;
    play(COURSE_SFX_VOLUME_OTHERS * falloff);
  };
}
gameEvents.on('course_hop', courseSfx(playHopPop));
// Jumps: yours at full volume, other players' (bots hopping round camp) nearly as
// loud, fading with distance from YOU (not the camera, which trails ~8 units behind)
// and rate-limited like the course sounds.
gameEvents.on('jump', (() => {
  let lastOther = 0;
  return (e: { actor: { id: string }; pos: import('three').Vector3 }) => {
    if (e.actor.id === PLAYER_ACTOR.id) { playJump(); return; }
    const now = performance.now();
    if (now - lastOther < JUMP_SFX_OTHERS_GAP_MS) return;
    const d = (playerRoot?.position ?? camera.position).distanceTo(e.pos);
    const falloff = THREE.MathUtils.clamp(1 - (d - JUMP_SFX_NEAR) / (JUMP_SFX_FAR - JUMP_SFX_NEAR), 0, 1);
    if (falloff <= 0) return;
    lastOther = now;
    playJump(JUMP_SFX_VOLUME_OTHERS * falloff);
  };
})());
gameEvents.on('course_spring', courseSfx(playSpringBoing));
// Splashes are rare and important: anyone's plays at full volume near the
// river (no bot/spectator reduction), but fades out with distance from the
// camera so you don't hear the river from across camp. Yours is always full.
gameEvents.on('course_splash', (e) => {
  if (e.actor.id === PLAYER_ACTOR.id) { playWaterSplash(); return; }
  const d = camera.position.distanceTo(e.pos);
  playWaterSplash(THREE.MathUtils.clamp(1 - (d - SPLASH_NEAR) / (SPLASH_FAR - SPLASH_NEAR), 0, 1));
});
// Fart when YOU bump someone out of place (not when you get bumped).
gameEvents.on('course_bump', (e) => { if (e.actor.id === PLAYER_ACTOR.id) playBumpFart(); });
let stepDist = 0; // horizontal distance accumulated since the last dust puff
// Merit badges: camp spots discovered the first time you walk up to one (placed once the world's built).
const discoverSpots: { id: LocationId; pos: import('three').Vector3; radius: number }[] = [];
let discoverT = 0; // time to the next discovery check
(window as unknown as { __badges: unknown }).__badges = { achievements, discoverSpots }; // dev: poke from the console

// ── Character lineup (debug: compare player + every species side by side) ──
const lineup = createCharacterLineup(scene, (x, z) => castGroundRay(x, z, lastGroundY + 40, 200));
let lineupWasOn = false;

// ── Loading screen ────────────────────────────────────────────────────────────
// Loading screen (camp illustration + logo) until the world is built, then the title screen.
const loading = new LoadingScreen(container);
const loadScreen = loading.root;

// ── Input ─────────────────────────────────────────────────────────────────────
const keyboard = new KeyboardInput();
// Floating stick: touch anywhere in the bottom third (Settings > Show Joystick hides it at rest).
const joystick  = new VirtualJoystick({ container, size: 120, left: '28px', bottom: '28px', zoneHeight: 1 / 3 });
gameSettings.subscribe((s) => joystick.setShowAtRest(s.showJoystick));

// ── HUD action cluster (bottom-right, clay style) ───────────────────────────
// Big ACTION button (jump, in camp) + CHAT + EMOTE + TOY, all one size, on an even arc round it.
const ICON_JUMP =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M5 13 L12 6 L19 13" stroke="#4a3320" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M5 19 L12 12 L19 19" stroke="#4a3320" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>' +
  '</svg>';
// Chat / Emote / Toy use the icon art (icons.ts); Jump keeps its drawn chevrons.
const TOY_DEFAULT_ICON = 'assets/ui/rewards/cp_toy_ducky.png';

/** Toy button: play the equipped toy (arm up, give it a shake); no toy → a friendly "Hey!".
 * Bots nearby may answer with their own toys (bot-chatter.ts). */
function useEquippedToy(): void {
  const id = outfit.avatar.toy ?? null;
  const item = id ? itemById(id) : undefined;
  if (item?.sound) playToySound(item.sound);
  else playNoToy();
  if (playerModel) useToy(playerModel);
  if (playerRoot) gameEvents.emit({ type: 'toy', actor: PLAYER_ACTOR, pos: playerRoot.position, itemId: id });
  achievements.add('toy');
  // Game toys tip the game out on the ground and challenge someone (tabletop/tabletop.ts).
  if (item?.game) tabletop?.useGameToy(item.game);
}

/** The toy button shows the equipped toy itself (no rarity tile — just the toy); the duck when empty. */
let toyIconFor: string | null | undefined;
function refreshToyIcon(): void {
  const id = outfit.avatar.toy ?? null;
  if (id === toyIconFor) return;
  toyIconFor = id;
  const it = id ? itemById(id) : undefined;
  if (!it) { toyBtn.element.replaceChildren(ClayButton.iconImage(TOY_DEFAULT_ICON)); return; }
  void rewardIconUrl(it).then((url) => {
    if (toyIconFor !== id) return; // changed again meanwhile
    const img = document.createElement('img');
    img.src = url;
    img.alt = it.name;
    img.style.cssText = 'width:64%;height:64%;object-fit:contain;pointer-events:none;display:block;';
    toyBtn.element.replaceChildren(img);
  });
}

function sayRandomChat(): void {
  const lines = playerLoadout.messages();
  if (lines.length > 0) chat.say(PLAYER_ACTOR.id, lines[Math.floor(Math.random() * lines.length)].id);
}

// Layout (CSS px): Jump in the corner; the three small buttons sit on a quarter circle round
// it — Toy to the left, Emote on the diagonal, Chat above — the same gap from Jump each.
const BIG_BTN = 84, SMALL_BTN = 56, BTN_GAP = 14, BTN_EDGE = 24;
const ARC = BIG_BTN / 2 + BTN_GAP + SMALL_BTN / 2;       // Jump centre → small-button centre
const JUMP_C = BTN_EDGE + BIG_BTN / 2;                   // Jump centre from the right / bottom edge
const arcSpot = (deg: number) => {                       // 180° = left of Jump, 90° = above it
  const a = (deg * Math.PI) / 180;
  return { right: `${JUMP_C - Math.cos(a) * ARC - SMALL_BTN / 2}px`, bottom: `${JUMP_C + Math.sin(a) * ARC - SMALL_BTN / 2}px` };
};
const actionBtn = new ClayButton({ container, size: BIG_BTN, right: `${BTN_EDGE}px`, bottom: `${BTN_EDGE}px`, icon: ICON_JUMP, ariaLabel: 'Jump' });
const chatBtn   = new ClayButton({ container, size: SMALL_BTN, ...arcSpot(90),  iconUrl: icon('social', 'chat'),  ariaLabel: 'Chat',  onTap: sayRandomChat });
const emoteBtn  = new ClayButton({ container, size: SMALL_BTN, ...arcSpot(135), iconUrl: icon('social', 'emote'), ariaLabel: 'Emote', onTap: () => { chat.emote(PLAYER_ACTOR.id); achievements.add('emote'); } });
const toyBtn    = new ClayButton({ container, size: SMALL_BTN, ...arcSpot(180), iconUrl: TOY_DEFAULT_ICON, ariaLabel: 'Toy',   onTap: useEquippedToy });
refreshToyIcon();
outfit.subscribe(refreshToyIcon);

/** Top-right "✕ Leave" while in a minigame (asks first), out of the way of the thumb controls. */
const leaveBtn = new LeaveButton(gameRoot);

/** Chat + emote + toy stay up in minigames for taunting. `raised` lifts them clear of the
 * big action buttons in that corner (dodge ball's THROW, lunch delivery's ATTACK). */
function setChatLayout(layout: 'camp' | 'raised'): void {
  // Raised: one even row above the minigame's own big button (its top sits ~188px up).
  const row = (i: number) => ({ right: `${BTN_EDGE + i * (SMALL_BTN + BTN_GAP)}px`, bottom: '204px' });
  const spots = layout === 'raised' ? [row(0), row(1), row(2)] : [arcSpot(90), arcSpot(135), arcSpot(180)];
  [chatBtn, emoteBtn, toyBtn].forEach((b, i) => { b.element.style.right = spots[i].right; b.element.style.bottom = spots[i].bottom; });
}

// ── Camera state ──────────────────────────────────────────────────────────────
// camHeading: the world-space yaw the camera currently points FROM (smoothed).
// tgtOrbitOff: drag rotation not yet eased into camHeading.
let camHeading   = 0;   // smoothed world yaw (drag + auto-follow behind movement)
let orbitPitch   = 0.3; // vertical tilt (radians)
let tgtOrbitOff  = 0;
let tgtPitch     = 0.3;
const ORBIT_SPEED = 0.005;
const BACK_DEADZONE = 0.17; // rad (~10°) around straight-back where auto-follow stays off
const COURSE_SFX_VOLUME_PLAYER = 0.7;  // your own hops / springs
const COURSE_SFX_VOLUME_OTHERS = 0.12; // bots' (while racing them or spectating)
const COURSE_SFX_OTHERS_GAP_MS = 90;   // per sound: at most ~11 bot plays a second
const COURSE_SFX_NEAR = 12;            // full (quiet) volume within this camera distance
const COURSE_SFX_FAR = 45;             // silent beyond this
const JUMP_SFX_VOLUME_OTHERS = 0.5;   // other players' jumps, relative to yours
const JUMP_SFX_OTHERS_GAP_MS = 1;    // at most ~8 of theirs a second
const JUMP_SFX_NEAR = 6;              // full volume within this distance of you
const JUMP_SFX_FAR = 30;               // silent beyond this
const SPLASH_NEAR = 10; // splashes are full volume within this camera distance…
const SPLASH_FAR = 30;  // …and silent beyond this
const SPRINT_GRACE = 0.2; // seconds you can let go of the stick and keep your sprint
let runTime = 0;          // continuous running time (drives the sprint build-up)
let runIdle = 0;          // time since you last ran
let camIdle = 0;          // time with no move input or camera drag (drives the idle recenter)
const camPos = new THREE.Vector3();
let camReady = false;

// Drag tracking (canvas only — joystick/button areas handle their own input)
const dragPtrs = new Map<number, { x: number; y: number }>();
let dragActive = false;
let dragLastX = 0;
let dragLastY = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* pointer already gone (or synthetic) */ }
  dragPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dragPtrs.size === 1) { dragActive = true; dragLastX = e.clientX; dragLastY = e.clientY; }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragPtrs.has(e.pointerId)) return;
  dragPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const orbit = ORBIT_SPEED * cameraSensitivityScale(gameSettings.get().cameraSensitivity);
  if (dragPtrs.size === 1 && dragActive && dodgeball?.active) {
    // Dodgeball owns its camera; it only orbits once you're out and spectating.
    dodgeball.orbit((e.clientX - dragLastX) * orbit, (e.clientY - dragLastY) * orbit);
    dragLastX = e.clientX; dragLastY = e.clientY;
  } else if (dragPtrs.size === 1 && dragActive && !logCourse?.active && !ftue?.active && !sumo?.active && !tabletop?.humanSeated) {
    tgtOrbitOff += (e.clientX - dragLastX) * orbit;
    tgtPitch = Math.max(-0.05, Math.min(1.3, tgtPitch - (e.clientY - dragLastY) * orbit));
    dragLastX = e.clientX; dragLastY = e.clientY;
  }
});
renderer.domElement.addEventListener('pointerup',     (e) => { dragPtrs.delete(e.pointerId); dragActive = dragPtrs.size > 0; });
renderer.domElement.addEventListener('pointercancel', (e) => { dragPtrs.delete(e.pointerId); dragActive = false; });

// ── Grounding state ───────────────────────────────────────────────────────────
// "grounded" has hysteresis: set true when ray hit is within threshold,
// cleared only when ray is more than 2× threshold away (avoids flicker).
let grounded       = false;
let lastGroundY    = 0;    // last known good ground Y (used as ray start baseline)
let smoothedFrogY  = 0;    // lerped frog Y (avoids jitter)
let smoothYReady   = false;

// ── Jump state ────────────────────────────────────────────────────────────────
let jumpVelY          = 0;
let airborne          = false;
let jumpHeld          = false;
let heightAboveGround = 0;
let animState: AnimState = 'idle';
const JUMP_GRAVITY = 18;
const LEDGE_FALL_DROP = 1.2; // ground dropping away by more than this in one step = walked off a ledge → fall
const MAX_FALL_SPEED = 34;   // terminal velocity for long falls (units/s)

// ── Per-frame raycaster ───────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const downVec   = new THREE.Vector3(0, -1, 0);

// ── Shared game state ─────────────────────────────────────────────────────────
let collisionMeshes: import('three').Mesh[] = [];
let playerRoot:   import('three').Group | null = null;
let playerUpdate: ((dt: number, s: AnimState) => void) | null = null;
let frogHeight = 0; // current species' body height (unscaled by frogScale)
// The chosen chonk's model sits inside playerRoot (a stable holder), so swapping
// species never invalidates references to playerRoot.
let playerModel: import('three').Group | null = null;
let playerSpeciesFoot = 0; // world-unit foot fine-tune for the current species
let ftue: Ftue | null = null;
let zipline: Zipline | null = null;
let zipCounselor: CampNpc | null = null; // at the top of the zipline
let glider: Glider | null = null;
let glideCounselor: CampNpc | null = null; // at the hang-glider launch
let canteen: Canteen | null = null; // the storefront: Browse Shop / Get Care Package
let mailbox: Mailbox | null = null; // daily login rewards (Camp Mail)
let board: BulletinBoard | null = null; // camp map, news, leaderboards, daily challenge
let campMap: CampMap | null = null;     // top-down map for the board (captured once, near the board)
let boardPaperTimer = 0;
let troopTent: TroopTent | null = null; // Troop HQ: the campsite tent that opens the Scout Troop screen
let photoBooth: PhotoBooth | null = null; // Mr Kodak's Photo Booth: your snapshots as camp post cards
let campTents: CampTents | null = null;   // every camper's tent (yours + the bots') at the three tent sites
let beachFire: Campfire | null = null;    // the Beach Picnic tent site's campfire
let logCourse: LogCourse | null = null;
let dodgeball: Dodgeball | null = null;
let sumo: Sumo | null = null;
let lunch: LunchDelivery | null = null;
let dbReturnPos: import('three').Vector3 | null = null; // where to drop the human after a match
let bots: BotManager | null = null;
let tabletop: Tabletop | null = null; // board games laid out on the ground (Words With Friends…)
let balls: CampBalls | null = null;     // the big kickable beach ball + soccer ball
let water: WaterSystem | undefined;
// Immersion state (float/swim): eased 0→1 as the frog enters/leaves water.
let waterImmersion = 0;
let waterRippleDist = 0; // wake-ring spacing accumulator while swimming
// Last frame's water surface under the frog (−inf when dry) — read by pathClear
// so the step-up wall test uses the water line, letting the frog swim + wade out.
let moveWaterY = -Infinity;
const chat = new ChatService(gameRoot);

// Player settings (Settings screen) → live systems. Minigames hide chat while active.
let lastSafeArea: string | null = null;
gameSettings.subscribe((s) => {
  // Notch padding first, then nudge every fillScreen / HUD layout to re-measure.
  const mode = s.safeArea ?? 'auto';
  if (mode !== lastSafeArea) { lastSafeArea = mode; setSafeAreaMode(mode); window.dispatchEvent(new Event('resize')); }
  params.showNameplates = s.showNames;
  postParams.enabled = s.graphics !== 'low';
  chat.setVisible(s.chatBubbles);
  applyWorldQuality();
});

/** Graphics level → world dressing (Settings > Graphics). Called again once the world is built. */
function applyWorldQuality(): void {
  const g = gameSettings.get().graphics;
  dressing?.setLevel(g);
  motes?.setVisible(g === 'high');
  birds?.setVisible(g !== 'low');
  butterflies?.setVisible(g !== 'low');
  campfire?.setFull(g !== 'low');
  beachFire?.setFull(g !== 'low');
  clouds?.setDensity(g === 'low' ? 0.5 : 1);
}
const playerLoadout = loadPlayerLoadout();

// ── Debug ray visual ──────────────────────────────────────────────────────────
const rayLineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
const rayLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(), new THREE.Vector3(0, -1, 0),
]);
const rayLine = new THREE.Line(rayLineGeo, rayLineMat);
scene.add(rayLine);

const rayDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.15, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff4400 }),
);
scene.add(rayDot);

// ── Spawn marker ──────────────────────────────────────────────────────────────
const markerMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 6, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000 }),
);
markerMesh.visible = false; // debug-only (params.showMarker); off until free roam says otherwise
rayLine.visible = false;
rayDot.visible = false;
scene.add(markerMesh);

// ── FPS ───────────────────────────────────────────────────────────────────────
let fpsFrames = 0, fpsAccum = 0, fpsDisplay = 0;

// ── Ground raycast helper (reuses module-level raycaster) ────────────────────
function castGroundRay(x: number, z: number, startY: number, maxLen: number): number | null {
  return castGroundHit(x, z, startY, maxLen)?.point.y ?? null;
}

/** Like castGroundRay, but returns the whole hit (so callers can see what was hit). */
function castGroundHit(x: number, z: number, startY: number, maxLen: number): import('three').Intersection | null {
  if (!params.groundingOn || collisionMeshes.length === 0) return null;
  raycaster.set(new THREE.Vector3(x, startY, z), downVec);
  raycaster.far = maxLen;
  const hits = raycaster.intersectObjects(collisionMeshes, false);
  return hits.length > 0 ? hits[0] : null;
}

// ── Step-height collision ────────────────────────────────────────────────────
// Ground higher than feet + maxStepUp is a wall. Probes are spaced along the
// path (plus a body-radius lookahead) so fast moves can't tunnel through thin
// rails.
const PROBE_SPACING = 0.15;
const BODY_RADIUS   = 0.3;
const SLIDE_ANGLES  = [15, 30, 45, 60, 75].map((d) => (d * Math.PI) / 180);
// Bridge decks sit ~0.8 above the path (more where the bank dips), which the
// step test measured as a wall; give decks extra step-up so you walk straight on.
const BRIDGE_DECK_RE = /^prop_bridge_.+_deck$/;
const BRIDGE_STEP_BONUS = 0.9;
// Wall probes cast down from this far above the feet. It must clear the tallest
// cliff you can stand at the foot of (the plateau rises ~40 above the ramp and
// beach) — a probe that starts inside the rock never sees its top, and you'd
// walk straight into the cliff.
const WALL_PROBE_H = 80;

function pathClear(dx: number, dz: number): boolean {
  if (!playerRoot) return false;
  const len = Math.hypot(dx, dz);
  if (len === 0) return true;
  const ux = dx / len, uz = dz / len;
  const reach = len + BODY_RADIUS;
  // While floating/swimming the frog sits well below the surface; step-up must
  // be measured from the WATER LINE, not the sunk body, or the bed and banks
  // read as walls and trap it. (moveWaterY is last frame's surface, or -inf.)
  const baseY = Math.max(playerRoot.position.y, moveWaterY);
  const maxY = baseY + params.maxStepUp;
  const startY = Math.max(lastGroundY, playerRoot.position.y) + WALL_PROBE_H;
  for (let d = PROBE_SPACING; ; d += PROBE_SPACING) {
    const t = Math.min(d, reach);
    const px = playerRoot.position.x + ux * t, pz = playerRoot.position.z + uz * t;
    // The log course's river and the dodgeball arena are off-limits unless
    // you're playing them (keeps the ongoing attract match uninterrupted).
    if (logCourse?.inPlayArea(px, pz)) return false;
    if (dodgeball?.inPlayArea(px, pz)) return false;
    if (sumo?.inPlayArea(px, pz)) return false; // the sumo ring: spectators stay outside
    if (lunch?.blocks(px, pz, playerRoot.position.x, playerRoot.position.z)) return false; // the lunch cart is solid
    if (tabletop?.blocks(px, pz, playerRoot.position.x, playerRoot.position.z)) return false; // no walking across a board game
    const hit = castGroundHit(px, pz, startY, WALL_PROBE_H + params.rayMaxLen);
    if (hit && hit.point.y > maxY + (BRIDGE_DECK_RE.test(hit.object.name) ? BRIDGE_STEP_BONUS : 0)) return false;
    if (t >= reach) return true;
  }
}

/** Returns the allowed XZ step, sliding along walls when the direct move is blocked. */
function resolveMove(dx: number, dz: number): { x: number; z: number } {
  if (pathClear(dx, dz)) return { x: dx, z: dz };
  for (const a of SLIDE_ANGLES) {
    const c = Math.cos(a), s = Math.sin(a);
    // Rotate by ±a and shorten to the projection onto that direction.
    const lx = (dx * c - dz * s) * c, lz = (dx * s + dz * c) * c;
    const rx = (dx * c + dz * s) * c, rz = (-dx * s + dz * c) * c;
    const left = pathClear(lx, lz);
    const right = pathClear(rx, rz);
    if (left && right) break; // head-on into a wall: stop rather than drift
    if (left)  return { x: lx, z: lz };
    if (right) return { x: rx, z: rz };
  }
  return { x: 0, z: 0 };
}

// ── Snap frog to ground (used at spawn and by button) ────────────────────────
function snapToGround(): void {
  if (!playerRoot) return;
  const x = playerRoot.position.x;
  const z = playerRoot.position.z;
  // Cast from well above any known terrain
  const hit = castGroundRay(x, z, lastGroundY + params.rayStartH + 20, params.rayMaxLen + 20);
  if (hit !== null) {
    const targetY = hit + params.footOffset;
    playerRoot.position.y = targetY;
    smoothedFrogY = targetY;
    lastGroundY = hit;
    grounded = true;
    heightAboveGround = 0;
    jumpVelY = 0;
    airborne = false;
  }
}

// ── Debug panel callbacks ─────────────────────────────────────────────────────
// ── Camp menus + HUD ──────────────────────────────────────────────────────────
// Character selection swaps the player model for chonks that have one
// (CHONK_SPECIES); model-less chonks play as the frog for now. Coins are real (economy.ts).
function selectCharacter(id: string): void {
  gameSettings.set({ character: id });
  void setPlayerCharacter(id);
}
function openCharacters(): void {
  showCharacterSelect(gameRoot, {
    characters: OWNED_CHARACTERS, selectedId: gameSettings.get().character, coins: economy.balance,
    onSelect: selectCharacter, onGetMore: openShop,
  });
}

/** Loads the chonk's species model into the player holder (replacing the current one). */
async function setPlayerCharacter(chonkId: string): Promise<void> {
  if (!playerRoot) return;
  const sp = SPECIES[speciesForChonk(chonkId)];
  const c = createCharacter(await loadSpeciesGltf(sp), { lod: false }); // the player is always full detail
  if (playerModel) playerRoot.remove(playerModel);
  playerModel = c.root;
  dressCharacter(playerModel, outfit.avatar);
  playerModel.scale.setScalar(sp.scale);
  playerRoot.add(playerModel);
  playerUpdate = c.update;
  frogHeight = c.height * sp.scale;
  playerSpeciesFoot = sp.footOffset;
}
/** The Shop: chonkimals for pony beads, and golden pinecone packs for (faked) real money. */
function openShop(tab?: number): ShopScreen {
  const shop = showShop(gameRoot, {
    tabs: SHOP_TABS, coins: economy.balance, activeTab: tab, premium: premium.balance,
    onAddPremium: () => shop.showTab(PREMIUM_TAB),
    onBuy: (it) => {
      const ok = economy.spend(it.price);
      if (ok) recordTroopPurchase(); // every purchase boosts the buyer's scout troop
      // Troop gear: into the inventory and straight onto your Troop HQ.
      const gear = ok && it.gearId ? rewardById(it.gearId) : undefined;
      if (gear) { inventory.grant(gear.id); troopStyle.equip(gear); }
      return ok;
    },
    itemStatus: (it) => (!it.gearId ? null : troopStyle.isEquipped(it.gearId) ? 'equipped'
      : inventory.owns(it.gearId) ? 'owned' : null),
    onEquip: (it) => { const g = it.gearId && rewardById(it.gearId); if (g) troopStyle.equip(g); },
    // No payment backend: a simulated checkout sheet, then the pinecones are granted locally.
    onBuyReal: (it) => showCheckout(gameRoot, {
      title: it.name, price: it.realPrice ?? '', image: it.image,
      onPurchased: () => {
        const n = it.pinecones ?? 0, before = premium.balance;
        premium.add(n); // saved now; the wallet's number catches up as the cones land
        recordTroopPurchase();
        shop.setPremium(before);
        // As the checkout sheet slides away: the burst, then the stream into the wallet.
        window.setTimeout(() => celebratePinecones(gameRoot, {
          amount: n, target: shop.premiumTarget, shake: shop.root,
          onProgress: (k) => shop.setPremium(before + Math.round(n * k)),
          onDone: () => shop.setPremium(premium.balance),
        }), 480);
      },
    }),
  });
  const unsub = premium.subscribe((n) => shop.setPremium(n));
  shop.onClose(unsub);
  return shop;
}

/** Camp Mail (opened at the Mailbox): today's daily login reward. */
function openMail(): void {
  showMail(gameRoot, { onAddPremium: () => openShop(PREMIUM_TAB), onClaimed: () => campPass.record('mail') });
}

/** What the Bulletin Board's notices show (the in-world board and the close-up share it). */
function boardPaperData(): Omit<PaperData, 'board'> {
  const p = playerRoot?.position;
  return { map: campMap, you: p ? { x: p.x, z: p.z } : null, playerName: gameSettings.get().playerName };
}

/** One top-down shot of the camp for the map notice (a single extra render). */
function captureBoardMap(): void {
  const camp = scene.getObjectByName('chunk_0_camp');
  if (!camp) return;
  const campXZ = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(camp.matrixWorld);
  const pois: MapPoi[] = [];
  const poi = (label: string, icon: string, pos: import('three').Vector3 | null | undefined) => {
    if (pos) pois.push({ label, icon, pos: pos.clone() });
  };
  poi('Main Gate', POI_ICONS.mainGate, campXZ(0, 4));
  poi('Canteen', POI_ICONS.canteen, canteen?.gatePoint);
  poi('Mail & Board', POI_ICONS.mailBoard, board?.gatePoint ?? mailbox?.gatePoint);
  poi('Troop HQ', POI_ICONS.troopHq, troopTent?.gatePoint);
  poi('Photo Booth', POI_ICONS.photoBooth, photoBooth?.gatePoint);
  poi('Your Tent', POI_ICONS.yourTent, campTents?.playerTentPosition());
  poi('Dock', POI_ICONS.dock, campXZ(-25, 31));
  poi('Dodge Ball', POI_ICONS.dodgeball, dodgeball?.gatePoint(new THREE.Vector3()));
  poi('Sumo', POI_ICONS.sumo, sumo?.gatePoint(new THREE.Vector3()));
  poi('Log Course', POI_ICONS.logCourse, logCourse?.startGatePoint(new THREE.Vector3()));
  poi('Lunch', POI_ICONS.lunch, lunch?.gatePoint(new THREE.Vector3()));
  const up = new THREE.Vector3(0, 0, 1).transformDirection(camp.matrixWorld);
  try {
    campMap = captureCampMap(renderer, scene, {
      pois, up, aspect: MAP_ASPECT, width: 1024, hide: [bots ? scene.getObjectByName('bots') : null, playerRoot, heroMountain?.root,
        ...scene.children.filter((o) => o.name === 'birds' || o.name === 'butterflies')],
    });
  } catch (e) {
    console.warn('[board] map capture failed:', e);
    return;
  }
  board?.papers.redraw('map');
}

/** The Bulletin Board close-up: camp map, news, leaderboards and today's challenge. */
function openBulletin(focus?: import('./bulletin/papers').PaperKind): void {
  if (!campMap) captureBoardMap();
  showBulletinBoard(gameRoot, {
    paperData: boardPaperData, focus,
    onAddPremium: () => openShop(PREMIUM_TAB),
  }).onClose(() => board?.papers.redraw());
}

/** Camp Care Package (opened at the Canteen): spend golden pinecones on a cosmetic roll. */
function openCarePackage(): void {
  showCarePackage(gameRoot, {
    onGetPremium: () => openShop(PREMIUM_TAB),
    onAddCoins: () => openShop(),
    onResult: (r) => {
      campPass.record('care_package');
      if (r.reward.rarity === 'legendary' && r.isNew) canteen?.say(`WOW! ${r.reward.name} is joining camp! 🎉`);
      else if (r.reward.rarity === 'epic' && r.isNew) canteen?.say('Ooh, a shiny one! ✨');
    },
  });
}
/** Camp Pass (HUD button, or tap a Camp Pass toast): goals to claim + the free / premium reward track. */
let campPassScreen: CampPassScreen | null = null;
function openCampPass(tab = 0): void {
  if (campPassScreen && !campPassScreen.isClosed) return;
  campPassScreen = showCampPass(gameRoot, {
    tab,
    onGetPremium: () => openShop(PREMIUM_TAB),
    onAddCoins: () => openShop(),
    onOpenCarePackage: openCarePackage,
    onShowDriveLeaderboard: () => showLeaderboard(gameRoot, {
      entries: communityDrive.leaderboard(gameSettings.get().playerName), coins: economy.balance,
      title: 'Drive Leaders', focusPlayer: true,
    }),
    onFindTroop: openTroop,
    onOpenBoard: () => openBulletin('challenge'),
  });
}
/** Merit Badges (HUD button, or tap a badge toast — `focus` opens that badge's card): the sash. */
let badgeSash: BadgeSashScreen | null = null;
function openBadges(focus?: string): void {
  if (badgeSash && !badgeSash.isClosed) return;
  badgeSash = showBadgeSash(gameRoot, { focus, onAddCoins: () => openShop(), onGetPremium: () => openShop(PREMIUM_TAB) });
}
/** Backpack: everything the player owns (cosmetics, toys, troop gear, free Care Packages). */
function openBackpack(): void {
  showBackpack(gameRoot, {
    onAddCoins: () => openShop(),
    onGetPremium: () => openShop(PREMIUM_TAB),
    onOpenCarePackage: openCarePackage,
  });
}
/** "My Chonk": the dressing room (pick your chonk, dress it, walk out to decorate your tent). `tab` 1 = the Tent view. */
function openCustomize(tab = 0): void {
  showCustomize(gameRoot, { tab, onAddCoins: () => openShop(), onGetPremium: () => openShop(PREMIUM_TAB), onSelectCharacter: selectCharacter });
}
// Your chonk in camp wears whatever's equipped, live.
outfit.subscribe(() => { if (playerModel) dressCharacter(playerModel, outfit.avatar); });

/** Where each merit-badge location is in the world (see LOCATIONS); spots that didn't build are skipped. */
function placeDiscoverySpots(stageRoot: import('three').Object3D): void {
  const camp = stageRoot.getObjectByName('chunk_0_camp') ?? scene.getObjectByName('chunk_0_camp');
  const campXZ = (x: number, z: number) => camp ? new THREE.Vector3(x, 0, z).applyMatrix4(camp.matrixWorld) : undefined;
  const sites = campTents?.sitePoints() ?? [];
  const v = () => new THREE.Vector3();
  const at: Record<LocationId, import('three').Vector3 | null | undefined> = {
    plaza: campXZ(0, 4),
    canteen: canteen?.gatePoint,
    corner: board?.gatePoint ?? mailbox?.gatePoint,
    troop_hq: troopTent?.gatePoint,
    photo_booth: photoBooth?.gatePoint,
    campfire: campfire?.root.getWorldPosition(v()),
    dock: campXZ(-25, 31),
    dodgeball: dodgeball?.gatePoint(v()),
    sumo: sumo?.gatePoint(v()),
    log_course: logCourse?.startGatePoint(v()),
    lunch: lunch?.gatePoint(v()),
    zipline: zipline?.mountPoint(v()),
    glider: glider?.mountPoint(v()),
    beach: sites.find((s) => s.id === 'beach')?.pos,
    meadow: sites.find((s) => s.id === 'meadow')?.pos,
  };
  discoverSpots.length = 0;
  for (const l of LOCATIONS) {
    const pos = at[l.id];
    if (pos) discoverSpots.push({ id: l.id, pos: pos.clone(), radius: l.radius });
  }
}

/** Scout Troop screen (opened at the Troop HQ tent). */
function openTroop(): void {
  showTroopScreen(gameRoot, {
    coins: economy.balance, onAddCoins: openShop,
    player: () => ({ name: gameSettings.get().playerName, art: gameSettings.get().character }),
    // Welcomes wait for the screen to close so you can see them.
    onJoined: (id) => { joined = id; },
    onClose: () => { if (joined) welcomeFromTroopmates(joined); },
  });
  let joined: string | null = null;
}
/** Troopmates walking around camp shout a welcome in the world after you join their troop. */
function welcomeFromTroopmates(troopId: string): void {
  if (!bots) return;
  const mgr = bots;
  const here = playerRoot?.position;
  if (!here) return;
  // The nearest troopmates in sight of you (bubbles fade out past ~45 u).
  const mates = mgr.bots.filter((b) => b.profile.troop?.id === troopId && b.root.position.distanceTo(here) < 40)
    .sort((a, b) => a.root.position.distanceTo(here) - b.root.position.distanceTo(here));
  const name = gameSettings.get().playerName;
  const lines = TROOP_WELCOME_LINES.map((l) => l.replace(/\{name\}/g, name));
  mates.slice(0, TROOP_TUNING.worldWelcomes).forEach((b, i) => {
    window.setTimeout(() => mgr.say(b, lines[(i + Math.floor(Math.random() * lines.length)) % lines.length]),
      300 + i * 900 + Math.random() * 400);
  });
}
function openSettings(): void { openGameSettings(gameRoot, { coins: economy.balance }); }
// Faked board (no backend): fake rivals + a placeholder best score for the player.
function openLeaderboard(): void {
  showLeaderboard(gameRoot, { entries: buildLeaderboard(gameSettings.get().playerName, 10500), coins: economy.balance });
}

type GameMode = 'dodgeball' | 'logCourse' | 'lunchDelivery' | 'sumo';

/** Walk-up entry: the gate opens the mode's tutorial; Ready! starts it, back walks away. */
function openModeTutorial(mode: GameMode): void {
  if (mode === 'dodgeball') showTutorialModal(gameRoot, DODGEBALL_TUTORIAL, { onReady: () => dodgeball?.start(), onDismiss: () => {} });
  else if (mode === 'lunchDelivery') openLunchTutorial(true);
  else if (mode === 'sumo') showTutorialModal(gameRoot, SUMO_TUTORIAL, { onReady: () => sumo?.start(), onDismiss: () => {} });
  else showTutorialModal(gameRoot, LOG_COURSE_TUTORIAL, { onReady: () => logCourse?.start(), onDismiss: () => {} });
}

/** Lunch Delivery: starts a fresh run, or joins the one under way — at the last checkpoint
 * the cart reached (walking up to the hub gate) or right where you are (`teleport` false,
 * walking up to the moving cart). */
function openLunchTutorial(teleport: boolean): void {
  showTutorialModal(gameRoot, LUNCH_DELIVERY_TUTORIAL, {
    onReady: () => { if (lunch?.running) lunch.join(teleport); else lunch?.start(); },
    onDismiss: () => {},
  });
}

/** Drop the frog at `pos` facing `yaw` and re-ground it (minigame respawns / exits). */
function teleportPlayer(pos: import('three').Vector3, yaw: number): void {
  if (!playerRoot) return;
  playerRoot.position.copy(pos);
  playerRoot.rotation.set(0, yaw, 0);
  lastGroundY = pos.y;
  smoothYReady = false;
  heightAboveGround = 0; jumpVelY = 0; airborne = false;
  snapToGround();
  camHeading = yaw + Math.PI;
  tgtOrbitOff = 0;
  camReady = false;
}

// Placeholder text buttons — icon pass later. Main three on the right; the rest live in the
// player badge's drop-down (top-left); My Chonk is the dressing room (chonk + outfit + tent).
const portraitFor = (chonkId: string): string => OWNED_CHARACTERS.find((c) => c.id === chonkId)?.art ?? chonkId;
const campHud = new CampHud(gameRoot, {
  coins: economy.balance,
  onAddCoins: () => openShop(),
  premium: premium.balance,
  onAddPremium: () => openShop(PREMIUM_TAB),
  buttons: [
    { label: 'Camp Pass', onTap: () => openCampPass(), icon: icon('hud', 'camp_pass') },
    { label: 'Customize', onTap: () => openCustomize(), icon: icon('hud', 'my_chonk') },
    { label: 'Canteen', onTap: () => openShop(), icon: icon('hud', 'shop') },
  ],
  profile: {
    art: portraitFor(gameSettings.get().character), name: gameSettings.get().playerName,
    items: [
      { label: 'Scout Troop', onTap: () => openTroop(), icon: icon('hud', 'scout_troop') },
      { label: 'Backpack', onTap: () => openBackpack(), icon: icon('hud', 'backpack') },
      { label: 'Post Cards', onTap: () => openPostcards(), icon: icon('hud', 'post_cards') },
      { label: 'Ranks', onTap: () => openLeaderboard(), icon: icon('hud', 'ranks') },
      { label: 'Badges', onTap: () => openBadges(), icon: icon('pass', 'stamp_earned') },
      { label: 'Settings', onTap: () => openSettings(), icon: icon('hud', 'settings') },
    ],
  },
});
gameSettings.subscribe((s) => campHud.setProfile(portraitFor(s.character), s.playerName));
// Dev (?debug): chonkPineconeBurst(700) plays the purchase celebration into the HUD wallet (no purchase).
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { chonkPineconeBurst?: (n?: number) => void }).chonkPineconeBurst = (n = 700) =>
    celebratePinecones(gameRoot, { amount: n, target: document.querySelector<HTMLElement>('img[src$="currency/pinecone.png"]') });
}
economy.subscribe((c) => campHud.setCoins(c));
premium.subscribe((n) => campHud.setPremium(n));
const updatePassBadge = () => campHud.setBadge('Camp Pass',
  campPass.claimableCount + communityDrive.claimableCount + troopDrives.claimableCount + (bulletin.claimable ? 1 : 0));
campPass.subscribe(updatePassBadge);
bulletin.subscribe(updatePassBadge);
communityDrive.subscribe(updatePassBadge);
troopDrives.subscribe(updatePassBadge);
// Goal progress / completion / new stamps / drive news slide in under the HUD pill; tap one to
// open the pass on the matching tab (0 Goals, 1 Drives, 2 Rewards).
const passToasts = new PassToasts(gameRoot, (n) => {
  if (n.kind === 'message' && n.key.startsWith('kodak:')) openKodakNote();
  else if (n.kind === 'message' && n.key.startsWith('daily:')) openBulletin('challenge');
  else if (n.kind === 'badge') openBadges(n.badge.id);
  else openCampPass(n.kind === 'stamp' ? 2 : n.kind === 'message' ? 1 : 0);
}, () => !!ftue?.active || !!tabletop?.humanSeated); // no game notifs during the first-time arrival or over a board game
const passClosed = () => !campPassScreen || campPassScreen.isClosed; // the open pass shows it already
// Merit badges earned → a sash-green toast in the same slot (the open sash shows them already);
// the HUD Badges button counts the ones you haven't seen on your sash yet.
achievements.onEarned((badge) => { if (!badgeSash || badgeSash.isClosed) passToasts.push({ kind: 'badge', badge }); });
const updateBadgesBadge = () => campHud.setBadge('Badges', achievements.newCount);
achievements.subscribe(updateBadgesBadge);
updateBadgesBadge();
campPass.onNotice((n) => { if (passClosed()) passToasts.push(n); });
communityDrive.onNotice((n) => { if (passClosed()) passToasts.push({ kind: 'message', ...n }); });
troopDrives.onNotice((n) => { if (passClosed()) passToasts.push({ kind: 'message', ...n }); });
// Daily challenge done → a toast in the same slot; tapping it opens the board on the challenge.
bulletin.onComplete((c) => passClosed() && passToasts.push({
  kind: 'message', key: `daily:${bulletin.dayKey}`, emoji: c.icon, kicker: 'DAILY CHALLENGE · COMPLETE!',
  title: c.title, cta: 'Claim at the Bulletin Board',
}));
// Drives run on the wall clock (the camp and your troopmates are simulated between ticks).
troopDrives.setMemberCount((id) => troopSummary(id,
  { name: gameSettings.get().playerName, art: gameSettings.get().character })?.members ?? 15);
const tickDrives = () => { communityDrive.tick(); troopDrives.tick(); };
tickDrives();
updatePassBadge();
window.setInterval(tickDrives, 1000);

// ── Mr Kodak, the camp photographer ─────────────────────────────────────────
// Snaps the local player's big moments (best one per minigame / ride, the odd one while
// wandering); lets you know after with a toast + the HUD photo button's count. The photos
// are viewed as camp post cards at his Photo Booth.
const KODAK_BOOTH_HINT = 'up the lake path from the plaza';
const kodakFocus = new THREE.Vector3();
const kodak = new MrKodak({
  canvas: renderer.domElement,
  focus: () => {
    if (!playerRoot) return null;
    kodakFocus.copy(playerRoot.position);
    kodakFocus.y += frogHeight * playerRoot.scale.y * 0.55;
    kodakFocus.project(camera);
    if (kodakFocus.z > 1 || Math.abs(kodakFocus.x) > 1.1 || Math.abs(kodakFocus.y) > 1.1) return null;
    return { x: (kodakFocus.x + 1) / 2, y: (1 - kodakFocus.y) / 2 };
  },
  onDeveloped: (photo) => {
    playShutter();
    photoBooth?.popFlash();
    achievements.add('photo');
    passToasts.push({
      kind: 'message', key: `kodak:${photo.id}`, emoji: '📸', kicker: 'MR KODAK · SNAP!',
      title: photo.caption, cta: 'Tap to see your photo!',
    });
  },
});
(window as unknown as { __kodak: unknown }).__kodak = { kodak, album: photoAlbum }; // dev: poke from the console
function openKodakNote(): void { showKodakNote(gameRoot, { boothHint: KODAK_BOOTH_HINT }); }
campHud.addTopButton(new PhotoHudButton(openKodakNote).root);
/** Mr Kodak's Photo Booth screen: every snapshot as a camp post card. */
function openPostcards(): void {
  showPostcards(gameRoot, { playerName: gameSettings.get().playerName, onAddPremium: () => openShop(PREMIUM_TAB) });
}
const isMe = (a: { id: string } | null | undefined) => a?.id === PLAYER_ACTOR.id;
gameEvents.on('course_win', (e) => { if (isMe(e.actor)) kodak.moment('Log Course Champion!', KODAK_SCORE.win, 350); });
gameEvents.on('course_spring', (e) => { if (isMe(e.actor)) kodak.moment('Spring Launch!', KODAK_SCORE.spring, 300); });
gameEvents.on('course_bump', (e) => { if (isMe(e.actor) && e.result === 'water') kodak.moment('Splash Attack!', KODAK_SCORE.splashAttack, 350); });
gameEvents.on('course_splash', (e) => { if (isMe(e.actor)) kodak.moment('Epic Splash!', KODAK_SCORE.splash, 220); });
gameEvents.on('sumo_hit', (e) => { if (isMe(e.actor)) kodak.moment('Big Slam!', KODAK_SCORE.bigSlam + Math.min(25, e.force), 60); });
gameEvents.on('sumo_out', (e) => { if (isMe(e.by)) kodak.moment('Ring Out!', KODAK_SCORE.ringOut, 160); });
gameEvents.on('sumo_win', (e) => { if (isMe(e.actor)) kodak.moment('Sumo Champion!', KODAK_SCORE.win, 450); });
let rideSnapT = 0;   // time on the current ride (Mr Kodak waits for it to get going)
let rideSnapGap = 0; // time to the next ride snap attempt
let airPeak = 0;     // highest point of the current jump / fall (free roam)

const gates = new GateTriggers();
const startMarkers = new StartMarkers(scene);
const overlayOpen = () => !!gameRoot.querySelector('[data-overlay]');

const { setReadouts } = createDebugPanel(container, {
  onRecenter() {
    if (!playerRoot) return;
    playerRoot.position.set(params.spawnX, smoothedFrogY, params.spawnZ);
    smoothYReady = false;
    camReady = false;
    heightAboveGround = 0; jumpVelY = 0; airborne = false;
    snapToGround();
  },
  onSnapToGround() { snapToGround(); },
  onSetSpawnHere() {
    if (!playerRoot) return;
    params.spawnX = parseFloat(playerRoot.position.x.toFixed(2));
    params.spawnZ = parseFloat(playerRoot.position.z.toFixed(2));
  },
  onStartLogCourse() { logCourse?.start(); },
  onStartDodgeball() { openModeTutorial('dodgeball'); },
  onStopDodgeball()  { dodgeball?.stop(); },
  onStartSumo()      { openModeTutorial('sumo'); },
  onStopSumo()       { sumo?.stop(); },
  onSumoItem(kind)   { sumo?.debugDropItem(kind); },
  onStartLunch(difficulty) { lunch?.start(difficulty); },
  onStopLunch()      { lunch?.stop(); },
  onLunchGhost()     { if (playerRoot) lunch?.debugGhost(playerRoot.position, playerRoot.rotation.y); },
  onShowModalTemplate() { showTutorialModal(container, TEMPLATE_TUTORIAL); },
  onShowCharacterSelect() { openCharacters(); },
  onShowShop() { openShop(); },
  onShowSettings() { openSettings(); },
  onShowLeaderboard() { openLeaderboard(); },
  onShowTroop() { openTroop(); },
  onShowCarePackage(force) {
    if (force) inventory.forceNext = force;
    openCarePackage();
  },
  onAddPremium() { premium.add(100); },
  onResetInventory() { inventory.reset(); },
  ownEverything: {
    get on() { return playerInventory.debugOwnAll; },
    set on(v: boolean) { playerInventory.debugOwnAll = v; },
  },
  onGrantAllCosmetics() {
    const pretend = playerInventory.debugOwnAll;
    playerInventory.debugOwnAll = false; // check what's really owned
    for (const it of allItems((x) => x.kind !== 'token' && x.kind !== 'character')) {
      if (!playerInventory.owns(it.id)) playerInventory.grant(it.id, 'debug');
    }
    playerInventory.debugOwnAll = pretend;
  },
  onShowMail() { openMail(); },
  onMailNextDay() { dailyRewards.debugNextDay(); },
  onMailReset() { dailyRewards.debugReset(); },
  onShowBulletin() { openBulletin(); },
  onBulletinNextDay() { bulletin.debugNextDay(); },
  onBulletinComplete() { bulletin.debugComplete(); },
  onBulletinReset() { bulletin.debugReset(); },
  onShowCampPass() { openCampPass(); },
  onPassPoints() { campPass.debugAddPoints(100); },
  onPassCompleteGoals() { campPass.debugCompleteGoals(); },
  onPassReset() { campPass.debugReset(); },
  onShowBadges() { openBadges(); },
  onBadgesEarnSome() { achievements.debugEarnSome(3); },
  onBadgesEarnAll() { achievements.debugEarnAll(); },
  onBadgesReset() { achievements.debugReset(); },
  onDriveEndNow() { communityDrive.debugEndNow(); },
  onDriveContribute() { communityDrive.debugContribute(50); },
  onTroopDrivesFinish() { troopDrives.debugFinishAll(); },
  onDrivesReset() { communityDrive.debugReset(); troopDrives.debugReset(); },
  // Drop the frog at a gate — its "Play <mode>" button should float up.
  onGoToGate(id) { goToGate(id); },
  onPlayWinSound()   { console.log('[minigame-sounds] win', playMinigameWin()); },
  onPlayFailSound()  { console.log('[minigame-sounds] fail', playMinigameFailNow()); },
  onPlayLoseSound()  { console.log('[minigame-sounds] lose', playMinigameLose()); },
  onSayChat() {
    const lines = playerLoadout.messages();
    if (lines.length > 0) chat.say(PLAYER_ACTOR.id, lines[Math.floor(Math.random() * lines.length)].id);
  },
  onStopLogCourse()  { logCourse?.stop(); },
  onWordsGrant() {
    playerInventory.grant('toy_words_with_friends', 'debug');
    outfit.equip('toy', 'toy_words_with_friends');
  },
  onWordsBotGame() { tabletop?.debugStart(false, 'words'); },
  onWordsInvite()  { tabletop?.debugStart(true, 'words'); },
  onDiceGrant() {
    playerInventory.grant('toy_dice_with_friends', 'debug');
    outfit.equip('toy', 'toy_dice_with_friends');
  },
  onDiceBotGame() { tabletop?.debugStart(false, 'dice'); },
  onDiceInvite()  { tabletop?.debugStart(true, 'dice'); },
  onSetLineupAnim(s) { lineup.setAnim(s); },
  onReplayFtue() {
    if (!ftue || ftue.active || dodgeball?.active || logCourse?.active || lunch?.active || sumo?.active
      || zipline?.active || glider?.active) return;
    void ftue.start();
  },
});

/** Drop the player at a mode's gate (debug panel, or `?goto=<id>` on load). */
type GateId = 'dodgeball' | 'logCourse' | 'lunchDelivery' | 'sumo' | 'zipline' | 'ziplineLanding' | 'glider' | 'gliderLanding'
  | 'troopTent' | 'canteen' | 'canteenView' | 'mailbox' | 'board' | 'boardView' | 'campfire' | 'photoBooth' | 'myTent';
function goToGate(id: GateId): void {
  if (!playerRoot) return;
  const p = id === 'dodgeball' ? dodgeball?.gatePoint(new THREE.Vector3())
    : id === 'lunchDelivery' ? lunch?.gatePoint(new THREE.Vector3())
    : id === 'sumo' ? sumo?.gatePoint(new THREE.Vector3())
    : id === 'zipline' ? zipline?.mountPoint(new THREE.Vector3())
    : id === 'ziplineLanding' ? zipline?.landingPoint(new THREE.Vector3())
    : id === 'glider' ? glider?.mountPoint(new THREE.Vector3())
    : id === 'gliderLanding' ? glider?.landingPoint(new THREE.Vector3())
    : id === 'troopTent' ? troopTent?.gatePoint.clone().add(new THREE.Vector3(0, 0, 1.5)) // cancels the −1.5 below
    : id === 'canteen' ? canteen?.gatePoint.clone().add(new THREE.Vector3(0, 0, 1.5))
    : id === 'mailbox' ? mailbox?.gatePoint.clone().add(new THREE.Vector3(0, 0, 1.5))
    : id === 'photoBooth' ? photoBooth?.gatePoint.clone().add(new THREE.Vector3(0, 0, 1.5))
    : id === 'myTent' && campTents ? campTents.playerTentPosition().add(new THREE.Vector3(
      Math.sin(campTents.playerTentYaw) * 5, 0, Math.cos(campTents.playerTentYaw) * 5 + 1.5))
    : id === 'campfire' && campfire ? campfire.root.position.clone().add(new THREE.Vector3(0, 0, -5.5 + 1.5))
    : id === 'board' ? board?.gatePoint.clone().add(new THREE.Vector3(0, 0, 1.5))
    : id === 'boardView' && board ? board.gatePoint.clone().add(new THREE.Vector3(Math.sin(board.frontHeading) * 9, 0,
      Math.cos(board.frontHeading) * 9 + 1.5))
    : id === 'canteenView' ? canteen?.viewPoint(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 1.5))
    : logCourse?.startGatePoint(new THREE.Vector3());
  if (!p) return;
  playerRoot.position.set(p.x, p.y + 2, p.z - 1.5);
  lastGroundY = p.y;
  smoothYReady = false; camReady = false;
  snapToGround();
  // Dev: frame the Canteen from the plaza (camera behind you, looking at the serving window).
  if (id === 'canteenView' && canteen) { camHeading = canteen.frontHeading; tgtOrbitOff = 0; }
  if (id === 'mailbox' && mailbox) { camHeading = mailbox.frontHeading; tgtOrbitOff = 0; }
  if (id === 'myTent' && campTents) {
    camHeading = campTents.playerTentYaw; tgtOrbitOff = 0; playerRoot.rotation.y = campTents.playerTentYaw + Math.PI;
  }
  if (id === 'photoBooth' && photoBooth) {
    camHeading = photoBooth.frontHeading; tgtOrbitOff = 0; playerRoot.rotation.y = photoBooth.frontHeading + Math.PI;
  }
  // Dev: a few steps south of the fire, looking at it.
  if (id === 'campfire' && campfire) { camHeading = Math.PI; tgtOrbitOff = 0; playerRoot.rotation.y = 0; }
  // Dev: `board` stands you at it; `boardView` frames the board + mailbox from the plaza.
  if ((id === 'board' || id === 'boardView') && board) {
    camHeading = board.frontHeading; tgtOrbitOff = 0;
    playerRoot.rotation.y = board.frontHeading + Math.PI; // face it (the follow cam swings behind you)
  }
}

/** The FTUE's bird's-eye view is on (setWideView). */
let wideView = false;
/** While it is, the near plane scales with the camera's height: at 0.1 from ~300 up the depth
 * buffer can't separate near-coplanar ground (the beach sand over the valley floor z-fights
 * into green flicker), but the close shots either side (Counselor, your tent) still need 0.1. */
function wideViewNear(): void {
  if (!wideView) return;
  const h = camera.position.y - lastGroundY;
  const near = THREE.MathUtils.clamp(h * 0.08, 0.1, 20);
  if (Math.abs(near - camera.near) > 0.01) { camera.near = near; camera.updateProjectionMatrix(); }
}
const clock = new THREE.Clock();

// ── init ──────────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Preload Fredoka before anything draws text into a canvas (the log-course
  // signs bake their label into a texture in the LogCourse constructor). DOM
  // text swaps in on its own via @font-face; only canvas text needs this.
  try {
    await Promise.race([
      Promise.all([document.fonts.load("700 32px 'Fredoka'"), document.fonts.ready]),
      new Promise((r) => setTimeout(r, 2500)), // never block boot on a slow/failed font
    ]);
  } catch { /* fall back to system font */ }

  let worldResult: Awaited<ReturnType<typeof assembleStage>>;
  try {
    worldResult = await assembleStage(scene);
  } catch (e) {
    setReadouts([`STAGE ASSEMBLY FAILED: ${String(e)}`]);
    loadScreen.style.display = 'none';
    return;
  }
  collisionMeshes = worldResult.collisionMeshes;
  // Baked-terrain fixes (before anything samples the ground: palette, water, minigames, bots).
  collisionMeshes.push(...fixBeachRamp(worldResult.root));
  // Troop HQ tent off the main path — before anything (bots' ground cache) samples heights there.
  if (!relocateTroopTent(worldResult.root)) console.warn('[troop] HQ tent not found; left in place');
  // The Canteen storefront by the entrance plaza — its collider must be in before anything samples heights.
  canteen = Canteen.build(worldResult.root);
  if (canteen) collisionMeshes.push(...canteen.colliders);
  else console.warn('[canteen] camp chunk not found; no canteen');
  mailbox = Mailbox.build(worldResult.root);
  if (mailbox) collisionMeshes.push(...mailbox.colliders);
  // Everyone's tents at the three tent sites (they replace the yellow prop tent by the fire and its
  // path — drop those from the ground list first so the new tents stand on the grass).
  collisionMeshes = collisionMeshes.filter((m) => !CAMP_TENTS.replaces.includes(m.name));
  campTents = CampTents.build(worldResult.root, gameRoot, (x, z) => castGroundRay(x, z, 80, 200));
  if (campTents) {
    collisionMeshes.push(...campTents.colliders);
    const ct = campTents;
    ct.setPlayerName(gameSettings.get().playerName);
    gameSettings.subscribe((st) => ct.setPlayerName(st.playerName));
  } else console.warn('[tents] camp chunk not found; no tents');
  // World dressing: the living campfire (replaces the pit's static cone — before static batching),
  // the hero mountain (replaces the fogged-out GLB backdrop cones), sky-wide clouds and birds.
  campfire = Campfire.build(scene, worldResult.root);
  {
    const camp = worldResult.root.getObjectByName('chunk_0_camp');
    const site = TENT_SITES.find((st) => st.newFire);
    if (camp && site) {
      const at = new THREE.Vector3(site.centre[0], 0, site.centre[1]).applyMatrix4(camp.matrixWorld);
      at.y = castGroundRay(at.x, at.z, 80, 200) ?? at.y;
      beachFire = Campfire.at(scene, at);
    }
  }
  {
    const camp = worldResult.root.getObjectByName('chunk_0_camp');
    if (camp) {
      const campCentre = new THREE.Vector3(0, 0, 60).applyMatrix4(camp.matrixWorld);
      const north = new THREE.Vector3(0, 0, 1).transformDirection(camp.matrixWorld);
      campNorth = north.clone();
      const oldPeaks: import('three').Object3D[] = [];
      worldResult.root.traverse((o) => { if (/^prop_mtn_/.test(o.name)) oldPeaks.push(o); });
      oldPeaks.forEach((o) => o.parent?.remove(o));
      collisionMeshes = collisionMeshes.filter((m) => !/^prop_mtn_/.test(m.name));
      heroMountain = new HeroMountain(scene, campCentre, north);
      clouds.setCamp(campCentre, north);
      birds = new Birds(scene, campCentre);
      // Grass, flowers + sprigs on the camp's walkable grass (before static batching).
      const t0 = performance.now();
      dressing = new GroundDressing(scene, {
        campChunk: camp,
        groundMeshes: collisionMeshes.filter((m) => /^Camp_ground/.test(m.name)),
        blockers: collisionMeshes.filter((m) => !/^Camp_ground/.test(m.name)),
      });
      console.log(`[dressing] scattered in ${(performance.now() - t0).toFixed(0)} ms`);
      // Butterflies live around the flower clumps (fallback patches: plaza, campfire, Mail + Board corner).
      const fallback: [number, number][] = [[-10, 12], [10, 11], [-17, 23], [2, 34], [11, 42], [-6, 31], [16, 54]];
      const homes = dressing.clumps.length ? dressing.clumps
        : fallback.map(([x, z]) => ({ centre: new THREE.Vector3(x, 0, z).applyMatrix4(camp.matrixWorld) }));
      butterflies = new Butterflies(scene, homes, (x, z) => castGroundRay(x, z, 60, 200));
      motes = new AmbientMotes(scene, campCentre);
      applyWorldQuality();
    }
  }
  board = BulletinBoard.build(worldResult.root, () => ({ ...boardPaperData(), board: 'stars' }));
  if (board) collisionMeshes.push(...board.colliders);
  bulletin.subscribe(() => board?.papers.redraw());
  photoBooth = PhotoBooth.build(worldResult.root);
  if (photoBooth) {
    collisionMeshes.push(...photoBooth.colliders);
    const pb = photoBooth;
    const showNewest = () => pb.setDisplayPhotos(photoAlbum.photos.slice(0, 3).map((p) => p.image));
    showNewest();
    photoAlbum.subscribe(showNewest);
  } else console.warn('[photo booth] camp chunk not found; no booth');
  collisionMeshes.push(...addRampRails(worldResult.root, collisionMeshes)); // hiking rails (their collision slabs)
  // Forested mountain around the climb (+ invisible rims on the path's exposed edges).
  collisionMeshes.push(...buildMountainside(scene, worldResult.root, [...collisionMeshes]));
  // Vivid cartoon palette pass (mountains → periwinkle, juicier greens/earth).
  // Runs before the water system so any water-body materials it recolours are
  // still overridden by the water shaders that swap in next.
  richenPalette(worldResult.root);
  try {
    water = new WaterSystem(scene, worldResult.root);
  } catch (e) {
    console.warn('[water] setup failed:', e);
  }
  try {
    logCourse = new LogCourse(scene, worldResult.root, renderer.domElement, gameRoot, {
      onStart() {
        campPass.recordMinigame('logCourse', 'play');
        kodak.begin('the Log Course');
        campHud.hide();
        joystick.setVisible(false);
        actionBtn.setVisible(false); // chat + emote stay for taunting
        leaveBtn.show({ name: 'the Log Course', onLeave: () => logCourse?.stop() });
        camHeading = logCourse!.pose.facing + Math.PI;
        tgtOrbitOff = 0;
        camReady = false;
        bots?.setInterest('log_course', 3);
      },
      onEnd() {
        kodak.end();
        campHud.show();
        leaveBtn.hide();
        bots?.setInterest('log_course', 1);
        joystick.setVisible(true);
        actionBtn.setVisible(true);
        if (!playerRoot) return;
        lastGroundY   = playerRoot.position.y - params.footOffset;
        smoothedFrogY = playerRoot.position.y;
        smoothYReady  = true;
        grounded = true;
        heightAboveGround = 0; jumpVelY = 0; airborne = false;
      },
    });
  } catch (e) {
    console.warn(String(e));
  }
  try {
    // Zipline from the fork at the top of the climb down to the beach (+ its construction blockers).
    zipline = new Zipline(scene, worldResult.root, {
      groundAt: (x, z, fromY) => castGroundRay(x, z, fromY, 200),
      riderHeight: () => frogHeight * params.frogScale,
      dustBurst: (x, y, z, n) => dust.burst(x, y, z, params.frogScale, n),
      onStart() {
        joystick.setVisible(false);
        actionBtn.setVisible(false);
        chatBtn.setVisible(false);
        emoteBtn.setVisible(false);
        toyBtn.setVisible(false);
        campHud.setPrompt(null);
        playSpringBoing(0.5);
        campPass.recordRide('zipline');
        zipCounselor?.say('Have fun!! 🎉');
        kodak.begin('the Zipline');
        rideSnapT = 0;
      },
      onEnd(landing) {
        joystick.setVisible(true);
        actionBtn.setVisible(true);
        chatBtn.setVisible(true);
        emoteBtn.setVisible(true);
        toyBtn.setVisible(true);
        kodak.end();
        if (!playerRoot) return;
        playerRoot.position.set(landing.x, landing.y + params.footOffset, landing.z);
        playerRoot.rotation.set(0, playerRoot.rotation.y, 0);
        lastGroundY = landing.y;
        smoothedFrogY = playerRoot.position.y;
        smoothYReady = true;
        grounded = true;
        heightAboveGround = 0; jumpVelY = 0; airborne = false;
        playHopPop(0.7);
      },
    });
    collisionMeshes.push(...zipline.colliders);
    // A counselor minding the zipline at the top (marker baked into chunk_fork).
    const post = worldResult.root.getObjectByName('npc_zipline');
    if (post) {
      const at = post.getWorldPosition(new THREE.Vector3());
      const facing = new THREE.Euler().setFromQuaternion(post.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      zipCounselor = await CampNpc.create(scene, gameRoot, chat, {
        id: 'zipline_counselor', name: 'Counselor Zippy', tag: '<Camp Counselor>',
        species: COUNSELOR.species, scale: COUNSELOR.scale, position: at, facing,
        greetLine: 'Want to ride? 🪂', greetRadius: 11.5, rearmRadius: 16,
      });
    }
  } catch (e) {
    console.warn('[zipline] setup failed:', e);
  }
  try {
    // Hang glider from the top of the steep branch climb down to the cabins by the log course.
    const campChunk = worldResult.root.getObjectByName('chunk_0_camp')!;
    glider = new Glider(scene, worldResult.root, {
      groundAt: (x, z, fromY) => castGroundRay(x, z, fromY, 200),
      riderHeight: () => frogHeight * params.frogScale,
      campToWorld: (x, z, out) => out.set(x, 0, z).applyMatrix4(campChunk.matrixWorld),
      dustBurst: (x, y, z, n) => dust.burst(x, y, z, params.frogScale, n),
      onStart() {
        actionBtn.setVisible(false);
        chatBtn.setVisible(false);
        emoteBtn.setVisible(false); // the joystick stays: it steers
        toyBtn.setVisible(false);
        campHud.setPrompt(null);
        playSpringBoing(0.5);
        campPass.recordRide('glider');
        glideCounselor?.say('Steer with the stick! Wheee! 🪁');
        kodak.begin('the Hang Glider');
        rideSnapT = 0;
      },
      onEnd(at) {
        actionBtn.setVisible(true);
        chatBtn.setVisible(true);
        emoteBtn.setVisible(true);
        toyBtn.setVisible(true);
        kodak.end();
        if (!playerRoot) return;
        playerRoot.position.set(at.x, at.y + params.footOffset, at.z);
        playerRoot.rotation.set(0, playerRoot.rotation.y, 0);
        lastGroundY = at.y;
        smoothedFrogY = playerRoot.position.y;
        smoothYReady = true;
        grounded = true;
        heightAboveGround = 0; jumpVelY = 0; airborne = false;
        playHopPop(0.7);
      },
    });
    collisionMeshes.push(...glider.colliders);
    const post = worldResult.root.getObjectByName('npc_glider');
    if (post) {
      const at = post.getWorldPosition(new THREE.Vector3());
      const facing = new THREE.Euler().setFromQuaternion(post.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      glideCounselor = await CampNpc.create(scene, gameRoot, chat, {
        id: 'glider_counselor', name: 'Counselor Swoop', tag: '<Camp Counselor>',
        species: COUNSELOR.species, scale: COUNSELOR.scale, position: at, facing,
        greetLine: 'Ready to fly? 🪁', greetRadius: 11.5, rearmRadius: 16,
      });
    }
  } catch (e) {
    console.warn('[glider] setup failed:', e);
  }
  try {
    dodgeball = new Dodgeball(scene, worldResult.root, gameRoot, {
      dustBurst: (x, y, z, scale, n) => dust.burst(x, y, z, scale, n),
      onPlayerWin: () => {
        playMinigameWin(); campPass.recordMinigame('dodgeball', 'win');
        kodak.moment('Dodge Ball Champs!', KODAK_SCORE.win, 500);
      },
      onPlayerPlay: (play) => {
        if (play === 'catch') kodak.moment('Nice Catch!', KODAK_SCORE.catch, 150);
        else kodak.moment('Direct Hit!', KODAK_SCORE.directHit, 120);
      },
      // Lands just after the hit/catch sound rather than on top of it.
      onPlayerOut: () => playMinigameFail(0.35),
      onPlayerLose: () => playMinigameLose(),
      onStart() {
        campPass.recordMinigame('dodgeball', 'play');
        kodak.begin('Dodge Ball');
        campHud.hide();
        actionBtn.setVisible(false);
        setChatLayout('raised'); // chat + emote stay for taunting, above THROW
        leaveBtn.show({ name: 'Dodge Ball', onLeave: () => dodgeball?.stop() });
        bots?.setVisible(false); // hide camp crowd during the match (their bubbles hide with them)
        bots?.setNameplatesVisible(false);
        tgtOrbitOff = 0;
        camReady = false;
      },
      onEnd() {
        kodak.end();
        campHud.show();
        actionBtn.setVisible(true);
        setChatLayout('camp');
        leaveBtn.hide();
        bots?.setVisible(params.showBots);
        bots?.setNameplatesVisible(params.showNameplates);
        camReady = false;
        // Drop the human just outside the court and re-ground.
        if (playerRoot && dodgeball) {
          dbReturnPos = dodgeball.exitPoint(new THREE.Vector3());
          playerRoot.position.copy(dbReturnPos);
          lastGroundY = dbReturnPos.y;
          smoothYReady = false;
          heightAboveGround = 0; jumpVelY = 0; airborne = false;
          snapToGround();
        }
      },
    });
  } catch (e) {
    console.warn('[dodgeball] setup failed:', e);
  }
  try {
    sumo = new Sumo(scene, worldResult.root, gameRoot, {
      chat, charScale: () => params.frogScale, footOffset: () => params.footOffset,
    }, {
      dustBurst: (x, y, z, scale, n) => dust.burst(x, y, z, scale, n),
      onPlayerWin: () => { playMinigameWin(); campPass.recordMinigame('sumo', 'win'); },
      onPlayerLose: () => playMinigameLose(),
      // Ring out: lands just after the impact pop.
      onPlayerOut: () => playMinigameFail(0.15),
      onStart() {
        campPass.recordMinigame('sumo', 'play');
        kodak.begin('the Sumo Ring');
        campHud.hide();
        joystick.setVisible(false);
        actionBtn.setVisible(false); // chat + emote stay for taunting
        bots?.setInterest('sumo', 3); // the camp crowd comes to watch
        // Knocked out and spectating: nothing to lose, so no "are you sure?".
        leaveBtn.show({ name: 'Sumo', onLeave: () => sumo?.stop(), confirm: () => !!sumo?.playerInRing });
        if (bots) bots.pesterPaused = true;
      },
      onEnd() {
        kodak.end();
        campHud.show();
        joystick.setVisible(true);
        actionBtn.setVisible(true);
        leaveBtn.hide();
        bots?.setInterest('sumo', 1);
        if (bots) bots.pesterPaused = false;
        // Back outside the ring, facing it.
        if (playerRoot && sumo) {
          const p = sumo.exitPoint(new THREE.Vector3());
          const c = sumo.centre(new THREE.Vector3());
          teleportPlayer(p, Math.atan2(c.x - p.x, c.z - p.z));
        }
      },
    });
  } catch (e) {
    console.warn('[sumo] setup failed:', e);
  }
  try {
    lunch = new LunchDelivery({
      scene, stageRoot: worldResult.root, container: gameRoot, collisionMeshes,
      charScale: () => params.frogScale, footOffset: () => params.footOffset,
      playerName: () => gameSettings.get().playerName,
      quiet: () => !!ftue?.active, // no "… started a Lunch Delivery!" during the first-time arrival
      // Campers near the cart hop in (only asked while you're playing).
      recruit: (near, radius) => {
        const b = bots?.findFreeBotNear(near, radius);
        if (!b || !bots) return null;
        const mgr = bots;
        return { name: b.profile.name, profile: b.profile, root: b.root, height: b.height, borrow: (pose) => mgr.borrow(b, pose) };
      },
    }, {
      dustBurst: (x, y, z, scale, n) => dust.burst(x, y, z, scale, n),
      onPlayerWin: () => {
        playMinigameWin(); campPass.recordMinigame('lunchDelivery', 'win');
        kodak.moment('Lunch Delivered!', KODAK_SCORE.win, 500);
      },
      onPlayerSquash: (kind) => kodak.moment(kind === 'wasp' ? 'Wasp Whacker!' : 'Bug Squasher!',
        KODAK_SCORE.bugSquash + (kind === 'wasp' ? 12 : kind === 'maggot' ? 8 : 0), 80),
      onPlayerLose: () => playMinigameLose(),
      // Taken out by the bugs — lands just after the hurt blip.
      onPlayerDown: () => playMinigameFail(0.15),
      onRespawn: (pos, yaw) => teleportPlayer(pos, yaw),
      // Campers gather at the beach picnic while lunch is on its way / out on the tables.
      onFeast: (on) => bots?.setInterest('lunch_delivery', on || lunch?.running ? (lunch?.active ? 4 : 3) : 1),
      // A run (crew-only or with you): campers come watch along the route / at the picnic.
      onRun: (on) => bots?.setInterest('lunch_delivery', on ? (lunch?.active ? 4 : 3) : lunch?.feastOn ? 3 : 1),
      onStart() {
        campPass.recordMinigame('lunchDelivery', 'play');
        kodak.begin('Lunch Delivery');
        // Usual free-roam controls + camera; jump stays, chat/emote move up clear of ATTACK.
        campHud.hide();
        setChatLayout('raised');
        // Below the lunch meter panel; the crew keeps delivering without you.
        leaveBtn.show({ name: 'the Lunch Delivery', top: 104, onLeave: () => lunch?.leave() });
        bots?.setInterest('lunch_delivery', 4);
        if (bots) bots.pesterPaused = true;
      },
      onEnd(won) {
        kodak.end();
        campHud.show();
        setChatLayout('camp');
        leaveBtn.hide();
        if (bots) bots.pesterPaused = false;
        // Left while knocked out: stand back up (the down pose tipped playerRoot over).
        if (playerRoot) playerRoot.rotation.set(0, new THREE.Euler().setFromQuaternion(playerRoot.quaternion, 'YXZ').y, 0);
        void won; // interest is settled by onRun / onFeast
      },
    });
  } catch (e) {
    console.warn('[lunch] setup failed:', e);
  }
  const { centre, box } = worldResult;
  // Chunk spawn: on the first chunk's path, ground at Y = 0.
  params.spawnX = worldResult.spawn.x;
  params.spawnZ = worldResult.spawn.z;
  const wSize = new THREE.Vector3();
  box.getSize(wSize);

  try {
    playerRoot = new THREE.Group();
    playerRoot.name = 'player';
    scene.add(playerRoot);
    await setPlayerCharacter(gameSettings.get().character);
    const root = playerRoot;
    chat.register({
      actor: PLAYER_ACTOR,
      loadout: playerLoadout,
      anchor: (out) => out.copy(root.position).setY(root.position.y + frogHeight * root.scale.y + 0.35), // scale.y: sumo draws you bigger
    });
  } catch (e) {
    setReadouts([`FROG LOAD FAILED: ${String(e)}`]);
    loadScreen.style.display = 'none';
    return;
  }

  // Use params.spawnX/Z (set in debug-panel defaults or by user).
  // Seed lastGroundY from the known spawn Y hint so the ray starts above it.
  const SPAWN_Y_HINT = worldResult.spawn.y; // chunk ground is at Y = 0
  lastGroundY = SPAWN_Y_HINT;

  // Place frog at spawn, raycast ground immediately
  playerRoot.position.set(params.spawnX, SPAWN_Y_HINT + 50, params.spawnZ);
  const spawnHit = castGroundRay(params.spawnX, params.spawnZ, SPAWN_Y_HINT + 100, 200);
  const spawnY = spawnHit !== null ? spawnHit + params.footOffset : SPAWN_Y_HINT;
  playerRoot.position.y = spawnY;
  smoothedFrogY  = spawnY;
  smoothYReady   = true;
  lastGroundY    = spawnHit ?? centre.y;
  grounded       = spawnHit !== null;

  // Frog always upright — zero any baked rotation
  playerRoot.rotation.x = 0;
  playerRoot.rotation.z = 0;

  markerMesh.position.set(params.spawnX, spawnY + 3, params.spawnZ);
  playerRoot.scale.setScalar(params.frogScale);

  // Seed camera heading from frog's initial facing
  camHeading = playerRoot.rotation.y + Math.PI;
  camReady   = false; // will snap on first animate() frame

  setReadouts([
    `frog loaded  height: ${frogHeight.toFixed(2)}u`,
    `terrain: ${wSize.x.toFixed(1)} x ${wSize.y.toFixed(1)} x ${wSize.z.toFixed(1)}`,
    `spawn ground: ${spawnHit !== null ? spawnHit.toFixed(2) : 'NO HIT'}`,
    `collision meshes: ${collisionMeshes.length}`,
  ]);

  // Fake multiplayer: failure here shouldn't block play.
  try {
    const rides: BotRideSpot[] = [];
    if (zipline?.ready) {
      const z = zipline;
      rides.push({ hotspot: 'zip_top', after: 'recycle', begin: (from, h) => z.startBot(from, h),
        onBegin: () => { if (Math.random() < 0.5) zipCounselor?.say('Have fun!! 🎉'); } });
    }
    if (glider?.ready) {
      const g = glider;
      rides.push({ hotspot: 'glide_top', after: 'decide', begin: (from, h) => g.startBot(from, h),
        onBegin: () => { if (Math.random() < 0.5) glideCounselor?.say('Wheee! 🪁'); } });
    }
    bots = await BotManager.create({
      scene, stageRoot: worldResult.root, collisionMeshes, container: gameRoot, logCourse, chat, rides, sumo,
    });
  } catch (e) {
    console.warn('[bots] spawn failed:', e);
  }
  if (bots) setupTabletop(bots);
  setupBalls();

  // Walk-up game-mode gates (each mode owns where its gate is) → floating "Play <mode>" button.
  if (dodgeball) gates.add({ id: 'dodgeball', label: 'Dodge Ball', position: dodgeball.gatePoint(new THREE.Vector3()), radius: 3.0 });
  if (logCourse) gates.add({ id: 'logCourse', label: 'Log Course', position: logCourse.startGatePoint(new THREE.Vector3()), radius: 3.5 });
  if (lunch) gates.add({ id: 'lunchDelivery', label: 'Lunch Delivery', position: lunch.gatePoint(new THREE.Vector3()), radius: 3.5 });
  if (sumo) {
    // The entrance on the camp path, or anywhere you're up against the ring's edge.
    const s = sumo, gate = s.gatePoint(new THREE.Vector3());
    gates.add({
      id: 'sumo', label: 'Sumo', position: gate, radius: 3.0,
      // Within 1.5 of the spectator line shows the button (the radius is 3), and it
      // hides again past ~2.25 (radius + exit margin).
      distance: (p) => Math.min(Math.hypot(p.x - gate.x, p.z - gate.z), s.edgeDistance(p.x, p.z) + 1.5),
    });
  }

  // Floating arrows over each minigame / activity start spot, for campers wandering by.
  const ENTRY_SIGN_LIFT = 5;
  const markSpot = (p: import('three').Vector3 | undefined, hideWithin: number, lift = 0) => {
    if (!p) return;
    const y = castGroundRay(p.x, p.z, p.y + 2, 6); // settle on the deck / ground right under the spot
    startMarkers.add(new THREE.Vector3(p.x, y ?? p.y, p.z), hideWithin, lift);
  };
  markSpot(dodgeball?.gatePoint(new THREE.Vector3()), 3.0, ENTRY_SIGN_LIFT); // clear the arch signs
  markSpot(logCourse?.startGatePoint(new THREE.Vector3()), 3.5, ENTRY_SIGN_LIFT);
  markSpot(lunch?.gatePoint(new THREE.Vector3()), 3.5);
  markSpot(sumo?.gatePoint(new THREE.Vector3()), 3.0);
  if (zipline?.ready) markSpot(zipline.mountPoint(new THREE.Vector3()), 2.5);
  if (glider?.ready) markSpot(glider.mountPoint(new THREE.Vector3()), 2.5);

  // Troop HQ: walk up to the red campsite tent → "Scout Troop" button → the troop screen.
  try {
    troopTent = await TroopTent.create(scene, worldResult.root, gameRoot, chat);
    const t = troopTent;
    if (t) gates.add({ id: 'troop', label: 'Scout Troop', position: t.gatePoint, radius: t.reach, distance: (p) => t.distance(p) });
  } catch (e) {
    console.warn('[troop] tent hub setup failed:', e);
  }

  // Canteen: walk up to the serving window → "Browse Shop" / "Get Care Package".
  if (canteen) {
    const c = canteen;
    gates.add({ id: 'canteen', label: 'Canteen', position: c.gatePoint, radius: c.reach, distance: (p) => c.distance(p) });
    c.addCounselor(scene, gameRoot, chat).catch((e) => console.warn('[canteen] counselor failed:', e));
  }

  // Your own tent: walk up → "Customize Tent" (the Customize screen on its Tent tab).
  if (campTents) {
    const ct = campTents;
    gates.add({ id: 'myTent', label: 'Customize Tent', position: ct.playerTentPosition(), radius: ct.reach,
      distance: (p) => ct.distanceToPlayerTent(p) });
  }

  // Mr Kodak's Photo Booth: walk up → "Post Cards".
  if (photoBooth) {
    const pb = photoBooth;
    gates.add({ id: 'photoBooth', label: 'Post Cards', position: pb.gatePoint, radius: pb.reach, distance: (p) => pb.distance(p) });
    pb.addCounselor(scene, gameRoot, chat).catch((e) => console.warn('[photo booth] Mr Kodak failed:', e));
  }

  // Mail + Bulletin Board corner: they stand side by side and share one walk-up spot —
  // near either one floats both buttons ("Bulletin Board" / "Check Mail").
  if (mailbox || board) {
    const m = mailbox, b = board;
    const dist = (p: import('three').Vector3) => Math.min(
      m ? m.distance(p) - m.reach : Infinity, b ? b.distance(p) - b.reach : Infinity);
    gates.add({ id: 'corner', label: 'Camp Mail', position: (b ?? m)!.gatePoint, radius: 0, distance: dist });
  }
  placeDiscoverySpots(worldResult.root);

  // First-time arrival (greeting crowd → name + chonk → walk in → Counselor).
  try {
    ftue = new Ftue({
      container: gameRoot, scene, camera, player: playerRoot,
      playerHeight: () => frogHeight * params.frogScale,
      groundAt: (x, z) => castGroundRay(x, z, lastGroundY + 40, 200),
      followCam: (heading, outPos, outLook) => {
        const p = playerRoot!.position;
        outPos.set(p.x + Math.sin(heading) * params.camDist,
          p.y + params.camHeight + Math.sin(orbitPitch) * params.camDist * 0.4,
          p.z + Math.cos(heading) * params.camDist);
        outLook.set(p.x, p.y + params.camLookY, p.z);
      },
      setControlsVisible: (v) => {
        if (v) campHud.show(); else campHud.hide();
        joystick.setVisible(v);
        actionBtn.setVisible(v);
        chatBtn.setVisible(v);
        emoteBtn.setVisible(v);
        toyBtn.setVisible(v);
      },
      currentName: () => gameSettings.get().playerName,
      currentCharacter: () => gameSettings.get().character,
      playable: (id) => id in CHONK_SPECIES,
      applyProfile: async (name, id) => {
        gameSettings.set({ playerName: name, character: id });
        await setPlayerCharacter(id);
      },
      dustBurst: (x, y, z, n) => dust.burst(x, y, z, params.frogScale, n),
      tentSites: () => campTents?.sitePoints() ?? [],
      chooseTentSite: (id) => {
        campTents?.setPlayerSite(id as TentSiteId);
        return campTents?.playerTentPosition() ?? playerRoot!.position.clone();
      },
      // The bird's-eye tent picker sees the whole camp: push the fog + far plane out for it (the near
      // plane follows the camera's height meanwhile — see wideViewNear).
      setWideView: (on) => {
        wideView = on;
        const fog = scene.fog as InstanceType<typeof THREE.Fog>;
        fog.near = on ? 700 : 110;
        fog.far = on ? 1800 : 340;
        camera.near = 0.1;
        camera.far = on ? 2600 : 600;
        camera.updateProjectionMatrix();
      },
      onFinish: (heading) => {
        if (!playerRoot) return;
        camHeading = heading;
        tgtOrbitOff = 0;
        camPos.copy(camera.position);
        camReady = true;
        lastGroundY = playerRoot.position.y - params.footOffset;
        smoothedFrogY = playerRoot.position.y;
        smoothYReady = true;
        grounded = true;
        heightAboveGround = 0; jumpVelY = 0; airborne = false;
      },
    });
    await ftue.setup(worldResult.root, bots);
    // First arrival waits for "Enter Camp" when the title screen is up.
    if (Ftue.shouldRun()) { if (TITLE_WANTED) pendingFtue = true; else void ftue.start(); }
  } catch (e) {
    console.warn('[ftue] setup failed:', e);
    ftue?.finish();
  }

  // Last: fold the stage's small static props into a few draw calls (every system above has
  // already looked up the meshes it needs by name).
  try {
    let folded = batchStatic(scene, worldResult.root, collisionMeshes);
    // Big static groups built at runtime (hundreds of fence posts / rails / hoarding panels).
    for (const name of ['river_fence', 'beach_construction_fence', 'zipline_landing_tower']) {
      folded += mergeGroup(scene.getObjectByName(name));
    }
    console.log(`[perf] static batching folded ${folded} meshes`);
  } catch (e) {
    console.warn('[perf] static batching skipped:', e);
  }

  // Dev deep link: ?goto=zipline (etc.) starts you at that spot.
  const goto = new URLSearchParams(location.search).get('goto') as GateId | null;
  if (goto && !ftue?.active) goToGate(goto);
  // Dev: ?board=1 opens the Bulletin Board close-up (?board=map|news|ranks|challenge focuses a notice).
  const boardParam = new URLSearchParams(location.search).get('board');
  if (boardParam && !ftue?.active) {
    setTimeout(() => openBulletin(['map', 'news', 'ranks', 'challenge'].includes(boardParam)
      ? boardParam as import('./bulletin/papers').PaperKind : undefined), 400);
  }

  animate();
  // After the publisher splash: the title comes up under the loading screen, which then fades away.
  void loading.splashDone.then(() => {
    if (TITLE_WANTED) enterTitleMode();
    loading.hide();
  });
}

/** The big balls anyone kicks by running into them: a beach ball on the beach, a soccer ball by the fire. */
function setupBalls(): void {
  const fires = [campfire, beachFire].filter((f): f is Campfire => !!f).map((f) => f.root.getWorldPosition(new THREE.Vector3()));
  /** Out in the open by a site's fire: `gap` past the fire on the side away from that site's tents. */
  const byFire = (fire: Campfire | null, site: TentSiteId, gap: number) => {
    const at = fire?.root.getWorldPosition(new THREE.Vector3());
    const tents = campTents?.sitePoints().find((s) => s.id === site)?.pos;
    if (!at) return null;
    const away = tents ? at.clone().sub(tents).setY(0) : new THREE.Vector3(1, 0, 0);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    return at.addScaledVector(away.normalize(), gap);
  };
  const kickerList = (out: Kicker[]) => {
    const foot = params.footOffset;
    if (playerRoot?.visible) {
      out.push({ id: PLAYER_ACTOR.id, feet: playerRoot.position.clone().setY(playerRoot.position.y - foot),
        radius: 0.4 * params.frogScale, height: frogHeight * params.frogScale });
    }
    if (bots && params.showBots && !dodgeball?.active) {
      for (const b of bots.bots) {
        if (!b.root.visible) continue;
        out.push({ id: b.profile.memberId, feet: b.root.position.clone().setY(b.root.position.y - foot),
          radius: 0.4 * b.root.scale.x, height: b.height * b.root.scale.x });
      }
    }
  };
  balls = new CampBalls({
    scene, bots,
    charScale: () => params.frogScale,
    groundAt: (x, z, fromY) => castGroundRay(x, z, fromY, 20),
    waterAt: (x, z) => water?.sampleWater(x, z)?.surfaceY ?? null,
    // Bounces off the minigames' play areas, board games and the campfires themselves.
    blocked: (x, z) => !!logCourse?.inPlayArea(x, z) || !!dodgeball?.inPlayArea(x, z) || !!sumo?.inPlayArea(x, z)
      || !!tabletop?.blocks(x, z) || fires.some((f) => Math.hypot(x - f.x, z - f.z) < 2.2),
    kickers: kickerList,
    listener: () => playerRoot?.position ?? camera.position,
  });
  const beach = byFire(beachFire, 'beach', 7), fireside = byFire(campfire, 'campfire', 7.5);
  if (beach) balls.add(beachBall((v) => playHopPop(v)), beach);
  if (fireside) balls.add(soccerBall((v) => playPunch(v * 0.45)), fireside);
  (window as unknown as { __balls: unknown }).__balls = balls; // dev: poke from the console
}

/** Board games on the ground: yours (the game toys) and the bots' (see tabletop/tabletop.ts). */
function setupTabletop(mgr: BotManager): void {
  tabletop = new Tabletop({
    scene, container: gameRoot, canvas: renderer.domElement, bots: mgr, chat,
    charScale: () => params.frogScale,
    groundAt: (x, z, fromY) => castGroundRay(x, z, fromY, 12),
    // Open ground only: no water, no minigame play areas, not the lunch cart.
    siteOk: (x, z) => !water?.sampleWater(x, z) && !logCourse?.inPlayArea(x, z) && !dodgeball?.inPlayArea(x, z)
      && !sumo?.inPlayArea(x, z) && !sumo?.blocks(x, z) && !lunch?.blocks(x, z, x, z),
    player: () => (playerRoot ? { pos: playerRoot.position, yaw: playerRoot.rotation.y } : null),
    playerName: () => gameSettings.get().playerName,
    playerFree: () => !overlayOpen() && !ftue?.active && !logCourse?.active && !dodgeball?.active && !sumo?.active
      && !lunch?.active && !lunch?.humanDown && !zipline?.active && !glider?.active,
    quiet: () => !!ftue?.active,
    teleportPlayer,
    onHumanSeated: (seated, game, leave, confirmLeave) => {
      // Zoomed in on the board: no camp HUD or thumb controls, and no need to see yourself.
      if (seated) campHud.hide(); else campHud.show();
      campHud.setPrompt(null);
      joystick.setVisible(!seated); // hides the floating stick's touch zone too, so the board gets every tap
      for (const b of [actionBtn, chatBtn, emoteBtn, toyBtn]) b.setVisible(!seated);
      if (seated) leaveBtn.show({ name: game, onLeave: leave, confirm: confirmLeave });
      else leaveBtn.hide();
      if (playerRoot) playerRoot.visible = !seated;
      if (!seated && playerRoot) { camHeading = playerRoot.rotation.y + Math.PI; tgtOrbitOff = 0; camReady = false; }
    },
  });
  (window as unknown as { __tabletop: unknown }).__tabletop = tabletop; // dev: poke from the console
}

/** Bots, nameplates and speech bubbles; runs after the camera is placed each frame. */
function updateBots(dt: number): void {
  if (!playerRoot) return;
  if (bots) {
    bots.scale = params.frogScale;
    bots.footOffset = params.footOffset;
    bots.setVisible(params.showBots);
    bots.setNameplatesVisible(params.showNameplates);
    bots.setNavDebugVisible(params.showBotNav);
    const tb = perfStart();
    bots.update(dt, camera, playerRoot.position);
    perfEnd('bots', tb);
  }
  dodgeball?.updateNameplates(camera, params.showNameplates);
  sumo?.updateNameplates(camera, params.showNameplates);
  ftue?.updateAmbient(dt, camera, playerRoot.position);
  zipCounselor?.update(dt, camera, playerRoot.position, !!zipline?.active || !!ftue?.active);
  glideCounselor?.update(dt, camera, playerRoot.position, !!glider?.active || !!ftue?.active);
  troopTent?.update(dt, camera, playerRoot.position, !!ftue?.active);
  canteen?.update(dt, camera, playerRoot.position, !!ftue?.active);
  campTents?.update(dt, camera, params.showNameplates);
  if (photoBooth) { photoBooth.setAlert(photoAlbum.unseenCount > 0); photoBooth.update(dt, camera, playerRoot.position, !!ftue?.active); }
  if (mailbox) { mailbox.setHasMail(dailyRewards.canClaim); mailbox.update(dt, playerRoot.position); }
  if (board) {
    board.setAlert(bulletin.hasAlert);
    board.update(dt);
    // Map: shot once the first time you come near (the world is fully built by then).
    if (!campMap && !ftue?.active && playerRoot.position.distanceTo(board.worldCentre) < 45) captureBoardMap();
    // Timers on the notices ("New challenge in…", "Resets in…") + your spot on the map.
    if ((boardPaperTimer -= dt) <= 0) { boardPaperTimer = 30; board.papers.redraw(); }
  }
  const tc = perfStart();
  chat.update(dt, camera, playerRoot.position);
  perfEnd('chat', tc);
}

// ── Camera placement (shared by free roam and the log course) ────────────────
const COURSE_CAM_FOLLOW = 4;

function placeCamera(dt: number): void {
  if (!playerRoot) return;
  // ── Camera position ───────────────────────────────────────────────────────
  const desiredCamX = playerRoot.position.x + Math.sin(camHeading) * params.camDist;
  const desiredCamY = playerRoot.position.y + params.camHeight + Math.sin(orbitPitch) * params.camDist * 0.4;
  const desiredCamZ = playerRoot.position.z + Math.cos(camHeading) * params.camDist;
  const desiredCamPos = new THREE.Vector3(desiredCamX, desiredCamY, desiredCamZ);

  if (!camReady) {
    camPos.copy(desiredCamPos);
    camReady = true;
  } else {
    // Frame-rate-independent exponential damping (ENGINE.md): a genuine, smooth
    // follow with a subtle premium lag instead of the old formula that
    // collapsed to an ~instant, rigid snap at 60fps. camPosSmooth maps 0→snappy,
    // 1→floaty.
    const posK = THREE.MathUtils.lerp(20, 4, params.camPosSmooth);
    camPos.lerp(desiredCamPos, 1 - Math.exp(-posK * dt));
  }

  camera.position.copy(camPos);
  camera.lookAt(playerRoot.position.x, playerRoot.position.y + params.camLookY, playerRoot.position.z);

  // ── Sun follows player ────────────────────────────────────────────────────
  rig.directionalLight.position.set(
    playerRoot.position.x + 20, playerRoot.position.y + 40, playerRoot.position.z + 15,
  );
  rig.directionalLight.target.position.copy(playerRoot.position);
  rig.directionalLight.target.updateMatrixWorld();
}

/** Mr Kodak on a ride: after it gets going, a snap attempt every half second, scored by
 * how high above the ground you are (he keeps the best). */
function rideSnap(dt: number, caption: string, pos: import('three').Vector3): void {
  rideSnapT += dt;
  if (rideSnapT < 1.2 || (rideSnapGap -= dt) > 0) return;
  rideSnapGap = 0.5;
  const ground = castGroundRay(pos.x, pos.z, pos.y, 300);
  const height = ground === null ? 0 : pos.y - ground;
  kodak.moment(caption, KODAK_SCORE.ride + Math.min(40, height * 1.5));
}

// ── Render loop ───────────────────────────────────────────────────────────────
// ── Title screen (main menu over the live camp) ───────────────────────────────
// A slow camera drifts round the campfire (fire flickering, butterflies about) with the HUD,
// the player, campers and every name / bubble layer hidden; "Enter Camp" hands over to the
// normal follow camera with a short blend. Dev deep links (?goto, ?board) and ?notitle skip it.
const TITLE_WANTED = !['goto', 'board', 'notitle'].some((k) => new URLSearchParams(location.search).has(k));
/** The shot (tuned live with ?debug → __title.shot): the tent-site fire in the foreground, tents on the
 * left, the path leading off to the snowy peak top-left — the title art's composition. */
const TITLE_SHOT = { fov: 62, dist: 12.5, side: -2.4, height: 3.2, lookAhead: 6, lookUp: 1.4, sway: 0.1, swaySpeed: 0.16 };
let campNorth: import('three').Vector3 | null = null;
let title: { screen: TitleScreen; t: number; fire: import('three').Vector3; dir: import('three').Vector3; side: import('three').Vector3 } | null = null;
let pendingFtue = false;
const enterBlend = { start: -1, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion() };
const ENTER_BLEND_MS = 950;

function setTitleWorld(on: boolean): void {
  if (playerRoot) playerRoot.visible = !on;
  for (const o of scene.children) if (o.name.startsWith('ball_')) o.visible = !on; // the kickable balls roll into shot
  bots?.setVisible(!on && params.showBots);
  bots?.setNameplatesVisible(!on && params.showNameplates);
  gameRoot.classList.toggle("chonk-title-mode", on); // hides every DOM layer but the canvas + title
  if (on) campHud.hide(); else campHud.show();
  joystick.setVisible(!on);
  for (const b of [actionBtn, chatBtn, emoteBtn, toyBtn]) b.setVisible(!on);
}

function enterTitleMode(): void {
  if (!document.getElementById('chonk-title-style')) {
    const st = document.createElement('style');
    st.id = 'chonk-title-style';
    st.textContent = '#game.chonk-title-mode > :not(canvas):not(.chonk-title):not(.chonk-loading) { visibility: hidden !important; }';
    document.head.appendChild(st);
  }
  const fire = campfire?.root.getWorldPosition(new THREE.Vector3()) ?? playerRoot?.position.clone() ?? new THREE.Vector3();
  // Look from the fire towards the big snowy mountain (camp north if it isn't built).
  const peakBox = heroMountain ? new THREE.Box3().setFromObject(heroMountain.root) : null;
  const peak = peakBox && !peakBox.isEmpty() ? peakBox.getCenter(new THREE.Vector3()) : undefined;
  const dir = (peak ? peak.clone().sub(fire) : (campNorth ?? new THREE.Vector3(0, 0, 1)).clone()).setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  title = { screen: new TitleScreen(gameRoot, leaveTitle), t: 0, fire, dir, side };
  // Dev (?debug): tune the shot live — __title.shot.dist = 20 etc.
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __title?: unknown }).__title = { shot: TITLE_SHOT, camera, fire, dir };
  setTitleWorld(true);
}

function leaveTitle(): void {
  if (!title) return;
  title.screen.hide();
  title = null;
  setTitleWorld(false);
  enterBlend.fromPos.copy(camera.position);
  enterBlend.fromQuat.copy(camera.quaternion);
  enterBlend.start = performance.now();
  camReady = false; // the follow camera settles behind the player; the blend eases into it
  if (pendingFtue) { pendingFtue = false; void ftue?.start(); }
}

function updateTitleCamera(dt: number): void {
  const T = title!;
  T.t += dt;
  if (camera.fov !== TITLE_SHOT.fov) { camera.fov = TITLE_SHOT.fov; camera.updateProjectionMatrix(); } // the play loop restores params.camFov
  const up = new THREE.Vector3(0, 1, 0);
  const back = T.dir.clone().applyAxisAngle(up, Math.sin(T.t * TITLE_SHOT.swaySpeed) * TITLE_SHOT.sway);
  camera.position.copy(T.fire).addScaledVector(back, -TITLE_SHOT.dist).addScaledVector(T.side, TITLE_SHOT.side)
    .add(new THREE.Vector3(0, TITLE_SHOT.height + Math.sin(T.t * 0.4) * 0.12, 0));
  camera.lookAt(T.fire.clone().addScaledVector(T.dir, TITLE_SHOT.lookAhead).add(new THREE.Vector3(0, TITLE_SHOT.lookUp, 0)));
}

/** Render the frame (every path in animate). Just after the title, blends from its last shot into the live camera. */
const _blendPos = new THREE.Vector3(), _blendQuat = new THREE.Quaternion();
function renderView(): void {
  const tr = perfStart();
  let k = 1;
  if (enterBlend.start >= 0) {
    k = Math.min(1, (performance.now() - enterBlend.start) / ENTER_BLEND_MS);
    if (k >= 1) enterBlend.start = -1;
  }
  if (k < 1) {
    const e = k * k * (3 - 2 * k);
    _blendPos.copy(camera.position); _blendQuat.copy(camera.quaternion);
    camera.position.lerpVectors(enterBlend.fromPos, _blendPos, e);
    camera.quaternion.slerpQuaternions(enterBlend.fromQuat, _blendQuat, e);
    postfx.render(scene, camera);
    camera.position.copy(_blendPos); camera.quaternion.copy(_blendQuat); // follow logic keeps its own pose
  } else {
    postfx.render(scene, camera);
  }
  perfEnd('render', tr);
}

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  perfFrame(renderer);
  updateCharacterLods(camera); // far campers / NPCs use lighter meshes (last frame's camera is fine)

  fpsFrames++; fpsAccum += dt;
  if (fpsAccum >= 0.5) { fpsDisplay = Math.round(fpsFrames / fpsAccum); fpsFrames = 0; fpsAccum = 0; }

  clouds.update(dt, camera);
  heroMountain?.update(camera);
  birds?.update(dt);
  campfire?.update(dt);
  beachFire?.update(dt);
  butterflies?.update(dt, playerRoot?.position ?? null);
  dressing?.update(dt);
  motes?.update(dt, playerRoot?.position ?? null);

  startMarkers.update(dt, playerRoot?.position ?? null, !!playerRoot && !title && !ftue?.active && !overlayOpen()
    && !(dodgeball?.active || logCourse?.active || lunch?.active || sumo?.active || zipline?.active || glider?.active));

  if (!playerRoot || !playerUpdate) { renderView(); return; }
  if (title) {
    if (params.waterAnim) water?.update(dt);
    updateTitleCamera(dt);
    renderView();
    return;
  }
  kodak.enabled = !ftue?.active;

  const tw = perfStart();
  if (params.waterAnim) water?.update(dt);
  perfEnd('water', tw);

  // Rides tick every frame: bots can be on the zipline / in the air whatever the player's doing.
  const rideStick = joystick.getVector();
  glider?.setStick((rideStick.x !== 0 || rideStick.y !== 0) ? rideStick : keyboard.getMoveVector());
  const tz = perfStart();
  zipline?.update(dt);
  glider?.update(dt);
  perfEnd('rides', tz);

  // ── Character lineup (debug: player + one of each species, side by side) ──
  if (params.showLineup) {
    if (!lineupWasOn) {
      lineupWasOn = true;
      const yaw = playerRoot.rotation.y;
      const anchorX = playerRoot.position.x + Math.sin(yaw) * 8;
      const anchorZ = playerRoot.position.z + Math.cos(yaw) * 8;
      void lineup.show(anchorX, anchorZ, Math.cos(yaw), -Math.sin(yaw));
    }
    lineup.update(dt);
  } else if (lineupWasOn) {
    lineupWasOn = false;
    lineup.hide();
  }

  // Live params
  playerRoot.scale.setScalar(params.frogScale);
  if (playerModel) playerModel.position.y = playerSpeciesFoot / params.frogScale;
  if (!ftue?.active && !sumo?.active && !tabletop?.humanSeated && camera.fov !== params.camFov) { camera.fov = params.camFov; camera.updateProjectionMatrix(); }

  const tl = perfStart();
  logCourse?.update(dt);
  perfEnd('logCourse', tl);
  // The sumo ring's match (attract or yours) runs whatever else you're doing.
  const tsu = perfStart();
  sumo?.update(dt, camera);
  perfEnd('sumo', tsu);
  // Board games on the ground (yours, and the bots') — bots think a few ms a frame here.
  const ttt = perfStart();
  tabletop?.update(dt, camera);
  perfEnd('tabletop', ttt);
  const tba = perfStart();
  balls?.update(dt); // kicked by anyone running into them (last frame's positions)
  perfEnd('balls', tba);

  // ── First-time arrival (the FTUE drives the player + camera) ─────────────
  if (ftue?.active) {
    dodgeball?.update(dt, { x: 0, y: 0 }, camera);
    lunch?.update(dt, null, false);          // a crew delivery carries on without you
    lunch?.updateOverlay(camera, params.showNameplates);
    ftue.update(dt);
    wideViewNear();
    playerUpdate(dt, ftue.pose.anim);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    const p = playerRoot.position;
    setReadouts([`FPS: ${fpsDisplay}`, `frog: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`, 'FTUE running']);
    updateBots(dt);
    renderView();
    return;
  }
  if (logCourse?.active) {
    const pose = logCourse.pose;
    playerRoot.position.copy(pose.position);
    playerRoot.position.y += params.footOffset; // pose is the node's surface; feet sit on it like on the ground
    playerRoot.rotation.set(0, pose.facing, 0);
    animState = pose.anim;
    playerUpdate(dt, animState);
    let dHead = pose.facing + Math.PI - camHeading;
    while (dHead >  Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    camHeading += dHead * (1 - Math.exp(-COURSE_CAM_FOLLOW * dt));
    placeCamera(dt);
    const p = playerRoot.position;
    setReadouts([
      `FPS: ${fpsDisplay}`,
      `frog: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`,
      logCourse.status(),
    ]);
    lunch?.update(dt, null, false);          // a crew delivery carries on without you
    lunch?.updateOverlay(camera, params.showNameplates);
    updateBots(dt);
    dust.setFoot(0, 0, 0, 1, false); // no foot veil during the log course
    dust.update(dt);
    renderView();
    return;
  }

  // ── Hang glider (top of the branch climb → the cabins by the log course) ─
  if (glider?.active) {
    dodgeball?.update(dt, { x: 0, y: 0 }, camera);
    lunch?.update(dt, null, false);
    lunch?.updateOverlay(camera, params.showNameplates);
    const gp = glider.pose;
    playerRoot.position.copy(gp.position);
    playerRoot.quaternion.setFromEuler(new THREE.Euler(gp.pitch, gp.facing, gp.roll * 0.6, 'YXZ'));
    animState = gp.anim;
    playerUpdate(dt, animState);
    let gHead = gp.facing + Math.PI - camHeading;
    while (gHead >  Math.PI) gHead -= Math.PI * 2;
    while (gHead < -Math.PI) gHead += Math.PI * 2;
    camHeading += gHead * (1 - Math.exp(-2.5 * dt));
    placeCamera(dt);
    rideSnap(dt, 'Soaring High!', playerRoot.position);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    const p = playerRoot.position;
    setReadouts([`FPS: ${fpsDisplay}`, `frog: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`, 'GLIDER']);
    updateBots(dt);
    renderView();
    return;
  }

  // ── Zipline ride (fork at the top of the climb → the beach) ─────────────
  if (zipline?.active) {
    dodgeball?.update(dt, { x: 0, y: 0 }, camera);
    lunch?.update(dt, null, false);
    lunch?.updateOverlay(camera, params.showNameplates);
    const zp = zipline.pose;
    playerRoot.position.copy(zp.position);
    playerRoot.quaternion.setFromEuler(new THREE.Euler(zp.pitch, zp.facing, 0, 'YXZ'));
    animState = zp.anim;
    playerUpdate(dt, animState);
    let dHead = zp.facing + Math.PI - camHeading;
    while (dHead >  Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    camHeading += dHead * (1 - Math.exp(-COURSE_CAM_FOLLOW * dt));
    placeCamera(dt);
    rideSnap(dt, 'Zipline Zoom!', playerRoot.position);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    const p = playerRoot.position;
    setReadouts([`FPS: ${fpsDisplay}`, `frog: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`, 'ZIPLINE']);
    updateBots(dt);
    renderView();
    return;
  }

  // ── Dodgeball minigame ──────────────────────────────────────────────────
  // Joystick first (touch), fall back to WASD/arrows so desktop testing works.
  const dbStick = joystick.getVector();
  const dbMove = (dbStick.x !== 0 || dbStick.y !== 0) ? dbStick : keyboard.getMoveVector();
  const td = perfStart();
  dodgeball?.update(dt, dbMove, camera);
  perfEnd('dodgeball', td);
  if (dodgeball?.active) {
    const pose = dodgeball.pose;
    playerRoot.position.copy(pose.position);
    playerRoot.quaternion.copy(pose.quaternion); // includes the knockback tumble
    animState = pose.anim;
    playerUpdate(dt, animState);
    dodgeball.updateCamera(camera, dt);
    dodgeball.updateNameplates(camera, params.showNameplates);
    sumo?.updateNameplates(camera, params.showNameplates);
    ftue?.updateAmbient(dt, camera, null);
    zipCounselor?.update(dt, camera, null, true);
    glideCounselor?.update(dt, camera, null, true);
    lunch?.update(dt, null, false);          // a crew delivery carries on without you
    lunch?.updateOverlay(camera, params.showNameplates);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    chat.update(dt, camera, playerRoot.position); // taunts (the hidden camp crowd's bubbles stay hidden)
    setReadouts([`FPS: ${fpsDisplay}`, dodgeball.status()]);
    renderView();
    return;
  }

  // ── Sumo minigame ─────────────────────────────────────────────────────────
  if (sumo?.active) {
    const pose = sumo.pose;
    playerRoot.position.copy(pose.position);
    playerRoot.position.y += params.footOffset; // pose is the ring surface; feet sit on it like on the ground
    playerRoot.quaternion.copy(pose.quaternion); // includes the ring-out tumble
    playerRoot.scale.set(params.frogScale * pose.squashXZ, params.frogScale * pose.squashY, params.frogScale * pose.squashXZ);
    animState = pose.anim;
    playerUpdate(dt, animState);
    sumo.updateCamera(camera, dt);
    // Keep the sun's shadow box on the ring.
    const c = sumo.centre(new THREE.Vector3());
    rig.directionalLight.position.set(c.x + 20, c.y + 40, c.z + 15);
    rig.directionalLight.target.position.copy(c);
    rig.directionalLight.target.updateMatrixWorld();
    lunch?.update(dt, null, false);          // a crew delivery carries on without you
    lunch?.updateOverlay(camera, params.showNameplates);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    setReadouts([`FPS: ${fpsDisplay}`, sumo.status(), bots?.summary() ?? 'bots: --']);
    updateBots(dt); // the crowd keeps milling, cheering and emoting round the ring
    renderView();
    return;
  }

  // ── Board game: sat at the board, zoomed in on it (the HUD takes the input) ──
  if (tabletop?.humanSeated) {
    const seat = tabletop.humanSeatPose();
    if (seat) {
      playerRoot.position.copy(seat.position);
      playerRoot.position.y += params.footOffset; // a ground point, like the log course's poses
      playerRoot.rotation.set(0, seat.facing, 0);
    }
    playerUpdate(dt, 'idle');
    tabletop.placeHumanCamera(camera, dt);
    lunch?.update(dt, null, false);          // a crew delivery carries on without you
    lunch?.updateOverlay(camera, params.showNameplates);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    setReadouts([`FPS: ${fpsDisplay}`, 'BOARD GAME', bots?.summary() ?? 'bots: --']);
    updateBots(dt); // the camp carries on round you (your opponent's bubbles included)
    renderView();
    return;
  }

  // Wandered into the sumo ring without playing (e.g. teleported): step back out.
  if (sumo?.inPlayArea(playerRoot.position.x, playerRoot.position.z)) {
    teleportPlayer(sumo.ejectPoint(playerRoot.position.x, playerRoot.position.z, new THREE.Vector3()), playerRoot.rotation.y);
  }

  // Found inside the log course's play area without playing (e.g. the run was
  // stopped mid-river): put the frog back on the bank.
  if (logCourse?.inPlayArea(playerRoot.position.x, playerRoot.position.z)) {
    const bank = logCourse.ejectPoint(playerRoot.position.x, playerRoot.position.z, new THREE.Vector3());
    playerRoot.position.set(bank.x, bank.y, bank.z);
    lastGroundY = bank.y;
    smoothYReady = false;
    heightAboveGround = 0; jumpVelY = 0; airborne = false;
  }

  // ── Lunch Delivery: knocked out by bugs — lie there until the respawn ──
  if (lunch?.humanDown) {
    lunch.update(dt, playerRoot, false);
    if (lunch.humanDown) {
      playerRoot.position.copy(lunch.downPose.position);
      playerRoot.quaternion.copy(lunch.downPose.quaternion);
    }
    playerUpdate(dt, 'falling_idle');
    placeCamera(dt);
    lunch.updateOverlay(camera, params.showNameplates);
    dust.setFoot(0, 0, 0, 1, false);
    dust.update(dt);
    setReadouts([`FPS: ${fpsDisplay}`, lunch.status()]);
    updateBots(dt);
    renderView();
    return;
  }

  // Landed on the fenced-off valley floor (off the zipline deck / the climb): back to the beach.
  let rescue = zipline?.rescuePoint(playerRoot.position, new THREE.Vector3()) ?? null;
  // Anywhere else on the bare valley floor (fell off the climb, glided off course): back to camp.
  if (!rescue && playerRoot.position.y < -30 && !zipline?.onBeach(playerRoot.position)) {
    rescue = new THREE.Vector3(params.spawnX, 0, params.spawnZ);
    rescue.y = castGroundRay(rescue.x, rescue.z, 40, 100) ?? 0;
  }
  if (rescue) {
    playerRoot.position.set(rescue.x, rescue.y + params.footOffset, rescue.z);
    lastGroundY = rescue.y;
    smoothYReady = false;
    heightAboveGround = 0; jumpVelY = 0; airborne = false;
    dust.burst(rescue.x, rescue.y, rescue.z, params.frogScale, 8);
  }

  const gate = overlayOpen() || lunch?.active ? null : gates.update(playerRoot.position);
  const tablePrompt = overlayOpen() ? null : tabletop?.promptFor(playerRoot.position) ?? null;
  if (tablePrompt) {
    campHud.setPrompt(tablePrompt.label, tablePrompt.onTap); // a camper's waiting for you at their board
  } else if (!overlayOpen() && playerRoot && zipline?.canMount(playerRoot.position)) {
    campHud.setPrompt('Ride Zipline!', () => { if (playerRoot) zipline?.start(playerRoot.position); });
  } else if (!overlayOpen() && playerRoot && glider?.canMount(playerRoot.position)) {
    campHud.setPrompt('Hang Glide!', () => { if (playerRoot) glider?.start(playerRoot.position); });
  } else if (gate?.id === 'canteen') {
    campHud.setPrompts([
      { label: 'Browse Shop', onTap: () => { canteen?.say('Take a look! 🛍️'); openShop(); } },
      { label: 'Get Care Package', onTap: () => { canteen?.say('One Care Package, coming up! 📦'); openCarePackage(); } },
    ]);
  } else if (gate?.id === 'corner') {
    const prompts = [];
    if (board) prompts.push({ label: bulletin.hasAlert ? 'Bulletin Board!' : 'Bulletin Board', onTap: () => openBulletin() });
    if (mailbox) prompts.push({ label: dailyRewards.canClaim ? 'Check Mail!' : 'Check Mail', onTap: () => openMail() });
    campHud.setPrompts(prompts);
  } else if (gate?.id === 'myTent') {
    campHud.setPrompt('Customize Tent', () => openCustomize(1));
  } else if (gate?.id === 'photoBooth') {
    const fresh = photoAlbum.unseenCount;
    campHud.setPrompt(fresh ? `Post Cards (${fresh} new!)` : 'Post Cards', () => {
      photoBooth?.say(fresh ? 'Fresh from the darkroom! 📸' : photoAlbum.photos.length ? 'Every one a keeper! 🖼️' : 'Go make some memories! 📸');
      openPostcards();
    });
  } else if (gate?.id === 'troop') {
    campHud.setPrompt(gate.label, () => { troopTent?.say('Welcome to Troop HQ! ⛺'); openTroop(); });
  } else if (gate) {
    const joinRun = gate.id === 'lunchDelivery' && !!lunch?.running;
    campHud.setPrompt(joinRun ? 'Join Lunch Delivery' : `Play ${gate.label}`, () => openModeTutorial(gate.id as GameMode));
  } else if (!overlayOpen() && (lunch?.canJoinAtCart(playerRoot.position) || lunch?.canJoinAtItem(playerRoot.position))) {
    // A delivery rolling past (or its debris / power-ups nearby): hop in right here.
    campHud.setPrompt('Join Lunch Delivery', () => openLunchTutorial(false));
  } else {
    campHud.setPrompt(null);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const stick = joystick.getVector();
  const keys  = keyboard.getMoveVector();
  const raw   = (stick.x !== 0 || stick.y !== 0) ? stick : keys;
  const mag   = Math.hypot(raw.x, raw.y);
  const move  = mag > 0.08 ? raw : { x: 0, y: 0 };
  const moveMag   = Math.hypot(move.x, move.y);
  const isMoving  = moveMag > 0.01;
  const isRunning = moveMag >= 0.6;
  campHud.setMoving(isMoving, dt); // the top HUD fades back while you roam
  const jumpPressed = actionBtn.isPressed() || keyboard.isDown('Space');

  // ── Camera heading ────────────────────────────────────────────────────────
  // Smooth orbit angles toward targets
  // Frame-rate-independent easing of the drag-orbit toward its target (was a
  // per-frame factor, so it eased faster on high-refresh screens).
  const oDamp = params.camFreeOrbit
    ? 1.0
    : 1 - Math.exp(-THREE.MathUtils.lerp(30, 8, params.camRotSmooth) * dt);
  // Drag is applied straight into camHeading so auto-follow always works from
  // the real camera yaw; a separate offset would make follow rotate forever.
  const orbitStep = tgtOrbitOff * oDamp;
  camHeading  += orbitStep;
  tgtOrbitOff -= orbitStep;
  orbitPitch  += (tgtPitch - orbitPitch) * oDamp;

  // Yaw of the camera as currently rendered (from last frame's smoothed position)
  const viewYaw = camReady
    ? Math.atan2(camPos.x - playerRoot.position.x, camPos.z - playerRoot.position.z)
    : camHeading;

  // Movement axis: camera-relative when camRelativeMove, else world-forward
  const moveYaw = params.camRelativeMove ? viewYaw : playerRoot.rotation.y;
  const fwd = new THREE.Vector3(Math.sin(moveYaw), 0, Math.cos(moveYaw));
  const rgt = new THREE.Vector3(Math.cos(moveYaw), 0, -Math.sin(moveYaw));
  const dir = new THREE.Vector3()
    .addScaledVector(fwd,  move.y)
    .addScaledVector(rgt,  move.x)
    .clampLength(0, 1);

  // Auto-follow swings the camera behind the input direction (not the frog's
  // lagging facing), and only while moving, so manual orbits stick and pushing
  // straight up never rotates the camera. In free-orbit mode it never runs.
  if (!params.camFreeOrbit && !dragActive && isMoving && dir.lengthSq() > 0) {
    let dHead = Math.atan2(dir.x, dir.z) + Math.PI - camHeading;
    while (dHead >  Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    // Heading back toward the camera turns it FASTER, so you see where you're
    // going sooner: the rate climbs from 1x (forward) to 1 + camBackFollow.
    const backness = (1 - Math.cos(dHead)) / 2; // 0 forward … 1 straight back
    // Except right around dead-back: there the turn direction is ambiguous and,
    // with camera-relative input, following would chase the camera in circles —
    // so straight backpedalling still leaves the camera alone.
    const off180 = Math.PI - Math.abs(dHead);
    const deadBack = THREE.MathUtils.smoothstep(off180, BACK_DEADZONE, BACK_DEADZONE * 2);
    const rate = params.camFollowSpeed * (1 + params.camBackFollow * backness) * deadBack;
    camHeading += dHead * (1 - Math.exp(-rate * dt));
  }

  // Idle recenter: after a beat with no stick or drag, slowly swing the camera
  // back behind the way the frog is facing (eased in, so it doesn't lurch).
  if (isMoving || dragActive || Math.abs(tgtOrbitOff) > 1e-3) camIdle = 0;
  else camIdle += dt;
  if (!params.camFreeOrbit && camIdle > params.camIdleDelay) {
    let dHead = playerRoot.rotation.y + Math.PI - camHeading;
    while (dHead >  Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;
    const ramp = THREE.MathUtils.smoothstep(camIdle - params.camIdleDelay, 0, 1);
    camHeading += dHead * (1 - Math.exp(-params.camIdleSpeed * ramp * dt));
  }

  const tp = perfStart();
  // ── Movement ──────────────────────────────────────────────────────────────
  // Sprint build-up: time spent running without stopping. A brief let-go
  // (SPRINT_GRACE) doesn't cost you the boost; actually stopping does.
  if (isRunning) { runTime += dt; runIdle = 0; }
  else if ((runIdle += dt) > SPRINT_GRACE) runTime = 0;
  const sprintT = THREE.MathUtils.clamp((runTime - params.sprintDelay) / Math.max(0.01, params.sprintRamp), 0, 1);
  const sprintMul = 1 + params.sprintBoost * sprintT * sprintT * (3 - 2 * sprintT); // smoothstep ease-in/out

  let stepMoved = 0; // horizontal distance actually travelled this frame
  if (isMoving) {
    const speed = isRunning ? params.runSpeed * sprintMul : params.walkSpeed;
    const step = resolveMove(dir.x * speed * moveMag * dt, dir.z * speed * moveMag * dt);
    playerRoot.position.x += step.x;
    playerRoot.position.z += step.z;
    stepMoved = Math.hypot(step.x, step.z);

    // Rotate frog to face movement — Y axis ONLY, never tilt
    if (dir.lengthSq() > 0) {
      const tgtAngle = Math.atan2(dir.x, dir.z);
      const tf = 1 - Math.exp(-params.turnSpeed * dt);
      let d = tgtAngle - playerRoot.rotation.y;
      while (d >  Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      playerRoot.rotation.y += d * tf;
    }
  }

  // Always enforce upright (no slope tilt)
  playerRoot.rotation.x = 0;
  playerRoot.rotation.z = 0;

  // ── Ground raycast (every frame, after XZ move) ───────────────────────────
  // Ray starts from last known ground + rayStartH, so it always fires from above.
  const rayStartY = lastGroundY + params.rayStartH;
  const groundHitY = castGroundRay(
    playerRoot.position.x,
    playerRoot.position.z,
    rayStartY,
    params.rayMaxLen,
  );

  // Update ray visual
  rayLine.visible = params.showRay && params.groundingOn;
  rayDot.visible  = params.showRay && params.groundingOn && groundHitY !== null;
  if (params.showRay && params.groundingOn) {
    const pts = rayLineGeo.attributes['position'] as import('three').BufferAttribute;
    pts.setXYZ(0, playerRoot.position.x, rayStartY, playerRoot.position.z);
    pts.setXYZ(1, playerRoot.position.x, rayStartY - params.rayMaxLen, playerRoot.position.z);
    pts.needsUpdate = true;
    if (groundHitY !== null) rayDot.position.set(playerRoot.position.x, groundHitY, playerRoot.position.z);
  }

  // Update lastGroundY when we have a hit (preserve last known when we don't)
  const prevGroundY = lastGroundY;
  if (groundHitY !== null) lastGroundY = groundHitY;

  // Airborne height is kept relative to the ground under the frog, so when that
  // ground changes mid-air, shift it to keep the frog's actual height continuous.
  if (airborne && groundHitY !== null) heightAboveGround += prevGroundY - groundHitY;
  // Walked off a ledge (a cliff, not a slope or a bridge step): start a real fall
  // from where the feet are, instead of the ground snap easing straight down.
  if (!airborne && smoothYReady && groundHitY !== null && groundHitY < prevGroundY - LEDGE_FALL_DROP) {
    airborne = true;
    grounded = false;
    jumpVelY = 0;
    heightAboveGround = playerRoot.position.y - params.footOffset - groundHitY;
  }

  // ── Grounded state with hysteresis ────────────────────────────────────────
  // Compare actual frog Y (not smoothed) to ground hit for reliable detection.
  const feetY = playerRoot.position.y;
  const distToGround = groundHitY !== null ? Math.abs(feetY - groundHitY) : Infinity;
  const wasGrounded = grounded;
  if (!airborne) {
    if (groundHitY !== null && distToGround <= params.groundThreshold) {
      grounded = true;
    } else if (groundHitY === null || distToGround > params.groundThreshold * 2) {
      grounded = false;
    }
  }

  // ── Jump arc ──────────────────────────────────────────────────────────────
  const prevAirborne = airborne;
  if (jumpPressed && !jumpHeld && !airborne) {
    jumpVelY = params.jumpHeight;
    airborne = true;
    grounded = false;
    gameEvents.emit({ type: 'jump', actor: PLAYER_ACTOR, pos: playerRoot.position });
  }
  jumpHeld = jumpPressed;

  if (airborne) {
    jumpVelY = Math.max(-MAX_FALL_SPEED, jumpVelY - JUMP_GRAVITY * dt);
    heightAboveGround += jumpVelY * dt;
    if (heightAboveGround <= 0) {
      heightAboveGround = 0;
      jumpVelY = 0;
      airborne = false;
    }
  } else {
    heightAboveGround = 0;
  }
  // Mr Kodak, wandering: a long fall off a ledge (or a big leap off the dock) is a moment.
  if (airborne) {
    airPeak = Math.max(airPeak, heightAboveGround);
    if (jumpVelY < -6 && heightAboveGround > 5) {
      kodak.moment('Big Drop!', KODAK_SCORE.bigDrop + Math.min(30, heightAboveGround));
      if (heightAboveGround > 8) achievements.flag('big_drop');
    }
  }

  // ── Set frog Y (smooth snap) ──────────────────────────────────────────────
  if (groundHitY !== null) {
    const targetY = groundHitY + params.footOffset + heightAboveGround;
    if (!smoothYReady || airborne) {
      // First frame / after teleport: snap immediately. In the air the arc is
      // already smooth, and following it exactly keeps a long fall from lagging.
      smoothedFrogY = targetY;
      smoothYReady = true;
    } else {
      // Frame-rate-independent exponential damping so the frog stays glued to
      // the ground smoothly (no per-frame Y pops on uneven terrain).
      const snapK = THREE.MathUtils.lerp(30, 8, params.groundSnapSmooth);
      smoothedFrogY += (targetY - smoothedFrogY) * (1 - Math.exp(-snapK * dt));
    }
    playerRoot.position.y = smoothedFrogY;
  }
  // No hit: frog stays at current Y

  // ── Water immersion: float when standing, swim when moving ────────────────
  // Sink the frog to a waterline + bob so wading reads as swimming and standing
  // reads as floating. Only when the ground under it is at/below the surface —
  // bridges & docks sit ABOVE the water, so their higher groundHitY opts out.
  let inWater = false;
  let waterSurfaceY = 0;
  if (params.waterAnim && water && !airborne) {
    const w = water.sampleWater(playerRoot.position.x, playerRoot.position.z);
    if (w && (groundHitY === null || groundHitY <= w.surfaceY + 0.15)) {
      inWater = true;
      waterSurfaceY = w.surfaceY;
      const bodyH = frogHeight * params.frogScale;
      const bob = params.waterBob * Math.sin(clock.elapsedTime * (isMoving ? 4.5 : 2.0));
      const targetY = w.surfaceY - params.waterSink * bodyH + params.footOffset + bob;
      // Ease toward the waterline so entering/leaving the water isn't a pop.
      const k = Math.min(1, dt * 6);
      waterImmersion += (1 - waterImmersion) * k;
      playerRoot.position.y += (targetY - playerRoot.position.y) * k;
      smoothedFrogY = playerRoot.position.y;
      // Subtle forward pitch while swimming (re-applied after the upright reset).
      if (isMoving) playerRoot.rotation.x = -0.22 * waterImmersion;
    }
  }
  if (!inWater && waterImmersion > 0.001) {
    waterImmersion += (0 - waterImmersion) * Math.min(1, dt * 6);
  }
  // Feed the water line to next frame's movement collision (see pathClear).
  moveWaterY = inWater ? waterSurfaceY : -Infinity;

  // ── Animation state ───────────────────────────────────────────────────────
  // NEVER play fall/land anims while grounded — only idle/walk/run.
  const justLanded = prevAirborne && !airborne;
  if (justLanded) {
    // Landed in the water from up high: a cannonball!
    if (inWater && airPeak > 3.5) {
      kodak.moment('Cannonball!', KODAK_SCORE.cannonball + Math.min(30, airPeak), 220);
      achievements.flag('cannonball');
    }
    airPeak = 0;
  }
  if (grounded && !airborne) {
    // Grounded: only locomotion anims
    if (!isMoving)      animState = 'idle';
    else if (isRunning) animState = 'running';
    else                animState = 'walking';
  } else if (justLanded) {
    animState = 'hard_landing';
  } else if (animState !== 'hard_landing') {
    if (airborne && jumpVelY > 0) animState = 'jumping_up';
    else if (airborne)            animState = 'falling_idle';
  }
  // In water: no run/fall/land clips — calm swim (walk) or float (idle).
  if (inWater) animState = isMoving ? 'walking' : 'idle';
  playerUpdate(dt, animState);

  // ── Footstep dust ─────────────────────────────────────────────────────────
  // Emit a small puff behind the feet every stride while walking/running on
  // the ground, and a burst on landing — sells contact with the ground.
  if (grounded && !airborne && isMoving && groundHitY !== null && !inWater) {
    stepDist += stepMoved;
    const stride = (isRunning ? 1.15 : 0.85) * params.frogScale;
    if (stepDist >= stride) {
      stepDist -= stride;
      const back = 0.35 * params.frogScale;
      const fx = playerRoot.position.x - Math.sin(playerRoot.rotation.y) * back;
      const fz = playerRoot.position.z - Math.cos(playerRoot.rotation.y) * back;
      dust.emit(fx, groundHitY, fz, params.frogScale, { opacity: isRunning ? 0.6 : 0.42 });
    }
  } else {
    stepDist = 0;
  }
  if (justLanded && groundHitY !== null && !inWater) {
    dust.burst(playerRoot.position.x, groundHitY, playerRoot.position.z, params.frogScale, 6);
  }
  // Persistent foot veil — softens the foot/floor contact while grounded (dry).
  const footY = groundHitY ?? lastGroundY;
  dust.setFoot(playerRoot.position.x, footY, playerRoot.position.z, params.frogScale, grounded && !airborne && !inWater);
  dust.update(dt);

  // ── Merit badges: distance travelled + discovering camp spots ─────────────
  if (stepMoved > 0 && !ftue?.active) achievements.add(inWater ? 'swim_m' : 'walk_m', stepMoved);
  if ((discoverT -= dt) <= 0 && !ftue?.active) {
    discoverT = 0.5;
    const p = playerRoot.position;
    for (const d of discoverSpots) {
      if (!achievements.hasDiscovered(d.id) && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < d.radius) achievements.discover(d.id);
    }
  }

  // ── Water ripple wake ──────────────────────────────────────────────────────
  // Rings trail behind a swimmer and pulse out around a floater, always laid on
  // the surface (not the sunk feet).
  if (inWater && water) {
    if (isMoving) {
      waterRippleDist += stepMoved;
      const spacing = 0.7 * params.frogScale;
      if (waterRippleDist >= spacing) {
        waterRippleDist -= spacing;
        const back = 0.4 * params.frogScale;
        const wx = playerRoot.position.x - Math.sin(playerRoot.rotation.y) * back;
        const wz = playerRoot.position.z - Math.cos(playerRoot.rotation.y) * back;
        water.ripple(wx, waterSurfaceY, wz, params.frogScale, 0.5);
      }
    } else {
      waterRippleDist += dt;
      if (waterRippleDist >= 0.9) {
        waterRippleDist -= 0.9;
        water.ripple(playerRoot.position.x, waterSurfaceY, playerRoot.position.z, params.frogScale, 0.4);
      }
    }
  } else {
    waterRippleDist = 0;
  }

  // Lunch Delivery runs on top of free roam (auto-aim may turn the frog to its target).
  perfEnd('player', tp);
  const tlu = perfStart();
  lunch?.update(dt, playerRoot, lunch.active && (lunch.attackHeld || keyboard.isDown('KeyF') || keyboard.isDown('Enter')));
  perfEnd('lunch', tlu);

  placeCamera(dt);
  lunch?.updateOverlay(camera, params.showNameplates);

  // ── Marker ────────────────────────────────────────────────────────────────
  markerMesh.visible = params.showMarker;

  // ── Debug readouts ────────────────────────────────────────────────────────
  const p = playerRoot.position;
  const gStr = groundHitY !== null ? groundHitY.toFixed(2) : 'NO HIT';
  setReadouts([
    `FPS: ${fpsDisplay}`,
    `frog: (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`,
    `ground Y: ${gStr}  dist: ${groundHitY !== null ? Math.abs(p.y - groundHitY).toFixed(2) : '--'}`,
    `grounded: ${grounded}  anim: ${animState}`,
    `frog h: ${(frogHeight * params.frogScale).toFixed(2)}u`,
    bots?.summary() ?? 'bots: --',
    ...perfSummary().split('\n'),
    lunch?.status() ?? 'lunch: --',
    ...(params.showLineup ? lineup.labels() : []),
  ]);

  updateBots(dt);
  renderView();
}

// Boot
init().catch((err) => {
  console.error('[main] init failed:', err);
  loading.error(String(err));
});
