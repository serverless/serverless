'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveCompiledTemplate()', () => {
  let serverless;
  let pkg;
  let getCompiledTemplateFileNameStub;
  let writeFileSyncStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    pkg = new AwsPackage(serverless, {});
    serverless.config.servicePath = 'my-service';
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: 'compiled content',
      },
    };
    getCompiledTemplateFileNameStub = sinon
      .stub(pkg.provider.naming, 'getCompiledTemplateFileName')
      .returns('compiled.json');
    writeFileSyncStub = sinon
      .stub(pkg.serverless.utils, 'writeFileSync').returns();
  });

  afterEach(() => {
    pkg.provider.naming.getCompiledTemplateFileName.restore();
    pkg.serverless.utils.writeFileSync.restore();
  });

  it('should write the compiled template to disk', () => {
    const filePath = path.join(
      pkg.serverless.config.servicePath,
      '.serverless',
      'compiled.json'
    );

    return pkg.saveCompiledTemplate().then(() => {
      expect(getCompiledTemplateFileNameStub.calledOnce).to.equal(true);
      expect(writeFileSyncStub.calledWithExactly(filePath, 'compiled content')).to.equal(true);
    });
  });
});
