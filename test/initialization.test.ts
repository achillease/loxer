import { outputFromCallbacks } from './output-capture';
import { vi, type Mock } from 'vitest';
import {
  ErrorLoxRenderer,
  Loxer,
  OutputLoxRenderer,
  resetLoxer,
  type LoxerOutputEvent,
} from '../src';
import { Loxes } from '../src/core/runtime/Loxes';
import { Modules } from '../src/core/runtime/Modules';
import { ErrorLox, OutputLox } from '../src/loxes';
import { OutputStreams } from '../src/core/output/OutputStreams';
import { Lox } from '../src/loxes/Lox';
import { LoxHistory } from '../src/core/runtime/LoxHistory';

// mock console
global.console.log = vi.fn();
global.console.error = vi.fn();
// the pre-init queue reports itself through console.warn - the only channel that exists before
// init() registers any callback
global.console.warn = vi.fn();

/** mirrors `PENDING_QUEUE_CAP` in `src/core/runtime/Loxes.ts`, which is deliberately not exported: the
 * pre-init queue takes no configuration, because `init()`'s config is by construction too late */
const PENDING_QUEUE_CAP = 1000;
/** mirrors `PENDING_QUEUE_TIMEOUT_MS` in `src/core/runtime/Loxes.ts` */
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
    output: outputFromCallbacks({
      devError,
      devLog,
      prodError,
      prodLog,
    }),
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
    output: outputFromCallbacks({ devLog, devError }),
    defaultLevels: { devLevel: 'error', prodLevel: 'error' },
  });
  // the init log is 'info' and therefore muted by the given default level
  expect(devLogs.length).toBe(0);

  resetLoxer();
  devLogs = [];
  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
  // the built-in 'info' default is back: the previous init must not have rewritten the shared
  // DEFAULT_MODULES const for the rest of the process
  expect(devLogs.length).toBe(1);
  expect(devLogs[0].message).toBe('Loxer initialized');
});

test('default init', () => {
  Loxer.init({ output: outputFromCallbacks({ devLog, devError }) });
  expect(devLogs.length).toBe('development' === process.env.NODE_ENV ? 1 : 0);
  'development' === process.env.NODE_ENV && expect(devLogs[0].message).toBe('Loxer initialized');
});

test('disabled init', () => {
  Loxer.init({
    dev: true,
    config: { disabled: true },
    output: outputFromCallbacks({ devLog, devError }),
  });
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

  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

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
    output: outputFromCallbacks({ devLog, devError }),
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
    output: outputFromCallbacks({ devLog, devError }),
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
  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
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
  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

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
  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
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

  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

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

  Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

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

test('public structured renderers reproduce the default development console output', () => {
  resetLoxer();
  Loxer.init({ dev: true });
  (console.log as Mock).mockClear();

  // the default console leads with `time`, the 8-character time of day, so the props indentation it
  // passes is that width plus the separator before the module text
  Loxer.pp().log('log', 'prop');
  const outputLox = Loxer.history[0] as OutputLox;
  const outputTemplate = OutputLoxRenderer(outputLox, 8 + 1 + outputLox.module.slicedName.length);
  expect(outputTemplate.message).toBe('log');
  expect(outputTemplate.time).toBe(outputTemplate.timeStamp.slice(11));
  expect(outputTemplate.time).toHaveLength(8);
  expect(outputTemplate.props).toContain("'prop'");
  expect(outputTemplate.props).not.toContain('\x1b[');
  expect(outputTemplate.colored.props).toContain('\x1b[');
  expect((console.log as Mock).mock.calls[0][0]).toBe(
    `${outputTemplate.colored.time} ${outputTemplate.colored.module}${outputTemplate.colored.box}${outputTemplate.colored.message}\t${outputTemplate.colored.timeConsumption}${outputTemplate.colored.props}`
  );

  Loxer.h().error(new Error('errorText'));
  const errorLox = Loxer.history[0] as ErrorLox;
  const errorTemplate = ErrorLoxRenderer(errorLox, 8 + 1 + errorLox.module.slicedName.length);
  expect(errorTemplate.stack).not.toBe('');
  expect((console.log as Mock).mock.calls[1][0]).toBe(
    `${errorTemplate.colored.time} ${errorTemplate.colored.module}${errorTemplate.colored.box}${errorTemplate.colored.message}\t${errorTemplate.colored.timeConsumption}${errorTemplate.colored.props}${errorTemplate.colored.stack}${errorTemplate.colored.openLogs}`
  );
});

test('the output stream receives discriminated raw log and error events', () => {
  const events: LoxerOutputEvent[] = [];
  resetLoxer();
  Loxer.init({ dev: true, output: (event) => events.push(event) });
  events.splice(0);
  (console.log as Mock).mockClear();

  Loxer.log('ordinary');
  Loxer.error(new Error('broken'));

  expect(events.map((event) => [event.environment, event.kind])).toEqual([
    ['dev', 'log'],
    ['dev', 'error'],
  ]);
  const [log, error] = events;
  if (log.kind !== 'log' || error.kind !== 'error') {
    throw new Error('Expected one log event followed by one error event');
  }
  expect(log.lox).toBe(Loxer.history[1]);
  expect(error.lox).toBe(Loxer.history[0]);
  expect(error.history).toContain(error.lox);
  expect((console.log as Mock).mock.calls).toEqual([]);
});

test('public renderers expose complete plain and colored fields without changing logger state', () => {
  const events: LoxerOutputEvent[] = [];
  resetLoxer();
  Loxer.init({ dev: true, output: (event) => events.push(event) });
  events.splice(0);

  const box = Loxer.pp().open('open context', { request: 'r-1' });
  Loxer.h().pp().of(box).error(new Error('highlighted failure'), { request: 'r-1' });
  Loxer.error(new Error('plain failure'));

  const highlighted = events.find(
    (event): event is Extract<LoxerOutputEvent, { kind: 'error' }> =>
      event.kind === 'error' && event.lox.message === 'highlighted failure'
  );
  const plain = events.find(
    (event): event is Extract<LoxerOutputEvent, { kind: 'error' }> =>
      event.kind === 'error' && event.lox.message === 'plain failure'
  );
  if (!highlighted || !plain) {
    throw new Error('Expected highlighted and unhighlighted error events');
  }

  const historyBefore = [...Loxer.history];
  const boxBefore = [...highlighted.lox.box];
  const openLoxesBefore = [...highlighted.lox.openLoxes];
  const propsBefore = [...highlighted.lox.props];
  const template = ErrorLoxRenderer(highlighted.lox, 21);

  expect(Object.keys(template).sort()).toEqual([
    'box',
    'colored',
    'message',
    'module',
    'openLogs',
    'props',
    'stack',
    'time',
    'timeConsumption',
    'timeStamp',
  ]);
  expect(Object.keys(template.colored).sort()).toEqual([
    'box',
    'message',
    'module',
    'openLogs',
    'props',
    'stack',
    'time',
    'timeConsumption',
    'timeStamp',
  ]);
  for (const field of [
    template.module,
    template.message,
    template.timeConsumption,
    template.box,
    template.props,
    template.timeStamp,
    template.time,
    template.stack,
    template.openLogs,
  ]) {
    expect(field).not.toContain('\x1b[');
  }
  for (const field of Object.values(template.colored)) {
    expect(typeof field).toBe('string');
  }
  expect(template.props).toContain("request: 'r-1'");
  expect(template.colored.props).toContain('\x1b[');
  expect(template.stack).not.toBe('');
  expect(template.colored.stack).toBe(template.stack);
  expect(template.openLogs).toContain('open context');

  const plainTemplate = ErrorLoxRenderer(plain.lox);
  expect(plainTemplate.stack).toBe('');
  expect(plainTemplate.openLogs).toBe('');
  expect(plainTemplate.colored.stack).toBe('');
  expect(plainTemplate.colored.openLogs).toBe('');

  expect(Loxer.history).toEqual(historyBefore);
  expect(highlighted.lox.box).toEqual(boxBefore);
  expect(highlighted.lox.openLoxes).toEqual(openLoxesBefore);
  expect(highlighted.lox.props).toEqual(propsBefore);
});

test('an error event owns a history snapshot independent from later logs and consumer mutation', () => {
  const events: LoxerOutputEvent[] = [];
  resetLoxer();
  Loxer.init({ dev: true, output: (event) => events.push(event) });
  events.splice(0);

  Loxer.log('before error');
  Loxer.error(new Error('snapshot error'));
  const error = events.find(
    (event): event is Extract<LoxerOutputEvent, { kind: 'error' }> => event.kind === 'error'
  );
  if (!error) {
    throw new Error('Expected an error event');
  }
  const snapshotMessages = error.history.map((lox) => lox.message);

  Loxer.log('after error');
  expect(snapshotMessages).toEqual(['snapshot error', 'before error', 'Loxer initialized']);
  expect(error.history.map((lox) => lox.message)).toEqual(snapshotMessages);
  expect(Loxer.history.map((lox) => lox.message)).toEqual([
    'after error',
    'snapshot error',
    'before error',
    'Loxer initialized',
  ]);

  error.history.splice(0, error.history.length);
  expect(error.history).toEqual([]);
  expect(Loxer.history.map((lox) => lox.message)).toEqual([
    'after error',
    'snapshot error',
    'before error',
    'Loxer initialized',
  ]);
});
test('Rest', () => {
  Loxer.init({
    dev: false,
    config: { historyCacheSize: 1 },
    output: outputFromCallbacks({ devLog, devError }),
  });
  const l = new Loxes();
  // an unfindable id (NaN) resolves to no open lox
  expect(l.findOpenLox(Number('wrong'))).toBeUndefined();

  const m = new Modules();
  const lox = new Lox({
    highlighted: false,
    id: 0,
    props: [],
    printProps: undefined,
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
