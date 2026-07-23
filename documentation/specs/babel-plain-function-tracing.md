# Spec: Babel Instrumentation for Plain-Function Traces

> Grounding: architect (domain) consulted · web-researcher (findings) consulted

## Frame the problem

Loxer boxes make synchronous and asynchronous data flow visible, but tracing a function currently
requires manual `open`, `of`, and `close` calls and a locally retained box ID. The existing `@trace`
helper removes that lifecycle work only for class methods; it cannot annotate plain functions.

Developers using a Babel-capable TypeScript build need an opt-in way to trace plain functions without
putting box lifecycle code in their function bodies. An instrumented invocation must create a distinct
box, close it when the invocation finishes, and link direct Loxer entries made by that function to the
same box. The source must remain valid TypeScript so editor syntax highlighting, type checking, and
autocomplete remain available.

This feature covers a Babel-based instrumentation experience for named plain functions, including
exported declarations and functions held by named bindings. It covers synchronous functions and
Promise-returning functions. It does not require `AsyncLocalStorage`, a Node runtime-baseline change,
or automatic parent-context propagation into uninstrumented helpers, detached callbacks, event
handlers, generators, or async generators. Existing manual box APIs and the class-method `@trace`
decorator remain supported.

Standard TypeScript/ECMAScript decorator syntax does not currently apply to standalone function
declarations, so the opt-in surface must use ordinary, valid TypeScript rather than an invented
`@trace function` syntax. Babel projects must retain their normal TypeScript type-checking workflow;
Babel transformation is not a replacement for it.

V1 uses `loxed(target, options)`, imported from `loxer/instrument`, as a typed marker immediately
beside a named function binding. The build transform removes the marker after instrumenting that
binding; executing an untransformed marker must fail with a clear configuration error.

`LoxedOptions` supports the function-relevant current trace options: `moduleId`, `level`,
`highlight`, `openMessage` (`functionName`, `args`, `types`, or a formatter), `closeMessage`
(`functionName`, `result`, `prettyResult`, or a formatter), `argsAsItem`, and `resultAsItem`.
It does not support `className.functionName`. Uncaught failure records the original error and closes
the box with `<functionName> failed`; formatting failures fall back to the default message and never
change application behavior.

## Acceptance criteria

- [ ] A Babel-capable TypeScript project can opt a supported named plain function into Loxer tracing
  with `loxed(target, options)` imported from `loxer/instrument`; its options receive normal
  TypeScript autocomplete and type checking.
- [ ] `loxed` supports function-level module, level, highlight, message, and item options equivalent
  to the useful current `TraceOptions` modes, but does not expose the class-only
  `className.functionName` mode.
- [ ] An opt-in synchronous function invocation emits one opening box entry before its body runs and
  one closing box entry after it returns, without requiring `Loxer.open`, `Loxer.of`, or
  `Loxer.close` in that function body.
- [ ] An opt-in Promise-returning function keeps its box open across `await`/promise continuations and
  closes it only after fulfillment; concurrent invocations keep separate boxes and never attach each
  other's direct entries.
- [ ] An uncaught synchronous throw or Promise rejection from an instrumented function preserves the
  original thrown/rejected value for the caller, records the failure in that function's box, and
  terminates that box with a `<functionName> failed` closing entry.
- [ ] A throwing trace-message formatter or non-serializable value used for a result message falls
  back to the default trace message and does not change the function's result or error behavior.
- [ ] Direct `Loxer.log`, `Loxer.error`, `Loxer.namedError`, and their documented highlight, level,
  and module modifier forms in an instrumented function's lexical body are linked to that invocation's
  box. Their existing message, item, modifier, output, level, and error semantics remain observable.
- [ ] An instrumented function calling another instrumented function produces separate trace boxes;
  each function's direct entries attach to its own invocation rather than to a globally shared
  "current" box.
- [ ] Direct entries in a separately defined or detached uninstrumented function are not promised to
  join the caller's box. The documentation states this boundary and identifies explicit manual boxes
  or separate instrumentation as the supported alternatives.
- [ ] The generated trace preserves the original function's callable behavior: parameters, `this`,
  synchronous return value, fulfilled value, and exception/rejection behavior remain usable by the
  caller.
- [ ] Instrumented source remains debuggable: generated output has source-map support and documented
  Babel-plugin ordering/compatibility requirements.
- [ ] Existing manual box behavior, pre-initialization queueing, disabled logging, hidden normal logs,
  production output rules, and the existing class-method `@trace` API do not regress.

## Definition of done

- [ ] Acceptance criteria met
- [ ] Automated coverage demonstrates synchronous success and failure, asynchronous fulfillment and
  rejection, overlapping asynchronous invocations, nested instrumented functions, direct linked
  logs/errors, disabled mode, and pre-initialization queueing.
- [ ] The public opt-in surface, supported function forms, Babel setup/order, source-map behavior, and
  non-propagation boundary for uninstrumented descendants are documented.
- [ ] Public TypeScript declarations expose the opt-in configuration with editor autocomplete.
- [ ] The project build, lint, and test suites pass.

## Open questions

- none
