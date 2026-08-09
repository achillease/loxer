import { outputFromCallbacks } from './output-capture';
import babel7 from 'babel7';
import { Loxer, resetLoxer } from '../src';
import { __observeTraceResult, __setTraceFunctionLength, __startTrace, trace } from '../src/trace';
import loxerTracePlugin from '../packages/babel-plugin-loxer-trace/src/plugin';

/*
 * This suite is intentionally a compatibility subset, not parity with
 * plain-function-trace.test.ts. The exhaustive behavior contract stays there;
 * these cases prove that Babel 7 executes the same plugin at key API boundaries.
 */

let babelApiVersion: string | undefined;
let moduleCount = 0;

const traceRuntimeUrl = asDataModule(
  'export const trace = (...args) => globalThis.__babel7TraceMarker(...args);' +
    'export const __startTrace = (...args) => globalThis.__babel7StartTrace(...args);' +
    'export const __observeTraceResult = (...args) => globalThis.__babel7ObserveTraceResult(...args);' +
    'export const __setTraceFunctionLength = (...args) => globalThis.__babel7SetFunctionLength(...args);'
);

beforeEach(() => {
  babelApiVersion = undefined;
  (globalThis as any).__babel7TraceMarker = trace;
  (globalThis as any).__babel7ObserveTraceResult = __observeTraceResult;
  (globalThis as any).__babel7SetFunctionLength = __setTraceFunctionLength;
  (globalThis as any).__babel7StartTrace = __startTrace;
  Loxer.init({
    dev: true,
    output: outputFromCallbacks({
      devError() {},
      devLog() {},
    }),
  });
});

afterEach(() => {
  delete (globalThis as any).__babel7TraceMarker;
  delete (globalThis as any).__babel7ObserveTraceResult;
  delete (globalThis as any).__babel7SetFunctionLength;
  delete (globalThis as any).__babel7StartTrace;
  resetLoxer();
});

test('Babel 7 accepts the plugin and replaces the marker with injected runtime helpers', async () => {
  const result = await transformWithBabel7(`
    import { trace } from '${traceRuntimeUrl}';
    function value() { return 1; }
    trace.info(value);
    export { value };
  `);

  expect(babelApiVersion).toMatch(/^7\./);
  expect(result).not.toContain('trace.info(value)');
  expect(result).toContain('__startTrace');
  expect(result).toContain('__observeTraceResult');
  expect(result).toContain('__setTraceFunctionLength');
});

test('Babel 7 output preserves this, arguments, length, and named recursion', async () => {
  const transformed = await loadBabel7Module(`
    function inspect(first, second) {
      return [this.factor, arguments.length, first + second];
    }
    trace.info(inspect);

    function factorial(value) {
      return value <= 1 ? 1 : value * factorial(value - 1);
    }
    trace.info(factorial);

    export { factorial, inspect };
  `);

  expect(transformed.inspect.length).toBe(2);
  expect(transformed.inspect.call({ factor: 4 }, 2, 3)).toEqual([4, 2, 5]);
  expect(transformed.factorial(5)).toBe(120);
});

test('Babel 7 output preserves a returned native Promise identity', async () => {
  const transformed = await loadBabel7Module(`
    let resolvePending;
    const original = new Promise((resolve) => { resolvePending = resolve; });
    function pending() { return original; }
    trace.info(pending);
    export { original, pending, resolvePending };
  `);

  const returned = transformed.pending();
  expect(returned).toBe(transformed.original);
  transformed.resolvePending('finished');
  await expect(returned).resolves.toBe('finished');
});

test('Babel 7 traces a direct-module target list from one shared options assignment', async () => {
  const transformed = await loadBabel7Module(`
    function first(value) { return 'first:' + value; }
    const second = (value) => 'second:' + value;
    trace.TRACE.h().props('argsResult').pp('args').warn([first, second]);
    export { first, second };
  `);

  expect(transformed.first('a')).toBe('first:a');
  expect(transformed.second('b')).toBe('second:b');
  expect(transformed.second.length).toBe(1);
});

test('Babel 7 reports plugin validation failures with a source code frame', async () => {
  const source = `
    import { trace } from '${traceRuntimeUrl}';
    function value() { return 1; }
    const invalid = trace.info(value);
  `;

  let diagnostic = '';
  try {
    await transformWithBabel7(source);
  } catch (error) {
    diagnostic = stripAnsi(error instanceof Error ? error.message : String(error));
  }

  expect(diagnostic).toContain(
    'trace() must be a standalone statement beside its named function binding.'
  );
  expect(diagnostic).toContain('> 4 |     const invalid = trace.info(value);');
  expect(diagnostic).toMatch(/\|\s+\^{5,}/);
});

async function transformWithBabel7(source: string): Promise<string> {
  const result = await babel7.transformAsync(source, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    plugins: [
      [
        (api: { version: string }, options: unknown) => {
          babelApiVersion = api.version;
          return loxerTracePlugin(api, options as never);
        },
        { traceImport: traceRuntimeUrl },
      ],
    ],
    sourceType: 'module',
  });

  if (!result?.code) {
    throw new Error('Expected Babel 7 to emit transformed code.');
  }

  return result.code;
}

async function loadBabel7Module(body: string): Promise<any> {
  const code = await transformWithBabel7(`import { trace } from '${traceRuntimeUrl}';${body}`);

  return import(`${asDataModule(code)}#babel7-${moduleCount++}`);
}

function asDataModule(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}
