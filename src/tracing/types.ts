import { PropsPrinterOptions } from '../core/output/PropsPrinter.js';
import { LogLevel, ModuleId } from '../types.js';

/**
 * Which side of a traced call the marker's `h()` / `highlight()` modifier highlights.
 *
 * `'open'` highlights the opening box message, `'close'` the closing one — including the `… failed`
 * close a thrown error produces. `'all'` highlights both, which is also what `h(true)` and a bare
 * `h()` select. `h(false)` and an unmodified marker highlight neither.
 *
 * `trace.point` takes a boolean instead: a point is one log, with no open and close to separate.
 */
export type TraceHighlight = 'open' | 'close' | 'all';

/**
 * Renders a traced call the way the message templates do: the name, then `content` in parentheses,
 * each part colored as a template's is.
 *
 * `fn` prints the traced function's own name and `parentFn` prints it behind its parent, so `fn(3)`
 * reads as `calculate(3)` and `parentFn(3)` as `Checkout.calculate(3)`. Called with no content — or
 * with one that renders empty — each prints its name with empty parentheses. Text a callback writes
 * around a printer stays uncolored.
 *
 * `content` is any value at all, rendered by the rule a log's own message takes: a primitive through
 * `String()`, an object or a function as one compact line, so `fn(basket)` reads as the basket's
 * contents rather than as `[object Object]`.
 */
export type TraceCallPrinter = (content?: unknown) => string;

/** The printers a `trace.point` message callback receives. */
export interface TracePointMessageContext {
  /** renders the surrounding function as `calculate(content)` */
  fn: TraceCallPrinter;
  /** renders the surrounding function as `Checkout.calculate(content)` */
  parentFn: TraceCallPrinter;
}

/** A contextual `trace.point` message that preserves trace-name color spans. */
export type TracePointMessage = (context: TracePointMessageContext) => string;

/** What an `openMessage` callback receives: the call's arguments, and the printers that render it
 * in the shape the templates use. */
export interface TraceOpenMessageContext<Args extends readonly unknown[] = readonly unknown[]> {
  /** the call's argument tuple */
  args: Args;
  /** renders `calculate(content)` */
  fn: TraceCallPrinter;
  /** renders `Checkout.calculate(content)` */
  parentFn: TraceCallPrinter;
}

/** What a `closeMessage` callback receives: the call's resolved result, and the printers that render
 * it in the shape the templates use. */
export interface TraceCloseMessageContext<Result = unknown> {
  /** the resolved result of the call — for an async target the awaited value, not the Promise */
  result: Result;
  /** renders `calculate(content)` */
  fn: TraceCallPrinter;
  /** renders `Checkout.calculate(content)` */
  parentFn: TraceCallPrinter;
}

/**
 * How the opening box message is built for `trace.info()`.
 *
 * Templates render against the traced name, and `parent.` prefixes it with the class a traced
 * method belongs to, or the file a traced plain function is written in. For a method
 * `calculate(price: number, quantity: number)` of class `Checkout`, called as `calculate(19.95, 3)`:
 * - `'fn'` — `calculate()`
 * - `'parent.fn'` — `Checkout.calculate()` (also the default when `openMessage` is omitted)
 * - `'fn(types)'` — `calculate(number, number)` (`typeof` each argument)
 * - `'fn(args)'` — `calculate(19.95, 3)` (arguments stringified into the message)
 * - `'parent.fn(types)'` — `Checkout.calculate(number, number)`
 * - `'parent.fn(args)'` — `Checkout.calculate(19.95, 3)`
 *
 * Every template is colored in the props printer's palette: the text between the parentheses the way
 * a string is printed, the function name and its parent the way a function and a class are. The
 * parentheses, the separators and the ` done` suffix stay in the color of the message around them.
 *
 * A callback receives a {@link TraceOpenMessageContext} and must return the message string. `Args`
 * is inferred from the target a `trace.info()` marker names; pass it explicitly on
 * `trace.info<Args, Result>(options)`.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * trace.info(calculate, { openMessage: 'fn(args)' });
 * ```
 *
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * trace.info(calculate, {
 *   openMessage: ({ args: [price, quantity], parentFn }) => parentFn(`${price} × ${quantity}`),
 * });
 * ```
 *
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * function calculate(price: number, quantity: number) {
 *   trace.info<[number, number]>({
 *     openMessage: ({ args: [p, q], parentFn }) => parentFn(`${p} × ${q}`),
 *   });
 * }
 * ```
 */
export type FunctionOpenMessage<Args extends readonly unknown[] = readonly unknown[]> =
  | ((context: TraceOpenMessageContext<Args>) => string)
  | 'fn'
  | 'parent.fn'
  | 'fn(types)'
  | 'fn(args)'
  | 'parent.fn(types)'
  | 'parent.fn(args)';

/**
 * How the successful closing box message is built for `trace.info()`.
 *
 * Templates render against the traced name, and `parent.` prefixes it the way
 * {@link FunctionOpenMessage} describes. For async targets the message uses the resolved (awaited)
 * result, not the Promise. For a method `calculate` of class `Checkout` returning
 * `{ total: 59.85 }`:
 * - `'fn'` — `calculate done` (also the default when `closeMessage` is omitted)
 * - `'parent.fn'` — `Checkout.calculate done`
 * - `'fn(result)'` — `calculate({"total":59.85}) done` (`JSON.stringify`)
 * - `'parent.fn(result)'` — `Checkout.calculate({"total":59.85}) done`
 *
 * A result that does not serialize — a `void` function's, most of all — reports the `'fn'` /
 * `'parent.fn'` message of the same name form instead of a payload.
 *
 * A callback receives a {@link TraceCloseMessageContext} and must return the message string.
 * `Result` is inferred from the target a `trace.info()` marker names; pass it explicitly on
 * `trace.info<Args, Result>(options)`. A failed call closes with `… failed` in the name form this
 * option selects, and never reaches a callback.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * function calculate(price: number, quantity: number) { ... }
 *
 * trace.info(calculate, { closeMessage: 'fn(result)' });
 * ```
 *
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * trace.info(calculate, {
 *   closeMessage: ({ result, fn }) => fn(result.total.toFixed(2)),
 * });
 * ```
 */
export type FunctionCloseMessage<Result = unknown> =
  | ((context: TraceCloseMessageContext<Result>) => string)
  | 'fn'
  | 'parent.fn'
  | 'fn(result)'
  | 'parent.fn(result)';

/** The lifecycle side a fluent trace marker modifier addresses. */
export type TracePropsTarget = 'args' | 'result' | 'argsResult';

/** Props-printer options for a fluent trace marker, including its required lifecycle routing. */
export interface TracePrintOptions extends PropsPrinterOptions {
  target: TracePropsTarget;
}

/**
 * The options object a `trace.info()` marker accepts: what the call is named, and how its opening
 * and closing messages are built. The transform reads `name` while it builds, so that one field has
 * to be a string literal; `openMessage` and `closeMessage` are evaluated at run time, which is why
 * either may be a callback rather than a template.
 *
 * Module routing, level, highlighting and props capture are the marker's fluent chain
 * (`trace.m('DB').h().props('args').info(...)`) rather than fields here.
 *
 * A marker that names its target — `trace.info(target | [targets], options)` — infers `Args` and
 * `Result` from it, from the union of every listed target when it marks a list. The
 * `trace.info(options)` marker inside a function has no signature in hand, so supply them
 * explicitly when formatter callbacks need precise types.
 *
 * A `parent.` template names the class a traced method, getter, setter or field belongs to, and
 * otherwise the file a marked function is written in. A class name ending in `Class` reports
 * without that suffix. The parent is discovered only where a `parent.` template or a callback's
 * `parentFn` prints it.
 */
export interface TraceOptions<
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
> {
  /** the name a marked function reports in its box messages
   *
   * A function reached by a marker rather than by name — a literal passed to `trace.info()`, or the
   * function a `trace.info(options)` statement sits in — is named after itself, or after the
   * binding, assignment target, or property it belongs to:
   * `const load = useCallback(trace.info(...), [])` reports `load`. Supply `name` where nothing
   * names it, such as `useEffect(trace.info(() => { ... }, { name: 'syncOrders' }), [])`.
   *
   * Has to be a string literal, because the transform reads it while it builds.
   * `trace.info(namedFunction, options)` knows its target's name and ignores it.
   */
  name?: string;
  /** controls the opening trace message */
  openMessage?: FunctionOpenMessage<Args>;
  /** controls the successful closing trace message */
  closeMessage?: FunctionCloseMessage<Result>;
}

/** @internal Configuration emitted by `babel-plugin-loxer-trace` for a fluent marker. */
export interface TraceRuntimeOptions {
  markerOptions?: TraceOptions;
  moduleId?: ModuleId;
  highlight?: boolean | TraceHighlight;
  level?: LogLevel;
  propsTarget?: TracePropsTarget;
  printProps?: TracePropsTarget | TracePrintOptions;
}

/** A contextual selector accepted by a {@link TracePoint} terminal call. */
export type TracePointSelector = 'fn' | 'parent.fn';

/** Runtime configuration emitted for one build-time {@link trace.point} call. @internal */
export interface TracePointRuntimeOptions {
  hasModule?: boolean;
  highlight?: boolean;
  level?: LogLevel;
  moduleId?: ModuleId;
  printProps?: PropsPrinterOptions;
}
