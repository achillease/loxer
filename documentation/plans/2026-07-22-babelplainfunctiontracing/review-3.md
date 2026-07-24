# Review: Babel plain-function tracing

**Verdict:** WARN
**Scope:** Runtime tracing API, Babel and Vite companion packages, workspace/package configuration, Vite trace demo, authored documentation, review history, and trace/Vite integration coverage.
**Lenses run:** code ✓ · security ✓ (dependency audit unavailable) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:73` — The variable-binding transform replaces a function expression or arrow function with a rest-argument wrapper. This changes observable callable semantics: `.length` becomes `0`, and a named function expression returning its own name returns the hidden clone rather than the exported wrapper.
  - **Fix:** Instrument the original function body while preserving its parameter list, function identity, and named self binding; add function-expression and arrow fixtures for `.length` and `fn() === fn`.
  - **Cites:** `CODE_REVIEW.md` backward-compatibility checklist · spec callable-behavior/parameter-preservation criterion · caught by code quality & compatibility, acceptance / definition-of-done

- **[HIGH]** `src/trace.ts:90` — A thrown or rejected value outside Loxer’s narrow `ErrorType` can cause failure logging itself to throw (for example `undefined` or a circular object), preventing the generated catch from preserving the original value.
  - **Fix:** Make error normalization or the trace failure-record path non-throwing for every JavaScript throw value, then add sync and async identity-preservation cases for `undefined` and circular values.
  - **Cites:** `CODE_REVIEW.md` error-handling checklist · spec uncaught-failure/callable-behavior criteria · `rules/testing.md` · caught by code quality & compatibility

- **[MEDIUM]** `src/trace.ts:90` — Automatic failure records still pass arbitrary error messages to Loxer without escaping control characters, allowing terminal-control log injection from untrusted error content.
  - **Fix:** Normalize control characters at the output boundary, or use a logging-only sanitized error representation while preserving the caller’s original thrown value.
  - **Cites:** `SECURITY_REVIEW.md` log-injection and sensitive-data exposure checks · caught by security

- **[MEDIUM]** `src/trace.ts:37` — Observing every custom thenable invokes its `then` method even when the caller never consumes the returned value; thenables that start work per call can run twice when the caller also awaits them.
  - **Fix:** Limit identity-preserving observation to native Promises, or document and specially handle custom thenables without invoking their `then` method twice; add a work-start-count fixture.
  - **Cites:** `PERFORMANCE_REVIEW.md` redundant-work check · caught by performance

- **[MEDIUM]** `examples/vite-trace-demo/src/style.css:220` — Non-wrapping trace metadata is clipped on small screens or at 200% zoom because the output card hides overflow.
  - **Fix:** Allow metadata wrapping with `overflow-wrap: anywhere` while keeping box-glyph alignment independent.
  - **Cites:** `A11Y_REVIEW.md` reflow without content loss check · caught by accessibility

- **[MEDIUM]** `test/plain-function-trace.test.ts:58` — The suite does not prove `LoxedOptions.level` or a hidden direct linked entry’s level/module/history behavior.
  - **Fix:** Add a transformed trace with a trace level and a direct `.m(...).l(3).log(...)`, asserting level/module, hidden-entry omission, and the later close.
  - **Cites:** spec level, modifier, and hidden-normal-log criteria · plan hidden-level verification · caught by test quality & freshness

- **[MEDIUM]** `documentation/index.md:61` — The direct Babel example lacks the TypeScript parser/preset prerequisite and does not state transform ordering, so copied TypeScript configuration is incomplete.
  - **Fix:** Show `@babel/preset-typescript`, or state that the plugin augments an existing TypeScript Babel configuration, and document its ordering.
  - **Cites:** spec Babel-capable TypeScript setup/order criterion · caught by acceptance / definition-of-done

## Rule coverage gaps

- Sensitive-data/redaction, secret-management, and dependency-audit/vulnerability-response policy are undocumented; the dependency audit was unavailable because external audit-service access was not approved — surfaced by security.
- Runtime tracing overhead, trace-volume limits/sampling, callback retention, transform-time budgets, and custom-thenable policy have no project guidance — surfaced by performance.
- Semantic UI structure, keyboard/focus behavior, live feedback, contrast, and responsive reflow expectations are undocumented — surfaced by accessibility.
- Generated-function reflection/identity, arbitrary throw values, source-transform semantic preservation, and companion-package compatibility lack project-specific review rules — surfaced by code quality & compatibility.
- Optional build-tool, Vite source-map, hidden-level, and consumer declaration testing expectations are not documented — surfaced by test quality & freshness.
