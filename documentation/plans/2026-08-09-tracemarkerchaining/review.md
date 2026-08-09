# Review: Fluent trace-marker chaining — pass 1

> Model/effort: gpt-5/unknown

**Verdict:** WARN
**Scope:** Fluent trace-marker API, its Babel transform, runtime support, public types, and regression tests.
**Change scope:** base `HEAD` · paths `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `packages/babel-plugin-loxer-trace/src/marker-transform.ts`, `packages/babel-plugin-loxer-trace/src/marker-types.ts`, `src/Loxer.ts`, `src/trace.ts`, `src/tracing-types.ts`, `src/types.ts`, and the changed trace/type/consumer tests · current change
**Lenses run:** code ✓ · simplicity ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** security: no security-sensitive handling or dependency change · perf: no data-access, algorithmic, or rendering hot-path concern in the diff · a11y: no user-facing UI
**Agents dispatched:** 4

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-public-error-box-entrypoint` · Internal trace opening is publicly callable

- **Location:** `src/types.ts:53`
- **Issue:** Adding `openTrace(level: LogLevel, ...)` to exported `LoxerCore` exposes `Loxer.openTrace('error', ...)` to all consumers. That re-enables manual error-level boxes, although the public manual-box API must remain limited to `BoxLevel` and the `LogLevel` opening path is required to stay trace-internal.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md CODE-public-error-box-entrypoint`
- **Fix:** Keep the LogLevel-capable opening helper outside exported `Loxer`/`LoxerCore`, behind a deliberately internal boundary used only by `__startTrace`.
- **Cites:** Plan §6 and Risks · `CODE_REVIEW.md` public-API compatibility checklist · code-reviewer, acceptance-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-incomplete-multimodifier-chain-not-diagnosed` · Multi-modifier incomplete chains bypass validation

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:146`
- **Issue:** `trace.m('ORDER').h()` is ignored instead of diagnosed: its terminal modifier is rooted in a previous modifier call, so the `isMarkerRoot(...)` check fails and the inner call is skipped as part of a member/call chain. The expression reaches the missing-transform error only at runtime.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md CODE-incomplete-multimodifier-chain-not-diagnosed`
- **Fix:** Recognize incomplete chains with `isFluentMarkerRoot(...)` and retain the required code-frame diagnostic.
- **Cites:** Plan §3 requires diagnostics for incomplete/non-terminal chains · `CODE_REVIEW.md` correctness · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `ACCEPT-legacy-marker-runtime-fallback` · Runtime still accepts removed marker properties

- **Location:** `src/tracing-types.ts:224`, `src/trace.ts:164`, `src/trace.ts:200`
- **Issue:** `TraceMarkerRuntimeOptions` retains old marker capture/render fields and `__startTrace()` falls back to `resolveTracePrintProps(options)`, `argsAsProps`, and `resultAsProps`. This compatibility path contradicts the clean-cut contract, which explicitly forbids runtime fallback or translation for the removed marker options.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md ACCEPT-legacy-marker-runtime-fallback`
- **Fix:** Define the emitted runtime configuration independently with only fluent fields and `markerOptions`; remove legacy fallback reads and types.
- **Cites:** Plan §1 · `SIMPLICITY_REVIEW.md` deletion left undone · simplicity-reviewer, acceptance-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-dead-marker-options-field` · Marker records retain an unread options field

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-types.ts:17`
- **Issue:** The three marker variants retain and collect `optionsNode`, but marker consumers no longer read it after `configurationNode` superseded that role.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md SIMPLICITY-dead-marker-options-field`
- **Fix:** Remove `optionsNode` from the marker interfaces and collected marker objects; retain a local options AST only while resolving names and building `configurationNode`.
- **Cites:** `SIMPLICITY_REVIEW.md` deletion left undone · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-reuse-level-resolver` · New code reimplements the existing level resolver

- **Location:** `src/trace.ts:196`
- **Issue:** `resolveTraceLevel` duplicates the unknown-value-to-`LogLevel` fallback already provided by `resolveThreshold(level, fallback)`.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md SIMPLICITY-reuse-level-resolver`
- **Fix:** Reuse `resolveThreshold(options.level, 'info')` and delete `resolveTraceLevel`.
- **Cites:** `SIMPLICITY_REVIEW.md` reuse before invention · `AGENTS.md` shared-helper rule · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-duplicate-trace-target-gate` · Capture and rendering duplicate lifecycle-target matching

- **Location:** `src/trace.ts:202`, `src/trace.ts:230`
- **Issue:** The same `side || argsResult` routing rule is implemented for capture and again for printer routing, creating independent copies of one semantic gate.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md SIMPLICITY-duplicate-trace-target-gate`
- **Fix:** Add one local helper that decides whether a target applies to a lifecycle side, and use it for both capture and printer routing.
- **Cites:** `AGENTS.md` shared-helper rule · `SIMPLICITY_REVIEW.md` duplicated logic · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-fluent-evaluation-forms` · Modifier evaluation is tested for only one marker form

- **Location:** `test/plain-function-trace-core.test.ts:625`
- **Issue:** The once-only/source-order case covers only a named statement marker. Target-list, inline, and enclosing markers have separate transformation and storage paths but lack side-effectful modifier coverage.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md TEST-fluent-evaluation-forms`
- **Fix:** Add focused side-effectful modifier/options cases for target-list, inline, and enclosing forms. Assert source order, once-only evaluation, and each form's configuration lifetime.
- **Cites:** Plan §4 and Verification · `rules/testing.md` · test-reviewer, acceptance-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-error-level-box-visibility` · Error-level boxes lack visibility and layout regression coverage

- **Location:** `test/plain-function-trace-core.test.ts:556`
- **Issue:** Error-terminal tests verify levels and linked failures but not module thresholds, history membership, hidden/open-box state, or box-column pairing for the new internal error-level opening path.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md TEST-error-level-box-visibility`
- **Fix:** Add error-level trace cases for visible and hidden thresholds, open/close history pairing, nested box columns, and absence of orphaned visible box markers.
- **Cites:** Plan §6 and Verification · `rules/testing.md` box-layout rule · test-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-dynamic-props-routing` · Runtime-invalid props targets are untested

- **Location:** `test/plain-function-trace-core.test.ts:649`
- **Issue:** Tests cover valid dynamic targets and invalid literals, but not untyped dynamic values that are invalid at runtime. The contract promises that invalid runtime targets select neither lifecycle side without throwing.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md TEST-dynamic-props-routing`
- **Fix:** Transform markers whose `.props()` and `.pp()` targets evaluate to invalid values and assert success, no attached props, and no printer request on either record.
- **Cites:** Plan §§3 and 5 · test-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (9):** `CODE-public-error-box-entrypoint`, `CODE-incomplete-multimodifier-chain-not-diagnosed`, `ACCEPT-legacy-marker-runtime-fallback`, `SIMPLICITY-dead-marker-options-field`, `SIMPLICITY-reuse-level-resolver`, `SIMPLICITY-duplicate-trace-target-gate`, `TEST-fluent-evaluation-forms`, `TEST-error-level-box-visibility`, `TEST-dynamic-props-routing` → `implement documentation/plans/2026-08-09-tracemarkerchaining/review.md <IDs>`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- Four static reviewers judged the diff. No tests were run as part of this Review phase.
