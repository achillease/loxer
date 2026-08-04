# Spec: Log Props — Free-Typed Values with Opt-In Printing

> Grounding: architect (domain) consulted · web-researcher (findings) consulted

## Frame the problem

Loxer lets a caller attach a runtime value to a log so it can be inspected without a debugger, and
renders that value into the box layout with no configured depth limit, a 100-level safety limit,
indent indicator lines, and key
filtering. The capability is good and almost nobody reaches it. Seven concrete obstacles stand
between a developer and using it habitually.

**The reuse path the guides teach does not exist.** `documentation/item.md:67` and
`documentation/index.md:735` both instruct users to call `Item.of(lox).prettify(...)` inside their own
output callback. `src/index.ts:13` exports only the two types, `ItemOptions` and `ItemType`; the class
itself is exported from no public entry point and `package.json` offers no `./core` subpath. A
consumer following the documentation cannot import the thing the documentation names.

**Registering an output callback silently turns rendering off.** `Item.prettify` is called in exactly
two places, `src/core/OutputStreams.ts:73` and `:111`, and both are the branch taken only when no
`devLog` / `devError` callback is registered. Registering a callback — the documented production
integration point — stops all rendering, and the escape hatch above is unreachable.

**Only one value fits, and a second one is swallowed without a diagnostic.** A log carries a single
`item` field (`src/loxes/Lox.ts:32`). `ItemOptions` is six all-optional fields
(`src/core/Item.ts:19-41`), so in `Loxer.log('msg', a, b)` almost any object `b` is assignable to the
options slot. It is then handed to the printer as configuration, read for `depth` / `keys`, and never
printed. The value is dropped on the floor and nothing warns.

**The slots are order-locked.** Options are unreachable without naming a value, and a value is
unreachable without a message. A caller who wants only `{ depth: 1 }` must still pass both.

**The error methods cannot follow a "first argument is the message" rule.** `error(error, item?,
itemOptions?)` reserves position 0 for an `ErrorType`, and `ErrorType` includes
`Record<string | number, unknown>` (`src/types.ts:521`) — a plain object — so arity and position
cannot tell an error from a value. `namedError` is worse: the value sits in slot 4 behind
`existingError?: unknown`, which swallows anything, so a caller who omits it shifts their value into
the error slot with no type error.

**The highest-volume producer has no configuration at all.** `@trace` and the `trace()` marker capture
arguments and results through two capture booleans
(`src/tracing-types.ts:121-124`), and both runtimes call `.open(message, item)` / `.close(message,
item)` with two arguments only (`src/trace.ts:199`, `:212`; `src/decorators/trace.ts:100`, `:113`,
`:126`). The options slot is unreachable from a trace, so a traced function's whole argument list
renders with no configured depth limit and no way to bound it.

**Attaching data is not consequence-free.** Today a value that reaches a log is rendered by the
built-in output. A developer who wants structured data available to a callback cannot have it without
also accepting console noise on every call, so values get attached sparingly and defensively rather
than as a matter of course.

### What this rework establishes

The concept is renamed from *item* to **props** and becomes plural, free-typed, always-attached data
that the built-in output renders only when the call asked for it:

- A log carries `props: unknown[]`, collected from rest parameters. `Loxer.log('restoring order',
  payment, cart)` attaches two props; every prop reaches `devLog` / `prodLog` / `devError` /
  `prodError` and the history unchanged.
- Attaching props renders nothing by default. The built-in console output renders them when — and
  only when — the call chained `Loxer.printProps(...)`. Chaining it with no argument, or with an empty
  object, still means *render*; the argument carries formatting configuration, not the decision.
- Formatting configuration leaves the argument list entirely and lives on that chainable call. This is
  forced, not preferred: `(message, ...props, options?)` is not expressible in TypeScript
  (`TS1266: An optional element cannot follow a rest element`, measured against this repo's
  `typescript@6.0.3`). A *required* trailing tuple element compiles and is genuinely typechecked, but
  makes options mandatory on every call. Moving them onto the chain removes the ambiguity by
  construction rather than negotiating with it.
- The first argument accepts any value and is stringified when the log is created. `lox.message` stays
  a `string`, so box layout, history, ANSI coloring, trace messages and `ErrorLox.openLoxes` are
  untouched. A primitive stringifies via `String()`; a non-primitive renders as a single compact line
  through the props printer, so `Loxer.log(payment)` produces a readable message instead of
  `[object Object]`.
- The printer becomes public API — a named class with a static entry and a method returning a string —
  so a callback author can render props on demand, which is what makes opt-in printing usable at all.
- Traced calls join the same model: captured arguments and results become props, and a trace can
  request rendering and configure it.

Loxer 3.0.0 is unreleased (npm `latest` is 2.0.0), so this lands as a clean design with no dual
surface: the positional `item` / `itemOptions` parameters are replaced outright, recorded as one more
Breaking entry in the existing `[Unreleased]` CHANGELOG section and a row in the "Migrating from
Loxer 2" appendix.

### Naming

One noun throughout, replacing "item" everywhere it appears: `lox.props`, `Loxer.printProps(...)`,
`PropsPrinter`, `PropsPrinterOptions`, the trace options `argsAsProps` / `resultAsProps`, the box glyph
`┃ props>`, and the guide `documentation/props.md`. `PropsPrinter` rather than `PropsFormatter`
because the vocabulary must stay single-meaning: the chainable call states an intent to *print*, and
the class is what the printing path uses.

`printProps` carries the short alias `pp`, following `highlight` / `h` and `module` / `m`: the long
name and the alias are the same modifier, and `Loxer.pp({ depth: 1 }).m('ORD').log(...)` reads as one
chain.

### In scope

- The `props` rest-parameter surface on every logging entry point: `Loxer.log`, `warn`, `info`,
  `debug`, their `.open()` forms, `Loxer.open`, `Loxer.error`, `Loxer.namedError`, and all of
  `.of(id)`'s members (`add`, `warn`, `info`, `debug`, `close`, `error`, `namedError`), including the
  dead-box and disabled variants.
- `Loxer.printProps(...)` as chainable one-shot modifier state alongside `highlight` and `module`.
- Freely-typed first argument with stringification at log creation.
- `PropsPrinter` and `PropsPrinterOptions` exported from `src/index.ts`.
- The built-in console output rendering props only on request.
- `TraceOptions` gaining props rendering and configuration.
- The rename across `src/`, `test/`, `playground/`, `documentation/`, and the CHANGELOG.

### Out of scope

- `printf`-style format specifiers (`%s`, `%d`, `%o`, `%c`, `%j`). Loxer's rest arguments are
  structured data, not interpolation values. Node's `util.format` / `util.inspect` are also
  unavailable: Loxer ships zero runtime dependencies and the browser is a live target
  (`examples/vite-trace-demo`, the Vite and Babel plugin packages), and the two runtimes disagree on
  `%c` and `%j` anyway.
- Any change to `lox.message`'s type, to box layout geometry, or to level/threshold semantics.
- A separate package entry point for the printer; it belongs on the main surface next to `ANSIFormat`
  and `BoxFactory`.
- Sticky or init-level props defaults. `printProps` is one-shot like `highlight` and `module`.
- Changes to `packages/babel-plugin-loxer-trace` and `packages/vite-plugin-loxer-trace`, which clone
  the trace options AST opaquely and have no props coupling.

## Acceptance criteria

**Props as data**

- [ ] `Loxer.log('msg', a, b, c)` attaches all three values, in order, to the log's `props` array; a
      registered `devLog` callback receives them unchanged and none is consumed as configuration.
- [ ] `Loxer.log('msg')` yields an empty `props` array, not `undefined`, so a callback can read
      `lox.props.length` without a guard.
- [ ] Props are attached identically by every entry point listed in scope, including `.of(id)` on a
      dead box, and are dropped only when `Loxer` is disabled.
- [ ] A prop is passed by reference to callbacks and history without being cloned, stringified, or
      otherwise transformed at capture.

**Opt-in printing**

- [ ] With no `devLog` callback registered, `Loxer.log('msg', payment)` prints the message and no
      props block.
- [ ] With no `devLog` callback registered, `Loxer.printProps().log('msg', payment)` prints the
      message followed by the rendered props block, connected to the log's box column.
- [ ] `Loxer.printProps({})` renders identically to `Loxer.printProps()` — an empty configuration
      object is a render request, not a no-op.
- [ ] `Loxer.printProps({ depth: 1 })` renders with that depth; every field of
      `PropsPrinterOptions` is honored when passed this way.
- [ ] Falsy props (`false`, `0`, `''`, `null`, `undefined`) are rendered when printing was requested.
      An explicit request is honored regardless of the value's truthiness, replacing the
      truthiness gate at `src/core/OutputStreams.ts:70` and `:108` and the test that locks it
      (`test/item.test.ts:76-83`).
- [ ] `printProps` resets after one logging operation, like `highlight` and `module`: a second log
      issued without re-chaining it renders nothing.
- [ ] `printProps` composes with the other modifiers in any order — `Loxer.h().m('ORD').printProps()`
      and `Loxer.printProps().m('ORD').h()` behave identically — and cannot be chained twice.
- [ ] `Loxer.pp(...)` is accepted everywhere `Loxer.printProps(...)` is, with identical behavior and
      identical chaining restrictions, and appears on the exported modifier surface alongside
      `h` / `m`.
- [ ] A registered `devLog` / `devError` callback receives the raw lox and is never handed rendered
      text, whether or not printing was requested; `prodLog` / `prodError` still receive no normal
      logs at all.

**Freely-typed first argument**

- [ ] `Loxer.log(42)`, `Loxer.log(true)`, `Loxer.log(null)` and `Loxer.log(Symbol('name'))` compile
      and produce their `String()` form as `lox.message`.
- [ ] `Loxer.log(payment)` compiles and produces a single-line rendering of the object as
      `lox.message`, with no line breaks that would corrupt the box layout, and does not
      additionally attach `payment` as a prop. A function first argument renders as
      `[Function: name]`, never its source text.
- [ ] `lox.message` contains no control characters — a first argument that stringifies with a `\n`
      or `\t` is escaped the way `sanitizeErrorMessage` already escapes an error message, so no
      message can break the box column.
- [ ] `lox.message` is typed `string` and is never `undefined`; nothing downstream of it changes.
- [ ] `Loxer.log()` with no arguments produces an empty message. `Loxer.log(undefined)` also
      produces an empty message rather than `'undefined'`: a default parameter cannot distinguish
      an omitted argument from an explicit `undefined`, and keeping the documented
      `(message?, ...props)` shape is worth more than that distinction.

**Error methods**

- [ ] `Loxer.error(err, a, b)` keeps position 0 as the error and attaches `a` and `b` as props; the
      error is never reinterpreted as a message and a prop is never reinterpreted as the error.
- [ ] `Loxer.namedError(name, message, a, b)` attaches `a` and `b` as props. `existingError` is
      **removed** from the signature: a rest parameter cannot rescue an optional `unknown` in front
      of it — TypeScript still binds the third argument to `existingError`, so omitting it silently
      wraps the caller's first prop into the error message with no diagnostic. Wrapping an existing
      error keeps the explicit path `NamedError`'s own JSDoc already teaches,
      `Loxer.error(new NamedError(name, message, existing), ...props)`.
- [ ] `Loxer.namedError('E', 'msg', payment)` attaches `payment` as a prop and leaves the error's
      message exactly `'msg'` — the case that silently produced
      `'msg =[Error]=> [object Object]'` before.
- [ ] An error log's props are rendered by the built-in `devError` output on request and not
      otherwise, on the same rule as normal logs.
- [ ] `Loxer.namedError` appears on the exported `LoxerType` surface, so a consumer can call it
      without a compile error.

**Public printer**

- [ ] `import { PropsPrinter, type PropsPrinterOptions } from 'loxer'` resolves, and the class's
      static entry accepts any `OutputLox` / `ErrorLox` and returns a string from its rendering
      method.
- [ ] A callback author can reproduce the built-in output's props block using only exports from
      `'loxer'` — no deep import, verified by a scratch consumer compiled and run against `dist/`.
- [ ] `PropsPrinter` renders a cyclic structure as `[Circular]` without exceeding the stack, and
      renders a class graph without recursing indefinitely.

**Tracing**

- [ ] `argsAsProps: true` attaches a traced call's arguments as its opening log's props, one prop per
      argument.
- [ ] `resultAsProps: true` attaches the resolved result as a single prop on the closing log, for
      both synchronous and Promise-returning functions.
- [ ] A traced call can request that its captured props be rendered by the built-in output, and can
      supply `PropsPrinterOptions` for that rendering — the option is reachable from `@trace`, from
      the `trace()` marker, and from a marker naming several targets.
- [ ] A trace that requests neither rendering nor configuration pays no cost for resolving either,
      matching the existing gating rule for `'parent.functionName'`; both sides of that gate are
      covered by a test.
- [ ] The `failure` path still records the original error and closes the box, with props behaving as
      above.

**Rename completeness**

- [ ] No identifier named `Item`, `ItemType`, `ItemOptions`, `item`, `itemOptions`, `argsAsItem`, or
      `resultAsItem` survives in `src/`, `test/`, `playground/`, `examples/`, or `documentation/`
      except inside the CHANGELOG's historical entries and the Loxer 2 migration appendix.
- [ ] `src/index.ts` no longer exports `ItemType` / `ItemOptions` and does export `PropsPrinter` and
      `PropsPrinterOptions`; no other member of the export surface changes.
- [ ] The box glyph reads `┃ props>` / `<props`, and the box-layout expectations covering it are
      updated rather than deleted.

## Definition of done

- [ ] All acceptance criteria met.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck:test`, `pnpm typecheck:types` and
      `pnpm demo:build` all exit 0. `pnpm typecheck:test` is mandatory here: `test/format.test.ts`,
      `test/modules.test.ts` and `test/initialization.test.ts` construct `LoxProps` with explicit
      `item: undefined, itemOptions: undefined`, and nothing else catches that break.
- [ ] Test coverage updated where the change lands, per `rules/testing.md`: `test/item.test.ts`
      renamed and rewritten for the opt-in rule — it owns the glyph assertions and the
      `NONE`-module `RangeError` regression, not `test/boxed.test.ts`, which contains no props
      references at all; `test/boxed.test.ts` only if a column position actually moves;
      `test/decorators.test.ts`, `test/trace-cases.ts`,
      `test/plain-function-trace-core.test.ts` and `test/plain-function-trace-enclosing.test.ts`
      updated for `argsAsProps` / `resultAsProps`; the falsy-props criterion driven by a `test.each`
      table rather than a loop.
- [ ] Exercised against the built trees, not only `src/`: after `pnpm build`, a `playground/*.js`
      script importing `../dist/index.js` runs green, and the Babel transform's emitted code is run
      against `dist/trace.js`.
- [ ] Finished through the consumer app: `pnpm demo` serves correctly after clearing
      `examples/vite-trace-demo/node_modules/.vite/deps`, which can otherwise go on serving a frozen
      older `dist/`.
- [ ] `playground/items.js` and `playground/OrderService.js` updated to the new surface and run
      against `dist/`; `playground/OrderService.js` still exercises every `PropsPrinterOptions` field.
- [ ] `documentation/item.md` replaced by `documentation/props.md`, written as if this had always
      been the design — no diff narration — with the `documentation/index.md` sections on items
      (`:16`, `:232-248`, `:262-264`, `:305-322`, `:645-660`, `:690-740`, `:789`, `:807-809`, `:970`,
      `:982`) rewritten to match.
- [ ] Every reference to the renamed guide updated. `README.md` and the `Loxer` class JSDoc
      (`src/Loxer.ts:51`, `:494`) link only to `index.md` and need no change; the actual references
      are the `[itemDocs]` link at `documentation/index.md:970` and the prose mention in
      `documentation/AGENTS.md:12`, neither checked at build time.
- [ ] Screenshots under `assets/docs_images/item/` regenerated or replaced; no guide references an
      image whose output the code no longer produces.
- [ ] JSDoc updated on every renamed or reshaped member, then `pnpm run docs` run (never bare
      `pnpm docs`) with typedoc's own output confirming generation and `git status` showing `docs/`
      changed.
- [ ] `CHANGELOG.md` `[Unreleased]` carries a Breaking entry for the replaced parameters and the
      renamed concept, the existing `ItemType` / `ItemOptions` line in the Added block corrected
      rather than left contradicting it, and a row added to `documentation/index.md`'s
      "Appendix: Migrating from Loxer 2".
- [ ] Anything real that this change decides to leave in place gets a `D-n` entry in
      `documentation/debt.md`.

## Settled during planning

- **Trace rendering is configured separately for arguments and results.** Each of the four trace call
  sites already builds its own modifier chain, so independent control costs two option reads rather
  than new plumbing. Because the feature then reads two options, both sides need their own test row
  or the unread one silently drops the feature for callers who named only it.
- **`PropsPrinterOptions.depth` gets a real sentinel:** absent means no caller-configured limit and
  a 100-level safety limit protects the recursive renderer; any number from `0` through that limit
  is honored literally, so `depth: 0` becomes a usable limit. This makes the JSDoc true — it claims
  `infinity` today while the code stores and compares `0` (`src/core/Item.ts:20`, `:68`, `:182`).
  The swapped `depth` / `color` descriptions in the same file's `box` parameter (`:110-119`) are
  fixed in the same pass, since regenerating TypeDoc would otherwise publish them.
- **A non-primitive first argument uses a hard single-line mode, without truncation.** The printer
  offers nothing suitable today: both short-form branches fall through to a `\n`-joined expanded
  form past 70 characters (`src/core/Item.ts:351`, `:415`), and `depth` / `keys` / `shortenClasses`
  all shrink output without guaranteeing one line. A long message is the caller's choice, as it
  already is for a long string.
- **Several props render as one block**, listed like array elements without the `[ ]` wrapper, so
  `getItemBox` and its 50-character branch keep operating on a single string. `Loxer.pp().log('msg')`
  with no props renders no block at all rather than an empty one.
- **`Loxer.namedError` drops `existingError`** — see the acceptance criteria for why a rest parameter
  cannot rescue it.

## Open questions

- none
