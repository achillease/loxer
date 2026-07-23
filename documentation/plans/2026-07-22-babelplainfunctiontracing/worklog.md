# Worklog — 2026-07-22-babelplainfunctiontracing

> **How to log:** read this file first, then add your row at the **bottom** of the table, below the last existing row (newest last — never insert after the header). The **Timestamp** is `YYYY-MM-DD HH:MM` from a real clock (`Get-Date -Format "yyyy-MM-dd HH:mm"` / `date "+%Y-%m-%d %H:%M"`) — never guess the time. Prefix each **Action** with the workflow phase in brackets — e.g. `[Planning]`, `[Implementation]`, `[Testing]`, `[Reviewing]`, `[Documentation]`, `[Finalization]` — so every entry is traceable to the phase that wrote it.

| Timestamp | Action | Detail |
|-----------|--------|--------|
| 2026-07-23 01:28 | [Planning] | Wrote the Babel-first plain-function tracing plan, grounded in the Loxer box lifecycle and Babel/Vite selection findings. |
| 2026-07-23 18:56 | [Planning] | Replanned for Babel 8/Node 22.18+ only; defined the Vite+Babel-before-Oxc path and shared contract instead of a cross-engine AST layer. |
| 2026-07-23 19:02 | [Planning] | Moved resolved Babel, Oxc, scope, semantic-preservation, browser, and IPC decisions into the plan context and approach; retained only open product decisions. |
| 2026-07-23 19:11 | [Planning] | Settled on the `loxed(target, options)` marker, `loxer/instrument` entry point, and independently versioned Babel/Vite companion package names. |
| 2026-07-23 19:40 | [Planning] | Settled focused function-level trace-option parity, the fixed failure close message, and formatter fallback behavior; no implementation open questions remain. |
| 2026-07-23 19:44 | [Documentation] | Moved workflow plans into `documentation/plans/` beside specs and updated the repository documentation convention. |
| 2026-07-23 19:48 | [Finalization] Commit | [2026-07-22-babelplainfunctiontracing] Document Babel tracing design |
