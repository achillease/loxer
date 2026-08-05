import { outputFromCallbacks } from './output-capture';
import { Loxer, resetLoxer } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';
import {
  __observeTraceResult,
  __setTraceFunctionLength,
  __startTrace,
  __withTraceFunctionLength,
  trace,
} from '../src/trace';
import { transformLoxerTrace } from '../packages/babel-plugin-loxer-trace/src/transform';
import type { TransformLoxerTraceOptions } from '../packages/babel-plugin-loxer-trace/src/types';

export {
  Loxer,
  resetLoxer,
  trace,
  __observeTraceResult,
  __setTraceFunctionLength,
  __startTrace,
  __withTraceFunctionLength,
};

export let devLogs: OutputLox[] = [];
export let devErrors: ErrorLox[] = [];
let moduleCount = 0;

const traceRuntimeUrl = asDataModule(
  'export const trace = (...args) => globalThis.__loxerTraceMarker(...args);' +
    'export const __startTrace = (...args) => globalThis.__loxerStartTrace(...args);' +
    'export const __observeTraceResult = (...args) => globalThis.__loxerObserveTraceResult(...args);' +
    'export const __setTraceFunctionLength = (...args) => globalThis.__loxerSetFunctionLength(...args);' +
    'export const __withTraceFunctionLength = (...args) => globalThis.__loxerWithFunctionLength(...args);'
);
const loxerRuntimeUrl = asDataModule(
  'export const Loxer = new Proxy({}, { get: (_target, property) => {' +
    'const target = globalThis.__loxerTraceLoxer;' +
    'const value = target[property];' +
    'if (typeof value !== "function") return value;' +
    'const bound = value.bind(target);' +
    'Object.assign(bound, value);' +
    'return bound;' +
    '} });'
);

beforeEach(() => {
  (globalThis as any).__loxerTraceMarker = trace;
  (globalThis as any).__loxerObserveTraceResult = __observeTraceResult;
  (globalThis as any).__loxerSetFunctionLength = __setTraceFunctionLength;
  (globalThis as any).__loxerWithFunctionLength = __withTraceFunctionLength;
  (globalThis as any).__loxerStartTrace = __startTrace;
  (globalThis as any).__loxerTraceLoxer = Loxer;
  Loxer.init({
    dev: true,
    output: outputFromCallbacks({
      devError(error) {
        devErrors.push(error);
      },
      devLog(log) {
        devLogs.push(log);
      },
    }),
    defaultLevels: { devLevel: 'info', prodLevel: 'error' },
    modules: {
      TRACE: { color: '#00ff99', devLevel: 'info', prodLevel: 'error', fullName: 'Trace' },
      ORDER: { color: '#ffcc00', devLevel: 'info', prodLevel: 'error', fullName: 'Order' },
    },
  });
  resetTraceLogs();
});

afterEach(() => {
  resetTraceLogs();
  delete (globalThis as any).__loxerTraceMarker;
  delete (globalThis as any).__loxerObserveTraceResult;
  delete (globalThis as any).__loxerSetFunctionLength;
  delete (globalThis as any).__loxerWithTraceFunctionLength;
  delete (globalThis as any).__loxerStartTrace;
  delete (globalThis as any).__loxerTraceLoxer;
  resetLoxer();
});

export function resetTraceLogs(): void {
  devLogs = [];
  devErrors = [];
}

export function imports(): string {
  return `import { trace } from '${traceRuntimeUrl}'; import { Loxer } from '${loxerRuntimeUrl}';`;
}

// traced modules are transformed under a filename, the way a real build transforms them, so the
// file half of `parent.functionName` is exercised; a suite that needs the no-filename case
// overrides it with `filename: undefined`
export function transformOptions(): TransformLoxerTraceOptions {
  return {
    filename: 'src/orders/orderService.ts',
    loxerImport: loxerRuntimeUrl,
    sourceMaps: false,
    traceImport: traceRuntimeUrl,
  };
}

export async function loadTracedModule(
  body: string,
  overrides: Partial<TransformLoxerTraceOptions> = {}
): Promise<any> {
  const result = await transformLoxerTrace(`${imports()}${body}`, {
    ...transformOptions(),
    ...overrides,
  });
  if (!result?.code) {
    throw new Error('Expected Babel to emit transformed code.');
  }
  return import(`${asDataModule(result.code)}#${moduleCount++}`);
}

export { transformLoxerTrace };

function asDataModule(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
