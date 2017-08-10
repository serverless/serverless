'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const chalk = require('chalk');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe.only('logEventGateway', () => {
  let logStub;
  let logEventGateway;

  beforeEach(() => {
    logStub = sinon.stub();
    logEventGateway = proxyquire('./logEventGateway', {
      './log': logStub,
    });
  });

  it('format and log function added', () => {
    logEventGateway(
      JSON.stringify({
        level: 'DEBUG',
        msg: 'Function local cache received value update.',
        value: JSON.stringify({ functionId: 's1-f1', type: 'http' }),
      })
    );
    expect(logStub.calledOnce).to.be.equal(true);
    const expected = chalk.blue(' Event Gateway  |  Registered function s1-f1\n');
    expect(logStub.getCall(0).args[0]).to.be.equal(expected);
  });
});
