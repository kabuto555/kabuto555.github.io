declare global {
  const THREE: typeof import('three');
  interface Window {
    __WIM_BUILD__: number;
  }
}

export {};
