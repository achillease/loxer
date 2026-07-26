# Plan: mark several functions with one `trace()` call

> Grounding: none — direct user request, implemented in one pass. No spec.
>
> **Revision (2026-07-26, after the first implementation landed):** the feature first shipped as a
> separate `traceAll(targets, options)` marker. The user then asked for `trace()` itself to accept
> either a single target or a list, with `traceAll` removed. Everything below describes the merged
> design; the separate-marker variant is gone from the source, and only the worklog records it.
>
> Folder location note: this plan lives under `documentation/plans/`, not `docs/plans/` —
> `rules/documentation.md` forbids the latter because `pnpm docs` wipes the whole `docs/` tree. The
> folder slug still says `traceallmarker` because the plan predates the revision.

## Context

`trace(target, options)` marked exactly one named plain-function binding. Instrumenting a group of
related functions the same way meant repeating the identical options object per function, which
drifts as soon as one copy is edited.

The user asked for one marker that takes either a single function or a list and treats every listed
function equally.

A related finding surfaced while answering the preceding question about marker placement: the
transform declared each marker's hoisted options storage immediately before the *target's*
declaration statement and left the assignment at the marker. With the marker placed **above** the
declaration, the declaration's `= {}` initializer therefore ran *after* the assignment and silently
discarded the author's options. A shared options variable for `traceAll` cannot use that
per-target insertion point at all, so both concerns are fixed by the same change.

## Approach

1. **Runtime marker** (`src/trace.ts`) — widen the first parameter to `T | readonly T[]`, keeping one
   signature and one JSDoc block. Inference from an array literal makes `T` the union of the listed
   function types, so `Parameters<T>` and `Awaited<ReturnType<T>>` distribute into a union of
   argument tuples and results — a formatter must handle every listed target. A single function still
   infers its exact argument tuple, which the existing type fixture pins.
2. **Plugin** (`packages/babel-plugin-loxer-trace/src/plugin.ts`) — give a marker N targets instead of
   one; the marker-binding lookup stays a `Set`. An array-literal first argument needs at least one
   identifier, and every element resolves through the existing binding lookup, so a spread element,
   member expression, or array-valued variable is a build error. Diagnostics keep their current
   wording, so a list reuses the same messages as a single target.
3. **Shared options storage** — one hoisted `var` per marker, with the assignment left at the marker.
   Declared **without an initializer** in the outermost of its targets' declaring scopes: those scopes
   are linearly nested (every target binding is on the marker's scope chain), so the outermost one is
   reachable from every target's generated body and from the assignment, while a marker written inside
   a function still gets fresh storage per invocation. With no initializer there is nothing to
   overwrite the assignment, so marker and targets may appear in either order, and a call that beats
   the assignment falls back to the runtime helper's default options.
   *(Revised during Testing — the first attempt declared it at module scope, which broke
   per-invocation options for a marker inside a re-invoked function. See `test-bugs.md`.)*
4. **One marker per target** — hoist the duplicate check into a pass over all markers before any
   codegen, so it also rejects a function listed twice in one call and a function marked both alone
   and inside a list.

## Critical files

- `src/trace.ts` — the marker export surface of `loxer/trace`.
- `packages/babel-plugin-loxer-trace/src/plugin.ts` — marker collection, validation, options storage.
- `packages/babel-plugin-loxer-trace/src/trace-binding.ts` — unchanged; already takes the options
  identifier as a parameter, so it works per target with a shared identifier.
- `test/plain-function-trace.test.ts` — behavior and diagnostics.
- `test/babel7-compat.test.ts` — Babel 7 boundary subset.
- `documentation/index.md`, `README.md`, `packages/babel-plugin-loxer-trace/README.md` — user guides.

## Risks

- **Codegen change for existing markers.** Moving options storage affects every marker, not just list
  markers. Mitigation: the two existing hoisting tests already pin the observable outcome (a call
  before the marker traces with default options), plus a new test for the marker-above-declaration
  case that was previously broken, plus a per-invocation isolation test for nested markers. This risk
  materialized once — see the plan revision in step 3.
- **Union-typed formatters.** A list with unrelated signatures makes formatter callbacks awkward by
  design; documented as a reason to keep a per-function marker.
- **Overload-free widening.** `T | readonly T[]` in one signature keeps a single JSDoc block but
  relies on TypeScript inferring `T` from whichever branch matches. Mitigation: type fixtures for both
  call forms, checked by `pnpm typecheck:test`.

## Verification

`pnpm build`, `pnpm lint`, `pnpm typecheck:test`, `pnpm test`, `pnpm docs`, plus `pnpm demo:build`
for the real Vite adapter path.
