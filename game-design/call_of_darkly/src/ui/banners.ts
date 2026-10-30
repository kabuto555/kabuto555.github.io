import type { EventBus } from '../core/events';
import { ITEMS_BY_ID } from '../data';
import { h } from './dom';
import './events';
import { iconEl, iconKeyOf, iconUrl } from './icons';
import type { UiComponent } from './types';

export type BannerKind = 'died' | 'bonfireLit' | 'victory' | 'demoComplete' | 'text';

const PRESET: Record<Exclude<BannerKind, 'text'>, { text: string; sub?: string; hold: number }> = {
  died: { text: 'YOU DIED', hold: Infinity }, // until deathScreen 'end'
  bonfireLit: { text: 'BONFIRE LIT', hold: 3 },
  victory: { text: 'VICTORY ACHIEVED', hold: 5 },
  demoComplete: { text: 'DEMO COMPLETE', sub: 'Thanks for playing', hold: 10 },
};

/** Map a free-text banner toast ("Bonfire Lit") to a preset kind, so world code can just emit `toast {kind:'banner'}`. */
export function bannerKindForText(text: string): BannerKind {
  const t = text.trim().toUpperCase();
  if (t.includes('YOU DIED')) return 'died';
  if (t.includes('BONFIRE LIT')) return 'bonfireLit';
  if (t.includes('VICTORY')) return 'victory';
  if (t.includes('DEMO COMPLETE')) return 'demoComplete';
  return 'text';
}

/**
 * Center banners (YOU DIED / BONFIRE LIT / VICTORY ACHIEVED / DEMO COMPLETE placeholders) and the big
 * key-item popup. Fed by `deathScreen`, `banner`, `toast {kind:'banner'}` and `itemPickup` of key items.
 */
export class Banners implements UiComponent {
  readonly el = h('div', 'banners');
  private readonly layer = h('div', 'bn-layer');
  private readonly title = h('div', 't');
  private readonly sub = h('div', 'sub');
  private readonly pop = h('div', 'keypop');
  private readonly popIcon = iconEl('key');
  private readonly k2 = h('div', 'k2');
  private readonly k3 = h('div', 'k3');
  private holdT = 0;
  private popT = 0;
  private died = false;
  private offs: (() => void)[] = [];

  constructor() {
    this.layer.append(this.title, this.sub);
    this.popIcon.classList.add('big');
    this.pop.append(this.popIcon, h('div', '', [h('div', 'k1', 'KEY ITEM'), this.k2, this.k3]));
    this.el.append(this.layer, this.pop);
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.el);
    this.offs.push(
      bus.on('deathScreen', (e) => {
        if (e.phase === 'start') {
          this.died = true;
          this.show('died');
        } else {
          this.died = false;
          this.hide();
        }
      }),
      bus.on('banner', (e) => this.show(e.kind, e.text, e.sub, e.hold)),
      bus.on('toast', (e) => {
        if (e.kind === 'banner') {
          const k = bannerKindForText(e.text);
          this.show(k, k === 'text' ? e.text : undefined);
        }
      }),
      bus.on('itemPickup', (e) => {
        const def = ITEMS_BY_ID.get(e.itemId);
        if (def?.kind === 'key') this.keyPopup(def.name, def.description, iconKeyOf(def));
      }),
    );
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.el.remove();
  }

  show(kind: BannerKind, text?: string, sub?: string, hold?: number): void {
    const p = kind === 'text' ? { text: text ?? '', sub, hold: 3 } : PRESET[kind];
    this.title.textContent = text ?? p.text;
    this.sub.textContent = sub ?? ('sub' in p ? (p.sub ?? '') : '');
    this.layer.className = `bn-layer ${kind}`;
    void this.layer.offsetWidth;
    this.layer.classList.add('on');
    this.holdT = hold ?? (kind === 'died' && !this.died ? 4 : p.hold);
  }

  hide(): void {
    this.layer.classList.remove('on');
    this.holdT = 0;
  }

  /** Big centered key-item popup. */
  keyPopup(name: string, description: string, icon: string): void {
    this.popIcon.src = iconUrl(icon);
    this.k2.textContent = name;
    this.k3.textContent = description;
    this.pop.classList.add('on');
    this.popT = 4.5;
  }

  get active(): boolean {
    return this.layer.classList.contains('on') || this.pop.classList.contains('on');
  }

  update(dt: number): void {
    if (this.holdT > 0 && Number.isFinite(this.holdT)) {
      this.holdT -= dt;
      if (this.holdT <= 0 && !this.died) this.hide();
    }
    if (this.popT > 0) {
      this.popT -= dt;
      if (this.popT <= 0) this.pop.classList.remove('on');
    }
  }
}
