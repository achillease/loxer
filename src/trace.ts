import { resolveThreshold } from './core/Levels.js';
import { PropsPrinterOptions } from './core/PropsPrinter.js';
import {
  parentNameResolver,
  renderCloseMessage,
  renderFailureMessage,
  renderOpenMessage,
  TraceCall,
} from './core/TraceMessage.js';
import { sanitizeControlCharacters } from './Helpers.js';
import { __openTrace, __writeTracePoint, Loxer } from './Loxer.js';
import {
  TraceHighlight,
  TraceOptions,
  TracePointRuntimeOptions,
  TracePrintOptions,
  TracePropsTarget,
  TraceRuntimeOptions,
} from './tracing-types.js';
import { ModuleId, RegisteredModuleId } from './types.js';

export type {
  TraceCallPrinter,
  TraceCloseMessageContext,
  TraceHighlight,
  TraceOpenMessageContext,
  TraceOptions,
  TracePrintOptions,
  TracePropsTarget,
  TracePointSelector,
  TracePointMessage,
  TracePointMessageContext,
} from './tracing-types.js';
import type { TracePointMessage, TracePointSelector } from './tracing-types.js';
import { renderPointCallbackMessage, renderPointMessage } from './core/TraceMessage.js';

type PlainFunctionTraceTarget = (...args: any[]) => unknown;

interface TraceMarkerCall {
  <T extends PlainFunctionTraceTarget>(
    target: T,
    options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>
  ): T;
  <T extends PlainFunctionTraceTarget>(
    targets: readonly T[],
    options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>
  ): void;
  <Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
    options?: TraceOptions<Args, Result>
  ): void;
}

interface TraceMarkerTerminals {
  error: TraceMarkerCall;
  warn: TraceMarkerCall;
  log: TraceMarkerCall;
  info: TraceMarkerCall;
  debug: TraceMarkerCall;
}

type TraceMarkerReservedMember =
  | keyof TraceMarkerTerminals
  | 'm'
  | 'module'
  | 'h'
  | 'highlight'
  | 'props'
  | 'pp'
  | 'point'
  | 'apply'
  | 'arguments'
  | 'bind'
  | 'call'
  | 'caller'
  | 'length'
  | 'name'
  | 'prototype'
  | 'then'
  | 'toString';

/** A registered module id that is safe to select directly on {@link trace}. */
export type TraceModuleId = Exclude<RegisteredModuleId, TraceMarkerReservedMember>;

type TraceMarkerChain<Delete extends string> = TraceMarkerTerminals &
  Omit<TraceMarkerModifiers<Delete>, Delete> &
  ('module' extends Delete ? Record<never, never> : TraceMarkerModuleMembers<Delete>);

type TraceMarkerModuleMembers<Delete extends string> = {
  readonly [ModuleId in TraceModuleId]: TraceMarkerChain<Delete | 'm' | 'module'>;
};

interface TraceMarkerModifiers<Delete extends string> {
  m(moduleId?: ModuleId): TraceMarkerChain<Delete | 'm' | 'module'>;
  module(moduleId?: ModuleId): TraceMarkerChain<Delete | 'm' | 'module'>;
  h(doit?: boolean | TraceHighlight): TraceMarkerChain<Delete | 'h' | 'highlight'>;
  highlight(doit?: boolean | TraceHighlight): TraceMarkerChain<Delete | 'h' | 'highlight'>;
  props(target: TracePropsTarget): TraceMarkerChain<Delete | 'props'>;
  pp(target: TracePropsTarget | TracePrintOptions): TraceMarkerChain<Delete | 'pp'>;
}

export type TraceMarker = TraceMarkerChain<never> & { readonly point: TracePoint };

interface TracePointTerminal {
  (message: TracePointMessage, ...props: unknown[]): void;
  (selector: TracePointSelector, message?: unknown, ...props: unknown[]): void;
  (message?: unknown, ...props: unknown[]): void;
}

interface TracePointTerminals {
  error: TracePointTerminal;
  warn: TracePointTerminal;
  log: TracePointTerminal;
  info: TracePointTerminal;
  debug: TracePointTerminal;
}

type TracePointReservedMember =
  | keyof TracePointTerminals
  | 'm'
  | 'module'
  | 'h'
  | 'highlight'
  | 'pp'
  | 'printProps'
  | 'apply'
  | 'arguments'
  | 'bind'
  | 'call'
  | 'caller'
  | 'length'
  | 'name'
  | 'prototype'
  | 'then'
  | 'toString';
export type TracePointModuleId = Exclude<RegisteredModuleId, TracePointReservedMember>;
type TracePointChain<Delete extends string> = TracePointTerminals &
  Omit<TracePointModifiers<Delete>, Delete> &
  ('module' extends Delete ? Record<never, never> : TracePointModuleMembers<Delete>);
type TracePointModuleMembers<Delete extends string> = {
  readonly [ModuleId in TracePointModuleId]: TracePointChain<Delete | 'm' | 'module'>;
};
interface TracePointModifiers<Delete extends string> {
  m(moduleId?: ModuleId): TracePointChain<Delete | 'm' | 'module'>;
  module(moduleId?: ModuleId): TracePointChain<Delete | 'm' | 'module'>;
  h(doit?: boolean): TracePointChain<Delete | 'h' | 'highlight'>;
  highlight(doit?: boolean): TracePointChain<Delete | 'h' | 'highlight'>;
  pp(options?: PropsPrinterOptions): TracePointChain<Delete | 'pp' | 'printProps'>;
  printProps(options?: PropsPrinterOptions): TracePointChain<Delete | 'pp' | 'printProps'>;
}

/** A build-time marker for one contextual log within the surrounding function. */
export type TracePoint = TracePointChain<never>;

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

/** @internal */
export function __withTraceFunctionLength<T extends PlainFunctionTraceTarget>(
  target: T,
  length: number
): T {
  Object.defineProperty(target, 'length', { value: length });

  return target;
}

/** @internal */
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

const missingTransform = (): never => {
  throw new Error(
    'trace() is a build-time marker. Configure babel-plugin-loxer-trace or ' +
      'vite-plugin-loxer-trace before executing this module.'
  );
};

const marker = Object.create(null) as Record<PropertyKey, unknown>;
const markerIntrospectionProperties = new Set([
  'apply',
  'arguments',
  'bind',
  'call',
  'caller',
  'length',
  'name',
  'prototype',
  'then',
  'toString',
]);
for (const name of ['m', 'module', 'h', 'highlight', 'props', 'pp']) {
  Object.defineProperty(marker, name, { value: () => traceMarker });
}
const pointMarker = Object.create(null) as Record<PropertyKey, unknown>;
for (const name of ['m', 'module', 'h', 'highlight', 'pp', 'printProps']) {
  Object.defineProperty(pointMarker, name, { value: () => tracePointMarker });
}
for (const name of ['error', 'warn', 'log', 'info', 'debug']) {
  Object.defineProperty(pointMarker, name, { value: missingTransform });
}
const tracePointMarker = createMarkerProxy(pointMarker);
Object.defineProperty(marker, 'point', { value: tracePointMarker });
for (const name of ['error', 'warn', 'log', 'info', 'debug']) {
  Object.defineProperty(marker, name, { value: missingTransform });
}

/** Marks plain functions for `babel-plugin-loxer-trace`; only terminal methods are callable. */
const traceMarker = createMarkerProxy(marker);

function createMarkerProxy(targetMarker: object): object {
  return new Proxy(targetMarker, {
    get(target, property, receiver) {
      if (
        typeof property === 'symbol' ||
        markerIntrospectionProperties.has(property) ||
        Reflect.has(target, property)
      ) {
        return Reflect.get(target, property, receiver);
      }

      return targetMarker;
    },
  });
}

/** Marks plain functions for `babel-plugin-loxer-trace`; direct properties select registered modules. */
export const trace: TraceMarker = traceMarker as TraceMarker;

/** @internal Runtime target of a transformed `trace.point` terminal. */
export function __tracePoint(
  options: TracePointRuntimeOptions,
  functionName: string,
  parentName: string | undefined,
  containingBoxId: number | undefined,
  ...args: unknown[]
): void {
  const [first, second] = args;
  const level = resolveThreshold(options.level, 'info');
  const selector: TracePointSelector | undefined =
    first === 'fn' || first === 'parent.fn' ? first : undefined;
  const callback = typeof first === 'function' ? (first as TracePointMessage) : undefined;
  __writeTracePoint(
    level,
    options,
    containingBoxId,
    () => {
      if (callback === undefined && selector === undefined) {
        return first;
      }

      const call: TraceCall = {
        name: sanitizeMessage(functionName),
        resolveParentName: parentNameResolver(() => parentName ?? ''),
      };
      if (callback !== undefined) {
        return renderPointCallbackMessage(call, callback);
      }

      return renderPointMessage(call, selector!, second);
    },
    selector === undefined ? args.slice(1) : args.slice(2)
  );
}

/** @internal */
export function __startTrace(
  functionName: string,
  args: any[],
  options: TraceRuntimeOptions = {},
  parentName?: string
): FunctionTrace {
  const { moduleId } = options;
  const markerOptions = options.markerOptions ?? {};
  const level = resolveThreshold(options.level, 'info');
  const safeName = sanitizeMessage(functionName);
  const call: TraceCall = {
    name: safeName,
    resolveParentName: parentNameResolver(() => parentName ?? ''),
  };
  const openMessage = renderOpenMessage(markerOptions.openMessage, { ...call, args });
  const { printArgs, printResult } = resolveMarkerPrintProps(options.printProps);
  const openProps = targetsSide(options.propsTarget, 'args') ? args : [];
  const highlightOpen = isHighlighted(options.highlight, 'open');
  if (printArgs !== undefined) {
    Loxer.pp(printArgs);
  }
  Loxer.h(highlightOpen).m(moduleId);
  const id = __openTrace(level, openMessage, ...openProps).id;

  return {
    id,
    success(result: any): void {
      const closeMessage = renderCloseMessage(markerOptions.closeMessage, { ...call, result });
      const closeProps =
        targetsSide(options.propsTarget, 'result') && result !== undefined ? [result] : [];
      (printResult !== undefined
        ? Loxer.pp(printResult).h(isHighlighted(options.highlight, 'close')).of(id)
        : Loxer.h(isHighlighted(options.highlight, 'close')).of(id)
      ).close(closeMessage, ...closeProps);
    },
    failure(error: any): void {
      Loxer.of(id).error(error);
      // a failure is how the box closes, so it takes the close side's highlighting
      Loxer.h(isHighlighted(options.highlight, 'close'))
        .of(id)
        .close(renderFailureMessage(markerOptions.closeMessage, call));
    },
  };
}

function targetsSide(target: TracePropsTarget | undefined, side: 'args' | 'result'): boolean {
  return target === side || target === 'argsResult';
}

/** Whether one lifecycle side of a traced call is highlighted.
 *
 * A bare `.h()` and `.h(true)` reach here as `true` and highlight both sides, which is also what
 * `'all'` selects; `'open'` and `'close'` name a single side.
 */
function isHighlighted(
  highlight: TraceRuntimeOptions['highlight'],
  side: 'open' | 'close'
): boolean {
  return highlight === true || highlight === 'all' || highlight === side;
}

function resolveMarkerPrintProps(printProps: TraceRuntimeOptions['printProps']): {
  printArgs: PropsPrinterOptions | undefined;
  printResult: PropsPrinterOptions | undefined;
} {
  if (printProps === undefined) {
    return { printArgs: undefined, printResult: undefined };
  }

  const target = typeof printProps === 'string' ? printProps : printProps.target;
  if (target !== 'args' && target !== 'result' && target !== 'argsResult') {
    return { printArgs: undefined, printResult: undefined };
  }
  const printerOptions = typeof printProps === 'string' ? {} : withoutPrintTarget(printProps);

  return {
    printArgs: targetsSide(target, 'args') ? printerOptions : undefined,
    printResult: targetsSide(target, 'result') ? printerOptions : undefined,
  };
}

function withoutPrintTarget({
  target: _target,
  ...options
}: TracePrintOptions): PropsPrinterOptions {
  return options;
}

function sanitizeMessage(value: unknown): string {
  return sanitizeControlCharacters(String(value));
}
