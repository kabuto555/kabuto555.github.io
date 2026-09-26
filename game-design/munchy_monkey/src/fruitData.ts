// Fruit/splat emoji definitions and shape generators.
// Each "fruit shape" is a 3D point cloud defined by a signed-distance-like
// generator. Points are placed on a grid and filtered to be inside the shape.

export interface FruitShape {
  name: string;
  /** Up to 8 emoji used as splat points for this shape */
  emojis: string[];
  /** Generate normalised points [-1,1] inside the shape */
  generate(density: number): SplatPoint[];
}

export interface SplatPoint {
  /** Position in [-1, 1] space */
  x: number;
  y: number;
  z: number;
  /** Which emoji to render at this point */
  emojiIndex: number;
  /** Gaussian splat scale factor (0.5–1.5) */
  scale: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Distribute emojis across points with slight clustering */
function assignEmojis(n: number, emojis: string[], rand: () => number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push(Math.floor(rand() * emojis.length));
  }
  return result;
}

/** Gaussian-splat-style scale: peaked near 1, tails toward 0.4 */
function splatScale(rand: () => number): number {
  return 0.4 + rand() * rand() * 1.1;
}

// ── Shape generators ──────────────────────────────────────────────────────────

function makeSphere(density: number, emojis: string[], seed = 1): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        if (x * x + y * y + z * z <= 1) {
          const ei = Math.floor(rand() * emojis.length);
          pts.push({ x, y, z, emojiIndex: ei, scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeBanana(density: number, emojis: string[], seed = 2): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Banana: curved cylinder — arc along y, squished in z
        const angle = (x + 1) * Math.PI * 0.6; // curve
        const cy = Math.cos(angle) * 0.7;
        const cz = Math.sin(angle) * 0.35;
        const r = (y - cy) * (y - cy) + (z - cz) * (z - cz) * 4;
        if (r < 0.18) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeApple(density: number, emojis: string[], seed = 3): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Apple: slightly flattened sphere with indent at top
        const r2 = x * x + y * y + z * z;
        const indent = Math.exp(-((x * x + z * z) / 0.04)) * 0.25 * (y > 0 ? 1 : 0);
        if (r2 + indent <= 0.95) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makePineapple(density: number, emojis: string[], seed = 4): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Pineapple: ellipsoid body + spiky top
        const r2 = x * x * 1.8 + (y + 0.1) * (y + 0.1) + z * z * 1.8;
        const topCone = x * x + z * z < 0.08 && y > 0.55 && y < 1;
        if (r2 < 0.85 || topCone) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeWatermelon(density: number, emojis: string[], seed = 5): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Watermelon: wide squashed ellipsoid
        const r2 = x * x * 0.7 + y * y * 1.4 + z * z * 0.7;
        if (r2 < 0.9) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeGrape(density: number, emojis: string[], seed = 6): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  // Cluster of small spheres arranged in a pyramid
  const centers: [number, number, number][] = [
    [-0.35, -0.5, -0.2], [0.35, -0.5, -0.2], [0, -0.5, 0.35],
    [-0.18, 0, -0.1], [0.18, 0, -0.1], [0, 0, 0.25],
    [0, 0.45, 0.05],
  ];
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        let inside = false;
        for (const [cx, cy, cz] of centers) {
          const r2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
          if (r2 < 0.08) { inside = true; break; }
        }
        if (inside) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeCoconut(density: number, emojis: string[], seed = 7): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Coconut: slightly lumpy sphere (3-lobed)
        const r = Math.sqrt(x * x + y * y + z * z);
        const theta = Math.atan2(Math.sqrt(x * x + z * z), y);
        const phi = Math.atan2(z, x);
        const bump = 1 + 0.08 * Math.cos(3 * phi) * Math.sin(theta);
        if (r < 0.82 * bump) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

function makeMango(density: number, emojis: string[], seed = 8): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        // Mango: teardrop/oval — wider at bottom, pointed top
        const yShift = y - 0.1;
        const r2 = x * x * 1.5 + yShift * yShift + z * z * 1.5;
        const taper = y > 0 ? 1 + y * 0.4 : 1;
        if (r2 * taper < 0.85) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

// ── Extra shape generators ───────────────────────────────────────────────────

/** Flat disc — good for pizza, pancake, cookie */
function makeDisc(density: number, emojis: string[], seed = 9): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        if (x * x + z * z <= 0.95 && Math.abs(y) < 0.38) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

/** Tall cylinder — good for can, cup, baguette */
function makeCylinder(density: number, emojis: string[], seed = 10): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        if (x * x + z * z <= 0.55) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

/** Rounded box — good for burger, sandwich, cake */
function makeRoundedBox(density: number, emojis: string[], seed = 11): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        const r = Math.pow(Math.abs(x), 3) + Math.pow(Math.abs(y) * 1.4, 3) + Math.pow(Math.abs(z), 3);
        if (r < 0.85) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

/** Heart shape — good for strawberry, cherry */
function makeHeart(density: number, emojis: string[], seed = 12): SplatPoint[] {
  const rand = rng(seed);
  const pts: SplatPoint[] = [];
  const step = 1 / density;
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step) {
      for (let z = -1; z <= 1; z += step) {
        const yy = y - 0.1;
        // Heart: (x²+y²-1)³ - x²y³ < 0, extruded in z
        const h = Math.pow(x * x + yy * yy - 0.8, 3) - x * x * Math.pow(yy, 3);
        if (h < 0 && Math.abs(z) < 0.55) {
          pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
        }
      }
    }
  }
  return pts;
}

// ── Stage definitions ─────────────────────────────────────────────────────────

export const FRUIT_SHAPES: FruitShape[] = [
  {
    name: 'Watermelon',
    emojis: ['🍉', '🌿', '🟢', '⚫'],
    generate: (d) => makeWatermelon(d, ['🍉', '🌿', '🟢', '⚫']),
  },
  {
    name: 'Banana Bunch',
    emojis: ['🍌', '🐒', '💛', '🌙'],
    generate: (d) => makeBanana(d, ['🍌', '🐒', '💛', '🌙']),
  },
  {
    name: 'Apple',
    emojis: ['🍎', '🍏', '🌳', '❤️'],
    generate: (d) => makeApple(d, ['🍎', '🍏', '🌳', '❤️']),
  },
  {
    name: 'Pineapple',
    emojis: ['🍍', '🌴', '💛', '🟡'],
    generate: (d) => makePineapple(d, ['🍍', '🌴', '💛', '🟡']),
  },
  {
    name: 'Grape Cluster',
    emojis: ['🍇', '🟣', '💜', '🫐'],
    generate: (d) => makeGrape(d, ['🍇', '🟣', '💜', '🫐']),
  },
  {
    name: 'Coconut',
    emojis: ['🥥', '🤎', '🏝️', '🌰'],
    generate: (d) => makeCoconut(d, ['🥥', '🤎', '🏝️', '🌰']),
  },
  {
    name: 'Mango',
    emojis: ['🥭', '🧡', '🌞', '🍊'],
    generate: (d) => makeMango(d, ['🥭', '🧡', '🌞', '🍊']),
  },
  {
    name: 'Tropical Sphere',
    emojis: ['🍑', '🍒', '🫒', '🌺', '🍓', '🫙'],
    generate: (d) => makeSphere(d, ['🍑', '🍒', '🫒', '🌺', '🍓', '🫙']),
  },
  // ── Extended food pool ──────────────────────────────────────────────────
  {
    name: 'Strawberry',
    emojis: ['🍓', '❤️', '🌸', '🔴'],
    generate: (d) => makeHeart(d, ['🍓', '❤️', '🌸', '🔴'], 20),
  },
  {
    name: 'Cherry',
    emojis: ['🍒', '❤️', '🌿', '🔴'],
    generate: (d) => makeHeart(d, ['🍒', '❤️', '🌿', '🔴'], 21),
  },
  {
    name: 'Lemon',
    emojis: ['🍋', '💛', '🟡', '✨'],
    generate: (d) => makeApple(d, ['🍋', '💛', '🟡', '✨'], 22),
  },
  {
    name: 'Orange',
    emojis: ['🍊', '🧡', '🌞', '🔶'],
    generate: (d) => makeSphere(d, ['🍊', '🧡', '🌞', '🔶'], 23),
  },
  {
    name: 'Melon',
    emojis: ['🍈', '🟢', '💚', '🌿'],
    generate: (d) => makeWatermelon(d, ['🍈', '🟢', '💚', '🌿'], 24),
  },
  {
    name: 'Peach',
    emojis: ['🍑', '🧡', '🌸', '💗'],
    generate: (d) => makeSphere(d, ['🍑', '🧡', '🌸', '💗'], 25),
  },
  {
    name: 'Pear',
    emojis: ['🍐', '💚', '🌿', '🟢'],
    generate: (d) => makeMango(d, ['🍐', '💚', '🌿', '🟢'], 26),
  },
  {
    name: 'Blueberry',
    emojis: ['🫐', '💙', '🟣', '🔵'],
    generate: (d) => makeGrape(d, ['🫐', '💙', '🟣', '🔵'], 27),
  },
  {
    name: 'Kiwi',
    emojis: ['🥝', '🟢', '💚', '🤎'],
    generate: (d) => makeDisc(d, ['🥝', '🟢', '💚', '🤎'], 28),
  },
  {
    name: 'Avocado',
    emojis: ['🥑', '💚', '🟢', '🤎'],
    generate: (d) => makeMango(d, ['🥑', '💚', '🟢', '🤎'], 29),
  },
  {
    name: 'Tomato',
    emojis: ['🍅', '🔴', '❤️', '🌿'],
    generate: (d) => makeSphere(d, ['🍅', '🔴', '❤️', '🌿'], 30),
  },
  {
    name: 'Eggplant',
    emojis: ['🍆', '💜', '🟣', '🌿'],
    generate: (d) => makeCylinder(d, ['🍆', '💜', '🟣', '🌿'], 31),
  },
  {
    name: 'Corn',
    emojis: ['🌽', '💛', '🟡', '🌿'],
    generate: (d) => makeCylinder(d, ['🌽', '💛', '🟡', '🌿'], 32),
  },
  {
    name: 'Broccoli',
    emojis: ['🥦', '💚', '🌿', '🟢'],
    generate: (d) => makeGrape(d, ['🥦', '💚', '🌿', '🟢'], 33),
  },
  {
    name: 'Carrot',
    emojis: ['🥕', '🧡', '🌿', '🔶'],
    generate: (d) => makeBanana(d, ['🥕', '🧡', '🌿', '🔶'], 34),
  },
  {
    name: 'Mushroom',
    emojis: ['🍄', '🤎', '⚪', '🌿'],
    generate: (d) => makeDisc(d, ['🍄', '🤎', '⚪', '🌿'], 35),
  },
  {
    name: 'Pizza',
    emojis: ['🍕', '🧀', '🍅', '🌿'],
    generate: (d) => makeDisc(d, ['🍕', '🧀', '🍅', '🌿'], 36),
  },
  {
    name: 'Burger',
    emojis: ['🍔', '🥬', '🧀', '🥩'],
    generate: (d) => makeRoundedBox(d, ['🍔', '🥬', '🧀', '🥩'], 37),
  },
  {
    name: 'Sushi',
    emojis: ['🍣', '🐟', '🍚', '🌊'],
    generate: (d) => makeCylinder(d, ['🍣', '🐟', '🍚', '🌊'], 38),
  },
  {
    name: 'Ramen',
    emojis: ['🍜', '🥚', '🌶️', '🍖'],
    generate: (d) => makeSphere(d, ['🍜', '🥚', '🌶️', '🍖'], 39),
  },
  {
    name: 'Taco',
    emojis: ['🌮', '🥩', '🧀', '🌶️'],
    generate: (d) => makeRoundedBox(d, ['🌮', '🥩', '🧀', '🌶️'], 40),
  },
  {
    name: 'Donut',
    emojis: ['🍩', '🍬', '🌸', '🎀'],
    generate: (d) => makeDisc(d, ['🍩', '🍬', '🌸', '🎀'], 41),
  },
  {
    name: 'Cake',
    emojis: ['🎂', '🍰', '🕯️', '🎉'],
    generate: (d) => makeRoundedBox(d, ['🎂', '🍰', '🕯️', '🎉'], 42),
  },
  {
    name: 'Cookie',
    emojis: ['🍪', '🍫', '🥛', '✨'],
    generate: (d) => makeDisc(d, ['🍪', '🍫', '🥛', '✨'], 43),
  },
  {
    name: 'Ice Cream',
    emojis: ['🍦', '🍨', '🍧', '🌈'],
    generate: (d) => makePineapple(d, ['🍦', '🍨', '🍧', '🌈'], 44),
  },
  {
    name: 'Cheese',
    emojis: ['🧀', '💛', '🐮', '🌿'],
    generate: (d) => makeRoundedBox(d, ['🧀', '💛', '🐮', '🌿'], 45),
  },
  {
    name: 'Egg',
    emojis: ['🥚', '🍳', '🐣', '⚪'],
    generate: (d) => makeApple(d, ['🥚', '🍳', '🐣', '⚪'], 46),
  },
  {
    name: 'Bread',
    emojis: ['🍞', '🥐', '🧈', '🌾'],
    generate: (d) => makeRoundedBox(d, ['🍞', '🥐', '🧈', '🌾'], 47),
  },
  {
    name: 'Popcorn',
    emojis: ['🍿', '⭐', '🎬', '💛'],
    generate: (d) => makeGrape(d, ['🍿', '⭐', '🎬', '💛'], 48),
  },
  {
    name: 'Hot Dog',
    emojis: ['🌭', '🥩', '🌿', '🔶'],
    generate: (d) => makeBanana(d, ['🌭', '🥩', '🌿', '🔶'], 49),
  },
  {
    name: 'Shrimp',
    emojis: ['🍤', '🦐', '🌊', '🧡'],
    generate: (d) => makeBanana(d, ['🍤', '🦐', '🌊', '🧡'], 50),
  },
];

/** Stage config: which shape, random axis scales, and a seed for variation */
export interface StageConfig {
  shapeIndex: number;
  /** Second shape index for combo stages */
  shapeIndexB?: number;
  /** Display name for combo (e.g. "Apple & Mango") */
  comboName?: string;
  /** Merged emoji set for HUD buttons (shapeA emojis + shapeB emojis) */
  mergedEmojis?: string[];
  /** Seed for the second shape in combo stages */
  seedB?: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  seed: number;
}

/** Generate a sequence of stages with random axis scaling (kept for compat) */
export function generateStages(count: number): StageConfig[] {
  const stages: StageConfig[] = [];
  for (let i = 0; i < count; i++) stages.push(generateInfiniteStage(i));
  return stages;
}

/**
 * Procedurally generate a single stage config for any stage number.
 *
 * Stages 0 – (N_SHAPES-1): one fruit each, cycling through every shape in order.
 * Stage N_SHAPES onwards: random 2-fruit combos, side by side.
 *
 * Fully deterministic: same stage number always gives the same result.
 */
export function generateInfiniteStage(stageNumber: number): StageConfig {
  const n = FRUIT_SHAPES.length; // 8

  // ── Single-fruit tutorial phase (stages 0 – n-1) ─────────────────────────
  if (stageNumber < n) {
    const shapeIndex = stageNumber;
    const shape = FRUIT_SHAPES[shapeIndex];
    // Light seeded variation per stage
    let s = (stageNumber * 2654435761 + 0xdeadbeef) >>> 0;
    const r = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
    return {
      shapeIndex,
      scaleX: 0.8 + r() * 0.4,
      scaleY: 0.8 + r() * 0.4,
      scaleZ: 0.8 + r() * 0.4,
      seed: Math.floor(r() * 0xffff),
    };
  }

  // ── Combo phase (stage n onwards) ────────────────────────────────────────
  // Seeded RNG from stage number
  let s = (stageNumber * 2654435761 + 0xdeadbeef) >>> 0;
  const r = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };

  // Pick 2 distinct shape indices randomly
  const shapeA = Math.floor(r() * n);
  let shapeB = Math.floor(r() * (n - 1));
  if (shapeB >= shapeA) shapeB++;

  const emojisA = FRUIT_SHAPES[shapeA].emojis.slice(0, 2);
  const emojisB = FRUIT_SHAPES[shapeB].emojis.slice(0, 2);
  const mergedEmojis = [...emojisA, ...emojisB];
  const comboName = `${FRUIT_SHAPES[shapeA].name} & ${FRUIT_SHAPES[shapeB].name}`;

  const scaleX = 0.75 + r() * 0.5;
  const scaleY = 0.75 + r() * 0.5;
  const scaleZ = 0.75 + r() * 0.5;
  const seed   = Math.floor(r() * 0xffff);
  const seedB  = Math.floor(r() * 0xffff);

  return {
    shapeIndex: shapeA,
    shapeIndexB: shapeB,
    comboName,
    mergedEmojis,          // kept for HUD emoji buttons (A emojis + B emojis)
    scaleX, scaleY, scaleZ,
    seed,
    seedB,
  };
}
