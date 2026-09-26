// What every tabletop game (Words With Friends, Dice With Friends…) gives the table manager
// (tabletop.ts): a match between two seats with something on the ground everyone can watch,
// optional bots in the seats, and controls for the one human who might sit down.
//
// Table-local space for every game: centred on the origin, lying on y = 0; seat 0 on +Z
// looking toward −Z (the human always sits there), seat 1 across on −Z.

type Object3D = import('three').Object3D;
type Ray = import('three').Ray;

export type Seat = 0 | 1;

export interface MatchPlayer {
  name: string;
  /** Bots: how sharp their play is (0..1). null = the human. */
  skill: number | null;
}

/** How a move went, for sounds and the bots' banter. */
export interface MoveNote {
  /** The toy sound it makes on the table (tiles going down, dice rolling). */
  sound?: 'tiles' | 'dice';
  /** A good move / the best kind (a bingo, five of a kind) / nothing doing (a pass, a zero). */
  big?: boolean;
  huge?: boolean;
  stuck?: boolean;
}

export interface MatchHooks {
  onMove(seat: Seat, note: MoveNote): void;
  /** The game just ended. */
  onOver(): void;
  /** The human tapped Done on the result card. */
  onHumanDone(): void;
}

/** The screen band (host px) the human's HUD leaves free for the table. */
export interface Band { top: number; bottom: number; height: number; }

export interface TabletopMatch {
  /** On the ground: the board / tray (the manager places and rotates `root`). */
  readonly view: { readonly root: Object3D; readonly done: boolean; update(dt: number): void; packUp(): void };
  readonly over: boolean;
  /** null while playing, or on a draw. */
  readonly winner: Seat | null;
  /** Seconds a bot takes over a move, and when to call the game (bot-only games turn over). */
  setPace(pace: readonly [number, number], maxSeconds: number): void;
  begin(players: [MatchPlayer, MatchPlayer]): void;
  /** Gives the human in `seat` the controls; `ray` is the camera ray through a screen point. */
  attachHuman(seat: Seat, host: HTMLElement, canvas: HTMLElement, ray: (x: number, y: number) => Ray | null): void;
  detachHuman(): void;
  band(): Band | null;
  /** A chat line for the human's HUD. */
  chatLine(name: string, text: string, opponent: boolean): void;
  forfeit(seat: Seat): void;
  update(dt: number): void;
  /** Both names and scores, for the in-world sign. */
  scoreLine(): string;
  resultFor(seat: Seat): { title: string; subtitle: string };
  dispose(): void;
}

/** When this frame's thinking time for every bot at every table runs out (performance.now ms). */
export const thinkClock = { until: 0 };
