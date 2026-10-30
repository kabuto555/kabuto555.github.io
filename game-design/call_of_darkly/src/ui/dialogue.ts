import type { EventBus } from '../core/events';
import { h } from './dom';
import './events';
import { prettyId } from './logic';
import type { UiComponent } from './types';

/** Display names for NPC ids; anything else is prettified from the id. */
export const NPC_NAMES: Record<string, string> = {
  petrus: 'Petrus of Thorolund',
  petrus_firelink: 'Petrus of Thorolund',
  crestfallen_warrior: 'Crestfallen Warrior',
  burg_merchant: 'Burg Merchant',
};

/** Typewriter speed (chars / s) and lifetime: base + per-char. */
const CPS = 55;
const BASE_LIFE = 2.6;
const PER_CHAR = 0.035;

/** Dialogue box (bottom-center) fed by `npcTalk`. Auto-dismisses; does NOT capture input. */
export class Dialogue implements UiComponent {
  readonly el = h('div', 'dlg');
  private readonly who = h('div', 'who');
  private readonly line = h('div', 'line');
  private full = '';
  private shown = 0;
  private life = 0;
  private offs: (() => void)[] = [];

  constructor() {
    this.el.append(this.who, this.line);
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.el);
    this.offs.push(bus.on('npcTalk', (e) => this.say(e.name ?? NPC_NAMES[e.npcId] ?? prettyId(e.npcId), e.line)));
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.el.remove();
  }

  get visible(): boolean {
    return this.life > 0;
  }

  say(name: string, line: string): void {
    this.who.textContent = name.toUpperCase();
    this.full = line;
    this.shown = 0;
    this.line.textContent = '';
    this.life = BASE_LIFE + line.length * PER_CHAR;
    this.el.style.display = 'block';
  }

  dismiss(): void {
    this.life = 0;
    this.el.style.display = 'none';
  }

  update(dt: number): void {
    if (this.life <= 0) return;
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * CPS);
      const now = Math.floor(this.shown);
      if (now !== before) this.line.textContent = this.full.slice(0, now);
    }
    this.life -= dt;
    if (this.life <= 0) this.dismiss();
  }
}
