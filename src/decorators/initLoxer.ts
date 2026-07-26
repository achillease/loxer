import { Loxer } from '../Loxer.js';
import { LoxerOptions } from '../types.js';

export interface InitLoxerClassContext {
  readonly kind: 'class';
  readonly name: string | undefined;
  addInitializer(initializer: () => void): void;
}

export type InitLoxerDecorator = (target: unknown, context?: InitLoxerClassContext) => void;

/**
 * This class decorator initializes the Loxer immediately when the before the class is used.
 * Use this if the initialization has to be done fast.
 *
 * ---
 * @param options the options for the `Loxer.init(options: LoxerOptions)` method
 * @returns a class decorator
 */
export function initLoxer(options: LoxerOptions): InitLoxerDecorator;
export function initLoxer(options: unknown): InitLoxerDecorator | void {
  if (typeof options === 'function') {
    return;
  }

  Loxer.init(options as LoxerOptions);

  return () => {};
}
