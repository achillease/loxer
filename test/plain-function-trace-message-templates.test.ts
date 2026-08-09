import { __startTrace, devErrors, devLogs } from './plain-function-trace.fixture';
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

function assertEscapeFree(): void {
  devLogs.forEach((log) => expect(log.message).not.toMatch(/\x1b/));
}

test.each(templateCases)('$name (marker runtime)', (testCase) => {
  const trace = __startTrace(
    CALL_NAME,
    testCase.args ?? DEFAULT_ARGS,
    {
      markerOptions: { openMessage: testCase.openMessage, closeMessage: testCase.closeMessage },
      moduleId: 'TRACE',
    },
    PARENT_NAME
  );
  trace.success(testCase.voidResult ? undefined : testCase.result ?? DEFAULT_RESULT);

  expect(devLogs.map((log) => log.message)).toEqual([testCase.expectedOpen, testCase.expectedClose]);
  assertEscapeFree();
});

test.each(nonSerializableResultCases)('$name (marker runtime)', (testCase) => {
  const trace = __startTrace(
    CALL_NAME,
    DEFAULT_ARGS,
    { markerOptions: { closeMessage: testCase.closeMessage }, moduleId: 'TRACE' },
    PARENT_NAME
  );
  trace.success(undefined);

  expect(devLogs.map((log) => log.message)).toEqual([testCase.expectedOpen, testCase.expectedClose]);
});

test.each(parentlessFallbackCases)('$name (marker runtime)', (testCase) => {
  // an `undefined` parentName is what a build hands the runtime when it found no class or file for
  // the traced call - the marker runtime's own shape of "no parent known"
  const trace = __startTrace(
    CALL_NAME,
    testCase.args ?? DEFAULT_ARGS,
    {
      markerOptions: { openMessage: testCase.openMessage, closeMessage: testCase.closeMessage },
      moduleId: 'TRACE',
    },
    undefined
  );
  trace.success(testCase.voidResult ? undefined : testCase.result ?? DEFAULT_RESULT);

  expect(devLogs.map((log) => log.message)).toEqual([testCase.expectedOpen, testCase.expectedClose]);
});

test.each(failureCases)('$name (marker runtime)', (testCase) => {
  const trace = __startTrace(
    CALL_NAME,
    DEFAULT_ARGS,
    { markerOptions: { closeMessage: testCase.closeMessage }, moduleId: 'TRACE' },
    PARENT_NAME
  );
  trace.failure(new Error('boom'));

  expect(devLogs.map((log) => log.message)).toEqual([
    `${PARENT_NAME}.${CALL_NAME}()`,
    testCase.expectedFailure,
  ]);
  expect(devErrors.map((error) => error.message)).toEqual(['boom']);
});

// The "Cost" criteria at the shared-renderer boundary the marker runtime hands its parent through -
// `test/trace-message.test.ts` pins the same rule directly against `parentNameResolver` and
// `renderOpenMessage` / `renderCloseMessage`, which both runtimes call unmodified; this is the
// runtime-observable half, run through `__startTrace` the way a transformed call would.
test('a template naming no parent form produces the bare name whatever parentName the transform passed', () => {
  const trace = __startTrace(
    CALL_NAME,
    DEFAULT_ARGS,
    { markerOptions: { openMessage: 'fn(args)', closeMessage: 'fn(result)' }, moduleId: 'TRACE' },
    PARENT_NAME
  );
  trace.success(DEFAULT_RESULT);

  expect(devLogs.map((log) => log.message)).toEqual([
    'calculate(19.95, 3)',
    'calculate({"total":59.85}) done',
  ]);
});

test('a parent.fn template on both the open and the close renders the same memoized parent on each side', () => {
  const trace = __startTrace(
    CALL_NAME,
    DEFAULT_ARGS,
    { markerOptions: { openMessage: 'parent.fn', closeMessage: 'parent.fn' }, moduleId: 'TRACE' },
    PARENT_NAME
  );
  trace.success(DEFAULT_RESULT);

  expect(devLogs.map((log) => log.message)).toEqual([
    'Checkout.calculate()',
    'Checkout.calculate done',
  ]);
});
