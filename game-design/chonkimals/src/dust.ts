/**
 * Footstep dust — a small pool of camera-facing soft sprites, puffed at the
 * frog's feet on each stride (and a burst on landing) to sell ground contact.
 *
 * Pure three.js primitives (Sprites + a procedural radial CanvasTexture), no
 * addons — publish-safe. Sprites respect scene.fog, so distant dust fades.
 */
type Scene = InstanceType<typeof THREE.Scene>;
type Sprite = InstanceType<typeof THREE.Sprite>;
type SpriteMaterial = InstanceType<typeof THREE.SpriteMaterial>;

function softDustTexture(): InstanceType<typeof THREE.CanvasTexture> {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Puff {
  sprite: Sprite;
  mat: SpriteMaterial;
  active: boolean;
  age: number;
  life: number;
  vx: number; vy: number; vz: number;
  size0: number; size1: number;
  opacity0: number;
}

export interface EmitOpts {
  opacity?: number;
  spread?: number;
  up?: number;
}

export class DustSystem {
  private puffs: Puff[] = [];
  private footSprite: Sprite;
  private footMat: SpriteMaterial;

  constructor(scene: Scene, count = 56) {
    const tex = softDustTexture();
    const tint = new THREE.Color(0x9c8358); // earthy dust brown (visible, not pale)

    // Persistent soft puff that hugs the feet, veiling the foot/floor contact
    // so the feet never read as floating or clipping into the ground.
    this.footMat = new THREE.SpriteMaterial({
      map: tex, color: new THREE.Color(0x8c7850),
      transparent: true, opacity: 0, depthWrite: false, fog: true,
    });
    this.footSprite = new THREE.Sprite(this.footMat);
    this.footSprite.visible = false;
    this.footSprite.renderOrder = 1;
    scene.add(this.footSprite);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: tint,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 2;
      scene.add(sprite);
      this.puffs.push({
        sprite, mat, active: false, age: 0, life: 1,
        vx: 0, vy: 0, vz: 0, size0: 0, size1: 0, opacity0: 0,
      });
    }
  }

  private grab(): Puff | null {
    for (const p of this.puffs) if (!p.active) return p;
    return null; // pool exhausted — just skip; dust is subtle by design
  }

  /** One puff at a ground point. `scale` should track the character's scale. */
  emit(x: number, y: number, z: number, scale = 1, opts: EmitOpts = {}): void {
    const p = this.grab();
    if (!p) return;
    const spread = (opts.spread ?? 0.25) * scale;
    p.sprite.position.set(
      x + (Math.random() - 0.5) * spread,
      y + 0.05 * scale,
      z + (Math.random() - 0.5) * spread,
    );
    p.vx = (Math.random() - 0.5) * 0.5 * scale;
    p.vz = (Math.random() - 0.5) * 0.5 * scale;
    p.vy = (opts.up ?? 0.5) * scale * (0.7 + Math.random() * 0.6);
    p.size0 = 0.26 * scale;
    p.size1 = (0.68 + Math.random() * 0.4) * scale;
    p.opacity0 = opts.opacity ?? 0.5;
    p.life = 0.42 + Math.random() * 0.22;
    p.age = 0;
    p.active = true;
    p.sprite.visible = true;
    p.sprite.scale.setScalar(p.size0);
    p.mat.opacity = p.opacity0;
  }

  /** A small burst (landing / stomp). */
  burst(x: number, y: number, z: number, scale = 1, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.emit(x, y, z, scale, { opacity: 0.6, spread: 0.55, up: 0.85 });
    }
  }

  /**
   * Position the persistent foot-veil puff at the character's feet each frame.
   * Wider than tall so it hugs the ground and hides the foot/floor junction.
   * Pass show=false (airborne / minigame) to hide it.
   */
  setFoot(x: number, y: number, z: number, scale = 1, show = true): void {
    if (!show) {
      this.footSprite.visible = false;
      return;
    }
    this.footSprite.visible = true;
    this.footSprite.position.set(x, y + 0.3 * scale, z);
    this.footSprite.scale.set(1.3 * scale, 0.8 * scale, 1);
    this.footMat.opacity = 0.34;
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.active = false;
        p.sprite.visible = false;
        p.mat.opacity = 0;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vy -= 1.2 * dt;                 // settle back down
      p.vx *= 1 - 1.6 * dt;             // air drag
      p.vz *= 1 - 1.6 * dt;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * t);
      p.mat.opacity = p.opacity0 * (1 - t) * (1 - t); // ease-out fade
    }
  }
}
