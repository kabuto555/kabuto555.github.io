/**
 * Procedural boss loop: low war drums + detuned drone + brass-ish stabs. Rendered once into a seamless
 * mono buffer (8 bars @ 84 bpm), played looped through the music bus.
 */
export const MUSIC_RATE = 22050;
export const MUSIC_BPM = 84;
export const MUSIC_BARS = 8;

export function bossLoopSeconds(): number {
  return (MUSIC_BARS * 4 * 60) / MUSIC_BPM;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function renderBossLoop(rate = MUSIC_RATE): Float32Array {
  const beat = 60 / MUSIC_BPM;
  const total = Math.floor(bossLoopSeconds() * rate);
  const out = new Float32Array(total);
  const rnd = lcg(0xb055);
  // Wrap writes so tails loop seamlessly.
  const add = (i: number, v: number) => {
    out[((i % total) + total) % total]! += v;
  };

  // Drone: D1 + fifth, detuned saws with a slow swell. 8 swell cycles per loop -> seamless.
  for (const nn of [26, 26.12, 33, 38.06]) {
    // Snap the frequency to a whole number of cycles per loop so the seam is phase-continuous.
    const f = Math.max(1, Math.round(midi(nn) * bossLoopSeconds())) / bossLoopSeconds();
    let ph = 0;
    let lp = 0;
    // Two passes: the first warms the filter state so the loop seam has no click.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < total; i++) {
        ph += f / rate;
        ph -= Math.floor(ph);
        const swell = 0.6 + 0.4 * Math.sin((2 * Math.PI * i * 4) / total);
        lp += 0.04 * (ph * 2 - 1 - lp);
        if (pass === 1) out[i]! += lp * 0.28 * swell;
      }
    }
  }

  const kick = (t: number, amp: number) => {
    const s0 = Math.floor(t * rate);
    const n = Math.floor(0.4 * rate);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      ph += (110 * Math.pow(40 / 110, Math.min(1, u * 3))) / rate;
      add(s0 + i, Math.sin(ph * 2 * Math.PI) * Math.pow(1 - u, 2.5) * amp);
    }
  };
  const tom = (t: number, f: number, amp: number) => {
    const s0 = Math.floor(t * rate);
    const n = Math.floor(0.3 * rate);
    let ph = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      ph += (f * (1 - 0.3 * u)) / rate;
      lp += 0.15 * (rnd() - lp);
      add(s0 + i, (Math.sin(ph * 2 * Math.PI) * 0.8 + lp * 0.4) * Math.pow(1 - u, 2.2) * amp);
    }
  };
  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const b0 = bar * 4 * beat;
    kick(b0, 0.9);
    kick(b0 + 2 * beat, 0.75);
    tom(b0 + 1.5 * beat, 90, 0.5);
    tom(b0 + 2.75 * beat, 75, 0.45);
    if (bar % 2 === 1) {
      tom(b0 + 3 * beat, 120, 0.5);
      tom(b0 + 3.5 * beat, 100, 0.5);
      tom(b0 + 3.75 * beat, 85, 0.55);
    }
  }

  // Brass stabs: [bar, beat offset, root midi, length in beats]. Minor-key power chords, chromatic menace.
  const stabs: [number, number, number, number][] = [
    [0, 0, 50, 1.5], [1, 0, 50, 1], [1, 2, 53, 1], [2, 0, 50, 1.5], [3, 0, 49, 1], [3, 2, 50, 2],
    [4, 0, 50, 1.5], [5, 0, 53, 1], [5, 2, 55, 1], [6, 0, 56, 1.5], [6, 2, 55, 1],
    [7, 0, 50, 0.75], [7, 1.5, 50, 0.75], [7, 2.5, 49, 1.5],
  ];
  for (const [bar, off, root, len] of stabs) {
    const s0 = Math.floor((bar * 4 + off) * beat * rate);
    const n = Math.floor(len * beat * rate);
    for (const iv of [0, 7, 12]) {
      const f = midi(root + iv);
      let ph = 0;
      let ph2 = 0;
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        ph += f / rate;
        ph2 += (f * 1.006) / rate;
        ph -= Math.floor(ph);
        ph2 -= Math.floor(ph2);
        const env = Math.min(1, i / (0.04 * rate)) * Math.pow(1 - u, 1.3);
        const cut = 0.05 + 0.25 * Math.min(1, i / (0.06 * rate)) * (1 - u * 0.6);
        lp += cut * (ph + ph2 - 1 - lp);
        add(s0 + i, lp * env * 0.16);
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const k = peak > 0 ? 0.9 / peak : 0;
  for (let i = 0; i < total; i++) out[i] = out[i]! * k;
  return out;
}
