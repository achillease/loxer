# Review: inline trace markers — boundary coverage additions (pass 6)

**Verdict:** PASS
**Scope:** `test/plain-function-trace.test.ts` — direct `OptionalMemberExpression` rejection and
positive `NewExpression`/`OptionalCallExpression` fall-through fixtures for inline and enclosing
markers.
**Lenses run:** acceptance ✓ · test ✓ · code skipped: test-only delta · security, perf, a11y, and
dependency audit skipped: no product, runtime, UI, or manifest delta.

Author verification before review: focused suite 92/92, full suite 245/245,
`pnpm typecheck:test`, and `git diff --check` all pass.

## Findings (by severity)

- none

## Rule coverage gaps

- `rules/testing.md` has no rule requiring each distinct Babel AST kind in a
boundary/fall-through predicate to receive direct regression coverage — surfaced by acceptance and
test.
