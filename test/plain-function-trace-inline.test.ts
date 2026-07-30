import {
  devLogs,
  imports,
  loadTracedModule,
  transformLoxerTrace,
  transformOptions,
} from './plain-function-trace.fixture';

test('an inline literal is accepted as a call argument, an immediately invoked effect/memo factory, an object property, and an array-method callback', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    function useEffect(effect) { return effect(); }
    function useMemo(factory) { return factory(); }

    const load = useCallback(trace(async (id) => {
      Loxer.log('loading:' + id);
      return 'order:' + id;
    }, { moduleId: 'ORDER' }));

    let effectRan;
    useEffect(trace(() => { effectRan = 'ran'; }, { moduleId: 'TRACE', name: 'syncOrders' }));

    const memoValue = useMemo(trace(() => 'memo-result', { moduleId: 'TRACE' }));

    const handlers = {
      onClick: trace((event) => 'clicked:' + event, { moduleId: 'TRACE' }),
    };

    let doubled;
    doubled = [5].map(trace((value) => value * 2, { moduleId: 'TRACE' }));

    export { doubled, effectRan, handlers, load, memoValue };
  `);

  // useEffect and useMemo invoke their traced literal immediately, at module evaluation
  expect(traced.effectRan).toBe('ran');
  expect(traced.memoValue).toBe('memo-result');
  expect(traced.doubled).toEqual([10]);

  await expect(traced.load('7')).resolves.toBe('order:7');
  expect(traced.handlers.onClick('click-event')).toBe('clicked:click-event');

  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'syncOrders()',
    'memoValue()',
    'doubled()',
    'load()',
    'onClick()',
  ]);
});

test('a named FunctionExpression literal reports its own name instead of the surrounding declarator', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(trace(function fetchOrder(id) {
      return 'order:' + id;
    }, { moduleId: 'ORDER', openMessage: 'args' }));
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
    const load = useCallback(trace(() => 'value', { moduleId: 'TRACE', name: 'explicitName' }));
    export { load };
  `);

  expect(traced.load()).toBe('value');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'explicitName()',
  ]);
});

test('an inline literal takes its name from a member-expression assignment target', async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const target = {};
    target.handler = identity(trace((value) => value + 1, { moduleId: 'TRACE', openMessage: 'args' }));
    export { target };
  `);

  expect(traced.target.handler(4)).toBe(5);
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'handler(4)',
  ]);
});

test('an inline literal with no name source raises a build-time error naming the fix', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function useEffect(effect, deps) { effect(); } useEffect(trace(() => {}), []);`,
      transformOptions()
    )
  ).rejects.toThrow('Cannot name the trace() target');
});

test('name-boundary shapes all raise the naming error instead of borrowing a name from an inline literal', async () => {
  const rejects = (source: string, options = transformOptions()) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, options)).rejects;

  // bare statement position: no assignment wraps the call that receives the literal
  await rejects('function useEffect(effect) { effect(); } useEffect(trace(() => {}));').toThrow(
    'Cannot name the trace() target'
  );

  // array element
  await rejects('const list = [trace(() => {})];').toThrow('Cannot name the trace() target');

  // conditional (ternary) branch
  await rejects('const chosen = flag ? trace(() => {}) : trace(() => {});').toThrow(
    'Cannot name the trace() target'
  );

  // JSX node/attribute
  await rejects('const a = <button onClick={trace(() => {})} />;', {
    ...transformOptions(),
    parserPlugins: ['jsx'],
  }).toThrow('Cannot name the trace() target');

  // logical-expression alternatives: the function is only conditionally the value produced
  await rejects('const f = cond && trace(() => {});').toThrow('Cannot name the trace() target');
  await rejects('const g = cond || trace(() => {});').toThrow('Cannot name the trace() target');
  await rejects('const h = cond ?? trace(() => {});').toThrow('Cannot name the trace() target');

  // sequence expression: the function is one of several evaluated operands
  await rejects('const i = (0, trace(() => {}));').toThrow('Cannot name the trace() target');

  // destructuring default value: the name reachable past it is the destructured binding's own
  // name, which only applies when the property is missing - not a name for the function itself
  await rejects('const { x = trace(() => {}) } = obj;').toThrow('Cannot name the trace() target');

  // object spread: the name past it belongs to the object, exactly as for the array-element case
  await rejects('const o = {...trace(function () {}, {})};').toThrow(
    'Cannot name the trace() target'
  );

  // template interpolation: the function is coerced to a string
  await rejects('const s = `${trace(function () {}, {})}`;').toThrow(
    'Cannot name the trace() target'
  );

  // yielded operand: `d` is whatever the generator's driver passes to the next `.next(value)`,
  // unrelated to the operand
  await rejects('function* g() { const d = yield trace(function () {}, {}); }').toThrow(
    'Cannot name the trace() target'
  );

  // property read off the traced function: the name past it belongs to the property being read
  await rejects('const d = trace(function () {}, {}).foo;').toThrow(
    'Cannot name the trace() target'
  );

  // optional property read off the traced function: the optional-member node is its own Babel
  // shape and must stop the walk just like an ordinary member read
  await rejects('const e = trace(function () {}, {})?.foo;').toThrow(
    'Cannot name the trace() target'
  );

  // An explicit name rescues any of these, shown here on one shape: the name option is read before
  // the walk runs at all, so which boundary stopped the walk cannot matter.
  const traced = await loadTracedModule(`
    const cond = true;
    const f = cond && trace((id) => id, { moduleId: 'ORDER', name: 'loadOrder' });
    export { f };
  `);
  expect(traced.f('x')).toBe('x');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'loadOrder()',
  ]);
});

test('an inline literal name option must be a string literal, not a computed identifier value', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} const label = 'dynamic'; function useCallback(fn) { return fn; } ` +
        'const load = useCallback(trace(() => {}, { name: label }));',
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

    const sync = identity(trace((value) => value * 2, { moduleId: 'TRACE' }));
    const asyncFn = identity(trace(async (value) => value + 1, { moduleId: 'TRACE' }));
    const promiseReturning = identity(trace(() => pending, { moduleId: 'TRACE' }));
    const throwing = identity(trace(() => { throw original; }, { moduleId: 'TRACE' }));

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
      return { moduleId: 'TRACE', openMessage: 'args' };
    }
    function makeTraced(label) {
      const handler = identity(trace((value) => label + ':' + value, makeOptions(label)));
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

test('two inline markers in one nested scope get separate hoisted option slots', async () => {
  const source = `
    function identity(fn) { return fn; }
    function makeHandlers(labelA, labelB) {
      const handlerA = identity(trace((value) => labelA + ':' + value, { moduleId: 'TRACE', openMessage: 'args' }));
      const handlerB = identity(trace((value) => labelB + ':' + value, { moduleId: 'ORDER', openMessage: 'args' }));
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
        "const load = useCallback(trace(function* () { yield 1; }, { moduleId: 'TRACE' }));",
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
    const outer = identity(trace((value) => {
      const inner = identity(trace((x) => x + 1, { moduleId: 'ORDER', name: 'inner' }));
      return inner(value) * 2;
    }, { moduleId: 'TRACE', name: 'outer' }));
    export { outer };
  `);

  expect(traced.outer(3)).toBe(8);
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'outer()', 'TRACE'],
    ['open', 'inner()', 'ORDER'],
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
      const inner = identity(trace((x) => x + 1, { moduleId: 'ORDER', name: 'inner' }));
      return inner(value) * 2;
    }
    trace(outer, { moduleId: 'TRACE' });
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

test("a direct Loxer call inside an inline literal links to that invocation's box", async () => {
  const traced = await loadTracedModule(`
    function identity(fn) { return fn; }
    const load = identity(trace((id) => {
      Loxer.log('loading:' + id);
      return 'order:' + id;
    }, { moduleId: 'TRACE', openMessage: 'args' }));
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
      return identity(trace((value) => this.factor * value, { moduleId: 'TRACE', name: 'arrowHandler' }));
    }
    const funcHandler = identity(trace(function (value) {
      return this.factor * value;
    }, { moduleId: 'ORDER' }));
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
    const funcHandler = identity(trace(function (first) {
      return [arguments.length, first];
    }, { moduleId: 'TRACE' }));
    const arrowHandler = identity(trace((first, second) => first + second, { moduleId: 'ORDER' }));
    export { arrowHandler, funcHandler };
  `);

  expect(traced.funcHandler.length).toBe(1);
  expect(traced.funcHandler(1, 2, 3)).toEqual([3, 1]);
  expect(traced.arrowHandler.length).toBe(2);
  expect(traced.arrowHandler(2, 3)).toBe(5);
});

test('the length-restoring helper is emitted only for an inline arrow with a required parameter', async () => {
  const zeroParam = await transformLoxerTrace(
    `${imports()} const z = trace(() => 1, { moduleId: 'ORDER' }); export { z };`,
    transformOptions()
  );
  expect(zeroParam?.code).not.toContain('withTraceFunctionLength');

  const oneParam = await transformLoxerTrace(
    `${imports()} const w = trace((id) => id, { moduleId: 'ORDER' }); export { w };`,
    transformOptions()
  );
  expect(oneParam?.code).toContain('withTraceFunctionLength');

  const traced = await loadTracedModule(`
    const z = trace(() => 1, { moduleId: 'ORDER' });
    const w = trace((id) => id, { moduleId: 'ORDER' });
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
    const expression = identity(trace(function recurse(value, total) {
      return value === 0 ? total : recurse(value - 1, total + 1);
    }, { moduleId: 'TRACE', openMessage: 'args' }));
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
