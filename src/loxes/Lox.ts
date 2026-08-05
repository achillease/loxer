import type { LogLevel } from '../core/Levels.js';
// type-only, so the specifier is erased on emit and no runtime cycle is closed
import type { PropsPrinterOptions } from '../core/PropsPrinter.js';
import { is } from '../Helpers.js';
/** @module Lox */

export type LoxType = 'single' | 'open' | 'close' | 'error';

/** @internal the field-by-field initializer of a {@link Lox}. Named apart from `props`, which is
 * one of its fields and means the values a log carries. */
export interface LoxInit {
  id: number;
  message: string;
  highlighted: boolean;
  props: unknown[];
  printProps: PropsPrinterOptions | undefined;
  type: LoxType;
  moduleId: string;
  level: LogLevel;
}

/** The basic log that every {@link OutputLox} and {@link ErrorLox} extends */
export class Lox {
  /** the internal identifier of the log
   * - this id is used to reference `.of(id)` logs to opening logs
   * - handed out by the `Loxer` instance the log belongs to, so ids stay unique within it
   */
  id: number;
  /** the message of the log */
  message: string;
  /** determines if the log was highlighted with `Loxer.highlight()` or `Loxer.h()` */
  highlighted: boolean;
  /** the values the log was called with, after its message - like
   * `console.log(message,`**_`...props`_**`)`
   * - always an array: a log without props carries an empty one
   * - every prop reaches the output stream and history by reference, unchanged
   */
  props: unknown[];
  /** the configuration for rendering {@link Lox.props} in the built-in output, as passed to
   * `Loxer.printProps(...)` / `Loxer.pp(...)`
   * - `undefined` means the call did not ask for its props to be rendered
   * - an empty object is a rendering request with default configuration
   */
  printProps: PropsPrinterOptions | undefined;
  /** the {@link LoxType type} of the log */
  type: LoxType;
  /** the corresponding key of a module from {@link LoxerOptions.modules}
   * - will be `DEFAULT` if logged with empty module `Loxer.module()` or `Loxer.m()`
   * - will be `NONE` if logged without a module
   * - will be `INVALID` if logged with a module that was not defined at {@link LoxerOptions.modules}
   */
  moduleId: string;
  /** the {@link LogLevel} of the log
   * - `'error'` for every `Loxer.error()` / `Loxer.of(...).error()`
   * - `'info'` for `Loxer.log()` / `Loxer.open()`
   * - the named level for `Loxer.warn/info/debug(...)`, their `.open()`, and
   *   `Loxer.of(...).warn/info/debug()`
   * - the opening log's level for `Loxer.of(...).add()` / `.close()`
   */
  level: LogLevel;
  /** the {@link Date} the log was declared */
  timestamp: Date;

  /** @internal */
  constructor(init: LoxInit) {
    this.id = init.id;
    this.message = init.message;
    this.highlighted = init.highlighted;
    this.props = init.props;
    this.printProps = init.printProps;
    this.type = init.type;
    this.moduleId = init.moduleId;
    this.level = init.level;
    this.timestamp = new Date();
  }

  // TODO: i think this does not work with boxes?!
  /** compares another lox with this one. Loxes are equal if their `id` is the same
   * @param obj to compare on equality
   * @returns true if both have the same id
   */
  equals(obj: unknown): boolean {
    return is(obj) && obj instanceof Lox ? obj.id === this.id : false;
  }
}
