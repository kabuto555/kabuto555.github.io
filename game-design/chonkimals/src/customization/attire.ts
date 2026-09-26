// Attire — dresses a spawned character in its avatar loadout, procedurally (no item
// meshes exist yet). Every body shares one approach, so any species just works:
//
//  • The body is analysed once per GLB (cached on its geometry): BIND-pose vertices
//    in character-root space, grouped by the bone that owns them (head, torso, legs,
//    feet…). Bone names are normalised (`mixamorig:Head` / `Head` → `head`).
//    Everything is measured in the skin's bind pose (inverse bind matrices), never the
//    GLB's node transforms — those aren't the bind pose (the clips re-rotate the hips).
//    Bind space → root space is the model node's transform (the GLB scene clone).
//  • Tops and bottoms are SHELLS built on the body's FIT (body-fits.json, measured per body
//    with tools/measure_bodies.mjs; maths in body-fit-core.js, shared with that tool): the
//    torso sliced into smooth rounded boxes over the fit's height range, with tails left out
//    so they poke through. A shell is a SkinnedMesh on the body's own skeleton — each vertex
//    copies the skin weights of its nearest (non-tail) body vertex, so clothes bend and
//    squash with the chonk. Neck / chest items and pack straps sit on the same slices.
//  • Everything else (hats, shoes, accessories, the toy) is a little clay prop
//    parented to a bone, placed in the bind pose so it follows the animation.
//
// Looks per item live in LOOKS (id → shape + colours); unknown items fall back to a
// shape for their kind in a colour hashed from the id. `buildItemProp` makes the same
// props free-standing (the tent's display spots use it).

import { hashString } from '../rng';
import { itemById, type Item } from '../inventory/items';
import type { AvatarLoadout } from './loadout';
import { printTexture, stripes } from './patterns';
import fitsJson from './body-fits.json';
import { groupOf, isClothable, outlinePoint, sliceAtHeight, slicesFor } from './body-fit-core.js';

/** @see body-fit-core.js */
interface BodyVert { x: number; y: number; z: number; g: string }
interface TailZone { zBelow: number; y: [number, number] }
interface BodyFit { model: string; verts: number; tails?: TailZone[]; top: [number, number]; bottom: [number, number]; chest: number }
interface Slice { y: number; cx: number; cz: number; rx: number; rz: number; p: number }

const FITS: BodyFit[] = Object.entries(fitsJson as Record<string, unknown>)
  .filter(([k]) => !k.startsWith('_')).map(([, v]) => v as BodyFit);

type Object3D = import('three').Object3D;
type Group = import('three').Group;
type Bone = import('three').Bone;
type Matrix4 = import('three').Matrix4;
type Vector3 = import('three').Vector3;
type Box3 = import('three').Box3;
type SkinnedMesh = import('three').SkinnedMesh;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;

// ── Looks ─────────────────────────────────────────────────────────────────

type Shape =
  // head
  | 'bucket' | 'beanie' | 'frogBeanie' | 'cap' | 'visor' | 'acorn' | 'flowerCrown' | 'lanternHat' | 'goggles' | 'monocle'
  | 'backwards' | 'cone' | 'propeller' | 'tinfoil' | 'cheese' | 'mullet' | 'galaxyBrain' | 'crab'
  | 'banana' | 'melon' | 'warHelm' | 'chef' | 'ninjaBand'
  // neck / chest / back / wrist / right hand
  | 'neckerchief' | 'beads' | 'sash' | 'backpack' | 'paddlePack' | 'bracelet' | 'marshmallow' | 'goldChain'
  // back / hip gear
  | 'katana' | 'busterSword' | 'hipSword' | 'fannyPack'
  // shells + feet
  | 'tee' | 'vest' | 'hoodie' | 'puffer' | 'plateArmor' | 'shorts' | 'tutu' | 'kilt' | 'fauld'
  | 'boots' | 'sneakers' | 'lightup' | 'jordan' | 'crocs' | 'heelys' | 'bigBoots' | 'toeShoes'
  | 'sabatons' | 'tabi' | 'bunnySlippers'
  // toys (left hand)
  | 'duck' | 'maraca' | 'kazoo' | 'cowbell' | 'whistle' | 'ball'
  | 'chicken' | 'slideWhistle' | 'clapper' | 'spinner' | 'honker' | 'recorder' | 'walkie' | 'jawHarp' | 'theremin'
  | 'whoopee' | 'triangle' | 'gameBox' | 'diceCup';

/** `print`: a full-colour cloth print from patterns.ts (the colour then only tints display props). */
interface Look { shape: Shape; color: string; color2?: string; print?: string; }

const LOOKS: Record<string, Look> = {
  // Hats.
  cp_hat_bucket:       { shape: 'bucket', color: '#e8c872', color2: '#c9a24c' },
  cp_hat_frog_beanie:  { shape: 'frogBeanie', color: '#6fc25a', color2: '#ffffff' },
  tr_scout_cap:        { shape: 'cap', color: '#d9483f', color2: '#f3e6cf' },
  // Accessories (Care Package originals — most sit on the head).
  acc_acorn_cap:       { shape: 'acorn', color: '#8a5a32', color2: '#5b3a1e' },
  acc_camp_visor:      { shape: 'visor', color: '#3a8fd9', color2: '#ffffff' },
  acc_flower_crown:    { shape: 'flowerCrown', color: '#6aa84f', color2: '#ffd23f' },
  acc_lantern_hat:     { shape: 'lanternHat', color: '#c0392b', color2: '#ffcf5a' },
  acc_bug_goggles:     { shape: 'goggles', color: '#5b6b7a', color2: '#7fe0d0' },
  acc_moon_monocle:    { shape: 'monocle', color: '#e0b43c', color2: '#dff2ff' },
  acc_neckerchief:     { shape: 'neckerchief', color: '#e2733f', color2: '#f3e6cf' },
  acc_marshmallow:     { shape: 'marshmallow', color: '#fff6e8', color2: '#8a5a32' },
  acc_paddle_pack:     { shape: 'paddlePack', color: '#3f8a4f', color2: '#c98a4b' },
  // Other wearables.
  cp_wrist_friendship: { shape: 'bracelet', color: '#ff7aa2', color2: '#5a9bff' },
  cp_neck_pony:        { shape: 'beads', color: '#ff6b6b', color2: '#5a9bff' },
  tr_merit_sash:       { shape: 'sash', color: '#3f8a4f', color2: '#ffd23f' },
  cp_bag_backpack:     { shape: 'backpack', color: '#e2733f', color2: '#7a4a1e' },
  cp_shoes_hiking:     { shape: 'boots', color: '#7a4a1e', color2: '#e8d7b8' },
  cp_shoes_lightup:    { shape: 'lightup', color: '#f4f4f4', color2: '#ff4fd8' },
  cp_top_camp_tee:     { shape: 'tee', color: '#f6f1e4', color2: '#d9483f' },
  cp_top_puffy_vest:   { shape: 'vest', color: '#e84a5f', color2: '#b8364a' },
  tr_troop_hoodie:     { shape: 'hoodie', color: '#3a6fa8', color2: '#f3e6cf' },
  cp_bottom_cargo:     { shape: 'shorts', color: '#8f8a5a', color2: '#6d6a44' },
  // Drip (Care Package meme gear).
  top_tux_tee:         { shape: 'tee', color: '#1e1e24', color2: '#fafafa', print: 'tux' },
  top_vacation_mode:   { shape: 'tee', color: '#1fb5a8', color2: '#ff5d8f', print: 'hawaiian' },
  top_this_is_fine:    { shape: 'tee', color: '#3b2a3a', color2: '#ff8a2b', print: 'flames' },
  top_sigma_hoodie:    { shape: 'hoodie', color: '#2b2d33', color2: '#8e939c', print: 'sigma' },
  top_drip_puffer:     { shape: 'puffer', color: '#18181c', color2: '#3a3a44', print: 'puffer' },
  top_hot_dog_suit:    { shape: 'tee', color: '#e8b36a', color2: '#c0452f', print: 'hotdog' },
  bot_jorts:           { shape: 'shorts', color: '#4a6fa8', color2: '#dfe8f5', print: 'denim' },
  bot_touch_grass:     { shape: 'shorts', color: '#4f9a3a', color2: '#7cc85a', print: 'grass' },
  bot_business_shorts: { shape: 'shorts', color: '#2c3550', color2: '#c9cfdd', print: 'pinstripe' },
  bot_aura_tutu:       { shape: 'tutu', color: '#ff8fc8', color2: '#ffd1ea' },
  shoe_toe_shoes:      { shape: 'toeShoes', color: '#2b2d33', color2: '#b6ff3a' },
  shoe_crocs_socks:    { shape: 'crocs', color: '#7ed957', color2: '#ffffff' },
  shoe_heelys:         { shape: 'heelys', color: '#3a6fa8', color2: '#d8dde3' },
  shoe_big_red_boots:  { shape: 'bigBoots', color: '#e1261c', color2: '#8f130c' },
  shoe_air_chonkdan:   { shape: 'jordan', color: '#c8102e', color2: '#111111' },
  // Toys.
  cp_toy_ducky:        { shape: 'duck', color: '#ffd23f', color2: '#ff8a2b' },
  cp_toy_maraca:       { shape: 'maraca', color: '#ff6b6b', color2: '#ffd23f' },
  cp_toy_kazoo:        { shape: 'kazoo', color: '#e0b43c', color2: '#7a4a1e' },
  cp_toy_cowbell:      { shape: 'cowbell', color: '#c9c9c9', color2: '#5b3a1e' },
  tr_scout_whistle:    { shape: 'whistle', color: '#c9c9c9', color2: '#d9483f' },
  cp_toy_clapper:      { shape: 'clapper', color: '#ffb23f', color2: '#8a5a32' },
  cp_toy_slide_whistle: { shape: 'slideWhistle', color: '#d8dde3', color2: '#d9483f' },
  cp_toy_rubber_chicken: { shape: 'chicken', color: '#ffd84a', color2: '#e2462b' },
  toy_fidget_spinner:  { shape: 'spinner', color: '#3a8fd9', color2: '#c9c9c9' },
  toy_recorder:        { shape: 'recorder', color: '#f3e6cf', color2: '#8a5a32' },
  toy_goose_honker:    { shape: 'honker', color: '#e2462b', color2: '#e0b43c' },
  toy_jaw_harp:        { shape: 'jawHarp', color: '#9aa3ad', color2: '#5b3a1e' },
  toy_dialup_walkie:   { shape: 'walkie', color: '#5b6b7a', color2: '#6fe06a' },
  toy_theremin:        { shape: 'theremin', color: '#6d2aa8', color2: '#c9a6ff' },
  toy_whoopee_cushion: { shape: 'whoopee', color: '#ff6f9f', color2: '#e04c7e' },
  toy_triangle:        { shape: 'triangle', color: '#d8dde3', color2: '#d9483f' },
  toy_words_with_friends: { shape: 'gameBox', color: '#ff7a2b', color2: '#f6e7c1' },
  toy_dice_with_friends: { shape: 'diceCup', color: '#b3342e', color2: '#fbf8f1' },
  // Big-brain headwear.
  cp_hat_backwards:    { shape: 'backwards', color: '#3a6fa8', color2: '#f2b52c' },
  cp_hat_propeller:    { shape: 'propeller', color: '#d9483f', color2: '#ffd23f' },
  hat_traffic_cone:    { shape: 'cone', color: '#ff6b1a', color2: '#ffffff' },
  hat_mullet_cap:      { shape: 'mullet', color: '#3f8a4f', color2: '#8a5a32' },
  hat_tinfoil:         { shape: 'tinfoil', color: '#d4d8de', color2: '#9aa3ad' },
  hat_cheese_head:     { shape: 'cheese', color: '#ffc629', color2: '#e0a010' },
  hat_crab_rave:       { shape: 'crab', color: '#e2462b', color2: '#1d1d1d' },
  hat_galaxy_brain:    { shape: 'galaxyBrain', color: '#ff8fc8', color2: '#8a4fff' },
  hat_banana_peel:     { shape: 'banana', color: '#ffd84a', color2: '#f6e7b0' },
  hat_melon_helmet:    { shape: 'melon', color: '#3f9a3a', color2: '#ff4d5e' },
  hat_let_him_cook:    { shape: 'chef', color: '#ffffff', color2: '#e4e4e4' },
  hat_warchief_helm:   { shape: 'warHelm', color: '#7d8794', color2: '#c99a2e' },
  cp_hat_ninja_band:   { shape: 'ninjaBand', color: '#1f2330', color2: '#b9c2cc' },
  // Meme armoury: tops, bottoms, kicks and gear.
  top_warchief_plate:  { shape: 'plateArmor', color: '#7d8794', color2: '#c99a2e', print: 'plate' },
  top_stonks_tee:      { shape: 'tee', color: '#1a2a4a', color2: '#3ee07a', print: 'stonks' },
  top_banana_suit:     { shape: 'tee', color: '#ffd84a', color2: '#6b4a1a', print: 'banana' },
  cp_top_ninja_gi:     { shape: 'tee', color: '#1f2330', color2: '#b8342c', print: 'gi' },
  bot_zoom_pyjamas:    { shape: 'shorts', color: '#8fb8f0', color2: '#fff4c2', print: 'pyjama' },
  bot_battle_kilt:     { shape: 'kilt', color: '#a3202a', color2: '#1b3a26', print: 'tartan' },
  bot_warchief_greaves: { shape: 'fauld', color: '#7d8794', color2: '#c99a2e', print: 'plate' },
  shoe_bunny_slippers: { shape: 'bunnySlippers', color: '#ffc4dc', color2: '#ff8fb8' },
  shoe_warchief_sabatons: { shape: 'sabatons', color: '#7d8794', color2: '#c99a2e' },
  cp_shoes_tabi:       { shape: 'tabi', color: '#1f2330', color2: '#5b6170' },
  acc_fanny_pack:      { shape: 'fannyPack', color: '#ff5d8f', color2: '#3ee0d0' },
  acc_drip_chain:      { shape: 'goldChain', color: '#ffc629', color2: '#fff1b0' },
  acc_hip_sword:       { shape: 'hipSword', color: '#7a4a1e', color2: '#e0b43c' },
  acc_buster_sword:    { shape: 'busterSword', color: '#c3cad3', color2: '#5b3a1e' },
  cp_acc_katana:       { shape: 'katana', color: '#1d1d22', color2: '#b8342c' },
};

const PALETTE = ['#d9483f', '#3a6fa8', '#3f8a4f', '#f2b52c', '#8158a8', '#e2733f', '#2f9c95', '#ff8fc8', '#5a9bff', '#f6f1e4'];
const KIND_SHAPE: Partial<Record<Item['kind'], Shape>> = {
  hat: 'beanie', top: 'tee', bottom: 'shorts', shoes: 'sneakers', wrist: 'bracelet', necklace: 'beads', bag: 'backpack',
  accessory: 'neckerchief', toy: 'ball',
};

export function lookOf(it: Item): Look {
  const known = LOOKS[it.id];
  if (known) return known;
  const h = hashString(it.id);
  return { shape: KIND_SHAPE[it.kind] ?? 'ball', color: PALETTE[h % PALETTE.length], color2: PALETTE[(h >>> 8) % PALETTE.length] };
}

// ── Materials (shared; nothing tints character materials in place) ─────────

const mats = new Map<string, Material>();
function clay(color: string, o: { emissive?: string; glow?: number; metal?: number; rough?: number; map?: string; print?: string } = {}): Material {
  const key = `${color}|${o.emissive ?? ''}|${o.glow ?? 0}|${o.metal ?? 0}|${o.rough ?? 0.8}|${o.map ?? ''}|${o.print ?? ''}`;
  let m = mats.get(key);
  if (!m) {
    const std = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 });
    if (o.emissive) { std.emissive = new THREE.Color(o.emissive); std.emissiveIntensity = o.glow ?? 1; }
    if (o.map === 'stripes') std.map = stripes('#ffffff', '#d8d2c4', 6, true);
    if (o.map === 'quilt') std.map = stripes('#ffffff', '#c7c7c7', 5, false);
    if (o.print) { std.map = printTexture(o.print); std.color.set('#ffffff'); }
    m = std;
    mats.set(key, m);
  }
  return m;
}

function mesh(geo: BufferGeometry, m: Material): import('three').Mesh {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}

// ── Body analysis ─────────────────────────────────────────────────────────

const norm = (n: string): string => n.replace(/^mixamorig:?/i, '').toLowerCase();

interface Rest {
  body: SkinnedMesh;
  /** Body geometry (bind) space → character root space. */
  meshRest: Matrix4;
  /** Normalised bone name → bone + its bind-pose matrix (bone → root). */
  bones: Map<string, { bone: Bone; rest: Matrix4 }>;
}

interface Analysis {
  /** Bind-pose vertex positions in root space. */
  pos: Float32Array;
  /** Owning (heaviest-weight) bone name per vertex. */
  owner: string[];
  height: number;
  minY: number;
  shells: Map<Shape, BufferGeometry>;
  /** Bind-pose vertices in raw GLB (= body geometry) space, with bone groups — what fits use. */
  raw: BodyVert[];
  fit: BodyFit;
  /** The fit's torso slices (raw space) for the top and the shorts. */
  top: Slice[] | null;
  bottom: Slice[] | null;
}

const rests = new WeakMap<Object3D, Rest>();
const analyses = new WeakMap<BufferGeometry, Analysis>();
const worn = new WeakMap<Object3D, Object3D[]>();

/** A character's bind-pose frame (any time — it doesn't depend on the current pose). */
function restOf(root: Object3D): Rest | null {
  const known = rests.get(root);
  if (known) return known;
  let body: SkinnedMesh | null = null;
  root.traverse((o) => { if (!body && (o as SkinnedMesh).isSkinnedMesh && !/_lod\d$/.test(o.name)) body = o as SkinnedMesh; });
  if (!body) return null;
  const b = body as SkinnedMesh;
  // Skinned position = boneWorld · inverseBind · bindMatrix · v, and the inverse bind matrices are
  // relative to the GLB scene — so bind space → root space is the scene clone's (model's) transform.
  let model: Object3D = b;
  while (model.parent && model.parent !== root) model = model.parent;
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert().multiply(model.matrixWorld);
  const bones = new Map<string, { bone: Bone; rest: Matrix4 }>();
  b.skeleton.bones.forEach((bone, i) => {
    bones.set(norm(bone.name), { bone, rest: toRoot.clone().multiply(b.skeleton.boneInverses[i].clone().invert()) });
  });
  const r = { body: b, meshRest: toRoot.clone().multiply(b.bindMatrix), bones };
  rests.set(root, r);
  return r;
}

function analyse(r: Rest): Analysis {
  const geo = r.body.geometry;
  let a = analyses.get(geo);
  if (a) return a;
  const p = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex');
  const sw = geo.getAttribute('skinWeight');
  const names = r.body.skeleton.bones.map((b) => norm(b.name));
  const pos = new Float32Array(p.count * 3);
  const owner: string[] = new Array(p.count);
  const v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(r.meshRest);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    owner[i] = names[best] ?? '';
  }
  const raw: BodyVert[] = [];
  for (let i = 0; i < p.count; i++) raw.push({ x: p.getX(i), y: p.getY(i), z: p.getZ(i), g: groupOf(owner[i]) });
  const fit = FITS.find((f) => f.verts === p.count) ?? autoFit(r, p.count);
  const top = slicesFor(raw, fit.top, 8, fit) as Slice[] | null;
  const bottom = slicesFor(raw, fit.bottom, 7, fit) as Slice[] | null;
  a = { pos, owner, height: maxY - minY, minY, shells: new Map(), raw, fit, top, bottom };
  analyses.set(geo, a);
  return a;
}

/** A rough fit from the bones for a body body-fits.json doesn't know (no tail handling). */
function autoFit(r: Rest, count: number): BodyFit {
  console.warn(`[attire] no body fit for a ${count}-vertex body — using a rough one; measure it with tools/measure_bodies.mjs`);
  const raw = (name: string) => { const b = bonePos(r, name); return b ? toRaw(r, b) : null; };
  const hips = raw('hips'), neck = raw('neck'), knee = raw('leftleg') ?? raw('rightleg');
  const hy = hips?.y ?? 0, ny = neck?.y ?? hy + 0.4, span = ny - hy;
  const low = knee ? knee.y + (hy - knee.y) * 0.25 : hy - span * 0.4;
  return { model: '?', verts: count, top: [hy + span * 0.2, ny - span * 0.06], bottom: [low, hy + span * 0.32], chest: hy + span * 0.55 };
}

const toRaw = (r: Rest, p: Vector3): Vector3 => p.clone().applyMatrix4(r.meshRest.clone().invert());
const toRoot = (r: Rest, p: { x: number; y: number; z: number }): Vector3 => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(r.meshRest);

const HEAD = /^head/;

function verts(a: Analysis, test: (owner: string) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.owner.length; i++) if (test(a.owner[i])) out.push(i);
  return out;
}

function boxOf(a: Analysis, ids: number[]): Box3 {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const i of ids) b.expandByPoint(v.set(a.pos[i * 3], a.pos[i * 3 + 1], a.pos[i * 3 + 2]));
  return b;
}

function bonePos(r: Rest, name: string): Vector3 | null {
  const b = r.bones.get(name);
  return b ? new THREE.Vector3().setFromMatrixPosition(b.rest) : null;
}

// ── Shells (tops / bottoms) ───────────────────────────────────────────────

const SECTORS = 22;

/** Per-sector max radius of `pick` around (cx, cz); empty / near-empty sectors filled from neighbours. */
function sectorRadii(a: Analysis, pick: number[], cx: number, cz: number): number[] {
  const r = new Array<number>(SECTORS).fill(0);
  for (const i of pick) {
    const dx = a.pos[i * 3] - cx, dz = a.pos[i * 3 + 2] - cz;
    r[sectorOf(dx, dz)] = Math.max(r[sectorOf(dx, dz)], Math.hypot(dx, dz));
  }
  const avg = r.filter((x) => x > 0).reduce((s, x, _, arr) => s + x / arr.length, 0);
  for (let s = 0; s < SECTORS; s++) if (r[s] < avg * 0.35) r[s] = 0;
  for (let pass = 0; pass < SECTORS && r.includes(0); pass++) {
    const prev = [...r];
    for (let s = 0; s < SECTORS; s++) {
      if (prev[s] > 0) continue;
      const l = prev[(s + SECTORS - 1) % SECTORS], n = prev[(s + 1) % SECTORS];
      if (l > 0 || n > 0) r[s] = l > 0 && n > 0 ? (l + n) / 2 : Math.max(l, n);
    }
  }
  return r;
}

const sectorOf = (dx: number, dz: number): number =>
  Math.floor((((Math.atan2(dz, dx) / (Math.PI * 2)) + 1) % 1) * SECTORS) % SECTORS;
const sectorAngle = (s: number): number => ((s + 0.5) / SECTORS) * Math.PI * 2;

/**
 * The body's outline through the sector radii: a smooth low-order curve (r(θ) as a 2nd-order
 * Fourier series — ovals, bellies, offsets), least-squares fit, then refit without the sectors
 * poking out past it — so a tail or other narrow lobe doesn't count. Radius per sector, or null.
 */
function bodyOutline(r: number[]): number[] | null {
  const basis = (t: number) => [1, Math.cos(t), Math.sin(t), Math.cos(2 * t), Math.sin(2 * t)];
  let use = r.map((x) => x > 0);
  let pred: number[] | null = null;
  for (let it = 0; it < 4; it++) {
    const K = 5, m = new Array<number>(K * K).fill(0), b = new Array<number>(K).fill(0);
    let n = 0;
    for (let s = 0; s < SECTORS; s++) {
      if (!use[s]) continue;
      const f = basis(sectorAngle(s));
      for (let i = 0; i < K; i++) { b[i] += f[i] * r[s]; for (let j = 0; j < K; j++) m[i * K + j] += f[i] * f[j]; }
      n++;
    }
    if (n < 8) return pred;
    const sol = solve(m, b, K);
    if (!sol) return pred;
    const next = r.map((_, s) => Math.max(1e-4, basis(sectorAngle(s)).reduce((q, f, i) => q + f * sol[i], 0)));
    pred = next;
    use = r.map((x, s) => x > 0 && x <= next[s] * 1.15);
  }
  return pred;
}

/** Solves the K×K system m·x = b (Gaussian elimination, partial pivoting). */
function solve(m: number[], b: number[], K: number): number[] | null {
  const a = m.map((x) => x), y = [...b];
  for (let c = 0; c < K; c++) {
    let piv = c;
    for (let r = c + 1; r < K; r++) if (Math.abs(a[r * K + c]) > Math.abs(a[piv * K + c])) piv = r;
    if (Math.abs(a[piv * K + c]) < 1e-12) return null;
    for (let j = 0; j < K; j++) [a[c * K + j], a[piv * K + j]] = [a[piv * K + j], a[c * K + j]];
    [y[c], y[piv]] = [y[piv], y[c]];
    for (let r = c + 1; r < K; r++) {
      const f = a[r * K + c] / a[c * K + c];
      for (let j = c; j < K; j++) a[r * K + j] -= f * a[c * K + j];
      y[r] -= f * y[c];
    }
  }
  const x = new Array<number>(K).fill(0);
  for (let r = K - 1; r >= 0; r--) {
    let acc = y[r];
    for (let j = r + 1; j < K; j++) acc -= a[r * K + j] * x[j];
    x[r] = acc / a[r * K + r];
  }
  return x;
}

/** Radius profile of `ids` at height `y`: centre + per-sector max radius (gaps filled, smoothed).
 * Tails (skinned to the hips / spine like the body, so bone ownership can't tell them apart) and
 * other narrow lobes are left out: the profile is fit with a robust smooth outline, the centre is
 * taken from the vertices inside it, and anything past it is clamped back — so clothes follow the body
 * and the tail pokes through. */
function ring(a: Analysis, ids: number[], y: number, band: number): { cx: number; cz: number; r: number[] } | null {
  let pick = ids.filter((i) => Math.abs(a.pos[i * 3 + 1] - y) < band);
  if (pick.length < 8) pick = ids.filter((i) => Math.abs(a.pos[i * 3 + 1] - y) < band * 2.5);
  if (pick.length < 4) return null;
  let cx = 0, cz = 0;
  for (const i of pick) { cx += a.pos[i * 3]; cz += a.pos[i * 3 + 2]; }
  cx /= pick.length; cz /= pick.length;
  let r = sectorRadii(a, pick, cx, cz);
  let fit = bodyOutline(r);
  // Re-centre on the body alone (a big tail drags the plain average backwards), then re-measure.
  for (let pass = 0; pass < 2 && fit; pass++) {
    const f = fit;
    const core = pick.filter((i) => {
      const dx = a.pos[i * 3] - cx, dz = a.pos[i * 3 + 2] - cz;
      return Math.hypot(dx, dz) <= f[sectorOf(dx, dz)] * 1.15;
    });
    if (core.length < 4) break;
    let nx = 0, nz = 0;
    for (const i of core) { nx += a.pos[i * 3]; nz += a.pos[i * 3 + 2]; }
    cx = nx / core.length; cz = nz / core.length;
    r = sectorRadii(a, core, cx, cz);
    fit = bodyOutline(r);
  }
  if (fit) for (let s = 0; s < SECTORS; s++) r[s] = Math.min(r[s], fit[s] * 1.15);
  for (let pass = 0; pass < 2; pass++) {
    const prev = [...r];
    for (let s = 0; s < SECTORS; s++) r[s] = Math.max(prev[s], 0.25 * prev[(s + SECTORS - 1) % SECTORS] + 0.5 * prev[s] + 0.25 * prev[(s + 1) % SECTORS]);
  }
  return { cx, cz, r };
}

/**
 * A skinned tube on a stack of fitted slices (raw space = the body geometry's space), with a
 * rolled hem at both ends. `grow` / `pad` push it off the body (the tee sits over the shorts).
 */
function shellGeometry(r: Rest, a: Analysis, slices: Slice[], grow: number, pad: number): BufferGeometry {
  const lip = pad * 1.2, dy = Math.abs(slices[slices.length - 1].y - slices[0].y) * 0.035;
  const first = slices[0], last = slices[slices.length - 1];
  // Rings bottom → top: hem tuck, hem roll, the body, hem roll, collar tuck.
  const rings: { s: Slice; g: number; pad: number }[] = [
    { s: { ...first, y: first.y + dy }, g: grow, pad: pad - lip * 0.6 },
    { s: first, g: grow, pad: pad + lip },
    ...slices.map((sl) => ({ s: sl, g: grow, pad })),
    { s: last, g: grow, pad: pad + lip },
    { s: { ...last, y: last.y - dy }, g: grow, pad: pad - lip * 0.6 },
  ];
  const cols = SECTORS + 1; // seam column duplicated for the UVs
  const n = rings.length * cols;
  const posArr = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const skinI = new Uint16Array(n * 4);
  const skinW = new Float32Array(n * 4);
  const geo0 = r.body.geometry;
  const si = geo0.getAttribute('skinIndex'), sw = geo0.getAttribute('skinWeight');
  const skinFrom: number[] = [];
  a.raw.forEach((v, i) => { if (isClothable(v, a.fit)) skinFrom.push(i); });
  rings.forEach((ring, k) => {
    for (let c = 0; c < cols; c++) {
      const t = ((c % SECTORS) / SECTORS) * Math.PI * 2;
      const q = outlinePoint(ring.s, t, ring.g, ring.pad);
      // Nearest body (non-tail) vertex lends its skin weights.
      let best = skinFrom[0], bd = Infinity;
      for (const i of skinFrom) {
        const v = a.raw[i];
        const d = (v.x - q.x) ** 2 + (v.y - q.y) ** 2 + (v.z - q.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      const o = k * cols + c;
      posArr.set([q.x, q.y, q.z], o * 3);
      uv.set([c / SECTORS, k / (rings.length - 1)], o * 2);
      for (let w = 0; w < 4; w++) { skinI[o * 4 + w] = si.getComponent(best, w); skinW[o * 4 + w] = sw.getComponent(best, w); }
    }
  });
  const index: number[] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let c = 0; c < SECTORS; c++) {
      const i0 = k * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      index.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function shellFor(r: Rest, a: Analysis, part: 'top' | 'bottom', puffy = false): BufferGeometry | null {
  const key = part === 'top' ? (puffy ? 'puffer' : 'tee') : 'shorts';
  if (a.shells.has(key)) return a.shells.get(key)!;
  const slices = part === 'top' ? a.top : a.bottom;
  if (!slices) return null;
  const k = rawScale(r);
  // The tee's hem overlaps the shorts' waistband and sits just outside it.
  // The puffer is the tee blown up like a bouncy castle.
  const geo = part === 'top' ? shellGeometry(r, a, slices, puffy ? 0.22 : 0.05, (a.height * (puffy ? 0.03 : 0.012)) / k)
    : shellGeometry(r, a, slices, 0.02, (a.height * 0.008) / k);
  a.shells.set(key, geo);
  return geo;
}

/** Root units per raw unit. */
const rawScale = (r: Rest): number => r.meshRest.getMaxScaleOnAxis();

function addShell(r: Rest, a: Analysis, part: 'top' | 'bottom', m: Material, out: Object3D[], puffy = false): void {
  const geo = shellFor(r, a, part, puffy);
  if (!geo) return;
  const s = new THREE.SkinnedMesh(geo, m);
  s.name = `attire_${part}`;
  s.castShadow = true;
  s.receiveShadow = true;
  s.position.copy(r.body.position);
  s.quaternion.copy(r.body.quaternion);
  s.scale.copy(r.body.scale);
  r.body.parent!.add(s);
  s.bind(r.body.skeleton, r.body.bindMatrix);
  s.frustumCulled = false; // shares the body's bounds; cheap enough to always draw
  out.push(s);
}

/**
 * Backpack straps: from the pack's top, round each arm socket (behind → over the shoulder →
 * front → under the arm) and back down to the pack's bottom — on the torso slices, just
 * outside the tee. Points in raw space; returns root-space tubes relative to `origin`.
 */
function strapGeometries(r: Rest, a: Analysis, packTop: number, packBottom: number, packHalfW: number, origin: Vector3): BufferGeometry[] {
  if (!a.top) return [];
  const k = rawScale(r);
  const out: BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const shoulder = bonePos(r, side > 0 ? 'leftarm' : 'rightarm');
    const sock = shoulder ? toRaw(r, shoulder) : null;
    const sy = Math.min(sock?.y ?? a.fit.top[1], a.fit.top[1]);
    const armR = armRadius(a, side, sy) ?? (a.fit.top[1] - a.fit.top[0]) * 0.2;
    const at = (y: number, t: number, grow = 0.09) => outlinePoint(sliceAtHeight(a.top!, y), t, grow, (a.height * 0.012) / k);
    const sideT = side > 0 ? 0 : Math.PI;
    const backT = -Math.PI / 2 + side * 0.5, frontT = Math.PI / 2 - side * 0.55;
    const back = sliceAtHeight(a.top, packTop);
    const bz = back.cz - back.rz * 1.1;
    const pts = [
      { x: back.cx + side * packHalfW * 0.55, y: packTop, z: bz },
      at(sy + armR * 0.2, backT),
      at(Math.min(sy + armR * 0.9, a.fit.top[1]), sideT, 0.12),
      at(sy, frontT),
      at(sy - armR * 1.1, sideT, 0.1),
      at(sy - armR * 1.6, backT),
      { x: back.cx + side * packHalfW * 0.6, y: packBottom, z: bz },
    ].map((q) => toRoot(r, q).sub(origin));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    out.push(new THREE.TubeGeometry(curve, 40, a.height * 0.011, 6, false));
  }
  return out;
}

/** Half the vertical thickness of an arm where it meets the body (raw units), from its vertices. */
function armRadius(a: Analysis, side: number, y: number): number | null {
  const ys: number[] = [];
  const top = a.top ? sliceAtHeight(a.top, y) : null;
  for (const v of a.raw) {
    if (v.g !== 'A' || Math.sign(v.x) !== side) continue;
    if (top && Math.abs(v.x - top.cx) > top.rx * 1.6) continue; // just the part by the shoulder
    ys.push(v.y);
  }
  if (ys.length < 8) return null;
  ys.sort((p, q) => p - q);
  return (ys[Math.floor(ys.length * 0.9)] - ys[Math.floor(ys.length * 0.1)]) / 2;
}

// ── Rigid props ───────────────────────────────────────────────────────────

/** Parent `obj` to a bone so that, in the bind pose, it sits at `at` (root space) upright in root axes. */
function attach(r: Rest, root: Object3D, boneName: string, obj: Object3D, at: Vector3, out: Object3D[]): void {
  const b = r.bones.get(boneName);
  if (!b) { obj.position.copy(at); root.add(obj); out.push(obj); return; }
  const m = b.rest.clone().invert().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
  const s = new THREE.Vector3();
  m.decompose(obj.position, obj.quaternion, s);
  obj.scale.multiply(s);
  b.bone.add(obj);
  out.push(obj);
}

const G = () => new THREE.Group();

/** Head props: origin at the crown's base centre, unit = head radius, +Z = the face. */
function headProp(shape: Shape, lk: Look): Group {
  const g = G();
  const c1 = clay(lk.color), c2 = clay(lk.color2 ?? lk.color);
  switch (shape) {
    case 'bucket': {
      g.add(mesh(new THREE.CylinderGeometry(1.35, 1.4, 0.08, 28), c2).translateY(0.04));
      g.add(mesh(new THREE.CylinderGeometry(0.72, 0.92, 0.55, 24), c1).translateY(0.3));
      break;
    }
    case 'frogBeanie':
    case 'beanie': {
      g.add(mesh(new THREE.SphereGeometry(0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c1));
      g.add(mesh(new THREE.TorusGeometry(0.92, 0.12, 8, 28).rotateX(Math.PI / 2), c2).translateY(0.04));
      if (shape === 'frogBeanie') {
        for (const x of [-0.42, 0.42]) {
          const eye = mesh(new THREE.SphereGeometry(0.26, 14, 10), c1);
          eye.position.set(x, 0.82, 0.3);
          g.add(eye);
          const white = mesh(new THREE.SphereGeometry(0.16, 12, 8), clay('#ffffff'));
          white.position.set(x, 0.9, 0.46);
          g.add(white);
          const pupil = mesh(new THREE.SphereGeometry(0.08, 10, 8), clay('#1d1d1d'));
          pupil.position.set(x, 0.92, 0.6);
          g.add(pupil);
        }
      } else {
        g.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), c2).translateY(0.98));
      }
      break;
    }
    case 'cap':
    case 'visor': {
      if (shape === 'cap') g.add(mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c1));
      else g.add(mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 28).rotateX(Math.PI / 2), c1).translateY(0.1));
      const bill = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 20, 1, false, -Math.PI / 2, Math.PI), c2);
      bill.position.set(0, 0.06, 0.62);
      g.add(bill);
      break;
    }
    case 'acorn': {
      const capM = mesh(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c1);
      capM.scale.y = 0.7;
      g.add(capM);
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.35, 8), c2).translateY(0.75));
      break;
    }
    case 'flowerCrown': {
      g.add(mesh(new THREE.TorusGeometry(0.88, 0.07, 6, 28).rotateX(Math.PI / 2), c1).translateY(0.05));
      const petals = ['#ffd23f', '#ff8fc8', '#ffffff', '#b37bff'];
      for (let i = 0; i < 9; i++) {
        const t = (i / 9) * Math.PI * 2;
        const f = mesh(new THREE.SphereGeometry(0.17, 10, 8), clay(petals[i % petals.length]));
        f.position.set(Math.sin(t) * 0.88, 0.1, Math.cos(t) * 0.88);
        g.add(f);
      }
      break;
    }
    case 'lanternHat': {
      g.add(mesh(new THREE.SphereGeometry(0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c1));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), clay('#5b3a1e')).translateY(0.95));
      const lamp = mesh(new THREE.SphereGeometry(0.28, 14, 10), clay(lk.color2 ?? '#ffcf5a', { emissive: lk.color2 ?? '#ffcf5a', glow: 1.4 }));
      lamp.scale.y = 1.25;
      lamp.position.y = 1.35;
      g.add(lamp);
      break;
    }
    case 'backwards': {
      g.add(mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c1));
      const bill = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 20, 1, false, Math.PI / 2, Math.PI), c2);
      bill.position.set(0, 0.1, -0.62); // bill to the back: no cap
      bill.rotation.x = -0.12;
      g.add(bill);
      const snap = mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI).rotateX(Math.PI / 2), c2);
      snap.position.set(0, 0.12, 0.86);
      g.add(snap);
      break;
    }
    case 'cone': {
      const orange = clay(lk.color, { rough: 0.5 });
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.14, 1.7), clay('#1d1d1d')).translateY(0.07));
      g.add(mesh(new THREE.ConeGeometry(0.72, 2.1, 24), orange).translateY(1.15));
      for (const [y, r] of [[0.75, 0.6], [1.35, 0.42]] as const) {
        g.add(mesh(new THREE.CylinderGeometry(r * 0.94, r, 0.18, 24, 1, true), clay('#ffffff')).translateY(y));
      }
      break;
    }
    case 'propeller': {
      const quad = ['#d9483f', '#ffd23f', '#3a6fa8', '#3f8a4f'];
      quad.forEach((col, i) => g.add(mesh(new THREE.SphereGeometry(0.92, 12, 10, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), clay(col))));
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), clay('#8a8f99', { metal: 0.6 })).translateY(1.02));
      const prop = G();
      for (const d of [-1, 1]) {
        const blade = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.2), clay(d > 0 ? '#ff8fc8' : '#6fe0a4'));
        blade.position.x = d * 0.45;
        blade.rotation.x = d * 0.25;
        prop.add(blade);
      }
      prop.position.y = 1.18;
      const hub = mesh(new THREE.SphereGeometry(0.08, 8, 6), clay('#ffd23f'));
      hub.onBeforeRender = () => { prop.rotation.y += 0.35; }; // spins whenever it's drawn
      prop.add(hub);
      g.add(prop);
      break;
    }
    case 'tinfoil': {
      const foil = new THREE.MeshStandardMaterial({ color: lk.color, metalness: 0.9, roughness: 0.3, flatShading: true });
      const dome = mesh(new THREE.IcosahedronGeometry(0.95, 1), foil);
      dome.scale.set(1, 0.55, 1);
      dome.position.y = 0.1;
      g.add(dome);
      const point = mesh(new THREE.ConeGeometry(0.55, 1.3, 7), foil);
      point.position.y = 0.95;
      point.rotation.z = 0.12;
      g.add(point);
      break;
    }
    case 'cheese': {
      const cheese = clay(lk.color, { rough: 0.6 });
      const wedge = mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 6), cheese);
      wedge.scale.set(1, 0.55, 1);
      wedge.position.y = 0.32;
      g.add(wedge);
      const hole = clay(lk.color2 ?? '#e0a010');
      for (const [x, y, z] of [[0.35, 0.55, 0.5], [-0.3, 0.4, -0.2], [0.1, 0.62, -0.6], [-0.5, 0.25, 0.55]] as const) {
        g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), hole).translateX(x).translateY(y).translateZ(z));
      }
      break;
    }
    case 'mullet': {
      g.add(mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c1));
      const bill = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 20, 1, false, -Math.PI / 2, Math.PI), c1);
      bill.position.set(0, 0.06, 0.62);
      g.add(bill);
      const hair = clay(lk.color2 ?? '#8a5a32', { rough: 0.95 });
      for (let i = 0; i < 7; i++) { // party in the back
        const lock = mesh(new THREE.SphereGeometry(0.28, 10, 8), hair);
        lock.scale.set(1, 2.1, 0.8);
        lock.position.set((i - 3) * 0.2, -0.45 - Math.abs(i - 3) * 0.03, -0.72 + Math.abs(i - 3) * 0.05);
        g.add(lock);
      }
      break;
    }
    case 'galaxyBrain': {
      const brain = clay(lk.color, { emissive: lk.color2 ?? '#8a4fff', glow: 0.55, rough: 0.5 });
      const dome = mesh(new THREE.SphereGeometry(1.02, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), brain);
      dome.scale.y = 0.95;
      g.add(dome);
      const fold = clay('#d65aa0');
      for (let i = 0; i < 5; i++) {
        const f = mesh(new THREE.TorusGeometry(0.62 - i * 0.08, 0.05, 6, 20, Math.PI * 1.3), fold);
        f.rotation.set(Math.PI / 2 - 0.4 - i * 0.18, 0, (i % 2 ? 1 : -1) * 0.5);
        f.position.y = 0.35 + i * 0.1;
        g.add(f);
      }
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.95, 1.9), fold).translateY(0.45)); // the big split
      const star = clay('#fff8d6', { emissive: '#bcd6ff', glow: 2 });
      for (let i = 0; i < 9; i++) {
        const t = (i / 9) * Math.PI * 2;
        const sp = mesh(new THREE.OctahedronGeometry(0.08), star);
        sp.position.set(Math.cos(t) * 1.3, 0.5 + Math.sin(t * 3) * 0.35, Math.sin(t) * 1.3);
        sp.onBeforeRender = () => { sp.rotation.y += 0.05; };
        g.add(sp);
      }
      break;
    }
    case 'crab': {
      const red = clay(lk.color, { rough: 0.5 });
      const body = mesh(new THREE.SphereGeometry(0.7, 20, 12), red);
      body.scale.set(1.2, 0.5, 0.9);
      body.position.y = 0.3;
      g.add(body);
      for (const d of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const leg = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), red);
          leg.position.set(d * 0.8, 0.12, -0.3 + k * 0.28);
          leg.rotation.z = d * 1.1;
          g.add(leg);
        }
        const eye = mesh(new THREE.SphereGeometry(0.09, 8, 6), clay('#ffffff'));
        eye.position.set(d * 0.2, 0.75, 0.45);
        g.add(eye, mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), red).translateX(d * 0.2).translateY(0.6).translateZ(0.45));
        g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), c2).translateX(d * 0.2).translateY(0.77).translateZ(0.53));
        // Claws up — raving.
        const arm = G();
        arm.position.set(d * 0.75, 0.45, 0.35);
        const claw = mesh(new THREE.SphereGeometry(0.28, 12, 8), red);
        claw.scale.set(0.8, 1.2, 0.6);
        claw.position.set(d * 0.2, 0.55, 0);
        arm.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 6), red).translateX(d * 0.1).translateY(0.25), claw);
        let t = d * 1.5;
        claw.onBeforeRender = () => { t += 0.12; arm.rotation.z = d * (0.35 + Math.sin(t) * 0.35); };
        g.add(arm);
      }
      break;
    }
    case 'banana': { // a peeled banana sitting on your head, peel flopped down round it
      const peel = clay(lk.color, { rough: 0.55 });
      const cap = mesh(new THREE.SphereGeometry(0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), peel);
      cap.scale.y = 0.55;
      g.add(cap);
      const fruit = mesh(new THREE.CapsuleGeometry(0.4, 0.55, 6, 14), clay(lk.color2 ?? '#fff3c4', { rough: 0.7 }));
      fruit.position.y = 0.62;
      fruit.rotation.z = 0.12;
      g.add(fruit);
      const tip = clay('#6b4a1a');
      for (let i = 0; i < 4; i++) {
        const turn = G();
        turn.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
        const tilt = G();
        tilt.position.set(0, 0.35, 0.62);
        tilt.rotation.x = -0.55 - (i % 2) * 0.2; // flopped out and down
        const flap = mesh(new THREE.SphereGeometry(0.5, 12, 8), peel);
        flap.scale.set(0.62, 1.25, 0.14);
        flap.position.y = -0.55;
        tilt.add(flap, mesh(new THREE.SphereGeometry(0.07, 8, 6), tip).translateY(-1.15));
        turn.add(tilt);
        g.add(turn);
      }
      break;
    }
    case 'melon': { // half a watermelon rind, hollowed out and worn with pride
      const dome = mesh(new THREE.SphereGeometry(1.08, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2), clay(lk.color, { print: 'melon', rough: 0.5 }));
      dome.scale.y = 0.95;
      g.add(dome);
      g.add(mesh(new THREE.TorusGeometry(1.06, 0.08, 8, 32).rotateX(Math.PI / 2), clay('#eaf5d0')).translateY(0.02));
      g.add(mesh(new THREE.TorusGeometry(0.97, 0.09, 8, 32).rotateX(Math.PI / 2), clay(lk.color2 ?? '#ff4d5e', { rough: 0.6 })).translateY(0.0));
      const seed = clay('#1d1d1d', { rough: 0.3 });
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        const sd = mesh(new THREE.SphereGeometry(0.05, 8, 6), seed);
        sd.scale.set(1, 0.6, 1.6);
        sd.position.set(Math.sin(t) * 0.97, -0.07, Math.cos(t) * 0.97);
        sd.rotation.y = t;
        g.add(sd);
      }
      break;
    }
    case 'warHelm': { // big chunky raid-boss helm: steel dome, gold trim, huge horns
      const steel = clay(lk.color, { metal: 0.45, rough: 0.35 });
      const gold = clay(lk.color2 ?? '#c99a2e', { metal: 0.8, rough: 0.3 });
      const bone = clay('#efe6d2', { rough: 0.6 });
      const dome = mesh(new THREE.SphereGeometry(1.12, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), steel);
      dome.position.y = -0.1;
      g.add(dome);
      g.add(mesh(new THREE.TorusGeometry(1.12, 0.14, 8, 32).rotateX(Math.PI / 2), gold).translateY(-0.12));
      g.add(mesh(new THREE.TorusGeometry(1.1, 0.1, 6, 24, Math.PI).rotateY(Math.PI / 2), gold).translateY(-0.1)); // crest
      const nose = mesh(new THREE.BoxGeometry(0.2, 0.6, 0.14), gold);
      nose.position.set(0, -0.35, 1.1);
      g.add(nose);
      for (const d of [-1, 1]) {
        for (let i = 0; i < 16; i++) {
          const t = i / 15;
          const seg = mesh(new THREE.SphereGeometry(0.3 * (1 - t * 0.8), 12, 8), bone);
          seg.position.set(d * (0.95 + t * 0.95), 0.2 + t * t * 1.25, 0.1 - t * 0.2);
          g.add(seg);
        }
        g.add(mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 16).rotateZ(Math.PI / 2), gold).translateX(d * 1.02).translateY(0.2).translateZ(0.1));
      }
      g.add(mesh(new THREE.ConeGeometry(0.16, 0.6, 10), gold).translateY(1.22));
      break;
    }
    case 'chef': { // let him cook
      const white = clay(lk.color, { rough: 0.9 });
      g.add(mesh(new THREE.CylinderGeometry(0.88, 0.9, 0.42, 24), white).translateY(0.2));
      g.add(mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 28).rotateX(Math.PI / 2), clay(lk.color2 ?? '#e4e4e4')).translateY(0.04));
      const puff = mesh(new THREE.SphereGeometry(0.8, 18, 12), white);
      puff.scale.y = 0.7;
      puff.position.y = 0.95;
      g.add(puff);
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        const lobe = mesh(new THREE.SphereGeometry(0.46, 14, 10), white);
        lobe.position.set(Math.sin(t) * 0.62, 0.82, Math.cos(t) * 0.62);
        g.add(lobe);
      }
      break;
    }
    case 'ninjaBand': { // headband with a steel plate, the tails flapping behind
      const cloth = clay(lk.color, { rough: 0.9 });
      const band = mesh(new THREE.TorusGeometry(0.98, 0.1, 6, 28).rotateX(Math.PI / 2), cloth);
      band.scale.y = 1.8;
      band.position.y = -0.3;
      g.add(band);
      const plate = mesh(new THREE.BoxGeometry(0.62, 0.3, 0.06), clay(lk.color2 ?? '#b9c2cc', { metal: 0.8, rough: 0.3 }));
      plate.position.set(0, -0.3, 1.02);
      g.add(plate);
      g.add(mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), clay('#4b535e', { metal: 0.6 })).translateY(-0.3).translateZ(1.06));
      g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), cloth).translateY(-0.3).translateZ(-1.0)); // the knot
      for (const d of [-1, 1]) {
        const tail = G();
        tail.position.set(d * 0.08, -0.3, -1.02);
        tail.add(mesh(new THREE.BoxGeometry(0.16, 0.95, 0.03).translate(0, -0.48, 0), cloth));
        let t = d;
        tail.children[0].onBeforeRender = () => { t += 0.1; tail.rotation.set(0.75 + Math.sin(t) * 0.18, 0, d * 0.25); };
        g.add(tail);
      }
      break;
    }
    case 'goggles':
    case 'monocle': {
      const lenses = shape === 'goggles' ? [-0.36, 0.36] : [0.36];
      for (const x of lenses) {
        const rim = mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 20), c1);
        rim.position.set(x, -0.35, 0.95);
        g.add(rim);
        const glass = mesh(new THREE.CircleGeometry(0.24, 18), clay(lk.color2 ?? '#dff2ff', { rough: 0.2, metal: 0.1 }));
        glass.position.set(x, -0.35, 0.96);
        g.add(glass);
      }
      if (shape === 'goggles') g.add(mesh(new THREE.TorusGeometry(0.98, 0.06, 6, 28).rotateX(Math.PI / 2), c1).translateY(-0.35));
      break;
    }
  }
  return g;
}

/** Toy / hand props: origin at the grip, unit = prop size. */
function handProp(shape: Shape, lk: Look): Group {
  const g = G();
  const c1 = clay(lk.color), c2 = clay(lk.color2 ?? lk.color);
  switch (shape) {
    case 'duck': {
      g.add(mesh(new THREE.SphereGeometry(0.5, 16, 12), c1).translateY(0.35));
      const head = mesh(new THREE.SphereGeometry(0.32, 14, 10), c1);
      head.position.set(0, 0.85, 0.18);
      g.add(head);
      const beak = mesh(new THREE.ConeGeometry(0.12, 0.3, 10).rotateX(Math.PI / 2), c2);
      beak.position.set(0, 0.8, 0.52);
      g.add(beak);
      break;
    }
    case 'maraca': {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), c2).translateY(0.1));
      const bulb = mesh(new THREE.SphereGeometry(0.4, 16, 12), c1);
      bulb.scale.y = 1.2;
      bulb.position.y = 0.75;
      g.add(bulb);
      break;
    }
    case 'kazoo': {
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.9, 12).rotateX(Math.PI / 2), clay(lk.color, { metal: 0.5, rough: 0.35 })));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), c2).translateY(0.18));
      break;
    }
    case 'cowbell': {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.42, 0.7, 4, 1, true).rotateY(Math.PI / 4), clay(lk.color, { metal: 0.6, rough: 0.3 })).translateY(0.2));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), c2).translateY(0.75));
      break;
    }
    case 'whistle': {
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 14).rotateZ(Math.PI / 2), clay(lk.color, { metal: 0.6, rough: 0.3 })).translateY(0.2));
      g.add(mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16), c2).translateY(0.5));
      break;
    }
    case 'chicken': { // held by the feet, dangling up like a sad trophy
      const yellow = clay(lk.color, { rough: 0.55 });
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), clay('#ff8a2b')).translateY(0.1));
      const body = mesh(new THREE.CapsuleGeometry(0.28, 0.8, 6, 12), yellow);
      body.position.y = 0.75;
      g.add(body);
      const neck = mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), yellow);
      neck.position.set(0, 1.55, 0.06);
      g.add(neck);
      const head = mesh(new THREE.SphereGeometry(0.2, 12, 10), yellow);
      head.position.set(0, 1.95, 0.1);
      g.add(head);
      const comb = mesh(new THREE.SphereGeometry(0.12, 10, 8), c2);
      comb.scale.set(0.5, 1, 1.3);
      comb.position.set(0, 2.13, 0.08);
      g.add(comb);
      const beak = mesh(new THREE.ConeGeometry(0.1, 0.3, 8).rotateX(Math.PI / 2), clay('#ff8a2b'));
      beak.position.set(0, 1.93, 0.36);
      g.add(beak);
      break;
    }
    case 'slideWhistle': {
      const metal = clay(lk.color, { metal: 0.7, rough: 0.3 });
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12), metal).translateY(0.6));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.16, 12), c2).translateY(1.25));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), metal).translateY(-0.2));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), c2).translateY(-0.6));
      break;
    }
    case 'clapper': {
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), c2).translateY(0.35));
      for (const d of [-1, 1]) {
        const hand = G();
        hand.position.set(0, 1.05, d * 0.06);
        hand.rotation.x = d * 0.18;
        const palm = mesh(new THREE.SphereGeometry(0.3, 12, 8), c1);
        palm.scale.set(1, 1.1, 0.25);
        hand.add(palm);
        for (let f = 0; f < 4; f++) {
          const finger = mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 6), c1);
          finger.position.set(-0.2 + f * 0.13, 0.38, 0);
          finger.scale.z = 0.5;
          hand.add(finger);
        }
        g.add(hand);
      }
      break;
    }
    case 'spinner': {
      const spin = G();
      spin.position.y = 0.5;
      const body = clay(lk.color, { metal: 0.3, rough: 0.35 });
      spin.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16), clay(lk.color2 ?? '#c9c9c9', { metal: 0.7 })));
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI * 2;
        const lobe = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16), body);
        lobe.position.set(Math.cos(t) * 0.42, 0, Math.sin(t) * 0.42);
        spin.add(lobe);
        const arm = mesh(new THREE.BoxGeometry(0.42, 0.09, 0.2), body);
        arm.position.set(Math.cos(t) * 0.21, 0, Math.sin(t) * 0.21);
        arm.rotation.y = -t;
        spin.add(arm);
      }
      spin.rotation.x = Math.PI / 2;
      const hub = spin.children[0];
      hub.onBeforeRender = () => { spin.rotation.y += 0.45; };
      g.add(spin);
      break;
    }
    case 'honker': { // bulb horn with an angry goose on it
      g.add(mesh(new THREE.SphereGeometry(0.32, 14, 10), c1).translateY(0.3));
      const horn = mesh(new THREE.CylinderGeometry(0.28, 0.07, 0.8, 16, 1, true), clay(lk.color2 ?? '#e0b43c', { metal: 0.7, rough: 0.3 }));
      (horn.material as InstanceType<typeof THREE.MeshStandardMaterial>).side = THREE.DoubleSide;
      horn.position.set(0, 0.95, 0);
      g.add(horn);
      const goose = mesh(new THREE.SphereGeometry(0.14, 10, 8), clay('#ffffff'));
      goose.position.set(0, 0.35, 0.3);
      g.add(goose);
      const beak = mesh(new THREE.ConeGeometry(0.06, 0.18, 8).rotateX(Math.PI / 2), clay('#ff8a2b'));
      beak.position.set(0, 0.34, 0.47);
      g.add(beak);
      for (const d of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), clay('#1d1d1d')).translateX(d * 0.06).translateY(0.43).translateZ(0.42).rotateZ(-d * 0.5));
      break;
    }
    case 'gameBox': { // a board-game box, lid on, a few letter tiles stuck to the top
      g.add(mesh(new THREE.BoxGeometry(0.95, 0.22, 0.7), c1).translateY(0.3));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.07, 0.75), clay('#e8612a')).translateY(0.43));
      for (const [x, z, a] of [[-0.25, -0.05, 0.2], [0.02, 0.08, -0.15], [0.28, -0.08, 0.1]]) {
        const tile = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), c2);
        tile.position.set(x, 0.49, z);
        tile.rotation.y = a;
        g.add(tile);
      }
      break;
    }
    case 'diceCup': { // a leather dice cup, a couple of dice peeking over the rim
      const cup = mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.62, 16, 1, true), c1);
      (cup.material as InstanceType<typeof THREE.MeshStandardMaterial>).side = THREE.DoubleSide;
      g.add(cup.translateY(0.36));
      g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 16), c1).translateY(0.06));
      g.add(mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 20).rotateX(Math.PI / 2), clay('#e0b43c')).translateY(0.67));
      for (const [x, y, z, a] of [[-0.08, 0.66, 0.02, 0.5], [0.1, 0.62, -0.06, -0.3]]) {
        const die = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), c2);
        die.position.set(x, y, z);
        die.rotation.set(a, a * 1.3, a * 0.7);
        g.add(die);
      }
      break;
    }
    case 'recorder': {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 12), c1).translateY(0.6));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 12), c1).translateY(-0.2));
      for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), c2).translateY(0.3 + i * 0.16).translateZ(0.08));
      break;
    }
    case 'walkie': {
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.8, 0.2), c1).translateY(0.45));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), clay(lk.color2 ?? '#6fe06a', { emissive: lk.color2 ?? '#6fe06a', glow: 0.8 })).translateY(0.62).translateZ(0.11));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), clay('#1d1d1d')).translateY(1.1).translateX(0.14));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), clay('#2b2d33')).translateY(0.28 + i * 0.07).translateZ(0.11));
      break;
    }
    case 'jawHarp': {
      const metal = clay(lk.color, { metal: 0.8, rough: 0.3 });
      g.add(mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20, Math.PI * 1.4), metal).translateY(0.55).rotateZ(-Math.PI * 0.2));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), c2).translateY(0.6));
      break;
    }
    case 'theremin': {
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), c1).translateY(0.15));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), clay('#c9c9c9', { metal: 0.8 })).translateY(0.8).translateX(0.28));
      g.add(mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), clay('#c9c9c9', { metal: 0.8 })).translateX(-0.5).translateY(0.25).rotateY(Math.PI / 2));
      const glow = mesh(new THREE.SphereGeometry(0.07, 8, 6), clay(lk.color2 ?? '#c9a6ff', { emissive: lk.color2 ?? '#c9a6ff', glow: 1.6 }));
      glow.position.set(0, 0.32, 0.2);
      g.add(glow);
      break;
    }
    case 'whoopee': { // held up by the nozzle, ready to be sat on
      const rubber = clay(lk.color, { rough: 0.35 });
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 12), c2).translateY(0.15));
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12).rotateX(Math.PI / 2), c2).translateY(0.02));
      const pad = mesh(new THREE.SphereGeometry(0.55, 20, 12), rubber);
      pad.scale.set(1, 1, 0.3);
      pad.position.y = 0.78;
      let t = 0; // breathes in and out
      pad.onBeforeRender = () => { t += 0.08; pad.scale.set(1 + Math.sin(t) * 0.04, 1, 0.3 + Math.sin(t) * 0.05); };
      g.add(pad);
      break;
    }
    case 'triangle': { // the orchestra triangle, dangling from its loop, beater alongside
      const steel = clay(lk.color, { metal: 0.7, rough: 0.25 });
      const tri = G();
      tri.position.y = 0.6;
      const r = 0.5, rod = 0.065;
      const corners = [0, 1, 2].map((i) => { const a = Math.PI / 2 + (i * Math.PI * 2) / 3; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });
      for (let i = 0; i < 3; i++) {
        const a = corners[i], b = corners[(i + 1) % 3];
        const len = a.distanceTo(b) * (i === 1 ? 1 : 0.92); // one corner left open
        const bar = mesh(new THREE.CylinderGeometry(rod, rod, len, 8), steel);
        bar.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
        bar.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
        tri.add(bar);
      }
      let t = 0;
      tri.children[0].onBeforeRender = () => { t += 0.05; tri.rotation.y = Math.sin(t) * 0.4; };
      g.add(tri);
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 4), c2).translateY(1.2)); // the loop cord
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 8), c2).translateY(1.4)); // grip
      const beater = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), steel);
      beater.position.set(0.3, 0.55, 0.22);
      beater.rotation.z = -0.5;
      g.add(beater);
      break;
    }
    case 'marshmallow': {
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), c2).translateY(0.5));
      const m1 = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 12), clay('#fff6e8'));
      m1.position.y = 1.2;
      g.add(m1);
      const m2 = mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.12, 12), clay('#c98a4b'));
      m2.position.y = 1.36;
      g.add(m2);
      break;
    }
    default: {
      const ball = mesh(new THREE.SphereGeometry(0.45, 16, 12), c1);
      ball.position.y = 0.45;
      g.add(ball);
      g.add(mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 20), c2).translateY(0.45));
    }
  }
  return g;
}

/** One shoe: origin under the ankle, unit = foot length, +Z = toes. `side`: +1 left foot (at +x), -1 right. */
function shoeProp(shape: Shape, lk: Look, side = 1): Group {
  const g = G();
  const c1 = clay(lk.color), c2 = clay(lk.color2 ?? lk.color);
  const blob = (m: Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const b = mesh(new THREE.SphereGeometry(0.5, 16, 10), m);
    b.scale.set(sx, sy, sz);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const sole = (m: Material, h: number, sx = 0.64, sz = 1.04) => {
    const so = mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 18), m);
    so.scale.set(sx, 1, sz);
    so.position.set(0, h / 2, 0.12);
    g.add(so);
  };
  switch (shape) {
    case 'jordan': {
      // High-top hoop shoe, "Chicago" blocking: white base, red toe cap / heel / collar,
      // a black wing on the side, white midsole over a red outsole.
      const white = clay('#f6f6f2'), red = c1, black = c2;
      sole(red, 0.05);
      const mid = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.09, 18), white);
      mid.scale.set(0.66, 1, 1.06);
      mid.position.set(0, 0.095, 0.12);
      g.add(mid);
      blob(white, 0.62, 0.44, 1, 0, 0.24, 0.12);
      blob(red, 0.6, 0.34, 0.5, 0, 0.22, 0.42); // toe cap
      blob(red, 0.62, 0.46, 0.46, 0, 0.3, -0.22); // heel counter
      const collar = mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.5, 14), red);
      collar.position.set(0, 0.52, -0.08);
      g.add(collar);
      g.add(mesh(new THREE.TorusGeometry(0.27, 0.05, 6, 16).rotateX(Math.PI / 2), black).translateY(0.77).translateZ(-0.08));
      const tongue = blob(white, 0.26, 0.36, 0.12, 0, 0.62, 0.15); // padded tongue over the laces
      tongue.rotation.x = -0.3;
      for (let i = 0; i < 3; i++) {
        const lace = mesh(new THREE.BoxGeometry(0.24, 0.025, 0.03), white);
        lace.position.set(0, 0.38 + i * 0.07, 0.3 - i * 0.05);
        lace.rotation.x = -0.6;
        g.add(lace);
      }
      for (const x of [-1, 1]) {
        const wing = blob(black, 0.03, 0.12, 0.5, x * 0.31, 0.26, 0.06); // side wing
        wing.rotation.x = -0.25;
      }
      break;
    }
    case 'crocs': {
      // Clog with holes, heel strap flipped to sport mode, and a proud white sock.
      const clog = blob(c1, 0.72, 0.5, 1.08, 0, 0.2, 0.12);
      clog.material = clay(lk.color, { rough: 0.55 });
      const hole = clay('#2f5a24');
      for (let i = 0; i < 7; i++) {
        const h = mesh(new THREE.SphereGeometry(0.045, 8, 6), hole);
        h.position.set(((i % 3) - 1) * 0.16, 0.42, 0.24 + Math.floor(i / 3) * 0.14);
        g.add(h);
      }
      g.add(mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 18, Math.PI).rotateY(Math.PI / 2).rotateX(-0.4), c1).translateY(0.24).translateZ(-0.12));
      const sock = mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.6, 14), c2);
      sock.position.set(0, 0.55, -0.1);
      g.add(sock);
      g.add(mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 14), clay('#d9483f')).translateY(0.72).translateZ(-0.1));
      break;
    }
    case 'heelys': {
      sole(clay('#f6f6f2'), 0.12);
      blob(c1, 0.62, 0.42, 1, 0, 0.26, 0.12);
      blob(clay('#f6f6f2'), 0.6, 0.3, 0.45, 0, 0.24, 0.42);
      const wheel = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 14).rotateZ(Math.PI / 2), clay(lk.color2 ?? '#d8dde3', { metal: 0.6, rough: 0.3 }));
      wheel.position.set(0, 0.06, -0.26);
      g.add(wheel);
      break;
    }
    case 'bigBoots': {
      // Cartoon-huge rounded red boots (scaled up again where they're worn).
      const shiny = clay(lk.color, { rough: 0.35 });
      blob(shiny, 0.95, 0.85, 1.45, 0, 0.42, 0.22);
      const shaft = mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.7, 16), shiny);
      shaft.position.set(0, 0.8, -0.12);
      g.add(shaft);
      sole(c2, 0.08, 0.92, 1.44);
      break;
    }
    case 'toeShoes': {
      blob(c1, 0.58, 0.34, 0.95, 0, 0.14, 0.08);
      sole(clay(lk.color2 ?? '#b6ff3a'), 0.05, 0.6, 1.0);
      for (let i = 0; i < 5; i++) {
        const toe = mesh(new THREE.SphereGeometry(0.075 - i * 0.006, 10, 8), c1);
        toe.position.set(-0.2 + i * 0.1, 0.1, 0.56 - Math.abs(i - 1) * 0.03);
        g.add(toe);
      }
      break;
    }
    case 'sabatons': {
      // Raid-tier plate boots: layered steel toe, gold-trimmed cuff, spikes front and back.
      const steel = clay(lk.color, { metal: 0.45, rough: 0.35 });
      const gold = clay(lk.color2 ?? '#c99a2e', { metal: 0.8, rough: 0.3 });
      blob(steel, 0.8, 0.52, 1.25, 0, 0.24, 0.16);
      for (let i = 0; i < 3; i++) blob(i % 2 ? gold : steel, 0.72 - i * 0.1, 0.36 - i * 0.04, 0.34, 0, 0.3 - i * 0.03, 0.34 + i * 0.14);
      const cuff = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.55, 16), steel);
      cuff.position.set(0, 0.62, -0.1);
      g.add(cuff);
      for (const y of [0.38, 0.88]) g.add(mesh(new THREE.TorusGeometry(y > 0.5 ? 0.37 : 0.43, 0.05, 6, 18).rotateX(Math.PI / 2), gold).translateY(y).translateZ(-0.1));
      g.add(mesh(new THREE.ConeGeometry(0.08, 0.3, 8).rotateX(Math.PI / 2), gold).translateY(0.3).translateZ(0.86));
      g.add(mesh(new THREE.ConeGeometry(0.09, 0.35, 8).rotateX(-Math.PI / 2), gold).translateY(0.7).translateZ(-0.6));
      sole(clay('#3a3f47', { metal: 0.4 }), 0.07, 0.82, 1.28);
      break;
    }
    case 'tabi': {
      // Split-toe ninja boots: big toe on the inside, a hooked cuff.
      sole(c2, 0.05, 0.62, 1.02);
      blob(c1, 0.6, 0.42, 0.8, 0, 0.21, 0.02);
      blob(c1, 0.22, 0.28, 0.4, -side * 0.18, 0.15, 0.44); // big toe
      blob(c1, 0.36, 0.26, 0.38, side * 0.08, 0.14, 0.42);
      const cuff = mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.55, 14), c1);
      cuff.position.set(0, 0.52, -0.08);
      g.add(cuff);
      const hook = clay('#c9a24c', { metal: 0.7, rough: 0.3 });
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), hook).translateX(side * 0.26).translateY(0.34 + i * 0.14).translateZ(-0.06));
      break;
    }
    case 'bunnySlippers': {
      const fluff = clay(lk.color, { rough: 1 });
      blob(fluff, 0.78, 0.52, 1.12, 0, 0.22, 0.12);
      const inner = clay(lk.color2 ?? '#ff8fb8', { rough: 0.9 });
      for (const d of [-1, 1]) {
        const ear = G();
        ear.position.set(d * 0.14, 0.4, 0.34);
        ear.rotation.set(-0.35, 0, d * 0.35);
        const outer = mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), fluff);
        outer.scale.z = 0.5;
        outer.position.y = 0.26;
        const pink = mesh(new THREE.CapsuleGeometry(0.05, 0.32, 4, 8), inner);
        pink.scale.z = 0.4;
        pink.position.set(0, 0.26, 0.035);
        ear.add(outer, pink);
        g.add(ear);
        g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), clay('#1d1d1d', { rough: 0.3 })).translateX(d * 0.14).translateY(0.34).translateZ(0.56));
      }
      g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), inner).translateY(0.28).translateZ(0.68));
      break;
    }
    default: {
      const body = blob(c1, 0.62, shape === 'boots' ? 0.6 : 0.42, 1, 0, 0.18, 0.12);
      void body;
      sole(c2, 0.1);
      if (shape === 'boots') {
        const cuff = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.35, 12), c1);
        cuff.position.set(0, 0.4, -0.05);
        g.add(cuff);
      }
      if (shape === 'lightup') {
        const strip = mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 24).rotateX(Math.PI / 2), clay(lk.color2 ?? '#ff4fd8', { emissive: lk.color2 ?? '#ff4fd8', glow: 1.6 }));
        strip.scale.set(0.64, 1, 1.04);
        strip.position.set(0, 0.1, 0.12);
        g.add(strip);
      }
    }
  }
  return g;
}

const SHOE_SHAPES = new Set<Shape>(['boots', 'sneakers', 'lightup', 'jordan', 'crocs', 'heelys', 'bigBoots', 'toeShoes',
  'sabatons', 'tabi', 'bunnySlippers']);
const TOP_SHAPES = new Set<Shape>(['tee', 'vest', 'hoodie', 'puffer', 'plateArmor']);
/** Bottoms: shorts shells, some with a skirt hung round the waist (skirtProp). */
const BOTTOM_SHAPES = new Set<Shape>(['shorts', 'tutu', 'kilt', 'fauld']);
/** Slung across the back / hung on the belt. */
const BACK_SHAPES = new Set<Shape>(['katana', 'busterSword']);
const HIP_SHAPES = new Set<Shape>(['hipSword', 'fannyPack']);

/** Skirts over the shorts, unit radius at the waist (y = 0), unit = the shorts' height:
 * the tutu's two flared frills, the kilt's pleated wrap (+ a furry sporran), the greaves' steel tassets. */
function skirtProp(shape: Shape, lk: Look): Group {
  const g = G();
  if (shape === 'tutu') {
    const layers: [string, number, number][] = [[lk.color, 1.75, 0], [lk.color2 ?? lk.color, 1.5, 0.12]];
    for (const [col, flare, y] of layers) {
      const m = clay(col, { rough: 0.6 });
      (m as InstanceType<typeof THREE.MeshStandardMaterial>).side = THREE.DoubleSide;
      const cone = mesh(new THREE.CylinderGeometry(1, flare, 0.55, 40, 1, true), m);
      cone.position.y = -0.2 + y;
      g.add(cone);
    }
  } else if (shape === 'kilt') {
    const m = clay(lk.color, { print: lk.print, rough: 0.9 });
    (m as InstanceType<typeof THREE.MeshStandardMaterial>).side = THREE.DoubleSide;
    // Pleats: a wavy open tube, flaring a touch.
    const geo = new THREE.CylinderGeometry(1.02, 1.18, 0.95, 48, 1, true);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), w = 1 + 0.035 * Math.sin(a * 16);
      p.setXYZ(i, p.getX(i) * w, p.getY(i), p.getZ(i) * w);
    }
    geo.computeVertexNormals();
    g.add(mesh(geo, m).translateY(-0.4));
    g.add(mesh(new THREE.TorusGeometry(1.03, 0.05, 6, 32).rotateX(Math.PI / 2), clay('#3a2412')).translateY(0.05)); // belt
    const sporran = mesh(new THREE.SphereGeometry(0.22, 12, 10), clay('#f3efe6', { rough: 1 }));
    sporran.scale.set(1, 1.2, 0.5);
    sporran.position.set(0, -0.3, 1.14);
    g.add(sporran, mesh(new THREE.BoxGeometry(0.34, 0.12, 0.12), clay('#5b3a1e')).translateY(-0.06).translateZ(1.1));
  } else if (shape === 'fauld') {
    const steel = clay(lk.color, { metal: 0.45, rough: 0.35 });
    const gold = clay(lk.color2 ?? '#c99a2e', { metal: 0.8, rough: 0.3 });
    g.add(mesh(new THREE.TorusGeometry(1.08, 0.09, 8, 32).rotateX(Math.PI / 2), gold).translateY(0.05));
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * Math.PI * 2 + Math.PI / 7;
      const turn = G();
      turn.rotation.y = t;
      const tilt = G();
      tilt.position.z = 1.08;
      tilt.rotation.x = 0.28; // flares outward
      const plate = mesh(new THREE.BoxGeometry(0.62, 0.72, 0.07).translate(0, -0.38, 0), steel);
      tilt.add(plate, mesh(new THREE.BoxGeometry(0.64, 0.06, 0.09).translate(0, -0.74, 0), gold));
      turn.add(tilt);
      g.add(turn);
    }
  }
  return g;
}

/** Torso props (neck ring / sash / backpack): origin at the ring centre, unit = torso radius.
 * `worn`: on a body, packs get real straps from strapGeometries instead of the display hoops. */
function torsoProp(shape: Shape, lk: Look, worn = false): Group {
  const g = G();
  const c1 = clay(lk.color), c2 = clay(lk.color2 ?? lk.color);
  switch (shape) {
    case 'neckerchief': {
      g.add(mesh(new THREE.TorusGeometry(1, 0.1, 8, 28).rotateX(Math.PI / 2), c1));
      const tri = mesh(new THREE.ConeGeometry(0.45, 0.7, 3).rotateX(Math.PI), c1);
      tri.scale.z = 0.25;
      tri.position.set(0, -0.3, 0.98);
      g.add(tri);
      g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), c2).translateZ(1.02));
      break;
    }
    case 'beads': {
      const cols = ['#ff6b6b', '#ffd23f', '#6fe0a4', '#5a9bff', '#b37bff', '#ff8fc8'];
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const b = mesh(new THREE.SphereGeometry(0.1, 10, 8), clay(cols[i % cols.length], { rough: 0.35 }));
        b.position.set(Math.sin(t), -0.1 + Math.cos(t) * 0.1, Math.cos(t));
        g.add(b);
      }
      break;
    }
    case 'goldChain': {
      const gold = clay(lk.color, { metal: 0.9, rough: 0.25 });
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2;
        const link = mesh(new THREE.TorusGeometry(0.09, 0.035, 6, 12), gold);
        link.position.set(Math.sin(t), -0.12 + Math.cos(t) * 0.14, Math.cos(t));
        link.rotation.set(0, t + (i % 2 ? Math.PI / 2 : 0), 0);
        g.add(link);
      }
      // The medallion: a big golden pinecone.
      const pend = G();
      pend.position.set(0, -0.62, 1.12);
      const cone = mesh(new THREE.SphereGeometry(0.22, 12, 10), gold);
      cone.scale.set(0.8, 1.2, 0.5);
      pend.add(cone);
      for (let k = 0; k < 3; k++) {
        const scale = mesh(new THREE.TorusGeometry(0.16 - k * 0.04, 0.03, 4, 12, Math.PI), clay(lk.color2 ?? '#fff1b0', { metal: 0.9, rough: 0.2 }));
        scale.position.set(0, 0.12 - k * 0.12, 0.08);
        scale.rotation.z = Math.PI;
        pend.add(scale);
      }
      g.add(pend);
      break;
    }
    case 'sash': {
      const s = mesh(new THREE.TorusGeometry(1.02, 0.12, 6, 32), c1);
      s.scale.set(1, 1.6, 0.25);
      s.rotation.set(Math.PI / 2, 0.55, 0);
      s.rotation.order = 'YXZ';
      const holder = G();
      holder.add(s);
      holder.rotation.set(0, 0, 0.6);
      holder.scale.set(1, 1, 1);
      g.add(holder);
      for (let i = 0; i < 3; i++) {
        const badge = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12).rotateX(Math.PI / 2), c2);
        badge.position.set(-0.3 + i * 0.28, -0.35 + i * 0.25, 1.02);
        g.add(badge);
      }
      break;
    }
    case 'paddlePack':
    case 'backpack': {
      const pack = mesh(new THREE.BoxGeometry(1.1, 1.1, 0.5), c1);
      pack.position.set(0, -0.5, -1.15);
      g.add(pack);
      const flap = mesh(new THREE.BoxGeometry(1.12, 0.35, 0.54), c2);
      flap.position.set(0, -0.08, -1.15);
      g.add(flap);
      if (!worn) for (const x of [-0.35, 0.35]) g.add(mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 16, Math.PI).rotateY(Math.PI / 2), c2).translateX(x).translateY(-0.3).translateZ(-0.55));
      if (shape === 'paddlePack') {
        const paddle = G();
        paddle.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), c2));
        const blade = mesh(new THREE.SphereGeometry(0.3, 12, 8), c2);
        blade.scale.set(1, 1.8, 0.2);
        blade.position.y = 1.2;
        paddle.add(blade);
        paddle.position.set(0.3, 0, -1.45);
        paddle.rotation.z = -0.35;
        g.add(paddle);
      }
      break;
    }
  }
  return g;
}

/** Swords: origin at the guard, handle up (+y), blade down, unit = torso radius. */
function swordProp(shape: Shape, lk: Look): Group {
  const g = G();
  const gold = clay('#e0b43c', { metal: 0.8, rough: 0.3 });
  if (shape === 'katana') {
    const saya = mesh(new THREE.CylinderGeometry(0.1, 0.09, 2.5, 10), clay(lk.color, { rough: 0.3 }));
    saya.scale.set(1.3, 1, 0.75);
    saya.position.y = -1.3;
    g.add(saya, mesh(new THREE.SphereGeometry(0.1, 8, 6), gold).translateY(-2.55));
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12).rotateX(Math.PI / 2), clay(lk.color2 ?? '#b8342c')).translateY(-0.3));
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 18), gold)); // tsuba
    g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.85, 10), clay(lk.color2 ?? '#b8342c', { rough: 0.9 })).translateY(0.45));
    const wrap = clay('#f3e6cf');
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.087, 0.018, 4, 10).rotateX(Math.PI / 2 + (i % 2 ? 0.4 : -0.4)), wrap).translateY(0.12 + i * 0.16));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), gold).translateY(0.9));
  } else if (shape === 'busterSword') {
    const steel = clay(lk.color, { metal: 0.6, rough: 0.35 });
    const blade = mesh(new THREE.BoxGeometry(0.8, 2.9, 0.12), steel);
    blade.position.y = -1.55;
    g.add(blade);
    // The angled tip: a wedge cut off one corner.
    const tip = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 3, 1).rotateX(Math.PI / 2), steel);
    tip.scale.set(0.5, 0.6, 1);
    tip.rotation.z = Math.PI / 2 + 0.25;
    tip.position.set(0.03, -3.05, 0);
    g.add(tip);
    g.add(mesh(new THREE.BoxGeometry(0.08, 2.9, 0.13), clay('#e6ebf0', { metal: 0.9, rough: 0.2 })).translateX(-0.37).translateY(-1.55)); // edge
    for (const y of [-0.35, -0.65]) g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 12).rotateX(Math.PI / 2), clay('#2b2d33', { metal: 0.6 })).translateY(y).translateX(0.12));
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.16, 0.24), clay('#4b535e', { metal: 0.7, rough: 0.35 })));
    g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.0, 10), clay(lk.color2 ?? '#5b3a1e', { rough: 0.9 })).translateY(0.58));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), clay('#4b535e', { metal: 0.7 })).translateY(1.12));
  } else { // a hero's sword in a leather scabbard
    const leather = clay(lk.color, { rough: 0.7 });
    const sheath = mesh(new THREE.CylinderGeometry(0.13, 0.1, 1.8, 10), leather);
    sheath.scale.z = 0.5;
    sheath.position.y = -0.95;
    g.add(sheath);
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 10).rotateX(Math.PI), clay(lk.color2 ?? '#e0b43c', { metal: 0.8, rough: 0.3 })).translateY(-1.95));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.08, 0.1), leather).translateY(-0.25));
    g.add(mesh(new THREE.BoxGeometry(0.62, 0.09, 0.12), clay(lk.color2 ?? '#e0b43c', { metal: 0.8, rough: 0.3 })));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), clay('#3a5fa8', { rough: 0.8 })).translateY(0.25));
    g.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), clay(lk.color2 ?? '#e0b43c', { metal: 0.8, rough: 0.3 })).translateY(0.5));
  }
  return g;
}

/** How far below the guard a sword's middle is (torso units) — slung swords hang from their middle. */
const SWORD_MID: Partial<Record<Shape, number>> = { katana: 0.8, busterSword: 1.0, hipSword: 0.7 };

/** The fanny pack's pouch: origin at its back face, unit = waist radius. */
function fannyPouch(lk: Look): Group {
  const g = G();
  const pouch = mesh(new THREE.SphereGeometry(0.5, 16, 10), clay(lk.color, { rough: 0.45 }));
  pouch.scale.set(1.15, 0.55, 0.45);
  pouch.position.z = 0.18;
  g.add(pouch);
  const zip = mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 20, Math.PI), clay(lk.color2 ?? '#3ee0d0'));
  zip.scale.set(1.12, 0.3, 1);
  zip.position.set(0, 0.06, 0.37);
  g.add(zip, mesh(new THREE.BoxGeometry(0.06, 0.1, 0.03), clay('#d8dde3', { metal: 0.7 })).translateX(0.3).translateY(0.1).translateZ(0.42));
  return g;
}

/** A giant spiked shoulder pauldron, origin at its base, unit = shoulder size. `side` +1 = left (+x). */
function pauldronProp(lk: Look, side: number): Group {
  const g = G();
  const steel = clay(lk.color, { metal: 0.45, rough: 0.35 });
  const gold = clay(lk.color2 ?? '#c99a2e', { metal: 0.8, rough: 0.3 });
  const tilt = G();
  tilt.rotation.z = -side * 0.35;
  const dome = mesh(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  dome.scale.set(1, 0.75, 1.05);
  tilt.add(dome);
  tilt.add(mesh(new THREE.TorusGeometry(1, 0.1, 8, 28).rotateX(Math.PI / 2), gold).translateY(0.02));
  const lame = mesh(new THREE.CylinderGeometry(1.02, 1.12, 0.3, 24, 1, true), steel);
  (lame.material as InstanceType<typeof THREE.MeshStandardMaterial>).side = THREE.DoubleSide;
  tilt.add(lame.translateY(-0.12));
  const bone = clay('#efe6d2', { rough: 0.6 });
  for (const [x, z, h] of [[0.15, 0, 0.9], [0.45, 0.4, 0.6], [0.45, -0.4, 0.6]] as const) {
    const spike = mesh(new THREE.ConeGeometry(0.16, h, 10), bone);
    spike.position.set(side * x, 0.55 + h * 0.3, z);
    spike.rotation.z = -side * 0.3;
    tilt.add(spike);
  }
  g.add(tilt);
  return g;
}

function braceletProp(lk: Look): Group {
  const g = G();
  g.add(mesh(new THREE.TorusGeometry(1, 0.28, 8, 20), clay(lk.color)));
  const b2 = mesh(new THREE.TorusGeometry(1, 0.18, 8, 20), clay(lk.color2 ?? lk.color));
  b2.position.x = 0.1;
  b2.rotation.y = 0.3;
  g.add(b2);
  g.rotation.y = Math.PI / 2;
  return g;
}

// ── Dressing ──────────────────────────────────────────────────────────────

/** Name of the held toy prop (found by customization/toy-use.ts). */
export const TOY_PROP = 'attire_toy';

const HEAD_SHAPES = new Set<Shape>(['bucket', 'beanie', 'frogBeanie', 'cap', 'visor', 'acorn', 'flowerCrown', 'lanternHat', 'goggles', 'monocle',
  'backwards', 'cone', 'propeller', 'tinfoil', 'cheese', 'mullet', 'galaxyBrain', 'crab',
  'banana', 'melon', 'warHelm', 'chef', 'ninjaBand']);
const TORSO_SHAPES = new Set<Shape>(['neckerchief', 'beads', 'sash', 'backpack', 'paddlePack', 'goldChain']);

/** Highest head slice whose vertices surround the head's axis (≥ 80% of the directions). */
function skullTopOf(a: Analysis, ids: number[], head: Box3, axis: Vector3): number {
  const size = head.getSize(new THREE.Vector3());
  const minR = Math.max(size.x, size.z) * 0.5 * 0.3;
  const step = size.y / 48;
  for (let y = head.max.y - step; y > head.min.y + size.y * 0.4; y -= step) {
    const seen = new Set<number>();
    for (const i of ids) {
      if (Math.abs(a.pos[i * 3 + 1] - y) > step) continue;
      const dx = a.pos[i * 3] - axis.x, dz = a.pos[i * 3 + 2] - axis.z;
      if (Math.hypot(dx, dz) >= minR) seen.add(sectorOf(dx, dz));
    }
    if (seen.size >= SECTORS * 0.8) return y;
  }
  return head.min.y + size.y * 0.75;
}

/** Takes off whatever `dressCharacter` put on. */
export function undressCharacter(root: Object3D): void {
  for (const o of worn.get(root) ?? []) o.removeFromParent();
  worn.delete(root);
}

/** Puts `loadout` on a character made by createCharacter (replacing any earlier outfit). */
export function dressCharacter(root: Object3D, loadout: AvatarLoadout): void {
  undressCharacter(root);
  const r = restOf(root);
  if (!r) return;
  const a = analyse(r);
  const out: Object3D[] = [];
  const H = a.height;

  // Measurements from the bind pose.
  const headIds = verts(a, (o) => HEAD.test(o));
  const head = headIds.length > 20 ? boxOf(a, headIds) : null;
  const headBone = bonePos(r, 'head');
  const headC = head ? head.getCenter(new THREE.Vector3()) : headBone ?? new THREE.Vector3(0, H * 0.8, 0);
  const headSize = head ? head.getSize(new THREE.Vector3()) : new THREE.Vector3(H * 0.3, H * 0.3, H * 0.3);
  // Hats sit on the skull, not on ears / combs / horns / eye bumps. Those only cover a few
  // directions around the head, so scanning down from the top, the skull top is the first
  // slice whose vertices go (nearly) all the way round. The hat is sized from the head's
  // cross-section a little below it.
  const headYs = headIds.map((i) => a.pos[i * 3 + 1]).sort((p, q) => p - q);
  const axis = headBone ?? headC;
  const colR = Math.max(headSize.x, headSize.z) * 0.18;
  const column = headIds.filter((i) => Math.hypot(a.pos[i * 3] - axis.x, a.pos[i * 3 + 2] - axis.z) < colR);
  const skullTop = head ? skullTopOf(a, headIds, head, axis) : headC.y + headSize.y * 0.4;
  const hatY = skullTop - headSize.y * 0.1;
  const hatRing = headIds.length ? ring(a, headIds, hatY, headSize.y * 0.06) : null;
  let hatX = axis.x, hatZ = axis.z;
  if (column.length) {
    hatX = column.reduce((q, i) => q + a.pos[i * 3], 0) / column.length;
    hatZ = column.reduce((q, i) => q + a.pos[i * 3 + 2], 0) / column.length;
  }
  const headR = hatRing ? (hatRing.r.reduce((q, x) => q + x, 0) / SECTORS) * 1.08 : Math.max(headSize.x, headSize.z) * 0.5;
  // Neck things sit on the top of the fitted torso (just under the chin), packs and sashes on
  // the fit's chest slice. Slices are raw space; k converts their sizes to root units.
  const k = rawScale(r);
  const collar = a.top ? sliceAtHeight(a.top, a.fit.top[1]) : null;
  const chest = a.top ? sliceAtHeight(a.top, a.fit.chest) : null;
  const chestBone = r.bones.get('neck')?.bone.parent;
  const chestName = chestBone ? norm(chestBone.name) : 'hips';

  for (const [slot, id] of Object.entries(loadout) as [keyof AvatarLoadout, string][]) {
    const it = itemById(id);
    if (!it) continue;
    const lk = lookOf(it);
    const shape = lk.shape;
    if (slot === 'top' || TOP_SHAPES.has(shape)) {
      const glossy = shape === 'vest' || shape === 'puffer';
      const plate = shape === 'plateArmor';
      const m = plate ? clay(lk.color, { print: lk.print, metal: 0.35, rough: 0.4 })
        : lk.print ? clay(lk.color, { print: lk.print, rough: glossy ? 0.4 : 0.85 })
        : clay(lk.color, { map: shape === 'tee' ? 'stripes' : shape === 'vest' ? 'quilt' : undefined, rough: glossy ? 0.45 : 0.85 });
      addShell(r, a, 'top', m, out, shape === 'puffer' || plate); // plate is as chunky as the puffer
      if (shape === 'hoodie' && collar) {
        const hood = mesh(new THREE.TorusGeometry(1, 0.26, 8, 28).rotateX(Math.PI / 2), clay(lk.color));
        hood.scale.set(collar.rx * k * 1.02, collar.rz * k * 0.6, collar.rz * k * 1.02);
        attach(r, root, chestName, hood, toRoot(r, { x: collar.cx, y: collar.y, z: collar.cz - collar.rz * 0.12 }), out);
      }
      if (plate && chest) {
        // Huge spiked pauldrons over each arm socket, riding the shoulder (clavicle) bones.
        const R = Math.min(chest.rx, (chest.rx + chest.rz) / 2) * k;
        for (const side of [1, -1]) {
          const arm = bonePos(r, side > 0 ? 'leftarm' : 'rightarm');
          if (!arm) continue;
          const bone = side > 0 ? 'leftshoulder' : 'rightshoulder';
          const p = pauldronProp(lk, side);
          p.scale.setScalar(Math.max(R * 0.8, H * 0.14));
          attach(r, root, r.bones.has(bone) ? bone : chestName, p, arm.clone().add(new THREE.Vector3(side * R * 0.12, R * 0.12, 0)), out);
        }
      }
    } else if (slot === 'bottom' || BOTTOM_SHAPES.has(shape)) {
      const plate = shape === 'fauld';
      addShell(r, a, 'bottom', lk.print ? clay(lk.color, { print: lk.print, rough: plate ? 0.4 : 0.9, metal: plate ? 0.35 : 0 })
        : clay(lk.color, { rough: 0.9 }), out);
      if (shape !== 'shorts' && a.bottom) {
        const [y0, y1] = a.fit.bottom;
        const waist = sliceAtHeight(a.bottom, y0 + (y1 - y0) * 0.72);
        const skirt = skirtProp(shape, lk);
        skirt.scale.set(waist.rx * k * 1.1, (y1 - y0) * k * 0.9, waist.rz * k * 1.1);
        attach(r, root, 'hips', skirt, toRoot(r, { x: waist.cx, y: waist.y, z: waist.cz }), out);
      }
    } else if (BACK_SHAPES.has(shape) && chest) {
      // Slung across the back from its middle, clear of a chunky top; the handle over a shoulder.
      // Sized from the whole body (a skinny torso still gets a comically big sword).
      const R = Math.min(chest.rx, (chest.rx + chest.rz) / 2) * 1.1;
      const unit = H * (shape === 'busterSword' ? 0.24 : 0.2);
      const holder = G();
      const tilt = G();
      tilt.rotation.set(shape === 'busterSword' ? -0.12 : 0, 0, shape === 'busterSword' ? -0.3 : 0.8);
      const sword = swordProp(shape, lk);
      sword.position.y = SWORD_MID[shape] ?? 0;
      tilt.add(sword);
      holder.add(tilt);
      holder.scale.setScalar(unit);
      const backZ = chest.cz - chest.rz * 1.32 - (unit / k) * 0.15;
      attach(r, root, chestName, holder, toRoot(r, { x: chest.cx, y: chest.y + R * 0.3, z: backZ }), out);
    } else if (HIP_SHAPES.has(shape) && a.bottom) {
      const [y0, y1] = a.fit.bottom;
      const waist = sliceAtHeight(a.bottom, y0 + (y1 - y0) * 0.8);
      const W = ((waist.rx + waist.rz) / 2) * k;
      const belt = mesh(new THREE.TorusGeometry(1, 0.05, 6, 32).rotateX(Math.PI / 2), clay(shape === 'fannyPack' ? '#2b2d33' : '#3a2412'));
      belt.scale.set(waist.rx * k * 1.1, W, waist.rz * k * 1.1);
      attach(r, root, 'hips', belt, toRoot(r, { x: waist.cx, y: waist.y, z: waist.cz }), out);
      if (shape === 'fannyPack') {
        const pouch = fannyPouch(lk);
        pouch.scale.setScalar(W * 0.75);
        attach(r, root, 'hips', pouch, toRoot(r, { x: waist.cx, y: waist.y - (y1 - y0) * 0.1, z: waist.cz + waist.rz * 1.08 }), out);
      } else {
        // On the left hip, handle forward, the scabbard angled down behind.
        const holder = G();
        const tilt = G();
        tilt.rotation.set(0.7, 0, 0.15);
        tilt.add(swordProp(shape, lk));
        holder.add(tilt);
        holder.scale.setScalar(Math.max(W * 0.85, H * 0.17));
        attach(r, root, 'hips', holder, toRoot(r, { x: waist.cx + waist.rx * 1.15, y: waist.y, z: waist.cz + waist.rz * 0.1 }), out);
      }
    } else if (HEAD_SHAPES.has(shape)) {
      const g = headProp(shape, lk);
      g.scale.setScalar(headR);
      const glasses = shape === 'goggles' || shape === 'monocle';
      const at = glasses ? new THREE.Vector3(headC.x, headC.y + headR * 0.35, headC.z)
        : new THREE.Vector3(hatX, hatY, hatZ);
      attach(r, root, 'head', g, at, out);
    } else if (TORSO_SHAPES.has(shape) && collar && chest) {
      const pack = shape === 'backpack' || shape === 'paddlePack';
      const g = torsoProp(shape, lk, true);
      if (pack) {
        // Uniform size from the chest; its front face (0.9 units behind the origin, hanging half a
        // unit below it) seated on the fitted back.
        const R = Math.min(chest.rx, (chest.rx + chest.rz) / 2) * 1.1;
        g.scale.setScalar(R * k);
        const backZ = chest.cz - chest.rz * 1.1;
        const at = toRoot(r, { x: chest.cx, y: chest.y + R * 0.5, z: backZ + R * 0.9 });
        attach(r, root, chestName, g, at, out);
        const strapMat = clay(lk.color2 ?? lk.color);
        for (const geo of strapGeometries(r, a, chest.y + R * 0.45, chest.y - R * 0.5, R * 1.1, at)) {
          const strap = mesh(geo, strapMat);
          attach(r, root, chestName, strap, at, out);
        }
      } else {
        // Rings follow the torso's own (wider-than-deep) outline.
        const c = shape === 'sash' ? chest : collar;
        g.scale.set(c.rx * k * 1.1, ((c.rx + c.rz) / 2) * k, c.rz * k * 1.1);
        attach(r, root, chestName, g, toRoot(r, { x: c.cx, y: c.y, z: c.cz }), out);
      }
    } else if (shape === 'bracelet') {
      const g = braceletProp(lk);
      g.scale.setScalar(H * 0.045);
      const at = bonePos(r, 'rightforearm')?.lerp(bonePos(r, 'righthand') ?? new THREE.Vector3(), 0.8);
      if (at) attach(r, root, 'rightforearm', g, at, out);
    } else if (slot === 'feet' || SHOE_SHAPES.has(shape)) {
      for (const side of ['left', 'right']) {
        const ids = verts(a, (o) => o.startsWith(`${side}foot`) || o.startsWith(`${side}toe`));
        if (ids.length < 6) continue;
        const b = boxOf(a, ids);
        const size = b.getSize(new THREE.Vector3());
        const c = b.getCenter(new THREE.Vector3());
        const g = shoeProp(shape, lk, side === 'left' ? 1 : -1);
        const big = shape === 'bigBoots' ? 1.45 : shape === 'sabatons' ? 1.2 : 1;
        g.scale.set(Math.max(size.x, size.z * 0.6) * 1.35 * big, Math.max(size.y, size.z * 0.5) * 1.1 * big, size.z * 1.25 * big);
        attach(r, root, `${side}foot`, g, new THREE.Vector3(c.x, b.min.y - H * 0.005, c.z - size.z * 0.08), out);
      }
    } else {
      // Hand-held: the toy in the left hand; anything else (marshmallow stick…) in the right.
      const side = slot === 'toy' ? 'left' : 'right';
      const hand = bonePos(r, `${side}hand`);
      if (!hand) continue;
      const fore = bonePos(r, `${side}forearm`);
      const dir = fore ? hand.clone().sub(fore).normalize() : new THREE.Vector3();
      const g = handProp(shape, lk);
      g.scale.setScalar(H * (shape === 'marshmallow' ? 0.14 : 0.1));
      if (slot === 'toy') g.name = TOY_PROP; // toy-use.ts pops it up while it's played
      attach(r, root, `${side}hand`, g, hand.clone().addScaledVector(dir, H * 0.03).add(new THREE.Vector3(0, -H * 0.02, 0)), out);
    }
  }
  worn.set(root, out);
}

// ── Free-standing props (tent display) ────────────────────────────────────

/** A display-sized model of an item (~1 unit tall), standing on y = 0 — for the tent's display spots. */
export function buildItemProp(it: Item): Group {
  const lk = lookOf(it);
  const shape = lk.shape;
  const g = G();
  if (it.kind === 'pennant') {
    const cols = typeof it.swatch === 'string' ? [it.swatch] : [...(it.swatch ?? ['#d9483f'])];
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), clay('#8a5a3a')).translateY(0.6));
    const flag = mesh(new THREE.ConeGeometry(0.22, 0.75, 3).rotateZ(-Math.PI / 2), clay(cols[0]));
    flag.scale.z = 0.12;
    flag.position.set(0.4, 1.02, 0);
    g.add(flag);
    return g;
  }
  if (BACK_SHAPES.has(shape) || shape === 'hipSword') {
    // Planted in the ground, handle up.
    const sw = swordProp(shape, lk);
    const len = shape === 'busterSword' ? 3.3 : shape === 'katana' ? 2.6 : 2.05;
    const sc = 1.05 / (len + 1.1);
    sw.scale.setScalar(sc);
    sw.position.y = (len - 0.25) * sc;
    sw.rotation.z = 0.08;
    g.add(sw, mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), clay('#8a6a45')));
    return g;
  }
  if (shape === 'fannyPack') {
    const p = fannyPouch(lk);
    p.scale.setScalar(0.5);
    p.position.y = 0.15;
    g.add(p, mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20).rotateX(Math.PI / 2), clay('#2b2d33')).translateY(0.03).translateZ(-0.12));
    return g;
  }
  if (TOP_SHAPES.has(shape) || BOTTOM_SHAPES.has(shape)) {
    // Folded on a little crate.
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.55), clay('#b07a4c')).translateY(0.175));
    for (let i = 0; i < 2; i++) {
      const fold = mesh(new THREE.BoxGeometry(0.58, 0.1, 0.46), lk.print ? clay(lk.color, { print: lk.print })
        : clay(i ? lk.color2 ?? lk.color : lk.color, { map: shape === 'tee' ? 'stripes' : undefined }));
      fold.position.y = 0.4 + i * 0.1;
      fold.rotation.y = i * 0.12;
      g.add(fold);
    }
    return g;
  }
  if (HEAD_SHAPES.has(shape)) {
    // On a peg.
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.55, 8), clay('#8a5a3a')).translateY(0.275));
    const head = mesh(new THREE.SphereGeometry(0.22, 14, 10), clay('#d8c4a4'));
    head.position.y = 0.62;
    g.add(head);
    const hat = headProp(shape, lk);
    hat.scale.setScalar(0.24);
    hat.position.y = 0.7;
    g.add(hat);
    return g;
  }
  if (TORSO_SHAPES.has(shape)) {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 12), clay('#d8c4a4')).translateY(0.3));
    const p = torsoProp(shape, lk);
    p.scale.setScalar(0.22);
    p.position.y = 0.55;
    g.add(p);
    return g;
  }
  if (shape === 'bracelet') {
    const b = braceletProp(lk);
    b.scale.setScalar(0.18);
    b.rotation.set(Math.PI / 2, 0, 0);
    b.position.y = 0.06;
    g.add(b);
    return g;
  }
  if (SHOE_SHAPES.has(shape)) {
    for (const x of [-0.17, 0.17]) {
      const s = shoeProp(shape, lk);
      s.scale.set(0.34, 0.4, 0.5);
      s.position.x = x;
      s.rotation.y = x * 0.6;
      g.add(s);
    }
    return g;
  }
  const t = handProp(shape, lk);
  t.scale.setScalar(0.55);
  g.add(t);
  return g;
}
