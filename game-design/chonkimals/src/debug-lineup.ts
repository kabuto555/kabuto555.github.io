/**
 * Character lineup — debug tool: spawns one instance per species (plus a
 * PLAYER reference using the frog GLB at the player's own scale/footOffset)
 * in a row on real terrain, all playing the same switchable animation clip.
 *
 * Exists because per-species scale/footOffset mismatches (a raw export's
 * idle pose sitting taller/shorter than intended) are otherwise invisible
 * until you spot a bot looking wrong mid-game. Line every species up next to
 * the player, eyeball or slide `SPECIES[x].scale` / `footOffset` (see
 * bots/appearance.ts) until it matches, then lock the read-off numbers in as
 * the new hardcoded defaults — same tune-then-lock workflow as every other
 * debug-panel slider.
 */
import { loadSpeciesGltf, createCharacter, type AnimState, type PlayerResult } from './player';
import { SPECIES, type SpeciesId } from './bots/appearance';
import { params } from './debug-panel';

type Group = import('three').Group;

interface LineupEntry {
  id: string;
  label: string;
  root: Group;
  height: number;
  update: PlayerResult['update'];
  getScale: () => number;
  getFootOffset: () => number;
}

const SPACING = 4; // world units between characters, before scale

export interface CharacterLineup {
  readonly visible: boolean;
  show(anchorX: number, anchorZ: number, axisX: number, axisZ: number): Promise<void>;
  hide(): void;
  update(dt: number): void;
  setAnim(s: AnimState): void;
  /** One line per entry: current scale/footOffset, for the on-screen readout. */
  labels(): string[];
  /** Raw per-entry world positions, for debugging the layout itself. */
  debugPositions(): Array<{ id: string; x: number; y: number; z: number }>;
}

export function createCharacterLineup(
  scene: import('three').Scene,
  groundAt: (x: number, z: number) => number | null,
): CharacterLineup {
  let built = false;
  let visible = false;
  let animState: AnimState = 'idle';
  let originX = 0, originZ = 0, axisX = 1, axisZ = 0;
  const entries: LineupEntry[] = [];

  async function build(): Promise<void> {
    if (built) return;
    built = true;
    const defs: Array<{ id: string; label: string; modelUrl: string; skinUrl?: string; getScale: () => number; getFootOffset: () => number }> = [
      {
        id: 'player', label: 'PLAYER (frog)', modelUrl: SPECIES.frog.modelUrl,
        getScale: () => params.frogScale, getFootOffset: () => params.footOffset,
      },
      ...(Object.keys(SPECIES) as SpeciesId[]).map((id) => ({
        id, label: `BOT: ${SPECIES[id].label}`, modelUrl: SPECIES[id].modelUrl, skinUrl: SPECIES[id].skinUrl,
        getScale: () => params.frogScale * SPECIES[id].scale,
        getFootOffset: () => params.footOffset + SPECIES[id].footOffset,
      })),
    ];
    for (const def of defs) {
      const gltf = await loadSpeciesGltf(def);
      const character = createCharacter(gltf);
      character.root.visible = false;
      character.root.name = `lineup_${def.id}`;
      scene.add(character.root);
      entries.push({ ...def, root: character.root, height: character.height, update: character.update });
    }
  }

  async function show(anchorX: number, anchorZ: number, aX: number, aZ: number): Promise<void> {
    await build();
    originX = anchorX; originZ = anchorZ; axisX = aX; axisZ = aZ;
    visible = true;
    for (const e of entries) e.root.visible = true;
  }

  function hide(): void {
    visible = false;
    for (const e of entries) e.root.visible = false;
  }

  function update(dt: number): void {
    if (!visible) return;
    const mid = (entries.length - 1) / 2;
    entries.forEach((e, i) => {
      const off = (i - mid) * SPACING;
      const x = originX + axisX * off;
      const z = originZ + axisZ * off;
      const scale = e.getScale();
      const footOffset = e.getFootOffset();
      const ground = groundAt(x, z) ?? 0;
      e.root.position.set(x, ground + footOffset, z);
      e.root.scale.setScalar(scale);
      e.update(dt, animState);
    });
  }

  function setAnim(s: AnimState): void { animState = s; }

  function labels(): string[] {
    return entries.map((e) => `${e.label}: scale ${e.getScale().toFixed(3)}  foot ${e.getFootOffset().toFixed(3)}`);
  }

  function debugPositions(): Array<{ id: string; x: number; y: number; z: number }> {
    return entries.map((e) => ({ id: e.id, x: e.root.position.x, y: e.root.position.y, z: e.root.position.z }));
  }

  return {
    get visible() { return visible; },
    show, hide, update, setAnim, labels, debugPositions,
  };
}
