# Plan: Reorganize core into runtime and output subsystems

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the agreed Version 1 structure

## Context

`src/core/` currently places runtime state, level and module policy, formatting, box construction,
output dispatch, error helpers, and trace-message rendering in one flat directory. The trace and
initialization decorators have already been removed in commit `1c502a8`; `loxer/trace` is now the
only tracing mechanism. The next change should make those responsibilities easier to find without
turning every concrete artifact into its own architectural boundary.

Version 1 uses two coarse core concepts: `runtime` for the logger's policy and mutable lifecycle,
and `output` for the complete presentation and delivery pipeline. Tracing becomes a peer feature of
`core`, while the existing `src/trace.ts` file remains the stable `loxer/trace` package entry point.
The reorganization is path-only: it must not alter behavior, public symbols, package exports, or
runtime dependencies.

## Approach

### 1. Establish the two core responsibility folders

Move the existing files without renaming their declarations or changing their implementation:

- `src/core/runtime/`: `Levels.ts`, `Modules.ts`, `Loxes.ts`, `LoxHistory.ts`, and `Realm.ts`.
- `src/core/output/`: `ANSIFormat.ts`, `BoxFactory.ts`, `BoxFormat.ts`, `OutputRenderer.ts`,
  `OutputStreams.ts`, `PropsPrinter.ts`, and the existing `color/` subtree.
- Keep `src/core/Error.ts`, `src/core/index.ts`, and the core steering files at the `core` root.

The names describe responsibilities rather than concrete output artifacts. `runtime` decides what
the logger retains and permits; `output` decides how an accepted log is formatted, boxed, rendered,
and delivered. These folders are navigation boundaries, not strict dependency layers. Existing
relations such as `BoxFactory -> Loxes`, `OutputStreams -> LoxHistory`, and
`OutputLox -> BoxFactory/Modules` remain valid and do not justify moving `src/loxes/` or redesigning
the value model.

### 2. Give the sole tracing mechanism a feature-level home

Create `src/tracing/` and move:

- `src/core/TraceMessage.ts` to `src/tracing/TraceMessage.ts`;
- `src/tracing-types.ts` to `src/tracing/types.ts`.

Keep `src/trace.ts` at the source root because `package.json` maps the public `loxer/trace` subpath
to `dist/trace.js` and `dist/trace.d.ts`. Update it to import and re-export the moved modules while
preserving every existing exported symbol. Do not re-export `trace` from the root package, add a
new package subpath, introduce a tracing barrel, split the marker proxy/runtime, or move shared span
types between declarations during this structural change.

### 3. Update imports directly and preserve the public API

Update explicit relative imports in the moved files, `src/Loxer.ts`, `src/index.ts`, `src/types.ts`,
`src/trace.ts`, and `src/loxes/`. Every ESM source specifier must retain its emitted `.js`
extension. Use direct file imports rather than adding `index.ts` barrels to the new folders.

Keep the public inventory of `src/index.ts` unchanged: `ANSIFormat`, `BoxFactory` and its types,
the public output renderers, `PropsPrinter`, box layouts and symbols, `BoxLayoutStyle`,
`PropsPrinterOptions`, `ExtendedModule`, `NamedError`, and all existing logger types must retain
the same names and type/value export status. Update `src/core/index.ts` to re-export the same
formatting API from `core/output/`; keep its path because `typedoc.json` uses it as an entry point.
Do not change the `.` or `./trace` entries in `package.json`.

### 4. Move direct source consumers and current path documentation

Update tests that intentionally import internals by path, including level, module, initialization,
formatting, realm, color, and trace-message tests. Update current test comments that name moved
files. No behavior tests need to be added because no behavior changes; the existing suites are the
regression contract.

Update current steering and path documentation so the new tree does not teach deleted or moved
code:

- root `AGENTS.md`: replace the flat layout and two-trace-runtime/decorator guidance with the
  marker-only structure;
- `src/core/AGENTS.md`: describe the `runtime` and `output` boundaries and remove the deleted
  `TraceNames.ts`, decorator runtime, and decorator-test references;
- `rules/testing.md`: correct moved source paths and remove decorator-era test guidance;
- `documentation/debt.md`: update its live source link to `Modules.ts`.

Keep historical plans and specifications unchanged. Broader authored-guide and changelog cleanup
from the marker-only change remains separate from this path refactor.

### 5. Prevent obsolete build artifacts from shipping

TypeScript does not clean `dist/`. Before the final build, identify and remove only the exact old
emitted files for moved sources (`dist/core/<moved-file>.*`, `dist/core/color/*`,
`dist/core/TraceMessage.*`, and `dist/tracing-types.*`). Do not recursively delete `dist/` or any
directory that might contain workspace links. Rebuild so the corresponding files exist only under
`dist/core/runtime/`, `dist/core/output/`, and `dist/tracing/`.

## Critical files

- `src/core/runtime/` — new home for levels, modules, pending/open log state, history, and realm
  storage; `Realm.ts` must remain import-free.
- `src/core/output/` — new home for ANSI/color formatting, props rendering, box construction,
  output templates, and output dispatch.
- `src/tracing/TraceMessage.ts` and `src/tracing/types.ts` — internal message rendering and types for
  the sole trace-marker mechanism.
- `src/trace.ts` — stable `loxer/trace` facade and runtime; only its internal specifiers change.
- `src/Loxer.ts`, `src/types.ts`, and `src/loxes/` — internal consumers whose direct imports follow
  the moved files.
- `src/index.ts` — stable root public surface; paths change but exported names do not.
- `src/core/index.ts` — existing TypeDoc/formatting barrel, retained at its current path with updated
  re-exports.
- `package.json` and `typedoc.json` — verification anchors whose entry-point paths must remain
  unchanged.
- `test/` — direct internal imports and path comments move to the new locations; behavior
  expectations stay unchanged.
- `AGENTS.md`, `src/core/AGENTS.md`, `rules/testing.md`, and `documentation/debt.md` — current
  structure and source-path guidance.
- `dist/` — generated output checked for obsolete pre-move artifacts before packaging.

## Risks & open questions

- **A missed ESM specifier fails consumers.** NodeNext does not infer extensions or rewrite source
  paths. Preserve `.js` on every relative import and let `pnpm build` check the complete graph.
- **Stale generated files can be published.** Incremental TypeScript emission leaves files from old
  source paths in `dist/`. Remove only the enumerated old artifacts, rebuild, and inspect the emitted
  tree before packaging.
- **The folders are not dependency layers.** Bidirectional conceptual relationships already exist
  through `OutputLox`, `BoxFactory`, and `Modules`. Treat the folders as ownership/navigation aids
  and do not expand the change into a model or dependency inversion redesign.
- **An internal move must not become a public API change.** Compare root and trace declaration
  exports before and after the move and keep the package export map unchanged.
- **Path cleanup could rewrite history.** Update only active source, tests, steering documents, and
  live documentation links; leave historical plan/spec artifacts intact.
- **No open product decisions remain.** Version 1, direct imports, the trace feature boundary, and
  the path-only scope are settled.

## Verification

1. Review `git diff --summary` and the source diff to confirm that production changes consist of
   moves and import/export specifier updates, with no implementation edits or symbol renames.
2. Search active source, tests, configuration, steering docs, and authored documentation for the
   old paths (`src/core/Levels`, `src/core/Modules`, `src/core/Loxes`, `src/core/LoxHistory`,
   `src/core/Realm`, `src/core/ANSIFormat`, `src/core/BoxFactory`, `src/core/BoxFormat`,
   `src/core/OutputRenderer`, `src/core/OutputStreams`, `src/core/PropsPrinter`,
   `src/core/TraceMessage`, `src/core/color`, and `src/tracing-types`). Historical plans/specs are
   excluded from this check.
3. Run `pnpm lint` and `pnpm build`.
4. Run `pnpm test`, `pnpm typecheck:test`, and `pnpm typecheck:types`.
5. Inspect `dist/` to confirm the old emitted paths are absent and the new runtime, output, and
   tracing trees are complete.
6. Compare the exported declarations in `dist/index.d.ts` and `dist/trace.d.ts` with the pre-move
   public inventory, then smoke-import both `loxer` and `loxer/trace` from the built package.
7. Validate TypeDoc against a scratch output directory using `typedoc.json`; do not hand-edit the
   generated `docs/` tree.
8. Inspect a dry-run package file list to ensure no obsolete internal build paths would ship.
