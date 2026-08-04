# Testing rules

> Runner: Vitest, `environment: 'node'`, `globals: true` (`vitest.config.ts`). `include` picks up
> `test/**/*.test.ts` and `test/**/*.test.only.ts` (use the `.test.only.ts` suffix to run a single
> file in isolation). Legacy TS decorators are enabled via oxc (`oxc.decorator.legacy`) so the
> `@trace`/`@initLoxer` suites transpile. `describe`/`test`/`expect` and the lifecycle hooks are
> global; mocking uses `vi` (imported from `vitest`), not `jest`.

## Always

- Run `pnpm test` (`vitest run --coverage`) before treating any change to `src/` as done.
- Keep test type settings in `test/tsconfig.json` so editors discover them for files under
  `test/`. It must include `vitest/globals` and use Vite-compatible
  `moduleResolution: "bundler"`; changes to that configuration are complete only when
  `pnpm typecheck:test` passes.
- Run `pnpm typecheck:test` (`tsc -p test/tsconfig.json`) whenever a `src/` change alters a type,
  signature, or interface that a test constructs or calls directly — narrowing a field, making an
  optional field required, renaming a member, removing a static, tightening a union. `test/` sits
  outside the tsconfig `include` and the eslint `ignores`, and Vitest transpiles without
  typechecking, so `pnpm build`, `pnpm lint`, and `pnpm test` can all exit 0 while `test/` no
  longer typechecks; `pnpm typecheck:test` is the only gate that catches it.
- Keep extracted test suites as independently discovered `test/**/*.test.ts` files; do not hide
  test registrations in imported case modules behind a thin entry test.
- Drive a table of cases with `test.each`, never a `for` loop inside one `test()`. A loop lets an
  early row throw and silently skip every later row, while a per-row `test.each` failure names the
  row instead of diffing a whole array — see `test.each(traceCases)` in `test/decorators.test.ts`
  and the `isInstalledPackagePath` table in `test/vite-plugin-loxer-trace.test.ts`.
- If a change touches global logger state, call `resetLoxer()` in `afterEach` and re-init `Loxer`
  in `beforeEach` — see `test/boxed.test.ts` for the pattern.
- If a suite loads a second copy of Loxer (`vi.resetModules()`, then re-`import` the module), also
  call `clearRealmSlot('instance')` in `afterEach`. The realm slot (`src/core/Realm.ts`) lives on
  `globalThis` and deliberately outlives a module-registry reset — surviving `vi.resetModules()` is
  what makes two module copies resolve to one instance — so it is the one piece of global state
  `resetLoxer()` does not clear, and without the extra call the next test in the file inherits an
  already-initialized instance. See `test/realm-singleton.test.ts`.
- Give a suite that loads a second copy of Loxer its own `test/**/*.test.ts` file.
  `vi.resetModules()` breaks module identity for everything imported after it, so it must not run
  in a file whose other suites hold imported references.
- If a change alters box layout (open/close columns, trimming, visible slots), update or add
  expectations in `test/boxed.test.ts`. Those tests assert visible column behavior without
  terminal glyphs.
- If a change alters `@initLoxer`/`@trace` decorator-generated messages, async/promise handling,
  or props capture/rendering, update `test/decorators.test.ts`.
- To exercise `PropsPrinter` (rich props printing) in a test, init `Loxer` without `devLog` /
  `devError` callbacks — or call `PropsPrinter.of(lox).print(...)` directly. A registered
  `devLog`/`devError` callback receives the raw lox and bypasses the console fallback in
  `src/core/OutputStreams.ts`, which is the only path that calls `PropsPrinter.print`; registering
  it makes a suite assert nothing about rendered props. Use `config: { disableColors: true }` for
  plain output and mock `global.console.log` to capture it — see `test/props.test.ts`. Falsy props
  (`false`, `0`, `''`, `null`, `undefined`) render when the call chained `printProps` / `pp`.
- When reshaping public logging signatures, use a table of observable calls that covers the direct,
  open-box, and `.of(id)` entry points at every log level, including a visible `debug` module.
- When a rule must exist in two copies because the packages holding them cannot import each
  other, drive both copies from one shared table of cases and assert they agree — a comment
  claiming two suites pin the copies against each other is not a pin unless breaking either copy
  alone fails the table. `test/class-parent-name-cases.ts` drives `classParentName`
  (`src/core/TraceNames.ts`, read at run time) and its separate copy in
  `packages/babel-plugin-loxer-trace/src/marker-collection.ts` (read at build time) through three
  consumers: the runtime helper directly, the decorator end to end, and the transform through the
  messages its emitted code produces.
- Exercise a change to what a consumer executes — the code the Babel transform emits, or the
  published runtime — against the built trees after `pnpm build`, not only against `src/` through
  `pnpm test`: transform a module with `packages/babel-plugin-loxer-trace/dist` and run the emitted
  code against `dist/trace.js` and `dist/index.js`. Every suite imports source
  (`test/plain-function-trace.fixture.ts` imports `../src`, `test/vite-plugin-loxer-trace.test.ts`
  imports `../packages/vite-plugin-loxer-trace/src/index`) while a consumer imports `dist/` and
  `packages/*/dist`, so a green suite proves nothing about a stale or unbuilt artifact. A
  `playground/*.js` script already imports `../dist/index.js` and is one ready-made way in.
- Where a consumer application is on hand, finish through its dev server (`pnpm demo` runs
  `examples/vite-trace-demo`) and check the runtime it actually resolves and serves. A bundler keeps
  its own pre-bundled copy of the package — `examples/vite-trace-demo/node_modules/.vite/deps` — that
  can go on serving a frozen older `dist/` across a rebuild, a third tree neither `pnpm test` nor a
  Node-level run of `dist/` can see.
- A task touching `src/` is done only when `pnpm test` passes AND, for a box-layout or decorator
  change, the corresponding test file above was updated AND, for a type-affecting change,
  `pnpm typecheck:test` passes AND, for a change a consumer observes, the built trees were exercised
  per the two rules above.

## Never

- Never let a change cause a production-mode callback to receive a normal (non-error) log.
  `test/boxed.test.ts`'s `afterAll` asserts prod log/error arrays are empty; a regression here is
  a real failure, not test noise.
- Never expect `pnpm build` or `pnpm lint` to cover files under `test/` — `test/` is excluded from
  the tsconfig `include` (`tsconfig.json`) and from the eslint `ignores` array
  (`eslint.config.mjs`). Type or lint errors in `test/` will not surface there; run
  `pnpm typecheck:test` for the type check instead.
- Never add a test solely to raise coverage; `pnpm test` runs with `--coverage`
  (`@vitest/coverage-v8`) but the number itself is not the target.
- Never assume realm-scoped state leaks between test files, and never assume it cannot — verify.
  Each test file runs in its own process and therefore gets its own `globalThis`: two probe files
  writing a `Symbol.for` key on `globalThis` reported different `process.pid`s, including under
  `--maxWorkers=1`, because `vitest.config.ts` sets neither `pool` nor `isolate`. Adding
  `pool: 'threads'` or `isolate: false` there invalidates that without touching a single test, so
  re-run the probe before adding state that depends on the isolation.

## Reference

- Singleton reset pattern: `test/boxed.test.ts`.
- Realm-slot reset and second-module-copy loading: `test/realm-singleton.test.ts`.
- Existing suites, one topic each: `test/boxed.test.ts`, `test/unboxed.test.ts`,
  `test/props.test.ts`, `test/format.test.ts`, `test/error.test.ts`,
  `test/initialization.test.ts`, `test/decorators.test.ts`.
