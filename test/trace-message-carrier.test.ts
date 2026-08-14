import { Loxer, resetLoxer } from '../src';
import type { MessageSpanKind } from '../src/tracing/TraceMessage';

/** The carrier's brand key. `Symbol.for` is deliberate — it is what lets two copies of Loxer's
 * modules in one realm recognize each other's carrier — and the cost of that choice is that a caller
 * can build a lookalike and hand it to a public logging method. These tests pin what the funnel does
 * with one, so the validation that makes the choice safe cannot be removed unnoticed. */
const BRAND = Symbol.for('loxer.traceMessage.3');

function forge(text: unknown, spans: unknown): unknown {
  return { [BRAND]: true, text, spans };
}

/** the message and spans the one logged lox ended up carrying */
function logged(message: unknown): { message: string; spans: unknown[] } {
  Loxer.m('IT').log(message as string);
  const lox = Loxer.history[0];

  return { message: lox.message, spans: lox.messageSpans };
}

beforeEach(() => {
  resetLoxer();
  Loxer.init({
    dev: true,
    // no devLog callback: nothing here depends on the output stream, only on the lox the funnel built
    modules: { IT: { fullName: 'Carrier', color: '#0f0', devLevel: 'debug', prodLevel: 'error' } },
  });
});

afterEach(() => {
  resetLoxer();
});

test('a forged carrier cannot smuggle an escape sequence into the message', () => {
  const { message, spans } = logged(forge('red[31mtext', []));

  // sanitized exactly as a plain string message is, whatever the brand claims
  expect(message).toBe('red\\u001b[31mtext');
  expect(message).not.toContain('');
  expect(spans).toEqual([]);
});

test('a plain string message and a forged carrier holding the same text sanitize identically', () => {
  const hostile = 'a[31mb\nc';
  const viaCarrier = logged(forge(hostile, [])).message;
  resetLoxer();
  Loxer.init({
    dev: true,
    modules: { IT: { fullName: 'Carrier', color: '#0f0', devLevel: 'debug', prodLevel: 'error' } },
  });
  const viaString = logged(hostile).message;

  // forging the brand grants no capability a caller does not already have by logging a string
  expect(viaCarrier).toBe(viaString);
});

test.each([
  { name: 'reaching past the end of the text', spans: [{ start: 0, end: 999, kind: 'value' }] },
  { name: 'a negative start', spans: [{ start: -5, end: 3, kind: 'value' }] },
  { name: 'an end at or before its start', spans: [{ start: 3, end: 3, kind: 'value' }] },
  { name: 'a non-integer bound', spans: [{ start: 0.5, end: 2, kind: 'value' }] },
  { name: 'a kind that is not a span kind', spans: [{ start: 0, end: 2, kind: 'evil' }] },
  {
    name: 'overlapping siblings',
    spans: [
      { start: 0, end: 4, kind: 'fn' },
      { start: 2, end: 6, kind: 'value' },
    ],
  },
  {
    name: 'siblings out of order',
    spans: [
      { start: 4, end: 6, kind: 'fn' },
      { start: 0, end: 2, kind: 'value' },
    ],
  },
  { name: 'not an array at all', spans: 'nope' },
])('a forged carrier with $name contributes no spans', ({ spans }) => {
  const result = logged(forge('safe text', spans));

  // one bad span drops every span rather than half of them, so a partially-trusted set can never
  // reach the colorer
  expect(result.spans).toEqual([]);
  expect(result.message).toBe('safe text');
});

test('a forged carrier whose spans are well formed is accepted, and only within the text it names', () => {
  const spans: { start: number; end: number; kind: MessageSpanKind }[] = [
    { start: 0, end: 8, kind: 'parent' },
    { start: 9, end: 18, kind: 'fn' },
  ];

  const result = logged(forge('Checkout.calculate', spans));

  expect(result.message).toBe('Checkout.calculate');
  expect(result.spans).toEqual(spans);
});

test('a carrier whose text is not a string is rendered as the ordinary value it is', () => {
  // `isTraceMessage` only checks the brand, so the text is checked where it is read - and failing
  // that check hands the whole object to the rule any other logged value takes, rather than
  // treating a non-string as a message
  expect(logged(forge(42, [])).message).toBe('{ text: 42, spans: [  ] }');
  expect(logged(forge(undefined, [])).spans).toEqual([]);
});

test('a getter that throws while the carrier is read cannot escape the logging call', () => {
  const hostile = {
    [BRAND]: true,
    get text(): string {
      throw new Error('hostile getter');
    },
    spans: [],
  };

  expect(() => logged(hostile)).not.toThrow();

  // and the log still arrives: the throw is contained, not swallowed along with the message
  const { message, spans } = logged(hostile);
  expect(typeof message).toBe('string');
  expect(spans).toEqual([]);
});
