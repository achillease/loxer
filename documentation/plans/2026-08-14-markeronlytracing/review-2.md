# Review: Marker-only tracing — remove the `@trace` and `@initLoxer` decorators — pass 2

**Verdict:** WARN
**Scope:** verification of the pass-1 fix round, plus the current diff for the code, test and acceptance lenses
**Change scope:** base `HEAD` · paths `src/trace.ts`, `src/tracing-types.ts`, `src/core/TraceMessage.ts`, `src/core/PropsPrinter.ts`, `src/index.ts`, `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, deleted `src/core/TraceNames.ts` + `src/decorators/**`, `test/types/registry.test-d.ts`, `test/types/tsconfig.json`, `test/class-parent-name-cases.ts`, `test/trace-message-cases.ts`, `test/trace-message.test.ts`, `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts`, `vitest.config.ts`, deleted `test/decorators*.test.ts` + `test/trace-cases.ts`, `tsconfig.json`, `typedoc.json`, `playground/OrderService.js`, `CHANGELOG.md`, `documentation/environments.md`, `documentation/index.md` · current change (working tree dirty, so base is `HEAD`)
**Lenses run:** code ✓ · simplicity — · security — · perf — · a11y — · acceptance ✓ · test ✓
**Lenses skipped/N/A:** simplicity: returned no findings in pass 1 and the fix round added no design surface — it touched docblocks, one type pin and plan text. perf: returned no findings in pass 1; the fix round changed no executable path. security: no dependency, lockfile, auth, input-handling or secret-bearing code in the diff. a11y: no user-facing UI in the package.
**Agents dispatched:** 3

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `ACC-undeclared-doc-edits-in-tree` · Three deferred documentation files are still staged with this change

- **Location:** `CHANGELOG.md`, `documentation/environments.md`, `documentation/index.md`
- **Issue:** Facts re-confirmed, unchanged from pass 1. All three are still in the index, and their mtimes
  (2026-08-13 19:14, 2026-08-14 01:05, 2026-08-13 19:55) all predate the change work, so the fix pass left them
  untouched exactly as the worklog states. `CHANGELOG.md` still advertises the deleted API as current: `@initLoxer()`
  at :60, decorator protocol support at :65-66, `printArgs` / `printResult` as `@trace()` options at :94,
  `argsAsProps` / `resultAsProps` at :131-133, and `@trace` fixes at :195 and :210-212. Committing the whole index
  would publish a changelog describing removed code.
- **Estimated fix cost:** 🟢 local (a commit-path decision, no edit)
- **Route:** user — commit this change with an explicit path list rather than the whole index
- **Fix:** None proposed for the file contents; the user owns them. Do not resolve this by editing or reverting the
  doc content — that is separate in-flight work.
- **Cites:** `plan.md` stream 7 ("No guide, JSDoc, TypeDoc, changelog or steering-doc edits in this change") ·
  `rules/documentation.md` · acceptance lens
- **Carry-over:** carried over from `ACC-undeclared-doc-edits-in-tree` (pass 1) · **deferred at the user's direction**
  (worklog 13:10). Not re-litigated and no edit proposed; it is restated because it is still true of the tree and it
  alone sets this pass's verdict.

### 🔷 MEDIUM · `CODE-moduleid-trace-option-dangling` · The root barrel's registry docblock still names a trace option this change deleted

- **Location:** `src/index.ts:41-43`
- **Issue:** The `LoxerModuleRegistry` docblock says the registry types `Loxer.init({ modules })`, `.module(...)`,
  `.m(...)`, `Loxer.getModuleLevel(...)` "and the `moduleId` trace option". `moduleId` was a field of the decorator's
  `TraceOptions`; this change deletes it. The surviving `TraceOptions` (`src/tracing-types.ts:189-209`) has exactly
  `name`, `openMessage` and `closeMessage`, and `test/types/registry.test-d.ts:287` now pins that key set as exact.
  `moduleId` survives only on the `@internal` `TraceRuntimeOptions` the transform emits. A marker author selects a
  module through the chain (`trace.m('PERS')`, `trace.PERS`), which is what the registry actually narrows via
  `TraceModuleId` (`src/trace.ts:82`). So the one public sentence describing the trace side of the registry names an
  option that no longer exists. This falls in the carve-out plan stream 2 kept out of the stream-7 deferral —
  docblocks are corrected where they name a deleted or renamed declaration in the code being changed — and
  `src/index.ts` is both a changed file and a TypeDoc entry point, so the sentence ships into the generated API page.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + ID
- **Fix:** Replace "and the `moduleId` trace option" with the marker's module selectors (`trace.m(...)` /
  `trace.<Module>`, typed through `TraceModuleId`). The identical sentence exists at `src/types.ts:183-184` on
  `ModuleId`; it is outside this review's path list but is the same dangling reference and should be fixed in the same
  edit rather than left as the sole survivor.
- **Cites:** `rules/documentation.md` ("Keep JSDoc in `src/` aligned with actual behavior") · CODE_REVIEW baseline
  ("comments that contradict the code"; backward-compat: removed public option) · `plan.md` stream 2 · code lens
- **Carry-over:** new

### ◽ LOW · `ACC-no-spec` · No spec exists for this change

- **Location:** `documentation/specs/` (four specs, none for marker-only tracing) · `plan.md:4`
- **Issue:** Public API was removed and three exported types renamed with no spec-level acceptance criteria.
  Judgement rests on the plan alone.
- **Estimated fix cost:** 🟡 contained
- **Route:** informational — the deferred documentation follow-up carries the user-visible contract
- **Fix:** Already directed: `plan.md:165-168` records that the follow-up warrants its own spec, written by `specify`.
- **Cites:** REVIEW_RUBRIC §1-2 (a missing spec is material, never N/A) · acceptance lens
- **Carry-over:** carried over from `ACC-no-spec` (pass 1) · **deferred** (worklog 13:01). Not re-litigated.

## Routed fix queue

- **Fixable now — 🟢 local (2):** `CODE-moduleid-trace-option-dangling`, `ACC-undeclared-doc-edits-in-tree` →
  specifically requested implementation task. `ACC-undeclared-doc-edits-in-tree` is a user commit-path decision, not
  an edit.
- **Implementation pass — 🟡 contained (1):** `ACC-no-spec` (deferred) → belongs to the documentation follow-up, not
  to a fix pass on this change
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Pass-1 dispositions verified

All nine pass-1 findings were checked against the current tree.

| ID | Pass-1 disposition | Pass-2 verification |
|:--|:--|:--|
| `TEST-stale-ts-expect-error-tracedecorator` | fixed | Confirmed. The dead row is deleted; two new pins at `test/types/registry.test-d.ts:67-71` assert `trace` / `initLoxer` are absent from the package root, and each directive genuinely swallows a real "has no exported member" diagnostic. |
| `CODE-trace-options-literal-claim` | fixed | Confirmed. `src/tracing-types.ts:171-174` matches `declaredName` and the verbatim `markerOptions` emission. |
| `CODE-message-examples-dont-compile` | fixed | Confirmed. All five examples compile; the in-function form resolves to overload 3, whose two type parameters both default. |
| `CODE-trace-highlight-undocumented` | fixed | Confirmed. `src/tracing-types.ts:4-13` documents all three members, the boolean shorthand, the failure close and `trace.point`'s boolean — each claim checked against `isHighlighted`. |
| `CODE-removed-root-exports-inventory` | fixed | Confirmed complete against `git show HEAD:src/decorators/{index,trace,initLoxer}.ts`. |
| `ACC-deferred-item-not-durable` | fixed | Confirmed. `plan.md:156-163` names `rules/coding-conventions.md:5`, the `AGENTS.md` memoization contradiction, and the three deleted paths `src/core/AGENTS.md` cites. |
| `ACC-demo-frozen-deps-unrecorded` | fixed | Confirmed, and answered more strongly than asked: `optimizeDeps.exclude` means Vite serves `/@fs/.../dist/*.js` with no cache layer, and the served `trace.js` carries the side-aware `isHighlighted`. |
| `ACC-no-spec` | deferred | Carried over above. |
| `ACC-undeclared-doc-edits-in-tree` | deferred (user) | Carried over above; facts re-confirmed. |

## Rule coverage gaps

- Four steering docs still describe the removed decorator runtime: `AGENTS.md` (requires a **memoized** parent
  resolver that `src/core/TraceMessage.ts:216-218` deliberately is not), `rules/testing.md` (mandates a two-copy
  `classParentName` pin where one copy remains), `src/core/AGENTS.md:63-71` (names `TraceNames.ts`,
  `src/decorators/trace.ts` and `test/decorators.test.ts`, all deleted), and `rules/coding-conventions.md:5` (still
  lists `experimentalDecorators: true`). All four are now named in `plan.md:156-163`, so the deferral is complete.
  Unchanged from pass 1; no new gap opened.
- `documentation/debt.md` carries no entry for this deferral. Pass 1's accepted fix explicitly allowed the plan folder
  instead, so this is an observation, not a re-raised finding.
- The project has no `FEATURES.md` or use-case↔test link registry, so no stale-link freshness check applies. Standing
  gap, unchanged from pass 1.

## Notes

- **The verdict is set by a decision the user already owns.** No code, test or config finding above LOW exists in this
  pass. `ACC-undeclared-doc-edits-in-tree` is HIGH because the tree still cannot be committed wholesale, not because
  anything in the change is wrong.
- **No new undeclared scope from the fix round.** Only four files carry a post-review mtime: `src/tracing-types.ts`
  (12:58), `test/types/registry.test-d.ts` (12:58), `plan.md` (12:59) and `worklog.md` (13:10). Each maps to an
  authorized finding.
- **All seven plan streams are met or explicitly deferred**, and the acceptance lens reproduced the straggler sweep and
  the built-tree export check independently: `dist/decorators/` and `dist/core/TraceNames.*` are absent, `dist/index.js`
  and `dist/index.d.ts` mention neither `decorators` nor `initLoxer`, and `git status examples/` is clean.
- **The test lens swept all 39 remaining `@ts-expect-error` rows** in `test/types/registry.test-d.ts` for the same
  defect class that produced `TEST-stale-ts-expect-error-tracedecorator`. No recurrence: every remaining row pins
  registry/module-narrowing, point-family, modifier-chaining or marker-option-shape rules untouched by the decorator
  removal.
- **No coverage lost** to the ~1292 deleted decorator-suite lines. The shared case tables are still driven against the
  marker runtime by the untouched `test/plain-function-trace-message-templates.test.ts`. Decorator-specific behavior
  with no marker analogue (runtime `this.constructor.name` resolution, symbol method names, TS standard-decorator
  emit) is correctly not re-driven — that surface no longer exists.
- **Budget exceeded (code lens):** read `marker-collection.ts`'s `assertModifierArguments` / `collectFluentMarkerCall` /
  `collectFluentPointCall` to confirm `h('open')` passes through opaquely and a bare `.h()` still defaults to `true`;
  `git show HEAD:src/decorators/*` for the removed-export inventory; `src/types.ts:183-184` and
  `test/types/registry.test-d.ts` to establish the dangling `moduleId` reference. All are direct consumers or producers
  of changed lines.
- **Verification claims were not re-run.** This phase is read-only, so the five gates, the built-tree transform run,
  `node playground/OrderService.js`, the demo and the scratch typedoc run are taken as recorded. The straggler sweep
  and the built-tree export check are the two items reproduced independently.
- No `> Model/effort:` signature line: the runtime exposes the active model but not the active effort, and the signing
  contract requires omitting the line rather than writing a placeholder. Same as pass 1.
