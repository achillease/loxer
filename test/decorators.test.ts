import { initLoxer, Loxer, resetLoxer, trace } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';
import { DecoratorMode, installTraced, traceCases } from './trace-cases';

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
  @trace('NONE')
  simple(n: number) {
    return n;
  }
  @trace({ moduleId: 'NONE', openMessage: 'args', closeMessage: 'result' })
  withArgs(n: number, s: string) {
    return { n, s };
  }
  @trace({ moduleId: 'NONE', openMessage: 'types', closeMessage: 'prettyResult' })
  withTypes(n: number) {
    return n;
  }
  @trace({
    moduleId: 'NONE',
    openMessage: 'className.functionName',
    closeMessage: 'className.functionName',
  })
  named(n: number) {
    return n;
  }
  @trace({
    moduleId: 'NONE',
    openMessage: (args) => `open:${args.join('|')}`,
    closeMessage: (result) => `close:${result}`,
  })
  custom(n: number) {
    return n * 2;
  }
  @trace({ moduleId: 'NONE', argsAsItem: true, resultAsItem: true })
  withItems(n: number) {
    return { doubled: n * 2 };
  }
  @trace({ moduleId: 'NONE', highlight: 'all' })
  highlighted(n: number) {
    return n;
  }
  @trace('NONE')
  async asyncOk(n: number) {
    return n + 1;
  }
  @trace('NONE')
  async asyncFail() {
    throw new Error('boom');
  }
  @trace({ moduleId: 'NONE', closeMessage: 'result' })
  async asyncResult(n: number) {
    return { doubled: n * 2 };
  }
}

class TypedCallbackService {
  @trace<[amount: number, label: string], { total: number }>({
    moduleId: 'NONE',
    openMessage: ([amount, label]) => {
      const displayAmount = amount.toFixed(2);
      const displayLabel = label.toUpperCase();

      // @ts-expect-error `amount` is explicitly typed as a number.
      amount.toUpperCase();

      return `open:${displayLabel}:${displayAmount}`;
    },
    closeMessage: (result) => {
      const displayTotal = result.total.toFixed(2);

      // @ts-expect-error `result` has the explicitly supplied result shape.
      result.label;

      return `close:${displayTotal}`;
    },
  })
  typed(amount: number, label: string) {
    return { total: amount + label.length };
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

test.each(traceCases)(
  '@trace produces identical legacy and standard records: $name',
  async (testCase) => {
    const legacy = await runTraceCase('legacy', testCase);
    const standard = await runTraceCase('standard', testCase);
    const expected = testCase.expectedLogs.map((log) => ({
      highlighted: log.highlighted ?? false,
      item: log.item,
      level: log.level ?? 1,
      message: log.message,
      moduleId: expectedModuleId(log.moduleId),
      type: log.type,
    }));

    expect(legacy.records).toEqual(expected);
    expect(standard.records).toEqual(expected);
    expect(standard.records).toEqual(legacy.records);
    expect(legacy.errorMessages).toEqual(testCase.expectedErrorMessages ?? []);
    expect(standard.errorMessages).toEqual(testCase.expectedErrorMessages ?? []);
    expect(legacy.prodErrorCount).toBe(0);
    expect(standard.prodErrorCount).toBe(0);
    expect(legacy.prodLogCount).toBe(0);
    expect(standard.prodLogCount).toBe(0);

    if ('expectedThrown' in testCase) {
      expect(legacy.thrown).toBe(testCase.expectedThrown);
      expect(standard.thrown).toBe(testCase.expectedThrown);
    } else {
      expect(legacy.result).toEqual(testCase.expectedResult);
      expect(standard.result).toEqual(testCase.expectedResult);
    }
  }
);

describe.each<DecoratorMode>(['legacy', 'standard'])(
  '@trace call-time names under the %s protocol',
  (mode) => {
    test('uses the runtime constructor for static and subclass calls and degrades when detached', () => {
      resetAndInitialize();

      class StaticService {}
      const staticMethod = installTraced(mode, StaticService, {
        methodName: 'stat',
        original(this: typeof StaticService) {
          return this.name;
        },
        options: {
          moduleId: 'NONE',
          openMessage: 'className.functionName',
          closeMessage: 'className.functionName',
        },
        isStatic: true,
      });
      expect(staticMethod.call(StaticService)).toBe('StaticService');
      expect(devLogs.map((log) => log.message)).toEqual([
        'StaticService.stat()',
        'StaticService.stat done',
      ]);

      resetAndInitialize();
      class Base {}
      class Sub extends Base {}
      installTraced(mode, Base.prototype, {
        methodName: 'named',
        original(this: { constructor: { name: string } }) {
          return this.constructor.name;
        },
        options: {
          moduleId: 'NONE',
          openMessage: 'className.functionName',
          closeMessage: 'className.functionName',
        },
      });

      const instance = new Sub() as Sub & { named(): string };
      expect(instance.named()).toBe('Sub');
      expect(devLogs.map((log) => log.message)).toEqual(['Sub.named()', 'Sub.named done']);

      resetAndInitialize();
      class OrderServiceClass {}
      installTraced(mode, OrderServiceClass.prototype, {
        methodName: 'shortened',
        original() {
          return 'done';
        },
        options: {
          moduleId: 'NONE',
          openMessage: 'className.functionName',
          closeMessage: 'className.functionName',
        },
      });

      const suffixed = new OrderServiceClass() as OrderServiceClass & {
        shortened(): string;
      };
      expect(suffixed.shortened()).toBe('done');
      expect(devLogs.map((log) => log.message)).toEqual([
        'OrderService.shortened()',
        'OrderService.shortened done',
      ]);

      resetAndInitialize();
      const detachedHost = {};
      const detached = installTraced(mode, detachedHost, {
        methodName: 'detached',
        original(this: unknown) {
          return this;
        },
        options: {
          moduleId: 'NONE',
          openMessage: 'className.functionName',
          closeMessage: 'className.functionName',
        },
      });
      expect(detached()).toBeUndefined();
      expect(devLogs.map((log) => log.message)).toEqual(['detached()', 'detached done']);
    });

    test('normalizes symbol method names', () => {
      resetAndInitialize();
      const key = Symbol('symbolic');
      const host = {};
      const method = installTraced(mode, host, {
        methodName: key,
        original() {
          return 1;
        },
        options: 'NONE',
      });

      expect(method.call(host)).toBe(1);
      expect(devLogs.map((log) => log.message)).toEqual(['symbolic()', 'symbolic done']);
    });

    test('preserves close highlighting when an async formatter logs', async () => {
      resetAndInitialize();
      const host = {};
      const method = installTraced(mode, host, {
        methodName: 'formatted',
        async original() {
          return 2;
        },
        options: {
          moduleId: 'NONE',
          highlight: 'all',
          closeMessage(result) {
            Loxer.log('formatter');
            return `formatted:${result}`;
          },
        },
      });

      await expect(method.call(host)).resolves.toBe(2);
      expect(devLogs.map((log) => [log.message, log.highlighted])).toEqual([
        ['formatted()', true],
        ['formatter', false],
        ['formatted:2', true],
      ]);
    });
  }
);

test('@trace returns the legacy descriptor and a distinct standard replacement', () => {
  const original = () => 1;
  const descriptor: PropertyDescriptor = { configurable: true, value: original };
  const decorator = trace('NONE');

  expect(decorator({}, 'value', descriptor)).toBe(descriptor);
  expect(descriptor.value).not.toBe(original);

  const standardReplacement = decorator(original, {
    kind: 'method',
    name: 'value',
    static: false,
    private: false,
    addInitializer() {},
  });
  expect(standardReplacement).not.toBe(original);
  expect(typeof standardReplacement).toBe('function');
});

test('@trace rejects non-method use under both protocols', () => {
  const decorator = trace() as (...args: unknown[]) => unknown;

  expect(() => decorator(1, { kind: 'field', name: 'value' })).toThrow(
    new TypeError('@trace can only decorate methods.')
  );
  expect(() => decorator({}, 'value', { value: 1 })).toThrow(
    new TypeError('@trace can only decorate methods.')
  );
});

test('initLoxer returns no-op decorators for legacy and standard class protocols', () => {
  resetLoxer();
  devLogs = [];
  const decorator = initLoxer({ dev: true, callbacks: { devLog } });
  class LegacyTarget {}
  class StandardTarget {}

  expect(decorator(LegacyTarget)).toBeUndefined();
  expect(
    decorator(StandardTarget, {
      kind: 'class',
      name: 'StandardTarget',
      addInitializer() {},
    })
  ).toBeUndefined();
  expect(devLogs.filter((log) => log.message === 'Loxer initialized')).toHaveLength(1);
});

test('bare initLoxer use is rejected without replacing or initializing the class', () => {
  resetLoxer();
  devLogs = [];
  class BareTarget {}

  const result = (initLoxer as (target: typeof BareTarget) => unknown)(BareTarget);

  expect(result).toBeUndefined();
  expect(devLogs).toEqual([]);
});

interface TraceCaseResult {
  errorMessages: string[];
  prodErrorCount: number;
  prodLogCount: number;
  records: Array<{
    highlighted: boolean;
    item: unknown;
    level: number;
    message: string;
    moduleId: string;
    type: string;
  }>;
  result?: unknown;
  thrown?: unknown;
}

async function runTraceCase(
  mode: DecoratorMode,
  testCase: (typeof traceCases)[number]
): Promise<TraceCaseResult> {
  resetAndInitialize();
  const host = {};
  const method = installTraced(mode, host, testCase);
  let result: unknown;
  let thrown: unknown;
  try {
    result = await method.apply(host, testCase.args);
  } catch (error) {
    thrown = error;
  }

  return {
    errorMessages: devErrors.map((error) => error.message),
    prodErrorCount: prodErrors.length,
    prodLogCount: prodLogs.length,
    records: devLogs.map((log) => ({
      highlighted: log.highlighted,
      item: log.item,
      level: log.level,
      message: log.message,
      moduleId: log.moduleId,
      type: log.type,
    })),
    result,
    thrown,
  };
}

function resetAndInitialize(): void {
  resetLoxer();
  Loxer.init({
    dev: true,
    callbacks: { devLog, devError, prodLog, prodError },
    modules: {
      LEVEL: { color: '#fff', devLevel: 2, fullName: 'Level', prodLevel: 0 },
    },
  });
  devLogs = [];
  devErrors = [];
  prodLogs = [];
  prodErrors = [];
}

function expectedModuleId(moduleId: string | undefined): string {
  return moduleId === undefined || moduleId === 'NONE' ? 'DEFAULT' : moduleId;
}
