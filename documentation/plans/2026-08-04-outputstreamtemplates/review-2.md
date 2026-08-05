# Review: Structured output stream templates (pass 2)

**Verdict:** WARN
**Scope:** Unified output stream, structured renderers, render-time ANSI/box options, and migrated tests after pass-1 remediation.
**Lenses run:** code ✓ · simplicity ✓ · security skipped (no dependency or security-sensitive change) · perf ✓ · a11y skipped (library-only, no UI) · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/types.ts:168` — Public JSDoc, authored guides, examples, and generated API reference still describe removed callbacks and output configuration.
  - **Fix:** In the Documentation phase, update the public JSDoc, guides, examples, migration appendix, then regenerate TypeDoc.
  - **Cites:** Spec definition of done: public JSDoc, guides, examples, migration appendix, generated API HTML · `rules/documentation.md` · caught by code, acceptance

- **[MEDIUM]** `src/core/OutputStreams.ts:22` — Console props indentation assumes a padded module column, misaligning `NONE`-module props.
  - **Fix:** Derive indentation per lox from the timestamp and actual module text length.
  - **Cites:** Spec props-indentation criterion · `src/core/AGENTS.md` · baseline `CODE_REVIEW.md` §Correctness & logic · caught by code

- **[MEDIUM]** `src/core/OutputRenderer.ts:54` — Close-title opacity defaults to `0.5` rather than the established hidden default of `0`.
  - **Fix:** Preserve the default of `0` unless an explicit renderer option selects another value.
  - **Cites:** baseline `CODE_REVIEW.md` §Backward-compatibility · caught by code

- **[MEDIUM]** `src/core/OutputRenderer.ts:57` — The colored-only renderer repeats timestamp formatting already performed by `ANSIFormat.colorLox`.
  - **Fix:** Reuse `colored.timestamp`.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` · caught by perf

- **[MEDIUM]** `src/core/OutputRenderer.ts:84` — Public and console-only error paths duplicate the highlighted error-context gate.
  - **Fix:** Extract a local shared helper returning stack and open-log context.
  - **Cites:** `AGENTS.md` shared-helper rule · baseline `SIMPLICITY_REVIEW.md` · caught by simplicity

- **[MEDIUM]** `test/initialization.test.ts:343` — Renderer coverage omits full plain/colored fields, purity, boxed error context, and empty unhighlighted context.
  - **Fix:** Add direct public-renderer cases in the Testing phase.
  - **Cites:** Spec template and error-context requirements · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/format.test.ts:80` — Tests omit render-time default box layout and explicit module-layout override behavior.
  - **Fix:** Add fallback and override cases in the required box suite during Testing.
  - **Cites:** Spec box-style requirement · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/production.test.ts:104` — Production-silence coverage always configures an output stream, so it does not exercise the no-stream fallback.
  - **Fix:** Add a no-output production console assertion in the Testing phase.
  - **Cites:** Spec production-silence requirement · caught by acceptance, test

- **[MEDIUM]** `test/types/registry.test-d.ts:222` — Consumer type coverage does not narrow the public output event union or compile the complete template/options surface.
  - **Fix:** Import and narrow output types directly from the emitted package during Testing.
  - **Cites:** Spec definition of done: public types compile in consumer tests · caught by acceptance, test

## Rule coverage gaps

- Event-history snapshot aliasing/immutability has no explicit project test-standard requirement.
- The project test standard does not explicitly require consumer declaration tests for newly exported structured-output types.
- No general project rule defines public API deprecation/migration/versioning policy beyond preserving `src/index.ts`.
