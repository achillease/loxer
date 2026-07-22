import { Lox } from '../loxes/Lox.js';
import { ANSIFormat } from './ANSIFormat.js';

/** any primitive and non primitive type that an `Item`can be composed of */
export type ItemType =
  | number
  | bigint
  | symbol
  | string
  | boolean
  // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
  | Object
  | any[]
  | (() => any)
  | null
  | undefined;

/** the options to configure the "default" output of the item */
export interface ItemOptions {
  /** at which object / array depth, other objects / arrays should just be displayed as their type + length. defaults to `infinity` */
  depth?: number;
  /** should a function be printed with its complete declaration. defaults to `false` */
  printFunction?: boolean;
  /** the indent that nested objects / arrays have (when not shortened to 1 line). defaults to `2` */
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
   * - defaults to `true` (except if the item itself is a class)
   * - if disabled, the object will be displayed as destructed object with its properties
   * - **ATTENTION** displaying nested classes (classes have classes as props) can lead to exceeding the stack size,
   *   especially if the contain cyclic structures
   */
  shortenClasses?: boolean;
}

/** A helper class that can be used to pretty print **items** of `Lox`es */
export class Item {
  /** @internal */
  private _item: ItemType;
  /** @internal */
  private _depth: number;
  /** @internal */
  private _printFunction: boolean;
  /** @internal */
  private _indent: number;
  /** @internal */
  private _showVerticalLines: boolean;
  /** @internal */
  private _keys: string[] | undefined;
  /** @internal */
  private _shortenObjects?: boolean;
  /** @internal the objects/arrays currently on the recursion path, used to detect cycles */
  private _seen: WeakSet<any> = new WeakSet();

  /**
   * @internal
   * @param lox to pretty print the item of
   */
  private constructor(lox: Lox) {
    this._item = lox.item;
    this._depth = lox.itemOptions?.depth ?? 0;
    this._printFunction = lox.itemOptions?.printFunction ?? false;
    this._indent = lox.itemOptions?.indent ?? 2;
    this._showVerticalLines =
      lox.itemOptions?.showVerticalLines !== undefined ? lox.itemOptions.showVerticalLines : true;
    this._keys = lox.itemOptions?.keys;
    this._shortenObjects =
      lox.itemOptions?.shortenClasses !== undefined ? lox.itemOptions.shortenClasses : true;
  }

  /** The static constructor of the Item helper class. Use it for any `OutputLox` or `ErrorLox`:
   * ```typescript
   * Item.of(outputLox)
   * ```
   * @param lox to pretty print the item for
   * @returns a chained function `prettify(...)` to pretty print the item of the lox
   */
  static of(lox: Lox): Item {
    return new Item(lox);
  }

  /**
   * prettifies the output of a Lox' item - similar to what the `console` methods do, but with some improvements:
   * - the depth of objects / arrays is not bound to 3
   * - the indent is configurable
   * - indent is shown with vertical indicator lines
   * - objects can be filtered to specific keys (helpful when dealing with large items)
   *
   * ###### Example
   * ```typescript
   * Item.of(outputLox).prettify(true, {
   *   depth: outputLox.module.slicedName.length + outputLox.box.length,
   *   color: outputLox.module.color,
   * })
   * ```
   *
   * @param colored should the output be colored (with ANSI colors)
   * @param box options for the box surrounding the printed item
   * @returns a pretty string of the item
   */
  public prettify(
    colored: boolean = true,
    box?: {
      /** the vertical depth, where the box starts / ends (typically the column of the log's box)
       * - if left `undefined`, the box will be grey
       */
      depth?: number;
      /** color of the box and surrounding text (typically the color of the log's box)
       * - if left `undefined` the box will have a depth of 20 and is not connected to the surrounding box layout
       */
      color?: string;
    }
  ): string {
    const item = this.prettifyItem(this._item);
    if (box) {
      const color = box.color ?? '#888';
      const depth = box.depth ?? 20;
      const end = box.depth !== undefined;
      const { pre, post } = this.getItemBox(item, colored, depth, color, end);

      return pre + item[colored ? 0 : 1] + post;
    }

    return `\n${item[colored ? 0 : 1]}`;
  }

  /** @internal */
  private getItemBox(
    item: [colored: string, plain: string],
    colored: boolean,
    depth: number,
    color: string,
    end: boolean
  ) {
    let pre;
    let post;

    if (item[1].length < 50) {
      pre = colored
        ? ANSIFormat.colorize(`\n${Array(depth).fill(' ').join('')}┃ item> `, color)
        : `\n${Array(depth).fill(' ').join('')}┃ item> `;
      post = colored ? ANSIFormat.colorize(' <item', color) : ' <item';
    } else {
      // clamp to 0 so a zero-depth column (e.g. the NONE module) does not pass a negative
      // length to `Array(...)`, which would throw `RangeError: Invalid array length`
      const horizontal = Array(Math.max(0, depth - 1))
        .fill('─')
        .join('');

      const preEnd = end ? '┘ item>\n' : '\n';
      pre = colored
        ? ANSIFormat.colorize('\n┌' + horizontal + preEnd, color)
        : '\n┌' + horizontal + preEnd;

      const postEnd = end ? '┐ <item' : '';
      post = colored
        ? ANSIFormat.colorize('\n└' + horizontal + postEnd, color)
        : '\n└' + horizontal + postEnd;
    }

    return { pre, post };
  }

  /** @internal */
  private prettifyItem(
    item: ItemType,
    depth: number = 0,
    save: boolean = false
  ): [colored: string, plain: string] {
    if (item === null) {
      return this.printUndefined(item);
    }

    if (Array.isArray(item)) {
      if (this._depth > 0 && depth >= this._depth) {
        return [ANSIFormat.fgUndefined(`[${item.length} elements]`), `[${item.length} elements]`];
      }

      return this.guarded(item, () => this.printArray(item, depth, save));
    }

    switch (typeof item) {
      case 'number':
        return this.printNum(item);
      case 'bigint':
        return this.printBigint(item);
      case 'symbol':
        return this.printSymbol(item);
      case 'string':
        return this.printString(item);
      case 'boolean':
        return this.printBoolean(item);
      case 'undefined':
        return this.printUndefined(item);
      case 'function':
        return this.printFunction(item);
      case 'object':
        if (item instanceof Date) {
          return this.printDate(item);
        }
        if (item.constructor?.name !== 'Object') {
          if (this._shortenObjects && depth > 0) {
            return this.printClass(item.constructor.name);
          }
          if (depth === 0) {
            const prefix = `[Class: ${item.constructor.name}] = `;
            const content = this.guarded(item, () => this.printObject(item, depth, save));

            return [ANSIFormat.fgFunction(prefix) + content[0], prefix + content[1]];
          }
        }
        if (this._depth > 0 && depth >= this._depth) {
          return [
            ANSIFormat.fgUndefined(`{${Object.keys(item).length} entries}`),
            `{${Object.keys(item).length} entries}`,
          ];
        }

        return this.guarded(item, () => this.printObject(item, depth, save));
      default:
        return this.printDefault(item);
    }
  }

  /** @internal marks `item` as an ancestor on the recursion path while `produce` runs, so a
   * self-reference encountered deeper in the tree renders as `[Circular]` instead of recursing
   * until the stack overflows. The mark is removed on unwind, so a repeated (non-cyclic)
   * reference among siblings is still printed in full. */
  private guarded(
    item: any,
    produce: () => [colored: string, plain: string]
  ): [colored: string, plain: string] {
    if (this._seen.has(item)) {
      return this.printCircular();
    }
    this._seen.add(item);
    const result = produce();
    this._seen.delete(item);

    return result;
  }

  /** @internal */
  private printCircular(): [colored: string, plain: string] {
    const value = '[Circular]';

    return [ANSIFormat.fgUndefined(value), value];
  }

  /** @internal */
  private printDefault(item: any): [colored: string, plain: string] {
    const value = JSON.stringify(item);

    return [ANSIFormat.fgTime(value), value];
  }

  /** @internal */
  private printNum(item: number): [colored: string, plain: string] {
    const value = item.toString();

    return [ANSIFormat.fgNumber(value), value];
  }

  /** @internal */
  private printBigint(item: bigint): [colored: string, plain: string] {
    const value = `${item.toString()}n`;

    return [ANSIFormat.fgNumber(value), value];
  }

  /** @internal */
  private printSymbol(item: symbol): [colored: string, plain: string] {
    const value = item.toString();

    return [ANSIFormat.fgString(value), value];
  }

  /** @internal */
  private printString(item: string): [colored: string, plain: string] {
    const value = `'${item}'`;

    return [ANSIFormat.fgString(value), value];
  }

  /** @internal */
  private printBoolean(item: boolean): [colored: string, plain: string] {
    const value = item.toString();

    return [ANSIFormat.fgBoolean(value), value];
  }

  /** @internal */
  private printDate(item: Date): [colored: string, plain: string] {
    const value = item.toISOString();

    return [ANSIFormat.fgDate(value), value];
  }

  /** @internal */
  private printUndefined(item: undefined | null): [colored: string, plain: string] {
    const value = item === undefined ? 'undefined' : 'null';

    return [ANSIFormat.fgUndefined(value), value];
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private printFunction(item: Function | (() => any)): [colored: string, plain: string] {
    const fText = item.name ? `: ${item.name}` : ' (anonymous)';
    const value = this._printFunction ? item.toString() : `[Function${fText}]`;

    return [ANSIFormat.fgFunction(value), value];
  }

  /** @internal */
  private printArray(
    items: any[],
    depth: number = 0,
    save: boolean = false
  ): [colored: string, plain: string] {
    const prettified = items
      .filter(
        (item) =>
          !this._keys || save || (typeof item === 'object' && item != null) || Array.isArray(item)
      )
      .map((item) => this.prettifyItem(item, depth + 1, save))
      .filter(
        (pretty) => !this._keys || (!pretty[1].startsWith('[...') && !pretty[1].startsWith('{...'))
      );

    // filtered empty
    const cut = items.length - prettified.length;
    if (prettified.length === 0 && cut > 0) {
      return [ANSIFormat.fgUndefined('[...]'), '[...]'];
    }

    // add symbol for cut keys
    if (cut > 0) {
      prettified.push([ANSIFormat.fgUndefined(`+(${cut} elements)`), `+(${cut} elements)`]);
    }

    // return short array
    const short = prettified.map((item) => item[1]).join(', ');
    if (short.length < 70) {
      const shortColored = prettified.map((item) => item[0]).join(', ');

      return [`[ ${shortColored} ]`, `[ ${short} ]`];
    }

    // return expanded array
    const expanded = prettified
      .map((item) => this.indentString(depth + 1, false) + item[1])
      .join(',\n');
    const expandedColored = prettified
      .map((item) => this.indentString(depth + 1, true) + item[0])
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
    const prettified = Object.entries(record)
      .filter(
        ([key, value]) =>
          !this._keys ||
          save ||
          (typeof value === 'object' && value.constructor?.name === 'Object') ||
          Array.isArray(value) ||
          this._keys.includes(key)
      )
      .map(([key, value]) => {
        const pretty = this.prettifyItem(value, depth + 1, save || this._keys?.includes(key));
        const unColored =
          !pretty[1].startsWith('[...') && !pretty[1].startsWith('{...')
            ? `${key}: ${pretty[1]}`
            : '{...}';
        const coloredKey = this._keys?.includes(key)
          ? ANSIFormat.colorHighlight(`${key}:`)
          : `${key}:`;

        return [`${coloredKey} ${pretty[0]}`, unColored];
      })
      .filter(
        (pretty) => !this._keys || (!pretty[1].startsWith('[...') && !pretty[1].startsWith('{...'))
      );

    // filtered empty
    const cut = Object.keys(record).length - prettified.length;
    if (prettified.length === 0 && cut > 0) {
      return [ANSIFormat.fgUndefined('{...}'), '{...}'];
    }

    // add symbol for cut keys
    if (cut > 0) {
      prettified.push([ANSIFormat.fgUndefined(`+(${cut} entries)`), `+(${cut} entries)`]);
    }

    // return short object
    const short = prettified.map((item) => item[1]).join(', ');
    if (short.length < 70) {
      const shortColored = prettified.map((item) => item[0]).join(', ');

      return [`{ ${shortColored} }`, `{ ${short} }`];
    }

    // return expanded object
    const expanded = prettified
      .map((item) => this.indentString(depth + 1, false) + item[1])
      .join(',\n');
    const expandedColored = prettified
      .map((item) => this.indentString(depth + 1, true) + item[0])
      .join(',\n');

    return [
      `{\n${expandedColored}\n${this.indentString(depth, true)}}`,
      `{\n${expanded}\n${this.indentString(depth, false)}}`,
    ];
  }

  /** @internal */
  private printClass(item: string): [colored: string, plain: string] {
    const text = `[Class: ${item}]`;

    return [ANSIFormat.fgFunction(text), text];
  }

  /** @internal returns a specified string of spaces (and vertical indent indicators) */
  private indentString(depth: number = 0, colored: boolean = true) {
    const line = colored ? ANSIFormat.fgLine('┊') : '┊';
    const spaces = Array(depth * this._indent).fill(' ');

    return this._showVerticalLines
      ? spaces.map((_, index) => (index % this._indent === 0 ? line : ' ')).join('')
      : spaces.join('');
  }
}
