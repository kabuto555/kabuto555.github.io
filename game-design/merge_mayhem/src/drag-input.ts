// ── Touch/pointer drag input: select a piece, then swipe to slide it ──────────
import { type Piece, type Direction } from './game-types';

export interface DragState {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  selectedPieceId: number | null;
}

export interface SwipeEvent {
  pieceId: number;
  dir: Direction;
}

type HitTestFn = (screenX: number, screenY: number) => Piece | null;
type SwipeCb = (evt: SwipeEvent) => void;

const SWIPE_THRESHOLD_PX = 18; // minimum drag distance to trigger a swipe

export class DragInput {
  private state: DragState = {
    active: false,
    pointerId: -1,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    selectedPieceId: null,
  };

  private hitTest: HitTestFn;
  private onSwipe: SwipeCb;
  private element: HTMLElement;

  /** Piece id that is currently "selected" (highlighted) */
  get selectedPieceId(): number | null { return this.state.selectedPieceId; }

  constructor(element: HTMLElement, hitTest: HitTestFn, onSwipe: SwipeCb) {
    this.element = element;
    this.hitTest = hitTest;
    this.onSwipe = onSwipe;

    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.state.active) return;
    const bounds = this.element.getBoundingClientRect();
    const sx = e.clientX - bounds.left;
    const sy = e.clientY - bounds.top;

    const piece = this.hitTest(sx, sy);
    if (!piece) return;

    this.element.setPointerCapture(e.pointerId);
    this.state = {
      active: true,
      pointerId: e.pointerId,
      startX: sx, startY: sy,
      currentX: sx, currentY: sy,
      selectedPieceId: piece.id,
    };
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.state.active || e.pointerId !== this.state.pointerId) return;
    const bounds = this.element.getBoundingClientRect();
    this.state.currentX = e.clientX - bounds.left;
    this.state.currentY = e.clientY - bounds.top;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.state.active || e.pointerId !== this.state.pointerId) return;

    const dx = this.state.currentX - this.state.startX;
    const dy = this.state.currentY - this.state.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= SWIPE_THRESHOLD_PX && this.state.selectedPieceId !== null) {
      const dir = resolveDir(dx, dy);
      this.onSwipe({ pieceId: this.state.selectedPieceId, dir });
    }

    this.state = {
      active: false,
      pointerId: -1,
      startX: 0, startY: 0,
      currentX: 0, currentY: 0,
      selectedPieceId: null,
    };
  };

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onUp);
  }
}

/** Resolve a dx/dy vector into the dominant cardinal direction */
function resolveDir(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
