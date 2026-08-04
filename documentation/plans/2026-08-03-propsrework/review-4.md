# Review: props rework (pass 4)

**Verdict:** WARN
**Scope:** combined working tree vs `HEAD`, including the complete props rework and all three fix passes across runtime, tests, documentation, generated TypeDoc, playgrounds, and demo.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit skipped — no manifest/lockfile change) · perf ✓ · a11y skipped (library change, no user-facing UI) · acceptance ✓ · test ✓

Pre-review gates after the final fix pass: `pnpm lint`, `pnpm build`, `pnpm test` (19 files / 364 tests), `pnpm typecheck:test`, `pnpm typecheck:types`, and `git diff --check HEAD` all green.

## Findings (by severity)

- **[HIGH]** `src/trace.ts:198-228`, `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts` — plain-function marker rendering still has no behavioral coverage for `printArgs` or `printResult`. Direct, enclosing, and multi-target marker regressions remain invisible to the decorator-only rows.
  - **Fix:** Add transformed-marker cases for `printArgs` alone, `printResult` alone, shared multi-target options, and the enclosing form, asserting opening/closing `printProps`.
  - **Cites:** project rule `AGENTS.md` Behavior · project rule `rules/testing.md` · spec Tracing acceptance criterion · caught by **acceptance-reviewer**, **test-reviewer**

- **[HIGH]** `src/core/PropsPrinter.ts:174-188,252-279,356-421`, `test/props.test.ts:292-314`, `test/decorators.test.ts:197-245` — hostile runtime values are covered as first-argument messages only, not through the no-callback `.pp()` renderer; no async `resultAsProps` + `printResult` case proves a hostile resolved value cannot turn a fulfilled promise into a rejection.
  - **Fix:** Render null-prototype values, throwing getters/proxies, and invalid dates through the console fallback and assert the fallback/no throw; add an async traced-result rendering case that remains fulfilled.
  - **Cites:** project rule `src/core/AGENTS.md` arbitrary-runtime-value invariant · project rule `rules/testing.md` console-fallback requirement · spec Definition of Done · caught by **acceptance-reviewer**, **test-reviewer**

- **[HIGH]** `test/props.test.ts:276-314,366-399` — the rendered-props sanitizer boundary remains untested. There is no regression matrix for string/key/symbol/class/function/date controls, overridden stringifiers, intrinsic Date/function behavior, invalid-date fallback, or intentional LF/TAB preservation.
  - **Fix:** Add no-callback `.pp()` cases asserting terminal controls are escaped at each data-to-text boundary, overridden function/Date methods are ignored, and deliberate function layout survives.
  - **Cites:** project rules `src/core/AGENTS.md`, `rules/testing.md` · caught by **test-reviewer**

- **[MEDIUM]** `src/core/PropsPrinter.ts:264-270,312-320` — `box.depth` normalization handles negative, fractional, `NaN`, and infinite values but leaves arbitrarily large finite integers unbounded before `new Array(depth)`, allowing `RangeError` or excessive allocation.
  - **Fix:** Clamp or reject values above an explicit practical maximum and cover both layout branches at the boundary.
  - **Cites:** baseline `CODE_REVIEW.md` §Correctness & logic · baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · caught by **code-reviewer**, **perf-reviewer**

- **[MEDIUM]** `src/core/PropsPrinter.ts:173-177,337-397,513-631` — automatic single-line rendering recursively walks visible non-primitive messages without a stack-safe traversal or safety depth. A deeply nested acyclic value can exhaust the stack and degrade the whole message to `[unreadable]` after substantial work.
  - **Fix:** Use an iterative traversal while preserving the settled no-truncation contract, or make a documented safety-depth marker a product decision.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · project rule `src/core/AGENTS.md` arbitrary-runtime-value invariant · caught by **perf-reviewer**

- **[MEDIUM]** `test/boxed.test.ts:347,364` — hidden-log tests prove output/history absence but not that hidden direct and leveled `.of(id)` object messages are never inspected.
  - **Fix:** Add throwing/counting proxy cases for both hidden paths and a visible control.
  - **Cites:** project rule `AGENTS.md` Behavior · project rule `rules/testing.md` · caught by **test-reviewer**

- **[MEDIUM]** Definition of done — current runtime gates are green, but post-fix built-tree/playground/Babel/TypeDoc/demo evidence is not recorded and the consumer-app browser click-through remains unperformed.
  - **Fix:** Complete those verification steps in the appropriate Testing/Documentation phases.
  - **Cites:** spec Definition of Done · project verification rules · caught by **acceptance-reviewer**

- **[LOW]** `src/core/PropsPrinter.ts:173-177` — visible non-primitive messages still construct colored and plain recursive forms although `singleLine()` consumes only the plain half.
  - **Fix:** Add a plain-only internal mode or construct ANSI forms lazily.
  - **Cites:** project rule `AGENTS.md` Behavior · baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · caught by **perf-reviewer**

## Rule coverage gaps

- No enforceable project rule enumerates terminal-control sanitization sinks or exception-safe hostile-object traversal.
- No project rule sets safe upper bounds for exported numeric rendering/layout options.
- No coverage matrix distinguishes decorator, direct marker, enclosing marker, and multi-target marker runtimes.
- `rules/testing.md` and nested steering docs retain stale `Item` / `prettify` / old-path guidance.
- `documentation/Performance.md` has no methodology or budget for non-primitive/deep message traversal or props rendering.
- No project rule defines an abstraction/indirection budget or intentionally vacuous dependent-option combinations.

## Checked and explicitly not re-flagged

- Code, simplicity, and security lenses found no gating runtime defect after the final Date/depth fixes.
- Intrinsic sanitized Date/function rendering, hostile-object fallbacks, cycle cleanup, message visibility gating, and shared trace option resolution are correct by inspection.
- The sensitive-data risk is mitigated by the existing user-facing warning; no source secret was introduced.
- Intentional unreleased-3.0 API breaks remain aligned with the spec.
