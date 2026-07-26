import { trace } from 'loxer/trace';

function fixtureValue(): number {
  return 42;
}

trace(fixtureValue);

document.body.textContent = String(fixtureValue());
