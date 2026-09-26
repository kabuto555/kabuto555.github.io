// Full-screen store UIs — Character Select (Figma 42:4728) and the Shop (42:4953).
// Same building blocks, different dressing: Character Select sits over a dimmed
// camp backdrop with SELECT cards; the Shop is a clay page with tabs, prices and
// BUY cards. Both are 1080 wide and fill the screen height; the card grid scrolls.

import { COLORS, UI_ASSETS } from './theme';
import { critterHeader, dragToScroll, el, fillScreen, PLAQUE_SCREEN } from './components';
import { applyTexture, clayTexture, type ClayParams } from './shader-textures';
import {
  headerRow, itemCard, outlinePill, priceFooter, selectFooter, tabBar, type Wallet,
} from './store-components';
import type { CharacterEntry, ShopItem, ShopTab } from './store-presets';

/** Base class: overlay root, input swallowing, scale-to-fill, fade in/out. */
export abstract class StoreScreen {
  readonly root: HTMLElement;
  protected frame: HTMLElement;
  protected wallet!: Wallet;
  protected premiumWallet: Wallet | null = null;
  private unfit: () => void = () => {};
  private closed = false;
  private closeHooks: (() => void)[] = [];

  constructor(protected host: HTMLElement) {
    this.root = el('div', 'position:absolute;inset:0;z-index:100;overflow:hidden;user-select:none;-webkit-user-select:none;');
    this.root.dataset.overlay = '1'; // gates stay quiet while any overlay is up
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel'] as const) {
      this.root.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    }
    this.frame = el('div', 'overflow:hidden;');
    // The backdrop art is wider than the frame, so focus/scrollIntoView (e.g. a text field on a
    // phone) can scroll the clipped frame sideways — pin it.
    this.frame.addEventListener('scroll', () => { this.frame.scrollLeft = 0; this.frame.scrollTop = 0; });
    this.root.appendChild(this.frame);
  }

  protected mount(onLayout?: (h: number) => void): void {
    this.host.appendChild(this.root);
    // Inside the safe area, so back buttons / wallets clear the notch (the backdrop still bleeds to the edges).
    this.unfit = fillScreen(this.frame, this.host, onLayout, undefined, { safeArea: true });
    // Screens that paint their own background on the frame (the Shop's clay…): mirror it full-bleed
    // on the root so the notch / home-indicator strips match (campBackdrop screens bring their own).
    const sync = () => {
      if (this.root.querySelector(':scope > .chonk-bleed')) return;
      const fs = this.frame.style, rs = this.root.style;
      rs.backgroundColor = fs.backgroundColor;
      rs.backgroundImage = fs.backgroundImage;
      if (!fs.backgroundImage) return;
      // Same size + offset as the frame's copy (tiling into the strips) so the two line up exactly.
      const fr = this.frame.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
      rs.backgroundSize = `${fr.width}px ${fr.height}px`;
      rs.backgroundPosition = `${fr.left - rr.left}px ${fr.top - rr.top}px`;
      rs.backgroundRepeat = 'repeat';
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(this.frame, { attributes: true, attributeFilter: ['style'] });
    this.onClose(() => mo.disconnect());
    this.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }

  setCoins(n: number): void { this.wallet.setCoins(n); }
  setPremium(n: number): void { this.premiumWallet?.setCoins(n); }
  /** The combined wallet's pinecone icon (where purchase celebrations fly to). */
  get premiumTarget(): HTMLElement | null { return this.premiumWallet?.root.querySelector('img') ?? null; }

  /** Run `fn` once the screen closes (any way). */
  onClose(fn: () => void): void { this.closeHooks.push(fn); }
  get isClosed(): boolean { return this.closed; }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHooks.forEach((f) => f());
    this.unfit();
    const a = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
    a.onfinish = () => this.root.remove();
  }
}

/** Camp backdrop + 40% scrim — shared by the menu screens. Painted full-bleed on the screen root
 * (behind the frame, which sits inside the safe area) so it fills the notch / home-indicator
 * strips too; only the UI moves. Falls back to the frame when it isn't mounted in a root yet. */
export function campBackdrop(frame: HTMLElement): void {
  const root = frame.parentElement;
  if (root) {
    if (root.querySelector(':scope > .chonk-bleed')) return;
    const bleed = el('div', 'position:absolute;inset:0;pointer-events:none;');
    bleed.classList.add('chonk-bleed');
    const img = el('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;max-width:none;');
    img.src = UI_ASSETS.bgCamp; img.alt = '';
    bleed.append(img, el('div', `position:absolute;inset:0;background:${COLORS.scrim};`));
    root.insertBefore(bleed, root.firstChild);
    return;
  }
  // The Figma crop (2469 × 4390, centred) inside the frame itself.
  const bg = el('img', 'position:absolute;left:calc(50% - 29.5px);top:calc(50% - 45px);width:2469px;height:4390px;' +
    'transform:translate(-50%,-50%);object-fit:cover;max-width:none;pointer-events:none;');
  bg.src = UI_ASSETS.bgCamp; bg.alt = '';
  frame.append(bg, el('div', `position:absolute;inset:0;background:${COLORS.scrim};`));
}

/** Scrollable grid host (hidden scrollbar, momentum scroll; drag to scroll with a mouse too). */
export function scroller(css: string): HTMLElement {
  const s = el('div', 'overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;' +
    'scrollbar-width:none;' + css);
  s.classList.add('chonk-scroll');
  dragToScroll(s);
  if (!document.getElementById('chonk-scroll-style')) {
    const st = document.createElement('style');
    st.id = 'chonk-scroll-style';
    st.textContent = '.chonk-scroll::-webkit-scrollbar{display:none}';
    document.head.appendChild(st);
  }
  return s;
}

// ── Character Select ────────────────────────────────────────────────────────

export interface CharacterSelectOptions {
  characters: CharacterEntry[];
  selectedId: string;
  coins: number;
  title?: string;
  onSelect?: (id: string) => void;
  onBack?: () => void;
  onGetMore?: () => void;
  onAddCoins?: () => void;
}

export class CharacterSelectScreen extends StoreScreen {
  private grid: HTMLElement;
  private selected: string;

  constructor(host: HTMLElement, private opts: CharacterSelectOptions) {
    super(host);
    this.selected = opts.selectedId;
    const f = this.frame;

    campBackdrop(f);

    // Title block + card grid (1022 wide, anchored to the frame centre like Figma).
    const block = el('div', 'position:absolute;left:50%;width:1022px;transform:translateX(-50%);');
    const header = critterHeader(opts.title ?? 'Select a Chonkimal!', { style: PLAQUE_SCREEN });
    header.root.style.cssText += 'position:absolute;left:101px;top:0.41px;';
    const content = scroller('position:absolute;left:0;top:483px;width:1022px;bottom:0;' +
      'display:flex;flex-direction:column;gap:40px;align-items:center;padding:0 20px 60px;');
    this.grid = el('div', 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:20px;row-gap:40px;' +
      'width:100%;flex-shrink:0;padding-bottom:8px;');
    content.append(this.grid, outlinePill('Get More!', () => opts.onGetMore?.()));
    block.append(content, header.root);
    f.appendChild(block);

    // Header row (back + wallet).
    const row = headerRow({ backSize: 80, coins: opts.coins, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins });
    this.wallet = row.wallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';
    f.appendChild(row.root);

    this.render();
    this.mount((h) => {
      // Figma: block centred at 50% − 112.5 (top 238 on a 2340 frame); never under the header row.
      const top = Math.max(160, h / 2 - 112.5 - 819.5);
      block.style.top = `${top}px`;
      block.style.height = `${h - top}px`;
    });
  }

  get selectedId(): string { return this.selected; }

  select(id: string): void {
    this.selected = id;
    this.render();
    this.opts.onSelect?.(id);
  }

  private render(): void {
    this.grid.replaceChildren(...this.opts.characters.map((c) => itemCard({
      variant: 'select', name: c.name, art: c.art,
      footer: selectFooter(c.id === this.selected, () => this.select(c.id)),
    })));
  }
}

export function showCharacterSelect(host: HTMLElement, opts: CharacterSelectOptions): CharacterSelectScreen {
  return new CharacterSelectScreen(host, opts);
}

// ── Shop ────────────────────────────────────────────────────────────────────

/** Shop page background (42:4953): kneaded clay over white. */
const SHOP_CLAY: ClayParams = {
  baseColor: [0.8701176643371582, 0.7835293412208557, 0.6698823571205139, 1],
  highlightColor: [1, 1, 1, 1],
  bumpScale: 5.099999904632568, depth: 0.3799999952316284, amount: 0.4399999976158142,
  pattern: 2, smoothness: 1, lightAngle: 104,
};

export interface ShopOptions {
  tabs: ShopTab[];
  coins: number;
  /** Golden pinecone (premium) balance — shows its wallet beside the pony beads. */
  premium?: number;
  onAddPremium?: () => void;
  /** Real-money items (`realPrice`): run the (faked) checkout. The screen's wallets are
   * updated by the caller via setPremium. */
  onBuyReal?: (item: ShopItem, tab: ShopTab) => void;
  title?: string;
  activeTab?: number;
  /** Return true if the purchase went through (the screen then deducts the price from its wallet). */
  onBuy?: (item: ShopItem, tab: ShopTab) => boolean | void;
  onBack?: () => void;
  onAddCoins?: () => void;
  onTabChange?: (index: number) => void;
  /** Items you already own show EQUIP (or IN USE) instead of BUY — e.g. troop gear. */
  itemStatus?: (item: ShopItem) => 'owned' | 'equipped' | null;
  /** Tap EQUIP on an owned item. */
  onEquip?: (item: ShopItem) => void;
}

export class ShopScreen extends StoreScreen {
  private grid: HTMLElement;
  private empty: HTMLElement;
  private tab: number;
  private coins: number;
  private tabs: { setActive(i: number): void } | null = null;

  constructor(host: HTMLElement, private opts: ShopOptions) {
    super(host);
    this.tab = opts.activeTab ?? 0;
    this.coins = opts.coins;
    const f = this.frame;
    f.style.background = '#fff';
    applyTexture(f, clayTexture(SHOP_CLAY, 1080, 2340));
    f.style.cssText += 'display:flex;flex-direction:column;gap:20px;align-items:center;padding:40px 24px 0;';

    const row = headerRow({ backSize: 60, coins: this.coins, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins, premium: opts.premium, onAddPremium: opts.onAddPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    const header = critterHeader(opts.title ?? 'Chonky Shop', { compact: true });

    const body = el('div', 'display:flex;flex-direction:column;gap:29.07px;align-items:center;flex:1 1 0;min-height:0;width:1032px;');
    const tabs = tabBar(opts.tabs.map((t) => t.label), this.tab, (i) => this.showTab(i));
    this.tabs = tabs;
    // Grid scrolls under the tabs; top padding keeps the corner badges (which poke out 28px) unclipped.
    const scroll = scroller('flex:1 1 0;min-height:0;width:1032px;margin-top:-29.07px;padding:29.07px 21.33px 60px;');
    this.grid = el('div', 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18.75px;width:989.341px;');
    this.empty = el('p', `display:none;font-family:'Fredoka',system-ui,sans-serif;font-weight:600;font-size:36px;` +
      `color:${COLORS.brown};text-align:center;padding-top:80px;`, 'Nothing here yet!');
    scroll.append(this.grid, this.empty);
    body.append(tabs.root, scroll);
    f.append(row.root, header.root, body);

    this.render();
    this.mount();
  }

  setCoins(n: number): void { this.coins = n; super.setCoins(n); }

  /** Switch to a tab (e.g. the Pinecones tab from the premium wallet's "+"). */
  showTab(i: number): void {
    this.tab = i;
    this.tabs?.setActive(i);
    this.render();
    this.opts.onTabChange?.(i);
  }

  private render(): void {
    const tab = this.opts.tabs[this.tab];
    const items = tab?.items ?? [];
    this.empty.style.display = items.length ? 'none' : 'block';
    this.grid.replaceChildren(...items.map((it) => itemCard({
      variant: 'shop', name: it.name, art: it.art, image: it.image, badge: it.badge,
      footer: this.footer(it, tab),
    })));
  }

  private footer(it: ShopItem, tab: ShopTab): HTMLElement {
    const status = this.opts.itemStatus?.(it) ?? null;
    if (status === 'equipped') return priceFooter(it.price, 'dark', () => {}, 'IN USE');
    if (status === 'owned') return priceFooter(it.price, 'blue', () => { this.opts.onEquip?.(it); this.render(); }, 'EQUIP');
    return priceFooter(it.realPrice ?? it.price, it.buyTone ?? 'brown', () => this.buy(it, tab));
  }

  private buy(it: ShopItem, tab: ShopTab): void {
    if (it.realPrice) { this.opts.onBuyReal?.(it, tab); return; }
    const ok = this.opts.onBuy ? this.opts.onBuy(it, tab) : this.coins >= it.price;
    if (ok) this.setCoins(this.coins - it.price);
    if (ok && this.opts.itemStatus) this.render(); // BUY → IN USE / EQUIP
  }
}

export function showShop(host: HTMLElement, opts: ShopOptions): ShopScreen {
  return new ShopScreen(host, opts);
}
