# Vite trace plugin

This module is the Vite adapter around `babel-plugin-loxer-trace`: a `transform` hook that filters
module ids and hands the id to `transformLoxerTrace` as the filename, and a `config` hook that
contributes the settings keeping the page on one copy of Loxer. Read `@../../AGENTS.md` and the
root testing rules before changing it.

## Always

- Tell an installed Loxer from a linked one by the resolved real path: a directory that sits inside
  any `node_modules` is installed (`isInstalledPackagePath`), anything else is linked. "Is it a
  symlink" is not the test — under pnpm every installed package is a symlink into the virtual store,
  so that check reports every dependency as linked.
- Give an installed Loxer both entry points in one `optimizeDeps.include`
  (`['loxer', 'loxer/trace']`), so a `loxer/trace` discovered late cannot force a mid-session
  re-optimize and the page reload that comes with it. This plugin injects that import into files the
  user never edited, which is exactly how the late discovery happens.
- Keep a linked Loxer out of the optimizer. Vite's `getDepHash` is the lockfile hash plus a config
  hash over `optimizeDeps.include`/`exclude`, `resolve`, `root` and plugin *names* — nothing in it
  reads a linked package's files, so a pre-bundle serves the build that existed when the cache was
  written, through every rebuild, until `node_modules/.vite` is deleted by hand. This is not
  hypothetical: it silently broke a real app while the whole test suite was green.
- Carry `searchForWorkspaceRoot(root)` alongside the linked directory whenever the project set no
  `server.fs.allow` of its own. Vite resolves the list as
  `allow: raw?.fs?.allow ?? [workspaceRoot]`, so any contribution replaces the workspace-root
  default rather than extending it, and omitting the root stops the project serving its own source.
  When the project did set a list, contribute only the entry it lacks, so the widening is that one
  directory rather than the two-entry default. A project that set its own list does still get Loxer's
  directory added to it — an accepted trade-off, disclosed in the `dedupe` JSDoc and in the README's
  "What `server.fs.allow` means for you"; keep those two and this bullet saying the same thing.
- Route every array contribution through `missingFrom`, which contributes each entry once and never
  duplicates what the user already listed — the linked directory and the workspace root are the same
  path for any project inside Loxer's own repository.
- Prove a `config`-hook change against a running dev server, not against the hook's return value:
  Vite merges, defaults and re-resolves what the hook returns, and neither the optimizer's effect
  nor `fs.allow` is visible in it. Start a real `createServer` on a consumer config and read the
  resolved `optimizeDeps.include`, `resolve.dedupe` and `server.fs.allow`, plus what `loxer/trace`
  actually resolves to.
- Cover both branches with fixtures that lay the two shapes out on disk in the OS temp directory
  (`test/vite-plugin-loxer-trace.test.ts`): a real package directory under `node_modules` for
  installed, a junction for linked. A test that needs a link must create it in a temp directory,
  never pointing into this repository, and must remove the link before the tree it sits in — the
  repo's `node_modules` links back to the repository root, so a link-following recursive delete
  there can reach `.git` and `src/`.
- Remove that link with `unlinkSync`, never `rmdirSync`. `symlinkSync(..., 'junction')`'s third
  argument is honoured on Windows and ignored on every other platform, so the same fixture line
  leaves a junction here and an ordinary symlink on `ubuntu-latest`/`macOS-latest`. Windows
  `rmdir` accepts a junction because it treats one as a directory, but POSIX `rmdir` rejects a
  symlink with `ENOTDIR`, so `rmdirSync` passes on Windows and throws in `afterAll` on the other
  two runners in `.github/workflows/main.yml` — a two-of-three-platform failure a Windows-only
  local run can't see. `unlink` removes the link on every platform and leaves the target directory
  in place; see the `removeLink` helper in `test/vite-plugin-loxer-trace.test.ts`.

## Never

- Never assume a Vite internal — cache keys, config defaults, merge semantics — from memory. Read it
  out of the installed `vite` package in `node_modules`; every rule above came from doing that, and
  two of them contradicted the obvious guess.
- Never reimplement a `vite` export to keep this package dependency-free. `vite` is a peer
  dependency (^5–^8), so importing a value from it — `searchForWorkspaceRoot` — adds nothing to a
  consumer's install and cannot drift from the resolution rules it mirrors.
