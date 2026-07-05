# Decorators

Decorators are optional public helpers layered on top of the singleton `Loxer` API.

## Invariants

- `@initLoxer(options)` initializes through `Loxer.init(options)`; keep it behaviorally equivalent
  to manual initialization.
- `@trace(options)` wraps a class method in an open/close box and must preserve the original return
  value.
- Promise-returning traced methods close the box after resolution and return the resolved payload.
  Current behavior does not add a catch handler; do not change rejection semantics accidentally.
- A string `trace` option is treated as `moduleId`; object options can configure module, level,
  highlight mode, message formatting, and item capture.
- Class names ending in `Class` are shortened for decorator-generated messages.

## Tests

- Update `test/decorators.test.ts` when changing generated messages, async handling, or item capture.
