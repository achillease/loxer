import { sanitizeControlCharacters } from '../Helpers.js';
import type {
  FunctionCloseMessage,
  FunctionOpenMessage,
  TraceCallPrinter,
} from '../tracing-types.js';
import { stringifyMessage } from './PropsPrinter.js';
import { qualifiedFunctionName } from './TraceNames.js';

/** @internal What a marked region of a message is, which is what the built-in output colors it by.
 *
 * - `'value'` — caller data: an argument, a type, a result, or the content a callback handed a
 *   {@link TraceCallPrinter}
 * - `'fn'` — the traced function's own name
 * - `'parent'` — the class or file the function belongs to
 */
export type MessageSpanKind = 'value' | 'fn' | 'parent';

/** @internal A region of a message the built-in output colors.
 *
 * `start` is inclusive and `end` exclusive, both indices into {@link TraceMessage.text}.
 */
export interface MessageSpan {
  start: number;
  end: number;
  kind: MessageSpanKind;
}

/** @internal The brand key of a {@link TraceMessage}.
 *
 * `Symbol.for` rather than `Symbol()`, and keyed on the major version like the realm anchor, so that
 * every copy of Loxer's modules in one realm recognizes the carrier the other copy built — the
 * trace runtime and the funnel that reads the carrier can be two different copies.
 */
const TRACE_MESSAGE_BRAND: unique symbol = Symbol.for('loxer.traceMessage.3');

/** @internal A rendered trace message: the plain text a log carries, plus the regions of it that
 * came from the call rather than from the template.
 *
 * The trace runtimes pass this where a log takes its message. `Loxer` reads {@link TraceMessage.text}
 * as `lox.message` and stores {@link TraceMessage.spans} on the log, which is what lets the built-in
 * output color the message's parts while every plain form stays escape-free.
 */
export interface TraceMessage {
  readonly [TRACE_MESSAGE_BRAND]: true;
  readonly text: string;
  readonly spans: MessageSpan[];
}

/** @internal */
export function isTraceMessage(value: unknown): value is TraceMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<TraceMessage>)[TRACE_MESSAGE_BRAND] === true
  );
}

/** The characters that delimit a marked region while a message is being built: one opener per
 * {@link MessageSpanKind}, and one closer for all three.
 *
 * They are control characters, and `sanitizeControlCharacters` escapes control characters, so a
 * marker can never come from an argument, a result, or a callback's own text: everything the
 * renderer wraps is sanitized before it is wrapped.
 */
const MARK_START: Record<MessageSpanKind, string> = {
  value: '\u0011',
  fn: '\u0013',
  parent: '\u0014',
};
const MARK_END = '\u0012';

/** Every non-empty prefix of `text`, longest first, as one pattern: `a(?:b(?:c)?)?` for `abc`.
 *
 * Used to recognize a token a callback cut in half. The tokens are built from a decimal counter, a
 * base-36 random string and the fixed words `start` and `end`, so no character reaching here is one
 * a regex reads specially.
 */
function anyPrefixOf(text: string): string {
  const [first, ...rest] = text;

  return first + rest.reduceRight((tail, character) => `(?:${character}${tail})?`, '');
}

/** Every non-empty suffix of `text`, longest first. A token cut from the left inside its nonce loses
 * its opening delimiter, so the nonce suffix is the remaining piece that still identifies it as this
 * invocation's bookkeeping rather than caller text. */
function anySuffixOf(text: string): string {
  return `(?:${[...text].map((_character, index) => text.slice(index)).join('|')})`;
}

/** Every prefix of the two edge keywords, longest first. Ordered, because an alternative that can
 * match nothing would otherwise satisfy the pattern and leave the rest of the keyword in the
 * message. */
const EDGE_PREFIXES = '(?:start|star|sta|st|s|end|en|e)?';

let callbackTokenId = 0;

const EMPTY_SPANS: MessageSpan[] = [];

function plain(text: string): TraceMessage {
  return { [TRACE_MESSAGE_BRAND]: true, text, spans: EMPTY_SPANS };
}

/** The rendering rule for a value that is *there* — an argument the call passed, a result it
 * returned.
 *
 * `stringifyMessage` is the rule a log's own message takes, so a value the renderer prints reads
 * exactly as it would had the caller logged it directly; it renders an absent value empty, which is
 * what lets `fn()` and `fn(undefined)` alike print empty parentheses. Here `undefined` prints as
 * `undefined` instead, because `calculate(, given)` would hide an argument the caller did pass.
 */
function renderValue(value: unknown): string {
  return value === undefined ? 'undefined' : stringifyMessage(value);
}

function mark(kind: MessageSpanKind, text: string): string {
  return MARK_START[kind] + text + MARK_END;
}

/** Joins a call's parent to its name, each marked as its own region.
 *
 * `qualifiedFunctionName` still owns the joining rule; the guard keeps an absent parent absent
 * rather than handing it a marker pair with nothing inside.
 */
function markedQualifiedName(call: TraceCall): string {
  const parent = call.resolveParentName();

  return qualifiedFunctionName(
    parent.length > 0 ? mark('parent', parent) : '',
    mark('fn', call.name)
  );
}

/** Reduces a marked message to its plain text and the spans the markers enclosed.
 *
 * Markers travel through the concatenation, template literals and `.map().join()` a callback
 * composes with, which an offset table could not. A marker left unpaired — a callback that sliced
 * one off — colors nothing rather than swallowing the rest of the message.
 */
function extractSpans(marked: string): TraceMessage {
  let text = '';
  const spans: MessageSpan[] = [];
  let depth = 0;
  let start = 0;
  let kind: MessageSpanKind = 'value';
  for (let index = 0; index < marked.length; index++) {
    const character = marked[index];
    const opened = openedKind(character);
    if (opened !== undefined) {
      if (depth === 0) {
        start = text.length;
        kind = opened;
      }
      depth++;
    } else if (character === MARK_END) {
      if (depth > 0) {
        depth--;
        if (depth === 0 && text.length > start) {
          spans.push({ start, end: text.length, kind });
        }
      }
    } else {
      text += character;
    }
  }

  return spans.length > 0 ? { [TRACE_MESSAGE_BRAND]: true, text, spans } : plain(text);
}

function openedKind(character: string): MessageSpanKind | undefined {
  if (character === MARK_START.value) {
    return 'value';
  }
  if (character === MARK_START.fn) {
    return 'fn';
  }

  return character === MARK_START.parent ? 'parent' : undefined;
}

/** Builds the `fn` / `parentFn` a callback receives.
 *
 * Both are the same printer over a different name source, so a callback's `calculate(3)` is shaped
 * and colored exactly like the `'fn(args)'` template's. The content is any value at all, rendered by
 * the rule a log's own message takes.
 */
function callPrinter(
  renderName: () => string,
  markValue: (kind: MessageSpanKind, text: string) => string
): TraceCallPrinter {
  return (content?: unknown): string => {
    const value = stringifyMessage(content);

    return value.length > 0 ? `${renderName()}(${markValue('value', value)})` : `${renderName()}()`;
  };
}

/** @internal Builds the memoized parent-name resolver both trace runtimes hand the renderer.
 *
 * Resolution is deferred to the moment of use rather than gated on the options, because `parentFn`
 * reaches every callback and only the callback knows whether it prints one. Memoized because a
 * callback may print the parent more than once, while discovering it — reading the class off the
 * running instance — must happen at most once per call.
 */
export function parentNameResolver(resolveParentName: () => string): () => string {
  let resolved: string | undefined;

  return () => (resolved ??= stringifyMessage(resolveParentName()));
}

/** @internal The call a trace message is rendered from.
 *
 * `name` is the traced function's own sanitized name; `resolveParentName` returns the class or file
 * it belongs to — `''` where none is known — and is called only where a template or a callback
 * actually prints the parent.
 */
export interface TraceCall {
  name: string;
  resolveParentName: () => string;
}

/** The template an omitted `openMessage` renders: an opening message names where the call came from,
 * because that is the line a reader scans a box down from. `closeMessage` has no such default — its
 * box is already labelled by the open above it. */
const DEFAULT_OPEN_MESSAGE = 'parent.fn';

function usesParent(style: FunctionOpenMessage | FunctionCloseMessage | undefined): boolean {
  return typeof style === 'string' && style.startsWith('parent.');
}

/** The marked name a template renders against: the function alone, or its parent joined to it. */
function markedName(
  call: TraceCall,
  style: FunctionOpenMessage | FunctionCloseMessage | undefined
): string {
  return usesParent(style) ? markedQualifiedName(call) : mark('fn', call.name);
}

/** The callback-specific markers are opaque tokens rather than the renderer's control characters.
 * That lets a callback compose printer output with ordinary strings while ensuring only regions a
 * printer created become spans. */
function callbackMarkers(): {
  mark: (kind: MessageSpanKind, text: string) => string;
  extract: (text: string) => TraceMessage;
} {
  const id = `${++callbackTokenId}-${Math.random().toString(36).slice(2)}`;
  let nextTokenId = 0;
  const issued = new Map<number, { kind: MessageSpanKind; text: string }>();
  const token = (tokenId: number, edge: 'start' | 'end') => `\uE000${id}:${tokenId}:${edge}\uE001`;
  /** A printer's region: its own start token, whatever it now encloses, and the end token carrying
   * the same id back.
   *
   * The backreference is what keeps one printer's opener from pairing with another's closer, and the
   * replacer promotes a region only where its text is still exactly what that printer issued - so a
   * callback can move or repeat its own output, but cannot make a printer's delimiters color text
   * the printer never wrote.
   */
  const issuedRegion = new RegExp(
    `\\uE000${id}:(\\d+):start\\uE001([\\s\\S]*?)\\uE000${id}:\\1:end\\uE001`,
    'g'
  );
  /** What is left of one of this invocation's tokens once a callback has cut into its nonce.
   *
   * The first form keeps the opening delimiter and any non-empty nonce prefix. The second has lost
   * that delimiter and some of the nonce, but the nonce suffix still identifies the rest. Requiring
   * part of this invocation's nonce is deliberate: private-use delimiters are valid caller text, so
   * a blanket delimiter sweep would corrupt content a printer rendered through `stringifyMessage`.
   *
   * Once a cut removes the whole nonce, the remaining `:n:start` text is indistinguishable from text
   * the callback wrote itself and is therefore preserved rather than guessed at.
   */
  const noncePrefixRemnant = `\\uE000${anyPrefixOf(id)}(?::\\d*(?::${EDGE_PREFIXES})?)?\\uE001?`;
  const nonceSuffixRemnant = `${anySuffixOf(id)}:\\d+:(?:start|end)\\uE001?`;
  const incompleteToken = new RegExp(`${noncePrefixRemnant}|${nonceSuffixRemnant}`, 'g');
  const markCallback = (kind: MessageSpanKind, text: string) => {
    const tokenId = ++nextTokenId;
    issued.set(tokenId, { kind, text });

    return `${token(tokenId, 'start')}${text}${token(tokenId, 'end')}`;
  };

  return {
    mark: markCallback,
    extract: (text: string) => {
      // Two scans of the whole message, whatever a callback composed, rather than one per printer it
      // called.
      //
      // The replacements are functions, not strings: a replacement *string* substitutes `$$`, `$&`,
      // `` $` `` and `$'` even where the pattern is a plain string, so content carrying one would
      // collapse, splice a slice of the surrounding message in, or spill a token into the log.
      const marked = sanitizeControlCharacters(text)
        .replace(issuedRegion, (_region, tokenId: string, content: string) => {
          const issuedMarker = issued.get(Number(tokenId));

          return issuedMarker?.text === content
            ? `${MARK_START[issuedMarker.kind]}${content}${MARK_END}`
            : content;
        })
        // A callback can slice a printer's string, leaving a token whose mate is gone, and a region
        // nested inside another printer's content is consumed with it, so its own tokens arrive here
        // unpaired too. Drop what is left of one, then let the unpaired-marker rule handle its mate.
        .replace(incompleteToken, '');

      return extractSpans(marked);
    },
  };
}

/** The printers a callback receives, over the same marking the templates use. */
function printers(
  call: TraceCall,
  markCallback: (kind: MessageSpanKind, text: string) => string
): { fn: TraceCallPrinter; parentFn: TraceCallPrinter } {
  return {
    fn: callPrinter(() => markCallback('fn', call.name), markCallback),
    parentFn: callPrinter(() => {
      const parent = call.resolveParentName();

      return qualifiedFunctionName(
        parent.length > 0 ? markCallback('parent', parent) : '',
        markCallback('fn', call.name)
      );
    }, markCallback),
  };
}

/** A callback's return value: sanitized around the markers its printers wrote, and replaced by the
 * phase's last-resort message where it is not a string.
 *
 * That message is the bare name, not the phase's default template: it is what the `catch` around the
 * whole rendering returns as well, so it must not resolve a parent — discovery is caller code that
 * can throw, and a throw from here would escape `renderOpenMessage` entirely.
 */
function fromCallback(
  message: unknown,
  fallback: () => TraceMessage,
  extract: (text: string) => TraceMessage
): TraceMessage {
  return typeof message === 'string' ? extract(message) : fallback();
}

/** @internal Renders the opening message of a traced call. */
export function renderOpenMessage(
  style: FunctionOpenMessage<any> | undefined,
  call: TraceCall & { args: readonly unknown[] }
): TraceMessage {
  const fallback = () => extractSpans(`${mark('fn', call.name)}()`);

  try {
    if (typeof style === 'function') {
      const callback = callbackMarkers();

      return fromCallback(
        style({ args: call.args, ...printers(call, callback.mark) }),
        fallback,
        callback.extract
      );
    }

    const name = markedName(call, style ?? DEFAULT_OPEN_MESSAGE);
    if (style === 'fn(args)' || style === 'parent.fn(args)') {
      return extractSpans(
        `${name}(${call.args.map((arg) => mark('value', renderValue(arg))).join(', ')})`
      );
    }
    if (style === 'fn(types)' || style === 'parent.fn(types)') {
      return extractSpans(
        `${name}(${call.args.map((arg) => mark('value', typeof arg)).join(', ')})`
      );
    }

    return extractSpans(`${name}()`);
  } catch {
    return fallback();
  }
}

/** @internal Renders the message a successfully finished traced call closes with. */
export function renderCloseMessage(
  style: FunctionCloseMessage<any> | undefined,
  call: TraceCall & { result: unknown }
): TraceMessage {
  const fallback = () => extractSpans(`${mark('fn', call.name)} done`);

  try {
    if (typeof style === 'function') {
      const callback = callbackMarkers();

      return fromCallback(
        style({ result: call.result, ...printers(call, callback.mark) }),
        fallback,
        callback.extract
      );
    }

    const name = markedName(call, style);
    if (style === 'fn(result)' || style === 'parent.fn(result)') {
      // a result that does not serialize - a `void` function's, most of all - reports the name form
      // its template selected rather than a literal `undefined` payload
      const serialized = serializeResult(call.result);
      if (serialized !== undefined) {
        return extractSpans(`${name}(${mark('value', renderValue(serialized))}) done`);
      }
    }

    return extractSpans(`${name} done`);
  } catch {
    return fallback();
  }
}

function serializeResult(result: unknown): string | undefined {
  try {
    return JSON.stringify(result);
  } catch {
    return undefined;
  }
}

/** @internal Renders the message a failed traced call closes with.
 *
 * A failure has no result, so it carries no payload and cannot invoke a callback; it keeps the name
 * form the close message selected, and a callback - which prints its own parent freely - reports the
 * parent form.
 */
export function renderFailureMessage(
  style: FunctionCloseMessage<any> | undefined,
  call: TraceCall
): TraceMessage {
  try {
    const name = typeof style === 'function' ? markedQualifiedName(call) : markedName(call, style);

    return extractSpans(`${name} failed`);
  } catch {
    return extractSpans(`${mark('fn', call.name)} failed`);
  }
}
