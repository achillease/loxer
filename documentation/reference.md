# Reference and troubleshooting

## Troubleshooting

### A marker throws at runtime

`trace() is a build-time marker` means the executing module skipped the Babel or Vite transform.
Confirm the active build config, file extension filters, exclusions, and every pipeline used by
tests, server builds, and workers. Inspect emitted code: it contains generated helper imports and no
marker call. [Integrations](./integrations.md) provides complete Vite and Babel setups.

### No logs appear

Call `Loxer.init()` in the same realm as the log. Production needs an `output` callback. Check the
module threshold with `Loxer.getModuleLevel(id)`, `config.disabled`, and
`config.disabledInProductionMode`. A one-time warning after five seconds indicates an undrained
pre-initialization queue.

### An invalid module or detached point appears

An `INVALIDMODULE` id was not registered in `Loxer.init({ modules })`; declaration-merge
`LoxerModuleRegistry` to catch typos. A direct trace property that collides with a marker member
requires `trace.m('debug')`, not `trace.debug`. A trace point joins a box only when the transform can
identify it inside the traced invocation. A visible point inside a hidden trace is written without a
box marker.

### Props do not render or a linked Vite copy is stale

Attaching a prop does not request rendering; add `pp()` or render raw props in the output callback.
For a linked working copy, exclude `loxer` and `loxer/trace` from Vite dependency optimization and
set the adapter's `dedupe` option to `false`; see [Integrations](./integrations.md#vite).

## Transform limits

The transform accepts named functions, named function-valued variables, literal arrays of those,
an inline function value, and a marker as the first statement of a surrounding function. It rejects
generators, unresolved aliases and member-expression targets, spreads, duplicate markers, and
anonymous targets without a literal name. It transforms JavaScript/TypeScript and JSX/TSX modules,
not published dependencies or component script blocks. Direct imported `Loxer` calls in a transformed
function join its trace; indirect aliases and nested functions do not.

## Performance

These historical desktop measurements use a 60-deep box workload, averaged across ten runs. They are
directional rather than a cross-device guarantee; measure your destination and data shapes.

| Scenario | Calls measured | Average elapsed | Approximate calls/second |
| --- | ---: | ---: | ---: |
| Logger disabled | 100,000,000 | 660 ms | 151,698,566 |
| Hidden by module threshold | 100,000 | 837 ms | 119,547 |
| Visible through custom output | 100,000 | 1,078 ms | 92,807 |
| Visible through default console | 4,000 | 1,087 ms | 3,691 |

Console and destination work dominate visible records. Use module thresholds or disabling where a
deployment should avoid record construction, keep callbacks buffered or asynchronous, and constrain
wide values with `depth` or `keys`. Production without a callback avoids destination rendering and
console I/O, though visible records may remain in history.

## Migrating from Loxer 2

Readers starting with Loxer 3 can skip this section. Loxer 3 uses named `error`, `warn`, `info`, and
`debug` levels. Translate thresholds as follows:

| Loxer 2 | Loxer 3 |
| --- | --- |
| `0` | `error` |
| `1` | `info` |
| `2` | `info` or `debug`, according to desired visibility |
| `3` | `debug` |

Replace `.level()` / `.l()` with level terminals: `Loxer.l(1).log(msg)` becomes `Loxer.log(msg)` or
`Loxer.info(msg)`; `Loxer.l(2).log(msg)` becomes `Loxer.warn(msg)`;
`Loxer.l(3).log(msg)` becomes `Loxer.debug(msg)`; and `Loxer.l(n).error(error)` becomes
`Loxer.error(error)`. Replace environment-specific output callbacks with one discriminated
`output(event)` callback. Items become ordered `lox.props`; use `Loxer.pp(...)` when they should
render and `PropsPrinter.of(lox).print()` when a destination needs formatted text.
