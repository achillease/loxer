# Plan: inline trace markers — function literals and enclosing functions

> Grounding: architect (technical) n/a — surveyed inline and verified experimentally (see Context) ·
> web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed problem

## Context

The trace marker only accepts a named binding as its target: `trace()` must be a standalone statement
and its target must resolve to a function declaration or a function-initialized variable declarator
(`plugin.ts:228`, `trace-binding.ts:71-89`). Every callback passed straight into another call —
`useCallback`, `useEffect`, `useMemo`, an event prop, an array method — therefore has to be pulled out
into its own named declaration and marked on a separate line before it can be traced:

```tsx
const loadOrder = async (id: string) => { ... };
trace(loadOrder, ORDER_TRACE);
const load = useCallback(loadOrder, []);
```

Three statements to trace one callback. Grouping several markers into one
`trace([load, retry, syncOrders], ORDER_TRACE)` line reduces the ceremony but cannot remove it: the
declaration must still exist separately from the call that consumes it.

Four things were verified against the current plugin while framing this (each by running
`transformLoxerTrace` over a probe module):

1. A marker inside a hook body works and keeps per-invocation options — a `var _sharedTraceOptions`
   is hoisted into the hook scope, so two consumers never share a slot.
2. A marker whose target is a **parameter** is rejected: `trace() supports function declarations and
   named variable bindings only.` A builder helper (`makeTraced(fn, options)`) is therefore impossible
   — at build time there is no declaration left to rewrite.
3. A marker in **expression position** is rejected first by the statement guard: `trace() must be a
   standalone statement beside its named function binding.`
4. The options argument is already an arbitrary expression — an identifier, a spread literal, or a
   helper call all transform and are emitted verbatim (`_pickTraceOptions = orderTrace('PICK');`).

So the missing capability is narrow and well-bounded: accept the marker in expression position when
its target is a function *literal*, and wrap that literal in place. The alternative considered and
rejected was a runtime React hook (`useTraceCallback`) over the exported `__startTrace` /
`__observeTraceResult` helpers. It works — it was built and its three behaviors verified — but it adds
a third tracing mechanism with weaker semantics: the trace name must be passed by hand, and inner
`Loxer.log(...)` calls are not linked to the box, because that rewrite exists only in the Babel pass.
The inline marker keeps one mental model and one feature set, and helps every inline-callback site
rather than React specifically.

### Re-plan (2026-07-30): the motivating call site rejects the shape

Using the shipped inline-literal form in a real React app fails to lint. `react-hooks/use-memo` — a
rule in eslint-plugin-react-hooks v6's compiler-aligned set — **errors** on any first argument to
`useCallback`/`useMemo` that is not an inline function:

```
Expected the first argument to be an inline function expression.
> 37 |     trace(async (id: string) => {
     |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  eslint(react-hooks/use-memo)
```

The wrapper *is* that first argument, so no arrangement of the inline-literal form satisfies the rule;
the only escapes are an `eslint-disable` per call site or a return to the three-statement split. A
weaker version of this was recorded as a caveat about `exhaustive-deps` warning on an opaque callback;
the actual rule is stricter and fails the build. The inline-literal form stays correct and useful for
call sites outside a memoizing hook — array methods, event props, promise handlers, non-React code —
but it is not the answer for the React callback that motivated this plan.

The revised answer keeps the marker a **statement** and moves it *inside* the function it marks, so
the callback the hook receives is a genuine inline function again:

```tsx
const load = useCallback(async (id: string) => {
  trace({ moduleId: 'ORDER', openMessage: 'args' });   // marks the function it sits in
  Loxer.log('requesting');
  return (await fetch('/orders/' + id)).json();
}, []);
```

Both React rules are satisfied — the argument is inline, so `exhaustive-deps` can analyze the body
again — with no `eslint-disable`, no `additionalHooks` configuration, and no React awareness anywhere
in the plugin. Compared with the `useTracedCallback(fn, [deps], options)` hook this session also
weighed, it needs strictly less machinery: no emitted `useCallback`, no injected `react` import, no new
export, and it works for every inline callback rather than the two memoizing hooks.

The syntax is free. A `trace({ … })` call currently reaches `collectTargets` and errors with
"trace() targets must be named function-binding identifiers", so claiming it breaks no accepted code.
The three forms stay unambiguous by argument-0 kind: an object literal (or no argument at all) marks
the enclosing function, a function literal marks itself, an identifier or array literal is the
original statement form.

## Approach

Extend `babel-plugin-loxer-trace` to accept `trace(<function literal>, options?)` in expression
position, transforming the literal in place and evaluating to the traced function:

```tsx
// ⚠️ Superseded for memoizing hooks by the enclosing-function form below —
// react-hooks/use-memo rejects a non-inline first argument. Still the shape for
// every other inline call site (array methods, event props, promise handlers).
const load = useCallback(
  trace(async (id: string) => {
    Loxer.log('requesting');            // linked to this invocation's box, as in the statement form
    return (await fetch('/orders/' + id)).json();
  }, ORDER_TRACE),
  []
);
```

The statement form is unchanged; this is an additional accepted shape. **Implemented** — the sections
below describe what shipped; the enclosing-function form at the end of this section is the remaining
work.

**Accepted target.** A `FunctionExpression` or `ArrowFunctionExpression` as argument 0. An identifier
or an array literal in expression position keeps the existing statement-guard error — grouping and
named-binding targets stay statement-form features. Generators stay rejected. A literal marked by a
standalone statement stays on the statement form's diagnostic too: the traced function would be
discarded there, and asking for a named binding describes that mistake better than a missing name
does.

**Codegen.** Replace the marker call with a sequence expression that assigns the options to a hoisted
`var` in the nearest function scope, then evaluates to the wrapper:
`(_loadTraceOptions = ORDER_TRACE, _withTraceFunctionLength(<wrapper>, 1))`. The hoisted slot is what
preserves parity with the statement form: the options expression is evaluated once per *marker
evaluation* (per render, when the marker sits in a component or hook), not once per call of the traced
function. The wrapper body itself reuses `buildWrapperBody`'s existing preserved-original path
(`trace-binding.ts:209-216`), which already keeps the literal intact and invokes it with
`.apply(this, args)`.

**Callable semantics.** An arrow literal gets an arrow wrapper (lexical `this` preserved); a
`FunctionExpression` literal is traced through its own body — as the statement form already does for
a function-initialized binding — so it keeps its parameter list, and with it `this` from the call
site, `arguments`, `Function.length`, and a named literal's recursive self-reference.
`Function.length` is preserved for the arrow wrapper through a new runtime helper
`__withTraceFunctionLength(fn, length)` that defines the property and *returns* `fn` — the existing
`__setTraceFunctionLength` (`src/trace.ts:21-26`) returns void and is emitted as a statement, which
expression position cannot use.

**Trace name.** Resolved at build time in this order: an explicit `name` option; the enclosing
`VariableDeclarator` / assignment / object-or-class property name (this is what makes
`const load = useCallback(trace(fn, opts), [])` report `load`); a named `FunctionExpression`'s own id.
If none applies — `useEffect(trace(() => {…}, opts), [deps])` is the realistic case — the plugin
raises a code-frame error naming both fixes (assign it to a `const`, or pass `name`). Failing loudly
beats inventing a positional name that would silently change when code moves. `name?: string` is added
to `TraceOptions` (`src/tracing-types.ts`), documented as the inline form's explicit name; the
decorator and statement form ignore it, since both already know their target's name. It has to be a
string literal — the transform reads it while it builds — and a computed one is rejected by name
rather than silently falling through to the enclosing-binding chain.

**Public signature.** `trace` gains overloads so the inline form typechecks and infers:
`trace<T>(target: T, options?: TraceOptions<Parameters<T>, Awaited<ReturnType<T>>>): T` for a single
target, and a `void`-returning overload for the array form. This refines the current `never` return
without breaking statement-form callers (a discarded return value), and it is what lets
`useCallback(trace(fn, opts), [])` keep `fn`'s type.

**Nested markers.** Inline markers are transformed innermost-first, so an outer wrapper always closes
over already-transformed inner code and no path is invalidated by a parent rewrite. `Loxer` call
rewriting runs on the literal's body exactly as for the statement form, and keeps skipping nested
functions — an effect cleanup returned from a traced literal still needs its own marker.

### Enclosing-function form

**Implemented.** Three points shifted during implementation, each recorded in the worklog: an arrow's
recorded arguments come from its own parameter list (it has no `arguments`, and a rest-parameter
wrapper would move the options expression out of the scope that can read those parameters); options
may not read a name the marked body declares, which is rejected by name; and the name chain resolves
a function's **own** name before the surrounding declarator, unifying this form and the inline form
into one chain. The section below describes the shipped form.

Accept `trace(options?)` — argument 0 an object literal, or no arguments — as a standalone statement
inside a function, marking the function that contains it. The marked function is traced through its own
body, exactly as the statement form traces a function declaration, so it keeps its parameter list,
`this`, `arguments`, `Function.length`, and any self-reference without a wrapper or a length helper.

**Position.** The marker must be the **first statement** of the function body. The transform opens the
box before the body runs, so a marker sitting further down would read as if tracing started there. A
marker anywhere else in the body is a code-frame error naming the fix. This also keeps the shape
self-documenting: the trace declaration is the first thing in the function.

**Which functions.** Any function that owns a body — declaration, function expression, arrow with a
block body, class method, object method. An arrow with an expression body has no statement position, so
it is simply not a host for this form; the inline-literal form covers it. Generators stay rejected.

**Name.** The existing chain, unchanged: explicit `name` option, then the enclosing declarator /
assignment / property, then a named function's own id. `const load = useCallback(async () => { trace(…) }, [])`
reports `load` through the same resolution that already names the inline-literal form. A function with
no name available is the same code-frame error the inline form raises.

**Options evaluation.** Unlike the other two forms, the options expression is written *inside* the
traced function, so it is evaluated **once per invocation**, at entry — not once per marker evaluation.
No hoisted `var` slot and no sequence expression are involved; the expression moves into the
`__startTrace(...)` call the transform emits at the top of the body. This is a deliberate difference,
and the honest one: options written inside a function body should run when that body runs. It is
documented as part of the form rather than smoothed over, and a helper call in the options of a
hot function is a cost the author can see.

**Collisions.** A function may carry one marker. A function already selected by a statement-form
marker, or an inline literal that also contains an enclosing-form marker, is a code-frame error —
the same rule `assertOneMarkerPerTarget` enforces today, extended to cover the new form's hosts.

## Critical files

- `packages/babel-plugin-loxer-trace/src/plugin.ts` — `collectMarkers` currently throws on a
  non-`ExpressionStatement` parent (`:228`); split into statement-form and inline-form markers, make
  `Marker` a union, exempt inline markers from `assertOneMarkerPerTarget` (no binding to collide), and
  order inline transforms innermost-first.
- `packages/babel-plugin-loxer-trace/src/trace-binding.ts` — add the inline entry point beside
  `traceBinding`, reusing `buildWrapperBody`'s preserved-original path and
  `rewriteDirectLoxerCalls`; choose arrow vs `function` wrapper by literal kind.
- `src/trace.ts` — add `__withTraceFunctionLength` (returns the function); widen `trace`'s signature
  to the overload pair; extend the JSDoc with the inline form.
- `src/tracing-types.ts` — add `name?: string` to `TraceOptions` with JSDoc scoping it to the inline
  marker.
- `test/plain-function-trace.test.ts` — extend with the inline-form suites, reusing the existing
  data-module harness.
- `documentation/index.md` — teach the inline form alongside the statement form and the grouped list.
- `examples/vite-trace-demo/` — add one inline-marker call site so the shape is exercised by
  `pnpm demo:build`.

For the enclosing-function form:

- `packages/babel-plugin-loxer-trace/src/plugin.ts` — extend the argument-0 dispatch in
  `collectMarkers` with the object-literal / no-argument case; resolve the host function and reject a
  marker that is not its first statement; extend the one-marker-per-function check to the new hosts;
  keep the depth ordering that already sequences nested markers.
- `packages/babel-plugin-loxer-trace/src/trace-binding.ts` — add the enclosing-function entry point,
  reusing the in-place body rewrite the statement form uses for a function declaration plus
  `rewriteDirectLoxerCalls`; the options expression moves into the emitted `__startTrace` call rather
  than a hoisted slot.
- `src/trace.ts` — add the options-only overload (`trace(options?): void`) so the form typechecks,
  and extend the JSDoc with it. `TraceOptions`' `Args`/`Result` cannot be inferred here — the marker
  never sees the signature — so formatter callbacks in this form are typed by explicit type
  arguments, which the JSDoc must say.
- `test/plain-function-trace.test.ts` — suites for the new form beside the inline-literal ones.
- `documentation/index.md` — teach all three forms as one set, with the guidance that the
  enclosing-function form is the one to reach for inside a memoizing hook.
- `examples/vite-trace-demo/` — one call site in the new form.

## Risks & open questions

- **Path invalidation when a marker sits inside another marker's literal.** Handled by the
  innermost-first ordering rule above; a nested-marker fixture (inline inside inline, and inline
  inside a statement-form body) is part of the test set rather than an afterthought.
- ~~**Name inference reaching into unforeseen shapes**~~ (a marker inside a ternary, an array
  element, a JSX prop) — a real defect, found while probing the enclosing form and fixed for both
  forms. The walk out of an unnamed function borrowed a name across all three shapes rather than
  stopping: a callback in a JSX prop reported the name of the binding the whole element was assigned
  to. The walk now ends at a JSX node, an array element and a conditional branch as well as at a
  statement, function or program, so each of the three raises the error that asks for `name`.
- **Options-evaluation parity is the subtle part.** Inlining the options expression into the wrapper
  body would look simpler and quietly change semantics — a helper like `orderTrace('PICK')` would run
  on every invocation instead of once per marker evaluation. A test that counts evaluations, mirroring
  the existing `plain-function-trace.test.ts:837` case, pins this.
- **`TraceOptions` gains an option only one form uses.** Accepted over a separate inline-only options
  type, which would fragment the documented option set; the JSDoc states the scope.
- ~~**Self-recursion inside an inline literal is not re-traced**~~ — resolved rather than accepted.
  Tracing a `FunctionExpression` through its own body leaves its name bound to the traced function,
  so a named inline literal re-enters its own box on every recursive call, exactly as the statement
  form does. An arrow has no self-reference of its own, and reaches the traced function through the
  binding it was assigned to.
- **React Compiler ordering stays out of scope.** The Vite plugin runs `enforce: 'pre'`, so it
  transforms before `@vitejs/plugin-react`. That only matters for tracing a component or hook itself,
  which this change does not encourage; it is recorded in `documentation/debt.md` territory rather
  than solved here.
- **The enclosing-function form's options run per invocation**, where the other two forms evaluate
  options once per marker evaluation. Three forms with two evaluation timings is a real teaching cost,
  accepted because the alternative — hoisting an expression written inside a function body out of it —
  would move user code to a place the author did not write it. A test pins the timing, and the guide
  states it where it teaches the form.
- **`Args`/`Result` are not inferable in the enclosing-function form.** The marker takes only options,
  so a typed `openMessage`/`closeMessage` callback needs explicit type arguments. This is the one
  ergonomic regression against the inline-literal form and the reason that form stays documented
  rather than deprecated.
- **A misplaced marker must fail loudly, not silently trace from the top.** Requiring the first
  statement is what makes the form readable; the risk is an author moving the call during a refactor
  and getting a build error they read as a bug. The error text names the rule and the fix.
- ~~**The lint rules are the acceptance criterion, and they live outside this repo.**~~ Neither
  `react-hooks/use-memo` nor `exhaustive-deps` runs here — eslint-plugin-react-hooks is not a
  dependency of this project, and `eslint.config.mjs` lints `src/**/*.ts` only. The check was run
  before implementation, in a scratch project with its own eslint 9 and eslint-plugin-react-hooks
  6.1.1: the form reports zero problems in `useCallback`, `useMemo` and `useEffect` with no disable
  comment, and a deliberately omitted dependency still draws `exhaustive-deps`, so the marker does not
  blind the rule to the body it sits in. Since the rules stay outside this repo, nothing here guards
  the criterion against a future change to the emitted shape.

## Verification

- `pnpm build` — root `tsc` plus the recursive package builds, covering the new runtime helper and the
  widened `trace` signature.
- `pnpm test` — the extended `test/plain-function-trace.test.ts`, covering: each accepted call shape
  (`useCallback` / `useEffect` / `useMemo` / event prop); name inference per source and the loud
  failure when none applies; sync, async, promise-returning and throwing literals; `this`,
  `arguments`, and `.length` fidelity; `Loxer` call linking inside the literal; options evaluated once
  per marker evaluation; and the preserved rejections (identifier and array in expression position,
  generator, a shadowed local `trace` left untouched).
- `pnpm lint` — `src/**/*.ts` and the plugin package.
- `pnpm typecheck:types` — the type-level expectations for the new overloads.
- `pnpm demo:build` in `examples/vite-trace-demo/` — the shape survives a real Vite build through
  `vite-plugin-loxer-trace`.
- `pnpm docs` — after the JSDoc changes on `trace` and `TraceOptions`.

For the enclosing-function form, additionally:

- **The React lint gate, run first.** Lint a component and a hook using the new form in a project that
  has eslint-plugin-react-hooks v6 — `react-hooks/use-memo` and `react-hooks/exhaustive-deps` must both
  pass with no disable comment, including a deps array the rule can still check. This is the
  criterion the whole form exists for; it precedes implementation rather than following it.
- `pnpm test` — the new form's suites: marker as first statement in a declaration, function
  expression, block-bodied arrow, class method and object method; the rejections (not the first
  statement, expression-bodied arrow, generator, a second marker on a function that already has one);
  name resolution through the same chain and its loud failure; `this`, `arguments`, `.length` and
  self-recursion left untouched by an in-place body rewrite; `Loxer` call linking; and options
  evaluated once per invocation, distinguishing this form's timing from the other two.
- `pnpm demo:build` — the new call site survives a real Vite build.
