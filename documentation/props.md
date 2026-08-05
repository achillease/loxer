# Props

A common use case for the console is inspecting objects and variables that are processed
dynamically at runtime. There is no comparison to debugging an application, because inspecting the
code on-time preserves the asynchronous behavior. Every Loxer logging method takes the values to
inspect as its **props** — the arguments after the message:

```typescript
Loxer.log('restoring order', payment, cart);
```

Props are data. They travel with the log to the `output` stream and into `Loxer.history` exactly as
they were passed — by reference, not cloned, not
stringified. They are rendered to the console only when the call asks for it, by chaining
[`Loxer.printProps(...)`](https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#printprops)
(or its short alias `pp`):

```typescript
Loxer.pp().log('restoring order', payment);
```

Because attaching props costs nothing that is visible, a value can travel with every log that has
one, and rendering is a per-call decision.

## Example

There is a shopping app that lets users buy articles in a store. The app can restore a shopping
session a user did not complete last time, and the developer has integrated Loxer to log the
processes involved. The output looks as follows:

```
Authenti: ╭← login
Authenti: ├─ authenticate user                                            [0ms]
Shopping: │╭← restore last order session
Authenti: ╰┆→ login successful                                            [1ms]
Shopping:  ├─ payment pending                                             [0ms]
Payment:   │╭← restore last order payment
Payment:   │├─ failed to restore last payment: unable to parse payment!    [0ms]
Payment:   │╰→ no payment restored                                        [0ms]
Shopping:  ╰→ session restored                                            [0ms]
```

Restoring the previous order payment failed, because the restored payment could not be parsed. The
error that is thrown is caught and logged with

```typescript
Loxer.of(lox).error('failed to restore last payment: unable to parse payment!');
```

The message does not say *why* the parsing failed, so the potentially faulty object belongs on the
log. For comparison, this is what `console.log('payment:', payment)` prints:

```
payment: {
  paymentId: '5e9g156ds1k193n90c',
  date: 2021-11-30T23:35:46.926Z,
  userId: 'awoih-36846-pehcf-wd',
  articles: [
    {
      articleId: 'p5983165428',
      name: 'Jacket blue',
      price: 99.67,
      currency: 'EURO',
      dealer: [Object]
    },
    ...
  ],
  paymentAmount: 115.66,
  paymentMethod: 'on_delivery'
}
```

This artificial object looks fine at first sight, but on closer inspection not the entire content is
shown: each `dealer` has been shortened to `[Object]`.

### Attaching a prop

Pass `payment` after the message and it rides along on the log:

```typescript
Loxer.of(lox).error('failed to restore last payment: unable to parse payment!', payment);
```

The output is unchanged — the same nine lines as above. `payment` is on the log all the same:
an `output` handler reads it at `event.lox.props[0]`, and it is in `Loxer.history`. Nothing is
printed, because the call did not ask for printing.

### Rendering it

Chain `printProps()` — or `pp()` — and the built-in output renders the block beneath the message,
branching off that log's own box column:

```typescript
Loxer.pp().of(lox).error('failed to restore last payment: unable to parse payment!', payment);
```

```
Payment:   │├─ failed to restore last payment: unable to parse payment!    [1ms]
┌───────────┘ props>
{
┊ paymentId: '5e9g156ds1k193n90c',
┊ date: 2021-11-30T23:35:46.926Z,
┊ userId: 'awoih-36846-pehcf-wd',
┊ articles: [
┊ ┊ {
┊ ┊ ┊ articleId: 'p5983165428',
┊ ┊ ┊ name: 'Jacket blue',
┊ ┊ ┊ price: 99.67,
┊ ┊ ┊ currency: 'EURO',
┊ ┊ ┊ dealer: {
┊ ┊ ┊ ┊ dealerId: 'jjj245986',
┊ ┊ ┊ ┊ name: 'JacketsJacketsJackets',
┊ ┊ ┊ ┊ isPrivate: false
┊ ┊ ┊ }
┊ ┊ },
┊ ┊ {
┊ ┊ ┊ articleId: 'k23595135251',
┊ ┊ ┊ name: 'Hat',
┊ ┊ ┊ price: 15.99,
┊ ┊ ┊ currency: 'USD',
┊ ┊ ┊ dealer: { dealerId: 'h59205433', name: 'Günther Wolfram', isPrivate: 'true' }
┊ ┊ }
┊ ],
┊ paymentAmount: 115.66,
┊ paymentMethod: 'on_delivery'
}
└───────────┐ <props
Payment:   │╰→ no payment restored                                        [2ms]
```

The block is seamlessly integrated into the box layout of the surrounding logs. Two other
peculiarities:

- the content of each `dealer` is fully displayed until the renderer's 100-level safety limit
- indent indicator lines make the nesting easy to follow

A closer look suggests the error is in the `isPrivate` attribute of a `dealer` object.

`printProps()` is a request, and its argument is only configuration. `Loxer.pp()` and `Loxer.pp({})`
render identically, and a prop is rendered whatever its truthiness — `null`, `0`, `false` and `''`
included. A call that asks for rendering but carries no props renders no block.

Like [`highlight`](https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#highlight) and
[`module`](https://pcprinz.github.io/loxer/interfaces/Loxer.Modifiers.html#module), it is a one-shot
modifier: it applies to the one log at the end of the chain, composes with the others in any order,
and cannot be chained twice.

```typescript
Loxer.pp({ depth: 1 }).m('PAY').h().log('restoring order', payment); // ✔ any order
Loxer.h().m('PAY').printProps().log('restoring order', payment);     // ✔ the same log
Loxer.pp().pp().log('restoring order', payment);                     // ✘ compile error
```

### Bounding the depth

[`PropsPrinterOptions`](https://pcprinz.github.io/loxer/interfaces/Formatting.PropsPrinterOptions.html)
is the configuration `printProps` accepts. `depth` says at which nesting level objects and arrays are
summarized as their type and length instead of being descended into. Left out, the depth has no
configured limit; a safety limit of 100 prevents a pathological value graph from exhausting the call
stack. A finite number is truncated and clamped to the range from `0` through that limit; a
non-finite value uses the default.
Nested indentation defaults to two spaces and is capped at 20 spaces per level.

```typescript
Loxer.pp({ depth: 1 })
  .of(lox)
  .error('failed to restore last payment: unable to parse payment!', payment);
```

```
Payment:   │├─ failed to restore last payment: unable to parse payment!    [0ms]
┌───────────┘ props>
{
┊ paymentId: '5e9g156ds1k193n90c',
┊ date: 2021-11-30T23:35:46.926Z,
┊ userId: 'awoih-36846-pehcf-wd',
┊ articles: [2 elements],
┊ paymentAmount: 115.66,
┊ paymentMethod: 'on_delivery'
}
└───────────┐ <props
```

Similar to the `console`, arrays and objects are grouped together — with the length of the content
given as well. The `console` is limited to a depth of 3, while props have no configured limit and a
100-level safety limit. For objects with deeply nested large arrays, restricting the depth can have a
beneficial effect on readability.

### Filtering by key

The other way to restrict the search area in a large object is `keys: string[]`: the props are
filtered to those keys, which makes large lists of large objects examinable.

Do that for the `isPrivate` key of the `payment`, plus `dealerId` to identify the erroneous record:

```typescript
Loxer.pp({ keys: ['isPrivate', 'dealerId'] })
  .of(lox)
  .error('failed to restore last payment: unable to parse payment!', payment);
```

```
Payment:   │├─ failed to restore last payment: unable to parse payment!    [0ms]
┌───────────┘ props>
{
┊ articles: [
┊ ┊ {
┊ ┊ ┊ dealer: { dealerId: 'jjj245986', isPrivate: false, +(1 entries) },
┊ ┊ ┊ +(4 entries)
┊ ┊ },
┊ ┊ {
┊ ┊ ┊ dealer: { dealerId: 'h59205433', isPrivate: 'true', +(1 entries) },
┊ ┊ ┊ +(4 entries)
┊ ┊ }
┊ ],
┊ +(5 entries)
}
└───────────┐ <props
```

Every irrelevant key is omitted; what remains is the relevant keys and the path leading to them.
Each object that had keys left out is supplemented with the number of omitted entries, and the
matched keys are highlighted. Here `isPrivate: 'true'` — a string where the sibling record holds a
boolean — is the faulty data.

### Several props

Every argument after the message is a prop of its own, in order, and they render as one block —
listed like the elements of an array, without its brackets.

```typescript
Loxer.pp().m('CART').log('restoring order', dealer, 3, 'on_delivery');
```

```
Shopping: ─ restoring order
┌─────────┘ props>
{
┊ dealerId: 'jjj245986',
┊ name: 'JacketsJacketsJackets',
┊ isPrivate: false
},
3,
'on_delivery'
└─────────┐ <props
```

Passing three props rather than one array of three costs nothing at the output and gains a callback
`lox.props[1]` instead of `lox.props[0][1]`.

## The message is freely typed too

The first argument of a logging method is the message, and it may be of any type. `lox.message` is
always a `string`: a primitive is stringified, and an object or a function renders as one compact
line, so a value can *be* the whole log.

```typescript
Loxer.m('PAY').log(dealer);
```

```
Payment:  ─ { dealerId: 'h59205433', name: 'Günther Wolfram', isPrivate: 'true' }
```

- a function reports `[Function: name]`, never its source text
- a `symbol` reports its `String()` form
- the line is guaranteed: control characters are escaped, so no message can break the box column
- `Loxer.log()` and `Loxer.log(undefined)` both produce an empty message
- the message is never also a prop

A message stays a message: a non-primitive is rendered as one compact line, never captured as props,
and `PropsPrinterOptions` does not apply to it. Use props for the values worth inspecting.

## Rendering props from an output stream

Registering `output` replaces the built-in console rendering. It receives a discriminated event with
the raw [`OutputLox`](https://pcprinz.github.io/loxer/classes/Logs.OutputLox.html) or
[`ErrorLox`](https://pcprinz.github.io/loxer/classes/Logs.ErrorLox.html), never rendered text. Both
lox types carry the props themselves, along with the rendering the call asked for:

```typescript
props: unknown[];                               // the values, by reference
printProps: PropsPrinterOptions | undefined;    // undefined = the call asked for no rendering
```

Forwarding structured data to a monitoring backend needs nothing but `lox.props`. To render the same
block the built-in output produces, use
[`PropsPrinter`](https://pcprinz.github.io/loxer/classes/Formatting.PropsPrinter.html):

```typescript
import { Loxer, OutputLoxRenderer, type LoxerOutputEvent } from 'loxer';

Loxer.init({
  output(event: LoxerOutputEvent) {
    if (event.kind === 'error') return;

    const rendered = OutputLoxRenderer(event.lox, 21 + event.lox.module.slicedName.length);
    console.log(rendered.message + rendered.props);
  },
});
```

`PropsPrinter` has three static entries and one chainable method:

- `of(lox)` — a printer for any `OutputLox` / `ErrorLox`, configured from that log's own
  `printProps`. Reading `lox.printProps` yourself is what honors the call's request; an output
  handler is
  free to ignore it and render unconditionally instead.
- `ofValues(values, options?)` — a printer for values that belong to no log.
- `singleLine(value)` — one value on exactly one line, whatever its size. This is how a
  non-primitive message is rendered.
- `print(colored?, box?)` — returns the rendered string. `colored` decides whether it carries ANSI
  color; `box` surrounds it with the connecting layout and takes a vertical `depth` and a `color`.
  A printer with no values returns the empty string.

## Implementation and impact on performance

Processing large objects dynamically costs resources and time at runtime, so logging large objects in
production mode is generally not advisable. Props themselves are cheap: they are collected into an
array and handed on untouched. Rendering is what costs, and it happens in the output stream — for the
built-in console output only where a call chained `printProps`, and in an output handler only where
the handler asks for it. Rendering remains proportional to the selected values' breadth; use `depth` or
`keys` to bound a wide value before printing it.

Props are never redacted automatically. Do not attach secrets, credentials, or personal data unless
the receiving output handler applies the handling policy required by its destination.

Use `resultAsProps` with `printResult` when a trace result needs a multi-line block.
