import type { ConfigEnv, UserConfig } from 'vite';
import loxerTrace from '../packages/vite-plugin-loxer-trace/src/index';

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
    "import { trace } from 'loxer/trace'; const View = () => <div />; function value(): number { return 1; } trace.info(value);";

  const result = await runTransform(plugin, source, '/repo/component.tsx?import');
  expect(result).not.toBeNull();
  expect(result?.code).toContain('__startTrace');
  expect(result?.code).toContain('<div />');
  expect(result?.map?.sources).toEqual(['component.tsx']);
});

test('supports JSX and custom include/exclude filters through the canonical transform', async () => {
  const plugin = loxerTrace({ include: /included\.jsx$/, exclude: /skip/ });
  const source =
    "import { trace } from 'loxer/trace'; function view() { return <section />; } trace.info(view);";

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
    "function value() { trace.info({ openMessage: 'parent.fn' }); return 1; }";

  const result = await runTransform(plugin, source, '/repo/orders/orderService.ts?import');

  // the parent reaches the runtime as `__startTrace`'s trailing argument; the query ID is stripped
  // and the directories dropped before it gets there, so a Vite build renders `orderService.value()`
  expect(result?.code).toContain('_startTrace("value", [...arguments], {');
  expect(result?.code).toContain('}, "orderService")');
});

test('transforms a point marker through the canonical Vite path', async () => {
  const plugin = loxerTrace();
  const source =
    "import { trace } from 'loxer/trace'; function save(order) { trace.point.ORDER.pp().warn('parent.fn', 'retrying', order); }";

  const result = await runTransform(plugin, source, '/repo/orders/orderService.ts');

  expect(result?.code).toContain('__tracePoint');
  expect(result?.code).not.toContain('trace.point.ORDER');
  expect(result?.code).toContain('orderService');
});

test('transforms a static-bracket module target-list marker through the canonical transform', async () => {
  const plugin = loxerTrace();
  const source =
    "import { trace } from 'loxer/trace'; function first() { return 1; } function second() { return 2; } trace['TRACE'].props('argsResult').pp('result').warn([first, second]);";

  const result = await runTransform(plugin, source, '/repo/list.ts');
  expect(result?.code).not.toContain(".warn([first, second])");
  expect(result?.code).not.toContain("trace['TRACE']");
  expect(result?.code).toContain('__startTrace');
  expect(result?.code?.match(/_startTrace\d*\(/g)).toHaveLength(2);
});

test('global and sticky filter expressions are reusable across multiple Vite modules', async () => {
  const source =
    "import { trace } from 'loxer/trace'; function value() { return 1; } trace.info(value);";
  const plugin = loxerTrace({ include: /.*included\.ts$/gy, exclude: /.*skip.*/gy });

  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
});

test('contributes both entry points and the dedupe entry to a config that sets neither', async () => {
  const plugin = loxerTrace();

  const fromEmpty = await runConfig(plugin, {});
  expect(fromEmpty?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(fromEmpty?.resolve?.dedupe).toEqual(['loxer']);

  // present-but-empty sections are the same situation as absent ones
  const fromEmptySections = await runConfig(plugin, { optimizeDeps: {}, resolve: {} });
  expect(fromEmptySections?.optimizeDeps?.include).toEqual(['loxer', 'loxer/trace']);
  expect(fromEmptySections?.resolve?.dedupe).toEqual(['loxer']);
});

test('contributes only the optimizeDeps entry the user is missing, without touching the user config', async () => {
  const plugin = loxerTrace();
  const userConfig = { optimizeDeps: { include: ['react', 'loxer'] } };

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
  const userConfig = { resolve: { dedupe: ['react-dom', 'loxer'] } };

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
  });

  expect(Object.keys(result ?? {})).toEqual(['resolve']);
  expect(result?.resolve?.dedupe).toEqual(['loxer']);
});

test('contributes nothing at all when the user already lists every entry', async () => {
  const plugin = loxerTrace();

  const result = await runConfig(plugin, {
    optimizeDeps: { include: ['loxer', 'loxer/trace'] },
    resolve: { dedupe: ['loxer'] },
  });

  // null, not an empty object: the hook declines to contribute rather than merging a no-op
  expect(result).toBeNull();
});

test('respects the dedupe opt-out and leaves the transform untouched', async () => {
  const plugin = loxerTrace({ dedupe: false });
  const source =
    "import { trace } from 'loxer/trace'; function value() { return 1; } trace.info(value);";

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
