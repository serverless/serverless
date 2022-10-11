'use strict';

const chai = require('chai');
const sinon = require('sinon');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const proxyquire = require('proxyquire');
const inquirer = require('@serverless/utils/inquirer');

const { expect } = chai;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('test/unit/commands/login.test.js', () => {
  let loginConsoleStub;
  let loginDashboardStub;
  let login;
  before(() => {
    loginConsoleStub = sinon.stub().callsFake(async () => {});
    loginDashboardStub = sinon.stub().callsFake(async () => {});
    login = proxyquire('../../../commands/login', {
      '../lib/commands/login/console': loginConsoleStub,
      '../lib/commands/login/dashboard': loginDashboardStub,
    });
  });

  afterEach(() => sinon.resetHistory());

  it('Should auto choose console with "--console" flag', async () => {
    await login({ options: { console: true } });
    expect(loginConsoleStub.calledOnce).to.be.true;
    expect(loginDashboardStub.notCalled).to.be.true;
  });

  it('Should auto choose dashboard with "--dashboard" flag', async () => {
    await login({ options: { dashboard: true } });
    expect(loginDashboardStub.calledOnce).to.be.true;
    expect(loginConsoleStub.notCalled).to.be.true;
  });

  it('Should auto choose dashboard in dashboard enabled service', async () => {
    await login({ configuration: { org: 'foo', app: 'foo' }, options: {} });
    expect(loginDashboardStub.calledOnce).to.be.true;
    expect(loginConsoleStub.notCalled).to.be.true;
  });

  it('Should prompt user in non service context', async () => {
    configureInquirerStub(inquirer, {
      list: { identityName: 'console' },
    });
    const { history } = await login({ options: {} });
    expect(loginConsoleStub.calledOnce).to.be.true;
    expect(loginDashboardStub.notCalled).to.be.true;
    expect(Array.from(history.valuesMap())).to.deep.equal([['identityName', 'console']]);
  });
});
