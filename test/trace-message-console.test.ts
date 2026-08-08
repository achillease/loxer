import { vi, type Mock } from 'vitest';
import { Loxer, resetLoxer } from '../src';
import { __startTrace } from '../src/trace';

// the built-in development console is only reached when no `devLog`/`devError` callback is
// registered (`src/core/OutputStreams.ts`) - registering one bypasses the console fallback
// entirely, per `rules/testing.md`
global.console.log = vi.fn();

beforeEach(() => {
  resetLoxer();
});

afterEach(() => {
  resetLoxer();
});

test("the built-in development console shows a traced call's payload colored", () => {
  Loxer.init({
    dev: true,
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'info', prodLevel: 'error', fullName: 'Trace' },
    },
  });
  (console.log as Mock).mockClear();

  const trace = __startTrace(
    'calculate',
    [19.95, 3],
    { moduleId: 'TRACE', openMessage: 'parent.fn(args)', closeMessage: 'fn(result)' },
    'Checkout'
  );
  trace.success({ total: 59.85 });

  const calls = (console.log as Mock).mock.calls.map((call) => call[0] as string);
  expect(calls).toHaveLength(2);
  const [openLine, closeLine] = calls;

  // the parent, the name, and each argument carry their own palette color on the open line
  expect(openLine).toContain('\x1b[38;2;78;201;176mCheckout\x1b[0m');
  expect(openLine).toContain('\x1b[38;2;144;237;32mcalculate\x1b[0m');
  expect(openLine).toContain('\x1b[38;2;18;129;14m19.95\x1b[0m');
  expect(openLine).toContain('\x1b[38;2;18;129;14m3\x1b[0m');
  // the close line's own color (fgCloseLog) still applies - it just carries a different payload
  expect(closeLine).toContain('\x1b[38;2;144;237;32mcalculate\x1b[0m');
  expect(closeLine).toContain('\x1b[38;2;18;129;14m{"total":59.85}\x1b[0m');

  // the raw lox that reaches the history is the plain, escape-free form regardless of what the
  // console rendered - `history` is newest-first and also carries the `Loxer.init()` announcement
  expect(Loxer.history.slice(0, 2).map((log) => log.message)).toEqual([
    'calculate({"total":59.85}) done',
    'Checkout.calculate(19.95, 3)',
  ]);
  Loxer.history.forEach((log) => expect(log.message).not.toMatch(/\x1b/));
});

test('the built-in development console colors the parent and function name with the default parent.fn template, but never an omitted payload', () => {
  Loxer.init({
    dev: true,
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'info', prodLevel: 'error', fullName: 'Trace' },
    },
  });
  (console.log as Mock).mockClear();

  const trace = __startTrace('calculate', [19.95, 3], { moduleId: 'TRACE' }, 'Checkout');
  trace.success({ total: 59.85 });

  const calls = (console.log as Mock).mock.calls.map((call) => call[0] as string);
  // the default parent.fn template colors both the parent and the function name...
  expect(calls[0]).toContain('\x1b[38;2;78;201;176mCheckout\x1b[0m.\x1b[38;2;144;237;32mcalculate\x1b[0m()');
  // ...but never an omitted payload (fgString)
  expect(calls[0]).not.toContain('\x1b[38;2;18;129;14m');
});
