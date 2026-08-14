# Environments

The trace marker (`loxer/trace`) is a build-time marker: a Babel pass over your own source replaces
it with the trace runtime calls, and the marker itself is removed. So the question "can I use the
marker here?" is one question — **can a Babel pass run over my application's own files?** — and the
answer never depends on which framework or UI library the code belongs to, only on the toolchain
that compiles it.

Three ways in, in order of how little you have to write:

1. `vite-plugin-loxer-trace` — every Vite-based tool, and everything built on one.
2. `babel-plugin-loxer-trace` in a Babel configuration — every toolchain that already runs Babel.
3. `transformLoxerTrace(code, options)`, exported from `babel-plugin-loxer-trace` — the
   single-module transform, for a tool that has a load or transform hook but no Babel.

Everything else in this page is those three applied to a specific setup.

## How to read the tables

| Status | Meaning                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅     | **Works right now.** Loxer ships everything the setup needs; the work is configuration in your own project, whatever its size.                                       |
| ⚠️     | **Needs adjustment in Loxer.** No shipped adapter reaches it. The transform runs only through a hook you write against `transformLoxerTrace`, or not at all yet.      |
| ❌     | **Not realizable.** Nothing transforms your source in that environment, so no adapter could change the outcome. Build the code elsewhere, or trace with `Loxer.open()`. |

Every **What it takes** cell opens with the effort it costs, for whoever the status names — your
project on a ✅ row, Loxer on a ⚠️ row:

| Rating     | Scope                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| **None**   | Nothing to do.                                                                                      |
| **Low**    | One configuration entry, or a few lines in a file that already exists.                              |
| **Medium** | A build step added, a loader chained, a builder swapped — or, for Loxer, an adapter modeled on one that ships. |
| **High**   | A new build pipeline, or a transform written against a second compiler.                             |

The **Proof in repo** column names the example or suite in this repository that exercises the row. A
`—` means the row follows from the toolchain's documented Babel support and has not been run here.

Babel itself: the plugin requires `@babel/core` `^7.26.10 || ^8.0.0`, and it asserts that range at
load time, so an older Babel 7 reports a version error rather than silently skipping markers.
Exercised by `test/babel7-compat.test.ts` (Babel 7.26.10) and by the rest of the suite (Babel 8).

## Bundlers and dev servers

| Toolchain                              | Status | What it takes                                                                                                       | Proof in repo                                                                     |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Vite 5, 6, 7, 8                        | ✅     | **Low** — `plugins: [loxerTrace()]` from `vite-plugin-loxer-trace`                                                       | `examples/vite-trace-demo` (Vite 8), `test/vite-plugin-build.test.ts` (Vite 5 + 8) |
| Vite with Rolldown                     | ✅     | **Low** — the same plugin; it uses only the shared plugin API                                                            | —                                                                                 |
| webpack 5 + `babel-loader`             | ✅     | **Low** — add `babel-plugin-loxer-trace` to the Babel config `babel-loader` already reads                                 | —                                                                                 |
| webpack 4 + `babel-loader` 8           | ✅     | **Low** — the same entry, with `@babel/core` at 7.26.10 or later                                                          | —                                                                                 |
| Parcel 2                               | ✅     | **Low** — a Babel config naming the plugin; Parcel runs `@parcel/transformer-babel` for custom plugins                    | —                                                                                 |
| Rollup 3, 4                            | ✅     | **Medium** — `@rollup/plugin-babel` with `extensions: ['.ts', '.tsx']`, `@babel/preset-typescript`, and the plugin        | —                                                                                 |
| webpack 5 + `ts-loader` / `swc-loader`  | ✅     | **Medium** — chain `babel-loader` ahead of it for the same files                                                          | —                                                                                 |
| Rspack 1.x                             | ✅     | **Medium** — a `babel-loader` rule for your source, alongside `builtin:swc-loader`                                        | —                                                                                 |
| esbuild, tsup                          | ⚠️     | **Medium** — an esbuild adapter shaped like the Vite one; the `onLoad` hook below is the hand-written form                | —                                                                                 |
| Bun bundler, Farm                      | ⚠️     | **Medium** — an adapter per plugin API, or one unplugin adapter covering both                                             | —                                                                                 |

## Meta-frameworks

| Framework                                       | Status | What it takes                                                                                                                        | Proof in repo |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Next.js 16+ (Turbopack, the default)            | ✅     | **Low** — `babel.config.js` with `presets: ['next/babel']` and the plugin. Turbopack runs Babel and keeps SWC for its own transforms      | —             |
| Nuxt 3, 4                                       | ✅     | **Low** — `vite: { plugins: [loxerTrace()] }` in `nuxt.config.ts`                                                                        | —             |
| React Router 7, Remix (Vite)                    | ✅     | **Low** — `plugins: [loxerTrace()]` in `vite.config.ts`                                                                                  | —             |
| TanStack Start, SolidStart, Qwik City            | ✅     | **Low** — the same, in the Vite config                                                                                                   | —             |
| Gatsby 5                                        | ✅     | **Low** — `babel.config.js` with `babel-preset-gatsby` and the plugin                                                                    | —             |
| Vue CLI 5                                       | ✅     | **Low** — add the plugin to `babel.config.js`                                                                                            | —             |
| Storybook 8, 9                                  | ✅     | **Low** — inherits the Vite or Babel configuration of the project it documents                                                           | —             |
| Expo SDK 50+, React Native 0.7x (Metro)         | ✅     | **Low** — `plugins: ['babel-plugin-loxer-trace']` in `babel.config.js`, alongside `babel-preset-expo`                                     | —             |
| Electron renderer (electron-vite, Vite)         | ✅     | **Low** — the Vite plugin in the renderer section of the config                                                                          | —             |
| Next.js 12–15, Pages Router without `next/font` | ✅     | **Low** — `babel.config.js` with the plugin; the build then compiles with Babel instead of SWC                                            | —             |
| Create React App 5 / `react-scripts`            | ✅     | **Medium** — CRACO or an eject, then the plugin in the Babel config                                                                       | —             |
| Electron main / preload (`tsc` or Babel build)   | ✅     | **Medium** — a Babel pass over the main-process source; an esbuild-bundled main process follows the esbuild row                           | —             |
| NestJS                                          | ✅     | **Medium** — a Babel step over `src`, or the webpack builder with `babel-loader`                                                          | —             |
| Angular ≤16 (webpack builder)                   | ✅     | **Medium** — `@angular-builders/custom-webpack` with a `babel-loader` rule                                                               | —             |
| SvelteKit 2, Astro 4/5, Vue 3 SFC projects       | ⚠️     | **Medium** — Vite-adapter support for script blocks; markers already work in the `.ts` modules a component imports                        | —             |
| Angular 17+ (esbuild application builder)       | ⚠️     | **Medium** — the esbuild adapter above, plus `@angular-builders/custom-esbuild` on your side                                              | —             |
| Next.js 16 with `--webpack`                     | ⚠️     | **High** — a Babel config disables SWC in webpack mode, breaking `next/font` and Server Actions; only an SWC-native transform reaches it   | —             |
| Next.js 13–15, App Router                       | ⚠️     | **High** — the same SWC opt-out, and Turbopack before 16 runs no Babel; only an SWC-native transform reaches it                            | —             |

## Runtimes and test runners without a bundler

| Environment                             | Status | What it takes                                                                                                    | Proof in repo                |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Node, ESM consumer of the built package  | ✅     | **None** — the runtime needs no transform, only the traced source does                                                | `test/dist-consumer.test.ts` |
| Node + `@babel/register`                | ✅     | **Low** — register Babel with `@babel/preset-typescript` and the plugin before importing your entry                    | —                            |
| `ts-node`, `tsx`                        | ✅     | **Low** — preload `@babel/register`; their own transpilers expose no Babel hook                                        | —                            |
| Vitest 2, 3, 4                          | ✅     | **Low** — the Vite plugin in the Vitest config's `plugins`                                                              | —                            |
| Jest 29, 30 with `babel-jest`           | ✅     | **Low** — the plugin in the Babel config `babel-jest` reads                                                             | —                            |
| Node + `tsc` only                       | ✅     | **Medium** — a `@babel/cli` pass over `src` for the emit, `tsc` for the declarations                                    | —                            |
| Jest with `ts-jest` or `@swc/jest`      | ✅     | **Medium** — move that transform to `babel-jest`, or chain Babel ahead of it                                            | —                            |
| Cloudflare Workers                      | ✅     | **Medium** — build with Vite and `@cloudflare/vite-plugin`; `wrangler`'s own esbuild exposes no plugin hook              | —                            |
| Bun (run or build)                      | ⚠️     | **Medium** — a Bun adapter; the hand-written form is a `Bun.plugin` `onLoad` handler calling `transformLoxerTrace`       | —                            |
| Deno                                    | ❌     | **High** — no transform hook anywhere in its pipeline; emit traced JavaScript with `@babel/cli` and run that            | —                            |
| Browser with no build step              | ❌     | **—** — no build means no transform. Trace with `Loxer.open()` and `Loxer.of(id)` directly                               | —                            |

## Any other toolchain

`transformLoxerTrace` is the whole transform behind both adapters, as one call over one module. Any
tool with a load or transform hook can use it — this is the esbuild form:

```typescript
import { transformLoxerTrace } from 'babel-plugin-loxer-trace';
import { readFile } from 'node:fs/promises';

export const loxerTrace = {
  name: 'loxer-trace',
  setup(build) {
    build.onLoad({ filter: /\.[cm]?tsx?$/ }, async ({ path }) => {
      const code = await readFile(path, 'utf8');
      if (!code.includes('loxer/trace')) {
        return null;
      }
      const result = await transformLoxerTrace(code, {
        filename: path,
        parserPlugins: ['typescript', ...(path.endsWith('x') ? ['jsx'] : [])],
        sourceMaps: true,
      });

      return { contents: result.code ?? code, loader: 'tsx' };
    });
  },
};
```

Two details carry over to every host: give Babel the `filename`, because a `parent.` message template
names the file a traced function is written in, and name the parser plugins the file's syntax needs.

## What no configuration reaches

- **Files inside `node_modules`.** Both adapters skip them, and a published package carries the
  transform already applied. Trace the code you compile.
- **Single-file component blocks.** A marker inside a `.vue`, `.svelte`, or `.astro` script block is
  not transformed; the Vite adapter matches `.js`, `.cjs`, `.mjs`, `.jsx`, `.ts`, `.cts`, `.mts`, and
  `.tsx`. Put the traced function in a `.ts` module the component imports.
- **Generators and async generators.** The transform reports a build error rather than tracing them.
- **Functions the transform cannot resolve at build time** — an alias, a detached helper, a computed
  member. Give such code its own marker where it is defined, or `Loxer.open()` / `Loxer.of(id)`.

## Recommendation: closing the ⚠️ rows

A note for maintainers, not a step for users. Three Medium adapters cover every ⚠️ row above except
two, and each is the Vite adapter's shape — a file filter plus one `transformLoxerTrace` call:

1. **Script blocks in the Vite adapter**, for SvelteKit, Astro and Vue SFC projects. Worth ranking
   first: it is the only gap where a marker is already written and simply produces silence rather than
   an error. The transform has to run on the script block a framework plugin extracts — the id then
   carries a query, as in `App.vue?vue&type=script&lang.ts` — which the current `enforce: 'pre'` stage
   and extension filter pass over.
2. **An esbuild adapter**, for esbuild, tsup, Angular 17+ and an esbuild-bundled Electron main
   process. The hook under [Any other toolchain](#any-other-toolchain) is the hand-written form of it.
3. **A Bun adapter**, for Bun's runtime and bundler, and a Farm one beside it.

One unplugin package would cover 2 and 3 together, and would additionally drop the Rollup, webpack
loader-chain and Rspack rows from **Medium** to **Low** — those already work, so that part is
ergonomics rather than reach.

That leaves the two **High** rows, Next.js 13–15 App Router and Next.js 16 with `--webpack`, which no
Babel-based adapter reaches; both need the transform written against SWC. Next.js 16 on Turbopack is
**Low** today, so those two rows are a back catalogue rather than a live audience. The stronger
argument for that work is elsewhere in the tables: an SWC-native transform is also what drops the
`ts-loader` / `swc-loader` chain and Rspack rows from **Medium** to **Low**, and those setups pay
their Babel pass on every build, forever.
