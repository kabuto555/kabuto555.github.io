import { events as globalEvents, type EventBus } from '../core/events';
import { input as globalInput, type Input } from '../core/input';
import type { System } from '../core/types';
import { SHOPS } from '../data';
import type { InventorySystem } from '../inventory/system';
import { Banners } from './banners';
import { BonfireMenu } from './bonfireMenu';
import { ControlsCard } from './controlsCard';
import { Capture, makeKey, type LevelUpFn, type ShopTable, type UiCombat, type UiCtx, type UiPlayer, type UiWallet } from './ctx';
import { Dialogue } from './dialogue';
import { h } from './dom';
import './events';
import { HudImpl } from './hud';
import { HintFade, nextHintMode, type HintMode } from './logic';
import { MenuImpl } from './menu/menu';
import { ShopMenu } from './shop';
import { injectStyle } from './style';
import { ToastQueueImpl } from './toast';

export interface CreateUiOptions {
  /** The `#ui` overlay element. */
  root: HTMLElement;
  events?: EventBus;
  player: UiPlayer;
  combat: UiCombat;
  inv: InventorySystem;
  wallet: UiWallet;
  /** Shop table (default: data/shops). */
  shops?: ShopTable;
  /** Saved remaining shop stock (`SaveData.shopStock`), applied on creation. */
  shopStock?: Record<string, number> | null;
  /** Called with the new stock table after each purchase (persist it). */
  onShopStock?: (stock: Record<string, number>) => void;
  /** Apply a bought stat level (e.g. `player.levels[stat]++` + refresh derived stats). Return false to refuse (souls refunded). */
  onLevelUp: LevelUpFn;
  /** Polled each frame for the "[E] ..." prompt text (e.g. `() => interact.current?.prompt() ?? null`). Without it the HUD uses `promptChanged` events. */
  getPrompt?: () => string | null;
  input?: Input;
  /** Element to re-acquire pointer lock on when the last menu closes (default: `#app canvas`). */
  lockTarget?: HTMLElement | null;
  /** Clear `player.controlsEnabled` while a menu captures the mouse (default true). */
  gateControls?: boolean;
  /** Extra hook on capture changes. */
  onCapture?: (capturing: boolean) => void;
  /** Show the controls card for a few seconds the first time ever (localStorage flag). Default true. */
  firstSpawnCard?: boolean;
}

export interface UiSystem extends System {
  /**
   * True while any menu (Tab menu, bonfire, level up, shop) holds the mouse. Gameplay systems should ignore
   * fire/move/interact while it is true. By default createUi also clears `player.controlsEnabled`.
   * The `uiCapture {capturing}` event fires on every change.
   */
  readonly capturing: boolean;
  readonly hud: HudImpl;
  readonly menu: MenuImpl;
  readonly bonfire: BonfireMenu;
  readonly shop: ShopMenu;
  readonly banners: Banners;
  readonly dialogue: Dialogue;
  readonly card: ControlsCard;
  readonly toasts: ToastQueueImpl;
  hintMode: HintMode;
  /** Close every menu. */
  closeAll(): void;
  dispose(): void;
}

const LS_HINT = 'cmw.hintMode';
const LS_CARD = 'cmw.controlsSeen';

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

/**
 * UI scale: integer steps of ~400 virtual px of height, never below 720 virtual px wide. On small viewports it
 * falls back to a fractional scale (down to 0.75) so wide panels (shop 640px) are not cropped.
 */
export function uiScale(w: number, h0: number): number {
  const int = Math.min(Math.floor(h0 / 400), Math.floor(w / 720));
  if (int >= 1) return int;
  return Math.max(0.75, Math.min(1, w / 720, h0 / 400));
}

/**
 * Build the whole DOM UI (HUD, Tab menu, bonfire/level-up, shop, banners, dialogue, controls card, toasts)
 * and return it as a `System`. Register it AFTER the world/combat systems and before the final render pass:
 *   `const ui = createUi({ root: uiEl, player, combat, inv, wallet, onLevelUp, getPrompt }); loop.add(ui);`
 */
export function createUi(opts: CreateUiOptions): UiSystem {
  injectStyle();
  const bus = opts.events ?? globalEvents;
  const input = opts.input ?? globalInput;
  const player = opts.player;
  let clock = 0;

  // ---- capture (menus hold the mouse; gameplay reads `capturing`)
  let relock = false;
  let prevControls = true;
  const lockEl = (): HTMLElement | null => opts.lockTarget ?? document.querySelector<HTMLElement>('#app canvas');
  const capture = new Capture((on) => {
    if (on) {
      relock = input.pointerLocked || lostLock;
      input.exitPointerLock();
      input.releaseAll();
      if (opts.gateControls !== false && player.controlsEnabled !== undefined) {
        prevControls = player.controlsEnabled;
        (player as { controlsEnabled: boolean }).controlsEnabled = false;
      }
    } else {
      if (opts.gateControls !== false && player.controlsEnabled !== undefined) (player as { controlsEnabled: boolean }).controlsEnabled = prevControls;
      const el = lockEl();
      if (relock && el) input.requestPointerLock(el);
      relock = false;
    }
    bus.emit('uiCapture', { capturing: on });
    opts.onCapture?.(on);
  });

  const hints = new HintFade();
  const saved = lsGet(LS_HINT);
  if (saved === 'always' || saved === 'fade' || saved === 'off') hints.mode = saved;

  const ctx: UiCtx = {
    bus,
    player,
    combat: opts.combat,
    inv: opts.inv,
    wallet: opts.wallet,
    input,
    hints,
    capture,
    shops: opts.shops ?? SHOPS,
    onLevelUp: opts.onLevelUp,
    now: () => clock,
    key: makeKey(input),
    bindings: () => input.bindings,
  };

  // ---- DOM
  const layer = h('div', 'cmw');
  opts.root.append(layer);
  const hud = new HudImpl(ctx, { getPrompt: opts.getPrompt });
  const toasts = new ToastQueueImpl();
  const banners = new Banners();
  const dialogue = new Dialogue();
  const card = new ControlsCard(ctx);
  const cycleHints = (): void => {
    hints.mode = nextHintMode(hints.mode);
    lsSet(LS_HINT, hints.mode);
    hints.poke(clock);
  };
  const menu = new MenuImpl(ctx, cycleHints);
  const bonfire = new BonfireMenu(ctx);
  const shop = new ShopMenu(ctx, opts.shops ?? SHOPS, { stock: opts.shopStock, onChange: opts.onShopStock });

  hud.mount(layer, bus);
  toasts.mount(hud.toastBox, bus);
  banners.mount(layer, bus);
  dialogue.mount(layer, bus);
  layer.append(card.el);
  menu.mount(layer, bus);
  bonfire.mount(layer, bus);
  shop.mount(layer, bus);

  let S = 1;
  const layout = (): void => {
    const w = window.innerWidth;
    const hh = window.innerHeight;
    S = uiScale(w, hh);
    layer.style.width = `${Math.ceil(w / S)}px`;
    layer.style.height = `${Math.ceil(hh / S)}px`;
    layer.style.transform = `scale(${S})`;
  };
  layout();
  window.addEventListener('resize', layout);

  const closeAll = (): void => {
    menu.hide();
    shop.hide();
    bonfire.levelUp.hide();
    bonfire.hide();
  };

  // ---- keys: the `menu` binding opens/closes (Tab/Esc by default); Esc backs out of sub-screens first.
  const onKey = (e: KeyboardEvent): void => {
    if (input.bindings.menu.includes(e.code)) {
      if (shop.open) shop.hide();
      else if (bonfire.active) bonfire.back();
      else menu.toggle();
      e.preventDefault();
    } else if (shop.open && shop.handleKey(e.code)) {
      e.preventDefault();
    } else if (bonfire.active && bonfire.handleKey(e.code)) {
      e.preventDefault();
    } else if (menu.open && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      menu.stepTab(e.code === 'ArrowLeft' ? -1 : 1);
    }
  };
  window.addEventListener('keydown', onKey);

  // Escape while pointer-locked just releases the lock (no keydown reaches us): treat that as "open the menu".
  let wasLocked = false;
  let lostLock = false;
  const onLockChange = (): void => {
    const locked = input.pointerLocked;
    if (wasLocked && !locked && !capture.capturing) {
      lostLock = true;
      menu.show();
      lostLock = false;
    }
    wasLocked = locked;
  };
  document.addEventListener('pointerlockchange', onLockChange);

  const offs = [
    bus.on('deathScreen', (e) => {
      if (e.phase === 'start') closeAll();
    }),
    bus.on('soulsRecovered', (e) => toasts.push(`Souls recovered${e.souls ? ` +${e.souls}` : ''}`, { kind: 'info' })),
  ];

  // First spawn: show the controls card once.
  if (opts.firstSpawnCard !== false && lsGet(LS_CARD) !== '1') {
    lsSet(LS_CARD, '1');
    card.flash(7);
  }

  const sys: UiSystem = {
    name: 'ui',
    hud,
    menu,
    bonfire,
    shop,
    banners,
    dialogue,
    card,
    toasts,
    get capturing() {
      return capture.capturing;
    },
    get hintMode() {
      return hints.mode;
    },
    set hintMode(m: HintMode) {
      hints.mode = m;
      lsSet(LS_HINT, m);
      hints.poke(clock);
    },
    closeAll,
    update() {},
    render(_alpha, frameDt) {
      clock += frameDt;
      hud.update(frameDt);
      toasts.update(frameDt);
      banners.update(frameDt);
      dialogue.update(frameDt);
      menu.update();
      card.update(frameDt, input.down('controlsCard'));
    },
    dispose() {
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerlockchange', onLockChange);
      for (const o of offs) o();
      closeAll();
      hud.unmount();
      toasts.unmount();
      banners.unmount();
      dialogue.unmount();
      menu.unmount();
      bonfire.unmount();
      shop.unmount();
      layer.remove();
    },
  };
  return sys;
}
