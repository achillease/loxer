# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `Loxer.warn()`, `Loxer.info()` and `Loxer.debug()` — a log states its level in the call that
  emits it, and each one also opens a box (`Loxer.debug.open('query')`). `Loxer.log()` writes at
  `'info'`, and `warn()` goes to the `devLog` / `prodLog` stream, so only `error()` reaches
  `devError` / `prodError`.
- Add `warn()`, `info()` and `debug()` to `Loxer.of(id)`, so a log inside a box can carry a level of
  its own and report it to `devLog` / `prodLog` and the history; bare `add()` takes the box's level,
  and `close()` always does. A log's own level decides whether it is written, inside a box as much
  as outside one — raising a module to `'warn'` still shows a warning written inside an `'info'`
  box, without box membership, the way an assigned error is shown. So tracing at `'info'` and
  filtering at `'warn'` stay independent.
- Add build-time tracing for plain functions: mark a function with `trace()` from `loxer/trace` and
  it opens and closes its own box, capturing arguments, result and thrown errors — no decorator and
  no class needed. The transform ships as `babel-plugin-loxer-trace` (Babel 7.26.10+ or 8) or
  `vite-plugin-loxer-trace` (Vite 5–8), and Loxer calls written inside a traced body are linked to
  that function's box automatically.
- Add tracing of several functions from one marker: `trace([placeOrder, ship], { moduleId: 'ORD' })`
  evaluates the shared options once and still gives each target its own box.
- Add inline function trace markers: `trace((...) => ..., options)` traces an expression-position
  function literal, and first-statement `trace(options)` traces its enclosing function without
  wrapping it, so callbacks can stay inline for React hooks. Use the `name` option when a function
  has no inferable name.
- Add type-safe module ids: augment `LoxerModuleRegistry` with the keys of your modules and
  `Loxer.m()`, `Loxer.module()`, `Loxer.getModuleLevel()` and the `moduleId` trace option accept
  only those ids plus the built-ins — autocompleted, with a compile error on a typo. Leaving the
  registry untouched keeps a module id an ordinary `string`.
- Hold the `modules` of `Loxer.init()` and `@initLoxer()` to the same registry (`RegisteredModules`):
  a registered id the object does not define, and an id it defines without registering, are both
  compile errors — the second one even when the object is declared elsewhere and passed in as a
  variable. Declare that object with `satisfies LoxerModules`; a `: LoxerModules` annotation
  replaces its keys with an index signature and cannot be checked.
- Add standard TC39 / TypeScript 5 decorator support to `@trace` and `@initLoxer`, dispatched on the
  protocol the call site uses, so both work with and without `experimentalDecorators`. `@trace`
  raises a `TypeError` when applied to anything that is not a method.
- Export the types needed to name Loxer's own surface — `OutputLox`, `ErrorLox`, `LoxerOptions`,
  `Module`, `LoxerModules`, `LoxerCallbacks`, `LoxerConfig`, `OfLoxes`, `OpenedLox`,
  `ExtendedModule`, `LoxType`, `BoxLayoutStyle`, `ItemType`, `ItemOptions`, `ErrorType`, `ModuleId`
  and `DefaultModuleId` — so a `devLog(lox: OutputLox)` callback can be annotated without reaching
  into the package's internals.

### Changed

- **Breaking:** Take a log's level as one of the names `'error' | 'warn' | 'info' | 'debug'`
  (`LogLevel`) instead of the numbers `0`–`3`. `Module.devLevel` / `prodLevel`,
  `LoxerOptions.defaultLevels`, `lox.level` and `TraceOptions.level` accept names only, so an old
  numeric literal is a compile error rather than a value that quietly means something else.
  Translate `0 → 'error'`, `1 → 'info'`, `2 → 'info'` or `'debug'`, `3 → 'debug'`. Built-in modules
  log up to `'info'` in development and `'error'` in production, which is what `1` and `0` did.
- **Breaking:** Ship as ESM only — `"type": "module"` with a single `dist/` tree and no CommonJS
  build. `import 'loxer'` works everywhere; a CommonJS consumer needs Node 22+ (`require(esm)`) or a
  dynamic `import()`.
- **Breaking:** Require Node 20 or newer (`engines.node`, up from `>=10`) and compile to ES2022. As
  a consequence `NamedError` is a native class, so both `err instanceof NamedError` and
  `err instanceof Error` hold.
- **Breaking:** Return `undefined` from `Loxer.getModuleLevel()` for an unknown module id instead of
  the `-1` sentinel; its return type is `LogLevel | undefined`.
- Drop the runtime dependency on `color` — Loxer installs with zero runtime dependencies. The same
  color formats are accepted: hex, `rgb()`, `rgba()`, `hsl()`, `hwb()`, named colors and
  `transparent`.

### Removed

- **Breaking:** Remove the `.level()` / `.l()` chain modifiers and the `LevelType` / `LogLevelType`
  types. Use `Loxer.warn/info/debug(msg)` in place of `Loxer.l(n).log(msg)`,
  `Loxer.debug.open(msg)` in place of `Loxer.l(3).open(msg)`, and `Loxer.of(id).debug(msg)` in place
  of `Loxer.l(3).of(id).add(msg)`; `LogLevel` replaces both types, and `BoxLevel` is the subset a
  box can open at.

### Fixed

- Fix `Loxer.init({ defaultLevels })` permanently rewriting the built-in modules for the rest of the
  process: the levels were written into a shared object, so one init leaked into every later one and
  survived `resetLoxer()`.
- Fix a module whose `devLevel` / `prodLevel` is not one of the four level names switching its
  threshold off altogether, which let it emit everything — `debug` included — in production. An
  unrecognized threshold logs up to `'info'`.
- Fix an item's connector box branching off the wrong column, so it never lined up with the log it
  belonged to; the misalignment grew with nested and overlapping boxes.
- Fix `RangeError: Invalid array length` when logging an item of 50 characters or more on the `NONE`
  module.
- Fix a stack overflow when logging a self-referencing object or array with no explicit depth; a
  back-edge renders as `[Circular]`.
- Fix `@trace`'s async `closeMessage` (`'result'`, `'prettyResult'` or a callback) reading the
  still-pending promise instead of the resolved value.
- Fix `@trace` dropping `highlight` when it closed an async method's box.

[unreleased]: https://github.com/pcprinz/loxer/compare/v2.0.0...HEAD
