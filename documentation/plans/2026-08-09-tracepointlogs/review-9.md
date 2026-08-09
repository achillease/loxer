# Review: Context-aware single logs with `trace.point` — pass 9

> Model/effort: GPT-5/unknown

**Verdict:** PASS
**Scope:** `trace.point` collection, transformation, box attachment, rendering, and runtime output
**Change scope:** base `HEAD` · paths `packages/babel-plugin-loxer-trace/src/{linked-loxer,marker-collection,marker-transform,marker-types,plugin,trace-binding}.ts`, `src/{Loxer,trace,tracing-types}.ts`, and `src/core/{ANSIFormat,TraceMessage}.ts` · current change
**Lenses run:** code ✓
**Lenses skipped/N/A:** simplicity: no still-open simplicity finding · security: no security-sensitive path or dependency change · perf: no still-open performance finding · a11y: no user-facing UI · acceptance: the callback contract is documented in the plan · test: pass-8 test findings are fixed
**Agents dispatched:** 1

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `CODE-point-concise-arrow-unlinked` · Concise-arrow points miss their generated trace box

- **Location:** `packages/babel-plugin-loxer-trace/src/linked-loxer.ts:26`
- **Issue:** `rewriteDirectLoxerCalls()` traverses only descendants of the handed body path. When a traced arrow’s concise body is itself the generated `__tracePoint(...)` call, Babel traversal never visits that root call, leaving its containing-box argument `undefined`.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review-9.md CODE-point-concise-arrow-unlinked`
- **Fix:** Apply the helper-call rewrite to the handed root path before traversing descendants, while retaining the nested-function boundary.
- **Cites:** plan approach 5 box-attachment contract · `CODE_REVIEW.md` correctness · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-point-parameter-unlinked` · Points in traced parameter initializers execute outside the trace box

- **Location:** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:31`
- **Issue:** Point collection accepts calls in parameter defaults as belonging to the enclosing function, but linked-point rewriting only examines its body. Parameter defaults execute before the wrapper body creates `traceState`, so such points remain unboxed despite being directly inside an instrumented function.
- **Estimated fix cost:** 🔴 redesign
- **Route:** re-plan or dedicated task
- **Fix:** Define parameter-point semantics explicitly, then either restructure parameter handling so tracing starts first or reject this placement with a transform diagnostic.
- **Cites:** plan approaches 3 and 5 · `CODE_REVIEW.md` correctness · code-reviewer
- **Carry-over:** new
- **Blast radius:** Function-wrapper structure, parameter-default timing, function length, and generated trace-state availability.

### 🔷 MEDIUM · `CODE-point-anonymous-diagnostic` · Anonymous-point diagnostic recommends an unavailable option

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:544`
- **Issue:** Point naming delegates to the lifecycle-marker resolver with an empty options object. On failure it tells callers to use the trace `name` option, but `trace.point` exposes no such option, leaving an impossible remediation.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracepointlogs/review-9.md CODE-point-anonymous-diagnostic`
- **Fix:** Emit a point-specific diagnostic directing callers to use a named function or stable binding.
- **Cites:** plan approach 3 anonymous-function diagnostic · `CODE_REVIEW.md` misleading diagnostics · code-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (2):** `CODE-point-concise-arrow-unlinked`, `CODE-point-anonymous-diagnostic` → `implement documentation/plans/2026-08-09-tracepointlogs/review-9.md <IDs>`
- **Own task — 🔴 redesign (1):** `CODE-point-parameter-unlinked` → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- Pass 9 is narrowed to the code lens. All pass-8 findings are recorded fixed in the worklog; product code remains changed.
