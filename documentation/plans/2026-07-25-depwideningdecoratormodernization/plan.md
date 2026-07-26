# Plan: Widen the plugin toolchain ranges and make `@trace` dual-mode

> Grounding: architect (technical survey) consulted · web-researcher (selection / version-fit gate) consulted
> Spec: `documentation/specs/babel-plain-function-tracing.md` — covers workstream A's feature but carries
> no version claims; none for workstream B.
>
> Folder location note: this plan lives under `documentation/plans/`, not the `seed-plan.js` default
> `docs/plans/`. `rules/documentation.md` forbids the latter — `docs/` is the TypeDoc `out` dir and
> `pnpm docs` wipes it entirely (`cleanOutputDir`). The worklog uses the script's canonical header
> verbatim, as the existing plan folders do.

## Context

Two independent problems, both blocking adoption by ordinary TypeScript apps.

**1. The plugin peer ranges exclude the installed ecosystem.** `babel-plugin-loxer-trace` and
`vite-plugin-loxer-trace` declare `@babel/core: ^8.0.0`, `vite: ^8.0.0` and `engines.node: ">=22.18.0"`.
Babel 8.0.0 shipped 2026-06-16 and is ~2–3% of the tree: last-week downloads are `@babel/core@7.29.7`
≈ 58.9M vs `8.0.1` ≈ 1.68M. Concretely locked out today: `babel-preset-solid@1.9.12`, whose peer is
`@babel/core: ^7.0.0` and therefore *cannot* accept 8; and `@angular/compiler-cli@22.0.8`, which pins
`@babel/core: 7.29.7` exactly. Neither restriction is justified by the code — `api.assertVersion('^8.0.0')`
is the only hard gate, and the Vite adapter uses only `name` / `enforce` / `transform(code, id)`, a
contract current and non-deprecated across Vite 5–8. `engines.node: ">=22.18.0"` is inherited from
Babel 8's own floor, not from anything either package does (neither imports `node:`, `process` or `fs`).

> This reverses a deliberate earlier decision — see
> `documentation/plans/2026-07-22-babelplainfunctiontracing/plan.md:25-26`, which struck "Support Babel
> 7.23+ and Babel 8 through a dual peer range" because the plugin is "greenfield and build-time only".
> That reasoning does not hold: the Babel major is chosen by the *consuming app*, and consuming apps are
> on Babel 7.

**2. `@trace` only works under legacy decorators.** `src/decorators/trace.ts` is a legacy
(`experimentalDecorators: true`) method decorator — three-argument `(target, propertyKey, descriptor)`,
in-place descriptor mutation, decoration-time `target.constructor.name`. Apps on the TS 5+ default
(standard TC39 decorators) cannot use it, and `experimentalDecorators` is not a local decision: it
changes semantics project-wide, so an app using standard decorators anywhere cannot flip it.

Also found while surveying: **`initLoxer` is not a decorator.** Declared `(options: LoxerOptions) => void`,
so `@initLoxer({...})` does not typecheck (`Type 'void' has no call signatures`) and would no-op at
runtime because `__decorate` skips falsy decorators. Its only call site (`test/decorators.test.ts:122`)
uses it as a plain function; its JSDoc calls it a class decorator and `documentation/index.md:133` calls
it a *method* decorator. It is neither.

**Intended outcome:** the plugins install cleanly into Babel 7 and Vite 5–8 apps with that support
actually exercised by tests, and `@trace` works identically under both decorator protocols with no loss
of functionality.

## Approach

Ship as **three sequential commits — T (baseline), then A (deps), then B (decorators)**. A and B are
genuinely independent: only A touches the lockfile, and neither touches `tsconfig.json`. But
`pnpm build` = `tsc && pnpm --recursive --filter "./packages/**" run build` gates both trees at once, and
`main.yml` runs audit/lint/test/build in one job, so a half-landed change fails the other's verification.
A carries all the install and native-toolchain risk; landing it first means B runs against a known-good
tree and a revert of A doesn't take B with it.

### Corrections to the ranges chosen in conversation

The version-fit gate overturned four premises. Two change the numbers:

| Decision | Chosen in conversation | **Now** | Why |
| --- | --- | --- | --- |
| Babel floor | `^7.23.0 \|\| ^8.0.0` | **`^7.26.10 \|\| ^8.0.0`** | `^7.23.0` admits `7.23.0`/`7.23.1`, which carry CVE-2023-45133 (`@babel/traverse`, fixed 7.23.2). `7.26.10` also clears CVE-2025-27789. The floor was never API-motivated: `assertVersion` has accepted range strings **since 7.0.0**, not 7.13 as I stated. |
| `engines.node` | `>=20` | **`>=20.19.0`** | Vite 7 and 8 both declare `^20.19.0 \|\| >=22.12.0`. Bare `>=20` is also misleading: Babel 8's own engines is `^22.18.0 \|\| >=24.11.0`, so Node 20 cannot run the Babel 8 path at all. The README matrix must state the floor **per toolchain major**, not one flat number. |

Two more corrections that change the *argument* but not the numbers: `@vitejs/plugin-react@6.x` does
**not** depend on `@babel/core` (it moved to a `@rolldown/plugin-babel` peer and `vite: ^8.0.0`), so drop
it from the rationale entirely. And frameworks have *not* topped out at Vite 7 — Astro `7.1.3` depends on
`vite ^8.0.13` and Nuxt `4.5.0` on `^8.1.4`, both Vite-8-only. **SvelteKit is the only framework still
peer-allowing Vite 5** (`^5.0.3 || ^6.0.0 || ^7.0.0-beta.0 || ^8.0.0`).

**Vite 5 stays in the range as instructed, with a caveat recorded here rather than silently accepted.**
Vite 5.4 is EOL — `vite.dev/releases` backports security fixes only to 8.1/8.0/7.3/6.4, and
GHSA-fx2h-pf6j-xcff (2026-06-01) has no 5.4 fix and none planned. A *peer* range only permits a version
the app already installed, so this is not a vulnerability we introduce; but we should not advertise
support we can't audit. Mitigation: keep the `vite5` dev alias so the range floor is genuinely tested,
**and add a non-`--prod` `pnpm audit` step**, because `pnpm audit --prod` (`.github/workflows/main.yml:30`)
excludes devDependencies and will never report an advisory against the alias. If you'd rather not
advertise an EOL line, the drop-in alternative is `^6.0.0 || ^7.0.0 || ^8.0.0` with a `vite6` alias — say
so and I'll narrow it.

### Workstream T — baseline (one commit, no `src/` change)

Remove the 11 vestigial `// @ts-ignore` from `test/decorators.test.ts` (`:23`, `:27`, `:31`, `:39`, `:47`,
`:51`, `:55`, `:59`, `:63`, `:67`, `:93`). Verified read-only: a program serving the file with all of them
stripped produces **0 diagnostics**, also under `noImplicitAny: true`. They suppress nothing today — but
they *would* have masked a `TS1241` from workstream B's new typing, so removing them first is the
verification, not cosmetics. Do not convert them to `@ts-expect-error` (they would report `TS2578 Unused`).

### Workstream A — widen the toolchain ranges

**Manifests.** Both plugin packages: peer `@babel/core` → `^7.26.10 || ^8.0.0`; vite plugin also peer
`vite` → `^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`; `engines.node` → `>=20.19.0` on both plus
`examples/vite-trace-demo`. Root devDependencies gain **three** entries, not two:
`"babel7": "npm:@babel/core@^7.26.10"`, `"vite5": "npm:vite@^5.4.21"` and — the one the draft missed —
`"vite": "^8.1.5"`. Root `package.json` has no `vite` devDep and pnpm's strict layout means
`node_modules/vite` does not exist, so a root-level `test/*.test.ts` cannot `import { build } from 'vite'`
at all: it fails as `TS2307` under `pnpm typecheck:test` and as a resolution error under Vitest. Adding
root `vite` also makes it vitest's peer-resolved instance (range `^6||^7||^8`, satisfied), so expect more
lockfile churn than three lines implies.

**Add `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml`** in the same commit. `vite@5.4` depends
on `esbuild ^0.21`, whose `postinstall` materialises the platform binary. There is no build-script
allowlist anywhere in the repo today (no `pnpm` field, no `.npmrc`, `pendingBuilds: []`) and nothing in
the current tree needs one — Vite 8 uses rolldown with napi optional packages and no install script.
pnpm 10 blocks unlisted build scripts with a **warning and exit 0**, so CI's install step passes and the
failure surfaces later as an esbuild binary error inside `build()` on all 9 matrix legs. Verify by
grepping the install output for "Ignored build scripts".

**Source.** `packages/babel-plugin-loxer-trace/src/plugin.ts:27` →
`api.assertVersion('^7.26.10 || ^8.0.0')`; this is the hard gate, so a widened peer range alone changes
nothing. Drop "Babel 8" from the JSDoc at `:18`. Then get **all** Babel types out of the published
`.d.ts` — a Babel 7 consumer has no bundled types (`@babel/core@7.29.7` ships no `types`/`exports`) and
would otherwise need `@types/babel__core` (last published 7.20.5, 2023-11-20) just to typecheck against
us. Three leaks, in ascending severity:

1. `src/transform.ts` — `FileResult` is the Babel 8 name; Babel 7's DT calls it `BabelFileResult` and
   ships **no compatibility alias**. Replace with a structural `LoxerTraceResult`, keeping `code`
   narrowable to `string` after `if (!result?.code)` and `map` assignable to `any` — that is what
   `packages/vite-plugin-loxer-trace/src/index.ts:35-44` consumes.
2. `src/types.ts` — `sourceMaps?: InputOptions['sourceMaps']` → `boolean | 'inline' | 'both'`.
3. `src/types.ts:23` — **`export type BabelTypes = (typeof import('@babel/core'))['types']`.** The draft
   called this "already structural". It is not: it is a dynamic type import of the *entire* module, it is
   `export`ed, and `declaration: true` emits it verbatim into the shipped `dist/types.d.ts`. This is the
   worst of the three. Replace with a hand-written structural subset covering only the builders and
   checkers `plugin.ts` and `trace-binding.ts` actually use.

The draft's verification gate ("no `FileResult` / `InputOptions` in `dist`") would have passed with leak 3
intact. **The gate is `grep -r "@babel/core" packages/*/dist/` returning nothing.**

**Tests.** `test/vite-plugin-loxer-trace.test.ts` calls `plugin.transform.call(...)` directly and never
invokes Vite, so the Vite range is currently unverifiable. Two new files:

- **`test/babel7-compat.test.ts`** — import `loxerTracePlugin` directly (not `transformLoxerTrace`, which
  hard-imports `@babel/core` at `src/transform.ts:1` and would resolve to the package's own Babel 8) and
  drive it with Babel 7's own `transformAsync`. All `@babel/types` usage flows from the caller
  (`api.types` in `plugin.ts:27`, `t: BabelTypes` as a parameter in `trace-binding.ts`), which is why this
  works at all. Mirror `test/plain-function-trace.test.ts:805-825`'s base64 → `data:text/javascript` →
  dynamic `import()` pattern so generated code runs against the real `src/trace` runtime. Cover
  `assertVersion` acceptance, marker detection/removal, runtime import injection, callable semantics
  (`this` / `arguments` / `.length` / named recursion), native promise identity, and
  `buildCodeFrameError` diagnostics. Deliberately a **subset** of the 30 cases in
  `plain-function-trace.test.ts` — state that rationale in a header comment so it isn't mistaken for
  parity. Two things to get right: `@babel/core@7` is **CJS-only**, so use
  `import babel7 from 'babel7'; const { transformAsync } = babel7;` (prove it with a three-line smoke test
  before writing the file); and **assert the transform actually ran under Babel 7** by reading `api.version`
  through a wrapper plugin, or the suite can silently pass against Babel 8.
- **`test/vite-plugin-build.test.ts`** — real `build()` from both the `vite5` alias and `vite` (8) over a
  committed fixture, asserting `__startTrace` in the output. This is the first test to exercise Vite's
  actual plugin container. The plugin object is safe to hand to both instances: its only runtime import is
  `babel-plugin-loxer-trace` and `Plugin` is `import type` only. Required details, none in the draft:
  `write: false` **and** `configFile: false` (else Vite discovers ambient config and `.env`), `cacheDir`
  pointed at a scratch path (`write: false` does not stop `node_modules/.vite`), `logLevel: 'silent'`,
  root resolved via `fileURLToPath(new URL('./fixtures/vite-app/', import.meta.url))` rather than cwd, and
  either a committed `index.html` or `build.rollupOptions.input` (Vite's default input is
  `<root>/index.html`). Assert on a substring of `output[0].code`, never a `fileName` or path — the CI
  matrix includes `windows-latest`. **The return types diverge** (Vite 5 → `RollupOutput`, Vite 8 →
  rolldown's `RolldownOutput`, unrelated nominal types from different packages), so `output[0].code` is
  not reachable on either union: use one shared assertion helper over `unknown` with a runtime shape
  check. Do not mutate `process.env.NODE_ENV` between the two `build()` calls.

`test/fixtures/` is not collected as a suite (`vitest.config.ts:16-21` includes only
`test/**/*.test.ts`) — but it is also typechecked by nothing, since `test/tsconfig.json:12` matches only
`**/*.test.ts`. Accept that or add the path.

**No new CI matrix leg is needed** — both Babel majors and both Vite majors are in the lockfile, so the
existing Node 20/22/24 × 3-OS matrix exercises them everywhere. Two CI constraints to respect:
`coverage.yml` parses `pnpm test | tail -2 | head -1` into a badge, so **any stdout written after the
coverage summary silently corrupts it** — the Vite fixture must not `console.log`; and `coverage.yml` runs
**Node 20.x only**, while Babel 8 and Vite 8 both need `^20.19.0 || >=22.12.0`.

**Docs.** Fix `README.md:72`, `documentation/index.md:58-60`,
`packages/babel-plugin-loxer-trace/README.md:7-8`, and the rendered
`examples/vite-trace-demo/src/main.ts:39` eyebrow string. Add a support matrix to the Babel plugin README
stating the Node floor **per toolchain major** (Babel 7 + Vite 5/6 → `>=20.19.0`; Babel 8 → `>=22.18.0`).
Then `pnpm docs`, since `typedoc.json` sets no `readme` and `README.md` is the generated front page. Do
not edit `documentation/plans/2026-07-22-*` — historical records are immutable; the reversal is recorded
in this plan's Context.

### Workstream B — dual-mode decorators

**Dispatch on `args[1]`, never on arity.** In the legacy protocol `args[1]` is the property key
(`string | symbol`, never `typeof === 'object'`); in the standard protocol it is always an object with a
string `kind`. Arity is unusable — `__decorate` calls property decorators with three arguments and
`descriptor === undefined`. Check `typeof value === 'object'` *before* `'kind' in value`, since `in`
throws on a symbol RHS.

- **Standard branch** — validate `kind === 'method'` and that the value is a function, then **return** the
  replacement.
- **Legacy branch** — mutate `descriptor.value` **and** `return descriptor`. Returning is a strict no-op
  for every known helper (`r = d(target, key, r) || r` in tsc's `__decorate`, oxc's `_decorate`, Babel's
  `_applyDecoratedDescriptor`) and is the only thing that survives a helper that clones the descriptor
  first. Keep the mutation for shims that ignore the return value.
- **Non-method kinds throw `TypeError`.** Reachable only from plain JS or `@ts-ignore` (TS rejects
  field/getter/class application in both modes), and it fixes a latent crash: today `@trace` on a property
  yields `Cannot read properties of undefined (reading 'value')`.
- Normalise symbol keys through a `methodName()` helper — the current `propertyKey: string` quietly lied.

**Shared wrapper.** Extract `createTracedMethod(original, propertyKey, options)`, called by both branches
— today's `descriptor.value` body verbatim except class-name resolution. Explicitly unchanged: no
`sanitizeMessage`, no `try/catch` around formatters, no `undefined`-serialization guard, **no `.catch`** —
async rejection must keep emitting no close log and no error log (`test/decorators.test.ts:189-197`).

**Fix the async/sync asymmetry while extracting.** The sync path hoists both messages into locals before
the modifier chain (`trace.ts:38`, `:65-66`), but the async path evaluates `getCloseMessage(...)` as an
argument *inside* the chain (`:53-58`), after `Loxer.h(...)` and `.of(loxId)` have run. A user
`closeMessage` callback that itself touches `Loxer` triggers `resetState()` (`Loxer.ts:362-363`) and the
close log silently loses its highlight. Latent today; `createTracedMethod` would inherit it, and it is the
only way B could introduce a *new* hazard — if `resolveClassName(this)` were pushed down into
`getCloseMessage` instead of hoisted, an instrumented `constructor` getter would clobber the state
mid-chain. Hoist `closeMessage` and `resultItem` into locals in the async branch too: two lines, removes
the latent bug, and makes both branches structurally identical. Add a test — `closeMessage` that calls
`Loxer.log()` on an async method under `highlight: 'all'`, asserting the close log is still highlighted.

**Call-time class name.** `resolveClassName(instance)` returns `''` when unknown:
`typeof instance === 'function' ? instance.name : instance?.constructor?.name`, in a `try/catch` so a
hostile proxy cannot break a log call, with a non-string guard. Keep the `Class`-suffix trimming but use
`slice(0, -5)` not the deprecated `substr`. Resolve **lazily** so the common case pays nothing per call:

```ts
const needsClassName =
  o?.openMessage === 'className.functionName' || o?.closeMessage === 'className.functionName';
const fixedName = needsClassName ? resolveClassName(this) : '';
```

Only the `className.functionName` branches change, to `classPrefix(fixedName) + propertyKey + '()'` /
`+ ' done'`. When the name is unknown the message degrades to `'named()'` rather than a leading dot.
Verified against real standard emit: instance → `this.constructor.name`; static → `this` *is* the
constructor; subclass → subclass name; detached call → `this === undefined`, no throw.

**Keep `Loxer.h(...).of(loxId).close(...)` verbatim.** `open()` returns a bound `OfLoxes` with `.id`
grafted on (`Loxer.ts:194-228`), so `loxId.close(msg)` *looks* equivalent during a rewrite. It is not: the
captured object predates `resetState()`, so calling it directly drops the highlight and skips `of()`'s
re-check of `_isDisabled` and its `findOpenLox` miss path (`Loxer.ts:248-298`). The
`h().l().m()` chain itself is safe — `resetState()` fires only inside `switchOutput`, and
`Modules.ensureModule` (`src/core/Modules.ts:42-44`) is pure and emits nothing.

**Types.** An `interface` with two call signatures — same resolution as an intersection (verified: 0
diagnostics in both modes, either ordering), but the emitted `.d.ts` reads as a named interface with a doc
comment per protocol.

```ts
export interface TraceMethodContext {
  readonly kind: 'method';
  readonly name: string | symbol;
  readonly static: boolean;
  readonly private: boolean;
  addInitializer(initializer: () => void): void;
}

export interface TraceMethodDecorator {
  /** legacy TypeScript protocol — `experimentalDecorators: true` */
  (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): any;
  /** standard TC39 stage 3 protocol — TypeScript >= 5.0 default */
  <T extends TracedMethod>(value: T, context: TraceMethodContext): T;
}
```

Two things verified the hard way. **Do not constrain the standard signature to `Args`/`Result`:**
`<T extends (...a: [...Args]) => Result>` gives 0 diagnostics in legacy mode but `TS1241` on every
`@trace('NONE')` in standard mode, because `Args` defaults to `readonly unknown[]` and
`(n: number) => number` is not assignable to `(...a: unknown[]) => unknown` under `strictFunctionTypes` —
it would ship broken for the new mode only. Nothing is lost: the two `// @ts-expect-error` at
`test/decorators.test.ts:80`/`:88` are checked inside the `trace<Args, Result>(options)` call, upstream of
any application, so they keep erroring. And **`TraceMethodContext` is local on purpose** —
`ClassMethodDecoratorContext` was introduced in TypeScript **5.0**, and `declaration: true` would put that
name into `dist/decorators/trace.d.ts`, raising the minimum TS for exactly the legacy-decorator
population this refactor exists to keep working. Every real context satisfies the shape structurally.

**`initLoxer`.** Keep the eager `Loxer.init(options)`; return a no-op decorator. One signature with an
optional second parameter covers both protocols — legacy passes the constructor only, standard adds the
context — so no intersection is needed. Widening the return type from `void` to a function type is
source-compatible; `test/decorators.test.ts:122` ignores it.

```ts
export type InitLoxerDecorator = (target: unknown, context?: InitLoxerClassContext) => void;
```

**Guard the bare-`@initLoxer` footgun this creates.** Today `@initLoxer` without parens calls
`initLoxer(TargetClass)` → junk config, but `__decorate` sees `undefined` and leaves the class alone.
After the change it returns the no-op decorator, which `__decorate` installs **as the class** — silent,
total breakage. TS rejects it (weak-type check on all-optional `LoxerOptions` vs a constructor), so it is
plain-JS/`@ts-ignore` only, the same reachability class as `@trace`'s `TypeError`. Guard it
(`typeof options === 'function'` → return nothing) rather than accept it.

**Keep every new helper non-exported.** `src/index.ts:5-6` are `export *` from the decorator files
directly (not through `src/decorators/index.ts`), and `rules/coding-conventions.md` makes that surface a
one-way door. An accidental `export function resolveClassName` is permanent. `@internal` hides a symbol
from `docs/` (`typedoc.json` `excludeInternal: true`) but **not** from `dist/index.d.ts`. Conversely the
four new *types* should stay public and undecorated — they are the contract for anyone annotating a
decorator variable, and `src/decorators/index.ts` is a TypeDoc entry point, so they will appear on the
Decorators page alongside `trace`/`initLoxer`/`TraceOptions`.

**Testing — three layers, because oxc cannot emit standard decorators.** Verified, not assumed: at
`legacy: false` oxc returns decorator syntax verbatim with zero errors (its `DecoratorOptions` exposes
only `legacy` and `emitDecoratorMetadata`), and Node rejects that with `SyntaxError`. A second Vitest
project for standard-mode emit is therefore **impossible**; `vitest.config.ts` keeps
`oxc.decorator.legacy: true` globally and needs no change.

1. **Keep `test/decorators.test.ts` and extend it.** Its syntactic `class Service { @trace(...) … }` is the
   only thing exercising oxc's real legacy `_decorate` emit and is the quote-verified contract
   `rules/testing.md:22` points at. Rewriting it into a parameterized suite would trade the regression
   baseline for cosmetics.
2. **New `test/trace-cases.ts`** (not `*.test.ts`, so Vitest ignores it as a suite; still typechecked
   transitively via the importing test file) — the 12 cases as a table plus
   `installTraced(mode, host, testCase)`, applying the decorator through *either* protocol by hand:
   legacy mirrors `__decorate`, standard mirrors `__esDecorate` with the real context shape
   (`kind, name, static, private, access, metadata, addInitializer`). One table, both protocols, and it
   cross-checks that the branches produce byte-identical logs. Append to `decorators.test.ts`:
   `describe.each(['legacy','standard'])` over the table; the call-time class-name cases (static →
   `'Service.stat()'`, subclass → `'Sub.named()'`, detached → no throw, `'named()'`); and protocol
   contracts (legacy returns the same descriptor object, standard returns a function `!== original`,
   misuse throws `TypeError`).
3. **New `test/decorators-standard-emit.test.ts`** — the conformance guard proving TS's real emit matches
   the convention layer 2 asserts. (a) `ts.transpileModule` with `experimentalDecorators: false` → base64
   → `data:` URL → `import()`, with `trace` taken off `globalThis` so no module resolution is involved.
   (b) an in-memory `ts.createProgram` over a virtual fixture importing the **real**
   `src/decorators/trace.js`, run with `experimentalDecorators` both `true` and `false`, asserting 0
   diagnostics both times — it fails today with `TS1241 ×2`, so it is a genuine guard, not a tautology.
   `typescript@6.0.3` is already a root devDep; no new dependency.

`test/tsconfig.json` needs **no** `experimentalDecorators: false` variant — standard-form application
never appears as syntax in any test file, and (b) covers both modes without a second config or script.

**Docs beyond the draft's list.** `documentation/index.md:112` says `className.functionName` "uses the
class and method name for decorators", which no longer describes the static, subclass or degraded cases.
`documentation/index.md:133` writes `@initLoxer(options?: LoxerOptions)` with **optional** options while
the source requires them — widen the signature (`Loxer.init(props?)` at `Loxer.ts:43` accepts undefined)
or fix the doc. `src/decorators/AGENTS.md:15` frames the `Class`-suffix rule as decoration-time and needs
the dual-protocol and `TypeError` invariants. Add a `documentation/index.md` section on using `@trace`
under standard decorators. Record in `rules/testing.md` that oxc cannot emit standard decorators, as
verified fact, so nobody retries a second Vitest project.

Note for the docs: `playground/OrderService.js:9` states it showcases everything **except** the
decorators, so `node playground/OrderService.js` exercises **zero** of workstream B — don't count it as B
coverage. And `loxer` exports `trace` (the decorator) while `loxer/trace` exports `trace` (the
plain-function marker); the Babel plugin matches only the binding imported from `traceImport`
(`plugin.ts:44-58`), so `import { trace } from 'loxer'` is silently ignored with **no diagnostic**. B makes
`@trace` reachable by a much larger population, raising the odds of that mix-up — worth a line in the
guide.

## Critical files

- `packages/babel-plugin-loxer-trace/package.json` · `packages/vite-plugin-loxer-trace/package.json` ·
  `examples/vite-trace-demo/package.json` — peer ranges and `engines.node`
- `package.json` — root devDeps: `babel7`, `vite5`, **and `vite`**; version bumps
- `pnpm-workspace.yaml` — `onlyBuiltDependencies: [esbuild]` (2 lines today)
- `pnpm-lock.yaml` — must be regenerated and committed; `main.yml:34` uses `--frozen-lockfile`
- `packages/babel-plugin-loxer-trace/src/plugin.ts:18,27` — `assertVersion` gate and JSDoc
- `packages/babel-plugin-loxer-trace/src/transform.ts:1` · `src/types.ts:23` — the three Babel type leaks
- `packages/vite-plugin-loxer-trace/src/index.ts:12,35-44` — consumes the changed result type; bare
  `Plugin` annotation resolved at the consumer, so no Vite-major type escapes its `.d.ts`
- `src/decorators/trace.ts` — the decorator; note the sync/async asymmetry at `:53-58` vs `:65-71`
- `src/decorators/initLoxer.ts` — 15 lines; the bare-`@initLoxer` footgun
- `src/index.ts:5-6` — `export *`, the one-way public surface
- `src/Loxer.ts:194-228,230-330,362-363` · `src/types.ts:356` · `src/core/Modules.ts:42-44` — why
  `.of(OpenedLox)` and the modifier chain are safe as written
- `test/decorators.test.ts` — the 12-test contract; `test/plain-function-trace.test.ts:805-825` — the
  `data:` URL pattern to mirror; `test/vite-plugin-loxer-trace.test.ts` — the hook-level tests that never
  invoke Vite
- `.github/workflows/main.yml` · `coverage.yml` · `publish.yml` — frozen lockfile, `audit --prod`, the
  fragile `tail -2` badge parser, the bare root publish
- `documentation/index.md:58-60,112,133` · `README.md:72` ·
  `packages/babel-plugin-loxer-trace/README.md:7-8` · `src/decorators/AGENTS.md` · `rules/testing.md`

## Risks & open questions

- **Vite 5 is EOL** and no security patch will ever land on 5.4. Kept in the peer range per instruction,
  mitigated with a non-`--prod` audit step; narrowing to `^6 || ^7 || ^8` is a one-line change if
  preferred. **Open — your call.**
- **`pnpm audit --prod` is blind to the aliases**, so nothing in CI will report an advisory against
  `babel7`/`vite5`. Hence the extra non-prod audit step.
- **Babel 7 has ~11 months of runway** — security support until June 2027 per the 8.0.0 announcement. The
  docs should say "supported" with that horizon, not imply indefinite support.
- **pnpm alias/peer noise:** pnpm matches peers by real name, so `babel7` won't satisfy an `@babel/core`
  peer and pnpm#11126 (open, reproduced through 10.33) emits spurious "unmet peer dependency" warnings for
  aliases from outside the workspace. Noise, not breakage; `peerDependencyRules` in
  `pnpm-workspace.yaml` silences it.
- **Publish ordering is a constraint, not an open item.** `packages/vite-plugin-loxer-trace` has a real
  `dependencies: { "babel-plugin-loxer-trace": "workspace:^" }`, rewritten on publish to
  `^<babelPluginVersion>`. The babel plugin **must** publish first. And `publish.yml` runs a bare root
  `pnpm publish`, which ships only `loxer` — nothing currently publishes either plugin, so the version
  bumps need a decision (likely `pnpm -r publish` with per-package provenance;
  `examples/vite-trace-demo` is `private: true` so it stays out).
- **Published manifest cosmetics:** npm/pnpm do not strip `devDependencies` from a published manifest, so
  the `npm:` alias specs will appear in `loxer@3.1.0`'s package.json. Harmless for installs; some SBOM
  tooling mis-parses alias specs. Check with `pnpm pack`.
- **Vite 8 / rolldown `moduleType`:** the Vite 8 migration guide notes that hooks converting other module
  types to JS may need `moduleType: 'js'` on the return value. Shouldn't hit a `.ts`→JS transform, but it
  needs an actual run to confirm — that's what `test/vite-plugin-build.test.ts` is for.
- **TypeScript's own trajectory:** TS 7.0 (the Go compiler) went GA 2026-07-08. `experimentalDecorators`
  has no deprecation banner, and legacy decorator emit plus `emitDecoratorMetadata` **are** implemented in
  typescript-go (PR #2343). So "legacy decorators work today, including under TS 7" is defensible;
  "indefinite support" is not — phrase it as "no announced removal".
- **`pnpm docs` exiting 0 is a weak gate** — `typedoc.json` sets no `treatWarningsAsErrors`, so it passes
  even if the Decorators page is wrong. Eyeball `docs/modules/Decorators.html` after regenerating.
- **Unverified read-only:** the exact TS 4.x consumer error for `ClassMethodDecoratorContext` in a shipped
  `.d.ts` (the local interface costs nothing, so the decision holds either way); that
  `import ts from 'typescript'` resolves inside Vitest (`createRequire(import.meta.url)` is the fallback)
  and its effect on `pnpm test` wall time; and whether SWC's/esbuild's legacy emit pass exactly three
  arguments (the `args[1]` discriminator doesn't depend on arity, so it's robust either way).

## Verification

1. `pnpm install` — grep the output for "Ignored build scripts"; there must be none.
2. `pnpm audit --prod` **and** a plain `pnpm audit` — the first must stay clean, the second is the new
   visibility into the dev aliases.
3. `pnpm lint && pnpm test && pnpm typecheck:test && pnpm build` — all exit 0. Task-level gates:
   `grep -r "@babel/core" packages/*/dist/` returns nothing; the Babel-7 suite asserts `api.version`
   starts with `7`; the Vite build test asserts `__startTrace` under both majors; all 12 original
   decorator assertions unchanged (`'withArgs done. returns: {"n":3,"s":"x"}'`,
   `'withTypes done. returns: \n5'`, `'Service.named()'`, async rejection emitting no close log, the
   `afterAll` prod-array check); legacy and standard rows produce identical messages, items and
   highlights.
4. `pnpm docs` exits 0 **and** `docs/modules/Decorators.html` shows the four new types and none of the
   internal helpers.
5. `pnpm build && node playground/OrderService.js` — the playground imports `../dist/index.js` and is
   covered by neither lint nor tests. Verifies A and the core, **not** B.
6. `pnpm demo:build` (`tsc --noEmit && vite build`) — the Vite plugin end to end through a real build with
   the widened peer range.
7. Manual consumer smoke for the standard path: in a scratch dir outside the repo, `tsc` a small class
   using `@trace` with `experimentalDecorators` **absent**, run it against the built `dist/`, and confirm
   the box opens and closes. The in-repo tests simulate the protocol; this confirms a real consumer
   compile.

## Out of scope

- Unifying the decorator with `src/trace.ts`'s `__startTrace` / `FunctionTrace` runtime. They deliberately
  differ on async-rejection handling, sanitization, formatter error containment and promise identity, and
  `test/decorators.test.ts:189-197` pins the decorator's behaviour. Worth a follow-up plan.
- Preserving the wrapper's `name` / `length` (today's wrapper already reports `''` / `0`); any use of
  `context.addInitializer` / `access` / `metadata`.
- Converting `test/plain-function-trace.test.ts`'s 30 hand-written tests into a Babel-major table.
- Removing the `@babel/core` peer from the Vite plugin — inherent to the approach, but the install docs
  must say plainly that adopting it means adding Babel to an esbuild/rolldown app.
- Angular support via the Vite plugin. `@angular/build@22.0.8` pins `vite: 7.3.6` and exposes no user
  `vite.config.ts`; angular-cli#27951 was closed "not planned". Angular is an argument for the **Babel**
  widening, not the Vite one.
