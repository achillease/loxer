import { is } from '../Helpers.js';
import { Loxer } from '../Loxer.js';
import { TraceOptions } from '../tracing-types.js';

export type { TraceOptions } from '../tracing-types.js';

/**
 * This decorator wraps a class level method inside a `Loxer.open()` and a `Loxer.of(...).close()` box.
 *
 * ---
 * @param options either a `string` for the `moduleId` or an object of type `TraceOptions`;
 * pass the method's argument tuple and resolved result type explicitly to type formatter callbacks
 * @returns a Decorator for class level methods
 */
export function trace<Args extends readonly unknown[] = readonly unknown[], Result = unknown>(
  options?: TraceOptions<Args, Result> | string
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): any {
    const original = descriptor.value;
    const className: string = target.constructor.name;
    const fixedName = className.endsWith('Class')
      ? className.substr(0, className.length - 5)
      : className;
    descriptor.value = function (...args: Args) {
      let moduleId;
      let o: TraceOptions<Args, Result> | undefined;
      if (is(options) && typeof options === 'string') {
        moduleId = options;
      } else if (is(options)) {
        o = options;
        moduleId = o?.moduleId;
      }

      const level = o?.level ?? 1;
      const h = o?.highlight;

      // open message
      const openMessage = getOpenMessage(o, propertyKey, args, fixedName);

      // open the lox
      const item = o?.argsAsItem ? args : undefined;
      const loxId = Loxer.h(h === 'all' || h === 'open')
        .l(level)
        .m(moduleId)
        .open(openMessage, item);

      // call the function
      const result = original.call(this, ...args);

      if (result && typeof result.then === 'function') {
        return result.then((payload: any) => {
          // close the lox with the resolved payload (not the still-pending promise)
          Loxer.h(h === 'all' || h === 'close')
            .of(loxId)
            .close(
              getCloseMessage(o, propertyKey, payload, fixedName),
              o?.resultAsItem ? payload : undefined
            );

          return payload;
        });
      }

      // close message
      const closeMessage = getCloseMessage(o, propertyKey, result, fixedName);
      const resultItem = o?.resultAsItem ? result : undefined;

      // close the lox
      Loxer.h(h === 'all' || h === 'close')
        .of(loxId)
        .close(closeMessage, resultItem);

      return result;
    };
  };
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
    } else if (om === 'className.functionName') {
      openMessage = fixedName + '.' + propertyKey + '()';
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
    } else if (cm === 'prettyResult') {
      closeMessage = propertyKey + ' done. returns: \n' + JSON.stringify(result, null, ' ');
    } else if (cm === 'className.functionName') {
      closeMessage = fixedName + '.' + propertyKey + ' done';
    }
  }

  return closeMessage;
}
