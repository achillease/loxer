# Review: Babel plain-function tracing

**Verdict:** WARN
**Scope:** Runtime tracing API, Babel and Vite companion packages, workspace/package configuration, Vite trace demo, authored documentation, and trace/Vite integration coverage.
**Lenses run:** code ✓ · security ✓ (dependency audit unavailable) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/plugin.ts:85` — Generated trace options remain at the marker statement, so an otherwise valid hoisted function declaration can run before the generated `const` is initialized and fail with a temporal-dead-zone error.
  - **Fix:** Emit the generated options binding before its traced declaration, or otherwise initialize it before any possible invocation; add a fixture that invokes the declaration before its marker.
  - **Cites:** `CODE_REVIEW.md` correctness/backward-compatibility checklist · spec callable-behavior criterion · caught by code quality & compatibility

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:165` — The non-`async` wrapper reads every return value's `then` property. An object with a throwing/accessor `then` therefore becomes a trace failure even though the original function would return it unchanged.
  - **Fix:** Probe `then` defensively; when observation throws, treat the value as synchronous, close successfully, and return the original object. Add a throwing-getter fixture.
  - **Cites:** `CODE_REVIEW.md` correctness/backward-compatibility checklist · spec callable-behavior criterion · caught by code quality & compatibility

- **[MEDIUM]** `src/trace.ts:81` — Built-in `openMessage: 'args'` joins untrusted argument strings directly into a message, allowing newline or terminal-control log injection into console output or callbacks.
  - **Fix:** Escape C0/ANSI control characters or use a safe serialized representation for built-in argument messages; keep raw item forwarding an explicit opt-in.
  - **Cites:** `SECURITY_REVIEW.md` log-injection checklist · caught by security

- **[MEDIUM]** `documentation/index.md:88` — The guide says argument/result message modes send values “unchanged” to callbacks, but those modes produce formatted strings. Only `argsAsItem` and `resultAsItem` preserve raw callback items.
  - **Fix:** Distinguish message formatting from raw item capture while retaining the sensitive-data warning for both.
  - **Cites:** `rules/documentation.md` authored-guide accuracy rule · `src/trace.ts` message formatting · caught by code quality & compatibility

- **[MEDIUM]** `examples/vite-trace-demo/src/style.css:103` — Default primary and secondary action controls have visible boundaries below the 3:1 UI-component contrast threshold against the page background.
  - **Fix:** Adjust their default border or fill colors to reach 3:1 while retaining the existing focus styling.
  - **Cites:** `A11Y_REVIEW.md` colour and visual checks · caught by accessibility

- **[MEDIUM]** `examples/vite-trace-demo/src/style.css:247` — The empty-state text color is approximately 4.37:1 against its card background, below the 4.5:1 normal-text threshold.
  - **Fix:** Lighten the empty-state text color enough to reach at least 4.5:1 against the composited background.
  - **Cites:** `A11Y_REVIEW.md` colour and visual checks · caught by accessibility

- **[MEDIUM]** `test/plain-function-trace.test.ts:191` — The nested/overlapping test proves boxes open and close but not that each `parent:*` and `child:*` direct record carries its owning invocation ID.
  - **Fix:** Index opening records by invocation and assert every parent/child direct record has its exact opening ID across concurrent executions.
  - **Cites:** spec nested-instrumented-functions and direct-entry criteria · definition-of-done coverage · caught by test quality & freshness, acceptance / definition-of-done

- **[MEDIUM]** `test/plain-function-trace.test.ts:226` — Independent `LoxedOptions` runtime coverage omits `types`, `prettyResult`, and successful custom formatters, including a non-string formatter result fallback.
  - **Fix:** Add table-driven runtime or transformed-function cases for the missing modes and their fallback behavior.
  - **Cites:** spec `LoxedOptions` criterion · plan verification requirement for every supported message/item mode · caught by test quality & freshness

- **[MEDIUM]** `documentation/index.md:57` — Direct Babel-plugin setup does not state that consumers must retain their normal Babel source-map setting, despite the source-map acceptance criterion.
  - **Fix:** Add a short note that the plugin preserves Babel-generated mappings and consumers should enable the source-map option appropriate to their build.
  - **Cites:** spec source-map/documented-order criterion · caught by acceptance / definition-of-done

## Rule coverage gaps

- Sensitive-data/redaction, secret management, and vulnerability-response/audit policy are undocumented; the dependency audit was unavailable because external audit-service access was not approved — surfaced by security.
- Runtime tracing overhead, trace-volume limits/sampling, callback retention, and transform-time budgets have no project guidance — surfaced by performance.
- Accessibility rules for semantic structure, keyboard/focus behavior, live feedback, color contrast, and responsive reflow are undocumented — surfaced by accessibility.
- Companion-package compatibility, generated-code semantic preservation, source-map/plugin ordering, and fixtures for hoisting/thenable edge cases have no project-specific review guidance — surfaced by code quality & compatibility.
- Optional build-tool, Vite source-map, and consumer declaration testing expectations are not documented — surfaced by test quality & freshness.
