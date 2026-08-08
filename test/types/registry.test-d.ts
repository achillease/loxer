import { outputFromCallbacks } from '../output-capture.js';
// Type-level test for the `LoxerModuleRegistry` augmentation.
//
// Run with `pnpm typecheck:types` AFTER `pnpm build`: it imports `loxer` by its own package name,
// so it checks the emitted `dist/*.d.ts` that a consumer actually receives - through the same
// `exports` map and with the same `declare module 'loxer'` recipe the documentation teaches.
//
// It deliberately lives outside `test/**/*.test.ts` and uses a `.test-d.ts` suffix, because a module
// augmentation applies to the WHOLE TypeScript program: in the ordinary suites it would narrow
// module ids for every other file too and break the ad-hoc ids they use ('ONE', 'IT', 'wrong', ...).
//
// Negative cases are pinned with `@ts-expect-error`, so a clean exit means the errors were really
// produced - if the narrowing regresses, the unused directives fail the check.
import {
  ErrorLoxRenderer,
  initLoxer,
  Loxer,
  NamedError,
  OutputLoxRenderer,
  PropsPrinter,
  trace as traceDecorator,
  type ErrorLox,
  type ErrorLoxTemplate,
  type LogLevel,
  type LoxerColorOptions,
  type LoxerModules,
  type LoxerOutputEvent,
  type LoxerOutputRendererOptions,
  type LoxerOutputStream,
  type LoxerOptions,
  type Module,
  type ModuleId,
  type OutputLoxTemplate,
  type OutputLoxTemplateFields,
  type PropsPrinterOptions,
  type OutputLox,
  type TraceCallPrinter,
  type TraceCloseMessageContext,
  type TraceOpenMessageContext,
} from 'loxer';
import {
  trace as traceMarker,
  type TraceCallPrinter as TraceCallPrinterFromTrace,
  type TraceCloseMessageContext as TraceCloseMessageContextFromTrace,
  type TraceOpenMessageContext as TraceOpenMessageContextFromTrace,
} from 'loxer/trace';

// Both public entry points expose the callback contracts consumers name in formatter helpers.
const rootCallPrinter: TraceCallPrinter = (content) => String(content);
const traceCallPrinter: TraceCallPrinterFromTrace = rootCallPrinter;
const rootOpenContext: TraceOpenMessageContext<[string]> = {
  args: ['order'],
  fn: rootCallPrinter,
  parentFn: rootCallPrinter,
};
const traceOpenContext: TraceOpenMessageContextFromTrace<[string]> = rootOpenContext;
const rootCloseContext: TraceCloseMessageContext<number> = {
  result: 1,
  fn: rootCallPrinter,
  parentFn: rootCallPrinter,
};
const traceCloseContext: TraceCloseMessageContextFromTrace<number> = rootCloseContext;
void traceCallPrinter;
void traceOpenContext;
void traceCloseContext;

// `satisfies`, NOT `: LoxerModules` - an annotation widens the keys to `string` and silently
// disables every assertion below.
const modules = {
  PERS: { fullName: 'Persons', color: '#0ff', devLevel: 'debug', prodLevel: 'warn' },
  DB: { fullName: 'Database', color: '#f0f', devLevel: 'info', prodLevel: 'error' },
} satisfies LoxerModules;

declare module 'loxer' {
  interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
}

Loxer.init({ modules });

// --- the keys survive `satisfies` -------------------------------------------------------------
// The function-parameter form is `any`-safe: a naive `[A] extends [B] ? [B] extends [A] …` reports
// `true` for `Equals<any, string>`, so a regression that collapsed `ModuleId` to `any` (an
// unresolved circular import, say - and this design does rely on a type-only `index` <-> `types`
// cycle) would slip through it.
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const keysStayLiteral: Equals<keyof typeof modules, 'PERS' | 'DB'> = true;
const idIsNarrowed: Equals<ModuleId, 'PERS' | 'DB' | 'NONE' | 'DEFAULT' | 'INVALID'> = true;

// --- registered ids are accepted --------------------------------------------------------------
Loxer.m('PERS').log('ok');
Loxer.module('DB').log('ok');
Loxer.highlight().m('PERS').open('ok');
// the level methods are reachable through the chain, and carry their own `.open()`
Loxer.highlight().m('PERS').debug('ok');
Loxer.highlight().m('PERS').debug.open('ok');
Loxer.warn('ok');
Loxer.info.open('ok');
Loxer.of(Loxer.debug.open('ok')).debug('ok');

// --- the built-in ids stay valid --------------------------------------------------------------
Loxer.m('NONE').log('ok');
Loxer.m('DEFAULT').log('ok');
Loxer.m('INVALID').log('ok');

// --- an omitted id still means DEFAULT --------------------------------------------------------
Loxer.m().log('ok');
Loxer.module(undefined).log('ok');

// --- typos are compile errors -----------------------------------------------------------------
// @ts-expect-error 'PRES' is not a registered module id
Loxer.m('PRES').log('typo');
// @ts-expect-error 'PRES' is not a registered module id
Loxer.module('PRES').log('typo');

// --- the `modules` given to init have to be exactly the registered ones -----------------------
const NONE = { fullName: '', color: '#fff', devLevel: 'info', prodLevel: 'error' } satisfies Module;
// the built-in ids may be overwritten alongside the registered ones
Loxer.init({ modules: { ...modules, NONE } });
initLoxer({ modules });
// @ts-expect-error 'DB' is registered, but this object does not define it
Loxer.init({ modules: { PERS: modules.PERS } });
// @ts-expect-error 'PRES' is not a registered module id
Loxer.init({ modules: { ...modules, PRES: modules.PERS } });
// ... which holds for an object declared elsewhere too, where no excess property check applies
const strayModules = { ...modules, PRES: modules.PERS } satisfies LoxerModules;
// @ts-expect-error 'PRES' is not a registered module id
Loxer.init({ modules: strayModules });
// @ts-expect-error 'PRES' is not a registered module id
initLoxer({ modules: strayModules });
// an `: LoxerModules` annotation replaces the keys with an index signature, which proves nothing
const annotatedModules: LoxerModules = modules;
// @ts-expect-error an index signature can not be checked against the registry
Loxer.init({ modules: annotatedModules });
// `LoxerOptions` stays nameable without a type argument, and checks the modules just the same
const options = { modules, dev: true } satisfies LoxerOptions;
Loxer.init(options);
// @ts-expect-error 'DB' is registered, but this object does not define it
const badOptions: LoxerOptions = { modules: { PERS: modules.PERS } };
void badOptions;
// options without modules stay valid
Loxer.init({ dev: false });
Loxer.init();

// --- getModuleLevel is narrowed too -----------------------------------------------------------
const level: LogLevel | undefined = Loxer.getModuleLevel('PERS');
// @ts-expect-error probing an unregistered id needs a cast now
Loxer.getModuleLevel('PRES');
// ... which stays available for the documented `undefined` return
const missing: LogLevel | undefined = Loxer.getModuleLevel('PRES' as ModuleId);
// a collapse to `any` would defeat every assertion above, so pin it directly
type NotAny<T> = 0 extends 1 & T ? false : true;
const moduleIdIsNotAny: NotAny<ModuleId> = true;

// --- the deleted numeric level API stays deleted ----------------------------------------------
// @ts-expect-error `.l()` / `.level()` were removed in favor of the per-level methods
Loxer.l(2).log('gone');
// @ts-expect-error `.level()` was removed in favor of the per-level methods
Loxer.level(2).log('gone');
const numericLevels = {
  ...modules,
  PERS: { fullName: 'Persons', color: '#0ff', devLevel: 1, prodLevel: 0 },
};
// @ts-expect-error module thresholds are names, never numbers
Loxer.init({ modules: numericLevels });
// @ts-expect-error 'off' / 'silent' do not exist - 'error' is the quietest a module gets
Loxer.init({ defaultLevels: { devLevel: 'off', prodLevel: 'off' } });
// @ts-expect-error an error is not a box, so there is no `Loxer.error.open()`
Loxer.error.open('gone');
// @ts-expect-error a trace opens a box, so `'error'` is not a `BoxLevel`
traceMarker(load, { level: 'error' });

// --- trace options (`loxer/trace` inherits the narrowing from one `loxer` augmentation) -------
declare function load(id: string): Promise<string>;
traceMarker(load, { moduleId: 'PERS' });
// @ts-expect-error 'PRES' is not a registered module id
traceMarker(load, { moduleId: 'PRES' });

// --- the `@trace('MOD')` decorator shorthand --------------------------------------------------
traceDecorator('PERS');
traceDecorator({ moduleId: 'DB', openMessage: 'fn(args)' });
// @ts-expect-error 'PRES' is not a registered module id
traceDecorator('PRES');
// @ts-expect-error 'PRES' is not a registered module id
traceDecorator({ moduleId: 'PRES' });

// --- props: rest parameters, freely typed message ---------------------------------------------
declare const payment: { id: string };
Loxer.log('restoring order', payment, ['a'], 3, null, undefined);
Loxer.log();
Loxer.log(42);
Loxer.log(true);
Loxer.log(null);
Loxer.log(payment);
Loxer.log(Symbol('sym'));
Loxer.log(() => 1);
Loxer.open('checkout', payment);
Loxer.debug.open('checkout', payment);
Loxer.error(new Error('boom'), payment);
Loxer.namedError('CheckoutError', 'the cart was empty', payment);
const box = Loxer.open('checkout');
box.add('step', payment);
box.warn('step', payment);
box.info('step', payment);
box.debug('step', payment);
box.error(new Error('boom'), payment);
box.namedError('CheckoutError', 'empty', payment);
box.close('done', payment);
// @ts-expect-error `namedError`'s message is the error's own and stays a string
Loxer.namedError('CheckoutError', payment);
// there is no `existingError` slot: an error handed to `namedError` is one more prop. Wrapping is
// the explicit path, which no longer competes with a prop for a position
Loxer.namedError('E', 'msg', new Error('existing'));
Loxer.error(new NamedError('E', 'msg', new Error('existing')), payment);

// --- printProps / pp on the modifier surface --------------------------------------------------
Loxer.pp().log('ok', payment);
Loxer.printProps().log('ok', payment);
Loxer.pp({}).log('ok', payment);
Loxer.pp({ depth: 1, keys: ['id'], indent: 4 }).log('ok', payment);
Loxer.pp().m('PERS').h().log('ok');
Loxer.h().pp().m('PERS').debug.open('ok');
Loxer.m('PERS').h().printProps({ depth: 0 }).error(new Error('boom'), payment);
// @ts-expect-error a modifier can not be chained twice
Loxer.pp().pp();
// @ts-expect-error `printProps` is the same modifier as `pp`
Loxer.pp().printProps();
// @ts-expect-error a modifier can not be chained twice - the same rule `pp` follows
Loxer.h().h();
// @ts-expect-error `depths` is not a `PropsPrinterOptions` field
Loxer.pp({ depths: 1 }).log('typo');
const printerOptions: PropsPrinterOptions = { depth: 2, shortenClasses: false };
void printerOptions;

// --- the public printer -----------------------------------------------------------------------
Loxer.init({
  modules,
  output: outputFromCallbacks({
    devLog: (lox) => {
      if (lox.printProps) {
        const rendered: string = PropsPrinter.of(lox).print();
        void rendered;
      }
      const props: unknown[] = lox.props;
      void props;
    },
    devError: (lox) => {
      const rendered: string = PropsPrinter.of(lox).print(false, { depth: 4, color: '#fff' });
      void rendered;
    },
  }),
});
const fromValues: string = PropsPrinter.ofValues([payment], { depth: 1 }).print(false);
void fromValues;

// --- the public structured output templates ---------------------------------------------------
declare const outputLox: OutputLox;
declare const errorLox: ErrorLox;
const rendererColors: LoxerColorOptions = {
  highlightColor: '#123456',
  warnColor: '#654321',
  errorColor: '#ff0000',
  errorNameBackgroundColor: '#000000',
  errorNameColor: '#ffffff',
};
const rendererOptions: LoxerOutputRendererOptions = {
  endTitleOpacity: 0.5,
  boxLayoutStyle: 'double',
  colors: rendererColors,
};
const outputTemplate: OutputLoxTemplate = OutputLoxRenderer(outputLox, 21, rendererOptions);
const outputFields: OutputLoxTemplateFields = outputTemplate.colored;
const outputFieldsAreStrings: string[] = [
  outputFields.module,
  outputFields.message,
  outputFields.timeConsumption,
  outputFields.box,
  outputFields.props,
  outputFields.timeStamp,
];
const errorTemplate: ErrorLoxTemplate = ErrorLoxRenderer(errorLox, 21, rendererOptions);
const errorFieldsAreStrings: string[] = [
  errorTemplate.module,
  errorTemplate.message,
  errorTemplate.timeConsumption,
  errorTemplate.box,
  errorTemplate.props,
  errorTemplate.timeStamp,
  errorTemplate.stack,
  errorTemplate.openLogs,
  errorTemplate.colored.stack,
  errorTemplate.colored.openLogs,
];
const consumerOutput: LoxerOutputStream = (event: LoxerOutputEvent) => {
  if (event.kind === 'error') {
    const history: (OutputLox | ErrorLox)[] = event.history;
    void history;
  } else {
    // @ts-expect-error history exists only on error events
    void event.history;
  }
};
void outputFieldsAreStrings;
void errorFieldsAreStrings;
void consumerOutput;
const oneLine: string = PropsPrinter.singleLine(payment);
void oneLine;

// --- the replaced item surface stays replaced --------------------------------------------------
// @ts-expect-error `ItemType` was replaced by freely-typed props
type GoneItemType = import('loxer').ItemType;
// @ts-expect-error `ItemOptions` was replaced by `PropsPrinterOptions`
type GoneItemOptions = import('loxer').ItemOptions;
// @ts-expect-error the capture options are named after props
traceMarker(load, { argsAsItem: true });
// @ts-expect-error the capture options are named after props
traceMarker(load, { resultAsItem: true });
traceMarker(load, { argsAsProps: true, printArgs: { depth: 1 } });
traceMarker(load, { resultAsProps: true, printResult: true });
traceDecorator({ argsAsProps: true, printArgs: true, resultAsProps: true, printResult: { keys: [] } });
// @ts-expect-error `prettyResult` was removed; use `resultAsProps` with `printResult` instead
traceMarker(load, { closeMessage: 'prettyResult' });
// @ts-expect-error 'functionName' / 'parent.functionName' were replaced by 'fn' / 'parent.fn'
traceMarker(load, { openMessage: 'functionName' });
// @ts-expect-error 'types' was replaced by 'fn(types)' / 'parent.fn(types)'
traceMarker(load, { openMessage: 'types' });
// @ts-expect-error 'args' was replaced by 'fn(args)' / 'parent.fn(args)'
traceMarker(load, { openMessage: 'args' });
// @ts-expect-error 'result' was replaced by 'fn(result)' / 'parent.fn(result)'
traceDecorator({ closeMessage: 'result' });
// the full new template set stays accepted, on both entry points
traceMarker(load, { openMessage: 'parent.fn(args)', closeMessage: 'parent.fn(result)' });
traceDecorator({ openMessage: 'fn(types)', closeMessage: 'parent.fn' });
