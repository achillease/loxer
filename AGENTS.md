# Loxer

Loxer is a TypeScript logging library, not an application (`package.json` name `loxer`, version
2.0.0, MIT, author Christian Prinz). It exposes a singleton `Loxer` logger with chainable
modifiers, custom output callbacks, error wrapping, rich item printing, and box-style trace
visualization for nested or async data flow.

## Commands

- Install with `pnpm install`.
- Build with `pnpm build` (`tsc`, emits `dist/` from `src/`).
- Test with `pnpm test` (`vitest run --coverage`).
- Lint with `pnpm lint` (`eslint .`, flat config `eslint.config.mjs`).
- Regenerate API HTML with `pnpm docs` (`typedoc --options typedoc.json`, writes `docs/`).

## Stack

TypeScript ~6.0, `strict: true`, target ES2022, declarations emitted,
`experimentalDecorators: true`. The package is ESM-only: `package.json` sets `"type": "module"`,
and the single `tsconfig.json` sets `module`/`moduleResolution` to `"nodenext"`, emitting one
ES-module tree to `dist/` — there is no CommonJS build. Consumers import it as ESM; a CJS
consumer on Node 22+ can still `require()` it via Node's `require(esm)` interop, but on the Node
20 floor must use dynamic `import()`. The published package's `engines.node` is now `>=20`
(itself EOL, an accepted tradeoff) — up from `>=10`. `packageManager: pnpm@10.27.0` pins the
package manager for local development. There are zero runtime dependencies: the former `color`
dependency was removed and its parsing logic vendored into `src/core/color/`. Tests run on
Vitest; lint runs eslint 10 (flat config) + `typescript-eslint` 8 + prettier 3. A husky
pre-commit hook (`.husky/pre-commit`) runs `pnpm lint`.

## Layout

- `src/` is the package source. `src/index.ts` is the public export surface.
- `src/Loxer.ts` owns the singleton logger, chaining state, initialization, queueing, level
  checks, history, and output dispatch.
- `src/core/` contains the formatting, module, history, output, box, item, and error helpers,
  plus `src/core/color/` (vendored color parsing, replacing the former `color` dependency).
- `src/loxes/` contains the `Lox`, `OutputLox`, and `ErrorLox` value classes.
- `src/decorators/` contains the `@initLoxer` and `@trace` decorators.
- `test/` covers observable logger behavior and low-level formatting helpers; excluded from the
  tsconfig build and from lint.
- `documentation/` is the authored user guide.
- `docs/` is generated TypeDoc HTML and may be wiped entirely by `pnpm docs` (`cleanOutputDir`);
  never put hand-written files there. Steering docs live in `rules/` instead, indexed below.
- `___src/` is outside `tsconfig.json`'s `include` and is not part of the package build.
- `playground/` holds hand-written, runnable usage examples (`playground.js`, `items.js`,
  `docs.js`, `Logo.js`, `Speedtest.js`, `OrderService.js`) that import the built package from
  `../dist/index.js` — not covered by the tsconfig build, lint, or test config, so nothing in CI
  catches when they break. After `pnpm build`, run one with `node playground/<file>.js` and keep
  its imports in sync with the package's module format and public export surface.

## Behavior

- `Loxer` is a singleton with intentionally one-shot modifier state (`highlight`, `level`,
  `module`) that resets after each logging operation.
- Logs created before `Loxer.init()` are queued and replayed on init; uninitialized logging must
  not silently disappear.
- Production output defaults to silence — user callbacks are the production integration point.
- Errors are always output when enabled, even when their level would hide a normal log.
- Hidden normal logs must not enter history or the visible open-box buffer, but open/close state
  stays consistent for later `.of(...)` calls.

## Steering Docs

Read the matching doc before touching that area — it holds the enforceable rules, not this file.

| Doc                             | If you're touching...                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| @rules/coding-conventions.md    | src/ TypeScript (style, semicolons, `any`, public API, lint/build gates) |
| @rules/testing.md               | tests, or global Loxer/box/decorator behavior                           |
| @rules/documentation.md         | JSDoc, the documentation/ guide, or regenerating docs/                   |
