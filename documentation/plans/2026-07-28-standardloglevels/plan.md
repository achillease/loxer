# Plan: Standard log levels (`error` / `warn` / `info` / `debug`)

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the framed problem in the request
> Folder note: plan folders live in `documentation/plans/`, not `docs/plans/` (`docs/` is the TypeDoc
> `out` dir and `pnpm docs` wipes it — see `rules/documentation.md`).

## Context

Loxer's level system is a freely-defined numeric scale: `LevelType = 0 | 1 | 2 | 3` for module
thresholds and `LogLevelType = 1 | 2 | 3` for individual logs, documented as
`0 = no output / 1 = high / 2 = medium / 3 = low`. A level is attached with the one-shot chainable
modifier `.level(n)` / `.l(n)`.

Three problems with that:

1. **The scale carries no meaning.** "high / medium / low" is a Loxer-local invention; nobody arrives
   at the library already knowing what level `2` means. Every other logger in the ecosystem uses
   `error` / `warn` / `info` / `debug`.
2. **Freely-defined levels buy nothing.** The numbers are only ever compared against a module
   threshold; no user-supplied naming or extra tiers exist to justify the abstraction.
3. **`.l()` is the wrong shape for the job.** A level is not a decoration like `.highlight()` — it *is*
   the log's severity, so it belongs in the call that emits the log, the way `console.warn` works.

This is a breaking major (`package.json` is already at `3.0.0`), so the redesign is a clean cut with
**no deprecation shims**.

One finding from the code survey reframes the whole migration and is worth stating up front: **today's
`level: 0` never actually meant "no output".** Errors bypass level gating entirely
([Loxer.ts:368](../../../src/Loxer.ts#L368) takes the `type === 'error'` branch before `hidden` is ever
computed), so a module at level `0` still emits its errors. `0` has always meant **"errors only"**.
That maps exactly onto `'error'` as the quiet end of the named scale — so the new scale needs no
extra `'off'` token, and the built-in modules' `prodLevel: 0` becomes `prodLevel: 'error'` with
**identical** behavior.

## Approach

### The scale

One union replaces both numeric types — with names-only thresholds there is no longer any value a
threshold can hold that a log cannot, so the `LevelType` / `LogLevelType` asymmetry disappears:

```ts
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'; // ordinals 0 / 1 / 2 / 3
export type BoxLevel = Exclude<LogLevel, 'error'>; // an "error box" is meaningless
```

A new `src/core/Levels.ts` becomes the **single** home for the ordering and the gate. The comparison
formula currently exists twice — [Modules.ts:71](../../../src/core/Modules.ts#L71) and its
`@deprecated` duplicate at [Modules.ts:118-123](../../../src/core/Modules.ts#L118-L123) — and the
`Math.max` clamp at [Loxer.ts:344](../../../src/Loxer.ts#L344) is a third, direction-dependent
encoding of the same ordering. All three collapse into:

```ts
const LEVEL_ORDER: Record<LogLevel, 0 | 1 | 2 | 3> = { error: 0, warn: 1, info: 2, debug: 3 };
isHidden(level: LogLevel, threshold: LogLevel): boolean   // LEVEL_ORDER[level] > LEVEL_ORDER[threshold]
moreVerbose(a: LogLevel, b: LogLevel): LogLevel           // replaces Math.max
```

**Direction is preserved from today:** higher ordinal = more verbose = hidden sooner, gate is strict
`>`. Keeping the direction means the existing `hidden` boolean plumbing
([Loxes.ts:52](../../../src/core/Loxes.ts#L52), [BoxFactory.ts:19-21](../../../src/core/BoxFactory.ts#L19-L21))
needs no change at all — both read the already-computed flag, never a level. The `=== 0` hard-mute
pre-check in the gate is **deleted**: with `error` at ordinal 0, `isHidden('error', 'error')` is
`false`, and errors are ungated anyway, so `threshold: 'error'` naturally means "errors only".

### The API

`.l()` and `.level()` are **deleted** — no shim. `type l = 'l' | 'level'`
([types.ts:418](../../../src/types.ts#L418)) goes with them; because `l` appears only in its own two
return types, the `Omit<Modifiers<Delete | X>, Delete | X>` machinery shrinks to `h | m` with no other
edits. Level stops being chaining state: `_level` and its line in `resetState()` are removed, and
`Modifiers` is left with the two modifiers that genuinely *are* decorations.

Each non-error level becomes a **callable namespace** — a function that also carries `.open()`:

```ts
interface LevelChannel {
  (message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  open(message: string, item?: ItemType, itemOptions?: ItemOptions): OpenedLox;
}
```

```ts
Loxer.warn('retrying');                 // level 'warn', normal log channel
Loxer.info('done');                     // level 'info'
Loxer.debug('cache miss');              // level 'debug'
Loxer.log('done');                      // exact alias of Loxer.info()
Loxer.error(new Error('boom'));         // unchanged — a channel, not a level

Loxer.h().m('DB').debug.open('query');  // a debug-level box
const box = Loxer.open('work');         // still defaults to 'info'
Loxer.of(box).debug('attempt 2');
Loxer.of(box).close('ok');
```

Implementation: `warn` / `info` / `debug` are instance properties built in `LoxerInstance` by a private
`makeChannel(level)` that closes over the level and reads the **live** chain state at call time. That
keeps `Loxer.h().m('DB').debug.open(...)` working, because property access performs no logging and
therefore triggers no reset — only terminal calls reset, via `switchOutput` →
[resetState()](../../../src/Loxer.ts#L85-L89), exactly as today.

`error` deliberately gets **no** `.open()`. `Loxer.error()` stays a plain method routed to
`devError` / `prodError`, with the required `Error` object, the unconditional history entry, and the
gate bypass — all unchanged.

**`warn()` goes to the normal log channel**, not the error channel: `type: 'single'` routed to
`devLog` / `prodLog` with `level: 'warn'`. Warn is a level; error is a channel. Nothing fabricates an
`Error`, `LoxType` is untouched, and every existing `devLogs` / `devErrors` split in the suites keeps
its meaning. Consumers that want to branch on severity read `lox.level`.

### Box logs

`OfLoxes` gains `warn` / `info` / `debug` next to `add` / `close` / `error` / `namedError`.

One nuance to get right — **`add` is not an alias of `of().info()`**, unlike `log` ≡ `info` at the top
level:

| call | level |
| --- | --- |
| `of(id).add(msg)` | **inherits** the box's level (today's no-modifier behavior, unchanged) |
| `of(id).debug(msg)` | `moreVerbose(openLevel, 'debug')` — the clamp, preserved |
| `of(id).close(msg)` | **always** `openLevel`; an explicit level is impossible, not just ignored |

The `close` override is load-bearing, not stylistic, and must survive verbatim.
`Loxes.addOpenLox` reserves a visible column only `if (!lox.hidden)`
([Loxes.ts:50-55](../../../src/core/Loxes.ts#L50-L55)) while `proceedOpenLox` frees it *regardless* of
`hidden` ([Loxer.ts:379](../../../src/Loxer.ts#L379)). If a `close` could be hidden while its `open`
was visible, the slot would be freed with no closing glyph ever printed — a visually dangling box.
Forcing `close.level = openLevel` makes the open and close visibility decisions provably identical.
Since `OfLoxes.close` never accepts a level in the new API, this is now enforced by the *type*, which
also resolves the stale `TODO level changes` at [types.ts:365](../../../src/types.ts#L365) and the
`TODO: is this necessary?` at [types.ts:469-473](../../../src/types.ts#L469-L473) — both get deleted
along with the prose they annotate.

The upward-only clamp on `add`-family calls is likewise kept: it prevents an explicitly-visible add
from emitting an orphaned mid-box glyph into a column its hidden `open` never reserved.

### Module thresholds

`Module.devLevel` / `prodLevel` and `LoxerOptions.defaultLevels` retype to `LogLevel` — **names only**,
no numbers accepted. Numbers would keep old literals compiling while silently changing their meaning
(`devLevel: 1` went from "show the important logs" to "warn and above", which now *hides* `log()`); a
compile error is the better outcome for a major.

New built-in defaults in [Modules.ts:127-146](../../../src/core/Modules.ts#L127-L146) — `NONE`,
`DEFAULT`, `INVALID`, and `DEFAULT_EXTENDED_MODULE`:

```ts
{ devLevel: 'info', prodLevel: 'error' }
```

`prodLevel: 'error'` is behaviorally identical to today's `prodLevel: 0` and preserves the
"production output defaults to silence" invariant. `devLevel: 'info'` keeps the spirit of today's
`devLevel: 1` — `error` / `warn` / `info` visible, `debug()` an opt-in firehose a module enables with
`devLevel: 'debug'`. Note the consequence: the `'Loxer initialized'` log
([Loxer.ts:73](../../../src/Loxer.ts#L73)) becomes level `info`, so a module threshold of `warn` would
suppress it.

`getModuleLevel(id)` returns `LogLevel | undefined`; the `-1` sentinel is replaced by `undefined`.

The `?? 1` malformed-module fallbacks at
[Modules.ts:69-70](../../../src/core/Modules.ts#L69-L70) become `?? 'info'`, preserving "a JS consumer's
malformed module stays visible rather than silently muting itself".

### Two adjacent bugs to fix while here

Both sit on the exact lines this change rewrites, so leaving them costs more than fixing them:

1. **`defaultLevels` mutates a shared const.**
   [Modules.ts:23-28](../../../src/core/Modules.ts#L23-L28) writes into the module-scoped
   `DEFAULT_MODULES` object rather than a copy, so one `Loxer.init({ defaultLevels })` permanently
   rewrites the built-ins for the whole process — surviving `resetLoxer()` and leaking across test
   files. Fix: clone `DEFAULT_MODULES` per `Modules` instance and apply `defaultLevels` to the clone.
   Expect this to move expectations in the four suites that set `defaultLevels`; it is a *silent*
   fixture-order dependency today.
2. **The `@deprecated isLogHidden` duplicate** ([Modules.ts:118-123](../../../src/core/Modules.ts#L118-L123))
   is dead code holding a second copy of the gate formula. Delete it. (`getText` / `getColor`, also
   `@deprecated`, are unrelated — leave them.)

### Tracing

`TraceOptions.level` retypes to `BoxLevel` (default `'info'`) — `'error'` is excluded because a trace
opens a box. The two in-package `.l()` callers become channel dispatch, which type-checks as a plain
index because all three channels share `LevelChannel`:

```ts
Loxer.h(isHighlighted(highlight, 'open')).m(moduleId)[level].open(openMessage, item).id;
```

The **Babel plugin is the sharpest edge** in this change
([packages/babel-plugin-loxer-trace/src/trace-binding.ts](../../../packages/babel-plugin-loxer-trace/src/trace-binding.ts)):

- `SUPPORTED_MODIFIERS` (line 4) drops `'level'` and `'l'`, keeping `'highlight' | 'h' | 'module' | 'm'`.
- `LINKED_METHODS` (lines 6-10) gains `warn → warn`, `info → info`, `debug → debug` alongside
  `log → add`, so `Loxer.m('X').debug('msg')` inside a traced body is rewritten to
  `Loxer.m('X').of(state.id, true).debug('msg')` and stays attached to its box. Without this, the new
  level methods would silently *stop* being linked — the coupling that makes per-level `OfLoxes`
  members mandatory rather than merely symmetric.
- `isDirectLoxerChain` (lines 292-315) must handle the **two-level member callee** `Loxer.debug.open`.
  The requirement is narrow but must be explicit: `.debug(...)` is linked, `.debug.open(...)` is
  recognized and left alone (as `open` is today), and neither crashes detection.

### Out of scope

- **A per-module mute that also suppresses errors.** `'error'` is the quiet end of the scale and
  errors stay ungated, so there is no `'off'`/`'silent'` token; `config.disabled` /
  `disabledInProductionMode` remain the kill switches. Gating errors would break the
  "errors are always output" invariant in `AGENTS.md`. Worth revisiting separately if per-module
  silence is ever actually wanted.
- **A `LoxerLevelRegistry`** mirroring the `LoxerModuleRegistry` augmentation from `8df42c6`. A fixed
  four-name scale has nothing user-defined to register, and unlike module ids the *values* would have
  to be meaningful (an ordinal), because a set of names carries no order while every comparison needs
  one. Deliberately not built.
- `Loxer.error.open()` and `TraceOptions.level: 'error'`.

## Critical files

**New**

- `src/core/Levels.ts` — `LogLevel`, `BoxLevel`, `LEVEL_ORDER`, `isHidden()`, `moreVerbose()`. The one
  place the ordering exists.

**Core**

- [src/types.ts](../../../src/types.ts) — delete `LevelType` (161) and `LogLevelType` (515); re-export
  `LogLevel`/`BoxLevel`; delete `type l` (418) and the `l`/`level` members (449-479); add the
  `LevelChannel` interface and the `warn`/`info`/`debug` members to `LogMethods`; add
  `warn`/`info`/`debug` to `OfLoxes` (391-406); retype `Module.devLevel`/`prodLevel` (138-141),
  `LoxerOptions.defaultLevels` (125-130), `getModuleLevel` (36). Also the largest single block of JSDoc
  teaching the old scale: 25-36, 53-101, 120-130, 155-161, 283, 314-315, 338, 365-369, 449-479, 501,
  510-515.
- [src/Loxer.ts](../../../src/Loxer.ts) — delete `_level` / `level()` / `l()` (103-113) and the
  `resetState` line (87); add `makeChannel` + the three channel properties; replace the three
  `level: this._level ?? 1` producers (141, 185, 217) with explicit levels; rewrite the clamp
  (340-345) as `moreVerbose`; widen `getModuleLevel`'s impl signature (81) to `ModuleId` to match the
  public contract while touching it.
- [src/core/Modules.ts](../../../src/core/Modules.ts) — the gate (71) delegates to `Levels.isHidden`;
  clone-instead-of-mutate in the constructor (23-28); `getLevel` returns `LogLevel | undefined`
  (49-55); new built-in defaults (127-146); delete `isLogHidden` (118-123).
- [src/loxes/Lox.ts](../../../src/loxes/Lox.ts) — `LoxProps.level` (17) and the public `level` field
  (42-43, 56) become `LogLevel`; the field's JSDoc still names `.l(number)`.
- [src/loxes/OutputLox.ts](../../../src/loxes/OutputLox.ts) — JSDoc on `hidden` (21) describing the old
  threshold semantics.
- [src/index.ts](../../../src/index.ts) — swap the `LevelType`/`LogLevelType` re-exports (19-20) for
  `LogLevel`/`BoxLevel`.

**Tracing**

- [src/tracing-types.ts](../../../src/tracing-types.ts) — `TraceOptions.level` (99-100) → `BoxLevel`,
  default `'info'`. Exported from both `loxer` and `loxer/trace`.
- [src/trace.ts](../../../src/trace.ts) — `__startTrace` (88-94): `.l(level)` → channel dispatch.
- [src/decorators/trace.ts](../../../src/decorators/trace.ts) — same shape (83, 95).
- [packages/babel-plugin-loxer-trace/src/trace-binding.ts](../../../packages/babel-plugin-loxer-trace/src/trace-binding.ts)
  — lines 4, 6-10, 292-315 as described above; needs a new fixture for `.debug(...)` linking and one
  for `.debug.open(...)` being left alone.

**Tests** (all must be ported, not just made to compile)

- [test/boxed.test.ts](../../../test/boxed.test.ts) — `leveling` (268-299) is the executable
  specification of the clamp, the close override, and the error bypass, complete with an ASCII box
  diagram at 289-297; `module boxing` (301-334) covers a hidden open still rendering an error stub.
- [test/unboxed.test.ts](../../../test/unboxed.test.ts) — 33-39 init, 61-63 `getModuleLevel`, 86-105 the
  core gate, 172-188 modifier-ordering (its `level` assertions become vacuous and must be re-expressed
  around `h`/`m` only), 190-212 history exclusion, 214-230 one-shot reset, 232-239 the `devLevel: 0`
  mute → `'error'`.
- [test/plain-function-trace.test.ts](../../../test/plain-function-trace.test.ts) — 40-43, 64 (a `.l(2)`
  chain in traced source), 794-822, 1143, 1163-1177, 1247-1264.
- [test/format.test.ts](../../../test/format.test.ts) — 81, 95, 109 construct `OutputLox`es with
  `level: 0`, a value that no longer exists.
- [test/initialization.test.ts](../../../test/initialization.test.ts) — 56-61, plus `level: 1` literals
  at 127, 137, 148, 161, 216.
- [test/decorators.test.ts](../../../test/decorators.test.ts) — 217, 437, 468, 484; and
  [test/trace-cases.ts](../../../test/trace-cases.ts) — 21, 163, 172, 179.
- [test/item.test.ts](../../../test/item.test.ts) — 26.
- [test/types/registry.test-d.ts](../../../test/types/registry.test-d.ts) — 19-20, the `.l(2)` chain at
  42, and 60-64 which hard-codes `0 | 1 | 2 | 3 | -1`. **Runs under `pnpm typecheck:types` against
  built `dist/*.d.ts`, not under `pnpm test`** — easy to miss, and its `@ts-expect-error` negatives
  fail if a directive becomes unused. Add positive cases for `Loxer.debug.open(...)` and negative ones
  for `Loxer.l(2)` / `devLevel: 1` / `Loxer.error.open(...)`.
- [test/performance.ts](../../../test/performance.ts) — 16-52, 68, 80. Not matched by vitest's
  `include`, so it rots silently; update it in the same pass.

**Docs**

- [documentation/index.md](../../../documentation/index.md) — §5 "Levels" (329-372) is a wholesale
  rewrite; then the TOC (10), 18, 47, 92, 127-128, 188-194, 224, 324, 414-423, 431-434, 450-454
  (`DEFAULT_MODULES` mirror — already drifted, it omits `boxLayoutStyle`), 480, 503, 543-544, 553-554,
  667, 707-709, and the `Modifiers.html#level` link at 812 which becomes a dead anchor.
- [README.md](../../../README.md) — 12-13, 48-49, 61, 64 (three `.level()`/`.l()` examples), 98. This
  file *is* the generated `docs/index.html` front page (`typedoc.json` sets no `readme`).
- [documentation/Performance.md](../../../documentation/Performance.md) — 76-77, 99 ("Logs not
  leveled" methodology).
- [src/core/AGENTS.md](../../../src/core/AGENTS.md) (13), `src/decorators/AGENTS.md`, and the root
  [AGENTS.md](../../../AGENTS.md) Behavior section (the hidden-logs invariant). Root `AGENTS.md` also
  still says version 2.0.0 while `package.json` says 3.0.0 — fix in passing.

**Uncovered by CI — verify by hand**

- [playground/OrderService.js](../../../playground/OrderService.js) is written as a *teaching example of
  leveling*: 12, 38-44, 82-84, 93-95, 121, 242-245 (`getModuleLevel` incl. the `-1` probe), 277.
- [playground/Speedtest.js](../../../playground/Speedtest.js) 49-51, 64-66, 79-81, 95, 107;
  `playground/docs.js` 6-8; `playground/items.js` 6-8; `playground/Logo.js` 13-50.
- `examples/vite-trace-demo/src/main.ts` — 10-30 (four module literals) and 140 (`Loxer.h().l(2).log`).

## Risks & open questions

- **The Babel plugin's chain detection is the highest-risk edit.** `Loxer.debug.open(...)` is a
  two-level member callee that today's `isDirectLoxerChain` doesn't model. Mitigation: fixtures for
  both shapes (`.debug(...)` linked, `.debug.open(...)` untouched) written *before* the detection
  change, plus the adversarial shadowed-global fixtures that
  `packages/babel-plugin-loxer-trace/AGENTS.md` already requires.
- **Ordering direction is easy to invert silently.** `moreVerbose` replaces a `Math.max` whose meaning
  depends on the ordinal direction. Getting it backwards flips individual visibility while the suite
  may still pass in aggregate. Mitigation: `LEVEL_ORDER` is asserted directly in a small unit test, and
  `test/boxed.test.ts`'s `leveling` case is ported level-by-level against its ASCII diagram rather than
  re-derived from whatever the new code produces.
- **Fixing the shared-`DEFAULT_MODULES` mutation will move test expectations** in `unboxed`, `boxed`,
  `initialization`, and `plain-function-trace`, which currently cross-contaminate through it. Any
  expectation change there must be justified as "the isolated value", not silently accepted.
- **Callable namespaces vs. the singleton's one-shot state.** `Loxer.debug` is a property, so a stored
  reference (`const d = Loxer.debug`) reads chain state at *call* time, which is correct but subtle.
  Cover it with a test that interleaves `Loxer.h()` and a hoisted channel reference.
- **`documentation/index.md` mirrors types by hand** and has already drifted (the `DEFAULT_MODULES`
  block at 450-454). The rewrite is an opportunity to trim the mirrors toward TypeDoc links per
  `rules/documentation.md`, rather than re-mirroring the new shape and drifting again.
- **Open question, deliberately deferred:** should `lox.level` also expose its ordinal (e.g.
  `lox.levelOrder`) so callback authors can compare severities without importing `LEVEL_ORDER`? Left
  out of the initial cut to keep the surface minimal; revisit if the guide rewrite makes the omission
  awkward.
- **Migration guidance is a deliverable, not a nicety.** Every consumer's `Loxer.init({ modules })`
  literal and every `.l()` call site breaks at compile time. The guide needs an explicit old→new table,
  including the non-obvious `0 → 'error'` (not `'off'`) and `1 → 'info'` (not `'warn'`, because `log()`
  is now `info`).

## Verification

Gates, in order — each must exit 0:

1. `pnpm lint` — covers `src/**/*.ts` only; `test/`, `playground/`, `*.js` are excluded.
2. `pnpm build` — type declarations change, and it recurses into `packages/**` so the Babel plugin is
   compiled here.
3. `pnpm test` (`vitest run --coverage`) — with the ported suites above, not merely compiling ones.
4. `pnpm typecheck:test` — `test/tsconfig.json`.
5. `pnpm typecheck:types` — **requires a prior `pnpm build`**; this is where
   `test/types/registry.test-d.ts` runs, including the `@ts-expect-error` negatives for the removed
   `.l()` and the numeric thresholds.
6. `pnpm docs` — after the JSDoc rewrite (`rules/documentation.md` requires it).

Then the things no gate covers:

7. `node playground/OrderService.js`, `node playground/Speedtest.js`, `node playground/docs.js`,
   `node playground/items.js`, `node playground/Logo.js` — each must run and visibly demonstrate the
   new levels, with `OrderService.js` still working as the leveling tutorial it was written to be.
8. `pnpm demo:build` for `examples/vite-trace-demo` (outside the `packages/**` build filter).
9. A manual read of one `devLog` callback payload confirming `lox.level` is a name and
   `lox.module.devLevel` / `prodLevel` are names — both are publicly reachable from every callback.

The behavioral checks that matter most, stated as expectations to hold after the change:

- Production output stays silent by default (`test/boxed.test.ts`'s `afterAll` prod-array assertion).
- Errors are still emitted on a module at `devLevel: 'error'`, and still render their box stub.
- A hidden `open` reserves no visible column, yet `.of(id)` still resolves and its `close` is hidden
  too — no dangling box.
- Hidden normal logs stay out of both `history` and the visible open-box buffer.
- Pre-init logs still queue and replay, resolving their level against the *initialized* module table.
