# Review: standard log levels — pass 2 (the pass-1 fixes)

**Verdict:** WARN
**Scope:** the pass-1 fix set, reviewed against the change as a whole — `README.md` (image/badge
restoration), `src/core/Levels.ts` (new `resolveThreshold` / `resolveBoxLevel`), `src/core/Modules.ts`
(`getModule` / `getLevel`), `src/trace.ts`, `src/decorators/trace.ts`,
`packages/babel-plugin-loxer-trace/src/trace-binding.ts`, `documentation/index.md:388`.
**Lenses run:** code ✓ · security ✓ (dep-audit skipped — still no dependency or lockfile change) ·
perf ✓ (the fix put a resolver on the per-log path) · acceptance ✓ · test **skipped** — no test file
changed in the fix pass; its pass-1 findings carry forward unchanged · a11y **skipped** — no UI.

## Findings (by severity)

- **[HIGH]** `src/core/Levels.ts:47-51` — **The pass-1 fix for the fail-open threshold was itself
  bypassable.** `resolveThreshold` validated membership with `threshold in LEVEL_ORDER`, and `in`
  walks the prototype chain, so every name inherited from `Object.prototype` —
  `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'`,
  `'isPrototypeOf'`, `'propertyIsEnumerable'`, `'toLocaleString'` — passed as a known level and was
  cast straight through. `LEVEL_ORDER['constructor']` is then the `Object` constructor rather than a
  number, so `LEVEL_ORDER[level] > that` coerces to `NaN` and is `false` for every level: exactly the
  pass-1 fail-open, reached through a different string set. The pass-1 vectors (`0`, `'off'`) *were*
  closed; this class was not. Reproduced against the built `dist/`:
  `resolveThreshold('constructor', 'info')` → `'constructor'`, and
  `isHidden('debug', 'constructor')` → `false`, so a production module emitted a `debug` log
  carrying a fake token.
  - **Fix:** Use an own-property check — `Object.hasOwn(LEVEL_ORDER, threshold)` (ES2022, available
    on the declared Node ≥20 floor) instead of `in`.
  - **Cites:** baseline `SECURITY_REVIEW.md` (missing input validation / prototype-pollution class) ·
    baseline `CODE_REVIEW.md` §Correctness · project rules `AGENTS.md` ("Production output defaults
    to silence") and `src/core/AGENTS.md` ("`Levels.ts` is the single home of the ordering") ·
    caught by **code-reviewer** and **security-reviewer** independently

- **[MEDIUM]** `documentation/index.md:426,532` — The level/threshold wording rule was applied only
  at the two lines pass 1 cited, not swept. The "why use modules" bullet read "Give individual
  categories **their own level**" and the built-in-modules note read "set **their levels** to
  `'error'`" — both give a module a "level" rather than a threshold, adjacent to sections that get it
  right.
  - **Fix:** Reword to "their own threshold" and "set what they log up to to `'error'`".
  - **Cites:** project rule `rules/documentation.md` (level/threshold wording) · `worklog.md` 23:18 ·
    caught by **acceptance-reviewer**

- **[MEDIUM]** `documentation/index.md` (migration appendix) — The appendix's
  `devLevel: 0 → devLevel: 'error'` row reads as "behavior is unchanged", which holds only for a
  *translated* literal. After the fail-open fix, an **un-migrated** JavaScript config holding
  `prodLevel: 0` resolves to the `'info'` fallback — so it emits `error`, `warn` *and* `info` in
  production, not the errors-only the number used to mean. A legitimate design choice
  (visible-over-silent, consistent with the missing-threshold fallback), but the guide did not say so.
  - **Fix:** State in the appendix that an unrecognized threshold falls back to `'info'` — neither
    muted to `'error'` nor opened to `'debug'` — so the literal must actually be translated.
  - **Cites:** project rule `rules/documentation.md` ("keep the guide aligned with actual
    behavior") · `plan.md`'s `0 → 'error'` claim · caught by **acceptance-reviewer**

- **[MEDIUM]** `src/core/Modules.ts:80` — `getModule()` resolves the threshold on **every log**,
  though a module's `devLevel`/`prodLevel` is fixed for the lifetime of a `Modules` instance
  (`this._modules` is built once in the constructor and never written afterwards). The resolution
  could hoist to construction, leaving `getModule()` a bare read. Two constraints to preserve if
  hoisted: `ExtendedModule` is publicly exported and carries the module's **raw** `devLevel`/
  `prodLevel` to consumers via `OutputLox.module`, so those fields must not be normalized in place;
  and `getLevel()`'s `undefined`-vs-invalid distinction must survive.
  - **Fix:** Precompute resolved thresholds once in the constructor into a parallel private map.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory ("recomputing an invariant
    that could hoist out or be cached") · caught by **perf-reviewer**

- **[MEDIUM]** `test/modules.test.ts` — No test exercises a **defined-but-invalid** threshold. The
  `MALFORMED` fixture covers only the *missing*-property branch, which is why the `in` bug above
  shipped past a fully green 202-test suite. `resolveThreshold` / `resolveBoxLevel` have no direct
  unit test either.
  - **Fix:** Add a `Modules` case with `prodLevel: 'constructor'` (and a stale numeric) asserting
    `debug` stays hidden in production, plus direct unit tests of both resolvers in
    `test/levels.test.ts`. This is a regression test for a real security bug, not coverage padding,
    so `rules/testing.md`'s "never add a test solely to raise coverage" does not bar it.
  - **Cites:** pass 1's own fix text for the fail-open finding · project rule `rules/testing.md` ·
    caught by **code-reviewer** and **security-reviewer**

- **[MEDIUM — rebutted, see below]** `src/core/Levels.ts:59-61` — `resolveBoxLevel` falls back to
  `'info'` for an unrecognized level, which can *promote* visibility: a developer who mistypes
  `'debug'` gets a visible `'info'` box instead of a hidden `'debug'` one. Suggested falling back to
  `'debug'` so a typo fails toward more hidden.
  - **Cites:** baseline `SECURITY_REVIEW.md` (missing input validation) · caught by
    **security-reviewer** · **rebutted in this pass and accepted by the reviewer in pass 3** — see
    "Rebutted" below.

## Resolved by the pass-1 fixes (confirmed, no residual)

- **`README.md`** — restoration is faithful and complete. Diffed against `git show HEAD:README.md`:
  all 7 `![…]` image/badge references present with identical URLs, all three HTML comments restored,
  stray blank lines gone, trailing newline restored. This change's intended edits survive intact —
  the named-level quick-start block, `devLevel: 'info'` / `prodLevel: 'error'`, the corrected
  zero-dependency `## Deps` line, and the reworded feature bullet. Nothing over-reverted.
- **`getLevel()`'s narrowed contract** — coherent. `undefined` survives only for a module that
  declares no threshold at all (the contract `test/modules.test.ts:105` deliberately pins), while any
  *defined* value routes through the resolver and can never escape `LogLevel`. `getModule()`'s gate
  and `getLevel()`'s report agree on every input except that documented exception.
- **`'info'` as the fallback for an invalid threshold** — both code and security reviewers agree this
  is the right call and a **maintainer's product decision**, not a defect: the already-tested policy
  for a *missing* threshold is `'info'` in dev and prod alike
  (`test/modules.test.ts:75-88`), so extending it to an invalid value keeps one policy instead of
  two. Failing closed to `'error'` would be defensible but is a new, undocumented divergence.
- **`resolveThreshold`'s `unknown` parameter and its cast** — the right boundary type, since
  `Module.devLevel`/`prodLevel` are *required* `LogLevel` in `src/types.ts`; the only way an invalid
  value arrives is an untyped-JS consumer. The cast is sound **once the membership check is an
  own-property test**.
- **The trace crash path** — fully closed at both call sites. `resolveBoxLevel` uses strict `===`,
  not `in`, so it was never exposed to the prototype-chain class.
- **The Babel branch removal** — confirmed behavior-neutral by tracing the recursion:
  `isMemberExpression` and `isCallExpression` are mutually exclusive, so the removed branch and the
  generic check below return `false` for exactly the same inputs. The replacement comment is now
  factually accurate.
- **Purged vocabulary** — one draft of `resolveThreshold`'s JSDoc used the banned word "firehose" and
  was reworded before this pass; grepped clean across all new JSDoc.
- **The deferrals are intact, not silently dropped** — `src/Loxer.ts`, `documentation/Performance.md`,
  `rules/testing.md` and every test file have zero unstaged changes.

## Rebutted

- **`resolveBoxLevel`'s fallback should stay `'info'`, not become `'debug'`.** The same call site
  handles an **omitted** `level` option, and `'info'` is the documented default for a trace that
  specifies none (the pre-fix code was literally `o?.level ?? 'info'`). Falling back to `'debug'`
  would change the default for every trace with no level — a behaviour regression, not a hardening.
  Splitting omitted-vs-invalid is possible but adds a distinction with no security value, since trace
  options are developer-authored source rather than runtime input. **Pass 3 put this rebuttal to the
  security reviewer, who accepted it** and added two reasons of their own: `resolveBoxLevel` never
  indexes a lookup table (so the bypass class does not apply to it at all), and its output only
  selects which `LevelMethods` member opens the box — it is never compared against a module's
  threshold, so it has no gating effect.

## Rule coverage gaps

Carried forward from pass 1 unchanged (no spec · no `SECURITY.md` · no policy for validating module
config from outside the type checker · no benchmark-freshness rule · no suite-index manifest), plus:

- **No rule requires membership tests against an internal lookup table to use `Object.hasOwn` rather
  than `in`.** Worth codifying: this is the second fail-open in the same two-line function, and
  `src/core/color/parseColor.ts:93-95` already carries the identical lesson in a comment — the
  knowledge existed in the repo but was not enforceable. — surfaced by **security-reviewer**

## Notes

- Both reviewers reproduced the HIGH against the **built** `dist/`, not just source-level reasoning —
  the green 202-test suite does not exercise a prototype-collision threshold.
- Perf declined to report the added `typeof` + `in` per-log cost as a regression: `getModule()`
  already allocates a template literal, runs a per-character padding loop, and object-spreads a new
  `ExtendedModule` on every log, so the check is immaterial beside it. The MEDIUM above is about
  *redundancy* (hoistable invariant), not measured cost.
- New doc drift the fixes created but did not close (Documentation phase): `src/core/AGENTS.md`
  enumerates what `Levels.ts` owns without the two new helpers, and `src/decorators/AGENTS.md`
  documents the `[level].open(...)` dispatch without the normalization step.
