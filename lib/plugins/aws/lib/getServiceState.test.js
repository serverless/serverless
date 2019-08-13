'use strict';

const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const Serverless = require('../../../Serverless');
const AwsProvider = require('../provider/awsProvider');
const getServiceState = require('./getServiceState');

const expect = chai.expect;
chai.use(require('sinon-chai'));

describe('#getServiceState()', () => {
  let serverless;
  let readFileSyncStub;
  const options = {};
  const awsPlugin = {};

  beforeEach(() => {
    serverless = new Serverless();
    serverless.config.servicePath = 'my-service';
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, options);
    awsPlugin.options = options;
    Object.assign(awsPlugin, getServiceState);

    readFileSyncStub = sinon.stub(awsPlugin.serverless.utils, 'readFileSync').returns();
  });

  afterEach(() => {
    awsPlugin.serverless.utils.readFileSync.restore();
  });

  it('should use the default state file path if the "package" option is not used', () => {
    const stateFilePath = path.join('my-service', '.serverless', 'serverless-state.json');
    awsPlugin.getServiceState();

    expect(readFileSyncStub).to.be.calledWithExactly(stateFilePath);
  });

  it('should use the argument-based state file path if the "package" option is used ', () => {
    const stateFilePath = path.join('my-service', 'some-package-path', 'serverless-state.json');
    options.package = 'some-package-path';

    awsPlugin.getServiceState();
    expect(readFileSyncStub).to.be.calledWithExactly(stateFilePath);
  });
});
