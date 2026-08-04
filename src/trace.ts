import { resolveBoxLevel } from './core/Levels.js';
import { resolveTracePrintProps } from './core/PropsPrinter.js';
import { qualifiedFunctionName } from './core/TraceNames.js';
import { sanitizeControlCharacters } from './Helpers.js';
import { Loxer } from './Loxer.js';
import {
  FunctionCloseMessage,
  FunctionOpenMessage,
  TraceOptions,
  TraceHighlight,
} from './tracing-types.js';

export type { TraceOptions } from './tracing-types.js';

type PlainFunctionTraceTarget = (...args: any[]) => unknown;

export interface FunctionTrace {
  readonly id: number;
  success(result: any): void;
  failure(error: any): void;
}

/** @internal */
export function __setTraceFunctionLength(
  target: (...args: any[]) => unknown,
  length: number
): void {
  Object.defineProperty(target, 'length', { value: length });
}

/**
 * Restores a wrapper's `Function.length` and returns it, for the expression positions that cannot
 * take a separate statement.
 *
 * @internal
 */
export function __withTraceFunctionLength<T extends PlainFunctionTraceTarget>(
  target: T,
  length: number
): T {
  Object.defineProperty(target, 'length', { value: length });

  return target;
}

/**
 * Observes an ordinary function's native Promise result without changing the value returned to its caller.
 *
 * @internal
 */
export function __observeTraceResult(traceState: FunctionTrace, result: any): boolean {
  try {
    Promise.prototype.then.call(
      result,
      (value) => traceState.success(value),
      (error) => traceState.failure(error)
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Marks one plain function for `babel-plugin-loxer-trace`.
 *
 * The target is either a named binding — a function declaration or a function-initialized variable,
 * marked by a standalone `trace(name, options)` statement beside it — or a function literal passed
 * straight to the marker, which traces it where it stands and evaluates to the traced function:
 *
 * ```ts
 * const load = useCallback(trace(async (id: string) => { ... }, { moduleId: 'ORDER' }), []);
 * ```
 *
 * A traced function opens one box per invocation, links the direct `Loxer` calls in its body to
 * that box, and keeps its callable behavior unchanged. A function literal reports the name of the
 * binding, assignment target, or property it belongs to; supply `name` where nothing names it.
 *
 * The build-time trace transform removes this call. Reaching it at runtime means the transform is
 * missing.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * function load(id: string) { ... }
 *
 * trace(load, { moduleId: 'ORDER', openMessage: 'args' });
 * ```
 */
export function trace<T extends PlainFunctionTraceTarget>(
  target: T,
  options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>
): T;
/**
 * Marks every named plain-function binding in an array literal for `babel-plugin-loxer-trace`.
 *
 * The listed bindings share the marker's options, which are evaluated once for the whole group, and
 * are otherwise traced on their own: one box per invocation, their own linked direct `Loxer` calls,
 * and unchanged callable behavior.
 *
 * The build-time trace transform removes this call. Reaching it at runtime means the transform is
 * missing.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * function load(id: string) { ... }
 * function save(id: string) { ... }
 *
 * trace([load, save], { moduleId: 'ORDER', openMessage: 'args' });
 * ```
 */
export function trace<T extends PlainFunctionTraceTarget>(
  targets: readonly T[],
  options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>
): void;
/**
 * Marks the function this call sits in for `babel-plugin-loxer-trace`.
 *
 * The marker has to be the first statement of that function's block body. Because it leaves the
 * function itself untouched, it reaches the call sites a wrapper cannot — the inline callback a
 * memoizing hook has to receive, for instance:
 *
 * ```ts
 * const load = useCallback(async (id: string) => {
 *   trace({ moduleId: 'ORDER', openMessage: 'args' });
 *
 *   return (await fetch(`/orders/${id}`)).json();
 * }, []);
 * ```
 *
 * The box is named after the function itself, or after the binding, assignment target, or property
 * it belongs to; supply `name` where nothing names it. These options sit inside the traced function,
 * so they are evaluated once per invocation, and they may read its parameters but nothing its body
 * declares. `Args` and `Result` have no signature to be inferred from here — pass them as type
 * arguments where a formatter callback needs them.
 *
 * The build-time trace transform removes this call. Reaching it at runtime means the transform is
 * missing.
 *
 * @example
 * ```ts
 * import { trace } from 'loxer/trace';
 *
 * function load(id: string) {
 *   trace<[string], Order>({ moduleId: 'ORDER', closeMessage: (order) => order.state });
 *   ...
 * }
 * ```
 */
export function trace<Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
  options?: TraceOptions<Args, Result>
): void;
export function trace(
  _targetOrOptions?:
    PlainFunctionTraceTarget | readonly PlainFunctionTraceTarget[] | TraceOptions<any, any>,
  _options?: TraceOptions<any, any>
): any {
  throw new Error(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace or ' +
      'vite-plugin-loxer-trace before executing this module.'
  );
}

/**
 * Starts the runtime lifecycle emitted by `babel-plugin-loxer-trace`.
 *
 * The transform passes `parentName` — the class a traced method belongs to, or the file a traced
 * function is written in — which is what the `'parent.functionName'` message styles render against.
 *
 * @internal
 */
export function __startTrace(
  functionName: string,
  args: any[],
  options: TraceOptions = {},
  parentName?: string
): FunctionTrace {
  const { highlight, moduleId } = options;
  const level = resolveBoxLevel(options.level);
  // a name reaches this from the `name` option or a string-literal property key as well as from an
  // identifier, so it carries no more guarantee about control characters than an argument does
  const safeName = sanitizeMessage(functionName);
  // only the `'parent.functionName'` styles read the parent, so a trace that names neither pays
  // nothing for it — this runs on every traced call, ahead of the level that decides whether the
  // log is written at all
  const needsParentName =
    options.openMessage === 'parent.functionName' || options.closeMessage === 'parent.functionName';
  const parentQualifiedName =
    needsParentName && parentName !== undefined
      ? qualifiedFunctionName(sanitizeMessage(parentName), safeName)
      : safeName;
  const openMessage = getOpenMessage(safeName, parentQualifiedName, args, options.openMessage);
  // the gate lives in one place for both trace runtimes, so neither can drop a side the other reads
  const { printArgs, printResult } = resolveTracePrintProps(options);
  // one prop per argument, so a callback reads them the way the call passed them
  const openProps = options.argsAsProps ? args : [];
  const highlightOpen = isHighlighted(highlight, 'open');
  // every level exposes the same `LevelMethods` shape, so the dispatch is a plain index. The
  // modifier is only chained where rendering was asked for: `pp()` means *render*, so calling it
  // with an absent configuration would turn rendering on for everyone
  const id = (
    printArgs !== undefined
      ? Loxer.pp(printArgs).h(highlightOpen).m(moduleId)[level]
      : Loxer.h(highlightOpen).m(moduleId)[level]
  ).open(openMessage, ...openProps).id;

  return {
    id,
    success(result: any): void {
      const closeMessage = getCloseMessage(
        safeName,
        parentQualifiedName,
        result,
        options.closeMessage
      );
      // the result is one prop, and a conditional spread is what keeps a `void` function from
      // attaching a literal `undefined`
      const closeProps = options.resultAsProps && result !== undefined ? [result] : [];
      const highlightClose = isHighlighted(highlight, 'close');
      // the open's chain has been reset by its own log, so the close asks for rendering itself
      (printResult !== undefined
        ? Loxer.pp(printResult).h(highlightClose).of(id)
        : Loxer.h(highlightClose).of(id)
      ).close(closeMessage, ...closeProps);
    },
    failure(error: any): void {
      Loxer.of(id).error(error);
      Loxer.h(isHighlighted(highlight, 'close')).of(id).close(`${safeName} failed`);
    },
  };
}

function isHighlighted(highlight: TraceHighlight | undefined, phase: 'open' | 'close'): boolean {
  return highlight === 'all' || highlight === phase;
}

function getOpenMessage(
  functionName: string,
  parentQualifiedName: string,
  args: any[],
  style: FunctionOpenMessage | undefined
): string {
  const fallback = `${functionName}()`;

  try {
    if (typeof style === 'function') {
      return ensureMessage(style(args), fallback);
    }
    if (style === 'args') {
      return `${functionName}(${args.map((arg) => sanitizeMessage(arg)).join(', ')})`;
    }
    if (style === 'types') {
      return `${functionName}(${args.map((arg) => typeof arg).join(', ')})`;
    }
    if (style === 'parent.functionName') {
      return `${parentQualifiedName}()`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function sanitizeMessage(value: unknown): string {
  return sanitizeControlCharacters(String(value));
}

function getCloseMessage(
  functionName: string,
  parentQualifiedName: string,
  result: any,
  style: FunctionCloseMessage | undefined
): string {
  const fallback = `${functionName} done`;

  try {
    if (typeof style === 'function') {
      return ensureMessage(style(result), fallback);
    }
    if (style === 'result') {
      const serialized = JSON.stringify(result);

      return serialized === undefined ? fallback : `${functionName} done. returns: ${serialized}`;
    }
    if (style === 'parent.functionName') {
      return `${parentQualifiedName} done`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function ensureMessage(message: string, fallback: string): string {
  return typeof message === 'string' ? sanitizeMessage(message) : fallback;
}
