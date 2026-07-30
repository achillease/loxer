# Review: inline trace markers — name-walk completeness audit (pass 3)

**Verdict:** WARN
**Scope:** `packages/babel-plugin-loxer-trace/src/plugin.ts` — `isNameBoundary` and the name-bearing
branches of `surroundingName`, audited as a closed enumeration rather than by example.
**Lenses run:** code ✓ · security, perf, acceptance, test, a11y skipped: the pass-2 delta was name
resolution and tests only, its security half was verified in pass 2, and this pass was scoped to one
question.

Passes 1 and 2 each found one more missing node kind in the same list. Rather than hunt a fifth
example, this pass enumerated every `@babel/types` node kind that can stand between a marked function
and a name-bearing node, partitioned them into returns-a-name / stops-as-a-boundary / falls-through,
and demanded a verdict on the list's completeness. Candidates were confirmed by running the built
plugin, not by reading definitions alone.

Baseline at review time: `pnpm build`, `pnpm lint`, `pnpm test` (244/244), `pnpm typecheck:test` all
exit 0.

## Findings (by severity)

- **[HIGH]** `isNameBoundary` — a `YieldExpression` is not a boundary.
  `function* g() { const d = yield trace(function () {}, {}); }` names its box `d`, but `d` receives
  whatever the generator's driver passes to the next `.next(value)`; it has no relation to the yielded
  operand. Wrong on ordinary use, not only in an edge case. (Generators are rejected as trace
  *targets*, so a generator as the *enclosing* function is reachable.)
  - **Fix:** add `t.isYieldExpression(path.node)`.
  - **Cites:** the mechanism's own contract in `isNameBoundary`'s docstring · baseline (CODE_REVIEW.md
    — control-flow/semantics mismatch) · caught by code · **reproduced**

- **[HIGH]** `isNameBoundary` — a `MemberExpression` / `OptionalMemberExpression` in value-read
  position is not a boundary. `const d = trace(function () {}, {}).foo;` names its box `d`, though `d`
  is a property read off the traced function rather than the function. Safe to add: the
  assignment-target occurrence is handled earlier by the `AssignmentExpression` branch, which inspects
  `node.left` directly and never routes through the boundary check.
  - **Fix:** add `t.isMemberExpression(path.node) || t.isOptionalMemberExpression(path.node)`.
  - **Cites:** same contract · caught by code · **reproduced**

- **[MEDIUM]** `isNameBoundary` — `ObjectExpression` is not a boundary although `ArrayExpression` is.
  `const o = {...trace(function () {}, {})};` names its box `o`, though `o` is an object built from the
  function's enumerable properties.
  - **Fix:** add `t.isObjectExpression(path.node)`, parallel to the existing array entry.
  - **Cites:** same contract · caught by code · **reproduced**

- **[MEDIUM]** `isNameBoundary` — `TemplateLiteral` is not a boundary, so an interpolated marker
  borrows a name: `` const s = `${trace(function () {}, {})}`; `` names its box `s`, though the
  function is coerced to a string. Covers the tagged form too, whose interpolated expressions sit in
  the `TemplateLiteral` quasi.
  - **Fix:** add `t.isTemplateLiteral(path.node)`.
  - **Cites:** same contract · caught by code · **reproduced**

- **[HIGH — REBUTTED, not fixed]** `isNameBoundary` — the audit also reported that a generic
  `CallExpression` / `NewExpression` / `OptionalCallExpression` ancestor is not a boundary, so
  `const d = foo(trace(function () {}, {}));` and `const d = (function () { trace({}); })();` name
  their box `d`.
  **This is the documented design, not a defect.** That shape is structurally identical to
  `const load = useCallback(trace(fn, options), [])` → `load`, which the plan names as the whole reason
  the surrounding-declarator rule exists, and to the IIFE the worklog lists as a verified
  enclosing-form host. The proposed fix — treat a call as a boundary except the marker's own call —
  does not save it: in the flagship shape the marker's call is nested inside a *different*
  `CallExpression` (`useCallback(...)`), so the walk would stop there and the primary use case would
  fail to build. Recorded in `isNameBoundary`'s docstring so a later pass does not re-raise it.
  - **Cites:** plan "Approach" (trace-name resolution) · worklog `2026-07-30 01:50` (IIFE host)

## Verdict on completeness

With the four additions above applied, the enumeration is closed for the mislabel class. Everything
else audited is either correctly handled or provably transparent:

- **Returns a name (deliberate):** `VariableDeclarator`, `AssignmentExpression` (incl. its
  member-target case), `ObjectProperty`, `ClassProperty`, `ClassPrivateProperty`,
  `ClassAccessorProperty`; plus `ownName`'s own-id / method-key path, which runs before any walk.
- **Stops as a boundary (deliberate):** `Function` (the alias covers all six function kinds),
  `Statement` (incl. `ExportDefaultDeclaration`), `Program`, and `JSX` — comprehensive by
  construction, since `jsx.js` stamps the `JSX` alias on every type in the file, so
  `JSXExpressionContainer`, `JSXFragment` and `JSXSpreadChild` all match one check.
- **Correct only by transparency, worth knowing:** `ParenthesizedExpression` (never produced under the
  plugin's parser options, and a pure passthrough anyway) and the five TS type-erasure wrappers
  (`TSAsExpression`, `TSSatisfiesExpression`, `TSNonNullExpression`, `TSTypeAssertion`,
  `TSInstantiationExpression`) — all verified to still resolve `d as any`, `d!` and friends to `d`.
  Nothing in the code encodes *why* these are safe.
- **Moot:** `TSParameterProperty` (its parameter is an `Identifier` or an `AssignmentPattern` that
  already ends the walk), `Decorator`, `ObjectPattern`/`ArrayPattern`/`RestElement`, `SpreadElement`.
- **Known divergence, not filed:** `AwaitExpression` falls through and is right unless the awaited
  function object is itself a thenable — below the confidence bar, recorded here instead.
- A defaulted parameter on the *marked* function still resolves, because a parameter's
  `AssignmentPattern` lives inside the function's `params`, never on the ancestor walk that starts at
  `functionPath.parentPath`. The pass-2 boundary addition does not clip it.

## Rule coverage gaps

- Unchanged and now demonstrated three passes running: no rule requires a name-inference walk to
  enumerate the node-kind space, or obliges an audit of sibling kinds when the list grows. The
  docstring in `isNameBoundary` now states the obligation, which is the closest thing to a rule this
  mechanism has.
