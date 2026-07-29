# Review (pass 3): Type-safe module ids — final confirmation

**Verdict:** PASS
**Scope:** the two fixes applied to `review-2.md`'s findings (`src/index.ts` export completion;
`documentation/index.md:445` revert + clarifying sentence). Deliberately narrow — a confirm-or-refute
pass, not a re-audit.
**Lenses run:** code ✓ · test skipped: no test artifact changed since pass 2 (`test/types/` untouched
this pass) · acceptance / security / perf / a11y skipped as before

## Findings

**None.** Both fixes verified clean; nothing new introduced.

## What was confirmed

- **The export list is now complete.** The reviewer walked the public members of every type exported
  from `src/index.ts`: `ErrorLox` (`error: Error`, `openLoxes: OutputLox[]`), `OutputLox`
  (`box: Box`, `module: ExtendedModule`, plus the inherited `item: ItemType`,
  `itemOptions: ItemOptions`, `type: LoxType`), `LoxerOptions` / `LoxerConfig` / `Module` /
  `LoxerCallbacks` (`boxLayoutStyle: BoxLayoutStyle`), `OfLoxes` / `OpenedLox` (item params). Every
  member type is nameable. `Box` and `BoxSegment` needed no addition — they already ride the
  pre-existing `export * from './core/BoxFactory.js'`.
- **The scope expansion was correct, not overreach.** Each of the five names added beyond the two
  flagged is reachable from a type that pass 1 had already exported, so omitting any one would have
  reproduced the identical defect.
- All additions are correctly **type-only** and collide with nothing.
- **`documentation/index.md:445` matches `src/core/Modules.ts:127` again**, the new framing sentence
  is consistent with the `satisfies` advice at `:172-173` (same rule, two different snippets), and
  the revert does **not** reopen pass 1's HIGH — the callout sits immediately above the block and
  explicitly redirects readers to `satisfies` for their own modules.

## Knowingly open (carried, not re-litigated)

- **[MEDIUM]** No changelog/version signal for the intentional `getModuleLevel` narrowing —
  `package.json` is still `3.0.0` and the repo has no `CHANGELOG.md`. **Needs a product decision:**
  how this project signals a breaking type change. Not fixable without that call.
- **[MEDIUM]** The registry is one global declaration-merging target per compilation. **Accepted by
  design** — this is the trade-off the plan deliberately chose over the generic-`init` alternative,
  and it is disclosed in the `LoxerModuleRegistry` JSDoc. The blast radius is monorepo /
  project-reference builds that compile two augmenting packages' *sources* together; consumers of
  independently published packages are unaffected.

## Rule coverage gaps

Unchanged from pass 2 — all belong to the Documentation phase:

- `rules/testing.md` documents none of `typecheck:types`, `test/types/`, the `.test-d.ts` convention,
  or the post-`build` ordering requirement.
- No semver/changelog rule and no `CHANGELOG.md`.
- `rules/documentation.md` has no rule about a guide footgun going live while the guide fix is
  deferred to a later phase — the situation this change created and that pass 1 caught.
