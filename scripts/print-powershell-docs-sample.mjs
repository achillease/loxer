import { Loxer } from '../dist/index.js';
import {
  initializeDocumentationLoxer,
  resetDocumentationLoxer,
  runDocumentationScenario,
} from './docs-trace-scenarios.mjs';

const sampleName = process.argv[2] ?? 'nested-order';
const originalLog = console.log;

console.log = () => {};
initializeDocumentationLoxer();
console.log = (...values) => originalLog(values.map(String).join(' ').replace(/\d{2}:\d{2}:\d{2}/, '12:34:56'));

try {
  if (['load-order', 'submit-order', 'nested-order', 'overlapping-boxes', 'props', 'trace-points'].includes(sampleName)) {
    await runDocumentationScenario(sampleName);
  } else if (sampleName === 'manual-box') {
    const order = Loxer.m('ORDER').info.open('Submit order');
    Loxer.of(order).add('Validated basket');
    Loxer.of(order).warn('Inventory is low');
    Loxer.of(order).error(new Error('Payment failed'));
    Loxer.of(order).close('Order complete');
  } else if (sampleName === 'standalone-logs') {
    Loxer.log('Application ready');
    Loxer.m('ORDER').info('Order accepted', { orderId: 'A-42' });
    Loxer.m('PAYMENT').warn('Provider response is delayed');
    Loxer.m('PAYMENT').debug('Retry scheduled');
  } else {
    throw new Error(`Unknown documentation sample: ${sampleName}`);
  }
} finally {
  console.log = originalLog;
  resetDocumentationLoxer();
}
