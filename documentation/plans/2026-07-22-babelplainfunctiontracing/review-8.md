# Review: Trace API type consolidation

**Verdict:** PASS
**Scope:** Current tracing changes across the runtime and decorator APIs, Babel/Vite transforms, the
Vite demo, tests, authored guides, and generated API reference.
**Lenses run:** code âœ“ Â· security âœ“ (dependency audit skipped: no manifest or lockfile change) Â· perf
âœ“ Â· a11y âœ“ Â· acceptance âœ“ Â· test âœ“

## Findings (by severity)

- **[MEDIUM]** `documentation/specs/babel-plain-function-tracing.md:33`; `documentation/plans/2026-07-22-babelplainfunctiontracing/plan.md:50` â€” Both artifacts say plain-function tracing excludes `className.functionName`, while the shared interface, runtime, guide, and acceptance criterion now accept it as a function-name fallback.
  - **Fix:** State that decorated methods render `ClassName.methodName` and plain functions fall back to `functionName`.
  - **Cites:** `rules/documentation.md` authored-guide alignment â· spec acceptance criterion for `className.functionName` fallback â· caught by code and acceptance
- **[MEDIUM]** `documentation/index.md:98`; `src/tracing-types.ts:20` â€” Decorator examples immediately follow a plain-function marker example importing `trace` from `loxer/trace`. Copying the combined context calls the marker as a decorator instead of importing the decorator from `loxer`.
  - **Fix:** Make decorator examples self-contained with `import { trace } from 'loxer';`; keep `loxer/trace` only in plain-function marker examples.
  - **Cites:** `rules/documentation.md` authored examples must match the public API â· spec definition of done for documented public opt-in surfaces â· caught by acceptance

## Rule coverage gaps

- Sensitive-data redaction and output-injection handling for trace arguments, results, and custom formatter text â€” surfaced by security.
- Trace-volume limits, sampling, transform/runtime hot-path budgets, and async-performance expectations â€” surfaced by perf.
- Semantic UI, keyboard/focus, ARIA/live-region, contrast, and responsive-reflow standards for the Vite demo â€” surfaced by a11y.
- Public-runtime error/rejection conventions and import/naming conventions beyond the current ESM and formatting rules â€” surfaced by code.
- Acceptance-criterion-to-test traceability â€” surfaced by acceptance.

## Notes

- The reviewed removal of the old `LoxedOptions` type alias is intentional: the user explicitly directed removal of legacy marker terminology and later chose the unified `TraceOptions` name.
- No code, security, performance, accessibility, or test-coverage defects met the reporting threshold. Tests were not run by reviewers.
