// FTUE "New Camper!" screen — pick a name and a chonk. Built from the kit's
// Character Select parts (critter header, item cards, SELECT pills) plus a new
// name field. Unlike the menus it has no camp photo backdrop: it sits over the
// live 3D camp (the greeting crowd keeps bouncing behind the scrim).

import { COLORS, FONT } from './theme';
import { critterHeader, el, primaryButton, PLAQUE_SCREEN, pressable } from './components';
import { StoreScreen, scroller } from './store-screens';
import { contentPanel, MENU, sectionCard } from './menu-components';
import { currentPill, itemCard, tinyButton } from './store-components';
import type { CharacterEntry } from './store-presets';
import { icon, iconImg } from './icons';

export const NAME_MAX = 16;

/** Silly placeholder names for the dice button. */
export const RANDOM_NAMES: readonly string[] = [
  'SnackGoblin', 'ChonkyMcChonk', 'Beans_4_Brains', 'LilPudding', 'SirWobbles', 'Mochi_Mayhem',
  'TinyTank', 'Dumpling_Deluxe', 'NoodleLegs', 'CaptainCrumbs', 'Puddle_Jumper', 'BigBiscuit',
  'Marshmallow_Menace', 'WaddleWizard', 'SquishLord', 'Toastie',
];

export interface TextField {
  root: HTMLElement;
  input: HTMLInputElement;
  value(): string;
  setValue(v: string): void;
}

/** Name entry field (new kit part): white well, brown rim — the slider track's look, sized for thumbs. */
export function textField(value: string, opts: { placeholder?: string; maxLength?: number; onInput?: (v: string) => void } = {}): TextField {
  const root = el('div',
    `flex:1 1 0;min-width:0;height:110px;background:#fff;border:5.4px solid ${MENU.trackBorder};border-radius:27.3px;` +
    'box-shadow:inset 0 7px 0 rgba(67,42,24,0.12);display:flex;align-items:center;padding:0 34px;');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.maxLength = opts.maxLength ?? NAME_MAX;
  input.placeholder = opts.placeholder ?? '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('enterkeyhint', 'done');
  // 48 design px ≈ 17 CSS px on a phone: stays above iOS's 16px focus-zoom threshold.
  input.style.cssText =
    `width:100%;border:0;outline:0;background:transparent;font-family:${FONT};font-weight:600;font-size:48px;` +
    `color:${MENU.sectionInk};caret-color:${COLORS.brown};padding:0;`;
  input.addEventListener('input', () => opts.onInput?.(input.value));
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  root.appendChild(input);
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); input.focus(); });
  return { root, input, value: () => input.value, setValue: (v) => { input.value = v; opts.onInput?.(v); } };
}

/** Square brown icon button (Shop BUY tone at field height) — the dice. `glyph` = icon art path or a character. */
export function iconSquare(glyph: string, onTap: () => void, size = 110): HTMLElement {
  const root = el('div',
    `width:${size}px;height:${size}px;flex-shrink:0;background:${COLORS.ready};border:5.4px solid ${COLORS.readyBorder};` +
    `box-shadow:0 8px 0 ${COLORS.readyShadow};border-radius:27.3px;display:flex;align-items:center;justify-content:center;` +
    'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;');
  if (glyph.startsWith('assets/')) root.appendChild(iconImg(glyph, size * 0.78));
  else root.appendChild(el('p', `font-size:${size * 0.5}px;line-height:1;pointer-events:none;`, glyph));
  pressable(root, 8, onTap);
  return root;
}

export interface NewCamperOptions {
  name: string;
  characters: CharacterEntry[];
  selectedId: string;
  /** Chonks that have a 3D model; the rest show as "coming soon". */
  playable: (id: string) => boolean;
  title?: string;
  cta?: string;
  onDone: (name: string, characterId: string) => void;
}

export class NewCamperScreen extends StoreScreen {
  private grid: HTMLElement;
  private selected: string;
  private field: TextField;
  private go: ReturnType<typeof primaryButton>;

  constructor(host: HTMLElement, private opts: NewCamperOptions) {
    super(host);
    this.selected = opts.selectedId;
    const f = this.frame;
    f.appendChild(el('div', `position:absolute;inset:0;background:${COLORS.scrim};`));

    const header = critterHeader(opts.title ?? 'New Camper!', { style: PLAQUE_SCREEN });
    header.root.style.cssText += 'position:absolute;left:130px;';

    // Name panel: the settings content panel + section card, holding the field and the dice.
    const panel = contentPanel('position:absolute;left:48.5px;padding:34px 45.506px;');
    const sec = sectionCard('WHAT SHOULD WE CALL YOU?', true);
    const row = el('div', 'display:flex;gap:22px;align-items:center;width:100%;');
    this.field = textField(opts.name, { placeholder: 'Your name', onInput: () => this.validate() });
    row.append(this.field.root, iconSquare(icon('ui', 'dice'), () => {
      const pool = RANDOM_NAMES.filter((n) => n !== this.field.value());
      this.field.setValue(pool[Math.floor(Math.random() * pool.length)]);
    }));
    sec.body.appendChild(row);
    panel.appendChild(sec.root);

    // Chonk grid (Character Select layout, 3 columns, scrolls).
    const pickLabel = el('p', `position:absolute;left:0;right:0;font-family:${FONT};font-weight:700;font-size:44px;` +
      `line-height:normal;text-align:center;color:${COLORS.cream};text-shadow:0 4px 0 ${COLORS.brownDark};`, 'Pick your Chonk!');
    const list = scroller('position:absolute;left:29px;width:1022px;padding:4px 20px 40px;');
    this.grid = el('div', 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:20px;row-gap:40px;width:100%;');
    list.appendChild(this.grid);

    const goWrap = el('div', 'position:absolute;left:0;right:0;display:flex;justify-content:center;');
    this.go = primaryButton(opts.cta ?? "Let's Go!", () => this.submit());
    goWrap.appendChild(this.go.slot);

    f.append(header.root, panel, pickLabel, list, goWrap);
    this.render();
    this.validate();
    this.mount((h) => {
      // The frame already sits inside the safe area (StoreScreen.mount → fillScreen safeArea).
      const top = 30;
      header.root.style.top = `${top}px`;
      const panelTop = top + 459.49 + 18;
      panel.style.top = `${panelTop}px`;
      const labelTop = panelTop + panel.offsetHeight + 34;
      pickLabel.style.top = `${labelTop}px`;
      const goTop = h - 190.556 - 40;
      goWrap.style.top = `${goTop}px`;
      list.style.top = `${labelTop + 70}px`;
      list.style.height = `${Math.max(200, goTop - 20 - (labelTop + 70))}px`;
    });
  }

  private render(): void {
    const ordered = [...this.opts.characters].sort((a, b) => Number(this.opts.playable(b.id)) - Number(this.opts.playable(a.id)));
    this.grid.replaceChildren(...ordered.map((c) => {
      const playable = this.opts.playable(c.id);
      const footer = el('div', 'display:flex;align-items:center;justify-content:space-between;width:240px;flex-shrink:0;');
      if (!playable) {
        const soon = tinyButton('COMING SOON', 'dark', () => {}, true);
        soon.dataset.disabled = '1';
        soon.style.cursor = 'default';
        footer.appendChild(soon);
      } else {
        footer.appendChild(c.id === this.selected ? currentPill('Picked!') : tinyButton('SELECT', 'dark', () => this.select(c.id), true));
      }
      const card = itemCard({ variant: 'select', name: c.name, art: c.art, footer });
      if (!playable) { card.style.opacity = '0.5'; card.style.filter = 'saturate(0.35)'; }
      else if (c.id !== this.selected) pressable(card, 0, () => this.select(c.id));
      return card;
    }));
  }

  private select(id: string): void {
    this.selected = id;
    this.render();
  }

  private cleanName(): string {
    return this.field.value().replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }

  private validate(): void {
    this.go.setDisabled(this.cleanName().length === 0);
  }

  private submit(): void {
    const name = this.cleanName();
    if (!name) return;
    this.field.input.blur();
    this.close();
    this.opts.onDone(name, this.selected);
  }
}

export function showNewCamper(host: HTMLElement, opts: NewCamperOptions): NewCamperScreen {
  return new NewCamperScreen(host, opts);
}
