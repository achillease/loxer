# Spec: Column-free boxes and the default console output

> Grounding: architect (domain) consulted · web-researcher (findings) skipped: internal-only

Two concerns share this spec because they share a destination: what the built-in development console
puts on a line. The first settles how much horizontal room an open box costs; the second settles how
a highlighted log and a log's severity are marked there.

## Frame the problem — box columns

Every open box reserves a vertical column in the rendered box layout, and that column widens the
box prefix on every other log line for as long as the box stays open. The cost is proportional to
how many boxes are open at once, not to how useful each one is.

That is the right trade for a box a reader follows — a request, a transaction, an async flow whose
interleaving is the point. It is the wrong trade for a box that only marks an entry and an exit: a
short wrapper span, or one frame of a traced call stack. Four nested spans push every log inside
them four columns right, and the columns carry no information the open and close lines do not
already give.

Captured from `node` against the built package, four nested spans around four member logs:

```
22:48:19 http:     ╭← handleCheckout()
22:48:19 svc:      │╭← OrderService.submit()
22:48:19 repo:     ││╭← CartRepo.load()
22:48:19 sql:      │││╭← query()
22:48:19 sql:      ││││─ SELECT * FROM cart WHERE id = 42
22:48:19 sql:      ││││─ 3 rows
22:48:19 repo:     ││││─ cart is stale
22:48:19 svc:      ││││─ total = 149.99
22:48:19 sql:      │││╰→ done  [0ms]
22:48:19 repo:     ││╰→ done  [1ms]
22:48:19 svc:      │╰→ done  [1ms]
22:48:19 http:     ╰→ 200 OK  [1ms]
```

A **column-free box** is a box a caller opens with the column suppressed. It keeps its id, its
module, its timing, its `.of(id)` reachability, its history entry and its level semantics. Its open
and close lines still carry their own glyphs, so the reader still sees where the flow begins and
ends. It reserves no column, so no other log pays for it.

The same program with the outer request box keeping its column and the three inner spans
column-free — depth pins at one instead of growing to four:

```
22:48:19 http:     ╭← handleCheckout()
22:48:19 svc:      │╭← OrderService.submit()
22:48:19 repo:     │╭← CartRepo.load()
22:48:19 sql:      │╭← query()
22:48:19 sql:      │─ SELECT * FROM cart WHERE id = 42
22:48:19 sql:      │─ 3 rows
22:48:19 repo:     │─ cart is stale
22:48:19 svc:      │─ total = 149.99
22:48:19 sql:      │╰→ done  [0ms]
22:48:19 repo:     │╰→ done  [1ms]
22:48:19 svc:      │╰→ done  [1ms]
22:48:19 http:     ╰→ 200 OK  [1ms]
```

### What already exists, and why it is not this

- `boxLayoutStyle: 'off'` (`src/core/output/BoxFormat.ts`) maps every glyph to a space. The column
  is still reserved and the open and close glyphs are lost — the inverse of what a caller wants
  here. A caller selecting `'off'` on one module sees `repo:  │  CartRepo.load()`: width paid, icon
  gone.
- `OutputLox.hidden` already suppresses the column while keeping id, timing and `.of(id)`
  reachability. `Loxes.addOpenLox` sets `_loxes[lox.id]` unconditionally and pushes to
  `_openLogBuffer` only when the lox is not hidden, so box identity and box column are already
  separable. `hidden` also suppresses the open and close lines entirely, and it is derived from the
  level gate rather than chosen. A column-free box is the column behavior without the suppression,
  selected by the caller.

Because the column-free rendering already exists for level-hidden boxes, member logs need no new
rendering: a log written inside a box that holds no column already draws the verticals of the boxes
that do hold columns plus one trailing `─`.

### Selection surface

A caller selects it per open, through a one-shot chainable modifier alongside the existing
`h`/`highlight`, `m`/`module` and `pp`/`printProps`:

```ts
const req = Loxer.m('HTTP').open('handleCheckout()'); // reserves a column
const span = Loxer.m('SVC').nc().open('submit()'); // reserves none

Loxer.of(span).add('total = 149.99');
Loxer.of(span).close('done');
```

Per-open selection is what the use case needs: a long-lived request box and a short sub-span are
routinely the same module, so a standing per-module setting cannot express the mix. The chain state
resets after each logging operation, so the selection is captured onto the box at open time and
every later `.of(id)` call on that box inherits it without re-chaining.

The trace marker chain mirrors `m`/`h`/`pp` today and mirrors this too. Traced call stacks are the
case that produces the deepest column growth, so the marker surface must be able to select it.

### In scope

- A one-shot chainable modifier on `Modifiers<Delete>`, with a shortcut and a long name, following
  the existing phantom-`Delete` template that makes double-chaining a compile error.
- Capture of the selection onto the opened box, and inheritance by every `add` / `warn` / `info` /
  `debug` / `close` / `error` / `namedError` reached through `.of(id)`.
- Column suppression in `Loxes`, and open/close glyph rendering in `BoxFactory` for a box that holds
  no column.
- The mirrored selection on the trace marker chain.
- A flag on the output lox so a custom output stream can tell a column-free box apart.
- Guide coverage in `documentation/logging.md` and `documentation/tracing.md`, and regenerated
  TypeDoc.

### Out of scope

- A per-module or global default. Per-open selection ships first; a standing default can layer on
  later without changing the rendering this spec settles.
- A new `BoxLayoutStyle` member. `'off'` already occupies the adjacent name with opposite behavior.
- Any change to which logs are written, to level gating, to history retention, or to time
  consumption.
- Reusing or compacting freed column slots. Slot allocation and trailing-hole trimming stay as they
  are.

### Naming

The pair is `nc` / `noColumn`. "Column" is the word the codebase already uses for the slot a box
reserves, so the guides teach the modifier without defining a new term. `noBox` was rejected as
imprecise — the box exists; it is the column that is absent — and because `boxLayoutStyle: 'off'`
already means "box off" with near-opposite behavior, keeping the width and dropping the glyphs.

## Frame the problem — highlighting and severity

The built-in development console (`OutputStreams`, the path a project takes until it registers an
`output` callback) is what the quick start shows in a browser devtools console. Two of its rendering
decisions do not survive that destination.

**The highlight is reverse video.** `Loxer.h()` marks a log by swapping the message's foreground and
background — ANSI `7`. A terminal honors it. The ANSI subset a Chromium devtools console implements
covers the `38;2` / `48;2` color forms and the weight and underline attributes, but not `7`, so a
highlighted log is indistinguishable from an ordinary one in every Electron and Vite app — the
environment `documentation/quick-start.md` sends a reader to first.

**A highlight on the message competes with the message's own color.** The message carries severity —
orange for a warning, red for an error — and a close line carries its green. One prefix cannot carry
both, so a highlight painted onto the message either loses to the severity color or overwrites it. A
highlighted warning can show its severity or its highlight, never both.

Separately, every line — errors included — is written with `console.log`. A devtools console
classifies a row by the method that wrote it, so its level filter, its error grouping and its stack
capture all see one undifferentiated stream.

### Design

**The highlight marks the time field.** The time field is the one fixed-width field every log
carries, whatever else it was chained with, so a background there reads as a marked row at a glance
and no log can come out unmarked. Severity keeps the message, highlighting keeps the time field, and
the two compose: a highlighted warning shows an orange message beside a marked time field, and a
highlighted close line keeps its green.

**The default highlight is an explicit background color** — grey `rgb(70, 70, 70)` — so it renders in
a terminal and in a devtools console alike. A `highlightColor` supplied through `LoxerColorOptions`
still wins. A marked time field is rendered without its ordinary `fgTime` foreground, which is that
same grey: composing the two would print grey text on a grey background.

**A close line's module title is darkened, not blacked out.** `endTitleOpacity` multiplies the
module color's channels on a close line, and its default of `0.4` keeps that title a readable shade
of the module's own color. The option reaches every colored destination through
`OutputLoxRenderer`/`ErrorLoxRenderer`, so a destination naming its own value keeps it.

**Each line is written with the console method its level names.** An error goes to `console.error`;
an ordinary log goes to `console.warn`, `console.info` or `console.debug`. Chromium prefixes a
warning or error row with an icon that shifts the line two columns right, so a row written by a
method that adds no icon carries two leading spaces and every timestamp starts at the same column.

### In scope

- The highlight rendered onto the time field rather than the message, in `ANSIFormat.colorLox`.
- An explicit background color as the highlight default, with a configured `highlightColor` still
  overriding it.
- Level-named console methods in the default development output, plus the alignment padding that
  keeps the timestamp column stable across icon and non-icon rows.
- `endTitleOpacity`'s default, which sets how dark a close line's module title renders in every
  colored destination.

### Out of scope

- A browser-specific renderer built on `console.log`'s `%c` CSS styling. One ANSI string keeps a
  single code path for a terminal and a devtools console.
- `console.group` / collapsing, and any per-level configuration of the routing.
- A `colors` member on `LoxerConfig`. Colors reach the built-in output through its defaults and reach
  a custom destination through the exported renderers' options; nothing given to `Loxer.init` selects
  them.
- Any change to the plain (uncolored) template fields, to history, or to what a registered `output`
  callback receives. Both changes are confined to the colored fields. The console method and its
  padding belong to the built-in destination alone; `endTitleOpacity`'s default reaches every
  destination that calls the exported colored renderers.

## Acceptance criteria

### Column-free boxes

- [ ] `Modifiers<Delete>` gains a one-shot modifier with a shortcut and a long name, each accepting
      an optional `boolean` and returning `LogMethods & Omit<Modifiers<Delete | x>, Delete | x>`.
      Chaining it twice is a compile error, and it composes with `h`/`highlight`, `m`/`module` and
      `pp`/`printProps` in any order.
- [ ] A box opened with the modifier reserves no slot in `Loxes._openLogBuffer`. Every log written
      while that box is open renders the same box prefix it would render if the box had never been
      opened.
- [ ] The opening line of a column-free box renders the layout's open glyphs (`openEdge` +
      `openEnd`), preceded by the verticals of the boxes that do hold a column at that moment, and
      nothing else. Its closing line renders `closeEdge` + `closeEnd` the same way.
- [ ] A closing line on a column-free box still carries its time consumption text.
- [ ] `add` / `warn` / `info` / `debug` on a column-free box render the verticals of the boxes that
      hold a column plus one trailing `─` — byte-for-byte the string a log already renders today
      when it outranks a level-hidden box.
- [ ] The selection is captured on the box at open time. A later `.of(id)` call renders column-free
      without re-chaining the modifier, and the modifier state itself resets after the opening call
      like every other one-shot modifier.
- [ ] `.of(id)` resolution, the opening log's id, its module, its history entry, and its time
      consumption are identical to a column-reserving box. Only the column and the prefix differ.
- [ ] No log is dropped, hidden, or re-leveled by the selection. `close()` still takes the opening
      log's level, and a module's threshold decides visibility exactly as before.
- [ ] A box that is level-hidden outputs nothing whether or not the modifier was chained. Hidden
      takes precedence, and the two states are tracked independently.
- [ ] A box opened *inside* a column-free box reserves its column normally, at the depth it would
      have reached had the enclosing box never been opened.
- [ ] Errors reached through `.of(id)` on a column-free box are still always output when enabled,
      and render with the same prefix rule as the member logs above.
- [ ] No new `Box` segment kind is introduced. A third-party output stream calling the exported
      `BoxFactory.getBoxString` renders a column-free box without changes.
- [ ] The output lox exposes whether its box is column-free, so a custom output stream can render it
      its own way rather than inferring it from `box.length`.
- [ ] Props still connect at the marker depth the line actually renders — zero for a column-free
      open line with no other box open.
- [ ] The trace marker chain exposes the same selection, under the same names, and a traced call
      opened through it reserves no column.
- [ ] Computing the selection costs nothing for a caller who does not chain it.

### Highlighting and severity

- [ ] A highlighted log renders its time field over the highlight background, and its message and
      module column carry no highlight. A log carrying no module is marked the same way as one that
      does.
- [ ] The highlight default is an explicit background color a devtools console renders. A
      `highlightColor` passed through `LoxColorOptions` overrides it. A marked time field carries no
      `fgTime` foreground, so its text never matches its own background.
- [ ] Highlighting composes with every level and with a close line: a warning keeps its orange
      message, an error its red, a close its green, each beside a marked time field.
- [ ] The built-in development output writes an error with `console.error` and an ordinary log with
      the console method its level names.
- [ ] The timestamp starts at the same column on every row, whether or not the console method that
      wrote it prefixes an icon.
- [ ] The plain template fields, the history, the lox payloads and every `output`-callback path are
      untouched. Only the colored `time` / `timeStamp` fields and the built-in destination's console
      method differ from a log that is not highlighted.
- [ ] A close line's module title renders at `endTitleOpacity`, which defaults to `0.4`, in every
      destination that calls the exported colored renderers. A destination naming its own value keeps
      it. The default applies whether or not the log is highlighted.

## Definition of done

- [ ] Acceptance criteria met.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck:test`, and `pnpm typecheck:types` all
      exit 0. The last one is the only gate that reads the double-chain `@ts-expect-error` pins.
- [ ] `test/boxed.test.ts` covers the column-free open line, close line, member line, the
      nested-inside case, the hidden-wins precedence, and a mixed run where one box holds a column
      and another does not. Column expectations use `checkBoxes`, extended if a case falls through
      its segment map.
- [ ] The trace suites cover the mirrored marker-chain selection.
- [ ] The built trees are exercised, not only `src/`: after `pnpm build`, `test/dist-consumer.test.ts`
      renders a column-free box through the built `dist/` tree, which is the committed home for that
      gate.
- [ ] `documentation/logging.md` teaches the modifier in its manual-box section, and
      `documentation/tracing.md` teaches the marker-chain form. Both describe the current design
      without narrating the change.
- [ ] JSDoc on the new modifier and on the output-lox flag is written, and `pnpm run docs`
      regenerated `docs/` with typedoc's own output confirming it.
- [ ] The plan folder worklog records the naming decision that Planning settles.
- [ ] `test/format.test.ts` pins the highlight on the colored time field: the default background, an
      overriding `highlightColor`, and the warn / error / close compositions.
- [ ] A suite pins the console method each level is written with, and the alignment padding, through
      the callback-free destination.
- [ ] The built-tree gate covers this too: after `pnpm build`, a script importing `dist/index.js`
      shows a marked time field and the four console methods.
- [ ] `documentation/logging.md` teaches highlighting as a mark on the time field.
- [ ] The rendering itself is confirmed in a Chromium devtools console, which is the destination this
      half exists for and the one a Node gate cannot speak for: a page that inits Loxer with no
      `output` callback shows the mark on a highlighted row, and every timestamp starts at the same
      column. `examples/vite-trace-demo` opened as `?console` is that page.

## Open questions

- ~~The public identifier pair.~~ **Settled:** `nc` / `noColumn`. See **Naming** above.
- ~~Whether the output-lox flag is a dedicated field or derivable from state the lox already
  carries.~~ **Settled:** a dedicated `columnFree` field on the lox, so a custom stream reads it
  instead of counting `box` entries.
- ~~Whether the trace marker chain's form is a property or a method.~~ **Settled:** a method, which
  is the shape the chain uses for every modifier it mirrors. Only direct module selection is a
  property.
- ~~What a highlight marks on a log that carries no module.~~ **Settled:** the mark goes on the time
  field, which every log carries, so the module column plays no part in it. See **Design** above.
- ~~Whether `endTitleOpacity` should stop applying to a highlighted close line.~~ **Settled:** it
  applies to every close line alike. Its default is `0.4`, a darkened shade of the module's own
  color, rather than the black a multiplier of `0` produces. See **Design** above.
- Whether `'debug'` belongs on `console.debug`. Chromium hides that method's rows unless the console's
  Verbose level is enabled, so a debug log a module's threshold admits can still be invisible.
