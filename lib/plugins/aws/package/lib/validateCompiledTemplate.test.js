'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#validateCompiledTemplate()', () => {
  let serverless;
  let awsPackage;
  let getCompiledTemplateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    serverless.config.servicePath = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: 'compiled content',
      },
    };
    getCompiledTemplateFileNameStub = sinon
      .stub(awsPackage.provider.naming, 'getCompiledTemplateFileName')
      .returns('compiled.json');
    writeFileSyncStub = sinon
      .stub(awsPackage.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    awsPackage.provider.naming.getCompiledTemplateFileName.restore();
    awsPackage.serverless.utils.writeFileSync.restore();
  });

  it('should validate a correct CloudFormation template', () => {
  });

  it('should throw an error on an incorrect CloudFormation template', () => {
  });
});
