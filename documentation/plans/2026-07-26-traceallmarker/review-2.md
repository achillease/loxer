# Review: `trace()` accepts a single target or a list (pass 2 — remediation re-check)

**Verdict:** PASS
**Scope:** the pass-2 delta — `test/plain-function-trace.test.ts` (+176/−16) and two worklog rows.
Product code is **byte-identical to pass 1** (`git diff -- src packages` empty, verified independently
by both lenses), so `packages/babel-plugin-loxer-trace/src/plugin.ts`, `src/trace.ts`, and
`src/tracing-types.ts` were read only as the contract the tests must pin. `docs/` excluded —
generated TypeDoc output.
**Lenses run:** code skipped (no product delta; returned clean in pass 1 after empirically verifying
the scope invariants against `@babel/traverse` source) · security skipped (as pass 1 — no
manifest/lockfile change, no security-relevant surface) · perf skipped (no product delta; no change to
generated code or transform cost) · a11y skipped (no user-facing UI) · acceptance ✓ · test ✓

## Findings (by severity)

None. Both lenses returned clean at the ≥80% confidence bar, and all three of pass 1's findings are
**closed** — each verified by reproduction rather than inspection.

### Pass 1 finding disposition

- **[was HIGH] missing scope-shape regression guards — CLOSED.** The three named shapes are now covered
  by `a list marker shares one options slot across targets declared in two nested scopes`,
  `two list markers in one nested scope get separate per-invocation options slots`, and
  `a marker on a block-scoped target keeps per-invocation options`. The test lens rebuilt a pre-fix
  plugin variant in a scratch directory (`declareTraceOptions` reverted to
  `marker.callPath.scope.getProgramParent().push(...)`) and drove both variants through real
  `transformAsync`: **all three new tests fail against the pre-fix implementation** — the two-scope and
  block-scoped cases report `'TRACE'` for every log instead of the expected `'ORDER'` first, and the
  two-marker case scrambles moduleIds to `TRACE,ORDER,TRACE,ORDER`. This independently reproduces the
  same result obtained during remediation. None of the three is vacuous.
  - The uid assertion in the two-marker test pins real logic: `generateUidIdentifier` produces
    `_sharedTraceOptions` / `_sharedTraceOptions2` (the genuine collision case, since both list markers
    independently request the same base name) and Babel's `scope.push` merges them into one
    `var a, b;`.
  - The block-scoped test genuinely exercises a non-function scope: the emitted
    `var _blockScopedTraceOptions;` sits textually **inside** the `if` block rather than at the top of
    `build`, confirming `outermostTargetScope` resolved the block's scope while `var` hoisting still
    delivers per-invocation isolation — exactly the mechanism `plugin.ts:149-163` documents.
- **[was MEDIUM] one-directional type pins — CLOSED.** All four formatter fixtures now use a
  bidirectional `Equals` helper (`IsAny` guard + mutual assignability) with `AssertTrue`. Verified with
  real `tsc --strict` runs: `Equals<[id: string], [id: string] | [active: boolean]>` resolves `false`
  and `AssertTrue<false>` is a genuine `TS2344`. The error surfaces **at the type-alias line itself**,
  from `AssertTrue`'s constraint check at type-argument substitution — so it bites under
  `pnpm typecheck:test` regardless of `noUnusedLocals` or the fixtures never being called. `IsAny`
  closes the `any`-widening hole in the direction that matters (`Equals<any, X>` → `false`). No
  fixture's expected type was weakened to fit what TS produced; all four were cross-checked against
  `src/trace.ts`'s signature.
- **[was MEDIUM] untested array hole — CLOSED.** `trace([one, , two])` now asserts
  `'trace() targets must be named function-binding identifiers.'`, and the lens confirmed against the
  real plugin that each of the three added rejection cases hits its **intended** validation gate rather
  than an earlier one: the hole reaches `resolveTarget` through `collectTargets`'s `.map` (the `null`
  element is not swallowed), the anonymous target clears the standalone-statement and arity checks
  first, and the spread-options case is caught by the dedicated spread check before `collectTargets`
  runs. Two pre-existing gaps pass 1 listed were closed in the same block: an anonymous single target
  and `'trace() options cannot be a spread argument.'`.

## Non-graded observations

- **`Equals`'s `Expected` side is unguarded** — `Equals<[id: string], any>` incorrectly resolves `true`,
  because `IsAny` only guards `Actual`. Not raised as a finding and not fixed: `Expected` is a
  hardcoded literal type at all four call sites, so no committed fixture can trigger it. Worth guarding
  both sides if the helper is ever reused more widely.
- **Mutual assignability rather than type identity is deliberate.** A strict identity check fails on a
  *correct* type here: `readonly [f, g]` (the `as const` form) infers `T` as a union of the two element
  types, so `Parameters<T>` distributes to an unreduced `[id: string] | [id: string]` — confirmed by
  forcing a type error and reading the reported type. Mutual assignability normalizes that duplicate
  union member while still catching a collapsed branch, which is the failure mode the finding named.
- **No pre-existing coverage was traded away.** All 16 removed lines are the four fixtures' old
  one-directional pins, each replaced by a strictly stronger check — accounted for line by line by both
  lenses.
- **The temporary revert used to prove the tests bite was restored exactly.** Both lenses confirmed
  `git diff -- src packages` is empty and that `declareTraceOptions`/`outermostTargetScope` carry no
  leftover `getProgramParent()` artifact.
- **DoD still partially verified.** `pnpm lint`, `pnpm build`, and `pnpm typecheck:test` were re-run to
  exit 0 in this pass, plus `prettier --check` on the edited suite. `pnpm test` (184 tests — internally
  consistent with 181 + 3 new `test()` blocks), `pnpm docs`, and `pnpm demo:build` remain worklog
  self-report, not confirmed by this read-only phase. `pnpm docs` correctly was **not** re-run: the
  delta touches zero `src/**` JSDoc, so `docs/` is not newly stale.
- No new flake risk: no timers, sleeps, or randomness; each new test gets its own module via
  `loadTracedModule`'s `moduleCount`-suffixed data URL, so no cross-test module-cache reuse; all new
  test names are unique file-wide; the file's existing `beforeEach`/`afterEach` `resetLoxer()` pattern
  is reused unchanged.

## Rule coverage gaps

Five carried forward from pass 1, one closed by this pass. Unchanged gaps are restated so this snapshot
stands alone; all belong to the Documentation phase.

- **No spec exists for this change** — `documentation/specs/` holds only `babel-plain-function-tracing.md`
  (the earlier single-target feature). Both passes were judged against `plan.md` + `worklog.md` +
  `review.md` rather than third-party-checkable acceptance criteria. — surfaced by **acceptance**
- **No convention for Babel-plugin diagnostic tests or type-fixture patterns.** Now *more* worth
  codifying than at pass 1: the bidirectional `Equals`/`IsAny`/`AssertTrue` idiom is a good pattern with
  no home in `rules/testing.md`, and the one-directional idiom it replaced is exactly the blind spot a
  documented rule would have prevented. — surfaced by **test**
- **No rule on explicit `any` for internal, non-exported Babel-API plumbing.**
  `packages/babel-plugin-loxer-trace/AGENTS.md` covers only the published-declaration boundary. —
  carried forward from **code** (pass 1)
- **No use-case↔test coverage map** (`FEATURES.md` or equivalent) anywhere in the repo, and no rule
  documenting such a convention. — surfaced by **test**
- **No build-tooling / compile-time performance rule.** `documentation/Performance.md` benchmarks
  runtime log throughput only. — carried forward from **perf** (pass 1)
- ~~Two pre-existing untested diagnostics (`'trace() options cannot be a spread argument.'`, anonymous
  single target)~~ — **closed in this pass**; both now have rejection cases asserting their exact
  messages.
