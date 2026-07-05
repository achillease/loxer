# Testing rules

> Runner: Jest + ts-jest, `testEnvironment: node` (`jest.config.js`). `testMatch` picks up
> `*.test.ts` and `*.test.only.ts` (use the `.test.only.ts` suffix to run a single file in
> isolation).

## Always

- Run `yarn test` (`jest --coverage`) before treating any change to `src/` as done.
- If a change touches global logger state, call `resetLoxer()` in `afterEach` and re-init `Loxer`
  in `beforeEach` — see `test/boxed.test.ts` for the pattern.
- If a change alters box layout (open/close columns, trimming, visible slots), update or add
  expectations in `test/boxed.test.ts`. Those tests assert visible column behavior without
  terminal glyphs.
- If a change alters `@initLoxer`/`@trace` decorator-generated messages, async/promise handling,
  or item capture, update `test/decorators.test.ts`.
- A task touching `src/` is done only when `yarn test` passes AND, for a box-layout or decorator
  change, the corresponding test file above was updated.

## Never

- Never let a change cause a production-mode callback to receive a normal (non-error) log.
  `test/boxed.test.ts`'s `afterAll` asserts prod log/error arrays are empty; a regression here is
  a real failure, not test noise.
- Never expect `yarn build` or `yarn lint` to cover files under `test/` — `test/` is excluded from
  the tsconfig `include` (`tsconfig.json`) and from eslint via `ignorePatterns` (`.eslintrc`).
  Type or lint errors in `test/` will not surface there.
- Never add a test solely to raise coverage; `yarn test` runs with `--coverage` but the number
  itself is not the target.

## Reference

- Singleton reset pattern: `test/boxed.test.ts`.
- Existing suites, one topic each: `test/boxed.test.ts`, `test/unboxed.test.ts`,
  `test/item.test.ts`, `test/format.test.ts`, `test/error.test.ts`,
  `test/initialization.test.ts`, `test/decorators.test.ts`.
