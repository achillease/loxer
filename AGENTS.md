# Loxer

Loxer is a TypeScript logging library, not an application (`package.json` name `loxer`, version
3.0.0, MIT, author Christian Prinz). It exposes a singleton `Loxer` logger with chainable
modifiers, custom output callbacks, error wrapping, opt-in props printing, and box-style trace
visualization for nested or async data flow.

## Commands

- Install with `pnpm install`.
- Build with `pnpm build` (`tsc`, emits `dist/` from `src/`).
- Test with `pnpm test` (`vitest run --coverage`).
- Lint with `pnpm lint` (`eslint .`, flat config `eslint.config.mjs`).
- Regenerate API HTML with `pnpm run docs` (`typedoc --options typedoc.json`, writes `docs/`).
  The bare `pnpm docs` is a different command: `docs` is a built-in pnpm/npm command ("open
  documentation for a package in a web browser", alias `home`) that shadows the package script,
  so `pnpm docs` prints nothing, exits 0, and regenerates nothing — the zero exit is not success.

## Stack

TypeScript ~6.0, `strict: true`, target ES2022, declarations emitted,
`experimentalDecorators: true`. The package is ESM-only: `package.json` sets `"type": "module"`,
and the single `tsconfig.json` sets `module`/`moduleResolution` to `"nodenext"`, emitting one
ES-module tree to `dist/` — there is no CommonJS build. Consumers import it as ESM; a CJS
consumer on Node 22+ can still `require()` it via Node's `require(esm)` interop, but on the Node
20 floor must use dynamic `import()`. The published package's `engines.node` is now `>=20`
(itself EOL, an accepted tradeoff) — up from `>=10`. `packageManager: pnpm@10.27.0` pins the
package manager for local development. There are zero runtime dependencies: the former `color`
dependency was removed and its parsing logic vendored into `src/core/color/`. Tests run on
Vitest; lint runs eslint 10 (flat config) + `typescript-eslint` 8 + prettier 3. A husky
pre-commit hook (`.husky/pre-commit`) runs `pnpm lint`.

## Layout

- `src/` is the package source. `src/index.ts` is the public export surface.
- `src/Loxer.ts` owns the singleton logger, chaining state, initialization, queueing, level
  checks, history, and output dispatch.
- `src/core/` contains the formatting, module, level, history, output, box, props, and error helpers,
  plus `src/core/color/` (vendored color parsing, replacing the former `color` dependency).
- `src/loxes/` contains the `Lox`, `OutputLox`, and `ErrorLox` value classes.
- `src/decorators/` contains the `@initLoxer` and `@trace` decorators.
- `test/` covers observable logger behavior and low-level formatting helpers; excluded from the
  tsconfig build and from lint.
- `README.md` is the public package page and the rendered TypeDoc landing page. Keep it a
  capability-rich entry point with a representative working example and task links into the
  authored guide; do not duplicate exhaustive guides or API reference there.
- `documentation/index.md` is the authored guide landing page, and `documentation/quick-start.md`
  is the golden Vite setup path. Keep the remaining authored guide as a small set of substantial,
  task-oriented pages; specs live in `documentation/specs/`, and each plan and its worklog live
  together in `documentation/plans/<date>-<slug>/`.
- `docs/` is generated TypeDoc HTML and may be wiped entirely by `pnpm docs` (`cleanOutputDir`);
  never put hand-written files there. Steering docs live in `rules/` instead, indexed below.
- `___src/` is outside `tsconfig.json`'s `include` and is not part of the package build.
- `playground/` holds hand-written, runnable usage examples (`playground.js`, `props.js`,
  `docs.js`, `Logo.js`, `Speedtest.js`, `OrderService.js`) that import the built package from
  `../dist/index.js` — not covered by the tsconfig build, lint, or test config, so nothing in CI
  catches when they break. After `pnpm build`, run one with `node playground/<file>.js` and keep
  its imports in sync with the package's module format and public export surface.

## Behavior

- `Loxer` lives in a slot on `globalThis` (`src/core/Realm.ts`), not a module binding: every copy
  of Loxer's modules that a bundler or module registry produces resolves to the one instance,
  sharing its configuration and history, so a single `Loxer.init()` covers all of them. A separate
  realm — a worker, an iframe, an SSR process — is its own instance by design.
- `Loxer` is a singleton with intentionally one-shot modifier state (`highlight`, `module`) that
  resets after each logging operation. A level is **not** modifier state: `warn` / `info` / `debug`
  are properties (`Loxer.debug(...)` / `Loxer.debug.open(...)`) whose closures read the live chain
  state at call time, so reading the property logs nothing and resets nothing.
- `resetLoxer()` resets the instance **in place**; `Loxer` is exported `const` and must never
  become a rebinding `export let` again. A rebind is invisible to a held reference
  (`const L = Loxer`) and invisible to a second module copy by construction, so it would silently
  fail to reset exactly the callers that matter most — object identity never changing is what makes
  the reset observable everywhere.
- The running log-id counter lives on the instance, never as a static on `Lox`: the open-lox map
  is per instance, so two module copies handing out ids `0, 1, 2` into one shared map would make
  `.of(id)` resolve to the wrong box and let opens overwrite each other — strictly worse than two
  separate instances.
- Levels are the names `'error' | 'warn' | 'info' | 'debug'` (`LogLevel`), never numbers. `log()`
  writes at `'info'`; `warn()` is an ordinary log on the `devLog`/`prodLog` stream — only `error()`
  goes to `devError`/`prodError`.
- Logs created before `Loxer.init()` are queued and replayed on init; uninitialized logging must
  not silently disappear. The queue is bounded — it keeps the oldest 1000 pending logs and drops
  any beyond that — and reports itself: once logs have waited longer than 5 seconds undrained, one
  `console.warn` fires, naming both candidate causes (an `init()` that never runs, or a bundler
  that loaded two copies so `init()` reached a different one). `console` is the only channel
  available, since the output callbacks themselves arrive with `init()`.
- Production output defaults to silence — user callbacks are the production integration point.
- Errors are always output when enabled, even when their level would hide a normal log. A module
  that logs up to `'error'` therefore reports errors only, which is why no `'off'` level exists.
- Hidden normal logs must not enter history or the visible open-box buffer, but open/close state
  stays consistent for later `.of(...)` calls. `Loxer.of(id).close()` always takes the opening log's
  level (it accepts none), while `.of(id).warn/info/debug()` report the level their caller named.
- A log's own level is the **only** thing that decides whether it is written. A threshold is a
  promise about severity, so never drop a log for where it was written, and never rewrite its level
  to make it fit — the level reaches `devLog`/`prodLog`, the history and the coloring, and a
  consumer routing by severity is entitled to the one the caller stated. A log that outranks its
  hidden box is written without box membership, drawing no marker, the way an assigned error
  already is. `add` and `close` need no rule of their own: they take the opening log's level, so
  they are gated identically to their box and pair with it automatically.
- A message style, formatter, or option that only some callers select must not make every caller
  pay for computing it. Both trace runtimes — `__startTrace` (`src/trace.ts`) and `@trace`'s
  decorator runtime (`src/decorators/trace.ts`) — hand a shared renderer
  (`src/core/TraceMessage.ts`) a lazy, memoized parent resolver (`parentNameResolver`) instead of
  gating on the options up front: every message callback's context object carries `fn` and
  `parentFn` printers, so `parentFn` reaches every callback regardless of whether the open/close
  message names a `parent.` template, and the options alone no longer say whether the parent is
  needed. Laziness moves that decision from the option literal to the moment of use — the only
  place that still knows — and this still runs on every traced call, ahead of the level check
  above that decides whether the log is written at all, so an ungated cost here is paid even by
  logs that get discarded. Memoization matters because a callback may print the parent more than
  once while discovering it — the decorator reads the class off the running instance — must
  happen at most once per call. An option read on both the open and the close side needs both
  covered by a test, or the untested side silently drops the feature for callers who named only
  it.
- Props and messages are caller-supplied data with **no automatic redaction**. Keep rendering opt-in,
  and leave masking, filtering, retention, and destination-specific security policy to callbacks.
  `PropsPrinter` bounds recursive traversal at 100 levels, public box-layout depth at 200, and
  indentation at 20 spaces per level; retain those limits unless a documented product decision
  revises the resource budget. Finite numeric printer options are truncated and clamped to their
  documented range; non-finite options use the default. Rendering remains intentionally proportional
  to the selected values' breadth, so callers use `depth` or `keys` to bound wide values.
- Extract a shared internal helper when two independent runtime paths need the same semantic rule or
  gate. Keep a local expression when it has only one consumer; an abstraction without a second
  concrete consumer is not justified.

## Workspace Safety

This is a pnpm workspace (`pnpm-workspace.yaml`: `packages/*`, `examples/*`). Every workspace
package's `node_modules`, and the root `node_modules/.pnpm` tree, contain pnpm self-links back to
sibling packages and to the repo root itself. This means a link-following recursive delete
anywhere under any `node_modules` can reach `.git` and `src/`, even when the delete target looks
like it's outside this repo (e.g. a `git worktree` under a temp dir with a symlinked
`node_modules` inside it).

- Never create a symlink or junction pointing from outside this repo into it — that is what turns
  "delete a scratch directory" into "delete the project." Run tools inside the repo instead, or
  give the temp location its own installed dependencies rather than linking back here.
- Never run a link-following recursive force-delete (`rmdir /s /q`, `Remove-Item -Recurse -Force`,
  `rm -rf`) on a directory that may contain a workspace link, including a `git worktree`. Remove
  the link itself first, or use a tool that doesn't traverse links.
- Two consecutive delete failures on the same path mean it isn't what you think it is — `ls -la` it
  and look for a link before trying a stronger delete. Escalating past repeated failures is what
  causes repo loss here, not the failures themselves.
- On Windows, Git Bash `ln -s` on a directory produces a junction that `cmd.exe`'s `rmdir /s`
  traverses — a link made with one toolchain still gets followed by a delete from another.
- Before any destructive or irreversible operation, confirm work is committed **and** pushed:
  `git log origin/master..HEAD` and `git stash list`. Local-only commits and stashes are
  unrecoverable if the operation goes wrong.

## Steering Docs

Read the matching doc before touching that area — it holds the enforceable rules, not this file.

| Doc                          | If you're touching...                                                    |
| ---------------------------- | ------------------------------------------------------------------------ |
| @rules/coding-conventions.md | src/ TypeScript (style, semicolons, `any`, public API, lint/build gates) |
| @rules/testing.md            | tests, or global Loxer/box/decorator behavior                            |
| @rules/documentation.md      | JSDoc, the documentation/ guide, or regenerating docs/                   |
