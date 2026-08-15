# Authored Documentation and Workflow Artifacts

This folder contains the hand-written user guide and durable workflow artifacts. Generated TypeDoc
HTML lives in `docs/`, not here.

## Guide shape and routing

- Favour a small set of substantial, task-oriented guides over a hierarchy of narrowly scoped
  pages. Merge related material when readers need it in the same journey; do not split a page only
  to give each feature its own URL.
- `index.md` is the primary landing page and may be long. It should orient a new reader, show the
  main tracing and logging capabilities with representative runnable examples, explain the paths
  through the guide, and link only when a separate page offers a distinct task or substantially
  deeper treatment.
- Keep `quick-start.md` as the golden onboarding path: a minimal, verified Vite trace from
  installation through browser-console output. The landing page can introduce the outcome and
  link to this complete setup path.
- Organize remaining guide pages around durable reader tasks, such as setup, tracing, logging and
  output, rather than the former section directories. When consolidating, move useful teaching
  content into its destination before removing a source page, then update internal and external
  links.
- Keep a topic separate only when it supports an independent workflow, needs a long reference or
  troubleshooting treatment, or would interrupt the main learning path. Compatibility routes stay
  short pointers to their canonical content.
- Package adapter READMEs own exhaustive installation and transform details. Generated TypeDoc owns
  exhaustive signatures, members, option fields, and supporting types.

## Rules

- Keep examples aligned with the public package surfaces in `src/index.ts` and `src/trace.ts`.
- When a feature adds a concept or option users must learn, update the relevant consolidated guide
  and the landing page when it changes the reader's starting choices or showcased capabilities.
- Follow `rules/documentation.md` for guide voice, terminology, migration placement, link updates,
  and TypeDoc regeneration requirements.
- Images referenced here live under `assets/docs_images/`; prefer stable GitHub raw URLs when the
  Markdown must render outside the repository.
- `debt.md` is the standing register of known-but-unfixed defects and design compromises. Append to
  it when a pass leaves a real problem in place; move resolved entries to its `Resolved` section
  instead of deleting them. Bugs found and fixed within one change belong in that change's worklog.
- Specs live in `specs/`. Each implementation plan and its `worklog.md` live together in
  `plans/<date>-<slug>/`.
- Never put authored guides or workflow artifacts in `docs/`: `pnpm run docs` regenerates and may
  wipe that tree. Bare `pnpm docs` is pnpm's unrelated built-in command and can exit 0 without
  generating anything.
- Do not copy generated API reference content into these guides; link to TypeDoc and keep the
  authored documentation task-oriented.
- Renaming or moving a guide can break hardcoded GitHub links in `README.md` and `src/Loxer.ts`;
  update every matching link described by `rules/documentation.md`.
