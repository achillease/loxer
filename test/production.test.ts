import { Loxer, resetLoxer } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';
import type { LoxerModules } from '../src/types';

// Production mode (`dev: false`) is where the named-level scale has to prove that a threshold of
// `'error'` means "errors only" and never "nothing at all". Every other suite runs `dev: true` and
// only asserts that the prod arrays stay empty, so this file is the one that actually exercises
// the `prodLevel` gate and the `prodLog` / `prodError` streams.

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
function prodError(log: ErrorLox, history: (OutputLox | ErrorLox)[]) {
  prodErrors.push(log);
  histories.push(history);
}
let histories: (OutputLox | ErrorLox)[][] = [];

const callbacks = { devLog, devError, prodLog, prodError };

/** the module the level tests log against, parameterized by its production threshold */
function apiModule(prodLevel: 'error' | 'warn' | 'info' | 'debug'): LoxerModules {
  return {
    // devLevel is deliberately the noisiest value there is: nothing here may depend on it
    API: { color: '#ff0', devLevel: 'debug', prodLevel, fullName: 'ApiModule' },
  };
}

afterEach(() => {
  devLogs = [];
  devErrors = [];
  prodLogs = [];
  prodErrors = [];
  histories = [];
  resetLoxer();
});

test("a module at prodLevel 'error' drops every normal log but still reports its errors", () => {
  Loxer.init({ dev: false, callbacks, modules: apiModule('error') });

  // the 'Loxer initialized' log is an 'info' log on NONE, whose built-in prodLevel is 'error'
  expect(prodLogs.length).toBe(0);

  Loxer.m('API').log('normal log');
  Loxer.m('API').info('info log');
  Loxer.m('API').warn('warn log');
  Loxer.m('API').debug('debug log');

  // a module that logs up to 'error' lets no normal log through, whatever its level
  expect(prodLogs.length).toBe(0);
  // ... and a hidden log never enters history either
  expect(Loxer.history.length).toBe(0);

  Loxer.m('API').error('boom');

  // errors bypass the level gate entirely - this is what makes 'error' "errors only", not "off"
  expect(prodErrors.length).toBe(1);
  expect(prodErrors[0].message).toBe('boom');
  expect(prodErrors[0].level).toBe('error');
  expect(prodErrors[0].moduleId).toBe('API');
  expect(prodErrors[0].error).toBeInstanceOf(Error);
  // an error is always recorded, whatever the module allows
  expect(Loxer.history.map((l) => l.message)).toEqual(['boom']);
  // the history handed to the callback is the same one
  expect(histories[0].map((l) => l.message)).toEqual(['boom']);

  // the development streams stay untouched in production mode
  expect(devLogs.length).toBe(0);
  expect(devErrors.length).toBe(0);
});

test("a module at prodLevel 'info' emits its normal logs to prodLog", () => {
  Loxer.init({ dev: false, callbacks, modules: apiModule('info') });

  Loxer.m('API').warn('warn log');
  Loxer.m('API').info('info log');
  Loxer.m('API').log('log log');
  Loxer.m('API').debug('debug log');

  // production is not hardwired silent: the module's own threshold decides, exactly as in dev
  expect(prodLogs.map((l) => l.message)).toEqual(['warn log', 'info log', 'log log']);
  expect(prodLogs.map((l) => l.level)).toEqual(['warn', 'info', 'info']);
  expect(prodLogs.every((l) => l.moduleId === 'API')).toBe(true);
  // only 'debug' sits past the threshold
  expect(Loxer.history.some((l) => l.message === 'debug log')).toBe(false);
  expect(Loxer.history.length).toBe(3);

  // warn is a level on the prodLog stream, not the prodError one - even in production
  expect(prodErrors.length).toBe(0);
  expect(devLogs.length).toBe(0);
});

test('production output defaults to silence', () => {
  // no `modules`, no `defaultLevels`: everything runs on the built-in prodLevel 'error'
  Loxer.init({ dev: false, callbacks });

  expect(prodLogs.length).toBe(0);

  Loxer.log('normal log');
  Loxer.info('info log');
  Loxer.warn('warn log');
  Loxer.debug('debug log');
  Loxer.m().log('DEFAULT module log');
  const box = Loxer.open('box');
  Loxer.of(box).add('added');
  Loxer.of(box).close('closed');

  expect(prodLogs.length).toBe(0);
  expect(Loxer.history.length).toBe(0);

  // silence is about normal logs only - an error still reaches the production integration point
  Loxer.error(new Error('production failure'));
  expect(prodErrors.map((l) => l.message)).toEqual(['production failure']);
});

test('getModuleLevel reports the threshold of the mode Loxer runs in', () => {
  const modules = apiModule('warn');

  Loxer.init({ dev: false, callbacks, modules });
  expect(Loxer.getModuleLevel('API')).toBe('warn');
  // the built-in defaults in production
  expect(Loxer.getModuleLevel('NONE')).toBe('error');
  expect(Loxer.getModuleLevel('DEFAULT')).toBe('error');

  resetLoxer();
  Loxer.init({ dev: true, callbacks, modules });
  expect(Loxer.getModuleLevel('API')).toBe('debug');
  // ... and in development
  expect(Loxer.getModuleLevel('NONE')).toBe('info');
  expect(Loxer.getModuleLevel('DEFAULT')).toBe('info');
});
