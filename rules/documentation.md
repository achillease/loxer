# Documentation rules

> Two separate targets, do not conflate them: `documentation/` is the authored user guide
> (hand-written Markdown); `docs/` is generated TypeDoc HTML (`typedoc.json`, `pnpm docs`).

## Always

- Keep `documentation/` examples aligned with the public API exported by `src/index.ts`.
- Keep JSDoc in `src/` aligned with actual behavior before regenerating `docs/` — TypeDoc reads
  JSDoc, not `documentation/`.
- When a feature adds a concept or option a user must learn, update the relevant guide in
  `documentation/` in the same change.
- Put documentation images under `assets/docs_images/`; use stable GitHub raw URLs for images in
  Markdown meant to render outside the repo (README, npm page).
- Regenerate the API reference with `pnpm docs` (`typedoc --options typedoc.json`) after a JSDoc
  change. A documentation task touching JSDoc is done only when `pnpm docs` exits 0.
- When renaming or moving a file under `documentation/`, update the matching
  `https://github.com/pcprinz/loxer/blob/master/documentation/...` links in `README.md` and in the
  JSDoc comments on the `Loxer` class in `src/Loxer.ts`. `typedoc.json` sets no `readme` option, so
  TypeDoc uses `README.md` as the generated site's front page, and TypeDoc renders `Loxer`'s JSDoc
  into the API pages — both carry hardcoded absolute links to `documentation/` files that nothing
  checks at build time.

## Never

- Never hand-edit anything under `docs/` — it is generated output and `pnpm docs` may wipe it.
  Edit source JSDoc or `typedoc.json` instead, then regenerate.
- Never copy generated API reference content (member lists, generated signatures) into
  `documentation/`; link to the TypeDoc output for exhaustive members and keep `documentation/`
  task-oriented.
- Never duplicate content owned by `rules/coding-conventions.md` or `rules/testing.md` — this
  file covers documentation only.

## Files

- `documentation/index.md` — main usage guide.
- `documentation/item.md` — rich item printing.
- `documentation/Performance.md` — benchmark methodology and results.

## Reference

- TypeDoc entry points and output dir: `typedoc.json`.
