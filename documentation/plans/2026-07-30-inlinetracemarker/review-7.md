# Review: `parent.functionName` message style and linked-Loxer Vite handling (pass 7)

**Verdict:** WARN
**Scope:** the staged change that landed after pass 6 (worklog rows dated 2026-08-02 and
2026-08-03) — `src/core/TraceNames.ts` (new), `src/trace.ts`, `src/tracing-types.ts`,
`src/decorators/trace.ts`, `packages/babel-plugin-loxer-trace/src/{marker-collection,
marker-transform,marker-types,plugin,trace-binding,trace-wrapper}.ts`,
`packages/vite-plugin-loxer-trace/src/index.ts`, the suites under `test/`, `CHANGELOG.md`,
`documentation/index.md`, `rules/testing.md`, four `AGENTS.md` files, and one generated
`docs/` page.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: no manifest or lockfile in the
diff) · perf ✓ · acceptance ✓ · test ✓ · a11y skipped: no user-facing UI in the change.

Author verification before review, re-measured by this pass: `pnpm test` 293/293 across 19
files, `pnpm lint`, `pnpm typecheck:test` and `pnpm typecheck:types` all exit 0.

## Findings (by severity)

- **[HIGH]** `packages/vite-plugin-loxer-trace/src/index.ts:138-150` (`wantedFsAllow`) — when a
  consumer has set their own `server.fs.allow`, the plugin adds the linked Loxer's resolved
  directory to it anyway, and does so by default. `server.fs.allow` is the boundary deciding which
  files the dev server will serve to a browser; a user who set it narrowed that boundary
  deliberately. The widening rides on `dedupe`, an option whose name and documented purpose are
  dependency deduplication, so there is no signal narrower than "did not pass `dedupe: false`"
  behind a change to a filesystem-serving policy. The directory added is wherever
  `require.resolve('loxer/package.json')` plus `realpathSync` lands — a sibling repository, a
  `pnpm link` target, a monorepo checkout.
  - **Fix:** give this widening its own opt-in (e.g. `allowLinkedDirectory`, separate from
    `dedupe`), or contribute nothing to an `fs.allow` the user set and instead report what the
    project must add for a linked Loxer to be served. Either way, state the security implication
    next to the option's JSDoc and in the README, not only the functional "Vite needs to serve it"
    rationale. **This one alters the plugin's public option surface and its default behavior, so
    it is a decision for the maintainer rather than a fix to apply unprompted.**
  - **Cites:** baseline (`SECURITY_REVIEW.md` — path/file-handling containment: a resolved path
    added to a containment allowlist without the boundary owner's consent) · caught by security.
    Mitigating and confirmed by the same lens: the contribution is inert for `vite build` and
    `vite preview` (only `serveStaticMiddleware`/`serveRawFsMiddleware` read `fs.allow`), and the
    behavior is documented in `packages/vite-plugin-loxer-trace/README.md:76-80` and
    `AGENTS.md:23-28`.

- **[MEDIUM]** `src/core/TraceNames.ts:22-25` and
  `packages/babel-plugin-loxer-trace/src/marker-collection.ts:102-104` (`classParentName`) — the
  trailing-`Class` strip is unconditional, so a class named exactly `Class` reduces to `''`. On the
  marker path that empty string then defeats the file fallback as well, because
  `marker.className ?? fileName` in `marker-transform.ts:154-157` only falls through on
  `null`/`undefined`, never on a falsy string: the transform emits
  `__startTrace(name, args, options, "")`, and `qualifiedFunctionName`'s truthy test renders the
  bare function name. Such a function therefore reports neither its class nor its file, which
  contradicts the contract stated in `src/core/AGENTS.md` and
  `packages/babel-plugin-loxer-trace/AGENTS.md` that the file is the parent of every function no
  class holds. Both copies agree with each other here, so this is a shared gap rather than drift.
  - **Fix:** leave an exact `'Class'` untouched (`className === 'Class' ? className : …`) in both
    copies, and change the marker path's fallback to `marker.className || fileName` so an empty
    resolved class name still reaches the file. Add the `Class` case to
    `test/plain-function-trace-enclosing.test.ts` and `test/decorators.test.ts`.
  - **Cites:** baseline (`CODE_REVIEW.md` — boundary condition / missing edge handling) · project
    rule (`src/core/AGENTS.md`, `packages/babel-plugin-loxer-trace/AGENTS.md`: the file is the
    fallback parent) · caught by code.

- **[MEDIUM]** `src/core/TraceNames.ts:19-22` and
  `packages/babel-plugin-loxer-trace/src/marker-collection.ts:96-104` — both files carry a comment
  stating that `test/decorators.test.ts` and `test/plain-function-trace-enclosing.test.ts` "pin
  them against each other". They do not. Each suite hard-codes the same literal
  (`OrderServiceClass` → `OrderService`) against its own copy —
  `test/decorators.test.ts:289-309` for the runtime copy,
  `test/plain-function-trace-enclosing.test.ts:264-291` for the build-time copy — with no shared
  table and no assertion that runs one input through both implementations. Duplicating the rule
  across two packages is deliberate and sound (the packages cannot import each other), but the
  safety net the duplication is justified by does not exist, so a change to one copy's suffix rule
  leaves both suites green.
  - **Fix:** export a shared table of class-name inputs and expected outputs from a plain `.ts`
    module (not a `.test.ts` file, per `rules/testing.md`'s independently-discovered-suite rule),
    import it in both suites, and assert both implementations agree on every entry — the pattern
    `test/decorators.test.ts:224-226` already uses for the legacy/standard decorator protocols
    (`expect(standard.records).toEqual(legacy.records)`).
  - **Cites:** project rule (the design intent asserted in both files' own comments, which the
    change offers as the justification for the duplication) · caught by test. **Reported by the
    test lens as HIGH; recorded here one level lower per the rubric's tie-break, because the two
    copies do currently agree — independently confirmed by the code lens — so this is a drift risk
    and a false comment rather than a present defect. The verdict is WARN either way.**

- **[MEDIUM]** `src/trace.ts:174-189` — `__startTrace` computes `parentQualifiedName`
  (`sanitizeMessage(parentName)` plus `qualifiedFunctionName(...)`) on every traced call, before
  knowing whether `openMessage` or `closeMessage` is `'parent.functionName'` and before the level
  gate inside `Loxer.h(...).m(...)[level].open(...)` decides whether the log is written at all. The
  default style is `'functionName'`, so the common case pays for a string it never uses, including
  for calls that `documentation/Performance.md`'s "Logs not leveled" benchmark treats as the case
  that should cost almost nothing. `src/decorators/trace.ts:87-90` makes the same decision
  correctly, gating on `needsParentName` before resolving — and the marker runtime is the
  higher-volume of the two paths.
  - **Fix:** mirror the decorator:
    `const needsParentName = options.openMessage === 'parent.functionName' || options.closeMessage === 'parent.functionName';`
    and compute `parentQualifiedName` only when it holds.
  - **Cites:** project rule (`documentation/Performance.md` §"Test 2 — Logs not leveled") ·
    baseline (`PERFORMANCE_REVIEW.md` — redundant work in hot paths) · caught by perf.

- **[MEDIUM]** `documentation/specs/babel-plain-function-tracing.md:34-36,47` — the checked-in spec
  still states its acceptance criteria in terms of the retired name: `openMessage`/`closeMessage`
  list `className.functionName`, and line 36 still teaches "`className.functionName` falls back to
  `functionName` for plain functions", which is precisely the behavior this change replaced. This
  is the only live file outside the plan folder and the `CHANGELOG.md` history that still teaches
  the old model — a repo-wide grep over `src/`, `packages/*/src/`, `test/`, `playground/` and
  `documentation/index.md` is otherwise clean.
  - **Fix:** update the spec's criteria to `parent.functionName` and the class/file parent model, or
    add a note pointing at the 2026-08-02 worklog rows that supersede it.
  - **Cites:** spec acceptance criterion (`documentation/specs/babel-plain-function-tracing.md`) ·
    rubric §1 (the spec is this lens's rulebook) · caught by acceptance.

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/src/index.ts:126-128` (`isInstalledPackagePath`) —
  classifying installed versus linked by whether any resolved path segment equals `node_modules` is
  a coarse test for the one function gating a filesystem-exposure decision. It is correct for every
  shape the suite covers (pnpm virtual store, hoisted monorepo, nested install, Windows paths,
  workspace siblings), and the input is developer-controlled rather than attacker-controlled, so
  exploitability is low — but a directory tree that legitimately contains a `node_modules` segment
  misclassifies in either direction.
  - **Fix:** tighten the test to whether `node_modules` is an ancestor of, or the immediate
    container for, the resolved package rather than matching any segment, and record the remaining
    assumption in the function's doc comment.
  - **Cites:** baseline (`SECURITY_REVIEW.md` — path traversal / file handling) · project rule
    (`packages/vite-plugin-loxer-trace/AGENTS.md:10-13`, which states the design but not this edge)
    · caught by security.

- **[MEDIUM]** `packages/vite-plugin-loxer-trace/src/index.ts:495-509` (`missingFrom`) and
  `test/vite-plugin-loxer-trace.test.ts` — the worklog records a real defect fixed in this change:
  `wanted` repeats itself wherever the linked directory *is* the workspace root, which is every
  project inside Loxer's own repository, the demo included. No fixture exercises that path — the
  two linked-Loxer fixtures are siblings under a temp directory and never compare equal — so the
  self-dedupe is verified only by the manual dev-server run the worklog describes.
  - **Fix:** add a fixture whose linked package directory is also its own resolved workspace root
    and assert `server.fs.allow` carries no duplicate entry.
  - **Cites:** project rule (`rules/testing.md`, the built-artifact and consumer-observed done-gate
    added by this same change) · caught by acceptance.

- **[MEDIUM]** `rules/testing.md` (the built-artifact rule added by this change) — the requirement
  that a consumer-observable change be exercised against `dist/` and `packages/*/dist` after
  `pnpm build`, and through a real consumer dev server where one is on hand, has no automated
  enforcement. `.github/workflows/main.yml` runs lint, test, both typechecks and `pnpm build`, but
  never executes anything against the tree it built and never runs `pnpm demo:build` or starts a
  dev server; `.husky/pre-commit` runs only `pnpm lint`. The rule rests entirely on a human
  remembering it — and the stale-pre-bundle bug this change fixes is exactly the seam it guards.
  - **Fix:** add a smoke step that imports and executes something from `dist/` in CI (or run
    `demo:build` there), so the built-artifact seam has a gate that does not depend on memory.
  - **Cites:** project rule (`rules/testing.md`, self-inconsistent between the rule and its
    enforcement) · caught by test.

- **[LOW]** `documentation/index.md:130,171` — two newly added sentences use "also", a word
  `rules/documentation.md` names in its ban list for teaching sections. Both state a current fact
  rather than narrating a change, and "also" appears in at least eight pre-existing sentences in
  the same guide (lines 20, 61, 182, 192, 289, 308, 353, 645), so this is a literal match against
  the ban list rather than the diff-narrating register the rule exists to prevent.
  - **Fix:** if the rule is meant literally, drop the word from both new sentences; the surrounding
    file would need the same pass to be consistent.
  - **Cites:** project rule (`rules/documentation.md`, diff-narrating register) · caught by
    acceptance.

### Verified clean

Recorded so a later pass need not re-derive it:

- `__startTrace`'s optional fourth parameter is correctly backward-compatible with already-emitted
  three-argument calls, and `trace-wrapper.ts` appends the argument only when a parent resolved, so
  an unchanged call site still emits three. `test/plain-function-trace-core.test.ts:1039-1048`
  covers the three-argument shape directly.
- Every call site of `buildWrapperBody`, `traceBinding`, `traceLiteral` and
  `traceEnclosingFunction` passes the new `parentName` in the correct position across all four
  branches — no swapped `string` pair.
- `enclosingClassName`'s walk shares `isNameBoundary` with `surroundingName` as its comment claims,
  and every shape checked (function nested in a method body, object-literal method, `static {}`
  block, class inside a class method, unnamed class through a declarator or an assignment,
  private and accessor fields, getters and setters) is pinned by an explicit test.
- `fileParentName`'s edge cases — dotfile, multi-dot name, no extension, trailing separator on both
  separators, empty string, `undefined`, non-string — are directly unit-tested.
- The rename is complete in `src/`, `packages/*/src/`, `test/`, `playground/` and `examples/`, is
  recorded as a `**Breaking:**` entry in `CHANGELOG.md`, and its migration row sits inside
  `documentation/index.md`'s "Appendix: Migrating from Loxer 2" rather than a teaching section.
- `docs/` regeneration is complete, not partial: `TraceOptions` is the only exported symbol whose
  JSDoc changed, so `docs/interfaces/index.TraceOptions.html` is the only page owed a rewrite —
  `src/trace.ts`'s `__startTrace` and all of `src/core/TraceNames.ts` are `@internal`.
- `sanitizeMessage` correctly extends over the new `parentName` before it reaches a message, and the
  plugin emits every source-derived name through `t.stringLiteral`, which Babel escapes.
- The linked-versus-installed suite uses real `mkdtempSync`/`symlinkSync` fixtures and real
  resolution rather than mocks, and avoids the self-reference trap by passing an explicit temp-dir
  `root`; both `wantedFsAllow` branches are covered. No tautological or over-mocked test was found
  anywhere in the change.

## Rule coverage gaps

- The project documents the **destructive** symlink/junction hazard thoroughly (`AGENTS.md`
  "Workspace Safety": link-following recursive deletes reaching back into the repo) but has no
  counterpart for the **read/serve** hazard — a resolved symlink target being added to a serving
  allowlist. The new Vite logic is exactly that second class and carries only functional, not
  security-framed, documentation. — surfaced by security.
- No rule states who owns a decision to widen a user-supplied Vite dev-server security setting, or
  requires a plugin to take an explicit opt-in before touching one. — surfaced by security.
- No rule requires a spec under `documentation/specs/` to be amended when a later reviewed decision
  supersedes what it states; the stale-spec finding above rests on the rubric's general principle
  instead. — surfaced by acceptance.
- No rule requires per-log runtime work in `src/trace.ts` / `src/decorators/trace.ts` to be gated
  behind the message-style option that needs it, even though `documentation/Performance.md` makes
  per-log overhead a first-class concern. — surfaced by perf.
- No rule distinguishes cold from hot Vite plugin hooks for the purpose of synchronous I/O. —
  surfaced by perf.
- `rules/testing.md`'s built-artifact rule is documented but unenforced (also reported as a finding
  above). — surfaced by test.
- Two parent-resolution edge cases are undocumented by any test: a computed class-member key under
  `parent.functionName` (currently unreachable, since name resolution fails first) and a marked
  class **constructor**, which `isClassMember` treats as an ordinary member — whether it renders
  `Derived.constructor()` is untested. — surfaced by test.
