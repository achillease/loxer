import { Box } from '../core/BoxFactory.js';
import { DEFAULT_EXTENDED_MODULE, ExtendedModule } from '../core/Modules.js';
import { Lox } from './Lox.js';
/** @module OutputLox */

/** This is a log streamed to the `devLog`or `prodLog` output stream defined at the {@link LoxerCallbacks}. */
export class OutputLox extends Lox {
  /** the box layout of the log which an array of `type { box: keyof BoxSymbol; color: string }`, where:
   * - `keyof BoxSymbol` is a string which represents the form of the box segment (character)
   * - `color` is the string color of the box segment (represents the corresponding module color)
   */
  box: Box = [];
  /** a string that represents the time consumption from the opening log's `timestamp` until this log appeared
   * - is `''` when the log is a single `Loxer.log()` or an opening log itself
   */
  timeText: string | '' = '';
  /** the time consumption (in `ms`) from the opening log's `timestamp` until this log appeared
   * - is `undefined` when the log is a single `Loxer.log()` or an opening log itself
   */
  timeConsumption: number | undefined;
  /** determines if the log has not fulfilled the level that the corresponding module has set */
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
