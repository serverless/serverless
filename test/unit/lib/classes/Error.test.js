'use strict';

const expect = require('chai').expect;
const sandbox = require('sinon');
const logWarning = require('../../../../lib/classes/Error').logWarning;

describe('#logWarning()', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = sandbox.spy(console, 'log');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should log warning and proceed', () => {
    logWarning('a message');

    const message = consoleLogSpy.args.join('\n');

    expect(consoleLogSpy.called).to.equal(true);
    expect(message).to.have.string('Serverless Warning');
    expect(message).to.have.string('a message');
  });
});
