# Spec: Structured output stream templates

> Grounding: architect (domain) consulted · web-researcher (findings) skipped: internal-only

## Frame the problem

Loxer events carry rich raw state, but the default development destination previously mixed ANSI
formatting, props formatting, box layout, final text construction, and `console.log` in one private
implementation. A custom destination could receive the raw lox, but had to recreate the presentation
or abandon it.

The output API uses one typed event stream and reusable structured templates. `OutputLoxRenderer`
and `ErrorLoxRenderer` derive a plain representation and a colored representation from a raw lox.
They do not choose a destination. A destination may compose the template into one line, persist its
fields independently, or apply its own transport-specific presentation. The default development
console destination composes the colored template; production remains silent unless an output stream
is supplied.

The scope includes the unified stream, structured templates, render-time color and box helpers, and
their public documentation. It preserves logging levels, history, raw lox identity, box geometry,
and opt-in props rendering. It does not prescribe a string-only rendering API, a callback factory,
or a declarative transport format.

## Acceptance criteria

- [ ] `Loxer.init` accepts one optional typed `output` stream for every emitted event. The event is
  a discriminated union of `kind: 'log'` and `kind: 'error'`, with `environment: 'dev' | 'prod'`;
  only the error variant carries its history snapshot.
- [ ] A registered output stream receives the unchanged raw lox and suppresses every built-in
  destination. An absent stream retains development console output and production silence.
- [ ] The package publicly exports separate `OutputLoxRenderer` and `ErrorLoxRenderer` helpers.
  Each returns a destination-independent template containing plain fields and matching `colored`
  fields for module text, message, time consumption, box, props, and timestamp.
- [ ] `ErrorLoxRenderer` extends the ordinary template with stack and open-log context. Highlighted
  errors include those fields; unhighlighted errors leave them empty.
- [ ] Templates perform formatting only: they do not call `console`, mutate the lox/history, or
  deliver an event. A destination can compose the returned fields into its own transport payload.
- [ ] The default development destination is a thin console adapter over the colored template. Its
  output includes the template timestamp, module text, box, message, time consumption, requested
  props, and applicable error context.
- [ ] `ANSIFormat.colorLox` accepts an options object for module opacity and configurable highlight,
  warning, and error colors. With no highlight color, ordinary highlighted messages use ANSI reverse
  styling and reset it afterward.
- [ ] `LoxerConfig` no longer owns output colors, close-title opacity, color disabling, or the
  default box layout. Renderers expose both plain and colored fields so destinations select the form
  they need without changing event data.
- [ ] Box segments retain an explicitly configured module layout, while `BoxFactory.getBoxString`
  can apply a default layout at rendering time for segments without one. This preserves module
  overrides and lets destination code choose a fallback layout.
- [ ] Props remain opt-in through `lox.printProps`; both template forms preserve their current
  indentation connection to the output destination's preceding columns.
- [ ] Tests cover stream discrimination and history, raw event identity, template plain/colored
  fields, highlighted error context, default inverted highlighting, configurable severity colors,
  default console composition, production silence, and module/default box-style behavior.

## Definition of done

- [ ] Acceptance criteria met.
- [ ] Public stream/template types and exports compile in consumer type tests.
- [ ] Existing behavioral suites are migrated from four callbacks to the unified stream without
  weakening their assertions for levels, errors, history, boxes, decorators, or tracing.
- [ ] Public API JSDoc, the output guide, props guide, examples, and migration appendix describe the
  structured-template model; generated API HTML is regenerated after JSDoc changes.
- [ ] `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm typecheck:test`, and `pnpm typecheck:types` pass.

## Open questions

- The public names and return types of the structured templates should be finalized with explicit
  exported interfaces before documentation is written.
