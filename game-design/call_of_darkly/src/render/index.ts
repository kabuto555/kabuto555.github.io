import type { Camera, Scene, WebGLRenderer } from 'three';
import type { Ps1Pipeline } from './types';

export * from './types';
export * from './ps1math';
export * from './materials';
export * from './pipeline';
export * from './textures';
export * from './geometry';
export * from './shadow';
export * from './batch';
export * from './skin';
export * from './fog';
export * from './debug';

/** Placeholder pipeline: renders straight to the canvas (kept for tests / fallback). */
export function createPassthroughPipeline(): Ps1Pipeline {
  let r: WebGLRenderer | null = null;
  return {
    init(renderer) {
      r = renderer;
    },
    resize(w, h) {
      r?.setSize(w, h, false);
    },
    render(scene: Scene, camera: Camera) {
      r?.render(scene, camera);
    },
    setFog() {},
    dispose() {
      r = null;
    },
  };
}
