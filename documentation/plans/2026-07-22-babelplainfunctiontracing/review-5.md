# Review: Babel plain-function tracing post-review-4 remediation

**Verdict:** WARN
**Scope:** Full staged plain-function tracing feature and all current remediations across runtime tracing, transforms, tests, documentation, and the Vite playground.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: external audit service unavailable) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/Loxer.ts:172` — Trace failure logging can still mask the original thrown value when an `Error` has a throwing `name` or `message` accessor. `isError(error)` reads those properties without a defensive boundary, so the generated catch can throw from `trace.failure` before closing the trace box.
  - **Fix:** Make error recognition and error-message extraction non-throwing with a stable fallback; add a transformed hostile-Error fixture that asserts original-value preservation and the failure close.
  - **Cites:** `documentation/specs/babel-plain-function-tracing.md` uncaught-failure/callable-behavior criteria · caught by acceptance/test

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:121` — Supported arrows still derive trace arguments from parameter bindings. Omitted parameters therefore become synthetic trailing `undefined` entries, so `openMessage: 'args'` and `argsAsItem` do not represent the caller's actual argument list.
  - **Fix:** Use a forwarding wrapper that receives the actual arguments while preserving callable reflection, or reject arrow argument/item capture. Add zero-, partial-, and explicit-`undefined` fixtures.
  - **Cites:** `CODE_REVIEW.md` correctness checklist; `documentation/specs/babel-plain-function-tracing.md` message/item option parity · caught by code, acceptance/test

- **[MEDIUM]** `src/trace.ts:147` — Custom `openMessage` and `closeMessage` formatters return raw strings, allowing untrusted values to inject terminal-control characters into automatic trace records. Built-in argument formatting is escaped, but formatter modes bypass it.
  - **Fix:** Escape accepted formatter output before logging while retaining the intentional newlines of built-in `prettyResult`; add formatter control-character coverage.
  - **Cites:** `SECURITY_REVIEW.md` log-injection check · caught by security

## Rule coverage gaps

- Security: no documented policy for redaction/sensitive-data logging, secret management, or dependency vulnerability response — surfaced by security.
- Accessibility: no documented semantic UI, keyboard/focus, contrast, live-feedback, or responsive-reflow standards — surfaced by a11y.
- Runtime tracing overhead, trace-volume limits/sampling, and transform-time performance budgets remain undocumented — surfaced by perf.

## Notes

- `review-4` HIGH findings and its Vite/filter and hidden-entry coverage gaps are addressed.
- No accessibility finding met the confidence threshold. The dependency audit remains unavailable; static review was read-only.
