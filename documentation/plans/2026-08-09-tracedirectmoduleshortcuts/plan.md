# Plan: Direct module shortcuts for the trace marker

> Model/effort: GPT-5/unknown

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none

## Context

The fluent `trace` marker accepts a module through `.m(moduleId)` or `.module(moduleId)`. Projects
already register their module keys through `LoxerModuleRegistry`, so a static module can be shorter
and more discoverable as a property:

```ts
trace.PROJECTS.info(loadProjects);
```

This is an additive shortcut. Existing `.m()` and `.module()` chains stay supported, including
runtime-selected ids. Computed direct access supports the same concise shape when the selected key is
typed:

```ts
trace[moduleId].info(loadProjects);
```

The feature belongs to the build-time marker only. `Loxer` keeps its current singleton object and
module methods; it gains no direct module properties and no proxy. This plan follows the completed
fluent-marker change at commit `499f549` and does not amend its plan or worklog.

## Approach

### 1. Derive direct members from registered project modules

Extract the string keys of `LoxerModuleRegistry` separately from `ModuleId`. The direct-member type
must have no keys while the registry is empty; using `ModuleId` directly would inherit its intentional
`string` fallback and turn every property into a valid module, defeating autocomplete and typo
checking.

Add a trace-only module-key type that excludes reserved marker and function members. Export that type
from `loxer/trace` so a caller can name a dynamic direct selector without recreating the exclusion:

```ts
const moduleId: TraceModuleId = chooseModule();
trace[moduleId].info(loadProjects);
```

Refactor the marker's recursive fluent type into one chain surface that combines:

- level terminals only; `trace` itself and every modifier result are marker objects, while
  `trace.error(...)`, `trace.warn(...)`, `trace.info(...)`, `trace.debug(...)`, and
  `trace.log(...)` are the callable entry points;
- modifier methods that have not been used;
- registered direct module members until the module family has been used.

A direct property consumes the same module family as `.m()` and `.module()`. It may appear before or
after `h`/`highlight`, `props`, and `pp`, but the type rejects a second module selection:

```ts
trace.PROJECTS.h().props('args').warn(loadProjects);
trace.h().PROJECTS.pp('result').debug(loadProjects);
trace.m(moduleId).info(loadProjects); // existing form remains valid
```

Keep target, target-list, inline-function, and enclosing-function overload inference unchanged once a
terminal has been selected. The bare default-info forms (`trace(target, options)` and
`trace(options)`) are deliberately removed; consumers use `trace.info(target, options)` and
`trace.info(options)`. Keep `TraceMarkerRuntimeOptions.moduleId`, decorator `@trace()` options,
`ModuleId`, and all `Loxer` types and behavior unchanged.

### 2. Keep collisions local to the marker namespace

Reserve every marker terminal and modifier name, including `m` and `module`, plus intrinsic callable
members such as `name`, `length`, `prototype`, `call`, `apply`, `bind`, `arguments`, `caller`, and
`toString`. Exclude those keys from `TraceModuleId` and the mapped direct-member surface.

A registered module with a reserved name remains valid everywhere else. Callers select it with
`trace.m('info')`, `trace.module('call')`, or `Loxer.m(...)`; the registry itself is not narrowed or
poisoned globally. Document this escape hatch. Case-sensitive uppercase project ids naturally avoid
most collisions.

Static dot access supports identifier-shaped names. Static bracket access supports other registered
keys, such as `trace['ORDER-API'].info(...)`. A computed expression is accepted when TypeScript knows
it as `TraceModuleId`. Babel cannot read the TypeScript registry, so JavaScript callers retain the
existing runtime fallback to Loxer's `INVALID` module for a misspelled id.

### 3. Parse direct selection as another module-chain segment

Extend the Babel marker collector from its current call-modifier walk to a root-to-terminal segment
parser. Preserve binding-based recognition so only the actual `trace` import from `loxer/trace` is
transformed.

The grammar accepts:

- one static non-computed module member, emitted as its string id;
- one computed module member, whose expression is evaluated exactly once;
- the existing `.m()` / `.module()` module calls;
- existing highlight, props, print, and level-terminal syntax in their current combinations.

All three module forms normalize to the existing generated `moduleId` configuration field. Keep
segments in source order so a computed module expression and every modifier argument preserve their
once-only evaluation order and existing lifetime: once per marker evaluation for named/list and
inline forms, and once per invocation for an enclosing marker.

Add focused code-frame diagnostics for duplicate module selection across any forms, reserved names
used as direct modules, computed terminal or modifier names, optional chaining, unknown terminals,
and direct module chains without a terminal. Incomplete expressions such as `trace.PROJECTS;` require
validating member/reference paths as well as `CallExpression` paths; no marker reference may survive
while the plugin removes its import.

### 4. Preserve the missing-transform error with a trace-only proxy

Registered keys exist only in TypeScript, so the runtime marker object cannot install concrete
properties for them. Wrap a null-prototype marker sentinel in a small `Proxy` that returns the same
sentinel for a valid module-property read, allowing the eventual terminal call to throw the existing
clear build-configuration error. Preserve symbol/introspection reads and keep `then` undefined.

This proxy is confined to the build-time `trace` sentinel. It does not wrap `Loxer`, change the
realm-scoped singleton, or participate after a successful transform because the complete marker chain
is removed from consumer code.

### 5. Teach the shortcut without deprecating the existing forms

Update the trace marker's JSDoc, authored guide, package READMEs, root README, and Vite demo to show
direct registered modules as the concise form. Show `.m()` / `.module()` as the compatible form for
runtime values and reserved-name collisions. Keep the guide written as the current API rather than as
a migration narrative.

Do not rewrite the preceding plan or its worklog. Regenerate TypeDoc only from the updated source
JSDoc with `pnpm run docs`.

## Critical files

- `src/trace.ts` — recursive non-callable direct-module marker types, exported `TraceModuleId`,
  retained module methods, terminal call signatures, and the trace-only missing-transform proxy.
- `src/types.ts` — derive the registered string-key union without changing `ModuleId`'s fallback or
  the `Loxer` surface.
- `src/index.ts` — keep the `LoxerModuleRegistry` guidance aligned with direct trace properties.
- `src/tracing-types.ts` — retain the generated runtime `moduleId` contract and align its JSDoc if
  needed.
- `packages/babel-plugin-loxer-trace/src/marker-collection.ts` — parse static/computed module
  segments, normalize all module forms, validate collisions and incomplete chains, and preserve
  evaluation order.
- `packages/babel-plugin-loxer-trace/src/marker-types.ts` — represent a module segment separately if
  the collector's normalized model needs to carry its expression.
- `packages/babel-plugin-loxer-trace/src/plugin.ts` — ensure incomplete member references are rejected
  before marker imports are removed.
- `test/plain-function-trace-core.test.ts` — transform grammar, diagnostics, computed evaluation,
  generated configuration, and missing-transform behavior.
- `test/plain-function-trace-enclosing.test.ts`, `test/plain-function-trace-inline.test.ts` — direct
  module selection and evaluation lifetime in the two specialized marker forms.
- `test/plain-function-trace-types.ts`, `test/types/registry.test-d.ts` — inference, registered-key
  autocomplete, typo rejection, empty-registry behavior, collisions, computed keys, and continued
  `.m()` / `.module()` support.
- `test/babel7-compat.test.ts`, `test/vite-plugin-loxer-trace.test.ts`,
  `test/dist-consumer.test.ts` — adapter and built-package coverage for the new marker grammar.
- `README.md`, `documentation/index.md`, `documentation/props.md`,
  `packages/babel-plugin-loxer-trace/README.md`, `packages/vite-plugin-loxer-trace/README.md`, and
  `examples/vite-trace-demo/src/main.ts` — public teaching and executable examples.

## Risks & open questions

- Recursive mapped properties can weaken overload inference or make a consumed module family reappear.
  Pin every marker form and modifier order at the type level, including rejection of a second module.
- Making the root marker non-callable is a breaking source-level change. Migrate every marker form,
  test fixture, guide, and package README to an explicit terminal, and ensure untyped bare calls fail
  during transformation rather than being silently interpreted as `info`.
- A module key can collide with marker or function members. Keep the exclusion trace-local and prove
  the same key remains usable through `.m()` / `.module()` and `Loxer.m()`.
- Babel has no registry information. TypeScript owns autocomplete and typo checking; transformed
  JavaScript keeps Loxer's existing `INVALID` runtime fallback.
- A computed key can be duplicated, reordered, or evaluated at the wrong lifetime during AST
  rewriting. Cover exact source order and once-only evaluation for named, list, inline, and enclosing
  markers.
- An incomplete direct-member expression is not necessarily a call and can escape the current
  collector. Audit remaining marker-binding references before import removal.
- A proxy can disturb function introspection or thenable detection if it intercepts too broadly.
  Preserve intrinsic and symbol reads, and intercept only the marker-property path needed to reach the
  established missing-transform error.
- Public examples currently span more than one marker syntax generation. Rewrite each affected example
  against the final additive chain and re-read its adjacent comments.
- No product questions remain: direct dot and computed access are shortcuts, `.m()` / `.module()` stay,
  and `Loxer` is outside this feature.

## Verification

Add table-driven coverage for static dot access, static bracket access, dynamic computed access,
`.m()`, and `.module()` across all five terminals and all four marker forms. Pin both module/modifier
orders and the existing target/formatter inference.

Confirm these outcomes:

- registered module properties autocomplete and compile; misspellings fail;
- `trace` and modifier results expose no call signature, while every terminal preserves the existing
  target and formatter inference;
- a bare marker call is rejected by the transform with the terminal-required diagnostic;
- an empty registry exposes no arbitrary direct-module index signature;
- `TraceModuleId` contains only safe registered keys;
- reserved registered keys remain usable through `.m()` / `.module()` and `Loxer.m()`;
- direct selection and `.m()` / `.module()` consume one shared module family, so mixed duplicates fail;
- computed module expressions execute once and in source order at each marker form's established
  lifetime;
- optional, ambiguous, duplicate, reserved, unknown-terminal, and incomplete chains receive clear
  transform diagnostics;
- transformed output contains the expected `moduleId` and contains neither the marker chain nor its
  import;
- an untransformed direct-module marker throws the existing missing-transform error rather than an
  incidental property-access error;
- the `Loxer` singleton has no direct module properties or proxy and keeps its existing identity and
  behavior;
- the Vite demo builds using registry-derived direct access.

Run, in order:

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`
4. `pnpm typecheck:test`
5. `pnpm typecheck:types`
6. `pnpm demo:build`
7. `pnpm run docs` and confirm TypeDoc reports `html generated at ./docs`
8. Transform and execute representative static and computed markers with the built Babel plugin
   against `dist/trace.js` and `dist/index.js`
