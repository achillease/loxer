import { vi, type Mock } from 'vitest';
import {
  ANSIFormat,
  BoxFactory,
  Loxer,
  PropsPrinter,
  resetLoxer,
  type LogLevel,
  type PropsPrinterOptions,
} from '../src';
import { __startTrace } from '../src/trace';
import { OutputLox, ErrorLox } from '../src/loxes';

// mock console so the default (no-callback) output stream is captured
global.console.log = vi.fn();
global.console.error = vi.fn();

// prod callbacks only — dev/log callbacks are intentionally NOT registered so that
// OutputStreams.devLogOut falls through to the console path that actually runs
// `PropsPrinter.of(lox).print(...)`. Registering a devLog would bypass the printer entirely.
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox) {
  prodErrors.push(log);
}

function initProps(colored: boolean, devLevel: LogLevel = 'info') {
  Loxer.init({
    dev: true,
    callbacks: { prodLog, prodError },
    modules: { IT: { fullName: 'Props', color: '#0f0', devLevel, prodLevel: 'error' } },
    config: { disableColors: !colored },
  });
  (console.log as Mock).mockClear();
}

/** the string passed to the most recent `console.log` call */
function lastOutput(): string {
  const calls = (console.log as Mock).mock.calls;
  return calls.length ? calls[calls.length - 1][0] : '';
}

/** log props through the default console path, asking for them to be rendered, and return the
 * rendered string */
function render(props: unknown[], options?: PropsPrinterOptions): string {
  Loxer.pp(options)
    .m('IT')
    .log('msg', ...props);
  return lastOutput();
}

/** the most recent log, straight off the history - the raw lox an output callback would receive */
function lastLox(): OutputLox | ErrorLox {
  return Loxer.history[0];
}

beforeEach(() => initProps(false));

afterEach(() => {
  prodLogs = [];
  prodErrors = [];
  resetLoxer();
  (console.log as Mock).mockClear();
});

afterAll(() => {
  // a normal log must never reach a production callback
  expect(prodLogs.length).toBe(0);
  expect(prodErrors.length).toBe(0);
});

// ##### props as data ############################################################################

test('every value after the message becomes a prop, in order', () => {
  const payment = { id: 'p1' };
  const cart = ['a', 'b'];
  Loxer.log('restoring order', payment, cart, 3);
  expect(lastLox().props).toEqual([payment, cart, 3]);
  // by reference, neither cloned nor stringified at capture
  expect(lastLox().props[0]).toBe(payment);
  expect(lastLox().props[1]).toBe(cart);
});

test('a direct devLog callback receives requested props unchanged without rendered text', () => {
  const devLogs: OutputLox[] = [];
  const payment = { id: 'p1' };
  const cart = ['a', 'b'];
  resetLoxer();
  Loxer.init({ dev: true, callbacks: { devLog: (log) => devLogs.push(log), prodLog, prodError } });
  devLogs.splice(0);

  Loxer.pp().log('restoring order', payment, cart, 3);
  expect(devLogs).toHaveLength(1);
  expect(devLogs[0].props).toEqual([payment, cart, 3]);
  expect(devLogs[0].props[0]).toBe(payment);
  expect(devLogs[0].props[1]).toBe(cart);
  expect(devLogs[0].printProps).toEqual({});
  expect(lastOutput()).toBe('');
});

test('a log without props carries an empty array rather than undefined', () => {
  Loxer.log('plain');
  expect(lastLox().props).toEqual([]);
  // so a callback can read the length without a guard
  expect(lastLox().props.length).toBe(0);
});

test('no value is consumed as configuration', () => {
  // the shape that used to bind to the options slot and never be printed
  const looksLikeOptions = { depth: 1, keys: ['a'] };
  Loxer.log('msg', looksLikeOptions);
  expect(lastLox().props).toEqual([looksLikeOptions]);
});

test('every entry point attaches props', () => {
  resetLoxer();
  initProps(false, 'debug');
  const box = Loxer.m('IT').open('opening', 'o');
  expect(lastLox().props).toEqual(['o']);
  box.add('added', 'a');
  expect(lastLox().props).toEqual(['a']);
  box.warn('warned', 'w');
  expect(lastLox().props).toEqual(['w']);
  box.info('infoed', 'i');
  expect(lastLox().props).toEqual(['i']);
  box.debug('debugged', 'd', 'd2');
  expect(lastLox().props).toEqual(['d', 'd2']);
  Loxer.warn('warn', 'W');
  expect(lastLox().props).toEqual(['W']);
  Loxer.info('info', 'I');
  expect(lastLox().props).toEqual(['I']);
  Loxer.m('IT').debug('debug', 'D1', 'D2');
  expect(lastLox().props).toEqual(['D1', 'D2']);
  Loxer.m('IT').debug.open('debug box', 'D');
  expect(lastLox().props).toEqual(['D']);
  Loxer.m('IT').warn.open('warn box', 'W1', 'W2');
  expect(lastLox().props).toEqual(['W1', 'W2']);
  Loxer.m('IT').info.open('info box', 'I1', 'I2');
  expect(lastLox().props).toEqual(['I1', 'I2']);
  Loxer.error(new Error('boom'), 'E1', 'E2');
  expect(lastLox().props).toEqual(['E1', 'E2']);
  Loxer.namedError('Named', 'named message', 'N');
  expect(lastLox().props).toEqual(['N']);
  box.error(new Error('in box'), 'B');
  expect(lastLox().props).toEqual(['B']);
  box.namedError('Named', 'in box', 'BN');
  expect(lastLox().props).toEqual(['BN']);
  box.close('closing', 'c');
  expect(lastLox().props).toEqual(['c']);
});

test.each([
  ['add', (lox: ReturnType<typeof Loxer.of>) => lox.add('added', 'a', 'a2'), ['a', 'a2']],
  ['warn', (lox: ReturnType<typeof Loxer.of>) => lox.warn('warned', 'w', 'w2'), ['w', 'w2']],
  ['info', (lox: ReturnType<typeof Loxer.of>) => lox.info('infoed', 'i', 'i2'), ['i', 'i2']],
  ['debug', (lox: ReturnType<typeof Loxer.of>) => lox.debug('debugged', 'd', 'd2'), ['d', 'd2']],
  ['error', (lox: ReturnType<typeof Loxer.of>) => lox.error(new Error('boom'), 'e', 'e2'), ['e', 'e2']],
  [
    'namedError',
    (lox: ReturnType<typeof Loxer.of>) => lox.namedError('Named', 'named message', 'n', 'n2'),
    ['n', 'n2'],
  ],
  ['close', (lox: ReturnType<typeof Loxer.of>) => lox.close('closed', 'c', 'c2'), ['c', 'c2']],
])('Loxer.of(id).%s attaches every prop', (_name, call, props) => {
  resetLoxer();
  initProps(false, 'debug');
  Loxer.m('IT').open('opening');
  const lox = Loxer.of(lastLox().id);
  call(lox);

  expect(lastLox().props).toEqual(props);
});

test('a dead box still attaches the props of the call that reached it', () => {
  const box = Loxer.m('IT').open('opening');
  box.close('closing');
  Loxer.of(box.id).add('too late', 'late');
  expect(lastLox().props).toEqual(['late']);
  Loxer.of(box.id).error(new Error('too late'), 'lateError');
  expect(lastLox().props).toEqual(['lateError']);
  Loxer.of(box.id).namedError('Named', 'too late', 'lateNamed');
  expect(lastLox().props).toEqual(['lateNamed']);
});

test('props are dropped where Loxer is disabled', () => {
  resetLoxer();
  Loxer.init({ dev: true, config: { disabled: true }, callbacks: { prodLog, prodError } });
  Loxer.pp().log('nothing', 'prop');
  expect(Loxer.history.length).toBe(0);
});

test('hidden boxes skip non-primitive message rendering for both open and close', () => {
  resetLoxer();
  initProps(false, 'error');
  const singleLine = vi.spyOn(PropsPrinter, 'singleLine');

  const box = Loxer.m('IT').open({ deep: { value: 'open' } });
  box.close({ deep: { value: 'close' } });

  expect(singleLine).not.toHaveBeenCalled();
  singleLine.mockRestore();
});

// ##### opt-in printing ##########################################################################

test('attaching props renders nothing', () => {
  Loxer.m('IT').log('msg', { id: 'p1' });
  expect(lastOutput()).not.toContain('┃ props> ');
  expect(lastOutput()).toContain('msg');
});

test('printProps renders the props block, connected to the log box column', () => {
  const out = render([{ id: 'p1' }]);
  expect(out).toContain('props> ');
  expect(out).toContain(' <props');
  expect(out).toContain("{ id: 'p1' }");
});

test('an empty configuration object is a render request, not a no-op', () => {
  const explicit = render([42], {});
  resetLoxer();
  initProps(false);
  const implicit = render([42]);
  expect(explicit).toBe(implicit);
  expect(explicit).toContain('┃ props> ');
});

test('printProps and its pp alias behave identically', () => {
  Loxer.printProps({ depth: 1 })
    .m('IT')
    .log('msg', { a: { b: 1 } });
  const long = lastOutput();
  Loxer.pp({ depth: 1 })
    .m('IT')
    .log('msg', { a: { b: 1 } });
  expect(lastOutput()).toBe(long);
  expect(long).toContain('{ a: {1 entries} }');
});

test('printProps composes with the other modifiers in any order', () => {
  Loxer.h().m('IT').pp().log('msg', 1);
  const first = lastOutput();
  Loxer.pp().m('IT').h().log('msg', 1);
  expect(lastOutput()).toBe(first);
  expect(lastLox().highlighted).toBe(true);
  expect(lastLox().moduleId).toBe('IT');
  expect(lastLox().printProps).toEqual({});
});

test('printProps resets after one logging operation', () => {
  render([42]);
  Loxer.m('IT').log('msg', 42);
  expect(lastOutput()).not.toContain('┃ props> ');
  expect(lastLox().printProps).toBeUndefined();
});

test('a log that asked for rendering but carries no props renders no block', () => {
  const out = render([]);
  expect(out).not.toContain('┃ props> ');
  expect(out).not.toContain('<props');
});

test.each([[false], [0], [''], [null], [undefined]])(
  'a falsy prop (%o) is rendered when printing was requested',
  (falsy) => {
    const out = render([falsy]);
    expect(out).toContain('┃ props> ');
  }
);

test('an error log renders its props on request and not otherwise', () => {
  Loxer.pp().m('IT').error(new Error('boom'), { id: 'p1' });
  expect(lastOutput()).toContain('props> ');
  Loxer.m('IT').error(new Error('boom'), { id: 'p1' });
  expect(lastOutput()).not.toContain('┃ props> ');
});

test('a devError callback receives raw requested props', () => {
  const devErrors: ErrorLox[] = [];
  const payment = { id: 'p1' };
  resetLoxer();
  Loxer.init({
    dev: true,
    callbacks: {
      devError: (error) => devErrors.push(error),
      prodLog,
      prodError,
    },
    modules: { IT: { fullName: 'Props', color: '#0f0', devLevel: 'debug', prodLevel: 'error' } },
    config: { disableColors: true },
  });
  (console.log as Mock).mockClear();

  Loxer.pp().m('IT').error(new Error('boom'), payment);
  expect(devErrors).toHaveLength(1);
  expect(devErrors[0].props).toEqual([payment]);
  expect(devErrors[0].props[0]).toBe(payment);
  expect(devErrors[0].printProps).toEqual({});
  expect(lastOutput()).toBe('');
});

test('namedError keeps its message exactly and attaches the rest as props', () => {
  const payment = { id: 'p1' };
  Loxer.m('IT').namedError('CheckoutError', 'the cart was empty', payment);
  const lox = lastLox() as ErrorLox;
  expect(lox.message).toBe('the cart was empty');
  expect(lox.error.name).toBe('CheckoutError');
  expect(lox.props).toEqual([payment]);
});

// ##### the free-typed first argument ############################################################

test.each([
  [42, '42'],
  [true, 'true'],
  [null, 'null'],
  [123n, '123'],
  ['plain', 'plain'],
])('a primitive first argument (%o) stringifies to %o', (message, expected) => {
  Loxer.log(message);
  expect(lastLox().message).toBe(expected);
});

test('a symbol first argument is stringified', () => {
  Loxer.log(Symbol('sym'));
  expect(lastLox().message).toBe('Symbol(sym)');
});

test('an omitted and an explicitly undefined first argument both produce an empty message', () => {
  Loxer.log();
  expect(lastLox().message).toBe('');
  Loxer.log(undefined);
  expect(lastLox().message).toBe('');
});

test('an object first argument renders on one line and is not also a prop', () => {
  const payment = { id: 'p1', amount: 19.95 };
  Loxer.log(payment);
  expect(lastLox().message).toBe("{ id: 'p1', amount: 19.95 }");
  expect(lastLox().props).toEqual([]);
});

test('a long object first argument still renders on exactly one line', () => {
  const wide = {
    first: 'aaaaaaaaaaaaaaa',
    second: 'bbbbbbbbbbbbbbb',
    third: 'ccccccccccccccc',
    fourth: 'ddddddddddddddd',
    nested: { deep: { deeper: ['eeeeeeeeeeeeeee', 'fffffffffffffff'] } },
  };
  Loxer.log(wide);
  const message = lastLox().message;
  expect(message.length).toBeGreaterThan(70);
  expect(message).not.toContain('\n');
  expect(message).toContain('deeper:');
});

test('a function first argument renders as [Function: name], never its source', () => {
  function named() {
    return 1;
  }
  Loxer.log(named);
  expect(lastLox().message).toBe('[Function: named]');
  expect(lastLox().message).not.toContain('return');
});

test('a message carries no control characters', () => {
  Loxer.log('first\nsecond\tthird');
  expect(lastLox().message).toBe('first\\u000asecond\\u0009third');
  expect(lastLox().message).not.toContain('\n');
});

test.each([
  ['a line feed', 'a\nb', '\n'],
  ['a carriage return', 'a\rb', '\r'],
  ['an ANSI escape', 'a\u001b[2Jb', '\u001b'],
  ['an 8-bit CSI', 'a\u009bb', '\u009b'],
])('a message escapes %s', (_name, message, raw) => {
  Loxer.log(message);
  expect(lastLox().message).not.toContain(raw);
});

test.each([
  ['undefined', undefined],
  ['null', null],
  ['a number', 0],
  ['an empty string', ''],
  ['an object', { a: 1 }],
  ['an array', [1]],
  ['a symbol', Symbol('s')],
  ['a bigint', 1n],
  ['a null-prototype object', Object.create(null)],
  [
    'an object with a throwing getter',
    {
      get boom(): never {
        throw new Error('nope');
      },
    },
  ],
  ['an invalid date', new Date(NaN)],
])('a message is always a string - %s', (_name, message) => {
  Loxer.log(message);
  expect(typeof lastLox().message).toBe('string');
});

// ##### rendering ################################################################################

test('several props render as one block, listed like array elements without the brackets', () => {
  const out = render([1, 'two', { three: 3 }]);
  // one block, not one per prop
  expect(out.split('┃ props> ').length - 1).toBe(1);
  expect(out).toContain("1, 'two', { three: 3 }");
});

test('array and object shape', () => {
  expect(render([[1, 2, 3]])).toContain('[ 1, 2, 3 ]');
  expect(render([['a', 'b']])).toContain("[ 'a', 'b' ]");
  expect(render([{ a: 1, b: 'two' }])).toContain("{ a: 1, b: 'two' }");
  expect(render([{ outer: { inner: 1 } }])).toContain('{ outer: { inner: 1 } }');
});

test('an absent depth has no configured limit, and finite depths are normalized safely', () => {
  // absent: the whole tree is rendered
  expect(render([{ a: { b: { c: 1 } } }])).toContain('{ a: { b: { c: 1 } } }');
  // `0` is a usable limit rather than the "unlimited" sentinel it used to collide with
  expect(render([{ a: 1, b: 2 }], { depth: 0 })).toContain('{2 entries}');
  expect(render([[1, 2, 3]], { depth: 0 })).toContain('[3 elements]');
  // arrays past the limit collapse to `[n elements]`
  expect(render([[1, [2, 3, 4]]], { depth: 1 })).toContain('[ 1, [3 elements] ]');
  // objects past the limit collapse to `{n entries}`
  expect(render([{ a: { b: 1, c: 2 } }], { depth: 1 })).toContain('{ a: {2 entries} }');
});

test.each([
  ['a negative depth', -1, '{1 entries}'],
  ['a fractional depth', 1.9, '{ a: {2 entries} }'],
  ['a non-finite depth', Infinity, '{ a: { b: { c: 1 }, d: 2 } }'],
])('depth normalizes %s', (_name, depth, expected) => {
  const value = { a: { b: { c: 1 }, d: 2 } };

  expect(render([value], { depth })).toContain(expected);
});

test('a pathological value graph stops at the renderer safety depth', () => {
  const root: { child?: unknown } = {};
  Array.from({ length: 150 }).reduce<{ child?: unknown }>((parent) => {
    const child: { child?: unknown } = {};
    parent.child = child;

    return child;
  }, root);

  expect(PropsPrinter.singleLine(root)).toContain('{1 entries}');
});

test('a public box depth is capped before its layout is allocated', () => {
  const output = PropsPrinter.ofValues([1]).print(false, { depth: Number.MAX_SAFE_INTEGER });

  expect(output).toMatch(/^\n {200}┃ props> 1 <props$/);
});

test('a non-finite box depth does not draw an attached connector', () => {
  const values = ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccc'];

  expect(PropsPrinter.ofValues(values).print(false, { depth: Infinity })).toBe(
    PropsPrinter.ofValues(values).print(false, {})
  );
});

test('keys filtering keeps listed keys and marks the rest', () => {
  const out = render([{ keep: 1, drop: 2, gone: 3 }], { keys: ['keep'] });
  expect(out).toContain('keep: 1');
  expect(out).not.toContain('drop');
  expect(out).not.toContain('gone');
  // two keys were cut
  expect(out).toContain('+(2 entries)');
});

test('keys filtering that removes everything renders {...}', () => {
  expect(render([{ drop: 1, gone: 2 }], { keys: ['missing'] })).toContain('{...}');
});

test('indent and showVerticalLines shape the expanded form', () => {
  const wide = { first: 'aaaaaaaaaaaaaaaaaaaa', second: 'bbbbbbbbbbbbbbbbbbbb', third: 'cccccc' };
  const lined = render([wide], { indent: 4 });
  expect(lined).toContain('\n┊   ');
  const plain = render([wide], { indent: 4, showVerticalLines: false });
  expect(plain).not.toContain('┊');
  expect(plain).toContain('\n    first');
});

test('a public indent is capped before its layout is allocated', () => {
  const output = PropsPrinter.ofValues(
    [{ first: 'aaaaaaaaaaaaaaaaaaaa', second: 'bbbbbbbbbbbbbbbbbbbb', third: 'cccccc' }],
    { indent: Number.MAX_SAFE_INTEGER, showVerticalLines: false }
  ).print(false);

  expect(output).toContain(`\n${' '.repeat(20)}first`);
});

test('class instances', () => {
  class Foo {
    x = 1;
    y = 2;
  }
  // top-level class instance: shown as [Class: Name] = { ...properties }
  expect(render([new Foo()])).toContain('[Class: Foo] = { x: 1, y: 2 }');
  // nested class instance, shortenClasses default (true): collapsed to [Class: Name]
  expect(render([{ foo: new Foo() }])).toContain('foo: [Class: Foo]');
  // nested class instance, shortenClasses false: destructured to its properties
  expect(render([{ foo: new Foo() }], { shortenClasses: false })).toContain('foo: { x: 1, y: 2 }');
});

test('a class graph does not recurse indefinitely', () => {
  class Node {
    child: Node | undefined;
  }
  const root = new Node();
  root.child = root;
  expect(() => render([{ root }])).not.toThrow();
});

test('functions', () => {
  function named() {
    return 1;
  }
  // default: functions shown as [Function: name]
  expect(render([named])).toContain('[Function: named]');
  expect(render([() => 1])).toContain('[Function');
  // printFunction: true renders the full source
  expect(render([named], { printFunction: true })).toContain('return 1');
});

test('dates render as ISO strings', () => {
  expect(render([new Date('2020-01-02T03:04:05.000Z')])).toContain('2020-01-02T03:04:05.000Z');
});

test.each([
  [
    'a null-prototype object',
    Object.assign(Object.create(null) as Record<string, unknown>, { safe: 'value' }),
    "safe: 'value'",
  ],
  [
    'an object with a throwing getter',
    {
      get unreadable(): never {
        throw new Error('getter must not escape');
      },
    },
    '{  }',
  ],
  [
    'a proxy with a throwing ownKeys trap',
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys must not escape');
        },
      }
    ),
    '{  }',
  ],
  ['an invalid date', new Date(NaN), 'Invalid Date'],
])('the console props renderer survives %s', (_name, value, expected) => {
  let out = '';
  expect(() => {
    out = render([value]);
  }).not.toThrow();
  expect(out).toContain('props> ');
  expect(out).toContain(expected);
});

test('the console props renderer cannot turn an async traced result into a rejection', async () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('ownKeys must not escape');
      },
    }
  );
  const lifecycle = __startTrace('asyncHostile', [], {
    moduleId: 'IT',
    resultAsProps: true,
    printResult: true,
  });

  await expect(
    Promise.resolve(hostile).then((result) => {
      lifecycle.success(result);

      return result;
    })
  ).resolves.toBe(hostile);
  expect(lastOutput()).toContain('props> ');
});

test.each([
  ['line feed', '\n', '\\u000a'],
  ['carriage return', '\r', '\\u000d'],
  ['ANSI escape', '\u001b', '\\u001b'],
  ['8-bit CSI', '\u009b', '\\u009b'],
])(
  'the console props renderer escapes %s in string, key, and symbol data',
  (_name, control, escaped) => {
    const out = render([
      `string${control}value`,
      { [`key${control}name`]: `object${control}value` },
      Symbol(`symbol${control}value`),
    ]);

    expect(out).toContain(`string${escaped}value`);
    expect(out).toContain(`key${escaped}name`);
    expect(out).toContain(`object${escaped}value`);
    expect(out).toContain(`Symbol(symbol${escaped}value)`);
  }
);

test('the console props renderer uses intrinsic Date and Function formatting while preserving function layout', () => {
  const date = new Date('2020-01-02T03:04:05.000Z');
  Object.defineProperty(date, 'toISOString', {
    value: () => 'forged\u001b[2J date',
  });
  function layout() {
    return 'source';
  }
  Object.defineProperty(layout, 'toString', {
    value: () => 'forged\u001b[2J function',
  });

  const out = render([date, layout], { printFunction: true });
  expect(out).toContain('2020-01-02T03:04:05.000Z');
  expect(out).toMatch(/return ['"]source['"];/);
  expect(out).toMatch(/\n\s+return/);
  expect(out).not.toContain('forged');
  expect(out).not.toContain('\u001b');
});

test('cyclic structures render [Circular] instead of overflowing the stack', () => {
  // the printer tracks the objects/arrays on the current recursion path (a WeakSet) and renders a
  // back-edge as [Circular], so a self-reference does not recurse to a RangeError — even with no
  // depth limit set (the default). See PropsPrinter.guarded / PropsPrinter._seen.
  const cyclicObj: Record<string, unknown> = { name: 'root' };
  cyclicObj.self = cyclicObj;
  const objOut = render([cyclicObj]);
  expect(objOut).toContain("name: 'root'");
  expect(objOut).toContain('self: [Circular]');

  const cyclicArr: unknown[] = [1];
  cyclicArr.push(cyclicArr);
  expect(render([cyclicArr])).toContain('[ 1, [Circular] ]');
});

test('a repeated but non-cyclic reference among siblings is printed in full each time', () => {
  // the cycle guard marks ancestors only and unwinds them, so a shared child that is NOT an
  // ancestor must still render normally rather than being mistaken for a cycle.
  const shared = { v: 1 };
  const out = render([{ a: shared, b: shared }]);
  expect(out).toContain('a: { v: 1 }');
  expect(out).toContain('b: { v: 1 }');
  expect(out).not.toContain('[Circular]');
});

test('a long props block on the NONE module renders instead of crashing', () => {
  // regression: the expanded props box used `Array(depth - 1)`, which threw
  // `RangeError: Invalid array length` when the NONE module gave a column depth of 0.
  const longArr = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd', 'eeeeeeeeee'];
  let out = '';
  expect(() => {
    Loxer.pp().log('big', longArr);
    out = lastOutput();
  }).not.toThrow();
  expect(out).toContain('aaaaaaaaaa');
  expect(out).toContain('eeeeeeeeee');
  // past 50 plain characters the block opens its own horizontal rule instead of the inline glyph
  expect(out).toContain('┘ props>');
  expect(out).toContain('┐ <props');
});

test('colored output emits ANSI escape codes', () => {
  resetLoxer();
  initProps(true);
  const out = render([[1, 2, 3]]);
  // colored mode wraps values in ANSI SGR sequences
  expect(out).toContain('\x1b[');
  expect(out).toContain('┃ props> ');
});

test('plain public printing skips ANSI value formatting', () => {
  const formatNumber = vi.spyOn(ANSIFormat, 'fgNumber');
  PropsPrinter.ofValues([1]).print(false);
  expect(formatNumber).not.toHaveBeenCalled();
  PropsPrinter.ofValues([1]).print(true);
  expect(formatNumber).toHaveBeenCalled();
  formatNumber.mockRestore();
});

// ##### the public printer #######################################################################

test('a callback author reproduces the built-in block from the exported printer alone', () => {
  Loxer.m('IT').open('outer');
  Loxer.m('IT').open('inner');
  Loxer.pp().m('IT').log('msg', { id: 'p1' });
  const lox = lastLox();
  expect(lox.printProps).toEqual({});
  const markerDepth = BoxFactory.getMarkerDepth(lox.box);
  expect(markerDepth).not.toBe(lox.box.length);
  // the same call the built-in output makes, reachable from the package's own exports
  const reproduced = PropsPrinter.of(lox).print(false, {
    depth: lox.module.slicedName.length + markerDepth,
    color: lox.module.color,
  });
  expect(lastOutput().endsWith(reproduced)).toBe(true);
});

test('the printer reads its configuration off the lox', () => {
  render([{ a: { b: 1 } }], { depth: 1 });
  expect(PropsPrinter.of(lastLox()).print(false)).toContain('{ a: {1 entries} }');
});

test('ofValues renders values that belong to no log', () => {
  expect(PropsPrinter.ofValues([1, 'two']).print(false)).toBe("\n1, 'two'");
  expect(PropsPrinter.ofValues([{ a: 1 }], { depth: 0 }).print(false)).toBe('\n{1 entries}');
  expect(PropsPrinter.ofValues([]).print(false)).toBe('');
});

test('singleLine renders any value onto one line', () => {
  const deep = { a: { b: { c: 'ccccccccccccccccccccccccccccc', d: 'ddddddddddddddddddddddd' } } };
  const line = PropsPrinter.singleLine(deep);
  expect(line).not.toContain('\n');
  expect(line.length).toBeGreaterThan(70);
});
