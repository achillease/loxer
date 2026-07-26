import { fileURLToPath } from 'node:url';
import { build as buildVite8 } from 'vite';
import { build as buildVite5 } from 'vite5';
import loxerTrace from '../packages/vite-plugin-loxer-trace/src/index';

const fixtureRoot = fileURLToPath(new URL('./fixtures/vite-app/', import.meta.url));
type BuildRunner = (config: unknown) => Promise<unknown>;

test.each([
  ['Vite 5', buildVite5 as unknown as BuildRunner],
  ['Vite 8', buildVite8 as unknown as BuildRunner],
])('%s runs the tracing transform through its real plugin container', async (_name, build) => {
  const result = await build({
    build: {
      minify: false,
      write: false,
    },
    cacheDir: fileURLToPath(
      new URL(
        `./fixtures/.vite-cache-${_name.replace(/\s+/g, '-').toLowerCase()}/`,
        import.meta.url
      )
    ),
    configFile: false,
    logLevel: 'silent',
    plugins: [loxerTrace()],
    root: fixtureRoot,
  });

  expect(emittedJavaScript(result)).toContain('__startTrace');
});

function emittedJavaScript(result: unknown): string {
  const buildResults = Array.isArray(result) ? result : [result];
  const chunks: string[] = [];

  for (const buildResult of buildResults) {
    if (
      typeof buildResult !== 'object' ||
      buildResult === null ||
      !('output' in buildResult) ||
      !Array.isArray(buildResult.output)
    ) {
      continue;
    }

    for (const output of buildResult.output) {
      if (
        typeof output === 'object' &&
        output !== null &&
        'code' in output &&
        typeof output.code === 'string'
      ) {
        chunks.push(output.code);
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error('Expected Vite to return at least one emitted JavaScript chunk.');
  }

  return chunks.join('\n');
}
