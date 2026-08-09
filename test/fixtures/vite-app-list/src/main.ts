import { trace } from 'loxer/trace';

function fixtureFirst(): number {
  return 42;
}

function fixtureSecond(): number {
  return 43;
}

trace.info([fixtureFirst, fixtureSecond]);

document.body.textContent = String(fixtureFirst() + fixtureSecond());
