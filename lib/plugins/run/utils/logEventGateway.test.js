'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('logEventGateway', () => {
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
        msg: 'Function registered.',
        functionId: 's1-f1',
        type: 'http',
      })
    );
    expect(logStub.calledOnce).to.be.equal(true);
    const expected = '\u001b[38;5;173m Event Gateway  |  \u001b[39mRegistered function s1-f1\n';
    expect(logStub.getCall(0).args[0]).to.be.equal(expected);
  });
});
