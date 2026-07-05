# Documentation rules

> Two separate targets, do not conflate them: `documentation/` is the authored user guide
> (hand-written Markdown); `docs/` is generated TypeDoc HTML (`typedoc.json`, `yarn docs`).

## Always

- Keep `documentation/` examples aligned with the public API exported by `src/index.ts`.
- Keep JSDoc in `src/` aligned with actual behavior before regenerating `docs/` — TypeDoc reads
  JSDoc, not `documentation/`.
- When a feature adds a concept or option a user must learn, update the relevant guide in
  `documentation/` in the same change.
- Put documentation images under `assets/docs_images/`; use stable GitHub raw URLs for images in
  Markdown meant to render outside the repo (README, npm page).
- Regenerate the API reference with `yarn docs` (`typedoc --options typedoc.json`) after a JSDoc
  change. A documentation task touching JSDoc is done only when `yarn docs` exits 0.

## Never

- Never hand-edit anything under `docs/` — it is generated output and `yarn docs` may wipe it.
  Edit source JSDoc or `typedoc.json` instead, then regenerate.
- Never copy generated API reference content (member lists, generated signatures) into
  `documentation/`; link to the TypeDoc output for exhaustive members and keep `documentation/`
  task-oriented.
- Never duplicate content owned by `docs/rules/coding-conventions.md` or `docs/rules/testing.md`
  — this file covers documentation only.

## Files

- `documentation/index.md` — main usage guide.
- `documentation/item.md` — rich item printing.
- `documentation/Performance.md` — benchmark methodology and results.

## Reference

- TypeDoc entry points and output dir: `typedoc.json`.
