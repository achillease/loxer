# Coding Conventions

> Stack: TypeScript, `strict: true`, target ES5, module commonjs, `experimentalDecorators: true`
> (`tsconfig.json`). `include` is `["src"]` only. Node engine `>=10` (`package.json`).

## Always

- Keep the existing semicolon style in `src/**/*.ts`, even though `.prettierrc.json` sets
  `"noSemi": true`. Never run a format-only pass that strips semicolons.
- Match `.prettierrc.json` on everything else: `printWidth: 100`, `tabWidth: 2`,
  `singleQuote: true`, `trailingComma: "es5"`, `arrowParens: "always"`.
- Preserve the export surface of `src/index.ts`. A breaking change to it requires an explicit
  task instruction, not an incidental refactor.
- Treat explicit `any` as allowed only where a logger API intentionally accepts arbitrary
  runtime values (`@typescript-eslint/no-explicit-any` is `"off"` in `.eslintrc.json` for this
  reason, not as a general license).
- A change under `src/**/*.ts` is done only when `yarn lint` and `yarn test` both exit 0. A
  change touching `tsconfig.json` or type declarations is done only when `yarn build` also
  exits 0.

## Never

- Never shadow a variable name — `@typescript-eslint/no-shadow` is `"error"` in
  `.eslintrc.json` (the base `no-shadow` is off in favor of this typed version).
- Never rely on `yarn lint` to catch issues in `test/`, `*.js`, or `*.json` files —
  `.eslintrc.json`'s `ignorePatterns` excludes `node_modules/`, `dist/`, `test/`, `*.js`, and
  `*.json`; lint only covers `src/**/*.ts`.
- Never write code that `tsconfig.json`'s `strict`, `noImplicitAny`, or `strictNullChecks`
  would reject (e.g. an implicit `any` parameter, or reading a possibly-null value without a
  guard).
- Never make formatting-only edits to `src/**/*.ts` unless the task itself is a formatting
  task — mixing formatting churn into a behavior change obscures the diff.

## Reference

- Lint rules: `.eslintrc.json`. Format rules: `.prettierrc.json`. Compiler options:
  `tsconfig.json`.
- `yarn build` emits `dist/` from `src/` via `tsc`; `yarn lint` runs `eslint . --ext .ts`.
