import { Loxer, resetLoxer } from '../dist/index.js';

let logResult = '';

logResult += '### Test 1 - Loxer disabled\n';
console.log('test1...');
run(test1, 25000000, 60, 10);
logResult += '### Test 2 - Logs not leveled\n';
console.log('test2...');
run(test2, 25000, 60, 10);
logResult += '### Test 3 - Custom output stream\n';
console.log('test3...');
run(test3, 25000, 60, 10);
logResult += '### Test 4 - Console output (default dev output)\n';
console.log('test4...');
run(test4, 1000, 60, 10);
console.log(logResult);

function run(fn, logs, depth, count = 1) {
  logResult += `- Test runs with ${format(
    logs
  )} logs with nested depth of ${depth}\n- Total number of logs: ${format(logs * 4)}\n\n`;
  logResult += '|run\t|time\t\t|Logs per second\t|\n|---\t|---\t\t|---\t\t\t|\n';
  let time = 0;
  let lps = 0;
  for (let i = 0; i < count; i++) {
    console.log('... run ' + (i + 1));
    const t = fn(logs, depth);
    resetLoxer();
    time += t[0];
    lps += t[1];
    logResult += `|${i + 1}\t|${format(t[0])} ms\t|~${format(t[1])}\t|\n`;
  }
  logResult += `|**avg**\t|**${format(time / count)} ms**\t|**~${format(lps / count)}**\t|\n\n`;
  logResult += `- 1 log consumes ${(time / count / (logs * 4)).toPrecision(2)} ms\n`;
  logResult += `- ~${format(lps / count)} logs consume 1 second\n\n`;
}

// logging when loxer disabled:
function test1(logs, depth) {
  Loxer.init({ config: { disabled: true } });
  return boxes(logs, depth);
}

// logging when logs don't fulfill level
function test2(logs, depth) {
  Loxer.init({
    dev: false,
    defaultLevels: {
      prodLevel: 1,
      devLevel: 1,
    },
    config: {
      historyCacheSize: 0,
    },
  });
  return boxes(logs, depth);
}

// logging when logs go to output stream
function test3(logs, depth) {
  Loxer.init({
    dev: false,
    defaultLevels: {
      prodLevel: 3,
      devLevel: 3,
    },
    config: {
      historyCacheSize: 0,
    },
  });
  return boxes(logs, depth);
}

// logging with console output (skipped though output is heavy)
function test4(logs, depth) {
  Loxer.init({
    dev: true,
    defaultLevels: {
      prodLevel: 3,
      devLevel: 3,
    },
    config: {
      historyCacheSize: 0,
    },
  });
  return boxes(logs, depth);
}

function boxes(count, depth = count) {
  const startTime = new Date().getTime();
  let offset = 0;
  while (offset + depth < count) {
    for (let start = offset + 1; start <= offset + depth; start++) {
      Loxer.l(3).open('open log');
    }
    for (let middle = offset + 1; middle <= offset + depth; middle++) {
      Loxer.of(middle).add('append to log');
      Loxer.of(middle).error('append an error to log1');
    }
    for (let end = offset + depth; end > offset; end--) {
      Loxer.of(end).close('close log');
    }
    offset += depth;
  }
  for (let start = offset + 1; start <= count; start++) {
    Loxer.l(3).open('open log');
  }
  for (let middle = offset + 1; middle <= count; middle++) {
    Loxer.of(middle).add('append to log');
    Loxer.of(middle).error('append an error to log2');
  }
  for (let end = count; end > offset; end--) {
    Loxer.of(end).close('close log');
  }
  const time = new Date().getTime() - startTime;
  const lps = ((count * 4) / time) * 1000;
  return [time, lps];
}

function format(n) {
  let a = Math.round(n).toString();
  let result = '';
  while (a.length > 3) {
    result = '.' + a.slice(-3) + result;
    a = a.slice(0, -3);
  }
  return a + result;
}
