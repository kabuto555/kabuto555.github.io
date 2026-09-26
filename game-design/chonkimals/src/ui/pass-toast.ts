// Camp Pass toasts — the little cards that slide in under the HUD pill when a goal
// makes progress ("Ride the zipline 3/5"), completes ("Goal complete! Tap to claim")
// or a new stamp lands — plus free-form `message` cards (Community / Troop Drive news) and
// merit badges earned (a sash-green card with the embroidered patch).
// One at a time from a short queue; a newer progress card for
// the same goal replaces the queued one. Tapping a card calls onTap (main opens the Camp Pass).
// Laid out in 1080-wide design px (fillScreen) like the camp HUD.

import { COLORS, FONT, textOutline } from './theme';
import { el, fillScreen, pressable } from './components';
import { getSafeLayout } from '../safe-layout';
import type { PassNotice } from '../camp-pass/camp-pass';
import { goalTitle } from '../camp-pass/content';
import { playToastPop } from '../minigame-sounds';
import type { Badge } from '../achievements/content';
import { meritPatch } from './merit-badge';

const TEXT = `font-family:${FONT};line-height:normal;`;
const SHOW_MS = 2600;
const GOLD = '#ffc629';

/** A Camp Pass notice, a free-form card (drives), or a merit badge earned. */
export type ToastNotice = PassNotice
  | { kind: 'message'; key: string; emoji: string; kicker: string; title: string; cta: string }
  | { kind: 'badge'; badge: Badge };

interface Toast { key: string; notice: ToastNotice; }

export class PassToasts {
  private readonly layer: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly slot: HTMLElement;
  private readonly unfit: () => void;
  private queue: Toast[] = [];
  private showing = false;

  /** `muted`: while true, new notices are dropped (e.g. during the first-time arrival). */
  constructor(private host: HTMLElement, private onTap: (n: ToastNotice) => void,
              private muted: () => boolean = () => false) {
    this.layer = el('div', 'position:absolute;inset:0;z-index:45;pointer-events:none;overflow:hidden;');
    this.frame = el('div', 'pointer-events:none;');
    this.slot = el('div', 'position:absolute;left:32px;width:660px;pointer-events:none;');
    this.frame.appendChild(this.slot);
    this.layer.appendChild(this.frame);
    host.appendChild(this.layer);
    this.unfit = fillScreen(this.frame, host, () => {
      const w = host.clientWidth, s = w / 1080;
      const insetTop = getSafeLayout(w, host.clientHeight, host).insets.top / s;
      this.slot.style.top = `${40 + insetTop + 105 + 24}px`; // just under the HUD pill
    });
  }

  push(notice: ToastNotice): void {
    if (this.muted()) return;
    const key = notice.kind === 'stamp' ? `stamp:${notice.tier}` : notice.kind === 'message' ? notice.key
      : notice.kind === 'badge' ? `badge:${notice.badge.id}` : `${notice.kind}:${notice.line.id}`;
    if (notice.kind === 'progress') {
      const i = this.queue.findIndex((t) => t.key === key);
      if (i >= 0) { this.queue[i] = { key, notice }; return; }
      if (this.queue.length >= 3) return; // busy: skip ticks, never completions
    }
    this.queue.push({ key, notice });
    if (!this.showing) this.next();
  }

  dispose(): void { this.unfit(); this.layer.remove(); }

  private next(): void {
    const t = this.queue.shift();
    if (!t) { this.showing = false; return; }
    this.showing = true;
    const card = toastCard(t.notice);
    pressable(card, 0, () => { card.style.visibility = 'hidden'; this.onTap(t.notice); });
    this.slot.appendChild(card);
    if (t.notice.kind !== 'progress') playToastPop();
    card.animate([{ transform: 'translateX(-720px)' }, { transform: 'translateX(12px)', offset: 0.75 }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-out' });
    window.setTimeout(() => {
      const out = card.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-720px)', opacity: 0 }],
        { duration: 240, easing: 'ease-in', fill: 'forwards' });
      out.onfinish = () => { card.remove(); this.next(); };
    }, SHOW_MS);
  }
}

function toastCard(n: ToastNotice): HTMLElement {
  if (n.kind === 'badge') return badgeCard(n.badge);
  const done = n.kind !== 'progress';
  const card = el('div',
    `display:flex;align-items:center;gap:22px;background:#fff8ea;border:6px solid ${done ? GOLD : COLORS.cardBorder};` +
    `box-shadow:0 8px 0 ${done ? '#d99a00' : COLORS.cardShadow},0 14px 24px rgba(0,0,0,0.2);border-radius:36px;` +
    'padding:18px 26px;pointer-events:auto;cursor:pointer;box-sizing:border-box;width:100%;');
  const icon = el('div', `width:92px;height:92px;flex-shrink:0;border-radius:28px;display:flex;align-items:center;` +
    `justify-content:center;font-size:56px;background:${done ? '#fff3c4' : '#fff'};border:4px solid ${done ? GOLD : COLORS.cardBorder};`,
    n.kind === 'stamp' ? '🏕️' : n.kind === 'message' ? n.emoji : n.line.emoji);
  const body = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;');
  const kicker = el('p', `${TEXT}font-weight:700;font-size:24px;color:${done ? '#b27a00' : '#8a6a52'};letter-spacing:1px;`,
    n.kind === 'message' ? n.kicker
      : n.kind === 'stamp' ? 'CAMP PASS · NEW STAMP!' : n.kind === 'complete' ? 'CAMP PASS · GOAL COMPLETE!' : 'CAMP PASS');
  const title = el('p', `${TEXT}font-weight:700;font-size:34px;color:${COLORS.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
    n.kind === 'message' ? n.title : n.kind === 'stamp' ? `Tier ${n.tier} unlocked` : goalTitle(n.line, n.step));
  body.append(kicker, title);
  if (n.kind === 'progress') {
    const bar = el('div', `height:22px;border-radius:11px;background:#ead9c3;overflow:hidden;position:relative;`);
    bar.appendChild(el('div', `position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, (n.value / n.step.target) * 100)}%;` +
      `background:linear-gradient(#8fe06a,#4fb33a);border-radius:11px;`));
    const row = el('div', 'display:flex;align-items:center;gap:14px;');
    bar.style.flex = '1';
    row.append(bar, el('p', `${TEXT}font-weight:700;font-size:26px;color:#8a6a52;`, `${Math.min(n.value, n.step.target)}/${n.step.target}`));
    body.appendChild(row);
  } else {
    body.appendChild(el('p', `${TEXT}font-weight:600;font-size:26px;color:#fff;align-self:flex-start;background:${COLORS.blue};` +
      `border-radius:16px;padding:2px 16px;text-shadow:${textOutline(COLORS.blueDark, 1.6)};`,
      n.kind === 'message' ? n.cta : n.kind === 'stamp' ? 'Tap to claim your reward' : 'Tap to claim'));
  }
  card.append(icon, body);
  return card;
}

const SASH = '#7b8a45';
const SASH_DARK = '#556132';

/** Merit badge earned: the patch on a strip of sash, "MERIT BADGE EARNED!" + its name. */
function badgeCard(b: Badge): HTMLElement {
  const card = el('div',
    `display:flex;align-items:center;gap:22px;background:#fff8ea;border:6px solid ${SASH};` +
    `box-shadow:0 8px 0 ${SASH_DARK},0 14px 24px rgba(0,0,0,0.2);border-radius:36px;` +
    'padding:14px 26px 14px 14px;pointer-events:auto;cursor:pointer;box-sizing:border-box;width:100%;');
  const strip = el('div', `width:124px;height:124px;flex-shrink:0;border-radius:26px;display:flex;align-items:center;justify-content:center;` +
    `background:repeating-linear-gradient(45deg,rgba(255,255,255,0.06) 0 4px,rgba(0,0,0,0.05) 4px 8px),${SASH};` +
    'box-shadow:inset 0 0 0 4px rgba(255,244,210,0.55);');
  const patch = meritPatch(b, 110);
  strip.appendChild(patch);
  patch.animate([{ transform: 'scale(1.8) rotate(-30deg)', opacity: 0 }, { transform: 'scale(0.92) rotate(6deg)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1) rotate(0)' }], { duration: 480, delay: 200, easing: 'ease-out', fill: 'backwards' });
  const body = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;');
  body.append(
    el('p', `${TEXT}font-weight:700;font-size:24px;color:${SASH_DARK};letter-spacing:1px;`, `MERIT BADGE EARNED! · +${b.points}`),
    el('p', `${TEXT}font-weight:700;font-size:36px;color:${COLORS.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, b.name),
    el('p', `${TEXT}font-weight:600;font-size:26px;color:#fff;align-self:flex-start;background:${SASH};` +
      `border-radius:16px;padding:2px 16px;text-shadow:${textOutline(SASH_DARK, 1.6)};`, 'Tap to see your sash'),
  );
  card.append(strip, body);
  return card;
}
