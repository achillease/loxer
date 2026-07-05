# Loxer

Loxer is a TypeScript logging library, not an application (`package.json` name `loxer`, version
2.0.0, MIT, author Christian Prinz). It exposes a singleton `Loxer` logger with chainable
modifiers, custom output callbacks, error wrapping, rich item printing, and box-style trace
visualization for nested or async data flow.

## Commands

- Install with `yarn install`.
- Build with `yarn build` (`tsc`, emits `dist/` from `src/`).
- Test with `yarn test` (`jest --coverage`).
- Lint with `yarn lint` (`eslint . --ext .ts`).
- Regenerate API HTML with `yarn docs` (`typedoc --options typedoc.json`, writes `docs/`).

## Stack

TypeScript 4.4, `strict: true`, target ES5, module commonjs, declarations emitted,
`experimentalDecorators: true`. Node engine `>=10`. Sole runtime dependency is `color` (`<4`).
Tests run on Jest + ts-jest; lint runs eslint + `@typescript-eslint` + prettier. A husky
pre-commit hook runs `yarn lint`.

## Layout

- `src/` is the package source. `src/index.ts` is the public export surface.
- `src/Loxer.ts` owns the singleton logger, chaining state, initialization, queueing, level
  checks, history, and output dispatch.
- `src/core/` contains the formatting, module, history, output, box, item, and error helpers.
- `src/loxes/` contains the `Lox`, `OutputLox`, and `ErrorLox` value classes.
- `src/decorators/` contains the `@initLoxer` and `@trace` decorators.
- `test/` covers observable logger behavior and low-level formatting helpers; excluded from the
  tsconfig build and from lint.
- `documentation/` is the authored user guide.
- `docs/` is generated TypeDoc HTML and may be wiped by `yarn docs`; it also holds the
  `docs/rules/` steering docs indexed below.
- `___src/` is outside `tsconfig.json`'s `include` and is not part of the package build.

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

| Doc                                | If you're touching...                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| @docs/rules/coding-conventions.md  | src/ TypeScript (style, semicolons, `any`, public API, lint/build gates) |
| @docs/rules/testing.md             | tests, or global Loxer/box/decorator behavior                           |
| @docs/rules/documentation.md       | JSDoc, the documentation/ guide, or regenerating docs/                   |
