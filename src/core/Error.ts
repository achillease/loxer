/** @module Error */
import { eraseBeginningLines, isError } from '../Helpers.js';
import { ErrorType } from '../types.js';

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
      const sureError = castError(existingError as ErrorType);
      this.message += ` =[${sureError.name}]=> ${sureError.message}`;
      this.stack = sureError.stack;
    }
  }
}

/** @internal */
export function castError(error: ErrorType): Error {
  if (isError(error)) {
    error.stack = eraseBeginningLines(`${error.stack}`, 1);

    return error;
  } else {
    const result = new Error(typeof error === 'object' ? JSON.stringify(error) : error.toString());
    result.stack = eraseBeginningLines(`${result.stack}`, 3);

    return result;
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
