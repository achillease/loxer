import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';
import { LoxerCallbacks } from '../types.js';
import { ANSIFormat } from './ANSIFormat.js';
import { BoxFactory } from './BoxFactory.js';
import { Item } from './Item.js';
import { LoxHistory } from './LoxHistory.js';

interface OutputStreamsProps {
  callbacks?: LoxerCallbacks;
  disableColors?: boolean;
  endTitleOpacity?: number;
  highlightColor?: string;
}

/** @internal */
export class OutputStreams {
  private _callbacks: LoxerCallbacks | undefined;
  private _areColorsDisabled: boolean;
  private _endTitleOpacity: number = 0;
  private _highlightColor: string | undefined;

  constructor(props?: OutputStreamsProps) {
    this._callbacks = props?.callbacks;
    this._areColorsDisabled = props?.disableColors ?? false;
    this._endTitleOpacity = props?.endTitleOpacity ?? 0;
    this._highlightColor = props?.highlightColor;
  }

  /** @internal **/
  errorOut(dev: boolean, errorLox: ErrorLox, history: LoxHistory): void {
    if (dev) {
      this.devErrorOut(errorLox, history);
    } else {
      this.prodErrorOut(errorLox, history);
    }
  }

  /** @internal **/
  logOut(dev: boolean, outputLox: OutputLox): void {
    if (dev) {
      this.devLogOut(outputLox);
    } else {
      this.prodLogOut(outputLox);
    }
  }

  private devErrorOut(errorLox: ErrorLox, history: LoxHistory): void {
    if (this._callbacks?.devError) {
      this._callbacks.devError(errorLox, history.stack);
    } else {
      // colorize the output if wanted
      const colored = ANSIFormat.colorLox(errorLox);
      const message = this._areColorsDisabled ? errorLox.message : colored.message;
      const moduleText = this._areColorsDisabled ? errorLox.module.slicedName : colored.moduleText;
      const timeText = this._areColorsDisabled ? errorLox.timeText : colored.timeText;
      // generate the box layout
      const box = BoxFactory.getBoxString(errorLox.box, !this._areColorsDisabled);
      // construct the log message
      const msg = moduleText + box + message + timeText;
      const stack = errorLox.highlighted && errorLox.error.stack ? errorLox.error.stack : '';
      const openLogs =
        errorLox.highlighted && errorLox.openLoxes.length > 0
          ? `\nOPEN_LOGS: [${errorLox.openLoxes
              .map((outputLox) => outputLox.message)
              .join(' <> ')}]`
          : '';
      const str = msg + stack + openLogs;
      // prettify the item if present
      if (errorLox.item) {
        console.log(
          str +
            Item.of(errorLox).prettify(!this._areColorsDisabled, {
              // connect the item box to this log's own box column (module text width + the marker's
              // position within the box), so it branches off the box layout rather than floating
              // out at the message column
              depth: errorLox.module.slicedName.length + BoxFactory.getMarkerDepth(errorLox.box),
              color: errorLox.module.color,
            })
        );
      } else {
        console.log(str);
      }
    }
  }

  private prodErrorOut(errorLox: ErrorLox, history: LoxHistory): void {
    if (this._callbacks?.prodError) {
      this._callbacks.prodError(errorLox, history.stack);
    }
  }

  private devLogOut(outputLox: OutputLox): void {
    if (this._callbacks?.devLog) {
      this._callbacks.devLog(outputLox);
    } else {
      // colorize the output if wanted
      const opacity = outputLox.type === 'close' ? this._endTitleOpacity : 1;
      const colored = ANSIFormat.colorLox(outputLox, opacity, this._highlightColor);
      const message = this._areColorsDisabled ? outputLox.message : colored.message;
      const moduleText = this._areColorsDisabled ? outputLox.module.slicedName : colored.moduleText;
      const timeText = this._areColorsDisabled ? outputLox.timeText : colored.timeText;
      // generate the box layout
      const box = BoxFactory.getBoxString(outputLox.box, !this._areColorsDisabled);
      // construct the message
      const str = `${moduleText}${box}${message}\t${timeText}`;
      // prettify the item
      if (outputLox.item) {
        console.log(
          str +
            Item.of(outputLox).prettify(!this._areColorsDisabled, {
              // connect the item box to this log's own box column (module text width + the marker's
              // position within the box), so it branches off the box layout rather than floating
              // out at the message column
              depth: outputLox.module.slicedName.length + BoxFactory.getMarkerDepth(outputLox.box),
              color: outputLox.module.color,
            })
        );
      } else {
        console.log(str);
      }
    }
  }

  private prodLogOut(outputLox: OutputLox): void {
    if (this._callbacks?.prodLog) {
      this._callbacks.prodLog(outputLox);
    }
  }
}
