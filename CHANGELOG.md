# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `OutputLoxRenderer` and `ErrorLoxRenderer` to build reusable plain and ANSI-colored output
  templates from a log or error. Custom destinations can compose module, message, timing, box,
  props, stack, and open-log context for their own transport, while the development console uses the
  same templates. Each template carries the moment of the log twice, so a destination prints whichever
  suits it: `time` is the time of day (`HH:MM:SS`), `timeStamp` the full date and time
  (`YYYY-MM-DD HH:MM:SS`). The development console prints `time`.
- Add `Loxer.warn()`, `Loxer.info()` and `Loxer.debug()` — a log states its level in the call that
  emits it, and each one also opens a box (`Loxer.debug.open('query')`). `Loxer.log()` writes at
  `'info'`, and `warn()` is an ordinary log, so only `error()` emits an event of `kind: 'error'`.
- Add `warn()`, `info()` and `debug()` to `Loxer.of(id)`, so a log inside a box can carry a level of
  its own and report it to the output stream and the history; bare `add()` takes the box's level,
  and `close()` always does. A log's own level decides whether it is written, inside a box as much
  as outside one — raising a module to `'warn'` still shows a warning written inside an `'info'`
  box, without box membership, the way an assigned error is shown. So tracing at `'info'` and
  filtering at `'warn'` stay independent.
- Add build-time tracing for plain functions: mark a function with a `trace` marker from
  `loxer/trace` — `trace.info(placeOrder)` — and it opens and closes its own box, capturing
  arguments, result and thrown errors — no decorator and no class needed. The transform ships as
  `babel-plugin-loxer-trace` (Babel 7.26.10+ or 8) or `vite-plugin-loxer-trace` (Vite 5–8), and
  Loxer calls written inside a traced body are linked to that function's box automatically. The Vite
  plugin also contributes `optimizeDeps.include` and `resolve.dedupe` entries for `loxer` and
  `loxer/trace`, so the import it injects cannot trigger a mid-session dependency re-optimization;
  set its `dedupe: false` to own that configuration yourself.
- Add fluent configuration for the plain-function marker: `.m()` / `.module()` select the module,
  `.h()` / `.highlight()` highlight both the open and the close message — or one side with
  `.h('open')` / `.h('close')`, where a failed call highlights as a close — `.props(target)` attaches
  the captured arguments and result and `.pp(target | options)` asks the built-in output to render
  them — each routed to the `'args'`, `'result'` or `'argsResult'` side — and a level terminal (`error()`, `warn()`, `log()`, `info()`
  or `debug()`) both names the box level and marks the target:
  `trace.m('ORD').props('args').pp({ target: 'args', depth: 1 }).debug(placeOrder)`. The marker's
  option object carries what the build reads: `name`, `openMessage` and `closeMessage`.
- Add tracing of several functions from one marker: `trace.m('ORD').info([placeOrder, ship])`
  evaluates the shared options once and still gives each target its own box.
- Add inline function trace markers: `trace.info((...) => ..., options)` traces an
  expression-position function literal, and first-statement `trace.info(options)` traces its
  enclosing function without wrapping it, so callbacks can stay inline for React hooks. Use the
  `name` option when a function has no inferable name.
- Add `trace.point` for one context-aware log inside a named function without opening a trace box.
  Use the same fluent module, level, highlight, and props-printing controls as `trace`, and choose
  an ordinary message, a `fn` / `parent.fn` prefix, or a callback that composes the supplied
  function-name printers. A point inside a traced function joins that function's box; one elsewhere
  remains a single unboxed log.
- Add type-safe module ids: augment `LoxerModuleRegistry` with the keys of your modules and
  `Loxer.m()`, `Loxer.module()`, `Loxer.getModuleLevel()` and the trace marker's module selectors
  accept only those ids plus the built-ins — autocompleted, with a compile error on a typo. Leaving
  the registry untouched keeps a module id an ordinary `string`.
- Add registered direct module shortcuts to the plain-function trace marker: use
  `trace.PROJECTS.info(loadProjects)`, bracket access for non-identifier keys, or a typed computed
  selector. Keep `.m()` / `.module()` for runtime-selected and reserved module ids.
- Hold the `modules` of `Loxer.init()` to that same registry (`RegisteredModules`): a registered id
  the object does not define, and an id it defines without registering, are both compile errors —
  the second one even when the object is declared elsewhere and passed in as a variable. Declare
  that object with `satisfies LoxerModules`; a `: LoxerModules` annotation replaces its keys with an
  index signature and cannot be checked.
- Export the types needed to name Loxer's own surface — `OutputLox`, `ErrorLox`, `LoxerOptions`,
  `Module`, `LoxerModules`, `LoxerOutputEvent`, `LoxerOutputStream`, `LoxerConfig`,
  `LoxerOutputRendererOptions`, `LoxerColorOptions`, `OutputLoxTemplate`, `ErrorLoxTemplate`,
  `OfLoxes`, `OpenedLox`, `ExtendedModule`, `LoxType`, `BoxLayoutStyle`, `PropsPrinterOptions`,
  `ErrorType`, `LogLevel`, `BoxLevel`, `ModuleId` and `DefaultModuleId` — so an
  `output(event: LoxerOutputEvent)` stream can be annotated without reaching into the package's
  internals.
- Add **props**: every argument after a logging method's message is attached to the log as one of its
  `props`, in order and by reference, and reaches the output stream and `Loxer.history` untouched.
  `Loxer.log('restoring order', payment, cart)` carries two; `lox.props` is always an array, so a
  callback needs no guard.
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
- Add `Loxer.namedError(name, message, ...props)` to the exported `LogMethods` surface. It existed at
  runtime but appeared in no type, so calling it was a compile error.
- Add colored function names, parents, and captured values to trace messages in the built-in console
  while keeping the message received by the output stream and stored in history free of ANSI escapes.

### Changed

- Reorganize internal runtime, output, and tracing modules while preserving the public package API.

- **Breaking:** Replace `Loxer.init({ callbacks: { devLog, prodLog, devError, prodError } })` with
  one `output(event)` stream on the options root. Narrow the event's `environment` (`'dev'` /
  `'prod'`) and `kind` (`'log'` / `'error'`) fields to handle it — an error event also carries its
  own history snapshot — and use `OutputLoxRenderer` or `ErrorLoxRenderer` when the destination
  needs Loxer's plain or colored presentation.
- **Breaking:** Move console color, close-title opacity, and default box-layout preferences from
  `LoxerConfig` to renderer options. Output destinations choose their own plain or ANSI
  presentation and fallback box layout without changing event data. `ANSIFormat.colorLox` takes those
  as one options object (`colorLox(lox, { moduleOpacity, colors })`) in place of its `opacity` and
  `highlightColor` parameters, and returns the box time consumption as `timeConsumption` rather than
  `timeText` — the name the output templates use — alongside the added `timestamp` and `time` fields.
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
  `PropsPrinter.of(lox).print(...)`; and the box glyph reads `┃ props>` / `<props`.
- **Breaking:** Attach a traced call's arguments as one prop each rather than as the single array
  `argsAsItem` produced, so `.props('args')` gives a callback `lox.props[1]` for the second
  argument. The result stays one prop, and a `void` function attaches none rather than a literal
  `undefined`.
- **Breaking:** Drop `existingError` from `Loxer.namedError` and `Loxer.of(id).namedError`. An
  optional `unknown` in front of a rest parameter cannot be told apart from a prop, so omitting it
  silently wrapped the caller's first prop into the error message with no diagnostic:
  `namedError('E', 'msg', payment)` produced `'msg =[Error]=> [object Object]'`. Wrapping an error
  that was caught keeps the explicit path `NamedError` already documents:
  `Loxer.error(new NamedError(name, message, existing), ...props)`.
- **Breaking:** Read the props printer's `depth` with an absent option, not `0`, as "unlimited", so
  `depth: 0` is a usable limit that summarizes even the outermost object as `{n entries}`.
  `ItemOptions.depth` stored and compared `0` while its documentation promised `infinity`, which
  left no way to ask for the shallowest rendering.
- Bound PropsPrinter recursion at 100 levels, public box-layout depth at 200, and indentation at 20
  spaces per level, so pathological caller data cannot overflow the stack or allocate unbounded
  layout strings. Finite numeric options are truncated and clamped; non-finite values use defaults.
- Escape control characters in every log message. A `\n` or `\t` in a message left the box column
  open from the second line on, split the single-line `OPEN_LOGS` summary, and limited highlight
  coloring to the first line.
- **Breaking:** Remove `closeMessage: 'prettyResult'`; a result that needs multi-line rendering uses
  the marker's `.props('result')` with `.pp('result')` so it stays connected to the trace box safely.
- **Breaking:** Take a log's level as one of the names `'error' | 'warn' | 'info' | 'debug'`
  (`LogLevel`) instead of the numbers `0`–`3`. `Module.devLevel` / `prodLevel`,
  `LoxerOptions.defaultLevels` and `lox.level` accept names only, so an old numeric literal is a
  compile error rather than a value that quietly means something else.
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
- **Breaking:** Replace trace message styles with `fn`, `parent.fn`, and parent-plus-payload forms.
  Migrate `functionName` to `fn`, `className.functionName` to `parent.fn`, `types` to `fn(types)`,
  `args` to `fn(args)`, and `result` to `fn(result)`; use the matching `parent.fn(...)` form to
  include a parent with arguments, types, or a result. An omitted `openMessage` is `parent.fn`,
  where it used to be the function name alone, and an omitted `closeMessage` stays `fn`. A parent is
  the owning class or, for a marked plain function, the source file, with a bare function name when
  none is known.
- **Breaking:** Change trace message callbacks to receive a context object. Migrate open callbacks
  from `(args) => ...` to `({ args, fn, parentFn }) => ...` and close callbacks from `(result) => ...`
  to `({ result, fn, parentFn }) => ...`; the printers render the same colored call form as the
  built-in templates.

### Removed

- **Breaking:** Remove the `@trace` and `@initLoxer` decorators. Tracing is a build-time feature:
  replace `@trace()` on a method with a `trace` marker from `loxer/trace` and the Babel or Vite
  transform, which reaches plain functions, private and static methods, getters and setters, links
  the `Loxer` calls written inside the traced body into that call's box, and infers formatter types
  from the target. Replace `@initLoxer()` with a plain `Loxer.init(options)` call. A project with no
  build step traces by hand with `Loxer.open()` and `Loxer.of(id).close()`. `experimentalDecorators`
  is no longer needed to consume Loxer, and `TraceOptions` now names the marker's option object
  (`name`, `openMessage`, `closeMessage`) and is exported from `loxer/trace` rather than the package
  root, alongside `TraceCallPrinter`, `TraceOpenMessageContext` and `TraceCloseMessageContext`.
- **Breaking:** Remove the `.level()` / `.l()` chain modifiers and the `LevelType` / `LogLevelType`
  types. Use `Loxer.warn/info/debug(msg)` in place of `Loxer.l(n).log(msg)`,
  `Loxer.debug.open(msg)` in place of `Loxer.l(3).open(msg)`, and `Loxer.of(id).debug(msg)` in place
  of `Loxer.l(3).of(id).add(msg)`; `LogLevel` replaces both types, and `BoxLevel` is the subset a
  box can open at.

### Fixed

- Fix props rendering of malformed or hostile runtime values so a null-prototype object, throwing
  accessor, proxy, or invalid date cannot interrupt logging or inject terminal controls.
- Fix logs from duplicate same-major Loxer module copies becoming stuck before initialization, so
  configuration, history and open boxes remain shared within one JavaScript realm.
- Warn when logs remain queued before `Loxer.init()` or exceed the startup queue limit, instead of
  silently retaining them indefinitely.
- Fix `Loxer.init({ defaultLevels })` permanently rewriting the built-in modules for the rest of the
  process: the levels were written into a shared object, so one init leaked into every later one and
  survived `resetLoxer()`.
- Fix a prop's connector box branching off the wrong column, so it never lined up with the log it
  belonged to; the misalignment grew with nested and overlapping boxes.
- Fix `RangeError: Invalid array length` when logging a value of 50 characters or more on the `NONE`
  module.
- Fix a stack overflow when logging a self-referencing object or array with no explicit depth; a
  back-edge renders as `[Circular]`.

[unreleased]: https://github.com/pcprinz/loxer/compare/v2.0.0...HEAD
