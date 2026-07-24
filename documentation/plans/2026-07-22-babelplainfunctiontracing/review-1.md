# Review: Babel plain-function tracing (initial pass)

**Verdict:** WARN
**Scope:** Runtime tracing API, Babel and Vite companion packages, workspace/package configuration, Vite trace demo, public documentation/spec/plan, and trace integration coverage.
**Lenses run:** code ✓ · security ✓ (dependency audit ✓) · perf ✓ · a11y ✓ · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:185` — A marked non-`async` function that returns a Promise or thenable is changed to return the promise created by `Promise.resolve(result).then(...)`, rather than its original return value. This changes observable promise identity and custom/subclass Promise behavior.
  - **Fix:** Attach lifecycle handlers to an assimilated promise but return the original `result`; add an assertion that a traced function returns the exact original Promise object.
  - **Cites:** `CODE_REVIEW.md` backward-compatibility checklist · plan semantic-preservation requirement · spec callable-behavior acceptance criterion · caught by code quality & compatibility

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:238` — The transform retains a direct `.m('ORDER')` call before `.of(id)`, but `.of()` derives its module from the opening box, so the selected module is lost. The current regression test locks in `TRACE` for a direct `Loxer.m('ORDER')` record, contradicting the required module-modifier semantics.
  - **Fix:** Add a linked-entry path that preserves the direct call's selected module while attaching its box ID, then assert module, level, and highlight behavior for linked `log`, `error`, and `namedError` chains.
  - **Cites:** `CODE_REVIEW.md` correctness checklist · spec acceptance criterion for documented modifier forms · caught by code quality & compatibility, acceptance / definition-of-done

- **[HIGH]** `documentation/index.md:1` — The public `loxer/trace` marker has no authored user documentation for setup, Babel/Vite ordering, source maps, supported binding forms/options, or the non-propagation boundary for uninstrumented descendants.
  - **Fix:** Add a task-focused authored guide or section and link it from `documentation/index.md`; cover marker usage, Babel/Vite order, source-map expectations, supported forms, and manual/separate instrumentation alternatives.
  - **Cites:** `rules/documentation.md` feature-concept rule · spec documentation acceptance criteria and definition of done · caught by code quality & compatibility, acceptance / definition-of-done

- **[MEDIUM]** `examples/vite-trace-demo/src/main.ts:217` — Each callback keeps every record indefinitely and rebuilds the complete record DOM list through `replaceChildren`, producing unbounded memory use and cumulative O(n²) rendering during a long trace session.
  - **Fix:** Cap the retained record buffer and append only the new row, or use batching/windowing; make Clear reset that bounded buffer.
  - **Cites:** `PERFORMANCE_REVIEW.md` algorithmic/memory and frontend checks · caught by performance

- **[MEDIUM]** `examples/vite-trace-demo/src/style.css:271` — The narrow-screen rule adds vertical padding to trace rows, recreating gaps between box glyphs and breaking the requested connected BoxLayout on mobile.
  - **Fix:** Keep vertical row padding at zero and place any compact-layout spacing in non-glyph content.
  - **Cites:** `CODE_REVIEW.md` correctness checklist · user-requested demo behavior · caught by code quality & compatibility

- **[MEDIUM]** `examples/vite-trace-demo/src/main.ts:255` — Decorative box-drawing glyphs are exposed as the callback stream's accessible text, making nested traces noisy and hard to interpret in a screen reader.
  - **Fix:** Mark the generated trace-box span as `aria-hidden="true"`; add concise visually hidden nesting text only if that relationship needs to be conveyed.
  - **Cites:** `A11Y_REVIEW.md` semantics and text-alternatives checks · caught by accessibility

- **[MEDIUM]** `test/plain-function-trace.test.ts:54` — The suite covers only transformed function declarations, not named arrow or function-expression bindings supported by the feature.
  - **Fix:** Add transform-and-execute cases for `const fn = function () {}` and `const fn = () => {}`, including the arrow's lexical `this` behavior.
  - **Cites:** spec supported-named-function and callable-behavior criteria · caught by test quality & freshness

- **[MEDIUM]** `test/plain-function-trace.test.ts:142` — Nested/overlapping coverage only matches open and close IDs; it does not prove that each parent/child direct log is linked to its own invocation.
  - **Fix:** Map each opening record to its ID and assert that every direct parent and child record has the corresponding ID across overlapping calls.
  - **Cites:** spec direct-Loxer and nested-instrumented-function criteria · caught by test quality & freshness

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/src/index.ts:17` — The Vite adapter has no automated coverage for filtering, query-string IDs, TS/TSX parser selection, or generated source maps.
  - **Fix:** Add focused adapter tests for `.ts` and `.tsx`, include/exclude behavior, query IDs, marker removal, and returned maps.
  - **Cites:** plan verification requirements for Vite fixtures and source maps · caught by test quality & freshness

- **[MEDIUM]** `src/Loxer.ts:42` — The new browser-safe `process` guard is not tested with `process` absent, so the renderer behavior required by the plan remains unguarded.
  - **Fix:** Add a browser-like initialization test with `process` temporarily unavailable, covering default and explicit `dev` modes.
  - **Cites:** plan verification requirement for browser-like execution · caught by test quality & freshness

## Rule coverage gaps

- Security policy for sensitive-data logging/redaction, secret management, dependency-audit cadence, and vulnerability response is undocumented — surfaced by security.
- Runtime tracing overhead, trace-volume limits/sampling, callback retention, and transform-time budgets have no project performance guidance — surfaced by performance.
- Semantic UI structure, accessible text alternatives, keyboard/focus behavior, ARIA/live-region use, contrast/reflow, and feedback are undocumented — surfaced by accessibility.
- Companion-package compatibility/versioning, source-transform semantic preservation, source-map validation, and Vite-plugin ordering have no project-specific rules — surfaced by code quality & compatibility.
- The project's test rules do not state coverage expectations for companion build-tool packages or Vite source-map behavior — surfaced by acceptance / definition-of-done.
