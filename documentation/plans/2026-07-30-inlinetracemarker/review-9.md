# Review: the regression tests and the accepted-design disclosure (pass 9)

**Verdict:** WARN
**Scope:** the delta added after pass 8 — `test/class-parent-name-cases.ts` (new, untracked at review
time), the cross-pin and close-only tests in `test/plain-function-trace-enclosing.test.ts`, the
table-driven decorator test in `test/decorators.test.ts`, the self-hosted fixture and its test in
`test/vite-plugin-loxer-trace.test.ts`, and the security framing added to
`packages/vite-plugin-loxer-trace/src/index.ts`'s `dedupe` JSDoc and its `README.md`.
**Lenses run:** test ✓ · code ✓ · security ✓ (dependency audit skipped: no manifest or lockfile
change) · acceptance ✓ · perf skipped: test-and-documentation delta, no runtime or build path
touched · a11y skipped: no UI.

The `fs.allow` HIGH from pass 7 was **accepted as designed** by the maintainer, who chose the
disclosure remedy over a code change; `isInstalledPackagePath` was left alone with it. This pass
reviewed whether the disclosure is accurate and complete, not the settled decision.

## Findings (by severity)

- **[HIGH]** `test/vite-plugin-loxer-trace.test.ts` `afterAll` — the fixture teardown removed both
  directory links with `rmdirSync`. `symlinkSync`'s `'junction'` type argument is honoured on Windows
  and **ignored everywhere else**, so the same fixture line leaves a junction on `windows-latest` and
  an ordinary symlink on `ubuntu-latest` and `macOS-latest`. POSIX `rmdir` rejects a symlink with
  `ENOTDIR`, which throws in `afterAll` and fails the suite — and
  `.github/workflows/main.yml` runs `pnpm test` on all three of those platforms. The pre-existing
  `junction` teardown had the same defect, so this was a latent two-of-three-platform failure that
  the new `selfHostedJunction` doubled rather than introduced.
  - **Fix applied:** both links now go through a `removeLink` helper calling `unlinkSync`, which
    removes a link on every platform and leaves its target directory in place. Confirmed by probe on
    Windows that `unlinkSync` removes a junction and keeps the target, so no platform branch is
    needed — the branch the finding originally suggested would have been unnecessary complexity.
  - **Cites:** baseline (`CODE_REVIEW.md` — platform assumptions) · project rule
    (`packages/vite-plugin-loxer-trace/AGENTS.md`: a link fixture must remove the link before the
    tree it sits in — the removal call has to work on every platform that rule's CI runs on) · caught
    by code; the test lens reached the same suspicion but held it below its confidence bar.

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/AGENTS.md` — the steering doc said a contributed
  entry means "a boundary it drew deliberately is **not** widened", which the disclosure added in this
  same delta contradicts outright: it *is* widened, by exactly one directory. The code and the
  existing test both agree with the new prose, so AGENTS.md was the wrong one — and it would have
  given a contributor the opposite mental model of the decision the maintainer had just accepted.
  - **Fix applied:** the bullet now states that the widening is that one directory rather than the
    two-entry default, that a project with its own list does still get Loxer's directory added, and
    that this bullet, the JSDoc and the README are to keep saying the same thing.
  - **Cites:** baseline (`CODE_REVIEW.md` — comments that contradict the code) · caught by code.

- **[MEDIUM]** `test/decorators.test.ts` — the table-driven test walked `classParentNameCases` in a
  manual `for` loop inside a single `test()`, so a failure on an earlier row aborts the loop and
  silently skips every later row — including the `Class` row, the one input the guard the table exists
  for was written to protect. The file's own idiom for a table is `test.each`.
  - **Fix applied:** converted to `test.each(classParentNameCases)` with a `$className`/`$parent`
    title, so every row runs and reports independently (2 tests became 10, and the suite went
    298 → 306).
  - **Cites:** project convention (`test/decorators.test.ts`'s existing `test.each(traceCases)`, and
    `test/vite-plugin-loxer-trace.test.ts`'s `test.each` table) · caught by test.

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/src/index.ts` JSDoc and `README.md` — the disclosure
  was accurate but omitted two facts a reader auditing the boundary would want: the entry is added
  **silently** (nothing is logged), and it appears in **neither** the project's own `vite.config` nor
  anywhere else readable without resolving the config. Those are the two places someone would look.
  - **Fix applied:** both now say the entry is added silently and name `vite --debug` or a
    `resolveConfig()` call as where the resolved `server.fs.allow` can actually be read.
  - **Cites:** baseline (`SECURITY_REVIEW.md` — disclosure completeness) · caught by security.

- **[MEDIUM]** `documentation/plans/2026-07-30-inlinetracemarker/worklog.md` — the row recording the
  accepted design listed only two declined items (the stale spec, the CI gate) and omitted the pass-7
  LOW wording nit, which is genuinely still open. Read on its own the row gave no way to tell that
  LOW was deliberately left standing rather than forgotten.
  - **Fix applied:** the wording nit is now named in that row's declined list.
  - **Cites:** `review-7.md`'s LOW · `review-8.md`'s "Still open from pass 7" list · caught by
    acceptance.

- **[LOW]** the worklog's built-artifact claim is not independently verifiable, because the probe was
  by design an uncommitted scratch run — but it is phrased as a manual probe rather than as automated
  coverage, and `dist/` on disk carries the guard and the gate it reports. No overstatement found; no
  action taken.
  - **Cites:** `rules/testing.md` built-artifact done-gate · caught by acceptance.

## Confirmed closed by this delta

All four findings the delta set out to close are genuinely closed, each verified by reverting its fix
one at a time rather than by inspection alone:

- **Pass-8 HIGH, no test for a class named exactly `Class`** — the table's `Class` row is consumed by
  the runtime helper, the decorator, and the transform. The five rows (no suffix, shortening applies,
  trailing occurrence only, false suffix, exact override) are the complete set of equivalence classes
  the rule branches on; the test lens found no realistic mutation passing all five while still wrong.
- **Pass-8 HIGH, the close-only side of `needsParentName`** — closed at the site it was raised
  against. A one-sided gate renders `closeOnly done` where the test demands
  `orderService.closeOnly done`.
- **Pass-8 HIGH, the two `classParentName` copies not cross-pinned** — closed. One table drives all
  three consumers, and because the plugin's copy is not exported it is exercised through a real Babel
  transform and the real emitted code's messages, not a mock. Breaking only the plugin copy now fails
  only the cross-pin, which is precisely the drift case that used to pass.
- **Pass-7 MEDIUM, no `missingFrom` self-dedupe fixture** — closed, with
  `searchForWorkspaceRoot(app) === package` asserted as a premise so the fixture cannot rot into a
  vacuous pass. `realpathSync` canonicalises the whole ancestor chain, which covers the macOS
  `/var` → `/private/var` case.

## Workspace safety

Both lenses that examined it cleared the self-hosted fixture, and it is worth recording why. The
junction genuinely points at an ancestor of itself — the exact hazard shape `AGENTS.md` warns about —
but it lives entirely under `mkdtempSync(tmpdir())` and nothing points into this repository. Teardown
is fail-safe in the direction that matters: the link removals are unguarded statements before the
recursive delete, so a throw in either aborts `afterAll` *before* `rmSync` can run. The worst failure
mode is a leaked temp directory, never a link-following recursive delete. The `rmdirSync` defect above
was a portability bug in the removal call, not a breach of that ordering.

## Rule coverage gaps

New in this pass:

- No rule requires a fixture that creates an OS-specific link (Windows junction versus POSIX symlink)
  to be torn down with a call that works on every platform in the CI matrix. `AGENTS.md` and
  `rules/testing.md` cover the destructive link-following hazard thoroughly but say nothing about the
  cleanup call's own portability — which is what let this defect sit latent. — surfaced by code.
- No rule requires a package's `AGENTS.md` to be checked against its README and JSDoc when one of
  them is updated to record a decision; `rules/documentation.md` governs the guide's register, not
  cross-file consistency inside a package. — surfaced by code.
- No rule states whether a table-driven test should use `test.each` or a manual loop, or requires
  per-row failure isolation for a table standing in as a safety net between two implementations. —
  surfaced by test.

Carried forward unchanged: the read/serve symlink threat model, ownership of a widened dev-server
setting, spec amendment on supersession, gating per-log work behind its option, cold-versus-hot Vite
hooks, the unenforced built-artifact rule, and the two untested parent-resolution edges (computed
member key, marked constructor).

## Still open

Declined by the maintainer, with the findings standing: the stale spec
(`documentation/specs/babel-plain-function-tracing.md:34-36,47`), putting the built-artifact probe
into CI, and the LOW wording nit in `documentation/index.md`. The `fs.allow` design and
`isInstalledPackagePath` are settled, not open.
