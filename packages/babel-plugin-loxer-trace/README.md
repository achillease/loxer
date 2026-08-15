# Babel plugin for Loxer traces

`babel-plugin-loxer-trace` turns explicit `loxer/trace` markers into runtime instrumentation. It is
the canonical transform used by the Vite adapter.

The package is ESM-only and requires Node 20.19 or newer, `loxer` 3, and `@babel/core` 7.26.10 or
Babel 8.

## Install and configure

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

```ts
import { trace } from 'loxer/trace';

async function submitOrder(orderId: string) {
  trace.point.ORDER.info('fn', 'Submitting order', orderId);
  return { orderId };
}

trace.ORDER.props('result').info(submitOrder, {
  openMessage: 'parent.fn(args)',
  closeMessage: 'fn(result)',
});
```

The transform removes the marker and its unused import. If a marker executes, that module skipped
the build configuration and throws a diagnostic error.

For the complete setup and verification steps, read the
[Babel integration guide](../../documentation/integrations.md#babel). Marker syntax, messages,
props, trace points, and failure behavior live in the
[tracing handbook](../../documentation/tracing.md).

## Transform behavior

The plugin resolves the binding imported as `trace`, so unrelated local identifiers are untouched.
For each valid marker it injects collision-safe runtime helper imports, instruments the selected
function, and preserves callable behavior:

- `this`, real arguments, observable `.length`, and named recursion;
- synchronous returns and thrown values;
- awaited async results and rejections;
- native Promise identity for functions that return a Promise.

A call opens a Loxer box, links eligible direct calls through the imported `Loxer` binding, closes on
success, and records an error plus failed close before propagating a failure.

Options passed to a target marker are evaluated once. Options in a first-statement marker are
evaluated for each invocation. An array-literal target list shares one evaluated options value across
its targets.

## Public exports

The package exports:

- the default Babel plugin;
- `transformLoxerTrace(code, options)` for a host that owns file discovery; and
- the plugin and transform option types.

`transformLoxerTrace` accepts the source filename, Babel parser plugins, import specifiers, and source
map options. It does not read `babelrc` or `configFile`.

```ts
import { transformLoxerTrace } from 'babel-plugin-loxer-trace';

const result = await transformLoxerTrace(code, {
  filename: '/src/order.ts',
  parserPlugins: ['typescript'],
  sourceMaps: true,
});
```

## Supported boundaries

The transform accepts named function declarations, named variables initialized with a function or
arrow, array literals of named targets, first-statement markers, inline function marker forms, and
`trace.point` calls inside named functions.

It rejects ambiguous or unsupported forms at build time:

- generators and async generators;
- spread target lists or spread options;
- unresolved aliases, members, and anonymous targets without a literal `name`;
- more than one marker for one target;
- a marker used as an unsupported expression.

Only direct calls through the imported `Loxer` binding in the transformed function body join its box.
Nested functions and indirect aliases need their own marker or explicit box assignment.

## Vite

Use `vite-plugin-loxer-trace` in Vite projects. It calls this package with filename-derived parser
plugins and source maps from an `enforce: 'pre'` transform.

## Maintaining the package

```sh
pnpm --filter babel-plugin-loxer-trace build
pnpm test -- plain-function-trace
pnpm test
```

Generated code is public behavior. Transform changes require fixtures for affected callable semantics
and runtime checks against built package output.

MIT © Christian Prinz.
