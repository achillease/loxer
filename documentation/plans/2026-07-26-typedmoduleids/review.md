# Review: Type-safe module ids via `LoxerModuleRegistry` declaration merging

**Verdict:** WARN
**Scope:** `src/index.ts`, `src/types.ts`, `src/tracing-types.ts`, `src/decorators/trace.ts`,
`eslint.config.mjs`, `typedoc.json`, `package.json`, `.github/workflows/main.yml`,
`examples/vite-trace-demo/src/main.ts`, new `test/types/registry.test-d.ts` +
`test/types/tsconfig.json`. `src/trace.ts` and `src/Loxer.ts` read but unchanged.
**Lenses run:** code ✓ · test ✓ · acceptance ✓ (against `plan.md` — no spec exists) ·
security skipped: no dependency/lockfile change, no runtime code, no auth/data handling ·
perf skipped: zero runtime change (types only) ·
a11y skipped: the demo diff is module configuration, no markup or interaction change

## Findings (by severity)

- **[HIGH]** `documentation/index.md:172` and `documentation/index.md:445` — the guide teaches the
  exact anti-pattern this change makes dangerous. `:172` advises "declare a separate
  `const options: LoxerOptions`" and `:445` writes `export const DEFAULT_MODULES: LoxerModules = {`.
  Both are **annotations**, which widen the module keys to `string`, so a consumer who follows the
  guide and augments the registry gets no autocompletion and no error on a typo — silently, with no
  diagnostic anywhere. Before this change the annotation-vs-`satisfies` choice was inert; now it is
  a live silent-failure mode, and nothing in `documentation/` warns about it.
  - **Fix:** rewrite both spots to `satisfies LoxerModules` / `satisfies LoxerOptions`, and land at
    least a one-line caveat at each (ideally the full augmentation section) in *this* change rather
    than leaving the shipped guide actively wrong until the Documentation phase runs.
  - **Cites:** `rules/documentation.md` ("Keep `documentation/` examples aligned with the public API
    exported by `src/index.ts`"; "when a feature adds a concept a user must learn, update the guide
    in the same change") · `plan.md` step 6 + Risks ("degrades silently") · caught by acceptance
    (HIGH) and code (MEDIUM) — merged at the higher severity.

- **[HIGH]** `.github/workflows/main.yml:46-48`, `package.json:38-39` — the new gate only protects
  the **augmented** branch of `ModuleId`. The un-augmented fallback (`ModuleId = string` when the
  registry is empty — the state *every* current consumer is in) is exercised only by the ordinary
  suites, and the only thing that would catch a regression there is `pnpm typecheck:test`, which is
  wired into neither CI (Lint → Test → Build → typecheck:types) nor `.husky/pre-commit` (lint only);
  `pnpm test` never type-checks, since vitest transpiles via oxc. A regression that narrowed
  `ModuleId` even with an empty registry — breaking every existing consumer — would exit 0 through
  the entire pipeline.
  - **Fix:** add a `pnpm typecheck:test` step to `.github/workflows/main.yml`. It doesn't read
    `dist/`, so its ordering is unconstrained.
  - **Cites:** `rules/testing.md` (documents `typecheck:test` as a gate but never wires it to CI) ·
    `plan.md:275-276` ("Currently green; must stay green" — nothing enforces that) · caught by test.

- **[MEDIUM]** `test/types/registry.test-d.ts:30-32` — the `Equals<A, B>` helper
  (`[A] extends [B] ? ([B] extends [A] ? true : false) : false`) is unsound for `any`. Verified
  empirically by the reviewer: `Equals<any, string>` resolves to `true`. If a regression collapsed
  `ModuleId` or `keyof typeof modules` to `any` (e.g. an unresolved circular import — and this
  change *introduces* a type-only cycle between `index.ts` and `types.ts`), `idIsNarrowed` and
  `keysStayLiteral` would still pass. Residual risk is low because the `@ts-expect-error` negatives
  independently backstop most such regressions, but the helper has exactly the hole it looks like it
  doesn't.
  - **Fix:** use the `any`-safe form
    `type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;`
    or add a companion `0 extends 1 & ModuleId ? false : true` assertion.
  - **Cites:** inline test-smell checklist (assertion that passes under a specific regression class)
    · caught by test.

- **[MEDIUM]** `src/index.ts:9-22` — the newly exported `LoxerCallbacks` / `LoxerOptions` reference
  `OutputLox` and `ErrorLox`, neither of which is exported from `src/index.ts`, and the `exports`
  map blocks deep imports. A consumer can now name `LoxerCallbacks` but still cannot write
  `function myDevLog(log: OutputLox) {…}` and assign it — the type is reachable but partly unusable.
  The gap was invisible before this change (the whole option surface was unnameable); exporting the
  surface exposed it.
  - **Fix:** add `OutputLox` and `ErrorLox` to the `export type { … } from './types.js'` list (both
    are already imported by `types.ts`), or state the limitation in the `LoxerCallbacks` JSDoc.
  - **Cites:** `rules/coding-conventions.md` (export-surface rule — additive is fine, but an
    additive export that is structurally unusable is a design gap) · caught by code.

- **[MEDIUM]** `package.json` (version `3.0.0`, no `CHANGELOG.md` in the repo) — narrowing
  `getModuleLevel` is an intentional, decided-with-the-user breaking change for a TS consumer who
  augments the registry *and* probes a deliberately-unregistered id (a previously supported pattern,
  which the documented `-1` return exists to serve). It is well mitigated in JSDoc and is opt-in, but
  nothing versions or records it.
  - **Fix:** record it wherever this repo signals breaking changes (a changelog entry or a release
    note); no code change.
  - **Cites:** baseline backward-compat checklist ("intentional *and versioned*, or an accidental
    break") · caught by code.

- **[MEDIUM]** `src/types.ts:183-185` (`ModuleId`) — the registry is one global declaration-merging
  target per compilation. If two packages whose **sources share a compilation** each augment it, a
  third package's previously valid `Loxer.m('ITS_OWN_ID')` becomes an error. A consumer of an
  independently published, pre-compiled package is unaffected (a built `.d.ts` contains no call
  sites), so the blast radius is monorepo/project-references builds only. Inherent to the pattern
  the plan deliberately chose, and already disclosed in the `LoxerModuleRegistry` JSDoc — recorded
  so the trade-off is on file, not because it is hidden.
  - **Fix:** none in code. Add the monorepo caveat to the guide section when it lands.
  - **Cites:** baseline backward-compat checklist (global-state coupling) · caught by code.

- **[LOW]** `test/types/registry.test-d.ts:75` — the trailing
  `export { keysStayLiteral, idIsNarrowed, level, missing };` is dead ceremony. Neither tsconfig sets
  `noUnusedLocals`, and the file is already a module via its imports, so nothing needs it and nothing
  consumes it.
  - **Fix:** drop the line, or keep it with a comment saying it guards against `noUnusedLocals`
    being enabled later.
  - **Cites:** inline test-smell checklist (dead declarations) · caught by test.

## Rule coverage gaps

- `rules/testing.md` documents **none** of the verification lane this change introduces: the
  `typecheck:types` gate, the `test/types/` folder, the `.test-d.ts` suffix convention, the
  post-`build` ordering requirement, or *why* it must stay a separate compilation unit (a
  `declare module` augmentation is program-wide). Its intro and Reference section still enumerate
  only the `test/*.test.ts` suites and `typecheck:test`. — surfaced by test **and** acceptance.
- `rules/documentation.md` has no rule about a guide footgun going live while the guide fix is
  deferred to a later phase. This change created exactly that window (shipped code and the guide
  actively disagree). Worth an explicit rule if the cross-phase deferral pattern recurs. — surfaced
  by acceptance.
- No project rule covers semver/changelog practice for a documented-but-opt-in breaking type change,
  and the repo has no `CHANGELOG.md` to check against. — surfaced by code.

## Verified clean (recorded so a later pass doesn't re-derive it)

- **No runtime import cycle** from the type-only `index.ts` ⇄ `types.ts` reference: `dist/types.js`
  is `export {};` only. The explicit `import type` would also survive `verbatimModuleSyntax`.
- **No export collisions** among the 12 added names; omitting the `Loxer` *type* alias (which would
  TS2308-collide with the `Loxer` value) leaves no unusable reference apart from the `OutputLox` /
  `ErrorLox` gap above.
- **Revised step 3 is sufficient.** `typeof options === 'string'` narrowing inside
  `createTracedMethod` works for both the `string` fallback and an augmented literal union;
  `src/trace.ts:93` genuinely needs no cast.
- **`src/Loxer.ts` untouched**, as parameter bivariance predicted.
- **Test isolation is real:** `*.test-d.ts` matches neither `vitest.config.ts`'s nor
  `test/tsconfig.json`'s `include`, so `pnpm test` and `pnpm typecheck:test` never see the new file.
  `Loxer.init(...)` at its module scope is never executed.
- **All five narrowed call sites are asserted**, including `TraceOptions.moduleId` through both
  `loxer` and `loxer/trace`, and the decorator shorthand in string and object form.
- **Verification step 7 holds:** `playground/OrderService.js:245`'s `getModuleLevel('NOPE')` → `-1` is
  unaffected — `playground/` is plain `.js`, never type-checked, and the runtime fallback is untouched.
- **CI ordering** (`build` → `typecheck:types`) is correct, and a stale/absent `dist/` fails loudly
  via `TS2307`, not silently.
- **Conventions:** explicit `.js` extensions, semicolons, prettier settings, no shadowing, no
  formatting-only churn mixed into the diff.
