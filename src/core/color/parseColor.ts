/**
 * Minimal CSS color-string parser: turns a color string into RGB channels.
 *
 * Vendored to remove the runtime `color` dependency. Loxer only ever needs to
 * turn a color string into its red/green/blue channels (see `ANSIFormat`), so
 * only the parse path is reproduced here — none of the color-model serializers.
 *
 * Parsing is ported from `color-string@1.6.0` (`get`, `get.rgb`, `get.hsl`,
 * `get.hwb`); the `hsl`/`hwb` -> `rgb` math is ported from `color-convert@1.9.3`
 * (`hsl.rgb`, `hwb.rgb`). Both MIT.
 * Copyright (c) 2011-2016 Heather Arthur <fayearthur@gmail.com>
 * https://github.com/Qix-/color-string, https://github.com/Qix-/color-convert
 */

import { COLOR_NAMES } from './colorNames.js';

/** an `[r, g, b, a]` tuple; channels 0-255, alpha 0-1 */
type Rgba = [number, number, number, number];

// These patterns are static, so they are compiled once at module load rather than
// reconstructed on every parse call (this parser sits on the per-log console-output path).
// None carry the `g` flag, so there is no shared `lastIndex` state to worry about.
const RE_ABBR = /^#([a-f0-9]{3,4})$/i;
const RE_HEX = /^#([a-f0-9]{6})([a-f0-9]{2})?$/i;
const RE_RGBA =
  /^rgba?\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
const RE_PERCENT =
  /^rgba?\(\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
const RE_KEYWORD = /(\D+)/;
const RE_HSL =
  /^hsla?\(\s*([+-]?(?:\d{0,3}\.)?\d+)(?:deg)?\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[,|/]\s*([+-]?[\d.]+)\s*)?\)$/;
const RE_HWB =
  /^hwb\(\s*([+-]?\d{0,3}(?:\.\d+)?)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(min, num), max);
}

/** parses `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, `rgb()/rgba()`, and named colors */
function getRgb(string: string): Rgba | null {
  if (!string) {
    return null;
  }

  const rgb: Rgba = [0, 0, 0, 1];
  let match: RegExpMatchArray | null;
  let hexAlpha: string | undefined;

  if ((match = string.match(RE_HEX))) {
    hexAlpha = match[2];
    const value = match[1];

    for (let i = 0; i < 3; i++) {
      const i2 = i * 2;
      rgb[i] = parseInt(value.slice(i2, i2 + 2), 16);
    }

    if (hexAlpha) {
      rgb[3] = parseInt(hexAlpha, 16) / 255;
    }
  } else if ((match = string.match(RE_ABBR))) {
    const value = match[1];
    hexAlpha = value[3];

    for (let i = 0; i < 3; i++) {
      rgb[i] = parseInt(value[i] + value[i], 16);
    }

    if (hexAlpha) {
      rgb[3] = parseInt(hexAlpha + hexAlpha, 16) / 255;
    }
  } else if ((match = string.match(RE_RGBA))) {
    for (let i = 0; i < 3; i++) {
      rgb[i] = parseInt(match[i + 1], 10);
    }

    if (match[4]) {
      rgb[3] = parseFloat(match[4]);
    }
  } else if ((match = string.match(RE_PERCENT))) {
    for (let i = 0; i < 3; i++) {
      rgb[i] = Math.round(parseFloat(match[i + 1]) * 2.55);
    }

    if (match[4]) {
      rgb[3] = parseFloat(match[4]);
    }
  } else if ((match = string.match(RE_KEYWORD))) {
    if (match[1] === 'transparent') {
      return [0, 0, 0, 0];
    }

    // own-property check so inherited members (`constructor`, `toString`, …) do not
    // resolve to an `Object.prototype` value and produce NaN channels instead of null
    const named = Object.hasOwn(COLOR_NAMES, match[1]) ? COLOR_NAMES[match[1]] : undefined;

    if (!named) {
      return null;
    }

    // copy the shared name-table entry rather than mutating it (color-string@1.6.0 bug)
    return [named[0], named[1], named[2], 1];
  } else {
    return null;
  }

  for (let i = 0; i < 3; i++) {
    rgb[i] = clamp(rgb[i], 0, 255);
  }
  rgb[3] = clamp(rgb[3], 0, 1);

  return rgb;
}

/** parses `hsl()/hsla()` into an `[h, s, l, a]` tuple */
function getHsl(string: string): Rgba | null {
  if (!string) {
    return null;
  }

  const match = string.match(RE_HSL);

  if (match) {
    const alpha = parseFloat(match[4]);
    const h = (parseFloat(match[1]) + 360) % 360;
    const s = clamp(parseFloat(match[2]), 0, 100);
    const l = clamp(parseFloat(match[3]), 0, 100);
    const a = clamp(isNaN(alpha) ? 1 : alpha, 0, 1);

    return [h, s, l, a];
  }

  return null;
}

/** parses `hwb()` into an `[h, w, b, a]` tuple */
function getHwb(string: string): Rgba | null {
  if (!string) {
    return null;
  }

  const match = string.match(RE_HWB);

  if (match) {
    const alpha = parseFloat(match[4]);
    const h = ((parseFloat(match[1]) % 360) + 360) % 360;
    const w = clamp(parseFloat(match[2]), 0, 100);
    const b = clamp(parseFloat(match[3]), 0, 100);
    const a = clamp(isNaN(alpha) ? 1 : alpha, 0, 1);

    return [h, w, b, a];
  }

  return null;
}

/** ported from `color-convert@1.9.3` `hsl.rgb` — `[h, s, l]` -> `[r, g, b]` (0-255) */
function hslToRgb(hsl: Rgba): [number, number, number] {
  const h = hsl[0] / 360;
  const s = hsl[1] / 100;
  const l = hsl[2] / 100;
  let t2: number;
  let t3: number;
  let val: number;

  if (s === 0) {
    val = l * 255;

    return [val, val, val];
  }

  if (l < 0.5) {
    t2 = l * (1 + s);
  } else {
    t2 = l + s - l * s;
  }

  const t1 = 2 * l - t2;

  const rgb: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    t3 = h + (1 / 3) * -(i - 1);
    if (t3 < 0) {
      t3++;
    }
    if (t3 > 1) {
      t3--;
    }

    if (6 * t3 < 1) {
      val = t1 + (t2 - t1) * 6 * t3;
    } else if (2 * t3 < 1) {
      val = t2;
    } else if (3 * t3 < 2) {
      val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
    } else {
      val = t1;
    }

    rgb[i] = val * 255;
  }

  return rgb;
}

/** ported from `color-convert@1.9.3` `hwb.rgb` — `[h, w, b]` -> `[r, g, b]` (0-255) */
function hwbToRgb(hwb: Rgba): [number, number, number] {
  const h = hwb[0] / 360;
  let wh = hwb[1] / 100;
  let bl = hwb[2] / 100;
  const ratio = wh + bl;

  // wh + bl cant be > 1
  if (ratio > 1) {
    wh /= ratio;
    bl /= ratio;
  }

  const i = Math.floor(6 * h);
  const v = 1 - bl;
  let f = 6 * h - i;

  if ((i & 0x01) !== 0) {
    f = 1 - f;
  }

  const n = wh + f * (v - wh); // linear interpolation

  let r: number;
  let g: number;
  let b: number;
  switch (i) {
    default:
    case 6:
    case 0:
      r = v;
      g = n;
      b = wh;
      break;
    case 1:
      r = n;
      g = v;
      b = wh;
      break;
    case 2:
      r = wh;
      g = v;
      b = n;
      break;
    case 3:
      r = wh;
      g = n;
      b = v;
      break;
    case 4:
      r = n;
      g = wh;
      b = v;
      break;
    case 5:
      r = v;
      g = wh;
      b = n;
      break;
  }

  return [r * 255, g * 255, b * 255];
}

function computeColorToRgb(string: string): [number, number, number] | null {
  const prefix = string.substring(0, 3).toLowerCase();

  switch (prefix) {
    case 'hsl': {
      const hsl = getHsl(string);

      return hsl ? hslToRgb(hsl) : null;
    }
    case 'hwb': {
      const hwb = getHwb(string);

      return hwb ? hwbToRgb(hwb) : null;
    }
    default: {
      const rgb = getRgb(string);

      return rgb ? [rgb[0], rgb[1], rgb[2]] : null;
    }
  }
}

// Parsed results are cached because the color strings that reach this parser are
// static config (module colors, the highlight color) that would otherwise be
// re-parsed on every log line. The cached tuple is never handed out directly — each
// call returns a fresh copy — so callers keep the previous "fresh array per call, no
// mutation leak" contract (see the array-copy regression test).
const parseCache = new Map<string, [number, number, number] | null>();

/**
 * Parses a CSS color string to its `[r, g, b]` channels (0-255, unrounded).
 * Supports hex, `rgb()/rgba()`, `hsl()/hsla()`, `hwb()`, and CSS named colors.
 * @returns the rgb channels (a fresh array on every call), or `null` if the string
 * cannot be parsed.
 */
export function parseColorToRgb(string: string): [number, number, number] | null {
  if (!parseCache.has(string)) {
    parseCache.set(string, computeColorToRgb(string));
  }
  const cached = parseCache.get(string);

  return cached ? [cached[0], cached[1], cached[2]] : null;
}

/**
 * Drop-in replacement for the parts of the `color` package that Loxer used:
 * `Color(string)` then `.red()/.green()/.blue()`. Throws on an unparseable
 * string, preserving the previous dependency's contract.
 */
export function Color(string: string): {
  red: () => number;
  green: () => number;
  blue: () => number;
} {
  const rgb = parseColorToRgb(string);
  if (!rgb) {
    throw new Error(`Unable to parse color from string: ${string}`);
  }

  return {
    red: () => rgb[0],
    green: () => rgb[1],
    blue: () => rgb[2],
  };
}
