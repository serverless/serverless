'use strict';

const expect = require('chai').expect;
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const { logWarning } = require('../../../../lib/classes/Error');

describe('#logWarning()', () => {
  it('should log warning and proceed', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => logWarning('a message')
    );

    expect(stdoutData).to.have.string('Serverless Warning');
    expect(stdoutData).to.have.string('a message');
  });
});
