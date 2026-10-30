// §10 Enemy roster. HP, behavior and souls come from PLAN; movement/aggro/poise/attack timings are placeholders.
import { DamageType } from '../core/entity';
import type { EnemyAttackDef, EnemyDef, EnemyId } from './types';

// placeholder: timings, damage and poise for every attack (PLAN describes behavior only).
function melee(id: string, damage: number, o: Partial<EnemyAttackDef> = {}): EnemyAttackDef {
  return {
    id, windup: 0.6, active: 0.2, recover: 0.8, damage, damageType: DamageType.Physical,
    poiseDamage: 20, range: 2, arc: 90, weight: 1, ...o,
  };
}

// placeholder: projectile speed/gravity; timings and damage.
function projectile(id: string, damage: number, speed: number, gravity: number, o: Partial<EnemyAttackDef> = {}): EnemyAttackDef {
  return {
    id, windup: 1.0, active: 0.1, recover: 1.0, damage, damageType: DamageType.Physical,
    poiseDamage: 0, range: 25, projectile: { speed, gravity }, weight: 1, ...o,
  };
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  hollow_sword: {
    id: 'hollow_sword', name: 'Hollow (sword)', archetype: 'hollowSword',
    hp: 80, poise: 10, souls: 20, dropTable: 'drops_hollow_sword',
    moveSpeed: 3, aggroRadius: 15, hearingRadius: 20, respawns: true,
    attacks: [melee('combo_1', 20), melee('combo_2', 20, { windup: 0.4 })], // 2-hit combo
  },
  hollow_firebomb: {
    id: 'hollow_firebomb', name: 'Hollow (firebomb)', archetype: 'hollowFirebomb',
    hp: 60, poise: 5, souls: 25, dropTable: 'drops_hollow_firebomb',
    moveSpeed: 3, aggroRadius: 18, hearingRadius: 20, respawns: true,
    attacks: [
      projectile('molotov_lob', 25, 14, 9.8, { damageType: DamageType.Fire, range: 20, projectile: { speed: 14, gravity: 9.8, splashRadius: 3 } }),
      melee('bottle_swipe', 15, { windup: 0.5, recover: 0.9, range: 1.9, arc: 100, poiseDamage: 10 }), // cornered fallback
    ],
  },
  hollow_crossbow: {
    id: 'hollow_crossbow', name: 'Hollow (crossbow)', archetype: 'hollowCrossbow',
    hp: 60, poise: 5, souls: 25, dropTable: 'drops_hollow_crossbow',
    moveSpeed: 0, aggroRadius: 25, hearingRadius: 20, respawns: true, // stationary
    attacks: [projectile('slow_bolt', 35, 18, 0.8, { windup: 0.8, recover: 1.2, range: 30 })], // slow, dodgeable bolt
  },
  hollow_soldier: {
    id: 'hollow_soldier', name: 'Hollow Soldier (shield)', archetype: 'hollowSoldier',
    hp: 140, poise: 40, souls: 40, dropTable: 'drops_hollow_soldier',
    moveSpeed: 2.5, aggroRadius: 15, hearingRadius: 20, respawns: true,
    frontalBlock: 0.8, // placeholder
    attacks: [
      melee('shield_bash', 15, { poiseDamage: 30 }),
      melee('thrust', 28, { arc: 30, range: 2.5 }), // balance: ~15% of 183 HP
    ],
  },
  barrel_hollow: {
    id: 'barrel_hollow', name: 'Barrel Hollow', archetype: 'barrelHollow',
    hp: 50, // placeholder: PLAN gives "—"; a weak sword hollow once the barrel is gone
    poise: 5, souls: 20, dropTable: null,
    moveSpeed: 2.6, aggroRadius: 12, hearingRadius: 10, respawns: true,
    // barrel roll is scripted (ai/barrel.ts); these are the weak sword-hollow follow-up fight
    attacks: [melee('combo_1', 12, { windup: 0.7 }), melee('combo_2', 12, { windup: 0.5 })],
  },
  black_knight: {
    id: 'black_knight', name: 'Black Knight (mini)', archetype: 'blackKnight',
    hp: 900, poise: 200, souls: 400, dropTable: 'drops_black_knight',
    moveSpeed: 3.5, aggroRadius: 20, hearingRadius: 25, isBoss: true, respawns: false,
    attacks: [
      // balance: heavies are 30-35% of the 183 starting max HP (raw, before armor).
      // all windups >= 0.5 s (dodge window). sweep_2 is the combo follow-up; thrust is the gap closer
      // (also the reload punish) with a long trigger range; ai/blackKnight.ts overrides its hit reach.
      melee('overhead', 62, { windup: 0.9, active: 0.25, recover: 1.1, poiseDamage: 60, range: 3.2, arc: 80 }),
      melee('sweep_1', 55, { windup: 0.75, active: 0.25, recover: 0.7, poiseDamage: 50, range: 3.4, arc: 160 }),
      melee('sweep_2', 60, { windup: 0.55, active: 0.25, recover: 1.3, poiseDamage: 60, range: 3.4, arc: 160 }),
      melee('thrust', 64, { windup: 0.7, active: 0.4, recover: 1.3, poiseDamage: 70, range: 10, arc: 60 }),
    ],
  },
  // §7 mimic (Burg B7): dormant chest that chomps on E, then stands up and fights. HP/damage placeholders.
  mimic: {
    id: 'mimic', name: 'Mimic', archetype: 'mimic',
    hp: 400, poise: 250, souls: 300, dropTable: 'drops_mimic', // placeholder hp (PLAN gives behaviour only); high poise: hard to stagger
    moveSpeed: 3.2, aggroRadius: 16, hearingRadius: 14, respawns: false, // never respawns on rest (the mimic system resets it to dormant)
    attacks: [
      melee('lunge_bite', 45, { windup: 0.75, active: 0.3, recover: 1.0, range: 3.4, arc: 70, poiseDamage: 50, weight: 2 }), // telegraphed forward lunge
      melee('sweep', 35, { windup: 0.9, active: 0.3, recover: 1.1, range: 2.8, arc: 160, poiseDamage: 50, weight: 2 }), // long-arm swat
      melee('hop_back', 0, { windup: 0.35, active: 0.4, recover: 0.4, range: 1.8, arc: 0, poiseDamage: 0, weight: 2 }), // disengage hop (no damage), chains into lunge_bite
    ],
  },
  taurus_demon: {
    id: 'taurus_demon', name: 'Taurus Demon', archetype: 'taurusDemon',
    hp: 3500, poise: 500, souls: 3000, dropTable: null, // drop = Demo End (not an item)
    moveSpeed: 4, aggroRadius: 30, hearingRadius: 30, isBoss: true, respawns: false,
    // balance: each hit is 36-45% of the 183 starting max HP (raw): 3 hits kill, 2 hurt.
    attacks: [
      melee('overhead_smash', 78, { windup: 1.2, range: 4, poiseDamage: 80 }),
      melee('sweep', 66, { windup: 0.9, range: 5, arc: 180, poiseDamage: 60 }),
      melee('jump_slam', 82, { windup: 1.5, range: 8, poiseDamage: 100 }),
      melee('charge', 72, { windup: 1.0, range: 10, arc: 45, poiseDamage: 80 }),
    ],
  },
};
