/**
 * M9 balance harness (PLAN §3 stamina/estus, §4 weapons/ammo/drops, §8 level curve, §9 leniency, §10 roster, §14.7).
 * Pure data: builds the Firelink + Burg level ops and walks the route in order, summing souls and expected ammo.
 * Every number it computes is printed (run `npx vitest run src/balance.test.ts` to read the report).
 *
 * Conventions: incoming damage is RAW (before armor absorb) over the 183-HP fresh-save max HP, which is conservative:
 * the starting Operator Fatigues absorb ~20% on top. Gun damage mult is 1.0 at the starting Firearms level.
 */
import { describe, expect, it } from 'vitest';
import { AMMO, CONSUMABLES, DROP_TABLES_BY_ID, ENEMIES, ITEMS_BY_ID, SHOPS, STATS, WEAPONS, levelCost } from './data';
import type { AmmoType, DropEntry, EnemyId } from './data/types';
import { COMBAT_TUNING } from './combat/tuning';
import { PLAYER_TUNING } from './player/tuning';
import { evalCurve } from './player/curve';
import { PISTOL_FLOOR } from './economy/deathloop';
import { createLevelDsl } from './world/dsl';
import type { LevelOp } from './world/types';
import { FIRELINK } from './world/areas/firelink';
import { BURG } from './world/areas/burg';
import { PLUNGE } from './ai/boss/plunge';
import { MIMIC_CHOMP_FRACTION } from './ai/mimic';
import { HAZARD_TUNING } from './ai/hazards';

const log = (...a: unknown[]): void => console.log('[balance]', ...a);

const MAX_HP = Math.round(evalCurve(STATS.maxHp, STATS.start.vitality)); // fresh save
const MAX_STAM = evalCurve(STATS.maxStamina, STATS.start.endurance);
const AR = WEAPONS.m4_ar as typeof WEAPONS.m4_ar & { damage: number; mag: number; headshotMult: number };
const PISTOL = WEAPONS.m1911_pistol as typeof AR;
const MISS_FACTOR = 1.6;

const pct = (n: number): string => `${((n / MAX_HP) * 100).toFixed(1)}%`;

function route(): LevelOp[] {
  const out: LevelOp[] = [];
  for (const a of [FIRELINK, BURG]) {
    const d = createLevelDsl();
    a.build(d);
    out.push(...d.ops);
  }
  return out;
}
const OPS = route();
const spawns = OPS.filter((o): o is Extract<LevelOp, { op: 'spawn' }> => o.op === 'spawn');

/** Souls an `item`/`chest` op yields when the player uses its dogtags. */
function tagSouls(o: LevelOp): number {
  const loot = o.op === 'item' ? o.loot : o.op === 'chest' ? o.contents : [];
  let s = 0;
  for (const l of loot) {
    const c = CONSUMABLES[l.id];
    if (c?.effect.type === 'souls') s += c.effect.amount * l.count;
  }
  return s;
}

/** Cumulative levels affordable from `souls` starting at the fresh-save level. */
function levelsFor(souls: number): { levels: number; spent: number } {
  let level = STATS.startLevel;
  let left = souls;
  for (;;) {
    const c = levelCost(level + 1);
    if (left < c) break;
    left -= c;
    level++;
  }
  return { levels: level - STATS.startLevel, spent: souls - left };
}

describe('start state (§9 leniency)', () => {
  it('AR 30+90, Pistol 8+32, pistol floor 24', () => {
    expect(AR.mag).toBe(30);
    expect(PISTOL.mag).toBe(8);
    expect(COMBAT_TUNING.startReserve.rifle).toBe(90);
    expect(COMBAT_TUNING.startReserve.pistol).toBe(32);
    expect(PISTOL_FLOOR).toBe(24);
    expect(PISTOL_FLOOR).toBeLessThan(COMBAT_TUNING.startReserve.pistol);
    // every ammo start value respects the §4 caps
    for (const [t, v] of Object.entries(COMBAT_TUNING.startReserve)) expect(v).toBeLessThanOrEqual(AMMO[t as AmmoType].cap);
  });
});

describe('time to kill', () => {
  const roster: EnemyId[] = ['hollow_sword', 'hollow_firebomb', 'hollow_crossbow', 'hollow_soldier', 'barrel_hollow', 'black_knight', 'mimic', 'taurus_demon'];
  it('prints AR / pistol shots to kill (body, head)', () => {
    for (const id of roster) {
      const e = ENEMIES[id];
      const ar = Math.ceil(e.hp / AR.damage);
      const pi = Math.ceil(e.hp / PISTOL.damage);
      const arHead = Math.ceil(e.hp / (AR.damage * AR.headshotMult));
      const piHead = Math.ceil(e.hp / (PISTOL.damage * PISTOL.headshotMult));
      log(`TTK ${id.padEnd(16)} hp ${String(e.hp).padStart(4)}  AR body ${String(ar).padStart(3)} head ${String(arHead).padStart(3)} | pistol body ${String(pi).padStart(3)} head ${String(piHead).padStart(3)}`);
    }
  });
  it('sword hollow dies to 4-6 AR body shots', () => {
    const n = Math.ceil(ENEMIES.hollow_sword.hp / AR.damage);
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
  });
  it('headshots are x2 on everything except the marksman rifle (x2.5), consistently', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!('headshotMult' in w)) continue;
      expect(w.headshotMult, w.id).toBe(w.id === 'marksman_rifle' ? 2.5 : 2);
    }
  });
  it('pistol is a real fallback: >= AR damage per round and kills a hollow in <= 3 body shots', () => {
    expect(PISTOL.damage).toBeGreaterThan(AR.damage);
    expect(Math.ceil(ENEMIES.hollow_sword.hp / PISTOL.damage)).toBeLessThanOrEqual(3);
  });
});

describe('incoming damage vs max HP', () => {
  const frac = (id: EnemyId, atk: string): number => {
    const a = ENEMIES[id].attacks.find((x) => x.id === atk);
    if (!a) throw new Error(`${id}.${atk}`);
    return a.damage / MAX_HP;
  };
  it('fresh save max HP is ~183', () => {
    expect(MAX_HP).toBe(183);
  });
  it('prints every attack as % of max HP', () => {
    for (const id of ['hollow_sword', 'hollow_firebomb', 'hollow_crossbow', 'hollow_soldier', 'barrel_hollow', 'black_knight', 'mimic', 'taurus_demon'] as const) {
      log(`DMG ${id.padEnd(16)} ` + ENEMIES[id].attacks.map((a) => `${a.id} ${a.damage} (${pct(a.damage)})`).join(', '));
    }
    log(`DMG mimic chomp ${Math.round(MAX_HP * MIMIC_CHOMP_FRACTION)} (${(MIMIC_CHOMP_FRACTION * 100).toFixed(0)}%), barrel roll ${HAZARD_TUNING.barrelDamage} (${pct(HAZARD_TUNING.barrelDamage)})`);
  });
  it('sword hollow hit ~10-12%', () => {
    for (const a of ENEMIES.hollow_sword.attacks) {
      expect(a.damage / MAX_HP).toBeGreaterThanOrEqual(0.1);
      expect(a.damage / MAX_HP).toBeLessThanOrEqual(0.12);
    }
  });
  it('soldier hits ~15% (thrust) and never above 17%', () => {
    expect(frac('hollow_soldier', 'thrust')).toBeGreaterThanOrEqual(0.14);
    expect(frac('hollow_soldier', 'thrust')).toBeLessThanOrEqual(0.17);
    expect(frac('hollow_soldier', 'shield_bash')).toBeLessThanOrEqual(0.17);
  });
  it('Black Knight heavies are 30-35%', () => {
    for (const a of ENEMIES.black_knight.attacks) {
      expect(a.damage / MAX_HP, a.id).toBeGreaterThanOrEqual(0.3);
      expect(a.damage / MAX_HP, a.id).toBeLessThanOrEqual(0.35);
    }
  });
  it('Taurus hits are 35-45%', () => {
    for (const a of ENEMIES.taurus_demon.attacks) {
      expect(a.damage / MAX_HP, a.id).toBeGreaterThanOrEqual(0.35);
      expect(a.damage / MAX_HP, a.id).toBeLessThanOrEqual(0.45);
    }
  });
  it('mimic chomp stays 40%, barrel ~25%', () => {
    expect(MIMIC_CHOMP_FRACTION).toBe(0.4);
    expect(HAZARD_TUNING.barrelDamage / MAX_HP).toBeGreaterThanOrEqual(0.22);
    expect(HAZARD_TUNING.barrelDamage / MAX_HP).toBeLessThanOrEqual(0.27);
  });
  it('ranged hits (bolt, molotov) are lighter than melee heavies', () => {
    expect(frac('hollow_crossbow', 'slow_bolt')).toBeLessThanOrEqual(0.2);
    expect(frac('hollow_firebomb', 'molotov_lob')).toBeLessThanOrEqual(0.15);
  });
});

describe('estus (§3 Healing)', () => {
  it('one sip ~60-70% of starting max HP; 5 charges', () => {
    const f = STATS.estusHeal / MAX_HP;
    log(`ESTUS ${STATS.estusCharges} x ${STATS.estusHeal} = ${(f * 100).toFixed(1)}% of ${MAX_HP} per sip`);
    expect(STATS.estusCharges).toBe(5);
    expect(f).toBeGreaterThanOrEqual(0.6);
    expect(f).toBeLessThanOrEqual(0.7);
    // still a meaningful sip after ~4 Vitality levels
    expect(STATS.estusHeal / evalCurve(STATS.maxHp, STATS.start.vitality + 4)).toBeGreaterThanOrEqual(0.55);
  });
});

describe('stamina (§3)', () => {
  it('at least 4 dodge rolls from a full bar, sprint a few seconds, block is affordable', () => {
    const rolls = Math.floor(MAX_STAM / PLAYER_TUNING.dodgeCost);
    const sprintS = MAX_STAM / PLAYER_TUNING.sprintCostPerSec;
    const regen = evalCurve(STATS.staminaRegen, STATS.start.endurance);
    log(`STAMINA max ${MAX_STAM.toFixed(0)}, dodge ${PLAYER_TUNING.dodgeCost} -> ${rolls} rolls, sprint ${sprintS.toFixed(1)} s, regen ${regen.toFixed(1)}/s`);
    expect(rolls).toBeGreaterThanOrEqual(4);
    expect(sprintS).toBeGreaterThanOrEqual(5);
    expect(PLAYER_TUNING.dodgeCost / regen).toBeLessThan(1.5); // one roll refunded in about a second
    expect(PLAYER_TUNING.jumpCost).toBeLessThan(PLAYER_TUNING.dodgeCost);
  });
  it('riot shield soaks >= 3 Black Knight / Taurus heavies and ~10 hollow hits from a full bar', () => {
    const shield = WEAPONS.riot_shield as typeof WEAPONS.riot_shield & { blockPhys: number; stability: number };
    const cost = (dmg: number): number => dmg * shield.blockPhys * (1 - shield.stability);
    const maxBk = Math.max(...ENEMIES.black_knight.attacks.map((a) => a.damage));
    const maxTa = Math.max(...ENEMIES.taurus_demon.attacks.map((a) => a.damage));
    log(`BLOCK riot: hollow ${cost(20).toFixed(0)} st (${(MAX_STAM / cost(20)).toFixed(1)} hits), BK ${cost(maxBk).toFixed(0)} (${(MAX_STAM / cost(maxBk)).toFixed(1)}), Taurus ${cost(maxTa).toFixed(0)} (${(MAX_STAM / cost(maxTa)).toFixed(1)})`);
    expect(MAX_STAM / cost(maxBk)).toBeGreaterThanOrEqual(3);
    expect(MAX_STAM / cost(maxTa)).toBeGreaterThanOrEqual(2.5);
    expect(MAX_STAM / cost(20)).toBeGreaterThanOrEqual(9);
  });
});

describe('souls and levels (§8)', () => {
  const kills = spawns.reduce((s, o) => s + ENEMIES[o.enemy].souls, 0);
  const tags = OPS.reduce((s, o) => s + tagSouls(o), 0);
  const total = kills + tags;
  const counts: Record<string, number> = {};
  for (const o of spawns) counts[o.enemy] = (counts[o.enemy] ?? 0) + 1;
  // mimic is a `mimic` op, not a spawn
  const mimics = OPS.filter((o) => o.op === 'mimic').length;

  it('a clean Firelink -> Black Knight run affords ~6-10 levels', () => {
    const killsAll = kills + mimics * ENEMIES.mimic.souls;
    const totalAll = killsAll + tags;
    const all = levelsFor(totalAll);
    const shopShare = levelsFor(totalAll - 1000); // ~1000 souls spent on shop (key + a gun)
    log('SOULS spawns', JSON.stringify(counts), `+ ${mimics} mimic`);
    log(`SOULS kills ${killsAll} + dogtags ${tags} = ${totalAll} (Taurus's own 3000 excluded)`);
    log(`LEVELS all souls -> +${all.levels} (cost ${all.spent}); after 1000 shop spend -> +${shopShare.levels} (cost ${shopShare.spent}); next level costs ${levelCost(STATS.startLevel + all.levels + 1)}`);
    expect(all.levels).toBeGreaterThanOrEqual(6);
    expect(all.levels).toBeLessThanOrEqual(10);
    expect(shopShare.levels).toBeGreaterThanOrEqual(6);
    // kills alone (no dogtags) still give a feel of progress
    expect(levelsFor(killsAll).levels).toBeGreaterThanOrEqual(3);
  });
  it('level curve keeps the PLAN formula shape (monotonic, floor at low levels)', () => {
    let prev = 0;
    for (let l = 2; l <= 30; l++) {
      const c = levelCost(l);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
    expect(levelCost(STATS.startLevel + 1)).toBe(STATS.levelCostFloor);
    expect(levelCost(13)).toBe(Math.round(0.02 * 13 ** 3 + 3.06 * 13 ** 2 + 105.6 * 13 - 895));
  });
  it('total souls sanity', () => {
    expect(total).toBeGreaterThan(1500);
  });
});

describe('shops (§14.7)', () => {
  const price = (shop: keyof typeof SHOPS, id: string): number => SHOPS[shop].entries.find((e) => e.itemId === id)!.price;
  const spawnSouls = (list: readonly LevelOp[]): number =>
    list.reduce((s, o) => s + (o.op === 'spawn' ? ENEMIES[o.enemy].souls : 0) + tagSouls(o), 0);
  const idx = (id: string): number => OPS.findIndex((o) => (o.op === 'item' || o.op === 'chest') && o.id === id);
  const runSouls = spawnSouls(OPS) + ENEMIES.mimic.souls;

  it('every shop entry is priced and sellable', () => {
    for (const s of Object.values(SHOPS)) for (const e of s.entries) {
      expect(e.price, e.itemId).toBeGreaterThan(0);
      expect(ITEMS_BY_ID.has(e.itemId), e.itemId).toBe(true);
    }
  });
  it('Petrus: cheap kit on the way (hollows + F2), a gun once the aqueduct ledge dogtags are in', () => {
    const early = spawnSouls(OPS.slice(0, idx('B1')).filter((o) => !(o.op === 'item' && o.id === 'F7'))) ;
    const full = spawnSouls(OPS.slice(0, idx('B1')));
    log(`SHOP Petrus: souls ~${early} before the aqueduct ledge, ~${full} with it; shotgun ${price('petrus_firelink', 'pump_shotgun')}, SMG ${price('petrus_firelink', 'smg_mp5')}, riot ${price('petrus_firelink', 'riot_shield')}`);
    expect(early).toBeGreaterThanOrEqual(price('petrus_firelink', 'ghillie_hood') + price('petrus_firelink', 'ammo_crate_small') - 20);
    expect(full).toBeGreaterThanOrEqual(price('petrus_firelink', 'smg_mp5'));
    expect(full).toBeLessThan(price('petrus_firelink', 'smg_mp5') + price('petrus_firelink', 'riot_shield')); // one big buy, not two
  });
  it('Burg merchant: Residence Key + one more purchase fit in the souls on hand at the merchant ledge', () => {
    const atMerchant = spawnSouls(OPS.slice(0, idx('B5')));
    const key = price('burg_merchant', 'residence_key');
    const second = price('burg_merchant', 'machete_fire_axe');
    log(`SHOP Burg merchant: souls on the way in ${atMerchant}; key ${key}, marksman ${price('burg_merchant', 'marksman_rifle')}, LMG ${price('burg_merchant', 'lmg')}, machete ${second}, marathon ${price('burg_merchant', 'marathon_patch')}`);
    expect(atMerchant).toBeGreaterThanOrEqual(key + second);
    expect(price('burg_merchant', 'marksman_rifle')).toBeLessThanOrEqual(atMerchant);
    // the Residence Key unlocks the mimic's 300 souls + the Bounty Tag: it must be a bargain, not a toll
    expect(key).toBeLessThanOrEqual(ENEMIES.mimic.souls);
  });
  it('RPG is pricey cheese: ~55-80% of a run, never before the Burg merchant, and once only', () => {
    const rpg = SHOPS.burg_merchant.entries.find((e) => e.itemId === 'rpg')!;
    log(`SHOP RPG ${rpg.price} = ${((rpg.price / runSouls) * 100).toFixed(0)}% of a ${runSouls}-soul run`);
    expect(rpg.price / runSouls).toBeGreaterThanOrEqual(0.55);
    expect(rpg.price / runSouls).toBeLessThanOrEqual(0.8);
    expect(rpg.stock).toBe(1);
    expect(SHOPS.petrus_firelink.entries.some((e) => e.itemId === 'rpg')).toBe(false);
  });
  it('EOD set is the expensive armor: more than the whole Ghillie set', () => {
    const eod = ['eod_helmet', 'eod_jacket', 'eod_gauntlets', 'eod_trousers'].reduce((s, id) => s + price('burg_merchant', id), 0);
    const gh = ['ghillie_hood', 'ghillie_wrap', 'ghillie_leggings'].reduce((s, id) => s + price('petrus_firelink', id), 0);
    expect(eod).toBeGreaterThan(gh * 3);
  });
  it('ammo crates are a real but not free refill (cost per rifle round >= 1.5 souls)', () => {
    const small = price('burg_merchant', 'ammo_crate_small');
    const fr = (CONSUMABLES.ammo_crate_small.effect as { fraction: number }).fraction;
    expect(small / (AMMO.rifle.cap * fr)).toBeGreaterThanOrEqual(1.5);
    log(`SHOP small crate ${small} souls -> ${Math.ceil(AMMO.rifle.cap * fr)} rifle rounds`);
  });
});

describe('ammo economy (Burg route, expected value)', () => {
  /** Expected rounds per owned type from one kill of a table, with `owned` ammo types (AR + pistol). */
  function dropEv(tableId: string | null, owned: number): Record<'rifle' | 'pistol', number> {
    const out = { rifle: 0, pistol: 0 };
    const t = tableId ? DROP_TABLES_BY_ID.get(tableId) : undefined;
    if (!t) return out;
    for (const e of t.entries as DropEntry[]) {
      if (e.kind !== 'ammo') continue;
      const wantAvg = (Math.min(owned, e.types[0]) + Math.min(owned, e.types[1])) / 2; // good approximation for the data's [1,1]/[1,2]
      const avgAmt = (e.amount[0] + e.amount[1]) / 2;
      const per = e.chance * (wantAvg / owned) * avgAmt;
      out.rifle += per;
      out.pistol += per;
    }
    return out;
  }
  /** AR rounds needed (before the miss factor) to kill `id` at the starting Firearms level. */
  function arRounds(id: EnemyId): number {
    const e = ENEMIES[id];
    // shield soldiers: half the shots are frontal (80% blocked); flanking/head shots land fully
    const eff = e.frontalBlock ? AR.damage * (0.5 + 0.5 * (1 - e.frontalBlock)) : AR.damage;
    return Math.ceil(e.hp / eff);
  }

  it('route surplus >= 1.2x with no shortfall, Taurus included', () => {
    let rifle = COMBAT_TUNING.startReserve.rifle + AR.mag;
    let pistol = COMBAT_TUNING.startReserve.pistol + PISTOL.mag;
    const cap = { rifle: AMMO.rifle.cap + AR.mag, pistol: AMMO.pistol.cap + PISTOL.mag };
    let supply = rifle + pistol * (PISTOL.damage / AR.damage); // in AR-round equivalents
    let demand = 0;
    let shortfall = 0;
    let minRifle = rifle;
    const add = (r: number, p: number): void => {
      const r2 = Math.min(cap.rifle, rifle + r);
      const p2 = Math.min(cap.pistol, pistol + p);
      supply += r2 - rifle + (p2 - pistol) * (PISTOL.damage / AR.damage);
      rifle = r2;
      pistol = p2;
    };
    const spend = (arNeed: number): void => {
      demand += arNeed;
      const fromRifle = Math.min(rifle, arNeed);
      rifle -= fromRifle;
      let left = arNeed - fromRifle;
      if (left > 0) {
        const p = Math.min(pistol, Math.ceil((left * AR.damage) / PISTOL.damage));
        pistol -= p;
        left -= (p * PISTOL.damage) / AR.damage;
      }
      if (left > 0.01) shortfall += left;
      minRifle = Math.min(minRifle, rifle);
    };

    for (const o of OPS) {
      if (o.op === 'spawn') {
        spend(arRounds(o.enemy) * MISS_FACTOR);
        const ev = dropEv(ENEMIES[o.enemy].dropTable, 2);
        add(ev.rifle, ev.pistol);
      } else if (o.op === 'mimic') {
        spend(arRounds('mimic') * MISS_FACTOR);
      } else if (o.op === 'cache') {
        add(o.contents.ammo?.rifle ?? 0, o.contents.ammo?.pistol ?? 0);
      } else if (o.op === 'item' || o.op === 'chest') {
        for (const l of o.op === 'item' ? o.loot : o.contents) {
          const c = CONSUMABLES[l.id];
          if (c?.effect.type === 'ammoRefill') add(Math.ceil(AMMO.rifle.cap * c.effect.fraction) * l.count, Math.ceil(AMMO.pistol.cap * c.effect.fraction) * l.count);
        }
      }
    }
    const preBoss = { rifle, pistol };
    // Taurus: plunge first (30% max HP), the rest by AR at 25% headshots
    const t = ENEMIES.taurus_demon;
    const perHit = AR.damage * (0.75 + 0.25 * AR.headshotMult);
    const hits = Math.ceil((t.hp * (1 - PLUNGE.damageFrac)) / perHit);
    const taurusNeed = hits * MISS_FACTOR;
    const preBossAr = preBoss.rifle + preBoss.pistol * (PISTOL.damage / AR.damage);
    spend(taurusNeed);
    const ratio = supply / demand;
    log(`AMMO start ${COMBAT_TUNING.startReserve.rifle}+${AR.mag} rifle / ${COMBAT_TUNING.startReserve.pistol}+${PISTOL.mag} pistol; supply ${supply.toFixed(0)} vs demand ${demand.toFixed(0)} AR-equivalent rounds => surplus ${ratio.toFixed(2)}x`);
    log(`AMMO at the fog wall: rifle ${preBoss.rifle.toFixed(0)}, pistol ${preBoss.pistol.toFixed(0)} (= ${preBossAr.toFixed(0)} AR-eq) vs Taurus need ${taurusNeed.toFixed(0)} (${hits} hits = ${(hits / AR.mag).toFixed(1)} mags + plunge); lowest rifle on route ${minRifle.toFixed(0)}`);
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(shortfall).toBeLessThan(0.5);
    expect(preBossAr).toBeGreaterThanOrEqual(taurusNeed); // arrive at the fog wall with the whole fight in the bag
  });

  it('Firelink hollows are reliable rifle farms (EV return >= 1.3x their cost) and the pistol floor covers the rest', () => {
    const ev = dropEv(ENEMIES.hollow_sword.dropTable, 2);
    const cost = arRounds('hollow_sword') * MISS_FACTOR;
    log(`AMMO farm: sword hollow drops ${ev.rifle.toFixed(1)} rifle + ${ev.pistol.toFixed(1)} pistol EV vs ${cost.toFixed(1)} rounds to kill`);
    expect(ev.rifle / cost).toBeGreaterThanOrEqual(1.3);
    expect(PISTOL_FLOOR).toBeGreaterThanOrEqual(3 * PISTOL.mag); // three full mags on every rest
  });

  it('Taurus: ~2-3 AR mags of hits + plunge, with a launcher cheese that does not trivialise it', () => {
    const t = ENEMIES.taurus_demon;
    const perHit = AR.damage * (0.75 + 0.25 * AR.headshotMult);
    const afterPlunge = t.hp * (1 - PLUNGE.damageFrac);
    const mags = afterPlunge / perHit / AR.mag;
    const rpg = WEAPONS.rpg as typeof AR;
    const rockets = COMBAT_TUNING.startReserve.launcher + rpg.mag;
    log(`TAURUS ${t.hp} HP: plunge ${Math.round(t.hp * PLUNGE.damageFrac)}, then ${mags.toFixed(2)} AR mags (25% headshots); RPG ${rockets} rockets = ${((rockets * rpg.damage) / t.hp * 100).toFixed(0)}% HP`);
    expect(mags).toBeGreaterThanOrEqual(2);
    expect(mags).toBeLessThanOrEqual(3.1);
    expect((rockets * rpg.damage) / t.hp).toBeLessThan(0.6);
    expect((rockets * rpg.damage) / t.hp).toBeGreaterThan(0.3);
    expect(AMMO.launcher.cap).toBeGreaterThanOrEqual(rockets - rpg.mag);
  });
});
