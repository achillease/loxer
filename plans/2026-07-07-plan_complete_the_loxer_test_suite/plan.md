# Plan: Complete the Loxer test suite

## Context

The suite passes (31 tests / 7 suites) but a passing run currently proves less than it appears.
Three files — [error.test.ts](test/error.test.ts), [item.test.ts](test/item.test.ts),
[decorators.test.ts](test/decorators.test.ts) — are `// TODO` placeholders that execute code
without a single meaningful assertion, so they inflate coverage while catching no regressions.
This is the direct cause of [Item.ts](src/core/Item.ts) sitting at **32% stmts / 25% branch**
while the rest of the codebase is 85–100%.

Root cause of the Item gap (confirmed in source): in
[OutputStreams.devLogOut](src/core/OutputStreams.ts#L90-L117), `Item.of(lox).prettify(...)` runs
**only in the `else` branch when no `devLog` callback is registered**. `item.test.ts` always
registers callbacks, so the entire item-printing engine never executes.

Goal: replace the placeholder tests with real, assertion-backed tests and close the High/Medium
coverage gaps the review found, so the suite becomes a genuine regression guard — especially for the
documented, user-facing item-printing feature ([documentation/item.md](documentation/item.md)).

Scope agreed with the user: **Critical + High + Medium** findings. Low-priority nits (console-mock
reset, test-name typo, `checkBoxes` object-compare, stale comments) are out of scope.

## Constraints & conventions

- Follow [rules/testing.md](rules/testing.md): `resetLoxer()` in `afterEach`, re-init in
  `beforeEach` for any global-Loxer-state test; the prod-output-empty invariant
  (`afterAll` asserting `prodLogs`/`prodErrors` empty) must hold.
- `test/` is excluded from `tsconfig` build and eslint, so `pnpm build`/`pnpm lint` will NOT catch
  errors in test files — `pnpm test` is the gate.
- Match existing test style: exact-string assertions like [format.test.ts](test/format.test.ts),
  the singleton reset pattern in [boxed.test.ts](test/boxed.test.ts), and the `global.console.log =
  jest.fn()` mock pattern in [initialization.test.ts](test/initialization.test.ts#L9-L11).
- **Do not change product code.** If a new test reveals a real product bug (e.g. a modifier fails
  to reset), stop and surface it as a fix proposal rather than editing `src/`. Note: the async
  `@trace` no-`.catch` behavior is *documented and intentional*
  ([src/decorators/AGENTS.md](src/decorators/AGENTS.md)) — test it as-is, do not "fix" it.

## Approach

### Item-printing tests — chosen mechanism: no-callback OutputStreams path

`Item` reads per-log options from `lox.itemOptions` ([Item.ts:66-73](src/core/Item.ts#L66-L73)),
and `Loxer.log(message, item, itemOptions)` threads them onto the lox
([Loxer.ts:124](src/Loxer.ts#L124)). So: init `Loxer` with `dev: true` and **no** `devLog`/`devError`
callbacks, mock `console.log`, call `Loxer.log(msg, item, itemOptions)`, and assert on
`(console.log as jest.Mock).mock.calls`. The box `depth` is fixed by OutputStreams, but item
*content* rendering (depth truncation, keys, class shortening) is driven purely by `itemOptions`, so
content assertions are stable regardless of box column.

## Files to modify & what each must assert

### 1. [item.test.ts](test/item.test.ts) — CRITICAL (rewrite)
- Init with `dev: true`, no `devLog`/`devError` callbacks; `global.console.log = jest.fn()`;
  `resetLoxer()` + `mockClear()` in `afterEach`; prod-empty `afterAll`.
- Remove the `expect(true).toBeTruthy()` tautology and the dead `afterAll` (`OutputStreams;`).
- Split the one giant fixture into one focused test per behavior, each asserting the exact
  console.log string (or a `toContain` on the item segment):
  - primitives (number, string, boolean, symbol, null, undefined)
  - array + nested object shape
  - `depth` truncation → `[n elements]` / `{n entries}`
    ([Item.ts:196-197,233-238](src/core/Item.ts#L196))
  - `keys` filtering incl. cut markers `+(n entries)` / fully-filtered `{...}`
    ([Item.ts:317-325,366-389](src/core/Item.ts#L317))
  - `shortenClasses` true/false ([Item.ts:222-232](src/core/Item.ts#L222))
  - `printFunction` true (full source) vs false (`[Function: name]`)
  - `Date` instance ([Item.ts:219-220](src/core/Item.ts#L219))
  - `getItemBox` short (<50 chars, `┃ item>`) vs expanded (`┌───`) variants
- **Circular reference**: `const o:any={}; o.self=o;` (and an array cycle) — assert the intended
  contract (bounded output vs. throw). This is the explicit risk named in
  [src/core/AGENTS.md](src/core/AGENTS.md); if it stack-overflows, that is a product bug to surface,
  not to paper over.

### 2. [error.test.ts](test/error.test.ts) — CRITICAL (rewrite)
- Assert each `NamedError` variant's message format from [Error.ts:35](src/core/Error.ts#L35):
  e.g. `expect(err.message).toBe('error test =[RangeError]=> range')`;
  object input → `toContain('=[Error]=> {"fail":"object"}')` (the `JSON.stringify` branch,
  [Error.ts:48](src/core/Error.ts#L48)); no-`existingError` → message unchanged (`'non existing error'`).
- Assert stack replacement occurred for the wrapped-error case (`err.stack` reflects the given error).
- Exercise `LoxerError` (currently a dead import): assert `.name === 'LoxerError'` and message,
  or drop the import if not driven.

### 3. [decorators.test.ts](test/decorators.test.ts) — CRITICAL/HIGH (rewrite)
- Add `Loxer.init({ dev:true, callbacks:{ devLog, devError } })` in `beforeEach` and
  `resetLoxer()` in `afterEach` (currently absent — violates the reset rule).
- Assert the emitted open/close **message text** captured in `devLogs` for each variant:
  default `functionName` (`method()` / `method done`), `args`, `types`,
  `className.functionName`, `result`, `prettyResult`, and the custom callback (`fnfn`) —
  values traceable to [trace.ts getOpenMessage/getCloseMessage](src/decorators/trace.ts#L131-L175).
- Assert `argsAsItem` / `resultAsItem` attach the expected `item` to the open/close log.
- Async: assert a resolving traced method closes the box and returns the payload; add a **rejecting**
  traced method and assert `await expect(...).rejects` propagates AND (documenting current behavior)
  the open box is *not* closed (no `.catch` by design).

### 4. [unboxed.test.ts](test/unboxed.test.ts) — HIGH
- **One-shot modifier reset**: after a `highlight`/`level`/`module` (`h`/`l`/`m`) call, issue a
  bare `Loxer.log(...)` and assert the next log reverted (`highlighted===false`, default level,
  `moduleId==='NONE'`) — guards `Loxer.resetState()` ([Loxer.ts:78-82](src/Loxer.ts#L78)).
- **History ordering**: in the `'history'` test replace the near-tautological `Lox.equals()` id
  compare with message-order assertions proving newest-first
  (`Loxer.history[0].message` = most recent).

### 5. [boxed.test.ts](test/boxed.test.ts) — HIGH
- In the `'leveling'` test, add `expect(Loxer.history.length).toBe(<non-hidden count>)` to prove
  hidden logs are excluded from history — the invariant [src/core/AGENTS.md](src/core/AGENTS.md)
  names this file as owning.

### 6. Module full-mute — MEDIUM
- Add a module configured `devLevel: 0` (in `unboxed.test.ts` or `boxed.test.ts`) and assert every
  log for it is hidden (absent from dev output / open-box buffer) — the untested branch at
  [Modules.ts:71](src/core/Modules.ts#L71) (`dl === 0 || lox.level > dl`).

### 7. [initialization.test.ts](test/initialization.test.ts) — MEDIUM
- Convert the `// TODO` `'OutputStreams'` and `'Rest'` smoke tests into asserting tests:
  `findOpenLox(NaN) → undefined`, `getText` for an unregistered module → `INVALID` text, and route a
  **non-trivial** item (array/object) through the no-callback OutputStreams path, asserting on the
  mocked `console.log` args.
- In the `'queueing logs'` test, assert replay **order + content** of pre-init logs, not just counts.

### 8. [format.test.ts](test/format.test.ts) — MEDIUM
- Add the missing `expect(bs0).toBe(...)` for the colored `getBoxString` variant (currently computed
  but unasserted), closing part of the `ANSIFormat` ~63% function-coverage gap.

## Verification

- `pnpm test` (runs `jest --coverage`) — all suites green; confirm **[Item.ts](src/core/Item.ts)
  coverage jumps substantially** from ~32% (the headline signal this worked) and no other file
  regresses.
- Confirm the prod-output-empty invariant still holds (no new test causes a normal log to reach a
  prod callback) — `afterAll` assertions in the callback-based suites must stay green.
- `pnpm lint` for sanity, remembering it does not scan `test/` — so read each rewritten file for the
  house style (semicolons kept, single quotes, `printWidth: 100`).
- If any test surfaces a genuine product bug (circular-ref overflow, a modifier that fails to reset),
  stop and present it as a fix proposal — do not edit `src/` under this plan.
