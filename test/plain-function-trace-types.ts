/**
 * Compile-time fixtures for plain-function trace formatter inference.
 *
 * Vitest never executes this file. `test/tsconfig.json` includes it, so `pnpm typecheck:test`
 * verifies that the marker overloads preserve the callback argument and result types pinned below.
 */
import {
  trace,
  type TraceModuleId,
  type TracePoint,
  type TracePointMessage,
  type TracePointMessageContext,
  type TracePointModuleId,
  type TracePointSelector,
} from '../src/trace';

type AssertFalse<Value extends false> = Value;
type LegacyMarkerIsAbsent = 'loxed' extends keyof typeof import('../src/trace') ? true : false;
type LegacyMarkerIsNotExported = AssertFalse<LegacyMarkerIsAbsent>;

/**
 * Bidirectional type pin for the formatter callbacks below.
 *
 * A plain `const pinned: Expected = actual;` is one-directional and therefore pins nothing about a
 * union: if `Parameters<T>` regressed to a single branch, the narrower tuple would still be
 * assignable to the wider union and the fixture would keep compiling. Checking both directions
 * catches a collapsed branch, and the `IsAny` guard catches inference degrading to `any` (which is
 * assignable in both directions and would otherwise pass). Mutual assignability rather than type
 * identity is deliberate: a `readonly [f, g]` target list infers `T` as a union of the two element
 * types, so `Parameters<T>` distributes to an unreduced `[id: string] | [id: string]` that is
 * semantically the pinned tuple but not identical to it.
 */
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type Equals<Actual, Expected> =
  IsAny<Actual> extends true
    ? false
    : [Actual] extends [Expected]
      ? [Expected] extends [Actual]
        ? true
        : false
      : false;
type AssertTrue<Value extends true> = Value;

type EmptyRegistryHasNoDirectModuleIds = AssertTrue<Equals<TraceModuleId, never>>;
const emptyRegistryHasNoDirectModuleIds: EmptyRegistryHasNoDirectModuleIds = true;
void emptyRegistryHasNoDirectModuleIds;
// @ts-expect-error an empty registry does not create an arbitrary direct-module index signature
trace.PROJECTS.info(() => undefined);
// @ts-expect-error `trace` is a marker object; select a terminal such as `trace.info(...)`
trace(() => undefined);

function traceFormatterTypeFixture(): void {
  function calculateTotal(quantity: number, currency: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: quantity });
  }

  trace.info(calculateTotal, {
    openMessage({ args }) {
      type ArgumentsAreExact = AssertTrue<
        Equals<typeof args, [quantity: number, currency: string]>
      >;
      const pinned: ArgumentsAreExact = true;
      return `${args[0]} ${args[1]} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExact = AssertTrue<Equals<typeof result, { amount: number }>>;
      const pinned: ResultIsExact = true;
      return `${result.amount} ${pinned}`;
    },
  });
}

function tracePointFormatterTypeFixture(): void {
  const point: TracePoint = trace.point;
  const callback: TracePointMessage = ({ fn, parentFn }) => `${parentFn(fn('order'))}`;
  const context: TracePointMessageContext = {
    fn: (content) => String(content),
    parentFn: (content) => String(content),
  };
  const selector: TracePointSelector = 'parent.fn';
  type ContextKeysAreExact = AssertTrue<Equals<keyof TracePointMessageContext, 'fn' | 'parentFn'>>;
  type EmptyPointRegistryHasNoDirectIds = AssertTrue<Equals<TracePointModuleId, never>>;
  const contextKeysAreExact: ContextKeysAreExact = true;
  const emptyPointRegistryHasNoDirectIds: EmptyPointRegistryHasNoDirectIds = true;
  void context;
  void contextKeysAreExact;
  void emptyPointRegistryHasNoDirectIds;

  point.error('failed');
  point.warn(selector, 'retrying', { id: 1 });
  trace.point.log();
  trace.point.info('fn');
  trace.point.debug(callback, { id: 1 });
  trace.point.module().highlight(false).printProps({ depth: 1 }).info('details');
  trace.point
    .pp({ keys: ['id'] })
    .h()
    .m()
    .debug('details');
  // near misses remain ordinary messages rather than contextual selectors
  trace.point.info('fn(types)', 'ordinary prop');
  // @ts-expect-error a point selector is one of the two exact reserved values
  const nearMissSelector: TracePointSelector = 'fn(types)';
  void nearMissSelector;
  // @ts-expect-error point formatter contexts expose only the name printers
  trace.point.info(({ args }) => String(args));
  // @ts-expect-error module aliases are one modifier family
  trace.point.m().module();
  // @ts-expect-error highlighting aliases are one modifier family
  trace.point.h().highlight();
  // @ts-expect-error props-printing aliases are one modifier family
  trace.point.pp().printProps();
  // @ts-expect-error points are single logs, not lifecycle boxes
  trace.point.open('order');
  // @ts-expect-error points cannot address an existing lifecycle box
  trace.point.of(1);
  // @ts-expect-error lifecycle props capture is not a point modifier
  trace.point.props('args');
  // @ts-expect-error a terminal ends the fluent chain
  trace.point.info.m();
  // @ts-expect-error the point marker is not directly callable
  trace.point('saved');
}

function traceListFormatterTypeFixture(): void {
  function loadOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: id.length });
  }
  function saveOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: 0 });
  }

  trace.info([loadOrder, saveOrder], {
    openMessage({ args }) {
      type ArgumentsAreExact = AssertTrue<Equals<typeof args, [id: string]>>;
      const pinned: ArgumentsAreExact = true;
      return `${args[0]} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExact = AssertTrue<Equals<typeof result, { amount: number }>>;
      const pinned: ResultIsExact = true;
      return `${result.amount} ${pinned}`;
    },
  });
}

function traceReadonlyListFormatterTypeFixture(): void {
  function loadOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: id.length });
  }
  function saveOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: 0 });
  }
  const targets = [loadOrder, saveOrder] as const;

  trace.info(targets, {
    openMessage({ args }) {
      type ArgumentsAreExact = AssertTrue<Equals<typeof args, [id: string]>>;
      const pinned: ArgumentsAreExact = true;
      return `${args[0]} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExact = AssertTrue<Equals<typeof result, { amount: number }>>;
      const pinned: ResultIsExact = true;
      return `${result.amount} ${pinned}`;
    },
  });
}

function traceMixedSignatureListFormatterTypeFixture(): void {
  function loadOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: id.length });
  }
  function countOrders(active: boolean): number {
    return active ? 1 : 0;
  }

  trace.info([loadOrder, countOrders], {
    openMessage({ args }) {
      type ArgumentsAreExactUnion = AssertTrue<
        Equals<typeof args, [id: string] | [active: boolean]>
      >;
      const pinned: ArgumentsAreExactUnion = true;
      return `${String(args[0])} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExactUnion = AssertTrue<Equals<typeof result, { amount: number } | number>>;
      const pinned: ResultIsExactUnion = true;
      return `${String(result)} ${pinned}`;
    },
  });
}

function fluentTraceFormatterTypeFixture(): void {
  function calculateTotal(quantity: number, currency: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: quantity });
  }

  const returned = trace
    .m('ORDER')
    .h()
    .props('argsResult')
    .pp({ target: 'result', depth: 1 })
    .warn(calculateTotal, {
      openMessage({ args }) {
        type ArgumentsAreExact = AssertTrue<
          Equals<typeof args, [quantity: number, currency: string]>
        >;
        const pinned: ArgumentsAreExact = true;
        return `${args[0]} ${args[1]} ${pinned}`;
      },
      closeMessage({ result }) {
        type ResultIsExact = AssertTrue<Equals<typeof result, { amount: number }>>;
        const pinned: ResultIsExact = true;
        return `${result.amount} ${pinned}`;
      },
    });
  const preservesTarget: typeof calculateTotal = returned;
  void preservesTarget;

  const inline = trace.debug((value: number) => String(value), {
    openMessage({ args }) {
      type ArgumentsAreExact = AssertTrue<Equals<typeof args, [value: number]>>;
      const pinned: ArgumentsAreExact = true;
      return `${args[0]} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExact = AssertTrue<Equals<typeof result, string>>;
      const pinned: ResultIsExact = true;
      return `${result} ${pinned}`;
    },
  });
  const preservesInline: (value: number) => string = inline;
  void preservesInline;

  trace.info<[id: string], number>({
    openMessage({ args }) {
      type ArgumentsAreExact = AssertTrue<Equals<typeof args, [id: string]>>;
      const pinned: ArgumentsAreExact = true;
      return `${args[0]} ${pinned}`;
    },
    closeMessage({ result }) {
      type ResultIsExact = AssertTrue<Equals<typeof result, number>>;
      const pinned: ResultIsExact = true;
      return `${result} ${pinned}`;
    },
  });
}
