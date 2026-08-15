# Trace integrations

`loxer/trace` is a build-time marker. Every application module that executes a marker must pass
through a transform. The runtime package needs no transform by itself.

| Toolchain | Path | Support |
| --- | --- | --- |
| Vite 5–8 | `vite-plugin-loxer-trace` | Verified |
| Babel 7.26.10+ or 8 | `babel-plugin-loxer-trace` | Verified |
| Vitest with Vite plugins | Vite adapter | Configured through Vite |
| Jest with `babel-jest` | Babel adapter | Configured through Babel |
| Node build with Babel | Babel adapter | Configured through Babel |

The Vite and Babel adapters require Node 20.19 or newer. A runtime `trace() is a build-time marker`
error means the executing module skipped the transform.

## Vite

```sh
pnpm add loxer
pnpm add -D @babel/core vite-plugin-loxer-trace
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({ plugins: [loxerTrace()] });
```

The adapter runs before Vite's regular transforms, returns source maps, handles `.js`, `.jsx`, `.ts`,
and `.tsx`, and skips `node_modules`. Its options filter query-stripped module ids and can disable
dedupe for linked working copies:

```ts
loxerTrace({
  include: /\.[cm]?[jt]sx?$/,
  exclude: /(?:^|[/\\])node_modules(?:[/\\]|$)/,
  dedupe: true,
});
```

When working from a linked Loxer checkout, keep both entry points out of dependency optimization:

```ts
export default defineConfig({
  plugins: [loxerTrace({ dedupe: false })],
  optimizeDeps: { exclude: ['loxer', 'loxer/trace'] },
  resolve: { dedupe: ['loxer'] },
});
```

## Babel

```sh
pnpm add loxer
pnpm add -D @babel/core @babel/preset-typescript babel-plugin-loxer-trace
```

```js
// babel.config.mjs
export default {
  presets: ['@babel/preset-typescript'],
  plugins: ['babel-plugin-loxer-trace'],
};
```

Keep any framework-required preset in the configuration and ensure every executing marker module
uses it. Hosts that already discover source files can call `transformLoxerTrace(code, options)` with
a filename, the parser plugins required by the syntax, and the desired source-map behavior. The
helper does not load project Babel configuration.

## Tests and Node builds

Vitest uses the Vite plugin in its config:

```ts
import { defineConfig } from 'vitest/config';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({ plugins: [loxerTrace()], test: { environment: 'node' } });
```

Jest must run the Babel configuration through `babel-jest`; `ts-jest` and SWC-only transforms do
not execute a Babel plugin. For a Node build, run Babel over marker-containing source, then run the
emitted ESM with Node. `tsc`, `tsx`, and `ts-node` alone do not perform the marker transform.

## Verify and choose a fallback

Build one module containing a marker, then inspect the emitted code and run the function after
`Loxer.init()`. The marker call and marker import must be absent from the output, while the function
must produce opening and closing records. Use [Tracing](./tracing.md) for a minimal example.

Vite-based applications can use the Vite path; Babel-based builds can use Babel. Hosts with a source
transform hook can call `transformLoxerTrace`. SWC, esbuild, and framework-specific component
compilers do not have a shipped adapter. Put traced functions in a transformed module, add a host
adapter, or use [manual boxes](./logging.md#manual-boxes-and-history). `.vue`, `.svelte`, and `.astro`
script blocks are outside the Vite adapter's default extension filter.

Adapter-specific setup and maintenance details live in the
[`vite-plugin-loxer-trace`](https://github.com/pcprinz/loxer/blob/master/packages/vite-plugin-loxer-trace/README.md)
and [`babel-plugin-loxer-trace`](https://github.com/pcprinz/loxer/blob/master/packages/babel-plugin-loxer-trace/README.md)
READMEs.
