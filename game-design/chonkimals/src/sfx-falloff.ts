// Distance falloff for world sounds — the same curve the log course, jumps, splashes
// and Sumo use: full volume within `near`, fading linearly to silent at `far`.

export function distanceFalloff(d: number, near: number, far: number): number {
  return Math.min(1, Math.max(0, 1 - (d - near) / (far - near)));
}
