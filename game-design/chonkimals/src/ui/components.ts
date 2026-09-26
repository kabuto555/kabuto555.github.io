// Reusable UI primitives for the Chonkimals UI kit. Every value here is lifted
// 1:1 from the Figma modal (node 123:147) in DESIGN pixels; compose them inside
// a design-sized box and scale the box with fitToScreen().

import { COLORS, FONT, UI_ASSETS } from './theme';
import { getUiInsets } from '../safe-layout';
import { MODAL_CLAY, PLAQUE_FELT, applyTexture, clayTexture, feltTexture, type ClayParams } from './shader-textures';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The drag-to-scroll gesture under way (the first box to claim a drag keeps it — nested scrollers). */
let activeDrag: HTMLElement | null = null;

/**
 * Mouse / pen drag-to-scroll (+ a little fling) for an overflow box. Touch already scrolls
 * natively (the box's touch-action), so touches are left alone. Taps still work: a press only
 * becomes a drag once it moves a few px along `axis`, and then the button under it is cancelled
 * and its pointerup / click are swallowed. Handlers run in the capture phase, so buttons that
 * stop propagation (pressable) don't block it.
 */
export function dragToScroll(box: HTMLElement, axis: 'x' | 'y' = 'y'): void {
  const SLOP = 6; // screen px before a press becomes a drag
  box.dataset.dragScroll = axis;
  const along = (e: PointerEvent) => (axis === 'y' ? e.clientY : e.clientX);
  const across = (e: PointerEvent) => (axis === 'y' ? e.clientX : e.clientY);
  const get = () => (axis === 'y' ? box.scrollTop : box.scrollLeft);
  const set = (v: number) => { if (axis === 'y') box.scrollTop = v; else box.scrollLeft = v; };
  const scrollable = (b: HTMLElement) => (axis === 'y' ? b.scrollHeight > b.clientHeight : b.scrollWidth > b.clientWidth);
  let id = -1, start = 0, startX = 0, from = 0, k = 1, dragging = false, target: EventTarget | null = null;
  let vel = 0, lastPos = 0, lastT = 0, fling = 0;

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const d = along(e) - start;
    if (!dragging) {
      if (Math.abs(d) < SLOP || Math.abs(d) < Math.abs(across(e) - startX) || (activeDrag && activeDrag !== box)) return;
      dragging = true;
      activeDrag = box;
      // Let go of the button under the pointer (pressable resets on pointercancel).
      target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: e.pointerType }));
    }
    set(from - d * k);
    const now = performance.now(), dt = now - lastT;
    if (dt > 0) vel = vel * 0.6 + ((along(e) - lastPos) * k / dt) * 0.4; // box px / ms
    lastPos = along(e); lastT = now;
    e.preventDefault();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id || !e.isTrusted) return; // not our own synthetic pointercancel
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    id = -1;
    if (!dragging) return;
    dragging = false;
    if (activeDrag === box) activeDrag = null;
    e.stopPropagation(); // the button under the pointer never sees the release…
    const swallow = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true }); // …or the click
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (performance.now() - lastT > 80) return; // held still before letting go: no fling
    let t = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - t); t = now;
      vel *= Math.exp(-dt / 180);
      const before = get();
      set(before - vel * dt);
      if (Math.abs(vel) > 0.02 && get() !== before) fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  };

  box.addEventListener('wheel', () => cancelAnimationFrame(fling), { passive: true });
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || id !== -1) return;
    cancelAnimationFrame(fling);
    // A scrollable box on the same axis nearer the pointer handles it instead.
    const inner = (e.target as Element).closest?.(`[data-drag-scroll="${axis}"]`) as HTMLElement | null;
    if ((inner && inner !== box && box.contains(inner) && scrollable(inner)) || !scrollable(box)) return;
    id = e.pointerId; target = e.target;
    start = lastPos = along(e); startX = across(e); from = get(); vel = 0; lastT = performance.now();
    // Screen px → the box's own px (screens are scaled to fit).
    const r = box.getBoundingClientRect(), own = axis === 'y' ? box.offsetHeight : box.offsetWidth;
    const scr = axis === 'y' ? r.height : r.width;
    k = own && scr ? own / scr : 1;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }, true);
}

/** Press feedback: sink by the button's hard shadow while held (touch-first). */
export function pressable(btn: HTMLElement, sinkPx: number, onTap: () => void): void {
  let down = false;
  const up = () => { down = false; btn.style.transform = ''; };
  btn.addEventListener('pointerdown', (e) => {
    if (btn.dataset.disabled === '1') return;
    e.stopPropagation();
    down = true;
    btn.style.transform = `translateY(${sinkPx * 0.6}px)`;
  });
  btn.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    const was = down; up();
    if (was && btn.dataset.disabled !== '1') onTap();
  });
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);
}

export interface UIButton {
  root: HTMLElement;
  label: HTMLElement;
  setLabel(text: string): void;
  setDisabled(disabled: boolean): void;
}

function makeButton(root: HTMLElement, label: HTMLElement, sink: number, onTap: () => void): UIButton {
  root.appendChild(label);
  pressable(root, sink, onTap);
  return {
    root, label,
    setLabel(t) { label.textContent = t; },
    setDisabled(d) {
      root.dataset.disabled = d ? '1' : '0';
      root.style.opacity = d ? '0.3' : '1';
      root.style.cursor = d ? 'default' : 'pointer';
    },
  };
}

/** Back/Next style pill. `light` = cream (Figma Back), `dark` = brown (Figma Next). */
export function navButton(text: string, variant: 'light' | 'dark', onTap: () => void): UIButton {
  const light = variant === 'light';
  const root = el('div',
    `background:${light ? COLORS.cream : COLORS.brown};` +
    `border:6.173px solid ${light ? COLORS.brown : COLORS.brownDark};` +
    `box-shadow:0 9.26px 0 ${light ? COLORS.brownDark : COLORS.brown};` +
    'display:flex;align-items:flex-start;padding:23.148px 92.593px;border-radius:37.04px;' +
    'flex-shrink:0;cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;');
  const label = el('p',
    `font-family:${FONT};font-weight:600;font-size:37.04px;line-height:normal;white-space:nowrap;` +
    `color:${light ? COLORS.brownDark : COLORS.cream};pointer-events:none;`, text);
  return makeButton(root, label, 9.26, onTap);
}

/** The big "Ready!" call-to-action (500 × 190.556 slot, 151.77 tall pill). */
export function primaryButton(text: string, onTap: () => void): UIButton & { slot: HTMLElement } {
  const slot = el('div', 'display:flex;flex-direction:column;align-items:center;width:500px;height:190.556px;flex-shrink:0;');
  const root = el('div',
    `background:${COLORS.ready};border:9.486px solid ${COLORS.readyBorder};` +
    `box-shadow:0 13.491px 0 0 ${COLORS.readyShadow},0 15.177px 15.177px 0 ${COLORS.readyGlow};` +
    'display:flex;align-items:center;justify-content:center;height:151.771px;width:100%;' +
    'padding:37.943px 106.239px;border-radius:67.454px;flex-shrink:0;cursor:pointer;' +
    'user-select:none;touch-action:manipulation;transition:transform 60ms;');
  const label = el('p',
    `font-family:${FONT};font-weight:700;font-size:64.503px;line-height:normal;text-align:center;` +
    `white-space:nowrap;color:${COLORS.cream};pointer-events:none;`, text);
  slot.appendChild(root);
  return { ...makeButton(root, label, 13.491, onTap), slot };
}

/** Pager dots — Figma "Frame 1895": r 10.03, stroke 3.086, 27.78 spacing, centred in 110 × 24. */
export function pagerDots(count: number, index: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const w = Math.max(110, count * 27.7778 + 26);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', `0 0 ${w} 24`);
  svg.style.cssText = 'display:block;overflow:visible;';
  const x0 = w / 2 - ((count - 1) * 27.7778) / 2;
  for (let i = 0; i < count; i++) {
    const c = document.createElementNS(NS, 'circle');
    const on = i === index;
    c.setAttribute('cx', String(x0 + i * 27.7778));
    c.setAttribute('cy', '12');
    c.setAttribute('r', '10.0309');
    c.setAttribute('fill', on ? 'white' : COLORS.dotStroke);
    c.setAttribute('stroke', on ? COLORS.dotStroke : COLORS.dotStrokeDark);
    c.setAttribute('stroke-width', '3.08642');
    svg.appendChild(c);
  }
  return svg;
}

/** Plaque geometry at scale 1. The two Figma variants differ by a pixel or two and the base colour. */
export interface PlaqueStyle {
  height: number;
  base: string;
  border: number;
  radius: number;
  titleSize: number;
  titleShadow: [number, number];
  /** Title centre offset from plaque centre (Figma optical nudge). */
  titleNudge: number;
}

/** Modal / Dodge Ball header (123:143). */
export const PLAQUE_MODAL: PlaqueStyle = {
  height: 159.722, base: COLORS.plaque, border: 11.574, radius: 26.62,
  titleSize: 84, titleShadow: [4.63, 2.315], titleNudge: -2.43,
};
/** Full-screen header — Character Select (42:4818); the Shop uses it at scale 0.72. */
export const PLAQUE_SCREEN: PlaqueStyle = {
  height: 158.265, base: COLORS.plaqueScreen, border: 11.468, radius: 26.378,
  titleSize: 84, titleShadow: [4.587, 2.294], titleNudge: -1.6,
};

/**
 * Felt header plaque (820 wide × style.height, times `scale`) with its title.
 * `titleSize` overrides the scaled title size (the Shop keeps a big 80.48 title on a 0.72 plaque).
 */
export function headerPlaque(title: string, style: PlaqueStyle = PLAQUE_MODAL, scale = 1,
                             titleSize?: number): { root: HTMLElement; title: HTMLElement } {
  const s = (n: number) => n * scale;
  const w = s(820), h = s(style.height), inner = s(4);
  const root = el('div', `position:absolute;width:${w}px;height:${h}px;`);
  const base = el('div',
    `position:absolute;inset:0;background:${style.base};border:${s(style.border)}px solid ${COLORS.brown};` +
    `border-radius:${s(style.radius)}px;`);
  const felt = el('div',
    `position:absolute;inset:0;border:${inner}px solid ${COLORS.brownInk};border-radius:${s(26.378)}px;` +
    `background-color:${COLORS.plaqueFelt};background-clip:padding-box;background-origin:padding-box;overflow:hidden;`);
  const inset = el('div',
    'position:absolute;inset:0;border-radius:inherit;' +
    `box-shadow:inset ${s(-4.587)}px 0 ${s(13.762)}px ${s(4.587)}px rgba(0,0,0,0.15),` +
    `inset ${s(4.587)}px ${s(-4.587)}px ${s(14.909)}px ${s(11.468)}px rgba(0,0,0,0.15);`);
  felt.appendChild(inset);
  applyTexture(felt, feltTexture(PLAQUE_FELT, w - inner * 2, h - inner * 2)); // grain is per-pixel: bake at real size
  const [sh1, sh2] = style.titleShadow;
  const t = el('p',
    `position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);margin-top:${s(style.titleNudge)}px;` +
    `font-family:${FONT};font-weight:700;font-size:${titleSize ?? s(style.titleSize)}px;line-height:normal;text-align:center;` +
    `color:${COLORS.creamDim};text-shadow:0 ${s(sh1)}px 0 ${COLORS.brownInk},0 ${s(sh2)}px 0 ${COLORS.brownDark};` +
    'white-space:nowrap;pointer-events:none;', title);
  root.append(base, felt, t);
  return { root, title: t };
}

export interface CritterHeaderOptions {
  /** Critter art above the plaque; `null` = plaque only. Defaults to the group shot. */
  image?: string | null;
  style?: PlaqueStyle;
  /** Shop variant: 622 × 391 box, 0.72 plaque, image cropped at the top (Figma 42:4965). */
  compact?: boolean;
}

/**
 * The title block used on every screen: critter group art sitting on a felt plaque, title on top.
 * Normal: 820 × 459.49 (plaque top 299.77). Compact: 622 × 391.
 */
export function critterHeader(title: string, opts: CritterHeaderOptions = {}): { root: HTMLElement; title: HTMLElement } {
  const image = opts.image === undefined ? UI_ASSETS.headerCritters : opts.image;
  const compact = !!opts.compact;
  const root = el('div', compact
    ? 'position:relative;width:622px;height:391px;overflow:hidden;flex-shrink:0;'
    : 'position:relative;width:820px;height:459.491px;flex-shrink:0;');
  const plaque = compact
    ? headerPlaque(title, opts.style ?? PLAQUE_SCREEN, 0.72, 80.48)
    : headerPlaque(title, opts.style ?? PLAQUE_MODAL);
  plaque.root.style.left = compact ? '15.59px' : '0';
  plaque.root.style.top = compact ? '265.94px' : '299.77px';
  root.appendChild(plaque.root);
  if (image) {
    const img = el('img', compact
      ? 'position:absolute;left:0.19px;top:-31.75px;width:623.87px;height:350.92px;max-width:none;pointer-events:none;'
      : 'position:absolute;left:calc(50% - 0.2px);top:0;transform:translateX(-50%);width:621.592px;height:350.936px;' +
        'object-fit:cover;pointer-events:none;');
    img.src = image; img.alt = ''; img.draggable = false;
    root.appendChild(img);
    // Figma layer order: plaque → art → title, so lift the title above the art.
    const box = plaque.root;
    plaque.root.removeChild(plaque.title);
    plaque.title.style.left = box.style.left;
    plaque.title.style.right = 'auto';
    plaque.title.style.width = box.style.width;
    plaque.title.style.top = `calc(${box.style.top} + ${box.style.height} / 2)`;
    root.appendChild(plaque.title);
  }
  return { root, title: plaque.title };
}

/** Clay-textured card surface. Call `bake()` after it's in the DOM (it needs its layout size). */
export function clayCard(css: string, params: ClayParams = MODAL_CLAY): { root: HTMLElement; bake(): void } {
  const border = 9.259;
  const root = el('div',
    `background-color:${COLORS.cream};background-clip:padding-box;background-origin:padding-box;` +
    `border:${border}px solid ${COLORS.brown};border-radius:80px;box-shadow:0 19.607px 0 ${COLORS.brownDark};` + css);
  return {
    root,
    bake() {
      const w = root.offsetWidth - border * 2, h = root.offsetHeight - border * 2;
      if (w > 0 && h > 0) applyTexture(root, clayTexture(params, w, h));
    },
  };
}

/**
 * Scale a design-sized box to fit the screen. Width follows the Figma frame
 * ratio (box width / 1080 of the viewport), capped by height so tall content
 * never spills past the safe area.
 */
export function fitToScreen(box: HTMLElement, designW: number, designH: number, host: HTMLElement,
                            frameW = 1080, margin = 12): () => void {
  const apply = () => {
    const vw = host.clientWidth, vh = host.clientHeight;
    // Fit + centre inside the safe area (clear of the notch / home indicator).
    const ins = getUiInsets(host);
    const byW = (vw * (designW / frameW)) / designW;
    const byH = (vh - ins.top - ins.bottom - margin * 2) / designH;
    const s = Math.min(byW, byH);
    box.style.transform = `translate(-50%, calc(-50% + ${(ins.top - ins.bottom) / 2}px)) scale(${s})`;
  };
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}

/**
 * Full-screen variant of fitToScreen: the box is DESIGN_FRAME_WIDTH (1080) wide and as tall as
 * the screen allows at that scale, so full-bleed screens fill any phone aspect. `onLayout`
 * gets the design-px height after every resize so screens can place height-relative parts.
 */
export function fillScreen(box: HTMLElement, host: HTMLElement, onLayout?: (designH: number) => void,
                           designW = 1080, opts: { safeArea?: boolean } = {}): () => void {
  box.style.position = 'absolute';
  box.style.left = '0';
  box.style.top = '0';
  box.style.transformOrigin = '0 0';
  box.style.width = `${designW}px`;
  const apply = () => {
    const s = host.clientWidth / designW;
    // `safeArea`: the box starts below the notch / status bar and stops above the home indicator.
    const ins = opts.safeArea ? getUiInsets(host) : { top: 0, bottom: 0 };
    const h = (host.clientHeight - ins.top - ins.bottom) / s;
    box.style.top = `${ins.top}px`;
    box.style.height = `${h}px`;
    box.style.transform = `scale(${s})`;
    onLayout?.(h);
  };
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
