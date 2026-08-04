/** @internal is not undefined or null */
export function is<T>(arg: T | undefined | null): arg is T {
  return arg != null;
}

/** @internal */
export function isString(arg: unknown): arg is string {
  return is(arg) && typeof arg === 'string';
}

/** @internal is a defined, non empty string */
export function isNES(arg: unknown): arg is string {
  return isString(arg) && arg.length > 0;
}

/** @internal is a valid defined number */
export function isNumber(arg: unknown): arg is number {
  return is(arg) && typeof arg === 'number' && !isNaN(arg);
}
/** @internal filters a list after it's defined values (typed) */
export function filterDef<T>(list: (T | undefined)[]): T[] {
  return list.filter((element) => is(element)) as T[];
}

/** @internal */
export function isError(arg: unknown): arg is Error {
  return is(arg) && arg instanceof Error && isString(arg.name) && isString(arg.message);
}

/** @internal every character no rendered text may carry raw: C0 (`\n`, `\r`, `\t`, ESC `\x1b`),
 * DEL, and C1 (including the 8-bit CSI `\x9b`).
 *
 * Module-scoped rather than a literal inside {@link sanitizeControlCharacters}, because that runs on
 * every log's message and on every string a prop renders — a fresh `RegExp` per call would be one
 * allocation per rendered value.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;

/** @internal the subset that drives a terminal rather than laying text out: C0 except horizontal
 * tab and line feed, plus DEL and C1.
 *
 * `\n` and `\t` are deliberately absent — see {@link sanitizeTerminalControlCharacters}.
 */
const TERMINAL_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** @internal */
function escapeControlCharacter(character: string): string {
  return String.raw`\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

/** @internal Escapes every control character in `text` as its `\uXXXX` form.
 *
 * Loxer writes ANSI sequences itself, so a terminal is guaranteed to interpret the ones that reach
 * it from a logged value. Text therefore has to be escaped wherever it comes from data rather than
 * from Loxer's own layout: a `\n` or `\r` forges log lines and breaks the box column, and an
 * `\x1b[` / `\x9b` sequence drives the terminal — clearing it, recoloring it, or retitling its
 * window.
 */
export function sanitizeControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARACTERS, escapeControlCharacter);
}

/** @internal Escapes the control characters that would drive the terminal, leaving `\n` and `\t`
 * intact.
 *
 * For text whose own line breaks are the point — a function body a caller asked to see in full —
 * where escaping every control character would mangle the very thing being rendered. Text that is
 * plain data takes {@link sanitizeControlCharacters} instead.
 */
export function sanitizeTerminalControlCharacters(text: string): string {
  return text.replaceAll('\r\n', '\n').replace(TERMINAL_CONTROL_CHARACTERS, escapeControlCharacter);
}

/** @internal */
export function eraseBeginningLines(message: string, count: number): string {
  let position = 0;
  do {
    position = message.indexOf('\n', position + 1);
    count--;
  } while (count > 0);

  return message.slice(position);
}

export function safeNumber(
  value: number,
  range: [number, number],
  integer: boolean = false
): number {
  let ranged = value < range[0] ? range[0] : value;
  ranged = value > range[1] ? range[1] : ranged;

  return integer ? Math.floor(ranged) : ranged;
}
