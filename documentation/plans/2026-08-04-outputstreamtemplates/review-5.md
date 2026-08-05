# Review: Structured output stream templates (pass 5)

**Verdict:** WARN
**Scope:** Complete output-stream/template change after test, documentation, TypeDoc, demo, and playground remediation.
**Lenses run:** code ✓ · simplicity ✓ · security skipped (no dependency or security-sensitive change) · perf ✓ · a11y skipped (the demo output change does not alter UI semantics) · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `documentation/index.md:372` — Several public guides and JSDoc examples still teach removed presentation/callback APIs: highlighting through `LoxerConfig`, an obsolete `BoxFactory.getBoxString` signature, `devLog` for props rendering, and error callbacks in the performance guide.
  - **Fix:** In the Documentation phase, teach render-time renderer options and the unified narrowed output stream in each example, then regenerate TypeDoc.
  - **Cites:** Spec presentation/options and public-documentation requirements · `rules/documentation.md` · caught by code, acceptance

- **[MEDIUM]** `examples/vite-trace-demo/src/main.ts:246` — The live output handler builds a complete plain-and-colored template for every event but consumes only raw message/time fields, doing discarded props/box work on its hot path.
  - **Fix:** Store `lox.message` and `lox.timeText` directly and remove the unused renderer import.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` redundant work · `AGENTS.md` renderer-cost rule · caught by perf

- **[LOW]** `examples/vite-trace-demo/src/main.ts:74` — Visible demo copy calls unified output events “callbacks.”
  - **Fix:** Rename it to “output events” or “output stream.”
  - **Cites:** `rules/documentation.md` examples aligned to the public API · caught by code

## Rule coverage gaps

- `rules/testing.md` has no explicit requirement for event-history snapshot isolation or consumer declaration tests for newly exported structured public types.
- No project performance rule defines an allocation/latency budget for structured template rendering, snapshots, or synchronous output consumers.
- No general project rule defines public API deprecation/migration/versioning policy beyond preserving `src/index.ts`.
