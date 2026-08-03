/**
 * Joins a traced function's parent to its name for the `'parent.functionName'` message styles.
 *
 * The parent is the class a traced method belongs to, or the file a traced function is written in.
 * A function neither of those reaches reports its own name alone.
 *
 * @internal
 */
export function qualifiedFunctionName(
  parentName: string | undefined,
  functionName: string
): string {
  return parentName ? parentName + '.' + functionName : functionName;
}

/**
 * Renders a class as the parent of its methods.
 *
 * A class name ending in `Class` reports without that suffix, so a method of `OrderServiceClass`
 * reads as `OrderService.load`. A class named exactly `Class` keeps its name: stripping the suffix
 * would leave no parent at all, which reads as a method of nothing rather than as the shortening the
 * rule is for. `babel-plugin-loxer-trace` applies the same rule while it builds, for the class names
 * it reads out of the source — the two are pinned against each other by `test/decorators.test.ts`
 * and `test/plain-function-trace-enclosing.test.ts`.
 *
 * @internal
 */
export function classParentName(className: string): string {
  return className !== 'Class' && className.endsWith('Class') ? className.slice(0, -5) : className;
}
