/**
 * 16x16 procedural item/HUD icons drawn with canvas rects (PS1/DS inventory look). Cached as data URLs.
 * `iconUrl(key)` where key is an item id (resolved through data) or a HUD key ('estus', 'estus_empty', 'fist', 'ammo:rifle', ...).
 */
import { ITEMS_BY_ID } from '../data';
import type { ItemDef } from '../data/types';

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, string>();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

const OUT = '#0a0a0c';
const STEEL = '#8d949c';
const DSTEEL = '#4a5058';
const WOOD = '#7a5a3a';
const GOLD = '#d8b84a';

class Pen {
  constructor(readonly c: Ctx) {}
  r(x: number, y: number, w: number, h: number, col: string): this {
    this.c.fillStyle = col;
    this.c.fillRect(x, y, w, h);
    return this;
  }
  /** 1px outline box with fill. */
  box(x: number, y: number, w: number, h: number, fill: string): this {
    return this.r(x - 1, y - 1, w + 2, h + 2, OUT).r(x, y, w, h, fill);
  }
  px(x: number, y: number, col: string): this {
    return this.r(x, y, 1, 1, col);
  }
  /** Diagonal line of 1px steps. */
  line(x0: number, y0: number, x1: number, y1: number, col: string): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), col);
    return this;
  }
}

// ---------------------------------------------------------------- sprite painters

function gun(p: Pen, cls: string, accent: string): void {
  switch (cls) {
    case 'pistol':
    case 'revolver':
      p.box(3, 5, 9, 3, STEEL).box(9, 8, 3, 5, DSTEEL).r(4, 5, 7, 1, '#c8ced4');
      if (cls === 'revolver') p.box(6, 7, 3, 3, accent);
      break;
    case 'smg':
      p.box(2, 5, 11, 3, STEEL).box(7, 8, 2, 6, DSTEEL).box(10, 8, 2, 3, WOOD).r(3, 5, 8, 1, '#c8ced4');
      break;
    case 'shotgun':
      p.box(1, 5, 13, 2, STEEL).box(1, 7, 8, 2, DSTEEL).box(9, 7, 5, 3, WOOD).r(2, 5, 10, 1, '#c8ced4');
      break;
    case 'marksman':
      p.box(0, 6, 15, 2, STEEL).box(4, 3, 5, 2, DSTEEL).box(10, 8, 4, 3, WOOD).box(6, 8, 2, 3, DSTEEL).r(0, 6, 8, 1, '#c8ced4');
      break;
    case 'lmg':
      p.box(1, 5, 13, 3, STEEL).box(5, 8, 5, 4, accent).box(11, 8, 3, 3, WOOD).r(1, 9, 3, 1, OUT).r(2, 5, 10, 1, '#c8ced4');
      break;
    case 'launcher':
      p.box(0, 4, 15, 4, '#5a6a52').box(11, 8, 2, 3, DSTEEL).box(0, 3, 2, 6, accent);
      break;
    default: // ar
      p.box(1, 5, 13, 3, STEEL).box(6, 8, 3, 5, DSTEEL).box(11, 8, 3, 3, WOOD).box(2, 3, 4, 1, DSTEEL).r(2, 5, 9, 1, '#c8ced4');
  }
}

function melee(p: Pen, id: string, accent: string): void {
  if (id.includes('knife')) {
    p.line(3, 12, 11, 4, OUT).line(4, 12, 12, 4, OUT).line(4, 11, 11, 4, '#d0d6dc').line(3, 13, 5, 11, WOOD).box(2, 12, 3, 3, WOOD);
  } else if (id.includes('halberd')) {
    p.line(3, 14, 12, 3, WOOD).line(4, 14, 13, 3, WOOD).box(9, 1, 5, 5, '#a8aeb6').r(10, 2, 3, 3, DSTEEL);
  } else if (id.includes('tomahawk') || id.includes('axe')) {
    p.line(4, 14, 11, 3, WOOD).line(5, 14, 12, 3, WOOD).box(8, 2, 6, 5, '#b8bec6').r(9, 3, 3, 3, accent);
  } else {
    p.line(2, 14, 12, 3, STEEL).line(3, 14, 13, 3, '#c8ced4').box(1, 12, 4, 3, WOOD);
  }
}

function shield(p: Pen, id: string, accent: string): void {
  const big = id.includes('riot');
  p.box(big ? 2 : 4, big ? 1 : 3, big ? 12 : 8, big ? 14 : 10, DSTEEL);
  p.r(big ? 4 : 5, big ? 3 : 4, big ? 8 : 6, big ? 5 : 4, '#8fb4c8');
  p.r(big ? 4 : 5, big ? 3 : 4, big ? 8 : 6, 1, '#cfe6f2');
  p.r(big ? 7 : 7, big ? 9 : 9, 2, 2, accent);
}

function armor(p: Pen, slot: string, col: string): void {
  const dk = col.replace(/(\d+)%\)$/, (_m, l: string) => `${Math.max(10, Number(l) - 16)}%)`);
  switch (slot) {
    case 'head':
      p.box(3, 3, 10, 7, col).box(2, 9, 12, 2, dk).r(4, 4, 3, 1, '#ffffff55');
      break;
    case 'chest':
      p.box(3, 2, 10, 12, col).r(6, 2, 4, 3, OUT).r(3, 8, 10, 1, dk).r(5, 10, 2, 3, dk).r(9, 10, 2, 3, dk);
      break;
    case 'arms':
      p.box(2, 5, 5, 8, col).box(9, 5, 5, 8, col).r(2, 5, 5, 2, dk).r(9, 5, 5, 2, dk);
      break;
    default:
      p.box(3, 2, 10, 4, dk).box(3, 6, 4, 8, col).box(9, 6, 4, 8, col);
  }
}

function accessory(p: Pen, h: number): void {
  const col = hsl(h, 45, 42);
  p.box(3, 3, 10, 10, col).r(4, 4, 8, 1, '#ffffff44').r(5, 5, 6, 6, hsl(h + 30, 40, 30));
  const sym = hash(String(h)) % 4;
  if (sym === 0) p.r(7, 6, 2, 4, GOLD).r(6, 7, 4, 2, GOLD);
  else if (sym === 1) p.line(5, 10, 10, 5, GOLD).line(6, 10, 11, 5, GOLD);
  else if (sym === 2) p.r(6, 6, 4, 4, GOLD).r(7, 7, 2, 2, OUT);
  else p.r(5, 7, 6, 2, GOLD);
}

function consumable(p: Pen, id: string, h: number): void {
  if (id === 'estus_empty') {
    p.box(6, 1, 4, 3, '#6a5a3a').box(4, 4, 8, 10, '#3a3a40').r(5, 5, 6, 8, '#1a1a1e').r(5, 5, 1, 7, '#5a5a62');
  } else if (id.includes('estus')) {
    p.box(6, 1, 4, 3, '#a8782a').box(4, 4, 8, 10, '#c8741a').r(5, 5, 6, 8, '#ffb02a').r(5, 5, 2, 7, '#ffe27a');
  } else if (id.includes('dogtag')) {
    p.box(5, 3, 6, 9, '#a8aeb6').r(6, 5, 4, 1, DSTEEL).r(6, 7, 4, 1, DSTEEL).r(6, 9, 3, 1, DSTEEL).r(7, 1, 2, 2, DSTEEL);
    if (id.includes('large')) p.box(8, 5, 6, 9, '#c8ced4').r(9, 7, 4, 1, DSTEEL).r(9, 9, 3, 1, DSTEEL);
  } else if (id.includes('flare')) {
    p.line(4, 14, 10, 6, '#b02a1a').line(5, 14, 11, 6, '#d03a22').r(10, 2, 3, 4, '#ff9a20').r(11, 1, 1, 2, '#ffe070');
  } else if (id.includes('incendiary')) {
    p.box(3, 6, 3, 8, GOLD).box(7, 6, 3, 8, GOLD).box(11, 6, 3, 8, GOLD).r(3, 3, 3, 3, '#e8601a').r(7, 3, 3, 3, '#e8601a').r(11, 3, 3, 3, '#e8601a');
  } else if (id.includes('ammo_crate')) {
    p.box(2, 5, 12, 9, '#5a6a42').r(2, 8, 12, 1, '#3a4630').r(6, 5, 4, 3, GOLD).r(7, 4, 2, 1, DSTEEL);
  } else if (id.includes('energy')) {
    p.box(5, 2, 6, 12, '#3a6ac0').r(5, 6, 6, 3, '#e8e040').r(6, 3, 4, 1, '#c8ced4');
  } else {
    p.box(5, 3, 6, 10, hsl(h, 50, 45)).r(6, 1, 4, 2, DSTEEL);
  }
}

function grenade(p: Pen, id: string): void {
  if (id.includes('frag')) {
    p.box(4, 5, 8, 9, '#4a6a3a').r(5, 6, 2, 2, '#7a9a5a').r(4, 9, 8, 1, '#2a3e22').box(6, 2, 4, 3, DSTEEL).r(10, 2, 3, 1, GOLD).r(12, 2, 1, 3, GOLD);
  } else if (id.includes('molotov')) {
    p.box(5, 6, 6, 8, '#3a7a50').r(6, 7, 1, 5, '#8ad0a0').box(7, 3, 2, 3, '#3a7a50').r(6, 1, 4, 2, '#ff9a20').r(7, 0, 2, 1, '#ffe070');
  } else if (id.includes('flash')) {
    p.box(5, 3, 6, 11, '#c8ced4').r(5, 6, 6, 2, '#e8e8f0').r(5, 10, 6, 1, DSTEEL).r(6, 1, 4, 2, DSTEEL);
  } else {
    p.line(3, 13, 12, 3, OUT).line(4, 13, 13, 3, OUT).line(4, 12, 12, 4, '#d0d6dc').box(2, 12, 3, 3, DSTEEL);
  }
}

function key(p: Pen, id: string): void {
  const c = id.includes('basement') ? '#c88a8a' : GOLD;
  p.box(2, 3, 5, 5, c).r(4, 5, 1, 1, OUT).box(7, 5, 7, 2, c).r(11, 7, 2, 3, c).r(13, 7, 1, 2, c);
}

function ammo(p: Pen, t: string): void {
  const big = t === 'launcher' || t === 'sniper';
  for (let i = 0; i < 3; i++) {
    const x = 3 + i * 4;
    p.box(x, big ? 3 : 6, 3, big ? 10 : 7, GOLD).r(x, big ? 3 : 6, 3, 2, '#e8601a').r(x, big ? 12 : 11, 3, 1, '#8a6a20');
  }
}

function paint(p: Pen, key0: string): void {
  const def: ItemDef | undefined = ITEMS_BY_ID.get(key0);
  if (!def) {
    if (key0.startsWith('ammo:')) return ammo(p, key0.slice(5));
    if (key0 === 'fist') return void p.box(4, 4, 8, 8, '#c89a7a').r(5, 5, 6, 1, '#e8c8a8');
    if (key0.startsWith('estus')) return consumable(p, key0, 0);
    return void p.box(4, 4, 8, 8, '#a0a0a8');
  }
  const h = hash(def.id);
  const accent = hsl(h, 55, 48);
  switch (def.kind) {
    case 'weapon':
      if ('class' in def && def.class === 'shield') shield(p, def.id, accent);
      else if ('class' in def && def.class === 'melee') melee(p, def.id, accent);
      else gun(p, 'class' in def ? def.class : 'ar', accent);
      break;
    case 'armor':
      armor(p, def.slot, hsl(hash(def.set), 35, 44));
      break;
    case 'accessory':
      accessory(p, h);
      break;
    case 'consumable':
      consumable(p, def.id, h);
      break;
    case 'grenade':
      grenade(p, def.id);
      break;
    case 'key':
      key(p, def.id);
      break;
  }
}

/** Data-URL PNG for an icon key. Returns '' when no canvas is available (tests / SSR). */
export function iconUrl(key: string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    const ctx = cv.getContext('2d');
    if (ctx) {
      paint(new Pen(ctx), key);
      url = cv.toDataURL('image/png');
    }
  }
  cache.set(key, url);
  return url;
}

/** `<img>` element with the pixel-art class. */
export function iconEl(key: string, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `ic ${cls}`.trim();
  img.src = iconUrl(key);
  img.draggable = false;
  img.alt = '';
  return img;
}

/** Icon key for a ground-type/item def (uses `def.icon` override when present). */
export function iconKeyOf(def: ItemDef): string {
  return def.icon && ITEMS_BY_ID.has(def.icon) ? def.icon : def.id;
}
