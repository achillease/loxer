import { initLoxer, Loxer, resetLoxer, trace } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';

let devLogs: OutputLox[] = [];
function devLog(log: OutputLox) {
  devLogs.push(log);
}
let devErrors: ErrorLox[] = [];
function devError(log: ErrorLox) {
  devErrors.push(log);
}
let prodLogs: OutputLox[] = [];
function prodLog(log: OutputLox) {
  prodLogs.push(log);
}
let prodErrors: ErrorLox[] = [];
function prodError(log: ErrorLox) {
  prodErrors.push(log);
}

// class name does not end in 'Class', so `className.functionName` renders as `Service.<fn>`
class Service {
  @trace('NONE') // @ts-ignore
  simple(n: number) {
    return n;
  }
  @trace({ moduleId: 'NONE', openMessage: 'args', closeMessage: 'result' }) // @ts-ignore
  withArgs(n: number, s: string) {
    return { n, s };
  }
  @trace({ moduleId: 'NONE', openMessage: 'types', closeMessage: 'prettyResult' }) // @ts-ignore
  withTypes(n: number) {
    return n;
  }
  @trace({ moduleId: 'NONE', openMessage: 'className.functionName', closeMessage: 'className.functionName' }) // @ts-ignore
  named(n: number) {
    return n;
  }
  @trace({
    moduleId: 'NONE',
    openMessage: (args) => `open:${args.join('|')}`,
    closeMessage: (result) => `close:${result}`,
  }) // @ts-ignore
  custom(n: number) {
    return n * 2;
  }
  @trace({ moduleId: 'NONE', argsAsItem: true, resultAsItem: true }) // @ts-ignore
  withItems(n: number) {
    return { doubled: n * 2 };
  }
  @trace({ moduleId: 'NONE', highlight: 'all' }) // @ts-ignore
  highlighted(n: number) {
    return n;
  }
  @trace('NONE') // @ts-ignore
  async asyncOk(n: number) {
    return n + 1;
  }
  @trace('NONE') // @ts-ignore
  async asyncFail() {
    throw new Error('boom');
  }
  @trace({ moduleId: 'NONE', closeMessage: 'result' }) // @ts-ignore
  async asyncResult(n: number) {
    return { doubled: n * 2 };
  }
}

beforeEach(() => {
  Loxer.init({ dev: true, callbacks: { devLog, devError, prodLog, prodError } });
  devLogs = [];
  devErrors = [];
});

afterEach(() => {
  devLogs = [];
  devErrors = [];
  prodLogs = [];
  prodErrors = [];
  resetLoxer();
});

afterAll(() => {
  // a traced call must never reach a production callback in dev mode
  expect(prodLogs.length).toBe(0);
  expect(prodErrors.length).toBe(0);
});

test('initLoxer initializes Loxer', () => {
  resetLoxer();
  devLogs = [];
  initLoxer({ dev: true, callbacks: { devLog } });
  expect(devLogs.length).toBe(1);
  expect(devLogs[0].message).toBe('Loxer initialized');
  expect(devLogs[0].highlighted).toBeTruthy();
});

test('@trace default messages use the function name and preserve the return value', () => {
  const s = new Service();
  expect(s.simple(1)).toBe(1);
  expect(devLogs.length).toBe(2);
  expect(devLogs[0].type).toBe('open');
  expect(devLogs[0].message).toBe('simple()');
  expect(devLogs[1].type).toBe('close');
  expect(devLogs[1].message).toBe('simple done');
});

test('@trace args / result message formatting', () => {
  const s = new Service();
  expect(s.withArgs(3, 'x')).toEqual({ n: 3, s: 'x' });
  expect(devLogs[0].message).toBe('withArgs(3, x)');
  expect(devLogs[1].message).toBe('withArgs done. returns: {"n":3,"s":"x"}');
});

test('@trace types / prettyResult message formatting', () => {
  const s = new Service();
  s.withTypes(5);
  expect(devLogs[0].message).toBe('withTypes(number)');
  expect(devLogs[1].message).toBe('withTypes done. returns: \n5');
});

test('@trace className.functionName message formatting', () => {
  const s = new Service();
  s.named(7);
  expect(devLogs[0].message).toBe('Service.named()');
  expect(devLogs[1].message).toBe('Service.named done');
});

test('@trace custom message callbacks receive args and result', () => {
  const s = new Service();
  expect(s.custom(4)).toBe(8);
  expect(devLogs[0].message).toBe('open:4');
  expect(devLogs[1].message).toBe('close:8');
});

test('@trace argsAsItem / resultAsItem attach items to the logs', () => {
  const s = new Service();
  s.withItems(6);
  expect(devLogs[0].item).toEqual([6]);
  expect(devLogs[1].item).toEqual({ doubled: 12 });
});

test('@trace highlight: all highlights both open and close', () => {
  const s = new Service();
  s.highlighted(9);
  expect(devLogs[0].highlighted).toBeTruthy();
  expect(devLogs[1].highlighted).toBeTruthy();
});

test('@trace async method closes the box after resolution and returns the payload', async () => {
  const s = new Service();
  await expect(s.asyncOk(1)).resolves.toBe(2);
  expect(devLogs[0].message).toBe('asyncOk()');
  expect(devLogs[0].type).toBe('open');
  expect(devLogs[1].message).toBe('asyncOk done');
  expect(devLogs[1].type).toBe('close');
});

test('@trace async rejection propagates and (by design) does not close the box', async () => {
  const s = new Service();
  await expect(s.asyncFail()).rejects.toThrow('boom');
  // the open box was emitted...
  expect(devLogs[0].message).toBe('asyncFail()');
  expect(devLogs[0].type).toBe('open');
  // ...but there is no catch handler, so no close log is ever emitted
  expect(devLogs.some((l) => l.type === 'close')).toBe(false);
});

test('@trace async close message reflects the resolved value, not the pending promise', async () => {
  // for an async method, getCloseMessage runs inside the `.then` on the resolved payload, so
  // `closeMessage: 'result'` serializes the actual return value rather than the Promise ('{}').
  const s = new Service();
  await expect(s.asyncResult(3)).resolves.toEqual({ doubled: 6 });
  const close = devLogs.find((l) => l.type === 'close');
  expect(close?.message).toBe('asyncResult done. returns: {"doubled":6}');
});
