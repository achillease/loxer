import { outputFromCallbacks } from './output-capture';
import { vi } from 'vitest';
import { clearRealmSlot } from '../src/core/Realm';
import type { ErrorLox, OutputLox } from '../src/loxes';

// mock console: an instance without callbacks renders to the console fallback, and the pre-init
// queue reports itself through console.warn
global.console.log = vi.fn();
global.console.error = vi.fn();
global.console.warn = vi.fn();

/** the module that holds the singleton and its reset function */
type LoxerModule = typeof import('../src/Loxer');

let copies: LoxerModule[] = [];
let devLogs: OutputLox[] = [];
let devErrors: ErrorLox[] = [];

function devLog(log: OutputLox) {
  devLogs.push(log);
}
function devError(log: ErrorLox) {
  devErrors.push(log);
}

/** Loads another copy of Loxer's whole module graph.
 *
 * `vi.resetModules()` empties the module registry while `globalThis` survives it, which is exactly
 * the reported condition: a bundler emitting a second shared chunk for `loxer` and `loxer/trace`,
 * a second module registry, or mixed CJS/ESM resolution all produce a second evaluation of
 * `src/Loxer.ts` inside one realm. No bundler is needed to reproduce it.
 */
async function loadCopy(): Promise<LoxerModule> {
  vi.resetModules();
  const copy = await import('../src/Loxer');
  copies.push(copy);

  return copy;
}

afterEach(() => {
  // every copy shares one instance, so resetting through any of them resets the one there is
  copies.at(-1)?.resetLoxer();
  copies = [];
  devLogs = [];
  devErrors = [];
  (console.warn as ReturnType<typeof vi.fn>).mockClear();
  // a realm slot deliberately outlives a module-registry reset, so a suite that wants a genuinely
  // new instance has to say so - otherwise this file would hand an initialized instance on
  clearRealmSlot('instance');
});

test('two copies of the module resolve to one instance', async () => {
  const a = await loadCopy();
  const b = await loadCopy();

  // both really are separate evaluations: each built its own exported function objects
  expect(b).not.toBe(a);
  expect(b.resetLoxer).not.toBe(a.resetLoxer);
  // ...over one logger, because the instance lives in a realm slot and not in the module
  expect(b.Loxer).toBe(a.Loxer);
});

test('a log written through the second copy reaches the callbacks and history of the first', async () => {
  const a = await loadCopy();
  const b = await loadCopy();

  a.Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
  b.Loxer.log('written through copy B');

  // without the shared slot this log would sit in copy B's pre-init queue forever - the reported bug
  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized', 'written through copy B']);
  // history is newest first
  expect(a.Loxer.history[0].message).toBe('written through copy B');
});

test('a module registered through one copy is known to the other', async () => {
  const a = await loadCopy();
  const b = await loadCopy();

  a.Loxer.init({
    dev: true,
    output: outputFromCallbacks({ devLog, devError }),
    modules: { DB: { color: '#0ff', devLevel: 'debug', prodLevel: 'error', fullName: 'Database' } },
  });

  expect(b.Loxer.getModuleLevel('DB')).toBe('debug');
  b.Loxer.m('DB').debug('debug through copy B');
  // a 'debug' log only survives against the module table copy A supplied
  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized', 'debug through copy B']);
  expect(devLogs[1].moduleId).toBe('DB');
});

test('boxes opened through different copies get distinct ids and each close finds its own box', async () => {
  const a = await loadCopy();
  const b = await loadCopy();
  a.Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

  // interleaved, so a module-scoped id counter would hand both copies the same numbers into the
  // one shared `_loxes` map
  const opened = [
    a.Loxer.open('open A1'),
    b.Loxer.open('open B1'),
    a.Loxer.open('open A2'),
    b.Loxer.open('open B2'),
  ];
  const ids = opened.map((box) => box.id);

  expect(new Set(ids).size).toBe(4);

  devLogs = [];
  a.Loxer.of(opened[0]).close('close A1');
  b.Loxer.of(opened[1]).close('close B1');
  a.Loxer.of(opened[2]).close('close A2');
  b.Loxer.of(opened[3]).close('close B2');

  // a close whose opening log cannot be found is reported as an error instead of a close log, so an
  // id collision surfaces here rather than silently
  expect(devErrors).toEqual([]);
  expect(devLogs.map((l) => l.message)).toEqual(['close A1', 'close B1', 'close A2', 'close B2']);
  expect(devLogs.map((l) => l.type)).toEqual(['close', 'close', 'close', 'close']);
  expect(devLogs.map((l) => l.id)).toEqual(ids);
  // a time consumption is only computed when the close resolved its own opening log
  expect(devLogs.every((l) => l.timeConsumption !== undefined)).toBe(true);
});

test('an id counter shared by both copies keeps counting up across them', async () => {
  const a = await loadCopy();
  const b = await loadCopy();
  a.Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });

  const first = a.Loxer.open('open through A').id;
  const second = b.Loxer.open('open through B').id;
  const third = a.Loxer.open('open through A again').id;

  // one counter on one instance: the copy that asks is irrelevant
  expect(second).toBe(first + 1);
  expect(third).toBe(second + 1);
});

test('resetLoxer resets the instance in place, so a held reference observes it', async () => {
  const a = await loadCopy();
  const L = a.Loxer;
  L.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
  L.log('before the reset');
  expect(L.history.length).toBe(2);

  a.resetLoxer();

  // the point of resetting in place: a rebinding reset would leave `L` pointing at the old instance
  expect(L.history).toEqual([]);
  // and the reset instance is still the realm's instance, so a later copy resolves the same object
  const c = await loadCopy();
  expect(c.Loxer).toBe(L);

  // the held reference works against the re-initialized instance too
  devLogs = [];
  c.Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
  L.log('after the re-init');
  expect(devLogs.map((l) => l.message)).toEqual(['Loxer initialized', 'after the re-init']);
});

test('resetLoxer through one copy is observed by the other', async () => {
  const a = await loadCopy();
  const b = await loadCopy();
  a.Loxer.init({ dev: true, output: outputFromCallbacks({ devLog, devError }) });
  a.Loxer.log('before the reset');

  b.resetLoxer();

  expect(a.Loxer.history).toEqual([]);
  devLogs = [];
  // the reset put the shared instance back into its pre-init state: this log is queued, not output
  a.Loxer.log('after the reset');
  expect(devLogs).toEqual([]);
});
