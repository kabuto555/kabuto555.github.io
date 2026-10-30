import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { GameLoop } from './loop';
import { SimTime, SIM_DT } from './time';
import { Input } from './input';
import { EventBus } from './events';
import { SaveStore, newSave, type KeyValueStorage } from './save';
import { StatsResolver } from '../inventory/modifiers';
import { createLevelDsl } from '../world/dsl';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(new Rng(43).next()).not.toEqual(xs[0]);
  });
  it('int is inclusive and in range', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('stats resolver', () => {
  it('stacks (base + add) * (1 + pct) * mul and unregisters', () => {
    const s = new StatsResolver();
    expect(s.get('reloadSpeed')).toBe(1);
    s.register('acc:sleight', [{ key: 'reloadSpeed', op: 'pct', value: 0.4 }]);
    s.register('buff:x', [{ key: 'reloadSpeed', op: 'pct', value: 0.1 }, { key: 'reloadSpeed', op: 'mul', value: 2 }]);
    expect(s.get('reloadSpeed')).toBeCloseTo(1 * 1.5 * 2);
    s.register('armor:a', [{ key: 'fireAbsorb', op: 'add', value: 0.1 }]);
    s.register('acc:fire', [{ key: 'fireAbsorb', op: 'add', value: 0.25 }]);
    expect(s.get('fireAbsorb')).toBeCloseTo(0.35);
    s.unregister('buff:x');
    expect(s.get('reloadSpeed')).toBeCloseTo(1.4);
    expect(s.has('martyrdom')).toBe(false);
  });
});

describe('rng fork', () => {
  it('repeated forks differ, fork(0) differs from parent, and is deterministic', () => {
    const a = new Rng(7);
    const f1 = a.fork(1).next();
    const f2 = a.fork(1).next();
    expect(f1).not.toEqual(f2);
    const p = new Rng(7);
    const c0 = p.fork(0);
    expect(c0.state).not.toBe(new Rng(7).state);
    expect(c0.next()).not.toEqual(new Rng(7).next());
    expect(new Rng(7).fork(3).next()).toEqual(new Rng(7).fork(3).next());
  });
});

describe('stats clamps', () => {
  it('floors multipliers at 0 and caps absorb', () => {
    const s = new StatsResolver();
    s.register('x', [{ key: 'reloadSpeed', op: 'pct', value: -3 }]);
    expect(s.get('reloadSpeed')).toBe(0);
    s.register('y', [{ key: 'physAbsorb', op: 'add', value: 2 }, { key: 'fireAbsorb', op: 'add', value: 2 }]);
    expect(s.get('physAbsorb')).toBe(0.7);
    expect(s.get('fireAbsorb')).toBe(0.8);
    s.register('z', [{ key: 'explosiveAbsorb', op: 'add', value: -1 }]);
    expect(s.get('explosiveAbsorb')).toBe(0);
  });
});

describe('save robustness', () => {
  const mk = () => {
    const m = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
    return { m, store: new SaveStore(storage) };
  };
  it('newer save is flagged, backed up and never overwritten', () => {
    const { m, store } = mk();
    const raw = JSON.stringify({ version: 999, souls: 5 });
    m.set('cmw.save', raw);
    expect(store.load()).toBeNull();
    expect(store.newerVersionDetected).toBe(true);
    expect(m.get('cmw.save.backup.v999')).toBe(raw);
    expect(store.save(newSave())).toBe(false);
    expect(m.get('cmw.save')).toBe(raw);
  });
  it('deep-merges defaults and rejects wrong types', () => {
    const { m, store } = mk();
    m.set('cmw.save', JSON.stringify({ version: 1, souls: 'lots', stats: { vitality: 20 }, inventory: null, equipment: { head: 'x' } }));
    const d = store.load()!;
    expect(d.souls).toBe(0);
    expect(d.stats).toEqual({ vitality: 20, endurance: 10, firearms: 10, strength: 10 });
    expect(d.inventory).toEqual([]);
    expect(d.equipment).toEqual({ head: 'x' });
  });
  it('a flush after storage was cleared externally does not resurrect the save', () => {
    const { m, store } = mk();
    expect(store.save({ ...newSave(), souls: 7 })).toBe(true);
    const boot = new SaveStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }); // page reload
    expect(boot.load()!.souls).toBe(7);
    expect(boot.save({ ...newSave(), souls: 8 })).toBe(true); // normal flush
    m.clear(); // devtools localStorage.clear()
    expect(boot.save({ ...newSave(), souls: 9 })).toBe(false); // pagehide flush
    expect(m.size).toBe(0);
    // another tab replaced the save: not overwritten either
    m.set('cmw.save', JSON.stringify({ ...newSave(), sid: 'other', souls: 1 }));
    expect(boot.save({ ...newSave(), souls: 10 })).toBe(false);
    expect(JSON.parse(m.get('cmw.save')!).souls).toBe(1);
  });
  it('a fresh game (nothing loaded) and legacy saves without a token still save; frozen blocks', () => {
    const { m, store } = mk();
    expect(store.load()).toBeNull();
    expect(store.save(newSave())).toBe(true);
    expect(typeof JSON.parse(m.get('cmw.save')!).sid).toBe('string');
    m.set('cmw.save', JSON.stringify(newSave())); // legacy: no sid
    const s2 = new SaveStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
    s2.load();
    expect(s2.save(newSave())).toBe(true);
    s2.frozen = true;
    s2.clear();
    expect(m.size).toBe(0);
    expect(s2.save(newSave())).toBe(false);
    expect(m.size).toBe(0);
  });
  it('save returns false when setItem throws', () => {
    const store = new SaveStore({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} });
    expect(store.save(newSave())).toBe(false);
  });
});

describe('event bus robustness', () => {
  it('isolates throwing handlers, skips mid-emit removals, off cancels once', () => {
    const bus = new EventBus();
    const got: string[] = [];
    const err = console.error;
    console.error = () => {};
    let offB: () => void = () => {};
    bus.on('bonfireRest', () => { got.push('a'); offB(); throw new Error('boom'); });
    offB = bus.on('bonfireRest', () => got.push('b'));
    bus.on('bonfireRest', () => got.push('c'));
    bus.emit('bonfireRest', { bonfireId: 'x' });
    console.error = err;
    expect(got).toEqual(['a', 'c']);
    const fn = () => got.push('once');
    bus.once('bonfireRest', fn);
    bus.off('bonfireRest', fn);
    bus.emit('bonfireRest', { bonfireId: 'x' });
    expect(got).not.toContain('once');
  });
});

describe('game loop', () => {
  it('runs fixed ticks and clamps spiral of death', () => {
    const clock = new SimTime();
    let ticks = 0;
    const loop = new GameLoop({ clock, maxSubSteps: 5 });
    loop.add({ update: () => ticks++ });
    expect(loop.advance(SIM_DT * 2.5)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5);
    expect(loop.advance(10)).toBe(5); // hitch: capped
    expect(ticks).toBe(7);
    expect(clock.tick).toBe(7);
    expect(clock.frameDt).toBeCloseTo(0.25);
  });
});

describe('input', () => {
  it('latches pressed for exactly one tick and keeps sub-tick taps', () => {
    const inp = new Input();
    inp.codeDown('KeyR');
    inp.update(SIM_DT);
    expect(inp.pressed('reload')).toBe(true);
    inp.update(SIM_DT);
    expect(inp.pressed('reload')).toBe(false);
    expect(inp.down('reload')).toBe(true);
    inp.codeUp('KeyR');
    inp.update(SIM_DT);
    expect(inp.released('reload')).toBe(true);
    // tap within one frame
    inp.codeDown('KeyE');
    inp.codeUp('KeyE');
    inp.update(SIM_DT);
    expect(inp.pressed('interact') && inp.down('interact') && inp.released('interact')).toBe(true);
  });
});

describe('events + save + dsl', () => {
  it('bus delivers typed payloads and unsubscribes', () => {
    const bus = new EventBus();
    const got: string[] = [];
    const off = bus.on('bonfireRest', (e) => got.push(e.bonfireId));
    bus.emit('bonfireRest', { bonfireId: 'firelink' });
    off();
    bus.emit('bonfireRest', { bonfireId: 'burg' });
    expect(got).toEqual(['firelink']);
  });
  it('save roundtrips and rejects future versions', () => {
    const m = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
    const store = new SaveStore(storage);
    expect(store.load()).toBeNull();
    const s = newSave();
    s.souls = 123;
    s.lootedItems.push('F1');
    store.save(s);
    expect(store.load()?.souls).toBe(123);
    expect(store.load()?.lootedItems).toEqual(['F1']);
    m.set('cmw.save', JSON.stringify({ version: 999 }));
    expect(store.load()).toBeNull();
    store.clear();
    expect(store.load()).toBeNull();
  });
  it('dsl records ops', () => {
    const dsl = createLevelDsl();
    dsl.box(0, 0, 0, 4, 0.2, 4, 'stone');
    dsl.door('door_residence', [1, 0, 2], 'residence_key');
    expect(dsl.ops.map((o) => o.op)).toEqual(['box', 'door']);
  });
});
