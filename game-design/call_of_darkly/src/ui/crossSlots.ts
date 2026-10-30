import type { ItemId } from '../data/types';
import { BELT_SIZE } from '../inventory/belt';
import { itemDef } from '../inventory/store';
import type { UiCtx } from './ctx';
import { h, kc } from './dom';
import { iconUrl } from './icons';

interface Slot {
  el: HTMLElement;
  img: HTMLImageElement;
  cnt: HTMLElement;
  ghost?: HTMLImageElement;
  side?: HTMLElement;
  under?: HTMLElement;
  sig: string;
}

const nameOf = (id: ItemId | null): string => (id ? itemDef(id)?.name ?? id : '');
const shortName = (id: ItemId | null): string => nameOf(id).replace(/\s*\(.*\)$/, '');

/**
 * DS1 quick-slot cross (bottom-left). Left = left-hand weapon/shield (+ ghost off-slot), Right = Estus,
 * Top = grenade, Bottom = quick item, Center = flashes whatever was just cycled. Keycaps come from the
 * live bindings and carry the `hint` class (fade with the key-hint setting).
 */
export class CrossSlots {
  readonly el = h('div', 'cross');
  private readonly top = this.mk('t');
  private readonly left = this.mk('l', true);
  private readonly mid = this.mk('m');
  private readonly right = this.mk('r');
  private readonly bot = this.mk('b');
  private flashT = 0;
  private started = false;

  constructor(
    private readonly ctx: UiCtx,
    /** A slot changed: wake the key hints. */
    private readonly onChange: () => void,
  ) {
    this.el.append(this.top.el, this.left.el, this.mid.el, this.right.el, this.bot.el);
    this.mid.el.classList.add('empty');
  }

  private mk(pos: string, under = false): Slot {
    const el = h('div', `cs ${pos}`);
    const box = h('div', 'box');
    const img = h('img', 'ic') as HTMLImageElement;
    img.draggable = false;
    const cnt = h('span', 'cnt');
    box.append(img, cnt);
    el.append(box);
    const s: Slot = { el, img, cnt, sig: '\0' };
    if (pos === 'l') {
      s.ghost = h('img', 'ic s ghost') as HTMLImageElement;
      box.append(s.ghost);
    }
    if (pos !== 'm') {
      if (under) el.append((s.under = h('div', 'under')));
      else el.append((s.side = h('div', 'side')));
    }
    return s;
  }

  /** Shared: set one slot's icon/count/zero state. */
  private paint(s: Slot, icon: string, count: number | null, zero: boolean, empty: boolean): void {
    s.img.src = iconUrl(icon);
    s.cnt.textContent = count === null ? '' : String(count);
    s.el.classList.toggle('zero', zero);
    s.el.classList.toggle('empty', empty);
  }

  private keys(s: Slot, parts: (string | Node)[]): void {
    const t = s.under ?? s.side!;
    t.textContent = '';
    for (const p of parts) t.append(p);
  }

  /** Items the next cycle would land on. */
  private nextBelt(): ItemId | null {
    const b = this.ctx.inv.belt;
    for (let step = 1; step < BELT_SIZE; step++) {
      const id = b.slots[(b.selected + step) % BELT_SIZE] ?? null;
      if (id && this.ctx.inv.store.count(id) > 0) return id;
    }
    return null;
  }

  private nextGrenade(): ItemId | null {
    const o = this.ctx.inv.pouch.owned();
    const cur = this.ctx.inv.pouch.current();
    if (o.length < 2 || !cur) return null;
    return o[(o.indexOf(cur) + 1) % o.length] ?? null;
  }

  private flashMid(icon: string): void {
    this.mid.img.src = iconUrl(icon);
    this.mid.el.classList.remove('empty');
    this.mid.el.classList.remove('flash');
    void this.mid.el.offsetWidth;
    this.mid.el.classList.add('flash');
    this.flashT = 0.9;
  }

  update(dt: number): void {
    const { ctx } = this;
    const first = !this.started;
    this.started = true;
    let changed = false;

    // Left hand (+ ghost off-slot).
    {
      const c = ctx.combat;
      const cur = c.leftSlots[c.leftIdx] ?? null;
      const off = c.leftSlots[1 - c.leftIdx] ?? null;
      const sig = `${cur}|${off}`;
      if (sig !== this.left.sig) {
        this.left.sig = sig;
        this.paint(this.left, cur ?? 'fist', null, false, !cur);
        const g = this.left.ghost!;
        if (off) {
          g.src = iconUrl(off);
          g.style.display = '';
        } else g.style.display = 'none';
        this.keys(this.left, [kc(ctx.key('leftHand', 1), true), kc(ctx.key('swapLeft', 1), true)]);
        if (!first) {
          changed = true;
          this.flashMid(cur ?? 'fist');
        }
      }
    }
    // Estus.
    {
      const n = ctx.player.state.estusCharges;
      const sig = String(n);
      if (sig !== this.right.sig) {
        this.right.sig = sig;
        this.paint(this.right, n > 0 ? 'estus' : 'estus_empty', n, n <= 0, false);
        this.keys(this.right, [kc(ctx.key('estus', 1), true)]);
        if (!first) changed = true;
      }
    }
    // Grenade pouch.
    {
      const id = ctx.inv.pouch.current();
      const n = id ? ctx.inv.store.count(id) : 0;
      const nx = this.nextGrenade();
      const sig = `${id}|${n}|${nx}`;
      if (sig !== this.top.sig) {
        const idChanged = !this.top.sig.startsWith(`${id}|`);
        this.top.sig = sig;
        this.paint(this.top, id ?? 'frag_grenade', id ? n : null, !!id && n <= 0, !id);
        this.keys(this.top, [kc(ctx.key('throwGrenade', 1), true), kc(ctx.key('cycleGrenade', 1), true), nx ? h('span', 'nxt hint', ` ▸ ${shortName(nx)}`) : '']);
        if (!first && idChanged) {
          changed = true;
          if (id) this.flashMid(id);
        }
      }
    }
    // Quick item belt.
    {
      const id = ctx.inv.belt.current();
      const n = id ? ctx.inv.store.count(id) : 0;
      const nx = this.nextBelt();
      const sig = `${id}|${n}|${nx}`;
      if (sig !== this.bot.sig) {
        const idChanged = !this.bot.sig.startsWith(`${id}|`);
        this.bot.sig = sig;
        this.paint(this.bot, id ?? 'fist', id ? n : null, !!id && n <= 0, !id);
        if (!id) this.bot.img.style.opacity = '0';
        else this.bot.img.style.opacity = '';
        this.keys(this.bot, [kc(ctx.key('useQuick', 1), true), kc(ctx.key('cycleQuick', 1), true), nx ? h('span', 'nxt hint', ` ▸ ${shortName(nx)}`) : '']);
        if (!first && idChanged) {
          changed = true;
          if (id) this.flashMid(id);
        }
      }
    }

    if (changed) this.onChange();
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.mid.el.classList.remove('flash');
        this.mid.el.classList.add('empty');
        this.mid.img.removeAttribute('src');
      }
    }
  }
}
