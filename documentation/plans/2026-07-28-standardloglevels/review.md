# Review: standard log levels (`error` / `warn` / `info` / `debug`) — pass 1

**Verdict:** WARN
**Scope:** working-tree diff vs `HEAD`. Source: `src/core/Levels.ts` (new), `src/Loxer.ts`,
`src/core/Modules.ts`, `src/types.ts`, `src/index.ts`, `src/loxes/Lox.ts`, `src/loxes/OutputLox.ts`,
`src/trace.ts`, `src/tracing-types.ts`, `src/decorators/trace.ts`,
`packages/babel-plugin-loxer-trace/src/trace-binding.ts`. Tests: 5 new + 9 ported suites.
Docs/consumers: `documentation/index.md`, `documentation/Performance.md`, `documentation/debt.md`,
`README.md`, the `AGENTS.md` files, `rules/documentation.md`, `playground/*.js`,
`examples/vite-trace-demo/src/main.ts`. Config/CI: `package.json`, `eslint.config.mjs`,
`typedoc.json`, `.github/workflows/main.yml`.
**Lenses run:** code ✓ · security ✓ (dep-audit skipped — no dependency or lockfile change;
`package.json` gained only a `typecheck:types` script) · perf ✓ · test ✓ · acceptance ✓ ·
a11y **skipped** — no user-facing UI in the diff; the only front-end file touched
(`examples/vite-trace-demo/src/main.ts`) changes log calls, not markup.

## Findings (by severity)

- **[HIGH]** `README.md:1,3,143,150` — Every Markdown image reference in the file has been stripped
  to bare alt text: the logo (`![Loxer_Logo](…/assets/Logo.png)` → `Loxer_Logo`), all five
  shields.io badges (now plain words glued into the `# Loxer` heading), and both screenshots
  (`![plain_console](…/plainOutput.png)` / `goodOutput.png` → the bare word `plain_console`). The
  two commented-out fallbacks (`<!-- ![Coverage Badge](…) -->`, `<!-- ![plain_console](/assets/…) -->`)
  and the `<!-- https://shields.io/ -->` note were deleted, stray blank lines were left behind, and
  the file lost its trailing newline. Verified directly: `git show HEAD:README.md` contains 7 `![`
  references, the working tree contains 0. Nothing in `plan.md` (which scopes `README.md` to the
  level-example lines only) or `worklog.md` asks for this, so it is unintended corruption, not a
  design decision. Blast radius is everything that renders this file: the GitHub landing page, the
  npm package page, and — because `typedoc.json` sets no `readme` option — `docs/index.html`, the
  generated API reference's front page, on the next `pnpm docs` run. The currently committed
  `docs/index.html` still holds the correct `<img>` tags, which dates the corruption *after* this
  change's last docs regeneration.
  - **Fix:** Restore the four image/badge lines and the three comment lines from
    `git show HEAD:README.md`, keeping this change's intended edits (the named-level quick-start
    block, `devLevel: 'info'` / `prodLevel: 'error'`, and the corrected `## Deps` section — Loxer
    has zero runtime dependencies, so the old `just [color](…)` line was rightly replaced). Remove
    the stray blank lines, restore the trailing newline, then re-run `pnpm docs`.
  - **Cites:** project rule `rules/documentation.md` ("use stable GitHub raw URLs for images in
    Markdown meant to render outside the repo (README, npm page)" and "`docs/index.html` is
    intentionally the rendered `README.md`") · baseline `CODE_REVIEW.md` §Maintainability ·
    caught by **code-reviewer** and **acceptance-reviewer** independently

- **[HIGH]** `src/core/Modules.ts:74` — The threshold gate fails **open** on a module level that is
  defined but not one of the four `LogLevel` strings. `?? 'info'` guards only `null`/`undefined`, so
  a value like `prodLevel: 0` (a stale numeric level from an untyped-JS config written against
  Loxer 2) or a typo like `'off'` passes straight into `isHidden`, where `LEVEL_ORDER[threshold]` is
  `undefined` and every relational comparison against `undefined` is `false`. `isHidden` therefore
  returns `false` for **every** level, so the module emits everything — including `'debug'`, the
  level most likely to carry PII, tokens, or request bodies — in production. Confirmed by executing
  the formula: `isHidden('debug', 0)` and `isHidden('debug', 'off')` are both `false`, while the
  correct `isHidden('debug', 'error')` is `true`. This is a regression introduced by this diff: the
  same `prodLevel: 0` meant *errors only* under the numeric scheme, so a JS consumer who upgrades
  without editing their config silently goes from near-silence to full verbosity. TypeScript
  consumers are protected by the union — but the `?? 'info'` fallback on this very line exists
  precisely to accommodate untyped-JS consumers, and `test/modules.test.ts:75-88` covers only the
  *missing*-property case, never a defined-but-invalid one.
  - **Fix:** Validate the resolved threshold against `LEVEL_ORDER` before using it, in a single
    helper in `src/core/Levels.ts` (per `src/core/AGENTS.md`, that file is the one home of the
    ordering) — e.g. `resolveThreshold(raw)` returning `raw !== undefined && raw in LEVEL_ORDER ? raw : 'info'`.
    Route both `getModule()` (line 74) and `getLevel()` (line 57) through it, which also closes the
    LOW finding below. Add a `test/modules.test.ts` case with a stale numeric threshold asserting
    the module still mutes rather than opening wide.
  - **Cites:** baseline `SECURITY_REVIEW.md` (sensitive-data exposure · missing input validation) ·
    project rules `AGENTS.md` ("Production output defaults to silence") and `src/core/AGENTS.md`
    ("`Levels.ts` is the single home of the `LogLevel` ordering") · caught by **security-reviewer**

- **[MEDIUM]** `documentation/index.md:387-388`, `README.md:13` — The level-vs-threshold wording
  rule agreed with the user and codified into `rules/documentation.md` in this same change ("a log
  **has a level**; a module **logs up to** a level (its threshold). Never use the same word in prose
  for both roles") is violated in two places the vocabulary purge missed. The guide's §5 says "A log
  is written when its level is **the module's level** or a more severe one" — directly under a
  heading that gets it right ("The level a module logs up to") — and README's feature list says
  "categorize logs in modules (**with their own levels**)".
  - **Fix:** Reword to "…when its level is at or before what the module logs up to" and "categorize
    logs in modules (each logging up to its own threshold)". Reserve "level" for what a log carries.
  - **Cites:** project rule `rules/documentation.md` (level/threshold wording rule) ·
    `worklog.md` 23:18 (user-agreed decision) · caught by **acceptance-reviewer**

- **[MEDIUM]** `src/trace.ts:92`, `src/decorators/trace.ts:88` — Both sites index the chain object
  with `Loxer.h(…).m(id)[level].open(…)`. `level` is `BoxLevel` at compile time, but an untyped-JS
  caller of `trace()` / `@trace()` can pass anything; an unrecognized value makes `[level]` resolve
  to `undefined` and `.open(…)` throws a `TypeError` at the traced function's entry. The old
  `.l(level)` accepted any number without throwing, so this is a new crash path introduced by the
  bracket-indexing pattern. Developer-authored config rather than attacker input, hence MEDIUM.
  - **Fix:** Normalize an unrecognized `level` to `'info'` (or guard with an `in` check) before
    indexing, in both files.
  - **Cites:** baseline `SECURITY_REVIEW.md` (missing input validation — availability, not
    confidentiality) · caught by **security-reviewer**

- **[MEDIUM]** `src/Loxer.ts:317-333` — `of()`'s success branch allocates an `append` factory
  closure plus four member closures (`add`, `warn`, `info`, `debug`) on **every** call, whether or
  not the caller uses them — roughly 8 closures where the previous shape allocated 4.
  `documentation/index.md:363-365` documents exactly the per-call loop this scales with
  (`Loxer.of(box).debug('line 1 of 40')` inside a loop), so it is per-call GC churn on a documented
  pattern rather than a one-off.
  - **Fix:** Drop the intermediate `append` factory and inline the four arrows against
    `appendToOpenLox`, or expose the four as lazy getters so only the invoked member is
    materialized. Size it with `test/performance.ts` before optimizing further — this is a static
    cost story, not a measured one.
  - **Cites:** baseline `PERFORMANCE_REVIEW.md` §Algorithmic & memory (avoidable per-call
    allocation) · caught by **perf-reviewer**

- **[MEDIUM]** `documentation/Performance.md` (Tests 1-4, ~lines 53-97) — The recorded logs/sec
  figures were measured against the pre-change path (integer level compare, 4 closures per `of()`
  call). `test/performance.ts`'s hot loop now goes through the wider `OfLoxes` object above and a
  `Record` lookup, and the numbers were not regenerated, so they are unverified for the current
  code while presented as the current baseline.
  - **Fix:** Re-run the four scenarios and update the tables if the numbers move outside noise, or
    note that the figures predate this rewrite. Documentation-phase work — do not fix here.
  - **Cites:** project doc `documentation/Performance.md` (the project's own performance claim) ·
    caught by **perf-reviewer**

- **[MEDIUM]** `rules/testing.md` §Reference — The "Existing suites, one topic each" index went
  stale: this change adds three topic-per-file suites (`test/levels.test.ts` — the gate;
  `test/modules.test.ts` — the `Modules` fallback branches; `test/production.test.ts` — the
  `dev: false` streams) and none is listed. `test/plain-function-trace.test.ts`,
  `test/trace-cases.ts` and `test/performance.ts` are also absent (pre-existing).
  - **Fix:** Add a line per new suite to the Reference list, folding in the three pre-existing
    omissions while there.
  - **Cites:** project rule `rules/testing.md` (its own coverage index) · caught by **test-reviewer**

- **[MEDIUM]** `rules/testing.md` (whole file) — This change introduces a new testing modality —
  `test/types/registry.test-d.ts`, `test/types/tsconfig.json`, the `typecheck:types` script, and a
  CI step that must run **after** `pnpm build` — and the testing rules document none of it: no
  mention of `.test-d.ts`, the `@ts-expect-error` convention, the build-then-typecheck ordering, or
  when a public-type change must add a negative case. Anyone touching `ModuleId`, `LogLevel`,
  `LevelMethods`, or `LoxerModuleRegistry` has no rule telling them the gate exists.
  - **Fix:** Add an `Always` bullet (or subsection) to `rules/testing.md` naming the type-level
    suite, the ordering requirement, and when a public-type change requires a new negative case.
  - **Cites:** project rule `rules/testing.md` (designated home for global Loxer testing rules per
    `AGENTS.md`'s steering table) · caught by **test-reviewer**

- **[LOW]** `src/core/Modules.ts:57-58` — `getLevel()` returns the raw `devLevel`/`prodLevel`
  verbatim, without even the `?? 'info'` guard `getModule()` applies. `Loxer.getModuleLevel(id)` is
  public API typed `LogLevel | undefined`, so a malformed config lets it return a value outside its
  declared union. Same root cause as the HIGH above.
  - **Fix:** Route through the shared `resolveThreshold()` helper proposed there — one fix closes
    both.
  - **Cites:** project rule `src/core/AGENTS.md` ("never re-derive the comparison anywhere else") ·
    caught by **security-reviewer**

- **[LOW]** `packages/babel-plugin-loxer-trace/src/trace-binding.ts:319-324` — The new
  `if (t.isMemberExpression(expression)) return false;` branch in `isDirectLoxerChain` is
  dead in effect: `isMemberExpression` and `isCallExpression` are mutually exclusive, so the
  pre-existing `!t.isCallExpression(expression) || …` check below already returns `false` for the
  same input. The risk case it names (`Loxer.debug.open(…)`) never reaches this function at all —
  it is excluded earlier by the `LINKED_METHODS.get('open')` check, since `'open'` is not in
  `LINKED_METHODS`. Behaviour is correct with or without the branch; the comment overstates what it
  does. (Reported at LOW rather than MEDIUM per the rubric's "prefer the lower severity absent a
  concrete failure path" rule — there is none.)
  - **Fix:** Either remove the branch, or reword the comment to say it is defensive
    self-documentation rather than implying it changes behaviour.
  - **Cites:** baseline `CODE_REVIEW.md` §Maintainability (dead code / unreachable branches) ·
    caught by **code-reviewer**

## Verified sound (no finding)

Recorded so a later pass need not re-derive it:

- **The gate itself.** `LEVEL_ORDER` / `isHidden` use a strict `>` with `error` at ordinal 0 — no
  off-by-one against the old `dl === 0 || lox.level > dl` formula, so the plan's claim that
  `0 → 'error'` is behaviour-preserving holds for every well-typed threshold.
- **`appendToOpenLox`'s `requestedLevel`.** `add` inherits via `undefined`; `close` is forced to
  `openLevel` regardless of `type`; `warn`/`info`/`debug` clamp through `moreVerbose`, which can only
  move a request further down the list, never up.
- **Errors bypass gating, bounded correctly.** `internalError` / `toErrorLox` never touch `hidden`,
  so `ErrorLox.hidden` stays `false`; `warn()` correctly stays on the normal log stream.
- **Queue replay.** `init()` reassigns `this._modules` *before* `dequeue()`, so replayed logs are
  gated against the post-init table, not the enqueue-time one.
- **One-shot state.** `highlight`/`module` reset only in `switchOutput` → `resetState`; the
  `warn`/`info`/`debug` members are built once per singleton as closures reading `this` live, so
  reading `Loxer.debug` does no work, logs nothing, and resets nothing — a hoisted
  `const d = Loxer.debug` still behaves.
- **The `Modules` clone fix** is correct and closes the `defaultLevels` cross-instance leak; the
  clone is a shallow spread of three small objects, once per instance (cold path).
- **Ported-suite fidelity.** All 9 ported suites were compared line-by-line against `HEAD`: no
  relaxed assertion, deleted case, or softened `toBe`. Several ports *added* assertions. The
  numeric→name choice differs per file (old `devLevel: 2` → `'debug'` in `boxed.test.ts` but
  `'info'` in `plain-function-trace.test.ts`); each was traced and preserves that file's
  hidden/visible relations.
- **`test/types/registry.test-d.ts`.** Every `@ts-expect-error` traces to its intended cause, none
  passes on a cascading error, and CI runs `typecheck:types` after `build` as required.
- **The Babel plugin** builds AST via `@babel/types` only — no string-built code, no `eval` /
  `new Function`; the shadowed-`Loxer`-binding guard is untouched.
- **CI diff** adds two unprivileged `pnpm typecheck:*` steps — no secrets, permissions, or untrusted
  input.
- **The two folded-in bug fixes** both landed: the `DEFAULT_MODULES` mutation (covered by
  `test/initialization.test.ts:72`) and the deletion of the dead `@deprecated isLogHidden` (zero
  remaining references).
- **The vocabulary purge and migration appendix.** "channel", "callable namespace",
  "louder"/"quieter", "the quiet end of the scale", "firehose" are absent from all shipped surfaces;
  they survive only in this plan folder, which is a historical artifact and correctly out of scope.
  Migration content is confined to `documentation/index.md`'s appendix with the required skip-line,
  and no teaching section references Loxer 2. `LevelChannel` → `LevelMethods` is complete.
- **The `pnpm docs` gate.** `docs/` contains the exact pages the new link references point at
  (`interfaces/Loxer.LevelMethods.html`, `types/index.LogLevel.html`, `types/index.BoxLevel.html`).

## Rule coverage gaps

Reported for the Documentation phase — not graded, not closed here.

- **No spec for this change.** `documentation/specs/` holds only the unrelated
  `babel-plain-function-tracing.md`. A breaking major-version cut of the public API shipped with no
  artifact reviewable independently of the plan that also implemented it. `plan.md:4` is upfront
  about it, and its Verification section is rigorous enough to have served as the acceptance
  contract — but it is still the loudest gap. — surfaced by **acceptance-reviewer**
- **No `SECURITY.md`.** The project's security-relevant invariants (production defaults to silence,
  the error bypass is level-only, hidden logs stay out of history) live only informally in root
  `AGENTS.md` §Behavior. The HIGH fail-open finding shows the invariant can be broken by *config*,
  not just by code. — surfaced by **security-reviewer**
- **No documented policy for validating module config that arrives from outside the type checker**
  (JSON/YAML/env-sourced `modules` objects). The HIGH finding is exactly this gap materializing. —
  surfaced by **security-reviewer**
- **No rule requires re-running `test/performance.ts` or refreshing `documentation/Performance.md`**
  when a change touches the per-log hot path. `rules/documentation.md` covers API-example freshness
  and `rules/testing.md` covers behavioural-test freshness; neither names benchmark-claim freshness,
  despite the project maintaining a dedicated performance doc. — surfaced by **perf-reviewer**
- **No `FEATURES.md` or use-case↔test link manifest.** Coverage freshness had to be checked against
  `rules/testing.md`'s own suite index, which is where two MEDIUM findings above came from. —
  surfaced by **test-reviewer**

## Notes

- **Pre-existing defect, surfaced for awareness, not scored** (rubric §4 reports pre-existing issues
  only at CRITICAL): `Loxer.error()` / `Loxer.namedError()` (`src/Loxer.ts:181-200`) never check
  `this._isDisabled`, so `config.disabled: true` — documented in `AGENTS.md` as a kill switch — does
  not suppress error output. Identical at `HEAD`, untouched by this diff.
  `test/initialization.test.ts`'s disabled case only exercises `Loxer.of(id).error(…)` (which *is*
  gated, because `of()` returns no-op handles while disabled) and never a top-level
  `Loxer.error(…)`. Worth its own look, and a candidate for `documentation/debt.md`.
- **Pre-existing defect `D-1`** (pre-init `.m(id)` mislabelling queued logs as `INVALID`) is
  correctly identified as pre-existing, honestly surfaced in `test-bugs.md`, and promoted to
  `documentation/debt.md`. Not re-flagged. It does mean the plan's "queue replay gates against the
  initialized table" bullet is demonstrated for `DEFAULT`/`NONE` but not for a user module id.
- **Pre-existing, out of scope:** the full `Lox`/box layout is still built before the `hidden` check
  (the `// TODO compare levels first?` at `src/Loxer.ts:405`), so a suppressed log costs more than
  it needs to. Unchanged by this diff.
- **`test/plain-function-trace.test.ts`'s harness** (`Object.assign(bound, value)` after `.bind()`)
  was checked for soundness: `.open` is an arrow closing over `this` lexically, so copying the
  reference is behaviour-preserving, and the proxy wraps the real singleton rather than a stand-in.
  Not a divergence from the product.
- **`playground/*.js` and the Vite demo** were checked against the real public API. A few chose a
  different named level than the appendix's literal mapping would give (e.g. `.l(2)` → `.info()` on
  a box already opened at `'info'`), but each was traced and the runtime effect is unchanged — the
  box's own level dominates via the `moreVerbose` clamp. Not a finding.
- **`documentation/plans/2026-07-26-typedmoduleids/`** also appears staged in this working tree; it
  belongs to the prior `typedmoduleids` change whose commit was lost in the 23:05 incident. Out of
  scope for this review, noted because it shares the diff surface.
- The four verification gates were re-run by the orchestrator before this pass and are green:
  `pnpm test` (16 files / 202 tests), `pnpm lint`, `pnpm build`, `pnpm typecheck:test`,
  `pnpm typecheck:types`.
