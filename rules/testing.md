# Testing rules

> Runner: Vitest, `environment: 'node'`, `globals: true` (`vitest.config.ts`). `include` picks up
> `test/**/*.test.ts` and `test/**/*.test.only.ts` (use the `.test.only.ts` suffix to run a single
> file in isolation). Legacy TS decorators are enabled via oxc (`oxc.decorator.legacy`) so the
> `@trace`/`@initLoxer` suites transpile. `describe`/`test`/`expect` and the lifecycle hooks are
> global; mocking uses `vi` (imported from `vitest`), not `jest`.

## Always

- Run `pnpm test` (`vitest run --coverage`) before treating any change to `src/` as done.
- If a change touches global logger state, call `resetLoxer()` in `afterEach` and re-init `Loxer`
  in `beforeEach` — see `test/boxed.test.ts` for the pattern.
- If a change alters box layout (open/close columns, trimming, visible slots), update or add
  expectations in `test/boxed.test.ts`. Those tests assert visible column behavior without
  terminal glyphs.
- If a change alters `@initLoxer`/`@trace` decorator-generated messages, async/promise handling,
  or item capture, update `test/decorators.test.ts`.
- To exercise `Item`/`prettify` (rich item printing) in a test, init `Loxer` without
  `devLog`/`devError` callbacks — or call `Item.of(lox).prettify(...)` directly. A registered
  `devLog`/`devError` callback receives the raw lox and bypasses the console fallback in
  `src/core/OutputStreams.ts`, which is the only path that calls `Item.prettify`; registering it
  makes a suite assert nothing about item output. Use `config: { disableColors: true }` on init
  for plain (un-ANSI'd) strings and mock `global.console.log` to capture output — see
  `test/item.test.ts`. Falsy items (`false`, `0`, `''`, `null`, `undefined`) never reach this path
  (`if (outputLox.item)` gate).
- A task touching `src/` is done only when `pnpm test` passes AND, for a box-layout or decorator
  change, the corresponding test file above was updated.

## Never

- Never let a change cause a production-mode callback to receive a normal (non-error) log.
  `test/boxed.test.ts`'s `afterAll` asserts prod log/error arrays are empty; a regression here is
  a real failure, not test noise.
- Never expect `pnpm build` or `pnpm lint` to cover files under `test/` — `test/` is excluded from
  the tsconfig `include` (`tsconfig.json`) and from eslint via `ignorePatterns` (`.eslintrc`).
  Type or lint errors in `test/` will not surface there.
- Never add a test solely to raise coverage; `pnpm test` runs with `--coverage`
  (`@vitest/coverage-v8`) but the number itself is not the target.

## Reference

- Singleton reset pattern: `test/boxed.test.ts`.
- Existing suites, one topic each: `test/boxed.test.ts`, `test/unboxed.test.ts`,
  `test/item.test.ts`, `test/format.test.ts`, `test/error.test.ts`,
  `test/initialization.test.ts`, `test/decorators.test.ts`.
