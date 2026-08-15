# Plan: Reinvent Loxer documentation around tracing

> Grounding: architect (technical) consulted · web-researcher (selection) skipped: no new dependency
> Spec: none — planned from the approved trace-first documentation direction in this task

## Context

Loxer's authored documentation presents automatic tracing before the logger tour, but its information architecture, README, and generated reference still frame logging primitives as the product. The rewrite must make automatic function tracing and contextual trace points the shortest path into the library, explain logging as the system supporting those traces, retain complete feature depth, and provide framework instructions that are precise enough to copy and verify.

The authored guides remain Markdown under `documentation/`. The root `README.md` remains the concise product landing page and the generated `docs/` tree remains TypeDoc output. No documentation framework or runtime dependency is added. TypeDoc owns exhaustive signatures and member details; authored pages own concepts, tasks, examples, integrations, troubleshooting, and reader journeys.

## Approach

Implement one trace-first, progressive-disclosure documentation system in vertical slices.

1. **Inventory the current coverage before replacing it.** Create a temporary working coverage matrix in the plan worklog or implementation notes that maps every teaching section in `documentation/index.md`, `documentation/props.md`, `documentation/environments.md`, `documentation/Performance.md`, both trace-plugin READMEs, and the root README to a new canonical page or an explicit retirement. Add the public exports from `loxer` and `loxer/trace` to the same audit. Use source, tests, package manifests, and runnable examples as the behavioral source of truth; do not preserve stale prose merely because it exists.

2. **Establish the new authored information architecture and content ownership.** Keep `documentation/index.md` as the durable documentation hub and add:
   - `documentation/quick-start.md` for one verified five-minute trace.
   - `documentation/learn/` for the mental model, tracing versus logging, levels/modules, and development versus production behavior.
   - `documentation/tracing/` for function markers, inline markers, trace points, fluent modifiers, messages, args/results and props, async/error behavior, supported shapes, and manual tracing as the fallback.
   - `documentation/logging/` for standalone logs, errors, levels, modules, props, manual boxes, history, and initialization/queue behavior.
   - `documentation/integrations/` for the selection page and verified toolchain/framework recipes.
   - `documentation/output/` for custom streams, renderers, production forwarding, and privacy/redaction.
   - `documentation/recipes/` for end-to-end workflows that combine tracing and logging.
   - `documentation/reference/` for troubleshooting, limitations, compatibility, performance, and migration material that is not generated API reference.

   Keep the old externally linked `documentation/props.md`, `documentation/environments.md`, and `documentation/Performance.md` paths as short compatibility pages that route readers to the new canonical pages. Do not duplicate the moved material. Keep migration content in its own reference appendix and maintainer recommendations out of user-facing compatibility pages.

3. **Build the product story and golden reader path first.** Rewrite `README.md`, `documentation/index.md`, and `documentation/quick-start.md` together. The first screen should show the outcome: ordinary function execution becomes a readable trace with contextual logs, timing, async completion, and failure context. Follow it with a small copyable example and its rendered output, then route readers by intent: start tracing, integrate a toolchain, learn logging, customize output, or open the API reference. The README should summarize rather than duplicate the guide.

4. **Use Vite as the fully verified quick-start path.** Base the quick start on `vite-plugin-loxer-trace` and `examples/vite-trace-demo`. Show installation, plugin configuration, initialization, one `trace.info` marker, one `trace.point`, exact expected output, and a short explanation of the generated box. Link immediately to Babel and other environments. State runtime and plugin Node requirements from current package manifests, not remembered version prose.

5. **Write the tracing handbook before the logging handbook.** Teach the automatic lifecycle first: target selection, fluent module/level/highlight/props modifiers, contextual points, message templates and callbacks, returned values, promises, throws/rejections, supported syntax, transform boundaries, and privacy implications. Present `Loxer.open()` / `Loxer.of()` only after automatic tracing, for code a build transform cannot reach or flows assembled manually. Reuse one small order or checkout domain across pages so examples accumulate rather than reset the reader's context.

6. **Teach logging as the trace-supporting subsystem.** Explain initialization, singleton/realm behavior, the bounded pre-init queue, standalone logs and error events, levels versus module thresholds, typed module ids, props rendering, manual boxes, history, output dispatch, and production silence. Cross-link each concept from the trace feature that uses it. Keep exhaustive option/member lists in TypeDoc and place only task-relevant fields in authored pages.

7. **Turn environment coverage into verified integration recipes.** Give every integration page the same shape: support status and versions; transform path; install command; complete configuration; initialization placement; trace example; test-runner setup; verification step; production notes; limitations; troubleshooting. Start with the shipped transform families and proven fixtures—Vite, Babel, Vitest, Jest/Babel, and Node builds—then add framework pages for Vite-based frameworks, Next.js, Nuxt/Vue, React Router/Remix, Expo/React Native, and custom transform hooks. A framework receives copyable instructions only when its current build path is verified against an executable fixture or current authoritative framework documentation. Unverified or unsupported environments stay in the compatibility matrix with a clear status and fallback instead of receiving speculative recipes. Move the maintainer-only adapter recommendations currently in `documentation/environments.md` to `documentation/debt.md` if they remain active product gaps.

8. **Make examples maintainable documentation fixtures.** Align the Vite demo, trace-plugin README examples, and relevant playground programs with the canonical snippets. Add focused compile/build fixtures where a snippet or integration would otherwise drift unnoticed. Package READMEs remain package-specific install/configuration references and link back to the canonical authored guides; they should not carry an independent, competing explanation of tracing.

9. **Make generated API documentation cover the headline API.** Add the public `src/trace.ts` subpath to `typedoc.json` and organize the generated reference so readers can distinguish `loxer/trace` from the root logger API. Review and update JSDoc/TSDoc in `src/trace.ts`, `src/tracing/types.ts`, `src/Loxer.ts`, and exported supporting types only where the generated reference is incomplete or contradicts behavior. Add bidirectional links: guides link to exact TypeDoc entries, and headline API comments link to the relevant tracing or logging guide. Regenerate `docs/` only through `pnpm run docs`.

10. **Finish with navigation and link migration.** Add consistent “next step” links to each authored page, update every hardcoded GitHub documentation URL in `README.md` and `src/Loxer.ts`, verify relative links and anchors, and update `rules/documentation.md` plus `documentation/AGENTS.md` to record the new content owners. Preserve external legacy paths through the compatibility pages rather than attempting to redirect GitHub blob URLs.

The implementation should land complete vertical slices rather than a directory skeleton: the hub, quick start, Vite integration, and core tracing pages must be useful before secondary pages are split out. Runtime behavior is out of scope unless verification exposes a concrete defect or a missing integration capability; such findings are recorded and routed separately instead of silently expanding this documentation change.

## Critical files

- `README.md` — replace the logger-first feature inventory with the concise trace-first product story, visual proof, quick example, and reader routes.
- `documentation/index.md` — become the authored documentation hub rather than the monolithic numbered API tour.
- `documentation/quick-start.md` — provide the smallest verified path from install to visible trace output.
- `documentation/tracing/` — own all automatic tracing, trace-point, marker, lifecycle, message, props, error, and limitation guides.
- `documentation/logging/` — own standalone logging, errors, levels, modules, initialization, boxes, and history guides.
- `documentation/integrations/` — own the compatibility overview and the copyable, verified framework/toolchain recipes.
- `documentation/output/` — own custom output, rendering, production forwarding, and security guidance.
- `documentation/learn/`, `documentation/recipes/`, `documentation/reference/` — own concepts, end-to-end examples, troubleshooting, limitations, performance, and migration.
- `documentation/props.md`, `documentation/environments.md`, `documentation/Performance.md` — become stable compatibility routes to canonical pages after their content is migrated.
- `assets/docs_images/` — replace or add trace-first before/after and quick-start output visuals, using stable raw GitHub URLs where npm/README rendering requires them.
- `src/trace.ts`, `src/tracing/types.ts` — provide accurate generated reference for the public tracing entry point, marker chains, message callbacks, and trace-point API.
- `src/Loxer.ts`, `src/index.ts`, `src/types.ts` — keep logging reference and hardcoded guide links aligned with the new authored structure.
- `typedoc.json` and generated `docs/` — include and expose the `loxer/trace` reference; regenerate output rather than editing it.
- `packages/babel-plugin-loxer-trace/README.md`, `packages/vite-plugin-loxer-trace/README.md` — retain package-local install and transform details while pointing conceptual material to the canonical guides.
- `examples/vite-trace-demo/`, `playground/`, and focused test fixtures under `test/` — supply executable proof for canonical snippets and integration claims.
- `rules/documentation.md`, `documentation/AGENTS.md`, and the root repository guidance if its layout table changes — record the new documentation ownership and verification rules after the content is established.

## Risks & open questions

- **Coverage loss during the split.** A topic/export-to-destination matrix is required before deleting or shortening any existing section; every item must have a canonical destination or an explicit reason for retirement.
- **Guide/API drift.** Authored pages explain tasks and link to TypeDoc for exhaustive members. Canonical snippets are tied to runnable demos or compile/build fixtures.
- **Framework instructions becoming stale.** Each page names its supported versions and transform path, includes a verification step, and is published as a recipe only after executable or authoritative verification. The matrix remains the honest home for incomplete support.
- **Trace-first messaging hiding operational constraints.** Initialization, production silence, per-realm singleton behavior, pre-init queueing, transform requirements, and client/server distinctions are introduced at the first point they affect copied code.
- **Sensitive argument and result capture.** Every page that introduces message payloads, props capture, or output forwarding states that Loxer performs no automatic redaction and links to the security/output guidance.
- **Broken external links after moving pages.** Stable old files remain as compatibility routes, and all repository-owned absolute links are updated and checked.
- **Generated files swallowing authored content.** All hand-written material stays under `documentation/`; `docs/` changes only through `pnpm run docs`.
- **Scope growth into runtime changes.** Runtime or adapter gaps found while proving documentation are logged as separate findings. This plan changes behavior only if the user explicitly expands the scope later.

There are no unresolved user-owned design choices. The approved boundary is Markdown authored guides plus TypeDoc reference, with no new documentation framework or dependency.

## Verification

1. Complete the coverage matrix and confirm every existing guide section, public export, trace option/modifier, integration claim, and legacy URL has a destination or intentional retirement.
2. Run `pnpm build`, `pnpm typecheck:test`, `pnpm typecheck:types`, `pnpm test`, and `pnpm lint` after examples, JSDoc, fixtures, or source-linked documentation change.
3. Run `pnpm demo:build` and the canonical Babel fixture/tests to prove both shipped transform paths. Run any playground file used by a guide after `pnpm build`.
4. Run `pnpm run docs`; confirm TypeDoc reports HTML generation under `docs/`, the `loxer/trace` API is discoverable, the README landing page renders, and the generated diff matches the JSDoc/entry-point changes.
5. Check all authored Markdown links, GitHub blob links, image URLs, and local anchors with a repository script or deterministic link-check command that adds no new dependency. Search for old headings and moved filenames to catch stale references.
6. Compile or execute canonical snippets against the built ESM package. Confirm imports use the real public entry points and examples reflect current Node engines, module format, option names, and marker syntax.
7. For each published integration recipe, verify the complete configuration with a fixture when practical; otherwise record the current authoritative source and manually follow the page's own verification step. Do not publish speculative framework instructions as working recipes.
8. Perform three reader-path reviews: a newcomer reaches visible trace output from the README in minutes; an evaluator understands the trace advantage before reading logger details; an advanced user can locate every feature, integration constraint, and exact API signature without duplicated reference prose.
