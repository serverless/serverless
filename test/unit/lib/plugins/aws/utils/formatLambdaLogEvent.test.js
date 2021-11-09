'use strict';

const expect = require('chai').expect;
const dayjs = require('dayjs');
const { style } = require('@serverless/utils/log');
const formatLambdaLogEvent = require('../../../../../../lib/plugins/aws/utils/formatLambdaLogEvent');

describe('#formatLambdaLogEvent()', () => {
  it('should format invocation report', () => {
    const msg =
      'REPORT RequestId: 99c30000-b01a-11e5-93f7-b8e85631a00e\tDuration: 0.40 ms\tBilled Duration: 100 ms\tMemory Size: 512 MB\tMax Memory Used: 30 MB';
    const expectedMsg = style.aside(
      'END Duration: 0.40 ms\tBilled Duration: 100 ms\tMemory Size: 512 MB\tMax Memory Used: 30 MB'
    );

    expect(formatLambdaLogEvent(msg)).to.deep.equal(expectedMsg);
  });

  it('should format invocation failures', () => {
    const msg = 'Process exited before completing request';
    expect(formatLambdaLogEvent(msg)).to.deep.equal(style.error(msg));
  });

  it('should format lambda console.log lines', () => {
    const nodeLogLine = '2016-01-01T12:00:00Z\t99c30000-b01a-11e5-93f7-b8e85631a00e\tINFO\ttest';

    let expectedLogMessage = '';
    const date = dayjs('2016-01-01T12:00:00Z').format('YYYY-MM-DD HH:mm:ss.SSS');
    expectedLogMessage += `${style.aside(date)}\t`;
    expectedLogMessage += 'INFO\t';
    expectedLogMessage += 'test';

    expect(formatLambdaLogEvent(nodeLogLine)).to.equal(expectedLogMessage);
  });

  it('should format lambda python logger lines', () => {
    const pythonLoggerLine =
      '[INFO]\t2016-01-01T12:00:00Z\t99c30000-b01a-11e5-93f7-b8e85631a00e\ttest';

    let expectedLogMessage = '';
    const date = dayjs('2016-01-01T12:00:00Z').format('YYYY-MM-DD HH:mm:ss.SSS');
    expectedLogMessage += `${style.aside(date)}\t`;
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
