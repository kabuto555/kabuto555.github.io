import type { EquipSlot, ItemDef, ItemId } from '../../data/types';
import { GRENADE_LIST } from '../../data';
import { EQUIP_SLOTS } from '../../inventory/equipment';
import { itemDef } from '../../inventory/store';
import type { UiCtx } from '../ctx';
import { clear, h } from '../dom';
import { iconEl, iconKeyOf } from '../icons';
import { applyOps, candidatesFor, diffItems, loadFor, planEquip, previewEquip, type LoadPreview } from '../logic';
import { itemDesc, itemHeader, loadBlock, statTable } from './detail';
import type { MenuTab } from './types';

/** Every equipment-screen slot: the 10 gear slots, the grenade pouch, and the 5 quick-item belt slots. */
export type SlotId = EquipSlot | 'grenade' | `quick${0 | 1 | 2 | 3 | 4}`;

const LABEL: Record<string, string> = {
  right1: 'R1', right2: 'R2', left1: 'L1', left2: 'L2', head: 'Head', chest: 'Chest', arms: 'Arms', legs: 'Legs',
  accessory1: 'Acc 1', accessory2: 'Acc 2', grenade: 'Gren', quick0: 'Q1', quick1: 'Q2', quick2: 'Q3', quick3: 'Q4', quick4: 'Q5',
};
const FULL: Record<string, string> = {
  right1: 'Right Hand 1', right2: 'Right Hand 2', left1: 'Left Hand 1', left2: 'Left Hand 2', head: 'Head', chest: 'Chest',
  arms: 'Arms', legs: 'Legs', accessory1: 'Accessory 1', accessory2: 'Accessory 2', grenade: 'Grenade Pouch',
  quick0: 'Quick Item 1', quick1: 'Quick Item 2', quick2: 'Quick Item 3', quick3: 'Quick Item 4', quick4: 'Quick Item 5',
};

/** Grid rows (5 columns; null = spacer). */
export const SLOT_GRID: (SlotId | null)[][] = [
  ['right1', 'right2', null, 'left1', 'left2'],
  ['head', 'chest', 'arms', 'legs', null],
  ['accessory1', 'accessory2', null, null, 'grenade'],
  ['quick0', 'quick1', 'quick2', 'quick3', 'quick4'],
];
export const ALL_SLOTS: SlotId[] = SLOT_GRID.flat().filter((s): s is SlotId => s !== null);

const isGear = (s: SlotId): s is EquipSlot => (EQUIP_SLOTS as readonly string[]).includes(s);

/**
 * Equipment tab (PLAN 11): slot grid -> filtered list of owned items -> stat-diff panel (green/red) with the
 * resulting equip load + roll tier. Hover previews, click equips. Non-pausing.
 */
export class EquipmentTab implements MenuTab {
  readonly title = 'Equipment';
  readonly el = h('div', 'pbody');
  private readonly slotsCol = h('div', 'col');
  private readonly listCol = h('div', 'col');
  private readonly detailCol = h('div', 'detail');
  private sel: SlotId = 'right1';
  /** Previewed candidate: undefined = none hovered, null = the "empty" row. */
  private hover: ItemId | null | undefined = undefined;
  private slotEls = new Map<SlotId, HTMLElement>();

  constructor(private readonly ctx: UiCtx) {
    this.slotsCol.style.width = '262px';
    this.listCol.style.width = '190px';
    this.detailCol.style.width = '220px';
    this.el.append(this.slotsCol, this.listCol, this.detailCol);
  }

  // ---- slot model
  private itemIn(s: SlotId): ItemId | null {
    const { inv } = this.ctx;
    if (isGear(s)) return inv.equipment.loadout[s];
    if (s === 'grenade') return inv.pouch.current();
    return inv.belt.slots[Number(s.slice(5))] ?? null;
  }

  private owned(): ItemId[] {
    return this.ctx.inv.store.list().map((x) => x.id);
  }

  private candidates(s: SlotId): ItemDef[] {
    const { inv } = this.ctx;
    if (isGear(s)) return candidatesFor(s, this.owned());
    if (s === 'grenade') return GRENADE_LIST.filter((g) => inv.store.count(g.id) > 0);
    return this.owned()
      .map((id) => itemDef(id))
      .filter((d): d is ItemDef => !!d && d.kind === 'consumable')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private apply(s: SlotId, id: ItemId | null): void {
    const { inv } = this.ctx;
    if (isGear(s)) {
      for (const [slot, item] of planEquip(inv.equipment.loadout, s, id, id ? inv.store.count(id) : 0)) inv.equipment.equip(slot, item);
    } else if (s === 'grenade') {
      inv.pouch.selected = id;
    } else {
      const i = Number(s.slice(5));
      const prev = inv.belt.slots[i] ?? null;
      const other = id ? inv.belt.slots.findIndex((x, j) => j !== i && x === id) : -1;
      inv.belt.assign(i, id);
      if (other >= 0) inv.belt.assign(other, prev); // swap instead of duplicating
    }
    this.hover = undefined;
    this.refresh();
  }

  // ---- render
  refresh(): void {
    this.renderSlots();
    this.renderList();
    this.renderDetail();
  }

  private renderSlots(): void {
    clear(this.slotsCol);
    this.slotEls.clear();
    this.slotsCol.append(h('div', 'sec', 'EQUIPMENT'));
    for (const row of SLOT_GRID) {
      const g = h('div', 'grid');
      g.style.gridTemplateColumns = 'repeat(5,48px)';
      for (const s of row) {
        if (!s) {
          g.append(h('div'));
          continue;
        }
        const id = this.itemIn(s);
        const def = itemDef(id);
        const slot = h('div', `slot${s === this.sel ? ' sel' : ''}${def ? '' : ' nothing'}`);
        slot.append(iconEl(def ? iconKeyOf(def) : 'fist'));
        if (def && !isGear(s)) {
          const n = this.ctx.inv.store.count(def.id);
          if (n > 0 && def.kind !== 'weapon') slot.append(h('span', 'cnt', String(n)));
        }
        slot.append(h('span', 'nm', LABEL[s]));
        slot.addEventListener('click', () => {
          this.sel = s;
          this.hover = undefined;
          this.refresh();
        });
        const cell = h('div', 'cell', [slot]);
        this.slotEls.set(s, slot);
        g.append(cell);
      }
      this.slotsCol.append(g);
    }
  }

  private renderList(): void {
    clear(this.listCol);
    this.listCol.append(h('div', 'sec', FULL[this.sel]!.toUpperCase()));
    const list = h('div', 'list');
    list.style.maxHeight = '290px';
    const cur = this.itemIn(this.sel);
    const unequip = h('div', 'row', [h('span', 'grow dim', isGear(this.sel) ? '(unequip)' : this.sel === 'grenade' ? '(none)' : '(clear)')]);
    this.bindRow(unequip, null);
    list.append(unequip);
    const cands = this.candidates(this.sel);
    if (cands.length === 0) list.append(h('div', 'dim', 'Nothing available.'));
    for (const d of cands) {
      const here = d.id === cur;
      const elsewhere = isGear(this.sel) && EQUIP_SLOTS.some((s) => s !== this.sel && this.ctx.inv.equipment.loadout[s] === d.id);
      const row = h('div', `row${here ? ' sel' : ''}`);
      row.append(iconEl(iconKeyOf(d), 's'), h('span', 'grow', d.name));
      if (here) row.append(h('span', 'eq', 'E'));
      else if (elsewhere) row.append(h('span', 'eq dim', 'worn'));
      else if (d.kind === 'consumable' || d.kind === 'grenade') row.append(h('span', 'dim', `x${this.ctx.inv.store.count(d.id)}`));
      this.bindRow(row, d.id);
      list.append(row);
    }
    this.listCol.append(list);
  }

  private bindRow(row: HTMLElement, id: ItemId | null): void {
    row.addEventListener('mouseenter', () => {
      this.hover = id;
      this.renderDetail();
    });
    row.addEventListener('mouseleave', () => {
      this.hover = undefined;
      this.renderDetail();
    });
    row.addEventListener('click', () => this.apply(this.sel, id));
  }

  private renderDetail(): void {
    clear(this.detailCol);
    const s = this.sel;
    const curId = this.itemIn(s);
    const curDef = itemDef(curId) ?? null;
    const previewing = this.hover !== undefined;
    const shown = previewing ? (itemDef(this.hover) ?? null) : curDef;
    const d = this.detailCol;
    d.append(h('div', 'sec', previewing ? 'PREVIEW' : FULL[s]!.toUpperCase()));
    if (previewing && !shown) {
      d.append(h('div', 'dname dim', isGear(s) ? 'Unequip' : 'Clear slot'));
    } else {
      d.append(itemHeader(shown, shown && !isGear(s) ? this.ctx.inv.store.count(shown.id) : undefined), itemDesc(shown));
    }
    if (isGear(s)) {
      const rows = previewing ? diffItems(curDef, shown) : diffItems(null, shown);
      if (rows.length) d.append(statTable(rows, previewing));
      const lo = this.ctx.inv.equipment.loadout;
      const endu = this.ctx.player.levels.endurance;
      let before: LoadPreview;
      let after: LoadPreview | undefined;
      if (previewing) {
        const p = previewEquip(lo, s, this.hover ?? null, this.hover ? this.ctx.inv.store.count(this.hover) : 0, endu);
        before = p.before;
        after = p.after;
      } else {
        before = loadFor(applyOps(lo, []), endu);
      }
      d.append(h('div', 'sec', ''), loadBlock(before, after));
    }
  }
}
