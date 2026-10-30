import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/events';
import { BINDINGS } from '../core/input';
import { newSave, SaveStore } from '../core/save';
import { ITEMS_BY_ID, SHOPS, STATS, levelCost } from '../data';
import type { ShopDef } from '../data/types';
import { Inventory } from '../inventory/store';
import { Wallet } from '../economy/wallet';
import { StatsResolver } from '../inventory/modifiers';
import {
  HintFade,
  ShopStock,
  ammoAllFull,
  ammoStates,
  applyOps,
  barWidthPx,
  bindingLabel,
  buyCheck,
  canLevelStat,
  codeLabel,
  damageArcDeg,
  derivedFor,
  diffItems,
  filledTicks,
  fmtClock,
  levelUpInfo,
  loadFor,
  nextHintMode,
  planEquip,
  playerLevel,
  previewEquip,
  purchase,
  statPreview,
  tickLayout,
} from './logic';
import { emptyLoadout } from '../inventory/equipment';
import { bannerKindForText } from './banners';
import { CONTROL_GROUPS } from './controlsCard';
import { uiScale } from './createUi';

describe('keycap lookup', () => {
  it('reads labels from BINDINGS', () => {
    expect(bindingLabel('interact')).toBe('E');
    expect(bindingLabel('estus')).toBe('Q');
    expect(bindingLabel('leftHand')).toBe('V');
    expect(bindingLabel('swapLeft')).toBe('2');
  });
  it('orders keyboard before wheel and collapses duplicates', () => {
    expect(bindingLabel('swapRight')).toBe('1/Wheel');
    expect(bindingLabel('sprint')).toBe('Shift');
    expect(bindingLabel('dodge')).toBe('Ctrl/C');
    expect(bindingLabel('menu')).toBe('Tab/Esc');
    expect(bindingLabel('ads')).toBe('RMB');
  });
  it('follows rebinding', () => {
    const b = { ...BINDINGS, interact: ['KeyF'], estus: ['Mouse1', 'Digit5'] };
    expect(bindingLabel('interact', b)).toBe('F');
    expect(bindingLabel('estus', b)).toBe('5/MMB');
    expect(bindingLabel('estus', b, 1)).toBe('5');
  });
  it('codeLabel handles common codes', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Digit1')).toBe('1');
    expect(codeLabel('Space')).toBe('Space');
    expect(codeLabel('F1')).toBe('F1');
    expect(codeLabel('Numpad3')).toBe('Num3');
  });
});

describe('hint fade timer', () => {
  it('shows for 8s after a poke in fade mode', () => {
    const h = new HintFade();
    h.poke(0);
    expect(h.visible(7.9)).toBe(true);
    expect(h.visible(8.1)).toBe(false);
  });
  it('a later poke extends but never shortens', () => {
    const h = new HintFade();
    h.poke(0);
    h.poke(5);
    expect(h.visible(12)).toBe(true);
    expect(h.visible(13.1)).toBe(false);
    h.poke(1);
    expect(h.visible(12)).toBe(true);
  });
  it('always / off ignore the timer', () => {
    const h = new HintFade();
    h.mode = 'always';
    expect(h.visible(999)).toBe(true);
    h.mode = 'off';
    h.poke(0);
    expect(h.visible(1)).toBe(false);
  });
  it('cycles modes', () => {
    expect(nextHintMode('always')).toBe('fade');
    expect(nextHintMode('fade')).toBe('off');
    expect(nextHintMode('off')).toBe('always');
  });
});

describe('stat diff', () => {
  const d = (id: string) => ITEMS_BY_ID.get(id)!;
  it('marks lower reload/weight as better (green) and higher as worse where relevant', () => {
    const rows = diffItems(d('m4_ar'), d('smg_mp5'));
    const reload = rows.find((r) => r.label === 'Reload')!;
    expect(reload.delta).toBeCloseTo((d('smg_mp5') as { reloadTime: number }).reloadTime - (d('m4_ar') as { reloadTime: number }).reloadTime);
    for (const r of rows) {
      const lower = r.label === 'Reload' || r.label === 'Weight';
      const sign = r.delta === 0 ? 0 : r.delta > 0 ? 1 : -1;
      expect(r.better).toBe(sign === 0 ? 0 : lower ? -sign : sign);
    }
  });
  it('equipping into an empty slot is all-improvement except weight', () => {
    const rows = diffItems(null, d('m4_ar'));
    expect(rows.find((r) => r.label === 'Damage')!.better).toBe(1);
    expect(rows.find((r) => r.label === 'Weight')!.better).toBe(-1);
  });
  it('unequip shows a loss', () => {
    const rows = diffItems(d('bdu_shirt'), null);
    expect(rows.find((r) => r.label === 'Phys Abs')!.better).toBe(-1);
    expect(rows.find((r) => r.label === 'Weight')!.better).toBe(1);
  });
  it('accessories diff by modifier, sprint cost reduction is good', () => {
    const rows = diffItems(null, d('marathon_patch'));
    const r = rows.find((x) => x.label === 'Sprint cost')!;
    expect(r.next).toBeCloseTo(-40);
    expect(r.better).toBe(1);
  });
  it('identical items produce zero deltas', () => {
    for (const r of diffItems(d('m4_ar'), d('m4_ar'))) expect(r.better).toBe(0);
  });
});

describe('equip planning + load preview', () => {
  const lo = () => ({ ...emptyLoadout(), right1: 'm4_ar', right2: 'm1911_pistol' });
  it('plain equip when not worn elsewhere', () => {
    expect(planEquip(lo(), 'left1', 'combat_knife', 1)).toEqual([['left1', 'combat_knife']]);
  });
  it('swaps when the only copy is worn in the other slot', () => {
    const ops = planEquip(lo(), 'right1', 'm1911_pistol', 1);
    expect(applyOps(lo(), ops).right1).toBe('m1911_pistol');
    expect(applyOps(lo(), ops).right2).toBe('m4_ar');
  });
  it('unequip is a single op', () => {
    expect(planEquip(lo(), 'right1', null, 1)).toEqual([['right1', null]]);
  });
  it('adding armor raises load and can change tier', () => {
    const base = emptyLoadout();
    const light = loadFor(base, STATS.start.endurance);
    expect(light.weight).toBe(0);
    expect(light.tier).toBe('fast');
    const p = previewEquip(base, 'right1', 'lmg', 1, STATS.start.endurance);
    expect(p.after.weight).toBeGreaterThan(p.before.weight);
    expect(p.after.ratio).toBeGreaterThan(p.before.ratio);
  });
  it('Tac Vest Frame style max-load accessories raise max load in preview', () => {
    const a = loadFor({ ...emptyLoadout(), accessory1: 'tac_vest_frame' }, 10);
    const b = loadFor(emptyLoadout(), 10);
    expect(a.max).toBeGreaterThan(b.max);
  });
});

describe('level up affordability', () => {
  it('level = start level + points gained', () => {
    expect(playerLevel(STATS.start)).toBe(STATS.startLevel);
    expect(playerLevel({ ...STATS.start, vitality: STATS.start.vitality + 3 })).toBe(STATS.startLevel + 3);
  });
  it('cost is levelCost(target)', () => {
    const info = levelUpInfo(STATS.start, 0);
    expect(info.target).toBe(STATS.startLevel + 1);
    expect(info.cost).toBe(levelCost(info.target));
  });
  it('affordable exactly at cost, short otherwise', () => {
    const c = levelUpInfo(STATS.start, 0).cost;
    expect(levelUpInfo(STATS.start, c).affordable).toBe(true);
    const poor = levelUpInfo(STATS.start, c - 1);
    expect(poor.affordable).toBe(false);
    expect(poor.short).toBe(1);
  });
  it('cannot exceed the stat cap', () => {
    expect(canLevelStat({ ...STATS.start, vitality: 99 }, 'vitality', 1e9)).toBe(false);
    expect(canLevelStat(STATS.start, 'vitality', 1e9)).toBe(true);
  });
  it('preview shows growth from the curves', () => {
    const rows = statPreview(STATS.start, 'vitality');
    expect(rows[0]!.next).toBeGreaterThan(rows[0]!.cur);
    expect(derivedFor(STATS.start).maxHp).toBeGreaterThan(0);
    expect(statPreview(STATS.start, 'endurance').length).toBe(3);
  });
});

describe('shop buy logic', () => {
  const shop: ShopDef = {
    id: 't',
    merchant: 'T',
    entries: [
      { itemId: 'pump_shotgun', price: 100, stock: null },
      { itemId: 'residence_key', price: 50, stock: 1 },
      { itemId: 'frag_grenade', price: 10, stock: null, bundle: 3 },
    ],
  };
  const setup = (souls: number) => {
    const bus = new EventBus();
    const inv = new Inventory(bus);
    const wallet = new Wallet(bus, new StatsResolver());
    wallet.add(souls);
    return { inv, wallet, stock: new ShopStock([shop]) };
  };
  it('buyCheck precedence', () => {
    const e = shop.entries[1]!;
    expect(buyCheck(e, 999, 0, 1, 0)).toMatchObject({ ok: false, reason: 'soldOut' });
    expect(buyCheck(e, 999, 1, 1, 1)).toMatchObject({ ok: false, reason: 'maxed' });
    expect(buyCheck(e, 10, 0, 1, 1)).toMatchObject({ ok: false, reason: 'poor' });
    expect(buyCheck(e, 50, 0, 1, 1)).toMatchObject({ ok: true, qty: 1 });
  });
  it('spends souls, adds items, uses bundle size', () => {
    const { inv, wallet, stock } = setup(100);
    const r = purchase(shop, shop.entries[2]!, wallet, inv, stock);
    expect(r).toEqual({ ok: true, qty: 3 });
    expect(inv.count('frag_grenade')).toBe(3);
    expect(wallet.souls).toBe(90);
  });
  it('limited stock sells out; failed buys change nothing', () => {
    const { inv, wallet, stock } = setup(500);
    expect(purchase(shop, shop.entries[1]!, wallet, inv, stock).ok).toBe(true);
    expect(stock.remaining('t', 'residence_key')).toBe(0);
    const before = wallet.souls;
    expect(purchase(shop, shop.entries[1]!, wallet, inv, stock)).toMatchObject({ ok: false });
    expect(wallet.souls).toBe(before);
    expect(inv.count('residence_key')).toBe(1);
  });
  it('refuses when poor without side effects', () => {
    const { inv, wallet, stock } = setup(99);
    expect(purchase(shop, shop.entries[0]!, wallet, inv, stock)).toEqual({ ok: false, reason: 'poor' });
    expect(wallet.souls).toBe(99);
    expect(inv.count('pump_shotgun')).toBe(0);
  });
  it('unique gear cannot be bought twice (maxed)', () => {
    const { inv, wallet, stock } = setup(1000);
    expect(purchase(shop, shop.entries[0]!, wallet, inv, stock).ok).toBe(true);
    expect(purchase(shop, shop.entries[0]!, wallet, inv, stock)).toEqual({ ok: false, reason: 'maxed' });
  });
  it('stock serializes', () => {
    const s = new ShopStock([shop]);
    s.take('t', 'residence_key');
    const s2 = new ShopStock([shop]);
    s2.load(s.serialize());
    expect(s2.remaining('t', 'residence_key')).toBe(0);
    expect(s2.remaining('t', 'pump_shotgun')).toBeNull();
  });
  it('stock persists through SaveData (finite entries only; old saves default to {})', () => {
    const real = new ShopStock(Object.values(SHOPS));
    expect(real.remaining('burg_merchant', 'residence_key')).toBe(1);
    real.take('burg_merchant', 'residence_key');
    const sd = newSave();
    expect(sd.shopStock).toEqual({});
    sd.shopStock = real.serialize();
    const kv = new Map<string, string>();
    const store = new SaveStore({ getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v), removeItem: (k) => void kv.delete(k) });
    store.save(sd);
    const back = store.load()!;
    const again = new ShopStock(Object.values(SHOPS));
    again.load(back.shopStock);
    expect(again.remaining('burg_merchant', 'residence_key')).toBe(0);
    expect(again.remaining('burg_merchant', 'rpg')).toBe(1);
    const legacy = JSON.parse(kv.get('cmw.save')!);
    delete legacy.shopStock;
    kv.set('cmw.save', JSON.stringify(legacy));
    expect(store.load()!.shopStock).toEqual({});
  });
  it('every real shop entry resolves to an item', () => {
    for (const s of Object.values(SHOPS)) for (const e of s.entries) expect(ITEMS_BY_ID.has(e.itemId)).toBe(true);
  });
  it('ammo-full warning only when all usable types are at cap', () => {
    const lv = [{ type: 'rifle', reserve: 240, cap: 240 }, { type: 'pistol', reserve: 10, cap: 90 }];
    expect(ammoAllFull(lv, new Set(['rifle']))).toBe(true);
    expect(ammoAllFull(lv, new Set(['rifle', 'pistol']))).toBe(false);
    expect(ammoAllFull(lv, new Set())).toBe(false);
  });
});

describe('ammo + bar helpers', () => {
  it('mag red at <=25%, reserve gold at cap / red under a spare mag', () => {
    expect(ammoStates(30, 30, 100, 240)).toMatchObject({ mag: 'ok', reserve: 'ok', reloadPrompt: false });
    expect(ammoStates(7, 30, 100, 240).mag).toBe('low');
    expect(ammoStates(8, 30, 100, 240).mag).toBe('ok');
    expect(ammoStates(10, 30, 240, 240).reserve).toBe('gold');
    expect(ammoStates(10, 30, 29, 240).reserve).toBe('low');
    expect(ammoStates(0, 30, 0, 240)).toMatchObject({ noAmmo: true, reloadPrompt: false });
    expect(ammoStates(0, 30, 5, 240).reloadPrompt).toBe(true);
  });
  it('tick bar: one tick per round, segmented for big mags', () => {
    expect(tickLayout(30)).toEqual({ ticks: 30, per: 1 });
    const t = tickLayout(100);
    expect(t.per).toBe(4);
    expect(t.ticks).toBe(25);
    expect(filledTicks(100, t.per)).toBe(25);
    expect(filledTicks(1, t.per)).toBe(1);
    expect(filledTicks(0, t.per)).toBe(0);
  });
  it('bars grow with max value, with a floor and cap', () => {
    expect(barWidthPx(100)).toBe(140);
    expect(barWidthPx(400)).toBeGreaterThan(barWidthPx(200));
    expect(barWidthPx(1e6)).toBe(420);
    expect(barWidthPx(50)).toBe(140);
  });
  it('buff clock', () => {
    expect(fmtClock(42)).toBe('0:42');
    expect(fmtClock(60)).toBe('1:00');
    expect(fmtClock(0.2)).toBe('0:01');
  });
  it('damage arc: attacker in front = 0, behind = 180, right = 90', () => {
    // yaw 0: forward is -z. A bullet travelling +z comes from in front.
    expect(damageArcDeg(0, 0, 1)).toBeCloseTo(0);
    expect(Math.abs(damageArcDeg(0, 0, -1))).toBeCloseTo(180);
    // attacker on the +x (right) side shoots toward -x.
    expect(damageArcDeg(0, -1, 0)).toBeCloseTo(90);
  });
});

describe('misc ui helpers', () => {
  it('integer ui scale steps with height and never drops below 1', () => {
    expect(uiScale(800, 450)).toBe(1);
    expect(uiScale(1280, 720)).toBe(1);
    expect(uiScale(1920, 1080)).toBe(2);
    expect(uiScale(2560, 1440)).toBe(3);
    expect(uiScale(300, 200)).toBe(0.75); // fractional floor on tiny viewports
    expect(uiScale(595, 335)).toBeCloseTo(595 / 720, 5);
    expect(uiScale(1920, 1080) % 1).toBe(0);
  });
  it('banner text maps to presets', () => {
    expect(bannerKindForText('Bonfire Lit')).toBe('bonfireLit');
    expect(bannerKindForText('VICTORY ACHIEVED')).toBe('victory');
    expect(bannerKindForText('demo complete')).toBe('demoComplete');
    expect(bannerKindForText('Something else')).toBe('text');
  });
  it('controls card lists only bound actions, each with a non-empty keycap', () => {
    for (const g of CONTROL_GROUPS) for (const [, actions] of g.rows) for (const a of actions) expect(bindingLabel(a, BINDINGS, 3).length).toBeGreaterThan(0);
  });
});
