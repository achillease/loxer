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
 * Marks a named plain-function binding for `babel-plugin-loxer-trace`.
 *
 * The build-time trace transform removes this call. Reaching it at runtime means the transform is
 * missing.
 */
export function trace<T extends PlainFunctionTraceTarget>(
  _target: T,
  _options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>
): never {
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
  const { highlight, level = 1, moduleId } = options;
  const openMessage = getOpenMessage(functionName, args, options.openMessage);
  const item = options.argsAsItem ? args : undefined;
  const id = Loxer.h(isHighlighted(highlight, 'open'))
    .l(level)
    .m(moduleId)
    .open(openMessage, item).id;

  return {
    id,
    success(result: any): void {
      const closeMessage = getCloseMessage(functionName, result, options.closeMessage);
      Loxer.h(isHighlighted(highlight, 'close'))
        .of(id)
        .close(closeMessage, options.resultAsItem ? result : undefined);
    },
    failure(error: any): void {
      Loxer.of(id).error(error);
      Loxer.h(isHighlighted(highlight, 'close')).of(id).close(`${functionName} failed`);
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
