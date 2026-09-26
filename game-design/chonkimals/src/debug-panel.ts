/**
 * Debug panel — collapsible top-right overlay with sliders, toggles, buttons.
 * Exports `params` (a mutable object) that main.ts reads every frame.
 * Exports `setReadouts()` for per-frame live values.
 */
import { postParams } from './postfx';
import { SPECIES } from './bots/appearance';
import type { AnimState } from './player';
import { dragToScroll } from './ui/components';

// ── Live param object (main.ts reads these every frame) ─────────────────────
export const params = {
  // Camera
  camDist:          6.0,
  camHeight:        5.5,
  camLookY:         3.7,
  camFov:            85,
  camRotSmooth:     0.5,   // drag-orbit smoothing: 0=instant lock, 1=very laggy
  camFollowSpeed:   1.2,   // auto-follow behind frog, exp-decay rate per second
  camBackFollow:    0.0,   // extra follow when heading back toward the camera (2 = up to 3x)
  camIdleDelay:     1.5,   // seconds of no input before the camera swings back behind the frog
  camIdleSpeed:     0.8,   // idle recenter rate (exp-decay per second); 0 = off
  camPosSmooth:     0.5,   // 0=instant, 1=very smooth
  camFreeOrbit:    false,
  camRelativeMove:  true,

  // Frog
  frogScale:        1.9,
  walkSpeed:        4.0,
  runSpeed:        10.0,
  // Sprint build-up: keep running without stopping and speed ramps up.
  sprintDelay:      1.0,  // seconds of running before the boost starts
  sprintRamp:       3.0,  // seconds to go from run speed to full sprint
  sprintBoost:      0.6,  // extra speed at full sprint (0.6 = +60%)
  turnSpeed:          7,
  jumpHeight:        10,

  // Grounding
  rayStartH:          5,  // ray origin above frog Y
  rayMaxLen:         50,  // ray max distance
  footOffset:      -0.5,  // fine-tune feet vs surface
  groundThreshold:  0.5,  // distance within which frog is "grounded"
  groundSnapSmooth: 0.3,  // 0=instant snap, higher=smoother
  maxStepUp:        1.0,  // tallest ledge the frog walks up; higher = wall
  groundingOn:     true,

  // Spawn — set to the tuned position; init() uses these directly
  spawnX:          -1.5,
  spawnZ:          12.0,

  // Debug visuals — off by default
  showRay:         false,
  showMarker:      false,

  // Bots (fake multiplayer)
  showBots:        true,
  showNameplates:  true,
  showBotNav:      false,
  showLineup:      false,  // debug: line up one of each species + the player, side by side

  // Water immersion (float / swim)
  waterAnim:       true,   // master toggle for animated water + immersion
  waterSink:       0.5,    // fraction of the frog's body submerged in water
  waterBob:        0.12,   // vertical bob amplitude (world units)
};

// ── Styles ───────────────────────────────────────────────────────────────────
const PANEL_CSS = [
  'position:absolute',
  // Left edge, below the camp HUD's top row — keeps the corners free for the real HUD.
  'top:22%',
  'left:max(8px,env(safe-area-inset-left),var(--sal,0px))',
  'z-index:50',
  'font-family:system-ui,sans-serif',
  'font-size:clamp(11px,2.4vmin,13px)',
  'color:#fff',
  'pointer-events:auto',
].join(';');

const BTN_CSS = [
  'background:rgba(30,30,50,0.92)',
  'border:1.5px solid rgba(255,255,255,0.25)',
  'border-radius:8px',
  'color:#fff',
  'padding:6px 14px',
  'cursor:pointer',
  'touch-action:manipulation',
  'user-select:none',
  'font-size:inherit',
  'width:100%',
  'text-align:left',
  'min-height:44px',
].join(';');

const BODY_CSS = [
  'background:rgba(20,20,35,0.92)',
  'border:1.5px solid rgba(255,255,255,0.18)',
  'border-radius:0 0 10px 10px',
  'padding:8px 10px 10px',
  'display:flex',
  'flex-direction:column',
  'gap:4px',
  'max-height:72vh',
  'overflow-y:auto',
  '-webkit-overflow-scrolling:touch',
].join(';');

const READOUT_CSS = [
  'background:rgba(0,0,0,0.55)',
  'border-radius:6px',
  'padding:4px 8px',
  'font-family:monospace',
  'font-size:clamp(10px,2.2vmin,12px)',
  'color:#4f4',
  'line-height:1.6',
  'pointer-events:none',
  'margin-bottom:3px',
].join(';');

const SECTION_CSS = [
  'color:#adf',
  'font-weight:700',
  'margin-top:5px',
  'margin-bottom:1px',
  'font-size:0.92em',
  'letter-spacing:0.04em',
].join(';');

// ── Build panel ───────────────────────────────────────────────────────────────
export interface PanelCallbacks {
  onRecenter:      () => void;
  onSnapToGround:  () => void;
  onSetSpawnHere:  () => void;
  onStartLogCourse: () => void;
  onStopLogCourse:  () => void;
  onStartDodgeball: () => void;
  onPlayWinSound: () => void;
  onPlayFailSound: () => void;
  onPlayLoseSound: () => void;
  onStopDodgeball:  () => void;
  onStartSumo: () => void;
  /** Words With Friends: grant + equip the toy / start a bot game nearby / a bot challenges you. */
  onWordsGrant: () => void;
  onWordsBotGame: () => void;
  onWordsInvite: () => void;
  /** Dice With Friends: the same three. */
  onDiceGrant: () => void;
  onDiceBotGame: () => void;
  onDiceInvite: () => void;
  onStopSumo:  () => void;
  onSumoItem: (kind: 'bomb' | 'pepper') => void;
  onStartLunch: (difficulty: 'easy' | 'normal' | 'hard') => void;
  onStopLunch: () => void;
  onLunchGhost: () => void;
  onShowModalTemplate: () => void;
  onShowCharacterSelect: () => void;
  onShowShop: () => void;
  onShowSettings: () => void;
  onShowLeaderboard: () => void;
  onShowTroop: () => void;
  /** Open the Care Package screen; `force` makes the next roll that rarity. */
  onShowCarePackage: (force?: import('./care-package/rewards').Rarity) => void;
  onAddPremium: () => void;
  onResetInventory: () => void;
  onGrantAllCosmetics: () => void;
  /** Store for the "own every item" toggle (`on`); not saved. */
  ownEverything: { on: boolean };
  onShowMail: () => void;
  onMailNextDay: () => void;
  onMailReset: () => void;
  onShowBulletin: () => void;
  onBulletinNextDay: () => void;
  onBulletinComplete: () => void;
  onBulletinReset: () => void;
  onShowCampPass: () => void;
  onPassPoints: () => void;
  onPassCompleteGoals: () => void;
  onPassReset: () => void;
  onShowBadges: () => void;
  onBadgesEarnSome: () => void;
  onBadgesEarnAll: () => void;
  onBadgesReset: () => void;
  onDriveEndNow: () => void;
  onDriveContribute: () => void;
  onTroopDrivesFinish: () => void;
  onDrivesReset: () => void;
  onGoToGate: (id: 'dodgeball' | 'logCourse' | 'lunchDelivery' | 'sumo' | 'zipline' | 'glider' | 'troopTent' | 'canteen' | 'mailbox' | 'board') => void;
  onReplayFtue: () => void;
  onSayChat:        () => void;
  onSetLineupAnim:  (s: AnimState) => void;
}

export function createDebugPanel(
  container: HTMLElement,
  cb: PanelCallbacks,
): { setReadouts: (lines: string[]) => void } {

  const wrap = document.createElement('div');
  wrap.style.cssText = PANEL_CSS;
  container.appendChild(wrap);
  // Only on screen with ?debug in the URL (it still runs — params are read elsewhere).
  if (!new URLSearchParams(location.search).has('debug')) wrap.style.display = 'none';

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'DEBUG ▾';
  toggleBtn.style.cssText = BTN_CSS;
  wrap.appendChild(toggleBtn);

  const body = document.createElement('div');
  body.style.cssText = BODY_CSS;
  dragToScroll(body);
  body.style.display = 'none';
  wrap.appendChild(body);

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    body.style.display = open ? 'flex' : 'none';
    toggleBtn.textContent = open ? 'DEBUG ▴' : 'DEBUG ▾';
    wrap.style.width = open ? 'min(270px,82vw)' : '';
  };
  toggleBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  // Live readouts at top of body
  const readoutEl = document.createElement('div');
  readoutEl.style.cssText = READOUT_CSS;
  readoutEl.textContent = '…';
  body.appendChild(readoutEl);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function section(label: string): void {
    const d = document.createElement('div');
    d.style.cssText = SECTION_CSS;
    d.textContent = label;
    body.appendChild(d);
  }

  // slider/toggle bind to a target object (defaults to `params`) so the same
  // helpers drive the fidelity look params (postParams) too.
  type Store = Record<string, number | boolean>;
  const P = params as unknown as Store;

  function slider(
    label: string,
    key: string,
    min: number, max: number, step: number,
    obj: Store = P,
  ): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;min-height:34px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'flex:1;font-size:0.93em;line-height:1.2;';

    const val = document.createElement('span');
    val.style.cssText = 'font-family:monospace;color:#fd9;min-width:38px;text-align:right;flex-shrink:0;';
    const decimals = step < 0.02 ? 3 : step < 1 ? 2 : 0;
    val.textContent = Number(obj[key]).toFixed(decimals);

    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(obj[key]);
    inp.style.cssText = 'flex:2;min-height:26px;touch-action:none;accent-color:#4af;';

    inp.addEventListener('input', () => {
      const n = parseFloat(inp.value);
      obj[key] = n;
      val.textContent = n.toFixed(decimals);
    });

    lbl.appendChild(document.createTextNode(label + ' '));
    lbl.appendChild(val);
    row.appendChild(lbl);
    row.appendChild(inp);
    body.appendChild(row);
  }

  function toggle(label: string, key: string, obj: Store = P): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;min-height:34px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'flex:1;font-size:0.93em;';
    lbl.textContent = label;

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!obj[key];
    inp.style.cssText = 'width:20px;height:20px;touch-action:manipulation;accent-color:#4af;flex-shrink:0;';
    inp.addEventListener('change', () => {
      obj[key] = inp.checked;
    });

    row.appendChild(lbl);
    row.appendChild(inp);
    body.appendChild(row);
  }

  function button(label: string, action: () => void): void {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'background:rgba(60,80,140,0.8)',
      'border:1px solid rgba(100,140,255,0.4)',
      'border-radius:6px',
      'color:#fff',
      'padding:5px 10px',
      'cursor:pointer',
      'touch-action:manipulation',
      'user-select:none',
      'font-size:inherit',
      'width:100%',
      'min-height:38px',
      'margin-top:2px',
    ].join(';');
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); action(); });
    body.appendChild(btn);
  }

  // ── Fidelity / look section (drives postfx.ts) ──────────────────────────────
  const FX = postParams as unknown as Store;
  section('Fidelity (look)');
  toggle('Post-FX on',        'enabled',        FX);
  slider('Exposure',          'exposure',       0.5,  2.0, 0.02, FX);
  slider('Saturation',        'saturation',     0.5,  2.0, 0.02, FX);
  slider('Contrast',          'contrast',       0.8,  1.5, 0.01, FX);
  slider('Vibrance',          'vibrance',       0.0,  1.0, 0.02, FX);
  slider('Bloom strength',    'bloomStrength',  0.0,  1.5, 0.02, FX);
  slider('Bloom threshold',   'bloomThreshold', 0.0,  1.2, 0.02, FX);
  slider('Warmth',            'warmth',        -0.1, 0.15, 0.005, FX);
  slider('Vignette',          'vignette',       0.0,  0.8, 0.02, FX);

  // ── Camera section ─────────────────────────────────────────────────────────
  section('Camera');
  slider('Distance',          'camDist',         2,  40, 0.5);
  slider('Height',            'camHeight',        1,  30, 0.5);
  slider('Look-at Y',         'camLookY',         0,   6, 0.1);
  slider('FOV',               'camFov',          30, 120, 1);
  slider('Rotation smooth',   'camRotSmooth',     0,   1, 0.05);
  slider('Follow speed',      'camFollowSpeed',   0,  10, 0.1);
  slider('Back-angle follow', 'camBackFollow',    0,   5, 0.1);
  slider('Idle recenter delay', 'camIdleDelay',   0,  10, 0.1);
  slider('Idle recenter speed', 'camIdleSpeed',   0,   5, 0.1);
  slider('Position smooth',   'camPosSmooth',     0,   1, 0.05);
  toggle('Camera-relative move', 'camRelativeMove');
  toggle('Free orbit',        'camFreeOrbit');

  // ── Frog section ───────────────────────────────────────────────────────────
  section('Frog');
  slider('Scale',             'frogScale',       0.1, 10, 0.05);
  slider('Walk speed',        'walkSpeed',       0.5, 20, 0.5);
  slider('Run speed',         'runSpeed',        0.5, 30, 0.5);
  slider('Sprint delay (s)',  'sprintDelay',       0,  5, 0.1);
  slider('Sprint ramp (s)',   'sprintRamp',      0.1, 10, 0.1);
  slider('Sprint boost',      'sprintBoost',       0,  2, 0.05);
  slider('Turn speed',        'turnSpeed',         1, 30, 1);
  slider('Jump height',       'jumpHeight',        1, 20, 0.5);

  // ── Grounding section ──────────────────────────────────────────────────────
  section('Grounding');
  slider('Ray start H',       'rayStartH',         1, 50, 0.5);
  slider('Ray max len',       'rayMaxLen',          5,200, 1);
  slider('Foot offset',       'footOffset',        -5,  5, 0.05);
  slider('Grounded threshold','groundThreshold',  0.05,  3, 0.05);
  slider('Snap smoothing',    'groundSnapSmooth',   0,  1, 0.05);
  slider('Max step up',       'maxStepUp',          0,  5, 0.05);
  toggle('Grounding on',      'groundingOn');

  // ── Spawn section ──────────────────────────────────────────────────────────
  section('Spawn');
  slider('Spawn X',           'spawnX',         -150, 150, 0.5);
  slider('Spawn Z',           'spawnZ',         -150, 150, 0.5);
  button('Snap to ground now',  () => cb.onSnapToGround());
  button('Set spawn here',      () => cb.onSetSpawnHere());
  button('Recenter frog',       () => cb.onRecenter());

  // ── Minigames ──────────────────────────────────────────────────────────────
  section('Minigames');
  // Starting a game closes the panel so it doesn't cover the match.
  button('Start log course',    () => { setOpen(false); cb.onStartLogCourse(); });
  button('Stop log course',     () => cb.onStopLogCourse());
  button('Start dodgeball',     () => { setOpen(false); cb.onStartDodgeball(); });
  button('Stop dodgeball',      () => cb.onStopDodgeball());
  button('Start sumo',          () => { setOpen(false); cb.onStartSumo(); });
  button('Stop sumo',           () => cb.onStopSumo());
  button('Sumo: drop bomb',     () => cb.onSumoItem('bomb'));
  button('Sumo: drop pepper',   () => cb.onSumoItem('pepper'));
  button('Start lunch delivery (easy)',   () => { setOpen(false); cb.onStartLunch('easy'); });
  button('Start lunch delivery (normal)', () => { setOpen(false); cb.onStartLunch('normal'); });
  button('Start lunch delivery (hard)',   () => { setOpen(false); cb.onStartLunch('hard'); });
  button('Stop lunch delivery', () => cb.onStopLunch());
  button('Lunch: ghost test',   () => cb.onLunchGhost());
  button('Words: grant + equip toy', () => cb.onWordsGrant());
  button('Words: bots start a game nearby', () => { setOpen(false); cb.onWordsBotGame(); });
  button('Words: a bot challenges me', () => { setOpen(false); cb.onWordsInvite(); });
  button('Dice: grant + equip toy', () => cb.onDiceGrant());
  button('Dice: bots start a game nearby', () => { setOpen(false); cb.onDiceBotGame(); });
  button('Dice: a bot challenges me', () => { setOpen(false); cb.onDiceInvite(); });
  button('Show modal template', () => cb.onShowModalTemplate());
  button('Character select',    () => cb.onShowCharacterSelect());
  button('Shop',                () => cb.onShowShop());
  button('Settings',            () => cb.onShowSettings());
  button('Leaderboard',         () => cb.onShowLeaderboard());
  button('Scout Troop',         () => cb.onShowTroop());
  button('Care Package',        () => cb.onShowCarePackage());
  button('Care Pkg: next = rare',      () => cb.onShowCarePackage('rare'));
  button('Care Pkg: next = epic',      () => cb.onShowCarePackage('epic'));
  button('Care Pkg: next = legendary', () => cb.onShowCarePackage('legendary'));
  button('+100 golden pinecones', () => cb.onAddPremium());
  button('Reset cosmetic inventory', () => cb.onResetInventory());
  toggle('Own every item (temporary)', 'on', cb.ownEverything);
  button('Grant every cosmetic (saved)', () => cb.onGrantAllCosmetics());
  button('Camp Mail (daily reward)', () => cb.onShowMail());
  button('Mail: skip to next day', () => cb.onMailNextDay());
  button('Mail: reset streak', () => cb.onMailReset());
  button('Bulletin Board', () => cb.onShowBulletin());
  button('Board: next challenge day', () => cb.onBulletinNextDay());
  button('Board: complete challenge', () => cb.onBulletinComplete());
  button('Board: reset (unread + stats)', () => cb.onBulletinReset());
  button('Camp Pass',           () => cb.onShowCampPass());
  button('Pass: +100 points (1 stamp)', () => cb.onPassPoints());
  button('Pass: complete all goals', () => cb.onPassCompleteGoals());
  button('Pass: reset',         () => cb.onPassReset());
  button('Merit Badges (sash)', () => cb.onShowBadges());
  button('Badges: earn next 3', () => cb.onBadgesEarnSome());
  button('Badges: earn all',    () => cb.onBadgesEarnAll());
  button('Badges: reset',       () => cb.onBadgesReset());
  button('Community Drive: end now', () => cb.onDriveEndNow());
  button('Community Drive: +50 mine', () => cb.onDriveContribute());
  button('Troop Drives: finish all 3', () => cb.onTroopDrivesFinish());
  button('Drives: reset',       () => cb.onDrivesReset());
  button('Replay FTUE (arrival)', () => { setOpen(false); cb.onReplayFtue(); });
  button('Go to dodgeball gate', () => cb.onGoToGate('dodgeball'));
  button('Go to log course gate', () => cb.onGoToGate('logCourse'));
  button('Go to lunch delivery gate', () => cb.onGoToGate('lunchDelivery'));
  button('Go to sumo gate',     () => cb.onGoToGate('sumo'));
  button('Go to zipline (top of the climb)', () => cb.onGoToGate('zipline'));
  button('Go to hang glider launch', () => cb.onGoToGate('glider'));
  button('Go to Troop HQ tent', () => cb.onGoToGate('troopTent'));
  button('Go to Canteen',       () => cb.onGoToGate('canteen'));
  button('Go to Mailbox',       () => cb.onGoToGate('mailbox'));
  button('Go to Bulletin Board', () => cb.onGoToGate('board'));
  button('Play win sound',      () => cb.onPlayWinSound());
  button('Play fail sound',     () => cb.onPlayFailSound());
  button('Play lose sound',     () => cb.onPlayLoseSound());

  // ── Debug visuals ──────────────────────────────────────────────────────────
  section('Debug visuals');
  toggle('Show ray',          'showRay');
  toggle('Show marker',       'showMarker');

  // ── Bots ───────────────────────────────────────────────────────────────────
  section('Bots');
  toggle('Show bots',         'showBots');
  toggle('Show nameplates',   'showNameplates');
  toggle('Show bot nav/hotspots', 'showBotNav');

  // ── Character lineup (per-species scale/footOffset calibration) ────────────
  // One row of buttons switches every lineup character's clip at once (idle
  // vs. bind pose can differ wildly per asset — see chonkimals-assets memory —
  // so always re-check a new scale across idle/walk/run before locking it in).
  section('Character lineup');
  toggle('Show lineup (player + one of each species)', 'showLineup');
  const ANIM_STATES: AnimState[] = ['idle', 'walking', 'running', 'jumping_up', 'falling_idle', 'hard_landing'];
  for (const s of ANIM_STATES) {
    button(`Anim: ${s}`, () => cb.onSetLineupAnim(s));
  }
  for (const id of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
    const def = SPECIES[id] as unknown as Store;
    slider(`${SPECIES[id].label} scale ×`,       'scale',      0.3, 2.0, 0.01, def);
    slider(`${SPECIES[id].label} foot offset`,   'footOffset', -1,  1,   0.01, def);
  }

  section('Water');
  toggle('Animate water + immersion', 'waterAnim');
  slider('Body submerged',    'waterSink',        0, 0.9, 0.05);
  slider('Float bob',         'waterBob',         0, 0.5, 0.01);

  // ── Chat ───────────────────────────────────────────────────────────────────
  section('Chat');
  button('Say random loadout line', () => cb.onSayChat());

  // ── Log button ─────────────────────────────────────────────────────────────
  section('Actions');
  button('Log values', () => {
    const paramLines = Object.entries(params).map(([k, v]) => `${k}: ${v}`).join('\n');
    const speciesLines = Object.entries(SPECIES)
      .map(([id, d]) => `${id}: scale=${d.scale}  footOffset=${d.footOffset}`).join('\n');
    const lines = paramLines + '\n\n[species]\n' + speciesLines;
    console.log('[debug] params:\n' + lines);
    alert('Params (also in console):\n\n' + lines);
  });

  return {
    setReadouts(lines: string[]): void {
      readoutEl.innerHTML = lines.join('<br>');
    },
  };
}
