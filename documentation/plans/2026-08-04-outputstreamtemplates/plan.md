# Plan: Structured output stream templates

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: documentation/specs/output-stream-templates.md

## Context

The output refactor replaces four environment/type callbacks with one discriminated stream and
separates formatting from delivery. The selected implementation model is a structured template, not
a string-only renderer: a raw lox produces parallel plain and ANSI-colored fields, which any output
destination can compose or store.

## Approach

1. Keep the one `output` stream on `LoxerOptions` and its `dev`/`prod`, `log`/`error` event union.
   `Loxer` selects the event at dispatch time; `OutputStreams` either hands it to the stream or
   applies the built-in development console policy.

2. Keep `OutputLoxRenderer` and `ErrorLoxRenderer` as the formatting boundary. They derive module,
   message, time, box, props, timestamp, and colored equivalents without delivering them. The error
   template adds stack and open-log context. Give their object shapes public names and export the
   helpers from the package root so a consumer can use the same templates in its stream.

3. Make the default console path a small adapter that obtains the colored template and composes its
   fields into the current timestamped development line. Keep that composition out of the templates;
   a non-console destination is free to preserve the structured fields rather than flattening them.

4. Keep rendering preferences outside logger configuration. `ANSIFormat.colorLox` receives color and
   module-opacity options; a consumer selecting plain rather than colored template fields disables
   ANSI without modifying events. Preserve reverse/inverted highlighting as the no-color default.

5. Retain an optional box layout on raw segments only for an explicit module choice. Have
   `BoxFactory.getBoxString` resolve an unspecified segment with its rendering-time fallback, so
   module overrides survive while a destination can choose a default layout.

6. Migrate tests around the real public stream/template boundary. Use a shared event-capture adapter
   only to preserve existing behavioral suites' collector assertions; add focused tests that inspect
   the union and structured template directly. Replace private `OutputStreams` unit coverage with
   default-console composition and renderer tests.

7. Update authored documentation, examples, public JSDoc, and migration material after the runtime
   and tests stabilize. Explain how a stream uses the structured templates and how a destination
   chooses plain versus colored fields.

## Critical files

- `src/types.ts` — stream event types, color options, and named structured-template return types.
- `src/Loxer.ts` and `src/core/OutputStreams.ts` — event dispatch and default console adapter.
- `src/core/OutputRenderer.ts` — ordinary/error structured templates and props/error context.
- `src/core/ANSIFormat.ts` — configurable ANSI treatment and timestamp/module formatting.
- `src/core/BoxFactory.ts` and `src/core/Modules.ts` — render-time fallback box layout and explicit
  module style preservation.
- `src/index.ts` — public renderer/type exports.
- `test/output-capture.ts`, `test/output-renderer.test.ts`, and existing stream consumers — unified
  event capture and behavior coverage without legacy callbacks.
- `documentation/index.md`, `documentation/props.md`, playgrounds, and the demo — consumer-facing
  structured-template examples and migration guidance.

## Risks & open questions

- A structured template needs an explicitly exported return type; otherwise consumers cannot safely
  depend on the shape TypeScript infers.
- Plain/colored props must use the appropriate printer mode and indentation supplied by the target
  destination. Cover both forms so a change cannot make one silently drift.
- The timestamped default output is part of the selected template composition and needs dedicated
  assertions rather than relying on incidental console snapshots.
- Existing tests must replace stale callback configuration without changing their behavioral claims.

## Verification

1. Type-check a consumer stream that narrows both event variants and uses both renderer helpers.
2. Assert plain and colored template fields for normal, close, warning, error, highlighted error,
   requested props, and timestamps.
3. Assert the default console adapter composes the colored template, while production remains silent
   without a stream and a registered stream receives raw identity/history.
4. Assert inverted highlighting, configurable warning/error colors, and explicit/default box styles.
5. Run `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm typecheck:test`, and `pnpm typecheck:types`.
