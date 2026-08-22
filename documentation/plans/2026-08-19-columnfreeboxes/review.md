# Review: Column-free boxes and the default console output — pass 1

**Verdict:** WARN
**Scope:** the `nc`/`noColumn` modifier across the `Loxer` chain, the box layout, the Babel marker
mirror, and the built-in development console's highlight rendering and level routing
**Change scope:** base `HEAD` · paths `src/Loxer.ts`, `src/loxes/Lox.ts`, `src/types.ts`,
`src/trace.ts`, `src/tracing/types.ts`, `src/core/runtime/Loxes.ts`,
`src/core/output/{BoxFactory,ANSIFormat,OutputRenderer,OutputStreams}.ts`,
`packages/babel-plugin-loxer-trace/src/marker-collection.ts` · current change (dirty working tree)
**Lenses run:** code ✓ · simplicity ✓ · perf ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** a11y: no user-facing UI in this package · security: no auth, injection,
secret, or serialization surface touched, and no dependency or lockfile change
**Agents dispatched:** 5

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-highlight-still-on-message` · The highlight was added to the module column but never removed from the message

- **Location:** `src/core/output/ANSIFormat.ts:214-218`
- **Issue:** Stream 8 was supposed to move the highlight off the message and onto the module column.
  Only the second half landed. The message prefix chain still starts with
  `if (lox.highlighted) { prefix = this.highlightPrefix(...) }`, so a highlighted log carries the grey
  background on **both** the module column and the whole message. Worse, that arm shadows the
  `else if (lox.type === 'close')` beneath it, so **a highlighted close line loses its green
  entirely** — `closeLogPrefix()` is unreachable when `highlighted` is true. That path is publicly
  reachable: `src/trace.ts:353` calls `Loxer.h(isHighlighted(options.highlight, 'close')).of(id)`.
  The whole premise of the spec's second half — severity keeps the message, highlighting keeps the
  module column — holds only for `warn` and `error`, and only by accident of the level overwrite two
  lines further down. Verified by reading the file directly, not inferred.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-highlight-still-on-message`
- **Fix:** Delete the `if (lox.highlighted)` arm from the message prefix chain so it starts at
  `if (lox.type === 'close')`. The module-column wrap at `:237-241` already carries the highlight.
  Then settle the module-less case: after the fix, a log with no module (including `init()`'s own
  highlighted "Loxer initialized" line) shows no mark at all, which is the spec's fourth open
  question — the leftover message highlight is currently masking it.
- **Cites:** spec acceptance criteria "its message carries no highlight" and "a close its green, each
  beside a marked module column"; plan Stream 8; worklog 2026-08-20 00:20 · code, acceptance, test
- **Carry-over:** new

### 🔶 HIGH · `CODE-props-indentation-off-by-level-indent` · The new two-space level prefix is not in `getPropsIndentation`, so rendered props misalign on every non-`warn` row

- **Location:** `src/core/output/OutputStreams.ts:21-23,51-55`
- **Issue:** `devLogOut` now prints `${levelIndentation}${lox.time} ${lox.module}…`, so an `info` or
  `debug` row has 11 columns before the module text while `getPropsIndentation` still returns
  `TIMESTAMP_INDENTATION + slicedName.length` (9 + n). Rendered props hang from that number, so on
  every non-`warn` row the props tree sits two columns left of the column it should branch from.
  `devErrorOut` adds no prefix and stays aligned, so exactly one of the two console lines drifted —
  the failure mode `src/core/AGENTS.md` names verbatim. The spec's in-scope bullet is "the alignment
  padding that keeps the timestamp column stable"; the padding reached the first line only.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `CODE-props-indentation-off-by-level-indent`
- **Fix:** Make the indentation one value: compute `levelIndentation` first, then pass
  `getPropsIndentation(outputLox) + levelIndentation.length` to `ColoredOutputLoxRenderer`, or hoist
  the prefix into a helper both the line and the props indentation read.
- **Cites:** `src/core/AGENTS.md` — "`OutputStreams`'s props indentation must equal the width of what
  its console line prints before the module text … a separator changed on one line alone silently
  misaligns that line's props"; spec criterion H-5 · code, simplicity, acceptance
- **Carry-over:** new

### 🔶 HIGH · `PERF-getopenloxes-unbounded-scan` · `getOpenLoxes()` now scans the whole lifetime id map instead of the bounded open-box buffer

- **Location:** `src/core/runtime/Loxes.ts:102-106`, called from `src/Loxer.ts:591,597`
- **Issue:** The rewrite from `filterDef(this._openLogBuffer).map(...)` to
  `Object.values(this._loxes).filter(...)` changes the cost from *O(currently open boxes)* to *O(every
  log id the instance ever issued*). `removeCorrespondingOpenLox` closes a box by writing
  `this._loxes[lox.id] = undefined` — the key stays — while `_openLogBuffer` is actively trimmed and
  bounded by peak concurrency. Two arrays sized by total lifetime box count are allocated on every
  `ErrorLox` construction, so for a long-lived singleton (the library's stated shape) the cumulative
  cost of errors becomes quadratic in total log volume. The plan verifies the rewrite is
  *correctness*-equivalent but never addresses the complexity change.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `PERF-getopenloxes-unbounded-scan`
- **Fix:** Simplest: `delete this._loxes[lox.id]` in `removeCorrespondingOpenLox` instead of assigning
  `undefined`. Nothing depends on the key's presence — `findOpenLox` reads `this._loxes[id]` and gets
  `undefined` either way, and `filterDef` drops absent entries — so the map then holds only genuinely
  open boxes, and both the ordering claim and the hidden filter survive. If the tombstone is
  load-bearing for a reason not recorded, keep a separate id set of open boxes instead of scanning.
- **Cites:** PERFORMANCE_REVIEW "unbounded allocations with no cap"; CODE_REVIEW "resource leaks";
  `src/core/AGENTS.md` bounds the pending queue but not this map · perf, code
- **Carry-over:** new

### 🔶 HIGH · `CODE-endtitleopacity-default-changed` · `endTitleOpacity` default moved `0` → `0.4` outside the spec, against the recorded disposition, and with its JSDoc left saying `0`

- **Location:** `src/core/output/OutputRenderer.ts:71`; stale doc at `src/types.ts:264-265`
- **Issue:** `OutputRenderer.ts` appears in no stream of the plan and no in-scope bullet of the spec.
  The spec lists this exact subject as an **open question** ("Whether `endTitleOpacity` should stop
  applying to a *highlighted* close line"), and the worklog says the effect was "recorded as spec open
  questions rather than fixed". The code contradicts that, and resolves the question wider than it was
  asked: the default now changes every close line's module text in every colored destination, whether
  highlighted or not. `ColoredOutputLoxRenderer` is exported public surface, `endTitleOpacity` is
  public option surface, and `src/types.ts:265` still publishes "Defaults to `0`" — which TypeDoc will
  render as false. No test exercises a close-type lox with the default omitted, so nothing pins either
  value.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `CODE-endtitleopacity-default-changed`. Keeping `0.4`
  instead requires a spec amendment first — that part is Planning's, not an implement pass's.
- **Fix:** Revert to `?? 0` and address black-on-grey by scoping it to the highlighted case, which is
  what the open question actually asks. If `0.4` stays, update the `src/types.ts:265` JSDoc, record the
  decision in the worklog, and regenerate `docs/` in the same change.
- **Cites:** spec Open questions and second-half "In scope"; criterion H-6; worklog 2026-08-20 00:20;
  `rules/documentation.md` JSDoc-alignment rule · acceptance, code, test
- **Carry-over:** new

### 🔶 HIGH · `TEST-columnfree-zero-coverage` · The entire column-free feature and both Stream 8 behaviors have no test anywhere

- **Location:** `test/boxed.test.ts`, `test/unboxed.test.ts`, `test/format.test.ts`,
  `test/plain-function-trace-core.test.ts`, `test/trace-point.test.ts`, `test/types/registry.test-d.ts`
  (all unchanged)
- **Issue:** `grep -rn "columnFree|noColumn|\.nc\("` across `test/` returns zero matches. Every item
  the spec's definition of done names is absent: no column-free open/close/member/nested-inside/
  hidden-wins/mixed case in `test/boxed.test.ts`; no `resetState` leak test for `_columnFree`; no
  `lox.columnFree` propagation assertion on any of the seven `.of(id)` entry points; no `nc`/`noColumn`
  rows in the marker-collection diagnostic tables; no `@ts-expect-error` double-chain pin; no
  highlight-on-module-field or console-method-per-level pin. This matters more than a normal coverage
  gap for two reasons the plan itself supplies: its **top risk** is that a missed `columnFree`
  propagation renders byte-identical output, so hand verification cannot substitute for a suite; and
  `CODE-highlight-still-on-message` above is exactly the defect the missing definition-of-done item 9
  would have caught.
- **Estimated fix cost:** 🟡 contained
- **Route:** `write-tests` (Testing phase, plan Stream 6 + the Stream 8 test list) — not this pass
- **Fix:** Follow the plan's Stream 6 list line for line, driven by `test.each` per `rules/testing.md`.
  Prioritize the propagation assertions on every `.of(id)` entry point, since nothing else can catch a
  missed one.
- **Cites:** spec definition of done items 3, 4, 9, 10; plan Stream 6 and "Risks & open questions";
  `rules/testing.md` · test, acceptance
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-error-level-log-double-indented` · An error-level *ordinary* log gets both the console icon and the two-space pad

- **Location:** `src/core/output/OutputStreams.ts:52`
- **Issue:** `outputLox.level === 'warn' ? '' : '  '` assumes only `warn` reaches `devLogOut` with an
  icon-bearing method. `switchOutput` routes by `lox.type === 'error'`, not by level (verified at
  `src/Loxer.ts:561`), so an ordinary log carrying `level: 'error'` — `trace.error(...)` opening a
  box and its inherited `add`/`close`, or `trace.point.error(...)` — reaches `devLogOut`, is dispatched
  to `console.error`, **and** gets padded. Chromium already shifts that row two columns for the icon,
  so it ends up two further right, defeating the alignment the change exists for. `devErrorOut`
  correctly pads nothing, so the two error paths disagree.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-error-level-log-double-indented`
- **Fix:** `outputLox.level === 'warn' || outputLox.level === 'error' ? '' : '  '`, or derive it from
  one shared "does this console method draw an icon" predicate that both `devLogOut` and `devErrorOut`
  read.
- **Cites:** spec criterion H-5 · code, acceptance
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-node-stderr-routing` · Level-named console methods silently move ordinary `warn` logs to stderr on Node

- **Location:** `src/core/output/OutputStreams.ts:53`
- **Issue:** The design reasons entirely about Chromium devtools. On Node, `console.warn` is an alias
  of `console.error` and writes to **stderr**, so an ordinary log — which `AGENTS.md` is explicit is
  not an error — leaves the stream it has always used. A Node consumer of the built-in output that
  pipes stdout to a file or collector loses every `warn` row. Neither the spec's in/out-of-scope lists
  nor the guides mention the stream split. Related: the spec's own padding rule *misaligns* a terminal,
  where `warn`/`error` print no icon, so `warn` rows start at column 0 and `info`/`debug` at column 2.
  The spec settles that tradeoff, so it is not a defect — but it is undocumented.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `CODE-node-stderr-routing` for the documentation of the
  consequence. Reconsidering the routing itself is a re-plan.
- **Fix:** State the stream consequence where a Node reader meets the built-in output, so a consumer
  knows to register an `output` callback if it needs one stream. Routing only `'error'` to
  `console.error` would preserve stdout but give up the devtools level filter the change exists for —
  a Planning call, not an implement one.
- **Cites:** `AGENTS.md` level-routing contract; CODE_REVIEW "changed default behaviour callers depend
  on" · code
- **Carry-over:** new

### 🔷 MEDIUM · `CODE-highlightcolor-jsdoc-stale` · `LoxerColorOptions.highlightColor` JSDoc describes both the old target and the old default

- **Location:** `src/types.ts:250-251`
- **Issue:** "Background color for highlighted ordinary log **messages**. Omit it to **invert
  foreground/background**." Both halves are wrong after this change: the highlight marks the module
  column, and omitting the option yields grey `rgb(70, 70, 70)`, not inversion. `src/types.ts` is in
  the diff and is public API surface TypeDoc publishes.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-highlightcolor-jsdoc-stale`, folded into the
  Documentation phase's `pnpm run docs` step
- **Fix:** "Background color for the module column of a highlighted log. Defaults to grey
  `rgb(70, 70, 70)`." — current design, no diff narration.
- **Cites:** spec criterion H-2; `rules/documentation.md` JSDoc-alignment rule · code, acceptance
- **Carry-over:** new

### 🔷 MEDIUM · `SIMP-modtext-reimplements-colorhighlight` · The module-text highlight re-implements `colorHighlight` instead of calling it

- **Location:** `src/core/output/ANSIFormat.ts:237-241`
- **Issue:** The new wrap writes `this.highlightPrefix(...) + moduleText + this.CODE.Reset` by hand.
  That is exactly the body of `ANSIFormat.colorHighlight(text, color)` at `ANSIFormat.ts:59-61`, in
  the same class, already reused at `PropsPrinter.ts:584`.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `SIMP-modtext-reimplements-colorhighlight`
- **Fix:** `moduleText = this.colorHighlight(moduleText, options.colors?.highlightColor);` inside the
  existing `if (lox.highlighted)`.
- **Cites:** SIMPLICITY_REVIEW "Reuse before invention — the equivalent already exists" · simplicity
- **Carry-over:** new

### 🔷 MEDIUM · `SIMP-errorlox-columnfree-relookup` · `toErrorLox` re-resolves an `openLox` that `of()` already held

- **Location:** `src/Loxer.ts:591` vs `src/Loxer.ts:452,512-517,529`
- **Issue:** `of()` resolves `openLox` once at `:452`, and its `error`/`namedError` closures already
  close over it. `appendToOpenLox` inherits `columnFree` the cheap way, by destructuring that same
  lox. `toErrorLox` instead performs a second independent `findOpenLox(lox.id)` to re-derive the same
  value for the same purpose, because `internalError`'s signature never carries it. This is the
  two-independent-paths-one-semantic-rule case `AGENTS.md` names; `moduleId` is already threaded
  through `internalError`, so the precedent exists. The perf lens separately judged the added lookup
  immaterial on the error path — this is a shape finding, not a cost one.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `SIMP-errorlox-columnfree-relookup`
- **Fix:** Add a `columnFree` parameter to `internalError` (default `false`), pass `openLox.columnFree`
  from the two `of()` closures that already hold it, and drop the `findOpenLox` call in `toErrorLox`.
- **Cites:** `AGENTS.md` — "Extract a shared internal helper when two independent runtime paths need
  the same semantic rule or gate." · simplicity
- **Carry-over:** new

### 🔷 MEDIUM · `ACC-gates-red` · `pnpm test` is red in the reviewed tree, and rewriting the failures mechanically would cement `CODE-highlight-still-on-message`

- **Location:** worklog 2026-08-20 00:20 final row; behaviors at `src/core/output/ANSIFormat.ts:75,214,237-241`
  and `src/core/output/OutputStreams.ts:35,53`
- **Issue:** Definition-of-done item 2 requires `pnpm lint`, `pnpm test`, `pnpm build` and
  `pnpm typecheck:test` to all exit 0. The worklog records 554 passed / 8 failed for Stream 8, with only
  `build` and `lint` green, and `typecheck:test` last run after Stream 5. The item is unmet. The
  important part is that the worklog's classification — "all expectation drift … no product defect
  among them" — does not hold for all eight: the `test/format.test.ts` assertions that the highlight
  lands on `colorLox(...).message` are **satisfiable under the defect**, so rewriting them against
  current output would pin the bug rather than the spec. Read-only: the gates were not re-run here.
- **Estimated fix cost:** 🟡 contained
- **Route:** `write-tests` (Testing phase), **after** `CODE-highlight-still-on-message` lands
- **Fix:** Fix the product defect first, then rewrite the expectations against the corrected behavior
  and the acceptance criteria — not against what the tree currently prints. Re-run all five gates the
  plan lists, `pnpm typecheck:types` included.
- **Cites:** spec definition of done item 2; plan Verification · acceptance, test
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-built-tree-gate-not-durable` · The required built-`dist/` verification exists only as a throwaway script, and the devtools check is still open

- **Location:** `test/dist-consumer.test.ts` (unchanged); worklog rows for both `dist/` verifications
- **Issue:** Definition-of-done items 5 and 11 name a concrete repeatable artifact. The worklog resolves
  the plan's open question by using scratchpad scripts instead and changing no `playground/` file, so
  nothing in the repo re-checks `columnFree` propagation, the module-highlight wrap, or the level-routed
  console methods against the built tree on the next change — even though `test/dist-consumer.test.ts`
  is already the committed home for exactly this pattern. The worklog also states the highlight was
  "not yet checked in a devtools console, which is the destination the change exists for" — the one
  environment the second half of the spec exists to serve.
- **Estimated fix cost:** 🟡 contained
- **Route:** `write-tests` (Testing phase); the devtools check finishes through `pnpm demo`
- **Fix:** Extend `test/dist-consumer.test.ts` with an `nc()`/`columnFree` case and a
  highlight/console-routing case, mirroring the existing suite. Then confirm the highlight in a Chromium
  devtools console per `rules/testing.md`.
- **Cites:** `rules/testing.md` built-tree and consumer-app rules; spec definition of done items 5, 11 ·
  test, acceptance
- **Carry-over:** new

### 🔷 MEDIUM · `ACC-docs-not-written` · Three documentation definition-of-done items are unmet

- **Location:** plan Stream 7
- **Issue:** Unmet: item 6 (`documentation/logging.md` teaching the modifier in its manual-box section,
  `documentation/tracing.md` teaching the marker-chain form), item 7's second half (`pnpm run docs`
  regenerating `docs/`), item 12 (`documentation/logging.md` teaching highlighting as a mark on the
  module column). Item 7's first half **is** met — JSDoc exists on the modifier pair, the marker-chain
  pair, and `Lox.columnFree`. Item 8 is met: the naming decision is recorded. Note item 6 cannot be
  written honestly while the module-less-highlight open question is unanswered — the plan says as much,
  and `init()`'s own highlighted line is the first instance.
- **Estimated fix cost:** 🟡 contained
- **Route:** Documentation phase (`document` skill), plan Stream 7, after the module-less-highlight
  question is settled
- **Fix:** Write both guide sections describing the current design, fold in
  `CODE-highlightcolor-jsdoc-stale`, then run `pnpm run docs` (never bare `pnpm docs`) and confirm via
  typedoc's own "html generated at ./docs" plus a changed `docs/` tree.
- **Cites:** spec definition of done items 6, 7, 12; `rules/documentation.md` · acceptance
- **Carry-over:** new

### ◽ LOW · `SIMP-highlight-default-magic-rgb` · The new highlight default breaks the file's own named-constant convention

- **Location:** `src/core/output/ANSIFormat.ts:75`
- **Issue:** `highlightPrefix`'s no-color branch returns `this.colorBackground(70, 70, 70)`, an inline
  triplet. The identical "default color used when the destination names none" pattern appears twice
  above the class as `DEFAULT_WARN_COLOR` / `DEFAULT_ERROR_COLOR`. This is the third instance and the
  only unnamed one.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `SIMP-highlight-default-magic-rgb`
- **Fix:** Add `DEFAULT_HIGHLIGHT_COLOR` beside the other two defaults and reference it.
- **Cites:** SIMPLICITY_REVIEW "magic numbers that should be named constants" · simplicity
- **Carry-over:** new

### ◽ LOW · `CODE-testing-rule-console-log-stale` · `rules/testing.md` still prescribes mocking `console.log` to capture the built-in output

- **Location:** `rules/testing.md` (the `PropsPrinter` "Always" bullet), consequence of
  `src/core/output/OutputStreams.ts:53`
- **Issue:** The rule tells future work to "mock `global.console.log` to capture it". With level-named
  dispatch an `info` log lands on `console.info` and a `debug` log on `console.debug`, so such a mock
  captures nothing. Three suites already fail for this reason; the *rule* is what will misdirect the
  next author.
- **Estimated fix cost:** 🟢 local
- **Route:** Documentation phase (`document` skill), alongside the Testing-phase suite rewrite
- **Fix:** Name the level's console method in the bullet (and that `Loxer.log()` is `'info'`), or mock
  all four, and point at whichever suite ends up pinning the dispatch.
- **Cites:** `rules/testing.md`; CODE_REVIEW conventions · code
- **Carry-over:** new

## Routed fix queue

- **Fixable now — 🟢 local (5):** `CODE-highlight-still-on-message`,
  `CODE-error-level-log-double-indented`, `CODE-highlightcolor-jsdoc-stale`,
  `SIMP-modtext-reimplements-colorhighlight`, `SIMP-highlight-default-magic-rgb` → specifically
  requested implementation task
- **Implementation pass — 🟡 contained (6):** `CODE-props-indentation-off-by-level-indent`,
  `PERF-getopenloxes-unbounded-scan`, `CODE-endtitleopacity-default-changed`,
  `CODE-node-stderr-routing`, `SIMP-errorlox-columnfree-relookup` →
  `implement documentation/plans/2026-08-19-columnfreeboxes/review.md <IDs>`. Testing phase owns
  `TEST-columnfree-zero-coverage`, `ACC-gates-red`, `TEST-built-tree-gate-not-durable`; Documentation
  owns `ACC-docs-not-written`, `CODE-testing-rule-console-log-stale`.
- **Own task — 🔴 redesign (0):** none

## Rule coverage gaps

- No project rule governs which console method the built-in development output uses, or which stream a
  level lands on. `src/core/AGENTS.md` documents the props-indentation invariant and the
  "verify both callback paths and the default console fallback" rule, but nothing about level→method
  routing, so `CODE-node-stderr-routing` and `CODE-error-level-log-double-indented` are judged against
  the spec alone. Worth an invariant in `src/core/AGENTS.md` once the routing settles.
- No rule states whether `Loxes._loxes` entries are cleared or tombstoned on close. The tombstone is
  load-bearing for the new `getOpenLoxes` and for nothing else.
- The spec's open question "what a highlight marks on a log that carries no module" is unanswered, and
  `CODE-highlight-still-on-message` currently masks it — fixing the message arm exposes it immediately.
- The spec's `console.debug` open question is implemented as its Design section directs, so it is
  conformant; the risk it names (Chromium hides Verbose rows) stays unmitigated and undocumented.

## Notes

- Verified independently by the orchestrator before consolidation, not taken on lens report alone:
  the `ANSIFormat.colorLox` prefix chain, `getPropsIndentation` vs the new `levelIndentation`, the
  `switchOutput` routing that lets an error-level ordinary log reach `devLogOut`, and both stale JSDoc
  comments in `src/types.ts`.
- Confirmed sound and not flagged, per the code lens: `columnFree` propagation on every path checked —
  `OutputLox`/`ErrorLox` inherit it through `super(lox)`, `appendToOpenLox` destructures it off the
  open lox so the pre-init `.of(id)` path works, and `toErrorLox`'s lookup is correct for a direct
  `Loxer.error()`, for a closed box, and in its ordering relative to the box build. The `Pick<>`
  spread rule is respected. Level and visibility semantics are untouched, hidden still wins in
  `addOpenLox`, and no production callback can receive a normal log. The Babel marker mirror is
  complete across all ten registration points, the `reservedPointDirectModules` change is a genuine
  no-op, and `trace.point.nc()` is still rejected by the point chain's own allowlist. All 16
  column-free acceptance criteria are met; the four unmet or partial criteria are all in the
  highlighting half.
- Budget exceeded — acceptance lens: read `src/types.ts:250-270,600-640`, `src/trace.ts:131-176,275-305`,
  `src/Loxer.ts:262-333,555-624`, `marker-collection.ts:215-271,360-405,660-717`, and
  `test/format.test.ts:25-70`, each to settle a criterion the diff alone could not — whether a
  highlighted close is reachable, whether an error-level ordinary log reaches `devLogOut`, whether
  `trace.point.nc()` is still rejected, and whether the existing highlight expectations pin the message
  or the module field. No other lens exceeded budget.
- Agents dispatched: 5 (code, simplicity, perf, acceptance, test). No token total is claimed as measured.
- The `> Model/effort:` signature line is omitted: this runtime exposes the model name but no effort
  value, and the signing contract requires both or neither.
