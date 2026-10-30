import type { EventBus } from '../core/events';
import type { UiCtx } from './ctx';
import { h } from './dom';
import { LevelUpMenu } from './levelUp';
import { Modal } from './modal';
import { prettyId } from './logic';
import type { UiComponent } from './types';

/**
 * Bonfire menu, opened by `bonfireRest` (the world already refilled HP/estus and respawned enemies):
 * Level Up / Leave. Level Up opens the level-up screen on top, then Back returns here.
 */
export class BonfireMenu extends Modal implements UiComponent {
  readonly levelUp: LevelUpMenu;
  private readonly sub = h('div', 'dim');
  private readonly btnLevel = h('div', 'btn', 'Level Up');
  private readonly btnLeave = h('div', 'btn', 'Leave');
  private offs: (() => void)[] = [];
  private focus = 0;

  constructor(ctx: UiCtx) {
    super(ctx, 'bonfire', 280);
    this.levelUp = new LevelUpMenu(ctx);
    this.panel.append(h('div', 'ptitle', [h('span', 'gold', 'BONFIRE')]));
    const body = h('div', 'pbody');
    body.style.flexDirection = 'column';
    this.btnLevel.addEventListener('click', () => this.openLevelUp());
    this.btnLeave.addEventListener('click', () => this.hide());
    body.append(this.sub, this.btnLevel, this.btnLeave);
    this.panel.append(body, h('div', 'pfoot', [h('span', 'kc', ctx.key('menu')), ' leave']));
    this.levelUp.onBack = () => this.closeLevelUp();
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.scrim, this.levelUp.scrim);
    this.offs.push(
      bus.on('bonfireRest', (e) => {
        this.sub.textContent = `${prettyId(e.bonfireId)} — rested`;
        if (!this.open && !this.levelUp.open) this.show();
      }),
      bus.on('soulsChanged', () => this.levelUp.refresh()),
    );
  }

  protected override onOpen(): void {
    this.focus = 0;
    this.paintFocus();
  }

  private paintFocus(): void {
    this.btnLevel.classList.toggle('sel', this.focus === 0);
    this.btnLeave.classList.toggle('sel', this.focus === 1);
  }

  /** Up/Down/Enter for the bonfire menu or its level-up screen. Returns true when handled. */
  handleKey(code: string): boolean {
    if (this.levelUp.open) return this.levelUp.handleKey(code);
    if (!this.open) return false;
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.focus = this.focus === 0 ? 1 : 0;
      this.paintFocus();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (this.focus === 0) this.openLevelUp();
      else this.hide();
      return true;
    }
    return false;
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.scrim.remove();
    this.levelUp.scrim.remove();
  }

  /** Open level-up over the bonfire menu (show first so the capture token never drops). */
  openLevelUp(): void {
    this.levelUp.show();
    this.hide();
  }

  closeLevelUp(): void {
    this.show();
    this.levelUp.hide();
  }

  /** True while the bonfire menu or its level-up screen is up. */
  get active(): boolean {
    return this.open || this.levelUp.open;
  }

  /** Esc / interact key: step back one screen, then leave. */
  back(): void {
    if (this.levelUp.open) this.closeLevelUp();
    else this.hide();
  }
}
