# Test-revealed bugs — 2026-07-26-traceallmarker

## 1. Module-scope options storage breaks per-invocation options for a marker in a nested scope

**Status:** fixed 2026-07-26 17:18 on user instruction, exactly as proposed below. `declareTraceOptions`
now calls `outermostTargetScope(marker.targets).push({ id, kind: 'var' })`, emitting an uninitialized
`var` in the targets' outermost declaring scope. Regression test:
`markers in a nested scope keep per-invocation options instead of sharing one slot` in
`test/plain-function-trace.test.ts` (covers both the single and list forms). Verified emitted code for
a top-level marker, a nested marker with a top-level target, a list spanning two scopes, two markers
in one nested scope (merged into a single `var a, b;`), and a block-scoped target.

**Severity:** medium. Wrong `moduleId`/`level`/formatters at runtime, silently. Only affects markers
written inside a function that runs more than once; a module-top-level marker is unaffected.

**Introduced by:** this change's `declareTraceOptions` in
`packages/babel-plugin-loxer-trace/src/plugin.ts`, which declares one hoisted
`var _…TraceOptions = {}` at **module scope** for every marker. Before this change, the declaration
was inserted before the *target's* declaration statement
(`getBindingStatement(marker.targetBinding.path).insertBefore(...)`), so a marker inside a function
got a fresh `var` per invocation of that function.

**Failure scenario:**

```ts
export function makeTraced(label: string) {
  function first(value: string) {
    return label + ':' + value;
  }
  trace(first, { moduleId: label.toUpperCase() });
  return first;
}

const alpha = makeTraced('order');   // wants moduleId 'ORDER'
const beta = makeTraced('payment');  // wants moduleId 'PAYMENT'
alpha('x'); // logs under 'PAYMENT' — beta's setup overwrote the single shared options slot
```

Emitted code (verified by running `transformLoxerTrace` on the snippet above):

```js
var _firstTraceOptions = {};          // <- module scope, one slot for all invocations
export function makeTraced(label) {
  function first(value) {
    const _traceState = _startTrace("first", [...arguments], _firstTraceOptions);
    ...
  }
  _firstTraceOptions = { moduleId: label.toUpperCase() };   // last call wins, for every closure
  return first;
}
```

The same applies to the list form, which shares one `_sharedTraceOptions` slot.

**Why the existing tests miss it:** `test/plain-function-trace.test.ts`'s
`a list marker in a nested scope re-evaluates its shared options on every call` uses options whose
content is identical on every invocation, so the last-write-wins behavior is unobservable. Its
assertions about `label` are about closure capture of the *function bodies*, not of the options. The
test name has been corrected to stop claiming per-invocation isolation.

**Proposed fix (one helper, no API change):**

1. Declare the options `var` in the outermost scope among the marker's target bindings instead of at
   module scope. Every target binding is on the marker's scope chain, so those scopes are linearly
   nested and the outermost one is reachable from every target's wrapper *and* from the marker's
   assignment — while still being per-invocation for a nested marker.
2. Emit the declaration **without** the `= {}` initializer (`var _x;`, e.g. via `scope.push({ id,
   kind: 'var' })`). Hoisting then makes placement irrelevant, so the marker-above-declaration case
   stays fixed with no initializer that can overwrite the assignment. `__startTrace` already defaults
   `options` to `{}`, and `test/plain-function-trace.test.ts`'s
   `a hoisted declaration can run before its declaration and marker with default options` already
   pins that an unset options slot traces with defaults.

**Test to add with the fix:** a nested marker (single and list form) whose options are computed from
the enclosing function's parameter, invoked twice, asserting the first group's functions keep the
first invocation's `moduleId` after the second setup runs.
