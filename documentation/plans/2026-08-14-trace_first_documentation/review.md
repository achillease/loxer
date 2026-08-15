# Review: Trace-first documentation — pass 1

**Verdict:** WARN
**Scope:** Trace-first documentation rewrite, generated TypeDoc configuration, and related public runtime-output documentation changes.
**Change scope:** base `HEAD` · paths `README.md`, authored documentation, trace-plugin READMEs, `src/Loxer.ts`, `src/core/output/OutputStreams.ts`, `src/core/output/PropsPrinter.ts`, `src/loxes/Lox.ts`, `src/trace.ts`, `src/types.ts`, `typedoc.json`, `package.json` · current change
**Lenses run:** code ✓ · simplicity ✓ · test ✓
**Lenses skipped/N/A:** security: no security-relevant runtime, dependency, or credential-handling change identified · perf: no material hot-path algorithm or data-access change identified · a11y: no user-facing UI · acceptance: no separate spec exists; the plan explicitly records that absence
**Agents dispatched:** 3

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-removed-legacy-documentation-routes` · Legacy documentation URLs were removed

- **Location:** `documentation/props.md:1`, `documentation/Performance.md:1`
- **Issue:** Both externally linkable compatibility pages are deleted, so existing GitHub/blob and bookmarked URLs return 404 instead of routing readers to the canonical guides.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review.md CODE-removed-legacy-documentation-routes`
- **Fix:** Restore each file as a short compatibility route linking to `logging.md` and the performance section of `reference.md`.
- **Cites:** `CODE_REVIEW.md` backward-compatibility checklist · `rules/documentation.md` compatibility-route rule · plan approach 2 · code-reviewer
- **Carry-over:** new

### 🔶 HIGH · `CODE-broken-package-readme-guide-links` · Plugin READMEs link to nonexistent guide paths

- **Location:** `packages/babel-plugin-loxer-trace/README.md:42`, `packages/vite-plugin-loxer-trace/README.md:41`
- **Issue:** Both README files point to former directory-based guide paths, but the implemented canonical guides are `documentation/integrations.md` and `documentation/tracing.md`.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review.md CODE-broken-package-readme-guide-links`
- **Fix:** Point both READMEs at the existing flat guide files, using anchors where needed.
- **Cites:** `rules/documentation.md` canonical-content ownership and link-migration rules · plan approaches 2 and 10 · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-readme-trace-example-output-mismatch` · Landing-page trace proof describes a different scenario

- **Location:** `README.md:55`
- **Issue:** The example defines `loadOrder`, while the prose invokes `submitOrder('A-42')` and labels the image as submit-order output; the linked image depicts a separate scenario.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review.md CODE-readme-trace-example-output-mismatch`
- **Fix:** Use one canonical scenario consistently across the function, invocation prose, alt text, and image.
- **Cites:** plan approaches 3 and 8 · `rules/documentation.md` example-alignment rule · code-reviewer
- **Carry-over:** new

### 🔶 HIGH · `TEST-console-output-spacing-expectation` · Default console-output test is stale

- **Location:** `src/core/output/OutputStreams.ts:56`, `test/initialization.test.ts:364`
- **Issue:** The log console separator changed from a tab to two spaces, but the existing assertion still expects tab-delimited output. The test will fail and no matching test update accompanies the behavior change.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Update the structured-renderer/default-console-output expectation to use the two-space separator; retain the error-path tab expectation unless that output is intentionally changed too.
- **Cites:** `rules/testing.md` source-change test requirement · test-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (1):** `TEST-console-output-spacing-expectation` → specifically requested implementation task
- **Implementation pass — 🟡 contained (3):** `CODE-removed-legacy-documentation-routes`, `CODE-broken-package-readme-guide-links`, `CODE-readme-trace-example-output-mismatch` → `implement documentation/plans/2026-08-14-trace_first_documentation/review.md <IDs>`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- The plan intentionally has no separate specification, so the acceptance lens could not assess spec criteria.
- `git diff --check HEAD` reports trailing whitespace in the README example; it is not a separately routed finding.
