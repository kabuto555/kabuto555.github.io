import { COLORS } from './config';

// The global `THREE` is a `const` value (see global.d.ts), not a namespace,
// so `THREE.Foo` cannot be written as a bare type. `InstanceType<typeof
// THREE.Foo>` recovers the instance type from the global without an
// `import * as THREE from 'three'`.
type Renderer = InstanceType<typeof THREE.WebGLRenderer>;
type Scene = InstanceType<typeof THREE.Scene>;
type Camera = InstanceType<typeof THREE.PerspectiveCamera>;
type HemisphereLight = InstanceType<typeof THREE.HemisphereLight>;
type DirectionalLight = InstanceType<typeof THREE.DirectionalLight>;

// DPR floor is 1 (some emulated/headless contexts report 0). The cap is 2 on
// normal hardware; a coarse pointer (touch — i.e. a phone, not a mouse/
// trackpad) is a proxy for "probably a lower-tier GPU" and gets a lower cap,
// same policy survivor_3d encodes but keyed off `matchMedia('(pointer:
// coarse)')` instead of a UA sniff, so it also reflects e.g. a touch-emulated
// desktop browser correctly.
export const MAX_DEVICE_PIXEL_RATIO = 2;
export const COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO = 1.5;

function hasCoarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

// Re-derives the DPR cap from live conditions rather than a value captured
// once at boot, so it stays correct if a window drags between a low-DPR and a
// high-DPR display, or a device's pointer type is only knowable after boot.
export function resolveDevicePixelRatio(): number {
  const cap = hasCoarsePointer() ? COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO : MAX_DEVICE_PIXEL_RATIO;
  return Math.min(window.devicePixelRatio || 1, cap);
}

// Renderer defaults that are correct for r170: color management is on by
// default, and the legacy gamma/encoding switches that predate it are removed
// APIs — nothing to set here. This only caps device pixel ratio (perf on
// high-DPI phones) and turns on soft shadows.
export function configureRenderer(renderer: Renderer): void {
  renderer.setPixelRatio(resolveDevicePixelRatio());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // "Neutral" (Khronos PBR-neutral) tone mapping keeps the bright pastel clay
  // colours saturated while gently rolling off highlights — the premium
  // product-render look, without the desaturation ACES/AgX introduce. Falls
  // back to ACES on older three builds that lack it.
  renderer.toneMapping =
    ((THREE as unknown as { NeutralToneMapping?: number }).NeutralToneMapping ??
      THREE.ACESFilmicToneMapping) as typeof THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
}

// A soft "studio" environment + gradient sky, both from one procedural vertical
// gradient — no external HDR, no addon, publish-safe. The gradient equirect is
// used directly as the sky background AND run through PMREM to give every
// MeshStandardMaterial soft image-based ambient light (the popmart/clay
// "soft studio lighting" look) instead of a flat single-colour fill.
export function createSkyEnvironment(renderer: Renderer, scene: Scene): void {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  // Vivid storybook sky (Animal Crossing / Mario Wonder): a punchy saturated
  // blue zenith melting through a bright mid-blue into a warm pale horizon —
  // this also feeds the IBL, so the cool-blue top tints shadows cool while the
  // warm key lights forms (colour contrast = the premium cartoon read).
  g.addColorStop(0.0, '#5aa7e6'); // zenith — friendly cartoon blue (not too deep)
  g.addColorStop(0.4, '#86c3ee'); // upper sky
  g.addColorStop(0.66, '#bde2f3'); // mid sky
  g.addColorStop(0.86, '#eaf5f1'); // pale horizon haze
  g.addColorStop(1.0, '#f1ecdd'); // soft ground bounce
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);

  const sky = new THREE.CanvasTexture(canvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(sky).texture;
  pmrem.dispose();
}

/** Stops observing the container and cancels any pending coalesced resize. */
export type StopObservingResize = () => void;

// The container's box can change after boot — an orientation change, browser
// chrome showing or hiding, the preview pane resizing — with no event three.js
// listens for by default. Without this, the renderer keeps rendering at its
// boot-time resolution/aspect while the CSS canvas is stretched to whatever
// box the container ends up being — a square object renders non-square.
// `ResizeObserver` is the correct signal (it fires on any box-model change to
// the observed element, not just `window` resize), and multiple observer
// callbacks within the same frame are coalesced into a single
// `requestAnimationFrame` so a burst of layout thrash (a font loading, a
// browser chrome show/hide) does the renderer work once, not N times.
export function observeContainerResize(
  container: HTMLElement,
  renderer: Renderer,
  camera: Camera,
): StopObservingResize {
  let pendingFrame: number | null = null;

  function applyResize(): void {
    pendingFrame = null;
    const width = container.clientWidth;
    const height = container.clientHeight;
    // A detached/zero-size container (mid-layout, or a hidden tab) has
    // nothing sane to size to yet — skip rather than divide by zero into the
    // camera aspect or hand three.js a 0x0 render target.
    if (width <= 0 || height <= 0) return;

    // Re-applied on every resize, not just at boot: a stale DPR captured once
    // is wrong the moment the window moves to a display with a different
    // pixel ratio, or the pointer type changes (e.g. a 2-in-1 detaching its
    // keyboard).
    renderer.setPixelRatio(resolveDevicePixelRatio());
    // updateStyle=false: the canvas's own CSS (100% of its container, set in
    // src/main.ts) already drives the visible box. Letting `setSize` also
    // write inline pixel dimensions would just fight that CSS every resize.
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function scheduleResize(): void {
    if (pendingFrame !== null) return;
    pendingFrame = requestAnimationFrame(applyResize);
  }

  const observer = new ResizeObserver(scheduleResize);
  observer.observe(container);
  // Sizes immediately from the container's current box rather than waiting
  // for the first ResizeObserver callback (which fires async), so the very
  // first frame already matches the container instead of the boot-time
  // GAME_WIDTH/GAME_HEIGHT guess.
  applyResize();

  return () => {
    observer.disconnect();
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  };
}

export interface LightingRig {
  hemisphereLight: HemisphereLight;
  directionalLight: DirectionalLight;
}

// A known-good, genre-neutral lighting rig: a HemisphereLight for soft
// sky/ground fill (so unlit-facing surfaces never read as pure black) plus a
// single shadow-casting DirectionalLight. `frustumSize` should roughly match
// the radius of the area that needs shadows — too large and shadow-map
// resolution gets soft/blocky, too small and casters outside the frustum
// won't shadow at all.
export function createLightingRig(scene: Scene, frustumSize = 6): LightingRig {
  // The gradient environment (createSkyEnvironment) now carries the soft ambient
  // fill, so the hemisphere is dialled down to a gentle top-up — otherwise the
  // scene reads flat. A warm, bright key sun gives the clay its form + shadows.
  // Generous cool fill lifts the shadow floor so shadows read soft, not harsh.
  // Cool sky fill + warm sand bounce, kept modest so the key sun + env define
  // form rather than washing everything flat. The cool/warm split gives the
  // clay dimensional colour (blue-ish shadows, golden lit faces).
  // Generous sky/ground fill so shadowed faces and cast shadows stay bright and
  // colourful (the airy Animal-Crossing look) instead of crushing to near-black.
  const hemisphereLight = new THREE.HemisphereLight(
    0xdcefff, // soft sky
    0xf0e6d2, // warm sand bounce
    1.1,
  );
  scene.add(hemisphereLight);

  // A gentle warm key — enough to give form and soft shadows, but not so strong
  // that the shaded side goes dark. The big hemisphere + env fill carries the
  // rest, keeping the whole frame high-key and cheerful.
  const directionalLight = new THREE.DirectionalLight(0xfff6e6, 1.75);
  directionalLight.position.set(30, 48, 22);
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.castShadow = true;

  // Soft contact shadows: 2048 map + a wide blur radius for gentle,
  // ambient-occlusion-like grounding rather than hard-edged shadows.
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.radius = 7;
  // Lighter cast shadows (r170 LightShadow.intensity) so contact shadows read as
  // soft grounding, not hard near-black patches.
  (directionalLight.shadow as unknown as { intensity: number }).intensity = 0.38;
  directionalLight.shadow.camera.left = -frustumSize;
  directionalLight.shadow.camera.right = frustumSize;
  directionalLight.shadow.camera.top = frustumSize;
  directionalLight.shadow.camera.bottom = -frustumSize;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 200;
  // Bias avoids shadow acne on flat surfaces; normalBias handles the bevelled
  // clay edges without visible peter-panning.
  directionalLight.shadow.bias = -0.0004;
  directionalLight.shadow.normalBias = 0.02;

  scene.add(directionalLight);
  scene.add(directionalLight.target);

  return { hemisphereLight, directionalLight };
}
