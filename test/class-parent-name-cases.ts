/**
 * The inputs to the trailing-`Class` rule, shared by every suite that checks a copy of it.
 *
 * The rule exists twice on purpose: `classParentName` in `src/core/TraceNames.ts` renders the class
 * the `@trace` decorator reads off a running instance, and a second copy in
 * `packages/babel-plugin-loxer-trace/src/marker-collection.ts` renders the class the transform reads
 * out of the source. The two are separate packages and cannot import each other, so nothing but a
 * test can hold them to the same answer — and each copy has now been hand-edited twice.
 *
 * One table drives all three consumers: the runtime helper directly, the transform through the code
 * it emits, and the decorator through the message it logs. Editing one copy alone fails here.
 *
 * Every `className` is written to be a legal identifier, so a suite can declare a class with it as
 * well as pass it as a string.
 */
export interface ClassParentNameCase {
  /** the class's own name */
  className: string;
  /** the parent every copy of the rule must render for it */
  parent: string;
}

export const classParentNameCases: ClassParentNameCase[] = [
  // a name the rule leaves alone
  { className: 'Order', parent: 'Order' },
  // the shortening the rule exists for
  { className: 'OrderServiceClass', parent: 'OrderService' },
  // only the trailing occurrence goes
  { className: 'ClassClass', parent: 'Class' },
  // `Class` is a suffix, not a substring: this one does not end in it
  { className: 'Classy', parent: 'Classy' },
  // a class named exactly `Class` keeps its name — shortening it would leave no parent at all, and a
  // parent that renders as nothing reads as a method of nothing rather than as a shortened class
  { className: 'Class', parent: 'Class' },
];
