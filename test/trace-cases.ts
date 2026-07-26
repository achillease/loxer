import type { TraceOptions } from '../src';
import { trace } from '../src';

export type DecoratorMode = 'legacy' | 'standard';

export interface TraceCase {
  name: string;
  methodName: string | symbol;
  original: (...args: any[]) => any;
  options?: TraceOptions<any, any> | string;
  args: any[];
  expectedResult?: any;
  expectedThrown?: unknown;
  expectedErrorMessages?: string[];
  expectedLogs: Array<{
    type: string;
    message: string;
    item?: any;
    highlighted?: boolean;
    moduleId?: string;
    level?: number;
  }>;
}

const asyncFailure = new Error('boom');

export const traceCases: TraceCase[] = [
  {
    name: 'default messages',
    methodName: 'simple',
    original(value: number) {
      return value;
    },
    options: 'NONE',
    args: [1],
    expectedResult: 1,
    expectedLogs: [
      { type: 'open', message: 'simple()', moduleId: 'NONE' },
      { type: 'close', message: 'simple done', moduleId: 'NONE' },
    ],
  },
  {
    name: 'arguments and result messages',
    methodName: 'withArgs',
    original(n: number, value: string) {
      return { n, value };
    },
    options: { moduleId: 'NONE', openMessage: 'args', closeMessage: 'result' },
    args: [3, 'x'],
    expectedResult: { n: 3, value: 'x' },
    expectedLogs: [
      { type: 'open', message: 'withArgs(3, x)', moduleId: 'NONE' },
      {
        type: 'close',
        message: 'withArgs done. returns: {"n":3,"value":"x"}',
        moduleId: 'NONE',
      },
    ],
  },
  {
    name: 'type and pretty-result messages',
    methodName: 'withTypes',
    original(value: number) {
      return value;
    },
    options: { moduleId: 'NONE', openMessage: 'types', closeMessage: 'prettyResult' },
    args: [5],
    expectedResult: 5,
    expectedLogs: [
      { type: 'open', message: 'withTypes(number)', moduleId: 'NONE' },
      { type: 'close', message: 'withTypes done. returns: \n5', moduleId: 'NONE' },
    ],
  },
  {
    name: 'custom formatter messages',
    methodName: 'custom',
    original(value: number) {
      return value * 2;
    },
    options: {
      moduleId: 'NONE',
      openMessage: (args) => `open:${args.join('|')}`,
      closeMessage: (result) => `close:${result}`,
    },
    args: [4],
    expectedResult: 8,
    expectedLogs: [
      { type: 'open', message: 'open:4', moduleId: 'NONE' },
      { type: 'close', message: 'close:8', moduleId: 'NONE' },
    ],
  },
  {
    name: 'call-time class and function messages',
    methodName: 'named',
    original(value: number) {
      return value;
    },
    options: {
      moduleId: 'NONE',
      openMessage: 'className.functionName',
      closeMessage: 'className.functionName',
    },
    args: [7],
    expectedResult: 7,
    expectedLogs: [
      { type: 'open', message: 'Object.named()', moduleId: 'NONE' },
      { type: 'close', message: 'Object.named done', moduleId: 'NONE' },
    ],
  },
  {
    name: 'argument and result items',
    methodName: 'withItems',
    original(value: number) {
      return { doubled: value * 2 };
    },
    options: { moduleId: 'NONE', argsAsItem: true, resultAsItem: true },
    args: [6],
    expectedResult: { doubled: 12 },
    expectedLogs: [
      { type: 'open', message: 'withItems()', item: [6], moduleId: 'NONE' },
      {
        type: 'close',
        message: 'withItems done',
        item: { doubled: 12 },
        moduleId: 'NONE',
      },
    ],
  },
  {
    name: 'all highlights',
    methodName: 'highlighted',
    original(value: number) {
      return value;
    },
    options: { moduleId: 'NONE', highlight: 'all' },
    args: [9],
    expectedResult: 9,
    expectedLogs: [
      { type: 'open', message: 'highlighted()', highlighted: true, moduleId: 'NONE' },
      { type: 'close', message: 'highlighted done', highlighted: true, moduleId: 'NONE' },
    ],
  },
  {
    name: 'open-only highlight',
    methodName: 'openOnly',
    original() {
      return 'done';
    },
    options: { moduleId: 'NONE', highlight: 'open' },
    args: [],
    expectedResult: 'done',
    expectedLogs: [
      { type: 'open', message: 'openOnly()', highlighted: true, moduleId: 'NONE' },
      { type: 'close', message: 'openOnly done', highlighted: false, moduleId: 'NONE' },
    ],
  },
  {
    name: 'close-only highlight',
    methodName: 'closeOnly',
    original() {
      return 'done';
    },
    options: { moduleId: 'LEVEL', level: 2, highlight: 'close' },
    args: [],
    expectedResult: 'done',
    expectedLogs: [
      {
        type: 'open',
        message: 'closeOnly()',
        highlighted: false,
        moduleId: 'LEVEL',
        level: 2,
      },
      {
        type: 'close',
        message: 'closeOnly done',
        highlighted: true,
        moduleId: 'LEVEL',
        level: 2,
      },
    ],
  },
  {
    name: 'async fulfillment',
    methodName: 'asyncOk',
    async original(value: number) {
      return value + 1;
    },
    options: 'NONE',
    args: [1],
    expectedResult: 2,
    expectedLogs: [
      { type: 'open', message: 'asyncOk()', moduleId: 'NONE' },
      { type: 'close', message: 'asyncOk done', moduleId: 'NONE' },
    ],
  },
  {
    name: 'async result',
    methodName: 'asyncResult',
    async original(value: number) {
      return { doubled: value * 2 };
    },
    options: { moduleId: 'NONE', closeMessage: 'result', resultAsItem: true },
    args: [3],
    expectedResult: { doubled: 6 },
    expectedLogs: [
      { type: 'open', message: 'asyncResult()', moduleId: 'NONE' },
      {
        type: 'close',
        message: 'asyncResult done. returns: {"doubled":6}',
        item: { doubled: 6 },
        moduleId: 'NONE',
      },
    ],
  },
  {
    name: 'async rejection',
    methodName: 'asyncFail',
    async original() {
      throw asyncFailure;
    },
    options: 'NONE',
    args: [],
    expectedThrown: asyncFailure,
    expectedErrorMessages: [],
    expectedLogs: [{ type: 'open', message: 'asyncFail()', moduleId: 'NONE' }],
  },
];

export function installTraced(
  mode: DecoratorMode,
  host: object,
  testCase: Pick<TraceCase, 'methodName' | 'original' | 'options'> & { isStatic?: boolean }
): (...args: any[]) => any {
  const decorator = trace(testCase.options);
  const descriptor: PropertyDescriptor = {
    configurable: true,
    enumerable: false,
    value: testCase.original,
    writable: true,
  };

  if (mode === 'legacy') {
    const returned = decorator(host, testCase.methodName, descriptor);
    Object.defineProperty(host, testCase.methodName, returned);
  } else {
    const replacement = decorator(testCase.original, {
      kind: 'method',
      name: testCase.methodName,
      static: testCase.isStatic ?? false,
      private: false,
      access: {
        get(target: Record<PropertyKey, unknown>) {
          return target[testCase.methodName];
        },
        has(target: object) {
          return testCase.methodName in target;
        },
      },
      metadata: undefined,
      addInitializer() {},
    } as any);
    Object.defineProperty(host, testCase.methodName, { ...descriptor, value: replacement });
  }

  return (host as Record<PropertyKey, (...args: any[]) => any>)[testCase.methodName];
}
