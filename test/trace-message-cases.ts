import type { TraceOptions } from '../src';

/** the two option types, read off `TraceOptions` rather than imported directly - neither
 * `FunctionOpenMessage` nor `FunctionCloseMessage` is exported by `src/index.ts` or `src/trace.ts`,
 * only the fully-applied `TraceOptions` is */
type OpenMessage = TraceOptions<any, any>['openMessage'];
type CloseMessage = TraceOptions<any, any>['closeMessage'];

/**
 * One shared table of trace-message cases, driven against both trace runtimes -
 * `test/decorators-message-templates.test.ts` (the `@trace` decorator, through `installTraced`) and
 * `test/plain-function-trace-message-templates.test.ts` (the `trace()` marker runtime, through
 * `__startTrace`) - so neither runtime's copy of the shared renderer (`src/core/TraceMessage.ts`) can
 * render a template, a printer, or a fallback the other does not.
 *
 * Every case names the traced call as the spec's own table does: a method `calculate(price,
 * quantity)` of a class `Checkout`, called `calculate(19.95, 3)` and resolving `{ total: 59.85 }` -
 * unless a case overrides `args` / `result` / `voidResult` to exercise a specific rule (the
 * `undefined`-argument split, a `void` result's fallback, ...).
 */
export interface TemplateCase {
  name: string;
  /** defaults to `[19.95, 3]` */
  args?: unknown[];
  /** defaults to `{ total: 59.85 }`; ignored where `voidResult` is `true` */
  result?: unknown;
  /** the traced call resolves with no result at all, the way a `void` function does */
  voidResult?: boolean;
  openMessage?: OpenMessage;
  closeMessage?: CloseMessage;
  expectedOpen: string;
  expectedClose: string;
}

export const DEFAULT_ARGS: [number, number] = [19.95, 3];
export const DEFAULT_RESULT = { total: 59.85 };
/** the name both runtimes trace every case under */
export const CALL_NAME = 'calculate';
/** the parent both runtimes resolve for every case in {@link templateCases} - the decorator reads it
 * off a `class Checkout {}` instance, the marker is handed it as `__startTrace`'s `parentName` */
export const PARENT_NAME = 'Checkout';

/** The spec's own table (`documentation/specs/trace-message-templates.md`, "Templates"), one row per
 * option/value pair, plus the printer, callback, and `undefined`-argument cases the spec's other
 * criteria describe. Every row leaves the side it does not name at its default - `'parent.fn'` for
 * `openMessage`, `'fn'` for `closeMessage` - so the untested side's expectation is always the
 * `Checkout.calculate()` / `calculate done` pair. */
export const templateCases: TemplateCase[] = [
  {
    name: "openMessage omitted (the default, 'parent.fn')",
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'fn'",
    openMessage: 'fn',
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn'",
    openMessage: 'parent.fn',
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'fn(types)'",
    openMessage: 'fn(types)',
    expectedOpen: 'calculate(number, number)',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'fn(args)'",
    openMessage: 'fn(args)',
    expectedOpen: 'calculate(19.95, 3)',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn(types)'",
    openMessage: 'parent.fn(types)',
    expectedOpen: 'Checkout.calculate(number, number)',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn(args)'",
    openMessage: 'parent.fn(args)',
    expectedOpen: 'Checkout.calculate(19.95, 3)',
    expectedClose: 'calculate done',
  },
  {
    name: "closeMessage 'fn' (the default)",
    closeMessage: 'fn',
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "closeMessage 'parent.fn'",
    closeMessage: 'parent.fn',
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'Checkout.calculate done',
  },
  {
    name: "closeMessage 'fn(result)'",
    closeMessage: 'fn(result)',
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate({"total":59.85}) done',
  },
  {
    name: "closeMessage 'parent.fn(result)'",
    closeMessage: 'parent.fn(result)',
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'Checkout.calculate({"total":59.85}) done',
  },

  // --- both printers ----------------------------------------------------------------------------
  {
    name: 'an openMessage callback calling fn() with no content prints empty parentheses',
    openMessage: ({ fn }) => fn(),
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: 'an openMessage callback calling fn(3) prints the name and the content',
    openMessage: ({ fn }) => fn(3),
    expectedOpen: 'calculate(3)',
    expectedClose: 'calculate done',
  },
  {
    name: 'an openMessage callback calling parentFn(3) prints the parent, the name and the content',
    openMessage: ({ parentFn }) => parentFn(3),
    expectedOpen: 'Checkout.calculate(3)',
    expectedClose: 'calculate done',
  },
  {
    name: 'a closeMessage callback calling parentFn() prints empty parentheses',
    closeMessage: ({ parentFn }) => parentFn(),
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'Checkout.calculate()',
  },
  {
    name: 'text a callback writes around a printer stays composed with it',
    openMessage: ({ parentFn }) => `retrying ${parentFn(3)}`,
    expectedOpen: 'retrying Checkout.calculate(3)',
    expectedClose: 'calculate done',
  },
  {
    name: 'a printer renders an object argument as one compact line, not [object Object]',
    openMessage: ({ fn }) => fn({ id: 1, total: 2 }),
    expectedOpen: 'calculate({ id: 1, total: 2 })',
    expectedClose: 'calculate done',
  },

  // --- the undefined split -----------------------------------------------------------------------
  {
    name: 'a passed undefined argument prints "undefined" through fn(args)',
    openMessage: 'fn(args)',
    args: [undefined, 'given'],
    expectedOpen: 'calculate(undefined, given)',
    expectedClose: 'calculate done',
  },
  {
    name: 'a printer called with an explicit undefined content prints empty parentheses',
    openMessage: ({ fn }) => fn(undefined),
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },

  // --- the callback safety net -------------------------------------------------------------------
  // a callback that produces no message falls back to the bare name, not to the phase's default
  // template: the same message the renderer's own `catch` returns, which never resolves a parent
  {
    name: 'a throwing openMessage callback falls back to the bare fn() message',
    openMessage: () => {
      throw new Error('formatter failed');
    },
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: 'a non-string openMessage callback falls back to the bare fn() message',
    openMessage: (() => 123) as unknown as OpenMessage,
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: 'a throwing closeMessage callback falls back to the fn done message',
    closeMessage: () => {
      throw new Error('formatter failed');
    },
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: 'a non-string closeMessage callback falls back to the fn done message',
    closeMessage: (() => 123) as unknown as CloseMessage,
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
];

/** A `'fn(result)'` / `'parent.fn(result)'` result that does not serialize - a `void` call, most of
 * all - reports the `'fn'` / `'parent.fn'` message of the same name form rather than
 * `calculate(undefined) done`. */
export const nonSerializableResultCases: TemplateCase[] = [
  {
    name: "closeMessage 'fn(result)' on a void result falls back to the fn done message",
    closeMessage: 'fn(result)',
    voidResult: true,
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "closeMessage 'parent.fn(result)' on a void result falls back to the parent.fn done message",
    closeMessage: 'parent.fn(result)',
    voidResult: true,
    expectedOpen: 'Checkout.calculate()',
    expectedClose: 'Checkout.calculate done',
  },
];

/** Every `parent.` template, run where no parent is known at all - a `qualifiedFunctionName` guard
 * keeps an absent parent absent rather than joining it to nothing. Both runtimes reach this the same
 * way: the decorator through a call whose `this` carries no reachable class, the marker through an
 * `undefined` `parentName`. */
export const parentlessFallbackCases: TemplateCase[] = [
  {
    name: 'an omitted openMessage with no known parent renders the bare name',
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn' with no known parent renders the bare name",
    openMessage: 'parent.fn',
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn(types)' with no known parent renders the bare name",
    openMessage: 'parent.fn(types)',
    expectedOpen: 'calculate(number, number)',
    expectedClose: 'calculate done',
  },
  {
    name: "openMessage 'parent.fn(args)' with no known parent renders the bare name",
    openMessage: 'parent.fn(args)',
    expectedOpen: 'calculate(19.95, 3)',
    expectedClose: 'calculate done',
  },
  {
    name: "closeMessage 'parent.fn' with no known parent renders the bare name",
    closeMessage: 'parent.fn',
    expectedOpen: 'calculate()',
    expectedClose: 'calculate done',
  },
  {
    name: "closeMessage 'parent.fn(result)' with no known parent renders the bare name",
    closeMessage: 'parent.fn(result)',
    expectedOpen: 'calculate()',
    expectedClose: 'calculate({"total":59.85}) done',
  },
];

export interface FailureCase {
  name: string;
  closeMessage?: CloseMessage;
  expectedFailure: string;
}

/** A failed call has no result, so it carries no payload and cannot invoke a callback; it keeps the
 * name form its `closeMessage` selected - `calculate failed` for the `'fn'` forms, `Checkout.calculate
 * failed` for the `'parent.fn'` forms and for a callback. */
export const failureCases: FailureCase[] = [
  { name: "closeMessage 'fn' (the default)", expectedFailure: 'calculate failed' },
  { name: "closeMessage 'parent.fn'", closeMessage: 'parent.fn', expectedFailure: 'Checkout.calculate failed' },
  { name: "closeMessage 'fn(result)'", closeMessage: 'fn(result)', expectedFailure: 'calculate failed' },
  {
    name: "closeMessage 'parent.fn(result)'",
    closeMessage: 'parent.fn(result)',
    expectedFailure: 'Checkout.calculate failed',
  },
  {
    name: 'a closeMessage callback, which the failure path cannot invoke',
    closeMessage: ({ result }) => `close:${String(result)}`,
    expectedFailure: 'Checkout.calculate failed',
  },
];
