import { AMMO_LIST } from '../../data';
import type { ItemDef, ItemKind } from '../../data/types';
import { EQUIP_SLOTS } from '../../inventory/equipment';
import { itemDef } from '../../inventory/store';
import type { UiCtx } from '../ctx';
import { clear, h } from '../dom';
import { iconEl, iconKeyOf } from '../icons';
import { diffItems } from '../logic';
import { itemDesc, itemHeader, statTable } from './detail';
import type { MenuTab } from './types';

type InvTab = 'weapons' | 'armor' | 'accessories' | 'consumables' | 'keys' | 'ammo';
const TABS: { id: InvTab; label: string; kinds: ItemKind[] }[] = [
  { id: 'weapons', label: 'Weapons', kinds: ['weapon'] },
  { id: 'armor', label: 'Armor', kinds: ['armor'] },
  { id: 'accessories', label: 'Accessories', kinds: ['accessory'] },
  { id: 'consumables', label: 'Consumables', kinds: ['consumable', 'grenade'] },
  { id: 'keys', label: 'Key Items', kinds: ['key'] },
  { id: 'ammo', label: 'Ammo', kinds: [] },
];

/** Inventory tab: category tabs, item list (count + equipped marker), detail with flavor text; Ammo shows reserve/cap. */
export class InventoryTab implements MenuTab {
  readonly title = 'Inventory';
  readonly el = h('div', 'pbody');
  private readonly left = h('div', 'col');
  private readonly right = h('div', 'detail');
  private tab: InvTab = 'weapons';
  private selId: string | null = null;

  constructor(private readonly ctx: UiCtx) {
    this.left.style.width = '300px';
    this.right.style.width = '370px';
    this.el.append(this.left, this.right);
  }

  private equipped(id: string): boolean {
    const { inv } = this.ctx;
    return EQUIP_SLOTS.some((s) => inv.equipment.loadout[s] === id) || inv.belt.slots.includes(id) || inv.pouch.current() === id;
  }

  private items(): ItemDef[] {
    const kinds = TABS.find((t) => t.id === this.tab)!.kinds;
    return this.ctx.inv.store
      .list()
      .map((s) => itemDef(s.id))
      .filter((d): d is ItemDef => !!d && kinds.includes(d.kind))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  refresh(): void {
    clear(this.left);
    const tabs = h('div', 'tabs-inv');
    for (const t of TABS) {
      const b = h('div', `tab${t.id === this.tab ? ' sel' : ''}`, t.label);
      b.style.fontSize = '17px';
      b.style.padding = '2px 6px 1px';
      b.addEventListener('click', () => {
        this.tab = t.id;
        this.selId = null;
        this.refresh();
      });
      tabs.append(b);
    }
    this.left.append(tabs);
    const list = h('div', 'list');
    list.style.maxHeight = '300px';
    if (this.tab === 'ammo') {
      for (const a of AMMO_LIST) {
        const have = this.ctx.combat.ammo.get(a.type);
        const row = h('div', `row${this.selId === a.type ? ' sel' : ''}`, [
          iconEl(`ammo:${a.type}`, 's'),
          h('span', 'grow', a.name),
          h('span', have >= a.cap ? 'gold' : have === 0 ? 'dim' : '', `${have} / ${a.cap}`),
        ]);
        row.addEventListener('click', () => {
          this.selId = a.type;
          this.refresh();
        });
        list.append(row);
      }
    } else {
      const items = this.items();
      if (items.length === 0) list.append(h('div', 'dim', 'Nothing here.'));
      if (!items.some((i) => i.id === this.selId)) this.selId = items[0]?.id ?? null;
      for (const d of items) {
        const n = this.ctx.inv.store.count(d.id);
        const row = h('div', `row${this.selId === d.id ? ' sel' : ''}`, [iconEl(iconKeyOf(d), 's'), h('span', 'grow', d.name)]);
        if (this.equipped(d.id)) row.append(h('span', 'eq', 'E'));
        if (n > 1) row.append(h('span', 'dim', `x${n}`));
        row.addEventListener('click', () => {
          this.selId = d.id;
          this.refresh();
        });
        list.append(row);
      }
    }
    this.left.append(list);
    this.renderDetail();
  }

  private renderDetail(): void {
    clear(this.right);
    this.right.append(h('div', 'sec', 'DETAILS'));
    if (this.tab === 'ammo') {
      const a = AMMO_LIST.find((x) => x.type === this.selId) ?? AMMO_LIST[0]!;
      const have = this.ctx.combat.ammo.get(a.type);
      this.right.append(h('div', 'stat', [iconEl(`ammo:${a.type}`), h('div', 'col', [h('div', 'dname', `${a.name} Ammo`), h('div', 'dim', `${have} / ${a.cap} in reserve`)])]));
      this.right.append(h('div', 'desc', 'Reserve is capped. Ammo drops and crates will not exceed the cap.'));
      const m = h('div', 'meter', [h('i')]);
      (m.firstElementChild as HTMLElement).style.transform = `scaleX(${Math.min(1, have / a.cap)})`;
      this.right.append(m);
      return;
    }
    const def = itemDef(this.selId);
    if (!def) return;
    this.right.append(itemHeader(def, this.ctx.inv.store.count(def.id)), itemDesc(def));
    const rows = diffItems(null, def);
    if (rows.length) this.right.append(statTable(rows, false));
    if (def.kind === 'key') this.right.append(h('div', 'dim', def.opens ? `Opens: ${def.opens}` : 'Opens: nothing, apparently.'));
  }
}
