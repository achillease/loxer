/** ## The level of a log
 * #### How severe a log is, from `'error'` to `'debug'`:
 *
 * | level | meaning |
 * | --- | --- |
 * | `'error'` | something failed |
 * | `'warn'` | something is suspicious but recoverable |
 * | `'info'` | the ordinary log |
 * | `'debug'` | detail that is only interesting while debugging |
 *
 * Every log carries one, and a module says how far down that list it wants to see: a module with
 * `devLevel: 'info'` shows `'error'`, `'warn'` and `'info'` logs and stops before `'debug'`.
 *
 * Errors are output whatever the module allows, so a module set to `'error'` reports its errors and
 * nothing else. Use {@link LoxerConfig.disabled} or {@link LoxerConfig.disabledInProductionMode} to
 * switch logging off altogether.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** ## The level of a log box
 * #### Every {@link LogLevel} except `'error'`.
 *
 * A box is opened and later closed, while an error is a single event — so `Loxer.error` opens no box
 * and a trace cannot run at `'error'`.
 */
export type BoxLevel = Exclude<LogLevel, 'error'>;

/** @internal the one place the level order lives: `'error'` first, `'debug'` last */
export const LEVEL_ORDER: Record<LogLevel, 0 | 1 | 2 | 3> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/** @internal whether a log of `level` sits past the `threshold` a module allows */
export function isHidden(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_ORDER[level] > LEVEL_ORDER[threshold];
}

/** @internal the level a module logs up to, or `fallback` when it names none Loxer knows
 *
 * A threshold only reaches {@link isHidden} through here. An unknown value would make every
 * comparison against it `false` and write every log, so a module that names one falls back to a
 * level Loxer knows instead.
 */
export function resolveThreshold(threshold: unknown, fallback: LogLevel): LogLevel {
  // `Object.hasOwn`, not `in`: `in` reaches inherited names like `'constructor'` and `'toString'`,
  // which would pass as levels and leave the gate comparing against something that is not a number
  return typeof threshold === 'string' && Object.hasOwn(LEVEL_ORDER, threshold)
    ? (threshold as LogLevel)
    : fallback;
}

/** @internal the {@link BoxLevel} a trace opens its box at, or `'info'` when it names none
 *
 * A trace dispatches by indexing the level's methods, so a level Loxer does not know would index
 * nothing and throw where the traced function starts. `'error'` opens no box either, so it falls
 * back the same way.
 */
export function resolveBoxLevel(level: unknown): BoxLevel {
  return level === 'warn' || level === 'info' || level === 'debug' ? level : 'info';
}
