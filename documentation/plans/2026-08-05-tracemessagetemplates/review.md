# Review: Trace message templates and colored call payloads

**Verdict:** WARN
**Scope:** Staged trace rendering, message spans, public types, transform/demo, and related tests
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit: no manifest or lockfile diff) · perf skipped: no new data-access, algorithmic, or rendering hot path · a11y skipped: no user-facing UI behavior · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/core/TraceMessage.ts:206` — The omitted `openMessage` defaults to `'parent.fn'`, while the specification says the default is `'fn'`; the staged shared test table encodes the former behavior.
  - **Fix:** Resolve the contract conflict, then make the implementation and all default-message expectations agree with the selected contract.
  - **Cites:** specification acceptance criterion “`'fn'` remains the default for both options” · CODE_REVIEW.md correctness · caught by code and acceptance
- **[HIGH]** `documentation/index.md:38` — The authored tracing guide still documents removed literals and callback signatures; the staged change contains no guide or generated TypeDoc update.
  - **Fix:** Update the tracing guide, regenerate TypeDoc with `pnpm run docs`, and stage the generated output.
  - **Cites:** specification Definition of Done · caught by acceptance
- **[HIGH]** `src/core/TraceMessage.ts:35` — A public `Symbol.for` carrier brand can be forged, allowing unsanitized carrier text or malformed spans through the logger funnel.
  - **Fix:** Defensively sanitize carrier text and validate/copy ordered spans before using them, or use a realm-shared identity registry.
  - **Cites:** SECURITY_REVIEW.md injection · AGENTS.md caller-message invariant · caught by security
- **[MEDIUM]** `src/core/TraceMessage.ts:198` — Callback text can inject the internal marker control characters and have them interpreted as trusted spans rather than escaped caller content.
  - **Fix:** Preserve only markers emitted by callback printers, then sanitize all other callback-return control characters before extracting spans.
  - **Cites:** specification caller-content sanitization criterion · src/core/AGENTS.md `stringifyMessage` invariant · caught by code
- **[MEDIUM]** `src/core/PropsPrinter.ts:413` — The new `fgClass` palette wiring lacks colored `PropsPrinter` assertions for top-level and nested class-instance prefix output.
  - **Fix:** Add colored and plain props-rendering coverage for class instances.
  - **Cites:** src/core/AGENTS.md props-rendering guidance · specification palette-sharing criterion · caught by test
- **[MEDIUM]** `test/types/registry.test-d.ts:17` — Consumer declaration tests do not pin `TraceCallPrinter` exports from both `loxer` and `loxer/trace`.
  - **Fix:** Import and assign the printer type from both entry points in the emitted-declaration registry test.
  - **Cites:** specification Definition of Done · rules/testing.md built-consumer typecheck guidance · caught by test

## Rule coverage gaps

- Public-API compatibility/versioning policy — code
- Magic values, derived state, and boolean-flag API guidance — simplicity
- Dependency vulnerability-management/update policy — security
- Secret-handling policy — security
