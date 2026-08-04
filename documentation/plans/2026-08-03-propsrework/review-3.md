# Review: props rework (pass 3)

**Verdict:** WARN
**Scope:** combined working tree vs `HEAD`, including the props rework and pass-1/pass-2 remediation across runtime, tests, documentation, generated TypeDoc, playgrounds, and demo.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit skipped — no manifest/lockfile change) · perf ✓ · a11y skipped (library change, no user-facing UI) · acceptance ✓ · test ✓

Pre-review gates after pass-2 fixes: `pnpm lint`, `pnpm build`, `pnpm test` (19 files / 364 tests), `pnpm typecheck:test`, `pnpm typecheck:types`, and `git diff --check HEAD` all green.

## Findings (by severity)

- **[HIGH]** `src/core/PropsPrinter.ts:470-473` and rendered-props sanitizer coverage in `test/props.test.ts` — `printDate()` invokes an instance-overridable `toISOString()` and emits its result unsanitized, so a crafted `Date` can still inject terminal controls. More broadly, the repaired props sanitizer has no console-rendering regression coverage for string/key/symbol/class/function/date boundaries.
  - **Fix:** Use `Date.prototype.toISOString.call(value)` inside the existing guard and sanitize its result; cover rendered control characters, crafted names, intrinsic function/date handling, and preserved LF/TAB layout through the no-callback `.pp()` path.
  - **Cites:** baseline `SECURITY_REVIEW.md` §Injection/log injection · project rules `src/core/AGENTS.md`, `rules/testing.md` · caught by **security-reviewer**, **test-reviewer**

- **[HIGH]** `src/trace.ts:198-228`, `test/plain-function-trace-core.test.ts:752-785`, `test/plain-function-trace-enclosing.test.ts:953-990` — the plain-function marker runtime still has no behavioral coverage for `printArgs` or `printResult`; decorator tests cannot detect regressions in direct, enclosing, or multi-target marker forms.
  - **Fix:** Add transformed-marker cases for `printArgs` alone, `printResult` alone, shared options on `trace([first, second], ...)`, and the enclosing form, asserting opening/closing `printProps`.
  - **Cites:** project rule `AGENTS.md` Behavior · project rule `rules/testing.md` · spec Tracing acceptance criterion · caught by **acceptance-reviewer**, **test-reviewer**

- **[HIGH]** `src/core/PropsPrinter.ts:174-188,252-279,356-417`, `test/props.test.ts:292-314`, `test/decorators.test.ts:197-245` — hostile-value containment remains tested only through first-argument message stringification. No console `.pp()` case covers null-prototype values, throwing getters/proxy traps, or invalid dates, and no async `resultAsProps` + `printResult` case proves a resolved promise stays resolved.
  - **Fix:** Exercise those hostile values through the no-callback prop renderer and add an async traced-result rendering case asserting successful resolution and fallback output.
  - **Cites:** project rule `src/core/AGENTS.md` arbitrary-runtime-value invariant · project rule `rules/testing.md` console-fallback requirement · spec Definition of Done · caught by **acceptance-reviewer**, **test-reviewer**

- **[MEDIUM]** `src/core/PropsPrinter.ts:264,298-320` — public `box.depth` accepts any number, but array construction uses it without normalizing negative, fractional, infinite, or `NaN` inputs; valid JavaScript calls can therefore throw `RangeError` from rendering.
  - **Fix:** Normalize `box.depth` once to a finite, non-negative integer before either layout branch.
  - **Cites:** baseline `CODE_REVIEW.md` §Correctness & logic (boundary handling) · caught by **code-reviewer**

- **[MEDIUM]** `test/boxed.test.ts:347,364` — visibility tests prove output/history absence but do not pin that hidden direct and leveled `.of(id)` object messages are never inspected before discard.
  - **Fix:** Add hidden direct and hidden box-member cases using a throwing/counting proxy, plus a visible control.
  - **Cites:** project rule `AGENTS.md` Behavior · project rule `rules/testing.md` · caught by **test-reviewer**

- **[MEDIUM]** Definition of done — the latest recorded verification predates the newest runtime edits, and the consumer-app browser confirmation remains unperformed.
  - **Fix:** After remediation, rerun the required gates and built-tree/playground/Babel exercises and complete the demo browser confirmation.
  - **Cites:** spec Definition of Done · project verification rules · caught by **acceptance-reviewer**

- **[LOW]** `src/core/PropsPrinter.ts:173-177` — visible non-primitive messages still build colored and plain recursive forms in `singleLine()` although only plain output is consumed.
  - **Fix:** Add a plain-only mode or defer ANSI construction until colored `print()` output is requested.
  - **Cites:** project rule `AGENTS.md` Behavior · baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory · caught by **perf-reviewer**

## Rule coverage gaps

- No enforceable rule defines terminal-control sanitization sinks or exception-safe hostile-object traversal.
- No project convention defines validation/normalization for exported numeric rendering options.
- No test coverage matrix distinguishes decorator, direct marker, enclosing marker, and multi-target marker runtimes.
- `rules/testing.md` / `src/core/AGENTS.md` retain stale `Item` / `prettify` / `test/item.test.ts` terminology.
- `documentation/Performance.md` lacks methodology for non-primitive messages, multi-prop rendering, and trace rendering.
- No general rule sets an indirection/abstraction budget or governs deliberately vacuous dependent-option combinations.

## Checked and explicitly not re-flagged

- Pass-2 class/function/string/key/symbol control handling, CRLF normalization, intrinsic function stringification, exception-safe cycle cleanup, direct ordinary-message sanitizer use, and multi-prop length calculation are correct by inspection.
- The independent capture/render controls are a settled specification decision.
- The sensitive-data risk is already mitigated by the user-facing warning in `documentation/index.md`.
- Intentional unreleased-3.0 API breaks remain aligned with the spec.
