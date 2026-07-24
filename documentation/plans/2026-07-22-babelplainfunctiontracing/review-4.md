# Review: Babel plain-function tracing remediation

**Verdict:** WARN
**Scope:** Full staged plain-function tracing feature and the current unstaged remediation across the runtime, Babel/Vite plugins, tests, documentation, and Vite playground.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: external audit service unavailable) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/plugin.ts:90` — The generated options binding remains in the temporal dead zone when a hoisted marked declaration is called before the marker. `const value = fn(); function fn() {}; loxed(fn, options)` enters the instrumented function before the generated `let` is initialized.
  - **Fix:** Use a hoisted generated `var` and let the runtime apply its existing default for `undefined`, or initialize the storage before every possible invocation. Add a call-before-declaration fixture.
  - **Cites:** `CODE_REVIEW.md` correctness/backward-compatibility checklist; `documentation/specs/babel-plain-function-tracing.md` callable-behavior criterion · caught by code, acceptance/test

- **[HIGH]** `src/trace.ts:23` — A native Promise can override its own `then` property. Although it passes `instanceof Promise`, `result.then(...)` can throw synchronously and replace the caller's original Promise return.
  - **Fix:** Attach with `Promise.prototype.then.call(result, onSuccess, onFailure)` inside a defensive boundary while returning the original Promise. Add a fixture with an overridden, throwing native-Promise `then`.
  - **Cites:** `CODE_REVIEW.md` error-handling/backward-compatibility checklist; `documentation/specs/babel-plain-function-tracing.md` Promise identity and callable-behavior criteria · caught by code, acceptance/test

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:110` — Arrow traces reconstruct arguments from parameter bindings rather than actual caller arguments: default values are reported as supplied values and destructured parameters become `undefined`. This makes `openMessage: 'args'` and `argsAsItem` inaccurate for documented arrow-function support.
  - **Fix:** Preserve actual caller arguments for supported arrow parameter patterns, or explicitly reject/document patterns that cannot be represented. Add defaulted and destructured-arrow fixtures.
  - **Cites:** `CODE_REVIEW.md` correctness checklist; `documentation/specs/babel-plain-function-tracing.md` option/message-item criteria; `documentation/index.md:88` · caught by code, acceptance/test

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/src/index.ts:23` — Global or sticky caller-supplied `include`/`exclude` regular expressions retain `lastIndex` across transforms, so matching modules can be intermittently skipped and retain their runtime marker.
  - **Fix:** Reset `lastIndex` before every regular-expression test, or reject stateful regular expressions; add a `g`-flag filter regression.
  - **Cites:** `CODE_REVIEW.md` correctness/configuration checklist · caught by code

- **[MEDIUM]** `test/plain-function-trace.test.ts:487` — The new level test exercises the runtime lifecycle directly, not a transformed direct chained `Loxer.m(...).l(3).log(...)` entry. It therefore does not prove that a hidden direct entry is omitted from callbacks/history while its box still closes normally.
  - **Fix:** Add a transformed fixture with a visible trace and hidden chained direct entry; assert omitted entry records and the subsequent visible close with the trace module.
  - **Cites:** `documentation/specs/babel-plain-function-tracing.md` direct modifier and hidden-normal-log criteria; `rules/testing.md` · caught by acceptance/test

## Rule coverage gaps

- Security: no documented policy for redaction/sensitive-data logging, secret management, or dependency vulnerability response — surfaced by security.
- Accessibility: no documented semantic UI, keyboard/focus, contrast, live-feedback, or responsive-reflow standards — surfaced by a11y.
- Runtime tracing overhead, trace-volume limits/sampling, and transform-time performance budgets remain undocumented — surfaced by perf.

## Notes

- Security and accessibility code review found no implementation findings after the review-3 remediation.
- Dependency audit was skipped because the external audit service was unavailable; all static lenses were read-only.
