import { BoxFactory, BoxLayouts, Loxer } from 'loxer';
import { loxed } from 'loxer/trace';
import './style.css';

type CallbackBox = Parameters<typeof BoxFactory.getBoxString>[0];

type TraceRecord = {
  box: CallbackBox;
  id: number;
  kind: 'error' | 'log';
  message: string;
  moduleColor: string;
  moduleId: string;
  time: string;
  type: string;
};

type CallbackLox = {
  box: CallbackBox;
  id: number;
  message: string;
  module: {
    color: string;
  };
  moduleId: string;
  timeText: string;
  type: string;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Demo root element was not found.');
}

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <p class="eyebrow">Vite + Babel 8 + Loxer</p>
      <h1>Plain-function trace demo</h1>
      <p class="intro">
        Each action below calls a normal TypeScript function marked with
        <code>loxed(functionName, options)</code>. The panel shows the real Loxer callbacks.
      </p>
    </header>

    <section class="controls" aria-label="Demo actions">
      <button id="sync-demo" type="button">
        <span>01</span>
        Run sync trace
      </button>
      <button id="failure-demo" type="button">
        <span>02</span>
        Run failed async trace
      </button>
      <button id="overlap-demo" type="button">
        <span>03</span>
        Run overlapping traces
      </button>
      <button id="clear-output" class="secondary" type="button">Clear output</button>
    </section>

    <section class="status-card" aria-live="polite">
      <span class="status-dot"></span>
      <p id="status">Ready. Choose a trace scenario.</p>
    </section>

    <section class="output-card">
      <div class="output-heading">
        <div>
          <p class="eyebrow">Callback stream</p>
          <h2>Trace records</h2>
        </div>
        <code>import { loxed } from 'loxer/trace'</code>
      </div>
      <ol id="trace-output" class="trace-output"></ol>
      <p id="empty-output" class="empty-output">No trace records yet.</p>
    </section>
  </main>
`;

const output = getElement<HTMLOListElement>('trace-output');
const emptyOutput = getElement<HTMLParagraphElement>('empty-output');
const status = getElement<HTMLParagraphElement>('status');
const maximumRecords = 200;
const records: TraceRecord[] = [];

Loxer.init({
  dev: true,
  modules: {
    CALC: {
      color: '#ffc857',
      devLevel: 3,
      fullName: 'Calculation',
      prodLevel: 0,
    },
    INVENTORY: {
      color: '#59bfff',
      devLevel: 3,
      fullName: 'Inventory',
      prodLevel: 0,
    },
    ORDER: {
      color: '#73e2a7',
      devLevel: 3,
      fullName: 'Order',
      prodLevel: 0,
    },
    PAYMENT: {
      color: '#e68cff',
      devLevel: 3,
      fullName: 'Payment',
      prodLevel: 0,
    },
  },
  config: {
    boxLayoutStyle: 'round',
    disableColors: true,
  },
  callbacks: {
    devError: (lox) => record('error', lox),
    devLog: (lox) => record('log', lox),
  },
});

function calculateTotal(unitPrice: number, quantity: number): number {
  Loxer.log('Validating basket', { quantity, unitPrice });
  const total = unitPrice * quantity;
  Loxer.h().l(2).log('Basket total calculated', total);

  return total;
}

loxed(calculateTotal, {
  argsAsItem: true,
  closeMessage: (result) => `calculateTotal done. returns: ${result.toFixed(2)}`,
  highlight: 'close',
  moduleId: 'CALC',
  openMessage: 'args',
  resultAsItem: true,
});

async function reserveInventory(orderId: number, delay: number): Promise<number> {
  Loxer.log(`Reserving inventory for order ${orderId}`);
  await wait(delay);
  Loxer.l(2).log(`Inventory reserved for order ${orderId}`);

  return orderId;
}

loxed(reserveInventory, {
  moduleId: 'INVENTORY',
  openMessage: ([orderId]) => `reserveInventory(${orderId})`,
});

async function chargePayment(orderId: number): Promise<number> {
  Loxer.log(`Authorizing payment for order ${orderId}`);
  await wait(140);

  if (orderId === 13) {
    throw new Error('Payment provider rejected order 13');
  }

  Loxer.l(2).log(`Payment approved for order ${orderId}`);

  return orderId;
}

loxed(chargePayment, {
  moduleId: 'PAYMENT',
  openMessage: ([orderId]) => `chargePayment(${orderId})`,
});

async function submitOrder(orderId: number, delay: number): Promise<{ orderId: number }> {
  Loxer.log(`Starting order workflow ${orderId}`);
  await reserveInventory(orderId, delay);
  await chargePayment(orderId);
  Loxer.l(2).log(`Order ${orderId} is ready to submit`);

  return { orderId };
}

loxed(submitOrder, {
  closeMessage: ({ orderId }) => `Order ${orderId} submitted`,
  moduleId: 'ORDER',
  openMessage: ([orderId]) => `submitOrder(${orderId})`,
  resultAsItem: true,
});

getElement<HTMLButtonElement>('sync-demo').addEventListener('click', () => {
  const total = calculateTotal(19.95, 3);
  setStatus(`Sync result preserved: ${total.toFixed(2)}`);
});

getElement<HTMLButtonElement>('failure-demo').addEventListener('click', async () => {
  setStatus('Running the rejected async invocation…');

  try {
    await submitOrder(13, 350);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Original rejection preserved: ${message}`);
  }
});

getElement<HTMLButtonElement>('overlap-demo').addEventListener('click', async () => {
  setStatus('Running two overlapping invocations with different delays…');
  const results = await Promise.all([submitOrder(101, 650), submitOrder(102, 250)]);
  setStatus(`Both invocations completed: ${results.map(({ orderId }) => orderId).join(', ')}`);
});

getElement<HTMLButtonElement>('clear-output').addEventListener('click', () => {
  records.length = 0;
  output.replaceChildren();
  emptyOutput.hidden = false;
  setStatus('Output cleared.');
});

function record(kind: TraceRecord['kind'], lox: CallbackLox): void {
  records.push({
    box: [...lox.box],
    id: lox.id,
    kind,
    message: lox.message,
    moduleColor: lox.module.color,
    moduleId: lox.moduleId,
    time: lox.timeText,
    type: lox.type,
  });
  if (records.length > maximumRecords) {
    records.shift();
    output.firstElementChild?.remove();
  }
  renderRecords();
}

function renderRecords(): void {
  output.append(
    ...records.slice(-1).map((entry) => {
      const item = document.createElement('li');
      item.className = `trace-record trace-record--${entry.kind}`;

      const metadata = document.createElement('span');
      metadata.className = 'trace-meta';

      const module = document.createElement('span');
      module.className = 'trace-module';
      module.style.color = entry.moduleColor;
      module.textContent = entry.moduleId;

      metadata.append(
        module,
        document.createTextNode(
          ` · #${entry.id} · ${entry.type}${entry.time ? ` · ${entry.time}` : ''}`
        )
      );

      const line = document.createElement('span');
      line.className = 'trace-line';

      const box = document.createElement('span');
      box.className = 'trace-box';
      box.setAttribute('aria-hidden', 'true');
      for (const segment of entry.box) {
        const glyph = document.createElement('span');
        if (segment === 'empty') {
          glyph.textContent = ' ';
        } else {
          glyph.style.color = segment.color;
          glyph.textContent = BoxLayouts[segment.boxLayout][segment.box];
        }
        box.append(glyph);
      }
      if (entry.box.length > 0) {
        box.append(document.createTextNode(' '));
      }

      const message = document.createElement('span');
      message.className = 'trace-message';
      message.textContent = entry.message;

      line.append(box, message);
      item.append(metadata, line);

      return item;
    })
  );
  emptyOutput.hidden = records.length > 0;
}

function setStatus(message: string): void {
  status.textContent = message;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Demo element "${id}" was not found.`);
  }

  return element as T;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
