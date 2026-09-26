// Build distance LODs for the character GLBs: `<name>_lod1.glb` (~35% of the
// triangles) and `<name>_lod2.glb` (~12%). Geometry only — animations and
// textures are stripped, because at runtime the LOD mesh is bound to the full
// model's skeleton and reuses its material (see src/player.ts). The skin (joint
// order) is untouched by simplification, so the binding lines up.
//
//   node tools/build_character_lods.mjs
//
// Needs @gltf-transform/core + functions and meshoptimizer: uses the repo's
// node_modules if present, else the npx cache (`npx @gltf-transform/cli` once).
import { createRequire } from 'module';
import { existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function requireFrom(pkg) {
  const bases = [join(process.cwd(), 'node_modules')];
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) bases.push(join(npx, d, 'node_modules'));
  for (const b of bases) {
    if (existsSync(join(b, pkg))) return createRequire(join(b, 'noop.js'))(pkg);
  }
  throw new Error(`cannot find ${pkg} (run \`npx @gltf-transform/cli --help\` once to cache it)`);
}

const { NodeIO } = requireFrom('@gltf-transform/core');
const { simplify, weld, prune } = requireFrom('@gltf-transform/functions');
const { MeshoptSimplifier } = requireFrom('meshoptimizer');
await MeshoptSimplifier.ready;

const CHARACTERS = ['assets/frog_wim.glb', 'assets/kangaroo_wim.glb', 'assets/chicken_wim.glb', 'assets/dog_wim.glb', 'assets/bear_wim.glb'];
const LEVELS = [
  { suffix: 'lod1', ratio: 0.35, error: 0.004 },
  { suffix: 'lod2', ratio: 0.12, error: 0.02 },
];

const io = new NodeIO();
const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const src of CHARACTERS) {
  for (const lvl of LEVELS) {
    const doc = await io.read(src);
    const before = tris(doc);
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lvl.ratio, error: lvl.error }));
    for (const a of doc.getRoot().listAnimations()) {
      a.listChannels().forEach((c) => c.dispose());
      a.listSamplers().forEach((sm) => sm.dispose()); // samplers hold the keyframe accessors
      a.dispose();
    }
    for (const m of doc.getRoot().listMaterials()) {
      for (const slot of ['setBaseColorTexture', 'setNormalTexture', 'setMetallicRoughnessTexture', 'setOcclusionTexture', 'setEmissiveTexture']) m[slot]?.(null);
    }
    for (const t of doc.getRoot().listTextures()) t.dispose();
    // The stripped animations leave their keyframe accessors orphaned on the root; drop them.
    for (const acc of doc.getRoot().listAccessors()) {
      if (acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
    }
    await doc.transform(prune({ keepAttributes: true }));
    const out = src.replace(/\.glb$/, `_${lvl.suffix}.glb`);
    await io.write(out, doc);
    console.log(`${out}: ${Math.round(before)} → ${Math.round(tris(doc))} tris, ${(statSync(out).size / 1024).toFixed(0)} KB`);
  }
}
