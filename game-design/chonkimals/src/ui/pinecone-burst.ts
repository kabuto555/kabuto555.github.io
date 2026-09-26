// Golden Pinecone purchase celebration: a flash, the big pinecone popping in the middle with
// light rays and a "+N" counter, a spray of pinecones bursting out around it — then they stream
// in arcs into the wallet's pinecone, ticking its number up as each one lands. Everything
// scales with the pack (tier 0…4 = 10 … 700 pinecones): more cones, wider rays, sparkles and a
// screen shake for the big ones. CSS px overlay on `host`, input passes straight through.

import { COLORS, FONT, textOutline } from './theme';
import { el } from './components';
import { icon } from './icons';
import { sfxReveal, unlockCarePackageAudio } from '../care-package/sfx';
import { playClaim } from '../minigame-sounds';

const ART = icon('currency', 'pinecone');

/** Per-tier look (index = pack tier). */
const TIERS = [
  { cones: 8, rays: 0.8, spread: 1.0, hold: 520, shake: 0, sparkles: 4 },
  { cones: 14, rays: 1.0, spread: 1.15, hold: 600, shake: 0, sparkles: 8 },
  { cones: 20, rays: 1.15, spread: 1.3, hold: 700, shake: 4, sparkles: 12 },
  { cones: 28, rays: 1.3, spread: 1.45, hold: 820, shake: 7, sparkles: 18 },
  { cones: 40, rays: 1.5, spread: 1.6, hold: 950, shake: 11, sparkles: 26 },
];

/** Pack size → tier (the Shop's 10 / 55 / 120 / 260 / 700 packs). */
export function pineconeTier(amount: number): number {
  return amount >= 700 ? 4 : amount >= 260 ? 3 : amount >= 120 ? 2 : amount >= 55 ? 1 : 0;
}

export interface PineconeBurstOptions {
  amount: number;
  /** The wallet's pinecone icon — where the cones fly to. */
  target: HTMLElement | null;
  /** 0..1 as the cones land (tick the wallet's number: from + amount × k). */
  onProgress?: (k: number) => void;
  onDone?: () => void;
  /** Shaken on the big packs (e.g. the Shop screen's root). */
  shake?: HTMLElement;
}

export function celebratePinecones(host: HTMLElement, o: PineconeBurstOptions): void {
  const tier = pineconeTier(o.amount);
  const T = TIERS[tier];
  const W = host.clientWidth, H = host.clientHeight;
  const S = Math.min(W, H * 0.6) / 400; // size unit (designed at a 400 px wide phone)
  const cx = W / 2, cy = H * 0.42;
  const hr = host.getBoundingClientRect();
  const tr = o.target?.getBoundingClientRect();
  const tx = tr ? tr.left - hr.left + tr.width / 2 : W - 60 * S;
  const ty = tr ? tr.top - hr.top + tr.height / 2 : 40 * S;

  unlockCarePackageAudio();
  sfxReveal(Math.min(4, tier + 1), true);

  const layer = el('div', 'position:absolute;inset:0;z-index:150;pointer-events:none;overflow:hidden;');
  host.appendChild(layer);
  const at = (e: HTMLElement, x: number, y: number, size: number) => {
    e.style.cssText += `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;`;
    layer.appendChild(e);
    return e;
  };

  // Flash.
  const flash = el('div', 'position:absolute;inset:0;background:radial-gradient(circle at 50% 42%, rgba(255,240,180,0.95), ' +
    'rgba(255,214,90,0.45) 35%, rgba(255,214,90,0) 70%);');
  layer.appendChild(flash);
  flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });

  // Rays + glow behind the big cone.
  const raysSize = 330 * S * T.rays;
  const rays = at(el('div', 'border-radius:50%;background:repeating-conic-gradient(rgba(255,226,120,0.55) 0deg 9deg, ' +
    'rgba(255,226,120,0) 9deg 22deg);-webkit-mask:radial-gradient(circle, #000 20%, transparent 70%);' +
    'mask:radial-gradient(circle, #000 20%, transparent 70%);'), cx, cy, raysSize);
  rays.animate([{ transform: 'scale(0.2) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(60deg)', opacity: 1, offset: 0.2 },
    { transform: 'scale(1.05) rotate(240deg)', opacity: 1 }], { duration: 3000, easing: 'linear', fill: 'forwards' });
  const glow = at(el('div', 'border-radius:50%;background:radial-gradient(circle, rgba(255,236,160,0.9), rgba(255,200,60,0) 68%);'),
    cx, cy, 220 * S * T.rays);
  glow.animate([{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 400, easing: 'ease-out', fill: 'forwards' });

  // The big pinecone + "+N".
  const big = at(img(), cx, cy, 150 * S);
  big.animate([{ transform: 'scale(0) rotate(-25deg)' }, { transform: 'scale(1.25) rotate(8deg)', offset: 0.6 },
    { transform: 'scale(1) rotate(0deg)' }], { duration: 480, easing: 'ease-out', fill: 'forwards' });
  big.animate([{ translate: '0 0' }, { translate: `0 ${-8 * S}px` }], { duration: 700, delay: 480, direction: 'alternate', iterations: 6, easing: 'ease-in-out' });
  const label = el('p', `position:absolute;left:0;right:0;top:${cy + 88 * S}px;text-align:center;font-family:${FONT};font-weight:700;` +
    `font-size:${Math.round(40 * S + tier * 4 * S)}px;color:${COLORS.coinLight};text-shadow:${textOutline(COLORS.brownDark, 3.2 * S)};`);
  layer.appendChild(label);
  label.animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 420, delay: 160, easing: 'ease-out', fill: 'backwards' });
  const countFor = 420 + T.hold;
  const t0 = performance.now();
  const count = () => {
    const k = Math.min(1, (performance.now() - t0) / countFor);
    label.textContent = `+${Math.round(o.amount * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US')}`;
    if (k < 1 && layer.isConnected) requestAnimationFrame(count);
  };
  count();

  // Sparkles.
  for (let i = 0; i < T.sparkles; i++) {
    const a = Math.random() * Math.PI * 2, r = (70 + Math.random() * 130) * S * T.spread;
    const sp = at(el('div', `background:${COLORS.coinLight};clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);`),
      cx + Math.cos(a) * r, cy + Math.sin(a) * r, (10 + Math.random() * 14) * S);
    sp.animate([{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(90deg)', opacity: 1, offset: 0.4 },
      { transform: 'scale(0) rotate(180deg)', opacity: 0 }], { duration: 700 + Math.random() * 500, delay: 120 + Math.random() * 600, fill: 'both' });
  }

  // Shake for the big packs.
  if (T.shake && o.shake) {
    const s = T.shake;
    o.shake.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-s}px,${s * 0.6}px)` }, { transform: `translate(${s}px,${-s * 0.4}px)` },
      { transform: `translate(${-s * 0.5}px,${-s * 0.5}px)` }, { transform: 'translate(0,0)' }], { duration: 360, delay: 120, easing: 'ease-out' });
  }

  // Burst, hold, then stream into the wallet.
  const n = T.cones;
  let landed = 0;
  const flyStart = 420 + T.hold;
  const stagger = Math.max(18, 420 / n);
  for (let i = 0; i < n; i++) {
    const size = (30 + Math.random() * 16) * S;
    const cone = at(img(), cx, cy, size);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = (80 + Math.random() * 120) * S * T.spread;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.8 - 20 * S;
    const spin = (Math.random() - 0.5) * 540;
    cone.animate([{ transform: 'translate(0,0) scale(0.2) rotate(0deg)', opacity: 0 },
      { transform: `translate(${px}px,${py}px) scale(1) rotate(${spin}deg)`, opacity: 1 }],
      { duration: 520, delay: 120 + Math.random() * 120, easing: 'cubic-bezier(.15,.9,.3,1.2)', fill: 'forwards' });
    // Arc up and over into the wallet.
    const sx = cx + px, sy = cy + py;
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 80 * S, my = Math.min(sy, ty) - (60 + Math.random() * 80) * S;
    const fly = cone.animate([
      { transform: `translate(${px}px,${py}px) scale(1) rotate(${spin}deg)`, opacity: 1 },
      { transform: `translate(${mx - cx}px,${my - cy}px) scale(0.85) rotate(${spin + 180}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx - cx}px,${ty - cy}px) scale(0.35) rotate(${spin + 360}deg)`, opacity: 0.9 },
    ], { duration: 620 + Math.random() * 120, delay: flyStart + i * stagger, easing: 'ease-in', fill: 'forwards' });
    fly.onfinish = () => {
      cone.remove();
      landed++;
      o.onProgress?.(landed / n);
      bump(o.target);
      if (landed % Math.max(1, Math.round(n / 10)) === 0 || landed === n) playClaim(0.35);
      if (landed === n) finish();
    };
  }

  function finish(): void {
    // The big cone follows the last of them in; the rays and label fade.
    big.animate([{ transform: 'scale(1)' }, { transform: `translate(${tx - cx}px,${ty - cy}px) scale(0.3)`, opacity: 0.4 }],
      { duration: 420, easing: 'ease-in', fill: 'forwards' }).onfinish = () => { bump(o.target, 1.35); };
    for (const e of [rays, glow, label]) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
    window.setTimeout(() => { layer.remove(); o.onDone?.(); }, 460);
  }
}

function img(): HTMLImageElement {
  const i = document.createElement('img');
  i.src = ART; i.alt = ''; i.draggable = false;
  i.style.cssText = 'object-fit:contain;pointer-events:none;will-change:transform;';
  return i;
}

/** The wallet icon's catch bump. */
function bump(t: HTMLElement | null, k = 1.25): void {
  t?.animate([{ transform: 'scale(1)' }, { transform: `scale(${k})` }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
}
