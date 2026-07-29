import { BoxFactory } from './core/BoxFactory.js';
import {
  castError,
  getErrorMessage,
  LoxerError,
  NamedError,
  sanitizeErrorMessage,
} from './core/Error.js';
import { ItemType, ItemOptions } from './core/Item.js';
import { BoxLevel, moreVerbose } from './core/Levels.js';
import { Loxes } from './core/Loxes.js';
import { LoxHistory } from './core/LoxHistory.js';
import { Modules } from './core/Modules.js';
import { OutputStreams } from './core/OutputStreams.js';
import { is, isNES } from './Helpers.js';
import { ErrorLox } from './loxes/ErrorLox.js';
import { Lox, LoxType } from './loxes/Lox.js';
import { OutputLox } from './loxes/OutputLox.js';
import {
  ErrorType,
  LevelMethods,
  Loxer as LoxerType,
  LoxerOptions,
  ModuleId,
  OfLoxes,
  OpenedLox,
} from './types.js';

/** The inert box handle handed out while Loxer is disabled: every member is a no-op. */
function disabledOfLoxes(): OfLoxes {
  const noop = () => {
    /* do nothing */
  };

  return {
    add: noop,
    warn: noop,
    info: noop,
    debug: noop,
    close: noop,
    error: noop,
    namedError: noop,
  };
}

/**
 * This is the main class of Loxer. It works "static" because it's a singleton instance though you
 * don't need to call ~`new Loxer()`~. Instead you use it with **`Loxer.log()`** (or any other method).
 *
 * ### For an overview of all methods and a guide on how to use it, take a look at the [Documentation](https://github.com/pcprinz/loxer/blob/master/documentation/index.md).
 */
class LoxerInstance implements LoxerType {
  private _loxes = new Loxes();
  private _history = new LoxHistory();
  private _modules: Modules = new Modules();
  private _output: OutputStreams = new OutputStreams();

  private _isInitialized: boolean = false;
  private _isDev: boolean = false;
  private _isDisabled: boolean = false;

  init(props?: LoxerOptions) {
    this._isInitialized = true;
    if (is(props) && is(props?.dev)) {
      this._isDev = props.dev;
    } else {
      const nodeEnvironment = typeof process === 'undefined' ? undefined : process.env?.NODE_ENV;
      this._isDev = isNES(nodeEnvironment) ? 'development' === nodeEnvironment : false;
    }
    // configuration
    const config = props?.config;
    if (config?.disabled) {
      this._isDisabled = true;
    } else {
      this._isDisabled = config?.disabledInProductionMode ? !this._isDev : false;
    }
    this._modules = new Modules({
      isDev: this._isDev,
      modules: props?.modules,
      moduleTextSlice: config?.moduleTextSlice ?? 8,
      defaultLevels: props?.defaultLevels,
      defaultBoxLayoutStyle: config?.boxLayoutStyle ?? 'round',
    });
    this._history = new LoxHistory(config?.historyCacheSize);
    this._output = new OutputStreams({
      callbacks: props?.callbacks,
      disableColors: config?.disableColors,
      endTitleOpacity: config?.endTitleOpacity,
      highlightColor: config?.highlightColor,
    });

    this.highlight().log('Loxer initialized');
    this._loxes.dequeue().forEach((queued) => this.switchOutput(queued.lox, queued.error));
  }

  get history() {
    return this._history.stack;
  }

  getModuleLevel(moduleId: ModuleId) {
    return this._modules.getLevel(moduleId);
  }

  private resetState() {
    this._isHighlighted = false;
    this._moduleId = 'NONE';
  }

  // highlight ##############################################################

  private _isHighlighted: boolean = false;
  highlight(doit: boolean = true) {
    return this.h(doit);
  }
  h(doit: boolean = true) {
    this._isHighlighted = doit;

    return this;
  }

  // levels #################################################################

  /** Builds one level's {@link LevelMethods}: `Loxer.debug(...)` plus `Loxer.debug.open(...)`.
   *
   * The closure captures only the level and reads the chain state at *call* time, so reading the
   * property logs nothing and resets nothing — that is what keeps
   * `Loxer.h().m('DB').debug.open(...)` (and a hoisted `const d = Loxer.debug`) correct.
   */
  private makeLevel(level: BoxLevel): LevelMethods {
    const methods = ((message: string = '', item?: ItemType, itemOptions?: ItemOptions) => {
      this.logAtLevel(level, message, item, itemOptions);
    }) as LevelMethods;
    methods.open = (message: string, item?: ItemType, itemOptions?: ItemOptions) =>
      this.openAtLevel(level, message, item, itemOptions);

    return methods;
  }

  readonly warn: LevelMethods = this.makeLevel('warn');
  readonly info: LevelMethods = this.makeLevel('info');
  readonly debug: LevelMethods = this.makeLevel('debug');

  // moduleId ###############################################################

  private _moduleId: string = 'NONE';
  module(moduleId?: string) {
    return this.m(moduleId);
  }
  m(moduleId?: string) {
    this._moduleId = isNES(moduleId) ? moduleId : 'DEFAULT';
    // catch wrong module ids
    this._moduleId = this._modules.ensureModule(this._moduleId);

    return this;
  }

  // log functions ##########################################################

  log(message: string = '', item?: ItemType, itemOptions?: ItemOptions) {
    this.logAtLevel('info', message, item, itemOptions);
  }

  private logAtLevel(level: BoxLevel, message: string, item?: ItemType, itemOptions?: ItemOptions) {
    if (this._isDisabled) {
      return;
    }
    this.switchOutput(
      new Lox({
        id: undefined,
        highlighted: this._isHighlighted,
        item,
        itemOptions,
        level,
        message,
        moduleId: this._moduleId,
        type: 'single',
      })
    );
  }

  namedError(
    name: string,
    message: string,
    existingError?: unknown,
    item?: ItemType,
    itemOptions?: ItemOptions
  ) {
    this.internalError(
      new NamedError(name, message, existingError),
      undefined,
      undefined,
      undefined,
      item,
      itemOptions
    );
  }

  error(error: ErrorType, item?: ItemType, itemOptions?: ItemOptions) {
    this.internalError(error, undefined, undefined, undefined, item, itemOptions);
  }

  private internalError(
    error: ErrorType,
    logId: number | undefined,
    moduleId: string = this._moduleId,
    messagePrefix: string = '',
    item?: ItemType,
    itemOptions?: ItemOptions
  ) {
    const sureError = castError(error);
    this.switchOutput(
      new Lox({
        id: logId,
        highlighted: this._isHighlighted,
        item,
        itemOptions,
        // errors are output whatever the module allows, so this records the log's level rather than
        // a threshold the error has to pass
        level: 'error',
        message: messagePrefix + sanitizeErrorMessage(getErrorMessage(sureError)),
        moduleId,
        type: 'error',
      }),
      sureError
    );
  }

  open(message: string, item?: ItemType, itemOptions?: ItemOptions) {
    return this.openAtLevel('info', message, item, itemOptions);
  }

  private openAtLevel(
    level: BoxLevel,
    message: string,
    item?: ItemType,
    itemOptions?: ItemOptions
  ): OpenedLox {
    if (this._isDisabled) {
      return { id: 0, ...disabledOfLoxes() };
    }
    const lox = new Lox({
      id: undefined,
      highlighted: this._isHighlighted,
      item,
      itemOptions,
      level,
      message,
      moduleId: this._moduleId !== 'NONE' ? this._moduleId : 'DEFAULT',
      type: 'open',
    });
    this.switchOutput(lox);

    const result = this.of(lox.id) as OpenedLox;
    result.id = lox.id;

    return result;
  }

  of(opened: number | OpenedLox, preserveCurrentModule: boolean = false): OfLoxes {
    const id = typeof opened === 'number' ? opened : opened.id;
    if (this._isDisabled) {
      return disabledOfLoxes();
    }
    const openLox = this._loxes.findOpenLox(id);
    if (!is(openLox)) {
      /** reports a call on a box that is gone, naming the method the consumer actually used */
      const missing =
        (method: string) => (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
          this.internalError(
            new LoxerError(message),
            id,
            undefined,
            `${method}() on a not (anymore) existing Lox. MESSAGE: `,
            item,
            itemOptions
          );
        };

      return {
        add: missing('add'),
        warn: missing('warn'),
        info: missing('info'),
        debug: missing('debug'),
        close: missing('close'),
        error: (error: ErrorType, item?: ItemType, itemOptions?: ItemOptions) => {
          this.internalError(
            error,
            id,
            undefined,
            'error() on a not (anymore) existing Lox. ERROR: ',
            item,
            itemOptions
          );
        },
        namedError: (
          name: string,
          message: string,
          existingError?: unknown,
          item?: ItemType,
          itemOptions?: ItemOptions
        ) => {
          this.internalError(
            new NamedError(name, message, existingError),
            id,
            undefined,
            'error() on a not (anymore) existing Lox. ERROR: ',
            item,
            itemOptions
          );
        },
      };
    }

    const moduleId =
      preserveCurrentModule && this._moduleId !== 'NONE' ? this._moduleId : openLox.moduleId;

    /** appends a single log at an explicit level, or - without one - at the box's own level */
    const append =
      (level: BoxLevel | undefined) =>
      (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
        this.appendToOpenLox('single', openLox, moduleId, message, level, item, itemOptions);
      };

    return {
      add: append(undefined),
      warn: append('warn'),
      info: append('info'),
      debug: append('debug'),
      close: (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
        this.appendToOpenLox(
          'close',
          openLox,
          openLox.moduleId,
          message,
          undefined,
          item,
          itemOptions
        );
      },
      error: (error: ErrorType, item?: ItemType, itemOptions?: ItemOptions) => {
        this.internalError(error, openLox.id, moduleId, undefined, item, itemOptions);
      },
      namedError: (
        name: string,
        message: string,
        existingError?: unknown,
        item?: ItemType,
        itemOptions?: ItemOptions
      ) => {
        this.internalError(
          new NamedError(name, message, existingError),
          openLox.id,
          moduleId,
          undefined,
          item,
          itemOptions
        );
      },
    };
  }

  private appendToOpenLox(
    type: LoxType,
    openLox: Lox,
    moduleId: string,
    message: string,
    requestedLevel: BoxLevel | undefined,
    item?: ItemType,
    itemOptions?: ItemOptions
  ) {
    const { id, level: openLevel } = openLox;
    // A `close` is *always* the open's level: `proceedOpenLox` frees the box's visible column
    // regardless of `hidden`, so a hidden close on a visible open would strand the box with no
    // closing glyph. An added log may only ever move further down the level list, never up, so it
    // can never emit a mid-box glyph into a column its hidden open never reserved.
    const level =
      type === 'single' && requestedLevel ? moreVerbose(openLevel, requestedLevel) : openLevel;
    this.switchOutput(
      new Lox({
        id,
        highlighted: this._isHighlighted,
        item,
        itemOptions,
        level,
        message,
        moduleId,
        type,
      })
    );
  }

  // output #################################################################

  private switchOutput(lox: Lox, error?: Error) {
    this.resetState();

    // TODO should errors really be hold back until init?
    if (!this._isInitialized) {
      this._loxes.enqueue(lox, error);
    } else if (lox.type === 'error') {
      const errorLox = this.toErrorLox(lox, error ?? new Error());
      this._history.add(errorLox);
      this._output.errorOut(this._isDev, errorLox, this._history);
    } else {
      // TODO compare levels first? [this._modules.getLevel(lox.moduleId)]
      const outputLox = this.toOutputLox(lox);
      if (!outputLox.hidden) {
        this._history.add(outputLox);
        this._output.logOut(this._isDev, outputLox);
      }
      this._loxes.proceedOpenLox(outputLox);
    }
  }

  private toErrorLox(lox: Lox, error: Error): ErrorLox {
    const errorLox = new ErrorLox(lox, error);
    errorLox.setTime(this.getTimeConsumption(errorLox));
    const { loxModule } = this._modules.getModule(errorLox);
    errorLox.module = loxModule;
    errorLox.box = BoxFactory.getLogBox(errorLox, this._loxes);

    errorLox.openLoxes = this._loxes.getOpenLoxes();

    return errorLox;
  }

  private toOutputLox(lox: Lox): OutputLox {
    const outputLox = new OutputLox(lox);
    outputLox.setTime(this.getTimeConsumption(outputLox));
    const { loxModule, hidden } = this._modules.getModule(outputLox);
    outputLox.module = loxModule;
    outputLox.hidden = hidden;
    outputLox.box = BoxFactory.getLogBox(outputLox, this._loxes);

    return outputLox;
  }

  private getTimeConsumption(lox: Lox) {
    const openLox = this._loxes.findOpenLox(lox.id);
    if (lox.type !== 'open' && is(openLox)) {
      return lox.timestamp.getTime() - openLox.timestamp.getTime();
    }
  }
}

/**
 * This is the main class of Loxer. It works "static" because it's a singleton instance though you
 * don't need to call ~`new Loxer()`~. Instead you use it with **`Loxer.log()`** (or any other method).
 *
 * ### For an overview of all methods and a guide on how to use it, take a look at the [Documentation](https://github.com/pcprinz/loxer/blob/master/documentation/index.md).
 */
export let Loxer: LoxerType = new LoxerInstance();

export function resetLoxer(): void {
  Loxer = new LoxerInstance();
  Lox.resetStaticRunningId();
}
