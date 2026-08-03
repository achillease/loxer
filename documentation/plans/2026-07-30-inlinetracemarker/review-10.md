# Review: the pass-9 fixes (pass 10)

**Verdict:** PASS
**Scope:** the five fixes applied after pass 9 — the cross-platform link teardown and the
`test.each` conversion in `test/vite-plugin-loxer-trace.test.ts` and `test/decorators.test.ts`, the
corrected bullet in `packages/vite-plugin-loxer-trace/AGENTS.md`, the added disclosure in that
package's `dedupe` JSDoc and `README.md`, and one worklog line.
**Lenses run:** code ✓ · test ✓ · security, perf, acceptance, a11y skipped: a three-line test helper,
a table conversion, and prose — no runtime, build, dependency, or UI surface, and the disclosure
itself was verified against the code by pass 9's security lens.

Both lenses died once on a transient upstream 529 and were re-dispatched; the results below are from
the completed runs.

## Findings (by severity)

No CRITICAL and no HIGH. The pass-9 HIGH fix was confirmed correct by both lenses.

- **[MEDIUM]** `test/decorators.test.ts` — the comment above the converted `test.each` block read as a
  fragment continuing the comment above it ("…while each still reads only its own copy." followed by
  "a row each, so a failure…"), an editing artifact rather than a deliberate two-part note.
  - **Fix applied:** rewritten as a complete sentence.
  - **Cites:** baseline (`CODE_REVIEW.md` — comments that confuse rather than clarify) · caught by code.

- **[MEDIUM]** `test/plain-function-trace-enclosing.test.ts` — the pass-9 fix converted the decorator
  table to `test.each` but left the *same* loop-inside-one-test pattern in the cross-pin test, in the
  same round. That mattered more here than where it was fixed: this is the only place the Babel
  plugin's copy of the rule is checked per class name, so an early row throwing would skip the `Class`
  row **and** the direct runtime-helper assertion, which is exactly the drift the shared table exists
  to catch.
  - **Fix applied:** converted to `test.each(classParentNameCases)`, each row transforming its own
    single-class module and asserting both copies against that row's expectation (1 test became 5;
    the suite went 306 → 310). Re-verified by reverting the plugin's copy: the failure now names the
    row — `both copies of the trailing-Class rule render 'Class' for class 'Class'` — where the
    aggregate form reported an array diff.
  - **Cites:** the fix precedent set for the same table in `test/decorators.test.ts` this round ·
    `review-9.md`'s MEDIUM on per-row isolation · caught by test.

## Confirmed by this pass

- **The HIGH is correctly fixed, on all three CI platforms.** POSIX `unlink(2)` removes a symlink
  without following it regardless of target type, where `rmdir(2)` requires the entry itself to be a
  directory and returns `ENOTDIR` on a symlink; Node's Windows `fs.unlink` removes a junction without
  touching its target, which a probe confirmed directly. So the no-branch `unlinkSync` is right on
  `windows-latest`, `ubuntu-latest` and `macOS-latest`, and the platform branch the finding originally
  suggested would have been unnecessary. No other link-removal site was left on the old call.
- **Teardown ordering is still fail-safe.** Both link removals are unguarded statements ahead of
  `rmSync(fixtureBase, { recursive: true })`, so either throwing aborts `afterAll` before the
  recursive delete can run. The worst case is a leaked temp directory, never a link-following delete.
  Nothing points into this repository.
- **The three documents now agree with each other and with the code.** `AGENTS.md`, the README section
  and the `dedupe` JSDoc all state that a project with its own `fs.allow` still gets Loxer's directory
  added. The "silently added", "not visible without resolving the config" and "only `vite dev` reads
  it" claims were each checked against the installed Vite source: `fs.allow` gates the dev server's
  static middleware only, `vite preview` uses a `distDir`-only check, and `vite build` runs no server.
  No banned diff-narrating wording appears in the new prose.
- **The `test.each` conversion is sound.** `$className`/`$parent` interpolation is valid for object
  rows, the block resolves `mode` correctly inside the enclosing `describe.each`, `resetAndInitialize()`
  per row matches the file's idiom now that rows are separate tests, all ten titles are distinct
  (including the two rows sharing a `parent`), and no row depended on another's state.
- **The worklog's declined list matches this folder's "Still open" sections** and overstates nothing.

## A note on the near-miss

Pass 9's test lens reached the `ENOTDIR` conclusion independently but held it below its confidence
bar, giving two reasons: that the defect was pre-existing, and that it could not be verified from
Windows. On review it judged the first reason wrong and the second right — the pass-9 diff was
actively extending the broken teardown to a second link, which is in-diff regardless of severity, so
"pre-existing" would have been the wrong ground to withhold on. The confidence gap was the real one,
and settled POSIX semantics plus a Windows probe closed it. Worth keeping: a pre-existing pattern that
a diff *extends* is in scope.

## Rule coverage gaps

None new. `review-9.md`'s three gaps stand — and the second MEDIUM above is that pass's `test.each`
gap reproducing itself in a second file within one round, which is an argument for writing the
convention down rather than re-finding it.

## Still open

Unchanged, all declined by the maintainer with the findings standing: the stale spec
(`documentation/specs/babel-plain-function-tracing.md:34-36,47`), the built-artifact probe not being
in CI, and the LOW wording nit in `documentation/index.md`. The `fs.allow` design and
`isInstalledPackagePath` are settled.
