# Review: realm-scoped singleton and self-reporting pre-init queue (re-review)

**Verdict:** WARN
**Scope:** Current staged/worktree singleton, queue, ID ownership, Vite-plugin configuration, and related tests after the warning-redaction fix.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: no dependency/lockfile change) · perf skipped: the amendment only removes diagnostic text · a11y skipped: no UI · acceptance skipped: no formal spec · test ✓

## Findings (by severity)

- **[HIGH]** `test/initialization.test.ts:283` — The overflow-warning test still expected queued log text even though the implementation redacts queued content. It would fail and could encourage restoring the disclosure.
  - **Fix:** Replace the positive assertion with a non-disclosure assertion for the overflow path, matching the timeout path.
  - **Cites:** `rules/testing.md` observable behavior · caught by test
- **[HIGH]** `src/core/Loxes.ts:187` — The redaction existed only in the working tree; the staged index still included the queued message.
  - **Fix:** Stage the source and test redaction changes together.
  - **Cites:** baseline (CODE_REVIEW.md §1) · caught by code
- **[MEDIUM]** `documentation/index.md:184` — The guide still described a warning that includes the first queued log message.
  - **Fix:** Update it in the Documentation phase to describe metadata-only diagnostics.
  - **Cites:** baseline (CODE_REVIEW.md — documentation/code consistency) · caught by code

## Rule coverage gaps

- Hardened-realm fallback and the elapsed-time fallback do not have direct focused coverage.
- No formal specification exists.
