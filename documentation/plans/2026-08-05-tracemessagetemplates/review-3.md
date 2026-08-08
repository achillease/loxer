# Review: Trace message templates and colored call payloads (pass 3 — fix verification)

**Verdict:** PASS on the fix diff · **WARN on the change as a whole** (pass 2's documentation HIGH is
parked for the Documentation phase, not resolved — see "Still open")
**Scope:** The six fixes applied to pass 2's findings, reviewed as an unstaged diff on top of the
staged feature: `src/core/TraceMessage.ts`, `src/Loxer.ts`, `src/Helpers.ts`, `src/core/ANSIFormat.ts`,
`src/core/TraceNames.ts`, `src/core/PropsPrinter.ts`.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit skipped: no manifest or lockfile) ·
perf ✓ · acceptance skipped: the fixes change no rendered message and do not touch the spec surface,
so its pass-2 verdict stands unchanged · test skipped: the fixes touch no test file, and its pass-2
findings are parked for the Testing phase · a11y skipped: no user-facing UI

## Findings

**None.** All four lenses reported zero findings at the confidence bar. Each fix was verified against
its specific regression risk rather than accepted on its diff:

| Fix | Verified |
| --- | --- |
| The `$`-substitution bug — a replacement *string* became a replacer *function* in `callbackMarkers().extract` | A replacer function's return is never subject to `$$`/`$&`/`` $` ``/`$'` substitution; the search argument stays a plain string, so exact-match-once is preserved. The only other `.replace` in the function (`incompleteToken`) takes a literal `''`, and its RegExp id is digits + hyphen + base-36 — no metacharacters, no ReDoS. Verified by code and security |
| Reusing `sanitizeControlCharacters`; `escapeControlCharacter` reverted to private | The shared regex is character-for-character identical to the deleted local copy, so nothing that was escaped now passes through. The sweep still runs over the whole callback string *before* any opaque token is promoted, so a hand-written ``–`` sentinel stays inert. ``/`` sit outside both escaped ranges, so the printer tokens still survive. `escapeControlCharacter` has exactly one consumer file left. Verified by code, security and simplicity |
| The `sanitize` forwarder deleted | Both sites call `stringifyMessage` directly — the forwarder's own body. `parentNameResolver`'s `??=` still memoizes an empty-string parent (`''` is not nullish), so a parent that resolves to `''` is still discovered at most once, exactly as before |
| One-pass carrier read in `outputMessage` | `traceMessageData` now runs once instead of twice, removing a second full sanitize pass and a second span-validation loop from the written path. The hidden-log early return still short-circuits *before* any of that work; the non-trace fallback is still `stringifyMessage`; `messageText` survives for its one `LoxerError` caller; no dangling `{@link}` and no unused import remain. The forged-carrier validation is still reached on every written log |
| The `ANSIFormat` JSDoc block moved above `colorMessageSpans` | Comment-only; `colorSpan` kept its own one-liner; no text altered in the move |
| Two stale `'parent.functionName'` comments corrected | Accurate; the literal now appears nowhere under `src/` |

No new one-caller wrapper, dead code, half-deletion or contradicting comment was introduced. The only
per-call cost delta is one closure allocation per issued token on the opt-in callback path — a rounding
error inside the parked quadratic scan it sits in, and the scan's complexity is unchanged.

## Gates

`pnpm lint` (only the pre-existing `src/core/Modules.ts:87` newline warning), `pnpm build`, `pnpm test`
(**552/552**, unchanged from the pre-fix baseline), `pnpm typecheck:test` and `pnpm typecheck:types` all
exit 0.

The `$` fix was additionally driven against the **rebuilt `dist/core/TraceMessage.js`**, since no
automated test covers `$`-bearing content: `$$`, `$&`, `$'`, `` $` ``, `$1` and `a$$b` each survive
verbatim with a correct `value` span and no opaque-token leakage; the spec's template table still
renders as specified; and a callback emitting a raw marker plus a literal ESC is still inert with zero
spans. This also gives the built-tree surface one fresh exercise, which pass 2 noted had gone stale.

## Still open (parked by lane, not resolved)

Carried forward from pass 2 unchanged. None of these were re-attempted here — each belongs to a phase
that owns it:

- **[HIGH] Documentation phase** — `documentation/index.md:24-187` does not teach the callback context
  object, `TraceCallPrinter`, or the colored-message behaviour. This is the one finding still gating the
  change's verdict at WARN. Editing the authored guide is the Documentation phase's job.
- **[MEDIUM] Documentation phase** — `packages/babel-plugin-loxer-trace/AGENTS.md:20` still names the
  removed `'parent.functionName'` literal.
- **[MEDIUM] Testing phase** — `test/props.test.ts:540-566`'s `fgClass` cases assert a spy call rather
  than the rendered teal escape.
- **[MEDIUM] Testing phase** — no test pins the forged-carrier path, nor `$`-bearing printer content
  (the latter now has only the scratch-script evidence above, no repeatable gate).
- **[MEDIUM] Testing phase** — no automated gate exercises the built `dist/` tree; every suite imports
  `../src`.
- **[MEDIUM] deferred** — the O(tokens × length) scan in `callbackMarkers().extract`. Non-gating, on the
  opt-in callback path, and a proper fix needs a redesign that would change the exact-match integrity
  property the current code deliberately relies on. Worth doing as its own task, not as a review fix.

## Rule coverage gaps

Unchanged from pass 2, none closed (they are the Documentation phase's to close): no `FEATURES.md` or
use-case↔test link mechanism; no public-API compatibility/versioning policy; no magic-value / derived-state
/ boolean-flag API guidance; no dependency vulnerability-management policy; no secret-handling policy.
