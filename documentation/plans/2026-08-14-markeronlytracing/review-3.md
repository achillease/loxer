# Review: Marker-only tracing — remove the `@trace` and `@initLoxer` decorators — pass 3

**Verdict:** WARN
**Scope:** verification of the pass-2 fix round (`CODE-moduleid-trace-option-dangling`), plus the current diff for the code and acceptance lenses
**Change scope:** base `HEAD` · paths `src/index.ts`, `src/types.ts`, `src/trace.ts`, `src/tracing-types.ts`, `src/core/TraceMessage.ts`, `src/core/PropsPrinter.ts`, deleted `src/core/TraceNames.ts` + `src/decorators/**`, `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `tsconfig.json`, `test/types/tsconfig.json`, `vitest.config.ts`, `typedoc.json`, `playground/OrderService.js`, `test/class-parent-name-cases.ts`, `test/trace-message-cases.ts`, `test/trace-message.test.ts`, `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts`, `test/types/registry.test-d.ts`, deleted `test/decorators*.test.ts` + `test/trace-cases.ts`, `CHANGELOG.md`, `documentation/environments.md`, `documentation/index.md` · current change (working tree dirty, so base is `HEAD`)
**Lenses run:** code ✓ · simplicity — · security — · perf — · a11y — · acceptance ✓ · test —
**Lenses skipped/N/A:** simplicity: no findings in pass 1, and the pass-2 fix round touched two docblock sentences — no design surface. perf: no findings in pass 1; the fix round changed no executable path. test: owns no still-open finding — `TEST-stale-ts-expect-error-tracedecorator` was fixed and verified in pass 2, which also swept all 39 remaining `@ts-expect-error` rows for the same defect class; no test file changed in the fix round. security: no dependency, lockfile, auth, input-handling or secret-bearing code in the diff. a11y: no user-facing UI in the package.
**Agents dispatched:** 2

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

No new findings. Both entries below are carried over and already deferred.

### 🔶 HIGH · `ACC-undeclared-doc-edits-in-tree` · Three deferred documentation files are still staged with this change

- **Location:** `CHANGELOG.md`, `documentation/environments.md`, `documentation/index.md`
- **Issue:** Facts re-confirmed against the current tree, unchanged from passes 1 and 2. All three are still in the
  index (`M`, `A`, `M`), and their mtimes (2026-08-13 19:14, 2026-08-14 01:05, 2026-08-13 19:55) still predate the
  earliest change-work file (`src/core/PropsPrinter.ts`, 12:12 on 08-14), so the pass-2 fix round left them untouched
  exactly as the worklog states. `CHANGELOG.md`'s `[Unreleased]` section still presents the removed API as current:
  `@initLoxer()`, decorator protocol support, `printArgs` / `printResult` as `@trace()` options,
  `argsAsProps` / `resultAsProps`, and two `@trace` fix entries. Committing the whole index would publish a changelog
  describing code this change deletes.
- **Estimated fix cost:** 🟢 local (a commit-path decision, not an edit)
- **Route:** user — commit this change with an explicit path list rather than the whole index
- **Fix:** None proposed for the file contents; the user owns them. Do not resolve this by editing or reverting the doc
  content — that is separate in-flight work that plan stream 7 defers in full.
- **Cites:** `plan.md` stream 7 ("No guide, JSDoc, TypeDoc, changelog or steering-doc edits in this change") ·
  `rules/documentation.md` · acceptance lens
- **Carry-over:** carried over from `ACC-undeclared-doc-edits-in-tree` (pass 1) · **deferred at the user's direction**
  (worklog 13:10, restated 13:34). Not re-litigated and no edit proposed; restated because it is still true of the tree
  and it alone sets this pass's verdict.

### ◽ LOW · `ACC-no-spec` · No spec exists for this change

- **Location:** `documentation/specs/` (no marker-only-tracing spec) · `plan.md:4`
- **Issue:** Public API was removed and three exported types renamed with no spec-level acceptance criteria. Judgement
  rests on the plan alone.
- **Estimated fix cost:** 🟡 contained
- **Route:** informational — belongs to the deferred documentation follow-up
- **Fix:** Already directed at `plan.md:165-168`: the follow-up warrants its own spec, written by `specify`.
- **Cites:** REVIEW_RUBRIC §1-2 (a missing spec is material, never N/A) · acceptance lens
- **Carry-over:** carried over from `ACC-no-spec` (pass 1) · **deferred** (worklog 13:01). Not re-litigated.

## Routed fix queue

- **Fixable now — 🟢 local (1):** `ACC-undeclared-doc-edits-in-tree` — a user commit-path decision, not an edit
- **Implementation pass — 🟡 contained (1):** `ACC-no-spec` (deferred) → belongs to the documentation follow-up, not to
  a fix pass on this change
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

Nothing in this queue is actionable by `implement`. The code, tests and config are clean.

## Pass-2 disposition verified

| ID | Pass-2 disposition | Pass-3 verification |
|:--|:--|:--|
| `CODE-moduleid-trace-option-dangling` | fixed | **Confirmed at both sites, and no third site exists.** `src/index.ts:40-43` now reads "…`Loxer.getModuleLevel(...)` and the trace marker's module selectors (`trace.m(...)` and `trace.<Module>`)"; `src/types.ts:183-184` names only `trace.module(...)` / `trace.m(...)`. Both splits check out against the types: `trace.m` / `trace.module` take `ModuleId` (`src/trace.ts:93-94`), and the direct members are keyed by the narrower `TraceModuleId` (`src/trace.ts:82,88-90`) — exactly the distinction the worklog claims. Both lenses reproduced the sweep independently across `src/**` and `packages/*/src/**`: every surviving `moduleId` hit is a live parameter, field, or the `@internal` `TraceRuntimeOptions` / `TracePointRuntimeOptions` key the transform emits. No prose anywhere still calls `moduleId` a trace option. |
| `ACC-undeclared-doc-edits-in-tree` | deferred (user) | Carried over above; facts re-confirmed. |
| `ACC-no-spec` | deferred | Carried over above. |

## Plan streams and verification

All seven plan streams are met, with stream 7 (documentation deferred in full) partial only because the three deferred
documentation files sit in the same index — the deferral itself is complete and durable in `plan.md:130-168`. Streams 1–6
were re-confirmed line by line: the decorators and `src/core/TraceNames.ts` are gone with `qualifiedFunctionName` folded
into `src/core/TraceMessage.ts:17` byte-identical; all three renames landed; `isHighlighted(highlight, side)` is total
over `boolean | TraceHighlight | undefined` with all three call sites passing a side and the failure close taking
`'close'`; the parent resolver keeps its laziness without the memo; the four decorator toolchain settings are gone from
all four config files.

The plan's Verification list was not re-run — this phase is read-only — but four items were reproduced or corroborated
independently: the nine-term straggler sweep (every surviving hit is legitimate or a deferred steering doc), the
built-tree export check (`dist/decorators/` and `dist/core/TraceNames.*` absent; `dist/index.js` and `dist/index.d.ts`
mention neither `initLoxer` nor `decorators`), the "559 passing across 23 files" count against the 23 discoverable
`test/**/*.test.ts` files, and build freshness for the pass-2 fix — `dist/index.d.ts` and `dist/types.d.ts` carry the
post-fix sentences and are stamped 13:33:52, 24 seconds after the `src` edits, so `pnpm build` genuinely ran after the
fix rather than before it.

## Rule coverage gaps

- Four steering docs still describe the removed decorator runtime: `AGENTS.md` (requires a **memoized** parent resolver
  that `src/core/TraceMessage.ts:216-218` deliberately is not), `rules/testing.md` (mandates a two-copy
  `classParentName` pin where one copy remains), `src/core/AGENTS.md:64,68` (names `TraceNames.ts`,
  `src/decorators/trace.ts` and `test/decorators.test.ts`, all deleted), and `rules/coding-conventions.md:5` (still
  lists `experimentalDecorators: true`). All four are named in `plan.md:156-163`, so the deferral is complete and
  durable. Unchanged from pass 2; no new gap opened.
- `documentation/debt.md` carries no entry for this deferral. Pass 1 explicitly accepted the plan folder instead — an
  observation, not a re-raised finding.
- The project has no `FEATURES.md` or use-case↔test link registry. Standing gap, unchanged.

## Notes

- **The verdict is set by a decision the user already owns.** No code, test, config or acceptance finding above LOW
  exists in this pass. `ACC-undeclared-doc-edits-in-tree` is HIGH because the tree still cannot be committed wholesale,
  not because anything in the change is wrong. Three passes have now produced no open defect in the change itself.
- **No new undeclared scope from the pass-2 fix round.** An mtime sweep across every file in `git status` shows exactly
  two post-`review-2.md` (13:29) source changes: `src/index.ts` (13:33:26) and `src/types.ts` (13:33:28), plus
  `worklog.md` (13:34). Both map to the single authorized finding.
- **`src/types.ts` is not in the plan's critical-files list** but was explicitly directed by the pass-2 review ("should
  be fixed in the same edit rather than left as the sole survivor"). One docblock line, recorded in the worklog.
  Authorized scope, not a finding — noted so the record is unambiguous.
- **Re-checks that found nothing.** The deleted `PropsPrinter` helpers (`resolvePrintProps`, `TracePrintProps`,
  `NO_TRACE_PRINT_PROPS`, `resolveTracePrintProps`) have zero references repo-wide and reached `src/core/index.ts` only
  through `export *`; `package.json` exports just `.` and `./trace`, so they were never on a published entry point — no
  unlisted public break. The Babel plugin still passes the `.h(...)` argument node through unread and only synthesizes
  `true` for a bare `.h()`, and `trace.point`'s `h()` stays boolean-typed against a boolean-typed
  `TracePointRuntimeOptions.highlight`.
- **Minor, not raised as a finding (code lens):** both registry docblocks enumerate examples and neither mentions the
  `trace.point` chain, whose `m(...)` / `module(...)` also take `ModuleId`. The sentences are accurate as written, just
  non-exhaustive — the same as before the fix. Worth one word only if the documentation follow-up touches these lines
  anyway.
- **Budget exceeded (code lens):** read `marker-collection.ts`'s highlight-modifier emission and `package.json`'s
  `exports` map to confirm the `h(...)` pass-through and that no deleted `PropsPrinter` helper sat on a published entry
  point. Both are direct consumers of changed lines.
- **Budget exceeded (acceptance lens):** read `src/trace.ts:60-176` and `src/tracing-types.ts:160-232` beyond the
  changed hunks to confirm the `TraceModuleId` vs `ModuleId` distinction the two fixed docblocks assert; ran a
  repo-wide `git grep` for the nine straggler terms and a `git status` mtime sweep to test the "no third site" and "no
  undeclared scope" claims. All are required to judge the pass-2 fix claims this pass was asked to verify.
- **Verification claims were not re-run.** This phase is read-only, so the five gates, the built-tree transform run,
  `node playground/OrderService.js`, the demo and the scratch typedoc run are taken as recorded.
- No `> Model/effort:` signature line: the runtime exposes the active model but not the active effort, and the signing
  contract requires omitting the line rather than writing a placeholder. Same as passes 1 and 2.
