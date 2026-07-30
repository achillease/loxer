import { resolveBoxLevel } from './core/Levels.js';
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
 * @internal
 */
export function __startTrace(
  functionName: string,
  args: any[],
  options: TraceOptions = {}
): FunctionTrace {
  const { highlight, moduleId } = options;
  const level = resolveBoxLevel(options.level);
  // a name reaches this from the `name` option or a string-literal property key as well as from an
  // identifier, so it carries no more guarantee about control characters than an argument does
  const safeName = sanitizeMessage(functionName);
  const openMessage = getOpenMessage(safeName, args, options.openMessage);
  const item = options.argsAsItem ? args : undefined;
  // every level exposes the same `LevelMethods` shape, so the dispatch is a plain index
  const id = Loxer.h(isHighlighted(highlight, 'open'))
    .m(moduleId)
    [level].open(openMessage, item).id;

  return {
    id,
    success(result: any): void {
      const closeMessage = getCloseMessage(safeName, result, options.closeMessage);
      Loxer.h(isHighlighted(highlight, 'close'))
        .of(id)
        .close(closeMessage, options.resultAsItem ? result : undefined);
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
    if (style === 'className.functionName') {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function sanitizeMessage(value: unknown): string {
  return String(value).replace(
    /[\u0000-\u001F\u007F-\u009F]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

function getCloseMessage(
  functionName: string,
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
    if (style === 'prettyResult') {
      const serialized = JSON.stringify(result, null, ' ');

      return serialized === undefined ? fallback : `${functionName} done. returns: \n${serialized}`;
    }
    if (style === 'className.functionName') {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function ensureMessage(message: string, fallback: string): string {
  return typeof message === 'string' ? sanitizeMessage(message) : fallback;
}
