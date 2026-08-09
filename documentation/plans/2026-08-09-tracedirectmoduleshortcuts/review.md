# Review: Direct module shortcuts for the trace marker — pass 1

> Model/effort: GPT-5/unknown

**Verdict:** PASS
**Scope:** Direct trace-module shortcuts: public marker types and runtime sentinel, Babel collection, demo, documentation, and trace test coverage.
**Change scope:** base `HEAD` · paths `README.md`, `documentation/index.md`, `examples/vite-trace-demo/src/main.ts`, `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `packages/*-plugin-loxer-trace/README.md`, `src/trace.ts`, `src/tracing-types.ts`, `src/types.ts`, associated trace tests, and generated TypeDoc · current change
**Lenses run:** code ✓ · simplicity ✓ · security — · perf ✓ · a11y — · acceptance ✓ · test ✓
**Lenses skipped/N/A:** security: no security-relevant code or dependency changes · a11y: no user-facing UI
**Agents dispatched:** 5

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `CODE-demo-result-props-route` · Demo no longer attaches the order result as a prop

- **Location:** `examples/vite-trace-demo/src/main.ts:170`
- **Issue:** `.pp('result')` only configures rendering. Without `.props('result')`, the closing trace has no result prop to render, so the migrated demo no longer demonstrates result-prop output.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Add `.props('result')` before `.pp('result')` in the order trace chain.
- **Cites:** plan §5 (executable Vite demo) · `CODE_REVIEW.md` · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-trace-generic-jsdoc` · JSDoc retains the removed bare-marker generic form

- **Location:** `src/tracing-types.ts:61`, `src/tracing-types.ts:106`
- **Issue:** Two comments still advise `trace<Args, Result>(options)` even though the marker is now non-callable. The supported form is `trace.info<Args, Result>(options)`.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracedirectmoduleshortcuts/review.md CODE-trace-generic-jsdoc`
- **Fix:** Replace both bare generic marker references with their `.info` equivalents.
- **Cites:** plan §1 (bare default-info forms removed) · `CODE_REVIEW.md` · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-direct-module-form-terminal-matrix` · Direct-selector coverage omits most form/terminal combinations

- **Location:** `test/plain-function-trace-core.test.ts:648`
- **Issue:** All-terminal direct-selector execution is covered only for named targets. Target-list, inline, and enclosing tests use computed selection only with `info`; static dot/bracket coverage is absent for those forms. A form-specific collector or emitter regression can therefore pass.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracedirectmoduleshortcuts/review.md TEST-direct-module-form-terminal-matrix`
- **Fix:** Use shared `test.each` tables to cover direct dot, static bracket, computed, `.m()`, and `.module()` selectors across named, list, inline, and enclosing forms, with every terminal where behavior can differ.
- **Cites:** plan Verification · `rules/testing.md` (table-driven cases) · test-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-trace-proxy-introspection-contract` · New proxy’s introspection boundary is unpinned

- **Location:** `test/plain-function-trace-core.test.ts:503`
- **Issue:** Missing-transform tests cover terminal calls on direct selectors, but do not pin that `trace.then` is `undefined`, symbol/introspection reads do not become module selectors, or that `Loxer` remains an ordinary object with no direct module members.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Add focused runtime-marker assertions for those proxy and singleton boundaries.
- **Cites:** plan §4 and Verification · test-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `PERF-full-program-reference-validation-traverse` · Avoid a second whole-program traversal per transformed file

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:164`
- **Issue:** The new marker-reference validation traverses every referenced identifier in the program and performs a scope lookup for each, though it only needs references to imported `trace` bindings. This adds avoidable transform-time work in large modules.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracedirectmoduleshortcuts/review.md PERF-full-program-reference-validation-traverse`
- **Fix:** Iterate the trace bindings’ `referencePaths`, or an equivalently scoped binding-reference API, while preserving the chain validation.
- **Cites:** `PERFORMANCE_REVIEW.md` (redundant hot-path work) · perf-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (2):** `CODE-demo-result-props-route`, `TEST-trace-proxy-introspection-contract` → specifically requested implementation task
- **Implementation pass — 🟡 contained (3):** `CODE-trace-generic-jsdoc`, `TEST-direct-module-form-terminal-matrix`, `PERF-full-program-reference-validation-traverse` → `implement documentation/plans/2026-08-09-tracedirectmoduleshortcuts/review.md <IDs>`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- No approved product spec exists (`plan.md` declares `Spec: none`), so the plan is the only acceptance reference. · acceptance-reviewer
- No project rule covers compiler-transform traversal cost; `PERFORMANCE_REVIEW.md` was applied. · perf-reviewer

## Notes

- Pass 1. No prior review findings or dispositions exist.
- Simplicity review found no issues.
- Acceptance review found the implementation and scoped tests aligned with the plan; its reviewer exceeded the search budget accidentally, and no conclusion relies on that extra search.
