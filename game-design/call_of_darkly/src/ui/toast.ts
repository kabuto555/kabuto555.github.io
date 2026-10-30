import type { EventBus } from '../core/events';
import { ITEMS_BY_ID } from '../data';
import { iconKeyOf, iconEl } from './icons';
import { injectStyle } from './style';
import type { ToastQueue } from './types';

const LIFE = 3.2;
const FADE = 0.5;
const MAX = 6;

interface Entry {
  el: HTMLDivElement;
  countEl: HTMLSpanElement;
  text: string;
  count: number;
  age: number;
}

/**
 * Top-left "Obtained" toast stack (styled by ui/style.ts). Fed by `itemPickup` (name resolved from item
 * data) and `toast` events (`kind: 'banner'` toasts are left to the banner layer). Same-text toasts merge
 * and add their counts. Mount into the HUD's `.toasts` box, or any element (a box is created otherwise).
 */
export class ToastQueueImpl implements ToastQueue {
  private box: HTMLDivElement | null = null;
  private own = false;
  private entries: Entry[] = [];
  private offs: (() => void)[] = [];

  mount(root: HTMLElement, bus: EventBus): void {
    injectStyle();
    if (root.classList.contains('toasts')) this.box = root as HTMLDivElement;
    else {
      const box = document.createElement('div');
      box.className = 'toasts';
      root.appendChild(box);
      this.box = box;
      this.own = true;
    }
    this.offs.push(
      bus.on('itemPickup', (e) => {
        const def = ITEMS_BY_ID.get(e.itemId);
        this.push(def?.name ?? e.itemId, { icon: def ? iconKeyOf(def) : 'item', count: e.count, kind: 'item' });
      }),
      bus.on('toast', (e) => {
        if (e.kind !== 'banner') this.push(e.text, { icon: e.icon, count: e.count, kind: e.kind });
      }),
    );
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    if (this.own) this.box?.remove();
    this.own = false;
    this.box = null;
    this.entries = [];
  }

  push(text: string, opts: { icon?: string; count?: number; kind?: 'item' | 'info' | 'banner' } = {}): void {
    if (!this.box) return;
    const n = opts.count ?? 0;
    const existing = this.entries.find((e) => e.text === text && e.age < LIFE - FADE);
    if (existing) {
      existing.count += n;
      existing.age = 0;
      existing.countEl.textContent = existing.count > 0 ? `x${existing.count}` : '';
      return;
    }
    const el = document.createElement('div');
    el.className = opts.kind === 'info' || opts.kind === 'banner' ? 'toast info' : 'toast';
    if (opts.kind !== 'info' && opts.kind !== 'banner') el.appendChild(iconEl(opts.icon ?? 'item', 's'));
    const name = document.createElement('span');
    name.textContent = text;
    const countEl = document.createElement('span');
    countEl.className = 'cnt';
    countEl.textContent = n > 0 ? `x${n}` : '';
    el.append(name, countEl);
    this.box.appendChild(el);
    this.entries.push({ el, countEl, text, count: n, age: 0 });
    while (this.entries.length > MAX) this.drop(this.entries[0]!);
  }

  private drop(e: Entry): void {
    e.el.remove();
    const i = this.entries.indexOf(e);
    if (i >= 0) this.entries.splice(i, 1);
  }

  update(frameDt: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      e.age += frameDt;
      if (e.age >= LIFE) {
        e.el.remove();
        this.entries.splice(i, 1);
      } else if (e.age > LIFE - FADE) e.el.style.opacity = String((LIFE - e.age) / FADE);
      else if (e.el.style.opacity) e.el.style.opacity = '';
    }
  }

  /** Visible toast texts (debug/tests). */
  get texts(): string[] {
    return this.entries.map((e) => (e.count > 0 ? `${e.text} x${e.count}` : e.text));
  }
}

export function createToastQueue(): ToastQueueImpl {
  return new ToastQueueImpl();
}
