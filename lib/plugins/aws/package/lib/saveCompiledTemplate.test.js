'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const testUtils = require('../../../../../tests/utils');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('#saveCompiledTemplate()', () => {
  let serverless;
  let awsPackage;
  let serverlessDirPath;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    serverless.service = {
      provider: {
        compiledCloudFormationTemplate: {
          foo: 'bar',
        },
      },
    };
    const tmpDirPath = testUtils.getTmpDirPath();
    serverlessDirPath = path.join(tmpDirPath, '.serverless');
    fse.mkdirsSync(serverlessDirPath);
    awsPackage.serverless.config.servicePath = tmpDirPath;
  });

  it('should write the compiled templates to disk', () => awsPackage
    .saveCompiledTemplate().then(() => {
      const compiledTemplateFileName = awsPackage.provider.naming.getCompiledTemplateFileName();
      const alternativeTemplateFileName = 'compiled-cloudformation-template.json';
      const file1Content = fse
        .readJsonSync(path.join(serverlessDirPath, compiledTemplateFileName));
      const file2Content = fse
        .readJsonSync(path.join(serverlessDirPath, alternativeTemplateFileName));
      const expectedContent = awsPackage.serverless.service.provider.compiledCloudFormationTemplate;

      expect(file1Content).to.deep.equal(expectedContent);
      expect(file2Content).to.deep.equal(expectedContent);
    })
  );
});
