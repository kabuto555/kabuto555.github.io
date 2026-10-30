import type { EventBus } from '../../core/events';
import { buildControls } from '../controlsCard';
import type { UiCtx } from '../ctx';
import { clear, h } from '../dom';
import { Modal } from '../modal';
import type { Menu } from '../types';
import { EquipmentTab } from './equipment';
import { InventoryTab } from './inventory';
import { StatusTab } from './status';
import type { MenuTab } from './types';

const HINT_LABEL = { always: 'Always', fade: 'Fade (8 s)', off: 'Off' } as const;

/** Controls reference + key-hint visibility setting. */
class ControlsTab implements MenuTab {
  readonly title = 'Controls';
  readonly el = h('div', 'pbody');
  private readonly keys = h('div', 'cp');
  private readonly btn = h('div', 'btn');

  constructor(
    private readonly ctx: UiCtx,
    cycleHints: () => void,
  ) {
    this.keys.style.display = 'flex';
    this.keys.style.gap = '26px';
    this.btn.addEventListener('click', () => {
      cycleHints();
      this.refresh();
    });
    this.el.style.flexDirection = 'column';
    this.el.append(this.keys, h('div', 'sec', 'SETTINGS'), h('div', 'stat', [h('span', '', 'Key hints'), this.btn]));
  }

  refresh(): void {
    buildControls(this.ctx, this.keys);
    this.btn.textContent = HINT_LABEL[this.ctx.hints.mode];
  }
}

/**
 * The Tab menu (Equipment / Inventory / Status / Controls). Toggled with the `menu` binding by createUi;
 * holds the mouse while open. Does not pause the game.
 */
export class MenuImpl extends Modal implements Menu {
  private readonly tabs: MenuTab[];
  private readonly head = h('div', 'ptitle');
  private readonly body = h('div', '');
  private readonly foot = h('div', 'pfoot');
  private idx = 0;
  private dirty = false;
  private offs: (() => void)[] = [];

  constructor(ctx: UiCtx, cycleHints: () => void) {
    super(ctx, 'menu', 706);
    this.tabs = [new EquipmentTab(ctx), new InventoryTab(ctx), new StatusTab(ctx), new ControlsTab(ctx, cycleHints)];
    this.body.style.minHeight = '316px';
    this.panel.append(this.head, this.body, this.foot);
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.scrim);
    // Anything that changes what the tabs display marks the menu dirty; rebuild once per frame while open.
    for (const ev of ['equipmentChanged', 'itemAdded', 'itemRemoved', 'quickBeltChanged', 'soulsChanged', 'ammoChanged'] as const) {
      this.offs.push(bus.on(ev, () => (this.dirty = true)));
    }
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.scrim.remove();
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  setTab(i: number): void {
    this.idx = (i + this.tabs.length) % this.tabs.length;
    this.render();
  }

  stepTab(d: number): void {
    this.setTab(this.idx + d);
  }

  protected override onOpen(): void {
    this.render();
  }

  private render(): void {
    clear(this.head);
    this.tabs.forEach((t, i) => {
      const b = h('div', `tab${i === this.idx ? ' sel' : ''}`, t.title);
      b.addEventListener('click', () => this.setTab(i));
      this.head.append(b);
    });
    this.head.append(h('div', 'sp'));
    const x = h('div', 'tab', 'Close');
    x.addEventListener('click', () => this.hide());
    this.head.append(x);
    clear(this.body);
    const tab = this.tabs[this.idx]!;
    this.body.append(tab.el);
    tab.refresh();
    clear(this.foot);
    this.foot.append(
      h('span', '', [h('span', 'kc', this.ctx.key('menu')), ' close']),
      h('span', 'dim', 'The world does not pause.'),
    );
    this.dirty = false;
  }

  update(): void {
    if (this.open && this.dirty) {
      this.dirty = false;
      this.tabs[this.idx]!.refresh();
    }
  }
}
