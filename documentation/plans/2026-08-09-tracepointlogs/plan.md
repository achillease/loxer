# Plan: Context-aware single logs with `trace.point`

> Model/effort: GPT-5/unknown

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed request; the completed fluent trace-marker work is the compatibility baseline

## Context

Function traces can infer a function name and its class or file parent, build a message from that
context, and carry parent/function spans that the built-in renderer colors. Those features currently
arrive only as part of an open/close box lifecycle. A caller that wants one ordinary log must write
the context into the message itself and loses the structured trace coloring.

Add `trace.point` as a separate build-time marker for one context-aware log. It uses the fluent
module, highlight, props-printing, and level style already established by `Loxer` and the function
trace marker, but it neither wraps a function nor opens a box:

```ts
trace.point.info('order saved', order);
trace.point.ORDER.h().debug('fn', 'order saved', order);
trace.point.m('ORDER').pp({ depth: 1 }).warn('parent.fn', 'retrying', request);
```

The selector forms render `saveOrder(): order saved` and `orders.saveOrder(): retrying`. Parent and
function names use the existing trace spans; the suffix keeps the ordinary color for its level or
highlight. ~~Calls without a selector behave like an ordinary Loxer message and props call.~~
Revised: a function-valued first argument is a context-aware message callback; other non-selector
values use the ordinary Loxer message and props call.

## Approach

### 1. Give `trace.point` its own fluent grammar

Expose a `TracePoint` surface from `loxer/trace` and reserve `point` on the outer `trace` marker so it
cannot be mistaken for a direct module selector. A registered module literally named `point` remains
available through `trace.m('point')`.

Support these point modifiers, once per alias family and in any order:

- `module(moduleId?)` / `m(moduleId?)`;
- direct registered-module properties, including `trace.point.ORDER`;
- `highlight(doit?)` / `h(doit?)`;
- `printProps(options?)` / `pp(options?)`.

Support terminal `error`, `warn`, `log`, `info`, and `debug` calls, with `log` normalized to `info`.
Do not expose `open`, `of`, or lifecycle `.props(target)`: a point is one log, and every value after
its selected message is already attached as a prop.

~~Model each terminal with an ordinary-message call and a selector call:~~

```ts
// Invalidated grammar
(message?: unknown, ...props: unknown[]): void;
(selector: 'fn' | 'parent.fn', message?: unknown, ...props: unknown[]): void;
```

Revised grammar: each terminal accepts an ordinary message, a contextual selector, or a contextual
callback. `TracePointMessage` receives the span-aware `fn` and `parentFn` printers; values after the
callback are props.

```ts
(message?: unknown, ...props: unknown[]): void;
(selector: 'fn' | 'parent.fn', message?: unknown, ...props: unknown[]): void;
(message: TracePointMessage, ...props: unknown[]): void;
```

Keep every point entry as a build-time marker. The runtime proxy must throw the existing clear
missing-transform error for bare, modified, terminal, and direct-module forms.

### 2. Resolve the argument split at runtime

The generated helper tests the first terminal argument by exact primitive equality, rather than only
recognizing string literals in the AST. A variable whose runtime value is `'fn'` or `'parent.fn'`
therefore behaves like the corresponding literal.

- For `'fn'`, argument two is stringified as the suffix after the inferred `fn()`; arguments three
  onward are props.
- For `'parent.fn'`, argument two is stringified after the inferred `parent.fn()`; arguments three
  onward are props.
- ~~For every other first value, argument one is passed through Loxer's existing message funnel and
  arguments two onward are props.~~
- Revised: a function-valued first argument is invoked as `TracePointMessage` with `fn` and
  `parentFn` printers; its return value is rendered as a span-aware contextual message and arguments
  two onward are props. If it throws, output falls back to `fn()`.
- Every other non-selector first value is passed through Loxer's existing message funnel and arguments
  two onward are props. ~~With no terminal arguments, the point uses the default contextual trace
  message, `parent.fn()`.~~ An absent first argument follows the ordinary message funnel and produces
  an empty message.
- An omitted or empty selector-form message renders only `fn()` or `parent.fn()`, without a dangling
  separator.

Use `: ` between a contextual name and a non-empty selector message. Preserve the ordinary Loxer
behavior for non-callback objects, primitives, `undefined`, control-character sanitization, and raw
prop identity. Selector and callback output retain only their parent/function portions as
trace-message spans; the user message is not recolored as an argument/result value.

The exact strings `'fn'` and `'parent.fn'` are reserved within point terminals. A caller that needs
either exact literal as an ordinary message uses `Loxer.info('fn')` (or the corresponding level),
avoiding another escape API.

### 3. Collect point calls as a second Babel marker kind

Extend the plugin's program pass to collect both function markers and point markers rooted at the
exact imported `trace` binding. A local or shadowed object named `trace` remains untouched.

For each point call:

1. Parse and validate its terminal, modifiers, aliases, and direct-module segment.
2. Resolve the nearest enclosing function and its stable source name.
3. Resolve the parent using the same class-first, file-fallback rule as a normal function trace.
4. Record the ordered modifier expressions and untouched terminal arguments.
5. Replace the entire chain with a call to a selectively imported internal point helper.

Extract the existing source-name and parent-name walk from `marker-collection.ts` into a shared plugin
helper because function markers and point markers become independent consumers of the same semantic
rule. A point whose enclosing function cannot be named receives a code-frame diagnostic directing the
caller to give the function a stable binding or name. A top-level point is rejected because there is
no function context for this marker to describe. A point in that function's parameter defaults is
rejected with a diagnostic directing the caller to move it into the function body: parameter defaults
run before the trace box opens. Point calls do not wrap their enclosing function, so generators and
async functions need no special lifecycle handling.

Generated code must evaluate modifier arguments exactly once from left to right, followed by terminal
arguments exactly once from left to right. Preserve spread arguments. Add only the runtime helpers a
file needs, so a point-only module does not import lifecycle helpers and a mixed module cleans up the
original marker binding only after both marker kinds are transformed.

### 4. Render and write through private runtime paths

Add a point-message renderer beside the existing trace open/close renderers. Reuse the marked-name,
qualified-name, sanitization, `TraceMessage`, and span extraction machinery so decorators, function
markers, and points cannot drift in naming or color behavior.

Have the generated helper route through an internal Loxer single-log operation rather than emitting a
public Loxer chain. The internal operation accepts the resolved level, module, highlight, printer
configuration, optional containing-box id, and a lazy contextual-message resolver. It must:

- create one `type: 'single'` log and preserve the usual history/output/module-threshold behavior;
- defer contextual message stringification until after the existing visibility gate, while still
  rendering queued pre-init logs when their output threshold is not yet known;
- ~~keep ordinary-message calls on Loxer's current message funnel;~~
- keep non-callback ordinary-message calls on Loxer's current message funnel and render callback
  messages through the shared span-aware trace renderer;
- attach props unchanged and store only ordinary `PropsPrinterOptions`;
- reset one-shot state exactly once even when disabled or hidden;
- allow level `error` without widening public manual log or box APIs.

`trace.point.error(...)` is an ordinary error-level `OutputLox` on the normal log stream, matching
`trace.error(...)` lifecycle severity. It does not call `Loxer.error`, create an `ErrorLox`, or use an
error output callback; callers use `Loxer.error(error)` when they want error-event semantics.

### 5. Attach points to an existing generated trace box

When a point sits directly in a function already instrumented by a function marker, attach its single
log to that invocation's box, just as the plugin currently rewrites a direct `Loxer.*` call to
`Loxer.of(traceId)`. The point does not open or close another box.

Transform inner point calls before wrapping their enclosing traced function, then extend the linked-log
rewrite to pass the invocation-local trace id to the generated point helper. Keep the existing lexical
boundary: a point in a nested function is not attached to the outer function's box unless that nested
function has its own marker. An explicit point level remains the sole visibility gate and is never
rewritten to match the containing box's level.

### 6. Document one mental model

Teach `trace()` as function lifecycle instrumentation and `trace.point` as one context-aware log. Show
ordinary, selector, and callback argument routing; direct modules; props printing; error-level
normal-stream semantics; missing-transform behavior; anonymous-function diagnostics; and box
attachment. Update the Babel and Vite setup guides and add a built demo call so the marker is
exercised in a real consumer.

## Critical files

The `src/trace.ts`, `src/tracing-types.ts`, and `src/core/TraceMessage.ts` entries include the
callback contract: public callback typing, callback routing, and span-aware callback rendering.

- `src/trace.ts` — public `TracePoint` chain types, reserved `point` member, missing-transform proxy,
  generated helper, runtime selector split, and forwarding to the private writer.
- `src/tracing-types.ts` — point selector/configuration types shared by generated code and runtime.
- `src/core/TraceMessage.ts` — shared contextual point renderer and parent/function spans.
- `src/Loxer.ts` — private lazy single-log path for all `LogLevel` values and optional generated box
  membership, without widening the public `Loxer` surface.
- `packages/babel-plugin-loxer-trace/src/marker-types.ts` — point marker records and selective runtime ids.
- `packages/babel-plugin-loxer-trace/src/marker-collection.ts` and a shared source-name helper — collect
  both grammars while reusing one name/parent resolution rule.
- `packages/babel-plugin-loxer-trace/src/marker-transform.ts` — emit point configuration and arguments
  without changing evaluation order.
- `packages/babel-plugin-loxer-trace/src/plugin.ts` — coordinate mixed marker collection, ordering,
  helper imports, reference cleanup, and point-only modules.
- `packages/babel-plugin-loxer-trace/src/linked-loxer.ts` — give a generated point inside a traced
  function its invocation-local box id.
- `test/trace-point.test.ts`, `test/trace-message.test.ts`, `test/plain-function-trace-types.ts`, and
  `test/types/registry.test-d.ts` — runtime, rendering, overload, modifier, and direct-module coverage.
- `test/babel7-compat.test.ts`, `test/vite-plugin-loxer-trace.test.ts`, `test/vite-plugin-build.test.ts`,
  and `test/dist-consumer.test.ts` — adapter and built-package coverage.
- `README.md`, `documentation/index.md`, `packages/babel-plugin-loxer-trace/README.md`,
  `packages/vite-plugin-loxer-trace/README.md`, and `examples/vite-trace-demo/src/main.ts` — public
  guidance and a compiled example.

## Risks & open questions

- `point` becomes a reserved direct-module property. Existing `trace.point.info(target)` code that
  meant module `point` changes meaning; `trace.m('point').info(target)` remains available and must be
  documented and type-tested.
- Selector dispatch is value-based. Exact `'fn'` and `'parent.fn'` messages select context mode even
  when they come from a variable; tests must pin dynamic values and all near misses such as
  `'fn(types)'` as ordinary messages. A function-valued first argument is intentionally a callback,
  so its evaluation, props shift, and thrown-callback fallback need their own tests.
- Name inference can fail for anonymous callbacks with no stable surrounding name. Fail at transform
  time rather than inventing a positional name that changes when code moves.
- Parameter defaults run before an instrumented function opens its trace box. Reject a point there at
  transform time rather than emitting an unboxed log or changing function-wrapper semantics.
- Side-effectful chain arguments can be reordered or duplicated by AST construction. Generated
  configuration preserves source property order, and tests assert the full modifier/terminal order.
- A point inside a traced function could silently diverge from direct Loxer behavior. The transform
  explicitly attaches it to that box and tests nested, hidden-box, and outranking-level cases.
- Error-level point logs can be confused with `Loxer.error`. The types, guide, output-stream tests,
  and JSDoc state that point errors are ordinary logs.
- Caller messages and props receive no automatic redaction. The point reuses Loxer's existing
  caller-controlled destination, masking, and retention policy.
- No dependency or unresolved product choice remains.

## Verification

Add table-driven transform and runtime coverage for all five terminals, both selector values, dynamic
selectors, ordinary values, callback messages and fallback, missing messages, props shifting, modifier
aliases/orders, direct modules, reserved modules, malformed chains, renamed imports, shadowed
identifiers, and missing transforms.

Pin these observable outcomes:

- contextual output is exactly `fn(): message` or `parent.fn(): message`, with parent/function spans
  and an ordinarily colored suffix;
- a non-selector, non-function first argument has the same plain message and prop identities as the
  equivalent Loxer call;
- a callback receives span-aware `fn` and `parentFn` printers, keeps following values as props, and
  falls back to `fn()` when it throws;
- class, file, declaration, method, bound arrow, nested function, and anonymous-function cases follow
  the existing trace naming rules;
- a point in a parameter default receives a code-frame diagnostic that directs the caller to the
  function body;
- modifier and terminal expressions run once in source order, including spreads;
- module thresholds avoid hidden-message rendering, while pre-init queue replay stays correct;
- `log` and `info` are equivalent; `point.error` emits one normal-stream `OutputLox` at level `error`;
- a point alone is unboxed, while a point directly inside an instrumented function joins that box and
  never opens another;
- point-only and mixed point/function-marker modules import only needed helpers and contain no marker
  calls after transformation;
- source and built Babel/Vite consumers expose the same behavior and types.

Run, in order:

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`
4. `pnpm typecheck:test`
5. `pnpm typecheck:types`
6. `pnpm demo:build`
7. `pnpm run docs` and confirm TypeDoc reports `html generated at ./docs`
8. Transform and execute representative point-only and mixed point/function-marker probes against the
   built Babel plugin and `dist/trace.js`

No implementation or test execution belongs to this planning phase.
