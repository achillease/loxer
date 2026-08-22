# Tracing functions

Loxer tracing combines a build-time marker with runtime logging. A plugin replaces the marker with
instrumentation that opens a box for each invocation, places direct Loxer calls in that box, and
closes it when the function returns, throws, fulfills, or rejects. The transformed function remains
an ordinary callable.

Import the marker from `loxer/trace` and configure either the Vite or Babel transform described in
[Integrations](./integrations.md). If a marker reaches runtime, it throws an error that names the
missing configuration.

## Mark a function

```ts
import { trace } from 'loxer/trace';

async function submitOrder(orderId: string) {
  trace.point.ORDER.info('Persisting the submitted order', { orderId });
  await repository.save(orderId);
  return { orderId, status: 'submitted' };
}

trace.ORDER.info(submitOrder);
```

With Loxer initialized for development, the default stream renders this lifecycle in a 120-column
terminal:

![Default Loxer development output for submitOrder](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/submit-order-default.png)

The terminal selects a level: `error`, `warn`, `log`, `info`, or `debug`; `log` has the `info`
level. Use a typed direct module property such as `ORDER`, or `trace.m('ORDER')` /
`trace.module('ORDER')`. Direct module properties that collide with marker members require `m()`.

Supported target forms are named function declarations, named variables initialized with a function
or arrow function, a literal array of supported targets, and an inline function value. A marker can
also be the first statement inside a function:

```ts
button.addEventListener('click', async () => {
  trace.ORDER.info({ name: 'submitFromButton' });
  await submitOrder('A-42');
});

const run = trace.ORDER.info(() => submitOrder('A-42'), { name: 'runOrder' });
```

An inline target or anonymous surrounding function needs a literal `name` where the transform cannot
infer one. Arrays share an options expression, evaluated once, while a first-statement marker reads
its options for each invocation.

## Shape a lifecycle

Modifiers describe one marker operation and are one-shot. Long and short forms are available for
`module`/`m`, `highlight`/`h`, `noColumn`/`nc`, and `printProps`/`pp` where supported.

```ts
trace.ORDER
  .h('open')
  .props('argsResult')
  .pp({ target: 'args', depth: 1 })
  .info(submitOrder);
```

`h()` or `h(true)` highlights both sides; `h('open')`, `h('close')`, and `h('all')` select a side.
`props('args')`, `props('result')`, and `props('argsResult')` retain original values for output
callbacks. `pp()` requests development rendering of selected props.

The marker chain mirrors the logging chain's `nc()` modifier: `trace.ORDER.nc().info(submitOrder)`
opens the lifecycle box without reserving a column, the way `Loxer.m('ORDER').nc().open(...)` does
for a manual box (see [manual boxes](./logging.md#manual-boxes-and-history)). Chaining it twice on
one marker is a compile error.

Opening templates are `fn`, `parent.fn`, `fn(types)`, `parent.fn(types)`, `fn(args)`, and
`parent.fn(args)`. Closing templates are `fn`, `parent.fn`, `fn(result)`, and `parent.fn(result)`.
Callbacks support per-call messages:

```ts
trace.ORDER.info(submitOrder, {
  openMessage: ({ args: [orderId], parentFn }) => parentFn(`order=${orderId}`),
  closeMessage: ({ result, fn }) => fn(result.status),
});
```

The open callback receives `{ args, fn, parentFn }`; the close callback receives
`{ result, fn, parentFn }`. A failed call writes a failure close message and does not call the close
callback. Async traces observe a native Promise without replacing it.

## Add a contextual point

`trace.point` writes one log without opening a nested box. In a transformed, traced function it
joins the current invocation.

```ts
async function submitOrder(orderId: string) {
  trace.point.ORDER.info('Persisting the submitted order', { orderId });
  await repository.save(orderId);
  return { orderId, status: 'submitted' };
}
```

Use a message directly, prefix it with `fn` or `parent.fn`, or build it with a callback that receives
`{ fn, parentFn }`:

```ts
trace.point.info(({ parentFn }) => parentFn('cache hit'), cacheKey);
trace.point.ORDER.h().pp({ depth: 2 }).debug('fn', 'Loaded basket', basket);
```

A terminal called with nothing at all reports the surrounding call, the way `'parent.fn'` does — a
point inside `Checkout.calculate` reads as `Checkout.calculate()`:

```ts
trace.point.debug();
```

Multiple trace points stay on the surrounding lifecycle rather than opening more boxes:

![Default Loxer development output for contextual trace points](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/trace-points-default.png)

Points have `error`, `warn`, `log`, `info`, and `debug` terminals. Point `error` is an error-level
record on the normal log stream; use `Loxer.error()` when the destination needs an error event with
error context.

## Trace behavior and boundaries

Each call has its own box id, so overlapping async calls stay distinct. Synchronous returns close
immediately. A throw or rejection writes an error in the box, closes as failed, and propagates the
same error. Direct calls through the imported `Loxer` binding inside a transformed target join that
target; nested functions, detached aliases, and indirect logger calls stay ordinary unless marked.

![Default Loxer development output for overlapping boxes](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/overlapping-boxes-default.png)

The transform accepts only unambiguous forms. It rejects generators and async generators, unresolved
aliases or member-expression targets, spread targets/options, multiple markers for one target, and
anonymous targets without a literal name. It does not transform published dependencies or component
script blocks extracted by `.vue`, `.svelte`, or `.astro` compilers. Native Promises are observed;
non-native thenables are treated as synchronous results.

For source a transform cannot reach, build the lifecycle manually with `Loxer.open()` and
`Loxer.of()`; see [manual boxes](./logging.md#manual-boxes-and-history). A contextual point outside
a trace is a normal contextual log. A visible point assigned to a hidden trace appears without a box
marker.

## Data and privacy

Message callbacks can stringify arguments and results. `.props(...)` attaches their original values,
and `.pp(...)` chooses whether they render. None of these operations redact data. Limit capture and
filter output events according to your destination's data policy; [Logging and output](./logging.md)
shows a safe forwarding boundary.

For exact types and every option, see [`trace`](https://pcprinz.github.io/loxer/variables/trace.trace.html),
[`TraceOptions`](https://pcprinz.github.io/loxer/interfaces/trace.TraceOptions.html), and
[`TracePoint`](https://pcprinz.github.io/loxer/types/trace.TracePoint.html).
