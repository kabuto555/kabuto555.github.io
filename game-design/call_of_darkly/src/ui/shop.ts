import type { EventBus } from '../core/events';
import { AMMO_LIST, GUN_LIST, SHOPS } from '../data';
import type { EquipSlot, ItemDef, ShopDef, ShopEntry } from '../data/types';
import { itemDef, maxStackOf } from '../inventory/store';
import type { ShopTable, UiCtx } from './ctx';
import { clear, h } from './dom';
import { iconEl, iconKeyOf } from './icons';
import { ShopStock, ammoAllFull, buyCheck, diffItems, fmtInt, purchase, type BuyBlock } from './logic';
import { itemDesc, itemHeader, statTable } from './menu/detail';
import { Modal } from './modal';
import './events';
import type { UiComponent } from './types';

export function lookupShop(t: ShopTable, id: string): ShopDef | undefined {
  return t instanceof Map ? t.get(id) : (t as Record<string, ShopDef>)[id];
}

const BLOCK_TEXT: Record<BuyBlock, string> = { soldOut: 'SOLD OUT', poor: 'Not enough souls', maxed: 'Already owned (max)' };

/** The slot a shop item would replace, for the stat diff (first compatible gear slot). */
function compareSlot(def: ItemDef): EquipSlot | null {
  if (def.kind === 'armor') return def.slot;
  if (def.kind === 'weapon') return def.hand === 'R' ? 'right1' : 'left1';
  if (def.kind === 'accessory') return 'accessory1';
  return null;
}

/** Merchant menu (`shopOpen {shopId}`): items with price, owned count, stock, ammo-cap warning, buy. */
export class ShopMenu extends Modal implements UiComponent {
  readonly stock: ShopStock;
  private shop: ShopDef | null = null;
  private selId: string | null = null;
  private readonly title = h('span', 'gold');
  private readonly soulsEl = h('span', 'big-souls');
  private readonly left = h('div', 'col');
  private readonly right = h('div', 'detail');
  private msg = '';
  private offs: (() => void)[] = [];

  constructor(
    ctx: UiCtx,
    private readonly table: ShopTable = SHOPS,
    private readonly persist: { stock?: Record<string, number> | null; onChange?: (stock: Record<string, number>) => void } = {},
  ) {
    super(ctx, 'shop', 640);
    const shops: ShopDef[] = table instanceof Map ? [...table.values()] : Object.values(table);
    this.stock = new ShopStock(shops);
    this.stock.load(persist.stock);
    const head = h('div', 'ptitle', [this.title, h('div', 'sp'), h('span', 'dim', 'SOULS'), this.soulsEl]);
    const close = h('div', 'tab', 'Leave');
    close.addEventListener('click', () => this.hide());
    head.append(close);
    const body = h('div', 'pbody');
    this.left.style.width = '330px';
    this.right.style.width = '270px';
    body.append(this.left, this.right);
    this.panel.append(head, body, h('div', 'pfoot', [h('span', 'kc', ctx.key('menu')), ' leave']));
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.scrim);
    this.offs.push(
      bus.on('shopOpen', (e) => this.openShop(e.shopId)),
      bus.on('soulsChanged', () => this.open && this.render()),
    );
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.scrim.remove();
  }

  openShop(id: string): boolean {
    const s = lookupShop(this.table, id);
    if (!s) return false;
    this.shop = s;
    this.selId = s.entries[0]?.itemId ?? null;
    this.msg = '';
    this.title.textContent = s.merchant.toUpperCase();
    this.render();
    this.show();
    return true;
  }

  private usableAmmo(): Set<string> {
    const s = new Set<string>();
    for (const g of GUN_LIST) if (this.ctx.inv.store.count(g.id) > 0) s.add(g.ammo);
    return s;
  }

  private ammoWarn(def: ItemDef): boolean {
    if (def.kind !== 'consumable' || def.effect.type !== 'ammoRefill') return false;
    return ammoAllFull(AMMO_LIST.map((a) => ({ type: a.type, reserve: this.ctx.combat.ammo.get(a.type), cap: a.cap })), this.usableAmmo());
  }

  private buy(entry: ShopEntry): void {
    const shop = this.shop;
    if (!shop) return;
    const r = purchase(shop, entry, this.ctx.wallet, this.ctx.inv.store, this.stock);
    if (r.ok) {
      this.persist.onChange?.(this.stock.serialize());
      this.ctx.bus.emit('itemPickup', { itemId: entry.itemId, count: r.qty, source: 'shop' });
      this.msg = '';
    } else this.msg = r.reason === 'unknown' ? 'Unknown item.' : BLOCK_TEXT[r.reason];
    this.render();
  }

  /** Up/Down move the selection, Enter buys. Returns true when handled. */
  handleKey(code: string): boolean {
    const shop = this.shop;
    if (!shop || !this.open) return false;
    const i = shop.entries.findIndex((x) => x.itemId === this.selId);
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const n = shop.entries.length;
      if (!n) return true;
      this.selId = shop.entries[(Math.max(0, i) + (code === 'ArrowUp' ? n - 1 : 1)) % n]!.itemId;
      this.msg = '';
      this.render();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (i >= 0) this.buy(shop.entries[i]!);
      return true;
    }
    return false;
  }

  private render(): void {
    const shop = this.shop;
    if (!shop) return;
    const { ctx } = this;
    this.soulsEl.textContent = fmtInt(ctx.wallet.souls);
    clear(this.left);
    this.left.append(h('div', 'sec', 'FOR SALE'));
    const list = h('div', 'list');
    list.style.maxHeight = '300px';
    for (const e of shop.entries) {
      const def = itemDef(e.itemId);
      if (!def) continue;
      const left = this.stock.remaining(shop.id, e.itemId);
      const owned = ctx.inv.store.count(e.itemId);
      const chk = buyCheck(e, ctx.wallet.souls, owned, maxStackOf(def), left);
      const bundle = (e.bundle ?? 1) > 1 ? ` x${e.bundle}` : '';
      const row = h('div', `row${e.itemId === this.selId ? ' sel' : ''}${chk.reason === 'soldOut' ? ' cant' : ''}`, [
        iconEl(iconKeyOf(def), 's'),
        h('span', 'grow', def.name + bundle),
        owned > 0 ? h('span', 'dim', `own ${owned}`) : null,
        chk.reason === 'soldOut' ? h('span', 'bad', 'SOLD OUT') : h('span', chk.reason === 'poor' ? 'shop-price poor' : 'shop-price', fmtInt(e.price)),
      ]);
      // Click selects; clicking the selected row buys (render() replaces nodes, so dblclick never fires).
      row.addEventListener('click', () => {
        if (this.selId === e.itemId) {
          this.buy(e);
          return;
        }
        this.selId = e.itemId;
        this.msg = '';
        this.render();
      });
      list.append(row);
    }
    this.left.append(list);

    clear(this.right);
    const entry = shop.entries.find((x) => x.itemId === this.selId);
    const def = itemDef(this.selId);
    if (!entry || !def) return;
    const owned = ctx.inv.store.count(def.id);
    const left = this.stock.remaining(shop.id, def.id);
    const chk = buyCheck(entry, ctx.wallet.souls, owned, maxStackOf(def), left);
    this.right.append(h('div', 'sec', 'DETAILS'), itemHeader(def, owned || undefined), itemDesc(def));
    const slot = compareSlot(def);
    if (slot) {
      const cur = itemDef(ctx.inv.equipment.loadout[slot]) ?? null;
      const rows = diffItems(cur, def);
      if (rows.length) this.right.append(statTable(rows, true));
    }
    const info = h('div', 'col');
    info.append(h('div', 'dim', `Owned: ${owned}${maxStackOf(def) > 1 ? ` / ${maxStackOf(def)}` : ''}`));
    if (left !== null) info.append(h('div', 'dim', `Stock: ${left}`));
    if (this.ammoWarn(def)) info.append(h('div', 'warn', 'All your ammo is already at cap.'));
    this.right.append(info);
    const btn = h('div', `btn${chk.ok ? '' : ' off'}`, [h('span', '', 'Buy'), h('span', 'shop-price', fmtInt(entry.price))]);
    btn.addEventListener('click', () => this.buy(entry));
    this.right.append(btn);
    const note = chk.ok ? this.msg : this.msg || BLOCK_TEXT[chk.reason!];
    if (note) this.right.append(h('div', 'bad', note));
  }
}
