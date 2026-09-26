// Store building blocks shared by Character Select (Figma 42:4728) and the Shop
// (42:4953): header row with back button + coin wallet, item cards, badges,
// category tabs and the outlined pill button. Design px, 1:1 with Figma.

import { COLORS, DEFAULT_HUD_TONE, FONT, HUD_TONES, UI_ASSETS, buttonRadius, chonkArt, textOutline, type HudTone } from './theme';
import { el, pressable } from './components';
import { applyTexture, clayTexture, feltTexture, type ClayParams, type FeltParams } from './shader-textures';
import { beadIcon, pineconeIcon } from './bead-art';

// ── Header row ──────────────────────────────────────────────────────────────

/** Round blue back button (the Figma "close-btn"). 80 on Character Select, 60 on the Shop. */
export function backButton(size: number, onTap: () => void, tone: HudTone = DEFAULT_HUD_TONE): HTMLElement {
  const root = el('div', `position:relative;width:${size}px;height:${size}px;flex-shrink:0;cursor:pointer;` +
    'touch-action:manipulation;transition:transform 60ms;');
  const img = el('img', `position:absolute;left:0;top:0;width:${size}px;height:${size * 1.092593}px;max-width:none;pointer-events:none;`);
  img.src = HUD_TONES[tone].back; img.alt = 'Back'; img.draggable = false;
  root.appendChild(img);
  pressable(root, size * 0.0926, onTap);
  return root;
}

export interface Wallet { root: HTMLElement; setCoins(n: number): void; }

/** Wallet pill with the "+" get-more button (100 tall, or 70 `compact`). Pony beads by default;
 * pass `premium` for the combined wallet — [pinecone] premium · [bead] pony beads · [+] —
 * and `setPremium` updates the pinecone count. `currency: 'premium'` = pinecones only. */
export function wallet(coins: number, onAdd?: () => void,
                       opts: { compact?: boolean; tone?: HudTone; currency?: 'soft' | 'premium'; premium?: number } = {}):
    Wallet & { setPremium(n: number): void } {
  const t = HUD_TONES[opts.tone ?? DEFAULT_HUD_TONE];
  const both = opts.premium !== undefined;
  const root = el('div',
    `background:${t.fill};border:5.334px solid ${t.rim};box-shadow:0 8.001px 0 ${t.shadow};` +
    `display:flex;height:${opts.compact ? 70 : 100}px;align-items:center;justify-content:space-between;` +
    `padding:0 20px 0 ${both ? 30 : 40}px;gap:24px;border-radius:34px;${both ? 'min-width:304.4px;' : 'width:304.4px;'}flex-shrink:0;`);
  const amountCss = `font-family:${FONT};font-weight:600;font-size:46px;line-height:normal;color:#fff;white-space:nowrap;`;
  const group = (icon: HTMLElement) => {
    const g = el('div', 'display:flex;gap:14px;align-items:center;');
    const amount = el('p', amountCss);
    g.append(icon, amount);
    return { g, amount };
  };
  // Figma's "$" coin chip is superseded by the currency icons (pony bead / golden pinecone).
  const left = el('div', 'display:flex;gap:30px;align-items:center;');
  const soft = group(opts.currency === 'premium' ? pineconeIcon(56) : beadIcon(50));
  const prem = both ? group(pineconeIcon(56)) : null;
  if (prem) left.appendChild(prem.g);
  left.appendChild(soft.g);
  const plus = el('img', 'width:65.116px;height:70px;flex-shrink:0;cursor:pointer;transition:transform 60ms;');
  plus.src = t.plus; plus.alt = both || opts.currency === 'premium' ? 'Get more' : 'Get pony beads'; plus.draggable = false;
  if (onAdd) pressable(plus, 6, onAdd);
  root.append(left, plus);
  const setCoins = (n: number) => { soft.amount.textContent = String(n); };
  const setPremium = (n: number) => { if (prem) prem.amount.textContent = String(n); };
  setCoins(coins);
  setPremium(opts.premium ?? 0);
  return { root, setCoins, setPremium };
}

/** Back button on the left, wallet on the right (1032 wide). Pass `premium` for the combined
 * pinecone + pony-bead wallet (its "+" calls onAddPremium, else onAddCoins). */
export function headerRow(opts: { backSize: number; coins: number; onBack: () => void; onAddCoins?: () => void;
                                  premium?: number; onAddPremium?: () => void }):
    { root: HTMLElement; wallet: Wallet; premiumWallet: Wallet | null } {
  const root = el('div', 'display:flex;align-items:center;justify-content:space-between;width:1032px;flex-shrink:0;');
  const both = opts.premium !== undefined;
  const w = wallet(opts.coins, both ? opts.onAddPremium ?? opts.onAddCoins : opts.onAddCoins,
    both ? { premium: opts.premium } : {});
  root.append(backButton(opts.backSize, opts.onBack), w.root);
  return { root, wallet: w, premiumWallet: both ? { root: w.root, setCoins: w.setPremium } : null };
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export type TinyTone = 'brown' | 'blue' | 'dark';
const TINY_TONES: Record<TinyTone, { bg: string; border: string; shadow: string }> = {
  brown: { bg: COLORS.ready, border: COLORS.readyBorder, shadow: COLORS.readyShadow }, // Shop BUY
  blue:  { bg: COLORS.blue, border: COLORS.blueLight, shadow: COLORS.blueDark },       // Shop BUY (alt)
  dark:  { bg: COLORS.brown, border: COLORS.brownDark, shadow: COLORS.brown },         // Character SELECT
};

/** Small card button (Shop "BUY" / Character Select "SELECT"). */
export function tinyButton(text: string, tone: TinyTone, onTap: () => void, fill = false): HTMLElement {
  const t = TINY_TONES[tone];
  const sel = tone === 'dark';
  const root = el('div',
    `background:${t.bg};border:${sel ? 2 : 2.584}px solid ${t.border};box-shadow:0 ${sel ? 4 : 3.876}px 0 ${t.shadow};` +
    `display:flex;align-items:center;justify-content:center;border-radius:${sel ? 16 : 15.505}px;` +
    `padding:${sel ? '11px 21px' : '10.337px 20.673px'};${fill ? 'flex:1 0 0;min-width:1px;' : 'flex-shrink:0;'}` +
    'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;');
  root.appendChild(el('p',
    `font-family:${FONT};font-weight:600;font-size:${sel ? 16.001 : 15.505}px;line-height:normal;color:#fff;` +
    'white-space:nowrap;pointer-events:none;', text));
  pressable(root, 3.9, onTap);
  return root;
}

/** Character Select "Currently Using" state: cream pill, outlined white label (240 × 40). */
export function currentPill(text = 'Currently  Using'): HTMLElement {
  const root = el('div',
    `background:${COLORS.cream};border:2.293px solid ${COLORS.brown};box-shadow:0 2.866px 0 ${COLORS.readyShadow};` +
    'display:flex;height:40px;align-items:center;justify-content:center;padding:11px 21px;border-radius:16px;width:240px;flex-shrink:0;');
  root.appendChild(el('p',
    `font-family:${FONT};font-weight:700;font-size:20px;line-height:normal;color:#fff;white-space:pre;` +
    `text-shadow:${textOutline(COLORS.brownDark, 1.6)};`, text));
  return root;
}

/**
 * Big button presets from the system (Figma "Button Light" / "Button"). Corners follow
 * BUTTON_RADIUS (chunky rounded rectangle), not Figma's full-pill radius on Get More / Log Out.
 */
export const PILLS = {
  /** Character Select "Get More!" — 376 wide (Figma 71 tall; 84 so it's as chunky as Next/Back). */
  getMore: { w: 376, h: 84, border: 6.056, pad: '0 67.83px', font: 42.5, outline: 3.4,
    tone: 'light', shadow: [12.113, 16.957, 16.15] },
  /** Leaderboard "DONE!" — 593 × 180 (Button Light 42:4915). */
  done: { w: 593, h: 180, border: 11.25, pad: '45px 126px', font: 76.5, outline: 5.6,
    tone: 'light', shadow: [16, 18, 30] },
  /** Camp HUD "Play <mode>" prompt — cream, sized to its label (w 0 = auto). */
  play: { w: 0, h: 120, border: 8.5, pad: '0 72px', font: 56, outline: 4.4,
    tone: 'light', shadow: [12, 16, 18] },
  /** Settings "Log Out" — full-width brown, 837 × 91. */
  wide: { w: 837.315, h: 91.013, border: 11, pad: '45px 126px', font: 45.506, outline: 3.4,
    tone: 'brown', shadow: [10, 0, 0] },
  /** List-row action (Camp Pass "Claim!") — the Log Out button scaled down to sit in a card row. */
  row: { w: 0, h: 88, border: 6.5, pad: '0 38px', font: 36, outline: 3, tone: 'brown', shadow: [10, 0, 0] },
  /** Small row action (tier cards, "Claim all!" beside a section heading). */
  rowSmall: { w: 0, h: 68, border: 5.5, pad: '0 28px', font: 28, outline: 2.4, tone: 'brown', shadow: [8, 0, 0] },
} as const;
export type PillPreset = keyof typeof PILLS;
/** Pill fills: cream (Button Light), wood brown (Button), or the Shop's blue BUY tone (premium). */
export type PillTone = 'light' | 'brown' | 'blue';
const PILL_TONES: Record<PillTone, { bg: string; border: string; shadow: string; outline: string }> = {
  light: { bg: COLORS.cream, border: COLORS.brown, shadow: COLORS.brownDark, outline: COLORS.brownDark },
  brown: { bg: COLORS.ready, border: COLORS.readyBorder, shadow: COLORS.readyShadow, outline: COLORS.brownDark },
  blue:  { bg: COLORS.blue, border: COLORS.blueLight, shadow: COLORS.blueDark, outline: COLORS.blueDark },
};

/** Outlined-label pill button in one of the system sizes; `tone` overrides the preset's fill. */
export function pillButton(text: string, onTap: () => void, preset: PillPreset = 'getMore', tone?: PillTone): HTMLElement {
  const p = PILLS[preset];
  const t = PILL_TONES[tone ?? p.tone];
  const [drop, blurY, blur] = p.shadow;
  const root = el('div',
    `background:${t.bg};border:${p.border}px solid ${t.border};` +
    `box-shadow:0 ${drop}px 0 0 ${t.shadow}` +
    (blur ? `,0 ${blurY}px ${blur}px 0 rgba(0,0,0,0.2);` : ';') +
    `display:flex;height:${p.h}px;align-items:center;justify-content:center;padding:${p.pad};` +
    `border-radius:${buttonRadius(p.h)}px;width:${p.w ? `${p.w}px` : 'auto'};flex-shrink:0;cursor:pointer;user-select:none;touch-action:manipulation;` +
    'transition:transform 60ms;');
  root.appendChild(el('p',
    `font-family:${FONT};font-weight:700;font-size:${p.font}px;line-height:normal;text-align:center;color:#fff;` +
    `white-space:nowrap;pointer-events:none;text-shadow:${textOutline(t.outline, p.outline)};`, text));
  pressable(root, drop, onTap);
  return root;
}

/** Outlined cream pill — Character Select "Get More!" (376 × 71). */
export function outlinePill(text: string, onTap: () => void): HTMLElement {
  return pillButton(text, onTap, 'getMore');
}

// ── Badges ──────────────────────────────────────────────────────────────────

const BADGE_FELT: FeltParams = { feltColor: [0.545098066329956, 0.5215686559677124, 0.3529411852359772, 1], grainIntensity: 0.7 };

export type BadgeSpec = { kind: 'new' } | { kind: 'sale'; percent: number };

/** Rotated star sticker in a card's top-left corner — "NEW" (felt) or "50% OFF". */
export function badge(spec: BadgeSpec): HTMLElement {
  const wrap = el('div',
    'position:absolute;left:-25px;top:-27.68px;width:126.005px;height:95.366px;display:flex;align-items:center;' +
    'justify-content:center;pointer-events:none;z-index:1;');
  const b = el('div', 'position:relative;width:116px;height:80px;transform:rotate(-8deg);flex:none;');
  const isNew = spec.kind === 'new';
  const star = el('div', `position:absolute;inset:${isNew ? '1.19% 3.39%' : '2.87% 3.84%'};`);
  const img = el('img', 'position:absolute;inset:0;width:100%;height:100%;');
  img.src = isNew ? UI_ASSETS.badgeStarNew : UI_ASSETS.badgeStarSale; img.alt = '';
  star.appendChild(img);
  if (isNew) {
    // Felt grain clipped to the star silhouette, 60% over the flat fill.
    const felt = el('div', 'position:absolute;inset:0;opacity:0.6;');
    const mask = `url("${UI_ASSETS.badgeStarNew}") center / 100% 100% no-repeat`;
    felt.style.setProperty('mask', mask);
    felt.style.setProperty('-webkit-mask', mask);
    applyTexture(felt, feltTexture(BADGE_FELT, 108, 78));
    star.appendChild(felt);
  }
  const txt = `font-family:${FONT};font-weight:700;color:${COLORS.badgeText};line-height:normal;position:absolute;` +
    'transform:translate(-50%,-50%);white-space:nowrap;';
  const label = el('div', 'position:absolute;left:50%;top:50%;width:80px;height:40px;transform:translate(-50%,-50%);');
  if (isNew) {
    label.appendChild(el('p', txt + `left:40.1px;top:20.2px;font-size:34.4px;text-shadow:0 0 2.24px ${COLORS.badgeShadow};`, 'NEW'));
  } else {
    label.append(
      el('p', txt + `left:27px;top:18.39px;font-size:50.401px;text-shadow:0 0 2.24px ${COLORS.badgeShadow};`, String(spec.percent)),
      el('p', txt + `left:66.68px;top:13.09px;font-size:26.462px;text-shadow:0 0 1.176px ${COLORS.badgeShadow};`, '%'),
      el('p', txt + `left:66.76px;top:31.97px;font-size:13.016px;text-shadow:0 0 0.929px ${COLORS.badgeShadow};`, 'OFF'),
    );
  }
  b.append(star, label);
  wrap.appendChild(b);
  return wrap;
}

// ── Item card ───────────────────────────────────────────────────────────────

/** Character Select art tile: faint kneaded-clay texture at 20% over cream (42:4736). */
const CARD_ART_CLAY: ClayParams = {
  baseColor: [0.8143064975738525, 0.7447535991668701, 0.6213530898094177, 1],
  highlightColor: [0.9290000200271606, 0.8980000019073486, 0.8349999785423279, 1],
  bumpScale: 4.800000190734863, depth: 0.9300000071525574, amount: 0.9199999570846558,
  pattern: 2, smoothness: 1, lightAngle: 135,
};

export interface ItemCardOptions {
  name: string;
  /** Character id → assets/ui/chonks/<id>.png (or pass `image`). */
  art?: string;
  image?: string;
  /** 'select' = Character Select card, 'shop' = Shop card. */
  variant: 'select' | 'shop';
  badge?: BadgeSpec;
  /** The card's bottom row (SELECT / Currently Using / price + BUY). */
  footer: HTMLElement;
}

/** White store card: art tile, name, footer row. Sizes follow the Figma variant. */
export function itemCard(o: ItemCardOptions): HTMLElement {
  const shop = o.variant === 'shop';
  const card = el('div',
    `background:#fff;border:4px solid ${COLORS.cardBorder};box-shadow:0 7.753px 0 ${COLORS.cardShadow};` +
    'display:flex;flex-direction:column;gap:15.505px;align-items:center;padding:20.673px;border-radius:25.842px;' +
    'position:relative;min-width:0;');
  const artW = shop ? 261.002 : 269.354, artH = shop ? 202.858 : 209.349;
  const art = el('div', `position:relative;width:${artW}px;height:${artH}px;flex-shrink:0;border-radius:${shop ? 15.505 : 16.001}px;` +
    `background:${COLORS.cardArt};`);
  if (!shop) {
    const clay = el('div', 'position:absolute;inset:0;opacity:0.2;border-radius:inherit;');
    applyTexture(clay, clayTexture(CARD_ART_CLAY, artW, artH));
    art.appendChild(clay);
  }
  const img = el('img',
    `position:absolute;left:${shop ? 48.62 : 50.17}px;top:0;width:${shop ? 163.768 : 169.009}px;height:${artH}px;` +
    'object-fit:cover;pointer-events:none;');
  // Non-portrait art (e.g. pinecone packs) fills the whole tile instead of the portrait crop.
  if (o.image) img.style.cssText += 'left:0;width:100%;object-fit:contain;';
  img.src = o.image ?? chonkArt(o.art ?? ''); img.alt = o.name; img.draggable = false; img.loading = 'lazy';
  art.appendChild(img);
  const name = el('p',
    `font-family:${FONT};font-weight:600;font-size:${shop ? 20.673 : 21.335}px;line-height:normal;color:${COLORS.ink};` +
    'width:100%;word-break:break-word;', o.name);
  card.append(art, name, o.footer);
  if (o.badge) card.appendChild(badge(o.badge));
  return card;
}

/** Shop footer: pony bead + price on the left, BUY on the right. A string price (e.g. "$4.99")
 * is a real-money price and shows without the bead. */
export function priceFooter(price: number | string, tone: TinyTone, onBuy: () => void, label = 'BUY'): HTMLElement {
  const row = el('div', 'display:flex;align-items:center;justify-content:space-between;width:100%;');
  const left = el('div', 'display:flex;gap:5.168px;align-items:center;');
  const coin = el('div', `background:${COLORS.coin};display:flex;align-items:center;justify-content:center;` +
    'border-radius:12.921px;width:25.842px;height:25.842px;flex-shrink:0;');
  coin.appendChild(el('p', `font-family:${FONT};font-weight:600;font-size:15.505px;line-height:normal;color:${COLORS.ink};`, '$'));
  void coin; // Figma's "$" chip, superseded by the pony bead
  if (typeof price === 'number') left.appendChild(beadIcon(26));
  left.append(el('p', `font-family:${FONT};font-weight:600;font-size:20px;line-height:normal;color:${COLORS.ink};`, String(price)));
  row.append(left, tinyButton(label, tone, onBuy));
  return row;
}

/** Character Select footer: full-width SELECT, or the "Currently Using" pill. */
export function selectFooter(current: boolean, onSelect: () => void): HTMLElement {
  const row = el('div', 'display:flex;align-items:center;justify-content:space-between;width:240px;flex-shrink:0;');
  row.appendChild(current ? currentPill() : tinyButton('SELECT', 'dark', onSelect, true));
  return row;
}

// ── Tabs ────────────────────────────────────────────────────────────────────

/** Segmented category tabs (1000 × 77.52). Returns a setter for the active tab. */
export function tabBar(labels: string[], active: number, onChange: (i: number) => void,
                       opts: { width?: number; scale?: number } = {}): { root: HTMLElement; setActive(i: number): void } {
  const k = opts.scale ?? 1;
  const px = (n: number) => `${n * k}px`;
  const root = el('div',
    `background:${COLORS.cream};border:${px(2.907)} solid ${COLORS.cardBorder};box-shadow:0 ${px(3.876)} 0 ${COLORS.cardShadow};` +
    `display:flex;height:${px(77.519)};align-items:center;padding:${px(5.814)};border-radius:${px(15.504)};` +
    `width:${opts.width ?? 1000}px;flex-shrink:0;`);
  const tabs = labels.map((label, i) => {
    const t = el('div', 'flex:1 0 0;min-width:1px;display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;touch-action:manipulation;user-select:none;');
    t.appendChild(el('p', `font-family:${FONT};font-weight:600;font-size:${px(27.132)};line-height:normal;white-space:nowrap;pointer-events:none;`, label));
    t.addEventListener('pointerup', (e) => { e.stopPropagation(); setActive(i); onChange(i); });
    root.appendChild(t);
    return t;
  });
  const setActive = (a: number) => tabs.forEach((t, i) => {
    const on = i === a;
    t.style.height = on ? px(66) : px(69.767);
    t.style.padding = on ? `${px(8)} ${px(9.69)}` : `${px(7.752)} ${px(9.69)}`;
    t.style.borderRadius = on ? px(12) : px(11.628);
    t.style.background = on ? COLORS.brown : 'transparent';
    (t.firstChild as HTMLElement).style.color = on ? COLORS.cream : COLORS.brownInk;
  });
  setActive(active);
  return { root, setActive };
}
