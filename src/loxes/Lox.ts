import { ItemOptions, ItemType } from '../core/Item.js';
import type { LogLevel } from '../core/Levels.js';
import { is } from '../Helpers.js';
/** @module Lox */

export type LoxType = 'single' | 'open' | 'close' | 'error';

/** @internal */
export interface LoxProps {
  id: number;
  message: string;
  highlighted: boolean;
  item: ItemType | undefined;
  itemOptions: ItemOptions | undefined;
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
  /** an optional item like the `console.log(message,`**_`item`_**`)` */
  item: ItemType | undefined;
  /** options to configure the (default) output of the item */
  itemOptions: ItemOptions | undefined;
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
  constructor(props: LoxProps) {
    this.id = props.id;
    this.message = props.message;
    this.highlighted = props.highlighted;
    this.item = props.item;
    this.itemOptions = props.itemOptions;
    this.type = props.type;
    this.moduleId = props.moduleId;
    this.level = props.level;
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
