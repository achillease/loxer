import { Loxer, NamedError } from '../dist/index.js';

Loxer.init({ dev: true, defaultLevels: { devLevel: 'info' } });
Loxer.highlight().log('it works!', '...very well');
const lox = Loxer.m().open('look how it starts');
Loxer.of(lox).add('it is beautiful');
Loxer.of(lox).error('even the errors');
Loxer.of(lox).close('until the end');

Loxer.warn('this is a warning');
Loxer.error('this is a string error');
Loxer.error(404);
Loxer.error(false);
Loxer.error({ type: 'ServerError', code: 404 });
Loxer.error(new RangeError('this is a range error'));

// if using .highlight() on an error, then the stack ALWAYS will be printed:
Loxer.highlight().error('this is a highlighted error that prints the stack!!!');

const id = Loxer.m().open('This is the opening log');
Loxer.of(id).add('this is a single added log');
Loxer.of(id).warn('this is a single added warning');
Loxer.of(id).error('this is an added error');
Loxer.of(id).close('this is the closing log');

const existing = new RangeError('some message');
const custom = new NamedError('CustomError', 'this is my custom Error');
const extended = new NamedError(
  'ExtendedError',
  'this is my custom Error that extends another one',
  existing
);
