import type { Camera, Color, Scene, WebGLRenderer } from 'three';

export interface Ps1Options {
  /** Internal render target size (320×240 or 427×240 widescreen). Overwritten on resize when autoSize. */
  width: number;
  height: number;
  /** Clip-space vertex snap to the RT pixel grid (global toggle for ps1ified materials). */
  snap: boolean;
  affine: boolean;
  /** 15-bit quantize + Bayer dither in the final blit. (Quantize always runs; this toggles the dither.) */
  dither: boolean;
  /** Pick RT width from display aspect (320 at 4:3 … 427 at 16:9, square pixels). Default true. */
  autoSize: boolean;
  /** Snap grid = RT size × snapScale. <1 exaggerates wobble. Default 1. */
  snapScale: number;
  /** false = bypass: full-res direct render, no snap/affine/dither (debug compare). Default true. */
  enabled: boolean;
}

/** Low-res PS1 pipeline (Phase 1). Owns the render target + final blit + scene fog. */
export interface Ps1Pipeline {
  init(renderer: WebGLRenderer, opts?: Partial<Ps1Options>): void;
  /** Canvas/display size changed (CSS px × devicePixelRatio handled internally). */
  resize(width: number, height: number): void;
  /** Renders the scene. Assigns the pipeline's Fog to `scene.fog`; leave `scene.background` null so the clear = fog color. */
  render(scene: Scene, camera: Camera): void;
  setFog(color: Color | number, near: number, far: number): void;
  dispose(): void;
  /** Runtime toggles (debug keys). Added in M0 — optional for back-compat with other implementations. */
  setOptions?(opts: Partial<Ps1Options>): void;
  readonly options?: Readonly<Ps1Options>;
  /** Main scene pass stats from the last render (excludes the blit). */
  readonly stats?: Readonly<{ calls: number; triangles: number }>;
}

/** Procedural canvas texture generator signature (32–64 px). */
export type TextureFactory = (size: number, seed: number) => HTMLCanvasElement;
