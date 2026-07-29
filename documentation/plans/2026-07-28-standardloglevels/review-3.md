# Review: standard log levels — pass 3 (the pass-2 fixes)

**Verdict:** PASS
**Scope:** the pass-2 fix set — `src/core/Levels.ts` (`resolveThreshold` hardened to `Object.hasOwn`),
`documentation/index.md` (wording sweep completed at `:426` and `:532`; migration appendix gained the
un-migrated-config paragraph) — reviewed against the change as a whole.
**Lenses run:** code ✓ · security ✓ (dep-audit skipped — still no dependency or lockfile change) ·
acceptance ✓ · perf **skipped** — the only hot-path delta is `Object.hasOwn` replacing `in`, and
perf's standing MEDIUM ("hoist the resolution out of the per-log path") already covers the resolver
regardless of which check it uses; re-running it would only re-litigate a deferred finding · test
**skipped** — no test file changed since pass 1 · a11y **skipped** — no UI.

## Findings (by severity)

- **[MEDIUM]** `src/types.ts:28` — The JSDoc heading on `getModuleLevel` read `## Get a module's
  level`, giving a module a "level" and contradicting its **own next line** ("Returns the `LogLevel`
  the given `moduleId`s corresponding Module **logs up to**"). Introduced by this change: at `HEAD`
  the heading read `## Get a module's LogLevel` (the type name, not the bare word). It is the same
  self-contradicting heading-vs-body shape pass 1 flagged in the guide, and it survived both the
  pass-1 fix and pass 2's re-sweep because both swept `documentation/**` and `README.md` but not
  `src/**` JSDoc headings. A repo-wide grep confirmed it was the **only** surviving instance.
  - **Fix:** Reword the heading to `## Get the level a module logs up to`.
  - **Cites:** project rule `rules/documentation.md` (level/threshold wording) · `worklog.md` 23:18 ·
    caught by **acceptance-reviewer**

Nothing else at or above the confidence bar. **No CRITICAL, no HIGH open.**

## Both HIGHs confirmed RESOLVED

- **Pass 2's HIGH (the `in` bypass) — resolved.** `resolveThreshold` now gates on
  `typeof threshold === 'string' && Object.hasOwn(LEVEL_ORDER, threshold)`. Both reviewers
  independently re-ran the attack against the **built** `dist/` in production mode across
  `'constructor'`, `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'`, `'0'`, `0`, `'off'`,
  `null` and `undefined`: in every case the `debug` log is dropped, only `'info'` is emitted, and the
  error still reaches `prodError`. Neither could reopen it. Additional angles tried and cleared:
  symbol keys and a `String` wrapper object are gated out by the `typeof` check *before* `hasOwn`
  (fail-safe, not a new hole); a number-like `'0'` is not an own key; `Object.create(null)` is
  irrelevant since `hasOwn` does not consult the checked object's prototype.
- **Pass 1's HIGH (the fail-open threshold) — resolved,** now genuinely rather than partially: the
  resolver is the single chokepoint and it no longer admits a non-`LogLevel` value.
- **`Object.hasOwn` is safe on the declared floor** — shipped in V8 9.0 / Node 16.9, well under
  `engines.node >= 20`. `tsconfig.json`'s `target: ES2022` and `lib` admit it for type-checking, and
  it is a native built-in rather than something `tsc` down-levels, so there is no lib-masking-a-
  runtime-gap risk.
- **The fix matches an established in-repo pattern** — `src/core/color/parseColor.ts:93-95` already
  used `Object.hasOwn` with a comment naming this exact trap ("own-property check so inherited
  members (`constructor`, `toString`, …) do not resolve to an `Object.prototype` value"). The
  knowledge existed in the repo; it simply was not enforceable. Hence the new coverage gap below.
- **`LEVEL_ORDER` is not reachable by consumers** — only the `LogLevel`/`BoxLevel` *types* are
  re-exported, never the const, and `package.json`'s `exports` map lists only `"."` and `"./trace"`,
  so Node's ESM encapsulation blocks a deep import. `Object.freeze` would be defence-in-depth with no
  realistic threat behind it; the security reviewer called it unnecessary rather than warranted.

## Also verified this pass

- **The wording sweep is now genuinely complete.** Both code and acceptance re-swept
  `documentation/**` (excluding the historical `documentation/plans/`), `README.md`, `src/**` JSDoc and
  every `AGENTS.md`. The one surviving instance is the `src/types.ts:28` finding above; everything else
  consistently reserves "level" for what a log carries and "logs up to"/"threshold" for the module
  role. Purged vocabulary ("channel", "callable namespace", "louder"/"quieter", "the quiet end of the
  scale", "firehose") is absent from every shipped surface. Note "channel" appears legitimately
  throughout `src/core/color/` and `test/color.test.ts` meaning an **RGB colour channel** — a
  different, correct usage, not the purged term.
- **The new appendix paragraph is factually correct** against `resolveThreshold`'s `'info'` fallback
  (verified post-hardening), sits inside the migration appendix below the required "safe to skip"
  line rather than in a numbered teaching section, and respects the wording rule.
- **The plan's `0 → 'error'` claim is not undermined.** It is scoped to the package's own deliberate,
  typed migration of `DEFAULT_MODULES`' literal `0`s, and remains accurate read that way. The new
  appendix paragraph supplies the complementary, narrower claim about an *un-migrated* consumer value.
  The two do not contradict.
- **Every deferral is intact, not silently dropped** — `src/Loxer.ts` (the `of()` allocation),
  `documentation/Performance.md`, `rules/testing.md` (both findings) and all test files have zero
  changes.
- **The standing invariants hold** — production defaults to silence; errors bypass the level gate but
  only onto the error streams; hidden logs stay out of history; queue replay is gated against the
  post-init table (`init()` reassigns `_modules` before `dequeue()`).

## Rule coverage gaps

Carried forward unchanged (no spec — still the loudest, for a breaking major cut · no `SECURITY.md` ·
no policy for validating module config from outside the type checker · no benchmark-freshness rule ·
no suite-index manifest · `src/core/AGENTS.md` and `src/decorators/AGENTS.md` omit
`resolveThreshold`/`resolveBoxLevel`), plus the one added in pass 2:

- **No rule requires an own-property check (`Object.hasOwn`) rather than `in` for membership tests
  against an internal lookup table** — the second fail-open in the same two-line function, with the
  lesson already sitting uncodified in `src/core/color/parseColor.ts`.

## Carried-forward, deliberately not fixed here

- **The regression test for a defined-but-invalid threshold is still absent.** Both reviewers restate
  it so it is not lost: nothing in CI would catch `Object.hasOwn` being swapped back for `in` — which
  is literally what happened between passes 1 and 2. The fix phase is barred from writing tests; this
  belongs to the Testing phase and is the single most valuable follow-up in this change.
- **The `of()` per-call closure allocation** and **`documentation/Performance.md`'s stale figures**
  remain deferred (measurement needed; Documentation-phase work).
- **`rules/testing.md`'s two staleness findings** and the two `AGENTS.md` drift items remain reported,
  not closed — project docs are the Documentation phase's to edit.

## Notes

- A stray untracked file (`README_HEAD.md`, written with its scratchpad path mangled into a single
  filename) had leaked into the repo root from a reviewer's scratch dump. Inspected first — an
  untracked regular file, not a symlink, containing only a copy of `HEAD:README.md` — then removed
  with a plain non-recursive delete. `git status` is clean of it.
- Pass 1's and pass 2's per-pass review files were reconstructed and written as `review.md` and
  `review-2.md` after pass 3's acceptance lens flagged that `review-2.md` was missing from the
  append-only trail. The content is each pass's actual consolidated findings, not a retrofit.
- A pre-existing type diagnostic at `src/types.ts:180` ("'never' is overridden by other types in this
  union") is unrelated to this change and untouched.
- Pre-existing and out of scope, surfaced below the confidence bar by security: `Modules`'
  `this._modules[moduleId]` bracket-indexing means a module id of `'__proto__'`/`'constructor'` would
  resolve to an `Object.prototype` value, pass the `is(mod)` check, then throw on `mod.fullName`.
  Identical at `HEAD`; module ids are developer-authored literals in this project's trust model, so it
  was not scored. Worth a look if module ids ever become externally sourced.
