import { Loxer, resetLoxer } from '../dist';

let testResults = '';
afterAll(() => console.log(testResults));

afterEach(() => {
  resetLoxer();
});

// logging when loxer disabled:
test('disabled', () => {
  Loxer.init({ config: { disabled: true } });
  boxes(50000000, 60, `disabled logs`);
});

// logging when logs don't fulfill level: the boxes below are 'debug', the modules only 'info'
test('unlevelled', () => {
  Loxer.init({
    dev: false,
    defaultLevels: {
      prodLevel: 'info',
      devLevel: 'info',
    },
    config: {
      historyCacheSize: 0,
    },
  });
  boxes(10000, 60, `unlevelled logs`);
});

// logging when logs go to output stream
test('blank output stream', () => {
  Loxer.init({
    dev: false,
    defaultLevels: {
      prodLevel: 'debug',
      devLevel: 'debug',
    },
    config: {
      historyCacheSize: 0,
    },
  });
  boxes(10000, 60, `streamed logs`);
});

// logging with console output (skipped though output is heavy)
test.skip('console', () => {
  Loxer.init({
    dev: true,
    defaultLevels: {
      prodLevel: 'debug',
      devLevel: 'debug',
    },
    config: {
      historyCacheSize: 0,
    },
  });
  boxes(500, 60, `console logs`);
});

// Test function

function boxes(count: number, depth = count, testName = '') {
  const startTime = new Date().getTime();
  let offset = 0;
  while (offset + depth < count) {
    for (let start = offset + 1; start <= offset + depth; start++) {
      Loxer.debug.open('open log');
    }
    for (let middle = offset + 1; middle <= offset + depth; middle++) {
      Loxer.of(middle).add('append to log');
      Loxer.of(middle).error('append an error to log1');
    }
    for (let end = offset + depth; end > offset; end--) {
      Loxer.of(end).close('close log');
    }
    offset += depth;
  }
  for (let start = offset + 1; start <= count; start++) {
    Loxer.debug.open('open log');
  }
  for (let middle = offset + 1; middle <= count; middle++) {
    Loxer.of(middle).add('append to log');
    Loxer.of(middle).error('append an error to log2');
  }
  for (let end = count; end > offset; end--) {
    Loxer.of(end).close('close log');
  }
  const time = new Date().getTime() - startTime;
  const lps = Math.round(((count * 4) / time) * 1000);
  testResults += `${format(count * 4)} ${testName} last ${time}ms\t~${format(
    lps
  )} logs per second\n`;
}

function format(n: number) {
  let a = n.toString();
  let result = '';
  while (a.length > 3) {
    result = `.${a.slice(-3)}${result}`;
    a = a.slice(0, -3);
  }
  return a + result;
}
