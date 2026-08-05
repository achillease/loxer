# Review: Structured output stream templates (pass 3)

**Verdict:** WARN
**Scope:** Unified output stream, structured renderers, render-time ANSI/box options, and migrated tests after pass-2 remediation.
**Lenses run:** code ✓ · simplicity ✓ · security skipped (no dependency or security-sensitive change) · perf ✓ · a11y skipped (library-only, no UI) · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/types.ts:354` — Public JSDoc, authored guides, examples, and generated API reference still describe removed callbacks and output configuration.
  - **Fix:** In the Documentation phase, update the public JSDoc, guides, examples, migration appendix, then regenerate TypeDoc.
  - **Cites:** Spec definition of done: public JSDoc, guides, examples, migration appendix, generated API HTML · `rules/documentation.md` · caught by code, acceptance

- **[MEDIUM]** `src/core/OutputStreams.ts:27` — Development and production error paths independently construct the same history-snapshot event.
  - **Fix:** Extract one private helper that creates the snapshot event for both paths.
  - **Cites:** `AGENTS.md` shared-helper rule · baseline `SIMPLICITY_REVIEW.md` · caught by simplicity

- **[MEDIUM]** `test/initialization.test.ts:343` — Renderer coverage omits complete template fields, purity, boxed error context, and empty unhighlighted context.
  - **Fix:** Add direct renderer cases in the Testing phase.
  - **Cites:** Spec template/error-context requirements · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/initialization.test.ts:368` — Error-event coverage does not prove its history stays an independent snapshot after later logging or consumer mutation.
  - **Fix:** Add snapshot-isolation coverage in the Testing phase.
  - **Cites:** Spec error-history requirement · caught by acceptance, test

- **[MEDIUM]** `test/format.test.ts:80` — Tests omit render-time default box layout and explicit module-layout override behavior.
  - **Fix:** Add fallback and override cases in the required box suite during Testing.
  - **Cites:** Spec box-style requirement · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/production.test.ts:104` — Production-silence coverage configures an output stream and does not exercise the no-stream fallback.
  - **Fix:** Add a no-output production console assertion in the Testing phase.
  - **Cites:** Spec production-silence requirement · caught by acceptance, test

- **[MEDIUM]** `test/types/registry.test-d.ts:202` — Consumer type coverage does not narrow the public output event union or compile the complete template/options surface.
  - **Fix:** Import and narrow output types directly from the emitted package during Testing.
  - **Cites:** Spec definition of done: public types compile in consumer tests · caught by acceptance, test

## Rule coverage gaps

- Event-history snapshot aliasing/immutability and consumer declaration coverage for new structured-output types have no explicit project test-standard requirement.
- No general project rule defines public API deprecation/migration/versioning policy beyond preserving `src/index.ts`.
