# Babel trace plugin

This module generates tracing code for consumer functions. Read `@../../AGENTS.md` and the root
testing rules before changing it.

## Always

- Preserve callable semantics: `this`, real `arguments`, `.length`, named recursion, synchronous
  and asynchronous results, and native Promise identity.
- Generate references to tracing behavior through runtime imports/helpers, never consumer-scope
  globals that a caller can shadow.
- Use the authoritative `@babel/core` and `@babel/types` types as development dependencies.
  Development-only typings preserve zero runtime dependencies without creating facsimiles that
  can drift from Babel.
- Keep published declarations Babel-independent when consumers do not otherwise need Babel
  types. A dependency-neutral compatibility type must preserve the complete pre-existing public
  result surface; explicit `any` is permitted only at this boundary when exporting Babel's
  upstream type would impose Babel typings on consumers.
- Resolve a traced function's parent statically and pass it to `__startTrace` as the trailing
  argument — the runtime renders the `parent.` message templates from it and has no other source for
  it. The
  parent is the class body member that holds the function, read with the same walk that reads the
  function's name (`enclosingClassName` beside `surroundingName` in `marker-collection.ts`), and
  otherwise the file being transformed (`fileParentName`, off Babel's filename), so a function a
  class does not hold — one declared inside a method's body, one an object literal holds, one marked
  beside its binding — reports its file. Omit the argument entirely when neither reaches the
  function; the runtime's default then renders the bare name.
- Add adversarial fixtures for hostile thrown values and shadowed globals with transform/runtime
  changes. Cover callable-semantics boundaries affected by the change.
- Run `pnpm build` and the focused trace tests (or `pnpm test` when behavior spans the runtime)
  before considering a change complete.

## Never

- Never assume transformed user code has unshadowed globals or benign values/proxies.
- Never recreate Babel AST or type APIs merely to avoid an authoritative development dependency.
