import { transformAsync, type FileResult } from '@babel/core';
import loxerTracePlugin from './plugin.js';
import type { TransformLoxerTraceOptions } from './types.js';

/**
 * Transforms one module string with the tracing plugin without reading a Babel configuration.
 *
 * Callers supply parser plugins for syntax such as TypeScript or JSX; the Vite adapter derives
 * them from the source filename before calling this helper.
 */
export async function transformLoxerTrace(
  code: string,
  options: TransformLoxerTraceOptions = {}
): Promise<FileResult | null> {
  const { filename, traceImport, loxerImport, parserPlugins = [], sourceMaps = true } = options;

  return transformAsync(code, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename,
    parserOpts: {
      plugins: parserPlugins as any,
    },
    plugins: [[loxerTracePlugin, { traceImport, loxerImport }]],
    sourceMaps,
    sourceType: 'module',
  });
}
