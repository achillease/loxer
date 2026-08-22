import { ANSIFormat, Box, BoxFactory, ErrorLoxRenderer, OutputLoxRenderer } from '../src';
import { Loxes } from '../src/core/runtime/Loxes';
import { renderOpenMessage } from '../src/tracing/TraceMessage';
import { ErrorLox } from '../src/loxes/ErrorLox';
import { OutputLox } from '../src/loxes/OutputLox';
import { ColoredOutputLoxRenderer } from '../src/core/output/OutputRenderer';

/** the time-of-day text `colorLox` marks or greys, read off the lox so no clock is hardcoded */
const timeOf = (lox: OutputLox) => lox.timestamp.toISOString().replace('T', ' ').slice(11, 19);
/** the highlight as it reaches the time field: the grey background, and no `fgTime` grey inside it */
const markedTime = (lox: OutputLox) => `\x1b[48;2;70;70;70m${timeOf(lox)}\x1b[0m`;
const greyTime = (lox: OutputLox) => `\x1b[38;2;70;70;70m${timeOf(lox)}\x1b[0m`;

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
  // the highlight default is an explicit grey background a devtools console renders, not reverse
  // video
  const hl2 = ANSIFormat.colorHighlight('TEXT');
  expect(hl2).toBe('\x1b[48;2;70;70;70mTEXT\x1b[0m');
  const bgError = ANSIFormat.bgError('TEXT');
  expect(bgError).toBe('\x1b[48;2;255;0;0m\x1b[38;2;255;255;255mTEXT\x1b[0m');
});

test('lox coloring', () => {
  const log1 = ANSIFormat.colorLox(lox1);
  expect(log1.message).toBe('\x1b[38;2;180;255;180mLox1!\x1b[0m');
  expect(log1.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log1.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  // lox2 is highlighted, at level 'info' and type 'single' - no severity color applies, so a
  // highlighted log's message carries no color or highlight at all: the highlight lives on the
  // time field only, which is the one field every log carries
  const log2 = ANSIFormat.colorLox(lox2);
  expect(log2.message).toBe('Lox2!');
  expect(log2.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log2.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  expect(log2.time).toBe(markedTime(lox2));
  lox3.highlighted = true;
  lox3.module.color = '#fff';
  lox3.module.slicedName = 'Module';
  lox3.setTime(123);
  const log3 = ANSIFormat.colorLox(lox3, { moduleOpacity: 0.6 });
  // an ErrorLox's message is built from its own error prefix regardless of `highlighted` - the
  // highlight never competed for it, before or after this change
  expect(log3.message).toBe(
    '\x1b[48;2;255;0;0m\x1b[38;2;255;255;255mError\x1b[0m: \x1b[38;2;255;0;0mLox1!\x1b[0m'
  );
  expect(log3.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  // ... and its module column renders at the given opacity, unmarked - the mark is on the time
  expect(log3.moduleText).toBe('\x1b[38;2;153;153;153mModule\x1b[0m');
  expect(log3.time).toBe(markedTime(lox3));
  // a `'warn'` level log is colored from its own level, inside a box as much as outside one
  const log4 = ANSIFormat.colorLox(lox4);
  expect(log4.message).toBe('\x1b[38;2;255;165;15mLox4!\x1b[0m');
  expect(log4.timeConsumption).toBe('\x1b[38;2;70;70;70m[123ms]\x1b[0m');
  expect(log4.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
});

test('lox coloring accepts per-destination highlight and severity colors', () => {
  // a configured `highlightColor` overrides the default grey on the time field, never the message
  // or the module column - both stay untouched by the highlight either way
  const configuredHighlight = ANSIFormat.colorLox(lox2, { colors: { highlightColor: '#123' } });
  expect(configuredHighlight.time).toBe(`\x1b[48;2;17;34;51m${timeOf(lox2)}\x1b[0m`);
  expect(configuredHighlight.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  expect(configuredHighlight.message).toBe('Lox2!');
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

test('colorHighlight falls back to the default grey when given an empty-string color, exactly like no color at all, while a named color still wins', () => {
  // an empty string fails `isNES`, so it never reaches `Color()` - it takes the same default grey
  // path a call with no color argument at all takes, instead of throwing out of an unparseable
  // color
  expect(ANSIFormat.colorHighlight('TEXT', '')).toBe(ANSIFormat.colorHighlight('TEXT'));
  expect(ANSIFormat.colorHighlight('TEXT', '')).toBe('\x1b[48;2;70;70;70mTEXT\x1b[0m');
  // a genuinely named color is unaffected by the empty-string fallback path
  expect(ANSIFormat.colorHighlight('TEXT', 'red')).toBe('\x1b[48;2;255;0;0mTEXT\x1b[0m');
});

test('a highlighted log renders instead of throwing when colors.highlightColor is configured as an empty string', () => {
  expect(() => ANSIFormat.colorLox(lox2, { colors: { highlightColor: '' } })).not.toThrow();
  // the empty string falls back to the same default grey an omitted `highlightColor` renders
  expect(ANSIFormat.colorLox(lox2, { colors: { highlightColor: '' } }).time).toBe(
    ANSIFormat.colorLox(lox2).time
  );
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

test('a column-free close renders closeEdge + closeEnd even though it holds no buffer slot', () => {
  // a column-free box never occupies a buffer slot, so `getOfLogBox`'s ordinary loop never finds
  // it - the close-side branch supplies the edge the loop can't
  const loxes = new Loxes();
  const closeLox = new OutputLox({
    highlighted: false,
    id: 9,
    level: 'info',
    message: 'done',
    moduleId: 'Module',
    type: 'close',
    props: [],
    printProps: undefined,
    columnFree: true,
  });
  closeLox.module.color = '#fff';

  const box = BoxFactory.getOfLogBox(closeLox, loxes);
  expect(BoxFactory.getBoxString(box, { colored: false })).toBe('╰→ ');
});

test('a column-free single/member log renders no edge of its own - only the trailing horizontal', () => {
  const loxes = new Loxes();
  const singleLox = new OutputLox({
    highlighted: false,
    id: 9,
    level: 'info',
    message: 'member',
    moduleId: 'Module',
    type: 'single',
    props: [],
    printProps: undefined,
    columnFree: true,
  });
  singleLox.module.color = '#fff';

  const box = BoxFactory.getOfLogBox(singleLox, loxes);
  expect(BoxFactory.getBoxString(box, { colored: false })).toBe('─ ');
});

// highlighting composes with severity: each level and a close line keep their own message color,
// beside a time field the highlight always marks the same way
test.each([
  {
    name: 'a highlighted warning keeps its orange message beside a marked time field',
    configure: (lox: OutputLox) => {
      lox.level = 'warn';
      lox.highlighted = true;
    },
    expectedMessage: '\x1b[38;2;255;165;15mComposed!\x1b[0m',
  },
  {
    name: 'a highlighted close keeps its green message beside a marked time field',
    configure: (lox: OutputLox) => {
      lox.type = 'close';
      lox.highlighted = true;
    },
    expectedMessage: '\x1b[38;2;180;255;180mComposed!\x1b[0m',
  },
])('$name', ({ configure, expectedMessage }) => {
  const lox = new OutputLox({
    highlighted: false,
    id: 0,
    level: 'info',
    message: 'Composed!',
    moduleId: 'Module',
    type: 'single',
    props: [],
    printProps: undefined,
  });
  lox.module.color = '#fff';
  lox.module.slicedName = 'Module';
  configure(lox);

  const colored = ANSIFormat.colorLox(lox);
  expect(colored.message).toBe(expectedMessage);
  expect(colored.time).toBe(markedTime(lox));
  expect(colored.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
});

test('a highlighted error keeps its red badge and red message beside a marked time field', () => {
  const errorLox = new ErrorLox(
    new OutputLox({
      highlighted: true,
      id: 0,
      level: 'error',
      message: 'boom',
      moduleId: 'Module',
      type: 'error',
      props: [],
      printProps: undefined,
    }),
    new Error('boom')
  );
  errorLox.module.color = '#fff';
  errorLox.module.slicedName = 'Module';

  const colored = ANSIFormat.colorLox(errorLox);
  expect(colored.message).toBe(
    '\x1b[48;2;255;0;0m\x1b[38;2;255;255;255mError\x1b[0m: \x1b[38;2;255;0;0mboom\x1b[0m'
  );
  expect(colored.time).toBe(markedTime(errorLox));
  expect(colored.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
});

test('an unhighlighted log is byte-identical to what it renders without any highlighting change: no wrap on any field', () => {
  const lox = new OutputLox({
    highlighted: false,
    id: 0,
    level: 'warn',
    message: 'Plain!',
    moduleId: 'Module',
    type: 'single',
    props: [],
    printProps: undefined,
  });
  lox.module.color = '#fff';
  lox.module.slicedName = 'Module';

  const colored = ANSIFormat.colorLox(lox);
  expect(colored.message).toBe('\x1b[38;2;255;165;15mPlain!\x1b[0m');
  expect(colored.moduleText).toBe('\x1b[38;2;255;255;255mModule\x1b[0m');
  // the time field keeps `fgTime`'s grey foreground, not the highlight's grey background
  expect(colored.time).toBe(greyTime(lox));
  expect(colored.message).not.toContain('48;2;70;70;70');
  expect(colored.moduleText).not.toContain('48;2;70;70;70');
  expect(colored.time).not.toContain('48;2;70;70;70');
});

// `OutputRenderer` darkens a close line's module title to `endTitleOpacity` `0.4` by default. Every
// close-line test above drives `ANSIFormat.colorLox` directly with an explicit `moduleOpacity`, so
// none of them reaches that default - it wants a pin through `ColoredOutputLoxRenderer` itself.
test.each([
  { name: 'omitted', options: {}, opacity: 0.4 },
  { name: 'a destination-configured value', options: { endTitleOpacity: 0.7 }, opacity: 0.7 },
] as const)(
  "ColoredOutputLoxRenderer darkens a close line's module title to endTitleOpacity ($opacity) when the option is $name",
  ({ options, opacity }) => {
    const closeLox = new OutputLox({
      highlighted: false,
      id: 0,
      level: 'info',
      message: 'close message',
      moduleId: 'Module',
      type: 'close',
      props: [],
      printProps: undefined,
    });
    closeLox.module.color = '#fff';
    closeLox.module.slicedName = 'Module';

    const rendered = ColoredOutputLoxRenderer(closeLox, 0, options);
    // computed independently through the public `colorLox` entry point with an explicit
    // `moduleOpacity`, rather than a hardcoded ANSI literal
    expect(rendered.module).toBe(ANSIFormat.colorLox(closeLox, { moduleOpacity: opacity }).moduleText);
  }
);

test("ColoredOutputLoxRenderer never darkens an 'open' or 'single' line, whatever endTitleOpacity names", () => {
  const openLox = new OutputLox({
    highlighted: false,
    id: 0,
    level: 'info',
    message: 'open message',
    moduleId: 'Module',
    type: 'open',
    props: [],
    printProps: undefined,
  });
  openLox.module.color = '#fff';
  openLox.module.slicedName = 'Module';

  const rendered = ColoredOutputLoxRenderer(openLox, 0, { endTitleOpacity: 0.1 });
  expect(rendered.module).toBe(ANSIFormat.colorLox(openLox, { moduleOpacity: 1 }).moduleText);
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
    // a highlighted log with no severity of its own (level 'info', type 'single') carries no
    // message color at all - the highlight lives on the time field instead
    name: 'a highlighted message with no severity of its own',
    configure: (lox: OutputLox) => {
      lox.highlighted = true;
    },
    prefix: '',
  },
  {
    // highlighting composes with severity: a highlighted warning keeps its own orange message,
    // exactly like an unhighlighted one
    name: 'a highlighted warning message',
    configure: (lox: OutputLox) => {
      lox.highlighted = true;
      lox.level = 'warn';
    },
    prefix: '\x1b[38;2;255;165;15m',
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
  expect(ANSIFormat.colorLox(lox2).message).toBe('Lox2!');
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
