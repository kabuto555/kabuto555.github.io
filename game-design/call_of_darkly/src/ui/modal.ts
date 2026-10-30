import type { UiCtx } from './ctx';
import { h } from './dom';

/**
 * Scrim + centered panel that holds the mouse while open (via `ctx.capture`). Subclasses fill `panel`.
 * Menus do NOT pause the sim (PLAN 14.4): the game keeps running behind the scrim.
 */
export class Modal {
  readonly scrim = h('div', 'scrim');
  readonly panel = h('div', 'panel');
  private _open = false;
  /** Called after the modal closed (from any path). */
  onClosed: (() => void) | null = null;

  constructor(
    protected readonly ctx: UiCtx,
    private readonly token: string,
    width: number,
  ) {
    this.panel.style.width = `${width}px`;
    this.scrim.append(this.panel);
  }

  get open(): boolean {
    return this._open;
  }

  protected onOpen(): void {}
  protected onClose(): void {}

  show(): void {
    if (this._open) return;
    this._open = true;
    this.scrim.classList.add('on');
    this.onOpen();
    this.ctx.capture.acquire(this.token);
  }

  hide(): void {
    if (!this._open) return;
    this._open = false;
    this.scrim.classList.remove('on');
    this.onClose();
    this.ctx.capture.release(this.token);
    this.onClosed?.();
  }
}
