// Camp HUD — the free-roam overlay (Figma "Hud + Controls", 42:4928): Time/Score
// pill top-left, compact wallet top-right, and a column of menu buttons down the
// right edge. Laid out in 1080-wide design px (fillScreen) like the other screens.
// Game modes keep their own HUDs: they call hide() on start and show() on end.
//
// The main buttons are icon tiles in one row under the wallet: the art on a cream clay tile
// (the action buttons' material) with a brown label plate, so they read as controls over the
// busy 3D world. Everything sits in the top band, over a soft dark scrim that keeps it legible
// whatever the camera sees; the middle of the screen stays world. While you run the band fades
// back (setMoving) so roaming feels immersive. `profile` swaps the pill for the player's badge
// (portrait + name + a drop-down arrow): tapping it drops down a menu for the less-used screens.

import { COLORS, DEFAULT_HUD_TONE, FONT, HUD_TONES, buttonRadius, chonkArt, textOutline } from './theme';
import { el, fillScreen, pressable } from './components';
import { pillButton, wallet, type Wallet } from './store-components';
import { getSafeLayout } from '../safe-layout';
import { iconImg } from './icons';

/** Tan HUD pill (Figma "Timer / Standard" 42:4951), 292 × 105. */
export function hudPill(text: string): { root: HTMLElement; setText(t: string): void } {
  const root = el('div',
    `background:${COLORS.creamDim};border:3.735px solid ${COLORS.brown};display:flex;gap:4px;height:105px;` +
    'align-items:center;justify-content:center;padding:12px;border-radius:24px;min-width:292px;flex-shrink:0;');
  const label = el('p', `font-family:${FONT};font-weight:600;font-size:36px;line-height:normal;color:${COLORS.ink};` +
    'text-align:center;white-space:nowrap;padding:0 12px;', text);
  root.appendChild(label);
  return { root, setText: (t) => { label.textContent = t; } };
}

/** Red count bubble on an element's top-right corner (0 removes it). `k` scales it for small hosts. */
function countBubble(host: HTMLElement, n: number, k = 1): void {
  let b = host.querySelector(':scope > [data-badge]') as HTMLElement | null;
  if (n <= 0) { b?.remove(); return; }
  if (!b) {
    if (!host.style.position) host.style.position = 'relative';
    const d = 52 * k;
    b = el('p', `position:absolute;right:${-12 * k}px;top:${-14 * k}px;min-width:${d}px;height:${d}px;box-sizing:border-box;` +
      `padding:0 ${12 * k}px;border-radius:${d / 2}px;background:#e8483f;border:${4 * k}px solid #fff;box-shadow:0 4px 0 rgba(0,0,0,0.25);` +
      `display:flex;align-items:center;justify-content:center;font-family:${FONT};font-weight:700;font-size:${28 * k}px;color:#fff;` +
      'pointer-events:none;z-index:1;');
    b.dataset.badge = '1';
    host.appendChild(b);
    b.animate([{ transform: 'scale(0.4)' }, { transform: 'scale(1.2)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 260 });
  }
  b.textContent = n > 9 ? '9+' : String(n);
}

/** Immersion fade while running (setMoving). */
const HUD_FADE = { after: 0.35, restoreAfter: 0.5, opacity: 0.35 };

/** HUD tile size (design px) — the main buttons' row. */
const TILE = 112;

/** Menu button: icon art (a path, or a built element like the Menu grid) on a cream clay tile with
 * a brown label plate under it — or, with no icon, a wallet-tone text button. */
export function hudButton(label: string, onTap: () => void, iconSrc?: string | HTMLElement): HTMLElement {
  const t = HUD_TONES[DEFAULT_HUD_TONE];
  if (iconSrc) {
    const root = el('div', `position:relative;display:flex;flex-direction:column;align-items:center;width:${TILE + 14}px;` +
      'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;pointer-events:auto;');
    const tile = el('div', `width:${TILE}px;height:${TILE}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;` +
      `background:${COLORS.cream};border:6px solid ${COLORS.brown};box-shadow:0 8px 0 ${COLORS.brownDark},0 10px 16px rgba(0,0,0,0.25);` +
      `border-radius:${buttonRadius(TILE)}px;pointer-events:none;`);
    tile.appendChild(typeof iconSrc === 'string' ? iconImg(iconSrc, TILE - 22) : iconSrc);
    const plate = el('p', `position:relative;margin-top:-16px;padding:2px 12px 3px;border-radius:12px;background:${COLORS.brown};` +
      `border:3px solid ${COLORS.brownDark};font-family:${FONT};font-weight:700;font-size:23px;line-height:1.1;color:${COLORS.cream};` +
      'white-space:nowrap;pointer-events:none;', label);
    root.append(tile, plate);
    pressable(root, 6, onTap);
    return root;
  }
  const root = el('div',
    `background:${t.fill};border:5.334px solid ${t.rim};box-shadow:0 8px 0 ${t.shadow};` +
    `display:flex;align-items:center;justify-content:center;height:84px;min-width:210px;padding:0 28px;border-radius:${buttonRadius(84)}px;` +
    'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;pointer-events:auto;');
  root.appendChild(el('p', `font-family:${FONT};font-weight:700;font-size:34px;line-height:normal;color:#fff;` +
    `white-space:nowrap;pointer-events:none;text-shadow:${textOutline(HUD_TONES[DEFAULT_HUD_TONE].shadow, 2.4)};`, label));
  pressable(root, 8, onTap);
  return root;
}

export interface CampHudButton { label: string; onTap: () => void; /** Icon art (icons.ts); text-only without. */ icon?: string; }

/** Top-left player badge: `art` = portrait id (assets/ui/chonks/<art>.png); `items` = its drop-down menu. */
export interface CampHudProfile { art: string; name: string; items: CampHudButton[]; }

const ARROW = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" style="display:block">' +
  '<path d="M6 9.5 L12 15.5 L18 9.5" stroke="#674833" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Player badge in the wallet's HUD tone (100 tall, matches the wallet): portrait well + name. */
function profileBadge(onTap: () => void): { root: HTMLElement; chip: HTMLElement; set(art: string, name: string): void; setOpen(on: boolean): void } {
  const t = HUD_TONES[DEFAULT_HUD_TONE];
  const root = el('div',
    `background:${t.fill};border:5.334px solid ${t.rim};box-shadow:0 8px 0 ${t.shadow};display:flex;align-items:center;` +
    `gap:18px;height:100px;padding:0 12px 0 10px;border-radius:${buttonRadius(100)}px;flex-shrink:0;pointer-events:auto;` +
    'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;');
  const face = el('div', `position:relative;width:76px;height:76px;border-radius:${buttonRadius(76)}px;overflow:hidden;` +
    `flex-shrink:0;background:${COLORS.cardArt};pointer-events:none;`);
  // Portraits are full-body: scale up and pin to the top so the well shows the face.
  const img = el('img', 'position:absolute;left:-20%;top:-4%;width:140%;height:auto;max-width:none;pointer-events:none;');
  img.alt = ''; img.draggable = false;
  face.appendChild(img);
  const name = el('p', `font-family:${FONT};font-weight:600;font-size:40px;line-height:normal;color:#fff;white-space:nowrap;` +
    `max-width:330px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;text-shadow:${textOutline(t.shadow, 2.4)};`);
  // Drop-down arrow chip: says "this opens a menu" (flips up while it's open).
  const chip = el('div', `width:62px;height:62px;border-radius:${buttonRadius(62)}px;flex-shrink:0;display:flex;align-items:center;` +
    `justify-content:center;background:${COLORS.cream};border:4px solid ${t.shadow};box-shadow:0 4px 0 ${t.shadow};margin-left:6px;` +
    'pointer-events:none;transition:background 120ms, transform 160ms ease;');
  chip.innerHTML = ARROW;
  root.append(face, name, chip);
  pressable(root, 8, onTap);
  chip.style.position = 'relative';
  return {
    root,
    chip,
    set(art, n) { img.src = chonkArt(art); name.textContent = n; },
    setOpen(on) {
      root.style.borderColor = on ? COLORS.coin : t.rim;
      chip.style.background = on ? COLORS.coinLight : COLORS.cream;
      chip.style.transform = on ? 'rotate(180deg)' : '';
    },
  };
}

const PROMPT_MARGIN = 40;     // design px kept clear either side of the prompt
const PROMPT_MIN_FONT = 30;   // design px: long prompts shrink to at least this
const PROMPT_TIGHT_PAD = 40;  // design px side padding once a prompt's been squeezed

export interface CampHudOptions {
  pill?: string;
  coins: number;
  onAddCoins?: () => void;
  /** Golden pinecone (premium) balance — shown in the same wallet, left of the pony beads. */
  premium?: number;
  onAddPremium?: () => void;
  /** Right-edge menu, top to bottom. */
  buttons: CampHudButton[];
  /** Player badge + menu in place of the top-left pill. */
  profile?: CampHudProfile;
}

export class CampHud {
  readonly root: HTMLElement;
  private frame: HTMLElement;
  private top: HTMLElement;
  private left: HTMLElement;
  private column: HTMLElement;
  private wallet: Wallet & { setPremium(n: number): void };
  private pill: ReturnType<typeof hudPill>;
  private unfit: () => void;
  private visible = true;
  private prompt: HTMLElement;
  private promptLabel: string | null = null;
  private promptTaps: (() => void)[] = [];
  private promptEl: HTMLElement | null = null;
  private buttonEls = new Map<string, HTMLElement>();
  private profile: ReturnType<typeof profileBadge> | null = null;
  private menuItems: CampHudButton[] = [];
  private menu: HTMLElement | null = null;
  /** Counts for drop-down items (setBadge on a menu label). */
  private menuCounts = new Map<string, number>();
  private scrim!: HTMLElement;
  /** Immersion fade: seconds you've been moving / standing still. */
  private movingFor = 0;
  private stillFor = 0;
  private faded = false;

  constructor(private host: HTMLElement, opts: CampHudOptions) {
    // Pass-through overlay: only the controls themselves take input.
    this.root = el('div', 'position:absolute;inset:0;z-index:25;pointer-events:none;overflow:hidden;' +
      'transition:opacity 160ms;');
    this.frame = el('div', 'pointer-events:none;');
    // Soft dark band down from the top edge (full-bleed, under the notch too): the top row and
    // the column always sit on a darker, calmer backdrop.
    this.scrim = el('div', 'position:absolute;left:0;right:0;top:0;height:26%;pointer-events:none;' +
      'background:linear-gradient(to bottom, rgba(28,16,6,0.46) 0%, rgba(28,16,6,0.24) 50%, rgba(28,16,6,0) 100%);' +
      'transition:opacity 450ms ease;');
    this.root.appendChild(this.scrim);
    this.root.appendChild(this.frame);

    // Top HUD row (Figma header-row 42:4939 + Timer 42:4950): pill at (32, 40), wallet right 24.
    this.top = el('div', 'position:absolute;left:32px;right:24px;top:40px;display:flex;align-items:flex-start;' +
      'justify-content:space-between;pointer-events:none;');
    this.pill = hudPill(opts.pill ?? 'Time/Score');
    // The pill + any extra round buttons beside it (e.g. Mr Kodak's photo button).
    this.left = el('div', 'display:flex;align-items:center;gap:22px;pointer-events:none;');
    if (opts.profile) {
      this.profile = profileBadge(() => this.toggleMenu());
      this.profile.set(opts.profile.art, opts.profile.name);
      this.menuItems = opts.profile.items;
      this.left.appendChild(this.profile.root);
    } else {
      this.left.appendChild(this.pill.root);
    }
    // Same wallet as every other screen's header row (not Figma's 70-tall HUD variant) so it reads as one element.
    const both = opts.premium !== undefined;
    this.wallet = wallet(opts.coins, both ? opts.onAddPremium ?? opts.onAddCoins : opts.onAddCoins,
      both ? { premium: opts.premium } : {});
    this.wallet.root.style.pointerEvents = 'auto';
    this.top.append(this.left, this.wallet.root);

    // Right-edge menu column, under the wallet.
    this.column = el('div', 'position:absolute;right:22px;display:flex;flex-direction:row;gap:12px;' +
      'align-items:flex-start;pointer-events:none;');
    for (const b of opts.buttons) {
      const btn = hudButton(b.label, b.onTap, b.icon);
      btn.style.position = 'relative';
      this.buttonEls.set(b.label, btn);
      this.column.appendChild(btn);
    }


    // Floating "Play <mode>" prompt, bottom-centre above the controls (shown near a mode's gate).
    this.prompt = el('div', 'position:absolute;left:0;right:0;bottom:560px;display:flex;justify-content:center;' +
      'pointer-events:none;');

    this.frame.append(this.top, this.column, this.prompt);
    host.appendChild(this.root);
    this.unfit = fillScreen(this.frame, host, () => this.layout());
  }

  setCoins(n: number): void { this.wallet.setCoins(n); }
  setPremium(n: number): void { this.wallet.setPremium(n); }
  setPill(text: string): void { this.pill.setText(text); }
  /**
   * Call every frame with whether the player is moving: after a moment of running the top band
   * (badge, wallet, tiles, scrim) eases back to a ghost of itself, and returns once you stop.
   * Prompts ("Play …") and the thumb controls aren't part of it. Never fades with the menu open.
   */
  setMoving(moving: boolean, dt: number): void {
    if (moving) { this.movingFor += dt; this.stillFor = 0; } else { this.stillFor += dt; this.movingFor = 0; }
    const want = this.menu ? false : this.faded ? this.stillFor < HUD_FADE.restoreAfter : this.movingFor > HUD_FADE.after;
    if (want === this.faded) return;
    this.faded = want;
    const o = want ? String(HUD_FADE.opacity) : '1';
    for (const e of [this.top, this.column]) {
      e.style.transition = `opacity ${want ? 450 : 220}ms ease`;
      e.style.opacity = o;
    }
    this.scrim.style.opacity = want ? '0.25' : '1';
  }

  /** Update the player badge (character / name changed). */
  setProfile(art: string, name: string): void { this.profile?.set(art, name); }

  /** Drop-down under the player badge: one cream kit button per item; any tap outside closes it. */
  private toggleMenu(): void {
    if (this.menu) { this.closeMenu(); return; }
    const stop = (e: Event) => e.stopPropagation(); // keep taps off the joystick / camera underneath
    const wrap = el('div', 'position:absolute;inset:0;pointer-events:auto;');
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove'] as const) wrap.addEventListener(t, stop);
    wrap.addEventListener('pointerup', (e) => { if (e.target === wrap) this.closeMenu(); });
    const top = (parseFloat(this.top.style.top) || 40) + 100 + 30;
    const panel = el('div', `position:absolute;left:32px;top:${top}px;min-width:500px;background:${COLORS.cream};` +
      `border:6px solid ${COLORS.brown};box-shadow:0 12px 0 ${COLORS.brownDark};border-radius:40px;padding:26px;` +
      'display:flex;flex-direction:column;gap:20px;transform-origin:40px 0;');
    for (const item of this.menuItems) {
      const b = pillButton(item.label, () => { this.closeMenu(); item.onTap(); }, 'row', 'light');
      b.style.width = '100%';
      b.dataset.menuItem = item.label;
      if (item.icon) {
        b.style.position = 'relative';
        b.style.paddingLeft = '96px';
        b.style.justifyContent = 'flex-start';
        b.appendChild(iconImg(item.icon, 66, 'position:absolute;left:14px;top:50%;margin-top:-33px;'));
      }
      panel.appendChild(b);
      countBubble(b, this.menuCounts.get(item.label) ?? 0, 0.8);
    }
    wrap.appendChild(panel);
    this.frame.appendChild(wrap);
    this.menu = wrap;
    this.profile?.setOpen(true);
    panel.animate([{ opacity: 0, transform: 'scale(0.85) translateY(-16px)' }, { opacity: 1, transform: 'none' }],
      { duration: 160, easing: 'ease-out' });
  }

  private closeMenu(): void { this.menu?.remove(); this.menu = null; this.profile?.setOpen(false); }

  /** Add a (round, 105-tall) button to the top row, right of the pill. */
  addTopButton(btn: HTMLElement): void { this.left.appendChild(btn); }

  /** Red count bubble on a menu button's corner (e.g. Camp Pass rewards to claim); 0 hides it. */
  setBadge(label: string, n: number): void {
    const btn = this.buttonEls.get(label);
    if (btn) { countBubble(btn, n); return; }
    // A drop-down item: its count shows on the row, and the badge's arrow chip gets the total.
    if (!this.menuItems.some((i) => i.label === label)) return;
    this.menuCounts.set(label, n);
    const total = [...this.menuCounts.values()].reduce((a, b) => a + Math.max(0, b), 0);
    if (this.profile) countBubble(this.profile.chip, total, 0.7);
    const row = this.menu?.querySelector(`[data-menu-item="${CSS.escape(label)}"]`) as HTMLElement | null;
    if (row) countBubble(row, n, 0.8);
  }

  /** Show the floating play button (`label` null hides it). No-op if unchanged. */
  setPrompt(label: string | null, onTap?: () => void): void {
    this.setPrompts(label ? [{ label, onTap: onTap ?? (() => {}) }] : null);
  }

  /** Several floating buttons side by side (e.g. the Canteen's Browse Shop / Get Care Package). */
  setPrompts(buttons: CampHudButton[] | null): void {
    this.promptTaps = buttons?.map((b) => b.onTap) ?? []; // always the latest actions, even when labels are unchanged
    const label = buttons?.length ? buttons.map((b) => b.label).join('\u0000') : null;
    if (label === this.promptLabel) return;
    this.promptLabel = label;
    // The live button (not firstElementChild: an old one may still be fading out).
    const old = this.promptEl;
    this.promptEl = null;
    if (old) {
      old.style.pointerEvents = 'none';
      old.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }],
        { duration: 140, easing: 'ease-in' }).onfinish = () => old.remove();
    }
    if (!buttons?.length) return;
    // Wrapper carries the pop-in + bob so the button's own transform stays free for the press sink.
    const wrap = el('div', 'pointer-events:auto;display:flex;gap:28px;align-items:center;');
    buttons.forEach((b, i) => {
      const btn = pillButton(b.label, () => this.promptTaps[i]?.(), 'play');
      // Two side by side must fit the 1080 frame: tighten the padding.
      if (buttons.length > 1) btn.style.padding = '0 44px';
      wrap.appendChild(btn);
    });
    this.prompt.appendChild(wrap);
    this.promptEl = wrap;
    this.fitPrompt(wrap);
    wrap.animate([{ opacity: 0, transform: 'translateY(40px) scale(0.8)' },
      { opacity: 1, transform: 'translateY(-6px) scale(1.04)', offset: 0.7 },
      { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 260, easing: 'ease-out' })
      .onfinish = () => wrap.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }],
        { duration: 900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }

  /** Long labels ("Play Words With Friends vs SomeoneLong") shrink to fit the frame instead of
   * running off its edges: the text scales down, the pill keeps its height. */
  private fitPrompt(wrap: HTMLElement): void {
    const room = this.prompt.clientWidth - PROMPT_MARGIN * 2;
    const over = wrap.scrollWidth;
    if (room <= 0 || over <= room) return;
    for (const label of wrap.querySelectorAll('p')) {
      const px = parseFloat(getComputedStyle(label).fontSize);
      label.style.fontSize = `${Math.max(PROMPT_MIN_FONT, px * (room / over) * 0.97)}px`;
    }
    for (const pill of wrap.children) (pill as HTMLElement).style.paddingInline = `${PROMPT_TIGHT_PAD}px`;
    // Still too wide at the smallest size: let the text wrap onto two lines.
    if (wrap.scrollWidth > room) for (const label of wrap.querySelectorAll('p')) label.style.whiteSpace = 'normal';
  }

  show(): void { this.setVisible(true); }
  hide(): void { this.setVisible(false); }
  get isVisible(): boolean { return this.visible; }

  dispose(): void { this.unfit(); this.root.remove(); }

  private setVisible(v: boolean): void {
    this.visible = v;
    if (!v) this.closeMenu();
    this.root.style.opacity = v ? '1' : '0';
    this.root.style.visibility = v ? 'visible' : 'hidden';
  }

  /** Push the top row + column below the notch / status bar (safe-area insets are CSS px). */
  private layout(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const s = w / 1080;
    const insetTop = getSafeLayout(w, h, this.host).insets.top / s;
    this.top.style.top = `${40 + insetTop}px`;
    // Under the 100-tall wallet(s) (+ drop shadow).
    this.column.style.top = `${40 + insetTop + 105 + 26}px`;
  }
}
