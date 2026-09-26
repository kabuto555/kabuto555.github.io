// Drag input for on-rails lateral movement (portrait, touch-first)
// The player drags to move orthogonal to the rail's forward direction.

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pointerId: number | null;
  deltaX: number;
  deltaY: number;
  /** True for one frame when a double-tap is detected */
  doubleTapped: boolean;
}

export function createDragInput(element: HTMLElement): { state: DragState; dispose: () => void } {
  const state: DragState = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    pointerId: null,
    deltaX: 0,
    deltaY: 0,
    doubleTapped: false,
  };

  let lastTapTime = 0;
  const DOUBLE_TAP_MS = 300;

  function onDown(e: PointerEvent): void {
    if (state.pointerId !== null) return;
    // Double-tap detection
    const now = performance.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      state.doubleTapped = true;
    }
    lastTapTime = now;
    state.active = true;
    state.pointerId = e.pointerId;
    const rect = element.getBoundingClientRect();
    state.startX = e.clientX - rect.left;
    state.startY = e.clientY - rect.top;
    state.currentX = state.startX;
    state.currentY = state.startY;
    state.deltaX = 0;
    state.deltaY = 0;
    element.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== state.pointerId) return;
    const rect = element.getBoundingClientRect();
    state.currentX = e.clientX - rect.left;
    state.currentY = e.clientY - rect.top;
    state.deltaX = state.currentX - state.startX;
    state.deltaY = state.currentY - state.startY;
  }

  function onUp(e: PointerEvent): void {
    if (e.pointerId !== state.pointerId) return;
    state.active = false;
    state.pointerId = null;
    state.deltaX = 0;
    state.deltaY = 0;
  }

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);

  return {
    state,
    dispose: () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    },
  };
}
