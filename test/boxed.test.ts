import { Loxer, resetLoxer } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';

let devLogs: OutputLox[] = [];
function devLog(log: OutputLox) {
  devLogs.push(log);
  devOut.push(log);
}
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let devErrors: ErrorLox[] = [];
function devError(log: ErrorLox, history: (OutputLox | ErrorLox)[]) {
  devErrors.push(log);
  devOut.push(log);
  histories.push(history);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox, history: (OutputLox | ErrorLox)[]) {
  prodErrors.push(log);
  histories.push(history);
}
let histories: (OutputLox | ErrorLox)[][] = [];
let devOut: (OutputLox | ErrorLox)[] = [];

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
      devLevel: 'info',
      prodLevel: 'error',
    },
    modules: {
      ONE: { color: '#ff0', devLevel: 'info', prodLevel: 'error', fullName: 'Module 1' },
      TWO: { color: '#00f', devLevel: 'debug', prodLevel: 'error', fullName: 'Module 2' },
    },
    config: {
      moduleTextSlice: 10,
      historyCacheSize: 50,
    },
  });
});

afterEach(() => {
  devOut = [];
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

// Testing function ###########################################################

function checkBoxes(expected: string[]) {
  expect(devOut.length).toBe(expected.length + 1);
  expect(devOut[0].message).toBe('Loxer initialized');
  expect(devOut[0].type).toBe('single');
  expect(devOut[0].moduleId).toBe('NONE');

  for (let i = 0; i < expected.length; i++) {
    const log = devOut[i + 1];
    const message = log.message;
    const type = log.type;
    const mod = log.moduleId;
    const box = log.box
      .map((seg) => {
        if (seg === 'empty') {
          return ' ';
        }
        switch (seg.box) {
          case 'vertical':
            return '|';
          case 'closeEnd':
          case 'openEnd':
          case 'horizontal':
            return '-';
          case 'cross':
            return 'x';
          case 'closeEdge':
            return '>';
          case 'openEdge':
            return '<';
          case 'single':
            return 'T';
          default:
            return '';
        }
      })
      .join('');
    expect(type + '.' + mod + '.' + box + message).toBe(expected[i]);
  }
}

// TESTS ######################################################################

test('simple boxing', () => {
  const id = Loxer.open('open');
  Loxer.of(id).add('add');
  Loxer.of(id).error('error');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(4);
  expect(devErrors.length).toBe(1);
  expect(devErrors[0].error).toBeInstanceOf(Error);
  expect(devErrors[0].error.message).toStrictEqual(devErrors[0].message);
  expect(devErrors[0].error.name).toBe('Error');

  /* 
  ╭← open
  ├─ add
  ├─ Error: error
  ╰→ close
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'single.DEFAULT.T-add',
    'error.DEFAULT.T-error',
    'close.DEFAULT.>-close',
  ]);
});

test('false boxing', () => {
  const id = Loxer.open('open');
  Loxer.of(id).close('close');
  Loxer.of(id).add('add');
  Loxer.of(id).error('error');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(3);
  expect(devErrors.length).toBe(3);
  expect(devErrors[0].error).toBeInstanceOf(Error);
  expect(devErrors[0].error.message).toStrictEqual('add');
  expect(devErrors[0].error.name).toBe('LoxerError');
  expect(devErrors[1].error).toBeInstanceOf(Error);
  expect(devErrors[1].error.message).toStrictEqual('error');
  expect(devErrors[1].error.name).toBe('Error');
  expect(devErrors[2].error).toBeInstanceOf(Error);
  expect(devErrors[2].error.message).toStrictEqual('close');
  expect(devErrors[2].error.name).toBe('LoxerError');

  /* 
  ╭← open
  ├─ add
  ├─ Error: error
  ╰→ close
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'close.DEFAULT.>-close',
    'error.NONE.add() on a not (anymore) existing Lox. MESSAGE: add',
    'error.NONE.error() on a not (anymore) existing Lox. ERROR: error',
    'error.NONE.close() on a not (anymore) existing Lox. MESSAGE: close',
  ]);
});

test('sequential boxing', () => {
  const id1 = Loxer.open('open');
  Loxer.of(id1).add('add');
  Loxer.of(id1).error('error');
  Loxer.of(id1).close('close');
  const id2 = Loxer.open('open2');
  Loxer.of(id2).add('add2');
  Loxer.of(id2).close('close2');
  /* 
  ╭← open
  ├─ add
  ├─ Error: error
  ╰→ close
  ╭← open2
  ├─ add2
  ╰→ close2
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'single.DEFAULT.T-add',
    'error.DEFAULT.T-error',
    'close.DEFAULT.>-close',
    'open.DEFAULT.<-open2',
    'single.DEFAULT.T-add2',
    'close.DEFAULT.>-close2',
  ]);
});

test('nested boxing', () => {
  const id1 = Loxer.open('open');
  const id2 = Loxer.open('open2');
  Loxer.of(id2).add('add2');
  Loxer.of(id2).close('close2');
  Loxer.of(id1).add('add');
  Loxer.of(id1).error('error');
  Loxer.of(id1).close('close');
  /* 
  ╭← open
  │╭← open2
  │├─ add2
  │╰→ close2
  ├─ add
  ├─ Error: error
  ╰→ close
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'open.DEFAULT.|<-open2',
    'single.DEFAULT.|T-add2',
    'close.DEFAULT.|>-close2',
    'single.DEFAULT.T-add',
    'error.DEFAULT.T-error',
    'close.DEFAULT.>-close',
  ]);
});

test('async boxing', () => {
  const id1 = Loxer.open('open');
  Loxer.of(id1).add('add');
  const id2 = Loxer.open('open2');
  Loxer.of(id1).error('error');
  Loxer.of(id2).add('add2');
  Loxer.of(id1).close('close');
  Loxer.of(id2).close('close2');
  /*
  ╭← open
  ├─ add
  │╭← open2
  ├┆─ Error: error
  │├─ add2
  ╰┆→ close
   ╰→ close2
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'single.DEFAULT.T-add',
    'open.DEFAULT.|<-open2',
    'error.DEFAULT.Tx-error',
    'single.DEFAULT.|T-add2',
    'close.DEFAULT.>x-close',
    'close.DEFAULT. >-close2',
  ]);
});

test('highlighting', () => {
  const id = Loxer.h().open('open');
  Loxer.h().of(id).close('close');

  expect(devLogs.length).toBe(3);
  expect(devLogs[1].highlighted).toBeTruthy();
  expect(devLogs[2].highlighted).toBeTruthy();

  /* 
  ╭← open
  ╰→ close
  */
  checkBoxes(['open.DEFAULT.<-open', 'close.DEFAULT.>-close']);
});

test('leveling', () => {
  // the DEFAULT module is at devLevel 'info', so 'debug' is the hidden end here
  const id1 = Loxer.open('open');
  const id2 = Loxer.debug.open('open2');
  // append to a hidden box at a level the module does show: the log is written, without a marker
  Loxer.of(id2).info('add2');
  // auto 'debug'
  Loxer.of(id2).close('close2');
  Loxer.of(id1).debug('add');
  // no leveling on errors
  Loxer.of(id1).error('error');
  Loxer.of(id1).close('close');

  expect(devLogs.length).toBe(4);
  expect(devErrors.length).toBe(1);

  // the visible logs keep the levels they were emitted at ...
  expect(devLogs[1].message).toBe('open');
  expect(devLogs[1].level).toBe('info');
  expect(devLogs[2].message).toBe('add2');
  expect(devLogs[2].level).toBe('info');
  // ... and `close` inherits its open's level rather than its own default
  expect(devLogs[3].message).toBe('close');
  expect(devLogs[3].level).toBe('info');
  expect(devErrors[0].level).toBe('error');

  // hidden (leveled-out) logs must not enter history; init, open, add2, error and close remain
  expect(Loxer.history.length).toBe(5);
  for (const hidden of ['open2', 'close2', 'add']) {
    expect(Loxer.history.some((l) => l.message === hidden)).toBe(false);
  }

  /*
  ╭← open
//│╭← open2        [UNLEVELLED]
  │─ add2          [LEVELED but shown - its box reserved no column]
//│╰→ close2       [UNLEVELLED automatically]
//├─ add           [UNLEVELLED]
  ├─ Error: error  [LEVELED but shown! ]
  ╰→ close
  */
  checkBoxes([
    'open.DEFAULT.<-open',
    'single.DEFAULT.|-add2',
    'error.DEFAULT.T-error',
    'close.DEFAULT.>-close',
  ]);
});

test('of(id).add inherits the box level, of(id).close always matches its open', () => {
  // module TWO is at devLevel 'debug', so the whole box stays visible
  const id = Loxer.m('TWO').debug.open('open');
  Loxer.of(id).add('add');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(4);
  expect(devLogs[1].level).toBe('debug');
  // `add` is NOT the `Loxer.log()` ≡ `info` alias - it inherits
  expect(devLogs[2].level).toBe('debug');
  // `close` takes no level at all and is always the open's
  expect(devLogs[3].level).toBe('debug');
});

test('an explicit level on an added log is reported as given, either way along the list', () => {
  const id = Loxer.m('TWO').open('open');
  Loxer.of(id).debug('further down');
  Loxer.of(id).warn('further up');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(5);
  expect(devLogs[1].level).toBe('info');
  // further down the list than the box
  expect(devLogs[2].level).toBe('debug');
  // further up than the box: still the caller's own level, not the box's
  expect(devLogs[3].level).toBe('warn');
  // close names no level and takes the open's
  expect(devLogs[4].level).toBe('info');
});

test('a log that outranks its hidden box is written without box membership', () => {
  // module ONE is at devLevel 'info', so a 'debug' box never reaches the output ...
  const id = Loxer.m('ONE').debug.open('open');
  // ... but a log ONE would show on its own is not dropped for sitting inside that box
  Loxer.of(id).warn('warn inside a hidden box');
  Loxer.of(id).error('error inside a hidden box');
  Loxer.of(id).close('close');

  expect(devLogs.length).toBe(2);
  expect(devLogs[1].level).toBe('warn');
  expect(devLogs[1].hidden).toBe(false);
  expect(Loxer.history.some((l) => l.message === 'warn inside a hidden box')).toBe(true);
  // the box reserved no column, so neither the warning nor the error draws a marker of its own -
  // and `open` / `close`, both at the box's own 'debug', stay hidden as a pair
  checkBoxes(['single.ONE.-warn inside a hidden box', 'error.ONE.-error inside a hidden box']);
});

test('a log added to a visible box keeps a level the module itself would hide', () => {
  // module ONE is at devLevel 'info', so a 'debug' log of its own is dropped ...
  const id = Loxer.m('ONE').open('open');
  Loxer.of(id).debug('debug inside a visible box');
  Loxer.of(id).close('close');

  // ... and stays dropped inside a box: the box widens nothing
  expect(devLogs.length).toBe(3);
  expect(devLogs.some((l) => l.message === 'debug inside a visible box')).toBe(false);
  checkBoxes(['open.ONE.<-open', 'close.ONE.>-close']);
});

test('module boxing', () => {
  const id1 = Loxer.m('ONE').open('open');
  Loxer.m('ONE').of(id1).add('add');
  const id2 = Loxer.m('TWO').open('open2');
  Loxer.m('ONE').of(id1).error('error');
  Loxer.m('TWO').of(id2).add('add2');
  Loxer.m('ONE').of(id1).close('close');
  Loxer.m('TWO').of(id2).close('close2');
  // module ONE is at devLevel 'info', so this box is hidden
  const id3 = Loxer.m('ONE').debug.open('open3');
  Loxer.m('ONE').of(id3).error('error3');
  Loxer.m('ONE').of(id3).close('close3');
  /*
  ╭← open
  ├─ add
  │╭← open2       
  ├┆─ Error: error  
  │├─ add2          
  ╰┆→ close         
   ╰→ close2       
//╭← open3          [unlevelled]
  - error            [leveled automatically]
//╰→ close3         [unlevelled automatically]
  */
  checkBoxes([
    'open.ONE.<-open',
    'single.ONE.T-add',
    'open.TWO.|<-open2',
    'error.ONE.Tx-error',
    'single.TWO.|T-add2',
    'close.ONE.>x-close',
    'close.TWO. >-close2',
    'error.ONE.-error3',
  ]);
});
