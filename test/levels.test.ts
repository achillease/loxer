import { isHidden, LEVEL_ORDER, type LogLevel } from '../src/core/runtime/Levels';

// The ordering direction is the one thing a whole-suite pass cannot prove: inverting it flips
// individual visibility while the aggregate counts can still work out. So pin it directly.

test('LEVEL_ORDER runs from the most to the least severe level', () => {
  expect(LEVEL_ORDER).toEqual({ error: 0, warn: 1, info: 2, debug: 3 });
});

test('isHidden drops a log past its module threshold, and nothing else', () => {
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  for (const level of levels) {
    for (const threshold of levels) {
      expect(isHidden(level, threshold)).toBe(LEVEL_ORDER[level] > LEVEL_ORDER[threshold]);
    }
  }

  // the gate is strict `>`: a log at exactly the threshold is visible
  expect(isHidden('info', 'info')).toBe(false);
  expect(isHidden('debug', 'info')).toBe(true);
  expect(isHidden('warn', 'info')).toBe(false);
  // `'error'` as a threshold means "errors only" - every normal level is hidden by it ...
  expect(isHidden('warn', 'error')).toBe(true);
  expect(isHidden('info', 'error')).toBe(true);
  expect(isHidden('debug', 'error')).toBe(true);
  // ... while an error itself is never hidden by any threshold (and bypasses the gate anyway)
  for (const threshold of levels) {
    expect(isHidden('error', threshold)).toBe(false);
  }
});
