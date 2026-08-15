import { BoxFactory } from './core/output/BoxFactory.js';
import {
  castError,
  getErrorMessage,
  LoxerError,
  NamedError,
  sanitizeErrorMessage,
} from './core/Error.js';
import { BoxLevel, LogLevel } from './core/runtime/Levels.js';
import { Loxes } from './core/runtime/Loxes.js';
import { LoxHistory } from './core/runtime/LoxHistory.js';
import { Modules } from './core/runtime/Modules.js';
import { OutputStreams } from './core/output/OutputStreams.js';
import { PropsPrinterOptions, stringifyMessage } from './core/output/PropsPrinter.js';
import { realmSlot } from './core/runtime/Realm.js';
import { isTraceMessage, MessageSpan } from './tracing/TraceMessage.js';
import { is, isNES, sanitizeControlCharacters } from './Helpers.js';
import { ErrorLox } from './loxes/ErrorLox.js';
import { Lox, LoxInit, LoxType } from './loxes/Lox.js';
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
import type { TracePointRuntimeOptions } from './tracing/types.js';

/** Deliberately non-exported so only the trace runtime can open error-level boxes. */
const traceOpener: unique symbol = Symbol.for('loxer.traceOpener') as never;

/** Reads a rendered {@link TraceMessage} carrier: its plain text, and the regions of that text the
 * built-in output colors.
 *
 * The brand is `Symbol.for`, so a caller can forge one. Nothing here trusts it: the text is
 * re-sanitized whatever it claims to be, and a span is kept only where it is a pair of in-bounds
 * integers that starts at or after the last one ended and names a real kind — one violation drops
 * every span rather than half of them. A forged carrier therefore reaches the same place a plain
 * string message does, which is what lets the one field the trace runtimes need travel beside
 * `lox.message` rather than inside it, leaving the value a destination and the history receive
 * exactly the plain string it has always been.
 */
function traceMessageData(message: unknown): { text: string; spans: MessageSpan[] } | undefined {
  try {
    if (!isTraceMessage(message) || typeof message.text !== 'string') {
      return undefined;
    }
    const text = sanitizeControlCharacters(message.text);
    if (text !== message.text || !Array.isArray(message.spans)) {
      return { text, spans: [] };
    }

    let previousEnd = 0;
    const spans: MessageSpan[] = [];
    for (const span of message.spans) {
      const { start, end, kind } = span;
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < previousEnd ||
        end <= start ||
        end > text.length ||
        (kind !== 'value' && kind !== 'fn' && kind !== 'parent')
      ) {
        return { text, spans: [] };
      }
      spans.push({ start, end, kind });
      previousEnd = end;
    }

    return { text, spans };
  } catch {
    return undefined;
  }
}

function messageText(message: unknown): string {
  return traceMessageData(message)?.text ?? stringifyMessage(message);
}

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
 * ### Start with the
 * [logging guide](https://github.com/pcprinz/loxer/blob/master/documentation/logging.md), or
 * open the
 * [documentation hub](https://github.com/pcprinz/loxer/blob/master/documentation/index.md).
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
    });
    this._history = new LoxHistory(config?.historyCacheSize);
    this._output = new OutputStreams({ output: props?.output });

    this.highlight().log('Loxer initialized');
    this._loxes.dequeue().forEach((queued) => this.switchOutput(queued.lox, queued.error));
  }

  /** Returns this instance to its pre-`init()` state **in place**.
   *
   * Object identity never changes, so every module copy that resolved the realm slot and every
   * cached `const L = Loxer` reference observes the reset. Rebinding the export instead would be
   * invisible to both.
   */
  reset(): void {
    this._loxes.dispose();
    this._loxes = new Loxes();
    this._history = new LoxHistory();
    this._modules = new Modules();
    this._output = new OutputStreams();
    this._isInitialized = false;
    this._isDev = false;
    this._isDisabled = false;
    this._runningId = -1;
    this.resetState();
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
    this._printProps = undefined;
  }

  // id #####################################################################

  /** The log id counter belongs to the instance, not to the `Lox` class: `_loxes` is per instance,
   * so two instances handing out `0, 1, 2` into one shared map would make `.of(id)` resolve to the
   * wrong box.
   */
  private _runningId: number = -1;
  private nextId(): number {
    this._runningId = (this._runningId + 1) % Number.MAX_VALUE;

    return this._runningId;
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

  // printProps #############################################################

  /** the rendering configuration the current chain asked for, or `undefined` where it asked for
   * nothing. One field carries both the decision and its configuration, which is what makes an
   * empty object a rendering request. */
  private _printProps: PropsPrinterOptions | undefined;
  printProps(options?: PropsPrinterOptions) {
    return this.pp(options);
  }
  pp(options: PropsPrinterOptions = {}) {
    this._printProps = options;

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
    const methods = ((message?: unknown, ...props: unknown[]) => {
      this.logAtLevel(level, message, props);
    }) as LevelMethods;
    methods.open = (message?: unknown, ...props: unknown[]) =>
      this.openAtLevel(level, message, props);

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
    this._moduleId = this.resolveModuleId(moduleId);

    return this;
  }

  // log functions ##########################################################

  log(message?: unknown, ...props: unknown[]) {
    this.logAtLevel('info', message, props);
  }

  private logAtLevel(level: BoxLevel, message: unknown, props: unknown[]) {
    if (this._isDisabled) {
      return;
    }
    const moduleId = this._moduleId;
    this.switchOutput(
      new Lox({
        id: this.nextId(),
        highlighted: this._isHighlighted,
        props,
        printProps: this._printProps,
        level,
        // contributes `message` and the `messageSpans` that belong to it
        ...this.outputMessage(message, level, moduleId),
        moduleId,
        type: 'single',
      })
    );
  }

  /** Writes a generated trace point without widening the public logger chain. */
  writeTracePoint(
    level: LogLevel,
    options: TracePointRuntimeOptions,
    containingBoxId: number | undefined,
    resolveMessage: () => unknown,
    props: unknown[]
  ): void {
    if (this._isDisabled) {
      this.resetState();

      return;
    }
    const containingModule =
      !options.hasModule && containingBoxId !== undefined
        ? this._loxes.findOpenLox(containingBoxId)?.moduleId
        : undefined;
    const moduleId = options.hasModule
      ? this.resolveModuleId(options.moduleId)
      : (containingModule ?? 'NONE');
    const isHidden = this._isInitialized && this._modules.isHiddenAt(level, moduleId);
    const message = isHidden ? '' : resolveMessage();
    const trace = isHidden ? undefined : traceMessageData(message);
    this.switchOutput(
      new Lox({
        id: containingBoxId ?? this.nextId(),
        highlighted: options.highlight === true,
        props,
        printProps: options.printProps,
        level,
        message: trace?.text ?? (isHidden ? '' : stringifyMessage(message)),
        messageSpans: trace?.spans ?? [],
        moduleId,
        type: 'single',
      })
    );
  }

  /** Normalizes an explicit module selection for public chains and generated trace points. */
  private resolveModuleId(moduleId?: string): string {
    return this._modules.ensureModule(isNES(moduleId) ? moduleId : 'DEFAULT');
  }

  /** The message a `'single'` log carries — left empty for one the level gate is about to drop.
   *
   * Both halves travel together because the gate has to drop both: a hidden log's empty message must
   * not keep spans pointing past the end of it.
   *
   * This is shared by direct, open, close, and added logs. Turning an object into a message walks
   * it, and that runs on every call, ahead of the gate that
   * decides whether the log is written at all: `Loxer.debug(largeDomainObject)` in a module that logs
   * up to `'error'` would otherwise pay for a rendering nothing reads. A hidden normal log reaches
   * no output event, no history and no open-box buffer, so the message it never shows is free to
   * stay empty.
   *
   * Errors bypass this method because they are written whatever their module allows.
   */
  private outputMessage(
    message: unknown,
    level: LogLevel,
    moduleId: string
    // the return type is the two `LoxInit` fields themselves rather than a shape that happens to
    // match them: each construction site spreads this, and a spread carrying a key the initializer
    // does not have is silently dropped instead of rejected
  ): Pick<LoxInit, 'message' | 'messageSpans'> {
    // before `init()` the modules carry defaults and the log is queued for replay, so the gate it
    // will meet is not knowable yet and the message has to be built now
    if (this._isInitialized && this._modules.isHiddenAt(level, moduleId)) {
      return { message: '', messageSpans: [] };
    }
    // one read of the carrier for both fields: the text and the spans that belong to it are
    // sanitized and validated in the same pass, so reading them apart would do that work twice
    const trace = traceMessageData(message);

    return {
      message: trace?.text ?? stringifyMessage(message),
      messageSpans: trace?.spans ?? [],
    };
  }

  namedError(name: string, message: string, ...props: unknown[]) {
    this.internalError(new NamedError(name, message), undefined, undefined, undefined, props);
  }

  error(error: ErrorType, ...props: unknown[]) {
    this.internalError(error, undefined, undefined, undefined, props);
  }

  private internalError(
    error: ErrorType,
    logId: number | undefined,
    moduleId: string = this._moduleId,
    messagePrefix: string = '',
    props: unknown[] = []
  ) {
    const sureError = castError(error);
    this.switchOutput(
      new Lox({
        id: logId ?? this.nextId(),
        highlighted: this._isHighlighted,
        props,
        printProps: this._printProps,
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

  open(message?: unknown, ...props: unknown[]) {
    return this.openAtLevel('info', message, props);
  }

  /** Opens an ordinary trace lifecycle box at any log level, including `'error'`. */
  [traceOpener](level: LogLevel, message?: unknown, ...props: unknown[]): OpenedLox {
    return this.openAtLevel(level, message, props);
  }

  private openAtLevel(level: LogLevel, message: unknown, props: unknown[]): OpenedLox {
    if (this._isDisabled) {
      return { id: 0, ...disabledOfLoxes() };
    }
    const moduleId = this._moduleId !== 'NONE' ? this._moduleId : 'DEFAULT';
    const lox = new Lox({
      id: this.nextId(),
      highlighted: this._isHighlighted,
      props,
      printProps: this._printProps,
      level,
      // contributes `message` and the `messageSpans` that belong to it
      ...this.outputMessage(message, level, moduleId),
      moduleId,
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
        (method: string) =>
        (message?: unknown, ...props: unknown[]) => {
          this.internalError(
            new LoxerError(messageText(message)),
            id,
            undefined,
            `${method}() on a not (anymore) existing Lox. MESSAGE: `,
            props
          );
        };

      return {
        add: missing('add'),
        warn: missing('warn'),
        info: missing('info'),
        debug: missing('debug'),
        close: missing('close'),
        error: (error: ErrorType, ...props: unknown[]) => {
          this.internalError(
            error,
            id,
            undefined,
            'error() on a not (anymore) existing Lox. ERROR: ',
            props
          );
        },
        namedError: (name: string, message: string, ...props: unknown[]) => {
          this.internalError(
            new NamedError(name, message),
            id,
            undefined,
            'error() on a not (anymore) existing Lox. ERROR: ',
            props
          );
        },
      };
    }

    const moduleId =
      preserveCurrentModule && this._moduleId !== 'NONE' ? this._moduleId : openLox.moduleId;

    /** appends a single log at an explicit level, or - without one - at the box's own level */
    const append =
      (level: BoxLevel | undefined) =>
      (message?: unknown, ...props: unknown[]) => {
        this.appendToOpenLox('single', openLox, moduleId, message, level, props);
      };

    return {
      add: append(undefined),
      warn: append('warn'),
      info: append('info'),
      debug: append('debug'),
      close: (message?: unknown, ...props: unknown[]) => {
        this.appendToOpenLox('close', openLox, openLox.moduleId, message, undefined, props);
      },
      error: (error: ErrorType, ...props: unknown[]) => {
        this.internalError(error, openLox.id, moduleId, undefined, props);
      },
      namedError: (name: string, message: string, ...props: unknown[]) => {
        this.internalError(new NamedError(name, message), openLox.id, moduleId, undefined, props);
      },
    };
  }

  private appendToOpenLox(
    type: LoxType,
    openLox: Lox,
    moduleId: string,
    message: unknown,
    requestedLevel: BoxLevel | undefined,
    props: unknown[]
  ) {
    const { id, level: openLevel } = openLox;
    // An added log keeps the level its caller named. A level says how severe the log *is*, and it
    // travels on to `devLog` / `prodLog`, the history and the coloring, so a box must not overwrite
    // it. Staying inside the box is a matter of visibility instead: `toOutputLox` hides a log whose
    // open was hidden, so a shown log can never emit a mid-box glyph into a column its open never
    // reserved. `add` and `close` name no level of their own and take the open's.
    const level = type === 'single' && requestedLevel ? requestedLevel : openLevel;
    this.switchOutput(
      new Lox({
        id,
        highlighted: this._isHighlighted,
        props,
        printProps: this._printProps,
        level,
        // contributes `message` and the `messageSpans` that belong to it
        ...this.outputMessage(message, level, moduleId),
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
      const errorLox = this.toErrorLox(lox, error ?? new Error(lox.message));
      this._history.add(errorLox);
      if (this._isDev) {
        this._output.devErrorOut(errorLox, this._history);
      } else {
        this._output.prodErrorOut(errorLox, this._history);
      }
    } else {
      // TODO compare levels first? [this._modules.getLevel(lox.moduleId)]
      const outputLox = this.toOutputLox(lox);
      if (!outputLox.hidden) {
        this._history.add(outputLox);
        if (this._isDev) {
          this._output.devLogOut(outputLox);
        } else {
          this._output.prodLogOut(outputLox);
        }
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
    // a log's own level is the only gate, inside a box as much as outside one: a threshold is a
    // promise about severity, so a log must never be dropped for where it was written. `add` and
    // `close` take the opening log's level, which gates them identically to their box - they pair
    // with it without a rule of their own. An explicitly leveled log that outranks its hidden box
    // is written without box membership, the way an assigned error already is.
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

/** The instance lives in a realm slot rather than in this module, so that every copy of Loxer's
 * modules a bundler or module registry may produce resolves to the same logger — see
 * {@link realmSlot}.
 */
const instance = realmSlot('instance', () => new LoxerInstance());

/**
 * This is the main class of Loxer. It works "static" because it's a singleton instance though you
 * don't need to call ~`new Loxer()`~. Instead you use it with **`Loxer.log()`** (or any other method).
 *
 * ### Start with the
 * [logging guide](https://github.com/pcprinz/loxer/blob/master/documentation/logging.md), or
 * open the
 * [documentation hub](https://github.com/pcprinz/loxer/blob/master/documentation/index.md).
 */
export const Loxer: LoxerType = instance;

/** @internal Opens a trace lifecycle box at any log level without widening Loxer's public API. */
export function __openTrace(level: LogLevel, message?: unknown, ...props: unknown[]): OpenedLox {
  return instance[traceOpener](level, message, ...props);
}

/** @internal Writes a contextual single log emitted by the trace marker transform. */
export function __writeTracePoint(
  level: LogLevel,
  options: TracePointRuntimeOptions,
  containingBoxId: number | undefined,
  resolveMessage: () => unknown,
  props: unknown[]
): void {
  instance.writeTracePoint(level, options, containingBoxId, resolveMessage, props);
}

/** Returns `Loxer` to its pre-`init()` state: no modules, no output stream, an empty history and an
 * empty pre-init queue, ready to `init()` again.
 *
 * The one instance is reset in place rather than replaced, so a held reference
 * (`const L = Loxer`) and any other copy of Loxer's modules in this realm see the reset too.
 */
export function resetLoxer(): void {
  instance.reset();
}
