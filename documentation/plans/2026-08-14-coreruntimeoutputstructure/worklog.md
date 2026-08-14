# Worklog — 2026-08-14-coreruntimeoutputstructure

> **How to log:** Add each new row at the bottom of this table. Use a real `YYYY-MM-DD HH:MM` time (`Get-Date -Format "yyyy-MM-dd HH:mm"` / `date "+%Y-%m-%d %H:%M"`). Start **Action** with the phase, for example `[Planning]` or `[Implementation]`.

| Timestamp | Action | Detail |
|-----------|--------|--------|
| 2026-08-14 17:54 | [Planning] Core runtime/output structure plan written | Grounded the agreed Version 1 layout against the marker-only HEAD. The plan keeps the change path-only, preserves the root and `loxer/trace` public surfaces, groups core internals under `runtime` and `output`, moves trace message support to a peer `tracing` feature, and covers stale emitted artifacts plus current path guidance. |
| 2026-08-14 18:03 | [Implementation] Source structure moved and regression contract preserved | Moved runtime, output, color, and tracing internals to the planned paths; updated direct source and test imports; removed 48 exact stale generated files. `pnpm build`, `pnpm test` (559 tests), `pnpm typecheck:test`, and `pnpm typecheck:types` pass. Current steering and authored path documentation remains for the Documentation phase. |
| 2026-08-14 18:07 | [Implementation] Package-facing verification completed | Confirmed old moved paths are absent from `dist`, both package entry points smoke-import, TypeDoc completes with 0 errors, and the package dry run contains the new runtime/output/tracing trees without the obsolete moved paths. Lint exits 0 with the same pre-existing `Modules.ts` newline warning. |
| 2026-08-14 18:32 | [Finalization] Changelog | Added 1 Changed entry under [Unreleased] in CHANGELOG.md; implies MAJOR (3.0.0) |
| 2026-08-14 18:34 | [Finalization] Commit | [2026-08-14-coreruntimeoutputstructure] Reorganize core subsystems |
