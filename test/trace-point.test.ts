import { outputFromCallbacks } from './output-capture';
import {
  __tracePoint,
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

function initializePointOutput(reset: boolean = true, resetLogs: boolean = true): void {
  if (reset) {
    resetLoxer();
  }
  Loxer.init({
    dev: true,
    defaultLevels: { devLevel: 'debug', prodLevel: 'error' },
    output: outputFromCallbacks({
      devError: (error) => devErrors.push(error),
      devLog: (log) => devLogs.push(log),
    }),
    modules: {
      HIDDEN: { color: '#444', devLevel: 'error', prodLevel: 'error', fullName: 'Hidden' },
      ORDER: { color: '#ffcc00', devLevel: 'debug', prodLevel: 'error', fullName: 'Order' },
      PROJECTS: { color: '#00f', devLevel: 'debug', prodLevel: 'error', fullName: 'Projects' },
      props: { color: '#0ff', devLevel: 'debug', prodLevel: 'error', fullName: 'Props' },
      TRACE: { color: '#00ff99', devLevel: 'debug', prodLevel: 'error', fullName: 'Trace' },
    },
  });
  if (resetLogs) {
    resetTraceLogs();
  }
}

async function transformPointCode(body: string): Promise<string> {
  const result = await transformLoxerTrace(`${imports()}${body}`, transformOptions());
  if (!result?.code) {
    throw new Error('Expected Babel to emit transformed code.');
  }

  return result.code;
}

test('transforms point terminals, selector routing, direct modules, and empty props printing', async () => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    function save(order) {
      const moduleId = 'props';
      trace.point.PROJECTS.h().pp().info('fn', 'saved', order);
      trace.point.props.warn('parent.fn', 'retrying', order);
      trace.point[moduleId].info('fn', 'computed', order);
      trace['point'].m('ORDER').debug();
      trace.point.error('fn', 'failed', order);
      return order.id;
    }
    export { save };
  `);

  const order = { id: 7 };
  expect(traced.save(order)).toBe(7);
  expect(devLogs.map((log) => [log.level, log.moduleId, log.message])).toEqual([
    ['info', 'PROJECTS', 'save(): saved'],
    ['warn', 'props', 'orderService.save(): retrying'],
    ['info', 'props', 'save(): computed'],
    ['debug', 'ORDER', 'orderService.save()'],
    ['error', 'NONE', 'save(): failed'],
  ]);
  expect(devLogs[0]).toMatchObject({ highlighted: true, printProps: {}, props: [order] });
  expect(devLogs[0].messageSpans.map((span) => span.kind)).toEqual(['fn']);
  expect(devLogs[1].messageSpans.map((span) => span.kind)).toEqual(['parent', 'fn']);
  expect(devLogs[3].messageSpans.map((span) => span.kind)).toEqual(['parent', 'fn']);
  expect(devErrors).toEqual([]);
});

test.each([
  {
    chain:
      "m(mark('module', 'ORDER')).highlight(mark('highlight', true)).pp(mark('printer', { depth: 1 })).info(mark('selector', 'fn'), mark('message', 'saved'), ...mark('terminal spread', [prop]))",
    expectedOrder: ['module', 'highlight', 'printer', 'selector', 'message', 'terminal spread'],
  },
  {
    chain:
      "printProps(...mark('printer spread', [{ depth: 1 }])).module(...mark('module spread', ['ORDER'])).h(...mark('highlight spread', [true])).warn(...mark('terminal spread', ['fn', 'saved', prop]))",
    expectedOrder: ['printer spread', 'module spread', 'highlight spread', 'terminal spread'],
  },
  {
    chain:
      "h(mark('highlight', true)).m(mark('module', 'ORDER')).printProps(mark('printer', { depth: 1 })).debug(mark('message', 'saved'), mark('prop', prop))",
    expectedOrder: ['highlight', 'module', 'printer', 'message', 'prop'],
  },
] as const)(
  'evaluates modifier and terminal expressions once in source order: $chain',
  async ({ chain, expectedOrder }) => {
    initializePointOutput();
    const traced = await loadTracedModule(`
      const order = [];
      function mark(name, value) { order.push(name); return value; }
      function save() {
        const prop = { id: 7 };
        trace.point.${chain};
        return { order, prop };
      }
      export { save };
    `);

    const result = traced.save();
    expect(result.order).toEqual(expectedOrder);
    expect(new Set(result.order).size).toBe(expectedOrder.length);
    expect(devLogs).toHaveLength(1);
    expect(devLogs[0]).toMatchObject({
      moduleId: 'ORDER',
      highlighted: true,
      printProps: { depth: 1 },
    });
    expect(devLogs[0].props).toEqual([result.prop]);
  }
);

test('applies JavaScript defaults to omitted and runtime-undefined modifier arguments', async () => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    function explicitDefaults(prop) {
      const missing = void 0;
      trace.point.module(missing).highlight(missing).printProps(missing).info('saved', prop);
    }
    function omittedDefaults(undefined, prop) {
      trace.point.m().h().pp().warn('saved', prop);
    }
    export { explicitDefaults, omittedDefaults };
  `);
  const first = { id: 1 };
  const second = { id: 2 };

  traced.explicitDefaults(first);
  traced.omittedDefaults('hostile undefined binding', second);

  expect(devLogs).toHaveLength(2);
  expect(devLogs[0]).toMatchObject({
    highlighted: true,
    moduleId: 'DEFAULT',
    printProps: {},
    props: [first],
  });
  expect(devLogs[1]).toMatchObject({
    highlighted: true,
    moduleId: 'DEFAULT',
    printProps: {},
    props: [second],
  });
});

test('generated helpers ignore hostile names while a shadowed trace binding stays ordinary code', async () => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    const _tracePoint = () => { throw new Error('captured program helper'); };
    const _tracePoint2 = () => { throw new Error('captured program helper 2'); };
    function save(_tracePoint3, undefined) {
      trace.point.info('fn', 'saved');
      return [_tracePoint3, undefined];
    }
    function local() {
      const trace = { point: { info: (message) => 'local:' + message } };
      return trace.point.info('saved');
    }
    export { local, save };
  `);

  expect(traced.save('local helper', 'local undefined')).toEqual([
    'local helper',
    'local undefined',
  ]);
  expect(traced.local()).toBe('local:saved');
  expect(devLogs.map((log) => log.message)).toEqual(['save(): saved']);
});

test.each([
  { selector: 'fn', message: 'save(): saved', propsStart: 1 },
  { selector: 'parent.fn', message: 'orderService.save(): saved', propsStart: 1 },
  { selector: 'fn(types)', message: 'fn(types)', propsStart: 0 },
  { selector: 'parent.fn ', message: 'parent.fn ', propsStart: 0 },
  { selector: 'FN', message: 'FN', propsStart: 0 },
] as const)(
  'routes the runtime selector value $selector only on an exact match',
  async ({ selector, message, propsStart }) => {
    initializePointOutput();
    const traced = await loadTracedModule(`
      function save(selector, prop) {
        trace.point.info(selector, 'saved', prop);
      }
      export { save };
    `);
    const prop = { id: 7 };

    traced.save(selector, prop);

    expect(devLogs).toHaveLength(1);
    expect(devLogs[0].message).toBe(message);
    expect(devLogs[0].props).toEqual(propsStart === 1 ? [prop] : ['saved', prop]);
  }
);

test.each([
  ['error', 'error'],
  ['warn', 'warn'],
  ['log', 'info'],
  ['info', 'info'],
  ['debug', 'debug'],
] as const)('routes point.%s through one normal-stream %s log', async (terminal, level) => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    function save(message, prop) {
      trace.point.${terminal}(message, prop);
    }
    export { save };
  `);
  const message = { status: 'saved' };
  const prop = { id: 7 };

  traced.save(message, prop);

  expect(devLogs).toHaveLength(1);
  expect(devLogs[0]).toMatchObject({ level, props: [prop], type: 'single' });
  expect(devLogs[0].message).toBe("{ status: 'saved' }");
  expect(devErrors).toEqual([]);
  expect(Loxer.history[0]).toBe(devLogs[0]);
});

test('routes callbacks end to end, keeps props, falls back once, and never renders hidden callbacks', async () => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    let callbackCalls = 0;
    let hiddenCalls = 0;
    let fallbackCalls = 0;
    function save(order) {
      trace.point.pp({ depth: 1 }).info(({ parentFn }) => {
        callbackCalls += 1;
        return 'retry ' + parentFn(order.id);
      }, order);
      trace.point.HIDDEN.debug(() => {
        hiddenCalls += 1;
        return 'must stay lazy';
      }, order);
      trace.point.warn(() => {
        fallbackCalls += 1;
        throw new Error('formatter failed');
      }, order);
      trace.point.error(({ fn }) => fn('failed'), order);
    }
    export { callbackCalls, fallbackCalls, hiddenCalls, save };
  `);
  const order = { id: 7 };

  traced.save(order);

  expect([traced.callbackCalls, traced.fallbackCalls, traced.hiddenCalls]).toEqual([1, 1, 0]);
  expect(devLogs.map((log) => [log.level, log.message])).toEqual([
    ['info', 'retry orderService.save(7)'],
    ['warn', 'save()'],
    ['error', 'save(failed)'],
  ]);
  expect(devLogs.map((log) => log.props)).toEqual([[order], [order], [order]]);
  expect(devLogs[0].printProps).toEqual({ depth: 1 });
  expect(devLogs[0].messageSpans.map((span) => span.kind)).toEqual(['parent', 'fn', 'value']);
  expect(devLogs[1].messageSpans.map((span) => span.kind)).toEqual(['fn']);
  expect(devErrors).toEqual([]);
});

test('hidden and disabled points stay lazy and reset one-shot logger state', () => {
  initializePointOutput();
  let hiddenCalls = 0;
  Loxer.h().m('ORDER').pp({ depth: 1 });
  __tracePoint(
    { hasModule: true, level: 'debug', moduleId: 'HIDDEN' },
    'save',
    'Orders',
    undefined,
    () => {
      hiddenCalls += 1;
      return 'hidden';
    }
  );
  Loxer.info('after hidden');

  expect(hiddenCalls).toBe(0);
  expect(devLogs).toHaveLength(1);
  expect(devLogs[0]).toMatchObject({
    highlighted: false,
    message: 'after hidden',
    moduleId: 'NONE',
    printProps: undefined,
  });

  resetLoxer();
  resetTraceLogs();
  Loxer.init({
    config: { disabled: true },
    dev: true,
    output: outputFromCallbacks({ devLog: (log) => devLogs.push(log) }),
  });
  __tracePoint({}, 'disabled', undefined, undefined, () => {
    hiddenCalls += 1;
    return 'disabled';
  });
  expect(hiddenCalls).toBe(0);
  expect(devLogs).toEqual([]);
  expect(Loxer.history).toEqual([]);
});

test('points join only their own visible lexical trace box and never open another box', async () => {
  initializePointOutput();
  const traced = await loadTracedModule(`
    let hiddenCalls = 0;
    function standalone() {
      trace.point.info('fn', 'standalone');
    }
    function outer() {
      trace.point.info('fn', 'outer');
      function inner() {
        trace.point.info('fn', 'inner');
      }
      inner();
    }
    trace.m('TRACE').info(outer);
    function visibleBox() {
      trace.point.HIDDEN.debug(() => {
        hiddenCalls += 1;
        return 'hidden point';
      });
    }
    trace.m('TRACE').info(visibleBox);
    function hiddenBox() {
      trace.point.error('fn', 'outranks box');
    }
    trace.m('HIDDEN').debug(hiddenBox);
    export { hiddenCalls, hiddenBox, outer, standalone, visibleBox };
  `);

  traced.standalone();
  expect(devLogs).toHaveLength(1);
  expect(devLogs[0]).toMatchObject({ message: 'standalone(): standalone', type: 'single' });
  expect(devLogs[0].box).toEqual([]);

  resetTraceLogs();
  traced.outer();
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.outer()'],
    ['single', 'outer(): outer'],
    ['single', 'inner(): inner'],
    ['close', 'outer done'],
  ]);
  expect(devLogs[1].id).toBe(devLogs[0].id);
  expect(devLogs[1].box.some((segment) => segment !== 'empty' && segment.box === 'single')).toBe(
    true
  );
  expect(devLogs[2].id).not.toBe(devLogs[0].id);
  expect(devLogs[2].box).toEqual([]);

  resetTraceLogs();
  traced.visibleBox();
  expect(traced.hiddenCalls).toBe(0);
  expect(devLogs.map((log) => log.type)).toEqual(['open', 'close']);
  expect(new Set(devLogs.map((log) => log.id)).size).toBe(1);

  resetTraceLogs();
  traced.hiddenBox();
  expect(devLogs).toHaveLength(1);
  expect(devLogs[0]).toMatchObject({
    level: 'error',
    message: 'hiddenBox(): outranks box',
    moduleId: 'HIDDEN',
    type: 'single',
  });
  expect(devLogs[0].box.some((segment) => segment !== 'empty' && segment.box === 'single')).toBe(
    false
  );
  expect(devErrors).toEqual([]);
});

test('queues visible point rendering until initialization', () => {
  resetLoxer();
  resetTraceLogs();
  __tracePoint({}, 'queued', 'Queue', undefined, 'fn', 'before init');
  initializePointOutput(false, false);
  expect(devLogs.at(-1)?.message).toBe('queued(): before init');
});

test.each([
  ['terminal', () => (trace.point as any).info('failed')],
  ['modifier', () => (trace.point as any).m('ORDER').warn('failed')],
  ['direct module', () => (trace.point as any).PROJECTS.error('failed')],
] as const)('an untransformed %s fails with the marker diagnostic', (_name, call) => {
  expect(call).toThrow('trace() is a build-time marker');
});

test.each([
  {
    source: "function save() { trace.point.pp().printProps().info('saved'); }",
    diagnostic: 'trace.point modifier "printProps" may appear only once.',
  },
  {
    source: "function save() { trace.point.printProps.info('saved'); }",
    diagnostic: 'trace.point direct module "printProps" is reserved',
  },
  {
    source: "function save() { trace.point['highlight']().info('saved'); }",
    diagnostic: 'trace.point does not support computed fluent members.',
  },
  {
    source: "trace.point.info('saved');",
    diagnostic: 'trace.point must be inside a named function',
  },
  {
    source: "function save(value = trace.point.info('saved')) {}",
    diagnostic: 'trace.point cannot be used in a parameter default',
  },
] as const)('diagnoses malformed point source: $diagnostic', async ({ source, diagnostic }) => {
  await expect(transformPointCode(source)).rejects.toThrow(diagnostic);
});
