# Review: Trace-first documentation — pass 2

**Verdict:** WARN
**Scope:** Current trace-first documentation, image-generation tooling, runtime-output formatting, and public trace-reference changes.
**Change scope:** base `HEAD` · paths authored guides, trace-plugin READMEs, image-generation scripts, `src/`, `test/initialization.test.ts`, `typedoc.json`, `package.json`, and `pnpm-lock.yaml` · current change
**Lenses run:** code ✓
**Lenses skipped/N/A:** simplicity: no still-open simplicity finding · security: no security-relevant runtime, dependency, or credential-handling change identified · perf: no still-open performance finding · a11y: no user-facing UI · acceptance: no separate spec exists · test: prior test finding is fixed
**Agents dispatched:** 1

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-doc-image-capture-can-kill-an-existing-terminal` · Screenshot fallback terminates an unrelated terminal

- **Location:** `scripts/render-powershell-docs-images.ps1:55`
- **Issue:** If the new Windows Terminal process is not found within three seconds, the fallback selects any visible terminal. The `finally` block then stops it, so `pnpm docs:images` can terminate an unrelated user terminal session.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review-2.md CODE-doc-image-capture-can-kill-an-existing-terminal`
- **Fix:** Remove the fallback, or track only a terminal/window conclusively created for this run; never stop an unconfirmed pre-existing process.
- **Cites:** `CODE_REVIEW.md` correctness/resource-safety checklist · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-doc-image-capture-sequence-race` · Image names are not synchronized to displayed samples

- **Location:** `scripts/render-powershell-docs-images.ps1:66`
- **Issue:** The sequence runner and capture loop each sleep for two seconds without a handshake. Startup and capture timing can skip a sample or save a later sample/prompt under the preceding filename; the comment claiming seven-second display is not implemented.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review-2.md CODE-doc-image-capture-sequence-race`
- **Fix:** Add explicit producer/capture synchronization, or render and capture one named sample per terminal invocation before advancing.
- **Cites:** `CODE_REVIEW.md` correctness checklist · plan approach 8 · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-unused-doc-image-dev-dependencies` · Added image-generation dependencies have no consumer

- **Location:** `package.json:51`
- **Issue:** `@fontsource/ubuntu-mono`, `@xterm/xterm`, and `playwright` have lockfile entries, but the image command uses PowerShell, Windows Terminal, and `System.Drawing`; no scoped script consumes the added packages.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review-2.md CODE-unused-doc-image-dev-dependencies`
- **Fix:** Remove the unused manifest and lockfile entries, or add the intended checked-in generator that consumes them.
- **Cites:** `CODE_REVIEW.md` maintainability/dead-code checklist · code-reviewer
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-readme-trace-example-output-mismatch` · README fixture still diverges from the canonical submit-order scenario

- **Location:** `README.md:63`
- **Issue:** The README example calls an undefined `persistOrder` and has a failure branch, while the scenario that generates `submit-order-default.png` pauses and returns successfully without either. The landing-page snippet therefore does not produce its advertised output.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-14-trace_first_documentation/review-2.md CODE-readme-trace-example-output-mismatch`
- **Fix:** Make the README snippet use the canonical fixture’s lifecycle and marker placement, or revise the canonical scenario and regenerate its image from the same code.
- **Cites:** `rules/documentation.md` example-alignment rule · plan approaches 3 and 8 · code-reviewer
- **Carry-over:** carried over from `CODE-readme-trace-example-output-mismatch` — new evidence: the current canonical fixture still differs after the prior name-level alignment.

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (4):** `CODE-doc-image-capture-can-kill-an-existing-terminal`, `CODE-doc-image-capture-sequence-race`, `CODE-unused-doc-image-dev-dependencies`, `CODE-readme-trace-example-output-mismatch` → `implement documentation/plans/2026-08-14-trace_first_documentation/review-2.md <IDs>`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- Pass 2 ran only the code lens because all pass-1 findings have a worklog disposition; product source remains in the current change.
- `CODE-removed-legacy-documentation-routes` remains rebutted as an intentional deletion. `CODE-broken-package-readme-guide-links` and `TEST-console-output-spacing-expectation` remain fixed.
