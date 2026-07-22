import { Loxer, NamedError } from '../dist/index.js';

Loxer.init({
  dev: true,
  modules: {
    PERS: { color: '#f00', fullName: 'Persons', devLevel: 1, prodLevel: 1 },
    CART: { color: '#00ff00', fullName: 'Shopping cart', devLevel: 1, prodLevel: 1 },
    BILLING: { color: 'rgb(0, 120, 255)', fullName: 'Billing', devLevel: 1, prodLevel: 1 },
  },
});

function logSpace(lines) {
  let nls = '';
  for (let i = 0; i < lines; i++) {
    nls += '\n';
  }
  console.log(nls);
}

function step(message) {
  logSpace(3);
  Loxer.h().log(message);
  logSpace(3);
}

step('2. simple logs');

const person = { name: 'John Doe', age: 69 };
console.log('This is the person:', person);
Loxer.log('This is the person:', person);

step('3. error logs');

Loxer.error('this is a string error');
Loxer.error(404);
Loxer.error(false);
Loxer.error({ type: 'ServerError', code: 404 });
Loxer.error(new RangeError('this is a range error'));

// if using .highlight() of .h() on an error, then the stack ALWAYS will be printed:
Loxer.highlight().error('this is a highlighted error that prints the stack!!!');

step('3.1 NamedError logs');

Loxer.error(new NamedError('CustomError', 'failed hard!'));
Loxer.error(new NamedError('StringError', 'failed hard!', 'string error'));
Loxer.error(new NamedError('NumberError', 'failed hard!', 404));
Loxer.error(new NamedError('BooleanError', 'failed hard!', false));
Loxer.error(new NamedError('ObjectError', 'failed hard!', { type: 'ServerError', code: 404 }));
Loxer.error(new NamedError('ErrorError', 'failed hard!', new TypeError('catched Error')));

step('4 Highlighting');

Loxer.highlight().log('this will be seen easily');
Loxer.h().log('this too');

// conditionally highlight
const shouldHighlight = Math.random() > 0.5;
// the methods accept an optional boolean parameter
Loxer.h(shouldHighlight).log('This message will be conditionally highlighted');

step('6 Modules');

Loxer.module('PERS').log('this log is assigned to the module with the key PERS');
Loxer.m('PERS').log('this too');
Loxer.m('CART').log('this one is assigned to a module with the fullName "Shopping Cart"');
Loxer.m('BILLING').log('this one to "Billing"');
Loxer.m().log('this one is automatically assigned to the module DEFAULT');
Loxer.log('this one is automatically assigned to the module NONE');

step('6.2 Default modules');

Loxer.log('this log is automatically assigned to the module NONE');
Loxer.m().log('this one to the module DEFAULT');
Loxer.m('Wrong').log('this one to the INVALID module');

step('8.1 open Boxes');

logSpace(3);

step('8.2 full Boxes');

const id = Loxer.module().open('this is an opening message');
const id2 = Loxer.module('PERS').open('this is an opening message assigned to a module');
const id3 = Loxer.h().m('CART').open('this one is additionally highlighted');

const lox = Loxer.m('BILLING').open('This is the opening log');
Loxer.of(id).close('');
Loxer.of(lox).add(
  'this is a single added log',
  [
    42,
    {
      abc: '420',
      d: [12, { e: ['apwoijfuwapoij', 'oesifhesoihfesioh', 'seofheoshfosei8h', 123456789] }],
    },
  ],
  { showVerticalLines: true }
);
Loxer.of(id3).close('');
Loxer.of(lox).error('this is an added error');
Loxer.of(lox).close('this is the closing log');
Loxer.of(id2).close('');
Loxer.of(lox).add('this log is shown but as error');

logSpace(3);
