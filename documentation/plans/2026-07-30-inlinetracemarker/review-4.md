# Review: inline trace markers — review-3 boundary fixes (pass 4)

**Verdict:** PASS
**Scope:** `packages/babel-plugin-loxer-trace/src/plugin.ts` — the `isNameBoundary` additions and
call-through rationale from `review-3.md`; `test/plain-function-trace.test.ts` — the matching inline
and enclosing-form boundary and positive-path guards.
**Lenses run:** code ✓ · acceptance ✓ · test ✓ · security skipped: no security/runtime surface changed
· perf skipped: constant-time compile-time predicates only · a11y skipped: no UI · dependency audit
skipped: no manifest or lockfile change in this pass.

Baseline at review time: `pnpm test` (245/245), `pnpm build`, `pnpm lint`, and
`pnpm typecheck:test` all exit 0.

## Findings (by severity)

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/plugin.ts:697` — the call-through docstring
  presents `trace(fn, options)` as a supported inline expression, but the marker collector rejects an
  identifier target outside standalone-statement position. The call-not-a-boundary behavior works;
  its concrete example does not.
  - **Fix:** use a valid literal such as
    `const load = useCallback(trace(() => {}, options), [])`, and describe passing a traced literal
    through the call.
  - **Cites:** baseline (`CODE_REVIEW.md` — comments that contradict code) · caught by code

- **[MEDIUM]** `test/plain-function-trace.test.ts:1595` — the new
  `OptionalMemberExpression` boundary has no direct fixture: both marker-form suites exercise only
  ordinary `.foo` member reads, so removing the optional-member predicate would leave the current
  suite green.
  - **Fix:** in the Testing phase, add optional-chain rejection cases for both inline and enclosing
    markers.
  - **Cites:** `review-3.md` member-access finding · plan verification contract · caught by acceptance
    and test

- **[MEDIUM]** `test/plain-function-trace.test.ts:2243` — the call-not-a-boundary guards pin ordinary
  `CallExpression`, but not the deliberately transparent `NewExpression` and
  `OptionalCallExpression` shapes recorded in pass 3.
  - **Fix:** in the Testing phase, add successful inferred-name fixtures for constructor and optional
    calls.
  - **Cites:** `review-3.md` rebuttal · plan trace-name-resolution contract · caught by test

## Rule coverage gaps

- No project rule requires an AST name-inference walk to enumerate Babel node kinds or requires
  sibling-kind regression coverage when a boundary predicate expands — surfaced by code,
  acceptance, and test.
