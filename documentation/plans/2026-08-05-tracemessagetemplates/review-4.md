# Review: Trace message templates and colored call payloads — pass 4

> Model/effort: GPT-5/unknown

**Verdict:** PASS
**Scope:** The post-pass-3 documentation, test coverage, built-consumer gate, and callback marker-extraction changes.
**Change scope:** base `HEAD` (`a0096d9`) · paths `documentation/index.md`, `packages/babel-plugin-loxer-trace/AGENTS.md`, `src/core/TraceMessage.ts`, `test/props.test.ts`, `test/trace-message.test.ts`, `test/trace-message-carrier.test.ts`, `test/dist-consumer.test.ts` · current staged, unstaged, and untracked change
**Lenses run:** code ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** simplicity: no still-open finding · security: no still-open finding · perf: pass 3 explicitly deferred its finding, so it is not still-open under the later-pass rubric · a11y: no user-facing UI
**Agents dispatched:** 3

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `CODE-callback-token-remnant-corruption` · Remnant cleanup corrupts valid text and still leaks token IDs

- **Location:** `src/core/TraceMessage.ts:267`
- **Issue:** `incompleteToken` deletes every literal `\uE000` and `\uE001`, although `stringifyMessage` preserves these valid Unicode characters. A callback printer given one therefore loses caller text. The inverse boundary is also incomplete: cutting a printer string from the left inside its nonce can leave a visible nonce suffix because cleanup recognizes prefixes following `\uE000` and the whole ID without it, but not ID suffixes. The nearby comment describes only the narrower both-ends case.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-05-tracemessagetemplates/review-4.md CODE-callback-token-remnant-corruption`
- **Fix:** Replace the remnant heuristic with token framing/parsing that recognizes left- and right-truncated current-invocation tokens without globally deleting caller-owned private-use characters. Add boundary cases for literal PUA content and cuts within the nonce.
- **Cites:** `CODE_REVIEW.md` correctness and contradicting-comment checks · `src/core/AGENTS.md` `stringifyMessage` invariant · spec “Callbacks” criteria · code
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-built-dist-gate-not-enforced` · Built output remains optional

- **Location:** `test/dist-consumer.test.ts:73`
- **Issue:** Every substantive `dist/` check skips when the tree is absent, while the inverse marker test passes. Because `pnpm test` does not build first, the test command can stay green without exercising consumer output. The suite also invokes `__startTrace` directly instead of exercising code emitted by the built Babel transform against the built runtime.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-05-tracemessagetemplates/review-4.md TEST-built-dist-gate-not-enforced`
- **Fix:** Make missing build artifacts fail or wire a build-first consumer-test command into the gate, then exercise output from `packages/babel-plugin-loxer-trace/dist` against root `dist/index.js` and `dist/trace.js`.
- **Cites:** `rules/testing.md` built-tree requirements · plan “Verification” · test
- **Carry-over:** carried over from pass 2's built-tree finding and pass 3's parked testing item; partially addressed, still unresolved

### ◽ LOW · `TEST-table-driven-cases` · Case tables run inside single tests

- **Location:** `test/trace-message.test.ts:204`; `test/dist-consumer.test.ts:166`
- **Issue:** Both additions loop through cases inside one test. A failure stops later rows from running, and the pattern directly contradicts the project's explicit `test.each` rule.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement documentation/plans/2026-08-05-tracemessagetemplates/review-4.md TEST-table-driven-cases`
- **Fix:** Convert the dollar-pattern cases to `test.each`; make token generation deterministic and expose cut positions as independently named cases.
- **Cites:** `rules/testing.md` table-driven-case rule · test
- **Carry-over:** new

### ◽ LOW · `TEST-dist-singleton-reset` · Cached dist singleton is not reset

- **Location:** `test/dist-consumer.test.ts:65`
- **Issue:** `clearRealmSlot('instance')` removes the registry entry but does not reset the already-cached `dist` logger object. The suite therefore does not provide the global-state isolation required for logger tests and can leave cached and realm-resolved instances split.
- **Estimated fix cost:** 🟢 local
- **Route:** specifically requested implementation task for `TEST-dist-singleton-reset`
- **Fix:** Retain the loaded dist entry point and call its exported `resetLoxer()` in `afterEach`; initialize consistently for each test.
- **Cites:** `rules/testing.md` global logger reset rule · test
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (1):** `TEST-dist-singleton-reset` → specifically requested implementation task
- **Implementation pass — 🟡 contained (3):** `CODE-callback-token-remnant-corruption`, `TEST-built-dist-gate-not-enforced`, `TEST-table-driven-cases` → `implement documentation/plans/2026-08-05-tracemessagetemplates/review-4.md <IDs>`
- **Own task — 🔴 redesign (0):** none

## Rule coverage gaps

- No general public-API compatibility/versioning policy — code; unchanged from earlier passes.
- No `FEATURES.md` or use-case-to-test coverage-freshness mechanism — test; unchanged from earlier passes.
- No magic-value, derived-state, or boolean-flag API guidance — simplicity; carried forward, not re-examined this pass.
- No dependency vulnerability-management policy — security; carried forward, not re-examined this pass.
- No secret-handling policy — security; carried forward, not re-examined this pass.

## Notes

- The pass-2/pass-3 HIGH guide finding is resolved. `documentation/index.md` now teaches both callback contexts, `TraceCallPrinter`, fallback behavior, palette assignments, surrounding plain text, and the plain/colored split.
- The stale `parent.functionName` package guidance finding is resolved.
- The rendered `fgClass` assertion and repeatable forged-carrier and `$`-bearing printer tests resolve their parked test findings.
- Pass 3 explicitly disposed the O(tokens × length) item as deferred. The pass-4 cap therefore excluded the performance lens; this pass does not change that disposition.
- Review was static and read-only. No tests or application processes were run.
