// ---------------------------------------------------------------------------------------------
//  Loxer playground — a near real-life example (no decorators)
// ---------------------------------------------------------------------------------------------
//  Simulates the checkout endpoint of a small web shop. Two HTTP requests are handled
//  *concurrently*, so their log boxes interleave — which is exactly where Loxer's box-style
//  dataflow visualization shines: you can follow one async flow down its own column while the
//  other keeps running next to it.
//
//  Features showcased (all of the public API except the @initLoxer / @trace decorators):
//    - init() with modules (colors, per-module levels, per-module box layout styles) + config
//    - log() / open() / of().add() / of().close() / of().error() / of().namedError() / error()
//    - modifiers: .m()/.module(), .l()/.level(), .h()/.highlight()  (chained in any order)
//    - level-based hiding of verbose logs per module
//    - rich item printing with every ItemOptions field (depth, keys, indent, showVerticalLines,
//      printFunction, shortenClasses)
//    - NamedError (wrapping an underlying error) and plain thrown errors
//    - Loxer.history and Loxer.getModuleLevel(...)
//    - a production phase wiring prodLog / prodError callbacks to a mock monitoring service
//
//  Run it with:  node playground/OrderService.js
// ---------------------------------------------------------------------------------------------

import { Loxer, NamedError, resetLoxer } from '../dist/index.js';

// --- tiny helpers ----------------------------------------------------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min));

function banner(title) {
  const line = '='.repeat(92);
  console.log(`\n\n${line}\n  ${title}\n${line}\n`);
}

// The modules of our "app". Each maps to a subsystem, gets its own color, its own visibility
// levels for dev/prod, and (optionally) its own box layout style.
const MODULES = {
  HTTP: { color: '#00bcd4', fullName: 'http', devLevel: 1, prodLevel: 1, boxLayoutStyle: 'heavy' },
  AUTH: { color: '#ffca28', fullName: 'auth', devLevel: 3, prodLevel: 1 },
  // database traces are noisy — devLevel 2 hides the level-3 "SQL" chatter in development
  DB: { color: '#8e24aa', fullName: 'database', devLevel: 2, prodLevel: 0, boxLayoutStyle: 'light' },
  CART: { color: '#43a047', fullName: 'cart', devLevel: 3, prodLevel: 1, boxLayoutStyle: 'double' },
  PAY: { color: '#e53935', fullName: 'payment', devLevel: 3, prodLevel: 1 },
  SHIP: { color: '#1e88e5', fullName: 'shipping', devLevel: 3, prodLevel: 1 },
};

// A domain class — used to show `shortenClasses` in item printing.
class Money {
  constructor(amount, currency) {
    this.amount = amount;
    this.currency = currency;
  }
  toString() {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }
}

// A fake data layer. Two demo users, one of whom will trip the payment processor.
const USERS = {
  'usr_1001': { id: 'usr_1001', name: 'Ada Lovelace', token: 'valid-token', tier: 'gold' },
  'usr_2002': { id: 'usr_2002', name: 'Alan Turing', token: 'valid-token', tier: 'standard' },
};

// =============================================================================================
//  Domain operations. Each opens its own box (so concurrent requests overlap visually) and is
//  handed the surrounding HTTP box so it can drop a breadcrumb into the request timeline.
// =============================================================================================

async function authenticate(userId, token, httpBox) {
  Loxer.of(httpBox).add('→ authenticate');
  const box = Loxer.m('AUTH').open(`verify bearer token for ${userId}`);
  await delay(jitter(15, 45));

  const user = USERS[userId];
  if (!user || user.token !== token) {
    // .namedError() is the shortcut for .error(new NamedError(...)) directly on the box
    Loxer.of(box).namedError('AuthError', `rejected token for ${userId}`);
    Loxer.of(box).close('401 unauthorized');
    throw new NamedError('AuthError', 'authentication failed');
  }

  // level-2 detail: visible in dev (AUTH devLevel is 3) but useful to keep out of the hot path.
  // Modifiers (.l/.h/.m) come *before* .of() — .of() itself only returns add/close/error.
  Loxer.l(2).of(box).add('claims resolved', { sub: user.id, tier: user.tier, scope: ['checkout'] });
  Loxer.of(box).close(`authenticated ${user.name}`);
  return user;
}

async function loadCart(user, httpBox) {
  Loxer.of(httpBox).add('→ load cart');
  const box = Loxer.m('CART').open(`restore cart for ${user.name}`);

  // A level-3 "SQL" trace assigned to DB (devLevel 2) — intentionally hidden in dev to prove
  // that leveling works. Bump DB's devLevel to 3 in MODULES and it reappears.
  Loxer.m('DB').l(3).log(`SELECT * FROM carts WHERE user_id = '${user.id}'`);
  await delay(jitter(20, 60));

  const cart = {
    cartId: 'crt_' + user.id.slice(-4),
    owner: { id: user.id, name: user.name, tier: user.tier },
    items: [
      { sku: 'BK-0007', title: 'The Annotated Turing', qty: 1, price: new Money(38.5, 'EUR') },
      { sku: 'HW-2113', title: 'Mechanical Keyboard', qty: 2, price: new Money(89.0, 'EUR') },
    ],
    meta: { createdVia: 'web', session: { device: 'desktop', ab: { variant: 'B', bucket: 42 } } },
  };

  // Show the full cart, but stop descending after 2 levels so the nested session/ab object is
  // summarized instead of fully expanded.
  Loxer.of(box).add('cart restored', cart, { depth: 2 });
  Loxer.of(box).close(`${cart.items.length} line items`);
  return cart;
}

async function reserveInventory(cart, httpBox) {
  Loxer.of(httpBox).add('→ reserve inventory');
  const box = Loxer.m('DB').open('reserve stock');
  await delay(jitter(25, 70));

  for (const item of cart.items) {
    Loxer.l(2).of(box).add(`reserve ${item.qty}× ${item.sku}`);
  }
  Loxer.of(box).close('inventory reserved');
}

async function charge(user, cart, payment, httpBox) {
  Loxer.of(httpBox).add('→ charge payment');
  const box = Loxer.m('PAY').open(`authorize ${payment.method} for ${user.name}`);
  await delay(jitter(30, 90));

  const total = cart.items.reduce((sum, i) => sum + i.price.amount * i.qty, 0);

  // The gateway declines this particular card. We wrap the low-level gateway error in a
  // NamedError and attach the payment as a filtered item (only the keys we want in the log).
  if (payment.card === '4000-0000-0000-0002') {
    const gatewayError = new RangeError('gateway response 402: insufficient_funds');
    Loxer.of(box).namedError(
      'PaymentDeclined',
      `card declined for ${user.name}`,
      gatewayError,
      { total, currency: 'EUR', method: payment.method, card: payment.card, cvcOk: true },
      { keys: ['total', 'currency', 'method'] } // secrets like `card`/`cvcOk` are filtered out
    );
    Loxer.of(box).close('payment declined');
    throw new NamedError('PaymentDeclined', 'payment could not be captured', gatewayError);
  }

  const receipt = {
    orderId: 'ord_' + jitter(10000, 99999),
    charged: new Money(total, 'EUR'),
    method: payment.method,
    // a function value — printed as its full source because of printFunction: true below
    computeTax: (net) => net * 0.19,
  };
  Loxer.of(box).add('captured', receipt, { printFunction: true });
  Loxer.of(box).close(`charged ${receipt.charged}`);
  return receipt;
}

async function createShipment(user, cart, receipt, httpBox) {
  Loxer.of(httpBox).add('→ create shipment');
  const box = Loxer.m('SHIP').open(`schedule delivery for ${receipt.orderId}`);
  await delay(jitter(20, 55));

  const label = {
    tracking: 'TRK-' + jitter(100000, 999999),
    carrier: user.tier === 'gold' ? 'express' : 'standard',
    address: { city: 'London', country: 'UK' },
  };
  // showVerticalLines + a wider indent to make the nested address easy to scan
  Loxer.of(box).add('label printed', label, { showVerticalLines: true, indent: 4 });
  Loxer.of(box).close(`shipping via ${label.carrier}`);
  return label;
}

// =============================================================================================
//  The request handler — one boxed HTTP timeline per request, highlighted so it stands out.
// =============================================================================================

async function handleCheckout(req) {
  const http = Loxer.h().m('HTTP').open(`POST /checkout  (user=${req.userId})`);
  try {
    const user = await authenticate(req.userId, req.token, http);
    const cart = await loadCart(user, http);
    await reserveInventory(cart, http);
    const receipt = await charge(user, cart, req.payment, http);
    const label = await createShipment(user, cart, receipt, http);
    Loxer.of(http).close(`200 OK — order ${receipt.orderId} placed`);
    return { status: 200, orderId: receipt.orderId, tracking: label.tracking };
  } catch (err) {
    // The error is appended to the still-open HTTP box, then the box is closed with a 5xx.
    Loxer.of(http).error(err);
    Loxer.of(http).close('502 checkout failed');
    return { status: 502, error: err.message };
  }
}

// =============================================================================================
//  Phase 1 — DEVELOPMENT: no callbacks, so Loxer renders its pretty boxed output to the console.
// =============================================================================================

async function developmentPhase() {
  Loxer.init({
    dev: true,
    modules: MODULES,
    config: {
      moduleTextSlice: 10, // room for "database" / "shipping"
      endTitleOpacity: 0.6, // fade the module name back in on the closing log
      highlightColor: '#2b2b2b', // background used by .h()/.highlight()
      historyCacheSize: 100,
    },
  });

  banner('PHASE 1 — development mode (built-in console rendering)');

  // A couple of standalone logs before the traffic starts.
  Loxer.log('server listening on :3000');
  Loxer.highlight().m('HTTP').log('accepting connections');

  // Two requests handled concurrently — watch the AUTH/CART/PAY/SHIP boxes interleave.
  const [ok, declined] = await Promise.all([
    handleCheckout({
      userId: 'usr_1001',
      token: 'valid-token',
      payment: { method: 'credit_card', card: '4242-4242-4242-4242' },
    }),
    handleCheckout({
      userId: 'usr_2002',
      token: 'valid-token',
      payment: { method: 'credit_card', card: '4000-0000-0000-0002' }, // will be declined
    }),
  ]);

  await delay(50);

  // A request that never even authenticates.
  const unauth = await handleCheckout({ userId: 'usr_9999', token: 'nope', payment: {} });

  banner('PHASE 1 — results & introspection');
  Loxer.log('request outcomes', [ok, declined, unauth]);

  // getModuleLevel reflects the *active* environment (dev here).
  Loxer.log(
    'active dev levels',
    { HTTP: Loxer.getModuleLevel('HTTP'), DB: Loxer.getModuleLevel('DB'), unknown: Loxer.getModuleLevel('NOPE') },
    { showVerticalLines: false }
  );

  // The history is newest-first. Show a compact projection of the last handful of entries.
  const recent = Loxer.history.slice(0, 6).map((lox) => ({
    type: lox.type,
    module: lox.moduleText || '—',
    message: lox.message,
  }));
  Loxer.highlight().log(`history holds ${Loxer.history.length} entries — most recent:`, recent);

  // Demonstrate shortenClasses:false — expand the Money class instance instead of "[Class: Money]".
  Loxer.m('PAY').log('an explicit Money instance', new Money(129.99, 'EUR'), {
    shortenClasses: false,
  });
}

// =============================================================================================
//  Phase 2 — PRODUCTION: register callbacks. Loxer no longer prints; instead it streams raw
//  OutputLox / ErrorLox objects to *us*, which is how you'd forward to a real monitoring backend.
// =============================================================================================

async function productionPhase() {
  resetLoxer(); // fresh singleton, as a new process would have

  // A stand-in for Sentry / Datadog / a log pipeline.
  const monitoring = { logs: [], errors: [] };

  Loxer.init({
    dev: false,
    modules: MODULES,
    defaultLevels: { devLevel: 1, prodLevel: 1 },
    config: { historyCacheSize: 25 },
    callbacks: {
      // Only prod streams are wired; devLog/devError stay unset (dev keeps the console fallback).
      prodLog(log) {
        monitoring.logs.push({
          module: log.moduleText || 'none',
          type: log.type,
          message: log.message,
          ms: log.timeConsumption, // populated on .close()/.add() relative to .open()
        });
      },
      prodError(errorLog, history) {
        monitoring.errors.push({
          name: errorLog.error.name,
          message: errorLog.error.message,
          module: errorLog.moduleText || 'none',
          // boxes that were still open when the error fired — great for incident context
          openBoxes: errorLog.openLoxes.map((l) => l.message),
          historyDepth: history.length,
        });
      },
    },
  });

  banner('PHASE 2 — production mode (callbacks → mock monitoring service)');
  console.log('(Loxer prints nothing itself now — everything flows through the callbacks.)\n');

  await Promise.all([
    handleCheckout({
      userId: 'usr_1001',
      token: 'valid-token',
      payment: { method: 'credit_card', card: '4242-4242-4242-4242' },
    }),
    handleCheckout({
      userId: 'usr_2002',
      token: 'valid-token',
      payment: { method: 'credit_card', card: '4000-0000-0000-0002' },
    }),
  ]);

  console.log(`monitoring captured ${monitoring.logs.length} logs and ${monitoring.errors.length} error(s):\n`);
  console.log('errors →', JSON.stringify(monitoring.errors, null, 2));
  console.log('\nsample logs →', JSON.stringify(monitoring.logs.slice(0, 5), null, 2));
}

// --- run both phases ------------------------------------------------------------------------

(async () => {
  await developmentPhase();
  await productionPhase();
  banner('done');
})();
