import { Box } from '../core/output/BoxFactory.js';
import { DEFAULT_EXTENDED_MODULE, ExtendedModule } from '../core/runtime/Modules.js';
import { Lox } from './Lox.js';
/** @module OutputLox */

/** A visible ordinary log emitted to the configured output stream as an event with `kind: 'log'`. */
export class OutputLox extends Lox {
  /** the box layout of the log which an array of `type { box: keyof BoxSymbol; color: string }`, where:
   * - `keyof BoxSymbol` is a string which represents the form of the box segment (character)
   * - `color` is the string color of the box segment (represents the corresponding module color)
   */
  box: Box = [];
  /** a string that represents the time consumption from the opening log's `timestamp` until this log appeared
   * - is `''` when the log is a single `Loxer.log()` or an opening log itself
   */
  timeText: string = '';
  /** the time consumption (in `ms`) from the opening log's `timestamp` until this log appeared
   * - is `undefined` when the log is a single `Loxer.log()` or an opening log itself
   */
  timeConsumption: number | undefined;
  /** determines if the log's level sits past the level its module logs up to — a hidden log enters
   * neither the history nor the visible box layout
   * - always `false` on an {@link ErrorLox}: errors are output whatever the level says
   */
  hidden: boolean = false;
  /** the corresponding module of this Lox */
  module: ExtendedModule = DEFAULT_EXTENDED_MODULE;

  /** @internal */
  setTime(timeConsumption?: number): void {
    if (timeConsumption !== undefined) {
      this.timeConsumption = timeConsumption;
      this.timeText = `[${timeConsumption.toString()}ms]`;
    }
  }

  get moduleText(): string {
    return this.module.slicedName;
  }
}
