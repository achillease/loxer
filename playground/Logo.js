import { Loxer } from '../dist/index.js';

Loxer.init({
  dev: true,
  config: {
    moduleTextSlice: 16,
    endTitleOpacity: 0.8,
  },
  modules: {
    OUT: {
      color: '#f00',
      fullName: 'output streams',
      devLevel: 1,
      prodLevel: 1,
      boxLayoutStyle: 'light',
    },
    LOG: { color: '#0f0', fullName: 'set levels', devLevel: 1, prodLevel: 1 },
    SEE: {
      color: '#33f',
      fullName: 'see dataflow',
      devLevel: 1,
      prodLevel: 1,
      boxLayoutStyle: 'heavy',
    },
    TRACE: {
      color: '#ff0',
      fullName: 'trace methods',
      devLevel: 1,
      prodLevel: 1,
      boxLayoutStyle: 'double',
    },
    TIME: {
      color: '#f0f',
      fullName: 'time consumption',
      devLevel: 1,
      prodLevel: 1,
    },
    ERROR: {
      color: '#0ff',
      fullName: 'error handling',
      devLevel: 1,
      prodLevel: 1,
    },
    CAT: {
      color: '#fff',
      fullName: 'log categories',
      devLevel: 1,
      prodLevel: 1,
    },
    BOX: { color: '#fa0', fullName: 'box layout', devLevel: 1, prodLevel: 1 },
  },
});

const logo2 = [
  '                                                         ',
  '   ###          #####    ###   ###  #########  #######   ',
  '  ###         #######    ### ###   ###        ###   ### ',
  '  ###        ###   ###    #####    ###        ###   ### ',
  ' ###        ###   ###     ###     #######    #######   ',
  '###        ###   ###    #####    ###        ### ###   ',
  '#########   #######    ### ###   ###        ###  ###  ',
  '#########    #####    ###   ###  #########  ###   ### ',
  '                                                      ',
  'Logger, Tracer and ... Box?  -->  Loxer!              ',
  '  ... ah yes, and Error detector / dataflow visualizer ',
  '       ... and many other fancy buzz words!              ',
];

const logo = [
  '                                                           ',
  '      _       _____ _    _ _______ ______                  ',
  '    | |     / ___ \\ \\  / (_______(_____ \\                 ',
  '    | |    | |   | \\ \\/ / _____   _____) )                ',
  '   | |    | |   | |)  ( |  ___) (_____ (                 ',
  '  | |____| |___| / /\\ \\| |_____      \\ \\_____|\\            ',
  '  |_______)_____/_/  \\_\\_______)      \\______  )          ',
  '                                             |/           ',
  '  Logger, Tracer and ... Box?  -->  Loxer!              ',
  '   ... ah yes, and Error detector / dataflow visualizer ',
  '       ... and many other fancy buzz words!              ',
  '                                                           ',
];

Loxer.log('\n\n');
const box = Loxer.m('BOX').open(logo[0]);
Loxer.m('LOG').log(logo[1]);
const see = Loxer.m('SEE').open(logo[2]);
Loxer.of(box).add(logo[3]);
const trace = Loxer.m('TRACE').open(logo[4]);
const error = Loxer.m('ERROR').open(logo[5]);
Loxer.m('TIME').log(logo[6]);
Loxer.m('CAT').log(logo[7]);
Loxer.of(see).close(logo[8]);
Loxer.of(error).close(logo[9]);
Loxer.of(trace).close(logo[10]);
Loxer.of(box).close(logo[11]);
Loxer.error('I always do the catchiest slogans');
Loxer.log('\n\n');

const person = { name: 'John Doe', age: 69 };
console.log('This is the person', person);
Loxer.log('This is the person', person);

Loxer.highlight().log('this will be seen easily');
Loxer.h().log('this too');

// conditionally highlight
const shouldHighlight = Math.random() > 0.5;
Loxer.h(shouldHighlight).log('This message will be conditionally highlighted');

Loxer.error('this is a string error');
Loxer.error(404);
Loxer.error(false);
Loxer.error({ type: 'ServerError', code: 404 });
Loxer.error(new RangeError('this is a range error'));

// if using .highlight() on an error, then the stack ALWAYS will be printed:
Loxer.highlight().error('this is a highlighted error that prints the stack!!!');

console.error('this is a string error');
console.error(404);
console.error(false);
console.error({ type: 'ServerError', code: 404 });
console.error(new RangeError('this is a range error'));
