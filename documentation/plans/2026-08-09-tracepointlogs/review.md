# Review: Context-aware single logs with `trace.point` — pass 1

> Model/effort: GPT-5/unknown

**Verdict:** WARN
**Scope:** `trace.point` public API, runtime writer, Babel transform, and the changed type/rendering tests
**Change scope:** base `HEAD` · paths `packages/babel-plugin-loxer-trace/src/{linked-loxer,marker-collection,marker-transform,marker-types,plugin,trace-binding}.ts`, `src/{Loxer,trace,tracing-types}.ts`, `src/core/TraceMessage.ts`, `test/{plain-function-trace-types,trace-message.test}.ts` · current change
**Lenses run:** code ✓ · simplicity ✓ · perf ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** security: no security-sensitive path or dependency change · a11y: no user-facing UI
**Agents dispatched:** 4

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-print-props-empty-options` · Empty `pp()` silently disables props rendering

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:384`
- **Issue:** The no-argument fallback emits `undefined` for `pp()` and `printProps()`. `writeTracePoint` treats that as no print request, so the advertised empty modifier attaches props without rendering them.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Emit an empty object for omitted `pp`/`printProps` arguments; keep the distinct omissions for module and highlight.
- **Cites:** plan approach §§1 and 4 · `AGENTS.md` props-printing contract · code-reviewer, acceptance-reviewer
- **Carry-over:** new

### 🔶 HIGH · `ACCEPTANCE-function-messages-reinterpreted` · Ordinary function messages become callbacks

- **Location:** `src/trace.ts:252`
- **Issue:** Every function-valued first terminal argument is invoked as a contextual formatter. The approved grammar reserves only exact `'fn'` and `'parent.fn'`; every other first value must reach Loxer’s ordinary message funnel. This changes function-message behavior and executes user code that should only be stringified.
- **Estimated fix cost:** 🔴 redesign
- **Route:** re-plan or dedicated spec/task
- **Fix:** Either remove the callback overload, dispatch branch, renderer, and callback tests, or explicitly revise the feature contract before retaining this API.
- **Cites:** plan approach §§1–2 · `SIMPLICITY_REVIEW.md` speculative-generality rule · acceptance-reviewer, simplicity-reviewer
- **Carry-over:** new
- **Blast radius:** touches exported trace types, point argument/prop routing, trace-message rendering, and callers that may already use the callback syntax.

### 🔶 HIGH · `TEST-point-runtime-behavior` · Trace-point behavior has no observable logger coverage

- **Location:** `src/trace.ts:242`
- **Issue:** The runtime adds selector and callback routing, props shifting, five terminals, lazy rendering, queue behavior, state reset, box membership, and normal-stream error output, but the changed tests exercise only the callback renderer directly.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md TEST-point-runtime-behavior`
- **Fix:** Add a table-driven `test/trace-point.test.ts` that observes transformed point calls, covering terminal/selector routing, callbacks, props, modifiers, hidden and disabled behavior, queue replay, error output, missing transforms, and boxed/unboxed outcomes.
- **Cites:** `rules/testing.md` global-state and consumer-observable requirements · plan verification · test-reviewer
- **Carry-over:** new

### 🔶 HIGH · `TEST-point-transform-contract` · New Babel grammar and linking paths are entirely untested

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:318`
- **Issue:** No changed tests pin the fluent parser, diagnostics, name/parent resolution, selective imports, point-first ordering, evaluation order, spread preservation, or invocation-local box-id rewrite.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md TEST-point-transform-contract`
- **Fix:** Add an independently discovered point-transform suite using the existing fixture. Drive grammar and diagnostics with `test.each`; execute point-only and mixed transformed modules to check evaluation order, imports, naming, box attachment, and nested boundaries.
- **Cites:** `rules/testing.md` transform and `test.each` requirements · plan approaches §§3 and 5 · test-reviewer
- **Carry-over:** new

### 🔶 HIGH · `TEST-point-built-consumers` · Published transform/runtime trees are not exercised

- **Location:** `packages/babel-plugin-loxer-trace/src/plugin.ts:120`
- **Issue:** The change adds generated runtime imports and a helper used by emitted code, but no built Babel-plugin, runtime, Vite, or demo-consumer coverage verifies the trees a consumer executes.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md TEST-point-built-consumers`
- **Fix:** Extend built-consumer coverage with point-only and mixed marker transforms executed against the package `dist` trees, plus the existing Vite consumer/build path.
- **Cites:** `rules/testing.md` built-tree and consumer requirements · plan verification steps 6–8 · test-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-point-type-grammar` · Public fluent types are covered only for callback context

- **Location:** `test/plain-function-trace-types.ts:65`
- **Issue:** The type fixture checks callback-context members but not terminal overloads, selectors, direct modules, reserved names, aliases, optional arguments, or one-use modifier families.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md TEST-point-type-grammar`
- **Fix:** Extend the type fixtures and registry tests with accepted grammar calls and `@ts-expect-error` cases for duplicate aliases, lifecycle members, invalid selectors, and reserved modules.
- **Cites:** plan approaches §§1–2 and verification · `rules/testing.md` type-affecting gate · test-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-print-props-alias-repeats` · Fluent types do not consume the full alias family

- **Location:** `src/trace.ts:129`
- **Issue:** Both props-printing aliases remove only `'pp'` from the generic state, so calls such as `.pp().printProps()` type-check even though the transformer rejects duplicate modifiers.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Remove both `'pp'` and `'printProps'` from the state after either alias, preferably through a shared alias-family type.
- **Cites:** plan approach §1 · `rules/coding-conventions.md` public-API consistency · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-point-module-reservations` · Point grammar reuses the wrong direct-module reservation set

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:396`
- **Issue:** The point collector rejects a direct module named `props`, despite points having no `.props()` modifier, but permits `printProps`, which is a point modifier. The type, transform, and missing-transform proxy are inconsistent.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md CODE-point-module-reservations`
- **Fix:** Define and share a point-specific reservation set: allow `props`, reserve `printProps`, and align `TracePointReservedMember` with it.
- **Cites:** plan approach §1 · `CODE_REVIEW.md` public API correctness · code-reviewer, acceptance-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-duplicate-marker-proxy-gate` · Point marker repeats the existing proxy mechanism

- **Location:** `src/trace.ts:205`
- **Issue:** The new point marker and the existing function marker duplicate the same proxy get-trap behavior.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review.md SIMPLICITY-duplicate-marker-proxy-gate`
- **Fix:** Extract a local proxy-construction helper that accepts the target and fluent fallback, then use it for both marker paths.
- **Cites:** `SIMPLICITY_REVIEW.md` duplicated-logic rule · `AGENTS.md` shared-semantic-helper rule · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-dead-optional-argument-guard` · Allowlist makes the boolean branch unreachable

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:371`
- **Issue:** The preceding six-name allowlist guarantees `expectsOptional` is true, so its repeated comparisons and false branch are dead.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Remove `expectsOptional` and validate only that no more than one argument was supplied.
- **Cites:** `SIMPLICITY_REVIEW.md` complexity rule · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `PERF-unused-containing-module-lookup` · Explicit modules still scan for the containing box

- **Location:** `src/Loxer.ts:293`
- **Issue:** Every boxed point resolves the containing module before it checks `options.hasModule`. For explicit point modules, the result is unused; before initialization this can linearly scan up to 1,000 queued logs.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Resolve the containing box only when `!options.hasModule && containingBoxId !== undefined`.
- **Cites:** `PERFORMANCE_REVIEW.md` redundant hot-path work · `AGENTS.md` queue and optional-cost guidance · perf-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (4):** `CODE-print-props-empty-options`, `CODE-print-props-alias-repeats`, `SIMPLICITY-dead-optional-argument-guard`, `PERF-unused-containing-module-lookup` → specifically requested implementation task
- **Implementation pass — 🟡 contained (6):** `TEST-point-runtime-behavior`, `TEST-point-transform-contract`, `TEST-point-built-consumers`, `TEST-point-type-grammar`, `CODE-point-module-reservations`, `SIMPLICITY-duplicate-marker-proxy-gate` → `implement documentation/plans/2026-08-09-tracepointlogs/review.md <IDs>`
- **Own task — 🔴 redesign (1):** `ACCEPTANCE-function-messages-reinterpreted` → re-plan or dedicated spec/task

## Rule coverage gaps

- No standalone specification exists. The plan explicitly declares `Spec: none`, so it was the acceptance baseline for this pass.

## Notes

- The performance lens was completed by the simplicity-reviewer under the same bounded scope because the review had reached its four-agent capacity.
- Reviewers did not run tests, as required by the review assignment.
- The code reviewer read the worklog to verify that callbacks were an intentional follow-up; this exceeded the targeted-diff budget and is recorded in that lens digest.
