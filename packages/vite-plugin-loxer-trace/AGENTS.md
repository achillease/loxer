# Vite trace plugin

This module is the Vite adapter around `babel-plugin-loxer-trace`: a `transform` hook that filters
module ids and hands the id to `transformLoxerTrace` as the filename, and a `config` hook that
contributes the settings keeping the page on one copy of Loxer. Read `@../../AGENTS.md` and the
root testing rules before changing it.

## Always

- Give Loxer both entry points in one `optimizeDeps.include` (`['loxer', 'loxer/trace']`), so a
  `loxer/trace` discovered late cannot force a mid-session re-optimize and the page reload that comes
  with it. This plugin injects that import into files the user never edited, which is exactly how the
  late discovery happens.
- Keep the `config` hook a function of its own arguments. It reads the `UserConfig` Vite hands it and
  nothing else — no filesystem probe, no module resolution, no inspection of how the consumer
  installed Loxer. A hook that reshapes itself around a consumer's environment is a hook whose
  behavior no test of the published package can pin, and whose failure mode is a silently different
  config in the one project nobody here can run.
- Route every array contribution through `missingFrom`, so the hook contributes only what the user
  has not already listed and Vite's array concatenation cannot produce a duplicate.
- Prove a `config`-hook change against a running dev server, not against the hook's return value:
  Vite merges, defaults and re-resolves what the hook returns, and the optimizer's effect is not
  visible in it. Start a real `createServer` on a consumer config and read the resolved
  `optimizeDeps.include` and `resolve.dedupe`, plus what `loxer/trace` actually resolves to and
  whether the id the app imports points into `node_modules/.vite/deps`.

## Never

- Never assume a Vite internal — cache keys, config defaults, merge semantics, which resolver runs —
  from memory. Read it out of the installed `vite` package in `node_modules`, at the version the
  consumer runs. Vite 8 resolves bare specifiers through `finalizeBareSpecifier`, which decides
  optimization from `optimizeDeps.exclude` alone; the older `tryNodeResolve` guard that skipped a
  package resolving outside `node_modules` is still in the bundle but no longer on that path, so a
  rule inferred from Vite 5–7 can be wrong without looking wrong.
- Never make this plugin responsible for a consumer's development setup — a working copy of Loxer
  wired in with `link:`, `pnpm link`, `file:`, or a workspace path. Pre-bundling such a copy freezes
  it (Vite's dependency-cache hash reads the lockfile and the resolved config, never a package's own
  files), but the fix belongs in the consumer's config, where the person who created the link can see
  it: `optimizeDeps.exclude` plus `loxerTrace({ dedupe: false })`. The published plugin behaves the
  same for every consumer, and the README's "Pre-bundling and a working copy of Loxer" is where that
  is explained rather than detected.
- Never widen `server.fs.allow` from this plugin. It is the boundary deciding which files the dev
  server hands to a browser; a plugin adding to it silently, on top of a list the project drew
  itself, changes a security-relevant setting the consumer cannot see without resolving the config.
