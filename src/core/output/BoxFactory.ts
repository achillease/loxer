import { OutputLox } from '../../loxes/OutputLox.js';
import { ANSIFormat } from './ANSIFormat.js';
import { BoxLayouts, BoxLayoutStyle, BoxSymbols } from './BoxFormat.js';
import { Loxes } from '../runtime/Loxes.js';

export type Box = (BoxSegment | 'empty')[];

export type BoxSegment = { box: keyof BoxSymbols; color: string; boxLayout?: BoxLayoutStyle };

/** A Factory used to construct the BoxLayout for `*Lox`es */
export class BoxFactory {
  /** @internal */
  private constructor() {
    // static class
  }

  /** @internal */
  static getLogBox(lox: OutputLox, loxes: Loxes): Box {
    if (lox.hidden) {
      return [];
    }

    return lox.type === 'open' ? this.getOpenLogBox(lox, loxes) : this.getOfLogBox(lox, loxes);
  }

  /** @internal */
  static getOpenLogBox(lox: OutputLox, loxes: Loxes): Box {
    if (lox.moduleId === 'INVALID' || lox.moduleId === 'NONE') {
      return [];
    }
    const box: Box = [];
    // print the depth before the start
    for (const bufferLox of loxes.getBuffer()) {
      // unreachable for a fresh open, and deliberately kept: `switchOutput` builds the box in
      // `toOutputLox` before `proceedOpenLox` adds the lox to the buffer, so an opening lox is never
      // in the buffer while its own box renders. Removing this, or building the box after the buffer
      // is filled, changes every open line - the column-free ones included, which reach this loop
      // for the enclosing verticals alone.
      if (lox.id === bufferLox?.id) {
        break;
      }
      box.push(
        bufferLox
          ? {
              box: 'vertical',
              color: bufferLox.module.color,
              boxLayout: bufferLox.module.boxLayoutStyle,
            }
          : 'empty'
      );
    }
    // print the start of the box
    box.push(
      { box: 'openEdge', color: lox.module.color, boxLayout: lox.module.boxLayoutStyle },
      { box: 'openEnd', color: lox.module.color, boxLayout: lox.module.boxLayoutStyle }
    );

    return box;
  }

  /** @internal */
  static getOfLogBox(lox: OutputLox, loxes: Loxes): Box {
    if (lox.moduleId === 'INVALID' || lox.moduleId === 'NONE') {
      return [];
    }
    const box: Box = [];
    const color = lox.module.color;
    let found = false;
    for (const bufferLox of loxes.getBuffer()) {
      const itemColor = bufferLox?.module.color ?? '';
      const boxLayout = bufferLox?.module.boxLayoutStyle;
      if (!found) {
        if (lox.id === bufferLox?.id) {
          // print occurrence
          box.push({ box: lox.type === 'close' ? 'closeEdge' : 'single', color, boxLayout });
          found = true;
        } else {
          // print depth before occurrence
          box.push(bufferLox ? { box: 'vertical', color: itemColor, boxLayout } : 'empty');
        }
      } else {
        // print depth after occurrence
        box.push(
          bufferLox
            ? { box: 'cross', color: itemColor, boxLayout }
            : { box: 'horizontal', color, boxLayout }
        );
      }
    }
    // A column-free box owns no buffer slot, so the loop above never finds it and never emits its
    // edge. Its close still marks where the flow ends, so the edge is pushed here instead, taking
    // the layout off the module because there is no buffer entry to read one from.
    if (lox.columnFree && !found && lox.type === 'close') {
      box.push({ box: 'closeEdge', color, boxLayout: lox.module.boxLayoutStyle });
    }
    // print line end
    box.push({
      box: lox.type === 'close' ? 'closeEnd' : 'horizontal',
      color,
      boxLayout: lox.module.boxLayoutStyle,
    });

    return box;
  }

  /**
   * The column, relative to the start of the box, at which this log's own marker sits — i.e. the
   * edge / single segment (`openEdge`, `single` or `closeEdge`) produced by `getOpenLogBox` /
   * `getOfLogBox` for the log itself. Everything before it is the `vertical` line of an enclosing
   * open box; everything after it is a `cross` / `horizontal`. A props box uses this to connect to
   * the log's box column (branching off the box layout) instead of floating out at the message.
   *
   * @param box the `Box` of an `OutputLox` or `ErrorLox`
   * @returns the index of the log's marker, or `0` for a box without one (`NONE` / hidden logs)
   */
  static getMarkerDepth(box: Box): number {
    const index = box.findIndex((segment) => segment !== 'empty' && segment.box !== 'vertical');

    return Math.max(index, 0);
  }

  /**
   * Creates a string version of the given `*Lox` box.
   *
   * ## Single Usage
   * ```typescript
   * const lox: OutputLox = ... // `event.lox` in an output stream (also `ErrorLox`)
   * const box = BoxFactory.getBoxString(lox.box, { colored: true });
   * ```
   *
   * @param box the `Box` of an `OutputLox` or `ErrorLox`
   * @param options selects colored output and a fallback box layout
   * @returns a stringified version of the given box
   */
  static getBoxString(
    box: Box,
    options: { colored?: boolean; boxLayoutStyle?: BoxLayoutStyle } = {}
  ): string {
    const result = box
      .map((segment) => {
        if (segment === 'empty') {
          return ' ';
        }
        const boxLayout = segment.boxLayout ?? options.boxLayoutStyle ?? 'round';
        if (options.colored ?? true) {
          return ANSIFormat.colorize(BoxLayouts[boxLayout][segment.box], segment.color);
        }

        return BoxLayouts[boxLayout][segment.box];
      })
      .join('');

    return result.length > 0 ? `${result} ` : result;
  }
}
