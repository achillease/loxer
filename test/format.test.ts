import { ANSIFormat, Box, BoxFactory } from '../src';
import { Loxes } from '../src/core/Loxes';
import { ErrorLox } from '../src/loxes/ErrorLox';
import { OutputLox } from '../src/loxes/OutputLox';

test('foreground coloring', () => {
  const fg = ANSIFormat.colorForeground(100, 100, 100);
  expect(fg).toBe('\x1b[38;2;100;100;100m');
  const fg2 = ANSIFormat.colorForeground(-1, -1, -1);
  expect(fg2).toBe('\x1b[38;2;0;0;0m');
  const fgError = ANSIFormat.fgError('TEXT');
  expect(fgError).toBe('\x1b[38;2;255;0;0mTEXT\x1b[0m');
  const fgWarn = ANSIFormat.fgWarn('TEXT');
  expect(fgWarn).toBe('\x1b[38;2;255;165;15mTEXT\x1b[0m');
  const fgSuccess = ANSIFormat.fgSuccess('TEXT');
  expect(fgSuccess).toBe('\x1b[38;2;20;200;0mTEXT\x1b[0m');
  const fgTime = ANSIFormat.fgTime('TEXT');
  expect(fgTime).toBe('\x1b[38;2;70;70;70mTEXT\x1b[0m');
  const fgCloseLog = ANSIFormat.fgCloseLog('TEXT');
  expect(fgCloseLog).toBe('\x1b[38;2;180;255;180mTEXT\x1b[0m');
  const colorized = ANSIFormat.colorize('TEXT', '');
  expect(colorized).toBe('\x1b[38;2;255;255;255mTEXT\x1b[0m');
});

test('background coloring', () => {
  const bg = ANSIFormat.colorBackground(256, 256, 256);
  expect(bg).toBe('\x1b[48;2;255;255;255m');
  const hl = ANSIFormat.colorHighlight('TEXT', '#647');
  expect(hl).toBe('\x1b[48;2;102;68;119mTEXT\x1b[0m');
  const hl2 = ANSIFormat.colorHighlight('TEXT');
  expect(hl2).toBe('\x1b[7mTEXT\x1b[0m');
  const bgError = ANSIFormat.bgError('TEXT');
  expect(bgError).toBe('\x1b[48;2;255;0;0m\x1b[38;2;255;255;255mTEXT\x1b[0m');
});

test('lox coloring', () => {
  const log1 = ANSIFormat.colorLox(lox1);
  expect(log1.message).toBe('\x1b[38;2;180;255;180mLox1!\x1b[0m');
  expect(log1.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log1.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  const log2 = ANSIFormat.colorLox(lox2);
  expect(log2.message).toBe('\x1b[7mLox2!\x1b[0m');
  expect(log2.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log2.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  lox3.highlighted = true;
  lox3.module.color = '#fff';
  lox3.module.slicedName = 'Module';
  lox3.setTime(123);
  const log3 = ANSIFormat.colorLox(lox3, { moduleOpacity: 0.6 });
  expect(log3.message).toBe(
    '\x1b[48;2;255;0;0m\x1b[38;2;255;255;255mError\x1b[0m: \x1b[38;2;255;0;0mLox1!\x1b[0m'
  );
  expect(log3.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log3.moduleText).toBe('\x1b[38;2;153;153;153mModule\x1b[0m');
  // a `'warn'` level log is colored from its own level, inside a box as much as outside one
  const log4 = ANSIFormat.colorLox(lox4);
  expect(log4.message).toBe('\x1b[38;2;255;165;15mLox4!\x1b[0m');
  expect(log4.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log4.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
});

test('lox coloring accepts per-destination highlight and severity colors', () => {
  expect(ANSIFormat.colorLox(lox2, { colors: { highlightColor: '#123' } }).message).toBe(
    '\x1b[48;2;17;34;51mLox2!\x1b[0m'
  );
  expect(ANSIFormat.colorLox(lox4, { colors: { warnColor: '#010203' } }).message).toBe(
    '\x1b[38;2;1;2;3mLox4!\x1b[0m'
  );
  expect(
    ANSIFormat.colorLox(lox3, {
      colors: {
        errorColor: '#040506',
        errorNameBackgroundColor: '#070809',
        errorNameColor: '#0a0b0c',
      },
    }).message
  ).toBe('\x1b[48;2;7;8;9m\x1b[38;2;10;11;12mError\x1b[0m: \x1b[38;2;4;5;6mLox1!\x1b[0m');
});

test('BoxLayout', () => {
  const loxes = new Loxes();
  loxes.proceedOpenLox(lox0);
  lox1.hidden = true;
  const box1 = BoxFactory.getLogBox(lox1, loxes);

  BoxFactory.getOpenLogBox(lox0, loxes);
  lox0.moduleId = 'INVALID';
  BoxFactory.getOpenLogBox(lox0, loxes);
  const boxx: Box = ['empty', { box: 'vertical', color: 'red', boxLayout: 'round' }];

  const bs0 = BoxFactory.getBoxString(boxx, { colored: true });
  const bs1 = BoxFactory.getBoxString(boxx, { colored: false });
  const bs2 = BoxFactory.getBoxString(box1, { colored: false });
  // colored variant wraps the same glyph as the plain one in ANSI color codes
  expect(bs0).toContain('│');
  expect(bs0).toContain('\x1b[');
  expect(bs0).not.toBe(bs1);
  expect(bs1).toBe(' │ ');
  expect(bs2).toBe('');
});

// loxes
const lox0 = new OutputLox({
  highlighted: false,
  id: 0,
  level: 'info',
  message: 'Lox1!',
  moduleId: 'Module',
  type: 'open',
  props: [],
  printProps: undefined,
});
lox0.module.color = '#fff';
lox0.module.slicedName = 'Module';
lox0.setTime(123);

const lox1 = new OutputLox({
  highlighted: false,
  id: 0,
  level: 'info',
  message: 'Lox1!',
  moduleId: 'Module',
  type: 'close',
  props: [],
  printProps: undefined,
});
lox1.module.color = '#fff';
lox1.module.slicedName = 'Module';
lox1.setTime(123);

const lox2 = new OutputLox({
  highlighted: true,
  id: 0,
  level: 'info',
  message: 'Lox2!',
  moduleId: 'Module',
  type: 'single',
  props: [],
  printProps: undefined,
});
lox2.module.color = '#fff';
lox2.module.slicedName = 'Module';
lox2.setTime(123);

const lox3 = new ErrorLox(lox1, new Error());

const lox4 = new OutputLox({
  highlighted: false,
  id: 0,
  level: 'warn',
  message: 'Lox4!',
  moduleId: 'Module',
  type: 'single',
  props: [],
  printProps: undefined,
});
lox4.module.color = '#fff';
lox4.module.slicedName = 'Module';
lox4.setTime(123);
