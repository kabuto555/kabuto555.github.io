declare global {
  const THREE: typeof import('three');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tone: any;
  interface Window {
    __WIM_BUILD__: number;
  }
}

export {};
