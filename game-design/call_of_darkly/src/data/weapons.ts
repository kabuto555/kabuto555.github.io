// §4 Weapon table (starter values). Numbers not given in PLAN are placeholders (see helper defaults).
import { DamageType } from '../core/entity';
import type { GunDef, MeleeDef, ShieldDef, WeaponDef, ItemId } from './types';

type GunSpec = Pick<GunDef, 'id' | 'name' | 'description' | 'class' | 'ammo' | 'mag' | 'damage' | 'rpm' | 'fireMode' | 'source'> &
  Partial<Omit<GunDef, 'id' | 'name' | 'description' | 'class' | 'ammo' | 'mag' | 'damage' | 'rpm' | 'fireMode' | 'source' | 'kind' | 'hand'>>;

// placeholder: every field not listed in PLAN §4 (weight, reload, ADS, spread, recoil, range, falloff, poise, etc.)
function gun(d: GunSpec): GunDef {
  return {
    kind: 'weapon',
    hand: 'R',
    maxStack: 1,
    weight: 3, // placeholder
    pellets: 1,
    headshotMult: 2,
    reloadTime: 2.5, // placeholder
    adsTime: 0.25, // placeholder
    spreadHip: 3, // placeholder
    spreadAds: 1, // placeholder
    recoil: { up: 1, side: 0.3 }, // placeholder
    range: 40, // placeholder
    falloffMin: 0.5, // placeholder
    damageType: DamageType.Physical,
    poiseDamage: 10, // placeholder
    ...d,
  };
}

// placeholder: weight, stamina cost, arc and reach are not in PLAN §4 except where noted.
function melee(d: Pick<MeleeDef, 'id' | 'name' | 'description' | 'damage' | 'speed' | 'source'> & Partial<MeleeDef>): MeleeDef {
  return {
    kind: 'weapon',
    hand: 'L',
    class: 'melee',
    maxStack: 1,
    weight: 2, // placeholder
    staminaCost: 15, // placeholder
    poiseDamage: 20, // placeholder
    arc: 90, // placeholder
    reach: 1.5, // placeholder
    damageType: DamageType.Physical,
    ...d,
  };
}

// placeholder: weight and stability are not in PLAN §4.
function shield(d: Pick<ShieldDef, 'id' | 'name' | 'description' | 'blockPhys' | 'canParry' | 'source'> & Partial<ShieldDef>): ShieldDef {
  return {
    kind: 'weapon',
    hand: 'L',
    class: 'shield',
    maxStack: 1,
    weight: 6, // placeholder
    stability: 0.5, // placeholder
    ...d,
  };
}

export const WEAPONS: Record<ItemId, WeaponDef> = {
  m4_ar: gun({
    id: 'm4_ar', name: '"M4-ish" AR', description: 'Standard-issue rifle. Reliable, boring, and the reason you are still breathing. Starter.', class: 'ar', ammo: 'rifle',
    mag: 30, damage: 22, rpm: 750, fireMode: 'auto', source: 'start',
  }),
  m1911_pistol: gun({
    id: 'm1911_pistol', name: '"M1911-ish" Pistol', description: 'Starter sidearm. Semi-auto, one squeeze per shot. Every click counts, which is more than the Burg can say.', class: 'pistol', ammo: 'pistol',
    mag: 8, damage: 30, rpm: 400, fireMode: 'semi', source: 'start',
  }),
  combat_knife: melee({
    id: 'combat_knife', name: 'Combat Knife', description: 'Low stamina cost. Quiet work for quiet corners. The corpse beside it does not want to talk about it.', damage: 35, speed: 'fast',
    staminaCost: 8, weight: 1, source: 'start',
  }),
  pump_shotgun: gun({
    id: 'pump_shotgun', name: 'Pump Shotgun', description: 'Twelve pellets per shell, six shells, one unhappy pump. It rattles like it knows you are about to need it.', class: 'shotgun', ammo: 'shotgun',
    mag: 6, damage: 8, pellets: 12, rpm: 70, fireMode: 'pump', source: 'shop',
  }),
  smg_mp5: gun({
    id: 'smg_mp5', name: 'SMG ("MP5-ish")', description: 'Cheap, fast, and sprayed with optimism. Burns its magazine like a bad decision made in a hurry.', class: 'smg', ammo: 'smg',
    mag: 30, damage: 16, rpm: 900, fireMode: 'auto', source: 'shop',
  }),
  riot_shield: shield({
    id: 'riot_shield', name: 'Riot Shield', description: 'Hold V: blocks 100% of physical damage, drains stamina per hit. Built for riots. You are not rioting. You are holding it anyway.',
    blockPhys: 1.0, canParry: false, weight: 9, stability: 0.6, source: 'shop', // balance: 0.4 stamina per blocked point
  }),
  marksman_rifle: gun({
    id: 'marksman_rifle', name: 'Marksman Rifle', description: 'Headshot x2.5. Slow, patient, expensive. Aims at the spot where the Hollows keep whatever they have left of hope.', class: 'marksman', ammo: 'sniper',
    mag: 10, damage: 70, rpm: 60, fireMode: 'semi', headshotMult: 2.5, source: 'shop', // rpm placeholder (semi)
  }),
  lmg: gun({
    id: 'lmg', name: 'LMG', description: 'Slow ADS, slow reload. A hundred rounds and a bad attitude toward the reload animation.', class: 'lmg', ammo: 'rifle',
    mag: 100, damage: 24, rpm: 650, fireMode: 'auto', reloadTime: 6, adsTime: 0.6, source: 'shop', // reload/ADS placeholder
  }),
  machete_fire_axe: melee({
    id: 'machete_fire_axe', name: 'Machete / Fire Axe', description: 'High stamina, staggers. Heavy enough to make the enemy reconsider its posture.', damage: 60, speed: 'slow',
    staminaCost: 25, poiseDamage: 40, weight: 5, source: 'shop',
  }),
  rpg: gun({
    id: 'rpg', name: 'RPG', description: 'The Taurus answer. Pricey. The splash is not selective, and the fine print says so.', class: 'launcher', ammo: 'launcher',
    mag: 1, damage: 400, rpm: 60, fireMode: 'semi', splashRadius: 5, weight: 6, source: 'shop', // rpm/splashRadius placeholder
  }),
  revolver_357: gun({
    id: 'revolver_357', name: '.357 Revolver', description: 'Slow reload, big headshots. Six rounds, each one a small argument you win.', class: 'revolver', ammo: 'pistol',
    mag: 6, damage: 55, rpm: 180, fireMode: 'semi', reloadTime: 4, source: 'found', // reload placeholder
  }),
  double_barrel: gun({
    id: 'double_barrel', name: 'Double-Barrel', description: 'Both barrels in one click. Found beside a corpse that clearly tried both at once.', class: 'shotgun', ammo: 'shotgun',
    mag: 2, damage: 10, pellets: 14, rpm: 60, fireMode: 'double', source: 'found', // rpm placeholder (burst)
  }),
  tactical_tomahawk: melee({
    id: 'tactical_tomahawk', name: 'Tactical Tomahawk', description: 'Balanced stamina and damage. A hatchet issued for camping and never once used for it.', damage: 45, speed: 'medium',
    weight: 3, source: 'found',
  }),
  ballistic_shield: shield({
    id: 'ballistic_shield', name: 'Ballistic Shield (small)',
    description: 'Lighter than the riot shield, 80% block. Parry (tap V at the right moment) to set up a crit. The strap is taped on.',
    blockPhys: 0.8, canParry: true, weight: 4, stability: 0.45, source: 'found',
  }),
  black_knights_halberd: melee({
    id: 'black_knights_halberd', name: "Black Knight's Halberd", description: 'Heavy. Wide sweep. Carried by a knight who had time to think about his choices, and then stopped thinking.', damage: 90, speed: 'slow',
    arc: 140, reach: 2.2, staminaCost: 30, poiseDamage: 50, weight: 12, source: 'drop', // arc/reach/stamina placeholder
  }),
};
