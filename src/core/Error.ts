/** @module Error */
import { eraseBeginningLines, sanitizeControlCharacters } from '../Helpers.js';

/** A customizable Error, that may be created from an existing Error */
export class NamedError extends Error {
  /**
   * creates a new `Error` with the given `name` and `message`.
   * - Additionally receives a `givenError` which will have concatenated `message` and `stack` with the newly created error.
   * - If the `givenError` is not `typeof Error` an `Error` will be created of it.
   *
   * ## Usage
   * ```typescript
   * const existingError = new RangeError('some message')
   * const myError = new NamedError('MyError', 'this is my custom Error', existingError);
   *
   * // in a try-catch-phrase
   * try {
   *   // some dangerous stuff
   * } catch (error) {
   *   Loxer.error(new NamedError('DangerousStuffError', 'failed to do some dangerous stuff', error));
   * }
   * ```
   *
   * @param name The `Error.name`
   * @param message The `Error.message` which may be concatenated with the `givenError.message`
   * @param existingError An optional error (of any type) which will be concatenated
   */
  constructor(name: string, message: string, existingError?: unknown) {
    super(message);
    this.message = message;
    this.name = name;
    if (existingError !== undefined) {
      const sureError = castError(existingError);
      this.message += ` =[${sureError.name}]=> ${sureError.message}`;
      this.stack = sureError.stack;
    }
  }
}

/** @internal */
export function castError(error: unknown): Error {
  if (isNativeError(error)) {
    try {
      error.stack = eraseBeginningLines(`${error.stack}`, 1);
    } catch {
      // Keep the original error when its stack is unreadable.
    }

    return error;
  }

  const result = new Error(stringifyThrownValue(error));
  result.stack = eraseBeginningLines(`${result.stack}`, 3);

  return result;
}

function isNativeError(error: unknown): error is Error {
  try {
    return error instanceof Error;
  } catch {
    return false;
  }
}

/** @internal */
export function sanitizeErrorMessage(message: string): string {
  return sanitizeControlCharacters(message);
}

/** @internal */
export function getErrorMessage(error: Error): string {
  try {
    return typeof error.message === 'string' ? error.message : String(error.message);
  } catch {
    return '[unreadable error message]';
  }
}

function stringifyThrownValue(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error === undefined) {
    return 'undefined';
  }
  if (error === null) {
    return 'null';
  }
  if (typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error);
      if (serialized !== undefined) {
        return serialized;
      }
    } catch {
      return '[unserializable thrown value]';
    }
  }

  try {
    return String(error);
  } catch {
    return '[unstringifiable thrown value]';
  }
}

/** @internal */
export class LoxerError extends Error {
  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = 'LoxerError';
  }
}
