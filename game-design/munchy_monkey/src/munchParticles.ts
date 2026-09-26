// MunchParticles: tweens eaten emoji sprites from their current position
// into the monkey's mouth over the first half of the munch jump (0.325 s).
// Sprites are NOT re-parented — they stay in their existing parent group so
// local↔world math is trivial. They are hidden only when they arrive.

interface MunchParticle {
  sprite: InstanceType<typeof THREE.Sprite>;
  /** sprite's parent at spawn time — used to convert mouth world→local */
  parent: InstanceType<typeof THREE.Object3D>;
  startLocal: InstanceType<typeof THREE.Vector3>;  // local pos at spawn
  originalScale: number;
  t: number;        // 0 → 1
  duration: number; // seconds — matches monkey jump peak timing
  getTarget: () => InstanceType<typeof THREE.Vector3>; // mouth world pos (live)
}

export class MunchParticles {
  private particles: MunchParticle[] = [];

  /**
   * Begin tweening a sprite toward the monkey mouth.
   * Call immediately on munch trigger — no re-parenting, no hiding.
   * @param sprite    The sprite to animate (stays in its current parent)
   * @param getTarget Returns the mouth world position each frame
   * @param duration  How long the tween takes (match monkey jump peak)
   */
  spawn(
    sprite: InstanceType<typeof THREE.Sprite>,
    getTarget: () => InstanceType<typeof THREE.Vector3>,
    duration = 0.32,
  ): void {
    const parent = sprite.parent;
    if (!parent) return;

    this.particles.push({
      sprite,
      parent,
      startLocal: sprite.position.clone(),
      originalScale: sprite.scale.x,
      t: 0,
      duration,
      getTarget,
    });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t = Math.min(1, p.t + dt / p.duration);

      // Ease-in: starts slow, accelerates into the mouth
      const ease = p.t * p.t;

      // Convert live mouth world pos to sprite's parent local space
      const worldTarget = p.getTarget();
      const localTarget = p.parent.worldToLocal(worldTarget.clone());

      // Move
      p.sprite.position.lerpVectors(p.startLocal, localTarget, ease);

      // Scale down in the last 40% of the tween
      const scaleFrac = p.t < 0.6 ? 1 : Math.max(0, 1 - (p.t - 0.6) / 0.4);
      p.sprite.scale.setScalar(p.originalScale * scaleFrac);

      if (p.t >= 1) {
        p.sprite.visible = false;
        p.sprite.position.copy(p.startLocal); // reset so it's hidden in place
        p.sprite.scale.setScalar(p.originalScale);
        this.particles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      p.sprite.visible = false;
    }
    this.particles = [];
  }
}
