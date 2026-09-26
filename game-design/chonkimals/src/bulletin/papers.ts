// The four notices pinned to the Bulletin Board, drawn into canvases: the camp map,
// Camp News, the leaderboard and the daily challenge. One drawing path serves both
// the in-world board (half resolution) and the close-up board screen (full), so the
// board you walk up to and the one you tap are literally the same papers.
//
// Everything is laid out in paper px (PAPER_W × PAPER_H) and scaled on draw.

import { bulletin } from './bulletin';
import { iconImage, ready } from '../ui/icons';
import { ANNOUNCEMENTS, BOARDS, type BoardId } from './bulletin-presets';
import { SOFT, PREMIUM } from '../economy';
import { PASS } from '../camp-pass/content';

type Texture = InstanceType<typeof THREE.CanvasTexture>;

export const PAPER_W = 800;
export const PAPER_H = 1000;
export type PaperKind = 'map' | 'news' | 'ranks' | 'challenge';
export const PAPER_KINDS: PaperKind[] = ['map', 'news', 'ranks', 'challenge'];

const FONT = "'Fredoka', system-ui, sans-serif";
const INK = '#5a3a22';
const INK_SOFT = '#8a6a52';

const STYLE: Record<PaperKind, { bg: string; edge: string; seed: number }> = {
  map: { bg: '#ecd3a2', edge: '#c9a468', seed: 3 },
  news: { bg: '#fff8ea', edge: '#e2cdab', seed: 7 },
  ranks: { bg: '#f2f6ff', edge: '#c3d0ea', seed: 11 },
  challenge: { bg: '#ffe680', edge: '#e5bd3f', seed: 19 },
};

// ── Camp map data (from map-capture.ts) ─────────────────────────────────────
export interface MapPin { label: string; icon: string; u: number; v: number }
export interface CampMap {
  /** Top-down render of the camp, already cropped to the map area. */
  image: HTMLCanvasElement;
  pins: MapPin[];
  /** 0…1 across the image (null if off the map). */
  toUV(x: number, z: number): { u: number; v: number } | null;
}

export interface PaperData {
  map: CampMap | null;
  /** Player's world XZ for "You are here". */
  you: { x: number; z: number } | null;
  playerName: string;
  board: BoardId;
}

/** A canvas + texture per notice at one resolution; `redraw()` after data changes. */
export class PaperSet {
  readonly canvases = {} as Record<PaperKind, HTMLCanvasElement>;
  readonly textures = {} as Record<PaperKind, Texture>;

  constructor(private readonly scale: number, private readonly data: () => PaperData) {
    for (const k of PAPER_KINDS) {
      const c = Object.assign(document.createElement('canvas'), {
        width: Math.round(PAPER_W * scale), height: Math.round(PAPER_H * scale) });
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.canvases[k] = c;
      this.textures[k] = t;
    }
    this.redraw();
  }

  redraw(kind?: PaperKind): void {
    const d = this.data();
    for (const k of kind ? [kind] : PAPER_KINDS) {
      const ctx = this.canvases[k].getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      paperBase(ctx, k);
      if (k === 'map') drawMap(ctx, d);
      else if (k === 'news') drawNews(ctx);
      else if (k === 'ranks') drawRanks(ctx, d);
      else drawChallenge(ctx);
      this.textures[k].needsUpdate = true;
    }
  }

  dispose(): void { PAPER_KINDS.forEach((k) => this.textures[k].dispose()); }
}

// ── Paper + type helpers ────────────────────────────────────────────────────
function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Deckled paper sheet with a little ageing; ledger lines on the rank sheet. */
function paperBase(ctx: CanvasRenderingContext2D, kind: PaperKind): void {
  const st = STYLE[kind];
  const r = rng(st.seed);
  const m = 14, step = 26, j = 5;
  ctx.beginPath();
  for (let x = m; x <= PAPER_W - m; x += step) ctx.lineTo(x, m + (r() - 0.5) * j);
  for (let y = m; y <= PAPER_H - m; y += step) ctx.lineTo(PAPER_W - m + (r() - 0.5) * j, y);
  for (let x = PAPER_W - m; x >= m; x -= step) ctx.lineTo(x, PAPER_H - m + (r() - 0.5) * j);
  for (let y = PAPER_H - m; y >= m; y -= step) ctx.lineTo(m + (r() - 0.5) * j, y);
  ctx.closePath();
  ctx.fillStyle = st.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(PAPER_W / 2, PAPER_H * 0.45, PAPER_H * 0.2, PAPER_W / 2, PAPER_H / 2, PAPER_H * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(120,80,30,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAPER_W, PAPER_H);
  // Paper fleck.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(110,70,30,${0.03 + r() * 0.05})`;
    ctx.fillRect(r() * PAPER_W, r() * PAPER_H, 2 + r() * 3, 2 + r() * 3);
  }
  if (kind === 'ranks') {
    ctx.strokeStyle = 'rgba(90,130,200,0.18)';
    ctx.lineWidth = 2;
    for (let y = 270; y < PAPER_H - 30; y += 72) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(PAPER_W - 30, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(232,72,63,0.28)';
    ctx.beginPath(); ctx.moveTo(118, 216); ctx.lineTo(118, PAPER_H - 30); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Pin hole shadow at the top centre.
  ctx.fillStyle = 'rgba(60,35,15,0.25)';
  ctx.beginPath(); ctx.arc(PAPER_W / 2, 80, 12, 0, Math.PI * 2); ctx.fill(); // under the pin (BOARD_LAYOUT.pinDrop)
}

function font(weight: number, size: number): string { return `${weight} ${size}px ${FONT}`; }

/** Shrinks the font until `text` fits `maxW`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number,
                 weight = 700, color = INK, align: CanvasTextAlign = 'left'): void {
  let s = size;
  ctx.font = font(weight, s);
  while (s > 12 && ctx.measureText(text).width > maxW) ctx.font = font(weight, --s);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Hand-lettered heading strip under the pin. */
function heading(ctx: CanvasRenderingContext2D, text: string, color: string, rot = -0.015): void {
  ctx.save();
  ctx.translate(PAPER_W / 2, 176);
  ctx.rotate(rot);
  ctx.font = font(700, 70);
  const w = Math.min(640, ctx.measureText(text).width + 70);
  roundRect(ctx, -w / 2, -44, w, 88, 18);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-w / 2 + 10, 34, w - 20, 8);
  fitText(ctx, text, 0, 2, w - 50, 66, 700, '#fff', 'center');
  ctx.restore();
}

function beadGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffe3f1'); g.addColorStop(0.35, '#ff8fc4'); g.addColorStop(1, '#c23a79');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a1d47';
  ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, Math.PI * 2); ctx.fill();
}

function pineconeGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#6f9a3a';
  ctx.beginPath(); ctx.ellipse(0, -r * 1.02, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#d99a12');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a86f00';
  ctx.lineWidth = r * 0.1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(-r * 0.7, i * r * 0.36 - r * 0.2); ctx.lineTo(0, i * r * 0.36 + r * 0.15);
    ctx.lineTo(r * 0.7, i * r * 0.36 - r * 0.2); ctx.stroke();
  }
  ctx.restore();
}

// ── Map ─────────────────────────────────────────────────────────────────────
const MAP_BOX = { x: 50, y: 226, w: 700, h: 700 };
/** Aspect (w/h) the camp map is captured at, to fill the inset. */
export const MAP_ASPECT = MAP_BOX.w / MAP_BOX.h;

function drawMap(ctx: CanvasRenderingContext2D, d: PaperData): void {
  heading(ctx, 'CAMP MAP', '#5b8f3a', 0.012);
  const { x, y, w, h } = MAP_BOX;
  ctx.save();
  roundRect(ctx, x, y, w, h, 22);
  ctx.clip();
  if (d.map) {
    ctx.filter = 'sepia(0.28) saturate(1.2) contrast(1.05)';
    ctx.drawImage(d.map.image, x, y, w, h);
    ctx.filter = 'none';
    // Soft paper wash so it reads as a printed map.
    ctx.fillStyle = 'rgba(236,211,162,0.18)';
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.fillStyle = '#d7ba86';
    ctx.fillRect(x, y, w, h);
    fitText(ctx, 'Mapping camp…', PAPER_W / 2, y + h / 2, w - 60, 44, 600, INK_SOFT, 'center');
  }
  ctx.restore();
  ctx.strokeStyle = '#8a5a3a';
  ctx.lineWidth = 7;
  roundRect(ctx, x, y, w, h, 22);
  ctx.stroke();
  if (!d.map) return;

  // Pins: icon medallions + label chips (labels flip side near the right edge).
  for (const p of d.map.pins) {
    const px = x + p.u * w, py = y + p.v * h;
    ctx.fillStyle = '#fff8ea';
    ctx.strokeStyle = '#8a5a3a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (p.icon.startsWith('assets/')) {
      const img = iconImage(p.icon); // preloaded (icons.ts)
      if (ready(img)) ctx.drawImage(img, px - 30, py - 32, 60, 60);
    } else {
      ctx.font = font(400, 30);
      ctx.fillText(p.icon, px, py + 2);
    }
    ctx.font = font(700, 24);
    const tw = ctx.measureText(p.label).width + 20;
    const right = px + 30 + tw < x + w - 6;
    const lx = right ? px + 30 : px - 30 - tw;
    roundRect(ctx, lx, py - 17, tw, 34, 12);
    ctx.fillStyle = 'rgba(90,58,34,0.85)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(p.label, lx + 10, py + 1);
  }
  // You are here.
  const uv = d.you && d.map.toUV(d.you.x, d.you.z);
  if (uv) {
    const px = x + uv.u * w, py = y + uv.v * h;
    ctx.fillStyle = 'rgba(232,72,63,0.25)';
    ctx.beginPath(); ctx.arc(px, py, 34, 0, Math.PI * 2); ctx.fill();
    star(ctx, px, py, 22, '#e8483f', '#fff');
    fitText(ctx, 'YOU', px, py - 44, 120, 26, 700, '#e8483f', 'center');
  }
  // Compass.
  const cx = x + w - 58, cy = y + h - 64;
  ctx.fillStyle = 'rgba(255,248,234,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8483f';
  ctx.beginPath(); ctx.moveTo(cx, cy - 32); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx - 10, cy); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(cx, cy + 32); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx - 10, cy); ctx.fill();
  fitText(ctx, 'N', cx, cy - 50, 40, 22, 700, INK, 'center');
  fitText(ctx, 'Camp Chonkton', PAPER_W / 2, 958, 600, 34, 600, INK_SOFT, 'center');
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;
  ctx.stroke();
}

// ── Camp News ───────────────────────────────────────────────────────────────
const TAG_COLOR = { 'NEW!': '#e8483f', EVENT: '#9b5de5', TIP: '#3a8fd6' } as const;

function drawNews(ctx: CanvasRenderingContext2D): void {
  heading(ctx, 'CAMP NEWS', '#e8483f');
  let y = 226;
  for (const a of ANNOUNCEMENTS.slice(0, 4)) {
    const unread = !bulletin.isRead(a.id);
    // Icon disc.
    ctx.fillStyle = '#f4e6cf';
    ctx.beginPath(); ctx.arc(96, y + 58, 48, 0, Math.PI * 2); ctx.fill();
    ctx.font = font(400, 54);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.icon, 96, y + 62);
    if (unread) {
      ctx.fillStyle = '#e8483f';
      ctx.beginPath(); ctx.arc(134, y + 20, 13, 0, Math.PI * 2); ctx.fill();
    }
    let tx = 168;
    if (a.tag) {
      ctx.font = font(700, 22);
      const tw = ctx.measureText(a.tag).width + 22;
      roundRect(ctx, tx, y + 4, tw, 32, 10);
      ctx.fillStyle = TAG_COLOR[a.tag];
      ctx.fill();
      fitText(ctx, a.tag, tx + tw / 2, y + 21, tw, 22, 700, '#fff', 'center');
      tx += tw + 12;
    }
    fitText(ctx, a.title, tx, y + 21, PAPER_W - 50 - tx, 36, 700);
    ctx.font = font(500, 29);
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = 'left';
    wrap(ctx, a.body, PAPER_W - 168 - 50, 2).forEach((l, i) => ctx.fillText(l, 168, y + 68 + i * 36));
    y += 184;
    if (y < 900) {
      ctx.strokeStyle = 'rgba(138,106,82,0.25)';
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(60, y - 18); ctx.lineTo(PAPER_W - 60, y - 18); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
const MEDAL = ['#ffc629', '#c9d3de', '#e0915a'];
const TOP_ROWS = 8;

function drawRanks(ctx: CanvasRenderingContext2D, d: PaperData): void {
  heading(ctx, 'LEADERBOARD', '#3a8fd6', 0.01);
  const def = BOARDS.find((b) => b.id === d.board)!;
  fitText(ctx, def.title, PAPER_W / 2, 242, 640, 34, 700, INK, 'center');
  fitText(ctx, def.weekly ? `Resets in ${bulletin.weekResetsIn()}` : PASS.season, PAPER_W / 2, 272, 600, 24, 600, INK_SOFT, 'center');
  const rows = bulletin.board(d.board, d.playerName);
  const me = rows.find((r) => r.isPlayer)!;
  const shown = rows.slice(0, TOP_ROWS);
  const row = (r: typeof me, y: number) => {
    if (r.isPlayer) {
      roundRect(ctx, 40, y - 32, PAPER_W - 80, 64, 18);
      ctx.fillStyle = 'rgba(58,143,214,0.16)';
      ctx.fill();
      ctx.strokeStyle = '#3a8fd6';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (r.rank <= 3) {
      ctx.fillStyle = MEDAL[r.rank - 1];
      ctx.beginPath(); ctx.arc(82, y, 24, 0, Math.PI * 2); ctx.fill();
      fitText(ctx, String(r.rank), 82, y + 1, 40, 28, 700, '#fff', 'center');
    } else {
      fitText(ctx, String(r.rank), 82, y + 1, 60, 28, 700, INK_SOFT, 'center');
    }
    fitText(ctx, r.isPlayer ? `${r.name} (you)` : r.name, 140, y + 1, 440, 32, r.isPlayer ? 700 : 600, r.isPlayer ? '#1f5f9a' : INK);
    fitText(ctx, `${r.score.toLocaleString()} ${def.unit}`, PAPER_W - 60, y + 1, 180, 32, 700, INK, 'right');
  };
  shown.forEach((r, i) => row(r, 306 + i * 72));
  if (me.rank > TOP_ROWS) {
    ctx.fillStyle = INK_SOFT;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(PAPER_W / 2 + i * 22, 862, 5, 0, Math.PI * 2); ctx.fill(); }
    row(me, 910);
  }
}

// ── Daily challenge ─────────────────────────────────────────────────────────
function drawChallenge(ctx: CanvasRenderingContext2D): void {
  heading(ctx, 'DAILY CHALLENGE', '#e98a1f', -0.02);
  const c = bulletin.challenge;
  const prog = bulletin.progress;
  // Big icon on a burst.
  ctx.save();
  ctx.translate(PAPER_W / 2, 352);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12, r = i % 2 ? 96 : 120;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.font = font(400, 130);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.icon, 0, 8);
  ctx.restore();

  ctx.font = font(700, 54);
  const lines = wrap(ctx, c.title, 660, 2);
  lines.forEach((l, i) => fitText(ctx, l, PAPER_W / 2, 516 + i * 62 - (lines.length - 1) * 31, 680, 54, 700, INK, 'center'));
  ctx.font = font(500, 30);
  wrap(ctx, c.hint, 640, 2).forEach((l, i) => fitText(ctx, l, PAPER_W / 2, 616 + i * 38, 660, 30, 500, INK_SOFT, 'center'));

  // Progress bar.
  const bx = 90, by = 706, bw = PAPER_W - 180, bh = 56;
  roundRect(ctx, bx, by, bw, bh, 28);
  ctx.fillStyle = 'rgba(90,58,34,0.18)';
  ctx.fill();
  const f = Math.min(1, prog / c.goal);
  if (f > 0) {
    roundRect(ctx, bx, by, Math.max(bh, bw * f), bh, 28);
    ctx.fillStyle = f >= 1 ? '#5cc25a' : '#3a8fd6';
    ctx.fill();
  }
  fitText(ctx, f >= 1 ? 'Complete!' : `${prog} / ${c.goal}`, PAPER_W / 2, by + bh / 2 + 1, bw - 40, 34, 700, '#fff', 'center');

  // Reward chip.
  const r = c.reward;
  const label = `+${r.amount} ${r.kind === 'beads' ? SOFT.name : PREMIUM.name}`;
  const pts = `+${c.passPoints} Pass pts`;
  ctx.font = font(700, 34);
  const tw = ctx.measureText(label).width;
  const pw = ctx.measureText(pts).width;
  const cw = Math.min(720, tw + pw + 150), cx = PAPER_W / 2 - cw / 2;
  roundRect(ctx, cx, 800, cw, 72, 36);
  ctx.fillStyle = '#fff8ea';
  ctx.fill();
  ctx.strokeStyle = '#c9923a';
  ctx.lineWidth = 4;
  ctx.stroke();
  if (r.kind === 'beads') beadGlyph(ctx, cx + 46, 836, 22); else pineconeGlyph(ctx, cx + 46, 836, 24);
  fitText(ctx, label, cx + 82, 837, tw + 4, 34, 700, INK);
  fitText(ctx, pts, cx + cw - 30, 837, pw + 4, 34, 700, '#d6342c', 'right');

  const ms = bulletin.msUntilTomorrow();
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  fitText(ctx, `New challenge in ${h}h ${m}m`, PAPER_W / 2, 935, 600, 28, 600, INK_SOFT, 'center');

  if (bulletin.claimed) drawStamp(ctx, PAPER_W / 2, 560, 1);
}

/** The red "DONE!" camp stamp (also drawn into the 3D stamp's texture). */
export function drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.22);
  ctx.scale(s, s);
  ctx.strokeStyle = 'rgba(214,52,44,0.88)';
  ctx.fillStyle = 'rgba(214,52,44,0.88)';
  ctx.lineWidth = 12;
  roundRect(ctx, -250, -95, 500, 190, 34);
  ctx.stroke();
  ctx.lineWidth = 4;
  roundRect(ctx, -228, -73, 456, 146, 22);
  ctx.stroke();
  ctx.font = font(700, 120);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DONE!', 0, 8);
  ctx.restore();
}
