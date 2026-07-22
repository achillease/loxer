import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';

/** @internal */
export class LoxHistory {
  private _history: (OutputLox | ErrorLox)[] = [];
  private _size: number;

  constructor(size?: number) {
    this._size = size ?? 50;
  }

  /** @internal */
  add(lox: OutputLox | ErrorLox): void {
    if (this._size === 1) {
      return;
    }
    this._history.unshift(lox);
    this._history = this._history.slice(0, this._size);
  }

  get stack(): (OutputLox | ErrorLox)[] {
    return this._history;
  }
}
