import { ANSIFormat, Box, BoxFactory, ErrorLoxRenderer, OutputLoxRenderer } from '../src';
import { Loxes } from '../src/core/Loxes';
import { renderOpenMessage } from '../src/core/TraceMessage';
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

// --- trace-message spans: colored payload, escape-free plain form ------------------------------

// `Checkout.calculate(19.95, 3)` - a `parent.fn(args)` open message, spans and all. Fixed offsets
// (rather than a call into `renderOpenMessage`) so the expected colored string below is not derived
// from the very code under test.
const spanMessage = 'Checkout.calculate(19.95, 3) done';
const spanSpans = [
  { start: 0, end: 8, kind: 'parent' as const },
  { start: 9, end: 18, kind: 'fn' as const },
  { start: 19, end: 24, kind: 'value' as const },
  { start: 26, end: 27, kind: 'value' as const },
];

test.each([
  { name: 'a plain single log', configure: () => {}, prefix: '' },
  {
    name: 'a close message',
    configure: (lox: OutputLox) => {
      lox.type = 'close';
    },
    prefix: '\x1b[38;2;180;255;180m',
  },
  {
    name: 'a warning message',
    configure: (lox: OutputLox) => {
      lox.level = 'warn';
    },
    prefix: '\x1b[38;2;255;165;15m',
  },
  {
    name: 'a highlighted message',
    configure: (lox: OutputLox) => {
      lox.highlighted = true;
    },
    prefix: '\x1b[7m',
  },
])(
  '$name colors each span by its kind (parent -> fgClass, fn -> fgFunction, value -> fgString) and re-emits its own enclosing color after every span',
  ({ configure, prefix }) => {
    const lox = new OutputLox({
      id: 0,
      level: 'info',
      message: spanMessage,
      messageSpans: spanSpans,
      moduleId: 'Module',
      type: 'single',
      props: [],
      printProps: undefined,
      highlighted: false,
    });
    lox.module.color = '#fff';
    lox.module.slicedName = 'Module';
    configure(lox);

    const spans =
      '\x1b[38;2;78;201;176mCheckout\x1b[0m' +
      prefix +
      '.\x1b[38;2;144;237;32mcalculate\x1b[0m' +
      prefix +
      '(\x1b[38;2;18;129;14m19.95\x1b[0m' +
      prefix +
      ', \x1b[38;2;18;129;14m3\x1b[0m' +
      prefix +
      ') done';
    // no span - no wrap at all: with no enclosing color, nothing reverts to the terminal default
    // because there was never anything to revert from
    const expected = prefix.length > 0 ? prefix + spans + '\x1b[0m' : spans;

    expect(ANSIFormat.colorLox(lox).message).toBe(expected);
  }
);

test('a span reaching past the end of the message colors nothing, rather than throwing or corrupting the rest', () => {
  const lox = new OutputLox({
    id: 0,
    level: 'info',
    message: 'short',
    messageSpans: [{ start: 0, end: 999, kind: 'value' }],
    moduleId: 'Module',
    type: 'single',
    props: [],
    printProps: undefined,
    highlighted: false,
  });
  lox.module.color = '#fff';
  lox.module.slicedName = 'Module';

  expect(ANSIFormat.colorLox(lox).message).toBe('short');
});

test('a log with no spans at all is colored exactly as before spans existed', () => {
  expect(ANSIFormat.colorLox(lox2).message).toBe('\x1b[7mLox2!\x1b[0m');
});

test("OutputLoxRenderer keeps the plain message field escape-free while colored.message carries the payload's colors", () => {
  const traceMessage = renderOpenMessage('parent.fn(args)', {
    name: 'calculate',
    resolveParentName: () => 'Checkout',
    args: [19.95, 3],
  });
  const lox = new OutputLox({
    id: 0,
    level: 'info',
    message: traceMessage.text,
    messageSpans: traceMessage.spans,
    moduleId: 'Module',
    type: 'open',
    props: [],
    printProps: undefined,
    highlighted: false,
  });
  lox.module.color = '#fff';
  lox.module.slicedName = 'Module';

  const template = OutputLoxRenderer(lox);

  expect(template.message).toBe('Checkout.calculate(19.95, 3)');
  expect(template.message).not.toMatch(/\x1b/);
  expect(template.colored.message).toContain('\x1b[38;2;78;201;176mCheckout\x1b[0m');
  expect(template.colored.message).toContain('\x1b[38;2;144;237;32mcalculate\x1b[0m');
  expect(template.colored.message).toContain('\x1b[38;2;18;129;14m19.95\x1b[0m');
  expect(template.colored.message).toContain('\x1b[38;2;18;129;14m3\x1b[0m');
});

test("an error's OPEN_LOGS context stays escape-free even where an open box's own message carries colored spans", () => {
  const traceMessage = renderOpenMessage('parent.fn(args)', {
    name: 'calculate',
    resolveParentName: () => 'Checkout',
    args: [19.95, 3],
  });
  const openLox = new OutputLox({
    id: 1,
    level: 'info',
    message: traceMessage.text,
    messageSpans: traceMessage.spans,
    moduleId: 'Module',
    type: 'open',
    props: [],
    printProps: undefined,
    highlighted: false,
  });

  const errorLox = new ErrorLox(
    new OutputLox({
      id: 2,
      level: 'error',
      message: 'boom',
      moduleId: 'Module',
      type: 'error',
      props: [],
      printProps: undefined,
      highlighted: true,
    }),
    new Error('boom')
  );
  errorLox.module.color = '#fff';
  errorLox.module.slicedName = 'Module';
  errorLox.openLoxes = [openLox];

  const template = ErrorLoxRenderer(errorLox);

  expect(template.openLogs).toBe('\nOPEN_LOGS: [Checkout.calculate(19.95, 3)]');
  expect(template.openLogs).not.toMatch(/\x1b/);
  // `ErrorLoxRenderer` never colors `openLogs` at all - the same string reaches both fields
  expect(template.colored.openLogs).toBe(template.openLogs);
});
