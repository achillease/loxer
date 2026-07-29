# Review (pass 2): Type-safe module ids — after the pass-1 fixes

**Verdict:** PASS (both pass-1 HIGHs closed; 1 new MEDIUM, 1 new LOW, 2 MEDIUMs carried forward)
**Scope:** the five fixes applied to `review.md`'s findings — `documentation/index.md`,
`.github/workflows/main.yml`, `test/types/registry.test-d.ts`, `src/index.ts` — plus a re-check that
pass 1's un-fixed findings still hold.
**Lenses run:** code ✓ · test ✓ · acceptance skipped: pass 1 verified plan steps 1-7 individually and
no plan criterion changed · security / perf / a11y skipped as in pass 1

## Pass-1 findings — disposition

| Pass-1 finding | Severity | Disposition |
| --- | --- | --- |
| Guide teaches the annotation anti-pattern (`documentation/index.md:172`, `:445`) | HIGH | **fixed** — verified |
| Un-augmented `ModuleId = string` fallback ungated (no `typecheck:test` in CI) | HIGH | **fixed** — verified |
| `Equals<A,B>` unsound for `any` | MEDIUM | **fixed** — verified |
| `LoxerCallbacks`/`LoxerOptions` reference unexported `OutputLox`/`ErrorLox` | MEDIUM | **fixed**, but incompletely — see finding below |
| No changelog/version signal for the `getModuleLevel` narrowing | MEDIUM | **open** — needs a product decision |
| Registry is one global merge target per compilation | MEDIUM | **accepted by design** — decided in planning, disclosed in JSDoc |
| Dead `export { … }` in the type test | LOW | **fixed** — verified |

## Findings (by severity)

- **[MEDIUM]** `src/index.ts:9-10` — the `OutputLox`/`ErrorLox` fix stopped one level too shallow.
  `OutputLox.module` is an `ExtendedModule` (`src/core/Modules.ts:14`) and the inherited `Lox.type`
  is a `LoxType` (`src/loxes/Lox.ts:6`); neither is exported, both are documented by those exact
  names at `documentation/index.md:536,552`. Confirmed by compiling against the real `dist/`:
  `declare function f(m: ExtendedModule)` fails with `TS2304`. A consumer writing
  `function devLog(lox: OutputLox) { const m: ExtendedModule = lox.module; … }` hits the same
  reachable-but-unusable gap the pass-1 finding was about.
  - **Fix:** export `ExtendedModule` and `LoxType` too.
  - **Cites:** `rules/coding-conventions.md` (export surface) · caught by code.

- **[LOW]** `documentation/index.md:445-449` — the `satisfies` rewrite went one spot too far. That
  snippet illustrates Loxer's **own internal** `DEFAULT_MODULES` (`src/core/Modules.ts:127`, marked
  `@internal`, still an annotation), and it never participates in registry augmentation — `NONE` /
  `DEFAULT` / `INVALID` come from the separately declared `DefaultModuleId` union, not from
  `keyof typeof DEFAULT_MODULES`. So the doc now diverges from the source it depicts, and the
  registry caveat doesn't actually apply to it.
  - **Fix:** revert that snippet to the annotation to match the source, and say it is Loxer's own
    declaration rather than a template.
  - **Cites:** `rules/documentation.md` (guide aligned with actual behavior) · caught by code.

## Verified clean this pass

- **`satisfies LoxerOptions` on the *outer* options object genuinely preserves the module keys** —
  this was the crux risk in the pass-1 fix (if it didn't, the new guide advice would be subtly
  wrong and users would need `satisfies LoxerModules` on the inner object). Empirically confirmed: a
  nested object literal under `satisfies` keeps its inferred literal type, whereas `: LoxerOptions`
  widens it.
- **The CI `typecheck:test` step is correctly placed and load-bearing.** `test/tsconfig.json`
  resolves nothing from `dist/`, so it has no ordering dependency on Build. Concretely traced call
  sites that would fail if `ModuleId` regressed with an empty registry: `test/boxed.test.ts:302`
  (`'ONE'`), `test/unboxed.test.ts:110-112` (`'veryWrong'`, `'TEST'`), `test/item.test.ts:40`
  (`'IT'`), `test/plain-function-trace.test.ts:64` (`'ORDER'`).
- **Husky hook left alone deliberately** — `pre-commit` runs lint only, and `pnpm test` isn't in it
  either; adding `typecheck:test` there would break the project's established fast-hook/CI split.
- **`Equals` + `NotAny` are sound.** `Equals<any, string>` is now `false`; `Equals` is
  order-independent across the two five-member unions; `NotAny<any>` is `false`. The unparenthesized
  second function type parses identically to the parenthesized form.
- **No sed damage from the sensitivity experiment** — the restore is byte-correct, line 37's longer
  union (which shares the `'PERS' | 'DB'` substring) is intact, no duplicated or mangled lines, no
  CRLF/LF mixing.
- Removing the trailing `export { … }` left the file a module via its imports; nothing orphaned.

## Rule coverage gaps

- Unchanged from pass 1: `rules/testing.md` still documents none of `typecheck:types`,
  `test/types/`, the `.test-d.ts` convention, or the post-`build` ordering requirement — the CI
  wiring is now correct but the project's own testing standard is silent on the lane. — code, test
- Unchanged from pass 1: no changelog/semver rule, and no `CHANGELOG.md`. — code
- **New (LOW, report only):** the type test *comments* that an `: LoxerModules` annotation widens
  the keys but never *asserts* it. A `const annotated: LoxerModules = …;` plus
  `Equals<keyof typeof annotated, string>` would give the documented footgun a real regression
  backstop. Belongs to the Testing phase — this loop does not write tests. — test
