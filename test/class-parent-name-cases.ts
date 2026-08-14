/**
 * The inputs to the trailing-`Class` rule, shared by every suite that checks it.
 *
 * The rule lives in `classParentName`
 * (`packages/babel-plugin-loxer-trace/src/marker-collection.ts`), which renders the class the
 * transform reads out of the source. It runs while the build runs, so the only place a test
 * observes it is the message the emitted code produces — this table is what pins that message to
 * an expectation per class name, and the rule has been hand-edited twice.
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
