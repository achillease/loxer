# vite-plugin-loxer-trace

Vite adapter for Loxer's plain-function tracing. It rewrites every `trace(...)` marker in your
source into the instrumentation Loxer needs, so a traced function opens and closes its own box on
each invocation without you writing a single log call.

The transform itself lives in `babel-plugin-loxer-trace`; this package is the Vite wiring around it.

## Install

```sh
npm install --save-dev vite-plugin-loxer-trace
```

`loxer`, `vite` and `@babel/core` are peer dependencies.

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({
  plugins: [loxerTrace()],
});
```

The plugin runs with `enforce: 'pre'`, ahead of Vite's own transforms. Then mark the functions you
want traced:

```typescript
import { trace } from 'loxer/trace';

function placeOrder(id: string) {
  /* ... */
}

trace(placeOrder, { moduleId: 'ORDER' });
```

A file is transformed only when it mentions `loxer/trace`, so files without a marker cost nothing.

## Options

```typescript
loxerTrace({
  include: /\.[cm]?[jt]sx?$/,
  exclude: /(?:^|[/\\])node_modules(?:[/\\]|$)/,
  dedupe: true,
});
```

| Option    | Type      | Default                       | Meaning                                          |
| --------- | --------- | ----------------------------- | ------------------------------------------------ |
| `include` | `RegExp`  | any `.js`/`.jsx`/`.ts`/`.tsx` | which module ids may be transformed              |
| `exclude` | `RegExp`  | anything under `node_modules` | which module ids are skipped, checked first      |
| `dedupe`  | `boolean` | `true`                        | contribute the single-copy Vite config (below)   |

Both patterns are matched against the module id with its query string stripped, and a global or
sticky expression is safe to reuse — the plugin resets `lastIndex` around every test.

TypeScript and JSX are detected from the file extension, and Babel source maps are passed back to
Vite, so breakpoints and stack traces stay on your own source.

## The single-copy config

With `dedupe` left on, the plugin contributes two settings through Vite's `config` hook:

- `optimizeDeps.include: ['loxer', 'loxer/trace']` — both entry points enter the **same**
  dependency-optimization run at startup. This matters because the plugin injects `loxer/trace`
  imports into files you never edited: without it, Vite discovers that entry only once such a file
  is first requested, re-optimizes mid-session, and reloads the page.
- `resolve.dedupe: ['loxer']` — resolves to one copy of the package when several installs exist in
  the tree.

Your own values are kept: the plugin contributes only the entries you have not already listed, so
nothing is clobbered and nothing is duplicated. Set `dedupe: false` to manage both settings
yourself.

Loxer's logger instance is realm-scoped, so several loaded copies share one instance and one
history regardless of this setting — the config keeps the module graph tidy and the dev server from
reloading, not the logger correct.

## License

MIT © Christian Prinz
