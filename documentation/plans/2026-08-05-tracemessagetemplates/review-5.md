# Review: Trace message templates and colored call payloads — pass 5

> Model/effort: GPT-5/unknown

**Verdict:** PASS
**Scope:** The pass-4 renderer and test fixes for callback-token cleanup, built-artifact coverage, table-driven cases, and dist singleton reset.
**Change scope:** base `HEAD` (`a0096d9`) · paths `src/core/TraceMessage.ts`, `src/trace.ts`, `src/decorators/trace.ts`, `src/Loxer.ts`, `src/core/ANSIFormat.ts`, `src/core/PropsPrinter.ts`, `src/loxes/Lox.ts`, `src/tracing-types.ts`, `test/trace-message.test.ts`, `test/dist-consumer.test.ts`, `test/trace-message-cases.ts`, `test/trace-message-carrier.test.ts`, `test/trace-message-console.test.ts`, `test/decorators-message-templates.test.ts`, `test/plain-function-trace-message-templates.test.ts`, `test/format.test.ts`, `test/tsconfig.json` · current staged, unstaged, and untracked change
**Lenses run:** code ✓ · test ✓
**Lenses skipped/N/A:** simplicity: no still-open finding · security: no security-relevant change or still-open finding · perf: `PERF-callback-token-extraction` remains deferred from pass 3 · a11y: no user-facing UI · acceptance: no still-open acceptance finding
**Agents dispatched:** 2

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `TEST-payload-rendering-laziness-uncovered` · Payload work has no laziness regression test

- **Location:** `test/trace-message.test.ts:439`
- **Issue:** The Cost coverage asserts lazy parent-name resolution only. It does not make argument/result formatting observable while a payload-free `'fn'` or `'parent.fn'` template is selected, so a regression that eagerly formats arguments or serializes a result would still pass despite violating the explicit cost criterion.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-05-tracemessagetemplates/review-5.md TEST-payload-rendering-laziness-uncovered`
- **Fix:** Add renderer-level cases with observable formatting hooks: use arguments whose inspection is counted for an open `'fn'` message, and a result with a spied `toJSON` for a close `'fn'` message; assert neither runs.
- **Cites:** trace-message-templates spec, “Cost” criterion · plan verification · test
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (0):** none → specifically requested implementation task
- **Implementation pass — 🟡 contained (1):** `TEST-payload-rendering-laziness-uncovered` → `implement documentation/plans/2026-08-05-tracemessagetemplates/review-5.md TEST-payload-rendering-laziness-uncovered`
- **Own task — 🔴 redesign (0):** none → re-plan or dedicated spec/task

## Rule coverage gaps

- No new gaps. The public-API compatibility/versioning, test-coverage freshness, simplicity-policy, and dependency/security-policy gaps recorded in pass 4 remain unchanged and were not re-examined by this narrowed pass.

## Notes

- `CODE-callback-token-remnant-corruption` is fixed: cleanup now recognizes only current-invocation nonce remnants, including left and right cuts, while preserving caller-supplied `U+E000`/`U+E001` text.
- `TEST-built-dist-gate-not-enforced`, `TEST-table-driven-cases`, and `TEST-dist-singleton-reset` are fixed and verified statically against their current tests.
- Pass 5 was narrowed to the code and test lenses that owned pass-4 findings. Review was static and read-only; no tests or applications were run.
