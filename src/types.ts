/** @module Loxer */
import { BoxLayoutStyle } from './core/BoxFormat.js';
import { ItemOptions, ItemType } from './core/Item.js';
import type { LogLevel } from './core/Levels.js';
// type-only, so it is erased on emit and no runtime import cycle exists
import type { LoxerModuleRegistry } from './index.js';
import { ErrorLox } from './loxes/ErrorLox.js';
import { OutputLox } from './loxes/OutputLox.js';

export type { BoxLevel, LogLevel } from './core/Levels.js';

export type Loxer = LoxerCore & LogMethods & Modifiers<never>;
/** this is the main type of {@link Loxer} */
export interface LoxerCore {
  /** ## Initialize Loxer
   * #### Is a required function to initialize Loxer.
   *
   * - if Loxer is not initialized, every log is cached until the initialization is done
   * - call this as soon as possible.
   * - **`ATTENTION`**: Do no conditionally leave out the initialization in order to avoid logging!
   *   All the logs will be cached anyways. If you want to conditionally disable Loxer then use
   *   one of the "disabled" options in the config({@link LoxerConfig}) at the initialization
   * - the given {@link LoxerOptions.modules} are checked against the
   *   {@link LoxerModuleRegistry}: while it is empty, any set of module ids is accepted; once
   *   modules are registered there, a registered id that is missing here and an id that is not
   *   registered are both compile errors - see {@link RegisteredModules}
   *
   * ---
   * @param options Options for the configuration of Loxer
   */
  init<M extends RegisteredModules<M>>(options?: LoxerOptions<M>): void;
  /** ## Get the level a module logs up to
   * #### Returns the {@link LogLevel} the given `moduleId`s corresponding Module logs up to.
   *
   * - is dependent on the environment: returns actual level (prod || dev)
   * - returns `undefined` if there is no corresponding module for the given `moduleId`
   * - if the {@link LoxerModuleRegistry} is augmented, then probing an id that is deliberately
   *   *not* a registered module (to get the `undefined`) needs a cast:
   *   `getModuleLevel(id as ModuleId)`
   *
   * ---
   * @param moduleId the corresponding key of a module from {@link LoxerOptions.modules} declared in `Loxer.init(options)`
   */
  getModuleLevel(moduleId: ModuleId): LogLevel | undefined;
  /** ## Get the log History
   * This is a list of all logs / boxes / errors that occurred in the past. It must be enabled by initialization.
   * - is a reversed stack, so that the most recent element is at `history[0]`
   * - the size of the history can be set at the {@link LoxerConfig.historyCacheSize} in the
   *   {@link LoxerOptions.config} declared in `Loxer.init(options)`. It defaults to `50`.
   * - if the history is enabled it will also be appended to the error logs in the `errorOut` callback
   */
  history: (OutputLox | ErrorLox)[];
}

// #################################################################################################
// ##### OPTIONS ###################################################################################
// #################################################################################################

/** Options for the {@link Loxer.init} method
 *
 * The type parameter carries the concrete {@link LoxerOptions.modules} object and is inferred, so
 * `LoxerOptions` can be named without it - as the target of a
 * `const options = { ... } satisfies LoxerOptions`, for example.
 */
export interface LoxerOptions<M extends LoxerModules = RegisteredModules> {
  /** ## An object containing all loggable modules
   * an exemplary module "Persons" would look like this:
   *
   * ```typescript
   *   PERS: { fullName: 'Persons', color: '#0ff', devLevel: 'debug', prodLevel: 'warn' }
   * ```
   *
   * - the key `PERS` will be used to reference the module in the logs and is kept short for laziness
   * - the fullName will be (possibly sliced - see {@link LoxerConfig.moduleTextSlice}) displayed as the very first
   *   string at the output
   * - the color will be applied to the module name and its box layout
   * - the levels say how far down the {@link LogLevel} list this module logs: a module at `'info'`
   *   logs `'error'`, `'warn'` and `'info'` logs and stops before `'debug'`
   *
   * ## Given Default Modules
   * Some default modules will be set and can be overwritten here:
   *
   * ### The NONE module
   * will be automatically set when there is no `.module(...)` chained on `Loxer.log()`, `Loxer.open()` or `Loxer.of()`
   * when the opening log had no module too. The default is defined as:
   *
   * ```typescript
   *   NONE: { fullName: '', color: '#fff', devLevel: 'info', prodLevel: 'error' }
   * ```
   *
   * This module will not have a module name or a box layout at the output.
   *
   * ### The DEFAULT module
   * will be automatically set when `Loxer.log()` or `Loxer.open()` logs are chained with an empty `.module()`.
   * The default is defined as:
   *
   * ```typescript
   *   DEFAULT: { fullName: '', color: '#fff', devLevel: 'info', prodLevel: 'error' }
   * ```
   *
   * This module will have an empty module name, but a box layout at the output.
   *
   * ### The INVALID module
   * will be automatically set when any given module does not exist (as a key) in the given {@link LoxerOptions.modules} in the
   * `Loxer.init(options)`. This module is a visual indicator for misspelled or missing moduleIds. **Additionally this
   * module is serves as a fallback mechanism and should therefore never be overwritten with `undefined`!**
   * The default is defined as:
   *
   * ```typescript
   *   INVALID: { fullName: 'INVALIDMODULE', color: '#f00', devLevel: 'info', prodLevel: 'error' }
   * ```
   *
   * This module will have a moduleName (`INVALIDMODULE`), but no box layout at the output.
   *
   * ## Typed module ids
   * The accepted ids follow the {@link LoxerModuleRegistry}: while it is empty, every module id is
   * an ordinary `string`. Register the modules of your project and this object has to define
   * exactly them - see {@link RegisteredModules}.
   */
  modules?: M;
  /** determines if Loxer is running in a development or production environment.
   * - you can pass any boolean expression here
   * - `process.env.NODE_ENV === 'development'` is common for *NodeJS*
   * - `__DEV__` is common for *react-native*
   * - defaults to `process.env.NODE_ENV === 'development'`
   */
  dev?: boolean;
  /** Functions called as an output stream for Loxer..
   * The output stream is divided into 4 different streams, depending on the environment and the type of log:
   * - `devLog`: logs occurring in development environment
   * - `prodLog`: logs occurring in production environment
   * - `devError`: errors occurring in development environment
   * - `prodError`: errors occurring in production environment
   */
  callbacks?: LoxerCallbacks;
  /** The {@link LoxerConfig Configuration} of Loxer. */
  config?: LoxerConfig;
  /** The levels the default modules `NONE` and `DEFAULT` log up to, in production or development. If
   * you want them set differently, override those modules in the `modules` option.
   * - they default to `devLevel: 'info'` and `prodLevel: 'error'`
   */
  defaultLevels?: {
    /** the level to log up to in development mode */
    devLevel: LogLevel;
    /** the level to log up to in production mode */
    prodLevel: LogLevel;
  };
}

/** The shape of a modules object for the {@link LoxerOptions}: one {@link Module} per module id.
 *
 * This is the type to declare the modules of a project against - with `satisfies LoxerModules`, so
 * that their keys stay literal and can be registered at the {@link LoxerModuleRegistry}. The ids
 * {@link Loxer.init} accepts are {@link RegisteredModules}.
 */
export type LoxerModules = { [moduleId: string]: Module };

/** Structure of a loggable module for the {@link LoxerModules} */
export interface Module {
  /** The {@link LogLevel} this module logs up to in development mode. */
  devLevel: LogLevel;
  /** The {@link LogLevel} this module logs up to in production mode. */
  prodLevel: LogLevel;
  /** Full name for the logged module. */
  fullName: string;
  /** Color used to identify this Log. Supported formats:
   * - hex-string: (eg: `'#ff0000'` or `'#f00'` for red)
   * - rgb-string: (eg: `'rgb(255, 0, 0)'` for red)
   */
  color: string;
  /** a specific box layout for the boxes of this module.
   * - this option overrides the `defaultBoxLayoutStyle` of the `LoxerConfig`
   */
  boxLayoutStyle?: BoxLayoutStyle;
}

/** The module ids Loxer always provides itself, described at {@link LoxerOptions.modules}.
 * - `NONE`: no `.module(...)` was chained - no module name and no box layout
 * - `DEFAULT`: an empty `.module()` was chained - box layout with an empty module name
 * - `INVALID`: the given module id does not exist - the visual indicator for a misspelled id
 *
 * These stay valid module ids even when the {@link LoxerModuleRegistry} is augmented, and they can
 * be overwritten at {@link LoxerOptions.modules}.
 */
export type DefaultModuleId = 'NONE' | 'DEFAULT' | 'INVALID';

/** The type of a module id, as accepted by `.module(...)`, `.m(...)`, `Loxer.getModuleLevel(...)`
 * and the `moduleId` trace option.
 *
 * - it is `string` as long as the {@link LoxerModuleRegistry} is not augmented - every existing
 *   usage keeps compiling untouched
 * - once modules are registered there, it narrows to those ids plus the {@link DefaultModuleId}s,
 *   which makes a typo a compile error instead of a red `INVALIDMODULE` label at runtime
 *
 * See {@link LoxerModuleRegistry} for how to register the modules of a project.
 */
export type ModuleId = [keyof LoxerModuleRegistry] extends [never]
  ? string
  : Extract<keyof LoxerModuleRegistry, string> | DefaultModuleId;

/** The modules {@link Loxer.init} accepts, checked against the {@link LoxerModuleRegistry}.
 *
 * - it is {@link LoxerModules} as long as the registry is not augmented - any set of module ids is
 *   accepted
 * - once modules are registered there, every registered id has to be defined, the
 *   {@link DefaultModuleId built-in ids} may be overwritten, and no other id is accepted
 *
 * ```typescript
 *   declare module 'loxer' {
 *     interface LoxerModuleRegistry extends Record<'PERS' | 'DB', true> {}
 *   }
 *
 *   Loxer.init({ modules: { PERS, DB } });         // ✔
 *   Loxer.init({ modules: { PERS, DB, NONE } });   // ✔ - a built-in module, overwritten
 *   Loxer.init({ modules: { PERS } });             // ✘ - 'DB' is registered but not defined
 *   Loxer.init({ modules: { PERS, DB, PRES } });   // ✘ - 'PRES' is not a registered module id
 * ```
 *
 * The type parameter carries the object that is passed in, which is what lets an unregistered id be
 * reported even when that object is declared elsewhere and handed over as a variable: its key
 * resolves to `never`. An object typed by a `: LoxerModules` annotation carries an index signature
 * instead of its keys and can therefore not be checked at all - declare it with
 * `satisfies LoxerModules` to keep its keys.
 */
export type RegisteredModules<M = unknown> = [keyof LoxerModuleRegistry] extends [never]
  ? LoxerModules
  : Record<Extract<keyof LoxerModuleRegistry, string>, Module> &
      Partial<Record<DefaultModuleId, Module>> & {
        [K in keyof M]: K extends ModuleId ? Module : never;
      };

/** Output stream callbacks for the {@link LoxerOptions} */
export interface LoxerCallbacks {
  /** Function called when logging in development mode.
   * This callback receives an {@link OutputLox} which provides several attributes.
   */
  devLog?(outputLog: OutputLox): void;
  /** Function called when logging in production mode.
   * This callback receives an {@link OutputLox} which provides several attributes.
   */
  prodLog?(outputLog: OutputLox): void;
  /** Function called when errors are recorded in production mode.
   * This callback provides an {@link ErrorLox} which provides the attributes of an `OutputLox` plus some error
   * specific ones. The provided history is a list of all recent logs until the error was streamed out.
   */
  prodError?(errorLog: ErrorLox, history: (OutputLox | ErrorLox)[]): void;
  /** Function called when errors are recorded in development mode.
   * This callback provides an {@link ErrorLox} which provides the attributes of an `OutputLox` plus some error
   * specific ones. The provided history is a list of all recent logs until the error was streamed out.
   */
  devError?(errorLog: ErrorLox, history: (OutputLox | ErrorLox)[]): void;
}

/** Configuration for the {@link LoxerOptions} */
export interface LoxerConfig {
  /** the length where the modules' names will be sliced in order to fit the layout.
   * - defaults to `8`
   */
  moduleTextSlice?: number;
  /** the opacity of the moduleText (`options.modules[...].fullName`) that appears on the `Loxer.of(...).close()` log
   * - number between `[0,1]`
   * - defaults to `0` which means "hidden"
   */
  endTitleOpacity?: number;
  /** the style of the default Box-layout
   * - possible values are "round" | "light" | "heavy" | "double" | "off"
   * - 'off' does not print any Layout but saves the insets, that the box layout would need
   * - defaults to `'round'`
   */
  boxLayoutStyle?: BoxLayoutStyle;
  /** disables Loxer in production mode.
   * - if Loxer is initialized with `options.config.disabledInProductionMode: true` then - in production environment - the
   *   cache is erased and upcoming logs will not be cached anymore
   * - in fact all logging function then immediately return "nothing" for performance reasons
   * - defaults to `false`
   */
  disabledInProductionMode?: boolean;
  /** disables Loxer completely.
   * - this **MUST** be used in order to suppress logging without deleting the Loxer calls!
   * - without disabling AND init() of Loxer, all the logs will be cached "infinitely", because
   *   they "wait" for the init().
   * - if Loxer is initialized with `options.config.disabled: true` then the cache is erased and upcoming logs will not be
   *   cached anymore
   * - in fact all logging function then immediately return "nothing" for performance reasons
   * - defaults to `false`
   */
  disabled?: boolean;
  /** the backgroundColor used for highlighting logs. Supported formats:
   * - hex-string: (eg: `'#ff0000'` or `'#f00'` for red)
   * - rgb-string: (eg: `'rgb(255, 0, 0)'` for red)
   * - defaults to "inverted" colors
   */
  highlightColor?: string;
  /** disables all colors for the output.
   * - use this if the console can't handle `\x1b[38;2;R;G;Bm` colors.
   * - this only takes effect, if the Callbacks are unset and the console.log is used internally.
   * - the Callbacks receive colored and uncolored messages separately
   * - defaults to `false`
   */
  disableColors?: boolean;
  /** determines how many output- / error logs shall be cached in the history.
   * - is accessible with `Loxer.history`
   * - will be additionally appended to error outputs
   * - **defaults to `50`**
   */
  historyCacheSize?: number;
}

// #################################################################################################
// ##### LOG METHODS ###############################################################################
// #################################################################################################

/** ## The log methods of one level
 * #### Call it to write a single log at that level, or use its `.open()` to open a box at it.
 *
 * ```typescript
 *     Loxer.debug('cache miss');          // a single log at level 'debug'
 *     Loxer.debug.open('loading user');   // a log box at level 'debug'
 * ```
 *
 * {@link LogMethods.warn}, {@link LogMethods.info} and {@link LogMethods.debug} have this shape.
 * {@link LogMethods.error} does not: it takes an `Error` rather than a message, and it opens no box
 * (see {@link BoxLevel}).
 *
 * Reading the property writes no log, so the modifiers keep working in front of it:
 * `Loxer.h().m('DB').debug.open(...)`. Only the call at the end of the chain resets them.
 */
export interface LevelMethods {
  /** writes a single log at this level - see {@link LogMethods.log}
   * ---
   * @param message to log
   * @param item to append
   * @param itemOptions to configure the (default) output of the item
   */
  (message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** opens a log box at this level - see {@link LogMethods.open}
   * ---
   * @param message to log
   * @param item to append
   * @param itemOptions to configure the (default) output of the item
   */
  open(message: string, item?: ItemType, itemOptions?: ItemOptions): OpenedLox;
}

export interface LogMethods {
  /** ## Simple Log
   *
   * ```typescript
   *     Loxer.log('Hello World');
   * ```
   *
   * #### Works similar to `console.log()`, but:
   *
   * - it is cached until the logger is initialized
   * - it won't proceed any output if Loxer is disabled
   * - the output will be streamed out to the {@link LoxerOptions.callbacks} declared in `Loxer.init(options)`
   * - if no callbacks are given at the initialization, all logs will be logged with `console.log(message, item)`,
   *   but only in development mode
   * - it logs at level `'info'`, exactly like {@link LogMethods.info Loxer.info()}
   * - can be chained with `.highlight().log(...)` or `.h().log(...)` to highlight the log
   * - can be chained with `.module().log(...)` or `.m().log(...)` to assign a module to the log - otherwise it's `NONE`
   * - all functions can be chained in combination and different order like: `Loxer.h().m('Account').log(...)`
   * - for another {@link LogLevel} use {@link LogMethods.warn Loxer.warn()},
   *   {@link LogMethods.debug Loxer.debug()} or {@link LogMethods.error Loxer.error()}
   * ---
   * @param message to log
   * @param item to append
   * @param itemOptions to configure the (default) output of the item
   */
  log(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** ## Warning Log
   *
   * ```typescript
   *     Loxer.warn('retrying the request');
   *     Loxer.warn.open('degraded mode');
   * ```
   *
   * #### Behaves like {@link LogMethods.log}, at level `'warn'`. See {@link LevelMethods}.
   *
   * - it is an ordinary log, streamed to `devLog` / `prodLog`. Only {@link LogMethods.error} writes
   *   to `devError` / `prodError`, and no `Error` is created for a warning
   * - a callback that wants to react to the level reads `outputLox.level`
   */
  warn: LevelMethods;
  /** ## Info Log
   *
   * ```typescript
   *     Loxer.info('user loaded');
   *     Loxer.info.open('loading user');
   * ```
   *
   * #### Behaves like {@link LogMethods.log}, at level `'info'`. See {@link LevelMethods}.
   *
   * `'info'` is the level {@link LogMethods.log} and {@link LogMethods.open} use themselves, so
   * `Loxer.info(...)` writes the same log as `Loxer.log(...)` and `Loxer.info.open(...)` the same box
   * as `Loxer.open(...)`.
   */
  info: LevelMethods;
  /** ## Debug Log
   *
   * ```typescript
   *     Loxer.debug('cache miss');
   *     Loxer.debug.open('recalculating');
   * ```
   *
   * #### Behaves like {@link LogMethods.log}, at level `'debug'`. See {@link LevelMethods}.
   *
   * `'debug'` is the last level a module reaches, so a module has to ask for it with
   * `devLevel: 'debug'`; the built-in modules stop at `'info'`.
   */
  debug: LevelMethods;
  /** ## Advanced error Log
   *
   * ```typescript
   *     Loxer.error(new Error('Goodbye World!'));
   * ```
   *
   * #### Works similar to `console.error()`, but:
   *
   * - it is cached until the logger is initialized
   * - it won't proceed any output if Loxer is disabled
   * - the errors will be streamed out to the {@link LoxerOptions.callbacks} declared in `Loxer.init(options)`
   * - if no callbacks are given at the initialization, all errors will be logged with `console.log(error)`,
   *   but only in development mode
   * - the given `Error` will be appended to the output error
   * - if the message is of type `string` | `number` | `boolean` | `object`, then a `new Error(message.toString())`
   *   will be created and appended
   * - all opened logs that were not closed until the error occurred will be appended to the error outputLog
   * - a history of logs will be appended if enabled
   * - can be chained with `.module().error(...)` or `.m().error(...)` to assign a module to the error - otherwise
   *   it's `NONE`
   * - chaining with `.highlight().error(...)` or `.h().error(...)` does not color the message differently but append
   *   the stack to the default console output
   * - errors are output whatever {@link LogLevel} their module allows, so a module at
   *   `devLevel: 'error'` reports its errors and nothing else. The emitted log carries
   *   `level: 'error'`.
   * - there is no `Loxer.error.open()`: an error is a single event rather than a box (see
   *   {@link BoxLevel})
   * ---
   * @param error an `Error` or `string` | `number`| `boolean` | `object` (converted to an Error)
   * @param item to append
   * @param itemOptions to configure the (default) output of the item
   */
  error(error: ErrorType, item?: ItemType, itemOptions?: ItemOptions): void;
  /** ## Open a boxed Log
   *
   * ```typescript
   *     const loxId = Loxer.open('Open World!')
   * ```
   *
   * #### Opens a boxed log to assign other logs / errors to it.
   *
   * - the log will get a box layout.
   * - it returns an id (`typeof number`) that can be used with `Loxer.of(id)` to assign other logs to it
   * - it is cached until the logger is initialized
   * - it won't proceed any output if Loxer is disabled
   * - the output will be streamed out to the {@link LoxerOptions.callbacks} declared in `Loxer.init(options)`
   * - if no callbacks are given at the initialization, all logs will be logged with `console.log(message, item)`,
   *   but only in development mode
   * - can be chained with `.highlight().open(...)` or `.h().open(...)` to highlight the log
   * - it opens the box at level `'info'`. For another level use that level's `.open()`, e.g.
   *   `Loxer.debug.open(...)` — see {@link LevelMethods}
   * - can be chained with `.module().open(...)` or `.m().open(...)` to assign a module to the log - otherwise it's `NONE`
   * - all functions can be chained in combination and different order like: `Loxer.h().m('Account').debug.open(...)`
   * ---
   * @param message to log
   * @param item to append
   * @param itemOptions to configure the (default) output of the item
   */
  open(message: string, item?: ItemType, itemOptions?: ItemOptions): OpenedLox;
  /** ## Assign logs / errors to an opened Log
   *
   * ```typescript
   *     // this has to be done before:
   *     const id = Loxer.open('opening message');
   *     // assign a log:
   *     Loxer.of(id).add('next step is reached');
   *     // assign an error:
   *     Loxer.of(id).error('something went wrong');
   *     // close the log box:
   *     Loxer.of(id).close('closing message');
   * ```
   *
   * #### Provides chained methods to add logs / errors and close the box of the given `id`'s opened log.
   *
   * - assigned logs / errors will receive a time consumption since the box was opened
   * - it won't proceed any output if Loxer is disabled
   * - can be chained with `.highlight().of(...)` or `.h().of(...)` to highlight the log
   * - chaining with `.module().of(...)` or `.m().of(...)` to assign modules will take no effect though assigned
   *   modules will always adapt the module of the opening log
   * - all functions can be chained in combination and different order like: `Loxer.h().m('Account').of(id).add(...)`
   *
   * ### Levels of assigned logs
   * - `add()` takes the level of the opening log
   * - `warn()` / `info()` / `debug()` name a level themselves, and the log reports it unchanged
   * - `close()` always takes the level of the opening log and accepts none of its own, so a box can
   *   neither be closed without having been opened nor be left open
   * - a log's own level decides whether it is written, inside a box as much as outside one. Where
   *   the module hides the opening log, a log that names a level the module does show is still
   *   written — without box membership, since the box reserved no column for it
   * - errors are output whatever the level says
   *
   * ### Returned functions
   * - `add: (message: string, item?: any)` - assigns a single log to the box at the box's own level
   * - `warn` / `info` / `debug: (message: string, item?: any)` - the same, at a level of their own
   * - `error: (error?: Error | string)` - assigns an error log to the box
   * - `close: (message: string, item?: any)` - assigns a log to the box, that also closes the box (and its box layout)
   * - **ATTENTION**: calling `add()`, `error()` or `close()` after closing the box, the log will not be appended to the box but
   *   logged anyways with a Warning
   * ---
   * @param id the id returned from `Loxer.open()` to reference this log to
   */
  /**
   * @internal `preserveCurrentModule` is reserved for generated trace calls. Public manual boxes
   * continue to inherit their opening module by default.
   */
  of(id: number | OpenedLox, preserveCurrentModule?: boolean): OfLoxes;
}

/** Any possible type that a `catch` could return */
export type ErrorType = Error | string | number | boolean | Record<string | number, unknown>;

/** Methods returned from the {@link LogMethods.of} method */
export interface OfLoxes {
  /** assigns a single log to a log box and imitates the behavior of {@link LogMethods.log}
   * - it takes the level of the opening log. To name a level, use {@link OfLoxes.warn},
   *   {@link OfLoxes.info} or {@link OfLoxes.debug}
   */
  add(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** assigns a single `'warn'` level log to a log box
   * - the log reports `'warn'` and is shown wherever the module reaches `'warn'`, even where the
   *   box itself is hidden
   */
  warn(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** assigns a single `'info'` level log to a log box
   * - the log reports `'info'` and is shown wherever the module reaches `'info'`, even where the
   *   box itself is hidden
   */
  info(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** assigns a single `'debug'` level log to a log box
   * - the log reports `'debug'` and is shown wherever the module reaches `'debug'`, which is the
   *   last level, so a box at any level can hold one
   */
  debug(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** closes an opened log box and imitates the behavior of {@link LogMethods.log}
   * - it takes the level of the opening log and accepts none of its own, so a box and its close are
   *   always either both shown or both hidden
   */
  close(message: string, item?: ItemType, itemOptions?: ItemOptions): void;
  /** assigns an error log to a log box and imitates the behavior of {@link LogMethods.error} */
  error(error: ErrorType, item?: ItemType, itemOptions?: ItemOptions): void;
  /** a direct shortcut for Loxer.of(...).error(new NamedError(...)). It combines the parameters of the {@link NamedError} and the `.error()` method */
  namedError(
    name: string,
    message: string,
    existingError?: unknown,
    item?: ItemType,
    itemOptions?: ItemOptions
  ): void;
}

export interface OpenedLox extends OfLoxes {
  /** the identifier of the opening log */
  id: number;
}

// #################################################################################################
// ##### MODIFIERS #################################################################################
// #################################################################################################

type h = 'h' | 'highlight';
type m = 'm' | 'module';
export interface Modifiers<Delete extends string> {
  /** ## Highlight a log (shortcut)
   * #### Is a shortcut for {@link Modifiers.highlight Loxer.highlight()}.
   *
   * ---
   * @param doit should the log be highlighted
   */
  h(doit?: boolean): LogMethods & Omit<Modifiers<Delete | h>, Delete | h>;
  /** ## Highlight a log
   *
   * ```typescript
   *     Loxer.highlight().log(...)
   *     Loxer.highlight().open(...)
   *     Loxer.highlight().of(...)
   *     Loxer.highlight().error(...)
   * ```
   *
   * #### Highlights logs to make them more visible.
   *
   * - by default the `foregroundColor` and `backgroundColor` of the log will be inverted.
   * - a different highlight color can be set at {@link LoxerConfig.highlightColor} in the {@link LoxerOptions.config} declared in `Loxer.init(options)`
   * - the parameter `doit?: boolean` can conditionally highlight the log with `true`
   * - this function can be chained with any other chaining function like `.module(...)`
   * - highlighting error logs does not color the message differently but append the stack to the default console output
   *
   * ---
   * @param doit should the log be highlighted
   */
  highlight(doit?: boolean): LogMethods & Omit<Modifiers<Delete | h>, Delete | h>;
  /** ## Assign a module to a log (shortcut)
   * #### Is a shortcut for {@link Modifiers.module `Loxer.module(...)`}
   * ---
   * @param moduleId the key of the module from {@link LoxerOptions.modules}. `undefined` defaults to module `"DEFAULT"`
   */
  m(moduleId?: ModuleId | undefined): LogMethods & Omit<Modifiers<Delete | m>, Delete | m>;
  /** ## Assign a module to a log
   *
   * ```typescript
   *     Loxer.module(string).log(...)
   *     Loxer.module(string).open(...)
   *     Loxer.module(string).of(...)
   * ```
   *
   * #### Assigns modules to logs to set individual categories / colors / levels to specific groups of logs.
   *
   * - if you don't chain this function the module is always `NONE`, which will lead the log to not have the box layout
   * - if you chain the function without a parameter like `Loxer.module().log(...)` the module will be `DEFAULT`,
   *   which will lead the log to have a box layout but no name
   * - both of the default modules can be overwritten at {@link LoxerOptions.modules} declared in `Loxer.init(options)`
   * - modules can be defined at {@link LoxerOptions.modules} declared in `Loxer.init(options)`
   * - this function can be chained with any other chaining function like `.highlight(...)`
   * - the accepted ids are `string` by default. Augment the {@link LoxerModuleRegistry} to have them
   *   autocompleted and typo-checked against the modules of your project
   * ---
   * @param moduleId the key of the module from {@link LoxerOptions.modules}. `undefined` defaults to module `"DEFAULT"`
   */
  module(moduleId?: ModuleId | undefined): LogMethods & Omit<Modifiers<Delete | m>, Delete | m>;
}
