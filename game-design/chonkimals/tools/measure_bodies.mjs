// Measure the character bodies for clothing fits (src/customization/body-fits.json).
// Reads each body GLB's bind-pose vertices (glTF skinning: at bind, vertex world = the raw
// POSITION, so no scene transforms are needed) and prints, per body:
//   • side (z → , y ↑) and front (x → , y ↑) silhouettes, each cell labelled by the bone
//     group owning most of its vertices: H head, N neck, T torso (hips/spine), L legs,
//     F feet, A arms, h hands;
//   • with the body's fit applied: tail vertices shown as `x`, and the cloth outline the game
//     builds (src/customization/body-fit-core.js — the same code) drawn as [ … ] on every row
//     the shirt (s) or shorts (b) covers, plus the vertex count to put in the fit.
// Use it to author / check the fit table by eye.
//
//   node tools/measure_bodies.mjs [frog|kangaroo|chicken|dog]
import { readFileSync } from 'fs';
import { groupOf, isTail, slicesFor, sliceAtHeight } from '../src/customization/body-fit-core.js';

const FITS = JSON.parse(readFileSync(new URL('../src/customization/body-fits.json', import.meta.url), 'utf8'));

const BODIES = { frog: 'assets/frog_wim.glb', kangaroo: 'assets/kangaroo_wim.glb', chicken: 'assets/chicken_wim.glb', dog: 'assets/dog_wim.glb' };

function loadGlb(path) {
  const buf = readFileSync(path);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString());
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessor(g, idx) {
  const a = g.json.accessors[idx], bv = g.json.bufferViews[a.bufferView];
  const [size, fn] = COMP[a.componentType], n = NCOMP[a.type];
  const stride = bv.byteStride || size * n;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0));
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const row = [];
    for (let k = 0; k < n; k++) {
      let v = dv[fn](i * stride + k * size, true);
      if (a.normalized) v /= fn === 'getUint8' ? 255 : 65535;
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

export function bodyVerts(path) {
  const g = loadGlb(path);
  const skin = g.json.skins[0];
  const names = skin.joints.map((j) => g.json.nodes[j].name.replace(/^mixamorig:?/i, '').toLowerCase());
  const meshIdx = g.json.nodes.find((n) => n.skin !== undefined && n.mesh !== undefined).mesh;
  const verts = [];
  for (const prim of g.json.meshes[meshIdx].primitives) {
    const P = accessor(g, prim.attributes.POSITION), J = accessor(g, prim.attributes.JOINTS_0), W = accessor(g, prim.attributes.WEIGHTS_0);
    for (let i = 0; i < P.length; i++) {
      let b = 0;
      for (let k = 1; k < 4; k++) if (W[i][k] > W[i][b]) b = k;
      verts.push({ p: P[i], bone: names[J[i][b]], x: P[i][0], y: P[i][1], z: P[i][2], g: groupOf(names[J[i][b]]) });
    }
  }
  return verts;
}

function silhouette(verts, ax, fit, W = 64, Hh = 36) {
  const xs = verts.map((v) => v.p[ax]), ys = verts.map((v) => v.p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cells = new Map();
  for (const v of verts) {
    const cx = Math.min(W - 1, Math.floor(((v.p[ax] - x0) / (x1 - x0)) * W));
    const cy = Math.min(Hh - 1, Math.floor(((v.p[1] - y0) / (y1 - y0)) * Hh));
    const k = cy * W + cx, m = cells.get(k) ?? {};
    const gl = fit && isTail(v, fit) ? 'x' : v.g;
    m[gl] = (m[gl] ?? 0) + 1;
    cells.set(k, m);
  }
  const top = fit && slicesFor(verts, fit.top, 8, fit), bot = fit && slicesFor(verts, fit.bottom, 7, fit);
  const col = (val) => Math.min(W - 1, Math.max(0, Math.floor(((val - x0) / (x1 - x0)) * W)));
  const lines = [];
  for (let r = Hh - 1; r >= 0; r--) {
    const row = [];
    for (let c = 0; c < W; c++) {
      const m = cells.get(r * W + c);
      row.push(m ? Object.entries(m).sort((p, q) => q[1] - p[1])[0][0] : '·');
    }
    const y = y0 + ((r + 0.5) / Hh) * (y1 - y0);
    let tag = ' ';
    for (const [stack, range, t] of [[bot, fit?.bottom, 'b'], [top, fit?.top, 's']]) {
      if (!stack || y < range[0] || y > range[1]) continue;
      const sl = sliceAtHeight(stack, y);
      const c0 = ax === 2 ? sl.cz - sl.rz : sl.cx - sl.rx, c1 = ax === 2 ? sl.cz + sl.rz : sl.cx + sl.rx;
      row[col(c0)] = '['; row[col(c1)] = ']';
      tag = t;
    }
    lines.push(`${y.toFixed(2).padStart(6)} ${tag}${row.join('')}`);
  }
  lines.push(`       ${ax === 2 ? 'z' : 'x'}: ${x0.toFixed(2)} … ${x1.toFixed(2)}  (${ax === 2 ? 'back ← → front' : 'right ← → left'})`);
  return lines.join('\n');
}

const which = process.argv[2];
for (const [name, path] of Object.entries(BODIES)) {
  if (which && which !== name) continue;
  const verts = bodyVerts(path);
  const fit = FITS[name];
  const warn = fit && fit.verts !== verts.length ? `  ⚠ fit says ${fit.verts} verts — update body-fits.json` : '';
  console.log(`\n══ ${name} (${verts.length} verts) ══${warn}\nSIDE`);
  console.log(silhouette(verts, 2, fit));
  console.log('FRONT');
  console.log(silhouette(verts, 0, fit));
}
