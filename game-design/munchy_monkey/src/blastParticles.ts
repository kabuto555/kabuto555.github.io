// BlastParticles: manages flying emoji debris after a bomb blast.
// Each particle is a THREE.Sprite added directly to the scene at the
// blasted sprite's world position, given outward velocity + gravity,
// then faded out and removed after ~1.5 s.

type Scene = InstanceType<typeof THREE.Scene> | InstanceType<typeof THREE.Object3D>;

interface Particle {
  sprite: InstanceType<typeof THREE.Sprite>;
  vx: number;  // world-space velocity
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  /** If true, the sprite material is borrowed (not created here) — don't dispose it */
  borrowedMaterial?: boolean;
}

const GRAVITY   = -4.5;  // world units / s²
const MAX_AGE   = 1.5;   // seconds before fully faded

export class BlastParticles {
  private scene: Scene;
  private particles: Particle[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Spawn a blast particle at worldPos using the given sprite texture.
   * epicentre is the bomb's world position — velocity radiates outward from it.
   */
  spawn(
    worldPos: InstanceType<typeof THREE.Vector3>,
    epicentre: InstanceType<typeof THREE.Vector3>,
    tex: InstanceType<typeof THREE.CanvasTexture>,
    spriteSize: number,
  ): void {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(spriteSize * 0.9);
    sprite.position.copy(worldPos);
    this.scene.add(sprite);

    // Velocity: outward from epicentre + random spread + upward kick
    const dir = worldPos.clone().sub(epicentre);
    const len = dir.length();
    if (len > 0.001) dir.divideScalar(len); else dir.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();

    const speed = 1.8 + Math.random() * 2.2;
    const upKick = 0.8 + Math.random() * 1.4;

    this.particles.push({
      sprite,
      vx: dir.x * speed + (Math.random() - 0.5) * 0.8,
      vy: dir.y * speed + upKick,
      vz: dir.z * speed + (Math.random() - 0.5) * 0.8,
      age: 0,
      maxAge: MAX_AGE * (0.8 + Math.random() * 0.4),
    });
  }

  /**
   * Peel particle: takes ownership of an existing sprite (already in the scene
   * via its parent group) — detaches it, re-adds to the scene root so it can
   * move freely, then flies it horizontally away with gravity.
   * The sprite is removed and disposed when the animation ends.
   */
  spawnPeel(
    sprite: InstanceType<typeof THREE.Sprite>,
    worldPos: InstanceType<typeof THREE.Vector3>,
  ): void {
    // Detach from parent group, re-add to this.scene, then set position in
    // this.scene's local space (worldPos is world-space, so convert it).
    sprite.parent?.remove(sprite);
    sprite.visible = true;
    (sprite.material as InstanceType<typeof THREE.SpriteMaterial>).opacity = 1;
    this.scene.add(sprite);
    // Convert world position to local space of this.scene (may be fruitPivot, not root)
    const localPos = (this.scene as InstanceType<typeof THREE.Object3D>).worldToLocal(worldPos.clone());
    sprite.position.copy(localPos);

    const side = Math.random() < 0.5 ? -1 : 1;
    this.particles.push({
      sprite,
      vx: side * (2.8 + Math.random() * 2.2),
      vy: 0.3 + Math.random() * 0.6,
      vz: (Math.random() - 0.5) * 0.5,
      age: 0,
      maxAge: 1.2 + Math.random() * 0.4,
      borrowedMaterial: true,
    });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;

      // Physics
      p.vy += GRAVITY * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;

      // Spin (scale wobble for 2D sprite "tumble" feel)
      const spin = 1 + 0.15 * Math.sin(p.age * 12);
      p.sprite.scale.setScalar(0.18 * spin);

      // Fade out in last 40% of life
      const t = p.age / p.maxAge;
      if (t > 0.6) {
        (p.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).opacity =
          1 - (t - 0.6) / 0.4;
      }

      // Remove when done
      if (p.age >= p.maxAge) {
        this.scene.remove(p.sprite);
        if (!p.borrowedMaterial) {
          (p.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).dispose();
        }
        this.particles.splice(i, 1);
      }
    }
  }

  /** Clean up all remaining particles immediately */
  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.sprite);
      if (!p.borrowedMaterial) {
        (p.sprite.material as InstanceType<typeof THREE.SpriteMaterial>).dispose();
      }
    }
    this.particles = [];
  }
}
