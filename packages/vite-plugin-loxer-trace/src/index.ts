import { transformLoxerTrace } from 'babel-plugin-loxer-trace';
import type { Plugin } from 'vite';

export interface LoxerTraceViteOptions {
  include?: RegExp;
  exclude?: RegExp;
  /** Whether the plugin contributes the Vite config that keeps the page on **one** copy of Loxer.
   *
   * Loxer's instance is realm-scoped, so a second copy is harmless — but pre-bundling both entry
   * points together also stops the dependency re-optimization (and the page reload it triggers)
   * that a first `loxer/trace` import mid-session would cause. Set `false` to own
   * `optimizeDeps.include` and `resolve.dedupe` yourself.
   *
   * @default true
   */
  dedupe?: boolean;
}

const DEFAULT_INCLUDE = /\.[cm]?[jt]sx?$/;
const DEFAULT_EXCLUDE = /(?:^|[/\\])node_modules(?:[/\\]|$)/;

/** Both entry points, so they enter the same optimize run instead of `loxer/trace` being
 * discovered later — this plugin injects that import into files the user never edited, which is
 * exactly how the late discovery happens.
 */
const LOXER_ENTRIES = ['loxer', 'loxer/trace'];

export default function loxerTrace(options: LoxerTraceViteOptions = {}): Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const dedupe = options.dedupe ?? true;

  return {
    name: 'vite-plugin-loxer-trace',
    enforce: 'pre',
    config(userConfig) {
      if (!dedupe) {
        return null;
      }
      // Vite concatenates arrays when it merges this into the user's config, so contribute only
      // what is missing: the user's own entries are never clobbered and never duplicated.
      const optimizeInclude = missingFrom(userConfig.optimizeDeps?.include, LOXER_ENTRIES);
      const resolveDedupe = missingFrom(userConfig.resolve?.dedupe, ['loxer']);
      if (optimizeInclude.length === 0 && resolveDedupe.length === 0) {
        return null;
      }

      return {
        ...(optimizeInclude.length > 0 ? { optimizeDeps: { include: optimizeInclude } } : {}),
        ...(resolveDedupe.length > 0 ? { resolve: { dedupe: resolveDedupe } } : {}),
      };
    },
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

/** the entries of `wanted` that `existing` does not already list */
function missingFrom(existing: readonly string[] | undefined, wanted: string[]): string[] {
  const present = new Set(existing ?? []);

  return wanted.filter((entry) => !present.has(entry));
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  try {
    return pattern.test(value);
  } finally {
    pattern.lastIndex = 0;
  }
}
