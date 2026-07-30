import { vi } from 'vitest';
import {
  __startTrace,
  devErrors,
  devLogs,
  imports,
  loadTracedModule,
  Loxer,
  resetLoxer,
  resetTraceLogs,
  trace,
  transformLoxerTrace,
  transformOptions,
} from './plain-function-trace.fixture';

test('a transformed function preserves sync result, modifier chains, and its box ID', async () => {
  const traced = await loadTracedModule(`
    function calculate(value) {
      Loxer.m('ORDER').h(true).warn('calculating:' + value);
      return value * 2;
    }
    trace(calculate, {
      moduleId: 'TRACE',
      openMessage: 'args',
      closeMessage: 'result',
      highlight: 'all',
      argsAsItem: true,
      resultAsItem: true,
    });
    export { calculate };
  `);

  expect(traced.calculate(4)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'calculate(4)'],
    ['single', 'calculating:4'],
    ['close', 'calculate done. returns: 8'],
  ]);
  expect(new Set(devLogs.map((log) => log.id)).size).toBe(1);
  expect(devLogs.map((log) => log.moduleId)).toEqual(['TRACE', 'ORDER', 'TRACE']);
  expect(devLogs[0].highlighted).toBe(true);
  expect(devLogs[1].highlighted).toBe(true);
  expect(devLogs[2].highlighted).toBe(true);
  expect(devLogs[0].item).toEqual([4]);
  expect(devLogs[2].item).toBe(8);
});

test('a transformed declaration preserves this and rethrows the original synchronous value', async () => {
  const traced = await loadTracedModule(`
    const original = new Error('no-stock');
    function multiply(value) {
      return this.factor * value;
    }
    trace(multiply, { moduleId: 'TRACE' });
    function rejectSync() {
      throw original;
    }
    trace(rejectSync, { moduleId: 'TRACE' });
    export { multiply, original, rejectSync };
  `);

  expect(traced.multiply.call({ factor: 3 }, 4)).toBe(12);
  try {
    traced.rejectSync();
    throw new Error('Expected rejectSync to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual([
    'multiply done',
    'rejectSync failed',
  ]);
  expect(devErrors).toHaveLength(1);
  expect(devErrors[0].error).toBe(traced.original);
});

test('a transformed async function preserves its rejection and links errors and named errors', async () => {
  const traced = await loadTracedModule(`
    async function submit() {
      Loxer.m('ORDER').error(new Error('validation failed'));
      Loxer.h().namedError('PaymentError', 'card declined');
      throw new Error('original failure');
    }
    trace(submit, { moduleId: 'TRACE' });
    export { submit };
  `);

  await expect(traced.submit()).rejects.toThrow('original failure');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'submit()'],
    ['close', 'submit failed'],
  ]);
  expect(devErrors.map((error) => error.message)).toEqual([
    'validation failed',
    'card declined',
    'original failure',
  ]);
  const ids = [...devLogs, ...devErrors].map((record) => record.id);
  expect(new Set(ids).size).toBe(1);
  expect(devErrors.map((error) => error.moduleId)).toEqual(['ORDER', 'TRACE', 'TRACE']);
});

test('a non-async trace keeps the original promise identity while its lifecycle settles', async () => {
  const traced = await loadTracedModule(`
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    function load() {
      Loxer.m('ORDER').log('loading');
      return pending;
    }
    trace(load, { moduleId: 'TRACE' });
    export { complete, load, pending };
  `);

  const returned = traced.load();
  expect(returned).toBe(traced.pending);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'load()', 'TRACE'],
    ['single', 'loading', 'ORDER'],
  ]);

  traced.complete('ready');
  await expect(returned).resolves.toBe('ready');
  await Promise.resolve();

  expect(devLogs.at(-1)?.type).toBe('close');
  expect(devLogs.at(-1)?.message).toBe('load done');
});

test('a non-async trace keeps a hostile thenable object and closes successfully', async () => {
  const traced = await loadTracedModule(`
    const hostile = {};
    Object.defineProperty(hostile, 'then', {
      get() {
        throw new Error('then must not escape');
      },
    });
    function readHostile() {
      return hostile;
    }
    trace(readHostile, { moduleId: 'TRACE' });
    export { hostile, readHostile };
  `);

  expect(traced.readHostile()).toBe(traced.hostile);
  expect(devErrors).toEqual([]);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'readHostile()'],
    ['close', 'readHostile done'],
  ]);
});

test('a hoisted declaration can run before its marker without an options TDZ', async () => {
  const traced = await loadTracedModule(`
    function greet(name) {
      return 'Hello ' + name;
    }
    const beforeMarker = greet('Ada');
    trace(greet, { moduleId: 'TRACE', openMessage: 'args' });
    export { beforeMarker, greet };
  `);

  expect(traced.beforeMarker).toBe('Hello Ada');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'greet()'],
    ['close', 'greet done'],
  ]);
  expect(traced.greet('Grace')).toBe('Hello Grace');
  expect(devLogs.at(-2)?.message).toBe('greet(Grace)');
});

test('a hoisted declaration can run before its declaration and marker with default options', async () => {
  const traced = await loadTracedModule(`
    const beforeDeclaration = greet('Ada');
    function greet(name) {
      return 'Hello ' + name;
    }
    trace(greet, { moduleId: 'TRACE', openMessage: 'args' });
    export { beforeDeclaration, greet };
  `);

  expect(traced.beforeDeclaration).toBe('Hello Ada');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'greet()'],
    ['close', 'greet done'],
  ]);
  expect(traced.greet('Grace')).toBe('Hello Grace');
  expect(devLogs.at(-2)?.message).toBe('greet(Grace)');
});

test('a marker placed above its target declarations still applies its options', async () => {
  const traced = await loadTracedModule(`
    trace(hoisted, { moduleId: 'TRACE', openMessage: 'args' });
    function hoisted(name) {
      return 'Hello ' + name;
    }
    trace(later, { moduleId: 'ORDER', openMessage: 'args' });
    const later = (name) => 'Bye ' + name;
    export { hoisted, later };
  `);

  expect(traced.hoisted('Ada')).toBe('Hello Ada');
  expect(traced.later('Grace')).toBe('Bye Grace');
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['hoisted(Ada)', 'TRACE'],
    ['later(Grace)', 'ORDER'],
  ]);
});

test('named function expressions and arrows retain their original this semantics', async () => {
  const traced = await loadTracedModule(`
    const functionExpression = function (value) {
      return this.factor * value;
    };
    trace(functionExpression, { moduleId: 'TRACE' });

    function createArrow() {
      const arrow = (value) => this.factor * value;
      trace(arrow, { moduleId: 'ORDER' });
      return arrow;
    }
    export { createArrow, functionExpression };
  `);

  expect(traced.functionExpression.call({ factor: 3 }, 2)).toBe(6);
  const arrow = traced.createArrow.call({ factor: 5 });
  expect(arrow(2)).toBe(10);
  expect(devLogs.filter((log) => log.type === 'close')).toHaveLength(2);
});

test('variable-bound function forms retain arity and named expression self references', async () => {
  const traced = await loadTracedModule(`
    const expression = function recurse(value, total) {
      return value === 0 ? total : recurse(value - 1, total + 1);
    };
    trace(expression, { moduleId: 'TRACE' });

    const arrow = (left, right) => left + right;
    trace(arrow, { moduleId: 'ORDER' });
    export { arrow, expression };
  `);

  expect(traced.expression.name).toBe('recurse');
  expect(traced.expression.length).toBe(2);
  expect(traced.arrow.length).toBe(2);
  expect(traced.expression(3, 1)).toBe(4);
  expect(traced.arrow(2, 5)).toBe(7);
});

test('custom thenables are returned and are never invoked by tracing', async () => {
  const traced = await loadTracedModule(`
    let thenCalls = 0;
    const customThenable = {
      then() {
        thenCalls += 1;
      },
    };
    function readThenable() {
      return customThenable;
    }
    trace(readThenable, { moduleId: 'TRACE' });
    export { customThenable, readThenable, thenCalls };
  `);

  expect(traced.readThenable()).toBe(traced.customThenable);
  expect(traced.thenCalls).toBe(0);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'readThenable()'],
    ['close', 'readThenable done'],
  ]);
});

test('native promises with throwing own or subclass then accessors return unchanged', async () => {
  const traced = await loadTracedModule(`
    const ownThen = Promise.resolve('own');
    Object.defineProperty(ownThen, 'then', {
      get() {
        throw new Error('own then must not run');
      },
    });
    class ThrowingPromise extends Promise {
      get then() {
        throw new Error('subclass then must not run');
      }
    }
    const subclassThen = new ThrowingPromise((resolve) => resolve('subclass'));
    function readOwn() {
      return ownThen;
    }
    trace(readOwn, { moduleId: 'TRACE' });
    function readSubclass() {
      return subclassThen;
    }
    trace(readSubclass, { moduleId: 'ORDER' });
    export { ownThen, readOwn, readSubclass, subclassThen };
  `);

  let ownResult: unknown;
  expect(() => {
    ownResult = traced.readOwn();
  }).not.toThrow();
  expect(ownResult).toBe(traced.ownThen);
  let subclassResult: unknown;
  expect(() => {
    subclassResult = traced.readSubclass();
  }).not.toThrow();
  expect(subclassResult).toBe(traced.subclassThen);
  expect(devErrors).toEqual([]);
  expect(devLogs.filter((log) => log.type === 'open')).toHaveLength(2);
});

test('simple and rest arrows capture actual arguments', async () => {
  const traced = await loadTracedModule(`
    const simple = (first, second) => first + second;
    trace(simple, { moduleId: 'TRACE', openMessage: 'args' });
    const rest = (first, ...tail) => [first, tail];
    trace(rest, { moduleId: 'ORDER', openMessage: 'args' });
    export { rest, simple };
  `);

  expect(traced.simple(1, 2, 3)).toBe(3);
  expect(traced.rest('first', 'second', 'third')).toEqual(['first', ['second', 'third']]);
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'simple(1, 2, 3)',
    'rest(first, second, third)',
  ]);
});

test('undefined and circular thrown values remain the caller-visible failures', async () => {
  const traced = await loadTracedModule(`
    const circular = {};
    circular.self = circular;
    function throwUndefined() {
      throw undefined;
    }
    trace(throwUndefined, { moduleId: 'TRACE' });
    function throwCircular() {
      throw circular;
    }
    trace(throwCircular, { moduleId: 'ORDER' });
    export { circular, throwCircular, throwUndefined };
  `);

  try {
    traced.throwUndefined();
    throw new Error('Expected undefined to be thrown.');
  } catch (error) {
    expect(error).toBeUndefined();
  }
  try {
    traced.throwCircular();
    throw new Error('Expected circular object to be thrown.');
  } catch (error) {
    expect(error).toBe(traced.circular);
  }

  expect(devErrors.map((error) => error.message)).toEqual([
    'undefined',
    '[unserializable thrown value]',
  ]);
  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual([
    'throwUndefined failed',
    'throwCircular failed',
  ]);
});

test('failure output escapes control characters without replacing the original Error', async () => {
  const traced = await loadTracedModule(`
    const original = new Error('first\\nsecond\\u001b[31m');
    function fail() {
      throw original;
    }
    trace(fail, { moduleId: 'TRACE' });
    export { fail, original };
  `);

  try {
    traced.fail();
    throw new Error('Expected fail to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devErrors).toHaveLength(1);
  expect(devErrors[0].error).toBe(traced.original);
  expect(devErrors[0].message).toBe('first\\u000asecond\\u001b[31m');
  expect(traced.original.message).toBe('first\nsecond\u001b[31m');
});

test('an unreadable native Error message does not mask the original failure or box close', async () => {
  const traced = await loadTracedModule(`
    const original = new Error('seed');
    Object.defineProperty(original, 'message', {
      get() {
        throw new Error('message must not escape');
      },
    });
    function failUnreadable() {
      throw original;
    }
    trace(failUnreadable, { moduleId: 'TRACE' });
    export { failUnreadable, original };
  `);

  try {
    traced.failUnreadable();
    throw new Error('Expected failUnreadable to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devErrors).toHaveLength(1);
  expect(devErrors[0].error).toBe(traced.original);
  expect(devErrors[0].message).toBe('[unreadable error message]');
  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual([
    'failUnreadable failed',
  ]);
});

test('a proxy with an unreadable prototype remains the caller-visible failure and closes its box', async () => {
  const traced = await loadTracedModule(`
    const original = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('prototype must not escape');
      },
    });
    function failProxy() {
      throw original;
    }
    trace(failProxy, { moduleId: 'TRACE' });
    export { failProxy, original };
  `);

  try {
    traced.failProxy();
    throw new Error('Expected failProxy to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devErrors).toHaveLength(1);
  expect(devErrors[0].message).toBe('{}');
  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual([
    'failProxy failed',
  ]);
});

test('nested and overlapping transformed invocations link each direct log to its owning ID', async () => {
  const traced = await loadTracedModule(`
    async function child(value) {
      Loxer.log('child:start:' + value);
      await Promise.resolve();
      Loxer.log('child:end:' + value);
      return value;
    }
    trace(child, { moduleId: 'TRACE', openMessage: 'args' });

    async function parent(value) {
      Loxer.log('parent:start:' + value);
      const result = await child(value);
      Loxer.log('parent:end:' + value);
      return result;
    }
    trace(parent, { moduleId: 'ORDER', openMessage: 'args' });
    export { child, parent };
  `);

  await expect(Promise.all([traced.parent('one'), traced.parent('two')])).resolves.toEqual([
    'one',
    'two',
  ]);

  const opens = devLogs.filter((log) => log.type === 'open');
  const closes = devLogs.filter((log) => log.type === 'close');
  expect(opens).toHaveLength(4);
  expect(closes).toHaveLength(4);
  expect(new Set(opens.map((log) => log.id)).size).toBe(4);

  const idFor = (message: string) => devLogs.find((log) => log.message === message)?.id;
  const parentOne = idFor('parent(one)');
  const parentTwo = idFor('parent(two)');
  const childOne = idFor('child(one)');
  const childTwo = idFor('child(two)');

  expect(parentOne).toBeDefined();
  expect(parentTwo).toBeDefined();
  expect(childOne).toBeDefined();
  expect(childTwo).toBeDefined();
  expect(new Set([parentOne, parentTwo, childOne, childTwo]).size).toBe(4);
  expect(idFor('parent:start:one')).toBe(parentOne);
  expect(idFor('parent:end:one')).toBe(parentOne);
  expect(idFor('parent:start:two')).toBe(parentTwo);
  expect(idFor('parent:end:two')).toBe(parentTwo);
  expect(idFor('child:start:one')).toBe(childOne);
  expect(idFor('child:end:one')).toBe(childOne);
  expect(idFor('child:start:two')).toBe(childTwo);
  expect(idFor('child:end:two')).toBe(childTwo);
});

test('the runtime marker fails loudly without a transform', () => {
  expect(() => trace(() => 'untransformed')).toThrow(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace'
  );
  expect(() => trace([() => 'untransformed'])).toThrow(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace'
  );
});

test('a target list traces every listed binding with one shared options expression', async () => {
  const traced = await loadTracedModule(`
    let optionsCalls = 0;
    function makeOptions() {
      optionsCalls += 1;
      return { moduleId: 'TRACE', openMessage: 'args', closeMessage: 'result' };
    }
    function double(value) {
      Loxer.m('ORDER').log('doubling:' + value);
      return value * 2;
    }
    async function triple(value) {
      return value * 3;
    }
    const quadruple = (value) => value * 4;
    trace([double, triple, quadruple], makeOptions());
    export { double, optionsCalls, quadruple, triple };
  `);

  expect(traced.optionsCalls).toBe(1);
  expect(traced.double(2)).toBe(4);
  await expect(traced.triple(2)).resolves.toBe(6);
  expect(traced.quadruple(2)).toBe(8);
  expect(traced.quadruple.length).toBe(1);

  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'double(2)', 'TRACE'],
    ['single', 'doubling:2', 'ORDER'],
    ['close', 'double done. returns: 4', 'TRACE'],
    ['open', 'triple(2)', 'TRACE'],
    ['close', 'triple done. returns: 6', 'TRACE'],
    ['open', 'quadruple(2)', 'TRACE'],
    ['close', 'quadruple done. returns: 8', 'TRACE'],
  ]);
  const boxIds = devLogs.filter((log) => log.type === 'open').map((log) => log.id);
  expect(new Set(boxIds).size).toBe(3);
  expect(devLogs[1].id).toBe(boxIds[0]);
});

test('a target-list marker above its declarations still applies the shared options', async () => {
  const traced = await loadTracedModule(`
    trace([first, second], { moduleId: 'ORDER', openMessage: 'args' });
    function first(value) {
      return 'first:' + value;
    }
    function second(value) {
      return 'second:' + value;
    }
    export { first, second };
  `);

  expect(traced.first('a')).toBe('first:a');
  expect(traced.second('b')).toBe('second:b');
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['first(a)', 'ORDER'],
    ['second(b)', 'ORDER'],
  ]);
});

test('list and single markers coexist and keep separate options per marker', async () => {
  const traced = await loadTracedModule(`
    function shared(value) {
      return value;
    }
    const alsoShared = function (value) {
      return value;
    };
    trace([shared, alsoShared], { moduleId: 'TRACE', openMessage: 'args' });
    function separate(value) {
      return value;
    }
    trace(separate, { moduleId: 'ORDER', openMessage: 'types' });
    export { alsoShared, separate, shared };
  `);

  expect(traced.shared(1)).toBe(1);
  expect(traced.alsoShared(2)).toBe(2);
  expect(traced.separate(3)).toBe(3);
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['shared(1)', 'TRACE'],
    ['alsoShared(2)', 'TRACE'],
    ['separate(number)', 'ORDER'],
  ]);
});

test('a target list preserves this on a function expression, real arguments, and mixed arities', async () => {
  const traced = await loadTracedModule(`
    const scale = function (value) {
      return [this.factor, arguments.length, value];
    };
    function greet(name) {
      return 'hi ' + name;
    }
    const double = (value) => value * 2;
    trace([scale, greet, double], { moduleId: 'TRACE' });
    export { double, greet, scale };
  `);

  expect(traced.scale.call({ factor: 4 }, 2, 3)).toEqual([4, 2, 2]);
  expect(traced.greet('Ada')).toBe('hi Ada');
  expect(traced.double.length).toBe(1);
  expect(traced.double(3)).toBe(6);
  expect(devLogs.filter((log) => log.type === 'close')).toHaveLength(3);
});

test('a named self-recursive list member re-enters its own trace box on every recursive call', async () => {
  const traced = await loadTracedModule(`
    const expression = function recurse(value, total) {
      return value === 0 ? total : recurse(value - 1, total + 1);
    };
    const double = (value) => value * 2;
    trace([expression, double], { moduleId: 'TRACE', openMessage: 'args' });
    export { double, expression };
  `);

  expect(traced.expression.name).toBe('recurse');
  expect(traced.expression.length).toBe(2);
  expect(traced.expression(3, 1)).toBe(4);
  expect(traced.double(2)).toBe(4);

  const recurseOpens = devLogs.filter(
    (log) => log.type === 'open' && log.message.startsWith('expression')
  );
  const recurseCloses = devLogs.filter(
    (log) => log.type === 'close' && log.message === 'expression done'
  );
  expect(recurseOpens).toHaveLength(4);
  expect(recurseCloses).toHaveLength(4);
  expect(new Set(recurseOpens.map((log) => log.id)).size).toBe(4);
  expect(
    devLogs.filter((log) => log.type === 'close' && log.message === 'double done')
  ).toHaveLength(1);
});

test('a runtime failure in one list member does not affect its siblings box lifecycle', async () => {
  const traced = await loadTracedModule(`
    function first(value) {
      return 'first:' + value;
    }
    function second(value) {
      throw new Error('second failed:' + value);
    }
    function third(value) {
      return 'third:' + value;
    }
    trace([first, second, third], { moduleId: 'TRACE', openMessage: 'args' });
    export { first, second, third };
  `);

  expect(traced.first('a')).toBe('first:a');
  expect(() => traced.second('b')).toThrow('second failed:b');
  expect(traced.third('c')).toBe('third:c');

  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'first(a)'],
    ['close', 'first done'],
    ['open', 'second(b)'],
    ['close', 'second failed'],
    ['open', 'third(c)'],
    ['close', 'third done'],
  ]);
  expect(devErrors.map((error) => error.message)).toEqual(['second failed:b']);
  const boxIds = devLogs.filter((log) => log.type === 'open').map((log) => log.id);
  expect(new Set(boxIds).size).toBe(3);
});

test('a non-async list member keeps native promise identity while its siblings trace independently', async () => {
  const traced = await loadTracedModule(`
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    function loadPending() {
      return pending;
    }
    function saveSync(value) {
      return value + 1;
    }
    trace([loadPending, saveSync], { moduleId: 'TRACE' });
    export { complete, loadPending, pending, saveSync };
  `);

  const returned = traced.loadPending();
  expect(returned).toBe(traced.pending);
  expect(traced.saveSync(1)).toBe(2);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'loadPending()'],
    ['open', 'saveSync()'],
    ['close', 'saveSync done'],
  ]);

  traced.complete('ready');
  await expect(returned).resolves.toBe('ready');
  await Promise.resolve();

  expect(devLogs.at(-1)).toMatchObject({ type: 'close', message: 'loadPending done' });
  const boxIds = devLogs.filter((log) => log.type === 'open').map((log) => log.id);
  expect(new Set(boxIds).size).toBe(2);
});

test('concurrent list members link direct Loxer calls to their own trace box without cross-talk', async () => {
  const traced = await loadTracedModule(`
    async function loadOrder(value) {
      Loxer.log('load:start:' + value);
      await Promise.resolve();
      Loxer.log('load:end:' + value);
      return value;
    }
    async function saveOrder(value) {
      Loxer.log('save:start:' + value);
      await Promise.resolve();
      Loxer.log('save:end:' + value);
      return value;
    }
    trace([loadOrder, saveOrder], { moduleId: 'TRACE', openMessage: 'args' });
    export { loadOrder, saveOrder };
  `);

  await expect(Promise.all([traced.loadOrder('one'), traced.saveOrder('two')])).resolves.toEqual([
    'one',
    'two',
  ]);

  const idFor = (message: string) => devLogs.find((log) => log.message === message)?.id;
  const loadId = idFor('loadOrder(one)');
  const saveId = idFor('saveOrder(two)');
  expect(loadId).toBeDefined();
  expect(saveId).toBeDefined();
  expect(loadId).not.toBe(saveId);
  expect(idFor('load:start:one')).toBe(loadId);
  expect(idFor('load:end:one')).toBe(loadId);
  expect(idFor('save:start:two')).toBe(saveId);
  expect(idFor('save:end:two')).toBe(saveId);
});

test('argsAsItem, resultAsItem, level, and highlight apply uniformly across a shared-options list', async () => {
  const traced = await loadTracedModule(`
    function first(value) {
      return value + 1;
    }
    async function second(value) {
      return value + 2;
    }
    const third = (value) => value + 3;
    trace([first, second, third], {
      moduleId: 'TRACE',
      level: 'warn',
      highlight: 'all',
      argsAsItem: true,
      resultAsItem: true,
    });
    export { first, second, third };
  `);

  expect(traced.first(1)).toBe(2);
  await expect(traced.second(1)).resolves.toBe(3);
  expect(traced.third(1)).toBe(4);

  const opens = devLogs.filter((log) => log.type === 'open');
  const closes = devLogs.filter((log) => log.type === 'close');
  expect(opens.map((log) => log.message)).toEqual(['first()', 'second()', 'third()']);
  expect(closes.map((log) => log.message)).toEqual(['first done', 'second done', 'third done']);
  for (const log of [...opens, ...closes]) {
    expect(log.level).toBe('warn');
    expect(log.highlighted).toBe(true);
  }
  expect(opens.map((log) => log.item)).toEqual([[1], [1], [1]]);
  expect(closes.map((log) => log.item)).toEqual([2, 3, 4]);
});

test('a list marker in a nested scope re-evaluates its shared options on every call', async () => {
  const traced = await loadTracedModule(`
    function makeTraced(label) {
      function first(value) {
        return label + ':first:' + value;
      }
      function second(value) {
        return label + ':second:' + value;
      }
      trace([first, second], { moduleId: 'TRACE', openMessage: 'args', closeMessage: 'result' });
      return { first, second };
    }
    export { makeTraced };
  `);

  const alpha = traced.makeTraced('alpha');
  expect(alpha.first('a')).toBe('alpha:first:a');
  expect(alpha.second('b')).toBe('alpha:second:b');

  const beta = traced.makeTraced('beta');
  expect(beta.first('c')).toBe('beta:first:c');
  expect(beta.second('d')).toBe('beta:second:d');

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'first(a)',
    'second(b)',
    'first(c)',
    'second(d)',
  ]);
  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual([
    'first done. returns: "alpha:first:a"',
    'second done. returns: "alpha:second:b"',
    'first done. returns: "beta:first:c"',
    'second done. returns: "beta:second:d"',
  ]);
});

test('markers in a nested scope keep per-invocation options instead of sharing one slot', async () => {
  const traced = await loadTracedModule(`
    function makeTraced(moduleId) {
      function single(value) {
        return moduleId + ':' + value;
      }
      trace(single, { moduleId, openMessage: 'args' });
      function listFirst(value) {
        return moduleId + ':first:' + value;
      }
      function listSecond(value) {
        return moduleId + ':second:' + value;
      }
      trace([listFirst, listSecond], { moduleId, openMessage: 'args' });
      return { listFirst, listSecond, single };
    }
    export { makeTraced };
  `);

  const order = traced.makeTraced('ORDER');
  const later = traced.makeTraced('TRACE');

  expect(order.single('a')).toBe('ORDER:a');
  expect(order.listFirst('b')).toBe('ORDER:first:b');
  expect(later.single('c')).toBe('TRACE:c');
  expect(later.listSecond('d')).toBe('TRACE:second:d');

  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['single(a)', 'ORDER'],
    ['listFirst(b)', 'ORDER'],
    ['single(c)', 'TRACE'],
    ['listSecond(d)', 'TRACE'],
  ]);
});

test('a list marker shares one options slot across targets declared in two nested scopes', async () => {
  const traced = await loadTracedModule(`
    function makeGroup(moduleId) {
      function outerTarget(value) {
        return moduleId + ':outer:' + value;
      }
      function build() {
        function innerTarget(value) {
          return moduleId + ':inner:' + value;
        }
        trace([outerTarget, innerTarget], { moduleId, openMessage: 'args' });
        return innerTarget;
      }
      return { build, outerTarget };
    }
    export { makeGroup };
  `);

  const order = traced.makeGroup('ORDER');
  const orderInner = order.build();
  const later = traced.makeGroup('TRACE');
  const laterInner = later.build();

  expect(order.outerTarget('a')).toBe('ORDER:outer:a');
  expect(orderInner('b')).toBe('ORDER:inner:b');
  expect(later.outerTarget('c')).toBe('TRACE:outer:c');
  expect(laterInner('d')).toBe('TRACE:inner:d');

  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['outerTarget(a)', 'ORDER'],
    ['innerTarget(b)', 'ORDER'],
    ['outerTarget(c)', 'TRACE'],
    ['innerTarget(d)', 'TRACE'],
  ]);
});

test('two list markers in one nested scope get separate per-invocation options slots', async () => {
  const source = `
    function makeGroups(firstId, secondId) {
      function firstA(value) {
        return 'firstA:' + value;
      }
      function firstB(value) {
        return 'firstB:' + value;
      }
      trace([firstA, firstB], { moduleId: firstId, openMessage: 'args' });
      function secondA(value) {
        return 'secondA:' + value;
      }
      function secondB(value) {
        return 'secondB:' + value;
      }
      trace([secondA, secondB], { moduleId: secondId, openMessage: 'args' });
      return { firstA, firstB, secondA, secondB };
    }
    export { makeGroups };
  `;

  const emitted = await transformLoxerTrace(`${imports()}${source}`, transformOptions());
  const emittedCode = emitted?.code ?? '';
  const optionsIds = [...new Set(emittedCode.match(/_sharedTraceOptions\d*/g))].sort();
  expect(optionsIds).toHaveLength(2);
  expect(emittedCode).toContain(`var ${optionsIds.join(', ')};`);

  const traced = await loadTracedModule(source);
  const order = traced.makeGroups('ORDER', 'TRACE');
  const swapped = traced.makeGroups('TRACE', 'ORDER');

  expect(order.firstA('a')).toBe('firstA:a');
  expect(order.secondA('b')).toBe('secondA:b');
  expect(swapped.firstB('c')).toBe('firstB:c');
  expect(swapped.secondB('d')).toBe('secondB:d');

  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['firstA(a)', 'ORDER'],
    ['secondA(b)', 'TRACE'],
    ['firstB(c)', 'TRACE'],
    ['secondB(d)', 'ORDER'],
  ]);
});

test('a marker on a block-scoped target keeps per-invocation options', async () => {
  const traced = await loadTracedModule(`
    function build(moduleId) {
      let handler;
      if (moduleId) {
        function blockScoped(value) {
          return moduleId + ':' + value;
        }
        trace(blockScoped, { moduleId, openMessage: 'args' });
        handler = blockScoped;
      }
      return handler;
    }
    export { build };
  `);

  const order = traced.build('ORDER');
  const later = traced.build('TRACE');

  expect(order('a')).toBe('ORDER:a');
  expect(later('b')).toBe('TRACE:b');
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['blockScoped(a)', 'ORDER'],
    ['blockScoped(b)', 'TRACE'],
  ]);
});

test('shadowed Array and Object bindings do not affect a list-traced group in the same nested scope', async () => {
  const traced = await loadTracedModule(`
    function withShadowedGlobals() {
      const Array = { from() { throw new Error('shadowed Array'); } };
      const Object = { defineProperty() { throw new Error('shadowed Object'); } };
      function declaration(value) {
        return value * 2;
      }
      const expression = function (value) {
        return value + 1;
      };
      const arrow = (first, second = 1) => first + second;
      trace([declaration, expression, arrow], { moduleId: 'TRACE' });
      return { arrow, declaration, expression, Array, Object };
    }
    export { withShadowedGlobals };
  `);

  const bindings = traced.withShadowedGlobals();
  expect(bindings.declaration(3)).toBe(6);
  expect(bindings.expression(3)).toBe(4);
  expect(bindings.arrow.length).toBe(1);
  expect(bindings.arrow(4)).toBe(5);
  expect(bindings.arrow(4, 2)).toBe(6);
  expect(devLogs.filter((log) => log.type === 'close')).toHaveLength(4);
});

test('formatter and cyclic-result failures fall back without changing results', () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  const trace = __startTrace('format', [1], {
    moduleId: 'TRACE',
    openMessage: () => {
      throw new Error('formatter failed');
    },
    closeMessage: 'result',
  });

  trace.success(cyclic);

  expect(devLogs.map((log) => log.message)).toEqual(['format()', 'format done']);
  expect(devLogs.map((log) => log.id)).toEqual([trace.id, trace.id]);
});

test('trace options format types, pretty results, and successful formatter messages', () => {
  const typed = __startTrace('typed', [1, 'text', null], {
    closeMessage: 'prettyResult',
    moduleId: 'TRACE',
    openMessage: 'types',
  });
  typed.success({ nested: true });

  const formatted = __startTrace('formatted', ['Ada'], {
    closeMessage: (result: any) => `close:${result.name}`,
    moduleId: 'ORDER',
    openMessage: (args) => `open:${args[0]}`,
  });
  formatted.success({ name: 'Grace' });

  expect(devLogs.map((log) => log.message)).toEqual([
    'typed(number, string, object)',
    'typed done. returns: \n{\n "nested": true\n}',
    'open:Ada',
    'close:Grace',
  ]);
});

test('className.functionName trace messages fall back to the function name', () => {
  const trace = __startTrace('standalone', [], {
    closeMessage: 'className.functionName',
    moduleId: 'TRACE',
    openMessage: 'className.functionName',
  });
  trace.success(undefined);

  expect(devLogs.map((log) => log.message)).toEqual(['standalone()', 'standalone done']);
});

test('custom formatter messages escape terminal control characters', () => {
  const trace = __startTrace('controlled', [], {
    closeMessage: () => 'close\n\u001b[31mmessage',
    moduleId: 'TRACE',
    openMessage: () => 'open\n\u001b[32mmessage',
  });
  trace.success('result');

  expect(devLogs.map((log) => log.message)).toEqual([
    'open\\u000a\\u001b[32mmessage',
    'close\\u000a\\u001b[31mmessage',
  ]);
});

test('a resolved function name is sanitized before it reaches the open, close, and failure messages', () => {
  const hostile = 'evil\u001b[31m\nFAKE LINE';

  const succeeding = __startTrace(hostile, [], { moduleId: 'TRACE' });
  succeeding.success('ok');
  expect(devLogs.map((log) => log.message)).toEqual([
    'evil\\u001b[31m\\u000aFAKE LINE()',
    'evil\\u001b[31m\\u000aFAKE LINE done',
  ]);

  resetTraceLogs();
  const failing = __startTrace(hostile, [], { moduleId: 'TRACE' });
  failing.failure(new Error('boom'));
  expect(devLogs.map((log) => log.message)).toEqual([
    'evil\\u001b[31m\\u000aFAKE LINE()',
    'evil\\u001b[31m\\u000aFAKE LINE failed',
  ]);

  resetTraceLogs();
  const plain = __startTrace('ordinaryName', [], { moduleId: 'TRACE' });
  plain.success('ok');
  expect(devLogs.map((log) => log.message)).toEqual(['ordinaryName()', 'ordinaryName done']);
});

test('non-string formatters and control characters fall back to safe trace messages', () => {
  const fallback = __startTrace('fallback', [], {
    closeMessage: (() => 123) as any,
    moduleId: 'TRACE',
    openMessage: (() => 123) as any,
  });
  fallback.success('result');

  const escaped = __startTrace('escaped', ['line\nbreak', '\u001b[31mred\u001b[0m'], {
    moduleId: 'ORDER',
    openMessage: 'args',
  });
  escaped.success(undefined);

  expect(devLogs.map((log) => log.message)).toEqual([
    'fallback()',
    'fallback done',
    'escaped(line\\u000abreak, \\u001b[31mred\\u001b[0m)',
    'escaped done',
  ]);
});

test('disabled traces are silent and pre-init traces replay when Loxer initializes', () => {
  resetLoxer();
  const queued = __startTrace('queued', [], { moduleId: 'TRACE' });
  queued.success('ok');

  Loxer.init({
    dev: true,
    callbacks: {
      devLog(log) {
        devLogs.push(log);
      },
    },
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'info', prodLevel: 'error', fullName: 'Trace' },
    },
  });
  expect(devLogs.map((log) => log.message)).toEqual([
    'Loxer initialized',
    'queued()',
    'queued done',
  ]);

  resetTraceLogs();
  resetLoxer();
  Loxer.init({
    dev: true,
    config: { disabled: true },
    callbacks: { devLog: (log) => devLogs.push(log) },
  });
  const disabled = __startTrace('disabled', [], { moduleId: 'TRACE' });
  disabled.success('ignored');
  expect(devLogs).toEqual([]);
});

test('an omitted trace level remains visible while a hidden trace leaves no visible records', () => {
  const defaultLevel = __startTrace('defaultLevel', [], { moduleId: 'TRACE' });
  defaultLevel.success('visible');
  expect(devLogs.map((log) => [log.message, log.level])).toEqual([
    ['defaultLevel()', 'info'],
    ['defaultLevel done', 'info'],
  ]);

  resetTraceLogs();
  const historyLength = Loxer.history.length;
  const hidden = __startTrace('hiddenLevel', [], { level: 'debug', moduleId: 'TRACE' });
  hidden.success('hidden');
  expect(devLogs).toEqual([]);
  expect(Loxer.history).toHaveLength(historyLength);
});

test('default and destructured traced arrows retain caller arguments for message and item output', async () => {
  const traced = await loadTracedModule(`
    const zero = () => 'zero';
    trace(zero, { moduleId: 'TRACE', openMessage: 'args', argsAsItem: true });
    const defaulted = (first = 'fallback', second = 'two') => first + ':' + second;
    trace(defaulted, { moduleId: 'ORDER', openMessage: 'args', argsAsItem: true });
    const destructured = ({ value } = { value: 'fallback' }, [tail] = ['tail']) => value + ':' + tail;
    trace(destructured, { moduleId: 'TRACE', openMessage: 'args', argsAsItem: true });
    export { defaulted, destructured, zero };
  `);

  expect(traced.zero.length).toBe(0);
  expect(traced.defaulted.length).toBe(0);
  expect(traced.destructured.length).toBe(0);
  expect(traced.zero()).toBe('zero');
  expect(traced.defaulted()).toBe('fallback:two');
  expect(traced.defaulted(undefined, 'given')).toBe('fallback:given');
  expect(traced.destructured()).toBe('fallback:tail');
  expect(traced.destructured(undefined, undefined)).toBe('fallback:tail');
  expect(traced.destructured({ value: 'actual' }, ['array'])).toBe('actual:array');

  const openings = devLogs.filter((log) => log.type === 'open');
  expect(openings.map((log) => log.message)).toEqual([
    'zero()',
    'defaulted()',
    'defaulted(undefined, given)',
    'destructured()',
    'destructured(undefined, undefined)',
    'destructured([object Object], array)',
  ]);
  expect(openings.map((log) => log.item)).toEqual([
    [],
    [],
    [undefined, 'given'],
    [],
    [undefined, undefined],
    [{ value: 'actual' }, ['array']],
  ]);
});

test('shadowed Array and Object bindings do not affect generated trace helpers', async () => {
  const traced = await loadTracedModule(`
    function withShadowedArray() {
      const Array = { from() { throw new Error('shadowed Array'); } };
      function declaration(value) {
        return value * 2;
      }
      trace(declaration, { moduleId: 'TRACE' });
      const expression = function (value) {
        return value + 1;
      };
      trace(expression, { moduleId: 'ORDER' });
      return { declaration, expression, Array };
    }
    const Object = { defineProperty() { throw new Error('shadowed Object'); } };
    export const arrow = (first, second = 1) => first + second;
    trace(arrow, { moduleId: 'TRACE' });
    export { withShadowedArray };
  `);

  const bindings = traced.withShadowedArray();
  expect(bindings.declaration(3)).toBe(6);
  expect(bindings.expression(3)).toBe(4);
  expect(traced.arrow.length).toBe(1);
  expect(traced.arrow(4)).toBe(5);
  expect(traced.arrow(4, 2)).toBe(6);
});

test('a hidden direct modifier log does not enter history and leaves a visible trace box', async () => {
  const traced = await loadTracedModule(`
    function hiddenDetail() {
      Loxer.m('ORDER').debug('not visible');
      return 'ok';
    }
    trace(hiddenDetail, { moduleId: 'TRACE' });
    export { hiddenDetail };
  `);
  const historyLength = Loxer.history.length;

  expect(traced.hiddenDetail()).toBe('ok');
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'hiddenDetail()', 'TRACE'],
    ['close', 'hiddenDetail done', 'TRACE'],
  ]);
  expect(Loxer.history).toHaveLength(historyLength + 2);
});

test('direct level calls link to the trace box while a level .open() starts its own', async () => {
  const traced = await loadTracedModule(`
    function checkout() {
      Loxer.warn('warned');
      Loxer.m('ORDER').info('informed');
      Loxer.debug('detail');
      const inner = Loxer.info.open('inner');
      Loxer.of(inner).close('inner done');
      return 'ok';
    }
    trace(checkout, { moduleId: 'TRACE' });
    export { checkout };
  `);

  expect(traced.checkout()).toBe('ok');

  const byMessage = (message: string) => devLogs.find((log) => log.message === message);
  const traceId = byMessage('checkout()')?.id;
  expect(traceId).toBeDefined();

  // `.warn(...)` was rewritten onto the trace box. 'warn' sits above the box's own 'info', so the
  // box's level wins - a linked log must never out-live the column its box reserved.
  expect(byMessage('warned')).toMatchObject({ id: traceId, level: 'info', type: 'single' });
  // `.info(...)` behind a module modifier is linked too, and keeps the explicit module
  expect(byMessage('informed')).toMatchObject({
    id: traceId,
    level: 'info',
    moduleId: 'ORDER',
    type: 'single',
  });
  // `.debug(...)` sits below the box, so it keeps 'debug' and every module here drops it
  expect(byMessage('detail')).toBeUndefined();

  // a level's `.open()` is a two-level member callee and is NOT linked: it opens its own box
  const inner = byMessage('inner');
  expect(inner?.type).toBe('open');
  expect(inner?.id).not.toBe(traceId);
  expect(byMessage('inner done')?.id).toBe(inner?.id);
});

test('a shadowed Loxer binding is never linked, not even through a level method', async () => {
  const traced = await loadTracedModule(`
    function shadowed() {
      const calls = [];
      const Loxer = {
        debug(message) { calls.push('debug:' + message); },
        warn(message) { calls.push('warn:' + message); },
        info: { open() { calls.push('open'); return { close() {} }; } },
      };
      Loxer.debug('local');
      Loxer.warn('local');
      Loxer.info.open();
      return calls;
    }
    trace(shadowed, { moduleId: 'TRACE' });
    export { shadowed };
  `);

  expect(traced.shadowed()).toEqual(['debug:local', 'warn:local', 'open']);
  // the local object handled every call; only the trace's own box reached the real Loxer
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'shadowed()'],
    ['close', 'shadowed done'],
  ]);
});

test('initialization does not require a global process object', () => {
  resetLoxer();
  vi.stubGlobal('process', undefined);

  expect(() => Loxer.init()).not.toThrow();
  expect(() =>
    Loxer.init({ dev: true, callbacks: { devLog: (log) => devLogs.push(log) } })
  ).not.toThrow();

  vi.unstubAllGlobals();
});

test('the transform removes the marker and reports unsupported marker forms', async () => {
  const result = await transformLoxerTrace(
    `${imports()} function one() { return 1; } trace(one); export { one };`,
    transformOptions()
  );
  expect(result?.code).not.toContain('trace(one)');
  expect(result?.code).toContain('__startTrace');

  await expect(
    transformLoxerTrace(
      `${imports()} function one() { return 1; } const value = trace(one);`,
      transformOptions()
    )
  ).rejects.toThrow('trace() must be a standalone statement');
});

test('the transform removes target-list markers and reports unsupported list forms', async () => {
  const result = await transformLoxerTrace(
    `${imports()} function one() { return 1; } function two() { return 2; } trace([one, two]); export { one, two };`,
    transformOptions()
  );
  expect(result?.code).not.toContain('trace([one, two])');
  expect(result?.code).toContain('__startTrace');

  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects('trace([]);').toThrow('trace() expects at least one target.');
  await rejects('function one() { return 1; } trace([...[one]]);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects('const service = { run() {} }; trace([service.run]);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects(
    'function one() { return 1; } function two() { return 2; } trace([one, , two]);'
  ).toThrow('trace() targets must be named function-binding identifiers.');
  await rejects('trace(() => 1);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects('function one() { return 1; } trace(one, ...[{ moduleId: "TRACE" }]);').toThrow(
    'trace() options cannot be a spread argument.'
  );
  await rejects('const list = [one]; function one() { return 1; } trace(list);').toThrow(
    'trace() target "list" is not initialized with a function.'
  );
  await rejects('function one() { return 1; } const value = trace([one]);').toThrow(
    'trace() must be a standalone statement beside its named function binding.'
  );
  await rejects('function one() { return 1; } trace([one, one]);').toThrow(
    'Function "one" has more than one trace() marker.'
  );
  await rejects('function one() { return 1; } trace(one); trace([one]);').toThrow(
    'Function "one" has more than one trace() marker.'
  );
  await rejects('const constant = 1; trace([constant]);').toThrow(
    'trace() target "constant" is not initialized with a function.'
  );
});
