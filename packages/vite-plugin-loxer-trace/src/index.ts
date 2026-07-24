import { transformLoxerTrace } from 'babel-plugin-loxer-trace';
import type { Plugin } from 'vite';

export interface LoxerTraceViteOptions {
  include?: RegExp;
  exclude?: RegExp;
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /(?:^|[/\\])node_modules(?:[/\\]|$)/;

export default function loxerTrace(options: LoxerTraceViteOptions = {}): Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  return {
    name: 'vite-plugin-loxer-trace',
    enforce: 'pre',
    async transform(code, id) {
      const cleanId = id.split('?', 1)[0];
      if (
        id.startsWith('\0') ||
        testPattern(exclude, cleanId) ||
        !testPattern(include, cleanId) ||
        !code.includes('loxer/trace')
      ) {
        return null;
      }

      const isTypeScript = /\.[cm]?tsx?$/.test(cleanId);
      const isJsx = /\.[cm]?[jt]sx$/.test(cleanId);
      const parserPlugins = [...(isTypeScript ? ['typescript'] : []), ...(isJsx ? ['jsx'] : [])];
      const result = await transformLoxerTrace(code, {
        filename: cleanId,
        parserPlugins,
        sourceMaps: true,
      });

      if (!result?.code) {
        return null;
      }

      return {
        code: result.code,
        map: result.map as any,
      };
    },
  };
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  try {
    return pattern.test(value);
  } finally {
    pattern.lastIndex = 0;
  }
}
