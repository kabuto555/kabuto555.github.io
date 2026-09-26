// Tiny canvas textures for procedural cloth (clothes shells, tents, sleeping bags).
// Light-on-white patterns are meant to be tinted by the material colour.

type Texture = import('three').CanvasTexture;

const cache = new Map<string, Texture>();

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): Texture {
  let t = cache.get(key);
  if (!t) {
    const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
    draw(c.getContext('2d')!, size);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    cache.set(key, t);
  }
  return t;
}

/** `n` bands of a / b, across (horizontal) or along the texture. */
export function stripes(a: string, b: string, n: number, horizontal: boolean): Texture {
  return make(`stripes|${a}|${b}|${n}|${horizontal}`, 128, (ctx, s) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = b;
    const w = s / n / 2;
    for (let i = 0; i < n; i++) {
      if (horizontal) ctx.fillRect(0, i * 2 * w, s, w * 0.55);
      else ctx.fillRect(i * 2 * w, 0, w * 0.55, s);
    }
  });
}

/** Flannel plaid in two colours over a base. */
export function plaid(base: string, a: string, b: string): Texture {
  return make(`plaid|${base}|${a}|${b}`, 128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = a;
    ctx.fillRect(0, s * 0.1, s, s * 0.22);
    ctx.fillRect(s * 0.1, 0, s * 0.22, s);
    ctx.fillStyle = b;
    ctx.fillRect(0, s * 0.62, s, s * 0.08);
    ctx.fillRect(s * 0.62, 0, s * 0.08, s);
  }, 3);
}

/** Patchwork quilt of the given colours, with stitch lines. */
export function patchwork(cols: readonly string[]): Texture {
  return make(`patch|${cols.join(',')}`, 256, (ctx, s) => {
    const n = 4, w = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = cols[(x * 3 + y * 5 + x * y) % cols.length];
        ctx.fillRect(x * w, y * w, w, w);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * w); ctx.lineTo(s, i * w); ctx.stroke();
    }
  }, 2);
}

/** Soft vertical gradient (tent colours with two swatches). */
export function gradient(top: string, bottom: string): Texture {
  return make(`grad|${top}|${bottom}`, 64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Scattered tiny stars over a colour (fancy tents). */
export function starry(base: string): Texture {
  return make(`stars|${base}`, 256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fff8d6';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.5 + rnd() * 0.5;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 2);
}

// ── Full-colour prints for clothes (use with a white material). Shell UVs: u runs round the
// body with the front at u = 0.25 (x = 64 on a 256 canvas, seen mirrored — keep prints
// symmetric); v runs hem (canvas bottom) → collar (canvas top).

const FRONT = 64;

/** Print id → full-colour cloth texture. */
export function printTexture(id: string): Texture | null {
  const draw = PRINTS[id];
  return draw ? make(`print|${id}`, 256, draw) : null;
}

const PRINTS: Record<string, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  // Tuxedo T-shirt: black jacket, white shirt panel, lapels, bow tie and buttons — printed on.
  tux(ctx, s) {
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.moveTo(FRONT - 26, 0); ctx.lineTo(FRONT + 26, 0); ctx.lineTo(FRONT + 10, s); ctx.lineTo(FRONT - 10, s);
    ctx.fill();
    ctx.fillStyle = '#34343e'; // lapels
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(FRONT + d * 26, 0); ctx.lineTo(FRONT + d * 42, 0); ctx.lineTo(FRONT + d * 12, s * 0.62);
      ctx.fill();
    }
    ctx.fillStyle = '#111';
    ctx.beginPath(); // bow tie
    ctx.moveTo(FRONT, 30); ctx.lineTo(FRONT - 20, 18); ctx.lineTo(FRONT - 20, 42); ctx.closePath();
    ctx.moveTo(FRONT, 30); ctx.lineTo(FRONT + 20, 18); ctx.lineTo(FRONT + 20, 42); ctx.closePath();
    ctx.fill();
    ctx.fillRect(FRONT - 5, 25, 10, 10);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(FRONT, 70 + i * 40, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d9483f'; // pocket square
    ctx.fillRect(FRONT + 44, 70, 18, 10);
  },
  // Hawaiian shirt: teal with hibiscus and monstera.
  hawaiian(ctx, s) {
    ctx.fillStyle = '#1fb5a8';
    ctx.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.fillStyle = '#2f8a4f';
      ctx.beginPath(); ctx.ellipse(x + 14, y + 10, 22, 10, rnd() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
      const x = rnd() * s, y = rnd() * s, r = 12 + rnd() * 8;
      ctx.fillStyle = i % 3 ? '#ff5d8f' : '#ffd23f';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fff4c2';
      ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  },
  // This Is Fine: a calm dark tee going up in cartoon flames from the hem.
  flames(ctx, s) {
    ctx.fillStyle = '#3b2a3a';
    ctx.fillRect(0, 0, s, s);
    for (const [col, h] of [['#e2462b', 0.62], ['#ff8a2b', 0.46], ['#ffd23f', 0.28]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, s);
      for (let x = 0; x <= s; x += 16) {
        const peak = s - s * h * (0.7 + 0.3 * Math.abs(Math.sin(x * 0.11 + h * 9)));
        ctx.quadraticCurveTo(x + 4, peak, x + 8, s - s * h * 0.35);
      }
      ctx.lineTo(s, s);
      ctx.fill();
    }
  },
  // Sigma hoodie: charcoal with a big grey howling-moon emblem on the front.
  sigma(ctx, s) {
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#8e939c';
    ctx.beginPath(); ctx.arc(FRONT, s * 0.42, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2d33';
    ctx.beginPath(); ctx.arc(FRONT + 14, s * 0.38, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8e939c';
    ctx.fillRect(FRONT - 40, s * 0.66, 80, 8);
  },
  // Drip puffer: glossy black quilting.
  puffer(ctx, s) {
    ctx.fillStyle = '#18181c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3a3a44';
    for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 8; y < s; y += 32) ctx.fillRect(0, y, s, 8);
  },
  // Hot dog suit: bun on the sides, sausage down the front, mustard zigzag.
  hotdog(ctx, s) {
    ctx.fillStyle = '#e8b36a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c0452f';
    ctx.fillRect(FRONT - 34, 0, 68, s);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let y = 0, k = 0; y <= s; y += 22, k++) ctx.lineTo(FRONT + (k % 2 ? 20 : -20), y);
    ctx.stroke();
    ctx.fillStyle = '#b8823f'; // toasty seams
    ctx.fillRect(FRONT - 40, 0, 6, s); ctx.fillRect(FRONT + 34, 0, 6, s);
  },
  // Jorts: denim with fraying at the hem.
  denim(ctx, s) {
    ctx.fillStyle = '#4a6fa8';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = -s; i < s; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke(); }
    ctx.fillStyle = '#dfe8f5';
    for (let x = 0; x < s; x += 4) ctx.fillRect(x, s - 14 - ((x * 7) % 9), 2, 14 + ((x * 7) % 9));
    ctx.fillStyle = '#e0a93a'; // stitching
    ctx.fillRect(0, 10, s, 3);
  },
  // Touch grass: a lawn you wear.
  grass(ctx, s) {
    ctx.fillStyle = '#4f9a3a';
    ctx.fillRect(0, 0, s, s);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const x = rnd() * s, y = rnd() * s;
      ctx.strokeStyle = rnd() > 0.5 ? '#7cc85a' : '#3a7f2c';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 6, y - 8 - rnd() * 6); ctx.stroke();
    }
  },
  // Business shorts: navy pinstripe.
  pinstripe(ctx, s) {
    ctx.fillStyle = '#2c3550';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c9cfdd';
    for (let x = 0; x < s; x += 12) ctx.fillRect(x, 0, 1.5, s);
  },
  // Warchief plate: riveted steel bands with gold trim and a big gold boss on the chest.
  plate(ctx, s) {
    ctx.fillStyle = '#7d8794';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      const g = ctx.createLinearGradient(0, y, 0, y + 42);
      g.addColorStop(0, '#b9c2cc'); g.addColorStop(0.55, '#7d8794'); g.addColorStop(1, '#4b535e');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, s, 40);
      ctx.fillStyle = '#c99a2e';
      ctx.fillRect(0, y + 38, s, 5);
      ctx.fillStyle = '#e8d9a8';
      for (let x = 8; x < s; x += 22) { ctx.beginPath(); ctx.arc(x, y + 6, 2.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = '#c99a2e';
    ctx.beginPath(); ctx.arc(FRONT, s * 0.4, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f1d1d';
    ctx.beginPath(); ctx.arc(FRONT, s * 0.4, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath(); ctx.arc(FRONT - 6, s * 0.4 - 6, 6, 0, Math.PI * 2); ctx.fill();
  },
  // Ninja gi: near-black wrap with a crossed collar and a knotted belt.
  gi(ctx, s) {
    ctx.fillStyle = '#1f2330';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#3a4156';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(FRONT - 40, 0); ctx.lineTo(FRONT + 16, s * 0.72);
    ctx.moveTo(FRONT + 40, 0); ctx.lineTo(FRONT - 16, s * 0.72);
    ctx.stroke();
    ctx.fillStyle = '#b8342c'; // belt
    ctx.fillRect(0, s * 0.8, s, 22);
    ctx.fillRect(FRONT - 6, s * 0.8 + 18, 12, 30);
  },
  // Stonks: navy tee with a green line going up and to the right (canvas is seen mirrored).
  stonks(ctx, s) {
    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.strokeStyle = '#3ee07a';
    ctx.lineWidth = 13;
    ctx.lineJoin = 'round';
    // Points as seen from the front: (right of centre, down); canvas x is flipped.
    const at = (dx: number, y: number): [number, number] => [FRONT - dx, y];
    ctx.beginPath();
    [[-46, 190], [-30, 150], [-14, 162], [2, 112], [16, 124], [34, 70]].forEach(([dx, y], i) =>
      (i ? ctx.lineTo(...at(dx, y)) : ctx.moveTo(...at(dx, y))));
    ctx.stroke();
    ctx.fillStyle = '#3ee07a';
    ctx.beginPath();
    ctx.moveTo(...at(46, 44)); ctx.lineTo(...at(20, 62)); ctx.lineTo(...at(44, 80));
    ctx.fill();
  },
  // Banana suit: ripe yellow with ridges and sugar spots.
  banana(ctx, s) {
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(160,110,0,0.18)';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 3, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = '#6b4a1a';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 1.5 + rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
  },
  // Watermelon rind (the melon helmet's dome): jagged dark stripes running pole to rim.
  melon(ctx, s) {
    ctx.fillStyle = '#7cc85a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#2f6e2a';
    for (let i = 0; i < 8; i++) {
      const x0 = (i / 8) * s;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      for (let y = 0; y <= s; y += 32) ctx.lineTo(x0 + ((y / 32) % 2 ? 7 : -3), y);
      for (let y = s; y >= 0; y -= 32) ctx.lineTo(x0 + 16 + ((y / 32) % 2 ? -3 : 4), y);
      ctx.fill();
    }
  },
  // Battle kilt: red tartan.
  tartan(ctx, s) {
    ctx.fillStyle = '#a3202a';
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#1b3a26';
    for (let i = 0; i < s; i += 64) { ctx.fillRect(i + 8, 0, 22, s); ctx.fillRect(0, i + 8, s, 22); }
    ctx.fillStyle = '#10182e';
    for (let i = 0; i < s; i += 64) { ctx.fillRect(i + 40, 0, 8, s); ctx.fillRect(0, i + 40, s, 8); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < s; i += 64) { ctx.fillRect(i + 54, 0, 2, s); ctx.fillRect(0, i + 54, s, 2); }
  },
  // Zoom pyjamas: sky blue with moons and stars.
  pyjama(ctx, s) {
    ctx.fillStyle = '#8fb8f0';
    ctx.fillRect(0, 0, s, s);
    for (let y = 16, row = 0; y < s; y += 40, row++) {
      for (let x = (row % 2) * 24 + 12; x < s; x += 48) {
        ctx.fillStyle = '#fff4c2';
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8fb8f0';
        ctx.beginPath(); ctx.arc(x + 5, y - 3, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 20, y + 14, 4, 4);
      }
    }
  },
};
