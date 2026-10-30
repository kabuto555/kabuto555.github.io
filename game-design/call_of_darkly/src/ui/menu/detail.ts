import type { ItemDef } from '../../data/types';
import { itemDef } from '../../inventory/store';
import type { LoadPreview } from '../logic';
import { fmtDiffRow, setBonusNote, type DiffRow } from '../logic';
import { h } from '../dom';
import { iconEl, iconKeyOf } from '../icons';

const KIND_LABEL: Record<string, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  accessory: 'Accessory',
  consumable: 'Consumable',
  grenade: 'Grenade',
  key: 'Key Item',
  ammo: 'Ammo',
};

/** Item header: icon + name + kind line. */
export function itemHeader(def: ItemDef | null, count?: number): HTMLElement {
  if (!def) return h('div', 'detail', [h('div', 'dname dim', '-- empty --')]);
  const sub = def.kind === 'weapon' && 'class' in def ? `${KIND_LABEL.weapon} · ${def.class.toUpperCase()}` : KIND_LABEL[def.kind];
  const right = h('div', 'col', [h('div', 'dname', def.name), h('div', 'dim', count && count > 1 ? `${sub}  x${count}` : sub)]);
  const row = h('div', 'stat', [iconEl(iconKeyOf(def)), right]);
  return row;
}

/** Description + optional set-bonus note. */
export function itemDesc(def: ItemDef | null): HTMLElement {
  const d = h('div', 'desc', def?.description || (def ? '...' : ''));
  const note = def ? setBonusNote(def) : null;
  if (note) d.append(h('div', 'dim', note));
  return d;
}

/** Stat table. With `colored`, cells use green/red for better/worse (the equipment diff); else neutral values. */
export function statTable(rows: DiffRow[], colored: boolean): HTMLElement {
  const t = h('div', 'tbl');
  for (const r of rows) {
    t.append(h('span', 'dim', r.label));
    const cls = !colored ? 'v' : r.better > 0 ? 'v good' : r.better < 0 ? 'v bad' : 'v';
    const arrow = colored && r.better !== 0 ? (r.better > 0 ? ' ▲' : ' ▼') : '';
    const txt = colored ? fmtDiffRow(r) + arrow : `${r.next === null ? '-' : Math.round((r.next ?? 0) * 100) / 100}${r.unit}`;
    t.append(h('span', cls, txt));
  }
  return t;
}

/** Equip-load line + meter, with an optional "after" preview. */
export function loadBlock(before: LoadPreview, after?: LoadPreview): HTMLElement {
  const p = after ?? before;
  const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
  const root = h('div', 'col');
  const head = h('div', 'stat', [h('span', 'dim', 'EQUIP LOAD')]);
  const cur = h('span', p.ratio > 1 ? 'bad' : '', `${f1(p.weight)} / ${f1(p.max)}`);
  head.append(cur, h('span', `chip ${p.tier}`, p.tier.toUpperCase()));
  root.append(head);
  if (after && (after.tier !== before.tier || Math.abs(after.weight - before.weight) > 0.001)) {
    const better = after.weight <= before.weight;
    root.append(h('div', better ? 'good' : 'bad', `${f1(before.weight)} → ${f1(after.weight)}  (${before.tier} → ${after.tier})`));
  }
  const meter = h('div', p.ratio > 1 ? 'meter over' : 'meter', [h('i')]);
  (meter.firstElementChild as HTMLElement).style.transform = `scaleX(${Math.min(1, p.ratio)})`;
  root.append(meter);
  return root;
}

export function nameOf(id: string | null | undefined): string {
  return itemDef(id)?.name ?? '';
}
