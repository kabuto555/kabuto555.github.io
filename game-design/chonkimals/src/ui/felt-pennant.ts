// Felt pennant button — a triangular felt flag on a wooden dowel, label stitched on the wide
// end (like the camp bunting). The Customize screen's one-button switch: it names where you
// can go ("Tent" in the wardrobe, "Wardrobe" at the tent) and waves gently so it reads as
// tappable; disabled (still, faded) while the chonk walks between the two.

import { COLORS, FONT, textOutline } from './theme';
import { el, pressable } from './components';
import { applyTexture, feltTexture, type FeltParams } from './shader-textures';
import { iconImg } from './icons';

/** One warm felt for the switch (mustard, like the bunting's yellow) — no red/green "stop/go". */
export const PENNANT_FELT = {
  mustard: { feltColor: [0.84, 0.62, 0.2, 1], grainIntensity: 0.75 } as FeltParams,
};
const FALLBACK = { mustard: '#d69e33' };

const W = 290, H = 132, STICK = 16, POLE = 184;

export interface FeltPennant { root: HTMLElement; setLabel(text: string, iconSrc?: string): void; setEnabled(on: boolean): void; }

/** `point` = which way the tip faces (the dowel is on the other end). */
export function feltPennant(label: string, point: 'left' | 'right', felt: keyof typeof PENNANT_FELT,
                            onTap: () => void, iconSrc?: string): FeltPennant {
  const left = point === 'left';
  const root = el('div', `position:relative;display:flex;align-items:flex-start;flex-direction:${left ? 'row' : 'row-reverse'};` +
    `width:${W + STICK - 4}px;height:${POLE}px;pointer-events:auto;cursor:pointer;touch-action:manipulation;user-select:none;` +
    'filter:drop-shadow(0 8px 0 rgba(58,36,21,0.28));transition:opacity 180ms, transform 60ms;');

  // Flag: felt triangle (clip-path), a dashed stitch just inside the edge, the label on the wide end.
  const tri = left ? `0 50%, 100% 0, 100% 100%` : `0 0, 100% 50%, 0 100%`;
  const flag = el('div', `position:relative;width:${W}px;height:${H}px;margin-top:22px;flex-shrink:0;` +
    `transform-origin:${left ? '100%' : '0'} 50%;`);
  const cloth = el('div', `position:absolute;inset:0;clip-path:polygon(${tri});background-color:${FALLBACK[felt]};`);
  applyTexture(cloth, feltTexture(PENNANT_FELT[felt], W, H));
  const inset = 14;
  const pts = left
    ? `${inset * 2.4},${H / 2} ${W - inset},${inset} ${W - inset},${H - inset}`
    : `${inset},${inset} ${W - inset * 2.4},${H / 2} ${inset},${H - inset}`;
  const stitch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  stitch.setAttribute('viewBox', `0 0 ${W} ${H}`);
  stitch.setAttribute('width', String(W));
  stitch.setAttribute('height', String(H));
  stitch.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  stitch.innerHTML = `<polygon points="${pts}" fill="none" stroke="rgba(255,248,234,0.75)" stroke-width="4" ` +
    'stroke-dasharray="12 9" stroke-linejoin="round"/>';
  const text = el('p', `position:absolute;top:50%;${left ? 'right:30px' : 'left:30px'};transform:translateY(-50%);` +
    `font-family:${FONT};font-weight:700;font-size:36px;line-height:1;color:#fff;white-space:nowrap;pointer-events:none;` +
    `text-shadow:${textOutline(COLORS.brownDark, 2.6)};`, label);
  // Optional icon art at the wide end, the label beside it.
  const art = iconImg('', 60, `position:absolute;top:50%;margin-top:-32px;${left ? 'right:22px' : 'left:20px'};` +
    'filter:drop-shadow(0 3px 0 rgba(58,36,21,0.35));');
  flag.append(cloth, stitch, text, art);

  // Dowel with gold end knobs.
  const stick = el('div', `position:relative;width:${STICK}px;height:${POLE}px;flex-shrink:0;border-radius:${STICK / 2}px;` +
    `background:linear-gradient(90deg, ${COLORS.plaque}, ${COLORS.brown});margin-${left ? 'left' : 'right'}:-4px;`);
  for (const end of ['top', 'bottom']) {
    stick.appendChild(el('div', `position:absolute;left:50%;${end}:-10px;width:28px;height:28px;margin-left:-14px;border-radius:50%;` +
      `background:radial-gradient(circle at 35% 30%, ${COLORS.coinLight}, ${COLORS.coin} 55%, ${COLORS.coinDark});`));
  }
  root.append(flag, stick);

  let enabled = true;
  let wave: Animation | null = null;
  pressable(root, 6, () => { if (enabled) onTap(); });
  const api: FeltPennant = {
    root,
    setLabel(t, src) {
      text.textContent = t;
      root.setAttribute('aria-label', t);
      art.style.display = src ? '' : 'none';
      if (src) art.src = src;
      // Make room for the icon (and keep long labels inside the felt).
      text.style[left ? 'right' : 'left'] = src ? '88px' : '30px';
      text.style.fontSize = src ? '32px' : '36px';
    },
    setEnabled(on) {
      enabled = on;
      root.style.opacity = on ? '1' : '0.5';
      root.style.cursor = on ? 'pointer' : 'default';
      wave?.cancel();
      // Flutters on its dowel while it's tappable.
      wave = on ? flag.animate([{ transform: 'skewY(0deg) scaleX(1)' }, { transform: `skewY(${left ? -3 : 3}deg) scaleX(0.97)` }],
        { duration: 900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }) : null;
    },
  };
  api.setLabel(label, iconSrc);
  api.setEnabled(true);
  return api;
}
