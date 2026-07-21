import { NamedError } from '../src';
import { castError, LoxerError } from '../src/core/Error';

test('NamedError concatenates a wrapped non-Error value', () => {
  const str = new NamedError('TestError', 'string test', 'string');
  expect(str.name).toBe('TestError');
  expect(str.message).toBe('string test =[Error]=> string');

  const num = new NamedError('TestError', 'num test', 3);
  expect(num.message).toBe('num test =[Error]=> 3');

  const boo = new NamedError('TestError', 'boolean test', false);
  expect(boo.message).toBe('boolean test =[Error]=> false');
});

test('NamedError JSON-stringifies a wrapped object value', () => {
  const obj = new NamedError('TestError', 'object test', { fail: 'object' });
  expect(obj.name).toBe('TestError');
  expect(obj.message).toBe('object test =[Error]=> {"fail":"object"}');
});

test('NamedError adopts the name, message and stack of a wrapped Error', () => {
  const range = new RangeError('range');
  const err = new NamedError('TestError', 'error test', range);
  // the wrapped error's name is embedded, the NamedError keeps its own name
  expect(err.name).toBe('TestError');
  expect(err.message).toBe('error test =[RangeError]=> range');
  // the stack is replaced with the wrapped error's (erased) stack
  expect(err.stack).toBe(range.stack);
  expect(typeof err.stack).toBe('string');
});

test('NamedError without a wrapped error leaves the message untouched', () => {
  const empty = new NamedError('TestError', 'non existing error');
  expect(empty.name).toBe('TestError');
  expect(empty.message).toBe('non existing error');
  expect(empty.message).not.toContain('=[');
});

test('castError returns Error instances unchanged (with erased stack)', () => {
  const source = new TypeError('boom');
  const result = castError(source);
  expect(result).toBe(source);
  expect(result.name).toBe('TypeError');
  expect(result.message).toBe('boom');
});

test('LoxerError carries its dedicated name', () => {
  const le = new LoxerError('internal failure');
  expect(le).toBeInstanceOf(Error);
  expect(le.name).toBe('LoxerError');
  expect(le.message).toBe('internal failure');
});
