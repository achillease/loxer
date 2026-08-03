import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { searchForWorkspaceRoot, type ConfigEnv, type UserConfig } from 'vite';
import loxerTrace, { isInstalledPackagePath } from '../packages/vite-plugin-loxer-trace/src/index';

// Whether Loxer is installed or linked decides what the config hook may contribute, and the only
// honest way to tell the two apart is to lay both out on disk: an installed package is a directory
// under `node_modules`, a linked one is a working copy that `node_modules` only points at. Both
// fixtures live in the OS temp directory and link only within it - never into this repository,
// whose `node_modules` links back to the repository root.
let fixtureBase: string;
let installedRoot: string;
let linkedRoot: string;
let linkedPackage: string;
let junction: string;
let selfHostedPackage: string;
let selfHostedApp: string;
let selfHostedJunction: string;

const MANIFEST = JSON.stringify({
  name: 'loxer',
  version: '3.0.0',
  type: 'module',
  exports: { './package.json': './package.json' },
});

beforeAll(() => {
  fixtureBase = mkdtempSync(path.join(tmpdir(), 'loxer-vite-fixture-'));

  installedRoot = path.join(fixtureBase, 'installed-app');
  const installedPackage = path.join(installedRoot, 'node_modules', 'loxer');
  mkdirSync(installedPackage, { recursive: true });
  writeFileSync(path.join(installedRoot, 'package.json'), '{ "name": "installed-app" }');
  writeFileSync(path.join(installedPackage, 'package.json'), MANIFEST);

  linkedRoot = path.join(fixtureBase, 'linked-app');
  linkedPackage = path.join(fixtureBase, 'loxer-source');
  mkdirSync(path.join(linkedRoot, 'node_modules'), { recursive: true });
  mkdirSync(linkedPackage, { recursive: true });
  writeFileSync(path.join(linkedRoot, 'package.json'), '{ "name": "linked-app" }');
  writeFileSync(path.join(linkedPackage, 'package.json'), MANIFEST);
  junction = path.join(linkedRoot, 'node_modules', 'loxer');
  // a junction, not a symlink: Windows creates one without elevation, and pnpm's own `link:`
  // dependencies are laid out the same way
  symlinkSync(linkedPackage, junction, 'junction');

  // an app that lives *inside* the linked Loxer, which is also its own workspace root - the shape
  // every project in Loxer's own repository has, the demo included. `realpathSync` up front so the
  // workspace root Vite walks to and the package path the plugin resolves are the same string;
  // otherwise the two coincide only by luck and the duplicate this fixture exists for never forms.
  const selfHostedBase = path.join(fixtureBase, 'loxer-self-hosted');
  mkdirSync(selfHostedBase, { recursive: true });
  selfHostedPackage = realpathSync(selfHostedBase);
  selfHostedApp = path.join(selfHostedPackage, 'examples', 'demo');
  mkdirSync(path.join(selfHostedApp, 'node_modules'), { recursive: true });
  writeFileSync(path.join(selfHostedPackage, 'package.json'), MANIFEST);
  // the marker `searchForWorkspaceRoot` stops at, so it resolves to the package rather than walking
  // past it into the temp directory
  writeFileSync(path.join(selfHostedPackage, 'pnpm-workspace.yaml'), "packages:\n  - 'examples/*'\n");
  writeFileSync(path.join(selfHostedApp, 'package.json'), '{ "name": "demo" }');
  selfHostedJunction = path.join(selfHostedApp, 'node_modules', 'loxer');
  symlinkSync(selfHostedPackage, selfHostedJunction, 'junction');
});

afterAll(() => {
  // the links go first - a recursive delete that reached one would follow it into its target, and
  // `selfHostedJunction` points at an ancestor of itself
  removeLink(selfHostedJunction);
  removeLink(junction);
  rmSync(fixtureBase, { recursive: true });
});

/**
 * Removes a link to a directory without following it into its target.
 *
 * `unlink` is the one call that does this on every platform this suite runs on: `symlinkSync`'s
 * `'junction'` type is honoured on Windows and ignored everywhere else, so the same fixture line
 * leaves a junction here and an ordinary symlink on `ubuntu-latest` and `macOS-latest`. `rmdir`
 * takes the junction but rejects the symlink with `ENOTDIR`, which would throw in `afterAll` and
 * fail the suite on two of the three platforms in `.github/workflows/main.yml`. `unlink` takes both,
 * and leaves the target directory in place either way.
 */
function removeLink(link: string): void {
  unlinkSync(link);
}

test('runs before Vite and ignores virtual, dependency, non-source, and unmarked modules', async () => {
  const plugin = loxerTrace();

  expect(plugin.name).toBe('vite-plugin-loxer-trace');
  expect(plugin.enforce).toBe('pre');
  await expect(
    runTransform(plugin, "import { trace } from 'loxer/trace';", '\0virtual:trace')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, "import { trace } from 'loxer/trace';", '/repo/node_modules/a.ts')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, "import { trace } from 'loxer/trace';", '/repo/file.css')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, 'export const plain = true;', '/repo/file.ts')
  ).resolves.toBeNull();
});

test('strips query IDs, parses TSX, and returns Babel source maps', async () => {
  const plugin = loxerTrace();
  const source =
    "import { trace } from 'loxer/trace'; const View = () => <div />; function value(): number { return 1; } trace(value);";

  const result = await runTransform(plugin, source, '/repo/component.tsx?import');
  expect(result).not.toBeNull();
  expect(result?.code).toContain('__startTrace');
  expect(result?.code).toContain('<div />');
  expect(result?.map?.sources).toEqual(['component.tsx']);
});

test('supports JSX and custom include/exclude filters through the canonical transform', async () => {
  const plugin = loxerTrace({ include: /included\.jsx$/, exclude: /skip/ });
  const source =
    "import { trace } from 'loxer/trace'; function view() { return <section />; } trace(view);";

  await expect(runTransform(plugin, source, '/repo/skip/included.jsx')).resolves.toBeNull();
  await expect(runTransform(plugin, source, '/repo/other.ts')).resolves.toBeNull();
  const result = await runTransform(plugin, source, '/repo/included.jsx');
  expect(result?.code).toContain('__startTrace');
  expect(result?.map?.sources).toEqual(['included.jsx']);
});

test('passes the module id on as the filename, so a traced function reports that file as its parent', async () => {
  const plugin = loxerTrace();
  const source =
    "import { trace } from 'loxer/trace'; " +
    "function value() { trace({ openMessage: 'parent.functionName' }); return 1; }";

  const result = await runTransform(plugin, source, '/repo/orders/orderService.ts?import');

  // the parent reaches the runtime as `__startTrace`'s trailing argument; the query ID is stripped
  // and the directories dropped before it gets there, so a Vite build renders `orderService.value()`
  expect(result?.code).toContain('_startTrace("value", [...arguments], {');
  expect(result?.code).toContain('}, "orderService")');
});

test('transforms a target-list marker through the canonical transform', async () => {
  const plugin = loxerTrace();
  const source =
    "import { trace } from 'loxer/trace'; function first() { return 1; } function second() { return 2; } trace([first, second]);";

  const result = await runTransform(plugin, source, '/repo/list.ts');
  expect(result?.code).not.toContain('trace([first, second])');
  expect(result?.code).toContain('__startTrace');
  expect(result?.code?.match(/_startTrace\d*\(/g)).toHaveLength(2);
});

test('global and sticky filter expressions are reusable across multiple Vite modules', async () => {
  const source =
    "import { trace } from 'loxer/trace'; function value() { return 1; } trace(value);";
  const plugin = loxerTrace({ include: /.*included\.ts$/gy, exclude: /.*skip.*/gy });

  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
});

test('contributes both entry points and the dedupe entry to a config that sets neither', async () => {
  const plugin = loxerTrace();

  const fromEmpty = await runConfig(plugin, { root: installedRoot });
  expect(fromEmpty?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(fromEmpty?.resolve?.dedupe).toEqual(['loxer']);
  // an installed Loxer is served out of the pre-bundle, so it needs nothing allowed
  expect(fromEmpty?.server).toBeUndefined();

  // present-but-empty sections are the same situation as absent ones
  const fromEmptySections = await runConfig(plugin, {
    optimizeDeps: {},
    resolve: {},
    root: installedRoot,
  });
  expect(fromEmptySections?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(fromEmptySections?.resolve?.dedupe).toEqual(['loxer']);
});

// Pre-bundling a linked Loxer freezes the build that was current when Vite wrote the cache: the
// dependency hash is the lockfile plus the resolved config, so a rebuilt working copy never
// invalidates it, and the page keeps running yesterday's Loxer until someone deletes
// `node_modules/.vite` by hand. Leaving it out of the optimizer is what makes a rebuild visible.
test('leaves a linked Loxer out of the optimizer and allows the directory it is served from', async () => {
  const plugin = loxerTrace();

  const result = await runConfig(plugin, { root: linkedRoot });

  expect(result?.optimizeDeps).toBeUndefined();
  expect(result?.resolve?.dedupe).toEqual(['loxer']);
  const allow = result?.server?.fs?.allow ?? [];
  // Vite defaults this list to the workspace root only while nobody sets it, and a contributed
  // entry replaces that default - so the app's own source has to stay servable through an ancestor
  // entry, or the whole project stops loading
  expect(allow).toHaveLength(2);
  expect(allow[1]).toBe(linkedPackage);
  expect(linkedRoot.startsWith(String(allow[0]))).toBe(true);
});

test('contributes only the missing entry to a project that draws its own fs.allow boundary', async () => {
  const plugin = loxerTrace();
  const userConfig = { root: linkedRoot, server: { fs: { allow: [linkedRoot] } } };

  const result = await runConfig(plugin, userConfig);

  // the user's list is already in force, so Vite's default is not at stake and re-adding the
  // workspace root would widen a boundary they drew deliberately
  expect(result?.server?.fs?.allow).toEqual([linkedPackage]);
  expect(userConfig.server.fs.allow).toEqual([linkedRoot]);
});

// A project inside Loxer's own repository resolves the linked package and the workspace root to the
// same directory, so the two entries the hook wants to contribute are one entry twice. Vite
// concatenates what the hook returns onto the user's array, so a duplicate would survive into the
// resolved config - `missingFrom` has to reject a repeat inside its own `wanted` list, not just one
// the user already listed.
test('contributes one entry where the linked Loxer is itself the workspace root', async () => {
  const plugin = loxerTrace();

  // the premise, asserted rather than assumed: if the fixture ever stopped resolving both to the
  // same directory, the duplicate would not form and the test below would pass without testing it
  expect(searchForWorkspaceRoot(selfHostedApp)).toBe(selfHostedPackage);

  const result = await runConfig(plugin, { root: selfHostedApp });

  expect(result?.optimizeDeps).toBeUndefined();
  expect(result?.server?.fs?.allow).toEqual([selfHostedPackage]);
});

test('keeps every default in place for a project it cannot resolve Loxer from', async () => {
  const plugin = loxerTrace();

  // `fixtureBase` has no `node_modules` at all - the plugin cannot tell installed from linked, so
  // it contributes what an ordinary install needs rather than reshaping a project it cannot read
  const result = await runConfig(plugin, { root: fixtureBase });

  expect(result?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(result?.server).toBeUndefined();
});

test.each([
  ['a pnpm virtual store path', '/app/node_modules/.pnpm/loxer@3.0.0/node_modules/loxer', true],
  ['a hoisted monorepo install', '/repo/node_modules/loxer', true],
  ['a nested install', '/app/node_modules/parent/node_modules/loxer', true],
  ['a Windows install', 'C:\\app\\node_modules\\loxer', true],
  ['a linked working copy', 'C:\\dev\\loxer', false],
  ['a workspace sibling', '/repo/packages/loxer', false],
])('isInstalledPackagePath reads %s', (_label, directory, expected) => {
  // the discriminator has to hold for every package manager, including pnpm - where an installed
  // package is itself a symlink, so "is a symlink" would report every dependency as linked
  expect(isInstalledPackagePath(directory)).toBe(expected);
});

test('contributes only the optimizeDeps entry the user is missing, without touching the user config', async () => {
  const plugin = loxerTrace();
  const userConfig = { optimizeDeps: { include: ['react', 'loxer'] }, root: installedRoot };

  const result = await runConfig(plugin, userConfig);

  // The hook returns a *partial* config that Vite concatenates onto the user's arrays — so
  // `react` and `loxer` survive by not being mentioned here. Repeating `loxer` would merge to a
  // duplicate entry, and repeating `react` is not the plugin's business at all.
  expect(result?.optimizeDeps?.include).toEqual(['loxer/trace']);
  expect(result?.resolve?.dedupe).toEqual(['loxer']);
  // the user's own array is read, never mutated in place
  expect(userConfig.optimizeDeps.include).toEqual(['react', 'loxer']);
});

test('contributes only the resolve.dedupe entry the user is missing, without touching the user config', async () => {
  const plugin = loxerTrace();
  const userConfig = { resolve: { dedupe: ['react-dom', 'loxer'] }, root: installedRoot };

  const result = await runConfig(plugin, userConfig);

  // `loxer` is already deduped by the user, so there is nothing left to contribute and the whole
  // `resolve` key stays out of the returned partial config.
  expect(Object.keys(result ?? {})).toEqual(['optimizeDeps']);
  expect(result?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(userConfig.resolve.dedupe).toEqual(['react-dom', 'loxer']);
});

test('omits the optimizeDeps key when the user already pre-bundles both entry points', async () => {
  const plugin = loxerTrace();

  const result = await runConfig(plugin, {
    optimizeDeps: { include: ['loxer', 'loxer/trace'] },
    root: installedRoot,
  });

  expect(Object.keys(result ?? {})).toEqual(['resolve']);
  expect(result?.resolve?.dedupe).toEqual(['loxer']);
});

test('contributes nothing at all when the user already lists every entry', async () => {
  const plugin = loxerTrace();

  const result = await runConfig(plugin, {
    optimizeDeps: { include: ['loxer', 'loxer/trace'] },
    resolve: { dedupe: ['loxer'] },
    root: installedRoot,
  });

  // null, not an empty object: the hook declines to contribute rather than merging a no-op
  expect(result).toBeNull();
});

test('respects the dedupe opt-out and leaves the transform untouched', async () => {
  const plugin = loxerTrace({ dedupe: false });
  const source =
    "import { trace } from 'loxer/trace'; function value() { return 1; } trace(value);";

  expect(await runConfig(plugin, {})).toBeNull();
  expect(await runConfig(plugin, { optimizeDeps: { include: ['react'] } })).toBeNull();
  // opting out of the config contribution is not opting out of tracing
  const result = await runTransform(plugin, source, '/repo/file.ts');
  expect(result?.code).toContain('__startTrace');
  await expect(
    runTransform(plugin, 'export const plain = true;', '/repo/file.ts')
  ).resolves.toBeNull();
});

interface TraceTransformResult {
  code?: string;
  map?: { sources?: string[] };
}

async function runTransform(
  plugin: ReturnType<typeof loxerTrace>,
  code: string,
  id: string
): Promise<TraceTransformResult | null> {
  if (typeof plugin.transform !== 'function') {
    throw new Error('Expected the Vite plugin to provide a transform hook.');
  }

  const result = await plugin.transform.call(undefined as never, code, id);

  return typeof result === 'string' ? { code: result } : (result as TraceTransformResult | null);
}

async function runConfig(
  plugin: ReturnType<typeof loxerTrace>,
  userConfig: UserConfig,
  env: ConfigEnv = { command: 'serve', mode: 'development' }
): Promise<Omit<UserConfig, 'plugins'> | null> {
  // Vite accepts either a bare function or `{ handler }` for every hook, so call whichever shape
  // the plugin declares.
  const hook = plugin.config;
  const handler = typeof hook === 'object' ? hook.handler : hook;
  if (typeof handler !== 'function') {
    throw new Error('Expected the Vite plugin to provide a config hook.');
  }

  const result = await handler.call(undefined as never, userConfig, env);

  return result ?? null;
}
