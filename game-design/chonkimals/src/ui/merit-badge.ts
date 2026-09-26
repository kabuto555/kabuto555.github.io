// Merit badge patch art — an embroidered round patch (SVG): a whip-stitched rim in the
// category colour, twill felt, a running stitch inside, the badge's emoji in the middle and
// its name stitched round the bottom; stars across the top for a series tier. Unearned
// badges are an empty stitched outline on the sash with a faded emoji (or "?" when secret).
// Used by the sash screen and the badge toast.

import { FONT } from './theme';
import { CATEGORIES, type Badge } from '../achievements/content';

const NS = 'http://www.w3.org/2000/svg';
const TIER_STAR = ['', '#d99559', '#dfe6ee', '#ffd23f']; // bronze · silver · gold
let uid = 0;

export type PatchState = 'earned' | 'locked';

/** A `size`-px patch for `b`. */
export function meritPatch(b: Badge, size: number, state: PatchState = 'earned'): SVGSVGElement {
  const id = `mb${uid++}`;
  const cat = CATEGORIES[b.category];
  const earned = state === 'earned';
  const hidden = !earned && b.secret;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.style.cssText = 'display:block;overflow:visible;flex-shrink:0;';
  const name = esc(b.name.toUpperCase());
  const label = name.length > 14 ? 7 : name.length > 10 ? 8.2 : 9.4;
  const stars = b.tier ? Array.from({ length: b.tier }, (_, i) => {
    const x = 50 + (i - (b.tier! - 1) / 2) * 9;
    return `<text x="${x}" y="21.5" text-anchor="middle" font-size="9" fill="${TIER_STAR[b.tier!]}" ` +
      `stroke="rgba(0,0,0,0.35)" stroke-width="0.6" paint-order="stroke">★</text>`;
  }).join('') : '';

  svg.innerHTML = earned ? `
    <defs>
      <radialGradient id="${id}f" cx="42%" cy="36%" r="70%">
        <stop offset="0" stop-color="${mix(cat.felt, '#ffffff', 0.28)}"/>
        <stop offset="1" stop-color="${cat.felt}"/>
      </radialGradient>
      <pattern id="${id}t" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="1.2" height="3" fill="rgba(255,255,255,0.09)"/>
      </pattern>
      <path id="${id}a" d="M 18,50 A 32,32 0 0,0 82,50"/>
    </defs>
    <circle cx="50" cy="53" r="48" fill="rgba(0,0,0,0.3)"/>
    <circle cx="50" cy="50" r="48" fill="${cat.rim}"/>
    <circle cx="50" cy="50" r="45.5" fill="none" stroke="${mix(cat.rim, '#ffffff', 0.35)}" stroke-width="5" stroke-dasharray="0.9 1.3"/>
    <circle cx="50" cy="50" r="41" fill="url(#${id}f)"/>
    <circle cx="50" cy="50" r="41" fill="url(#${id}t)"/>
    <circle cx="50" cy="50" r="37.5" fill="none" stroke="rgba(255,248,230,0.75)" stroke-width="1.1" stroke-dasharray="2.6 1.8"/>
    <circle cx="50" cy="45" r="19" fill="rgba(255,248,230,0.22)"/>
    ${stars}
    <text x="50" y="45" text-anchor="middle" dominant-baseline="central" font-size="32">${b.emoji}</text>
    <text font-family="${FONT}" font-weight="700" font-size="${label}" letter-spacing="0.6" fill="#fff8e6"
      stroke="${cat.rim}" stroke-width="1.6" paint-order="stroke">
      <textPath href="#${id}a" startOffset="50%" text-anchor="middle">${name}</textPath>
    </text>`
    : `
    <circle cx="50" cy="50" r="46" fill="rgba(20,24,8,0.22)"/>
    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,244,210,0.55)" stroke-width="1.8" stroke-dasharray="3.2 2.6"/>
    <text x="50" y="49" text-anchor="middle" dominant-baseline="central" font-size="30"
      ${hidden ? `font-family="${FONT}" font-weight="700" fill="rgba(255,244,210,0.55)"` : 'opacity="0.3" style="filter:grayscale(1)"'}>${hidden ? '?' : b.emoji}</text>`;
  return svg;
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Blend two #rrggbb colours (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
