# Review: PropsPrinter rework (pass 5)

**Verdict:** PASS
**Scope:** Complete working tree versus `HEAD` — PropsPrinter, Loxer logging and trace plumbing, related tests, documentation, playgrounds, demo, and generated TypeDoc output.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dependency audit skipped: no manifest or lockfile changed) · performance ✓ · a11y skipped (library/API and documentation change; no user-facing interaction change) · acceptance ✓ · test ✓

## Findings (by severity)

- **[MEDIUM]** `src/core/PropsPrinter.ts:263-320` — A finite public `box.depth` is honored literally and can be so large that the box-layout arrays exhaust memory or throw before rendering.
  - **Fix:** Clamp it to a documented practical maximum and add boundary coverage.
  - **Cites:** baseline (CODE_REVIEW.md §Correctness & logic) · caught by code-reviewer

- **[MEDIUM]** `src/core/PropsPrinter.ts:173-177,337-397,513-631` — `singleLine()` recursively traverses arbitrarily deep acyclic messages. Cycles are safe, but sufficiently deep data can consume substantial CPU or overflow the stack before degrading.
  - **Fix:** Use iterative traversal or define a documented safety-depth representation while preserving ordinary unlimited rendering.
  - **Cites:** baseline (PERFORMANCE_REVIEW.md §Algorithmic & memory) · project rule (AGENTS.md Behavior) · caught by perf-reviewer

- **[MEDIUM]** `documentation/index.md:760,808`; `documentation/props.md:295` — Callback examples use `lox.box.length` as the props connector depth, whereas the built-in output uses `BoxFactory.getMarkerDepth(lox.box)`; nested or overlapping boxes therefore cannot be reproduced by the documented recipe.
  - **Fix:** Use exported `BoxFactory` and pass `lox.module.slicedName.length + BoxFactory.getMarkerDepth(lox.box)` in each example.
  - **Cites:** spec acceptance criterion (callback reproduces built-in props block) · project rule (rules/documentation.md) · caught by acceptance-reviewer

- **[MEDIUM]** `rules/documentation.md:84`; `rules/testing.md:43-51`; root and nested `AGENTS.md` references — Steering documentation still describes the removed Item surface and its old rendering gate.
  - **Fix:** Update these rules to PropsPrinter, `printProps`, `test/props.test.ts`, and opt-in rendering semantics.
  - **Cites:** spec acceptance criterion (rename completeness) · project rule (rules/documentation.md) · caught by acceptance- and test-reviewers

- **[MEDIUM]** `test/props.test.ts:93` — The all-entry-point props test neither observes direct `Loxer.debug(...)` nor the hidden `box.debug(...)` call, leaving both debug dispatches without a regression assertion.
  - **Fix:** Use a module logging up to `debug` (or capture the output) and assert each call's multiple props.
  - **Cites:** spec acceptance criterion (props attached identically by every entry point) · project rule (rules/testing.md) · caught by test-reviewer

- **[MEDIUM]** `test/trace-cases.ts:267` — The traced failure-path test does not combine failure with `argsAsProps` and `printArgs`, so it does not prove capture/configuration survive that path.
  - **Fix:** Add a failing multi-argument trace case and assert the opening props/configuration, original error, and box closure.
  - **Cites:** spec acceptance criterion (failure path) · project rule (rules/testing.md) · caught by test-reviewer

- **[LOW]** `src/core/PropsPrinter.ts:173-177,337-397,513-631` — `singleLine()` builds both ANSI and plain renderings though it consumes only plain text.
  - **Fix:** Add a plain-only internal path or defer ANSI construction until colored output is requested.
  - **Cites:** baseline (PERFORMANCE_REVIEW.md §Algorithmic & memory) · caught by perf-reviewer

## Rule coverage gaps

- No project rule defines a preferred threshold for internal helper extraction or reuse — simplicity
- No project policy defines redaction/PII handling for values deliberately supplied as messages or props — security
- No project policy or performance budget defines safe rendering/resource limits for deep or wide values, or upper bounds for public layout depths — code, security, performance
- No documented acceptance-test checklist maps every public logging entry point to runtime and type-level coverage — acceptance

## Notes

- Current hostile-value fallbacks, control-character sanitization, trace print-option propagation, and hidden-single-log message gate are correct by inspection.
- The dependency audit was not applicable; no manifest or lockfile changed.
