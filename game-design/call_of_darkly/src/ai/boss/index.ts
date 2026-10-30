// M8 Taurus Demon boss. main.ts wiring (after the AiSystem + InteractSystem exist):
//
//   const dodgeHints = () => [1, 2, 3].filter((n) => progress.hasFlag(`hint:dodge:${n}`)).length;
//   const taurus = installTaurus({ ai, combat, player: pl, scene, world, events, interact,
//     isDefeated: () => progress.hasFlag('boss:taurus_demon'), setDefeated: () => { progress.setFlag('boss:taurus_demon'); persist(); },
//     getDodgeHintCount: dodgeHints, incDodgeHintCount: () => progress.setFlag(`hint:dodge:${dodgeHints() + 1}`) });
//   createDeathLoop({ ..., inBossArena: () => ai.bossInArena() });   loop: ….add(ai).add(taurus)…
//
// The arena itself is static level geometry: the Burg area calls `buildTaurusArena(dsl, origin)`
// (src/world/areas/taurus.ts), which also records the placement this system picks up lazily.
import { registerArchetype } from '../spawner';
import { TaurusSystem, type TaurusDeps } from './bossSystem';
import { TAURUS } from './taurus';
import { TaurusView } from './taurusModel';

export * from './arena';
export * from './plunge';
export * from './taurus';
export { FarBarrier, FogWall, FOG_PROMPT } from './fogWall';
export { TaurusSystem, type TaurusDeps, type TaurusPlayer } from './bossSystem';

/** Register the archetype (with its three.js view) once. Headless AI systems never build views. */
export function registerTaurus(): void {
  registerArchetype({ ...TAURUS, createView: () => new TaurusView() });
}

export interface TaurusInstall extends TaurusSystem {
  /** Dodge hints shown so far (reads the persisted count). */
  dodgeHintsShown(): number;
}

/** Install the encounter. Returns the System (add it to the loop after the AiSystem). */
export function installTaurus(deps: TaurusDeps): TaurusInstall {
  registerTaurus();
  const sys = new TaurusSystem(deps) as TaurusInstall;
  sys.dodgeHintsShown = () => deps.getDodgeHintCount();
  return sys;
}
