import { BoxFactory } from './core/BoxFactory.js';
import { castError, LoxerError, NamedError } from './core/Error.js';
import { ItemType, ItemOptions } from './core/Item.js';
import { Loxes } from './core/Loxes.js';
import { LoxHistory } from './core/LoxHistory.js';
import { Modules } from './core/Modules.js';
import { OutputStreams } from './core/OutputStreams.js';
import { is, isError, isNES } from './Helpers.js';
import { ErrorLox } from './loxes/ErrorLox.js';
import { Lox, LoxType } from './loxes/Lox.js';
import { OutputLox } from './loxes/OutputLox.js';
import {
  ErrorType,
  LogLevelType,
  Loxer as LoxerType,
  LoxerOptions,
  OfLoxes,
  OpenedLox,
} from './types.js';

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
      this._isDev = isNES(process.env.NODE_ENV) ? 'development' === process.env.NODE_ENV : false;
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

  getModuleLevel(moduleId: string) {
    return this._modules.getLevel(moduleId);
  }

  private resetState() {
    this._isHighlighted = false;
    this._level = undefined;
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

  // level ##################################################################

  private _level: LogLevelType | undefined;
  level(level: LogLevelType) {
    return this.l(level);
  }
  l(level: LogLevelType) {
    this._level = level;

    return this;
  }

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
    if (this._isDisabled) {
      return;
    }
    this.switchOutput(
      new Lox({
        id: undefined,
        highlighted: this._isHighlighted,
        item,
        itemOptions,
        level: this._level ?? 1,
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
    const sureError = isError(error) ? error : castError(error);
    this.switchOutput(
      new Lox({
        id: logId,
        highlighted: this._isHighlighted,
        item,
        itemOptions,
        level: this._level ?? 1,
        message: messagePrefix + sureError.message,
        moduleId,
        type: 'error',
      }),
      sureError
    );
  }

  open(message: string, item?: ItemType, itemOptions?: ItemOptions) {
    if (this._isDisabled) {
      return {
        id: 0,
        add: () => {
          /* do nothing */
        },
        close: () => {
          /* do nothing */
        },
        error: () => {
          /* do nothing */
        },
        namedError: () => {
          /* do nothing */
        },
      };
    }
    const lox = new Lox({
      id: undefined,
      highlighted: this._isHighlighted,
      item,
      itemOptions,
      level: this._level ?? 1,
      message,
      moduleId: this._moduleId !== 'NONE' ? this._moduleId : 'DEFAULT',
      type: 'open',
    });
    this.switchOutput(lox);

    const result = this.of(lox.id) as OpenedLox;
    result.id = lox.id;

    return result;
  }

  of(opened: number | OpenedLox): OfLoxes {
    const id = typeof opened === 'number' ? opened : opened.id;
    if (this._isDisabled) {
      return {
        add: () => {
          /* do nothing */
        },
        close: () => {
          /* do nothing */
        },
        error: () => {
          /* do nothing */
        },
        namedError: () => {
          /* do nothing */
        },
      };
    }
    const openLox = this._loxes.findOpenLox(id);
    if (!is(openLox)) {
      return {
        add: (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
          this.internalError(
            new LoxerError(message),
            id,
            undefined,
            'add() on a not (anymore) existing Lox. MESSAGE: ',
            item,
            itemOptions
          );
        },
        close: (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
          this.internalError(
            new LoxerError(message),
            id,
            undefined,
            'close() on a not (anymore) existing Lox. MESSAGE: ',
            item,
            itemOptions
          );
        },
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

    return {
      add: (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
        this.appendToOpenLox('single', openLox, message, item, itemOptions);
      },
      close: (message: string, item?: ItemType, itemOptions?: ItemOptions) => {
        this.appendToOpenLox('close', openLox, message, item, itemOptions);
      },
      error: (error: ErrorType, item?: ItemType, itemOptions?: ItemOptions) => {
        this.internalError(error, openLox.id, openLox.moduleId, undefined, item, itemOptions);
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
          openLox.moduleId,
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
    message: string,
    item?: ItemType,
    itemOptions?: ItemOptions
  ) {
    const { id, moduleId, level: openLevel } = openLox;
    // close level must be open level + added logs must not have a lower level, though the open box could possibly not exist
    const level =
      type === 'single'
        ? (Math.max(openLevel, this._level ?? openLevel) as LogLevelType)
        : openLevel;
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
