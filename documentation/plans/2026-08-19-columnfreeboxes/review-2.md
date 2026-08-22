# Review: Column-free boxes and the default console output — pass 2

**Verdict:** WARN
**Scope:** the `nc`/`noColumn` modifier across the `Loxer` chain, the box layout, the Babel marker
mirror, the built-in development console's highlight rendering and level routing, and the ten test
suites written since pass 1
**Change scope:** base `HEAD` · paths `src/Loxer.ts`, `src/loxes/Lox.ts`, `src/types.ts`,
`src/trace.ts`, `src/tracing/types.ts`, `src/core/runtime/Loxes.ts`,
`src/core/output/{BoxFactory,ANSIFormat,OutputRenderer,OutputStreams}.ts`,
`packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `test/*.ts`,
`test/types/registry.test-d.ts`, `documentation/debt.md` · current change (dirty working tree)
**Lenses run:** code ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** simplicity: pass-2 three-lens cap; its three open findings were verified
unchanged by the orchestrator directly · perf: same cap; its one open finding verified unchanged
directly · a11y: no user-facing UI in this package · security: no auth, injection, secret, or
serialization surface touched, and no dependency or lockfile change
**Agents dispatched:** 3

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔶 HIGH · `CODE-highlight-invisible-without-module` · A highlighted log with no module marks nothing, and its test asserts nothing

- **Location:** `src/core/output/ANSIFormat.ts:235-239`; first instance `src/Loxer.ts:144`; vacuous
  assertion `test/initialization.test.ts:419-433`
- **Issue:** Fixing `CODE-highlight-still-on-message` exposed the case pass 1 predicted it would.
  `Modules.getModule` gives the `NONE` module an empty `slicedName` and `moduleTextLength` `0`
  (`src/core/runtime/Modules.ts:78-82` — verified directly), so the module-column wrap emits
  `\x1b[48;2;70;70;70m` + zero characters + reset. A log written without `.m(...)` defaults to
  `moduleId: 'NONE'`, so `Loxer.h().log('x')` shows no mark at all. This is a **regression for
  terminal consumers**, not an unchanged devtools miss: before this change the same log carried
  reverse video on the message, which a terminal renders. Loxer's own
  `this.highlight().log('Loxer initialized')` at `src/Loxer.ts:144` is the first instance and reaches
  every user. The spec's open question 4 demanded one of two answers before ship — mark something
  else, or teach highlighting as module-scoped — and neither shipped. The new suite cannot catch it:
  `test/initialization.test.ts:419` inits with no modules and asserts `template.module` *contains*
  the background escape, which holds while the escape wraps nothing.
- **Estimated fix cost:** 🟡 contained
- **Route:** Planning settles spec open question 4 first, then `implement` with this review path +
  `CODE-highlight-invisible-without-module`
- **Fix:** Either fall back to marking a field every log carries when `slicedName` is empty (the time
  field is the only fixed-width one left), or accept module-scoped highlighting — in which case amend
  the spec to close the question, give `init()`'s own line a module so the library does not ship an
  unmarked "highlighted" log, teach the constraint in `documentation/logging.md` and the
  `highlight`/`h` JSDoc, and re-point `test/initialization.test.ts:419` at a module-carrying log so
  the assertion pins a visible mark.
- **Cites:** spec open question 4, criterion H-1; plan Risks ("it needs an answer before the guides
  teach the modifier"); CODE_REVIEW "changed default behaviour callers depend on" · code, acceptance
- **Carry-over:** new. Pass 1 recorded it only as a rule-coverage gap and predicted it would surface
  once `CODE-highlight-still-on-message` was fixed. It has. The acceptance lens filed the same cause
  independently as `ACC-moduleless-highlight-unanswered`; merged here at the higher severity.

### 🔶 HIGH · `CODE-props-indentation-off-by-level-indent` · The two-space level prefix is still missing from `getPropsIndentation`

- **Location:** `src/core/output/OutputStreams.ts:21-23` and `:51-55`
- **Issue:** Unchanged in the tree. `devLogOut` prints `${levelIndentation}${lox.time} ${lox.module}…`
  — 11 columns before the module text for `info`/`debug`/`error`, 9 for `warn` — while
  `getPropsIndentation` still returns `TIMESTAMP_INDENTATION + lox.module.slicedName.length` (9 + n).
  Rendered props hang from that number, so on every non-`warn` row the props tree sits two columns
  left of the column it should branch from. `devErrorOut` adds no prefix and stays aligned, so the two
  console lines disagree — the exact failure `src/core/AGENTS.md` names.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `CODE-props-indentation-off-by-level-indent`
- **Fix:** Compute `levelIndentation` first, then pass
  `this.getPropsIndentation(outputLox) + levelIndentation.length` to `ColoredOutputLoxRenderer`, or
  hoist the prefix into one helper that both the line and the indentation read.
- **Cites:** `src/core/AGENTS.md` props-indentation invariant; spec criterion H-5 · code
- **Carry-over:** carried over from `CODE-props-indentation-off-by-level-indent` (pass 1). Still open;
  registered as `test.todo` at `test/initialization.test.ts:437`, no product change.

### 🔶 HIGH · `PERF-getopenloxes-unbounded-scan` · `getOpenLoxes()` still scans the whole lifetime id map

- **Location:** `src/core/runtime/Loxes.ts:51-52,100-106`, called from `src/Loxer.ts:591,619`
- **Issue:** Unchanged in the tree — verified by the orchestrator, not by a dispatched lens.
  `removeCorrespondingOpenLox` still closes a box with `this._loxes[lox.id] = undefined`, leaving the
  key, and `getOpenLoxes` still runs `Object.values(this._loxes).filter(...)`. Cost is *O(every log id
  the instance ever issued)* per `ErrorLox` construction, against the *O(open boxes)* the bounded
  `_openLogBuffer` gave. For a long-lived singleton the cumulative cost of errors grows quadratically
  in total log volume.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `PERF-getopenloxes-unbounded-scan`
- **Fix:** `delete this._loxes[lox.id]` instead of assigning `undefined`. Nothing depends on the key's
  presence — `findOpenLox` reads `this._loxes[id]` and gets `undefined` either way, and `filterDef`
  drops absent entries — so the map holds only genuinely open boxes and both the ordering claim and
  the hidden filter survive.
- **Cites:** PERFORMANCE_REVIEW "unbounded allocations with no cap"; CODE_REVIEW "resource leaks" ·
  perf (pass 1), status re-verified by the orchestrator
- **Carry-over:** carried over from `PERF-getopenloxes-unbounded-scan` (pass 1). Lens not dispatched
  this pass; the code was read directly and is unchanged.

### 🔷 MEDIUM · `CODE-error-level-log-double-indented` · An error-level *ordinary* log gets both the console icon and the two-space pad

- **Location:** `src/core/output/OutputStreams.ts:52-53`
- **Issue:** Unchanged. `outputLox.level === 'warn' ? '' : '  '` assumes only `warn` reaches
  `devLogOut` with an icon-bearing method, but `switchOutput` routes by `lox.type === 'error'`, not by
  level. An ordinary log carrying `level: 'error'` — `trace.error(...)` opening a box plus its
  inherited `add`/`close`, or `trace.point.error(...)` — reaches `devLogOut`, is dispatched to
  `console.error`, and is padded on top of the icon shift, landing two columns right of every other
  row.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-error-level-log-double-indented`
- **Fix:** `outputLox.level === 'warn' || outputLox.level === 'error' ? '' : '  '`, or one shared
  "does this console method draw an icon" predicate read by both `devLogOut` and `devErrorOut`.
- **Cites:** spec criterion H-5 · code
- **Carry-over:** carried over from `CODE-error-level-log-double-indented` (pass 1). Still open;
  `test.todo` at `test/initialization.test.ts:414`.

### 🔷 MEDIUM · `CODE-highlightcolor-jsdoc-stale` · `LoxerColorOptions.highlightColor` JSDoc still names the old target and the old default

- **Location:** `src/types.ts:250`
- **Issue:** Unchanged: "Background color for highlighted ordinary log **messages**. Omit it to
  **invert foreground/background**." Both halves are false — the highlight wraps `moduleText`
  (`ANSIFormat.ts:235-239`), and omitting the option yields grey `rgb(70, 70, 70)`
  (`ANSIFormat.ts:75`). This is exported public surface TypeDoc publishes, three lines above the
  `endTitleOpacity` JSDoc that *was* corrected in the same file this pass.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-highlightcolor-jsdoc-stale`, then the
  Documentation phase's `pnpm run docs` step
- **Fix:** "Background color for the module column of a highlighted log. Defaults to grey
  `rgb(70, 70, 70)`." — current design, no diff narration.
- **Cites:** `rules/documentation.md` JSDoc-alignment rule; spec criterion H-2 · code, acceptance
- **Carry-over:** carried over from `CODE-highlightcolor-jsdoc-stale` (pass 1), unchanged.

### 🔷 MEDIUM · `ACC-endtitleopacity-spec-unamended` · The `endTitleOpacity` default was accepted in code but the spec still carries it as an open question

- **Location:** `src/core/output/OutputRenderer.ts:71`; `documentation/specs/column-free-boxes.md`
  open question 5 and criterion H-6; stale `test.todo` at `test/format.test.ts:246`
- **Issue:** Spec open question 5 asks whether `endTitleOpacity` should stop applying to a
  **highlighted** close line. What shipped changes the default from `0` to `0.4` for **every** close
  line in `ColoredOutputLoxRenderer`, which `src/index.ts` exports as `OutputLoxRenderer` — so a
  custom destination that never highlights anything renders differently. That contradicts criterion
  H-6 ("only the colored `module` field and the console method differ from a log that is not
  highlighted"), and no in-scope bullet covers it. The worklog dispositions the pass-1 code finding as
  "accepted, not reverted" and the `types.ts` JSDoc was rewritten, but the spec — the rulebook this
  lens judges against — was never amended. The `test.todo` left at `test/format.test.ts:246` is now
  itself stale: it says the JSDoc does not match `0.4`, which it does.
- **Estimated fix cost:** 🟢 local
- **Route:** spec owner amends `documentation/specs/column-free-boxes.md`, then `implement` drops or
  rewrites the stale `test.todo`
- **Fix:** Record the accepted `0.4` default in the spec as decided rather than open, state that it
  applies to every close line through the exported renderers, and reconcile H-6 so it no longer claims
  a non-highlighted log renders identically.
- **Cites:** spec criterion H-6, "Out of scope", open question 5; rubric §7 dispositions · acceptance
- **Carry-over:** new. Related to `CODE-endtitleopacity-default-changed` (pass 1, "accepted, not
  reverted") — that disposition rebutted reverting the code, not leaving the spec unamended.

### 🔷 MEDIUM · `ACC-docs-not-written` · Three documentation definition-of-done items are still unmet, and two existing enumerations are now incomplete

- **Location:** `documentation/logging.md`, `documentation/tracing.md:55`, `README.md:105`, `docs/`
  (all unmodified)
- **Issue:** Item 6 (both guides), item 7's second half (`pnpm run docs` with typedoc's own
  confirmation and a changed `docs/` tree) and item 12 (highlighting taught as a module-column mark)
  are unmet, unchanged since pass 1. New detail: the shipped modifier makes two existing enumerations
  incomplete rather than merely silent — `documentation/tracing.md:55` lists the marker chain's
  modifiers as "`module`/`m`, `highlight`/`h`, and `printProps`/`pp`", and `README.md:105` mirrors it.
  Item 6 still cannot be written honestly until `CODE-highlight-invisible-without-module` is settled.
- **Estimated fix cost:** 🟡 contained
- **Route:** Documentation phase (`document` skill), plan Stream 7, after
  `CODE-highlight-invisible-without-module` is settled
- **Fix:** Teach `nc`/`noColumn` in `documentation/logging.md`'s manual-box section and beside
  `tracing.md:55`; teach highlighting as a module-column mark; extend the two enumerations; fold in
  `CODE-highlightcolor-jsdoc-stale`, `CODE-moduleopacity-jsdoc-diverged` and
  `CODE-testing-rule-console-log-stale`; record the `console.debug`/Chromium-Verbose caveat; then
  `pnpm run docs` (never bare `pnpm docs`) and confirm via typedoc's "html generated at ./docs" plus a
  changed `docs/` tree.
- **Cites:** spec definition of done items 6, 7, 12; `rules/documentation.md` · acceptance
- **Carry-over:** carried over from `ACC-docs-not-written` (pass 1), unchanged.

### 🔷 MEDIUM · `TEST-built-tree-gate-not-durable` · First half closed; the Chromium devtools check is still open and `pnpm demo` cannot reach it

- **Location:** `test/dist-consumer.test.ts:409-473` (new); the blocker is `examples/vite-trace-demo`
- **Issue:** The first half is genuinely closed, verified in the file rather than taken on the
  worklog's word: the new dist-consumer cases assert `[columnFree, box.length]` pairs against the
  rebuilt `dist/` tree, and a second case re-inits `dist.Loxer` **without** an `output` callback —
  the one precondition that reaches the console fallback at all — then pins the grey
  `48;2;70;70;70` background on the module field and not the message, the `warn` row's missing pad,
  and one hit each on `console.debug` and `console.error`. The second half remains open: nothing has
  confirmed the highlight actually renders in a Chromium devtools console, the environment this half
  of the spec exists for. `pnpm demo` cannot show it — `examples/vite-trace-demo` registers
  `output: record`, so `OutputStreams` forwards the raw lox and never touches the console.
- **Estimated fix cost:** 🟡 contained
- **Route:** Testing phase — add a callback-free demo route, then finish the check in a real Chromium
  devtools console
- **Fix:** No test-file change is needed for the propagation and console-routing half; it is done. Add
  a demo page (or a mode on the existing one) that inits `Loxer` with no `output` callback and
  complete the manual devtools pass once.
- **Cites:** `rules/testing.md` built-tree and consumer-app rules; spec definition of done items 5,
  11 · test
- **Carry-over:** carried over from `TEST-built-tree-gate-not-durable` (pass 1). First half now
  confirmed closed; second half confirmed still open.

### 🔷 MEDIUM · `SIMP-errorlox-columnfree-relookup` · `toErrorLox` still re-resolves an `openLox` that `of()` already held

- **Location:** `src/Loxer.ts:591` vs `src/Loxer.ts:452,513-516,529`
- **Issue:** Unchanged in the tree — verified by the orchestrator, not by a dispatched lens. `of()`
  resolves `openLox` once at `:452` and its `error`/`namedError` closures already close over it;
  `appendToOpenLox` inherits `columnFree` by destructuring that same lox at `:529`. `toErrorLox` still
  performs a second `findOpenLox(lox.id)` at `:591` to re-derive the same value for the same purpose.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `SIMP-errorlox-columnfree-relookup`
- **Fix:** Add a `columnFree` parameter to `internalError` (default `false`), pass
  `openLox.columnFree` from the two `of()` closures that already hold it, and drop the `findOpenLox`
  call in `toErrorLox`.
- **Cites:** `AGENTS.md` — "Extract a shared internal helper when two independent runtime paths need
  the same semantic rule or gate." · simplicity (pass 1), status re-verified by the orchestrator
- **Carry-over:** carried over from `SIMP-errorlox-columnfree-relookup` (pass 1). Lens not dispatched
  this pass; the code was read directly and is unchanged.

### 🔷 MEDIUM · `SIMP-modtext-reimplements-colorhighlight` · The module-text highlight still re-implements `colorHighlight`

- **Location:** `src/core/output/ANSIFormat.ts:235-239` vs `:58-61`
- **Issue:** Unchanged in the tree — verified by the orchestrator, not by a dispatched lens. The wrap
  writes `this.highlightPrefix(...) + moduleText + this.CODE.Reset` by hand, which is exactly the body
  of `ANSIFormat.colorHighlight(text, color)` in the same class, already reused at
  `PropsPrinter.ts:584`.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `SIMP-modtext-reimplements-colorhighlight`
- **Fix:** `moduleText = this.colorHighlight(moduleText, options.colors?.highlightColor);`
- **Cites:** SIMPLICITY_REVIEW "Reuse before invention" · simplicity (pass 1), status re-verified by
  the orchestrator
- **Carry-over:** carried over from `SIMP-modtext-reimplements-colorhighlight` (pass 1). Lens not
  dispatched this pass; the code was read directly and is unchanged.

### ◽ LOW · `CODE-moduleopacity-jsdoc-diverged` · The corrected `endTitleOpacity` doc now contradicts `moduleOpacity`, the option it feeds

- **Location:** `src/types.ts:263-266` vs `src/types.ts:309`
- **Issue:** `endTitleOpacity`'s JSDoc was rewritten this pass to "Brightness … a multiplier on the
  module color's channels", matching `colorizePrefix`. It is passed straight into
  `LoxColorOptions.moduleOpacity` (`OutputRenderer.ts:71`), whose JSDoc still reads "Opacity for the
  module title. Defaults to `1`." Two exported public options describe one mechanism with two
  incompatible words, and "opacity" is the term the fix judged misleading. No behavior impact.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-moduleopacity-jsdoc-diverged`, folded into the
  `CODE-highlightcolor-jsdoc-stale` edit and the `pnpm run docs` run
- **Fix:** Give `moduleOpacity` the same wording — a channel multiplier, `1` = the module's full
  color, defaults to `1`.
- **Cites:** `rules/documentation.md` — "keep [a term] to exactly one meaning throughout" · code
- **Carry-over:** new, introduced by the `CODE-endtitleopacity-default-changed` remediation.

### ◽ LOW · `SIMP-highlight-default-magic-rgb` · The highlight default is still an inline triplet

- **Location:** `src/core/output/ANSIFormat.ts:75`
- **Issue:** Unchanged in the tree — verified by the orchestrator, not by a dispatched lens.
  `highlightPrefix`'s no-color branch returns `this.colorBackground(70, 70, 70)`. The identical
  "default color used when the destination names none" pattern appears twice above the class as
  `DEFAULT_WARN_COLOR` / `DEFAULT_ERROR_COLOR`. This is the third instance and the only unnamed one.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `SIMP-highlight-default-magic-rgb`
- **Fix:** Add `DEFAULT_HIGHLIGHT_COLOR` beside the other two defaults and reference it.
- **Cites:** SIMPLICITY_REVIEW "magic numbers that should be named constants" · simplicity (pass 1),
  status re-verified by the orchestrator
- **Carry-over:** carried over from `SIMP-highlight-default-magic-rgb` (pass 1). Lens not dispatched
  this pass; the code was read directly and is unchanged.

### ◽ LOW · `CODE-testing-rule-console-log-stale` · `rules/testing.md` still prescribes mocking `console.log`

- **Location:** `rules/testing.md:49`
- **Issue:** Unchanged. The `PropsPrinter` bullet tells future authors to "mock `global.console.log`
  to capture it", but `devLogOut` dispatches through `console[outputLox.level]`, so an `info` log
  lands on `console.info` and a `debug` log on `console.debug` — such a mock captures nothing. The
  suites were fixed; the rule that will misdirect the next author was not. The same bullet also names
  `config: { disableColors: true }`, and `disableColors` no longer exists anywhere in `src/` — a
  pre-existing staleness worth folding into the same edit.
- **Estimated fix cost:** 🟢 local
- **Route:** Documentation phase (`document` skill)
- **Fix:** Name the level's console method in the bullet (and that `Loxer.log()` writes at `'info'`),
  or say to mock all four, point at the suite that pins the dispatch, and drop `disableColors`.
- **Cites:** `rules/testing.md`; CODE_REVIEW conventions · code
- **Carry-over:** carried over from `CODE-testing-rule-console-log-stale` (pass 1), unchanged.

## Resolved since pass 1

- `CODE-highlight-still-on-message` — **fixed, confirmed still fixed.** The `lox.highlighted` arm is
  gone from `ANSIFormat.colorLox`'s message prefix chain. The code lens verified the three knock-on
  risks: span re-emission stays correct, `ErrorLox` rendering is untouched, and a highlighted close
  now reaches `closeLogPrefix()` unconditionally.
- `TEST-columnfree-zero-coverage` — **superseded, confirmed.** The propagation assertions cover all
  seven `.of(id)` entry points on the flag itself, plus the opening call and the trace marker mirror.
  The plan's top risk is pinned.
- `ACC-gates-red` — **superseded.** The worklog reports 598 passed / 3 todo / 0 failed across five
  gates. Not re-run here; this review is read-only.
- `CODE-endtitleopacity-default-changed` — **accepted in code**; the residue is
  `ACC-endtitleopacity-spec-unamended` above.
- `CODE-node-stderr-routing` — **deferred to debt** as `D-5`; not re-raised.

## Routed fix queue

- **Fixable now — 🟢 local (7):** `CODE-error-level-log-double-indented`,
  `CODE-highlightcolor-jsdoc-stale`, `ACC-endtitleopacity-spec-unamended`,
  `SIMP-modtext-reimplements-colorhighlight`, `CODE-moduleopacity-jsdoc-diverged`,
  `SIMP-highlight-default-magic-rgb`, `CODE-testing-rule-console-log-stale` → specifically requested
  implementation task. `ACC-endtitleopacity-spec-unamended` is a spec edit plus a stale `test.todo`;
  `CODE-testing-rule-console-log-stale` belongs to the Documentation phase.
- **Implementation pass — 🟡 contained (6):** `CODE-props-indentation-off-by-level-indent`,
  `PERF-getopenloxes-unbounded-scan`, `SIMP-errorlox-columnfree-relookup` →
  `implement documentation/plans/2026-08-19-columnfreeboxes/review-2.md <IDs>`.
  `CODE-highlight-invisible-without-module` needs spec open question 4 answered before it can be
  implemented. Documentation owns `ACC-docs-not-written`; Testing owns
  `TEST-built-tree-gate-not-durable`.
- **Own task — 🔴 redesign (0):** none

## Rule coverage gaps

- No project rule states what a highlight marks on a log that carries no module — the gap
  `CODE-highlight-invisible-without-module` sits in.
- No project rule governs which console method the built-in output uses or which stream a level lands
  on. Worth an invariant in `src/core/AGENTS.md` once `D-5` settles. (Carried from pass 1.)
- No rule states whether `Loxes._loxes` entries are cleared or tombstoned on close. The tombstone is
  load-bearing for the rewritten `getOpenLoxes` and nothing else. (Carried from pass 1.)
- The spec's definition of done omits `pnpm typecheck:types`, where the double-chain
  `@ts-expect-error` pins live. The plan supplies it as a fifth gate; worth folding into the spec's
  item 2 so it is contractual.

## Notes

- Verified independently by the orchestrator before consolidation, not taken on lens report alone:
  `Modules.getModule`'s empty `slicedName` for `NONE`, `Loxer.ts:144`'s module-less highlighted init
  line, the vacuous `toContain` assertion at `test/initialization.test.ts:419`, `getPropsIndentation`
  vs `levelIndentation` in `OutputStreams`, and both `src/types.ts` JSDoc divergences.
- Also verified directly, because their lenses were not dispatched under the pass-2 three-lens cap:
  `Loxes.removeCorrespondingOpenLox` still tombstones and `getOpenLoxes` still scans
  (`PERF-getopenloxes-unbounded-scan`); `Loxer.ts:591` still re-looks-up
  (`SIMP-errorlox-columnfree-relookup`); `ANSIFormat.ts:235-239` still hand-rolls the wrap
  (`SIMP-modtext-reimplements-colorhighlight`); `ANSIFormat.ts:75` still inlines the triplet
  (`SIMP-highlight-default-magic-rgb`). All four are unchanged and carried forward at their pass-1
  severity. No new perf or simplicity ground was examined this pass.
- The three `test.todo` entries are honest, not coverage-hiding: each names its finding ID inline, and
  Vitest reports them as a distinct todo count rather than a pass. One of them
  (`test/format.test.ts:246`) has gone stale — see `ACC-endtitleopacity-spec-unamended`.
- Acceptance walked all 22 criteria and 12 definition-of-done items. All 16 column-free criteria are
  met; H-1 and H-6 are partially met, and definition-of-done items 6, 7 (second half) and 12 are
  unmet. Everything unmet is in the highlighting half or in documentation.
- Not flagged, worth knowing: the grey highlight default also reaches `PropsPrinter`'s selected-key
  rendering through `ANSIFormat.colorHighlight`, replacing reverse video there too. Reverse video
  guaranteed contrast on any terminal background; a fixed dark grey does not, so a light-background
  terminal loses key legibility. Same tradeoff the spec accepted for the module column.
- Budget exceeded — code lens: read `src/core/runtime/Modules.ts:74-95`, both lox constructors,
  `src/core/output/PropsPrinter.ts:565-591`, `packages/babel-plugin-loxer-trace/src/linked-loxer.ts`,
  and grepped the guides for `highlight` to settle the severity of
  `CODE-highlight-invisible-without-module`. Test lens: read `test/plain-function-trace.fixture.ts`
  and non-diff context in four suites to confirm setup/teardown and that the glyph conventions are
  pre-existing. Acceptance lens: none.
- Agents dispatched: 3 (code, acceptance, test). No token total is claimed as measured.
- The `> Model/effort:` signature line is omitted: this runtime exposes the model name but no effort
  value, and the signing contract requires both or neither.
