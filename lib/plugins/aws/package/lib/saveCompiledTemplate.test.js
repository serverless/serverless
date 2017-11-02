'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveCompiledTemplate()', () => {
  let serverless;
  let awsPackage;
  let getCompiledTemplateFileNameStub;
  let writeFileSyncStub;
  let filePath;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    serverless.config.servicePath = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: {
          Resources: {},
        },
      },
    };
    filePath = path.join(
      awsPackage.serverless.config.servicePath,
      '.serverless',
      'compiled.json'
    );
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

  it('should write the compiled template to disk', () => {
    return awsPackage.saveCompiledTemplate().then(() => {
      expect(getCompiledTemplateFileNameStub.calledOnce).to.equal(true);
      const expectedInput = {
        Resources: {},
      };
      expect(writeFileSyncStub.calledWithExactly(filePath, expectedInput)).to.equal(true);
    });
  });

  it('should remove the custom IAM policy, if empty', () => {
    serverless.service.provider.compiledCloudFormationTemplate.Resources
      .IamRoleLambdaExecutionPolicy = {
        Properties: {
          PolicyDocument: {
            Statement: [],
          }
        }
      };
    return awsPackage.saveCompiledTemplate().then(() => {
      expect(getCompiledTemplateFileNameStub.calledOnce).to.equal(true);
      const expectedInput = {
        Resources: {},
      };
      expect(writeFileSyncStub.calledWithExactly(filePath, expectedInput)).to.equal(true);
    });
  });
});
