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

With `dedupe` left on, the plugin contributes through Vite's `config` hook:

- `resolve.dedupe: ['loxer']` — resolves to one copy of the package when several installs exist in
  the tree.
- `optimizeDeps.include: ['loxer', 'loxer/trace']`, for an **installed** Loxer — both entry points
  enter the **same** dependency-optimization run at startup. This matters because the plugin injects
  `loxer/trace` imports into files you never edited: without it, Vite discovers that entry only once
  such a file is first requested, re-optimizes mid-session, and reloads the page.
- `server.fs.allow: [<workspace root>, <Loxer's directory>]`, for a **linked** Loxer — the working
  copy lives outside the project, and Vite serves a file only from an allowed directory. The
  workspace root travels with it because a contributed list replaces Vite's default instead of
  extending it; a project that sets `fs.allow` itself gets only Loxer's directory added to the
  boundary it drew.

A linked Loxer is deliberately left out of `optimizeDeps.include`. Vite's dependency cache is keyed
on the lockfile and the resolved config, neither of which says anything about a linked package's
files, so a pre-bundle of it would go on serving the build that was current when the cache was
written — through every rebuild, until `node_modules/.vite` is deleted by hand. Kept out of the
optimizer, Loxer is served as source and a rebuild takes effect on reload. A package manager's
`node_modules` directory is what tells the two apart, so pnpm's virtual store counts as installed.

Your own values are kept: the plugin contributes only the entries you have not already listed, so
nothing is clobbered and nothing is duplicated. Set `dedupe: false` to manage all three settings
yourself.

### What `server.fs.allow` means for you

That list is the boundary deciding which files the dev server will serve to a browser, so the entry
above widens it. The directory added is wherever Loxer resolves to, which for a linked package is
outside your project — a sibling checkout, a `pnpm link` target — and it is added even when you set
`fs.allow` yourself, which is a boundary you drew deliberately. Only `vite dev` reads the list;
`vite build` and `vite preview` never do, so a production build is unaffected either way. If you want
that boundary to stay entirely yours, set `dedupe: false` and add Loxer's directory — or don't, and
let the dev server refuse to serve it.

The entry is added silently: nothing is logged, and it appears in neither your `vite.config` nor
anywhere else readable without resolving the config. `vite --debug`, or a `resolveConfig()` call, is
where to read the `server.fs.allow` the dev server actually runs with.

Loxer's logger instance is realm-scoped, so several loaded copies share one instance and one
history regardless of this setting — the config keeps the module graph tidy and the dev server from
reloading, not the logger correct.

## License

MIT © Christian Prinz
