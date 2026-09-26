(function() {
  "use strict";
  const CANVAS_ASPECT = "9:19.5";
  function deriveCanvasDims() {
    const longEdge = 1704;
    const raw = CANVAS_ASPECT;
    const parts = raw.split(":");
    if (parts.length !== 2) return { width: 786, height: longEdge };
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { width: 786, height: longEdge };
    const shortEdge = Math.round(longEdge * Math.min(w, h) / Math.max(w, h));
    if (w < h) return { width: shortEdge, height: longEdge };
    return { width: longEdge, height: shortEdge };
  }
  const _dims = deriveCanvasDims();
  const GAME_WIDTH = _dims.width;
  const GAME_HEIGHT = _dims.height;
  const COLORS = {
    hemisphereSky: 15922939,
    hemisphereGround: 14081768,
    directionalLight: 16777215
  };
  class AudioAnalyser {
    constructor() {
      this.ctx = null;
      this.analyser = null;
      this.data = new Uint8Array(0);
      this.smoothEnergy = 0;
      this.beatEnvelope = 0;
      this.peakHold = 0;
    }
    // Connect to an <audio> element (call once after first user gesture)
    connect(audio) {
      if (this.ctx) return;
      try {
        this.ctx = new AudioContext();
        const source = this.ctx.createMediaElementSource(audio);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.6;
        source.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        this.data = new Uint8Array(this.analyser.frequencyBinCount);
      } catch {
      }
    }
    /** Resume AudioContext if suspended (required after user gesture on some browsers) */
    resume() {
      var _a;
      if (((_a = this.ctx) == null ? void 0 : _a.state) === "suspended") this.ctx.resume();
    }
    /**
     * Call once per frame. Updates internal state from the analyser.
     * @param dt frame delta-time in seconds
     */
    update(dt) {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(this.data);
      let sum = 0;
      let weightSum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const w = Math.max(0.1, 1 - i / (this.data.length * 0.6));
        sum += this.data[i] / 255 * w;
        weightSum += w;
      }
      const raw = sum / weightSum;
      const attackK = 1 - Math.exp(-dt * 30);
      const releaseK = 1 - Math.exp(-dt * 4);
      if (raw > this.smoothEnergy) {
        this.smoothEnergy += (raw - this.smoothEnergy) * attackK;
      } else {
        this.smoothEnergy += (raw - this.smoothEnergy) * releaseK;
      }
      const transient = Math.max(0, raw - this.smoothEnergy * 0.7);
      if (transient > this.peakHold) {
        this.peakHold = transient;
        this.beatEnvelope = Math.min(1, transient * 3.5);
      }
      this.peakHold *= Math.exp(-dt * 8);
      this.beatEnvelope *= Math.exp(-dt * 12);
    }
    /** Smoothed amplitude energy, 0–1. Good for continuous pulse. */
    getEnergy() {
      return this.smoothEnergy;
    }
    /** Transient beat envelope, 0–1. Punches on hits, decays quickly. */
    getBeat() {
      return this.beatEnvelope;
    }
  }
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO = 1.5;
  function hasCoarsePointer() {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }
  function resolveDevicePixelRatio() {
    const cap = hasCoarsePointer() ? COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO : MAX_DEVICE_PIXEL_RATIO;
    return Math.min(window.devicePixelRatio || 1, cap);
  }
  function configureRenderer(renderer2) {
    renderer2.setPixelRatio(resolveDevicePixelRatio());
    renderer2.shadowMap.enabled = true;
    renderer2.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  function observeContainerResize(container2, renderer2, camera2) {
    let pendingFrame = null;
    function applyResize() {
      pendingFrame = null;
      const width = container2.clientWidth;
      const height = container2.clientHeight;
      if (width <= 0 || height <= 0) return;
      renderer2.setPixelRatio(resolveDevicePixelRatio());
      renderer2.setSize(width, height, false);
      camera2.aspect = width / height;
      camera2.updateProjectionMatrix();
    }
    function scheduleResize() {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(applyResize);
    }
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(container2);
    applyResize();
    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    };
  }
  function createLightingRig(scene2, frustumSize = 6) {
    const hemisphereLight = new THREE.HemisphereLight(
      COLORS.hemisphereSky,
      COLORS.hemisphereGround,
      0.9
    );
    scene2.add(hemisphereLight);
    const directionalLight = new THREE.DirectionalLight(COLORS.directionalLight, 1.4);
    directionalLight.position.set(4, 6, 3);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.camera.left = -frustumSize;
    directionalLight.shadow.camera.right = frustumSize;
    directionalLight.shadow.camera.top = frustumSize;
    directionalLight.shadow.camera.bottom = -frustumSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.bias = -5e-4;
    scene2.add(directionalLight);
    scene2.add(directionalLight.target);
    return { hemisphereLight, directionalLight };
  }
  const STYLE_TAG_ID = "__game-boot-gesture-hardening-styles";
  const REQUIRED_VIEWPORT_TOKENS = {
    "maximum-scale": "1.0",
    "user-scalable": "no",
    "viewport-fit": "cover"
  };
  function hardenViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    const parts = /* @__PURE__ */ new Map();
    for (const pair of meta.content.split(",")) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key) parts.set(key, value ?? "");
    }
    if (!parts.has("width")) parts.set("width", "device-width");
    if (!parts.has("initial-scale")) parts.set("initial-scale", "1.0");
    for (const [key, value] of Object.entries(REQUIRED_VIEWPORT_TOKENS)) {
      parts.set(key, value);
    }
    meta.content = Array.from(parts.entries()).map(([key, value]) => value ? `${key}=${value}` : key).join(", ");
  }
  function hardenGestures() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_TAG_ID;
    style.textContent = `
    html, body {
      touch-action: pan-x pan-y;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior: none;
    }
    :where(input, textarea) {
      user-select: text;
      -webkit-user-select: text;
      -webkit-touch-callout: default;
    }
  `;
    document.head.appendChild(style);
  }
  function rng(seed) {
    let s = seed;
    return () => {
      s = s * 1664525 + 1013904223 & 4294967295;
      return (s >>> 0) / 4294967295;
    };
  }
  function splatScale(rand) {
    return 0.4 + rand() * rand() * 1.1;
  }
  function makeSphere(density, emojis, seed = 1) {
    const rand = rng(seed);
    const pts = [];
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
  function makeBanana(density, emojis, seed = 2) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
          const angle = (x + 1) * Math.PI * 0.6;
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
  function makeApple(density, emojis, seed = 3) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
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
  function makePineapple(density, emojis, seed = 4) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
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
  function makeWatermelon(density, emojis, seed = 5) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
          const r2 = x * x * 0.7 + y * y * 1.4 + z * z * 0.7;
          if (r2 < 0.9) {
            pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
          }
        }
      }
    }
    return pts;
  }
  function makeGrape(density, emojis, seed = 6) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    const centers = [
      [-0.35, -0.5, -0.2],
      [0.35, -0.5, -0.2],
      [0, -0.5, 0.35],
      [-0.18, 0, -0.1],
      [0.18, 0, -0.1],
      [0, 0, 0.25],
      [0, 0.45, 0.05]
    ];
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
          let inside = false;
          for (const [cx, cy, cz] of centers) {
            const r2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
            if (r2 < 0.08) {
              inside = true;
              break;
            }
          }
          if (inside) {
            pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
          }
        }
      }
    }
    return pts;
  }
  function makeCoconut(density, emojis, seed = 7) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
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
  function makeMango(density, emojis, seed = 8) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
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
  function makeDisc(density, emojis, seed = 9) {
    const rand = rng(seed);
    const pts = [];
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
  function makeCylinder(density, emojis, seed = 10) {
    const rand = rng(seed);
    const pts = [];
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
  function makeRoundedBox(density, emojis, seed = 11) {
    const rand = rng(seed);
    const pts = [];
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
  function makeHeart(density, emojis, seed = 12) {
    const rand = rng(seed);
    const pts = [];
    const step = 1 / density;
    for (let x = -1; x <= 1; x += step) {
      for (let y = -1; y <= 1; y += step) {
        for (let z = -1; z <= 1; z += step) {
          const yy = y - 0.1;
          const h = Math.pow(x * x + yy * yy - 0.8, 3) - x * x * Math.pow(yy, 3);
          if (h < 0 && Math.abs(z) < 0.55) {
            pts.push({ x, y, z, emojiIndex: Math.floor(rand() * emojis.length), scale: splatScale(rand) });
          }
        }
      }
    }
    return pts;
  }
  const FRUIT_SHAPES = [
    {
      name: "Watermelon",
      emojis: ["🍉", "🌿", "🟢", "⚫"],
      generate: (d) => makeWatermelon(d, ["🍉", "🌿", "🟢", "⚫"])
    },
    {
      name: "Banana Bunch",
      emojis: ["🍌", "🐒", "💛", "🌙"],
      generate: (d) => makeBanana(d, ["🍌", "🐒", "💛", "🌙"])
    },
    {
      name: "Apple",
      emojis: ["🍎", "🍏", "🌳", "❤️"],
      generate: (d) => makeApple(d, ["🍎", "🍏", "🌳", "❤️"])
    },
    {
      name: "Pineapple",
      emojis: ["🍍", "🌴", "💛", "🟡"],
      generate: (d) => makePineapple(d, ["🍍", "🌴", "💛", "🟡"])
    },
    {
      name: "Grape Cluster",
      emojis: ["🍇", "🟣", "💜", "🫐"],
      generate: (d) => makeGrape(d, ["🍇", "🟣", "💜", "🫐"])
    },
    {
      name: "Coconut",
      emojis: ["🥥", "🤎", "🏝️", "🌰"],
      generate: (d) => makeCoconut(d, ["🥥", "🤎", "🏝️", "🌰"])
    },
    {
      name: "Mango",
      emojis: ["🥭", "🧡", "🌞", "🍊"],
      generate: (d) => makeMango(d, ["🥭", "🧡", "🌞", "🍊"])
    },
    {
      name: "Tropical Sphere",
      emojis: ["🍑", "🍒", "🫒", "🌺", "🍓", "🫙"],
      generate: (d) => makeSphere(d, ["🍑", "🍒", "🫒", "🌺", "🍓", "🫙"])
    },
    // ── Extended food pool ──────────────────────────────────────────────────
    {
      name: "Strawberry",
      emojis: ["🍓", "❤️", "🌸", "🔴"],
      generate: (d) => makeHeart(d, ["🍓", "❤️", "🌸", "🔴"], 20)
    },
    {
      name: "Cherry",
      emojis: ["🍒", "❤️", "🌿", "🔴"],
      generate: (d) => makeHeart(d, ["🍒", "❤️", "🌿", "🔴"], 21)
    },
    {
      name: "Lemon",
      emojis: ["🍋", "💛", "🟡", "✨"],
      generate: (d) => makeApple(d, ["🍋", "💛", "🟡", "✨"], 22)
    },
    {
      name: "Orange",
      emojis: ["🍊", "🧡", "🌞", "🔶"],
      generate: (d) => makeSphere(d, ["🍊", "🧡", "🌞", "🔶"], 23)
    },
    {
      name: "Melon",
      emojis: ["🍈", "🟢", "💚", "🌿"],
      generate: (d) => makeWatermelon(d, ["🍈", "🟢", "💚", "🌿"], 24)
    },
    {
      name: "Peach",
      emojis: ["🍑", "🧡", "🌸", "💗"],
      generate: (d) => makeSphere(d, ["🍑", "🧡", "🌸", "💗"], 25)
    },
    {
      name: "Pear",
      emojis: ["🍐", "💚", "🌿", "🟢"],
      generate: (d) => makeMango(d, ["🍐", "💚", "🌿", "🟢"], 26)
    },
    {
      name: "Blueberry",
      emojis: ["🫐", "💙", "🟣", "🔵"],
      generate: (d) => makeGrape(d, ["🫐", "💙", "🟣", "🔵"], 27)
    },
    {
      name: "Kiwi",
      emojis: ["🥝", "🟢", "💚", "🤎"],
      generate: (d) => makeDisc(d, ["🥝", "🟢", "💚", "🤎"], 28)
    },
    {
      name: "Avocado",
      emojis: ["🥑", "💚", "🟢", "🤎"],
      generate: (d) => makeMango(d, ["🥑", "💚", "🟢", "🤎"], 29)
    },
    {
      name: "Tomato",
      emojis: ["🍅", "🔴", "❤️", "🌿"],
      generate: (d) => makeSphere(d, ["🍅", "🔴", "❤️", "🌿"], 30)
    },
    {
      name: "Eggplant",
      emojis: ["🍆", "💜", "🟣", "🌿"],
      generate: (d) => makeCylinder(d, ["🍆", "💜", "🟣", "🌿"], 31)
    },
    {
      name: "Corn",
      emojis: ["🌽", "💛", "🟡", "🌿"],
      generate: (d) => makeCylinder(d, ["🌽", "💛", "🟡", "🌿"], 32)
    },
    {
      name: "Broccoli",
      emojis: ["🥦", "💚", "🌿", "🟢"],
      generate: (d) => makeGrape(d, ["🥦", "💚", "🌿", "🟢"], 33)
    },
    {
      name: "Carrot",
      emojis: ["🥕", "🧡", "🌿", "🔶"],
      generate: (d) => makeBanana(d, ["🥕", "🧡", "🌿", "🔶"], 34)
    },
    {
      name: "Mushroom",
      emojis: ["🍄", "🤎", "⚪", "🌿"],
      generate: (d) => makeDisc(d, ["🍄", "🤎", "⚪", "🌿"], 35)
    },
    {
      name: "Pizza",
      emojis: ["🍕", "🧀", "🍅", "🌿"],
      generate: (d) => makeDisc(d, ["🍕", "🧀", "🍅", "🌿"], 36)
    },
    {
      name: "Burger",
      emojis: ["🍔", "🥬", "🧀", "🥩"],
      generate: (d) => makeRoundedBox(d, ["🍔", "🥬", "🧀", "🥩"], 37)
    },
    {
      name: "Sushi",
      emojis: ["🍣", "🐟", "🍚", "🌊"],
      generate: (d) => makeCylinder(d, ["🍣", "🐟", "🍚", "🌊"], 38)
    },
    {
      name: "Ramen",
      emojis: ["🍜", "🥚", "🌶️", "🍖"],
      generate: (d) => makeSphere(d, ["🍜", "🥚", "🌶️", "🍖"], 39)
    },
    {
      name: "Taco",
      emojis: ["🌮", "🥩", "🧀", "🌶️"],
      generate: (d) => makeRoundedBox(d, ["🌮", "🥩", "🧀", "🌶️"], 40)
    },
    {
      name: "Donut",
      emojis: ["🍩", "🍬", "🌸", "🎀"],
      generate: (d) => makeDisc(d, ["🍩", "🍬", "🌸", "🎀"], 41)
    },
    {
      name: "Cake",
      emojis: ["🎂", "🍰", "🕯️", "🎉"],
      generate: (d) => makeRoundedBox(d, ["🎂", "🍰", "🕯️", "🎉"], 42)
    },
    {
      name: "Cookie",
      emojis: ["🍪", "🍫", "🥛", "✨"],
      generate: (d) => makeDisc(d, ["🍪", "🍫", "🥛", "✨"], 43)
    },
    {
      name: "Ice Cream",
      emojis: ["🍦", "🍨", "🍧", "🌈"],
      generate: (d) => makePineapple(d, ["🍦", "🍨", "🍧", "🌈"], 44)
    },
    {
      name: "Cheese",
      emojis: ["🧀", "💛", "🐮", "🌿"],
      generate: (d) => makeRoundedBox(d, ["🧀", "💛", "🐮", "🌿"], 45)
    },
    {
      name: "Egg",
      emojis: ["🥚", "🍳", "🐣", "⚪"],
      generate: (d) => makeApple(d, ["🥚", "🍳", "🐣", "⚪"], 46)
    },
    {
      name: "Bread",
      emojis: ["🍞", "🥐", "🧈", "🌾"],
      generate: (d) => makeRoundedBox(d, ["🍞", "🥐", "🧈", "🌾"], 47)
    },
    {
      name: "Popcorn",
      emojis: ["🍿", "⭐", "🎬", "💛"],
      generate: (d) => makeGrape(d, ["🍿", "⭐", "🎬", "💛"], 48)
    },
    {
      name: "Hot Dog",
      emojis: ["🌭", "🥩", "🌿", "🔶"],
      generate: (d) => makeBanana(d, ["🌭", "🥩", "🌿", "🔶"], 49)
    },
    {
      name: "Shrimp",
      emojis: ["🍤", "🦐", "🌊", "🧡"],
      generate: (d) => makeBanana(d, ["🍤", "🦐", "🌊", "🧡"], 50)
    }
  ];
  function generateInfiniteStage(stageNumber) {
    const n = FRUIT_SHAPES.length;
    if (stageNumber < n) {
      const shapeIndex = stageNumber;
      let s2 = stageNumber * 2654435761 + 3735928559 >>> 0;
      const r2 = () => {
        s2 = s2 * 1664525 + 1013904223 & 4294967295;
        return (s2 >>> 0) / 4294967295;
      };
      return {
        shapeIndex,
        scaleX: 0.8 + r2() * 0.4,
        scaleY: 0.8 + r2() * 0.4,
        scaleZ: 0.8 + r2() * 0.4,
        seed: Math.floor(r2() * 65535)
      };
    }
    let s = stageNumber * 2654435761 + 3735928559 >>> 0;
    const r = () => {
      s = s * 1664525 + 1013904223 & 4294967295;
      return (s >>> 0) / 4294967295;
    };
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
    const seed = Math.floor(r() * 65535);
    const seedB = Math.floor(r() * 65535);
    return {
      shapeIndex: shapeA,
      shapeIndexB: shapeB,
      comboName,
      mergedEmojis,
      // kept for HUD emoji buttons (A emojis + B emojis)
      scaleX,
      scaleY,
      scaleZ,
      seed,
      seedB
    };
  }
  const STAR_COUNT = 3;
  const BOMB_COUNT = 1;
  const EXTRABITES_COUNT = 1;
  const STAR_EMOJI = "⭐";
  const BOMB_EMOJI = "💣";
  const EXTRABITES_EMOJI = "🐵";
  const REVEAL_RADIUS = 0.22;
  const REVEAL_MAX_BLOCKERS = 3;
  const _SplatObject = class _SplatObject {
    constructor(shape, config, canvasEl) {
      this.sprites = [];
      this.textures = /* @__PURE__ */ new Map();
      this.isDragging = false;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.angularVelX = 0;
      this.angularVelY = 0;
      this._orientation = new THREE.Quaternion();
      this._qTmp = new THREE.Quaternion();
      this.dragCallback = null;
      this.starsFoundCount = 0;
      this.itemCallback = null;
      this.blastCallback = null;
      this.bombStarCallback = null;
      this.danceEnergy = 0;
      this.danceTime = 0;
      this._starsTotal = STAR_COUNT;
      this._peelEntries = null;
      this._onPointerDown = (e) => {
        const rect = this.canvasEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
        this.isDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.angularVelX = 0;
        this.angularVelY = 0;
        this._orientation.copy(this.group.quaternion);
        this.canvasEl.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      this._onPointerMove = (e) => {
        var _a;
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        const sensitivity = 7e-3;
        this._qTmp.setFromAxisAngle(_SplatObject._WORLD_UP, dx * sensitivity);
        this._orientation.premultiply(this._qTmp);
        this._qTmp.setFromAxisAngle(_SplatObject._WORLD_RIGHT, dy * sensitivity);
        this._orientation.premultiply(this._qTmp);
        this.group.quaternion.copy(this._orientation);
        this.angularVelY = dx * sensitivity * 60;
        this.angularVelX = dy * sensitivity * 60;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        (_a = this.dragCallback) == null ? void 0 : _a.call(this, this.group.rotation.x, this.group.rotation.y, true);
        e.preventDefault();
      };
      this._onPointerUp = (e) => {
        var _a;
        if (!this.isDragging) return;
        this.isDragging = false;
        (_a = this.dragCallback) == null ? void 0 : _a.call(this, this.group.rotation.x, this.group.rotation.y, false);
        e.preventDefault();
      };
      this.shape = shape;
      this.config = config;
      this.canvasEl = canvasEl;
      this.emojis = config.mergedEmojis ?? shape.emojis;
      this.danceGroup = new THREE.Group();
      this.group = new THREE.Group();
      this.group.scale.set(config.scaleX, config.scaleY, config.scaleZ);
      this.danceGroup.add(this.group);
      this._buildTextures();
      this._buildSprites();
      this._bindInput();
    }
    /** Register callback for bomb/extrabites triggers */
    onItem(cb) {
      this.itemCallback = cb;
    }
    /** Register callback for stars revealed by an in-stage bomb (separate doober) */
    onBombStar(cb) {
      this.bombStarCallback = cb;
    }
    /** Register callback fired per-sprite when a bomb blasts (for particle FX) */
    onBlast(cb) {
      this.blastCallback = cb;
    }
    /** Feed real-time beat energy (0–1) each frame for dance animation */
    setDanceEnergy(e) {
      this.danceEnergy = e;
    }
    /** Register a callback invoked whenever the fruit rotates */
    onDrag(cb) {
      this.dragCallback = cb;
    }
    // ── Textures ─────────────────────────────────────────────────────────────────
    _buildTextures() {
      const allEmojis = [...this.emojis, STAR_EMOJI, BOMB_EMOJI, EXTRABITES_EMOJI];
      for (const emoji of allEmojis) {
        if (this.textures.has(emoji)) continue;
        const size = 128;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        ctx.font = `${size * 0.8}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, size / 2, size / 2);
        const tex = new THREE.CanvasTexture(c);
        this.textures.set(emoji, tex);
      }
    }
    // ── Sprite construction ───────────────────────────────────────────────────────
    _buildSprites() {
      const isCombo = this.config.shapeIndexB !== void 0;
      if (isCombo) {
        this._buildComboSprites();
      } else {
        const placed = this._buildSingleSprites(this.shape, this.shape.emojis, this.config.seed, 0);
        this._starsTotal = placed;
      }
    }
    /** Build a single-shape sprite cloud offset by xOffset in local space */
    /** Returns the number of stars actually placed. */
    _buildSingleSprites(shape, emojis, seed, xOffset, starCount = STAR_COUNT, bombCount = BOMB_COUNT, extraBitesCount = EXTRABITES_COUNT, emojiIndexOffset = 0) {
      const rawPts = shape.generate(6);
      let s = (seed ^ 11259375) >>> 0;
      const rng2 = () => {
        s = s * 1664525 + 1013904223 & 4294967295;
        return (s >>> 0) / 4294967295;
      };
      const lo = Math.floor(rawPts.length * 0.15);
      const hi = Math.floor(rawPts.length * 0.85);
      const specialIndices = /* @__PURE__ */ new Map();
      const totalSpecial = starCount + bombCount + extraBitesCount;
      let attempts = 0;
      while (specialIndices.size < totalSpecial && attempts < 1e3) {
        const idx = lo + Math.floor(rng2() * (hi - lo));
        if (!specialIndices.has(idx)) {
          const count = specialIndices.size;
          if (count < starCount) specialIndices.set(idx, "star");
          else if (count < starCount + bombCount) specialIndices.set(idx, "bomb");
          else specialIndices.set(idx, "extrabites");
        }
        attempts++;
      }
      const emojiForType = {
        star: STAR_EMOJI,
        bomb: BOMB_EMOJI,
        extrabites: EXTRABITES_EMOJI
      };
      const sizeForType = {
        star: 0.3,
        bomb: 0.28,
        extrabites: 0.28
      };
      for (let i = 0; i < rawPts.length; i++) {
        const pt = rawPts[i];
        const itemType = specialIndices.get(i) ?? null;
        const isItem = itemType !== null;
        const localIdx = pt.emojiIndex % emojis.length;
        const mergedIdx = localIdx + emojiIndexOffset;
        const emoji = isItem ? emojiForType[itemType] : emojis[localIdx];
        const tex = this.textures.get(emoji);
        const size = isItem ? sizeForType[itemType] : 0.22 * pt.scale;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(size, size, 1);
        sprite.position.set(pt.x + xOffset, pt.y, pt.z);
        this.group.add(sprite);
        const mergedPt = { ...pt, x: pt.x + xOffset, emojiIndex: isItem ? pt.emojiIndex : mergedIdx };
        this.sprites.push({ sprite, point: mergedPt, eaten: false, itemType, revealed: false });
      }
      let placed = 0;
      for (const [, t] of specialIndices) if (t === "star") placed++;
      return placed;
    }
    /** Build two side-by-side shapes for combo stages */
    _buildComboSprites() {
      const cfg = this.config;
      const shapeA = FRUIT_SHAPES[cfg.shapeIndex];
      const shapeB = FRUIT_SHAPES[cfg.shapeIndexB];
      const emojisA = shapeA.emojis.slice(0, 2);
      const emojisB = shapeB.emojis.slice(0, 2);
      const placedA = this._buildSingleSprites(shapeA, emojisA, cfg.seed, -0.72, 2, 1, 0, 0);
      const placedB = this._buildSingleSprites(shapeB, emojisB, cfg.seedB ?? 0, 0.72, 1, 0, 1, 2);
      this._starsTotal = placedA + placedB;
    }
    // ── Queries ───────────────────────────────────────────────────────────────────
    /** Non-eaten, non-item sprites remaining */
    get totalRemaining() {
      return this.sprites.filter((s) => !s.eaten && !s.itemType).length;
    }
    get totalCount() {
      return this.sprites.filter((s) => !s.itemType).length;
    }
    get starsRevealed() {
      return this.starsFoundCount;
    }
    get starsTotal() {
      return this._starsTotal;
    }
    /** A random world position on the visible (front-facing) surface of the fruit */
    getRandomSurfaceWorldPos() {
      const alive = this.sprites.filter((ss) => !ss.eaten && !ss.itemType);
      if (alive.length === 0) return this.group.getWorldPosition(new THREE.Vector3());
      const withZ = alive.map((ss) => ({ ss, z: this._worldZ(ss) }));
      withZ.sort((a, b) => b.z - a.z);
      const front = withZ.slice(0, Math.max(1, Math.floor(withZ.length * 0.25)));
      const pick = front[Math.floor(Math.random() * front.length)];
      return pick.ss.sprite.getWorldPosition(new THREE.Vector3());
    }
    /** World position of the most recently revealed star (for doober origin) */
    getLastRevealedStarWorldPos() {
      for (let i = this.sprites.length - 1; i >= 0; i--) {
        const ss = this.sprites[i];
        if (ss.itemType === "star" && ss.revealed) {
          return ss.sprite.getWorldPosition(new THREE.Vector3());
        }
      }
      return null;
    }
    /**
     * Get the world-space Z of a sprite (higher = closer to camera at Z=+inf).
     * We use the sprite's world position Z directly — camera is at positive Z
     * looking toward origin, so higher worldZ = closer to camera.
     */
    _worldZ(ss) {
      return ss.sprite.getWorldPosition(new THREE.Vector3()).z;
    }
    // ── Power-up methods ──────────────────────────────────────────────────────────
    /**
     * Progressive banana peel: eat front-layer sprites whose world-Y >= worldYThreshold.
     * Fires blastCallback (peel scatter) for each. Returns newly revealed star count.
     * Called repeatedly as the banana overlay descends.
     */
    /**
     * Pre-calculate the true outer surface shell: for each X/Y grid cell,
     * pick the sprite with the highest world-Z (closest to camera).
     * Stores world positions alongside each sprite so per-frame calls are cheap.
     * Call once before starting the animation.
     */
    preparePeelLayer(camera2, canvasRect) {
      this._peelEntries = [];
      const alive = this.sprites.filter((ss) => !ss.eaten && !ss.itemType);
      if (alive.length === 0) return;
      const toScreenY = (wp) => {
        const ndc = wp.clone().project(camera2);
        return canvasRect.top + (-ndc.y * 0.5 + 0.5) * canvasRect.height;
      };
      const CELL = 0.18;
      const LAYERS = 2;
      const buckets = /* @__PURE__ */ new Map();
      for (const ss of alive) {
        const lp = ss.sprite.position;
        const cx = Math.round(lp.x / CELL);
        const cy = Math.round(lp.y / CELL);
        const key = `${cx},${cy}`;
        const wp = ss.sprite.getWorldPosition(new THREE.Vector3());
        const list = buckets.get(key) ?? [];
        list.push({ ss, worldZ: wp.z, worldPos: wp, screenY: toScreenY(wp) });
        buckets.set(key, list);
      }
      const entries = [];
      for (const list of buckets.values()) {
        list.sort((a, b) => b.worldZ - a.worldZ);
        entries.push(...list.slice(0, LAYERS));
      }
      this._peelEntries = entries.sort((a, b) => a.screenY - b.screenY);
    }
    /**
     * Called each frame during the banana animation.
     * Eats pre-calculated outer-layer sprites whose screen-Y <= bananaScreenY
     * (i.e. the banana overlay has reached or passed the sprite on screen).
     */
    /**
     * Called each frame during the banana animation.
     * When the banana's bottom edge (bananaScreenY) reaches a tracked sprite's
     * screen-Y, marks it eaten and hands the sprite to peelCallback so the
     * caller can animate it flying away. The sprite is NOT hidden here —
     * the callback takes ownership and removes it from the group.
     */
    eatBananaLayerAtScreenY(bananaScreenY, peelCallback) {
      if (!this._peelEntries) return 0;
      let ate = false;
      for (const entry of this._peelEntries) {
        if (entry.ss.eaten) continue;
        if (entry.screenY > bananaScreenY) continue;
        entry.ss.eaten = true;
        const liveWorldPos = entry.ss.sprite.getWorldPosition(new THREE.Vector3());
        peelCallback(entry.ss.sprite, liveWorldPos);
        ate = true;
      }
      return ate ? this._checkItemReveal() : 0;
    }
    /** Clear the cached peel layer after the animation completes */
    clearPeelCache() {
      this._peelEntries = null;
    }
    /**
     * Banana Peel: eat only the very outermost shell of ALL emoji types at once.
     * Shallow depth (0.20) so it just skims the surface, not a deep clear.
     * Returns stars newly revealed.
     */
    eatBananaLayer() {
      const all = this.sprites.filter((ss) => !ss.eaten && !ss.itemType);
      if (all.length === 0) return 0;
      const worldZs = all.map((ss) => this._worldZ(ss));
      const maxZ = Math.max(...worldZs);
      const PEEL_DEPTH = 0.2;
      for (let i = 0; i < all.length; i++) {
        if (worldZs[i] >= maxZ - PEEL_DEPTH) {
          all[i].eaten = true;
          all[i].sprite.visible = false;
        }
      }
      return this._checkItemReveal();
    }
    /**
     * X-Ray: set all regular emoji sprites to half opacity.
     * Stars/items stay full opacity so they stand out.
     */
    setXRay(active) {
      for (const ss of this.sprites) {
        if (ss.eaten || ss.itemType) continue;
        ss.sprite.material.opacity = active ? 0.6 : 1;
      }
    }
    /**
     * Mega bomb: blast a large radius from the fruit centre.
     * Fires blastCallback for each hit sprite (particle FX).
     * Returns stars newly revealed.
     */
    triggerMegaBomb(worldImpact) {
      const MEGA_RADIUS = 0.55;
      const worldEpi = worldImpact ?? this.group.getWorldPosition(new THREE.Vector3());
      const localImpact = worldImpact ? this.group.worldToLocal(worldImpact.clone()) : new THREE.Vector3(0, 0, 0);
      for (const ss of this.sprites) {
        if (ss.eaten || ss.itemType) continue;
        if (ss.sprite.position.distanceTo(localImpact) < MEGA_RADIUS) {
          ss.eaten = true;
          ss.sprite.visible = false;
          if (this.blastCallback) {
            const wp = ss.sprite.getWorldPosition(new THREE.Vector3());
            const tex = ss.sprite.material.map;
            this.blastCallback(wp, worldEpi, tex, ss.sprite.scale.x);
          }
        }
      }
      return this._checkItemReveal();
    }
    /**
     * Frenzy spin: apply random rotation delta each frame during frenzy.
     * Call from update loop while frenzy is active.
     */
    applyFrenzySpin(dt) {
      this.group.rotation.y += (Math.random() - 0.5) * 14 * dt;
      this.group.rotation.x += (Math.random() - 0.5) * 10 * dt;
      this.group.rotation.z += (Math.random() - 0.5) * 6 * dt;
    }
    /** Count uneaten regular sprites for a given emoji index */
    getEmojiCount(emojiIndex) {
      return this.sprites.filter(
        (ss) => !ss.eaten && !ss.itemType && ss.point.emojiIndex === emojiIndex
      ).length;
    }
    /** Returns emoji indices that have at least one uneaten regular sprite */
    getVisibleEmojiIndices() {
      const visible = /* @__PURE__ */ new Set();
      for (const ss of this.sprites) {
        if (!ss.eaten && !ss.itemType) visible.add(ss.point.emojiIndex);
      }
      return visible;
    }
    /**
     * Eat the front-most layer of regular (non-item) sprites matching emojiIndex.
     * Uses world-space Z depth peeling: each press removes the closest shell.
     * Returns { eaten, newStars } counts.
     */
    /**
     * Eat the front-most layer of regular (non-item) sprites matching emojiIndex.
     * Marks sprites eaten and returns them (with live world positions) so the
     * caller can animate them flying into the monkey's mouth instead of popping.
     */
    eatEmoji(emojiIndex) {
      const candidates = this.sprites.filter(
        (ss) => !ss.eaten && !ss.itemType && ss.point.emojiIndex === emojiIndex
      );
      if (candidates.length === 0) return { eaten: 0, newStars: 0, eatSprites: [] };
      const worldZs = candidates.map((ss) => this._worldZ(ss));
      const maxZ = Math.max(...worldZs);
      const LAYER_DEPTH = 0.45;
      const eatSprites = [];
      for (let i = 0; i < candidates.length; i++) {
        if (worldZs[i] >= maxZ - LAYER_DEPTH) {
          candidates[i].eaten = true;
          eatSprites.push({ sprite: candidates[i].sprite });
        }
      }
      const newStars = this._checkItemReveal();
      return { eaten: eatSprites.length, newStars, eatSprites };
    }
    /**
     * After eating, check each unrevealed item/star.
     * Revealed when ≤ REVEAL_MAX_BLOCKERS regular (non-item) neighbours
     * remain within REVEAL_RADIUS. Stars count toward win; bomb/extrabites
     * trigger their effect immediately via itemCallback.
     * Returns count of newly revealed stars.
     */
    _checkItemReveal() {
      var _a, _b, _c;
      let newStars = 0;
      for (const ss of this.sprites) {
        if (!ss.itemType || ss.revealed) continue;
        let blockers = 0;
        for (const other of this.sprites) {
          if (other.eaten || other.itemType) continue;
          if (ss.sprite.position.distanceTo(other.sprite.position) < REVEAL_RADIUS) blockers++;
        }
        if (blockers > REVEAL_MAX_BLOCKERS) continue;
        ss.revealed = true;
        if (ss.itemType === "star") {
          this.starsFoundCount++;
          newStars++;
          ss.sprite.visible = false;
        } else if (ss.itemType === "bomb") {
          const BOMB_RADIUS = 0.55;
          const epicentre = ss.sprite.getWorldPosition(new THREE.Vector3());
          let blasted = 0;
          for (const other of this.sprites) {
            if (other.eaten || other.itemType) continue;
            if (ss.sprite.position.distanceTo(other.sprite.position) < BOMB_RADIUS) {
              other.eaten = true;
              other.sprite.visible = false;
              if (this.blastCallback) {
                const worldPos = other.sprite.getWorldPosition(new THREE.Vector3());
                const tex = other.sprite.material.map;
                const size = other.sprite.scale.x;
                this.blastCallback(worldPos, epicentre, tex, size);
              }
              blasted++;
            }
          }
          ss.sprite.visible = false;
          (_a = this.itemCallback) == null ? void 0 : _a.call(this, "bomb", blasted);
          const bombStars = this._checkItemReveal();
          if (bombStars > 0) (_b = this.bombStarCallback) == null ? void 0 : _b.call(this, bombStars);
        } else if (ss.itemType === "extrabites") {
          ss.sprite.visible = false;
          (_c = this.itemCallback) == null ? void 0 : _c.call(this, "extrabites");
        }
      }
      return newStars;
    }
    update(dt) {
      this.danceTime += dt;
      if (!this.isDragging) {
        this.angularVelX *= Math.exp(-3 * dt);
        this.angularVelY *= Math.exp(-3 * dt);
        if (Math.abs(this.angularVelY) > 1e-3) {
          this._qTmp.setFromAxisAngle(_SplatObject._WORLD_UP, this.angularVelY * dt);
          this._orientation.premultiply(this._qTmp);
        }
        if (Math.abs(this.angularVelX) > 1e-3) {
          this._qTmp.setFromAxisAngle(_SplatObject._WORLD_RIGHT, this.angularVelX * dt);
          this._orientation.premultiply(this._qTmp);
        }
        this.group.quaternion.copy(this._orientation);
      }
      const e = this.danceEnergy;
      const pulse = 1 + e * 0.18;
      this.danceGroup.scale.setScalar(pulse);
      this.danceGroup.rotation.y = Math.sin(this.danceTime * 2.1) * 0.08 * (1 + e * 2.5);
      this.danceGroup.rotation.z = Math.sin(this.danceTime * 1.7) * 0.05 * (1 + e * 2);
      const spritePulse = 0.85 + 0.15 * Math.sin(Date.now() * 6e-3);
      for (const ss of this.sprites) {
        if (ss.itemType === "star" && !ss.revealed) {
          ss.sprite.scale.setScalar(0.3 * spritePulse);
        } else if (ss.itemType && !ss.revealed && !ss.eaten) {
          ss.sprite.scale.setScalar(0.28 * (0.9 + 0.1 * Math.sin(Date.now() * 5e-3)));
        }
      }
    }
    dispose() {
      this._unbindInput();
      for (const ss of this.sprites) {
        ss.sprite.material.dispose();
      }
      this.itemCallback = null;
      this.blastCallback = null;
      this.bombStarCallback = null;
      for (const tex of this.textures.values()) {
        tex.dispose();
      }
      this.textures.clear();
      this.sprites = [];
    }
    _bindInput() {
      this.canvasEl.addEventListener("pointerdown", this._onPointerDown, { passive: false });
      this.canvasEl.addEventListener("pointermove", this._onPointerMove, { passive: false });
      this.canvasEl.addEventListener("pointerup", this._onPointerUp, { passive: false });
      this.canvasEl.addEventListener("pointercancel", this._onPointerUp, { passive: false });
    }
    _unbindInput() {
      this.canvasEl.removeEventListener("pointerdown", this._onPointerDown);
      this.canvasEl.removeEventListener("pointermove", this._onPointerMove);
      this.canvasEl.removeEventListener("pointerup", this._onPointerUp);
      this.canvasEl.removeEventListener("pointercancel", this._onPointerUp);
    }
  };
  _SplatObject._WORLD_UP = new THREE.Vector3(0, 1, 0);
  _SplatObject._WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
  let SplatObject = _SplatObject;
  const GRAVITY = -4.5;
  const MAX_AGE = 1.5;
  class BlastParticles {
    constructor(scene2) {
      this.particles = [];
      this.scene = scene2;
    }
    /**
     * Spawn a blast particle at worldPos using the given sprite texture.
     * epicentre is the bomb's world position — velocity radiates outward from it.
     */
    spawn(worldPos, epicentre, tex, spriteSize) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 1
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(spriteSize * 0.9);
      sprite.position.copy(worldPos);
      this.scene.add(sprite);
      const dir = worldPos.clone().sub(epicentre);
      const len = dir.length();
      if (len > 1e-3) dir.divideScalar(len);
      else dir.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
      const speed = 1.8 + Math.random() * 2.2;
      const upKick = 0.8 + Math.random() * 1.4;
      this.particles.push({
        sprite,
        vx: dir.x * speed + (Math.random() - 0.5) * 0.8,
        vy: dir.y * speed + upKick,
        vz: dir.z * speed + (Math.random() - 0.5) * 0.8,
        age: 0,
        maxAge: MAX_AGE * (0.8 + Math.random() * 0.4)
      });
    }
    /**
     * Peel particle: takes ownership of an existing sprite (already in the scene
     * via its parent group) — detaches it, re-adds to the scene root so it can
     * move freely, then flies it horizontally away with gravity.
     * The sprite is removed and disposed when the animation ends.
     */
    spawnPeel(sprite, worldPos) {
      var _a;
      (_a = sprite.parent) == null ? void 0 : _a.remove(sprite);
      sprite.visible = true;
      sprite.material.opacity = 1;
      this.scene.add(sprite);
      const localPos = this.scene.worldToLocal(worldPos.clone());
      sprite.position.copy(localPos);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.push({
        sprite,
        vx: side * (2.8 + Math.random() * 2.2),
        vy: 0.3 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 0.5,
        age: 0,
        maxAge: 1.2 + Math.random() * 0.4,
        borrowedMaterial: true
      });
    }
    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        p.vy += GRAVITY * dt;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        const spin = 1 + 0.15 * Math.sin(p.age * 12);
        p.sprite.scale.setScalar(0.18 * spin);
        const t = p.age / p.maxAge;
        if (t > 0.6) {
          p.sprite.material.opacity = 1 - (t - 0.6) / 0.4;
        }
        if (p.age >= p.maxAge) {
          this.scene.remove(p.sprite);
          if (!p.borrowedMaterial) {
            p.sprite.material.dispose();
          }
          this.particles.splice(i, 1);
        }
      }
    }
    /** Clean up all remaining particles immediately */
    dispose() {
      for (const p of this.particles) {
        this.scene.remove(p.sprite);
        if (!p.borrowedMaterial) {
          p.sprite.material.dispose();
        }
      }
      this.particles = [];
    }
  }
  const INITIAL_BITES = 10;
  class StageManager {
    constructor(scene2, canvasEl, onStageChange, onResult) {
      this.currentStageIdx = 0;
      this.currentSplat = null;
      this.pressesUsed = 0;
      this.pressesAllowed = 0;
      this.onMunch = null;
      this.onItemTrigger = null;
      this.onEatSprites = null;
      this.extraBitesBonus = 3;
      this.frenzyBitesLeft = 0;
      this.onFrenzyEnd = null;
      this.xrayUsed = false;
      this._resultFired = false;
      this._frenzyEatAccum = 0;
      this.scene = scene2;
      this.canvasEl = canvasEl;
      this.onStageChange = onStageChange;
      this.onResult = onResult;
      this.blastParticles = new BlastParticles(scene2);
    }
    /** Register a callback fired on each successful button press */
    onMunchCallback(cb) {
      this.onMunch = cb;
    }
    /** Register a callback fired with eaten sprites (for fly-to-mouth animation) */
    onEatSpritesCallback(cb) {
      this.onEatSprites = cb;
    }
    /** Register a callback fired when a bomb or extra-bites item triggers */
    onItemCallback(cb) {
      this.onItemTrigger = cb;
    }
    get stageIndex() {
      return this.currentStageIdx;
    }
    get totalStages() {
      return 0;
    }
    // endless
    get splat() {
      return this.currentSplat;
    }
    startStage(idx) {
      if (this.currentSplat) {
        this.scene.remove(this.currentSplat.danceGroup);
        this.currentSplat.dispose();
        this.currentSplat = null;
      }
      this.currentStageIdx = idx;
      const cfg = generateInfiniteStage(idx);
      const shape = FRUIT_SHAPES[cfg.shapeIndex];
      const splat = new SplatObject(shape, cfg, this.canvasEl);
      splat.group.rotation.x = 0.3;
      splat.group.rotation.y = 0.4;
      splat.onBlast((worldPos, epicentre, tex, size) => {
        this.blastParticles.spawn(worldPos, epicentre, tex, size);
      });
      splat.onBombStar((n) => {
        var _a;
        if (n > 0) (_a = this.onMunch) == null ? void 0 : _a.call(this, -2, n);
        this._checkWin();
      });
      splat.onItem((type, detail) => {
        var _a, _b;
        if (type === "extrabites") {
          this.pressesAllowed += this.extraBitesBonus;
          (_a = this.onItemTrigger) == null ? void 0 : _a.call(this, "extrabites", this.extraBitesBonus);
          this.onStageChange(this._buildInfo());
        } else if (type === "bomb") {
          (_b = this.onItemTrigger) == null ? void 0 : _b.call(this, "bomb", detail);
          this.onStageChange(this._buildInfo());
          this._checkWin();
        }
      });
      this.scene.add(splat.danceGroup);
      this.currentSplat = splat;
      this.pressesUsed = 0;
      this.pressesAllowed = INITIAL_BITES;
      this.frenzyBitesLeft = 0;
      this.xrayUsed = false;
      this._resultFired = false;
      this.onStageChange(this._buildInfo());
    }
    // ── Power-up API ───────────────────────────────────────────────────────────
    addBites(n) {
      this.pressesAllowed += n;
      this._resultFired = false;
      this.onStageChange(this._buildInfo());
    }
    /** Pre-calculate the outer surface shell before the banana animation starts */
    prepareBananaPeel(camera2, canvasRect) {
      var _a;
      (_a = this.currentSplat) == null ? void 0 : _a.preparePeelLayer(camera2, canvasRect);
    }
    /**
     * Called each frame during the banana peel animation.
     * Eats pre-calculated outer-layer sprites whose screen-Y <= bananaScreenY.
     */
    eatBananaRow(bananaScreenY) {
      if (!this.currentSplat) return;
      this.currentSplat.eatBananaLayerAtScreenY(bananaScreenY, (sprite, worldPos) => {
        this.blastParticles.spawnPeel(sprite, worldPos);
      });
      this._checkWin();
    }
    useBananaPeel() {
      var _a;
      if (!this.currentSplat) return 0;
      const newStars = this.currentSplat.eatBananaLayer();
      if (newStars > 0) (_a = this.onMunch) == null ? void 0 : _a.call(this, -1, newStars);
      this.onStageChange(this._buildInfo());
      this._checkWin();
      return newStars;
    }
    useXRay() {
      if (!this.currentSplat || this.xrayUsed) return false;
      this.xrayUsed = true;
      this.currentSplat.setXRay(true);
      return true;
    }
    get isXRayUsed() {
      return this.xrayUsed;
    }
    useMegaBomb(worldImpact) {
      var _a;
      if (!this.currentSplat) return 0;
      const newStars = this.currentSplat.triggerMegaBomb(worldImpact);
      if (newStars > 0) (_a = this.onMunch) == null ? void 0 : _a.call(this, -1, newStars);
      this.onStageChange(this._buildInfo());
      this._checkWin();
      return newStars;
    }
    startFrenzy(bites, onEnd) {
      this.frenzyBitesLeft = bites;
      this.onFrenzyEnd = onEnd;
    }
    get isFrenzyActive() {
      return this.frenzyBitesLeft > 0;
    }
    /** Check win condition after any action that may have revealed stars. */
    _handleNewStars(newStars) {
      var _a;
      if (!this.currentSplat) return;
      if (newStars > 0) (_a = this.onMunch) == null ? void 0 : _a.call(this, -1, newStars);
      this._checkWin();
    }
    /** Always-safe win check — call after any eat/blast/peel action. */
    _checkWin() {
      if (!this.currentSplat || this._resultFired) return;
      const sf = this.currentSplat.starsRevealed;
      const st = this.currentSplat.starsTotal;
      if (sf >= st) {
        this._resultFired = true;
        this.onResult({
          state: "cleared",
          pressesUsed: this.pressesUsed,
          pressesAllowed: this.pressesAllowed,
          starsFound: sf,
          starsTotal: st
        });
      }
    }
    /**
     * Public escape hatch: if all stars are revealed but _resultFired was already
     * set (e.g. a prior action set it but the result never showed), reset the flag
     * and re-fire onResult so the win screen always appears.
     */
    forceCheckWin() {
      if (!this.currentSplat) return;
      const sf = this.currentSplat.starsRevealed;
      const st = this.currentSplat.starsTotal;
      if (sf >= st && !this._resultFired) {
        this._resultFired = true;
        this.onResult({
          state: "cleared",
          pressesUsed: this.pressesUsed,
          pressesAllowed: this.pressesAllowed,
          starsFound: sf,
          starsTotal: st
        });
      }
    }
    /** Debug: immediately clear the current stage regardless of state. */
    debugClear() {
      if (!this.currentSplat || this._resultFired) return;
      this._resultFired = true;
      const st = this.currentSplat.starsTotal;
      this.onResult({
        state: "cleared",
        pressesUsed: this.pressesUsed,
        pressesAllowed: this.pressesAllowed,
        starsFound: st,
        starsTotal: st
      });
    }
    startFirst() {
      this.startStage(0);
    }
    nextStage() {
      this.startStage(this.currentStageIdx + 1);
    }
    restartStage() {
      this.startStage(this.currentStageIdx);
    }
    /**
     * Player pressed a fruit button mapped to emojiIndex.
     * Eats visible matching points, checks for star reveals, checks win/fail.
     */
    pressButton(emojiIndex) {
      var _a;
      if (!this.currentSplat) return null;
      this.pressesUsed++;
      const { eaten, newStars, eatSprites } = this.currentSplat.eatEmoji(emojiIndex);
      (_a = this.onMunch) == null ? void 0 : _a.call(this, emojiIndex, newStars);
      const starsFound = this.currentSplat.starsRevealed;
      const starsTotal = this.currentSplat.starsTotal;
      const result = {
        state: "playing",
        pressesUsed: this.pressesUsed,
        pressesAllowed: this.pressesAllowed,
        starsFound,
        starsTotal,
        eatSprites
      };
      if (starsFound >= starsTotal && !this._resultFired) {
        this._resultFired = true;
        result.state = "cleared";
        this.onResult(result);
        return result;
      }
      if (this.pressesUsed >= this.pressesAllowed && !this._resultFired) {
        this._resultFired = true;
        result.state = "failed";
        this.onResult(result);
        return result;
      }
      this.onStageChange(this._buildInfo());
      return result;
    }
    update(dt) {
      var _a, _b, _c, _d;
      (_a = this.currentSplat) == null ? void 0 : _a.update(dt);
      this.blastParticles.update(dt);
      if (this.frenzyBitesLeft > 0 && this.currentSplat) {
        this.currentSplat.applyFrenzySpin(dt);
        this._frenzyEatAccum = (this._frenzyEatAccum ?? 0) + dt;
        if (this._frenzyEatAccum >= 0.45) {
          this._frenzyEatAccum = 0;
          const indices = [...this.currentSplat.getVisibleEmojiIndices()];
          if (indices.length > 0) {
            const idx = indices[Math.floor(Math.random() * indices.length)];
            const { newStars, eatSprites } = this.currentSplat.eatEmoji(idx);
            (_b = this.onMunch) == null ? void 0 : _b.call(this, idx, newStars);
            if (eatSprites.length) (_c = this.onEatSprites) == null ? void 0 : _c.call(this, eatSprites);
            this._checkWin();
          }
          this.frenzyBitesLeft--;
          if (this.frenzyBitesLeft <= 0) {
            (_d = this.onFrenzyEnd) == null ? void 0 : _d.call(this);
            this.onFrenzyEnd = null;
            this.onStageChange(this._buildInfo());
          }
        }
      }
    }
    getVisibleEmojis() {
      var _a;
      return ((_a = this.currentSplat) == null ? void 0 : _a.getVisibleEmojiIndices()) ?? /* @__PURE__ */ new Set();
    }
    _buildInfo() {
      var _a, _b;
      const cfg = generateInfiniteStage(this.currentStageIdx);
      const shape = FRUIT_SHAPES[cfg.shapeIndex];
      const emojis = cfg.mergedEmojis ?? shape.emojis;
      const emojiCounts = emojis.map(
        (_, i) => {
          var _a2;
          return ((_a2 = this.currentSplat) == null ? void 0 : _a2.getEmojiCount(i)) ?? 0;
        }
      );
      return {
        stageIndex: this.currentStageIdx,
        totalStages: 0,
        // endless — no total
        shapeName: cfg.comboName ?? shape.name,
        emojis,
        emojiCounts,
        pressesAllowed: this.pressesAllowed,
        pressesUsed: this.pressesUsed,
        starsFound: ((_a = this.currentSplat) == null ? void 0 : _a.starsRevealed) ?? 0,
        starsTotal: ((_b = this.currentSplat) == null ? void 0 : _b.starsTotal) ?? 3
      };
    }
    getCurrentInfo() {
      return this._buildInfo();
    }
  }
  function stdMat(hex, rough = 0.75) {
    return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
  }
  function mkSphere(r, hex, rough = 0.75) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), stdMat(hex, rough));
  }
  function mkBox(w, h, d, hex) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(hex));
  }
  function mkCapsule(r, len, hex) {
    return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 12), stdMat(hex));
  }
  const FUR = 11887901;
  const FACE = 15777930;
  const BELLY = 15777930;
  const EAR_I = 15241338;
  const EYE_W = 16777215;
  const PUPIL = 1118481;
  const NOSE = 8010512;
  const MOUTH = 13382417;
  const TONGUE = 16742280;
  function buildHead() {
    const headGroup = new THREE.Group();
    const skull = mkSphere(0.42, FUR);
    headGroup.add(skull);
    const face = mkSphere(0.32, FACE);
    face.scale.set(0.95, 0.82, 0.55);
    face.position.set(0, -0.05, 0.22);
    headGroup.add(face);
    for (const side of [-1, 1]) {
      const earOut = mkSphere(0.16, FUR);
      earOut.position.set(side * 0.42, 0.08, -0.05);
      const earIn = mkSphere(0.1, EAR_I);
      earIn.position.set(side * 0.47, 0.08, -0.02);
      headGroup.add(earOut, earIn);
    }
    for (const side of [-1, 1]) {
      const sclera = mkSphere(0.095, EYE_W, 0.3);
      sclera.position.set(side * 0.15, 0.08, 0.38);
      const pupil = mkSphere(0.062, PUPIL, 0.1);
      pupil.position.set(side * 0.15, 0.08, 0.43);
      const hi = mkSphere(0.02, 16777215, 0.05);
      hi.position.set(side * 0.165, 0.1, 0.448);
      headGroup.add(sclera, pupil, hi);
    }
    const upperMuz = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 16, 12),
      stdMat(FACE)
    );
    upperMuz.scale.set(1.1, 0.55, 0.85);
    upperMuz.position.set(0, -0.14, 0.32);
    headGroup.add(upperMuz);
    const nose = mkSphere(0.048, NOSE);
    nose.position.set(0, -0.06, 0.48);
    headGroup.add(nose);
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.22, 0.28);
    const lowerJaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 16, 12),
      stdMat(FACE)
    );
    lowerJaw.scale.set(1.1, 0.5, 0.85);
    lowerJaw.position.set(0, -0.05, 0.08);
    const cavity = mkSphere(0.14, MOUTH, 0.9);
    cavity.position.set(0, 0, 0.1);
    const tongue = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      stdMat(TONGUE, 0.7)
    );
    tongue.scale.set(1.1, 0.4, 1);
    tongue.position.set(0, -0.06, 0.14);
    jawPivot.add(lowerJaw, cavity, tongue);
    headGroup.add(jawPivot);
    return { headGroup, jawPivot };
  }
  function buildLeg(side) {
    const g = new THREE.Group();
    const upper = mkCapsule(0.09, 0.22, FUR);
    upper.position.set(side * 0.14, -0.55, 0);
    const foot = mkSphere(0.1, FACE);
    foot.scale.set(1.2, 0.6, 1.15);
    foot.position.set(side * 0.15, -0.72, 0.06);
    g.add(upper, foot);
    return g;
  }
  function buildArm(side) {
    const armGroup = new THREE.Group();
    const upper = mkCapsule(0.075, 0.26, FUR);
    upper.rotation.x = Math.PI / 2;
    upper.position.set(0, 0, 0.13);
    armGroup.add(upper);
    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, 0, 0.26);
    const lower = mkCapsule(0.062, 0.22, FUR);
    lower.rotation.x = Math.PI / 2;
    lower.position.set(0, 0, 0.11);
    const hand = mkSphere(0.09, FACE);
    hand.position.set(0, 0, 0.25);
    forearmPivot.add(lower, hand);
    armGroup.add(forearmPivot);
    return { armGroup, forearmPivot };
  }
  class MonkeyModel {
    constructor() {
      this.idleT = 0;
      this._baseY = 0;
      this.danceEnergy = 0;
      this.munching = false;
      this.munchT = 0;
      this.MUNCH_DUR = 0.65;
      this.sunglasses = null;
      this.sunglassesVisible = false;
      this.bombThrowT = 0;
      this.bombThrowDur = 0.65;
      this.isThrowing = false;
      this.bombOnLand = null;
      this.bombSprite = null;
      this.bombScene = null;
      this.bombStart = new THREE.Vector3();
      this.bombTarget = new THREE.Vector3();
      this.armRotY = 0;
      this.armRotX = 0;
      this.lastDragRotY = 0;
      this.lastDragRotX = 0;
      this.isDragging = false;
      this.group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 20, 16),
        stdMat(FUR)
      );
      body.scale.set(1, 1.25, 0.85);
      body.position.y = -0.22;
      const belly = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 12),
        stdMat(BELLY)
      );
      belly.scale.set(0.95, 1.1, 0.6);
      belly.position.set(0, -0.18, 0.2);
      const { headGroup, jawPivot } = buildHead();
      this.headGroup = headGroup;
      this.jawPivot = jawPivot;
      headGroup.position.y = 0.35;
      const lArmResult = buildArm();
      const rArmResult = buildArm();
      this.leftArm = lArmResult.armGroup;
      this.rightArm = rArmResult.armGroup;
      this.leftForearm = lArmResult.forearmPivot;
      this.rightForearm = rArmResult.forearmPivot;
      this.leftArm.position.set(-0.32, 0.05, 0.12);
      this.rightArm.position.set(0.32, 0.05, 0.12);
      this.leftArm.rotation.z = 0.25;
      this.rightArm.rotation.z = -0.25;
      this.leftArm.rotation.y = 0.2;
      this.rightArm.rotation.y = -0.2;
      this.leftLeg = buildLeg(-1);
      this.rightLeg = buildLeg(1);
      const tail = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.048, 8, 20, Math.PI * 1.4),
        stdMat(FUR)
      );
      tail.rotation.y = Math.PI / 2;
      tail.position.set(0.18, -0.28, -0.3);
      this.sunglasses = new THREE.Group();
      this.sunglasses.visible = false;
      const bridge = mkBox(0.08, 0.022, 0.03, 1118481);
      const lensMat = new THREE.MeshStandardMaterial({
        color: 52479,
        roughness: 0.05,
        metalness: 0.6,
        transparent: true,
        opacity: 0.72
      });
      const lLens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), lensMat);
      lLens.scale.set(1, 0.68, 0.28);
      lLens.position.set(-0.15, 0, 0);
      const rLens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), lensMat);
      rLens.scale.set(1, 0.68, 0.28);
      rLens.position.set(0.15, 0, 0);
      const lRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.012, 8, 24),
        new THREE.MeshStandardMaterial({ color: 1118481 })
      );
      lRim.scale.set(1, 0.68, 0.28);
      lRim.position.set(-0.15, 0, 0);
      const rRim = lRim.clone();
      rRim.position.set(0.15, 0, 0);
      const lArm2 = mkBox(0.13, 0.018, 0.012, 1118481);
      lArm2.position.set(-0.27, 0, -0.025);
      const rArm2 = lArm2.clone();
      rArm2.position.set(0.27, 0, -0.025);
      this.sunglasses.add(bridge, lLens, rLens, lRim, rRim, lArm2, rArm2);
      this.sunglasses.position.set(0, 0.08, 0.46);
      headGroup.add(this.sunglasses);
      this.group.add(
        body,
        belly,
        headGroup,
        this.leftArm,
        this.rightArm,
        this.leftLeg,
        this.rightLeg,
        tail
      );
    }
    setBaseY(y) {
      this._baseY = y;
      this.group.position.y = y;
    }
    setFruitWorldY(_y) {
    }
    setFruitRotation(rotX, rotY, isDragging) {
      if (isDragging) {
        this.armRotY += rotY - this.lastDragRotY;
        this.armRotY = Math.max(-1.2, Math.min(1.2, this.armRotY));
        this.armRotX += rotX - this.lastDragRotX;
        this.armRotX = Math.max(-1.2, Math.min(1.2, this.armRotX));
      }
      this.lastDragRotY = rotY;
      this.lastDragRotX = rotX;
      this.isDragging = isDragging;
    }
    /** Feed real-time beat energy (0–1) each frame from the audio analyser */
    setDanceEnergy(e) {
      this.danceEnergy = e;
    }
    /** Remove sunglasses (call on stage start) */
    hideSunglasses() {
      if (!this.sunglasses) return;
      this.sunglassesVisible = false;
      this.sunglasses.visible = false;
    }
    /** Animate sunglasses dropping onto face, then keep them on */
    showSunglasses() {
      if (!this.sunglasses || this.sunglassesVisible) return;
      this.sunglassesVisible = true;
      this.sunglasses.visible = true;
      this.sunglasses.position.y = 0.9;
      const targetY = 0.08;
      const start = performance.now();
      const dur = 400;
      const animate2 = () => {
        const t = Math.min(1, (performance.now() - start) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        this.sunglasses.position.y = 0.9 + (targetY - 0.9) * ease;
        if (t < 1) requestAnimationFrame(animate2);
      };
      requestAnimationFrame(animate2);
    }
    /**
     * Animate a bomb throw: arm swings forward, a 💣 sprite arcs toward the
     * fruit, callback fires when it arrives.
     * @param scene   THREE scene to add the bomb sprite to
     * @param target  world-space position the bomb should fly to
     * @param onLand  called when the bomb reaches the target
     */
    throwBomb(scene2, target, onLand) {
      if (this.isThrowing) {
        onLand();
        return;
      }
      this.isThrowing = true;
      this.bombThrowT = 0;
      this.bombOnLand = onLand;
      this.bombScene = scene2;
      this.bombTarget.copy(target);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.font = "48px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💣", 32, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this.bombSprite = new THREE.Sprite(mat);
      this.bombSprite.scale.setScalar(0.28);
      const handLocal = new THREE.Vector3(0.28, 0, 0.25);
      this.bombStart.copy(this.group.localToWorld(handLocal.clone()));
      this.bombSprite.position.copy(this.bombStart);
      scene2.add(this.bombSprite);
    }
    triggerMunch() {
      if (this.munching) return;
      this.munching = true;
      this.munchT = this.MUNCH_DUR;
    }
    /** World-space position of the mouth opening (used for eat-fly animations) */
    getMouthWorldPos() {
      const local = new THREE.Vector3(0, 0, 0.18);
      return this.jawPivot.localToWorld(local);
    }
    update(dt) {
      var _a;
      this.idleT += dt;
      const de = this.danceEnergy;
      const shuffleFreq = 3.5 + de * 4;
      const shuffleAmp = 0.04 + de * 0.18;
      this.leftLeg.position.y = Math.sin(this.idleT * shuffleFreq) * shuffleAmp;
      this.rightLeg.position.y = -Math.sin(this.idleT * shuffleFreq) * shuffleAmp;
      const swayAmp = 0.02 + de * 0.06;
      this.group.rotation.z = Math.sin(this.idleT * shuffleFreq * 0.5) * swayAmp;
      const bob = Math.sin(this.idleT * 1.7) * (0.016 + de * 0.06);
      let jumpY = 0;
      let jawOpen = 0;
      let lunge = 0;
      if (this.munching) {
        this.munchT -= dt;
        const t = Math.max(0, this.munchT / this.MUNCH_DUR);
        jumpY = Math.sin(t * Math.PI) * 0.85;
        lunge = Math.sin(t * Math.PI) * 0.5;
        const jawPhase = Math.sin(Math.min(t * Math.PI * 1.5, Math.PI));
        jawOpen = Math.pow(Math.max(0, jawPhase), 0.5);
        if (this.munchT <= 0) {
          this.munching = false;
          this.jawPivot.rotation.x = 0;
          this.jawPivot.scale.set(1, 1, 1);
        }
      }
      this.group.position.y = this._baseY + bob + jumpY;
      this.group.position.z = -1.8 + lunge * 0.7;
      this.headGroup.rotation.x = -lunge * 0.35 + Math.sin(this.idleT * 0.8) * 0.02;
      this.headGroup.rotation.y = Math.sin(this.idleT * 0.6) * 0.03;
      this.jawPivot.rotation.x = jawOpen * 0.9;
      const jw = 1 + jawOpen * 1.8;
      this.jawPivot.scale.set(jw, 1 + jawOpen * 0.5, 1);
      if (this.isThrowing) {
        this.bombThrowT += dt;
        const tp = Math.min(1, this.bombThrowT / this.bombThrowDur);
        const throwArc = Math.sin(tp * Math.PI);
        this.rightArm.rotation.x = -throwArc * 1.8;
        this.rightArm.rotation.z = -0.25 - throwArc * 0.5;
        if (this.bombSprite) {
          const px = this.bombStart.x + (this.bombTarget.x - this.bombStart.x) * tp;
          const pz = this.bombStart.z + (this.bombTarget.z - this.bombStart.z) * tp;
          const baseY = this.bombStart.y + (this.bombTarget.y - this.bombStart.y) * tp;
          const arcH = Math.sin(tp * Math.PI) * 1.2;
          this.bombSprite.position.set(px, baseY + arcH, pz);
          this.bombSprite.material.rotation += dt * 8;
        }
        if (tp >= 1) {
          this.isThrowing = false;
          this.rightArm.rotation.x = 0;
          this.rightArm.rotation.z = -0.25;
          if (this.bombSprite && this.bombScene) {
            this.bombScene.remove(this.bombSprite);
            this.bombSprite.material.dispose();
            this.bombSprite = null;
          }
          (_a = this.bombOnLand) == null ? void 0 : _a.call(this);
          this.bombOnLand = null;
        }
      }
      if (!this.isDragging) {
        const decayK = 1 - Math.exp(-4 * dt);
        this.armRotY *= 1 - decayK;
        this.armRotX *= 1 - decayK;
      }
      const armSwing = this.armRotY * 0.7;
      const armLift = this.armRotX * 0.5;
      const sway = Math.sin(this.idleT * 1.3) * 0.03;
      this.leftArm.rotation.z = 0.25 + sway + armLift;
      this.leftArm.rotation.y = 0.2 - armSwing;
      this.leftForearm.rotation.y = -armSwing * 0.5;
      this.rightArm.rotation.z = -0.25 - sway - armLift;
      this.rightArm.rotation.y = -0.2 - armSwing;
      this.rightForearm.rotation.y = armSwing * 0.5;
      if (this.munching || jumpY > 0.01) {
        const spread = Math.sin((1 - this.munchT / this.MUNCH_DUR) * Math.PI) * 0.25;
        this.leftArm.rotation.z += spread;
        this.rightArm.rotation.z -= spread;
      }
    }
  }
  class IntroMonkey {
    constructor(sizePx = 160, mode = "orange-justice") {
      this._raf = 0;
      this._t = 0;
      this._loop = () => {
        this._raf = requestAnimationFrame(this._loop);
        const dt = Math.min(this.clock.getDelta(), 0.1);
        this._t += dt;
        this._dance(dt);
        this.monkey.update(dt);
        this.renderer.render(this.scene, this.camera);
      };
      this._mode = mode;
      this.canvas = document.createElement("canvas");
      this.canvas.width = sizePx;
      this.canvas.height = sizePx;
      this.canvas.style.cssText = `width:${sizePx}px;height:${sizePx}px;display:block;border-radius:50%;overflow:hidden;background:transparent;`;
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        // transparent background
        preserveDrawingBuffer: true
      });
      this.renderer.setSize(sizePx, sizePx);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0, 0);
      this.scene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(16774368, 4469538, 1.2);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(16777215, 1.8);
      dir.position.set(1, 2, 2);
      this.scene.add(dir);
      this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 50);
      this.camera.position.set(0, -0.05, 1.2);
      this.camera.lookAt(0, -0.05, 0);
      this.monkey = new MonkeyModel();
      this.monkey.group.scale.setScalar(1.4);
      this.monkey.setBaseY(-0.3);
      this.scene.add(this.monkey.group);
      this.clock = new THREE.Clock();
      this._loop();
    }
    /**
     * Orange Justice / Fortnite dance approximation:
     * - Hips bounce on every beat (~1.8 Hz)
     * - Arms alternate: left pumps up while right pumps down, then swap
     * - Head bobs in sync
     * - Body leans side-to-side
     */
    _dance(dt) {
      if (this._mode === "floss") {
        this._floss();
        return;
      }
      this._orangeJustice();
    }
    _orangeJustice() {
      const t = this._t;
      const FREQ = 1.8;
      const beat = Math.sin(t * FREQ * Math.PI * 2);
      const beatAbs = Math.abs(beat);
      this.monkey.group.position.y = this.monkey["_baseY"] + beatAbs * 0.12;
      this.monkey.group.rotation.z = beat * 0.18;
      this.monkey["leftArm"].rotation.z = 0.25 + beat * 1.1;
      this.monkey["leftArm"].rotation.x = -beat * 0.5;
      this.monkey["leftForearm"].rotation.y = beat * 0.6;
      this.monkey["rightArm"].rotation.z = -0.25 - beat * 1.1;
      this.monkey["rightArm"].rotation.x = beat * 0.5;
      this.monkey["rightForearm"].rotation.y = -beat * 0.6;
      this.monkey["leftLeg"].position.y = Math.max(0, beat) * 0.18;
      this.monkey["rightLeg"].position.y = Math.max(0, -beat) * 0.18;
      this.monkey["headGroup"].rotation.z = -beat * 0.12;
      this.monkey["headGroup"].rotation.x = beatAbs * 0.08;
      const jawOpen = beatAbs * 0.6;
      this.monkey["jawPivot"].rotation.x = jawOpen * 0.9;
      this.monkey["jawPivot"].scale.set(1 + jawOpen * 0.5, 1, 1);
    }
    /**
     * Fortnite Floss dance:
     * Hips sway L↔R while arms swing in opposite directions each half-beat.
     * Left arm swings BACK when right swings FORWARD and vice-versa.
     */
    _floss() {
      const t = this._t;
      const FREQ = 2.2;
      const beat = Math.sin(t * FREQ * Math.PI * 2);
      const beatFast = Math.sin(t * FREQ * Math.PI * 2 * 2);
      const beatAbs = Math.abs(beat);
      this.monkey.group.position.x = beat * 0.18;
      this.monkey.group.position.y = this.monkey["_baseY"] + beatAbs * 0.06;
      this.monkey.group.rotation.z = beat * 0.12;
      const armSwing = beatFast * 1.4;
      this.monkey["leftArm"].rotation.x = armSwing;
      this.monkey["leftArm"].rotation.z = 0.25 + beatFast * 0.3;
      this.monkey["rightArm"].rotation.x = -armSwing;
      this.monkey["rightArm"].rotation.z = -0.25 - beatFast * 0.3;
      this.monkey["leftForearm"].rotation.y = beatFast * 0.8;
      this.monkey["rightForearm"].rotation.y = -beatFast * 0.8;
      this.monkey["leftLeg"].position.y = Math.max(0, beat) * 0.12;
      this.monkey["rightLeg"].position.y = Math.max(0, -beat) * 0.12;
      this.monkey["headGroup"].rotation.z = -beat * 0.08;
      this.monkey["headGroup"].rotation.x = beatAbs * 0.05;
      const jawOpen = 0.45 + beatAbs * 0.3;
      this.monkey["jawPivot"].rotation.x = jawOpen * 0.9;
      this.monkey["jawPivot"].scale.set(1 + jawOpen * 0.4, 1, 1);
    }
    /** Stop the render loop and free GPU resources */
    dispose() {
      cancelAnimationFrame(this._raf);
      this.renderer.dispose();
    }
  }
  const _style = document.createElement("style");
  _style.textContent = `
  @keyframes hud-shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
  @keyframes hud-hint-bob {
    0%,100%{transform:translateX(-50%) translateY(0)}
    50%{transform:translateX(-50%) translateY(10px)}
  }
  @keyframes hud-btn-pop {
    0%{transform:scale(1)} 35%{transform:scale(1.22)} 100%{transform:scale(1)}
  }
  @keyframes hud-fade-in {
    from{opacity:0;transform:scale(0.96) translateY(6px)}
    to{opacity:1;transform:scale(1) translateY(0)}
  }
  @keyframes hud-slide-up {
    from{opacity:0;transform:translateX(-50%) translateY(12px)}
    to{opacity:1;transform:translateX(-50%) translateY(0)}
  }
  @keyframes hud-star-pop {
    0%{transform:scale(1)} 40%{transform:scale(1.6) rotate(-8deg)} 70%{transform:scale(0.9) rotate(4deg)} 100%{transform:scale(1) rotate(0deg)}
  }
  @keyframes hud-glow-pulse {
    0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}
    50%{box-shadow:0 0 0 6px rgba(251,191,36,0.35)}
  }
  @keyframes hud-bite-drain {
    from{width:var(--bite-pct-from)} to{width:var(--bite-pct-to)}
  }
  @keyframes hud-coconut-pop {
    0%{transform:scale(1)} 35%{transform:scale(1.5) rotate(10deg)} 100%{transform:scale(1) rotate(0deg)}
  }
  .hud-overlay-card {
    animation: hud-fade-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  /* Browsers don't inherit font-family into buttons/inputs by default */
  button, input, select, textarea {
    font-family: inherit;
  }
`;
  document.head.appendChild(_style);
  class GameHUD {
    constructor(container2, onPress) {
      this.starSlots = [];
      this._dragHintDismissed = false;
      this._badgeEls = /* @__PURE__ */ new Map();
      this._introMonkey = null;
      this._resultMonkey = null;
      this._fruitIcons = [];
      this._beatTime = 0;
      this.onPress = onPress;
      this.root = document.createElement("div");
      this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:max(3vmin,env(safe-area-inset-top),var(--sat,0px)) max(2vmin,env(safe-area-inset-right),var(--sar,0px)) max(3vmin,env(safe-area-inset-bottom),var(--sab,0px)) max(2vmin,env(safe-area-inset-left),var(--sal,0px));font-family:'Comic Sans MS','Comic Sans',cursive;";
      this._buildHeader();
      this._buildFooter();
      this._buildDragHint();
      this._buildOverlay();
      container2.appendChild(this.root);
    }
    _buildHeader() {
      const header = document.createElement("div");
      header.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:1.4vmin;pointer-events:none;background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:clamp(8px,2.2vmin,14px) clamp(14px,4vmin,28px);box-shadow:0 4px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);";
      const title = document.createElement("div");
      title.style.cssText = "font-size:clamp(17px,4.8vmin,26px);font-weight:900;letter-spacing:-0.03em;text-align:center;background:linear-gradient(135deg,#ffe066 0%,#ffb347 55%,#ff6b35 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));";
      title.textContent = "🐒 Munchy Monkey";
      this.stageEl = document.createElement("div");
      this.stageEl.style.cssText = "font-size:clamp(10px,2.8vmin,15px);color:rgba(255,255,240,0.9);font-weight:700;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:2px clamp(8px,2.5vmin,14px);letter-spacing:0.02em;text-align:center;";
      const coconutRow = document.createElement("div");
      coconutRow.style.cssText = "display:flex;align-items:center;gap:2vmin;pointer-events:auto;";
      this._coconutEl = document.createElement("div");
      this._coconutEl.style.cssText = "font-size:clamp(12px,3.4vmin,18px);font-weight:800;color:#fff;background:rgba(120,80,20,0.55);border:1px solid rgba(255,210,100,0.35);border-radius:999px;padding:clamp(3px,0.8vmin,6px) clamp(10px,3vmin,18px);display:flex;align-items:center;gap:1.2vmin;box-shadow:0 2px 8px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.1);transition:transform 0.15s;";
      this._coconutEl.innerHTML = '🥥 <span id="hud-coconut-count">10</span>';
      const buySlot = document.createElement("div");
      buySlot.id = "hud-buy-slot";
      coconutRow.appendChild(this._coconutEl);
      coconutRow.appendChild(buySlot);
      this.starsRow = document.createElement("div");
      this.starsRow.style.cssText = "display:flex;gap:3.5vmin;align-items:center;justify-content:center;";
      for (let i = 0; i < 3; i++) {
        const slot = document.createElement("div");
        slot.style.cssText = "font-size:clamp(28px,8.5vmin,50px);line-height:1;filter:grayscale(1) brightness(0.5);transition:filter 0.35s ease,transform 0.35s cubic-bezier(0.34,1.56,0.64,1);";
        slot.textContent = "⭐";
        this.starsRow.appendChild(slot);
        this.starSlots.push(slot);
      }
      const bitesWrap = document.createElement("div");
      bitesWrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:0.6vmin;width:100%;";
      this.pressesEl = document.createElement("div");
      this.pressesEl.style.cssText = "font-size:clamp(11px,3vmin,16px);color:#ffe;font-weight:700;text-align:center;letter-spacing:0.01em;";
      const barTrack = document.createElement("div");
      barTrack.id = "hud-bite-track";
      barTrack.style.cssText = "width:clamp(80px,28vmin,160px);height:5px;border-radius:999px;background:rgba(255,255,255,0.15);overflow:hidden;";
      const barFill = document.createElement("div");
      barFill.id = "hud-bite-fill";
      barFill.style.cssText = "height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width 0.4s ease,background 0.4s ease;";
      barTrack.appendChild(barFill);
      bitesWrap.appendChild(this.pressesEl);
      bitesWrap.appendChild(barTrack);
      header.appendChild(title);
      header.appendChild(this.stageEl);
      header.appendChild(coconutRow);
      header.appendChild(this.starsRow);
      header.appendChild(bitesWrap);
      this.root.appendChild(header);
    }
    _buildFooter() {
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2vmin;";
      this.powerupSlot = document.createElement("div");
      this.powerupSlot.style.cssText = "display:flex;justify-content:center;width:100%;";
      const btnCard = document.createElement("div");
      btnCard.style.cssText = "background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:22px;padding:clamp(8px,2vmin,14px) clamp(10px,3vmin,20px);box-shadow:0 4px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);";
      this.buttonsRow = document.createElement("div");
      this.buttonsRow.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:2.5vmin;pointer-events:auto;max-width:min(92vmin,400px);";
      btnCard.appendChild(this.buttonsRow);
      footer.appendChild(this.powerupSlot);
      footer.appendChild(btnCard);
      this.root.appendChild(footer);
    }
    _buildOverlay() {
      this.overlayEl = document.createElement("div");
      this.overlayEl.style.cssText = "position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:3.5vmin;pointer-events:auto;background:rgba(0,0,0,0.65);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);";
      this.root.appendChild(this.overlayEl);
    }
    /** Animated drag hint — shown until the player first drags the fruit */
    _buildDragHint() {
      this.dragHintEl = document.createElement("div");
      this.dragHintEl.style.cssText = "position:absolute;left:50%;top:52%;transform:translateX(-50%);pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:1vmin;opacity:0;transition:opacity 0.5s;z-index:2;";
      const hand = document.createElement("div");
      hand.style.cssText = "font-size:clamp(28px,9vmin,52px);animation:hud-hint-bob 1.2s ease-in-out infinite;";
      hand.textContent = "👆";
      const label = document.createElement("div");
      label.style.cssText = "font-size:clamp(11px,3vmin,16px);color:rgba(255,255,255,0.9);background:rgba(0,0,0,0.45);border-radius:10px;padding:4px 12px;font-weight:600;white-space:nowrap;backdrop-filter:blur(4px);";
      label.textContent = "Drag to rotate the fruit!";
      this.dragHintEl.appendChild(hand);
      this.dragHintEl.appendChild(label);
      this.root.appendChild(this.dragHintEl);
    }
    /** Show the drag hint (called when a stage starts for the first time) */
    showDragHint() {
      if (this._dragHintDismissed) return;
      this.dragHintEl.style.opacity = "1";
    }
    /** Dismiss the drag hint (call on first drag) */
    dismissDragHint() {
      if (this._dragHintDismissed) return;
      this._dragHintDismissed = true;
      this.dragHintEl.style.opacity = "0";
    }
    /** Add a mute toggle button anchored top-left, returns a toggle function */
    addMuteButton(onToggle) {
      const btn = document.createElement("button");
      let muted = false;
      btn.textContent = "🔊";
      btn.title = "Mute / Unmute";
      btn.style.cssText = "position:absolute;pointer-events:auto;top:max(3vmin,env(safe-area-inset-top),var(--sat,0px));right:max(3vmin,env(safe-area-inset-right),var(--sar,0px));width:clamp(44px,11vmin,58px);height:clamp(44px,11vmin,58px);font-size:clamp(18px,5.5vmin,28px);line-height:1;background:rgba(0,0,0,0.42);border:1px solid rgba(255,255,255,0.15);border-radius:50%;cursor:pointer;touch-action:manipulation;user-select:none;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 2px 10px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);transition:transform 0.1s,background 0.15s;z-index:5;";
      btn.addEventListener("pointerdown", () => {
        btn.style.transform = "scale(0.9)";
      });
      btn.addEventListener("pointerup", () => {
        btn.style.transform = "scale(1)";
      });
      btn.addEventListener("click", () => {
        muted = !muted;
        btn.textContent = muted ? "🔇" : "🔊";
        onToggle(muted);
      });
      this.root.appendChild(btn);
    }
    /**
     * Inject the "Watch Ad → +10 🥥" button into the buy slot beside the coconut counter.
     * onBuy() is called when the user taps it; caller is responsible for showing the ad
     * modal and granting the reward.
     */
    addBuyCoconutsButton(onBuy) {
      const slot = document.getElementById("hud-buy-slot");
      if (!slot) return;
      const btn = document.createElement("button");
      btn.title = "Watch an ad to earn +10 coconuts";
      btn.style.cssText = "pointer-events:auto;display:flex;align-items:center;gap:1vmin;background:rgba(245,158,11,0.85);color:#fff;border:none;border-radius:999px;font-size:clamp(10px,2.8vmin,15px);font-weight:800;padding:clamp(3px,0.8vmin,6px) clamp(8px,2.2vmin,14px);cursor:pointer;touch-action:manipulation;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.2);transition:transform 0.1s,box-shadow 0.1s;white-space:nowrap;";
      btn.textContent = "Get more 🥥";
      btn.addEventListener("pointerdown", () => {
        btn.style.transform = "scale(0.92)";
      });
      btn.addEventListener("pointerup", () => {
        btn.style.transform = "scale(1)";
      });
      btn.addEventListener("click", onBuy);
      slot.appendChild(btn);
    }
    /** Update HUD with current stage info */
    updateStage(info) {
      this.stageEl.textContent = `Stage ${info.stageIndex + 1}  ·  ${info.shapeName}`;
      const bitesLeft = info.pressesAllowed - info.pressesUsed;
      const pct = Math.max(0, bitesLeft / info.pressesAllowed);
      let biteColor = "#ffe";
      let barColor = "linear-gradient(90deg,#4ade80,#22c55e)";
      if (bitesLeft <= 2) {
        biteColor = "#fca5a5";
        barColor = "linear-gradient(90deg,#f87171,#ef4444)";
      } else if (bitesLeft <= 4) {
        biteColor = "#fde68a";
        barColor = "linear-gradient(90deg,#fcd34d,#f59e0b)";
      }
      this.pressesEl.style.color = biteColor;
      this.pressesEl.textContent = `🍌 ${bitesLeft} bite${bitesLeft === 1 ? "" : "s"} left`;
      const fill = document.getElementById("hud-bite-fill");
      if (fill) {
        fill.style.width = `${pct * 100}%`;
        fill.style.background = barColor;
      }
      if (bitesLeft === 4 || bitesLeft === 2) {
        this.pressesEl.style.animation = "none";
        void this.pressesEl.offsetWidth;
        this.pressesEl.style.animation = "hud-shake 0.45s ease";
      }
      this._rebuildButtons(info.emojis, info.emojiCounts);
    }
    /** Attach the power-up bar element into the HUD footer slot */
    attachPowerUpBar(el) {
      this.powerupSlot.appendChild(el);
    }
    /** Update the coconut counter display */
    updateCoconuts(balance) {
      const el = document.getElementById("hud-coconut-count");
      if (el) el.textContent = String(balance);
      this._coconutEl.style.animation = "none";
      void this._coconutEl.offsetWidth;
      this._coconutEl.style.animation = "hud-coconut-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)";
    }
    /**
     * Doober: fly `count` coconut emojis from (originX, originY) to the
     * coconut counter in the header, one after another with a small delay.
     */
    punchCoconuts(count, originX, originY) {
      const destRect = this._coconutEl.getBoundingClientRect();
      const rootRect = this.root.getBoundingClientRect();
      const destX = destRect.left + destRect.width / 2 - rootRect.left;
      const destY = destRect.top + destRect.height / 2 - rootRect.top;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const d = document.createElement("div");
          d.textContent = "🥥";
          d.style.cssText = `position:absolute;pointer-events:none;font-size:clamp(18px,5vmin,28px);line-height:1;z-index:20;will-change:transform,opacity;left:${originX - rootRect.left}px;top:${originY - rootRect.top}px;transform:translate(-50%,-50%) scale(1.3);transition:left 0.5s cubic-bezier(0.4,0,0.2,1),top 0.5s cubic-bezier(0.4,0,0.2,1),transform 0.5s cubic-bezier(0.4,0,0.2,1),opacity 0.15s;`;
          this.root.appendChild(d);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            d.style.left = `${destX}px`;
            d.style.top = `${destY}px`;
            d.style.transform = "translate(-50%,-50%) scale(0.65)";
          }));
          setTimeout(() => {
            d.remove();
            if (i === count - 1) {
              this._coconutEl.style.animation = "none";
              void this._coconutEl.offsetWidth;
              this._coconutEl.style.animation = "hud-coconut-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)";
            }
          }, 520);
        }, i * 120);
      }
    }
    /** Reset all star slots to dim (call at stage start) */
    resetStars() {
      for (const slot of this.starSlots) {
        slot.style.filter = "grayscale(1) brightness(0.5)";
        slot.style.transform = "scale(1)";
        slot.style.animation = "";
      }
    }
    /**
     * Reconcile: ensure the first `revealed` slots are lit.
     * Call after doober flight time to catch any missed star reveals.
     */
    reconcileStars(revealed) {
      for (let i = 0; i < this.starSlots.length; i++) {
        const slot = this.starSlots[i];
        const shouldBeLit = i < revealed;
        const isLit = slot.style.filter === "grayscale(0) brightness(1)";
        if (shouldBeLit && !isLit) {
          slot.style.filter = "grayscale(0) brightness(1)";
          slot.style.animation = "hud-star-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both";
        }
      }
    }
    /**
     * Doober animation: fly a ⭐ from screen position (originX, originY)
     * to the next uncollected star slot, then light it up.
     * @param slotIndex  which slot to fill (0, 1, 2)
     * @param originX    CSS-pixel X of the 3D star in the viewport
     * @param originY    CSS-pixel Y of the 3D star in the viewport
     */
    punchStars(slotIndex, originX, originY) {
      const slot = this.starSlots[slotIndex];
      if (!slot) return;
      const slotRect = slot.getBoundingClientRect();
      const rootRect = this.root.getBoundingClientRect();
      const destX = slotRect.left + slotRect.width / 2 - rootRect.left;
      const destY = slotRect.top + slotRect.height / 2 - rootRect.top;
      const doober = document.createElement("div");
      doober.textContent = "⭐";
      doober.style.cssText = `position:absolute;pointer-events:none;font-size:clamp(22px,6vmin,36px);line-height:1;z-index:20;will-change:transform,opacity;left:${originX - rootRect.left}px;top:${originY - rootRect.top}px;transform:translate(-50%,-50%) scale(1.4);transition:left 0.55s cubic-bezier(0.4,0,0.2,1),top 0.55s cubic-bezier(0.4,0,0.2,1),transform 0.55s cubic-bezier(0.4,0,0.2,1),opacity 0.1s;`;
      this.root.appendChild(doober);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          doober.style.left = `${destX}px`;
          doober.style.top = `${destY}px`;
          doober.style.transform = "translate(-50%,-50%) scale(0.7)";
        });
      });
      setTimeout(() => {
        doober.remove();
        slot.style.filter = "grayscale(0) brightness(1)";
        slot.style.animation = "hud-star-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both";
      }, 570);
    }
    /** Show a brief floating toast for item triggers */
    showItemToast(type, detail) {
      const toast = document.createElement("div");
      let text;
      let accent;
      if (type === "bomb") {
        text = `💣 BOOM! ${detail ?? 0} emojis blasted!`;
        accent = "rgba(239,68,68,0.9)";
      } else if (type === "broke") {
        text = "🥥 Not enough coconuts!";
        accent = "rgba(120,60,10,0.92)";
      } else {
        text = "🐵 +3 extra bites!";
        accent = "rgba(34,197,94,0.9)";
      }
      toast.textContent = text;
      toast.style.cssText = "position:absolute;left:50%;top:36%;background:" + accent + ";color:#fff;border-radius:999px;padding:clamp(8px,2vmin,12px) clamp(16px,5vmin,28px);font-size:clamp(13px,3.8vmin,20px);font-weight:800;letter-spacing:0.01em;pointer-events:none;white-space:nowrap;z-index:10;box-shadow:0 4px 20px rgba(0,0,0,0.4);animation:hud-slide-up 0.25s ease both;transition:opacity 0.4s,transform 0.4s;";
      this.root.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-20px)";
        setTimeout(() => toast.remove(), 420);
      }, 1100);
    }
    _rebuildButtons(emojis, counts) {
      this.buttonsRow.innerHTML = "";
      this._badgeEls.clear();
      emojis.forEach((emoji, idx) => {
        const count = (counts == null ? void 0 : counts[idx]) ?? -1;
        const depleted = count === 0;
        const wrap = document.createElement("div");
        wrap.style.cssText = "position:relative;display:inline-flex;";
        const btn = document.createElement("button");
        btn.textContent = emoji;
        btn.dataset.idx = String(idx);
        btn.style.cssText = "pointer-events:auto;background:" + (depleted ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)") + ";border:1.5px solid " + (depleted ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.35)") + ";border-radius:18px;font-size:clamp(24px,7vmin,42px);width:clamp(56px,14vmin,78px);height:clamp(56px,14vmin,78px);cursor:" + (depleted ? "default" : "pointer") + ";touch-action:manipulation;user-select:none;display:flex;align-items:center;justify-content:center;transition:transform 0.1s ease,background 0.15s,box-shadow 0.15s,opacity 0.2s;box-shadow:" + (depleted ? "none" : "0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)") + ";opacity:" + (depleted ? "0.32" : "1") + ";";
        if (!depleted) {
          btn.addEventListener("pointerenter", () => {
            btn.style.background = "rgba(255,255,255,0.26)";
            btn.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.25)";
          });
          btn.addEventListener("pointerleave", () => {
            btn.style.transform = "scale(1)";
            btn.style.background = "rgba(255,255,255,0.18)";
            btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)";
          });
        }
        btn.addEventListener("pointerdown", () => {
          if (depleted) return;
          btn.style.transform = "scale(0.86)";
          btn.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";
        });
        btn.addEventListener("pointerup", () => {
          if (depleted) return;
          btn.style.transform = "scale(1)";
          this.onPress(idx);
        });
        if (count >= 0) {
          const badge = document.createElement("div");
          badge.textContent = String(count);
          badge.style.cssText = "position:absolute;top:-5px;right:-5px;min-width:clamp(16px,4vmin,22px);height:clamp(16px,4vmin,22px);background:" + (depleted ? "rgba(100,100,100,0.8)" : "rgba(0,0,0,0.75)") + ";color:" + (depleted ? "#888" : "#fff") + ";border-radius:999px;font-size:clamp(9px,2.4vmin,13px);font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;pointer-events:none;line-height:1;z-index:10;";
          wrap.appendChild(badge);
          this._badgeEls.set(idx, badge);
        }
        wrap.appendChild(btn);
        this.buttonsRow.appendChild(wrap);
      });
      this._fruitIcons = Array.from(
        this.buttonsRow.querySelectorAll("button")
      );
    }
    /**
     * Call every frame with the current beat (0–1 transient) and elapsed time.
     * Drives a BPM-locked bounce on the fruit emoji buttons.
     */
    setBeatEnergy(beat, energy, dt) {
      this._beatTime += dt;
      const BPM_HZ = 123.77 / 60;
      const bpmSine = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2) * 0.5 + 0.5;
      const scale = 1 + bpmSine * 0.08 * (0.4 + energy) + beat * 0.18;
      const rot = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2) * (8 + beat * 14);
      for (const el of this._fruitIcons) {
        el.style.transform = `scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
      }
    }
    /** Flash a button to give feedback */
    flashButton(emojiIndex, hadEffect) {
      const btn = this.buttonsRow.querySelector(`[data-idx="${emojiIndex}"]`);
      if (!btn) return;
      if (hadEffect) {
        btn.style.background = "rgba(74,222,128,0.45)";
        btn.style.boxShadow = "0 0 0 3px rgba(74,222,128,0.5),0 2px 8px rgba(0,0,0,0.25)";
        btn.style.animation = "none";
        void btn.offsetWidth;
        btn.style.animation = "hud-btn-pop 0.28s cubic-bezier(0.34,1.56,0.64,1)";
        setTimeout(() => {
          btn.style.background = "rgba(255,255,255,0.18)";
          btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)";
        }, 320);
      } else {
        btn.style.background = "rgba(248,113,113,0.45)";
        btn.style.boxShadow = "0 0 0 3px rgba(248,113,113,0.4),0 2px 8px rgba(0,0,0,0.25)";
        setTimeout(() => {
          btn.style.background = "rgba(255,255,255,0.18)";
          btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)";
        }, 320);
      }
    }
    /** Show result overlay */
    showResult(result, isLastStage, coconutsEarned, onAction, onCoconutDoober) {
      var _a;
      this.overlayEl.innerHTML = "";
      this.overlayEl.style.display = "flex";
      const cleared = result.state === "cleared";
      const card = document.createElement("div");
      card.className = "hud-overlay-card";
      card.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2.5vmin;background:rgba(15,15,25,0.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.14);border-radius:26px;padding:clamp(20px,5vmin,36px) clamp(24px,7vmin,52px);box-shadow:0 8px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.1);max-width:min(88vmin,360px);width:100%;";
      const icon = document.createElement("div");
      if (cleared) {
        (_a = this._resultMonkey) == null ? void 0 : _a.dispose();
        this._resultMonkey = new IntroMonkey(240, "floss");
        this._resultMonkey.canvas.style.cssText = "width:100%;height:auto;display:block;border-radius:16px;";
        icon.style.cssText = "width:100%;";
        icon.appendChild(this._resultMonkey.canvas);
      } else {
        icon.style.cssText = "font-size:clamp(44px,14vmin,80px);line-height:1;";
        icon.textContent = "😔";
      }
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:clamp(18px,5.5vmin,32px);font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.5);text-align:center;letter-spacing:-0.02em;";
      msg.textContent = cleared ? "All Stars Found!" : "Out of Bites!";
      const sub = document.createElement("div");
      sub.style.cssText = "font-size:clamp(12px,3.2vmin,18px);color:rgba(255,255,255,0.7);text-align:center;";
      sub.textContent = cleared ? `⭐ ${result.starsFound} / ${result.starsTotal} stars collected` : `Found ${result.starsFound} / ${result.starsTotal} stars — so close!`;
      card.appendChild(icon);
      card.appendChild(msg);
      if (cleared) {
        const starsEl = document.createElement("div");
        starsEl.style.cssText = "display:flex;gap:2.5vmin;font-size:clamp(30px,10vmin,58px);";
        for (let i = 0; i < 3; i++) {
          const s = document.createElement("span");
          s.textContent = "⭐";
          s.style.cssText = "display:inline-block;transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);";
          starsEl.appendChild(s);
          setTimeout(() => {
            s.style.transform = "scale(1.5) rotate(-6deg)";
            setTimeout(() => {
              s.style.transform = "scale(1) rotate(0deg)";
            }, 250);
          }, 180 + i * 140);
        }
        card.appendChild(starsEl);
        const bitesLeft = result.pressesAllowed - result.pressesUsed;
        const pct = bitesLeft / result.pressesAllowed;
        const bananas = pct > 0.5 ? 3 : pct > 0.2 ? 2 : 1;
        const perfEl = document.createElement("div");
        perfEl.style.cssText = "display:flex;gap:1.5vmin;font-size:clamp(18px,5.5vmin,32px);align-items:center;";
        const perfLabel = document.createElement("span");
        perfLabel.style.cssText = "font-size:clamp(10px,2.8vmin,15px);color:rgba(255,255,255,0.6);";
        perfLabel.textContent = "Efficiency:";
        perfEl.appendChild(perfLabel);
        for (let i = 0; i < 3; i++) {
          const b = document.createElement("span");
          b.textContent = i < bananas ? "🍌" : "🥥";
          b.style.cssText = "display:inline-block;" + (i < bananas ? "" : "opacity:0.3;filter:grayscale(1);");
          perfEl.appendChild(b);
        }
        card.appendChild(perfEl);
      }
      if (cleared && coconutsEarned > 0) {
        const earnRow = document.createElement("div");
        earnRow.style.cssText = "display:flex;align-items:center;justify-content:center;gap:2vmin;background:rgba(120,80,20,0.45);border:1px solid rgba(255,210,100,0.3);border-radius:14px;padding:clamp(8px,2vmin,12px) clamp(14px,4vmin,22px);width:100%;box-sizing:border-box;";
        const earnIcon = document.createElement("span");
        earnIcon.style.cssText = "font-size:clamp(20px,6vmin,32px);";
        earnIcon.textContent = "🥥";
        const earnText = document.createElement("span");
        earnText.style.cssText = "font-size:clamp(13px,3.8vmin,20px);font-weight:800;color:#ffe;";
        earnText.textContent = `+${coconutsEarned} Coconuts earned!`;
        earnRow.appendChild(earnIcon);
        earnRow.appendChild(earnText);
        card.appendChild(earnRow);
        if (onCoconutDoober) {
          setTimeout(() => {
            const r = earnRow.getBoundingClientRect();
            onCoconutDoober(r.left + r.width / 2, r.top + r.height / 2);
          }, 400);
        }
      }
      card.appendChild(sub);
      const btn = document.createElement("button");
      let btnBg = "#ef4444";
      let btnShadow = "rgba(239,68,68,0.4)";
      if (cleared && isLastStage) {
        btnBg = "#f59e0b";
        btnShadow = "rgba(245,158,11,0.4)";
      } else if (cleared) {
        btnBg = "#22c55e";
        btnShadow = "rgba(34,197,94,0.4)";
      }
      btn.style.cssText = "pointer-events:auto;color:#fff;border:none;border-radius:999px;font-size:clamp(15px,4.2vmin,24px);font-weight:800;letter-spacing:0.01em;padding:clamp(12px,3vmin,18px) clamp(28px,8vmin,52px);cursor:pointer;touch-action:manipulation;user-select:none;background:" + btnBg + ";box-shadow:0 6px 24px " + btnShadow + ",inset 0 1px 0 rgba(255,255,255,0.2);transition:transform 0.1s,box-shadow 0.1s;";
      btn.textContent = cleared && isLastStage ? "🏆 Play Again" : cleared ? "Next Stage →" : "Try Again 🔄";
      btn.addEventListener("pointerdown", () => {
        btn.style.transform = "scale(0.95)";
      });
      btn.addEventListener("pointerup", () => {
        btn.style.transform = "scale(1)";
      });
      btn.addEventListener("click", () => {
        this.hideOverlay();
        onAction();
      });
      card.appendChild(btn);
      this.overlayEl.appendChild(card);
    }
    hideOverlay() {
      var _a, _b;
      this.overlayEl.style.display = "none";
      this.overlayEl.innerHTML = "";
      (_a = this._introMonkey) == null ? void 0 : _a.dispose();
      this._introMonkey = null;
      (_b = this._resultMonkey) == null ? void 0 : _b.dispose();
      this._resultMonkey = null;
    }
    /** Show intro screen */
    showIntro(onStart) {
      var _a;
      (_a = this._introMonkey) == null ? void 0 : _a.dispose();
      this._introMonkey = null;
      this.overlayEl.innerHTML = "";
      this.overlayEl.style.display = "flex";
      const card = document.createElement("div");
      card.className = "hud-overlay-card";
      card.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2vmin;background:rgba(15,15,25,0.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.14);border-radius:26px;padding:clamp(20px,5vmin,36px) clamp(24px,7vmin,52px);box-shadow:0 8px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.1);max-width:min(88vmin,360px);width:100%;";
      this._introMonkey = new IntroMonkey(240);
      this._introMonkey.canvas.style.cssText = "width:100%;height:auto;display:block;border-radius:16px;";
      const icon = document.createElement("div");
      icon.style.cssText = "width:100%;";
      icon.appendChild(this._introMonkey.canvas);
      const title = document.createElement("div");
      title.style.cssText = "font-size:clamp(24px,7.5vmin,44px);font-weight:900;letter-spacing:-0.03em;text-align:center;background:linear-gradient(135deg,#ffe066 0%,#ffb347 55%,#ff6b35 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));";
      title.textContent = "Munchy Monkey: Munch-3 Puzzle";
      const steps = [
        ["👆", "Drag the fruit to rotate it"],
        ["🍊", "Tap a fruit button to eat emojis"],
        ["⭐", "Uncover all 3 hidden stars to win!"]
      ];
      const stepsEl = document.createElement("div");
      stepsEl.style.cssText = "display:flex;flex-direction:column;gap:2vmin;width:100%;";
      for (const [emoji, text] of steps) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:3vmin;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:clamp(8px,2vmin,12px) clamp(12px,3vmin,18px);";
        const em = document.createElement("span");
        em.style.cssText = "font-size:clamp(20px,6vmin,30px);flex-shrink:0;";
        em.textContent = emoji;
        const tx = document.createElement("span");
        tx.style.cssText = "font-size:clamp(12px,3.2vmin,17px);color:rgba(255,255,255,0.88);font-weight:600;line-height:1.3;";
        tx.textContent = text;
        row.appendChild(em);
        row.appendChild(tx);
        stepsEl.appendChild(row);
      }
      const btn = document.createElement("button");
      btn.style.cssText = "pointer-events:auto;background:#f59e0b;color:#fff;border:none;border-radius:999px;font-size:clamp(16px,4.8vmin,26px);font-weight:800;letter-spacing:0.01em;padding:clamp(13px,3.2vmin,20px) clamp(30px,9vmin,60px);cursor:pointer;touch-action:manipulation;user-select:none;box-shadow:0 6px 24px rgba(245,158,11,0.5),inset 0 1px 0 rgba(255,255,255,0.2);transition:transform 0.1s,box-shadow 0.1s;";
      btn.textContent = "Start Munching! 🍌";
      btn.addEventListener("pointerdown", () => {
        btn.style.transform = "scale(0.95)";
      });
      btn.addEventListener("pointerup", () => {
        btn.style.transform = "scale(1)";
      });
      btn.addEventListener("click", () => {
        this.hideOverlay();
        onStart();
      });
      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(stepsEl);
      card.appendChild(btn);
      this.overlayEl.appendChild(card);
    }
  }
  const prefix = () => {
    try {
      return globalThis.__WIM_STORAGE_PREFIX || "";
    } catch {
      return "";
    }
  };
  function storageGet(key, defaultValue) {
    try {
      const raw = localStorage.getItem(prefix() + key);
      if (raw === null) return defaultValue;
      try {
        return JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    } catch {
      return defaultValue;
    }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(prefix() + key, JSON.stringify(value));
    } catch {
      return;
    }
  }
  const STORAGE_KEY = "coconutBalance";
  const POWERUP_COST = 5;
  const STAGE_CLEAR_REWARD = 3;
  const STARTING_BALANCE = 10;
  class CoconutWallet {
    constructor() {
      this._onChange = null;
      this._balance = storageGet(STORAGE_KEY, STARTING_BALANCE);
    }
    get balance() {
      return this._balance;
    }
    /** Register a listener called whenever the balance changes */
    onChange(cb) {
      this._onChange = cb;
    }
    /** Returns true if the player can afford `cost` coconuts */
    canAfford(cost = POWERUP_COST) {
      return this._balance >= cost;
    }
    /**
     * Spend `cost` coconuts. Returns true on success, false if insufficient funds.
     */
    spend(cost = POWERUP_COST) {
      var _a;
      if (this._balance < cost) return false;
      this._balance -= cost;
      this._save();
      (_a = this._onChange) == null ? void 0 : _a.call(this, this._balance);
      return true;
    }
    /**
     * Earn `amount` coconuts and return the new balance.
     */
    earn(amount = STAGE_CLEAR_REWARD) {
      var _a;
      this._balance += amount;
      this._save();
      (_a = this._onChange) == null ? void 0 : _a.call(this, this._balance);
      return this._balance;
    }
    _save() {
      storageSet(STORAGE_KEY, this._balance);
    }
  }
  const DEFS = [
    {
      id: "banana",
      icon: "🍌",
      label: "Peel",
      color: "#f59e0b",
      tip: "🍌 Banana Peel\nSweeps off the outer layer of emojis!"
    },
    {
      id: "xray",
      icon: "🕶️",
      label: "X-Ray",
      color: "#06b6d4",
      tip: "🕶️ X-Ray Vision\nMakes emojis see-through so you can spot the stars!"
    },
    {
      id: "megabomb",
      icon: "💣",
      label: "Mega",
      color: "#ef4444",
      tip: "💣 Mega Bomb\nThrown at the fruit — blasts a big area of emojis!"
    },
    {
      id: "frenzy",
      icon: "🐒",
      label: "Frenzy",
      color: "#8b5cf6",
      tip: "🐒 Frenzy!\nMonkey goes wild and auto-eats 3 random bites!"
    }
  ];
  class PowerUpHUD {
    constructor(container2, onUse) {
      this.buttons = /* @__PURE__ */ new Map();
      this._iconEls = [];
      this._xrayLocked = false;
      this._beatTime = 0;
      this.onUse = onUse;
      this.root = document.createElement("div");
      this.root.style.cssText = "display:flex;justify-content:center;gap:2vmin;pointer-events:auto;padding:clamp(6px,1.8vmin,10px) clamp(10px,3vmin,18px);flex-wrap:nowrap;background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:999px;box-shadow:0 4px 20px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);";
      for (const def of DEFS) {
        const btn = document.createElement("button");
        btn.dataset.id = def.id;
        btn.style.cssText = `background:${def.color};color:#fff;border:none;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5vmin;width:clamp(52px,13vmin,70px);height:clamp(52px,13vmin,70px);font-size:clamp(20px,5.5vmin,30px);line-height:1;cursor:pointer;touch-action:manipulation;user-select:none;box-shadow:0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);transition:transform 0.1s ease,opacity 0.2s,box-shadow 0.15s;`;
        const iconEl = document.createElement("div");
        iconEl.textContent = def.icon;
        iconEl.style.display = "inline-block";
        this._iconEls.push(iconEl);
        const labelEl = document.createElement("div");
        labelEl.textContent = def.label;
        labelEl.style.cssText = "font-size:clamp(8px,2vmin,11px);font-weight:700;line-height:1;";
        const costEl = document.createElement("div");
        costEl.textContent = `🥥×${POWERUP_COST}`;
        costEl.style.cssText = "font-size:clamp(7px,1.8vmin,10px);font-weight:700;line-height:1;opacity:0.85;letter-spacing:0.01em;";
        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.appendChild(costEl);
        let tipEl = null;
        let holdTimer = null;
        const showTip = () => {
          if (tipEl) return;
          tipEl = document.createElement("div");
          tipEl.style.cssText = "position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.88);color:#fff;border-radius:10px;padding:8px 12px;font-size:clamp(10px,2.8vmin,14px);font-weight:600;white-space:pre;text-align:center;pointer-events:none;z-index:50;backdrop-filter:blur(6px);line-height:1.4;min-width:120px;box-shadow:0 4px 16px rgba(0,0,0,0.4);";
          tipEl.textContent = def.tip;
          btn.style.position = "relative";
          btn.appendChild(tipEl);
        };
        const hideTip = () => {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          tipEl == null ? void 0 : tipEl.remove();
          tipEl = null;
        };
        btn.addEventListener("pointerenter", () => {
          if (btn.disabled) return;
          btn.style.transform = "scale(1.06)";
          btn.style.boxShadow = "0 6px 18px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3)";
        });
        btn.addEventListener("pointerdown", () => {
          if (btn.disabled) return;
          btn.style.transform = "scale(0.9)";
          btn.style.boxShadow = "0 1px 6px rgba(0,0,0,0.3)";
          holdTimer = setTimeout(showTip, 400);
        });
        btn.addEventListener("pointerup", () => {
          btn.style.transform = "scale(1)";
          btn.style.boxShadow = "0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)";
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          if (!tipEl && !btn.disabled) this.onUse(def.id);
          hideTip();
        });
        btn.addEventListener("pointerleave", () => {
          btn.style.transform = "scale(1)";
          btn.style.boxShadow = "0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)";
          hideTip();
        });
        this.buttons.set(def.id, btn);
        this.root.appendChild(btn);
      }
      container2.appendChild(this.root);
      this.overlayRoot = document.createElement("div");
      this.overlayRoot.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:15;";
      container2.appendChild(this.overlayRoot);
    }
    getBar() {
      return this.root;
    }
    /** Drive BPM-locked bounce on power-up button icons each frame. */
    setBeatEnergy(beat, energy, dt) {
      this._beatTime += dt;
      const BPM_HZ = 123.77 / 60;
      this._iconEls.forEach((el, i) => {
        const phase = i * (Math.PI / 2);
        const bpmSine = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2 + phase) * 0.5 + 0.5;
        const scale = 1 + bpmSine * 0.1 * (0.4 + energy) + beat * 0.2;
        el.style.transform = `scale(${scale.toFixed(3)})`;
      });
    }
    /**
     * Permanently lock X-Ray for this stage (it stays on once triggered).
     * Other power-ups are never permanently disabled — they’re reusable.
     */
    lockXRay() {
      this._xrayLocked = true;
      const btn = this.buttons.get("xray");
      if (!btn) return;
      btn.disabled = true;
      btn.style.opacity = "0.3";
      btn.style.cursor = "default";
      btn.style.filter = "grayscale(0.7)";
      btn.style.boxShadow = "none";
    }
    /**
     * Update all buttons’ visual state based on whether the player can afford them.
     * Buttons the player can’t afford are dimmed but NOT disabled (so the tap
     * still registers and main.ts can show a “not enough coconuts” response).
     */
    setAffordable(canAfford) {
      for (const [id, btn] of this.buttons) {
        if (id === "xray" && this._xrayLocked) continue;
        if (canAfford) {
          btn.style.opacity = "1";
          btn.style.filter = "none";
          btn.style.boxShadow = "0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)";
        } else {
          btn.style.opacity = "0.45";
          btn.style.filter = "grayscale(0.4) brightness(0.8)";
          btn.style.boxShadow = "none";
        }
      }
    }
    /** Reset for a new stage: unlock all (except xray lock is cleared too on new stage) */
    resetAll() {
      this._xrayLocked = false;
      for (const [, btn] of this.buttons) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.style.filter = "none";
        btn.style.boxShadow = "0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)";
      }
    }
    /** @deprecated Use lockXRay() for xray; other power-ups are now reusable */
    disableButton(id) {
      if (id === "xray") this.lockXRay();
    }
    // ── Overlay animations ────────────────────────────────────────────────────────
    /**
     * Banana peel animation: 🍌 falls top-to-bottom upright.
     * onProgress(frac) is called each frame with 0–1 (how far down the screen
     * the banana centre is) so the caller can eat rows progressively.
     * onDone() is called when the banana exits the bottom.
     */
    /**
     * Banana peel animation: 🍌 falls top-to-bottom.
     * onProgress receives the banana element's current bottom-edge screen-Y
     * in viewport pixels so callers can compare against sprite screen positions.
     */
    animateBananaPeel(onProgress, onDone) {
      const el = document.createElement("div");
      el.textContent = "🍌";
      el.style.cssText = "position:absolute;font-size:clamp(80px,28vmin,160px);left:50%;transform:translateX(-50%);top:-22%;pointer-events:none;will-change:transform;";
      this.overlayRoot.appendChild(el);
      const DURATION = 1400;
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now() - start;
        const frac = Math.min(1, elapsed / DURATION);
        const eased = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
        el.style.top = `${-22 + eased * 144}%`;
        const rect = el.getBoundingClientRect();
        onProgress(rect.bottom);
        if (frac < 1) {
          requestAnimationFrame(tick);
        } else {
          el.remove();
          onDone();
        }
      };
      requestAnimationFrame(tick);
    }
    /** Show mock ad modal, calls onDone after 3 s */
    showAdModal(onDone) {
      const modal = document.createElement("div");
      modal.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3vmin;background:rgba(0,0,0,0.82);z-index:30;pointer-events:auto;";
      const adBox = document.createElement("div");
      adBox.style.cssText = "width:min(85vmin,340px);background:#1e293b;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
      const adHeader = document.createElement("div");
      adHeader.style.cssText = "background:#f59e0b;color:#fff;font-size:clamp(10px,2.5vmin,14px);font-weight:700;padding:6px 12px;text-align:right;letter-spacing:0.05em;";
      adHeader.textContent = "AD";
      const adContent = document.createElement("div");
      adContent.style.cssText = "padding:5vmin;text-align:center;color:#fff;font-family:'Comic Sans MS','Comic Sans',cursive;";
      const adIcon = document.createElement("div");
      adIcon.style.cssText = "font-size:clamp(48px,16vmin,90px);margin-bottom:2vmin;";
      adIcon.textContent = "🍌";
      const adTitle = document.createElement("div");
      adTitle.style.cssText = "font-size:clamp(16px,5vmin,28px);font-weight:900;margin-bottom:1vmin;";
      adTitle.textContent = "Monkey Munch Premium";
      const adSub = document.createElement("div");
      adSub.style.cssText = "font-size:clamp(11px,3vmin,16px);color:rgba(255,255,255,0.7);margin-bottom:3vmin;";
      adSub.textContent = "Unlimited power-ups & no ads!\nOnly $2.99/month";
      const timer = document.createElement("div");
      timer.style.cssText = "font-size:clamp(11px,3vmin,15px);color:rgba(255,255,255,0.5);";
      timer.textContent = "Ad closes in 3…";
      adContent.appendChild(adIcon);
      adContent.appendChild(adTitle);
      adContent.appendChild(adSub);
      adContent.appendChild(timer);
      adBox.appendChild(adHeader);
      adBox.appendChild(adContent);
      modal.appendChild(adBox);
      this.overlayRoot.appendChild(modal);
      modal.style.pointerEvents = "auto";
      let t = 3;
      const tick = setInterval(() => {
        t--;
        timer.textContent = t > 0 ? `Ad closes in ${t}…` : "Closing…";
        if (t <= 0) {
          clearInterval(tick);
          modal.remove();
          onDone();
        }
      }, 1e3);
    }
    /** Show the "out of bites" modal with retry / watch-ad options */
    showOutOfBitesModal(starsFound, starsTotal, onRetry, onWatchAd) {
      const modal = document.createElement("div");
      modal.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3vmin;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:25;pointer-events:auto;font-family:'Comic Sans MS','Comic Sans',cursive;";
      const icon = document.createElement("div");
      icon.style.cssText = "font-size:clamp(44px,14vmin,80px);";
      icon.textContent = "😮";
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:clamp(18px,5.5vmin,32px);font-weight:800;color:#fff;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.5);";
      msg.textContent = "Out of Bites!";
      const sub = document.createElement("div");
      sub.style.cssText = "font-size:clamp(12px,3.5vmin,18px);color:rgba(255,255,255,0.85);text-align:center;";
      sub.textContent = `Found ${starsFound} / ${starsTotal} stars`;
      const adBtn = document.createElement("button");
      adBtn.style.cssText = "pointer-events:auto;background:#f59e0b;color:#fff;border:none;border-radius:16px;font-size:clamp(14px,4.5vmin,24px);font-weight:800;padding:clamp(12px,3vmin,18px) clamp(24px,7vmin,48px);cursor:pointer;touch-action:manipulation;box-shadow:0 5px 18px rgba(245,158,11,0.4);";
      adBtn.textContent = "📺 Watch Ad → +3 Bites";
      adBtn.addEventListener("click", () => {
        modal.remove();
        onWatchAd();
      });
      const retryBtn = document.createElement("button");
      retryBtn.style.cssText = "pointer-events:auto;background:rgba(255,255,255,0.15);color:#fff;border:2px solid rgba(255,255,255,0.4);border-radius:16px;font-size:clamp(13px,3.8vmin,20px);font-weight:600;padding:clamp(10px,2.5vmin,15px) clamp(20px,6vmin,40px);cursor:pointer;touch-action:manipulation;";
      retryBtn.textContent = "🔄 Restart Stage";
      retryBtn.addEventListener("click", () => {
        modal.remove();
        onRetry();
      });
      modal.appendChild(icon);
      modal.appendChild(msg);
      modal.appendChild(sub);
      modal.appendChild(adBtn);
      modal.appendChild(retryBtn);
      this.overlayRoot.appendChild(modal);
    }
  }
  const VERT = (
    /* glsl */
    `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0); // clip-space, always behind
}
`
  );
  const FRAG = (
    /* glsl */
    `
precision mediump float;
varying vec2 vUv;

uniform float uTime;
uniform float uEnergy;   // smoothed amplitude  0-1
uniform float uBeat;     // transient beat       0-1
uniform float uAspect;   // width / height

// HSL → RGB helper
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = mod(h * 6.0, 6.0);
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 m = vec3(l - c * 0.5);
  if (hp < 1.0) return m + vec3(c, x, 0.0);
  if (hp < 2.0) return m + vec3(x, c, 0.0);
  if (hp < 3.0) return m + vec3(0.0, c, x);
  if (hp < 4.0) return m + vec3(0.0, x, c);
  if (hp < 5.0) return m + vec3(x, 0.0, c);
  return m + vec3(c, 0.0, x);
}

void main() {
  vec2 uv = vUv;
  // aspect-correct UV centred at 0,0
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  // --- continuous rotation ---
  // Rotate the whole coordinate space slowly around the centre.
  // Speed: one full turn every ~50 s, gentle and hypnotic.
  float rotAngle = uTime * 0.126;  // ~7.2 deg/s
  float cosR = cos(rotAngle);
  float sinR = sin(rotAngle);
  p = vec2(cosR * p.x - sinR * p.y,
           sinR * p.x + cosR * p.y);

  float dist = length(p);

  // --- hue cycling ---
  // base hue drifts slowly, offset by angle so it swirls
  float angle = atan(p.y, p.x);
  float hueBase = mod(uTime * 0.08, 1.0);
  float hue = mod(hueBase + dist * 0.35 + angle / (2.0 * 3.14159) * 0.25, 1.0);

  // saturation & lightness: richer toward edges, brighter base
  float sat = 0.88 + uEnergy * 0.12;
  // Raised floor: centre starts at 0.28 (was 0.12), edge reaches ~0.52
  float lit = 0.28 + dist * 0.24 + uEnergy * 0.10;
  lit = clamp(lit, 0.22, 0.62);

  vec3 col = hsl2rgb(hue, sat, lit);

  // --- radial pulse rings driven by beat ---
  // 4 rings travel outward at a steady pace; beat gently swells their width.
  // Rings are evenly spaced (phase step = 0.25) and travel out to radius 1.1
  // so they clear the screen before looping — no clustering.
  float beatPulse = uBeat;
  float ringCount = 4.0;
  for (float i = 0.0; i < 4.0; i++) {
    float phase   = i / ringCount;             // 0, 0.25, 0.5, 0.75
    // constant travel speed — beat does NOT modulate speed
    float rRadius = mod(phase + uTime * 0.12, 1.0) * 1.1;
    // width: thin baseline, swells softly on beat (no flicker)
    float ringW   = 0.018 + beatPulse * 0.022;
    float ringVal = smoothstep(ringW, 0.0, abs(dist - rRadius));
    float ringHue = mod(hueBase + phase * 0.7 + 0.4, 1.0);
    vec3 ringCol  = hsl2rgb(ringHue, 1.0, 0.62 + beatPulse * 0.15);
    // opacity: gentle blend, beat adds a soft glow (not a hard flash)
    col = mix(col, ringCol, ringVal * (0.45 + beatPulse * 0.25));
  }

  // --- waveform bars: vertical frequency bars at bottom, audio-reactive ---
  // Simulate 16 vertical bars across the width that pulse with energy
  float barCount = 16.0;
  float barIdx   = floor(uv.x * barCount);
  float barFrac  = fract(uv.x * barCount);
  // each bar has a slightly different phase offset to create a waveform look
  float barPhase = barIdx / barCount;
  float barHeight = (0.04 + 0.18 * uEnergy) * (0.5 + 0.5 * sin(uTime * 3.0 + barPhase * 12.566));
  barHeight = max(barHeight, 0.01);
  float barY = 1.0 - uv.y; // flip: bars grow from bottom
  float inBar = step(barY, barHeight) * step(0.05, barFrac) * step(barFrac, 0.95);
  float barHue = mod(hueBase + barPhase * 0.6, 1.0);
  vec3 barCol = hsl2rgb(barHue, 1.0, 0.6 + uEnergy * 0.25);
  col = mix(col, barCol, inBar * 0.65);

  // --- beat brightness flash ---
  // On each beat, lift the whole image toward white smoothly.
  // uBeat is already a fast-attack/slow-decay envelope so this feels punchy
  // without flickering. Strength: up to +0.22 brightness at peak beat.
  col += uBeat * 0.22;

  // --- vignette ---
  // Lightened floor (0.72, was 0.55) so the centre stays visible and lively.
  float vig = 1.0 - smoothstep(0.28, 0.82, dist);
  col *= mix(0.72, 1.0, vig);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
  );
  class TrippyBackground {
    constructor(scene2) {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uBeat: { value: 0 },
          uAspect: { value: GAME_WIDTH / GAME_HEIGHT }
        },
        depthWrite: false,
        depthTest: false
      });
      const geo = new THREE.PlaneGeometry(2, 2);
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.renderOrder = -1e3;
      this.mesh.frustumCulled = false;
      scene2.add(this.mesh);
    }
    /** Call each frame with elapsed time and audio values */
    update(time, energy, beat) {
      this.mat.uniforms.uTime.value = time;
      this.mat.uniforms.uEnergy.value = energy;
      this.mat.uniforms.uBeat.value = beat;
    }
    /** Call when the canvas is resized */
    setAspect(aspect) {
      this.mat.uniforms.uAspect.value = aspect;
    }
  }
  class MunchParticles {
    constructor() {
      this.particles = [];
    }
    /**
     * Begin tweening a sprite toward the monkey mouth.
     * Call immediately on munch trigger — no re-parenting, no hiding.
     * @param sprite    The sprite to animate (stays in its current parent)
     * @param getTarget Returns the mouth world position each frame
     * @param duration  How long the tween takes (match monkey jump peak)
     */
    spawn(sprite, getTarget, duration = 0.32) {
      const parent = sprite.parent;
      if (!parent) return;
      this.particles.push({
        sprite,
        parent,
        startLocal: sprite.position.clone(),
        originalScale: sprite.scale.x,
        t: 0,
        duration,
        getTarget
      });
    }
    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t = Math.min(1, p.t + dt / p.duration);
        const ease = p.t * p.t;
        const worldTarget = p.getTarget();
        const localTarget = p.parent.worldToLocal(worldTarget.clone());
        p.sprite.position.lerpVectors(p.startLocal, localTarget, ease);
        const scaleFrac = p.t < 0.6 ? 1 : Math.max(0, 1 - (p.t - 0.6) / 0.4);
        p.sprite.scale.setScalar(p.originalScale * scaleFrac);
        if (p.t >= 1) {
          p.sprite.visible = false;
          p.sprite.position.copy(p.startLocal);
          p.sprite.scale.setScalar(p.originalScale);
          this.particles.splice(i, 1);
        }
      }
    }
    dispose() {
      for (const p of this.particles) {
        p.sprite.visible = false;
      }
      this.particles = [];
    }
  }
  hardenViewport();
  hardenGestures();
  const bgm = document.createElement("audio");
  bgm.src = "assets/dk-rap.mp3";
  bgm.loop = true;
  bgm.volume = 0.45;
  bgm.preload = "auto";
  const munchSfx = document.createElement("audio");
  munchSfx.src = "assets/munch-sound-effect.mp3";
  munchSfx.volume = 0.75;
  munchSfx.preload = "auto";
  function playMunch() {
    munchSfx.currentTime = 0;
    munchSfx.play().catch(() => {
    });
  }
  const failSfx = document.createElement("audio");
  failSfx.src = "assets/priceisrightfail_1.mp3";
  failSfx.volume = 0.85;
  failSfx.preload = "auto";
  function playFail() {
    failSfx.currentTime = 0;
    failSfx.play().catch(() => {
    });
  }
  const successSfx = document.createElement("audio");
  successSfx.src = "assets/jet-set-radio-success.mp3";
  successSfx.volume = 0.85;
  successSfx.preload = "auto";
  function playSuccess() {
    successSfx.currentTime = 0;
    successSfx.play().catch(() => {
    });
  }
  const starSfx = document.createElement("audio");
  starSfx.src = "assets/anime-wow-sound-effect-mp3cut.mp3";
  starSfx.volume = 0.8;
  starSfx.preload = "auto";
  function playStar() {
    starSfx.currentTime = 0;
    starSfx.play().catch(() => {
    });
  }
  const bananaSfx = document.createElement("audio");
  bananaSfx.src = "assets/banana-peel-slip.mp3";
  bananaSfx.volume = 0.45;
  bananaSfx.preload = "auto";
  function playBananaPeel() {
    bananaSfx.currentTime = 0;
    bananaSfx.play().catch(() => {
    });
  }
  const xraySfx = document.createElement("audio");
  xraySfx.src = "assets/splinter-cell-night-vision-goggle-sound-effect.mp3";
  xraySfx.volume = 0.3;
  xraySfx.preload = "auto";
  function playXRay() {
    xraySfx.currentTime = 0;
    xraySfx.play().catch(() => {
    });
  }
  const explosionSfx = document.createElement("audio");
  explosionSfx.src = "assets/explosion_1.mp3";
  explosionSfx.volume = 0.7;
  explosionSfx.preload = "auto";
  function playExplosion() {
    explosionSfx.currentTime = 0;
    explosionSfx.play().catch(() => {
    });
  }
  const chimpSfx = document.createElement("audio");
  chimpSfx.src = "assets/chimpanzee-laugh.mp3";
  chimpSfx.volume = 0.7;
  chimpSfx.preload = "auto";
  function playChimp() {
    chimpSfx.currentTime = 0;
    chimpSfx.play().catch(() => {
    });
  }
  const saiyanSfx = document.createElement("audio");
  saiyanSfx.src = "assets/saiyan.mp3";
  saiyanSfx.volume = 0.3;
  saiyanSfx.preload = "auto";
  let _saiyanFadeRaf = 0;
  function playSaiyan() {
    cancelAnimationFrame(_saiyanFadeRaf);
    saiyanSfx.volume = 0.3;
    saiyanSfx.currentTime = 0;
    saiyanSfx.play().catch(() => {
    });
  }
  function fadeSaiyan() {
    cancelAnimationFrame(_saiyanFadeRaf);
    const step = () => {
      saiyanSfx.volume = Math.max(0, saiyanSfx.volume - 0.04);
      if (saiyanSfx.volume > 0) {
        _saiyanFadeRaf = requestAnimationFrame(step);
      } else {
        saiyanSfx.pause();
      }
    };
    _saiyanFadeRaf = requestAnimationFrame(step);
  }
  const analyser = new AudioAnalyser();
  let bgmStarted = false;
  function startBGM() {
    if (bgmStarted) return;
    bgmStarted = true;
    analyser.connect(bgm);
    bgm.play().catch(() => {
    });
    analyser.resume();
  }
  document.addEventListener("pointerdown", startBGM, { once: true });
  const container = document.getElementById("game");
  if (!container) throw new Error("#game container not found");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
  configureRenderer(renderer);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.style.background = "#000";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  renderer.setClearColor(0, 0);
  const trippyBg = new TrippyBackground(scene);
  const camera = new THREE.PerspectiveCamera(54, GAME_WIDTH / GAME_HEIGHT, 0.1, 100);
  camera.position.set(0, -2.6, 7.5);
  camera.lookAt(0, -2.6, 0);
  observeContainerResize(container, renderer, camera);
  createLightingRig(scene);
  const monkey = new MonkeyModel();
  monkey.group.scale.setScalar(0.82);
  monkey.setBaseY(-4.5);
  scene.add(monkey.group);
  const FRUIT_Y = -2.1;
  const fruitPivot = new THREE.Group();
  fruitPivot.position.set(0, FRUIT_Y, 0);
  scene.add(fruitPivot);
  monkey.setFruitWorldY(FRUIT_Y);
  const wallet = new CoconutWallet();
  const munchParticles = new MunchParticles();
  let gameStarted = false;
  let pendingResult = null;
  const hud = new GameHUD(container, (emojiIndex) => {
    var _a;
    if (!gameStarted || pendingResult) return;
    const result = stageManager.pressButton(emojiIndex);
    if (result) {
      hud.flashButton(emojiIndex, result.starsFound > 0 || result.state === "playing");
      hud.updateStage(stageManager.getCurrentInfo());
      if ((_a = result.eatSprites) == null ? void 0 : _a.length) {
        const getTarget = () => monkey.getMouthWorldPos();
        result.eatSprites.forEach(({ sprite }) => {
          munchParticles.spawn(sprite, getTarget);
        });
      }
    }
  });
  hud.updateCoconuts(wallet.balance);
  hud.addBuyCoconutsButton(() => {
    powerupHUD.showAdModal(() => {
      const AD_REWARD = 10;
      wallet.earn(AD_REWARD);
      const rect = renderer.domElement.getBoundingClientRect();
      hud.punchCoconuts(AD_REWARD, rect.left + rect.width / 2, rect.top + rect.height * 0.5);
    });
  });
  wallet.onChange((bal) => {
    hud.updateCoconuts(bal);
    powerupHUD.setAffordable(bal >= POWERUP_COST);
  });
  const stageManager = new StageManager(
    fruitPivot,
    // splat groups are children of the fruitPivot
    renderer.domElement,
    (info) => {
      hud.updateStage(info);
    },
    (result) => {
      pendingResult = result;
      const isLast = false;
      if (result.state === "failed") {
        playFail();
        setTimeout(() => {
          powerupHUD.showOutOfBitesModal(
            result.starsFound,
            result.starsTotal,
            () => {
              pendingResult = null;
              stageManager.restartStage();
              onStageStarted();
            },
            () => {
              powerupHUD.showAdModal(() => {
                pendingResult = null;
                stageManager.addBites(5);
                hud.updateStage(stageManager.getCurrentInfo());
              });
            }
          );
        }, 600);
      } else {
        playSuccess();
        const earned = result.state === "cleared" ? STAGE_CLEAR_REWARD : 0;
        if (earned > 0) wallet.earn(earned);
        setTimeout(() => {
          hud.showResult(
            result,
            isLast,
            earned,
            () => {
              pendingResult = null;
              stageManager.nextStage();
              onStageStarted();
            },
            // Coconut doober: fly from earn row to counter
            (originX, originY) => {
              hud.punchCoconuts(earned, originX, originY);
            }
          );
        }, 800);
      }
    }
  );
  function worldToViewport(worldPos) {
    const ndc = worldPos.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height
    };
  }
  let starsCollectedThisStage = 0;
  stageManager.onEatSpritesCallback((sprites) => {
    const getTarget = () => monkey.getMouthWorldPos();
    sprites.forEach(({ sprite }) => {
      munchParticles.spawn(sprite, getTarget);
    });
  });
  stageManager.onMunchCallback((emojiIndex, newStars) => {
    monkey.triggerMunch();
    playMunch();
    if (newStars > 0) {
      playStar();
      for (let i = 0; i < newStars; i++) {
        const splat = stageManager.splat;
        const worldPos = (splat == null ? void 0 : splat.getLastRevealedStarWorldPos()) ?? null;
        const slotIndex = starsCollectedThisStage;
        starsCollectedThisStage++;
        if (worldPos) {
          const vp = worldToViewport(worldPos);
          hud.punchStars(slotIndex, vp.x, vp.y);
        } else {
          const rect = renderer.domElement.getBoundingClientRect();
          hud.punchStars(slotIndex, rect.left + rect.width / 2, rect.top + rect.height * 0.35);
        }
      }
      setTimeout(() => {
        var _a;
        const revealed = ((_a = stageManager.splat) == null ? void 0 : _a.starsRevealed) ?? 0;
        hud.reconcileStars(revealed);
      }, 700);
    }
  });
  stageManager.onItemCallback((type, detail) => {
    hud.showItemToast(type, detail);
    if (type === "bomb") {
      playExplosion();
      hud.updateStage(stageManager.getCurrentInfo());
    }
    if (type === "extrabites") playChimp();
  });
  const powerupHUD = new PowerUpHUD(container, (id) => {
    if (!gameStarted || pendingResult) return;
    if (id === "xray") {
      const ok = stageManager.useXRay();
      if (ok) {
        playXRay();
        powerupHUD.lockXRay();
        monkey.showSunglasses();
      }
      return;
    }
    if (!wallet.canAfford()) {
      hud.showItemToast("broke", 0);
      return;
    }
    wallet.spend();
    if (id === "banana") {
      playBananaPeel();
      const canvasRect = renderer.domElement.getBoundingClientRect();
      stageManager.prepareBananaPeel(camera, canvasRect);
      powerupHUD.animateBananaPeel(
        (bananaScreenY) => {
          stageManager.eatBananaRow(bananaScreenY);
          hud.updateStage(stageManager.getCurrentInfo());
        },
        () => {
          var _a;
          (_a = stageManager.splat) == null ? void 0 : _a.clearPeelCache();
          hud.updateStage(stageManager.getCurrentInfo());
        }
      );
    }
    if (id === "megabomb") {
      const splat = stageManager.splat;
      const target = splat ? splat.getRandomSurfaceWorldPos() : (() => {
        const v = new THREE.Vector3();
        fruitPivot.getWorldPosition(v);
        return v;
      })();
      monkey.throwBomb(scene, target, () => {
        if (pendingResult) return;
        playExplosion();
        stageManager.useMegaBomb(target);
        hud.updateStage(stageManager.getCurrentInfo());
        if (!pendingResult && stageManager.splat) {
          const info = stageManager.getCurrentInfo();
          if (info.starsFound >= info.starsTotal) stageManager.forceCheckWin();
        }
      });
    }
    if (id === "frenzy") {
      playSaiyan();
      stageManager.startFrenzy(3, () => {
        hud.updateStage(stageManager.getCurrentInfo());
        fadeSaiyan();
      });
    }
  });
  hud.attachPowerUpBar(powerupHUD.getBar());
  function onStageStarted() {
    starsCollectedThisStage = 0;
    hud.resetStars();
    powerupHUD.resetAll();
    powerupHUD.setAffordable(wallet.canAfford());
    monkey.hideSunglasses();
    hud.showDragHint();
    const splat = stageManager.splat;
    if (!splat) return;
    splat.onDrag((rotX, rotY, isDragging) => {
      if (isDragging) hud.dismissDragHint();
      monkey.setFruitRotation(rotX, rotY, isDragging);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "p" && e.key !== "P") return;
    if (!gameStarted || pendingResult) return;
    stageManager.debugClear();
  });
  hud.showIntro(() => {
    gameStarted = true;
    stageManager.startFirst();
    onStageStarted();
  });
  const clock = new THREE.Clock();
  function animate() {
    var _a;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    analyser.update(dt);
    const beat = analyser.getBeat();
    const energy = analyser.getEnergy();
    trippyBg.update(clock.elapsedTime, energy, beat);
    hud.setBeatEnergy(beat, energy, dt);
    powerupHUD.setBeatEnergy(beat, energy, dt);
    if (gameStarted) {
      stageManager.update(dt);
      (_a = stageManager.splat) == null ? void 0 : _a.setDanceEnergy(beat);
      if (stageManager.isFrenzyActive) monkey.triggerMunch();
    }
    monkey.setDanceEnergy(energy);
    monkey.update(dt);
    munchParticles.update(dt);
    renderer.render(scene, camera);
  }
  animate();
})();
//# sourceMappingURL=game.js.map
