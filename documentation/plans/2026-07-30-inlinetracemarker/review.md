# Review: inline trace markers — function literals and enclosing functions (pass 1)

**Verdict:** WARN
**Scope:** working-tree diff vs `HEAD` on `master` — `packages/babel-plugin-loxer-trace/src/plugin.ts`,
`packages/babel-plugin-loxer-trace/src/trace-binding.ts`, `src/trace.ts`, `src/tracing-types.ts`,
`test/plain-function-trace.test.ts`, `examples/vite-trace-demo/src/main.ts`
**Lenses run:** code ✓ · security ✓ (dep-audit skipped: no manifest or lockfile changed) · perf ✓ ·
a11y skipped: the change is a build-time transform plus library types; the only UI-shaped file is the
example demo page, not a shipped UI surface · acceptance ✓ (no spec — planned from a framed problem;
the plan's Verification section was the rulebook) · test ✓

Baseline at review time: `pnpm build`, `pnpm lint`, `pnpm test` (240/240), `pnpm typecheck:test`,
`pnpm typecheck:types` and `pnpm demo:build` all exit 0.

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/plugin.ts:676` (`isNameBoundary`) — the name walk
  ends at a JSX node, an array element and a conditional branch, but not at a `LogicalExpression`.
  `const f = cond && trace((id) => id, { moduleId: 'ORDER' })` therefore emits
  `__startTrace("f", …)` with no error, naming the box after a binding the function only
  conditionally becomes. This is the mislabelled-box failure mode the plan's contract rules out and
  the worklog records as closed for the other three shapes, and the function's own docstring names
  the rule it breaks: a shape that "holds a function among alternatives" must end the walk — which
  is exactly `&&` / `||` / `??`. A `SequenceExpression` has the same shape.
  - **Fix:** add `t.isLogicalExpression(path.node)` and `t.isSequenceExpression(path.node)` to
    `isNameBoundary`, so both raise the existing "Cannot name the trace() target" error.
  - **Cites:** baseline (CODE_REVIEW.md — wrong boundary condition) · the change's own invariant
    (plan "Risks & open questions"; worklog `2026-07-30 01:50`) · caught by code
  - **Reproduced:** yes — transformed against the built plugin; emitted name `"f"`, no error.

- **[HIGH]** `src/trace.ts:194,208,215,218,242,251,256` — `functionName` is interpolated into every
  trace message without passing through `sanitizeMessage`, the control-character/ANSI filter the same
  file already applies to arguments, results and formatter return values. That was unreachable before
  this diff, because a name could only ever be a source-level identifier. This diff adds two
  arbitrary-string sources for it: the new `TraceOptions.name` string literal (`plugin.ts` →
  `declaredName`) and a string-literal object/class property key (`propertyName`). With no
  `devLog`/`devError` callback registered the sink is a bare `console.log`
  (`src/core/OutputStreams.ts`), so a name carrying `\n` or `[…m` forges terminal lines or ANSI
  sequences — a bypass of a control this project has already fixed twice for the other message inputs
  (`documentation/plans/2026-07-22-babelplainfunctiontracing/review-3.md`, `review-5.md`).
  - **Fix:** sanitize `functionName` once where `__startTrace` receives it and use the sanitized value
    for every message, rather than repeating the call at seven interpolation sites.
  - **Cites:** baseline (SECURITY_REVIEW.md §Injection — log/terminal injection) · project precedent
    (the two review files above) · `packages/babel-plugin-loxer-trace/AGENTS.md` ("never assume
    transformed user code has benign values") · caught by security
  - **Reproduced:** yes — `name: 'evil[31m\nFAKE LINE'` reaches the output message verbatim.

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/plugin.ts:648` (`surroundingName`) — the walk
  recognizes `ObjectProperty` and `ClassProperty` as name sources, and `ownName` separately recognizes
  `ClassPrivateMethod` (a private method reports `#run`), but nothing recognizes
  `ClassPrivateProperty`. A private field holding a function — `#load = () => { trace({ … }); }` —
  fails with "Cannot name the trace() target" even though `#load` names it exactly as well as the
  supported public-field and private-method cases. It fails loudly and `name` is a documented
  workaround, so this is an asymmetry rather than a defect.
  - **Fix:** add a `t.isClassPrivateProperty(node)` branch beside the existing
    `t.isObjectProperty(node) || t.isClassProperty(node)` check; `nonComputedName` already resolves a
    `PrivateName` key.
  - **Cites:** baseline (CODE_REVIEW.md — asymmetric handling of parallel cases) · caught by code
  - **Reproduced:** yes — `#load` errors where `#run` resolves.

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:194` (`traceLiteral`) /
  `src/trace.ts:34` — an arrow literal always emits `__withTraceFunctionLength(wrapper, length)`,
  which always runs `Object.defineProperty(target, 'length', …)` even when `length` is 0 and the
  rest-parameter wrapper's natural `length` is already 0. The diff's own demo hits this
  (`trace(() => { … }, …)` in `examples/vite-trace-demo/src/main.ts`), and for the form's documented
  motivating use — a marker inside a memoizing hook — this path runs once per render, so a no-op
  `defineProperty` recurs at render cadence.
  - **Fix:** in `traceLiteral`, route through the helper only when the computed length is greater
    than 0; this also drops the helper's import for the common zero-argument-arrow marker.
  - **Cites:** baseline (PERFORMANCE_REVIEW.md §Redundant work in hot paths) · caught by perf

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:283` — the `RestElement`
  branch of `getParameterArgsExpression` has no test, though the code comment beside it names
  `...rest` as one of the two shapes it exists for. The arrow-parameter test covers a plain, a
  defaulted and a destructured parameter only. Matches the uncovered lines 284-288 in the coverage
  report; not defensive or unreachable code.
  - **Fix:** extend the arrow-parameter test with `(first, ...rest) => { trace({ … }); }`, asserting
    `.length` and the recorded item.
  - **Cites:** plan Verification (arrow arguments from the parameter list) · `rules/testing.md` ·
    caught by test

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/plugin.ts:704` — `propertyName`'s
  string-literal-key branch has no test. Every new naming test uses an identifier key, so a quoted
  key (`{ 'load-order': function () { trace({}); } }`) exercises nothing. Matches uncovered line 712.
  - **Fix:** add one quoted-string-key case to an existing naming test.
  - **Cites:** plan Verification (the surrounding property in the naming chain) · caught by test

- **[MEDIUM]** `src/tracing-types.ts` (`argsAsItem` / `openMessage` JSDoc) — for an arrow host in the
  enclosing-function form, a defaulted or destructured parameter's recorded argument is read after
  default application, so an omitted argument is logged as its computed default. The non-arrow
  `arguments`-based path records `undefined` for the same call. The difference is deliberate and
  tested (`test/plain-function-trace.test.ts:2132`), but it means a secret or PII default value can
  reach the logs where a reader would expect "what the caller passed", and neither the JSDoc nor the
  guide says so.
  - **Fix:** state it in the `TraceOptions` JSDoc and in the guide section that teaches the form.
  - **Cites:** baseline (SECURITY_REVIEW.md §Sensitive-data exposure) · `rules/documentation.md` ·
    caught by security

- **[MEDIUM]** `documentation/index.md` — the plan's "Critical files" list requires teaching all three
  marker forms as one set, and the file is untouched by this diff. Disclosed rather than silent: the
  worklog defers it to the Documentation phase at both `00:31` and `01:50`. Recorded here so it is
  not lost before the workflow closes.
  - **Fix:** run the Documentation phase before sign-off, covering both new forms and their
    option-evaluation-timing difference.
  - **Cites:** plan "Critical files" · caught by acceptance

- **[LOW]** `documentation/debt.md` — the plan says the React Compiler ordering caveat is "recorded in
  `documentation/debt.md` territory rather than solved here", but no such entry exists (only the
  pre-existing `D-1`). The wording may describe where the concern belongs rather than claim it was
  filed, hence LOW.
  - **Fix:** either add the entry per that file's template, or state in the worklog that it is
    intentionally unfiled.
  - **Cites:** plan "Risks & open questions" · caught by acceptance

## Rule coverage gaps

- No project rule requires sanitizing or validating a build-time string (`name`, a string-literal
  property key) that the transform embeds in generated code and that ends up on a terminal. The
  control-character convention exists only as code plus tests in `src/trace.ts`, never as a stated
  invariant — which is why nothing flagged that a new name source needed it. Surfaced by security.
- No project rule says how exhaustively an AST name-inference walk must enumerate expression kinds,
  or that extending such a list requires auditing the others. Both name-walk findings above are that
  class of gap. Surfaced by code.
- `rules/testing.md` documents no rule about keeping `test/types/` current when a public overload
  changes. The plan names `pnpm typecheck:types` as the check for the new `trace` overload trio, but
  `test/types/registry.test-d.ts` is untouched: nothing pins that `useCallback(trace(fn, opts), [])`
  infers `fn`'s type, or that `trace<[string], Order>({ … })` accepts explicit type arguments.
  Surfaced by test and code.
- `documentation/Performance.md` benchmarks only the core `Loxer` open/add/close/error path; nothing
  covers the overhead the generated trace code adds (the extra `_invokeTrace` closure, the
  per-invocation arguments array, the length helpers). Surfaced by perf.
- `packages/babel-plugin-loxer-trace/AGENTS.md` states correctness rules only; nothing bounds
  acceptable traversal complexity for the transform passes, so a future regression there would be
  silent. (Not a defect today — marker depth is memoized before sorting, and the plugin bails out
  early on modules with no `trace` import.) Surfaced by perf.
- No project artifact links use-cases to tests (no `FEATURES.md` or equivalent); the plan worklog's
  `[Testing]` rows are the only record. They were cross-checked line-by-line against the test file
  and found accurate. Surfaced by test.
