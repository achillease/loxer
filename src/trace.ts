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
import { __openTrace, Loxer } from './Loxer.js';
import {
  ExtendedPropsPrinterOptions,
  TraceMarkerOptions,
  TraceMarkerRuntimeOptions,
  TracePropsTarget,
} from './tracing-types.js';
import { ModuleId, RegisteredModuleId } from './types.js';

export type {
  ExtendedPropsPrinterOptions,
  TraceCallPrinter,
  TraceCloseMessageContext,
  TraceMarkerOptions,
  TraceOpenMessageContext,
  TraceOptions,
  TracePropsTarget,
} from './tracing-types.js';

type PlainFunctionTraceTarget = (...args: any[]) => unknown;

interface TraceMarkerCall {
  <T extends PlainFunctionTraceTarget>(
    target: T,
    options?: TraceMarkerOptions<Parameters<T>, Awaited<ReturnType<T>>>
  ): T;
  <T extends PlainFunctionTraceTarget>(
    targets: readonly T[],
    options?: TraceMarkerOptions<Parameters<T>, Awaited<ReturnType<T>>>
  ): void;
  <Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
    options?: TraceMarkerOptions<Args, Result>
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
  h(doit?: boolean): TraceMarkerChain<Delete | 'h' | 'highlight'>;
  highlight(doit?: boolean): TraceMarkerChain<Delete | 'h' | 'highlight'>;
  props(target: TracePropsTarget): TraceMarkerChain<Delete | 'props'>;
  pp(target: TracePropsTarget | ExtendedPropsPrinterOptions): TraceMarkerChain<Delete | 'pp'>;
}

export type TraceMarker = TraceMarkerChain<never>;

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
for (const name of ['error', 'warn', 'log', 'info', 'debug']) {
  Object.defineProperty(marker, name, { value: missingTransform });
}

/** Marks plain functions for `babel-plugin-loxer-trace`; only terminal methods are callable. */
const traceMarker = new Proxy(marker as object, {
  get(target, property, receiver) {
    if (
      typeof property === 'symbol' ||
      markerIntrospectionProperties.has(property) ||
      Reflect.has(target, property)
    ) {
      return Reflect.get(target, property, receiver);
    }

    return marker;
  },
});

/** Marks plain functions for `babel-plugin-loxer-trace`; direct properties select registered modules. */
export const trace: TraceMarker = traceMarker as TraceMarker;

/** @internal */
export function __startTrace(
  functionName: string,
  args: any[],
  options: TraceMarkerRuntimeOptions = {},
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
  const highlightOpen = isHighlighted(options.highlight);
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
        ? Loxer.pp(printResult).h(isHighlighted(options.highlight)).of(id)
        : Loxer.h(isHighlighted(options.highlight)).of(id)
      ).close(closeMessage, ...closeProps);
    },
    failure(error: any): void {
      Loxer.of(id).error(error);
      Loxer.h(isHighlighted(options.highlight))
        .of(id)
        .close(renderFailureMessage(markerOptions.closeMessage, call));
    },
  };
}

function targetsSide(target: TracePropsTarget | undefined, side: 'args' | 'result'): boolean {
  return target === side || target === 'argsResult';
}

function isHighlighted(highlight: TraceMarkerRuntimeOptions['highlight']): boolean {
  return highlight === true;
}

function resolveMarkerPrintProps(printProps: TraceMarkerRuntimeOptions['printProps']): {
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
}: ExtendedPropsPrinterOptions): PropsPrinterOptions {
  return options;
}

function sanitizeMessage(value: unknown): string {
  return sanitizeControlCharacters(String(value));
}
