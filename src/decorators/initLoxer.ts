import { Loxer } from '../Loxer.js';
import { LoxerOptions, RegisteredModules } from '../types.js';

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
 * @param options the options for the `Loxer.init(options: LoxerOptions)` method - their `modules`
 * are checked against the `LoxerModuleRegistry` exactly like `Loxer.init`'s
 * @returns a class decorator
 */
export function initLoxer<M extends RegisteredModules<M>>(
  options: LoxerOptions<M>
): InitLoxerDecorator;
export function initLoxer(options: unknown): InitLoxerDecorator | void {
  if (typeof options === 'function') {
    return;
  }

  Loxer.init(options as LoxerOptions);

  return () => {};
}
