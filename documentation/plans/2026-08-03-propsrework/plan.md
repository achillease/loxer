# Plan: Log Props — Free-Typed Values with Opt-In Printing

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: `documentation/specs/props-rework.md`

## Context

Loxer's `item` renders a runtime value into the box layout with unlimited depth, indent indicator
lines and key filtering. Almost nobody reaches it. The spec records seven obstacles; three are
outright defects rather than ergonomics:

- `Item` is exported from no public entry point (`src/index.ts:13` exports only the two types), yet
  `documentation/item.md:67` and `documentation/index.md:735` both instruct users to call
  `Item.of(lox).prettify(...)`. The reuse path the documentation teaches does not exist as shipped API.
- `Item.prettify` runs only on the no-callback fallback branch (`src/core/OutputStreams.ts:73`,
  `:111`), so registering `devLog` / `devError` — the documented production integration point —
  silently ends all rendering, with the escape hatch above unreachable.
- A second value is swallowed without a diagnostic. `ItemOptions` is six all-optional fields, so in
  `Loxer.log('msg', a, b)` almost any object `b` binds to the options slot, is read as configuration,
  and is never printed.

The rework renames the concept to **props** and makes it plural, free-typed, always-attached data that
the built-in output renders only on request. Loxer 3.0.0 is unreleased (npm `latest` is 2.0.0), so this
is a clean break inside the existing `[Unreleased]` CHANGELOG section, with no dual surface to carry.

## Approach

### The data shape

`LoxProps` / `Lox` replace `item: ItemType | undefined` + `itemOptions: ItemOptions | undefined` with:

```ts
props: unknown[];                              // always an array, never undefined
printProps: PropsPrinterOptions | undefined;   // undefined = not requested
```

One field carries both the decision and the configuration, which is exactly the spec's rule that an
empty configuration still means *render*. Both stay **required** members of `LoxProps` — deliberately,
because that is what makes `pnpm typecheck:test` report the nine `LoxProps` literals in
`test/format.test.ts`, `test/modules.test.ts` and `test/initialization.test.ts` instead of letting them
pass with stale field names.

The gate in `src/core/OutputStreams.ts:70` and `:108` changes from `if (lox.item)` to
`if (lox.printProps)`. The `depth` / `color` box wiring above it
(`module.slicedName.length + BoxFactory.getMarkerDepth(box)`, `module.color`) stays byte-identical.
Moving the decision off truthiness is what fixes falsy props: an explicit request is honored whatever
the value.

The lox must keep carrying the options, for two independent reasons — `OutputStreams` and a callback
author both see only the lox, and the pre-init replay path hands a stored `Lox` back to
`switchOutput` long after the chain state was cleared.

### The modifier

`Modifiers<Delete extends string>` (`src/types.ts:571-630`) is already generic and n-ary: each member
returns `LogMethods & Omit<Modifiers<Delete | k>, Delete | k>`. A third member is mechanical and gets
order-independence and the no-re-chain restriction for free:

```ts
type pp = 'pp' | 'printProps';
pp(options?: PropsPrinterOptions): LogMethods & Omit<Modifiers<Delete | pp>, Delete | pp>;
printProps(options?: PropsPrinterOptions): LogMethods & Omit<Modifiers<Delete | pp>, Delete | pp>;
```

Runtime side mirrors `h` / `m` exactly: a private `_printProps` field, both methods returning `this`,
and the field cleared in `resetState()` (`src/Loxer.ts:124-127`) so it cannot leak into a later log —
including on the `switchOutput` path and the pre-init queue path.

### Signatures

Every logging entry point takes `(message?: unknown, ...props: unknown[])`, with `error` keeping an
`ErrorType` in position 0 and `namedError` becoming `(name, message, ...props)`.

Dropping `existingError` from `namedError` is forced, not tidying: with
`(name, message, existingError?: unknown, ...props)` TypeScript still binds the third argument to
`existingError`, and `unknown` accepts anything, so omitting it wraps the caller's first prop into the
error message with no diagnostic. Wrapping an existing error keeps the explicit path `NamedError`'s own
JSDoc already teaches (`src/core/Error.ts:19-20`) — `Loxer.error(new NamedError(name, msg, existing),
...props)` — which is literally what `Loxer.namedError` delegates to today (`src/Loxer.ts:221-229`).

`Loxer.namedError` is also promoted onto the exported `LoxerType`; it exists at runtime but appears
nowhere in `LogMethods`, so calling it is a compile error for a consumer today.

`Loxer.log(undefined)` produces an empty message, not `'undefined'`. A default parameter cannot
distinguish an omitted argument from an explicit `undefined`, and keeping the documented
`(message?, ...props)` shape — which tells a caller that the first argument is the message and the rest
are props — is worth more than that distinction.

### Stringifying the first argument

Primitives take `String()`. `null` is spelled `'null'` explicitly rather than falling into the
`typeof v === 'object'`
branch. Functions go to the printer, which yields `[Function: name]` rather than the whole source body.

Everything else needs a **hard single-line mode**, which is new capability, not configuration: both
short-form branches fall through to a `\n`-joined expanded form past 70 characters
(`src/core/Item.ts:351`, `:415`), and `depth` / `keys` / `shortenClasses` all shrink output without
guaranteeing one line. An internal flag that makes `printArray` / `printObject` skip the `< 70` test and
always take the short branch is the smaller of the two available shapes — a post-hoc
`replace(/\n\s*/g, ' ')` strands `┊` indent glyphs mid-line unless `showVerticalLines` is also forced.

On top of that, the stringified result is run through the control-character escaping that
`sanitizeErrorMessage` (`src/core/Error.ts:67-72`) already applies to error messages. That makes the
single-line guarantee unconditional rather than dependent on the printer's branch choice, and it closes
a pre-existing hole: `logAtLevel` does not sanitize today, so `Loxer.log('a\nb')` already corrupts the
box column.

Where a newline in `message` breaks, for the record: `src/core/OutputStreams.ts:106` and `:60` emit the
module label and the whole box column once, before the message, so every line after the first starts at
column 0 with the box still open; `:64-66` shatters the single-line `OPEN_LOGS: [a <> b]` summary; and
`ANSIFormat.colorHighlight` (`src/core/ANSIFormat.ts:133`) paints a background to end-of-line, so a
highlighted multi-line message styles only its first line.

### Rendering N props

`prettifyItem` is already fully recursive and value-shape-agnostic, so plurality is introduced at
exactly one seam in `prettify` (`src/core/Item.ts:108-132`): map the props to `[colored, plain]` pairs,
join them into one pair, hand that single pair to `getItemBox` unchanged. `getItemBox` and its
50-character branch keep operating on one string, and the two 70-character thresholds are inside the
per-node recursion and need no change. Empty props render no block at all — a naive join would emit a
bare `┃ props>  <props`.

`PropsPrinter` also needs a lox-free entry point, because stringification happens in `logAtLevel`
before any `Lox` exists, and the only current shape is `private constructor(lox: Lox)` with
`static of(lox: Lox)`. `of(lox)` delegates to a widened constructor taking `(values, options?)`.

The decision whether to render stays in `OutputStreams`, not in the printer: `PropsPrinter.of(lox)`
returns a printer configured from `lox.printProps ?? {}`, so a callback author can honor the request
(`if (lox.printProps)`) or ignore it and render unconditionally.

### Traces

`argsAsItem` / `resultAsItem` become `argsAsProps` / `resultAsProps`, and the capture shape changes:
arguments spread to one prop each (`.open(msg, ...args)`), while the result stays a single prop and must
use a conditional spread — `.close(msg, resultAsProps ? [result] : [])` — because `.close(msg, result)`
with `result === undefined` would attach a literal `undefined` prop.

Rendering configuration is **separate for arguments and results**, since each of the four call sites
already builds its own chain. Each site chains the modifier rather than passing an argument
(`Loxer.pp(cfg).h(...).m(id)[level].open(...)`), which depends on `pp` being reachable before `h` / `m`
— which the `Omit` scheme provides. The close side needs its own `pp(...)` because the modifier is
one-shot and the open's chain has already reset.

Both options are gated the way `needsParentName` is (`src/trace.ts:186-193`,
`src/decorators/trace.ts:87-90`): resolve nothing when neither is named, ahead of the level check. Two
options means two test rows — the project rule is explicit that an ungated side silently drops the
feature for callers who named only it.

`packages/babel-plugin-loxer-trace` needs **no change**: `markerOptions()` reads `arguments[1]` and
`t.cloneNode`s it opaquely, inspecting no property name except `name`. `examples/vite-trace-demo` does
need updating (`src/main.ts:146`, `:151`, `:198`) — and its `item` at `:274-319` is an unrelated DOM
`<li>` variable that must not be renamed.

### Ordering

The dependency spine is `Lox` shape → `Loxer` construction sites → signatures → output → traces → tests
→ docs. The build stays red while `LoxProps` and `src/Loxer.ts` disagree, so that window is kept to one
step.

1. **`PropsPrinter` alone.** Rename file/class/options type, add the lox-free entry point, the N-value
   list rendering, the single-line mode, the `depth` sentinel, and the swapped `box` JSDoc. Update
   `src/core/index.ts:5` and the four files naming the type. Build green at the end; `Lox` still carries
   the old field, which the printer's `of(lox)` temporarily reads.
2. **`LoxProps` / `Lox` reshape + all four `new Lox(...)` sites + every signature, atomically.**
   Required `props` makes this inseparable. Includes the `pp` / `printProps` modifier, `resetState`, and
   the `namedError` changes. Expect a large mid-step error list; resolve to zero before moving on.
3. **The `OutputStreams` gate flip** — two `if`s and the `PropsPrinter.of` calls, as its own step so the
   behavior change reads in one diff.
4. **Traces** — `src/tracing-types.ts`, then four call sites in each of the two runtimes.
5. **`pnpm typecheck:test` sweep** for the nine `LoxProps` literals; nothing else reports them.
6. **Tests** — `test/item.test.ts` rewritten (largest single file of churn), then the trace tables, then
   the new `test/types/` cases.
7. **Docs, playground, demo, images, CHANGELOG.**

Six places put a rename and a behavior change in the same expression and need reading twice, not
sed-ing: `src/trace.ts:195-199` and `:212`; `src/decorators/trace.ts:96/100`, `:108/113`, `:121/126`;
`src/core/Item.ts:121-128`; `src/core/OutputStreams.ts:70` and `:108` (the gate rename and the semantic
flip are the same token); `src/Loxer.ts:200-211`; and `test/item.test.ts:39-42`, whose three-line
`render()` helper carries roughly twenty assertions.

## Critical files

- `src/types.ts` — `Modifiers` (`:571-630`), every log-method signature (`LevelMethods` `:328-343`,
  `LogMethods` `:345-518`, `OfLoxes` `:524-560`), `LoxerType` composition
- `src/Loxer.ts` — all four `new Lox(...)` sites, `resetState` (`:124-127`), `switchOutput` (`:427-446`),
  `makeLevel` (`:162-170`), `namedError` (`:214-229`), the `missing()` and `append` factories
  (`:299-391`), the disabled `noop` (`:30-44`)
- `src/loxes/Lox.ts` — `LoxProps` (`:9-18`), field-by-field constructor (`:55-65`); its import of the
  printer must stay `import type` or it closes a cycle once `Loxer.ts` needs the printer as a value
- `src/core/Item.ts` → `src/core/PropsPrinter.ts` — options (`:19-41`), lox-bound ctor (`:66-76`),
  `prettify` (`:108-132`), `getItemBox` (`:135-169`), the 70-char thresholds (`:351`, `:415`), the
  swapped `box` JSDoc (`:110-119`)
- `src/core/OutputStreams.ts` — the two gates and box wiring (`:70-83`, `:108-121`)
- `src/core/Error.ts` — `sanitizeErrorMessage` (`:67-72`) to reuse; `NamedError` (`:28-36`)
- `src/tracing-types.ts` — `TraceOptions` (`:87-125`), the two booleans (`:121-124`)
- `src/trace.ts` — marker runtime (`:186-218`), `needsParentName` precedent (`:186-193`)
- `src/decorators/trace.ts` — decorator runtime (`:85-129`), its `needsParentName` copy (`:87-90`)
- `src/index.ts` — drop the two type exports at `:13`, add `PropsPrinter` + `PropsPrinterOptions`
- `src/core/index.ts` — TypeDoc barrel re-export (`:5`)
- `test/item.test.ts` — full rewrite: `render()` (`:39-42`), glyph pins (`:62`, `:66`, `:81`, `:189`),
  the falsy lock to delete (`:76-83`), the `NONE`-module `RangeError` regression to keep (`:170-181`)
- `test/types/registry.test-d.ts` — the only `.test-d.ts`; resolves `dist/` through the package's own
  `exports`, so it *is* the compiled-consumer check the spec asks for
- `test/format.test.ts`, `test/modules.test.ts`, `test/initialization.test.ts` — the nine `LoxProps`
  literals only `typecheck:test` sees
- `test/trace-cases.ts` (`:111-124`, `:203-211`), `test/decorators.test.ts`,
  `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-enclosing.test.ts`
- `examples/vite-trace-demo/src/main.ts` — `:146`, `:151`, `:198` only
- `playground/items.js`, `playground/OrderService.js` — run against `dist/`
- `documentation/item.md` → `props.md`, `documentation/index.md` (`[itemDocs]` at `:970`),
  `documentation/AGENTS.md:12`, `assets/docs_images/item/` (5 PNGs), `CHANGELOG.md`

## Risks & open questions

- **A passing trace assertion that proves nothing.** `expect(devLogs[0].item).toEqual([6])`
  (`test/decorators.test.ts:172`) becomes `expect(devLogs[0].props).toEqual([6])` and passes whether or
  not the spread happened, because a one-argument call produces the same array either way. Pin the
  spread with a ≥2-argument case, or this behavior change ships untested.
- **`pnpm lint` and `pnpm test` cover none of the breakage.** Lint sees `src/**/*.ts` only; Vitest
  transpiles `test/` without typechecking. `pnpm typecheck:test` is the only gate that sees the nine
  `LoxProps` literals, and `pnpm typecheck:types` requires `pnpm build` first. Run the full set, in
  order, not a subset.
- **Import cycle.** `src/loxes/Lox.ts:1` and `src/Loxer.ts:9` import from the printer module without
  `import type`; harmless today because only types are used and `tsc` elides the specifier. Once
  `Loxer.ts` needs `PropsPrinter` as a value, that import becomes real. Keep `Lox.ts`'s type-only and
  make it explicit.
- **`test/types/` shares one registry augmentation.** `registry.test-d.ts:6-9` narrows `ModuleId`
  program-wide, so a new `.test-d.ts` beside it inherits that and cannot use ad-hoc module ids. Its
  `@ts-expect-error` pins also fail when a directive goes obsolete — useful here, but it means the
  removed `ItemType` / `ItemOptions` exports and the no-re-chain restriction can be pinned at the type
  level, which no runtime test can express.
- **Screenshots are the one deliverable nothing verifies.** All five PNGs under
  `assets/docs_images/item/` come from `playground/items.js`, and every one shows output the new default
  no longer produces. They must be regenerated after step 7, from the rewritten playground script.
- **`.vite/deps` is a third tree.** `examples/vite-trace-demo/node_modules/.vite/deps` can keep serving a
  frozen older `dist/` across a rebuild, so `pnpm demo` proves nothing until it is cleared.
- Open questions: none. The spec's five were settled during planning and are recorded in its
  "Settled during planning" section.

## Verification

Gates, in dependency order — `typecheck:types` compiles against `dist/`, so `build` must precede it:

```
pnpm lint && pnpm test && pnpm build && pnpm typecheck:test && pnpm typecheck:types && pnpm demo:build
```

Beyond the gates, four things the gates cannot see:

1. **The compiled consumer.** New cases in `test/types/registry.test-d.ts` covering the chain
   (`Loxer.pp().m('PERS').h().log('ok')`, `Loxer.h().pp().m('PERS').debug.open('ok')`), the negative
   pins (`Loxer.pp().pp()`, `Loxer.pp({ typo: 1 })`, and `Loxer.h().h()` which has no type-level pin
   today), the free-typed first argument, `import { PropsPrinter, type PropsPrinterOptions }`,
   `Loxer.namedError(...)` off the exported surface, and `@ts-expect-error` pins that `ItemType` /
   `ItemOptions` are gone.
2. **The built trees.** After `pnpm build`, run the rewritten `playground/items.js` and
   `playground/OrderService.js` against `../dist/index.js`, and run the Babel transform's emitted code
   against `dist/trace.js` — every suite imports source, so a green suite proves nothing about a stale
   artifact.
3. **The running consumer app.** `rm -rf examples/vite-trace-demo/node_modules/.vite/deps`, then
   `pnpm demo`, and confirm in the browser that a traced call attaches props without rendering them and
   renders them when the trace asks.
4. **The visual result.** Regenerate the five `assets/docs_images/item/` screenshots from the rewritten
   playground script and confirm `documentation/props.md` references no image the code no longer
   produces. Then `pnpm run docs` — never bare `pnpm docs`, which is pnpm's `home` alias, exits 0 and
   regenerates nothing — confirming typedoc's own "html generated at ./docs" output and a changed
   `docs/` tree in `git status`.
