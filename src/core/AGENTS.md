# Core Internals

This subtree contains the internal mechanics behind the public `Loxer` API. Keep these helpers
small and behavior-preserving; most public contracts are asserted from `test/boxed.test.ts`,
`test/unboxed.test.ts`, `test/item.test.ts`, and `test/format.test.ts`.

## Invariants

- `Modules` merges user modules over `DEFAULT_MODULES`; never let `NONE`, `DEFAULT`, or `INVALID`
  become missing/falsy modules.
- `NONE` means no module text and no box layout. Empty `.module()` / `.m()` means `DEFAULT`, which
  can produce box layout with an empty module label.
- `Modules.getModule()` owns sliced module text, environment-specific level visibility, and the
  resolved box layout style.
- `Loxes` stores both queued pre-init logs and currently open visible boxes. Be careful when
  changing `_shouldUseQueue`, because `.of(id)` must work for queued open logs before init.
- `BoxFactory` builds layout from the current visible open-log buffer. Hidden logs return an empty
  box and hidden opening logs must not add visible columns.
- Closing a box removes the corresponding open log and trims only trailing empty slots so async
  overlapping boxes keep their column positions.
- `OutputStreams` must forward raw `OutputLox` / `ErrorLox` objects unchanged to callbacks; default
  console rendering is only the fallback path.
- `LoxHistory` is newest-first. A configured size of `1` currently disables stored history.
- `Item` handles arbitrary runtime values; avoid recursive changes that would loop on class graphs
  or cyclic structures.
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
