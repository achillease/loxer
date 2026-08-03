# Core Internals

This subtree contains the internal mechanics behind the public `Loxer` API. Keep these helpers
small and behavior-preserving; most public contracts are asserted from `test/boxed.test.ts`,
`test/unboxed.test.ts`, `test/item.test.ts`, and `test/format.test.ts`.

## Invariants

- `Modules` merges user modules over a **per-instance clone** of `DEFAULT_MODULES`; never write into
  `DEFAULT_MODULES` itself (it is module-scoped, so a `defaultLevels` write would leak into every
  later `Loxer` of the process and survive `resetLoxer()`). Never let `NONE`, `DEFAULT`, or `INVALID`
  become missing/falsy modules.
- `NONE` means no module text and no box layout. Empty `.module()` / `.m()` means `DEFAULT`, which
  can produce box layout with an empty module label.
- `Modules.getModule()` owns sliced module text, environment-specific level visibility, and the
  resolved box layout style.
- `Levels.ts` is the single home of the `LogLevel` ordering: `LEVEL_ORDER` (`error` 0 → `debug` 3;
  a higher ordinal is dropped sooner) and the strict-`>` gate `isHidden(level, threshold)`. Never
  re-derive the comparison anywhere else — it used to exist in three places with three different
  encodings. A module that logs up to `'error'` reports *errors only*, not nothing: errors bypass
  the gate entirely, so there is deliberately no `'off'` level.
- `Loxes` stores both queued pre-init logs and currently open visible boxes. Be careful when
  changing `_shouldUseQueue`, because `.of(id)` must work for queued open logs before init. The
  pending queue caps at `PENDING_QUEUE_CAP` and drops the **newest** entry, never the head, because
  `findOpenLox` searches the pending queue for open loxes and evicting the front would silently
  unlink a pre-init `.of(id)` from its opening log; `dequeue()` reports the total dropped count once
  the queue is replayed. It also self-reports once per instance through `console.warn` — the only
  channel available, since `init()` (which registers the output callbacks) hasn't run yet — arming
  a `PENDING_QUEUE_TIMEOUT_MS` timer on the first `enqueue` (`unref()`'d where available, plus an
  elapsed-time backstop for environments where timers never fire, e.g. fake timers) and reporting
  immediately on hitting the cap, since an undrained cap is unambiguous regardless of elapsed time.
  Both thresholds are constants with no configuration knob: `init()`'s config is by construction too
  late to configure the pre-init queue, and a setter would be public surface for a fire-once
  diagnostic. `dequeue()` (via `init()`) and the instance reset both disarm the report timer.
- `Realm.ts` anchors the values that must be shared by every copy of Loxer's modules in one
  JavaScript realm; `realmSlot(name, create)` reads or creates a slot on `globalThis`, and
  `clearRealmSlot(name)` exists for tests only. It must stay import-free: `Loxer.ts` imports
  `Lox.ts`, so anything imported into `Realm.ts` could close a cycle back onto the module holding
  the instance. The anchor key is `Symbol.for('loxer.realm.3')`, keyed on the **major** version
  deliberately — two majors loaded in one application stay isolated (a v3 instance must never
  receive a v4 lox) while every copy of the same major shares one record; bumping the major means
  bumping this key. It must never throw: a frozen or hardened realm (SES/lockdown, some sandboxes)
  falls back to module-local slots — one value per copy, same as a module-scoped `const` — covering
  a `defineProperty` that throws, a host that swallows the write, and a non-extensible slot record.
- `BoxFactory` builds layout from the current visible open-log buffer. Hidden logs return an empty
  box and hidden opening logs must not add visible columns. A shown log whose own `open` is missing
  from the buffer therefore finds no id to match and gets no `single` / `closeEdge` marker, only the
  enclosing `vertical`s and a trailing `horizontal` — that is the intended rendering for a log that
  outranks its hidden box, not a defect to route around.
- Closing a box removes the corresponding open log and trims only trailing empty slots so async
  overlapping boxes keep their column positions.
- `OutputStreams` must forward raw `OutputLox` / `ErrorLox` objects unchanged to callbacks; default
  console rendering is only the fallback path.
- `LoxHistory` is newest-first. A configured size of `1` currently disables stored history.
- `Item` handles arbitrary runtime values; avoid recursive changes that would loop on class graphs
  or cyclic structures.
- `TraceNames.ts` owns the rendering of `'parent.functionName'` for the `@trace` decorator
  (`src/decorators/trace.ts`, class read off `this` at call time) and for the marker runtime
  (`src/trace.ts`, parent passed in by the transform, a class or a file). The runtime only joins a
  parent to a name: deciding *which* parent belongs to a function is the caller's job, and the
  trailing-`Class` rule (`classParentName`) applies to a class only, never to a file.
  `babel-plugin-loxer-trace` keeps its own copy of that rule because it is a separate package that
  cannot import this one; `test/decorators.test.ts` and `test/plain-function-trace-enclosing.test.ts`
  pin the two against each other.
- `src/core/color/` is vendored, not an npm dependency: it ports `color-string@1.6.0` (parsing),
  `color-name@1.1.4` (the named-color table), and `color-convert@1.9.3` (`hsl`/`hwb` -> rgb), and
  keeps their MIT copyright headers. Loxer ships zero runtime dependencies — never reintroduce
  `color`/`color-string`/`color-name`/`color-convert` as a dependency; edit `src/core/color/` in
  place instead and keep the copyright headers intact.

## Change Guidance

- When changing box layout, update or add expectations in `test/boxed.test.ts`; those tests encode
  the visible column behavior without relying on terminal glyphs.
- When changing item rendering, cover colored and plain output shape where relevant.
- When changing output streams, verify both callback paths and default console fallback behavior.
- When changing `src/core/color/parseColor.ts`, keep `getRgb()`'s named-color branch returning a
  copy of the matched `COLOR_NAMES` entry, not the shared array — returning the shared reference
  reintroduces a `color-string@1.6.0` mutation bug the vendoring fixed. Keep `Color()` throwing on
  an unparseable string; `ANSIFormat.colorHighlight`/`colorize` rely on that throw.
- When a value must be shared by every copy of Loxer in a realm (a new singleton, a cache), store
  it via `realmSlot(name, create)`, not a module-scoped `const`/`let` — the latter is one value per
  module copy, which is exactly the bug `Realm.ts` exists to prevent.
