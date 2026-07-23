# Review: loxer 3.0.0 modernization (drop `color` dep, ESM-only, ES2022, toolchain)

> **Resolution (2026-07-23 01:07):** all 8 findings below + the lower-confidence security nit were
> fixed in a follow-up implementation pass (worklog `[Implementation]` 01:07). Both HIGHs, all six
> MEDIUMs, and the `Object.hasOwn` named-color guard are addressed; gate re-run green (build 0,
> lint 0, test 98/98). The verdict below reflects the **original** review state (WARN); on those
> fixes a re-review would be **PASS**. The six *rule-coverage gaps* remain open for the
> Documentation phase (they are reported, not graded, and were intentionally not closed here).

**Verdict:** WARN (original) → findings resolved; re-review would PASS
**Scope:** Staged diff (`git diff --staged`). Product source: new vendored parser `src/core/color/{parseColor,colorNames,index}.ts`, `src/core/ANSIFormat.ts` (import swap), `src/Helpers.ts`, `src/core/Item.ts`, `src/decorators/trace.ts`, `.js` import-extension rewrite across all `src/**/*.ts`. Config/CI: `package.json`, `tsconfig.json`, `eslint.config.mjs` (new), `.prettierrc.json`, `typedoc.json`, `.husky/pre-commit`, `.github/workflows/{main,publish}.yml`. Tests: `test/color.test.ts` (new), `test/error.test.ts` (+2). Generated `docs/**` HTML and `pnpm-lock.yaml` excluded (lockfile audited by the security lens only).
**Lenses run:** code ✓ · security ✓ (audit ran, clean) · perf ✓ · a11y ⊘ skipped (no user-facing UI — terminal-only Node library) · acceptance ✓ (no spec — verified against plan DoD) · test ✓

Live gates independently re-run by reviewers: `pnpm build` exit 0 · `pnpm lint` exit 0 · `pnpm test` 88/88 · `pnpm audit --prod` clean · `pnpm audit` (full tree) clean.

## Findings (by severity)

- **[HIGH]** `docs/plans/2026-07-22-loxer3modernization/plan.md` & `worklog.md` — staged for addition under `docs/`, which `rules/documentation.md` (edited in this same changeset) now explicitly forbids: `pnpm docs` runs with `cleanOutputDir: true` and wipes the **entire** `docs/` tree every run. The canonical copy already lives correctly at `plans/2026-07-22-loxer3modernization/` (also staged), and the two have **diverged** — the `docs/` copy's `worklog.md` stops at the 00:25 entry and its `plan.md` carries a "Recovery note" documenting a prior `pnpm docs` data-loss of this exact folder. Committing the `docs/` copy re-introduces the precise hazard the rule update describes; the next `pnpm docs` deletes it silently.
  - **Fix:** `git rm --cached docs/plans/2026-07-22-loxer3modernization/plan.md docs/plans/2026-07-22-loxer3modernization/worklog.md` before committing (and remove any staged `docs/plans/.../review.md`); keep only the `plans/…` copy — mirroring how the older `2026-07-07-…` folder was correctly *moved* (not copied) out of `docs/` in this same diff.
  - **Cites:** `rules/documentation.md` (Never: no hand-written files under `docs/`, `cleanOutputDir:true`) · caught by **code-reviewer** + **acceptance-reviewer**.

- **[HIGH]** `test/color.test.ts` (hwb suite) / `src/core/color/parseColor.ts:227-260` — `hwbToRgb`'s 6-branch `switch (i)` hue-segment math has only `case 0` (red, `hwb(0,…)`) and `case 4` (blue, `hwb(240,…)`) exercised; the other four segments (`case 1/2/3/5`, each assigning r/g/b in a different order) and the `if (ratio > 1)` whiteness+blackness normalization branch (`:209`) are untested. This is freshly transcribed hue-wheel math — exactly where a swapped channel slips through unnoticed — and the majority of its paths are unverified.
  - **Fix:** add cases per segment: `hwb(60,0%,0%)` (i=1), `hwb(120,0%,0%)` (i=2), `hwb(180,0%,0%)` (i=3), `hwb(300,0%,0%)` (i=5), plus one `w+b>1` case (e.g. `hwb(0,60%,60%)`) for the normalization branch.
  - **Cites:** rubric test-smell checklist (missing edge/failure coverage); `src/core/AGENTS.md` (vendored-module edge behavior must be pinned) · caught by **test-reviewer**.

- **[MEDIUM]** `src/core/color/parseColor.ts:30-36, 112-113, 135-136` — `getRgb`/`getHsl`/`getHwb` construct their `RegExp` literals fresh on every call, though the patterns are static and at most one matches a given input. This sits on the default console-output path (≥1 parse per log line via `colorize`, again per highlight, and again per box segment / item-render), re-allocating the regex set repeatedly per formatted line.
  - **Fix:** hoist the regex literals to module-level `const`s (compiled once at import). Pure allocation removal, identical parse semantics. Not a regression vs the old `color` dep, but now first-party code and a natural fix point.
  - **Cites:** `PERFORMANCE_REVIEW.md` §Algorithmic & memory ("rebuilding a regex/parser each call") · caught by **perf-reviewer**.

- **[MEDIUM]** `src/core/ANSIFormat.ts:52-111` / `src/core/OutputStreams.ts:53,99` / `src/core/Item.ts:147-165` — `colorize`/`colorHighlight` re-run the full string→RGB parse (`Color()` → `parseColorToRgb`) on every invocation, even though color strings are static per-module config or a fixed `highlightColor` set once at `Loxer.init()`. Nothing memoizes the result, so the same literal (e.g. a module's `'#fff'`) is fully re-parsed on every log line, multiple times when an item/box renders.
  - **Fix:** memoize `parseColorToRgb`/`Color` with a small `Map<string, Rgba|null>` keyed on the input string (safe — color strings are immutable config), or resolve+cache the RGB tuple once per module/highlight-color at config time.
  - **Cites:** `PERFORMANCE_REVIEW.md` §Algorithmic & memory ("recomputing an invariant... work that could hoist out or be cached") · caught by **perf-reviewer**.

- **[MEDIUM]** `test/color.test.ts` (hsl suite) / `src/core/color/parseColor.ts:161-165` — `hslToRgb`'s `if (s === 0)` grayscale short-circuit is never exercised (all hsl tests use `s: 100%`/`50%`).
  - **Fix:** add `parseColorToRgb('hsl(0, 0%, 50%)')` → `[127.5, 127.5, 127.5]` (per-channel `toBeCloseTo`).
  - **Cites:** rubric test-smell checklist (missing edge coverage) · caught by **test-reviewer**.

- **[MEDIUM]** `test/color.test.ts` / `src/core/color/parseColor.ts:118, 141` — hue wraparound normalization is untested for both `hsl()` (`(h + 360) % 360`) and `hwb()` (`((h % 360) + 360) % 360`); no negative-hue or >360 hue case. This is the one place the two formulas differ (hwb handles negative modulo, hsl's single `+360` does not), so the divergence is unverified.
  - **Fix:** add `parseColorToRgb('hsl(-120, 100%, 50%)')` and `parseColorToRgb('hwb(-120, 0%, 0%)')`, asserting the same channels as their positive-hue equivalents.
  - **Cites:** rubric test-smell checklist (missing edge coverage) · caught by **test-reviewer**.

- **[MEDIUM]** `test/color.test.ts` / `src/core/color/parseColor.ts:119-121, 142-144` — the `clamp()` on saturation/lightness/whiteness/blackness in `getHsl`/`getHwb` is never exercised with out-of-range input; only the `rgb()` channel-clamp path is covered.
  - **Fix:** add one out-of-range percent case each, e.g. `hsl(0, 150%, 50%)` and `hwb(0, -10%, 110%)`, asserting the clamped result.
  - **Cites:** rubric test-smell checklist (missing edge coverage) · caught by **test-reviewer**.

- **[MEDIUM]** `plans/2026-07-22-loxer3modernization/plan.md:130-138` — the plan's `Verification` section (the DoD this change is graded against) is stale relative to the documented ESM-only revision: it still demands `pnpm build` produce "**both** `dist/cjs` and `dist/esm` with `.d.ts` + shims" and a "Dual-resolution smoke test" against a CJS+ESM tarball. `Context` and `Approach` step 3 were struck through and revised; `Verification` was not, leaving the plan internally inconsistent about "done."
  - **Fix:** revise the build-format verification bullet to "single `dist/` ESM tree with `.d.ts`" and replace the dual-resolution smoke test with the interop reality already recorded (`import` works; `require('loxer')` only via Node 22+ `require(esm)` interop, not on the Node 20 floor).
  - **Cites:** plan `Verification` checklist (internal consistency with its own Context/Approach revision) · caught by **acceptance-reviewer**.

**Lower-confidence observation (below reporting bar, not graded):** `src/core/color/parseColor.ts:81-93` — `getRgb`'s named-color lookup `COLOR_NAMES[match[1]]` is an unguarded plain-object bracket access, so a color string like `"constructor"`/`"toString"` resolves to an inherited `Object.prototype` member instead of `undefined`, yielding `[NaN,NaN,NaN]` channels rather than the expected `null`/throw. Not exploitable (no prototype-pollution write, "NaN" is inert text in the numeric ANSI slot) and these strings only come from trusted `Loxer.init()`/module config, not runtime log input. Consider a `Object.prototype.hasOwnProperty.call(COLOR_NAMES, match[1])` guard when this file is next touched. (security-reviewer)

## Rule coverage gaps
- **No `docs/specs/<slug>.md`** for this change — planned from a framed problem; the plan/worklog pair is the only acceptance record (and per the MEDIUM above, one checklist item in it is stale). Normal for an internally-framed refactor; named as a gap, not graded. (acceptance-reviewer)
- **No changelog/migration-note rule** for a major (breaking) bump. This release drops CJS (`"type":"module"`, root-only `exports`, `engines.node >=10`→`>=20`) with no `CHANGELOG.md` and no README/`documentation/` migration note. The 2.0.0→3.0.0 bump satisfies "intentional and versioned," so it's a gap to document, not a defect. (code-reviewer)
- **No least-privilege CI-permissions rule.** `publish.yml` now sets explicit `permissions` (good), but `main.yml` still relies on the default `GITHUB_TOKEN` scope with no `permissions:` block. Worth codifying. (security-reviewer)
- **No vendored-code provenance rule** beyond the good ad hoc note in `src/core/AGENTS.md`. Consider a standing rule: any future vendored port retains upstream license headers and cites the exact upstream version/commit (this diff already did). (security-reviewer)
- **No `FEATURES.md` / use-case↔test link file** (pre-existing, project-wide). Freshness for this change is evidenced only informally via the worklog's `[Testing]` entry. (test-reviewer)
- **No allocation/caching standard for the console-output render path**, despite it being a first-class asserted behavior in `rules/testing.md` + `src/core/AGENTS.md`. Relates to the two perf MEDIUMs above. (perf-reviewer)
