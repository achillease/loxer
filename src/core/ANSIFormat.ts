import { Color } from './color/index.js';
import { safeNumber } from '../Helpers.js';
import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';
import type { MessageSpanKind } from './TraceMessage.js';
import type { LoxColorOptions } from '../types.js';

/** the yellow a `'warn'` log is rendered in where the configuration names no other */
const DEFAULT_WARN_COLOR = '#ffa50f';
/** the red an error's message is rendered in where the configuration names no other */
const DEFAULT_ERROR_COLOR = '#f00';

export class ANSIFormat {
  /** @internal */
  private constructor() {
    // static class
  }

  /** ANSI codes to manipulate strings */
  public static readonly CODE = {
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
    return this.highlightPrefix(color) + text + this.CODE.Reset;
  }

  /** @internal the codes {@link colorHighlight} opens with */
  private static highlightPrefix(color?: string): string {
    if (color) {
      const rgb = Color(color);

      return this.colorBackground(
        Math.round(rgb.red()),
        Math.round(rgb.green()),
        Math.round(rgb.blue())
      );
    }

    return this.CODE.Reverse;
  }

  /** returns a string to color the following text's background red */
  static bgError(
    text: string,
    backgroundColor: string = '#f00',
    textColor: string = '#fff'
  ): string {
    const background = Color(backgroundColor);
    const foreground = Color(textColor);

    return (
      this.colorBackground(
        Math.round(background.red()),
        Math.round(background.green()),
        Math.round(background.blue())
      ) +
      this.colorForeground(
        Math.round(foreground.red()),
        Math.round(foreground.green()),
        Math.round(foreground.blue())
      ) +
      text +
      this.CODE.Reset
    );
  }

  /** returns a string to color the following text red */
  static fgError(text: string, color: string = DEFAULT_ERROR_COLOR): string {
    return this.colorize(text, color);
  }

  /** returns a string to color the following text yellow */
  static fgWarn(text: string, color: string = DEFAULT_WARN_COLOR): string {
    return this.colorize(text, color);
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
    return this.closeLogPrefix() + text + this.CODE.Reset;
  }

  /** @internal the codes {@link fgCloseLog} opens with */
  private static closeLogPrefix(): string {
    return this.colorForeground(180, 255, 180);
  }

  /** receives text color and alpha and returns the colored string */
  static colorize(text: string, color: string, alpha: number = 1): string {
    return this.colorizePrefix(color, alpha) + text + this.CODE.Reset;
  }

  /** @internal the codes {@link colorize} opens with */
  private static colorizePrefix(color: string, alpha: number = 1): string {
    const rgb = Color(color && color.length > 0 ? color : '#fff');
    const safeAlpha = safeNumber(alpha, [0, 1]);

    return this.colorForeground(
      Math.round(rgb.red() * safeAlpha),
      Math.round(rgb.green() * safeAlpha),
      Math.round(rgb.blue() * safeAlpha)
    );
  }

  /** @internal one marked region, in the palette entry its kind names */
  private static colorSpan(kind: MessageSpanKind, text: string): string {
    if (kind === 'value') {
      return this.fgString(text);
    }

    return kind === 'fn' ? this.fgFunction(text) : this.fgClass(text);
  }

  /** @internal Colors the marked regions of a log's message — a traced call's name, its parent, and
   * the arguments, types or result it renders.
   *
   * Caller data takes the color the props printer gives a string, the function name the one it
   * gives a function, and the parent the one it gives a class, so a trace message reads in the same
   * palette as the values printed under it.
   *
   * The color the message as a whole is rendered in is re-emitted after every span, because the
   * reset that ends the span's color ends the enclosing one too: without it a close message would
   * lose its green, a warning its yellow, and a highlight its background from the first span onward.
   *
   * A span reaching past the message it names colors nothing. Spans come from the same scan that
   * produces the text and are never recomputed, so that guards a later rewrite rather than a case
   * the renderer can reach today.
   */
  private static colorMessageSpans(lox: OutputLox, prefix: string): string {
    const { message, messageSpans } = lox;
    if (messageSpans.length === 0) {
      return message;
    }
    let colored = '';
    let position = 0;
    for (const span of messageSpans) {
      if (span.start < position || span.end > message.length) {
        continue;
      }
      colored +=
        message.slice(position, span.start) +
        this.colorSpan(span.kind, message.slice(span.start, span.end)) +
        prefix;
      position = span.end;
    }

    return colored + message.slice(position);
  }

  /**
   * @param lox to get the colored text of
   * @param options colors and module-title opacity for the returned text
   * @returns the lox's message, module text, box time consumption, full timestamp and time of day,
   * each individually ANSI-colored
   */
  static colorLox(
    lox: OutputLox,
    options: LoxColorOptions = {}
  ): {
    message: string;
    moduleText: string;
    timeConsumption: string;
    timestamp: string;
    time: string;
  } {
    // what the message as a whole is colored in, kept as its opening codes rather than as a
    // finished string, because a value span inside it has to re-emit them after its own reset
    let prefix = '';
    if (lox.highlighted) {
      prefix = this.highlightPrefix(options.colors?.highlightColor);
    } else if (lox.type === 'close') {
      prefix = this.closeLogPrefix();
    }
    if (lox.level === 'error') {
      prefix = this.colorizePrefix(options.colors?.errorColor ?? DEFAULT_ERROR_COLOR);
    } else if (lox.level === 'warn') {
      prefix = this.colorizePrefix(options.colors?.warnColor ?? DEFAULT_WARN_COLOR);
    }
    let message = this.colorMessageSpans(lox, prefix);
    if (prefix.length > 0) {
      message = prefix + message + this.CODE.Reset;
    }
    if (lox instanceof ErrorLox) {
      const errorPrefix = this.colorizePrefix(options.colors?.errorColor ?? DEFAULT_ERROR_COLOR);
      message = `${this.bgError(
        lox.error.name,
        options.colors?.errorNameBackgroundColor,
        options.colors?.errorNameColor
      )}: ${errorPrefix}${this.colorMessageSpans(lox, errorPrefix)}${this.CODE.Reset}`;
    }

    return {
      message,
      moduleText: this.colorize(lox.module.slicedName, lox.module.color, options.moduleOpacity),
      timeConsumption: this.fgTime(lox.timeText),
      timestamp: this.fgTime(lox.timestamp.toISOString().replace('T', ' ').slice(0, 19)),
      time: this.fgTime(lox.timestamp.toISOString().replace('T', ' ').slice(11, 19)),
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
  /** used to color the class an item is an instance of, and the class or file a traced function
   * belongs to */
  static fgClass(text: string): string {
    return this.colorForeground(78, 201, 176) + text + this.CODE.Reset;
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
