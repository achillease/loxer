# Spec: Trace message templates and colored call payloads

> Grounding: architect (domain) n/a — grounded inline against `src/tracing-types.ts`, `src/trace.ts`,
> `src/decorators/trace.ts`, `src/core/TraceNames.ts`, `src/core/ANSIFormat.ts` and
> `src/core/OutputRenderer.ts` · web-researcher (findings) skipped: internal-only

## Frame the problem

A traced function's box messages are built from a small fixed set of styles. `openMessage` offers
`'functionName'`, `'parent.functionName'`, `'types'` and `'args'`; `closeMessage` offers
`'functionName'`, `'parent.functionName'` and `'result'`. The set is incomplete in an obvious way —
a caller who wants the class **and** the arguments (`Checkout.calculate(19.95, 3)`) cannot ask for
it, because the parent and the payload styles are mutually exclusive. The style names also describe
their output only loosely: `'args'` names its payload but not the call it renders, while
`'functionName'` names a value rather than the rendered shape.

Everything a trace message prints is one uniform run of text. In a wall of boxed logs the call's
payload — the arguments, their types, the result — is the part a reader scans for, and it is
indistinguishable from the function name carrying it. Rendered props already solve this problem for
values, coloring a string payload with `ANSIFormat.fgString`; a trace message does not.

The escape hatch is the callback form, and it is the weakest of the three options. A callback
receives the bare argument tuple or result and must rebuild everything the presets know for free:
the function's own name, its class or file, the parentheses, and any coloring. Anything a callback
writes is therefore plain, differently shaped text — the presets and the callbacks produce
recognizably different logs from the same trace.

This is for the developer reading a live trace: the audience of the box layout, the module colors,
and the props printer. The change covers the two trace runtimes together — the `@trace` decorator
(`src/decorators/trace.ts`) and the `trace()` marker runtime (`src/trace.ts`) — which today carry
two independent copies of the message-building logic and must not disagree on a single rendered
message.

In scope: the `FunctionOpenMessage` / `FunctionCloseMessage` unions and their rendering, the colored
payload region, the callback signature and the printer helpers it receives, the failure message's
name form, and the user-facing documentation for all of it.

Out of scope: props capture and rendering (`argsAsProps` / `printArgs` / `printResult`), box layout,
module colors, the level and highlight options, the shape of the output stream event, and any change
to how the build-time transforms discover and mark functions.

Loxer 3.0.0 is unreleased, so the current style names carry no compatibility obligation: they are
replaced outright, with no aliases and no deprecation window.

## Acceptance criteria

### Templates

- [ ] `openMessage` accepts exactly `'fn'`, `'parent.fn'`, `'fn(types)'`, `'fn(args)'`,
  `'parent.fn(types)'`, `'parent.fn(args)'`, or a callback. The former names
  (`'functionName'`, `'parent.functionName'`, `'types'`, `'args'`) are gone, and using one is a
  compile error.
- [ ] `closeMessage` accepts exactly `'fn'`, `'parent.fn'`, `'fn(result)'`, `'parent.fn(result)'`,
  or a callback. `'functionName'`, `'parent.functionName'` and `'result'` are gone.
- [ ] `openMessage` defaults to `'parent.fn'`, rendering `Checkout.calculate()` where the parent is
  known and `calculate()` otherwise. `closeMessage` defaults to `'fn'`, rendering `calculate done`.
- [ ] For a method `calculate(price: number, quantity: number)` of class `Checkout` returning
  `{ total: 59.85 }`, the templates render:

  | option | value | message |
  | --- | --- | --- |
  | `openMessage` | `'fn'` | `calculate()` |
  | `openMessage` | `'parent.fn'` | `Checkout.calculate()` |
  | `openMessage` | `'fn(types)'` | `calculate(number, number)` |
  | `openMessage` | `'fn(args)'` | `calculate(19.95, 3)` |
  | `openMessage` | `'parent.fn(types)'` | `Checkout.calculate(number, number)` |
  | `openMessage` | `'parent.fn(args)'` | `Checkout.calculate(19.95, 3)` |
  | `closeMessage` | `'fn'` | `calculate done` |
  | `closeMessage` | `'parent.fn'` | `Checkout.calculate done` |
  | `closeMessage` | `'fn(result)'` | `calculate({"total":59.85}) done` |
  | `closeMessage` | `'parent.fn(result)'` | `Checkout.calculate({"total":59.85}) done` |

- [ ] A `parent.` template renders the parent through the existing `qualifiedFunctionName` rule —
  the class for a decorated method or a marked class member, the file for a marked plain function,
  the bare function name where no parent is known.
- [ ] A `'fn(result)'` template whose result does not serialize (`JSON.stringify` returns
  `undefined`, e.g. a `void` function) falls back to the `'fn'` / `'parent.fn'` message of the same
  name form, rather than printing `calculate(undefined) done`.
- [ ] A failed call closes with the name form its `closeMessage` selected and no payload:
  `calculate failed` for the `'fn'` forms, `Checkout.calculate failed` for the `'parent.fn'` forms
  and for a callback (which the failure path cannot invoke, having no result).
- [ ] Both trace runtimes render every template identically for the same options and the same call,
  driven from one shared table of cases.

### Colored message

- [ ] In the payload templates, the text between the parentheses is colored with the same color the
  props printer gives a string (`ANSIFormat.fgString`). The parentheses, the ` done` suffix and the
  argument separators are not colored.
- [ ] The function name is colored with the color the props printer gives a function
  (`ANSIFormat.fgFunction`) and its parent with the one it gives a class (`ANSIFormat.fgClass`), in
  every template and in both callback printers. The `.` joining a parent to a name is not colored.
- [ ] `ANSIFormat.fgClass` is one palette entry shared with the props printer, which renders
  `[Class: X]` in it — not a color the trace renderer owns alone.
- [ ] A message's own coloring survives an embedded payload: a close message (rendered with
  `fgCloseLog`) or a warning message (rendered with `fgWarn`) is still colored after the payload's
  reset sequence — no part of a message reverts to the terminal default because of the payload.
- [ ] Caller-supplied content is sanitized for control characters **before** coloring, so no
  argument, result, or callback return value can inject its own escape sequence, and no color code
  the renderer adds is stripped by sanitization.

### Escape-free plain form

- [ ] `lox.message` — the value a registered output stream receives on the raw lox, and the value
  stored in the history — contains no ANSI escape sequences, whichever template or callback produced
  it.
- [ ] `OutputLoxRenderer` / `ErrorLoxRenderer` return the payload color in `colored.message` only;
  the template's plain `message` field is escape-free.
- [ ] An error's `OPEN_LOGS:` context, which joins the messages of open boxes, is escape-free.
- [ ] The built-in development console shows the payload colored.

### Callbacks

- [ ] `openMessage` and `closeMessage` callbacks receive a single object argument:
  `({ args, fn, parentFn })` and `({ result, fn, parentFn })` respectively. The bare-value
  signatures (`(args) => …`, `(result) => …`) are gone.
- [ ] `Args` and `Result` are typed on the context object exactly as they are typed today — inferred
  from a `trace()` marker's named target, and supplied through the explicit type arguments of
  `@trace<Args, Result>()` and `trace<Args, Result>(options)`.
- [ ] `fn` and `parentFn` are of the exported type `TraceCallPrinter`, `(content?: unknown) => string`.
  `fn(content)` renders `name(content)` and `parentFn(content)` renders `Parent.name(content)`, each
  part colored exactly as a template's is. Called with no content — or with one that renders empty —
  each renders its name with empty parentheses.
- [ ] `content` is any value at all, rendered by the rule a log's own message takes: a primitive
  through `String()`, an object or a function as one compact line, so `fn(basket)` reads as the
  basket's contents rather than as `[object Object]`.
- [ ] A callback that returns text around a printer keeps that text uncolored — for
  ``({ parentFn }) => `retrying ${parentFn(3)}` `` the `retrying ` is plain while `Checkout`,
  `calculate` and `3` carry their colors.
- [ ] The existing callback safety net is unchanged: a callback that throws, or returns a
  non-string, falls back to the default message for that phase.

### Cost

- [ ] Resolving a parent name stays lazy — a trace whose options name no `parent.` template and
  whose callback never calls `parentFn` performs no parent-name resolution, including for a callback
  that receives `parentFn` and ignores it.
- [ ] Building a colored payload is likewise paid only by the templates and callbacks that ask for
  one.

## Definition of done

- [ ] Acceptance criteria met.
- [ ] One shared table of cases drives both trace runtimes, extending the existing
  `test/trace-cases.ts` pattern; every template and both printer helpers are covered for the
  decorator and the marker runtime, including the parentless and non-serializable fallbacks and the
  failure message.
- [ ] Tests assert the plain/colored split at the renderer boundary, not only the console output:
  an escape-free `lox.message` and plain template field beside a colored `colored.message`.
- [ ] Any build-time transform code that reads the style literals
  (`packages/babel-plugin-loxer-trace`, `packages/vite-plugin-loxer-trace`) is updated to the new
  names, and the packages' own suites pass.
- [ ] JSDoc on `FunctionOpenMessage`, `FunctionCloseMessage`, `TraceOptions` and `TraceCallPrinter`
  documents the full template set and the callback context; the tracing sections of
  `documentation/index.md` are updated; `docs/` is regenerated with `pnpm run docs` and the
  regeneration is confirmed by the command's own output and a changed `docs/` tree.
- [ ] `TraceCallPrinter` is exported from `src/index.ts` and from `loxer/trace`.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm typecheck:test` and `pnpm typecheck:types` pass.

## Open questions

- **How a log carries two message forms.** The escape-free criteria require the colored payload to
  reach `colored.message` without touching `lox.message`. One idea to explore in Planning: the trace
  runtime attaches the colored form as a temporary prop on the log, which the output stream reads and
  strips before the lox reaches a destination. Alternatives worth weighing against it: a dedicated
  internal field on the `Lox` holding the colored variant; the runtime handing the renderer the
  payload's span (offset and length) rather than a second string; or the runtime describing the
  message as name + payload parts and letting the renderer assemble both forms. Planning picks one —
  the criteria above are indifferent to which, except that a temporary prop must not be observable
  by a destination or by the props printer.
- **Where the shared renderer lives.** Both trace runtimes need the identical template renderer and
  printer helpers, which is the second concrete consumer that justifies extracting a shared internal
  helper (alongside `qualifiedFunctionName` in `src/core/TraceNames.ts`). Planning decides its home
  and boundary.
