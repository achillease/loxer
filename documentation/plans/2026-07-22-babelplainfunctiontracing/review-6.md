# Review: Babel plain-function tracing final remediation pass

**Verdict:** WARN
**Scope:** Full staged plain-function tracing feature and all current remediations across runtime tracing, transforms, tests, documentation, and the Vite playground.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: external audit service unavailable) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/core/Error.ts:42` — `error instanceof Error` is unguarded. A valid thrown Proxy with a throwing `getPrototypeOf` trap makes failure logging throw and replace the caller-visible original before the trace box closes.
  - **Fix:** Guard Error recognition itself and fall back to safe stringification when the check fails. Add a hostile-Proxy fixture that asserts original-value preservation and the failure close.
  - **Cites:** `CODE_REVIEW.md` error-handling/backward-compatibility checklist; `documentation/specs/babel-plain-function-tracing.md` uncaught-failure/callable-behavior criteria · caught by code, acceptance/test

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:30` — Generated code resolves `Array` and `Object` through consumer lexical scope. Valid user bindings can shadow them, breaking generated `Array.from(arguments)` or arrow arity restoration and changing valid function behavior.
  - **Fix:** Generate `[...arguments]` instead of `Array.from(arguments)` and move arity restoration into an imported runtime helper. Add `Array`- and `Object`-shadowing fixtures.
  - **Cites:** `CODE_REVIEW.md` correctness/backward-compatibility checklist; `documentation/specs/babel-plain-function-tracing.md` callable-behavior criterion · caught by code, acceptance/test

## Rule coverage gaps

- Security: no documented policy for redaction/sensitive-data logging, secret management, or dependency vulnerability response — surfaced by security.
- Accessibility: no documented semantic UI, keyboard/focus, contrast, live-feedback, or responsive-reflow standards — surfaced by a11y.
- Runtime tracing overhead, trace-volume limits/sampling, and transform-time performance budgets remain undocumented — surfaced by perf.

## Notes

- `review-5` arrow argument-capture and formatter-sanitization remediations were found effective.
- No accessibility finding met the confidence threshold. The dependency audit remains unavailable; static review was read-only.
