import { trace } from '../src/trace';

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

function traceFormatterTypeFixture(): void {
  function calculateTotal(quantity: number, currency: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: quantity });
  }

  trace(calculateTotal, {
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

function traceListFormatterTypeFixture(): void {
  function loadOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: id.length });
  }
  function saveOrder(id: string): Promise<{ amount: number }> {
    return Promise.resolve({ amount: 0 });
  }

  trace([loadOrder, saveOrder], {
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

  trace(targets, {
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

  trace([loadOrder, countOrders], {
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
