import { resolveBoxLevel } from '../core/Levels.js';
import { resolveTracePrintProps } from '../core/PropsPrinter.js';
import { classParentName, qualifiedFunctionName } from '../core/TraceNames.js';
import { is } from '../Helpers.js';
import { Loxer } from '../Loxer.js';
import { TraceOptions } from '../tracing-types.js';
import { ErrorType, ModuleId } from '../types.js';

export type { TraceOptions } from '../tracing-types.js';

type TracedMethod = (this: any, ...args: any[]) => any;

export interface TraceMethodContext {
  readonly kind: 'method';
  readonly name: string | symbol;
  readonly static: boolean;
  readonly private: boolean;
  addInitializer(initializer: () => void): void;
}

export interface TraceMethodDecorator {
  /** Legacy TypeScript protocol — `experimentalDecorators: true`. */
  (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any;
  /** Standard TC39 stage 3 protocol — TypeScript >= 5.0 default. */
  <T extends TracedMethod>(value: T, context: TraceMethodContext): T;
}

/**
 * This decorator wraps a class level method inside a `Loxer.open()` and a `Loxer.of(...).close()` box.
 *
 * ---
 * @param options either a `string` for the `moduleId` or an object of type `TraceOptions`;
 * pass the method's argument tuple and resolved result type explicitly to type formatter callbacks
 * @returns a Decorator for class level methods
 */
export function trace<Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
  options?: TraceOptions<Args, Result> | ModuleId
): TraceMethodDecorator {
  return function (
    valueOrTarget: TracedMethod | any,
    contextOrPropertyKey: TraceMethodContext | string | symbol,
    descriptor?: PropertyDescriptor
  ): TracedMethod | PropertyDescriptor {
    if (isStandardDecoratorContext(contextOrPropertyKey)) {
      if (contextOrPropertyKey.kind !== 'method' || typeof valueOrTarget !== 'function') {
        throw new TypeError('@trace can only decorate methods.');
      }

      return createTracedMethod(valueOrTarget, contextOrPropertyKey.name, options);
    }

    if (
      (typeof contextOrPropertyKey !== 'string' && typeof contextOrPropertyKey !== 'symbol') ||
      !descriptor ||
      typeof descriptor.value !== 'function'
    ) {
      throw new TypeError('@trace can only decorate methods.');
    }

    descriptor.value = createTracedMethod(descriptor.value, contextOrPropertyKey, options);

    return descriptor;
  } as TraceMethodDecorator;
}

function createTracedMethod<Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
  original: TracedMethod,
  propertyKey: string | symbol,
  // carries the public `ModuleId` shorthand through, so the `.m(moduleId)` call below stays valid
  // in a program that augments the `LoxerModuleRegistry` - without it, `moduleId` would widen to
  // `string` here and only that program (never this package's own build) would fail
  options?: TraceOptions<Args, Result> | ModuleId
): TracedMethod {
  const propertyName = methodName(propertyKey);

  return function (this: any, ...args: Args) {
    let moduleId;
    let o: TraceOptions<Args, Result> | undefined;
    if (is(options) && typeof options === 'string') {
      moduleId = options;
    } else if (is(options)) {
      o = options;
      moduleId = o?.moduleId;
    }

    const level = resolveBoxLevel(o?.level);
    const h = o?.highlight;
    const needsParentName =
      o?.openMessage === 'parent.functionName' || o?.closeMessage === 'parent.functionName';
    // a decorated method's parent is always its class, which the running instance carries
    const fixedName = needsParentName ? resolveClassName(this) : '';
    // the gate lives in one place for both trace runtimes, so neither can drop a side the other reads
    const { printArgs, printResult } = resolveTracePrintProps(o);

    // open message
    const openMessage = getOpenMessage(o, propertyName, args, fixedName);

    // open the lox - one prop per argument
    const openProps = o?.argsAsProps ? args : [];
    // every level exposes the same `LevelMethods` shape, so the dispatch is a plain index. The
    // modifier is only chained where rendering was asked for: `pp()` means *render*, so calling it
    // with an absent configuration would turn rendering on for everyone
    const loxId = (
      printArgs !== undefined
        ? Loxer.pp(printArgs)
            .h(h === 'all' || h === 'open')
            .m(moduleId)[level]
        : Loxer.h(h === 'all' || h === 'open').m(moduleId)[level]
    ).open(openMessage, ...openProps);

    // the result is one prop, and a conditional spread is what keeps a `void` method from attaching
    // a literal `undefined`. The open's chain has been reset by its own log, so the close asks for
    // rendering itself
    const closeWith = (message: string, payload: unknown) => {
      const closeProps = o?.resultAsProps && payload !== undefined ? [payload] : [];
      (printResult !== undefined
        ? Loxer.pp(printResult)
            .h(h === 'all' || h === 'close')
            .of(loxId)
        : Loxer.h(h === 'all' || h === 'close').of(loxId)
      ).close(message, ...closeProps);
    };

    // Reporting and then rethrowing preserves the original synchronous throw and Promise rejection
    // for the method's caller while ensuring a traced failure cannot leave its box open.
    const failWith = (error: unknown) => {
      Loxer.of(loxId).error(error as ErrorType);
      Loxer.h(h === 'all' || h === 'close')
        .of(loxId)
        .close(`${propertyName} failed`);
    };

    let result: any;
    try {
      // call the function
      result = original.call(this, ...args);
    } catch (error) {
      failWith(error);
      throw error;
    }

    try {
      if (result && typeof result.then === 'function') {
        return result.then(
          (payload: any) => {
            // close the lox with the resolved payload (not the still-pending promise)
            closeWith(getCloseMessage(o, propertyName, payload, fixedName), payload);

            return payload;
          },
          (error: unknown) => {
            failWith(error);
            throw error;
          }
        );
      }
    } catch (error) {
      failWith(error);
      throw error;
    }

    // close message
    closeWith(getCloseMessage(o, propertyName, result, fixedName), result);

    return result;
  };
}

function isStandardDecoratorContext(value: unknown): value is TraceMethodContext {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function methodName(propertyKey: string | symbol): string {
  return typeof propertyKey === 'symbol'
    ? (propertyKey.description ?? propertyKey.toString())
    : propertyKey;
}

function resolveClassName(instance: any): string {
  try {
    const className = typeof instance === 'function' ? instance.name : instance?.constructor?.name;

    return typeof className === 'string' ? classParentName(className) : '';
  } catch {
    return '';
  }
}

function getOpenMessage<Args extends readonly unknown[], Result>(
  o: TraceOptions<Args, Result> | undefined,
  propertyKey: string,
  args: Args,
  fixedName: string
): string {
  const om = o?.openMessage;
  let openMessage = propertyKey + '()';
  if (is(om)) {
    if (typeof om === 'function') {
      openMessage = om(args);
    } else if (om === 'args') {
      openMessage = propertyKey + '(' + args.join(', ') + ')';
    } else if (om === 'types') {
      openMessage = propertyKey + '(' + args.map((a) => typeof a).join(', ') + ')';
    } else if (om === 'parent.functionName') {
      openMessage = qualifiedFunctionName(fixedName, propertyKey) + '()';
    }
  }

  return openMessage;
}

function getCloseMessage<Args extends readonly unknown[], Result>(
  o: TraceOptions<Args, Result> | undefined,
  propertyKey: string,
  result: Result,
  fixedName: string
): string {
  const cm = o?.closeMessage;
  let closeMessage = propertyKey + ' done';
  if (is(cm)) {
    if (typeof cm === 'function') {
      closeMessage = cm(result);
    } else if (cm === 'result') {
      closeMessage = propertyKey + ' done. returns: ' + JSON.stringify(result);
    } else if (cm === 'parent.functionName') {
      closeMessage = qualifiedFunctionName(fixedName, propertyKey) + ' done';
    }
  }

  return closeMessage;
}
