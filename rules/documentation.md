# Documentation rules

> Two separate targets, do not conflate them: `documentation/` is the authored user guide
> (hand-written Markdown); `docs/` is generated TypeDoc HTML (`typedoc.json`, `pnpm run docs`).
> `pnpm docs` (without `run`) is pnpm's own built-in "open a package's documentation in a
> browser" command (alias `home`) and it shadows the package script of the same name — it exits
> 0 and regenerates nothing. Always type `pnpm run docs`.

## Always

- Keep `documentation/` examples aligned with the public entry point that owns the API:
  `src/index.ts` for logging and `src/trace.ts` for tracing.
- Keep JSDoc in `src/` aligned with actual behavior before regenerating `docs/` — TypeDoc reads
  JSDoc, not `documentation/`.
- When a feature adds a concept or option a user must learn, update the relevant guide in
  `documentation/` in the same change.
- Keep `documentation/index.md` a navigation hub. Put authored teaching content in the canonical
  section that owns it: `learn/`, `tracing/`, `logging/`, `integrations/`, `output/`, `recipes/`,
  or `reference/`.
- Keep `documentation/quick-start.md` as the golden five-minute Vite path. It must remain a
  complete, runnable route from installation through observed browser-console output; route Babel,
  Node, and test-runner setup to their integration guides instead of branching the quick start.
- Keep `documentation/props.md`, `documentation/environments.md`, and
  `documentation/Performance.md` as compatibility routes only. Their canonical destinations are
  `documentation/logging/props.md`, `documentation/integrations/`, and
  `documentation/reference/performance.md`; add or revise teaching content at those destinations.
- Keep conceptual and task guidance in `documentation/`. Adapter package READMEs own exhaustive
  package-local installation, configuration, transform behavior, options, and maintenance
  details. A task guide may show the minimum setup needed to complete its path, then link to the
  package README instead of maintaining a second exhaustive explanation.
- Write every guide as if the current design had always been the design. State what a thing is
  and does, not what it used to be or why it changed. Ban the diff-narrating register — "now",
  "no longer", "instead of", "was removed", "still", "also" — and rationale that argues against a
  rejected or previous design; that belongs in a plan folder (`documentation/plans/`) or the
  migration appendix (see the next rule), never in a teaching section.
- Prefer plain description over coining a new noun. If a term is genuinely needed, define it at
  its first use and keep it to exactly one meaning throughout — never let two sentences use the
  same word for two different things. A coined term that has leaked into an exported type name is
  a signal to rename the type, not to teach the term: `LevelChannel` became `LevelMethods` in
  `src/types.ts` for exactly that reason.
- Keep the level/threshold distinction consistent wherever a guide discusses `LogLevel`: a log
  **has a level**; a module **logs up to** a level (its threshold). Never use the same word in
  prose for both roles — this is a wording rule, not a rule about the exported names
  (`LogLevel`, `BoxLevel`, `lox.level`, `Module.devLevel`/`prodLevel`, `defaultLevels`,
  `getModuleLevel`), which stay as they are.
- Confine upgrade/migration content (version-to-version tables, before/after mappings) to a
  dedicated appendix after the guide's last teaching section, opening with a line telling readers
  on the current major that it's safe to skip — see
  `documentation/reference/migrating-from-2.md`. A numbered/teaching section must never reference a
  previous major version.
- When an example's code changes, re-read every comment adjacent to it — a stale comment (e.g.
  one that names an action the code no longer performs) teaches the old model and is worse than
  no comment.
- Before attributing a `pnpm run docs` page rename or removal to your change, regenerate from an
  unmodified checkout and compare — `docs/` is committed but wholesale-replaced per run, so it
  routinely drifts from `src/` between regenerations and a rename can predate your change
  entirely. A new link reference added under `documentation/` must point at a page name confirmed
  in a freshly generated `docs/` tree, never a guessed path.
- Put documentation images under `assets/docs_images/`; use stable GitHub raw URLs for images in
  Markdown meant to render outside the repo (README, npm page).
- Regenerate the API reference with `pnpm run docs` (`typedoc --options typedoc.json`) after a
  JSDoc change. An exit code alone never proves this — `pnpm docs` (missing `run`) also exits 0
  while regenerating nothing, so a zero exit status is not evidence. A documentation task touching
  JSDoc is done only when the command's own output confirms it (typedoc prints "html generated at
  ./docs") and `git status`/`git diff` shows the `docs/` tree actually changed.
- Keep workflow plan folders and worklogs in `documentation/plans/<date>-<slug>/`, alongside
  `documentation/specs/`; never put them under `docs/plans/`. `docs/` is the TypeDoc `out` dir,
  so `pnpm run docs` wipes anything living there (see the `docs/` Never below); untracked plan
  folders would be destroyed on the next run.
- Keep review reports in a plan folder append-only: use `review.md` for the first pass, then
  `review-N.md` for each later pass; never overwrite an earlier report. Group related remediation
  before rerunning review instead of addressing one finding per pass.
- When renaming or moving a file under `documentation/`, update the matching
  `https://github.com/pcprinz/loxer/blob/master/documentation/...` links in `README.md` and in the
  JSDoc comments on the `Loxer` class in `src/Loxer.ts`. `typedoc.json` sets no `readme` option, so
  TypeDoc uses `README.md` as the generated site's front page, and TypeDoc renders `Loxer`'s JSDoc
  into the API pages — both carry hardcoded absolute links to `documentation/` files that nothing
  checks at build time.

## Never

- Never hand-edit anything under `docs/`, and never place hand-written files (workflow plan
  folders included) there — it is generated output, and `pnpm run docs` wipes the **entire**
  `docs/` tree on every run (`cleanOutputDir` defaults to `true`). Edit source JSDoc or
  `typedoc.json` instead, then regenerate.
- Never add `readme: "none"` to `typedoc.json`, or otherwise suppress the README front page —
  `docs/index.html` is intentionally the rendered `README.md`, not the API module index. If the
  generated docs look wrong (e.g. a stale version in the title), regenerate with `pnpm run docs`;
  do not change the landing page.
- Never copy generated API reference content (member lists, generated signatures) into
  `documentation/`; link to the TypeDoc output for exhaustive members and keep `documentation/`
  task-oriented.
- Never turn a compatibility route into a second guide, or copy exhaustive adapter-owned package
  details into a canonical guide. Link to the owner so one page remains authoritative.
- Never duplicate content owned by `rules/coding-conventions.md` or `rules/testing.md` — this
  file covers documentation only.

## Files

- `documentation/index.md` — hub for the authored guide.
- `documentation/quick-start.md` — golden Vite quick start.
- `documentation/{learn,tracing,logging,integrations,output,recipes,reference}/` — canonical
  authored sections.
- `documentation/{props.md,environments.md,Performance.md}` — compatibility routes; keep their
  content limited to links to canonical guides.
- `packages/{babel-plugin-loxer-trace,vite-plugin-loxer-trace}/README.md` — package-local adapter
  installation, configuration, transform, options, and maintenance details.
- `documentation/debt.md` — standing register of known-but-unfixed defects. Append; don't re-create.
  A maintainer document, not a guide — the "describe the current design" rules above govern the
  guides and do not apply to it.

## Reference

- TypeDoc entry points and output dir: `typedoc.json`; `src/trace.ts` is a public entry point and
  must remain represented in generated API navigation.
