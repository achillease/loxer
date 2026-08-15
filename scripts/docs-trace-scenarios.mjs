import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { Loxer, resetLoxer } from '../dist/index.js';
import { transformLoxerTrace } from '../packages/babel-plugin-loxer-trace/dist/transform.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const loxerImport = pathToFileURL(resolve(root, 'dist/index.js')).href;
const traceImport = pathToFileURL(resolve(root, 'dist/trace.js')).href;

export const modules = {
  INVENTORY: { color: '#b29644', fullName: 'Inventory', devLevel: 'debug', prodLevel: 'error' },
  ORDER: { color: '#316217', fullName: 'Order', devLevel: 'debug', prodLevel: 'error' },
  PAYMENT: { color: '#895499', fullName: 'Payment', devLevel: 'debug', prodLevel: 'error' },
};

const source = `
  import { Loxer } from ${JSON.stringify(loxerImport)};
  import { trace } from ${JSON.stringify(traceImport)};

  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  export async function loadOrder(orderId) {
    trace.point.ORDER.info('Reading order from the API');
    await pause(14);
    const order = { id: orderId, itemCount: 3, status: 'pending' };
    trace.point.ORDER.info('Checking order status');
    await pause(9);
    return { ...order, status: 'ready' };
  }

  export async function reserveInventory(orderId) {
    trace.point.INVENTORY.info('Locking three line items', { orderId, itemCount: 3 });
    await pause(11);
    return { reservationId: 'RSV-81', reserved: true };
  }

  export async function authorizePayment(orderId) {
    trace.point.PAYMENT.info('Requesting card authorization', { orderId });
    await pause(18);
    return { authorizationId: 'AUTH-7F', authorized: true };
  }

  export async function submitOrder(orderId) {
    trace.point.ORDER.info('Persisting the submitted order', { orderId });
    await pause(16);
    return { orderId, status: 'submitted' };
  }

  export async function completeCheckout(orderId) {
    trace.point.ORDER.info('Validating checkout request', { orderId });
    const reservation = await reserveInventory(orderId);
    Loxer.m('ORDER').info('Inventory reservation confirmed', reservation);
    const payment = await authorizePayment(orderId);
    trace.point.ORDER.info('Creating fulfilment request', { orderId });
    await pause(7);
    return { orderId, status: 'submitted' };
  }

  export async function calculateShipping(orderId) {
    trace.point.ORDER.info('Loading delivery options');
    await pause(13);
    return { orderId, service: 'express', cost: 12.5, currency: 'EUR' };
  }

  export function renderOrderResult() {
    trace.ORDER.info();
    const result = { orderId: 'A-42', status: 'ready', total: 48.5, currency: 'EUR' };
    Loxer.pp({}).m('ORDER').info('Order result', result);
  }

  trace.ORDER.info(loadOrder);
  trace.INVENTORY.info(reserveInventory);
  trace.PAYMENT.info(authorizePayment);
  trace.ORDER.props('result').info(submitOrder);
  trace.ORDER.info(completeCheckout);
  trace.ORDER.info(calculateShipping);
`;

let scenarioModule;

async function scenarios() {
  if (scenarioModule === undefined) {
    const result = await transformLoxerTrace(source, {
      filename: 'src/checkout/orderWorkflow.js',
      loxerImport,
      sourceMaps: false,
      traceImport,
    });
    if (result?.code === undefined || result.code === null) {
      throw new Error('Could not transform the documentation trace scenarios.');
    }
    scenarioModule = import(
      `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`
    );
  }
  return scenarioModule;
}

export function initializeDocumentationLoxer() {
  Loxer.init({ dev: true, modules, config: { moduleTextSlice: 9 } });
}

export function resetDocumentationLoxer() {
  resetLoxer();
}

export async function runDocumentationScenario(name) {
  const workflow = await scenarios();
  switch (name) {
    case 'load-order':
      return workflow.loadOrder('A-42');
    case 'submit-order':
      return workflow.submitOrder('A-42');
    case 'nested-order':
      return workflow.completeCheckout('A-42');
    case 'props':
      return workflow.renderOrderResult();
    case 'trace-points':
      return workflow.completeCheckout('A-42');
    case 'overlapping-boxes':
      return Promise.all([workflow.completeCheckout('A-42'), workflow.completeCheckout('B-17')]);
    default:
      throw new Error(`Unknown documentation trace scenario: ${name}`);
  }
}
