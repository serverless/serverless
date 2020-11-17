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

  // In regular startup, the package option is processed from the CLI in the
  // Serverless init / plugin loading. Here in the tests, we don't call that
  // code path and we're setting up the Serverless object before we know what
  // the individual test wants the directory to be.
  const setPackageOption = targetPath => {
    options.package = targetPath;
    awsPlugin.options.package = targetPath;
    serverless.processedInput = serverless.processedInput || {};
    serverless.processedInput.options = serverless.processedInput.options || {};
    serverless.processedInput.options.package = targetPath;
  };

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
    const stateFilePath = path.resolve('my-service', '.serverless', 'serverless-state.json');
    awsPlugin.getServiceState();

    expect(readFileSyncStub).to.be.calledWithExactly(stateFilePath);
  });

  it('should use the argument-based state file path if the "package" option is used ', () => {
    const stateFilePath = path.resolve('my-service', 'some-package-path', 'serverless-state.json');
    setPackageOption('my-service/some-package-path');

    awsPlugin.getServiceState();
    expect(readFileSyncStub).to.be.calledWithExactly(stateFilePath);
  });
});
