# Test bugs

## From test-author

### Pre-init `.m(id)` resolves the module id against the empty pre-init table, mislabelling queued logs as `INVALID`

- **Where:** [src/Loxer.ts:152](../../../src/Loxer.ts#L152) (`this._moduleId = this._modules.ensureModule(this._moduleId);`)
  together with [src/core/Modules.ts:50-52](../../../src/core/Modules.ts#L50-L52) and the pre-init
  `private _modules: Modules = new Modules();` at [src/Loxer.ts:55](../../../src/Loxer.ts#L55).
- **Found while writing:** the queue coverage requested for `test/initialization.test.ts`
  ("queue logs against a module id before `Loxer.init()`, then init with that module at a threshold
  that hides some of them"). That exact scenario cannot be expressed, so the shipped tests
  (`queued logs resolve their level against the module table given at init` and
  `a queued log is hidden by a threshold that only the init call introduces`) queue against `DEFAULT`
  / `NONE` and drive the threshold through `defaultLevels` instead.

**Repro**

```ts
Loxer.m('TEST').info('queued info');
Loxer.m('TEST').debug('queued debug');
Loxer.m('TEST').error('queued error');
Loxer.init({
  dev: true,
  callbacks: { devLog, devError },
  modules: { TEST: { color: '#ff0', devLevel: 'info', prodLevel: 'error', fullName: 'TestModule' } },
});
```

**Observed** — every queued log replays with `moduleId === 'INVALID'`:

```
logs:   [['Loxer initialized', 'NONE', 'info'], ['queued info', 'INVALID', 'info']]
errors: [['queued error', 'INVALID', 'error']]
```

**Expected** — the queued logs carry `moduleId === 'TEST'` and are levelled against `TEST`'s
`devLevel`, matching the plan's verification item "Pre-init logs still queue and replay, resolving
their level against the *initialized* module table"
([plan.md](./plan.md), Verification) and `AGENTS.md`'s "uninitialized logging must not silently
disappear" — here it does not disappear, but it is silently relabelled and gated by the wrong
module.

**Why it happens:** `m()` runs `ensureModule` eagerly, at chain time, against the module table that
exists *then*. Before `init()` that table is the built-in `new Modules()` (only `NONE`, `DEFAULT`,
`INVALID`), so any user module id is rewritten to `'INVALID'` before the `Lox` is even constructed
and enqueued. The level gate itself is correctly deferred to replay time
([Loxer.ts:394-413](../../../src/Loxer.ts#L394-L413)) — it just gets handed the wrong module.

**Consequences beyond the label:** the log's threshold, colour, `fullName`, and box layout all come
from `INVALID`, so a module deliberately set to `devLevel: 'error'` still emits its queued normal
logs (`INVALID` logs up to `'info'`), and a module at `devLevel: 'debug'` silently loses its queued
`debug` logs.

**Not fixed here** (test-author does not edit `src/`). The smallest fix that would unblock a direct
test is to defer id validation to output time — e.g. store the raw id on the `Lox` and let
`Modules.getModule()` (which already falls back to `INVALID` at
[Modules.ts:63-66](../../../src/core/Modules.ts#L63-L66)) be the only place that decides, dropping
the eager `ensureModule` call in `m()`. Note that would change `unboxed.test.ts`'s `modules` test
only in *where* the rewrite happens, not in its outcome, since that suite logs after `init()`.

**Age:** pre-existing, not introduced by the named-levels change — `ensureModule` in `m()` predates
it. It is reported here because this plan's verification list asserts the behaviour it breaks.
