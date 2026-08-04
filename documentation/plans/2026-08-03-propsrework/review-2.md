# Review: props rework (pass 2)

**Verdict:** WARN
**Scope:** combined working tree vs `HEAD` — 56 paths across the props/message renderer, logger visibility gate, trace runtimes and types, associated tests, guides, generated TypeDoc, playgrounds, and demo; includes the staged feature and unstaged pass-1 remediation.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit skipped — no manifest/lockfile change) · perf ✓ · a11y skipped (library change, no user-facing UI) · acceptance ✓ · test ✓

Continuation baseline and pre-review gates: `pnpm test` 19 files / 364 tests green; `pnpm lint`, `pnpm build`, `pnpm typecheck:test`, `pnpm typecheck:types`, and `git diff --check HEAD` all exit 0.

## Findings (by severity)

- **[HIGH]** `src/Helpers.ts:43`, `src/core/PropsPrinter.ts:365-371,456-491` — the pass-1 props sanitizer still has raw-control paths. A user-supplied `constructor.name` reaches class rendering unsanitized, and full-function rendering preserves terminal-active C0 characters other than ESC (including carriage return, backspace, and BEL). The props output path has no test covering string leaves, object keys, class names, symbols, or full functions with control characters.
  - **Fix:** Sanitize the resolved class name before interpolation; render functions through `Function.prototype.toString.call(value)`; escape every C0 control except deliberately preserved LF/TAB (normalizing CRLF and escaping standalone CR); and cover the rendered props path with crafted class/function names and control-character cases.
  - **Cites:** baseline `CODE_REVIEW.md` §Correctness & logic · baseline `SECURITY_REVIEW.md` §Injection/log injection · project rule `rules/testing.md` console-fallback requirement · caught by **code-reviewer**, **security-reviewer**, **test-reviewer**

- **[HIGH]** `src/trace.ts:198-225`, `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts` — the plain-function marker runtime still has no committed case for `printArgs` or `printResult`. The decorator suite covers the two sides, but regressions in `trace()` and its multi-target form can still pass unnoticed.
  - **Fix:** Add transformed-marker cases for `printArgs` alone, `printResult` alone, and `trace([first, second], { printArgs, printResult })`, including the enclosing-marker form, asserting opening/closing logs' `printProps` values.
  - **Cites:** project rule `AGENTS.md` Behavior (both sides of a two-option gate need tests) · project rule `rules/testing.md` · spec Tracing acceptance criterion · plan §Traces · caught by **acceptance-reviewer**, **test-reviewer**

- **[HIGH]** `src/core/PropsPrinter.ts:174-188,252-279,356-417` — hostile-value containment is only smoke-tested through first-argument message stringification. No current console-fallback prop test covers throwing getters/proxy traps/invalid dates, and no async traced-result integration test proves rendering cannot reject an otherwise resolved promise.
  - **Fix:** Exercise the no-callback `.pp()` path with null-prototype values, throwing getters, throwing proxy traps, and invalid dates, asserting a fallback and no throw; add an async `resultAsProps` + `printResult` integration case whose original promise still resolves.
  - **Cites:** project rule `src/core/AGENTS.md` arbitrary-runtime-value invariant · project rule `rules/testing.md` rich-rendering console-fallback requirement · caught by **test-reviewer**

- **[MEDIUM]** `src/core/PropsPrinter.ts:397-407` — `guarded()` removes its `_seen` marker only after `produce()` returns. If rendering throws after insertion, the marker remains and a later occurrence of the same non-cyclic value is mislabeled `[Circular]`.
  - **Fix:** Move `_seen.delete(value)` into a `finally` block.
  - **Cites:** baseline `CODE_REVIEW.md` §Correctness & logic (exception paths/shared mutable state) · caught by **code-reviewer**

- **[MEDIUM]** `src/tracing-types.ts:122-137` — `printArgs` / `printResult` remain type-legal without their matching capture flags, producing an empty render. Current callers all pair rendering and capture; the accepted but vacuous quadrant is not pinned.
  - **Fix:** Either make a print request imply capture, or preserve the deliberately independent controls with an explicit contract/test for the empty-render case.
  - **Cites:** baseline `SIMPLICITY_REVIEW.md` “Options nobody passes” · caught by **simplicity-reviewer**

- **[MEDIUM]** `src/Loxer.ts:45-60` — ordinary-message stringification reaches the generic sanitizer through the error-named `sanitizeErrorMessage` forwarding wrapper, adding a cross-domain hop with a misleading name.
  - **Fix:** Import `sanitizeControlCharacters` directly for ordinary messages and reserve `sanitizeErrorMessage` for error handling.
  - **Cites:** baseline `SIMPLICITY_REVIEW.md` “Indirection cost” / “Names that force you into the body” · caught by **simplicity-reviewer**

- **[MEDIUM]** `src/loxes/Lox.ts:33`, `src/tracing-types.ts:122-137` — props and opted-in trace arguments/results can retain credentials or PII in callbacks/history, with no documented warning or redaction/denylist path.
  - **Fix:** Document the exposure and safe projection/allowlist guidance in the Documentation phase; optionally design a masking hook as a separate product decision.
  - **Cites:** baseline `SECURITY_REVIEW.md` §Sensitive-data exposure · caught by **security-reviewer**

- **[MEDIUM]** Definition of done — verification evidence in the worklog predates pass-1 remediation; TypeDoc/built-tree/demo evidence has not been refreshed, and the consumer-app browser click-through remains explicitly unperformed.
  - **Fix:** After remediation settles, run and record the specified gates and built-tree/playground/Babel exercises, regenerate with `pnpm run docs`, and complete the demo browser confirmation.
  - **Cites:** spec Definition of Done · project rules `rules/coding-conventions.md`, `rules/testing.md`, `rules/documentation.md` · caught by **acceptance-reviewer**

- **[MEDIUM]** `src/core/PropsPrinter.ts:282-287` — multi-prop rendering joins the complete plain output once to measure it, discards that string, then maps and joins the values again, adding an avoidable allocation proportional to the rendered block.
  - **Fix:** Compute prospective length from the individual string lengths and separators, then join colored and plain values once each.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · caught by **perf-reviewer**

- **[MEDIUM]** `src/Loxer.ts:275,435-441` — the new visibility precheck is not pinned with a hostile/counting message. Existing hidden-log tests prove absence from output/history, not that direct and leveled `.of(id)` hidden messages are never inspected.
  - **Fix:** Cover hidden direct and leveled box-member logs with a throwing/counting proxy plus a visible control case.
  - **Cites:** project rule `AGENTS.md` Behavior (gate optional work) · project rule `rules/testing.md` · caught by **test-reviewer**

- **[LOW]** `src/core/PropsPrinter.ts:173-177` — `singleLine()` still builds colored and plain recursive output while only the plain half can reach `lox.message`; the new hidden-log gate removes the cost only for discarded logs.
  - **Fix:** Add a plain-only rendering mode or defer ANSI formatting until `print()` needs it.
  - **Cites:** project rule `AGENTS.md` Behavior · baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · caught by **perf-reviewer**

## Rule coverage gaps

- No documented rule for terminal-control sanitization choke points or exception-safe traversal of hostile object graphs — surfaced by **code-reviewer**, **security-reviewer**, **test-reviewer**.
- No documented sensitive-data policy for props, trace arguments/results, callbacks, or history retention — surfaced by **security-reviewer**.
- No project rule addresses dependent public options whose legal combinations are functionally vacuous — surfaced by **simplicity-reviewer**.
- No project rule addresses cross-domain forwarding helpers or an indirection budget — surfaced by **simplicity-reviewer**.
- `documentation/Performance.md` has no benchmark methodology for non-primitive messages, multi-prop rendering, or trace rendering — surfaced by **perf-reviewer**.
- `rules/testing.md` still names the removed `Item` / `prettify` / `test/item.test.ts` surface, and no use-case-to-test coverage map exists — surfaced by **test-reviewer**.

## Checked and explicitly not re-flagged

- The null-prototype constructor crash and top-level hostile getter/date message throws are contained by guarded rendering fallbacks.
- Initialized hidden single/add logs gate object stringification through the same module visibility calculation used by output.
- The duplicated trace rendering-option gate now has one shared implementation, and control-character regexes are module-scoped.
- The pass-1 `for`-loop test-rule violations are fixed.
- Intentional unreleased-3.0 public breaks remain aligned with the spec.
