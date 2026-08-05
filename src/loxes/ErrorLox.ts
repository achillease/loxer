import { Lox } from './Lox.js';
import { OutputLox } from './OutputLox.js';
/** @module ErrorLox */

/** An error emitted to the configured output stream as an event with `kind: 'error'`. */
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
