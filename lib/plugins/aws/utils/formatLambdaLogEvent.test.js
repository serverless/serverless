'use strict';

const expect = require('chai').expect;
const moment = require('moment');
const chalk = require('chalk');
const os = require('os');
const formatLambdaLogEvent = require('./formatLambdaLogEvent');

describe('#formatLambdaLogEvent()', () => {
  it('should format invocation report', () => {
    const msg = 'REPORT\tRequestId: 99c30000-b01a-11e5-93f7-b8e85631a00e\tDuration: 0.40 ms\tBilled Duration: 100 ms\tMemory Size: 512 MB\tMax Memory Used: 30 MB'; // eslint-disable-line

    expect(formatLambdaLogEvent(msg)).to.equal(chalk.grey(msg + os.EOL));
  });

  it('should format invocation failures', () => {
    const msg = 'Process exited before completing request';
    expect(formatLambdaLogEvent(msg)).to.equal(chalk.red(msg));
  });

  it('should format lambda console.log lines', () => {
    const nodeLogLine = '2016-01-01T12:00:00Z\t99c30000-b01a-11e5-93f7-b8e85631a00e\ttest';

    let expectedLogMessage = '';
    const momentDate = moment('2016-01-01T12:00:00Z').format('YYYY-MM-DD HH:mm:ss.SSS (Z)');
    expectedLogMessage += `${chalk.green(momentDate)}\t`;
    expectedLogMessage += `${chalk.yellow('99c30000-b01a-11e5-93f7-b8e85631a00e')}\t`;
    expectedLogMessage += 'test';

    expect(formatLambdaLogEvent(nodeLogLine)).to.equal(expectedLogMessage);
  });

  it('should format lambda python logger lines', () => {
    const pythonLoggerLine = '[INFO]\t2016-01-01T12:00:00Z\t99c30000-b01a-11e5-93f7-b8e85631a00e\ttest'; // eslint-disable-line

    let expectedLogMessage = '';
    const momentDate = moment('2016-01-01T12:00:00Z').format('YYYY-MM-DD HH:mm:ss.SSS (Z)');
    expectedLogMessage += `${chalk.green(momentDate)}\t`;
    expectedLogMessage += `${chalk.yellow('99c30000-b01a-11e5-93f7-b8e85631a00e')}\t`;
    expectedLogMessage += `${'[INFO]'}\t`;
    expectedLogMessage += 'test';

    expect(formatLambdaLogEvent(pythonLoggerLine)).to.equal(expectedLogMessage);
  });

  it('should pass through log lines with no tabs', () => {
    expect(formatLambdaLogEvent('test')).to.equal('test');
  });

  it('should pass through log lines with tabs but no date', () => {
    const tabLine = 'foo\tbar\tbaz';

    expect(formatLambdaLogEvent(tabLine)).to.equal(tabLine);
  });
});
