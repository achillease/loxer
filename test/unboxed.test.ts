import { Loxer, resetLoxer } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';

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

beforeEach(() => {
  Loxer.init({
    dev: true,
    callbacks: {
      devError,
      devLog,
      prodError,
      prodLog,
    },
    defaultLevels: {
      devLevel: 2,
      prodLevel: 0,
    },
    modules: {
      TEST: { color: '#ff0', devLevel: 1, prodLevel: 0, fullName: 'TestModule' },
      MUTE: { color: '#f0f', devLevel: 0, prodLevel: 0, fullName: 'Muted' },
    },
    config: {
      moduleTextSlice: 10,
      historyCacheSize: 50,
    },
  });
});

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

test('getModuleLevel', () => {
  expect(Loxer.getModuleLevel('TEST')).toBe(1);
});

test('logging', () => {
  Loxer.log('test log');
  expect(devLogs.length).toBe(2);
  expect(devLogs[1].message).toBe('test log');
  expect(devLogs[1].type).toBe('single');

  Loxer.log('second log');
  expect(devLogs.length).toBe(3);
  expect(devLogs[2].message).toBe('second log');
});

test('highlight', () => {
  Loxer.highlight().log('highlighted log');
  expect(devLogs[1].message).toBe('highlighted log');
  expect(devLogs[1].highlighted).toBeTruthy();

  Loxer.h().log('h log');
  expect(devLogs[2].message).toBe('h log');
  expect(devLogs[2].highlighted).toBeTruthy();
});

test('level', () => {
  Loxer.log('shown level 1 log');
  Loxer.log('shown automatic level 1 log');
  Loxer.level(2).log('shown level 2 log');
  Loxer.l(3).log('hidden level 3 log');

  expect(devLogs.length).toBe(4);

  expect(devLogs[1].message).toBe('shown level 1 log');
  expect(devLogs[1].level).toBe(1);

  expect(devLogs[2].message).toBe('shown automatic level 1 log');
  expect(devLogs[2].level).toBe(1);

  expect(devLogs[3].message).toBe('shown level 2 log');
  expect(devLogs[3].level).toBe(2);

  expect(devLogs.length).toBe(4);
  expect(devLogs[devLogs.length - 1].message).not.toBe('hidden level 3 log');
});

test('modules', () => {
  Loxer.log('automatic NONE module log');
  Loxer.module().log('automatic DEFAULT module log');
  Loxer.module('veryWrong').log('automatic INVALID module log');
  Loxer.m('TEST').log('Testmodule log');
  Loxer.module('TEST').log('Testmodule log');

  expect(devLogs.length).toBe(6);

  expect(devLogs[1].moduleId).toBe('NONE');
  expect(devLogs[1].moduleText).toBe('');

  expect(devLogs[2].moduleId).toBe('DEFAULT');
  expect(devLogs[2].moduleText).toBe('            ');

  expect(devLogs[3].moduleId).toBe('INVALID');
  expect(devLogs[3].moduleText).toBe('INVALIDMOD: ');

  expect(devLogs[4].moduleId).toBe('TEST');
  expect(devLogs[4].moduleText).toBe('TestModule: ');

  expect(devLogs[5].moduleId).toBe('TEST');
  expect(devLogs[5].moduleText).toBe('TestModule: ');
});

test('errors', () => {
  Loxer.error('string error');
  Loxer.error(404);
  Loxer.error(false);
  Loxer.error({ name: 'ObjectError' });
  Loxer.error(new RangeError('this is a predefined error'));

  expect(devLogs.length).toBe(1);
  expect(devErrors.length).toBe(5);

  expect(devErrors[0].type).toBe('error');
  expect(devErrors[0].error).toBeInstanceOf(Error);
  expect(devErrors[0].error.message).toStrictEqual(devErrors[0].message);
  expect(devErrors[0].error.message).toBe('string error');
  expect(devErrors[0].error.name).toBe('Error');

  expect(devErrors[1].type).toBe('error');
  expect(devErrors[1].error).toBeInstanceOf(Error);
  expect(devErrors[1].error.message).toStrictEqual(devErrors[1].message);
  expect(JSON.parse(devErrors[1].error.message)).toBe(404);
  expect(devErrors[1].error.name).toBe('Error');

  expect(devErrors[2].type).toBe('error');
  expect(devErrors[2].error).toBeInstanceOf(Error);
  expect(JSON.parse(devErrors[2].error.message)).toBe(false);
  expect(devErrors[2].error.name).toBe('Error');

  expect(devErrors[3].type).toBe('error');
  expect(devErrors[3].error).toBeInstanceOf(Error);
  expect(devErrors[3].error.message).toStrictEqual(devErrors[3].message);
  expect(JSON.parse(devErrors[3].error.message)).toStrictEqual({ name: 'ObjectError' });
  expect(devErrors[3].error.name).toBe('Error');

  expect(devErrors[4].type).toBe('error');
  expect(devErrors[4].error).toBeInstanceOf(Error);
  expect(devErrors[4].error.message).toStrictEqual(devErrors[4].message);
  expect(devErrors[4].error.message).toBe('this is a predefined error');
  expect(devErrors[4].error.name).toBe('RangeError');
});

test('mixed', () => {
  Loxer.h().m().l(2).log('1');
  Loxer.h().l(2).m().log('2');
  Loxer.m().h().l(2).log('3');
  Loxer.m().l(2).h().log('4');
  Loxer.l(2).h().m().log('5');
  Loxer.l(2).m().h().log('6');

  expect(devLogs.length).toBe(7);
  for (let i = 1; i < devLogs.length; i++) {
    const log = devLogs[i];
    expect(log.message).toBe(i.toString());
    expect(log.highlighted).toBeTruthy();
    expect(log.moduleId).toBe('DEFAULT');
    expect(log.level).toBe(2);
  }
});

test('history', () => {
  Loxer.log('single log');
  Loxer.h().log('highlight log');
  Loxer.error('error log');
  Loxer.l(2).log('level log');
  Loxer.l(3).log('hidden level log');
  Loxer.m('TEST').log('module log');
  Loxer.error('error log 2');

  expect(devLogs.length).toBe(5);
  expect(devErrors.length).toBe(2);

  expect(Loxer.history.length).toBe(7);
  expect(histories.length).toBe(2);
  expect(histories[0].length).toBeGreaterThanOrEqual(4);
  expect(histories[1].length).toBeGreaterThanOrEqual(7);

  // history is newest-first: the most recent log is index 0, the init log is last
  expect(Loxer.history[0].message).toBe('error log 2');
  expect(Loxer.history[Loxer.history.length - 1].message).toBe('Loxer initialized');
  // the hidden (leveled-out) log must not enter history
  expect(Loxer.history.some((l) => l.message === 'hidden level log')).toBe(false);
});

test('one-shot modifiers reset after each log', () => {
  // DEFAULT module (devLevel 2) so the level-2 modified log is visible
  Loxer.h().m().l(2).log('modified');
  const modified = devLogs[devLogs.length - 1];
  expect(modified.message).toBe('modified');
  expect(modified.highlighted).toBe(true);
  expect(modified.moduleId).toBe('DEFAULT');
  expect(modified.level).toBe(2);

  // the next bare log must fall back to the defaults, proving the modifiers were reset
  Loxer.log('plain');
  const plain = devLogs[devLogs.length - 1];
  expect(plain.message).toBe('plain');
  expect(plain.highlighted).toBe(false);
  expect(plain.moduleId).toBe('NONE');
  expect(plain.level).toBe(1);
});

test('a module with devLevel 0 is fully muted', () => {
  Loxer.m('MUTE').log('hidden 1');
  Loxer.m('MUTE').l(1).log('hidden 2');
  // only the init log made it through; the MUTE logs are fully suppressed
  expect(devLogs.length).toBe(1);
  expect(devLogs.some((l) => l.moduleId === 'MUTE')).toBe(false);
  expect(Loxer.history.some((l) => l.moduleId === 'MUTE')).toBe(false);
});
