// Reward art: real PNG if one has been dropped in assets/ui/rewards/<id>.png,
// otherwise a generated placeholder (emoji tile / paint blob / chonk portrait).
// Everything resolves to a 512 px canvas so the 3D reveal and the UI share it.

import { chonkArt } from '../ui/theme';
import { RARITY_INFO, type Reward } from './rewards';

const SIZE = 512;
export const rewardImagePath = (id: string): string => `assets/ui/rewards/${id}.png`;

const cache = new Map<string, Promise<HTMLCanvasElement>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The reward's art as a 512 px canvas (cached). */
export function rewardCanvas(r: Reward): Promise<HTMLCanvasElement> {
  let p = cache.get(r.id);
  if (!p) {
    p = (async () => {
      const real = await loadImage(rewardImagePath(r.id));
      if (real) return drawContained(real);
      if (r.chonk) {
        const portrait = await loadImage(chonkArt(r.chonk));
        if (portrait) return drawContained(portrait, 0.92);
      }
      return placeholder(r);
    })();
    cache.set(r.id, p);
  }
  return p;
}

/** Synchronous placeholder art as a data URL (Shop cards need a URL up front). */
export function rewardPlaceholderUrl(r: Reward): string {
  return placeholder(r).toDataURL('image/png');
}

const iconCache = new Map<string, Promise<string>>();

/**
 * Just the item on a transparent background — no rarity tile — for small HUD icons (the toy
 * button): the real PNG if there is one, else the placeholder's glyph on its own. Data URL, cached.
 */
export function rewardIconUrl(r: Reward): Promise<string> {
  let p = iconCache.get(r.id);
  if (!p) {
    p = (async () => {
      const real = await loadImage(rewardImagePath(r.id));
      if (real) return drawContained(real).toDataURL('image/png');
      const [c, ctx] = canvas();
      ctx.font = `400px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.emoji ?? '🎁', SIZE / 2, SIZE / 2 + 20);
      return c.toDataURL('image/png');
    })();
    iconCache.set(r.id, p);
  }
  return p;
}

/** Data URL for <img> tags. */
export async function rewardArtUrl(r: Reward): Promise<string> {
  return (await rewardCanvas(r)).toDataURL('image/png');
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  return [c, c.getContext('2d')!];
}

function drawContained(img: HTMLImageElement, fill = 1): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const k = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight) * fill;
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  return c;
}

function placeholder(r: Reward): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const cols = typeof r.swatch === 'string' ? [r.swatch] : [...(r.swatch ?? ['#cccccc'])];
  if (r.kind === 'pennant') { drawPennant(ctx, cols); return c; }
  if (r.kind === 'tent' || r.kind === 'tent_colour') { drawTent(ctx, cols); return c; }
  // Colours (chonk paint, bed colours…): a blob of paint unless there's a glyph to draw.
  if (r.kind === 'colour' || (r.swatch && !r.emoji)) { paintBlob(ctx, cols); return c; }
  // Clay tile in the rarity colour with a big glyph.
  const tint = RARITY_INFO[r.rarity].color;
  const m = 56, rad = 110;
  ctx.save();
  roundRect(ctx, m, m + 14, SIZE - m * 2, SIZE - m * 2, rad);
  ctx.fillStyle = 'rgba(40,24,12,0.28)';
  ctx.fill();
  roundRect(ctx, m, m, SIZE - m * 2, SIZE - m * 2, rad);
  const g = ctx.createLinearGradient(0, m, 0, SIZE - m);
  g.addColorStop(0, '#fff8ee');
  g.addColorStop(1, mix(tint, '#fff8ee', 0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = tint;
  ctx.stroke();
  ctx.restore();
  ctx.font = `230px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(r.emoji ?? '🎁', SIZE / 2, SIZE / 2 + 10);
  return c;
}

/** A glossy dollop of clay paint. */
function paintBlob(ctx: CanvasRenderingContext2D, cols: string[]): void {
  const cx = SIZE / 2, cy = SIZE / 2 + 8, R = 190;
  const blob = () => {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r = R * (1 + 0.06 * Math.sin(a * 3 + 0.6) + 0.04 * Math.sin(a * 5 + 2));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.92;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(0, 16);
  blob();
  ctx.fillStyle = 'rgba(40,24,12,0.28)';
  ctx.fill();
  ctx.restore();
  blob();
  const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  cols.forEach((col, i) => g.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), col));
  if (cols.length === 1) g.addColorStop(1, mix(cols[0], '#000000', 0.2));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  // Soft shading + gloss.
  const sh = ctx.createRadialGradient(cx - 60, cy - 70, 20, cx, cy, R * 1.1);
  sh.addColorStop(0, 'rgba(255,255,255,0.35)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.22)');
  blob();
  ctx.fillStyle = sh;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 70, cy - 90, 52, 26, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}

/** Felt camp pennant on a little pole: felt colour(s) + hoist band + dashed stitching. */
function drawPennant(ctx: CanvasRenderingContext2D, cols: string[]): void {
  const x0 = 110, top = 130, H = 230, L = 330;
  // Pole.
  ctx.fillStyle = '#8a5a3a';
  roundRect(ctx, x0 - 22, 70, 20, 380, 10); ctx.fill();
  ctx.fillStyle = '#ffc93f';
  ctx.beginPath(); ctx.arc(x0 - 12, 66, 18, 0, Math.PI * 2); ctx.fill();
  const tri = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 + inset * 0.6, top + inset);
    ctx.lineTo(x0 + L - inset * 2.2, top + H / 2);
    ctx.lineTo(x0 + inset * 0.6, top + H - inset);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(0, 12); tri(0); ctx.fillStyle = 'rgba(40,24,12,0.25)'; ctx.fill();
  ctx.restore();
  ctx.save();
  tri(0);
  ctx.clip();
  const main = cols.length > 2 ? cols : [cols[0]];
  // Multi-colour felt = stripes along the pennant.
  main.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x0, top + (H / main.length) * i, L, H / main.length + 1); });
  ctx.fillStyle = cols.length === 2 ? cols[1] : '#f3e6cf';
  ctx.fillRect(x0, top, 34, H);
  const sh = ctx.createLinearGradient(0, top, 0, top + H);
  sh.addColorStop(0, 'rgba(0,0,0,0.16)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = sh; ctx.fillRect(x0, top, L, H);
  ctx.restore();
  ctx.save();
  ctx.setLineDash([14, 10]); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,248,230,0.9)';
  tri(16); ctx.stroke();
  ctx.restore();
  // Star appliqué.
  ctx.fillStyle = '#fff3dc';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? 18 : 42;
    ctx.lineTo(x0 + 120 + Math.cos(a) * rr, top + H / 2 + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

/** Clay A-frame tent with an open door flap, in the tent colour(s). */
function drawTent(ctx: CanvasRenderingContext2D, cols: string[]): void {
  const cx = 256, base = 410, w = 190, top = 120;
  ctx.fillStyle = 'rgba(40,24,12,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, base + 10, w + 40, 26, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(cx - w, top, cx + w, base);
  g.addColorStop(0, cols[0]); g.addColorStop(1, mix(cols[cols.length - 1], '#000000', 0.18));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.quadraticCurveTo(cx + w * 0.5, top + 120, cx + w, base);
  ctx.lineTo(cx - w, base); ctx.quadraticCurveTo(cx - w * 0.5, top + 120, cx, top); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = mix(cols[0], '#000000', 0.4); ctx.lineJoin = 'round'; ctx.stroke();
  if (cols.length > 1 && cols[0] !== cols[1]) {
    // Starry pattern for the fancy two-tone tents.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [sx, sy, sr] of [[-90, 330, 6], [70, 260, 5], [110, 360, 7], [-40, 230, 4], [20, 330, 5]]) {
      ctx.beginPath(); ctx.arc(cx + sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Door: dark opening + folded-back flap.
  ctx.fillStyle = '#3a2415';
  ctx.beginPath(); ctx.moveTo(cx, top + 110); ctx.lineTo(cx + 62, base); ctx.lineTo(cx - 62, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = mix(cols[0], '#ffffff', 0.3);
  ctx.beginPath(); ctx.moveTo(cx, top + 110); ctx.lineTo(cx + 62, base); ctx.lineTo(cx + 110, base - 30); ctx.closePath(); ctx.fill();
  // Ridge pole knob + gloss.
  ctx.fillStyle = '#ffc93f'; ctx.beginPath(); ctx.arc(cx, top - 6, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(cx - 70, top + 150, 16, 60, 0.45, 0, Math.PI * 2); ctx.fill();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
