import { Loxer, resetLoxer } from '../src';
import { outputFromCallbacks } from './output-capture';
import { Modules } from '../src/core/runtime/Modules';
import { ErrorLox, OutputLox } from '../src/loxes';
import { Lox } from '../src/loxes/Lox';
import type { Module } from '../src/types';

// The module table's two fallback paths: a module id that isn't in the table at all, and a module
// literal from an untyped (JS) consumer that omits its levels. Both must keep logging rather than
// silently swallow output.

let devLogs: OutputLox[] = [];
function devLog(log: OutputLox) {
  devLogs.push(log);
}
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let devErrors: ErrorLox[] = [];
function devError(log: ErrorLox) {
  devErrors.push(log);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox) {
  prodErrors.push(log);
}

const callbacks = { devLog, devError, prodLog, prodError };

/** what a JS consumer can hand over: a module literal with no `devLevel` / `prodLevel` at all */
const MALFORMED = { color: '#0ff', fullName: 'Malformed' } as unknown as Module;

function singleLox(moduleId: string, level: 'error' | 'warn' | 'info' | 'debug') {
  return new Lox({
    // `Modules.getModule` never reads the id, but a `Lox` requires one
    id: 0,
    highlighted: false,
    props: [],
    printProps: undefined,
    level,
    message: 'm',
    moduleId,
    type: 'single',
  });
}

afterEach(() => {
  devLogs = [];
  devErrors = [];
  prodLogs = [];
  prodErrors = [];
  resetLoxer();
});

afterAll(() => {
  // prod output must be empty!
  expect(prodErrors.length).toBe(0);
  expect(prodLogs.length).toBe(0);
});

test('a lox carrying an unregistered module id falls back to the INVALID module', () => {
  const modules = new Modules({ isDev: true, moduleTextSlice: 8 });
  const lox = singleLox('ghost', 'info');

  const { loxModule, hidden } = modules.getModule(lox);

  // the id is rewritten on the lox itself, so every later consumer (box, output, history) agrees
  expect(lox.moduleId).toBe('INVALID');
  expect(loxModule.fullName).toBe('INVALIDMODULE');
  expect(loxModule.slicedName).toBe('INVALIDM: ');
  // INVALID is a visible module - a misspelled id must be noticeable, not muted
  expect(hidden).toBe(false);
  expect(modules.getModule(singleLox('ghost', 'debug')).hidden).toBe(true);
});

test("a module without levels logs up to 'info' instead of muting itself", () => {
  const dev = new Modules({ isDev: true, modules: { MAL: MALFORMED } });
  expect(dev.getModule(singleLox('MAL', 'error')).hidden).toBe(false);
  expect(dev.getModule(singleLox('MAL', 'warn')).hidden).toBe(false);
  expect(dev.getModule(singleLox('MAL', 'info')).hidden).toBe(false);
  expect(dev.getModule(singleLox('MAL', 'debug')).hidden).toBe(true);
  // the module itself is kept, not swapped for INVALID
  expect(dev.getModule(singleLox('MAL', 'info')).loxModule.fullName).toBe('Malformed');

  // the same fallback applies to the missing `prodLevel` - production does not mute it either
  const prod = new Modules({ isDev: false, modules: { MAL: MALFORMED } });
  expect(prod.getModule(singleLox('MAL', 'info')).hidden).toBe(false);
  expect(prod.getModule(singleLox('MAL', 'debug')).hidden).toBe(true);
});

test('a module without levels stays loggable through the public API', () => {
  Loxer.init({ dev: true, output: outputFromCallbacks(callbacks), modules: { MAL: MALFORMED } });

  Loxer.m('MAL').log('shown log');
  Loxer.m('MAL').warn('shown warn');
  Loxer.m('MAL').debug('hidden debug');
  Loxer.m('MAL').error('reported error');

  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized', 'shown log', 'shown warn']);
  expect(devLogs[1].moduleId).toBe('MAL');
  expect(devLogs[1].module.fullName).toBe('Malformed');
  expect(Loxer.history.some((l) => l.message === 'hidden debug')).toBe(false);
  expect(devErrors.map((l) => l.message)).toEqual(['reported error']);

  // the fallback is applied at output time only - the module truly has no declared threshold
  expect(Loxer.getModuleLevel('MAL')).toBeUndefined();
});
