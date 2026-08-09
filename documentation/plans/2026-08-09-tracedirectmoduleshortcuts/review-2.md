# Review: Direct module shortcuts for the trace marker — pass 2

> Model/effort: GPT-5/unknown

**Verdict:** WARN
**Scope:** Current direct trace-module shortcut implementation and public marker surface.
**Change scope:** base `HEAD` · paths `examples/vite-trace-demo/src/main.ts`, `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `src/trace.ts`, `src/tracing-types.ts`, and `src/types.ts` · current change
**Lenses run:** code ✓ · simplicity — · security — · perf — · a11y — · acceptance — · test —
**Lenses skipped/N/A:** simplicity: pass 1 had no open simplicity finding · security: no security-relevant code or dependency change · perf: `PERF-full-program-reference-validation-traverse` is fixed · a11y: no user-facing UI · acceptance: no spec; absence was recorded in pass 1 · test: both pass-1 test findings are fixed
**Agents dispatched:** 1

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔸 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-marker-reference-validation-early-return` · Validator stops after the first valid marker reference

- **Location:** `packages/babel-plugin-loxer-trace/src/marker-collection.ts:181`
- **Issue:** A consumed reference exits `assertEveryMarkerReferenceIsConsumed` entirely. When a valid marker precedes an incomplete, optional, or otherwise unsupported `trace` reference, the later reference is unchecked; the plugin transforms the valid marker and removes the `trace` binding, leaving the unchecked reference dangling instead of reporting the required diagnostic.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task
- **Fix:** Replace the successful-path `return` with `continue` so every `referencePath` of every marker binding is validated.
- **Cites:** `CODE_REVIEW.md` (correctness checklist) · plan §3 (no marker reference may survive while the plugin removes its import) · code-reviewer
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (1):** `CODE-marker-reference-validation-early-return` → specifically requested implementation task
- **Implementation pass — 🟡 contained (0):** none → `implement documentation/plans/2026-08-09-tracedirectmoduleshortcuts/review-2.md <IDs>`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- Pass 2. The pass-1 findings are recorded as fixed in `worklog.md`; no finding was re-litigated.
- Narrowed to code review because product code remains changed. The other lenses have no still-open finding to own.
- No budget exceedance.
