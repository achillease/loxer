# Review: Trace message templates and colored call payloads (pass 2)

**Verdict:** WARN
**Scope:** The shared trace renderer (`src/core/TraceMessage.ts`, new), both trace runtimes
(`src/trace.ts`, `src/decorators/trace.ts`), the public tracing types, the message/span channel
(`src/Loxer.ts`, `src/loxes/Lox.ts`, `src/core/ANSIFormat.ts`, `src/core/PropsPrinter.ts`,
`src/Helpers.ts`, `src/core/OutputStreams.ts`), the transform package's style literals, the demo app,
the authored guide, the regenerated `docs/` tree, and the new/updated suites under `test/`.
**Lenses run:** code ✓ · simplicity ✓ · security ✓ (dep-audit skipped: no manifest or lockfile in the
diff) · perf ✓ · a11y skipped: no user-facing UI — the Vite demo is a dev harness, not product UI ·
acceptance ✓ · test ✓

## Pass-1 findings re-verified

`review.md` was written at 01:08; `src/` was edited afterwards (`Loxer.ts` 01:38,
`TraceMessage.ts` 02:32) along with the spec, the guide, `docs/` and `test/types/registry.test-d.ts`.
Every pass-1 finding was re-checked against current code by the lens that owns it:

| Pass-1 finding | Status now | Evidence |
| --- | --- | --- |
| **[HIGH]** default `openMessage` is `'parent.fn'` but the spec says `'fn'` | **resolved** (spec corrected, not the code) | Spec:55 now states `'parent.fn'`/`'fn'`; `DEFAULT_OPEN_MESSAGE` (`TraceMessage.ts:210`), JSDoc (`tracing-types.ts:51,98`), guide (`documentation/index.md:136,138`) and the shared table (`trace-message-cases.ts:45-53`) all agree — verified independently by code, acceptance and test |
| **[HIGH]** the `Symbol.for` carrier brand is forgeable | **resolved** | `traceMessageData` (`Loxer.ts:37-69`) re-sanitizes `text` unconditionally and validates every span (integer, monotonic non-overlapping, in-bounds, `kind` whitelisted), dropping to `spans: []` on any violation. Confirmed by code **and** security that a forged brand grants nothing a plain `Loxer.log('<escapes>')` does not — both paths land on identically sanitized text |
| **[HIGH]** the guide documents removed literals; no guide/TypeDoc update | **partially resolved → re-raised narrower** (finding 1 below) | Stale literals gone (the single `functionName` hit, `documentation/index.md:960`, is legitimate migration-appendix content per `rules/documentation.md`); `docs/` regenerated with the three new pages. But the guide still does not teach the callback context, `TraceCallPrinter`, or the coloring |
| **[MEDIUM]** callback text can inject the internal marker characters | **resolved** | `callbackMarkers().extract` sweeps `CONTROL_CHARACTERS` over the whole callback string *before* promoting its own opaque `\uE000`/`\uE001` tokens, so a hand-written `\u0011` is inert. Pinned by `test/trace-message.test.ts:119-127` |
| **[MEDIUM]** `fgClass` lacks colored `PropsPrinter` assertions | **partially resolved → re-raised weaker-assertion form** (finding 9) | The cases exist (`test/props.test.ts:540-566`) but assert a spy call, not the rendered escape |
| **[MEDIUM]** `registry.test-d.ts` does not pin `TraceCallPrinter` from both entry points | **resolved** | `test/types/registry.test-d.ts:37-49` imports and cross-assigns the printer and both context types from `loxer` *and* `loxer/trace`; `pnpm typecheck:types` passes |

## Findings (by severity)

- **[HIGH]** `documentation/index.md:24-187` — The "Plain-function tracing" teaching section documents
  the template literal set and the `parent.` naming rule, but never explains the callback **context
  object**, **`TraceCallPrinter`**, or the **colored-message** behaviour that the spec's "Colored
  message" and "Callbacks" acceptance groups add as user-facing behaviour. `fn`/`parentFn` appear only
  inside one code example (`:153-155`) with no prose saying what they are, that empty/absent content
  prints empty parentheses, that `content` is rendered by the log-message rule, or that a printer's
  output is coloured while text a callback writes around it stays plain.
  - **Fix:** Add a short paragraph beside the existing `parentFn` example naming `fn`/`parentFn` as
    `TraceCallPrinter`s that render the traced call exactly as a template does, plus a sentence that
    the payload, the function name and the parent are coloured in the props printer's palette
    (`fgString` / `fgFunction` / `fgClass`). This closes the DoD item "the tracing sections of
    `documentation/index.md` are updated" for the two groups it currently omits.
  - **Cites:** spec Definition of Done · spec acceptance groups "Colored message" and "Callbacks" ·
    caught by acceptance

- **[MEDIUM]** `src/core/TraceMessage.ts:246-254` — `callbackMarkers().extract` promotes its opaque
  tokens with `marked.replace(searchString, replacementString)`, and a **replacement string** is
  subject to `$`-pattern substitution even when the search argument is a plain string. Caller content
  reaching a printer therefore corrupts the message: `$$` collapses to `$`; `` $` `` and `$'` splice an
  arbitrary preceding/following slice of the same message into the span; and `$&` **leaks the internal
  opaque token id** (`id:1:start$&id:1:end`) into the rendered output — breaking the invariant the
  code's own comment at `:248-249` asserts. No escape sequence survives (the control-character sweep
  already ran), so this is content corruption and internal-token leakage, not escape injection. No test
  covers `$`-bearing content.
  - **Fix:** Pass a **replacer function** — `marked.replace(search, () => MARK_START[kind] + text +
    MARK_END)` — which is not subject to `$` substitution; or escape `$` → `$$` in the replacement.
  - **Cites:** SECURITY_REVIEW.md injection/log-injection · CODE_REVIEW.md correctness · the code's own
    documented callback-isolation invariant · caught by security

- **[MEDIUM]** `src/Loxer.ts:308` — `outputMessage` calls `traceMessageData` **twice** per written log
  (`messageText(message)` and `messageSpans(message)` each invoke it independently), redoing a full
  `sanitizeControlCharacters` regex pass over the whole message plus the per-span validation loop. Paid
  on the path that actually gets written, for every traced open/close/add.
  - **Fix:** Compute `const data = traceMessageData(message)` once and derive both fields from it.
  - **Cites:** PERFORMANCE_REVIEW.md §Algorithmic & memory (redundant hot-path work) · caught by perf

- **[MEDIUM]** `src/core/TraceMessage.ts:75,246` vs `src/Helpers.ts:37,46-53,63-65` — `TraceMessage.ts`
  re-declares a `CONTROL_CHARACTERS` regex bit-for-bit identical to `Helpers.ts`'s and inlines
  `text.replace(CONTROL_CHARACTERS, escapeControlCharacter)` — exactly the body of the already-exported
  `sanitizeControlCharacters`, which both trace runtimes already import in this same diff.
  `escapeControlCharacter` was widened from private to `export` solely to support the rebuild, and the
  justifying comment (`Helpers.ts:48-49`, "keeps its two private markers out of the range it escapes")
  is factually wrong: `MARK_START`/`MARK_END` (`\u0011`-`\u0014`) sit **inside** `\u0000-\u001F`, which
  both regexes cover identically. The markers survive only because sanitization runs before they are
  inserted.
  - **Fix:** Call `sanitizeControlCharacters(text)` at `:246`, drop the local constant and the
    `escapeControlCharacter` import, revert `escapeControlCharacter` to private, and delete the
    incorrect rationale.
  - **Cites:** SIMPLICITY_REVIEW.md "Reuse before invention" · AGENTS.md two-consumer extraction rule ·
    caught by simplicity

- **[MEDIUM]** `src/core/TraceMessage.ts:88-90` — `sanitize(value)` is a pure one-line forward to
  `stringifyMessage(value)` adding no behaviour, at 2 call sites in the same file. `src/core/AGENTS.md`
  documents only two rules for this area (`stringifyMessage` and its sibling `renderValue`) and does not
  ask for a third alias.
  - **Fix:** Call `stringifyMessage` directly at both sites and delete `sanitize`.
  - **Cites:** SIMPLICITY_REVIEW.md "Indirection cost" · `src/core/AGENTS.md` · caught by simplicity

- **[MEDIUM]** `src/core/ANSIFormat.ts:150-172` — The 15-line JSDoc block describes
  `colorMessageSpans` (the enclosing-prefix re-emission and the out-of-range guard it documents live
  there) but sits above `colorSpan`, which already carries its own one-line doc directly beneath it.
  `colorMessageSpans` — the newly introduced, more complex function — has no doc comment at all.
  - **Fix:** Move the long block down to sit directly above `colorMessageSpans`.
  - **Cites:** SIMPLICITY_REVIEW.md "Readability" · caught by simplicity

- **[MEDIUM]** `src/core/TraceNames.ts:2`, `src/core/PropsPrinter.ts:88` — Both JSDoc comments still
  name `'parent.functionName'`, a literal this change removed outright. `qualifiedFunctionName`'s own
  doc names an API that no longer exists, and it is the function `markedQualifiedName` calls directly.
  - **Fix:** Say "the `parent.` message templates", matching the phrasing already used in
    `src/core/AGENTS.md` and in this diff's own `marker-collection.ts` doc update.
  - **Cites:** `rules/documentation.md` (keep JSDoc aligned with behaviour) · CODE_REVIEW.md · caught
    by code

- **[MEDIUM]** `packages/babel-plugin-loxer-trace/AGENTS.md:20` — Still states "the runtime renders
  `'parent.functionName'` from it", the removed literal, in a package whose `src/marker-collection.ts`
  and `README.md` were both correctly updated in this same change.
  - **Fix:** Name the `parent.` template family instead.
  - **Cites:** `rules/documentation.md` · caught by code

- **[MEDIUM]** `test/props.test.ts:540-566` — The two new `fgClass` cases assert only
  `toHaveBeenCalledWith` on a `vi.spyOn(ANSIFormat, 'fgClass')`, never that the rendered output
  contains the teal escape — the "asserting a mock was called instead of a real outcome" smell. A bug
  in `fgClass` or in how `PropsPrinter` consumes its return would pass. (`test/trace-message-console.test.ts`
  asserts the literal escape for the same palette entry on the trace side. An existing `fgNumber` test
  at `:743-750` shares the weak pattern, so this is inherited, not novel.)
  - **Fix:** Also assert the rendered string carries the teal sequence around the class name.
  - **Cites:** `src/core/AGENTS.md` palette-sharing invariant · test-smell checklist · caught by test

- **[MEDIUM]** `src/core/TraceMessage.ts:35,51-57` — No test exercises a hand-crafted object carrying
  `Symbol.for('loxer.traceMessage.3')` as a public log's `message`. The validation `traceMessageData`
  performs is exactly what closed pass-1's HIGH, yet nothing pins it, so a regression that restored
  blind trust in the brand would pass. This is the only edge path from the checklist with zero coverage.
  - **Fix:** Add a forged-carrier case asserting the text is sanitized and the hostile spans are
    dropped.
  - **Cites:** spec "Escape-free plain form" · test-smell checklist (missing edge coverage) · caught by
    test

- **[MEDIUM]** `rules/testing.md` (built-trees rule) — The last counted run against the built `dist/`
  tree predates the `fgClass` palette entry (worklog `23:10` reports 37 checks; `fgClass` landed at
  `23:26` and was only eyeballed in a terminal), and the Testing phase explicitly declined to re-run it.
  Every automated test imports `../src`, never `dist/`, so the newest piece of the consumer-observable
  surface has no repeatable gate.
  - **Fix:** Re-run the built-tree check against the current `dist/` and record it, or document the
    absence of regression protection for that surface.
  - **Cites:** `rules/testing.md` "Exercise a change to what a consumer executes…" (both Always
    bullets) · caught by test

- **[MEDIUM]** `src/core/TraceMessage.ts:245-260` — `extract` runs one full-string `.replace()` per
  issued token over an accumulating string, so a callback that calls a printer N times while composing
  (`items.map((i) => fn(i.name)).join(', ')`) costs O(N) full scans of a string whose length grows with
  N — quadratic in printer invocations for one call. Confined to the opt-in callback style, so capped
  at MEDIUM.
  - **Fix:** Track each token's position while composing, or consume tokens in a single scan, instead of
    re-scanning per token.
  - **Cites:** PERFORMANCE_REVIEW.md §Algorithmic & memory (quadratic string building) · caught by perf

## Rule coverage gaps

- No `FEATURES.md` or use-case↔test link mechanism exists anywhere in the repo (checked by name and by
  content pattern) — the project has no coverage-freshness artifact to check against. The absence
  itself is the gap — surfaced by test.
- Pass-1's four gaps stand unchanged, none closed by this pass: public-API compatibility/versioning
  policy (code), magic values / derived state / boolean-flag API guidance (simplicity), dependency
  vulnerability-management policy (security), secret-handling policy (security).

## Notes

- **The change's core premise verified, not assumed.** Both runtimes' local `getOpenMessage` /
  `getCloseMessage` / `ensureMessage` copies and both `needsParentName` gates were deleted outright; no
  residual copy of the template logic remains in either runtime. Every new helper in `TraceMessage.ts`
  and every new prefix-only variant in `ANSIFormat.ts` passed the two-consumer test by grep count. The
  dual marking mechanism (control-character sentinels for templates, private-use tokens for callbacks)
  is justified, not accidental: a callback's own composed text must be sanitized *after* composition,
  and raw sentinels would not survive that sweep.
- **The spec's Cost criteria hold in code.** `printers()` builds closures only and never resolves the
  parent while constructing a callback's context object; `parentNameResolver` memoizes; `callbackMarkers()`
  (Map + RegExp + `Math.random()`) is gated behind `typeof style === 'function'` so a string template
  never pays for it; `colorMessageSpans` short-circuits on zero spans.
- **A documented, accepted base cost, not a new defect.** Rendering runs on every traced call ahead of
  the level check, so a default-configured open resolves its parent even for a log the threshold
  discards. Root `AGENTS.md` names and defends exactly this tradeoff; the spec's laziness criteria are
  scoped to the *optional* sub-costs, which hold.
- **Below the confidence bar, recorded for follow-up:** a callback nesting one printer's return value as
  another printer's `content` (`fn(parentFn('x'))`) silently drops the *outer* `value` span — the exact-match
  token conversion goes stale once the inner tokens convert first. It degrades to "the wrapper stays
  uncoloured" rather than corruption, and `colorMessageSpans` has no nested-span support regardless, so
  it is out of the spec's documented scope. Worth a test if nested composition is ever meant to be
  supported.
- **Cosmetic, not graded:** three test files carry an accidental leading UTF-8 BOM
  (`test/decorators.test.ts`, `test/plain-function-trace-core.test.ts`, `test/trace-cases.ts`), harmless
  to Vitest and tsc; and two test titles/comments still say `parent.functionName`
  (`test/plain-function-trace-inline.test.ts:94`, `test/plain-function-trace.fixture.ts:93`).
- **Worklog under-reports this session.** Several `src/` and doc files carry `02:2x`–`02:32` mtimes with
  no worklog row recording the edit or that the gates were re-run afterwards. The gates do pass against
  the current tree (independently re-run by the acceptance lens: lint with only the pre-existing
  `Modules.ts` warning, build, 552/552 tests, `typecheck:test`, `typecheck:types`). Not a spec/DoD item,
  so not a formal finding.
