# Review: `trace()` accepts a single target or a list (pass 1)

**Verdict:** WARN
**Scope:** staged working tree vs `HEAD` (`274a152`) — `packages/babel-plugin-loxer-trace/src/plugin.ts`
(+182/−79), `src/trace.ts`, `src/tracing-types.ts`; `README.md`, `documentation/index.md`,
`packages/babel-plugin-loxer-trace/README.md`; `test/plain-function-trace.test.ts` (+493),
`test/babel7-compat.test.ts`, `test/vite-plugin-loxer-trace.test.ts`, `test/vite-plugin-build.test.ts`,
`test/fixtures/vite-app-list/**`; the plan folder itself. `docs/` excluded — generated TypeDoc output.
**Lenses run:** code ✓ · security skipped (no manifest/lockfile change → dep-audit N/A; no
security-relevant surface — build-time AST transform, no I/O, auth, secrets, network, or
deserialization) · perf ✓ · a11y skipped (no user-facing UI; the only HTML is a Vite build fixture) ·
acceptance ✓ (no spec exists — see gaps) · test ✓

## Findings (by severity)

- **[HIGH]** `packages/babel-plugin-loxer-trace/src/plugin.ts:161-179` — the load-bearing scope-walk
  invariant behind `declareTraceOptions`/`outermostTargetScope` ("the outermost of the targets'
  declaring scopes is reachable from every target's generated body *and* from the marker's
  assignment") has no checked-in regression guard for three shapes: a **list whose targets span two
  different nested scopes**, **two separate markers in one nested scope** (merging into a single
  combined `var` declaration), and a **block-scoped target**. `test-bugs.md:9-11` and the worklog's
  17:19 entry verify all three only through a throwaway scratch driver. This is the exact invariant
  that already broke once inside this change (the module-scope options bug), and `plan.md`'s Risks
  section records that the risk "materialized once".
  - **Fix:** add three focused tests following the file's existing `loadTracedModule` /
    `transformLoxerTrace` codegen-inspection pattern — a list with targets in two nested scopes, two
    independent markers sharing one scope, and a target declared inside an `if`/`for` block —
    asserting on emitted code or on runtime `moduleId`.
  - **Cites:** `documentation/plans/2026-07-26-traceallmarker/test-bugs.md`, `worklog.md`, `plan.md`
    (Risks) · caught by **test**
  - **Mitigating cross-lens evidence (read before acting):** the **code** lens independently
    investigated the two failure paths this gap would expose and *disproved* both against the
    installed `@babel/traverse` source (7.29.7 and 8.0.4). (1) Sibling target scopes are structurally
    impossible for compiling code: every target identifier must be lexically visible at the marker's
    call site, so every target binding's scope is an ancestor-or-self of `callPath.scope` and all of
    them lie on one ancestor chain — reproduced with var-hoisted siblings across sibling blocks
    (identical enclosing function scope) and a block-scoped target one level deeper than a sibling
    `const` target (correctly yielded the shallower scope). (2) `scope.push({ kind: 'var' })` inserts
    via `getBlockParent()`, so a block scope still gets a declaration that `var`-hoists to the
    enclosing function — which is precisely what makes the fix correct for a block target. So this
    is a **missing regression guard on a verified-correct invariant**, not a suspected defect. If you
    accept that evidence, this is reasonably a MEDIUM and the verdict becomes PASS; it is recorded at
    the lens's HIGH because the invariant is load-bearing, already regressed once here, and is
    currently protected only by evidence that lives outside the repo.

- **[MEDIUM]** `test/plain-function-trace.test.ts:1278-1296` — the union-inference type fixture
  (`traceMixedSignatureListFormatterTypeFixture`) pins the list's inferred `Parameters` with a
  one-directional assignment (`const exactArguments: [id: string] | [active: boolean] = args;`),
  which cannot detect the regression it exists to catch: if inference **collapses to one branch**,
  the narrower type is still assignable to the wider union and the fixture compiles clean (confirmed
  under `tsc --strict`). `plan.md` names overload-free widening as a risk and designates this fixture
  as its mitigation, so the mitigation currently pins nothing.
  - **Fix:** make the check bidirectional — `expectTypeOf(args).toEqualTypeOf<[id: string] | [active:
    boolean]>()` (Vitest's `expectTypeOf`, already compatible with `test/tsconfig.json`), or a
    hand-rolled exact-type helper.
  - **Cites:** `documentation/plans/2026-07-26-traceallmarker/plan.md` (Risks: "Overload-free
    widening") · caught by **test**

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/src/plugin.ts:216-260` /
  `test/plain-function-trace.test.ts:1177-1210` — `collectTargets` maps over
  `ArrayExpression.elements`, which can contain `null` for an **array hole** (`trace([a, , b])`).
  This is code introduced by this diff and is untested in either direction. Verified as not a product
  bug — `t.isIdentifier(null)` is `false` in this project's `@babel/types`, so a hole degrades to the
  intended diagnostic rather than crashing — but the new parsing path has no test pinning that.
  - **Fix:** add a sibling case to the existing rejection block:
    `await rejects('function a(){} function b(){} trace([a, , b]);').toThrow('trace() targets must be
    named function-binding identifiers.')`.
  - **Cites:** diff-introduced code path; `rules/testing.md` (the suite is the record of behavior for
    changed code) · caught by **test**

No CRITICAL findings. The **code**, **perf**, and **acceptance** lenses each returned clean at the
≥80% confidence bar.

## Non-graded observations

- `packages/babel-plugin-loxer-trace/src/plugin.ts:166-179` — `outermostTargetScope` computes
  `scopeDepth(targets[0].binding.scope)` as its baseline and then recomputes the same depth in the
  loop's first iteration. Cosmetic, build-time only, no project rule names it (perf lens; not raised
  as a finding).
- Generated-code cost is neutral or better: a list of N targets emits exactly **one**
  `var _sharedTraceOptions;` and **one** assignment, evaluated once regardless of N — verified
  against real `transformLoxerTrace` output, and slightly cheaper than N single markers. Dropping the
  `= {}` initializer does **not** add a per-call allocation for the documented module-scope marker
  case, because the assignment runs at module evaluation before any caller reaches the wrapper;
  `__startTrace`'s `options = {}` default parameter is a startup transient, not a steady-state path.
  Moving storage into a function-local scope costs one object per *closure creation*, not per traced
  call — inherent to the correctness fix, not an avoidable regression.
- Build-time cost is negligible: one `programPath.traverse` total, `assertOneMarkerPerTarget` is a
  flat Set-based O(total targets) pass (not markers × targets), `scopeDepth` is bounded by real
  lexical nesting depth.
- Acceptance: all ten checked criteria **met**, with the DoD line **partially verified** — `pnpm lint`,
  `pnpm build`, and `pnpm typecheck:test` were run by two lenses and exit 0; `pnpm test`, `pnpm docs`,
  and `pnpm demo:build` were deliberately not run by this read-only phase and rest on the worklog's
  self-report (181 tests, TypeDoc exit 0, two `demo:build` runs).
- `traceAll` removal is complete: repo-wide grep finds it only in this plan folder's historical
  record, and `docs/` carries zero occurrences, so the generated reference is not stale.
- The `test-bugs.md` fix was independently re-verified by both the code and test lenses. In
  particular, the regression test `markers in a nested scope keep per-invocation options instead of
  sharing one slot` (`test/plain-function-trace.test.ts:866`) **would fail against the pre-fix
  implementation**: both `makeTraced` calls complete before any traced call, options differ per
  invocation, and the assertion reads the options-derived `moduleId` rather than closure-captured body
  state — it does not repeat the unobservable-options mistake `test-bugs.md` documents.

## Rule coverage gaps

- **No spec exists for this change** — `documentation/specs/` holds only
  `babel-plain-function-tracing.md`, which specs the earlier single-target feature (`a31af19`/
  `9efbc4d`). `plan.md` states its grounding as "none — direct user request… No spec", so acceptance
  was judged against `plan.md` + `worklog.md` + `test-bugs.md`. A public-API widening plus a latent-bug
  fix shipped with no acceptance criteria a third party could check it against. — surfaced by
  **acceptance**
- `packages/babel-plugin-loxer-trace/AGENTS.md` permits explicit `any` only at the *published
  declaration* boundary and says nothing about **internal, non-exported Babel-API plumbing**. This
  diff's `MarkerTarget.binding: any`, `outermostTargetScope(): any`, `scopeDepth(scope: any)` continue
  the file's pervasive pre-existing convention rather than importing `Scope`/`Binding` from
  `@babel/traverse` (an available dev dependency). Not flagged as a violation (pre-existing pattern),
  but the project has no rule either way for new internal helpers. — surfaced by **code**
- No documented convention for **Babel-plugin diagnostic-message tests or type-fixture patterns**.
  The assignment-based type-pin idiom (`const x: Expected = value;`) is an established but undocumented
  idiom in `test/plain-function-trace.test.ts`, and the second MEDIUM above shows it has a real blind
  spot — worth codifying in `rules/testing.md`. — surfaced by **test**
- No **use-case↔test coverage map** (`FEATURES.md` or equivalent) exists anywhere in the repo, and no
  rule documents such a convention. Standing gap; this change neither worsens nor establishes it. —
  surfaced by **test**
- No **build-tooling / compile-time performance** rule. `documentation/Performance.md` benchmarks
  runtime log throughput only, so there is no steering doc to anchor a transform-time budget for the
  plugin. — surfaced by **perf**
- Two **pre-existing untested diagnostics** on the marker's validation surface, both unmodified by this
  diff (reported as gaps, not findings, per rubric §4): `'trace() options cannot be a spread
  argument.'` (`plugin.ts:239`) has zero coverage anywhere in the suite, and an anonymous single target
  as a standalone statement is likewise untested. — surfaced by **test** and **acceptance**
