# Test bugs â€” 2026-08-09-tracemarkerchaining

> Model/effort: gpt-5/unknown

All bugs found during Testing were trivial and fixed inline.

- `.h()` and `.highlight()` without an argument emitted `undefined` instead of the Loxer default `true`. The collector now emits `true`.
- Literal invalid `.props()` and `.pp()` targets were accepted. The collector now reports a transform diagnostic while dynamic expressions remain runtime-safe.
- Computed and unknown fluent members rooted at the imported marker were left untransformed. The collector now reports code-frame diagnostics.
