export * from './core/output/ANSIFormat.js';
export * from './core/output/BoxFactory.js';
export { ErrorLoxRenderer, OutputLoxRenderer } from './core/output/OutputRenderer.js';
export { PropsPrinter } from './core/output/PropsPrinter.js';
export { BoxLayouts } from './core/output/BoxFormat.js';
export type { BoxSymbols } from './core/output/BoxFormat.js';
export { Loxer, resetLoxer } from './Loxer.js';
export { NamedError } from './core/Error.js';
export type { ErrorLox } from './loxes/ErrorLox.js';
export type { OutputLox } from './loxes/OutputLox.js';
// referenced by the option / lox types below, so a consumer can name every member's type
export type { BoxLayoutStyle } from './core/output/BoxFormat.js';
export type { PropsPrinterOptions } from './core/output/PropsPrinter.js';
export type { ExtendedModule } from './core/runtime/Modules.js';
export type { LoxType } from './loxes/Lox.js';
export type {
  BoxLevel,
  DefaultModuleId,
  ErrorLoxTemplate,
  ErrorType,
  LevelMethods,
  LogLevel,
  LoxColorOptions,
  LoxerConfig,
  LoxerColorOptions,
  LoxerModules,
  LoxerOutputEvent,
  LoxerOutputRendererOptions,
  LoxerOutputStream,
  LoxerOptions,
  Module,
  ModuleId,
  OfLoxes,
  OpenedLox,
  OutputLoxTemplate,
  OutputLoxTemplateFields,
  RegisteredModules,
} from './types.js';

/** ## Registry for type-safe module ids
 * #### Augment this interface to type `Loxer.init({ modules })`, `.module(...)`, `.m(...)`,
 * `Loxer.getModuleLevel(...)` and the trace marker's module selectors (`trace.m(...)` and
 * `trace.<Module>`) after the modules your project declares.
 *
 * While this interface is empty — the default — a module id is an ordinary `string` and nothing
 * changes. Register your modules once and every module id becomes autocompleted and typo-checked:
 *
 * ```typescript
 *   import { Loxer, type LoxerModules } from 'loxer';
 *
 *   export const modules = {
 *     PERS: { fullName: 'Persons', color: '#0ff', devLevel: 'debug', prodLevel: 'warn' },
 *     DB: { fullName: 'Database', color: '#f0f', devLevel: 'info', prodLevel: 'error' },
 *   } satisfies LoxerModules;
 *
 *   declare module 'loxer' {
 *     interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
 *   }
 *
 *   Loxer.init({ modules });
 * ```
 *
 * From then on `Loxer.m('PERS')` is accepted and `Loxer.m('PRES')` is a compile error, while the
 * built-in ids (see {@link DefaultModuleId}) stay valid. Only the property *keys* are read — their
 * value type is irrelevant, `true` is just the cheapest thing to write.
 *
 * The `modules` given to `Loxer.init(...)` are held to the same registry: a registered id that the
 * object does not define, and an id the object defines without registering it, are both compile
 * errors — see {@link RegisteredModules}. Deriving the registry from the object with
 * `Record<keyof typeof modules, true>`, as above, keeps the two in lockstep by construction.
 *
 * - **`satisfies LoxerModules`, never `: LoxerModules`**: an annotation widens the keys back to
 *   `string`, which silently turns the whole check off again with no error to tell you.
 * - the augmentation must live in a file that is a module. If it has no other `import` / `export`,
 *   add an `export {};` — otherwise TypeScript reads it as an ambient declaration that *replaces*
 *   the package.
 * - a misspelled module specifier (`declare module 'loxr'`) fails silently, so check that a
 *   deliberate typo really errors after wiring this up.
 * - the registry is global to a compilation, matching `Loxer`'s single set of modules. Several
 *   packages may each augment it; the declarations merge.
 * - {@link ModuleId} is the resolved id type, should you need to name it.
 */
export interface LoxerModuleRegistry {}
