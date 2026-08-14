# Review: Marker-only tracing — remove the `@trace` and `@initLoxer` decorators — pass 1

**Verdict:** WARN
**Scope:** decorator deletion, three type renames, per-side marker highlighting, parent-resolver memo removal, retired decorator toolchain, test surgery
**Change scope:** base `HEAD` · paths `src/trace.ts`, `src/tracing-types.ts`, `src/core/TraceMessage.ts`, `src/core/PropsPrinter.ts`, `src/core/TraceNames.ts` (deleted), `src/index.ts`, `src/decorators/` (deleted), `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `tsconfig.json`, `test/types/tsconfig.json`, `vitest.config.ts`, `typedoc.json`, `test/class-parent-name-cases.ts`, `test/trace-message-cases.ts`, `test/trace-message.test.ts`, `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts`, `test/types/registry.test-d.ts`, deleted `test/decorators*.test.ts` + `test/trace-cases.ts`, `playground/OrderService.js` · current change (working tree dirty, so base is `HEAD`)
**Lenses run:** code ✓ · simplicity ✓ · security — · perf ✓ · a11y — · acceptance ✓ · test ✓
**Lenses skipped/N/A:** security: no dependency, lockfile, auth, input-handling or secret-bearing code in the diff — the change deletes API surface and renames types. a11y: no user-facing UI in the package.
**Agents dispatched:** 5

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `TEST-stale-ts-expect-error-tracedecorator` · A dead `traceDecorator` row makes a type pin assert nothing

- **Location:** `test/types/registry.test-d.ts:198-199`
- **Issue:** The `trace as traceDecorator` import was removed, but one call site survived:
  `// @ts-expect-error a decorator trace opens a public BoxLevel box, so 'error' is not accepted` followed by
  `traceDecorator({ level: 'error' });`. `traceDecorator` is now an undefined identifier, TypeScript reports
  "Cannot find name", and the `@ts-expect-error` above it swallows that error. So `pnpm typecheck:types` stays
  green while the row no longer pins the rule its comment claims. Every other decorator-only row in the file was
  correctly deleted; this one was missed. The plan's own risk list required each `@ts-expect-error` row to be
  re-read individually, and the worklog claims that was done row by row.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` — delete both lines
- **Fix:** Remove lines 198-199. No replacement is needed: the marker's own level rejection is already pinned at
  `test/types/registry.test-d.ts:308-309` (`traceMarker.info(load, { level: 'warn' })`), and there is no decorator
  left to pin a decorator-shaped rejection against.
- **Cites:** `plan.md` Risks ("`@ts-expect-error` rows flip meaning") · `rules/testing.md` (a pin that cannot fail is not a pin) · test + acceptance lenses (found independently by both; merged, `ACC-stale-decorator-type-pin` folded in)
- **Carry-over:** new

### 🔶 HIGH · `ACC-undeclared-doc-edits-in-tree` · Three documentation files are staged that this change defers in full

- **Location:** `CHANGELOG.md`, `documentation/environments.md` (new, 163 lines), `documentation/index.md:156-158`
- **Issue:** Plan stream 7 defers all documentation, changelog included, and the worklog never mentions these files.
  They sit in the same index as the change. Their content is not this change's: `documentation/environments.md` is a
  new bundler/runtime guide with a link added from `index.md`, and the `CHANGELOG.md` diff moves the opposite way —
  it re-adds `@trace()` descriptions (`printArgs` / `printResult` options, `argsAsItem` / `resultAsItem` wording) and
  deletes the fluent-marker breaking entry plus three shipped fix entries (the Vite re-optimization fix, the
  dollar-sign callback fix, the unrecognized-threshold fix). It is not a revert to any of the last three commits.
  Committing it alongside this change would advertise the just-deleted decorator options as current and drop records
  of shipped fixes.
- **Estimated fix cost:** 🟢 local (a scope/commit decision, no code change)
- **Route:** user decision before commit — keep this change's commit to the code, test and config paths, and land the
  environments guide and the changelog rewrite as their own change
- **Fix:** Confirm where the three files came from, then commit this change with an explicit path list rather than the
  whole index. Do not resolve it by editing or reverting the doc content — that is separate in-flight work.
- **Cites:** `plan.md` stream 7 ("No guide, JSDoc, TypeDoc, changelog or steering-doc edits in this change") ·
  `rules/documentation.md` · acceptance lens
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-trace-options-literal-claim` · The `TraceOptions` docblock claims the build reads all three fields

- **Location:** `src/tracing-types.ts:148`
- **Issue:** The rewritten docblock says "The build reads all three fields, so each takes a literal the transform can
  see." Only `name` is read at build time: `declaredName`
  (`packages/babel-plugin-loxer-trace/src/marker-collection.ts:847-869`) walks the options object for `name` and
  throws `trace() name must be a string literal.` `openMessage` and `closeMessage` are never inspected — the whole
  options node is emitted verbatim as `markerOptions` (`marker-collection.ts:689`) and evaluated at run time, which is
  exactly why they may be callbacks. The sentence also contradicts the `name` field's own docblock 30 lines below, so
  the type teaches two rules.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + ID
- **Fix:** Say the transform reads `name` while it builds, so `name` alone must be a string literal, and that
  `openMessage` / `closeMessage` are evaluated at run time (a template string or a callback).
- **Cites:** `rules/documentation.md` ("Keep JSDoc in `src/` aligned with actual behavior") · CODE_REVIEW baseline
  ("comments that contradict the code") · code lens
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-message-examples-dont-compile` · Rewritten `@example` blocks pass type arguments the marker overloads reject

- **Location:** `src/tracing-types.ts:85` and `src/tracing-types.ts:126`
- **Issue:** Both examples were converted from decorator form to `trace.info<[number, number]>(calculate, { … })` and
  `trace.info<[number, number], { total: number }>(calculate, { … })`. No overload of `TraceMarkerCall`
  (`src/trace.ts:39-51`) accepts that: overloads 1 and 2 take a single type parameter
  `T extends PlainFunctionTraceTarget`, so an explicit tuple fails the constraint, and overload 3 takes the two type
  parameters but only the options argument, so passing `calculate` overflows its arity. The prose directly above each
  example states the correct form, so the example contradicts its own paragraph and copy-pastes into a compile error.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + ID
- **Fix:** Drop the type arguments where the target is named (`trace.info(calculate, { openMessage: … })` infers
  both), or show the in-function form (`trace.info<[number, number]>({ openMessage: … })`). While editing the
  close-message block, its leading line `calculate(price: number, quantity: number) { ... }` is bare method syntax
  with no class around it (pre-existing) and reads as leftover decorator context.
- **Cites:** `rules/documentation.md` ("Keep JSDoc in `src/` aligned with actual behavior") · CODE_REVIEW baseline ·
  code lens
- **Carry-over:** new

### 🔷 MEDIUM · `ACC-demo-frozen-deps-unrecorded` · The demo evidence may come from a frozen pre-change `dist`

- **Location:** worklog row `2026-08-14 12:27` vs `plan.md:213-216`
- **Issue:** The plan requires clearing `examples/vite-trace-demo/node_modules/.vite/deps` before the demo run so the
  dev server cannot serve an older `dist/`. The worklog records the demo run and what it showed, but not that
  clearing. A frozen pre-change copy would still export `trace` / `initLoxer` and would still pair boxes, so the
  demo's "boxes still open and close" evidence does not distinguish new code from stale code.
- **Estimated fix cost:** 🟢 local
- **Route:** verification step — clear the deps cache, rerun `pnpm demo`, record the result in the worklog
- **Fix:** Delete `examples/vite-trace-demo/node_modules/.vite/deps`, rerun the demo, and log it. The `h('open')`
  substitution itself is sound — the new transform-driven rows in `test/plain-function-trace-core.test.ts` cover the
  behavior the demo cannot show — so only the freshness step is missing.
- **Cites:** `plan.md` Verification · `rules/testing.md` ("a bundler keeps its own pre-bundled copy … a third tree
  neither `pnpm test` nor a Node-level run of `dist/` can see") · acceptance lens
- **Carry-over:** new

### ◽ LOW · `CODE-removed-root-exports-inventory` · The accepted-break inventory misses names that left the root barrel

- **Location:** `src/index.ts:7` (the two removed `export * from './decorators/…'` lines)
- **Issue:** The plan's accepted break names only `TraceCallPrinter`, `TraceOpenMessageContext` and
  `TraceCloseMessageContext` as losing their root path. The deleted barrel also carried `trace`, `initLoxer`,
  `TraceMethodContext`, `TraceMethodDecorator`, `InitLoxerClassContext`, `InitLoxerDecorator` and `TraceOptions`
  (`git show HEAD:src/decorators/trace.ts:17-22`). `TraceOptions` is the sharpest case: the name survives on
  `loxer/trace` with a different shape, while `TraceMarkerOptions` and `ExtendedPropsPrinterOptions` vanish by name
  from that same public subpath. The removal is intentional and matches the plan; the risk is that the deferred
  migration note gets written from an inventory that omits these names.
- **Estimated fix cost:** 🟢 local
- **Route:** append the missing names to the plan's deferred documentation list; no code change
- **Fix:** Extend the deferred list with `trace`, `initLoxer`, the four decorator protocol types, `TraceOptions`
  (removed from the root, repurposed on `loxer/trace`), and the `TraceMarkerOptions` → `TraceOptions` /
  `ExtendedPropsPrinterOptions` → `TracePrintOptions` renames.
- **Cites:** CODE_REVIEW baseline (backward-compat: removed exports) · `rules/documentation.md` migration-appendix
  rule · code lens
- **Carry-over:** new

### ◽ LOW · `CODE-trace-highlight-undocumented` · `TraceHighlight` became a public argument type with no docblock

- **Location:** `src/tracing-types.ts:4`
- **Issue:** This change makes `TraceHighlight` the named argument type of the public `h()` / `highlight()` chain and
  exports it from `loxer/trace` (`src/trace.ts:25`). It is the only exported declaration in the file without a
  docblock, so nothing on the public surface states the semantics the change introduces: `'all'`, `true` and a bare
  `.h()` highlight both sides, `'open'` / `'close'` one, and `false` or no `.h()` neither.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + ID, or fold into the deferred JSDoc pass
- **Fix:** Add a one-paragraph docblock naming the three members and the `boolean` shorthand, mirroring
  `isHighlighted`'s comment at `src/trace.ts:337-341`.
- **Cites:** CODE_REVIEW baseline (public-API shape) · `rules/documentation.md` JSDoc rule · code lens
- **Carry-over:** new

### ◽ LOW · `ACC-no-spec` · No spec exists for this change

- **Location:** `documentation/specs/` (four specs, none for marker-only tracing) · `plan.md:4` — "Spec: none —
  planned from the framed problem"
- **Issue:** The change removes public API (`@trace`, `@initLoxer`), renames three exported types, and adds a public
  option form (`h('open')`) with no spec-level acceptance criteria. Judgement rests on the plan alone, written in the
  same session, so no independent statement of "done" exists.
- **Estimated fix cost:** 🟡 contained
- **Route:** informational — a spec for the deferred documentation follow-up would close it for the user-visible half
  of this work
- **Fix:** Give the deferred documentation/migration follow-up a spec, since that is where the user-visible contract
  (migration paths, the `loxer/trace` import move) actually gets stated.
- **Cites:** REVIEW_RUBRIC §1-2 (a missing spec is material, never N/A) · acceptance lens
- **Carry-over:** new

### ◽ LOW · `ACC-deferred-item-not-durable` · One deferred item lives only in a worklog row

- **Location:** worklog row `2026-08-14 12:28` · `plan.md:149-152` (deferred steering-doc list)
- **Issue:** `rules/coding-conventions.md:5` still states `experimentalDecorators: true` as part of the stack. The
  worklog flags it, but the plan's deferred list does not name it and `documentation/debt.md` does not carry it, so
  the follow-up has to find it by reading this worklog.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + ID, or the documentation follow-up's planning step
- **Fix:** Add `rules/coding-conventions.md:5` to the deferred steering-doc list in the plan, or append the whole
  deferral to `documentation/debt.md` where the register lives.
- **Cites:** `rules/documentation.md` (`debt.md` is the register for knowingly-left problems) · `plan.md` stream 7 ·
  acceptance lens
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (8):** `TEST-stale-ts-expect-error-tracedecorator`, `ACC-undeclared-doc-edits-in-tree`,
  `CODE-trace-options-literal-claim`, `CODE-message-examples-dont-compile`, `ACC-demo-frozen-deps-unrecorded`,
  `CODE-removed-root-exports-inventory`, `CODE-trace-highlight-undocumented`, `ACC-deferred-item-not-durable` →
  specifically requested implementation task
- **Implementation pass — 🟡 contained (1):** `ACC-no-spec` →
  `implement documentation/plans/2026-08-14-markeronlytracing/review.md ACC-no-spec`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

`ACC-undeclared-doc-edits-in-tree` needs a user decision, not an edit — it is about which paths this change commits.
`ACC-demo-frozen-deps-unrecorded` is a verification rerun, not a code fix.

## Rule coverage gaps

- `src/core/AGENTS.md:63-71` names `TraceNames.ts` as the owner of the `parent.` templates and cites
  `src/decorators/trace.ts` and `test/decorators.test.ts` as the pin for `classParentName`. All three paths are
  deleted by this change, so the rule the next agent reads points at nothing. Deferred by plan stream 7.
- `AGENTS.md` (Behavior, "both trace runtimes") requires a "lazy, **memoized** parent resolver" and justifies the memo
  by the decorator reading its class off the instance. `src/core/TraceMessage.ts:216-218` deliberately drops the memo
  per plan stream 4, so `src/` now contradicts an active project rule. Deferred by plan stream 7.
- `rules/coding-conventions.md:5` still lists `experimentalDecorators: true` as part of the stack. Tracked as
  `ACC-deferred-item-not-durable`.
- `rules/testing.md` mandates a shared table pinning two copies of `classParentName`; there is one copy left. The
  table still pins the surviving build-time copy through transform output, so no coverage was lost, but the rule text
  no longer matches the code. Deferred by plan stream 7.
- The project has no `FEATURES.md` or use-case↔test link registry, so the test lens verified coverage freshness
  directly against the diff instead of against a project artifact.
- No project rule covers indirection depth, naming, or boolean-vs-enum shape — a standing baseline gap, not raised by
  anything in this diff.

## Notes

- **Verified clean, worth recording.** The marker is not re-exported from the package root, so
  `import { trace } from 'loxer'` cannot compile untransformed. All six `h()` forms resolve correctly through
  `isHighlighted(highlight, side)`, and the failure close takes `'close'`. The Babel plugin still passes the `.h(arg)`
  node through opaquely and defaults a bare `.h()` to `true`, so no build-time change was needed. `trace.point` keeps
  its boolean `h()` and `Loxer.__writeTracePoint` gates on `options.highlight === true`, so a stray string can never
  highlight a point. No dangling references to `TraceNames`, `decorators/`, `initLoxer`, `resolvePrintProps`,
  `resolveTracePrintProps` or `TracePrintProps` remain under `src/`, `packages/`, `playground/` or `examples/`.
  `marker-collection.ts` is a doc-comment-only change with a byte-identical `classParentName` body.
- **Simplicity found nothing**, having specifically ruled out deletion left undone (`qualifiedFunctionName` has two
  same-file call sites, not a cross-module abstraction), speculative generality in the widened `h()` (all three values
  have exercised call sites), collapsible renamed types (`TraceOptions` and `TraceRuntimeOptions` share only
  `moduleId`), and fusing `isHighlighted` with `targetsSide` (different value spaces; fusing would need a boolean
  trap).
- **Perf found nothing.** The memo removal does let one traced call recompute the parent per render side and per extra
  `parentFn(...)` call, but what is recomputed is `sanitizeControlCharacters` — one linear non-backtracking regex scan
  over a short build-time constant, with no allocation on the no-match path. It does not scale with call volume or
  argument size, and the default configuration (`openMessage: 'parent.fn'`, no `parent.` in the close message) resolves
  the parent exactly once either way.
- **Test lens confirmed no shared-machinery coverage was lost** to the ~1292 deleted lines: the case tables the
  decorator suites drove (`templateCases`, `failureCases`, `nonSerializableResultCases`, `parentlessFallbackCases` in
  `test/trace-message-cases.ts`) are still driven against the marker runtime by the unchanged
  `test/plain-function-trace-message-templates.test.ts`. The rewritten memoization rows assert real rendered text and
  still pin laziness. The new highlight rows assert `devLogs.map(log => log.highlighted)` in call order and confirm
  the failing close by message.
- **Both worklog deviations are properly closed** (12:21 memoization tests, 12:24 stale `dist/` orphans — the latter
  was extra work beyond the plan and a real catch, since `package.json` publishes `dist` wholesale).
- **One undeclared but justified addition:** `TraceHighlight` is now exported from `loxer/trace`. The plan does not
  list it; widening `h()` to accept the type makes it necessary, and the worklog records it. Not a finding — but see
  `CODE-trace-highlight-undocumented`.
- **Verification claims were not re-run.** This phase is read-only, so the worklog's five green gates, built-tree run,
  `node playground/OrderService.js` and scratch typedoc run were taken as recorded. The straggler sweep is the one
  item reproduced independently, and code/config are clean.
- **Budget exceeded (code lens):** read `packages/babel-plugin-loxer-trace/src/{marker-collection,trace-wrapper,linked-loxer}.ts`
  outside the diff hunks and `src/Loxer.ts:185-320` to validate the highlight port and the build-time claim in the
  changed docblock, plus `git show HEAD:src/decorators/*` for the removed-export inventory. All are direct
  callees/producers of changed lines.
- No `> Model/effort:` signature line: the runtime exposes the active model but not the active effort, and the signing
  contract requires omitting the line rather than writing a placeholder.
