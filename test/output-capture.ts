import type { ErrorLox, LoxerOutputStream, OutputLox } from '../src/index.js';

type LegacyCollectors = {
  devError?: (lox: ErrorLox, history: (OutputLox | ErrorLox)[]) => void;
  devLog?: (lox: OutputLox) => void;
  prodError?: (lox: ErrorLox, history: (OutputLox | ErrorLox)[]) => void;
  prodLog?: (lox: OutputLox) => void;
};

/** Adapts existing per-stream test collectors to the public discriminated output event. */
export function outputFromCallbacks(collectors: LegacyCollectors): LoxerOutputStream {
  return (event) => {
    if (event.kind === 'log') {
      if (event.environment === 'dev') {
        collectors.devLog?.(event.lox);
      } else {
        collectors.prodLog?.(event.lox);
      }

      return;
    }

    if (event.environment === 'dev') {
      collectors.devError?.(event.lox, event.history);
    } else {
      collectors.prodError?.(event.lox, event.history);
    }
  };
}
