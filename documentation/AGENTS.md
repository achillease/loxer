# Authored Documentation

This folder is the human-written guide for package users. It is distinct from generated TypeDoc
HTML in `docs/`.

## Rules

- Keep examples aligned with the public API exported by `src/index.ts`.
- When adding a feature, update this guide if users need to learn a new concept or option.
- Images referenced here live under `assets/docs_images/`; prefer stable GitHub raw URLs when the
  Markdown is meant to render outside the repository.
- `index.md` is the main usage guide, `item.md` explains rich item printing, and `Performance.md`
  records benchmark methodology and results.
- Do not copy generated API reference content into these guides; link to TypeDoc for exhaustive
  members and keep this folder task-oriented.
- Renaming a file here breaks hardcoded GitHub blob links in `README.md` and in the `Loxer` class
  JSDoc (`src/Loxer.ts`) — see `rules/documentation.md` for where to update them. TypeDoc uses
  `README.md` as its generated front page, so those links surface there too.
