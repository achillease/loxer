# Five-minute Vite trace

This path instruments one TypeScript function, writes a contextual trace point, and verifies the
result in a browser console. It requires Node 20.19 or newer and an existing Vite 5, 6, 7, or 8
project.

## 1. Install the runtime and adapter

```sh
pnpm add loxer
pnpm add -D @babel/core vite-plugin-loxer-trace
```

`loxer` has no runtime dependencies. The Vite adapter delegates to Babel for the marker transform.

## 2. Register the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({
  plugins: [loxerTrace()],
});
```

The adapter runs before Vite's regular transforms and handles `.js`, `.jsx`, `.ts`, and `.tsx`
source outside `node_modules`.

## 3. Initialize Loxer and mark a function

```ts
import { Loxer, type LoxerModules } from 'loxer';
import { trace } from 'loxer/trace';

const modules = {
  ORDER: {
    color: '#73e2a7',
    fullName: 'Order',
    devLevel: 'debug',
    prodLevel: 'error',
  },
} satisfies LoxerModules;

declare module 'loxer' {
  interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
}

Loxer.init({ dev: true, modules });

async function submitOrder(orderId: string) {
  trace.point.ORDER.info('Persisting the submitted order', { orderId });
  await new Promise((resolve) => setTimeout(resolve, 16));
  return { orderId, status: 'submitted' };
}

trace.ORDER.props('result').info(submitOrder);

void submitOrder('A-42');
```

The `trace.ORDER.info(...)` statement is a build-time marker. The plugin removes it and instruments
`submitOrder`. `trace.point.ORDER.info(...)` becomes one contextual log inside that invocation.

## 4. Verify the result

Start Vite with the command your project defines and open its browser console. The default development
stream includes the module color, box glyphs, and elapsed time. At 120 columns it looks like this:

![Default Loxer development output for submitOrder](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/submit-order-default.png)

The first and last records share a box. The trace point sits between them. The closing record carries
the returned object as a prop because `.props('result')` selected it.

If the browser throws `trace() is a build-time marker`, the file did not pass through the adapter.
Check that the plugin is in the active Vite config and that the file is not excluded.

## 5. Try the repository demo

From a Loxer checkout:

```sh
pnpm build
pnpm demo
```

The demo exercises sync, rejected async, and overlapping traces and renders the real output callback
events in the page.

Next: learn how [tracing](./tracing.md) works, or open the complete
[integration guide](./integrations.md).
