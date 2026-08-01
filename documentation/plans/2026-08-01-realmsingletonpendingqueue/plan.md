# Plan: realm-scoped singleton and a self-reporting pre-init queue

> Grounding: architect (technical) n/a — surveyed inline this session (`src/Loxer.ts`,
> `src/core/Loxes.ts`, `src/loxes/Lox.ts`, `src/trace.ts`,
> `packages/vite-plugin-loxer-trace/src/index.ts`) · web-researcher (selection) skipped: no new
> dependency
> Spec: none — planned from the bug report in this session

## Context

A consumer app (React 19 + Vite dev server, Electron renderer, `vite-plugin-loxer-trace` active)
saw a build-time `trace({ moduleId: 'APP' })` marker produce nothing at all: no log, no box, no
error, no `Loxer.history` entry. Every layer verified healthy — the transform ran, the dev server
served the transformed module, the live mounted closure contained `__startTrace`, and Loxer
reported `_isInitialized: true` with `getModuleLevel('APP') === 'debug'`.

The page had loaded **two copies of the shared Loxer chunk**: one reached through `loxer`, one
through `loxer/trace`. `init()` initialized the first; `__startTrace` called the second. Logs went
into the second instance's pre-init queue and stayed there.

Two independent defects:

1. **The singleton is module-scoped, so it isn't one.** `export let Loxer = new LoxerInstance()`
   ([src/Loxer.ts:457](../../../src/Loxer.ts#L457)) yields one instance per module copy. Loxer is
   unusually exposed to this: two entry points over one core, plus a build plugin that injects
   `loxer/trace` imports into files the user never edited, so the second module root appears
   without the user doing anything. Vite dep re-optimization was the proximate trigger; Jest module
   registries, mixed CJS/ESM resolution and pnpm hoisting produce the same shape.
2. **The pre-init queue swallows everything, forever.** `enqueue`
   ([src/core/Loxes.ts:82-84](../../../src/core/Loxes.ts#L82-L84)) is unbounded and nothing ever
   reports that it is filling. On an instance where `init()` never runs there is no output, no
   warning, no throw, and a slow leak. This is what made a config-level accident undiagnosable, and
   it stays reachable regardless of what happens to defect 1 — a forgotten `init()` or an `init()`
   that runs after logging starts hits the same silence. It is also the one place the library
   chooses silence: `trace()` ([src/trace.ts:159](../../../src/trace.ts#L159)) deliberately throws
   when the build transform is missing rather than degrading quietly.

A third problem surfaced while surveying, and it constrains the fix for defect 1:
`Lox._runningId` ([src/loxes/Lox.ts:76](../../../src/loxes/Lox.ts#L76)) is **also** module-scoped.
Sharing the instance without sharing the id counter would make two copies hand out ids `0, 1, 2`
into one shared `_loxes` map — `.of(id)` resolving to the wrong box, opens overwriting each other.
That is strictly worse than today's silent separation, so the counter has to move in the same
change.

Intended outcome: duplicate module copies become harmless, the Vite trigger stops happening, and an
instance whose `init()` never arrives says so.

## Approach

Four coordinated changes. Realm scoping fixes the blast radius; the Vite plugin fixes the trigger;
either alone leaves a hole.

### 1. Realm-scope the instance

New `src/core/Realm.ts`, **no imports** — it must stay cycle-free, since `Loxer.ts` imports
`Lox.ts`:

```ts
const REALM_KEY = Symbol.for('loxer.realm.3');   // keyed on the major
export function realmSlot<T>(name: string, create: () => T): T { ... }
```

It reads or creates one record on `globalThis`, wrapped in `try/catch` so a frozen or hardened
realm (SES/lockdown, some sandboxes) falls back to a module-local value — today's behaviour, never
a throw.

`src/Loxer.ts:457` becomes `export const Loxer = realmSlot('instance', () => new LoxerInstance())`.

**Keyed on the major, deliberately.** Two majors in one app stay isolated — a v3 instance must
never receive v4 loxes. Same-major copies share. No new failure mode relative to today.

### 2. `resetLoxer()` resets in place

Rebinding `export let` was already broken for anyone holding `const L = Loxer`, independent of
duplicate copies, and a rebind is invisible to a second copy by construction. Replace it with an
in-place `LoxerInstance.reset()` that reinstalls `Loxes` / `LoxHistory` / `Modules` /
`OutputStreams`, clears `_isInitialized` / `_isDev` / `_isDisabled` and the chain state
(`_isHighlighted`, `_moduleId`), and cancels the pending-queue timer from change 4. Object identity
never changes, so every copy and every cached reference observes the reset. `export let` becomes
`export const`.

### 3. Move the running-id counter onto the instance

Delete `Lox._runningId` and `Lox.resetStaticRunningId()`. `LoxProps.id` becomes a required
`number`, and `LoxerInstance` supplies `id ?? this.nextId()` at its four `new Lox(...)` sites
([src/Loxer.ts:168](../../../src/Loxer.ts#L168),
[212](../../../src/Loxer.ts#L212), [241](../../../src/Loxer.ts#L241),
[379](../../../src/Loxer.ts#L379)). This is better than realm-scoping a second slot — it deletes a
static instead of adding one, and ids become naturally per-instance.

The three test files that construct `Lox` directly (`test/modules.test.ts:34`,
`test/initialization.test.ts:211,224,279`) already pass explicit ids, so they need no change.
`resetLoxer()`'s `Lox.resetStaticRunningId()` call goes away with change 2.

### 4. Bound the pre-init queue and make it report

The hard question is what separates "queued, will flush shortly" from "queued, will never flush".
The answer is **elapsed time, not volume**: healthy pre-init logging (module-scope logs, a traced
helper running while `init()`'s own argument object is built) is bounded by the
module-evaluation-to-`init()` gap — milliseconds to a tick. Volume separates nothing; the repro
queued roughly six logs, so any count threshold high enough to stay quiet on a healthy app would
never have fired on the broken one.

In `Loxes` — it already owns the queue and already knows "not yet drained" via `_shouldUseQueue`,
and it needs no reference to the instance, so the coupling stays where it is:

- **Signal.** The first `enqueue` arms one `setTimeout`, default **5s**, `unref()`'d where
  available so it can never hold a Node process open. If it fires with the queue undrained, one
  `console.warn` — once, ever, per instance — naming the count, the elapsed time, the first queued
  message for locality, and both candidate causes: `init()` was never called on this instance, or a
  bundler loaded two copies. `console` is the only channel available by definition, since callbacks
  are registered by `init()`. `init()` (via `dequeue`) and `reset()` clear the timer.
- **Backstop.** `enqueue` also compares elapsed time and warns if the timer never ran (fake timers,
  exotic environments). One number comparison on a path that already allocates a `Lox`.
- **Bound.** Cap at **1000** entries and drop the **newest**, counting drops and reporting the count
  at replay. Two reasons, the second load-bearing: the queue's job is preserving the startup story,
  and at 1000 undrained logs the tail is by definition not startup; and `findOpenLox`
  ([src/core/Loxes.ts:58-67](../../../src/core/Loxes.ts#L58-L67)) searches the *pending queue* for
  open loxes, so evicting from the head would silently break pre-init `.of(id)` — a new silent
  failure introduced by the fix for a silent failure. Dropping the tail keeps every retained prefix
  intact and is O(1).
- **Overflow warns immediately**, separately from the timeout. Hitting the cap undrained is
  unambiguous regardless of elapsed time.
- **No configuration knob.** `init()`'s config is by construction too late to configure the pre-init
  queue, and a module-level setter is public surface for a fire-once diagnostic. Constants.

Errors stay queued — the `// TODO should errors really be hold back until init?` at
[src/Loxer.ts:397](../../../src/Loxer.ts#L397) is left in place. Replay order matters and the error
callbacks do not exist yet; the warning removes most of the pressure behind that TODO.

### 5. Close the Vite trigger

`vite-plugin-loxer-trace` causes the mid-session `loxer/trace` discovery (it injects the import) and
has a `config()` hook it does not use ([packages/vite-plugin-loxer-trace/src/index.ts:16-48](../../../packages/vite-plugin-loxer-trace/src/index.ts#L16-L48)).
Add one, contributing `optimizeDeps.include: ['loxer', 'loxer/trace']` **merged with** — never
clobbering — whatever the user already set, plus `resolve.dedupe: ['loxer']` for the
multiple-install case, and an option to opt out. Both entries then enter the same optimize run at
startup, so `loxer/trace` cannot be discovered mid-session and force a re-optimization that emits a
second content-hashed shared chunk.

### Explicitly not doing

**Rethinking the entry-point layout.** `src/trace.ts` imports `Loxer` anyway, so `./trace` buys no
weight saving — it is an API-clarity boundary and a good one. Collapsing to one entry would fix this
specific optimizer interaction while breaking the plugin's injection target and the public surface,
to solve a problem realm scoping solves properly. Keep two entries; make duplication harmless.

**A `Proxy` facade over the instance.** It would tax every call on a benchmarked hot path
(`documentation/Performance.md`); the realm slot costs one symbol lookup at module evaluation and
nothing per log.

## Critical files

- `src/core/Realm.ts` — **new.** The `realmSlot` helper. No imports; `try/catch` fallback for frozen
  realms.
- `src/Loxer.ts` — `export const Loxer = realmSlot(...)` at :457; `resetLoxer()` delegates to a new
  `LoxerInstance.reset()`; instance-owned `nextId()` feeding the four `new Lox(...)` sites; `init()`
  clears the queue timer via `dequeue()`.
- `src/core/Loxes.ts` — the whole of change 4: cap, drop-newest, drop counter, timer arm/clear,
  one-shot warning, elapsed-time backstop on `enqueue`. `dequeue()` reports the drop count.
- `src/loxes/Lox.ts` — delete `_runningId` / `nextId` / `resetStaticRunningId`; `LoxProps.id`
  becomes required.
- `packages/vite-plugin-loxer-trace/src/index.ts` — add the `config()` hook and its opt-out option.
- `packages/vite-plugin-loxer-trace/README.md` — **new.** The package currently ships no README at
  all, and its `files: ["dist"]` means one would not publish either; add `README.md` to `files`.
- `test/initialization.test.ts` — queue signal, bound, drop-newest, timer-clearing coverage.
- `test/realm-singleton.test.ts` — **new.** The duplicate-copy suite (see Verification).
- `documentation/index.md` — one sentence in the init section stating positively that the instance
  is realm-scoped and multiple copies share it.
- `CHANGELOG.md` — `[Unreleased]` entry.

## Risks & open questions

- **Two unconfirmed empirical questions the consumer app can answer**, both flagged in the session
  and neither blocking the rest of the work:
  1. Whether `optimizeDeps.include: ['loxer', 'loxer/trace']` actually collapses the two chunks and
     survives adding a fresh `loxer/trace` import mid-session. This decides whether change 5 is the
     trigger fix or only a partial one. Test it in the app config before writing it into the plugin.
  2. Roughly how long after module evaluation the app's `init()` runs in the normal case — the
     calibration for the 5s threshold.
- **Warning false positives.** An app that deliberately inits late (awaiting a config fetch) trips
  the 5s timer. Accepted, and the warning is worded as a question rather than an assertion: that app
  *is* accumulating unflushed logs and its author benefits from knowing. 5s is the one number worth
  tuning against a real app.
- **Realm state outliving the module registry in tests.** That persistence is the whole point of the
  feature, and it is also the risk: `test/realm-singleton.test.ts` must clear the realm slot in
  `afterEach`. Vitest's per-file isolation should contain cross-file leakage — confirm rather than
  assume, since the feature is precisely state that survives a module-registry reset.
- **Emitted declarations change.** Removing `Lox`'s static drops an inherited static member from
  `OutputLox` / `ErrorLox` in the emitted `.d.ts` and in TypeDoc. Neither class is exported as a
  value, so the static is unreachable by consumers — cosmetic, but it will show in a `docs/`
  regeneration diff.
- **Workers, iframes and SSR are unchanged, by design.** Separate `globalThis` means separate
  instances (correct — sharing across threads needs a serialization channel Loxer does not have),
  and a Node server keeps one process-wide instance exactly as today. Real per-request isolation
  needs an API, not a scoping trick; out of scope here and a `debt.md` candidate if it stays wanted.
- **Adjacent, not folded in:** [D-1](../../debt.md#d-1--pre-init-mid-resolves-against-the-empty-module-table)
  (queued `.m(id)` replaying as `INVALID`) lives in this same enqueue/replay path. Not part of this
  change; sequence it next, or take it here if the diff stays legible.

## Verification

- `pnpm lint`, `pnpm test`, and `pnpm build` all exit 0 — the last is required because
  `LoxProps`/`Lox` declarations change.
- **Queue coverage** in `test/initialization.test.ts` with `vi.useFakeTimers()`: warn fires exactly
  once past the threshold and not again; `init()` before the threshold warns nothing and leaves
  `vi.getTimerCount() === 0`; `resetLoxer()` with a pending queue fires nothing on advance;
  overflow warns immediately, replays exactly the cap, and reports the drop count; drop-newest
  asserted by the first queued message surviving and the last not. The existing queue-replay and
  ordering tests must pass untouched — that is the regression guard on the bound.
- **Duplicate-copy coverage** in a new `test/realm-singleton.test.ts`. `vi.resetModules()` gives a
  fresh module registry while `globalThis` persists, reproducing the reported condition with no
  bundler: import `../src/Loxer.js`, `vi.resetModules()`, import again, assert `b.Loxer === a.Loxer`;
  init through one copy, log through the other, assert it lands in the first's `history`; open a box
  through each copy and assert the ids are distinct (the counter regression — this is the test that
  catches the "worse than status quo" failure). Own file: `vi.resetModules()` poisons module
  identity for anything after it.
- **Stale-reference reset:** `const L = Loxer; resetLoxer(); expect(L.history).toEqual([])`.
- **Vite plugin:** unit-test the `config()` hook's returned object — both entries present, a user's
  existing `include` merged not clobbered, opt-out respected. The end-to-end "did Vite emit one
  chunk" stays a manual check in `examples/vite-trace-demo`; booting Vite in middleware mode to
  assert chunk identity is expensive and flaky for what it proves.
- **Live confirmation** in the reporting app: the traced handler prints, and the two risk questions
  above are answered.
- `pnpm docs` exits 0 after the JSDoc touched by these changes.
