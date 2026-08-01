# Review: realm-scoped singleton and self-reporting pre-init queue (final re-review)

**Verdict:** PASS
**Scope:** Staged realm singleton, queue diagnostics, ID ownership, Vite-plugin configuration, and related tests.
**Lenses run:** code ✓ · security ✓ (dependency audit skipped: no dependency/lockfile change) · perf skipped: no performance-affecting amendment · a11y skipped: no UI · acceptance skipped: no formal spec · test ✓

## Findings (by severity)

- **[MEDIUM]** `documentation/index.md:184` — The guide says the warning includes the first queued log and is the only warning, but the implementation intentionally redacts queued content and separately reports dropped entries at replay. `src/core/Loxes.ts:168` also says “once, ever, per instance” though reset begins a new pre-init epoch.
  - **Fix:** In the Documentation phase, describe metadata-only timeout diagnostics, the separate replay drop report, and the once-per-pre-init-epoch behavior.
  - **Cites:** baseline (CODE_REVIEW.md — documentation/code consistency) · caught by code

## Rule coverage gaps

- `Realm.ts` hardened/frozen-global fallback has no direct automated test.
- The queue timer's `unref()` behavior is intentionally untested; it needs a child-process exit check.
- No project-wide policy documents diagnostic redaction or the same-realm trust boundary.
