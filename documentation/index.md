# Documentation

- [Documentation](#documentation)
- [Overview](#overview)
- [Plain-function tracing](#plain-function-tracing)
- [1. Initialization - `Loxer.init()`](#1-initialization---loxerinit)
- [2. Simple logs - `Loxer.log()`](#2-simple-logs---loxerlog)
- [3. Error logs - `Loxer.error()`](#3-error-logs---loxererror)
- [4. Highlighting - `Loxer.highlight()`](#4-highlighting---loxerhighlight)
- [5. Levels - `Loxer.warn()` / `Loxer.info()` / `Loxer.debug()`](#5-levels---loxerwarn--loxerinfo--loxerdebug)
- [6. Modules - `Loxer.module()`](#6-modules---loxermodule)
- [7. Output - `LoxerOutputStream`](#7-output---loxeroutputstream)
- [8. Boxes](#8-boxes)
- [Appendix: Migrating from Loxer 2](#appendix-migrating-from-loxer-2)

Instructions on how to use props can be found **[on the props documentation][propsDocs]**.

# Overview

Loxer's main goal is to increase application safety by showing data flow through logs. Logs can have levels, belong to modules, carry error details, and connect into boxes. A box begins with an opening log, continues with logs and errors, and ends with a closing log; the built-in renderer visualizes that relationship with branches. Loxer can send each visible log or error to an output stream, which lets an application forward production errors to an analysis service such as Firebase Crashlytics.

The following sections describe the use of Loxer in detail. Further information can be found in the [API Reference][api].

# Plain-function tracing

For a Babel-capable TypeScript project, `trace` marks a named plain function for automatic Loxer box
tracing. Import it from `loxer/trace` and place the marker immediately after the function binding:

```typescript
import { Loxer } from 'loxer';
import { trace } from 'loxer/trace';

async function submitOrder(orderId: number) {
  Loxer.m('PAYMENT').log(`Charging order ${orderId}`);
  return charge(orderId);
}

trace(submitOrder, {
  moduleId: 'ORDER',
  openMessage: 'args',
  closeMessage: 'result',
  highlight: 'all',
});
```

The transform removes the marker, opens one box per invocation, links direct `Loxer.log`,
`Loxer.warn`, `Loxer.info`, `Loxer.debug`, `Loxer.error`, and `Loxer.namedError` calls in that
function body, and closes the box on return or rejection. A level's `.open()`
(`Loxer.debug.open(...)`) is not linked, because it opens a box of its own. Direct
`.h()`/`.highlight()` and `.m()`/`.module()` chains retain their normal observable behavior. The
function keeps its original `this`, synchronous return value, Promise identity, and thrown or
rejected value.

`trace` supports named function declarations and named variables initialized with a function expression
or arrow function. It does not trace generators, async generators, aliases, or separately declared or
detached helper functions. Instrument such code separately, or use explicit `Loxer.open()` /
`Loxer.of()` calls when it needs to join a particular box.

## Tracing several functions with the same options

Instead of a single function, `trace` also accepts an array literal of them plus the options they all
share:

```typescript
import { trace } from 'loxer/trace';

function loadOrder(orderId: number) {
  return repository.find(orderId);
}
function saveOrder(orderId: number) {
  return repository.save(orderId);
}
const cancelOrder = (orderId: number) => repository.cancel(orderId);

trace([loadOrder, saveOrder, cancelOrder], {
  moduleId: 'ORDER',
  openMessage: 'args',
});
```

Each listed function is traced exactly as its own `trace` marker would trace it: its own box per
invocation, its own linked direct `Loxer` calls, and unchanged callable behavior. The single
difference is the options, which are evaluated once and shared, so a helper call such as
`trace([loadOrder, saveOrder], orderTraceOptions())` runs that helper one time for the group.

A list accepts the same targets as a single marker and rejects the same unsupported ones. It must be
an array literal of identifiers — a spread element, a computed member such as `service.method`, an
empty array, or a variable holding an array is rejected at build time, because the transform has to
resolve every binding while it compiles the module. Each function may carry only one marker: listing
it twice, or marking it both alone and inside a list, is a build error rather than a nested double
trace.

Formatter callbacks receive the union of the listed functions' argument tuples and results, so a
group of functions with different signatures needs a formatter that handles all of them. Give a
function its own marker when it needs its own messages, module, or level.

## Build setup

Install `babel-plugin-loxer-trace` alongside Babel 8, then register it in the Babel transform that
processes the TypeScript source. The plugin requires Node 22.18 or later; the `loxer` runtime itself
continues to support Node 20 or later.

```typescript
// babel.config.mjs
export default {
  presets: ['@babel/preset-typescript'],
  plugins: ['babel-plugin-loxer-trace'],
};
```

`@babel/preset-typescript` lets Babel parse TypeScript before the trace plugin transforms its marked
bindings. Keep the trace plugin in the same Babel configuration as that preset, and keep the normal
Babel source-map setting for your build enabled. The plugin preserves Babel-generated
mappings, so no separate tracing-specific source-map setting is required.

For Vite, use the matching Vite adapter. It runs as a pre-transform so Babel handles the marker before
Vite's normal TypeScript/JSX transform. Vite requests source maps from the adapter and continues to
compose them with its downstream transforms.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({
  plugins: [loxerTrace()],
});
```

The adapter also contributes the Vite settings that keep the page on one copy of Loxer:
`resolve.dedupe` and an `optimizeDeps.include` naming both entry points, so the `loxer/trace` import
it injects cannot force a mid-session re-optimization. `loxerTrace({ dedupe: false })` leaves both to
you.

`openMessage` accepts `functionName`, `parent.functionName`, `args`, `types`, or a formatter;
`closeMessage` accepts `functionName`, `parent.functionName`, `result`, or a formatter. `moduleId`,
`level`, `highlight`,
`argsAsProps`, `resultAsProps`, `printArgs`, and `printResult` follow the same behavior as
function-relevant `@trace` options.
`TraceOptions` is shared by the plain-function marker and the class-method decorator. The marker
infers an open formatter's argument from the marked function's actual argument tuple and a close
formatter's argument from its awaited result. TypeScript evaluates `@trace(...)` before it associates
the decorator with the method, so decorators need explicit generics when formatter callbacks need
these types:

```typescript
import { trace } from 'loxer';

class CheckoutService {
  @trace<[subtotal: number, taxRate: number], number>({
    openMessage: ([subtotal, taxRate]) => `Calculating ${subtotal} at ${taxRate}`,
    closeMessage: (total) => `Total: ${total.toFixed(2)}`,
  })
  calculate(subtotal: number, taxRate: number): number {
    return subtotal * (1 + taxRate);
  }
}
```

`parent.functionName` prefixes the traced function's parent, so a box opens as
`Checkout.calculate()` and closes as `Checkout.calculate done`. The parent of a method is its class,
read off a decorated method and off the class body a marker sits in: a method, a private method, a
getter or setter, and an ordinary, private, or accessor field all report their class. A class name
ending in `Class` reports without that suffix, so a method of `OrderServiceClass` reads as
`OrderService.load`.

The parent of every other marked function is the file it is written in, named without its
directories or extension: a plain function, one declared inside a method's body, and one an object
literal holds all report `orderService.load` in `src/orders/orderService.ts`. The file comes from the
build, so a function reports one only where Babel is given a filename — as `babel-plugin-loxer-trace`
and `vite-plugin-loxer-trace` are in an ordinary build. A function neither a class nor a file reaches
reports its own name, the same as `functionName` does, which is also what a decorated method reports
when a call reaches it detached from its class. Formatters and result serialization fall back to the
default message when they fail, without changing the application result.

`openMessage: 'args'` and result message modes create formatted message strings for output handlers; built-in
argument formatting escapes control characters. `argsAsProps` and `resultAsProps` are the modes that
send the original values on to the output stream as the log's [props][propsDocs]: `argsAsProps` attaches
one prop per argument to the opening log, `resultAsProps` attaches a defined resolved result as a
single prop to the closing log (a `void` result attaches none). `printArgs` and `printResult`
additionally have the built-in output render
them, and each accepts a `PropsPrinterOptions` object in place of `true` to bound that rendering. Do
not enable message or props capture for secrets or personal data unless the receiving output handler
redacts or otherwise protects that data.

# 1. Initialization - [`Loxer.init()`][loxer.init]

In order to be able to use Loxer, it must first be initialized. To do this, the method `Loxer.init(options?: LoxerOptions)` must be called once. Loxer can be configured with [`LoxerOptions`][loxerOptions] during initialization. For the simple initialization, the options can also be left out.

###### Simple initialization

```typescript
Loxer.init();
```

This method can be called anywhere in your application.

> - There is also a method decorator `@initLoxer(options?: LoxerOptions)` that does the same thing.
> - It is recommended to declare a separate `const options = { ... } satisfies LoxerOptions` that is passed to the init method, because the more detailed the configuration, the larger the parameter.
>   Use `satisfies`, not a `: LoxerOptions` annotation: an annotation widens the keys of your `modules` to `string`, which silently switches off the typed module ids you get from augmenting `LoxerModuleRegistry` (see [Typing your module ids](#typing-your-module-ids)).

`Loxer` is one instance per JavaScript realm, anchored on `globalThis` rather than on a module. Every copy of the package that a bundler or a module registry hands out shares that instance, along with its configuration and history, so one `Loxer.init()` covers all of them. A worker, an iframe or a server process is a realm of its own and gets its own instance.

### Logs made before initialization

Logging before `Loxer.init()` runs loses nothing: those logs wait in a queue and are output in order once init happens, levelled against the modules that init supplies. The queue keeps the 1000 oldest logs and drops beyond that, which preserves the startup story it exists for.

A queue that never drains reports itself. If logs have been waiting longer than 5 seconds, Loxer writes one `console.warn` — the only channel it has before `init()` receives its output stream — naming how many logs are waiting, the first of them, and the two things that keep a queue from draining: an `init()` that never runs, or a bundler that loaded two copies of Loxer so that `init()` reached a different one than the logs. An application that initializes late on purpose, for instance while it fetches its configuration, will see this warning; it is accumulating unflushed logs, which is what the message reports.

### LoxerOptions:

Anyways, the options are an object with the following structure:

```typescript
  // An object containing all log-able modules
  modules?: RegisteredModules;
  // determines if Loxer is running in a development or production environment
  dev?: boolean;
  // Receives each visible log or error
  output?: LoxerOutputStream;
  // The configuration of Loxer
  config?: LoxerConfig;
  // The default levels of the built-in modules, in production or development
  defaultLevels?: {
    // the threshold to show logs at in development mode
    devLevel: LogLevel;
    // the threshold to show logs at in production mode
    prodLevel: LogLevel;
  };
```

More about the details of the options can be found in the following sections.

<!-- ------------------------------------------------------------------------------------------- -->

# 2. Simple logs - [`Loxer.log()`][loxer.log]

To make a simple log, all you have to do is call `Loxer.log(message?: unknown, ...props: unknown[])`.
In development, a logger with no `output` stream renders the message to the console. In production,
it remains silent until an output stream is supplied.

Every argument after the message is one of the log's **[props][propsDocs]**: data that travels with
the log to the output stream and the history, and that the built-in output renders where the call chained
`Loxer.printProps()` (short: `pp()`).

###### Example

```typescript
const person = { name: 'John Doe', age: 69 };
console.log('This is the person:', person);
Loxer.log('This is the person:', person);
Loxer.pp().log('This is the person:', person);
```

###### Console output

```
This is the person: { name: 'John Doe', age: 69 }
This is the person:
This is the person:
┃ props> { name: 'John Doe', age: 69 } <props
```

The message may be of any type, not only a `string`: a primitive is stringified and an object renders
as one compact line, so `Loxer.log(person)` reads as its contents.

### Rendering props - [`Loxer.printProps()`][loxer.printprops]

Props are attached to the log whether or not they are rendered, which is what makes attaching one
consequence-free: they reach the [output stream](#7-output---loxeroutputstream) and `Loxer.history` by
reference, and the built-in console output prints them only where the call chained `printProps()` (or
`pp()`).

```typescript
Loxer.log('restoring order', payment);              // attached, nothing printed
Loxer.pp().log('restoring order', payment);         // attached and printed
Loxer.pp({ depth: 1 }).log('restoring order', payment);  // ... with bounded depth
```

Chaining it at all is the request; the optional [`PropsPrinterOptions`][propsPrinterOptions] argument
only configures the rendering, so `pp()` and `pp({})` print alike. It is a one-shot modifier like
`.highlight()` and `.module()`: it applies to the one log at the end of the chain, composes with them
in any order, and cannot be chained twice.

On page **[Props][propsDocs]** there is a detailed guide about the advantages over the `console` and
the possibilities that props bring with them.

> Loxer comes with some improvements for logs:
>
> - Logs can be highlighted.
> - Logs can be given levels.
> - Logs can be categorized in modules.
> - Logs can be distributed to different output streams.
> - More on that in the sections about boxes and output.

<!-- ------------------------------------------------------------------------------------------- -->

# 3. Error logs - [`Loxer.error()`][loxer.error]

Creating simple error logs is analogous to a simple log. Therefore you write `Loxer.error(error: ErrorType, ...props: unknown[])`. By default this log will be proceeded to `console.error()`.

The error parameter must be of `type ErrorType = Error | string | number | boolean | object`, because these are the types that an error of a `catch(error)` phrase can take. Position 0 is always the error, so the props behave the same way as in the `.log()` method - every argument after the error is one of them.

###### Example

```typescript
Loxer.error('this is a string error');
Loxer.error(404);
Loxer.error(false);
Loxer.error({ type: 'ServerError', code: 404 });
Loxer.error(new RangeError('this is a range error'));

// if using .highlight() or .h() on an error, then the stack ALWAYS will be printed:
Loxer.highlight().error('this is a highlighted error that prints the stack!!!');
```

###### Console output

<!-- ![console_output](/assets/docs_images/3.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/3.png)

Loxer internally creates an `Error` out of any other message type than `Error` though it enables to get a Stack even if the thrown error has none.

### [NamedError][namedError]

There is also helper class called `NamedError`. It can be used to create custom errors which can extend any other error. This may be useful for more explicit results of the error in a catch phrase.

###### Example

```typescript
Loxer.error(new NamedError('CustomError', 'failed hard!'));
Loxer.error(new NamedError('StringError', 'failed hard!', 'string error'));
Loxer.error(new NamedError('NumberError', 'failed hard!', 404));
Loxer.error(new NamedError('BooleanError', 'failed hard!', false));
Loxer.error(new NamedError('ObjectError', 'failed hard!', { type: 'ServerError', code: 404 }));
Loxer.error(new NamedError('ErrorError', 'failed hard!', new TypeError('catched Error')));
```

###### Console output

<!-- ![console_output](/assets/docs_images/3-2.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/3-2.png)

There is also a shortcut for the creation of `NamedError`s, on `Loxer` itself and on
`Loxer.of(...)`, which names the error and takes props like `.error(...)` does:

```typescript
Loxer.namedError('MyError', 'crashed', payment);
Loxer.of(lox).namedError('MyError', 'crashed', payment);

// Example:
Loxer.of(lox).namedError('MyError', 'crashed', payment);
// is equivalent to:
Loxer.of(lox).error(new NamedError('MyError', 'crashed'), payment);
```

The error's message is the given `message` alone. To concatenate an error that was caught, name the
`NamedError` explicitly - which leaves every argument after it free to be a prop:

```typescript
Loxer.of(lox).error(new NamedError('MyError', 'crashed', someGivenError), payment);
```

> More on that in the sections about boxes and output.

<!-- ------------------------------------------------------------------------------------------- -->

# 4. Highlighting - [`Loxer.highlight()`][loxer.highlight]

Highlighting makes a log easy to locate among many others. Chain `.highlight()` or its `.h()` alias;
the built-in renderer inverts the message foreground and background by default. A destination can
choose a highlight color through `LoxerOutputRendererOptions.colors.highlightColor` when it calls an
output renderer.

###### Example

```typescript
Loxer.highlight().log('this will be seen easily');
Loxer.h().log('this too');

// conditionally highlight
const shouldHighlight = Math.random() > 0.5;
// the methods accept an optional boolean parameter
Loxer.h(shouldHighlight).log('This message will be conditionally highlighted');
```

###### Console output

<!-- ![console_output](/assets/docs_images/4.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/4.png)

> - The highlight methods can be chained with **any other logging** method like `Loxer.error()`, `Loxer.open()` and `Loxer.of()`.
> - highlighting error logs will append the stack to the output stream
> - They can also be chained with `.module()` / `.m()` and in front of a level, in **any order** - e.g. `Loxer.h().m('CART').debug.open(...)`.
> - The highlighting will only take effect on the `colored.message` property on the output streams logs / errors.

<!-- ------------------------------------------------------------------------------------------- -->

# 5. Levels - `Loxer.warn()` / `Loxer.info()` / `Loxer.debug()`

Every log has a **level** saying how severe it is. There are four, ordered from the most to the least
severe ([`LogLevel`][loxer.loglevel]):

| level     | meaning                                         |
| --------- | ----------------------------------------------- |
| `'error'` | something failed                                |
| `'warn'`  | something is suspicious but recoverable         |
| `'info'`  | the ordinary log                                |
| `'debug'` | detail that is only interesting while debugging |

### Levels on logs

The level belongs to the call that writes the log, the way `console.warn` does. There is one method
per level:

```typescript
Loxer.error(new Error('payment declined')); // level 'error'
Loxer.warn('retrying the request'); // level 'warn'
Loxer.info('user loaded'); // level 'info'
Loxer.debug('cache miss'); // level 'debug'
```

`Loxer.log()` writes at `'info'`, so `Loxer.log('user loaded')` and `Loxer.info('user loaded')` are
the same log.

`warn`, `info` and `debug` each carry an `.open()` as well, which opens a box at that level
([`LevelMethods`][loxer.levelmethods]):

```typescript
const box = Loxer.debug.open('recalculating cart');
Loxer.of(box).debug('line 1 of 40');
Loxer.of(box).close('done');
```

`Loxer.open()` opens at `'info'`, matching `Loxer.log()`.

Because the level is a property rather than a call, the modifiers of the previous sections chain in
front of it in any order:

```typescript
Loxer.h().m('CART').debug('cache rebuilt');
Loxer.m('CART').h().debug.open('recalculating cart');
```

> - `Loxer.warn()` and `Loxer.error()` both reach `output`. The event's `kind` distinguishes normal
>   logs from errors; the lox's `level` distinguishes a warning from other normal logs.
> - `Loxer.error()` takes an `Error` rather than a message and opens no box, so it has no `.open()`.
>   For the same reason the `level` trace option is a [`BoxLevel`][loxer.boxlevel] - every `LogLevel`
>   except `'error'`.
> - The levels of logs added to a box are described in [8. Boxes](#8-boxes).

### The level a module logs up to

A module says how far down that list it wants to go. A log is written when its level is at or before
what the module logs up to:

| the module logs up to | it writes               | it drops                |
| --------------------- | ----------------------- | ----------------------- |
| `'error'`             | `error`                 | `warn`, `info`, `debug` |
| `'warn'`              | `error`, `warn`         | `info`, `debug`         |
| `'info'`              | `error`, `warn`, `info` | `debug`                 |
| `'debug'`             | everything              | —                       |

Each module sets its own, separately for development and production, which is how you give different
parts of an application different logging densities. The built-in modules `NONE` and `DEFAULT` take
theirs from `defaultLevels` in the [`LoxerOptions`][loxerOptions]:

```typescript
Loxer.init({
  defaultLevels: {
    devLevel: 'debug', // how far to go in development
    prodLevel: 'warn', // how far to go in production
  },
});
```

Without `defaultLevels` they use `devLevel: 'info'` and `prodLevel: 'error'`, so a development
console shows everything except `debug()` and production stays quiet apart from errors.

> **Errors are always written**, whatever the module logs up to. A module set to `'error'` therefore
> reports its errors and nothing else - it is the quietest a module gets, and there is no `'off'` or
> `'silent'` level. To switch logging off entirely use [`LoxerConfig`][loxerConfig]'s `disabled` or
> `disabledInProductionMode`.

<!-- ------------------------------------------------------------------------------------------- -->

# 6. Modules - [`Loxer.module()`][loxer.module]

Modules are one way of categorizing logs in order to:

- To create clarity in the output (with coloring)
- Give individual categories their own threshold
- Detect possible dependencies on services / domains
- focussing error detection on the dedicated parts of your application

### Modules on logs

Assigning modules to logs is again done in the same way as highlighting. Therefore you have to chain them with the `.module(moduleId: string)` or `.m(moduleId: string)`

###### Example

```typescript
Loxer.module('PERS').log('this log is assigned to the module with the key PERS');
Loxer.m('PERS').log('this too');
Loxer.m('CART').log('this one is assigned to a module with the fullName "Shopping Cart"');
Loxer.m('BILLING').log('this one to "Billing"');
Loxer.m().log('this one is automatically assigned to the module DEFAULT');
Loxer.log('this one is automatically assigned to the module NONE');
```

###### Console output

<!-- ![console_output](/assets/docs_images/6.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/6.png)

> The module methods can be chained with the logging methods `Loxer.error()` and `Loxer.open()`. Assigning a module to `Loxer.of()` is no problem, but has no effect. `.of()` logs always receive the module from their opening log.

### Declaring modules

Modules must be declared as part of the [`LoxerOptions`][loxerOptions] when you initialize `Loxer`. Therefore the `options.modules` must receive an object with a [`Module`][loxerModule] per module id (`satisfies LoxerModules`), where the `moduleId` is the key that will be referenced in the `.m()` and `.module()` methods. Which ids that object has to define is up to your project — see [Typing your module ids](#typing-your-module-ids).

A [`Module`][loxerModule] must be structured as :

```typescript
{
  devLevel: LogLevel;
  prodLevel: LogLevel;
  fullName: string;
  color: string;
  boxLayoutStyle?: BoxLayoutStyle;
}
```

The two levels are of the same type as the `defaultLevels` (see [5. Levels](#5-levels---loxerwarn--loxerinfo--loxerdebug)) and the `fullName`, `color` and `boxLayoutStyle` will be used for the output.

The `color` must be either structured in HEX (`'#ff1258'`) or RGB format (`'rgb(255, 0, 0)'`) that will be interpreted by the [color][pkg.color] package.

###### Declaring modules

```typescript
Loxer.init({
  modules: {
    PERS: { color: '#f00', fullName: 'Persons', devLevel: 'debug', prodLevel: 'warn' },
    CART: { color: '#00ff00', fullName: 'Shopping cart', devLevel: 'info', prodLevel: 'warn' },
    BILLING: { color: 'rgb(0, 120, 255)', fullName: 'Billing', devLevel: 'info', prodLevel: 'error' },
  },
});
```

> - You are free to set any string key for a `moduleId`, but it will be efficient to choose short ones, because you probably have to write them often.

### Typing your module ids

As long as Loxer knows nothing about your modules, a `moduleId` is an ordinary `string`, so a typo
like `Loxer.m('PRES')` compiles and shows up at runtime as a red `INVALIDMODULE` label. Register the
modules of your project at the [`LoxerModuleRegistry`][loxerModuleRegistry] once, and every module id
is autocompleted and checked instead:

```typescript
import { Loxer, type LoxerModules } from 'loxer';

export const modules = {
  PERS: { color: '#f00', fullName: 'Persons', devLevel: 'debug', prodLevel: 'warn' },
  CART: { color: '#00ff00', fullName: 'Shopping cart', devLevel: 'info', prodLevel: 'warn' },
} satisfies LoxerModules;

declare module 'loxer' {
  interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
}

Loxer.init({ modules });
```

The registered ids are the ones `.m()` / `.module()`, [`Loxer.getModuleLevel()`][loxer.getmodulelevel]
and the `moduleId` [trace option](#plain-function-tracing) accept — and the ones the `modules` of
`Loxer.init()` itself has to define ([`RegisteredModules`][registeredModules]):

```typescript
Loxer.m('PERS').log('to the module Persons'); // ✔
Loxer.m('PRES').log('typo'); // ✘ - 'PRES' is not a registered module id

Loxer.init({ modules }); // ✔
Loxer.init({ modules: { PERS: modules.PERS } }); // ✘ - 'CART' is registered, but not defined here
Loxer.init({ modules: { ...modules, PRES: modules.PERS } }); // ✘ - 'PRES' is not registered
```

> - Write `satisfies LoxerModules`, not a `: LoxerModules` annotation: an annotation replaces the
>   keys of your object with an index signature, which switches off every check above.
> - Deriving the registry from the object with `Record<keyof typeof modules, true>` keeps the two in
>   lockstep, so declaring a module and registering it are a single edit.
> - The built-in ids `NONE`, `DEFAULT` and `INVALID` stay valid and may be overwritten in
>   `options.modules` (see [Default modules](#default-modules)).
> - The augmentation belongs in a file that is a module: if it contains nothing else, add an
>   `export {};`, or TypeScript reads it as a declaration that replaces the package.

### Default modules

###### There are 3 default modules, that are predefined:

This is Loxer's own internal declaration, shown for reference — not a template for your modules. When
you declare your own, use `satisfies LoxerModules` rather than an annotation, so the keys stay
literal.

```typescript
export const DEFAULT_MODULES: LoxerModules = {
  NONE: { fullName: '', color: '#fff', devLevel: 'info', prodLevel: 'error' },
  DEFAULT: { fullName: '', color: '#fff', devLevel: 'info', prodLevel: 'error' },
  INVALID: {
    fullName: 'INVALIDMODULE',
    color: '#f00',
    devLevel: 'info',
    prodLevel: 'error',
  },
};
```

The built-in modules leave box layout selection to the output renderer's fallback. Set a module's
`boxLayoutStyle` only when that module needs to override the destination's fallback.

The `NONE` module is automatically assigned when there is no module method chained in a logging method. The output will have no box layout and no module name as prefix.

The `DEFAULT` module is automatically assigned, when logs are chained with an empty module method like `.m()`. The output will have a box layout and an empty module name.

The `INVALID` module is automatically assigned, when logs are tried to be assigned with non existing modules (giving false moduleIds). The output will have no boxlayout, but the prominent fullName as module name.

###### Example

```typescript
Loxer.log('this log is automatically assigned to the module NONE');
Loxer.m().log('this one to the module DEFAULT');
Loxer.m('Wrong').log('this one to the INVALID module');
```

###### Console output

<!-- ![console_output](/assets/docs_images/6-2.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/6-2.png)

> All default modules can be redefined in the `options.modules` by overwriting their keys.
>
> - **ATTENTION**: beware of forcefully setting any of these modules to a falsy value like `null` or `undefined` because this will definitely cause Loxer to crash.
> - If you want them to report errors only, set what they log up to to `'error'`.

<!-- ------------------------------------------------------------------------------------------- -->

# 7. Output - [`LoxerOutputStream`][loxerOutputStream]

Loxer sends every visible log and error through one `output` function. The event identifies its
environment and uses `kind` to discriminate the lox and the error-only history. Errors are emitted
regardless of their module threshold; ordinary logs are emitted only when their level is within what
their module logs up to.

```typescript
import {
  ErrorLoxRenderer,
  Loxer,
  OutputLoxRenderer,
  type LoxerOutputEvent,
} from 'loxer';

function forward(event: LoxerOutputEvent) {
  if (event.kind === 'error') {
    reportError(event.lox.error, event.history);
    return;
  }

  writeAuditLog({ environment: event.environment, level: event.lox.level, props: event.lox.props });
}

Loxer.init({ dev: false, output: forward });
```

`environment` is `'dev'` or `'prod'`. A `'log'` event carries an `OutputLox`; an `'error'` event
carries an `ErrorLox` plus a snapshot of the history at the time of the error. The stream receives
the raw loxes, not console text. Treat their props as caller-owned data and apply the destination's
redaction, retention, and access policy before forwarding them.

When no stream is supplied, development renders colored output to `console.log`; production remains
silent. Supplying `output` replaces that fallback in both environments.

### Output logs

To symbolize that the logs are more than just simple messages, they are named `* Lox`. There are two different types. In addition to the original message and props, the [`OutputLox`][outputLox] contains the declared properties level, highlight and module, a time stamp and properties that arise from the box layout. [`ErrorLox`][errorLox] have the same properties, but also carry information such as the `Error` that has occurred and properties that represent the log status during the occurrence of the error.

###### [OutputLox][outputLox]

```typescript
{
  /** the internal identifier of the log */
  id: number;
  /** the message of the log */
  message: string;
  /** determines if the log was highlighted with `Loxer.highlight()` or `Loxer.h()` */
  highlighted: boolean;
  /** the values the log was called with, after its message - always an array */
  props: unknown[];
  /** the rendering the call asked for with `Loxer.printProps(...)`, or `undefined` for no request */
  printProps: PropsPrinterOptions | undefined;
  /** the type of the log */
  type: LoxType;
  /** the corresponding key of a module from `LoxerOptions.modules` */
  moduleId: string;
  /** the `LogLevel` of the log - the level it was written at, or the opening log's for `.of()` logs */
  level: LogLevel;
  /** the time the log appeared */
  timestamp: Date;
  /** the box layout of the log */
  box: Box = [];
  /** a string that represents the time consumption from the opening log's `timestamp` until this log appeared */
  timeText: string | '' = '';
  /** the time consumption (in `ms`) from the opening log's `timestamp` until this log appeared */
  timeConsumption: number | undefined;
  /** determines if the log's level sits past the level its module logs up to */
  hidden: boolean = false;
  /** the corresponding module of this Lox (for module text / color / etc.) */
  module: ExtendedModule = DEFAULT_EXTENDED_MODULE;
}
```

###### [ErrorLox][errorLox]

```typescript
  // ... all the Properties from OutputLox +
  /** the error that was initially given, or created by Loxer */
  error: Error;
  /** a list of opened `OutputLox` which have not been closed until the occurrence of this error log */
  openLoxes: OutputLox[] = [];
```

> For more detailed information about the Lox's properties (as well as all other components of Loxer), a look at the [API reference][logs] is recommended.

### Rendering a destination

[`OutputLoxRenderer`][outputLoxRenderer] and [`ErrorLoxRenderer`][errorLoxRenderer] return plain
fields together with a `colored` field set. Each field is independently composable, so a destination
can preserve the box and props while arranging times and messages for its own format.

Two fields carry the moment the log appeared, and a destination prints one of them: `time` is the
time of day (`HH:MM:SS`, 8 characters) and `timeStamp` is the full date and time
(`YYYY-MM-DD HH:MM:SS`, 19 characters). A terminal that logs one session live rarely needs the date;
a file or a log service usually does. `timeConsumption` is unrelated to both — it is the elapsed time
a box reports, and it is empty for a log that belongs to no box.

The renderer's second argument is the number of columns the destination prints **before** the
message, which is what rendered props are indented to line up under. So it counts the time field the
destination actually chose, its separator, and the module text:

```typescript
import { ErrorLoxRenderer, OutputLoxRenderer, type LoxerOutputRendererOptions } from 'loxer';

const rendererOptions: LoxerOutputRendererOptions = {
  boxLayoutStyle: 'round',
  colors: { warnColor: '#ffa50f', errorColor: '#ff0000' },
};

// `time` (8) + the space after it (1)
const timeWidth = 8 + 1;

Loxer.init({
  output(event) {
    if (event.kind === 'error') {
      const rendered = ErrorLoxRenderer(event.lox, timeWidth + event.lox.module.slicedName.length, rendererOptions);
      console.log(`${rendered.colored.time} ${rendered.colored.module}${rendered.colored.box}${rendered.colored.message}${rendered.colored.stack}`);
      return;
    }

    const rendered = OutputLoxRenderer(event.lox, timeWidth + event.lox.module.slicedName.length, rendererOptions);
    console.log(`${rendered.colored.time} ${rendered.colored.module}${rendered.colored.box}${rendered.colored.message}${rendered.colored.props}`);
  },
});
```

Printing `timeStamp` instead is the same code with `19 + 1` as the width.

Pass `LoxerOutputRendererOptions` to either renderer to select the fallback box layout, close-title
opacity, and ANSI colors for that destination. A module's `boxLayoutStyle` always overrides the
renderer fallback. Renderers format without changing the lox, its box, or logger history.

# 8. Boxes

Another main feature of Loxer is the ability to visualize data flows. To do this, logs are combined into boxes by defining a start and an end log. Further logs as well as errors can be added between the two. In addition, the elapsed time since the opening log is measured for each log / error.

In addition, a box layout is created that shows the course of the box, but with the degree of nesting in relation to other boxes or individual logs. This enables connections between synchronous and asynchronous processes to be recognized and potential sources of error to be tracked down. Furthermore, it can easily be determined whether processes are not terminating, are taking too long, are too short, or are not being carried out at all.

### Create boxes

To use a box, it must be opened with `Loxer.open(message?: unknown, ...props: unknown[])`. The `.open()` method returns the `id: number` of the log, which is used to connect other logs to this one. The rest of the structure and functionality is analogous to the `.log()` method. It can also be chained with `.highlight()` and `.module()`, just like the rest of the log methods, and `Loxer.debug.open(...)` / `.warn.open(...)` / `.info.open(...)` open the box at that level instead of `'info'`. **As a reminder**, if the box layout is to be generated, **a module** or at least the default module (`.m()`) **must be assigned** to the log that opens.

###### Open a box - [`Loxer.open()`][loxer.open]

```typescript
const id = Loxer.module().open('this is an opening message');
const id2 = Loxer.module('PERS').open('this is an opening message assigned to a module');
const id3 = Loxer.h().m('CART').open('this one is additionally highlighted');
```

###### Console output

<!-- ![console_output](/assets/docs_images/8-1.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/8-1.png)

If an open box is to be closed, or logs / errors are to be added, the `Loxer.of(id: number)` method must be used. This method returns an object with [3 further methods][ofLoxes], which enables the next method to be added as a chain. These are the actual logging methods:

- `add(message?: unknown, ...props: unknown[])` - adds a log to the box and works in the same way as `Loxer.log()`
- `error(error: ErrorType, ...props: unknown[])` - adds an error to the box and works in the same way as `Loxer.error()`
- `close(message?: unknown, ...props: unknown[])` - closes the box and works in the same way as `Loxer.log()`

**ATTENTION**: When calling `add()`, `error()` or `close()` after closing the box, the log will not be appended to the box but logged anyways with a Warning!

###### Assigning / closing a box - [`Loxer.of()`][loxer.of]:

```typescript
const lox = Loxer.m('BILLING').open('This is the opening log');
Loxer.of(lox).add('this is a single added log');
Loxer.of(lox).error('this is an added error');
Loxer.of(lox).close('this is the closing log');
Loxer.of(lox).add('this log is shown but as error');
```

###### Console output

<!-- ![console_output](/assets/docs_images/8-2.png) -->

![console_output](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/8-2.png)

> - When using `Loxer.of()`, a level and `.module()` do not have to be specified again: `.add()` and `.close()` automatically use the values of the opening log.
> - `Loxer.of(id).warn()` / `.info()` / `.debug()` name a level themselves, and the log reports that level to the output streams and the history.
> - A log's own level decides whether it is written, inside a box as much as outside one. Raising a module to `'warn'` therefore still shows a warning written inside an `'info'` box — the box is gone, but the warning is not. Such a log is written without box membership, drawing no marker of its own, exactly as an assigned error is.
> - `Loxer.of(id).close()` takes no level at all: it is always the opening log's, or a box could be left unclosed.
> - It is not possible to specify a different `.module()`, since **always** the module of the opening log is used!

### The Box Layout

The box layout which is output to the console by default consists of unicode box drawing characters. For this purpose, during the processing of the log, it is determined which row of box symbols belongs to a log. In addition, the box symbols are assigned the colors of the respective modules. The resulting list is then added to the log as a property. This list can then be evaluated.

The renderer's `LoxerOutputRendererOptions.boxLayoutStyle` selects the fallback box layout. A module
may select a separate `boxLayoutStyle`, which takes precedence for every segment belonging to it.

The following is an example of how the box layout is processed internally for the default console output:

###### Rendering the box with a fallback layout:

```typescript
const box = BoxFactory.getBoxString(lox.box, {
  colored: true,
  boxLayoutStyle: 'round',
});
```

`BoxFactory.getBoxString` uses each segment's module layout when it has one and applies
`boxLayoutStyle` only as the fallback. `BoxLayouts` is a collection of Unicode symbols from the
[Box Drawing][pkg.boxDrawing] table. `OutputLoxRenderer` and `ErrorLoxRenderer` pass the same
renderer fallback while producing their template fields.

You are free to set own symbols for the personal output streams. In this case, a box layout must implement the following interface:

###### BoxSymbols

```typescript
export interface BoxSymbols {
  /** the litte (left) arrow at the end of the opening box */
  openEnd: string;
  /** the edge that goes from right to bottom */
  openEdge: string;
  /** a vertical dash `|` used for deeper branches in other box rows */
  vertical: string;
  /** a horizontal dash used for closing lines over empty background AND as the end of single logs / errors */
  horizontal: string;
  /** a rotated T, used to branch single logs / errors from the main stream */
  single: string;
  /** the symbol for overlapping branches */
  cross: string;
  /** the edge that goes from top to right */
  closeEdge: string;
  /** the litte (right) arrow at the end of a closing log */
  closeEnd: string;
}
```

Then you can use it to reference the symbols from your own BoxLayout:

###### Example

```typescript
const myLayout: BoxSymbols = {
  openEnd: '<',
  openEdge: '/',
  vertical: '|',
  horizontal: '-',
  single: '}',
  cross: '+',
  closeEdge: '\\',
  closeEnd: '>',
};

const myBoxString = outputLox.box
  .map((segment) => (segment === 'empty' ? ' ' : myLayout[segment.box]))
  .join('');
```

<!-- ------------------------------------------------------------------------------------------- -->

# Appendix: Migrating from Loxer 2

Everything above describes Loxer 3 on its own terms. This appendix exists only for projects coming
from Loxer 2, and is safe to skip otherwise.

Loxer 2 expressed levels as the numbers `0 | 1 | 2 | 3` (`LevelType` / `LogLevelType`) and attached
them to a log with the `.level()` / `.l()` modifiers. Loxer 3 replaces both with the names in
[5. Levels](#5-levels---loxerwarn--loxerinfo--loxerdebug), and drops the modifiers.

There are no compatibility shims: every `.l()` call and every numeric module literal is a compile
error until it is translated. That is on purpose — a number would keep old code compiling while
quietly changing what it means.

### Module and default levels

| Loxer 2       | Loxer 3                         | why                                                                          |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `devLevel: 0` | `devLevel: 'error'`             | behavior is unchanged: `0` never suppressed errors either                    |
| `devLevel: 1` | `devLevel: 'info'`              | **not** `'warn'` — `log()` writes at `'info'` and has to keep coming through |
| `devLevel: 2` | `devLevel: 'info'` or `'debug'` | choose by whether `debug()` should come through                              |
| `devLevel: 3` | `devLevel: 'debug'`             | everything                                                                   |

The same applies to `prodLevel` and to both members of `defaultLevels`.

TypeScript rejects a number here, so the translation cannot be forgotten. A JavaScript project has
no such gate: a module left holding a number, or any other value that is not one of the four names,
logs up to `'info'` — the same fallback a module that declares no threshold at all gets. It is
neither muted to `'error'` nor opened up to `'debug'`, so an untranslated `0` writes more than the
errors it used to mean. Translate the literal rather than relying on the fallback.

### Logs

| Loxer 2                   | Loxer 3                               | why                                                            |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `Loxer.l(1).log(msg)`     | `Loxer.log(msg)` or `Loxer.info(msg)` |                                                                |
| `Loxer.l(2).log(msg)`     | `Loxer.warn(msg)`                     |                                                                |
| `Loxer.l(3).log(msg)`     | `Loxer.debug(msg)`                    |                                                                |
| `Loxer.l(3).open(msg)`    | `Loxer.debug.open(msg)`               | `Loxer.open(msg)` stays at `'info'`                            |
| `Loxer.l(3).of(id).add()` | `Loxer.of(id).debug()`                | bare `add()` still takes the box's level                       |
| `Loxer.l(n).error(...)`   | `Loxer.error(...)`                    | a level never affected an error; the log now carries `'error'` |

### Types and returns

| Loxer 2                             | Loxer 3                                |
| ----------------------------------- | -------------------------------------- |
| `LevelType`, `LogLevelType`         | [`LogLevel`][loxer.loglevel] for both  |
| `Loxer.getModuleLevel(...)` → `-1`  | → `undefined` for an unknown module id |
| `TraceOptions.level: 1 \| 2 \| 3`   | [`BoxLevel`][loxer.boxlevel]           |
| `'className.functionName'`          | `'parent.functionName'`                |

The last row applies to `openMessage` and `closeMessage` alike. A decorated method reports the same
message it did, since its parent is its class.

### Output integration

| Loxer 2 | Loxer 3 |
| ------- | ------- |
| `callbacks.devLog(lox)` / `callbacks.prodLog(lox)` | `output({ environment, kind: 'log', lox })` |
| `callbacks.devError(error, history)` / `callbacks.prodError(error, history)` | `output({ environment, kind: 'error', lox: error, history })` |
| Console formatting inside a callback | `OutputLoxRenderer(lox, indentation, options)` or `ErrorLoxRenderer(lox, indentation, options)` |
| Render colors and fallback box style in `LoxerConfig` | Pass `LoxerOutputRendererOptions` to the renderer for that destination |

Narrow `event.kind` before reading `history` or error-specific fields. The output stream receives raw
loxes; renderer templates supply plain fields and their ANSI-colored counterparts without changing
the logger state.

### Items

Loxer 2 gave a log one `item` plus a positional `itemOptions`, and rendered the item whenever the
built-in output ran. Loxer 3 replaces both with [props](#rendering-props---loxerprintprops).

| Loxer 2                                   | Loxer 3                                       | why                                                                                       |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Loxer.log(msg, item)`                    | `Loxer.pp().log(msg, item)`                   | attaching data and printing it are separate decisions; without `pp()` the value is data only |
| `Loxer.log(msg, item, options)`           | `Loxer.pp(options).log(msg, item)`            | an object in an argument slot could not be told apart from a value; the chain can          |
| `Loxer.log(msg, a, b)` (b was swallowed)  | `Loxer.log(msg, a, b)`                        | every argument after the message is a prop, so nothing is consumed as configuration        |
| `ItemType`                                | *(gone)*                                      | a prop is `unknown` - every value was already accepted                                    |
| `ItemOptions`                             | [`PropsPrinterOptions`][propsPrinterOptions]  | same fields, except `depth` where an absent option - not `0` - has no configured limit      |
| `lox.item` / `lox.itemOptions`            | `lox.props` / `lox.printProps`                | `props` is always an array; `printProps` is `undefined` where nothing was requested        |
| `Item.of(lox).prettify(...)`              | `PropsPrinter.of(lox).print(...)`             | `PropsPrinter` is exported from `'loxer'`                                                  |
| `argsAsItem` / `resultAsItem`             | `argsAsProps` / `resultAsProps`               | arguments arrive as one prop each; `printArgs` / `printResult` render them                 |
| `namedError(name, msg, existing, item)`   | `error(new NamedError(name, msg, existing), ...props)` | an optional `unknown` in front of a rest parameter silently swallowed the first prop |

A falsy value is rendered like any other where `printProps` asked for it, so a log of `0` or `null`
no longer disappears.

If you use `babel-plugin-loxer-trace`, note that the level methods are linked to their trace box just
like `Loxer.log` is: `Loxer.debug('…')` inside a traced body becomes part of that box.

<!------------------------------------------ REFERENCES ------------------------------------------>

[propsDocs]: https://github.com/pcprinz/loxer/blob/master/documentation/props.md
[api]: https://pcprinz.github.io/loxer/index.html
[pkg.color]: https://www.npmjs.com/package/color
[pkg.crashlytics]: https://firebase.google.com/docs/crashlytics/
[pkg.boxDrawing]: https://unicode-table.com/en/blocks/box-drawing/
[namedError]: https://pcprinz.github.io/loxer/classes/Error.NamedError.html
[outputLox]: https://pcprinz.github.io/loxer/classes/Logs.OutputLox.html
[errorLox]: https://pcprinz.github.io/loxer/classes/Logs.ErrorLox.html
[logs]: https://pcprinz.github.io/loxer/modules/Logs.html
[boxFactory]: https://pcprinz.github.io/loxer/classes/index.BoxFactory.html
[ansiFormat]: https://pcprinz.github.io/loxer/classes/index.ANSIFormat.html
[propsPrinter]: https://pcprinz.github.io/loxer/classes/Formatting.PropsPrinter.html
[loxerOptions]: https://pcprinz.github.io/loxer/interfaces/Loxer.LoxerOptions.html
[loxerConfig]: https://pcprinz.github.io/loxer/interfaces/Loxer.LoxerConfig.html
[loxerModule]: https://pcprinz.github.io/loxer/interfaces/Loxer.Module.html
[loxerModuleRegistry]: https://pcprinz.github.io/loxer/interfaces/index.LoxerModuleRegistry.html
[registeredModules]: https://pcprinz.github.io/loxer/types/Loxer.RegisteredModules.html
[loxer.getmodulelevel]: https://pcprinz.github.io/loxer/interfaces/Loxer.LoxerCore.html#getmodulelevel
[loxerOutputStream]: https://pcprinz.github.io/loxer/types/Loxer.LoxerOutputStream.html
[outputLoxRenderer]: https://pcprinz.github.io/loxer/functions/index.OutputLoxRenderer.html
[errorLoxRenderer]: https://pcprinz.github.io/loxer/functions/index.ErrorLoxRenderer.html
[loxer.init]: https://pcprinz.github.io/loxer/interfaces/Loxer.LoxerCore.html#init
[loxer.log]: https://pcprinz.github.io/loxer/interfaces/Loxer.LogMethods.html#log
[loxer.error]: https://pcprinz.github.io/loxer/interfaces/Loxer.LogMethods.html#error
[loxer.open]: https://pcprinz.github.io/loxer/interfaces/Loxer.LogMethods.html#open
[loxer.of]: https://pcprinz.github.io/loxer/interfaces/Loxer.LogMethods.html#of
[ofLoxes]: https://pcprinz.github.io/loxer/interfaces/Loxer.OfLoxes.html
[loxer.highlight]: https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#highlight
[loxer.loglevel]: https://pcprinz.github.io/loxer/types/index.LogLevel.html
[loxer.boxlevel]: https://pcprinz.github.io/loxer/types/index.BoxLevel.html
[loxer.levelmethods]: https://pcprinz.github.io/loxer/interfaces/Loxer.LevelMethods.html
[loxer.module]: https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#module
[loxer.printprops]: https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#printprops
[propsPrinterOptions]: https://pcprinz.github.io/loxer/interfaces/Formatting.PropsPrinterOptions.html
