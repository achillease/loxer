# Plan: Trace message templates and colored call payloads

> Grounding: architect (technical) n/a — surveyed inline across `src/trace.ts`,
> `src/decorators/trace.ts`, `src/tracing-types.ts`, `src/Loxer.ts`, `src/loxes/Lox.ts`,
> `src/core/ANSIFormat.ts`, `src/core/OutputRenderer.ts`, `src/core/TraceNames.ts` and
> `packages/babel-plugin-loxer-trace/src/` · web-researcher (selection) skipped: no new dependency
> Spec: documentation/specs/trace-message-templates.md

## Context

Trace boxes render their messages from a fixed, incomplete set of styles: no style combines the
parent with the payload, the style names describe their output only loosely, and everything a
message prints is one undifferentiated run of text — the arguments, types, or result a reader scans
for look exactly like the function name carrying them. The callback escape hatch is the weakest of
the three forms: it receives the bare tuple or result and has to rebuild the name, the parent, the
parentheses, and any coloring itself, so callbacks and presets produce visibly different logs.

The spec replaces the style unions with `'fn'` / `'parent.fn'` / `'fn(types)'` / `'fn(args)'` /
`'parent.fn(types)'` / `'parent.fn(args)'` on open and `'fn'` / `'parent.fn'` / `'fn(result)'` /
`'parent.fn(result)'` on close, colors each part of the message in the props printer's palette
string color, and gives callbacks a context object carrying `fn` and `parentFn` printers that render
the same shape. Loxer 3.0.0 is unreleased, so the old names go away outright.

## Approach

### 1. One shared renderer for both trace runtimes

`src/trace.ts` and `src/decorators/trace.ts` each carry their own `getOpenMessage` /
`getCloseMessage`. The templates, the printers, the failure form, and the payload marking are one
semantic rule with two runtime consumers — the case the project's "extract a shared internal helper"
rule names — so they move into a new internal module **`src/core/TraceMessage.ts`**, beside
`TraceNames.ts` (which keeps owning `qualifiedFunctionName` / `classParentName` and is called *by*
the new module). The two runtimes keep only what is genuinely theirs: how the parent is discovered
(`this.constructor.name` for the decorator, the transform-supplied `parentName` for the marker) and
how the log is dispatched.

The renderer's entry points take the call's data plus a **lazy parent resolver**:

```ts
renderOpenMessage(style, { name, resolveParent, args })   // -> TraceMessage
renderCloseMessage(style, { name, resolveParent, result })
renderFailureMessage(style, { name, resolveParent })
```

`resolveParent` is a `() => string` the runtime supplies; the renderer calls it only for a `parent.`
template or when a callback actually invokes `parentFn`. This replaces the current `needsParentName`
gates, which cannot survive as-is: `parentFn` is handed to *every* callback, so the options alone no
longer say whether the parent is needed. Laziness moves the decision from the option literal to the
moment of use, which is the only place that still knows.

### 2. Payload marking, then spans

The renderer builds the message with each colored part wrapped in private sentinel characters — one
opener per kind, one shared closer — then scans once to produce the final `TraceMessage`: the plain
text with the sentinels removed, plus the ranges they enclosed and what each range is.

```ts
interface TraceMessage { text: string; spans: MessageSpan[] }
// MessageSpan = { start, end, kind: 'value' | 'fn' | 'parent' }
```

Sentinels rather than an offset table because a callback composes freely —
``({ parentFn }) => `retrying ${parentFn('3')}` `` — and markers travel through concatenation,
template literals, and `.map().join()` while offsets do not. Caller content is sanitized with
`sanitizeControlCharacters` **before** it is wrapped, so a sentinel can never come from caller data
and no color code is stripped later; the closing scan drops an unpaired sentinel (a callback that
sliced one off) and simply colors nothing there. `fn` / `parentFn` are the same factory with a
different name source, and both accept an optional content (`fn()` → `calculate()`).

### 3. The channel: a branded message, an internal field, and one coloring site

Every message in the package funnels through `stringifyMessage` → `outputMessage` →
`new Lox({ message })` (`src/Loxer.ts`), which already accepts a non-string message and renders it
through `PropsPrinter.singleLine`. The trace runtimes pass a **branded carrier object** as the
message; the funnel recognizes the brand, takes `text` as `lox.message`, and stores `spans` on the
lox. No new public method, no new chain modifier: the carrier is internal, and the public
`(message?: unknown, ...props)` signature is unchanged.

- `LoxInit` / `Lox` gain one `/** @internal */ messageSpans` field — ranges of `message` that carry
  caller data. `typedoc.json` sets `excludeInternal: true`, so it stays out of the generated API.
- A hidden log already gets `message: ''` from `outputMessage`; its spans are empty by the same
  branch, so nothing can point past the end of the string.
- `ANSIFormat.colorLox` is the single place a message is colored, and becomes the single place spans
  are applied. It colors each span by its kind and **re-emits the enclosing prefix after the
  span's reset**, so the ` done` tail of a close message keeps its `fgCloseLog` green, a warning
  stays yellow, and a highlight keeps its background. This is the reason spans beat a pre-baked
  colored string: only the renderer knows the enclosing color.
- The plain `message` field of `OutputLoxRenderer`, `lox.message` on the raw lox a destination
  receives, the history, and the `OPEN_LOGS:` join are untouched and therefore escape-free by
  construction, rather than by a stripping pass.

### 4. Public types

`src/tracing-types.ts` gets the two new unions, the exported `TraceCallPrinter`
(`(content?: string) => string`), and the two context interfaces the callbacks receive
(`{ args, fn, parentFn }` / `{ result, fn, parentFn }`), all re-exported from `src/index.ts` and
`src/trace.ts` so both entry points can name them.

### 5. Build-time transforms

The transforms never read the style literals — `packages/babel-plugin-loxer-trace` passes
`parentName` to `__startTrace` unconditionally and copies the options object through verbatim, so the
rename needs no transform change. Only the doc comments naming `'parent.functionName'`
(`marker-collection.ts`, the package READMEs and `AGENTS.md` files) are updated.

### Order of work

1. `src/core/TraceMessage.ts` — templates, printers, sentinel marking, span extraction, failure form.
2. Channel — branded carrier in `src/Loxer.ts`, `messageSpans` on `Lox`/`LoxInit`, span coloring in
   `ANSIFormat.colorLox`.
3. `src/tracing-types.ts` unions/types + exports.
4. Both runtimes rewired to the shared renderer, with their own lazy parent resolvers.
5. Tests, then documentation and `pnpm run docs`.

## Critical files

- `src/core/TraceMessage.ts` — **new.** The one renderer both runtimes call: template table, `fn` /
  `parentFn` printer factory, sentinel marking and span extraction, failure message.
- `src/core/TraceNames.ts` — unchanged rules; called by the new module for the `parent.` forms.
- `src/tracing-types.ts` — the two unions, `TraceCallPrinter`, the callback context interfaces, and
  the JSDoc that documents the whole template set.
- `src/trace.ts` — drop the local `getOpenMessage` / `getCloseMessage` and the `needsParentName`
  gate; supply a lazy resolver over the transform's `parentName`; keep the dispatch and props logic.
- `src/decorators/trace.ts` — the same, with the resolver reading the class off `this` through
  `classParentName`; `failWith` moves to the shared failure form.
- `src/Loxer.ts` — brand detection in `stringifyMessage` / `outputMessage`, spans onto every `Lox`
  construction site (single, open, close, add).
- `src/loxes/Lox.ts` — the `@internal messageSpans` field on `LoxInit` and `Lox`.
- `src/core/ANSIFormat.ts` — span coloring inside `colorLox`, with the enclosing color re-emitted
  after each span.
- `src/index.ts` — export the new public types.
- `test/trace-cases.ts` — the shared table both runtimes are driven from; every template, both
  printers, the fallbacks, the failure message.
- `test/decorators.test.ts`, `test/plain-function-trace-*.test.ts` — consumers of that table.
- `test/format.test.ts` — the `colorLox` span behavior, including the enclosing-color restoration.
- `documentation/index.md` — the tracing sections that teach the options.

## Risks & open questions

- **Spans and the message can drift.** Any code that rewrote a message after the fact would leave
  spans pointing at the wrong characters. Mitigation: spans are produced by the same scan that
  produces the text and are never recomputed; the error path builds its message from
  `sanitizeErrorMessage` and carries no spans. Covered by a test asserting a span's text equals the
  payload it names.
- **Sentinel collision.** Caller data containing the sentinel would confuse the scan. Mitigation:
  content is sanitized before wrapping, which removes control characters, and the sentinels are
  chosen from that stripped range — a value cannot smuggle one in.
- **The lazy resolver could be called repeatedly.** A callback invoking `parentFn` several times must
  not resolve the class several times. Mitigation: the resolver memoizes per call.
- **Non-serializable results.** `'fn(result)'` falls back to the `'fn'` / `'parent.fn'` message of
  the same name form when `JSON.stringify` returns `undefined`; a `void` traced function must not
  print `calculate(undefined) done`. Table case.
- **Coverage of the two-sided gate.** The project has already been bitten by a gate reading two
  options where only one side was tested. Every template is covered on the open side *and* the close
  side, and a callback that ignores `parentFn` is asserted to trigger no parent resolution.
- **`test/types/registry.test-d.ts` and the type-level suites** name the trace options; they need the
  new literals or `pnpm typecheck:types` fails while `pnpm test` stays green.

## Verification

- `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm typecheck:test`, `pnpm typecheck:types` all exit 0.
- The shared case table drives the decorator and the marker runtime through the identical
  expectations, so neither copy can render a template the other does not.
- Renderer-level assertions on the plain/colored split: an escape-free `lox.message` and
  `template.message` beside a `template.colored.message` carrying the payload color, plus a close and
  a warning message asserting the text after the payload is still in the enclosing color.
- `pnpm build`, then the built trees: transform a module with
  `packages/babel-plugin-loxer-trace/dist` and run the emitted code against `dist/trace.js` and
  `dist/index.js` — a suite importing `src/` proves nothing about what a consumer executes.
- `pnpm demo` (`examples/vite-trace-demo`) for the visual check that the payload is actually colored
  in a terminal and that the surrounding message keeps its own color; clear
  `examples/vite-trace-demo/node_modules/.vite/deps` first so the dev server does not serve a frozen
  older `dist/`.
- `pnpm run docs` after the JSDoc pass, confirmed by typedoc's own "html generated at ./docs" output
  and a changed `docs/` tree.
