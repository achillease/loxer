# Review: Structured output stream templates (pass 4)

**Verdict:** WARN
**Scope:** Unified output stream, structured renderers, render-time ANSI/box options, exported template types, and migrated consumers after the final runtime remediation.
**Lenses run:** code ✓ · simplicity ✓ · security skipped (no dependency or security-sensitive change) · perf ✓ · a11y skipped (library-only, no UI) · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `documentation/index.md:220` — Public JSDoc, authored guides, playgrounds, and the Vite demo still teach the removed callback/configuration model. The examples' obsolete `callbacks` configuration is ignored at runtime, so their integrations no longer receive events; generated API HTML is also stale.
  - **Fix:** In the Documentation phase, migrate the guides, JSDoc, examples, and migration appendix to `output(event)` with discriminated event narrowing and structured renderer composition, then run `pnpm run docs`.
  - **Cites:** Spec definition of done: public JSDoc, guides, examples, migration appendix, generated API HTML · `rules/documentation.md` · caught by code, acceptance

- **[MEDIUM]** `test/initialization.test.ts:343` — Renderer tests do not assert every plain/colored field, purity, boxed highlighted open-log context, or empty context for unhighlighted errors.
  - **Fix:** In the Testing phase, add direct renderer cases for all field sets, highlighted boxed errors, unhighlighted errors, and unchanged lox/history.
  - **Cites:** Spec template/error-context and formatting-only requirements · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/initialization.test.ts:368` — Error-event coverage does not prove that history is an independent snapshot after later logs or consumer mutation.
  - **Fix:** Capture an error event, append a later log and mutate the captured history, then assert logger history and the captured snapshot remain isolated.
  - **Cites:** Spec error-history snapshot requirement · caught by acceptance, test

- **[MEDIUM]** `test/format.test.ts:80` — No test proves renderer-selected fallback layout and an explicit module-layout override together.
  - **Fix:** In the Testing phase, add visible fallback/override cases in `test/boxed.test.ts`.
  - **Cites:** Spec box-style requirement · `rules/testing.md` · caught by acceptance, test

- **[MEDIUM]** `test/production.test.ts:104` — The production-silence test registers `output`, so it does not cover the no-stream fallback.
  - **Fix:** In the Testing phase, mock console output, initialize production without `output`, emit eligible logs and an error, and assert that the fallback remains silent.
  - **Cites:** Spec production-silence requirement · caught by acceptance, test

- **[MEDIUM]** `test/types/registry.test-d.ts:202` — Consumer declarations do not narrow the public output union or compile the complete public templates/options surface.
  - **Fix:** In the Testing phase, import `LoxerOutputEvent`, `LoxerOutputStream`, named template types, and renderer options from `loxer`; narrow `kind` before reading error-only history and type-check all template fields/options.
  - **Cites:** Spec definition of done: public stream/template types compile in consumer tests · `rules/testing.md` · caught by code, acceptance, test

## Rule coverage gaps

- `rules/testing.md` has no explicit requirement for event-history snapshot isolation or consumer declaration tests for newly exported structured public types.
- No project performance rule defines an allocation/latency budget for structured template rendering, snapshotting, or synchronous output-stream consumers.
- No general project rule defines public API deprecation/migration/versioning policy beyond preserving `src/index.ts`.
