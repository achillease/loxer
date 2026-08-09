# Review: Context-aware single logs with `trace.point` — pass 2

> Model/effort: GPT-5/unknown

**Verdict:** WARN
**Scope:** `trace.point` public grammar, runtime rendering and forwarding, Babel collection, and consumer-facing types
**Change scope:** base `HEAD` · paths `src/{Loxer,trace,tracing-types}.ts`, `src/core/{ANSIFormat,TraceMessage}.ts`, `packages/babel-plugin-loxer-trace/src/{linked-loxer,marker-collection,marker-transform,marker-types,plugin,trace-binding}.ts`, and the changed point/type/consumer tests · current change
**Lenses run:** code ✓ · acceptance ✓
**Lenses skipped/N/A:** simplicity: no still-open simplicity finding · security: no security-sensitive path or dependency change · perf: no still-open performance finding · a11y: no user-facing UI · test: no still-open test finding
**Agents dispatched:** 2

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `ACCEPTANCE-function-messages-reinterpreted` · Ordinary function messages remain callbacks

- **Location:** `src/trace.ts:266`
- **Issue:** Every function-valued first terminal argument is invoked as a contextual formatter. The approved plan reserves only exact `'fn'` and `'parent.fn'`; every other first value must reach Loxer’s ordinary message funnel. The worklog has no fixed or rebutted disposition for this finding.
- **Estimated fix cost:** 🔴 redesign
- **Route:** re-plan or dedicated spec/task
- **Fix:** Remove callback dispatch, or explicitly revise and approve the feature contract before retaining it.
- **Cites:** `documentation/plans/2026-08-09-tracepointlogs/plan.md` approaches 1–2 · acceptance-reviewer
- **Carry-over:** carried over from `ACCEPTANCE-function-messages-reinterpreted`; remains open
- **Blast radius:** Exported trace types, point argument and prop routing, callback rendering, tests, and existing callback-syntax callers.

### 🔷 MEDIUM · `CODE-point-computed-modules` · Typed computed module selectors fail transformation

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:390`
- **Issue:** `TracePointModuleMembers` permits `trace.point[moduleId]`, and the changed registry type fixture accepts a `TracePointModuleId` selector, but the collector rejects every computed point member. A valid TypeScript call therefore fails Babel transformation.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review-2.md CODE-point-computed-modules`
- **Fix:** Handle computed direct-module members like the existing function-marker collector: preserve the property expression as the module value while retaining static reserved-name diagnostics.
- **Cites:** `CODE_REVIEW.md` public-API consistency · plan approach 1 · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-alert-point-spans-dropped` · Warning and error points discard contextual spans

- **Location:** `src/trace.ts:294`
- **Issue:** `pointMessageAtLevel` converts rendered trace messages to plain text for `warn` and `error`, dropping the parent/function spans required for contextual trace coloring. `ANSIFormat` can preserve the whole-message warning or error prefix around nested spans, so this conversion is unnecessary.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Forward `TraceMessage` at every level and let `ANSIFormat.colorMessageSpans` reapply the alert prefix after each contextual span.
- **Cites:** plan approaches 2 and 4 · `CODE_REVIEW.md` correctness · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-empty-point-reinterpreted` · An omitted ordinary message becomes contextual output

- **Location:** `src/trace.ts:272`
- **Issue:** The zero-argument ordinary overload renders the lifecycle-style default `parent.fn()` message. The approved grammar says calls without a selector use Loxer’s ordinary message funnel, where an omitted message remains empty; only exact selector forms add inferred context.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Remove the zero-argument `renderOpenMessage` branch so an absent first argument follows the ordinary-message path.
- **Cites:** plan approaches 1, 2, and 4 · `CODE_REVIEW.md` correctness · code-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (2):** `CODE-alert-point-spans-dropped`, `CODE-empty-point-reinterpreted` → specifically requested implementation task
- **Implementation pass — 🟡 contained (1):** `CODE-point-computed-modules` → `implement documentation/plans/2026-08-09-tracepointlogs/review-2.md CODE-point-computed-modules`
- **Own task — 🔴 redesign (1):** `ACCEPTANCE-function-messages-reinterpreted` → re-plan or dedicated spec/task

## Rule coverage gaps

- No standalone specification exists. The plan explicitly declares `Spec: none`, so it remains the acceptance baseline.

## Notes

- Pass 2 was narrowed to the still-open acceptance finding plus a code review because product code remains changed. The pass did not re-run lenses whose pass-1 findings are recorded fixed in the worklog.
