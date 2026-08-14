import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { vi } from 'vitest';
import { clearRealmSlot, realmSlot } from '../src/core/runtime/Realm';
import type { ErrorLox, OutputLox } from '../src/loxes';

/** What a consumer imports: the emitted `dist/` tree, not `src/`.
 *
 * Every other suite in this repo imports `../src`, so a green run says nothing about the tree an
 * installed package actually executes - `rules/testing.md` requires a change a consumer observes to
 * be exercised against the built output. `pnpm build` writes all three required artifacts. Their
 * absence is therefore a failed consumer gate, not an optional suite.
 */
const distDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const distIndex = resolve(distDirectory, 'index.js');
const distTrace = resolve(distDirectory, 'trace.js');
const builtBabelPlugin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/babel-plugin-loxer-trace/dist/index.js'
);
const builtVitePlugin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/vite-plugin-loxer-trace/dist/index.js'
);
const missingBuiltArtifacts = [distIndex, distTrace, builtBabelPlugin, builtVitePlugin].filter(
  (artifact) => !existsSync(artifact)
);
if (missingBuiltArtifacts.length > 0) {
  throw new Error(`Missing built consumer artifacts:\n${missingBuiltArtifacts.join('\n')}`);
}

type DistIndex = typeof import('../src/index');
type DistTrace = typeof import('../src/trace');
type BuiltBabelPlugin = typeof import('../packages/babel-plugin-loxer-trace/src/index');
type BuiltVitePlugin = typeof import('../packages/vite-plugin-loxer-trace/src/index');
/** the options object `__startTrace` takes, with its optionality stripped */
type TraceOptionsOf = NonNullable<Parameters<DistTrace['__startTrace']>[2]>;

global.console.log = vi.fn();

let devLogs: OutputLox[] = [];
let devErrors: ErrorLox[] = [];
let dist: { index: DistIndex; trace: DistTrace };
let babelPlugin: BuiltBabelPlugin;
let vitePlugin: BuiltVitePlugin;
let transformedModuleId = 0;

/** the module graph under `dist/` shares the realm slot with the `src/` copy this file also imports
 * (`clearRealmSlot` below), which is by design - the slot is keyed on the major version so that two
 * copies in one realm resolve to one instance */
async function loadDist(): Promise<{ index: DistIndex; trace: DistTrace }> {
  const index = (await import(pathToFileURL(distIndex).href)) as DistIndex;
  const trace = (await import(pathToFileURL(distTrace).href)) as DistTrace;

  return { index, trace };
}

async function transformBuiltModule(body: string): Promise<string> {
  const traceUrl = pathToFileURL(distTrace).href;
  const indexUrl = pathToFileURL(distIndex).href;
  const result = await babelPlugin.transformLoxerTrace(
    `import { trace } from '${traceUrl}';import { Loxer } from '${indexUrl}';${body}`,
    {
      filename: 'src/checkout.ts',
      loxerImport: indexUrl,
      sourceMaps: false,
      traceImport: traceUrl,
    }
  );

  if (!result?.code) {
    throw new Error('Expected the built Babel plugin to emit transformed code.');
  }

  return result.code;
}

async function loadBuiltTransformedModule(body: string): Promise<{ code: string; module: any }> {
  const code = await transformBuiltModule(body);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

  return { code, module: await import(`${moduleUrl}#${transformedModuleId++}`) };
}

async function transformWithBuiltVitePlugin(source: string): Promise<string> {
  const plugin = vitePlugin.default();
  if (typeof plugin.transform !== 'function') {
    throw new Error('Expected the built Vite plugin to provide a transform hook.');
  }
  const result = await plugin.transform.call(undefined as never, source, 'src/checkout.ts');
  if (
    typeof result !== 'object' ||
    result === null ||
    !('code' in result) ||
    typeof result.code !== 'string'
  ) {
    throw new Error('Expected the built Vite plugin to emit transformed code.');
  }

  return result.code;
}

/** Colors are chosen at the renderer, not by a config flag: the raw lox always carries the plain
 * message, and `OutputLoxRenderer(...).colored` is what adds the escapes. */
function initDist(index: DistIndex): void {
  index.Loxer.init({
    dev: true,
    output: (event) => {
      if (event.environment !== 'dev') {
        return;
      }
      if (event.kind === 'log') {
        devLogs.push(event.lox);
      } else {
        devErrors.push(event.lox);
      }
    },
    modules: {
      TRACE: { fullName: 'Trace', color: '#00ff99', devLevel: 'debug', prodLevel: 'error' },
    },
  });
  // init writes its own 'Loxer initialized' log; only the traced calls are under test here
  devLogs = [];
  devErrors = [];
}

beforeAll(async () => {
  dist = await loadDist();
  babelPlugin = (await import(pathToFileURL(builtBabelPlugin).href)) as BuiltBabelPlugin;
  vitePlugin = (await import(pathToFileURL(builtVitePlugin).href)) as BuiltVitePlugin;
});

beforeEach(() => {
  // `afterEach` removes the realm anchor, but the dist modules themselves stay cached. Re-anchor
  // their retained singleton before a native data-module import resolves `dist/trace.js`.
  realmSlot('instance', () => dist.index.Loxer);
  initDist(dist.index);
});

afterEach(() => {
  devLogs = [];
  devErrors = [];
  dist.index.resetLoxer();
  // the realm slot lives on `globalThis` and deliberately outlives a module-registry reset, so it is
  // the one piece of state a `resetLoxer()` cannot clear for a second copy
  clearRealmSlot('instance');
});

describe('the built dist/ tree a consumer executes', () => {
  test('every template renders from dist exactly as the spec table specifies', () => {
    const { trace } = dist;

    const rendered = (
      openMessage: NonNullable<TraceOptionsOf['markerOptions']>['openMessage'],
      closeMessage: NonNullable<TraceOptionsOf['markerOptions']>['closeMessage']
    ) => {
      devLogs = [];
      const running = trace.__startTrace(
        'calculate',
        [19.95, 3],
        { markerOptions: { openMessage, closeMessage }, moduleId: 'TRACE' },
        'Checkout'
      );
      running.success({ total: 59.85 });

      return devLogs.map((lox) => lox.message);
    };

    expect(rendered('fn', 'fn')).toEqual(['calculate()', 'calculate done']);
    expect(rendered('parent.fn', 'parent.fn')).toEqual([
      'Checkout.calculate()',
      'Checkout.calculate done',
    ]);
    expect(rendered('fn(types)', 'fn(result)')).toEqual([
      'calculate(number, number)',
      'calculate({"total":59.85}) done',
    ]);
    expect(rendered('fn(args)', 'parent.fn(result)')).toEqual([
      'calculate(19.95, 3)',
      'Checkout.calculate({"total":59.85}) done',
    ]);
    expect(rendered('parent.fn(types)', 'parent.fn')).toEqual([
      'Checkout.calculate(number, number)',
      'Checkout.calculate done',
    ]);
    // the omitted-option defaults
    expect(rendered(undefined, undefined)).toEqual(['Checkout.calculate()', 'calculate done']);
  });

  test('dist colors each span by its kind while the plain message stays escape-free', () => {
    const { index, trace } = dist;

    const running = trace.__startTrace(
      'calculate',
      [19.95],
      { markerOptions: { openMessage: 'parent.fn(args)' }, moduleId: 'TRACE' },
      'Checkout'
    );
    running.success(undefined);

    const [open] = devLogs;
    // the raw lox a destination and the history receive carries no escape at all
    expect(open.message).toBe('Checkout.calculate(19.95)');
    expect(open.message).not.toContain('\x1b');

    const colored = index.OutputLoxRenderer(open, 0).colored.message;
    // parent in fgClass teal, name in fgFunction lime, payload in fgString green - the same three
    // palette entries `test/trace-message-console.test.ts` pins against `src/`
    expect(colored).toContain('\x1b[38;2;78;201;176mCheckout\x1b[0m');
    expect(colored).toContain('\x1b[38;2;144;237;32mcalculate\x1b[0m');
    expect(colored).toContain('\x1b[38;2;18;129;14m19.95\x1b[0m');
  });

  test('dist gives a callback the printers, and keeps text around them uncolored', () => {
    const { index, trace } = dist;

    const running = trace.__startTrace(
      'calculate',
      [3],
      {
        moduleId: 'TRACE',
        markerOptions: {
          openMessage: ({ parentFn }) => `retrying ${parentFn(3)}`,
          closeMessage: ({ fn, result }) => `${fn(result)} ok`,
        },
      },
      'Checkout'
    );
    running.success('done');

    expect(devLogs.map((lox) => lox.message)).toEqual([
      'retrying Checkout.calculate(3)',
      'calculate(done) ok',
    ]);

    const colored = index.OutputLoxRenderer(devLogs[0], 0).colored.message;
    // the callback's own words carry no color of their own
    expect(colored).toContain('retrying \x1b[38;2;78;201;176mCheckout\x1b[0m');
  });

  test.each([
    { name: 'a doubled dollar', content: '$$' },
    { name: 'the whole-match pattern', content: '$&' },
    { name: 'the before-match pattern', content: '$`' },
    { name: 'the after-match pattern', content: "$'" },
    { name: 'a price', content: '$5.00' },
  ])('$name survives the built dist renderer verbatim', ({ content }) => {
    const running = dist.trace.__startTrace(
      'calculate',
      [],
      {
        markerOptions: { openMessage: ({ fn }) => `retrying ${fn(content)}` },
        moduleId: 'TRACE',
      },
      'Checkout'
    );
    running.success(undefined);

    expect(devLogs[0].message).toBe(`retrying calculate(${content})`);
  });

  test('a direct module emitted by the built Babel plugin runs against both root dist entry points', async () => {
    const { module: transformed } = await loadBuiltTransformedModule(`
      export function calculate(price, quantity) {
        Loxer.info('inside calculate');
        return { total: 59.85 };
      }
      trace.TRACE.h().props('argsResult').pp({ target: 'result', depth: 1 }).warn(calculate, {
        openMessage: 'fn(args)',
        closeMessage: 'fn(result)'
      });
    `);

    expect(transformed.calculate(19.95, 3)).toEqual({ total: 59.85 });
    expect(devLogs.map((lox) => lox.message)).toEqual([
      'calculate(19.95, 3)',
      'inside calculate',
      'calculate({"total":59.85}) done',
    ]);
    expect(devLogs.map((lox) => lox.level)).toEqual(['warn', 'info', 'warn']);
    expect(devLogs[0]).toMatchObject({ highlighted: true, moduleId: 'TRACE', props: [19.95, 3] });
    expect(devLogs[2]).toMatchObject({
      highlighted: true,
      moduleId: 'TRACE',
      printProps: { depth: 1 },
      props: [{ total: 59.85 }],
    });
  });

  test('a built point-only module imports only its helper and preserves point output semantics', async () => {
    const { code, module: transformed } = await loadBuiltTransformedModule(`
      export function save(order) {
        trace.point.TRACE.pp().warn('parent.fn', 'retrying', order);
        return order.id;
      }
    `);

    expect(code).toContain('__tracePoint');
    expect(code).not.toContain('__startTrace');
    expect(code).not.toContain('__observeTraceResult');
    expect(code).not.toContain('__setTraceFunctionLength');
    expect(code).not.toContain('trace.point');
    expect(code).not.toMatch(/import\s*\{[^}]*\btrace\b[^}]*\}\s*from/);
    expect(transformed.save({ id: 7 })).toBe(7);
    expect(devLogs).toHaveLength(1);
    expect(devLogs[0]).toMatchObject({
      level: 'warn',
      message: 'checkout.save(): retrying',
      moduleId: 'TRACE',
      printProps: {},
      props: [{ id: 7 }],
      type: 'single',
    });
  });

  test('a mixed built module cleans markers, preserves spread and callback routes, and links points', async () => {
    const { code, module: transformed } = await loadBuiltTransformedModule(`
      let callbackCalls = 0;
      function save(order, selector) {
        trace.point.TRACE.pp(...[{ depth: 1 }]).warn(...[selector, 'retrying', order]);
        trace.point.info(({ fn }) => {
          callbackCalls += 1;
          return fn('callback');
        }, order);
        return order.id;
      }
      trace.TRACE.info(save);
      export { callbackCalls, save };
    `);

    expect(code).toContain('__tracePoint');
    expect(code).toContain('__startTrace');
    expect(code).toContain('__observeTraceResult');
    expect(code).toContain('__setTraceFunctionLength');
    expect(code).not.toContain('trace.point');
    expect(code).not.toContain('trace.TRACE');
    expect(code).not.toMatch(/import\s*\{[^}]*\btrace\b[^}]*\}\s*from/);

    const order = { id: 9 };
    expect(transformed.save(order, 'fn')).toBe(9);
    expect(transformed.callbackCalls).toBe(1);
    expect(devLogs.map((log) => [log.type, log.level, log.message])).toEqual([
      ['open', 'info', 'checkout.save()'],
      ['single', 'warn', 'save(): retrying'],
      ['single', 'info', 'save(callback)'],
      ['close', 'info', 'save done'],
    ]);
    expect(devLogs[1]).toMatchObject({ moduleId: 'TRACE', printProps: {}, props: [order] });
    expect(devLogs[2].props).toEqual([order]);
    expect(new Set(devLogs.map((log) => log.id)).size).toBe(1);
  });

  test.each([
    {
      name: 'point-only',
      source:
        "import { trace } from 'loxer/trace'; export function save() { trace.point.info('fn', 'saved'); }",
      lifecycle: false,
    },
    {
      name: 'mixed point and lifecycle markers',
      source:
        "import { trace } from 'loxer/trace'; function save() { trace.point.info('fn', 'saved'); } trace.info(save); export { save };",
      lifecycle: true,
    },
  ])(
    'the built Vite adapter emits selective helpers for $name input',
    async ({ source, lifecycle }) => {
      const code = await transformWithBuiltVitePlugin(source);

      expect(code).toContain('__tracePoint');
      expect(code.includes('__startTrace')).toBe(lifecycle);
      expect(code.includes('__observeTraceResult')).toBe(lifecycle);
      expect(code.includes('__setTraceFunctionLength')).toBe(lifecycle);
      expect(code).not.toContain('trace.point');
      expect(code).not.toContain('trace.info(save)');
      expect(code).not.toMatch(/import\s*\{[^}]*\btrace\b[^}]*\}\s*from/);
    }
  );

  test('a computed module emitted by the built Babel plugin evaluates once and routes through dist', async () => {
    const { module: transformed } = await loadBuiltTransformedModule(`
      let selections = 0;
      function selectModule() { selections += 1; return 'TRACE'; }
      export function calculate(value) { return value * 2; }
      trace[selectModule()].info(calculate);
      export { selections };
    `);

    expect(transformed.selections).toBe(1);
    expect(transformed.calculate(4)).toBe(8);
    expect(transformed.selections).toBe(1);
    expect(devLogs.map((lox) => [lox.type, lox.moduleId])).toEqual([
      ['open', 'TRACE'],
      ['close', 'TRACE'],
    ]);
  });

  test('dist exports the trace printer type surface from both entry points', () => {
    const { index, trace } = dist;

    // the value exports the type surface travels with - a missing re-export would break the
    // `loxer/trace` entry point for a consumer without any suite noticing
    expect(typeof trace.__startTrace).toBe('function');
    expect(typeof index.Loxer.init).toBe('function');
    expect(typeof index.ANSIFormat.fgClass).toBe('function');
    expect(index.ANSIFormat.fgClass('X')).toBe('\x1b[38;2;78;201;176mX\x1b[0m');
  });
});
