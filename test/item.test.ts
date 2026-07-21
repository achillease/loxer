import { vi, type Mock } from 'vitest';
import { Loxer, resetLoxer } from '../src';
import { OutputLox, ErrorLox } from '../src/loxes';
import { ItemOptions, ItemType } from '../src/core/Item';

// mock console so the default (no-callback) output stream is captured
global.console.log = vi.fn();
global.console.error = vi.fn();

// prod callbacks only — dev/log callbacks are intentionally NOT registered so that
// OutputStreams.devLogOut falls through to the console path that actually runs
// `Item.of(lox).prettify(...)`. Registering a devLog would bypass Item entirely.
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox) {
  prodErrors.push(log);
}

function initItems(colored: boolean) {
  Loxer.init({
    dev: true,
    callbacks: { prodLog, prodError },
    modules: { IT: { fullName: 'Item', color: '#0f0', devLevel: 1, prodLevel: 0 } },
    config: { disableColors: !colored },
  });
  (console.log as Mock).mockClear();
}

/** the string passed to the most recent `console.log` call */
function lastOutput(): string {
  const calls = (console.log as Mock).mock.calls;
  return calls.length ? calls[calls.length - 1][0] : '';
}

/** log an item with options through the default console path and return the rendered string */
function render(item: ItemType, itemOptions?: ItemOptions): string {
  Loxer.m('IT').log('msg', item, itemOptions);
  return lastOutput();
}

beforeEach(() => initItems(false));

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

test('the default console path actually renders the item', () => {
  const out = render(42);
  // the item box marker proves Item.prettify ran (it does not appear for item-less logs)
  expect(out).toContain('┃ item> ');
  expect(out).toContain('42');
  // a log with no item takes the else-branch and renders no item box
  Loxer.log('no item');
  expect(lastOutput()).not.toContain('┃ item> ');
});

test('truthy primitives', () => {
  expect(render(42)).toContain('42');
  expect(render('hello')).toContain("'hello'");
  expect(render(true)).toContain('true');
  expect(render(Symbol('sym'))).toContain('Symbol(sym)');
});

test('falsy items are not rendered by the default output path', () => {
  // NOTE (product observation): OutputStreams gates rendering behind `if (outputLox.item)`,
  // a truthiness check, so falsy items never reach Item.prettify even though Item can render
  // them (printBoolean/printUndefined). This locks current behavior.
  for (const falsy of [false, 0, '', null, undefined]) {
    expect(render(falsy as ItemType)).not.toContain('┃ item> ');
  }
});

test('array shape', () => {
  expect(render([1, 2, 3])).toContain('[ 1, 2, 3 ]');
  expect(render(['a', 'b'])).toContain("[ 'a', 'b' ]");
});

test('nested object shape', () => {
  expect(render({ a: 1, b: 'two' })).toContain("{ a: 1, b: 'two' }");
  expect(render({ outer: { inner: 1 } })).toContain('{ outer: { inner: 1 } }');
});

test('depth truncation to type + length', () => {
  // arrays past the depth limit collapse to `[n elements]`
  expect(render([1, [2, 3, 4]], { depth: 1 })).toContain('[ 1, [3 elements] ]');
  // objects past the depth limit collapse to `{n entries}`
  expect(render({ a: { b: 1, c: 2 } }, { depth: 1 })).toContain('{ a: {2 entries} }');
});

test('keys filtering keeps listed keys and marks the rest', () => {
  const out = render({ keep: 1, drop: 2, gone: 3 }, { keys: ['keep'] });
  expect(out).toContain('keep: 1');
  expect(out).not.toContain('drop');
  expect(out).not.toContain('gone');
  // two keys were cut
  expect(out).toContain('+(2 entries)');
});

test('keys filtering that removes everything renders {...}', () => {
  const out = render({ drop: 1, gone: 2 }, { keys: ['missing'] });
  expect(out).toContain('{...}');
});

test('class instances', () => {
  class Foo {
    x = 1;
    y = 2;
  }
  // top-level class instance: shown as [Class: Name] = { ...props }
  expect(render(new Foo())).toContain('[Class: Foo] = { x: 1, y: 2 }');
  // nested class instance, shortenClasses default (true): collapsed to [Class: Name]
  expect(render({ foo: new Foo() })).toContain('foo: [Class: Foo]');
  // nested class instance, shortenClasses false: destructured to its properties
  expect(render({ foo: new Foo() }, { shortenClasses: false })).toContain('foo: { x: 1, y: 2 }');
});

test('functions', () => {
  function named() {
    return 1;
  }
  // default: functions shown as [Function: name]
  expect(render(named)).toContain('[Function: named]');
  expect(render(() => 1)).toContain('[Function');
  // printFunction: true renders the full source
  expect(render(named, { printFunction: true })).toContain('return 1');
});

test('dates render as ISO strings', () => {
  const d = new Date('2020-01-02T03:04:05.000Z');
  expect(render(d)).toContain('2020-01-02T03:04:05.000Z');
});

test('cyclic structures render [Circular] instead of overflowing the stack', () => {
  // Item tracks the objects/arrays on the current recursion path (a WeakSet) and renders a
  // back-edge as [Circular], so a self-reference no longer recurses to a RangeError — even with
  // no depth limit set (the default). See Item.guarded / Item._seen.
  const cyclicObj: Record<string, unknown> = { name: 'root' };
  cyclicObj.self = cyclicObj;
  const objOut = render(cyclicObj);
  expect(objOut).toContain("name: 'root'");
  expect(objOut).toContain('self: [Circular]');

  const cyclicArr: unknown[] = [1];
  cyclicArr.push(cyclicArr);
  expect(render(cyclicArr)).toContain('[ 1, [Circular] ]');
});

test('a repeated but non-cyclic reference among siblings is printed in full each time', () => {
  // the cycle guard marks ancestors only and unwinds them, so a shared child that is NOT an
  // ancestor must still render normally rather than being mistaken for a cycle.
  const shared = { v: 1 };
  const out = render({ a: shared, b: shared });
  expect(out).toContain('a: { v: 1 }');
  expect(out).toContain('b: { v: 1 }');
  expect(out).not.toContain('[Circular]');
});

test('a long item on the NONE module renders instead of crashing', () => {
  // regression: the expanded item box used `Array(depth - 1)`, which threw
  // `RangeError: Invalid array length` when the NONE module gave a column depth of 0.
  const longArr = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd', 'eeeeeeeeee'];
  let out = '';
  expect(() => {
    Loxer.log('big', longArr);
    out = lastOutput();
  }).not.toThrow();
  expect(out).toContain('aaaaaaaaaa');
  expect(out).toContain('eeeeeeeeee');
});

test('colored output emits ANSI escape codes', () => {
  resetLoxer();
  initItems(true);
  const out = render([1, 2, 3]);
  // colored mode wraps values in ANSI SGR sequences
  expect(out).toContain('\x1b[');
  expect(out).toContain('┃ item> ');
});
