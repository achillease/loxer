import { vi } from 'vitest';
import {
  parentNameResolver,
  renderCloseMessage,
  renderFailureMessage,
  renderOpenMessage,
  type TraceCall,
  type TraceMessage,
} from '../src/core/TraceMessage';

/** the call every test in this file renders against, unless it needs its own parent or arguments */
function baseCall(resolveParentName: () => string = () => 'Checkout'): TraceCall & {
  args: unknown[];
} {
  return { name: 'calculate', resolveParentName, args: [19.95, 3] };
}

/** the exact substring each span claims, in order - the property the plan's "spans and the message
 * can drift" risk names: a span produced by a stale offset would name the wrong characters, or ones
 * past the end of the text. */
function spanTexts(message: TraceMessage): string[] {
  return message.spans.map((span) => message.text.slice(span.start, span.end));
}

function expectValidSpans(message: TraceMessage): void {
  expect(
    message.spans.every(
      (span) => span.start >= 0 && span.end <= message.text.length && span.end > span.start
    )
  ).toBe(true);
}

describe('span <-> text agreement', () => {
  test.each([
    {
      name: "'fn' open",
      render: () => renderOpenMessage('fn', baseCall()),
      expected: ['calculate'],
    },
    {
      name: "'parent.fn' open",
      render: () => renderOpenMessage('parent.fn', baseCall()),
      expected: ['Checkout', 'calculate'],
    },
    {
      name: "'fn(args)' open",
      render: () => renderOpenMessage('fn(args)', baseCall()),
      expected: ['calculate', '19.95', '3'],
    },
    {
      name: "'fn(types)' open",
      render: () => renderOpenMessage('fn(types)', baseCall()),
      expected: ['calculate', 'number', 'number'],
    },
    {
      name: "'parent.fn(args)' open",
      render: () => renderOpenMessage('parent.fn(args)', baseCall()),
      expected: ['Checkout', 'calculate', '19.95', '3'],
    },
    {
      name: "'fn(result)' close",
      render: () => renderCloseMessage('fn(result)', { ...baseCall(), result: { total: 59.85 } }),
      expected: ['calculate', '{"total":59.85}'],
    },
    {
      name: "'parent.fn(result)' close",
      render: () =>
        renderCloseMessage('parent.fn(result)', { ...baseCall(), result: { total: 59.85 } }),
      expected: ['Checkout', 'calculate', '{"total":59.85}'],
    },
    {
      name: 'a callback composing text around a printer',
      render: () => renderOpenMessage(({ parentFn }) => `retrying ${parentFn(3)}`, baseCall()),
      expected: ['Checkout', 'calculate', '3'],
    },
  ])('$name: every span names exactly the substring it claims', ({ render, expected }) => {
    const message = render();
    expect(spanTexts(message)).toEqual(expected);
    // every span stays inside the text it was cut from
    message.spans.forEach((span) => {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeLessThanOrEqual(message.text.length);
      expect(span.end).toBeGreaterThan(span.start);
    });
  });
});

describe('sanitization before marking', () => {
  test('an argument carrying a raw span sentinel is escaped before it is wrapped, so it cannot forge a span', () => {
    const hostile = 'fake';
    const message = renderOpenMessage('fn(args)', { ...baseCall(), args: [hostile] });

    // two spans - the function's own name, and the escaped argument - never a third one split out
    // of the smuggled sentinel
    expect(message.spans).toHaveLength(2);
    const [nameSpan, valueSpan] = message.spans;
    expect(nameSpan.kind).toBe('fn');
    expect(message.text.slice(nameSpan.start, nameSpan.end)).toBe('calculate');
    expect(valueSpan.kind).toBe('value');
    const rendered = message.text.slice(valueSpan.start, valueSpan.end);
    expect(rendered).toBe('\\u0011fake\\u0012');
    expect(message.text).toBe(`calculate(${rendered})`);
  });

  test('an argument carrying a raw ANSI escape is escaped rather than left able to drive the terminal', () => {
    const hostile = 'red[31mtext';
    const message = renderOpenMessage('fn(args)', { ...baseCall(), args: [hostile] });

    expect(message.text).toBe('calculate(red\\u001b[31mtext)');
    expect(message.text).not.toContain('');
  });

  test('a parent name carrying control characters is escaped the same way an argument is', () => {
    // TraceCall.resolveParentName is always parentNameResolver(source) in real use - the
    // escaping happens inside that wrapper, never in markedQualifiedName itself, so the source is
    // wrapped here the way both runtimes wrap their own source
    const message = renderOpenMessage('parent.fn', {
      ...baseCall(parentNameResolver(() => 'we\u001b[31m\nird')),
    });

    expect(message.text).toBe('we\\u001b[31m\\u000aird.calculate()');
  });
});

describe('the unpaired-marker safety net', () => {
  test('a callback cannot inject raw markers to forge a colored span', () => {
    const message = renderOpenMessage(() => 'before\u0013forged\u0012after', {
      ...baseCall(),
      args: [],
    });

    expect(message.text).toBe('before\\u0013forged\\u0012after');
    expect(message.spans).toEqual([]);
  });

  test('a callback that slices a sentinel off its own printer output colors nothing there, without swallowing the rest of the message', () => {
    const message = renderOpenMessage(({ fn }) => fn(3).slice(1), { ...baseCall(), args: [] });

    expect(message.text).toBe('calculate(3)');
    // the sliced fn-name marker never paired, so no span covers 'calculate' at all - only the
    // still-intact value marker around '3' produced one
    expect(message.spans).toHaveLength(1);
    expect(message.spans[0].kind).toBe('value');
    expect(message.text.slice(message.spans[0].start, message.spans[0].end)).toBe('3');
  });

  test("a callback that slices off a marker's own closer leaves its opener unpaired, coloring nothing there while the rest of the message stays intact", () => {
    const message = renderOpenMessage(
      ({ fn }) => {
        const rendered = fn(3);
        // drop only the value marker's own closer (the character just before the trailing ')'),
        // leaving the value's opener unpaired for the rest of the string - the fn-name marker
        // around 'calculate' stays fully paired
        return rendered.slice(0, -2) + rendered.slice(-1);
      },
      { ...baseCall(), args: [] }
    );

    expect(message.text).toBe('calculate(3)');
    expect(message.spans).toEqual([{ start: 0, end: 9, kind: 'fn' }]);
  });
});

describe('printer content carrying a `$` replacement pattern', () => {
  // `$$`, `$&`, backtick-`$` and `$'` are substituted inside a *replacement string*, even where the
  // pattern being replaced is a plain string. Content is caller data and reaches the printers
  // verbatim, so every one of these has to survive the marker-to-span conversion untouched - one of
  // them would otherwise collapse, splice a slice of the surrounding message in, or spill the
  // renderer's own opaque token into the log.
  test.each([
    { name: 'a doubled dollar', content: '$$' },
    { name: 'the whole-match pattern', content: '$&' },
    { name: 'the before-match pattern', content: '$`' },
    { name: 'the after-match pattern', content: "$'" },
    { name: 'a group reference', content: '$1' },
    { name: 'a dollar pattern amid other text', content: 'a$$b' },
    { name: 'a price', content: '$5.00' },
  ])('$name reaches the message verbatim, colored as one value span', ({ content }) => {
    const message = renderOpenMessage(({ fn }) => `retrying ${fn(content)}`, {
      ...baseCall(),
      args: [],
    });

    expect(message.text).toBe(`retrying calculate(${content})`);
    expect(spanTexts(message)).toEqual(['calculate', content]);
    // the token is built from an id private to the invocation - none of it may reach the message
    expect(message.text).not.toContain(':start');
    expect(message.text).not.toContain(':end');
  });
});

describe('callback cuts through internal tokens', () => {
  // A printer's output carries the renderer's own bookkeeping: private-use delimiters around an
  // internal counter and a random id. A callback may slice that string to any length, so a cut lands
  // mid-id and mid-keyword as readily as between the parts of a token.
  //
  // Stripping an identifiable token remnant from any *prefix* of the marked string can only ever
  // leave a prefix of the plain message. A lone private-use delimiter is deliberately preserved:
  // without any nonce beside it, it is indistinguishable from valid caller content.
  const plain = 'calculate(abcdefgh)';

  test.each([
    {
      name: 'before the printer output',
      cut: (rendered: string) => rendered.indexOf('\uE000'),
      expected: '',
    },
    {
      name: 'inside the function-name opening nonce',
      cut: (rendered: string) => rendered.indexOf(':1:start') - 1,
      expected: '',
    },
    {
      name: 'inside the function name',
      cut: (rendered: string) => rendered.indexOf('calculate') + 5,
      expected: 'calcu',
    },
    {
      name: 'inside the function-name closing nonce',
      cut: (rendered: string) => rendered.indexOf(':1:end') - 1,
      expected: 'calculate',
    },
    {
      name: 'inside the payload text',
      cut: (rendered: string) => rendered.indexOf('abcdefgh') + 3,
      expected: 'calculate(abc',
    },
    {
      name: 'inside the payload closing nonce',
      cut: (rendered: string) => rendered.lastIndexOf(':2:end') - 1,
      expected: 'calculate(abcdefgh',
    },
    {
      name: 'after the complete printer output',
      cut: (rendered: string) => rendered.length,
      expected: plain,
    },
  ])('$name leaves the matching plain-message prefix and valid spans', ({ cut, expected }) => {
    let marked = '';
    const message = renderOpenMessage(
      ({ fn }) => {
        marked = fn('abcdefgh');

        return marked.slice(0, cut(marked));
      },
      { ...baseCall(), args: [] }
    );

    const nonce = marked.slice(1, marked.indexOf(':1:start'));
    expect(message.text).toBe(expected);
    expect(message.text).not.toContain(nonce);
    expectValidSpans(message);
  });

  test.each([
    { name: 'near the start', offset: (nonce: string) => 1 },
    { name: 'at the midpoint', offset: (nonce: string) => Math.floor(nonce.length / 2) },
    { name: 'near the end', offset: (nonce: string) => nonce.length - 1 },
  ])('a left cut $name of the invocation nonce never exposes its suffix', ({ offset }) => {
    const message = renderOpenMessage(
      ({ fn }) => {
        const marked = fn('abcdefgh');
        const nonce = marked.slice(1, marked.indexOf(':1:start'));
        const cut = offset(nonce);

        return marked.slice(1 + cut);
      },
      { ...baseCall(), args: [] }
    );

    expect(message.text).toBe(plain);
    expect(message.text).not.toMatch(/:\d+:(?:start|end)/);
    expect(spanTexts(message)).toEqual(['abcdefgh']);
    expectValidSpans(message);
  });

  test('an ambiguous standalone private-use delimiter is preserved as caller-visible text', () => {
    const message = renderOpenMessage(({ fn }) => fn('abcdefgh').slice(0, 1), {
      ...baseCall(),
      args: [],
    });

    expect(message.text).toBe('\uE000');
    expect(message.spans).toEqual([]);
  });

  test('private-use delimiter characters inside printer content survive verbatim', () => {
    const content = 'left\uE000middle\uE001right';
    const message = renderOpenMessage(({ fn }) => fn(content), { ...baseCall(), args: [] });

    expect(message.text).toBe(`calculate(${content})`);
    expect(spanTexts(message)).toEqual(['calculate', content]);
    expectValidSpans(message);
  });
});

describe('one printer inside another', () => {
  test('the outer region is colored as one, and no delimiter or sentinel survives', () => {
    const message = renderOpenMessage(({ fn, parentFn }) => fn(parentFn('x')), {
      ...baseCall(),
      args: [],
    });

    // the inner call renders first, so the outer prints the whole composed string as its content
    expect(message.text).toBe('calculate(Checkout.calculate(x))');
    expect(message.text).not.toMatch(/[\uE000\uE001]/);
    // the outer name, and the outer payload as one region - `colorMessageSpans` walks spans in order
    // and does not nest them, so the inner parts are not separately colored
    expect(spanTexts(message)).toEqual(['calculate', 'Checkout.calculate(x)']);
  });
});

describe('a printer used more than once in one callback', () => {
  test('every region a printer issued gets its own span, however many there are', () => {
    const message = renderOpenMessage(
      ({ fn }) => Array.from({ length: 50 }, (_, index) => fn(index)).join(', '),
      { ...baseCall(), args: [] }
    );

    // 50 calls, each contributing its own name span and its own value span
    expect(message.spans).toHaveLength(100);
    expect(spanTexts(message).slice(0, 4)).toEqual(['calculate', '0', 'calculate', '1']);
    expect(message.text.startsWith('calculate(0), calculate(1)')).toBe(true);
    expect(message.text).not.toContain(':start');
  });

  test("a callback that repeats a printer's own output colors both copies, since both are text the printer wrote", () => {
    const message = renderOpenMessage(
      ({ fn }) => {
        const rendered = fn('x');

        return `${rendered}|${rendered}`;
      },
      { ...baseCall(), args: [] }
    );

    expect(message.text).toBe('calculate(x)|calculate(x)');
    expect(spanTexts(message)).toEqual(['calculate', 'x', 'calculate', 'x']);
  });

  test("a callback cannot make one printer's delimiters color text that printer never wrote", () => {
    const message = renderOpenMessage(
      // splice foreign text inside the region the printer delimited. 'Q' is uppercase on purpose:
      // the delimiters carry a base-36 id, so a lowercase target could match inside one of them
      // instead of the content and make this test depend on which id the invocation drew
      ({ fn }) => fn('Q').replace('Q', 'Q-and-more'),
      { ...baseCall(), args: [] }
    );

    expect(message.text).toBe('calculate(Q-and-more)');
    // the altered region is no longer what the printer issued, so it contributes no span at all;
    // the untouched name marker still does
    expect(spanTexts(message)).toEqual(['calculate']);
  });
});

describe('the callback safety net', () => {
  test('a throwing openMessage callback falls back to the fn() message', () => {
    const message = renderOpenMessage(() => {
      throw new Error('formatter failed');
    }, baseCall());

    expect(message.text).toBe('calculate()');
  });

  test('a non-string openMessage callback falls back to the fn() message', () => {
    const message = renderOpenMessage((() => 123) as any, baseCall());

    expect(message.text).toBe('calculate()');
  });

  test('a throwing closeMessage callback falls back to the fn done message', () => {
    const message = renderCloseMessage(
      () => {
        throw new Error('formatter failed');
      },
      { ...baseCall(), result: 1 }
    );

    expect(message.text).toBe('calculate done');
  });

  test('a non-string closeMessage callback falls back to the fn done message', () => {
    const message = renderCloseMessage((() => 123) as any, { ...baseCall(), result: 1 });

    expect(message.text).toBe('calculate done');
  });
});

describe('renderFailureMessage keeps the name form its style selected', () => {
  test.each([
    { name: "'fn'", style: 'fn' as const, expected: 'calculate failed' },
    { name: "'parent.fn'", style: 'parent.fn' as const, expected: 'Checkout.calculate failed' },
    { name: "'fn(result)'", style: 'fn(result)' as const, expected: 'calculate failed' },
    {
      name: "'parent.fn(result)'",
      style: 'parent.fn(result)' as const,
      expected: 'Checkout.calculate failed',
    },
  ])('$name renders $expected', ({ style, expected }) => {
    const message = renderFailureMessage(style, baseCall());

    expect(message.text).toBe(expected);
  });

  test('a callback style reports the parent form and is never invoked, having no result to hand it', () => {
    let invoked = false;
    const message = renderFailureMessage(() => {
      invoked = true;

      return 'never reached';
    }, baseCall());

    expect(invoked).toBe(false);
    expect(message.text).toBe('Checkout.calculate failed');
  });

  test('with no parent known, a callback style falls back to the bare name', () => {
    const message = renderFailureMessage(
      () => 'never reached',
      baseCall(() => '')
    );

    expect(message.text).toBe('calculate failed');
  });

  test('a resolveParentName that throws still closes the box, falling back to the bare name', () => {
    const message = renderFailureMessage('parent.fn', {
      name: 'calculate',
      resolveParentName: () => {
        throw new Error('resolution failed');
      },
    });

    expect(message.text).toBe('calculate failed');
  });
});

describe('the Cost criteria: lazy, memoized parent resolution', () => {
  test('parentNameResolver defers its source until first use, then memoizes it', () => {
    const source = vi.fn(() => 'Checkout');
    const resolver = parentNameResolver(source);

    expect(source).not.toHaveBeenCalled();
    expect(resolver()).toBe('Checkout');
    expect(source).toHaveBeenCalledTimes(1);
    expect(resolver()).toBe('Checkout');
    expect(resolver()).toBe('Checkout');
    expect(source).toHaveBeenCalledTimes(1);
  });

  test('a template naming no parent form performs no parent resolution', () => {
    const resolveParentName = vi.fn(() => 'Checkout');

    renderOpenMessage('fn(args)', { name: 'calculate', resolveParentName, args: [1] });
    renderCloseMessage('fn(result)', { name: 'calculate', resolveParentName, result: 1 });
    renderFailureMessage('fn', { name: 'calculate', resolveParentName });

    expect(resolveParentName).not.toHaveBeenCalled();
  });

  test('a callback that receives parentFn but never calls it performs no parent resolution', () => {
    const resolveParentName = vi.fn(() => 'Checkout');

    renderOpenMessage(() => 'ignored', { name: 'calculate', resolveParentName, args: [] });
    renderCloseMessage(() => 'ignored', { name: 'calculate', resolveParentName, result: 1 });

    expect(resolveParentName).not.toHaveBeenCalled();
  });

  test('a parent.fn template on both the open and the close reads a shared memoized resolver exactly once in total', () => {
    const source = vi.fn(() => 'Checkout');
    const call = { name: 'calculate', resolveParentName: parentNameResolver(source) };

    const open = renderOpenMessage('parent.fn', { ...call, args: [] });
    const close = renderCloseMessage('parent.fn', { ...call, result: undefined });

    expect(open.text).toBe('Checkout.calculate()');
    expect(close.text).toBe('Checkout.calculate done');
    expect(source).toHaveBeenCalledTimes(1);
  });

  test('a callback that calls parentFn twice reads the source exactly once', () => {
    const source = vi.fn(() => 'Checkout');
    const call = { name: 'calculate', resolveParentName: parentNameResolver(source) };

    const message = renderOpenMessage(({ parentFn }) => `${parentFn(1)} ${parentFn(2)}`, {
      ...call,
      args: [],
    });

    expect(message.text).toBe('Checkout.calculate(1) Checkout.calculate(2)');
    expect(source).toHaveBeenCalledTimes(1);
  });
});
