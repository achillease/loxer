# Plan: Fluent Loxer functionality for the trace marker

> Model/effort: gpt-5/unknown

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed request; `documentation/specs/babel-plain-function-tracing.md` and `documentation/specs/props-rework.md` were consulted as current behavior baselines

## Context

~~The plain-function `trace()` marker currently receives its module, level, and highlight behavior through `TraceOptions` properties.~~ It also receives props capture and rendering through four more marker options: `argsAsProps`, `resultAsProps`, `printArgs`, and `printResult`. These seven settings differ from Loxer's normal fluent API and leave the build-time marker with less expressive chaining than the logger it drives.

The marker should expose Loxer-style pre-call chaining while preserving all supported marker forms and their type inference. ~~This is a breaking cleanup: marker options lose `moduleId`, `level`, and `highlight` without aliases or compatibility handling.~~ The clean cut covers all seven fluent concerns: marker options retain only naming and message formatting. The `@trace()` decorator keeps its existing object options.

This is an intentional, substantial simplification of `trace(OPTIONS)`: its public options surface shrinks from ten fields to exactly three — `name`, `openMessage`, and `closeMessage`. Marker option objects describe only how a trace is named and worded. Module selection, highlighting, level, props capture, and props rendering live exclusively on the fluent chain, where their call order and terminal level are visible at the call site.

The agreed surface is:

```ts
trace(target, options); // unchanged default: info
trace.m('ORDER').h().warn(target, options);
trace.module('ORDER').highlight(enabled).debug([load, save], options);
trace.props('args').pp('args').info(target, options);
trace
  .props('argsResult')
  .pp({ target: 'result', depth: 1 })
  .debug(target, options);

function enclosing() {
  trace.m('ORDER').error({ openMessage: 'fn(args)' });
}

const handler = trace.m('ORDER').log((id: string) => load(id), options);
```

`log()` and `info()` are equivalent. `highlight()` / `h()` apply their boolean decision to both the opening and closing lifecycle logs. `props()` selects which call values are attached to the lifecycle logs. `pp()` independently selects which attached props the built-in output renders. `error()` opens and closes an ordinary trace box whose logs carry level `error`; it does not call `Loxer.error()`, create an `ErrorLox`, or use the error output stream.

## Approach

### 1. Split decorator options from marker options

Keep the existing generic `TraceOptions<Args, Result>` for `@trace()`, including `moduleId`, `level`, phase-selective `highlight`, `argsAsProps`, `resultAsProps`, `printArgs`, and `printResult`. ~~Add a marker-specific generic option type that contains only naming, message formatting, props capture, and props rendering options.~~ Add `TraceMarkerOptions<Args, Result>` containing exactly `name`, `openMessage`, and `closeMessage`.

All marker overloads use `TraceMarkerOptions`. Do not leave the marker typed as the broad shared `TraceOptions` with fields that the transform ignores. Object-literal uses of all seven removed properties therefore fail type checking, and generated marker code does not read them. There is no deprecation overload, runtime fallback, or translation shim. `@trace()` remains on the full ten-field `TraceOptions`, so the reduction is marker-specific rather than a decorator regression.

Export these marker-only routing types from `loxer/trace`:

```ts
export type TracePropsTarget = 'args' | 'result' | 'argsResult';

export interface ExtendedPropsPrinterOptions extends PropsPrinterOptions {
  target: TracePropsTarget;
}
```

`target` is required because a trace has two lifecycle sides. It is routing metadata and must be removed before the remaining `PropsPrinterOptions` reach `Lox.printProps` or an output callback.

### 2. Model `trace` as a callable fluent marker

Give the exported marker function the same pre-call modifier style as `Loxer`:

- `module(moduleId?)` and `m(moduleId?)`, using the augmented `ModuleId` type;
- `highlight(doit?)` and `h(doit?)`;
- `props(target)`, where `target` is `args`, `result`, or `argsResult`;
- `pp(targetOrOptions)`, accepting a target string for default printer options or `ExtendedPropsPrinterOptions` for configured rendering;
- terminal marker calls `error(...)`, `warn(...)`, `log(...)`, `info(...)`, and `debug(...)`;
- the existing bare call as the default `info` terminal.

Each terminal repeats the current named-target, target-list, inline-function, and enclosing-function overloads so argument/result formatter inference remains intact. Reuse Loxer's alias-family omission pattern so `m`/`module`, `h`/`highlight`, `props`, and `pp` can each appear once, in any order. `argsResult` covers the two-sided case without repeating a modifier. Level methods are terminal: modifiers cannot follow them, and they accept marker arguments rather than log messages. Only the requested short form `pp` is added; the marker does not gain a `printProps` alias.

Capture and rendering remain independent, matching the four options they replace:

| Chain                                 | Opening arguments                           | Successful result                                 |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `.props('args')`                      | attached                                    | not attached                                      |
| `.props('result')`                    | not attached                                | attached when defined                             |
| `.props('argsResult')`                | attached                                    | attached when defined                             |
| `.pp('args')`                         | render attached opening props with defaults | no rendering request                              |
| `.pp({ target: 'result', depth: 1 })` | no rendering request                        | render attached closing props with `{ depth: 1 }` |

Calling `pp` alone does not attach values. A caller that wants capture and built-in rendering chains both modifiers, just as the old API required both `argsAsProps`/`resultAsProps` and `printArgs`/`printResult`.

Every untransformed entry point, including fluent terminals, must fail with the same clear missing-transform error as bare `trace()`.

### 3. Parse fluent chains as marker syntax in the Babel plugin

Extend marker discovery from a direct call of the imported `trace` identifier to a validated member/call chain rooted at that exact binding. Local functions or objects named `trace` remain untouched.

The collector records:

- the root imported marker binding;
- the outer terminal call and its existing marker arguments;
- modifier expressions in source order;
- ~~normalized module/highlight state;~~ normalized module, highlight, props-capture, and props-rendering state;
- the selected `LogLevel`, with bare `trace(...)` normalized to `info` and `log(...)` normalized to `info`.

Add code-frame diagnostics for unsupported or computed members, duplicate modifier families, wrong modifier arity, arguments passed in the wrong position, and incomplete/non-terminal chains. `props` and `pp` each require exactly one argument. Their targets may be typed runtime expressions rather than literals; literal invalid targets can receive an early diagnostic, while untyped invalid runtime values safely select neither side. The collector and marker model must identify the whole fluent expression so inline replacement, statement removal, and enclosing-marker removal never leave a member-chain fragment behind.

### 4. Preserve evaluation and transform semantics

Carry marker options and fluent configuration separately; do not recreate the removed option API by spreading modifier values into the options object. The generated configuration has distinct fields for module, highlight, selected level, props target, print target/configuration, and the remaining marker options.

Generated code must evaluate each expression exactly once and in JavaScript source order: modifier arguments first, then terminal target/options arguments. Preserve the current storage lifetime for every marker form:

- named and list markers evaluate shared configuration at the marker statement;
- inline markers evaluate it at the inline expression;
- enclosing markers evaluate it once per invocation at the first statement;
- target lists share one evaluated configuration while retaining one trace state per function call.

The wrapper continues to preserve `this`, real `arguments`, function length, named recursion, synchronous results, Promise identity, failures, nested traces, and concurrent invocations.

### 5. Resolve marker props routing without changing decorator behavior

Resolve the two new marker modifiers in `src/trace.ts` for each traced invocation:

- `props('args')`, `props('result')`, and `props('argsResult')` decide whether the opening arguments and successful result are attached;
- `pp('args')`, `pp('result')`, and `pp('argsResult')` select default `{}` printer options for the named lifecycle sides;
- object-form `pp` reads its required `target`, removes that routing field, and applies the remaining ordinary `PropsPrinterOptions` to the named side or both sides;
- `argsResult` applies one resolved printer configuration to both lifecycle sides;
- a `void` result still attaches no literal `undefined`, and failures have no result to capture or render.

Do not let `pp` imply capture. The capture target and print target may differ, and each preserves the semantics of the option pair it replaces. Keep `resolveTracePrintProps()` unchanged for the decorator. The marker resolver has one consumer, so it stays local to `src/trace.ts` unless implementation discovers a second concrete consumer.

Only resolve printer configuration when `pp` was chained. Strip `target` before the configuration is stored on a lox, so output callbacks observe the same `PropsPrinterOptions` shape as ordinary `Loxer.pp()` calls.

### 6. Add a trace-only error-level box path

Keep public manual-box behavior unchanged: `BoxLevel` continues to exclude `error`, `Loxer.error` remains a single error event, and `Loxer.error.open()` remains unavailable.

Add an internal trace-box opening path that accepts `LogLevel`. `__startTrace` uses the generated configuration to open an ordinary box at `error`, `warn`, `info`, or `debug`. Its matching close keeps the opening level, so visibility and box-column state remain paired. Error-level trace lifecycle records travel through normal log/history handling with `lox.level === 'error'`.

A thrown or rejected value keeps the current failure behavior: one linked error event records the failure and the trace then emits its normal failed close. Highlighting affects the trace lifecycle records, not the linked error event.

### 7. Update public guidance and examples as a clean-cut API

~~Replace marker examples that use `moduleId`, `level`, or `highlight` properties with fluent syntax.~~ Replace marker examples using any of the seven removed fields with fluent syntax. Teach capture and rendering as separate choices and show both string-form and configured `pp`. Keep `@trace()` examples option-based. Align the earlier plain-function tracing and props-rework specs because their acceptance criteria explicitly require the superseded marker properties.

## Critical files

- `src/tracing-types.ts` — separate the full ten-field decorator `TraceOptions` from the exact three-field `TraceMarkerOptions`; add `TracePropsTarget` and `ExtendedPropsPrinterOptions`; preserve formatter inference.
- `src/trace.ts` — define the callable fluent marker surface, resolve marker capture/render targets, keep extended routing metadata out of loxes, provide consistent untransformed errors, and handle error-level trace runtime behavior.
- `src/core/PropsPrinter.ts` — reuse `PropsPrinterOptions` and preserve the decorator's existing `resolveTracePrintProps()` behavior.
- `src/Loxer.ts`, `src/types.ts`, `src/core/Levels.ts` — add the internal ordinary-box path for `LogLevel` without widening the public manual-box API.
- `packages/babel-plugin-loxer-trace/src/marker-collection.ts` — recognize and validate module/highlight/props/pp chains rooted at the imported marker binding.
- `packages/babel-plugin-loxer-trace/src/marker-types.ts` — represent the terminal, ordered modifier expressions, and separate normalized configuration fields.
- `packages/babel-plugin-loxer-trace/src/marker-transform.ts`, `packages/babel-plugin-loxer-trace/src/trace-wrapper.ts` — remove/replace the whole chain, preserve evaluation order, and pass configuration to `__startTrace`.
- `packages/babel-plugin-loxer-trace/src/plugin.ts` — keep import discovery and cleanup correct for fluent member chains.
- `test/plain-function-trace-types.ts`, `test/types/registry.test-d.ts` — cover overload inference, registry-aware module ids, target/configuration types, exact marker-option keys, and rejection of all removed marker option properties while all ten decorator options remain valid.
- `test/plain-function-trace-core.test.ts`, `test/plain-function-trace-inline.test.ts`, `test/plain-function-trace-enclosing.test.ts` — cover every terminal and marker form, runtime semantics, evaluation order, failures, nesting, and concurrency.
- `test/babel7-compat.test.ts`, `test/vite-plugin-loxer-trace.test.ts`, `test/dist-consumer.test.ts` — cover adapter output and the built consumer surface.
- `README.md`, `documentation/index.md`, `documentation/props.md`, `packages/babel-plugin-loxer-trace/README.md`, `packages/vite-plugin-loxer-trace/README.md`, `examples/vite-trace-demo/src/main.ts` — replace public examples and teach independent capture/render targeting.
- `documentation/specs/babel-plain-function-tracing.md`, `documentation/specs/props-rework.md` — align historical acceptance criteria with the approved marker surface.

## Risks & open questions

- Fluent discovery changes the transform's entry boundary. Mitigation: bind every recognized chain to the actual `loxer/trace` import and add malformed, computed, incomplete, and shadowed-chain cases.
- Side-effectful modifier and marker arguments can be reordered or duplicated by a careless AST rewrite. Mitigation: assert exact once-only evaluation order for named, list, inline, and enclosing forms.
- `TraceOptions` is shared with `@trace()`. Mitigation: split marker options rather than narrowing the shared decorator type, and keep decorator type/runtime tests unchanged.
- The capture and print targets are independent and may name different lifecycle sides. Mitigation: store and resolve them separately; cover both modifier orders and mismatched targets.
- `ExtendedPropsPrinterOptions.target` is routing metadata, not a printer option. Mitigation: strip it before assigning `Lox.printProps` and assert that output callbacks never receive it.
- Dynamic target expressions cannot always be validated during transformation. Mitigation: type the public union, diagnose invalid literals, and make invalid untyped runtime values select neither side without throwing from instrumentation.
- Adding two more recursive modifier families can inflate or break overload inference. Mitigation: define the callable terminal surface once and intersect it with the remaining modifiers instead of copying terminal overloads into every chain type.
- Error-level boxes conflict with the public `BoxLevel` boundary. Mitigation: confine `LogLevel` box opening to generated trace internals and assert normal-stream versus error-stream events explicitly.
- Source-only tests can miss stale generated package trees. Mitigation: build first and run a compiled Babel-transform/runtime probe against `dist/` and the plugin's built output.
- No open product questions remain after the user's decisions on scope, highlighting, error semantics, and independent props capture/render targeting.

## Verification

Add table-driven coverage for bare `trace`, all five terminals, both modifier aliases, every modifier order, conditional highlighting, augmented module ids, all three props targets, all three string-form print targets, configured printing, and all four marker forms.

Pin these observable outcomes:

- bare `trace`, `.log`, and `.info` produce equivalent info-level traces;
- `.highlight()` highlights both open and close, while `.highlight(false)` highlights neither;
- `.error()` produces ordinary open/close logs at level `error` and no error-stream record on success;
- a real failure in an error-level trace still records one linked error and preserves the original thrown/rejected value;
- module thresholds, history, hidden boxes, and close pairing stay correct at every level;
- modifier and terminal arguments execute once in source order;
- nested/concurrent traces retain separate state;
- `.props` attaches one prop per argument and one defined result prop on its selected sides;
- `.pp` requests rendering only on its selected sides and does not attach values by itself;
- `.props` and `.pp` compose independently when they select different sides and in either chain order;
- object-form `.pp` applies the same ordinary printer settings to both sides for `target: 'argsResult'`, and `target` never appears in `lox.printProps`;
- empty arguments, `void` results, throws, and rejections retain their existing capture/render boundaries;
- all seven removed marker option properties fail marker type checks while decorator options still compile;
- a bidirectional compile-time equality assertion pins `keyof TraceMarkerOptions` to exactly `'name' | 'openMessage' | 'closeMessage'`, while a separate assertion keeps the full ten-field `TraceOptions` surface available to `@trace()`;
- malformed `props`/`pp` arity and incomplete chains receive clear transform diagnostics;
- transformed output contains neither the marker import nor any fluent chain.

Run, in order:

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`
4. `pnpm typecheck:test`
5. `pnpm typecheck:types`
6. `pnpm demo:build`
7. `pnpm run docs` and confirm TypeDoc reports `html generated at ./docs`
8. Transform and execute a representative marker with the built Babel plugin against `dist/trace.js` and `dist/index.js`

No implementation or test execution belongs to this planning phase.
