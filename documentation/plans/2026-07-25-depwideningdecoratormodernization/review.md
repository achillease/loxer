# Review: dependency widening and decorator modernization

**Verdict:** WARN
**Scope:** Workstreams T/A/B across manifests, lockfile, CI, Babel/Vite plugins, decorators, and compatibility/protocol tests
**Lenses run:** code ✓ · security ✓ · perf ✓ · a11y skipped: library-only/no UI · acceptance ✓ · test ✓

## Findings (by severity)

- **[HIGH]** `.github/workflows/main.yml:32` — The new unconditional full-tree `pnpm audit` is known to exit nonzero on the current lockfile because the intentionally retained Vite 5 compatibility alias and unrelated development tooling have advisories. Every matrix job would stop before lint, tests, and build; running the same failing registry request on nine matrix legs is also redundant.
  - **Fix:** Keep `pnpm audit --prod` as the blocking shipping gate and remove the full audit from the matrix, or make one dedicated full-tree audit explicitly informational while the accepted dev-only advisories remain.
  - **Cites:** `CODE_REVIEW.md` correctness/configuration · `SECURITY_REVIEW.md` dependency audit and dev-only false positives · `PERFORMANCE_REVIEW.md` repeated network work · plan/worklog audit evidence · caught by code, security, performance, and acceptance lenses
- **[HIGH]** `packages/babel-plugin-loxer-trace/src/transform.ts:14` — Replacing Babel's `FileResult` return annotation with the two-property `LoxerTraceResult` narrows an existing public TypeScript API. Consumers that read runtime fields such as `metadata`, `options`, `ast`, `sourceType`, or `externalDependencies` stop compiling even though Babel still returns them.
  - **Fix:** Preserve the established result surface with Babel-neutral structural fields, or version and document the breaking reduction.
  - **Cites:** `CODE_REVIEW.md` backward-compatibility checklist · caught by code lens
- **[MEDIUM]** `test/decorators.test.ts:214` — The protocol matrix declares `moduleId` expectations but discards them from both projections, and it never uses a visible non-default level. Regressions in `.m(moduleId)` or `.l(level)` could pass.
  - **Fix:** Compare `moduleId` and `level`, configure the test logger with a visible non-default level, and add a non-default-level case.
  - **Cites:** plan's identical-protocol/no-functionality-loss outcome · `src/decorators/AGENTS.md` option invariant · caught by code, acceptance, and test lenses
- **[MEDIUM]** `test/decorators.test.ts:224` — Async rejection parity compares only the two branches with each other and collapses thrown values to messages. Both branches could emit an unwanted error record or replace a rejection with a same-message error while remaining green.
  - **Fix:** Assert an explicit empty error-record list and preserve/assert a sentinel rejection object's identity.
  - **Cites:** plan's unchanged async rejection semantics · `src/decorators/AGENTS.md` promise/rejection invariant · caught by test lens
- **[MEDIUM]** `test/decorators.test.ts:239` — The new call-time naming coverage omits the documented `Class`-suffix shortening invariant.
  - **Fix:** Add a legacy/standard case using a runtime class such as `OrderServiceClass` and assert the shortened `OrderService` prefix.
  - **Cites:** `src/decorators/AGENTS.md` class-name invariant · caught by test lens
- **[MEDIUM]** `test/decorators.test.ts:427` — The parity helper registers production callbacks but clears their arrays before the file-level assertion and never captures them per run, so a standard-path production-output regression could pass.
  - **Fix:** Capture and assert empty production log/error arrays in each protocol result before resetting singleton state.
  - **Cites:** `rules/testing.md` production callback invariant · spec production-output non-regression criterion · caught by test lens

## Rule coverage gaps

- Plugin package public-API compatibility/versioning is not covered by a project rule — surfaced by code.
- Known dev-only advisories, audit exceptions, and ownership of `onlyBuiltDependencies` have no documented security/CI policy — surfaced by code and security.
- CI has no rule against repeating lockfile-only network checks across every compatibility matrix leg — surfaced by performance.
- The three-layer decorator testing policy and complete observable-record parity are not yet documented in `rules/testing.md` — surfaced by test.
- Compatibility tests have no documented rule requiring proof of the actually loaded dependency major — surfaced by test.
