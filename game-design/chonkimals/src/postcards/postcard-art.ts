// Camp post cards — Mr Kodak's snapshots dressed up as Camp Chonkton souvenir post cards.
// Each style is drawn to a 1200 × 800 canvas around the photo: a classic "Greetings from"
// card, a written-on "Wish you were here!" back, a "Come to Camp Chonkton!" travel poster,
// a scrapbook "Camp Memories" page and an airmail "Having a CHONKY time!" card. Every one
// carries a tiny (fake — it's just seeded noise with the three corner squares) QR code.

import { FONT } from '../ui/theme';
import { createRng, hashString, type Rng } from '../rng';

/** The captured photo's size (3:2, like the post card). */
export const POSTCARD_PHOTO = { w: 720, h: 480 } as const;
export const POSTCARD_SIZE = { w: 1200, h: 800 } as const;

export interface PostcardStyle { id: string; name: string; }
export const POSTCARD_STYLES: readonly PostcardStyle[] = [
  { id: 'greetings', name: 'Greetings From' },
  { id: 'wish', name: 'Wish You Were Here' },
  { id: 'poster', name: 'Come to Camp' },
  { id: 'memories', name: 'Camp Memories' },
  { id: 'airmail', name: 'Airmail' },
];

export interface PostcardInput {
  id: string;
  image: string;
  caption: string;
  place: string;
  takenAt: number;
  style: number;
}

type Ctx = CanvasRenderingContext2D;
const W = POSTCARD_SIZE.w, H = POSTCARD_SIZE.h;
const INK = '#4a2f1c';
const HAND = `'Fredoka', 'Comic Sans MS', system-ui, sans-serif`;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
    imageCache.set(src, p);
    if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value!);
  }
  return p;
}

/** Draws the post card for `photo` (its own style) into a new canvas. `from` signs the note. */
export async function renderPostcard(photo: PostcardInput, from = 'Me'): Promise<HTMLCanvasElement> {
  const img = await loadImage(photo.image);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d')!;
  const rng = createRng(hashString(photo.id));
  const d: Draw = { ctx, img, photo, rng, from, date: formatDate(photo.takenAt) };
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.clip();
  const style = POSTCARD_STYLES[((photo.style % POSTCARD_STYLES.length) + POSTCARD_STYLES.length) % POSTCARD_STYLES.length];
  STYLE_DRAW[style.id](d);
  ctx.restore();
  return c;
}

interface Draw { ctx: Ctx; img: HTMLImageElement; photo: PostcardInput; rng: Rng; from: string; date: string; }

const STYLE_DRAW: Record<string, (d: Draw) => void> = {
  // ── Classic: the photo full-bleed, big chunky letters across the bottom ──
  greetings({ ctx, img, photo, rng, date }) {
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    roundRect(ctx, 30, 30, W - 60, H - 60, 16);
    ctx.clip();
    cover(ctx, img, 30, 30, W - 60, H - 60);
    // Warm vintage wash + a dark foot so the letters pop.
    ctx.fillStyle = 'rgba(255,200,120,0.12)';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(40,20,5,0)');
    g.addColorStop(1, 'rgba(40,20,5,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.translate(70, 120);
    ctx.rotate(-0.06);
    outlined(ctx, 'Greetings from', 0, 0, `italic 700 68px ${FONT}`, '#fff', INK, 12, 'left');
    ctx.restore();

    blockLetters(ctx, 'CAMP CHONKTON', 520, 690, 900, 150);
    pill(ctx, `📸 ${photo.caption}`, W - 70, 70, 34, 'right');
    outlined(ctx, date, W - 78, 150, `600 28px ${FONT}`, '#fff', INK, 7, 'right');
    fakeQr(ctx, W - 175, H - 175, 120, rng);
  },

  // ── The back of a post card, written on: photo pinned left, note + stamp right ──
  wish({ ctx, img, photo, rng, from, date }) {
    paper(ctx, '#fdf5e4', rng);
    polaroid(ctx, img, 60, 90, 620, -0.045, photo.caption);
    // Divider.
    ctx.strokeStyle = 'rgba(106,74,48,0.45)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(748, 60); ctx.lineTo(748, H - 60); ctx.stroke();
    ctx.setLineDash([]);
    stamp(ctx, 1010, 44, 140, 170, '🏕️', 0.05, '#e8483f');
    postmark(ctx, 985, 205, date);

    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 60px ${HAND}`;
    ctx.fillText('Wish you', 780, 300);
    ctx.fillStyle = '#e8483f';
    ctx.fillText('were here!', 780, 368);

    const note = [`Having a blast at ${photo.place}!`, 'Come to camp with me next time!'];
    ruledNote(ctx, note, 780, 430, 380, 50, 30);
    ctx.fillStyle = INK;
    ctx.font = `600 32px ${HAND}`;
    ctx.fillText(`Love, ${from} ♥`, 780, 636);
    fakeQr(ctx, W - 150, H - 150, 100, rng);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = 'rgba(74,47,28,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText('scan to visit camp ➜', W - 162, H - 70);
  },

  // ── Vintage travel poster: sunburst, banners, the photo framed in the middle ──
  poster({ ctx, img, photo, rng }) {
    sunburst(ctx, W / 2, 470, '#ffc35a', '#ffdc85');
    ctx.strokeStyle = '#2f8f9d';
    ctx.lineWidth = 36;
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.stroke();
    ribbon(ctx, W / 2, 92, 380, 76, '#2f8f9d', '#1f6570');
    outlined(ctx, 'COME TO', W / 2, 118, `700 60px ${FONT}`, '#fff', '#1f6570', 8, 'center');
    blockLetters(ctx, 'CAMP CHONKTON!', W / 2, 250, 1000, 118);

    const pw = 700, ph = 400, px = (W - pw) / 2, py = 290;
    ctx.save();
    ctx.shadowColor = 'rgba(60,30,0,0.35)';
    ctx.shadowOffsetY = 10;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    roundRect(ctx, px - 14, py - 14, pw + 28, ph + 28, 26);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 16);
    ctx.clip();
    cover(ctx, img, px, py, pw, ph);
    ctx.restore();

    ctx.save();
    ctx.translate(px + 40, py + ph - 10);
    ctx.rotate(-0.08);
    pill(ctx, `★ ${photo.caption}`, 0, 0, 32, 'left', '#e8483f', '#fff', '#a52a22');
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Fresh air · New friends · Big chonky adventures', W / 2, 754);
    fakeQr(ctx, W - 160, H - 185, 104, rng);
  },

  // ── Scrapbook page: kraft paper, a taped-in polaroid, doodles ──
  memories({ ctx, img, photo, rng, from, date }) {
    paper(ctx, '#caa574', rng, true);
    polaroid(ctx, img, 70, 80, 660, 0.04, photo.caption, true);
    // Doodles round the page.
    // Doodles in the margins (clear of the writing and the QR tag).
    for (const [x, y] of [[800, 96], [960, 70], [1150, 110], [1168, 330], [1160, 480], [800, 640], [930, 740], [60, 730], [700, 40]]) {
      doodleStar(ctx, x + rng.range(-14, 14), y + rng.range(-14, 14), rng.range(12, 22),
        rng.pick(['#fff4c2', '#ffffff', '#ff9eb8']), rng.range(0, 1));
    }
    ctx.fillStyle = '#3d2413';
    ctx.textAlign = 'left';
    ctx.font = `700 66px ${HAND}`;
    ctx.fillText('My Camp', 790, 190);
    ctx.fillText('Memories', 790, 262);
    heart(ctx, 1120, 222, 26, '#e8483f');
    ctx.font = `500 34px ${HAND}`;
    ctx.fillStyle = '#4a2f1c';
    wrap(ctx, `Sharing the fun from ${photo.place}! Couldn't stop smiling.`, 360).forEach((l, i) =>
      ctx.fillText(l, 790, 350 + i * 46));
    ctx.font = `600 30px ${HAND}`;
    ctx.fillText(`– ${from}, ${date}`, 790, 560);
    // A paper tag for the QR.
    ctx.save();
    ctx.translate(1060, 668);
    ctx.rotate(0.06);
    ctx.fillStyle = '#fffaf0';
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowOffsetY = 4; ctx.shadowBlur = 6;
    roundRect(ctx, -80, -92, 160, 180, 12);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(1060, 668);
    ctx.rotate(0.06);
    fakeQr(ctx, -54, -80, 108, rng, false);
    ctx.fillStyle = INK;
    ctx.font = `700 22px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText('scan me!', 0, 64);
    ctx.restore();
    tape(ctx, 1060, 578, 0.3);
  },

  // ── Airmail: striped border, the photo, a big PAR AVION stamp ──
  airmail({ ctx, img, photo, rng, from, date }) {
    // Striped border (red / cream / blue diagonals), cream inside.
    ctx.save();
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    roundRectPath(ctx, 34, 34, W - 68, H - 68, 12);
    ctx.clip('evenodd');
    for (let x = -H, i = 0; x < W + H; x += 44, i++) {
      ctx.fillStyle = i % 4 === 0 ? '#e8483f' : i % 4 === 2 ? '#3a6fa8' : '#fffaf0';
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 44, 0); ctx.lineTo(x + 44 + H, H); ctx.lineTo(x + H, H);
      ctx.fill();
    }
    ctx.restore();

    const px = 70, py = 70, pw = 740, ph = 494;
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 12);
    ctx.clip();
    cover(ctx, img, px, py, pw, ph);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 10;
    roundRect(ctx, px, py, pw, ph, 12);
    ctx.stroke();

    stamp(ctx, 880, 72, 250, 290, '⛺', -0.03, '#3a6fa8', 'CAMP CHONKTON', '5¢');
    // Wavy cancellation lines over the stamp's corner.
    ctx.strokeStyle = 'rgba(40,40,60,0.55)';
    ctx.lineWidth = 5;
    for (let r = 0; r < 4; r++) {
      ctx.beginPath();
      for (let x = 820; x <= 1010; x += 6) {
        const y = 300 + r * 22 + Math.sin(x / 18) * 8;
        if (x === 820) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    outlined(ctx, 'PAR AVION ✈', 1005, 430, `700 34px ${FONT}`, '#3a6fa8', '#fffaf0', 0, 'center');

    outlined(ctx, 'Having a CHONKY time!', px + 6, 650, `700 62px ${FONT}`, '#3a6fa8', '#fff', 0, 'left');
    ctx.fillStyle = INK;
    ctx.font = `600 32px ${HAND}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${photo.caption} · ${date} · xo ${from}`, px + 8, 712);
    ctx.font = `600 30px ${HAND}`;
    ctx.fillText('Send more', 880, 510);
    ctx.fillText("s'mores! 🔥", 880, 552);
    fakeQr(ctx, W - 170, H - 170, 110, rng);
  },
};

// ── Drawing helpers ─────────────────────────────────────────────────────────

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

/** Adds a rounded rectangle to the current path (no beginPath, so it can cut holes). */
function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw `img` to fill the box (cropping the overflow), like CSS object-fit: cover. */
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function outlined(ctx: Ctx, text: string, x: number, y: number, font: string, fill: string, stroke: string,
                  width: number, align: CanvasTextAlign): void {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (width > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Chunky souvenir lettering: a drop layer, a thick brown rim, a sunny gradient face. */
function blockLetters(ctx: Ctx, text: string, cx: number, baseY: number, maxW: number, size: number): void {
  let s = size;
  ctx.font = `700 ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > 40) { s -= 4; ctx.font = `700 ${s}px ${FONT}`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#3a2415';
  ctx.strokeStyle = '#3a2415';
  ctx.lineWidth = s * 0.16;
  ctx.strokeText(text, cx + s * 0.05, baseY + s * 0.07);
  ctx.fillText(text, cx + s * 0.05, baseY + s * 0.07);
  ctx.strokeStyle = '#6d4028';
  ctx.lineWidth = s * 0.13;
  ctx.strokeText(text, cx, baseY);
  const g = ctx.createLinearGradient(0, baseY - s * 0.8, 0, baseY);
  g.addColorStop(0, '#fff27a');
  g.addColorStop(0.55, '#ffc629');
  g.addColorStop(1, '#ff8a2a');
  ctx.fillStyle = g;
  ctx.fillText(text, cx, baseY);
}

/** A rounded label; `align` says which end sits at x. Returns nothing (draws in place). */
function pill(ctx: Ctx, text: string, x: number, y: number, size: number, align: 'left' | 'right',
              bg = '#fffaf0', fg = INK, rim = '#6d4028'): void {
  ctx.font = `700 ${size}px ${FONT}`;
  const tw = Math.min(ctx.measureText(text).width, 640);
  const w = tw + size * 1.4, h = size * 1.7;
  const left = align === 'left' ? x : x - w;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = bg;
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 5;
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + size * 0.7, y + 1, tw);
  ctx.textBaseline = 'alphabetic';
}

/** Paper fill with fibres (and kraft speckles). */
function paper(ctx: Ctx, color: string, rng: Rng, speckled = false): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < (speckled ? 900 : 300); i++) {
    ctx.fillStyle = speckled
      ? (rng.chance(0.5) ? 'rgba(90,55,20,0.18)' : 'rgba(255,240,210,0.22)')
      : 'rgba(150,110,70,0.07)';
    const r = rng.range(0.8, speckled ? 2.6 : 1.8);
    ctx.beginPath();
    ctx.arc(rng.range(0, W), rng.range(0, H), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A white-bordered instant photo, tilted, with a handwritten caption in its chin. */
function polaroid(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, tilt: number,
                  caption: string, taped = false): void {
  const pad = 22, pw = w - pad * 2, ph = pw * (POSTCARD_PHOTO.h / POSTCARD_PHOTO.w), chin = 96;
  const h = pad + ph + chin;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(40,20,5,0.3)';
  ctx.shadowOffsetY = 10;
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  cover(ctx, img, pad, pad, pw, ph);
  ctx.fillStyle = INK;
  ctx.font = `600 42px ${HAND}`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, w / 2, pad + ph + 64, w - 40);
  if (taped) { tape(ctx, 40, 6, -0.5); tape(ctx, w - 40, 6, 0.5); }
  ctx.restore();
}

function tape(ctx: Ctx, cx: number, cy: number, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(255,236,160,0.72)';
  ctx.fillRect(-60, -20, 120, 40);
  ctx.restore();
}

/** A perforated postage stamp with a picture (emoji) and optional text. */
function stamp(ctx: Ctx, x: number, y: number, w: number, h: number, emoji: string, rot: number, color: string,
               title = 'CAMP', value = ''): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowOffsetY = 4;
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent';
  // Perforations: bite semicircles out of the edges.
  ctx.globalCompositeOperation = 'destination-out';
  const step = 18;
  for (let i = step / 2; i < w; i += step) { dot(ctx, i, 0, 5); dot(ctx, i, h, 5); }
  for (let i = step / 2; i < h; i += step) { dot(ctx, 0, i, 5); dot(ctx, w, i, 5); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.fillRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(20, 20, w - 40, h - 40);
  ctx.font = `${Math.round(Math.min(w, h) * 0.46)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, w / 2, h * 0.5);
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(w * 0.11)}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, w / 2, 20 + w * 0.14, w - 50);
  if (value) {
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.round(w * 0.14)}px ${FONT}`;
    ctx.fillText(value, w - 32, h - 34);
  }
  ctx.restore();
}

function dot(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Round camp postmark with the date. */
function postmark(ctx: Ctx, cx: number, cy: number, date: string): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(40,40,70,0.55)';
  ctx.fillStyle = 'rgba(40,40,70,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 64, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAMP', cx, cy - 18);
  ctx.fillText('CHONKTON', cx, cy + 2);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(date.toUpperCase(), cx, cy + 22);
  ctx.restore();
}

/** Handwritten lines on a ruled note. */
function ruledNote(ctx: Ctx, lines: string[], x: number, y: number, w: number, gap: number, size: number): void {
  ctx.font = `500 ${size}px ${HAND}`;
  ctx.textAlign = 'left';
  let row = 0;
  for (const line of lines) {
    for (const l of wrap(ctx, line, w)) {
      const ly = y + row * gap;
      ctx.strokeStyle = 'rgba(58,111,168,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, ly + 10); ctx.lineTo(x + w, ly + 10); ctx.stroke();
      ctx.fillStyle = '#3a4f78';
      ctx.fillText(l, x + 4, ly);
      row++;
      if (row >= 4) return;
    }
  }
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function sunburst(ctx: Ctx, cx: number, cy: number, a: string, b: string): void {
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = a;
  const n = 24, R = 1600;
  for (let i = 0; i < n; i += 2) {
    const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(t0) * R, cy + Math.sin(t0) * R);
    ctx.lineTo(cx + Math.cos(t1) * R, cy + Math.sin(t1) * R);
    ctx.fill();
  }
}

function ribbon(ctx: Ctx, cx: number, cy: number, w: number, h: number, face: string, fold: string): void {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = fold;
  for (const s of [-1, 1]) {
    const ex = s < 0 ? x - 50 : x + w + 50, ix = s < 0 ? x + 20 : x + w - 20;
    ctx.beginPath();
    ctx.moveTo(ix, y + 16); ctx.lineTo(ex, y + 16); ctx.lineTo(ex + s * -24, y + 16 + h / 2);
    ctx.lineTo(ex, y + 16 + h); ctx.lineTo(ix, y + 16 + h);
    ctx.fill();
  }
  ctx.fillStyle = face;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
}

function doodleStar(ctx: Ctx, cx: number, cy: number, r: number, color: string, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,35,15,0.5)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function heart(ctx: Ctx, cx: number, cy: number, s: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.2, -s * 0.4, -s * 0.4, -s * 1.1, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.4, -s * 1.1, s * 1.2, -s * 0.4, 0, s * 0.35);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * A tiny FAKE QR code — the three finder squares, timing dots and seeded noise. It looks the
 * part but encodes nothing. `tile` puts it on a white rounded card with a quiet zone.
 */
function fakeQr(ctx: Ctx, x: number, y: number, size: number, rng: Rng, tile = true): void {
  const N = 25;
  const q = tile ? size * 0.09 : 0;
  const m = (size - q * 2) / N;
  if (tile) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#fff';
    roundRect(ctx, x, y, size, size, size * 0.1);
    ctx.fill();
    ctx.restore();
  }
  const ox = x + q, oy = y + q;
  ctx.fillStyle = '#1d1a16';
  const finder = (fx: number, fy: number) => {
    ctx.fillRect(ox + fx * m, oy + fy * m, 7 * m, 7 * m);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + (fx + 1) * m, oy + (fy + 1) * m, 5 * m, 5 * m);
    ctx.fillStyle = '#1d1a16';
    ctx.fillRect(ox + (fx + 2) * m, oy + (fy + 2) * m, 3 * m, 3 * m);
  };
  const inFinder = (i: number, j: number) =>
    (i < 8 && j < 8) || (i >= N - 8 && j < 8) || (i < 8 && j >= N - 8);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (inFinder(i, j)) continue;
      const timing = (i === 6 || j === 6);
      const on = timing ? (i + j) % 2 === 0 : rng.chance(0.48);
      if (on) ctx.fillRect(ox + i * m, oy + j * m, m + 0.4, m + 0.4);
    }
  }
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  // Alignment square.
  ctx.fillRect(ox + (N - 9) * m, oy + (N - 9) * m, 5 * m, 5 * m);
  ctx.fillStyle = '#fff';
  ctx.fillRect(ox + (N - 8) * m, oy + (N - 8) * m, 3 * m, 3 * m);
  ctx.fillStyle = '#1d1a16';
  ctx.fillRect(ox + (N - 7) * m, oy + (N - 7) * m, m, m);
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}
