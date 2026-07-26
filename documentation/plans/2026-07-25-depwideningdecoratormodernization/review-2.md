# Review: dependency widening and decorator modernization — pass 2

**Verdict:** PASS
**Scope:** Updated workstreams T/A/B across manifests, lockfile, CI, Babel/Vite plugins, decorators, and compatibility/protocol tests
**Lenses run:** code ✓ · security ✓ · perf ✓ · a11y skipped: library-only/no UI · acceptance ✓ · test ✓

## Findings (by severity)

- **[LOW]** `packages/babel-plugin-loxer-trace/src/types.ts:21` — Restoring the previously exported Babel result surface requires a small Babel-neutral `any` boundary for metadata, options, AST, and source-map values. This is intentional for source compatibility but falls outside the coding rule's currently documented logger-only exception.
  - **Fix:** During Documentation, record this narrow public-compatibility exception beside the explicit-`any` rule; keep the boundary confined to `LoxerTraceResult`.
  - **Cites:** `rules/coding-conventions.md` explicit-`any` restriction · `CODE_REVIEW.md` conventions and backward compatibility · caught by code lens

## Rule coverage gaps

- Plugin package public-API compatibility/versioning is not covered by a project rule — surfaced by code.
- Known dev-only advisories, audit exceptions, EOL compatibility fixtures, and ownership of `onlyBuiltDependencies` have no documented security/CI policy — surfaced by code and security.
- Performance rules do not cover redundant hot-path work or repeated lockfile-only network checks across CI matrix legs — surfaced by performance.
- `rules/testing.md` does not yet preserve the three-layer decorator strategy or require complete observable-record parity — surfaced by test.
- Compatibility-test rules do not require proof of the actually loaded dependency major — surfaced by test.
