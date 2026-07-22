import { Color, parseColorToRgb } from '../src/core/color/parseColor';
import { COLOR_NAMES } from '../src/core/color';

describe('parseColorToRgb - hex', () => {
  test('parses a 6-digit hex color', () => {
    expect(parseColorToRgb('#102030')).toEqual([16, 32, 48]);
  });

  test('parses a 3-digit hex shorthand by doubling each digit', () => {
    expect(parseColorToRgb('#647')).toEqual([102, 68, 119]);
  });

  test('parses a 4-digit hex shorthand (rgba) and drops the alpha channel', () => {
    // #6478 expands to #66447788 -> same rgb as #647, alpha (0x88) is parsed but not returned
    expect(parseColorToRgb('#6478')).toEqual([102, 68, 119]);
  });

  test('parses an 8-digit hex (rrggbbaa) and drops the alpha channel', () => {
    expect(parseColorToRgb('#102030ff')).toEqual([16, 32, 48]);
    expect(parseColorToRgb('#10203080')).toEqual([16, 32, 48]);
  });
});

describe('parseColorToRgb - rgb()/rgba()', () => {
  test('parses plain rgb()', () => {
    expect(parseColorToRgb('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
  });

  test('parses rgba() and drops the alpha channel', () => {
    expect(parseColorToRgb('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  test('clamps out-of-range channels to 0-255', () => {
    expect(parseColorToRgb('rgb(300, -5, 20)')).toEqual([255, 0, 20]);
  });

  test('parses percent-based rgb(), rounding each channel', () => {
    // 50 * 2.55 is 127.49999999999999 in IEEE-754 double precision (not exactly
    // 127.5), so Math.round rounds it down to 127, not 128 - a genuine float-
    // precision artifact inherited from the ported color-string math, not a bug.
    expect(parseColorToRgb('rgb(50%, 0%, 100%)')).toEqual([127, 0, 255]);
  });
});

describe('parseColorToRgb - hsl()/hsla()', () => {
  test('parses pure red', () => {
    const rgb = parseColorToRgb('hsl(0, 100%, 50%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(255);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(0);
  });

  test('parses pure green', () => {
    const rgb = parseColorToRgb('hsl(120, 100%, 50%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(0);
    expect(rgb?.[1]).toBeCloseTo(255);
    expect(rgb?.[2]).toBeCloseTo(0);
  });

  test('returns unrounded float channels for non-boundary values', () => {
    // hsl(0, 50%, 50%) -> l >= 0.5 branch: t2 = 0.75, t1 = 0.25 -> [191.25, 63.75, 63.75]
    const rgb = parseColorToRgb('hsl(0, 50%, 50%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(191.25);
    expect(rgb?.[1]).toBeCloseTo(63.75);
    expect(rgb?.[2]).toBeCloseTo(63.75);
    // the value is not an integer - the caller (not the parser) is responsible for rounding
    expect(Number.isInteger(rgb?.[0])).toBe(false);
  });

  test('takes the s === 0 grayscale short-circuit (l * 255 on every channel)', () => {
    // saturation 0 -> hslToRgb returns [l*255, l*255, l*255] directly
    const rgb = parseColorToRgb('hsl(0, 0%, 50%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(127.5);
    expect(rgb?.[1]).toBeCloseTo(127.5);
    expect(rgb?.[2]).toBeCloseTo(127.5);
  });

  test('normalizes a negative hue via (h + 360) % 360', () => {
    // -120 wraps to 240 -> identical to the positive-hue equivalent (blue)
    const wrapped = parseColorToRgb('hsl(-120, 100%, 50%)');
    const positive = parseColorToRgb('hsl(240, 100%, 50%)');
    expect(wrapped).not.toBeNull();
    expect(wrapped).toEqual(positive);
    expect(wrapped?.[0]).toBeCloseTo(0);
    expect(wrapped?.[1]).toBeCloseTo(0);
    expect(wrapped?.[2]).toBeCloseTo(255);
  });

  test('clamps out-of-range saturation to 0-100', () => {
    // s = 150% clamps to 100% -> identical to pure red hsl(0, 100%, 50%)
    const rgb = parseColorToRgb('hsl(0, 150%, 50%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(255);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(0);
  });
});

describe('parseColorToRgb - hwb()', () => {
  test('parses pure red', () => {
    const rgb = parseColorToRgb('hwb(0, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(255);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(0);
  });

  test('parses pure blue', () => {
    const rgb = parseColorToRgb('hwb(240, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(0);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(255);
  });

  // The 6-branch hue switch in hwbToRgb assigns r/g/b in a different order per
  // segment; red (case 0) and blue (case 4) are covered above, so exercise the
  // remaining hue segments (cases 1, 2, 3, 5) so a swapped channel can't slip in.
  test('parses pure yellow (hue segment i = 1)', () => {
    const rgb = parseColorToRgb('hwb(60, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(255);
    expect(rgb?.[1]).toBeCloseTo(255);
    expect(rgb?.[2]).toBeCloseTo(0);
  });

  test('parses pure green (hue segment i = 2)', () => {
    const rgb = parseColorToRgb('hwb(120, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(0);
    expect(rgb?.[1]).toBeCloseTo(255);
    expect(rgb?.[2]).toBeCloseTo(0);
  });

  test('parses pure cyan (hue segment i = 3)', () => {
    const rgb = parseColorToRgb('hwb(180, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(0);
    expect(rgb?.[1]).toBeCloseTo(255);
    expect(rgb?.[2]).toBeCloseTo(255);
  });

  test('parses pure magenta (hue segment i = 5)', () => {
    const rgb = parseColorToRgb('hwb(300, 0%, 0%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(255);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(255);
  });

  test('normalizes whiteness + blackness when their sum exceeds 1', () => {
    // wh = bl = 0.6 -> ratio 1.2 > 1 -> both scaled to 0.5 -> mid-grey
    const rgb = parseColorToRgb('hwb(0, 60%, 60%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(127.5);
    expect(rgb?.[1]).toBeCloseTo(127.5);
    expect(rgb?.[2]).toBeCloseTo(127.5);
  });

  test('normalizes a negative hue via ((h % 360) + 360) % 360', () => {
    // -120 wraps to 240 -> identical to the positive-hue equivalent (blue)
    const wrapped = parseColorToRgb('hwb(-120, 0%, 0%)');
    const positive = parseColorToRgb('hwb(240, 0%, 0%)');
    expect(wrapped).not.toBeNull();
    expect(wrapped).toEqual(positive);
    expect(wrapped?.[2]).toBeCloseTo(255);
  });

  test('clamps out-of-range whiteness/blackness to 0-100', () => {
    // w = -10% clamps to 0, b = 110% clamps to 100 -> full blackness -> black
    const rgb = parseColorToRgb('hwb(0, -10%, 110%)');
    expect(rgb).not.toBeNull();
    expect(rgb?.[0]).toBeCloseTo(0);
    expect(rgb?.[1]).toBeCloseTo(0);
    expect(rgb?.[2]).toBeCloseTo(0);
  });
});

describe('parseColorToRgb - named colors', () => {
  test('parses a lowercase named color', () => {
    expect(parseColorToRgb('red')).toEqual([255, 0, 0]);
  });

  test('parses a multi-word named color from the vendored table', () => {
    expect(parseColorToRgb('rebeccapurple')).toEqual([102, 51, 153]);
  });

  test('parses another named color', () => {
    expect(parseColorToRgb('cornflowerblue')).toEqual([100, 149, 237]);
  });

  test('does not lowercase the keyword before lookup, so uppercase names do not resolve', () => {
    // the keyword branch looks up COLOR_NAMES[match[1]] directly, without any
    // case-normalization - COLOR_NAMES keys are all lowercase, so 'RED' misses.
    expect(parseColorToRgb('RED')).toBeNull();
  });

  test('parses "transparent" as black (rgb channels only, alpha is dropped)', () => {
    expect(parseColorToRgb('transparent')).toEqual([0, 0, 0]);
  });
});

describe('parseColorToRgb - unparseable input', () => {
  test('returns null for a nonsense string', () => {
    expect(parseColorToRgb('not-a-color')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(parseColorToRgb('')).toBeNull();
  });
});

describe('parseColorToRgb - array-copy regression (color-string@1.6.0 shared-array bug)', () => {
  test('returns a fresh array on each call for a named color, and mutation does not leak', () => {
    const first = parseColorToRgb('red');
    const second = parseColorToRgb('red');

    expect(first).toEqual([255, 0, 0]);
    expect(second).toEqual([255, 0, 0]);
    // must be distinct array instances, not the same shared reference
    expect(first).not.toBe(second);

    // mutating the first result must not affect a subsequent parse of the same color
    if (first) {
      first[0] = 999;
    }
    const third = parseColorToRgb('red');
    expect(third).toEqual([255, 0, 0]);

    // the shared name-table entry itself must remain pristine
    expect(COLOR_NAMES.red).toEqual([255, 0, 0]);
  });
});

describe('Color()', () => {
  test('exposes red()/green()/blue() matching parseColorToRgb', () => {
    const color = Color('#102030');
    expect(color.red()).toBe(16);
    expect(color.green()).toBe(32);
    expect(color.blue()).toBe(48);
  });

  test('red()/green()/blue() are unrounded floats, matching parseColorToRgb', () => {
    const color = Color('hsl(0, 50%, 50%)');
    expect(color.red()).toBeCloseTo(191.25);
    expect(color.green()).toBeCloseTo(63.75);
    expect(color.blue()).toBeCloseTo(63.75);
  });

  test('throws on an unparseable string', () => {
    expect(() => Color('not-a-color')).toThrow();
  });

  test('throws on an empty string', () => {
    expect(() => Color('')).toThrow();
  });
});
