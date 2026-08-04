import { Loxer, PropsPrinter } from '../dist/index.js';

Loxer.init({
  dev: true,
  modules: {
    AUTH: { color: '#f00', fullName: 'Authentication', devLevel: 'info', prodLevel: 'info' },
    CART: { color: '#00ff00', fullName: 'Shopping cart', devLevel: 'info', prodLevel: 'info' },
    PAY: { color: 'rgb(0, 120, 255)', fullName: 'Payment', devLevel: 'info', prodLevel: 'info' },
  },
});

function logSpace(lines) {
  let nls = '';
  for (let i = 0; i < lines; i++) {
    nls += '\n';
  }
  console.log(nls);
}

// ######################################################################

logSpace(3);

const payment = {
  paymentId: '5e9g156ds1k193n90c',
  date: new Date('2021-11-30T23:35:46.926Z'),
  userId: 'awoih-36846-pehcf-wd',
  articles: [
    {
      articleId: 'p5983165428',
      name: 'Jacket blue',
      price: 99.67,
      currency: 'EURO',
      dealer: {
        dealerId: 'jjj245986',
        name: 'JacketsJacketsJackets',
        isPrivate: false,
      },
    },
    {
      articleId: 'k23595135251',
      name: 'Hat',
      price: 15.99,
      currency: 'USD',
      dealer: {
        dealerId: 'h59205433',
        name: 'Günther Wolfram',
        isPrivate: 'true',
      },
    },
  ],
  paymentAmount: 115.66,
  paymentMethod: 'on_delivery',
};
console.log('payment:', payment);
logSpace(3);
const a1 = Loxer.m('AUTH').open('login');
Loxer.of(a1).add('authenticate user');
const c1 = Loxer.m('CART').open('restore last order session');
Loxer.of(a1).close('login successful');
// props travel with a log whether or not they are rendered — this one carries the payment for a
// callback to pick up, and prints nothing
Loxer.of(c1).add('payment pending', payment);
const p1 = Loxer.m('PAY').open('restore last order payment');
// .pp(...) asks the built-in output to render them, and configures how
Loxer.pp({ keys: ['date'] })
  .of(p1)
  .error('failed to restore last payment: unable to parse payment!', payment);
Loxer.of(p1).close('no payment restored');
Loxer.of(c1).close('session restored');

logSpace(3);

// a freely typed first argument: an object reads as its contents instead of [object Object]
Loxer.m('PAY').log(payment.articles[1]);
// several props render as one block
Loxer.pp({ depth: 1 }).m('CART').log('two props', payment, payment.articles);

logSpace(3);

// the printer is public API, so a callback author renders props on demand
console.log('rendered by hand:' + PropsPrinter.ofValues([payment], { depth: 2 }).print(false));

logSpace(3);
