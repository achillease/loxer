# Authored Documentation and Workflow Artifacts

This folder contains both the human-written guide for package users and durable workflow
artifacts. It is distinct from generated TypeDoc HTML in `docs/`.

## Rules

- Keep examples aligned with the public API exported by `src/index.ts`.
- When adding a feature, update this guide if users need to learn a new concept or option.
- Images referenced here live under `assets/docs_images/`; prefer stable GitHub raw URLs when the
  Markdown is meant to render outside the repository.
- `index.md` is the main usage guide, `item.md` explains rich item printing, and `Performance.md`
  records benchmark methodology and results.
- `debt.md` is the standing register of known-but-unfixed defects and design compromises. Append to
  it — never re-create it — whenever a pass decides to *leave* a real problem in place; a bug found
  and fixed within one change belongs in that change's worklog instead. It is a maintainer document,
  not a guide: describing what is broken and why is its whole job, so the "document the current
  design" register that governs the guides does not apply to it. Move an entry to its `Resolved`
  section rather than deleting it.
- Specs live in `specs/`. Each implementation plan and its `worklog.md` live together in
  `plans/<date>-<slug>/`.
- `docs/` is generated TypeDoc output. Never place authored guides, specs, plans, or worklogs
  there: `pnpm docs` can wipe the whole directory.
- Do not copy generated API reference content into these guides; link to TypeDoc for exhaustive
  members and keep this folder task-oriented.
- Renaming a file here breaks hardcoded GitHub blob links in `README.md` and in the `Loxer` class
  JSDoc (`src/Loxer.ts`) — see `rules/documentation.md` for where to update them. TypeDoc uses
  `README.md` as its generated front page, so those links surface there too.
