# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `OutputLoxRenderer` and `ErrorLoxRenderer` to build reusable plain and ANSI-colored output
  templates from a log or error. Custom destinations can compose module, message, timing, box,
  props, timestamp, stack, and open-log context for their own transport, while the development
  console uses the same templates.
- Add public typed output events so a destination can distinguish development from production and
  normal logs from errors; error events include an independent history snapshot.

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
  `ExtendedModule`, `LoxType`, `BoxLayoutStyle`, `PropsPrinterOptions`, `ErrorType`, `ModuleId`
  and `DefaultModuleId` — so a `devLog(lox: OutputLox)` callback can be annotated without reaching
  into the package's internals.
- Add **props**: every argument after a logging method's message is attached to the log as one of its
  `props`, in order and by reference, and reaches `devLog` / `prodLog` / `devError` / `prodError` and
  `Loxer.history` untouched. `Loxer.log('restoring order', payment, cart)` carries two;
  `lox.props` is always an array, so a callback needs no guard.
- Add `Loxer.printProps(options?)` and its alias `Loxer.pp(options?)`: a one-shot modifier, alongside
  `highlight` and `module`, asking the built-in console output to render a log's props below its
  message and connected to its box column. Chaining it at all is the request — `pp()` and `pp({})`
  render alike — and the optional `PropsPrinterOptions` argument only configures the rendering. A
  value is rendered whatever its truthiness, `null` and `0` included.
- Export `PropsPrinter`, the class the built-in output renders props with, so an output callback can
  reproduce that block from the package's own surface: `PropsPrinter.of(lox).print(colored, box)`,
  plus `ofValues(values, options?)` for values that belong to no log and `singleLine(value)` for one
  value on exactly one line. Reading `lox.printProps` is what honors the call's request; a callback
  may also render unconditionally.
- Take a freely typed first argument on every logging method. A primitive is stringified, and an
  object or function renders as one compact line, so `Loxer.log(payment)`
  reads as its contents instead of `[object Object]` and a function reports `[Function: name]`.
  `lox.message` stays a `string` and never carries a control character, so no message can break the
  box column.
- Add `printArgs` and `printResult` to `TraceOptions`, so a traced call can have its captured
  arguments and its result rendered by the built-in output, configured separately per side. Each
  accepts `true` or a `PropsPrinterOptions` object.
- Add `Loxer.namedError(name, message, ...props)` to the exported `LogMethods` surface. It existed at
  runtime but appeared in no type, so calling it was a compile error.

### Changed

- **Breaking:** Replace the separate `devLog`, `prodLog`, `devError`, and `prodError` callbacks with
  one `output(event)` stream. Narrow its `environment` and `kind` fields to handle an event, then
  use `OutputLoxRenderer` or `ErrorLoxRenderer` when the destination needs Loxer's plain or colored
  presentation.
- **Breaking:** Move console color, close-title opacity, and default box-layout preferences from
  `LoxerConfig` to renderer options. Output destinations now choose their own plain or ANSI
  presentation and fallback box layout without changing event data.

- **Breaking:** Replace the positional `item` / `itemOptions` parameters with **props**. Every
  logging entry point — `Loxer.log`, `warn`, `info`, `debug`, their `.open()` forms, `Loxer.open`,
  `Loxer.error`, `Loxer.namedError` and every member of `Loxer.of(id)` — takes
  `(message?, ...props)`, with `error` keeping an `ErrorType` in position 0. Rendering moves onto the
  chain: `Loxer.log(msg, item, options)` becomes `Loxer.pp(options).log(msg, item)`, and a log that
  does not chain `printProps` renders nothing while still carrying its values. This fixes three
  things at once: a second value is no longer swallowed as configuration (`ItemOptions` was six
  optional fields, so almost any object bound to that slot, was read as options, and was never
  printed); configuration is reachable without naming a value; and a falsy value is rendered like any
  other, where the old truthiness gate dropped `0`, `null`, `false` and `''`.
- **Breaking:** Rename the concept from *item* to *props* throughout. `lox.item` / `lox.itemOptions`
  become `lox.props` / `lox.printProps`; the `ItemType` and `ItemOptions` exports are replaced by
  `PropsPrinterOptions` (`ItemType` has no successor — a prop is `unknown`); the `Item` class becomes
  the exported `PropsPrinter` and `Item.of(lox).prettify(...)` becomes
  `PropsPrinter.of(lox).print(...)`; the box glyph reads `┃ props>` / `<props`; and the
  `TraceOptions` capture flags become `argsAsProps` / `resultAsProps`.
- **Breaking:** Attach a traced call's arguments as one prop each rather than as a single array, so
  `argsAsProps` gives a callback `lox.props[1]` for the second argument. `resultAsProps` stays one
  prop, and a `void` function attaches none rather than a literal `undefined`.
- **Breaking:** Drop `existingError` from `Loxer.namedError` and `Loxer.of(id).namedError`. An
  optional `unknown` in front of a rest parameter cannot be told apart from a prop, so omitting it
  silently wrapped the caller's first prop into the error message with no diagnostic:
  `namedError('E', 'msg', payment)` produced `'msg =[Error]=> [object Object]'`. Wrapping an error
  that was caught keeps the explicit path `NamedError` already documents:
  `Loxer.error(new NamedError(name, message, existing), ...props)`.
- **Breaking:** Read `PropsPrinterOptions.depth` with an absent option, not `0`, as "unlimited", so
  `depth: 0` is a usable limit that summarizes even the outermost object as `{n entries}`. The old
  code stored and compared `0` while its documentation promised `infinity`.
- Bound PropsPrinter recursion at 100 levels, public box-layout depth at 200, and indentation at 20
  spaces per level, so pathological caller data cannot overflow the stack or allocate unbounded
  layout strings. Finite numeric options are truncated and clamped; non-finite values use defaults.
- Escape control characters in every log message, not only in an error's. A `\n` or `\t` in a message
  left the box column open from the second line on, split the single-line `OPEN_LOGS` summary, and
  limited highlight coloring to the first line.
- **Breaking:** Remove `closeMessage: 'prettyResult'`; a result that needs multi-line rendering uses
  `resultAsProps` with `printResult` so it stays connected to the trace box safely.
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
- **Breaking:** Name the qualifying message style `'parent.functionName'` (`openMessage` /
  `closeMessage`), replacing `'className.functionName'`, and give every traced function a parent:
  the class of a method — a decorated one, or a method, getter, setter or field a `trace()` marker
  reaches inside a class body — and otherwise the file the marked function is written in, so a
  function in `src/orders/orderService.ts` opens as `orderService.load()`. A decorated method reads
  its class from the running instance and the file name comes from the build, so a function neither
  reaches still reports its bare name. A class name ending in `Class` reports without that suffix,
  so a method of `OrderServiceClass` reads as `OrderService.load`.

### Removed

- **Breaking:** Remove the `.level()` / `.l()` chain modifiers and the `LevelType` / `LogLevelType`
  types. Use `Loxer.warn/info/debug(msg)` in place of `Loxer.l(n).log(msg)`,
  `Loxer.debug.open(msg)` in place of `Loxer.l(3).open(msg)`, and `Loxer.of(id).debug(msg)` in place
  of `Loxer.l(3).of(id).add(msg)`; `LogLevel` replaces both types, and `BoxLevel` is the subset a
  box can open at.

### Fixed

- Fix props rendering of malformed or hostile runtime values so a null-prototype object, throwing
  accessor, proxy, or invalid date cannot interrupt logging or inject terminal controls.
- Fix `@trace` methods that throw or reject to record the original error and close their trace box
  while preserving the caller's original failure.
- Keep a Loxer the project links rather than installs out of Vite's dependency optimizer
  (`vite-plugin-loxer-trace`), and add the directory it lives in to `server.fs.allow` so Vite can
  serve it. Vite's dependency cache is keyed on the lockfile and the resolved config, so a
  pre-bundled working copy went on serving the build that was current when the cache was written —
  through every rebuild, until `node_modules/.vite` was deleted by hand. An installed Loxer is
  pre-bundled exactly as before. `server.fs.allow` is the boundary deciding which files the dev
  server serves to a browser, and Loxer's directory — outside the project, for a linked copy — is
  added to it silently, including to a list the project drew itself; only `vite dev` reads it, so a
  build or preview is unaffected. Set `dedupe: false` to keep that boundary, and the rest of the
  single-copy config, entirely your own.
- Fix logs from duplicate same-major Loxer module copies becoming stuck before initialization, so
  configuration, history and open boxes remain shared within one JavaScript realm.
- Warn when logs remain queued before `Loxer.init()` or exceed the startup queue limit, instead of
  silently retaining them indefinitely.
- Fix `vite-plugin-loxer-trace` triggering a late Vite dependency re-optimization when it injects
  `loxer/trace` into a source file.
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
- Fix `@trace`'s async `closeMessage` (`'result'` or a callback) reading the
  still-pending promise instead of the resolved value.
- Fix `@trace` dropping `highlight` when it closed an async method's box.

[unreleased]: https://github.com/pcprinz/loxer/compare/v2.0.0...HEAD
