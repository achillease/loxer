# Review: Column-free boxes and the default console output — pass 3

**Verdict:** PASS
**Scope:** the pass-2 remediations — the highlight moved onto the time field, the shared
`getLevelIndentation` helper, `Loxes` key deletion, `columnFree` threaded through `internalError`,
`DEFAULT_HIGHLIGHT_COLOR` — plus the guides, the spec amendments, and the ten test suites
**Change scope:** base `HEAD` · paths `src/Loxer.ts`, `src/loxes/Lox.ts`, `src/types.ts`,
`src/trace.ts`, `src/tracing/types.ts`, `src/core/runtime/Loxes.ts`,
`src/core/output/{BoxFactory,ANSIFormat,OutputRenderer,OutputStreams}.ts`,
`packages/babel-plugin-loxer-trace/src/marker-collection.ts`, `test/*.ts`,
`test/types/registry.test-d.ts`, `documentation/specs/column-free-boxes.md`,
`documentation/logging.md`, `documentation/tracing.md`, `README.md`, `rules/testing.md` ·
current change (dirty working tree)
**Lenses run:** code ✓ · acceptance ✓ · test ✓
**Lenses skipped/N/A:** simplicity: pass-2 three-lens cap, and all of its open findings were
dispositioned `fixed` at the 2026-08-20 19:23 worklog row — the code lens confirmed each in the tree
· perf: same cap; its only finding, `PERF-getopenloxes-unbounded-scan`, was confirmed fixed
(`delete` replaces the tombstone) · a11y: no user-facing UI in this package · security: no auth,
injection, secret, or serialization surface touched, and no dependency or lockfile change
**Agents dispatched:** 3

> Severity: ⛔ CRITICAL · 🔶 HIGH · 🔷 MEDIUM · ◽ LOW
> Estimated fix cost (implementation scope/effort, not money or tokens): 🟢 local · 🟡 contained · 🔴 redesign

## Findings

### 🔷 MEDIUM · `CODE-highlight-modifier-jsdoc-stale` · The `highlight()` JSDoc still documents inverted foreground/background

- **Location:** `src/types.ts:731`
- **Issue:** `Modifiers.highlight`'s JSDoc reads "by default the `foregroundColor` and
  `backgroundColor` of the log will be inverted." All three parts are wrong: the inversion branch is
  gone (`ANSIFormat.CODE.Reverse` has no caller left), the default is an explicit grey background,
  and the mark is on the time field, not the log's colors. This is the member a user reads to learn
  the feature, and `docs/interfaces/Loxer.Modifiers.html` was regenerated in this same change, so
  the wrong sentence is published. It is the sibling of the already-fixed
  `CODE-highlightcolor-jsdoc-stale` in the same file.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-highlight-modifier-jsdoc-stale`, then
  `pnpm run docs`
- **Fix:** "by default the log's time field is marked with a grey `rgb(70, 70, 70)` background; the
  message keeps its own severity color". A repo-wide search for `invert`/`Reverse` finds only this
  line and the now-unused `CODE.Reverse` constant.
- **Cites:** `rules/documentation.md` — "Keep JSDoc in `src/` aligned with actual behavior before
  regenerating `docs/`"; CODE_REVIEW "comments that contradict the code"; spec Design · code
- **Carry-over:** new. Same cause as the closed `CODE-highlightcolor-jsdoc-stale`, different member.

### 🔷 MEDIUM · `CODE-highlightcolor-empty-string-throws` · Collapsing `highlightPrefix` dropped its falsy guard, so `highlightColor: ''` throws from inside rendering

- **Location:** `src/core/output/ANSIFormat.ts:66`
- **Issue:** `highlightPrefix(color: string = DEFAULT_HIGHLIGHT_COLOR)` defaults only on `undefined`,
  so an empty string reaches `Color('')`, which throws `Unable to parse color from string:`. The
  removed `if (color)` branch treated `''` as "no color". The throw happens inside `colorLox` →
  `ColoredOutputLoxRenderer`, i.e. inside a destination rendering a highlighted log, and propagates
  out of the logger. The sibling `colorizePrefix` (`:138`) guards this exact case with
  `color && color.length > 0`, so the two color entry points now disagree on empty input. Verified in
  the file and confirmed against the built tree.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-highlightcolor-empty-string-throws`
- **Fix:** Mirror `colorizePrefix`:
  `const rgb = Color(color && color.length > 0 ? color : DEFAULT_HIGHLIGHT_COLOR);`, or take
  `color?: string` and normalize with `isNES`.
- **Cites:** CODE_REVIEW "null / undefined / empty handling on every new code path";
  `src/core/AGENTS.md` — `Color()` throwing on an unparseable string is what makes the caller's guard
  load-bearing · code
- **Carry-over:** new — regression introduced by the `SIMP-highlight-default-magic-rgb` remediation.

### 🔷 MEDIUM · `CODE-tracepoint-columnfree-not-inherited` · A `trace.point` log inside a column-free box reports `columnFree: false`

- **Location:** `src/Loxer.ts:320-332` (`writeTracePoint`'s `new Lox({...})`)
- **Issue:** `writeTracePoint` stamps `id: containingBoxId ?? this.nextId()` — the point log is a
  member of the enclosing box — but never sets `columnFree`, so it defaults to `false` even when that
  box was opened with `nc()`. The plan's rationale for omitting it ("neither opens a box",
  `plan.md:66-69`) is about opening, not membership, and does not cover the id-carrying case.
  Rendering is unaffected: `getOfLogBox` finds no buffer slot and emits verticals plus one
  `horizontal`, the same member line as an `add`. So this is purely the public flag —
  `Lox.columnFree`'s own JSDoc says it is `true` for every log of that box, and the spec requires the
  flag so a custom stream need not infer it from `box.length`. Traced call frames are the flagship
  `nc()` use case and the marker chain mirrors the modifier for exactly them.
- **Estimated fix cost:** 🟡 contained
- **Route:** `implement` with this review path + `CODE-tracepoint-columnfree-not-inherited`, or an
  explicit park in `documentation/debt.md` if the flag is meant to be open/`.of(id)`-only
- **Fix:** Resolve the containing open lox once instead of twice-conditionally —
  `const containing = containingBoxId === undefined ? undefined : this._loxes.findOpenLox(containingBoxId);`
  — keep `containing?.moduleId` for module inheritance, and pass
  `columnFree: containing?.columnFree ?? false`. If the flag is deliberately `.of(id)`-only, tighten
  `Lox.columnFree`'s JSDoc to say so.
- **Cites:** spec criterion CF-13 ("the output lox exposes whether its box is column-free");
  `src/loxes/Lox.ts:73-80` JSDoc · code
- **Carry-over:** new

### 🔷 MEDIUM · `TEST-props-nc-depth-vacuous` · The new column-free props-depth test passes with or without `nc()`

- **Location:** `test/props.test.ts:769-774`
- **Issue:** The test opens `Loxer.pp().m('IT').nc().open('opening', ...)` with no other box open and
  asserts `getMarkerDepth(lox.box)` is `0`. With an empty buffer an ordinary column-reserving open
  produces the identical box — `[openEdge, openEnd]`, marker depth `0` — so deleting `.nc()` from the
  call leaves the assertion green. The interaction that would actually distinguish the two — a
  `nc()` open nested inside an already-open normal box, where the props connection point stays low
  instead of growing — has no test. The file's own preceding case (`test/props.test.ts:753-767`)
  already nests to get a non-zero depth.
- **Estimated fix cost:** 🟡 contained
- **Route:** `write-tests` (Testing phase)
- **Fix:** Open a normal box first, then the `pp().nc()` box inside it, and assert the props
  connection point against a same-shape case that omits `.nc()` and gets a deeper marker.
- **Cites:** test-smell checklist — an assertion that holds independently of the feature under test;
  `src/core/AGENTS.md` props-rendering coverage rule · test
- **Carry-over:** new

### 🔷 MEDIUM · `ACC-endtitleopacity-spec-unamended` · The settled `0.4` default has no criterion, contradicts an out-of-scope bullet, and is asserted nowhere

- **Location:** `documentation/specs/column-free-boxes.md:192` and `:244-251`;
  `src/core/output/OutputRenderer.ts:71`; `test/format.test.ts:254`
- **Issue:** The decision itself is recorded (Design, In scope, open question 5 struck as settled) —
  that half of the pass-2 finding is closed. Three residues remain. (a) No acceptance criterion
  covers it: the Highlighting list is H-1…H-6 and none mentions `endTitleOpacity`, so a user-visible
  default change to a public exported renderer ships with nothing to check against. (b) The
  out-of-scope bullet still reads "Both changes are confined to the colored fields **and to the
  built-in destination**", while In scope says the default reaches every colored destination —
  `ColoredOutputLoxRenderer` is what a custom destination calls, so the two statements contradict.
  (c) The only pin is a `test.todo`, so the shipped value is asserted nowhere.
- **Estimated fix cost:** 🟡 contained (two spec sentences plus one criterion are 🟢; the missing pin
  is the contained part)
- **Route:** spec amendment, then `implement`/`write-tests` for the `ColoredOutputLoxRenderer`
  assertion
- **Fix:** Add a criterion: "A close line's module title renders at `endTitleOpacity`, defaulting to
  `0.4`, in every destination that calls the exported colored renderers; a destination naming its own
  value keeps it." Reword the out-of-scope bullet to name only the plain fields, history and the
  `output` payload as untouched. Convert `test/format.test.ts:254` into a real assertion.
- **Cites:** spec In scope bullet 4, Out-of-scope bullet 4, Design; `AGENTS.md` — "An option read on
  both the open and the close side needs both covered by a test" · acceptance
- **Carry-over:** carried over from `ACC-endtitleopacity-spec-unamended` (pass 2, dispositioned
  `fixed` at the 2026-08-20 19:23 and 20:07 worklog rows). New evidence: the decision was recorded,
  but the criterion, the contradicting out-of-scope bullet, and the pin were not — verified in the
  spec and in `test/format.test.ts`.

### 🔷 MEDIUM · `TEST-built-tree-gate-not-durable` · The devtools console is still unverified, and it is the premise two criteria rest on

- **Location:** `test/dist-consumer.test.ts:409-473`; blocker at
  `examples/vite-trace-demo/src/main.ts:115`; spec Design and definition of done
- **Issue:** The first half stays closed, re-verified in the file: the dist-consumer cases pin a
  column-free box's `box.length` against the rebuilt `dist/` tree, and a callback-free re-init pins
  the grey `48;2;70;70;70` mark on the **time** field (moved from the module column since pass 2),
  the two greys never composing, `warn`'s missing pad against `info`'s two-space pad, and one call
  each on `console.debug` and `console.error`. The second half is unchanged: nothing confirms that
  `48;2` renders where `7` did not (H-2), or that `console.warn`/`console.error` shift a row exactly
  two columns — the width the hardcoded pad compensates (H-5). Every existing gate runs in Node and
  asserts escape sequences, not rendering. `pnpm demo` cannot reach the branch: the demo registers
  `output: record`, and `OutputStreams` never touches the console when `_output` is set. If the icon
  shift is not two columns, every `info`/`debug` row is misaligned in exactly the destination the
  change was written for.
- **Estimated fix cost:** 🟡 contained
- **Route:** Testing phase — add a callback-free demo route, complete one manual devtools pass, and
  record it; plus a definition-of-done item so it is gated
- **Fix:** No further test-file change is needed for propagation or console routing. Give
  `examples/vite-trace-demo` a mode that calls `Loxer.init()` with no `output` callback, open it in a
  Chromium devtools console, and confirm both the mark and that every timestamp starts at the same
  column. Add the matching definition-of-done item to the spec.
- **Cites:** `rules/testing.md` built-tree and consumer-app rules; spec Design (the ANSI-subset and
  two-column premises), definition-of-done items 5 and 11 · test, acceptance
- **Carry-over:** carried over from `TEST-built-tree-gate-not-durable` (pass 1, half-closed pass 2).
  First half confirmed still closed; second half confirmed still open. The acceptance lens filed the
  same cause independently as the premise behind H-2/H-5; merged here.

### ◽ LOW · `CODE-levelindent-not-shared-with-error-line` · `getLevelIndentation`'s "one place on purpose" claim does not hold for the error line

- **Location:** `src/core/output/OutputStreams.ts:21-35` (JSDoc + helper) and `:46` (`devErrorOut`)
- **Issue:** The helper's JSDoc says the predicate is one place on purpose so that
  `getLevelIndentation` and `getPropsIndentation` cannot disagree. `devErrorOut` never calls it: it
  prints no pad and calls `getPropsIndentation(errorLox)` relying on the `''` default. Both are
  correct today — `internalError` hardcodes `level: 'error'`, which the predicate maps to `''`, and
  `console.error` draws an icon — so this is not a live bug. But the pad is encoded twice for the
  error line while the comment asserts the opposite, and a later change to the predicate can
  desynchronize the error row silently.
- **Estimated fix cost:** 🟢 local
- **Route:** `implement` with this review path + `CODE-levelindent-not-shared-with-error-line`,
  bundled with the other local fixes
- **Fix:** Have `devErrorOut` pass `this.getLevelIndentation(errorLox)` into both the template
  literal and `getPropsIndentation`, exactly as `devLogOut` does.
- **Cites:** CODE_REVIEW "comments that contradict the code"; `src/core/AGENTS.md` — both console
  lines pass the one indentation constant, so a separator changed on one line alone misaligns that
  line's props · code
- **Carry-over:** new; adjacent to the fixed `CODE-props-indentation-off-by-level-indent`.

### ◽ LOW · `CODE-colorhighlight-default-changes-props-keys` · The new `colorHighlight` default silently re-renders selected props keys

- **Location:** `src/core/output/ANSIFormat.ts:12-13,61-74`; second consumer at
  `src/core/output/PropsPrinter.ts:584`
- **Issue:** `ANSIFormat` is exported public surface, and `colorHighlight(text)` with no color changed
  from reverse video to a `#464646` background. Its only other caller marks a `keys`-selected props
  key, so props-key highlighting changed rendering too. That is plausibly desirable — reverse video
  is invisible in a devtools console, the same reason the spec gives for the log highlight — but
  neither the spec, the plan, nor `colorHighlight`'s JSDoc mentions props keys, and the JSDoc still
  documents no default. Reverse video guaranteed contrast on any terminal background; a fixed dark
  grey does not, so a light-background terminal loses key legibility.
- **Estimated fix cost:** 🟢 local
- **Route:** confirm the intent in the worklog, then `implement` the JSDoc line (no code change if
  intended)
- **Fix:** Document the default on `colorHighlight` and record in the worklog that props-key
  highlighting adopts it deliberately. Keep the shared default rather than reintroducing
  `CODE.Reverse` for one caller.
- **Cites:** CODE_REVIEW backward-compat — "changed default behaviour callers depend on";
  `rules/documentation.md` JSDoc-alignment rule · code
- **Carry-over:** new; collateral of the `SIMP-highlight-default-magic-rgb` remediation, and the
  concrete form of a pass-2 note that was not filed as a finding.

### ◽ LOW · `ACC-errorlevel-pad-unpinned` · Half of the level-pad predicate ships unasserted

- **Location:** `test/initialization.test.ts:411-419` (`test.todo`);
  `src/core/output/OutputStreams.ts:30`
- **Issue:** Definition-of-done item 10 asks for the console method each level is written with and the
  alignment padding. The table covers `warn`/`info`/`debug`, and a separate test covers
  `Loxer.error()` through `devErrorOut`, but the `level === 'error'` arm of `getLevelIndentation` — an
  *ordinary* log carrying level `error`, reachable only through a box opened at that level — is a
  `test.todo`. The todo is honest and accurate (it names what is owed, and `Loxer.error()`
  structurally cannot reach `devLogOut`), so this is an owed-coverage finding, not a misleading test.
- **Estimated fix cost:** 🟡 contained
- **Route:** `write-tests` (Testing phase)
- **Fix:** Open a box at level `error` through the trace opener (the pattern exists at
  `test/boxed.test.ts:384`), assert its `add`/`close` line reaches `console.error` unpadded, and
  retire the todo.
- **Cites:** spec definition-of-done item 10; `AGENTS.md` — both sides of an option need a test ·
  acceptance, test
- **Carry-over:** new

### ◽ LOW · `ACC-dod-playground-substituted` · Definition-of-done item 5 names a `playground/*.js` gate that was deliberately not built

- **Location:** `documentation/specs/column-free-boxes.md:263-264`
- **Issue:** The item requires a `playground/*.js` script importing `../dist/index.js` to render a
  column-free box. No `playground/` file was touched; the gate lives in
  `test/dist-consumer.test.ts:409-425`, the more durable home, since `playground/` sits outside build,
  lint and test. The substance is met and the substitution is recorded in the worklog, but the item as
  written is not met and the spec was never amended, so a later reader sees an unexplained unmet box.
- **Estimated fix cost:** 🟢 local
- **Route:** spec amendment (Documentation phase)
- **Fix:** Reword item 5 to name `test/dist-consumer.test.ts` as the committed built-tree gate,
  matching item 11's phrasing.
- **Cites:** spec definition-of-done item 5; worklog rows 2026-08-19 01:22 and 2026-08-20 01:23 ·
  acceptance
- **Carry-over:** new

### ◽ LOW · `ACC-spec-naming-provisional` · The spec still presents the settled name and three settled questions as open

- **Location:** `documentation/specs/column-free-boxes.md:85`, `:123-127`, `:281-287`
- **Issue:** The selection-surface example writes `Loxer.m('SVC').nb().open(...)` — a method that does
  not exist — and the Naming section still says the identifier is provisional with `nb`/`noBox` as
  working names. Open questions 1 (the identifier pair), 2 (dedicated field vs derived) and 3
  (property vs method) were all settled by Planning and shipped as `nc`/`noColumn`, a dedicated
  `Lox.columnFree`, and a method on the marker chain, but still read as unanswered — unlike questions
  4 and 5, which are struck through and marked settled. No criterion is contradicted; the defect is
  that the durable contract names a non-existent method.
- **Estimated fix cost:** 🟢 local
- **Route:** spec amendment (Documentation phase)
- **Fix:** Replace `.nb()` with `.nc()`, restate Naming as the decided pair, and strike questions 1-3
  with **Settled:** lines in the style already used for 4 and 5. Leave question 6 (`console.debug`
  under Verbose) open — `documentation/logging.md` teaches the consequence.
- **Cites:** spec Naming and open questions; `rules/documentation.md` · acceptance
- **Carry-over:** new

### ◽ LOW · `ACC-guide-rejected-design-rationale` · `logging.md` argues against the rejected module-column mark and routes a reader to the defect register

- **Location:** `documentation/logging.md:152-172`
- **Issue:** Definition-of-done item 6 requires both guides to describe the current design without
  narrating the change. The highlight paragraph justifies the design against the alternative it
  replaced — "a log written without `.m(...)` renders an empty module column, so marking the module
  would show nothing on exactly the calls that skip it" — which is rationale against a rejected
  design, the register `rules/documentation.md` confines to a plan folder. Separately, a teaching
  guide links a reader to `debt.md`, which the same rule file calls a maintainer document.
- **Estimated fix cost:** 🟢 local
- **Route:** Documentation phase (`document` skill)
- **Fix:** Reduce the justification to its positive form ("The time field carries the mark because
  every log has one, whatever else it was chained with"), and state the Node stderr consequence
  directly without naming the defect register.
- **Cites:** `rules/documentation.md` — write every guide as if the current design had always been the
  design; spec definition-of-done item 6 · acceptance
- **Carry-over:** new; follows `ACC-docs-not-written` (fixed) — the content landed, this is its voice.

## Resolved since pass 2

Each was verified in the tree by the dispatched lens or by the orchestrator, not taken on the
worklog's word.

- `CODE-highlight-invisible-without-module` — **fixed.** The mark is on `timestamp`/`time` only
  (`ANSIFormat.ts:244-256`). `moduleText`, the message prefix chain, the error badge and every plain
  template field carry no highlight, so each log is marked exactly once and a module-less log is
  marked too. `markTime` drops `fgTime` as designed, and `time`/`timestamp` are byte-equivalent to
  their previous slices.
- `CODE-props-indentation-off-by-level-indent` and `CODE-error-level-log-double-indented` —
  **fixed.** `getLevelIndentation` is correct for all four levels, and `getPropsIndentation` adds the
  same width, so props stay under the message. An `error`-level ordinary log reaching `devLogOut`
  through the trace opener lands on `console.error` with no pad. Residue:
  `CODE-levelindent-not-shared-with-error-line`.
- `PERF-getopenloxes-unbounded-scan` — **fixed.** `delete` is safe: the only other reader is
  `findOpenLox`, which gets `undefined` either way; the map now holds open boxes only, integer-like
  keys keep `Object.values` in ascending-id order, and the `!hidden` filter preserves the old
  buffer-derived exclusion.
- `SIMP-errorlox-columnfree-relookup` — **fixed.** Every `internalError` call site checked: both
  `of()` closures pass `openLox.columnFree`, the five id-only "box gone" closures and the two direct
  `error`/`namedError` entry points correctly take `false`, and the pre-init path inherits through
  `findOpenLox`'s queue search, so open and close never disagree on a queued box.
- `SIMP-modtext-reimplements-colorhighlight`, `SIMP-highlight-default-magic-rgb`,
  `CODE-highlightcolor-jsdoc-stale`, `CODE-moduleopacity-jsdoc-diverged` — **fixed**, all confirmed in
  place. Residues: `CODE-highlightcolor-empty-string-throws`,
  `CODE-colorhighlight-default-changes-props-keys`, `CODE-highlight-modifier-jsdoc-stale`.
- `ACC-docs-not-written` — **fixed.** Both guides, the `tracing.md` and `README.md` enumerations, and
  a `docs/` tree written after the last `src/` edit, carrying `noColumn`, `columnFree` and the `0.4`
  default. Residue: `ACC-guide-rejected-design-rationale`.
- `CODE-testing-rule-console-log-stale` — **fixed.** The `rules/testing.md` edit accurately describes
  the `console[lox.level]` dispatch, drops the non-existent `disableColors` and the pre-move path, and
  cites the suites that pin the dispatch.
- `CODE-endtitleopacity-default-changed` — **accepted** (user decision, `0.4`). Residue:
  `ACC-endtitleopacity-spec-unamended`.
- `CODE-node-stderr-routing` — **deferred** as `D-5`; not re-raised.
- `TEST-columnfree-zero-coverage` and `ACC-gates-red` — **superseded**; not re-raised.

## Routed fix queue

- **Fixable now — 🟢 local (6):** `CODE-highlight-modifier-jsdoc-stale`,
  `CODE-highlightcolor-empty-string-throws`, `CODE-levelindent-not-shared-with-error-line`,
  `CODE-colorhighlight-default-changes-props-keys`, `ACC-dod-playground-substituted`,
  `ACC-spec-naming-provisional` → specifically requested implementation task. The last two are spec
  edits; `ACC-guide-rejected-design-rationale` belongs to the Documentation phase.
- **Implementation pass — 🟡 contained (5):** `CODE-tracepoint-columnfree-not-inherited`,
  `ACC-endtitleopacity-spec-unamended` →
  `implement documentation/plans/2026-08-19-columnfreeboxes/review-3.md <IDs>`. Testing owns
  `TEST-props-nc-depth-vacuous`, `ACC-errorlevel-pad-unpinned` and
  `TEST-built-tree-gate-not-durable`.
- **Own task — 🔴 redesign (0):** none

## Rule coverage gaps

- `src/core/AGENTS.md`'s props-indentation invariant is now incomplete. It defines the indentation as
  the time field plus its separator and says both console lines pass the one `TIMESTAMP_INDENTATION`
  constant; the log line also prints a level pad that must be counted, and the two lines derive that
  pad differently.
- No project rule states what the built-in console output may assume about the host `console`.
  `devLogOut` indexes `console[outputLox.level]`, requiring all four methods to exist. `D-5` parks the
  stderr consequence; the capability assumption itself is undocumented.
- Neither the spec nor `rules/testing.md` names a gate for a browser devtools destination, which is
  the environment both halves of the second concern were written for.
- No rule states whether `Loxes._loxes` entries are cleared or tombstoned on close. The `delete` is
  now load-bearing for `getOpenLoxes`'s cost and ordering claims. (Carried from passes 1 and 2.)
- Closed since pass 2: the definition of done now lists `pnpm typecheck:types` as a gate.

## Notes

- Verified independently by the orchestrator before consolidation: `highlightPrefix`'s missing falsy
  guard against `colorizePrefix`'s (`ANSIFormat.ts:66` vs `:138`); the stale `highlight()` JSDoc at
  `src/types.ts:731`; `writeTracePoint`'s `new Lox({...})` omitting `columnFree` while carrying the
  box id; that `internalError` hardcodes `level: 'error'`, which is what makes `devErrorOut`'s
  unshared pad correct today; the vacuous depth assertion at `test/props.test.ts:769`; `.nb()` at spec
  `:85`; and the rejected-design rationale at `documentation/logging.md:155-158`.
- No lens was dispatched for simplicity or perf under the pass-2+ three-lens cap. Unlike pass 2, no
  finding of theirs was left open to re-verify: all were dispositioned `fixed`, and the code lens
  confirmed each remediation in the tree. Two new LOW findings sit in simplicity's territory
  (`CODE-levelindent-not-shared-with-error-line`, `CODE-colorhighlight-default-changes-props-keys`)
  and were filed by the code lens instead. No new perf ground was examined.
- The five gates were not re-run; reviewers are read-only. Definition-of-done item 2 is taken from the
  worklog's 2026-08-20 20:07 row (598 passed / 2 todo), with `dist/` and `docs/` mtimes consistent
  with a build and a docs run after the last `src/` edit.
- The two standing `test.todo` entries are honest and still accurate — each names its finding inline,
  and neither behavior is exercised anywhere else. The stale one flagged in pass 2 was rewritten.
- Acceptance walked all 22 criteria and 12 definition-of-done items. All 16 column-free criteria are
  met; H-1 through H-4 and H-6 are met; H-5 is met in code but rests on an unverified devtools
  premise. Definition-of-done items 5 and 10 are partially met, and item 1 inherits H-5.
- Budget exceeded — code lens: read `PropsPrinter.ts:560-604`, `color/parseColor.ts:300-333`,
  `src/index.ts`, `packages/babel-plugin-loxer-trace/src/linked-loxer.ts` as immediate
  consumers/callees, plus one read-only evaluation against the existing `dist/` to confirm the
  `colorHighlight('X', '')` throw. Acceptance lens: read seven `test/` files,
  `documentation/debt.md`, and grepped `docs/` and `dist/` — definition-of-done items 3, 4, 5, 7, 9,
  10 and 11 name those artifacts as their evidence. Test lens: none.
- Agents dispatched: 3 (code, acceptance, test). No token total is claimed as measured.
- The `> Model/effort:` signature line is omitted: this runtime exposes the model name but no effort
  value, and the signing contract requires both or neither.
