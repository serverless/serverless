'use strict';

const expect = require('chai').expect;

const resolveErrorLocation = require('../../../../../lib/utils/telemetry/resolve-error-location');
const tokenizeException = require('../../../../../lib/utils/tokenize-exception');

describe('test/unit/lib/utils/resolve-error-location.test.js', () => {
  it('should be null when stack missing', () => {
    const err = new Error('test');
    delete err.stack;
    const result = resolveErrorLocation(tokenizeException(err));
    expect(result).to.equal('<not accessible due to non-error exception>');
  });

  it('should be null for error with code and one-line stacktrace', () => {
    const err = new Error('test');
    err.code = 'ERR_CODE';
    err.stack = 'Oneline stacktrace';
    const result = resolveErrorLocation(tokenizeException(err));
    expect(result).to.equal('<not available>');
  });

  it('should be null if no matching lines found', () => {
    const err = new Error('test');
    err.stack = 'no matching\nlines in\nstacktrace';
    const result = resolveErrorLocation(tokenizeException(err));
    expect(result).to.equal('<not reflected in stack>');
  });

  if (process.platform !== 'win32') {
    it('should correctly handle paths not enclosed in parentheses', () => {
      const err = new Error('test');
      err.stack =
        'Error: spawn E2BIG\n' +
        '    at ChildProcess.spawn (node:internal/child_process:403:11)\n' +
        '    at Object.spawn (node:child_process:573:9)\n' +
        '    at /home/xxx/api/node_modules/bestzip/lib/bestzip.js:75:29\n' +
        '    at /home/xxx/api/node_modules/async/dist/async.js:1802:20\n';

      const result = resolveErrorLocation(tokenizeException(err));
      expect(result).to.equal(
        [
          'node:internal/child_process:403:11',
          'node:child_process:573:9',
          '/bestzip/lib/bestzip.js:75:29',
          '/async/dist/async.js:1802:20',
        ].join('\n')
      );
    });

    it('should return at most 5 lines', () => {
      const err = new Error('test');
      err.stack =
        'Error:\n' +
        '    at Context.it (/home/xxx/serverless/test/unit/lib/utils/resolve-error-location.test.js:10:17)\n' +
        '    at callFn (/home/xxx/serverless/node_modules/mocha/lib/runnable.js:366:21)\n' +
        '    at Test.Runnable.run (/home/xxx/serverless/node_modules/mocha/lib/runnable.js:354:5)\n' +
        '    at Runner.runTest (/home/xxx/serverless/node_modules/mocha/lib/runner.js:677:10)\n' +
        '    at next (/home/xxx/serverless/node_modules/mocha/lib/runner.js:801:12)\n' +
        '    at next (/home/xxx/serverless/node_modules/mocha/lib/runner.js:594:14)\n';
      const result = resolveErrorLocation(tokenizeException(err));
      expect(result).to.equal(
        [
          '/test/unit/lib/utils/resolve-error-location.test.js:10:17',
          '/node_modules/mocha/lib/runnable.js:366:21',
          '/node_modules/mocha/lib/runnable.js:354:5',
          '/node_modules/mocha/lib/runner.js:677:10',
          '/node_modules/mocha/lib/runner.js:801:12',
        ].join('\n')
      );
    });
  }

  if (process.platform === 'win32') {
    it('should correctly handle paths not enclosed in parentheses', () => {
      const err = new Error('test');
      err.stack =
        'Error: spawn E2BIG\n' +
        '    at ChildProcess.spawn (node:internal/child_process:403:11)\n' +
        '    at Object.spawn (node:child_process:573:9)\n' +
        '    at C:\\home\\xxx\\api\\node_modules\\bestzip\\lib\\bestzip.js:75:29\n' +
        '    at C:\\home\\xxx\\api\\node_modules\\async\\dist\\async.js:1802:20\n';

      const result = resolveErrorLocation(tokenizeException(err));
      expect(result).to.equal(
        [
          'node:internal/child_process:403:11',
          'node:child_process:573:9',
          '/bestzip/lib/bestzip.js:75:29',
          '/async/dist/async.js:1802:20',
        ].join('\n')
      );
    });

    it('should return at most 5 lines and use `/` path separator', () => {
      const err = new Error('test');
      err.stack =
        'Error:\n' +
        '    at Context.it (C:\\home\\xxx\\serverless\\test\\unit\\lib\\utils\\resolve-error-location.test.js:10:17)\n' +
        '    at callFn (C:\\home\\xxx\\serverless\\node_modules\\mocha\\lib\\runnable.js:366:21)\n' +
        '    at Test.Runnable.run (C:\\home\\xxx\\serverless\\node_modules\\mocha\\lib\\runnable.js:354:5)\n' +
        '    at Runner.runTest (C:\\home\\xxx\\serverless\\node_modules\\mocha\\lib\\runner.js:677:10)\n' +
        '    at next (C:\\home\\xxx\\serverless\\node_modules\\mocha\\lib\\runner.js:801:12)\n' +
        '    at next (C:\\home\\xxx\\serverless\\node_modules\\mocha\\lib\\runner.js:594:14)\n';
      const result = resolveErrorLocation(tokenizeException(err));
      expect(result).to.equal(
        [
          '/test/unit/lib/utils/resolve-error-location.test.js:10:17',
          '/node_modules/mocha/lib/runnable.js:366:21',
          '/node_modules/mocha/lib/runnable.js:354:5',
          '/node_modules/mocha/lib/runner.js:677:10',
          '/node_modules/mocha/lib/runner.js:801:12',
        ].join('\n')
      );
    });
  }
});
