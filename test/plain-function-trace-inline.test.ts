import {
  devLogs,
  imports,
  loadTracedModule,
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

const terminalLevels = ['error', 'warn', 'info', 'info'] as const;

test('an inline literal is accepted as a call argument, an immediately invoked effect/memo factory, an object property, and an array-method callback', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    function useEffect(effect) { return effect(); }
    function useMemo(factory) { return factory(); }

    const load = useCallback(trace.m('ORDER').info(async (id) => {
      Loxer.log('loading:' + id);
      return 'order:' + id;
    }));

    let effectRan;
    useEffect(trace.m('TRACE').info(() => { effectRan = 'ran'; }, { name: 'syncOrders' }));

    const memoValue = useMemo(trace.m('TRACE').info(() => 'memo-result'));

    const handlers = {
      onClick: trace.m('TRACE').info((event) => 'clicked:' + event),
    };

    let doubled;
    doubled = [5].map(trace.m('TRACE').info((value) => value * 2));

    export { doubled, effectRan, handlers, load, memoValue };
  `);

  // useEffect and useMemo invoke their traced literal immediately, at module evaluation
  expect(traced.effectRan).toBe('ran');
  expect(traced.memoValue).toBe('memo-result');
  expect(traced.doubled).toEqual([10]);

  await expect(traced.load('7')).resolves.toBe('order:7');
  expect(traced.handlers.onClick('click-event')).toBe('clicked:click-event');

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.syncOrders()',
    'orderService.memoValue()',
    'orderService.doubled()',
    'orderService.load()',
    'orderService.onClick()',
  ]);
});

test('a named FunctionExpression literal reports its own name instead of the surrounding declarator', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(trace.m('ORDER').info(function fetchOrder(id) {
      return 'order:' + id;
    }, { openMessage: 'fn(args)' }));
    export { load };
  `);

  expect(traced.load('9')).toBe('order:9');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'fetchOrder(9)',
  ]);
});

test('an explicit name option overrides the surrounding declarator for an inline literal', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(trace.m('TRACE').info(() => 'value', { name: 'explicitName' }));
    export { load };
  `);

  expect(traced.load()).toBe('value');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.explicitName()',
  ]);
});

test('an inline literal takes its name from a member-expression assignment target', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const target = {};
    target.handler = identity(trace.m('TRACE').info((value) => value + 1, { openMessage: 'fn(args)' }));
    export { target };
  `);

  expect(traced.target.handler(4)).toBe(5);
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'handler(4)',
  ]);
});

test('parent.fn names the class an inline literal is a field of, through a call and all', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn, deps) { return fn; }
    class Checkout {
      #discount = trace.m('ORDER').info((price) => price - 1, { openMessage: 'parent.fn', closeMessage: 'parent.fn',  });
      load = useCallback(trace.m('ORDER').info((id) => 'order:' + id, { openMessage: 'parent.fn', closeMessage: 'parent.fn',  }), []);
      invokeDiscount(price) {
        return this.#discount(price);
      }
    }
    export { Checkout };
  `);

  const checkout = new traced.Checkout();
  expect(checkout.invokeDiscount(10)).toBe(9);
  expect(checkout.load('9')).toBe('order:9');

  expect(devLogs.map((log) => log.message)).toEqual([
    'Checkout.#discount()',
    'Checkout.#discount done',
    'Checkout.load()',
    'Checkout.load done',
  ]);
});

test('an inline literal with no name source raises a build-time error naming the fix', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function useEffect(effect, deps) { effect(); } useEffect(trace.info(() => {}), []);`,
      transformOptions()
    )
  ).rejects.toThrow('Cannot name the trace() target');
});

test('name-boundary shapes all raise the naming error instead of borrowing a name from an inline literal', async () => {
  const rejects = (source: string, options = transformOptions()) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, options)).rejects;

  // bare statement position: no assignment wraps the call that receives the literal
  await rejects(
    'function useEffect(effect) { effect(); } useEffect(trace.info(() => {}));'
  ).toThrow('Cannot name the trace() target');

  // array element
  await rejects('const list = [trace.info(() => {})];').toThrow('Cannot name the trace() target');

  // conditional (ternary) branch
  await rejects('const chosen = flag ? trace.info(() => {}) : trace.info(() => {});').toThrow(
    'Cannot name the trace() target'
  );

  // JSX node/attribute
  await rejects('const a = <button onClick={trace.info(() => {})} />;', {
    ...transformOptions(),
    parserPlugins: ['jsx'],
  }).toThrow('Cannot name the trace() target');

  // logical-expression alternatives: the function is only conditionally the value produced
  await rejects('const f = cond && trace.info(() => {});').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const g = cond || trace.info(() => {});').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const h = cond ?? trace.info(() => {});').toThrow(
    'Cannot name the trace() target'
  );

  // sequence expression: the function is one of several evaluated operands
  await rejects('const i = (0, trace.info(() => {}));').toThrow('Cannot name the trace() target');

  // destructuring default value: the name reachable past it is the destructured binding's own
  // name, which only applies when the property is missing - not a name for the function itself
  await rejects('const { x = trace.info(() => {}) } = obj;').toThrow(
    'Cannot name the trace() target'
  );

  // object spread: the name past it belongs to the object, exactly as for the array-element case
  await rejects('const o = {...trace.info(function () {}, {})};').toThrow(
    'Cannot name the trace() target'
  );

  // template interpolation: the function is coerced to a string
  await rejects('const s = `${trace.info(function () {}, {})}`;').toThrow(
    'Cannot name the trace() target'
  );

  // yielded operand: `d` is whatever the generator's driver passes to the next `.next(value)`,
  // unrelated to the operand
  await rejects('function* g() { const d = yield trace.info(function () {}, {}); }').toThrow(
    'Cannot name the trace() target'
  );

  // property read off the traced function: the name past it belongs to the property being read
  await rejects('const d = trace.info(function () {}, {}).foo;').toThrow(
    'Cannot name the trace() target'
  );

  // optional property read off the traced function: the optional-member node is its own Babel
  // shape and must stop the walk just like an ordinary member read
  await rejects('const e = trace.info(function () {}, {})?.foo;').toThrow(
    'Cannot name the trace() target'
  );

  // An explicit name rescues any of these, shown here on one shape: the name option is read before
  // the walk runs at all, so which boundary stopped the walk cannot matter.
  const traced = await loadTracedModule(`
    const cond = true;
    const f = cond && trace.m('ORDER').info((id) => id, { name: 'loadOrder' });
    export { f };
  `);
  expect(traced.f('x')).toBe('x');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.loadOrder()',
  ]);
});

test('an inline literal name option must be a string literal, not a computed identifier value', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} const label = 'dynamic'; function useCallback(fn) { return fn; } ` +
        'const load = useCallback(trace.info(() => {}, { name: label }));',
      transformOptions()
    )
  ).rejects.toThrow('trace() name must be a string literal.');
});

test('inline literals preserve sync, async, promise-returning, and throwing results', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const original = new Error('inline failure');
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });

    const sync = identity(trace.m('TRACE').info((value) => value * 2));
    const asyncFn = identity(trace.m('TRACE').info(async (value) => value + 1));
    const promiseReturning = identity(trace.m('TRACE').info(() => pending));
    const throwing = identity(trace.m('TRACE').info(() => { throw original; }));

    export { asyncFn, complete, original, pending, promiseReturning, sync, throwing };
  `);

  expect(traced.sync(3)).toBe(6);
  await expect(traced.asyncFn(3)).resolves.toBe(4);

  const returned = traced.promiseReturning();
  expect(returned).toBe(traced.pending);
  traced.complete('ready');
  await expect(returned).resolves.toBe('ready');
  await Promise.resolve();

  try {
    traced.throwing();
    throw new Error('Expected throwing to throw.');
  } catch (error) {
    expect(error).toBe(traced.original);
  }

  expect(devLogs.filter((log) => log.type === 'close').map((log) => log.message)).toEqual(
    expect.arrayContaining([
      'sync done',
      'asyncFn done',
      'throwing failed',
      'promiseReturning done',
    ])
  );
});

test('an inline literal marker inside a factory function re-evaluates its options once per marker evaluation, not per call of the traced function', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    let optionsCalls = 0;
    function makeOptions(label) {
      optionsCalls += 1;
      return { moduleId: 'TRACE', openMessage: 'fn(args)' };
    }
    function makeTraced(label) {
      const handler = identity(trace.info((value) => label + ':' + value, makeOptions(label)));
      return handler;
    }
    export { makeTraced, optionsCalls };
  `);

  const alpha = traced.makeTraced('alpha');
  expect(alpha('a')).toBe('alpha:a');
  expect(alpha('b')).toBe('alpha:b');
  expect(traced.optionsCalls).toBe(1);

  const beta = traced.makeTraced('beta');
  expect(beta('c')).toBe('beta:c');
  expect(traced.optionsCalls).toBe(2);

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'handler(a)',
    'handler(b)',
    'handler(c)',
  ]);
});

test.each(directModuleSelectorCases)(
  'every terminal transforms a $name selector for an inline literal',
  async ({ marker, moduleId }) => {
    const traced = await loadTracedModule(`
      const selected = 'TRACE';
      function identity(fn) { return fn; }
      const atError = identity(${marker}.error(() => 'error'));
      const atWarn = identity(${marker}.warn(() => 'warn'));
      const atLog = identity(${marker}.log(() => 'log'));
      const atInfo = identity(${marker}.info(() => 'info'));
      const atDebug = identity(${marker}.debug(() => 'debug'));
      export { atDebug, atError, atInfo, atLog, atWarn };
    `);

    expect([
      traced.atError(),
      traced.atWarn(),
      traced.atLog(),
      traced.atInfo(),
      traced.atDebug(),
    ]).toEqual(['error', 'warn', 'log', 'info', 'debug']);
    expect(devLogs.map((log) => [log.level, log.moduleId])).toEqual(
      terminalLevels.flatMap((level) => [
        [level, moduleId],
        [level, moduleId],
      ])
    );
  }
);

test('an inline marker evaluates fluent arguments once per factory evaluation in source order', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function identity(fn) { return fn; }
    function makeHandler() {
      return identity(trace.m(mark('module', 'TRACE')).props(mark('props', 'args'))
        .info((value) => value + 1, {
          name: 'handler',
          openMessage: mark('options', 'fn(args)'),
        }));
    }
    export { makeHandler, order };
  `);

  const first = traced.makeHandler();
  expect(traced.order).toEqual(['module', 'props', 'options']);
  expect(first(1)).toBe(2);
  expect(traced.order).toEqual(['module', 'props', 'options']);

  const second = traced.makeHandler();
  expect(second(2)).toBe(3);
  expect(traced.order).toEqual(['module', 'props', 'options', 'module', 'props', 'options']);
});

test('an inline computed module evaluates once per factory evaluation in modifier order', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function identity(fn) { return fn; }
    function makeHandler() {
      return identity(trace.h(mark('highlight', true))[mark('module', 'TRACE')]
        .info((value) => value + 1, {
          name: 'handler',
          openMessage: mark('options', 'fn(args)'),
        }));
    }
    export { makeHandler, order };
  `);

  const first = traced.makeHandler();
  expect(traced.order).toEqual(['highlight', 'module', 'options']);
  expect(first(1)).toBe(2);
  expect(first(2)).toBe(3);
  expect(traced.order).toEqual(['highlight', 'module', 'options']);

  const second = traced.makeHandler();
  expect(second(3)).toBe(4);
  expect(traced.order).toEqual([
    'highlight',
    'module',
    'options',
    'highlight',
    'module',
    'options',
  ]);
  expect(devLogs.map((log) => log.moduleId)).toEqual([
    'TRACE',
    'TRACE',
    'TRACE',
    'TRACE',
    'TRACE',
    'TRACE',
  ]);
});

test('two inline markers in one nested scope get separate hoisted option slots', async () => {
  const source = `
    function identity(fn) { return fn; }
    function makeHandlers(labelA, labelB) {
      const handlerA = identity(trace.m('TRACE').info((value) => labelA + ':' + value, { openMessage: 'fn(args)' }));
      const handlerB = identity(trace.m('ORDER').info((value) => labelB + ':' + value, { openMessage: 'fn(args)' }));
      return { handlerA, handlerB };
    }
    export { makeHandlers };
  `;

  const emitted = await transformLoxerTrace(`${imports()}${source}`, transformOptions());
  const emittedCode = emitted?.code ?? '';
  const optionsIds = [...new Set(emittedCode.match(/_handler[AB]TraceOptions\d*/g))].sort();
  expect(optionsIds).toHaveLength(2);
  expect(emittedCode).toContain(`var ${optionsIds.join(', ')};`);

  const traced = await loadTracedModule(source);
  const first = traced.makeHandlers('one', 'two');
  const second = traced.makeHandlers('three', 'four');

  expect(first.handlerA('a')).toBe('one:a');
  expect(first.handlerB('b')).toBe('two:b');
  expect(second.handlerA('c')).toBe('three:c');
  expect(second.handlerB('d')).toBe('four:d');

  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([
    ['handlerA(a)', 'TRACE'],
    ['handlerB(b)', 'ORDER'],
    ['handlerA(c)', 'TRACE'],
    ['handlerB(d)', 'ORDER'],
  ]);
});

test('an inline literal rejects a generator function', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function useCallback(fn) { return fn; } ` +
        "const load = useCallback(trace.info(function* () { yield 1; }, { moduleId: 'TRACE' }));",
      transformOptions()
    )
  ).rejects.toThrow('trace() does not support generator functions.');
});

test('a locally shadowed trace binding is left untouched by the inline-marker transform', async () => {
  const traced = await loadTracedModule(`
    function useShadowed() {
      function trace(fn) { return fn; }
      function useCallback(fn) { return fn; }
      return useCallback(trace((value) => value * 2));
    }
    export { useShadowed };
  `);

  const handler = traced.useShadowed();
  expect(handler(3)).toBe(6);
  expect(devLogs).toEqual([]);
});

// The two remaining preserved rejections - an identifier target and an array-literal target in
// expression position, both still needing 'trace() must be a standalone statement...' - are
// already pinned by 'the transform removes the marker and reports unsupported marker forms' and
// 'the transform removes target-list markers and reports unsupported list forms' above; a literal
// target in that position is now the inline form's job instead, which is why those tests use an
// identifier and an array of identifiers rather than a literal.

test("an inline literal nested inside another inline literal opens its own box inside its parent's", async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const outer = identity(trace.m('TRACE').info((value) => {
      const inner = identity(trace.m('ORDER').info((x) => x + 1, { name: 'inner' }));
      return inner(value) * 2;
    }, { name: 'outer' }));
    export { outer };
  `);

  expect(traced.outer(3)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'orderService.outer()', 'TRACE'],
    ['open', 'orderService.inner()', 'ORDER'],
    ['close', 'inner done', 'ORDER'],
    ['close', 'outer done', 'TRACE'],
  ]);
  const [outerLog, innerLog] = devLogs;
  expect(innerLog.id).not.toBe(outerLog.id);
});

test("an inline literal nested inside a statement-form target's body opens its own box inside its parent's", async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    function outer(value) {
      const inner = identity(trace.m('ORDER').info((x) => x + 1, { name: 'inner' }));
      return inner(value) * 2;
    }
    trace.m('TRACE').info(outer);
    export { outer };
  `);

  expect(traced.outer(3)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'orderService.outer()', 'TRACE'],
    ['open', 'orderService.inner()', 'ORDER'],
    ['close', 'inner done', 'ORDER'],
    ['close', 'outer done', 'TRACE'],
  ]);
});

test("a direct Loxer call inside an inline literal links to that invocation's box", async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const load = identity(trace.m('TRACE').info((id) => {
      Loxer.log('loading:' + id);
      return 'order:' + id;
    }, { openMessage: 'fn(args)' }));
    export { load };
  `);

  expect(traced.load('9')).toBe('order:9');
  const boxId = devLogs.find((log) => log.type === 'open')?.id;
  expect(boxId).toBeDefined();
  expect(devLogs.map((log) => [log.type, log.message, log.id])).toEqual([
    ['open', 'load(9)', boxId],
    ['single', 'loading:9', boxId],
    ['close', 'load done', boxId],
  ]);
});

test('an inline arrow literal keeps lexical this while a function-expression literal takes this from the call site', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    function createArrowHandler() {
      return identity(trace.m('TRACE').info((value) => this.factor * value, { name: 'arrowHandler' }));
    }
    const funcHandler = identity(trace.m('ORDER').info(function (value) {
      return this.factor * value;
    }));
    export { createArrowHandler, funcHandler };
  `);

  const arrowHandler = traced.createArrowHandler.call({ factor: 3 });
  expect(arrowHandler(2)).toBe(6);
  expect(traced.funcHandler.call({ factor: 5 }, 2)).toBe(10);
  expect(devLogs.filter((log) => log.type === 'close')).toHaveLength(2);
});

test('a function-expression literal keeps real arguments and both literal kinds preserve Function.length', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const funcHandler = identity(trace.m('TRACE').info(function (first) {
      return [arguments.length, first];
    }));
    const arrowHandler = identity(trace.m('ORDER').info((first, second) => first + second));
    export { arrowHandler, funcHandler };
  `);

  expect(traced.funcHandler.length).toBe(1);
  expect(traced.funcHandler(1, 2, 3)).toEqual([3, 1]);
  expect(traced.arrowHandler.length).toBe(2);
  expect(traced.arrowHandler(2, 3)).toBe(5);
});

test('the length-restoring helper is emitted only for an inline arrow with a required parameter', async () => {
  const zeroParam = await transformLoxerTrace(
    `${imports()} const z = trace.m('ORDER').info(() => 1); export { z };`,
    transformOptions()
  );
  expect(zeroParam?.code).not.toContain('withTraceFunctionLength');

  const oneParam = await transformLoxerTrace(
    `${imports()} const w = trace.m('ORDER').info((id) => id); export { w };`,
    transformOptions()
  );
  expect(oneParam?.code).toContain('withTraceFunctionLength');

  const traced = await loadTracedModule(`
    const z = trace.m('ORDER').info(() => 1);
    const w = trace.m('ORDER').info((id) => id);
    export { w, z };
  `);
  expect(traced.z.length).toBe(0);
  expect(traced.w.length).toBe(1);
  expect(traced.z()).toBe(1);
  expect(traced.w('x')).toBe('x');
});

test('a named function-expression literal re-enters its own box on recursive self-reference', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const expression = identity(trace.m('TRACE').info(function recurse(value, total) {
      return value === 0 ? total : recurse(value - 1, total + 1);
    }, { openMessage: 'fn(args)' }));
    export { expression };
  `);

  expect(traced.expression.name).toBe('recurse');
  expect(traced.expression(3, 1)).toBe(4);

  const opens = devLogs.filter((log) => log.type === 'open');
  const closes = devLogs.filter((log) => log.type === 'close');
  expect(opens).toHaveLength(4);
  expect(closes).toHaveLength(4);
  expect(opens.every((log) => log.message.startsWith('recurse'))).toBe(true);
  expect(new Set(opens.map((log) => log.id)).size).toBe(4);
});
