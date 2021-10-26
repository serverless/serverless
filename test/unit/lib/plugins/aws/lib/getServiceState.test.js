'use strict';

const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const Serverless = require('../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../lib/plugins/aws/provider');
const getServiceState = require('../../../../../../lib/plugins/aws/lib/getServiceState');

const expect = chai.expect;
chai.use(require('sinon-chai'));

describe('#getServiceState()', () => {
  let serverless;
  let readFileSyncStub;
  const options = {};
  const awsPlugin = {};

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.serviceDir = 'my-service';
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
    options.package = 'some-package-path';

    awsPlugin.getServiceState();
    expect(readFileSyncStub).to.be.calledWithExactly(stateFilePath);
  });
});
