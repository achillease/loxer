# Technical debt

Known defects and design compromises in Loxer that are understood but not yet fixed. Each entry
stays here until the problem is gone, then moves to [Resolved](#resolved) with the commit that
closed it.

This register is for problems that outlive the work that found them. A bug discovered and fixed
inside a single change never belongs here — it belongs in that change's worklog. Anything a
reviewer, test author, or maintainer decides to *leave in place* does.

## How to add an entry

Give the item the next free `D-<n>`, add a row to the index, and write the section. A section is
complete when someone who has never seen the discovering conversation could reproduce the problem
and judge the fix on its own:

- **Where** — the exact file and line the defect lives on, as a link.
- **Symptom** — what an observer sees, with a runnable repro where one is possible.
- **Cause** — the mechanism, not the guess.
- **Impact** — who is affected and how badly. This is what decides the priority.
- **Proposed fix** — the shape of the change, plus its blast radius.
- **Found** — the date and the pass that surfaced it, so its age is visible.

## Open

| Id | Item | Area | Impact | Found |
| --- | --- | --- | --- | --- |
| [D-1](#d-1--pre-init-mid-resolves-against-the-empty-module-table) | Pre-init `.m(id)` mislabels queued logs as `INVALID` | `src/Loxer.ts` · module resolution | Medium — silent, affects any log emitted before `init()` | 2026-07-29 |
| [D-2](#d-2--vite-adapter-skips-single-file-component-script-blocks) | Vite adapter skips single-file-component script blocks | Vite adapter · source filtering | Medium — markers in component blocks reach no transform | 2026-08-14 |
| [D-3](#d-3--non-vite-non-babel-hosts-have-no-shipped-adapter) | Non-Vite, non-Babel hosts have no shipped adapter | Trace integrations | Medium — consumers must write transform hooks | 2026-08-14 |
| [D-4](#d-4--swc-only-pipelines-have-no-native-transform) | SWC-only pipelines have no native transform | Trace compiler | High — several framework paths cannot use markers | 2026-08-14 |

---

### D-1 — pre-init `.m(id)` resolves against the empty module table

**Where:** [src/Loxer.ts:152](../src/Loxer.ts#L152) — `this._moduleId = this._modules.ensureModule(this._moduleId);`
in `m()`, against the pre-init table at [src/Loxer.ts:55](../src/Loxer.ts#L55).

**Symptom.** A log emitted before `Loxer.init()` against a module that `init()` goes on to register
replays under `INVALID` instead of its own module:

```ts
Loxer.m('TEST').info('queued info');
Loxer.m('TEST').error('queued error');
Loxer.init({
  dev: true,
  callbacks: { devLog, devError },
  modules: { TEST: { color: '#ff0', devLevel: 'info', prodLevel: 'error', fullName: 'TestModule' } },
});
```

Every queued log arrives with `moduleId === 'INVALID'`:

```
logs:   [['Loxer initialized', 'NONE', 'info'], ['queued info', 'INVALID', 'info']]
errors: [['queued error', 'INVALID', 'error']]
```

Expected: `moduleId === 'TEST'`, with visibility decided by `TEST`'s `devLevel`.

**Cause.** `m()` validates the module id eagerly, at chain time, against whichever table exists at
that moment. Before `init()` that table is the built-in `new Modules()` — only `NONE`, `DEFAULT`,
and `INVALID` — so any user module id is rewritten to `'INVALID'` before the `Lox` is constructed
and queued. The level gate itself is correctly deferred to replay time
([src/Loxer.ts:394-413](../src/Loxer.ts#L394-L413)); it is simply handed the wrong module.

**Impact.** The substituted module supplies the threshold, colour, `fullName`, and box layout, so
the damage is wider than a wrong label:

- a module set to `devLevel: 'error'` still emits its queued normal logs, because `INVALID` logs up
  to `'info'`;
- a module set to `devLevel: 'debug'` silently loses its queued `debug` logs;
- queued logs render with the `INVALID` colour and module text.

Nothing disappears outright and nothing throws, which is what makes it easy to miss. It contradicts
the "uninitialized logging must not silently disappear" invariant in `AGENTS.md` in spirit — the log
survives, but relabelled and gated by the wrong module.

**Proposed fix.** Defer id validation to output time: drop the eager `ensureModule` call from `m()`,
store the raw id on the `Lox`, and let `Modules.getModule()` be the only place that decides. It
already performs exactly this fallback at
[src/core/runtime/Modules.ts:63-66](../src/core/runtime/Modules.ts#L63-L66).

Blast radius is small but sits on the path every log takes. `test/unboxed.test.ts`'s `modules` test
changes only in *where* the rewrite happens, not in its outcome, because that suite logs after
`init()`. Worth adding alongside the fix: the module-id queue test that this defect currently makes
unwritable — the existing queue coverage in `test/initialization.test.ts` has to drive its threshold
through `defaultLevels` on `DEFAULT`/`NONE` instead.

**Found.** 2026-07-29, writing queue-replay coverage during the Testing pass for
[2026-07-28-standardloglevels](plans/2026-07-28-standardloglevels/plan.md); see that plan's
[test-bugs.md](plans/2026-07-28-standardloglevels/test-bugs.md). Pre-existing and unrelated to that
change — `ensureModule` in `m()` is identical at `HEAD`. It was recorded because that plan's
verification list asserts the behaviour it breaks.

---

### D-2 — Vite adapter skips single-file-component script blocks

**Where:** The default extension filter and pre-transform hook in
[packages/vite-plugin-loxer-trace/src/index.ts:19](../packages/vite-plugin-loxer-trace/src/index.ts#L19)
and [line 35](../packages/vite-plugin-loxer-trace/src/index.ts#L35).

**Symptom.** A marker written inside a `.vue`, `.svelte`, or `.astro` script block is not transformed.
Moving the same function into an imported `.ts` module makes the marker work.

**Cause.** The adapter runs before framework plugins extract script blocks and accepts only
JavaScript/TypeScript module extensions. Query-bearing virtual ids such as
`App.vue?vue&type=script&lang.ts` reduce to `App.vue` before the extension check.

**Impact.** Framework users can trace imported modules but not functions kept in component blocks.
The limitation is easy to miss because the project uses Vite and appears otherwise supported.

**Proposed fix.** Add framework-aware handling at the stage where an extracted script module is
available, with fixtures for Vue, Svelte, and Astro source maps and plugin ordering. Keep ordinary
module filtering unchanged.

**Found.** 2026-08-14, Implementation pass for
[trace-first documentation](plans/2026-08-14-trace_first_documentation/plan.md), while converting
the former environment recommendation into an explicit compatibility boundary.

---

### D-3 — non-Vite, non-Babel hosts have no shipped adapter

**Where:** The repository ships only the
[Babel transform](../packages/babel-plugin-loxer-trace/src/transform.ts) and
[Vite adapter](../packages/vite-plugin-loxer-trace/src/index.ts).

**Symptom.** esbuild, tsup, Bun, Farm, and similar hosts require application code that reads a file,
calls `transformLoxerTrace`, and returns transformed code plus source maps.

**Cause.** `transformLoxerTrace` exposes the compiler operation, but no package connects it to these
hosts' load or transform hooks.

**Impact.** The marker is technically reachable, but each consumer owns filtering, syntax detection,
source maps, caching, and error reporting. That raises setup cost and creates integrations the Loxer
suite cannot verify.

**Proposed fix.** Ship an adapter shared across compatible plugin APIs, or focused esbuild and Bun
adapters modeled on the Vite package. Drive each from a real build fixture and keep the canonical
Babel transform as the single instrumentation implementation.

**Found.** 2026-08-14, Implementation pass for
[trace-first documentation](plans/2026-08-14-trace_first_documentation/plan.md), while separating
verified recipes from custom-hook fallbacks.

---

### D-4 — SWC-only pipelines have no native transform

**Where:** Marker discovery and instrumentation are implemented against Babel under
[`packages/babel-plugin-loxer-trace/src/`](../packages/babel-plugin-loxer-trace/src/); no SWC
transform package exists.

**Symptom.** A pipeline that exposes neither Babel nor a general source transform hook cannot compile
`loxer/trace` markers. Manual `Loxer.open()` / `Loxer.of()` calls are the available fallback.

**Cause.** The compiler logic depends on Babel binding analysis and AST builders. An adapter cannot
bridge a pipeline whose compiler never executes Babel; the transform must be implemented for SWC.

**Impact.** SWC-only framework configurations and loader chains cannot use automatic tracing. A
Babel pass may be incompatible with framework-owned transforms or may add build cost.

**Proposed fix.** Design an SWC-native transform that shares behavioral fixtures with the Babel
implementation: marker resolution, callable semantics, parent-name discovery, trace points, hostile
failures, and source maps. This is a separate compiler project rather than an adapter-sized change.

**Found.** 2026-08-14, Implementation pass for
[trace-first documentation](plans/2026-08-14-trace_first_documentation/plan.md), while removing
unverified framework recipes from the user guide.

## Resolved

_Nothing yet._
