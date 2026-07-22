import { filterDef, isNumber } from '../Helpers.js';
import { OutputLox } from '../loxes/OutputLox.js';
import { Lox } from '../loxes/Lox.js';
import { ExtendedModule } from './Modules.js';

type OpenBoxType = { id: number; module: ExtendedModule };

type QueueItemType = { lox: Lox; error?: Error };

/** @internal
 * A storage for pending and open loxes
 */
export class Loxes {
  private _pendingLoxQueue: QueueItemType[] = [];
  private _shouldUseQueue = true;

  private _loxes: { [id: string]: OutputLox | undefined } = {};
  private _openLogBuffer: (OpenBoxType | undefined)[] = [];

  /** @internal add / removes an open lox from the list of opened logs, depending on it's type */
  proceedOpenLox(lox: OutputLox): void {
    if (lox.type === 'open') {
      this.addOpenLox(lox);
    } else if (lox.type === 'close') {
      this.removeCorrespondingOpenLox(lox);
    }
  }

  private removeCorrespondingOpenLox(lox: OutputLox) {
    this._loxes[lox.id] = undefined;
    const openLogIndex = this._openLogBuffer.findIndex((buff) => buff?.id === lox.id);
    if (openLogIndex > -1) {
      this._openLogBuffer[openLogIndex] = undefined;
    }
    // remove undefined buffer end
    this.trimOpenLogBuffer();
  }

  private trimOpenLogBuffer() {
    let done = false;
    while (!done) {
      if (this._openLogBuffer.length > 0 && !this._openLogBuffer[this._openLogBuffer.length - 1]) {
        this._openLogBuffer.pop();
      } else {
        done = true;
      }
    }
  }

  private addOpenLox(lox: OutputLox) {
    this._loxes[lox.id] = lox;
    if (!lox.hidden) {
      this._openLogBuffer.push({ id: lox.id, module: lox.module });
    }
  }

  /** @internal finds an opening log || undefined. used for allocation loxes in Loxer.of() and TimeConsumption*/
  findOpenLox(id: number): Lox | undefined {
    if (isNumber(id)) {
      return this._shouldUseQueue
        ? this._pendingLoxQueue.find((item) => item?.lox.type === 'open' && item?.lox.id === id)
            ?.lox
        : this._loxes[id];
    }

    return undefined;
  }

  /** @internal returns all defined open loxes. used for appending to ErrorLoxes */
  getOpenLoxes(): OutputLox[] {
    const openLoxes = filterDef(this._openLogBuffer).map((buff) => this._loxes[buff.id]);

    return filterDef(openLoxes);
  }

  /** @internal returns the open lox buffer with all open loxes or undefined. used for the boxlayout in the BoxFactory */
  getBuffer(): (OpenBoxType | undefined)[] {
    return this._openLogBuffer;
  }

  /** @internal enqueues any lox to the pending queue. used in switchOutput when Loxer is not initialized */
  enqueue(lox: Lox, error?: Error): void {
    this._pendingLoxQueue.push({ lox, error });
  }

  /** @internal empties the pending queue and returns all pending loxes. used when initializing Loxer */
  dequeue(): QueueItemType[] {
    const queue = this._pendingLoxQueue;
    this._pendingLoxQueue = [];
    this._shouldUseQueue = false;

    return queue;
  }
}
