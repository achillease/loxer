import loxerTrace from '../packages/vite-plugin-loxer-trace/src/index';

test('runs before Vite and ignores virtual, dependency, non-source, and unmarked modules', async () => {
  const plugin = loxerTrace();

  expect(plugin.name).toBe('vite-plugin-loxer-trace');
  expect(plugin.enforce).toBe('pre');
  await expect(
    runTransform(plugin, "import { loxed } from 'loxer/trace';", '\0virtual:trace')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, "import { loxed } from 'loxer/trace';", '/repo/node_modules/a.ts')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, "import { loxed } from 'loxer/trace';", '/repo/file.css')
  ).resolves.toBeNull();
  await expect(
    runTransform(plugin, 'export const plain = true;', '/repo/file.ts')
  ).resolves.toBeNull();
});

test('strips query IDs, parses TSX, and returns Babel source maps', async () => {
  const plugin = loxerTrace();
  const source =
    "import { loxed } from 'loxer/trace'; const View = () => <div />; function value(): number { return 1; } loxed(value);";

  const result = await runTransform(plugin, source, '/repo/component.tsx?import');
  expect(result).not.toBeNull();
  expect(result?.code).toContain('__startLoxedTrace');
  expect(result?.code).toContain('<div />');
  expect(result?.map?.sources).toEqual(['component.tsx']);
});

test('supports JSX and custom include/exclude filters through the canonical transform', async () => {
  const plugin = loxerTrace({ include: /included\.jsx$/, exclude: /skip/ });
  const source =
    "import { loxed } from 'loxer/trace'; function view() { return <section />; } loxed(view);";

  await expect(runTransform(plugin, source, '/repo/skip/included.jsx')).resolves.toBeNull();
  await expect(runTransform(plugin, source, '/repo/other.ts')).resolves.toBeNull();
  const result = await runTransform(plugin, source, '/repo/included.jsx');
  expect(result?.code).toContain('__startLoxedTrace');
  expect(result?.map?.sources).toEqual(['included.jsx']);
});

test('global and sticky filter expressions are reusable across multiple Vite modules', async () => {
  const source =
    "import { loxed } from 'loxer/trace'; function value() { return 1; } loxed(value);";
  const plugin = loxerTrace({ include: /.*included\.ts$/gy, exclude: /.*skip.*/gy });

  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/included.ts')).resolves.not.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
  await expect(runTransform(plugin, source, '/repo/skip/included.ts')).resolves.toBeNull();
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
