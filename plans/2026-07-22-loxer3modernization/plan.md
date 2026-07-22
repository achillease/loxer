# Plan: loxer 3.0.0 modernization (deps, dual ESM+CJS, drop `color`, toolchain)

> Grounding: architect (technical) consulted · web-researcher (selection) consulted
> Spec: none (planned from framed problem)

## Context

`loxer@2.0.0` ships as **CommonJS / target ES5 / `engines.node >=10`** with a stale dev toolchain
(every devDep 3–4 majors behind) and one runtime dependency, `color <4`. The motivation is a
safety-driven major release: shrink the supply-chain surface, stop advertising support for EOL
runtimes and unmaintained tooling, and modernize the output format for current consumers.

The decisive constraint the analysts surfaced: `color@5` is ESM-only and would force a module-format
decision anyway, yet `color` is used in exactly **one** place ([ANSIFormat.ts:1](../../../src/core/ANSIFormat.ts#L1))
for exactly one thing — parsing a CSS color string to RGB (`Color(str).red()/green()/blue()`). That
makes dropping the dependency entirely (by vendoring the MIT parse code) both the smallest-surface and
the safest option, and it removes the only ESM-interop-sensitive import in the codebase.

Decisions settled with the user:
- ~~**Dual ESM+CJS** publishing (not ESM-only) — preserves `require('loxer')` consumers.~~
  **REVISED 2026-07-22 (post-implementation): ESM-only.** The user reversed this: publish a single
  modern ES-module build, dropping the CommonJS artifact and all its scaffolding (per-format
  tsconfigs, the `dist/{cjs,esm}` split, the package.json `type` shims). CJS consumers on Node 22+
  still load it via Node's `require(esm)` interop; on Node 20 they use dynamic `import()`.
- **`engines.node >=20`** for broader reach. *Accepted caveat:* Node 20 reached EOL 2026-04-30, so the
  declared floor is itself unmaintained; the lowest maintained LTS is 22. Documented as a known risk.
- **TypeScript `~6.0`** — the newest line that keeps TypeDoc 0.28 and typescript-eslint 8 working
  (both cap their peer range below TS 7.x; TS 7 has no stable programmatic API until 7.1).

## Approach

One coordinated major bump, sequenced so each slice is independently verifiable. Recommended order:

**1. Vendor the color parser, drop the `color` dependency (self-contained, unblocks nothing else but
lowest risk — do first).**
Create `src/core/color/` (new module) replicating `Color(str).rgb()` for hex, `rgb()`, `hsl()`,
`hwb()`, and named-color inputs — the full breadth `color` accepts, because module `color` is an
unvalidated free-form `string` ([types.ts:144](../../../src/types.ts#L144)) and named/functional
notations are load-bearing. Vendor from the **verified 1.x sources** (the code loxer runs today), not
the 2.x/3.x `latest` refactor:
- `color-string@1.6.0` — `get`, `get.rgb`, `get.hsl`, `get.hwb`, `clamp` (~120 lines; drop all `to.*`
  serializers, which eliminates the `simple-swizzle` transitive dep).
- `color-name@1.1.4` — the named-color table.
- `color-convert@1.9.3` — only `hsl.rgb` and `hwb.rgb` (two pure ~40-line functions).
Carry each source's **MIT license text + original copyright line** (Heather Arthur for
color-string/color-convert; Dmitry Ivanov for color-name) as a file header. **Apply the array-copy
fix**: 1.x `get.rgb` mutates the shared name-table array on a keyword hit — copy with `.slice()` before
returning. Preserve `color`'s throw-on-unparseable contract so error behavior on bad color strings is
unchanged. Rewrite [ANSIFormat.ts](../../../src/core/ANSIFormat.ts) to import the local parser. Drop
`color` and `@types/color` from `package.json`; `dependencies` becomes empty.

**2. Retarget the compiler + drop `tslib`.**
`target` ES5 → **ES2022**, drop the (already-dead — `importHelpers` is off, so it was never imported)
`tslib` devDep. Note the **intentional behavior correction**: under ES5 emit, `NamedError`/`LoxerError`
([Error.ts:6](../../../src/core/Error.ts#L6), [Error.ts:56](../../../src/core/Error.ts#L56)) fail
`instanceof` (the classic ES5 built-in-subclass break); native ES2022 classes fix this. No test depends
on the broken behavior ([error.test.ts](../../../test/error.test.ts) asserts only `.name`/`.message`/
`.stack`).

**3. ~~Dual ESM+CJS build~~ → ESM-only build with tsc (no bundler — zero runtime deps makes a bundler
pointless).** *(Revised: originally dual; now single ESM build per the user's decision reversal.)*
~~Three tsconfigs (base + cjs + esm), `dist/{cjs,esm}` split, per-format package.json `type` shims
written by `scripts/write-pkg-shims.mjs`, and an `exports` map with both `import`/`require`
conditions.~~ **As built:** one `tsconfig.json` (`module`/`moduleResolution: nodenext`, `target
ES2022`, `outDir: dist`, `experimentalDecorators`, `declaration`, `esModuleInterop`); `build` is a
plain `tsc`. Root `package.json` stays `"type": "module"`, so no per-dir shims are needed — the
shim script and the extra tsconfigs are deleted. **The one required source change (still applies):**
explicit `.js` extensions on every relative import in `src/` (`nodenext` enforces this). `exports`
map is root-only: `{ types, default }` → `./dist/index.js` (no `require` condition); `main`/`types`
point at the same single tree. `tsBuildInfoFile` lives under `node_modules/.cache/` so the
incremental cache never ships.

**4. Dev-toolchain upgrade.**
`typescript ~6.0`, `eslint ^10` + `typescript-eslint ^8.65` (meta-package, `tseslint.config(...)`) +
`eslint-config-prettier ^10` + `eslint-plugin-prettier ^5` + `prettier ^3`, migrating `.eslintrc.json`
→ flat `eslint.config.js` (carry the load-bearing rules: `@typescript-eslint/no-shadow: error`,
`@typescript-eslint/no-explicit-any: off`, `prettier/prettier`, and the ignore set; lint script loses
`--ext`). `typedoc ^0.28`, dropping the incompatible `typedoc-neo-theme` and updating `typedoc.json` to
the current option schema. `husky ^9`: remove the dead `package.json` `husky` key, create
`.husky/pre-commit` running `pnpm lint`, fold into `prepare` (`husky && pnpm build`). `@types/node ^20`
(matching the declared floor). `engines.node >=20`.

**5. Publish safety.**
Add `pnpm audit` gate + `npm publish --provenance` (CI/OIDC) to the release path; commit
`pnpm-lock.yaml`; verify the tarball with `npm pack --dry-run`.

## Critical files

- `src/core/ANSIFormat.ts` — sole `color` consumer (import + `Color()` at lines 54, 99; `.red/green/blue` at 58–60, 104–106). Rewrite to the local parser.
- `src/core/color/` — **new** vendored parser module (parse + name table + hsl/hwb→rgb), with MIT headers.
- `src/core/Error.ts` — the two `extends Error` classes; ES5→ES2022 `instanceof` correction lands here.
- `src/Loxer.ts` — `export let Loxer` + `resetLoxer` ([Loxer.ts:409](../../../src/Loxer.ts#L409)); the CJS/ESM live-binding risk (see Risks). Also `process.env.NODE_ENV` at [Loxer.ts:42](../../../src/Loxer.ts#L42).
- `src/index.ts` — public root surface (8 re-exports); governs what the `exports` map exposes.
- all relative imports under `src/**/*.ts` — add `.js` extensions.
- `package.json` — deps, `engines`, `exports`/`main`/`module`/`types`/`type`/`files`, scripts, husky key removal.
- `tsconfig.json` → split into `tsconfig.base.json` + `tsconfig.cjs.json` + `tsconfig.esm.json`.
- `scripts/write-pkg-shims.mjs` — **new** per-dir `{"type":...}` shim writer.
- `.eslintrc.json` → `eslint.config.js` (**new**, flat); `.prettierrc.json` (keep semicolon override).
- `typedoc.json` — new option schema, drop `typedoc-neo-theme`.
- `.husky/pre-commit` — **new**.
- `vitest.config.ts` — expected unaffected (tests use raw `src` via oxc + relative paths; see Risks).

## Risks & open questions

- **Node 20 floor is EOL (accepted).** User chose `>=20` for reach; the declared floor is unmaintained
  as of 2026-04-30. Documented tradeoff — revisit to `>=22` if a security posture requires it.
- ~~**`export let Loxer` live-binding differs across CJS/ESM.**~~ **Moot after the ESM-only revision** —
  there is no CJS artifact, so the `export let Loxer` / `resetLoxer()` reassignment has a single (ESM
  live-binding) semantics. No divergence to guard.
- **ESM-only drops synchronous `require` on Node < 22.** With no `require` condition, CJS consumers on
  Node 22+ still load loxer via Node's `require(esm)` interop, but on the Node 20 floor they must use
  dynamic `import()`. Call this out prominently in the changelog/migration notes as the headline break.
- **`exports` map severs deep imports.** Today `require('loxer/dist/core/Error')` works; a root-only
  `exports` map cuts it off. Acceptable for a major, but call it out in the changelog/migration notes.
- **`.js`-extension rewrite is broad but mechanical.** `moduleResolution: node16` turns any miss into a
  compile error, so the build gate catches omissions.
- **Toolchain configs are version-incompatible, not just outdated** — eslint flat config, prettier 3
  (handled by eslint-plugin-prettier 5), typedoc option-schema + theme removal, husky hook relocation
  each need real migration, not a version bump. Sequenced last so build/test are green first.
- **`process.env.NODE_ENV`** ([Loxer.ts:42](../../../src/Loxer.ts#L42)) throws in a browser ESM bundle
  where `process` is undefined. Pre-existing; a dual ESM artifact makes browser bundling likelier.
  Note as a portability caveat; guarding it is optional scope.
- **Open:** confirm the exact TS 6.0 GA patch (`npm view typescript@6 version` — dist-tag `beta` may be
  stale) at implementation time.
- **Open:** `BoxFactory`'s `export *` may widen the public surface beyond `BoxFactory`; enumerate before
  finalizing the `exports` map if an exhaustive public-surface audit is wanted.

## Verification

> Revised for the ESM-only decision (see Context + Approach step 3): a single `dist/` tree, no
> `dist/{cjs,esm}` split and no per-format shims.

- `pnpm build` exits 0 producing a **single** `dist/` ES-module tree with `.d.ts` (required for
  tsconfig/type-declaration changes per coding-conventions).
- `pnpm test` (`vitest run --coverage`) green — including the box-layout, decorator, item, and error
  suites; add/adjust color-parser tests covering hex, `rgb()`, `hsl()`, `hwb()`, named, and
  unparseable-input (throw contract) since the parser is new code.
- `pnpm lint` exits 0 under the new flat config.
- `pnpm docs` exits 0 under typedoc 0.28 (documentation rule: JSDoc change ⇒ regenerate).
- **Resolution smoke test:** a scratch `import ... from 'loxer'` (ESM) against the packed tarball
  resolves and runs; `require('loxer')` works only via Node 22+'s `require(esm)` interop (on the
  Node 20 floor a CJS consumer must use dynamic `import()` — the headline break, see Risks). Plus
  `npm pack --dry-run` to confirm `files`/tarball contents (single `dist/`, no `.tsbuildinfo`).
- `pnpm audit --prod` clean (trivial — zero runtime deps after slice 1).
