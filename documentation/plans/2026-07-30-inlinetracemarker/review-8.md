# Review: pass-7 fixes to `parent.functionName` (pass 8)

**Verdict:** WARN
**Scope:** the fix delta applied after pass 7, and nothing else — `src/trace.ts` (the
`needsParentName` gate in `__startTrace`), `src/core/TraceNames.ts` and
`packages/babel-plugin-loxer-trace/src/marker-collection.ts` (both copies of `classParentName`, the
exact-`Class` guard), and `packages/babel-plugin-loxer-trace/src/marker-transform.ts`
(`marker.className ?? fileName` → `|| fileName`, plus the comment recording that the fallback holds
an invariant rather than a reachable case).
**Lenses run:** code ✓ · perf ✓ · test ✓ · security skipped: the delta touches no security surface,
and pass 7's `server.fs.allow` finding is untouched and still open · acceptance skipped: the delta
restores the contract pass 7 measured against and changes no delivered claim · a11y skipped: no UI ·
dependency audit skipped: no manifest or lockfile change.

With the delta applied: `pnpm lint`, `pnpm build`, `pnpm test` (293/293 across 19 files) and
`pnpm typecheck:test` all exit 0.

## Findings (by severity)

Every finding in this pass is a **missing test**. Writing them is Testing-phase work, so all three
are carried forward rather than closed here.

- **[HIGH]** `test/plain-function-trace-enclosing.test.ts` and `test/decorators.test.ts` — no test
  constructs a class named exactly `Class`, which is the sole input the new guard exists for. Every
  existing suffix assertion uses `OrderServiceClass` (`test/decorators.test.ts:289`,
  `test/plain-function-trace-enclosing.test.ts:272`). Dropping the guard, or typoing it to
  `!== 'class'`, leaves all 293 tests passing — so the fix pass 7 asked for landed unverified in
  both of its homes at once.
  - **Fix:** in both suites, trace a method of a class literally named `Class` with
    `openMessage`/`closeMessage: 'parent.functionName'` and assert `Class.<method>()` /
    `Class.<method> done` rather than a bare name.
  - **Cites:** project rule (`rules/testing.md`, the decorator-message-change done-gate) · the two
    files' own JSDoc, which claims exactly these suites pin the copies together · caught by test
    and code (code raised it as MEDIUM; merged here at the higher severity per rubric §6).

- **[HIGH]** `src/trace.ts:188-189` — the `needsParentName` gate is a two-sided `||`, and only one
  side is exercised. `test/plain-function-trace-enclosing.test.ts:395-416` pairs
  `openMessage: 'parent.functionName'` with `closeMessage: 'result'`, covering open-only. But every
  occurrence of `closeMessage: 'parent.functionName'` in the entire suite — `test/trace-cases.ts:100`,
  `test/decorators.test.ts:39,258,279,297,320`, `test/plain-function-trace-enclosing.test.ts:132`,
  `test/plain-function-trace-inline.test.ts:100,105`, `test/plain-function-trace-core.test.ts:1041,
  1043,1059,1061` — also sets `openMessage` to the same style. So a gate that checked only
  `options.openMessage` and forgot the `closeMessage` half would pass all 293 tests while silently
  dropping the parent from every close-only message. The gate as written is correct; the suite
  cannot tell.
  - **Fix:** add a case with `openMessage` left at its default (or `'args'`) and
    `closeMessage: 'parent.functionName'`, asserting the close message carries the parent and the
    open message does not — beside the existing `settle` test, or as a direct `__startTrace` unit.
  - **Cites:** project rule (`rules/testing.md`, behaviour-change update-gate) · caught by test.

- **[HIGH]** `src/core/TraceNames.ts:26-28` vs
  `packages/babel-plugin-loxer-trace/src/marker-collection.ts:414-416` — pass 7 reported (and this
  file recorded one level lower) that nothing pins the two copies of the trailing-`Class` rule
  against each other. This pass is the evidence that the risk is not theoretical: the rule was just
  hand-edited into both files a second time, and the two edits agree only because they were copied
  carefully. Nothing would have failed had they drifted.
  - **Fix:** export a table of `{ input, expected }` pairs — at least `['Class','Class']`,
    `['OrderServiceClass','OrderService']`, `['ClassClass','Class']`, `['Order','Order']` — from a
    plain `.ts` module (not a `.test.ts` file, per `rules/testing.md`), import it into both suites,
    and assert both implementations agree on every row, the way
    `test/decorators.test.ts:224-226` already compares the legacy and standard decorator protocols.
  - **Cites:** project rule (both files' JSDoc asserting a safety net that does not exist) ·
    caught by test · escalates `review-7.md`'s third finding, which this pass justifies raising.

## Closed by this delta

- **The perf finding is closed.** `src/trace.ts`'s common path now does no parent work at all: with
  the default `'functionName'` style the first disjunct short-circuits and neither
  `sanitizeMessage(parentName)` nor `qualifiedFunctionName` runs. What remains is two `===`
  comparisons against string literals, against the regex-driven `sanitizeMessage` that was being
  paid unconditionally. Parity with `src/decorators/trace.ts:87-90` is complete — both sides now
  gate identically, and neither does more baseline work than the other. No new cost introduced.
- **The exact-`Class` defect is closed in behaviour.** Both copies were verified character-for-character
  equivalent across `'Class'`, `'MyClass'`, `'Classy'`, `'SubClassClass'` and `''`, and
  `classParentName` can no longer return `''` for any legal identifier.
- **The gate is behaviourally equivalent to what it replaced.** `parentQualifiedName` is read only
  inside the `'parent.functionName'` branches of `getOpenMessage`/`getCloseMessage`, so substituting
  `safeName` when the gate is false is unobservable, including for a mixed open/close pair — the
  close closure captures the value computed once at call start. `sanitizeMessage(parentName)` still
  runs on every path where the parent actually reaches output, so the sanitization property an
  earlier pass established is intact.
- **The `?? → ||` change is sound and now documented as an invariant.** `marker.className` is
  `string | undefined` and can only ever hold `undefined` or `classParentName`'s output, so the two
  operators differ solely on `''` — the case being targeted. After the guard, no valid source
  reaches it; the LOW both lenses raised (that a reader would hunt for a test that cannot exist) was
  addressed by stating the invariant in the function's comment rather than by a test for dead code.
  `transformStatementMarker`'s direct `fileName` pass-through is correctly left alone.

## Rule coverage gaps

New in this pass:

- No rule requires a new edge case in a helper that exists in two independently maintained copies to
  be added to both of its test homes at once — which is what let the exact-`Class` guard land
  untested in both copies simultaneously. — surfaced by test.
- No rule requires a change to a null-coalescing fallback in a `string`-typed field to establish
  whether the new branch is reachable, so that a genuinely unreachable one is documented rather than
  left looking untested. — surfaced by code.

Carried forward unchanged from pass 7: the read/serve symlink-exposure threat model, ownership of a
widened Vite dev-server setting, spec amendment when a later decision supersedes it, gating per-log
work behind the option that needs it, cold-versus-hot Vite hooks, the unenforced built-artifact rule,
and the two untested parent-resolution edges (computed member key, marked constructor).

## Still open from pass 7

Not re-reviewed in this pass and not addressed by the delta: the HIGH on `wantedFsAllow` widening a
user-set `server.fs.allow` (a decision on the plugin's public option surface), and the MEDIUMs on
`isInstalledPackagePath`'s segment match, the stale spec, the missing `missingFrom` self-dedupe
fixture, and the unenforced built-artifact rule — plus the LOW wording nit.
