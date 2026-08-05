import { filterDef, isNumber } from '../Helpers.js';
import { OutputLox } from '../loxes/OutputLox.js';
import { Lox } from '../loxes/Lox.js';
import { ExtendedModule } from './Modules.js';

type OpenBoxType = { id: number; module: ExtendedModule };

type QueueItemType = { lox: Lox; error?: Error };

/** The number of pre-init logs held before the queue starts dropping.
 *
 * The queue's job is preserving the startup story, and at this many undrained logs the tail is by
 * definition not startup any more.
 */
const PENDING_QUEUE_CAP = 1000;

/** How long a pre-init log may wait before the queue reports itself.
 *
 * Healthy pre-init logging — a module-scope log, a traced helper running while `init()`'s own
 * argument object is built — is bounded by the module-evaluation-to-`init()` gap, which is
 * milliseconds to a tick. Volume separates nothing: an app that never calls `init()` may queue a
 * handful of logs, so any count high enough to stay quiet on a healthy app would never fire on a
 * broken one. Elapsed time is what tells "will flush shortly" from "will never flush".
 */
const PENDING_QUEUE_TIMEOUT_MS = 5000;

/** @internal
 * A storage for pending and open loxes
 */
export class Loxes {
  private _pendingLoxQueue: QueueItemType[] = [];
  private _shouldUseQueue = true;

  private _droppedCount = 0;
  private _firstEnqueueTime: number | undefined;
  private _queueTimer: ReturnType<typeof setTimeout> | undefined;
  private _hasWarned = false;

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
    if (this._firstEnqueueTime === undefined) {
      this._firstEnqueueTime = Date.now();
      this.armReport();
    }
    if (this._pendingLoxQueue.length >= PENDING_QUEUE_CAP) {
      // drop the NEWEST, never the head: `findOpenLox` searches this queue, so evicting from the
      // front would silently unlink a pre-init `.of(id)` from its opening log. Dropping the tail
      // keeps every retained prefix intact and is O(1).
      this._droppedCount++;
      this.report('overflow');

      return;
    }
    this._pendingLoxQueue.push({ lox, error });
    // backstop for an environment where the timer never runs (fake timers, exotic hosts): one
    // number comparison on a path that already allocates a `Lox`
    if (Date.now() - this._firstEnqueueTime >= PENDING_QUEUE_TIMEOUT_MS) {
      this.report('timeout');
    }
  }

  /** @internal empties the pending queue and returns all pending loxes. used when initializing Loxer */
  dequeue(): QueueItemType[] {
    this.disarmReport();
    const queue = this._pendingLoxQueue;
    this._pendingLoxQueue = [];
    this._shouldUseQueue = false;
    if (this._droppedCount > 0) {
      console.warn(
        `Loxer: ${this._droppedCount} log(s) were dropped before init, because more than ` +
          `${PENDING_QUEUE_CAP} logs were waiting in the pre-init queue. The oldest ` +
          `${PENDING_QUEUE_CAP} were kept.`
      );
      this._droppedCount = 0;
    }

    return queue;
  }

  /** @internal cancels the pending-queue report. used when Loxer resets in place */
  dispose(): void {
    this.disarmReport();
  }

  /** arms the one report timer, on the first enqueue only */
  private armReport(): void {
    try {
      const timer = setTimeout(() => this.report('timeout'), PENDING_QUEUE_TIMEOUT_MS);
      // a diagnostic must never be the reason a Node process stays alive
      (timer as { unref?: () => void }).unref?.();
      this._queueTimer = timer;
    } catch {
      // no usable timer here - the elapsed-time backstop in `enqueue` covers this case
    }
  }

  private disarmReport(): void {
    if (this._queueTimer !== undefined) {
      clearTimeout(this._queueTimer);
      this._queueTimer = undefined;
    }
  }

  /** Reports a queue that is filling with nothing to flush it — once, ever, per instance.
   *
   * `console` is the only channel available by definition: the output stream is registered by
   * `init()`, which is the very thing that has not happened. The wording names both candidate
   * causes as a question rather than an assertion, because an app that inits late on purpose is
   * still accumulating unflushed logs and its author still benefits from knowing.
   */
  private report(reason: 'timeout' | 'overflow'): void {
    if (this._hasWarned || !this._shouldUseQueue) {
      return;
    }
    this._hasWarned = true;
    this.disarmReport();
    const elapsed = this._firstEnqueueTime === undefined ? 0 : Date.now() - this._firstEnqueueTime;
    const observation =
      reason === 'overflow'
        ? `the pre-init queue hit its ${PENDING_QUEUE_CAP} log cap and is dropping the newest logs`
        : `${this._pendingLoxQueue.length} log(s) have waited ${elapsed}ms in the pre-init queue`;
    console.warn(
      `Loxer: ${observation}. Nothing is output until Loxer.init() runs — was init() never ` +
        `called, or did a bundler load two copies of loxer so that init() reached the other one?`
    );
  }
}
