/** One tab of the Tab menu. `refresh()` rebuilds from current game state (called on open, tab switch and when data changed). */
export interface MenuTab {
  readonly title: string;
  readonly el: HTMLElement;
  refresh(): void;
}
