/// <reference types="phaser" />

declare global {
  const Phaser: typeof import('phaser');
  const THREE: typeof import('three');
  interface Window {
    __WIM_BUILD__: number;
  }
}

export {};
