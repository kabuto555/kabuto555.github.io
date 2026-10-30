// End-to-end barrel check against the REAL Burg level: spawn op (trigger AABB + path) -> AiSystem ->
// trigger volume -> shove -> a rolling barrel that follows the path down the stairs and hits the player.
import { describe, expect, it, vi } from 'vitest';
// The level builder makes canvas textures; the colliders are all this test needs.
vi.mock('../render/textures', async (orig) => {
  const THREE = await import('three');
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, getTexture: () => new THREE.Texture() };
});
import type { DamageEvent } from '../core/entity';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { SIM_DT } from '../core/time';
import { StatsResolver } from '../inventory/modifiers';
import { createCollisionWorld } from '../physics/grid';
import { BURG, BURG_TRIGGERS } from '../world/areas/burg';
import { buildArea } from '../world/builder';
import { AiSystem } from './system';

function burgRig() {
  const world = createCollisionWorld(4);
  const bus = new EventBus();
  const player = { id: 1, position: { x: 44, y: 9, z: -130 }, health: { hp: 1000, maxHp: 1000 } };
  const hits: DamageEvent[] = [];
  const combat = {
    addTarget() {},
    removeTarget() {},
    hitPlayer(e: DamageEvent) {
      hits.push(e);
      return { dealt: e.amount, blocked: false, poiseBroken: false, killed: false };
    },
  };
  const ai = new AiSystem({ world, combat, player, headless: true, events: bus, stats: new StatsResolver(), rng: new Rng(1) });
  buildArea(BURG, world, { onSpawn: (op) => void ai.spawnOp(op) });
  const e = ai.enemies.find((x) => x.placementId === 'B_barrel_hollow')!;
  return { ai, player, hits, e };
}

describe('Burg barrel stairs (real level + real spawn op)', () => {
  it('stages a barrel at the stair top and does nothing until the trigger volume is entered', () => {
    const { ai, e } = burgRig();
    for (let i = 0; i < 120; i++) ai.update(SIM_DT);
    expect(e.state).toBe('idle');
    expect(ai.hazards.barrels.filter((b) => b.phase === 1).length).toBe(1);
    expect(ai.hazards.barrels.some((b) => b.phase >= 2)).toBe(false);
  });

  it('entering BURG_TRIGGERS barrelRoll launches a barrel that moves down the path and hits the player', () => {
    const { ai, player, hits, e } = burgRig();
    const t = BURG_TRIGGERS.find((x) => x.kind === 'barrelRoll')!;
    for (let i = 0; i < 30; i++) ai.update(SIM_DT);
    // feet inside the volume (bottom of the stairs, where players walk up from)
    player.position.x = (t.min[0] + t.max[0]) / 2;
    player.position.z = t.max[2] - 3;
    player.position.y = 5;
    let launchedAt = -1;
    const zs: number[] = [];
    let hit: DamageEvent | undefined;
    for (let i = 0; i < 60 * 10; i++) {
      ai.update(SIM_DT);
      const b = ai.hazards.barrels.find((x) => x.phase === 2);
      if (b) {
        if (launchedAt < 0) launchedAt = i;
        zs.push(b.z);
      }
      hit ??= hits.find((h) => h.weaponId?.endsWith(':barrel'));
    }
    expect(launchedAt).toBeGreaterThan(0); // shove telegraph first
    expect(zs.length).toBeGreaterThan(60); // rolled for > 1 s
    expect(zs[0]!).toBeLessThan(t.from![2] + 1.5); // starts at the stair top (z ~ -110)
    expect(zs[zs.length - 1]!).toBeGreaterThan(zs[0]! + 8); // moved on toward `to` (z -92)
    for (let i = 1; i < zs.length; i++) expect(zs[i]!).toBeGreaterThanOrEqual(zs[i - 1]! - 1e-6); // monotonic along the path
    expect(hit).toBeDefined();
    expect(['windup', 'attack', 'recover', 'chase', 'alert']).toContain(e.state); // the hollow follows up
    expect(ai.hazards.barrels.every((b) => b.phase !== 2)).toBe(true); // finished/broke at the end of the path
  });
});
