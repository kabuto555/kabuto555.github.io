// Runtime safe-area + playfield helper. Generated games import this to get
// real layout numbers — where the notch/home-indicator insets are, where the
// player app's floating overlay sits, and how big a tap target has to be —
// instead of guessing.
//
// Engine-agnostic by construction: every public function takes canvas/
// container dimensions as parameters, never reads engine state. The 2D engine
// passes its fixed design resolution; the 3D engine passes the renderer's
// current size or a DOM container's client box. Do not add any engine-name or
// engine-global reference to this file — a test greps for that.
//
// iOS populates env(safe-area-inset-*), readable only by measuring a probe
// element since env() is not reachable from JS directly
// (readEnvInsetsFromStyle/getLiveEnvInsets).
//
// The second source is the embedding shell, via the --sat/--sar/--sab/--sal
// custom properties (readShellInsetsFromStyle/getLiveShellInsets). The builder
// preview sets these from its simulated-device picker so a notch can be
// exercised on a desktop browser, where every env() reads 0 and no amount of
// correct game code would visibly respond. A native host could use the same
// channel, but it must publish INTO the game frame — an earlier Android bridge
// was dropped precisely because it set them on the top-level document while the
// game runs in a nested iframe, which does not inherit them.
//
// Android WebView populates neither source natively, so insets read zero there
// and only the overlay keep-out applies.
//
// combineInsets takes the per-edge max of both sources, so either one's
// zero/absent case falls back to the other transparently, and degrades to
// {0,0,0,0} — never NaN — when neither is present (desktop Chrome).

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeLayout {
  insets: Insets;
  insetRect: Rect;
  playfieldRect: Rect;
  keepOutRect: Rect;
  minTapTargetPx: number;
}

/**
 * Canvas units per CSS pixel, per axis.
 *
 * Every fixed constant in this file (the overlay geometry, the edge indent, the
 * tap-target floor) is expressed in CSS pixels, because that is what the player
 * shell's CSS and Apple's HIG are denominated in. But the rects this file
 * returns are in CANVAS units, and for the 2D engine those are not the same
 * thing: a 786x1704 design canvas drawn into a 304x659 on-screen box is 2.59
 * canvas units per CSS pixel. Passing a CSS-pixel constant through unscaled
 * under-reserves by exactly that factor — a 120x96 CSS-px overlay was reserving
 * 120x96 CANVAS units, i.e. 46x37 real pixels, about 15% of the area it needed.
 *
 * So every constant gets multiplied by this on the way in. It defaults to 1:1,
 * which is correct for any caller already working in CSS pixels — the 3D engine
 * passes a live client box, and the preview overlay lays out in CSS pixels too.
 */
export interface CanvasScale {
  x: number;
  y: number;
}

/** Canvas units == CSS pixels. The default, and correct whenever the caller passes a live DOM box. */
export const UNIT_SCALE: CanvasScale = { x: 1, y: 1 };

// 44px is Apple's HIG tap-target floor. Justification, not theory: survivor_3d
// has no such constant and ships a 5.8vmin pause button that computes to
// ~22px on an iPhone SE — half the floor. CSS contexts should express this as
// `clamp(44px, <relative>, <cap>)` (see minTapTargetClamp below), not a bare
// px value, so the target still grows on larger screens.
export const MIN_TAP_TARGET_PX = 44;

// Third term of the survivor_3d `max(env(...), var(--sa*, 0px), <minimum
// indent>)` idiom (apps/survivor/frontend/game.css:8-17): gives a sane visual
// indent on no-notch devices instead of flush-to-edge UI. Applied only when
// deriving the playfield's usable margins, NOT to the raw `insets` field —
// callers that need the true, possibly-zero device inset (e.g. to detect "no
// notch at all") read `insets` directly.
export const MIN_SAFE_EDGE_INDENT_PX = 8;

// Template-side mirror of src/constants/player-overlay.ts. That module is the
// app-side source of truth (PlayerGame.tsx + player-game.css derive the
// floating menu's live CSS from it); this is a seeded-template copy so a
// generated game's boot code can reserve the same rectangle without an
// app-side import (this file ships into session workspaces, the app's
// src/constants/ does not). The parity test in safe-layout.test.ts fails if
// the two literal copies ever drift.
export const PLAYER_OVERLAY_OFFSET_PX = 16;
export const PLAYER_OVERLAY_COLLAPSED_SIZE_PX = 38;
export const PLAYER_OVERLAY_EXPANDED_SIZE_PX = {
  width: 120,
  height: 96,
} as const;

export const PLAYER_OVERLAY_GEOMETRY = {
  offsetPx: PLAYER_OVERLAY_OFFSET_PX,
  collapsedSizePx: PLAYER_OVERLAY_COLLAPSED_SIZE_PX,
  expandedSizePx: PLAYER_OVERLAY_EXPANDED_SIZE_PX,
} as const;

/**
 * Parses a CSS length ("12.5px", "0px", "") into a finite, non-negative
 * number. `parseFloat` already stops at the first non-numeric character, so a
 * `px` (or any) suffix is handled without a regex; anything that isn't a
 * usable number (missing, empty, negative, NaN — e.g. an unsupported env()
 * with no fallback) degrades to 0 rather than propagating NaN.
 */
export function parseCssPixelLength(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Reads iOS-style env(safe-area-inset-*) insets from a computed style whose
 * padding-* was set to `env(safe-area-inset-*, 0px)` on a probe element (see
 * getLiveEnvInsets). Takes a plain style-shaped object rather than a live
 * CSSStyleDeclaration so this is directly unit-testable without a DOM.
 */
export function readEnvInsetsFromStyle(style: {
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
}): Insets {
  return {
    top: parseCssPixelLength(style.paddingTop),
    right: parseCssPixelLength(style.paddingRight),
    bottom: parseCssPixelLength(style.paddingBottom),
    left: parseCssPixelLength(style.paddingLeft),
  };
}

/**
 * Reads the shell-provided --sat/--sar/--sab/--sal custom properties from a
 * computed style. These are set by whatever host is embedding the game when it
 * knows an inset the page cannot discover for itself — today that is the
 * builder preview's simulated-device picker, which posts them in so a notch can
 * be exercised on a desktop browser where every env() reads 0.
 *
 * Takes a minimal `getPropertyValue`-shaped object rather than a live
 * CSSStyleDeclaration so this is directly unit-testable without a DOM.
 */
export function readShellInsetsFromStyle(style: {
  getPropertyValue(property: string): string;
}): Insets {
  return {
    top: parseCssPixelLength(style.getPropertyValue('--sat')),
    right: parseCssPixelLength(style.getPropertyValue('--sar')),
    bottom: parseCssPixelLength(style.getPropertyValue('--sab')),
    left: parseCssPixelLength(style.getPropertyValue('--sal')),
  };
}

/** Zero insets — the desktop-Chrome / no-cutout degrade target. */
export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Per-edge max of the two inset sources. Given Android vars only (iOS probe
 * reads zero), reports the Android values; given env() only, reports the iOS
 * values; given both, reports the larger of each edge. Neither source being
 * present yields {0,0,0,0} (parseCssPixelLength already guarantees each input
 * is finite and non-negative, so the max is too — never NaN).
 */
export function combineInsets(envInsets: Insets, androidInsets: Insets): Insets {
  return {
    top: Math.max(envInsets.top, androidInsets.top),
    right: Math.max(envInsets.right, androidInsets.right),
    bottom: Math.max(envInsets.bottom, androidInsets.bottom),
    left: Math.max(envInsets.left, androidInsets.left),
  };
}

/** True if point (x, y) falls within rect, inclusive of its edges. */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** True if two rects overlap by more than a zero-width/height edge touch. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * The player overlay keep-out rect in canvas coordinates, anchored
 * bottom-right per PLAYER_OVERLAY_GEOMETRY, offset from the true canvas edge
 * by the combined inset plus the overlay's own offsetPx — mirroring how
 * player-game.css positions the real floating menu (`offset +
 * env(safe-area-inset-*)`, no additional floor).
 *
 * Reserves the COLLAPSED button (38x38), not the expanded menu-open panel
 * (120x96). The expanded panel is ~8x the area and only exists while the menu
 * is open — and while it is open, `.player-fab-backdrop` covers the whole
 * surface above the game and swallows the next tap to dismiss it, so nothing
 * underneath is interactive anyway. Nobody plays with the panel open. Reserving
 * for it cost every game a quarter of its bottom-right corner and produced
 * false "your button overlaps the menu" reports against layouts that were
 * measurably fine on device. See PLAYER_OVERLAY_EXPANDED_SIZE_PX, which is now
 * only an upper bound asserted in tests.
 */
export function computeKeepOutRect(
  canvasWidth: number,
  canvasHeight: number,
  insets: Insets,
  geometry: typeof PLAYER_OVERLAY_GEOMETRY = PLAYER_OVERLAY_GEOMETRY,
  scale: CanvasScale = UNIT_SCALE,
): Rect {
  // geometry is CSS px; the returned rect is canvas units — see CanvasScale.
  const width = geometry.collapsedSizePx * scale.x;
  const height = geometry.collapsedSizePx * scale.y;
  const offsetX = geometry.offsetPx * scale.x;
  const offsetY = geometry.offsetPx * scale.y;
  return {
    x: canvasWidth - insets.right - offsetX - width,
    y: canvasHeight - insets.bottom - offsetY - height,
    width,
    height,
  };
}

/**
 * The canvas rect shrunk by the device insets only (floored to
 * MIN_SAFE_EDGE_INDENT_PX), with NO keep-out carve-out.
 *
 * This is the rect to clamp CENTRED content against. `playfieldRect` shrinks
 * its entire right and bottom edges to exclude a keep-out that occupies only
 * the bottom-right corner, which is the conservative and correct choice for
 * content anchored to those edges — but it is far too blunt for content
 * floating in the middle of the screen, which cannot reach that corner at all.
 * Clamping a wide centred menu against `playfieldRect` drags it sideways to
 * respect a 38px button hundreds of pixels away.
 */
export function computeInsetRect(
  canvasWidth: number,
  canvasHeight: number,
  insets: Insets,
  minEdgeIndentPx: number = MIN_SAFE_EDGE_INDENT_PX,
  scale: CanvasScale = UNIT_SCALE,
): Rect {
  const indentX = minEdgeIndentPx * scale.x;
  const indentY = minEdgeIndentPx * scale.y;
  const left = Math.max(insets.left, indentX);
  const top = Math.max(insets.top, indentY);
  const right = Math.max(insets.right, indentX);
  const bottom = Math.max(insets.bottom, indentY);

  return {
    x: left,
    y: top,
    width: Math.max(0, canvasWidth - left - right),
    height: Math.max(0, canvasHeight - top - bottom),
  };
}

/**
 * The usable playfield rect: the canvas rect shrunk by the device insets
 * (floored to MIN_SAFE_EDGE_INDENT_PX so no-notch devices still get a sane
 * visual margin) AND, on the bottom-right corner, shrunk further so it never
 * overlaps keepOutRect. Because keepOutRect is anchored to the same corner,
 * pulling the right/bottom edges in to exactly keepOutRect's near edge
 * excludes it with a single axis-aligned rect rather than an L-shape — the
 * playfield's right edge lands exactly on keepOutRect.x (and bottom on
 * keepOutRect.y), so the two are edge-adjacent with zero overlapping area.
 *
 * This is the rect for EDGE-ANCHORED content. Centred content wants
 * centerWithinSafeArea, which clamps to insetRect instead — see the note there.
 */
export function computePlayfieldRect(
  canvasWidth: number,
  canvasHeight: number,
  insets: Insets,
  keepOutRect: Rect,
  minEdgeIndentPx: number = MIN_SAFE_EDGE_INDENT_PX,
  scale: CanvasScale = UNIT_SCALE,
): Rect {
  // minEdgeIndentPx is CSS px; everything else here is canvas units — see CanvasScale.
  const indentX = minEdgeIndentPx * scale.x;
  const indentY = minEdgeIndentPx * scale.y;
  const left = Math.max(insets.left, indentX);
  const top = Math.max(insets.top, indentY);
  const right = Math.max(insets.right, indentX, canvasWidth - keepOutRect.x);
  const bottom = Math.max(insets.bottom, indentY, canvasHeight - keepOutRect.y);

  return {
    x: left,
    y: top,
    width: Math.max(0, canvasWidth - left - right),
    height: Math.max(0, canvasHeight - top - bottom),
  };
}

/**
 * Pure composition of the two inset sources into a full SafeLayout snapshot.
 * No DOM reference at all — this is what makes zero/nonzero-inset, portrait/
 * landscape, android-only/ios-only/both-max, and the playfield/keep-out
 * exclusion behavior directly unit-testable without a browser DOM.
 */
export function computeSafeLayout(
  canvasWidth: number,
  canvasHeight: number,
  envInsets: Insets,
  androidInsets: Insets,
  scale: CanvasScale = UNIT_SCALE,
): SafeLayout {
  const insets = combineInsets(envInsets, androidInsets);
  const keepOutRect = computeKeepOutRect(canvasWidth, canvasHeight, insets, PLAYER_OVERLAY_GEOMETRY, scale);
  const insetRect = computeInsetRect(
    canvasWidth,
    canvasHeight,
    insets,
    MIN_SAFE_EDGE_INDENT_PX,
    scale,
  );
  const playfieldRect = computePlayfieldRect(
    canvasWidth,
    canvasHeight,
    insets,
    keepOutRect,
    MIN_SAFE_EDGE_INDENT_PX,
    scale,
  );
  return {
    insets,
    insetRect,
    playfieldRect,
    keepOutRect,
    // Also converted: a button sized to 44 CANVAS units on a 786-wide design
    // canvas is ~17 real pixels, well under the floor this constant exists to
    // enforce. Scaled by the larger axis so the result is a floor on both.
    minTapTargetPx: MIN_TAP_TARGET_PX * Math.max(scale.x, scale.y),
  };
}

/**
 * Clamps a centre coordinate so a `size`-long span centred on it stays inside
 * [regionStart, regionStart + regionExtent].
 *
 * Content longer than the region cannot be contained at all, so it centres on
 * the region instead. That is a best-effort degrade, not a guarantee — content
 * that large is a layout problem the caller has to solve by making it smaller.
 */
export function clampCenteredAxis(
  center: number,
  size: number,
  regionStart: number,
  regionExtent: number,
): number {
  if (size >= regionExtent) return regionStart + regionExtent / 2;
  return Math.min(
    Math.max(center, regionStart + size / 2),
    regionStart + regionExtent - size / 2,
  );
}

/**
 * Where to put the centre of a `contentWidth` x `contentHeight` box so it reads
 * as centred AND stays inside the safe area.
 *
 * Anchoring centred content to `playfieldRect` — its centre OR its edges — is
 * the obvious approach and it is wrong twice over, because that rect is
 * asymmetric by construction: it pulls its whole right and bottom edges in far
 * enough to exclude the overlay keep-out, which only occupies the bottom-RIGHT
 * CORNER, while the opposite edges get only MIN_SAFE_EDGE_INDENT_PX.
 *
 * Both failures actually shipped in the 2D template, and both were invisible to
 * every automated check in the repo because the code called the right function:
 *
 *  - Centring ON it: with no device insets at all the playfield is inset 54px
 *    on the right against 8px on the left, so its centre is 23px left of the
 *    canvas centre. The BACK button rendered a measurable 23 CSS px off-centre
 *    while sitting ~125px clear of the corner it was avoiding.
 *  - Merely CLAMPING to it: the title menu is 620 units wide against a 626-unit
 *    playfield, so clamping shoved it 57 units left to respect a 38px button
 *    ~600 units below it. The menu floats at mid-height and can never reach
 *    that corner.
 *
 * So: centre on the CANVAS, clamp into `insetRect` (device insets only — the
 * real constraint for content anywhere on screen), and consult `keepOutRect`
 * only if the content genuinely overlaps it, nudging by the smaller of the two
 * escapes. Content that is nowhere near the corner never moves.
 *
 * Content anchored to an edge or corner — a HUD button above the home
 * indicator, a score in a top corner — should still use `playfieldRect`'s
 * edges. Being blunt is right there: that is exactly where the keep-out lives.
 */
export function centerWithinSafeArea(
  canvasWidth: number,
  canvasHeight: number,
  contentWidth: number,
  contentHeight: number,
  layout: Pick<SafeLayout, 'insetRect' | 'keepOutRect'>,
): { x: number; y: number } {
  const { insetRect, keepOutRect } = layout;
  const clampX = (v: number): number =>
    clampCenteredAxis(v, contentWidth, insetRect.x, insetRect.width);
  const clampY = (v: number): number =>
    clampCenteredAxis(v, contentHeight, insetRect.y, insetRect.height);

  let x = clampX(canvasWidth / 2);
  let y = clampY(canvasHeight / 2);

  const rect = (): Rect => ({
    x: x - contentWidth / 2,
    y: y - contentHeight / 2,
    width: contentWidth,
    height: contentHeight,
  });

  if (rectsOverlap(rect(), keepOutRect)) {
    const current = rect();
    const startX = x;
    const startY = y;
    // The keep-out is anchored bottom-right, so up and left are the two escapes
    // worth trying. Prefer the cheaper one — but "cheaper" is not the same as
    // "available": a large inset on the opposite edge can leave that axis no
    // room, and clampCenteredAxis then silently undoes the shift, returning
    // content that still overlaps. So apply the shift, VERIFY it escaped, and
    // fall back to the other axis, which may have room even though it was the
    // more expensive move. If neither clears the corner alone, take both —
    // the best-effort degrade for content too large to escape either way.
    //
    // Down and right are deliberately NOT tried. The keep-out's far edges sit
    // offsetPx inside insetRect's, so a sliver of room does technically exist
    // past them — but only content thinner than offsetPx (16 CSS px) could use
    // it, and nothing that thin is a UI element a player reads or taps. Such
    // content lands in the take-both degrade above instead of buying two more
    // branches here for a case no real layout produces.
    const shiftUp = current.y + current.height - keepOutRect.y;
    const shiftLeft = current.x + current.width - keepOutRect.x;
    const escapeUp = (): void => {
      y = clampY(startY - shiftUp);
    };
    const escapeLeft = (): void => {
      x = clampX(startX - shiftLeft);
    };
    const [cheaper, dearer] = shiftUp <= shiftLeft ? [escapeUp, escapeLeft] : [escapeLeft, escapeUp];

    cheaper();
    if (rectsOverlap(rect(), keepOutRect)) {
      x = startX;
      y = startY;
      dearer();
      if (rectsOverlap(rect(), keepOutRect)) cheaper();
    }
  }

  return { x, y };
}

/** A CSS `clamp()` expression enforcing the MIN_TAP_TARGET_PX floor. */
export function minTapTargetClamp(preferred: string, capPx: number): string {
  return `clamp(${MIN_TAP_TARGET_PX}px, ${preferred}, ${capPx}px)`;
}

// ── Live DOM reads ───────────────────────────────────────────────────────────
// Everything below touches document/window and is the thin, deliberately
// small glue layer over the pure functions above. It has no unit test of its
// own in this template's no-DOM test file (see safe-layout.test.ts); it is
// exercised for real by both engines' code that imports it (AC-8).

let envProbeElement: HTMLElement | null = null;

/**
 * A hidden, zero-size element whose padding is set to
 * `env(safe-area-inset-*, 0px)`. env() itself cannot be read from JS; measuring
 * this element's computed padding is the standard workaround. Cached and
 * reused (re-appended if a full document reload detached it) rather than
 * created per-call, since this may be read on every resize/orientationchange.
 */
function getEnvProbeElement(container?: HTMLElement): HTMLElement {
  if (envProbeElement && envProbeElement.isConnected) return envProbeElement;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:0',
    'height:0',
    'margin:0',
    'border:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';');

  (container ?? document.body).appendChild(probe);
  envProbeElement = probe;
  return probe;
}

/** Live iOS env(safe-area-inset-*) insets, measured via a probe element. */
export function getLiveEnvInsets(container?: HTMLElement): Insets {
  const style = getComputedStyle(getEnvProbeElement(container));
  return readEnvInsetsFromStyle(style);
}

/** Live shell-provided --sat/--sar/--sab/--sal insets. */
export function getLiveShellInsets(): Insets {
  return readShellInsetsFromStyle(getComputedStyle(document.documentElement));
}

/**
 * The WIM Play app appends this token to its WebView user agent
 * (wim-play-app/capacitor.config.ts). It is set on the WebView itself, so this
 * frame inherits it even though the game runs inside an iframe.
 *
 * Insets are reported as zero anywhere else on purpose. A mobile browser's own
 * chrome already covers the notch, so reserving space for it again would just
 * waste screen; only the standalone WebView hands the page the whole display.
 */
export function isPlayAppShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.includes('WIMPlayApp');
}

/**
 * Converts viewport-space insets in CSS pixels into canvas-space units.
 *
 * The two are not interchangeable: the probe reports CSS pixels off the device
 * (a 59px notch), while the playfield/keep-out maths runs in the game's design
 * resolution (say 1280 units wide). Subtracting 59 from 1280 silently reserved
 * the wrong amount — off by the FIT scale factor, and wrong again whenever
 * letterbox bars mean part of an inset band covers a bar rather than the canvas.
 *
 * `canvasRect` is the canvas's on-screen box in viewport coordinates, and
 * `viewport` is the visual viewport's size. The inset bands are anchored to the
 * VIEWPORT edges, not the canvas — with letterbox bars the canvas can sit well
 * inside them — so each band is intersected with the canvas box first and only
 * the overlapping part is charged against the playfield. A zero-area rect (no
 * DOM, hidden canvas) degrades to the unscaled insets rather than dividing by zero.
 */
export function scaleInsetsToCanvas(
  insets: Insets,
  canvasWidth: number,
  canvasHeight: number,
  canvasRect: Rect,
  viewport: { width: number; height: number },
): Insets {
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return insets;

  const scaleX = canvasWidth / canvasRect.width;
  const scaleY = canvasHeight / canvasRect.height;
  const rectRight = canvasRect.x + canvasRect.width;
  const rectBottom = canvasRect.y + canvasRect.height;

  const overlap = (bandStart: number, bandEnd: number, from: number, to: number): number =>
    Math.max(0, Math.min(bandEnd, to) - Math.max(bandStart, from));

  return {
    top: overlap(0, insets.top, canvasRect.y, rectBottom) * scaleY,
    bottom:
      overlap(viewport.height - insets.bottom, viewport.height, canvasRect.y, rectBottom) * scaleY,
    left: overlap(0, insets.left, canvasRect.x, rectRight) * scaleX,
    right:
      overlap(viewport.width - insets.right, viewport.width, canvasRect.x, rectRight) * scaleX,
  };
}

/**
 * The full SafeLayout snapshot for the given canvas size, reading both live
 * inset sources and combining them per-edge. `container`, if supplied, scopes
 * where the env() probe element is appended (useful if CSS overrides are
 * scoped to the game's own container rather than the document body) but is
 * not required for correct behavior.
 */
export function getSafeLayout(
  canvasWidth: number,
  canvasHeight: number,
  container?: HTMLElement,
): SafeLayout {
  const canvasRect = measureCanvasRect(container);
  const scale = canvasScaleFor(canvasWidth, canvasHeight, canvasRect);

  // Two sources, gated differently on purpose.
  //
  // env() is honoured only inside the Play app: a mobile browser's own chrome
  // already covers the notch, so insetting again there would waste screen.
  //
  // Shell-provided vars are honoured ALWAYS. Nothing sets them by accident —
  // they only appear because a host deliberately said "there is an inset here",
  // which is exactly what the builder preview's simulated-device picker does.
  // Ignoring them outside the Play app would make the preview's notch band
  // decorative, showing a violation the game had no way to respond to.
  const cssInsets = combineInsets(
    isPlayAppShell() ? getLiveEnvInsets(container) : ZERO_INSETS,
    getLiveShellInsets(),
  );
  const insets = scaleInsetsToCanvas(
    cssInsets,
    canvasWidth,
    canvasHeight,
    canvasRect,
    measureViewport(),
  );

  return computeSafeLayout(canvasWidth, canvasHeight, insets, ZERO_INSETS, scale);
}

/**
 * Canvas units per CSS pixel for a canvas of `canvasWidth`x`canvasHeight` drawn
 * into `canvasRect`. Degrades to 1:1 for a zero-area rect (no DOM, hidden
 * canvas) rather than dividing by zero.
 */
export function canvasScaleFor(
  canvasWidth: number,
  canvasHeight: number,
  canvasRect: Rect,
): CanvasScale {
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return UNIT_SCALE;
  return { x: canvasWidth / canvasRect.width, y: canvasHeight / canvasRect.height };
}

// Resolves the element measureCanvasRect would read, without measuring it —
// lets watchSafeLayout's first-read gate tell "no element to ever measure"
// (genuine no-DOM/headless case, retrying can't help) apart from "an element
// exists but hasn't been laid out yet" (retrying can help).
function findMeasurableElement(
  container?: HTMLElement,
): { getBoundingClientRect(): { left: number; top: number; width: number; height: number } } | null {
  if (typeof document === 'undefined') return null;
  const el = (container ?? document.body)?.querySelector('canvas') ?? container;
  return el && typeof el.getBoundingClientRect === 'function' ? el : null;
}

// The drawn canvas box in viewport coordinates. Prefers an actual <canvas>
// (its box is what FIT letterboxing produces, which is what the insets have to
// be measured against); falls back to the container, then to a zero rect, which
// scaleInsetsToCanvas treats as "unknown, don't scale".
function measureCanvasRect(container?: HTMLElement): Rect {
  const el = findMeasurableElement(container);
  if (!el) return { x: 0, y: 0, width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function measureViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

// Bound on watchSafeLayout's first-read retry loop (see below) — high enough
// to ride out a scene subscribing before the browser has laid out the canvas
// (typically resolves within a frame or two), low enough that a genuine
// no-DOM/headless caller with an element that will just never size up still
// gets its (degraded) first callback within a handful of frames, not never.
const FIRST_READ_MAX_ATTEMPTS = 8;

/**
 * Subscribes to `resize` and `orientationchange`, recomputing the SafeLayout
 * (from `getCanvasSize()`, so the caller decides whether that means a fixed
 * design resolution or a live container box) and invoking `onChange` — once
 * for the first read, then on every subsequent change. Returns an unsubscribe
 * function; call it on scene/game teardown to avoid leaking listeners.
 *
 * The first read is gated on measurability: a scene that subscribes in
 * create()/init(), before the browser has laid out the canvas element, would
 * otherwise get getSafeLayout()'s degraded 1:1-scale fallback as its one and
 * only reading, with no signal anything went wrong. Instead, if the canvas
 * isn't measurable yet but an element exists to retry against, this retries
 * across up to FIRST_READ_MAX_ATTEMPTS animation frames before giving up and
 * firing with whatever getSafeLayout returns (degraded or not) — so a caller
 * with no element to ever measure (no DOM, hidden canvas) still resolves
 * promptly instead of retrying pointlessly. Only the FIRST invocation is
 * gated this way; every resize/orientationchange-triggered recompute after it
 * fires immediately and synchronously, same as before.
 */
export function watchSafeLayout(
  getCanvasSize: () => { width: number; height: number },
  onChange: (layout: SafeLayout) => void,
  container?: HTMLElement,
): () => void {
  const recompute = (): void => {
    const { width, height } = getCanvasSize();
    onChange(getSafeLayout(width, height, container));
  };

  let unsubscribed = false;

  const attemptFirstRead = (attemptsLeft: number): void => {
    if (unsubscribed) return;
    const target = findMeasurableElement(container);
    const rect = measureCanvasRect(container);
    const isMeasurable = rect.width > 0 && rect.height > 0;
    if (isMeasurable || !target || attemptsLeft <= 0) {
      recompute();
      return;
    }
    requestAnimationFrame(() => attemptFirstRead(attemptsLeft - 1));
  };

  attemptFirstRead(FIRST_READ_MAX_ATTEMPTS);
  window.addEventListener('resize', recompute);
  window.addEventListener('orientationchange', recompute);

  return () => {
    unsubscribed = true;
    window.removeEventListener('resize', recompute);
    window.removeEventListener('orientationchange', recompute);
  };
}
