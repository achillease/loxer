import { outputFromCallbacks } from './output-capture';
import { DecoratorMode, installTraced } from './trace-cases';
import {
  CALL_NAME,
  DEFAULT_ARGS,
  DEFAULT_RESULT,
  failureCases,
  nonSerializableResultCases,
  parentlessFallbackCases,
  PARENT_NAME,
  templateCases,
} from './trace-message-cases';
import { Loxer, resetLoxer } from '../src';
import { ErrorLox, OutputLox } from '../src/loxes';

let devLogs: OutputLox[] = [];
let devErrors: ErrorLox[] = [];

function initialize(): void {
  resetLoxer();
  Loxer.init({
    dev: true,
    output: outputFromCallbacks({
      devLog: (log) => devLogs.push(log),
      devError: (log) => devErrors.push(log),
    }),
  });
  devLogs = [];
  devErrors = [];
}

beforeEach(initialize);
afterEach(() => {
  resetLoxer();
});

function assertEscapeFree(): void {
  // lox.message on the raw lox a destination receives is escape-free for every template, whichever
  // callback or fallback produced it
  devLogs.forEach((log) => expect(log.message).not.toMatch(/\x1b/));
}

describe.each<DecoratorMode>(['legacy', 'standard'])(
  '@trace message templates under the %s protocol',
  (mode) => {
    test.each(templateCases)('$name', (testCase) => {
      class Checkout {}
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return testCase.voidResult ? undefined : testCase.result ?? DEFAULT_RESULT;
        },
        options: {
          moduleId: 'NONE',
          openMessage: testCase.openMessage,
          closeMessage: testCase.closeMessage,
        },
      });
      const checkout = new Checkout() as Checkout & Record<string, (...args: unknown[]) => unknown>;

      checkout[CALL_NAME](...(testCase.args ?? DEFAULT_ARGS));

      expect(devLogs.map((log) => log.message)).toEqual([
        testCase.expectedOpen,
        testCase.expectedClose,
      ]);
      assertEscapeFree();
    });

    test.each(nonSerializableResultCases)('$name', (testCase) => {
      class Checkout {}
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return undefined;
        },
        options: { moduleId: 'NONE', closeMessage: testCase.closeMessage },
      });
      const checkout = new Checkout() as Checkout & Record<string, (...args: unknown[]) => unknown>;

      checkout[CALL_NAME](...DEFAULT_ARGS);

      expect(devLogs.map((log) => log.message)).toEqual([
        testCase.expectedOpen,
        testCase.expectedClose,
      ]);
    });

    test.each(parentlessFallbackCases)('$name', (testCase) => {
      // a bare call (no `.call`/`.apply`) resolves `this` to `undefined`, so `resolveClassName` finds
      // no reachable class - the same shape `decorators.test.ts` uses for its own "detached" case
      const host = {};
      const method = installTraced(mode, host, {
        methodName: CALL_NAME,
        original() {
          return testCase.voidResult ? undefined : testCase.result ?? DEFAULT_RESULT;
        },
        options: {
          moduleId: 'NONE',
          openMessage: testCase.openMessage,
          closeMessage: testCase.closeMessage,
        },
      });

      method(...(testCase.args ?? DEFAULT_ARGS));

      expect(devLogs.map((log) => log.message)).toEqual([
        testCase.expectedOpen,
        testCase.expectedClose,
      ]);
    });

    test.each(failureCases)('$name', (testCase) => {
      class Checkout {}
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          throw new Error('boom');
        },
        options: { moduleId: 'NONE', closeMessage: testCase.closeMessage },
      });
      const checkout = new Checkout() as Checkout & Record<string, (...args: unknown[]) => unknown>;

      expect(() => checkout[CALL_NAME](...DEFAULT_ARGS)).toThrow('boom');

      expect(devLogs.map((log) => log.message)).toEqual([
        `${PARENT_NAME}.${CALL_NAME}()`,
        testCase.expectedFailure,
      ]);
      expect(devErrors.map((error) => error.message)).toEqual(['boom']);
    });

    // The "Cost" criteria: resolving the parent stays lazy, and is memoized once resolved. The
    // decorator's own resolver reads `this.constructor.name` - the one piece of real resolution work
    // either runtime does, since the marker is simply handed its parent name by the transform - so a
    // getter on the class name is what makes that resolution observable from outside.
    test('a template naming no parent form never reads the class name', () => {
      let reads = 0;
      class Checkout {}
      Object.defineProperty(Checkout, 'name', {
        get() {
          reads += 1;

          return PARENT_NAME;
        },
      });
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return DEFAULT_RESULT;
        },
        options: { moduleId: 'NONE', openMessage: 'fn(args)', closeMessage: 'fn(result)' },
      });

      (new Checkout() as Record<string, (...args: unknown[]) => unknown>)[CALL_NAME](
        ...DEFAULT_ARGS
      );

      expect(reads).toBe(0);
    });

    test('a callback that receives parentFn but never calls it never reads the class name', () => {
      let reads = 0;
      class Checkout {}
      Object.defineProperty(Checkout, 'name', {
        get() {
          reads += 1;

          return PARENT_NAME;
        },
      });
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return DEFAULT_RESULT;
        },
        options: {
          moduleId: 'NONE',
          openMessage: ({ args, fn }) => fn(args.length),
          closeMessage: ({ fn }) => fn(),
        },
      });

      (new Checkout() as Record<string, (...args: unknown[]) => unknown>)[CALL_NAME](
        ...DEFAULT_ARGS
      );

      expect(reads).toBe(0);
    });

    test('a parent.fn template on both the open and the close reads the class name exactly once', () => {
      let reads = 0;
      class Checkout {}
      Object.defineProperty(Checkout, 'name', {
        get() {
          reads += 1;

          return PARENT_NAME;
        },
      });
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return DEFAULT_RESULT;
        },
        options: { moduleId: 'NONE', openMessage: 'parent.fn', closeMessage: 'parent.fn' },
      });

      (new Checkout() as Record<string, (...args: unknown[]) => unknown>)[CALL_NAME](
        ...DEFAULT_ARGS
      );

      expect(devLogs.map((log) => log.message)).toEqual([
        'Checkout.calculate()',
        'Checkout.calculate done',
      ]);
      expect(reads).toBe(1);
    });

    test('a callback that calls parentFn twice reads the class name exactly once', () => {
      let reads = 0;
      class Checkout {}
      Object.defineProperty(Checkout, 'name', {
        get() {
          reads += 1;

          return PARENT_NAME;
        },
      });
      installTraced(mode, Checkout.prototype, {
        methodName: CALL_NAME,
        original() {
          return DEFAULT_RESULT;
        },
        options: {
          moduleId: 'NONE',
          openMessage: ({ parentFn }) => `${parentFn(1)} ${parentFn(2)}`,
        },
      });

      (new Checkout() as Record<string, (...args: unknown[]) => unknown>)[CALL_NAME](
        ...DEFAULT_ARGS
      );

      expect(devLogs[0].message).toBe('Checkout.calculate(1) Checkout.calculate(2)');
      expect(reads).toBe(1);
    });
  }
);
