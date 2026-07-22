import { Lox } from './Lox.js';
import { OutputLox } from './OutputLox.js';
/** @module ErrorLox */

/** This is a log streamed to the `devError`or `prodError` output stream defined at the {@link LoxerCallbacks}. */
export class ErrorLox extends OutputLox {
  /** the error that was initially given, or created by Loxer */
  error: Error;
  /** a list of opened {@link OutputLox} which have not been closed until the occurrence of this error log */
  openLoxes: OutputLox[] = [];

  /** @internal */
  constructor(preLox: Lox, error: Error) {
    super(preLox);
    this.error = error;
  }
}
