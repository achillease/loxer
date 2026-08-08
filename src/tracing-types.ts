import { PropsPrinterOptions } from './core/PropsPrinter.js';
import { BoxLevel, ModuleId } from './types.js';

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
 * How the opening box message is built for `@trace()` and `trace()`.
 *
 * Templates render against the traced name (`propertyKey` for methods, the binding name for plain
 * functions), and `parent.` prefixes it with the class a traced method belongs to, or the file a
 * traced plain function is written in. For a method `calculate(price: number, quantity: number)` of
 * class `Checkout`, called as `calculate(19.95, 3)`:
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
 * is inferred from the target a `trace()` marker names; pass it explicitly on
 * `@trace<Args, Result>()` and on `trace<Args, Result>(options)`.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * trace(calculate, { openMessage: 'fn(args)' });
 *
 * ```
 *
 * ```ts
 * import { trace } from 'loxer';
 *
 * @trace<[number, number]>({
 *   openMessage: ({ args: [price, quantity], parentFn }) => parentFn(`${price} × ${quantity}`),
 * })
 * calculate(price: number, quantity: number) { ... }
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
 * How the successful closing box message is built for `@trace()` and `trace()`.
 *
 * Templates render against the traced name (`propertyKey` for methods, the binding name for plain
 * functions), and `parent.` prefixes it the way {@link FunctionOpenMessage} describes. For async
 * targets the message uses the resolved (awaited) result, not the Promise. For a method `calculate`
 * of class `Checkout` returning `{ total: 59.85 }`:
 * - `'fn'` — `calculate done` (also the default when `closeMessage` is omitted)
 * - `'parent.fn'` — `Checkout.calculate done`
 * - `'fn(result)'` — `calculate({"total":59.85}) done` (`JSON.stringify`)
 * - `'parent.fn(result)'` — `Checkout.calculate({"total":59.85}) done`
 *
 * A result that does not serialize — a `void` function's, most of all — reports the `'fn'` /
 * `'parent.fn'` message of the same name form instead of a payload.
 *
 * A callback receives a {@link TraceCloseMessageContext} and must return the message string.
 * `Result` is inferred from the target a `trace()` marker names; pass it explicitly on
 * `@trace<Args, Result>()` and on `trace<Args, Result>(options)`. A failed call closes with
 * `… failed` in the name form this option selects, and never reaches a callback.
 *
 * ### for functions
 * ```ts
 * calculate(price: number, quantity: number) { ... }
 * trace(calculate, { closeMessage: 'fn(result)' });
 * ```
 *
 * ### for decorators
 * ```ts
 * ​​​​​​@trace<[number, number], { total: number }>({
 *   closeMessage: ({ result, fn }) => fn(result.total.toFixed(2)),
 * })
 * calculate(price: number, quantity: number) { ... }
 * ```
 */
export type FunctionCloseMessage<Result = unknown> =
  | ((context: TraceCloseMessageContext<Result>) => string)
  | 'fn'
  | 'parent.fn'
  | 'fn(result)'
  | 'parent.fn(result)';

/**
 * Options shared by the `@trace()` method decorator and the `trace()` function marker in each of
 * its forms.
 *
 * A marker that names its target — `trace(target | [targets], options)` — infers `Args` and `Result`
 * from it, from the union of every listed target when it marks a list. `@trace()` and the
 * `trace(options)` marker inside a function have no signature in hand, so supply them explicitly
 * when formatter callbacks need precise types.
 * A `parent.` template names the class a traced method belongs to — a decorated method, or a
 * method, getter, setter, or field a marker reaches inside a class body — and otherwise the file a
 * marked function is written in. A class name ending in `Class` reports without that suffix. The
 * decorator reads its class from the running instance, and the file name comes from the build, so a
 * decorated method that a call reaches detached from its class reports its own name alone. The
 * parent is discovered only where a `parent.` template or a callback's `parentFn` prints it.
 */
export interface TraceOptions<
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
> {
  /** controls the opening trace message */
  openMessage?: FunctionOpenMessage<Args>;
  /** controls the successful closing trace message */
  closeMessage?: FunctionCloseMessage<Result>;
  /** the corresponding key of a `LoxerModule` provided during `Loxer.init()`
   *
   * Is a `string` by default. Augment the `LoxerModuleRegistry` (exported from `loxer`) to have the
   * accepted ids autocompleted and typo-checked against the modules of your project.
   */
  moduleId?: ModuleId;
  /** the {@link BoxLevel} of the trace box. defaults to `'info'`
   *
   * `'error'` is not accepted, because a trace opens and closes a box while an error is a single
   * event.
   */
  level?: BoxLevel;
  /** the name a marked function reports in its box messages
   *
   * A function reached by a marker rather than by name — a literal passed to `trace()`, or the
   * function a `trace(options)` statement sits in — is named after itself, or after the binding,
   * assignment target, or property it belongs to: `const load = useCallback(trace(...), [])` reports
   * `load`. Supply `name` where nothing names it, such as
   * `useEffect(trace(() => { ... }, { name: 'syncOrders' }), [])`.
   *
   * Has to be a string literal, because the transform reads it while it builds. `@trace()` and
   * `trace(namedFunction, options)` know their target's name and ignore it.
   */
  name?: string;
  /** which lifecycle messages should be highlighted */
  highlight?: TraceHighlight;
  /** attaches the call's arguments to the opening log, one prop per argument */
  argsAsProps?: boolean;
  /** attaches a defined resolved result to the closing log, as a single prop; a `void` result
   * attaches none */
  resultAsProps?: boolean;
  /** asks the built-in output to render the opening log's props, and configures that rendering
   *
   * Like {@link TraceOptions.argsAsProps}, this only concerns the arguments. Set it to `true` for
   * the default configuration, or to a {@link PropsPrinterOptions} object to bound the rendering -
   * `{ depth: 1 }` keeps a wide argument list readable.
   */
  printArgs?: boolean | PropsPrinterOptions;
  /** asks the built-in output to render the closing log's props, and configures that rendering
   *
   * The counterpart of {@link TraceOptions.printArgs} for the result.
   */
  printResult?: boolean | PropsPrinterOptions;
}
