/**
 * Tiny frame profiler for the debug readout: wrap sections with perfStart/perfEnd,
 * call perfFrame() once a frame; perfSummary() reports average ms per section
 * (over ~1 s) plus the renderer's draw calls / triangles. Dev aid only — cheap
 * enough to leave in (a few performance.now() calls per frame).
 */
const acc = new Map<string, number>();
let avg = new Map<string, number>();
let frames = 0;
let windowStart = performance.now();
let lastFrame = performance.now();
let frameAcc = 0;
let frameAvg = 0;
let calls = 0, tris = 0;

export function perfStart(): number { return performance.now(); }

export function perfEnd(name: string, t0: number): void {
  acc.set(name, (acc.get(name) ?? 0) + performance.now() - t0);
}

/** Call at the start of each frame. */
export function perfFrame(renderer?: import('three').WebGLRenderer): void {
  const now = performance.now();
  frameAcc += now - lastFrame;
  lastFrame = now;
  frames++;
  if (renderer) {
    calls = renderer.info.render.calls;
    tris = renderer.info.render.triangles;
    renderer.info.reset();
  }
  if (now - windowStart >= 1000) {
    avg = new Map([...acc].map(([k, v]) => [k, v / frames]));
    frameAvg = frameAcc / frames;
    acc.clear();
    frames = 0;
    frameAcc = 0;
    windowStart = now;
  }
}

export function perfSummary(): string {
  const parts = [...avg].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`);
  return `frame ${frameAvg.toFixed(2)}ms  calls ${calls}  tris ${(tris / 1000).toFixed(0)}k\n${parts.join('  ')}`;
}
