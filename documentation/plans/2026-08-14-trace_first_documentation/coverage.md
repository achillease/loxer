# Trace-first documentation coverage audit

This audit maps the previous teaching surface and public exports to one canonical destination or an
intentional non-guide owner.

## Previous authored pages

| Previous source | Topics | Canonical destination |
| --- | --- | --- |
| `README.md` | Product story, install, logger tour, tracing, points, output preview, dependencies | Root README summary; `quick-start.md`; `tracing/`; `logging/`; `output/` |
| `documentation/index.md` — overview/build setup | Automatic tracing, group markers, trace points, Babel/Vite setup | `learn/mental-model.md`; `tracing/`; `integrations/` |
| `documentation/index.md` — initialization/simple logs/errors | Init options, queue, messages, errors, `NamedError` | `logging/index.md`; `logging/initialization.md`; API reference |
| `documentation/index.md` — highlighting/levels/modules | One-shot modifiers, named levels, thresholds, module declarations and typing | `tracing/functions.md`; `logging/levels-and-modules.md` |
| `documentation/index.md` — output | Events, lox values, renderers, destination formatting | `output/index.md`; API reference |
| `documentation/index.md` — boxes | Open/assign/close, levels, layout data | `logging/boxes-and-history.md`; API reference |
| `documentation/index.md` — Loxer 2 appendix | Levels, callbacks, items/props migration | `reference/migrating-from-2.md` |
| `documentation/props.md` | Props, message values, options, callback rendering, cost and security | `logging/props.md`; `tracing/messages-and-data.md`; `output/`; compatibility page retained |
| `documentation/environments.md` | Transform paths, compatibility tables, custom hooks, unsupported source | `integrations/`; `reference/limitations.md`; maintainer adapter gaps recorded as D-2 through D-4 in `documentation/debt.md` |
| `documentation/Performance.md` | Environment, workload, four scenarios, interpretation | `reference/performance.md`; compatibility page retained |
| Babel plugin README | Install, transform model, API, points, shapes, maintenance | Package-local README; concepts routed to `tracing/`; setup routed to `integrations/babel.md` |
| Vite plugin README | Install, options, points, dedupe, linked working copies | Package-local README; concepts routed to `tracing/`; setup routed to `integrations/vite.md` |

## Root `loxer` exports

| Export group | Owner |
| --- | --- |
| `Loxer`, `resetLoxer`, `LoxerOptions`, `LoxerConfig` | `logging/initialization.md`; generated API |
| `LogLevel`, `BoxLevel`, `LevelMethods`, `LogMethods` | `logging/levels-and-modules.md`; generated API |
| `LoxerModules`, `Module`, `ModuleId`, `DefaultModuleId`, `RegisteredModules`, `LoxerModuleRegistry` | `logging/levels-and-modules.md`; generated API |
| `OpenedLox`, `OfLoxes`, `OutputLox`, `ErrorLox`, `LoxType` | `logging/boxes-and-history.md`; generated API |
| `LoxerOutputEvent`, `LoxerOutputStream`, renderer templates/options | `output/index.md`; generated API |
| `OutputLoxRenderer`, `ErrorLoxRenderer`, `PropsPrinter` | `output/index.md`; `logging/props.md`; generated API |
| `ANSIFormat`, `BoxFactory`, `BoxLayouts`, `BoxSymbols`, `BoxLayoutStyle`, `LoxColorOptions` | Generated API; task guides mention only destination-selected rendering |
| `NamedError`, `ErrorType` | `logging/index.md`; generated API |
| `PropsPrinterOptions` | `logging/props.md`; generated API |

## `loxer/trace` exports

| Export group | Owner |
| --- | --- |
| `trace`, `TraceMarker`, `TraceModuleId` | `tracing/functions.md`; generated API |
| `TracePoint`, `TracePointModuleId`, point message types | `tracing/trace-points.md`; generated API |
| `TraceOptions`, message templates and context/printer types | `tracing/messages-and-data.md`; generated API; opening/closing message aliases exported from `loxer/trace` |
| `TraceHighlight`, `TracePropsTarget`, `TracePrintOptions` | `tracing/functions.md`; `tracing/messages-and-data.md`; generated API |
| `FunctionTrace` and `__*` helpers | Transform runtime contract; not taught as application API; internal helpers excluded by TypeDoc |

## Retirements

- The monolithic numbered tour is retired in favor of task pages and the TypeDoc member reference.
- Per-run benchmark rows are summarized by scenario averages; methodology and interpretation remain.
- Unverified framework recipes are retired. The compatibility guide names transform paths and
  requires application-local verification instead of presenting speculative copyable config.
- Maintainer implementation recommendations are not user-guide content.
