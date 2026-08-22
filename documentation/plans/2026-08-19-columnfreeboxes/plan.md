# Plan: Column-free boxes

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: documentation/specs/column-free-boxes.md

## Context

An open box reserves a vertical column in the box layout, and that column widens every other log's
prefix while the box lives. For a box a reader follows — a request, a transaction — that is the
point. For a box that only marks entry and exit, it is pure cost: four nested spans push every log
inside them four columns right.

`Loxer.nc()` / `Loxer.noColumn()` opens a box that reserves no column. It keeps its id, module,
timing, `.of(id)` reachability, history entry and level semantics; its open and close lines still
carry their glyphs. The spec holds the full behavior and the rendered before/after.

The spec's second half settles the other thing the built-in development console decides per line: how
a highlighted log and a log's severity are marked. The highlight is reverse video today, which a
Chromium devtools console does not implement, and it is painted onto the message, where the severity
color already lives — so a highlighted warning can show one or the other, never both. Every line also
goes to `console.log`, which flattens the console's own level filter.

Three calls settled during planning:

- **Name: `nc` / `noColumn`.** "Column" is already the word `src/core/AGENTS.md` and
  `BoxFactory.getMarkerDepth`'s JSDoc use for this exact thing, so the guides teach it without
  defining a new term. `noBox` was rejected: the box persists, and `boxLayoutStyle: 'off'` already
  means "box off" with near-opposite behavior (keeps the width, drops the glyphs).
- **`ErrorLox.openLoxes` includes column-free boxes.** That list is diagnostic, not layout. A
  column-free box is genuinely in flight when the error fires.
- **The highlight marks the module column, and its default is an explicit background color.** The
  module column is a fixed-width field at a stable offset, so severity keeps the message and
  highlighting keeps the module column — orthogonal, and they compose. Grey `rgb(70, 70, 70)` renders
  where reverse video does not. Keeping the highlight on the message and merging the two prefixes
  instead was rejected: a background plus a foreground still collide on a close line, which needs its
  own foreground too, and the merge would have to be re-derived at every level.

## Approach

Eight streams. Streams 1–3 are the behavior; 4–5 are the two selection surfaces; 6–7 close it out;
Stream 8 is the console-output concern, independent of the other seven and touching no file they do.

### Stream 1 — stamp the flag on `Lox`, not `OutputLox`

Add `columnFree?: boolean` to `LoxInit` ([Lox.ts:12-22](src/loxes/Lox.ts#L12-L22)) plus the field and
`this.columnFree = init.columnFree ?? false;` in the constructor
([Lox.ts:74-85](src/loxes/Lox.ts#L74-L85)), mirroring the `messageSpans ?? []` line.

It must be a `LoxInit` field, **not** a post-construction assignment the way `hidden` is set in
`toOutputLox` ([Loxer.ts:584](src/Loxer.ts#L584)). `Loxes.findOpenLox`
([Loxes.ts:80-89](src/core/runtime/Loxes.ts#L80-L89)) returns two different things: a raw `Lox` off
`_pendingLoxQueue` before init, and an `OutputLox` after. A flag living only on `OutputLox` is
invisible on the pre-init path, so `Loxer.nc().open()` before `init()` followed by `.of(id).close()`
would silently lose the selection.

Optional, not required — [test/format.test.ts](test/format.test.ts) builds `new OutputLox({...})`
from nine plain object literals; a required field breaks `pnpm typecheck:test`.

`OutputLox` and `ErrorLox` need no change. `OutputLox` declares no constructor, and both
`new OutputLox(lox)` and `new ErrorLox(lox, error)` pass a `Lox` as a structurally compatible
`LoxInit`, so the field rides along. Both are `export type` only in
[src/index.ts](src/index.ts) — a consumer cannot construct one, so the added field is non-breaking.

Read the chain state in `openAtLevel` ([Loxer.ts:403-425](src/Loxer.ts#L403-L425)), before
`switchOutput` calls `resetState()`. Propagate it at the `new Lox({...})` sites that belong to a box:
`appendToOpenLox` ([:517](src/Loxer.ts#L517)) reads `openLox.columnFree` off the lox it already holds
in the closure. `logAtLevel` ([:267](src/Loxer.ts#L267)) and `writeTracePoint`
([:305](src/Loxer.ts#L305)) omit it — neither opens a box.

`internalError` ([:369-392](src/Loxer.ts#L369-L392)) is the awkward one: `of().error` and
`of().namedError` pass only `openLox.id` ([:493](src/Loxer.ts#L493),
[:496](src/Loxer.ts#L496)), not the lox. Resolve it inside `toErrorLox` via
`this._loxes.findOpenLox(lox.id)` rather than threading a sixth parameter — `toErrorLox` already pays
that lookup through `getTimeConsumption`, and the route also covers the id-only "box already closed"
paths, which correctly yield `false`.

Do **not** widen `outputMessage`'s `Pick<LoxInit, 'message' | 'messageSpans'>` return to carry the
flag. Write it as a literal property at each construction site. The `Pick<>` rule in
`rules/coding-conventions.md` exists because a spread into a typed literal skips excess-property
checking — that rule is the reason this producer is narrow, and widening it reintroduces the hazard.

### Stream 2 — suppress the column in `Loxes`

One condition in `addOpenLox` ([Loxes.ts:72-77](src/core/runtime/Loxes.ts#L72-L77)):

```
if (!lox.hidden && !lox.columnFree) { this._openLogBuffer.push(...) }
```

`this._loxes[lox.id] = lox` stays unconditional, which is what preserves `.of(id)`. Hidden-wins
precedence falls out of the `&&` for free.

`removeCorrespondingOpenLox` ([:51-59](src/core/runtime/Loxes.ts#L51-L59)) and `trimOpenLogBuffer`
([:61-70](src/core/runtime/Loxes.ts#L61-L70)) need no change — verified: `findIndex` returns `-1`,
the `> -1` guard skips, and `this._loxes[lox.id] = undefined` still runs to release `.of(id)`. This
is the path level-hidden boxes already take.

`getOpenLoxes` ([:92-96](src/core/runtime/Loxes.ts#L92-L96)) **does** change, per the settled call.
It derives from `_openLogBuffer` today, so a column-free box would vanish from
`ErrorLox.openLoxes`. Derive from `_loxes` instead, filtering defined + `type === 'open'` +
`!hidden`. This is equivalent for every existing case — `_openLogBuffer` already holds exactly the
non-hidden opens, and `_loxes` is id-indexed so ascending order stays chronological — and it adds
only the column-free boxes. The filter must keep excluding hidden boxes; dropping that is a silent
behavior change.

### Stream 3 — one new branch in `BoxFactory`

`getOpenLogBox` ([BoxFactory.ts:27-54](src/core/output/BoxFactory.ts#L27-L54)) needs **no change**,
and this is worth stating because it looks like it should. Verified call order in `switchOutput`:
`toOutputLox` (which calls `getLogBox`) runs at [Loxer.ts:549](src/Loxer.ts#L549), `proceedOpenLox`
at [:558](src/Loxer.ts#L558). An opening lox is never in the buffer when its own box renders, so the
loop already emits a `vertical` per open column then pushes `openEdge` + `openEnd` — byte-for-byte
the required open line. **Trap:** the `if (lox.id === bufferLox?.id) break;` at
[:34-36](src/core/output/BoxFactory.ts#L34-L36) is unreachable for a fresh open. Anyone tidying that
"dead" break, or reordering `getLogBox` after `proceedOpenLox`, silently changes both normal and
column-free open lines. Leave it, and say so in a comment.

`getOfLogBox` ([:57-93](src/core/output/BoxFactory.ts#L57-L93)) needs one branch, on the close side
only. A not-in-buffer close currently falls through to the line-end push and renders `closeEnd`
without `closeEdge` → `│→`; the spec wants `│╰→`. Add after the loop, before the line-end push:

```
if (lox.columnFree && !found && lox.type === 'close') {
  box.push({ box: 'closeEdge', color, boxLayout: lox.module.boxLayoutStyle });
}
```

Use `lox.module.boxLayoutStyle` — the box owns no buffer slot to read one from. The regression risk
is near zero: not-in-buffer + `type === 'close'` + not hidden is currently unreachable, because
`close` takes the opening log's level, so a close on a hidden box is itself hidden and short-circuits
at [:19](src/core/output/BoxFactory.ts#L19).

Member logs need no change — the loop finds no matching id, every slot emits `vertical`, and the
line-end push emits `horizontal` → `│─`. Already pinned at
[test/boxed.test.ts:369](test/boxed.test.ts#L369). `getMarkerDepth` and `getBoxString` are untouched,
and no new `Box` segment kind appears, so a third-party stream calling the exported
`BoxFactory.getBoxString` keeps working.

### Stream 4 — the chainable

Four registration points, in [src/types.ts](src/types.ts) and [src/Loxer.ts](src/Loxer.ts):

1. `type nc = 'nc' | 'noColumn';` beside the existing phantom aliases (`types.ts:623-625`).
2. Two members on `Modifiers<Delete>` (`types.ts:627-719`), each
   `(doit?: boolean): LogMethods & Omit<Modifiers<Delete | nc>, Delete | nc>`, with JSDoc — TypeDoc
   reads it.
3. Backing field `_columnFree` plus the `nc` / `noColumn` pair beside `h`/`pp`/`m`
   (`Loxer.ts:194-253`).
4. `this._columnFree = false;` in `resetState` (`Loxer.ts:175-179`).

Step 3 is compiler-guarded: `class LoxerInstance implements LoxerType` fails to build until both
runtime members exist. **Step 4 is not guarded by anything** — nothing enumerates the modifiers, so a
miss leaks the selection into the next log and no existing suite fails. It needs its own test.

### Stream 5 — mirror it on the trace marker chain

The chain members are methods, not properties (`TraceMarkerModifiers`,
[src/trace.ts:98-105](src/trace.ts#L98-L105)) — this settles the spec's third open question. Only
direct module selection is a property.

The selection is resolved entirely at build time: the Babel plugin walks the chain and emits a
literal `TraceRuntimeOptions` object into the `__startTrace(...)` call. So `__startTrace`
([:307-347](src/trace.ts#L307-L347)) adds `if (options.columnFree) { Loxer.nc(); }` before
`__openTrace`, beside the existing `Loxer.h(highlightOpen).m(moduleId)` at
[:329](src/trace.ts#L329). The close side needs nothing — the stamp is on the box.

Registration points, each of which fails differently if missed:

| Site | Miss symptom |
| --- | --- |
| `src/tracing/types.ts:212-219` `TraceRuntimeOptions` | won't compile |
| `src/trace.ts:64-82` `TraceMarkerReservedMember` | a module named `nc` collides with the modifier |
| `src/trace.ts:98-105` `TraceMarkerModifiers` | won't compile |
| `src/trace.ts:228` untransformed-runtime stub loop | `trace.nc()` throws "not a function" instead of the intended `missingTransform` message |
| `marker-collection.ts:6` `TraceModifier` | union too narrow |
| `marker-collection.ts:7-28` `reservedDirectModules` | `trace.nc()` parses as a **direct module selector**, silently emitting `{moduleId:'nc'}` |
| `marker-collection.ts:632-641` `isModifier` | throws "does not support fluent member" |
| `marker-collection.ts:643-649` `modifierFamily` | `nc`/`noColumn` are two aliases; without an arm, build-time double-chaining is allowed while the types forbid it |
| `marker-collection.ts:270-279` argument default | bare `trace.nc()` emits `undefined` instead of `true` |
| `marker-collection.ts:694-702` `modifierKey` | **silently lands on `printProps`** — verified, the fallback is `name === 'props' ? 'propsTarget' : 'printProps'` |

Deliberately excluded: `TracePointChain` (a trace point is a single log, not a box — assert it still
rejects the name), and `linked-loxer.ts:4` `SUPPORTED_MODIFIERS`, which omits `pp`/`printProps` for
the same reason the new one belongs out of it.

`packages/babel-plugin-loxer-trace/src/*.ts` **is linted** — `eslint.config.mjs` ignores `test/`,
`docs/`, `dist/` and `*.js`, but not `packages/*/src`.

### Stream 6 — tests

`checkBoxes` ([test/boxed.test.ts:75-113](test/boxed.test.ts#L75-L113)) needs no segment-map change:
it already maps `openEdge→<`, `closeEdge→>`, `openEnd`/`closeEnd`/`horizontal→-`, `vertical→|`. A
column-free open renders `<-`, close `>-`, member `|-`. What the assertions capture is the prefix
width, which is the whole point.

- `test/boxed.test.ts` — column-free open, close, member; nested-inside (a normal box opened inside a
  column-free one sits at the depth it would have had); hidden-wins precedence; a mixed run with one
  column box and one column-free. Reuse `:355-370` as the member-line template.
- `test/format.test.ts` — a direct `BoxFactory` drive for the new close branch, alongside `:81-100`.
  Cheapest place to pin it without the singleton.
- `test/unboxed.test.ts` — the `resetState` leak: chain `nc()`, log, then assert the next log is
  unaffected.
- **Propagation assertions** — explicit `lox.columnFree` checks on each of `add` / `warn` / `info` /
  `debug` / `close` / `error` / `namedError`. See Risks.
- `test/plain-function-trace-core.test.ts` — add rows to the modifier-family and reserved-direct-module
  diagnostic tables; the "may appear only once" row is what catches a missing `modifierFamily` arm.
- `test/trace-point.test.ts` — assert the point chain still rejects `nc`, pinning the mirror as
  marker-only.
- `test/types/registry.test-d.ts` — `@ts-expect-error` pins for `.nc().noColumn()` and
  `.noColumn().nc()`, plus compose-in-any-order positives.

Drive the tables with `test.each`, not a `for` loop, per `rules/testing.md`.

### Stream 7 — documentation

- `documentation/logging.md` — teach the modifier in the "Manual boxes and history" section
  (`:105-127`).
- `documentation/tracing.md` — the marker-chain form, beside the `module`/`highlight`/`printProps`
  line at `:55`.
- JSDoc on both new modifier members, then `pnpm run docs`.

Both guides describe the current design — no "now", "no longer", "instead of".

### Stream 8 — highlight placement and level-named console methods

Two files, both on the built-in destination's path. Nothing here touches a box, a lox field, or a
type, so it lands independently of Streams 1–7.

**`ANSIFormat`.** `highlightPrefix` ([ANSIFormat.ts:64-76](src/core/output/ANSIFormat.ts#L64-L76))
returns `this.colorBackground(70, 70, 70)` where no `highlightColor` is configured, in place of
`CODE.Reverse`. The configured branch above it is unchanged, so a destination that names a color
keeps it. `colorHighlight` is the other caller and inherits the new default for free.

`colorLox` ([:201-250](src/core/output/ANSIFormat.ts#L201-L250)) drops the highlight arm from the
message prefix chain and wraps the module text instead:

```
let moduleText = this.colorize(lox.module.slicedName, lox.module.color, options.moduleOpacity);
if (lox.highlighted) {
  moduleText = this.highlightPrefix(options.colors?.highlightColor) + moduleText + this.CODE.Reset;
}
```

The message prefix chain then reduces to close-green, overwritten by warn-orange or error-red — the
severity precedence it already had, minus the highlight arm that used to lose to it. `ErrorLox`'s
`bgError` name badge and `colorMessageSpans` need no change: spans re-emit whatever the message
prefix is, and the message prefix no longer carries the highlight.

**`OutputStreams`.** `devErrorOut` ([OutputStreams.ts:30-38](src/core/output/OutputStreams.ts#L30-L38))
writes with `console.error`. `devLogOut` ([:47-57](src/core/output/OutputStreams.ts#L47-L57)) writes
with `console[outputLox.level]` and prefixes `'  '` for every level except `'warn'`, so a row Chromium
gives no icon lines up with one it does.

- The index is total: `LogLevel` is `'error' | 'warn' | 'info' | 'debug'` and `console` declares all
  four. Only `'warn' | 'info' | 'debug'` reach it in practice — `BoxLevel` excludes `'error'`, and
  `error()` routes to `devErrorOut` — but an `'error'`-level ordinary log would land on
  `console.error`, which is where it belongs.
- Both `prod` paths stay as they are. Production silence is unchanged.
- Only the `_output`-absent branch of each method changes. A registered callback still receives the
  raw lox and never sees a console method.

### Stream 8 tests

The two changed behaviors already have suites pinning their previous shape, so the Testing phase
updates rather than adds:

- `test/format.test.ts` — five expectations assert the highlight on `colorLox(...).message` and the
  reverse-video default (`background coloring` `:32`, `lox coloring` `:43`, the per-destination
  color case `:64`, the span case `:230`, the no-spans case `:253`). They move to the colored
  `module` field, and the highlight-composes-with-severity cases are the ones to add while there:
  warn, error and close each keep their message color beside a marked module column.
- `test/initialization.test.ts:363` and `test/trace-message-console.test.ts:39,74` mock
  `console.log` and now capture nothing. Mock the level's method — these suites log at `'info'` — and
  account for the two-space indentation in the compared line.
- New: a routing case per level through the callback-free destination, asserting the method each
  level is written with and the padding, and a case asserting an unhighlighted log is byte-identical
  to what it renders today.

## Critical files

- [src/loxes/Lox.ts](src/loxes/Lox.ts) — `LoxInit` + constructor; the stamp
- [src/Loxer.ts](src/Loxer.ts) — `resetState:175`, modifiers `:194-253`, `openAtLevel:403`, `of:427`, `appendToOpenLox:501`, `internalError:369`, `toErrorLox:562`
- [src/types.ts](src/types.ts) — phantom alias `:623`, `Modifiers` `:627-719`
- [src/core/runtime/Loxes.ts](src/core/runtime/Loxes.ts) — `addOpenLox:72` (one condition), `getOpenLoxes:92` (rewrite)
- [src/core/output/BoxFactory.ts](src/core/output/BoxFactory.ts) — `getOfLogBox:57` close branch; `getOpenLogBox` deliberately untouched
- [src/trace.ts](src/trace.ts) — reserved members `:64`, chain `:98`, stub loop `:228`, `__startTrace:307`
- [src/tracing/types.ts](src/tracing/types.ts) — `TraceRuntimeOptions:212`
- [packages/babel-plugin-loxer-trace/src/marker-collection.ts](packages/babel-plugin-loxer-trace/src/marker-collection.ts) — the ten registration points
- [src/core/output/ANSIFormat.ts](src/core/output/ANSIFormat.ts) — `highlightPrefix:64` default, `colorLox:201` module-field highlight
- [src/core/output/OutputStreams.ts](src/core/output/OutputStreams.ts) — `devErrorOut:30`, `devLogOut:47` level-named methods and padding
- [test/boxed.test.ts](test/boxed.test.ts), [test/format.test.ts](test/format.test.ts), [test/types/registry.test-d.ts](test/types/registry.test-d.ts)
- [test/initialization.test.ts](test/initialization.test.ts), [test/trace-message-console.test.ts](test/trace-message-console.test.ts) — the two `console.log`-mocking suites Stream 8 moves
- [playground/OrderService.js](playground/OrderService.js) — built-tree verification host

## Risks & open questions

- **Silent propagation failure — the top risk.** Rendering does not depend on the flag for member
  logs or errors; they already take the not-in-buffer path. So a missed propagation produces
  **byte-identical output** and only a wrong consumer-visible flag. No box test can catch it. Handled
  by explicit `lox.columnFree` assertions on every `.of(id)` entry point. `AGENTS.md` records this
  exact failure shape for `parentFn`: an option read on both the open and close side needs both
  covered, or the untested side silently drops the feature.
- **`resetState` has no guard.** No compiler check, no enumeration, no existing test. A leak shows up
  as a stray column-free box several logs later. Handled by the `test/unboxed.test.ts` case.
- **`modifierKey`'s fallback silently lands on `printProps`** — verified. A missing arm produces a
  transform that compiles and emits the wrong option key.
- **`reservedDirectModules` omission is silent too** — `trace.nc()` would parse as a module selector
  named `nc`.
- **`getOpenLoxes` is an existing method changing behavior.** The rewrite must keep excluding hidden
  boxes; dropping that filter would add them to error context, which nothing asks for. Pin the
  hidden-exclusion in a test, not just the column-free inclusion.
- **Do not "clean up" the unreachable `break` in `getOpenLogBox`,** and do not reorder `getLogBox`
  relative to `proceedOpenLox`. Both silently change normal open lines.
- **`rules/` names stale paths.** `documentation/logging/props.md`, `documentation/tracing/`,
  `src/decorators/` and `test/decorators.test.ts` no longer exist; the tree is flat and
  `src/decorators/` went in `1c502a8`. The spec's targets are the real ones. Worth a follow-up to the
  rule files, out of scope here.
- **Open:** whether `playground/OrderService.js` gains a nested-span section or a new playground
  script hosts it. Either satisfies the built-tree gate; decide at implementation.
- **A highlight on a log with no module marks nothing.** `Modules.getModule`
  ([Modules.ts:80-85](src/core/runtime/Modules.ts#L80-L85)) gives the `NONE` module an empty
  `slicedName` — `moduleTextLength` is `0` for it — so the background wraps zero characters.
  `Loxer.h().log(...)` without a module, and `init()`'s own highlighted "Loxer initialized" line,
  render exactly like an unhighlighted log. Verified against `dist/`. The spec carries this as an
  open question; it needs an answer before the guides teach the modifier.
- **A highlighted close line puts black text on the grey highlight.** `endTitleOpacity` defaults to
  `0`, which the module field already honors, and the highlight now sits behind it. Also an open
  question in the spec.
- **`console.debug` is filtered by default in Chromium** unless the console's Verbose level is on, so
  routing `'debug'` there can hide a log a module's threshold admits. Terminal destinations are
  unaffected.
- **The colored `message` field is an observable output shape.** `OutputLoxRenderer` and
  `ErrorLoxRenderer` are exported, so a custom stream composing `colored.message` itself loses the
  highlight marker unless it also renders `colored.module`. Nothing in the plain fields, the lox, or
  the callback payloads changes, so a callback that consumes the lox is unaffected.

## Verification

```
pnpm build            # must run BEFORE test — test/dist-consumer.test.ts throws on missing artifacts
pnpm lint             # src/**/*.ts AND packages/*/src/*.ts
pnpm test             # vitest run --coverage
pnpm typecheck:test   # tsc -p test/tsconfig.json
pnpm typecheck:types  # tsc -p test/types/tsconfig.json — the double-chain @ts-expect-error pins
pnpm run docs         # never `pnpm docs`; require typedoc's "html generated at ./docs" line
                      # plus git status/diff showing docs/ actually changed
```

`pnpm typecheck:types` is a fifth gate the spec's definition of done omitted; it is where the
double-chaining compile errors are pinned.

**Built tree, not `src/`.** Every suite except `test/dist-consumer.test.ts` imports `../src`, so a
green run proves nothing about `dist/`. After `pnpm build`, run `node playground/OrderService.js`
with a nested-span section chaining `nc()` and confirm the inner spans render `╭←` / `╰→` while the
enclosing request box holds depth 1 — reproducing the spec's second capture against `dist/`.

**Stream 8 against `dist/`.** After `pnpm build`, a script importing `dist/index.js` with one module
registered and no `output` callback must show: a highlighted log's module column wrapped in
`48;2;70;70;70`, its message carrying only its own color; a highlighted warn keeping `38;2;255;165;15`
on the message and a highlighted close keeping `38;2;180;255;180`; and the four console methods
receiving the rows their levels name, with the timestamp at a stable column. Finish in the browser
per `rules/testing.md` — the devtools console is the destination the change exists for, and a
terminal cannot show whether the mark renders there.

**Trace mirror is a build-time surface.** Transform a fixture with
`packages/babel-plugin-loxer-trace/dist` and run the emitted code against `dist/trace.js`. A green
`src/`-only suite cannot see a stale plugin build.
