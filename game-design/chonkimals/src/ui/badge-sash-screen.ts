// Merit Badge sash — the achievements screen (opened from the camp HUD or a badge toast).
// Over the camp backdrop:
//   header row (back · wallets), title plaque,
//   the rank card (scout rank · badges earned · merit points · badges to the next rank),
//   then the sash itself: a khaki twill band cut on the diagonal at the shoulder, stitched
//   down both edges, with an embroidered ribbon per category and its badges sewn on below.
// Unearned badges are empty stitched spots (secret ones a "?"). Tap any badge for its card:
// how to earn it, progress, when you earned it. Newly earned badges wear a NEW tag until
// the sash is closed.

import { COLORS, FONT, textOutline } from './theme';
import { el, headerPlaque, pressable, PLAQUE_SCREEN } from './components';
import { headerRow } from './store-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import { meritPatch } from './merit-badge';
import { economy, premium } from '../economy';
import { achievements, type BadgeView } from '../achievements/achievements';
import { BADGES, CATEGORIES, CATEGORY_ORDER, rankFor } from '../achievements/content';

export interface BadgeSashOptions {
  onAddCoins?: () => void;
  onGetPremium?: () => void;
  /** Scroll to this badge and open its card (tapping its toast). */
  focus?: string;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
const PAPER = '#fff8ea';
const INK = '#6d4a30';
const SOFT_INK = '#8a6a52';
const SASH = '#7b8a45';
const SASH_DARK = '#556132';
const THREAD = 'rgba(255,244,210,0.6)';
const SASH_W = 880;
const PATCH = 172;
const SHOULDER = 150; // how far the diagonal cut drops across the sash

export class BadgeSashScreen extends StoreScreen {
  private rankCard: HTMLElement;
  private body: HTMLElement;
  private sheet: HTMLElement | null = null;
  private patches = new Map<string, HTMLElement>();

  constructor(host: HTMLElement, opts: BadgeSashOptions = {}) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    const col = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;');
    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => this.close(),
      onAddCoins: opts.onAddCoins, premium: premium.balance, onAddPremium: opts.onGetPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;

    const plaque = headerPlaque('Merit Badges', PLAQUE_SCREEN, 0.84, 64);
    plaque.root.style.cssText += 'position:relative;left:auto;top:auto;margin-top:26px;';

    this.rankCard = el('div', `width:1000px;box-sizing:border-box;margin-top:22px;background:${PAPER};border:6px solid ${COLORS.cardBorder};` +
      `box-shadow:0 10px 0 ${COLORS.cardShadow};border-radius:44px;padding:24px 30px;display:flex;align-items:center;gap:28px;flex-shrink:0;`);
    this.body = scroller('flex:1 1 0;min-height:0;width:1032px;display:flex;flex-direction:column;align-items:center;' +
      'padding:34px 0 120px;box-sizing:border-box;');

    col.append(row.root, plaque.root, this.rankCard, this.body);
    f.appendChild(col);
    this.render();
    const unsubs = [
      economy.subscribe((n) => this.setCoins(n)),
      premium.subscribe((n) => this.setPremium(n)),
      achievements.subscribe(() => { if (!this.sheet) this.render(); }),
    ];
    this.onClose(() => { unsubs.forEach((u) => u()); achievements.markViewed(); });
    this.mount();
    const focus = opts.focus && BADGES.find((b) => b.id === opts.focus);
    if (focus) requestAnimationFrame(() => {
      this.patches.get(focus.id)?.scrollIntoView({ block: 'center' });
      this.openCard(achievements.view(focus));
    });
  }

  private render(): void {
    this.renderRankCard();
    const top = this.body.scrollTop;
    this.patches.clear();
    this.body.replaceChildren(this.sash());
    this.body.scrollTop = top;
  }

  private renderRankCard(): void {
    const n = achievements.earnedCount, rank = rankFor(n);
    const emblem = el('div', `width:150px;height:150px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;` +
      `justify-content:center;font-size:84px;background:radial-gradient(circle at 40% 35%,#a3b263,${SASH});` +
      `border:8px solid ${SASH_DARK};box-shadow:inset 0 0 0 4px ${THREAD},0 6px 0 rgba(0,0,0,0.2);`, '⚜️');
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;');
    mid.append(
      el('p', `${TEXT}font-weight:700;font-size:26px;color:${SOFT_INK};letter-spacing:1px;`, 'SCOUT RANK'),
      el('p', `${TEXT}font-weight:700;font-size:46px;color:${INK};margin-top:-8px;`, rank.title),
      progressBar(n, achievements.total, 28),
      el('p', `${TEXT}font-weight:600;font-size:26px;color:${SOFT_INK};`, rank.next
        ? `${n} / ${achievements.total} badges · ${rank.next.at - n} more to ${rank.next.title}`
        : `${n} / ${achievements.total} badges · the highest rank in camp!`),
    );
    const pts = el('div', 'display:flex;flex-direction:column;align-items:center;flex-shrink:0;');
    pts.append(
      el('p', `${TEXT}font-weight:700;font-size:54px;color:#fff;text-shadow:${textOutline(SASH_DARK, 3)};`, String(achievements.points)),
      el('p', `${TEXT}font-weight:700;font-size:22px;color:${SOFT_INK};`, 'MERIT POINTS'),
    );
    this.rankCard.replaceChildren(emblem, mid, pts);
  }

  /** The sash: shoulder cut, stitched edges, a ribbon + patch grid per category, a tip at the bottom. */
  private sash(): HTMLElement {
    const sash = el('div', `position:relative;width:${SASH_W}px;flex-shrink:0;box-sizing:border-box;` +
      `padding:${SHOULDER + 30}px 40px 150px;display:flex;flex-direction:column;align-items:center;gap:26px;` +
      `background:repeating-linear-gradient(45deg,rgba(255,255,255,0.05) 0 4px,rgba(0,0,0,0.04) 4px 8px),` +
      `linear-gradient(90deg,${SASH_DARK},${SASH} 9%,#879650 50%,${SASH} 91%,${SASH_DARK});` +
      `clip-path:polygon(0 ${SHOULDER}px,100% 0,100% calc(100% - ${SHOULDER}px),0 100%);`);
    // Stitching down both edges, and along the shoulder seam.
    for (const side of ['left', 'right'] as const) {
      sash.appendChild(el('div', `position:absolute;${side}:18px;top:0;bottom:0;border-${side}:4px dashed ${THREAD};pointer-events:none;`));
    }
    const seam = el('div', `position:absolute;left:0;top:${SHOULDER + 22}px;width:${Math.hypot(SASH_W, SHOULDER)}px;` +
      `border-top:4px dashed ${THREAD};transform-origin:0 0;transform:rotate(${-Math.atan2(SHOULDER, SASH_W)}rad);pointer-events:none;`);
    sash.appendChild(seam);

    for (const cat of CATEGORY_ORDER) {
      const list = BADGES.filter((b) => b.category === cat);
      const got = list.filter((b) => achievements.isEarned(b.id)).length;
      sash.appendChild(ribbon(CATEGORIES[cat].label, `${got}/${list.length}`, CATEGORIES[cat].rim));
      const grid = el('div', `display:grid;grid-template-columns:repeat(4,${PATCH}px);gap:22px 26px;justify-content:center;`);
      for (const b of list) grid.appendChild(this.slot(achievements.view(b)));
      sash.appendChild(grid);
    }
    // The shadow goes on a wrapper (the clip would cut it off the sash itself).
    const wrap = el('div', 'flex-shrink:0;filter:drop-shadow(0 14px 18px rgba(0,0,0,0.35));');
    wrap.appendChild(sash);
    return wrap;
  }

  private slot(v: BadgeView): HTMLElement {
    const earned = v.earnedAt !== null;
    const s = el('div', `position:relative;width:${PATCH}px;height:${PATCH}px;cursor:pointer;touch-action:manipulation;` +
      'transition:transform 60ms;');
    // Sewn on at a slight, stable wobble — hand-stitched, not printed.
    const tilt = earned ? ((hash(v.badge.id) % 11) - 5) : 0;
    const patch = meritPatch(v.badge, PATCH, earned ? 'earned' : 'locked');
    patch.style.transform = `rotate(${tilt}deg)`;
    s.appendChild(patch);
    if (!earned && v.value !== null && v.target && v.value > 0 && !v.badge.secret) {
      s.appendChild(progressRing(v.value / v.target));
    }
    if (v.isNew) {
      const tag = el('p', `${TEXT}position:absolute;right:-6px;top:-4px;font-weight:700;font-size:22px;color:#fff;` +
        'background:#e8483f;border:3px solid #fff;border-radius:14px;padding:0 10px;box-shadow:0 3px 0 rgba(0,0,0,0.25);' +
        'transform:rotate(8deg);pointer-events:none;', 'NEW');
      s.appendChild(tag);
      patch.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }],
        { duration: 1400, iterations: Infinity });
    }
    pressable(s, 6, () => this.openCard(achievements.view(v.badge)));
    this.patches.set(v.badge.id, s);
    return s;
  }

  /** The badge card: big patch, how to earn it, progress / when it was earned. */
  private openCard(v: BadgeView): void {
    const b = v.badge, earned = v.earnedAt !== null, cat = CATEGORIES[b.category];
    const hidden = b.secret && !earned;
    const panel = el('div', `width:860px;box-sizing:border-box;background:${PAPER};border:8px solid ${COLORS.cardBorder};` +
      `box-shadow:0 14px 0 ${COLORS.cardShadow};border-radius:56px;padding:46px 50px 50px;display:flex;flex-direction:column;` +
      'align-items:center;gap:16px;');
    const big = meritPatch(b, 320, earned ? 'earned' : 'locked');
    if (!earned) big.style.background = `radial-gradient(circle,${SASH} 58%,transparent 60%)`;
    big.style.borderRadius = '50%';
    panel.append(
      big,
      el('p', `${TEXT}font-weight:700;font-size:24px;color:#fff;background:${cat.rim};border-radius:14px;padding:2px 16px;` +
        'letter-spacing:1px;margin-top:10px;', `${cat.label.toUpperCase()} · ${b.points} MERIT POINTS`),
      el('p', `${TEXT}font-weight:700;font-size:54px;color:${INK};text-align:center;`, hidden ? 'Secret Badge' : b.name),
      el('p', `${TEXT}font-weight:600;font-size:32px;color:${SOFT_INK};text-align:center;`,
        hidden ? 'Keep exploring camp to discover this one…' : b.blurb),
    );
    if (earned) {
      panel.appendChild(el('p', `${TEXT}font-weight:700;font-size:30px;color:#4f8f33;margin-top:6px;`,
        `✓ Earned ${new Date(v.earnedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    } else if (v.value !== null && v.target !== null && !hidden) {
      const row = el('div', 'width:640px;display:flex;align-items:center;gap:18px;margin-top:8px;');
      const bar = progressBar(v.value, v.target, 28);
      bar.style.flex = '1';
      row.append(bar, el('p', `${TEXT}font-weight:700;font-size:28px;color:${SOFT_INK};white-space:nowrap;`,
        `${fmt(Math.min(v.value, v.target))} / ${fmt(v.target)}`));
      panel.appendChild(row);
    }
    const ok = el('div', `margin-top:14px;background:${COLORS.blue};border:5px solid ${COLORS.blueLight};box-shadow:0 7px 0 ${COLORS.blueDark};` +
      'border-radius:30px;padding:10px 60px;cursor:pointer;touch-action:manipulation;transition:transform 60ms;');
    ok.appendChild(el('p', `${TEXT}font-weight:700;font-size:36px;color:#fff;pointer-events:none;text-shadow:${textOutline(COLORS.blueDark, 2.4)};`,
      'Nice!'));
    panel.appendChild(ok);

    this.sheet?.remove();
    const scrim = el('div', 'position:absolute;inset:0;z-index:5;background:rgba(20,12,6,0.55);display:flex;align-items:center;justify-content:center;');
    scrim.appendChild(panel);
    this.frame.appendChild(scrim);
    this.sheet = scrim;
    panel.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    if (earned) big.animate([{ transform: 'rotate(-14deg) scale(0.7)' }, { transform: 'rotate(4deg) scale(1.06)', offset: 0.7 },
      { transform: 'rotate(0) scale(1)' }], { duration: 420, easing: 'ease-out' });
    const close = () => { scrim.remove(); if (this.sheet === scrim) { this.sheet = null; this.render(); } };
    pressable(ok, 7, close);
    scrim.addEventListener('pointerup', (e) => { if (e.target === scrim) close(); });
  }
}

/** Embroidered category ribbon across the sash. */
function ribbon(label: string, count: string, colour: string): HTMLElement {
  const r = el('div', `position:relative;display:flex;align-items:center;gap:18px;background:${colour};` +
    `border:4px solid rgba(0,0,0,0.18);box-shadow:inset 0 0 0 4px ${colour},inset 0 0 0 6px ${THREAD},0 5px 0 rgba(0,0,0,0.22);` +
    'border-radius:12px;padding:8px 34px;margin-top:10px;');
  r.append(
    el('p', `${TEXT}font-weight:700;font-size:34px;letter-spacing:3px;color:#fff8e6;text-shadow:${textOutline('rgba(0,0,0,0.35)', 2)};`,
      label.toUpperCase()),
    el('p', `${TEXT}font-weight:700;font-size:26px;color:rgba(255,248,230,0.8);`, count),
  );
  return r;
}

/** A thin progress arc round an empty spot (how close you are). */
function progressRing(t: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transform:rotate(-90deg);';
  const c = 2 * Math.PI * 45;
  svg.innerHTML = `<circle cx="50" cy="50" r="45" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round" ` +
    `stroke-dasharray="${c * Math.min(1, t)} ${c}"/>`;
  return svg;
}

function progressBar(value: number, max: number, h: number): HTMLElement {
  const bar = el('div', `height:${h}px;border-radius:${h / 2}px;background:#ead9c3;overflow:hidden;position:relative;` +
    'box-shadow:inset 0 3px 0 rgba(0,0,0,0.08);');
  bar.appendChild(el('div', `position:absolute;left:0;top:0;bottom:0;width:${max ? Math.min(100, (value / max) * 100) : 0}%;` +
    `background:linear-gradient(#a3b263,${SASH});border-radius:${h / 2}px;`));
  return bar;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function showBadgeSash(host: HTMLElement, opts?: BadgeSashOptions): BadgeSashScreen {
  return new BadgeSashScreen(host, opts);
}
