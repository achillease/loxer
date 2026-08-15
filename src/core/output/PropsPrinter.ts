import { sanitizeControlCharacters, sanitizeTerminalControlCharacters } from '../../Helpers.js';
import { Lox } from '../../loxes/Lox.js';
import { ANSIFormat } from './ANSIFormat.js';

/** the options to configure the "default" output of a log's props */
export interface PropsPrinterOptions {
  /** at which object / array depth, other objects / arrays should just be displayed as their type +
   * length.
   * - left out, the depth has no configured limit; a safety limit of 100 protects the call stack
   * - a finite number is truncated and clamped to `0` through that safety limit, so `depth: 0`
   *   renders even the outermost object as `{3 entries}`; a non-finite number uses the default
   */
  depth?: number;
  /** should a function be printed with its complete declaration. defaults to `false` */
  printFunction?: boolean;
  /** the indent that nested objects / arrays have (when not shortened to 1 line). Defaults to `2`;
   * a finite number is truncated and clamped from `0` through `20`, and a non-finite value uses the
   * default. */
  indent?: number;
  /** should vertical indent indicator lines be printed. defaults to `true` */
  showVerticalLines?: boolean;
  /** filtered keys for objects.
   * - helpful for larger objects
   * - other keys will not be displayed
   * - objects and arrays that deeply contain the given keys will have an indicator of how many elements where left out
   */
  keys?: string[];
  /** shortens objects that have a specific constructor name (other than `'Object'`) as their name
   * - defaults to `true` (except if the prop itself is a class)
   * - if disabled, the object will be displayed as destructed object with its properties
   * - **ATTENTION** displaying nested classes (classes have classes as props) can lead to exceeding the stack size,
   *   especially if the contain cyclic structures
   */
  shortenClasses?: boolean;
}

/** the number of plain characters a rendered value may take before it is expanded over several
 * lines */
const SHORT_FORM_LIMIT = 70;

/** The deepest value graph the recursive renderer will descend into. */
const MAX_RENDER_DEPTH = 100;

/** The largest public box column the renderer will allocate. */
const MAX_BOX_DEPTH = 200;

/** The widest indentation step the renderer will allocate. */
const MAX_INDENT = 20;

/** what a value renders as when reading it throws — see {@link PropsPrinter.safely} */
const UNREADABLE = '[unreadable]';

/** A helper class that renders the **props** of a `Lox` into a readable string.
 *
 * The built-in console output uses it for every log whose call chained
 * `Loxer.printProps(...)` / `Loxer.pp(...)`. An output stream receives the raw lox inside its
 * discriminated event and reaches the same rendering through {@link PropsPrinter.of}:
 *
 * ```typescript
 * output: (event) => {
 *   if (event.kind === 'log' && event.lox.printProps) {
 *     console.log(event.lox.message + PropsPrinter.of(event.lox).print());
 *   }
 * }
 * ```
 */
export class PropsPrinter {
  /** @internal */
  private readonly _values: unknown[];
  /** @internal `undefined` means unlimited */
  private readonly _depth: number | undefined;
  /** @internal */
  private readonly _printFunction: boolean;
  /** @internal */
  private readonly _indent: number;
  /** @internal */
  private readonly _showVerticalLines: boolean;
  /** @internal */
  private readonly _keys: string[] | undefined;
  /** @internal */
  private readonly _shortenObjects?: boolean;
  /** @internal forces every object / array onto one line, whatever its length */
  private _singleLine: boolean = false;
  /** @internal `singleLine` consumes only plain text, so ANSI formatting is unnecessary work */
  private _plainOnly: boolean = false;
  /** @internal the objects/arrays currently on the recursion path, used to detect cycles */
  private readonly _seen: WeakSet<any> = new WeakSet();

  /** @internal */
  private constructor(values: unknown[], options?: PropsPrinterOptions) {
    this._values = values;
    const requestedDepth = options?.depth;
    this._depth =
      requestedDepth !== undefined && Number.isFinite(requestedDepth)
        ? Math.min(MAX_RENDER_DEPTH, Math.max(0, Math.trunc(requestedDepth)))
        : undefined;
    this._printFunction = options?.printFunction ?? false;
    const requestedIndent = options?.indent;
    this._indent =
      requestedIndent !== undefined && Number.isFinite(requestedIndent)
        ? Math.min(MAX_INDENT, Math.max(0, Math.trunc(requestedIndent)))
        : 2;
    this._showVerticalLines = options?.showVerticalLines ?? true;
    this._keys = options?.keys;
    this._shortenObjects = options?.shortenClasses ?? true;
  }

  /** The static constructor of the PropsPrinter helper class. Use it for any `OutputLox` or
   * `ErrorLox`:
   * ```typescript
   * PropsPrinter.of(outputLox)
   * ```
   *
   * The printer is configured from the lox' own `printProps` field - the configuration the call
   * chained onto `Loxer.printProps(...)`. Whether to render at all stays the caller's decision:
   * `lox.printProps` is `undefined` for a log that did not ask for it.
   *
   * @param lox to render the props of
   * @returns a printer with a chained `print(...)` method
   */
  static of(lox: Lox): PropsPrinter {
    return new PropsPrinter(lox.props, lox.printProps);
  }

  /** The static constructor for values that belong to no log.
   * ```typescript
   * PropsPrinter.ofValues([payment, cart], { depth: 2 })
   * ```
   *
   * @param values to render, listed one after another
   * @param options to configure the rendering
   * @returns a printer with a chained `print(...)` method
   */
  static ofValues(values: unknown[], options?: PropsPrinterOptions): PropsPrinter {
    return new PropsPrinter(values, options);
  }

  /** Renders a single value onto exactly one line, whatever its size.
   *
   * `Loxer.log(payment)` uses this for a non-primitive message: `lox.message` is a `string`, and a
   * line break in it would corrupt the box column.
   *
   * @param value to render
   * @returns a one-line, uncolored rendering of the value
   */
  static singleLine(value: unknown): string {
    const printer = new PropsPrinter([value]);
    printer._singleLine = true;
    printer._plainOnly = true;

    return PropsPrinter.safely(() => printer.prettifyValue(value)[1], UNREADABLE);
  }

  /** @internal Runs `produce`, degrading to `fallback` where a value refuses to be read.
   *
   * A logged value is arbitrary and may be hostile: a getter or a `Proxy` trap that throws, an
   * invalid `Date`, an object whose `constructor` is not there at all. None of that may throw out of
   * a logging call — the rendering degrades and the caller keeps running. Rendering also happens
   * inside a resolved promise's `then` on the trace path, where an escaping throw would surface as
   * an unhandled rejection rather than at any caller at all.
   */
  private static safely<T>(produce: () => T, fallback: T): T {
    try {
      return produce();
    } catch {
      return fallback;
    }
  }

  /** @internal the constructor name of `value`, or `'Object'` where it has none.
   *
   * A null-prototype object (`Object.create(null)`) carries no `constructor`, and a `constructor`
   * reached through a getter or a `Proxy` may throw — so this is the only way the rendering asks.
   */
  private constructorName(value: object): string {
    return PropsPrinter.safely(
      () => sanitizeControlCharacters(String(value.constructor?.name ?? 'Object')),
      'Object'
    );
  }

  /** @internal the own enumerable entries of `value`, or none where listing them throws (a `Proxy`
   * with a throwing `ownKeys` trap, a getter that throws while its value is read) */
  private entriesOf(value: Record<string, any>): [string, any][] {
    return PropsPrinter.safely(() => Object.entries(value), []);
  }

  /** @internal how many own enumerable keys `value` has, or `0` where listing them throws */
  private keyCount(value: object): number {
    return PropsPrinter.safely(() => Object.keys(value).length, 0);
  }

  /**
   * renders a Lox' props - similar to what the `console` methods do, but with some improvements:
   * - the depth of objects / arrays is not bound to 3
   * - the indent is configurable
   * - indent is shown with vertical indicator lines
   * - objects can be filtered to specific keys (helpful when dealing with large props)
   *
   * Several props are listed one after another, in the order they were passed. A log without props
   * renders the empty string.
   *
   * ###### Example
   * ```typescript
   * PropsPrinter.of(outputLox).print(true, {
   *   depth: outputLox.module.slicedName.length + BoxFactory.getMarkerDepth(outputLox.box),
   *   color: outputLox.module.color,
   * })
   * ```
   *
   * @param colored should the output be colored (with ANSI colors)
   * @param box options for the box surrounding the printed props
   * @returns a pretty string of the props
   */
  public print(
    colored: boolean = true,
    box?: {
      /** the vertical depth, where the box starts / ends (typically the column of the log's box;
       * capped at 200)
       * - if left `undefined` the box will have a depth of 20 and is not connected to the
       *   surrounding box layout
       */
      depth?: number;
      /** color of the box and surrounding text (typically the color of the log's box)
       * - if left `undefined`, the box will be grey
       */
      color?: string;
    }
  ): string {
    if (this._values.length === 0) {
      return '';
    }
    const previousPlainOnly = this._plainOnly;
    this._plainOnly ||= !colored;
    try {
      const props = PropsPrinter.safely(() => this.prettifyValues(), [UNREADABLE, UNREADABLE] as [
        string,
        string,
      ]);
      if (box) {
        const color = box.color ?? '#888';
        const requestedDepth = box.depth;
        const hasAttachedDepth = requestedDepth !== undefined && Number.isFinite(requestedDepth);
        const depth = hasAttachedDepth
          ? Math.min(MAX_BOX_DEPTH, Math.max(0, Math.trunc(requestedDepth)))
          : 20;
        const { pre, post } = this.getPropsBox(props, colored, depth, color, hasAttachedDepth);

        return pre + props[colored ? 0 : 1] + post;
      }

      return `\n${props[colored ? 0 : 1]}`;
    } finally {
      this._plainOnly = previousPlainOnly;
    }
  }

  /** @internal renders every prop and joins them into one pair, so the surrounding box keeps
   * operating on a single string. They read like the elements of an array, without its brackets:
   * short enough and they share one line, otherwise each takes its own. */
  private prettifyValues(): [colored: string, plain: string] {
    // one prop that refuses to be read costs its own rendering, not the whole block's
    const prettified = this._values.map((value) =>
      PropsPrinter.safely(() => this.prettifyValue(value), [
        this.colorize(UNREADABLE, ANSIFormat.fgUndefined),
        UNREADABLE,
      ] as [string, string])
    );
    const singleLineLength = prettified.reduce(
      (length, prop, index) => length + prop[1].length + (index === 0 ? 0 : 2),
      0
    );
    const separator = singleLineLength < SHORT_FORM_LIMIT ? ', ' : ',\n';

    return [
      prettified.map((prop) => prop[0]).join(separator),
      prettified.map((prop) => prop[1]).join(separator),
    ];
  }

  /** @internal */
  private getPropsBox(
    props: [colored: string, plain: string],
    colored: boolean,
    depth: number,
    color: string,
    end: boolean
  ) {
    let pre;
    let post;

    if (props[1].length < 50) {
      pre = colored
        ? ANSIFormat.colorize(`\n${new Array(depth).fill(' ').join('')}┃ props> `, color)
        : `\n${new Array(depth).fill(' ').join('')}┃ props> `;
      post = colored ? ANSIFormat.colorize(' <props', color) : ' <props';
    } else {
      // clamp to 0 so a zero-depth column (e.g. the NONE module) does not pass a negative
      // length to `Array(...)`, which would throw `RangeError: Invalid array length`
      const horizontal = new Array(Math.max(0, depth - 1)).fill('─').join('');

      const preEnd = end ? '┘ props>\n' : '\n';
      pre = colored
        ? ANSIFormat.colorize('\n┌' + horizontal + preEnd, color)
        : '\n┌' + horizontal + preEnd;

      const postEnd = end ? '┐ <props' : '';
      post = colored
        ? ANSIFormat.colorize('\n└' + horizontal + postEnd, color)
        : '\n└' + horizontal + postEnd;
    }

    return { pre, post };
  }

  /** @internal */
  private prettifyValue(
    value: unknown,
    depth: number = 0,
    save: boolean = false
  ): [colored: string, plain: string] {
    if (value === null) {
      return this.printUndefined(value);
    }

    if (Array.isArray(value)) {
      if (this.isBeyondDepth(depth)) {
        const text = `[${value.length} elements]`;

        return [this.colorize(text, ANSIFormat.fgUndefined), text];
      }

      return this.guarded(value, () => this.printArray(value, depth, save));
    }

    switch (typeof value) {
      case 'number':
        return this.printNum(value);
      case 'bigint':
        return this.printBigint(value);
      case 'symbol':
        return this.printSymbol(value);
      case 'string':
        return this.printString(value);
      case 'boolean':
        return this.printBoolean(value);
      case 'undefined':
        return this.printUndefined(value);
      case 'function':
        return this.printFunction(value);
      case 'object': {
        if (value instanceof Date) {
          return this.printDate(value);
        }
        // read once, through the guard: a null-prototype object has no `constructor` at all, and
        // reading it unguarded threw `TypeError` out of the logging call
        const className = this.constructorName(value);
        if (className !== 'Object') {
          if (this._shortenObjects && depth > 0) {
            return this.printClass(className);
          }
          if (depth === 0) {
            const prefix = `[Class: ${className}] = `;
            const content = this.guarded(value, () =>
              this.printObject(value as Record<string, any>, depth, save)
            );

            return [this.colorize(prefix, ANSIFormat.fgClass) + content[0], prefix + content[1]];
          }
        }
        if (this.isBeyondDepth(depth)) {
          const count = this.keyCount(value);

          const text = `{${count} entries}`;

          return [this.colorize(text, ANSIFormat.fgUndefined), text];
        }

        return this.guarded(value, () =>
          this.printObject(value as Record<string, any>, depth, save)
        );
      }
      default:
        return this.printDefault(value);
    }
  }

  /** @internal an absent `depth` option leaves no caller-selected limit; every finite number - `0`
   * included - is normalized into one, and the safety cap protects the stack from pathological
   * graphs. */
  private isBeyondDepth(depth: number): boolean {
    return depth >= MAX_RENDER_DEPTH || (this._depth !== undefined && depth >= this._depth);
  }

  /** @internal Skips ANSI construction for `singleLine`, which consumes only the plain half. */
  private colorize(text: string, format: (text: string) => string): string {
    return this._plainOnly ? text : format.call(ANSIFormat, text);
  }

  /** @internal marks `value` as an ancestor on the recursion path while `produce` runs, so a
   * self-reference encountered deeper in the tree renders as `[Circular]` instead of recursing
   * until the stack overflows. The mark is removed on unwind, so a repeated (non-cyclic)
   * reference among siblings is still printed in full. */
  private guarded(
    value: any,
    produce: () => [colored: string, plain: string]
  ): [colored: string, plain: string] {
    if (this._seen.has(value)) {
      return this.printCircular();
    }
    this._seen.add(value);
    try {
      return produce();
    } finally {
      this._seen.delete(value);
    }
  }

  /** @internal */
  private printCircular(): [colored: string, plain: string] {
    const value = '[Circular]';

    return [this.colorize(value, ANSIFormat.fgUndefined), value];
  }

  /** @internal */
  private printDefault(value: any): [colored: string, plain: string] {
    const text = JSON.stringify(value);

    return [this.colorize(text, ANSIFormat.fgTime), text];
  }

  /** @internal */
  private printNum(value: number): [colored: string, plain: string] {
    const text = value.toString();

    return [this.colorize(text, ANSIFormat.fgNumber), text];
  }

  /** @internal */
  private printBigint(value: bigint): [colored: string, plain: string] {
    const text = `${value.toString()}n`;

    return [this.colorize(text, ANSIFormat.fgNumber), text];
  }

  /** @internal */
  private printSymbol(value: symbol): [colored: string, plain: string] {
    const text = sanitizeControlCharacters(value.toString());

    return [this.colorize(text, ANSIFormat.fgString), text];
  }

  /** @internal a rendered string is data, so it carries none of its control characters raw: they
   * would forge log lines and drive the terminal Loxer writes its own ANSI sequences to */
  private printString(value: string): [colored: string, plain: string] {
    const text = `'${sanitizeControlCharacters(value)}'`;

    return [this.colorize(text, ANSIFormat.fgString), text];
  }

  /** @internal */
  private printBoolean(value: boolean): [colored: string, plain: string] {
    const text = value.toString();

    return [this.colorize(text, ANSIFormat.fgBoolean), text];
  }

  /** @internal an invalid `Date` throws `RangeError` on `toISOString()` rather than reporting
   * itself, so it renders as what it is instead */
  private printDate(value: Date): [colored: string, plain: string] {
    const text = PropsPrinter.safely(
      () => sanitizeControlCharacters(Date.prototype.toISOString.call(value)),
      'Invalid Date'
    );

    return [this.colorize(text, ANSIFormat.fgDate), text];
  }

  /** @internal */
  private printUndefined(value: undefined | null): [colored: string, plain: string] {
    const text = value === undefined ? 'undefined' : 'null';

    return [this.colorize(text, ANSIFormat.fgUndefined), text];
  }

  /** @internal a declaration the caller asked to see in full keeps the line breaks that make it
   * readable, and gives up only the control characters that would drive the terminal */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private printFunction(value: Function | (() => any)): [colored: string, plain: string] {
    const name = PropsPrinter.safely(() => sanitizeControlCharacters(String(value.name)), '');
    const fText = name ? `: ${name}` : ' (anonymous)';
    const text = this._printFunction
      ? sanitizeTerminalControlCharacters(
          PropsPrinter.safely(() => Function.prototype.toString.call(value), UNREADABLE)
        )
      : `[Function${fText}]`;

    return [this.colorize(text, ANSIFormat.fgFunction), text];
  }

  /** @internal */
  private printArray(
    values: any[],
    depth: number = 0,
    save: boolean = false
  ): [colored: string, plain: string] {
    const prettified = values
      .filter(
        (value) =>
          !this._keys ||
          save ||
          (typeof value === 'object' && value != null) ||
          Array.isArray(value)
      )
      .map((value) => this.prettifyValue(value, depth + 1, save))
      .filter(
        (pretty) => !this._keys || (!pretty[1].startsWith('[...') && !pretty[1].startsWith('{...'))
      );

    // filtered empty
    const cut = values.length - prettified.length;
    if (prettified.length === 0 && cut > 0) {
      return [this.colorize('[...]', ANSIFormat.fgUndefined), '[...]'];
    }

    // add symbol for cut keys
    if (cut > 0) {
      const text = `+(${cut} elements)`;
      prettified.push([this.colorize(text, ANSIFormat.fgUndefined), text]);
    }

    // return short array
    const short = prettified.map((value) => value[1]).join(', ');
    if (this._singleLine || short.length < SHORT_FORM_LIMIT) {
      const shortColored = prettified.map((value) => value[0]).join(', ');

      return [`[ ${shortColored} ]`, `[ ${short} ]`];
    }

    // return expanded array
    const expanded = prettified
      .map((value) => this.indentString(depth + 1, false) + value[1])
      .join(',\n');
    const expandedColored = prettified
      .map((value) => this.indentString(depth + 1, true) + value[0])
      .join(',\n');

    return [
      `[\n${expandedColored}\n${this.indentString(depth, true)}]`,
      `[\n${expanded}\n${this.indentString(depth, false)}]`,
    ];
  }

  /** @internal */
  private printObject(
    record: Record<string, any>,
    depth: number,
    save: boolean = false
  ): [colored: string, plain: string] {
    const entries = this.entriesOf(record);
    const prettified = entries
      .filter(
        ([key, value]) =>
          !this._keys ||
          save ||
          // `typeof null` is `'object'` too, and reading `constructor` off it throws
          (typeof value === 'object' &&
            value !== null &&
            this.constructorName(value) === 'Object') ||
          Array.isArray(value) ||
          this._keys.includes(key)
      )
      .map(([key, value]) => {
        const pretty = this.prettifyValue(value, depth + 1, save || this._keys?.includes(key));
        // a key is data too - an object can carry any string as one
        const safeKey = sanitizeControlCharacters(key);
        const unColored =
          !pretty[1].startsWith('[...') && !pretty[1].startsWith('{...')
            ? `${safeKey}: ${pretty[1]}`
            : '{...}';
        const keyText = `${safeKey}:`;
        const coloredKey = this._keys?.includes(key)
          ? this.colorize(keyText, ANSIFormat.colorHighlight)
          : keyText;

        return [`${coloredKey} ${pretty[0]}`, unColored];
      })
      .filter(
        (pretty) => !this._keys || (!pretty[1].startsWith('[...') && !pretty[1].startsWith('{...'))
      );

    // filtered empty
    const cut = entries.length - prettified.length;
    if (prettified.length === 0 && cut > 0) {
      return [this.colorize('{...}', ANSIFormat.fgUndefined), '{...}'];
    }

    // add symbol for cut keys
    if (cut > 0) {
      const text = `+(${cut} entries)`;
      prettified.push([this.colorize(text, ANSIFormat.fgUndefined), text]);
    }

    // return short object
    const short = prettified.map((value) => value[1]).join(', ');
    if (this._singleLine || short.length < SHORT_FORM_LIMIT) {
      const shortColored = prettified.map((value) => value[0]).join(', ');

      return [`{ ${shortColored} }`, `{ ${short} }`];
    }

    // return expanded object
    const expanded = prettified
      .map((value) => this.indentString(depth + 1, false) + value[1])
      .join(',\n');
    const expandedColored = prettified
      .map((value) => this.indentString(depth + 1, true) + value[0])
      .join(',\n');

    return [
      `{\n${expandedColored}\n${this.indentString(depth, true)}}`,
      `{\n${expanded}\n${this.indentString(depth, false)}}`,
    ];
  }

  /** @internal */
  private printClass(value: string): [colored: string, plain: string] {
    const text = `[Class: ${value}]`;

    return [this.colorize(text, ANSIFormat.fgClass), text];
  }

  /** @internal returns a specified string of spaces (and vertical indent indicators) */
  private indentString(depth: number = 0, colored: boolean = true) {
    const line = colored && !this._plainOnly ? ANSIFormat.fgLine('┊') : '┊';
    const spaces = new Array(depth * this._indent).fill(' ');

    return this._showVerticalLines
      ? spaces.map((_, index) => (index % this._indent === 0 ? line : ' ')).join('')
      : spaces.join('');
  }
}

/** @internal Turns an arbitrary value into the one-line, escape-free `string` a message is.
 *
 * A primitive takes `String()`, while an object or a function renders as one compact line through
 * {@link PropsPrinter.singleLine}, so `Loxer.log(payment)` reads as its contents rather than as
 * `[object Object]` and a function reports `[Function: name]` rather than its whole body.
 *
 * An omitted value and an explicit `undefined` both produce an empty string: a default parameter
 * cannot tell them apart, and the `(message?, ...props)` shape is worth more than the distinction.
 *
 * The result carries control-character escaping, which is what makes the single line unconditional:
 * a `\n` in a message would leave the box column open from the second line on.
 *
 * Shared by `Loxer`'s own message funnel and by the `fn` / `parentFn` printers a trace callback
 * receives, so a value reads the same whichever of the two rendered it.
 */
export function stringifyMessage(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object' || typeof value === 'function') {
    return sanitizeControlCharacters(PropsPrinter.singleLine(value));
  }

  return sanitizeControlCharacters(String(value));
}
