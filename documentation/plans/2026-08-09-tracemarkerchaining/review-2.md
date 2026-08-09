# Review: Fluent trace-marker chaining — pass 2

> Model/effort: gpt-5/unknown

**Verdict:** WARN
**Scope:** Fluent trace-marker transform and runtime follow-up after pass-1 fixes.
**Change scope:** base `HEAD` · paths `packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `packages/babel-plugin-loxer-trace/src/marker-transform.ts`, `packages/babel-plugin-loxer-trace/src/marker-types.ts`, `src/Loxer.ts`, `src/trace.ts`, and `src/tracing-types.ts` · current change
**Lenses run:** code ✓
**Lenses skipped/N/A:** simplicity: pass-1 finding fixed; security: no security-sensitive handling or dependency change; perf: no newly scoped performance concern; a11y: no user-facing UI; acceptance: pass-1 finding fixed; test: pass-1 findings fixed
**Agents dispatched:** 1

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔸 MEDIUM · ▽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-public-error-box-entrypoint` · Internal error-box opener is exported publicly

- **Location:** `src/Loxer.ts:565`
- **Issue:** `__openTrace()` is exported from `Loxer.ts`, which `src/index.ts` re-exports wholesale. Consumers can therefore import it from `loxer` and open manual error-level boxes, breaking the required public `BoxLevel` boundary.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-09-tracemarkerchaining/review-2.md CODE-public-error-box-entrypoint`
- **Fix:** Move the `LogLevel` opener to a runtime module that the root entry point does not export, or otherwise keep it out of the published root export surface while allowing `trace.ts` to use it.
- **Cites:** Plan §6 · `AGENTS.md` behavior rules · `rules/coding-conventions.md` export-surface rule · `CODE_REVIEW.md` public-API compatibility checklist · code-reviewer
- **Carry-over:** carried over from `CODE-public-error-box-entrypoint`; the worklog marked the prior implementation fixed, but the current change still exposes the replacement helper through `src/index.ts`.

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (1):** `CODE-public-error-box-entrypoint` → `implement documentation/plans/2026-08-09-tracemarkerchaining/review-2.md CODE-public-error-box-entrypoint`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- none

## Notes

- Pass 2 was narrowed to code review because all pass-1 findings were recorded as fixed. The reviewer inspected the immediate root-export consumer needed to validate this finding. No tests were run during Review.
