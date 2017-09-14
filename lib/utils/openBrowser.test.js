'use strict';

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('#openBrowser', () => {
  let openBrowser;
  let opnStub;
  let isDockerStub;

  beforeEach(() => {
    opnStub = sinon.stub().resolves({});
    opnStub = sinon.stub().resolves({});
    isDockerStub = sinon.stub().returns(false);

    openBrowser = proxyquire('./openBrowser', {
      opn: opnStub,
      'is-docker': isDockerStub,
    });
  });

  it('should open the browser with the provided url', () => {
    openBrowser('http://www.example.com');
    expect(opnStub.getCall(0).args[0]).to.equal('http://www.example.com');
  });

  it('should open the browser with the provided url', () => {
    isDockerStub = sinon.stub().returns(true);
    openBrowser = proxyquire('./openBrowser', {
      opn: opnStub,
      'is-docker': isDockerStub,
    });
    openBrowser('http://www.example.com');
    expect(opnStub.notCalled).to.equal(true);
  });
});
