import {
  devLogs,
  imports,
  loadTracedModule,
  resetTraceLogs,
  transformLoxerTrace,
  transformOptions,
} from './plain-function-trace.fixture';

test('the enclosing form marks a declaration, a named recursive function expression, and a block-bodied arrow', async () => {
  const traced = await loadTracedModule(`
    function load(id) {
      trace({ moduleId: 'ORDER', openMessage: 'args' });
      return 'order:' + id;
    }

    const expr = function recurse(value, total) {
      trace({ moduleId: 'TRACE', openMessage: 'args' });
      return value === 0 ? total : recurse(value - 1, total + 1);
    };

    const arrowLoad = (id) => {
      trace({ moduleId: 'ORDER', openMessage: 'args' });
      return 'arrow:' + id;
    };

    export { arrowLoad, expr, load };
  `);

  expect(traced.load('9')).toBe('order:9');
  expect(traced.expr(3, 1)).toBe(4);
  expect(traced.arrowLoad('7')).toBe('arrow:7');

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'load(9)',
    'recurse(3, 1)',
    'recurse(2, 2)',
    'recurse(1, 3)',
    'recurse(0, 4)',
    'arrowLoad(7)',
  ]);
});

test('the enclosing form marks a class method, a private method, a private field, a getter, a setter, and an object method', async () => {
  const traced = await loadTracedModule(`
    class Service {
      run(value) {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return this.#run(value);
      }
      #run(value) {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return 'ran:' + value;
      }
      #load = (value) => {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return 'loaded:' + value;
      };
      invokeLoad(value) {
        return this.#load(value);
      }
      get total() {
        trace({ moduleId: 'TRACE' });
        return 42;
      }
      set total(value) {
        trace({ moduleId: 'TRACE' });
        this._total = value;
      }
    }
    const helper = {
      compute(value) {
        trace({ moduleId: 'TRACE', openMessage: 'args' });
        return value * 2;
      },
    };
    export { helper, Service };
  `);

  const service = new traced.Service();
  expect(service.run('x')).toBe('ran:x');
  expect(service.invokeLoad('y')).toBe('loaded:y');
  expect(service.total).toBe(42);
  service.total = 5;
  expect(service._total).toBe(5);
  expect(traced.helper.compute(3)).toBe(6);

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'run(x)',
    '#run(x)',
    '#load(y)',
    'total()',
    'total()',
    'compute(3)',
  ]);
});

// `loadTracedModule` runs the emitted code through Node, but Node's own parser does not (yet)
// implement the stage-3 `accessor` class-field keyword at runtime - only Babel's parser accepts it,
// and only behind the `decoratorAutoAccessors` plugin, which `loadTracedModule` has no way to pass.
// This case therefore asserts on the emitted code directly, through `transformLoxerTrace`.
test('an accessor class field names its function the same way a plain or private field does', async () => {
  const source = `
    class Service {
      accessor load = (value) => {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return 'loaded:' + value;
      };
    }
    export { Service };
  `;
  // without the parser plugin, `accessor` does not parse at all - confirming the fixture's
  // success below actually exercises `decoratorAutoAccessors` parsing, not some unrelated path
  await expect(transformLoxerTrace(`${imports()}${source}`, transformOptions())).rejects.toThrow();

  const result = await transformLoxerTrace(`${imports()}${source}`, {
    ...transformOptions(),
    parserPlugins: ['decoratorAutoAccessors'],
  });
  // a reverted fix raises 'Cannot name the trace() target' instead of returning transformed code -
  // asserting on the emitted call itself (not just "no throw") pins the resolved name, matching a
  // plain or private field instead of falling back to the ambient default box name
  expect(result?.code).toContain('_startTrace("load"');
});

test('an inline literal assigned to a private class field reports the field name', async () => {
  const traced = await loadTracedModule(`
    class Service {
      #load = trace((value) => 'loaded:' + value, { moduleId: 'ORDER', openMessage: 'args' });
      invokeLoad(value) {
        return this.#load(value);
      }
    }
    export { Service };
  `);

  const service = new traced.Service();
  expect(service.invokeLoad('y')).toBe('loaded:y');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    '#load(y)',
  ]);
});

test('the enclosing form marks a class-property arrow, an IIFE, and a derived-class constructor', async () => {
  const traced = await loadTracedModule(`
    class Widget {
      load = (id) => {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return 'widget:' + id;
      };
    }

    const iifeResult = (function () {
      trace({ moduleId: 'TRACE' });
      return 'ran';
    })();

    class Base {
      constructor(value) {
        this.value = value;
      }
    }
    class Derived extends Base {
      constructor(value) {
        trace({ moduleId: 'TRACE' });
        super(value * 2);
        this.extra = true;
      }
    }

    export { Derived, iifeResult, Widget };
  `);

  const widget = new traced.Widget();
  expect(widget.load('3')).toBe('widget:3');
  expect(traced.iifeResult).toBe('ran');
  const derived = new traced.Derived(5);
  expect(derived.value).toBe(10);
  expect(derived.extra).toBe(true);

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'iifeResult()',
    'load(3)',
    'constructor()',
  ]);
});

test('trace() with no arguments at all defaults its options and traces the enclosing function', async () => {
  const traced = await loadTracedModule(`
    function ping() {
      trace();
      return 'pong';
    }
    export { ping };
  `);

  expect(traced.ping()).toBe('pong');
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'ping()', 'DEFAULT'],
    ['close', 'ping done', 'DEFAULT'],
  ]);
});

test("an enclosing marker in an unnamed arrow resolves through the surrounding declarator, matching the inline form's chain", async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(async () => {
      trace({ moduleId: 'ORDER' });
      return 'loaded';
    }, []);
    export { load };
  `);

  await expect(traced.load()).resolves.toBe('loaded');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'load()',
  ]);
});

test('an enclosing marker in an unnamed object-property arrow resolves through the property, including a quoted key, and through a plain assignment target', async () => {
  const traced = await loadTracedModule(`
    const handlers = {
      onClick: (event) => {
        trace({ moduleId: 'TRACE', openMessage: 'args' });
        return 'clicked:' + event;
      },
      'load-order': (value) => {
        trace({ moduleId: 'ORDER', openMessage: 'args' });
        return 'loaded:' + value;
      },
    };
    let assignedHandler;
    assignedHandler = (value) => {
      trace({ moduleId: 'ORDER', openMessage: 'args' });
      return 'assigned:' + value;
    };
    export { assignedHandler, handlers };
  `);

  expect(traced.handlers.onClick('go')).toBe('clicked:go');
  expect(traced.handlers['load-order']('z')).toBe('loaded:z');
  expect(traced.assignedHandler('x')).toBe('assigned:x');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'onClick(go)',
    'load-order(z)',
    'assignedHandler(x)',
  ]);
});

test('an explicit name option on the enclosing form overrides the surrounding declarator', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(() => {
      trace({ moduleId: 'ORDER', name: 'explicitName' });
      return 'loaded';
    });
    export { load };
  `);

  expect(traced.load()).toBe('loaded');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'explicitName()',
  ]);
});

test('the enclosing form raises the naming error when no name applies, across every name-boundary shape', async () => {
  const rejects = (source: string, options = transformOptions()) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, options)).rejects;

  await rejects(
    'function useEffect(effect) { effect(); } useEffect(() => { trace({ moduleId: "ORDER" }); });'
  ).toThrow('Cannot name the trace() target');

  await rejects('const list = [() => { trace({ moduleId: "ORDER" }); }];').toThrow(
    'Cannot name the trace() target'
  );

  await rejects(
    'const chosen = flag ? () => { trace({ moduleId: "ORDER" }); } : () => {};'
  ).toThrow('Cannot name the trace() target');

  await rejects('const a = <button onClick={() => { trace({ moduleId: "ORDER" }); }} />;', {
    ...transformOptions(),
    parserPlugins: ['jsx'],
  }).toThrow('Cannot name the trace() target');

  // logical-expression alternatives: the function is only conditionally the value produced
  await rejects('const j = cond && (() => { trace({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const k = cond || (() => { trace({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const l = cond ?? (() => { trace({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );

  // sequence expression: the function is one of several evaluated operands
  await rejects('const m = (0, (() => { trace({ moduleId: "ORDER" }); }));').toThrow(
    'Cannot name the trace() target'
  );

  // destructuring default value: the name reachable past it is the destructured binding's own
  // name, which only applies when the property is missing - not a name for the function itself
  await rejects('const { y = () => { trace({}) } } = obj;').toThrow(
    'Cannot name the trace() target'
  );

  // object spread: the name past it belongs to the object, exactly as for the array-element case.
  // The enclosing marker needs a block-bodied function literal to host it, here an IIFE.
  await rejects('const o = {...(function () { trace({}); })()};').toThrow(
    'Cannot name the trace() target'
  );

  // template interpolation: the function is coerced to a string
  await rejects('const s = `${(function () { trace({}); })()}`;').toThrow(
    'Cannot name the trace() target'
  );

  // yielded operand: `d` is whatever the generator's driver passes to the next `.next(value)`,
  // unrelated to the operand - the enclosing marker's own function is not the generator, so this
  // reaches the naming guard rather than the generator guard
  await rejects('function* g() { const d = yield (function () { trace({}); })(); }').toThrow(
    'Cannot name the trace() target'
  );

  // property read off the traced function: the name past it belongs to the property being read
  await rejects('const d = (function () { trace({}); })().foo;').toThrow(
    'Cannot name the trace() target'
  );

  // optional property read directly off the traced function: unlike the ordinary case above, this
  // reaches Babel's OptionalMemberExpression without an intervening call
  await rejects('const e = (function () { trace({}); })?.foo;').toThrow(
    'Cannot name the trace() target'
  );
});

// The MemberExpression boundary and the call-is-not-a-boundary rule (see isNameBoundary's own
// docstring in packages/babel-plugin-loxer-trace/src/plugin.ts) sit right beside legitimate name
// paths that must keep resolving. These guards prevent a future over-broad addition to the boundary
// list from clipping assignment targets, ordinary calls, constructor calls, or optional calls.
test('the MemberExpression boundary and the call-is-not-a-boundary rule leave legitimate name paths untouched', async () => {
  // guard 1: `obj.handler = ...` goes through the AssignmentExpression branch, whose `.left` is a
  // MemberExpression read by `assignedName` directly - MemberExpression becoming a walk boundary
  // must not reach into and clip that separate path.
  const assigned = await loadTracedModule(`
    const obj = {};
    obj.handler = trace((id) => id, { moduleId: 'ORDER' });
    export { obj };
  `);
  expect(assigned.obj.handler('x')).toBe('x');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'handler()',
  ]);

  resetTraceLogs();
  // guard 2: the flagship documented shape - a call is deliberately not a boundary, so the walk
  // still reads through `useCallback(trace(fn, options), deps)` on its way to the declarator, deps
  // array and all. A near-identical shape (without the deps array) is already pinned at
  // 'an inline literal is accepted as a call argument, ...' above; this asserts the exact
  // documented form.
  const useCallbackShape = await loadTracedModule(`
    function useCallback(fn, deps) { return fn; }
    const load = useCallback(trace((id) => id, { moduleId: 'ORDER' }), []);
    export { load };
  `);
  expect(useCallbackShape.load('y')).toBe('y');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'load()',
  ]);

  resetTraceLogs();
  // guard 3: an IIFE is a call too, so the enclosing form must keep reading through it up to the
  // declarator - already pinned as `iifeResult` in 'the enclosing form marks a class-property
  // arrow, an IIFE, and a derived-class constructor' above; reasserted here under its own name to
  // keep this guard block self-contained.
  await loadTracedModule(`
    const d = (function () { trace({ moduleId: 'ORDER' }); })();
    export { d };
  `);
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual(['d()']);

  resetTraceLogs();
  // NewExpression and OptionalCallExpression are deliberately transparent for the same reason as
  // ordinary calls: a traced literal passed straight to another expression still takes the name of
  // the binding that receives that expression. Pin both AST shapes for both marker forms.
  const otherTransparentCalls = await loadTracedModule(`
    class Holder {
      constructor(fn) {
        this.fn = fn;
      }
    }
    function identity(fn) { return fn; }

    const inlineConstructed = new Holder(
      trace((value) => value, { moduleId: 'ORDER' })
    );
    const enclosingConstructed = new Holder(function (value) {
      trace({ moduleId: 'ORDER' });
      return value;
    });
    const inlineOptional = identity?.(
      trace((value) => value, { moduleId: 'ORDER' })
    );
    const enclosingOptional = identity?.(function (value) {
      trace({ moduleId: 'ORDER' });
      return value;
    });

    export {
      enclosingConstructed,
      enclosingOptional,
      inlineConstructed,
      inlineOptional,
    };
  `);
  expect(otherTransparentCalls.inlineConstructed.fn('inline-new')).toBe('inline-new');
  expect(otherTransparentCalls.enclosingConstructed.fn('enclosing-new')).toBe('enclosing-new');
  expect(otherTransparentCalls.inlineOptional('inline-optional')).toBe('inline-optional');
  expect(otherTransparentCalls.enclosingOptional('enclosing-optional')).toBe('enclosing-optional');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'inlineConstructed()',
    'enclosingConstructed()',
    'inlineOptional()',
    'enclosingOptional()',
  ]);
});

test('the enclosing form rejects a marker that is not the first statement, in a nested block, at module top level, or in an expression-bodied arrow', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    'function notFirst() { const a = 1; trace({ moduleId: "TRACE" }); return a; }'
  ).toThrow('trace(options) marks the function it sits in');

  await rejects(
    'function nestedBlock() { if (true) { trace({ moduleId: "TRACE" }); } return 1; }'
  ).toThrow('trace(options) marks the function it sits in');

  await rejects('trace({ moduleId: "TRACE" });').toThrow(
    'trace(options) marks the function it sits in'
  );

  await rejects('const arrow = () => trace({ moduleId: "TRACE" });').toThrow(
    'trace(options) marks the function it sits in'
  );
});

test('the enclosing form rejects a generator host', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function* gen() { trace({ moduleId: 'TRACE' }); yield 1; }`,
      transformOptions()
    )
  ).rejects.toThrow('trace() does not support generator functions.');
});

test('the enclosing form rejects a function marked twice, beside itself and from within itself', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    'function target() { trace({ moduleId: "TRACE" }); return 1; } trace(target, { moduleId: "ORDER" });'
  ).toThrow('Function "target" has more than one trace() marker.');

  await rejects(
    'function identity(fn) { return fn; } const load = identity(trace((id) => { ' +
      'trace({ moduleId: "ORDER" }); return "x:" + id; }, { moduleId: "TRACE" }));'
  ).toThrow('Function "load" has more than one trace() marker.');
});

test('the enclosing form rejects options that read a name the marked body declares, but a parameter stays readable', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function load() { trace({ moduleId: MOD }); const MOD = 'ORDER'; return MOD; }`,
      transformOptions()
    )
  ).rejects.toThrow(
    'trace() options cannot read "MOD", which the marked function declares in its body.'
  );

  const traced = await loadTracedModule(`
    function load(moduleId) {
      trace({ moduleId, openMessage: 'args' });
      return moduleId;
    }
    export { load };
  `);
  expect(traced.load('ORDER')).toBe('ORDER');
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([['load(ORDER)', 'ORDER']]);
});

test('trace(OPTS) and trace(makeOptions()) are read as the statement form and keep its own diagnostic', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    "const OPTS = { moduleId: 'TRACE' }; function load() { trace(OPTS); return 1; }"
  ).toThrow('trace() target "OPTS" is not initialized with a function.');

  await rejects(
    "function makeOptions() { return { moduleId: 'TRACE' }; } " +
      'function load() { trace(makeOptions()); return 1; }'
  ).toThrow('trace() targets must be named function-binding identifiers.');
});

test('the enclosing form leaves this, arguments, Function.length, and self-recursion untouched by the in-place rewrite', async () => {
  const traced = await loadTracedModule(`
    function scale(value) {
      trace({ moduleId: 'TRACE' });
      return [this.factor, arguments.length, value];
    }
    const recurse = function countdown(value, total) {
      trace({ moduleId: 'TRACE', openMessage: 'args' });
      return value === 0 ? total : countdown(value - 1, total + 1);
    };
    export { recurse, scale };
  `);

  expect(traced.scale.length).toBe(1);
  expect(traced.scale.call({ factor: 4 }, 2, 3)).toEqual([4, 2, 2]);
  expect(traced.recurse.name).toBe('countdown');
  expect(traced.recurse.length).toBe(2);
  expect(traced.recurse(3, 1)).toBe(4);

  const recurseOpens = devLogs.filter(
    (log) => log.type === 'open' && log.message.startsWith('countdown')
  );
  expect(recurseOpens).toHaveLength(4);
  expect(new Set(recurseOpens.map((log) => log.id)).size).toBe(4);
});

test('an arrow host records its arguments from its own parameter list, including a destructured, a defaulted, and a rest parameter', async () => {
  const traced = await loadTracedModule(`
    const simple = (first, second) => {
      trace({ moduleId: 'TRACE', openMessage: 'args', argsAsItem: true });
      return first + second;
    };
    const defaulted = (first = 'fallback', second = 'two') => {
      trace({ moduleId: 'ORDER', openMessage: 'args', argsAsItem: true });
      return first + ':' + second;
    };
    const destructured = ({ value } = { value: 'fallback' }, [tail] = ['tail']) => {
      trace({ moduleId: 'TRACE', openMessage: 'args', argsAsItem: true });
      return value + ':' + tail;
    };
    const withRest = (first, ...rest) => {
      trace({ moduleId: 'TRACE', openMessage: 'args', argsAsItem: true });
      return [first, rest];
    };
    const d = (first = 1) => {
      trace({ moduleId: 'ORDER', openMessage: 'args', argsAsItem: true });
      return first;
    };
    export { d, defaulted, destructured, simple, withRest };
  `);

  expect(traced.simple.length).toBe(2);
  expect(traced.simple(1, 2)).toBe(3);

  expect(traced.defaulted.length).toBe(0);
  expect(traced.defaulted()).toBe('fallback:two');
  expect(traced.defaulted(undefined, 'given')).toBe('fallback:given');

  expect(traced.destructured.length).toBe(0);
  expect(traced.destructured()).toBe('fallback:tail');
  expect(traced.destructured({ value: 'actual' }, ['array'])).toBe('actual:array');

  expect(traced.withRest.length).toBe(1);
  expect(traced.withRest()).toEqual([undefined, []]);
  expect(traced.withRest('a')).toEqual(['a', []]);
  expect(traced.withRest('a', 'b', 'c')).toEqual(['a', ['b', 'c']]);

  // a defaulted parameter on the marked function itself is not a name boundary: only a default
  // value standing between the function and a name outside it (e.g. a destructuring default) is
  expect(traced.d.length).toBe(0);
  expect(traced.d()).toBe(1);
  expect(traced.d(5)).toBe(5);

  const opens = devLogs.filter((log) => log.type === 'open');
  expect(opens.map((log) => log.item)).toEqual([
    [1, 2],
    ['fallback', 'two'],
    ['fallback', 'given'],
    [{ value: 'fallback' }, ['tail']],
    [{ value: 'actual' }, ['array']],
    [undefined],
    ['a'],
    ['a', 'b', 'c'],
    [1],
    [5],
  ]);
  expect(opens.filter((log) => log.message.startsWith('d(')).map((log) => log.message)).toEqual([
    'd(1)',
    'd(5)',
  ]);
});

test('the enclosing form applies openMessage/closeMessage presets and callbacks, item capture, level, and highlight', async () => {
  const traced = await loadTracedModule(`
    function withPreset(value) {
      trace({
        moduleId: 'TRACE',
        openMessage: 'types',
        closeMessage: 'result',
        level: 'warn',
        highlight: 'all',
        argsAsItem: true,
        resultAsItem: true,
      });
      return { total: value * 2 };
    }
    function withCallback(value) {
      trace({
        moduleId: 'ORDER',
        openMessage: (args) => 'starting:' + args[0],
        closeMessage: (result) => 'finished:' + result.total,
      });
      return { total: value + 1 };
    }
    export { withCallback, withPreset };
  `);

  expect(traced.withPreset(3)).toEqual({ total: 6 });
  expect(traced.withCallback(3)).toEqual({ total: 4 });

  const [presetOpen, presetClose, callbackOpen, callbackClose] = devLogs;
  expect(presetOpen).toMatchObject({
    level: 'warn',
    highlighted: true,
    message: 'withPreset(number)',
    item: [3],
  });
  expect(presetClose).toMatchObject({
    level: 'warn',
    highlighted: true,
    message: 'withPreset done. returns: {"total":6}',
    item: { total: 6 },
  });
  expect(callbackOpen).toMatchObject({ message: 'starting:3' });
  expect(callbackClose).toMatchObject({ message: 'finished:4' });
});

test('the enclosing form preserves an async result, rethrows a thrown error unchanged, and keeps native Promise identity', async () => {
  const traced = await loadTracedModule(`
    async function submit(value) {
      trace({ moduleId: 'TRACE' });
      return value + 1;
    }
    const original = new Error('enclosing failure');
    function failSync() {
      trace({ moduleId: 'TRACE' });
      throw original;
    }
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    function loadPending() {
      trace({ moduleId: 'TRACE' });
      return pending;
    }
    export { complete, failSync, loadPending, original, pending, submit };
  `);

  await expect(traced.submit(4)).resolves.toBe(5);
  try {
    traced.failSync();
    throw new Error('Expected failSync to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  const returned = traced.loadPending();
  expect(returned).toBe(traced.pending);
  traced.complete('ready');
  await expect(returned).resolves.toBe('ready');
  await Promise.resolve();
  expect(devLogs.at(-1)).toMatchObject({ type: 'close', message: 'loadPending done' });
});

test("a direct Loxer call inside an enclosing-form body links to that invocation's box", async () => {
  const traced = await loadTracedModule(`
    function load(id) {
      trace({ moduleId: 'TRACE', openMessage: 'args' });
      Loxer.log('loading:' + id);
      return 'order:' + id;
    }
    export { load };
  `);

  expect(traced.load('4')).toBe('order:4');
  const boxId = devLogs.find((log) => log.type === 'open')?.id;
  expect(boxId).toBeDefined();
  expect(devLogs.map((log) => [log.type, log.message, log.id])).toEqual([
    ['open', 'load(4)', boxId],
    ['single', 'loading:4', boxId],
    ['close', 'load done', boxId],
  ]);
});

test("an enclosing marker nested inside another traced function opens its own box inside its parent's", async () => {
  const traced = await loadTracedModule(`
    function outer(value) {
      trace({ moduleId: 'TRACE', name: 'outer' });
      function inner(x) {
        trace({ moduleId: 'ORDER', name: 'inner' });
        return x + 1;
      }
      return inner(value) * 2;
    }
    export { outer };
  `);

  expect(traced.outer(3)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'outer()', 'TRACE'],
    ['open', 'inner()', 'ORDER'],
    ['close', 'inner done', 'ORDER'],
    ['close', 'outer done', 'TRACE'],
  ]);
});

test("the enclosing form evaluates its options once per invocation - three calls, three evaluations - unlike the other two forms' once-per-marker-evaluation timing", async () => {
  const traced = await loadTracedModule(`
    let optionsCalls = 0;
    function markOptions() {
      optionsCalls += 1;
      return 'args';
    }
    function load(id) {
      trace({ moduleId: 'TRACE', openMessage: markOptions() });
      return 'order:' + id;
    }
    export { load, optionsCalls };
  `);

  expect(traced.load('a')).toBe('order:a');
  expect(traced.load('b')).toBe('order:b');
  expect(traced.load('c')).toBe('order:c');
  expect(traced.optionsCalls).toBe(3);

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'load(a)',
    'load(b)',
    'load(c)',
  ]);
});
