# Review: realm-scoped singleton and self-reporting pre-init queue

**Verdict:** PASS
**Scope:** Staged singleton, queue, ID ownership, Vite-plugin configuration, and related tests.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: no dependency/lockfile change) · perf ✓ · a11y skipped: no UI · acceptance ✓ (no formal spec) · test ✓

## Findings (by severity)

- **[MEDIUM]** `src/core/Loxes.ts:186` — The pre-init warning includes the first queued log message, which can expose credentials, PII, or attacker-controlled data through `console.warn` before output configuration exists.
  - **Fix:** Report only queue metadata and candidate causes; do not interpolate queued log content.
  - **Cites:** baseline (SECURITY_REVIEW.md — sensitive-data exposure) · caught by security
- **[MEDIUM]** `test/initialization.test.ts:205` — The elapsed-time fallback in `enqueue()` is not directly exercised without advancing the scheduled timer.
  - **Fix:** Add an isolated system-time test that advances the clock without running timers, then enqueues again.
  - **Cites:** `src/core/AGENTS.md` pending-queue invariant · caught by test
- **[MEDIUM]** `test/realm-singleton.test.ts:52` — The documented hardened-realm fallback in `Realm.ts` lacks a direct test.
  - **Fix:** In an isolated test, install a non-extensible realm slot before import and assert the module-local fallback does not throw.
  - **Cites:** `src/core/AGENTS.md` Realm invariant · caught by test
- **[MEDIUM]** `CHANGELOG.md:8` — The plan calls for an Unreleased entry, but none is staged.
  - **Fix:** Add a concise Unreleased Fixed entry during Finalization.
  - **Cites:** plan — Critical files · caught by acceptance
- **[MEDIUM]** `src/core/Loxes.ts:168` — “Once, ever, per instance” conflicts with reset creating a new queue epoch.
  - **Fix:** Either preserve warning state through reset or document the implemented once-per-pre-init-epoch behavior.
  - **Cites:** plan — pre-init queue signal · caught by acceptance

## Rule coverage gaps

- No formal specification supplies independently approved acceptance criteria.
- No project-wide policy covers diagnostic redaction, timer/resource lifecycle, public option compatibility, or general performance budgets.
- Baseline areas outside this library diff (auth, SSRF, crypto, browser controls) have no project rules.
