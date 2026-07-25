# Plan: Babel Instrumentation for Plain-Function Traces

> Grounding: architect (technical) consulted · web-researcher (selection) consulted
> Spec: documentation/specs/babel-plain-function-tracing.md

## Context

Loxer boxes already model a function trace through an open lox plus linked `of(id)` entries, but
plain functions must currently retain the returned handle, append each internal entry manually, and
close every outcome themselves. The existing `@trace` helper only wraps legacy-decorated class
methods. The new feature must give Babel-capable TypeScript projects automatic lifecycle tracing for
plain functions and attach direct in-function Loxer entries to the correct per-invocation box across
`await`, without relying on ambient async context.

The runtime is ESM, targets Node 20+, and uses TypeScript 6. The core package must remain usable
without Babel or Vite. Electron/Vite consumers need a separate build-time integration for their
distinct renderer, preload, and main configurations. Cross-process IPC correlation is explicitly out
of scope for this release.

## Approach

Ship two optional companion workspace packages while retaining `loxer` as the zero-build-tool runtime
package.

> Replan: ~~Support Babel 7.23+ and Babel 8 through a dual peer range and compatibility matrix.~~
> The plugin is greenfield and build-time only, so it will require Babel 8 and Node 22.18+.

1. `babel-plugin-loxer-trace` is the canonical transformer. It declares `@babel/core@^8` as a peer
   dependency and uses only Babel's public plugin visitor API (`api.types`) rather than direct
   parser/traversal/generator dependencies. Its stricter Node 22.18+ engine applies only to this
   companion build tool; Loxer's Node 20+ runtime contract remains unchanged. It begins at `0.1.0`
   and declares a peer range for the Loxer version that introduces `loxer/trace`.
2. `vite-plugin-loxer-trace` is a thin Vite adapter around that canonical transformer. It runs as an
   early transform, filters source modules, passes filename/TSX/JSX parser support and Vite source-map
   settings to Babel, and returns the transformed code/map. It contains no independent AST rewrite.
   Vite's subsequent Oxc React transform continues to own React Refresh and JSX-specific work. It is
   released independently, also beginning at `0.1.0`, and depends on a compatible Babel plugin range.
3. Share an instrumentation contract rather than an AST abstraction: the typed marker/options,
   diagnostics, generated-runtime semantics, and executable fixture corpus define identical behavior
   across adapters. A future native Oxc adapter may implement that contract only if profiling or
   non-Vite Oxc adoption justifies eliminating Babel's extra parse/print pass.

Use `trace(target, options)`, imported from `loxer/trace`, as the typed, valid-TypeScript marker
placed beside a named function binding. The marker module exposes the existing trace option shape for
autocomplete; the plugin recognizes the imported `trace` call and removes it after transforming its
bound function. This preserves ordinary function declarations and avoids unsupported function-decorator
syntax. A missing transform must fail loudly during development rather than silently running untraced
code.

Define `TraceOptions` as shared parity between function and method trace modes:
`moduleId`, `level`, `highlight`, open/close message variants and formatters, and argument/result item
capture. `className.functionName` renders the class and method name for decorators and falls back to
the function name for plain functions. Infer open formatter callbacks from the marked function's actual
argument tuple and close formatter callbacks from its awaited result. On an uncaught throw or rejection,
emit the original error, close with `<functionName> failed`, and rethrow the original value. Formatter
exceptions and values that cannot be serialized for a result message must fall back to the default trace
message rather than altering application behavior.

For each marked sync or Promise-returning function, the canonical transform injects an invocation-local
numeric box ID, wraps the original body in a result-preserving success/failure boundary, and emits
open, linked entries, error, and close through the existing Loxer API. Separate synchronous and async
wrappers preserve the original `this`, `arguments`, return timing, return value, and thrown/rejected
value. For async functions the wrapper awaits the original body before computing success metadata and
closing; for sync functions it returns the original result synchronously. The transform targets only
direct `Loxer` calls and documented modifier chains in the marked function's lexical body; separately
declared helpers, detached callbacks, aliased imports, generators, and async generators remain
ordinary logs or functions in v1 and are documented as such. Instrumented nested functions receive
their own IDs and boxes.

Keep generated operations on `Loxer.of(id)` rather than a cached `OpenedLox` method object. That
reuses the core's existing module/level, queueing, disabled-mode, history, and closed-box validation.
Refactor shared `TraceOptions` typing out of the decorator-only module as needed so the marker
and decorator describe the same options without changing the legacy decorator's behavior. Make
`Loxer.init()`'s inferred environment safe when `process` is absent so the runtime can execute in a
Vite/Electron renderer when callers do not pass `dev` explicitly.

## Critical files

- `package.json` - retain the runtime package as Babel-free; add workspace-aware scripts and only the
  development dependencies needed to build/test the companion packages.
- `pnpm-workspace.yaml` - register the new companion packages without changing the published `loxer`
  runtime package boundary.
- `packages/babel-plugin-loxer-trace/package.json` and `src/` - publish the canonical ESM Babel 8
  plugin, typed marker entry point, Node 22.18+ engine/peer requirements, source-map-preserving
  transform, and the shared instrumentation contract.
- `packages/vite-plugin-loxer-trace/package.json` and `src/` - publish the optional Vite adapter that
  delegates every transformation to the canonical Babel plugin and supports TS/TSX/JSX source files.
- `src/decorators/trace.ts` and a new shared tracing-types module under `src/` - move/re-export the
  public trace option types needed by the marker while preserving existing `@trace` API behavior.
- `src/trace.ts`, `src/index.ts`, and package exports - expose the typed `trace` marker at
  `loxer/trace` and shared trace option types without making Babel/Vite implementation code a
  runtime dependency of `loxer`.
- `src/Loxer.ts` - make inferred development-mode detection safe in browser-like environments while
  preserving explicit `dev` configuration and Node behavior.
- `test/decorators.test.ts`, `test/boxed.test.ts`, `test/initialization.test.ts`, plus new companion
  package fixture tests - preserve legacy behavior and exercise transformed sync/async/error/nesting
  behavior against real Loxer callbacks.
- `documentation/index.md` and new task-focused instrumentation documentation - explain the marker,
  Babel and Vite/Electron setup, source-map/order requirements, supported call forms, and the
  no-implicit-parent-context boundary.

## Risks & open questions

- none

## Verification

- Run the root `pnpm build`, `pnpm lint`, and `pnpm test` gates after core/type/documentation changes.
- Add Babel fixture tests that transform and execute marked TypeScript functions, asserting exact Loxer
  callback records for sync success, synchronous throw, async fulfillment, rejection, overlapping
  invocations, nested marked functions, direct `log`/`error`/`namedError`, and fluent modifiers.
- Assert return values, `this`, thrown/rejected values, close/error ordering, per-invocation IDs,
  elapsed-time behavior, disabled mode, hidden levels, and pre-init queue replay against the existing
  logger callbacks.
- Cover every supported `TraceOptions` message/item mode, the fixed failure close message, formatter
  exceptions, and cyclic/non-serializable result values without changing application behavior.
- Run the canonical plugin against Babel 8 on Node 22.18+ and the current active Node LTS; assert the
  companion package rejects unsupported runtime/Babel combinations with an actionable diagnostic.
- Add Vite adapter integration fixtures for `.ts` and `.tsx`, asserting the Babel pre-transform and
  subsequent Oxc React transform coexist, source maps remain usable, and both development transform
  and production build paths succeed. Configure an electron-vite fixture for renderer/preload/main
  and verify each process can opt in independently.
- Verify a browser-like execution path with no global `process`, plus explicit `Loxer.init({ dev })`,
  so Electron renderer support is not dependent on Node integration.
