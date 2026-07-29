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
already performs exactly this fallback at [src/core/Modules.ts:63-66](../src/core/Modules.ts#L63-L66).

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

## Resolved

_Nothing yet._
