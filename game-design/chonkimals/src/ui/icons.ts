// UI icon art (assets/ui/icons/<group>/<name>.png — 192 px, transparent). DOM code uses
// iconImg(); canvas code (bulletin papers) uses iconImage(), which preloads and caches so a
// redraw can draw it synchronously. Toys live in assets/ui/rewards/<item id>.png (reward-art.ts).

import { el } from './components';

export type IconGroup = 'hud' | 'social' | 'game' | 'ui' | 'pass' | 'poi' | 'customize' | 'currency';

export const icon = (group: IconGroup, name: string): string => `assets/ui/icons/${group}/${name}.png`;

/** An <img> of the icon at `size` design px (object-fit: contain, not draggable, no pointer events). */
export function iconImg(src: string, size: number, css = ''): HTMLImageElement {
  const img = el('img', `width:${size}px;height:${size}px;object-fit:contain;pointer-events:none;flex-shrink:0;${css}`) as HTMLImageElement;
  img.src = src; img.alt = ''; img.draggable = false;
  return img;
}

/** Put icon art at the left of a pill button (padding made for it). */
export function withLeadIcon(btn: HTMLElement, src: string, size = 62): HTMLElement {
  btn.style.position = 'relative';
  btn.style.paddingLeft = `${size + 20}px`;
  btn.appendChild(iconImg(src, size, `position:absolute;left:12px;top:50%;margin-top:-${size / 2}px;`));
  return btn;
}

const cache = new Map<string, HTMLImageElement>();

/** Cached, preloading Image for canvas drawing — check `ready(img)` before drawImage. */
export function iconImage(src: string): HTMLImageElement {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  return img;
}
export const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

/** Map pins (Bulletin Board): POI name → icon. */
export const POI_ICONS = {
  mainGate: icon('poi', 'main_gate'), canteen: icon('poi', 'canteen'), mailBoard: icon('poi', 'mail_board'),
  troopHq: icon('poi', 'troop_hq'), photoBooth: icon('poi', 'photo_booth'), dock: icon('poi', 'dock'),
  dodgeball: icon('poi', 'dodgeball'), sumo: icon('poi', 'sumo'), logCourse: icon('poi', 'log_course'), lunch: icon('poi', 'lunch'),
  yourTent: icon('customize', 'tent_trip'),
};
// Warm the cache now so the map paper can draw them the first time it renders.
Object.values(POI_ICONS).forEach(iconImage);
