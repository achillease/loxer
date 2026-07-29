import { vi, type Mock } from 'vitest';
import { Loxer, resetLoxer } from '../src';
import { Loxes } from '../src/core/Loxes';
import { Modules } from '../src/core/Modules';
import { ErrorLox, OutputLox } from '../src/loxes';
import { OutputStreams } from '../src/core/OutputStreams';
import { Lox } from '../src/loxes/Lox';
import { LoxHistory } from '../src/core/LoxHistory';

// mock console
global.console.log = vi.fn();
global.console.error = vi.fn();

let devLogs: OutputLox[] = [];
function devLog(log: OutputLox) {
  devLogs.push(log);
}
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let devErrors: ErrorLox[] = [];
function devError(log: ErrorLox, history: (OutputLox | ErrorLox)[]) {
  devErrors.push(log);
  histories.push(history);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox, history: (OutputLox | ErrorLox)[]) {
  prodErrors.push(log);
  histories.push(history);
}
let histories: (OutputLox | ErrorLox)[][] = [];

afterEach(() => {
  devLogs = [];
  devErrors = [];
  histories = [];
  resetLoxer();
});

afterAll(() => {
  // prod output must be empty!
  expect(prodErrors.length).toBe(0);
  expect(prodLogs.length).toBe(0);
});

test('initialization', () => {
  Loxer.init({
    dev: true,
    callbacks: {
      devError,
      devLog,
      prodError,
      prodLog,
    },
    defaultLevels: {
      devLevel: 'info',
      prodLevel: 'error',
    },
    modules: {
      TEST: { color: '#ff0', devLevel: 'info', prodLevel: 'error', fullName: 'TestModule' },
    },
    config: {
      moduleTextSlice: 10,
      historyCacheSize: 1,
    },
  });
  expect(devLogs.length).toBe(1);
  expect(devLogs[0].message).toBe('Loxer initialized');
});

test('defaultLevels do not leak into a later Loxer instance', () => {
  Loxer.init({
    dev: true,
    callbacks: { devLog, devError },
    defaultLevels: { devLevel: 'error', prodLevel: 'error' },
  });
  // the init log is 'info' and therefore muted by the given default level
  expect(devLogs.length).toBe(0);

  resetLoxer();
  devLogs = [];
  Loxer.init({ dev: true, callbacks: { devLog, devError } });
  // the built-in 'info' default is back: the previous init must not have rewritten the shared
  // DEFAULT_MODULES const for the rest of the process
  expect(devLogs.length).toBe(1);
  expect(devLogs[0].message).toBe('Loxer initialized');
});

test('default init', () => {
  Loxer.init({ callbacks: { devLog, devError } });
  expect(devLogs.length).toBe('development' === process.env.NODE_ENV ? 1 : 0);
  'development' === process.env.NODE_ENV && expect(devLogs[0].message).toBe('Loxer initialized');
});

test('disabled init', () => {
  Loxer.init({ dev: true, config: { disabled: true }, callbacks: { devLog, devError } });
  expect(devLogs.length).toBe(0);
  // expect(devLogs[0].message).toBe('Loxer initialized');
});

test('disalbed logs', () => {
  Loxer.init({ config: { disabled: true } });
  const id = Loxer.open('disabled log');
  Loxer.of(id).add('add');
  Loxer.of(id).error('error');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(0);
  expect(devErrors.length).toBe(0);
});

test('queueing logs', () => {
  const id = Loxer.open('disabled log which is queued');
  Loxer.of(id).add('add');
  Loxer.of(id).error('error');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(0);
  expect(devErrors.length).toBe(0);

  Loxer.init({ dev: true, callbacks: { devLog, devError } });

  expect(devLogs.length).toBe(4);
  expect(devErrors.length).toBe(1);

  // the queued logs replay in order, after the init log; the error replays to devError
  expect(devLogs.map((l) => l.message)).toEqual([
    'Loxer initialized',
    'disabled log which is queued',
    'add',
    'close',
  ]);
  expect(devErrors[0].message).toBe('error');
});

test('queued logs resolve their level against the module table given at init', () => {
  // nothing is registered yet - these are levelled against whatever `init` supplies later
  Loxer.m().warn('queued warn');
  Loxer.m().info('queued info');
  Loxer.m().debug('queued debug');
  Loxer.m().error('queued error');
  Loxer.info('queued NONE info');

  expect(devLogs.length).toBe(0);
  expect(devErrors.length).toBe(0);

  Loxer.init({
    dev: true,
    callbacks: { devLog, devError },
    defaultLevels: { devLevel: 'info', prodLevel: 'error' },
  });

  // 'debug' sits past the 'info' threshold the module table was initialized with, so it is
  // dropped on replay - the level gate runs at replay time, not at enqueue time
  expect(devLogs.map((l) => l.message)).toEqual([
    'Loxer initialized',
    'queued warn',
    'queued info',
    'queued NONE info',
  ]);
  expect(devLogs.map((l) => l.level)).toEqual(['info', 'warn', 'info', 'info']);
  // a dropped log stays out of history, exactly like a live one would
  expect(Loxer.history.some((l) => l.message === 'queued debug')).toBe(false);
  // an error replays whatever the initialized threshold says
  expect(devErrors.map((l) => l.message)).toEqual(['queued error']);
});

test('a queued log is hidden by a threshold that only the init call introduces', () => {
  Loxer.m().warn('queued warn');
  Loxer.m().info('queued info');
  Loxer.m().error('queued error');

  Loxer.init({
    dev: true,
    callbacks: { devLog, devError },
    // stricter than the built-in 'info' default: an 'info' log that would have been visible at
    // enqueue time must now be dropped, which is only possible if the table used is this one
    defaultLevels: { devLevel: 'warn', prodLevel: 'error' },
  });

  // the 'Loxer initialized' log is itself an 'info' log and goes with them
  expect(devLogs.map((l) => l.message)).toEqual(['queued warn']);
  expect(devErrors.map((l) => l.message)).toEqual(['queued error']);
});

test('OutputStreams', () => {
  (console.log as Mock).mockClear();
  let os = new OutputStreams({ disableColors: true, endTitleOpacity: 1 });
  const ol = new OutputLox({
    highlighted: false,
    id: 0,
    item: 'item',
    itemOptions: undefined,
    level: 'info',
    message: 'log',
    moduleId: 'NONE',
    type: 'open',
  });
  const cl = new OutputLox({
    highlighted: false,
    id: 0,
    item: undefined,
    itemOptions: undefined,
    level: 'info',
    message: 'log',
    moduleId: 'NONE',
    type: 'close',
  });
  const el = new ErrorLox(
    new Lox({
      highlighted: false,
      id: 1,
      item: 'item',
      itemOptions: undefined,
      level: 'info',
      message: 'error',
      moduleId: 'NONE',
      type: 'error',
    }),
    new Error('errorText')
  );
  const el2 = new ErrorLox(
    new Lox({
      highlighted: true,
      id: 2,
      item: undefined,
      itemOptions: undefined,
      level: 'info',
      message: 'error2',
      moduleId: 'NONE',
      type: 'error',
    }),
    new Error('errorText2')
  );
  el.openLoxes = [ol, cl];
  el2.openLoxes = [ol, cl];
  const hy = new LoxHistory(1);
  hy.add(ol);
  hy.add(cl);
  os.logOut(true, ol);
  os.logOut(true, cl);
  os.logOut(false, cl);
  os.errorOut(true, el, hy);
  os.errorOut(true, el2, hy);
  os.errorOut(false, el2, hy);
  os = new OutputStreams({
    callbacks: {
      prodError: () => {},
      prodLog: () => {},
    },
  });
  os.logOut(true, cl);
  os.logOut(false, cl);
  os.errorOut(true, el2, hy);
  os.errorOut(false, el2, hy);

  // the no-callback stream renders to the console fallback path (which runs Item.prettify)
  const outputs = (console.log as Mock).mock.calls.map((c) => String(c[0]));
  expect(outputs.length).toBeGreaterThan(0);
  // the open log's message and its string item were rendered
  expect(outputs.some((o) => o.includes('log') && o.includes("'item'"))).toBe(true);
  // the highlighted error (el2) renders its stack: 'errorText2' appears ONLY via the
  // concatenated Error.stack (OutputStreams.ts:61), so this fails if stack rendering breaks
  expect(outputs.some((o) => o.includes('errorText2'))).toBe(true);
  // the non-highlighted error (el) does NOT get its stack rendered — only its message
  expect(outputs.some((o) => o.includes('errorText') && !o.includes('errorText2'))).toBe(false);
  // both error messages themselves were rendered
  expect(outputs.some((o) => o.includes('error2'))).toBe(true);
});

test('Rest', () => {
  Loxer.init({ dev: false, config: { historyCacheSize: 1 }, callbacks: { devLog, devError } });
  const l = new Loxes();
  // an unfindable id (NaN) resolves to no open lox
  expect(l.findOpenLox(Number('wrong'))).toBeUndefined();

  const m = new Modules();
  const lox = new Lox({
    highlighted: false,
    id: 0,
    item: undefined,
    itemOptions: undefined,
    level: 'info',
    message: 'm',
    moduleId: 'wrong',
    type: 'single',
  });
  // an unregistered moduleId falls back to the INVALID module text and rewrites the moduleId
  const text = m.getText(lox);
  expect(text).toContain('INVALID');
  expect(lox.moduleId).toBe('INVALID');
});
