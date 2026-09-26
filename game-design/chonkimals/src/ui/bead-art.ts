// Currency visuals: the pony bead (soft) and golden pinecone (premium) icons for wallets and
// prices (art: assets/ui/icons/currency/), plus generated pack art for the Shop's Pinecones tab
// (piles of the pinecone art; swap for real art later: set `image` on the pack in store-presets.ts).

import { icon, iconImage, iconImg, ready } from './icons';

const BEADS_ART = icon('currency', 'beads');
const PINECONE_ART = icon('currency', 'pinecone');
const pineconeImage = iconImage(PINECONE_ART); // preloaded for the pack-art canvas

export const BEAD_COLORS = ['#ff7ab6', '#7fd3ff', '#ffd23f', '#9b7bff', '#6fe0a4', '#ff9f5a'];

/** Pony beads icon (soft currency) — the bead cluster art, `size` design px square. */
export function beadIcon(size: number): HTMLElement {
  return iconImg(BEADS_ART, size * 1.1, `margin:-${size * 0.05}px;`); // the cluster is airier than the old single bead
}

/** Golden pinecone icon (premium currency) — the pinecone art, `size` design px square. */
export function pineconeIcon(size: number): HTMLElement {
  return iconImg(PINECONE_ART, size);
}

/** Pack art: a heap of golden pinecones that grows with `tier` (0…4), in a picnic basket for the big packs. */
export function pineconePackArt(tier: number, seed = 1): string {
  const W = 330, H = 256;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const t = Math.min(4, tier);
  const n = [1, 4, 9, 16, 26][t];
  const pileW = 30 + t * 30, pileH = 20 + t * 22;
  const floor = H - 30;
  ctx.fillStyle = 'rgba(80,50,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(W / 2, floor + 6, pileW + 46, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  const cones: { x: number; y: number; r: number; a: number }[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : rnd() * 2 - 1, v = n === 1 ? 0 : Math.sqrt(rnd());
    const top = floor - pileH * Math.sqrt(Math.max(0, 1 - u * u));
    cones.push({ x: W / 2 + u * pileW, y: floor - (floor - top) * (1 - v) - 34, r: 30 + rnd() * 6 - t * 1.5,
      a: n === 1 ? 0.15 : (rnd() - 0.5) * 1.6 });
  }
  cones.sort((a, b) => a.y - b.y);
  for (const k of cones) drawCone(ctx, k.x, k.y, k.r, k.a);
  if (t >= 3) {
    // Wicker basket front in front of the heap.
    const bw = pileW + 40, bh = 58;
    ctx.fillStyle = '#b07a44';
    ctx.beginPath();
    ctx.moveTo(W / 2 - bw, floor - bh); ctx.lineTo(W / 2 + bw, floor - bh);
    ctx.lineTo(W / 2 + bw - 16, floor + 4); ctx.lineTo(W / 2 - bw + 16, floor + 4); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 4;
    for (let y = floor - bh + 12; y < floor; y += 14) { ctx.beginPath(); ctx.moveTo(W / 2 - bw + 8, y); ctx.lineTo(W / 2 + bw - 8, y); ctx.stroke(); }
    ctx.fillStyle = t >= 4 ? '#e8483f' : '#d9a441';
    ctx.fillRect(W / 2 - bw - 4, floor - bh - 8, bw * 2 + 8, 14);
  }
  ctx.fillStyle = '#fffbe0';
  for (let i = 0; i < 2 + t; i++) star(ctx, W / 2 + (rnd() - 0.5) * (pileW * 2 + 90), floor - pileH - 70 + rnd() * (pileH + 40), 6 + rnd() * 7);
  return c.toDataURL('image/png');
}

/** A golden pinecone lying at angle `a`, centred on (x, y), half-length r: an egg of
 * overlapping pointed scales (offset rows), stem sprig on top. */
function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  if (ready(pineconeImage)) {
    const d = r * 2.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.drawImage(pineconeImage, -d / 2, -d / 2, d, d);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  const w = r * 0.72;
  // Half-width of the egg at height t (-1 top … 1 bottom): fullest just below the middle.
  const halfW = (t: number) => w * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.18 * t);
  // Dark core silhouette.
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = -1 + (i / 40) * 2;
    ctx.lineTo(halfW(t), t * r);
  }
  for (let i = 40; i >= 0; i--) {
    const t = -1 + (i / 40) * 2;
    ctx.lineTo(-halfW(t), t * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#9a6400';
  ctx.fill();
  // Scales from the top row down, so lower rows overlap the ones above.
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const t = -0.78 + (j / (rows - 1)) * 1.5;
    const hw = halfW(t) * 0.98;
    const n = Math.max(2, Math.round((hw * 2) / (r * 0.34)));
    const sw = (hw * 2) / n, sh = r * 0.36;
    for (let i = 0; i < n; i++) {
      const cx = -hw + sw * (i + 0.5 + (j % 2 ? 0.25 : -0.25));
      if (Math.abs(cx) > hw) continue;
      const cy = t * r;
      const g = ctx.createLinearGradient(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2);
      g.addColorStop(0, '#fff1a0');
      g.addColorStop(0.45, '#ffc629');
      g.addColorStop(1, '#d08400');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - sw * 0.55, cy - sh * 0.35);
      ctx.quadraticCurveTo(cx - sw * 0.5, cy + sh * 0.35, cx, cy + sh * 0.6);
      ctx.quadraticCurveTo(cx + sw * 0.5, cy + sh * 0.35, cx + sw * 0.55, cy - sh * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a5a00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  // Gloss + stem.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.35, -r * 0.35, w * 0.12, r * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4f9a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.lineTo(-8, -r - 10); ctx.moveTo(0, -r * 0.95); ctx.lineTo(8, -r - 10);
  ctx.moveTo(0, -r * 0.95); ctx.lineTo(0, -r - 13); ctx.stroke();
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Heap of pony beads that grows with `tier` (0…4), in a jar for the big heaps (spare art). */
export function beadPackArt(tier: number, seed = 1): string {
  const W = 330, H = 256;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = [9, 22, 40, 64, 96][Math.min(4, tier)];
  const pileW = 90 + tier * 38, pileH = 40 + tier * 30;
  const beads: { x: number; y: number; r: number; col: string }[] = [];
  for (let i = 0; i < n; i++) {
    // Mound: uniform in a half-ellipse, bottom-heavy.
    const u = rnd() * 2 - 1, v = Math.sqrt(rnd());
    const x = W / 2 + u * pileW;
    const top = H - 30 - pileH * Math.sqrt(Math.max(0, 1 - u * u));
    beads.push({ x, y: H - 30 - (H - 30 - top) * (1 - v), r: 13 + rnd() * 4, col: BEAD_COLORS[Math.floor(rnd() * BEAD_COLORS.length)] });
  }
  beads.sort((a, b) => a.y - b.y);
  // Soft floor shadow.
  ctx.fillStyle = 'rgba(80,50,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 24, pileW + 24, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const b of beads) drawBead(ctx, b.x, b.y, b.r, b.col);
  if (tier >= 3) {
    // Glass jar outline around the heap.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    const jw = pileW + 30, jt = H - 40 - pileH - 26;
    ctx.beginPath();
    ctx.moveTo(W / 2 - jw, H - 26);
    ctx.lineTo(W / 2 - jw, jt + 20);
    ctx.quadraticCurveTo(W / 2 - jw, jt, W / 2 - jw + 20, jt);
    ctx.lineTo(W / 2 + jw - 20, jt);
    ctx.quadraticCurveTo(W / 2 + jw, jt, W / 2 + jw, jt + 20);
    ctx.lineTo(W / 2 + jw, H - 26);
    ctx.stroke();
    ctx.fillStyle = tier >= 4 ? '#ffd23f' : '#c89060';
    ctx.fillRect(W / 2 - jw * 0.7, jt - 22, jw * 1.4, 22);
  }
  return c.toDataURL('image/png');
}

function drawBead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, col);
  g.addColorStop(1, shade(col, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(col, -0.55);
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.34, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function shade(hex: string, k: number): string {
  const p = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f((p >> 16) & 255)},${f((p >> 8) & 255)},${f(p & 255)})`;
}
