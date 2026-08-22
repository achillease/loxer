# Logging, output, and manual flows

The `Loxer` singleton provides standalone records and the module, visibility, prop, box, history,
and output facilities used by automatic traces. Initialize it once in every JavaScript realm that
writes records.

```ts
import { Loxer, type LoxerModules } from 'loxer';

const modules = {
  ORDER: { color: '#73e2a7', fullName: 'Order', devLevel: 'debug', prodLevel: 'warn' },
} satisfies LoxerModules;

Loxer.init({ dev: true, modules });
```

All loaded copies in one realm share the instance through `globalThis`. A worker, iframe, and server
process are separate realms. Records emitted before `init()` wait in a queue: it retains the oldest
1,000 entries and, after five seconds, issues one console warning naming a missing initialization or
multiple loaded copies as likely causes. Use `config.disabled` or `config.disabledInProductionMode`
to disable logging; omitting initialization leaves records queued.

## Logs, levels, and modules

```ts
Loxer.log('Order accepted');       // info level
Loxer.warn('Inventory is low');
Loxer.info('Payment authorized');
Loxer.debug('Gateway response', response);
Loxer.error(new Error('Payment failed'));
```

The default development stream uses the selected module color and reserves warning and error colors
for their levels:

![Default Loxer development output for standalone logs](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/standalone-logs-default.png)

`log()` has the `info` level. `warn`, `info`, and `debug` are level properties whose terminal call
emits a record. `error()` creates an error event on the error stream and includes error context.
Modifiers apply to one operation:

```ts
Loxer.m('ORDER').h().pp({ depth: 2 }).debug('Submitting order', order);
```

A log has one level: `error`, `warn`, `info`, or `debug`. A module logs up to one configured level
per environment. A module at `info` writes error, warn, and info, but hides debug. Its threshold
controls visibility and never rewrites the log level preserved in output and history.

Register modules with `satisfies LoxerModules` and declaration merging for completion and typo
checking:

```ts
export const modules = {
  ORDER: { color: '#73e2a7', fullName: 'Order', devLevel: 'debug', prodLevel: 'warn' },
  PAYMENT: { color: '#e68cff', fullName: 'Payment', devLevel: 'info', prodLevel: 'error' },
} satisfies LoxerModules;

declare module 'loxer' {
  interface LoxerModuleRegistry extends Record<keyof typeof modules, true> {}
}
```

`Loxer.m('ORDER')` and `Loxer.module('ORDER')` select a module. A log without a module uses `NONE`;
an empty `m()` selects `DEFAULT`; an unknown id uses `INVALID`. `Loxer.getModuleLevel(id)` returns
the active threshold or `undefined`. Errors are output when enabled even where the normal box level
would hide a record.

## Props and rendering

Every value after the message is retained in `lox.props`; the message itself is not. Rendering is
opt-in through `pp()` or `printProps()`.

```ts
Loxer.pp({ depth: 2, keys: ['orderId', 'status'] }).m('ORDER').info('Order result', result);
```

The default stream keeps props out of a record until `pp()` selects their rendering. Strings,
numbers, booleans, and indentation all retain their console colors:

![Default Loxer development output with rendered props](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/props-default.png)

`depth` is clamped from 0 through 100; `keys` keeps matching keys and their paths; `indent` selects
0 through 20 spaces; `showVerticalLines`, `printFunction`, and `shortenClasses` shape the output.
Non-finite numeric values use defaults. Recursive rendering has a 100-level safety bound, while box
layout is bounded at 200 levels. Rendering cost follows selected value breadth, so use `depth` or
`keys` for wide data.

Output callbacks always receive original props, whether or not rendering was requested:

```ts
import { PropsPrinter } from 'loxer';

Loxer.init({
  output(event) {
    const props = event.lox.printProps ? PropsPrinter.of(event.lox).print() : '';
    destination.write(event.lox.message + props);
  },
});
```

`PropsPrinter.ofValues(values, options)` renders arbitrary values and `singleLine(value)` creates the
compact message form. Neither rendering nor attached props remove sensitive data.

## Manual boxes and history

Use manual boxes where a build transform cannot reach or when a flow is assembled from explicit
events.

```ts
const box = Loxer.m('ORDER').info.open('Submit order');

Loxer.of(box).add('Validated basket');
Loxer.of(box).warn('Inventory is low');
Loxer.of(box).error(new Error('Payment failed'));
Loxer.of(box).close('Order complete');
```

The default development stream keeps each item connected to its box. This capture uses a 120-column
terminal, leaving room for longer messages without wrapping:

![Default Loxer development output for a manual box](https://raw.githubusercontent.com/pcprinz/loxer/master/assets/docs_images/manual-box-default.png)

`open()` returns an `OpenedLox`; pass it or its numeric id to `of()`. `add()` and `close()` inherit
the opening level. `warn()`, `info()`, and `debug()` use their named levels. `close()` accepts no
level choice. `Loxer.m('PAYMENT').of(box, true)` keeps a currently selected module; otherwise an
assigned log uses the opening box's module.

A box that only marks an entry and an exit can open without reserving a layout column:

```ts
const span = Loxer.m('ORDER').nc().open('Validate basket');

Loxer.of(span).add('Basket totals 149.99');
Loxer.of(span).close('Validated');
```

`nc()`, and its long form `noColumn()`, open a box that opens, closes, and renders its members the
same way; it reserves no column in the box layout, so the boxes around it render the prefix they
would render had it never opened. A box opened inside a column-free box sits at the depth the outer
box never widened. Reach for it where a box's column would add width without adding information —
a short-lived or high-frequency flow. Like `h()` and `m()`, `nc()` is one-shot on the chain that
opens the box, so chaining it twice on one call is a compile error; every later `Loxer.of(id)` call
on that box inherits the selection without repeating it. A level threshold that hides a box wins
over the column setting regardless. `OutputLox.columnFree` carries the setting to a custom `output`
callback, so a destination can render a column-free box its own way without counting box entries.

`Loxer.history` is newest-first and has a default capacity of 50, configurable through
`config.historyCacheSize`. Hidden normal logs do not enter history. An error output event carries a
snapshot of history at the moment it is written.

## Output and data policy

`h()`, and its long form `highlight()`, mark a log by giving its time field a background color:
grey `rgb(70, 70, 70)` by default, overridable through `highlightColor` in `LoxerColorOptions`. The
time field carries the mark because every log has one, whatever else the call chained.

Severity keeps the message and highlighting keeps the time field, so the two compose: a highlighted
warning shows an orange message beside a marked time field, a highlighted close keeps its green, and
a highlighted error keeps its red badge.

The default development console writes an error with `console.error` and an ordinary log with the
console method its level names (`console.warn`, `console.info`, `console.debug`); a row written by a
method that draws no icon carries two leading spaces so every timestamp starts at the same column as
a `warn` or `error` row. On Node, `console.warn` writes to stderr, so an ordinary `warn` row does not
share stdout with `info` and `debug` rows — register an `output` callback when one stream matters.
Chromium hides `console.debug` rows unless the console's Verbose level is enabled, so a `debug` log a
module's threshold admits can remain invisible there.

Pass one `output` callback to receive every visible event. It replaces development console rendering
and is the production integration point; production is silent without it.

```ts
import { ErrorLoxRenderer, Loxer, OutputLoxRenderer, type LoxerOutputEvent } from 'loxer';

Loxer.init({
  output(event: LoxerOutputEvent) {
    if (event.kind === 'error') {
      sendError(event.lox, event.history);
      return;
    }
    sendLog(event.lox);
  },
});
```

`kind: 'log'` carries an `OutputLox`; `kind: 'error'` carries an `ErrorLox` plus history; both carry
an `environment`. The lox values expose id, type, level, module, message, props, box segments,
timestamps, and timing for structured forwarding. `OutputLoxRenderer` and `ErrorLoxRenderer` return
plain and ANSI-colored fields when a destination needs formatted text.

Messages, arguments, results, errors, and props are caller data. Loxer provides no automatic
redaction, masking, allow-listing, or retention policy. Avoid attaching credentials and personal
data; filter events before forwarding; and set retention, access, encryption, and deletion in the
receiving system. `keys` limits rendering only—the original values remain in `lox.props`.

For complete interfaces, open [`LoxerOptions`](https://pcprinz.github.io/loxer/interfaces/Loxer.LoxerOptions.html),
[`LoxerOutputEvent`](https://pcprinz.github.io/loxer/types/Loxer.LoxerOutputEvent.html), and
[`PropsPrinter`](https://pcprinz.github.io/loxer/classes/Formatting.PropsPrinter.html).
