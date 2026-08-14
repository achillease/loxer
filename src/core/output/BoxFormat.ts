export interface BoxSymbols {
  /** the little (left) arrow at the end of the opening box */
  openEnd: string;
  /** the edge that goes from right to bottom */
  openEdge: string;
  /** a vertical dash `|` used for deeper branches in other box rows */
  vertical: string;
  /** a horizontal dash used for closing lines over empty background AND as the end of single logs / errors */
  horizontal: string;
  /** a rotated T, used to branch single logs / errors from the main stream */
  single: string;
  /** the symbol for overlapping branches */
  cross: string;
  /** the edge that goes from top to right */
  closeEdge: string;
  /** the little (right) arrow at the end of a closing log */
  closeEnd: string;
}
/** @internal */
export type BoxLayoutStyle = 'round' | 'light' | 'heavy' | 'double' | 'off';
/** @internal */
export type BoxLayoutCollection = { [id in BoxLayoutStyle]: BoxSymbols };

/** @internal */
export const BoxLayouts: BoxLayoutCollection = {
  round: {
    openEnd: '\u2190',
    closeEnd: '\u2192',
    openEdge: '\u256d',
    closeEdge: '\u2570',
    vertical: '\u2502',
    horizontal: '\u2500',
    single: '\u251c',
    cross: '\u2506',
  },
  light: {
    openEnd: '\u2190',
    closeEnd: '\u2192',
    openEdge: '\u250c',
    closeEdge: '\u2514',
    vertical: '\u2502',
    horizontal: '\u2500',
    single: '\u251c',
    cross: '\u253c',
  },
  heavy: {
    openEnd: '\u2501',
    closeEnd: '\u2501',
    openEdge: '\u250f',
    closeEdge: '\u2517',
    vertical: '\u2503',
    horizontal: '\u2501',
    single: '\u2523',
    cross: '\u254B',
  },
  double: {
    openEnd: '\u2190',
    closeEnd: '\u2192',
    openEdge: '\u2553',
    closeEdge: '\u2559',
    vertical: '\u2551',
    horizontal: '\u2500',
    single: '\u255f',
    cross: '\u256b',
  },
  off: {
    openEnd: ' ',
    closeEnd: ' ',
    openEdge: ' ',
    closeEdge: ' ',
    vertical: ' ',
    horizontal: ' ',
    single: ' ',
    cross: ' ',
  },
};
