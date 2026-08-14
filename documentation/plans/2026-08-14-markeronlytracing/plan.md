# Plan: Marker-only tracing — remove the `@trace` and `@initLoxer` decorators

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed problem

## Context

Loxer has two tracing mechanisms. The build-time `trace` marker (`src/trace.ts` +
`babel-plugin-loxer-trace` / `vite-plugin-loxer-trace`) is a superset of the `@trace` class-method
decorator in everything that matters: it links `Loxer` calls written inside the traced body into that
invocation's box, it reaches methods, private methods, getters, setters, static methods and fields,
it names a file as the parent, it preserves the traced function's arity, and it infers formatter
types from the target. The decorator's box holds only its open, its close, and assigned errors.

Keeping both costs a duplicated option surface (`TraceOptions` vs `TraceMarkerOptions`), a second
runtime copy of the class-name rule, ~1300 lines of decorator tests, decorator toolchain settings in
three config files, and a guide that teaches two answers to one question. Classes are also not where
much modern application code lives.

The decorator's one genuine advantage is that it needs no build step: the marker throws
`missingTransform` without Babel. That audience is served by a migration note, not by a second
mechanism.

3.0.0 is unreleased, so this is the one moment where removing a Loxer 2 API and renaming the freed
types costs nothing.

## Approach

Remove both decorators, then refocus the surviving tracing code — names, types, docs and steering —
on the marker as the single tracing entry point. One change, eight work streams.

**Decisions settled with the user**

- `@initLoxer` goes too. `Loxer.init(options)` is the only initialization path, and the package
  retires decorator support entirely.
- No runtime replacement. A `tsc`-only, SWC, Bun or Deno project uses `Loxer.open()` /
  `Loxer.of(id).close()`; the migration appendix says so. Tracing is a build-time feature.
- Port per-side highlighting to the marker chain. Do **not** port independent args/result
  props-printer options — nobody has asked for them, and `pp()`'s once-only rule is enforced in two
  packages.
- Rename the freed type names.
- **Documentation is deferred in full.** No guide, JSDoc, TypeDoc, changelog or steering-doc edits in
  this change — see "Deferred: documentation" below for the list and what it costs.

**1. Delete the decorators**

- Delete `src/decorators/` entirely (`trace.ts`, `initLoxer.ts`, `index.ts`, `AGENTS.md`,
  `CLAUDE.md`).
- `src/index.ts`: drop the two `export * from './decorators/...'` lines.
- `src/core/PropsPrinter.ts`: delete the decorator-only block (`resolvePrintProps`,
  `TracePrintProps`, `NO_TRACE_PRINT_PROPS`, `resolveTracePrintProps`). The marker has its own
  `resolveMarkerPrintProps`.
- `src/core/TraceNames.ts`: `classParentName`'s only runtime caller was the decorator — delete it.
  That leaves `qualifiedFunctionName` alone in the file with one importer, so fold it into
  `src/core/TraceMessage.ts` and delete `TraceNames.ts`.

Do **not** re-export the marker from the package root, even though the name `trace` is now free on
that barrel. `babel-plugin-loxer-trace` finds the marker by its import specifier (`loxer/trace`), so
an `import { trace } from 'loxer'` would compile untransformed and throw at runtime.

`TraceCallPrinter`, `TraceOpenMessageContext` and `TraceCloseMessageContext` reached the package root
only through the decorator file. They stay exported from `loxer/trace`, which is where a marker
callback author imports from. Nothing announces that move until the deferred migration note lands.

**2. Rename the types the split shaped** (`src/tracing-types.ts`)

- Delete the decorator's `TraceOptions` with its `argsAsProps`, `resultAsProps`, `printArgs` and
  `printResult` keys.
- `TraceMarkerOptions` → `TraceOptions`. Its docblock currently explains itself as the narrower
  sibling of the decorator's; rewrite it to describe what the marker's option object is: the fields
  the build reads (`name`, `openMessage`, `closeMessage`). Docblocks are corrected only where they
  name a deleted or renamed declaration — a dangling reference in the code being changed. No wider
  JSDoc pass; that belongs to the deferred documentation work.
- `TraceMarkerRuntimeOptions` → `TraceRuntimeOptions`; `ExtendedPropsPrinterOptions` →
  `TracePrintOptions`.
- Keep `TraceMarker`, `TracePoint` and the internal `TraceMarker*` chain aliases: "marker" names what
  the thing is, not the removed contrast.
- `src/tracing-types.ts` stays its own file. `src/core/TraceMessage.ts` imports from it and
  `src/trace.ts` imports `TraceMessage.ts`, so folding it into `src/trace.ts` would close a cycle.

**3. Port per-side highlighting to the marker chain**

`TraceHighlight` (`'open' | 'close' | 'all'`) survives the decorator and becomes the marker's.

- `src/trace.ts`: widen `h()` / `highlight()` to `(doit?: boolean | TraceHighlight)`; make
  `isHighlighted(highlight, side)` side-aware and pass the side at the three call sites (open, close,
  failure — a failure is the close side).
- `src/tracing-types.ts`: widen `highlight` on the runtime options.
- `trace.point` keeps a boolean `h()`. A point is one log with no open and close to separate.
- No build-time change: the Babel plugin passes the `.h(...)` argument node through opaquely and only
  supplies `true` for a bare `.h()`, which stays correct.
- Semantics: `h()` and `h(true)` and `h('all')` highlight both sides; `h('open')` and `h('close')`
  highlight one.

**4. Simplify the parent-name resolver** (`src/core/TraceMessage.ts`)

`parentNameResolver` memoizes because the decorator read the class off the running instance and that
lookup had to happen once per call. The marker hands in a string the build already computed, so the
memo now guards a repeated `stringifyMessage` on a constant. Drop the memoization; keep the
laziness — it still defers sanitizing a parent that no template or callback prints, on every traced
call. `TraceCall.resolveParentName` keeps its `() => string` shape and one shared helper keeps
applying `stringifyMessage`.

**5. Tests**

- Delete: `test/decorators.test.ts`, `test/decorators-message-templates.test.ts`,
  `test/decorators-standard-emit.test.ts`, `test/trace-cases.ts` (~1292 lines).
- Surgery: `test/trace-message-cases.ts` (import the renamed options type),
  `test/class-parent-name-cases.ts` (rewrite the header comment — one copy of the rule is left, and
  the table now checks the build-time copy through transform output),
  `test/plain-function-trace-enclosing.test.ts` (drop the `classParentName` import and its direct
  assertion; keep the transform-output table), `test/types/registry.test-d.ts` (drop the
  decorator block and the `initLoxer` rows; keep the `@ts-expect-error` rows that pin the removed
  keys as non-options, since a stray `argsAsProps` in a marker options object must still be a compile
  error rather than a silently ignored field).
- Add: marker cases for `h('open')` and `h('close')` covering the open log, the close log and the
  failure close. Both sides need a test — an option read on both and tested on one silently drops the
  feature for half its callers.

**6. Retire the decorator toolchain**

- `tsconfig.json`: drop `experimentalDecorators`. Both `packages/*/tsconfig.json` extend it, so
  confirm with `pnpm build`.
- `test/types/tsconfig.json`: drop its own copy. `test/tsconfig.json` inherits and needs no edit.
- `vitest.config.ts`: drop the `oxc.decorator.legacy` block.
- `typedoc.json`: delete the `src/decorators/index.ts` entry point. This is the one unavoidable
  doc-adjacent edit — a TypeDoc entry point pointing at a deleted file breaks `pnpm run docs`
  outright. One line, no regeneration.

**7. Deferred: documentation**

No documentation work happens in this change. What is knowingly left stale, so the follow-up has the
list ready:

- `documentation/index.md` — the decorator example (~:171-184), the `@initLoxer` note (:249), the
  parent-name prose that describes decorated methods (:215-220), and the already-false claim
  (:163-169) that seven chain modifiers are keys of the marker's option object. Any rewrite must keep
  the `#plain-function-tracing` anchor: `README.md` and two `src/Loxer.ts` JSDoc blocks hardcode links
  to it.
- `documentation/props.md:329` — `resultAsProps` / `printResult` wording.
- Migration appendix — `@trace` → a marker, `@initLoxer` → `Loxer.init()`, no-Babel projects → manual
  `Loxer.open()` / `Loxer.of(id).close()`, and `TraceCallPrinter` / `TraceOpenMessageContext` /
  `TraceCloseMessageContext` now imported from `loxer/trace` rather than `loxer`. The full set of names
  the deleted `src/decorators/` barrel carried off the package root, so the appendix is written from a
  complete inventory: the values `trace` and `initLoxer`; the protocol types `TraceMethodContext`,
  `TraceMethodDecorator`, `InitLoxerClassContext` and `InitLoxerDecorator`; the three callback types
  above; and `TraceOptions`, whose name survives on `loxer/trace` with a different shape (no
  `moduleId`, `level`, `highlight`, `argsAsProps`, `resultAsProps`, `printArgs` or `printResult`).
  `TraceMarkerOptions` and `ExtendedPropsPrinterOptions` also vanish by name from `loxer/trace`, and
  `TraceHighlight` joins it.
- JSDoc — no pass over `src/trace.ts`, so it stays out of `typedoc.json` and the marker keeps having
  no generated API page. `docs/` is not regenerated; it will describe the decorator until it is.
- `CHANGELOG.md` — the `[Unreleased]` section advertises the decorator work in six places (:60,
  :65-66, :94, :131-133, :195, :210-212). Owned by the Finalization phase (`write-changelog`) and not
  touched here, so those entries stay wrong in the meantime.
- Steering docs — `AGENTS.md` (:41, :98-110, :154), `rules/testing.md` (:5-6, :26-27, :42-43, :52-60,
  :74, :103) and `src/core/AGENTS.md` (:64-70) describe "both trace runtimes" and use the two-copy
  `classParentName` rule as their worked example. After this change there is one runtime and one copy.
  `AGENTS.md` additionally requires the parent resolver to be *memoized*, which stream 4 deliberately
  drops, and `src/core/AGENTS.md` cites three deleted paths (`src/core/TraceNames.ts`,
  `src/decorators/trace.ts`, `test/decorators.test.ts`). `rules/coding-conventions.md:5` states
  `experimentalDecorators: true` as part of the stack, which stream 6 removes. These instruct future
  work, so they are the highest-value part of the deferral to pick up first.

The follow-up carries the whole user-visible contract of this change — the migration paths, the
`loxer/trace` import move, and what a no-build-step project does instead — so it warrants a spec of its
own rather than a plan written straight from this list. This change has none: it was planned from the
framed problem, and its acceptance rests on the streams above.

## Critical files

- `src/decorators/` — deleted in full (`trace.ts`, `initLoxer.ts`, `index.ts`, steering docs).
- `src/index.ts` — drop both decorator re-exports; nothing else on the root barrel changes.
- `src/tracing-types.ts` — delete the decorator options; rename `TraceMarkerOptions` →
  `TraceOptions`, `TraceMarkerRuntimeOptions` → `TraceRuntimeOptions`,
  `ExtendedPropsPrinterOptions` → `TracePrintOptions`; keep `TraceHighlight` for stream 3.
- `src/trace.ts` — side-aware highlight (`h()`, `isHighlighted`, the three call sites) and renamed
  types.
- `src/core/TraceMessage.ts` — absorb `qualifiedFunctionName`; drop the memo from the parent
  resolver.
- `src/core/TraceNames.ts` — deleted.
- `src/core/PropsPrinter.ts` — delete the decorator-only props-resolution block.
- `packages/babel-plugin-loxer-trace/src/marker-collection.ts` — no code change; two doc comments
  cite `@trace` and a deleted test file. This package keeps the only copy of `classParentName`.
- `test/decorators*.test.ts`, `test/trace-cases.ts` — deleted.
- `test/trace-message-cases.ts`, `test/class-parent-name-cases.ts`,
  `test/plain-function-trace-enclosing.test.ts`, `test/types/registry.test-d.ts` — surgery.
- `tsconfig.json`, `test/types/tsconfig.json`, `vitest.config.ts` — retire decorator settings.
- `typedoc.json` — drop the dead entry point. The only doc-adjacent file this change touches.

## Risks & open questions

- **Two type gates sit outside the default green path.** `pnpm typecheck:test` and
  `pnpm typecheck:types` are not run by `test`, `lint` or `build`, and Vitest transpiles without
  typechecking. Deleting a type that `test/` imports leaves `pnpm test` green while `typecheck:test`
  is red. Both gates are in the verification list; `typecheck:types` needs `pnpm build` first.
- **`@ts-expect-error` rows flip meaning.** `test/types/registry.test-d.ts` uses them as pins. A row
  whose error disappears fails loudly, but only under `typecheck:types`. Re-read each row against the
  post-rename types rather than deleting the block wholesale.
- **A silent break for external consumers.** Nothing in this repo imports `TraceCallPrinter` and its
  siblings from the package root, so every local gate stays green while an outside marker user's
  callback types break. Undocumented until the deferred migration note lands — accepted, since 3.0.0
  is unreleased.
- **The docs describe removed code until the follow-up runs.** The guide teaches `@trace` and
  `@initLoxer`, the changelog announces them for 3.0.0, and `docs/` still generates decorator pages.
  This is the deliberate cost of the deferral; the follow-up must land before 3.0.0 ships.
- **The steering docs will mislead the next change.** `AGENTS.md` and `rules/testing.md` state rules
  about "both trace runtimes" and about pinning two copies of `classParentName` — both false after
  this change, and both are read as instructions. Highest-priority item in the deferred list.
- **TypeDoc stays worse than it could be.** Dropping the entry point keeps `pnpm run docs` working but
  leaves the marker with no generated page at all. Adding `src/trace.ts` waits for the JSDoc pass.
- **`experimentalDecorators` reaches beyond `src/`.** Both workspace packages extend the root
  tsconfig. Neither uses decorator syntax, so removal should be inert — `pnpm build` proves it.
- **No open questions.** The no-build-step audience, the `@initLoxer` removal, the parity ports and
  the renames were all decided before this plan was written.

## Verification

- `pnpm lint`, `pnpm test`, `pnpm build`, then `pnpm typecheck:test` and `pnpm typecheck:types` — all
  five exit 0.
- Repository sweep for stragglers: `@trace`, `initLoxer`, `argsAsProps`, `resultAsProps`,
  `printArgs`, `printResult`, `classParentName`, `experimentalDecorators`, `TraceMarkerOptions`.
  Only historical `documentation/plans/` and `documentation/specs/` entries may still match.
- Confirm the API is actually gone: `import { trace } from 'loxer'` no longer type-checks, and the
  built `dist/index.js` exports no `trace` or `initLoxer`.
- Exercise the built trees, not just `src/`: after `pnpm build`, transform a module with
  `packages/babel-plugin-loxer-trace/dist` and run the emitted code against `dist/trace.js` and
  `dist/index.js`; run `node playground/OrderService.js`.
- Run the demo app (`pnpm demo`, `examples/vite-trace-demo`) and confirm a traced call still opens and
  closes a box, and that `h('open')` highlights the open message only. Clear
  `examples/vite-trace-demo/node_modules/.vite/deps` first so the dev server cannot serve a frozen
  older `dist/`.
- Prove `typedoc.json` is still valid without regenerating the committed tree: run typedoc with an
  `--out` pointing at a scratch directory. `docs/` stays untouched, and `pnpm run docs` is left for
  the deferred documentation follow-up.
