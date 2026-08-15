# vite-plugin-loxer-trace

Vite adapter for Loxer's build-time function markers and contextual trace points. It delegates the
transform to `babel-plugin-loxer-trace` and supplies Vite filtering, parser selection, source maps,
and single-copy configuration.

The package requires Node 20.19 or newer, `loxer` 3, `@babel/core` 7.26.10 or Babel 8, and Vite 5–8.

## Install

```sh
pnpm add loxer
pnpm add -D @babel/core vite-plugin-loxer-trace
```

## Configure and verify

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({
  plugins: [loxerTrace()],
});
```

```ts
import { trace } from 'loxer/trace';

function placeOrder(id: string) {
  trace.point.ORDER.info('fn', 'Placing order', id);
}

trace.ORDER.info(placeOrder, { openMessage: 'fn(args)' });
```

Run the normal Vite build. The emitted module contains runtime helper calls and no `trace` marker.
An executing marker throws a missing-transform error.

Read the [Vite integration guide](../../documentation/integrations.md#vite) for the full setup and
the [tracing handbook](../../documentation/tracing.md) for marker syntax.

## Options

```ts
loxerTrace({
  include: /\.[cm]?[jt]sx?$/,
  exclude: /(?:^|[/\\])node_modules(?:[/\\]|$)/,
  dedupe: true,
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `include` | JavaScript/TypeScript and JSX/TSX extensions | Module ids eligible for transform |
| `exclude` | `node_modules` | Module ids skipped before `include` |
| `dedupe` | `true` | Contribute the single-copy Vite config |

Patterns receive the module id with its query string removed. Global and sticky expressions are safe;
the adapter resets `lastIndex` for each test.

The plugin runs with `enforce: 'pre'`, derives Babel parser plugins from the filename, and returns
source maps for composition with later Vite transforms. A file without `loxer/trace` is returned
without a Babel pass.

## Single-copy config

With `dedupe` enabled, the `config` hook contributes missing entries to:

- `resolve.dedupe: ['loxer']`;
- `optimizeDeps.include: ['loxer', 'loxer/trace']`.

Putting both entry points into one dependency-optimization run avoids a reload when generated helper
imports reveal `loxer/trace` later in development. Existing user values remain intact. Loxer's
realm-scoped singleton shares state across loaded copies; this configuration keeps the module graph
and optimizer stable.

## Linked working copies

Vite's dependency cache does not use edits inside a linked package as a cache key. For a Loxer
working copy, manage optimization explicitly:

```ts
export default defineConfig({
  plugins: [loxerTrace({ dedupe: false })],
  optimizeDeps: { exclude: ['loxer', 'loxer/trace'] },
  resolve: { dedupe: ['loxer'] },
});
```

This keeps Vite resolving the working copy by real path so rebuilds reach the page.

## Boundaries

The default filter handles `.js`, `.cjs`, `.mjs`, `.jsx`, `.ts`, `.cts`, `.mts`, and `.tsx`. It does
not transform script blocks embedded in `.vue`, `.svelte`, or `.astro` files. Put traced functions in
an imported module or supply a host-specific transform for the extracted block.

MIT © Christian Prinz.
