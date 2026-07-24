import { LogLevelType } from './types.js';

export type TraceHighlight = 'open' | 'close' | 'all';

export type FunctionOpenMessage = ((args: any[]) => string) | 'functionName' | 'types' | 'args';

export type FunctionCloseMessage =
  ((result?: any) => string) | 'functionName' | 'result' | 'prettyResult';

interface SharedTraceOptions {
  /** the corresponding key of a `LoxerModule` provided during `Loxer.init()` */
  moduleId?: string;
  /** the level of the log. defaults to `1` */
  level?: LogLevelType;
  /** which lifecycle messages should be highlighted */
  highlight?: TraceHighlight;
  /** appends the arguments as the opening log item */
  argsAsItem?: boolean;
  /** appends the result as the closing log item */
  resultAsItem?: boolean;
}

/** Options shared by traced class methods and instrumented plain functions. */
export interface LoxedOptions extends SharedTraceOptions {
  /** controls the opening trace message */
  openMessage?: FunctionOpenMessage;
  /** controls the successful closing trace message */
  closeMessage?: FunctionCloseMessage;
}

/** Options for the `@trace()` class-method decorator. */
export interface TraceOptions extends SharedTraceOptions {
  /** controls the opening trace message */
  openMessage?: FunctionOpenMessage | 'className.functionName';
  /** controls the successful closing trace message */
  closeMessage?: FunctionCloseMessage | 'className.functionName';
}
