# Performance impact

## The Environment
|          |                                |
| -------- | ------------------------------ |
| CPU      | Ryzen 5 3600 - 6Cores @3593MHz |
| RAM      | 2 x 8GB DDR4 @2666MHz          |
| Terminal | Windows PowerShell 7           |

## The Setup
The test setup consists of a function that receives a count `X` and a depth `Y`:
- loop `Y` times and call `Loxer.open()`
- loop `Y` times and call `Loxer.add()` and `Loxer.error()`
- loop `Y` times and call `Loxer.close()`
- repeat this until every log was called `X` times.

The test function though runs 3 loops with `Y` calls resulting in `4 * Y` deeply nested logs. 
This means that `Y` represents the depth of the nested logs and `X` how many every type of log is called. The remaining logs will be filled with a neither deep nesting.
###### Example:
- `X = 5` and `Y = 2` will produce
```console
╭← open log
│╭← open log
├┆─ append to log   [1ms]
├┆─ Error: append an error to log
│├─ append to log   [1ms]
│├─ Error: append an error to log
│╰→ close log   [2ms]
╰→ close log   [3ms]
╭← open log
│╭← open log
├┆─ append to log   [0ms]
├┆─ Error: append an error to log
│├─ append to log   [1ms]
│├─ Error: append an error to log
│╰→ close log   [1ms]
╰→ close log   [1ms]
╭← open log
├─ append to log   [1ms]
├─ Error: append an error to log
╰→ close log   [1ms]
```


## The tests
The tests consist of calling the function X times and measuring the time that is required for it. Each test is carried out 10 times and then averaged over time.

The depth `Y` is set to `60` in every test, in order to represent a natural but maximum value. Nesting logs deeper than 60 (and this is much) will lead to have an unreadable output - and probably an not performant application anyways. 

### Test 1 - Loxer disabled
This scenario is true when Loxer gets the `options.config.disabled` or `options.config.disabledInProductionMode` option with `true`. Then all all functions are switched off and all logging methods are returned directly.

- Test runs with 25.000.000 logs with nested depth of 60
- Total number of logs: 100.000.000 (100 million!)

| run     | time       | Logs per second  |
| ------- | ---------- | ---------------- |
| 1       | 730 ms     | ~136.986.301     |
| 2       | 686 ms     | ~145.772.595     |
| 3       | 639 ms     | ~156.494.523     |
| 4       | 645 ms     | ~155.038.760     |
| 5       | 638 ms     | ~156.739.812     |
| 6       | 647 ms     | ~154.559.505     |
| 7       | 643 ms     | ~155.520.995     |
| 8       | 672 ms     | ~148.809.524     |
| 9       | 662 ms     | ~151.057.402     |
| 10      | 641 ms     | ~156.006.240     |
| **avg** | **660 ms** | **~151.698.566** |

- 1 log (function call) consumes 0.0000066 ms
- ~151.698.566 logs consume 1 second

As you can see, when Loxer is disabled, it has almost no influence on the performance. Only around 150 million log calls have a performance loss of 1 second.


### Test 2 - Logs not leveled
This scenario applies to logs that are not logged because their level sits past what their module logs up to - here `'debug'` boxes against `'info'` modules.

- Test runs with 25.000 logs with nested depth of 60
- Total number of logs: 100.000

| run     | time       | Logs per second |
| ------- | ---------- | --------------- |
| 1       | 829 ms     | ~120.627        |
| 2       | 828 ms     | ~120.773        |
| 3       | 816 ms     | ~122.549        |
| 4       | 816 ms     | ~122.549        |
| 5       | 868 ms     | ~115.207        |
| 6       | 832 ms     | ~120.192        |
| 7       | 832 ms     | ~120.192        |
| 8       | 829 ms     | ~120.627        |
| 9       | 828 ms     | ~120.773        |
| 10      | 893 ms     | ~111.982        |
| **avg** | **837 ms** | **~119.547**    |

- 1 log consumes 0.0084 ms
- ~119.547 logs consume 1 second

As you can see, even the out-leveled logs have almost no influence on the performance. Only around 120 thousand log calls have a performance loss of 1 second.

### Test 3 - Custom output stream
This scenario applies to those logs that are actually forwarded to the output stream. It should be noted that the performance measurement ONLY applies to the generation of the output. But not on further processing, which of course can be extremely different and is added to this measurement.

- Test runs with 25.000 logs with nested depth of 60
- Total number of logs: 100.000

| run     | time         | Logs per second |
| ------- | ------------ | --------------- |
| 1       | 1.080 ms     | ~92.593         |
| 2       | 1.087 ms     | ~91.996         |
| 3       | 1.068 ms     | ~93.633         |
| 4       | 1.064 ms     | ~93.985         |
| 5       | 1.100 ms     | ~90.909         |
| 6       | 1.078 ms     | ~92.764         |
| 7       | 1.077 ms     | ~92.851         |
| 8       | 1.055 ms     | ~94.787         |
| 9       | 1.102 ms     | ~90.744         |
| 10      | 1.066 ms     | ~93.809         |
| **avg** | **1.078 ms** | **~92.807**     |

- 1 log consumes 0.011 ms
- ~92.807 logs consume 1 second

The processing of the logs takes some effort. It is a little more demanding than not preparing logs for the output. But around every 90 thousand logs 1 second loss of performance should be more than acceptable in most cases.

### Test 4 - Console output (default dev output)
This scenario applies above all to the default output stream in the development environment. The output is printed in the console after processing (see last test).

- Test runs with 1.000 logs with nested depth of 60
- Total number of logs: 4.000

| run     | time         | Logs per second |
| ------- | ------------ | --------------- |
| 1       | 1.228 ms     | ~3.257          |
| 2       | 1.159 ms     | ~3.451          |
| 3       | 1.095 ms     | ~3.653          |
| 4       | 1.086 ms     | ~3.683          |
| 5       | 1.032 ms     | ~3.876          |
| 6       | 1.048 ms     | ~3.817          |
| 7       | 1.045 ms     | ~3.828          |
| 8       | 1.060 ms     | ~3.774          |
| 9       | 1.064 ms     | ~3.759          |
| 10      | 1.050 ms     | ~3.810          |
| **avg** | **1.087 ms** | **~3.691**      |

- 1 log consumes 0.27 ms
- ~3.691 logs consume 1 second

Given these numbers, it becomes clear how resource hungry the preparation of the message and printing to the console is. Even if you just lose 1 second of performance at around 3.691 logs, only around 5% of the performance can be attributed to Loxer's calculations and the remaining 95% to the console and message preparation! In this case it is only understandable not to want to use any console outputs in the production environment.

But luckily you don't need to print and prepare all the logs in prod environment. The error callbacks receive a history of all logs with a predefined size, which can be utilized like the standard output, only when an error occurs. So you basically live with the 90-120K logs per second in production environment. 

> **Reminder**: All the test results relate to my used desktop system and may vary heavily depending on the device and its processing power. The purpose of this test is to show that Loxer can cause virtually no loss of performance if it is used correctly. Especially when compared to using the console output, it becomes clear how small its influence is.