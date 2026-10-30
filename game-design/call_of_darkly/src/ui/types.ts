import type { EventBus } from '../core/events';

/** DOM overlay component. Mounts into #ui; subscribes to the event bus in mount, unsubscribes in unmount. */
export interface UiComponent {
  mount(root: HTMLElement, bus: EventBus): void;
  unmount(): void;
  /** Per render frame (real dt) for animations. */
  update?(frameDt: number): void;
}

export interface Hud extends UiComponent {
  setVisible(v: boolean): void;
}

/** Menus do NOT pause the sim (§3). */
export interface Menu extends UiComponent {
  readonly open: boolean;
  toggle(): void;
}

/** Top-left item toasts / center banners, fed by the `toast` + `itemPickup` events. */
export interface ToastQueue extends UiComponent {
  push(text: string, opts?: { icon?: string; count?: number; kind?: 'item' | 'info' | 'banner' }): void;
}
