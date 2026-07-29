# Plan: Type-safe module ids via a registry interface

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed problem

## Context

Module ids are configured once in `Loxer.init({ modules })` and then referenced as bare strings
everywhere: `.module('PERS')`, `.m('PERS')`, `Loxer.getModuleLevel('PERS')`,
`@trace('PERS')`, `trace(fn, { moduleId: 'PERS' })`. Nothing connects the two. A typo
(`.m('PRES')`) type-checks, silently resolves to the `INVALID` module at runtime
(`src/core/Modules.ts:43`) and shows up only as a red `INVALIDMODULE` label in the output — and
there is no autocompletion for the ids a project actually declared.

The goal is that the module-id parameters are typed after the modules given to `Loxer.init()`:
autocompletion for the declared ids, and a compile error on a typo.

`Loxer` is a `let`-exported singleton (`src/Loxer.ts:420`) with a fixed type, so a runtime `init()`
call can never retroactively narrow the type of an already-declared binding. The two mechanisms
that can express this are declaration merging (the consumer states the module set once, globally)
or a generic `init` returning a typed handle. This plan takes declaration merging — the i18next
`CustomTypeOptions` pattern — because it fits the singleton (there is exactly one module set per
program), keeps `import { Loxer } from 'loxer'` typed in every file with no re-export ceremony, and
is the only one of the two that also reaches `@trace('MOD')` and `trace(fn, { moduleId })`, since a
decorator cannot see an instance's type argument.

## Approach

An **empty registry interface that consumers augment**, with a conditional type that falls back to
`string` while the registry is empty. Existing consumers are therefore unaffected; the narrowing is
opt-in per project. The runtime is untouched — `Modules.ensureModule`'s `INVALID` fallback stays as
the safety net for JS consumers and dynamically built ids.

### 1. Declare the registry and derive `ModuleId`

`src/index.ts` gets the registry:

```ts
/** Augment this to make module ids type-safe. Empty by default → ids stay `string`. */
export interface LoxerModuleRegistry {}
```

`src/index.ts` is the placement, not `src/types.ts`. Both work (the architect verified that a
`declare module 'loxer'` augmentation also merges *through* a named re-export on TS 6.0.3), but the
entry-module placement depends on nothing beyond the documented module-augmentation rule, matches
every published example a consumer will copy, and is robust across the TypeScript versions
consumers use — `package.json` declares no `peerDependencies.typescript`.

`src/types.ts` derives the id type:

```ts
import type { LoxerModuleRegistry } from './index.js';

/** ids Loxer always provides itself */
export type DefaultModuleId = 'NONE' | 'DEFAULT' | 'INVALID';

export type ModuleId = [keyof LoxerModuleRegistry] extends [never]
  ? string
  : Extract<keyof LoxerModuleRegistry, string> | DefaultModuleId;
```

Two details that are load-bearing:

- The `[T] extends [never]` tuple wrapping is required — a bare `keyof R extends never` would
  distribute and collapse.
- The `types.ts → index.js` import type creates a type-only cycle
  (`index.ts → Loxer.js → types.js → index.js`). Verified as accepted by this repo's
  `typescript@6.0.3` under its exact `tsconfig.json` with `declaration: true`, emitting a clean
  `dist/types.d.ts` that preserves both the specifier and the conditional. `import type` is erased,
  so `dist/types.js` gains no runtime import.

Consumer recipe, to be documented:

```ts
import { Loxer, type LoxerModules } from 'loxer';

export const modules = {
  PERS: { fullName: 'Persons', color: '#0ff', devLevel: 3, prodLevel: 1 },
  DB: { fullName: 'Database', color: '#f0f', devLevel: 2, prodLevel: 0 },
} satisfies LoxerModules;

declare module 'loxer' {
  interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
}

Loxer.init({ modules });
```

### 2. Narrow the public module-id parameters

Types-only edits, `string` → `ModuleId`:

| Site | Signature |
| --- | --- |
| `src/types.ts:32` | `getModuleLevel(moduleID: ModuleId)` |
| `src/types.ts:457` | `m(moduleId?: ModuleId)` |
| `src/types.ts:477` | `module(moduleId?: ModuleId)` |
| `src/tracing-types.ts:94` | `TraceOptions.moduleId?: ModuleId` |
| `src/decorators/trace.ts:33` | `options?: TraceOptions<Args, Result> \| ModuleId` |

`getModuleLevel` **is** narrowed (decided with the user), even though its documented `-1` "no such
module" branch (`src/types.ts:27`) becomes unreachable by type for augmented consumers. Its JSDoc
must say that probing an unknown id now needs a cast; the `-1` behavior itself stays, since values
laundered through `string` still reach it at runtime.

`src/tracing-types.ts` currently imports only `LogLevelType` from `./types.js` — add `ModuleId`.
`src/trace.ts`'s public `trace()` marker takes no module id of its own; it inherits the narrowing
through `TraceOptions`, and one augmentation of `'loxer'` narrows the `'loxer/trace'` subpath too
(verified — `dist/tracing-types.d.ts` reads the single registry declaration through
`dist/types.d.ts`).

`LoxerModules` (`src/types.ts:130`) **keeps** its index signature. Narrowing it to
`Record<ModuleId, Module>` would make `DEFAULT_MODULES` (`src/core/Modules.ts:127`) and every
consumer map fail under an augmented registry.

### 3. ~~Cast the two internal `.m()` callers~~ → propagate `ModuleId` into the private helper

> **Revised during implementation.** Only **one** site needed anything, and a cast was the wrong
> tool. `src/trace.ts:93` needs nothing: its `moduleId` is destructured from `TraceOptions`, which
> step 2 already narrowed. `src/decorators/trace.ts:92` breaks only because the *private*
> `createTracedMethod` re-declares its `options` param as `TraceOptions | string`; widening the
> public `ModuleId` shorthand back to `string` there is what loses the type. Fix: declare that
> private param as `TraceOptions | ModuleId` too — no cast anywhere. Verified both ways: with the
> param at `| string` a source-compiling augmented program fails with exactly the predicted
> `TS2345: Argument of type 'string | undefined' is not assignable to parameter of type
> '"PERS" | DefaultModuleId | undefined'` at `src/decorators/trace.ts:96`; with `| ModuleId` it
> exits 0. The original text follows.



`class LoxerInstance implements LoxerType` keeps compiling with `m(moduleId?: string)` — method
parameter bivariance makes step 2 a zero-edit change for `src/Loxer.ts` (verified). But two
*internal* callers pass `string | undefined` into the now-narrowed public `.m()`:

- `src/trace.ts:93` — `.m(moduleId)`, from `const { moduleId } = options` (line 88)
- `src/decorators/trace.ts:92` — `.m(moduleId)`, from `let moduleId` (lines 70–77)

Both compile fine in the package's own build (registry empty ⇒ `ModuleId = string`), so
`pnpm build` stays green **without** the fix and the omission is easy to miss. They break in any
program that compiles `src/` while augmenting the registry. Fix: `.m(moduleId as ModuleId | undefined)`
— a no-op when `ModuleId = string`, verified to satisfy both worlds. Land this together with step 2.

### 4. Export the option types from `src/index.ts`

`src/index.ts` re-exports nothing from `src/types.ts` today, and the `exports` map blocks deep
imports (`import type { LoxerModules } from 'loxer/dist/types.js'` → TS2307, verified). So
`satisfies LoxerModules` is impossible for a consumer right now — the export gap is a precondition
of the feature, not polish. (`documentation/index.md:174-195` and `:408` already discuss
`LoxerOptions`/`LoxerModules` as if they were nameable.)

Export the **full option surface** as an explicit named list (decided with the user):
`LoxerModuleRegistry`, `ModuleId`, `DefaultModuleId`, `LoxerModules`, `Module`, `LevelType`,
`LogLevelType`, `LoxerOptions`, `LoxerConfig`, `LoxerCallbacks`, `ErrorType`, `OpenedLox`,
`OfLoxes`.

`export type * from './types.js'` is **not** an option: it hard-errors with
`TS2308: Module './Loxer.js' has already exported a member named 'Loxer'`, because `src/types.ts:7`
exports a *type* named `Loxer` colliding with the value at `src/Loxer.ts:420` (TS2308 fires across
type/value space). `Loxer` is the only collision among all names currently reachable from
`src/index.ts`'s `export *` lines; it stays unexported. This is an intentional, additive public
surface change under `rules/coding-conventions.md`.

### 5. Unblock `pnpm lint`

`export interface LoxerModuleRegistry {}` trips `@typescript-eslint/no-empty-object-type`, which
`tseslint.configs.recommended` sets to `error` — and `.husky/pre-commit` runs `pnpm lint`, so this
blocks committing. Fix at project level in `eslint.config.mjs` with the rule's `allowWithName`
option (e.g. `'Registry$'`) rather than an inline disable. Consumers writing
`interface LoxerModuleRegistry extends Record<…, true> {}` hit the same rule via
`allowInterfaces: 'never'`; the guide should mention `with-single-extends`.

### 6. Documentation and TypeDoc

- New section in `documentation/index.md` (near the modules material at `:404-450`) teaching the
  augmentation, the `satisfies` requirement, and the `getModuleLevel` cast.
- Fix the footgun the guide currently teaches: `:172` recommends `const options: LoxerOptions` and
  `:445` uses `export const DEFAULT_MODULES: LoxerModules =`. With an annotation instead of
  `satisfies`, `keyof typeof modules` widens to `string`, the registry inherits an index signature,
  and a typo'd `.m('NOPE')` compiles clean with **no diagnostic** (verified). Silent degradation is
  the worst failure mode here, so both spots get rewritten to `satisfies`.
- Add `src/index.ts` to `typedoc.json` `entryPoints` — it is not currently there, so the registry
  would be invisible in the API reference. Expect `docs/` to gain a module page.
- Update the JSDoc on the five narrowed signatures to explain the registry, then `pnpm docs`.

### 7. Gate it with a type test

The check is a file of deliberate errors — `// @ts-expect-error` on `Loxer.m('TYPO')` — that only
compiles clean if the narrowing works. Nothing today would catch a regression: `pnpm test` never
type-checks (vitest transpiles via oxc; `vitest.config.ts` does not enable `typecheck`), `pnpm lint`
and `pnpm build` exclude `test/`, and `pnpm typecheck:test` is in neither CI nor the husky hook.

It needs its **own** compilation unit: a `declare module 'loxer'` augmentation is program-wide, so
placing it in `test/**/*.test.ts` breaks every other suite — `test/boxed.test.ts:302-311` (`'ONE'`,
`'TWO'`), `test/item.test.ts:40` (`'IT'`), `test/initialization.test.ts:218` (`'wrong'`) all become
errors (verified).

Chosen shape:

- `test/types/registry.test-d.ts` — imports `'loxer'`, which TypeScript resolves from inside the
  package through its own `exports` map (Node self-reference), so the test checks the **shipped**
  `dist/*.d.ts` a consumer actually gets, using the same `declare module 'loxer'` recipe the docs
  teach. Verified end-to-end: the only diagnostics were the intended ones, `src/` was not in the
  program, no other suite affected.
- `test/types/tsconfig.json` — `include: ["**/*.test-d.ts"]`. The `.test-d.ts` suffix keeps the file
  out of both `vitest.config.ts`'s `include` and `test/tsconfig.json`'s.
- `package.json` script `"typecheck:types": "tsc -p test/types/tsconfig.json"`.
- `.github/workflows/main.yml` gains a 4th step after `build` (it must run after, since the test
  checks `dist/`): lint → test → build → typecheck:types.

Cover both directions: the narrowed case here, and the un-augmented fallback (arbitrary strings
still accepted) from an ordinary suite or `pnpm typecheck:test`.

### Out of scope

- The generic-`init` alternative (`init<M>(…): LoxerOf<keyof M>`) — rejected in Context.
- Demonstrating the augmentation in `examples/vite-trace-demo` (`src/main.ts:90,138,152,170,185`).
  It is unaffected (fallback keeps ids `string`) and is not gated by CI; a natural follow-up, not
  part of this change.
- `ModuleId | (string & {})` as the narrowed branch — it would defeat the typo-catching that is the
  point.

## Critical files

- `src/index.ts` — registry declaration; explicit named type re-export list (all 8 existing lines
  matter for the TS2308 collision analysis)
- `src/types.ts` — `ModuleId`/`DefaultModuleId`; the three narrowed signatures (`:32`, `:457`,
  `:477`); `LoxerModules` (`:130`) stays an index signature; the `Loxer` type alias (`:7`) stays
  unexported
- `src/tracing-types.ts` — `TraceOptions.moduleId` (`:94`), shared by `@trace` and `trace()`; add
  the `ModuleId` import
- `src/decorators/trace.ts` — `| string` shorthand (`:33`) → `| ModuleId`; internal cast at `:92`
- `src/trace.ts` — internal cast at `:93`; the `loxer/trace` entry inherits the narrowing
- `src/Loxer.ts` — `implements LoxerType` (`:33`); **no edits needed** at `:81`, `:118`, `:121`
  (parameter bivariance) — verify, don't change
- `src/core/Modules.ts` — runtime `INVALID` fallback (`:43`, `:60`) and `DEFAULT_MODULES` (`:127`)
  stay `string`-keyed; unchanged
- `eslint.config.mjs` — `no-empty-object-type` `allowWithName`
- `typedoc.json` — add `src/index.ts` to `entryPoints`
- `package.json` — `typecheck:types` script
- `.github/workflows/main.yml` — new step after `build`
- `test/types/registry.test-d.ts`, `test/types/tsconfig.json` — new
- `documentation/index.md` — new augmentation section; `satisfies` fixes at `:172` and `:445`

## Risks & open questions

- **Silent no-op augmentations (consumer-facing, documentation-only mitigation).** Two verified
  failure modes to warn about in the guide: (1) an augmentation file with no top-level
  `import`/`export` is read as an ambient module that *replaces* the package, producing the very
  confusing `TS2305: Module '"loxer"' has no exported member 'Loxer'` — it needs `export {};`;
  (2) a typo'd specifier (`declare module 'loxr'`) produces **no error and no effect**, so the
  consumer gets zero feedback.
- **The `satisfies` footgun degrades silently**, and the guide currently teaches the wrong form —
  handled by step 6, and the type test should include a case pinning it.
- **Narrowing `getModuleLevel` is a real breaking change** for augmenting TS consumers who pass a
  computed `string`. Opt-in (nobody who hasn't augmented can be affected) and the package is at
  3.0.0; needs a changelog/major note, not a design change.
- **Step 3's casts are invisible to `pnpm build`.** Sequenced with step 2 for exactly this reason;
  the type test is what proves them.
- **`Module` as a root-level export name** is generic enough to collide in consumer code. Exported
  as-is (matching the current guide) rather than adding a second alias; revisit if it annoys.
- **`typecheck:types` depends on a fresh `dist/`.** Ordering it after `build` in CI handles it;
  locally it needs `pnpm build` first, which the plan's verification section states explicitly.
- **Open:** whether `test/tsconfig.json`'s `moduleResolution: "bundler"` vs the new type-test
  config's resolution mode need to differ — the type test resolves `'loxer'` through the `exports`
  map, so it should use `nodenext` like the root config, not `bundler`. Confirm during
  implementation.

## Verification

1. `pnpm lint` exits 0 — proves step 5 unblocked `no-empty-object-type` (also the husky gate).
2. `pnpm test` exits 0 — no behavior change expected anywhere; the ~190 existing module-id call
   sites across the suites must keep compiling and passing untouched via the `string` fallback.
3. `pnpm build` exits 0 — proves the `types.ts ⇄ index.ts` type cycle and `declaration` emit are
   clean, and that no `.d.ts` regression slipped in.
4. `pnpm typecheck:test` exits 0 — the un-augmented direction (`test/` still passes arbitrary
   strings). Currently green; must stay green.
5. `pnpm typecheck:types` exits 0 **after** `pnpm build` — the narrowed direction: declared ids
   accepted, `DefaultModuleId` accepted, typos rejected (each pinned by `@ts-expect-error`, so a
   clean exit means the errors were actually produced), and the annotation-vs-`satisfies` widening
   case pinned.
6. `pnpm docs` exits 0 and the generated pages show the narrowed signatures plus a
   `LoxerModuleRegistry` entry.
7. Manual smoke check that the runtime is untouched: `node playground/OrderService.js` after build
   still logs and still resolves `getModuleLevel('NOPE')` to `-1`.
