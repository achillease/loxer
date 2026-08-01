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
// the pre-init queue reports itself through console.warn - the only channel that exists before
// init() registers any callback
global.console.warn = vi.fn();

/** mirrors `PENDING_QUEUE_CAP` in `src/core/Loxes.ts`, which is deliberately not exported: the
 * pre-init queue takes no configuration, because `init()`'s config is by construction too late */
const PENDING_QUEUE_CAP = 1000;
/** mirrors `PENDING_QUEUE_TIMEOUT_MS` in `src/core/Loxes.ts` */
const PENDING_QUEUE_TIMEOUT_MS = 5000;

/** the messages the queue reported, in call order */
function warnings(): string[] {
  return (console.warn as Mock).mock.calls.map((call) => String(call[0]));
}

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
  vi.useRealTimers();
  (console.warn as Mock).mockClear();
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

test('a pre-init queue that nothing drains reports itself once, past the threshold', () => {
  vi.useFakeTimers();

  Loxer.log('the first queued log');
  Loxer.m().warn('a second queued log');
  // still inside the healthy module-evaluation-to-init() gap
  vi.advanceTimersByTime(PENDING_QUEUE_TIMEOUT_MS - 1);
  expect(warnings()).toEqual([]);

  vi.advanceTimersByTime(1);

  expect(warnings()).toHaveLength(1);
  // the count, the elapsed time, and both candidate causes
  expect(warnings()[0]).toContain(`2 log(s) have waited ${PENDING_QUEUE_TIMEOUT_MS}ms`);
  expect(warnings()[0]).toContain('Loxer.init()');
  expect(warnings()[0]).toContain('two copies of loxer');
  expect(warnings()[0]).not.toContain('the first queued log');

  // once ever per instance: neither a later advance nor a further log reports again
  vi.advanceTimersByTime(PENDING_QUEUE_TIMEOUT_MS * 10);
  Loxer.log('a log written long after the report');
  vi.advanceTimersByTime(PENDING_QUEUE_TIMEOUT_MS);
  expect(warnings()).toHaveLength(1);

  // reporting does not consume the queue - every log still replays at init
  Loxer.init({ dev: true, callbacks: { devLog, devError } });
  expect(devLogs.map((l) => l.message)).toEqual([
    'Loxer initialized',
    'the first queued log',
    'a second queued log',
    'a log written long after the report',
  ]);
});

test('init inside the threshold reports nothing and disarms the queue timer', () => {
  vi.useFakeTimers();

  Loxer.log('queued in the healthy gap');
  // the first enqueue armed exactly one timer
  expect(vi.getTimerCount()).toBe(1);

  vi.advanceTimersByTime(10);
  Loxer.init({ dev: true, callbacks: { devLog, devError } });

  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized', 'queued in the healthy gap']);
  expect(warnings()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  // and a disarmed timer cannot fire late either
  vi.advanceTimersByTime(PENDING_QUEUE_TIMEOUT_MS * 2);
  expect(warnings()).toEqual([]);
});

test('resetLoxer with a pending queue reports nothing on a later advance', () => {
  vi.useFakeTimers();

  Loxer.log('queued and then thrown away');
  expect(vi.getTimerCount()).toBe(1);

  resetLoxer();

  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(PENDING_QUEUE_TIMEOUT_MS * 2);
  expect(warnings()).toEqual([]);

  // the reset emptied the queue too, so a later init replays nothing but its own log
  Loxer.init({ dev: true, callbacks: { devLog, devError } });
  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized']);
});

test('the pre-init queue caps, reports the overflow immediately and drops the newest logs', () => {
  // fake timers freeze the clock, so nothing here can be attributed to the elapsed-time report
  vi.useFakeTimers();
  const overflow = 3;

  for (let i = 0; i < PENDING_QUEUE_CAP + overflow; i++) {
    Loxer.log(`queued ${i}`);
  }

  // hitting the cap undrained is unambiguous whatever the elapsed time, so it reports at once
  expect(warnings()).toHaveLength(1);
  expect(warnings()[0]).toContain(`${PENDING_QUEUE_CAP} log cap`);
  expect(warnings()[0]).not.toContain('queued 0');

  Loxer.init({ dev: true, callbacks: { devLog, devError } });

  // exactly the cap replays, plus the init log itself
  expect(devLogs).toHaveLength(PENDING_QUEUE_CAP + 1);
  // the head survives - `findOpenLox` searches the pending queue, so evicting from the front would
  // unlink a pre-init `.of(id)` from its opening log
  expect(devLogs[1].message).toBe('queued 0');
  // ...and the newest are the ones that went
  expect(devLogs[devLogs.length - 1].message).toBe(`queued ${PENDING_QUEUE_CAP - 1}`);
  expect(devLogs.some((l) => l.message === `queued ${PENDING_QUEUE_CAP + overflow - 1}`)).toBe(
    false
  );

  // the drop count is reported at replay, separately from the overflow report
  expect(warnings()).toHaveLength(2);
  expect(warnings()[1]).toContain(`${overflow} log(s) were dropped`);
  expect(warnings()[1]).toContain(`more than ${PENDING_QUEUE_CAP} logs`);
});

test('an overflowing queue keeps the opening log at its head, so a pre-init .of(id) still resolves', () => {
  vi.useFakeTimers();

  // the opening log is the head of the queue, so it is the entry an eviction from the front would
  // take first
  const box = Loxer.open('an opened box, queued first');
  for (let i = 0; i < PENDING_QUEUE_CAP - 2; i++) {
    Loxer.log(`filler ${i}`);
  }
  // one slot left, so this close is still retained - `.of(id)` resolves it against the pending queue
  Loxer.of(box).close('closed before init');
  // ...and only now does the queue overflow
  for (let i = 0; i < 5; i++) {
    Loxer.log(`overflow ${i}`);
  }

  Loxer.init({ dev: true, callbacks: { devLog, devError } });

  expect(devLogs).toHaveLength(PENDING_QUEUE_CAP + 1);
  expect(devLogs[1].message).toBe('an opened box, queued first');
  expect(devLogs[1].type).toBe('open');
  // the close found its own opening log rather than the "not (anymore) existing Lox" error path
  const closeLog = devLogs[PENDING_QUEUE_CAP];
  expect(closeLog.message).toBe('closed before init');
  expect(closeLog.type).toBe('close');
  expect(closeLog.id).toBe(box.id);
  // a time consumption is only computed when the close paired up with its open
  expect(closeLog.timeConsumption).toBeDefined();
  expect(devErrors).toEqual([]);
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
