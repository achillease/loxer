# Review: Context-aware single logs with `trace.point` — pass 8

> Model/effort: GPT-5/unknown

**Verdict:** WARN
**Scope:** Complete `trace.point` implementation, tests, built consumers, and required public delivery surfaces
**Change scope:** base `129e3a39a3b91805ccfbc8dd710cf65f13f85202` · paths `packages/babel-plugin-loxer-trace/src/{linked-loxer,marker-collection,marker-transform,marker-types,plugin,trace-binding}.ts`, `src/{Loxer,trace,tracing-types}.ts`, `src/core/{ANSIFormat,TraceMessage}.ts`, and changed trace-point tests · comprehensive user-requested review
**Lenses run:** code ✓ · simplicity ✓ · perf ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** security: no security-sensitive path or dependency change · a11y: no user-facing UI
**Agents dispatched:** 5

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `CODE-point-computed-root-misclassified` · Computed access to the reserved point marker is misclassified

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:462`
- **Issue:** `trace['point'].info(...)` resolves to the point proxy at runtime, but point collection accepts only non-computed `.point`. The ordinary marker collector then treats `['point']` as a direct module selector instead of emitting `__tracePoint`.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Recognize computed string-literal `'point'` as the reserved point root before ordinary marker collection can reinterpret it.
- **Cites:** `CODE_REVIEW.md` public compatibility · plan approaches 1 and 3 · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-dead-point-transform-metadata` · Point markers retain unreachable transform scaffolding

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-transform.ts:142`
- **Issue:** Point markers are filtered before `innermostFirst`, making its point-specific depth branch unreachable; `PointMarker.functionPath` is written but never read.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Remove the dead depth branch and unused marker field/initializer.
- **Cites:** `SIMPLICITY_REVIEW.md` deletion left undone · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-eager-runtime-helper-identifiers` · Selective helpers are modeled as always present

- **Location:** `packages/babel-plugin-loxer-trace/src/plugin.ts:120`
- **Issue:** Lifecycle helper IDs are allocated for point-only files, while function-only files perform an unused whole-program point-helper traversal and pass a truthy absent helper into linked-log rewriting.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Compute marker kinds once, allocate each helper-ID family only when present, and represent an absent point helper as `undefined`.
- **Cites:** plan approach 3 selective-helper requirement · `SIMPLICITY_REVIEW.md` · `PERFORMANCE_REVIEW.md` · simplicity-reviewer · perf-reviewer
- **Carry-over:** new; consolidated with `PERF-pointless-point-helper-traversals`

### 🔷 MEDIUM · `SIMPLICITY-marker-proxy-redundant-fallback` · Marker proxy exposes an unused fallback seam

- **Location:** `src/trace.ts:230`
- **Issue:** Both calls pass the same target as the proxy fallback, so the second parameter represents no supported behavior.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Keep only the target parameter and return it for unknown direct-module properties.
- **Cites:** `SIMPLICITY_REVIEW.md` speculative generality · simplicity-reviewer
- **Carry-over:** new; distinct from fixed `SIMPLICITY-duplicate-marker-proxy-gate`

### 🔷 MEDIUM · `SIMPLICITY-duplicate-module-normalization` · Trace points duplicate Loxer module selection

- **Location:** `src/Loxer.ts:297`
- **Issue:** `m()` and `writeTracePoint()` independently normalize an explicit module ID with the same `isNES`/`ensureModule` rule.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Extract a private shared module-normalization helper for the two runtime consumers.
- **Cites:** `AGENTS.md` shared-helper rule · `SIMPLICITY_REVIEW.md` · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `SIMPLICITY-point-renderer-shape-churn` · Point renderers rebuild the trace-call abstraction

- **Location:** `src/core/TraceMessage.ts:442`
- **Issue:** `__tracePoint` creates a `TraceCall`, but point renderers accept its fields separately and one reconstructs it; selector routing also duplicates the existing marked-name rule.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Pass `TraceCall` to both renderers, use `TracePointSelector`, and delegate naming to `markedName`.
- **Cites:** `AGENTS.md` shared-helper rule · `SIMPLICITY_REVIEW.md` · simplicity-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `PERF-point-modifier-iife-allocation` · Explicit modifiers allocate a rest-IIFE per log

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:443`
- **Issue:** Every explicit module, highlight, or props modifier becomes an invoked arrow with a rest array, including literals and hidden logs.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Emit known non-undefined literals directly; use a once-evaluated temporary for dynamic non-spread values; retain rest capture only for true spreads.
- **Cites:** plan exact-once requirement · `PERFORMANCE_REVIEW.md` · perf-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `PERF-eager-point-context` · Ordinary and hidden points build unused contextual state

- **Location:** `src/trace.ts:259`
- **Issue:** Every point allocates a `TraceCall`, parent resolver, and props slice before the visibility gate, although ordinary messages do not use context and hidden contextual logs never render it.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Construct contextual state only within the lazy selector/callback branch and avoid copying props except for selector routing.
- **Cites:** `AGENTS.md` lazy message-style rule · `PERFORMANCE_REVIEW.md` · perf-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `PERF-point-selector-whole-suffix-passes` · Selector rendering rescans caller suffixes

- **Location:** `src/core/TraceMessage.ts:452`
- **Issue:** Selector rendering sanitizes an already-sanitized suffix, then passes the whole contextual prefix plus user suffix through span extraction despite markers occurring only in the short prefix.
- **Estimated fix cost:** 🟡 contained
- **Route:** implementation pass
- **Fix:** Extract spans from the contextual `name()` prefix only, then append the sanitized suffix while retaining prefix spans.
- **Cites:** `PropsPrinter.stringifyMessage` sanitization contract · `PERFORMANCE_REVIEW.md` · perf-reviewer
- **Carry-over:** new

### 🔶 HIGH · `TEST-point-transform-contract` · Transform fixes remain unpinned

- **Location:** `test/trace-point.test.ts:70`
- **Issue:** Current tests do not exercise modifier spreads, runtime undefined defaults, call-site terminal spread order, hostile helper/global names, shadowed marker bindings, or relevant diagnostics and naming cases.
- **Estimated fix cost:** 🟡 contained
- **Route:** testing pass
- **Fix:** Add table-driven transform-and-execute cases that assert exact-once source order and no captured user identifiers.
- **Cites:** plan risks and verification · plugin `AGENTS.md` adversarial-fixture rule · `rules/testing.md` · test-reviewer
- **Carry-over:** carried over from `TEST-point-transform-contract`; new evidence identifies branches added after its prior fix.

### 🔶 HIGH · `TEST-point-runtime-behavior` · End-to-end routing and box contracts are partially covered

- **Location:** `test/trace-point.test.ts:40`
- **Issue:** Callback tests bypass `__tracePoint`; all argument routes, hidden/disabled behavior, error stream, state reset, box visibility, outranking levels, and nested lexical boundaries lack end-to-end coverage.
- **Estimated fix cost:** 🟡 contained
- **Route:** testing pass
- **Fix:** Drive transformed calls through output callbacks with table coverage for terminals, routing, props, render count, history, streams, box IDs, hidden behavior, and lexical boundaries.
- **Cites:** plan approaches 2, 4, and 5 · `rules/testing.md` · test-reviewer
- **Carry-over:** carried over from `TEST-point-runtime-behavior`; new evidence identifies untested writer routes.

### 🔷 MEDIUM · `TEST-point-built-consumers` · Built coverage omits selective and mixed integration

- **Location:** `test/dist-consumer.test.ts:261`
- **Issue:** Point-only built coverage does not inspect emitted imports; no built test covers mixed markers, box linking, marker cleanup, or callback/dynamic/spread branches.
- **Estimated fix cost:** 🟡 contained
- **Route:** testing pass
- **Fix:** Inspect point-only and mixed emitted code, then execute built modules against the built runtime.
- **Cites:** plan verification · `rules/testing.md` built-tree rule · test-reviewer
- **Carry-over:** carried over from `TEST-point-built-consumers`; new evidence identifies missing selective/mixed assertions.

### 🔷 MEDIUM · `TEST-point-type-grammar` · Public point types are incompletely pinned

- **Location:** `test/plain-function-trace-types.ts:65`
- **Issue:** The fixtures omit several terminals/modifier aliases, one-use family conflicts, forbidden lifecycle members, and named type exports with exact callback-context assertions.
- **Estimated fix cost:** 🟡 contained
- **Route:** testing pass
- **Fix:** Add positive and negative compile-time cases for the full public point grammar and declarations.
- **Cites:** plan approach 1 and verification · `rules/testing.md` typecheck rule · test-reviewer
- **Carry-over:** carried over from `TEST-point-type-grammar`; new evidence identifies unasserted public members and exports.

### 🔷 MEDIUM · `ACCEPTANCE-public-tracepoint-guidance-missing` · Required public guidance and demo are absent

- **Location:** `documentation/plans/2026-08-09-tracepointlogs/plan.md:163`
- **Issue:** The plan requires root and authored guides, Babel/Vite setup guidance, and a compiled demo call, but none of the named public surfaces contains `trace.point`.
- **Estimated fix cost:** 🟡 contained
- **Route:** documentation pass
- **Fix:** Add the planned mental model, API routing and behavior guidance, missing-transform explanation, and compiled demo call across the named surfaces.
- **Cites:** plan approach 6 and critical files · acceptance-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (9):** `CODE-point-computed-root-misclassified`, `SIMPLICITY-dead-point-transform-metadata`, `SIMPLICITY-eager-runtime-helper-identifiers`, `SIMPLICITY-marker-proxy-redundant-fallback`, `SIMPLICITY-duplicate-module-normalization`, `SIMPLICITY-point-renderer-shape-churn`, `PERF-point-modifier-iife-allocation`, `PERF-eager-point-context`, `PERF-point-selector-whole-suffix-passes` → implementation pass
- **Testing pass — 🟡 contained (4):** `TEST-point-transform-contract`, `TEST-point-runtime-behavior`, `TEST-point-built-consumers`, `TEST-point-type-grammar` → testing pass
- **Documentation pass — 🟡 contained (1):** `ACCEPTANCE-public-tracepoint-guidance-missing` → documentation pass
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- No standalone specification exists; the plan is the acceptance baseline.
- Transform-time traversal and generated-code allocation budgets are undocumented.

## Notes

- At the user's direction, this comprehensive later-pass review overrides the normal three-lens cap. It ran five lenses to avoid another narrow-finding loop.
- `SIMPLICITY-eager-runtime-helper-identifiers` consolidates the duplicate performance finding `PERF-pointless-point-helper-traversals`.
