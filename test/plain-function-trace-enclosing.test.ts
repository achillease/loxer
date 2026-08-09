import { fileParentName } from '../packages/babel-plugin-loxer-trace/src/marker-collection';
import { classParentName } from '../src/core/TraceNames';
import { classParentNameCases } from './class-parent-name-cases';
import {
  devLogs,
  imports,
  loadTracedModule,
  resetTraceLogs,
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

test('the enclosing form marks a declaration, a named recursive function expression, and a block-bodied arrow', async () => {
  const traced = await loadTracedModule(`
    function load(id) {
      trace.m('ORDER').info({ openMessage: 'fn(args)' });
      return 'order:' + id;
    }

    const expr = function recurse(value, total) {
      trace.m('TRACE').info({ openMessage: 'fn(args)' });
      return value === 0 ? total : recurse(value - 1, total + 1);
    };

    const arrowLoad = (id) => {
      trace.m('ORDER').info({ openMessage: 'fn(args)' });
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

test('the enclosing marker applies configured props rendering to both lifecycle sides', async () => {
  const traced = await loadTracedModule(`
    async function load(first, second) {
      trace
        .m('ORDER')
        .props('argsResult')
        .pp({ target: 'argsResult', depth: 1 })
        .info();
      return { first, second };
    }
    export { load };
  `);

  await expect(traced.load('one', 'two')).resolves.toEqual({ first: 'one', second: 'two' });
  const [open, close] = devLogs;
  expect(open.props).toEqual(['one', 'two']);
  expect(open.printProps).toEqual({ depth: 1 });
  expect(close.props).toEqual([{ first: 'one', second: 'two' }]);
  expect(close.printProps).toEqual({ depth: 1 });
});

test('the enclosing form marks a class method, a private method, a private field, a getter, a setter, and an object method', async () => {
  const traced = await loadTracedModule(`
    class Service {
      run(value) {
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
        return this.#run(value);
      }
      #run(value) {
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
        return 'ran:' + value;
      }
      #load = (value) => {
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
        return 'loaded:' + value;
      };
      invokeLoad(value) {
        return this.#load(value);
      }
      get total() {
        trace.m('TRACE').info({  });
        return 42;
      }
      set total(value) {
        trace.m('TRACE').info({  });
        this._total = value;
      }
    }
    const helper = {
      compute(value) {
        trace.m('TRACE').info({ openMessage: 'fn(args)' });
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
    // the accessors name no openMessage, so they take the default 'parent.fn' - their class
    'Service.total()',
    'Service.total()',
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
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
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

// the parent message styles, written once and interpolated into the marked sources below - the
// enclosing form reads its options off an object literal, so they cannot be hoisted into a shared
// binding inside the traced module itself. `transformOptions()` transforms every module below under
// the filename `src/orders/orderService.ts`.
const parentStyle = "{ moduleId: 'ORDER', openMessage: 'parent.fn', closeMessage: 'parent.fn' }";

test('parent.fn names the class of a marked method, private method, private field, getter, and static method', async () => {
  const traced = await loadTracedModule(`
    class Checkout {
      calculate(price) {
        trace.info(${parentStyle});
        return this.#tax(price);
      }
      #tax(price) {
        trace.info(${parentStyle});
        return price * 1.2;
      }
      #load = (id) => {
        trace.info(${parentStyle});
        return 'order:' + id;
      };
      invokeLoad(id) {
        return this.#load(id);
      }
      get total() {
        trace.info(${parentStyle});
        return 42;
      }
      static create() {
        trace.info(${parentStyle});
        return new Checkout();
      }
    }
    export { Checkout };
  `);

  const checkout = traced.Checkout.create();
  expect(checkout.calculate(10)).toBe(12);
  expect(checkout.invokeLoad('9')).toBe('order:9');
  expect(checkout.total).toBe(42);

  expect(devLogs.map((log) => log.message)).toEqual([
    'Checkout.create()',
    'Checkout.create done',
    'Checkout.calculate()',
    'Checkout.#tax()',
    'Checkout.#tax done',
    'Checkout.calculate done',
    'Checkout.#load()',
    'Checkout.#load done',
    'Checkout.total()',
    'Checkout.total done',
  ]);
});

test('parent.fn reports the file where no class member holds the function', async () => {
  const traced = await loadTracedModule(`
    class Checkout {
      calculate(price) {
        const round = (value) => {
          trace.info(${parentStyle});
          return Math.round(value);
        };

        return round(price * 1.2);
      }
    }
    const helper = {
      compute(value) {
        trace.info(${parentStyle});
        return value * 2;
      },
    };
    function standalone(value) {
      trace.info(${parentStyle});
      return value;
    }
    export { Checkout, helper, standalone };
  `);

  expect(new traced.Checkout().calculate(10)).toBe(12);
  expect(traced.helper.compute(3)).toBe(6);
  expect(traced.standalone(1)).toBe(1);

  // a function declared inside a method's body is held by that body, not by the class, and an
  // object literal is not a class at all - all three report the file they are written in, with the
  // directories and the extension of `src/orders/orderService.ts` dropped
  expect(devLogs.map((log) => log.message)).toEqual([
    'orderService.round()',
    'orderService.round done',
    'orderService.compute()',
    'orderService.compute done',
    'orderService.standalone()',
    'orderService.standalone done',
  ]);
});

test('parent.fn reports the file for a marker beside a binding, in either marker form', async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn, deps) { return fn; }
    function load(id) {
      return 'order:' + id;
    }
    trace.info(load, ${parentStyle});

    const cancel = useCallback(trace.info((id) => 'cancelled:' + id, ${parentStyle}), []);
    export { cancel, load };
  `);

  expect(traced.load('9')).toBe('order:9');
  expect(traced.cancel('9')).toBe('cancelled:9');

  expect(devLogs.map((log) => log.message)).toEqual([
    'orderService.load()',
    'orderService.load done',
    'orderService.cancel()',
    'orderService.cancel done',
  ]);
});

test('parent.fn reports the bare function name when the build hands Babel no filename', async () => {
  const traced = await loadTracedModule(
    `
    function standalone(value) {
      trace.info(${parentStyle});
      return value;
    }
    export { standalone };
  `,
    { filename: undefined }
  );

  expect(traced.standalone(1)).toBe(1);
  expect(devLogs.map((log) => log.message)).toEqual(['standalone()', 'standalone done']);
});

test('parent.fn reads an unnamed class from its binding and drops a trailing Class', async () => {
  const traced = await loadTracedModule(`
    const Checkout = class {
      calculate(price) {
        trace.info(${parentStyle});
        return price;
      }
    };
    class OrderServiceClass {
      load(id) {
        trace.info(${parentStyle});
        return id;
      }
    }
    export { Checkout, OrderServiceClass };
  `);

  expect(new traced.Checkout().calculate(10)).toBe(10);
  expect(new traced.OrderServiceClass().load('9')).toBe('9');

  // the suffix rule is the decorator's, and the same option renders the same way for both
  expect(devLogs.map((log) => log.message)).toEqual([
    'Checkout.calculate()',
    'Checkout.calculate done',
    'OrderService.load()',
    'OrderService.load done',
  ]);
});

// The trailing-`Class` rule is deliberately applied where a class name is read, not inside the
// joiner that both parents share - it exists in two copies (`classParentName` in
// `src/core/TraceNames.ts` and its twin in `marker-collection.ts`) for exactly this reason. Moving
// it back into the shared joiner would silently rename every file whose name happens to end in
// `Class`, so a file parent is the case that catches that regression.
test('parent.fn never drops a trailing Class from a file name', async () => {
  const traced = await loadTracedModule(
    `
    function load(id) {
      trace.info(${parentStyle});
      return id;
    }
    export { load };
  `,
    { filename: 'src/orders/orderServiceClass.ts' }
  );

  expect(traced.load('9')).toBe('9');
  expect(devLogs.map((log) => log.message)).toEqual([
    'orderServiceClass.load()',
    'orderServiceClass.load done',
  ]);
});

test('parent.fn names the innermost class, and reads an unnamed class expression off a member-expression assignment target', async () => {
  const traced = await loadTracedModule(`
    const Namespace = {};
    Namespace.Widget = class {
      render(id) {
        trace.info(${parentStyle});
        return 'widget:' + id;
      }
    };
    class Outer {
      build() {
        class Inner {
          run(value) {
            trace.info(${parentStyle});
            return 'ran:' + value;
          }
        }

        return new Inner();
      }
    }
    export { Namespace, Outer };
  `);

  expect(new traced.Namespace.Widget().render('3')).toBe('widget:3');
  expect(new traced.Outer().build().run('x')).toBe('ran:x');

  // `Namespace.Widget = class { ... }` reaches its name only through the assignment target, the one
  // branch of `declaringClassName` no other case exercises; `Inner` is declared inside `Outer`'s
  // method body, so the walk must stop at the first class it meets rather than the outermost one
  expect(devLogs.map((log) => log.message)).toEqual([
    'Widget.render()',
    'Widget.render done',
    'Inner.run()',
    'Inner.run done',
  ]);
});

// A static block sits in the class body but is not a member that holds a function, so a function
// written in one belongs to the file like any other free function. This pins that adding
// `StaticBlock` to `isClassMember` - or letting the walk read straight through it to the class -
// would be a behavior change, not a tidy-up.
test('parent.fn reports the file for a function inside a class static block', async () => {
  const traced = await loadTracedModule(`
    class Config {
      static loaded;
      static {
        function load() {
          trace.info(${parentStyle});
          return 'ready';
        }
        Config.loaded = load();
      }
    }
    export { Config };
  `);

  expect(traced.Config.loaded).toBe('ready');
  expect(devLogs.map((log) => log.message)).toEqual([
    'orderService.load()',
    'orderService.load done',
  ]);
});

test('parent.fn survives the await of an async class method and an async file-level function', async () => {
  const traced = await loadTracedModule(`
    class Checkout {
      async calculate(price) {
        trace.info(${parentStyle});
        await Promise.resolve();
        return price * 2;
      }
    }
    async function submit(value) {
      trace.info(${parentStyle});
      await Promise.resolve();
      return value + 1;
    }
    async function settle(value) {
      trace.m('ORDER').info({ openMessage: 'parent.fn', closeMessage: 'fn(result)' });
      await Promise.resolve();
      return { total: value };
    }
    export { Checkout, settle, submit };
  `);

  await expect(new traced.Checkout().calculate(3)).resolves.toBe(6);
  await expect(traced.submit(1)).resolves.toBe(2);
  await expect(traced.settle(7)).resolves.toEqual({ total: 7 });

  // the parent is resolved once, where the box opens, and has to still be in hand a microtask later
  // when the awaited result closes it - `settle` pins that the resolved payload, not the Promise,
  // is still what a result-shaped close reads while a parent is in play
  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'Checkout.calculate()'],
    ['close', 'Checkout.calculate done'],
    ['open', 'orderService.submit()'],
    ['close', 'orderService.submit done'],
    ['open', 'orderService.settle()'],
    ['close', 'settle({"total":7}) done'],
  ]);
});

// A failure has no result, so it carries no payload and never reaches a callback - it keeps the
// name form its close message selected, which is what lets a reader tell a failed box from a
// successful one by its ` failed` suffix while both name the call the same way.
test('a failing traced function closes with the name form its close message selected', async () => {
  const traced = await loadTracedModule(`
    class Checkout {
      calculate(price) {
        trace.info(${parentStyle});
        throw new Error('no price:' + price);
      }
    }
    function submit(value) {
      trace.info(${parentStyle});
      throw new Error('no value:' + value);
    }
    export { Checkout, submit };
  `);

  expect(() => new traced.Checkout().calculate(1)).toThrow('no price:1');
  expect(() => traced.submit(2)).toThrow('no value:2');

  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'Checkout.calculate()'],
    ['close', 'Checkout.calculate failed'],
    ['open', 'orderService.submit()'],
    ['close', 'orderService.submit failed'],
  ]);
});

// `fileParentName` reduces Babel's filename to the parent every marked function outside a class
// reports, so each of these shapes is a message a consumer would read. Unit-level because a
// dotfile, a multi-dot name, and a trailing separator have no natural module to transform.
test.each([
  ['a Windows path', 'C:\\dev\\loxer\\src\\orders\\orderService.ts', 'orderService'],
  ['a POSIX path', 'src/orders/orderService.ts', 'orderService'],
  ['a bare filename', 'orderService.ts', 'orderService'],
  // only the last dot starts an extension, so the compound name survives intact
  ['a multi-dot name', 'src/orders.service.ts', 'orders.service'],
  // a leading dot names the file; dropping it would report the empty string as the parent
  ['a dotfile', '.eslintrc', '.eslintrc'],
  ['a name with no extension', 'src/Makefile', 'Makefile'],
])('fileParentName reduces %s to its base name', (_label, filename, expected) => {
  expect(fileParentName(filename)).toBe(expected);
});

test('fileParentName reports no parent where a name cannot be read', () => {
  // a path ending in a separator names a directory, and an empty parent would render as '.load'
  expect(fileParentName('src/orders/')).toBeUndefined();
  expect(fileParentName('src\\orders\\')).toBeUndefined();
  expect(fileParentName('')).toBeUndefined();
  // Babel's filename is optional, and a build that omits it hands the runtime nothing to join
  expect(fileParentName(undefined)).toBeUndefined();
});

test('an inline literal assigned to a private class field reports the field name', async () => {
  const traced = await loadTracedModule(`
    class Service {
      #load = trace.m('ORDER').info((value) => 'loaded:' + value, { openMessage: 'fn(args)' });
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
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
        return 'widget:' + id;
      };
    }

    const iifeResult = (function () {
      trace.m('TRACE').info({  });
      return 'ran';
    })();

    class Base {
      constructor(value) {
        this.value = value;
      }
    }
    class Derived extends Base {
      constructor(value) {
        trace.m('TRACE').info({  });
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
    'orderService.iifeResult()',
    'load(3)',
    'Derived.constructor()',
  ]);
});

test('trace() with no arguments at all defaults its options and traces the enclosing function', async () => {
  const traced = await loadTracedModule(`
    function ping() {
      trace.info();
      return 'pong';
    }
    export { ping };
  `);

  expect(traced.ping()).toBe('pong');
  expect(devLogs.map((log) => [log.type, log.message, log.moduleId])).toEqual([
    ['open', 'orderService.ping()', 'DEFAULT'],
    ['close', 'ping done', 'DEFAULT'],
  ]);
});

test("an enclosing marker in an unnamed arrow resolves through the surrounding declarator, matching the inline form's chain", async () => {
  const traced = await loadTracedModule(`
    function useCallback(fn) { return fn; }
    const load = useCallback(async () => {
      trace.m('ORDER').info({  });
      return 'loaded';
    }, []);
    export { load };
  `);

  await expect(traced.load()).resolves.toBe('loaded');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.load()',
  ]);
});

test('an enclosing marker in an unnamed object-property arrow resolves through the property, including a quoted key, and through a plain assignment target', async () => {
  const traced = await loadTracedModule(`
    const handlers = {
      onClick: (event) => {
        trace.m('TRACE').info({ openMessage: 'fn(args)' });
        return 'clicked:' + event;
      },
      'load-order': (value) => {
        trace.m('ORDER').info({ openMessage: 'fn(args)' });
        return 'loaded:' + value;
      },
    };
    let assignedHandler;
    assignedHandler = (value) => {
      trace.m('ORDER').info({ openMessage: 'fn(args)' });
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
      trace.m('ORDER').info({ name: 'explicitName' });
      return 'loaded';
    });
    export { load };
  `);

  expect(traced.load()).toBe('loaded');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.explicitName()',
  ]);
});

test('the enclosing form raises the naming error when no name applies, across every name-boundary shape', async () => {
  const rejects = (source: string, options = transformOptions()) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, options)).rejects;

  await rejects(
    'function useEffect(effect) { effect(); } useEffect(() => { trace.info({ moduleId: "ORDER" }); });'
  ).toThrow('Cannot name the trace() target');

  await rejects('const list = [() => { trace.info({ moduleId: "ORDER" }); }];').toThrow(
    'Cannot name the trace() target'
  );

  await rejects(
    'const chosen = flag ? () => { trace.info({ moduleId: "ORDER" }); } : () => {};'
  ).toThrow('Cannot name the trace() target');

  await rejects('const a = <button onClick={() => { trace.info({ moduleId: "ORDER" }); }} />;', {
    ...transformOptions(),
    parserPlugins: ['jsx'],
  }).toThrow('Cannot name the trace() target');

  // logical-expression alternatives: the function is only conditionally the value produced
  await rejects('const j = cond && (() => { trace.info({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const k = cond || (() => { trace.info({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );
  await rejects('const l = cond ?? (() => { trace.info({ moduleId: "ORDER" }); });').toThrow(
    'Cannot name the trace() target'
  );

  // sequence expression: the function is one of several evaluated operands
  await rejects('const m = (0, (() => { trace.info({ moduleId: "ORDER" }); }));').toThrow(
    'Cannot name the trace() target'
  );

  // destructuring default value: the name reachable past it is the destructured binding's own
  // name, which only applies when the property is missing - not a name for the function itself
  await rejects('const { y = () => { trace.info({}) } } = obj;').toThrow(
    'Cannot name the trace() target'
  );

  // object spread: the name past it belongs to the object, exactly as for the array-element case.
  // The enclosing marker needs a block-bodied function literal to host it, here an IIFE.
  await rejects('const o = {...(function () { trace.info({}); })()};').toThrow(
    'Cannot name the trace() target'
  );

  // template interpolation: the function is coerced to a string
  await rejects('const s = `${(function () { trace.info({}); })()}`;').toThrow(
    'Cannot name the trace() target'
  );

  // yielded operand: `d` is whatever the generator's driver passes to the next `.next(value)`,
  // unrelated to the operand - the enclosing marker's own function is not the generator, so this
  // reaches the naming guard rather than the generator guard
  await rejects('function* g() { const d = yield (function () { trace.info({}); })(); }').toThrow(
    'Cannot name the trace() target'
  );

  // property read off the traced function: the name past it belongs to the property being read
  await rejects('const d = (function () { trace.info({}); })().foo;').toThrow(
    'Cannot name the trace() target'
  );

  // optional property read directly off the traced function: unlike the ordinary case above, this
  // reaches Babel's OptionalMemberExpression without an intervening call
  await rejects('const e = (function () { trace.info({}); })?.foo;').toThrow(
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
    obj.handler = trace.m('ORDER').info((id) => id);
    export { obj };
  `);
  expect(assigned.obj.handler('x')).toBe('x');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.handler()',
  ]);

  resetTraceLogs();
  // guard 2: the flagship documented shape - a call is deliberately not a boundary, so the walk
  // still reads through `useCallback(trace.info(fn, options), deps)` on its way to the declarator, deps
  // array and all. A near-identical shape (without the deps array) is already pinned at
  // 'an inline literal is accepted as a call argument, ...' above; this asserts the exact
  // documented form.
  const useCallbackShape = await loadTracedModule(`
    function useCallback(fn, deps) { return fn; }
    const load = useCallback(trace.m('ORDER').info((id) => id), []);
    export { load };
  `);
  expect(useCallbackShape.load('y')).toBe('y');
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.load()',
  ]);

  resetTraceLogs();
  // guard 3: an IIFE is a call too, so the enclosing form must keep reading through it up to the
  // declarator - already pinned as `iifeResult` in 'the enclosing form marks a class-property
  // arrow, an IIFE, and a derived-class constructor' above; reasserted here under its own name to
  // keep this guard block self-contained.
  await loadTracedModule(`
    const d = (function () { trace.m('ORDER').info({  }); })();
    export { d };
  `);
  expect(devLogs.filter((log) => log.type === 'open').map((log) => log.message)).toEqual([
    'orderService.d()',
  ]);

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
      trace.m('ORDER').info((value) => value)
    );
    const enclosingConstructed = new Holder(function (value) {
      trace.m('ORDER').info({  });
      return value;
    });
    const inlineOptional = identity?.(
      trace.m('ORDER').info((value) => value)
    );
    const enclosingOptional = identity?.(function (value) {
      trace.m('ORDER').info({  });
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
    'orderService.inlineConstructed()',
    'orderService.enclosingConstructed()',
    'orderService.inlineOptional()',
    'orderService.enclosingOptional()',
  ]);
});

test('the enclosing form rejects a marker that is not the first statement, in a nested block, at module top level, or in an expression-bodied arrow', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    'function notFirst() { const a = 1; trace.info({ moduleId: "TRACE" }); return a; }'
  ).toThrow('trace(options) marks the function it sits in');

  await rejects(
    'function nestedBlock() { if (true) { trace.info({ moduleId: "TRACE" }); } return 1; }'
  ).toThrow('trace(options) marks the function it sits in');

  await rejects('trace.info({ moduleId: "TRACE" });').toThrow(
    'trace(options) marks the function it sits in'
  );

  await rejects('const arrow = () => trace.info({ moduleId: "TRACE" });').toThrow(
    'trace(options) marks the function it sits in'
  );
});

test('the enclosing form rejects a generator host', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function* gen() { trace.m('TRACE').info({  }); yield 1; }`,
      transformOptions()
    )
  ).rejects.toThrow('trace() does not support generator functions.');
});

test('the enclosing form rejects a function marked twice, beside itself and from within itself', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    'function target() { trace.info({ moduleId: "TRACE" }); return 1; } trace.info(target, { moduleId: "ORDER" });'
  ).toThrow('Function "target" has more than one trace() marker.');

  await rejects(
    'function identity(fn) { return fn; } const load = identity(trace.info((id) => { ' +
      'trace.info({ moduleId: "ORDER" }); return "x:" + id; }, { moduleId: "TRACE" }));'
  ).toThrow('Function "load" has more than one trace() marker.');
});

test('the enclosing form rejects options that read a name the marked body declares, but a parameter stays readable', async () => {
  await expect(
    transformLoxerTrace(
      `${imports()} function load() { trace.info({ openMessage: MOD }); const MOD = 'fn'; return MOD; }`,
      transformOptions()
    )
  ).rejects.toThrow(
    'trace() options cannot read "MOD", which the marked function declares in its body.'
  );

  const traced = await loadTracedModule(`
    function load(moduleId) {
      trace.m(moduleId).info({ openMessage: 'fn(args)' });
      return moduleId;
    }
    export { load };
  `);
  expect(traced.load('ORDER')).toBe('ORDER');
  expect(
    devLogs.filter((log) => log.type === 'open').map((log) => [log.message, log.moduleId])
  ).toEqual([['load(ORDER)', 'ORDER']]);
});

test('trace.info(OPTS) and trace.info(makeOptions()) are read as the statement form and keep its own diagnostic', async () => {
  const rejects = (source: string) =>
    expect(transformLoxerTrace(`${imports()} ${source}`, transformOptions())).rejects;

  await rejects(
    "const OPTS = { moduleId: 'TRACE' }; function load() { trace.info(OPTS); return 1; }"
  ).toThrow('trace() target "OPTS" is not initialized with a function.');

  await rejects(
    "function makeOptions() { return { moduleId: 'TRACE' }; } " +
      'function load() { trace.info(makeOptions()); return 1; }'
  ).toThrow('trace() targets must be named function-binding identifiers.');
});

test('the enclosing form leaves this, arguments, Function.length, and self-recursion untouched by the in-place rewrite', async () => {
  const traced = await loadTracedModule(`
    function scale(value) {
      trace.m('TRACE').info({  });
      return [this.factor, arguments.length, value];
    }
    const recurse = function countdown(value, total) {
      trace.m('TRACE').info({ openMessage: 'fn(args)' });
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
      trace.m('TRACE').props('args').info({ openMessage: 'fn(args)' });
      return first + second;
    };
    const defaulted = (first = 'fallback', second = 'two') => {
      trace.m('ORDER').props('args').info({ openMessage: 'fn(args)' });
      return first + ':' + second;
    };
    const destructured = ({ value } = { value: 'fallback' }, [tail] = ['tail']) => {
      trace.m('TRACE').props('args').info({ openMessage: 'fn(args)' });
      return value + ':' + tail;
    };
    const withRest = (first, ...rest) => {
      trace.m('TRACE').props('args').info({ openMessage: 'fn(args)' });
      return [first, rest];
    };
    const d = (first = 1) => {
      trace.m('ORDER').props('args').info({ openMessage: 'fn(args)' });
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
  expect(opens.map((log) => log.props)).toEqual([
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

test('the enclosing form applies openMessage/closeMessage presets and callbacks, props capture, level, and highlight', async () => {
  const traced = await loadTracedModule(`
    function withPreset(value) {
      trace.m('TRACE').h().props('argsResult').warn({
        openMessage: 'fn(types)',
        closeMessage: 'fn(result)',
      });
      return { total: value * 2 };
    }
    function withCallback(value) {
      trace.m('ORDER').info({
        openMessage: ({ args }) => 'starting:' + args[0],
        closeMessage: ({ result }) => 'finished:' + result.total,
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
    props: [3],
  });
  expect(presetClose).toMatchObject({
    level: 'warn',
    highlighted: true,
    message: 'withPreset({"total":6}) done',
    props: [{ total: 6 }],
  });
  expect(callbackOpen).toMatchObject({ message: 'starting:3' });
  expect(callbackClose).toMatchObject({ message: 'finished:4' });
});

test('the enclosing form preserves an async result, rethrows a thrown error unchanged, and keeps native Promise identity', async () => {
  const traced = await loadTracedModule(`
    async function submit(value) {
      trace.m('TRACE').info({  });
      return value + 1;
    }
    const original = new Error('enclosing failure');
    function failSync() {
      trace.m('TRACE').info({  });
      throw original;
    }
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    function loadPending() {
      trace.m('TRACE').info({  });
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
      trace.m('TRACE').info({ openMessage: 'fn(args)' });
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
      trace.m('TRACE').info({ name: 'outer' });
      function inner(x) {
        trace.m('ORDER').info({ name: 'inner' });
        return x + 1;
      }
      return inner(value) * 2;
    }
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

test.each(directModuleSelectorCases)(
  'every terminal transforms a $name selector for an enclosing marker',
  async ({ marker, moduleId }) => {
    const traced = await loadTracedModule(`
      const selected = 'TRACE';
      function atError() {
        ${marker}.error();
        return 'error';
      }
      function atWarn() {
        ${marker}.warn();
        return 'warn';
      }
      function atLog() {
        ${marker}.log();
        return 'log';
      }
      function atInfo() {
        ${marker}.info();
        return 'info';
      }
      function atDebug() {
        ${marker}.debug();
        return 'debug';
      }
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

test("the enclosing form evaluates its options once per invocation - three calls, three evaluations - unlike the other two forms' once-per-marker-evaluation timing", async () => {
  const traced = await loadTracedModule(`
    let optionsCalls = 0;
    function markOptions() {
      optionsCalls += 1;
      return 'fn(args)';
    }
    function load(id) {
      trace.m('TRACE').info({ openMessage: markOptions() });
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

test('an enclosing marker evaluates fluent arguments in source order on each invocation', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function load(id) {
      trace.m(mark('module', 'TRACE')).props(mark('props', 'args'))
        .info({ openMessage: mark('options', 'fn(args)') });
      return id;
    }
    export { load, order };
  `);

  expect(traced.load('a')).toBe('a');
  expect(traced.load('b')).toBe('b');
  expect(traced.order).toEqual(['module', 'props', 'options', 'module', 'props', 'options']);
});

test('an enclosing computed module evaluates once in modifier order on every invocation', async () => {
  const traced = await loadTracedModule(`
    const order = [];
    function mark(name, value) { order.push(name); return value; }
    function load(id) {
      trace.h(mark('highlight', true))[mark('module', 'TRACE')]
        .info({ openMessage: mark('options', 'fn(args)') });
      return id;
    }
    export { load, order };
  `);

  expect(traced.load('a')).toBe('a');
  expect(traced.load('b')).toBe('b');
  expect(traced.order).toEqual([
    'highlight',
    'module',
    'options',
    'highlight',
    'module',
    'options',
  ]);
  expect(devLogs.map((log) => log.moduleId)).toEqual(['TRACE', 'TRACE', 'TRACE', 'TRACE']);
});

// The trailing-`Class` rule lives in two copies, one per package, because the packages cannot import
// each other - so nothing but a test holds them to the same answer. Each row checks both against the
// same expectation: the transform's copy through the message its emitted code produces, and the
// runtime's copy directly. `test/decorators.test.ts` drives the decorator from the same table. A row
// each, so a class name that breaks one copy cannot be skipped by an earlier row throwing.
test.each(classParentNameCases)(
  'both copies of the trailing-Class rule render $parent for class $className',
  async ({ className, parent }) => {
    const traced = await loadTracedModule(`
    class ${className} {
      run(id) {
        trace.info(${parentStyle});
        return id;
      }
    }
    export { ${className} };
  `);

    expect(new traced[className]().run('9')).toBe('9');
    expect(devLogs.map((log) => log.message)).toEqual([`${parent}.run()`, `${parent}.run done`]);
    expect(classParentName(className)).toBe(parent);
  }
);

// The runtime resolves the parent once, when the box opens, behind a gate that has to read *both*
// message styles - the close message is built a call later, from the value captured back then. Every
// other parent test in this file names the style on both ends, so a gate that read only `openMessage`
// would pass all of them and still drop the parent from every close-only message.
test('parent.fn on the close message alone still renders the parent', async () => {
  const traced = await loadTracedModule(`
    function closeOnly(id) {
      trace.m('ORDER').info({ closeMessage: 'parent.fn' });
      return id;
    }
    function closeOnlyWithArgs(id) {
      trace.m('ORDER').info({ openMessage: 'fn(args)', closeMessage: 'parent.fn' });
      return id;
    }
    export { closeOnly, closeOnlyWithArgs };
  `);

  expect(traced.closeOnly('9')).toBe('9');
  expect(traced.closeOnlyWithArgs('7')).toBe('7');

  expect(devLogs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'orderService.closeOnly()'],
    ['close', 'orderService.closeOnly done'],
    ['open', 'closeOnlyWithArgs(7)'],
    ['close', 'orderService.closeOnlyWithArgs done'],
  ]);
});
