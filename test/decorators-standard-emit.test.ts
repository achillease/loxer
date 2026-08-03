import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Loxer, resetLoxer, trace } from '../src';
import { OutputLox } from '../src/loxes';

let moduleCount = 0;

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__loxerStandardTrace;
  delete (globalThis as Record<string, unknown>).__loxerStandardResult;
  resetLoxer();
});

test('TypeScript standard decorator emit invokes the real @trace protocol', async () => {
  const logs: OutputLox[] = [];
  Loxer.init({
    dev: true,
    callbacks: {
      devLog(log) {
        logs.push(log);
      },
    },
  });
  logs.length = 0;
  (globalThis as Record<string, unknown>).__loxerStandardTrace = trace;

  const source = `
    const trace = globalThis.__loxerStandardTrace;
    class Service {
      @trace({
        moduleId: 'NONE',
        openMessage: 'parent.functionName',
        closeMessage: 'result',
      })
      calculate(value: number) {
        return value * 2;
      }
    }
    globalThis.__loxerStandardResult = new Service().calculate(4);
  `;
  const emitted = ts.transpileModule(source, {
    compilerOptions: {
      experimentalDecorators: false,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  expect(emitted.diagnostics ?? []).toEqual([]);
  expect(emitted.outputText).toContain('__esDecorate');
  await import(`${asDataModule(emitted.outputText)}#${moduleCount++}`);

  expect((globalThis as Record<string, unknown>).__loxerStandardResult).toBe(8);
  expect(logs.map((log) => [log.type, log.message])).toEqual([
    ['open', 'Service.calculate()'],
    ['close', 'calculate done. returns: 8'],
  ]);
});

test.each([
  ['legacy', true],
  ['standard', false],
] as const)(
  'the public decorators typecheck under TypeScript %s decorator semantics',
  (_mode, experimentalDecorators) => {
    const fixturePath = fileURLToPath(
      new URL('./__virtual__/decorator-type-conformance.ts', import.meta.url)
    );
    const fixtureSource = `
      import { trace } from '../../src/decorators/trace.js';
      import { initLoxer } from '../../src/decorators/initLoxer.js';

      @initLoxer({ dev: true })
      class Service {
        @trace<[value: number], number>({
          moduleId: 'NONE',
          openMessage: ([value]) => String(value),
          closeMessage: (result) => String(result),
        })
        calculate(value: number): number {
          return value * 2;
        }
      }

      new Service().calculate(4);
    `;
    const options: ts.CompilerOptions = {
      experimentalDecorators,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: ['node'],
    };
    const host = ts.createCompilerHost(options);
    const isFixture = (fileName: string) =>
      fileName.replaceAll('\\', '/').toLowerCase() ===
      fixturePath.replaceAll('\\', '/').toLowerCase();
    const originalFileExists = host.fileExists.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalReadFile = host.readFile.bind(host);
    host.fileExists = (fileName) => isFixture(fileName) || originalFileExists(fileName);
    host.readFile = (fileName) => (isFixture(fileName) ? fixtureSource : originalReadFile(fileName));
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
      isFixture(fileName)
        ? ts.createSourceFile(fileName, fixtureSource, languageVersion, true)
        : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);

    const program = ts.createProgram([fixturePath], options, host);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

    expect(diagnostics).toEqual([]);
  }
);

function asDataModule(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
