'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const saveCompiledTemplate = require('./saveCompiledTemplate');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveCompiledTemplate()', () => {
  let serverless;
  let awsProvider;
  let getCompiledTemplateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    serverless = new Serverless();
    awsProvider = new AwsProvider(serverless);
    serverless.setProvider('aws', awsProvider);
    serverless.config.servicePath = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: 'compiled content',
      },
    };
    saveCompiledTemplate.serverless = serverless;
    saveCompiledTemplate.provider = awsProvider;
    getCompiledTemplateFileNameStub = sinon
      .stub(saveCompiledTemplate.provider.naming, 'getCompiledTemplateFileName')
      .returns('compiled.json');
    writeFileSyncStub = sinon
      .stub(saveCompiledTemplate.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    saveCompiledTemplate.provider.naming.getCompiledTemplateFileName.restore();
    saveCompiledTemplate.serverless.utils.writeFileSync.restore();
  });

  it('should write the compiled template to disk', () => {
    const filePath = path.join(
      saveCompiledTemplate.serverless.config.servicePath,
      '.serverless',
      'compiled.json'
    );

    return saveCompiledTemplate.saveCompiledTemplate().then(() => {
      expect(getCompiledTemplateFileNameStub.calledOnce).to.equal(true);
      expect(writeFileSyncStub.calledWithExactly(filePath, 'compiled content')).to.equal(true);
    });
  });
});
