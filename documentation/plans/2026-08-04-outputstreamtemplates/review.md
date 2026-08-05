# Review: Structured output stream templates

**Verdict:** WARN
**Scope:** Unified output stream, public structured renderers, render-time ANSI/box options, and migrated tests.
**Lenses run:** code ✓ · simplicity ✓ · security skipped (no dependency or security-sensitive change) · perf ✓ · a11y skipped (library-only, no UI) · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `src/core/OutputStreams.ts:24` — Error events expose the mutable internal history array rather than the required snapshot; a retained event changes as later logs arrive and a consumer can mutate `Loxer.history`.
  - **Fix:** Dispatch a shallow `history.stack` copy for development and production error events.
  - **Cites:** Spec acceptance criterion: error variant carries its history snapshot · caught by code, acceptance

- **[HIGH]** `src/core/OutputRenderer.ts:28` — The exported renderer options are unused: callers cannot apply the documented render-time colors, close-title opacity, or default box layout.
  - **Fix:** Accept and thread renderer options into ANSI rendering, box rendering, and close-module opacity.
  - **Cites:** Spec acceptance criteria: render-time color/box helpers and `LoxerConfig` migration · baseline `CODE_REVIEW.md` §Conventions · caught by code, simplicity, acceptance

- **[HIGH]** `documentation/index.md:649` — The authored guides, examples, and generated API reference still teach the removed four-callback API and obsolete configuration fields.
  - **Fix:** Update the user guides, examples, public JSDoc, migration appendix, then regenerate TypeDoc in the Documentation phase.
  - **Cites:** Spec definition of done: public API JSDoc, guides, examples, migration appendix, generated API HTML · `rules/documentation.md` · caught by code, acceptance

- **[MEDIUM]** `src/core/OutputRenderer.ts:37` — The default console path calculates plain props and other template fields that it discards before rendering the colored form, doubling potentially recursive props work.
  - **Fix:** Let the console adapter request the colored template only, while preserving complete templates for public callers.
  - **Cites:** `AGENTS.md` formatter-cost rule · baseline `PERFORMANCE_REVIEW.md` · caught by perf

- **[MEDIUM]** `src/core/BoxFactory.ts:64` — Nested segments with no explicit module layout are eagerly assigned `'round'`, preventing the render-time fallback style from applying.
  - **Fix:** Preserve absent segment layouts and resolve them only in `getBoxString`.
  - **Cites:** Spec acceptance criterion: module/default box-style behavior · `src/core/AGENTS.md` · caught by code, acceptance

- **[MEDIUM]** `src/core/OutputRenderer.ts:38` — Plain and colored timestamps derive from different formats, so choosing a template form changes more than ANSI treatment.
  - **Fix:** Derive one stable timestamp string and color that same value.
  - **Cites:** Spec acceptance criterion: matching plain and colored template fields · baseline `CODE_REVIEW.md` §Correctness & logic · caught by code

- **[MEDIUM]** `test/initialization.test.ts:343` — Renderer tests do not fully prove template fields, purity, boxed error context, or empty unhighlighted error context.
  - **Fix:** Add direct renderer cases covering every plain/colored field, context, and unchanged lox/history.
  - **Cites:** Spec template/error-context requirements · caught by test

- **[MEDIUM]** `test/format.test.ts:80` — Tests omit unspecified-layout fallback and explicit-layout override behavior; `test/boxed.test.ts` was not updated for the box behavior change.
  - **Fix:** Cover both fallback and override observable cases in the required box suite.
  - **Cites:** Spec box-style requirement · `rules/testing.md` · caught by test, acceptance

- **[MEDIUM]** `test/production.test.ts:104` — The production-silence case registers an output stream and therefore does not test the no-stream fallback.
  - **Fix:** Spy on the console in production with no output stream and assert eligible logs remain silent.
  - **Cites:** Spec production-silence requirement · caught by test, acceptance

- **[MEDIUM]** `test/types/registry.test-d.ts:222` — Consumer type coverage does not narrow the output event union or compile the complete public template surface.
  - **Fix:** Assert `history` only on error events and type-check every plain/colored template field.
  - **Cites:** Spec definition of done: public stream/template types compile in consumer tests · caught by test

- **[LOW]** `src/core/OutputStreams.ts:29` — Normal and error console fallbacks duplicate their props-indentation calculation.
  - **Fix:** Store the shared calculation once in the constructor or extract a shared helper.
  - **Cites:** `AGENTS.md` shared-helper rule · baseline `SIMPLICITY_REVIEW.md` · caught by simplicity

## Rule coverage gaps

- Error/rejection and resource-lifecycle conventions are not documented as general project rules.
- No documented public-API deprecation/versioning policy exists beyond preserving `src/index.ts`.
- No project-specific guidance covers reuse searches, data-shape readability, deletion of superseded API, or general I/O/concurrency performance policy.
