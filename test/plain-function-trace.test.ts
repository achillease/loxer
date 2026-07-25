import { ErrorLox, OutputLox } from '../src/loxes';
import { Loxer, resetLoxer } from '../src';
import { __observeTraceResult, __setTraceFunctionLength, __startTrace, trace } from '../src/trace';
import { transformLoxerTrace } from '../packages/babel-plugin-loxer-trace/src/transform';
import { vi } from 'vitest';

let devLogs: OutputLox[] = [];
let devErrors: ErrorLox[] = [];
let moduleCount = 0;

const traceRuntimeUrl = asDataModule(
  'export const trace = (...args) => globalThis.__loxerTraceMarker(...args);' +
    'export const __startTrace = (...args) => globalThis.__loxerStartTrace(...args);' +
    'export const __observeTraceResult = (...args) => globalThis.__loxerObserveTraceResult(...args);' +
    'export const __setTraceFunctionLength = (...args) => globalThis.__loxerSetFunctionLength(...args);'
);
const loxerRuntimeUrl = asDataModule(
  'export const Loxer = new Proxy({}, { get: (_target, property) => {' +
    'const value = globalThis.__loxerTraceLoxer[property];' +
    'return typeof value === "function" ? value.bind(globalThis.__loxerTraceLoxer) : value;' +
    '} });'
);

beforeEach(() => {
  (globalThis as any).__loxerTraceMarker = trace;
  (globalThis as any).__loxerObserveTraceResult = __observeTraceResult;
  (globalThis as any).__loxerSetFunctionLength = __setTraceFunctionLength;
  (globalThis as any).__loxerStartTrace = __startTrace;
  (globalThis as any).__loxerTraceLoxer = Loxer;
  Loxer.init({
    dev: true,
    callbacks: {
      devError(error) {
        devErrors.push(error);
      },
      devLog(log) {
        devLogs.push(log);
      },
    },
    defaultLevels: { devLevel: 2, prodLevel: 0 },
    modules: {
      TRACE: { color: '#00ff99', devLevel: 2, prodLevel: 0, fullName: 'Trace' },
      ORDER: { color: '#ffcc00', devLevel: 2, prodLevel: 0, fullName: 'Order' },
    },
  });
  devLogs = [];
  devErrors = [];
});

afterEach(() => {
  devLogs = [];
  devErrors = [];
  delete (globalThis as any).__loxerTraceMarker;
  delete (globalThis as any).__loxerObserveTraceResult;
  delete (globalThis as any).__loxerSetFunctionLength;
  delete (globalThis as any).__loxerStartTrace;
  delete (globalThis as any).__loxerTraceLoxer;
  resetLoxer();
});

test('a transformed function preserves sync result, modifier chains, and its box ID', async () => {
  const traced = await loadTracedModule(`
    function calculate(value) {
      Loxer.m('ORDER').h(true).l(2).log('calculating:' + value);
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
    modules: { TRACE: { color: '#00ff99', devLevel: 2, prodLevel: 0, fullName: 'Trace' } },
  });
  expect(devLogs.map((log) => log.message)).toEqual([
    'Loxer initialized',
    'queued()',
    'queued done',
  ]);

  devLogs = [];
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
    ['defaultLevel()', 1],
    ['defaultLevel done', 1],
  ]);

  devLogs = [];
  const historyLength = Loxer.history.length;
  const hidden = __startTrace('hiddenLevel', [], { level: 3, moduleId: 'TRACE' });
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
      Loxer.m('ORDER').l(3).log('not visible');
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
    transformLoxerTrace(`${imports()} const value = trace(() => 1);`, transformOptions())
  ).rejects.toThrow('trace() must be a standalone statement');
});

function imports(): string {
  return `import { trace } from '${traceRuntimeUrl}'; import { Loxer } from '${loxerRuntimeUrl}';`;
}

type AssertFalse<Value extends false> = Value;
type LegacyMarkerIsAbsent = 'loxed' extends keyof typeof import('../src/trace') ? true : false;
type LegacyMarkerIsNotExported = AssertFalse<LegacyMarkerIsAbsent>;

function traceFormatterTypeFixture(): void {
  function calculateTotal(quantity: number, currency: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: quantity });
  }

  trace(calculateTotal, {
    openMessage(args) {
      const exactArguments: [quantity: number, currency: string] = args;
      return `${exactArguments[0]} ${exactArguments[1]}`;
    },
    closeMessage(result) {
      const exactResult: { amount: number } = result;
      return String(exactResult.amount);
    },
  });
}

function transformOptions() {
  return {
    loxerImport: loxerRuntimeUrl,
    sourceMaps: false,
    traceImport: traceRuntimeUrl,
  };
}

async function loadTracedModule(body: string): Promise<any> {
  const result = await transformLoxerTrace(`${imports()}${body}`, transformOptions());
  if (!result?.code) {
    throw new Error('Expected Babel to emit transformed code.');
  }

  const moduleUrl = `${asDataModule(result.code)}#${moduleCount++}`;
  return import(moduleUrl);
}

function asDataModule(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
