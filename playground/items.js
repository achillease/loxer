import { Loxer } from '../dist/index.js';

Loxer.init({
  dev: true,
  modules: {
    AUTH: { color: '#f00', fullName: 'Authentication', devLevel: 1, prodLevel: 1 },
    CART: { color: '#00ff00', fullName: 'Shopping cart', devLevel: 1, prodLevel: 1 },
    PAY: { color: 'rgb(0, 120, 255)', fullName: 'Payment', devLevel: 1, prodLevel: 1 },
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
Loxer.of(c1).add('payment pending');
const p1 = Loxer.m('PAY').open('restore last order payment');
Loxer.of(p1).error('failed to restore last payment: unable to parse payment!', payment, {
  keys: ['date'],
});
Loxer.of(p1).close('no payment restored');
Loxer.of(c1).close('session restored');

logSpace(3);
