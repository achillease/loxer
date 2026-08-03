import { transformLoxerTrace } from 'babel-plugin-loxer-trace';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { searchForWorkspaceRoot, type Plugin } from 'vite';

export interface LoxerTraceViteOptions {
  include?: RegExp;
  exclude?: RegExp;
  /** Whether the plugin contributes the Vite config that keeps the page on **one** copy of Loxer.
   *
   * Loxer's instance is realm-scoped, so a second copy is harmless — but pre-bundling both entry
   * points together also stops the dependency re-optimization (and the page reload it triggers)
   * that a first `loxer/trace` import mid-session would cause. A Loxer the project links rather
   * than installs is contributed for instead: it stays out of the optimizer, and the directory it
   * lives in joins `server.fs.allow` so Vite can serve it. Set `false` to own `optimizeDeps`,
   * `resolve.dedupe` and `server.fs.allow` yourself.
   *
   * `server.fs.allow` decides which files the **dev server** will serve to a browser, so this option
   * widens that boundary: the directory added is wherever Loxer resolves to, which for a linked
   * package is outside the project — a sibling checkout, a `pnpm link` target. It is added even to a
   * list the project set itself, which is a boundary somebody drew deliberately. Nothing reads the
   * list outside `vite dev`, so `vite build` and `vite preview` are unaffected. Set `false` to keep
   * the boundary entirely your own.
   *
   * The entry is added silently: nothing is logged, and it appears in neither your `vite.config` nor
   * anything else you can read without resolving the config — `vite --debug` or a `resolveConfig()`
   * call is where to see what the dev server ended up with.
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
      const root = path.resolve(userConfig.root ?? process.cwd());
      const linkedDirectory = linkedLoxerDirectory(root);
      // Vite concatenates arrays when it merges this into the user's config, so contribute only
      // what is missing: the user's own entries are never clobbered and never duplicated.
      const optimizeInclude = linkedDirectory
        ? []
        : missingFrom(userConfig.optimizeDeps?.include, LOXER_ENTRIES);
      const resolveDedupe = missingFrom(userConfig.resolve?.dedupe, ['loxer']);
      const fsAllow = missingFrom(
        userConfig.server?.fs?.allow,
        wantedFsAllow(root, linkedDirectory, userConfig.server?.fs?.allow)
      );
      if (optimizeInclude.length === 0 && resolveDedupe.length === 0 && fsAllow.length === 0) {
        return null;
      }

      return {
        ...(optimizeInclude.length > 0 ? { optimizeDeps: { include: optimizeInclude } } : {}),
        ...(resolveDedupe.length > 0 ? { resolve: { dedupe: resolveDedupe } } : {}),
        ...(fsAllow.length > 0 ? { server: { fs: { allow: fsAllow } } } : {}),
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

/**
 * Returns the directory of a Loxer the project links rather than installs, if that is what it has.
 *
 * A linked Loxer is source the project edits, not a dependency: Vite leaves it out of the optimizer
 * on purpose, because a pre-bundle of it would never notice a rebuild — the dependency hash reads
 * the lockfile and the resolved config, and neither says anything about a linked package's files.
 * Pre-bundling it anyway (which listing it in `optimizeDeps.include` does) freezes whatever build
 * was current when the cache was written, until someone deletes `node_modules/.vite` by hand.
 *
 * Every package manager installs into a `node_modules` directory, and none of them puts a working
 * copy inside one, so the resolved real path is what tells the two apart — including under pnpm,
 * where an installed package is itself a symlink into the virtual store.
 */
function linkedLoxerDirectory(root: string): string | undefined {
  try {
    // the base only has to sit in the project; Node never reads it
    const resolve = createRequire(path.join(root, 'noop.js')).resolve;
    const directory = path.dirname(realpathSync(resolve('loxer/package.json')));

    return isInstalledPackagePath(directory) ? undefined : directory;
  } catch {
    // a project this plugin cannot resolve Loxer from keeps every Vite default it already had
    return undefined;
  }
}

/** Returns whether a package's real path is one a package manager installed. */
export function isInstalledPackagePath(directory: string): boolean {
  return directory.split(/[\\/]+/).includes('node_modules');
}

/**
 * Returns the `server.fs.allow` entries a linked Loxer needs Vite to serve it from.
 *
 * Vite defaults this list to the workspace root **only while nobody sets it** — a contributed entry
 * replaces that default rather than extending it. So a project that sets none gets the workspace
 * root back alongside the linked directory, and a project that sets its own list gets the one entry
 * it is missing, leaving the boundary it drew intact.
 */
function wantedFsAllow(
  root: string,
  linkedDirectory: string | undefined,
  userAllow: readonly string[] | undefined
): string[] {
  if (!linkedDirectory) {
    return [];
  }

  return userAllow === undefined
    ? [searchForWorkspaceRoot(root), linkedDirectory]
    : [linkedDirectory];
}

/** the entries of `wanted` that `existing` does not already list, each contributed once */
function missingFrom(existing: readonly string[] | undefined, wanted: string[]): string[] {
  const present = new Set(existing ?? []);

  // `wanted` repeats itself where a linked Loxer *is* the workspace root, which is every project
  // inside Loxer's own repository
  return wanted.filter((entry) => {
    if (present.has(entry)) {
      return false;
    }
    present.add(entry);

    return true;
  });
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  try {
    return pattern.test(value);
  } finally {
    pattern.lastIndex = 0;
  }
}
