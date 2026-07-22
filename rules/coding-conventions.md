# Coding Conventions

> Stack: TypeScript 6.0 (`6.0.3`), `strict: true`, target ES2022, ESM-only — `"type": "module"`
> and `"module"`/`"moduleResolution": "nodenext"` (`tsconfig.json`), one emitted module tree in
> `dist/`, NOT commonjs and NOT a dual build. `experimentalDecorators: true`. `include` is
> `["src"]` only. Node engine `>=20` (`package.json`).

## Always

- Keep the existing semicolon style in `src/**/*.ts`. `.prettierrc.json` sets `"semi": true`, so
  prettier enforces semicolons and a format pass will not strip them; do not change this.
- Match `.prettierrc.json` on everything else: `printWidth: 100`, `tabWidth: 2`,
  `singleQuote: true`, `trailingComma: "es5"`, `arrowParens: "always"`.
- Preserve the export surface of `src/index.ts`. A breaking change to it requires an explicit
  task instruction, not an incidental refactor.
- Treat explicit `any` as allowed only where a logger API intentionally accepts arbitrary
  runtime values (`@typescript-eslint/no-explicit-any` is `"off"` in `eslint.config.mjs` for this
  reason, not as a general license).
- Give every relative import/export in `src/**/*.ts` an explicit extension: `.js` for a file
  (`import { Lox } from '../loxes/Lox.js'`) and `/index.js` for a directory barrel
  (`from './color/index.js'`). The extension names the emitted `.js` file, not the `.ts` source —
  `tsc` never rewrites specifiers, and under `nodenext` Node's ESM loader does no extension
  guessing, so a bare specifier (e.g. `from '.'`) builds under some configs but fails at runtime.
  `pnpm build` (`nodenext`) hard-errors on a miss.
- A change under `src/**/*.ts` is done only when `pnpm lint` and `pnpm test` both exit 0. A
  change touching `tsconfig.json` or type declarations is done only when `pnpm build` also
  exits 0.

## Never

- Never shadow a variable name — `@typescript-eslint/no-shadow` is `"error"` in
  `eslint.config.mjs` (the base `no-shadow` is off in favor of this typed version).
- Never rely on `pnpm lint` to catch issues in `test/`, `*.js`, or `*.json` files —
  `eslint.config.mjs`'s `ignores` array excludes `node_modules/`, `dist/`, `test/`, `documentation/`,
  `docs/`, `___src/`, and `*.js`/`*.mjs`/`*.cjs`/`*.json`; lint only covers `src/**/*.ts`.
- Never write code that `tsconfig.json`'s `strict`, `noImplicitAny`, or `strictNullChecks`
  would reject (e.g. an implicit `any` parameter, or reading a possibly-null value without a
  guard).
- Never make formatting-only edits to `src/**/*.ts` unless the task itself is a formatting
  task — mixing formatting churn into a behavior change obscures the diff.

## Reference

- Lint rules: `eslint.config.mjs` (flat config). Format rules: `.prettierrc.json`. Compiler
  options: `tsconfig.json`.
- `pnpm build` emits `dist/` from `src/` via `tsc`; `pnpm lint` runs `eslint .`.
