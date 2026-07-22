import { Color } from './color/index.js';
import { safeNumber } from '../Helpers.js';
import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';

export class ANSIFormat {
  /** @internal */
  private constructor() {
    // static class
  }

  /** ANSI codes to manipulate strings */
  public static CODE = {
    /** this is used to reset everything to the terminals default */
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',
    Underscore: '\x1b[4m',
    Blink: '\x1b[5m',
    Reverse: '\x1b[7m',
    Hidden: '\x1b[8m',
    RGBTextColorPrefix: '\x1b[38;2;',
    RGBBackgroundColorPrefix: '\x1b[48;2;',
  };
  /** returns a string to color the following text */
  static colorForeground(r: number, g: number, b: number): string {
    return (
      this.CODE.RGBTextColorPrefix +
      safeNumber(r, [0, 255], true).toString() +
      ';' +
      safeNumber(g, [0, 255], true).toString() +
      ';' +
      safeNumber(b, [0, 255], true).toString() +
      'm'
    );
  }

  /** returns a string to color the following text's background */
  static colorBackground(r: number, g: number, b: number): string {
    return (
      this.CODE.RGBBackgroundColorPrefix +
      safeNumber(r, [0, 255], true).toString() +
      ';' +
      safeNumber(g, [0, 255], true).toString() +
      ';' +
      safeNumber(b, [0, 255], true).toString() +
      'm'
    );
  }

  /** returns a string with the highlighted text */
  static colorHighlight(text: string, color?: string): string {
    if (color) {
      const rgb = Color(color);

      return (
        this.colorBackground(
          Math.round(rgb.red()),
          Math.round(rgb.green()),
          Math.round(rgb.blue())
        ) +
        text +
        this.CODE.Reset
      );
    }

    return this.CODE.Reverse + text + this.CODE.Reset;
  }

  /** returns a string to color the following text's background red */
  static bgWarn(text: string): string {
    return (
      this.colorBackground(255, 0, 0) + this.colorForeground(255, 255, 255) + text + this.CODE.Reset
    );
  }

  /** returns a string to color the following text red */
  static fgWarn(text: string): string {
    return this.colorForeground(255, 0, 0) + text + this.CODE.Reset;
  }

  /** returns a string to color the following text green */
  static fgSuccess(text: string): string {
    return this.colorForeground(20, 200, 0) + text + this.CODE.Reset;
  }

  /** returns a string to color the following text dark grey */
  static fgTime(text: string): string {
    return this.colorForeground(70, 70, 70) + text + this.CODE.Reset;
  }

  /** returns a string to color the following text light green */
  static fgCloseLog(text: string): string {
    return this.colorForeground(180, 255, 180) + text + this.CODE.Reset;
  }

  /** receives text color and alpha and returns the colored string */
  static colorize(text: string, color: string, alpha: number = 1): string {
    const rgb = Color(color && color.length > 0 ? color : '#fff');
    const safeAlpha = safeNumber(alpha, [0, 1]);

    return (
      this.colorForeground(
        Math.round(rgb.red() * safeAlpha),
        Math.round(rgb.green() * safeAlpha),
        Math.round(rgb.blue() * safeAlpha)
      ) +
      text +
      this.CODE.Reset
    );
  }

  /**
   * @param lox to get colored props from
   * @param opacity of the returned moduleId
   * @param highlightColor for the message (if the lox is highlighted) - defaults to `inverted`
   * @returns the colored props of the given lox
   */
  static colorLox(
    lox: OutputLox,
    opacity: number = 1,
    highlightColor?: string
  ): {
    message: string;
    moduleText: string;
    timeText: string;
  } {
    let message = lox.highlighted ? this.colorHighlight(lox.message, highlightColor) : lox.message;
    if (!lox.highlighted && lox.type === 'close') {
      message = this.fgCloseLog(lox.message);
    }
    if (lox instanceof ErrorLox) {
      message = `${this.bgWarn(lox.error.name)}: ${this.fgWarn(lox.message)}`;
    }

    return {
      message,
      moduleText: this.colorize(lox.module.slicedName, lox.module.color, opacity),
      timeText: this.fgTime(lox.timeText),
    };
  }

  /** used to color items of type `number` and `bigInt` */
  static fgNumber(text: string): string {
    return this.colorForeground(193, 156, 2) + text + this.CODE.Reset;
  }
  /** used to color items of type `string` and `symbol` */
  static fgString(text: string): string {
    return this.colorForeground(18, 129, 14) + text + this.CODE.Reset;
  }
  /** used to color items of type `boolean` */
  static fgBoolean(text: string): string {
    return this.colorForeground(18, 93, 229) + text + this.CODE.Reset;
  }
  /** used to color multiple parts of items especially of type `undefined` and `null` */
  static fgUndefined(text: string): string {
    return this.colorForeground(118, 118, 118) + text + this.CODE.Reset;
  }
  /** used to color items of type `function` */
  static fgFunction(text: string): string {
    return this.colorForeground(144, 237, 32) + text + this.CODE.Reset;
  }
  /** used to color items instance of `Date` */
  static fgDate(text: string): string {
    return this.colorForeground(133, 77, 168) + text + this.CODE.Reset;
  }
  /** used to color indent indicator lines of items */
  static fgLine(text: string): string {
    return this.colorForeground(45, 45, 45) + text + this.CODE.Reset;
  }
}
