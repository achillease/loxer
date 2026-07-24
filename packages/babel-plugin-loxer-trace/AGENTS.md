# Babel trace plugin

This module generates tracing code for consumer functions. Read `@../../AGENTS.md` and the root
testing rules before changing it.

## Always

- Preserve callable semantics: `this`, real `arguments`, `.length`, named recursion, synchronous
  and asynchronous results, and native Promise identity.
- Generate references to tracing behavior through runtime imports/helpers, never consumer-scope
  globals that a caller can shadow.
- Add adversarial fixtures for hostile thrown values and shadowed globals with transform/runtime
  changes. Cover callable-semantics boundaries affected by the change.
- Run `pnpm build` and the focused trace tests (or `pnpm test` when behavior spans the runtime)
  before considering a change complete.

## Never

- Never assume transformed user code has unshadowed globals or benign values/proxies.
