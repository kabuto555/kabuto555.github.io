import type { Action } from '../core/input';
import type { UiCtx } from './ctx';
import { clear, h, kc } from './dom';

/** Rows of the controls card (label, action). Keys always come from the live bindings table. */
export const CONTROL_GROUPS: { title: string; rows: [string, Action[]][] }[] = [
  {
    title: 'MOVE',
    rows: [
      ['Forward / Back', ['moveForward', 'moveBack']],
      ['Left / Right', ['moveLeft', 'moveRight']],
      ['Sprint', ['sprint']],
      ['Jump / Mantle', ['jump']],
      ['Dodge roll', ['dodge']],
    ],
  },
  {
    title: 'COMBAT',
    rows: [
      ['Fire', ['fire']],
      ['Aim down sights', ['ads']],
      ['Reload', ['reload']],
      ['Swap gun', ['swapRight']],
      ['Knife / Block (hold)', ['leftHand']],
      ['Swap left hand', ['swapLeft']],
    ],
  },
  {
    title: 'ITEMS',
    rows: [
      ['Drink Estus', ['estus']],
      ['Throw grenade', ['throwGrenade']],
      ['Cycle grenade', ['cycleGrenade']],
      ['Use quick item', ['useQuick']],
      ['Cycle quick item', ['cycleQuick']],
      ['Interact', ['interact']],
    ],
  },
  { title: 'SYSTEM', rows: [['Menu (no pause)', ['menu']], ['This card (hold)', ['controlsCard']]] },
];

/** Build the key list into `into` (shared by the F1 overlay and the menu's Controls tab). */
export function buildControls(ctx: UiCtx, into: HTMLElement): void {
  clear(into);
  for (const g of CONTROL_GROUPS) {
    const col = h('div', 'col');
    col.append(h('h3', '', g.title));
    for (const [label, actions] of g.rows) {
      const keys = h('span');
      actions.forEach((a, i) => {
        if (i) keys.append(' ');
        keys.append(kc(ctx.key(a, 3)));
      });
      col.append(h('div', 'kv', [h('span', '', label), keys]));
    }
    into.append(col);
  }
}

/** Full-screen key overlay: hold F1 (key from BINDINGS), or auto-shown briefly on first spawn. Never captures input. */
export class ControlsCard {
  readonly el = h('div', 'card');
  private readonly body = h('div', 'cp');
  private _on = false;
  private auto = 0;

  constructor(private readonly ctx: UiCtx) {
    this.el.append(this.body);
  }

  get visible(): boolean {
    return this._on;
  }

  set(on: boolean): void {
    if (on === this._on) return;
    this._on = on;
    if (on) {
      buildControls(this.ctx, this.body);
    }
    this.el.classList.toggle('on', on);
    if (!on) this.auto = 0;
  }

  /** Show for `seconds` (first spawn). */
  flash(seconds: number): void {
    this.set(true);
    this.auto = seconds;
  }

  update(dt: number, f1Held: boolean): void {
    if (this.auto > 0) {
      this.auto -= dt;
      if (this.auto <= 0) this.set(f1Held);
    } else if (f1Held !== this._on) this.set(f1Held);
  }
}
