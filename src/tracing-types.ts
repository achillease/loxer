import { BoxLevel, ModuleId } from './types.js';

export type TraceHighlight = 'open' | 'close' | 'all';

/**
 * How the opening box message is built for `@trace()` and `trace()`.
 *
 * Presets render against the traced name (`propertyKey` for methods, the binding name for plain
 * functions):
 * - `'functionName'` — `calculate()` (also the default when `openMessage` is omitted)
 * - `'parent.functionName'` — `Checkout.calculate()` for a method of a class, `checkout.calculate()`
 *   for a function written in `checkout.ts`
 * - `'args'` — `calculate(19.95, 3)` (arguments stringified into the message)
 * - `'types'` — `calculate(number, number)` (`typeof` each argument)
 *
 * A callback receives the call's argument tuple and must return the message string. `Args` is
 * inferred from the target a `trace()` marker names; pass it explicitly on `@trace<Args, Result>()`
 * and on `trace<Args, Result>(options)`.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * trace(calculate, { openMessage: 'args' });
 *
 * ```
 *
 * ```ts
 * import { trace } from 'loxer';
 *
 * @trace<[number, number]>({
 *   openMessage: ([price, quantity]) => `Calculating ${price} × ${quantity}`,
 * })
 * calculate(price: number, quantity: number) { ... }
 * ```
 */
export type FunctionOpenMessage<Args extends readonly unknown[] = readonly unknown[]> =
  ((args: Args) => string) | 'functionName' | 'parent.functionName' | 'types' | 'args';

/**
 * How the successful closing box message is built for `@trace()` and `trace()`.
 *
 * Presets render against the traced name (`propertyKey` for methods, the binding name for plain
 * functions). For async targets the message uses the resolved (awaited) result, not the Promise:
 * - `'functionName'` — `calculate done` (also the default when `closeMessage` is omitted)
 * - `'parent.functionName'` — `Checkout.calculate done` for a method of a class,
 *   `checkout.calculate done` for a function written in `checkout.ts`
 * - `'result'` — `calculate done. returns: {"total":59.85}` (`JSON.stringify`)
 * - `'prettyResult'` — same as `'result'`, with indented JSON
 *
 * A callback receives that result and must return the message string. `Result` is inferred from the
 * target a `trace()` marker names; pass it explicitly on `@trace<Args, Result>()` and on
 * `trace<Args, Result>(options)`. Failures use a fixed `… failed` close message and ignore this
 * option.
 *
 * ### for functions
 * ```ts
 * calculate(price: number, quantity: number) { ... }
 * trace(calculate, { closeMessage: 'result' });
 * ```
 *
 * ### for decorators
 * ```ts
 * ​​​​​​@trace<[number, number], { total: number }>({
 *   closeMessage: (result) => `Total: ${result.total.toFixed(2)}`,
 * })
 * calculate(price: number, quantity: number) { ... }
 * ```
 */
export type FunctionCloseMessage<Result = unknown> =
  ((result: Result) => string) | 'functionName' | 'parent.functionName' | 'result' | 'prettyResult';

/**
 * Options shared by the `@trace()` method decorator and the `trace()` function marker in each of
 * its forms.
 *
 * A marker that names its target — `trace(target | [targets], options)` — infers `Args` and `Result`
 * from it, from the union of every listed target when it marks a list. `@trace()` and the
 * `trace(options)` marker inside a function have no signature in hand, so supply them explicitly
 * when formatter callbacks need precise types.
 * `parent.functionName` names the class a traced method belongs to — a decorated method, or a
 * method, getter, setter, or field a marker reaches inside a class body — and otherwise the file a
 * marked function is written in. A class name ending in `Class` reports without that suffix. The
 * decorator reads its class from the running instance, and the file name comes from the build, so a
 * decorated method that a call reaches detached from its class reports its own name alone.
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
  /** appends the arguments as the opening log item */
  argsAsItem?: boolean;
  /** appends the result as the closing log item */
  resultAsItem?: boolean;
}
