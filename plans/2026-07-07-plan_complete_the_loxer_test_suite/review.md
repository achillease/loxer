# Review: Complete the Loxer test suite (+ Item.ts RangeError clamp fix)

**Verdict:** WARN
**Scope:** `src/core/Item.ts` (`getItemBox` clamp bugfix); test rewrites in `test/item.test.ts`, `test/error.test.ts`, `test/decorators.test.ts`, `test/unboxed.test.ts`, `test/boxed.test.ts`, `test/initialization.test.ts`, `test/format.test.ts`
**Lenses run:** code ✓ · security (skipped: no manifest/lockfile change, no security surface in a terminal logging lib) · perf (skipped: only a one-line clamp on an existing render path) · a11y (skipped: no user-facing UI) · acceptance (skipped: no `docs/specs/` and none warranted for a test/bugfix task) · test ✓

## Findings (by severity)

- **[HIGH]** `test/item.test.ts:144-152` — The circular-reference test only exercises `{ depth: 2 }`, which artificially bounds recursion and never hits the real default path (`Loxer.log(msg, cyclicObject)` with no `itemOptions`). `Item._depth` defaults to `0`, so the depth guard (`if (this._depth > 0 && depth >= this._depth)`) never fires — a genuinely self-referencing object logged without an explicit `depth` still throws `RangeError: Maximum call stack size exceeded` today. The suite reads as "circular refs are handled" when the untested default path still crashes. The plan named this exact scenario as a risk to lock in ("assert the intended contract (bounded output vs. throw)... if it stack-overflows, that is a product bug to surface, not to paper over").
  - **Fix:** Add a test calling `render(cyclic)` with **no** `depth` option and assert the actual current contract (today: it throws) — either as a locked-in-behavior test (mirroring the falsy-item `NOTE` pattern) or, per the plan, surface the stack-overflow as a fix proposal instead of only testing the artificially-bounded case.
  - **Cites:** `docs/plans/2026-07-07-plan_complete_the_loxer_test_suite/plan.md:69-72`; `src/core/AGENTS.md` (Invariants — `Item` recursion note) · caught by test-reviewer

- **[MEDIUM]** `test/decorators.test.ts` (missing combination) — `@trace`'s `closeMessage: 'result' | 'prettyResult' | <callback>` on an **async** method computes the message from the still-pending `Promise` returned by `original.call(...)` (`src/decorators/trace.ts:104-107`), not the resolved payload — an async method returning `6` with `closeMessage: 'result'` emits `'... returns: {}'`. The rewritten async tests only use the default close message, so this real defect ships uncaught, in exactly the decorator-message-formatting area the rewrite was meant to guard.
  - **Fix:** Add an async test combining `closeMessage: 'result'` (or a custom callback) with a non-trivial return value and assert the message reflects the resolved payload, not `{}`/`[object Promise]`. (Underlying behavior may be a product defect — surface it, don't paper over it.)
  - **Cites:** `src/decorators/trace.ts:104-119`; inline test-smell checklist (missing edge/error coverage) · caught by test-reviewer

- **[MEDIUM]** `test/item.test.ts:144-152` — The plan asked for a cyclic **object** test "(and an array cycle)"; only the object case exists.
  - **Fix:** Add `const arr: any[] = []; arr.push(arr);` and assert the same bounded/throw contract for arrays as decided for objects.
  - **Cites:** `docs/plans/2026-07-07-plan_complete_the_loxer_test_suite/plan.md:69` · caught by test-reviewer

- **[MEDIUM]** `test/initialization.test.ts:189-195` — The `'OutputStreams'` test's assertion `outputs.some((o) => o.includes('error'))` doesn't verify what its comment claims ("the error's message and stack were rendered"). Because `el.message === 'error'` / `el2.message === 'error2'` are logged regardless of whether the stack-inclusion branch (`errorLox.highlighted && errorLox.error.stack`, `OutputStreams.ts:61`) works, the assertion passes even if stack rendering is completely broken.
  - **Fix:** Assert a stack-specific substring restricted to the highlighted call, e.g. `expect(outputs.some((o) => o.includes('errorText2'))).toBe(true)` (only `el2`, `highlighted: true`, has its stack concatenated).
  - **Cites:** inline test-smell checklist — "assertions that would pass even if the product regressed" · caught by test-reviewer

## Verified positives (not findings, recorded for confidence)
- `src/core/Item.ts` clamp is correct for all real `depth` values: for `depth >= 1` it is byte-identical to the pre-fix output; for `depth === 0` (NONE module) it yields an empty run instead of throwing `RangeError`. No other unclamped `Array(...)` in the file shares the latent bug. Semicolons/quotes/printWidth/no-shadow/strict-null all clean; `src/index.ts` export surface untouched (private method).
- The `Item.ts` RangeError fix **is** genuinely guarded: `test/item.test.ts:154-165` exercises the exact `Math.max(0, depth-1)` path and would fail without the fix.
- The `expect(true).toBeTruthy()` tautologies and dead `afterAll(){ OutputStreams; }` bodies are gone; `item`/`error`/`decorators` suites now have `resetLoxer()`/`beforeEach` init + prod-empty `afterAll` guards (decorators had none before). `boxed`'s hidden-logs-excluded-from-history and `unboxed`'s newest-first / one-shot-modifier-reset / `devLevel:0` tests correctly lock in the `AGENTS.md` invariants.
- The unfixed falsy-item bug (`OutputStreams.ts:105` truthiness gate) is correctly locked in with an explicit `NOTE` comment (`test/item.test.ts:75-82`) rather than silently passing — the right pattern.

## Rule coverage gaps
- none — the project documents no `FEATURES.md` / use-case↔test link convention, so there is nothing for the changed test surface to be stale against.
