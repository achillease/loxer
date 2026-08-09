import { outputFromCallbacks } from './output-capture';
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

const directModuleSelectorCases = [
  { name: 'direct dot', marker: 'trace.TRACE', moduleId: 'TRACE' },
  { name: 'static bracket', marker: "trace['ORDER']", moduleId: 'ORDER' },
  { name: 'computed', marker: 'trace[selected]', moduleId: 'TRACE' },
  { name: '.m()', marker: "trace.m('ORDER')", moduleId: 'ORDER' },
  { name: '.module()', marker: "trace.module('TRACE')", moduleId: 'TRACE' },
] as const;

const terminalLevels = [
  ['error', 'error'],
  ['warn', 'warn'],
  ['log', 'info'],
  ['info', 'info'],
  ['debug', 'debug'],
] as const;

function initializeDebugTraceOutput(): void {
  resetLoxer();
  Loxer.init({
    dev: true,
    defaultLevels: { devLevel: 'debug', prodLevel: 'error' },
    output: outputFromCallbacks({
      devError: (error) => devErrors.push(error),
      devLog: (log) => devLogs.push(log),
    }),
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'debug', prodLevel: 'error', fullName: 'Trace' },
      ORDER: { color: '#ffcc00', devLevel: 'debug', prodLevel: 'error', fullName: 'Order' },
    },
  });
  resetTraceLogs();
}

test('a transformed function preserves sync result, modifier chains, and its box ID', async () => {
  const traced = await loadTracedModule(`
    function calculate(value) {
      Loxer.m('ORDER').h(true).warn('calculating:' + value);
      return value * 2;
    }
    trace.m('TRACE').h().props('argsResult').info(calculate, {
      openMessage: 'fn(args)',
      closeMessage: 'fn(result)',
    });
    export { calculate };
  `);

  expect(traced.calculate(4)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'calculate(4)'],
    ['single', 'calculating:4'],
    ['close', 'calculate(8) done'],
  ]);
  expect(new Set(devLogs.map((log) => log.id)).size).toBe(1);
  expect(devLogs.map((log) => log.moduleId)).toEqual(['TRACE', 'ORDER', 'TRACE']);
  expect(devLogs[0].highlighted).toBe(true);
  expect(devLogs[1].highlighted).toBe(true);
  expect(devLogs[2].highlighted).toBe(true);
  expect(devLogs[0].props).toEqual([4]);
  expect(devLogs[2].props).toEqual([8]);
  // capture is not a rendering request
  expect(devLogs[0].printProps).toBeUndefined();
  expect(devLogs[2].printProps).toBeUndefined();
});

test('a transformed declaration preserves this and rethrows the original synchronous value', async () => {
  const traced = await loadTracedModule(`
    const original = new Error('no-stock');
    function multiply(value) {
      return this.factor * value;
    }
    trace.m('TRACE').info(multiply);
    function rejectSync() {
      throw original;
    }
    trace.m('TRACE').info(rejectSync);
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
    trace.m('TRACE').info(submit);
    export { submit };
  `);

  await expect(traced.submit()).rejects.toThrow('original failure');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    // the default openMessage is 'parent.fn', and a marked plain function's parent is the file the
    // transform built it from - `src/orders/orderService.ts` in this fixture
    ['open', 'orderService.submit()'],
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
    trace.m('TRACE').info(load);
    export { complete, load, pending };
  `);

  const returned = traced.load();
  expect(returned).toBe(traced.pending);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'orderService.load()', 'TRACE'],
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
    trace.m('TRACE').info(readHostile);
    export { hostile, readHostile };
  `);

  expect(traced.readHostile()).toBe(traced.hostile);
  expect(devErrors).toEqual([]);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.readHostile()'],
    ['close', 'readHostile done'],
  ]);
});

test('a hoisted declaration can run before its marker without an options TDZ', async () => {
  const traced = await loadTracedModule(`
    function greet(name) {
      return 'Hello ' + name;
    }
    const beforeMarker = greet('Ada');
    trace.m('TRACE').info(greet, { openMessage: 'fn(args)' });
    export { beforeMarker, greet };
  `);

  expect(traced.beforeMarker).toBe('Hello Ada');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.greet()'],
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
    trace.m('TRACE').info(greet, { openMessage: 'fn(args)' });
    export { beforeDeclaration, greet };
  `);

  expect(traced.beforeDeclaration).toBe('Hello Ada');
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.greet()'],
    ['close', 'greet done'],
  ]);
  expect(traced.greet('Grace')).toBe('Hello Grace');
  expect(devLogs.at(-2)?.message).toBe('greet(Grace)');
});

test('a marker placed above its target declarations still applies its options', async () => {
  const traced = await loadTracedModule(`
    trace.m('TRACE').info(hoisted, { openMessage: 'fn(args)' });
    function hoisted(name) {
      return 'Hello ' + name;
    }
    trace.m('ORDER').info(later, { openMessage: 'fn(args)' });
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
    trace.m('TRACE').info(functionExpression);

    function createArrow() {
      const arrow = (value) => this.factor * value;
      trace.m('ORDER').info(arrow);
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
    trace.m('TRACE').info(expression);

    const arrow = (left, right) => left + right;
    trace.m('ORDER').info(arrow);
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
    trace.m('TRACE').info(readThenable);
    export { customThenable, readThenable, thenCalls };
  `);

  expect(traced.readThenable()).toBe(traced.customThenable);
  expect(traced.thenCalls).toBe(0);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.readThenable()'],
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
    trace.m('TRACE').info(readOwn);
    function readSubclass() {
      return subclassThen;
    }
    trace.m('ORDER').info(readSubclass);
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
    trace.m('TRACE').info(simple, { openMessage: 'fn(args)' });
    const rest = (first, ...tail) => [first, tail];
    trace.m('ORDER').info(rest, { openMessage: 'fn(args)' });
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
    trace.m('TRACE').info(throwUndefined);
    function throwCircular() {
      throw circular;
    }
    trace.m('ORDER').info(throwCircular);
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
    trace.m('TRACE').info(fail);
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
    trace.m('TRACE').info(failUnreadable);
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
    trace.m('TRACE').info(failProxy);
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
    trace.m('TRACE').info(child, { openMessage: 'fn(args)' });

    async function parent(value) {
      Loxer.log('parent:start:' + value);
      const result = await child(value);
      Loxer.log('parent:end:' + value);
      return result;
    }
    trace.m('ORDER').info(parent, { openMessage: 'fn(args)' });
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
  expect(() => trace.info(() => 'untransformed')).toThrow(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace'
  );
  expect(() => trace.info([() => 'untransformed'])).toThrow(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace'
  );
});

test.each([
  ['modifier', () => trace.m('TRACE').info(() => 'untransformed')],
  ['terminal', () => trace.error(() => 'untransformed')],
  ['direct dot module', () => (trace as any).TRACE.info(() => 'untransformed')],
  ['direct bracket module', () => (trace as any)['ORDER-API'].info(() => 'untransformed')],
] as const)('an untransformed fluent %s fails with the marker diagnostic', (_name, call) => {
  expect(call).toThrow(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace or ' +
      'vite-plugin-loxer-trace before executing this module.'
  );
});

test('the runtime marker keeps promise, symbol, and object introspection outside module selection', () => {
  const runtimeMarker = trace as unknown as Record<PropertyKey, unknown>;

  expect(runtimeMarker.then).toBeUndefined();
  expect(runtimeMarker[Symbol.iterator]).toBeUndefined();
  expect(runtimeMarker[Symbol.toStringTag]).toBeUndefined();
  expect(runtimeMarker.toString).toBeUndefined();
  expect(Object.getPrototypeOf(trace)).toBeNull();
  expect(Object.prototype.toString.call(trace)).toBe('[object Object]');

  expect((Loxer as unknown as Record<PropertyKey, unknown>).TRACE).toBeUndefined();
  expect((Loxer as unknown as Record<PropertyKey, unknown>)['ORDER-API']).toBeUndefined();
  expect(Object.getPrototypeOf(Loxer)).not.toBeNull();
});

test.each(directModuleSelectorCases)(
  'every terminal transforms a $name selector for a named target',
  async ({ marker, moduleId }) => {
    const traced = await loadTracedModule(`
      const selected = 'TRACE';
      function atError() { return 'error'; }
      ${marker}.error(atError);
      function atWarn() { return 'warn'; }
      ${marker}.warn(atWarn);
      function atLog() { return 'log'; }
      ${marker}.log(atLog);
      function atInfo() { return 'info'; }
      ${marker}.info(atInfo);
      function atDebug() { return 'debug'; }
      ${marker}.debug(atDebug);
      export { atDebug, atError, atInfo, atLog, atWarn };
    `);
    initializeDebugTraceOutput();

    expect([
      traced.atError(),
      traced.atWarn(),
      traced.atLog(),
      traced.atInfo(),
      traced.atDebug(),
    ]).toEqual(['error', 'warn', 'log', 'info', 'debug']);
    expect(devLogs.map((log) => [log.level, log.moduleId])).toEqual(
      terminalLevels.flatMap(([, level]) => [
        [level, moduleId],
        [level, moduleId],
      ])
    );
  }
);

test.each(directModuleSelectorCases)(
  'every terminal transforms a $name selector for a target list',
  async ({ marker, moduleId }) => {
    const traced = await loadTracedModule(`
      const selected = 'TRACE';
      function atError() { return 'error'; }
      function alsoError() { return 'also-error'; }
      ${marker}.error([atError, alsoError]);
      function atWarn() { return 'warn'; }
      function alsoWarn() { return 'also-warn'; }
      ${marker}.warn([atWarn, alsoWarn]);
      function atLog() { return 'log'; }
      function alsoLog() { return 'also-log'; }
      ${marker}.log([atLog, alsoLog]);
      function atInfo() { return 'info'; }
      function alsoInfo() { return 'also-info'; }
      ${marker}.info([atInfo, alsoInfo]);
      function atDebug() { return 'debug'; }
      function alsoDebug() { return 'also-debug'; }
      ${marker}.debug([atDebug, alsoDebug]);
      export { atDebug, atError, atInfo, atLog, atWarn };
    `);
    initializeDebugTraceOutput();

    expect([
      traced.atError(),
      traced.atWarn(),
      traced.atLog(),
      traced.atInfo(),
      traced.atDebug(),
    ]).toEqual(['error', 'warn', 'log', 'info', 'debug']);
    expect(devLogs.map((log) => [log.level, log.moduleId])).toEqual(
      terminalLevels.flatMap(([, level]) => [
        [level, moduleId],
        [level, moduleId],
      ])
    );
  }
);

test('log and info terminals are equivalent while error uses ordinary lifecycle logs', async () => {
  const traced = await loadTracedModule(`
    function bare() { return 'bare'; }
    trace.info(bare);
    function logged() { return 'logged'; }
    trace.m('TRACE').log(logged);
    function informed() { return 'informed'; }
    trace.m('TRACE').info(informed);
    function failedLevel() { return 'error-level'; }
    trace.m('TRACE').error(failedLevel);
    export { bare, failedLevel, informed, logged };
  `);

  expect(traced.bare()).toBe('bare');
  expect(traced.logged()).toBe('logged');
  expect(traced.informed()).toBe('informed');
  expect(traced.failedLevel()).toBe('error-level');

  const lifecycle = devLogs.map((log) => [log.type, log.level, log.moduleId]);
  expect(lifecycle).toEqual([
    ['open', 'info', 'DEFAULT'],
    ['close', 'info', 'DEFAULT'],
    ['open', 'info', 'TRACE'],
    ['close', 'info', 'TRACE'],
    ['open', 'info', 'TRACE'],
    ['close', 'info', 'TRACE'],
    ['open', 'error', 'TRACE'],
    ['close', 'error', 'TRACE'],
  ]);
  expect(devErrors).toEqual([]);
});

test('all marker terminals preserve their selected level and an error-level failure stays linked', async () => {
  const traced = await loadTracedModule(`
    const original = new Error('failed');
    function atError() { return 'error'; }
    trace.error(atError);
    function atWarn() { return 'warn'; }
    trace.warn(atWarn);
    function atInfo() { return 'info'; }
    trace.info(atInfo);
    function atDebug() { return 'debug'; }
    trace.debug(atDebug);
    function fail() { throw original; }
    trace.error(fail);
    export { atDebug, atError, atInfo, atWarn, fail, original };
  `);
  resetLoxer();
  Loxer.init({
    dev: true,
    defaultLevels: { devLevel: 'debug', prodLevel: 'error' },
    output: outputFromCallbacks({
      devError: (error) => devErrors.push(error),
      devLog: (log) => devLogs.push(log),
    }),
  });
  resetTraceLogs();

  expect(traced.atError()).toBe('error');
  expect(traced.atWarn()).toBe('warn');
  expect(traced.atInfo()).toBe('info');
  expect(traced.atDebug()).toBe('debug');
  try {
    traced.fail();
    throw new Error('Expected fail() to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devLogs.map((log) => log.level)).toEqual([
    'error',
    'error',
    'warn',
    'warn',
    'info',
    'info',
    'debug',
    'debug',
    'error',
    'error',
  ]);
  expect(devErrors).toHaveLength(1);
  expect(devErrors[0]).toMatchObject({ error: traced.original, level: 'error' });
  expect(new Set([...devLogs.slice(-2), devErrors[0]].map((record) => record.id)).size).toBe(1);
});

test('both highlight aliases apply their boolean decision to open and close', async () => {
  const traced = await loadTracedModule(`
    function enabled() { return true; }
    trace.module('TRACE').highlight().info(enabled);
    function disabled() { return false; }
    trace.m('ORDER').h(false).info(disabled);
    export { disabled, enabled };
  `);

  expect(traced.enabled()).toBe(true);
  expect(traced.disabled()).toBe(false);
  expect(devLogs.map((log) => log.highlighted)).toEqual([true, true, false, false]);
  expect(devLogs.map((log) => log.moduleId)).toEqual(['TRACE', 'TRACE', 'ORDER', 'ORDER']);
});

test('fluent marker arguments evaluate once in source order and the whole chain is removed', async () => {
  const source = `
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function calculate(value) { return value * 2; }
    trace
      .pp(mark('pp', { target: 'result', depth: 1 }))
      .m(mark('module', 'TRACE'))
      .props(mark('props', 'argsResult'))
      .h(mark('highlight', true))
      .warn(calculate, mark('options', { openMessage: 'fn(args)' }));
    export { calculate, order };
  `;
  const result = await transformLoxerTrace(`${imports()}${source}`, transformOptions());
  expect(result?.code).not.toContain('.pp(');
  expect(result?.code).not.toContain('.warn(calculate');

  const traced = await loadTracedModule(source);
  expect(traced.order).toEqual(['pp', 'module', 'props', 'highlight', 'options']);
  expect(traced.calculate(4)).toBe(8);
  expect(traced.order).toEqual(['pp', 'module', 'props', 'highlight', 'options']);
  expect(devLogs.map((log) => log.level)).toEqual(['warn', 'warn']);
});

test('direct dot, bracket, and computed modules transform across all marker terminals', async () => {
  const source = `
    const selected = 'TRACE';
    function atError() { return 'error'; }
    trace.TRACE.error(atError);
    function atWarn() { return 'warn'; }
    trace['ORDER'].warn(atWarn);
    function atLog() { return 'log'; }
    trace[selected].log(atLog);
    function atInfo() { return 'info'; }
    trace.m('ORDER').info(atInfo);
    function atDebug() { return 'debug'; }
    trace.module('TRACE').debug(atDebug);
    export { atDebug, atError, atInfo, atLog, atWarn };
  `;
  const result = await transformLoxerTrace(`${imports()}${source}`, transformOptions());
  expect(result?.code).not.toMatch(/import\s*\{\s*trace\s*\}/);
  expect(result?.code).not.toContain('trace.');
  expect(result?.code).not.toContain('trace[');

  resetLoxer();
  Loxer.init({
    dev: true,
    output: outputFromCallbacks({
      devError: (error) => devErrors.push(error),
      devLog: (log) => devLogs.push(log),
    }),
    defaultLevels: { devLevel: 'debug', prodLevel: 'error' },
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'debug', prodLevel: 'error', fullName: 'Trace' },
      ORDER: { color: '#ffcc00', devLevel: 'debug', prodLevel: 'error', fullName: 'Order' },
    },
  });
  resetTraceLogs();

  const traced = await loadTracedModule(source);
  expect([
    traced.atError(),
    traced.atWarn(),
    traced.atLog(),
    traced.atInfo(),
    traced.atDebug(),
  ]).toEqual(['error', 'warn', 'log', 'info', 'debug']);
  expect(devLogs.map((log) => [log.type, log.level, log.moduleId])).toEqual([
    ['open', 'error', 'TRACE'],
    ['close', 'error', 'TRACE'],
    ['open', 'warn', 'ORDER'],
    ['close', 'warn', 'ORDER'],
    ['open', 'info', 'TRACE'],
    ['close', 'info', 'TRACE'],
    ['open', 'info', 'ORDER'],
    ['close', 'info', 'ORDER'],
    ['open', 'debug', 'TRACE'],
    ['close', 'debug', 'TRACE'],
  ]);
});

test('a target-list marker evaluates fluent arguments once in source order', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function first(value) { return value + 1; }
    function second(value) { return value + 2; }
    trace.m(mark('module', 'TRACE')).props(mark('props', 'args'))
      .info([first, second], mark('options', { openMessage: 'fn(args)' }));
    export { first, order, second };
  `);

  expect(traced.order).toEqual(['module', 'props', 'options']);
  expect(traced.first(1)).toBe(2);
  expect(traced.second(1)).toBe(3);
  expect(traced.order).toEqual(['module', 'props', 'options']);
});

test('computed direct modules preserve source order and once-only target-list evaluation', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function first(value) { return value + 1; }
    function second(value) { return value + 2; }
    trace.h(mark('highlight', true))[mark('module', 'TRACE')]
      .props(mark('props', 'args')).info([first, second], mark('options', {
        openMessage: 'fn(args)'
      }));
    export { first, order, second };
  `);

  expect(traced.order).toEqual(['highlight', 'module', 'props', 'options']);
  expect(traced.first(1)).toBe(2);
  expect(traced.second(1)).toBe(3);
  expect(traced.order).toEqual(['highlight', 'module', 'props', 'options']);
  expect(devLogs.map((log) => log.moduleId)).toEqual(['TRACE', 'TRACE', 'TRACE', 'TRACE']);
});

test('props capture and printing route independently and printer routing metadata is stripped', async () => {
  const traced = await loadTracedModule(`
    function mismatched(value) { return { value }; }
    trace
      .pp({ target: 'args', depth: 1 })
      .props('result')
      .info(mismatched);
    function printingOnly(value) { return value + 1; }
    trace.pp('argsResult').info(printingOnly);
    export { mismatched, printingOnly };
  `);

  expect(traced.mismatched('value')).toEqual({ value: 'value' });
  expect(traced.printingOnly(1)).toBe(2);
  const [mismatchedOpen, mismatchedClose, printingOpen, printingClose] = devLogs;
  expect([mismatchedOpen.props, mismatchedOpen.printProps]).toEqual([[], { depth: 1 }]);
  expect([mismatchedClose.props, mismatchedClose.printProps]).toEqual([
    [{ value: 'value' }],
    undefined,
  ]);
  expect([printingOpen.props, printingOpen.printProps]).toEqual([[], {}]);
  expect([printingClose.props, printingClose.printProps]).toEqual([[], {}]);
  expect(mismatchedOpen.printProps).not.toHaveProperty('target');
});

test('dynamic invalid props and printer targets select neither lifecycle side', async () => {
  const traced = await loadTracedModule(`
    const target = 'invalid';
    function captured(value) { return value + 1; }
    trace.props(target).info(captured);
    function printed(value) { return value + 2; }
    trace.pp(target).info(printed);
    export { captured, printed };
  `);

  expect(traced.captured(1)).toBe(2);
  expect(traced.printed(1)).toBe(3);
  expect(devLogs.map((log) => [log.props, log.printProps])).toEqual([
    [[], undefined],
    [[], undefined],
    [[], undefined],
    [[], undefined],
  ]);
});

test('a target list traces every listed binding with one shared options expression', async () => {
  const traced = await loadTracedModule(`
    let optionsCalls = 0;
    function makeOptions() {
      optionsCalls += 1;
      return { openMessage: 'fn(args)', closeMessage: 'fn(result)' };
    }
    function double(value) {
      Loxer.m('ORDER').log('doubling:' + value);
      return value * 2;
    }
    async function triple(value) {
      return value * 3;
    }
    const quadruple = (value) => value * 4;
    trace.m('TRACE').info([double, triple, quadruple], makeOptions());
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
    ['close', 'double(4) done', 'TRACE'],
    ['open', 'triple(2)', 'TRACE'],
    ['close', 'triple(6) done', 'TRACE'],
    ['open', 'quadruple(2)', 'TRACE'],
    ['close', 'quadruple(8) done', 'TRACE'],
  ]);
  const boxIds = devLogs.filter((log) => log.type === 'open').map((log) => log.id);
  expect(new Set(boxIds).size).toBe(3);
  expect(devLogs[1].id).toBe(boxIds[0]);
});

test('a target-list marker above its declarations still applies the shared options', async () => {
  const traced = await loadTracedModule(`
    trace.m('ORDER').info([first, second], { openMessage: 'fn(args)' });
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
    trace.m('TRACE').info([shared, alsoShared], { openMessage: 'fn(args)' });
    function separate(value) {
      return value;
    }
    trace.m('ORDER').info(separate, { openMessage: 'fn(types)' });
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
    trace.m('TRACE').info([scale, greet, double]);
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
    trace.m('TRACE').info([expression, double], { openMessage: 'fn(args)' });
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
    trace.m('TRACE').info([first, second, third], { openMessage: 'fn(args)' });
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
    trace.m('TRACE').info([loadPending, saveSync]);
    export { complete, loadPending, pending, saveSync };
  `);

  const returned = traced.loadPending();
  expect(returned).toBe(traced.pending);
  expect(traced.saveSync(1)).toBe(2);
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.loadPending()'],
    ['open', 'orderService.saveSync()'],
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
    trace.m('TRACE').info([loadOrder, saveOrder], { openMessage: 'fn(args)' });
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

test('props, level, and highlight modifiers apply uniformly across a shared-options list', async () => {
  const traced = await loadTracedModule(`
    function first(value) {
      return value + 1;
    }
    async function second(value) {
      return value + 2;
    }
    const third = (value) => value + 3;
    trace.m('TRACE').h().props('argsResult').warn([first, second, third]);
    export { first, second, third };
  `);

  expect(traced.first(1)).toBe(2);
  await expect(traced.second(1)).resolves.toBe(3);
  expect(traced.third(1)).toBe(4);

  const opens = devLogs.filter((log) => log.type === 'open');
  const closes = devLogs.filter((log) => log.type === 'close');
  expect(opens.map((log) => log.message)).toEqual([
    'orderService.first()',
    'orderService.second()',
    'orderService.third()',
  ]);
  expect(closes.map((log) => log.message)).toEqual(['first done', 'second done', 'third done']);
  // asserted at array level so a single differing log is named by the diff rather than throwing out
  // of a loop before the rest is checked
  expect([...opens, ...closes].map((log) => log.level)).toEqual(Array(6).fill('warn'));
  expect([...opens, ...closes].map((log) => log.highlighted)).toEqual(Array(6).fill(true));
  expect(opens.map((log) => log.props)).toEqual([[1], [1], [1]]);
  expect(closes.map((log) => log.props)).toEqual([[2], [3], [4]]);
});

test('plain-function markers apply printArgs and printResult independently for direct and shared targets', async () => {
  const traced = await loadTracedModule(`
    function argsOnly(first, second) {
      return first + second;
    }
    trace.m('TRACE').props('args').pp({ target: 'args', depth: 1 }).info(argsOnly);

    function resultOnly(value) {
      return { value };
    }
    trace.m('ORDER').props('result').pp('result').info(resultOnly);

    function first(value) {
      return value + 1;
    }
    async function second(value) {
      return value + 2;
    }
    trace.m('TRACE').props('argsResult').pp({ target: 'argsResult', keys: [] }).info([first, second]);
    export { argsOnly, first, resultOnly, second };
  `);

  expect(traced.argsOnly(2, 3)).toBe(5);
  expect(traced.resultOnly('result')).toEqual({ value: 'result' });
  expect(traced.first(4)).toBe(5);
  await expect(traced.second(4)).resolves.toBe(6);

  const opens = devLogs.filter((log) => log.type === 'open');
  const closes = devLogs.filter((log) => log.type === 'close');
  expect(opens.map((log) => [log.props, log.printProps])).toEqual([
    [[2, 3], { depth: 1 }],
    [[], undefined],
    [[4], { keys: [] }],
    [[4], { keys: [] }],
  ]);
  expect(closes.map((log) => [log.props, log.printProps])).toEqual([
    [[], undefined],
    [[{ value: 'result' }], {}],
    [[5], { keys: [] }],
    [[6], { keys: [] }],
  ]);
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
      trace.m('TRACE').info([first, second], { openMessage: 'fn(args)', closeMessage: 'fn(result)' });
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
    'first("alpha:first:a") done',
    'second("alpha:second:b") done',
    'first("beta:first:c") done',
    'second("beta:second:d") done',
  ]);
});

test('markers in a nested scope keep per-invocation options instead of sharing one slot', async () => {
  const traced = await loadTracedModule(`
    function makeTraced(moduleId) {
      function single(value) {
        return moduleId + ':' + value;
      }
      trace.m(moduleId).info(single, { openMessage: 'fn(args)' });
      function listFirst(value) {
        return moduleId + ':first:' + value;
      }
      function listSecond(value) {
        return moduleId + ':second:' + value;
      }
      trace.m(moduleId).info([listFirst, listSecond], { openMessage: 'fn(args)' });
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
        trace.m(moduleId).info([outerTarget, innerTarget], { openMessage: 'fn(args)' });
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
      trace.m(firstId).info([firstA, firstB], { openMessage: 'fn(args)' });
      function secondA(value) {
        return 'secondA:' + value;
      }
      function secondB(value) {
        return 'secondB:' + value;
      }
      trace.m(secondId).info([secondA, secondB], { openMessage: 'fn(args)' });
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
        trace.m(moduleId).info(blockScoped, { openMessage: 'fn(args)' });
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
      trace.m('TRACE').info([declaration, expression, arrow]);
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
    markerOptions: {
      openMessage: () => {
        throw new Error('formatter failed');
      },
      closeMessage: 'fn(result)',
    },
  });

  trace.success(cyclic);

  expect(devLogs.map((log) => log.message)).toEqual(['format()', 'format done']);
  expect(devLogs.map((log) => log.id)).toEqual([trace.id, trace.id]);
});

test('trace options format types, results, and successful formatter messages', () => {
  const typed = __startTrace('typed', [1, 'text', null], {
    moduleId: 'TRACE',
    markerOptions: { closeMessage: 'fn(result)', openMessage: 'fn(types)' },
  });
  typed.success({ nested: true });

  const formatted = __startTrace('formatted', ['Ada'], {
    moduleId: 'ORDER',
    markerOptions: {
      closeMessage: ({ result }: any) => `close:${result.name}`,
      openMessage: ({ args }) => `open:${args[0]}`,
    },
  });
  formatted.success({ name: 'Grace' });

  expect(devLogs.map((log) => log.message)).toEqual([
    'typed(number, string, object)',
    'typed({"nested":true}) done',
    'open:Ada',
    'close:Grace',
  ]);
});

test('parent.fn trace messages fall back to the function name', () => {
  const trace = __startTrace('standalone', [], {
    moduleId: 'TRACE',
    markerOptions: { closeMessage: 'parent.fn', openMessage: 'parent.fn' },
    propsTarget: 'result',
  });
  trace.success(undefined);

  expect(devLogs.map((log) => log.message)).toEqual(['standalone()', 'standalone done']);
  expect(devLogs[1].props).toEqual([]);
});

test('a parent name is sanitized before it reaches the open and close messages', () => {
  // the parent is a file name or a class name read out of a build's own input, so it carries no
  // more guarantee about control characters than the function name beside it does - an unescaped
  // one would let a repository path forge terminal output on every traced call. The test above
  // covers the same styles with no parent at all.
  const hostile = __startTrace(
    'load',
    [],
    {
      moduleId: 'TRACE',
      markerOptions: { closeMessage: 'parent.fn', openMessage: 'parent.fn' },
    },
    'we\u001b[31m\nird'
  );
  hostile.success(undefined);
  expect(devLogs.map((log) => log.message)).toEqual([
    'we\\u001b[31m\\u000aird.load()',
    'we\\u001b[31m\\u000aird.load done',
  ]);
});

test('custom formatter messages escape terminal control characters', () => {
  const trace = __startTrace('controlled', [], {
    moduleId: 'TRACE',
    markerOptions: {
      closeMessage: () => 'close\n\u001b[31mmessage',
      openMessage: () => 'open\n\u001b[32mmessage',
    },
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
    moduleId: 'TRACE',
    markerOptions: { closeMessage: (() => 123) as any, openMessage: (() => 123) as any },
  });
  fallback.success('result');

  const escaped = __startTrace('escaped', ['line\nbreak', '\u001b[31mred\u001b[0m'], {
    moduleId: 'ORDER',
    markerOptions: { openMessage: 'fn(args)' },
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
    output: outputFromCallbacks({
      devLog(log) {
        devLogs.push(log);
      },
    }),
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
    output: outputFromCallbacks({ devLog: (log) => devLogs.push(log) }),
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

test('default and destructured traced arrows retain caller arguments for message and props output', async () => {
  const traced = await loadTracedModule(`
    const zero = () => 'zero';
    trace.m('TRACE').props('args').info(zero, { openMessage: 'fn(args)' });
    const defaulted = (first = 'fallback', second = 'two') => first + ':' + second;
    trace.m('ORDER').props('args').info(defaulted, { openMessage: 'fn(args)' });
    const destructured = ({ value } = { value: 'fallback' }, [tail] = ['tail']) => value + ':' + tail;
    trace.m('TRACE').props('args').info(destructured, { openMessage: 'fn(args)' });
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
    // an object argument renders its contents, the way a logged value does, rather than as
    // `[object Object]`
    "destructured({ value: 'actual' }, [ 'array' ])",
  ]);
  expect(openings.map((log) => log.props)).toEqual([
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
      trace.m('TRACE').info(declaration);
      const expression = function (value) {
        return value + 1;
      };
      trace.m('ORDER').info(expression);
      return { declaration, expression, Array };
    }
    const Object = { defineProperty() { throw new Error('shadowed Object'); } };
    export const arrow = (first, second = 1) => first + second;
    trace.m('TRACE').info(arrow);
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
    trace.m('TRACE').info(hiddenDetail);
    export { hiddenDetail };
  `);
  const historyLength = Loxer.history.length;

  expect(traced.hiddenDetail()).toBe('ok');
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'orderService.hiddenDetail()', 'TRACE'],
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
    trace.m('TRACE').info(checkout);
    export { checkout };
  `);

  expect(traced.checkout()).toBe('ok');

  const byMessage = (message: string) => devLogs.find((log) => log.message === message);
  const traceId = byMessage('orderService.checkout()')?.id;
  expect(traceId).toBeDefined();

  // `.warn(...)` was rewritten onto the trace box and still reports 'warn': linking a log to a box
  // changes which box it belongs to, never how severe it is.
  expect(byMessage('warned')).toMatchObject({ id: traceId, level: 'warn', type: 'single' });
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
    trace.m('TRACE').info(shadowed);
    export { shadowed };
  `);

  expect(traced.shadowed()).toEqual(['debug:local', 'warn:local', 'open']);
  // the local object handled every call; only the trace's own box reached the real Loxer
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.shadowed()'],
    ['close', 'shadowed done'],
  ]);
});

test('initialization does not require a global process object', () => {
  resetLoxer();
  vi.stubGlobal('process', undefined);

  expect(() => Loxer.init()).not.toThrow();
  expect(() =>
    Loxer.init({ dev: true, output: outputFromCallbacks({ devLog: (log) => devLogs.push(log) }) })
  ).not.toThrow();

  vi.unstubAllGlobals();
});

test('the transform removes the marker and reports unsupported marker forms', async () => {
  const result = await transformLoxerTrace(
    `${imports()} function one() { return 1; } trace.info(one); export { one };`,
    transformOptions()
  );
  expect(result?.code).not.toContain('trace.info(one)');
  expect(result?.code).toContain('__startTrace');

  await expect(
    transformLoxerTrace(`${imports()} function one() { return 1; } trace(one);`, transformOptions())
  ).rejects.toThrow('trace() must end with an error, warn, info, debug, or log terminal call.');

  await expect(
    transformLoxerTrace(
      `${imports()} function one() { return 1; } const value = trace.info(one);`,
      transformOptions()
    )
  ).rejects.toThrow('trace() must be a standalone statement');
});

test('the transform removes target-list markers and reports unsupported list forms', async () => {
  const result = await transformLoxerTrace(
    `${imports()} function one() { return 1; } function two() { return 2; } trace.info([one, two]); export { one, two };`,
    transformOptions()
  );
  expect(result?.code).not.toContain('trace.info([one, two])');
  expect(result?.code).toContain('__startTrace');

  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects('trace.info([]);').toThrow('trace() expects at least one target.');
  await rejects('function one() { return 1; } trace.info([...[one]]);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects('const service = { run() {} }; trace.info([service.run]);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects(
    'function one() { return 1; } function two() { return 2; } trace.info([one, , two]);'
  ).toThrow('trace() targets must be named function-binding identifiers.');
  await rejects('trace.info(() => 1);').toThrow(
    'trace() targets must be named function-binding identifiers.'
  );
  await rejects(
    'function one() { return 1; } trace.info(one, ...[{ moduleId: "TRACE" }]);'
  ).toThrow('trace() options cannot be a spread argument.');
  await rejects('const list = [one]; function one() { return 1; } trace.info(list);').toThrow(
    'trace() target "list" is not initialized with a function.'
  );
  await rejects('function one() { return 1; } const value = trace.info([one]);').toThrow(
    'trace() must be a standalone statement beside its named function binding.'
  );
  await rejects('function one() { return 1; } trace.info([one, one]);').toThrow(
    'Function "one" has more than one trace() marker.'
  );
  await rejects('function one() { return 1; } trace.info(one); trace.info([one]);').toThrow(
    'Function "one" has more than one trace() marker.'
  );
  await rejects('const constant = 1; trace.info([constant]);').toThrow(
    'trace() target "constant" is not initialized with a function.'
  );
});

test('the transform validates fluent marker chains and removes them as one expression', async () => {
  const result = await transformLoxerTrace(
    `${imports()} function one() { return 1; } trace.m('TRACE').h().props('args').pp('result').warn(one); export { one };`,
    transformOptions()
  );
  expect(result?.code).not.toContain(".m('TRACE')");
  expect(result?.code).not.toContain(".props('args')");
  expect(result?.code).not.toContain('.warn(one)');
  expect(result?.code).not.toMatch(/import\s*\{\s*trace\s*\}/);

  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects("function one() {} trace.m('TRACE').module('ORDER').info(one);").toThrow(
    'trace() modifier "module" may appear only once.'
  );
  await rejects('function one() {} trace.h().highlight(false).info(one);').toThrow(
    'trace() modifier "highlight" may appear only once.'
  );
  await rejects("function one() {} trace.props('args').props('result').info(one);").toThrow(
    'trace() modifier "props" may appear only once.'
  );
  await rejects("function one() {} trace.pp('args').pp('result').info(one);").toThrow(
    'trace() modifier "pp" may appear only once.'
  );
  await rejects('function one() {} trace.props().info(one);').toThrow(
    'trace().props() expects exactly one argument.'
  );
  await rejects("function one() {} trace.pp('args', {}).info(one);").toThrow(
    'trace().pp() expects exactly one argument.'
  );
  await rejects("function one() {} trace.m('TRACE', 'ORDER').info(one);").toThrow(
    'trace().m() expects zero or one argument.'
  );
  await rejects("function one() {} trace.props('args');").toThrow(
    'trace().props() needs a terminal level call.'
  );
  await rejects("function one() {} trace.m('TRACE').h();").toThrow(
    'trace().h() needs a terminal level call.'
  );
  await rejects("function one() {} trace.pp('invalid').info(one);").toThrow(
    'trace().pp() target must be "args", "result", or "argsResult".'
  );
  await rejects("function one() {} trace.props('invalid').info(one);").toThrow(
    'trace().props() target must be "args", "result", or "argsResult".'
  );
  await rejects("function one() {} trace['info'](one);").toThrow(
    'trace() does not support computed fluent members.'
  );
  await rejects('function one() {} trace.verbose(one);').toThrow(
    'trace() does not support fluent member "verbose".'
  );
});

test.each([
  {
    name: 'a direct and method module duplicate',
    source: "function one() {} trace.TRACE.m('ORDER').info(one);",
    diagnostic: 'trace() modifier "module" may appear only once.',
  },
  {
    name: 'two direct module selectors',
    source: "function one() {} trace.TRACE['ORDER'].info(one);",
    diagnostic: 'trace() modifier "module" may appear only once.',
  },
  {
    name: 'a reserved dot module',
    source: 'function one() {} trace.call.info(one);',
    diagnostic: 'trace() direct module "call" is reserved; use trace.m("call") instead.',
  },
  {
    name: 'a reserved static-bracket module',
    source: "function one() {} trace['call'].info(one);",
    diagnostic: 'trace() direct module "call" is reserved; use trace.m("call") instead.',
  },
  {
    name: 'a computed terminal',
    source: "const level = 'info'; function one() {} trace.TRACE[level](one);",
    diagnostic: 'trace() does not support computed fluent members.',
  },
  {
    name: 'optional chaining',
    source: 'function one() {} trace?.TRACE.info(one);',
    diagnostic: 'trace() does not support optional chaining.',
  },
  {
    name: 'an unknown terminal',
    source: 'function one() {} trace.TRACE.verbose(one);',
    diagnostic: 'trace() does not support fluent member "verbose".',
  },
  {
    name: 'an incomplete direct chain',
    source: 'trace.TRACE;',
    diagnostic: 'trace() must end with an error, warn, info, debug, or log terminal call.',
  },
] as const)('the transform diagnoses $name', async ({ source, diagnostic }) => {
  await expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects.toThrow(
    diagnostic
  );
});
