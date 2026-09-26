// Settings (Figma 42:4680) + Leaderboard (42:4887) building blocks: content panel,
// section card, slider, option row, account info, rank rows and the chunky scrollbar.
// Design px, 1:1 with Figma. The option row is new (Figma has no toggle) and reuses
// the system tab bar at a smaller scale, so it reads as part of the same family.

import { COLORS, FONT, UI_ASSETS } from './theme';
import { el } from './components';
import { tabBar } from './store-components';

export const MENU = {
  sectionFill: 'rgba(220,197,168,0.3)',
  sectionInk: '#432a18',
  valueInk: '#333',
  danger: '#ff5858',
  trackBorder: '#5e3a22',
  fill: '#885f44',
} as const;

// ── Panels ──────────────────────────────────────────────────────────────────

/** Cream content panel (Figma "Content Panel" / settings-screen 42:4689), 982.94 wide. */
export function contentPanel(css = ''): HTMLElement {
  return el('div',
    `background:${COLORS.cream};border:9.101px solid ${COLORS.brown};box-shadow:0 19.273px 0 ${COLORS.brownDark};` +
    'display:flex;flex-direction:column;align-items:center;padding:45.506px;border-radius:68.259px;width:982.935px;' + css);
}

/** Tinted section card with an uppercase heading (Figma "Section Card" 49:276), 891.92 wide. */
export function sectionCard(title: string, round = false): { root: HTMLElement; body: HTMLElement } {
  const root = el('div',
    `background:${MENU.sectionFill};display:flex;flex-direction:column;gap:16px;align-items:flex-start;padding:27.304px;` +
    `border-radius:${round ? 45.506 : 27.304}px;width:891.923px;flex-shrink:0;`);
  root.appendChild(el('p', `font-family:${FONT};font-weight:600;font-size:22.753px;line-height:normal;color:${MENU.sectionInk};` +
    'white-space:nowrap;', title));
  return { root, body: root };
}

// ── Slider ──────────────────────────────────────────────────────────────────

export interface Slider { root: HTMLElement; setValue(v: number): void; }

/**
 * Labelled 0..1 slider (Figma "Slider" 49:239): white track, brown fill, clay knob.
 * Drag anywhere on the track; `format` renders the right-hand value (default %).
 */
export function slider(label: string, value: number, onChange: (v: number) => void,
                       format: (v: number) => string = (v) => `${Math.round(v * 100)}%`): Slider {
  const root = el('div', 'display:flex;flex-direction:column;gap:6.826px;align-items:flex-start;width:100%;flex-shrink:0;');
  const labels = el('div', `display:flex;align-items:flex-start;justify-content:space-between;width:100%;` +
    `font-family:${FONT};font-weight:600;font-size:18.203px;line-height:normal;white-space:nowrap;`);
  const readout = el('p', `color:${MENU.valueInk};`);
  labels.append(el('p', `color:${MENU.sectionInk};`, label), readout);
  const B = 3.413;
  // Extra vertical hit area around the 27px track so it's thumb-friendly.
  const hit = el('div', 'position:relative;width:100%;padding:14px 0;margin:-14px 0;touch-action:none;cursor:pointer;');
  const track = el('div', `position:relative;background:#fff;border:${B}px solid ${MENU.trackBorder};height:27.304px;` +
    'border-radius:13.652px;width:100%;');
  const fill = el('div', `position:absolute;left:0;top:${-B}px;height:27.304px;background:${MENU.fill};border-radius:18.203px;`);
  const knob = el('img', 'position:absolute;top:-10.24px;width:45.506px;height:49.007px;max-width:none;pointer-events:none;');
  knob.src = UI_ASSETS.sliderKnob; knob.alt = ''; knob.draggable = false;
  track.append(fill, knob);
  hit.appendChild(track);
  root.append(labels, hit);

  let v = value;
  const setValue = (nv: number) => {
    v = Math.max(0, Math.min(1, nv));
    const w = (837.315 - 2 * B) * v; // design px: inner track width inside a section card
    fill.style.width = `${w}px`;
    knob.style.left = `${w - 23.89}px`; // Figma: knob sits 23.89 back from the fill end
    readout.textContent = format(v);
  };
  const fromEvent = (e: PointerEvent) => {
    const r = track.getBoundingClientRect(); // screen px — handles the frame's scale transform
    setValue((e.clientX - r.left) / r.width);
    onChange(v);
  };
  hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); hit.setPointerCapture(e.pointerId); fromEvent(e); });
  hit.addEventListener('pointermove', (e) => { if (hit.hasPointerCapture(e.pointerId)) fromEvent(e); });
  setValue(v);
  return { root, setValue };
}

// ── Option row (new — built from the system tab bar) ────────────────────────

/** Label on the left, a compact segmented control on the right (e.g. Off / On, Low / High). */
export function optionRow(label: string, options: string[], active: number, onChange: (i: number) => void):
    { root: HTMLElement; setActive(i: number): void } {
  const root = el('div', 'display:flex;align-items:center;justify-content:space-between;width:100%;flex-shrink:0;min-height:52px;');
  root.appendChild(el('p', `font-family:${FONT};font-weight:600;font-size:18.203px;line-height:normal;color:${MENU.sectionInk};` +
    'white-space:nowrap;', label));
  const seg = tabBar(options, active, onChange, { width: 120 * options.length + 20, scale: 0.68 });
  root.appendChild(seg.root);
  return { root, setActive: seg.setActive };
}

/** "Logged in as: <name>" line. */
export function accountLine(name: string, prefix = 'Logged in as:'): HTMLElement {
  const row = el('div', `display:flex;gap:4.551px;align-items:center;width:100%;font-family:${FONT};font-size:20px;` +
    'line-height:normal;white-space:nowrap;');
  row.append(el('p', `font-weight:500;color:${MENU.valueInk};`, prefix),
    el('p', `font-weight:600;color:${MENU.trackBorder};`, name));
  return row;
}

/** Red text action ("Delete Account"). */
export function dangerLink(text: string, onTap: () => void): HTMLElement {
  const wrap = el('div', 'display:flex;height:44.369px;align-items:flex-start;justify-content:center;padding-top:4.551px;width:100%;');
  const t = el('p', `font-family:${FONT};font-weight:600;font-size:27.304px;line-height:normal;color:${MENU.danger};` +
    'white-space:nowrap;cursor:pointer;touch-action:manipulation;', text);
  t.addEventListener('pointerup', (e) => { e.stopPropagation(); onTap(); });
  wrap.appendChild(t);
  return wrap;
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

interface RankTone { bg: string; border: string; shadow: string; chipBg: string; chipBorder: string; chipInk: string;
  radius: number; tall: boolean; gap: number }

/** Gold / silver-blue / bronze podium rows, then plain rows (Figma "Leaderboard / Nth Place").
 * All rows share the 39.7 radius + 35.29 gap (the mock's 18 radius / 17.6 gap on 2nd–3rd were inconsistencies). */
const RANK_TONES: Record<'1' | '2' | '3' | 'rest', RankTone> = {
  '1': { bg: '#fef1c7', border: '#ffd23f', shadow: '#d89e00', chipBg: '#ffd23f', chipBorder: '#d89e00', chipInk: '#674833',
    radius: 39.702, tall: true, gap: 35.29 },
  '2': { bg: '#ebf8ff', border: '#d5e9fc', shadow: '#b8d9f7', chipBg: '#fff', chipBorder: '#bbd7f1', chipInk: '#7fc3ed',
    radius: 39.702, tall: true, gap: 35.29 },
  '3': { bg: '#feeedb', border: '#fbd5ae', shadow: '#f6be7b', chipBg: '#fbd8ae', chipBorder: '#e88f25', chipInk: '#e88f25',
    radius: 39.702, tall: true, gap: 35.29 },
  rest: { bg: '#fff', border: '#dce5ec', shadow: '#bccad2', chipBg: '#f0f4f8', chipBorder: '#9ab0b9', chipInk: '#9ab0b9',
    radius: 39.702, tall: false, gap: 35.29 },
};

export const formatPoints = (n: number): string => `${n.toLocaleString('en-US')} pts`;

/** One leaderboard row (840.35 wide): rank chip, name, score. */
export function rankRow(rank: number, name: string, score: number): HTMLElement {
  const t = RANK_TONES[(rank <= 3 ? String(rank) : 'rest') as keyof typeof RANK_TONES];
  const row = el('div',
    `background:${t.bg};border:6.617px solid ${t.border};box-shadow:0 6.617px 0 ${t.shadow};display:flex;align-items:center;` +
    `justify-content:space-between;padding:${t.tall ? '41.667px' : '10.417px 41.667px'};border-radius:${t.radius}px;` +
    'width:840.347px;flex-shrink:0;');
  const left = el('div', `display:flex;gap:${t.gap}px;align-items:center;min-width:0;`);
  const chip = el('div', `background:${t.chipBg};border:9.73px solid ${t.chipBorder};display:flex;align-items:center;` +
    'justify-content:center;border-radius:18px;width:79.403px;height:79.403px;flex-shrink:0;');
  const text = `font-family:${FONT};font-weight:600;font-size:35.29px;line-height:normal;white-space:nowrap;`;
  chip.appendChild(el('p', text + `color:${t.chipInk};`, String(rank)));
  left.append(chip, el('p', text + `color:${COLORS.ink};overflow:hidden;text-overflow:ellipsis;`, name));
  row.append(left, el('p', text + `color:${COLORS.ink};`, formatPoints(score)));
  return row;
}

/**
 * Chunky vertical scrollbar (Figma "scroll" 42:4907): white rounded track, brown thumb.
 * Mirrors a scroll container; also draggable.
 */
export function chunkyScrollbar(target: HTMLElement, height: number): HTMLElement {
  const track = el('div',
    `position:relative;width:25px;height:${height}px;border:2.083px solid #dce5ec;border-radius:12.5px;background:#fff;` +
    'box-shadow:inset 2.083px 0 0 0 #bccad2;flex-shrink:0;touch-action:none;');
  const thumb = el('div',
    `position:absolute;left:4.167px;right:4.167px;background:${COLORS.brown};border:1.563px solid ${COLORS.blueLight};` +
    'border-radius:8.333px;');
  track.appendChild(thumb);
  const inner = height - 2 * 2.083 - 2 * 4.167;
  const sync = () => {
    const ratio = target.clientHeight / Math.max(1, target.scrollHeight);
    const len = Math.max(60, inner * Math.min(1, ratio));
    const max = Math.max(1, target.scrollHeight - target.clientHeight);
    thumb.style.height = `${len}px`;
    thumb.style.top = `${4.167 + (inner - len) * (target.scrollTop / max)}px`;
    track.style.visibility = ratio >= 1 ? 'hidden' : 'visible';
  };
  target.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(target);
  const drag = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    target.scrollTop = f * (target.scrollHeight - target.clientHeight);
  };
  track.addEventListener('pointerdown', (e) => { e.stopPropagation(); track.setPointerCapture(e.pointerId); drag(e); });
  track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) drag(e); });
  requestAnimationFrame(sync);
  return track;
}
